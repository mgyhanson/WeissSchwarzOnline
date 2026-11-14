import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { type Plugin, defineConfig } from 'vite';
import { createUserArt, parseUserArtMode } from '../backend/src/user-art';

const here = fileURLToPath(new URL('.', import.meta.url));
/** The card pictures (card-assets/local.nosync, not in Git); USER_ART and USER_ART_DIR as for the game server. */
const art = createUserArt(resolve(here, process.env.USER_ART_DIR ?? '../card-assets/local.nosync'), parseUserArtMode(process.env.USER_ART));

/** Serves the card pictures under /user-art/ on the dev and preview servers, with the same rules as the game server. */
function userArt(): Plugin {
  const handle = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!art.handle(req, res)) next();
  };
  return {
    name: 'wso-user-art',
    configureServer: (server) => void server.middlewares.use(handle),
    configurePreviewServer: (server) => void server.middlewares.use(handle),
  };
}

// The project lives in iCloud Drive. Vite's cache and the build output go to
// folders iCloud does not sync: the root node_modules (a symlink to
// node_modules.nosync) and dist.nosync.
export default defineConfig({
  plugins: [react(), userArt()],
  cacheDir: '../node_modules/.vite-web-client',
  // Online play: the game server (npm run server:dev, port 8787) answers /ws.
  server: { port: 5173, strictPort: true, proxy: { '/ws': { target: 'ws://127.0.0.1:8787', ws: true } } },
  preview: { port: 4173, strictPort: true, proxy: { '/ws': { target: 'ws://127.0.0.1:8787', ws: true } } },
  build: { outDir: 'dist.nosync', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
