import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NEO_STANDARD_BANNED, SETS, TEST_DECKS, allCards, deckList, getCard, toCardDef, unverifiedTriggerIcons } from '../src/index';

const testsDir = fileURLToPath(new URL('.', import.meta.url));

describe('official data', () => {
  it('is stored exactly as read from the official card list (checksum of the compact card list)', () => {
    for (const set of SETS) {
      const hash = createHash('sha256').update(JSON.stringify(set.official.cards)).digest('hex');
      expect(hash, set.id).toBe(set.official.source.sha256OfCompactCards);
    }
  });

  it('every hand-written record belongs to an official card of its set, and every official card is in the database exactly once', () => {
    for (const set of SETS) {
      const official = new Set(set.official.cards.map((c) => c.no));
      expect(set.records.filter((r) => !official.has(r.cardId)), set.id).toEqual([]);
      expect(new Set(set.records.map((r) => r.cardId)).size, set.id).toBe(set.records.length);
      expect(official.size, set.id).toBe(set.official.cards.length);
    }
    const all = SETS.flatMap((set) => set.official.cards.map((c) => c.no));
    expect(new Set(all).size).toBe(all.length);
    expect(allCards().map((c) => c.record.cardId).sort()).toEqual([...all].sort());
  });

  it('a card nobody wrote by hand is either compiled from tested sentence patterns or marked unsupported, never in between', () => {
    for (const card of allCards()) {
      const { origin, support, abilities, effect } = card.record;
      if (origin === 'NONE') {
        expect([support, abilities, effect], card.record.cardId).toEqual(['unsupported', undefined, undefined]);
        expect(card.def.abilities, card.record.cardId).toBeUndefined();
      } else if (origin === 'PATTERN') {
        expect(support, card.record.cardId).toBe('verified');
        expect(card.record.explanation.zh.length, card.record.cardId).toBeGreaterThan(0);
      }
    }
  });

  it('every card number starts with the code of its imported set', () => {
    for (const set of SETS) {
      const code = set.official.source.expansion ? set.official.cards[0]!.no.split('-')[0] : null;
      if (code) expect(set.official.cards.filter((c) => !c.no.startsWith(`${code}-`)), set.id).toEqual([]);
    }
  });

  it('converts the printed information of the official data (spot checks against the published card list)', () => {
    expect(getCard('SY/W08-T07').def).toMatchObject({ name: 'クラッカー ハルヒ', kind: 'CHARACTER', color: 'red', level: 2, cost: 2, power: 9000, soul: 2, triggers: ['SOUL'], traits: ['団長', 'SOS団'], counter: false });
    expect(getCard('SY/W08-T16').def).toMatchObject({ kind: 'EVENT', color: 'blue', level: 2, cost: 0, power: null, soul: null, traits: [], triggers: [], counter: true });
    expect(getCard('SY/W08-T10').def).toMatchObject({ kind: 'CLIMAX', color: 'red', level: null, cost: null, triggers: ['COMEBACK'] });
    expect(getCard('5HY/W83-T12').def).toMatchObject({ kind: 'CLIMAX', color: 'yellow', triggers: ['SOUL', 'RETURN'] });
    expect(getCard('5HY/W83-T07').def).toMatchObject({ level: 1, cost: 1, power: 1000, soul: 1, triggers: ['SOUL'], counter: true, traits: ['五つ子', 'オシャレ'] });
    expect(getCard('5HY/W83-T10').def).toMatchObject({ level: 3, cost: 2, power: 10000, soul: 2 });
  });

  it('a character printed without a soul icon has soul 0 (the card list shows "－"), e.g. STS/W140-008', () => {
    expect(getCard('STS/W140-008').official.soul).toBe('－');
    expect(getCard('STS/W140-008').def).toMatchObject({ kind: 'CHARACTER', soul: 0, power: 2000 });
  });

  it('refuses data it cannot read rather than guessing', () => {
    const card = getCard('SY/W08-T01').official;
    expect(() => toCardDef({ ...card, kind: '9' })).toThrow(/unknown card kind/);
    expect(() => toCardDef({ ...card, trigger: '[[mystery.gif]]' })).toThrow(/not been verified/);
    // Lenient reading is only for cards that are then unsupported: the unknown icon is left out and reported.
    expect(toCardDef({ ...card, trigger: '[[soul.gif]][[mystery.gif]]' }, true).triggers).toEqual(['SOUL']);
    expect(unverifiedTriggerIcons({ ...card, trigger: '[[soul.gif]][[mystery.gif]]' })).toEqual(['mystery.gif']);
    expect(() => toCardDef({ ...card, color: '[[pink.gif]]' })).toThrow(/colour/);
    expect(() => toCardDef({ ...card, power: '3,000' })).toThrow(/power/);
  });
});

describe('records', () => {
  it('every card has a Chinese explanation marked as AI-assisted and unverified, kept apart from the official text', () => {
    for (const card of allCards()) {
      // A card that is not supported yet has no explanation yet either (the interface says so); every playable card has one.
      if (card.record.support === 'verified') expect(card.record.explanation.zh.length, card.record.cardId).toBeGreaterThan(0);
      expect(card.record.explanation).toMatchObject({ source: 'AI_ASSISTED', status: '待核實' });
    }
  });

  it('a card with text has ability data, a card without text has none', () => {
    for (const card of allCards().filter((c) => c.record.support === 'verified')) {
      const hasText = card.official.text !== '-';
      const hasData = (card.record.abilities?.length ?? 0) > 0 || (card.record.effect?.length ?? 0) > 0;
      expect(hasData, card.record.cardId).toBe(hasText);
    }
    // A card with text that is not written yet is unsupported, never treated as a card without text.
    for (const card of allCards().filter((c) => c.record.origin === 'NONE')) expect(card.official.text, card.record.cardId).not.toBe('-');
  });

  it('every card marked verified is named in at least one card test', () => {
    const titles = readdirSync(testsDir)
      .filter((file) => file.startsWith('cards-') && file.endsWith('.test.ts'))
      .map((file) => readFileSync(join(testsDir, file), 'utf8'))
      .join('\n');
    // Cards compiled from sentence patterns are tested card by card in patterns.test.ts.
    const missing = allCards()
      .filter((card) => card.record.support === 'verified' && !card.record.origin)
      .map((card) => card.record.cardId)
      .filter((id) => !new RegExp(`(?:it|describe)\\(\\s*'[^']*${id.replace('/', '\\/')}(?!\\d)`).test(titles));
    expect(missing).toEqual([]);
  });
});

describe('test decks', () => {
  for (const deck of TEST_DECKS) {
    it(`${deck.id} is a legal Neo-Standard deck (DR-001 and CR-5.1.2)`, () => {
      const list = deckList(deck);
      // CR-5.1.2.1
      expect(list).toHaveLength(50);
      // CR-5.1.2.2: at most four cards with the same name.
      const byName = new Map<string, number>();
      for (const id of list) byName.set(getCard(id).def.name, (byName.get(getCard(id).def.name) ?? 0) + 1);
      expect(Math.max(...byName.values())).toBeLessThanOrEqual(4);
      // CR-5.1.2.3: at most eight climaxes.
      expect(list.filter((id) => getCard(id).def.kind === 'CLIMAX').length).toBeLessThanOrEqual(8);
      // DR-001: one title, given by the card number prefix.
      expect(new Set(list.map((id) => id.split('/')[0]))).toEqual(new Set([deck.title]));
      // Restricted cards.
      expect(list.filter((id) => NEO_STANDARD_BANNED[id])).toEqual([]);
      // Only cards the engine fully supports.
      expect(list.filter((id) => getCard(id).record.support !== 'verified')).toEqual([]);
    });
  }
});
