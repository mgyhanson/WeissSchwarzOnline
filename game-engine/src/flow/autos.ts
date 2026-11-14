/**
 * Automatic abilities (CR-8.7), as far as the rules themselves define them:
 * the encore every character has (CR-10.2.3) and the ability created by a
 * shot trigger (CR-4.14.2.7). Abilities printed on cards arrive with the
 * ability engine of STEP 4d and use the same waiting list.
 */

import { canPayCost, countUse, limitReached, playAbility } from '../abilities/effects';
import { activeSources, evalCondition, grantedAutos, matchesFilter } from '../abilities/query';
import type { AutoAbility, EffectContext, Trigger } from '../abilities/types';
import type { AbilityOption } from '../decisions';
import type { GameEvent } from '../events';
import type { Ctx } from '../moves';
import { moveCard } from '../moves';
import { payStock } from '../play';
import { getInstance } from '../state';
import type { CardInstance, GameState, PlayerId, SlotId, WaitingAuto } from '../types';
import { ENCORE_COST, opponentOf } from '../types';
import { canSee } from '../visibility';
import { stageSlot } from '../zones';
import { attackerInstance, defenderInstance } from './attack-state';
import { ask, popFrame, pushFrame, takeAnswer, topOf } from './core';
import { pushDamage } from './damage';
import type { Frame } from './frames';

/** An automatic ability a card has: printed (index >= 0) or given to it (index -1, `granted` set). */
interface FoundAuto {
  index: number;
  ability: AutoAbility;
  granted?: AutoAbility;
}

/** Puts an automatic ability of a card into the waiting state (CR-8.7.2). */
function wait(
  state: GameState,
  master: PlayerId,
  card: CardInstance,
  found: FoundAuto,
  battleOpponent: number | null,
  slot: { player: PlayerId; slot: SlotId } | null = null,
): void {
  state.waiting.push({
    id: state.nextWaitingId++,
    kind: 'CARD',
    master,
    instanceId: card.instanceId,
    objectId: card.objectId,
    ability: found.index,
    battleOpponent,
    slot,
    ...(found.granted ? { granted: found.granted } : {}),
  });
}

/** Whether an automatic ability of an active source is in force: アラーム ones only from the clock, others only elsewhere (CR-10.1). */
function inForce(source: { clockTop: boolean }, ability: AutoAbility): boolean {
  return Boolean(ability.alarm) === source.clockTop;
}

/**
 * The automatic abilities of a card whose trigger satisfies `match`: its
 * printed ones and those it has been given (`grants`, by default the ones it
 * has now).
 */
function autosOf(
  state: GameState,
  card: CardInstance,
  match: (trigger: Trigger) => boolean,
  grants: readonly AutoAbility[] = grantedAutos(state, card.instanceId),
): FoundAuto[] {
  const found: FoundAuto[] = [];
  // …した時か…した時: the ability triggers (once) when any of its trigger conditions is met.
  const met = (trigger: Trigger): boolean => (trigger.on === 'EITHER' ? trigger.of.some(met) : match(trigger));
  (state.defs[card.cardId]?.abilities ?? []).forEach((ability, index) => {
    if (ability.type === 'AUTO' && met(ability.trigger)) found.push({ index, ability });
  });
  for (const ability of grants) {
    if (met(ability.trigger)) found.push({ index: -1, ability, granted: ability });
  }
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

/** Abilities of the cards in force whose trigger is met, for triggers of the "when something happens" kind. */
function sourcesWith(state: GameState, master: PlayerId | 'ANY', match: (trigger: Trigger, sourceMaster: PlayerId) => boolean): void {
  for (const source of activeSources(state)) {
    if (master !== 'ANY' && source.master !== master) continue;
    const sourceCard = state.instances[source.instanceId] as CardInstance;
    for (const found of autosOf(state, sourceCard, (t) => match(t, source.master))) {
      if (inForce(source, found.ability)) wait(state, source.master, sourceCard, found, null);
    }
  }
}

/** Trigger conditions of card abilities met by one event. */
function registerCardTriggers(state: GameState, event: GameEvent): void {
  switch (event.type) {
    case 'CARD_MOVED': {
      const card = state.instances[event.instanceId] as CardInstance;
      if (card.objectId !== event.toObjectId) return;
      // このカードが(手札から)舞台に置かれた時 / 手札から舞台に置かれた時か『チェンジ』で舞台に置かれた時
      if (event.to.zone === 'stage' && event.from.zone !== 'stage') {
        const fromHand = event.from.zone === 'hand';
        const byChange = event.reason === 'CHANGE';
        const placed = autosOf(
          state,
          card,
          (t) => t.on === 'PLACED_ON_STAGE' && (t.from === undefined || (t.from === 'HAND' ? fromHand : fromHand || byChange)),
        );
        for (const found of placed) wait(state, event.to.player, card, found, null);
      }
      // このカードが舞台から控え室に置かれた時. CR-8.7.4.1.2: the card as it was
      // on the stage, including abilities it had been given there.
      if (event.from.zone === 'stage' && event.to.zone === 'waitingRoom') {
        const left = autosOf(state, card, (t) => t.on === 'STAGE_TO_WAITING_ROOM', event.stageGrants ?? []);
        for (const found of left) wait(state, event.from.player, card, found, null, { player: event.from.player, slot: event.from.slot });
      }
      if (event.to.zone === 'climax' && event.from.zone !== 'climax') {
        // このカードが手札からクライマックス置場に置かれた時
        if (event.from.zone === 'hand') {
          for (const found of autosOf(state, card, (t) => t.on === 'THIS_CLIMAX_PLACED')) wait(state, event.to.player, card, found, null);
        }
        // あなたのクライマックスがクライマックス置場に置かれた時
        sourcesWith(state, event.to.player, (t) => t.on === 'CLIMAX_PLACED' && matchesFilter(state, event.instanceId, t.filter));
      }
      return;
    }
    case 'TRIGGER_CHECK': {
      // あなたのキャラのトリガーチェックで…がでた時. The card is in the resolution zone now.
      const checked = topOf(state.zones[event.player].resolution);
      if (checked === undefined) return;
      sourcesWith(state, event.player, (t) => t.on === 'TRIGGER_CHECK_REVEALS' && matchesFilter(state, checked, t.filter));
      return;
    }
    case 'ABILITY_PLAYED': {
      // あなたがこのカードの『助太刀』を使った時 (CR-10.5.3: its cost has been paid).
      const card = state.instances[event.instanceId] as CardInstance;
      const played = state.defs[card.cardId]?.abilities?.[event.ability];
      if (!played || played.type !== 'ACT' || !(played.keywords ?? []).includes('BACKUP')) return;
      for (const found of autosOf(state, card, (t) => t.on === 'USED_BACKUP', [])) wait(state, event.player, card, found, null);
      return;
    }
    case 'ATTACK_DECLARED': {
      // このカードがアタックした時
      const attacker = attackerInstance(state);
      if (!attacker || attacker.objectId !== event.attackerObjectId) return;
      const defender = defenderInstance(state);
      for (const found of autosOf(state, attacker, (t) => t.on === 'ATTACKS')) {
        wait(state, event.player, attacker, found, defender ? defender.objectId : null);
      }
      // 他のあなたの…のキャラがアタックした時: abilities of the attacking player's other cards in force.
      for (const source of activeSources(state)) {
        if (source.master !== event.player || source.instanceId === attacker.instanceId) continue;
        const sourceCard = state.instances[source.instanceId] as CardInstance;
        for (const found of autosOf(state, sourceCard, (t) => t.on === 'OTHER_ATTACKS' && matchesFilter(state, attacker.instanceId, t.filter))) {
          if (inForce(source, found.ability)) wait(state, source.master, sourceCard, found, null);
        }
      }
      return;
    }
    case 'ORIENTATION_CHANGED': {
      if (event.to !== 'REVERSE') return;
      const card = state.instances[event.instanceId] as CardInstance;
      const opponent = battleOpponentOf(state, card);
      // このカードが【リバース】した時
      // バトル中のこのカード: the attacking or defending character of a front attack (CR-7.2.1.5.1).
      for (const found of autosOf(state, card, (t) => t.on === 'REVERSED' && (!t.inBattle || opponent !== null))) {
        wait(state, event.player, card, found, opponent ? opponent.objectId : null);
      }
      // このカードのバトル相手が【リバース】した時
      if (opponent) {
        for (const found of autosOf(state, opponent, (t) => t.on === 'BATTLE_OPPONENT_REVERSED')) {
          wait(state, opponent.location.player, opponent, found, card.objectId);
        }
      }
      return;
    }
    case 'PHASE_STARTED':
      // (あなたの/相手の)…フェイズの始めに
      sourcesWith(state, 'ANY', (t, master) => {
        const whose = master === event.player ? 'YOURS' : 'OPPONENT';
        return t.on === 'PHASE_START' && t.phase === event.phase && (t.turn === 'ANY' || t.turn === whose);
      });
      return;
    case 'STEP_STARTED':
      // (あなたの/相手の)…ステップの始めに
      sourcesWith(state, 'ANY', (t, master) => {
        const whose = master === event.player ? 'YOURS' : 'OPPONENT';
        return t.on === 'STEP_START' && t.step === event.step && (t.turn === 'ANY' || t.turn === whose);
      });
      return;
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
    return { id: ability.id, type: 'ENCORE', ...(stillThere ? { card: ability.objectId } : {}), ...knownCardId(ability.master, inst) };
  }
  if (ability.kind === 'CARD') {
    const inst = getInstance(state, ability.instanceId);
    // The card is named only while it is still the public object that triggered.
    const visible = inst.objectId === ability.objectId && isPublicZone(inst.location.zone);
    return {
      id: ability.id,
      type: 'CARD',
      ability: ability.ability,
      ...(ability.granted ? { granted: true } : {}),
      ...(visible ? { card: ability.objectId } : {}),
      ...knownCardId(ability.master, inst),
    };
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
    ask(ctx, { kind: 'CONFIRM', player: master, prompt: 'ENCORE', ...(stillThere ? { card: ability.objectId } : {}), ...knownCardId(master, inst) });
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
  const ability = waiting.granted ?? state.defs[getInstance(state, waiting.instanceId).cardId]?.abilities?.[waiting.ability];
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
    ...(ability.keywords ? { keywords: [...ability.keywords] } : {}),
  };
  const costs = ability.cost ?? [];

  if (!frame.asked) {
    // CR-10.19.3: a limited ability already played the allowed number of times cannot be played.
    if (limitReached(state, waiting.objectId, waiting.ability, ability.limit)) {
      popFrame(ctx, frame);
      return;
    }
    // "... なら": the condition is checked when the ability resolves.
    if (!evalCondition(state, master, waiting.instanceId, ability.condition, waiting.battleOpponent)) {
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
function cardRef(state: GameState, waiting: Extract<WaitingAuto, { kind: 'CARD' }>): { card?: number; cardId?: string } {
  const inst = getInstance(state, waiting.instanceId);
  return {
    ...(inst.objectId === waiting.objectId && isPublicZone(inst.location.zone) ? { card: waiting.objectId } : {}),
    ...knownCardId(waiting.master, inst),
  };
}

/**
 * The card id of the card an ability belongs to, for its master's question,
 * when the master can see that card where it is now. A client needs it to
 * show which ability is meant after the card has moved (it then has a new
 * object id). Only the deciding player receives a decision, so nothing hidden
 * from them is revealed.
 */
function knownCardId(master: PlayerId, inst: CardInstance): { cardId?: string } {
  return canSee(master, inst) ? { cardId: inst.cardId } : {};
}

/** Zones where the card of a waiting ability can be named without revealing anything (CR-3). */
function isPublicZone(zone: string): boolean {
  return zone === 'stage' || zone === 'waitingRoom' || zone === 'clock' || zone === 'climax';
}
