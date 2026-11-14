/**
 * The interpreter: pays costs and carries out effects written in the data
 * format of abilities/types.ts.
 *
 * Like everything else in the flow, it advances one small step at a time
 * and can stop at any point for a player's choice.
 */

import { ask, emit, findObject, popFrame, pushFrame, takeAnswer, topOf } from '../flow/core';
import { pushDamage } from '../flow/damage';
import type { Frame } from '../flow/frames';
import type { BatchMove, Ctx } from '../moves';
import { moveBatch, moveCard, moveCards, revealCard, setOrientation, shuffleDeck } from '../moves';
import { getDef, getInstance } from '../state';
import { addModifier, nextOpponentTurn } from '../stats';
import type { GameState, ZoneRef } from '../types';
import { SLOTS, opponentOf } from '../types';
import { BACK_SLOTS } from '../zones';
import { chooseCandidates, evalCondition, matchesFilter, perCount, resolveTarget, sourceIfUnchanged } from './query';
import type { Cost, Destination, Effect, EffectContext } from './types';

// ---------------------------------------------------------------------------
// Costs (CR-8.4)
// ---------------------------------------------------------------------------

/** Standing characters that may be rested for a REST_CHARACTERS cost. */
function restable(state: GameState, context: EffectContext, cost: Extract<Cost, { pay: 'REST_CHARACTERS' }>): number[] {
  const stage = state.zones[context.master].stage;
  return SLOTS.flatMap((slot) => stage[slot]).filter(
    (id) => getInstance(state, id).orientation === 'STAND' && !(cost.other && id === context.source) && matchesFilter(state, id, cost.filter),
  );
}

/** Hand cards that may be discarded for a DISCARD cost: matching ones other than the card itself. */
function discardable(state: GameState, context: EffectContext, cost: Extract<Cost, { pay: 'DISCARD' }>): number[] {
  return state.zones[context.master].hand.filter((id) => id !== context.source && matchesFilter(state, id, cost.filter));
}

/**
 * CR-8.4.2.2: a cost can only be paid in full. CR-8.4.2.2.1: every action of
 * it must be possible, each counted separately.
 */
export function canPayCost(state: GameState, context: EffectContext, costs: readonly Cost[]): boolean {
  const zones = state.zones[context.master];
  let stockNeeded = 0;
  let discardsNeeded = 0;
  let deckNeeded = 0;
  for (const cost of costs) {
    switch (cost.pay) {
      case 'STOCK':
        stockNeeded += cost.count;
        break;
      case 'REST_SELF': {
        const self = sourceIfUnchanged(state, context);
        if (!self || self.location.zone !== 'stage' || self.orientation !== 'STAND') return false;
        break;
      }
      case 'DISCARD':
        if (discardable(state, context, cost).length < cost.count) return false;
        discardsNeeded += cost.count;
        break;
      case 'SELF_TO_WAITING_ROOM':
      case 'SELF_TO_CLOCK':
      case 'SELF_TO_MEMORY':
      case 'SELF_TO_DECK_BOTTOM':
        if (!sourceIfUnchanged(state, context)) return false;
        break;
      case 'HAND_TO_CLOCK':
        // Hand cards other than the card itself, like a discard; each hand card can pay only one of them.
        if (zones.hand.filter((id) => id !== context.source && matchesFilter(state, id, cost.filter)).length < cost.count) return false;
        discardsNeeded += cost.count;
        break;
      case 'DECK_TOP_TO_CLOCK':
        deckNeeded++;
        break;
      case 'STOCK_TO_CLOCK':
        stockNeeded += cost.count;
        break;
      case 'REST_CHARACTERS': {
        // A REST_SELF of the same cost rests the card first, so it cannot count here too.
        const others = restable(state, context, cost).filter((id) => !(costs.some((c) => c.pay === 'REST_SELF') && id === context.source));
        if (others.length < cost.count) return false;
        break;
      }
    }
  }
  if (zones.stock.length < stockNeeded) return false;
  if (zones.deck.length < deckNeeded) return false;
  const handAvailable = zones.hand.filter((id) => id !== context.source).length;
  return handAvailable >= discardsNeeded;
}

/**
 * Starts paying a cost. Until it is fully paid, refresh and level up are
 * held back (CR-8.4.2.1); the engine loop performs them right afterwards.
 */
export function pushCost(ctx: Ctx, costs: readonly Cost[], context: EffectContext): void {
  if (costs.length === 0) return;
  ctx.state.costDepth++;
  pushFrame(ctx, { kind: 'PAY_COST', costs: [...costs], index: 0, asked: false, context: structuredClone(context) });
}

export function stepPayCost(ctx: Ctx, frame: Extract<Frame, { kind: 'PAY_COST' }>): void {
  const state = ctx.state;
  const { context } = frame;
  const { master } = context;
  const zones = state.zones[master];
  const cost = frame.costs[frame.index];

  if (!cost) {
    state.costDepth--;
    popFrame(ctx, frame);
    return;
  }

  switch (cost.pay) {
    case 'STOCK': {
      // CR-8.4.3 / CR-3.10.2: from the top of the stock down.
      const fromTop = zones.stock.slice(zones.stock.length - cost.count).reverse();
      frame.index++;
      moveCards(ctx, fromTop, { player: master, zone: 'waitingRoom' }, { reason: 'COST' });
      return;
    }
    case 'REST_SELF':
      frame.index++;
      setOrientation(ctx, context.source, 'REST');
      return;
    case 'DISCARD': {
      if (!frame.asked) {
        frame.asked = true;
        const cards = discardable(state, context, cost).map((id) => getInstance(state, id).objectId);
        ask(ctx, { kind: 'SELECT_CARDS', player: master, prompt: 'COST_DISCARD', cards, min: cost.count, max: cost.count });
        return;
      }
      frame.asked = false;
      frame.index++;
      const chosen = takeAnswer(ctx, 'SELECT_CARDS').cards.map((objectId) => findObject(state, objectId).instanceId);
      moveCards(ctx, chosen, { player: master, zone: 'waitingRoom' }, { reason: 'COST' });
      return;
    }
    case 'SELF_TO_WAITING_ROOM':
      frame.index++;
      moveCard(ctx, context.source, { player: getInstance(state, context.source).owner, zone: 'waitingRoom' }, { reason: 'COST' });
      return;
    case 'DECK_TOP_TO_CLOCK': {
      frame.index++;
      const top = topOf(zones.deck);
      if (top !== undefined) moveCard(ctx, top, { player: master, zone: 'clock' }, { reason: 'COST' });
      return;
    }
    case 'SELF_TO_CLOCK':
      frame.index++;
      moveCard(ctx, context.source, { player: getInstance(state, context.source).owner, zone: 'clock' }, { reason: 'COST' });
      return;
    case 'SELF_TO_MEMORY':
      frame.index++;
      moveCard(ctx, context.source, { player: getInstance(state, context.source).owner, zone: 'memory' }, { reason: 'COST' });
      return;
    case 'SELF_TO_DECK_BOTTOM':
      frame.index++;
      moveCard(ctx, context.source, { player: getInstance(state, context.source).owner, zone: 'deck' }, { reason: 'COST', position: 'BOTTOM' });
      return;
    case 'HAND_TO_CLOCK': {
      if (!frame.asked) {
        frame.asked = true;
        const cards = zones.hand.filter((id) => id !== context.source && matchesFilter(state, id, cost.filter)).map((id) => getInstance(state, id).objectId);
        ask(ctx, { kind: 'SELECT_CARDS', player: master, prompt: 'COST_HAND_TO_CLOCK', cards, min: cost.count, max: cost.count });
        return;
      }
      frame.asked = false;
      frame.index++;
      const chosen = takeAnswer(ctx, 'SELECT_CARDS').cards.map((objectId) => findObject(state, objectId).instanceId);
      moveCards(ctx, chosen, { player: master, zone: 'clock' }, { reason: 'COST' });
      return;
    }
    case 'STOCK_TO_CLOCK': {
      // From the top of the stock (CR-3.10.2).
      const fromTop = zones.stock.slice(zones.stock.length - cost.count).reverse();
      frame.index++;
      moveCards(ctx, fromTop, { player: master, zone: 'clock' }, { reason: 'COST' });
      return;
    }
    case 'REST_CHARACTERS': {
      if (!frame.asked) {
        frame.asked = true;
        const cards = restable(state, context, cost).map((id) => getInstance(state, id).objectId);
        ask(ctx, { kind: 'SELECT_CARDS', player: master, prompt: 'COST_REST', cards, min: cost.count, max: cost.count });
        return;
      }
      frame.asked = false;
      frame.index++;
      for (const objectId of takeAnswer(ctx, 'SELECT_CARDS').cards) setOrientation(ctx, findObject(state, objectId).instanceId, 'REST');
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Effects (CR-8.6.2.5, CR-8.8)
// ---------------------------------------------------------------------------

export function pushEffects(ctx: Ctx, effects: readonly Effect[], context: EffectContext): void {
  if (effects.length === 0) return;
  pushFrame(ctx, { kind: 'EFFECTS', effects: [...effects], index: 0, step: 0, scratch: [], context: structuredClone(context) });
}

/** CR-3.1.6: a card goes to its owner's zone unless the effect says otherwise. */
function destinationZone(state: GameState, context: EffectContext, instanceId: number, to: Destination): { zone: ZoneRef; bottom: boolean } | null {
  const player = getInstance(state, instanceId).owner;
  switch (to) {
    case 'CHOSEN_SLOT':
      return context.slot ? { zone: { player: context.master, zone: 'stage', slot: context.slot }, bottom: false } : null;
    case 'SOURCE_SLOT':
      return context.sourceSlot ? { zone: { player: context.sourceSlot.player, zone: 'stage', slot: context.sourceSlot.slot }, bottom: false } : null;
    case 'HAND':
      return { zone: { player, zone: 'hand' }, bottom: false };
    case 'WAITING_ROOM':
      return { zone: { player, zone: 'waitingRoom' }, bottom: false };
    case 'STOCK':
      return { zone: { player, zone: 'stock' }, bottom: false };
    case 'CLOCK':
      return { zone: { player, zone: 'clock' }, bottom: false };
    case 'MEMORY':
      return { zone: { player, zone: 'memory' }, bottom: false };
    case 'DECK_TOP':
      return { zone: { player, zone: 'deck' }, bottom: false };
    case 'DECK_BOTTOM':
      return { zone: { player, zone: 'deck' }, bottom: true };
  }
}

export function stepEffects(ctx: Ctx, frame: Extract<Frame, { kind: 'EFFECTS' }>): void {
  const state = ctx.state;
  const { context } = frame;
  const { master } = context;
  const effect = frame.effects[frame.index];

  if (!effect) {
    popFrame(ctx, frame);
    return;
  }
  const next = (): void => {
    frame.index++;
    frame.step = 0;
    frame.scratch = [];
  };

  switch (effect.do) {
    case 'DRAW': {
      if (effect.optional && frame.step === 0) {
        frame.step = 1;
        ask(ctx, { kind: 'CONFIRM', player: master, prompt: 'USE_ABILITY' });
        return;
      }
      if (effect.optional && !takeAnswer(ctx, 'CONFIRM').accept) {
        next();
        return;
      }
      next();
      pushFrame(ctx, { kind: 'DRAW', player: master, remaining: effect.count });
      return;
    }

    case 'CHOOSE': {
      if (frame.step === 0) {
        let candidates = chooseCandidates(state, context, effect.from, effect.filter, effect.other);
        // レベルＸ以下: X set earlier in this resolution, 0 when nothing set it.
        if (effect.levelMaxX) candidates = candidates.filter((id) => (getDef(state, id).level ?? 0) <= (context.x ?? 0));
        if (candidates.length === 0) {
          // CR-8.6.3.1.3: nothing can be chosen; whatever refers to the choice does nothing.
          if (!effect.add) context.chosen = [];
          next();
          return;
        }
        const hidden = effect.from === 'YOUR_DECK';
        // CR-8.6.3.1: as many as possible up to the number required
        // (CR-8.6.3.1.2). From a hidden zone the player may always choose
        // fewer (CR-8.6.3.1.4).
        const max = Math.min(effect.max, candidates.length);
        const min = hidden ? 0 : Math.min(effect.min, candidates.length);
        frame.step = 1;
        // CR-4.8.1: 山札を見て — the player looks at the whole deck, not only
        // at the cards that may be chosen. Only that player is told.
        const look: Record<number, string> = {};
        if (hidden) {
          for (const id of state.zones[master].deck) look[getInstance(state, id).objectId] = getInstance(state, id).cardId;
        }
        ask(ctx, {
          kind: 'SELECT_CARDS',
          player: master,
          prompt: 'EFFECT_CHOOSE',
          cards: candidates.map((id) => getInstance(state, id).objectId),
          min,
          max,
          ...(hidden ? { look } : {}),
        });
        return;
      }
      {
        const picked = takeAnswer(ctx, 'SELECT_CARDS').cards;
        context.chosen = effect.add ? [...context.chosen, ...picked] : picked;
      }
      next();
      return;
    }

    case 'MOVE': {
      const targets = resolveTarget(state, context, effect.target);
      next();
      // 相手に見せ: shown to everyone before it moves, so the event carries its identity.
      if (effect.reveal) for (const id of targets) revealCard(ctx, id);
      const moves: BatchMove[] = targets.flatMap((instanceId) => {
        const destination = destinationZone(state, context, instanceId, effect.to);
        if (!destination) return [];
        // CR-10.8.4: a character put on the stage by a チェンジ ability is placed "by change".
        const byChange = destination.zone.zone === 'stage' && (context.keywords ?? []).includes('CHANGE');
        return [{
          instanceId,
          to: destination.zone,
          opts: {
            reason: byChange ? ('CHANGE' as const) : ('EFFECT' as const),
            ...(destination.bottom ? { position: 'BOTTOM' as const } : {}),
            ...(effect.rested ? { orientation: 'REST' as const } : {}),
          },
        }];
      });
      moveBatch(ctx, moves);
      return;
    }

    case 'MODIFY': {
      // CR-8.9.2: applies to the cards that are there now, not to ones arriving later.
      const amount = effect.amount * perCount(state, master, context.source, effect.per);
      const untilTurn = effect.until === 'NEXT_OPPONENT_TURN' ? nextOpponentTurn(state, master) : undefined;
      for (const id of resolveTarget(state, context, effect.target)) {
        addModifier(state, getInstance(state, id).objectId, effect.stat, amount, untilTurn);
      }
      next();
      return;
    }

    case 'ORIENT': {
      for (const id of resolveTarget(state, context, effect.target)) {
        if (getInstance(state, id).location.zone === 'stage') setOrientation(ctx, id, effect.to);
      }
      next();
      return;
    }

    case 'DAMAGE':
      next();
      pushDamage(ctx, opponentOf(master), effect.amount, null);
      return;

    case 'DECK_TOP': {
      // One card per step (CR-3.2.3), so a refresh in between happens in place.
      const done = frame.scratch[0] ?? 0;
      if (done === 0) context.moved = [];
      const top = topOf(state.zones[master].deck);
      if (done >= effect.count || top === undefined) {
        next();
        return;
      }
      frame.scratch[0] = done + 1;
      context.moved = [...(context.moved ?? []), top];
      const zone = effect.to === 'STOCK' ? 'stock' : effect.to === 'CLOCK' ? 'clock' : 'waitingRoom';
      moveCard(ctx, top, { player: master, zone }, { reason: 'EFFECT' });
      return;
    }

    case 'SHUFFLE':
      next();
      shuffleDeck(ctx, master);
      return;

    case 'WAITING_ROOM_TO_DECK':
      next();
      moveCards(ctx, [...state.zones[master].waitingRoom], { player: master, zone: 'deck' }, { reason: 'EFFECT' });
      return;

    case 'BRAINSTORM': {
      // CR-10.7.3: the cards are turned over one at a time into the
      // resolution zone, then all go to the waiting room together.
      if (frame.step === 0) {
        const top = topOf(state.zones[master].deck);
        if (frame.scratch.length < effect.count && top !== undefined) {
          frame.scratch.push(top);
          moveCard(ctx, top, { player: master, zone: 'resolution' }, { reason: 'EFFECT' });
          return;
        }
        frame.step = 1;
        return;
      }
      const flipped = frame.scratch.filter((id) => getInstance(state, id).location.zone === 'resolution');
      const hits = flipped.filter((id) => matchesFilter(state, id, effect.per)).length;
      if (effect.setX) context.x = hits;
      next();
      for (let i = 0; i < hits; i++) pushEffects(ctx, effect.each, context);
      moveBatch(
        ctx,
        flipped.map((instanceId) => ({
          instanceId,
          to: { player: getInstance(state, instanceId).owner, zone: 'waitingRoom' as const },
          opts: { reason: 'EFFECT' as const },
        })),
      );
      return;
    }

    case 'IF': {
      const condition = effect.condition;
      const holds =
        condition.if === 'LAST_MOVED'
          ? (context.moved ?? []).filter((id) => matchesFilter(state, id, condition.filter)).length >= condition.min
          : evalCondition(state, master, context.source, condition, context.battleOpponent);
      next();
      pushEffects(ctx, holds ? effect.then : (effect.else ?? []), context);
      return;
    }

    case 'CHOOSE_SLOT': {
      if (frame.step === 0) {
        const zones = state.zones[master];
        const slots = effect.which === 'ANY' ? [...SLOTS] : BACK_SLOTS.filter((slot) => zones.stage[slot].length === 0);
        // Nothing was chosen to put anywhere, or there is no such slot.
        if (context.chosen.length === 0 || slots.length === 0) {
          context.slot = null;
          next();
          return;
        }
        frame.step = 1;
        ask(ctx, { kind: 'SELECT_SLOT', player: master, prompt: 'EFFECT_SLOT', slots });
        return;
      }
      context.slot = takeAnswer(ctx, 'SELECT_SLOT').slot;
      next();
      return;
    }

    case 'CLOCK_TOP': {
      const top = topOf(state.zones[master].clock);
      next();
      if (top !== undefined) moveCard(ctx, top, { player: getInstance(state, top).owner, zone: 'waitingRoom' }, { reason: 'EFFECT' });
      return;
    }

    case 'LOOK_TOP': {
      stepLookTop(ctx, frame, effect, next);
      return;
    }

    case 'GRANT': {
      const untilTurn = effect.until === 'NEXT_OPPONENT_TURN' ? nextOpponentTurn(state, master) : undefined;
      for (const id of resolveTarget(state, context, effect.target)) {
        state.grants.push({ objectId: getInstance(state, id).objectId, ability: effect.ability, ...(untilTurn !== undefined ? { untilTurn } : {}) });
      }
      next();
      return;
    }
  }
}

/** Card ids of the cards a player is looking at, by object id, for the decision that shows them. */
function lookMap(state: GameState, instanceIds: readonly number[]): Record<number, string> {
  const look: Record<number, string> = {};
  for (const id of instanceIds) look[getInstance(state, id).objectId] = getInstance(state, id).cardId;
  return look;
}

/**
 * 自分の山札を上からN枚まで見て、…を1枚まで選んで(相手に見せ、)手札に加え、残りのカードを控え室に置く.
 * `scratch` holds the instance ids looked at, top first. Step 0: ask about
 * the next card (CR-3.2.3.1); step 1: its answer; step 2: choose; step 3: move.
 */
function stepLookTop(ctx: Ctx, frame: Extract<Frame, { kind: 'EFFECTS' }>, effect: Extract<Effect, { do: 'LOOK_TOP' }>, next: () => void): void {
  const state = ctx.state;
  const { context } = frame;
  const { master } = context;
  const deck = state.zones[master].deck;
  const limit = effect.per ? effect.upTo * perCount(state, master, context.source, effect.per) : effect.upTo;

  if (frame.step === 0) {
    // CR-3.2.3.3: no more cards than the deck has.
    if (frame.scratch.length >= limit || frame.scratch.length >= deck.length) {
      frame.step = 2;
      return;
    }
    frame.step = 1;
    ask(ctx, { kind: 'CONFIRM', player: master, prompt: 'LOOK_NEXT', look: lookMap(state, frame.scratch) });
    return;
  }
  if (frame.step === 1) {
    if (takeAnswer(ctx, 'CONFIRM').accept) {
      frame.scratch.push(deck[deck.length - 1 - frame.scratch.length] as number);
      frame.step = 0;
    } else {
      frame.step = 2;
    }
    return;
  }
  if (frame.step === 2) {
    const candidates = frame.scratch.filter((id) => matchesFilter(state, id, effect.pick));
    if (candidates.length === 0) {
      context.chosen = [];
      frame.step = 4;
      return;
    }
    frame.step = 3;
    ask(ctx, {
      kind: 'SELECT_CARDS',
      player: master,
      prompt: 'EFFECT_CHOOSE',
      cards: candidates.map((id) => getInstance(state, id).objectId),
      min: 0,
      max: 1,
      look: lookMap(state, frame.scratch),
    });
    return;
  }
  if (frame.step === 3) {
    context.chosen = takeAnswer(ctx, 'SELECT_CARDS').cards;
    frame.step = 4;
    return;
  }
  // The chosen card to the hand (shown first when the text says so), the rest to the waiting room, together.
  const looked = [...frame.scratch];
  const chosen = context.chosen.map((objectId) => findObject(state, objectId).instanceId);
  next();
  if (effect.reveal) for (const id of chosen) revealCard(ctx, id);
  moveBatch(
    ctx,
    looked.map((instanceId) => ({
      instanceId,
      to: { player: master, zone: chosen.includes(instanceId) ? ('hand' as const) : ('waitingRoom' as const) },
      opts: { reason: 'EFFECT' as const },
    })),
  );
}

/** CR-8.6.2.5.2: the resolved event goes to its owner's waiting room. */
export function stepFinishEvent(ctx: Ctx, frame: Extract<Frame, { kind: 'FINISH_EVENT' }>): void {
  popFrame(ctx, frame);
  const inst = ctx.state.instances.find((candidate) => candidate.objectId === frame.objectId);
  if (inst && inst.location.zone === 'resolution') {
    moveCard(ctx, inst.instanceId, { player: inst.owner, zone: 'waitingRoom' }, { reason: 'RESOLVED' });
  }
}

/**
 * CR-8.6.2.3 to 8.6.2.5 for an ability: pay the cost, raise the "played"
 * event, resolve the effects. Frames run last-pushed-first, so the effects
 * are pushed before the cost.
 */
export function playAbility(ctx: Ctx, context: EffectContext, abilityNumber: number, costs: readonly Cost[], effects: readonly Effect[]): void {
  pushEffects(ctx, effects, context);
  // CR-8.6.2.4: "played" (and, for backup, "used", CR-10.5.3) once the cost is paid.
  pushFrame(ctx, { kind: 'ANNOUNCE_ABILITY', player: context.master, instanceId: context.source, ability: abilityNumber });
  pushCost(ctx, costs, context);
}

export function stepAnnounceAbility(ctx: Ctx, frame: Extract<Frame, { kind: 'ANNOUNCE_ABILITY' }>): void {
  popFrame(ctx, frame);
  const source = getInstance(ctx.state, frame.instanceId);
  emit(ctx, { type: 'ABILITY_PLAYED', player: frame.player, instanceId: source.instanceId, cardId: source.cardId, ability: frame.ability });
}

/** CR-10.19: counting and checking plays of an ability with a per-turn limit. */
export function usesKey(objectId: number, abilityNumber: number): string {
  return `${objectId}:${abilityNumber}`;
}

export function limitReached(state: GameState, objectId: number, abilityNumber: number, limit: number | undefined): boolean {
  return limit !== undefined && (state.abilityUses[usesKey(objectId, abilityNumber)] ?? 0) >= limit;
}

export function countUse(state: GameState, objectId: number, abilityNumber: number): void {
  const key = usesKey(objectId, abilityNumber);
  state.abilityUses[key] = (state.abilityUses[key] ?? 0) + 1;
}
