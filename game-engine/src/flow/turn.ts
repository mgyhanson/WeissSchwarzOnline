/**
 * The turn (CR-6).
 *
 * One TURN frame lives on the stack for the whole game and walks through
 * the steps below; when a turn ends it starts again for the next player.
 *
 * Not implemented yet, each marked where it belongs:
 *  - "at the beginning of ..." and "at the end of turn" trigger conditions
 *    (they need automatic abilities, STEP 4d);
 *  - the attack phase proper: attack declaration to battle step and the
 *    encore step (CR-7, STEP 4c). Until then the attack phase is entered and
 *    left without any attack.
 */

import type { Ctx } from '../moves';
import { moveCard, moveCards, setOrientation } from '../moves';
import { listMainActions, listPlayableClimaxes, performMainAction, playClimax } from '../play';
import { getInstance } from '../state';
import type { Phase, TurnState } from '../types';
import { HAND_LIMIT, SLOTS, opponentOf } from '../types';
import { ask, emit, findObject, objectIdsOf, pushCheckTiming, pushFrame, takeAnswer } from './core';
import type { Frame } from './frames';

function currentTurn(ctx: Ctx): TurnState {
  const turn = ctx.state.turn;
  if (!turn) throw new Error('Engine bug: a turn step ran before the game started');
  return turn;
}

function beginPhase(ctx: Ctx, phase: Phase): void {
  const turn = currentTurn(ctx);
  turn.phase = phase;
  emit(ctx, { type: 'PHASE_STARTED', turn: turn.number, player: turn.player, phase });
}

export function stepTurn(ctx: Ctx, frame: Extract<Frame, { kind: 'TURN' }>): void {
  const state = ctx.state;
  const turn = currentTurn(ctx);
  const player = turn.player;
  const zones = state.zones[player];

  switch (frame.step) {
    // ----- Stand phase (CR-6.2) -------------------------------------------
    case 'STAND_START':
      emit(ctx, { type: 'TURN_STARTED', turn: turn.number, player });
      beginPhase(ctx, 'STAND');
      // CR-6.2.1.1: "beginning of turn / stand phase" triggers (STEP 4d), then a check timing.
      frame.step = 'STAND_ACTION';
      pushCheckTiming(ctx);
      return;

    case 'STAND_ACTION':
      // CR-6.2.1.2: the turn player stands all characters on their stage.
      for (const slot of SLOTS) {
        for (const id of zones.stage[slot]) setOrientation(ctx, id, 'STAND');
      }
      // CR-6.2.1.3
      frame.step = 'DRAW_START';
      pushCheckTiming(ctx);
      return;

    // ----- Draw phase (CR-6.3) --------------------------------------------
    case 'DRAW_START':
      beginPhase(ctx, 'DRAW');
      // CR-6.3.1.1
      frame.step = 'DRAW_ACTION';
      pushCheckTiming(ctx);
      return;

    case 'DRAW_ACTION':
      // CR-6.3.1.2: the turn player draws one card. There is no exception
      // for the first turn of the game.
      frame.step = 'DRAW_END';
      pushFrame(ctx, { kind: 'DRAW', player, remaining: 1 });
      return;

    case 'DRAW_END':
      // CR-6.3.1.3
      frame.step = 'CLOCK_START';
      pushCheckTiming(ctx);
      return;

    // ----- Clock phase (CR-6.4) -------------------------------------------
    case 'CLOCK_START':
      beginPhase(ctx, 'CLOCK');
      // CR-6.4.1.1
      frame.step = 'CLOCK_ASK';
      pushCheckTiming(ctx);
      return;

    case 'CLOCK_ASK':
      // CR-6.4.1.2: the turn player may put one hand card into the clock.
      // With an empty hand (a public fact) there is nothing to choose.
      if (zones.hand.length === 0) {
        frame.step = 'CLOCK_END';
        return;
      }
      frame.step = 'CLOCK_ANSWER';
      ask(ctx, { kind: 'CLOCK', player, cards: objectIdsOf(state, zones.hand) });
      return;

    case 'CLOCK_ANSWER': {
      const { card } = takeAnswer(ctx, 'CLOCK');
      frame.step = 'CLOCK_END';
      if (card !== null) {
        // "If they do, they draw two cards." The draw is queued first so
        // that a level up caused by the clock card is performed before it.
        pushFrame(ctx, { kind: 'DRAW', player, remaining: 2 });
        moveCard(ctx, findObject(state, card).instanceId, { player, zone: 'clock' }, { reason: 'CLOCK_PHASE' });
      }
      return;
    }

    case 'CLOCK_END':
      // CR-6.4.1.3
      frame.step = 'MAIN_START';
      pushCheckTiming(ctx);
      return;

    // ----- Main phase (CR-6.5) --------------------------------------------
    case 'MAIN_START':
      beginPhase(ctx, 'MAIN');
      // CR-6.5.1.1: "beginning of main phase" triggers (STEP 4d).
      frame.step = 'MAIN_TIMING';
      return;

    case 'MAIN_TIMING':
      // CR-6.5.1.2 / CR-8.5.2.1: a play timing always starts with a check timing.
      frame.step = 'MAIN_ASK';
      pushCheckTiming(ctx);
      return;

    case 'MAIN_ASK':
      frame.step = 'MAIN_ANSWER';
      ask(ctx, { kind: 'MAIN', player, actions: listMainActions(state, player) });
      return;

    case 'MAIN_ANSWER': {
      const { action } = takeAnswer(ctx, 'MAIN');
      if (action.type === 'PASS') {
        // CR-6.5.1.3
        frame.step = 'CLIMAX_START';
        return;
      }
      // CR-4.5.3.1: after an action the player gets another play timing.
      frame.step = 'MAIN_TIMING';
      performMainAction(ctx, player, action);
      return;
    }

    // ----- Climax phase (CR-6.6) ------------------------------------------
    case 'CLIMAX_START':
      beginPhase(ctx, 'CLIMAX');
      // CR-6.6.1.1: "beginning of climax phase" triggers (STEP 4d).
      // CR-6.6.1.2: play timing, preceded by its check timing.
      frame.step = 'CLIMAX_ASK';
      pushCheckTiming(ctx);
      return;

    case 'CLIMAX_ASK':
      // Asked even when no climax can be played: skipping the question
      // would tell the opponent something about the hand.
      frame.step = 'CLIMAX_ANSWER';
      ask(ctx, { kind: 'CLIMAX', player, cards: listPlayableClimaxes(state, player) });
      return;

    case 'CLIMAX_ANSWER': {
      const { card } = takeAnswer(ctx, 'CLIMAX');
      // CR-6.6.1.2.2: whatever the player did, there is no second play timing.
      // CR-6.6.1.3: check timing, then the attack phase.
      frame.step = 'ATTACK_START';
      pushCheckTiming(ctx);
      if (card !== null) playClimax(ctx, player, card);
      return;
    }

    // ----- Attack phase (CR-6.7, CR-7) ------------------------------------
    case 'ATTACK_START':
      beginPhase(ctx, 'ATTACK');
      // STEP 4c: attack declaration, trigger, counter, damage and battle
      // steps, then the encore step. For now the phase has no attacks.
      frame.step = 'END_START';
      pushCheckTiming(ctx);
      return;

    // ----- End phase (CR-6.8) ---------------------------------------------
    case 'END_START':
      beginPhase(ctx, 'END');
      // CR-6.8.1.1: "at the end of turn" triggers (STEP 4d), then a check timing.
      frame.step = 'END_HAND_LIMIT';
      pushCheckTiming(ctx);
      return;

    case 'END_HAND_LIMIT': {
      // CR-6.8.1.2: discard down to the hand limit.
      const excess = zones.hand.length - HAND_LIMIT;
      if (excess <= 0) {
        frame.step = 'END_CLIMAX';
        return;
      }
      frame.step = 'END_HAND_LIMIT_ANSWER';
      ask(ctx, { kind: 'HAND_LIMIT', player, cards: objectIdsOf(state, zones.hand), count: excess });
      return;
    }

    case 'END_HAND_LIMIT_ANSWER': {
      const discard = takeAnswer(ctx, 'HAND_LIMIT').discard.map((objectId) => findObject(state, objectId).instanceId);
      frame.step = 'END_CLIMAX';
      moveCards(ctx, discard, { player, zone: 'waitingRoom' }, { reason: 'HAND_LIMIT' });
      return;
    }

    case 'END_CLIMAX':
      // CR-6.8.1.3: the card in the turn player's climax zone goes to the waiting room.
      frame.step = 'END_CHECK';
      for (const id of [...zones.climax]) {
        moveCard(ctx, id, { player: getInstance(state, id).owner, zone: 'waitingRoom' }, { reason: 'END_PHASE' });
      }
      return;

    case 'END_CHECK':
      // CR-6.8.1.4: check timing; afterwards "until end of turn" effects end (STEP 4d).
      frame.step = 'END_FINISH';
      pushCheckTiming(ctx);
      return;

    case 'END_FINISH':
      // CR-6.8.1.5: the turn ends only if the hand is within the limit and
      // nothing was resolved in that last check timing. Otherwise the end
      // phase is performed again from the start.
      if (state.lastCheckActed || zones.hand.length > HAND_LIMIT) {
        frame.step = 'END_START';
        return;
      }
      state.turn = { number: turn.number + 1, player: opponentOf(player), phase: 'STAND' };
      frame.step = 'STAND_START';
      return;
  }
}
