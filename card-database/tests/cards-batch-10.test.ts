/**
 * Tests for the cards of batch 10, with the real card data: GUP/W141-075 and BDY/W135-085 (the opponent swaps
 * the chosen character for one of their waiting room of level X or lower), STS/W140-063 (a counter event, a
 * choice of two), BDY/W135-061 (an event, a choice of two after a cost), NIK/S135-016 (絆 with two names) and
 * NIK/S135-017 (an ability that works in the waiting room at the start of its player's first turn). Both
 * players have every card of the booster under test, three copies each.
 */

import { describe, expect, it } from 'vitest';
import { type Choice, type Ctx, type Decision, type GameEvent, type GameState, type PlayerId, type SlotId, getInstance, getPlayerView, getPower, stageSlot, triggerIconsOf } from '@wso/game-engine';
import { getCard } from '../src/index';
import { readEvent, readLine } from '../src/grammar';
import { answer, oid, pending, scenario, stackTop, take } from './helpers';
import type { RealScenario } from './helpers';

const id = (prefix: string) => (n: number): string => `${prefix}-${String(n).padStart(3, '0')}`;
const STS = id('STS/W140');
const BDY = id('BDY/W135');
const NIK = id('NIK/S135');
const GUP = id('GUP/W141');

type SetName = 'STS_W140' | 'BDY_W135' | 'NIK_S135' | 'GUP_W141';
/** Cards used only as bodies (printed numbers, traits and icons, no abilities). */
const BODIES: Record<SetName, string[]> = {
  STS_W140: [STS(68), STS(2), STS(21), STS(1), STS(35)],
  BDY_W135: [BDY(13), BDY(7), BDY(37), BDY(50), BDY(29), BDY(72)],
  NIK_S135: [NIK(3), NIK(19), NIK(4), NIK(5), NIK(7)],
  GUP_W141: [GUP(1), GUP(39), GUP(8), GUP(22), GUP(2)],
};
interface Run {
  state: GameState;
  events: GameEvent[];
}
const game = (set: SetName, options: Omit<RealScenario, 'sets'>, arrange: (ctx: Ctx) => void = () => {}): Run => {
  const start = scenario({ ...options, sets: [`${set}:ALL`, `${set}:ALL`], plain: BODIES[set] }, arrange);
  return { state: start.state, events: [...start.events] };
};
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
    if (k < 0) throw new Error(`${cardId} cannot be chosen; offered: ${[...new Set(offered(run))].join(', ')}`);
    return left.splice(k, 1)[0]!;
  });
  return then(run, { kind: 'SELECT_CARDS', cards: chosen });
};
const accept = (run: Run): Run => then(run, { kind: 'CONFIRM', accept: true });
const decline = (run: Run): Run => then(run, { kind: 'CONFIRM', accept: false });
const option = (run: Run, chosen: string): Run => then(run, { kind: 'SELECT_OPTION', option: chosen });
const attack = (run: Run, from: SlotId, type: 'FRONT' | 'SIDE' | 'DIRECT'): Run =>
  then(run, { kind: 'ATTACK', attack: { attacker: oid(run.state, at(run.state, run.state.turn!.player, from)), type } });
const inHand = (state: GameState, player: PlayerId, cardId: string): number => state.zones[player].hand.find((i) => getInstance(state, i).cardId === cardId)!;
const playCharacter = (run: Run, cardId: string, to: SlotId): Run =>
  then(run, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(run.state, inHand(run.state, 0, cardId)), slot: to } });
const playEvent = (run: Run, cardId: string): Run => then(run, { kind: 'MAIN', action: { type: 'PLAY_EVENT', card: oid(run.state, inHand(run.state, 0, cardId)) } });
const canPlay = (run: Run, cardId: string): boolean =>
  pending(run.state, 'MAIN').actions.some((a) => (a.type === 'PLAY_EVENT' || a.type === 'PLAY_CHARACTER') && a.card === oid(run.state, inHand(run.state, 0, cardId)));
const asks = (run: Run, kind: Decision['kind'], prompt?: string): boolean =>
  run.state.pending?.kind === kind && (prompt === undefined || (run.state.pending as { prompt?: string }).prompt === prompt);
/** Of the abilities that wait, the card's ability with this index is played first. */
const abilityFirst = (run: Run, cardId: string, index: number): Run => {
  if (run.state.pending?.kind !== 'CHOOSE_ABILITY') return run;
  const waiting = run.state.pending.abilities;
  const wanted = waiting.find((a) => a.type === 'CARD' && a.cardId === cardId && a.ability === index) ?? waiting[0]!;
  return then(run, { kind: 'CHOOSE_ABILITY', id: wanted.id });
};
const paid = (run: Run): string[] => run.events.flatMap((e) => (e.type === 'CARD_MOVED' && e.reason === 'COST' ? [`${e.from.zone}>${e.to.zone}`] : []));
const reversed = (run: Run): string[] => run.events.flatMap((e) => (e.type === 'ORIENTATION_CHANGED' && e.to === 'REVERSE' ? [getInstance(run.state, e.instanceId).cardId] : []));
const played = (run: Run, cardId: string): number => run.events.filter((e) => e.type === 'ABILITY_PLAYED' && getInstance(run.state, e.instanceId).cardId === cardId).length;
const printed = (cardId: string) => getCard(cardId).def;
const ability = (cardId: string, index: number) => printed(cardId).abilities![index];
const zone = (player: PlayerId, name: 'waitingRoom' | 'hand' | 'stock' | 'level' | 'clock' | 'memory' | 'climax') => ({ player, zone: name }) as const;
const zoneCards = (state: GameState, player: PlayerId, name: 'waitingRoom' | 'hand' | 'stock' | 'memory' | 'clock'): string[] => names(state, state.zones[player][name]).sort();

const TEXT = {
  gup075: '【自】［(1)］ このカードが手札から舞台に置かれた時、あなたはコストを払ってよい。そうしたら、あなたは相手のレベル1以上のキャラを1枚選び、相手は自分の控え室のレベルＸ以下のキャラを1枚選び、入れ替える。Ｘはあなたが選んだキャラのレベル－1に等しい。',
  bdy085: '【自】［手札を1枚控え室に置く］ このカードが手札から舞台に置かれた時、あなたはコストを払ってよい。そうしたら、あなたは相手のレベル1以上のキャラを1枚選び、相手は自分の控え室のレベルＸ以下のキャラを1枚選び、入れ替える。Ｘはあなたが選んだキャラのレベル－1に等しい。',
  sts063: '【カウンター】 次の2つの効果のうちあなたが選んだ1つを行う。『あなたは自分のキャラを1枚選び、手札に戻す。』『あなたは自分の控え室の、《巡遊者》か《魔王》のキャラを1枚選び、手札に戻す。』',
  bdy061: '［あなたの舞台の《夢限大みゅーたいぷ》のキャラを1枚控え室に置く］ あなたはコストを払ってよい。そうしたら、次の2つの効果のうちあなたが選んだ1つを行う。『あなたは自分の控え室のキャラを2枚まで選び、手札に戻す。』『あなたは相手のキャラを2枚まで選び、手札に戻す。』',
  nik016: '【自】 絆／「君の希望を守る ラプラス」「最高のヴィラン ドレイク」 ［手札を1枚控え室に置く］ （このカードが、手札から舞台またはプレイされて舞台に置かれた時、あなたはコストを払ってよい。そうしたら、あなたは自分の控え室の、「君の希望を守る ラプラス」か「最高のヴィラン ドレイク」を1枚選び、手札に戻す）',
  nik017: '【自】 控え室にこのカードがあるなら、あなたの第1ターンの始めに、あなたはこのカードをストック置場に置いてよい。',
  nik109: '【カウンター】［手札のCXを1枚控え室に置く］ あなたの《NIKKE》のキャラが3枚以上なら、あなたはコストを払ってよい。そうしたら、あなたは自分のクロックの上から2枚までを、控え室に置く。このカードを思い出にする。',
};
const SWAP = [
  { do: 'CHOOSE', from: 'OPPONENT_STAGE', filter: { kind: 'CHARACTER', levelMin: 1 }, min: 1, max: 1 },
  { do: 'SET_X', count: { of: 'CHOSEN_LEVEL' }, minus: 1 },
  { do: 'OPPONENT_SWAPS_FROM_WAITING_ROOM', levelMaxX: true },
];

// ---------------------------------------------------------------------------------------------------------

describe('reading the new wordings', () => {
  const effectOf = (line: string) => (readLine(line).line!.ability as { effect: unknown[] }).effect;

  it('相手の…を1枚選び、相手は自分の控え室のレベルＸ以下のキャラを1枚選び、入れ替える: X from the chosen character', () => {
    expect(effectOf(TEXT.gup075)).toEqual(SWAP);
    expect(effectOf(TEXT.bdy085)).toEqual(SWAP);
    // Another X, or a choice by the player instead of the opponent, is not read as this.
    expect(readLine(TEXT.gup075.replace('レベル－1に等しい', 'レベル＋1に等しい')).line).toBeNull();
    expect(readLine(TEXT.gup075.replace('相手は自分の控え室の', 'あなたは相手の控え室の')).line).toBeNull();
  });

  it('絆 with two names: the reminder must say exactly that', () => {
    expect(readLine(TEXT.nik016).line!.ability).toEqual({
      type: 'AUTO',
      keywords: ['BOND'],
      trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' },
      cost: [{ pay: 'DISCARD', count: 1 }],
      effect: [
        { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { names: ['君の希望を守る ラプラス', '最高のヴィラン ドレイク'] }, min: 1, max: 1 },
        { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
      ],
    });
    expect(readLine(TEXT.nik016.replace('か「最高のヴィラン ドレイク」を1枚選び', 'を1枚選び')).line).toBeNull();
    expect(readLine(TEXT.nik016.replace('手札に戻す）', '山札に戻す）')).line).toBeNull();
  });

  it('控え室にこのカードがあるなら、あなたの第1ターンの始めに: works in the waiting room; with another condition it is not read', () => {
    expect(readLine(TEXT.nik017).line!.ability).toEqual({
      type: 'AUTO',
      zone: 'WAITING_ROOM',
      trigger: { on: 'PHASE_START', phase: 'STAND', turn: 'YOURS', turnOfPlayer: 1 },
      optional: true,
      effect: [{ do: 'MOVE', target: { who: 'SELF' }, to: 'STOCK' }],
    });
    expect(readLine(TEXT.nik017.replace('あなたの第1ターンの始めに、', 'あなたの第1ターンの始めに、あなたのレベルが0なら、')).line).toBeNull();
  });

  it('counter events and a choice of two quoted effects; a sentence of its own after a paid part keeps the event out', () => {
    expect(readEvent(TEXT.sts063)!.effect).toEqual([
      {
        do: 'CHOOSE_ONE',
        options: [
          [{ do: 'CHOOSE', from: 'YOUR_STAGE', min: 1, max: 1 }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' }],
          [{ do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { kind: 'CHARACTER', traits: ['巡遊者', '魔王'] }, min: 1, max: 1 }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' }],
        ],
      },
    ]);
    expect(readEvent(TEXT.bdy061)!.effect).toEqual([
      {
        do: 'MAY_PAY',
        cost: [{ pay: 'CHARACTERS_TO_WAITING_ROOM', count: 1, filter: { kind: 'CHARACTER', traits: ['夢限大みゅーたいぷ'] } }],
        then: [
          {
            do: 'CHOOSE_ONE',
            options: [
              [{ do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { kind: 'CHARACTER' }, min: 0, max: 2 }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' }],
              [{ do: 'CHOOSE', from: 'OPPONENT_STAGE', min: 0, max: 2 }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' }],
            ],
          },
        ],
      },
    ]);
    // NIK/S135-109: "このカードを思い出にする" after the paid part — whether it needs the payment is not said.
    expect(readEvent(TEXT.nik109)).toBeNull();
    expect(getCard(NIK(109)).record.support).toBe('unsupported');
  });

  it('the six cards: every ability of each card is in its data', () => {
    expect(printed(GUP(75)).abilities).toHaveLength(2);
    expect(ability(GUP(75), 0)).toEqual(readLine(TEXT.gup075).line!.ability);
    expect(ability(GUP(75), 0)).toMatchObject({ trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' }, cost: [{ pay: 'STOCK', count: 1 }] });
    expect(ability(GUP(75), 1)).toEqual({ type: 'AUTO', trigger: { on: 'REVERSED' }, condition: { if: 'BATTLE_OPPONENT', filter: { levelMax: 1 } }, optional: true, effect: [{ do: 'ORIENT', target: { who: 'BATTLE_OPPONENT' }, to: 'REVERSE' }] });
    expect(printed(BDY(85)).abilities).toHaveLength(2);
    expect(ability(BDY(85), 0)).toMatchObject({ trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' }, condition: { if: 'CHARACTERS', min: 1, other: true, filter: { traits: ['音楽'] } }, effect: [{ do: 'MODIFY', target: { who: 'SELF' }, stat: 'POWER', amount: 2000 }] });
    expect(ability(BDY(85), 1)).toEqual(readLine(TEXT.bdy085).line!.ability);
    expect(printed(STS(63))).toMatchObject({ kind: 'EVENT', counter: true, effect: readEvent(TEXT.sts063)!.effect });
    expect(printed(BDY(61))).toMatchObject({ kind: 'EVENT', counter: false, effect: readEvent(TEXT.bdy061)!.effect });
    expect(printed(NIK(16)).abilities).toHaveLength(2);
    expect(ability(NIK(16), 0)).toEqual(readLine(TEXT.nik016).line!.ability);
    expect(ability(NIK(16), 1)).toMatchObject({ type: 'ACT', cost: [{ pay: 'SELF_TO_CLOCK' }], effect: [{ do: 'LOOK_TOP', upTo: 3, reveal: true }] });
    expect(printed(NIK(17)).abilities).toHaveLength(2);
    expect(ability(NIK(17), 0)).toMatchObject({ type: 'CONT', gainsTriggerIcons: ['CHOICE'], condition: { if: 'COUNT', where: 'YOUR_CLIMAX', filter: { hasTrigger: 'CHOICE' }, min: 1 } });
    expect(ability(NIK(17), 1)).toEqual(readLine(TEXT.nik017).line!.ability);
  });
});

// ---------------------------------------------------------------------------------------------------------

describe('GUP/W141-075 10 years Memory 武部沙織', () => {
  /** The card in the hand (level 1, red: a red card in the level zone, one stock). The opponent: GUP-008 (level 2) and GUP-001 (level 0) on the stage; levels 0, 1, 2 in the waiting room. */
  const setup = (stock = 1) =>
    game('GUP_W141', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, GUP(75), zone(0, 'hand'));
      take(ctx, 0, GUP(75), zone(0, 'level'));
      for (let k = 0; k < stock; k++) take(ctx, 0, GUP(1), zone(0, 'stock'));
      take(ctx, 1, GUP(8), stageSlot(1, 'FC'));
      take(ctx, 1, GUP(1), stageSlot(1, 'FL'));
      for (const c of [GUP(1), GUP(39), GUP(22)]) take(ctx, 1, c, zone(1, 'waitingRoom'));
    });

  it('the cards used here', () => {
    expect([GUP(1), GUP(39), GUP(22), GUP(8)].map((c) => printed(c).level)).toEqual([0, 1, 1, 2]);
    expect(printed(GUP(75))).toMatchObject({ level: 1, color: 'red' });
  });

  it('played from the hand: (1) paid, a level 2 character chosen; the opponent puts one of level 1 or lower in its place', () => {
    const start = playCharacter(setup(), GUP(75), 'FC');
    expect(pending(start.state, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST', cardId: GUP(75) });
    const run = accept(start);
    expect(paid(run)).toEqual(['stock>waitingRoom']);
    // Only the level 2 character (not the level 0 one).
    expect(offered(run)).toEqual([GUP(8)]);
    const theirs = pick(run, [GUP(8)]);
    expect(pending(theirs.state, 'SELECT_CARDS').player).toBe(1);
    expect(offered(theirs)).toEqual([GUP(1), GUP(22), GUP(39)].sort());
    const done = pick(theirs, [GUP(39)]);
    expect(names(done.state, done.state.zones[1].stage.FC)).toEqual([GUP(39)]);
    expect(zoneCards(done.state, 1, 'waitingRoom')).toEqual([GUP(1), GUP(22), GUP(8)].sort());
    // The player who chooses the incoming card is the opponent: the player of the card only sees which was chosen.
    expect(getPlayerView(theirs.state, 0).decision).toMatchObject({ mine: false, player: 1, kind: 'SELECT_CARDS' });
  });

  it('the cost not paid, or no stock to pay it: nothing is chosen', () => {
    const declined = decline(playCharacter(setup(), GUP(75), 'FC'));
    expect(declined.state.pending?.kind).toBe('MAIN');
    expect(names(declined.state, declined.state.zones[1].stage.FC)).toEqual([GUP(8)]);
    const broke = playCharacter(setup(0), GUP(75), 'FC');
    expect(asks(broke, 'CONFIRM', 'PAY_COST')).toBe(false);
  });

  it('【リバース】した時、バトル相手のレベルが1以下なら: the battle opponent may be reversed too', () => {
    const fight = (opponent: string) =>
      game('GUP_W141', { step: 'ATTACK_START' }, (ctx) => {
        take(ctx, 0, GUP(75), stageSlot(0, 'FC'));
        take(ctx, 1, opponent, stageSlot(1, 'FC'));
        stackTop(ctx, 0, [GUP(1), GUP(1)]);
      });
    // GUP-039 (level 1, 4500) beats GUP-075 (1500): both may end reversed.
    const lost = attack(fight(GUP(39)), 'FC', 'FRONT');
    const battle = then(lost, { kind: 'COUNTER', card: null });
    expect(pending(battle.state, 'CONFIRM')).toMatchObject({ player: 0, prompt: 'USE_ABILITY', cardId: GUP(75) });
    expect(reversed(accept(battle)).sort()).toEqual([GUP(39), GUP(75)].sort());
    expect(reversed(decline(battle))).toEqual([GUP(75)]);
    // GUP-008 (level 2): not asked.
    const higher = then(attack(fight(GUP(8)), 'FC', 'FRONT'), { kind: 'COUNTER', card: null });
    expect(reversed(higher)).toEqual([GUP(75)]);
    expect(asks(higher, 'CONFIRM', 'USE_ABILITY')).toBe(false);
  });
});

describe('BDY/W135-085 “フェアリィブゥケ”ポポ', () => {
  /** The card in the hand (level 0); the opponent: BDY-050 (level 2) and BDY-007 (level 1); levels 0, 1 and 2 in their waiting room. */
  const setup = (withOther: boolean) =>
    game('BDY_W135', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, BDY(85), zone(0, 'hand'));
      take(ctx, 0, BDY(13), zone(0, 'hand'));
      if (withOther) take(ctx, 0, BDY(29), stageSlot(0, 'FL'));
      take(ctx, 1, BDY(50), stageSlot(1, 'FC'));
      take(ctx, 1, BDY(7), stageSlot(1, 'FR'));
      for (const c of [BDY(13), BDY(37), BDY(50)]) take(ctx, 1, c, zone(1, 'waitingRoom'));
    });

  it('played with another 《音楽》 character: +2000 for the turn; then the cost may be paid for the swap', () => {
    let run = playCharacter(setup(true), BDY(85), 'FC');
    run = abilityFirst(run, BDY(85), 0);
    expect(getPower(run.state, at(run.state, 0, 'FC'))).toBe(printed(BDY(85)).power! + 2000);
    expect(pending(run.state, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST', cardId: BDY(85) });
    run = pick(accept(run), [BDY(13)]);
    expect(paid(run)).toEqual(['hand>waitingRoom']);
    expect(offered(run)).toEqual([BDY(50), BDY(7)].sort());
    // The level 1 character: X = 0, only the level 0 card of their waiting room.
    const lower = pick(run, [BDY(7)]);
    expect(offered(lower)).toEqual([BDY(13)]);
    const done = pick(lower, [BDY(13)]);
    expect(names(done.state, done.state.zones[1].stage.FR)).toEqual([BDY(13)]);
    // The level 2 character: X = 1, levels 0 and 1.
    expect(offered(pick(run, [BDY(50)]))).toEqual([BDY(13), BDY(37)].sort());
  });

  it('alone: no +2000', () => {
    const run = abilityFirst(playCharacter(setup(false), BDY(85), 'FC'), BDY(85), 0);
    expect(getPower(run.state, at(run.state, 0, 'FC'))).toBe(printed(BDY(85)).power!);
  });
});

describe('STS/W140-063 星ノ塔スタッフ ベアトリス (counter event)', () => {
  /** The opponent's turn: their STS-021 (4500) front attacks player 0's STS-002 (3000). Player 0 holds the event (level 1, red; one stock). */
  const setup = (stock = 1) =>
    game('STS_W140', { step: 'ATTACK_START', turnPlayer: 1 }, (ctx) => {
      take(ctx, 0, STS(63), zone(0, 'hand'));
      take(ctx, 0, STS(63), zone(0, 'level'));
      for (let k = 0; k < stock; k++) take(ctx, 0, STS(68), zone(0, 'stock'));
      take(ctx, 0, STS(2), stageSlot(0, 'FC'));
      take(ctx, 0, STS(21), zone(0, 'waitingRoom'));
      take(ctx, 1, STS(21), stageSlot(1, 'FC'));
      stackTop(ctx, 1, [STS(68), STS(68)]);
      // The damage comes from player 0's deck: characters, so that it is not cancelled.
      stackTop(ctx, 0, [STS(1), STS(35), STS(1)]);
    });
  const counter = (run: Run): Run => then(run, { kind: 'COUNTER', card: oid(run.state, inHand(run.state, 0, STS(63))) });

  it('the cards used here', () => {
    expect(printed(STS(63))).toMatchObject({ kind: 'EVENT', level: 1, cost: 1, color: 'red', counter: true });
  });

  it('offered in the counter step of a front attack; the defending character back to the hand: no battle', () => {
    const atCounter = attack(setup(), 'FC', 'FRONT');
    expect(pending(atCounter.state, 'COUNTER').cards).toEqual([oid(atCounter.state, inHand(atCounter.state, 0, STS(63)))]);
    const choosing = counter(atCounter);
    expect(pending(choosing.state, 'SELECT_OPTION')).toMatchObject({ player: 0, options: ['EFFECT_1', 'EFFECT_2'] });
    const back = pick(option(choosing, 'EFFECT_1'), [STS(2)]);
    // (The opponent has no other attacker: the game goes on to player 0's turn, who draws a card.)
    expect(zoneCards(back.state, 0, 'hand')).toContain(STS(2));
    expect(back.state.zones[0].stage.FC).toEqual([]);
    // The stock paid and the event itself are in the waiting room.
    expect(zoneCards(back.state, 0, 'waitingRoom')).toEqual([STS(21), STS(63), STS(68)].sort());
    expect(reversed(back)).toEqual([]);
    // The attack's damage (soul 1) still reaches the clock.
    expect(zoneCards(back.state, 0, 'clock')).toEqual([STS(1)]);
  });

  it('the other effect: a 《巡遊者》 character of the waiting room to the hand; the battle goes on (3000 against 4500)', () => {
    const choosing = option(counter(attack(setup(), 'FC', 'FRONT')), 'EFFECT_2');
    // STS-068 is the stock just paid for the event.
    expect(offered(choosing)).toEqual([STS(21), STS(68)].sort());
    const back = pick(choosing, [STS(21)]);
    expect(zoneCards(back.state, 0, 'hand')).toContain(STS(21));
    expect(reversed(back)).toEqual([STS(2)]);
  });

  it('a side attack has no counter step; without the stock the event is not offered', () => {
    const side = attack(setup(), 'FC', 'SIDE');
    expect(asks(side, 'COUNTER')).toBe(false);
    expect(pending(attack(setup(0), 'FC', 'FRONT').state, 'COUNTER').cards).toEqual([]);
  });

  it('CR-2.8.2.1: it can also be played in its player’s own main phase', () => {
    const own = game('STS_W140', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, STS(63), zone(0, 'hand'));
      take(ctx, 0, STS(63), zone(0, 'level'));
      take(ctx, 0, STS(68), zone(0, 'stock'));
      take(ctx, 0, STS(2), stageSlot(0, 'FC'));
    });
    expect(canPlay(own, STS(63))).toBe(true);
    const back = pick(option(playEvent(own, STS(63)), 'EFFECT_1'), [STS(2)]);
    expect(zoneCards(back.state, 0, 'hand')).toEqual([STS(2)]);
  });
});

describe('BDY/W135-061 アメアメいざない大さくせん (event)', () => {
  /** Level 2 (two red cards in the level zone), one stock; BDY-029 on the stage to pay with. The opponent has BDY-007 and BDY-050. */
  const setup = () =>
    game('BDY_W135', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, BDY(61), zone(0, 'hand'));
      take(ctx, 0, BDY(37), zone(0, 'level'));
      take(ctx, 0, BDY(29), zone(0, 'level'));
      take(ctx, 0, BDY(13), zone(0, 'stock'));
      take(ctx, 0, BDY(29), stageSlot(0, 'FC'));
      for (const c of [BDY(7), BDY(50), BDY(72)]) take(ctx, 0, c, zone(0, 'waitingRoom'));
      take(ctx, 1, BDY(7), stageSlot(1, 'FC'));
      take(ctx, 1, BDY(50), stageSlot(1, 'FL'));
      take(ctx, 1, BDY(13), stageSlot(1, 'FR'));
    });
  const paidFor = (): Run => {
    const asked = playEvent(setup(), BDY(61));
    expect(pending(asked.state, 'CONFIRM').prompt).toBe('PAY_COST');
    return pick(accept(asked), [BDY(29)]);
  };

  it('the cost: a 《夢限大みゅーたいぷ》 character of the stage; then one of the two effects', () => {
    const run = paidFor();
    // The event's own cost (1) first, then the cost of the effect.
    expect(paid(run)).toEqual(['stock>waitingRoom', 'stage>waitingRoom']);
    expect(pending(run.state, 'SELECT_OPTION').options).toEqual(['EFFECT_1', 'EFFECT_2']);
  });

  it('up to two characters of the waiting room to the hand (the ones just paid included)', () => {
    const choosing = option(paidFor(), 'EFFECT_1');
    expect(offered(choosing)).toEqual([BDY(13), BDY(29), BDY(50), BDY(7), BDY(72)].sort());
    expect(pending(choosing.state, 'SELECT_CARDS')).toMatchObject({ min: 0, max: 2 });
    expect(zoneCards(pick(choosing, [BDY(29), BDY(50)]).state, 0, 'hand')).toEqual([BDY(29), BDY(50)].sort());
  });

  it('up to two of the opponent’s characters back to their owner’s hand', () => {
    const choosing = option(paidFor(), 'EFFECT_2');
    expect(offered(choosing)).toEqual([BDY(13), BDY(50), BDY(7)].sort());
    const back = pick(choosing, [BDY(7), BDY(50)]);
    expect(zoneCards(back.state, 1, 'hand')).toEqual([BDY(50), BDY(7)].sort());
    expect(back.state.zones[0].hand).toHaveLength(0);
    expect(names(back.state, back.state.zones[1].stage.FR)).toEqual([BDY(13)]);
  });

  it('not paid: nothing is done; the event goes to the waiting room', () => {
    const run = decline(playEvent(setup(), BDY(61)));
    expect(run.state.pending?.kind).toBe('MAIN');
    expect(zoneCards(run.state, 0, 'waitingRoom')).toContain(BDY(61));
    expect(names(run.state, run.state.zones[1].stage.FC)).toEqual([BDY(7)]);
  });
});

describe('NIK/S135-016 マクスウェル - メカニックホワイト', () => {
  const setup = () =>
    game('NIK_S135', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, NIK(16), zone(0, 'hand'));
      take(ctx, 0, NIK(4), zone(0, 'hand'));
      for (const c of [NIK(3), NIK(19), NIK(7)]) take(ctx, 0, c, zone(0, 'waitingRoom'));
      stackTop(ctx, 0, [NIK(5), NIK(24), NIK(22), NIK(4)]);
    });

  it('絆: either named card comes back, nothing else', () => {
    const asked = playCharacter(setup(), NIK(16), 'FC');
    expect(pending(asked.state, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST', cardId: NIK(16) });
    const choosing = pick(accept(asked), [NIK(4)]);
    expect(offered(choosing)).toEqual([NIK(19), NIK(3)].sort());
    expect(zoneCards(pick(choosing, [NIK(19)]).state, 0, 'hand')).toEqual([NIK(19)]);
    expect(zoneCards(pick(choosing, [NIK(3)]).state, 0, 'hand')).toEqual([NIK(3)]);
    expect(zoneCards(decline(asked).state, 0, 'hand')).toEqual([NIK(4)]);
  });

  it('【起】 the card to the clock: of the top three, a 《NIKKE》 character or an event is shown and taken, the rest to the waiting room', () => {
    let run = decline(playCharacter(setup(), NIK(16), 'FC'));
    run = then(run, { kind: 'MAIN', action: { type: 'ACTIVATE', card: oid(run.state, at(run.state, 0, 'FC')), ability: 1 } });
    expect(paid(run)).toEqual(['stage>clock']);
    for (let k = 0; k < 3; k++) run = accept(run);
    // NIK-005 (character), NIK-024 (climax), NIK-022 (event): the climax cannot be taken.
    expect(offered(run)).toEqual([NIK(22), NIK(5)].sort());
    const taken = pick(run, [NIK(22)]);
    expect(zoneCards(taken.state, 0, 'hand')).toEqual([NIK(22), NIK(4)].sort());
    expect(taken.events.some((e) => e.type === 'CARD_REVEALED' && e.cardId === NIK(22))).toBe(true);
    expect(zoneCards(taken.state, 0, 'waitingRoom')).toEqual([NIK(19), NIK(24), NIK(3), NIK(5), NIK(7)].sort());
  });
});

describe('NIK/S135-017 “メガT.Rony”トロニー', () => {
  /** The start of a turn of player `who`; the card in that player's waiting room; `taken` is how many turns each player had before. */
  const setup = (who: PlayerId, taken: [number, number], where: 'waitingRoom' | 'hand' = 'waitingRoom') =>
    game('NIK_S135', { step: 'STAND_START', turnPlayer: who, turnNumber: taken[0] + taken[1] + 1 }, (ctx) => {
      take(ctx, who, NIK(17), zone(who, where));
      ctx.state.turnsTaken = taken;
    });

  it('the first player’s first turn: the card in the waiting room may go to the stock', () => {
    const run = setup(0, [0, 0]);
    expect(pending(run.state, 'CONFIRM')).toMatchObject({ player: 0, prompt: 'USE_ABILITY', cardId: NIK(17) });
    expect(zoneCards(accept(run).state, 0, 'stock')).toEqual([NIK(17)]);
    expect(zoneCards(decline(run).state, 0, 'waitingRoom')).toEqual([NIK(17)]);
  });

  it('the second player’s first turn (the game’s second turn): the same', () => {
    expect(pending(setup(1, [1, 0]).state, 'CONFIRM')).toMatchObject({ player: 1, cardId: NIK(17) });
  });

  it('a later turn, or the card not in the waiting room: nothing', () => {
    expect(played(setup(0, [1, 1]), NIK(17))).toBe(0);
    expect(asks(setup(0, [1, 1]), 'CONFIRM', 'USE_ABILITY')).toBe(false);
    expect(asks(setup(0, [0, 0], 'hand'), 'CONFIRM', 'USE_ABILITY')).toBe(false);
  });

  it('【永】 with a climax with the choice icon in its player’s climax zone, the card has the choice icon wherever it is', () => {
    const run = game('NIK_S135', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, NIK(17), zone(0, 'waitingRoom'));
      take(ctx, 0, NIK(24), zone(0, 'climax'));
      take(ctx, 1, NIK(17), zone(1, 'hand'));
    });
    expect(printed(NIK(24)).triggers).toEqual(['CHOICE']);
    const mine = run.state.zones[0].waitingRoom[0]!;
    expect(triggerIconsOf(run.state, mine)).toEqual(['CHOICE']);
    // The opponent's copy: their climax zone is empty.
    expect(triggerIconsOf(run.state, run.state.zones[1].hand[0]!)).toEqual([]);
    const without = game('NIK_S135', { step: 'MAIN_START' }, (ctx) => take(ctx, 0, NIK(17), zone(0, 'waitingRoom')));
    expect(triggerIconsOf(without.state, without.state.zones[0].waitingRoom[0]!)).toEqual([]);
  });
});
