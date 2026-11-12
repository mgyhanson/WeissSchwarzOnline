import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type PlayerView, serializeState } from '@wso/game-engine';
import { RoomManager } from '../src/rooms';
import { checkReplay, parseClientMessage } from '../src/shared';
import { MemoryStore, SqliteStore } from '../src/store';
import { Client, FakeTimers, aiFor, play, startedRoom } from './helpers';

const GRACE = 10 * 60 * 1000;

function manager(timers = new FakeTimers(), store = new MemoryStore()) {
  return { timers, m: new RoomManager({ store, graceMs: GRACE, now: () => timers.now, timers }) };
}

/** INV-06 for what one seat received: the opponent's hand, both decks and both stocks are hidden. */
function hiddenProblems(view: PlayerView): string[] {
  const problems: string[] = [];
  const opponent = view.viewer === 0 ? 1 : 0;
  if (view.sides[opponent].hand.some((c) => !c.hidden)) problems.push('opponent hand visible');
  for (const side of view.sides) {
    if (side.deck.some((c) => !c.hidden)) problems.push('deck visible');
    if (side.stock.some((c) => !c.hidden)) problems.push('stock visible');
  }
  return problems;
}

describe('rooms: lobby', () => {
  it('create, join with the code, both ready: the game starts and each seat gets its own view', () => {
    const { m } = manager();
    const a = new Client(m);
    a.send({ t: 'create', name: 'Alice', deck: 'test-haruhi' });
    const welcome = a.welcome!;
    expect(welcome).toMatchObject({ seat: 0 });
    expect(welcome.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(welcome.token).toMatch(/^[0-9a-f]{32}$/);
    expect(a.lobby).toMatchObject({ status: 'LOBBY', seats: [{ name: 'Alice', connected: true, ready: false }, null] });

    const b = new Client(m);
    b.send({ t: 'join', code: welcome.code.toLowerCase(), name: 'Bob', deck: 'test-ichika' });
    expect(b.welcome).toMatchObject({ seat: 1, code: welcome.code });
    expect(a.lobby!.seats[1]).toMatchObject({ name: 'Bob', connected: true });
    // You never learn the other player's deck from the lobby.
    expect(JSON.stringify(a.all('lobby'))).not.toContain('test-ichika');
    expect(JSON.stringify(b.all('lobby'))).not.toContain('test-haruhi');

    a.send({ t: 'ready', ready: true });
    expect(a.game).toBeNull();
    b.send({ t: 'ready', ready: true });
    expect(a.lobby).toMatchObject({ status: 'PLAYING', game: 1 });
    const [ga, gb] = [a.last('game')!, b.last('game')!];
    expect([ga.seat, gb.seat]).toEqual([0, 1]);
    expect([ga.deck, gb.deck]).toEqual(['test-haruhi', 'test-ichika']);
    expect([ga.opponent, gb.opponent]).toEqual(['Bob', 'Alice']);
    expect(ga.restoredUpTo).toBe(-1); // a new game is animated from the start
    expect(a.game!.view.viewer).toBe(0);
    expect(b.game!.view.viewer).toBe(1);
  });

  it('a third player cannot join; unknown codes and malformed messages are refused without effect', () => {
    const { m } = manager();
    const { code } = startedRoom(m);
    const c = new Client(m);
    c.send({ t: 'join', code, name: 'Carol', deck: 'test-sao' });
    c.send({ t: 'join', code: 'ZZZZZZ', name: 'Carol', deck: 'test-sao' });
    c.session.receive('not json');
    c.send({ t: 'create', deck: 'no-such-deck' });
    c.send({ t: 'choice', game: 1, decisionId: 0, choice: {} });
    expect(c.errors).toEqual(['ROOM_FULL', 'NOT_FOUND', 'BAD_MESSAGE', 'BAD_MESSAGE', 'NOT_IN_ROOM']);
  });

  it('names are cleaned: trimmed, control characters removed, at most 16 characters; empty names get a default', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'create', name: '  A\u0000li\nce  ', deck: 'test-sao' }))).toEqual({ t: 'create', name: 'Alice', deck: 'test-sao' });
    expect(parseClientMessage(JSON.stringify({ t: 'create', name: 'x'.repeat(40), deck: 'test-sao' }))).toMatchObject({ name: 'x'.repeat(16) });
    const { m } = manager();
    const a = new Client(m);
    a.send({ t: 'create', name: '   ', deck: 'test-sao' });
    expect(a.lobby!.seats[0]!.name).toBe('玩家 1');
  });

  it('the deck can be changed until ready; leaving the lobby frees the seat', () => {
    const { m } = manager();
    const a = new Client(m);
    a.send({ t: 'create', name: 'A', deck: 'test-haruhi' });
    a.send({ t: 'deck', deck: 'test-gup' });
    expect(a.lobby!.you.deck).toBe('test-gup');
    a.send({ t: 'ready', ready: true });
    a.send({ t: 'deck', deck: 'test-sao' });
    expect(a.errors).toEqual(['WRONG_STATE']);
    const b = new Client(m);
    b.send({ t: 'join', code: a.welcome!.code, name: 'B', deck: 'test-sao' });
    b.send({ t: 'leave' });
    expect(a.lobby!.seats[1]).toBeNull();
    const c = new Client(m);
    c.send({ t: 'join', code: a.welcome!.code, name: 'C', deck: 'test-sao' });
    expect(c.welcome!.seat).toBe(1);
  });

  it('a client sending too many messages is cut off', () => {
    const timers = new FakeTimers();
    const m = new RoomManager({ now: () => timers.now, timers, rateLimit: 20 });
    const a = new Client(m);
    for (let i = 0; i < 25; i++) a.send({ t: 'ping' });
    expect(a.errors).toContain('RATE_LIMIT');
    expect(a.closedByServer).toBe(true);
  });
});

describe('rooms: playing', () => {
  it('two players finish a whole game over the protocol; INV-06: neither ever receives hidden information or the seed', () => {
    const { m } = manager();
    const { a, b } = startedRoom(m);
    const sent = play([a, b], [aiFor('test-haruhi', 'a'), aiFor('test-ichika', 'b')]);
    expect(sent).toBeGreaterThan(50);
    const [ra, rb] = [a.game!.view.result, b.game!.view.result];
    expect(ra).not.toBeNull();
    expect(rb).toEqual(ra);
    expect(a.lobby).toMatchObject({ status: 'FINISHED', result: ra });
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);

    const seed = [...m.rooms.values()][0]!.record.seed!;
    for (const client of [a, b]) {
      for (const message of client.messages) {
        if (message.t === 'game') for (const u of message.updates) expect(hiddenProblems(u.view)).toEqual([]);
        if (message.t === 'update') expect(hiddenProblems(message.update.view)).toEqual([]);
      }
      expect(client.raw.join('\n')).not.toContain(seed);
    }
  });

  it('duplicate, late, wrong-seat and illegal answers are refused and change nothing', () => {
    const { m } = manager();
    const { a, b } = startedRoom(m);
    const room = [...m.rooms.values()][0]!;
    const mover = a.game!.view.decision?.mine ? a : b;
    const waiter = mover === a ? b : a;
    const view = mover.game!.view;
    const decision = view.decision!.mine ? view.decision!.decision : null;
    const choice = aiFor(mover === a ? 'test-haruhi' : 'test-ichika', 'x').choose(view, decision!);
    const before = serializeState(room.match!.state);

    waiter.send({ t: 'choice', game: 1, decisionId: decision!.id, choice });
    mover.send({ t: 'choice', game: 1, decisionId: decision!.id, choice: { kind: 'MULLIGAN', discard: [987654] } });
    mover.send({ t: 'choice', game: 2, decisionId: decision!.id, choice });
    expect(serializeState(room.match!.state)).toBe(before);
    expect(waiter.errors).toEqual(['NOT_YOUR_DECISION']);
    expect(mover.errors).toEqual(['REJECTED', 'STALE']);

    mover.send({ t: 'choice', game: 1, decisionId: decision!.id, choice });
    const after = serializeState(room.match!.state);
    expect(after).not.toBe(before);
    mover.send({ t: 'choice', game: 1, decisionId: decision!.id, choice }); // the same answer again
    expect(serializeState(room.match!.state)).toBe(after);
    expect(mover.errors).toEqual(['REJECTED', 'STALE', 'STALE']);
  });

  it('resigning ends the game for both (CR-1.2.4); the replay is only given after the end and reproduces the game', () => {
    const { m } = manager();
    const { a, b } = startedRoom(m);
    play([a, b], [aiFor('test-haruhi', 'a'), aiFor('test-ichika', 'b')], 40);
    a.send({ t: 'replay', game: 1 });
    expect(a.errors).toEqual(['WRONG_STATE']);
    a.send({ t: 'resign', game: 1 });
    expect(b.game!.view.result).toMatchObject({ outcome: 'WIN', winner: 1, loser: 0, reason: 'RESIGNED' });
    b.send({ t: 'replay', game: 1 });
    const replay = b.last('replay')!.replay;
    expect(replay).toMatchObject({ format: 'wso-replay', source: 'online', players: ['Alice', 'Bob'], decks: [{ id: 'test-haruhi' }, { id: 'test-ichika' }] });
    expect(replay.entries[replay.entries.length - 1]).toEqual({ player: 0, resign: true });
    const checked = checkReplay(JSON.parse(JSON.stringify(replay)));
    expect(checked.ok).toBe(true);
  });

  it('after a game both may ask for a rematch (decks may change first); a new game with a new seed starts', () => {
    const { m } = manager();
    const { a, b } = startedRoom(m);
    a.send({ t: 'resign', game: 1 });
    const room = [...m.rooms.values()][0]!;
    const firstSeed = room.record.seed;
    b.send({ t: 'deck', deck: 'test-sao-memory' });
    a.send({ t: 'rematch' });
    expect(b.lobby).toMatchObject({ status: 'FINISHED', seats: [{ rematch: true }, { rematch: false }] });
    b.send({ t: 'rematch' });
    expect(a.lobby).toMatchObject({ status: 'PLAYING', game: 2 });
    expect(b.last('game')).toMatchObject({ game: 2, deck: 'test-sao-memory' });
    expect(room.record.seed).not.toBe(firstSeed);
    // Answers for the old game are refused.
    a.send({ t: 'resign', game: 1 });
    expect(a.errors).toEqual(['WRONG_STATE']);
  });

  it('leaving during a game concedes it', () => {
    const { m } = manager();
    const { a, b } = startedRoom(m);
    b.send({ t: 'leave' });
    expect(a.game!.view.result).toMatchObject({ winner: 0, reason: 'RESIGNED' });
    expect(a.lobby!.seats[1]).toMatchObject({ left: true, connected: false });
  });
});

describe('rooms: reconnection and the disconnection hold', () => {
  it('a reload comes back to the same seat with the token; the board is restored without replaying animations', () => {
    const { m } = manager();
    const { a, b, code } = startedRoom(m);
    play([a, b], [aiFor('test-haruhi', 'a'), aiFor('test-ichika', 'b')], 30);
    const token = b.welcome!.token;
    const before = b.game!;
    b.disconnect();
    expect(a.lobby!.seats[1]!.connected).toBe(false);

    const page = new Client(m);
    page.send({ t: 'resume', code, token, game: 0, lastUpdate: -1 });
    expect(page.welcome).toMatchObject({ seat: 1, code });
    const game = page.last('game')!;
    expect(game.updates).toHaveLength(1);
    expect(game.restoredUpTo).toBe(before.lastUpdate);
    expect(page.game!.view).toEqual(before.view);
    expect(game.events.length).toBe(b.all('game')[0]!.events.length + b.all('update').reduce((n, u) => n + u.update.events.length, 0));
    expect(a.lobby!.seats[1]!.connected).toBe(true);

    const stranger = new Client(m);
    stranger.send({ t: 'resume', code, token: 'f'.repeat(32), game: 0, lastUpdate: -1 });
    expect(stranger.errors).toEqual(['BAD_TOKEN']);
  });

  it('after a short drop, only the missed updates are sent, to be animated', () => {
    const { m } = manager();
    const { a, b, code } = startedRoom(m);
    play([a, b], [aiFor('test-haruhi', 'a'), aiFor('test-ichika', 'b')], 10);
    const had = b.game!.lastUpdate;
    b.disconnect();
    play([a, b], [aiFor('test-haruhi', 'a2'), aiFor('test-ichika', 'b2')], 1); // only A can answer now, if it is A's decision
    b.reconnect();
    b.send({ t: 'resume', code, token: b.welcome!.token, game: 1, lastUpdate: had });
    const game = b.last('game')!;
    expect(game.restoredUpTo).toBe(had);
    expect(game.updates.every((u) => u.id > had)).toBe(true);
  });

  it('a player who stays disconnected while the opponent waits concedes after the hold; coming back in time cancels it', () => {
    const { m, timers } = manager();
    const { a, b, code } = startedRoom(m);
    b.disconnect();
    expect(a.lobby!.disconnect).toEqual({ seat: 1, at: timers.now + GRACE });
    timers.advance(GRACE - 1000);
    b.reconnect();
    b.send({ t: 'resume', code, token: b.welcome!.token, game: 1, lastUpdate: -1 });
    expect(a.lobby!.disconnect).toBeNull();
    timers.advance(5000);
    expect(a.game!.view.result).toBeNull();

    b.disconnect();
    timers.advance(GRACE);
    expect(a.game!.view.result).toMatchObject({ winner: 0, loser: 1, reason: 'RESIGNED' });
    expect(a.lobby).toMatchObject({ status: 'FINISHED', forfeit: 1 });
  });

  it('when both players are disconnected the game simply waits', () => {
    const { m, timers } = manager();
    const { a, b, code } = startedRoom(m);
    a.disconnect();
    b.disconnect();
    expect(timers.count).toBe(0);
    timers.advance(GRACE * 5);
    a.reconnect();
    a.send({ t: 'resume', code, token: a.welcome!.token, game: 1, lastUpdate: -1 });
    expect(a.game!.view.result).toBeNull();
    // Now A waits for B, so B's hold starts.
    expect(a.lobby!.disconnect).toMatchObject({ seat: 1 });
  });

  it('rooms nobody uses are removed after the time to live', () => {
    const timers = new FakeTimers();
    const m = new RoomManager({ now: () => timers.now, timers, roomTtlMs: 1000 });
    const a = new Client(m);
    a.send({ t: 'create', name: 'A', deck: 'test-sao' });
    timers.advance(5000);
    m.sweep();
    expect(m.rooms.size).toBe(1); // still connected
    a.disconnect();
    m.sweep();
    expect(m.rooms.size).toBe(0);
  });
});

describe('rooms: persistence', () => {
  it('after a server restart, rooms and games are rebuilt from the stored seed and answers, identical to before (INV-07)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wso-store-'));
    try {
      const file = join(dir, 'server.sqlite');
      const timers = new FakeTimers();
      const first = new RoomManager({ store: new SqliteStore(file), graceMs: GRACE, now: () => timers.now, timers });
      const { a, b, code } = startedRoom(first, ['test-sao', 'test-gup']);
      play([a, b], [aiFor('test-sao', 'a'), aiFor('test-gup', 'b')], 60);
      const before = serializeState([...first.rooms.values()][0]!.match!.state);
      const lobbyBefore = a.lobby!;
      first.shutdown();

      const second = new RoomManager({ store: new SqliteStore(file), graceMs: GRACE, now: () => timers.now, timers });
      const room = second.rooms.get(code)!;
      expect(serializeState(room.match!.state)).toBe(before);
      expect(room.record.status).toBe('PLAYING');

      const pageA = new Client(second);
      pageA.send({ t: 'resume', code, token: a.welcome!.token, game: 1, lastUpdate: -1 });
      const pageB = new Client(second);
      pageB.send({ t: 'resume', code, token: b.welcome!.token, game: 1, lastUpdate: -1 });
      expect(pageA.lobby).toMatchObject({ code, status: 'PLAYING', game: lobbyBefore.game });
      expect(pageA.game!.view).toEqual(a.game!.view);
      // The game goes on to the end after the restart.
      play([pageA, pageB], [aiFor('test-sao', 'a3'), aiFor('test-gup', 'b3')]);
      expect(pageA.game!.view.result).not.toBeNull();
      second.shutdown();

      const third = new RoomManager({ store: new SqliteStore(file), now: () => timers.now, timers });
      expect(third.rooms.get(code)!.record.status).toBe('FINISHED');
      third.shutdown();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
