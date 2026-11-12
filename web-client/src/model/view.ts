/**
 * Reading a PlayerView. The client never has the game state: everything it
 * shows comes from the view of its own seat.
 */

import { type CardView, type PileZone, type PlayerId, type PlayerView, type SlotId, type VisibleCardView, PILE_ZONES, SLOTS } from '@wso/game-engine';
import { SLOT_ZH, ZONE_ZH } from './text';

export interface FoundCard {
  card: VisibleCardView;
  /** The player whose zone the card is in. */
  side: PlayerId;
  zone: PileZone | 'stage' | 'marker';
  slot?: SlotId;
}

function isVisible(card: CardView): card is VisibleCardView {
  return !card.hidden;
}

export function findCard(view: PlayerView, objectId: number): FoundCard | null {
  for (const side of [0, 1] as const) {
    const zones = view.sides[side];
    for (const zone of PILE_ZONES) {
      const card = zones[zone].find((c) => isVisible(c) && c.objectId === objectId);
      if (card && isVisible(card)) return { card, side, zone };
    }
    for (const slot of SLOTS) {
      for (const zone of ['stage', 'marker'] as const) {
        const card = zones[zone][slot].find((c) => isVisible(c) && c.objectId === objectId);
        if (card && isVisible(card)) return { card, side, zone, slot };
      }
    }
  }
  return null;
}

export function whereLabel(found: FoundCard, seat: PlayerId): string {
  const owner = found.side === seat ? '我方' : '對方';
  if (found.slot) return `${owner}${found.zone === 'stage' ? '' : 'Marker・'}${SLOT_ZH[found.slot]}`;
  return `${owner}${ZONE_ZH[found.zone]}`;
}

/** The card in one of a player's slots, if any. */
export function cardInSlot(view: PlayerView, side: PlayerId, slot: SlotId): VisibleCardView | null {
  const card = view.sides[side].stage[slot][0];
  return card && isVisible(card) ? card : null;
}

export function visibleCards(cards: readonly CardView[]): VisibleCardView[] {
  return cards.filter(isVisible);
}

/** The level of a player: the number of cards in their level zone (CR-8.6.2.1.2). */
export function levelOf(view: PlayerView, side: PlayerId): number {
  return view.sides[side].level.length;
}
