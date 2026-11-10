/**
 * What one player is allowed to know.
 *
 * The server sends players only the output of this module, never GameState
 * or raw events. Two rules keep hidden information hidden:
 *
 *  1. A card the viewer cannot see is reduced to a placeholder with no
 *     identifying data at all.
 *  2. instanceId (which never changes) is never exposed. Visible cards are
 *     identified by objectId, which is renewed on every zone change
 *     (CR-3.1.4), so a card cannot be followed through a hidden zone.
 */

import type { CardMovedEvent, GameEvent, MoveReason } from './events';
import type { CardInstance, Face, GameState, Orientation, PlayerId, PlayerZones, SlotId, ZoneRef } from './types';
import { PILE_ZONES, SLOTS } from './types';
import { canSee } from './visibility';

export interface VisibleCardView {
  hidden: false;
  objectId: number;
  cardId: string;
  owner: PlayerId;
  orientation: Orientation | null;
  face: Face;
}

export interface HiddenCardView {
  hidden: true;
}

export type CardView = VisibleCardView | HiddenCardView;

/** Cards of a zone, bottom -> top. The length is the public card count (CR-3.1.2). */
export type ZoneView = CardView[];

export interface SideView {
  deck: ZoneView;
  hand: ZoneView;
  waitingRoom: ZoneView;
  clock: ZoneView;
  level: ZoneView;
  stock: ZoneView;
  climax: ZoneView;
  memory: ZoneView;
  resolution: ZoneView;
  stage: Record<SlotId, ZoneView>;
  marker: Record<SlotId, ZoneView>;
}

export interface PlayerView {
  viewer: PlayerId;
  rulesVersion: string;
  /** Indexed by player id. */
  sides: [SideView, SideView];
}

function viewCard(viewer: PlayerId, inst: CardInstance): CardView {
  if (!canSee(viewer, inst)) return { hidden: true };
  return {
    hidden: false,
    objectId: inst.objectId,
    cardId: inst.cardId,
    owner: inst.owner,
    orientation: inst.orientation,
    face: inst.face,
  };
}

function viewPile(state: GameState, viewer: PlayerId, ids: readonly number[]): ZoneView {
  return ids.map((id) => viewCard(viewer, state.instances[id] as CardInstance));
}

function viewSide(state: GameState, viewer: PlayerId, zones: PlayerZones): SideView {
  const side = {} as SideView;
  for (const zone of PILE_ZONES) {
    side[zone] = viewPile(state, viewer, zones[zone]);
  }
  side.stage = {} as Record<SlotId, ZoneView>;
  side.marker = {} as Record<SlotId, ZoneView>;
  for (const slot of SLOTS) {
    side.stage[slot] = viewPile(state, viewer, zones.stage[slot]);
    side.marker[slot] = viewPile(state, viewer, zones.marker[slot]);
  }
  return side;
}

export function getPlayerView(state: GameState, viewer: PlayerId): PlayerView {
  return {
    viewer,
    rulesVersion: state.rulesVersion,
    sides: [viewSide(state, viewer, state.zones[0]), viewSide(state, viewer, state.zones[1])],
  };
}

export interface CardMovedView {
  type: 'CARD_MOVED';
  seq: number;
  batch: number;
  from: ZoneRef;
  to: ZoneRef;
  toPosition: 'TOP' | 'BOTTOM';
  reason: MoveReason;
  /** Present when the viewer could see the card before or after the move. */
  card?: { cardId: string; owner: PlayerId };
  /** Present when the viewer could see the card before the move. */
  fromObjectId?: number;
  /** Present when the viewer can see the card after the move. */
  toObjectId?: number;
  orientation?: Orientation | null;
  face?: Face;
}

export type GameEventView = CardMovedView | Exclude<GameEvent, CardMovedEvent>;

function redactMove(event: CardMovedEvent, viewer: PlayerId): CardMovedView {
  const before = event.visibleBefore[viewer];
  const after = event.visibleAfter[viewer];
  const view: CardMovedView = {
    type: 'CARD_MOVED',
    seq: event.seq,
    batch: event.batch,
    from: event.from,
    to: event.to,
    toPosition: event.toPosition,
    reason: event.reason,
  };
  if (before || after) view.card = { cardId: event.cardId, owner: event.owner };
  if (before) view.fromObjectId = event.fromObjectId;
  if (after) {
    view.toObjectId = event.toObjectId;
    view.orientation = event.orientation;
    view.face = event.face;
  }
  return view;
}

/**
 * The version of an event a player may receive. A move the viewer could
 * observe at neither end shows only that some card went from one zone to
 * another (zone counts are public, CR-3.1.2).
 */
export function redactEvent(event: GameEvent, viewer: PlayerId): GameEventView {
  switch (event.type) {
    case 'CARD_MOVED':
      return redactMove(event, viewer);
    case 'ORIENTATION_CHANGED': {
      // Stage cards are always public; only the permanent id is removed.
      const { instanceId: _instanceId, ...rest } = event;
      return rest as GameEventView;
    }
    case 'DECK_SHUFFLED':
      return event;
  }
}
