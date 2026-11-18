/**
 * Tests for the cards of batch 13, with the real card data (each card in a game of its own booster, both players
 * with every card of it, three copies each):
 * GUP/W141-024, GUP/W141-103 (a search, then a hand card to the waiting room, then the shuffle), GUP/W141-079
 * (a play restriction and one of two effects, on lines of their own), STS/W140-019, NIK/S135-069 (trigger icons given in every zone),
 * ANM/W138-019 (加速: a waiting-room card under the clock), STS/W140-095 (Ｘ from the icon of the card shown),
 * NIK/S135-037 (Ｘ from your waiting room; a card put where this one was), STS/W140-013, NIK/S135-062,
 * NIK/S135-085 (the opponent's deck looked at), ANM/W138-008 (the card a deck-top move put into the waiting room
 * goes to a back slot), ANM/W138-001, BDY/W135-031 (what a brainstorm or a look put into the waiting room),
 * BDY/W135-084 (the opponent chooses among the cards shown, then a look), NIK/S135-044 (two effects in the order
 * the player chooses) and NIK/S135-063 (a quoted action that may be declined).
 */

import { describe, expect, it } from 'vitest';
import { type Choice, type Ctx, type Decision, type GameEvent, type GameState, type PlayerId, type SlotId, getInstance, getPower, stageSlot, triggerIconsOf } from '@wso/game-engine';
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
const choose = (run: Run, option: string): Run => then(run, { kind: 'SELECT_OPTION', option });
const asks = (run: Run, kind: Decision['kind'], prompt?: string): boolean =>
  run.state.pending?.kind === kind && (prompt === undefined || (run.state.pending as { prompt?: string }).prompt === prompt);
const inHand = (state: GameState, player: PlayerId, cardId: string): number => state.zones[player].hand.find((i) => getInstance(state, i).cardId === cardId)!;
const playEvent = (run: Run, cardId: string): Run => then(run, { kind: 'MAIN', action: { type: 'PLAY_EVENT', card: oid(run.state, inHand(run.state, 0, cardId)) } });
const canPlay = (run: Run, cardId: string): boolean => pending(run.state, 'MAIN').actions.some((a) => a.type === 'PLAY_EVENT' && a.card === oid(run.state, inHand(run.state, 0, cardId)));
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
const topCards = (state: GameState, player: PlayerId, n: number): string[] => names(state, state.zones[player].deck.slice(-n).reverse());
const line = (cardId: string, index: number): string => getCard(cardId).official.text.split('<br>')[index]!;
const effectOf = (text: string): unknown => (readLine(text).line!.ability as { effect: unknown }).effect;
const shuffled = (run: Run): number => run.events.filter((e) => e.type === 'DECK_SHUFFLED').length;
const TANK = { kind: 'CHARACTER', traits: ['戦車道'] };

// ---------------------------------------------------------------------------------------------------------

describe('reading the new wordings', () => {
  it('a search, then a hand card to the waiting room, then the shuffle (GUP-103, GUP-024)', () => {
    const search = (max: number, filter: unknown) => [
      { do: 'CHOOSE', from: 'YOUR_DECK', filter, min: 0, max },
      { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND', reveal: true },
      { do: 'CHOOSE', from: 'YOUR_HAND', min: 1, max: 1 },
      { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'WAITING_ROOM' },
      { do: 'SHUFFLE' },
    ];
    expect(effectOf(line(GUP(103), 1))).toEqual(search(1, TANK));
    expect(readLine(line(GUP(103), 1)).line!.ability).toMatchObject({ condition: { if: 'COUNT', where: 'YOUR_CLIMAX', filter: { kind: 'CLIMAX', hasTrigger: 'DRAW' }, min: 1 } });
    expect(printed(GUP(24)).effect).toEqual(search(2, TANK));
  });

  it('a play restriction and a choice of two quoted effects (GUP-079); events of several effect paragraphs stay unsupported', () => {
    expect(printed(GUP(79)).effect).toEqual([{ do: 'CHOOSE_ONE', options: [[{ do: 'LOOK_TOP', upTo: 5, pick: TANK, reveal: true, picks: 2 }], [{ do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { kind: 'CLIMAX', hasTrigger: 'COMEBACK' }, min: 1, max: 1 }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' }]] }]);
    // Every paragraph of these reads by itself, but the Comprehensive Rules do not say how an event's paragraphs relate.
    for (const cardId of [ANM(23), STS(96), NIK(23), ANM(45), NIK(108)]) expect(getCard(cardId).record.support, cardId).toBe('unsupported');
  });

  it('given trigger icons, 加速 and its cost, the icon of the card shown, the opponent’s deck, the card milled', () => {
    expect(readLine(line(STS(19), 0)).line!.ability).toEqual({
      type: 'CONT',
      condition: { if: 'NOT', of: { if: 'CHARACTERS', min: 1, other: true, filter: { name: '風に揺れる気持ち ナツカ' } } },
      givesTriggerIcons: { filter: { kind: 'CLIMAX', hasTrigger: 'TREASURE' }, icons: ['RETURN'] },
      apply: [],
    });
    expect(readLine(line(NIK(69), 0)).line!.ability).toMatchObject({ type: 'CONT', keywords: ['CX_COMBO'], givesTriggerIcons: { filter: { name: 'CODENAME - RED HOOD -' }, icons: ['COMEBACK'] } });
    expect(readLine(line(ANM(19), 1)).line!.ability).toMatchObject({ keywords: ['ACCELERATE'], cost: [{ pay: 'WAITING_ROOM_TO_CLOCK_BOTTOM', count: 1, filter: { kind: 'CHARACTER', traits: ['風'] } }] });
    // 加速 is read only on an ability whose cost puts a card into the clock (CR-10.12.1).
    expect(readLine('【自】 加速 ［手札を1枚控え室に置く］ あなたのCXフェイズの始めに、あなたはコストを払ってよい。そうしたら、あなたは1枚引く。').line).toBeNull();
    expect(effectOf(line(STS(95), 1))).toEqual([
      { do: 'SHOW_TOP', iconX: { icon: 'SOUL', yes: 2, no: 1 } },
      { do: 'LOOK_TOP', upTo: 4, pick: { kind: 'CHARACTER', traits: ['巡遊者', '魔王'] }, reveal: true, picksX: true },
    ]);
    expect(effectOf(line(STS(13), 0))).toEqual([{ do: 'REORDER_TOP', upTo: 2, whose: 'OPPONENT', sameOrder: true }]);
    expect(effectOf(line(NIK(62), 0))).toEqual([{ do: 'REORDER_TOP', upTo: 4, whose: 'OPPONENT', toWaitingRoom: 4 }, { do: 'SHUFFLE', whose: 'OPPONENT' }]);
    // STS/W140-059 (…手札に戻し、…置いてよい after the card milled) stays unsupported (batch 9).
    expect(getCard(STS(59)).record.support).toBe('unsupported');
    expect(effectOf(line(ANM(8), 1))).toEqual([
      { do: 'DECK_TOP', count: 1, to: 'WAITING_ROOM', upTo: true, may: true },
      { do: 'IF', condition: { if: 'LAST_MOVED', min: 1, filter: { kind: 'CHARACTER', levelMax: 0 }, said: 'THAT_CARD' }, then: [{ do: 'CHOOSE_SLOT', which: 'BACK', of: { who: 'MILLED', said: 'CHARACTER' } }, { do: 'MOVE', target: { who: 'MILLED', said: 'CHARACTER' }, to: 'CHOSEN_SLOT' }] },
    ]);
  });

  it('the seventeen cards: every ability of each character is in its data', () => {
    const characters = [ANM(1), ANM(8), ANM(19), BDY(31), BDY(84), GUP(103), NIK(37), NIK(44), NIK(62), NIK(63), NIK(69), NIK(85), STS(13), STS(19), STS(95)];
    for (const cardId of [...characters, GUP(24), GUP(79)]) expect(getCard(cardId).record.support, cardId).toBe('verified');
    for (const cardId of characters) {
      const lines = getCard(cardId).official.text.split('<br>');
      expect(printed(cardId).abilities).toHaveLength(lines.length);
      printed(cardId).abilities!.forEach((a, i) => expect(a).toEqual(readLine(lines[i]!).line!.ability));
    }
  });
});

// ---------------------------------------------------------------------------------------------------------

describe('GUP/W141-024 転校先の選択', () => {
  /** Level 1 (a yellow card), one stock card; GUP-015 (《戦車道》) on the stage or not; GUP-001 and GUP-005 in the hand. */
  const setup = (tank = true) =>
    game('GUP_W141', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, GUP(24), zone(0, 'hand'));
      take(ctx, 0, GUP(5), zone(0, 'hand'));
      take(ctx, 0, GUP(1), zone(0, 'level'));
      take(ctx, 0, GUP(22), zone(0, 'stock'));
      if (tank) take(ctx, 0, GUP(15), stageSlot(0, 'FC'));
    });

  it('cannot be played without a 《戦車道》 character', () => {
    expect(canPlay(setup(false), GUP(24))).toBe(false);
    expect(canPlay(setup(), GUP(24))).toBe(true);
  });

  it('up to two 《戦車道》 characters from the deck to the hand, shown; then one hand card to the waiting room; then the shuffle', () => {
    const searching = playEvent(setup(), GUP(24));
    expect(pending(searching.state, 'SELECT_CARDS')).toMatchObject({ min: 0, max: 2 });
    const discarding = pick(searching, [GUP(8), GUP(3)]);
    expect(discarding.events.filter((e) => e.type === 'CARD_REVEALED')).toHaveLength(2);
    // Not shuffled yet: the discard comes first.
    expect(shuffled(discarding)).toBe(0);
    expect(pending(discarding.state, 'SELECT_CARDS')).toMatchObject({ min: 1, max: 1 });
    // A card just taken may be the one discarded.
    expect(offered(discarding)).toEqual([GUP(3), GUP(5), GUP(8)].sort());
    const done = pick(discarding, [GUP(5)]);
    expect(zoneCards(done.state, 0, 'hand')).toEqual([GUP(3), GUP(8)].sort());
    expect(zoneCards(done.state, 0, 'waitingRoom')).toEqual([GUP(22), GUP(24), GUP(5)].sort());
    expect(shuffled(done)).toBe(1);
  });
});

describe('GUP/W141-079 Alkoholfreies Bier', () => {
  /** Level 2 (red cards), one stock card; GUP-015 on the stage; GUP-080 (salvage climax) in the waiting room. */
  const setup = () =>
    game('GUP_W141', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, GUP(79), zone(0, 'hand'));
      take(ctx, 0, GUP(58), zone(0, 'level'));
      take(ctx, 0, GUP(61), zone(0, 'level'));
      take(ctx, 0, GUP(22), zone(0, 'stock'));
      take(ctx, 0, GUP(15), stageSlot(0, 'FC'));
      take(ctx, 0, GUP(80), zone(0, 'waitingRoom'));
      stackTop(ctx, 0, [GUP(8), GUP(113), GUP(3)]);
    });

  it('the player chooses one of the two effects: the salvage climax back to the hand', () => {
    const asked = playEvent(setup(), GUP(79));
    expect(pending(asked.state, 'SELECT_OPTION')).toMatchObject({ prompt: 'EFFECT_OPTION', options: ['EFFECT_1', 'EFFECT_2'] });
    const choosing = choose(asked, 'EFFECT_2');
    expect(offered(choosing)).toEqual([GUP(80)]);
    expect(zoneCards(pick(choosing, [GUP(80)]).state, 0, 'hand')).toEqual([GUP(80)]);
  });

  it('or: up to five cards looked at, up to two 《戦車道》 characters taken, the rest to the waiting room', () => {
    const looking = choose(playEvent(setup(), GUP(79)), 'EFFECT_1');
    const choosing = decline(accept(accept(accept(looking))));
    expect(pending(choosing.state, 'SELECT_CARDS')).toMatchObject({ min: 0, max: 2 });
    expect(offered(choosing)).toEqual([GUP(3), GUP(8)].sort());
    const done = pick(choosing, [GUP(8), GUP(3)]);
    expect(zoneCards(done.state, 0, 'hand')).toEqual([GUP(3), GUP(8)].sort());
    expect(zoneCards(done.state, 0, 'waitingRoom')).toContain(GUP(113));
  });
});

describe('GUP/W141-103 小さな暴君 カチューシャ', () => {
  /** In the centre; GUP-015 and GUP-022 (《戦車道》) in the back row; a draw-icon climax (遅滞戦術) in the climax zone or not. */
  const setup = (drawIcon = true) =>
    game('GUP_W141', { step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, GUP(103), stageSlot(0, 'FC'));
      take(ctx, 0, GUP(15), stageSlot(0, 'BL'));
      take(ctx, 0, GUP(22), stageSlot(0, 'BR'));
      take(ctx, 0, drawIcon ? GUP(113) : GUP(111), zone(0, 'climax'));
      take(ctx, 0, GUP(5), zone(0, 'hand'));
      take(ctx, 1, GUP(1), stageSlot(1, 'FC'));
      stackTop(ctx, 0, [GUP(1), GUP(1)]);
    });

  it('【永】 ＋1500 per other 《戦車道》 character of the back row', () => {
    const start = setup();
    expect(getPower(start.state, at(start.state, 0, 'FC'))).toBe(printed(GUP(103)).power! + 3000);
  });

  it('【自】 with a draw-icon climax: a 《戦車道》 character from the deck, then a hand card to the waiting room, then the shuffle', () => {
    const searching = attack(setup(), 'FC');
    expect(pending(searching.state, 'SELECT_CARDS')).toMatchObject({ min: 0, max: 1 });
    const discarding = pick(searching, [GUP(4)]);
    expect(offered(discarding)).toEqual([GUP(4), GUP(5)].sort());
    const done = pick(discarding, [GUP(5)]);
    expect(zoneCards(done.state, 0, 'hand')).toEqual([GUP(4)]);
    expect(shuffled(done)).toBe(1);
  });

  it('with a climax of another icon: nothing', () => {
    const run = attack(setup(false), 'FC');
    expect(run.state.pending?.kind).not.toBe('SELECT_CARDS');
    expect(shuffled(run)).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------------

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

describe('STS/W140-013 ムーンシャドウ コゼット', () => {
  it('【自】 played from the hand: the opponent’s top two cards are looked at, one at a time, and stay in their order', () => {
    const start = game('STS_W140', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, STS(13), zone(0, 'hand'));
      take(ctx, 0, STS(3), zone(0, 'level'));
      take(ctx, 0, STS(4), zone(0, 'level'));
      take(ctx, 0, STS(9), zone(0, 'stock'));
      stackTop(ctx, 1, [STS(41), STS(3), STS(99)]);
    });
    const looking = playCharacter(start, STS(13), 'FC');
    expect(pending(looking.state, 'CONFIRM')).toMatchObject({ player: 0, prompt: 'LOOK_NEXT' });
    const second = accept(looking);
    expect(pending(second.state, 'CONFIRM').look).toBeDefined();
    const done = accept(second);
    expect(done.state.pending?.kind).toBe('MAIN');
    expect(topCards(done.state, 1, 3)).toEqual([STS(41), STS(3), STS(99)]);
  });

  /** In the centre; the opponent's front row: STS-041 (level 1) and STS-003 (level 3); on top: three cards each. */
  const field = (climax: boolean) =>
    game('STS_W140', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, STS(13), stageSlot(0, 'FC'));
      take(ctx, 1, STS(41), stageSlot(1, 'FL'));
      take(ctx, 1, STS(3), stageSlot(1, 'FC'));
      stackTop(ctx, 0, [STS(9), STS(11), STS(25)]);
      stackTop(ctx, 1, [STS(26), climax ? STS(99) : STS(38), STS(25)]);
    });

  it('【起】 this card to the waiting room: two cards of each deck to the waiting room, yours first; a climax among the four: up to two front-row characters of level 3 or lower back to the hand', () => {
    const choosing = activate(field(true), 'FC', 1);
    const milled = choosing.events.flatMap((e) => (e.type === 'CARD_MOVED' && e.reason === 'EFFECT' && e.to.zone === 'waitingRoom' ? [`${e.from.player}`] : []));
    expect(milled).toEqual(['0', '0', '1', '1']);
    expect(pending(choosing.state, 'SELECT_CARDS')).toMatchObject({ min: 0, max: 2 });
    expect(offered(choosing)).toEqual([STS(3), STS(41)].sort());
    const done = pick(choosing, [STS(41), STS(3)]);
    expect(zoneCards(done.state, 1, 'hand')).toEqual([STS(3), STS(41)].sort());
  });

  it('no climax among them: nothing more', () => {
    const run = activate(field(false), 'FC', 1);
    expect(run.state.pending?.kind).toBe('MAIN');
    expect(zoneCards(run.state, 0, 'waitingRoom')).toEqual([STS(11), STS(13), STS(9)].sort());
  });
});

describe('STS/W140-019 風に揺れる気持ち ナツカ', () => {
  it('【永】 alone: your treasure climaxes have the bounce icon too, in every zone; not with another of the same name', () => {
    const state = (twin: boolean) =>
      game('STS_W140', { step: 'MAIN_START' }, (ctx) => {
        take(ctx, 0, STS(19), stageSlot(0, 'FC'));
        if (twin) take(ctx, 0, STS(19), stageSlot(0, 'FL'));
        take(ctx, 0, STS(31), zone(0, 'hand'));
        take(ctx, 1, STS(31), zone(1, 'hand'));
      }).state;
    const mine = (s: GameState) => triggerIconsOf(s, inHand(s, 0, STS(31)));
    expect(mine(state(false))).toEqual(['TREASURE', 'RETURN']);
    expect(triggerIconsOf(state(false), inHand(state(false), 1, STS(31)))).toEqual(['TREASURE']);
    expect(mine(state(true))).toEqual(['TREASURE']);
  });

  it('a trigger check that turns over a treasure climax: both icons, in the order the player chooses (CR-7.3.1.2.1)', () => {
    const start = game('STS_W140', { step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, STS(19), stageSlot(0, 'BL'));
      take(ctx, 0, STS(9), stageSlot(0, 'FC'));
      take(ctx, 1, STS(25), stageSlot(1, 'FC'));
      stackTop(ctx, 0, [STS(31)]);
    });
    const order = until(attack(start, 'FC'), (r) => asks(r, 'SELECT_OPTION', 'TRIGGER_ORDER'));
    expect([...pending(order.state, 'SELECT_OPTION').options].sort()).toEqual(['RETURN', 'TREASURE']);
  });

  /** In the centre; 「爽風の才媛 ナツカ」 in the hand; level 3 or 2. */
  const field = (level: number) =>
    game('STS_W140', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, STS(19), stageSlot(0, 'FC'));
      take(ctx, 0, STS(4), zone(0, 'hand'));
      for (const c of [STS(3), STS(9), STS(11)].slice(0, level)) take(ctx, 0, c, zone(0, 'level'));
    });

  it('【起】 this card to the waiting room, level 3: 「爽風の才媛 ナツカ」 from the hand into the slot it was in, ＋2000 for the turn', () => {
    const choosing = activate(field(3), 'FC', 1);
    expect(pending(choosing.state, 'SELECT_CARDS')).toMatchObject({ min: 0, max: 1 });
    const done = pick(choosing, [STS(4)]);
    expect(getInstance(done.state, at(done.state, 0, 'FC')).cardId).toBe(STS(4));
    expect(getPower(done.state, at(done.state, 0, 'FC'))).toBe(9500 + 2000);
    expect(zoneCards(done.state, 0, 'waitingRoom')).toEqual([STS(19)]);
  });

  it('level 2: only the cost', () => {
    const run = activate(field(2), 'FC', 1);
    expect(run.state.pending?.kind).toBe('MAIN');
    expect(run.state.zones[0].stage.FC).toEqual([]);
  });
});

describe('STS/W140-095 激安セール大戦 アヤメ', () => {
  /** 「穏やかな時間」 in the climax zone; STS-009 (2500) opposite; on top: a card for the trigger check, then the card shown, then three more. */
  const setup = (shown: string) =>
    game('STS_W140', { step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, STS(95), stageSlot(0, 'FC'));
      take(ctx, 0, STS(99), zone(0, 'climax'));
      take(ctx, 1, STS(9), stageSlot(1, 'FC'));
      stackTop(ctx, 0, [STS(26), shown, STS(41), STS(9), STS(25)]);
    });
  const toLook = (run: Run): Run => until(run, (r) => asks(r, 'CONFIRM', 'LOOK_NEXT'));
  const lookAll = (run: Run): Run => accept(accept(accept(accept(run))));

  it('【CXコンボ】 the battle opponent reversed: the top card is shown; a soul icon on it: up to two 《巡遊者》 characters of four', () => {
    const looking = toLook(attack(setup(STS(3)), 'FC'));
    expect(looking.events.some((e) => e.type === 'CARD_REVEALED')).toBe(true);
    expect(topCards(looking.state, 0, 1)).toEqual([STS(3)]);
    const choosing = lookAll(looking);
    expect(pending(choosing.state, 'SELECT_CARDS')).toMatchObject({ min: 0, max: 2 });
    // The card shown is among the four looked at.
    expect(offered(choosing)).toEqual([STS(3), STS(41), STS(9), STS(25)].sort());
    const done = pick(choosing, [STS(3), STS(41)]);
    expect(zoneCards(done.state, 0, 'hand')).toEqual([STS(3), STS(41)].sort());
  });

  it('no soul icon on the card shown: up to one', () => {
    const choosing = lookAll(toLook(attack(setup(STS(38)), 'FC')));
    expect(pending(choosing.state, 'SELECT_CARDS')).toMatchObject({ min: 0, max: 1 });
  });
});

describe('ANM/W138-001 “守る決意”朱比華', () => {
  /** In the centre, one stock card; ANM-005 in the hand; ANM-012 (level 2) and ANM-017 (level 0) in the waiting room; the four cards on top. */
  const setup = (top: string[]) =>
    game('ANM_W138', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, ANM(1), stageSlot(0, 'FC'));
      take(ctx, 0, ANM(16), zone(0, 'stock'));
      take(ctx, 0, ANM(5), zone(0, 'hand'));
      take(ctx, 0, ANM(12), zone(0, 'waitingRoom'));
      take(ctx, 0, ANM(17), zone(0, 'waitingRoom'));
      stackTop(ctx, 0, top);
    });

  it('【起】 集中, no climax among the four: a hand card may be paid, then a character of level 1 or higher comes back', () => {
    const asked = activate(setup([ANM(10), ANM(9), ANM(5), ANM(9)]), 'FC', 0);
    // The four cards, the two already there and the stock card paid.
    expect(zoneCards(asked.state, 0, 'waitingRoom')).toEqual([ANM(10), ANM(12), ANM(16), ANM(17), ANM(5), ANM(9), ANM(9)].sort());
    expect(pending(asked.state, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST' });
    const choosing = pick(accept(asked), [ANM(5)]);
    expect(pending(choosing.state, 'SELECT_CARDS')).toMatchObject({ min: 1, max: 1 });
    // Level 1 or higher: ANM-010 (1) and ANM-012 (2).
    expect(offered(choosing)).toEqual([ANM(10), ANM(12)].sort());
    expect(zoneCards(pick(choosing, [ANM(12)]).state, 0, 'hand')).toEqual([ANM(12)]);
  });

  it('a climax among the four: one character per climax, and nothing more', () => {
    const choosing = activate(setup([ANM(24), ANM(9), ANM(10), ANM(9)]), 'FC', 0);
    expect(pending(choosing.state, 'SELECT_CARDS')).toMatchObject({ min: 0, max: 1 });
    const done = pick(choosing, [ANM(17)]);
    expect(zoneCards(done.state, 0, 'hand')).toEqual([ANM(17), ANM(5)].sort());
    expect(done.state.pending?.kind).toBe('MAIN');
  });

  it('no climax, the hand card not paid: nothing comes back', () => {
    const done = decline(activate(setup([ANM(10), ANM(9), ANM(5), ANM(9)]), 'FC', 0));
    expect(zoneCards(done.state, 0, 'hand')).toEqual([ANM(5)]);
    expect(done.state.pending?.kind).toBe('MAIN');
  });
});

describe('ANM/W138-008 “太ったのは？”朱比華', () => {
  /** In the centre; another character in the back row or not; the top card, then one for the trigger check. */
  const setup = (top: string, backRow = false) =>
    game('ANM_W138', { step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, ANM(8), stageSlot(0, 'FC'));
      if (backRow) take(ctx, 0, ANM(16), stageSlot(0, 'BR'));
      take(ctx, 1, ANM(5), stageSlot(1, 'FC'));
      stackTop(ctx, 0, [top, ANM(9), ANM(9)]);
    });
  const mill = (run: Run): Run => abilityFirst(run, ANM(8), 1);

  it('【自】 no other back-row character: the top card may go to the waiting room; a level 0 character goes on to a back slot the player chooses', () => {
    const asked = mill(attack(setup(ANM(17)), 'FC'));
    expect(asks(asked, 'CONFIRM', 'DECK_TOP_NEXT')).toBe(true);
    const slot = accept(asked);
    expect(pending(slot.state, 'SELECT_SLOT').slots).toEqual(['BL', 'BR']);
    const done = then(slot, { kind: 'SELECT_SLOT', slot: 'BR' });
    expect(getInstance(done.state, at(done.state, 0, 'BR')).cardId).toBe(ANM(17));
  });

  it('a level 1 character stays in the waiting room; another character in the back row: nothing is asked', () => {
    const higher = accept(mill(attack(setup(ANM(10)), 'FC')));
    expect(asks(higher, 'SELECT_SLOT')).toBe(false);
    expect(zoneCards(higher.state, 0, 'waitingRoom')).toEqual([ANM(10)]);
    const blocked = mill(attack(setup(ANM(17), true), 'FC'));
    expect(asks(blocked, 'CONFIRM', 'DECK_TOP_NEXT')).toBe(false);
  });
});

describe('ANM/W138-019 “スピードに魅せられた少年”千春', () => {
  /** In the centre; ANM-012 (《風》) in the waiting room; two clock cards; on top: ANM-010, a climax, ANM-017. */
  const setup = () =>
    game('ANM_W138', { step: 'CLIMAX_START' }, (ctx) => {
      take(ctx, 0, ANM(19), stageSlot(0, 'FC'));
      take(ctx, 0, ANM(12), zone(0, 'waitingRoom'));
      take(ctx, 0, ANM(9), zone(0, 'clock'));
      take(ctx, 0, ANM(16), zone(0, 'clock'));
      stackTop(ctx, 0, [ANM(10), ANM(24), ANM(17)]);
    });

  it('【自】 加速 at the start of the climax phase: a 《風》 character of the waiting room under the clock, then up to three cards looked at and one 《風》 character taken', () => {
    const asked = setup();
    expect(pending(asked.state, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST' });
    const paying = accept(asked);
    expect(pending(paying.state, 'SELECT_CARDS')).toMatchObject({ prompt: 'COST_WAITING_ROOM_TO_CLOCK' });
    const looking = pick(paying, [ANM(12)]);
    expect(names(looking.state, looking.state.zones[0].clock)).toEqual([ANM(12), ANM(9), ANM(16)]);
    const choosing = accept(accept(accept(looking)));
    expect(offered(choosing)).toEqual([ANM(10), ANM(17)].sort());
    const done = pick(choosing, [ANM(10)]);
    expect(zoneCards(done.state, 0, 'hand')).toEqual([ANM(10)]);
    expect(zoneCards(done.state, 0, 'waitingRoom')).toEqual([ANM(17), ANM(24)].sort());
  });

  it('not paid: nothing', () => {
    const done = decline(setup());
    expect(names(done.state, done.state.zones[0].clock)).toEqual([ANM(9), ANM(16)]);
    expect(topCards(done.state, 0, 1)).toEqual([ANM(10)]);
  });
});

describe('BDY/W135-031 夢限の宇宙を進行中 千石ユノ', () => {
  /** In the centre; other 《音楽》 characters on the left (and right); the opponent: BDY-001 opposite, level 1, BDY-086 (助太刀) in the hand. */
  const setup = (others: number, top: string[] = [BDY(1), BDY(1)], combo = false) =>
    game(
      'BDY_W135',
      { step: 'ATTACK_START' },
      (ctx) => {
        take(ctx, 0, BDY(31), stageSlot(0, 'FC'));
        take(ctx, 0, BDY(1), stageSlot(0, 'FL'));
        if (others > 1) take(ctx, 0, BDY(19), stageSlot(0, 'FR'));
        if (combo) take(ctx, 0, BDY(62), zone(0, 'climax'));
        take(ctx, 1, BDY(1), stageSlot(1, 'FC'));
        take(ctx, 1, BDY(35), zone(1, 'level'));
        take(ctx, 1, BDY(86), zone(1, 'hand'));
        stackTop(ctx, 0, top);
      },
    );
  const toCounter = (run: Run): Run => until(run, (r) => r.state.pending?.kind === 'COUNTER');

  it('【永】 two other 《音楽》 characters: ＋3000, and the opponent cannot play 『助太刀』 from the hand during its battle', () => {
    const start = setup(2);
    expect(getPower(start.state, at(start.state, 0, 'FC'))).toBe(3500 + 3000);
    const counter = toCounter(attack(start, 'FC'));
    expect(pending(counter.state, 'COUNTER')).toMatchObject({ player: 1 });
    expect(pending(counter.state, 'COUNTER').backups).toEqual([]);
  });

  it('one other: neither (the 『助太刀』 can be played)', () => {
    const start = setup(1);
    expect(getPower(start.state, at(start.state, 0, 'FC'))).toBe(3500);
    expect(pending(toCounter(attack(start, 'FC')).state, 'COUNTER').backups).toHaveLength(1);
  });

  it('【CXコンボ】 「TearJerker」: up to four looked at, a 《音楽》 character taken; a climax among those put into the waiting room: up to three looked at and put back in any order', () => {
    const looking = attack(setup(1, [BDY(7), BDY(26), BDY(2), BDY(19), BDY(35), BDY(1), BDY(7)], true), 'FC');
    const choosing = accept(accept(accept(accept(looking))));
    const second = pick(choosing, [BDY(7)]);
    expect(zoneCards(second.state, 0, 'waitingRoom')).toEqual([BDY(19), BDY(2), BDY(26)].sort());
    const keeping = accept(accept(accept(second)));
    expect(pending(keeping.state, 'SELECT_CARDS')).toMatchObject({ prompt: 'EFFECT_KEEP', min: 0, max: 3 });
    const ordering = pick(keeping, [BDY(35), BDY(1)]);
    const done = pick(ordering, [BDY(1)]);
    // BDY-001 was put on the very top: the trigger check that follows turns it over into the stock; BDY-035 is next.
    expect(zoneCards(done.state, 0, 'stock')).toEqual([BDY(1)]);
    expect(topCards(done.state, 0, 1)).toEqual([BDY(35)]);
    expect(zoneCards(done.state, 0, 'waitingRoom')).toContain(BDY(7));
  });

  it('no climax among the cards put into the waiting room: no second look', () => {
    const choosing = accept(accept(accept(accept(attack(setup(1, [BDY(7), BDY(1), BDY(2), BDY(19), BDY(35), BDY(1)], true), 'FC')))));
    const done = pick(choosing, [BDY(7)]);
    expect(asks(done, 'CONFIRM', 'LOOK_NEXT')).toBe(false);
  });
});

describe('BDY/W135-084 贖罪のお百度参り 藤都子', () => {
  /** In the hand with BDY-035; one stock card; BDY-019 in the centre. */
  const setup = () =>
    game('BDY_W135', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, BDY(84), zone(0, 'hand'));
      take(ctx, 0, BDY(35), zone(0, 'hand'));
      take(ctx, 0, BDY(1), zone(0, 'stock'));
      take(ctx, 0, BDY(19), stageSlot(0, 'FC'));
    });

  it('【自】 played from the hand, paid: two 《音楽》 characters shown; the opponent puts one into the waiting room, the other comes to the hand; the deck shuffled, then up to two looked at and put back', () => {
    const played = abilityFirst(playCharacter(setup(), BDY(84), 'FL'), BDY(84), 1);
    expect(pending(played.state, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST' });
    const searching = pick(accept(played), [BDY(35)]);
    expect(pending(searching.state, 'SELECT_CARDS')).toMatchObject({ player: 0, min: 0, max: 2 });
    const theirs = pick(searching, [BDY(2), BDY(7)]);
    expect(pending(theirs.state, 'SELECT_CARDS')).toMatchObject({ player: 1, min: 1, max: 1 });
    const looking = pick(theirs, [BDY(2)]);
    expect(zoneCards(looking.state, 0, 'hand')).toEqual([BDY(7)]);
    expect(zoneCards(looking.state, 0, 'waitingRoom')).toEqual([BDY(1), BDY(2), BDY(35)].sort());
    expect(shuffled(looking)).toBe(1);
    expect(pending(looking.state, 'CONFIRM')).toMatchObject({ prompt: 'LOOK_NEXT' });
  });

  it('its other 【自】: a 《音楽》 character of yours gets ＋1500', () => {
    const choosing = abilityFirst(playCharacter(setup(), BDY(84), 'FL'), BDY(84), 0);
    const done = then(choosing, { kind: 'SELECT_CARDS', cards: [oid(choosing.state, at(choosing.state, 0, 'FC'))] });
    expect(getPower(done.state, at(done.state, 0, 'FC'))).toBe(printed(BDY(19)).power! + 1500);
  });
});

// ---------------------------------------------------------------------------------------------------------

describe('NIK/S135-037 再び始まる物語 シンデレラ', () => {
  /** In the hand with NIK-033 (棺を背負う者 グレイブ) and NIK-004; NIK-033 (level 2), NIK-008 (1), NIK-105 (2), NIK-030 (3) in the waiting room. */
  const setup = () =>
    game('NIK_S135', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, NIK(37), zone(0, 'hand'));
      take(ctx, 0, NIK(33), zone(0, 'hand'));
      take(ctx, 0, NIK(4), zone(0, 'hand'));
      for (const c of [NIK(33), NIK(8), NIK(105), NIK(30)]) take(ctx, 0, c, zone(0, 'waitingRoom'));
    });

  it('【自】 a hand card paid; Ｘ = the 「棺を背負う者 グレイブ」 in your waiting room, counted after the cost (one paid makes 2)', () => {
    const paying = accept(playCharacter(setup(), NIK(37), 'FC'));
    const choosing = pick(paying, [NIK(33)]);
    expect(offered(choosing)).toEqual([NIK(105), NIK(33), NIK(33), NIK(8)].sort());
    const one = pick(accept(playCharacter(setup(), NIK(37), 'FC')), [NIK(4)]);
    // Ｘ = 1: NIK-008 (level 1) and NIK-004 (level 0, the card paid).
    expect(offered(one)).toEqual([NIK(4), NIK(8)].sort());
  });

  it('【起】 (2), this card to the waiting room, level 3: 「“ガラスの靴・フルコンタクト”シンデレラ」 from the waiting room into the slot it was in', () => {
    const start = game('NIK_S135', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, NIK(37), stageSlot(0, 'FL'));
      take(ctx, 0, NIK(30), zone(0, 'waitingRoom'));
      for (const c of [NIK(4), NIK(8), NIK(72)]) take(ctx, 0, c, zone(0, 'level'));
      for (const c of [NIK(104), NIK(104)]) take(ctx, 0, c, zone(0, 'stock'));
    });
    const choosing = activate(start, 'FL', 1);
    expect(offered(choosing)).toEqual([NIK(30)]);
    const done = pick(choosing, [NIK(30)]);
    expect(getInstance(done.state, at(done.state, 0, 'FL')).cardId).toBe(NIK(30));
    expect(zoneCards(done.state, 0, 'waitingRoom')).toEqual([NIK(104), NIK(104), NIK(37)].sort());
  });
});

describe('NIK/S135-044 “正義への手段”K', () => {
  /** In the centre with four hand cards (＋3000 when it attacks); NIK-004 (1000) opposite; two cards in the opponent's clock; NIK-105 in your waiting room. */
  const setup = () =>
    game('NIK_S135', { step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, NIK(44), stageSlot(0, 'FC'));
      for (const c of [NIK(8), NIK(8), NIK(72), NIK(72)]) take(ctx, 0, c, zone(0, 'hand'));
      take(ctx, 0, NIK(105), zone(0, 'waitingRoom'));
      take(ctx, 1, NIK(4), stageSlot(1, 'FC'));
      take(ctx, 1, NIK(8), zone(1, 'clock'));
      take(ctx, 1, NIK(72), zone(1, 'clock'));
      stackTop(ctx, 0, [NIK(104)]);
    });
  const reversed = () => until(attack(setup(), 'FC'), (r) => asks(r, 'SELECT_OPTION', 'EFFECT_ORDER_FIRST'));

  it('【自】 the battle opponent reversed: both effects, the player choosing the first; the clock card to the waiting room, then the battle opponent to the clock', () => {
    const asked = reversed();
    const top = asked.state.zones[1].clock.at(-1)!;
    const clockFirst = choose(asked, 'EFFECT_1');
    const moved = accept(clockFirst);
    expect(getInstance(moved.state, top).location.zone).toBe('waitingRoom');
    expect(names(moved.state, [moved.state.zones[1].clock.at(-1)!])).toEqual([NIK(4)]);
    expect(moved.state.zones[1].stage.FC).toEqual([]);
    // Then the other effect: a 《NIKKE》 character back to the hand, then a hand card to the waiting room.
    expect(offered(moved)).toContain(NIK(105));
  });

  it('the other order: the character back to the hand and a hand card to the waiting room first, then the clock; declined, the battle opponent stays', () => {
    const asked = reversed();
    const handFirst = pick(choose(asked, 'EFFECT_2'), [NIK(105)]);
    const discarded = pick(handFirst, [NIK(8)]);
    expect(asks(discarded, 'CONFIRM')).toBe(true);
    const declined = decline(discarded);
    // Declined: the clock is as it was and the battle opponent is not put there (it goes on to the encore step as any reversed character).
    expect(names(declined.state, declined.state.zones[1].clock)).toEqual(names(asked.state, asked.state.zones[1].clock));
    expect(zoneCards(declined.state, 0, 'hand')).toContain(NIK(105));
  });
});

describe('NIK/S135-062 エマ：タクティカル・アップ', () => {
  /** Level 3; on the left of the front row, with ウンファ and ベスティー (both without abilities here); ABSOLUTE in the hand. */
  const setup = () =>
    game(
      'NIK_S135',
      { step: 'CLIMAX_START' },
      (ctx) => {
        take(ctx, 0, NIK(62), stageSlot(0, 'FL'));
        take(ctx, 0, NIK(63), stageSlot(0, 'FC'));
        take(ctx, 0, NIK(65), stageSlot(0, 'FR'));
        for (const c of [NIK(4), NIK(8), NIK(72)]) take(ctx, 0, c, zone(0, 'level'));
        take(ctx, 0, NIK(82), zone(0, 'hand'));
        stackTop(ctx, 1, [NIK(4), NIK(8), NIK(72), NIK(104)]);
      },
      [NIK(63)],
    );

  it('【CXコンボ】 ABSOLUTE placed: up to four of the opponent’s cards looked at; those chosen to the waiting room, the rest stay; the opponent shuffles', () => {
    const start = setup();
    const looking = then(start, { kind: 'CLIMAX', card: oid(start.state, inHand(start.state, 0, NIK(82))) });
    const choosing = accept(accept(accept(accept(looking))));
    expect(pending(choosing.state, 'SELECT_CARDS')).toMatchObject({ prompt: 'EFFECT_DECK_TO_WAITING_ROOM', min: 0, max: 4 });
    const done = pick(choosing, [NIK(4), NIK(72)]);
    expect(zoneCards(done.state, 1, 'waitingRoom')).toEqual([NIK(4), NIK(72)].sort());
    expect(done.state.zones[1].deck).toHaveLength(start.state.zones[1].deck.length - 2);
    expect(shuffled(done)).toBe(1);
  });

  /** In the centre, one stock card; on top: five cards (a climax among them or not), then NIK-105. */
  const brainstorm = (climax: boolean) =>
    game('NIK_S135', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, NIK(62), stageSlot(0, 'FC'));
      take(ctx, 0, NIK(72), zone(0, 'stock'));
      stackTop(ctx, 0, [climax ? NIK(110) : NIK(4), NIK(8), NIK(8), NIK(104), NIK(104), NIK(105)]);
    });

  it('【起】 集中: a climax among the five: the top card looked at and put on top, at the bottom or into the waiting room; then a character back to the hand', () => {
    const asked = activate(brainstorm(true), 'FC', 1);
    expect(pending(asked.state, 'SELECT_OPTION')).toMatchObject({ prompt: 'EFFECT_TOP_OR_BOTTOM', options: ['DECK_TOP', 'DECK_BOTTOM', 'WAITING_ROOM'] });
    const choosing = choose(asked, 'WAITING_ROOM');
    expect(zoneCards(choosing.state, 0, 'waitingRoom')).toContain(NIK(105));
    expect(pending(choosing.state, 'SELECT_CARDS')).toMatchObject({ min: 0, max: 1 });
    expect(zoneCards(pick(choosing, [NIK(105)]).state, 0, 'hand')).toEqual([NIK(105)]);
  });

  it('no climax among them: nothing more', () => {
    expect(activate(brainstorm(false), 'FC', 1).state.pending?.kind).toBe('MAIN');
  });
});

describe('NIK/S135-063 ウンファ：タクティカル・アップ', () => {
  /** Level 3; in the centre, with ベスティー and エマ (without abilities here) in the front row; ABSOLUTE in the hand. */
  const setup = () =>
    game(
      'NIK_S135',
      { step: 'CLIMAX_START' },
      (ctx) => {
        take(ctx, 0, NIK(63), stageSlot(0, 'FC'));
        take(ctx, 0, NIK(62), stageSlot(0, 'FL'));
        take(ctx, 0, NIK(65), stageSlot(0, 'FR'));
        for (const c of [NIK(4), NIK(8), NIK(72)]) take(ctx, 0, c, zone(0, 'level'));
        take(ctx, 0, NIK(82), zone(0, 'hand'));
      },
      [NIK(62)],
    );

  it('【永】 your other 《NIKKE》 characters get ＋2000 in your turn', () => {
    const start = setup();
    expect(getPower(start.state, at(start.state, 0, 'FL'))).toBe(printed(NIK(62)).power! + 2000);
  });

  it('【CXコンボ】 ABSOLUTE placed: up to four cards to the stock, one at a time; then the opponent’s top ten may go to the waiting room', () => {
    const start = setup();
    const stocking = then(start, { kind: 'CLIMAX', card: oid(start.state, inHand(start.state, 0, NIK(82))) });
    expect(asks(stocking, 'CONFIRM', 'DECK_TOP_NEXT')).toBe(true);
    const asked = decline(accept(accept(stocking)));
    expect(asked.state.zones[0].stock).toHaveLength(2);
    expect(pending(asked.state, 'CONFIRM')).toMatchObject({ prompt: 'USE_ABILITY' });
    expect(accept(asked).state.zones[1].waitingRoom).toHaveLength(10);
    expect(decline(asked).state.zones[1].waitingRoom).toHaveLength(0);
  });
});

describe('NIK/S135-069 レッドフード - レトロデイズ', () => {
  const state = (climax: boolean, twin = false) =>
    game('NIK_S135', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, NIK(69), stageSlot(0, 'FC'));
      if (twin) take(ctx, 0, NIK(69), stageSlot(0, 'FL'));
      if (climax) take(ctx, 0, NIK(82), zone(0, 'climax'));
      take(ctx, 0, NIK(26), zone(0, 'hand'));
    }).state;

  it('【永】【CXコンボ】 a climax in your climax zone and no other of the same name: your 「CODENAME - RED HOOD -」 have the salvage icon too', () => {
    const icons = (s: GameState) => triggerIconsOf(s, inHand(s, 0, NIK(26)));
    expect(icons(state(true))).toEqual(['SOUL', 'SHOT', 'COMEBACK']);
    expect(icons(state(false))).toEqual(['SOUL', 'SHOT']);
    expect(icons(state(true, true))).toEqual(['SOUL', 'SHOT']);
  });
});

describe('NIK/S135-085 ディーゼル：ウィンタースイーツ', () => {
  /** In the centre with four other 《NIKKE》 characters; TERMINUS TICKET in the hand with `hand` cards in all; the opponent's top cards. */
  const setup = (hand: number) =>
    game('NIK_S135', { step: 'CLIMAX_START' }, (ctx) => {
      take(ctx, 0, NIK(85), stageSlot(0, 'FC'));
      take(ctx, 0, NIK(4), stageSlot(0, 'FL'));
      take(ctx, 0, NIK(8), stageSlot(0, 'FR'));
      take(ctx, 0, NIK(72), stageSlot(0, 'BL'));
      take(ctx, 0, NIK(104), stageSlot(0, 'BR'));
      take(ctx, 0, NIK(111), zone(0, 'hand'));
      // A blue card in the clock, for the colour of the climax (CR-8.6.2.1.1).
      take(ctx, 0, NIK(86), zone(0, 'clock'));
      for (const c of [NIK(105), NIK(105), NIK(105), NIK(3), NIK(3), NIK(3)].slice(0, hand - 1)) take(ctx, 0, c, zone(0, 'hand'));
      take(ctx, 1, NIK(4), stageSlot(1, 'FC'));
      stackTop(ctx, 1, [NIK(8), NIK(72), NIK(104)]);
    });
  const toAttack = (run: Run): Run => until(then(run, { kind: 'CLIMAX', card: oid(run.state, inHand(run.state, 0, NIK(111))) }), (r) => r.state.pending?.kind === 'ATTACK');

  it('【CXコンボ】 TERMINUS TICKET placed, five hand cards left: when it attacks, the opponent’s top two are looked at, those kept put back in any order, the rest to the waiting room', () => {
    const looking = until(attack(toAttack(setup(6)), 'FC'), (r) => asks(r, 'CONFIRM', 'LOOK_NEXT'));
    const keeping = accept(accept(looking));
    expect(pending(keeping.state, 'SELECT_CARDS')).toMatchObject({ prompt: 'EFFECT_KEEP', min: 0, max: 2 });
    const done = pick(keeping, [NIK(72)]);
    expect(zoneCards(done.state, 1, 'waitingRoom')).toContain(NIK(8));
    expect(topCards(done.state, 1, 1)).toEqual([NIK(72)]);
  });

  it('six hand cards left (the condition is checked as it resolves, the climax already played): nothing is gained', () => {
    const run = attack(toAttack(setup(7)), 'FC');
    expect(asks(run, 'CONFIRM', 'LOOK_NEXT')).toBe(false);
  });
});
