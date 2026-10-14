import path from 'node:path';
import { lstat, mkdir, link, copyFile, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type {
  FileEntry,
  Operation,
  OperationPlan,
  Progress,
  Request,
} from '../../shared/contracts';
import { Database } from './database';
import {
  abortIfNeeded,
  AppError,
  categoryFor,
  extensionFor,
  inside,
  messageOf,
  safeExtension,
  safePath,
} from './paths';
import { assertUnchanged, hashFile } from './hash';

async function exists(filename: string): Promise<boolean> {
  try {
    await lstat(filename);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
export function destinationFor(
  file: FileEntry,
  base: string,
  strategy: 'category' | 'extension' | 'timeline',
): string {
  const date = new Date(file.modified);
  const folder =
    strategy === 'category'
      ? [file.category]
      : strategy === 'extension'
        ? [file.category, safeExtension(file.extension)]
        : [String(date.getFullYear()), String(date.getMonth() + 1).padStart(2, '0')];
  return path.join(base, ...folder, file.name);
}
export class FileOrganizerService {
  readonly plans = new Map<string, OperationPlan>();
  readonly destinations = new Set<string>();
  constructor(private db: Database) {}
  async preview(input: Request<'preview'>): Promise<OperationPlan> {
    const root = this.db.root(input.rootId);
    if (input.destination !== root.path && !this.destinations.has(input.destination))
      throw new AppError('PERMISSION', 'Choose the destination using the folder picker.');
    await safePath(input.destination, input.destination);
    const plan: OperationPlan = {
      id: randomUUID(),
      rootId: root.id,
      destination: input.destination,
      createdAt: new Date().toISOString(),
      items: [],
    };
    const reserved = new Set<string>();
    const comparison = (p: string) => (process.platform === 'win32' ? p.toLowerCase() : p);
    for (const file of this.db.files(root.id)) {
      if (!input.recursive && path.dirname(file.path) !== root.path) continue;
      if (input.extension && file.extension !== input.extension) continue;
      let destination = destinationFor(file, input.destination, input.strategy);
      if (comparison(file.path) === comparison(destination)) {
        plan.items.push({ file, destination, status: 'skip', reason: 'Already organized' });
        continue;
      }
      if (file.name.startsWith('.')) {
        plan.items.push({
          file,
          destination,
          status: 'skip',
          reason: 'Hidden files are left in place',
        });
        continue;
      }
      const original = destination;
      let suffix = 1;
      while (reserved.has(comparison(destination)) || (await exists(destination))) {
        if (input.conflict === 'skip') break;
        const parsed = path.parse(original);
        destination = path.join(parsed.dir, `${parsed.name} (${suffix++})${parsed.ext}`);
      }
      const conflict = reserved.has(comparison(destination)) || (await exists(destination));
      reserved.add(comparison(destination));
      plan.items.push({
        file,
        destination,
        status: conflict ? 'skip' : 'ready',
        ...(conflict ? { reason: 'Destination exists; never overwritten' } : {}),
      });
    }
    if (this.plans.size >= 10) this.plans.delete(this.plans.keys().next().value!);
    this.plans.set(plan.id, plan);
    return plan;
  }
  async execute(id: string, signal: AbortSignal, progress: (p: Progress) => void) {
    const plan = this.plans.get(id);
    if (!plan)
      throw new AppError('PLAN', 'Preview again; this plan expired or has already been applied.');
    this.plans.delete(id);
    const root = this.db.root(plan.rootId);
    const result = { completed: 0, failed: 0, skipped: 0, cancelled: false };
    for (const item of plan.items) {
      if (signal.aborted) {
        result.cancelled = true;
        break;
      }
      if (item.status === 'skip') {
        result.skipped++;
        continue;
      }
      try {
        await this.move(item.file, root.path, item.destination, plan.destination, signal);
        result.completed++;
      } catch {
        result.failed++;
      }
      progress({
        kind: 'organize',
        completed: result.completed + result.failed,
        message: `Processed ${item.file.name}`,
      });
    }
    return result;
  }
  async move(
    file: FileEntry,
    sourceRoot: string,
    destination: string,
    destinationRoot: string,
    signal: AbortSignal,
    parentId: string | null = null,
  ): Promise<void> {
    const operation: Operation = {
      id: randomUUID(),
      time: new Date().toISOString(),
      type: parentId ? 'undo' : 'move',
      source: file.path,
      destination,
      status: 'pending',
      error: null,
      hash: null,
      undone: 0,
      parentId,
    };
    this.db.record(operation);
    let published = false;
    try {
      abortIfNeeded(signal);
      await safePath(sourceRoot, file.path);
      await assertUnchanged(file);
      await safePath(destinationRoot, destination, true);
      if (await exists(destination))
        throw new AppError('CONFLICT', 'Destination exists; no file was overwritten.');
      const hash = await hashFile(file.path, signal);
      this.db.sql.prepare('UPDATE operation_history SET hash=? WHERE id=?').run(hash, operation.id);
      await mkdir(path.dirname(destination), { recursive: true });
      await safePath(destinationRoot, destination, true);
      await safePath(sourceRoot, file.path);
      await assertUnchanged(file);
      abortIfNeeded(signal);
      // Node rename() can overwrite. Exclusive hard-link publication provides no-clobber semantics
      // on a volume; verified COPYFILE_EXCL is the fallback on other volumes/filesystems.
      try {
        await link(file.path, destination);
      } catch (error) {
        if (
          !['EXDEV', 'EPERM', 'EACCES', 'ENOTSUP'].includes(
            (error as NodeJS.ErrnoException).code ?? '',
          )
        )
          throw error;
        await copyFile(file.path, destination, constants.COPYFILE_EXCL);
      }
      published = true;
      if ((await hashFile(destination)) !== hash)
        throw new AppError('VERIFY', 'Copied content failed verification. Source retained.');
      await safePath(sourceRoot, file.path);
      await safePath(destinationRoot, destination);
      await assertUnchanged(file);
      if ((await hashFile(file.path)) !== hash)
        throw new AppError('CHANGED', 'Source content changed. Source retained.');
      // Cancellation stops between files. Finish this verified publication before acknowledging it.
      await unlink(file.path);
      const movedStat = await lstat(destination);
      const indexedDestination = this.db.roots().find((root) => inside(root.path, destination));
      this.db.transaction(() => {
        this.db.finish(operation.id, 'completed');
        this.db.sql.prepare('DELETE FROM files WHERE path=?').run(file.path);
        if (indexedDestination)
          this.db.sql
            .prepare(
              'INSERT INTO files(id,rootId,path,comparisonPath,name,extension,category,size,modified,ino,dev) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
            )
            .run(
              randomUUID(),
              indexedDestination.id,
              destination,
              process.platform === 'win32' ? destination.toLowerCase() : destination,
              path.basename(destination),
              file.extension,
              file.category,
              movedStat.size,
              movedStat.mtimeMs,
              String(movedStat.ino),
              String(movedStat.dev),
            );
        this.db.clearDuplicates();
        if (parentId)
          this.db.sql.prepare('UPDATE operation_history SET undone=1 WHERE id=?').run(parentId);
      });
    } catch (error) {
      this.db.finish(
        operation.id,
        'failed',
        `${messageOf(error)}${published ? ' A destination copy may exist; inspect both paths. Nothing is automatically cleaned up.' : ''}`,
      );
      throw error;
    }
  }
  async undo(id: string, signal: AbortSignal): Promise<void> {
    const operation = this.db.operation(id);
    if (
      operation.type !== 'move' ||
      operation.status !== 'completed' ||
      operation.undone ||
      !operation.hash
    )
      throw new AppError('UNDO', 'This operation cannot be undone.');
    const root = this.db.roots().find((r) => inside(r.path, operation.source));
    if (!root)
      throw new AppError('PERMISSION', 'The original root must remain in the index to undo.');
    // The completed journal authorizes this exact destination, including after a restart.
    let destinationRoot = path.dirname(operation.destination);
    while (!(await exists(destinationRoot))) destinationRoot = path.dirname(destinationRoot);
    await safePath(destinationRoot, operation.destination);
    if ((await hashFile(operation.destination, signal)) !== operation.hash)
      throw new AppError('CHANGED', 'The moved file changed. Undo stopped.');
    const stat = await lstat(operation.destination);
    const extension = extensionFor(operation.destination);
    const file: FileEntry = {
      id: randomUUID(),
      rootId: root.id,
      path: operation.destination,
      name: path.basename(operation.destination),
      extension,
      category: categoryFor(extension),
      size: stat.size,
      modified: stat.mtimeMs,
      ino: String(stat.ino),
      dev: String(stat.dev),
    };
    await this.move(file, destinationRoot, operation.source, root.path, signal, id);
  }
}
