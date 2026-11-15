/**
 * Building blocks of batch 3, part 3: a climax as a cost, climax-phase and front-attacked triggers, Ｘ from the
 * opponent's characters, several cards from a look at the deck, the standby icon's effect, and both players'
 * waiting rooms back to their decks. Synthetic cards; the wording each case stands for is in its name.
 */

import { describe, expect, it } from 'vitest';
import { type Ability, type Cost, type Effect, assertInvariants, getPower, stageSlot } from '../src/index';
import { DRAW_ONE, activate, attack, canActivate, cards, noClimaxes, played } from './ability-helpers';
import { answer, card, oid, pending, put, scenario, testCardId } from './helpers';

const act = (effect: Effect[], cost: Cost[] = []): Ability => ({ type: 'ACT', timing: 'MAIN', cost, effect });

describe('costs and triggers', () => {
  it('［あなたのCX置場の「…」を1枚控え室に置く］: only that climax pays', () => {
    const name = `Test climax ${testCardId(0, 45)}`;
    const ability = act(DRAW_ONE, [{ pay: 'CLIMAX_TO_WAITING_ROOM', count: 1, filter: { name } }]);
    const setup = (climax: number) =>
      scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [ability] } }) }, (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, 'FC'));
        put(ctx, card(0, climax), { player: 0, zone: 'climax' });
      }).state;
    expect(canActivate(setup(46))).toBe(false);
    const done = activate(setup(45), card(0, 0)).state;
    expect(done.zones[0].climax).toEqual([]);
    expect(done.zones[0].waitingRoom).toEqual([card(0, 45)]);
    expect(done.zones[0].hand).toHaveLength(1);
  });

  it('あなたのCXフェイズ中、CX置場に「…」が置かれた時: in the climax phase; not when an effect puts it there in the main phase', () => {
    const name = `Test climax ${testCardId(0, 45)}`;
    const watch: Ability = { type: 'AUTO', trigger: { on: 'CLIMAX_PLACED', filter: { name }, duringClimaxPhase: true }, effect: DRAW_ONE };
    const putClimax = act([{ do: 'CHOOSE', from: 'YOUR_HAND', filter: { kind: 'CLIMAX' }, min: 1, max: 1 }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'WAITING_ROOM' }]);
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [watch, putClimax] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 45), { player: 0, zone: 'hand' });
      put(ctx, card(0, 30), { player: 0, zone: 'level' });
    }).state;
    const atClimax = answer(start, { kind: 'MAIN', action: { type: 'PASS' } }).state;
    expect(played(answer(atClimax, { kind: 'CLIMAX', card: oid(atClimax, card(0, 45)) }).events, card(0, 0))).toBe(1);
  });

  it('他のあなたの《…》のキャラがフロントアタックされた時、…そのキャラを手札に戻す: the defender, not this card; not on a side attack', () => {
    const save: Ability = { type: 'AUTO', trigger: { on: 'OTHER_FRONT_ATTACKED', filter: { kind: 'CHARACTER', traits: ['戦車道'] } }, effect: [{ do: 'MOVE', target: { who: 'THAT' }, to: 'HAND' }] };
    const run = (type: 'FRONT' | 'SIDE', defenderTraits: string[]) => {
      const start = scenario({ step: 'ATTACK_START', turnPlayer: 1, defs: cards({ '0:1': { abilities: [save] }, '0:0': { traits: defenderTraits } }) }, (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, 'FC'));
        put(ctx, card(0, 1), stageSlot(0, 'BL'));
        put(ctx, card(1, 0), stageSlot(1, 'FC'));
        noClimaxes(ctx, 0);
        noClimaxes(ctx, 1);
      }).state;
      return attack(start, card(1, 0), type).state;
    };
    // (Once the attacks are over, player 0's own turn may begin with a draw: look at the character itself.)
    expect(run('FRONT', ['戦車道']).zones[0].hand).toContain(card(0, 0));
    expect(run('FRONT', []).zones[0].hand).not.toContain(card(0, 0));
    expect(run('SIDE', ['戦車道']).zones[0].hand).not.toContain(card(0, 0));
  });
});

describe('effects', () => {
  it('そのターン中、このカードのパワーを＋Ｘ。Ｘは相手のキャラの枚数×1000 (counted when it resolves)', () => {
    const boost = act([{ do: 'MODIFY', target: { who: 'SELF' }, stat: 'POWER', amount: 1000, perCount: { where: 'OPPONENT_STAGE' } }]);
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [boost] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      for (const slot of ['FC', 'FL', 'BR'] as const) put(ctx, card(1, slot === 'FC' ? 0 : slot === 'FL' ? 1 : 2), stageSlot(1, slot));
    }).state;
    expect(getPower(activate(start, card(0, 0)).state, card(0, 0))).toBe(1000 + 3000);
  });

  it('山札を上から3枚まで見て、…を2枚まで選んで相手に見せ、手札に加え: up to two matching cards', () => {
    const look = act([{ do: 'LOOK_TOP', upTo: 3, pick: { kind: 'CHARACTER' }, reveal: true, picks: 2 }]);
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [look] }, '0:49': { kind: 'CHARACTER', level: 0, cost: 0, power: 1000, soul: 1 }, '0:48': { kind: 'CHARACTER', level: 0, cost: 0, power: 1000, soul: 1 } }) }, (ctx) =>
      put(ctx, card(0, 0), stageSlot(0, 'FC')),
    ).state;
    let state = activate(start, card(0, 0)).state;
    for (let k = 0; k < 3; k++) state = answer(state, { kind: 'CONFIRM', accept: true }).state;
    expect(pending(state, 'SELECT_CARDS')).toMatchObject({ min: 0, max: 2 });
    const done = answer(state, { kind: 'SELECT_CARDS', cards: pending(state, 'SELECT_CARDS').cards }).state;
    expect([...done.zones[0].hand].sort()).toEqual([card(0, 48), card(0, 49)]);
    expect(done.zones[0].waitingRoom).toEqual([card(0, 47)]);
  });

  it('[[standby.gif]]の効果を行う: a character of level ≤ your level + 1 from the waiting room, rested, to a slot of your choice', () => {
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [act([{ do: 'ICON_EFFECT', icon: 'STANDBY' }])] }, '0:5': { level: 1 }, '0:6': { level: 2 } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 5), { player: 0, zone: 'waitingRoom' });
      put(ctx, card(0, 6), { player: 0, zone: 'waitingRoom' });
    }).state;
    const atChoose = activate(start, card(0, 0)).state;
    // Level 0 player: up to level 1.
    expect(pending(atChoose, 'SELECT_CARDS').cards).toEqual([oid(atChoose, card(0, 5))]);
    const atSlot = answer(atChoose, { kind: 'SELECT_CARDS', cards: [oid(atChoose, card(0, 5))] }).state;
    const done = answer(atSlot, { kind: 'SELECT_SLOT', slot: 'BL' }).state;
    expect(done.zones[0].stage.BL).toEqual([card(0, 5)]);
    expect(done.instances[card(0, 5)]!.orientation).toBe('REST');
  });

  it('すべてのプレイヤーは自分の控え室のカードすべてを、山札に戻し、それらの山札をシャッフルする', () => {
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [act([{ do: 'WAITING_ROOM_TO_DECK', everyone: true }])] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 5), { player: 0, zone: 'waitingRoom' });
      put(ctx, card(1, 5), { player: 1, zone: 'waitingRoom' });
    }).state;
    const { state, events } = activate(start, card(0, 0));
    expect([state.zones[0].waitingRoom, state.zones[1].waitingRoom]).toEqual([[], []]);
    expect(events.filter((e) => e.type === 'DECK_SHUFFLED').map((e) => (e.type === 'DECK_SHUFFLED' ? e.player : -1))).toEqual([0, 1]);
    assertInvariants(state);
  });
});
