/**
 * The player's own decks: kept in this browser (localStorage), with import
 * and export as JSON, CSV or a deck code. Legality is decided by the deck
 * validation engine of the card database (card-database/src/formats.ts),
 * never here.
 */

import { type DeckCount, TEST_DECKS, deckList, countDeck, expandDeck, getCard, getFormat, validateDeck } from '@wso/card-database';

export const DECKS_KEY = 'wso.decks.v1';
const CODE_PREFIX = 'WSO-DECK-1:';

export interface SavedDeck {
  id: string;
  name: string;
  /** Format id, e.g. NEO_STANDARD. */
  format: string;
  entries: DeckCount[];
  updatedAt: string;
}

export interface DeckStore {
  version: 1;
  decks: SavedDeck[];
  /** The deck preselected when starting a game: a saved deck id or a test deck id. */
  defaultDeck: string | null;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function loadDecks(storage: StorageLike | null): DeckStore {
  try {
    const raw = storage?.getItem(DECKS_KEY);
    if (raw) {
      const data = JSON.parse(raw) as DeckStore;
      if (data.version === 1 && Array.isArray(data.decks)) return { version: 1, decks: data.decks.filter(isSavedDeck), defaultDeck: data.defaultDeck ?? null };
    }
  } catch {
    // Unreadable storage: start empty rather than fail.
  }
  return { version: 1, decks: [], defaultDeck: null };
}

/** Returns false when the browser refused to save (storage full or blocked). */
export function saveDecks(storage: StorageLike | null, store: DeckStore): boolean {
  try {
    storage?.setItem(DECKS_KEY, JSON.stringify(store));
    return storage !== null;
  } catch {
    return false;
  }
}

function isSavedDeck(value: unknown): value is SavedDeck {
  const d = value as SavedDeck;
  return !!d && typeof d.id === 'string' && typeof d.name === 'string' && typeof d.format === 'string' && Array.isArray(d.entries) && d.entries.every((e) => typeof e.cardId === 'string' && Number.isInteger(e.count));
}

export function newDeckId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `deck-${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export function cleanDeckName(name: string): string {
  // eslint-disable-next-line no-control-regex
  return [...name.replace(/[\u0000-\u001f\u007f]/g, '').trim()].slice(0, 40).join('') || '未命名卡組';
}

export function createDeck(name: string, format = 'NEO_STANDARD', entries: DeckCount[] = []): SavedDeck {
  return { id: newDeckId(), name: cleanDeckName(name), format, entries: normalise(entries), updatedAt: new Date().toISOString() };
}

/** One row per card, counts added up, rows with no cards dropped. */
export function normalise(entries: readonly DeckCount[]): DeckCount[] {
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(e.cardId, (counts.get(e.cardId) ?? 0) + e.count);
  return [...counts].filter(([, count]) => count > 0).map(([cardId, count]) => ({ cardId, count }));
}

/** Sets how many of a card the deck holds (0 removes it). */
export function setCount(deck: SavedDeck, cardId: string, count: number): SavedDeck {
  const n = Math.max(0, Math.min(99, Math.floor(count)));
  const has = deck.entries.some((e) => e.cardId === cardId);
  const entries = has ? deck.entries.map((e) => (e.cardId === cardId ? { cardId, count: n } : e)).filter((e) => e.count > 0) : n > 0 ? [...deck.entries, { cardId, count: n }] : deck.entries;
  return { ...deck, entries, updatedAt: new Date().toISOString() };
}

export const countIn = (deck: SavedDeck, cardId: string): number => deck.entries.find((e) => e.cardId === cardId)?.count ?? 0;

// ----- Decks a game can use: the project's test decks and the player's own -----

export interface PlayableDeck {
  /** Test deck id, or the id of a saved deck. */
  id: string;
  name: string;
  /** The 50 card ids. */
  cards: string[];
  own: boolean;
}

export function playableDecks(store: DeckStore): PlayableDeck[] {
  const own = store.decks
    .filter((d) => validateDeck(d.entries, getFormat(d.format)).playable)
    .map((d): PlayableDeck => ({ id: d.id, name: d.name.endsWith('（自製）') ? d.name : `${d.name}（自製）`, cards: expandDeck(d.entries), own: true }));
  return [...own, ...TEST_DECKS.map((d): PlayableDeck => ({ id: d.id, name: d.name, cards: deckList(d), own: false }))];
}

export function defaultDeckId(store: DeckStore, decks: readonly PlayableDeck[]): string {
  return decks.find((d) => d.id === store.defaultDeck)?.id ?? decks.find((d) => !d.own)?.id ?? decks[0]!.id;
}

// ----- Export ----------------------------------------------------------------

export function toJson(deck: SavedDeck): string {
  return JSON.stringify({ format: 'wso-deck', version: 1, name: deck.name, deckFormat: deck.format, cards: deck.entries.map((e) => ({ cardId: e.cardId, count: e.count, name: nameOf(e.cardId) })) }, null, 2);
}

export function toCsv(deck: SavedDeck): string {
  const quote = (text: string) => `"${text.replace(/"/g, '""')}"`;
  return ['card_id,count,card_name', ...deck.entries.map((e) => `${e.cardId},${e.count},${quote(nameOf(e.cardId))}`)].join('\n');
}

/** A compact text code for pasting: the prefix, then the deck as base64url JSON. */
export function toCode(deck: SavedDeck): string {
  const json = JSON.stringify({ n: deck.name, f: deck.format, c: deck.entries.map((e) => [e.cardId, e.count]) });
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return CODE_PREFIX + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function nameOf(cardId: string): string {
  try {
    return getCard(cardId).def.name;
  } catch {
    return '';
  }
}

// ----- Import ----------------------------------------------------------------

export type ImportResult = { ok: true; deck: SavedDeck } | { ok: false; errors: string[] };

/**
 * Reads a deck from JSON, CSV or a deck code (detected from the text).
 * A card number the database does not have, or a bad count, is an error
 * that is listed; nothing is dropped silently.
 */
export function importDeck(text: string, fallbackName = '匯入的卡組'): ImportResult {
  const trimmed = text.replace(/^﻿/, '').trim();
  if (trimmed.length === 0) return { ok: false, errors: ['沒有內容。'] };
  if (trimmed.length > 200_000) return { ok: false, errors: ['內容太長，不是卡組資料。'] };
  let name = fallbackName;
  let format = 'NEO_STANDARD';
  let rows: { cardId: string; count: unknown; line: string }[] = [];
  try {
    if (trimmed.startsWith(CODE_PREFIX)) {
      const b64 = trimmed.slice(CODE_PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
      const binary = atob(b64);
      const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (ch) => ch.charCodeAt(0)))) as { n?: string; f?: string; c?: [string, number][] };
      name = data.n ?? name;
      format = data.f ?? format;
      rows = (data.c ?? []).map(([cardId, count]) => ({ cardId: String(cardId), count, line: String(cardId) }));
    } else if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      const data = JSON.parse(trimmed) as { name?: string; deckFormat?: string; cards?: { cardId?: string; count?: number }[] } | { cardId?: string; count?: number }[];
      const cards = Array.isArray(data) ? data : (data.cards ?? []);
      if (!Array.isArray(data)) {
        name = data.name ?? name;
        format = data.deckFormat ?? format;
      }
      rows = cards.map((c) => ({ cardId: String(c.cardId ?? ''), count: c.count, line: JSON.stringify(c) }));
    } else {
      for (const line of trimmed.split(/\r?\n/)) {
        if (line.trim() === '' || /^card_?id\s*,/i.test(line.trim())) continue;
        const cells = line.split(',');
        rows.push({ cardId: (cells[0] ?? '').trim(), count: Number((cells[1] ?? '').trim()), line });
      }
    }
  } catch {
    return { ok: false, errors: ['無法讀取：格式不是 JSON、CSV 或卡組代碼。'] };
  }
  if (rows.length === 0) return { ok: false, errors: ['沒有任何卡牌。'] };

  const errors: string[] = [];
  try {
    getFormat(format);
  } catch {
    errors.push(`不認識的賽制「${format}」。`);
  }
  const entries: DeckCount[] = [];
  for (const row of rows) {
    if (!Number.isInteger(row.count) || (row.count as number) < 1 || (row.count as number) > 99) {
      errors.push(`張數不正確：${row.line}`);
      continue;
    }
    try {
      getCard(row.cardId);
    } catch {
      errors.push(`資料庫沒有這個卡號：${row.cardId || row.line}`);
      continue;
    }
    entries.push({ cardId: row.cardId, count: row.count as number });
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, deck: createDeck(name, format, entries) };
}

export { countDeck };
