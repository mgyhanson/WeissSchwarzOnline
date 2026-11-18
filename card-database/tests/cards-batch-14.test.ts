/**
 * Tests for the cards of batch 14, with the real card data (each card in a game of its own booster, both players
 * with every card of it, three copies each): BDY/W135-005 (two trigger checks, then an ability for the turn),
 * NIK/S135-018 (named climaxes exchanged between the deck and the hand), NIK/S135-100 (他のあなたの…が【リバース】した時),
 * ANM/W138-007 (a card from the hand into the slot this one was in, given a 【ターン2】 ability), STS/W140-001 (加速's
 * cost; an activated ability usable only while a condition holds), BDY/W135-058 (at every encore step, no other rested
 * front-row character) and STS/W140-060 (a standby climax placed or triggered; a character of level ＋1 or lower).
 */

import { describe, expect, it } from 'vitest';
import { type Choice, type Ctx, type Decision, type GameEvent, type GameState, type PlayerId, type SlotId, getInstance, stageSlot } from '@wso/game-engine';
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
  NIK_S135: [NIK(3), NIK(4), NIK(8), NIK(16), NIK(19), NIK(30), NIK(33), NIK(65), NIK(72), NIK(104), NIK(105)],
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
const shuffled = (run: Run): number => run.events.filter((e) => e.type === 'DECK_SHUFFLED').length;

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
  it('the seven cards: every ability of each is in its data, read from its official line', () => {
    for (const cardId of [BDY(5), NIK(18), NIK(100), ANM(7), STS(1), BDY(58), STS(60)]) {
      expect(getCard(cardId).record.support, cardId).toBe('verified');
      const lines = getCard(cardId).official.text.split('<br>');
      expect(printed(cardId).abilities).toHaveLength(lines.length);
      printed(cardId).abilities!.forEach((a, i) => expect(a).toEqual(readLine(lines[i]!).line!.ability));
    }
  });

  it('the new parts', () => {
    expect(effectOf(line(BDY(5), 1))).toMatchObject([{ do: 'TRIGGER_CHECKS', count: 2 }, { do: 'GRANT', target: { who: 'SELF' }, ability: { trigger: { on: 'BATTLE_OPPONENT_REVERSED' }, cost: [{ pay: 'STOCK', count: 1 }] } }]);
    expect(readLine(line(NIK(100), 0)).line!.ability).toMatchObject({ trigger: { on: 'OTHER_REVERSED', filter: { kind: 'CHARACTER', traits: ['NIKKE'] } }, effect: [{ do: 'MOVE', target: { who: 'THAT' }, to: 'HAND' }] });
    expect(readLine(line(STS(1), 1)).line!.ability).toMatchObject({ type: 'ACT', limit: 1, condition: { if: 'COUNT', where: 'YOUR_MEMORY_AND_MARKERS', max: 1 } });
    expect(readLine(line(BDY(58), 2)).line!.ability).toMatchObject({ trigger: { on: 'STEP_START', step: 'ENCORE', turn: 'ANY' }, condition: { filter: { rested: true }, max: 0 } });
    expect(readLine(line(STS(60), 0)).line!.ability).toMatchObject({ trigger: { on: 'EITHER' }, limit: 1 });
    expect(effectOf(line(STS(60), 0))).toMatchObject([{ do: 'CHOOSE', filter: { levelAtMostOwnLevel: true, ownLevelPlus: 1 } }, { do: 'CHOOSE_SLOT' }, { do: 'MOVE', rested: true }]);
    // A condition that cannot be read leaves the 【起】 unread.
    expect(readLine('【起】［(1)］ この能力は相手の山札が5枚以下なら使える。あなたは1枚引く。').line).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------

describe('BDY/W135-005 宣誓布告 仲町あられ', () => {
  /** In the centre with BDY-001 (《音楽》) beside it; 「コハク」 in the climax zone or not; BDY-001 (1000) opposite; one character in the waiting room. */
  const setup = (combo: boolean) =>
    game('BDY_W135', { step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, BDY(5), stageSlot(0, 'FC'));
      take(ctx, 0, BDY(1), stageSlot(0, 'FL'));
      if (combo) take(ctx, 0, BDY(27), zone(0, 'climax'));
      take(ctx, 0, BDY(7), zone(0, 'waitingRoom'));
      take(ctx, 1, BDY(1), stageSlot(1, 'FC'));
      stackTop(ctx, 0, [BDY(19), BDY(2), BDY(35)]);
    });

  it('【CXコンボ】 two trigger checks in that attack; then the ability gained: the battle opponent reversed, (1) paid, a character back to the hand', () => {
    const counter = until(attack(setup(true), 'FC'), (r) => r.state.pending?.kind === 'COUNTER');
    expect(zoneCards(counter.state, 0, 'stock')).toEqual([BDY(19), BDY(2)].sort());
    const asked = until(counter, (r) => asks(r, 'CONFIRM', 'PAY_COST'));
    const done = pick(accept(asked), [BDY(7)]);
    expect(zoneCards(done.state, 0, 'hand')).toEqual([BDY(7)]);
  });

  it('without 「コハク」: one trigger check, nothing gained', () => {
    const counter = until(attack(setup(false), 'FC'), (r) => r.state.pending?.kind === 'COUNTER');
    expect(zoneCards(counter.state, 0, 'stock')).toEqual([BDY(19)]);
  });
});

describe('NIK/S135-018 “弱者の生存術”モリー', () => {
  /** OLD TALES in the hand; played from the hand. */
  const setup = () =>
    game('NIK_S135', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, NIK(18), zone(0, 'hand'));
      take(ctx, 0, NIK(53), zone(0, 'hand'));
    });

  it('【CXコンボ】 played from the hand: UNBREAKABLE SPHERE or OLD TALES from the deck and from the hand, shown and exchanged; then the shuffle', () => {
    const asked = playCharacter(setup(), NIK(18), 'FC');
    expect(pending(asked.state, 'CONFIRM')).toMatchObject({ prompt: 'USE_ABILITY' });
    const fromDeck = accept(asked);
    expect([...new Set(offered(fromDeck))]).toEqual([NIK(110), NIK(53)].sort());
    const fromHand = pick(fromDeck, [NIK(110)]);
    expect(offered(fromHand)).toEqual([NIK(53)]);
    const done = pick(fromHand, [NIK(53)]);
    expect(zoneCards(done.state, 0, 'hand')).toEqual([NIK(110)]);
    expect(shuffled(done)).toBe(1);
  });

  it('declined: nothing', () => {
    const done = decline(playCharacter(setup(), NIK(18), 'FC'));
    expect(zoneCards(done.state, 0, 'hand')).toEqual([NIK(53)]);
  });
});

describe('NIK/S135-100 “フェイタルエラー！”マナ', () => {
  /** In the back row or the front row; NIK-004 (1000, 《NIKKE》) attacks NIK-008 (4000), so it is reversed. */
  const setup = (slot: SlotId = 'BL') =>
    game('NIK_S135', { step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, NIK(100), stageSlot(0, slot));
      take(ctx, 0, NIK(4), stageSlot(0, 'FC'));
      take(ctx, 1, NIK(8), stageSlot(1, 'FC'));
      stackTop(ctx, 0, [NIK(72), NIK(72)]);
    });

  it('【自】 another 《NIKKE》 character reversed, this card in the back row: this card to the bottom of the deck, that character back to the hand', () => {
    const asked = until(attack(setup(), 'FC'), (r) => asks(r, 'CONFIRM', 'PAY_COST'));
    const done = accept(asked);
    expect(zoneCards(done.state, 0, 'hand')).toEqual([NIK(4)]);
    expect(names(done.state, [done.state.zones[0].deck[0]!])).toEqual([NIK(100)]);
  });

  it('in the front row: nothing is asked', () => {
    const run = until(attack(setup('FL'), 'FC'), (r) => asks(r, 'CONFIRM', 'PAY_COST') || r.state.pending?.kind === 'ATTACK');
    expect(asks(run, 'CONFIRM', 'PAY_COST')).toBe(false);
  });

  it('【起】 rested: an opponent character cannot be moved to another slot until the end of the opponent’s next turn', () => {
    const start = game('NIK_S135', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, NIK(100), stageSlot(0, 'BL'));
      take(ctx, 1, NIK(8), stageSlot(1, 'FC'));
    });
    const done = then(activate(start, 'BL', 1), { kind: 'SELECT_CARDS', cards: [oid(start.state, at(start.state, 1, 'FC'))] });
    const grant = done.state.grants.find((g) => g.objectId === oid(done.state, at(done.state, 1, 'FC')));
    expect(grant).toMatchObject({ ability: { type: 'CONT', cannotMove: true }, untilTurn: done.state.turn!.number + 1 });
  });
});

describe('ANM/W138-007 “風の回廊へ”朱比華', () => {
  /** In the centre, alone in the front row; 「わけ与える命」 in the climax zone; another copy in the hand; ANM-012 (《風》) in the waiting room. */
  const setup = () =>
    game('ANM_W138', { step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, ANM(7), stageSlot(0, 'FC'));
      take(ctx, 0, ANM(25), zone(0, 'climax'));
      take(ctx, 0, ANM(7), zone(0, 'hand'));
      take(ctx, 0, ANM(12), zone(0, 'waitingRoom'));
      take(ctx, 1, ANM(5), stageSlot(1, 'FC'));
      stackTop(ctx, 0, [ANM(9), ANM(16), ANM(17), ANM(5)]);
    });

  it('【CXコンボ】 this card to the waiting room: up to two drawn, a 《風》 character to the stock, the other copy into its slot; that one stands and moves after its attack, twice a turn', () => {
    const asked = setup();
    expect(pending(asked.state, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST' });
    const drawing = accept(asked);
    expect(asks(drawing, 'CONFIRM', 'DRAW_NEXT')).toBe(true);
    const stocking = accept(accept(drawing));
    const placing = pick(stocking, [ANM(12)]);
    expect(zoneCards(placing.state, 0, 'stock')).toEqual([ANM(12)]);
    const placed = pick(placing, [ANM(7)]);
    expect(getInstance(placed.state, at(placed.state, 0, 'FC')).cardId).toBe(ANM(7));
    expect(zoneCards(placed.state, 0, 'waitingRoom')).toEqual([ANM(7)]);
    // Its attack ends: stood and moved to an empty slot.
    const moving = until(attack(until(placed, (r) => r.state.pending?.kind === 'ATTACK'), 'FC'), (r) => r.state.pending?.kind === 'SELECT_SLOT');
    const moved = then(moving, { kind: 'SELECT_SLOT', slot: 'FL' });
    expect(getInstance(moved.state, at(moved.state, 0, 'FL'))).toMatchObject({ cardId: ANM(7), orientation: 'STAND' });
  });

  it('not paid: nothing', () => {
    const done = decline(setup());
    expect(getInstance(done.state, at(done.state, 0, 'FC')).cardId).toBe(ANM(7));
    expect(zoneCards(done.state, 0, 'hand')).toEqual([ANM(7)]);
  });
});

describe('STS/W140-001 黎明の刻 レイス', () => {
  it('【自】 played from the hand, (1) and a 《巡遊者》 character of the waiting room under the clock: a character of level 1 or lower from the deck', () => {
    const start = game('STS_W140', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, STS(1), zone(0, 'hand'));
      take(ctx, 0, STS(9), zone(0, 'stock'));
      take(ctx, 0, STS(41), zone(0, 'waitingRoom'));
      take(ctx, 0, STS(26), zone(0, 'clock'));
    });
    const paying = accept(playCharacter(start, STS(1), 'FC'));
    const searching = pick(paying, [STS(41)]);
    expect(names(searching.state, searching.state.zones[0].clock)).toEqual([STS(41), STS(26)]);
    expect(offered(searching)).not.toContain(STS(3));
    expect(zoneCards(pick(searching, [STS(11)]).state, 0, 'hand')).toEqual([STS(11)]);
  });

  /** In the centre; STS-015 (回想) beside it; `memory` cards in memory; the top card. */
  const field = (memory: number, top: string) =>
    game('STS_W140', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, STS(1), stageSlot(0, 'FC'));
      take(ctx, 0, STS(15), stageSlot(0, 'FL'));
      take(ctx, 0, STS(9), stageSlot(0, 'FR'));
      for (const c of [STS(26), STS(26)].slice(0, memory)) take(ctx, 0, c, zone(0, 'memory'));
      stackTop(ctx, 0, [top]);
    });

  it('【起】 another 《回想》 character to memory, with one card or none in memory and markers: the top card shown, a level 0 character taken', () => {
    const asked = activate(field(1, STS(9)), 'FC', 1);
    expect(offered(asked)).toEqual([STS(15)]);
    const done = pick(asked, [STS(15)]);
    expect(zoneCards(done.state, 0, 'memory')).toEqual([STS(15), STS(26)].sort());
    expect(zoneCards(done.state, 0, 'hand')).toEqual([STS(9)]);
  });

  it('two cards in memory: it cannot be played', () => {
    const run = field(2, STS(9));
    expect(pending(run.state, 'MAIN').actions.some((a) => a.type === 'ACTIVATE' && a.card === oid(run.state, at(run.state, 0, 'FC')) && a.ability === 1)).toBe(false);
  });
});

describe('BDY/W135-058 苦手なもの 藤都子', () => {
  /** In the centre with one stock card; BDY-001 beside it, rested or not; the attack phase begins (no attack: the encore step follows). */
  const setup = (restedBeside: boolean) =>
    game('BDY_W135', { step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, BDY(58), stageSlot(0, 'FC'));
      take(ctx, 0, BDY(1), stageSlot(0, 'FL'));
      if (restedBeside) getInstance(ctx.state, at(ctx.state, 0, 'FL')).orientation = 'REST';
      take(ctx, 0, BDY(2), zone(0, 'stock'));
    });

  it('【自】 at the start of the encore step, no other rested front-row character: (1) paid, this card rested', () => {
    const asked = until(then(setup(false), { kind: 'ATTACK', attack: null }), (r) => asks(r, 'CONFIRM', 'PAY_COST'));
    const done = accept(asked);
    expect(getInstance(done.state, at(done.state, 0, 'FC')).orientation).toBe('REST');
  });

  it('another front-row character rested: nothing is asked', () => {
    const run = until(then(setup(true), { kind: 'ATTACK', attack: null }), (r) => asks(r, 'CONFIRM', 'PAY_COST') || r.state.turn?.player === 1);
    expect(asks(run, 'CONFIRM', 'PAY_COST')).toBe(false);
  });
});

describe('STS/W140-060 巡遊者 シア', () => {
  /** In the centre with a marker under it or not; level 1 (a red card); a standby climax in the hand; STS-041 (1), STS-022 (2), STS-003 (3) in the waiting room. */
  const setup = (marker: boolean) =>
    game('STS_W140', { step: 'CLIMAX_START' }, (ctx) => {
      take(ctx, 0, STS(60), stageSlot(0, 'FC'));
      if (marker) take(ctx, 0, STS(26), { player: 0, zone: 'marker', slot: 'FC' });
      take(ctx, 0, STS(41), zone(0, 'level'));
      take(ctx, 0, STS(64), zone(0, 'hand'));
      for (const c of [STS(41), STS(22), STS(3)]) take(ctx, 0, c, zone(0, 'waitingRoom'));
    });
  const placeClimax = (run: Run): Run => then(run, { kind: 'CLIMAX', card: oid(run.state, inHand(run.state, 0, STS(64))) });

  it('【自】 a standby climax placed, a marker under it: a character of level 2 or lower (your level ＋1) put rested into a slot', () => {
    const asked = abilityFirst(placeClimax(setup(true)), STS(60), 0);
    expect(pending(asked.state, 'CONFIRM')).toMatchObject({ prompt: 'USE_ABILITY' });
    const choosing = accept(asked);
    expect(offered(choosing)).toEqual([STS(22), STS(41)].sort());
    const slot = pick(choosing, [STS(22)]);
    const done = then(slot, { kind: 'SELECT_SLOT', slot: 'BL' });
    expect(getInstance(done.state, at(done.state, 0, 'BL'))).toMatchObject({ cardId: STS(22), orientation: 'REST' });
  });

  it('no marker under it: nothing is asked', () => {
    expect(asks(abilityFirst(placeClimax(setup(false)), STS(60), 0), 'CONFIRM', 'USE_ABILITY')).toBe(false);
  });
});
