/**
 * The card database: sets, the printed data plus ability data the engine
 * needs, and the test decks.
 */

import type { CardDef } from '@wso/game-engine';
import { records as sy } from '../sets/SY_W08_TD/cards';
import syOfficial from '../sets/SY_W08_TD/official.json';
import { records as hy } from '../sets/5HY_W83_TD_ICHIKA/cards';
import hyOfficial from '../sets/5HY_W83_TD_ICHIKA/official.json';
import { records as sao } from '../sets/SAO_S20/cards';
import saoOfficial from '../sets/SAO_S20/official.json';
import { records as gup } from '../sets/GUP_W141/cards';
import gupOfficial from '../sets/GUP_W141/official.json';
import { records as saoOthers } from '../sets/SAO_OTHERS/cards';
import saoOthersOfficial from '../sets/SAO_OTHERS/official.json';
import bdyOfficial from '../sets/BDY_W135/official.json';
import stsOfficial from '../sets/STS_W140/official.json';
import anmOfficial from '../sets/ANM_W138/official.json';
import nikOfficial from '../sets/NIK_S135/official.json';
import { toCardDef, unverifiedTriggerIcons } from './official';
import { compileText } from './patterns';
import type { CardRecord, CardSet, OfficialCard, OfficialSet } from './types';

export * from './types';
export { hasCounterIcon, plainText, toCardDef, unverifiedTriggerIcons } from './official';
export * from './decks';
export * from './formats';
export { PATTERN_IDS, compileText, ruleLines } from './patterns';

export const SETS: readonly CardSet[] = [
  { id: 'SY_W08_TD', official: syOfficial as OfficialSet, records: sy },
  { id: '5HY_W83_TD_ICHIKA', official: hyOfficial as OfficialSet, records: hy },
  { id: 'SAO_S20', official: saoOfficial as OfficialSet, records: sao },
  { id: 'GUP_W141', official: gupOfficial as OfficialSet, records: gup },
  { id: 'SAO_OTHERS', official: saoOthersOfficial as OfficialSet, records: saoOthers },
  // Whole boosters imported by scripts/import-card-sets.ts. Cards without a
  // hand-written record get one from sentence patterns, or are unsupported.
  { id: 'BDY_W135', official: bdyOfficial as OfficialSet, records: [] },
  { id: 'STS_W140', official: stsOfficial as OfficialSet, records: [] },
  { id: 'ANM_W138', official: anmOfficial as OfficialSet, records: [] },
  { id: 'NIK_S135', official: nikOfficial as OfficialSet, records: [] },
];

export interface DatabaseCard {
  set: string;
  official: OfficialCard;
  record: CardRecord;
  /** Printed information plus ability data: what the engine runs. */
  def: CardDef;
}

const AI_NOTE = { source: 'AI_ASSISTED', status: '待核實' } as const;

/**
 * The record of a card nobody has written by hand: from sentence patterns
 * when every line of its text is a known one, otherwise unsupported.
 */
function autoRecord(card: OfficialCard): CardRecord {
  const unknownIcons = unverifiedTriggerIcons(card);
  if (unknownIcons.length > 0) {
    return {
      cardId: card.no,
      origin: 'NONE',
      support: 'unsupported',
      notes: [`Trigger icon not verified yet: ${unknownIcons.join(', ')} (card-database/src/official.ts).`],
      explanation: { zh: '', ...AI_NOTE },
    };
  }
  const compiled = compileText(card);
  if (!compiled) {
    return {
      cardId: card.no,
      origin: 'NONE',
      support: 'unsupported',
      notes: ['Imported from the official card list; its ability data has not been written and tested yet.'],
      explanation: { zh: '', ...AI_NOTE },
    };
  }
  return {
    cardId: card.no,
    origin: 'PATTERN',
    patterns: compiled.patterns,
    support: 'verified',
    ...(compiled.abilities && compiled.abilities.length > 0 ? { abilities: compiled.abilities } : {}),
    notes: ['Ability data generated from the official text: every line is a known sentence pattern (card-database/src/patterns.ts), each tested on this card.'],
    explanation: { zh: compiled.zh.join('\n'), ...AI_NOTE },
  };
}

function build(): Map<string, DatabaseCard> {
  const cards = new Map<string, DatabaseCard>();
  for (const set of SETS) {
    const official = new Map(set.official.cards.map((card) => [card.no, card]));
    const written = new Map(set.records.map((record) => [record.cardId, record]));
    for (const record of set.records) {
      if (!official.has(record.cardId)) throw new Error(`${set.id}: ${record.cardId} has a record but no official data`);
    }
    for (const card of set.official.cards) {
      if (cards.has(card.no)) throw new Error(`${card.no} is listed twice`);
      const record = written.get(card.no) ?? autoRecord(card);
      const def: CardDef = {
        ...toCardDef(card, record.support === 'unsupported'),
        ...(record.abilities ? { abilities: record.abilities } : {}),
        ...(record.effect ? { effect: record.effect } : {}),
      };
      cards.set(card.no, { set: set.id, official: card, record, def });
    }
  }
  return cards;
}

const CARDS = build();

export function allCards(): DatabaseCard[] {
  return [...CARDS.values()];
}

export function getCard(cardId: string): DatabaseCard {
  const card = CARDS.get(cardId);
  if (!card) throw new Error(`Unknown card ${cardId}`);
  return card;
}

/** Engine definitions for the given card ids. */
export function defsFor(cardIds: Iterable<string>): Record<string, CardDef> {
  const defs: Record<string, CardDef> = {};
  for (const id of cardIds) defs[id] = getCard(id).def;
  return defs;
}
