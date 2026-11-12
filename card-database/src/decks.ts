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

const sao = (n: string, count: number): DeckEntry => ({ cardId: `SAO/S20-${n}`, count });
const gup = (n: string, count: number): DeckEntry => ({ cardId: `GUP/W141-${n}`, count });

export const SAO_TEST_DECK: TestDeck = {
  id: 'test-sao',
  name: 'ソードアート・オンライン 黃藍測試卡組',
  title: 'SAO',
  note: 'Made by this project from the SAO/S20 cards in the database (yellow and blue); not an official or tournament list.',
  entries: [
    sao('008', 2), sao('009', 2), sao('014', 2), sao('015', 4), sao('017', 2),
    sao('079', 4), sao('083', 2), sao('084', 2), sao('089', 2),
    sao('001', 4), sao('004', 3), sao('010', 2), sao('085', 2), sao('086', 3),
    sao('022', 1),
    sao('020', 2), sao('093', 1), sao('094', 2),
    sao('023', 1), sao('024', 2), sao('025', 2), sao('098', 2), sao('099', 1),
  ],
};

export const GUP_TEST_DECK: TestDeck = {
  id: 'test-gup',
  name: 'ガールズ＆パンツァー 三色測試卡組',
  title: 'GUP',
  note: 'Made by this project from the GUP/W141 cards in the database (yellow, green and blue); not an official or tournament list.',
  entries: [
    gup('001', 4), gup('010', 3), gup('017', 3), gup('038', 4), gup('044', 3), gup('084', 4), gup('088', 3), gup('104', 3),
    gup('039', 4), gup('048', 3), gup('099', 2),
    gup('041', 3), gup('091', 3),
    gup('025', 2), gup('054', 2), gup('111', 2), gup('113', 2),
  ],
};

const saoNo = (no: string, count: number): DeckEntry => ({ cardId: `SAO/${no}`, count });

export const SAO_MEMORY_TEST_DECK: TestDeck = {
  id: 'test-sao-memory',
  name: 'ソードアート・オンライン 経験・記憶・アラーム 測試卡組',
  title: 'SAO',
  note: 'Made by this project from the second batch of SAO cards in the database (SAO/S20-018, 076, 080 and the SAO_OTHERS set), to exercise 経験, 記憶, アラーム and 次の相手のターンの終わりまで; not an official or tournament list.',
  entries: [
    saoNo('S51-002', 4), saoNo('S71-022', 3), saoNo('S65-073', 2), saoNo('S65-079', 2), saoNo('S80-040', 2), sao('076', 2), sao('018', 2),
    saoNo('S65-083', 3), saoNo('S71-079', 3), saoNo('S71-085', 2), saoNo('S51-014', 3), saoNo('S80-074', 2), sao('080', 2),
    saoNo('S51-010', 3), saoNo('S71-095', 2), saoNo('S71-104', 2), saoNo('S100-019', 3),
    saoNo('S80-097', 4), sao('099', 2), sao('023', 2),
  ],
};

export const TEST_DECKS: readonly TestDeck[] = [HARUHI_TEST_DECK, ICHIKA_TEST_DECK, SAO_TEST_DECK, GUP_TEST_DECK, SAO_MEMORY_TEST_DECK];

/** The deck as a list of 50 card ids, in the order listed. */
export function deckList(deck: TestDeck): string[] {
  return deck.entries.flatMap((entry) => Array.from({ length: entry.count }, () => entry.cardId));
}

/**
 * Neo-Standard restrictions that concern cards in this database, from the
 * official deck construction rules page (https://ws-tcg.com/rules/deck_rule/,
 * 2026 late season, in force from 2026-06-27, page checked 2026-11-11 and
 * again 2026-11-12). Only these entries have been copied so far. The page's
 * only ソードアート・オンライン entry (SAO/S100-011) and its ガールズ＆パンツァー
 * entries (none) concern no card in this database.
 */
export const NEO_STANDARD_BANNED: Readonly<Record<string, string>> = {
  'SY/W08-T16': '情報連結解除 (also SY/W08-097): 使用不可',
};
