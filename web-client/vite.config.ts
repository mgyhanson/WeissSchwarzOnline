import { createReadStream, existsSync, readFileSync, readdirSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { type Plugin, defineConfig } from 'vite';
import { cardIdOfFile } from './src/images/files';

const here = fileURLToPath(new URL('.', import.meta.url));
/** Pictures the player provides; never committed, never synced by iCloud, never built (card-assets/README.md). */
const USER_ART = resolve(here, '../card-assets/local.nosync');
const PICTURE = /^[A-Za-z0-9_\-+.]+\.(png|jpe?g|webp)$/i;
const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };


function manifest(): { files: Record<string, string>; sources: Record<string, unknown> } {
  if (!existsSync(USER_ART)) return { files: {}, sources: {} };
  const files: Record<string, string> = {};
  for (const name of readdirSync(USER_ART)) if (PICTURE.test(name)) files[cardIdOfFile(name)] = name;
  let sources: Record<string, unknown> = {};
  try {
    sources = JSON.parse(readFileSync(join(USER_ART, 'sources.json'), 'utf8')) as Record<string, unknown>;
  } catch {
    // sources.json is optional.
  }
  return { files, sources };
}

/** Serves card-assets/local.nosync/ under /user-art/ on the dev and preview servers only, files unchanged. */
function userArt(): Plugin {
  const handle = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/user-art/')) return next();
    const name = decodeURIComponent(req.url.slice('/user-art/'.length).split('?')[0] ?? '');
    if (name === 'manifest.json') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(manifest()));
      return;
    }
    const file = resolve(USER_ART, name);
    if (!PICTURE.test(name) || !file.startsWith(USER_ART + sep) || !existsSync(file)) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader('Content-Type', TYPES[name.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream');
    createReadStream(file).pipe(res);
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
