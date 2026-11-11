/**
 * Small procedures used by several phases: check timing and drawing.
 */

import type { Ctx } from '../moves';
import { moveCard } from '../moves';
import { describeWaiting, playWaiting } from './autos';
import { ask, playersInTurnOrder, popFrame, takeAnswer, topOf } from './core';
import type { Frame } from './frames';
import { performCheckRuleActions } from './rule-actions';

/**
 * CR-8.5.1: a check timing.
 *  1. Perform all check-type rule actions; repeat while that did something.
 *  2. If the turn player has automatic abilities waiting, they choose one,
 *     it is played and resolved, then back to 1.
 *  3. The same for the other player.
 *  4. End.
 */
export function stepCheckTiming(ctx: Ctx, frame: Extract<Frame, { kind: 'CHECK_TIMING' }>): void {
  const state = ctx.state;

  if (frame.asked) {
    // The answer to "which of your waiting abilities first?" (CR-8.7.3.1).
    frame.asked = false;
    playWaiting(ctx, takeAnswer(ctx, 'CHOOSE_ABILITY').id);
    return;
  }

  if (performCheckRuleActions(ctx)) {
    // Either the game ended, or cards moved: return to the engine loop so
    // interrupt rule actions are checked, then run this step again.
    frame.acted = true;
    return;
  }

  for (const player of playersInTurnOrder(state)) {
    const waiting = state.waiting.filter((ability) => ability.master === player);
    if (waiting.length === 0) continue;
    frame.acted = true;
    // CR-8.7.3.1: playing a waiting ability is mandatory; only the order of
    // one's own abilities is a choice.
    if (waiting.length === 1) {
      playWaiting(ctx, waiting[0]!.id);
    } else {
      frame.asked = true;
      ask(ctx, { kind: 'CHOOSE_ABILITY', player, abilities: waiting.map((ability) => describeWaiting(state, ability)) });
    }
    return;
  }

  state.lastCheckActed = frame.acted;
  popFrame(ctx, frame);
}

/**
 * CR-4.7.1: drawing moves the top card of the deck to the hand. Several
 * draws are done one card at a time (CR-3.2.3); when the deck runs out in
 * between, the engine loop performs the refresh before the next card
 * (CR-3.2.3.2).
 */
export function stepDraw(ctx: Ctx, frame: Extract<Frame, { kind: 'DRAW' }>): void {
  const { player } = frame;
  const top = topOf(ctx.state.zones[player].deck);
  // CR-1.3.2: with no card left to draw (deck and waiting room both empty)
  // the rest of the draw simply does not happen.
  if (frame.remaining <= 0 || top === undefined) {
    popFrame(ctx, frame);
    return;
  }
  frame.remaining--;
  moveCard(ctx, top, { player, zone: 'hand' }, { reason: 'DRAW' });
}
