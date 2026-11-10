/**
 * Core data types of the rules engine.
 *
 * Rule references ("CR-x.y.z") point to the official Japanese Comprehensive
 * Rules ver. 1.114. See rules/rule-registry.md.
 *
 * Everything in GameState is plain JSON data so that a state can be stored,
 * hashed, sent to another process and replayed.
 */

import type { Choice, Decision } from './decisions';
import type { Frame } from './flow/frames';

export const RULES_VERSION = 'JP-1.114';

export type PlayerId = 0 | 1;
export const PLAYERS: readonly PlayerId[] = [0, 1];

export function opponentOf(player: PlayerId): PlayerId {
  return player === 0 ? 1 : 0;
}

/** CR-2.3.2: there are exactly three card types. */
export type CardKind = 'CHARACTER' | 'EVENT' | 'CLIMAX';

/** CR-4.14.2: trigger icons. A card with no icon has an empty list. */
export type TriggerIcon =
  | 'SOUL'
  | 'RETURN'
  | 'POOL'
  | 'COMEBACK'
  | 'DRAW'
  | 'SHOT'
  | 'TREASURE'
  | 'GATE'
  | 'STANDBY'
  | 'CHOICE'
  | 'CHANCE'
  | 'DISCOVERY'
  | 'FOCUS';

/**
 * The printed information of a card that the engine needs (CR-2).
 * The full record (original text, translations, errata...) lives in
 * card-database; abilities are added to this type in STEP 4d.
 */
export interface CardDef {
  /** Official card number, e.g. "SAO/S20-001". */
  cardId: string;
  name: string;
  kind: CardKind;
  /** Colour key as used by the official card list. The engine only compares colours for equality. */
  color: string;
  /** CR-2.6.1: characters and events only; null for climaxes. */
  level: number | null;
  /** CR-2.7.1: characters and events only; null for climaxes. */
  cost: number | null;
  /** CR-2.9.1: characters only. */
  power: number | null;
  /** CR-2.10.1: characters only. */
  soul: number | null;
  /** CR-2.5.1: characters only. */
  traits: string[];
  triggers: TriggerIcon[];
  /** CR-2.8.2: the card has a counter icon. */
  counter: boolean;
}

/** CR-3.6.4: three front-row slots and two back-row slots, named from the owner's point of view. */
export const SLOTS = ['FL', 'FC', 'FR', 'BL', 'BR'] as const;
export type SlotId = (typeof SLOTS)[number];

/** Zones that hold a single ordered list of cards per player. */
export const PILE_ZONES = [
  'deck',
  'hand',
  'waitingRoom',
  'clock',
  'level',
  'stock',
  'climax',
  'memory',
  'resolution',
] as const;
export type PileZone = (typeof PILE_ZONES)[number];

export type ZoneName = PileZone | 'stage' | 'marker';

/**
 * Address of a zone. `player` is the player the zone belongs to (the "master"
 * of cards in it, CR-4.3.2), which is not necessarily the owner of the card.
 */
export type ZoneRef =
  | { player: PlayerId; zone: PileZone }
  | { player: PlayerId; zone: 'stage'; slot: SlotId }
  | { player: PlayerId; zone: 'marker'; slot: SlotId };

/** CR-4.6.1: a character on the stage is in exactly one of these states. */
export type Orientation = 'STAND' | 'REST' | 'REVERSE';

export type Face = 'UP' | 'DOWN';

/** One physical card in the game. */
export interface CardInstance {
  /** Fixed for the whole game. Never shown to players (see view.ts). */
  instanceId: number;
  /** CR-4.2: the player who brought the card in their deck. */
  owner: PlayerId;
  cardId: string;
  /**
   * Identity of the card as a game object. CR-3.1.4: except for a move from
   * one stage slot to another, a card that changes zone is a new card, so it
   * receives a new objectId. This is the id players see for visible cards.
   */
  objectId: number;
  location: ZoneRef;
  /**
   * Batch number of the move that put the card in its current zone (0 before
   * any move). Cards with the same number arrived simultaneously (CR-9.6.2.1).
   */
  enteredBatch: number;
  /** Non-null exactly while the card is in a stage slot. */
  orientation: Orientation | null;
  face: Face;
}

/**
 * All zones of one player. Every list is ordered bottom -> top, i.e. the
 * last element is the top card / the most recently placed card.
 */
export interface PlayerZones {
  deck: number[];
  hand: number[];
  waitingRoom: number[];
  clock: number[];
  level: number[];
  stock: number[];
  climax: number[];
  memory: number[];
  resolution: number[];
  /** CR-3.6: normally one card per slot; a second card can exist until the next rule action (CR-9.6.2). */
  stage: Record<SlotId, number[]>;
  /** CR-3.7: marker zones, one per slot, not part of the stage. */
  marker: Record<SlotId, number[]>;
}

/** CR-6.1: the phases of a turn. */
export type Phase = 'STAND' | 'DRAW' | 'CLOCK' | 'MAIN' | 'CLIMAX' | 'ATTACK' | 'END';

export interface TurnState {
  /** 1 for the first turn of the game, increasing by one every turn. */
  number: number;
  /** The turn player. */
  player: PlayerId;
  phase: Phase;
}

/** Why a player lost. */
export type LossReason =
  /** CR-1.2.2.1: four or more cards in the level zone. */
  | 'LEVEL_4'
  /** CR-1.2.2.2: no cards in deck and none in the waiting room. */
  | 'NO_CARDS'
  /** CR-1.2.4: conceded. */
  | 'RESIGNED';

export type GameResult =
  | { outcome: 'WIN'; winner: PlayerId; loser: PlayerId; reason: LossReason }
  /** CR-1.2.3: both players lost at the same time. `reasons` is indexed by player. */
  | { outcome: 'DRAW'; reasons: [LossReason, LossReason] };

/** CR-3.3.3.1: hand size limit when no effect changes it. */
export const HAND_LIMIT = 7;

/** CR-3.8.3 / CR-9.3.1: number of clock cards that causes a level up. */
export const CLOCK_LIMIT = 7;

/** CR-1.2.2.1: number of level cards at which a player loses. */
export const LOSING_LEVEL = 4;

/** State of the xoshiro128** generator: four unsigned 32-bit integers. */
export type RngState = [number, number, number, number];

export interface GameState {
  rulesVersion: typeof RULES_VERSION;
  /** Printed card data used in this game. Immutable and shared between state copies. */
  defs: Readonly<Record<string, CardDef>>;
  /** Indexed by instanceId. */
  instances: CardInstance[];
  zones: [PlayerZones, PlayerZones];
  /** Number of cards each player brought, for the conservation invariant. */
  initialCounts: [number, number];
  rng: RngState;
  nextObjectId: number;
  nextEventSeq: number;
  nextBatchId: number;
  nextDecisionId: number;

  /** CR-5.2.1.3: decided at random during setup; null before that. */
  firstPlayer: PlayerId | null;
  /** Null until setup has finished. */
  turn: TurnState | null;
  /** Procedures in progress; the last element is executed next. See flow/frames.ts. */
  stack: Frame[];
  /** The decision the engine is waiting for, if any. */
  pending: Decision | null;
  /** A validated choice on its way to the frame that asked for it. */
  answer: Choice | null;
  /** Set when the game is over. */
  result: GameResult | null;
  /** Whether the most recent check timing resolved anything (used by CR-6.8.1.5). */
  lastCheckActed: boolean;
}
