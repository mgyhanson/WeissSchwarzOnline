import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
