/**
 * The real test decks as game configurations, and a summary of which card
 * abilities were played. Shared by the regular games test and the soak.
 */

import type { GameConfig } from '@wso/game-engine';
import { TEST_DECKS, deckList, defsFor } from '../src/index';
import type { Played } from '../../game-engine/tests/random-play';

/** Every ordered pair of different test decks (each deck meets every other from both seats). */
export const PAIRINGS: readonly [number, number][] = TEST_DECKS.flatMap((_, a) => TEST_DECKS.map((_, b): [number, number] => [a, b])).filter(([a, b]) => a !== b);

/** Game number `game` plays pairing `game` modulo the number of pairings. */
export function realDeckConfig(game = 0): GameConfig {
  const [a, b] = PAIRINGS[game % PAIRINGS.length]!;
  const decks: [string[], string[]] = [deckList(TEST_DECKS[a]!), deckList(TEST_DECKS[b]!)];
  return { defs: defsFor(new Set([...decks[0], ...decks[1]])), decks };
}

/** Which abilities and events of which cards were played, as "card#ability" or "card#event". */
export function abilitiesPlayed(games: readonly Played[]): Set<string> {
  const used = new Set<string>();
  for (const game of games) {
    for (const e of game.events) {
      if (e.type === 'ABILITY_PLAYED') used.add(`${e.cardId}#${e.ability}`);
      if (e.type === 'CARD_PLAYED' && e.cardKind === 'EVENT') used.add(`${e.cardId}#event`);
    }
  }
  return used;
}

/** Every automatic or activated ability and every event effect in the real decks, in the same notation. */
export function abilitiesInDecks(): Set<string> {
  const all = new Set<string>();
  const defs = Object.values(defsFor(new Set(TEST_DECKS.flatMap((deck) => deckList(deck)))));
  for (const def of defs) {
    (def.abilities ?? []).forEach((ability, index) => {
      if (ability.type !== 'CONT') all.add(`${def.cardId}#${index}`);
    });
    if (def.effect) all.add(`${def.cardId}#event`);
  }
  return all;
}
