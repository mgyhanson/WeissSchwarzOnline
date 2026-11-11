/**
 * Automatic abilities (CR-8.7), as far as the rules themselves define them:
 * the encore every character has (CR-10.2.3) and the ability created by a
 * shot trigger (CR-4.14.2.7). Abilities printed on cards arrive with the
 * ability engine of STEP 4d and use the same waiting list.
 */

import { canPayCost, countUse, limitReached, playAbility } from '../abilities/effects';
import { activeSources, evalCondition } from '../abilities/query';
import type { AutoAbility, EffectContext, Trigger } from '../abilities/types';
import type { AbilityOption } from '../decisions';
import type { GameEvent } from '../events';
import type { Ctx } from '../moves';
import { moveCard } from '../moves';
import { payStock } from '../play';
import { getInstance } from '../state';
import type { CardInstance, GameState, PlayerId, SlotId, WaitingAuto } from '../types';
import { ENCORE_COST, opponentOf } from '../types';
import { stageSlot } from '../zones';
import { attackerInstance, defenderInstance } from './attack-state';
import { ask, popFrame, pushFrame, takeAnswer } from './core';
import { pushDamage } from './damage';
import type { Frame } from './frames';

/** Puts automatic ability number `ability` of a card into the waiting state (CR-8.7.2). */
function wait(
  state: GameState,
  master: PlayerId,
  card: CardInstance,
  ability: number,
  battleOpponent: number | null,
  slot: { player: PlayerId; slot: SlotId } | null = null,
): void {
  state.waiting.push({
    id: state.nextWaitingId++,
    kind: 'CARD',
    master,
    instanceId: card.instanceId,
    objectId: card.objectId,
    ability,
    battleOpponent,
    slot,
  });
}

/** Whether an automatic ability of an active source is in force: アラーム ones only from the clock, others only elsewhere (CR-10.1). */
function inForce(source: { clockTop: boolean }, ability: AutoAbility): boolean {
  return Boolean(ability.alarm) === source.clockTop;
}

/** The automatic abilities of a card whose trigger satisfies `match`, as [number, ability] pairs. */
function autosOf(state: GameState, card: CardInstance, match: (trigger: Trigger) => boolean): [number, AutoAbility][] {
  const abilities = state.defs[card.cardId]?.abilities ?? [];
  const found: [number, AutoAbility][] = [];
  abilities.forEach((ability, index) => {
    if (ability.type === 'AUTO' && match(ability.trigger)) found.push([index, ability]);
  });
  return found;
}

/** The other character of the battle a character is in (CR-7.2.1.5.1), if any. */
function battleOpponentOf(state: GameState, card: CardInstance): CardInstance | null {
  const attacker = attackerInstance(state);
  const defender = defenderInstance(state);
  if (!attacker || !defender) return null;
  if (attacker.instanceId === card.instanceId) return defender;
  if (defender.instanceId === card.instanceId) return attacker;
  return null;
}

/** Trigger conditions of card abilities met by one event. */
function registerCardTriggers(state: GameState, event: GameEvent): void {
  switch (event.type) {
    case 'CARD_MOVED': {
      const card = state.instances[event.instanceId] as CardInstance;
      // このカードが(手札から)舞台に置かれた時
      if (event.to.zone === 'stage' && event.from.zone !== 'stage' && card.objectId === event.toObjectId) {
        const fromHand = event.from.zone === 'hand';
        for (const [index] of autosOf(state, card, (t) => t.on === 'PLACED_ON_STAGE' && (t.from !== 'HAND' || fromHand))) {
          wait(state, event.to.player, card, index, null);
        }
      }
      // このカードが舞台から控え室に置かれた時 (CR-8.7.4.1.2: judged by what the card was on the stage)
      if (event.from.zone === 'stage' && event.to.zone === 'waitingRoom' && card.objectId === event.toObjectId) {
        for (const [index] of autosOf(state, card, (t) => t.on === 'STAGE_TO_WAITING_ROOM')) {
          wait(state, event.from.player, card, index, null, { player: event.from.player, slot: event.from.slot });
        }
      }
      // あなたのクライマックスがクライマックス置場に置かれた時
      if (event.to.zone === 'climax' && event.from.zone !== 'climax') {
        for (const source of activeSources(state)) {
          if (source.master !== event.to.player) continue;
          const sourceCard = state.instances[source.instanceId] as CardInstance;
          for (const [index, ability] of autosOf(state, sourceCard, (t) => t.on === 'CLIMAX_PLACED')) {
            if (inForce(source, ability)) wait(state, source.master, sourceCard, index, null);
          }
        }
      }
      return;
    }
    case 'ATTACK_DECLARED': {
      // このカードがアタックした時
      const attacker = attackerInstance(state);
      if (!attacker || attacker.objectId !== event.attackerObjectId) return;
      const defender = defenderInstance(state);
      for (const [index] of autosOf(state, attacker, (t) => t.on === 'ATTACKS')) {
        wait(state, event.player, attacker, index, defender ? defender.objectId : null);
      }
      return;
    }
    case 'ORIENTATION_CHANGED': {
      if (event.to !== 'REVERSE') return;
      const card = state.instances[event.instanceId] as CardInstance;
      const opponent = battleOpponentOf(state, card);
      // このカードが【リバース】した時
      for (const [index] of autosOf(state, card, (t) => t.on === 'REVERSED')) {
        wait(state, event.player, card, index, opponent ? opponent.objectId : null);
      }
      // このカードのバトル相手が【リバース】した時
      if (opponent) {
        for (const [index] of autosOf(state, opponent, (t) => t.on === 'BATTLE_OPPONENT_REVERSED')) {
          wait(state, opponent.location.player, opponent, index, card.objectId);
        }
      }
      return;
    }
    case 'PHASE_STARTED': {
      // (あなたの/相手の)…フェイズの始めに
      for (const source of activeSources(state)) {
        const whose = source.master === event.player ? 'YOURS' : 'OPPONENT';
        const sourceCard = state.instances[source.instanceId] as CardInstance;
        const matching = autosOf(
          state,
          sourceCard,
          (t) => t.on === 'PHASE_START' && t.phase === event.phase && (t.turn === 'ANY' || t.turn === whose),
        );
        for (const [index, ability] of matching) {
          if (inForce(source, ability)) wait(state, source.master, sourceCard, index, null);
        }
      }
      return;
    }
    case 'STEP_STARTED': {
      // (あなたの/相手の)…ステップの始めに
      for (const source of activeSources(state)) {
        const whose = source.master === event.player ? 'YOURS' : 'OPPONENT';
        const sourceCard = state.instances[source.instanceId] as CardInstance;
        const matching = autosOf(
          state,
          sourceCard,
          (t) => t.on === 'STEP_START' && t.step === event.step && (t.turn === 'ANY' || t.turn === whose),
        );
        for (const [index, ability] of matching) {
          if (inForce(source, ability)) wait(state, source.master, sourceCard, index, null);
        }
      }
      return;
    }
    default:
      return;
  }
}

/**
 * CR-8.7.2: looks at the events not examined yet and puts the abilities
 * whose trigger condition they meet into the waiting state. Called by the
 * engine loop after every step.
 */
export function registerTriggers(ctx: Ctx): void {
  const state = ctx.state;
  for (; ctx.triggerCursor < ctx.events.length; ctx.triggerCursor++) {
    const event = ctx.events[ctx.triggerCursor]!;
    registerCardTriggers(state, event);
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
  if (ability.kind === 'CARD') {
    const inst = getInstance(state, ability.instanceId);
    // The card is named only while it is still the public object that triggered.
    const visible = inst.objectId === ability.objectId && isPublicZone(inst.location.zone);
    return { id: ability.id, type: 'CARD', ability: ability.ability, ...(visible ? { card: ability.objectId } : {}) };
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

  if (ability.kind === 'CARD') {
    stepCardAuto(ctx, frame, ability);
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

/**
 * Plays and resolves an automatic ability printed on a card (CR-8.7.3).
 *
 * The ability was put into the waiting state when its trigger condition was
 * met; here its "if ..." condition is checked, the player is asked about an
 * optional cost or an optional effect, and the effects are queued.
 */
function stepCardAuto(ctx: Ctx, frame: Extract<Frame, { kind: 'AUTO' }>, waiting: Extract<WaitingAuto, { kind: 'CARD' }>): void {
  const state = ctx.state;
  const { master } = waiting;
  const ability = state.defs[getInstance(state, waiting.instanceId).cardId]?.abilities?.[waiting.ability];
  if (!ability || ability.type !== 'AUTO') {
    popFrame(ctx, frame);
    return;
  }
  const sourceLocation = getInstance(state, waiting.instanceId).location;
  const context: EffectContext = {
    master,
    source: waiting.instanceId,
    sourceObjectId: waiting.objectId,
    chosen: [],
    battleOpponent: waiting.battleOpponent,
    sourceSlot: waiting.slot ?? (sourceLocation.zone === 'stage' ? { player: sourceLocation.player, slot: sourceLocation.slot } : null),
  };
  const costs = ability.cost ?? [];

  if (!frame.asked) {
    // CR-10.19.3: a limited ability already played the allowed number of times cannot be played.
    if (limitReached(state, waiting.objectId, waiting.ability, ability.limit)) {
      popFrame(ctx, frame);
      return;
    }
    // "... なら": the condition is checked when the ability resolves.
    if (!evalCondition(state, master, waiting.instanceId, ability.condition)) {
      popFrame(ctx, frame);
      return;
    }
    if (costs.length > 0) {
      // CR-8.1.1.2.2: "you may pay the cost". A cost that cannot be paid is not offered (CR-8.4.2.2).
      if (!canPayCost(state, context, costs)) {
        popFrame(ctx, frame);
        return;
      }
      frame.asked = true;
      ask(ctx, { kind: 'CONFIRM', player: master, prompt: 'PAY_COST', ability: waiting.ability, ...cardRef(state, waiting) });
      return;
    }
    if (ability.optional) {
      frame.asked = true;
      ask(ctx, { kind: 'CONFIRM', player: master, prompt: 'USE_ABILITY', ability: waiting.ability, ...cardRef(state, waiting) });
      return;
    }
  } else if (!takeAnswer(ctx, 'CONFIRM').accept) {
    // CR-8.7.3.2.1: the ability was played all the same; it simply does nothing.
    popFrame(ctx, frame);
    return;
  }

  popFrame(ctx, frame);
  countUse(state, waiting.objectId, waiting.ability);
  playAbility(ctx, context, waiting.ability, costs, ability.effect);
}

/** The card of a waiting ability for display, while it is still the public object that triggered. */
function cardRef(state: GameState, waiting: Extract<WaitingAuto, { kind: 'CARD' }>): { card?: number } {
  const inst = getInstance(state, waiting.instanceId);
  return inst.objectId === waiting.objectId && isPublicZone(inst.location.zone) ? { card: waiting.objectId } : {};
}

/** Zones where the card of a waiting ability can be named without revealing anything (CR-3). */
function isPublicZone(zone: string): boolean {
  return zone === 'stage' || zone === 'waitingRoom' || zone === 'clock' || zone === 'climax';
}
