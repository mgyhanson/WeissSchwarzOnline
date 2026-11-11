/**
 * The two real test decks as a game configuration, and a summary of which
 * card abilities were played. Shared by the regular games test and the soak.
 */

import type { GameConfig } from '@wso/game-engine';
import { HARUHI_TEST_DECK, ICHIKA_TEST_DECK, deckList, defsFor } from '../src/index';
import type { Played } from '../../game-engine/tests/random-play';

export function realDeckConfig(swap = false): GameConfig {
  const decks: [string[], string[]] = swap
    ? [deckList(ICHIKA_TEST_DECK), deckList(HARUHI_TEST_DECK)]
    : [deckList(HARUHI_TEST_DECK), deckList(ICHIKA_TEST_DECK)];
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
  for (const def of Object.values(realDeckConfig().defs)) {
    (def.abilities ?? []).forEach((ability, index) => {
      if (ability.type !== 'CONT') all.add(`${def.cardId}#${index}`);
    });
    if (def.effect) all.add(`${def.cardId}#event`);
  }
  return all;
}
