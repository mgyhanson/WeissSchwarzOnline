/**
 * Current values derived from the state.
 *
 * Nothing here is stored: every value is computed from the zones each time
 * it is needed, so a displayed number can never disagree with the game.
 * Until the continuous-effect layers of CR-8.9 arrive with STEP 4d, a
 * card's current values are its printed values plus the "this turn" changes
 * made by the rules themselves (attack type, soul trigger).
 */

import { getDef, getInstance } from './state';
import type { GameState, PlayerId } from './types';

/** CR-8.6.2.1.2: a player's level is the number of cards in their level zone (face-down ones included). */
export function playerLevel(state: GameState, player: PlayerId): number {
  return state.zones[player].level.length;
}

function modifierTotal(state: GameState, instanceId: number, stat: 'POWER' | 'SOUL'): number {
  const objectId = getInstance(state, instanceId).objectId;
  let total = 0;
  for (const modifier of state.modifiers) {
    if (modifier.objectId === objectId && modifier.stat === stat) total += modifier.delta;
  }
  return total;
}

/** CR-2.9 / CR-2.19.1: power of a card; a card without the information counts as 0. */
export function getPower(state: GameState, instanceId: number): number {
  return (getDef(state, instanceId).power ?? 0) + modifierTotal(state, instanceId, 'POWER');
}

/** CR-2.10: soul of a card, with the changes that last this turn. */
export function getSoul(state: GameState, instanceId: number): number {
  return (getDef(state, instanceId).soul ?? 0) + modifierTotal(state, instanceId, 'SOUL');
}

/** CR-2.6 / CR-2.19.1: level of a card; a card without the information counts as 0. */
export function getCardLevel(state: GameState, instanceId: number): number {
  return getDef(state, instanceId).level ?? 0;
}

/** Adds a power or soul change that lasts until the end of the turn. */
export function addModifier(state: GameState, objectId: number, stat: 'POWER' | 'SOUL', delta: number): void {
  if (delta !== 0) state.modifiers.push({ objectId, stat, delta });
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
