/**
 * The card picture service: /user-art/manifest.json and /user-art/<file>.
 *
 * Pictures live in one folder on the server (default
 * card-assets/local.nosync, not in Git) together with image-index.json,
 * which lists for every card its file and SHA-256. The service:
 *
 *  - serves ONLY files listed in image-index.json, by their exact name: a
 *    request cannot name any other file, inside or outside the folder;
 *  - maps cards to files from the index, never by guessing file names;
 *  - gives the browser a manifest (card id → file) and the source notes of
 *    those files, nothing else from the folder;
 *  - sends an ETag (the picture's SHA-256) and lets browsers cache.
 *
 * Who is served is a setting (USER_ART):
 *   clients  every browser that can reach this server: this computer, other
 *            devices on the network (server:lan), players in online rooms
 *   local    only a browser on this computer, addressed as localhost
 *   off      nobody; the game draws its own card faces
 *
 * A picture never tells a player anything about the game: the browser asks
 * for the picture of a card id it already has from its own player view.
 * Used by the game server and by the Vite development server alike.
 */

import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join, resolve, sep } from 'node:path';

export type UserArtMode = 'clients' | 'local' | 'off';

export function parseUserArtMode(value: string | undefined, fallback: UserArtMode = 'clients'): UserArtMode {
  return value === 'clients' || value === 'local' || value === 'off' ? value : fallback;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
const FILE_NAME = /^[A-Za-z0-9_\-+.]+\.(png|jpe?g|webp)$/i;

/** A request from a browser on this computer, addressed to localhost (not relayed by a tunnel or proxy under another name). */
export function isLocalRequest(req: IncomingMessage): boolean {
  const address = req.socket.remoteAddress ?? '';
  const loopback = address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
  const host = (req.headers.host ?? '').replace(/:\d+$/, '');
  const forwarded = req.headers['x-forwarded-for'] !== undefined || req.headers['x-forwarded-host'] !== undefined || req.headers.forwarded !== undefined;
  return loopback && LOCAL_HOSTS.has(host) && !forwarded;
}

interface Listed {
  cardId: string;
  sha256: string;
  type: string;
}

interface Loaded {
  mtime: number;
  /** File name → what the index says about it. */
  files: Map<string, Listed>;
  manifest: string;
}

export interface UserArtService {
  readonly mode: UserArtMode;
  /** Number of pictures the index lists that exist. */
  count(): number;
  /** Answers a request under /user-art/; returns false for any other URL. */
  handle(req: IncomingMessage, res: ServerResponse): boolean;
}

export function createUserArt(dir: string | null, mode: UserArtMode): UserArtService {
  const root = dir ? resolve(dir) : null;
  let loaded: Loaded | null = null;

  /** The index, read again when image-index.json changes. */
  const load = (): Loaded => {
    const empty: Loaded = { mtime: -1, files: new Map(), manifest: JSON.stringify({ files: {}, sources: {} }) };
    if (!root) return empty;
    const indexFile = join(root, 'image-index.json');
    if (!existsSync(indexFile)) return empty;
    const mtime = statSync(indexFile).mtimeMs;
    if (loaded && loaded.mtime === mtime) return loaded;
    const files = new Map<string, Listed>();
    const byCard: Record<string, string> = {};
    try {
      const index = JSON.parse(readFileSync(indexFile, 'utf8')) as Record<string, { file?: unknown; sha256?: unknown }>;
      for (const [cardId, entry] of Object.entries(index)) {
        const file = entry.file;
        if (typeof file !== 'string' || !FILE_NAME.test(file) || typeof entry.sha256 !== 'string') continue;
        const type = TYPES[file.split('.').pop()!.toLowerCase()];
        if (!type || !existsSync(join(root, file))) continue;
        files.set(file, { cardId, sha256: entry.sha256, type });
        byCard[cardId] = file;
      }
    } catch {
      return empty;
    }
    // Source notes of the listed files only.
    const sources: Record<string, { source?: string; licence?: string; note?: string }> = {};
    try {
      const all = JSON.parse(readFileSync(join(root, 'sources.json'), 'utf8')) as Record<string, { source?: unknown; licence?: unknown; note?: unknown }>;
      for (const file of files.keys()) {
        const s = all[file];
        if (s) sources[file] = { ...(typeof s.source === 'string' ? { source: s.source } : {}), ...(typeof s.licence === 'string' ? { licence: s.licence } : {}), ...(typeof s.note === 'string' ? { note: s.note } : {}) };
      }
    } catch {
      // sources.json is optional.
    }
    loaded = { mtime, files, manifest: JSON.stringify({ files: byCard, sources }) };
    return loaded;
  };

  const allowed = (req: IncomingMessage): boolean => mode === 'clients' || (mode === 'local' && isLocalRequest(req));

  return {
    mode,
    count: () => load().files.size,
    handle(req, res) {
      const url = req.url ?? '';
      if (!url.startsWith('/user-art/')) return false;
      let name: string;
      try {
        name = decodeURIComponent(url.slice('/user-art/'.length).split('?')[0] ?? '');
      } catch {
        res.writeHead(400).end();
        return true;
      }
      const ok = root !== null && allowed(req);
      if (name === 'manifest.json') {
        // Not served: an empty manifest, so the game simply draws its own faces.
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(ok ? load().manifest : JSON.stringify({ files: {}, sources: {} }));
        return true;
      }
      const listed = ok ? load().files.get(name) : undefined;
      const file = listed ? join(root!, name) : '';
      // Only a file the index lists, by its exact name; it can therefore not lead outside the folder.
      if (!listed || !file.startsWith(root! + sep) || !existsSync(file)) {
        res.writeHead(404).end();
        return true;
      }
      const etag = `"${listed.sha256.slice(0, 32)}"`;
      const headers = { 'Content-Type': listed.type, 'Cache-Control': 'private, max-age=86400', ETag: etag, 'X-Content-Type-Options': 'nosniff' };
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, headers).end();
        return true;
      }
      res.writeHead(200, { ...headers, 'Content-Length': statSync(file).size });
      if (req.method === 'HEAD') res.end();
      else createReadStream(file).pipe(res);
      return true;
    },
  };
}
