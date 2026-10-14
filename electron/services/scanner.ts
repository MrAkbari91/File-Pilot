import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Progress, ScanSummary } from '../../shared/contracts';
import { Database } from './database';
import { messageOf } from './paths';
import type { ScanWorkerInput, ScanWorkerMessage } from './scan-protocol';

declare const __FILEPILOT_BUNDLED__: boolean;
const defaultWorker =
  typeof __FILEPILOT_BUNDLED__ !== 'undefined' && __FILEPILOT_BUNDLED__
    ? path.join(__dirname, 'scan-worker.cjs')
    : path.resolve('dist-electron/scan-worker.cjs');

export class FileScannerService {
  private running = false;
  constructor(
    private db: Database,
    private workerFile = defaultWorker,
  ) {}
  async scan(
    rootId: string,
    recursive: boolean,
    signal: AbortSignal,
    progress: (p: Progress) => void,
  ): Promise<ScanSummary> {
    if (this.running) throw new Error('A scan is already running.');
    if (this.db.filename === ':memory:')
      throw new Error('Worker indexing requires a file-backed metadata database.');
    const root = this.db.root(rootId);
    const jobId = randomUUID();
    const summary: ScanSummary = { files: 0, folders: 0, skipped: 0, errors: [], cancelled: false };
    this.db.sql
      .prepare('INSERT INTO scan_jobs VALUES(?,?,?,?,NULL)')
      .run(jobId, rootId, new Date().toISOString(), 'running');
    const cancellation = new SharedArrayBuffer(4);
    const flag = new Int32Array(cancellation);
    const cancel = () => {
      Atomics.store(flag, 0, 1);
    };
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    this.running = true;
    try {
      const result = signal.aborted
        ? { ...summary, cancelled: true }
        : await new Promise<ScanSummary>((resolve, reject) => {
            const input: ScanWorkerInput = {
              filename: this.db.filename,
              jobId,
              root,
              settings: this.db.settings(),
              recursive,
              cancellation,
            };
            const worker = new Worker(this.workerFile, { workerData: input });
            let terminal: ScanSummary | undefined;
            let failure: Error | undefined;
            worker.on('message', (message: ScanWorkerMessage) => {
              if (message.type === 'progress') {
                summary.files = message.progress.completed;
                try {
                  progress(message.progress);
                } catch (error) {
                  failure = new Error(messageOf(error));
                  cancel();
                }
              } else if (message.type === 'result') terminal = message.summary;
              else {
                Object.assign(summary, message.summary);
                failure = new Error(message.message);
              }
            });
            worker.on('error', (error) => {
              failure = error;
            });
            // Wait for the connection and TEMP staging tables to close before exposing completion.
            worker.on('exit', (code) => {
              if (failure) reject(failure);
              else if (code !== 0 || !terminal)
                reject(
                  new Error(
                    `Index worker stopped unexpectedly (exit ${code}). Committed index preserved.`,
                  ),
                );
              else resolve(terminal);
            });
          });
      this.db.sql
        .prepare('UPDATE scan_jobs SET status=?,summary=? WHERE id=?')
        .run(result.cancelled ? 'cancelled' : 'completed', JSON.stringify(result), jobId);
      progress({
        kind: 'scan',
        completed: result.files,
        message: result.cancelled
          ? 'Scan cancelled. Previous index preserved.'
          : `Indexed ${result.files} files`,
      });
      return result;
    } catch (error) {
      // A crash after COMMIT must not relabel an already committed snapshot as failed.
      this.db.sql
        .prepare("UPDATE scan_jobs SET status='failed',summary=? WHERE id=? AND status='running'")
        .run(JSON.stringify({ ...summary, errors: [...summary.errors, messageOf(error)] }), jobId);
      throw error;
    } finally {
      signal.removeEventListener('abort', cancel);
      this.running = false;
    }
  }
}
