/**
 * Events are the engine's record of what happened. They feed ability
 * triggers, the replay log and client animations. These are the full,
 * unredacted events; players only ever receive the result of redactEvent().
 */

import type {
  AttackType,
  CardKind,
  Face,
  GameResult,
  Orientation,
  Phase,
  PlayerId,
  SlotId,
  TriggerIcon,
  ZoneRef,
} from './types';

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
  | 'END_PHASE'
  /** CR-7.3.1.2: the trigger check card, to the resolution zone and then to stock. */
  | 'TRIGGER_CHECK'
  /** CR-4.14.2: a card moved by the action of a trigger icon. */
  | 'TRIGGER'
  /** CR-4.12.1: damage cards, to the resolution zone and then to the clock. */
  | 'DAMAGE'
  /** CR-4.12.1.2: damage cards sent to the waiting room by a cancel. */
  | 'DAMAGE_CANCEL'
  /** CR-7.7.1.2 / 7.7.1.3: a reversed character removed in the encore step. */
  | 'ENCORE_STEP'
  /** CR-10.2.2: a character returned to its slot by encore. */
  | 'ENCORE';

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

/** CR-7.2.1.5: an attack was declared. Cards are given by object id; all are public stage cards. */
export interface AttackDeclaredEvent {
  type: 'ATTACK_DECLARED';
  seq: number;
  player: PlayerId;
  attackType: AttackType;
  attackerObjectId: number;
  attackerSlot: SlotId;
  defenderObjectId: number | null;
}

/** CR-7.3.1.2: the card revealed by a trigger check and the icons that will be executed. */
export interface TriggerCheckEvent {
  type: 'TRIGGER_CHECK';
  seq: number;
  player: PlayerId;
  cardId: string;
  icons: TriggerIcon[];
}

/** CR-4.9.1: a card was revealed to all players where it is. */
export interface CardRevealedEvent {
  type: 'CARD_REVEALED';
  seq: number;
  instanceId: number;
  cardId: string;
  zone: ZoneRef;
}

/** CR-4.12.1: a damage process finished. */
export interface DamageDealtEvent {
  type: 'DAMAGE_DEALT';
  seq: number;
  receiver: PlayerId;
  amount: number;
  cancelled: boolean;
  /** Object id of the attacking character for attack damage (CR-4.13.2.1); null for other damage. */
  sourceObjectId: number | null;
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
  | AttackDeclaredEvent
  | TriggerCheckEvent
  | CardRevealedEvent
  | DamageDealtEvent
  | GameEndedEvent;

/** An event before the engine has numbered it. */
export type GameEventInput = GameEvent extends infer E ? (E extends GameEvent ? Omit<E, 'seq'> : never) : never;
