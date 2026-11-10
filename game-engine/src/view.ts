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

import type { Decision, DecisionKind } from './decisions';
import type { CardMovedEvent, GameEvent, MoveReason } from './events';
import type {
  CardInstance,
  Face,
  GameResult,
  GameState,
  Orientation,
  PlayerId,
  PlayerZones,
  SlotId,
  TurnState,
  ZoneRef,
} from './types';
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

/**
 * The pending decision as a player sees it. The player who has to decide
 * gets the full decision; the other player only learns who is deciding what,
 * because the legal answers can depend on hidden cards.
 */
export type DecisionView =
  | { mine: true; decision: Decision }
  | { mine: false; id: number; player: PlayerId; kind: DecisionKind };

export interface PlayerView {
  viewer: PlayerId;
  rulesVersion: string;
  /** Indexed by player id. */
  sides: [SideView, SideView];
  firstPlayer: PlayerId | null;
  turn: TurnState | null;
  decision: DecisionView | null;
  result: GameResult | null;
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

export function getDecisionView(state: GameState, viewer: PlayerId): DecisionView | null {
  const decision = state.pending;
  if (!decision) return null;
  if (decision.player === viewer) return { mine: true, decision: structuredClone(decision) };
  return { mine: false, id: decision.id, player: decision.player, kind: decision.kind };
}

export function getPlayerView(state: GameState, viewer: PlayerId): PlayerView {
  return {
    viewer,
    rulesVersion: state.rulesVersion,
    sides: [viewSide(state, viewer, state.zones[0]), viewSide(state, viewer, state.zones[1])],
    firstPlayer: state.firstPlayer,
    turn: state.turn ? { ...state.turn } : null,
    decision: getDecisionView(state, viewer),
    result: state.result ? structuredClone(state.result) : null,
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

type WithoutInstanceId<E> = E extends unknown ? Omit<E, 'instanceId'> : never;

export type GameEventView = CardMovedView | WithoutInstanceId<Exclude<GameEvent, CardMovedEvent>>;

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
  if (event.type === 'CARD_MOVED') return redactMove(event, viewer);
  // Every other event describes something public (a played card is revealed,
  // CR-8.6.2.1; stage cards are public). Only the permanent id is removed.
  if ('instanceId' in event) {
    const { instanceId: _instanceId, ...rest } = event;
    return rest;
  }
  return event;
}
