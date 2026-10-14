import { build } from 'esbuild';
export default async function setup() {
  await build({
    entryPoints: ['electron/services/scan-worker.ts'],
    outfile: 'dist-electron/scan-worker.cjs',
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'cjs',
  });
}
