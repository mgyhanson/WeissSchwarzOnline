/**
 * Building blocks of batch 4, part 1: standing costs, a card put into the deck, "up to N" from the top of the
 * deck, an optional draw that was or was not done, three places for a card looked at, per-part turn conditions,
 * name-exclusion and exact-icon filters, traits given by abilities, the hand limit, "when you use an 【起】" and
 * "in this card's trigger check". Synthetic cards; the wording each case stands for is in its name.
 */

import { describe, expect, it } from 'vitest';
import { type Ability, type Cost, type Effect, assertInvariants, getInstance, getPower, handLimit, matchesFilter, stageSlot, traitsOf } from '../src/index';
import { DRAW_ONE, activate, attack, cards, noClimaxes, played } from './ability-helpers';
import { answer, card, oid, pending, put, scenario } from './helpers';

const act = (effect: Effect[], cost: Cost[] = []): Ability => ({ type: 'ACT', timing: 'MAIN', cost, effect });
const canActivate = (state: ReturnType<typeof scenario>['state']) => pending(state, 'MAIN').actions.some((a) => a.type === 'ACTIVATE');

describe('costs', () => {
  it('［【スタンド】しているこのカードを山札の下に置く］: only while standing', () => {
    const ability = act(DRAW_ONE, [{ pay: 'SELF_TO_DECK_BOTTOM', standing: true }]);
    const setup = (rested: boolean) =>
      scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [ability] } }) }, (ctx) => put(ctx, card(0, 0), stageSlot(0, 'FC'), rested ? { orientation: 'REST' } : {})).state;
    expect(canActivate(setup(true))).toBe(false);
    const { state } = activate(setup(false), card(0, 0));
    expect(state.zones[0].deck[0]).toBe(card(0, 0));
  });

  it('［他のあなたの舞台の【スタンド】している…のキャラを1枚思い出にする］: a rested character cannot pay', () => {
    const ability = act(DRAW_ONE, [{ pay: 'CHARACTERS_TO_WAITING_ROOM', count: 1, other: true, standing: true, toMemory: true, filter: { kind: 'CHARACTER' } }]);
    const setup = (rested: boolean) =>
      scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [ability] } }) }, (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, 'FC'));
        put(ctx, card(0, 1), stageSlot(0, 'FL'), rested ? { orientation: 'REST' } : {});
      }).state;
    expect(canActivate(setup(true))).toBe(false);
    const asked = activate(setup(false), card(0, 0)).state;
    const { state } = answer(asked, { kind: 'SELECT_CARDS', cards: [oid(asked, card(0, 1))] });
    expect(state.zones[0].memory).toEqual([card(0, 1)]);
  });
});

describe('effects', () => {
  it('…を選び、山札に戻し、その山札をシャッフルする: the clock card goes into the deck', () => {
    const back = act([{ do: 'CHOOSE', from: 'YOUR_CLOCK', min: 0, max: 1 }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'DECK' }, { do: 'SHUFFLE' }]);
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [back] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 5), { player: 0, zone: 'clock' });
    }).state;
    const asked = activate(start, card(0, 0)).state;
    const { state, events } = answer(asked, { kind: 'SELECT_CARDS', cards: [oid(asked, card(0, 5))] });
    expect(state.zones[0].clock).toEqual([]);
    expect(state.zones[0].deck).toContain(card(0, 5));
    expect(events.some((e) => e.type === 'DECK_SHUFFLED')).toBe(true);
  });

  it('自分の山札の上から2枚までを、ストック置場に置く: the player may stop before each card', () => {
    const pool = act([{ do: 'DECK_TOP', count: 2, to: 'STOCK', upTo: true }]);
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [pool] } }) }, (ctx) => put(ctx, card(0, 0), stageSlot(0, 'FC'))).state;
    let state = activate(start, card(0, 0)).state;
    expect(pending(state, 'CONFIRM').prompt).toBe('DECK_TOP_NEXT');
    state = answer(state, { kind: 'CONFIRM', accept: true }).state;
    state = answer(state, { kind: 'CONFIRM', accept: false }).state;
    expect(state.zones[0].stock).toEqual([card(0, 49)]);
  });

  it('1枚まで引く。1枚引いたなら、…: only after a card was really drawn', () => {
    const drawThen = act([{ do: 'DRAW', count: 1, optional: true }, { do: 'IF', condition: { if: 'DID' }, then: [{ do: 'DAMAGE', amount: 1 }] }]);
    const run = (accept: boolean) => {
      const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [drawThen] } }) }, (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, 'FC'));
        noClimaxes(ctx, 1);
      }).state;
      return answer(activate(start, card(0, 0)).state, { kind: 'CONFIRM', accept }).state.zones[1].clock.length;
    };
    expect(run(true)).toBe(1);
    expect(run(false)).toBe(0);
  });

  it('山札の上か下か控え室に置く: three places offered', () => {
    const look = act([{ do: 'TOP_OR_BOTTOM', anyOfThree: true }]);
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [look] } }) }, (ctx) => put(ctx, card(0, 0), stageSlot(0, 'FC'))).state;
    const asked = activate(start, card(0, 0)).state;
    expect(pending(asked, 'SELECT_OPTION').options).toEqual(['DECK_TOP', 'DECK_BOTTOM', 'WAITING_ROOM']);
    expect(answer(asked, { kind: 'SELECT_OPTION', option: 'DECK_BOTTOM' }).state.zones[0].deck[0]).toBe(card(0, 49));
  });
});

describe('continuous abilities and filters', () => {
  it('あなたのターン中、…＋500し、相手のターン中、…＋1500: each part in its own turn', () => {
    const split: Ability = {
      type: 'CONT',
      apply: [
        { target: { who: 'SELF' }, stat: 'POWER', amount: 500, onlyIf: { if: 'YOUR_TURN' } },
        { target: { who: 'SELF' }, stat: 'POWER', amount: 1500, onlyIf: { if: 'OPPONENT_TURN' } },
      ],
    };
    const power = (turnPlayer: 0 | 1) =>
      getPower(scenario({ step: 'MAIN_START', turnPlayer, defs: cards({ '0:0': { abilities: [split] } }) }, (ctx) => put(ctx, card(0, 0), stageSlot(0, 'FC'))).state, card(0, 0));
    expect(power(0)).toBe(1500);
    expect(power(1)).toBe(2500);
  });

  it('カード名に「…」を含まない《…》のキャラ / トリガーアイコンが[[soul]][[soul]]のCX', () => {
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:1': { traits: ['風'], name: '千春の友達' }, '0:2': { traits: ['風'], name: 'ほかの子' }, '0:45': { triggers: ['SOUL', 'SOUL'] }, '0:46': { triggers: ['SOUL'] } }) }).state;
    const filter = { kind: 'CHARACTER' as const, traits: ['風'], nameExcludes: '千春' };
    expect(matchesFilter(start, card(0, 1), filter)).toBe(false);
    expect(matchesFilter(start, card(0, 2), filter)).toBe(true);
    const doubleSoul = { kind: 'CLIMAX' as const, triggersExactly: ['SOUL', 'SOUL'] as ['SOUL', 'SOUL'] };
    expect(matchesFilter(start, card(0, 45), doubleSoul)).toBe(true);
    expect(matchesFilter(start, card(0, 46), doubleSoul)).toBe(false);
  });

  it('他のキャラすべてに、《…》を与える: every other character on either stage, while the giver is there', () => {
    const giver: Ability = { type: 'CONT', apply: [], giveTraits: { traits: ['ラジオ'], to: 'OTHER_CHARACTERS' } };
    const state = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [giver] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), stageSlot(0, 'FL'));
      put(ctx, card(1, 0), stageSlot(1, 'FC'));
      put(ctx, card(0, 2), { player: 0, zone: 'hand' });
    }).state;
    expect(traitsOf(state, card(0, 1))).toContain('ラジオ');
    expect(traitsOf(state, card(1, 0))).toContain('ラジオ');
    expect(traitsOf(state, card(0, 0))).not.toContain('ラジオ');
    expect(traitsOf(state, card(0, 2))).not.toContain('ラジオ');
    expect(matchesFilter(state, card(1, 0), { kind: 'CHARACTER', traits: ['ラジオ'] })).toBe(true);
  });

  it('そのターン中、パワーを＋1500し、《出会い》を与える: the trait lasts the turn', () => {
    const give = act([
      { do: 'CHOOSE', from: 'YOUR_STAGE', min: 1, max: 1 },
      { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'POWER', amount: 1500 },
      { do: 'GRANT', target: { who: 'CHOSEN' }, ability: { type: 'CONT', apply: [], giveTraits: { traits: ['出会い'], to: 'SELF' } } },
    ]);
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [give] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), stageSlot(0, 'FL'));
    }).state;
    const asked = activate(start, card(0, 0)).state;
    const { state } = answer(asked, { kind: 'SELECT_CARDS', cards: [oid(asked, card(0, 1))] });
    expect(traitsOf(state, card(0, 1))).toContain('出会い');
    expect(getPower(state, card(0, 1))).toBe(2500);
    assertInvariants(state);
  });

  it('あなたの手札の枚数上限を＋1', () => {
    const more: Ability = { type: 'CONT', apply: [], handLimitPlus: 1 };
    const state = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [more] } }) }, (ctx) => put(ctx, card(0, 0), stageSlot(0, 'FC'))).state;
    expect(handLimit(state, 0)).toBe(8);
    expect(handLimit(state, 1)).toBe(7);
  });

  it('あなたのレベル置場の《…》のキャラ1枚につき: a face-down level card does not count (CR-3.9.2.2.1)', () => {
    const per: Ability = { type: 'CONT', apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: 1000, perCount: { where: 'YOUR_LEVEL', filter: { kind: 'CHARACTER' } } }] };
    const state = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [per] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 30), { player: 0, zone: 'level' });
      put(ctx, card(0, 31), { player: 0, zone: 'level' });
    }).state;
    expect(getPower(state, card(0, 0))).toBe(3000);
    getInstance(state, card(0, 31)).face = 'DOWN';
    expect(getPower(state, card(0, 0))).toBe(2000);
  });
});

describe('triggers', () => {
  it('あなたが【起】を使った時: after an activated ability of yours, not the opponent’s', () => {
    const watch: Ability = { type: 'AUTO', trigger: { on: 'YOU_PLAYED_ACT' }, effect: DRAW_ONE };
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [act([])] }, '0:1': { abilities: [watch] }, '1:1': { abilities: [watch] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), stageSlot(0, 'FL'));
      put(ctx, card(1, 1), stageSlot(1, 'FL'));
    }).state;
    const { events } = activate(start, card(0, 0));
    expect(played(events, card(0, 1))).toBe(1);
    expect(played(events, card(1, 1))).toBe(0);
  });

  it('このカードのトリガーチェックで…がでた時: only in this card’s own attack', () => {
    const watch: Ability = { type: 'AUTO', trigger: { on: 'TRIGGER_CHECK_REVEALS', filter: { kind: 'CHARACTER' }, ofThisCard: true }, effect: DRAW_ONE };
    const run = (attacker: number) => {
      const start = scenario({ step: 'ATTACK_START', defs: cards({ '0:0': { abilities: [watch] } }) }, (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, 'FC'));
        put(ctx, card(0, 1), stageSlot(0, 'FL'));
        noClimaxes(ctx, 0);
        noClimaxes(ctx, 1);
      }).state;
      return played(attack(start, card(0, attacker), 'DIRECT').events, card(0, 0));
    };
    expect(run(0)).toBe(1);
    expect(run(1)).toBe(0);
  });
});

describe('batch 4 part 2: shown cards, choices and splits', () => {
  it('山札の上から1枚を公開してよい。そのカードが…なら、…してよい、そうでないなら、…', () => {
    const reveal = (optional: boolean, filter: { kind: 'CHARACTER' | 'CLIMAX' }) =>
      act([{ do: 'REVEAL_TOP', filter, optional, then: [{ do: 'MAY', effects: [{ do: 'DAMAGE', amount: 1 }] }], else: DRAW_ONE }]);
    const setup = (ability: Ability) =>
      scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [ability] } }) }, (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, 'FC'));
        noClimaxes(ctx, 0);
        noClimaxes(ctx, 1);
      }).state;
    // Declined at the start: nothing is shown.
    const declined = answer(activate(setup(reveal(true, { kind: 'CHARACTER' })), card(0, 0)).state, { kind: 'CONFIRM', accept: false });
    expect(declined.events.some((e) => e.type === 'CARD_REVEALED')).toBe(false);
    // A character: the player may deal the damage; it stays on the deck.
    let state = answer(activate(setup(reveal(true, { kind: 'CHARACTER' })), card(0, 0)).state, { kind: 'CONFIRM', accept: true }).state;
    expect(pending(state, 'CONFIRM').prompt).toBe('USE_ABILITY');
    state = answer(state, { kind: 'CONFIRM', accept: true }).state;
    expect(state.zones[1].clock).toHaveLength(1);
    expect(state.zones[0].deck[state.zones[0].deck.length - 1]).toBe(card(0, 41));
    // Not a climax: the else branch draws instead.
    const other = activate(setup(reveal(false, { kind: 'CLIMAX' })), card(0, 0)).state;
    expect(other.zones[0].hand).toEqual([card(0, 41)]);
  });

  it('…を2枚まで選び、公開し、1枚手札に加え、残りのカードをストック置場の下に置く: exactly one to the hand', () => {
    const search = act([{ do: 'CHOOSE', from: 'YOUR_DECK', filter: { kind: 'CHARACTER' }, min: 0, max: 2 }, { do: 'SPLIT_CHOSEN', take: 1, exact: true, to: 'HAND', rest: 'STOCK_BOTTOM', reveal: true }, { do: 'SHUFFLE' }]);
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [search] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 20), { player: 0, zone: 'stock' });
    }).state;
    let state = activate(start, card(0, 0)).state;
    state = answer(state, { kind: 'SELECT_CARDS', cards: [oid(state, card(0, 5)), oid(state, card(0, 6))] }).state;
    expect(pending(state, 'SELECT_CARDS')).toMatchObject({ prompt: 'EFFECT_SPLIT', min: 1, max: 1 });
    state = answer(state, { kind: 'SELECT_CARDS', cards: [oid(state, card(0, 6))] }).state;
    expect(state.zones[0].hand).toEqual([card(0, 6)]);
    expect(state.zones[0].stock).toEqual([card(0, 5), card(0, 20)]);
    assertInvariants(state);
  });

  it('…を2枚まで選び、2枚までストック置場に好きな順番で置き、残りのカードを思い出にする', () => {
    const split = act([{ do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', min: 0, max: 2 }, { do: 'SPLIT_CHOSEN', take: 2, to: 'STOCK', inOrder: true, rest: 'MEMORY' }]);
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [split] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 5), { player: 0, zone: 'waitingRoom' });
      put(ctx, card(0, 6), { player: 0, zone: 'waitingRoom' });
    }).state;
    let state = activate(start, card(0, 0)).state;
    state = answer(state, { kind: 'SELECT_CARDS', cards: [oid(state, card(0, 5)), oid(state, card(0, 6))] }).state;
    state = answer(state, { kind: 'SELECT_CARDS', cards: [oid(state, card(0, 5)), oid(state, card(0, 6))] }).state;
    expect(pending(state, 'SELECT_CARDS').prompt).toBe('EFFECT_PLACE_ORDER');
    state = answer(state, { kind: 'SELECT_CARDS', cards: [oid(state, card(0, 6))] }).state;
    // 6 went first, so 5 is on top.
    expect(state.zones[0].stock).toEqual([card(0, 6), card(0, 5)]);
    expect(state.zones[0].memory).toEqual([]);
  });

  it('自分の手札を2枚まで選び、ストック置場に好きな順番で置く', () => {
    const order = act([{ do: 'CHOOSE', from: 'YOUR_HAND', min: 0, max: 2 }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'STOCK', inOrder: true }]);
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [order] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 5), { player: 0, zone: 'hand' });
      put(ctx, card(0, 6), { player: 0, zone: 'hand' });
    }).state;
    let state = activate(start, card(0, 0)).state;
    state = answer(state, { kind: 'SELECT_CARDS', cards: [oid(state, card(0, 5)), oid(state, card(0, 6))] }).state;
    state = answer(state, { kind: 'SELECT_CARDS', cards: [oid(state, card(0, 5))] }).state;
    expect(state.zones[0].stock).toEqual([card(0, 5), card(0, 6)]);
  });

  it('相手の前列のパワー8000以下のキャラ: by current power', () => {
    const start = scenario({ step: 'MAIN_START', defs: cards({ '1:0': { power: 8000 }, '1:1': { power: 9000 } }) }, (ctx) => {
      put(ctx, card(1, 0), stageSlot(1, 'FC'));
      put(ctx, card(1, 1), stageSlot(1, 'FL'));
    }).state;
    expect(matchesFilter(start, card(1, 0), { kind: 'CHARACTER', powerMax: 8000 })).toBe(true);
    expect(matchesFilter(start, card(1, 1), { kind: 'CHARACTER', powerMax: 8000 })).toBe(false);
  });
});
