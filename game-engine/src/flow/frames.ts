/**
 * The engine's control stack.
 *
 * The game flow is an explicit state machine: every procedure in progress is
 * a frame on GameState.stack, and the engine repeatedly executes one step of
 * the top frame. Because the whole stack is plain data inside GameState, a
 * game can be stopped at any decision, stored, copied and resumed.
 *
 * Discipline that keeps interrupt rule actions (CR-9.1.2.1) exact: a frame
 * step performs at most one card movement (or one simultaneous batch) that
 * can change a deck or a clock, then returns to the engine loop, which checks
 * for refresh / level up before anything else happens.
 */

import type { PlayerId } from '../types';

/** Steps of a turn, in the order of CR-6 (see flow/turn.ts). */
export type TurnStep =
  | 'STAND_START'
  | 'STAND_ACTION'
  | 'DRAW_START'
  | 'DRAW_ACTION'
  | 'DRAW_END'
  | 'CLOCK_START'
  | 'CLOCK_ASK'
  | 'CLOCK_ANSWER'
  | 'CLOCK_END'
  | 'MAIN_START'
  | 'MAIN_TIMING'
  | 'MAIN_ASK'
  | 'MAIN_ANSWER'
  | 'CLIMAX_START'
  | 'CLIMAX_ASK'
  | 'CLIMAX_ANSWER'
  | 'ATTACK_START'
  | 'END_START'
  | 'END_HAND_LIMIT'
  | 'END_HAND_LIMIT_ANSWER'
  | 'END_CLIMAX'
  | 'END_CHECK'
  | 'END_FINISH';

export type Frame =
  /** CR-5.2: procedure before the game. */
  | { kind: 'SETUP'; step: number }
  /** CR-5.2.1.4: one player's exchange of opening hand cards. */
  | { kind: 'MULLIGAN'; player: PlayerId; asked: boolean }
  /** CR-6: the current turn. Reused for every turn of the game. */
  | { kind: 'TURN'; step: TurnStep }
  /** CR-8.5.1: a check timing. `acted` records whether anything was resolved. */
  | { kind: 'CHECK_TIMING'; acted: boolean }
  /** CR-4.7.1 / CR-3.2.3: draw cards one at a time. */
  | { kind: 'DRAW'; player: PlayerId; remaining: number }
  /** CR-9.2: refresh. */
  | { kind: 'REFRESH'; player: PlayerId }
  /** CR-9.3: level up. */
  | { kind: 'LEVEL_UP'; player: PlayerId; asked: boolean }
  /** CR-9.1.2.1.1.2: the player orders their own simultaneous interrupt rule actions. */
  | { kind: 'RULE_ACTION_ORDER'; player: PlayerId; asked: boolean };

export type FrameKind = Frame['kind'];
