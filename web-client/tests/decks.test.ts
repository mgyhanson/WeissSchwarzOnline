import { describe, expect, it } from 'vitest';
import { GUP_TEST_DECK, SAO_TEST_DECK, validateDeck } from '@wso/card-database';
import { DECKS_KEY, countIn, createDeck, defaultDeckId, importDeck, loadDecks, playableDecks, saveDecks, setCount, toCode, toCsv, toJson } from '../src/model/decks';

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

const saoDeck = () => createDeck('我的 SAO', 'NEO_STANDARD', SAO_TEST_DECK.entries.map((e) => ({ ...e })));

describe('own decks', () => {
  it('cards are added, their number changed and removed; counts never go below zero', () => {
    let deck = createDeck('  新卡組\u0000  ');
    expect(deck.name).toBe('新卡組');
    deck = setCount(deck, 'SAO/S20-001', 1);
    deck = setCount(deck, 'SAO/S20-001', countIn(deck, 'SAO/S20-001') + 1);
    deck = setCount(deck, 'SAO/S20-004', 3);
    expect(deck.entries).toEqual([
      { cardId: 'SAO/S20-001', count: 2 },
      { cardId: 'SAO/S20-004', count: 3 },
    ]);
    deck = setCount(deck, 'SAO/S20-001', -5);
    expect(deck.entries).toEqual([{ cardId: 'SAO/S20-004', count: 3 }]);
  });

  it('several decks and the default deck survive a reload (saved in the browser)', () => {
    const storage = new MemoryStorage();
    const [a, b] = [saoDeck(), createDeck('第二副', 'STANDARD', [{ cardId: 'GUP/W141-001', count: 4 }])];
    expect(saveDecks(storage, { version: 1, decks: [a, b], defaultDeck: a.id })).toBe(true);
    const loaded = loadDecks(storage);
    expect(loaded.decks).toEqual([a, b]);
    expect(loaded.defaultDeck).toBe(a.id);
    // Damaged storage starts empty instead of failing.
    storage.setItem(DECKS_KEY, '{not json');
    expect(loadDecks(storage).decks).toEqual([]);
    expect(saveDecks(null, loaded)).toBe(false);
  });

  it('JSON, CSV and the deck code each export and import to the same deck', () => {
    const deck = saoDeck();
    for (const text of [toJson(deck), toCsv(deck), `\uFEFF${toCsv(deck)}`, toCode(deck)]) {
      const result = importDeck(text);
      if (!result.ok) throw new Error(result.errors.join('; '));
      expect(result.deck.entries).toEqual(deck.entries);
      expect(validateDeck(result.deck.entries).playable).toBe(true);
    }
    const fromJson = importDeck(toJson(deck));
    expect(fromJson.ok && fromJson.deck.name).toBe('我的 SAO');
    expect(toCsv(deck).split('\n')[0]).toBe('card_id,count,card_name');
  });

  it('an import with an unknown card number or a bad count is refused with the list of problems; nothing is dropped silently', () => {
    const result = importDeck('card_id,count\nSAO/S20-001,4\nXX/X00-999,2\nSAO/S20-004,zero\nSAO/S20-008,0');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(3);
    expect(result.errors[0]).toContain('XX/X00-999');
    expect(importDeck('   ').ok).toBe(false);
    expect(importDeck('WSO-DECK-1:!!!').ok).toBe(false);
    expect(importDeck('{"cards":[{"cardId":"SAO/S20-001","count":1}],"deckFormat":"NO_SUCH"}').ok).toBe(false);
  });

  it('only legal, fully supported own decks are offered for games, before the test decks; an illegal deck is not', () => {
    const legal = saoDeck();
    const short = createDeck('未完成', 'NEO_STANDARD', GUP_TEST_DECK.entries.slice(0, 3));
    const store = { version: 1 as const, decks: [legal, short], defaultDeck: legal.id };
    const decks = playableDecks(store);
    expect(decks[0]).toMatchObject({ id: legal.id, name: '我的 SAO（自製）', own: true });
    expect(decks[0]!.cards).toHaveLength(50);
    expect(decks.some((d) => d.id === short.id)).toBe(false);
    expect(decks.filter((d) => !d.own).map((d) => d.id)).toContain('test-sao');
    expect(defaultDeckId(store, decks)).toBe(legal.id);
    expect(defaultDeckId({ ...store, defaultDeck: short.id }, decks)).toBe(decks.find((d) => !d.own)!.id);
  });
});
