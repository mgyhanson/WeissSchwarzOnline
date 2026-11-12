import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The project lives in iCloud Drive. Vite's cache and the build output go to
// folders iCloud does not sync: the root node_modules (a symlink to
// node_modules.nosync) and dist.nosync.
export default defineConfig({
  plugins: [react()],
  cacheDir: '../node_modules/.vite-web-client',
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: { outDir: 'dist.nosync', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
