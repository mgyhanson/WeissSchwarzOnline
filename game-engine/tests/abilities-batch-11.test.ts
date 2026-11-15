/**
 * Building blocks of batch 4, part 5: an event's play restriction, characters that do not stand in the stand
 * phase, abilities given to every opponent character, the bottom of the stock as a cost, "when another of your
 * characters leaves the stage" with the slot it left, and the bottom of the opponent's deck. Synthetic cards.
 */

import { describe, expect, it } from 'vitest';
import { type Ability, type Cost, type Effect, evalCondition, getInstance, getPower, stageSlot } from '../src/index';
import { DRAW_ONE, activate, cards, played } from './ability-helpers';
import { EVENT, answer, card, oid, pending, put, scenario } from './helpers';

const act = (effect: Effect[], cost: Cost[] = []): Ability => ({ type: 'ACT', timing: 'MAIN', cost, effect });

describe('batch 4 part 5', () => {
  it('このカードは、あなたの《…》のキャラがいないなら、手札からプレイできない', () => {
    const restricted: Ability = { type: 'CONT', inHand: true, playOnlyIf: { if: 'CHARACTERS', min: 1, filter: { kind: 'CHARACTER', traits: ['戦車道'] } }, apply: [] };
    const playable = (withTrait: boolean) => {
      const start = scenario({ step: 'MAIN_START', defs: cards({ '0:5': { ...EVENT, abilities: [restricted], effect: DRAW_ONE }, '0:0': { traits: withTrait ? ['戦車道'] : [] } }) }, (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, 'FC'));
        put(ctx, card(0, 5), { player: 0, zone: 'hand' });
      }).state;
      return pending(start, 'MAIN').actions.some((a) => a.type === 'PLAY_EVENT' && a.card === oid(start, card(0, 5)));
    };
    expect(playable(false)).toBe(false);
    expect(playable(true)).toBe(true);
  });

  it('このカードはあなたのスタンドフェイズに【スタンド】しない', () => {
    const stay: Ability = { type: 'CONT', apply: [], noStand: true };
    const state = scenario({ step: 'STAND_START', defs: cards({ '0:0': { abilities: [stay] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'), { orientation: 'REST' });
      put(ctx, card(0, 1), stageSlot(0, 'FL'), { orientation: 'REST' });
    }).state;
    expect(getInstance(state, card(0, 0)).orientation).toBe('REST');
    expect(getInstance(state, card(0, 1)).orientation).toBe('STAND');
  });

  it('相手のキャラすべてに、『【自】 アンコール ［(2)］』を与える: the opponent’s characters have it', () => {
    const encore2: Ability = { type: 'AUTO', keywords: ['ENCORE'], trigger: { on: 'STAGE_TO_WAITING_ROOM' }, cost: [{ pay: 'STOCK', count: 2 }], effect: [{ do: 'MOVE', target: { who: 'SELF' }, to: 'SOURCE_SLOT', rested: true }] };
    const giver: Ability = { type: 'CONT', apply: [], grant: [{ target: { who: 'ALL_THEIRS' }, ability: encore2 as never }] };
    const kill = act([{ do: 'CHOOSE', from: 'OPPONENT_STAGE', min: 1, max: 1 }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'WAITING_ROOM' }]);
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [giver, kill] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(1, 0), stageSlot(1, 'FC'));
      for (const k of [20, 21, 22]) put(ctx, card(1, k), { player: 1, zone: 'stock' });
    }).state;
    let state = activate(start, card(0, 0), 1).state;
    state = answer(state, { kind: 'SELECT_CARDS', cards: [oid(state, card(1, 0))] }).state;
    // Player 1 now has two encores to choose from: the rule's (3) and the given (2).
    expect(state.waiting.filter((w) => w.master === 1).length).toBe(2);
  });

  it('［このカードをストック置場の下に置く］', () => {
    const ability = act(DRAW_ONE, [{ pay: 'SELF_TO_STOCK_BOTTOM' }]);
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [ability] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 20), { player: 0, zone: 'stock' });
    }).state;
    const { state } = activate(start, card(0, 0));
    expect(state.zones[0].stock).toEqual([card(0, 0), card(0, 20)]);
  });

  it('他のあなたのキャラが舞台から控え室に置かれた時、そのキャラをそのキャラがいた枠に【レスト】して置く', () => {
    const save: Ability = { type: 'AUTO', trigger: { on: 'OTHER_STAGE_TO_WAITING_ROOM' }, effect: [{ do: 'MOVE', target: { who: 'THAT' }, to: 'ABOUT_SLOT', rested: true }] };
    const kill = act([{ do: 'CHOOSE', from: 'YOUR_STAGE', other: true, min: 1, max: 1 }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'WAITING_ROOM' }]);
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [kill] }, '0:2': { abilities: [save] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), stageSlot(0, 'FR'));
      put(ctx, card(0, 2), stageSlot(0, 'BL'));
    }).state;
    let state = activate(start, card(0, 0)).state;
    state = answer(state, { kind: 'SELECT_CARDS', cards: [oid(state, card(0, 1))] }).state;
    while (state.pending?.kind === 'CHOOSE_ABILITY') state = answer(state, { kind: 'CHOOSE_ABILITY', id: state.pending.abilities.find((a) => a.type === 'CARD')!.id }).state;
    while (state.pending?.kind === 'CONFIRM') state = answer(state, { kind: 'CONFIRM', accept: false }).state;
    expect(state.zones[0].stage.FR).toEqual([card(0, 1)]);
    expect(getInstance(state, card(0, 1)).orientation).toBe('REST');
  });

  it('相手の山札の下から2枚を、控え室に置く。それらのカードにCXがあるなら、…', () => {
    const mill = act([{ do: 'DECK_TOP', count: 2, to: 'WAITING_ROOM', whose: 'OPPONENT', fromBottom: true }, { do: 'IF', condition: { if: 'LAST_MOVED', min: 1, filter: { kind: 'CLIMAX' } }, then: DRAW_ONE }]);
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [mill] } }) }, (ctx) => put(ctx, card(0, 0), stageSlot(0, 'FC'))).state;
    const { state, events } = activate(start, card(0, 0));
    expect(state.zones[1].waitingRoom).toEqual([card(1, 0), card(1, 1)]);
    // The bottom two are characters: nothing drawn.
    expect(state.zones[0].hand).toEqual([]);
    expect(played(events, card(0, 0))).toBe(1);
  });
});

describe('batch 4 part 6', () => {
  it('このカードはプレイヤーにダメージを与えることができない: no attack damage', () => {
    const quiet: Ability = { type: 'CONT', apply: [], noDamageToPlayers: true };
    const run = (abilities: Ability[]) => {
      const start = scenario({ step: 'ATTACK_START', defs: cards({ '0:0': { abilities } }) }, (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, 'FC'));
        for (const p of [0, 1] as const) for (const k of [42, 43, 44, 45, 46, 47, 48, 49]) put(ctx, card(p, k), { player: p, zone: 'memory' });
      }).state;
      return answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, card(0, 0)), type: 'DIRECT' } }).events.filter((e) => e.type === 'DAMAGE_DEALT').length;
    };
    expect(run([quiet])).toBe(0);
    expect(run([])).toBe(1);
  });

  it('他のあなたの後列のキャラすべてに、『【永】 応援 …』を与える: the given 応援 works from the back row', () => {
    const assist: Ability = { type: 'CONT', assist: true, apply: [{ target: { who: 'IN_FRONT' }, stat: 'POWER', amount: 1500 }] };
    const giver: Ability = { type: 'CONT', apply: [], grantConts: [{ target: { who: 'YOUR_SLOT', slots: ['BL', 'BR'], other: true }, ability: assist as never }] };
    const state = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [giver] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FR'));
      put(ctx, card(0, 1), stageSlot(0, 'BL'));
      put(ctx, card(0, 2), stageSlot(0, 'FL'));
      put(ctx, card(0, 3), stageSlot(0, 'FC'));
    }).state;
    // BL supports FL and FC (CR-3.6.5).
    expect(getPower(state, card(0, 2))).toBe(2500);
    expect(getPower(state, card(0, 3))).toBe(2500);
    expect(getPower(state, card(0, 0))).toBe(1000);
  });

  it('…このカードは次の能力を得る。『【起】 …』: a gained activated ability can be played', () => {
    const gainedAct: Ability = { type: 'ACT', timing: 'MAIN', cost: [], effect: DRAW_ONE };
    const gains: Ability = { type: 'CONT', apply: [], condition: { if: 'YOUR_TURN' }, gains: [gainedAct as never] };
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [gains] } }) }, (ctx) => put(ctx, card(0, 0), stageSlot(0, 'FC'))).state;
    const action = pending(start, 'MAIN').actions.find((a) => a.type === 'ACTIVATE');
    expect(action).toMatchObject({ ability: 100 });
    const { state } = answer(start, { kind: 'MAIN', action: action! });
    expect(state.zones[0].hand).toHaveLength(1);
    // The same for player 1 in player 1's own turn (あなたのターン中 is the card's master's turn).
    const theirs = scenario({ step: 'MAIN_START', turnPlayer: 1, defs: cards({ '1:0': { abilities: [gains] } }) }, (ctx) => put(ctx, card(1, 0), stageSlot(1, 'FC'))).state;
    expect(pending(theirs, 'MAIN').actions.some((a) => a.type === 'ACTIVATE')).toBe(true);
  });

  it('山札を上から3枚まで見て、カードを1枚まで選び、手札に加え、カードを1枚まで選び、ストック置場に置き、残りのカードを控え室に置く', () => {
    const look = act([{ do: 'LOOK_TOP', upTo: 3, toStock: 1 }]);
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [look] } }) }, (ctx) => put(ctx, card(0, 0), stageSlot(0, 'FC'))).state;
    let state = activate(start, card(0, 0)).state;
    for (let k = 0; k < 3; k++) state = answer(state, { kind: 'CONFIRM', accept: true }).state;
    state = answer(state, { kind: 'SELECT_CARDS', cards: [oid(state, card(0, 49))] }).state;
    expect(pending(state, 'SELECT_CARDS').cards).not.toContain(oid(state, card(0, 49)));
    state = answer(state, { kind: 'SELECT_CARDS', cards: [oid(state, card(0, 48))] }).state;
    expect(state.zones[0].hand).toEqual([card(0, 49)]);
    expect(state.zones[0].stock).toEqual([card(0, 48)]);
    expect(state.zones[0].waitingRoom).toEqual([card(0, 47)]);
  });
});

describe('batch 4 part 7', () => {
  it('相手のレベルが3以上なら / 相手のレベルが2なら', () => {
    const state = scenario({ step: 'MAIN_START' }, (ctx) => {
      put(ctx, card(1, 30), { player: 1, zone: 'level' });
      put(ctx, card(1, 31), { player: 1, zone: 'level' });
    }).state;
    expect(evalCondition(state, 0, card(0, 0), { if: 'LEVEL', whose: 'OPPONENT', min: 2, max: 2 })).toBe(true);
    expect(evalCondition(state, 0, card(0, 0), { if: 'LEVEL', whose: 'OPPONENT', min: 3 })).toBe(false);
    expect(evalCondition(state, 0, card(0, 0), { if: 'LEVEL', min: 1 })).toBe(false);
  });

  it('相手に1ダメージを与え、あなたはコストを払ってよい。コストを払ったなら、相手に1ダメージを与える: the first damage is not paid for', () => {
    const burn: Ability = { type: 'AUTO', trigger: { on: 'ATTACKS' }, effect: [{ do: 'DAMAGE', amount: 1 }, { do: 'MAY_PAY', cost: [{ pay: 'STOCK', count: 1 }], then: [{ do: 'DAMAGE', amount: 1 }], said: 'IF_PAID' }] };
    const start = scenario({ step: 'ATTACK_START', defs: cards({ '0:0': { abilities: [burn] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 20), { player: 0, zone: 'stock' });
      for (const p of [0, 1] as const) for (const k of [42, 43, 44, 45, 46, 47, 48, 49]) put(ctx, card(p, k), { player: p, zone: 'memory' });
    }).state;
    const asked = answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, card(0, 0)), type: 'DIRECT' } }).state;
    // One damage dealt already; now the payment is asked.
    expect(asked.zones[1].clock).toHaveLength(1);
    expect(pending(asked, 'CONFIRM')).toBeDefined();
    const paid = answer(asked, { kind: 'CONFIRM', accept: true }).state;
    expect(paid.zones[0].stock).not.toContain(card(0, 20));
    expect(paid.zones[1].clock.length).toBeGreaterThanOrEqual(2);
  });
});
