/**
 * Tests for the cards of batch 16, with the real card data (each card in a game of its own booster, both players
 * with every card of it, three copies each): NIK/S135-010 (Level 3: a 【起】 it has in the waiting room; put on the
 * stage by that 【起】, it triggers), NIK/S135-033 (from the hand or the markers under it, standing),
 * ANM/W138-071 (another character and this card to memory, back on separate slots at the next draw phase) and
 * ANM/W138-018 (named 「亮」 while it has no marker).
 */

import { describe, expect, it } from 'vitest';
import { type Choice, type Ctx, type Decision, type GameEvent, type GameState, type PlayerId, type SlotId, getInstance, getPower, matchesFilter, stageSlot } from '@wso/game-engine';
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
  NIK_S135: [NIK(3), NIK(4), NIK(8), NIK(16), NIK(19), NIK(37), NIK(65), NIK(72), NIK(84), NIK(85), NIK(87), NIK(95), NIK(104), NIK(105)],
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
const pickOnStage = (run: Run, player: PlayerId, slot: SlotId): Run => then(run, { kind: 'SELECT_CARDS', cards: [oid(run.state, at(run.state, player, slot))] });
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
    for (const cardId of [NIK(10), NIK(33), ANM(71), ANM(18)]) {
      expect(getCard(cardId).record.support, cardId).toBe('verified');
      const lines = getCard(cardId).official.text.split('<br>');
      expect(printed(cardId).abilities).toHaveLength(lines.length);
      printed(cardId).abilities!.forEach((a, i) => expect(a).toEqual(readLine(lines[i]!).line!.ability));
    }
  });

  it('the new parts', () => {
    expect(readLine(line(NIK(10), 0)).line!.ability).toMatchObject({ type: 'CONT', zone: 'WAITING_ROOM', gains: [{ type: 'ACT', effect: [{ do: 'PLACE_IN_EMPTY_SLOT', target: { who: 'SELF' }, fromWaitingRoom: true }] }] });
    expect(readLine(line(NIK(10), 1)).line!.ability).toMatchObject({ trigger: { on: 'PLACED_ON_STAGE', from: 'HAND_OR_ACT', actOf: 'バイパー - シャイン・オブ・ラブ' } });
    expect(readLine(line(ANM(18), 1)).line!.ability).toMatchObject({ condition: { if: 'MARKERS', of: 'SELF', max: 0 }, nameAs: '亮' });
    expect(effectOf(line(ANM(71), 0))).toMatchObject([{ do: 'CHOOSE', other: true }, { do: 'MOVE', target: { who: 'CHOSEN_AND_SELF' }, to: 'MEMORY' }, { do: 'DELAYED', at: { phase: 'DRAW', whose: 'YOURS' } }]);
    // A waiting-room 【永】 that does more than give a 【起】 is not read.
    expect(readLine('【永】 控え室にこのカードがあるなら、あなたのキャラすべてに、パワーを＋500。').line).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------

describe('NIK/S135-010 バイパー - シャイン・オブ・ラブ', () => {
  /** In the waiting room with a climax; level 3 (or 2); two stock cards; two hand cards; NIK-004 (《NIKKE》) on the stage. */
  const setup = (level = 3, stageCard = NIK(4)) =>
    game('NIK_S135', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, NIK(10), zone(0, 'waitingRoom'));
      take(ctx, 0, NIK(53), zone(0, 'waitingRoom'));
      for (const c of [NIK(8), NIK(72), NIK(104)].slice(0, level)) take(ctx, 0, c, zone(0, 'level'));
      for (const c of [NIK(105), NIK(105)]) take(ctx, 0, c, zone(0, 'stock'));
      for (const c of [NIK(16), NIK(19)]) take(ctx, 0, c, zone(0, 'hand'));
      take(ctx, 0, stageCard, stageSlot(0, 'FL'));
    });
  const offeredHere = (run: Run) => pending(run.state, 'MAIN').actions.filter((a) => a.type === 'ACTIVATE' && cardOf(run.state, a.card) === NIK(10));

  it('【永】 in the waiting room, level 3 and only 《NIKKE》 characters: its 【起】 ((1), two hand cards) puts it into an empty slot; then its 【自】 triggers: (1), a climax back to the hand', () => {
    const start = setup();
    const actions = offeredHere(start);
    expect(actions).toHaveLength(1);
    const paying = then(start, { kind: 'MAIN', action: actions[0]! });
    expect(pending(paying.state, 'SELECT_CARDS')).toMatchObject({ prompt: 'COST_DISCARD', min: 2, max: 2 });
    const placing = pick(paying, [NIK(16), NIK(19)]);
    const placed = then(placing, { kind: 'SELECT_SLOT', slot: 'FC' });
    expect(getInstance(placed.state, at(placed.state, 0, 'FC')).cardId).toBe(NIK(10));
    const asked = until(placed, (r) => asks(r, 'CONFIRM', 'PAY_COST'));
    const done = pick(accept(asked), [NIK(53)]);
    expect(zoneCards(done.state, 0, 'hand')).toEqual([NIK(53)]);
  });

  it('level 2: not offered (every character of this booster has 《NIKKE》; the trait condition is tested with synthetic cards in abilities-batch-23)', () => {
    expect(offeredHere(setup(2))).toHaveLength(0);
  });
});

describe('NIK/S135-033 棺を背負う者 グレイブ', () => {
  /** In the centre (standing or rested); a 「“ガラスの靴・フルコンタクト”シンデレラ」 in the hand and one under it face up; OLD TALES in the hand; a green clock card. */
  const setup = (rested = false) =>
    game('NIK_S135', { step: 'CLIMAX_START' }, (ctx) => {
      take(ctx, 0, NIK(33), stageSlot(0, 'FC'), rested ? { orientation: 'REST' } : undefined);
      take(ctx, 0, NIK(30), { player: 0, zone: 'marker', slot: 'FC' }, { face: 'UP' });
      take(ctx, 0, NIK(30), zone(0, 'hand'));
      take(ctx, 0, NIK(53), zone(0, 'hand'));
      take(ctx, 0, NIK(37), zone(0, 'clock'));
    });
  const place = (run: Run): Run => abilityFirst(then(run, { kind: 'CLIMAX', card: oid(run.state, inHand(run.state, 0, NIK(53))) }), NIK(33), 2);

  it('【CXコンボ】 OLD TALES placed in the climax phase, standing: one from the hand or from under it to any slot, and this card to the waiting room', () => {
    const asked = place(setup());
    expect(pending(asked.state, 'CONFIRM')).toMatchObject({ prompt: 'USE_ABILITY' });
    const choosing = accept(asked);
    expect(offered(choosing)).toEqual([NIK(30), NIK(30)]);
    const marker = choosing.state.zones[0].marker.FC[0]!;
    const slotting = then(choosing, { kind: 'SELECT_CARDS', cards: [oid(choosing.state, marker)] });
    const done = then(slotting, { kind: 'SELECT_SLOT', slot: 'FL' });
    expect(getInstance(done.state, at(done.state, 0, 'FL')).cardId).toBe(NIK(30));
    expect(zoneCards(done.state, 0, 'waitingRoom')).toContain(NIK(33));
  });

  it('rested: nothing is asked', () => {
    expect(asks(place(setup(true)), 'CONFIRM', 'USE_ABILITY')).toBe(false);
  });
});

describe('ANM/W138-071 “文化祭デート”陽彩', () => {
  /** In the centre with ANM-009 beside it; two stock cards; the attack phase begins (no attack: the encore step follows). */
  const setup = () =>
    game('ANM_W138', { step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, ANM(71), stageSlot(0, 'FC'));
      take(ctx, 0, ANM(9), stageSlot(0, 'FL'));
      for (const c of [ANM(16), ANM(16)]) take(ctx, 0, c, zone(0, 'stock'));
    });

  it('【自】 at your encore step, (2): another character and this card to memory; at your next draw phase, both back on separate slots', () => {
    const asked = until(setup(), (r) => asks(r, 'CONFIRM', 'PAY_COST'));
    const gone = pick(accept(asked), [ANM(9)]);
    expect(zoneCards(gone.state, 0, 'memory')).toEqual([ANM(71), ANM(9)].sort());
    const first = until(gone, (r) => r.state.pending?.kind === 'SELECT_SLOT' && r.state.pending.player === 0);
    expect(first.state.turn).toMatchObject({ player: 0, phase: 'DRAW' });
    const second = then(first, { kind: 'SELECT_SLOT', slot: 'FC' });
    expect(pending(second.state, 'SELECT_SLOT').slots).not.toContain('FC');
    const done = then(second, { kind: 'SELECT_SLOT', slot: 'BL' });
    expect(zoneCards(done.state, 0, 'memory')).toEqual([]);
    expect([at(done.state, 0, 'FC'), at(done.state, 0, 'BL')].map((id) => getInstance(done.state, id).cardId).sort()).toEqual([ANM(71), ANM(9)].sort());
  });

  it('not paid: nothing', () => {
    const declined = decline(until(setup(), (r) => asks(r, 'CONFIRM', 'PAY_COST')));
    expect(zoneCards(declined.state, 0, 'memory')).toEqual([]);
  });
});

describe('ANM/W138-018 “真澄町のバーテンダー兼探偵”健', () => {
  /** Two copies: in the centre and on the left; ANM-005 opposite. */
  const setup = () =>
    game('ANM_W138', { step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, ANM(18), stageSlot(0, 'FC'));
      take(ctx, 0, ANM(18), stageSlot(0, 'FL'));
      take(ctx, 1, ANM(5), stageSlot(1, 'FC'));
      stackTop(ctx, 0, [ANM(9), ANM(9)]);
    });

  it('【永】 no marker under it: its name is 「亮」 (not its own)', () => {
    const start = setup();
    expect(matchesFilter(start.state, at(start.state, 0, 'FC'), { name: '亮' })).toBe(true);
    expect(matchesFilter(start.state, at(start.state, 0, 'FC'), { name: printed(ANM(18)).name })).toBe(false);
  });

  it('【自】 when it attacks: another 「亮」 of yours under it as a marker, face up; then ＋3000 and its own name again', () => {
    const asked = abilityFirst(attack(setup(), 'FC'), ANM(18), 2);
    expect(pending(asked.state, 'CONFIRM')).toMatchObject({ prompt: 'USE_ABILITY' });
    const choosing = accept(asked);
    expect(offered(choosing)).toEqual([ANM(18)]);
    const done = pickOnStage(choosing, 0, 'FL');
    const fc = at(done.state, 0, 'FC');
    expect(names(done.state, done.state.zones[0].marker.FC)).toEqual([ANM(18)]);
    expect(getPower(done.state, fc)).toBe(printed(ANM(18)).power! + 3000);
    expect(matchesFilter(done.state, fc, { name: printed(ANM(18)).name })).toBe(true);
  });
});
