/**
 * Small helpers shared by all flow handlers. This module must not import any
 * handler, so that handlers can import it without import cycles.
 */

import type { Choice, DecisionInput } from '../decisions';
import type { GameEvent, GameEventInput } from '../events';
import type { Ctx } from '../moves';
import type { CardInstance, GameResult, GameState, PlayerId } from '../types';
import { opponentOf } from '../types';
import type { Frame } from './frames';

export function emit(ctx: Ctx, event: GameEventInput): void {
  ctx.events.push({ ...event, seq: ctx.state.nextEventSeq++ } as GameEvent);
}

export function pushFrame(ctx: Ctx, frame: Frame): void {
  ctx.state.stack.push(frame);
}

/** Removes the top frame, which must be the given one. */
export function popFrame(ctx: Ctx, frame: Frame): void {
  const top = ctx.state.stack.pop();
  if (top !== frame) {
    throw new Error(`Engine bug: tried to finish a ${frame.kind} frame that is not on top of the stack`);
  }
}

/** CR-8.5.1: starts a check timing. */
export function pushCheckTiming(ctx: Ctx): void {
  pushFrame(ctx, { kind: 'CHECK_TIMING', acted: false, asked: false });
}

/** Stops the engine until the player answers. The asking step must not move any card. */
export function ask(ctx: Ctx, decision: DecisionInput): void {
  const state = ctx.state;
  if (state.pending) throw new Error('Engine bug: a decision is already pending');
  state.pending = { ...decision, id: state.nextDecisionId++ } as GameState['pending'];
}

/** Consumes the validated answer to the decision this frame asked. */
export function takeAnswer<K extends Choice['kind']>(ctx: Ctx, kind: K): Extract<Choice, { kind: K }> {
  const answer = ctx.state.answer;
  if (!answer || answer.kind !== kind) {
    throw new Error(`Engine bug: expected a ${kind} answer, found ${answer ? answer.kind : 'none'}`);
  }
  ctx.state.answer = null;
  return answer as Extract<Choice, { kind: K }>;
}

/** Finds a card by the object id players use. Throws for unknown ids: choices are validated before they get here. */
export function findObject(state: GameState, objectId: number): CardInstance {
  const inst = state.instances.find((candidate) => candidate.objectId === objectId);
  if (!inst) throw new Error(`Engine bug: no card has object id ${objectId}`);
  return inst;
}

export function objectIdsOf(state: GameState, instanceIds: readonly number[]): number[] {
  return instanceIds.map((id) => (state.instances[id] as CardInstance).objectId);
}

export function topOf(pile: readonly number[]): number | undefined {
  return pile[pile.length - 1];
}

/**
 * CR-9.1.2.1.1.1 / CR-1.3.4: the turn player acts first. Before the first
 * turn there is no turn player; the first player (or player 0 before that is
 * decided) is used, which cannot matter because nothing is contested then.
 */
export function playersInTurnOrder(state: GameState): [PlayerId, PlayerId] {
  const first = state.turn?.player ?? state.firstPlayer ?? 0;
  return [first, opponentOf(first)];
}

/** CR-1.2.1: the game ends immediately. */
export function endGame(ctx: Ctx, result: GameResult): void {
  const state = ctx.state;
  state.result = result;
  state.pending = null;
  state.answer = null;
  state.stack = [];
  emit(ctx, { type: 'GAME_ENDED', result });
}
