/**
 * The building blocks added for the Level 3 batch (2026-11): abilities that
 * work in the hand, counting cards in a zone, "A or B" conditions, choosing
 * one of several effects, an optional payment inside an effect, a choice of
 * destination, the end of an attack, several trigger checks, "the turn it
 * was played", "cannot be chosen by the opponent's effects", the opponent's
 * climax, a standing card as a cost, "if it went to the hand", and memory.
 * Synthetic cards; the card wording each case stands for is in its name.
 */

import { describe, expect, it } from 'vitest';
import { type Ability, type Condition, type Cost, type Ctx, type Effect, assertInvariants, getCardLevel, getPower, stageSlot } from '../src/index';
import { DRAW_ONE, activate, attack, canActivate, cards, noClimaxes, played } from './ability-helpers';
import { answer, card, oid, pending, put, scenario } from './helpers';

const act = (effect: Effect[], cost: Cost[] = []): Ability => ({ type: 'ACT', timing: 'MAIN', cost, effect });
const boostIf = (condition: Condition): Ability => ({ type: 'CONT', condition, apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: 1000 }] });
const plays = (state: ReturnType<typeof scenario>['state']) => pending(state, 'MAIN').actions.filter((a) => a.type === 'PLAY_CHARACTER').map((a) => (a as { card: number }).card);

describe('【永】 あなたの手札のこのカードのレベルを－1: works in the hand only', () => {
  const lower: Ability = { type: 'CONT', inHand: true, apply: [{ target: { who: 'SELF' }, stat: 'LEVEL', amount: -1 }] };
  const setup = (abilities: Ability[], levelCards: number) =>
    scenario({ step: 'MAIN_START', defs: cards({ '0:0': { level: 3, abilities } }) }, (ctx) => {
      put(ctx, card(0, 0), { player: 0, zone: 'hand' });
      for (let i = 0; i < levelCards; i++) put(ctx, card(0, 30 + i), { player: 0, zone: 'level' });
    }).state;

  it('a level 3 card can be played at level 2, not at level 1; without the ability it needs level 3', () => {
    const at2 = setup([lower], 2);
    expect(getCardLevel(at2, card(0, 0))).toBe(2);
    expect(plays(at2)).toContain(oid(at2, card(0, 0)));
    expect(plays(setup([lower], 1))).not.toContain(oid(setup([lower], 1), card(0, 0)));
    const plain = setup([], 2);
    expect(plays(plain)).not.toContain(oid(plain, card(0, 0)));
  });

  it('on the stage the card has its printed level again', () => {
    const at2 = setup([lower], 2);
    const { state } = answer(at2, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(at2, card(0, 0)), slot: 'FC' } });
    expect(getCardLevel(state, card(0, 0))).toBe(3);
  });

  it('with a condition: only while it holds (あなたの控え室のCXが2枚以下なら)', () => {
    const counted: Ability = { ...lower, condition: { if: 'COUNT', where: 'YOUR_WAITING_ROOM', filter: { kind: 'CLIMAX' }, max: 2 } } as Ability;
    const state = (climaxes: number) =>
      scenario({ step: 'MAIN_START', defs: cards({ '0:0': { level: 3, abilities: [counted] } }) }, (ctx) => {
        put(ctx, card(0, 0), { player: 0, zone: 'hand' });
        for (let i = 0; i < climaxes; i++) put(ctx, card(0, 42 + i), { player: 0, zone: 'waitingRoom' });
      }).state;
    expect(getCardLevel(state(2), card(0, 0))).toBe(2);
    expect(getCardLevel(state(3), card(0, 0))).toBe(3);
  });
});

describe('conditions: counting cards in a zone, and "A or B"', () => {
  it.each([
    ['あなたの控え室のCXが2枚以下', { if: 'COUNT', where: 'YOUR_WAITING_ROOM', filter: { kind: 'CLIMAX' }, max: 2 }, (ctx: Ctx) => [42, 43].forEach((i) => put(ctx, card(0, i), { player: 0, zone: 'waitingRoom' })), (ctx: Ctx) => [42, 43, 44].forEach((i) => put(ctx, card(0, i), { player: 0, zone: 'waitingRoom' }))],
    ['あなたの手札が5枚以上', { if: 'COUNT', where: 'YOUR_HAND', min: 5 }, (ctx: Ctx) => [1, 2, 3, 4, 5].forEach((i) => put(ctx, card(0, i), { player: 0, zone: 'hand' })), (ctx: Ctx) => [1, 2, 3, 4].forEach((i) => put(ctx, card(0, i), { player: 0, zone: 'hand' }))],
    ['相手のレベル1以上のキャラがいる', { if: 'COUNT', where: 'OPPONENT_STAGE', filter: { kind: 'CHARACTER', levelMin: 1 }, min: 1 }, (ctx: Ctx) => put(ctx, card(1, 1), stageSlot(1, 'BL')), (ctx: Ctx) => put(ctx, card(1, 2), stageSlot(1, 'BL'))],
    ['相手の前列のキャラが1枚以下', { if: 'COUNT', where: 'OPPONENT_FRONT_ROW', max: 1 }, (ctx: Ctx) => { put(ctx, card(1, 2), stageSlot(1, 'FL')); put(ctx, card(1, 3), stageSlot(1, 'BL')); }, (ctx: Ctx) => { put(ctx, card(1, 2), stageSlot(1, 'FL')); put(ctx, card(1, 3), stageSlot(1, 'FR')); }],
    ['あなたのCX置場にトリガーアイコンがchoiceのCXがある', { if: 'COUNT', where: 'YOUR_CLIMAX', filter: { kind: 'CLIMAX', hasTrigger: 'CHOICE' }, min: 1 }, (ctx: Ctx) => put(ctx, card(0, 45), { player: 0, zone: 'climax' }), (ctx: Ctx) => put(ctx, card(0, 46), { player: 0, zone: 'climax' })],
    ['他のあなたの前列の「…」がいる', { if: 'COUNT', where: 'YOUR_FRONT_ROW', filter: { name: 'Test character T0-02' }, other: true, min: 1 }, (ctx: Ctx) => put(ctx, card(0, 2), stageSlot(0, 'FL')), (ctx: Ctx) => put(ctx, card(0, 2), stageSlot(0, 'BL'))],
    ['手札が5枚以上か控え室のCXが2枚以下', { if: 'ANY', of: [{ if: 'COUNT', where: 'YOUR_HAND', min: 5 }, { if: 'COUNT', where: 'YOUR_WAITING_ROOM', filter: { kind: 'CLIMAX' }, max: 2 }] }, (ctx: Ctx) => [42, 43].forEach((i) => put(ctx, card(0, i), { player: 0, zone: 'waitingRoom' })), (ctx: Ctx) => [42, 43, 44].forEach((i) => put(ctx, card(0, i), { player: 0, zone: 'waitingRoom' }))],
  ] as [string, Condition, (ctx: Ctx) => void, (ctx: Ctx) => void][])('%s', (_name, condition, holds, fails) => {
    const defs = cards({ '0:0': { abilities: [boostIf(condition)] }, '0:45': { triggers: ['CHOICE'] }, '1:1': { level: 1 } });
    const power = (arrange: (ctx: Ctx) => void) => {
      const state = scenario({ step: 'MAIN_START', defs }, (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, 'FC'));
        arrange(ctx);
      }).state;
      return getPower(state, card(0, 0));
    };
    expect(power(holds)).toBe(2000);
    expect(power(fails)).toBe(1000);
  });

  it('a face-down memory card is not counted when the count names a kind of card', () => {
    const condition: Condition = { if: 'COUNT', where: 'YOUR_MEMORY', filter: { kind: 'CLIMAX' }, min: 1 };
    const state = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [boostIf(condition)] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 45), { player: 0, zone: 'memory' }, { face: 'DOWN' });
    }).state;
    expect(getPower(state, card(0, 0))).toBe(1000);
  });
});

describe('次の2つの効果のうちあなたが選んだ1つを行う, with ［cost］ あなたはコストを払ってよい inside', () => {
  const defs = cards({
    '0:0': { abilities: [act([{ do: 'CHOOSE_ONE', options: [DRAW_ONE, [{ do: 'MAY_PAY', cost: [{ pay: 'STOCK', count: 1 }], then: [{ do: 'DRAW', count: 2 }] }]] }])] },
  });
  const start = (stock: number) =>
    scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      for (let i = 0; i < stock; i++) put(ctx, card(0, 10 + i), { player: 0, zone: 'stock' });
    }).state;

  it('the player chooses which effect; only that one is done', () => {
    const atOption = activate(start(1), card(0, 0)).state;
    expect(pending(atOption, 'SELECT_OPTION')).toMatchObject({ prompt: 'EFFECT_OPTION', options: ['EFFECT_1', 'EFFECT_2'] });
    const first = answer(atOption, { kind: 'SELECT_OPTION', option: 'EFFECT_1' }).state;
    expect(first.zones[0].hand).toHaveLength(1);
    expect(first.zones[0].stock).toHaveLength(1);
  });

  it('the second effect asks to pay; paying pays first, then draws two; declining does nothing', () => {
    const atPay = answer(activate(start(1), card(0, 0)).state, { kind: 'SELECT_OPTION', option: 'EFFECT_2' }).state;
    expect(pending(atPay, 'CONFIRM').prompt).toBe('PAY_COST');
    const { state, events } = answer(atPay, { kind: 'CONFIRM', accept: true });
    const reasons = events.flatMap((e) => (e.type === 'CARD_MOVED' ? [e.reason] : []));
    expect(reasons).toEqual(['COST', 'DRAW', 'DRAW']);
    expect(state.zones[0].hand).toHaveLength(2);
    const declined = answer(atPay, { kind: 'CONFIRM', accept: false }).state;
    expect(declined.zones[0].hand).toHaveLength(0);
    expect(declined.zones[0].stock).toHaveLength(1);
    assertInvariants(state);
  });

  it('with nothing to pay with, choosing the second effect does nothing and asks nothing', () => {
    const done = answer(activate(start(0), card(0, 0)).state, { kind: 'SELECT_OPTION', option: 'EFFECT_2' }).state;
    expect(done.pending?.kind).toBe('MAIN');
    expect(done.zones[0].hand).toHaveLength(0);
  });
});

describe('destinations and the clock', () => {
  it('手札に戻すかストック置場に置く: the player chooses where the chosen card goes', () => {
    const defs = cards({ '0:0': { abilities: [act([{ do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', min: 1, max: 1 }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND', orTo: 'STOCK' }])] } });
    const start = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 5), { player: 0, zone: 'waitingRoom' });
    }).state;
    const atChoose = activate(start, card(0, 0)).state;
    const atWhere = answer(atChoose, { kind: 'SELECT_CARDS', cards: [oid(atChoose, card(0, 5))] }).state;
    expect(pending(atWhere, 'SELECT_OPTION')).toMatchObject({ prompt: 'EFFECT_DESTINATION', options: ['HAND', 'STOCK'] });
    expect(answer(atWhere, { kind: 'SELECT_OPTION', option: 'STOCK' }).state.zones[0].stock).toEqual([card(0, 5)]);
    expect(answer(atWhere, { kind: 'SELECT_OPTION', option: 'HAND' }).state.zones[0].hand).toEqual([card(0, 5)]);
  });

  it('自分のクロックの上から1枚を、ストック置場に置く; …1枚までを… asks first', () => {
    const run = (effect: Effect) => {
      const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [act([effect])] } }) }, (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, 'FC'));
        put(ctx, card(0, 5), { player: 0, zone: 'clock' });
        put(ctx, card(0, 6), { player: 0, zone: 'clock' });
      }).state;
      return activate(start, card(0, 0)).state;
    };
    expect(run({ do: 'CLOCK_TOP', to: 'STOCK' }).zones[0].stock).toEqual([card(0, 6)]);
    const asked = run({ do: 'CLOCK_TOP', to: 'WAITING_ROOM', optional: true });
    expect(pending(asked, 'CONFIRM').prompt).toBe('USE_ABILITY');
    expect(answer(asked, { kind: 'CONFIRM', accept: false }).state.zones[0].clock).toEqual([card(0, 5), card(0, 6)]);
    expect(answer(asked, { kind: 'CONFIRM', accept: true }).state.zones[0].waitingRoom).toEqual([card(0, 6)]);
  });
});

describe('triggers: the end of an attack, the turn the card was played, the opponent’s climax', () => {
  const ended: Ability = { type: 'AUTO', trigger: { on: 'ATTACK_END' }, effect: DRAW_ONE };
  const attackStart = (abilities: Ability[], arrange: (ctx: Ctx) => void = () => {}) =>
    scenario({ step: 'ATTACK_START', defs: cards({ '0:0': { abilities, power: 3000 }, '0:1': {} }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), stageSlot(0, 'FL'));
      noClimaxes(ctx, 0);
      noClimaxes(ctx, 1);
      arrange(ctx);
    }).state;

  it('このカードのアタックの終わりに: after its damage (direct) or its battle (front); not for another character’s attack', () => {
    const direct = attack(attackStart([ended]), card(0, 0), 'DIRECT');
    expect(played(direct.events, card(0, 0))).toBe(1);
    // It comes after the damage of the attack.
    const kinds = direct.events.map((e) => e.type);
    expect(kinds.lastIndexOf('DAMAGE_DEALT')).toBeLessThan(kinds.indexOf('ABILITY_PLAYED'));
    const other = attack(attackStart([ended]), card(0, 1), 'DIRECT');
    expect(played(other.events, card(0, 0))).toBe(0);
    // Front attack: after the battle, also when it was reversed (it is still on the stage).
    const front = attackStart([{ ...ended }], (ctx) => put(ctx, card(1, 0), stageSlot(1, 'FC')));
    const atCounter = attack(front, card(0, 0), 'FRONT').state;
    const fought = answer(atCounter, { kind: 'COUNTER', card: null });
    expect(played(fought.events, card(0, 0))).toBe(1);
  });

  it('このカードが手札から舞台に置かれたターン中、このカードがアタックした時: not when it was already on the stage', () => {
    const now: Ability = { type: 'AUTO', trigger: { on: 'ATTACKS', placedThisTurn: true }, effect: DRAW_ONE };
    const defs = cards({ '0:0': { abilities: [now] } });
    const fromHand = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), { player: 0, zone: 'hand' });
      noClimaxes(ctx, 0);
      noClimaxes(ctx, 1);
    }).state;
    const placed = answer(fromHand, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(fromHand, card(0, 0)), slot: 'FC' } }).state;
    let atAttack = answer(placed, { kind: 'MAIN', action: { type: 'PASS' } }).state;
    if (atAttack.pending?.kind === 'CLIMAX') atAttack = answer(atAttack, { kind: 'CLIMAX', card: null }).state;
    expect(played(attack(atAttack, card(0, 0), 'DIRECT').events, card(0, 0))).toBe(1);

    const already = scenario({ step: 'ATTACK_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      noClimaxes(ctx, 0);
      noClimaxes(ctx, 1);
    }).state;
    expect(played(attack(already, card(0, 0), 'DIRECT').events, card(0, 0))).toBe(0);
  });

  it('相手のCXがCX置場に置かれた時: the opponent’s climax triggers it, the player’s own does not', () => {
    const watch: Ability = { type: 'AUTO', trigger: { on: 'CLIMAX_PLACED', opponent: true }, effect: DRAW_ONE };
    const defs = cards({ '1:0': { abilities: [watch] }, '0:0': { abilities: [watch] } });
    const start = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(1, 0), stageSlot(1, 'FC'));
      put(ctx, card(0, 45), { player: 0, zone: 'hand' });
      // A red card in the level zone: the climax's colour condition.
      put(ctx, card(0, 30), { player: 0, zone: 'level' });
    }).state;
    const atClimax = answer(start, { kind: 'MAIN', action: { type: 'PASS' } }).state;
    const { events } = answer(atClimax, { kind: 'CLIMAX', card: oid(atClimax, card(0, 45)) });
    expect(played(events, card(1, 0))).toBe(1);
    expect(played(events, card(0, 0))).toBe(0);
  });
});

describe('そのアタック中、あなたはトリガーステップにトリガーチェックを2回行う', () => {
  it('two cards are checked, each goes to the stock; the next attack checks one again', () => {
    const twice: Ability = { type: 'AUTO', trigger: { on: 'ATTACKS' }, effect: [{ do: 'TRIGGER_CHECKS', count: 2 }] };
    const start = scenario({ step: 'ATTACK_START', defs: cards({ '0:0': { abilities: [twice] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), stageSlot(0, 'FL'));
      noClimaxes(ctx, 0);
      noClimaxes(ctx, 1);
    }).state;
    const first = attack(start, card(0, 0), 'DIRECT');
    expect(first.events.filter((e) => e.type === 'TRIGGER_CHECK')).toHaveLength(2);
    expect(first.state.zones[0].stock).toHaveLength(2);
    const second = attack(first.state, card(0, 1), 'DIRECT');
    expect(second.events.filter((e) => e.type === 'TRIGGER_CHECK')).toHaveLength(1);
    assertInvariants(second.state);
  });
});

describe('【永】 このカードは相手の効果に選ばれない', () => {
  it('the opponent’s effects cannot choose it; its own player’s effects can', () => {
    const shield: Ability = { type: 'CONT', untargetable: true, apply: [] };
    const chooseOpponent = act([{ do: 'CHOOSE', from: 'OPPONENT_STAGE', min: 0, max: 1 }, { do: 'ORIENT', target: { who: 'CHOSEN' }, to: 'REST' }]);
    const chooseOwn = act([{ do: 'CHOOSE', from: 'YOUR_STAGE', min: 0, max: 1 }, { do: 'ORIENT', target: { who: 'CHOSEN' }, to: 'REST' }]);
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [chooseOpponent, chooseOwn] }, '0:1': { abilities: [shield] }, '1:0': { abilities: [shield] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), stageSlot(0, 'FL'));
      put(ctx, card(1, 0), stageSlot(1, 'FC'));
      put(ctx, card(1, 1), stageSlot(1, 'FL'));
    }).state;
    expect(pending(activate(start, card(0, 0), 0).state, 'SELECT_CARDS').cards).toEqual([oid(start, card(1, 1))]);
    const own = pending(activate(start, card(0, 0), 1).state, 'SELECT_CARDS').cards;
    expect(own).toContain(oid(start, card(0, 1)));
  });
});

describe('costs and filters', () => {
  it('［【スタンド】しているこのカードを控え室に置く］ cannot be paid by a rested card', () => {
    const ability = act(DRAW_ONE, [{ pay: 'SELF_TO_WAITING_ROOM', standing: true }]);
    const setup = (orientation: 'STAND' | 'REST') =>
      scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [ability] } }) }, (ctx) => put(ctx, card(0, 0), stageSlot(0, 'FC'), { orientation })).state;
    expect(canActivate(setup('STAND'))).toBe(true);
    expect(canActivate(setup('REST'))).toBe(false);
  });

  it('このカードの正面のキャラのコストが2以上なら (costMin)', () => {
    const facing: Ability = { type: 'AUTO', trigger: { on: 'ATTACKS' }, condition: { if: 'FACING', filter: { costMin: 2 } }, effect: [{ do: 'MODIFY', target: { who: 'SELF' }, stat: 'POWER', amount: 6000 }] };
    const power = (cost: number) => {
      const start = scenario({ step: 'ATTACK_START', defs: cards({ '0:0': { abilities: [facing] }, '1:0': { cost } }) }, (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, 'FC'));
        put(ctx, card(1, 0), stageSlot(1, 'FC'));
        noClimaxes(ctx, 0);
        noClimaxes(ctx, 1);
      }).state;
      return getPower(attack(start, card(0, 0)).state, card(0, 0));
    };
    expect([power(2), power(3), power(1)]).toEqual([7000, 7000, 1000]);
  });

  it('…見て、…1枚まで選んで相手に見せ、手札に加え、… 手札に加えたなら、手札を1枚選び、控え室に置く', () => {
    const look = act([
      { do: 'LOOK_TOP', upTo: 1, pick: { kind: 'CHARACTER' }, reveal: true },
      { do: 'IF', condition: { if: 'DID' }, then: [{ do: 'CHOOSE', from: 'YOUR_HAND', min: 1, max: 1 }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'WAITING_ROOM' }] },
    ]);
    const setup = (topIsCharacter: boolean) =>
      scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [look] }, '0:49': topIsCharacter ? { kind: 'CHARACTER', level: 0, cost: 0, power: 1000, soul: 1 } : {} }) }, (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, 'FC'));
        put(ctx, card(0, 3), { player: 0, zone: 'hand' });
      }).state;
    const atLook = activate(setup(true), card(0, 0)).state;
    const atPick = answer(atLook, { kind: 'CONFIRM', accept: true }).state;
    const taken = answer(atPick, { kind: 'SELECT_CARDS', cards: [pending(atPick, 'SELECT_CARDS').cards[0]!] }).state;
    expect(pending(taken, 'SELECT_CARDS').cards).toHaveLength(2);
    // Not taken: no discard.
    const skipped = answer(atPick, { kind: 'SELECT_CARDS', cards: [] }).state;
    expect(skipped.pending?.kind).toBe('MAIN');
    expect(skipped.zones[0].hand).toEqual([card(0, 3)]);
  });

  it('自分の思い出置場の…を選び、…: face-up memory cards only; a card put on the stage from memory triggers 手札か思い出置場から舞台に置かれた時', () => {
    const fromMemory = act([{ do: 'CHOOSE', from: 'YOUR_MEMORY', min: 1, max: 1 }, { do: 'CHOOSE_SLOT', which: 'ANY' }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'CHOSEN_SLOT' }]);
    const arrived: Ability = { type: 'AUTO', trigger: { on: 'PLACED_ON_STAGE', from: 'HAND_OR_MEMORY' }, effect: DRAW_ONE };
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [fromMemory] }, '0:5': { abilities: [arrived] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 5), { player: 0, zone: 'memory' });
      put(ctx, card(0, 6), { player: 0, zone: 'memory' }, { face: 'DOWN' });
    }).state;
    const atChoose = activate(start, card(0, 0)).state;
    expect(pending(atChoose, 'SELECT_CARDS').cards).toEqual([oid(atChoose, card(0, 5))]);
    const atSlot = answer(atChoose, { kind: 'SELECT_CARDS', cards: [oid(atChoose, card(0, 5))] }).state;
    const result = answer(atSlot, { kind: 'SELECT_SLOT', slot: 'FL' });
    expect(result.state.zones[0].stage.FL).toEqual([card(0, 5)]);
    expect(played(result.events, card(0, 5))).toBe(1);
  });
});
