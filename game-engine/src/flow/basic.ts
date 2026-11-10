/**
 * Small procedures used by several phases: check timing and drawing.
 */

import type { Ctx } from '../moves';
import { moveCard } from '../moves';
import { popFrame, topOf } from './core';
import type { Frame } from './frames';
import { performCheckRuleActions } from './rule-actions';

/**
 * CR-8.5.1: a check timing.
 *  1. Perform all check-type rule actions; repeat while that did something.
 *  2. / 3. Play one waiting automatic ability (turn player first), then go
 *          back to 1. Automatic abilities arrive with STEP 4d; until then no
 *          ability can be waiting.
 *  4. End.
 */
export function stepCheckTiming(ctx: Ctx, frame: Extract<Frame, { kind: 'CHECK_TIMING' }>): void {
  if (performCheckRuleActions(ctx)) {
    // Either the game ended, or cards moved: return to the engine loop so
    // interrupt rule actions are checked, then run this step again.
    frame.acted = true;
    return;
  }
  ctx.state.lastCheckActed = frame.acted;
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
