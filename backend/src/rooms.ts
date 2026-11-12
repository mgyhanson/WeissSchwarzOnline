/**
 * Rooms: two seats, a lobby, the game, rematches. No network code here:
 * a connection is anything with send() and close(), so tests drive rooms
 * directly and server.ts wires them to WebSockets.
 *
 * Rules of the platform (not of the game), shown in the interface:
 *  - Room codes are random; anyone with the code can take a free seat.
 *  - Each seat gets a random token kept by the browser; with it the player
 *    comes back to the seat after a reload or a lost connection.
 *  - While a game is in progress and only one player is connected, the
 *    other has graceMs (default 10 minutes) to come back; after that the
 *    server concedes the game for them (CR-1.2.4 concession). If both are
 *    disconnected, the game simply waits.
 *  - Rooms nobody has used for roomTtlMs (default 24 hours) are removed.
 */

import { createHash, randomBytes } from 'node:crypto';
import { type PlayerId, RULES_VERSION } from '@wso/game-engine';
import { TEST_DECKS, deckList } from '@wso/card-database';
import {
  CODE_ALPHABET,
  type ClientMessage,
  type Entry,
  type ErrorCode,
  type LobbyState,
  Match,
  PROTOCOL_VERSION,
  type Replay,
  SeatFeed,
  type ServerMessage,
  parseClientMessage,
} from './shared';
import { MemoryStore, type RoomRecord, type SeatRecord, type Store } from './store';

export interface Conn {
  send(message: ServerMessage): void;
  close(): void;
}

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface RoomManagerOptions {
  store?: Store;
  /** How long a disconnected player has to come back to a game in progress. */
  graceMs?: number;
  /** Rooms without any connection and unused for this long are removed. */
  roomTtlMs?: number;
  maxRooms?: number;
  /** Messages per connection allowed in 10 seconds. */
  rateLimit?: number;
  now?: () => number;
  randomHex?: (bytes: number) => string;
  timers?: Timers;
}

export const DEFAULT_GRACE_MS = 10 * 60 * 1000;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

const SEAT_NAMES = ['玩家 1', '玩家 2'] as const;
const other = (seat: PlayerId): PlayerId => (seat === 0 ? 1 : 0);
const hash = (token: string): string => createHash('sha256').update(token).digest('hex');

function deckOf(id: string): { id: string; name: string; cards: string[] } {
  const deck = TEST_DECKS.find((d) => d.id === id);
  if (!deck) throw new Error(`Unknown deck ${id}`);
  return { id: deck.id, name: deck.name, cards: deckList(deck) };
}

/** One browser connection. */
export class Session {
  room: Room | null = null;
  seat: PlayerId | null = null;
  private recent: number[] = [];

  constructor(
    readonly conn: Conn,
    private readonly manager: RoomManager,
  ) {}

  /** A raw text message from the browser. */
  receive(raw: string): void {
    const now = this.manager.now();
    this.recent = this.recent.filter((t) => t > now - 10_000);
    this.recent.push(now);
    if (this.recent.length > this.manager.rateLimit) {
      this.error('RATE_LIMIT');
      this.conn.close();
      return;
    }
    const message = parseClientMessage(raw);
    if (!message) return this.error('BAD_MESSAGE');
    this.manager.handle(this, message);
  }

  /** The connection closed. */
  closed(): void {
    this.room?.detach(this);
  }

  send(message: ServerMessage): void {
    try {
      this.conn.send(message);
    } catch {
      // A failed send means the connection is going away; closed() follows.
    }
  }

  error(code: ErrorCode, message = ''): void {
    this.send({ t: 'error', code, message });
  }
}

class Room {
  match: Match | null = null;
  feeds: [SeatFeed, SeatFeed] | null = null;
  readonly sessions: [Set<Session>, Set<Session>] = [new Set(), new Set()];
  private timers: [unknown, unknown] = [null, null];
  private deadlines: [number | null, number | null] = [null, null];

  constructor(
    readonly record: RoomRecord,
    private readonly manager: RoomManager,
  ) {}

  get code(): string {
    return this.record.code;
  }

  // ----- Connections ---------------------------------------------------------

  attach(session: Session, seat: PlayerId): void {
    session.room = this;
    session.seat = seat;
    this.sessions[seat].add(session);
    this.updateTimers();
  }

  detach(session: Session): void {
    if (session.seat === null) return;
    this.sessions[session.seat].delete(session);
    session.room = null;
    session.seat = null;
    this.updateTimers();
    this.broadcastLobby();
  }

  connected(seat: PlayerId): boolean {
    return this.sessions[seat].size > 0;
  }

  get empty(): boolean {
    return !this.connected(0) && !this.connected(1);
  }

  /**
   * The hold on a disconnected player runs only while a game is in progress
   * and the opponent is connected and waiting.
   */
  private updateTimers(): void {
    for (const seat of [0, 1] as const) {
      const shouldRun = this.record.status === 'PLAYING' && !this.connected(seat) && this.connected(other(seat));
      if (shouldRun && this.timers[seat] === null) {
        this.deadlines[seat] = this.manager.now() + this.manager.graceMs;
        this.timers[seat] = this.manager.timers.set(() => this.forfeit(seat), this.manager.graceMs);
      } else if (!shouldRun && this.timers[seat] !== null) {
        this.manager.timers.clear(this.timers[seat]);
        this.timers[seat] = null;
        this.deadlines[seat] = null;
      }
    }
  }

  stopTimers(): void {
    for (const seat of [0, 1] as const) {
      if (this.timers[seat] !== null) this.manager.timers.clear(this.timers[seat]);
      this.timers[seat] = null;
      this.deadlines[seat] = null;
    }
  }

  private forfeit(seat: PlayerId): void {
    this.timers[seat] = null;
    this.deadlines[seat] = null;
    if (this.record.status !== 'PLAYING') return;
    this.record.forfeit = seat;
    this.play({ player: seat, resign: true, forfeit: true });
  }

  // ----- Lobby -----------------------------------------------------------------

  lobbyFor(seat: PlayerId): LobbyState {
    const r = this.record;
    const seatView = (s: PlayerId) => {
      const record = r.seats[s];
      return record ? { name: record.name, connected: this.connected(s), ready: record.ready, rematch: record.rematch, left: record.left } : null;
    };
    const waiting = ([0, 1] as const).find((s) => this.deadlines[s] !== null);
    return {
      code: r.code,
      status: r.status,
      seats: [seatView(0), seatView(1)],
      you: { seat, deck: r.seats[seat]?.deck ?? '' },
      game: r.game,
      result: r.status === 'FINISHED' ? (this.match?.state.result ?? null) : null,
      disconnect: waiting === undefined ? null : { seat: waiting, at: this.deadlines[waiting]! },
      graceMs: this.manager.graceMs,
      forfeit: r.status === 'FINISHED' ? r.forfeit : null,
    };
  }

  broadcastLobby(): void {
    for (const seat of [0, 1] as const) {
      for (const session of this.sessions[seat]) session.send({ t: 'lobby', lobby: this.lobbyFor(seat) });
    }
  }

  touch(): void {
    this.record.lastActivity = this.manager.now();
  }

  save(): void {
    this.manager.store.saveRoom(this.record);
  }

  // ----- Games -----------------------------------------------------------------

  /** Builds the match and both feeds for the current game from seed, decks and entries (new game or restart). */
  rebuild(entries: readonly Entry[]): void {
    const r = this.record;
    if (!r.seed || !r.deckLists) return;
    const match = new Match(r.seed, r.deckLists);
    const feeds: [SeatFeed, SeatFeed] = [new SeatFeed(0), new SeatFeed(1)];
    for (const feed of feeds) feed.record(match.setupEvents, match.state);
    for (const entry of entries) {
      const result = match.apply(entry);
      if (!result.ok) throw new Error(`Room ${r.code}: stored answer rejected on rebuild (${result.message})`);
      for (const feed of feeds) feed.record(result.events, match.state);
    }
    this.match = match;
    this.feeds = feeds;
  }

  start(): void {
    const r = this.record;
    const [a, b] = [r.seats[0]!, r.seats[1]!];
    r.game += 1;
    r.seed = this.manager.randomHex(16);
    r.deckIds = [a.deck, b.deck];
    r.deckLists = [deckOf(a.deck).cards, deckOf(b.deck).cards];
    r.status = 'PLAYING';
    r.forfeit = null;
    for (const seat of [a, b]) {
      seat.ready = false;
      seat.rematch = false;
    }
    this.rebuild([]);
    this.touch();
    this.save();
    for (const seat of [0, 1] as const) {
      for (const session of this.sessions[seat]) this.sendGame(session, seat, -1, true);
    }
    this.updateTimers();
    this.broadcastLobby();
  }

  /**
   * The whole current game for one session. `lastUpdate` is the last update
   * this page already has (of this game); -1 for none. A fresh game is
   * animated from its first update; a page that comes back is not.
   */
  sendGame(session: Session, seat: PlayerId, lastUpdate: number, fresh = false): void {
    if (!this.feeds || !this.record.deckIds) return;
    const feed = this.feeds[seat];
    const kept = feed.updates;
    const known = lastUpdate >= 0 && lastUpdate <= feed.lastId && lastUpdate >= (kept[0]?.id ?? 0) - 1;
    const updates = fresh ? kept : known ? kept.filter((u) => u.id > lastUpdate) : kept.slice(-1);
    const restoredUpTo = fresh ? -1 : known ? lastUpdate : feed.lastId;
    session.send({
      t: 'game',
      game: this.record.game,
      seat,
      deck: this.record.deckIds[seat],
      opponent: this.record.seats[other(seat)]?.name ?? '',
      events: [...feed.events],
      updates,
      restoredUpTo,
    });
  }

  /** A concession (by the player, by leaving, or by the server after the disconnection hold): applied, stored and sent to both seats. */
  play(entry: Extract<Entry, { resign: true }>): { ok: true } | { ok: false; code: string; message: string } {
    if (!this.match || !this.feeds) return { ok: false, code: 'WRONG_STATE', message: 'No game' };
    const result = this.match.apply(entry);
    if (!result.ok) return result;
    this.afterApply(entry, result.events);
    return { ok: true };
  }

  /** An answer from a player, checked against the decision pending now. */
  answer(seat: PlayerId, decisionId: number, choice: Extract<Entry, { choice: unknown }>['choice']): { ok: true } | { ok: false; code: string; message: string } {
    if (!this.match) return { ok: false, code: 'WRONG_STATE', message: 'No game' };
    const result = this.match.answer(seat, decisionId, choice);
    if (!result.ok) return result;
    this.afterApply({ player: seat, choice }, result.events);
    return { ok: true };
  }

  private afterApply(entry: Entry, events: Parameters<SeatFeed['record']>[0]): void {
    const r = this.record;
    const match = this.match!;
    this.manager.store.addEntry(r.code, r.game, match.entries.length - 1, entry);
    for (const seat of [0, 1] as const) {
      const update = this.feeds![seat].record(events, match.state);
      for (const session of this.sessions[seat]) session.send({ t: 'update', game: r.game, update });
    }
    this.touch();
    if (match.state.result) {
      r.status = 'FINISHED';
      this.stopTimers();
      this.save();
      this.broadcastLobby();
    }
  }

  replay(): Replay | null {
    const r = this.record;
    if (r.status !== 'FINISHED' || !this.match || !r.seed || !r.deckIds) return null;
    const [a, b] = r.deckIds.map(deckOf) as [ReturnType<typeof deckOf>, ReturnType<typeof deckOf>];
    return {
      format: 'wso-replay',
      version: 1,
      rulesVersion: RULES_VERSION,
      createdAt: new Date(this.manager.now()).toISOString(),
      source: 'online',
      players: [r.seats[0]?.name ?? SEAT_NAMES[0], r.seats[1]?.name ?? SEAT_NAMES[1]],
      seed: r.seed,
      decks: [
        { id: a.id, name: a.name, cards: r.deckLists![0] },
        { id: b.id, name: b.name, cards: r.deckLists![1] },
      ],
      entries: [...this.match.entries],
      result: this.match.state.result,
    };
  }
}

export class RoomManager {
  readonly rooms = new Map<string, Room>();
  readonly store: Store;
  readonly graceMs: number;
  readonly rateLimit: number;
  readonly now: () => number;
  readonly randomHex: (bytes: number) => string;
  readonly timers: Timers;
  private readonly roomTtlMs: number;
  private readonly maxRooms: number;

  constructor(options: RoomManagerOptions = {}) {
    this.store = options.store ?? new MemoryStore();
    this.graceMs = options.graceMs ?? DEFAULT_GRACE_MS;
    this.roomTtlMs = options.roomTtlMs ?? DEFAULT_TTL_MS;
    this.maxRooms = options.maxRooms ?? 500;
    this.rateLimit = options.rateLimit ?? 200;
    this.now = options.now ?? Date.now;
    this.randomHex = options.randomHex ?? ((bytes) => randomBytes(bytes).toString('hex'));
    this.timers = options.timers ?? { set: (fn, ms) => setTimeout(fn, ms), clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>) };
    this.restore();
  }

  /** Rebuilds every stored room (after a restart). A room whose answers no longer fit the engine is reported and dropped. */
  private restore(): void {
    for (const { room: record, entries } of this.store.load()) {
      const room = new Room(record, this);
      try {
        room.rebuild(entries);
        this.rooms.set(record.code, room);
      } catch (error) {
        console.error(String(error));
      }
    }
  }

  connect(conn: Conn): Session {
    return new Session(conn, this);
  }

  /** Removes rooms nobody is connected to that have not been used for the time-to-live. */
  sweep(): void {
    const cutoff = this.now() - this.roomTtlMs;
    for (const room of [...this.rooms.values()]) {
      if (room.empty && room.record.lastActivity < cutoff) this.removeRoom(room);
    }
  }

  shutdown(): void {
    for (const room of this.rooms.values()) room.stopTimers();
    this.store.close();
  }

  private removeRoom(room: Room): void {
    room.stopTimers();
    this.rooms.delete(room.code);
    this.store.deleteRoom(room.code);
  }

  private newCode(): string {
    for (;;) {
      const bytes = Buffer.from(this.randomHex(6), 'hex');
      const code = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
      if (!this.rooms.has(code)) return code;
    }
  }

  private newSeat(name: string, deck: string, seat: PlayerId): { record: SeatRecord; token: string } {
    const token = this.randomHex(16);
    return { token, record: { tokenHash: hash(token), name: name || SEAT_NAMES[seat], deck, ready: false, rematch: false, left: false } };
  }

  private welcome(session: Session, room: Room, seat: PlayerId, token: string): void {
    room.attach(session, seat);
    session.send({ t: 'welcome', code: room.code, seat, token, protocol: PROTOCOL_VERSION });
  }

  handle(session: Session, message: ClientMessage): void {
    switch (message.t) {
      case 'ping':
        return session.send({ t: 'pong' });

      case 'create': {
        if (session.room) return session.error('ALREADY_IN_ROOM');
        if (this.rooms.size >= this.maxRooms) {
          this.sweep();
          if (this.rooms.size >= this.maxRooms) return session.error('SERVER_FULL');
        }
        const now = this.now();
        const { record: seat, token } = this.newSeat(message.name, message.deck, 0);
        const room = new Room(
          { code: this.newCode(), createdAt: now, lastActivity: now, status: 'LOBBY', seats: [seat, null], game: 0, seed: null, deckIds: null, deckLists: null, forfeit: null },
          this,
        );
        this.rooms.set(room.code, room);
        room.save();
        this.welcome(session, room, 0, token);
        return room.broadcastLobby();
      }

      case 'join': {
        if (session.room) return session.error('ALREADY_IN_ROOM');
        const room = this.rooms.get(message.code);
        if (!room) return session.error('NOT_FOUND');
        const free = ([0, 1] as const).find((s) => room.record.seats[s] === null);
        if (room.record.status !== 'LOBBY' || free === undefined) return session.error('ROOM_FULL');
        const { record: seat, token } = this.newSeat(message.name, message.deck, free);
        room.record.seats[free] = seat;
        room.touch();
        room.save();
        this.welcome(session, room, free, token);
        return room.broadcastLobby();
      }

      case 'resume': {
        if (session.room) return session.error('ALREADY_IN_ROOM');
        const room = this.rooms.get(message.code);
        if (!room) return session.error('NOT_FOUND');
        const tokenHash = hash(message.token);
        const seat = ([0, 1] as const).find((s) => room.record.seats[s]?.tokenHash === tokenHash && !room.record.seats[s]!.left);
        if (seat === undefined) return session.error('BAD_TOKEN');
        this.welcome(session, room, seat, message.token);
        room.touch();
        room.broadcastLobby();
        if (room.match) room.sendGame(session, seat, message.game === room.record.game ? message.lastUpdate : -1);
        return;
      }
    }

    const room = session.room;
    const seat = session.seat;
    if (!room || seat === null) return session.error('NOT_IN_ROOM');
    const r = room.record;
    const mine = r.seats[seat]!;
    room.touch();

    switch (message.t) {
      case 'deck':
        if (r.status === 'PLAYING' || mine.ready || mine.rematch) return session.error('WRONG_STATE');
        mine.deck = message.deck;
        room.save();
        return room.broadcastLobby();

      case 'ready':
        if (r.status !== 'LOBBY') return session.error('WRONG_STATE');
        mine.ready = message.ready;
        room.save();
        if (r.seats[0]?.ready && r.seats[1]?.ready) return room.start();
        return room.broadcastLobby();

      case 'choice': {
        if (r.status !== 'PLAYING' || message.game !== r.game) return session.error('STALE');
        const result = room.answer(seat, message.decisionId, message.choice);
        if (!result.ok) return session.error(result.code === 'STALE' || result.code === 'NOT_YOUR_DECISION' ? result.code : 'REJECTED', result.message);
        return;
      }

      case 'resign':
        if (r.status !== 'PLAYING' || message.game !== r.game) return session.error('WRONG_STATE');
        room.play({ player: seat, resign: true });
        return;

      case 'rematch': {
        if (r.status !== 'FINISHED') return session.error('WRONG_STATE');
        mine.rematch = true;
        room.save();
        const [a, b] = r.seats;
        if (a && b && !a.left && !b.left && a.rematch && b.rematch) return room.start();
        return room.broadcastLobby();
      }

      case 'replay': {
        const replay = message.game === r.game ? room.replay() : null;
        if (!replay) return session.error('WRONG_STATE');
        return session.send({ t: 'replay', game: r.game, replay });
      }

      case 'leave': {
        if (r.status === 'PLAYING') room.play({ player: seat, resign: true });
        if (r.status === 'LOBBY') r.seats[seat] = null;
        else mine.left = true;
        for (const s of [...room.sessions[seat]]) room.detach(s);
        const gone = r.seats.every((s) => s === null || s.left);
        if (gone) this.removeRoom(room);
        else room.save();
        return;
      }
    }
  }
}
