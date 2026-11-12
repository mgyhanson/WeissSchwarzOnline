/**
 * Replay files. A replay is the seed, both deck lists and every answer, so
 * it reveals every hidden card of the game: it is only handed out once the
 * game is over (docs/02-architecture.md section 8).
 *
 * The deck lists are stored card by card, so a replay still works after the
 * test decks change. If the rules engine or the card data changed in a way
 * that changes the game, an answer no longer fits and checkReplay says so.
 */

import type { GameResult, PlayerId } from '@wso/game-engine';
import { getCard } from '@wso/card-database';
import { type Entry, Match } from './match';

export interface ReplayDeck {
  /** Test deck id, for display. */
  id: string;
  name: string;
  /** The 50 card ids. */
  cards: string[];
}

export interface Replay {
  format: 'wso-replay';
  version: 1;
  /** Rules version of the engine that played the game, e.g. "JP-1.114". */
  rulesVersion: string;
  /** ISO time the replay was made. */
  createdAt: string;
  /** Where it was played: a local game against the computer or an online room. */
  source: 'local' | 'online';
  /** Display names of the two seats. */
  players: [string, string];
  seed: string;
  decks: [ReplayDeck, ReplayDeck];
  entries: Entry[];
  result: GameResult | null;
}

export type ReplayCheck = { ok: true; replay: Replay } | { ok: false; message: string };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isSeat = (value: unknown): value is PlayerId => value === 0 || value === 1;

/**
 * Checks a replay read from a file: its shape, that every card exists, and
 * that every answer is accepted by the engine in order. Never throws.
 */
export function checkReplay(data: unknown): ReplayCheck {
  if (!isRecord(data) || data.format !== 'wso-replay') return { ok: false, message: '這不是本模擬器的重播檔。' };
  if (data.version !== 1) return { ok: false, message: `不支援這個重播檔版本（${String(data.version)}）。` };
  if (typeof data.seed !== 'string' || data.seed.length === 0 || data.seed.length > 200) return { ok: false, message: '重播檔缺少種子。' };
  const decks = data.decks;
  if (!Array.isArray(decks) || decks.length !== 2) return { ok: false, message: '重播檔的卡組資料不完整。' };
  for (const deck of decks as unknown[]) {
    if (!isRecord(deck) || !Array.isArray(deck.cards) || deck.cards.length !== 50 || !deck.cards.every((c) => typeof c === 'string')) {
      return { ok: false, message: '重播檔的卡組必須各有 50 張卡。' };
    }
    for (const cardId of deck.cards as string[]) {
      try {
        getCard(cardId);
      } catch {
        return { ok: false, message: `重播檔用了資料庫沒有的卡：${cardId}` };
      }
    }
  }
  if (!Array.isArray(data.entries) || data.entries.length > 20_000) return { ok: false, message: '重播檔的行動紀錄不完整。' };
  for (const entry of data.entries as unknown[]) {
    if (!isRecord(entry) || !isSeat(entry.player) || !(isRecord(entry.choice) || entry.resign === true)) {
      return { ok: false, message: '重播檔的行動紀錄格式不正確。' };
    }
  }
  const replay = data as unknown as Replay;
  const match = new Match(replay.seed, [replay.decks[0].cards, replay.decks[1].cards]);
  for (const [i, entry] of replay.entries.entries()) {
    const result = match.apply(entry);
    if (!result.ok) return { ok: false, message: `第 ${i + 1} 個行動不符合目前的規則引擎或卡牌資料（${result.message}），無法重播。` };
  }
  return { ok: true, replay };
}

export function replayFileName(replay: Replay): string {
  return `ws-replay-${replay.createdAt.replace(/[:.]/g, '-').slice(0, 19)}.json`;
}
