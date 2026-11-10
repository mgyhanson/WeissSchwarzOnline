/**
 * Events are the engine's record of what happened. They feed ability
 * triggers, the replay log and client animations. These are the full,
 * unredacted events; players only ever receive the result of redactEvent().
 */

import type { CardKind, Face, GameResult, Orientation, Phase, PlayerId, SlotId, ZoneRef } from './types';

/** Why a card moved. More reasons are added as the flow is implemented. */
export type MoveReason =
  | 'UNSPECIFIED'
  /** CR-6.5.1.2.4: exchanging the cards of two slots. */
  | 'SWAP'
  /** CR-3.7.3.1: markers accompany their character to another slot. */
  | 'MARKER_FOLLOW'
  /** CR-3.7.3.1 / CR-3.7.3.2: markers sent to their owners' waiting rooms. */
  | 'MARKER_DISCARD'
  /** CR-4.7.1: drawing a card. */
  | 'DRAW'
  /** CR-5.2.1.4: opening hand exchange. */
  | 'MULLIGAN'
  /** CR-6.4.1.2: hand card put into the clock during the clock phase. */
  | 'CLOCK_PHASE'
  /** CR-8.6.2.5: a played card going where it resolves. */
  | 'PLAY'
  /** CR-8.6.2.5.2: an event leaving the resolution zone after resolving. */
  | 'RESOLVED'
  /** CR-8.4: cards moved as payment of a cost. */
  | 'COST'
  /** CR-9.2.2: waiting room returned to the deck by a refresh. */
  | 'REFRESH'
  /** CR-9.2.2: the top card put into the clock right after a refresh. */
  | 'REFRESH_PENALTY'
  /** CR-9.3.2: clock cards moved by a level up. */
  | 'LEVEL_UP'
  /** CR-9.5 / 9.6 / 9.7: removed by a check-type rule action. */
  | 'RULE_ACTION'
  /** CR-6.8.1.2: discarded down to the hand limit. */
  | 'HAND_LIMIT'
  /** CR-6.8.1.3: climax leaving the climax zone at the end of the turn. */
  | 'END_PHASE';

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

export interface GameStartedEvent {
  type: 'GAME_STARTED';
  seq: number;
  firstPlayer: PlayerId;
}

export interface TurnStartedEvent {
  type: 'TURN_STARTED';
  seq: number;
  turn: number;
  player: PlayerId;
}

export interface PhaseStartedEvent {
  type: 'PHASE_STARTED';
  seq: number;
  turn: number;
  player: PlayerId;
  phase: Phase;
}

/** CR-8.6.2.4: a card was played (its costs are paid, it has not resolved yet). */
export interface CardPlayedEvent {
  type: 'CARD_PLAYED';
  seq: number;
  player: PlayerId;
  instanceId: number;
  cardId: string;
  cardKind: CardKind;
  /** Slot chosen for a character (CR-8.6.2.2.1). */
  slot?: SlotId;
  stockPaid: number;
}

export interface RefreshEvent {
  type: 'REFRESH';
  seq: number;
  player: PlayerId;
}

export interface LevelUpEvent {
  type: 'LEVEL_UP';
  seq: number;
  player: PlayerId;
  /** Number of cards in the level zone afterwards. */
  level: number;
}

export interface GameEndedEvent {
  type: 'GAME_ENDED';
  seq: number;
  result: GameResult;
}

export type GameEvent =
  | CardMovedEvent
  | DeckShuffledEvent
  | OrientationChangedEvent
  | GameStartedEvent
  | TurnStartedEvent
  | PhaseStartedEvent
  | CardPlayedEvent
  | RefreshEvent
  | LevelUpEvent
  | GameEndedEvent;

/** An event before the engine has numbered it. */
export type GameEventInput = GameEvent extends infer E ? (E extends GameEvent ? Omit<E, 'seq'> : never) : never;
