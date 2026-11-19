/**
 * Building blocks of batch 15: このカードの正面のキャラがアタックした時; a look that puts cards under this card face down
 * first; そのメインフェイズ中、そのカードを、色条件を満たさずに控え室からプレイしてよい (and 絆 when played so, CR-10.4.1);
 * あなたのメインフェイズ中; the centre slot with a filter; 相手のターン中、このカードは相手の効果に選ばれない given for a time.
 * Synthetic cards; the wording each case stands for is in its name.
 */

import { describe, expect, it } from 'vitest';
import { type Ability, type CardDef, type Choice, type GameEvent, type GameState, bond, evalCondition, getInstance, getPower, stageSlot } from '../src/index';
import { activate, attack, cards } from './ability-helpers';
import { answer, card, oid, pending, put, scenario } from './helpers';
import { listMainActions } from '../src/play';

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
const pick = (state: GameState, ...instanceIds: number[]): Choice => ({ kind: 'SELECT_CARDS', cards: instanceIds.map((id) => oid(state, id)) });
const YES: Choice = { kind: 'CONFIRM', accept: true };
const NO: Choice = { kind: 'CONFIRM', accept: false };
const character = (level: number, more: Partial<CardDef> = {}): Partial<CardDef> => ({ kind: 'CHARACTER', level, cost: 0, power: 1000, soul: 1, ...more });
const WIND = 'Wind';

describe('【自】 このカードの正面のキャラがアタックした時', () => {
  const draw: Ability = { type: 'AUTO', trigger: { on: 'FACING_ATTACKS' }, effect: [{ do: 'DRAW', count: 1 }] };
  /** Player 1's turn: player 0's card 0 in the centre with the ability; player 1 attacks with the card facing it, or another. */
  const field = () =>
    scenario({ step: 'ATTACK_START', turnPlayer: 1, defs: cards({ '0:0': { abilities: [draw] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(1, 0), stageSlot(1, 'FC'));
      put(ctx, card(1, 1), stageSlot(1, 'FL'));
    }).state;

  it('the character facing it attacks: it triggers for player 0', () => {
    const start = field();
    const { state } = attack(start, card(1, 0));
    expect(state.zones[0].hand.length).toBe(start.zones[0].hand.length + 1);
  });

  it('a character in another slot attacks: nothing', () => {
    const start = field();
    const { state } = attack(start, card(1, 1), 'DIRECT');
    expect(state.zones[0].hand.length).toBe(start.zones[0].hand.length);
  });
});

describe('山札を上から2枚まで見て、カードを1枚まで選び、このカードの下にマーカーとして裏向きに置き、残りのカードをそれぞれ山札の上に好きな順番で置くか控え室に置く', () => {
  const look: Ability = { type: 'ACT', timing: 'MAIN', cost: [], effect: [{ do: 'REORDER_TOP', upTo: 2, underSelf: 1, keep: 2 }] };
  const field = () =>
    scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [look] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
    }).state;

  it('one card under this card face down; the other kept on top, or put into the waiting room', () => {
    const start = field();
    const [a, b] = start.zones[0].deck.slice(-2).reverse();
    const asked = go(activate(start, card(0, 0)).state, YES, YES).state;
    expect(pending(asked, 'SELECT_CARDS')).toMatchObject({ prompt: 'EFFECT_UNDER_SELF', min: 0, max: 1 });
    const keeping = go(asked, pick(asked, a!)).state;
    expect(getInstance(keeping, a!)).toMatchObject({ location: { zone: 'marker', slot: 'FC' }, face: 'DOWN' });
    expect(pending(keeping, 'SELECT_CARDS')).toMatchObject({ prompt: 'EFFECT_KEEP', max: 1 });
    expect(pending(keeping, 'SELECT_CARDS').cards).toEqual([oid(keeping, b!)]);
    expect(zoneOf(go(keeping, pick(keeping)).state, b!)).toBe('waitingRoom');
    const kept = go(keeping, pick(keeping, b!)).state;
    expect(kept.zones[0].deck.at(-1)).toBe(b);
  });

  it('nothing put under: both may stay on top', () => {
    const asked = go(activate(field(), card(0, 0)).state, YES, YES).state;
    const keeping = go(asked, pick(asked)).state;
    expect(pending(keeping, 'SELECT_CARDS').cards).toHaveLength(2);
  });
});

describe('そのメインフェイズ中、そのカードを、色条件を満たさずに控え室からプレイしてよい', () => {
  const permit: Ability = {
    type: 'ACT',
    timing: 'MAIN',
    cost: [],
    effect: [{ do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { kind: 'CHARACTER', traits: [WIND] }, min: 1, max: 1 }, { do: 'PERMIT_PLAY_FROM_WAITING_ROOM', target: { who: 'CHOSEN' }, ignoresColor: true }],
  };
  const otherBond = bond('Partner', []);
  const placedFromHand: Ability = { type: 'AUTO', trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' }, effect: [{ do: 'DRAW', count: 1 }] };
  /** Level 1 (a red card); card 5 (blue, level 1, cost 1, 《Wind》, 絆 and a 手札から舞台に置かれた時) and card 6 (level 2) in the waiting room; one stock card. */
  const field = (stock = 1) =>
    scenario(
      {
        step: 'MAIN_START',
        defs: cards({
          '0:0': { abilities: [permit] },
          '0:5': character(1, { color: 'blue', cost: 1, traits: [WIND], abilities: [otherBond, placedFromHand] }),
          '0:6': character(2, { color: 'blue', traits: [WIND] }),
          '0:7': { name: 'Partner' },
        }),
      },
      (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, 'FC'));
        put(ctx, card(0, 20), { player: 0, zone: 'level' });
        put(ctx, card(0, 5), { player: 0, zone: 'waitingRoom' });
        put(ctx, card(0, 6), { player: 0, zone: 'waitingRoom' });
        put(ctx, card(0, 7), { player: 0, zone: 'waitingRoom' });
        for (let k = 0; k < stock; k++) put(ctx, card(0, 30 + k), { player: 0, zone: 'stock' });
      },
    ).state;
  const permitted = (stock = 1, which = 5) => {
    const asked = activate(field(stock), card(0, 0)).state;
    return go(asked, pick(asked, card(0, which))).state;
  };
  const plays = (state: GameState, id: number) => pending(state, 'MAIN').actions.filter((a) => a.type === 'PLAY_CHARACTER' && a.card === oid(state, id));

  it('the card chosen can be played from the waiting room without its colour; the cost is paid', () => {
    const state = permitted();
    expect(plays(state, card(0, 5))).toHaveLength(5);
    const played = answer(state, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(state, card(0, 5)), slot: 'FL' } }).state;
    expect(getInstance(played, card(0, 5)).location).toMatchObject({ zone: 'stage', slot: 'FL' });
    expect(played.zones[0].stock).toHaveLength(0);
  });

  it('絆 triggers when it is played onto the stage (CR-10.4.1); 手札から舞台に置かれた時 does not', () => {
    const state = permitted();
    const handBefore = state.zones[0].hand.length;
    const played = answer(state, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(state, card(0, 5)), slot: 'FL' } }).state;
    // Only the 絆 waits (the draw of 手札から舞台に置かれた時 does not): its cost is nothing, so it goes on and takes Partner.
    const after = played.pending?.kind === 'CONFIRM' ? go(played, YES).state : played;
    const chosen = after.pending?.kind === 'SELECT_CARDS' ? go(after, pick(after, card(0, 7))).state : after;
    expect(zoneOf(chosen, card(0, 7))).toBe('hand');
    expect(chosen.zones[0].hand.length).toBe(handBefore + 1);
  });

  it('not without the stock for its cost; not a card the permit is not for; the level condition still holds', () => {
    expect(plays(permitted(0), card(0, 5))).toHaveLength(0);
    const state = permitted();
    expect(plays(state, card(0, 6))).toHaveLength(0);
    // Card 6 (level 2) permitted at level 1: the level condition is kept.
    expect(plays(permitted(1, 6), card(0, 6))).toHaveLength(0);
  });

  it('only in that main phase: not in a later turn, nor outside the main phase', () => {
    const state = permitted();
    const playable = (s: GameState) => listMainActions(s, 0).some((a) => a.type === 'PLAY_CHARACTER' && a.card === oid(s, card(0, 5)));
    expect(playable(state)).toBe(true);
    const later = structuredClone(state);
    later.turn!.number += 2;
    expect(playable(later)).toBe(false);
    const elsewhere = structuredClone(state);
    elsewhere.turn!.phase = 'CLIMAX';
    expect(playable(elsewhere)).toBe(false);
  });
});

describe('あなたのメインフェイズ中', () => {
  it('true in your main phase; false in the opponent’s turn and in your other phases', () => {
    const mine = scenario({ step: 'MAIN_START' }).state;
    expect(evalCondition(mine, 0, card(0, 0), { if: 'YOUR_MAIN_PHASE' })).toBe(true);
    expect(evalCondition(mine, 1, card(1, 0), { if: 'YOUR_MAIN_PHASE' })).toBe(false);
    // Your turn, but the climax phase.
    const climax = scenario({ step: 'CLIMAX_START' }).state;
    expect(climax.turn?.phase).toBe('CLIMAX');
    expect(evalCondition(climax, 0, card(0, 0), { if: 'YOUR_MAIN_PHASE' })).toBe(false);
  });
});

describe('【永】 他のあなたの前列の中央の枠の《…》のキャラに、パワーを＋500し、…を与える', () => {
  const centre: Ability = {
    type: 'CONT',
    apply: [{ target: { who: 'YOUR_SLOT', slots: ['FC'], other: true, filter: { kind: 'CHARACTER', traits: [WIND] } }, stat: 'POWER', amount: 500 }],
  };
  const field = (traits: string[]) =>
    scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [centre] }, '0:1': character(0, { traits }) }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'BL'));
      put(ctx, card(0, 1), stageSlot(0, 'FC'));
    }).state;

  it('only a character with the trait in the centre', () => {
    expect(getPower(field([WIND]), card(0, 1))).toBe(1500);
    expect(getPower(field([]), card(0, 1))).toBe(1000);
  });
});

void NO;
