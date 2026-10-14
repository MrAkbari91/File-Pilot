import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
// Both entry points are built before measurement; no personal folders are accepted as input.
await mkdir('.local', { recursive: true });
await build({
  entryPoints: ['electron/services/scan-worker.ts'],
  outfile: 'dist-electron/scan-worker.cjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
});
await build({
  entryPoints: ['scripts/benchmark-scan.ts'],
  outfile: '.local/benchmark-scan.cjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
});
await import('../.local/benchmark-scan.cjs');
