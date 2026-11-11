/**
 * Rule actions (CR-9).
 *
 * Interrupt-type rule actions (refresh, level up) are performed the moment
 * their condition holds, in the middle of whatever is going on (CR-9.1.2.1).
 * Check-type rule actions are performed only during a check timing, all at
 * once (CR-9.1.2.2).
 */

import type { BatchMove, Ctx } from '../moves';
import { moveBatch, moveCard, moveCards, shuffleDeck } from '../moves';
import { getDef, getInstance } from '../state';
import { getPower } from '../stats';
import type { GameState, LossReason, PlayerId } from '../types';
import { CLOCK_LIMIT, LOSING_LEVEL, PLAYERS, SLOTS, opponentOf } from '../types';
import { ask, emit, endGame, findObject, objectIdsOf, playersInTurnOrder, popFrame, pushFrame, takeAnswer, topOf } from './core';
import type { Frame } from './frames';

// ---------------------------------------------------------------------------
// Interrupt-type rule actions
// ---------------------------------------------------------------------------

/**
 * CR-9.2.1 with CR-9.2.2.1: a refresh is performed when the deck is empty
 * and the waiting room is not. With both empty no refresh happens until the
 * waiting room has cards again. (The other case of CR-9.2.2.1, losing during
 * damage, is checked in pushInterruptIfDue.)
 */
export function isRefreshDue(state: GameState, player: PlayerId): boolean {
  const zones = state.zones[player];
  return zones.deck.length === 0 && zones.waitingRoom.length > 0;
}

/** CR-9.3.1 */
export function isLevelUpDue(state: GameState, player: PlayerId): boolean {
  return state.zones[player].clock.length >= CLOCK_LIMIT;
}

/**
 * Called by the engine loop before every step. Starts the interrupt rule
 * action that is due, if any, and reports whether it did.
 *
 * A rule action already being performed is not itself interrupted: when
 * several are due at once they are performed one after another in the order
 * of CR-9.1.2.1.1, and the loop comes back here after each one.
 */
export function pushInterruptIfDue(ctx: Ctx): boolean {
  const state = ctx.state;

  // CR-9.2.2.1: a player whose deck ran out while they are being dealt
  // damage, with no card in the waiting room to refresh and no climax in the
  // resolution zone, loses the game immediately.
  for (const player of playersInTurnOrder(state)) {
    const zones = state.zones[player];
    if (zones.deck.length > 0 || zones.waitingRoom.length > 0) continue;
    const takingDamage = state.stack.some((frame) => frame.kind === 'DAMAGE' && frame.receiver === player);
    if (!takingDamage) continue;
    if (zones.resolution.some((id) => getDef(state, id).kind === 'CLIMAX')) continue;
    endGame(ctx, { outcome: 'WIN', winner: opponentOf(player), loser: player, reason: 'NO_CARDS' });
    return true;
  }

  const top = state.stack[state.stack.length - 1];
  if (top && (top.kind === 'REFRESH' || top.kind === 'LEVEL_UP' || top.kind === 'RULE_ACTION_ORDER')) {
    return false;
  }

  // CR-9.1.2.1.1.1: the turn player's rule actions first.
  for (const player of playersInTurnOrder(state)) {
    const refresh = isRefreshDue(state, player);
    const levelUp = isLevelUpDue(state, player);
    if (refresh && levelUp) {
      // CR-9.1.2.1.1.2: the player chooses the order of their own.
      pushFrame(ctx, { kind: 'RULE_ACTION_ORDER', player, asked: false });
      return true;
    }
    if (refresh) {
      pushFrame(ctx, { kind: 'REFRESH', player });
      return true;
    }
    if (levelUp) {
      pushFrame(ctx, { kind: 'LEVEL_UP', player, asked: false });
      return true;
    }
  }
  return false;
}

export function stepRuleActionOrder(ctx: Ctx, frame: Extract<Frame, { kind: 'RULE_ACTION_ORDER' }>): void {
  if (!frame.asked) {
    frame.asked = true;
    ask(ctx, { kind: 'RULE_ACTION_ORDER', player: frame.player, options: ['REFRESH', 'LEVEL_UP'] });
    return;
  }
  const { first } = takeAnswer(ctx, 'RULE_ACTION_ORDER');
  popFrame(ctx, frame);
  // Only the first is started here. The other is still due afterwards and is
  // picked up by the engine loop, which re-evaluates the situation.
  if (first === 'REFRESH') pushFrame(ctx, { kind: 'REFRESH', player: frame.player });
  else pushFrame(ctx, { kind: 'LEVEL_UP', player: frame.player, asked: false });
}

/**
 * CR-9.2.2: all waiting room cards go to the deck, the deck is shuffled, then
 * its top card is put into the clock. That last move is not damage, so it
 * can never be cancelled (CR-4.12.2).
 */
export function stepRefresh(ctx: Ctx, frame: Extract<Frame, { kind: 'REFRESH' }>): void {
  const { player } = frame;
  const zones = ctx.state.zones[player];

  moveCards(ctx, [...zones.waitingRoom], { player, zone: 'deck' }, { reason: 'REFRESH' });
  shuffleDeck(ctx, player);
  const top = topOf(zones.deck);
  if (top === undefined) throw new Error('Engine bug: deck empty right after a refresh');
  moveCard(ctx, top, { player, zone: 'clock' }, { reason: 'REFRESH_PENALTY' });

  emit(ctx, { type: 'REFRESH', player });
  popFrame(ctx, frame);
}

/**
 * CR-9.3.2: the player chooses one of the bottom seven clock cards; it goes
 * to the level zone and the other six go to the waiting room. Clock cards
 * above the seventh stay where they are.
 */
export function stepLevelUp(ctx: Ctx, frame: Extract<Frame, { kind: 'LEVEL_UP' }>): void {
  const state = ctx.state;
  const { player } = frame;
  const bottomSeven = state.zones[player].clock.slice(0, CLOCK_LIMIT);

  if (!frame.asked) {
    frame.asked = true;
    ask(ctx, { kind: 'LEVEL_UP', player, cards: objectIdsOf(state, bottomSeven) });
    return;
  }

  const chosen = findObject(state, takeAnswer(ctx, 'LEVEL_UP').card).instanceId;
  const moves: BatchMove[] = [{ instanceId: chosen, to: { player, zone: 'level' }, opts: { reason: 'LEVEL_UP' } }];
  for (const id of bottomSeven) {
    if (id === chosen) continue;
    // The rule names the player's own waiting room. The order within it is
    // the player's choice, which has no effect: a waiting room may be
    // rearranged freely at any time (CR-3.4.2).
    moves.push({ instanceId: id, to: { player, zone: 'waitingRoom' }, opts: { reason: 'LEVEL_UP' } });
  }
  moveBatch(ctx, moves);

  emit(ctx, { type: 'LEVEL_UP', player, level: state.zones[player].level.length });
  popFrame(ctx, frame);
}

// ---------------------------------------------------------------------------
// Check-type rule actions
// ---------------------------------------------------------------------------

/** CR-9.4.1: the losing condition a player currently meets, if any. */
export function losingCondition(state: GameState, player: PlayerId): LossReason | null {
  const zones = state.zones[player];
  if (zones.level.length >= LOSING_LEVEL) return 'LEVEL_4';
  if (zones.deck.length === 0 && zones.waitingRoom.length === 0) return 'NO_CARDS';
  return null;
}

/**
 * Of several cards of the right type sharing a slot or the climax zone, only
 * the one placed last stays; if the last placement put several there at
 * once, none stays (CR-9.6.2, CR-9.6.2.1). Returns the cards to remove.
 */
function surplusCards(state: GameState, ids: readonly number[]): number[] {
  if (ids.length <= 1) return [];
  const latest = Math.max(...ids.map((id) => getInstance(state, id).enteredBatch));
  const newest = ids.filter((id) => getInstance(state, id).enteredBatch === latest);
  return newest.length === 1 ? ids.filter((id) => id !== newest[0]) : [...ids];
}

/**
 * Performs every check-type rule action that applies, all judged on the same
 * situation and carried out simultaneously (CR-9.1.2.2.1).
 * Returns true when something was done (CR-8.5.1.1 then repeats the step).
 */
export function performCheckRuleActions(ctx: Ctx): boolean {
  const state = ctx.state;

  // CR-9.4: losing conditions. CR-1.2.3: both at once is a draw.
  const reasons = [losingCondition(state, 0), losingCondition(state, 1)] as const;
  if (reasons[0] && reasons[1]) {
    endGame(ctx, { outcome: 'DRAW', reasons: [reasons[0], reasons[1]] });
    return true;
  }
  for (const player of PLAYERS) {
    const reason = reasons[player];
    if (reason) {
      endGame(ctx, { outcome: 'WIN', winner: opponentOf(player), loser: player, reason });
      return true;
    }
  }

  const toRemove = new Set<number>();

  for (const player of PLAYERS) {
    const zones = state.zones[player];

    for (const slot of SLOTS) {
      const characters: number[] = [];
      for (const id of zones.stage[slot]) {
        // CR-9.6.1: a card in a slot that is not a character.
        if (getDef(state, id).kind !== 'CHARACTER') toRemove.add(id);
        else characters.push(id);
      }
      // CR-9.5.1: a character whose power is 0 or less.
      for (const id of characters) {
        if (getPower(state, id) <= 0) toRemove.add(id);
      }
      // CR-9.6.2: several characters in one slot.
      for (const id of surplusCards(state, characters)) toRemove.add(id);
      // CR-9.7.1: markers of a slot with no character.
      if (characters.length === 0) {
        for (const id of zones.marker[slot]) toRemove.add(id);
      }
    }

    const climaxes: number[] = [];
    for (const id of zones.climax) {
      // CR-9.6.1: a card in the climax zone that is not a climax.
      if (getDef(state, id).kind !== 'CLIMAX') toRemove.add(id);
      else climaxes.push(id);
    }
    // CR-9.6.2: several climaxes in the climax zone.
    for (const id of surplusCards(state, climaxes)) toRemove.add(id);
  }

  if (toRemove.size === 0) return false;

  // Everything removed by these rule actions goes to its owner's waiting room.
  moveBatch(
    ctx,
    [...toRemove].map((instanceId) => ({
      instanceId,
      to: { player: getInstance(state, instanceId).owner, zone: 'waitingRoom' as const },
      opts: { reason: 'RULE_ACTION' as const },
    })),
  );
  return true;
}
