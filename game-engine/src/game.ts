/**
 * The functions a server, an AI, a test or a replay uses to run a game.
 *
 * None of them modifies the state it is given: each returns a new state
 * together with the events that happened.
 */

import type { Choice, Decision } from './decisions';
import { validateChoice } from './decisions';
import type { GameEvent } from './events';
import { endGame } from './flow/core';
import { run } from './flow/run';
import { createCtx } from './moves';
import type { GameConfig } from './state';
import { cloneState, createInitialState } from './state';
import type { GameState, PlayerId } from './types';
import { opponentOf } from './types';

export interface StepResult {
  state: GameState;
  events: GameEvent[];
}

/**
 * Creates a game and performs the setup procedure (CR-5.2) up to the first
 * decision, which is the first player's opening hand exchange.
 * The seed decides both shuffles and who goes first; keep it secret until
 * the game is over.
 */
export function createGame(config: GameConfig, seed: string): StepResult {
  const state = createInitialState(config, seed);
  state.stack.push({ kind: 'SETUP', step: 0 });
  const ctx = createCtx(state);
  run(ctx);
  return { state, events: ctx.events };
}

/** The decision the game is waiting for, or null when the game is over. */
export function getPendingDecision(state: GameState): Decision | null {
  return state.pending;
}

/** Continues a state that is not waiting for a decision (used for prepared positions in tests). */
export function advance(state: GameState): StepResult {
  const ctx = createCtx(cloneState(state));
  run(ctx);
  return { state: ctx.state, events: ctx.events };
}

export interface Submission {
  player: PlayerId;
  /** The id of the decision being answered. */
  decisionId: number;
  choice: Choice;
}

export type RejectionCode =
  | 'GAME_OVER'
  | 'NO_DECISION'
  | 'NOT_YOUR_DECISION'
  /** The decision was already answered: a duplicate or late submission. */
  | 'STALE_DECISION'
  | 'ILLEGAL_CHOICE';

export type SubmitResult = ({ ok: true } & StepResult) | { ok: false; code: RejectionCode; message: string };

/**
 * Answers the pending decision and runs the game to the next decision or to
 * its end. An unacceptable submission is rejected and changes nothing.
 */
export function submitChoice(state: GameState, submission: Submission): SubmitResult {
  if (state.result) return { ok: false, code: 'GAME_OVER', message: 'The game is over' };
  const decision = state.pending;
  if (!decision) return { ok: false, code: 'NO_DECISION', message: 'No decision is pending' };
  if (submission.decisionId !== decision.id) {
    return { ok: false, code: 'STALE_DECISION', message: 'That decision is no longer pending' };
  }
  if (submission.player !== decision.player) {
    return { ok: false, code: 'NOT_YOUR_DECISION', message: 'It is the other player’s decision' };
  }
  const problem = validateChoice(decision, submission.choice);
  if (problem) return { ok: false, code: 'ILLEGAL_CHOICE', message: problem };

  const ctx = createCtx(cloneState(state));
  ctx.state.pending = null;
  ctx.state.answer = structuredClone(submission.choice);
  run(ctx);
  return { ok: true, state: ctx.state, events: ctx.events };
}

/**
 * CR-1.2.4: a player may concede at any time. They lose immediately, without
 * waiting for a check timing, and nothing can prevent or replace it.
 */
export function resign(state: GameState, player: PlayerId): StepResult {
  if (state.result) return { state, events: [] };
  const ctx = createCtx(cloneState(state));
  endGame(ctx, { outcome: 'WIN', winner: opponentOf(player), loser: player, reason: 'RESIGNED' });
  return { state: ctx.state, events: ctx.events };
}
