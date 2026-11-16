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
import { moveBatch, moveCard, moveCards, revealCard, setOrientation, shuffleDeck, swapSlots } from '../moves';
import { getDef, getInstance } from '../state';
import { addModifier, nextOpponentTurn } from '../stats';
import type { GameState, PlayerId, ZoneRef } from '../types';
import { SLOTS, opponentOf } from '../types';
import { BACK_SLOTS, FRONT_SLOTS } from '../zones';
import { cannotBeReversed, cannotMove, chooseCandidates, countForX, evalCondition, matchesFilter, perCount, resolveTarget, sourceIfUnchanged, zoneCount } from './query';
import type { CardFilter, Cost, Destination, Effect, EffectContext } from './types';

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

/** Characters on the master's stage that may be put into the waiting room for a CHARACTERS_TO_WAITING_ROOM cost. */
function sacrificable(state: GameState, context: EffectContext, cost: Extract<Cost, { pay: 'CHARACTERS_TO_WAITING_ROOM' }>): number[] {
  const stage = state.zones[context.master].stage;
  return SLOTS.flatMap((slot) => stage[slot]).filter(
    (id) => getDef(state, id).kind === 'CHARACTER' && !(cost.other && id === context.source) && !(cost.standing && getInstance(state, id).orientation !== 'STAND') && matchesFilter(state, id, cost.filter),
  );
}

/** 搭乗: the other characters of yours with the name the cost gives. */
function boardable(state: GameState, context: EffectContext, cost: Extract<Cost, { pay: 'SELF_TO_MARKER' }>): number[] {
  const stage = state.zones[context.master].stage;
  return SLOTS.flatMap((slot) => stage[slot]).filter((id) => id !== context.source && getDef(state, id).kind === 'CHARACTER' && getDef(state, id).name === cost.underName);
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
        // 【スタンド】しているこのカードを…: only a standing card on the stage can pay.
        if (cost.standing && sourceIfUnchanged(state, context)?.orientation !== 'STAND') return false;
        if (!sourceIfUnchanged(state, context)) return false;
        break;
      case 'SELF_TO_MEMORY':
        if (cost.standing && sourceIfUnchanged(state, context)?.orientation !== 'STAND') return false;
        if (!sourceIfUnchanged(state, context)) return false;
        break;
      case 'SELF_TO_DECK_BOTTOM':
        if (cost.standing && sourceIfUnchanged(state, context)?.orientation !== 'STAND') return false;
        if (!sourceIfUnchanged(state, context)) return false;
        break;
      case 'SELF_TO_CLOCK':
        if ((cost as { standing?: boolean }).standing && sourceIfUnchanged(state, context)?.orientation !== 'STAND') return false;
        if (!sourceIfUnchanged(state, context)) return false;
        break;
      case 'SELF_TO_HAND':
      case 'SELF_TO_STOCK_BOTTOM':
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
      case 'CLIMAX_TO_WAITING_ROOM':
        if (zones.climax.filter((id) => matchesFilter(state, id, cost.filter)).length < cost.count) return false;
        break;
      case 'MARKERS_TO_WAITING_ROOM': {
        const self = sourceIfUnchanged(state, context);
        if (!self || self.location.zone !== 'stage' || state.zones[self.location.player].marker[self.location.slot].length < cost.count) return false;
        break;
      }
      case 'SELF_TO_MARKER': {
        // 搭乗: another character of yours with that name, on the stage.
        const self = sourceIfUnchanged(state, context);
        if (!self || self.location.zone !== 'stage' || boardable(state, context, cost).length === 0) return false;
        break;
      }
      case 'CHARACTERS_TO_WAITING_ROOM': {
        // A cost that also moves this card away cannot use it here too.
        const leaves = costs.some((c) => c.pay === 'SELF_TO_WAITING_ROOM' || c.pay === 'SELF_TO_CLOCK' || c.pay === 'SELF_TO_MEMORY' || c.pay === 'SELF_TO_DECK_BOTTOM');
        if (sacrificable(state, context, cost).filter((id) => !(leaves && id === context.source)).length < cost.count) return false;
        break;
      }
      case 'LEVEL_FACE_DOWN':
        if (state.zones[context.master].level.filter((id) => getInstance(state, id).face === 'UP').length < cost.count) return false;
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
    case 'SELF_TO_HAND':
      frame.index++;
      moveCard(ctx, context.source, { player: getInstance(state, context.source).owner, zone: 'hand' }, { reason: 'COST' });
      return;
    case 'SELF_TO_MEMORY':
      frame.index++;
      moveCard(ctx, context.source, { player: getInstance(state, context.source).owner, zone: 'memory' }, { reason: 'COST' });
      return;
    case 'SELF_TO_STOCK_BOTTOM':
      frame.index++;
      moveCard(ctx, context.source, { player: getInstance(state, context.source).owner, zone: 'stock' }, { reason: 'COST', position: 'BOTTOM' });
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
    case 'CLIMAX_TO_WAITING_ROOM': {
      frame.index++;
      const climaxes = zones.climax.filter((id) => matchesFilter(state, id, cost.filter)).slice(0, cost.count);
      moveCards(ctx, climaxes, { player: master, zone: 'waitingRoom' }, { reason: 'COST' });
      return;
    }
    case 'MARKERS_TO_WAITING_ROOM': {
      frame.index++;
      const self = getInstance(state, context.source);
      if (self.location.zone !== 'stage') return;
      const markers = state.zones[self.location.player].marker[self.location.slot];
      for (const id of markers.slice(-cost.count).reverse()) moveCard(ctx, id, { player: getInstance(state, id).owner, zone: 'waitingRoom' }, { reason: 'COST' });
      return;
    }
    case 'SELF_TO_MARKER': {
      if (!frame.asked) {
        frame.asked = true;
        ask(ctx, { kind: 'SELECT_CARDS', player: master, prompt: 'COST_BOARD', cards: boardable(state, context, cost).map((id) => getInstance(state, id).objectId), min: 1, max: 1 });
        return;
      }
      frame.asked = false;
      frame.index++;
      const holder = findObject(state, takeAnswer(ctx, 'SELECT_CARDS').cards[0]!).instanceId;
      const location = getInstance(state, holder).location;
      if (location.zone !== 'stage') return;
      // Face up under that character (CR-3.7.2.1); this card's own markers go to the waiting room as it leaves its slot (CR-3.7.3.2).
      moveCard(ctx, context.source, { player: location.player, zone: 'marker', slot: location.slot }, { reason: 'COST', face: 'UP' });
      return;
    }
    case 'CHARACTERS_TO_WAITING_ROOM': {
      if (!frame.asked) {
        frame.asked = true;
        const cards = sacrificable(state, context, cost).map((id) => getInstance(state, id).objectId);
        ask(ctx, { kind: 'SELECT_CARDS', player: master, prompt: 'COST_CHARACTERS', cards, min: cost.count, max: cost.count });
        return;
      }
      frame.asked = false;
      frame.index++;
      const chosen = takeAnswer(ctx, 'SELECT_CARDS').cards.map((objectId) => findObject(state, objectId).instanceId);
      moveBatch(ctx, chosen.map((instanceId) => ({ instanceId, to: { player: getInstance(state, instanceId).owner, zone: cost.toMemory ? ('memory' as const) : ('waitingRoom' as const) }, opts: { reason: 'COST' as const } })));
      return;
    }
    case 'LEVEL_FACE_DOWN': {
      if (!frame.asked) {
        frame.asked = true;
        const cards = state.zones[master].level.filter((id) => getInstance(state, id).face === 'UP').map((id) => getInstance(state, id).objectId);
        ask(ctx, { kind: 'SELECT_CARDS', player: master, prompt: 'COST_LEVEL_FACE_DOWN', cards, min: cost.count, max: cost.count });
        return;
      }
      frame.asked = false;
      frame.index++;
      // The card stays where it is (same zone, same object); only its face changes (CR-3.9.2.2).
      for (const objectId of takeAnswer(ctx, 'SELECT_CARDS').cards) getInstance(state, findObject(state, objectId).instanceId).face = 'DOWN';
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
    case 'ABOUT_SLOT':
      return context.aboutSlot ? { zone: { player: context.aboutSlot.player, zone: 'stage', slot: context.aboutSlot.slot }, bottom: false } : null;
    case 'SOURCE_SLOT':
      return context.sourceSlot ? { zone: { player: context.sourceSlot.player, zone: 'stage', slot: context.sourceSlot.slot }, bottom: false } : null;
    case 'HAND':
      return { zone: { player, zone: 'hand' }, bottom: false };
    case 'WAITING_ROOM':
      return { zone: { player, zone: 'waitingRoom' }, bottom: false };
    case 'STOCK':
      return { zone: { player, zone: 'stock' }, bottom: false };
    case 'STOCK_BOTTOM':
      return { zone: { player, zone: 'stock' }, bottom: true };
    case 'CLOCK':
      return { zone: { player, zone: 'clock' }, bottom: false };
    case 'MEMORY':
      return { zone: { player, zone: 'memory' }, bottom: false };
    case 'DECK_TOP':
    case 'DECK':
      return { zone: { player, zone: 'deck' }, bottom: false };
    case 'DECK_BOTTOM':
      return { zone: { player, zone: 'deck' }, bottom: true };
    case 'UNDER_SELF': {
      const self = getInstance(state, context.source);
      return self.objectId === context.sourceObjectId && self.location.zone === 'stage' ? { zone: { player: self.location.player, zone: 'marker', slot: self.location.slot }, bottom: false } : null;
    }
    case 'UNDER_THAT': {
      const that = context.about == null ? undefined : state.instances.find((inst) => inst.objectId === context.about);
      return that && that.location.zone === 'stage' ? { zone: { player: that.location.player, zone: 'marker', slot: that.location.slot }, bottom: false } : null;
    }
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
      // N枚まで引く: one card at a time; the player may stop before each (CR-4.10.1).
      if (effect.upTo) {
        const drawn = frame.scratch[0] ?? 0;
        // How many were drawn: X for 同じ枚数.
        context.x = drawn;
        if (drawn >= effect.count || state.zones[master].deck.length === 0) {
          next();
          return;
        }
        if (frame.step === 0) {
          frame.step = 1;
          ask(ctx, { kind: 'CONFIRM', player: master, prompt: 'DRAW_NEXT' });
          return;
        }
        frame.step = 0;
        if (!takeAnswer(ctx, 'CONFIRM').accept) {
          next();
          return;
        }
        frame.scratch[0] = drawn + 1;
        context.x = drawn + 1;
        pushFrame(ctx, { kind: 'DRAW', player: master, remaining: 1 });
        return;
      }
      if (effect.optional && frame.step === 0) {
        frame.step = 1;
        ask(ctx, { kind: 'CONFIRM', player: master, prompt: 'USE_ABILITY' });
        return;
      }
      if (effect.optional && !takeAnswer(ctx, 'CONFIRM').accept) {
        context.did = false;
        next();
        return;
      }
      // N枚引いたなら: whether a card was really drawn.
      if (effect.optional) context.did = state.zones[master].deck.length > 0;
      next();
      pushFrame(ctx, { kind: 'DRAW', player: master, remaining: effect.count });
      return;
    }

    case 'CHOOSE': {
      if (frame.step === 0) {
        // その手札に戻したキャラと同じカード名の: names of the cards the last MOVE moved.
        const sameNames = effect.sameNameAsMoved ? (context.lastMoved ?? []).flatMap((objectId) => state.instances.filter((inst) => inst.objectId === objectId).map((inst) => getDef(state, inst.instanceId).name)) : null;
        let candidates = chooseCandidates(state, context, effect.from, effect.filter, effect.other);
        if (sameNames) candidates = candidates.filter((id) => sameNames.includes(getDef(state, id).name));
        // レベルＸ以下: X set earlier in this resolution, 0 when nothing set it.
        if (effect.levelMaxX) candidates = candidates.filter((id) => (getDef(state, id).level ?? 0) <= (context.x ?? 0));
        if (candidates.length === 0) {
          // CR-8.6.3.1.3: nothing can be chosen; whatever refers to the choice does nothing.
          if (!effect.add) context.chosen = [];
          next();
          return;
        }
        // …すべて: every one of them, without asking.
        if (effect.all) {
          context.chosen = candidates.map((id) => getInstance(state, id).objectId);
          next();
          return;
        }
        const hidden = effect.from === 'YOUR_DECK';
        // CR-8.6.3.1: as many as possible up to the number required
        // (CR-8.6.3.1.2). From a hidden zone the player may always choose
        // fewer (CR-8.6.3.1.4).
        const max = Math.min(effect.maxX || effect.exactX ? Math.max(0, context.x ?? 0) : effect.max, candidates.length);
        const min = hidden ? 0 : Math.min(effect.exactX ? Math.max(0, context.x ?? 0) : effect.min, candidates.length);
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

    case 'SPLIT_CHOSEN': {
      const chosen = resolveTarget(state, context, { who: 'CHOSEN' });
      if (frame.step === 0) {
        if (chosen.length === 0) {
          next();
          return;
        }
        if (effect.reveal) for (const id of chosen) revealCard(ctx, id);
        const max = Math.min(effect.take, chosen.length);
        frame.step = 1;
        ask(ctx, { kind: 'SELECT_CARDS', player: master, prompt: 'EFFECT_SPLIT', cards: chosen.map((id) => getInstance(state, id).objectId), min: effect.exact ? max : 0, max, look: deckLook(state, master, chosen) });
        return;
      }
      if (frame.step === 1) {
        const picked = takeAnswer(ctx, 'SELECT_CARDS').cards.map((objectId) => findObject(state, objectId).instanceId);
        frame.scratch = picked;
        frame.step = 2;
      }
      // The cards for the first place, in the order the player gives (when asked), then the rest at once.
      const picked = frame.scratch.filter((id) => chosen.includes(id));
      if (effect.inOrder && picked.length > 1 && frame.step === 2) {
        frame.step = 3;
        ask(ctx, { kind: 'SELECT_CARDS', player: master, prompt: 'EFFECT_PLACE_ORDER', cards: picked.map((id) => getInstance(state, id).objectId), min: 1, max: 1, look: deckLook(state, master, picked) });
        return;
      }
      if (frame.step === 3) {
        const first = findObject(state, takeAnswer(ctx, 'SELECT_CARDS').cards[0]!).instanceId;
        const target = destinationZone(state, context, first, effect.to);
        if (target) moveCard(ctx, first, target.zone, { reason: 'EFFECT', ...(target.bottom ? { position: 'BOTTOM' as const } : {}) });
        frame.scratch = picked.filter((id) => id !== first);
        frame.step = 2;
        return;
      }
      const rest = chosen.filter((id) => !picked.includes(id));
      next();
      const moves: BatchMove[] = [];
      for (const [ids, to] of [[picked, effect.to], [rest, effect.rest]] as const) {
        for (const instanceId of ids) {
          const target = destinationZone(state, context, instanceId, to);
          if (target) moves.push({ instanceId, to: target.zone, opts: { reason: 'EFFECT', ...(target.bottom ? { position: 'BOTTOM' as const } : {}) } });
        }
      }
      moveBatch(ctx, moves);
      return;
    }

    case 'MOVE': {
      const targets = resolveTarget(state, context, effect.target);
      // …に好きな順番で置く: one card at a time, in the order the player chooses.
      if (effect.inOrder && targets.length > 1) {
        if (frame.step === 0) {
          frame.step = 1;
          ask(ctx, { kind: 'SELECT_CARDS', player: master, prompt: 'EFFECT_PLACE_ORDER', cards: targets.map((id) => getInstance(state, id).objectId), min: 1, max: 1, look: deckLook(state, master, targets) });
          return;
        }
        const first = findObject(state, takeAnswer(ctx, 'SELECT_CARDS').cards[0]!).instanceId;
        const target = destinationZone(state, context, first, effect.to);
        frame.step = 0;
        context.did = true;
        if (target) moveCard(ctx, first, target.zone, { reason: 'EFFECT', ...(target.bottom ? { position: 'BOTTOM' as const } : {}), ...(target.zone.zone === 'marker' ? { face: effect.face ?? ('DOWN' as const) } : {}) });
        return;
      }
      // …に戻すか…に置く: the player says which, when there is something to move.
      let to = effect.to;
      if (effect.orTo && targets.length > 0) {
        if (frame.step === 0) {
          frame.step = 1;
          ask(ctx, { kind: 'SELECT_OPTION', player: master, prompt: 'EFFECT_DESTINATION', options: [effect.to, effect.orTo] });
          return;
        }
        to = takeAnswer(ctx, 'SELECT_OPTION').option as typeof effect.to;
      }
      next();
      // 相手に見せ: shown to everyone before it moves, so the event carries its identity.
      if (effect.reveal) for (const id of targets) revealCard(ctx, id);
      const moves: BatchMove[] = targets.flatMap((instanceId) => {
        const destination = destinationZone(state, context, instanceId, to);
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
            // CR-3.7.2: markers are face down unless the text says 表向き.
            ...(destination.zone.zone === 'marker' ? { face: effect.face ?? ('DOWN' as const) } : {}),
          },
        }];
      });
      context.did = moves.length > 0;
      moveBatch(ctx, moves);
      // For そのキャラ (MOVED) and この効果で舞台に置かれたキャラ (PLACED) later in this resolution.
      context.lastMoved = moves.map((m) => getInstance(state, m.instanceId).objectId);
      const onStage = moves.filter((m) => m.to.zone === 'stage').map((m) => getInstance(state, m.instanceId).objectId);
      if (onStage.length > 0) context.placed = [...(context.placed ?? []), ...onStage];
      return;
    }

    case 'MODIFY': {
      // CR-8.9.2: applies to the cards that are there now, not to ones arriving later.
      const amount =
        effect.amount *
        perCount(state, master, context.source, effect.per) *
        (effect.timesX ? (context.x ?? 0) : 1) *
        (effect.perCount ? zoneCount(state, master, context.source, effect.perCount.where, effect.perCount.filter) : 1);
      const untilTurn = effect.until === 'NEXT_OPPONENT_TURN' ? nextOpponentTurn(state, master) : undefined;
      for (const id of resolveTarget(state, context, effect.target)) {
        addModifier(state, getInstance(state, id).objectId, effect.stat, amount, untilTurn);
      }
      next();
      return;
    }

    case 'ORIENT': {
      for (const id of resolveTarget(state, context, effect.target)) {
        if (getInstance(state, id).location.zone === 'stage' && !(effect.to === 'REVERSE' && cannotBeReversed(state, id))) setOrientation(ctx, id, effect.to);
      }
      next();
      return;
    }

    case 'DAMAGE':
      next();
      // CR-4.13.2.2: the card whose effect deals the damage is its source.
      pushDamage(ctx, opponentOf(master), effect.amountX ? (context.x ?? 0) : effect.amount, context.sourceObjectId ?? null);
      return;

    case 'DECK_TOP': {
      // One card per step (CR-3.2.3), so a refresh in between happens in place.
      // 自分か相手の: the player says whose deck first.
      if (effect.whose === 'EITHER' && frame.step === 0) {
        frame.step = 1;
        ask(ctx, { kind: 'SELECT_OPTION', player: master, prompt: 'EFFECT_PLAYER', options: ['YOU', 'OPPONENT'] });
        return;
      }
      if (effect.whose === 'EITHER' && frame.step === 1) {
        frame.step = 2;
        frame.scratch[1] = takeAnswer(ctx, 'SELECT_OPTION').option === 'OPPONENT' ? 1 : 0;
      }
      const whose = frame.scratch[1] === 1 || effect.whose === 'OPPONENT' ? opponentOf(master) : master;
      const done = frame.scratch[0] ?? 0;
      if (done === 0) context.moved = [];
      // 山札の下からN枚を: from the bottom instead.
      const top = effect.fromBottom ? state.zones[whose].deck[0] : topOf(state.zones[whose].deck);
      const count = effect.countX ? (context.x ?? 0) : effect.count;
      // 上からN枚までを: the player may stop before each card.
      if (effect.upTo && done < count && top !== undefined) {
        if (frame.step !== 3) {
          frame.step = 3;
          ask(ctx, { kind: 'CONFIRM', player: master, prompt: 'DECK_TOP_NEXT' });
          return;
        }
        frame.step = 2;
        if (!takeAnswer(ctx, 'CONFIRM').accept) {
          next();
          return;
        }
      }
      if (done >= count || top === undefined) {
        // Ｘはそれらのカードのレベルの合計: printed levels; a climax has none and counts as 0 (CR-2.19.1).
        if (effect.setX === 'LEVEL_TOTAL') context.x = (context.moved ?? []).reduce((sum, id) => sum + (getDef(state, id).level ?? 0), 0);
        next();
        return;
      }
      frame.scratch[0] = done + 1;
      context.moved = [...(context.moved ?? []), top];
      const zone = effect.to === 'STOCK' ? 'stock' : effect.to === 'CLOCK' ? 'clock' : 'waitingRoom';
      moveCard(ctx, top, { player: whose, zone }, { reason: 'EFFECT' });
      return;
    }

    case 'SHUFFLE': {
      next();
      const whose = effect.whose === 'OPPONENT' ? opponentOf(master) : master;
      // Cards shown on the deck are put back as they were and are no longer shown.
      for (const id of state.zones[whose].deck) getInstance(state, id).revealed = false;
      shuffleDeck(ctx, whose);
      return;
    }

    case 'SET_X': {
      next();
      let x = countForX(state, context, effect.count) + (effect.plus ?? 0) - (effect.minus ?? 0);
      if (effect.tiers) x = effect.tiers.find((t) => x >= (t.min ?? -Infinity) && x <= (t.max ?? Infinity))?.x ?? 0;
      context.x = Math.max(0, x);
      return;
    }

    case 'REVEAL_DECK_TOP': {
      if (effect.upTo) {
        // N枚までを、公開してよい: one card at a time from the top, the player may stop before each.
        const deck = state.zones[master].deck;
        const shownSoFar = frame.scratch;
        const nextCard = deck[deck.length - 1 - shownSoFar.length];
        if (shownSoFar.length >= effect.count || nextCard === undefined) {
          context.moved = [...shownSoFar];
          next();
          return;
        }
        if (frame.step === 0) {
          frame.step = 1;
          ask(ctx, { kind: 'CONFIRM', player: master, prompt: 'LOOK_NEXT' });
          return;
        }
        frame.step = 0;
        if (!takeAnswer(ctx, 'CONFIRM').accept) {
          context.moved = [...shownSoFar];
          next();
          return;
        }
        frame.scratch = [...shownSoFar, nextCard];
        revealCard(ctx, nextCard);
        return;
      }
      next();
      const whose = effect.whose === 'OPPONENT' ? opponentOf(master) : master;
      const deck = state.zones[whose].deck;
      const shown = deck.slice(Math.max(0, deck.length - effect.count)).reverse();
      for (const id of shown) revealCard(ctx, id);
      context.moved = shown;
      return;
    }

    case 'EXCHANGE_ZONES': {
      const zones = state.zones[master];
      const self = sourceIfUnchanged(state, context);
      const poolA = zones.waitingRoom.filter((id) => matchesFilter(state, id, effect.a.filter));
      const poolB = effect.b === 'SELF' ? (self && self.location.zone === 'memory' ? [self.instanceId] : []) : zones.memory.filter((id) => getInstance(state, id).face === 'UP' && matchesFilter(state, id, (effect.b as { filter?: CardFilter }).filter));
      // Both sides are needed to exchange.
      if (poolA.length < effect.count || poolB.length < effect.count) {
        next();
        return;
      }
      if (frame.step === 0) {
        frame.step = 1;
        ask(ctx, { kind: 'SELECT_CARDS', player: master, prompt: 'EFFECT_CHOOSE', cards: poolA.map((id) => getInstance(state, id).objectId), min: effect.count, max: effect.count });
        return;
      }
      if (frame.step === 1) {
        frame.scratch = takeAnswer(ctx, 'SELECT_CARDS').cards.map((objectId) => findObject(state, objectId).instanceId);
        if (effect.b === 'SELF') frame.step = 3;
        else {
          frame.step = 2;
          ask(ctx, { kind: 'SELECT_CARDS', player: master, prompt: 'EFFECT_CHOOSE', cards: poolB.map((id) => getInstance(state, id).objectId), min: effect.count, max: effect.count });
          return;
        }
      }
      const fromB = effect.b === 'SELF' ? poolB : takeAnswer(ctx, 'SELECT_CARDS').cards.map((objectId) => findObject(state, objectId).instanceId);
      const fromA = frame.scratch;
      next();
      moveBatch(ctx, [
        ...fromA.map((instanceId) => ({ instanceId, to: { player: master, zone: 'memory' as const }, opts: { reason: 'EFFECT' as const } })),
        ...fromB.map((instanceId) => ({ instanceId, to: { player: master, zone: 'waitingRoom' as const }, opts: { reason: 'EFFECT' as const } })),
      ]);
      return;
    }

    case 'STOCK_BOTTOM_TO_HAND': {
      // One at a time from the bottom; the player may stop before each. X = how many.
      const done = frame.scratch[0] ?? 0;
      context.x = done;
      const bottom = state.zones[master].stock[0];
      if (done >= effect.count || bottom === undefined) {
        next();
        return;
      }
      if (frame.step === 0) {
        frame.step = 1;
        ask(ctx, { kind: 'CONFIRM', player: master, prompt: 'USE_ABILITY' });
        return;
      }
      frame.step = 0;
      if (!takeAnswer(ctx, 'CONFIRM').accept) {
        next();
        return;
      }
      frame.scratch[0] = done + 1;
      context.x = done + 1;
      moveCard(ctx, bottom, { player: master, zone: 'hand' }, { reason: 'EFFECT' });
      return;
    }

    case 'MOVE_REST': {
      next();
      const chosen = resolveTarget(state, context, { who: 'CHOSEN' });
      const rest = (context.moved ?? []).filter((id) => !chosen.includes(id) && state.instances[id] && getInstance(state, id).location.zone === 'deck');
      moveCards(ctx, rest, { player: master, zone: 'waitingRoom' }, { reason: 'EFFECT' });
      return;
    }

    case 'REPLACE_ATTACK_DAMAGE': {
      next();
      // Only for this card's current attack (そのアタック中).
      const attacking = state.attack && state.attack.attackerObjectId === context.sourceObjectId;
      if (!attacking || !state.turn) return;
      state.replacements = [...(state.replacements ?? []), { kind: 'ATTACK_DAMAGE', attackerObjectId: context.sourceObjectId, attackNumber: state.turn.attackCount, turn: state.turn.number, master, sourceInstance: context.source, effects: effect.effects }];
      return;
    }

    case 'OPPONENT_SWAPS_FROM_WAITING_ROOM': {
      const [target] = resolveTarget(state, context, { who: 'CHOSEN' });
      const opponent = opponentOf(master);
      const filter = { ...(effect.filter ?? {}), ...(effect.levelMaxX ? { levelMax: context.x ?? 0 } : {}) };
      const pool = state.zones[opponent].waitingRoom.filter((id) => getDef(state, id).kind === 'CHARACTER' && matchesFilter(state, id, filter));
      const where = target === undefined ? null : getInstance(state, target).location;
      if (!where || where.zone !== 'stage' || where.player !== opponent || pool.length === 0) {
        next();
        return;
      }
      if (frame.step === 0) {
        frame.step = 1;
        ask(ctx, { kind: 'SELECT_CARDS', player: opponent, prompt: 'EFFECT_CHOOSE', cards: pool.map((id) => getInstance(state, id).objectId), min: 1, max: 1 });
        return;
      }
      const picked = findObject(state, takeAnswer(ctx, 'SELECT_CARDS').cards[0]!).instanceId;
      next();
      // Both move at once: the stage character to the waiting room, the chosen one to its slot.
      moveBatch(ctx, [
        { instanceId: target!, to: { player: opponent, zone: 'waitingRoom' }, opts: { reason: 'EFFECT' } },
        { instanceId: picked, to: { player: opponent, zone: 'stage', slot: where.slot }, opts: { reason: 'EFFECT' } },
      ]);
      return;
    }

    case 'EXTRA_TURN':
      next();
      state.extraTurns = [...(state.extraTurns ?? []), master];
      return;

    case 'REPLAY': {
      next();
      const replay = (getDef(state, context.source).abilities ?? []).find((a) => a.type === 'CONT' && a.replay?.name === effect.name);
      if (!replay || replay.type !== 'CONT' || !replay.replay) return;
      // CR-11.3.3.1: a 【ゲーム1】 replay effect is done once per game by each player.
      if (replay.replay.oncePerGame) {
        if ((state.replaysDone ?? []).some((r) => r.player === master && r.name === effect.name)) return;
        state.replaysDone = [...(state.replaysDone ?? []), { player: master, name: effect.name }];
      }
      pushEffects(ctx, replay.replay.effects, context);
      return;
    }

    case 'CLOCK_ALL_TO_WAITING_ROOM': {
      next();
      const first = state.turn?.player ?? master;
      for (const player of [first, opponentOf(first)]) moveCards(ctx, [...state.zones[player].clock], { player, zone: 'waitingRoom' }, { reason: 'EFFECT' });
      return;
    }

    case 'WAITING_ROOM_TO_DECK':
      next();
      // すべてのプレイヤーは…、それらの山札をシャッフルする: both players; the SHUFFLE that follows shuffles both decks.
      for (const player of effect.everyone ? [state.turn?.player ?? master, opponentOf(state.turn?.player ?? master)] : [master]) {
        moveCards(ctx, [...state.zones[player].waitingRoom], { player, zone: 'deck' }, { reason: 'EFFECT' });
        if (effect.everyone) shuffleDeck(ctx, player);
      }
      return;

    case 'ICON_EFFECT':
      next();
      // The standby icon's effect does not depend on a trigger card (CR-4.14.2.13); it is played as if checked.
      pushFrame(ctx, { kind: 'TRIGGER_ICON', icon: 'STANDBY', player: master, card: context.sourceObjectId, step: 0, picked: null, revealed: [] });
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
          : condition.if === 'DID'
            ? context.did === true
          : evalCondition(state, master, context.source, condition, context.battleOpponent, context.about ?? null);
      next();
      pushEffects(ctx, holds ? effect.then : (effect.else ?? []), context);
      return;
    }

    case 'DELAYED': {
      next();
      const source = getInstance(state, context.source);
      state.delayed = [
        ...(state.delayed ?? []),
        { id: state.nextWaitingId++, master, instanceId: source.instanceId, objectId: context.sourceObjectId, at: effect.at, effects: effect.effects, carried: { chosen: [...context.chosen], lastMoved: [...(context.lastMoved ?? [])], placed: [...(context.placed ?? [])] } },
      ];
      return;
    }

    case 'OWNER_PLACES': {
      const [id] = resolveTarget(state, context, effect.target);
      if (id === undefined) {
        next();
        return;
      }
      const owner = getInstance(state, id).owner;
      if (frame.step === 0) {
        frame.step = 1;
        ask(ctx, { kind: 'SELECT_SLOT', player: owner, prompt: 'EFFECT_SLOT', slots: [...SLOTS] });
        return;
      }
      const slot = takeAnswer(ctx, 'SELECT_SLOT').slot;
      next();
      moveCard(ctx, id, { player: owner, zone: 'stage', slot }, { reason: 'EFFECT' });
      context.placed = [...(context.placed ?? []), getInstance(state, id).objectId];
      return;
    }

    case 'PLACE_IN_EMPTY_SLOT': {
      const [id] = resolveTarget(state, context, effect.target);
      const owner = id === undefined ? master : getInstance(state, id).owner;
      const empty = SLOTS.filter((slot) => state.zones[owner].stage[slot].length === 0);
      if (id === undefined || empty.length === 0) {
        next();
        return;
      }
      if (frame.step === 0) {
        frame.step = 1;
        ask(ctx, { kind: 'SELECT_SLOT', player: master, prompt: 'EFFECT_SLOT', slots: empty });
        return;
      }
      const slot = takeAnswer(ctx, 'SELECT_SLOT').slot;
      next();
      moveCard(ctx, id, { player: owner, zone: 'stage', slot }, { reason: 'EFFECT' });
      context.placed = [...(context.placed ?? []), getInstance(state, id).objectId];
      return;
    }

    case 'SWAP_CHOSEN': {
      next();
      const chosen = resolveTarget(state, context, { who: 'CHOSEN' });
      const self = sourceIfUnchanged(state, context);
      const pair = effect.withSelf ? [chosen[0], self?.instanceId] : [chosen[0], chosen[1]];
      if (pair.some((id) => id === undefined) || pair[0] === pair[1]) return;
      const [a, b] = pair.map((id) => getInstance(state, id!));
      if (a!.location.zone !== 'stage' || b!.location.zone !== 'stage' || a!.location.player !== b!.location.player) return;
      for (const inst of [a!, b!]) setOrientation(ctx, inst.instanceId, 'STAND');
      if (cannotMove(state, a!.instanceId) || cannotMove(state, b!.instanceId)) return;
      swapSlots(ctx, a!.location.player, a!.location.slot, b!.location.slot);
      return;
    }

    case 'EXCHANGE_LEVEL_WAITING_ROOM': {
      const zones = state.zones[master];
      const count = Math.min(effect.count, zones.level.length, zones.waitingRoom.length);
      if (count === 0) {
        next();
        return;
      }
      if (frame.step === 0) {
        frame.step = 1;
        ask(ctx, { kind: 'SELECT_CARDS', player: master, prompt: 'EFFECT_CHOOSE', cards: zones.level.map((id) => getInstance(state, id).objectId), min: count, max: count });
        return;
      }
      if (frame.step === 1) {
        frame.scratch = takeAnswer(ctx, 'SELECT_CARDS').cards.map((objectId) => findObject(state, objectId).instanceId);
        frame.step = 2;
        ask(ctx, { kind: 'SELECT_CARDS', player: master, prompt: 'EFFECT_CHOOSE', cards: zones.waitingRoom.map((id) => getInstance(state, id).objectId), min: count, max: count });
        return;
      }
      const fromWaitingRoom = takeAnswer(ctx, 'SELECT_CARDS').cards.map((objectId) => findObject(state, objectId).instanceId);
      const fromLevel = frame.scratch;
      next();
      // Both move at once; a card put into the level zone is face up (CR-3.9.2.1).
      moveBatch(ctx, [
        ...fromLevel.map((instanceId) => ({ instanceId, to: { player: master, zone: 'waitingRoom' as const }, opts: { reason: 'EFFECT' as const } })),
        ...fromWaitingRoom.map((instanceId) => ({ instanceId, to: { player: master, zone: 'level' as const }, opts: { reason: 'EFFECT' as const } })),
      ]);
      return;
    }

    case 'SWAP_DECK_HAND': {
      const zones = state.zones[master];
      if (frame.step === 0) {
        const pool = zones.deck.filter((id) => matchesFilter(state, id, effect.filter));
        frame.step = 1;
        if (pool.length === 0) return;
        ask(ctx, { kind: 'SELECT_CARDS', player: master, prompt: 'EFFECT_CHOOSE', cards: pool.map((id) => getInstance(state, id).objectId), min: 0, max: 1, look: lookMap(state, pool) });
        return;
      }
      if (frame.step === 1) {
        const picked = zones.deck.filter((id) => matchesFilter(state, id, effect.filter)).length > 0 ? takeAnswer(ctx, 'SELECT_CARDS').cards.map((objectId) => findObject(state, objectId).instanceId) : [];
        for (const id of picked) revealCard(ctx, id);
        frame.scratch = picked;
        const hand = zones.hand.filter((id) => matchesFilter(state, id, effect.handFilter ?? effect.filter));
        frame.step = 2;
        if (hand.length === 0) return;
        frame.step = 3;
        ask(ctx, { kind: 'SELECT_CARDS', player: master, prompt: 'EFFECT_CHOOSE', cards: hand.map((id) => getInstance(state, id).objectId), min: 0, max: 1 });
        return;
      }
      const fromHand = frame.step === 3 ? takeAnswer(ctx, 'SELECT_CARDS').cards.map((objectId) => findObject(state, objectId).instanceId) : [];
      for (const id of fromHand) revealCard(ctx, id);
      const fromDeck = frame.scratch;
      next();
      // それらを入れ替え: an exchange needs one of each.
      if (fromDeck.length === 1 && fromHand.length === 1) {
        moveBatch(ctx, [
          { instanceId: fromDeck[0]!, to: { player: master, zone: 'hand' }, opts: { reason: 'EFFECT' } },
          { instanceId: fromHand[0]!, to: { player: master, zone: 'deck' }, opts: { reason: 'EFFECT' } },
        ]);
      } else {
        for (const id of [...fromDeck, ...fromHand]) getInstance(state, id).revealed = false;
      }
      return;
    }

    case 'MOVE_TO_SLOT': {
      if (frame.step === 0) {
        const [id] = resolveTarget(state, context, effect.target).filter((candidate) => getInstance(state, candidate).location.zone === 'stage');
        const inst = id === undefined ? undefined : getInstance(state, id);
        const slots =
          inst && inst.location.zone === 'stage' && !cannotMove(state, inst.instanceId)
            ? (effect.row === 'FRONT' ? FRONT_SLOTS : effect.row === 'BACK' ? BACK_SLOTS : SLOTS).filter((slot) => state.zones[inst.location.player].stage[slot].length === 0)
            : [];
        if (!inst || slots.length === 0) {
          next();
          return;
        }
        frame.step = 1;
        frame.scratch = [inst.instanceId];
        ask(ctx, { kind: 'SELECT_SLOT', player: master, prompt: 'EFFECT_SLOT', slots });
        return;
      }
      const slot = takeAnswer(ctx, 'SELECT_SLOT').slot;
      const inst = getInstance(state, frame.scratch[0]!);
      next();
      if (inst.location.zone === 'stage') swapSlots(ctx, inst.location.player, inst.location.slot, slot);
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
      const clock = state.zones[effect.whose === 'OPPONENT' ? opponentOf(master) : master].clock;
      // N枚(まで)を: one card at a time.
      if ((effect.count ?? 1) > 1) {
        const done = frame.scratch[0] ?? 0;
        const card = effect.fromBottom ? clock[0] : topOf(clock);
        if (done >= effect.count! || card === undefined) {
          next();
          return;
        }
        if (effect.optional && frame.step === 0) {
          frame.step = 1;
          ask(ctx, { kind: 'CONFIRM', player: master, prompt: 'USE_ABILITY' });
          return;
        }
        if (effect.optional) {
          frame.step = 0;
          if (!takeAnswer(ctx, 'CONFIRM').accept) {
            next();
            return;
          }
        }
        frame.scratch[0] = done + 1;
        context.did = true;
        moveCard(ctx, card, { player: getInstance(state, card).owner, zone: effect.to === 'STOCK' ? 'stock' : 'waitingRoom' }, { reason: 'EFFECT' });
        return;
      }
      const top = effect.fromBottom ? clock[0] : topOf(clock);
      // 1枚までを: the player may leave the card where it is.
      if (effect.optional && top !== undefined && frame.step === 0) {
        frame.step = 1;
        ask(ctx, { kind: 'CONFIRM', player: master, prompt: 'USE_ABILITY' });
        return;
      }
      const declined = effect.optional && top !== undefined && !takeAnswer(ctx, 'CONFIRM').accept;
      context.did = top !== undefined && !declined;
      next();
      if (top !== undefined && !declined) moveCard(ctx, top, { player: getInstance(state, top).owner, zone: effect.to === 'STOCK' ? 'stock' : 'waitingRoom' }, { reason: 'EFFECT' });
      return;
    }

    case 'MARKERS_TOP': {
      next();
      const self = sourceIfUnchanged(state, context);
      if (!self || self.location.zone !== 'stage') return;
      const markers = state.zones[self.location.player].marker[self.location.slot];
      // CR-3.7.2: markers are taken from the top.
      const taken = markers.slice(-effect.count).reverse();
      for (const id of taken) {
        const owner = getInstance(state, id).owner;
        moveCard(ctx, id, { player: owner, zone: effect.to === 'HAND' ? 'hand' : effect.to === 'STOCK' ? 'stock' : 'waitingRoom' }, { reason: 'EFFECT' });
      }
      context.did = taken.length > 0;
      return;
    }

    case 'REPEAT':
      next();
      // The repetitions in a row: one list of effects, so each runs after the one before has finished.
      pushEffects(ctx, Array.from({ length: effect.timesX ? Math.max(0, context.x ?? 0) : effect.times }, () => effect.effects).flat(), context);
      return;

    case 'TRIGGER_CHECKS':
      next();
      // Only during an attack of the ability's master, before its trigger step is over.
      if (state.attack && state.attack.player === master) state.attack.triggerChecks = effect.count;
      return;

    case 'CHOOSE_ONE': {
      if (frame.step === 0) {
        frame.step = 1;
        ask(ctx, { kind: 'SELECT_OPTION', player: master, prompt: 'EFFECT_OPTION', options: effect.options.map((_, i) => `EFFECT_${i + 1}`) });
        return;
      }
      const chosen = Number(takeAnswer(ctx, 'SELECT_OPTION').option.slice('EFFECT_'.length)) - 1;
      next();
      pushEffects(ctx, effect.options[chosen] ?? [], context);
      return;
    }

    case 'MAY_PAY': {
      // The cost cannot be paid: nothing is asked and nothing happens (CR-8.4.1.2).
      if (frame.step === 0 && !canPayCost(state, context, effect.cost)) {
        next();
        return;
      }
      if (frame.step === 0) {
        frame.step = 1;
        ask(ctx, { kind: 'CONFIRM', player: master, prompt: 'PAY_COST' });
        return;
      }
      const pays = takeAnswer(ctx, 'CONFIRM').accept;
      next();
      if (!pays) return;
      // The cost frame is on top, so it is paid before the effects it buys.
      pushEffects(ctx, effect.then, context);
      pushCost(ctx, effect.cost, context);
      return;
    }

    case 'REORDER_TOP':
      // 上からＸ枚まで見て、カードをＸ枚まで選び: X of this resolution.
      stepReorderTop(ctx, frame, effect.x ? { ...effect, upTo: context.x ?? 0, keep: context.x ?? 0 } : effect, next);
      return;

    case 'STOCK_BOTTOM_TO_WAITING_ROOM': {
      // One card at a time from the bottom of the opponent's stock.
      const opponent = opponentOf(master);
      const done = frame.scratch[0] ?? 0;
      const bottom = state.zones[opponent].stock[0];
      if (done >= effect.count || bottom === undefined) {
        next();
        return;
      }
      frame.scratch[0] = done + 1;
      moveCard(ctx, bottom, { player: opponent, zone: 'waitingRoom' }, { reason: 'EFFECT' });
      return;
    }

    case 'OPPONENT_STOCK_RESET': {
      const opponent = opponentOf(master);
      if (frame.step === 0) {
        // Every stock card leaves at once; then as many come from the top of the deck, one at a time (a refresh in between happens in place).
        frame.step = 1;
        const stock = [...state.zones[opponent].stock];
        frame.scratch[0] = stock.length;
        frame.scratch[1] = 0;
        if (effect.via === 'WAITING_ROOM') moveCards(ctx, stock, { player: opponent, zone: 'waitingRoom' }, { reason: 'EFFECT' });
        else {
          moveCards(ctx, stock, { player: opponent, zone: 'deck' }, { reason: 'EFFECT' });
          shuffleDeck(ctx, opponent);
        }
        return;
      }
      const top = topOf(state.zones[opponent].deck);
      if ((frame.scratch[1] ?? 0) >= (frame.scratch[0] ?? 0) || top === undefined) {
        next();
        return;
      }
      frame.scratch[1] = (frame.scratch[1] ?? 0) + 1;
      moveCard(ctx, top, { player: opponent, zone: 'stock' }, { reason: 'EFFECT' });
      return;
    }

    case 'TOP_OR_BOTTOM': {
      const deckOwner = effect.whose === 'OPPONENT' ? opponentOf(master) : master;
      const top = topOf(state.zones[deckOwner].deck);
      if (top === undefined) {
        next();
        return;
      }
      if (frame.step === 0) {
        frame.step = 1;
        ask(ctx, { kind: 'SELECT_OPTION', player: master, prompt: 'EFFECT_TOP_OR_BOTTOM', options: effect.anyOfThree ? ['DECK_TOP', 'DECK_BOTTOM', 'WAITING_ROOM'] : ['DECK_TOP', effect.orWaitingRoom ? 'WAITING_ROOM' : 'DECK_BOTTOM'], look: lookMap(state, [top]) });
        return;
      }
      const option = takeAnswer(ctx, 'SELECT_OPTION').option;
      const bottom = option === 'DECK_BOTTOM';
      next();
      if (option === 'WAITING_ROOM') {
        moveCard(ctx, top, { player: deckOwner, zone: 'waitingRoom' }, { reason: 'EFFECT' });
        return;
      }
      // Only its place in the deck changes; it stays hidden from the opponent and keeps its object id (same zone).
      if (bottom) {
        const deck = state.zones[deckOwner].deck;
        deck.splice(deck.indexOf(top), 1);
        deck.unshift(top);
      }
      return;
    }

    case 'SHOW_TOP': {
      const top = topOf(state.zones[master].deck);
      next();
      context.x = 0;
      if (top === undefined) return;
      revealCard(ctx, top);
      context.x = getDef(state, top).level ?? 0;
      // 公開したカードは元に戻す: it stays on top, no longer shown.
      getInstance(state, top).revealed = false;
      return;
    }

    case 'MAY': {
      if (frame.step === 0) {
        frame.step = 1;
        ask(ctx, { kind: 'CONFIRM', player: master, prompt: 'USE_ABILITY' });
        return;
      }
      const accept = takeAnswer(ctx, 'CONFIRM').accept;
      context.did = accept;
      next();
      if (accept) pushEffects(ctx, effect.effects, context);
      return;
    }

    case 'REVEAL_TOP': {
      const top = topOf(state.zones[master].deck);
      // 公開してよい: asked first (only when there is a card to show).
      if (effect.optional && top !== undefined && frame.step === 0) {
        frame.step = 1;
        ask(ctx, { kind: 'CONFIRM', player: master, prompt: 'USE_ABILITY' });
        return;
      }
      if (effect.optional && top !== undefined && !takeAnswer(ctx, 'CONFIRM').accept) {
        next();
        return;
      }
      next();
      if (top === undefined) return;
      revealCard(ctx, top);
      const hit = matchesFilter(state, top, effect.filter);
      // Taken into the hand (or the stock), or put back as it was: no longer shown.
      if (hit && effect.toStock) moveCard(ctx, top, { player: master, zone: 'stock' }, { reason: 'EFFECT' });
      else if (hit && effect.take) moveCard(ctx, top, { player: master, zone: 'hand' }, { reason: 'EFFECT' });
      else getInstance(state, top).revealed = false;
      if (hit && effect.then) pushEffects(ctx, effect.then, context);
      if (!hit && effect.else) pushEffects(ctx, effect.else, context);
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

/** As lookMap, for only the cards in that player's own deck (others are public, or must stay hidden). */
function deckLook(state: GameState, player: PlayerId, instanceIds: readonly number[]): Record<number, string> {
  return lookMap(state, instanceIds.filter((id) => getInstance(state, id).location.zone === 'deck' && getInstance(state, id).location.player === player));
}

/** Card ids of the cards a player is looking at, by object id, for the decision that shows them. */
function lookMap(state: GameState, instanceIds: readonly number[]): Record<number, string> {
  const look: Record<number, string> = {};
  for (const id of instanceIds) look[getInstance(state, id).objectId] = getInstance(state, id).cardId;
  return look;
}

/**
 * 山札を上からN枚まで見て、(カードをM枚まで選び、)山札の上に好きな順番で置き(、残りのカードを控え室に置く).
 * scratch[0..k): the cards looked at, top first (they stay in the deck while being looked at). Steps:
 * 0/1 look at the next card or stop; 2 choose the cards to keep (with `keep`); 3/4 choose the order one card at a
 * time; 5 the rest to the waiting room and the kept cards back on top, the first chosen on the very top.
 * frame.scratch holds [looked..., -1, kept in chosen order...] after step 2.
 */
function stepReorderTop(ctx: Ctx, frame: Extract<Frame, { kind: 'EFFECTS' }>, effect: Extract<Effect, { do: 'REORDER_TOP' }>, next: () => void): void {
  const state = ctx.state;
  const { master } = frame.context;
  const whose = effect.whose === 'OPPONENT' ? opponentOf(master) : master;
  const deck = state.zones[whose].deck;
  const split = frame.scratch.indexOf(-1);
  const looked = split < 0 ? frame.scratch : frame.scratch.slice(0, split);
  const ordered = split < 0 ? [] : frame.scratch.slice(split + 1);
  const objects = (ids: readonly number[]) => ids.map((id) => getInstance(state, id).objectId);

  if (frame.step === 0) {
    if (looked.length >= effect.upTo || looked.length >= deck.length) {
      frame.step = 2;
      return;
    }
    frame.step = 1;
    ask(ctx, { kind: 'CONFIRM', player: master, prompt: 'LOOK_NEXT', look: lookMap(state, looked) });
    return;
  }
  if (frame.step === 1) {
    if (takeAnswer(ctx, 'CONFIRM').accept) {
      frame.scratch.push(deck[deck.length - 1 - looked.length] as number);
      frame.step = 0;
    } else frame.step = 2;
    return;
  }
  if (frame.step === 2) {
    if (effect.keep !== undefined && looked.length > 0) {
      frame.step = 3;
      ask(ctx, { kind: 'SELECT_CARDS', player: master, prompt: 'EFFECT_KEEP', cards: objects(looked), min: effect.keepExact ? Math.min(effect.keep, looked.length) : 0, max: Math.min(effect.keep, looked.length), look: lookMap(state, looked) });
      return;
    }
    frame.scratch = [...looked, -1];
    frame.step = 4;
    return;
  }
  if (frame.step === 3) {
    const kept = takeAnswer(ctx, 'SELECT_CARDS').cards.map((objectId) => findObject(state, objectId).instanceId);
    // The cards not kept stay in the list before the marker; the kept ones wait to be ordered.
    frame.scratch = [...looked, -1];
    frame.context.chosen = objects(kept);
    frame.step = 4;
    return;
  }
  // The cards still to be ordered: all looked at, or the kept ones.
  const pool = (effect.keep !== undefined ? frame.context.chosen.map((objectId) => findObject(state, objectId).instanceId) : looked).filter((id) => !ordered.includes(id));
  if (frame.step === 4 && pool.length > 1) {
    frame.step = 5;
    ask(ctx, { kind: 'SELECT_CARDS', player: master, prompt: 'EFFECT_ORDER', cards: objects(pool), min: 1, max: 1, look: lookMap(state, [...looked]) });
    return;
  }
  if (frame.step === 5) {
    const pickedId = findObject(state, takeAnswer(ctx, 'SELECT_CARDS').cards[0]!).instanceId;
    frame.scratch.push(pickedId);
    frame.step = 4;
    return;
  }
  // Done: the last card to order goes last; the rest go to the waiting room; the order is set on top of the deck.
  const finalOrder = [...ordered, ...pool];
  const rest = looked.filter((id) => !finalOrder.includes(id));
  next();
  if (rest.length > 0) moveCards(ctx, rest, { player: whose, zone: 'waitingRoom' }, { reason: 'EFFECT' });
  // They stay in the deck: only their order changes (first chosen on the very top). Hidden from both players
  // except as looked at, so no event; the cards keep their object ids (they do not change zone, CR-3.1.4).
  const remaining = deck.filter((id) => !finalOrder.includes(id));
  deck.splice(0, deck.length, ...remaining, ...[...finalOrder].reverse());
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
      max: Math.min(effect.picks ?? 1, candidates.length),
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
  const marker = frame.scratch.indexOf(-1);
  const looked = marker >= 0 ? frame.scratch.slice(0, marker) : [...frame.scratch];
  const chosen = context.chosen.map((objectId) => findObject(state, objectId).instanceId);
  // カードをN枚まで選び、ストック置場に置き: of the other cards looked at, up to N go to the stock.
  if (effect.toStock && marker < 0) {
    const rest = looked.filter((id) => !chosen.includes(id));
    if (frame.step === 4 && rest.length > 0) {
      frame.step = 5;
      ask(ctx, { kind: 'SELECT_CARDS', player: master, prompt: 'EFFECT_CHOOSE', cards: rest.map((id) => getInstance(state, id).objectId), min: 0, max: Math.min(effect.toStock, rest.length), look: lookMap(state, looked) });
      return;
    }
    const toStock = frame.step === 5 ? takeAnswer(ctx, 'SELECT_CARDS').cards.map((objectId) => findObject(state, objectId).instanceId) : [];
    frame.scratch = [...looked, -1, ...toStock];
  }
  const stocked = marker >= 0 || effect.toStock ? frame.scratch.slice(frame.scratch.indexOf(-1) + 1) : [];
  // 手札に加えたなら: whether a card was taken.
  context.did = chosen.length > 0;
  next();
  if (effect.reveal) for (const id of chosen) revealCard(ctx, id);
  moveBatch(
    ctx,
    looked.map((instanceId) => ({
      instanceId,
      to: { player: master, zone: chosen.includes(instanceId) ? ('hand' as const) : stocked.includes(instanceId) ? ('stock' as const) : ('waitingRoom' as const) },
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
