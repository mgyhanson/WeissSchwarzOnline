/**
 * The browser's online client against a real game server (Node's built-in
 * WebSocket stands in for the browser's).
 */

import { afterEach, describe, expect, it } from 'vitest';
import { type GameServer, startGameServer } from '@wso/server';
import { checkReplay } from '@wso/server/shared';
import { OnlineClient, ONLINE_KEY } from '../src/host/remote';
import { ReplayHost } from '../src/host/replay';

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

async function until<T>(find: () => T | null | undefined | false, ms = 20_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const found = find();
    if (found) return found;
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

let server: GameServer | null = null;
const clients: OnlineClient[] = [];

afterEach(async () => {
  for (const c of clients.splice(0)) c.dispose();
  await server?.close();
  server = null;
});

function client(storage = new MemoryStorage()): { c: OnlineClient; storage: MemoryStorage } {
  const c = new OnlineClient({ url: `ws://127.0.0.1:${server!.port}/ws`, storage, autoPlayDelay: 0 });
  clients.push(c);
  return { c, storage };
}

describe('online client', () => {
  it('two browsers play a whole game with 自動代打, one reloads and one loses its connection on the way, then both watch the replay', async () => {
    server = await startGameServer({ port: 0 });
    const a = client();
    const b = client();
    a.c.create('Alice', 'test-sao');
    const code = (await until(() => a.c.getSnapshot().lobby)).code;
    b.c.join(code, 'Bob', 'test-gup');
    await until(() => a.c.getSnapshot().lobby?.seats[1]);
    a.c.setReady(true);
    b.c.setReady(true);
    const ga = await until(() => a.c.getSnapshot().game);
    const gb = await until(() => b.c.getSnapshot().game);
    expect([ga.seat, gb.seat]).toEqual([0, 1]);
    expect(ga.opponentLabel).toBe('對手・Bob');
    ga.setAutoPlay(true);
    gb.setAutoPlay(true);

    // B reloads the page: a new client from the same storage goes back to the seat.
    await until(() => gb.lastUpdateId >= 20);
    b.c.dispose();
    const b2 = client(b.storage);
    b2.c.resume();
    const gb2 = await until(() => b2.c.getSnapshot().game);
    expect(gb2.seat).toBe(1);
    // Everything up to the reload is shown without animation (later updates, if any, are new).
    expect(gb2.getSnapshot().restoredUpTo).toBeGreaterThanOrEqual(20);
    expect(gb2.getSnapshot().updates[0]!.id).toBe(gb2.getSnapshot().restoredUpTo);
    gb2.setAutoPlay(true);

    // A's connection drops (the server side closes it): the client reconnects by itself.
    await until(() => ga.lastUpdateId >= 60);
    const room = server.manager.rooms.get(code)!;
    for (const session of [...room.sessions[0]]) session.conn.close();
    await until(() => a.c.getSnapshot().connection === 'reconnecting' || a.c.getSnapshot().connection === 'open');
    await until(() => a.c.getSnapshot().connection === 'open' && room.sessions[0].size === 1);

    const result = await until(() => ga.getSnapshot().view.result, 60_000);
    const resultB = await until(() => gb2.getSnapshot().view.result, 10_000);
    expect(resultB).toEqual(result);

    const replay = await ga.getReplay();
    expect(checkReplay(JSON.parse(JSON.stringify(replay))).ok).toBe(true);
    const viewer = new ReplayHost(replay, 1, 0);
    viewer.replayControls.toEnd();
    expect(viewer.getSnapshot().view.result).toEqual(result);
    expect(viewer.getSnapshot().replay).toMatchObject({ position: replay.entries.length, total: replay.entries.length, viewer: 'Bob' });
    viewer.dispose();
  }, 120_000);

  it('a saved seat whose room no longer exists is forgotten, with a message', async () => {
    server = await startGameServer({ port: 0 });
    const storage = new MemoryStorage();
    storage.setItem(ONLINE_KEY, JSON.stringify({ code: 'ABCDEF', token: 'a'.repeat(32), seat: 0 }));
    const { c } = client(storage);
    c.resume();
    await until(() => c.getSnapshot().error);
    expect(c.getSnapshot().session).toBeNull();
    expect(storage.getItem(ONLINE_KEY)).toBeNull();
  });

  it('one answer per decision: tapping twice sends only one', async () => {
    server = await startGameServer({ port: 0 });
    const a = client();
    const b = client();
    a.c.create('A', 'test-haruhi');
    const code = (await until(() => a.c.getSnapshot().lobby)).code;
    b.c.join(code, 'B', 'test-ichika');
    await until(() => a.c.getSnapshot().lobby?.seats[1]);
    a.c.setReady(true);
    b.c.setReady(true);
    const ga = await until(() => a.c.getSnapshot().game);
    const gb = await until(() => b.c.getSnapshot().game);
    const mover = ga.getSnapshot().view.decision?.mine ? ga : gb;
    const before = mover.lastUpdateId;
    const decision = mover.getSnapshot().view.decision!;
    if (!decision.mine || decision.decision.kind !== 'MULLIGAN') throw new Error('expected the opening mulligan');
    mover.submit({ kind: 'MULLIGAN', discard: [] });
    mover.submit({ kind: 'MULLIGAN', discard: [] });
    await until(() => mover.lastUpdateId > before);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(mover.lastUpdateId).toBe(before + 1);
    expect(mover.getSnapshot().error).toBeNull();
  });
});
