import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { readFile, writeFile, lstat } from 'node:fs/promises';
import { dialog, shell, type BrowserWindow } from 'electron';
import type {
  Method,
  Progress,
  Snapshot,
  StorageSummary,
  Rule,
  Operation,
} from '../../shared/contracts';
import { requestSchemas, settingsSchema, ruleSchema } from '../../shared/contracts';
import { Database } from './database';
import { FileScannerService } from './scanner';
import { FileOrganizerService } from './organizer';
import { DuplicateDetectionService, thumbnail } from './duplicates';
import { interpret } from './assistant';
import { abortIfNeeded, AppError, canonicalDirectory, inside, messageOf, safePath } from './paths';
import { assertUnchanged, hashFile } from './hash';

export class Application {
  readonly scanner: FileScannerService;
  readonly organizer: FileOrganizerService;
  readonly duplicates: DuplicateDetectionService;
  private active: AbortController | null = null;
  private timer: ReturnType<typeof setInterval>;
  private thumbs = new Map<string, string>();
  constructor(
    readonly db: Database,
    private window: () => BrowserWindow | null,
    private progress: (p: Progress) => void,
  ) {
    this.scanner = new FileScannerService(db);
    this.organizer = new FileOrganizerService(db);
    this.duplicates = new DuplicateDetectionService(db);
    this.timer = setInterval(() => {
      void this.tick();
    }, 60_000);
    this.timer.unref();
  }
  async job<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.active)
      throw new AppError('BUSY', 'A job is already running. Wait or cancel it first.');
    this.active = new AbortController();
    try {
      return await fn(this.active.signal);
    } finally {
      this.active = null;
    }
  }
  async confirm(title: string, detail: string): Promise<void> {
    const window = this.window();
    if (!window) throw new AppError('WINDOW', 'Open FilePilot to approve this operation.');
    const response = await dialog.showMessageBox(window, {
      type: 'warning',
      title,
      message: title,
      detail,
      buttons: ['Cancel', 'Confirm'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (response.response !== 1) throw new AppError('CANCELLED', 'No changes made.');
  }
  snapshot(): Snapshot {
    const totals = this.db.sql
      .prepare('SELECT COUNT(*) AS count, COALESCE(SUM(size),0) AS size FROM files')
      .get()!;
    const groups = this.db.groups();
    return {
      roots: this.db.roots(),
      selectedRootId: this.db.get('selectedRootId', ''),
      settings: this.db.settings(),
      fileCount: Number(totals.count),
      totalSize: Number(totals.size),
      duplicateGroups: groups.length,
      duplicateBytes: groups.reduce((s, g) => s + g.reclaimable, 0),
      history: this.db.history().slice(0, 6),
      rules: this.db.rules(),
      lastScan: this.db.get('lastScan', null),
    };
  }
  storage(): StorageSummary {
    const folders = new Map<string, { path: string; size: number; count: number }>();
    for (const file of this.db.files()) {
      const folder = path.dirname(file.path);
      const row = folders.get(folder) ?? { path: folder, size: 0, count: 0 };
      row.size += file.size;
      row.count++;
      folders.set(folder, row);
    }
    return {
      categories: this.db.sql
        .prepare(
          'SELECT category, SUM(size) AS size, COUNT(*) AS count FROM files GROUP BY category ORDER BY size DESC',
        )
        .all() as unknown as StorageSummary['categories'],
      largest: this.db.search({ sort: 'size' }).files.slice(0, 20),
      folders: [...folders.values()].sort((a, b) => b.size - a.size).slice(0, 20),
      emptyFolders: this.db
        .roots()
        .flatMap((root) => this.db.get<string[]>(`empty:${root.id}`, [])),
    };
  }
  async runRule(id: string) {
    const rule = this.db.rules().find((r) => r.id === id);
    if (!rule) throw new AppError('RULE', 'Rule not found.');
    const root = this.db.root(rule.rootId);
    const plan = await this.organizer.preview({
      rootId: rule.rootId,
      destination: root.path,
      strategy: rule.strategy,
      recursive: true,
      conflict: 'skip',
      extension: rule.extension,
    });
    this.db.saveRule({ ...rule, lastRun: new Date().toISOString() });
    this.db.sql
      .prepare('INSERT INTO automation_runs VALUES(?,?,?,?,?)')
      .run(
        randomUUID(),
        id,
        new Date().toISOString(),
        'preview',
        `${plan.items.filter((i) => i.status === 'ready').length} proposed moves; approval required`,
      );
    return plan;
  }
  private async tick() {
    if (this.active || this.db.settings().automationPaused) return;
    for (const rule of this.db.rules().filter((r) => r.enabled && r.trigger === 'interval')) {
      if (rule.lastRun && Date.now() - Date.parse(rule.lastRun) < rule.intervalMinutes * 60_000)
        continue;
      try {
        await this.job(async (signal) => {
          await this.scanner.scan(rule.rootId, true, signal, this.progress);
          abortIfNeeded(signal);
          const plan = await this.runRule(rule.id);
          this.progress({
            kind: 'automation',
            completed: plan.items.length,
            message: `“${rule.name}” preview ready. Open Automation to review.`,
          });
        });
      } catch (error) {
        this.db.sql
          .prepare('INSERT INTO automation_runs VALUES(?,?,?,?,?)')
          .run(randomUUID(), rule.id, new Date().toISOString(), 'failed', messageOf(error));
        this.db.saveRule({ ...rule, lastRun: new Date().toISOString() });
      }
    }
  }
  async handle(method: Method, raw: unknown): Promise<unknown> {
    // Every method is parsed again at this boundary. Never trust renderer objects or plan contents.
    if (
      this.active &&
      [
        'removeRoot',
        'settings',
        'resetIndex',
        'clearHistory',
        'importSettings',
        'saveRule',
        'deleteRule',
      ].includes(method)
    )
      throw new AppError('BUSY', 'Wait for the current job before changing application state.');
    switch (method) {
      case 'snapshot':
        return this.snapshot();
      case 'chooseRoots': {
        const { single } = requestSchemas.chooseRoots.parse(raw);
        return this.job(async (signal) => {
          const choice = await dialog.showOpenDialog({
            title: 'Choose a folder to work with',
            properties: single ? ['openDirectory'] : ['openDirectory', 'multiSelections'],
          });
          if (choice.canceled) return [];
          const folders = await Promise.all(choice.filePaths.map(canonicalDirectory));
          // Validate the complete selection before adding any roots.
          const approved = this.db.roots().map((root) => root.path);
          for (const folder of folders) {
            if (folder === path.parse(folder).root)
              throw new AppError('ROOT', 'Select a specific folder instead of an entire disk.');
            if (
              approved.some(
                (existing) =>
                  existing !== folder && (inside(existing, folder) || inside(folder, existing)),
              )
            )
              throw new AppError(
                'OVERLAP',
                'This folder overlaps a saved folder. Choose that saved folder or remove it in Settings first.',
              );
            if (!approved.includes(folder)) approved.push(folder);
          }
          const roots = [];
          for (const folder of [...new Set(folders)]) {
            abortIfNeeded(signal);
            const root = this.db.addRoot(folder);
            // Reuse persisted metadata when choosing a known folder. Feature actions refresh it as needed.
            if (!root.scannedAt) await this.scanner.scan(root.id, true, signal, this.progress);
            abortIfNeeded(signal);
            roots.push(this.db.root(root.id));
          }
          if (roots[0]) this.db.set('selectedRootId', roots[0].id);
          return roots;
        });
      }
      case 'selectRoot': {
        const { rootId } = requestSchemas.selectRoot.parse(raw);
        if (rootId) this.db.root(rootId);
        this.db.set('selectedRootId', rootId);
        return;
      }
      case 'chooseDestination': {
        const choice = await dialog.showOpenDialog({
          title: 'Choose an organization destination',
          properties: ['openDirectory', 'createDirectory'],
        });
        if (choice.canceled || !choice.filePaths[0]) return null;
        const destination = await canonicalDirectory(choice.filePaths[0]);
        this.organizer.destinations.add(destination);
        return destination;
      }
      case 'removeRoot': {
        const { rootId } = requestSchemas.removeRoot.parse(raw);
        this.db.transaction(() => {
          this.db.sql.prepare('DELETE FROM indexed_roots WHERE id=?').run(rootId);
          if (this.db.get('selectedRootId', '') === rootId) this.db.set('selectedRootId', '');
          this.db.clearDuplicates();
          for (const rule of this.db.rules().filter((r) => r.rootId === rootId))
            this.db.sql.prepare('DELETE FROM automation_rules WHERE id=?').run(rule.id);
        });
        this.organizer.plans.clear();
        return;
      }
      case 'scan': {
        const data = requestSchemas.scan.parse(raw);
        return this.job((signal) =>
          this.scanner.scan(data.rootId, data.recursive, signal, this.progress),
        );
      }
      case 'cancel':
        this.active?.abort();
        return;
      case 'search':
        return this.db.search(requestSchemas.search.parse(raw));
      case 'storage':
        return this.storage();
      case 'preview': {
        const input = requestSchemas.preview.parse(raw);
        return this.job(async (signal) => {
          await this.scanner.scan(input.rootId, true, signal, this.progress);
          abortIfNeeded(signal);
          return this.organizer.preview(input);
        });
      }
      case 'execute': {
        const { planId } = requestSchemas.execute.parse(raw);
        return this.job(async (signal) => {
          const plan = this.organizer.plans.get(planId);
          if (!plan) throw new AppError('PLAN', 'Preview again before applying changes.');
          const count = plan.items.filter((i) => i.status === 'ready').length;
          await this.confirm(
            `Move ${count} files?`,
            `Destination: ${plan.destination}\nExisting files will not be overwritten. Cancellation stops between files. Review the plan before confirming.`,
          );
          return this.organizer.execute(planId, signal, this.progress);
        });
      }
      case 'duplicates': {
        const d = requestSchemas.duplicates.parse(raw);
        return this.job(async (signal) => {
          const roots = d.rootId ? [this.db.root(d.rootId)] : this.db.roots();
          for (const root of roots) {
            await this.scanner.scan(root.id, true, signal, this.progress);
            abortIfNeeded(signal);
          }
          return this.duplicates.detect(d.mode, d.rootId, d.threshold, signal, this.progress);
        });
      }
      case 'trash': {
        const { groupId, fileIds } = requestSchemas.trash.parse(raw);
        return this.job(async (signal) => {
          const group = this.db.groups().find((g) => g.id === groupId);
          if (!group || group.kind !== 'exact')
            throw new AppError(
              'SAFETY',
              'Trash is available only for reverified exact-content groups.',
            );
          const selected = group.files.filter((f) => fileIds.includes(f.id));
          const keepers = group.files.filter((f) => !fileIds.includes(f.id));
          if (!keepers.length || selected.length !== new Set(fileIds).size)
            throw new AppError('SAFETY', 'Keep at least one valid copy in this group.');
          await this.confirm(
            `Move ${selected.length} files to Trash?`,
            'Keep at least one copy. Files in application, system, or synced folders may be in use. Trash restoration is managed by your operating system; FilePilot cannot undo it.',
          );
          let completed = 0;
          let failed = 0;
          for (const file of selected) {
            if (signal.aborted) break;
            const operation: Operation = {
              id: randomUUID(),
              time: new Date().toISOString(),
              type: 'trash',
              source: file.path,
              destination: 'Operating system Trash',
              status: 'pending',
              error: null,
              hash: null,
              undone: 0,
              parentId: null,
            };
            this.db.record(operation);
            try {
              const keeper = keepers[0]!;
              await safePath(this.db.root(keeper.rootId).path, keeper.path);
              await assertUnchanged(keeper);
              await safePath(this.db.root(file.rootId).path, file.path);
              await assertUnchanged(file);
              if ((await hashFile(keeper.path, signal)) !== (await hashFile(file.path, signal)))
                throw new AppError(
                  'CHANGED',
                  'The selected file no longer matches the retained copy.',
                );
              await assertUnchanged(keeper);
              await assertUnchanged(file);
              await shell.trashItem(file.path); // No permanent-deletion fallback.
              this.db.finish(operation.id, 'completed');
              this.db.sql.prepare('DELETE FROM files WHERE id=?').run(file.id);
              completed++;
            } catch (error) {
              this.db.finish(operation.id, 'failed', messageOf(error));
              failed++;
            }
          }
          this.db.clearDuplicates();
          return { completed, failed };
        });
      }
      case 'undo': {
        const { operationId } = requestSchemas.undo.parse(raw);
        return this.job(async (signal) => {
          await this.confirm(
            'Undo this move?',
            'The original path must be available and the moved file must be unchanged.',
          );
          await this.organizer.undo(operationId, signal);
        });
      }
      case 'history':
        return this.db.history(requestSchemas.history.parse(raw).query);
      case 'openFile': {
        const data = requestSchemas.openFile.parse(raw);
        const file = this.db.file(data.fileId);
        await safePath(this.db.root(file.rootId).path, file.path);
        await assertUnchanged(file);
        if (data.reveal) shell.showItemInFolder(file.path);
        else {
          // Never launch scripts, executables, shortcuts, HTML or unknown file associations.
          const allowed = [
            'jpg',
            'jpeg',
            'png',
            'webp',
            'gif',
            'pdf',
            'txt',
            'mp4',
            'mp3',
            'wav',
            'csv',
          ];
          if (!allowed.includes(file.extension))
            throw new AppError('TYPE', 'Use “Show in folder” to open this file type yourself.');
          await this.confirm('Open this file in its default app?', file.path);
          const error = await shell.openPath(file.path);
          if (error) throw new Error(error);
        }
        return;
      }
      case 'thumbnail': {
        const file = this.db.file(requestSchemas.thumbnail.parse(raw).fileId);
        if (file.category !== 'Images') return null;
        await safePath(this.db.root(file.rootId).path, file.path);
        await assertUnchanged(file);
        const key = `${file.path}:${file.modified}`;
        if (this.thumbs.has(key)) return this.thumbs.get(key);
        try {
          const data = await thumbnail(file.path);
          if (this.thumbs.size >= 100) this.thumbs.delete(this.thumbs.keys().next().value!);
          this.thumbs.set(key, data);
          return data;
        } catch {
          return null;
        }
      }
      case 'settings': {
        const settings = settingsSchema.parse(raw);
        this.db.set('settings', settings);
        return settings;
      }
      case 'assistant':
        return interpret(requestSchemas.assistant.parse(raw).text);
      case 'saveRule': {
        const rule: Rule = ruleSchema.parse(raw);
        this.db.root(rule.rootId);
        const prior = this.db.rules().find((r) => r.id === rule.id);
        this.db.saveRule({ ...rule, lastRun: prior?.lastRun ?? null });
        return rule;
      }
      case 'deleteRule':
        this.db.sql
          .prepare('DELETE FROM automation_rules WHERE id=?')
          .run(requestSchemas.deleteRule.parse(raw).id);
        return;
      case 'runRule':
        return this.job(async (signal) => {
          const { id } = requestSchemas.runRule.parse(raw);
          const rule = this.db.rules().find((rule) => rule.id === id);
          if (!rule) throw new AppError('RULE', 'Rule not found.');
          await this.scanner.scan(rule.rootId, true, signal, this.progress);
          abortIfNeeded(signal);
          return this.runRule(id);
        });
      case 'resetIndex': {
        await this.confirm(
          'Reset the local file index?',
          'Only FilePilot’s indexed metadata and duplicate results will be removed. Your files and operation history are preserved.',
        );
        this.db.transaction(() => {
          this.db.sql.exec(
            'DELETE FROM files; DELETE FROM duplicate_groups; UPDATE indexed_roots SET scannedAt=NULL; DELETE FROM scan_jobs;',
          );
          this.db.set('lastScan', null);
          for (const root of this.db.roots()) this.db.set(`empty:${root.id}`, []);
        });
        this.organizer.plans.clear();
        this.thumbs.clear();
        return;
      }
      case 'clearHistory':
        await this.confirm(
          'Clear operation history?',
          'You will lose FilePilot’s undo records. This does not change your files.',
        );
        this.db.sql.exec('DELETE FROM operation_history');
        return;
      case 'exportData': {
        const { kind } = requestSchemas.exportData.parse(raw);
        const choice = await dialog.showSaveDialog({
          title: `Export ${kind}`,
          defaultPath: `filepilot-${kind}.json`,
          filters: [{ name: 'JSON', extensions: ['json'] }],
        });
        if (choice.canceled || !choice.filePath) return false;
        const data =
          kind === 'history'
            ? this.db.sql.prepare('SELECT * FROM operation_history ORDER BY time DESC').all()
            : kind === 'duplicates'
              ? this.db.groups()
              : this.db.settings();
        await writeFile(choice.filePath, JSON.stringify(data, null, 2), { flag: 'wx' });
        return true;
      }
      case 'importSettings': {
        const choice = await dialog.showOpenDialog({
          properties: ['openFile'],
          filters: [{ name: 'JSON settings', extensions: ['json'] }],
        });
        if (choice.canceled || !choice.filePaths[0]) return null;
        if ((await lstat(choice.filePaths[0])).size > 64 * 1024)
          throw new AppError('SIZE', 'Settings files must be smaller than 64 KB.');
        const settings = settingsSchema.parse(
          JSON.parse(await readFile(choice.filePaths[0], 'utf8')),
        );
        this.db.set('settings', settings);
        return settings;
      }
    }
  }
  get busy(): boolean {
    return this.active !== null;
  }
  close(): void {
    clearInterval(this.timer);
    this.db.close();
  }
}
