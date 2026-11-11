/**
 * Test decks and the deck checks they need.
 *
 * The official fixed lists of the two trial decks are not published online
 * (neither product page lists the counts, checked 2026-11-11), so these
 * decks are compositions made by this project from the trial deck cards.
 * They are NOT the official trial deck recipes.
 *
 * The full deck validator with every format and restriction is STEP 10.
 */

export interface DeckEntry {
  cardId: string;
  count: number;
}

export interface TestDeck {
  id: string;
  name: string;
  /** The Neo-Standard title the deck is built for (CR deck rules, DR-001). */
  title: string;
  note: string;
  entries: DeckEntry[];
}

export const HARUHI_TEST_DECK: TestDeck = {
  id: 'test-haruhi',
  name: '涼宮ハルヒ Trial 卡測試卡組',
  title: 'SY',
  note: 'Made by this project from the 2009 trial deck cards; not the official fixed list. 情報連結解除 (SY/W08-T16) is left out because it is banned in Neo-Standard.',
  entries: [
    { cardId: 'SY/W08-T01', count: 4 },
    { cardId: 'SY/W08-T02', count: 4 },
    { cardId: 'SY/W08-T11', count: 4 },
    { cardId: 'SY/W08-T12', count: 2 },
    { cardId: 'SY/W08-T13', count: 2 },
    { cardId: 'SY/W08-T03', count: 4 },
    { cardId: 'SY/W08-T04', count: 3 },
    { cardId: 'SY/W08-T14', count: 4 },
    { cardId: 'SY/W08-T15', count: 3 },
    { cardId: 'SY/W08-T05', count: 3 },
    { cardId: 'SY/W08-T06', count: 3 },
    { cardId: 'SY/W08-T07', count: 3 },
    { cardId: 'SY/W08-T08', count: 3 },
    { cardId: 'SY/W08-T09', count: 2 },
    { cardId: 'SY/W08-T10', count: 4 },
    { cardId: 'SY/W08-T17', count: 2 },
  ],
};

export const ICHIKA_TEST_DECK: TestDeck = {
  id: 'test-ichika',
  name: '五等分の花嫁 一花 Trial 卡測試卡組',
  title: '5HY',
  note: 'Made by this project from the 2020 Trial Deck+ (一花) cards; not the official fixed list.',
  entries: [
    { cardId: '5HY/W83-T01', count: 4 },
    { cardId: '5HY/W83-T02', count: 2 },
    { cardId: '5HY/W83-T03', count: 3 },
    { cardId: '5HY/W83-T04', count: 4 },
    { cardId: '5HY/W83-T13', count: 3 },
    { cardId: '5HY/W83-T14', count: 2 },
    { cardId: '5HY/W83-T05', count: 3 },
    { cardId: '5HY/W83-T06', count: 3 },
    { cardId: '5HY/W83-T07', count: 3 },
    { cardId: '5HY/W83-T11', count: 2 },
    { cardId: '5HY/W83-T15', count: 2 },
    { cardId: '5HY/W83-T08', count: 2 },
    { cardId: '5HY/W83-T09', count: 3 },
    { cardId: '5HY/W83-T16', count: 3 },
    { cardId: '5HY/W83-T10', count: 2 },
    { cardId: '5HY/W83-T17', count: 1 },
    { cardId: '5HY/W83-T12', count: 4 },
    { cardId: '5HY/W83-T18', count: 4 },
  ],
};

export const TEST_DECKS: readonly TestDeck[] = [HARUHI_TEST_DECK, ICHIKA_TEST_DECK];

/** The deck as a list of 50 card ids, in the order listed. */
export function deckList(deck: TestDeck): string[] {
  return deck.entries.flatMap((entry) => Array.from({ length: entry.count }, () => entry.cardId));
}

/**
 * Neo-Standard restrictions that concern cards in this database, from the
 * official deck construction rules page (https://ws-tcg.com/rules/deck_rule/,
 * 2026 late season, in force from 2026-06-27, page checked 2026-11-11).
 * Only these entries have been copied so far.
 */
export const NEO_STANDARD_BANNED: Readonly<Record<string, string>> = {
  'SY/W08-T16': '情報連結解除 (also SY/W08-097): 使用不可',
};
