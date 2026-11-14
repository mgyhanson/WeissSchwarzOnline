/**
 * The HTTP and WebSocket server.
 *
 *  - /ws: the game connection (protocol in shared/protocol.ts). Only
 *    browsers on the same host name as the server, or on localhost, may
 *    connect (a check against other web pages opening a connection).
 *  - /health: "ok", for checks.
 *  - /user-art/: the owner's own card pictures (card-assets/local.nosync),
 *    ONLY for a browser on this computer: the connection must come from
 *    the loopback address and be addressed to localhost. Other devices and
 *    anything arriving through a tunnel or proxy get nothing, so the
 *    pictures are never passed on to online opponents.
 *  - everything else: the built web client (web-client/dist.nosync), when
 *    a folder is given; unknown paths get index.html.
 *
 * Dead connections are found with WebSocket pings every 15 seconds.
 */

import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { type IncomingMessage, type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { RoomManager, type RoomManagerOptions } from './rooms';
import { WS_PATH } from './shared';

export interface GameServerOptions extends RoomManagerOptions {
  port?: number;
  /** 127.0.0.1 (this computer only, the default) or 0.0.0.0 (also other devices on the network). */
  host?: string;
  /** Folder of the built web client to serve; none: only /ws and /health. */
  staticDir?: string | null;
  /** Milliseconds between WebSocket pings. */
  heartbeatMs?: number;
  /** Extra allowed browser origins, e.g. "https://example.org". */
  allowedOrigins?: string[];
  /** Folder of the owner's own card pictures, served to this computer only; none: not served. */
  userArtDir?: string | null;
}

export interface GameServer {
  readonly port: number;
  readonly manager: RoomManager;
  readonly http: Server;
  close(): Promise<void>;
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Whether a browser on `origin` may open a game connection to a server reached as `host`. */
export function originAllowed(origin: string | undefined, host: string | undefined, extra: readonly string[] = []): boolean {
  if (!origin) return true; // Not a browser (tests, tools).
  if (extra.includes(origin)) return true;
  let originHost: string;
  try {
    originHost = new URL(origin).hostname;
  } catch {
    return false;
  }
  const hostName = (host ?? '').replace(/:\d+$/, '');
  return originHost === hostName || LOCAL_HOSTS.has(originHost === '::1' ? '[::1]' : originHost);
}

const PICTURE = /^[A-Za-z0-9_\-+.]+\.(png|jpe?g|webp)$/i;
const PICTURE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

/** A request from a browser on this computer, addressed to localhost (not relayed by a tunnel or proxy under another name). */
export function isLocalRequest(req: IncomingMessage): boolean {
  const address = req.socket.remoteAddress ?? '';
  const loopback = address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
  const host = (req.headers.host ?? '').replace(/:\d+$/, '');
  const forwarded = req.headers['x-forwarded-for'] !== undefined || req.headers['x-forwarded-host'] !== undefined || req.headers.forwarded !== undefined;
  return loopback && LOCAL_HOSTS.has(host) && !forwarded;
}

function serveUserArt(dir: string | null, req: IncomingMessage, res: import('node:http').ServerResponse): void {
  const name = decodeURIComponent((req.url ?? '').slice('/user-art/'.length).split('?')[0] ?? '');
  const allowed = dir !== null && existsSync(dir) && isLocalRequest(req);
  if (name === 'manifest.json') {
    const files: Record<string, string> = {};
    let sources: Record<string, unknown> = {};
    if (allowed) {
      // Card id from the file name: the first "_" stands for the "/" of the card number.
      for (const file of readdirSync(dir)) if (PICTURE.test(file)) files[file.replace(/\.[^.]+$/, '').replace('_', '/')] = file;
      try {
        sources = JSON.parse(readFileSync(join(dir, 'sources.json'), 'utf8')) as Record<string, unknown>;
      } catch {
        // sources.json is optional.
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify({ files, sources }));
    return;
  }
  const file = allowed ? resolve(dir, name) : '';
  if (!allowed || !PICTURE.test(name) || !file.startsWith(resolve(dir) + sep) || !existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': PICTURE_TYPES[name.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
  createReadStream(file).pipe(res);
}

function serveStatic(root: string, req: IncomingMessage, res: import('node:http').ServerResponse): void {
  let path: string;
  try {
    path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  let file = resolve(root, normalize(`.${path}`));
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(404).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  const type = TYPES[extname(file)] ?? 'application/octet-stream';
  // Hashed assets never change; the page itself must always be fresh.
  const cache = file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' });
  createReadStream(file).pipe(res);
}

export function startGameServer(options: GameServerOptions = {}): Promise<GameServer> {
  const manager = new RoomManager(options);
  const staticDir = options.staticDir ? resolve(options.staticDir) : null;
  const allowed = options.allowedOrigins ?? [];
  const userArtDir = options.userArtDir ? resolve(options.userArtDir) : null;

  const http = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    if (req.url?.startsWith('/user-art/')) {
      serveUserArt(userArtDir, req, res);
      return;
    }
    if (staticDir) serveStatic(staticDir, req, res);
    else res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('This server only runs games. Start the web client with npm run dev, or build it first.');
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  const alive = new WeakMap<WebSocket, boolean>();

  http.on('upgrade', (req, socket, head) => {
    const path = (req.url ?? '').split('?')[0];
    if (path !== WS_PATH || !originAllowed(req.headers.origin, req.headers.host, allowed)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws: WebSocket) => {
    alive.set(ws, true);
    const session = manager.connect({
      send: (message) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
      },
      close: () => ws.close(),
    });
    ws.on('pong', () => alive.set(ws, true));
    ws.on('message', (data, isBinary) => {
      if (isBinary) return session.error('BAD_MESSAGE');
      session.receive(data.toString());
    });
    ws.on('close', () => session.closed());
    ws.on('error', () => ws.terminate());
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.get(ws)) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, options.heartbeatMs ?? 15_000);
  const sweeper = setInterval(() => manager.sweep(), 10 * 60 * 1000);

  return new Promise((resolvePromise, reject) => {
    http.once('error', reject);
    http.listen(options.port ?? 8787, options.host ?? '127.0.0.1', () => {
      const port = (http.address() as AddressInfo).port;
      resolvePromise({
        port,
        manager,
        http,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(heartbeat);
            clearInterval(sweeper);
            for (const ws of wss.clients) ws.terminate();
            wss.close();
            manager.shutdown();
            http.close(() => done());
            http.closeAllConnections();
          }),
      });
    });
  });
}
