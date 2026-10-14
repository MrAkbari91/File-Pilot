import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type {
  FileEntry,
  Root,
  Settings,
  Operation,
  DuplicateGroup,
  Rule,
  ScanSummary,
  SearchInput,
} from '../../shared/contracts';
import { settingsSchema, searchSchema, ruleSchema } from '../../shared/contracts';

export class Database {
  readonly sql: DatabaseSync;
  constructor(filename: string) {
    this.sql = new DatabaseSync(filename);
    this.sql.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);`,
    );
    const version =
      this.sql.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()?.version ?? 0;
    if (Number(version) > 1)
      throw new Error(
        'This database was created by a newer FilePilot. Install that version to continue.',
      );
    if (Number(version) === 0)
      this.transaction(() => {
        this.sql.exec(`
        CREATE TABLE indexed_roots(id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, scannedAt TEXT);
        CREATE TABLE files(id TEXT PRIMARY KEY, rootId TEXT NOT NULL REFERENCES indexed_roots(id) ON DELETE CASCADE,
          path TEXT NOT NULL UNIQUE, comparisonPath TEXT NOT NULL, name TEXT NOT NULL, extension TEXT NOT NULL,
          category TEXT NOT NULL, size INTEGER NOT NULL, modified REAL NOT NULL, ino TEXT NOT NULL, dev TEXT NOT NULL);
        CREATE INDEX files_root ON files(rootId);
        CREATE INDEX files_size ON files(size);
        CREATE INDEX files_category ON files(category, extension);
        CREATE TABLE scan_jobs(id TEXT PRIMARY KEY, rootId TEXT, startedAt TEXT NOT NULL, status TEXT NOT NULL, summary TEXT);
        CREATE TABLE duplicate_groups(id TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE automation_rules(id TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE automation_runs(id TEXT PRIMARY KEY, ruleId TEXT NOT NULL, time TEXT NOT NULL, status TEXT NOT NULL, message TEXT NOT NULL);
        CREATE TABLE operation_history(id TEXT PRIMARY KEY, time TEXT NOT NULL, type TEXT NOT NULL, source TEXT NOT NULL,
          destination TEXT NOT NULL, status TEXT NOT NULL, error TEXT, hash TEXT, undone INTEGER NOT NULL DEFAULT 0, parentId TEXT);
        CREATE TABLE application_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
        INSERT INTO schema_migrations VALUES(1, datetime('now'));
      `);
      });
    this.sql.exec(
      "UPDATE operation_history SET status='interrupted', error='Interrupted before completion. Inspect both paths before taking further action.' WHERE status='pending'; UPDATE scan_jobs SET status='interrupted' WHERE status='running';",
    );
  }
  transaction<T>(fn: () => T): T {
    this.sql.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      this.sql.exec('COMMIT');
      return value;
    } catch (error) {
      this.sql.exec('ROLLBACK');
      throw error;
    }
  }
  roots(): Root[] {
    return this.sql.prepare('SELECT * FROM indexed_roots ORDER BY path').all() as unknown as Root[];
  }
  addRoot(path: string): Root {
    this.sql
      .prepare('INSERT OR IGNORE INTO indexed_roots(id,path) VALUES(?,?)')
      .run(randomUUID(), path);
    return this.roots().find((root) => root.path === path)!;
  }
  root(id: string): Root {
    const root = this.roots().find((item) => item.id === id);
    if (!root) throw new Error('Select an indexed folder first.');
    return root;
  }
  files(rootId = ''): FileEntry[] {
    return this.sql
      .prepare(`SELECT * FROM files ${rootId ? 'WHERE rootId=?' : ''}`)
      .all(...(rootId ? [rootId] : [])) as unknown as FileEntry[];
  }
  file(id: string): FileEntry {
    const file = this.sql.prepare('SELECT * FROM files WHERE id=?').get(id);
    if (!file) throw new Error('The file is no longer in the index. Rescan its folder.');
    return file as unknown as FileEntry;
  }
  replaceFiles(
    rootId: string,
    files: FileEntry[],
    emptyFolders: string[],
    summary: ScanSummary,
  ): void {
    this.transaction(() => {
      this.sql.prepare('DELETE FROM files WHERE rootId=?').run(rootId);
      const insert = this.sql.prepare(
        'INSERT INTO files(id,rootId,path,comparisonPath,name,extension,category,size,modified,ino,dev) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      );
      for (const f of files)
        insert.run(
          f.id,
          f.rootId,
          f.path,
          process.platform === 'win32' ? f.path.toLowerCase() : f.path,
          f.name,
          f.extension,
          f.category,
          f.size,
          f.modified,
          f.ino,
          f.dev,
        );
      this.sql
        .prepare('UPDATE indexed_roots SET scannedAt=? WHERE id=?')
        .run(new Date().toISOString(), rootId);
      this.set(`empty:${rootId}`, emptyFolders);
      this.set('lastScan', summary);
      this.clearDuplicates();
    });
  }
  get<T>(key: string, fallback: T): T {
    const row = this.sql.prepare('SELECT value FROM application_settings WHERE key=?').get(key);
    return row ? (JSON.parse(String(row.value)) as T) : fallback;
  }
  set(key: string, value: unknown): void {
    this.sql
      .prepare('INSERT OR REPLACE INTO application_settings VALUES(?,?)')
      .run(key, JSON.stringify(value));
  }
  settings(): Settings {
    return settingsSchema.parse(this.get('settings', {}));
  }
  history(query = ''): Operation[] {
    return this.sql
      .prepare(
        'SELECT * FROM operation_history WHERE source LIKE ? OR destination LIKE ? ORDER BY time DESC LIMIT 500',
      )
      .all(`%${query}%`, `%${query}%`) as unknown as Operation[];
  }
  operation(id: string): Operation {
    const row = this.sql.prepare('SELECT * FROM operation_history WHERE id=?').get(id);
    if (!row) throw new Error('Operation not found.');
    return row as unknown as Operation;
  }
  record(operation: Operation): void {
    const o = operation;
    this.sql
      .prepare(
        'INSERT INTO operation_history(id,time,type,source,destination,status,error,hash,undone,parentId) VALUES(?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        o.id,
        o.time,
        o.type,
        o.source,
        o.destination,
        o.status,
        o.error,
        o.hash,
        o.undone,
        o.parentId,
      );
  }
  finish(id: string, status: Operation['status'], error: string | null = null): void {
    this.sql
      .prepare('UPDATE operation_history SET status=?,error=? WHERE id=?')
      .run(status, error, id);
  }
  groups(): DuplicateGroup[] {
    return this.sql
      .prepare('SELECT data FROM duplicate_groups')
      .all()
      .map((row) => JSON.parse(String(row.data)) as DuplicateGroup);
  }
  saveGroups(groups: DuplicateGroup[]): void {
    this.transaction(() => {
      this.clearDuplicates();
      const stmt = this.sql.prepare('INSERT INTO duplicate_groups VALUES(?,?)');
      for (const group of groups) stmt.run(group.id, JSON.stringify(group));
    });
  }
  clearDuplicates(): void {
    this.sql.exec('DELETE FROM duplicate_groups');
  }
  rules(): Rule[] {
    return this.sql
      .prepare('SELECT data FROM automation_rules')
      .all()
      .map((row) => ruleSchema.parse(JSON.parse(String(row.data))));
  }
  saveRule(rule: Rule): void {
    this.sql
      .prepare('INSERT OR REPLACE INTO automation_rules VALUES(?,?)')
      .run(rule.id, JSON.stringify(rule));
  }
  search(input: SearchInput): { files: FileEntry[]; total: number } {
    const f = searchSchema.parse(input);
    const where: string[] = ['size >= ?'];
    const values: (string | number)[] = [f.minSize];
    if (f.query) {
      where.push("(name LIKE ? ESCAPE '\\' OR path LIKE ? ESCAPE '\\')");
      const q = `%${f.query.replace(/[\\%_]/g, '\\$&')}%`;
      values.push(q, q);
    }
    for (const [column, value] of [
      ['rootId', f.rootId],
      ['category', f.category],
      ['extension', f.extension.replace(/^\./, '').toLowerCase()],
    ] as const)
      if (value) {
        where.push(`${column}=?`);
        values.push(value);
      }
    if (f.maxSize !== undefined) {
      where.push('size <= ?');
      values.push(f.maxSize);
    }
    if (f.modifiedAfter !== undefined) {
      where.push('modified >= ?');
      values.push(f.modifiedAfter);
    }
    if (f.modifiedBefore !== undefined) {
      where.push('modified < ?');
      values.push(f.modifiedBefore);
    }
    const clause = where.join(' AND ');
    const total = Number(
      this.sql.prepare(`SELECT count(*) AS count FROM files WHERE ${clause}`).get(...values)
        ?.count ?? 0,
    );
    const order = { name: 'name COLLATE NOCASE ASC', size: 'size DESC', modified: 'modified DESC' }[
      f.sort
    ];
    return {
      files: this.sql
        .prepare(`SELECT * FROM files WHERE ${clause} ORDER BY ${order}, path LIMIT 100 OFFSET ?`)
        .all(...values, f.page * 100) as unknown as FileEntry[],
      total,
    };
  }
  close(): void {
    this.sql.close();
  }
}
