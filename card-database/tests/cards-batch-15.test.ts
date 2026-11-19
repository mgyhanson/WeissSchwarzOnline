/**
 * Tests for the cards of batch 15, with the real card data (each card in a game of its own booster, both players
 * with every card of it, three copies each): NIK/S135-102 (アラーム; the centre slot given power and an encore),
 * NIK/S135-089 (the centre slot given 相手の効果に選ばれない; 集中 that gives it for the opponent's turn),
 * NIK/S135-030 (Level 3: when the character facing it attacks, a card under it face down, the rest on top or away)
 * and STS/W140-039 (a character played from the waiting room this main phase, without its colour).
 */

import { describe, expect, it } from 'vitest';
import { type Choice, type Ctx, type Decision, type GameEvent, type GameState, type PlayerId, type SlotId, getInstance, getPower, stageSlot } from '@wso/game-engine';
import { getCard } from '../src/index';
import { readLine } from '../src/grammar';
import { answer, oid, pending, scenario, stackTop, take } from './helpers';
import type { RealScenario } from './helpers';

const GUP = (n: number): string => `GUP/W141-${String(n).padStart(3, '0')}`;
const BDY = (n: number): string => `BDY/W135-${String(n).padStart(3, '0')}`;
const ANM = (n: number): string => `ANM/W138-${String(n).padStart(3, '0')}`;
const NIK = (n: number): string => `NIK/S135-${String(n).padStart(3, '0')}`;
const STS = (n: number): string => `STS/W140-${String(n).padStart(3, '0')}`;
/** Cards used only as bodies (printed numbers, traits and icons, no abilities). */
const BODIES: Record<string, string[]> = {
  GUP_W141: [GUP(1), GUP(3), GUP(4), GUP(5), GUP(8), GUP(15), GUP(22)],
  BDY_W135: [BDY(1), BDY(2), BDY(7), BDY(19), BDY(35)],
  ANM_W138: [ANM(5), ANM(9), ANM(10), ANM(12), ANM(16), ANM(17)],
  NIK_S135: [NIK(3), NIK(4), NIK(8), NIK(16), NIK(19), NIK(33), NIK(65), NIK(72), NIK(84), NIK(85), NIK(87), NIK(95), NIK(104), NIK(105)],
  STS_W140: [STS(3), STS(4), STS(9), STS(11), STS(25), STS(26), STS(38), STS(41)],
};
interface Run {
  state: GameState;
  events: GameEvent[];
}
const game = (set: keyof typeof BODIES, options: Omit<RealScenario, 'sets'>, arrange: (ctx: Ctx) => void = () => {}, plain: string[] = []): Run => {
  const start = scenario({ ...options, sets: [`${set}:ALL`, `${set}:ALL`], plain: [...BODIES[set]!, ...plain] }, arrange);
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
const asks = (run: Run, kind: Decision['kind'], prompt?: string): boolean =>
  run.state.pending?.kind === kind && (prompt === undefined || (run.state.pending as { prompt?: string }).prompt === prompt);
const inHand = (state: GameState, player: PlayerId, cardId: string): number => state.zones[player].hand.find((i) => getInstance(state, i).cardId === cardId)!;
const playCharacter = (run: Run, cardId: string, to: SlotId): Run =>
  then(run, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(run.state, inHand(run.state, 0, cardId)), slot: to } });
const activate = (run: Run, slot: SlotId, ability: number): Run =>
  then(run, { kind: 'MAIN', action: { type: 'ACTIVATE', card: oid(run.state, at(run.state, 0, slot)), ability } });
const attack = (run: Run, slot: SlotId, type: 'FRONT' | 'SIDE' | 'DIRECT' = 'FRONT'): Run => then(run, { kind: 'ATTACK', attack: { attacker: oid(run.state, at(run.state, 0, slot)), type } });
/** Of the abilities that wait, the card's ability with this index is played first. */
const abilityFirst = (run: Run, cardId: string, index: number): Run => {
  if (run.state.pending?.kind !== 'CHOOSE_ABILITY') return run;
  const waiting = run.state.pending.abilities;
  const wanted = waiting.find((a) => a.type === 'CARD' && a.cardId === cardId && a.ability === index) ?? waiting[0]!;
  return then(run, { kind: 'CHOOSE_ABILITY', id: wanted.id });
};
const printed = (cardId: string) => getCard(cardId).def;
const zone = (player: PlayerId, name: 'waitingRoom' | 'hand' | 'stock' | 'level' | 'clock' | 'memory' | 'climax') => ({ player, zone: name }) as const;
const zoneCards = (state: GameState, player: PlayerId, name: 'waitingRoom' | 'hand' | 'stock' | 'clock' | 'memory'): string[] => names(state, state.zones[player][name]).sort();
const line = (cardId: string, index: number): string => getCard(cardId).official.text.split('<br>')[index]!;
const effectOf = (text: string): unknown => (readLine(text).line!.ability as { effect: unknown }).effect;

/** Nothing is done at every decision, until `stop` holds. */
const routine = (d: Decision): Choice =>
  d.kind === 'CHOOSE_ABILITY' ? { kind: 'CHOOSE_ABILITY', id: d.abilities[0]!.id }
    : d.kind === 'MAIN' ? { kind: 'MAIN', action: { type: 'PASS' } }
    : d.kind === 'CLIMAX' ? { kind: 'CLIMAX', card: null }
    : d.kind === 'ATTACK' ? { kind: 'ATTACK', attack: null }
    : d.kind === 'CLOCK' ? { kind: 'CLOCK', card: null }
    : d.kind === 'COUNTER' ? { kind: 'COUNTER', card: null }
    : d.kind === 'HAND_LIMIT' ? { kind: 'HAND_LIMIT', discard: d.cards.slice(0, d.count) }
    : { kind: 'CONFIRM', accept: false };
const until = (from: Run, stop: (run: Run) => boolean): Run => {
  let current = from;
  for (let k = 0; k < 120 && !stop(current); k++) current = then(current, routine(current.state.pending!));
  if (!stop(current)) throw new Error('The position waited for was not reached');
  return current;
};


describe('reading the new wordings', () => {
  it('the four cards: every ability of each is in its data, read from its official line', () => {
    for (const cardId of [NIK(102), NIK(89), NIK(30), STS(39)]) {
      expect(getCard(cardId).record.support, cardId).toBe('verified');
      const lines = getCard(cardId).official.text.split('<br>');
      expect(printed(cardId).abilities).toHaveLength(lines.length);
      printed(cardId).abilities!.forEach((a, i) => expect(a).toEqual(readLine(lines[i]!).line!.ability));
    }
  });

  it('the new parts', () => {
    expect(readLine(line(NIK(102), 2)).line!.ability).toMatchObject({ keywords: ['ALARM'], alarm: true, trigger: { on: 'PHASE_START', phase: 'ATTACK', turn: 'YOURS' }, condition: { if: 'CHARACTERS', min: 3 } });
    expect(readLine(line(NIK(102), 0)).line!.ability).toMatchObject({ apply: [{ target: { who: 'YOUR_SLOT', slots: ['FC'], other: true }, amount: 500 }], grant: [{ ability: { keywords: ['ENCORE'] } }] });
    expect(readLine(line(NIK(30), 1)).line!.ability).toMatchObject({ effect: [{ do: 'CHOOSE' }, { do: 'SPLIT_CHOSEN' }, { do: 'GRANT', until: 'NEXT_OPPONENT_TURN', ability: { trigger: { on: 'FACING_ATTACKS' }, effect: [{ do: 'REORDER_TOP', upTo: 2, underSelf: 1, keep: 2 }] } }] });
    expect(effectOf(line(STS(39), 1))).toEqual([
      { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { kind: 'CHARACTER', traits: ['巡遊者', '魔王'], levelAtMostOwnLevel: true }, min: 1, max: 1 },
      { do: 'PERMIT_PLAY_FROM_WAITING_ROOM', target: { who: 'CHOSEN' }, ignoresColor: true },
    ]);
    // A reminder that says something else keeps the line unread.
    expect(readLine('【自】 このカードがアタックした時、あなたは1枚引く。（コストが必要なカードならコストを払う）').line).toBeNull();
    expect(readLine(line(STS(39), 1).replace('コストが必要なカードならコストを払う', 'コストは払わない')).line).toBeNull();
    // 加速-like keywords aside, アラーム needs 【クロック】 and its own words.
    expect(readLine('【自】 アラーム このカードがクロックの1番上にあるなら、あなたのアタックフェイズの始めに、あなたは1枚引く。').line).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------

describe('NIK/S135-102 ソリン：フロストチケット', () => {
  it('【永】 another 《インフィニティレール》 character in the centre of the front row: ＋500 (and an encore); not another character', () => {
    const state = (centre: string) =>
      game('NIK_S135', { step: 'MAIN_START' }, (ctx) => {
        take(ctx, 0, NIK(102), stageSlot(0, 'BL'));
        take(ctx, 0, centre, stageSlot(0, 'FC'));
      }).state;
    const rail = state(NIK(87));
    expect(printed(NIK(87)).traits).toContain('インフィニティレール');
    expect(getPower(rail, at(rail, 0, 'FC'))).toBe(printed(NIK(87)).power! + 500);
    const other = state(NIK(4));
    expect(getPower(other, at(other, 0, 'FC'))).toBe(printed(NIK(4)).power!);
  });

  it('the encore given: reversed in the centre, it goes to the waiting room at the encore step; a character of the hand paid, it comes back rested', () => {
    const start = game('NIK_S135', { step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, NIK(102), stageSlot(0, 'BL'));
      take(ctx, 0, NIK(87), stageSlot(0, 'FC'));
      getInstance(ctx.state, at(ctx.state, 0, 'FC')).orientation = 'REVERSE';
      take(ctx, 0, NIK(4), zone(0, 'hand'));
    });
    const asked = until(start, (r) => asks(r, 'CONFIRM', 'PAY_COST'));
    const done = pick(accept(asked), [NIK(4)]);
    expect(getInstance(done.state, at(done.state, 0, 'FC'))).toMatchObject({ cardId: NIK(87), orientation: 'REST' });
    expect(zoneCards(done.state, 0, 'waitingRoom')).toEqual([NIK(4)]);
  });

  /** NIK-102 on top of the clock or under another card; three 《インフィニティレール》 characters or two. */
  const alarm = (top: boolean, rails = 3) =>
    game('NIK_S135', { step: 'ATTACK_START' }, (ctx) => {
      if (!top) take(ctx, 0, NIK(4), zone(0, 'clock'));
      take(ctx, 0, NIK(102), zone(0, 'clock'));
      if (!top) take(ctx, 0, NIK(4), zone(0, 'clock'));
      [NIK(85), NIK(87), NIK(95)].slice(0, rails).forEach((c, k) => take(ctx, 0, c, stageSlot(0, (['FL', 'FC', 'FR'] as const)[k]!)));
      stackTop(ctx, 0, [NIK(72)]);
    });

  it('【自】【クロック】 アラーム on top of the clock, three 《インフィニティレール》 characters: at the start of the attack phase the top card may go to the stock', () => {
    const asked = alarm(true);
    expect(pending(asked.state, 'CONFIRM')).toMatchObject({ prompt: 'USE_ABILITY' });
    expect(zoneCards(accept(asked).state, 0, 'stock')).toEqual([NIK(72)]);
  });

  it('not on top of the clock, or two such characters: nothing', () => {
    expect(asks(alarm(false), 'CONFIRM', 'USE_ABILITY')).toBe(false);
    expect(asks(alarm(true, 2), 'CONFIRM', 'USE_ABILITY')).toBe(false);
  });
});

describe('NIK/S135-089 リトルマーメイド - アビスフラワー', () => {
  it('【永】 「“セイレーンソング”リトルマーメイド」 in the centre: ＋500, and the opponent’s effects cannot choose it', () => {
    // Player 1's turn: its NIK-100 rests to choose one of player 0's characters.
    const start = game(
      'NIK_S135',
      { step: 'MAIN_START', turnPlayer: 1 },
      (ctx) => {
        take(ctx, 0, NIK(89), stageSlot(0, 'BL'));
        take(ctx, 0, NIK(84), stageSlot(0, 'FC'));
        take(ctx, 0, NIK(4), stageSlot(0, 'FL'));
        take(ctx, 1, NIK(100), stageSlot(1, 'BL'));
      },
    );
    expect(getPower(start.state, at(start.state, 0, 'FC'))).toBe(printed(NIK(84)).power! + 500);
    const choosing = then(start, { kind: 'MAIN', action: { type: 'ACTIVATE', card: oid(start.state, at(start.state, 1, 'BL')), ability: 1 } });
    // The centre character is not offered; NIK-089 itself and the left one are.
    expect(offered(choosing)).toEqual([NIK(4), NIK(89)].sort());
  });

  /** In the centre with one stock card; on top four cards, OLD TALES among them or not; NIK-008 in the waiting room. */
  const setup = (climax: boolean) =>
    game('NIK_S135', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, NIK(89), stageSlot(0, 'FC'));
      take(ctx, 0, NIK(4), stageSlot(0, 'FL'));
      take(ctx, 0, NIK(72), zone(0, 'stock'));
      take(ctx, 0, NIK(8), zone(0, 'waitingRoom'));
      stackTop(ctx, 0, [climax ? NIK(53) : NIK(4), NIK(104), NIK(104), NIK(105)]);
    });

  it('【起】 集中: per OLD TALES, a character back to the hand, then a character of yours is given 「相手のターン中、相手の効果に選ばれない」 until the end of the opponent’s next turn', () => {
    const back = activate(setup(true), 'FC', 1);
    const giving = pick(back, [NIK(8)]);
    expect(zoneCards(giving.state, 0, 'hand')).toEqual([NIK(8)]);
    const done = then(giving, { kind: 'SELECT_CARDS', cards: [oid(giving.state, at(giving.state, 0, 'FL'))] });
    const grant = done.state.grants.find((g) => g.objectId === oid(done.state, at(done.state, 0, 'FL')));
    expect(grant).toMatchObject({ ability: { type: 'CONT', untargetable: true, condition: { if: 'OPPONENT_TURN' } }, untilTurn: done.state.turn!.number + 1 });
  });

  it('no such climax among the four: nothing more', () => {
    expect(activate(setup(false), 'FC', 1).state.pending?.kind).toBe('MAIN');
  });
});

describe('NIK/S135-030 “ガラスの靴・フルコンタクト”シンデレラ', () => {
  /** In the centre; OLD TALES in the climax zone; NIK-008 and 穢れなき銀白 (event) in the waiting room. */
  const setup = () =>
    game('NIK_S135', { step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, NIK(30), stageSlot(0, 'FC'));
      take(ctx, 0, NIK(53), zone(0, 'climax'));
      take(ctx, 0, NIK(8), zone(0, 'waitingRoom'));
      take(ctx, 0, NIK(51), zone(0, 'waitingRoom'));
      take(ctx, 1, NIK(4), stageSlot(1, 'FC'));
      stackTop(ctx, 0, [NIK(72), NIK(72)]);
    });
  const combo = (run: Run): Run => abilityFirst(run, NIK(30), 1);

  it('【CXコンボ】 two cards of the waiting room: one to the hand, the other to the stock; and it gains the ability until the end of the opponent’s next turn', () => {
    const choosing = combo(attack(setup(), 'FC'));
    expect(pending(choosing.state, 'SELECT_CARDS')).toMatchObject({ min: 0, max: 2 });
    const splitting = pick(choosing, [NIK(8), NIK(51)]);
    const done = pick(splitting, [NIK(51)]);
    expect(zoneCards(done.state, 0, 'hand')).toEqual([NIK(51)]);
    expect(zoneCards(done.state, 0, 'stock')).toContain(NIK(8));
    const grant = done.state.grants.find((g) => g.objectId === oid(done.state, at(done.state, 0, 'FC')));
    expect(grant).toMatchObject({ ability: { trigger: { on: 'FACING_ATTACKS' } }, untilTurn: done.state.turn!.number + 1 });
  });

  it('when the character facing it attacks: up to two looked at, one under it face down, the rest each on top or away', () => {
    // The ability as gained, on the opponent's turn: player 1 attacks with the character facing NIK-030.
    const start = game('NIK_S135', { step: 'ATTACK_START', turnPlayer: 1 }, (ctx) => {
      take(ctx, 0, NIK(30), stageSlot(0, 'FC'));
      take(ctx, 1, NIK(4), stageSlot(1, 'FC'));
      stackTop(ctx, 0, [NIK(8), NIK(104)]);
      stackTop(ctx, 1, [NIK(72)]);
    });
    start.state.grants.push({ objectId: oid(start.state, at(start.state, 0, 'FC')), ability: (printed(NIK(30)).abilities![1] as { effect: { ability?: unknown }[] }).effect[2]!.ability as never, untilTurn: start.state.turn!.number });
    const looking = until(then(start, { kind: 'ATTACK', attack: { attacker: oid(start.state, at(start.state, 1, 'FC')), type: 'FRONT' } }), (r) => asks(r, 'CONFIRM', 'LOOK_NEXT'));
    const under = accept(accept(looking));
    expect(pending(under.state, 'SELECT_CARDS')).toMatchObject({ player: 0, prompt: 'EFFECT_UNDER_SELF' });
    const keeping = pick(under, [NIK(8)]);
    const marker = keeping.state.zones[0].marker.FC;
    expect(names(keeping.state, marker)).toEqual([NIK(8)]);
    expect(getInstance(keeping.state, marker[0]!).face).toBe('DOWN');
    const done = pick(keeping, []);
    expect(zoneCards(done.state, 0, 'waitingRoom')).toEqual([NIK(104)]);
  });
});

describe('STS/W140-039 烈火の秘伝書 チーシア', () => {
  /** Level 1 (a red card); two stock cards; in the hand with STS-041 (level 1) and a climax; STS-011 (green, level 1, 《巡遊者》) and STS-003 (level 3) in the waiting room. */
  const setup = () =>
    game('STS_W140', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, STS(39), zone(0, 'hand'));
      take(ctx, 0, STS(41), zone(0, 'hand'));
      take(ctx, 0, STS(99), zone(0, 'hand'));
      take(ctx, 0, STS(38), zone(0, 'level'));
      for (const c of [STS(9), STS(9)]) take(ctx, 0, c, zone(0, 'stock'));
      take(ctx, 0, STS(11), zone(0, 'waitingRoom'));
      take(ctx, 0, STS(3), zone(0, 'waitingRoom'));
      stackTop(ctx, 0, [STS(25), STS(26)]);
    });
  const playable = (run: Run, cardId: string) =>
    pending(run.state, 'MAIN').actions.some((a) => a.type === 'PLAY_CHARACTER' && cardOf(run.state, a.card) === cardId && getInstance(run.state, run.state.instances.find((i) => i.objectId === a.card)!.instanceId).location.zone === 'waitingRoom');

  it('【自】 in the main phase, a level 1 card of the hand paid (not a climax): a 《巡遊者》 character of level 1 or lower may be played from the waiting room this main phase, without its colour, paying its cost', () => {
    const played = abilityFirst(playCharacter(setup(), STS(39), 'FC'), STS(39), 1);
    const paying = accept(played);
    expect(offered(paying)).toEqual([STS(41)]);
    const choosing = pick(paying, [STS(41)]);
    // Level 1 or lower: STS-011 and STS-041 (the card just paid); not STS-003 (level 3).
    expect(offered(choosing)).toEqual([STS(11), STS(41)].sort());
    const permitted = until(pick(choosing, [STS(11)]), (r) => r.state.pending?.kind === 'MAIN');
    expect(playable(permitted, STS(11))).toBe(true);
    const wr = permitted.state.zones[0].waitingRoom.find((i) => getInstance(permitted.state, i).cardId === STS(11))!;
    const done = then(permitted, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(permitted.state, wr), slot: 'FL' } });
    expect(getInstance(done.state, at(done.state, 0, 'FL')).cardId).toBe(STS(11));
    expect(done.state.zones[0].stock).toHaveLength(2 - printed(STS(11)).cost!);
  });

  it('not paid: no card may be played from the waiting room', () => {
    const declined = until(decline(abilityFirst(playCharacter(setup(), STS(39), 'FC'), STS(39), 1)), (r) => r.state.pending?.kind === 'MAIN');
    expect(playable(declined, STS(11))).toBe(false);
  });
});
