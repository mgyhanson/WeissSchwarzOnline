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
    // Level 0 (16)
    // 102 and 032 (batch 12): ＋Ｘ by the soul of the character chosen; the deck or the waiting room declared
    // 103 (batch 13): its search needs the draw-icon climax 遅滞戦術 (113)
    gup('001', 3), gup('103', 1), gup('038', 4), gup('084', 4), gup('102', 2), gup('032', 2),
    // Level 1 (12)
    // 089 (batch 9): its CX combo names 冬ごもりの準備 (112)
    // 107, 020 and 098 (batch 12): 107 needs the draw-icon climax 遅滞戦術 (113); 020 brings back a character of level Ｘ or lower
    // 024 (batch 13): the event 転校先の選択
    gup('039', 3), gup('024', 1), gup('107', 2), gup('089', 1), gup('099', 2), gup('096', 1), gup('098', 1), gup('020', 1),
    // Level 2 (8)
    gup('041', 3), gup('091', 3), gup('040', 2),
    // Level 3 (6), updated 2026-11-15 when these became playable
    gup('004', 1), gup('003', 1), gup('036', 1), gup('031', 1), gup('092', 1), gup('101', 1),
    // Climaxes
    gup('025', 2), gup('054', 2), gup('112', 2), gup('113', 2),
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

const bdy = (n: string, count: number): DeckEntry => ({ cardId: `BDY/W135-${n}`, count });

export const BDY_TEST_DECK: TestDeck = {
  id: 'test-bdy',
  name: 'BanG Dream! [夢限大みゅーたいぷ] 三色測試卡組',
  title: 'BDY',
  note: 'Made by this project from the BDY/W135 cards the engine supports (yellow, red and blue): characters of every level, Level 3 included (hand-written and read by the sentence grammar), and four of the booster\'s climaxes; not an official or tournament list.',
  entries: [
    // Level 0
    // 085 (batch 10): the opponent swaps a character for one of lower level from their waiting room
    // 043 (batch 12): its CX combo names ✞animaるパーティ✞開催中✞ (064)
    // 084 (batch 13): the opponent chooses which of the two found goes to the waiting room
    bdy('013', 3), bdy('084', 1), bdy('035', 2), bdy('043', 2), bdy('047', 2), bdy('001', 2), bdy('070', 2), bdy('085', 2),
    // Level 1 (12)
    // 025 is the event 夢限大みゅーたいぷ (batch 8)
    // 014 (batch 12): pays with the choice-icon climax 愛は衝動 (026)
    // 031 (batch 13): its CX combo names TearJerker (062)
    // 005 and 058 (batch 14): two trigger checks with コハク (not in this deck: only its 【永】 works here); rested at the encore step
    bdy('087', 2), bdy('005', 1), bdy('031', 1), bdy('006', 1), bdy('058', 1), bdy('019', 1), bdy('014', 2), bdy('036', 2), bdy('025', 1),
    // Level 2 (8)
    // 061 (batch 10) is the event アメアメいざない大さくせん
    bdy('020', 3), bdy('051', 1), bdy('061', 1), bdy('089', 1), bdy('039', 1), bdy('021', 1),
    // Level 3 (6)
    bdy('041', 1), bdy('094', 1), bdy('003', 1), bdy('023', 1), bdy('024', 1), bdy('080', 1),
    // Climaxes: 愛は衝動 and TearJerker (named by 013 and by the 集中 of 036), ✞animaるパーティ✞開催中✞, 臨兵闘ｼｬ！皆陣烈在ぜ～ん
    bdy('026', 2), bdy('062', 2), bdy('064', 2), bdy('097', 2),
  ],
};

const entriesOf = (prefix: string, list: Record<string, number>): DeckEntry[] => Object.entries(list).map(([n, count]) => ({ cardId: `${prefix}-${n}`, count }));

export const STS_TEST_DECK: TestDeck = {
  id: 'test-sts',
  name: 'ステラソラ 三色測試卡組',
  title: 'STS',
  note: 'Made by this project from the STS/W140 cards the engine supports (green, red and blue): supported characters of the booster of every level, Level 3 included, and two of its climaxes; not an official or tournament list.',
  entries: entriesOf('STS/W140', {
    // Level 0 (18)
    // 008 and 014 (batch 8): the attacking character's soul, moving the opponent's characters
    // 016, 040 and 077 (batch 9): the cards put into the waiting room from the deck, front-attacked, memory
    // 001 (batch 14): 加速's cost (a waiting-room card under the clock); its 【起】 uses the 回想 of 077
    // 039 (batch 15): a 《巡遊者》 character played from the waiting room
    '025': 2, '039': 1, '001': 1, '045': 2, '008': 2, '054': 2, '014': 2, '073': 1, '016': 1, '040': 1, '077': 1,
    // Level 1 (14)
    // 063 (batch 10) is the counter event 星ノ塔スタッフ ベアトリス
    // 019 (batch 13): gives 黎明告げる凱旋歌 (031) the bounce icon
    // 060 (batch 14): needs a standby climax (none in this deck) and a marker
    '011': 1, '060': 1, '027': 2, '041': 3, '043': 2, '063': 1, '048': 3, '019': 1,
    // Level 2 (8)
    // 013 (batch 13): looks at the opponent's deck
    '022': 2, '023': 2, '052': 2, '093': 1, '013': 1,
    // Level 3 (4)
    '028': 1, '004': 1, '003': 1, '070': 1,
    // Climaxes: 黎明告げる凱旋歌 (green), その願い、たしかに届けたよ (red)
    '031': 4, '067': 4,
  }),
};

export const ANM_TEST_DECK: TestDeck = {
  id: 'test-anm',
  name: 'anemoi 四色測試卡組',
  title: 'ANM',
  note: 'Made by this project from the ANM/W138 cards the engine supports: supported characters of the booster of every level, Level 3 included, two supported events and three climaxes; not an official or tournament list.',
  entries: entriesOf('ANM/W138', {
    // Level 0 (16)
    // 080 and 090 (batch 9)
    // 001 and 008 (batch 13): 集中 with a cost inside; a level 0 character milled goes to the back row
    '004': 3, '016': 3, '028': 2, '027': 2, '062': 2, '080': 1, '090': 1, '001': 1, '008': 1,
    // Level 1 (13)
    // 029, 030 and the event 046 (batch 9): 030 looks for 029, whose CX combo names 嘘つきなさよなら (048)
    // 087 and 084 (batch 11): 087 changes places with 084 from memory during the attack phase
    // 069 and 083 (batch 12): ＋Ｘ by the opponent's characters; －Ｘ by the other 《風》 characters
    // 019 (batch 13): 加速 (a waiting-room card under the clock)
    // 007 (batch 14): its CX combo names わけ与える命 (not in this deck); its 【永】 works
    '020': 1, '041': 1, '057': 1, '029': 2, '030': 1, '046': 1, '087': 1, '084': 1, '069': 1, '083': 1, '019': 1, '007': 1,
    // Level 2 (7)
    '042': 2, '064': 2, '094': 1, '095': 2,
    // Level 3 (6): five characters and the event
    // 079 (batch 11): from memory it changes places with a character named 愛乃
    '003': 1, '079': 1, '014': 1, '058': 1, '002': 1, '074': 1,
    // Climaxes: 見つけた、大切な人 (yellow), 好きの数だけ金平糖 (red), 嘘つきなさよなら (green)
    '024': 4, '075': 2, '048': 2,
  }),
};

export const NIK_TEST_DECK: TestDeck = {
  id: 'test-nik',
  name: '勝利の女神：NIKKE 四色測試卡組',
  title: 'NIK',
  note: 'Made by this project from the NIK/S135 cards the engine supports: supported characters of every level, Level 3 included, and two climaxes; not an official or tournament list.',
  entries: entriesOf('NIK/S135', {
    // Level 0 (18)
    // 012 is the card NIK/S135-104 lets Choice (the climax 024) take back
    // 099 (batch 9): one card from each deck, the levels compared
    // 016 and 017 (batch 10): 絆 with two names, the waiting room at the start of the first turn
    // 037 and 044 (batch 13): Ｘ from the waiting room; two effects in the order the player chooses
    // 018 (batch 14): exchanges OLD TALES (053) between the deck and the hand
    '011': 2, '029': 2, '037': 1, '044': 1, '031': 1, '018': 1, '099': 1, '012': 2, '059': 1, '016': 1, '083': 2, '087': 1, '017': 1, '093': 1,
    // Level 1 (12)
    // 101 (batch 12): ＋Ｘ by your level
    '008': 4, '072': 1, '101': 1, '104': 2, '073': 2, '074': 2,
    // Level 2 (8)
    '014': 2, '041': 2, '042': 2, '105': 2,
    // Level 3 (4)
    // 030 (batch 15): its CX combo names OLD TALES (053)
    '035': 1, '034': 1, '107': 1, '030': 1,
    // Climaxes: yellow and green
    '024': 4, '053': 4,
  }),
};

export const TEST_DECKS: readonly TestDeck[] = [
  HARUHI_TEST_DECK,
  ICHIKA_TEST_DECK,
  SAO_TEST_DECK,
  GUP_TEST_DECK,
  SAO_MEMORY_TEST_DECK,
  BDY_TEST_DECK,
  STS_TEST_DECK,
  ANM_TEST_DECK,
  NIK_TEST_DECK,
];

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
