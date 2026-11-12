/**
 * Persistence of rooms: the lobby data, and for the current game its seed,
 * deck lists and every answer. Games are rebuilt from these after a restart
 * (the engine is deterministic), so no game state is stored.
 *
 * SqliteStore uses Node's built-in node:sqlite; the database file lives in
 * data.nosync/ (not synced by iCloud, not in Git). MemoryStore is for tests.
 */

import { DatabaseSync } from 'node:sqlite';
import type { PlayerId } from '@wso/game-engine';
import type { Entry, RoomStatus } from './shared';

export interface SeatRecord {
  /** SHA-256 of the seat's reconnection token; the token itself is never stored. */
  tokenHash: string;
  name: string;
  deck: string;
  ready: boolean;
  rematch: boolean;
  left: boolean;
}

export interface RoomRecord {
  code: string;
  createdAt: number;
  lastActivity: number;
  status: RoomStatus;
  seats: [SeatRecord | null, SeatRecord | null];
  /** Number of the current or last game, 0 before the first. */
  game: number;
  /** Secret until the game is over. */
  seed: string | null;
  /** Test deck ids and the 50 card ids of each seat's deck for the current game. */
  deckIds: [string, string] | null;
  deckLists: [string[], string[]] | null;
  /** The seat the server made concede the last game because it stayed disconnected. */
  forfeit: PlayerId | null;
}

export interface StoredRoom {
  room: RoomRecord;
  /** Answers of the current game, in order. */
  entries: Entry[];
}

export interface Store {
  load(): StoredRoom[];
  saveRoom(room: RoomRecord): void;
  addEntry(code: string, game: number, index: number, entry: Entry): void;
  deleteRoom(code: string): void;
  close(): void;
}

export class MemoryStore implements Store {
  private rooms = new Map<string, string>();
  private entries = new Map<string, string[]>();

  load(): StoredRoom[] {
    return [...this.rooms.values()].map((json) => {
      const room = JSON.parse(json) as RoomRecord;
      return { room, entries: (this.entries.get(`${room.code}/${room.game}`) ?? []).map((e) => JSON.parse(e) as Entry) };
    });
  }

  saveRoom(room: RoomRecord): void {
    this.rooms.set(room.code, JSON.stringify(room));
  }

  addEntry(code: string, game: number, index: number, entry: Entry): void {
    const key = `${code}/${game}`;
    const list = this.entries.get(key) ?? [];
    list[index] = JSON.stringify(entry);
    this.entries.set(key, list);
  }

  deleteRoom(code: string): void {
    this.rooms.delete(code);
    for (const key of [...this.entries.keys()]) if (key.startsWith(`${code}/`)) this.entries.delete(key);
  }

  close(): void {}
}

export class SqliteStore implements Store {
  private db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS entries (
        code TEXT NOT NULL, game INTEGER NOT NULL, idx INTEGER NOT NULL, data TEXT NOT NULL,
        PRIMARY KEY (code, game, idx)
      );
    `);
  }

  load(): StoredRoom[] {
    const rooms = this.db.prepare('SELECT data FROM rooms').all() as { data: string }[];
    const entries = this.db.prepare('SELECT data FROM entries WHERE code = ? AND game = ? ORDER BY idx');
    return rooms.map(({ data }) => {
      const room = JSON.parse(data) as RoomRecord;
      const rows = entries.all(room.code, room.game) as { data: string }[];
      return { room, entries: rows.map((row) => JSON.parse(row.data) as Entry) };
    });
  }

  saveRoom(room: RoomRecord): void {
    this.db
      .prepare('INSERT INTO rooms (code, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(code) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
      .run(room.code, JSON.stringify(room), room.lastActivity);
  }

  addEntry(code: string, game: number, index: number, entry: Entry): void {
    this.db.prepare('INSERT OR REPLACE INTO entries (code, game, idx, data) VALUES (?, ?, ?, ?)').run(code, game, index, JSON.stringify(entry));
  }

  deleteRoom(code: string): void {
    this.db.prepare('DELETE FROM entries WHERE code = ?').run(code);
    this.db.prepare('DELETE FROM rooms WHERE code = ?').run(code);
  }

  close(): void {
    this.db.close();
  }
}
