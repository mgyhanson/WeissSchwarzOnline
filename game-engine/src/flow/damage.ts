/**
 * Damage (CR-4.12).
 *
 * "Deal N damage to a player" is not a subtraction: the player turns over
 * cards from the top of their deck one at a time into the resolution zone.
 * A climax cancels the whole damage and sends the cards turned over so far
 * to the waiting room; otherwise, once N cards are there, they all go to the
 * clock together.
 *
 * Each card is turned over in its own engine step, so that a refresh
 * (CR-9.2) or a level up (CR-9.3) caused in the middle happens at exactly
 * that point, before the next card.
 */

import type { Ctx } from '../moves';
import { moveCard, moveCards } from '../moves';
import { getDef } from '../state';
import type { PlayerId } from '../types';
import { emit, popFrame, pushFrame, topOf } from './core';
import type { Frame } from './frames';

type DamageFrame = Extract<Frame, { kind: 'DAMAGE' }>;

/**
 * Starts a damage process. `sourceObjectId` is the attacking character for
 * damage dealt by an attack (CR-4.13.2.1) and null otherwise.
 * CR-7.5.1.2.1 / CR-1.3.2.2: zero or negative damage is not dealt at all.
 */
export function pushDamage(ctx: Ctx, receiver: PlayerId, amount: number, sourceObjectId: number | null): void {
  if (amount <= 0) return;
  pushFrame(ctx, { kind: 'DAMAGE', receiver, amount, sourceObjectId, cards: [], flipped: false });
}

function finish(ctx: Ctx, frame: DamageFrame, cancelled: boolean): void {
  const state = ctx.state;
  popFrame(ctx, frame);
  emit(ctx, {
    type: 'DAMAGE_DEALT',
    receiver: frame.receiver,
    amount: frame.amount,
    cancelled,
    sourceObjectId: frame.sourceObjectId,
  });

  // CR-4.14.2.7: a shot trigger watches the next damage dealt by the
  // attacking character. That damage has now been dealt: the watch ends,
  // and if the damage was cancelled the ability triggers (CR-4.14.2.7.1).
  if (frame.sourceObjectId !== null) {
    const stillWatching = [];
    for (const watcher of state.shotWatchers) {
      if (watcher.attackerObjectId !== frame.sourceObjectId) {
        stillWatching.push(watcher);
      } else if (cancelled) {
        state.waiting.push({ id: state.nextWaitingId++, kind: 'SHOT', master: watcher.master });
      }
    }
    state.shotWatchers = stillWatching;
  }
}

export function stepDamage(ctx: Ctx, frame: DamageFrame): void {
  const state = ctx.state;
  const { receiver } = frame;
  const zones = state.zones[receiver];

  if (!frame.flipped) {
    // CR-4.12.1.1: the top card of the deck goes face up to the resolution zone.
    const top = topOf(zones.deck);
    if (top === undefined) {
      // Unreachable in a legal game: an empty deck is refreshed before this
      // step, and with nothing to refresh the player has already lost
      // (CR-9.2.2.1). Should it happen, as much as possible is done (CR-1.3.2).
      moveCards(ctx, frame.cards, { player: receiver, zone: 'clock' }, { reason: 'DAMAGE' });
      finish(ctx, frame, false);
      return;
    }
    frame.cards.push(top);
    frame.flipped = true;
    moveCard(ctx, top, { player: receiver, zone: 'resolution' }, { reason: 'DAMAGE' });
    return;
  }

  frame.flipped = false;
  const last = frame.cards[frame.cards.length - 1] as number;

  if (getDef(state, last).kind === 'CLIMAX') {
    // CR-4.12.1.2: damage cancel. Every card moved by this damage goes to the waiting room.
    moveCards(ctx, frame.cards, { player: receiver, zone: 'waitingRoom' }, { reason: 'DAMAGE_CANCEL' });
    finish(ctx, frame, true);
    return;
  }

  if (frame.cards.length >= frame.amount) {
    // CR-4.12.1.3 / CR-3.13.1.3.1: all of them enter the clock together, order unchanged.
    moveCards(ctx, frame.cards, { player: receiver, zone: 'clock' }, { reason: 'DAMAGE' });
    finish(ctx, frame, false);
  }
  // Otherwise back to CR-4.12.1.1 for the next card.
}
