import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: process.env.WAYPOINT_SITE_BASE || '/minecraft-companion/',
  server: { host: '127.0.0.1', port: 4370, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
});
