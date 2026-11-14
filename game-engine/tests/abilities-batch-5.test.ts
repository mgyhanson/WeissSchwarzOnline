/**
 * The building blocks added for the sentence grammar's cards (2026-11):
 * a cost that puts your characters into the waiting room, "your deck or the
 * opponent's", "…してよい。そうしたら、…", the bottom of the stock, the
 * opponent's clock, "A or B" card filters, and a climax's level of 0.
 * Synthetic cards; the card wording each case stands for is in its name.
 */

import { describe, expect, it } from 'vitest';
import { type Ability, type Ctx, type Effect, assertInvariants, stageSlot } from '../src/index';
import { DRAW_ONE, activate, attack, canActivate, cards, moves, noClimaxes, played } from './ability-helpers';
import { answer, card, oid, pending, put, scenario, testCardId } from './helpers';

const act = (cost: Ability extends infer A ? (A extends { type: 'ACT'; cost: infer C } ? C : never) : never, effect: Effect[]): Ability => ({ type: 'ACT', timing: 'MAIN', cost, effect });

describe('cost: あなたの舞台のキャラをN枚控え室に置く', () => {
  it('the player chooses which characters; they go to the waiting room as a cost; this card itself may be one of them', () => {
    const defs = cards({ '0:0': { abilities: [act([{ pay: 'CHARACTERS_TO_WAITING_ROOM', count: 1 }], DRAW_ONE)] } });
    const start = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), stageSlot(0, 'FL'));
      put(ctx, card(1, 0), stageSlot(1, 'FC'));
    }).state;
    const atChoice = activate(start, card(0, 0)).state;
    expect(pending(atChoice, 'SELECT_CARDS')).toMatchObject({ prompt: 'COST_CHARACTERS', min: 1, max: 1 });
    // Your own characters only, this card included; never the opponent's.
    expect([...pending(atChoice, 'SELECT_CARDS').cards].sort()).toEqual([oid(atChoice, card(0, 0)), oid(atChoice, card(0, 1))].sort());
    const { state, events } = answer(atChoice, { kind: 'SELECT_CARDS', cards: [oid(atChoice, card(0, 1))] });
    expect(moves(events)).toEqual(['COST:stage>waitingRoom', 'DRAW:deck>hand']);
    expect(state.zones[0].waitingRoom).toEqual([card(0, 1)]);
    expect(state.zones[0].stage.FC).toEqual([card(0, 0)]);
    assertInvariants(state);
  });

  it('他の… and a filter narrow the choice; without enough characters the ability cannot be played', () => {
    const cost = [{ pay: 'CHARACTERS_TO_WAITING_ROOM' as const, count: 1, other: true, filter: { kind: 'CHARACTER' as const, traits: ['音楽'] } }];
    const defs = cards({ '0:0': { abilities: [act(cost, DRAW_ONE)], traits: ['音楽'] }, '0:1': { traits: ['音楽'] } });
    const arrange = (others: number[]) => (ctx: Ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      others.forEach((i, k) => put(ctx, card(0, i), stageSlot(0, k === 0 ? 'FL' : 'FR')));
    };
    // Alone, or with a character without the trait: cannot pay (this card does not count, 他の).
    expect(canActivate(scenario({ step: 'MAIN_START', defs }, arrange([])).state)).toBe(false);
    expect(canActivate(scenario({ step: 'MAIN_START', defs }, arrange([2])).state)).toBe(false);
    const ok = scenario({ step: 'MAIN_START', defs }, arrange([2, 1])).state;
    const atChoice = activate(ok, card(0, 0)).state;
    expect(pending(atChoice, 'SELECT_CARDS').cards).toEqual([oid(atChoice, card(0, 1))]);
  });

  it('a cost that also sends this card away cannot use it twice', () => {
    const defs = cards({ '0:0': { abilities: [act([{ pay: 'CHARACTERS_TO_WAITING_ROOM', count: 1 }, { pay: 'SELF_TO_WAITING_ROOM' }], DRAW_ONE)] } });
    const alone = scenario({ step: 'MAIN_START', defs }, (ctx) => put(ctx, card(0, 0), stageSlot(0, 'FC'))).state;
    expect(canActivate(alone)).toBe(false);
  });
});

describe('effect: あなたは自分か相手の、山札の上からN枚を、控え室に置く', () => {
  const defs = cards({ '0:0': { abilities: [act([], [{ do: 'DECK_TOP', count: 3, to: 'WAITING_ROOM', whose: 'EITHER' }])] } });
  const start = () => scenario({ step: 'MAIN_START', defs }, (ctx) => put(ctx, card(0, 0), stageSlot(0, 'FC'))).state;

  it.each([
    ['YOU', 0, 1],
    ['OPPONENT', 1, 0],
  ] as const)('choosing %s puts three cards from the top of that player’s deck into that player’s waiting room', (option, whose, other) => {
    const atChoice = activate(start(), card(0, 0)).state;
    expect(pending(atChoice, 'SELECT_OPTION')).toMatchObject({ prompt: 'EFFECT_PLAYER', options: ['YOU', 'OPPONENT'], player: 0 });
    const top = atChoice.zones[whose].deck.slice(-3).reverse();
    const { state } = answer(atChoice, { kind: 'SELECT_OPTION', option });
    expect(state.zones[whose].waitingRoom).toEqual(top);
    expect(state.zones[other].waitingRoom).toEqual([]);
    expect(state.zones[other].deck).toHaveLength(atChoice.zones[other].deck.length);
    assertInvariants(state);
  });

  it('an answer that was not offered is rejected', () => {
    const atChoice = activate(start(), card(0, 0)).state;
    expect(() => answer(atChoice, { kind: 'SELECT_OPTION', option: 'BOTH' })).toThrow();
  });
});

describe('…してよい。そうしたら、…: what follows happens only if the first part was done', () => {
  // あなたは自分のクロックを1枚選び、手札に戻してよい。そうしたら、あなたは自分の手札を1枚選び、クロック置場に置く。
  const swap: Ability = {
    type: 'AUTO',
    trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' },
    optional: true,
    effect: [
      { do: 'CHOOSE', from: 'YOUR_CLOCK', min: 1, max: 1 },
      { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
      { do: 'IF', condition: { if: 'DID' }, then: [{ do: 'CHOOSE', from: 'YOUR_HAND', min: 1, max: 1 }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'CLOCK' }] },
    ],
  };
  const defs = cards({ '0:0': { abilities: [swap] } });
  const placed = (clock: number[]) => {
    const start = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), { player: 0, zone: 'hand' });
      put(ctx, card(0, 1), { player: 0, zone: 'hand' });
      for (const i of clock) put(ctx, card(0, i), { player: 0, zone: 'clock' });
    }).state;
    return answer(start, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(start, card(0, 0)), slot: 'FC' } }).state;
  };

  it('with a clock card: it comes to hand, then a hand card goes to the clock', () => {
    const asked = placed([5]);
    expect(pending(asked, 'CONFIRM').prompt).toBe('USE_ABILITY');
    const atClock = answer(asked, { kind: 'CONFIRM', accept: true }).state;
    const atHand = answer(atClock, { kind: 'SELECT_CARDS', cards: [oid(atClock, card(0, 5))] }).state;
    // The card just taken may be the one put back.
    expect([...pending(atHand, 'SELECT_CARDS').cards].sort()).toEqual([oid(atHand, card(0, 1)), oid(atHand, card(0, 5))].sort());
    const done = answer(atHand, { kind: 'SELECT_CARDS', cards: [oid(atHand, card(0, 1))] }).state;
    expect(done.zones[0].clock).toEqual([card(0, 1)]);
    expect(done.zones[0].hand).toEqual([card(0, 5)]);
  });

  it('with an empty clock nothing can be taken, so no hand card goes to the clock', () => {
    const asked = placed([]);
    const done = answer(asked, { kind: 'CONFIRM', accept: true }).state;
    expect(done.pending?.kind).toBe('MAIN');
    expect(done.zones[0].clock).toEqual([]);
    expect(done.zones[0].hand).toEqual([card(0, 1)]);
  });

  it('declining does neither part', () => {
    const done = answer(placed([5]), { kind: 'CONFIRM', accept: false }).state;
    expect(done.zones[0].clock).toEqual([card(0, 5)]);
    expect(done.zones[0].hand).toEqual([card(0, 1)]);
  });

  it('相手のクロックの上から1枚を、控え室に置いてよい。そうしたら、そのキャラをクロック置場に置く: only with a card in the opponent’s clock', () => {
    const ability: Ability = {
      type: 'AUTO',
      trigger: { on: 'REVERSED' },
      optional: true,
      effect: [{ do: 'CLOCK_TOP', to: 'WAITING_ROOM', whose: 'OPPONENT' }, { do: 'IF', condition: { if: 'DID' }, then: [{ do: 'MOVE', target: { who: 'BATTLE_OPPONENT' }, to: 'CLOCK' }] }],
    };
    const run = (opponentClock: number[]) => {
      const start = scenario({ step: 'ATTACK_START', defs: cards({ '0:0': { power: 2000 }, '1:0': { abilities: [ability] } }) }, (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, 'FC'));
        put(ctx, card(1, 0), stageSlot(1, 'FC'));
        // "The opponent" of the reversed card's master (player 1) is player 0.
        for (const i of opponentClock) put(ctx, card(0, i), { player: 0, zone: 'clock' });
        put(ctx, card(1, 9), { player: 1, zone: 'clock' });
        noClimaxes(ctx, 0);
        noClimaxes(ctx, 1);
      }).state;
      const atUse = answer(attack(start, card(0, 0)).state, { kind: 'COUNTER', card: null }).state;
      expect(pending(atUse, 'CONFIRM')).toMatchObject({ prompt: 'USE_ABILITY', player: 1 });
      return answer(atUse, { kind: 'CONFIRM', accept: true }).state;
    };
    const done = run([7, 8]);
    // The top card of player 0's clock (the last one put there) went to player 0's waiting room; the attacker took its place in the clock.
    expect(done.zones[0].waitingRoom).toContain(card(0, 8));
    expect(done.zones[0].clock).toEqual([card(0, 7), card(0, 0)]);
    // (Player 1's own clock only grew by the damage of the attack.)
    expect(done.zones[1].clock).toContain(card(1, 9));
    const empty = run([]);
    expect(empty.zones[0].stage.FC).toEqual([card(0, 0)]);
    expect(empty.zones[0].clock).toEqual([]);
  });
});

describe('destinations and filters', () => {
  it('ストック置場の下に置く: the card goes under the stock, so it is the last one paid', () => {
    const defs = cards({
      '0:0': { abilities: [act([], [{ do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', min: 1, max: 1 }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'STOCK_BOTTOM' }])] },
    });
    const start = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), { player: 0, zone: 'stock' });
      put(ctx, card(0, 2), { player: 0, zone: 'stock' });
      put(ctx, card(0, 3), { player: 0, zone: 'waitingRoom' });
    }).state;
    const atChoose = activate(start, card(0, 0)).state;
    const { state } = answer(atChoose, { kind: 'SELECT_CARDS', cards: [oid(atChoose, card(0, 3))] });
    expect(state.zones[0].stock).toEqual([card(0, 3), card(0, 1), card(0, 2)]);
  });

  it('《音楽》のキャラか「カード名」: a card matching either part is offered', () => {
    const anyOf = { anyOf: [{ kind: 'CHARACTER' as const, traits: ['音楽'] }, { name: `Test climax ${testCardId(0, 45)}` }] };
    const defs = cards({
      '0:0': { abilities: [act([], [{ do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: anyOf, min: 1, max: 1 }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' }])] },
      '0:1': { traits: ['音楽'] },
    });
    const start = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      for (const i of [1, 2, 45, 46]) put(ctx, card(0, i), { player: 0, zone: 'waitingRoom' });
    }).state;
    const atChoose = activate(start, card(0, 0)).state;
    expect([...pending(atChoose, 'SELECT_CARDS').cards].sort()).toEqual([oid(atChoose, card(0, 1)), oid(atChoose, card(0, 45))].sort());
  });

  it('T-CARD-006 / CR-2.19.1: レベル1以上のカード does not include a climax, レベル0以下のカード does (a climax’s level counts as 0)', () => {
    const offered = (filter: { levelMin?: number; levelMax?: number }) => {
      const defs = cards({
        '0:0': { abilities: [act([], [{ do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter, min: 0, max: 1 }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' }])] },
        '0:1': { level: 1 },
      });
      const start = scenario({ step: 'MAIN_START', defs }, (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, 'FC'));
        for (const i of [1, 2, 45]) put(ctx, card(0, i), { player: 0, zone: 'waitingRoom' });
      }).state;
      const atChoose = activate(start, card(0, 0)).state;
      return [...pending(atChoose, 'SELECT_CARDS').cards].sort((a, b) => a - b).map((o) => atChoose.instances.find((x) => x.objectId === o)!.instanceId);
    };
    expect(offered({ levelMin: 1 })).toEqual([card(0, 1)]);
    expect(offered({ levelMax: 0 })).toEqual([card(0, 2), card(0, 45)]);
  });

  it('the cost and the choice of deck are played by an ability that triggers (not only activated ones)', () => {
    const ability: Ability = { type: 'AUTO', trigger: { on: 'ATTACKS' }, cost: [{ pay: 'CHARACTERS_TO_WAITING_ROOM', count: 1, other: true }], effect: [{ do: 'DECK_TOP', count: 1, to: 'WAITING_ROOM', whose: 'EITHER' }] };
    const start = scenario({ step: 'ATTACK_START', defs: cards({ '0:0': { abilities: [ability] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), stageSlot(0, 'FL'));
      noClimaxes(ctx, 0);
      noClimaxes(ctx, 1);
    }).state;
    const atPay = attack(start, card(0, 0), 'DIRECT');
    const atCost = answer(atPay.state, { kind: 'CONFIRM', accept: true });
    const atPlayer = answer(atCost.state, { kind: 'SELECT_CARDS', cards: [oid(atCost.state, card(0, 1))] });
    expect(played(atPay.events, card(0, 0)) + played(atCost.events, card(0, 0)) + played(atPlayer.events, card(0, 0))).toBe(1);
    const top = atPlayer.state.zones[1].deck[atPlayer.state.zones[1].deck.length - 1]!;
    const done = answer(atPlayer.state, { kind: 'SELECT_OPTION', option: 'OPPONENT' }).state;
    expect(done.zones[0].waitingRoom).toEqual([card(0, 1)]);
    expect(done.zones[1].waitingRoom).toEqual([top]);
  });
});
