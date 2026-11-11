/**
 * Playing cards from hand and playing activated abilities (CR-8.6.2).
 */

import { canPayCost, countUse, limitReached, playAbility, pushEffects } from './abilities/effects';
import { evalCondition, stageCharacters } from './abilities/query';
import type { ActivatedAbility, EffectContext } from './abilities/types';
import type { MainAction } from './decisions';
import { emit, findObject, pushFrame } from './flow/core';
import type { Ctx } from './moves';
import { moveCard, moveCards, swapSlots } from './moves';
import { getDef, getInstance } from './state';
import { availableColors, playerLevel } from './stats';
import type { CardInstance } from './types';
import type { CardDef, GameState, PlayerId, SlotId } from './types';
import { SLOTS } from './types';
import { stageSlot } from './zones';

/** CR-2.7: stock cards to pay for playing the card; climaxes have no cost. */
function stockCost(def: CardDef): number {
  return def.cost ?? 0;
}

/** CR-8.6.2.1.1: colour condition. Level 0 characters and events are exempt (CR-8.6.2.1.1.1). */
function meetsColorCondition(state: GameState, player: PlayerId, def: CardDef): boolean {
  if (def.kind !== 'CLIMAX' && def.level === 0) return true;
  return availableColors(state, player).has(def.color);
}

/** CR-8.6.2.1.2: level condition. Not checked for climaxes (CR-8.6.2.1.2.1). */
function meetsLevelCondition(state: GameState, player: PlayerId, def: CardDef): boolean {
  if (def.kind === 'CLIMAX') return true;
  return (def.level ?? 0) <= playerLevel(state, player);
}

/**
 * Whether a card in the player's hand can be played right now as far as
 * colour, level and cost go (CR-8.6.2.1, CR-8.6.2.3.2). Which phase allows
 * which card type is decided by the caller.
 */
export function canPlayFromHand(state: GameState, player: PlayerId, instanceId: number): boolean {
  const inst = getInstance(state, instanceId);
  if (inst.location.zone !== 'hand' || inst.location.player !== player) return false;
  const def = getDef(state, instanceId);
  return (
    meetsColorCondition(state, player, def) &&
    meetsLevelCondition(state, player, def) &&
    state.zones[player].stock.length >= stockCost(def)
  );
}

/** CR-6.5.1.2: every action the turn player may take at a main phase play timing. */
export function listMainActions(state: GameState, player: PlayerId): MainAction[] {
  const actions: MainAction[] = [];
  const zones = state.zones[player];

  for (const id of zones.hand) {
    if (!canPlayFromHand(state, player, id)) continue;
    const def = getDef(state, id);
    const card = getInstance(state, id).objectId;
    if (def.kind === 'CHARACTER') {
      // CR-8.6.2.2.1: any of the player's slots may be chosen, occupied or not.
      for (const slot of SLOTS) actions.push({ type: 'PLAY_CHARACTER', card, slot });
    } else if (def.kind === 'EVENT') {
      actions.push({ type: 'PLAY_EVENT', card });
    }
  }

  // CR-6.5.1.2.3: activated abilities of the player's characters on the stage.
  for (const id of stageCharacters(state, player)) {
    const inst = getInstance(state, id);
    (getDef(state, id).abilities ?? []).forEach((ability, index) => {
      if (ability.type === 'ACT' && ability.timing === 'MAIN' && canActivate(state, player, inst, index, ability)) {
        actions.push({ type: 'ACTIVATE', card: inst.objectId, ability: index });
      }
    });
  }

  // CR-6.5.1.2.4. Choosing two empty slots is allowed by the rules but does
  // nothing, so it is not offered: it would only let a turn go on forever.
  for (let i = 0; i < SLOTS.length; i++) {
    for (let j = i + 1; j < SLOTS.length; j++) {
      const a = SLOTS[i] as SlotId;
      const b = SLOTS[j] as SlotId;
      if (zones.stage[a].length > 0 || zones.stage[b].length > 0) actions.push({ type: 'SWAP', a, b });
    }
  }

  actions.push({ type: 'PASS' });
  return actions;
}

/** CR-6.6.1.2.1: object ids of the climax cards in hand that can be played. */
export function listPlayableClimaxes(state: GameState, player: PlayerId): number[] {
  return state.zones[player].hand
    .filter((id) => getDef(state, id).kind === 'CLIMAX' && canPlayFromHand(state, player, id))
    .map((id) => getInstance(state, id).objectId);
}

/** CR-8.4.3 / CR-3.10.2: moves the top n stock cards to the waiting room, from the top down. */
export function payStock(ctx: Ctx, player: PlayerId, count: number): void {
  if (count <= 0) return;
  const stock = ctx.state.zones[player].stock;
  if (stock.length < count) throw new Error('Engine bug: paying more stock than available');
  const fromTop = stock.slice(stock.length - count).reverse();
  moveCards(ctx, fromTop, { player, zone: 'waitingRoom' }, { reason: 'COST' });
}

/**
 * CR-8.6.2.3 to 8.6.2.5 for a card from hand: pay the cost, raise the
 * "played" event, then resolve the card according to its type.
 */
function playFromHand(ctx: Ctx, player: PlayerId, instanceId: number, slot?: SlotId): void {
  const state = ctx.state;
  if (!canPlayFromHand(state, player, instanceId)) {
    throw new Error('Engine bug: tried to play a card that cannot be played');
  }
  const def = getDef(state, instanceId);
  const cost = stockCost(def);

  payStock(ctx, player, cost);
  emit(ctx, {
    type: 'CARD_PLAYED',
    player,
    instanceId,
    cardId: def.cardId,
    cardKind: def.kind,
    ...(slot ? { slot } : {}),
    stockPaid: cost,
  });

  switch (def.kind) {
    case 'CHARACTER':
      if (!slot) throw new Error('Engine bug: a character was played without a slot');
      // CR-8.6.2.5.1: a character already there is removed by the next rule action (CR-9.6.2).
      moveCard(ctx, instanceId, stageSlot(player, slot), { reason: 'PLAY' });
      return;
    case 'EVENT':
      // CR-8.6.2.5.2: resolution zone, effect, then the owner's waiting room.
      moveCard(ctx, instanceId, { player, zone: 'resolution' }, { reason: 'PLAY' });
      pushFrame(ctx, { kind: 'FINISH_EVENT', objectId: getInstance(state, instanceId).objectId });
      pushEffects(ctx, def.effect ?? [], abilityContext(player, getInstance(state, instanceId)));
      return;
    case 'CLIMAX':
      // CR-8.6.2.5.3
      moveCard(ctx, instanceId, { player, zone: 'climax' }, { reason: 'PLAY' });
      return;
  }
}

/** Carries out a validated main phase action other than PASS. */
export function performMainAction(ctx: Ctx, player: PlayerId, action: MainAction): void {
  switch (action.type) {
    case 'PLAY_CHARACTER':
      playFromHand(ctx, player, findObject(ctx.state, action.card).instanceId, action.slot);
      return;
    case 'PLAY_EVENT':
      playFromHand(ctx, player, findObject(ctx.state, action.card).instanceId);
      return;
    case 'ACTIVATE':
      activate(ctx, player, action.card, action.ability);
      return;
    case 'SWAP':
      swapSlots(ctx, player, action.a, action.b);
      return;
    case 'PASS':
      return;
  }
}

function abilityContext(master: PlayerId, source: CardInstance): EffectContext {
  const location = source.location;
  return {
    master,
    source: source.instanceId,
    sourceObjectId: source.objectId,
    chosen: [],
    battleOpponent: null,
    sourceSlot: location.zone === 'stage' ? { player: location.player, slot: location.slot } : null,
  };
}

function withKeywords(context: EffectContext, ability: ActivatedAbility): EffectContext {
  return ability.keywords ? { ...context, keywords: [...ability.keywords] } : context;
}

/** Whether an activated ability can be played now: its condition, its per-turn limit and its cost. */
function canActivate(state: GameState, player: PlayerId, source: CardInstance, index: number, ability: ActivatedAbility): boolean {
  if (limitReached(state, source.objectId, index, ability.limit)) return false;
  if (!evalCondition(state, player, source.instanceId, ability.condition)) return false;
  return canPayCost(state, abilityContext(player, source), ability.cost);
}

/** CR-8.6.2 for an activated ability: cost, "played", effects. */
function activate(ctx: Ctx, player: PlayerId, objectId: number, index: number): void {
  const state = ctx.state;
  const source = findObject(state, objectId);
  const ability = getDef(state, source.instanceId).abilities?.[index];
  if (!ability || ability.type !== 'ACT' || !canActivate(state, player, source, index, ability)) {
    throw new Error('Engine bug: tried to play an activated ability that cannot be played');
  }
  countUse(state, source.objectId, index);
  playAbility(ctx, withKeywords(abilityContext(player, source), ability), index, ability.cost, ability.effect);
}

/**
 * CR-10.5: the backup abilities the defending player can play from hand in
 * the counter step: the card has a counter icon (CR-7.4.1.2.1), the player's
 * level is at least the level the ability names, and the cost can be paid.
 */
export function listBackups(state: GameState, player: PlayerId): { card: number; ability: number }[] {
  const options: { card: number; ability: number }[] = [];
  for (const id of state.zones[player].hand) {
    const def = getDef(state, id);
    if (!def.counter) continue;
    const inst = getInstance(state, id);
    (def.abilities ?? []).forEach((ability, index) => {
      if (ability.type !== 'ACT' || ability.timing !== 'COUNTER') return;
      if (playerLevel(state, player) < (ability.level ?? 0)) return;
      if (canActivate(state, player, inst, index, ability)) options.push({ card: inst.objectId, ability: index });
    });
  }
  return options;
}

/** CR-7.4.1.2: plays a backup ability of a card in hand. */
export function playBackup(ctx: Ctx, player: PlayerId, objectId: number, index: number): void {
  activate(ctx, player, objectId, index);
}

/**
 * CR-7.4.1.2.1: object ids of the counter events in hand that the defending
 * player may play in the counter step.
 */
export function listPlayableCounters(state: GameState, player: PlayerId): number[] {
  return state.zones[player].hand
    .filter((id) => {
      const def = getDef(state, id);
      return def.kind === 'EVENT' && def.counter && canPlayFromHand(state, player, id);
    })
    .map((id) => getInstance(state, id).objectId);
}

/** CR-7.4.1.2: plays a counter event from hand, given its object id. */
export function playCounter(ctx: Ctx, player: PlayerId, objectId: number): void {
  playFromHand(ctx, player, findObject(ctx.state, objectId).instanceId);
}

/** CR-6.6.1.2: plays a climax card from hand, given its object id. */
export function playClimax(ctx: Ctx, player: PlayerId, objectId: number): void {
  playFromHand(ctx, player, findObject(ctx.state, objectId).instanceId);
}
