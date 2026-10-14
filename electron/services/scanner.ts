import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FileEntry, Progress, ScanSummary } from '../../shared/contracts';
import { Database } from './database';
import { abortIfNeeded, categoryFor, extensionFor, messageOf, safePath } from './paths';

export class FileScannerService {
  constructor(private db: Database) {}
  async scan(
    rootId: string,
    recursive: boolean,
    signal: AbortSignal,
    progress: (p: Progress) => void,
  ): Promise<ScanSummary> {
    const root = this.db.root(rootId);
    const settings = this.db.settings();
    const files: FileEntry[] = [];
    const emptyFolders: string[] = [];
    const summary: ScanSummary = { files: 0, folders: 0, skipped: 0, errors: [], cancelled: false };
    const jobId = randomUUID();
    this.db.sql
      .prepare('INSERT INTO scan_jobs VALUES(?,?,?,?,NULL)')
      .run(jobId, rootId, new Date().toISOString(), 'running');
    const queue = [{ folder: root.path, depth: 0 }];
    try {
      while (queue.length) {
        abortIfNeeded(signal);
        const { folder, depth } = queue.pop()!;
        try {
          await safePath(root.path, folder);
          const entries = await readdir(folder, { withFileTypes: true });
          summary.folders++;
          if (entries.length === 0) emptyFolders.push(folder);
          for (const entry of entries) {
            abortIfNeeded(signal);
            const filePath = path.join(folder, entry.name);
            const relative = path.relative(root.path, filePath).split(path.sep).join('/');
            if (
              settings.exclusions.some(
                (exclude) =>
                  entry.name === exclude ||
                  relative === exclude ||
                  relative.startsWith(`${exclude}/`),
              )
            ) {
              summary.skipped++;
              continue;
            }
            try {
              const stat = await lstat(filePath);
              if (stat.isSymbolicLink()) {
                summary.skipped++;
                continue;
              }
              if (stat.isDirectory()) {
                if (recursive && depth < settings.maxDepth)
                  queue.push({ folder: filePath, depth: depth + 1 });
                else summary.skipped++;
                continue;
              }
              if (!stat.isFile()) {
                summary.skipped++;
                continue;
              }
              const extension = extensionFor(entry.name);
              files.push({
                id: randomUUID(),
                rootId,
                path: filePath,
                name: entry.name,
                extension,
                category: categoryFor(extension),
                size: stat.size,
                modified: stat.mtimeMs,
                ino: String(stat.ino),
                dev: String(stat.dev),
              });
              summary.files++;
              if (summary.files % 50 === 0)
                progress({ kind: 'scan', completed: summary.files, message: `Indexing ${folder}` });
            } catch (error) {
              summary.skipped++;
              if (summary.errors.length < 100)
                summary.errors.push(`${filePath}: ${messageOf(error)}`);
            }
          }
        } catch (error) {
          abortIfNeeded(signal);
          summary.skipped++;
          if (summary.errors.length < 100) summary.errors.push(`${folder}: ${messageOf(error)}`);
          if (folder === root.path) throw error;
        }
      }
      abortIfNeeded(signal);
      // Replace the snapshot only after a complete traversal; cancellation preserves the previous index.
      this.db.replaceFiles(rootId, files, emptyFolders, summary);
    } catch (error) {
      if (signal.aborted) summary.cancelled = true;
      else {
        this.db.sql
          .prepare('UPDATE scan_jobs SET status=?, summary=? WHERE id=?')
          .run(
            'failed',
            JSON.stringify({ ...summary, errors: [...summary.errors, messageOf(error)] }),
            jobId,
          );
        throw error;
      }
    }
    this.db.sql
      .prepare('UPDATE scan_jobs SET status=?, summary=? WHERE id=?')
      .run(summary.cancelled ? 'cancelled' : 'completed', JSON.stringify(summary), jobId);
    progress({
      kind: 'scan',
      completed: summary.files,
      message: summary.cancelled
        ? 'Scan cancelled. Previous index preserved.'
        : `Indexed ${summary.files} files`,
    });
    return summary;
  }
}
