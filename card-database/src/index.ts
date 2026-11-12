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
import { toCardDef } from './official';
import type { CardRecord, CardSet, OfficialCard, OfficialSet } from './types';

export * from './types';
export { hasCounterIcon, plainText, toCardDef } from './official';
export * from './decks';

export const SETS: readonly CardSet[] = [
  { id: 'SY_W08_TD', official: syOfficial as OfficialSet, records: sy },
  { id: '5HY_W83_TD_ICHIKA', official: hyOfficial as OfficialSet, records: hy },
  { id: 'SAO_S20', official: saoOfficial as OfficialSet, records: sao },
  { id: 'GUP_W141', official: gupOfficial as OfficialSet, records: gup },
  { id: 'SAO_OTHERS', official: saoOthersOfficial as OfficialSet, records: saoOthers },
];

export interface DatabaseCard {
  set: string;
  official: OfficialCard;
  record: CardRecord;
  /** Printed information plus ability data: what the engine runs. */
  def: CardDef;
}

function build(): Map<string, DatabaseCard> {
  const cards = new Map<string, DatabaseCard>();
  for (const set of SETS) {
    const official = new Map(set.official.cards.map((card) => [card.no, card]));
    for (const record of set.records) {
      const card = official.get(record.cardId);
      if (!card) throw new Error(`${set.id}: ${record.cardId} has a record but no official data`);
      if (cards.has(record.cardId)) throw new Error(`${record.cardId} is listed twice`);
      const def: CardDef = {
        ...toCardDef(card),
        ...(record.abilities ? { abilities: record.abilities } : {}),
        ...(record.effect ? { effect: record.effect } : {}),
      };
      cards.set(record.cardId, { set: set.id, official: card, record, def });
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
