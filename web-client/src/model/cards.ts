/**
 * What the interface shows about a card. Everything comes from the card
 * database: printed information from the official data, the official text
 * as published, and the Chinese explanation with its source label.
 *
 * No card images are used (see docs/03-phase1-plan.md, copyright section):
 * cards are drawn from their data, with a link to the official card list.
 */

import { type CardKind, type TriggerIcon } from '@wso/game-engine';
import { type DatabaseCard, SETS, allCards, getCard, plainText } from '@wso/card-database';

export interface CardInfo {
  cardId: string;
  name: string;
  kind: CardKind;
  color: string;
  level: number | null;
  cost: number | null;
  power: number | null;
  soul: number | null;
  traits: string[];
  triggers: TriggerIcon[];
  counter: boolean;
  /** Official text, one entry per printed line, icons written out. */
  text: string[];
  /** The printed lines that are abilities, in order; index n is ability n when the counts agree. */
  abilityText: string[];
  explanation: string;
  /** How the explanation must be labelled. */
  explanationLabel: string;
  support: DatabaseCard['record']['support'];
  faqs: { date: string; q: string; a: string }[];
  /** Folder id of the set in card-database/sets. */
  set: string;
  product: string;
  officialUrl: string;
}

const ICON_TEXT: Record<string, string> = {
  'soul.gif': '〔Soul〕',
  'salvage.gif': '〔門〕',
  'bounce.gif': '〔風〕',
  'shot.gif': '〔Shot〕',
  'draw.gif': '〔Draw〕',
  'treasure.gif': '〔Treasure〕',
  'choice.gif': '〔Choice〕',
  'gate.gif': '〔Gate〕',
};

/** Writes out the icon images of the official text. An icon not listed stays visible as its file name. */
export function iconsToText(text: string): string {
  return text.replace(/\[\[([^\]]+)\]\]/g, (_, icon: string) => ICON_TEXT[icon] ?? `〔${icon}〕`);
}

const EXPLANATION_LABEL: Record<DatabaseCard['record']['explanation']['source'], string> = {
  OFFICIAL_TEXT: '官方卡牌文字',
  OFFICIAL_RULES: '依據官方規則',
  OFFICIAL_QA: '依據官方 Q&A',
  COMMUNITY: '社群資料（非官方）',
  AI_ASSISTED: 'AI 輔助說明（非官方）',
};

const cache = new Map<string, CardInfo>();

export function cardInfo(cardId: string): CardInfo {
  const cached = cache.get(cardId);
  if (cached) return cached;
  const card = getCard(cardId);
  const def = card.def;
  const text = plainText(card.official)
    .split('\n')
    .map((line) => iconsToText(line.trim()))
    .filter((line) => line !== '');
  const set = SETS.find((s) => s.id === card.set);
  const info: CardInfo = {
    cardId,
    name: def.name,
    kind: def.kind,
    color: def.color,
    level: def.level,
    cost: def.cost,
    power: def.power,
    soul: def.soul,
    traits: def.traits,
    triggers: def.triggers,
    counter: def.counter,
    text,
    abilityText: text.filter((line) => line.startsWith('【')),
    explanation: card.record.explanation.zh,
    explanationLabel: `${EXPLANATION_LABEL[card.record.explanation.source]}・${card.record.explanation.status}`,
    support: card.record.support,
    faqs: card.official.faqs,
    set: card.set,
    // A selection from several products names the card's own product.
    product: set && new Set(set.official.cards.map((c) => c.expansion)).size > 1 ? card.official.expansion : (set?.official.source.product ?? ''),
    officialUrl: `https://ws-tcg.com/cardlist/?cardno=${cardId}`,
  };
  cache.set(cardId, info);
  return info;
}

/**
 * The printed text of ability number `index` of a card, for questions about
 * that ability. Falls back to the whole text when the printed lines and the
 * ability data do not line up one to one.
 */
export function abilityText(cardId: string, index: number | undefined): string {
  const info = cardInfo(cardId);
  const abilities = getCard(cardId).def.abilities ?? [];
  if (index === undefined || index < 0) return '（由其他卡給予的能力）';
  if (info.abilityText.length === abilities.length && info.abilityText[index]) return info.abilityText[index]!;
  return info.text.join('\n');
}

/** Every card of the database: hand-written, compiled from sentence patterns, and not yet supported. */
export function allCardIds(): string[] {
  return allCards().map((card) => card.record.cardId);
}

export interface SetSummary {
  id: string;
  product: string;
  /** Title prefix of the card numbers, e.g. "SY". */
  title: string;
  total: number;
  verified: number;
  pending: number;
  unsupported: number;
}

/** Per set: how many cards were imported and how far each is supported. */
export function setSummaries(): SetSummary[] {
  const cards = allCards();
  return SETS.map((set) => {
    const records = cards.filter((card) => card.set === set.id).map((card) => card.record);
    return {
      id: set.id,
      product: set.official.source.product,
      title: records[0]?.cardId.split('/')[0] ?? '',
      total: records.length,
      verified: records.filter((r) => r.support === 'verified').length,
      pending: records.filter((r) => r.support === 'pending').length,
      unsupported: records.filter((r) => r.support === 'unsupported').length,
    };
  });
}
