import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ command }) => ({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'filepilot-development-csp',
      transformIndexHtml: {
        order: 'pre',
        handler: (html) =>
          command === 'serve'
            ? html.replace("script-src 'self'", "script-src 'self' 'nonce-filepilot-dev'")
            : html,
      },
    },
  ],
  html: command === 'serve' ? { cspNonce: 'filepilot-dev' } : {},
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { outDir: 'dist' },
}));
