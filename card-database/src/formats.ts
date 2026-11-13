/**
 * Deck construction formats and the deck validation engine.
 *
 * Nothing here is a guess: the numbers and lists are copied from the
 * official deck construction page, https://ws-tcg.com/rules/deck_rule/
 * (read 2026-11-13):
 *
 *  基本的なデッキ構築ルール
 *   ① exactly 50 cards            ② at most 4 cards with the same card name
 *   ③ at most 8 climax cards      ④ (Neo-Standard) cards of one title only
 *
 *  タイトルの区分: a title is a set of 作品番号 (the part of the card number
 *  before the slash). One 作品番号 can belong to several titles: BDY is in
 *  both 「BanG Dream!」 and 「VIRTUAL GIRL @ WORLD'S END」.
 *
 *  カードの使用制限 (2026年度後期制限改定, in force from 2026-06-27):
 *   使用不可 = banned; ○枚まで使用可 = at most N copies; ○種選抜 = of the
 *   group, at most one kind may be in the deck.
 *
 * Only the titles and restriction entries that concern cards in this
 * database are copied (see TITLES and the restriction lists below); a new
 * title needs its row and its entries added here, with the date checked.
 * Formats are data: a new season is a new FormatConfig with its own date.
 */

import { getCard } from './index';

export interface TitleConfig {
  /** Official title name. */
  name: string;
  /** 作品番号 whose cards may be used in a deck of this title. */
  codes: string[];
}

export type Restriction =
  /** 使用不可. `unlessAllCharactersHaveTrait`: the published exemption for decks whose characters all have that trait. */
  | { type: 'BANNED'; title: string; name: string; cardIds: string[]; unlessAllCharactersHaveTrait?: string }
  /** ○枚まで使用可 */
  | { type: 'LIMIT'; title: string; max: number; name: string; cardIds: string[] }
  /** ○種選抜: at most one kind of the group. */
  | { type: 'CHOICE'; title: string; group: { name: string; cardIds: string[] }[] };

export interface FormatConfig {
  id: string;
  nameZh: string;
  /** Rule ①. */
  deckSize: number;
  /** Rule ②, unless a card's own text allows any number. */
  maxSameName: number;
  /** Rule ③. */
  maxClimax: number;
  /** Rule ④: every card must belong to one title. */
  singleTitle: boolean;
  titles: TitleConfig[];
  restrictions: Restriction[];
  source: { url: string; season: string; effectiveFrom: string; checkedOn: string; note: string };
}

const SOURCE_URL = 'https://ws-tcg.com/rules/deck_rule/';

/** タイトルの区分, the rows for the 作品番号 in this database (page read 2026-11-13). */
export const TITLES: readonly TitleConfig[] = [
  { name: '涼宮ハルヒの憂鬱', codes: ['SY', 'Ssy'] },
  { name: '五等分の花嫁', codes: ['5HY'] },
  { name: 'ソードアート・オンライン', codes: ['SAO', 'Gso'] },
  { name: 'ガールズ＆パンツァー', codes: ['GUP'] },
  { name: 'ステラソラ', codes: ['STS'] },
  { name: 'anemoi', codes: ['ANM'] },
  { name: '勝利の女神：NIKKE', codes: ['NIK'] },
  { name: 'BanG Dream!', codes: ['BD', 'BDY'] },
  { name: 'VIRTUAL GIRL @ WORLD’S END', codes: ['VRG', 'BDY'] },
];

/**
 * 2026年度後期 ネオスタンダード構築: every entry of the titles above.
 * ガールズ＆パンツァー, ステラソラ, anemoi, 勝利の女神：NIKKE and VIRTUAL GIRL
 * @ WORLD'S END have no entry in the Neo-Standard list.
 */
const NEO_STANDARD_RESTRICTIONS: Restriction[] = [
  { type: 'BANNED', title: '涼宮ハルヒの憂鬱', name: '情報連結解除', cardIds: ['SY/W08-T16', 'SY/W08-097'] },
  { type: 'BANNED', title: 'ソードアート・オンライン', name: '真っ直ぐな道 アリス', cardIds: ['SAO/S100-011', 'SAO/S100-011S'] },
  { type: 'LIMIT', title: '五等分の花嫁', max: 2, name: '走り出す恋心 中野 二乃', cardIds: ['5HY/W90-052', '5HY/W90-052SSP'] },
  {
    type: 'CHOICE',
    title: '五等分の花嫁',
    group: [
      { name: '微睡の中 中野 一花', cardIds: ['5HY/W90-061', '5HY/W90-061S'] },
      { name: 'ありがとうの花 中野 二乃', cardIds: ['5HY/W101-081', '5HY/W101-081HYR'] },
      { name: 'めいっぱいのアプローチ 中野 二乃', cardIds: ['5HY/WE43-23', '5HY/WE43-23IGP'] },
    ],
  },
  { type: 'BANNED', title: 'BanG Dream!', name: 'ミッシェルシール', cardIds: ['BD/W54-021'], unlessAllCharactersHaveTrait: 'ハロー、ハッピーワールド！' },
  { type: 'LIMIT', title: 'BanG Dream!', max: 1, name: 'キラキラを求めて 香澄', cardIds: ['BD/W47-P28', 'BD/W47-P28S'] },
  {
    type: 'CHOICE',
    title: 'BanG Dream!',
    group: [
      { name: '市ヶ谷有咲', cardIds: ['BD/W47-082', 'BD/W47-082SP'] },
      { name: 'がんばれパン', cardIds: ['BD/W54-065', 'BD/WE42-P36', 'BD/W125-063', 'BD/W125-063S'] },
      { name: '拒絶の言葉 豊川祥子', cardIds: ['BD/W125-010', 'BD/W125-010S'] },
    ],
  },
];

export const NEO_STANDARD: FormatConfig = {
  id: 'NEO_STANDARD',
  nameZh: 'Neo-Standard（ネオスタンダード構築）',
  deckSize: 50,
  maxSameName: 4,
  maxClimax: 8,
  singleTitle: true,
  titles: [...TITLES],
  restrictions: NEO_STANDARD_RESTRICTIONS,
  source: {
    url: SOURCE_URL,
    season: '2026年度後期制限改定',
    effectiveFrom: '2026-06-27',
    checkedOn: '2026-11-13',
    note: 'Titles and restriction entries copied only for the 作品番号 in this database.',
  },
};

/**
 * スタンダード構築: any titles together. Its restriction list (スタンダード構築／
 * サイド限定構築, same season) was searched on 2026-11-13 for the 作品番号 of
 * this database: no entry for SY/, Ssy/, 5HY/, SAO/, Gso/, GUP/, STS/, ANM/,
 * NIK/ or BDY/ card numbers. It does list BD/ and VRG/ cards (e.g.
 * BD/W54-013, BD/W95-001), none of which this database holds; those entries
 * are NOT copied here and must be added before any BD/ or VRG/ card is
 * imported.
 */
export const STANDARD: FormatConfig = {
  id: 'STANDARD',
  nameZh: 'Standard（スタンダード構築）',
  deckSize: 50,
  maxSameName: 4,
  maxClimax: 8,
  singleTitle: false,
  titles: [...TITLES],
  restrictions: [],
  source: {
    url: SOURCE_URL,
    season: '2026年度後期制限改定',
    effectiveFrom: '2026-06-27',
    checkedOn: '2026-11-13',
    note: 'No Standard restriction concerns a card in this database. The list has BD/ and VRG/ entries (cards not in this database) that are not copied yet.',
  },
};

export const FORMATS: readonly FormatConfig[] = [NEO_STANDARD, STANDARD];

export function getFormat(id: string): FormatConfig {
  const format = FORMATS.find((f) => f.id === id);
  if (!format) throw new Error(`Unknown format ${id}`);
  return format;
}

export interface DeckCount {
  cardId: string;
  count: number;
}

export type DeckProblemCode =
  | 'UNKNOWN_CARD'
  | 'BAD_COUNT'
  | 'DECK_SIZE'
  | 'TOO_MANY_CLIMAXES'
  | 'TOO_MANY_SAME_NAME'
  | 'MIXED_TITLES'
  | 'UNKNOWN_TITLE'
  | 'BANNED'
  | 'OVER_LIMIT'
  | 'CHOICE_GROUP'
  | 'NOT_PLAYABLE';

export interface DeckProblem {
  code: DeckProblemCode;
  /** What is wrong, in Traditional Chinese, naming the rule. */
  message: string;
  /** The cards that cause it. */
  cardIds: string[];
}

export interface DeckStats {
  total: number;
  climaxes: number;
  byKind: Record<string, number>;
  byColor: Record<string, number>;
  /** Characters and events by level 0 to 3. */
  byLevel: Record<string, number>;
  byTrigger: Record<string, number>;
  codes: string[];
}

export interface DeckCheck {
  /** Follows the construction rules of the format. */
  legal: boolean;
  /** Legal, and every card can be run by the engine (support "verified"). */
  playable: boolean;
  /** Rule problems: the deck is not legal. */
  problems: DeckProblem[];
  /** Cards the engine cannot run yet: the deck cannot be used in a game. */
  unsupported: DeckProblem[];
  /** Titles all cards belong to (Neo-Standard needs at least one). */
  titles: string[];
  stats: DeckStats;
}

/** A card whose own text lets a deck hold any number of it (e.g. 「妹達」), which overrides rule ②. */
const ANY_NUMBER = /デッキに.{0,8}好きな枚数入れることができ/;

const codeOf = (cardId: string): string => cardId.split('/')[0] ?? '';

/** Checks a deck against a format. Unknown cards and bad counts are reported, never ignored. */
export function validateDeck(entries: readonly DeckCount[], format: FormatConfig = NEO_STANDARD): DeckCheck {
  const problems: DeckProblem[] = [];
  const unsupported: DeckProblem[] = [];
  const counts = new Map<string, number>();
  const unknown: string[] = [];
  const badCount: string[] = [];
  for (const entry of entries) {
    if (!Number.isInteger(entry.count) || entry.count < 1) {
      badCount.push(entry.cardId);
      continue;
    }
    try {
      getCard(entry.cardId);
    } catch {
      unknown.push(entry.cardId);
      continue;
    }
    counts.set(entry.cardId, (counts.get(entry.cardId) ?? 0) + entry.count);
  }
  if (unknown.length > 0) problems.push({ code: 'UNKNOWN_CARD', message: `資料庫沒有這些卡號：${unknown.join('、')}`, cardIds: unknown });
  if (badCount.length > 0) problems.push({ code: 'BAD_COUNT', message: `張數必須是 1 或以上的整數：${badCount.join('、')}`, cardIds: badCount });

  const stats: DeckStats = { total: 0, climaxes: 0, byKind: {}, byColor: {}, byLevel: {}, byTrigger: {}, codes: [] };
  const byName = new Map<string, { count: number; cardIds: string[]; anyNumber: boolean }>();
  const notVerified: string[] = [];
  for (const [cardId, count] of counts) {
    const card = getCard(cardId);
    const def = card.def;
    stats.total += count;
    stats.byKind[def.kind] = (stats.byKind[def.kind] ?? 0) + count;
    stats.byColor[def.color] = (stats.byColor[def.color] ?? 0) + count;
    if (def.kind === 'CLIMAX') stats.climaxes += count;
    else stats.byLevel[String(def.level ?? 0)] = (stats.byLevel[String(def.level ?? 0)] ?? 0) + count;
    for (const icon of def.triggers.length > 0 ? def.triggers : ['NONE']) stats.byTrigger[icon] = (stats.byTrigger[icon] ?? 0) + count;
    const name = byName.get(def.name) ?? { count: 0, cardIds: [], anyNumber: false };
    name.count += count;
    name.cardIds.push(cardId);
    name.anyNumber ||= ANY_NUMBER.test(card.official.text);
    byName.set(def.name, name);
    if (card.record.support !== 'verified') notVerified.push(cardId);
  }
  stats.codes = [...new Set([...counts.keys()].map(codeOf))].sort();

  // ① exactly 50 cards.
  if (stats.total !== format.deckSize) {
    problems.push({ code: 'DECK_SIZE', message: `卡組必須剛好 ${format.deckSize} 張，現在是 ${stats.total} 張（${stats.total < format.deckSize ? `還差 ${format.deckSize - stats.total}` : `多了 ${stats.total - format.deckSize}`} 張）。`, cardIds: [] });
  }
  // ③ at most 8 climaxes.
  if (stats.climaxes > format.maxClimax) {
    const climaxes = [...counts.keys()].filter((id) => getCard(id).def.kind === 'CLIMAX');
    problems.push({ code: 'TOO_MANY_CLIMAXES', message: `Climax 最多 ${format.maxClimax} 張，現在是 ${stats.climaxes} 張。`, cardIds: climaxes });
  }
  // ② at most 4 cards with the same card name (different numbers with the same name count together).
  for (const [name, info] of byName) {
    if (!info.anyNumber && info.count > format.maxSameName) {
      problems.push({ code: 'TOO_MANY_SAME_NAME', message: `同名卡「${name}」最多 ${format.maxSameName} 張，現在是 ${info.count} 張（${info.cardIds.join('、')}）。`, cardIds: info.cardIds });
    }
  }

  // ④ one title: some title's 作品番号 must cover every card.
  const known = new Set(format.titles.flatMap((t) => t.codes));
  const unknownCodes = stats.codes.filter((code) => !known.has(code));
  if (unknownCodes.length > 0) {
    const cards = [...counts.keys()].filter((id) => unknownCodes.includes(codeOf(id)));
    problems.push({ code: 'UNKNOWN_TITLE', message: `作品番號 ${unknownCodes.join('、')} 的 Title 區分尚未登記在這個賽制的設定內，不能判斷是否合法。`, cardIds: cards });
  }
  const titles = stats.codes.length === 0 ? [] : format.titles.filter((t) => stats.codes.every((code) => t.codes.includes(code))).map((t) => t.name);
  if (format.singleTitle && stats.codes.length > 0 && titles.length === 0 && unknownCodes.length === 0) {
    const perCode = stats.codes.map((code) => `${code}（${format.titles.filter((t) => t.codes.includes(code)).map((t) => t.name).join('／')}）`);
    problems.push({ code: 'MIXED_TITLES', message: `${format.nameZh} 只可以使用同一個 Title 的卡。這副卡組混合了：${perCode.join('、')}。`, cardIds: [...counts.keys()] });
  }

  // Restriction list. An entry applies in decks of its title (single-title formats) or always (others).
  const inDeck = (ids: readonly string[]) => ids.filter((id) => counts.has(id));
  const countOf = (ids: readonly string[]) => ids.reduce((sum, id) => sum + (counts.get(id) ?? 0), 0);
  for (const r of format.restrictions) {
    if (r.type === 'BANNED') {
      const present = inDeck(r.cardIds);
      if (present.length === 0) continue;
      if (r.unlessAllCharactersHaveTrait) {
        const trait = r.unlessAllCharactersHaveTrait;
        const exempt = [...counts.keys()].every((id) => getCard(id).def.kind !== 'CHARACTER' || getCard(id).def.traits.includes(trait));
        if (exempt) continue;
      }
      problems.push({
        code: 'BANNED',
        message: `「${r.name}」（${present.join('、')}）在 ${format.nameZh} 的「${r.title}」是使用不可（${format.source.season}）。${r.unlessAllCharactersHaveTrait ? `只有角色全部是《${r.unlessAllCharactersHaveTrait}》的卡組例外。` : ''}`,
        cardIds: present,
      });
    } else if (r.type === 'LIMIT') {
      const n = countOf(r.cardIds);
      if (n > r.max) problems.push({ code: 'OVER_LIMIT', message: `「${r.name}」最多 ${r.max} 張（${format.source.season}），現在是 ${n} 張。`, cardIds: inDeck(r.cardIds) });
    } else {
      const kinds = r.group.filter((g) => countOf(g.cardIds) > 0);
      if (kinds.length > 1) {
        problems.push({
          code: 'CHOICE_GROUP',
          message: `${r.group.length}種選抜（${format.source.season}）：${r.group.map((g) => `「${g.name}」`).join('、')}之中最多只可以放入 1 種，現在有 ${kinds.length} 種。`,
          cardIds: kinds.flatMap((g) => inDeck(g.cardIds)),
        });
      }
    }
  }

  if (notVerified.length > 0) {
    unsupported.push({
      code: 'NOT_PLAYABLE',
      message: `這些卡的效果尚未由引擎支援（未確認 — 暫不支援自動執行），含有它們的卡組不能用於對戰：${notVerified.join('、')}`,
      cardIds: notVerified,
    });
  }

  const legal = problems.length === 0;
  return { legal, playable: legal && unsupported.length === 0, problems, unsupported, titles, stats };
}

/** The deck as a list of card ids (each card `count` times, in the order given). */
export function expandDeck(entries: readonly DeckCount[]): string[] {
  return entries.flatMap((entry) => Array.from({ length: entry.count }, () => entry.cardId));
}

/** Counts per card from a list of card ids, in order of first appearance. */
export function countDeck(cardIds: readonly string[]): DeckCount[] {
  const counts = new Map<string, number>();
  for (const id of cardIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([cardId, count]) => ({ cardId, count }));
}
