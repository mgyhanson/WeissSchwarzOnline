import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { PlayerView } from '@wso/game-engine';
import { type GameServer, originAllowed, startGameServer } from '../src/server';
import type { ServerMessage } from '../src/shared';
import { aiFor } from './helpers';

/** A real WebSocket client. */
class Socket {
  readonly messages: ServerMessage[] = [];
  private waiters: (() => void)[] = [];
  ws: WebSocket;

  constructor(url: string, origin?: string) {
    this.ws = new WebSocket(url, origin ? { origin } : {});
    this.ws.on('message', (data) => {
      this.messages.push(JSON.parse(data.toString()) as ServerMessage);
      for (const wake of this.waiters.splice(0)) wake();
    });
  }

  opened(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.once('open', () => resolve());
      this.ws.once('error', reject);
    });
  }

  send(message: object): void {
    this.ws.send(JSON.stringify(message));
  }

  async until<T>(find: () => T | undefined, ms = 10_000): Promise<T> {
    const end = Date.now() + ms;
    for (;;) {
      const found = find();
      if (found !== undefined) return found;
      if (Date.now() > end) throw new Error('timed out');
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 200);
      });
    }
  }

  last<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }> | undefined {
    return [...this.messages].reverse().find((m): m is Extract<ServerMessage, { t: T }> => m.t === t);
  }

  view(): { game: number; view: PlayerView; id: number } | undefined {
    let current: { game: number; view: PlayerView; id: number } | undefined;
    for (const m of this.messages) {
      if (m.t === 'game' && m.updates.length > 0) current = { game: m.game, view: m.updates[m.updates.length - 1]!.view, id: m.updates[m.updates.length - 1]!.id };
      if (m.t === 'update' && current && m.update.id > current.id) current = { game: m.game, view: m.update.view, id: m.update.id };
    }
    return current;
  }

  close(): void {
    this.ws.close();
  }
}

let server: GameServer | null = null;
let dir: string | null = null;

afterEach(async () => {
  await server?.close();
  server = null;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe('game server over WebSockets', () => {
  it('two browsers create and join a room, play a whole game, and both see the same result', async () => {
    server = await startGameServer({ port: 0 });
    const url = `ws://127.0.0.1:${server.port}/ws`;
    const a = new Socket(url);
    const b = new Socket(url);
    await Promise.all([a.opened(), b.opened()]);
    a.send({ t: 'create', name: 'A', deck: 'test-gup' });
    const { code } = await a.until(() => a.last('welcome'));
    b.send({ t: 'join', code, name: 'B', deck: 'test-sao-memory' });
    await b.until(() => b.last('welcome'));
    a.send({ t: 'ready', ready: true });
    b.send({ t: 'ready', ready: true });

    const ais = [aiFor('test-gup', 'a'), aiFor('test-sao-memory', 'b')];
    const sockets = [a, b];
    const answered = new Set<string>();
    for (let i = 0; i < 20_000; i++) {
      const views = sockets.map((s) => s.view());
      if (views[0]?.view.result && views[1]?.view.result) break;
      const seat = views.findIndex((v) => v && !v.view.result && v.view.decision?.mine && !answered.has(`${v.game}/${v.view.decision.decision.id}`));
      if (seat === -1) {
        await Promise.race(sockets.map((s) => s.until(() => (s.view()?.id !== views[sockets.indexOf(s)]?.id ? true : undefined), 2000).catch(() => undefined)));
        continue;
      }
      const v = views[seat]!;
      const decision = v.view.decision!.mine ? v.view.decision!.decision : null;
      answered.add(`${v.game}/${decision!.id}`);
      sockets[seat]!.send({ t: 'choice', game: v.game, decisionId: decision!.id, choice: ais[seat]!.choose(v.view, decision!) });
    }
    expect(a.view()!.view.result).not.toBeNull();
    expect(a.view()!.view.result).not.toMatchObject({ reason: 'RESIGNED' });
    expect(answered.size).toBeGreaterThan(50);
    expect(b.view()!.view.result).toEqual(a.view()!.view.result);
    expect(a.messages.filter((m) => m.t === 'error')).toEqual([]);
    a.close();
    b.close();
  }, 120_000);

  it('a connection that drops comes back to its seat on a new connection', async () => {
    server = await startGameServer({ port: 0 });
    const url = `ws://127.0.0.1:${server.port}/ws`;
    const a = new Socket(url);
    const b = new Socket(url);
    await Promise.all([a.opened(), b.opened()]);
    a.send({ t: 'create', name: 'A', deck: 'test-haruhi' });
    const { code } = await a.until(() => a.last('welcome'));
    b.send({ t: 'join', code, name: 'B', deck: 'test-ichika' });
    const { token } = await b.until(() => b.last('welcome'));
    a.send({ t: 'ready', ready: true });
    b.send({ t: 'ready', ready: true });
    await b.until(() => b.last('game'));
    b.ws.terminate();
    await a.until(() => (a.last('lobby')?.lobby.seats[1]?.connected === false ? true : undefined));
    expect(a.last('lobby')!.lobby.disconnect).toMatchObject({ seat: 1 });

    const again = new Socket(url);
    await again.opened();
    again.send({ t: 'resume', code, token, game: 1, lastUpdate: -1 });
    const game = await again.until(() => again.last('game'));
    expect(game.seat).toBe(1);
    await a.until(() => (a.last('lobby')?.lobby.disconnect === null ? true : undefined));
    a.close();
    again.close();
  });

  it('only pages on the same host name or on localhost may connect', async () => {
    expect(originAllowed(undefined, 'localhost:8787')).toBe(true);
    expect(originAllowed('http://localhost:5173', 'localhost:8787')).toBe(true);
    expect(originAllowed('http://192.168.1.20:5173', '192.168.1.20:5173')).toBe(true);
    expect(originAllowed('https://evil.example', 'localhost:8787')).toBe(false);
    expect(originAllowed('https://evil.example', '192.168.1.20:8787')).toBe(false);
    expect(originAllowed('https://friend.example', 'localhost:8787', ['https://friend.example'])).toBe(true);

    server = await startGameServer({ port: 0 });
    const evil = new Socket(`ws://127.0.0.1:${server.port}/ws`, 'https://evil.example');
    await expect(evil.opened()).rejects.toThrow();
    const wrongPath = new Socket(`ws://127.0.0.1:${server.port}/other`);
    await expect(wrongPath.opened()).rejects.toThrow();
  });

  describe('card pictures (/user-art/)', () => {
    const get = (path: string, headers: Record<string, string> = {}, method = 'GET') =>
      new Promise<{ status: number; body: string; headers: Record<string, string | string[] | undefined> }>((resolve, reject) => {
        const req = request({ host: '127.0.0.1', port: server!.port, path, headers, method }, (res) => {
          let body = '';
          res.on('data', (d) => (body += d));
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
        });
        req.on('error', reject);
        req.end();
      });
    /** A picture folder: one indexed picture, one picture the index does not list, and private files. */
    const folder = () => {
      dir = mkdtempSync(join(tmpdir(), 'wso-art-'));
      writeFileSync(join(dir, 'SAO_S20-001.png'), 'picture one');
      writeFileSync(join(dir, 'SAO_S20-004.png'), 'not in the index');
      writeFileSync(join(dir, 'notes.txt'), 'private');
      writeFileSync(join(dir, 'image-index.json'), JSON.stringify({ 'SAO/S20-001': { file: 'SAO_S20-001.png', sha256: 'ab'.repeat(32) }, 'SAO/S20-008': { file: '../escape.png', sha256: 'cd'.repeat(32) }, 'SAO/S20-009': { file: 'missing.png', sha256: 'ef'.repeat(32) } }));
      writeFileSync(join(dir, 'sources.json'), JSON.stringify({ 'SAO_S20-001.png': { source: 'test', secret: 'x' }, 'other.png': { source: 'unlisted' } }));
      return dir;
    };
    const lan = { host: '192.168.1.20:8787' };

    it('by default every game client gets the pictures: this computer, another device on the network, a player in an online room', async () => {
      server = await startGameServer({ port: 0, userArtDir: folder() });
      expect(server.userArt.mode).toBe('clients');
      for (const headers of [{ host: `localhost:${server.port}` }, lan, { host: 'play.example', 'x-forwarded-for': '203.0.113.5' }]) {
        const manifest = JSON.parse((await get('/user-art/manifest.json', headers)).body);
        // Card id → file from the index; only listed files that exist; only the source notes of those files.
        expect(manifest, JSON.stringify(headers)).toEqual({ files: { 'SAO/S20-001': 'SAO_S20-001.png' }, sources: { 'SAO_S20-001.png': { source: 'test' } } });
        expect(await get('/user-art/SAO_S20-001.png', headers)).toMatchObject({ status: 200, body: 'picture one' });
      }
    });

    it('only files the index lists are served: no other picture, no other file, nothing outside the folder', async () => {
      server = await startGameServer({ port: 0, userArtDir: folder() });
      for (const path of ['/user-art/SAO_S20-004.png', '/user-art/notes.txt', '/user-art/image-index.json', '/user-art/sources.json', '/user-art/..%2Fescape.png', '/user-art/..%2F..%2Fpackage.json', '/user-art/missing.png', '/user-art/%E0%A4%A']) {
        expect((await get(path, lan)).status, path).toBeGreaterThanOrEqual(400);
      }
    });

    it('pictures are cacheable and revalidate with an ETag; HEAD sends no body', async () => {
      server = await startGameServer({ port: 0, userArtDir: folder() });
      const first = await get('/user-art/SAO_S20-001.png', lan);
      expect(first.headers).toMatchObject({ 'content-type': 'image/png', 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff' });
      const etag = first.headers.etag as string;
      expect((await get('/user-art/SAO_S20-001.png', { ...lan, 'if-none-match': etag })).status).toBe(304);
      expect(await get('/user-art/SAO_S20-001.png', lan, 'HEAD')).toMatchObject({ status: 200, body: '' });
    });

    it('USER_ART=local serves this computer only; USER_ART=off serves nobody; the game then draws its own faces', async () => {
      server = await startGameServer({ port: 0, userArtDir: folder(), userArtMode: 'local' });
      const local = { host: `localhost:${server.port}` };
      expect((await get('/user-art/SAO_S20-001.png', local)).status).toBe(200);
      for (const headers of [lan, { host: 'my-tunnel.example' }, { ...local, 'x-forwarded-for': '203.0.113.5' }]) {
        expect(JSON.parse((await get('/user-art/manifest.json', headers)).body), JSON.stringify(headers)).toEqual({ files: {}, sources: {} });
        expect((await get('/user-art/SAO_S20-001.png', headers)).status, JSON.stringify(headers)).toBe(404);
      }
      await server.close();
      rmSync(dir!, { recursive: true, force: true });
      server = await startGameServer({ port: 0, userArtDir: folder(), userArtMode: 'off' });
      expect(JSON.parse((await get('/user-art/manifest.json', { host: `localhost:${server.port}` })).body)).toEqual({ files: {}, sources: {} });
      expect((await get('/user-art/SAO_S20-001.png', { host: `localhost:${server.port}` })).status).toBe(404);
    });

    it('without a picture folder the manifest is empty', async () => {
      server = await startGameServer({ port: 0 });
      expect(JSON.parse((await get('/user-art/manifest.json')).body)).toEqual({ files: {}, sources: {} });
    });
  });

  it('serves the built client, falls back to index.html, and never serves files outside its folder', async () => {
    dir = mkdtempSync(join(tmpdir(), 'wso-static-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>WS</title>');
    writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)');
    writeFileSync(join(tmpdir(), 'wso-secret-test.txt'), 'secret');
    server = await startGameServer({ port: 0, staticDir: dir });
    const base = `http://127.0.0.1:${server.port}`;
    const get = async (path: string) => {
      const res = await fetch(base + path);
      return { status: res.status, type: res.headers.get('content-type'), body: await res.text() };
    };
    expect(await get('/health')).toMatchObject({ status: 200, body: 'ok' });
    expect(await get('/')).toMatchObject({ status: 200, body: '<!doctype html><title>WS</title>' });
    expect(await get('/assets/app.js')).toMatchObject({ status: 200, type: 'text/javascript; charset=utf-8' });
    expect(await get('/room/ABCDEF')).toMatchObject({ body: '<!doctype html><title>WS</title>' });
    for (const path of ['/../wso-secret-test.txt', '/%2e%2e/wso-secret-test.txt', '/assets/../../wso-secret-test.txt']) {
      expect((await get(path)).body, path).not.toContain('secret');
    }
    rmSync(join(tmpdir(), 'wso-secret-test.txt'), { force: true });
  });
});
