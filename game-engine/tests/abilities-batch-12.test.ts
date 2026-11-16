/**
 * Building blocks of batch 5, part 1: X of a resolution (SET_X) from shown cards, the opponent's waiting room,
 * memory or distinct markers, used as damage, repeats, card counts and look limits; cards shown on the deck; the
 * clock's bottom card; every clock to the waiting room; two trigger checks for this card's attack; the facing
 * character; and three triggers. Synthetic cards; the wording each case stands for is in its name.
 */

import { describe, expect, it } from 'vitest';
import { type Ability, type Cost, type Effect, getPower, getSoul, markerSlot, stageSlot } from '../src/index';
import { DRAW_ONE, activate, attack, cards, noClimaxes, played } from './ability-helpers';
import { answer, card, oid, pending, put, scenario } from './helpers';

const act = (effect: Effect[], cost: Cost[] = []): Ability => ({ type: 'ACT', timing: 'MAIN', cost, effect });
const damages = (events: { type: string }[]) => events.filter((e) => e.type === 'DAMAGE_DEALT').length;

describe('X of a resolution', () => {
  it('山札の上から4枚を公開し、その山札をシャッフルし、相手に1ダメージをＸ回与える。ＸはそれらのカードのCXの枚数に等しい', () => {
    const burst = act([
      { do: 'REVEAL_DECK_TOP', count: 4 },
      { do: 'SET_X', count: { of: 'MOVED', filter: { kind: 'CLIMAX' } } },
      { do: 'SHUFFLE' },
      { do: 'REPEAT', times: 1, timesX: true, effects: [{ do: 'DAMAGE', amount: 1 }] },
    ]);
    // The top four: two climaxes (49, 48) and two characters (41, 40) once 42–47 are moved away.
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [burst] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      for (const k of [42, 43, 44, 45, 46, 47]) put(ctx, card(0, k), { player: 0, zone: 'memory' });
      noClimaxes(ctx, 1);
    }).state;
    const { state, events } = activate(start, card(0, 0));
    expect(events.filter((e) => e.type === 'CARD_REVEALED')).toHaveLength(4);
    expect(damages(events)).toBe(2);
    // The shown cards stay in the deck and are no longer shown.
    expect(state.zones[0].deck).toContain(card(0, 49));
    expect(state.instances[card(0, 49)]!.revealed).toBe(false);
  });

  it('Ｘは相手の控え室のCXの枚数－2 (never below 0) / Ｘダメージ', () => {
    const run = (climaxes: number) => {
      const burn = act([{ do: 'SET_X', count: { of: 'OPPONENT_WAITING_ROOM', filter: { kind: 'CLIMAX' } }, minus: 2 }, { do: 'DAMAGE', amount: 1, amountX: true }]);
      const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [burn] } }) }, (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, 'FC'));
        for (let k = 0; k < climaxes; k++) put(ctx, card(1, 49 - k), { player: 1, zone: 'waitingRoom' });
      }).state;
      return activate(start, card(0, 0)).events.filter((e) => e.type === 'DAMAGE_DEALT').map((e) => (e.type === 'DAMAGE_DEALT' ? e.amount : 0));
    };
    expect(run(5)).toEqual([3]);
    // X is 0: zero damage is not dealt at all (CR-7.5.1.2.1).
    expect(run(1)).toEqual([]);
  });

  it('Ｘはこのカードの下の異なるカード名のマーカーが1枚以下なら1、2枚以上なら2 / ＋1 / 相手の控え室のカードをＸ枚まで選び', () => {
    const pick = (tiers: boolean) =>
      act([
        tiers ? { do: 'SET_X', count: { of: 'MARKERS', distinctNames: true }, tiers: [{ max: 1, x: 1 }, { min: 2, x: 2 }] } : { do: 'SET_X', count: { of: 'MARKERS', distinctNames: true }, plus: 1 },
        { do: 'CHOOSE', from: 'OPPONENT_WAITING_ROOM', min: 0, max: 1, maxX: true },
      ]);
    const setup = (ability: Ability) =>
      scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [ability] }, '0:5': { name: 'A' }, '0:6': { name: 'A' }, '0:7': { name: 'B' } }) }, (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, 'FC'));
        for (const k of [5, 6, 7]) put(ctx, card(0, k), markerSlot(0, 'FC'), { face: 'UP' });
        for (const k of [1, 2, 3, 4]) put(ctx, card(1, k), { player: 1, zone: 'waitingRoom' });
      }).state;
    // Two names (A, B): tiers give 2; plus 1 gives 3.
    expect(pending(activate(setup(pick(true)), card(0, 0)).state, 'SELECT_CARDS').max).toBe(2);
    expect(pending(activate(setup(pick(false)), card(0, 0)).state, 'SELECT_CARDS').max).toBe(3);
  });

  it('相手の山札を上からＸ枚まで見て、カードをＸ枚まで選び / 相手の山札の下からＸ枚 (Ｘ from memory names)', () => {
    const look = act([{ do: 'SET_X', count: { of: 'YOUR_MEMORY', filter: { names: ['A', 'B'] } } }, { do: 'DECK_TOP', count: 1, countX: true, to: 'WAITING_ROOM', whose: 'OPPONENT', fromBottom: true }]);
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [look] }, '0:5': { name: 'A' }, '0:6': { name: 'B' }, '0:7': { name: 'C' } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      for (const k of [5, 6, 7]) put(ctx, card(0, k), { player: 0, zone: 'memory' });
    }).state;
    expect(activate(start, card(0, 0)).state.zones[1].waitingRoom).toEqual([card(1, 0), card(1, 1)]);
    const reorder = act([{ do: 'SET_X', count: { of: 'YOUR_MEMORY', filter: { names: ['A', 'B'] } } }, { do: 'REORDER_TOP', upTo: 1, keep: 1, x: true, whose: 'OPPONENT' }]);
    const s2 = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [reorder] }, '0:5': { name: 'A' }, '0:6': { name: 'B' } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      for (const k of [5, 6]) put(ctx, card(0, k), { player: 0, zone: 'memory' });
    }).state;
    let state = activate(s2, card(0, 0)).state;
    for (let k = 0; k < 2; k++) state = answer(state, { kind: 'CONFIRM', accept: true }).state;
    // X = 2: no third card is offered.
    expect(pending(state, 'SELECT_CARDS').max).toBe(2);
  });
});

describe('zones and triggers', () => {
  it('自分のクロックの下から1枚を、ストック置場に置く / すべてのプレイヤーは自分のクロックすべてを、控え室に置く', () => {
    const bottom = act([{ do: 'CLOCK_TOP', to: 'STOCK', fromBottom: true }]);
    const wipe = act([{ do: 'CLOCK_ALL_TO_WAITING_ROOM', everyone: true }]);
    const setup = (ability: Ability) =>
      scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [ability] } }) }, (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, 'FC'));
        put(ctx, card(0, 5), { player: 0, zone: 'clock' });
        put(ctx, card(0, 6), { player: 0, zone: 'clock' });
        put(ctx, card(1, 5), { player: 1, zone: 'clock' });
      }).state;
    expect(activate(setup(bottom), card(0, 0)).state.zones[0].stock).toEqual([card(0, 5)]);
    const wiped = activate(setup(wipe), card(0, 0)).state;
    expect([wiped.zones[0].clock, wiped.zones[1].clock]).toEqual([[], []]);
  });

  it('このカードのアタック中、あなたはトリガーステップにトリガーチェックを2回行う', () => {
    const twice: Ability = { type: 'CONT', apply: [], triggerChecks: 2 };
    const checks = (abilities: Ability[]) => {
      const start = scenario({ step: 'ATTACK_START', defs: cards({ '0:0': { abilities } }) }, (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, 'FC'));
        noClimaxes(ctx, 0);
        noClimaxes(ctx, 1);
      }).state;
      return attack(start, card(0, 0), 'DIRECT').events.filter((e) => e.type === 'TRIGGER_CHECK').length;
    };
    expect(checks([twice])).toBe(2);
    expect(checks([])).toBe(1);
  });

  it('【永】 このカードの正面のキャラのソウルを－2 (given for a turn)', () => {
    const state = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [{ type: 'CONT', apply: [{ target: { who: 'FACING' }, stat: 'SOUL', amount: -2 }] }] }, '1:0': { soul: 3 }, '1:1': { soul: 3 } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FL'));
      put(ctx, card(1, 0), stageSlot(1, 'FR'));
      put(ctx, card(1, 1), stageSlot(1, 'FL'));
    }).state;
    // FL faces the opponent's FR (CR-3.6.4).
    expect(getSoul(state, card(1, 0))).toBe(1);
    expect(getSoul(state, card(1, 1))).toBe(3);
    expect(getPower(state, card(0, 0))).toBe(1000);
  });

  it('相手が【起】を使った時 / このカードがダイレクトアタックした時', () => {
    const watch: Ability = { type: 'AUTO', trigger: { on: 'OPPONENT_PLAYED_ACT' }, effect: DRAW_ONE };
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [act([])] }, '1:0': { abilities: [watch] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(1, 0), stageSlot(1, 'FC'));
    }).state;
    expect(played(activate(start, card(0, 0)).events, card(1, 0))).toBe(1);

    const direct: Ability = { type: 'AUTO', trigger: { on: 'ATTACKS', attackType: 'DIRECT' }, effect: DRAW_ONE };
    const run = (type: 'DIRECT' | 'FRONT') => {
      const s = scenario({ step: 'ATTACK_START', defs: cards({ '0:0': { abilities: [direct] } }) }, (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, 'FC'));
        if (type === 'FRONT') put(ctx, card(1, 0), stageSlot(1, 'FC'));
        noClimaxes(ctx, 0);
        noClimaxes(ctx, 1);
      }).state;
      return played(answer(s, { kind: 'ATTACK', attack: { attacker: oid(s, card(0, 0)), type } }).events, card(0, 0));
    };
    expect(run('DIRECT')).toBe(1);
    expect(run('FRONT')).toBe(0);
  });

  it('このカードが手札から舞台に置かれたターン中、あなたのCXフェイズの始めに: only in that turn', () => {
    const watch: Ability = { type: 'AUTO', trigger: { on: 'PHASE_START', phase: 'CLIMAX', turn: 'YOURS', placedThisTurn: true }, effect: DRAW_ONE };
    const run = (placedNow: boolean) => {
      const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [watch] } }) }, (ctx) => put(ctx, card(0, 0), stageSlot(0, 'FC'))).state;
      if (placedNow) start.instances[card(0, 0)]!.placedFromHandTurn = start.turn!.number;
      return played(answer(start, { kind: 'MAIN', action: { type: 'PASS' } }).events, card(0, 0));
    };
    expect(run(true)).toBe(1);
    expect(run(false)).toBe(0);
  });
});

describe('batch 5 part 2: extra turns and replay', () => {
  /** Answers every decision with "nothing" until the given player's next main phase. */
  function toNextMain(state: ReturnType<typeof scenario>['state'], limit = 200) {
    let s = state;
    for (let k = 0; k < limit; k++) {
      const d = s.pending!;
      if (d.kind === 'MAIN' && k > 0) return s;
      const choice =
        d.kind === 'MAIN' ? { kind: 'MAIN' as const, action: { type: 'PASS' as const } }
        : d.kind === 'CLIMAX' ? { kind: 'CLIMAX' as const, card: null }
        : d.kind === 'ATTACK' ? { kind: 'ATTACK' as const, attack: null }
        : d.kind === 'CLOCK' ? { kind: 'CLOCK' as const, card: null }
        : d.kind === 'CONFIRM' ? { kind: 'CONFIRM' as const, accept: false }
        : d.kind === 'HAND_LIMIT' ? { kind: 'HAND_LIMIT' as const, discard: d.cards.slice(0, d.count) }
        : d.kind === 'CHOOSE_ABILITY' ? { kind: 'CHOOSE_ABILITY' as const, id: d.abilities[0]!.id }
        : null;
      if (!choice) throw new Error(`unexpected ${d.kind}`);
      s = answer(s, choice as never).state;
    }
    throw new Error('no main phase');
  }

  it('あなたは追加の1ターンを得る (CR-11.2.1): the same player takes the next turn; a 次の相手のターンの終わりまで lasts through the opponent’s turn after it', () => {
    const extra = act([{ do: 'EXTRA_TURN' }, { do: 'MODIFY', target: { who: 'SELF' }, stat: 'POWER', amount: 1000, until: 'NEXT_OPPONENT_TURN' }]);
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [extra] } }) }, (ctx) => put(ctx, card(0, 0), stageSlot(0, 'FC'))).state;
    let state = activate(start, card(0, 0)).state;
    const turn = state.turn!.number;
    state = toNextMain(state);
    expect(state.turn).toMatchObject({ number: turn + 1, player: 0 });
    expect(getPower(state, card(0, 0))).toBe(2000);
    state = toNextMain(state);
    expect(state.turn).toMatchObject({ number: turn + 2, player: 1 });
    expect(getPower(state, card(0, 0))).toBe(2000);
    state = toNextMain(state);
    expect(state.turn).toMatchObject({ number: turn + 3, player: 0 });
    expect(getPower(state, card(0, 0))).toBe(1000);
  });

  it('…を発動する (CR-11.3.2) with 【ゲーム1】 (CR-11.3.3.1): the replay effect is done once a game by each player', () => {
    const replay: Ability = { type: 'CONT', apply: [], replay: { name: '夢', oncePerGame: true, effects: [{ do: 'CHOOSE', from: 'YOUR_LEVEL', min: 1, max: 1 }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'WAITING_ROOM' }, { do: 'DAMAGE', amount: 1 }] } };
    const fire = act([{ do: 'REPLAY', name: '夢' }]);
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [fire, replay] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 30), { player: 0, zone: 'level' });
      put(ctx, card(0, 31), { player: 0, zone: 'level' });
      noClimaxes(ctx, 1);
    }).state;
    let state = activate(start, card(0, 0)).state;
    state = answer(state, { kind: 'SELECT_CARDS', cards: [oid(state, card(0, 30))] }).state;
    expect(state.zones[0].level).toEqual([card(0, 31)]);
    expect(state.zones[1].clock).toHaveLength(1);
    // The second time this game: nothing.
    const again = activate(state, card(0, 0));
    expect(again.state.zones[0].level).toEqual([card(0, 31)]);
    expect(damages(again.events)).toBe(0);
  });

  it('自分のクロックの上から2枚までを、控え室に置く: may stop before each', () => {
    const clean = act([{ do: 'CLOCK_TOP', to: 'WAITING_ROOM', count: 2, optional: true }]);
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [clean] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      for (const k of [5, 6, 7]) put(ctx, card(0, k), { player: 0, zone: 'clock' });
    }).state;
    let state = activate(start, card(0, 0)).state;
    state = answer(state, { kind: 'CONFIRM', accept: true }).state;
    state = answer(state, { kind: 'CONFIRM', accept: false }).state;
    expect(state.zones[0].clock).toEqual([card(0, 5), card(0, 6)]);
  });
});
