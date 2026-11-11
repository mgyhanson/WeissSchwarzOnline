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
import { getInstance } from '../state';
import { addModifier } from '../stats';
import type { GameState, ZoneRef } from '../types';
import { opponentOf } from '../types';
import { chooseCandidates, evalCondition, matchesFilter, perCount, resolveTarget, sourceIfUnchanged } from './query';
import type { Cost, Destination, Effect, EffectContext } from './types';

// ---------------------------------------------------------------------------
// Costs (CR-8.4)
// ---------------------------------------------------------------------------

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
        if (!sourceIfUnchanged(state, context)) return false;
        break;
      case 'DECK_TOP_TO_CLOCK':
        deckNeeded++;
        break;
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
        const candidates = chooseCandidates(state, context, effect.from, effect.filter, effect.other);
        if (candidates.length === 0) {
          // CR-8.6.3.1.3: nothing can be chosen; whatever refers to the choice does nothing.
          context.chosen = [];
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
      context.chosen = takeAnswer(ctx, 'SELECT_CARDS').cards;
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
        return [{
          instanceId,
          to: destination.zone,
          opts: {
            reason: 'EFFECT' as const,
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
      for (const id of resolveTarget(state, context, effect.target)) {
        addModifier(state, getInstance(state, id).objectId, effect.stat, amount);
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
      const top = topOf(state.zones[master].deck);
      if (done >= effect.count || top === undefined) {
        next();
        return;
      }
      frame.scratch[0] = done + 1;
      const zone = effect.to === 'STOCK' ? 'stock' : effect.to === 'CLOCK' ? 'clock' : 'waitingRoom';
      moveCard(ctx, top, { player: master, zone }, { reason: 'EFFECT' });
      return;
    }

    case 'SHUFFLE':
      next();
      shuffleDeck(ctx, master);
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
      const holds = evalCondition(state, master, context.source, effect.condition);
      next();
      pushEffects(ctx, holds ? effect.then : (effect.else ?? []), context);
      return;
    }
  }
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
  const state = ctx.state;
  const source = getInstance(state, context.source);
  emit(ctx, { type: 'ABILITY_PLAYED', player: context.master, instanceId: source.instanceId, cardId: source.cardId, ability: abilityNumber });
  pushEffects(ctx, effects, context);
  pushCost(ctx, costs, context);
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
