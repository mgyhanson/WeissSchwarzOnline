/**
 * Tests for the cards of batch 7, with the real card data: STS/W140-069, ANM/W138-027 (X from the shown card,
 * a climax as level 0), NIK/S135-047, NIK/S135-074 (two trigger checks, and what follows the second),
 * GUP/W141-056 (a cost with two choices), NIK/S135-104 (Choice and Gate may also choose a named card) and
 * BDY/W135-036 (集中 counting cards of given names).
 * Both players have every card of the booster under test, three copies each.
 */

import { describe, expect, it } from 'vitest';
import { type Choice, type Ctx, type Decision, type GameEvent, type GameState, type PlayerId, type SlotId, getInstance, getPower, stageSlot } from '@wso/game-engine';
import { getCard } from '../src/index';
import { readLine } from '../src/grammar';
import { answer, oid, pending, scenario, stackTop, take } from './helpers';
import type { RealScenario } from './helpers';

const id = (prefix: string) => (n: number): string => `${prefix}-${String(n).padStart(3, '0')}`;
const ANM = id('ANM/W138');
const NIK = id('NIK/S135');
const STS = id('STS/W140');
const GUP = id('GUP/W141');
const BDY = id('BDY/W135');

type SetName = 'ANM_W138' | 'NIK_S135' | 'STS_W140' | 'GUP_W141' | 'BDY_W135';
/** Cards used only as bodies (printed numbers and traits, no abilities). */
const BODIES: Record<SetName, string[]> = {
  ANM_W138: [ANM(1), ANM(52), ANM(6), ANM(12), ANM(2)],
  NIK_S135: [NIK(4), NIK(28), NIK(56), NIK(1), NIK(2)],
  STS_W140: [STS(1), STS(35), STS(68), STS(36), STS(37)],
  GUP_W141: [GUP(29), GUP(58), GUP(2)],
  BDY_W135: [BDY(1), BDY(29), BDY(33), BDY(72)],
};
const game = (set: SetName, options: Omit<RealScenario, 'sets'>, arrange: (ctx: Ctx) => void = () => {}): Run => ({
  state: scenario({ ...options, sets: [`${set}:ALL`, `${set}:ALL`], plain: BODIES[set] }, arrange).state,
  events: [],
});

/** A game position and the events since the scenario began. */
interface Run {
  state: GameState;
  events: GameEvent[];
}
const then = (run: Run, choice: Choice): Run => {
  const result = answer(run.state, choice);
  return { state: result.state, events: [...run.events, ...result.events] };
};
const at = (state: GameState, player: PlayerId, slot: SlotId): number => state.zones[player].stage[slot][0]!;
const names = (state: GameState, ids: readonly number[]): string[] => ids.map((i) => getInstance(state, i).cardId);
const cardOf = (state: GameState, objectId: number): string => state.instances.find((i) => i.objectId === objectId)!.cardId;
const offered = (run: Run): string[] => pending(run.state, 'SELECT_CARDS').cards.map((o) => cardOf(run.state, o)).sort();
const pick = (run: Run, cardIds: string[]): Run => {
  const decision = pending(run.state, 'SELECT_CARDS');
  const left = [...decision.cards];
  const chosen = cardIds.map((cardId) => {
    const k = left.findIndex((o) => cardOf(run.state, o) === cardId);
    if (k < 0) throw new Error(`${cardId} cannot be chosen; offered: ${offered(run).join(', ')}`);
    return left.splice(k, 1)[0]!;
  });
  return then(run, { kind: 'SELECT_CARDS', cards: chosen });
};
const accept = (run: Run): Run => then(run, { kind: 'CONFIRM', accept: true });
const decline = (run: Run): Run => then(run, { kind: 'CONFIRM', accept: false });
const option = (run: Run, chosen: string): Run => then(run, { kind: 'SELECT_OPTION', option: chosen });
const attack = (run: Run, slot: SlotId, type: 'FRONT' | 'SIDE' | 'DIRECT'): Run =>
  then(run, { kind: 'ATTACK', attack: { attacker: oid(run.state, at(run.state, 0, slot)), type } });
const play = (run: Run, cardId: string, slot: SlotId): Run => {
  const inHand = run.state.zones[0].hand.find((i) => getInstance(run.state, i).cardId === cardId)!;
  return then(run, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(run.state, inHand), slot } });
};
const asks = (run: Run, kind: Decision['kind'], prompt?: string): boolean =>
  run.state.pending?.kind === kind && (prompt === undefined || (run.state.pending as { prompt?: string }).prompt === prompt);
/** The opponent plays no counter. */
const noCounter = (run: Run): Run => (asks(run, 'COUNTER') ? then(run, { kind: 'COUNTER', card: null }) : run);

const checked = (run: Run): string[] => run.events.flatMap((e) => (e.type === 'TRIGGER_CHECK' ? [e.cardId] : []));
const dealt = (run: Run): number[] => run.events.flatMap((e) => (e.type === 'DAMAGE_DEALT' ? [e.amount] : []));
const paid = (run: Run): string[] => run.events.flatMap((e) => (e.type === 'CARD_MOVED' && e.reason === 'COST' ? [`${e.from.zone}>${e.to.zone}`] : []));
const WAITING_ROOM = { player: 0, zone: 'waitingRoom' } as const;
const HAND = { player: 0, zone: 'hand' } as const;
const STOCK = { player: 0, zone: 'stock' } as const;

const TWO_CHECKS = '【自】 このカードがアタックした時、そのアタック中、あなたはトリガーステップにトリガーチェックを2回行う。2回行ったら、あなたは自分のストックの上から1枚を、控え室に置く。';
const ability = (cardId: string, index: number) => getCard(cardId).def.abilities![index];

// ---------------------------------------------------------------------------------------------------------

describe('reading the new wordings', () => {
  const unknown = (line: string) => readLine(line).unknown.map((u) => u.part);

  it('トリガーチェックを2回行う。2回行ったら、…: the follow-up belongs to the checks, with the same count, right after them', () => {
    expect(readLine(TWO_CHECKS).line!.ability).toEqual({
      type: 'AUTO',
      trigger: { on: 'ATTACKS' },
      effect: [{ do: 'TRIGGER_CHECKS', count: 2, then: [{ do: 'STOCK_TOP_TO_WAITING_ROOM', count: 1 }] }],
    });
    expect(unknown(TWO_CHECKS.replace('2回行ったら', '3回行ったら'))).toEqual(['EFFECT']);
    expect(unknown('【自】 このカードがアタックした時、2回行ったら、あなたは1枚引く。')).toEqual(['EFFECT']);
    expect(unknown(TWO_CHECKS.replace('2回行う。', '2回行う。あなたは1枚引く。'))).toEqual(['EFFECT']);
    // What follows must itself be known.
    expect(unknown(TWO_CHECKS.replace('自分のストックの上から1枚を、控え室に置く', '踊る'))).toEqual(['EFFECT']);
  });

  it('［(2)か…］: two costs of which one is paid; the second must be a known cost', () => {
    const line = (cost: string) => `【自】［${cost}］ このカードがアタックした時、あなたはコストを払ってよい。そうしたら、あなたは1枚引く。`;
    expect(readLine(line('(2)か手札の「ケイ＆M4シャーマン 75mm砲搭載型」を1枚控え室に置く')).line!.ability).toMatchObject({
      cost: [{ pay: 'EITHER', options: [[{ pay: 'STOCK', count: 2 }], [{ pay: 'DISCARD', count: 1, filter: { name: 'ケイ＆M4シャーマン 75mm砲搭載型' } }]] }],
    });
    expect(unknown(line('(2)か踊る'))).toEqual(['COST']);
    // Not both: "(2) 手札を…" stays the usual cost of two parts.
    expect(readLine(line('(2) 手札を1枚控え室に置く')).line!.ability).toMatchObject({ cost: [{ pay: 'STOCK', count: 2 }, { pay: 'DISCARD', count: 1 }] });
    // An either-cost after another cost is not read (no such card yet).
    expect(unknown(line('(1) (2)か手札を1枚控え室に置く'))).toEqual(['COST']);
  });

  it('[[choice]]か[[gate]]の効果で自分の控え室の「…」を選んでよい: these two icons, your own waiting room, you', () => {
    const line = (who: string, icons: string, where: string) => `【永】 ${who}は${icons}の効果で${where}の控え室の「二千の分身 ナユタ」を選んでよい。`;
    expect(readLine(line('あなた', '[[choice.gif]]か[[gate.gif]]', '自分')).line!.ability).toEqual({
      type: 'CONT',
      triggerAlsoChooses: { icons: ['CHOICE', 'GATE'], filter: { name: '二千の分身 ナユタ' } },
      apply: [],
    });
    expect(readLine(line('あなた', '[[gate.gif]]', '自分')).line!.ability).toMatchObject({ triggerAlsoChooses: { icons: ['GATE'] } });
    for (const icon of ['draw', 'soul', 'treasure', 'comeback', 'standby', 'pool', 'shot', 'return']) {
      expect(readLine(line('あなた', `[[${icon}.gif]]か[[gate.gif]]`, '自分')).line).toBeNull();
    }
    expect(readLine(line('あなた', '[[choice.gif]]か[[gate.gif]]', '相手')).line).toBeNull();
    expect(readLine(line('相手', '[[choice.gif]]か[[gate.gif]]', '自分')).line).toBeNull();
  });

  it('（CXのレベルは0として扱う。ストック置場に置かないなら元に戻す）: a reminder only of the text it reminds of', () => {
    const line = (follow: string, reminder: string) =>
      `【自】 このカードがアタックした時、あなたは自分の山札の上から1枚を公開し、自分の控え室のレベルＸ以下のキャラを1枚選び、手札に戻す。Ｘが3以上なら、${follow}。Ｘは公開されたカードのレベルに等しい。${reminder}`;
    const STOCK_IT = 'あなたは自分の山札の上から1枚までを、ストック置場に置く';
    expect(readLine(line(STOCK_IT, '（CXのレベルは0として扱う。ストック置場に置かないなら元に戻す）')).line!.ability).toMatchObject({
      effect: [{ do: 'SHOW_TOP' }, { do: 'CHOOSE', levelMaxX: true }, { do: 'MOVE', to: 'HAND' }, { do: 'IF', condition: { if: 'X', min: 3 }, then: [{ do: 'DECK_TOP', count: 1, to: 'STOCK', upTo: true }] }],
    });
    expect(readLine(line('あなたは1枚引く', '（CXのレベルは0として扱う。ストック置場に置かないなら元に戻す）')).line).toBeNull();
    expect(readLine('【自】 このカードがアタックした時、あなたは1枚引く。（CXのレベルは0として扱う。ストック置場に置かないなら元に戻す）').line).toBeNull();
  });

  it('集中 …それらのカードの「…」か「…」1枚につき: cards of these names are counted instead of climaxes', () => {
    const line = (per: string) => `【起】 集中 ［(1) このカードを【レスト】する］ あなたは自分の山札の上から5枚をめくり、控え室に置く。それらのカードの${per}1枚につき、あなたは自分の控え室のキャラを1枚まで選び、手札に戻す。`;
    expect(readLine(line('「愛は衝動」か「TearJerker」')).line!.ability).toMatchObject({ effect: [{ do: 'BRAINSTORM', count: 5, per: { names: ['愛は衝動', 'TearJerker'] } }] });
    expect(readLine(line('CX')).line!.ability).toMatchObject({ effect: [{ do: 'BRAINSTORM', count: 5, per: { kind: 'CLIMAX' } }] });
    expect(readLine(line('「愛は衝動」と「TearJerker」')).line).toBeNull();
    expect(readLine(line('踊るカード')).line).toBeNull();
    expect(ability(BDY(36), 1)).toMatchObject({ keywords: ['CX_COMBO', 'BRAINSTORM'], cost: [{ pay: 'STOCK', count: 1 }, { pay: 'REST_SELF' }], effect: [{ do: 'BRAINSTORM', count: 5, per: { names: ['愛は衝動', 'TearJerker'] } }] });
  });

  it('the six cards: the data of the new parts', () => {
    expect(ability(NIK(74), 1)).toEqual(readLine(TWO_CHECKS).line!.ability);
    expect(ability(NIK(47), 1)).toMatchObject({
      trigger: { on: 'PHASE_START', phase: 'CLIMAX', turn: 'YOURS' },
      effect: [{ do: 'CHOOSE', from: 'YOUR_STAGE', min: 0, max: 2 }, { do: 'GRANT', ability: readLine(TWO_CHECKS).line!.ability }],
    });
    expect(ability(GUP(56), 1)).toMatchObject({
      trigger: { on: 'BATTLE_OPPONENT_REVERSED' },
      cost: [{ pay: 'EITHER', options: [[{ pay: 'STOCK', count: 2 }], [{ pay: 'DISCARD', count: 1, filter: { name: getCard(GUP(56)).def.name } }]] }],
    });
    expect(ability(NIK(104), 0)).toEqual({ type: 'CONT', triggerAlsoChooses: { icons: ['CHOICE', 'GATE'], filter: { name: getCard(NIK(12)).def.name } }, apply: [] });
    expect(ability(STS(69), 1)).toMatchObject({
      trigger: { on: 'ATTACK_END' },
      effect: [{ do: 'SHOW_TOP' }, { min: 0, max: 1, levelMaxX: true }, { to: 'HAND' }, { do: 'IF', condition: { if: 'ALL', of: [{ if: 'MARKERS', of: 'SELF', min: 1 }, { if: 'X', max: 0 }] } }],
    });
    expect(ability(ANM(27), 0)).toMatchObject({
      cost: [{ pay: 'DISCARD', count: 1 }],
      effect: [{ do: 'SHOW_TOP' }, { min: 1, max: 1, levelMaxX: true }, { to: 'HAND' }, { do: 'IF', condition: { if: 'X', min: 3 } }],
    });
  });
});

// ---------------------------------------------------------------------------------------------------------

describe('NIK/S135-074 モラン - オフ・デューティー・クイーン', () => {
  const setup = (attacker: string) => {
    let tops: number[] = [];
    const run = game('NIK_S135', { step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, attacker, stageSlot(0, 'FC'));
      take(ctx, 0, NIK(56), STOCK);
      tops = stackTop(ctx, 0, [NIK(4), NIK(28), NIK(56)]);
      stackTop(ctx, 1, [NIK(4), NIK(4), NIK(28), NIK(28)]);
    });
    return { run, tops };
  };

  it('T-ATK-024 / CR-7.3.1.2.3: attacking, two trigger checks; after the second, the top stock card goes to the waiting room', () => {
    const { run, tops } = setup(NIK(74));
    const after = attack(run, 'FC', 'DIRECT');
    expect(checked(after)).toEqual([NIK(4), NIK(28)]);
    // The first checked card stays in the stock; the second (on top) is the one put into the waiting room.
    expect(after.state.zones[0].stock.slice(1)).toEqual([tops[0]]);
    expect(after.state.zones[0].waitingRoom).toEqual([tops[1]]);
    expect(after.state.zones[0].deck[after.state.zones[0].deck.length - 1]).toBe(tops[2]);
    expect(after.state.attack).toBeNull();
  });

  it('another character attacks: one check, the stock keeps it', () => {
    const { run, tops } = setup(NIK(1));
    const after = attack(run, 'FC', 'DIRECT');
    expect(checked(after)).toEqual([NIK(4)]);
    expect(after.state.zones[0].stock.slice(1)).toEqual([tops[0]]);
    expect(after.state.zones[0].waitingRoom).toEqual([]);
  });

  it('with two or more other 《NIKKE》 characters: power +1500 and アンコール by a hand character', () => {
    const power = (others: number) => {
      const { state } = game('NIK_S135', { step: 'MAIN_START' }, (ctx) => {
        take(ctx, 0, NIK(74), stageSlot(0, 'FC'));
        if (others >= 1) take(ctx, 0, NIK(4), stageSlot(0, 'FL'));
        if (others >= 2) take(ctx, 0, NIK(28), stageSlot(0, 'FR'));
      });
      return getPower(state, at(state, 0, 'FC'));
    };
    expect(power(2) - power(1)).toBe(1500);
    expect(power(1)).toBe(getCard(NIK(74)).def.power);
  });
});

describe('NIK/S135-047 ドラー - ダークローズ', () => {
  const setup = (slot: SlotId) => {
    let tops: number[] = [];
    const run = game('NIK_S135', { step: 'CLIMAX_START' }, (ctx) => {
      take(ctx, 0, NIK(47), stageSlot(0, slot));
      take(ctx, 0, NIK(4), stageSlot(0, 'FL'));
      take(ctx, 0, NIK(28), stageSlot(0, 'FR'));
      take(ctx, 0, NIK(56), STOCK);
      tops = stackTop(ctx, 0, [NIK(4), NIK(28), NIK(56), NIK(4), NIK(28)]);
      stackTop(ctx, 1, [NIK(4), NIK(4), NIK(28), NIK(28), NIK(56), NIK(56), NIK(1), NIK(1)]);
    });
    return { run, tops };
  };

  it('at the start of your climax phase, in the front row: up to two of your characters get the ability for the turn', () => {
    const { run, tops } = setup('FC');
    expect(pending(run.state, 'SELECT_CARDS')).toMatchObject({ player: 0, min: 0, max: 2 });
    expect(offered(run)).toEqual([NIK(4), NIK(28), NIK(47)].sort());
    let now = pick(run, [NIK(47), NIK(4)]);
    now = then(now, { kind: 'CLIMAX', card: null });

    // The character given the ability: two checks, then the top stock card to the waiting room.
    now = attack({ ...now, events: [] }, 'FL', 'DIRECT');
    expect(checked(now)).toEqual([NIK(4), NIK(28)]);
    expect(now.state.zones[0].stock.slice(1)).toEqual([tops[0]]);
    expect(now.state.zones[0].waitingRoom).toEqual([tops[1]]);

    // The one not chosen: one check; the count of the attack before does not reach it.
    now = attack({ ...now, events: [] }, 'FR', 'DIRECT');
    expect(checked(now)).toEqual([NIK(56)]);
    expect(now.state.zones[0].stock.slice(1)).toEqual([tops[0], tops[2]]);
    expect(now.state.zones[0].waitingRoom).toEqual([tops[1]]);

    // The card itself, also chosen: again two checks of its own and one card to the waiting room.
    now = attack({ ...now, events: [] }, 'FC', 'DIRECT');
    expect(checked(now)).toEqual([NIK(4), NIK(28)]);
    expect(now.state.zones[0].stock.slice(1)).toEqual([tops[0], tops[2], tops[3]]);
    expect(now.state.zones[0].waitingRoom).toEqual([tops[1], tops[4]]);
  });

  it('nobody chosen: no character has it; in the back row: nothing is asked', () => {
    const { run } = setup('FC');
    let now = pick(run, []);
    now = then(now, { kind: 'CLIMAX', card: null });
    now = attack({ ...now, events: [] }, 'FC', 'DIRECT');
    expect(checked(now)).toHaveLength(1);
    expect(now.state.zones[0].waitingRoom).toEqual([]);

    expect(asks(setup('BL').run, 'CLIMAX')).toBe(true);
  });

  it('placed from the hand: one of your 《NIKKE》 characters gets +1500 for the turn', () => {
    let run = game('NIK_S135', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, NIK(47), HAND);
      take(ctx, 0, NIK(4), stageSlot(0, 'FL'));
      take(ctx, 0, NIK(28), { player: 0, zone: 'level' });
    });
    const before = getPower(run.state, at(run.state, 0, 'FL'));
    run = play(run, NIK(47), 'FC');
    run = pick(run, [NIK(4)]);
    expect(getPower(run.state, at(run.state, 0, 'FL'))).toBe(before + 1500);
  });
});

// ---------------------------------------------------------------------------------------------------------

describe('GUP/W141-056 ケイ＆M4シャーマン 75mm砲搭載型', () => {
  interface Setup {
    /** Stock before the attack; the trigger check adds one card. */
    stock: number;
    /** A second copy of the card in the hand. */
    named: boolean;
    climaxAtBottom?: boolean;
    type?: 'FRONT' | 'SIDE';
  }
  const setup = ({ stock, named, climaxAtBottom = false, type = 'FRONT' }: Setup): Run => {
    const run = game('GUP_W141', { step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, GUP(56), stageSlot(0, 'FC'));
      take(ctx, 1, GUP(29), stageSlot(1, 'FC'));
      for (let k = 0; k < stock; k++) take(ctx, 0, GUP(58), STOCK);
      if (named) take(ctx, 0, GUP(56), HAND);
      take(ctx, 0, GUP(2), HAND);
      stackTop(ctx, 0, [GUP(29), GUP(29)]);
      stackTop(ctx, 1, [GUP(58), GUP(58), GUP(58), GUP(2), GUP(2), GUP(2)]);
      if (climaxAtBottom) {
        const deck = ctx.state.zones[1].deck;
        const climax = deck.findIndex((i) => getInstance(ctx.state, i).cardId === GUP(26));
        deck.unshift(deck.splice(climax, 1)[0]!);
      }
    });
    // The attack up to the battle: the opponent's character is reversed.
    return noCounter(attack(run, 'FC', type));
  };
  const bottomFive = (run: Run): number =>
    run.events.filter((e) => e.type === 'CARD_MOVED' && e.from.zone === 'deck' && e.from.player === 1 && e.to.zone === 'waitingRoom' && e.reason !== 'DAMAGE_CANCEL').length;

  it('T-COST-006 / CR-8.4.2.2.1: neither cost can be paid: nothing is asked, nothing happens', () => {
    const run = setup({ stock: 0, named: false });
    expect(asks(run, 'CONFIRM', 'PAY_COST')).toBe(false);
    expect(paid(run)).toEqual([]);
    expect(bottomFive(run)).toBe(0);
    expect(run.state.zones[0].stock).toHaveLength(1);
  });

  it('only (2): paid from the stock without a question of which', () => {
    const asked = setup({ stock: 1, named: false });
    expect(pending(asked.state, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST', cardId: GUP(56) });
    const run = accept(asked);
    expect(paid(run)).toEqual(['stock>waitingRoom', 'stock>waitingRoom']);
    expect(run.state.zones[0].stock).toEqual([]);
    expect(names(run.state, run.state.zones[0].hand)).toEqual([GUP(2)]);
    // The opponent's five bottom cards go to the waiting room; no climax among them, no damage beyond the attack's.
    expect(bottomFive(run)).toBe(5);
    expect(dealt(run)).toHaveLength(1);
  });

  it('only the card of the same name: it is the only card that can be discarded', () => {
    const asked = accept(setup({ stock: 0, named: true }));
    expect(pending(asked.state, 'SELECT_CARDS').prompt).toBe('COST_DISCARD');
    expect(offered(asked)).toEqual([GUP(56)]);
    const run = pick(asked, [GUP(56)]);
    expect(paid(run)).toEqual(['hand>waitingRoom']);
    expect(run.state.zones[0].stock).toHaveLength(1);
    expect(names(run.state, run.state.zones[0].hand)).toEqual([GUP(2)]);
    expect(bottomFive(run)).toBe(5);
  });

  it('both: the player chooses, and only the chosen one is paid', () => {
    const asked = accept(setup({ stock: 1, named: true }));
    expect(pending(asked.state, 'SELECT_OPTION')).toMatchObject({ player: 0, prompt: 'COST_CHOICE', options: ['COST_1', 'COST_2'] });
    const byStock = option(asked, 'COST_1');
    expect(paid(byStock)).toEqual(['stock>waitingRoom', 'stock>waitingRoom']);
    expect(names(byStock.state, byStock.state.zones[0].hand).sort()).toEqual([GUP(2), GUP(56)].sort());
    expect(bottomFive(byStock)).toBe(5);

    const byCard = pick(option(asked, 'COST_2'), [GUP(56)]);
    expect(paid(byCard)).toEqual(['hand>waitingRoom']);
    expect(byCard.state.zones[0].stock).toHaveLength(2);
    expect(bottomFive(byCard)).toBe(5);
  });

  it('declined: nothing is paid and nothing happens; a side attack reverses nobody', () => {
    const run = decline(setup({ stock: 1, named: true }));
    expect(paid(run)).toEqual([]);
    expect(bottomFive(run)).toBe(0);
    expect(run.state.zones[0].stock).toHaveLength(2);

    const side = setup({ stock: 1, named: true, type: 'SIDE' });
    expect(asks(side, 'CONFIRM', 'PAY_COST')).toBe(false);
    expect(bottomFive(side)).toBe(0);
  });

  it('a climax among the five: 1 damage to the opponent (it can be cancelled)', () => {
    const run = accept(setup({ stock: 1, named: false, climaxAtBottom: true }));
    expect(bottomFive(run)).toBe(5);
    // The attack's damage, then the effect's 1.
    expect(dealt(run)).toHaveLength(2);
    expect(dealt(run)[1]).toBe(1);
    const without = accept(setup({ stock: 1, named: false }));
    expect(run.state.zones[1].clock.length).toBe(without.state.zones[1].clock.length + 1);
  });

  it('all your characters 《戦車道》: +5500, and +4000 in your turn', () => {
    const { state } = game('GUP_W141', { step: 'MAIN_START' }, (ctx) => take(ctx, 0, GUP(56), stageSlot(0, 'FC')));
    expect(getPower(state, at(state, 0, 'FC'))).toBe(getCard(GUP(56)).def.power! + 5500 + 4000);
  });
});

// ---------------------------------------------------------------------------------------------------------

describe('NIK/S135-104 紅蓮 - レーサーズハイ', () => {
  const NAYUTA = NIK(12);
  const CHOICE_CLIMAX = NIK(24);
  const GATE_CLIMAX = NIK(110);
  interface Setup {
    /** Whose stage the card is on; null: nobody's. */
    holder: 0 | 1 | null;
    top: string;
    nayuta?: boolean;
    attacker?: string;
  }
  const setup = ({ holder, top, nayuta = true, attacker = NIK(4) }: Setup): Run => {
    const run = game('NIK_S135', { step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, attacker, stageSlot(0, 'FC'));
      if (holder !== null) take(ctx, holder, NIK(104), stageSlot(holder, 'BL'));
      if (nayuta) take(ctx, 0, NAYUTA, WAITING_ROOM);
      take(ctx, 0, NIK(28), WAITING_ROOM);
      take(ctx, 1, NAYUTA, { player: 1, zone: 'waitingRoom' });
      take(ctx, 0, NIK(56), STOCK);
      stackTop(ctx, 0, [top, NIK(4), NIK(28)]);
      stackTop(ctx, 1, [NIK(4), NIK(4), NIK(28), NIK(28), NIK(56), NIK(56)]);
    });
    return attack(run, 'FC', 'DIRECT');
  };

  it('the icons of the cards used here', () => {
    expect(getCard(CHOICE_CLIMAX).def.triggers).toEqual(['CHOICE']);
    expect(getCard(GATE_CLIMAX).def.triggers).toEqual(['SOUL', 'GATE']);
    expect(getCard(NIK(2)).def.triggers).toEqual(['SOUL']);
    expect(getCard(NAYUTA).def).toMatchObject({ kind: 'CHARACTER', triggers: [] });
  });

  it('T-TRG-017 / CR-4.14.2.11: Choice may choose 「二千の分身 ナユタ」 in your waiting room, to the hand or the stock', () => {
    const asked = setup({ holder: 0, top: CHOICE_CLIMAX });
    expect(pending(asked.state, 'SELECT_CARDS')).toMatchObject({ player: 0, prompt: 'TRIGGER_CHOICE', min: 0, max: 1 });
    // Only your own copy; not the other character, not the opponent's copy.
    expect(offered(asked)).toEqual([NAYUTA]);
    expect(getInstance(asked.state, asked.state.instances.find((i) => i.objectId === pending(asked.state, 'SELECT_CARDS').cards[0])!.instanceId).location).toMatchObject(WAITING_ROOM);
    const chosen = pick(asked, [NAYUTA]);
    expect(pending(chosen.state, 'SELECT_OPTION').options).toEqual(['HAND', 'STOCK']);
    const toHand = option(chosen, 'HAND');
    expect(names(toHand.state, toHand.state.zones[0].hand)).toEqual([NAYUTA]);
    const toStock = option(chosen, 'STOCK');
    // Under the checked climax, which goes to the stock after the icon's effect.
    expect(names(toStock.state, toStock.state.zones[0].stock)).toEqual([NIK(56), NAYUTA, CHOICE_CLIMAX]);
    // May also be declined.
    const none = pick(asked, []);
    expect(names(none.state, none.state.zones[0].waitingRoom)).toContain(NAYUTA);
  });

  it('T-TRG-018 / CR-4.14.2.9: Gate may choose it too, to the hand', () => {
    let run = setup({ holder: 0, top: GATE_CLIMAX });
    expect(pending(run.state, 'SELECT_OPTION').prompt).toBe('TRIGGER_ORDER');
    run = option(run, 'GATE');
    expect(pending(run.state, 'SELECT_CARDS')).toMatchObject({ player: 0, prompt: 'TRIGGER_GATE', min: 0, max: 1 });
    expect(offered(run)).toEqual([NAYUTA]);
    run = pick(run, [NAYUTA]);
    expect(names(run.state, run.state.zones[0].hand)).toEqual([NAYUTA]);
    expect(names(run.state, run.state.zones[0].stock)).toEqual([NIK(56), GATE_CLIMAX]);
  });

  it('not without the card on your stage, not with it on the opponent’s, not when 「二千の分身 ナユタ」 is not there', () => {
    for (const holder of [null, 1] as const) {
      expect(asks(setup({ holder, top: CHOICE_CLIMAX }), 'SELECT_CARDS')).toBe(false);
      const gate = option(setup({ holder, top: GATE_CLIMAX }), 'GATE');
      expect(asks(gate, 'SELECT_CARDS')).toBe(false);
    }
    expect(asks(setup({ holder: 0, top: CHOICE_CLIMAX, nayuta: false }), 'SELECT_CARDS')).toBe(false);
    expect(asks(option(setup({ holder: 0, top: GATE_CLIMAX, nayuta: false }), 'GATE'), 'SELECT_CARDS')).toBe(false);
  });

  it('other icons are as usual: a soul icon chooses nothing', () => {
    const run = setup({ holder: 0, top: NIK(2) });
    expect(checked(run)).toEqual([NIK(2)]);
    expect(asks(run, 'SELECT_CARDS')).toBe(false);
    expect(names(run.state, run.state.zones[0].waitingRoom)).toContain(NAYUTA);
  });

  it('with NIK/S135-074: Choice in the first of two checks, then the follow-up after the second', () => {
    let run = setup({ holder: 0, top: CHOICE_CLIMAX, attacker: NIK(74) });
    run = option(pick(run, [NAYUTA]), 'STOCK');
    expect(checked(run)).toEqual([CHOICE_CLIMAX, NIK(4)]);
    // Stock: ナユタ, the climax, then the second checked card, which the follow-up puts into the waiting room.
    expect(names(run.state, run.state.zones[0].stock)).toEqual([NIK(56), NAYUTA, CHOICE_CLIMAX]);
    expect(names(run.state, run.state.zones[0].waitingRoom)).toEqual([NIK(28), NIK(4)]);
  });

  it('attacking: +1500 for each other 《NIKKE》 character of yours; 集中: up to two 「二千の分身 ナユタ」 for each climax', () => {
    const attacked = game('NIK_S135', { step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, NIK(104), stageSlot(0, 'FC'));
      // One of the others in the front row, so that the turn goes on after this attack.
      take(ctx, 0, NIK(4), stageSlot(0, 'FL'));
      take(ctx, 0, NIK(28), stageSlot(0, 'BR'));
      stackTop(ctx, 0, [NIK(4)]);
      stackTop(ctx, 1, [NIK(4), NIK(4), NIK(28)]);
    });
    const before = getPower(attacked.state, at(attacked.state, 0, 'FC'));
    const after = attack(attacked, 'FC', 'DIRECT');
    expect(asks(after, 'ATTACK')).toBe(true);
    expect(getPower(after.state, at(after.state, 0, 'FC'))).toBe(before + 3000);

    let run = game('NIK_S135', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, NIK(104), stageSlot(0, 'FC'));
      take(ctx, 0, NIK(4), stageSlot(0, 'BL'));
      take(ctx, 0, NIK(28), stageSlot(0, 'BR'));
      take(ctx, 0, NIK(56), STOCK);
      for (let k = 0; k < 3; k++) take(ctx, 0, NAYUTA, WAITING_ROOM);
      stackTop(ctx, 0, [NIK(4), CHOICE_CLIMAX, NIK(28), NIK(56), NIK(4)]);
    });
    run = then(run, { kind: 'MAIN', action: { type: 'ACTIVATE', card: oid(run.state, at(run.state, 0, 'FC')), ability: 2 } });
    run = pick(run, [NIK(4), NIK(28)]);
    expect(pending(run.state, 'SELECT_CARDS')).toMatchObject({ min: 0, max: 2 });
    expect([...new Set(offered(run))]).toEqual([NAYUTA]);
    run = pick(run, [NAYUTA, NAYUTA]);
    expect(names(run.state, run.state.zones[0].hand)).toEqual([NAYUTA, NAYUTA]);
  });
});

// ---------------------------------------------------------------------------------------------------------

describe('STS/W140-069 次から本気だす ナズナ', () => {
  interface Setup {
    top: string;
    climax?: boolean;
    others?: number;
    marker?: boolean;
  }
  const setup = ({ top, climax = true, others = 2, marker = true }: Setup) => {
    let tops: number[] = [];
    const run = game('STS_W140', { step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, STS(69), stageSlot(0, 'FC'));
      if (others >= 1) take(ctx, 0, STS(1), stageSlot(0, 'BL'));
      if (others >= 2) take(ctx, 0, STS(35), stageSlot(0, 'BR'));
      if (climax) take(ctx, 0, STS(97), { player: 0, zone: 'climax' });
      if (marker) take(ctx, 0, STS(68), { player: 0, zone: 'marker', slot: 'FC' });
      for (const c of [STS(1), STS(36), STS(37)]) take(ctx, 0, c, WAITING_ROOM);
      // The trigger check takes the first; the second is the card shown at the end of the attack.
      tops = stackTop(ctx, 0, [STS(35), top]);
      stackTop(ctx, 1, [STS(1), STS(1), STS(35), STS(35), STS(68), STS(68)]);
    });
    return { run: attack(run, 'FC', 'DIRECT'), shown: tops[1]! };
  };
  const topOfDeck = (run: Run): number => run.state.zones[0].deck[run.state.zones[0].deck.length - 1]!;

  it('the levels of the cards used here', () => {
    expect([STS(1), STS(36), STS(37)].map((c) => getCard(c).def.level)).toEqual([0, 1, 3]);
    expect(getCard(STS(31)).def).toMatchObject({ kind: 'CLIMAX', level: null });
    expect(getCard(STS(97)).def.name).toBe('甘く咲く時間');
  });

  it('T-CARD-012 / CR-2.19.1: a climax is shown: X is 0; with a marker, the shown card may go to the stock', () => {
    const { run, shown } = setup({ top: STS(31) });
    expect(run.events.some((e) => e.type === 'CARD_REVEALED' && e.cardId === STS(31))).toBe(true);
    // Level 0 or lower only; up to one.
    expect(pending(run.state, 'SELECT_CARDS')).toMatchObject({ player: 0, min: 0, max: 1 });
    expect(offered(run)).toEqual([STS(1)]);
    const chose = pick(run, [STS(1)]);
    expect(names(chose.state, chose.state.zones[0].hand)).toEqual([STS(1)]);
    expect(pending(chose.state, 'CONFIRM').prompt).toBe('DECK_TOP_NEXT');
    const before = chose.state.zones[0].stock.length;
    const put = accept(chose);
    expect(put.state.zones[0].stock[before]).toBe(shown);
    // Not put into the stock: back where it was, no longer shown.
    const kept = decline(chose);
    expect(topOfDeck(kept)).toBe(shown);
    expect(getInstance(kept.state, shown).revealed).toBe(false);
    expect(kept.state.zones[0].stock).toHaveLength(before);
  });

  it('a level 0 character is shown: the same; choosing nobody is allowed', () => {
    const { run, shown } = setup({ top: STS(68) });
    expect(offered(run)).toEqual([STS(1)]);
    const none = pick(run, []);
    expect(none.state.zones[0].hand).toEqual([]);
    expect(pending(none.state, 'CONFIRM').prompt).toBe('DECK_TOP_NEXT');
    expect(topOfDeck(none)).toBe(shown);
  });

  it('a level 1 character is shown: level 1 or lower may return; X is not 0 or less, so nothing goes to the stock', () => {
    const { run, shown } = setup({ top: STS(36) });
    expect(offered(run)).toEqual([STS(1), STS(36)].sort());
    const chose = pick(run, [STS(36)]);
    expect(asks(chose, 'CONFIRM')).toBe(false);
    expect(topOfDeck(chose)).toBe(shown);
    expect(getInstance(chose.state, shown).revealed).toBe(false);
  });

  it('a level 3 character is shown: all three may return', () => {
    const { run } = setup({ top: STS(37) });
    expect(offered(run)).toEqual([STS(1), STS(36), STS(37)].sort());
  });

  it('X is 0 but there is no marker under this card: nothing goes to the stock', () => {
    const { run, shown } = setup({ top: STS(31), marker: false });
    const chose = pick(run, [STS(1)]);
    expect(asks(chose, 'CONFIRM')).toBe(false);
    expect(topOfDeck(chose)).toBe(shown);
  });

  it('without the climax, or with one other 《巡遊者》/《魔王》 character only: nothing is shown', () => {
    for (const run of [setup({ top: STS(31), climax: false }).run, setup({ top: STS(31), others: 1 }).run]) {
      expect(run.events.some((e) => e.type === 'CARD_REVEALED')).toBe(false);
      expect(asks(run, 'SELECT_CARDS')).toBe(false);
    }
  });

  it('in your turn: power +2000', () => {
    const mine = game('STS_W140', { step: 'MAIN_START' }, (ctx) => take(ctx, 0, STS(69), stageSlot(0, 'FC')));
    expect(getPower(mine.state, at(mine.state, 0, 'FC'))).toBe(getCard(STS(69)).def.power! + 2000);
    const theirs = game('STS_W140', { step: 'MAIN_START', turnPlayer: 1 }, (ctx) => take(ctx, 0, STS(69), stageSlot(0, 'FC')));
    expect(getPower(theirs.state, at(theirs.state, 0, 'FC'))).toBe(getCard(STS(69)).def.power!);
  });
});

describe('ANM/W138-027 “風の向こう側で”六花', () => {
  const setup = (top: string, fodder = true) => {
    let shown = -1;
    const run = game('ANM_W138', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, ANM(27), HAND);
      if (fodder) take(ctx, 0, ANM(1), HAND);
      for (const c of [ANM(52), ANM(6), ANM(12), ANM(2)]) take(ctx, 0, c, WAITING_ROOM);
      shown = stackTop(ctx, 0, [top])[0]!;
    });
    return { run: play(run, ANM(27), 'FC'), shown };
  };
  const paying = (top: string) => {
    const { run, shown } = setup(top);
    expect(pending(run.state, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST', cardId: ANM(27) });
    return { run: pick(accept(run), [ANM(1)]), shown };
  };
  const topOfDeck = (run: Run): number => run.state.zones[0].deck[run.state.zones[0].deck.length - 1]!;

  it('the levels of the cards used here', () => {
    expect([ANM(1), ANM(52), ANM(6), ANM(12), ANM(2)].map((c) => getCard(c).def.level)).toEqual([0, 0, 1, 2, 3]);
    expect(getCard(ANM(24)).def).toMatchObject({ kind: 'CLIMAX', level: null });
  });

  it('T-CARD-013 / CR-2.19.1: a level 3 card is shown: any character of level 3 or lower returns, and the shown card may go to the stock', () => {
    const { run, shown } = paying(ANM(2));
    expect(run.events.some((e) => e.type === 'CARD_REVEALED' && e.cardId === ANM(2))).toBe(true);
    expect(pending(run.state, 'SELECT_CARDS')).toMatchObject({ player: 0, min: 1, max: 1 });
    // The discarded card is in the waiting room by now.
    expect(offered(run)).toEqual([ANM(1), ANM(52), ANM(6), ANM(12), ANM(2)].sort());
    const chose = pick(run, [ANM(2)]);
    expect(names(chose.state, chose.state.zones[0].hand)).toEqual([ANM(2)]);
    expect(pending(chose.state, 'CONFIRM').prompt).toBe('DECK_TOP_NEXT');
    expect(accept(chose).state.zones[0].stock).toEqual([shown]);
    const kept = decline(chose);
    expect(kept.state.zones[0].stock).toEqual([]);
    expect(topOfDeck(kept)).toBe(shown);
    expect(getInstance(kept.state, shown).revealed).toBe(false);
  });

  it('a climax is shown: X is 0: only level 0 characters, and nothing goes to the stock', () => {
    const { run, shown } = paying(ANM(24));
    expect(offered(run)).toEqual([ANM(1), ANM(52)].sort());
    const chose = pick(run, [ANM(52)]);
    expect(asks(chose, 'MAIN')).toBe(true);
    expect(topOfDeck(chose)).toBe(shown);
    expect(chose.state.zones[0].stock).toEqual([]);
  });

  it('a level 2 card is shown: level 2 or lower, and X is not 3 or more', () => {
    const { run, shown } = paying(ANM(12));
    expect(offered(run)).toEqual([ANM(1), ANM(52), ANM(6), ANM(12)].sort());
    const chose = pick(run, [ANM(12)]);
    expect(asks(chose, 'MAIN')).toBe(true);
    expect(topOfDeck(chose)).toBe(shown);
  });

  it('the cost is not paid, or cannot be paid: nothing is shown', () => {
    const { run } = setup(ANM(2));
    const declined = decline(run);
    expect(declined.events.some((e) => e.type === 'CARD_REVEALED')).toBe(false);
    expect(names(declined.state, declined.state.zones[0].hand)).toEqual([ANM(1)]);
    const noHand = setup(ANM(2), false).run;
    expect(asks(noHand, 'MAIN')).toBe(true);
    expect(noHand.events.some((e) => e.type === 'CARD_REVEALED')).toBe(false);
  });
});

describe('BDY/W135-036 “新宿着陸計画”藤都子', () => {
  const LOVE = BDY(26);
  const TEAR = BDY(62);
  const OTHER_CLIMAX = BDY(27);

  it('the cards used here', () => {
    expect([LOVE, TEAR].map((c) => getCard(c).def.name)).toEqual(['愛は衝動', 'TearJerker']);
    expect(getCard(OTHER_CLIMAX).def.kind).toBe('CLIMAX');
    expect(getCard(BDY(29)).def.name).toBe('何度だって夢を見る 千石ユノ');
    expect(getCard(BDY(1)).def.traits).toContain('夢限大みゅーたいぷ');
    expect(getCard(BDY(72)).def.traits).not.toContain('夢限大みゅーたいぷ');
  });

  it('集中: for each 「愛は衝動」 or 「TearJerker」 among the five, up to one 《夢限大みゅーたいぷ》 character returns', () => {
    const setup = (five: string[]): Run => {
      const run = game('BDY_W135', { step: 'MAIN_START' }, (ctx) => {
        take(ctx, 0, BDY(36), stageSlot(0, 'FC'));
        take(ctx, 0, BDY(33), STOCK);
        take(ctx, 0, BDY(72), WAITING_ROOM);
        take(ctx, 0, BDY(29), WAITING_ROOM);
        stackTop(ctx, 0, five);
      });
      return then(run, { kind: 'MAIN', action: { type: 'ACTIVATE', card: oid(run.state, at(run.state, 0, 'FC')), ability: 1 } });
    };
    // Both named climaxes and another climax: two choices, not three.
    let run = setup([LOVE, TEAR, OTHER_CLIMAX, BDY(1), BDY(72)]);
    expect(paid(run)).toEqual(['stock>waitingRoom']);
    expect(getInstance(run.state, at(run.state, 0, 'FC')).orientation).toBe('REST');
    expect(pending(run.state, 'SELECT_CARDS')).toMatchObject({ player: 0, min: 0, max: 1 });
    // The five are in the waiting room by now; only 《夢限大みゅーたいぷ》 characters are offered (the paid stock card is one).
    expect(offered(run)).toEqual([BDY(1), BDY(29), BDY(33)].sort());
    run = pick(run, [BDY(29)]);
    expect(offered(run)).toEqual([BDY(1), BDY(33)].sort());
    run = pick(run, []);
    expect(asks(run, 'MAIN')).toBe(true);
    expect(names(run.state, run.state.zones[0].hand)).toEqual([BDY(29)]);

    // One named climax: one choice.
    run = pick(setup([BDY(1), BDY(72), TEAR, BDY(33), BDY(1)]), [BDY(1)]);
    expect(asks(run, 'MAIN')).toBe(true);
    expect(names(run.state, run.state.zones[0].hand)).toEqual([BDY(1)]);

    // A climax of another name only: nothing returns.
    run = setup([OTHER_CLIMAX, BDY(1), BDY(72), BDY(33), BDY(1)]);
    expect(asks(run, 'MAIN')).toBe(true);
    expect(run.state.zones[0].hand).toEqual([]);
    expect(run.state.zones[0].waitingRoom).toHaveLength(8);
  });

  it('in your turn, with another 「何度だって夢を見る 千石ユノ」: your other 《夢限大みゅーたいぷ》 characters get +1000', () => {
    const powers = (yuno: boolean, turnPlayer: PlayerId) => {
      const { state } = game('BDY_W135', { step: 'MAIN_START', turnPlayer }, (ctx) => {
        take(ctx, 0, BDY(36), stageSlot(0, 'FC'));
        take(ctx, 0, BDY(1), stageSlot(0, 'FL'));
        take(ctx, 0, BDY(72), stageSlot(0, 'FR'));
        take(ctx, 0, yuno ? BDY(29) : BDY(33), stageSlot(0, 'BL'));
      });
      return (['FC', 'FL', 'FR', 'BL'] as const).map((slot) => getPower(state, at(state, 0, slot)));
    };
    const printed = (c: string) => getCard(c).def.power!;
    expect(powers(true, 0)).toEqual([printed(BDY(36)), printed(BDY(1)) + 1000, printed(BDY(72)), printed(BDY(29)) + 1000]);
    expect(powers(false, 0)).toEqual([printed(BDY(36)), printed(BDY(1)), printed(BDY(72)), printed(BDY(33))]);
    expect(powers(true, 1)).toEqual([printed(BDY(36)), printed(BDY(1)), printed(BDY(72)), printed(BDY(29))]);
  });
});
