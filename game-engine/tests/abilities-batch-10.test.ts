/**
 * Building blocks of batch 4, part 3: delayed abilities (次の…の始めに / ターンの終わりに), cards referred back to
 * (そのキャラ, この効果で舞台に置かれたキャラ), a card placed by its owner or in an empty slot, slot swaps, the level
 * zone exchanged with the waiting room, a climax exchanged between deck and hand, and a second choice by name.
 * Synthetic cards; the wording each case stands for is in its name.
 */

import { describe, expect, it } from 'vitest';
import { type Ability, type Cost, type Effect, assertInvariants, getInstance, stageSlot } from '../src/index';
import { activate, cards } from './ability-helpers';
import { answer, card, oid, pending, put, scenario } from './helpers';

const act = (effect: Effect[], cost: Cost[] = []): Ability => ({ type: 'ACT', timing: 'MAIN', cost, effect });
type State = ReturnType<typeof scenario>['state'];

/** Passes every decision that has a "do nothing" answer until the given player's next main phase. */
function toNextMain(state: State, player: 0 | 1, limit = 200): State {
  let s = state;
  for (let k = 0; k < limit; k++) {
    const d = s.pending;
    if (!d) throw new Error('no decision');
    if (d.kind === 'MAIN' && d.player === player && k > 0) return s;
    const choice =
      d.kind === 'MAIN' ? { kind: 'MAIN' as const, action: { type: 'PASS' as const } }
      : d.kind === 'CLIMAX' ? { kind: 'CLIMAX' as const, card: null }
      : d.kind === 'ATTACK' ? { kind: 'ATTACK' as const, attack: null }
      : d.kind === 'CLOCK' ? { kind: 'CLOCK' as const, card: null }
      : d.kind === 'CONFIRM' ? { kind: 'CONFIRM' as const, accept: false }
      : d.kind === 'COUNTER' ? { kind: 'COUNTER' as const, card: null }
      : d.kind === 'ENCORE' ? { kind: 'ENCORE' as const, card: null }
      : d.kind === 'HAND_LIMIT' ? { kind: 'HAND_LIMIT' as const, discard: d.cards.slice(0, d.count) }
      : d.kind === 'CHOOSE_ABILITY' ? { kind: 'CHOOSE_ABILITY' as const, id: d.options[0]!.id }
      : d.kind === 'SELECT_CARDS' ? { kind: 'SELECT_CARDS' as const, cards: d.cards.slice(0, d.min) }
      : d.kind === 'SELECT_SLOT' ? { kind: 'SELECT_SLOT' as const, slot: d.slots[0]! }
      : null;
    if (!choice) throw new Error(`unexpected decision ${d.kind}`);
    s = answer(s, choice as never).state;
  }
  throw new Error('no main phase reached');
}

describe('delayed abilities', () => {
  it('思い出にする。次のあなたのターンの始めに、自分の思い出置場のそのキャラを、手札に戻す', () => {
    const later = act([
      { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', min: 1, max: 1 },
      { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'MEMORY' },
      { do: 'DELAYED', at: { phase: 'STAND', whose: 'YOURS' }, effects: [{ do: 'MOVE', target: { who: 'MOVED', where: 'MEMORY' }, to: 'HAND' }] },
    ]);
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [later] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 5), { player: 0, zone: 'waitingRoom' });
    }).state;
    const asked = activate(start, card(0, 0)).state;
    let state = answer(asked, { kind: 'SELECT_CARDS', cards: [oid(asked, card(0, 5))] }).state;
    expect(state.zones[0].memory).toEqual([card(0, 5)]);
    expect(state.delayed).toHaveLength(1);
    // Not in this turn, nor in the opponent's: at the start of player 0's next turn.
    state = toNextMain(state, 1);
    expect(state.zones[0].memory).toEqual([card(0, 5)]);
    state = toNextMain(state, 0);
    expect(state.zones[0].hand).toContain(card(0, 5));
    expect(state.zones[0].memory).toEqual([]);
    expect(state.delayed).toEqual([]);
    assertInvariants(state);
  });

  it('ターンの終わりに、この効果で舞台に置かれたキャラを控え室に置く', () => {
    const borrow = act([
      { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', min: 1, max: 1 },
      { do: 'CHOOSE_SLOT', which: 'ANY' },
      { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'CHOSEN_SLOT' },
      { do: 'DELAYED', at: { phase: 'END', whose: 'ANY' }, effects: [{ do: 'MOVE', target: { who: 'PLACED' }, to: 'WAITING_ROOM' }] },
    ]);
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [borrow] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 5), { player: 0, zone: 'waitingRoom' });
    }).state;
    let state = activate(start, card(0, 0)).state;
    state = answer(state, { kind: 'SELECT_CARDS', cards: [oid(state, card(0, 5))] }).state;
    state = answer(state, { kind: 'SELECT_SLOT', slot: 'FL' }).state;
    expect(state.zones[0].stage.FL).toEqual([card(0, 5)]);
    state = toNextMain(state, 1);
    expect(state.zones[0].stage.FL).toEqual([]);
    expect(state.zones[0].waitingRoom).toContain(card(0, 5));
  });
});

describe('cards placed and swapped', () => {
  it('相手のキャラを1枚選び、思い出にし、相手は自分の思い出置場のそのキャラを、舞台の好きな枠に置く: the owner chooses the slot', () => {
    const shuffle = act([
      { do: 'CHOOSE', from: 'OPPONENT_STAGE', min: 1, max: 1 },
      { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'MEMORY' },
      { do: 'OWNER_PLACES', target: { who: 'MOVED', where: 'MEMORY' } },
    ]);
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [shuffle] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(1, 0), stageSlot(1, 'FC'), { orientation: 'REST' });
    }).state;
    let state = activate(start, card(0, 0)).state;
    state = answer(state, { kind: 'SELECT_CARDS', cards: [oid(state, card(1, 0))] }).state;
    const slot = pending(state, 'SELECT_SLOT');
    expect(slot.player).toBe(1);
    state = answer(state, { kind: 'SELECT_SLOT', slot: 'BR' }).state;
    expect(state.zones[1].stage.BR).toEqual([card(1, 0)]);
    // A new card: it enters standing (CR-3.6.3).
    expect(getInstance(state, card(1, 0)).orientation).toBe('STAND');
  });

  it('相手の控え室のキャラを1枚選び、舞台のキャラのいない枠に置く: an empty slot of its owner, chosen by the master', () => {
    const revive = act([{ do: 'CHOOSE', from: 'OPPONENT_WAITING_ROOM', filter: { kind: 'CHARACTER' }, min: 1, max: 1 }, { do: 'PLACE_IN_EMPTY_SLOT', target: { who: 'CHOSEN' } }]);
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [revive] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(1, 0), stageSlot(1, 'FC'));
      put(ctx, card(1, 5), { player: 1, zone: 'waitingRoom' });
    }).state;
    let state = activate(start, card(0, 0)).state;
    state = answer(state, { kind: 'SELECT_CARDS', cards: [oid(state, card(1, 5))] }).state;
    const slot = pending(state, 'SELECT_SLOT');
    expect(slot.player).toBe(0);
    expect(slot.slots).not.toContain('FC');
    state = answer(state, { kind: 'SELECT_SLOT', slot: 'FL' }).state;
    expect(state.zones[1].stage.FL).toEqual([card(1, 5)]);
  });

  it('自分の…を1枚とこのカードを選び、それぞれを【スタンド】して入れ替える', () => {
    const swap = act([{ do: 'CHOOSE', from: 'YOUR_STAGE', other: true, min: 1, max: 1 }, { do: 'SWAP_CHOSEN', withSelf: true }], [{ pay: 'REST_SELF' }]);
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [swap] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'BL'));
      put(ctx, card(0, 1), stageSlot(0, 'FC'), { orientation: 'REST' });
    }).state;
    let state = activate(start, card(0, 0)).state;
    state = answer(state, { kind: 'SELECT_CARDS', cards: [oid(state, card(0, 1))] }).state;
    expect(state.zones[0].stage.FC).toEqual([card(0, 0)]);
    expect(state.zones[0].stage.BL).toEqual([card(0, 1)]);
    expect(getInstance(state, card(0, 0)).orientation).toBe('STAND');
    expect(getInstance(state, card(0, 1)).orientation).toBe('STAND');
  });
});

describe('zone exchanges and names', () => {
  it('自分のレベル置場のカードと控え室のカードを1枚ずつ選び、入れ替える: the level count stays', () => {
    const exchange = act([{ do: 'EXCHANGE_LEVEL_WAITING_ROOM', count: 1 }]);
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [exchange] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 30), { player: 0, zone: 'level' });
      put(ctx, card(0, 5), { player: 0, zone: 'waitingRoom' });
    }).state;
    let state = activate(start, card(0, 0)).state;
    state = answer(state, { kind: 'SELECT_CARDS', cards: [oid(state, card(0, 30))] }).state;
    state = answer(state, { kind: 'SELECT_CARDS', cards: [oid(state, card(0, 5))] }).state;
    expect(state.zones[0].level).toEqual([card(0, 5)]);
    expect(state.zones[0].waitingRoom).toEqual([card(0, 30)]);
    expect(getInstance(state, card(0, 5)).face).toBe('UP');
    assertInvariants(state);
  });

  it('山札のCXと手札のCXを入れ替え: only with one of each', () => {
    const swap = act([{ do: 'SWAP_DECK_HAND', filter: { kind: 'CLIMAX' } }, { do: 'SHUFFLE' }]);
    const setup = (withHandClimax: boolean) =>
      scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [swap] } }) }, (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, 'FC'));
        if (withHandClimax) put(ctx, card(0, 49), { player: 0, zone: 'hand' });
      }).state;
    let state = activate(setup(true), card(0, 0)).state;
    state = answer(state, { kind: 'SELECT_CARDS', cards: [oid(state, card(0, 48))] }).state;
    state = answer(state, { kind: 'SELECT_CARDS', cards: [oid(state, card(0, 49))] }).state;
    expect(state.zones[0].hand).toEqual([card(0, 48)]);
    expect(state.zones[0].deck).toContain(card(0, 49));
    // No climax in the hand: nothing is exchanged.
    let none = activate(setup(false), card(0, 0)).state;
    none = answer(none, { kind: 'SELECT_CARDS', cards: [oid(none, card(0, 48))] }).state;
    expect(none.zones[0].hand).toEqual([]);
    expect(none.zones[0].deck).toContain(card(0, 48));
  });

  it('控え室のキャラを1枚選び、手札に戻し、その手札に戻したキャラと同じカード名のキャラを1枚選び、手札に戻す', () => {
    const twice = act([
      { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { kind: 'CHARACTER' }, min: 1, max: 1 },
      { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
      { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { kind: 'CHARACTER' }, sameNameAsMoved: true, min: 1, max: 1 },
      { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
    ]);
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [twice] }, '0:5': { name: 'Twin' }, '0:6': { name: 'Twin' }, '0:7': { name: 'Other' } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      for (const k of [5, 6, 7]) put(ctx, card(0, k), { player: 0, zone: 'waitingRoom' });
    }).state;
    let state = activate(start, card(0, 0)).state;
    state = answer(state, { kind: 'SELECT_CARDS', cards: [oid(state, card(0, 5))] }).state;
    expect(pending(state, 'SELECT_CARDS').cards).toEqual([oid(state, card(0, 6))]);
  });
});
