import { build } from 'esbuild';
await build({
  entryPoints: {
    main: 'electron/main.ts',
    preload: 'electron/preload.ts',
    'scan-worker': 'electron/services/scan-worker.ts',
  },
  outdir: 'dist-electron',
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  external: ['electron', 'sharp'],
  define: { __FILEPILOT_BUNDLED__: 'true' },
});
