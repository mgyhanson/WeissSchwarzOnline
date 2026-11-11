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

import type { Cost, Effect, EffectContext } from '../abilities/types';
import type { PlayerId, TriggerIcon, WaitingAuto } from '../types';

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

/** Steps of the attack phase, in the order of CR-7 (see flow/attack.ts). */
export type AttackStep =
  | 'START'
  | 'DECLARE_START'
  | 'DECLARE_ASK'
  | 'DECLARE_ANSWER'
  | 'TRIGGER_START'
  | 'TRIGGER_REVEAL'
  | 'TRIGGER_ICONS'
  | 'TRIGGER_ORDER_ANSWER'
  | 'TRIGGER_STOCK'
  | 'TRIGGER_END'
  | 'COUNTER_START'
  | 'COUNTER_ASK'
  | 'COUNTER_ANSWER'
  | 'DAMAGE_START'
  | 'DAMAGE_DEAL'
  | 'DAMAGE_END'
  | 'BATTLE_START'
  | 'BATTLE_COMPARE'
  | 'ATTACK_END'
  | 'ATTACK_CLEANUP'
  | 'ENCORE_START'
  | 'ENCORE_TURN_PLAYER'
  | 'ENCORE_TURN_PLAYER_ANSWER'
  | 'ENCORE_OPPONENT'
  | 'ENCORE_OPPONENT_ANSWER'
  | 'ENCORE_FINISH'
  | 'ENCORE_DONE';

export type Frame =
  /** CR-5.2: procedure before the game. */
  | { kind: 'SETUP'; step: number }
  /** CR-5.2.1.4: one player's exchange of opening hand cards. */
  | { kind: 'MULLIGAN'; player: PlayerId; asked: boolean }
  /** CR-6: the current turn. Reused for every turn of the game. */
  | { kind: 'TURN'; step: TurnStep }
  /** CR-8.5.1: a check timing. `acted` records whether anything was resolved. */
  | { kind: 'CHECK_TIMING'; acted: boolean; asked: boolean }
  /**
   * CR-7: the attack phase. `icons` are the trigger icons still to execute
   * and `triggerObjectId` the trigger check card while it is in the
   * resolution zone.
   */
  | { kind: 'ATTACK_PHASE'; step: AttackStep; icons: TriggerIcon[]; triggerObjectId: number | null }
  /**
   * CR-4.14.2: the action of one trigger icon. `card` is the object id of
   * the trigger check card; `picked` and `revealed` hold intermediate
   * choices (object ids).
   */
  | { kind: 'TRIGGER_ICON'; icon: TriggerIcon; player: PlayerId; card: number; step: number; picked: number | null; revealed: number[] }
  /**
   * CR-4.12.1: a damage process. `cards` are the instance ids moved to the
   * resolution zone so far; `flipped` says whether the last one still has to
   * be examined.
   */
  | { kind: 'DAMAGE'; receiver: PlayerId; amount: number; sourceObjectId: number | null; cards: number[]; flipped: boolean }
  /** CR-8.7.3: a waiting automatic ability being played and resolved. */
  | { kind: 'AUTO'; ability: WaitingAuto; asked: boolean }
  /** CR-8.4.2: paying the actions of a cost in order. */
  | { kind: 'PAY_COST'; costs: Cost[]; index: number; asked: boolean; context: EffectContext }
  /**
   * Resolving a list of effects in order. `step` and `scratch` hold the
   * progress within the current effect.
   */
  | { kind: 'EFFECTS'; effects: Effect[]; index: number; step: number; scratch: number[]; context: EffectContext }
  /** CR-8.6.2.4: announces that an ability was played, once its cost is paid. */
  | { kind: 'ANNOUNCE_ABILITY'; player: PlayerId; instanceId: number; ability: number }
  /** CR-8.6.2.5.2: an event that has resolved goes from the resolution zone to the waiting room. */
  | { kind: 'FINISH_EVENT'; objectId: number }
  /** CR-4.7.1 / CR-3.2.3: draw cards one at a time. */
  | { kind: 'DRAW'; player: PlayerId; remaining: number }
  /** CR-9.2: refresh. */
  | { kind: 'REFRESH'; player: PlayerId }
  /** CR-9.3: level up. */
  | { kind: 'LEVEL_UP'; player: PlayerId; asked: boolean }
  /** CR-9.1.2.1.1.2: the player orders their own simultaneous interrupt rule actions. */
  | { kind: 'RULE_ACTION_ORDER'; player: PlayerId; asked: boolean };

export type FrameKind = Frame['kind'];
