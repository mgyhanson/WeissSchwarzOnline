/**
 * Messages between the browser and the server, as JSON over one WebSocket
 * (path /ws). The server is authoritative: the browser only sends what the
 * player chose, and only ever receives its own seat's player view and
 * events redacted for its seat. The seed stays on the server until the game
 * is over.
 */

import type { Choice, GameEventView, GameResult, PlayerId } from '@wso/game-engine';
import { TEST_DECKS } from '@wso/card-database';
import type { HostUpdate } from './feed';
import type { Replay } from './replay';

export const PROTOCOL_VERSION = 1;
export const WS_PATH = '/ws';

/** Room codes: 6 characters without easily confused ones (no 0/O, 1/I/L). */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
/** Reconnection tokens: 32 hexadecimal characters (128 random bits). */
export const TOKEN_PATTERN = /^[0-9a-f]{32}$/;
export const NAME_MAX = 16;

export type ClientMessage =
  /** Create a room and take seat 0. */
  | { t: 'create'; name: string; deck: string }
  /** Take the free seat of a room. */
  | { t: 'join'; code: string; name: string; deck: string }
  /** Come back to a seat (page reload, lost connection). `game` and `lastUpdate`: the game this page shows and its last update id (0 and -1 for none). */
  | { t: 'resume'; code: string; token: string; game: number; lastUpdate: number }
  /** Change deck while not ready. */
  | { t: 'deck'; deck: string }
  | { t: 'ready'; ready: boolean }
  /** Answer the pending decision of game number `game`. */
  | { t: 'choice'; game: number; decisionId: number; choice: Choice }
  | { t: 'resign'; game: number }
  /** After a game: ask for another one in the same room. */
  | { t: 'rematch' }
  /** Ask for the replay of the finished game `game`. */
  | { t: 'replay'; game: number }
  /** Leave the room for good (concedes a game in progress). */
  | { t: 'leave' }
  | { t: 'ping' };

export type RoomStatus = 'LOBBY' | 'PLAYING' | 'FINISHED';

/** What everyone in the room may know about a seat. The deck is not shared: you do not learn the opponent's deck list from the lobby. */
export interface LobbySeat {
  name: string;
  connected: boolean;
  ready: boolean;
  /** Asked for another game after the last one. */
  rematch: boolean;
  /** Left the room for good. */
  left: boolean;
}

export interface LobbyState {
  code: string;
  status: RoomStatus;
  seats: [LobbySeat | null, LobbySeat | null];
  /** The receiving player's own seat and deck. */
  you: { seat: PlayerId; deck: string };
  /** Number of the current or last game, 0 before the first. */
  game: number;
  /** Result of the last game, while the room is FINISHED. */
  result: GameResult | null;
  /** A player in a game in progress lost connection: the game is held until `at` (ms since epoch), then that player concedes. */
  disconnect: { seat: PlayerId; at: number } | null;
  /** How long a disconnected player has to come back, in ms. */
  graceMs: number;
  /** The last game was ended by the server because this seat stayed disconnected. */
  forfeit: PlayerId | null;
}

export type ErrorCode =
  | 'BAD_MESSAGE'
  | 'NOT_FOUND'
  | 'ROOM_FULL'
  | 'BAD_TOKEN'
  | 'NOT_IN_ROOM'
  | 'ALREADY_IN_ROOM'
  | 'WRONG_STATE'
  | 'NOT_YOUR_DECISION'
  | 'STALE'
  | 'REJECTED'
  | 'RATE_LIMIT'
  | 'SERVER_FULL';

export type ServerMessage =
  /** You have a seat. Keep `token` to come back to it. */
  | { t: 'welcome'; code: string; seat: PlayerId; token: string; protocol: number }
  | { t: 'lobby'; lobby: LobbyState }
  /**
   * The whole current game as your seat sees it: sent when a game starts and
   * when you come back. `events` is every event so far; `updates` the recent
   * steps (only those after the `lastUpdate` you sent, or the latest one).
   * Updates up to `restoredUpTo` need no animation.
   */
  | { t: 'game'; game: number; seat: PlayerId; deck: string; opponent: string; events: GameEventView[]; updates: HostUpdate[]; restoredUpTo: number }
  /** One step of the current game. */
  | { t: 'update'; game: number; update: HostUpdate }
  | { t: 'replay'; game: number; replay: Replay }
  | { t: 'pong' }
  | { t: 'error'; code: ErrorCode; message: string };

const DECK_IDS = new Set(TEST_DECKS.map((deck) => deck.id));

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isInt = (value: unknown, min = 0): value is number => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= 1e9;

/** A display name: trimmed, control characters removed, at most NAME_MAX characters. */
export function cleanName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  // eslint-disable-next-line no-control-regex
  const name = [...value.replace(/[\u0000-\u001f\u007f]/g, '').trim()].slice(0, NAME_MAX).join('');
  return name.length > 0 ? name : fallback;
}

/** Parses one message from a browser. Returns null for anything malformed; never throws. */
export function parseClientMessage(raw: string): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data) || typeof data.t !== 'string') return null;
  const deckOk = (deck: unknown): deck is string => typeof deck === 'string' && DECK_IDS.has(deck);
  switch (data.t) {
    case 'create':
      return deckOk(data.deck) ? { t: 'create', name: cleanName(data.name, ''), deck: data.deck } : null;
    case 'join':
      return typeof data.code === 'string' && CODE_PATTERN.test(data.code.toUpperCase()) && deckOk(data.deck)
        ? { t: 'join', code: data.code.toUpperCase(), name: cleanName(data.name, ''), deck: data.deck }
        : null;
    case 'resume':
      return typeof data.code === 'string' && CODE_PATTERN.test(data.code) && typeof data.token === 'string' && TOKEN_PATTERN.test(data.token) && isInt(data.game) && isInt(data.lastUpdate, -1)
        ? { t: 'resume', code: data.code, token: data.token, game: data.game, lastUpdate: data.lastUpdate }
        : null;
    case 'deck':
      return deckOk(data.deck) ? { t: 'deck', deck: data.deck } : null;
    case 'ready':
      return typeof data.ready === 'boolean' ? { t: 'ready', ready: data.ready } : null;
    case 'choice':
      // The engine checks the choice itself against the pending decision.
      return isInt(data.game, 1) && isInt(data.decisionId) && isRecord(data.choice) ? { t: 'choice', game: data.game, decisionId: data.decisionId, choice: data.choice as unknown as Choice } : null;
    case 'resign':
      return isInt(data.game, 1) ? { t: 'resign', game: data.game } : null;
    case 'replay':
      return isInt(data.game, 1) ? { t: 'replay', game: data.game } : null;
    case 'rematch':
    case 'leave':
    case 'ping':
      return { t: data.t };
    default:
      return null;
  }
}

/** Chinese text for an error the server reports. */
export const ERROR_ZH: Record<ErrorCode, string> = {
  BAD_MESSAGE: '伺服器無法理解這個要求。',
  NOT_FOUND: '找不到這個房間，請檢查房間代碼。房間可能已經解散。',
  ROOM_FULL: '這個房間已經有兩名玩家。',
  BAD_TOKEN: '無法回到之前的座位（連線憑證不正確或已失效）。',
  NOT_IN_ROOM: '你不在任何房間內。',
  ALREADY_IN_ROOM: '你已經在一個房間內。',
  WRONG_STATE: '現在不能這樣做。',
  NOT_YOUR_DECISION: '現在輪到對手決定。',
  STALE: '這個決定已經處理過。',
  REJECTED: '引擎拒絕了這個選擇。',
  RATE_LIMIT: '要求太頻繁，連線已被中斷。',
  SERVER_FULL: '伺服器的房間已滿，請稍後再試。',
};
