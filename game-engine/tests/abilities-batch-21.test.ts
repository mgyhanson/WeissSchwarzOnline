/**
 * Building blocks of batch 14: 他のあなたの…のキャラが【リバース】した時 (about that character), a filter for rested
 * characters, 自分のレベル＋N以下のレベルの, and an activated ability usable only while a condition holds.
 * Synthetic cards; the wording each case stands for is in its name.
 */

import { describe, expect, it } from 'vitest';
import { type Ability, type CardDef, type Choice, type GameEvent, type GameState, evalCondition, getInstance, matchesFilter, stageSlot } from '../src/index';
import { activate, canActivate, cards } from './ability-helpers';
import { answer, card, oid, pending, put, scenario } from './helpers';
import { setOrientation } from '../src/moves';

const zoneOf = (state: GameState, instanceId: number): string => getInstance(state, instanceId).location.zone;
const go = (state: GameState, ...choices: Choice[]) => {
  let events: GameEvent[] = [];
  for (const choice of choices) {
    const next = answer(state, choice);
    state = next.state;
    events = [...events, ...next.events];
  }
  return { state, events };
};
const YES: Choice = { kind: 'CONFIRM', accept: true };
const character = (level: number, more: Partial<CardDef> = {}): Partial<CardDef> => ({ kind: 'CHARACTER', level, cost: 0, power: 1000, soul: 1, ...more });
const NIKKE = 'Nikke';

describe('【自】 他のあなたの《…》のキャラが【リバース】した時、そのキャラを手札に戻す', () => {
  const back: Ability = { type: 'AUTO', trigger: { on: 'OTHER_REVERSED', filter: { kind: 'CHARACTER', traits: [NIKKE] } }, effect: [{ do: 'MOVE', target: { who: 'THAT' }, to: 'HAND' }] };
  /** Card 3 reverses a character chosen; card 0 (the ability) in the back row; card 1 (《Nikke》) and card 2 (no trait) in the front row; the opponent's card 1 opposite. */
  const reverser: Ability = { type: 'ACT', timing: 'MAIN', cost: [], effect: [{ do: 'CHOOSE', from: 'YOUR_STAGE', min: 1, max: 1 }, { do: 'ORIENT', target: { who: 'CHOSEN' }, to: 'REVERSE' }] };
  const field = () =>
    scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [back], traits: [NIKKE] }, '0:1': character(0, { traits: [NIKKE] }), '0:2': character(0), '0:3': { abilities: [reverser] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'BL'));
      put(ctx, card(0, 1), stageSlot(0, 'FL'));
      put(ctx, card(0, 2), stageSlot(0, 'FC'));
      put(ctx, card(0, 3), stageSlot(0, 'BR'));
    }).state;
  const reverse = (instanceId: number) => {
    const asked = activate(field(), card(0, 3)).state;
    return go(asked, { kind: 'SELECT_CARDS', cards: [oid(asked, instanceId)] }).state;
  };

  it('another character of yours that matches is reversed: it goes back to the hand', () => {
    expect(zoneOf(reverse(card(0, 1)), card(0, 1))).toBe('hand');
  });

  it('not for the opponent’s character with the trait', () => {
    const theirs: Ability = { type: 'ACT', timing: 'MAIN', cost: [], effect: [{ do: 'CHOOSE', from: 'OPPONENT_STAGE', min: 1, max: 1 }, { do: 'ORIENT', target: { who: 'CHOSEN' }, to: 'REVERSE' }] };
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [back] }, '0:3': { abilities: [theirs] }, '1:1': character(0, { traits: [NIKKE] }) }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'BL'));
      put(ctx, card(0, 3), stageSlot(0, 'BR'));
      put(ctx, card(1, 1), stageSlot(1, 'FC'));
    }).state;
    const asked = activate(start, card(0, 3)).state;
    const { state } = go(asked, { kind: 'SELECT_CARDS', cards: [oid(asked, card(1, 1))] });
    expect(zoneOf(state, card(1, 1))).toBe('stage');
  });

  it('not for a character without the trait, nor for the card itself', () => {
    expect(zoneOf(reverse(card(0, 2)), card(0, 2))).toBe('stage');
    expect(zoneOf(reverse(card(0, 0)), card(0, 0))).toBe('stage');
  });
});

describe('他のあなたの前列の【レスト】しているキャラがいない / 自分のレベル＋1以下のレベルのキャラ', () => {
  it('only rested characters of the stage count', () => {
    const none: Parameters<typeof evalCondition>[3] = { if: 'COUNT', where: 'YOUR_FRONT_ROW', other: true, filter: { kind: 'CHARACTER', rested: true }, max: 0 };
    const state = (rest: boolean) =>
      scenario({ step: 'MAIN_START' }, (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, 'FC'));
        put(ctx, card(0, 1), stageSlot(0, 'FL'));
        if (rest) setOrientation(ctx, card(0, 1), 'REST');
      }).state;
    expect(evalCondition(state(false), 0, card(0, 0), none)).toBe(true);
    expect(evalCondition(state(true), 0, card(0, 0), none)).toBe(false);
    // A card off the stage is never "rested".
    expect(matchesFilter(state(false), card(0, 30), { rested: true })).toBe(false);
  });

  it('level 1: a level 2 character matches, a level 3 one does not', () => {
    const state = scenario({ step: 'MAIN_START', defs: cards({ '0:5': character(2), '0:6': character(3) }) }, (ctx) => {
      put(ctx, card(0, 20), { player: 0, zone: 'level' });
      put(ctx, card(0, 5), { player: 0, zone: 'waitingRoom' });
      put(ctx, card(0, 6), { player: 0, zone: 'waitingRoom' });
    }).state;
    const filter = { kind: 'CHARACTER' as const, levelAtMostOwnLevel: true, ownLevelPlus: 1 };
    expect(matchesFilter(state, card(0, 5), filter)).toBe(true);
    expect(matchesFilter(state, card(0, 6), filter)).toBe(false);
  });
});

describe('【起】 この能力はあなたの、思い出とマーカー置場のカードの合計が1枚以下なら使える', () => {
  const draw: Ability = { type: 'ACT', timing: 'MAIN', condition: { if: 'COUNT', where: 'YOUR_MEMORY_AND_MARKERS', max: 1 }, cost: [], effect: [{ do: 'DRAW', count: 1 }] };
  const field = (memory: number) =>
    scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [draw] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      for (let k = 0; k < memory; k++) put(ctx, card(0, 20 + k), { player: 0, zone: 'memory' });
    }).state;

  it('one card in memory: usable; two: not', () => {
    expect(canActivate(field(1))).toBe(true);
    expect(canActivate(field(2))).toBe(false);
    const { state } = go(activate(field(1), card(0, 0)).state);
    expect(state.zones[0].hand.length).toBe(field(1).zones[0].hand.length + 1);
  });
});

describe('このカードを【スタンド】し、舞台のキャラのいない他の枠に動かす', () => {
  it('stood and moved to an empty slot the player chooses, any row', () => {
    const move: Ability = { type: 'ACT', timing: 'MAIN', cost: [{ pay: 'REST_SELF' }], effect: [{ do: 'ORIENT', target: { who: 'SELF' }, to: 'STAND' }, { do: 'MOVE_TO_SLOT', target: { who: 'SELF' }, row: 'ANY' }] };
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [move] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), stageSlot(0, 'FL'));
    }).state;
    const asked = activate(start, card(0, 0)).state;
    expect(pending(asked, 'SELECT_SLOT').slots).toEqual(['FR', 'BL', 'BR']);
    const { state } = go(asked, { kind: 'SELECT_SLOT', slot: 'BL' });
    expect(getInstance(state, card(0, 0)).location).toMatchObject({ zone: 'stage', slot: 'BL' });
    expect(getInstance(state, card(0, 0)).orientation).toBe('STAND');
    expect(zoneOf(state, card(0, 1))).toBe('stage');
  });
});

void YES;
