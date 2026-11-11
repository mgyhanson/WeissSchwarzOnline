/**
 * Automatic abilities (CR-8.7), as far as the rules themselves define them:
 * the encore every character has (CR-10.2.3) and the ability created by a
 * shot trigger (CR-4.14.2.7). Abilities printed on cards arrive with the
 * ability engine of STEP 4d and use the same waiting list.
 */

import type { AbilityOption } from '../decisions';
import type { Ctx } from '../moves';
import { moveCard } from '../moves';
import { payStock } from '../play';
import { getInstance } from '../state';
import type { GameState, WaitingAuto } from '../types';
import { ENCORE_COST, opponentOf } from '../types';
import { stageSlot } from '../zones';
import { ask, popFrame, pushFrame, takeAnswer } from './core';
import { pushDamage } from './damage';
import type { Frame } from './frames';

/**
 * CR-8.7.2: looks at the events not examined yet and puts the abilities
 * whose trigger condition they meet into the waiting state. Called by the
 * engine loop after every step.
 */
export function registerTriggers(ctx: Ctx): void {
  const state = ctx.state;
  for (; ctx.triggerCursor < ctx.events.length; ctx.triggerCursor++) {
    const event = ctx.events[ctx.triggerCursor]!;
    if (event.type !== 'CARD_MOVED') continue;

    // CR-10.2.2: "when this character is put from the stage into the waiting
    // room". CR-10.2.3: every character has encore [3]. The ability belongs to
    // the player on whose stage the character was (CR-8.7.4.1.2).
    if (event.from.zone === 'stage' && event.to.zone === 'waitingRoom' && state.defs[event.cardId]?.kind === 'CHARACTER') {
      state.waiting.push({
        id: state.nextWaitingId++,
        kind: 'ENCORE',
        master: event.from.player,
        instanceId: event.instanceId,
        objectId: event.toObjectId,
        slot: event.from.slot,
      });
    }
  }
}

/** How a waiting ability is shown to its master when choosing an order (CR-8.7.3.1). */
export function describeWaiting(state: GameState, ability: WaitingAuto): AbilityOption {
  if (ability.kind === 'ENCORE') {
    const inst = getInstance(state, ability.instanceId);
    const stillThere = inst.objectId === ability.objectId && inst.location.zone === 'waitingRoom';
    return { id: ability.id, type: 'ENCORE', ...(stillThere ? { card: ability.objectId } : {}) };
  }
  return { id: ability.id, type: 'SHOT' };
}

/** CR-8.7.3: starts playing a waiting ability; its waiting state is used up. */
export function playWaiting(ctx: Ctx, id: number): void {
  const state = ctx.state;
  const index = state.waiting.findIndex((ability) => ability.id === id);
  if (index < 0) throw new Error(`Engine bug: no waiting ability ${id}`);
  const [ability] = state.waiting.splice(index, 1) as [WaitingAuto];
  pushFrame(ctx, { kind: 'AUTO', ability, asked: false });
}

export function stepAuto(ctx: Ctx, frame: Extract<Frame, { kind: 'AUTO' }>): void {
  const state = ctx.state;
  const ability = frame.ability;

  if (ability.kind === 'SHOT') {
    // CR-4.14.2.7: "deal 1 damage to your opponent". The source of this
    // damage is the trigger card, not the attacking character (CR-4.13.1.1.1).
    popFrame(ctx, frame);
    pushDamage(ctx, opponentOf(ability.master), 1, null);
    return;
  }

  // CR-10.2.2: "you may pay the cost. If you do, put this card in the slot
  // it was in, rested."
  const { master } = ability;
  const inst = getInstance(state, ability.instanceId);
  const stillThere = inst.objectId === ability.objectId && inst.location.zone === 'waitingRoom';

  if (!frame.asked) {
    // CR-8.4.2.2: a cost that cannot be paid in full cannot be paid. The size
    // of the stock is public, so nothing is revealed by not asking.
    if (state.zones[master].stock.length < ENCORE_COST) {
      popFrame(ctx, frame);
      return;
    }
    frame.asked = true;
    ask(ctx, { kind: 'CONFIRM', player: master, prompt: 'ENCORE', ...(stillThere ? { card: ability.objectId } : {}) });
    return;
  }

  const { accept } = takeAnswer(ctx, 'CONFIRM');
  popFrame(ctx, frame);
  if (!accept) return;

  payStock(ctx, master, ENCORE_COST);
  // CR-8.7.7: if the card is no longer the object that was put into the
  // waiting room, the effect cannot be carried out and does nothing.
  if (stillThere) {
    moveCard(ctx, ability.instanceId, stageSlot(master, ability.slot), { orientation: 'REST', reason: 'ENCORE' });
  }
}
