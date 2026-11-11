/**
 * The engine loop: executes frames until the game needs a decision or ends.
 */

import type { Ctx } from '../moves';
import { stepAttackPhase } from './attack';
import { registerTriggers, stepAuto } from './autos';
import { stepCheckTiming, stepDraw } from './basic';
import { stepDamage } from './damage';
import type { Frame } from './frames';
import { pushInterruptIfDue, stepLevelUp, stepRefresh, stepRuleActionOrder } from './rule-actions';
import { stepMulligan, stepSetup } from './setup';
import { stepTriggerIcon } from './triggers';
import { stepTurn } from './turn';

/**
 * Engineering safeguard, not a rule: no legal sequence between two decisions
 * comes anywhere near this many steps, so reaching it means an engine bug.
 * (Loops that the rules themselves allow are handled by CR-11.1, STEP 4d.)
 */
const MAX_STEPS_BETWEEN_DECISIONS = 100_000;

function stepFrame(ctx: Ctx, frame: Frame): void {
  switch (frame.kind) {
    case 'SETUP':
      return stepSetup(ctx, frame);
    case 'MULLIGAN':
      return stepMulligan(ctx, frame);
    case 'TURN':
      return stepTurn(ctx, frame);
    case 'CHECK_TIMING':
      return stepCheckTiming(ctx, frame);
    case 'DRAW':
      return stepDraw(ctx, frame);
    case 'REFRESH':
      return stepRefresh(ctx, frame);
    case 'LEVEL_UP':
      return stepLevelUp(ctx, frame);
    case 'RULE_ACTION_ORDER':
      return stepRuleActionOrder(ctx, frame);
    case 'ATTACK_PHASE':
      return stepAttackPhase(ctx, frame);
    case 'TRIGGER_ICON':
      return stepTriggerIcon(ctx, frame);
    case 'DAMAGE':
      return stepDamage(ctx, frame);
    case 'AUTO':
      return stepAuto(ctx, frame);
  }
}

export function run(ctx: Ctx): void {
  const state = ctx.state;
  for (let i = 0; i < MAX_STEPS_BETWEEN_DECISIONS; i++) {
    if (state.result || state.pending) return;

    // CR-9.1.2.1: interrupt rule actions come before anything else. While an
    // answer is being delivered nothing has moved since the question was
    // asked, so there is nothing new to check.
    if (state.answer === null && pushInterruptIfDue(ctx)) continue;

    const frame = state.stack[state.stack.length - 1];
    if (!frame) throw new Error('Engine bug: nothing left to do but the game has not ended');
    stepFrame(ctx, frame);
    // CR-8.7.2: whatever just happened may have met trigger conditions.
    if (!state.result) registerTriggers(ctx);
  }
  throw new Error('Engine bug: no decision reached after an excessive number of steps');
}
