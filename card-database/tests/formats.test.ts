/**
 * Deck validation engine (src/formats.ts) against the official deck
 * construction rules: the four basic rules, the title rule of Neo-Standard
 * and the three kinds of restriction (DR-001 to DR-008 of the registry).
 */

import { describe, expect, it } from 'vitest';
import {
  type DeckCount,
  type FormatConfig,
  GUP_TEST_DECK,
  HARUHI_TEST_DECK,
  NEO_STANDARD,
  SAO_TEST_DECK,
  STANDARD,
  TEST_DECKS,
  allCards,
  countDeck,
  expandDeck,
  getCard,
  validateDeck,
} from '../src/index';

const sao = (): DeckCount[] => SAO_TEST_DECK.entries.map((e) => ({ ...e }));
const codes = (entries: readonly DeckCount[], format = NEO_STANDARD) => validateDeck(entries, format).problems.map((p) => p.code);
/** Replaces `count` cards of the deck's first non-climax entry with another card, keeping 50 cards. */
function swapIn(entries: DeckCount[], cardId: string, count: number): DeckCount[] {
  const donor = entries.find((e) => getCard(e.cardId).def.kind !== 'CLIMAX' && e.count >= count && e.cardId !== cardId)!;
  donor.count -= count;
  return [...entries.filter((e) => e.count > 0), { cardId, count }];
}

describe('deck validation: basic rules (デッキ構築ルール ① to ③)', () => {
  it('DR-001: the six test decks are legal Neo-Standard decks and playable', () => {
    for (const deck of TEST_DECKS) {
      const check = validateDeck(deck.entries);
      expect(check.problems, deck.id).toEqual([]);
      expect([check.legal, check.playable, check.stats.total], deck.id).toEqual([true, true, 50]);
      expect(check.titles.length, deck.id).toBeGreaterThan(0);
    }
  });

  it('① exactly 50 cards: 49 and 51 are refused, saying how many are missing or extra', () => {
    const short = sao();
    short[0]!.count -= 1;
    expect(validateDeck(short).problems).toMatchObject([{ code: 'DECK_SIZE' }]);
    expect(validateDeck(short).problems[0]!.message).toContain('還差 1');
    const long = sao();
    long.find((e) => e.count < 4)!.count += 1;
    expect(codes(long)).toContain('DECK_SIZE');
  });

  it('③ at most 8 climaxes: a ninth is refused and the climaxes are named', () => {
    const climax = SAO_TEST_DECK.entries.find((e) => getCard(e.cardId).def.kind === 'CLIMAX' && e.count < 4)!.cardId;
    const deck = swapIn(sao(), climax, 1);
    const problem = validateDeck(deck).problems.find((p) => p.code === 'TOO_MANY_CLIMAXES')!;
    expect(problem.message).toContain('9');
    expect(problem.cardIds.every((id) => getCard(id).def.kind === 'CLIMAX')).toBe(true);
  });

  it('② at most 4 cards with the same card name: a fifth copy is refused and the card is named', () => {
    const four = SAO_TEST_DECK.entries.find((e) => e.count === 4)!.cardId;
    const deck = swapIn(sao(), four, 1);
    const problem = validateDeck(deck).problems.find((p) => p.code === 'TOO_MANY_SAME_NAME')!;
    expect(problem.cardIds).toEqual([four]);
    expect(problem.message).toContain(getCard(four).def.name);
  });

  it('② counts cards with the same name together even when their card numbers differ', () => {
    const byName = new Map<string, string[]>();
    for (const card of allCards()) byName.set(card.def.name, [...(byName.get(card.def.name) ?? []), card.record.cardId]);
    const twins = [...byName.values()].find((ids) => ids.length > 1);
    if (!twins) return; // No same-name pair in the database at the moment.
    const check = validateDeck([
      { cardId: twins[0]!, count: 3 },
      { cardId: twins[1]!, count: 2 },
    ]);
    expect(check.problems.map((p) => p.code)).toContain('TOO_MANY_SAME_NAME');
  });

  it('unknown card numbers and bad counts are reported, never ignored', () => {
    const check = validateDeck([...sao(), { cardId: 'XX/X00-000', count: 1 }, { cardId: SAO_TEST_DECK.entries[0]!.cardId, count: 0 }]);
    expect(check.problems.map((p) => p.code)).toEqual(expect.arrayContaining(['UNKNOWN_CARD', 'BAD_COUNT']));
    expect(check.problems.find((p) => p.code === 'UNKNOWN_CARD')!.cardIds).toEqual(['XX/X00-000']);
    expect(check.legal).toBe(false);
  });

  it('statistics count kinds, colours, levels, triggers and the 作品番号', () => {
    const { stats } = validateDeck(SAO_TEST_DECK.entries);
    expect(stats.total).toBe(50);
    expect(stats.climaxes).toBe(stats.byKind.CLIMAX);
    expect(Object.values(stats.byColor).reduce((a, b) => a + b, 0)).toBe(50);
    expect(Object.values(stats.byLevel).reduce((a, b) => a + b, 0)).toBe(50 - stats.climaxes);
    expect(stats.codes).toEqual(['SAO']);
  });
});

describe('deck validation: titles (ルール ④, タイトルの区分)', () => {
  it('DR-001: Neo-Standard refuses a deck mixing two titles and names them; Standard allows it', () => {
    const gupCard = GUP_TEST_DECK.entries[0]!.cardId;
    const mixed = swapIn(sao(), gupCard, 1);
    const problem = validateDeck(mixed).problems.find((p) => p.code === 'MIXED_TITLES')!;
    expect(problem.message).toContain('ソードアート・オンライン');
    expect(problem.message).toContain('ガールズ＆パンツァー');
    expect(codes(mixed, STANDARD)).toEqual([]);
  });

  it('DR-002: one 作品番号 may belong to several titles: a BDY deck is a deck of BanG Dream! and of VIRTUAL GIRL @ WORLD’S END', () => {
    const bdy = allCards().filter((c) => c.record.cardId.startsWith('BDY/')).slice(0, 2);
    const check = validateDeck(bdy.map((c) => ({ cardId: c.record.cardId, count: 1 })));
    expect(check.titles).toEqual(['BanG Dream!', 'VIRTUAL GIRL @ WORLD’S END']);
    expect(check.problems.map((p) => p.code)).toEqual(['DECK_SIZE']);
  });

  it('a 作品番号 without a title row in the format cannot be judged and says so', () => {
    const narrow: FormatConfig = { ...NEO_STANDARD, titles: NEO_STANDARD.titles.filter((t) => !t.codes.includes('SAO')) };
    expect(codes(SAO_TEST_DECK.entries, narrow)).toEqual(['UNKNOWN_TITLE']);
  });
});

describe('deck validation: restriction list (使用不可, ○枚まで使用可, ○種選抜)', () => {
  it('DR-003: 情報連結解除 (SY/W08-T16) is banned in Neo-Standard (2026年度後期) and not in Standard', () => {
    const deck = swapIn(HARUHI_TEST_DECK.entries.map((e) => ({ ...e })), 'SY/W08-T16', 1);
    const problem = validateDeck(deck).problems.find((p) => p.code === 'BANNED')!;
    expect(problem.cardIds).toEqual(['SY/W08-T16']);
    expect(problem.message).toContain('使用不可');
    expect(codes(deck, STANDARD)).toEqual([]);
  });

  // The restricted cards of the list are not in the database (except SY/W08-T16), so the three
  // kinds of entry are exercised with entries written for cards of the SAO test deck.
  const [a, b, c] = SAO_TEST_DECK.entries.filter((e) => getCard(e.cardId).def.kind === 'CHARACTER').map((e) => e.cardId) as [string, string, string];
  const withList = (restrictions: FormatConfig['restrictions']): FormatConfig => ({ ...NEO_STANDARD, restrictions });
  const countOf = (id: string) => SAO_TEST_DECK.entries.find((e) => e.cardId === id)!.count;

  it('DR-004: ○枚まで使用可 counts all listed numbers of the card together', () => {
    const limit = (max: number) => withList([{ type: 'LIMIT', title: 'ソードアート・オンライン', max, name: 'x', cardIds: [a, 'SAO/S00-000S'] }]);
    expect(codes(SAO_TEST_DECK.entries, limit(countOf(a)))).toEqual([]);
    expect(codes(SAO_TEST_DECK.entries, limit(countOf(a) - 1))).toEqual(['OVER_LIMIT']);
  });

  it('DR-005: ○種選抜 allows one kind of the group (in any number up to four), not two', () => {
    const choice = (ids: string[]) => withList([{ type: 'CHOICE', title: 'ソードアート・オンライン', group: ids.map((id) => ({ name: id, cardIds: [id] })) }]);
    expect(codes(SAO_TEST_DECK.entries, choice([a, 'SAO/S00-001', 'SAO/S00-002']))).toEqual([]);
    const problem = validateDeck(SAO_TEST_DECK.entries, choice([a, b, 'SAO/S00-001'])).problems;
    expect(problem.map((p) => p.code)).toEqual(['CHOICE_GROUP']);
    expect(problem[0]!.cardIds.sort()).toEqual([a, b].sort());
    expect(problem[0]!.message).toContain('3種選抜');
  });

  it('DR-006: a ban with a published exemption does not apply to a deck whose characters all have the trait', () => {
    const traitOfA = getCard(a).def.traits[0]!;
    const ban = (trait: string) => withList([{ type: 'BANNED', title: 'ソードアート・オンライン', name: 'x', cardIds: [c], unlessAllCharactersHaveTrait: trait }]);
    const everyoneHas = SAO_TEST_DECK.entries.every((e) => getCard(e.cardId).def.kind !== 'CHARACTER' || getCard(e.cardId).def.traits.includes(traitOfA));
    expect(codes(SAO_TEST_DECK.entries, ban(traitOfA))).toEqual(everyoneHas ? [] : ['BANNED']);
    expect(codes(SAO_TEST_DECK.entries, ban('no such trait'))).toEqual(['BANNED']);
  });

  it('DR-007: a format records its season, the date it applies from and the date it was checked', () => {
    for (const format of [NEO_STANDARD, STANDARD]) {
      expect(format.source).toMatchObject({ url: 'https://ws-tcg.com/rules/deck_rule/', season: '2026年度後期制限改定', effectiveFrom: '2026-06-27' });
      expect(format.source.checkedOn).toMatch(/^2026-\d\d-\d\d$/);
    }
  });

  it('DR-008: Standard uses the same basic rules without the title rule', () => {
    expect([STANDARD.deckSize, STANDARD.maxClimax, STANDARD.maxSameName, STANDARD.singleTitle]).toEqual([50, 8, 4, false]);
    const short = sao();
    short[0]!.count -= 1;
    expect(codes(short, STANDARD)).toEqual(['DECK_SIZE']);
  });
});

describe('deck validation: cards the engine cannot run yet', () => {
  it('a legal deck holding an unsupported card is legal but not playable, and the card is named', () => {
    const unsupported = allCards().find((card) => card.record.support === 'unsupported' && card.record.cardId.startsWith('GUP/') && card.def.kind === 'CHARACTER')!.record.cardId;
    const deck = swapIn(GUP_TEST_DECK.entries.map((e) => ({ ...e })), unsupported, 1);
    const check = validateDeck(deck);
    expect([check.legal, check.playable]).toEqual([true, false]);
    expect(check.unsupported).toMatchObject([{ code: 'NOT_PLAYABLE', cardIds: [unsupported] }]);
  });

  it('expandDeck and countDeck are inverse', () => {
    const list = expandDeck(SAO_TEST_DECK.entries);
    expect(list).toHaveLength(50);
    expect(countDeck(list)).toEqual(SAO_TEST_DECK.entries);
  });
});
