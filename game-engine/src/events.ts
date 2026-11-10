/**
 * Events are the engine's record of what happened. They feed ability
 * triggers, the replay log and client animations. These are the full,
 * unredacted events; players only ever receive the result of redactEvent().
 */

import type { Face, Orientation, PlayerId, SlotId, ZoneRef } from './types';

/** Why a card moved. More reasons are added as the flow is implemented. */
export type MoveReason =
  | 'UNSPECIFIED'
  /** CR-6.5.1.2.4: exchanging the cards of two slots. */
  | 'SWAP'
  /** CR-3.7.3.1: markers accompany their character to another slot. */
  | 'MARKER_FOLLOW'
  /** CR-3.7.3.1 / CR-3.7.3.2: markers sent to their owners' waiting rooms. */
  | 'MARKER_DISCARD';

export interface CardMovedEvent {
  type: 'CARD_MOVED';
  seq: number;
  /** Moves with the same batch number happened simultaneously. */
  batch: number;
  instanceId: number;
  cardId: string;
  owner: PlayerId;
  from: ZoneRef;
  to: ZoneRef;
  fromObjectId: number;
  toObjectId: number;
  toPosition: 'TOP' | 'BOTTOM';
  /** State of the card after the move. */
  orientation: Orientation | null;
  face: Face;
  /** Whether each player could see the card before / after the move. */
  visibleBefore: [boolean, boolean];
  visibleAfter: [boolean, boolean];
  reason: MoveReason;
}

export interface DeckShuffledEvent {
  type: 'DECK_SHUFFLED';
  seq: number;
  player: PlayerId;
}

export interface OrientationChangedEvent {
  type: 'ORIENTATION_CHANGED';
  seq: number;
  instanceId: number;
  objectId: number;
  player: PlayerId;
  slot: SlotId;
  from: Orientation;
  to: Orientation;
}

export type GameEvent = CardMovedEvent | DeckShuffledEvent | OrientationChangedEvent;
