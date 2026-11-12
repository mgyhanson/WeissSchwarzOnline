/**
 * Current values derived from the state.
 *
 * Nothing here is stored: every value is computed from the zones each time
 * it is needed, so a displayed number can never disagree with the game.
 * A card's current power, soul and level are its printed value, plus what
 * continuous abilities in force add (CR-8.9), plus the changes that last
 * until the end of the turn.
 */

import { currentStat } from './abilities/query';
import { getDef, getInstance } from './state';
import type { GameState, PlayerId } from './types';

/** CR-8.6.2.1.2: a player's level is the number of cards in their level zone (face-down ones included). */
export function playerLevel(state: GameState, player: PlayerId): number {
  return state.zones[player].level.length;
}

/** CR-2.9: current power of a card. */
export function getPower(state: GameState, instanceId: number): number {
  return currentStat(state, instanceId, 'POWER');
}

/** CR-2.10: current soul of a card. */
export function getSoul(state: GameState, instanceId: number): number {
  return currentStat(state, instanceId, 'SOUL');
}

/** CR-2.6: current level of a card. */
export function getCardLevel(state: GameState, instanceId: number): number {
  return currentStat(state, instanceId, 'LEVEL');
}

/** Adds a change to a number of a card that lasts until the end of the turn. */
export function addModifier(state: GameState, objectId: number, stat: 'POWER' | 'SOUL' | 'LEVEL', delta: number, untilTurn?: number): void {
  if (delta !== 0) state.modifiers.push({ objectId, stat, delta, ...(untilTurn !== undefined ? { untilTurn } : {}) });
}

/**
 * 次の相手のターンの終わりまで: the number of the next turn whose turn player
 * is the master's opponent. From the master's own turn that is the next
 * turn; from the opponent's turn, the one after.
 */
export function nextOpponentTurn(state: GameState, master: PlayerId): number {
  const turn = state.turn;
  if (!turn) return 0;
  return turn.player === master ? turn.number + 1 : turn.number + 2;
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
