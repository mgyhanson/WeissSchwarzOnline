/**
 * Building blocks of batch 6: a replacement of this card's attack damage (CR-8.10.1), conditions on this card's
 * soul, and X from this card's soul. Synthetic cards; the wording each case stands for is in its name.
 */

import { describe, expect, it } from 'vitest';
import { type Ability, type Effect, evalCondition, stageSlot } from '../src/index';
import { activate, cards, noClimaxes } from './ability-helpers';
import { answer, card, oid, put, scenario } from './helpers';

const dealt = (events: { type: string }[]) => events.flatMap((e) => (e.type === 'DAMAGE_DEALT' ? [(e as unknown as { amount: number; sourceObjectId: number | null }).amount] : []));

describe('replacement effects', () => {
  const replace: Effect[] = [
    {
      do: 'REPLACE_ATTACK_DAMAGE',
      effects: [{ do: 'SET_X', count: { of: 'SELF_SOUL' } }, { do: 'REPEAT', times: 1, timesX: true, effects: [{ do: 'DAMAGE', amount: 1 }] }],
    },
  ];

  it('T-REPL-001 / CR-8.10.1: そのアタック中、このカードが相手にアタックのダメージを与える時、かわりに相手に1ダメージをＸ回与える: the soul damage never happens', () => {
    const onAttack: Ability = { type: 'AUTO', trigger: { on: 'ATTACKS' }, effect: replace };
    const run = (abilities: Ability[]) => {
      const start = scenario({ step: 'ATTACK_START', defs: cards({ '0:0': { abilities, soul: 3 } }) }, (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, 'FC'));
        noClimaxes(ctx, 0);
        noClimaxes(ctx, 1);
      }).state;
      return answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, card(0, 0)), type: 'DIRECT' } });
    };
    // Soul 3, +1 for a direct attack (no icons in the trigger check): four damages of 1 instead of one of 4.
    expect(dealt(run([onAttack]).events)).toEqual([1, 1, 1, 1]);
    expect(dealt(run([]).events)).toEqual([4]);
    // The replacing damage is still this card's attack damage: its source is the attacker.
    const sources = run([onAttack]).events.filter((e) => e.type === 'DAMAGE_DEALT').map((e) => (e as unknown as { sourceObjectId: number }).sourceObjectId);
    expect(new Set(sources).size).toBe(1);
  });

  it('outside this card’s attack, the replacement is not set up', () => {
    const act: Ability = { type: 'ACT', timing: 'MAIN', cost: [], effect: replace };
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [act] } }) }, (ctx) => put(ctx, card(0, 0), stageSlot(0, 'FC'))).state;
    expect(activate(start, card(0, 0)).state.replacements ?? []).toEqual([]);
  });

  it('このカードのソウルが4以下', () => {
    const state = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { soul: 4 }, '0:1': { soul: 5 } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), stageSlot(0, 'FL'));
    }).state;
    expect(evalCondition(state, 0, card(0, 0), { if: 'SELF_STAT', stat: 'SOUL', max: 4 })).toBe(true);
    expect(evalCondition(state, 0, card(0, 1), { if: 'SELF_STAT', stat: 'SOUL', max: 4 })).toBe(false);
  });
});

describe('markers from memory', () => {
  it('思い出置場の「…」すべてをこのカードの下にマーカーとして好きな順番で表向きに置き、相手に2ダメージをＸ回与える (X by marker tiers)', () => {
    const pile: Ability = {
      type: 'ACT',
      timing: 'MAIN',
      cost: [],
      effect: [
        { do: 'CHOOSE', from: 'YOUR_MEMORY', filter: { name: 'N' }, min: 0, max: 99, all: true },
        { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'UNDER_SELF', face: 'UP', inOrder: true },
        { do: 'SET_X', count: { of: 'MARKERS' }, tiers: [{ max: 3, x: 1 }, { min: 4, max: 5, x: 2 }, { min: 6, x: 3 }] },
        { do: 'REPEAT', times: 1, timesX: true, effects: [{ do: 'DAMAGE', amount: 2 }] },
      ],
    };
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [pile] }, '0:5': { name: 'N' }, '0:6': { name: 'N' }, '0:7': { name: 'Other' } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      for (const k of [5, 6, 7]) put(ctx, card(0, k), { player: 0, zone: 'memory' });
      for (const k of [8, 9]) put(ctx, card(0, k), { player: 0, zone: 'marker', slot: 'FC' });
      noClimaxes(ctx, 1);
    }).state;
    let state = activate(start, card(0, 0)).state;
    // Two named cards: the order is asked.
    state = answer(state, { kind: 'SELECT_CARDS', cards: [oid(state, card(0, 6))] }).state;
    expect(state.zones[0].memory).toEqual([card(0, 7)]);
    expect(state.zones[0].marker.FC).toEqual([card(0, 8), card(0, 9), card(0, 6), card(0, 5)]);
    expect(state.instances[card(0, 5)]!.face).toBe('UP');
    // Four markers: X = 2, two damages of 2.
    expect(state.zones[1].clock).toHaveLength(4);
  });
});

describe('the opponent chooses', () => {
  it('相手のレベル1以上のキャラを1枚選んでよい。そうしたら、相手は自分の控え室のレベルＸ以下のキャラを1枚選び、入れ替える (Ｘ＝レベル－1)', () => {
    const swap: Ability = {
      type: 'ACT',
      timing: 'MAIN',
      cost: [],
      effect: [
        { do: 'CHOOSE', from: 'OPPONENT_STAGE', filter: { kind: 'CHARACTER', levelMin: 1 }, min: 0, max: 1 },
        { do: 'SET_X', count: { of: 'CHOSEN_LEVEL' }, minus: 1 },
        { do: 'OPPONENT_SWAPS_FROM_WAITING_ROOM', levelMaxX: true },
      ],
    };
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [swap] }, '1:0': { level: 2 }, '1:5': { level: 1 }, '1:6': { level: 2 } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(1, 0), stageSlot(1, 'FL'));
      put(ctx, card(1, 5), { player: 1, zone: 'waitingRoom' });
      put(ctx, card(1, 6), { player: 1, zone: 'waitingRoom' });
    }).state;
    let state = activate(start, card(0, 0)).state;
    state = answer(state, { kind: 'SELECT_CARDS', cards: [oid(state, card(1, 0))] }).state;
    // The opponent chooses, among level 1 or lower (2 − 1) only.
    const choice = state.pending!;
    expect(choice).toMatchObject({ kind: 'SELECT_CARDS', player: 1 });
    expect((choice as { cards: number[] }).cards).toEqual([oid(state, card(1, 5))]);
    state = answer(state, { kind: 'SELECT_CARDS', cards: [oid(state, card(1, 5))] }).state;
    expect(state.zones[1].stage.FL).toEqual([card(1, 5)]);
    expect(state.zones[1].waitingRoom).toContain(card(1, 0));
  });
});
