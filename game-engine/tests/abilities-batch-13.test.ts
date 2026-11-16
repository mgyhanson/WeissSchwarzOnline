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
