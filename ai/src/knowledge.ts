/**
 * Facts a player can read off their own view. Everything here takes a
 * PlayerView, never a game state.
 */

import { type CardDef, type CardView, type PileZone, type PlayerId, type PlayerView, type SlotId, type VisibleCardView, PILE_ZONES, SLOTS, opponentOf } from '@wso/game-engine';

export type CardLookup = (cardId: string) => CardDef;

export const FRONT: readonly SlotId[] = ['FL', 'FC', 'FR'];
export const BACK: readonly SlotId[] = ['BL', 'BR'];

/** The opponent's slot facing one of our front slots (each player names slots from their own side). */
export const FACING: Readonly<Record<SlotId, SlotId>> = { FL: 'FR', FC: 'FC', FR: 'FL', BL: 'BR', BR: 'BL' };

/** CR-1.2.2.1: four levels lose; seven clock cards make a level. */
export const LOSING_DAMAGE = 28;

export function visible(card: CardView | undefined): card is VisibleCardView {
  return !!card && !card.hidden;
}

/** Damage taken so far: 7 per level plus the clock. 28 loses. */
export function damageTaken(view: PlayerView, player: PlayerId): number {
  return view.sides[player].level.length * 7 + view.sides[player].clock.length;
}

export function levelOf(view: PlayerView, player: PlayerId): number {
  return view.sides[player].level.length;
}

export interface StageCard {
  slot: SlotId;
  card: VisibleCardView;
  power: number;
  soul: number;
  level: number;
}

export function stageCard(view: PlayerView, player: PlayerId, slot: SlotId): StageCard | null {
  const card = view.sides[player].stage[slot][0];
  if (!visible(card)) return null;
  const stats = view.stats[card.objectId] ?? { power: 0, soul: 0, level: 0 };
  return { slot, card, ...stats };
}

export function stageCards(view: PlayerView, player: PlayerId): StageCard[] {
  return SLOTS.map((slot) => stageCard(view, player, slot)).filter((c): c is StageCard => c !== null);
}

export interface Located {
  card: VisibleCardView;
  side: PlayerId;
  zone: PileZone | 'stage' | 'marker';
  slot?: SlotId;
}

export function locate(view: PlayerView, objectId: number): Located | null {
  for (const side of [0, 1] as const) {
    for (const zone of PILE_ZONES) {
      const card = view.sides[side][zone].find((c) => visible(c) && c.objectId === objectId);
      if (visible(card)) return { card, side, zone };
    }
    for (const slot of SLOTS) {
      const card = view.sides[side].stage[slot].find((c) => visible(c) && c.objectId === objectId);
      if (visible(card)) return { card, side, zone: 'stage', slot };
    }
  }
  return null;
}

/** The card id of a visible card, or of a hidden card the decision lets the player look at. */
export function cardIdOf(view: PlayerView, objectId: number, look?: Record<number, string>): string | null {
  return locate(view, objectId)?.card.cardId ?? look?.[objectId] ?? null;
}

/** CR-8.6.2.1.1: colours in the level zone (face up) and the clock. */
export function availableColors(view: PlayerView, player: PlayerId, card: CardLookup): Set<string> {
  const colors = new Set<string>();
  for (const c of [...view.sides[player].level, ...view.sides[player].clock]) {
    if (visible(c) && c.face === 'UP') colors.add(card(c.cardId).color);
  }
  return colors;
}

/** Climaxes the player has not seen yet among their own cards: deck list minus visible own climaxes. */
export function unseenOwnClimaxes(view: PlayerView, deck: readonly string[], card: CardLookup): number {
  const me = view.viewer;
  const total = deck.filter((id) => card(id).kind === 'CLIMAX').length;
  let seen = 0;
  for (const owner of [me, opponentOf(me)] as const) {
    const side = view.sides[owner];
    const all = [...PILE_ZONES.flatMap((zone) => side[zone]), ...SLOTS.flatMap((slot) => [...side.stage[slot], ...side.marker[slot]])];
    for (const c of all) if (visible(c) && c.owner === me && card(c.cardId).kind === 'CLIMAX') seen++;
  }
  return Math.max(0, total - seen);
}

/**
 * Estimated number of climaxes among the opponent's cards that cannot be
 * seen (deck, hand, stock...). Most decks play the maximum of eight
 * (CR-5.1.2.3); the public ones are subtracted. An assumption, not knowledge.
 */
export function estimatedHiddenOpponentClimaxes(view: PlayerView, card: CardLookup): number {
  const opp = opponentOf(view.viewer);
  let seen = 0;
  for (const owner of [0, 1] as const) {
    const side = view.sides[owner];
    const all = [...PILE_ZONES.flatMap((zone) => side[zone]), ...SLOTS.flatMap((slot) => side.stage[slot])];
    for (const c of all) if (visible(c) && c.owner === opp && card(c.cardId).kind === 'CLIMAX') seen++;
  }
  return Math.max(0, 8 - seen);
}

/** Chance that a damage of the given size is cancelled by a climax in the opponent's deck (rough estimate). */
export function cancelChance(view: PlayerView, damage: number, card: CardLookup): number {
  const opp = opponentOf(view.viewer);
  const side = view.sides[opp];
  const hiddenCount = side.deck.length + side.hand.length + side.stock.length;
  if (hiddenCount === 0 || damage <= 0) return 0;
  const density = Math.min(1, estimatedHiddenOpponentClimaxes(view, card) / hiddenCount);
  return 1 - Math.pow(1 - density, damage);
}
