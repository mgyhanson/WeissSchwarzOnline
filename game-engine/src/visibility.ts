/**
 * Which player may see the contents of which card (CR-3).
 *
 * The number of cards in every zone is always public (CR-3.1.2); this module
 * only decides whether a card's identity is visible.
 */

import type { CardInstance, PlayerId } from './types';

export function canSee(viewer: PlayerId, inst: CardInstance): boolean {
  // CR-4.9.1: a card revealed by an effect is shown to everyone.
  if (inst.revealed) return true;
  const { zone, player } = inst.location;
  switch (zone) {
    // CR-3.2.2 / CR-3.10.2: nobody may look, including the zone's own player.
    case 'deck':
    case 'stock':
      return false;
    // CR-3.3.2: only the player whose hand it is.
    case 'hand':
      return viewer === player;
    // CR-3.4.2, CR-3.5.3, CR-3.8.2, CR-3.11.2, CR-3.13.2: public zones.
    case 'waitingRoom':
    case 'stage':
    case 'clock':
    case 'climax':
    case 'resolution':
      return true;
    // CR-3.9.2 / CR-3.12.2: public, but a face-down card is visible only to
    // the zone's own player. (Effects that forbid even that, CR-3.12.2.2.3,
    // are handled together with reveal/look effects in STEP 4d.)
    case 'level':
    case 'memory':
      return inst.face === 'UP' || viewer === player;
    // CR-3.7.2: hidden from everyone unless the marker is face up (CR-3.7.2.1).
    case 'marker':
      return inst.face === 'UP';
  }
}

export function visibilityPair(inst: CardInstance): [boolean, boolean] {
  return [canSee(0, inst), canSee(1, inst)];
}
