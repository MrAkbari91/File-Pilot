import { beforeEach, afterEach, it, expect } from 'vitest';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from '../helpers';
import { FileScannerService } from '../../electron/services/scanner';
import { SCAN_BATCH_SIZE } from '../../electron/services/scan-protocol';
import { Database } from '../../electron/services/database';

let f: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
  f = await fixture();
});
afterEach(async () => {
  await f.cleanup();
});
async function seed(count: number) {
  for (let start = 0; start < count; start += 64)
    await Promise.all(
      Array.from({ length: Math.min(64, count - start) }, (_, offset) =>
        writeFile(path.join(f.root.path, `sample-${start + offset}.txt`), 'synthetic'),
      ),
    );
}
it('stages multiple batches without exposing partial results and keeps the main event loop alive', async () => {
  await writeFile(path.join(f.root.path, 'original.txt'), 'original');
  await f.scan();
  const before = f.db.files();
  await seed(SCAN_BATCH_SIZE * 5);
  let heartbeats = 0;
  let observedStaging = false;
  const timer = setInterval(() => {
    heartbeats++;
  }, 10);
  try {
    const result = await f.scanner.scan(f.root.id, true, new AbortController().signal, (p) => {
      if (p.completed >= SCAN_BATCH_SIZE && p.message.startsWith('Preparing')) {
        observedStaging = true;
        expect(f.db.files()).toEqual(before);
      }
    });
    expect(result.files).toBe(SCAN_BATCH_SIZE * 5 + 1);
    expect(f.db.search({}).total).toBe(result.files);
    expect(observedStaging).toBe(true);
    expect(heartbeats).toBeGreaterThan(0);
    expect(
      f.db.sql.prepare("SELECT count(*) AS n FROM scan_jobs WHERE status='completed'").get()?.n,
    ).toBe(2);
  } finally {
    clearInterval(timer);
  }
});
it('cancels after staged batches and preserves the entire last snapshot and duplicate results', async () => {
  await writeFile(path.join(f.root.path, 'original.txt'), 'original');
  await mkdir(path.join(f.root.path, 'empty'));
  await f.scan();
  const before = f.db.files();
  const lastScan = f.db.get('lastScan', null);
  const root = f.db.root(f.root.id);
  const empty = f.db.get(`empty:${f.root.id}`, []);
  f.db.saveGroups([{ id: crypto.randomUUID(), kind: 'name', files: before, reclaimable: 0 }]);
  const groups = f.db.groups();
  await seed(SCAN_BATCH_SIZE * 10);
  const cancellation = new AbortController();
  const result = await f.scanner.scan(f.root.id, true, cancellation.signal, (p) => {
    if (p.completed >= SCAN_BATCH_SIZE && p.message.startsWith('Preparing')) cancellation.abort();
  });
  expect(result.cancelled).toBe(true);
  expect(f.db.files()).toEqual(before);
  expect(f.db.root(f.root.id)).toEqual(root);
  expect(f.db.get('lastScan', null)).toEqual(lastScan);
  expect(f.db.get(`empty:${f.root.id}`, [])).toEqual(empty);
  expect(f.db.groups()).toEqual(groups);
  expect(
    f.db.sql.prepare("SELECT count(*) AS n FROM scan_jobs WHERE status='cancelled'").get()?.n,
  ).toBe(1);
  // A fresh worker can immediately complete, with no stale transaction or staging rows.
  expect((await f.scan()).files).toBe(SCAN_BATCH_SIZE * 10 + 1);
  expect(f.db.groups()).toHaveLength(0);
});
it('rolls back publication on a database constraint failure instead of losing the old snapshot', async () => {
  await writeFile(path.join(f.root.path, 'original.txt'), 'original');
  await f.scan();
  const before = f.db.files();
  const lastScan = f.db.get('lastScan', null);
  const root = f.db.root(f.root.id);
  // Simulate a storage failure during the final INSERT, after the old root rows were deleted.
  f.db.sql.exec(
    "CREATE TRIGGER fail_publish BEFORE INSERT ON files BEGIN SELECT RAISE(ABORT, 'synthetic storage failure'); END;",
  );
  await expect(f.scan()).rejects.toThrow(/synthetic storage failure/);
  expect(f.db.files()).toEqual(before);
  expect(f.db.root(f.root.id)).toEqual(root);
  expect(f.db.get('lastScan', null)).toEqual(lastScan);
  f.db.sql.exec('DROP TRIGGER fail_publish');
  expect((await f.scan()).files).toBe(1);
});
it('records an unexpected worker exit and releases resources for the next scan', async () => {
  await writeFile(path.join(f.root.path, 'original.txt'), 'original');
  await f.scan();
  const before = f.db.files();
  await seed(SCAN_BATCH_SIZE * 2);
  const worker = path.join(f.base, 'exit-worker.cjs');
  await writeFile(
    worker,
    `
    const port = require('node:worker_threads').parentPort;
    const send = port.postMessage.bind(port);
    port.postMessage = message => {
      if (message.type === 'progress' && message.progress.completed >= ${SCAN_BATCH_SIZE}) process.exit(7);
      send(message);
    };
    require(${JSON.stringify(path.resolve('dist-electron/scan-worker.cjs'))});
  `,
  );
  await expect(
    new FileScannerService(f.db, worker).scan(
      f.root.id,
      true,
      new AbortController().signal,
      () => {},
    ),
  ).rejects.toThrow(/exit 7/);
  expect(f.db.files()).toEqual(before);
  expect(
    f.db.sql.prepare("SELECT count(*) AS n FROM scan_jobs WHERE status='failed'").get()?.n,
  ).toBe(1);
  expect((await f.scan()).files).toBe(SCAN_BATCH_SIZE * 2 + 1);
});
it('does not interpret a worker exit without a completion message as success', async () => {
  const worker = path.join(f.base, 'empty-worker.cjs');
  await writeFile(worker, 'process.exit(0);');
  await expect(
    new FileScannerService(f.db, worker).scan(
      f.root.id,
      true,
      new AbortController().signal,
      () => {},
    ),
  ).rejects.toThrow(/unexpectedly/);
  expect(f.db.root(f.root.id).scannedAt).toBeNull();
});
it('rejects concurrent calls and allows a cancelled scan to be retried', async () => {
  await seed(32);
  const cancellation = new AbortController();
  const pending = f.scanner.scan(f.root.id, true, cancellation.signal, () => {});
  await expect(f.scan()).rejects.toThrow(/already running/);
  cancellation.abort();
  expect((await pending).cancelled).toBe(true);
  expect((await f.scan()).files).toBe(32);
});
it('marks an unfinished scan interrupted on reopening without changing indexed files', async () => {
  await writeFile(path.join(f.root.path, 'original.txt'), 'original');
  await f.scan();
  const before = f.db.files();
  f.db.sql
    .prepare('INSERT INTO scan_jobs VALUES(?,?,?,?,NULL)')
    .run(crypto.randomUUID(), f.root.id, new Date().toISOString(), 'running');
  f.db.close();
  const reopened = new Database(f.db.filename);
  try {
    expect(reopened.files()).toEqual(before);
    expect(
      reopened.sql.prepare("SELECT count(*) AS n FROM scan_jobs WHERE status='interrupted'").get()
        ?.n,
    ).toBe(1);
    expect(
      reopened.sql
        .prepare("SELECT count(*) AS n FROM sqlite_master WHERE name LIKE 'staged_%'")
        .get()?.n,
    ).toBe(0);
  } finally {
    reopened.close();
  }
});
