import { mkdtemp, mkdir, realpath, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { Database } from '../electron/services/database';
import { FileScannerService } from '../electron/services/scanner';
import { SCAN_BATCH_SIZE } from '../electron/services/scan-protocol';

async function benchmark() {
  const count = Number(process.argv[2] ?? '10000');
  if (!Number.isSafeInteger(count) || count < 100 || count > 1000000)
    throw new Error('Pass a synthetic file count between 100 and 1000000.');
  const parent = await realpath(os.tmpdir());
  const base = await mkdtemp(path.join(parent, 'filepilot-benchmark-'));
  let db: Database | undefined;
  let sampler: ReturnType<typeof setInterval> | undefined;
  const latency = monitorEventLoopDelay({ resolution: 10 });
  try {
    const folder = path.join(base, 'synthetic');
    await mkdir(folder);
    console.log(`Creating ${count} synthetic files; fixture creation is excluded from timing.`);
    for (let start = 0; start < count; start += 64)
      await Promise.all(
        Array.from({ length: Math.min(64, count - start) }, (_, i) =>
          writeFile(path.join(folder, `sample-${start + i}.txt`), 'synthetic benchmark data'),
        ),
      );
    db = new Database(path.join(base, 'metadata.sqlite'));
    const root = db.addRoot(folder);
    let peakRss = process.memoryUsage().rss;
    let peakMainHeap = process.memoryUsage().heapUsed;
    let heartbeats = 0;
    let messages = 0;
    latency.enable();
    sampler = setInterval(() => {
      heartbeats++;
      const memory = process.memoryUsage();
      peakRss = Math.max(peakRss, memory.rss);
      peakMainHeap = Math.max(peakMainHeap, memory.heapUsed);
    }, 20);
    const start = performance.now();
    const summary = await new FileScannerService(db).scan(
      root.id,
      true,
      new AbortController().signal,
      () => {
        messages++;
      },
    );
    const durationMs = performance.now() - start;
    clearInterval(sampler);
    latency.disable();
    if (summary.files !== count || db.search({}).total !== count)
      throw new Error('Benchmark count mismatch.');
    const report = {
      timestamp: new Date().toISOString(),
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      files: count,
      batchSize: SCAN_BATCH_SIZE,
      durationMs: Math.round(durationMs),
      filesPerSecond: Math.round((count * 1000) / durationMs),
      mainEventLoopP99Ms: Number((latency.percentile(99) / 1e6).toFixed(2)),
      mainEventLoopMaxMs: Number((latency.max / 1e6).toFixed(2)),
      processPeakRssMiB: Number((peakRss / 1048576).toFixed(2)),
      mainPeakHeapMiB: Number((peakMainHeap / 1048576).toFixed(2)),
      heartbeats,
      progressMessages: messages,
      note: 'Single synthetic run, not a hardware-independent performance guarantee. RSS includes workers; heap is the main thread only. Sampled peaks may miss short spikes.',
    };
    await writeFile('.local/scan-benchmark.json', JSON.stringify(report, null, 2));
    await writeFile(`.local/scan-benchmark-${count}.json`, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (sampler) clearInterval(sampler);
    latency.disable();
    db?.close();
    if (path.dirname(base) !== parent || !path.basename(base).startsWith('filepilot-benchmark-'))
      throw new Error('Unsafe benchmark cleanup');
    await rm(base, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
void benchmark().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
