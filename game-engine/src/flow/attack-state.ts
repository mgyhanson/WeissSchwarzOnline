/**
 * Who is attacking and who is defending right now (CR-7.2.1.5).
 */

import { getDef } from '../state';
import type { CardInstance, GameState, PlayerId, SlotId } from '../types';
import { opponentOf } from '../types';

function objectInSlot(state: GameState, player: PlayerId, slot: SlotId, objectId: number): CardInstance | null {
  for (const id of state.zones[player].stage[slot]) {
    const inst = state.instances[id] as CardInstance;
    if (inst.objectId === objectId) return inst;
  }
  return null;
}

/**
 * The attacking character, or null when there is none any more.
 * CR-7.2.1.5: it stays the attacking character only as long as it does not
 * leave the slot it attacked from; CR-7.5.1.2.2: nor change master.
 */
export function attackerInstance(state: GameState): CardInstance | null {
  const attack = state.attack;
  if (!attack) return null;
  return objectInSlot(state, attack.player, attack.attackerSlot, attack.attackerObjectId);
}

/** CR-7.2.1.5.1: the defending character of a front attack, under the same conditions. */
export function defenderInstance(state: GameState): CardInstance | null {
  const attack = state.attack;
  if (!attack || attack.defenderObjectId === null || attack.defenderSlot === null) return null;
  return objectInSlot(state, opponentOf(attack.player), attack.defenderSlot, attack.defenderObjectId);
}

/** The character in a slot, if any. After a check timing a slot holds at most one. */
export function characterInSlot(state: GameState, player: PlayerId, slot: SlotId): CardInstance | null {
  const ids = state.zones[player].stage[slot];
  for (let i = ids.length - 1; i >= 0; i--) {
    const id = ids[i] as number;
    if (getDef(state, id).kind === 'CHARACTER') return state.instances[id] as CardInstance;
  }
  return null;
}
