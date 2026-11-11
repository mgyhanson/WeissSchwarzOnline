/**
 * The procedure before the game (CR-5.2).
 *
 * Presenting the decks and checking that they are legal (CR-5.2.1.1) is the
 * job of the deck validator before a game is created.
 */

import type { Ctx } from '../moves';
import { moveCards, shuffleDeck } from '../moves';
import { nextInt } from '../rng';
import type { PlayerId } from '../types';
import { opponentOf } from '../types';
import { ask, emit, findObject, objectIdsOf, popFrame, pushFrame, takeAnswer } from './core';
import type { Frame } from './frames';

/** CR-5.2.1.4: number of cards in the opening hand. */
export const OPENING_HAND_SIZE = 5;

export function stepSetup(ctx: Ctx, frame: Extract<Frame, { kind: 'SETUP' }>): void {
  const state = ctx.state;

  switch (frame.step) {
    case 0:
      // CR-5.2.1.2: each player shuffles their deck.
      shuffleDeck(ctx, 0);
      shuffleDeck(ctx, 1);
      frame.step = 1;
      return;

    case 1: {
      // CR-5.2.1.3: the first player is decided at random. Nobody gets to choose.
      const firstPlayer = nextInt(state.rng, 2) as PlayerId;
      state.firstPlayer = firstPlayer;
      emit(ctx, { type: 'GAME_STARTED', firstPlayer });
      frame.step = 2;
      return;
    }

    case 2: {
      // CR-5.2.1.4: each player draws five cards.
      const first = state.firstPlayer as PlayerId;
      frame.step = 3;
      pushFrame(ctx, { kind: 'DRAW', player: opponentOf(first), remaining: OPENING_HAND_SIZE });
      pushFrame(ctx, { kind: 'DRAW', player: first, remaining: OPENING_HAND_SIZE });
      return;
    }

    case 3: {
      // CR-5.2.1.4: starting with the first player, each player once.
      const first = state.firstPlayer as PlayerId;
      frame.step = 4;
      pushFrame(ctx, { kind: 'MULLIGAN', player: opponentOf(first), asked: false });
      pushFrame(ctx, { kind: 'MULLIGAN', player: first, asked: false });
      return;
    }

    default: {
      // CR-5.2.1.5: the game starts with the first player as turn player.
      const first = state.firstPlayer as PlayerId;
      state.turn = { number: 1, player: first, phase: 'STAND', attackCount: 0 };
      popFrame(ctx, frame);
      pushFrame(ctx, { kind: 'TURN', step: 'STAND_START' });
    }
  }
}

/**
 * CR-5.2.1.4: the player puts any number of hand cards into the waiting
 * room and draws that many.
 */
export function stepMulligan(ctx: Ctx, frame: Extract<Frame, { kind: 'MULLIGAN' }>): void {
  const state = ctx.state;
  const { player } = frame;

  if (!frame.asked) {
    frame.asked = true;
    ask(ctx, { kind: 'MULLIGAN', player, cards: objectIdsOf(state, state.zones[player].hand) });
    return;
  }

  const discard = takeAnswer(ctx, 'MULLIGAN').discard.map((objectId) => findObject(state, objectId).instanceId);
  popFrame(ctx, frame);
  pushFrame(ctx, { kind: 'DRAW', player, remaining: discard.length });
  moveCards(ctx, discard, { player, zone: 'waitingRoom' }, { reason: 'MULLIGAN' });
}
