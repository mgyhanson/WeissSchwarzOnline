/**
 * Current values derived from the state.
 *
 * Nothing here is stored: every value is computed from the zones each time
 * it is needed, so a displayed number can never disagree with the game.
 * Continuous effects (CR-8.9) are applied here from STEP 4d on; until then
 * a card's current values are its printed values.
 */

import { getDef, getInstance } from './state';
import type { GameState, PlayerId } from './types';

/** CR-8.6.2.1.2: a player's level is the number of cards in their level zone (face-down ones included). */
export function playerLevel(state: GameState, player: PlayerId): number {
  return state.zones[player].level.length;
}

/** CR-2.9 / CR-2.19.1: power of a card; a card without the information counts as 0. */
export function getPower(state: GameState, instanceId: number): number {
  return getDef(state, instanceId).power ?? 0;
}

/**
 * CR-8.6.2.1.1: the colours a player can use, i.e. the colours of the cards
 * in their level zone and clock. A face-down level card has no information
 * (CR-3.9.2.2.1) and therefore no colour.
 */
export function availableColors(state: GameState, player: PlayerId): Set<string> {
  const colors = new Set<string>();
  const zones = state.zones[player];
  for (const id of zones.level) {
    if (getInstance(state, id).face === 'UP') colors.add(getDef(state, id).color);
  }
  for (const id of zones.clock) colors.add(getDef(state, id).color);
  return colors;
}
