import { cpSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const root = path.dirname(fileURLToPath(import.meta.url));

function copyApi(): Plugin {
  return {
    name: 'copy-api',
    apply: 'build',
    closeBundle() {
      cpSync(path.join(root, 'api'), path.join(root, 'dist', 'api'), {
        recursive: true,
        filter: (src) => {
          const base = path.basename(src);
          return base !== 'config.php' && base !== 'setup.lock';
        },
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), copyApi()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: false,
      },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: false,
      },
    },
  },
});
