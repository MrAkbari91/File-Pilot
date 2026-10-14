import { parentPort, workerData } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { opendir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FileEntry, ScanSummary } from '../../shared/contracts';
import { abortIfNeeded, safePath, extensionFor, categoryFor, messageOf } from './paths';
import { SCAN_BATCH_SIZE, type ScanWorkerInput, type ScanWorkerMessage } from './scan-protocol';

const input = workerData as ScanWorkerInput;
const port = parentPort!;
const flag = new Int32Array(input.cancellation);
const signal = {
  get aborted() {
    return Atomics.load(flag, 0) !== 0;
  },
};
const send = (message: ScanWorkerMessage) => port.postMessage(message);
const summary: ScanSummary = { files: 0, folders: 0, skipped: 0, errors: [], cancelled: false };
let sql: DatabaseSync | undefined;
let batch: FileEntry[] = [];
let lastProgress = 0;
const report = (force = false) => {
  if (!force && Date.now() - lastProgress < 100) return;
  lastProgress = Date.now();
  send({
    type: 'progress',
    progress: {
      kind: 'scan',
      completed: summary.files,
      message: `Preparing ${summary.files} files · ${summary.folders} folders`,
    },
  });
};
function warn(filename: string, error: unknown) {
  summary.skipped++;
  if (summary.errors.length < 100) summary.errors.push(`${filename}: ${messageOf(error)}`);
}

async function run() {
  try {
    abortIfNeeded(signal);
    sql = new DatabaseSync(input.filename);
    sql.exec(
      'PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA temp_store=FILE; PRAGMA cache_size=-4096;',
    );
    // Connection-local staging is discarded on cancellation, worker failure or process exit.
    // The live index remains readable throughout traversal, without retaining all rows in JS.
    sql.exec(`CREATE TEMP TABLE staged_files AS SELECT * FROM files WHERE 0;
      CREATE TEMP TABLE staged_empty(path TEXT NOT NULL);`);
    const insert = sql.prepare(
      'INSERT INTO staged_files(id,rootId,path,comparisonPath,name,extension,category,size,modified,ino,dev) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
    );
    const empty = sql.prepare('INSERT INTO staged_empty VALUES(?)');
    const flush = () => {
      if (!batch.length) return;
      abortIfNeeded(signal);
      sql!.exec('BEGIN');
      try {
        for (const f of batch)
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
        sql!.exec('COMMIT');
      } catch (error) {
        sql!.exec('ROLLBACK');
        throw error;
      }
      batch = [];
      report(summary.files === SCAN_BATCH_SIZE);
    };
    const walk = async (folder: string, depth: number): Promise<void> => {
      abortIfNeeded(signal);
      // Async directory iteration bounds memory even for very wide folders. Depth bounds handles.
      let directory;
      try {
        await safePath(input.root.path, folder);
        directory = await opendir(folder, { bufferSize: 64 });
      } catch (error) {
        if (folder === input.root.path) throw error;
        warn(folder, error);
        return;
      }
      summary.folders++;
      let entries = 0;
      try {
        for await (const entry of directory) {
          abortIfNeeded(signal);
          entries++;
          const filename = path.join(folder, entry.name);
          const relative = path.relative(input.root.path, filename).split(path.sep).join('/');
          if (
            input.settings.exclusions.some(
              (exclude) =>
                entry.name === exclude ||
                relative === exclude ||
                relative.startsWith(`${exclude}/`),
            )
          ) {
            summary.skipped++;
            report();
            continue;
          }
          let info;
          try {
            info = await lstat(filename);
          } catch (error) {
            warn(filename, error);
            continue;
          }
          if (info.isSymbolicLink()) {
            summary.skipped++;
            continue;
          }
          if (info.isDirectory()) {
            if (input.recursive && depth < input.settings.maxDepth) await walk(filename, depth + 1);
            else summary.skipped++;
          } else if (info.isFile()) {
            const extension = extensionFor(entry.name);
            batch.push({
              id: randomUUID(),
              rootId: input.root.id,
              path: filename,
              name: entry.name,
              extension,
              category: categoryFor(extension),
              size: info.size,
              modified: info.mtimeMs,
              ino: String(info.ino),
              dev: String(info.dev),
            });
            summary.files++;
            if (batch.length >= SCAN_BATCH_SIZE) flush();
          } else summary.skipped++;
          report();
        }
      } catch (error) {
        // Enumeration, staging and cancellation failures must never publish a partial snapshot.
        throw new Error(`${folder}: ${messageOf(error)}`);
      }
      if (entries === 0) empty.run(folder);
    };
    await walk(input.root.path, 0);
    flush();
    abortIfNeeded(signal);
    send({
      type: 'progress',
      progress: { kind: 'scan', completed: summary.files, message: 'Saving completed index…' },
    });
    sql.exec('BEGIN IMMEDIATE');
    try {
      // Other connections see either the complete old snapshot or the complete new one.
      const root = sql.prepare('SELECT path FROM indexed_roots WHERE id=?').get(input.root.id);
      if (root?.path !== input.root.path)
        throw new Error('Selected folder changed during scanning.');
      sql.prepare('DELETE FROM files WHERE rootId=?').run(input.root.id);
      abortIfNeeded(signal);
      sql.exec('INSERT INTO files SELECT * FROM staged_files');
      sql
        .prepare('UPDATE indexed_roots SET scannedAt=? WHERE id=?')
        .run(new Date().toISOString(), input.root.id);
      sql
        .prepare(
          'INSERT OR REPLACE INTO application_settings(key,value) SELECT ?, json_group_array(path) FROM staged_empty',
        )
        .run(`empty:${input.root.id}`);
      sql
        .prepare('INSERT OR REPLACE INTO application_settings VALUES(?,?)')
        .run('lastScan', JSON.stringify(summary));
      sql.exec('DELETE FROM duplicate_groups');
      sql
        .prepare('UPDATE scan_jobs SET status=?,summary=? WHERE id=?')
        .run('completed', JSON.stringify(summary), input.jobId);
      abortIfNeeded(signal);
      sql.exec('COMMIT');
    } catch (error) {
      sql.exec('ROLLBACK');
      throw error;
    }
    send({ type: 'result', summary });
  } catch (error) {
    if (signal.aborted) {
      summary.cancelled = true;
      send({ type: 'result', summary });
    } else send({ type: 'failure', message: messageOf(error), summary });
  } finally {
    sql?.close();
    port.close();
  }
}
void run();
