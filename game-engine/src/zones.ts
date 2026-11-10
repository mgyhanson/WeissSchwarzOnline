/**
 * Static facts about zones: stage geometry and default card facing.
 */

import type { Face, GameState, PlayerId, SlotId, ZoneName, ZoneRef } from './types';

export const FRONT_SLOTS: readonly SlotId[] = ['FL', 'FC', 'FR'];
export const BACK_SLOTS: readonly SlotId[] = ['BL', 'BR'];

export function isFrontSlot(slot: SlotId): boolean {
  return FRONT_SLOTS.includes(slot);
}

export function isBackSlot(slot: SlotId): boolean {
  return BACK_SLOTS.includes(slot);
}

/**
 * CR-3.6.5: back-left is behind front-left and front-centre;
 * back-right is behind front-centre and front-right.
 */
const IN_FRONT_OF: Record<SlotId, readonly SlotId[]> = {
  BL: ['FL', 'FC'],
  BR: ['FC', 'FR'],
  FL: [],
  FC: [],
  FR: [],
};

const BEHIND: Record<SlotId, readonly SlotId[]> = {
  FL: ['BL'],
  FC: ['BL', 'BR'],
  FR: ['BR'],
  BL: [],
  BR: [],
};

/** Front-row slots that are "in front of" the given back-row slot (CR-3.6.5). */
export function slotsInFrontOf(slot: SlotId): readonly SlotId[] {
  return IN_FRONT_OF[slot];
}

/** Back-row slots that are "behind" the given front-row slot (CR-3.6.5). */
export function slotsBehind(slot: SlotId): readonly SlotId[] {
  return BEHIND[slot];
}

/**
 * CR-3.6.6: the opponent's slot facing a front-row slot, named from the
 * opponent's own point of view. Own front-left faces the opponent's
 * front-right, centre faces centre, own front-right faces their front-left.
 * Back-row slots face nothing.
 */
export function facingSlot(slot: SlotId): SlotId | null {
  switch (slot) {
    case 'FL':
      return 'FR';
    case 'FC':
      return 'FC';
    case 'FR':
      return 'FL';
    default:
      return null;
  }
}

/**
 * Facing a card has when it enters a zone and nothing says otherwise.
 * Deck and stock are face down (CR-3.2.2, CR-3.10.2); markers are face down
 * by default (CR-3.7.2); level and memory are face up by default
 * (CR-3.9.2.1, CR-3.12.2.1); every other zone is face up.
 */
export function defaultFace(zone: ZoneName): Face {
  return zone === 'deck' || zone === 'stock' || zone === 'marker' ? 'DOWN' : 'UP';
}

/** Zones where an effect may place a card with a non-default facing. */
export function allowsFaceChoice(zone: ZoneName): boolean {
  return zone === 'level' || zone === 'memory' || zone === 'marker';
}

/** The list of instance ids stored at a zone address (bottom -> top). */
export function pileOf(state: GameState, ref: ZoneRef): number[] {
  const zones = state.zones[ref.player];
  if (ref.zone === 'stage') return zones.stage[ref.slot];
  if (ref.zone === 'marker') return zones.marker[ref.slot];
  return zones[ref.zone];
}

export function sameZone(a: ZoneRef, b: ZoneRef): boolean {
  if (a.player !== b.player || a.zone !== b.zone) return false;
  if ((a.zone === 'stage' || a.zone === 'marker') && (b.zone === 'stage' || b.zone === 'marker')) {
    return a.slot === b.slot;
  }
  return true;
}

export function stageSlot(player: PlayerId, slot: SlotId): ZoneRef {
  return { player, zone: 'stage', slot };
}

export function markerSlot(player: PlayerId, slot: SlotId): ZoneRef {
  return { player, zone: 'marker', slot };
}

export function describeZone(ref: ZoneRef): string {
  const base = `P${ref.player}.${ref.zone}`;
  return ref.zone === 'stage' || ref.zone === 'marker' ? `${base}[${ref.slot}]` : base;
}
