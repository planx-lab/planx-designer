import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        // No rewrite: the engine now serves API under /api (Phase 2 of
        // planx-spec/unified-ui-design.md). Previously /api was stripped
        // because the engine served API at root.
      },
    },
  },
  test: {
    environment: 'jsdom',
    // Node's process-level Web Storage shadows jsdom's isolated DOM storage.
    execArgv: process.allowedNodeEnvironmentFlags.has('--no-experimental-webstorage')
      ? ['--no-experimental-webstorage']
      : [],
    exclude: ['e2e/**', 'node_modules/**'],
  },
});
