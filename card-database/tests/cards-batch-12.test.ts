/**
 * Tests for the cards of batch 12, with the real card data (each card in a game of its own booster, both players
 * with every card of it, three copies each):
 * GUP/W141-102 (＋Ｘ, Ｘ = the soul of the character chosen ×1000), ANM/W138-083 (－Ｘ, Ｘ = other 《風》 characters
 * ×1000), NIK/S135-101 (＋Ｘ, Ｘ = your level ×1500), GUP/W141-098 (level －Ｘ, Ｘ = your level), GUP/W141-020 and
 * BDY/W135-043 (cards to the waiting room, then a character of level Ｘ or lower back, Ｘ = the characters with
 * the trait among them), GUP/W141-059 (a 《戦車道》 character of the hand to the clock; Ｘ = the opponent's
 * characters + 1 cards looked at), GUP/W141-032 (the deck or the waiting room declared), GUP/W141-107 (per
 * character of the back row; a shown card to the hand or the stock), ANM/W138-069 (＋Ｘ and 《恐竜》) and
 * BDY/W135-014 (a climax with a choice icon as a cost; a card looked at to the hand or the stock).
 */

import { describe, expect, it } from 'vitest';
import { type Choice, type Ctx, type Decision, type GameEvent, type GameState, type PlayerId, type SlotId, getCardLevel, getInstance, getPlayerView, getPower, stageSlot, traitsOf } from '@wso/game-engine';
import { getCard } from '../src/index';
import { readLine } from '../src/grammar';
import { answer, oid, pending, scenario, stackTop, take } from './helpers';
import type { RealScenario } from './helpers';

const GUP = (n: number): string => `GUP/W141-${String(n).padStart(3, '0')}`;
const BDY = (n: number): string => `BDY/W135-${String(n).padStart(3, '0')}`;
const ANM = (n: number): string => `ANM/W138-${String(n).padStart(3, '0')}`;
const NIK = (n: number): string => `NIK/S135-${String(n).padStart(3, '0')}`;
/** Cards used only as bodies (printed numbers, traits and icons, no abilities). */
const BODIES: Record<string, string[]> = {
  GUP_W141: [GUP(1), GUP(3), GUP(4), GUP(5), GUP(8), GUP(15), GUP(22)],
  BDY_W135: [BDY(1), BDY(2), BDY(7), BDY(19)],
  ANM_W138: [ANM(5), ANM(9), ANM(16)],
  NIK_S135: [NIK(4), NIK(8)],
};
interface Run {
  state: GameState;
  events: GameEvent[];
}
const game = (set: keyof typeof BODIES, options: Omit<RealScenario, 'sets'>, arrange: (ctx: Ctx) => void = () => {}): Run => {
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
const pickOnStage = (run: Run, player: PlayerId, slot: SlotId): Run => then(run, { kind: 'SELECT_CARDS', cards: [oid(run.state, at(run.state, player, slot))] });
const accept = (run: Run): Run => then(run, { kind: 'CONFIRM', accept: true });
const decline = (run: Run): Run => then(run, { kind: 'CONFIRM', accept: false });
const choose = (run: Run, option: string): Run => then(run, { kind: 'SELECT_OPTION', option });
const asks = (run: Run, kind: Decision['kind'], prompt?: string): boolean =>
  run.state.pending?.kind === kind && (prompt === undefined || (run.state.pending as { prompt?: string }).prompt === prompt);
const inHand = (state: GameState, cardId: string): number => state.zones[0].hand.find((i) => getInstance(state, i).cardId === cardId)!;
const playCharacter = (run: Run, cardId: string, to: SlotId): Run =>
  then(run, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(run.state, inHand(run.state, cardId)), slot: to } });
const activate = (run: Run, slot: SlotId, ability: number): Run =>
  then(run, { kind: 'MAIN', action: { type: 'ACTIVATE', card: oid(run.state, at(run.state, 0, slot)), ability } });
const canActivate = (run: Run, slot: SlotId, ability: number): boolean =>
  pending(run.state, 'MAIN').actions.some((a) => a.type === 'ACTIVATE' && a.card === oid(run.state, at(run.state, 0, slot)) && a.ability === ability);
const attack = (run: Run, slot: SlotId, type: 'FRONT' | 'SIDE' | 'DIRECT' = 'FRONT'): Run => then(run, { kind: 'ATTACK', attack: { attacker: oid(run.state, at(run.state, 0, slot)), type } });
/** Of the abilities that wait, the card's ability with this index is played first. */
const abilityFirst = (run: Run, cardId: string, index: number): Run => {
  if (run.state.pending?.kind !== 'CHOOSE_ABILITY') return run;
  const waiting = run.state.pending.abilities;
  const wanted = waiting.find((a) => a.type === 'CARD' && a.cardId === cardId && a.ability === index) ?? waiting[0]!;
  return then(run, { kind: 'CHOOSE_ABILITY', id: wanted.id });
};
const paid = (run: Run): string[] => run.events.flatMap((e) => (e.type === 'CARD_MOVED' && e.reason === 'COST' ? [`${e.from.zone}>${e.to.zone}`] : []));
const played = (run: Run, cardId: string): number => run.events.filter((e) => e.type === 'ABILITY_PLAYED' && getInstance(run.state, e.instanceId).cardId === cardId).length;
const printed = (cardId: string) => getCard(cardId).def;
const ability = (cardId: string, index: number) => printed(cardId).abilities![index];
const zone = (player: PlayerId, name: 'waitingRoom' | 'hand' | 'stock' | 'level' | 'clock' | 'memory' | 'climax') => ({ player, zone: name }) as const;
const zoneCards = (state: GameState, player: PlayerId, name: 'waitingRoom' | 'hand' | 'stock' | 'clock'): string[] => names(state, state.zones[player][name]).sort();
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
const TANK = { kind: 'CHARACTER', traits: ['戦車道'] };

// ---------------------------------------------------------------------------------------------------------

describe('reading the new wordings', () => {
  it('Ｘ from the character chosen, your level, the opponent’s characters, the cards put into the waiting room', () => {
    expect(effectOf(line(GUP(102), 1))).toEqual([
      { do: 'CHOOSE', from: 'YOUR_STAGE', filter: TANK, other: true, min: 1, max: 1 },
      { do: 'SET_X', count: { of: 'CHOSEN_SOUL' }, times: 1000 },
      { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'POWER', amount: 1, timesX: true },
    ]);
    expect(effectOf(line(NIK(101), 1))).toEqual([
      { do: 'CHOOSE', from: 'YOUR_STAGE', min: 1, max: 1 },
      { do: 'SET_X', count: { of: 'YOUR_LEVEL' }, times: 1500 },
      { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'POWER', amount: 1, timesX: true },
    ]);
    expect(effectOf(line(GUP(98), 2))).toEqual([
      { do: 'CHOOSE', from: 'YOUR_STAGE', min: 1, max: 1 },
      { do: 'SET_X', count: { of: 'YOUR_LEVEL' } },
      { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'LEVEL', amount: -1, until: 'NEXT_OPPONENT_TURN', timesX: true },
    ]);
    expect(effectOf(line(ANM(83), 0))).toEqual([
      { do: 'CHOOSE', from: 'OPPONENT_FRONT_ROW', min: 1, max: 1 },
      { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'POWER', amount: -1000, per: { filter: { kind: 'CHARACTER', traits: ['風'] }, other: true } },
    ]);
    expect(effectOf(line(GUP(20), 1))).toEqual([
      { do: 'DECK_TOP', count: 3, to: 'WAITING_ROOM', upTo: true },
      { do: 'SET_X', count: { of: 'MOVED', filter: TANK } },
      { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: TANK, levelMaxX: true, min: 1, max: 1 },
      { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
    ]);
    expect(effectOf(line(BDY(43), 1))).toMatchObject([{ do: 'DECK_TOP' }, { do: 'SET_X', count: { of: 'MOVED', said: 'THIS_EFFECT' } }, { do: 'CHOOSE', min: 0, max: 1, levelMaxX: true }, { do: 'MOVE' }]);
    expect(effectOf(line(GUP(59), 0))).toEqual([{ do: 'SET_X', count: { of: 'OPPONENT_STAGE' }, plus: 1 }, { do: 'LOOK_TOP', upTo: 1, upToX: true }]);
  });

  it('what Ｘ refers to must come before it; other times are not read', () => {
    // そのキャラ without a character chosen before.
    expect(readLine('【自】 このカードがアタックした時、そのターン中、このカードのパワーを＋Ｘ。Ｘはそのキャラのソウル×1000に等しい。').line).toBeNull();
    // それらのカード without cards put into the waiting room just before.
    expect(readLine('【自】 このカードがアタックした時、あなたは自分の控え室のレベルＸ以下の《戦車道》のキャラを1枚選び、手札に戻す。Ｘはそれらのカードの《戦車道》のキャラの枚数に等しい。').line).toBeNull();
    // A declared zone without the shuffle of the deck said after it.
    expect(readLine('【起】［(1)］ あなたは山札か控え室を宣言し、宣言した自分の領域を見て《戦車道》のキャラを1枚まで選んで相手に見せ、手札に加える。').line).toBeNull();
  });

  it('the hand or the stock, a declared zone, the back row, the climax cost, and a trait for the turn', () => {
    expect(effectOf(line(GUP(107), 1))).toEqual([{ do: 'REVEAL_TOP', filter: TANK, handOrStock: true }]);
    expect(readLine(line(GUP(107), 0)).line!.ability).toEqual({ type: 'CONT', condition: { if: 'YOUR_TURN' }, apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: 2000, per: { filter: TANK, other: true, slots: ['BL', 'BR'] } }] });
    expect(effectOf(line(GUP(32), 1))).toEqual([{ do: 'SEARCH_DECLARED_ZONE', filter: TANK, max: 1 }]);
    expect(readLine(line(GUP(59), 0)).line!.ability).toMatchObject({ cost: [{ pay: 'HAND_TO_CLOCK', count: 1, filter: TANK }] });
    expect(readLine(line(BDY(14), 1)).line!.ability).toMatchObject({
      trigger: { on: 'ATTACK_END' },
      cost: [{ pay: 'CLIMAX_TO_WAITING_ROOM', count: 1, filter: { kind: 'CLIMAX', hasTrigger: 'CHOICE' } }],
      effect: [{ do: 'LOOK_TOP', upTo: 3, pick: { kind: 'CHARACTER', traits: ['音楽'] }, reveal: true, handOrStock: true }],
    });
    expect(effectOf(line(ANM(69), 0))).toEqual([
      { do: 'MODIFY', target: { who: 'SELF' }, stat: 'POWER', amount: 1000, perCount: { where: 'OPPONENT_STAGE' } },
      { do: 'GRANT', target: { who: 'SELF' }, ability: { type: 'CONT', apply: [], giveTraits: { traits: ['恐竜'], to: 'SELF' } } },
    ]);
  });

  it('the eleven cards: every ability of each card is in its data', () => {
    const counts: Record<string, number> = { [GUP(102)]: 2, [ANM(83)]: 2, [NIK(101)]: 2, [GUP(98)]: 3, [GUP(20)]: 2, [BDY(43)]: 2, [GUP(59)]: 1, [GUP(32)]: 2, [GUP(107)]: 2, [ANM(69)]: 2, [BDY(14)]: 2 };
    for (const [cardId, count] of Object.entries(counts)) {
      expect(getCard(cardId).record.support).toBe('verified');
      expect(printed(cardId).abilities).toHaveLength(count);
      printed(cardId).abilities!.forEach((a, i) => expect(a).toEqual(readLine(line(cardId, i)).line!.ability));
    }
  });
});

// ---------------------------------------------------------------------------------------------------------

describe('GUP/W141-102 10 years Memory 西 絹代', () => {
  /** The attack phase begins: the card in the centre, GUP-004 (soul 2) on the left, GUP-001 (soul 1) on the right. */
  const setup = () =>
    game('GUP_W141', { step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, GUP(102), stageSlot(0, 'FC'));
      take(ctx, 0, GUP(4), stageSlot(0, 'FL'));
      take(ctx, 0, GUP(1), stageSlot(0, 'FR'));
      take(ctx, 1, GUP(5), stageSlot(1, 'FC'));
      stackTop(ctx, 0, [GUP(5), GUP(5)]);
      stackTop(ctx, 1, [GUP(5), GUP(5)]);
    });

  it('the cards used here', () => {
    expect(printed(GUP(4))).toMatchObject({ soul: 2, power: 10000, traits: ['戦車道', '大学選抜チーム'] });
    expect(printed(GUP(1))).toMatchObject({ soul: 1, power: 1000 });
  });

  it('【自】 when it attacks: another 《戦車道》 character chosen gets ＋its soul ×1000 (2 → ＋2000); the card itself cannot be chosen', () => {
    const start = setup();
    // 【永】 あなたのターン中、このカードのパワーを＋4000.
    expect(getPower(start.state, at(start.state, 0, 'FC'))).toBe(4500);
    const choosing = attack(start, 'FC');
    expect(pending(choosing.state, 'SELECT_CARDS')).toMatchObject({ player: 0, min: 1, max: 1 });
    expect(offered(choosing)).toEqual([GUP(1), GUP(4)].sort());
    const done = pick(choosing, [GUP(4)]);
    expect(getPower(done.state, at(done.state, 0, 'FL'))).toBe(12000);
    const other = pick(attack(setup(), 'FC'), [GUP(1)]);
    expect(getPower(other.state, at(other.state, 0, 'FR'))).toBe(2000);
  });
});

describe('ANM/W138-083 “もしもの話”麦＆愛乃', () => {
  const setup = (slot: SlotId = 'FC', others = 2) =>
    game('ANM_W138', { step: 'CLIMAX_START' }, (ctx) => {
      take(ctx, 0, ANM(83), stageSlot(0, slot));
      take(ctx, 0, ANM(9), stageSlot(0, 'FL'));
      if (others > 1) take(ctx, 0, ANM(16), stageSlot(0, 'BR'));
      take(ctx, 1, ANM(5), stageSlot(1, 'FC'));
      take(ctx, 1, ANM(9), stageSlot(1, 'BL'));
    });

  it('【自】 at the start of the climax phase, in the front row: a character of the opponent’s front row gets －X, X = two other 《風》 characters ×1000', () => {
    const choosing = setup();
    expect(offered(choosing)).toEqual([ANM(5)]);
    // 1500 − 2000: power 0 or less, so the rule action puts it into the waiting room (CR-9.5.1).
    const done = pick(choosing, [ANM(5)]);
    expect(done.state.zones[1].stage.FC).toEqual([]);
    expect(zoneCards(done.state, 1, 'waitingRoom')).toEqual([ANM(5)]);
    // One other 《風》 character: −1000, 500 left.
    const one = pick(setup('FC', 1), [ANM(5)]);
    expect(getPower(one.state, at(one.state, 1, 'FC'))).toBe(500);
  });

  it('in the back row: nothing happens', () => {
    const back = setup('BL');
    expect(played(back, ANM(83))).toBe(0);
    expect(back.state.pending?.kind).not.toBe('SELECT_CARDS');
  });
});

describe('NIK/S135-101 “マッスルオールマイティー”ルマニ', () => {
  const setup = (levels: number) =>
    game('NIK_S135', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, NIK(101), stageSlot(0, 'FC'));
      take(ctx, 0, NIK(8), stageSlot(0, 'FL'));
      for (const c of [NIK(4), NIK(4), NIK(8)].slice(0, levels)) take(ctx, 0, c, zone(0, 'level'));
    });

  it('【起】 rested: a character chosen gets ＋X, X = your level ×1500 (level 2: ＋3000; level 0: ＋0)', () => {
    const choosing = activate(setup(2), 'FC', 1);
    expect(getInstance(choosing.state, at(choosing.state, 0, 'FC')).orientation).toBe('REST');
    const done = pickOnStage(choosing, 0, 'FL');
    expect(getPower(done.state, at(done.state, 0, 'FL'))).toBe(4000 + 3000);
    const none = pickOnStage(activate(setup(0), 'FC', 1), 0, 'FL');
    expect(getPower(none.state, at(none.state, 0, 'FL'))).toBe(4000);
  });
});

describe('GUP/W141-098 車長 クラーラ', () => {
  const setup = () =>
    game('GUP_W141', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, GUP(98), stageSlot(0, 'BL'));
      take(ctx, 0, GUP(4), stageSlot(0, 'FC'));
      for (const c of [GUP(5), GUP(1)]) take(ctx, 0, c, zone(0, 'level'));
    });

  it('【起】 rested: a character chosen gets level －X (X = your level 2) until the end of the opponent’s next turn', () => {
    const choosing = activate(setup(), 'BL', 2);
    const done = pickOnStage(choosing, 0, 'FC');
    expect(getCardLevel(done.state, at(done.state, 0, 'FC'))).toBe(3 - 2);
    // Still so in the opponent's turn; back to 3 in the next turn of player 0.
    const theirs = until(done, (r) => r.state.turn?.player === 1 && r.state.pending?.kind === 'MAIN');
    expect(getCardLevel(theirs.state, at(theirs.state, 0, 'FC'))).toBe(1);
    const mine = until(theirs, (r) => r.state.turn?.player === 0 && r.state.pending?.kind === 'MAIN');
    expect(getCardLevel(mine.state, at(mine.state, 0, 'FC'))).toBe(3);
  });

  it('its other 【起】 (draw-icon climax for a draw-icon climax) is a different ability: it does not change a level', () => {
    expect(canActivate(setup(), 'BL', 2)).toBe(true);
    expect(ability(GUP(98), 1)).toMatchObject({ type: 'ACT', effect: [{ do: 'CHOOSE', from: 'YOUR_WAITING_ROOM' }, { do: 'MOVE', to: 'HAND' }] });
  });
});

describe('GUP/W141-020 夏のひと時 島田愛里寿', () => {
  /** On top of the deck: GUP-113 (climax), GUP-004 (level 3), GUP-015 (level 1); GUP-008 (level 2) and GUP-003 (level 3) in the waiting room. */
  const setup = () =>
    game('GUP_W141', { step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, GUP(20), stageSlot(0, 'FC'));
      take(ctx, 0, GUP(5), zone(0, 'hand'));
      take(ctx, 0, GUP(8), zone(0, 'waitingRoom'));
      take(ctx, 0, GUP(3), zone(0, 'waitingRoom'));
      take(ctx, 1, GUP(1), stageSlot(1, 'FC'));
      stackTop(ctx, 0, [GUP(113), GUP(4), GUP(15), GUP(5), GUP(5)]);
    });

  it('【自】 a 《戦車道》 character of the hand paid; three cards to the waiting room, two of them characters: one of level 2 or lower comes back', () => {
    const asked = attack(setup(), 'FC');
    expect(pending(asked.state, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST', cardId: GUP(20) });
    const milling = pick(accept(asked), [GUP(5)]);
    expect(paid(milling)).toEqual(['hand>waitingRoom']);
    const choosing = accept(accept(accept(milling)));
    expect(zoneCards(choosing.state, 0, 'waitingRoom')).toEqual([GUP(113), GUP(15), GUP(3), GUP(4), GUP(5), GUP(8)].sort());
    // Level 2 or lower: GUP-015 (1), GUP-008 (2) and GUP-005 (0, the card paid); not GUP-004 or GUP-003 (level 3).
    expect(pending(choosing.state, 'SELECT_CARDS')).toMatchObject({ min: 1, max: 1 });
    expect(offered(choosing)).toEqual([GUP(15), GUP(5), GUP(8)].sort());
    expect(zoneCards(pick(choosing, [GUP(8)]).state, 0, 'hand')).toContain(GUP(8));
  });

  it('stopped after the climax: X = 0, only a level 0 《戦車道》 character (the card paid)', () => {
    const choosing = decline(accept(pick(accept(attack(setup(), 'FC')), [GUP(5)])));
    expect(offered(choosing)).toEqual([GUP(5)]);
  });
});

describe('BDY/W135-043 Happy Birthday 宮永ののか', () => {
  /** 「✞animaるパーティ✞開催中✞」 in the climax zone; two other 《音楽》 characters; on top: BDY-007 (L1), BDY-064 (climax), BDY-019 (L1). */
  const setup = (others = 2) =>
    game('BDY_W135', { step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, BDY(43), stageSlot(0, 'FC'));
      take(ctx, 0, BDY(64), zone(0, 'climax'));
      [BDY(1), BDY(1)].slice(0, others).forEach((c, k) => take(ctx, 0, c, stageSlot(0, k === 0 ? 'FL' : 'BL')));
      take(ctx, 0, BDY(2), zone(0, 'waitingRoom'));
      take(ctx, 1, BDY(1), stageSlot(1, 'FC'));
      stackTop(ctx, 0, [BDY(7), BDY(64), BDY(19), BDY(2), BDY(2)]);
    });
  /** The CX combo is played first; the other ability (＋1500) after it. */
  const combo = (run: Run): Run => abilityFirst(run, BDY(43), 1);

  it('【CXコンボ】 three cards to the waiting room, two of them 《音楽》 characters: a 《音楽》 character of level 2 or lower may come back', () => {
    const milling = combo(attack(setup(), 'FC'));
    expect(asks(milling, 'CONFIRM', 'DECK_TOP_NEXT')).toBe(true);
    const choosing = accept(accept(accept(milling)));
    expect(pending(choosing.state, 'SELECT_CARDS')).toMatchObject({ min: 0, max: 1 });
    // BDY-007 and BDY-019 (level 1); not BDY-002 (level 3).
    expect(offered(choosing)).toEqual([BDY(19), BDY(7)].sort());
    expect(zoneCards(pick(choosing, [BDY(19)]).state, 0, 'hand')).toContain(BDY(19));
  });

  it('one card only (a 《音楽》 character): X = 1; one other 《音楽》 character only: no combo', () => {
    const one = decline(accept(combo(attack(setup(), 'FC'))));
    expect(offered(one)).toEqual([BDY(7)]);
    // The condition is checked when the ability resolves: nothing is put into the waiting room.
    const fewer = combo(attack(setup(1), 'FC'));
    expect(asks(fewer, 'CONFIRM', 'DECK_TOP_NEXT')).toBe(false);
    expect(fewer.events.some((e) => e.type === 'CARD_MOVED' && e.from.zone === 'deck' && e.to.zone === 'waitingRoom')).toBe(false);
  });
});

describe('GUP/W141-059 麻雀つもつも作戦です！ ケイ', () => {
  const setup = (opponents: number, hand = true) =>
    game('GUP_W141', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, GUP(59), zone(0, 'hand'));
      if (hand) take(ctx, 0, GUP(1), zone(0, 'hand'));
      [GUP(5), GUP(5), GUP(1)].slice(0, opponents).forEach((c, k) => take(ctx, 1, c, stageSlot(1, (['FL', 'FC', 'FR'] as const)[k]!)));
      stackTop(ctx, 0, [GUP(4), GUP(15), GUP(8), GUP(3)]);
    });
  const looked = (run: Run): Run => {
    let current = run;
    while (asks(current, 'CONFIRM', 'LOOK_NEXT')) current = accept(current);
    return current;
  };

  it('【自】 played: a 《戦車道》 character of the hand to the clock; two characters of the opponent: up to three cards looked at, one to the hand', () => {
    const asked = playCharacter(setup(2), GUP(59), 'FC');
    expect(pending(asked.state, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST', cardId: GUP(59) });
    const paying = accept(asked);
    expect(offered(paying)).toEqual([GUP(1)]);
    const looking = looked(pick(paying, [GUP(1)]));
    expect(paid(looking)).toEqual(['hand>clock']);
    expect(offered(looking)).toEqual([GUP(15), GUP(4), GUP(8)].sort());
    // The opponent does not see the cards looked at.
    expect(getPlayerView(looking.state, 1).decision).toMatchObject({ mine: false, kind: 'SELECT_CARDS' });
    const done = pick(looking, [GUP(8)]);
    expect(zoneCards(done.state, 0, 'hand')).toEqual([GUP(8)]);
    expect(zoneCards(done.state, 0, 'waitingRoom')).toEqual([GUP(15), GUP(4)].sort());
  });

  it('no character of the opponent: one card; no other card in the hand: nothing is asked', () => {
    expect(offered(looked(pick(accept(playCharacter(setup(0), GUP(59), 'FC')), [GUP(1)])))).toEqual([GUP(4)]);
    expect(asks(playCharacter(setup(2, false), GUP(59), 'FC'), 'CONFIRM', 'PAY_COST')).toBe(false);
  });
});

describe('GUP/W141-032 隊長 西住みほ', () => {
  const setup = () =>
    game('GUP_W141', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, GUP(32), stageSlot(0, 'FC'));
      take(ctx, 0, GUP(5), zone(0, 'hand'));
      take(ctx, 0, GUP(4), zone(0, 'stock'));
      take(ctx, 0, GUP(15), zone(0, 'waitingRoom'));
      take(ctx, 0, GUP(113), zone(0, 'waitingRoom'));
    });
  const used = () => pick(activate(setup(), 'FC', 1), [GUP(5)]);

  it('【起】 (1), a card discarded, rested: the deck declared, a 《戦車道》 character of it shown and taken, the deck shuffled', () => {
    const asked = used();
    expect(paid(asked).sort()).toEqual(['hand>waitingRoom', 'stock>waitingRoom']);
    expect(pending(asked.state, 'SELECT_OPTION')).toMatchObject({ prompt: 'EFFECT_DECLARE_ZONE', options: ['DECLARE_DECK', 'DECLARE_WAITING_ROOM'] });
    const choosing = choose(asked, 'DECLARE_DECK');
    expect(pending(choosing.state, 'SELECT_CARDS')).toMatchObject({ min: 0, max: 1 });
    // The opponent does not see the deck.
    expect(getPlayerView(choosing.state, 1).decision).toMatchObject({ mine: false, kind: 'SELECT_CARDS' });
    const done = pick(choosing, [GUP(22)]);
    expect(zoneCards(done.state, 0, 'hand')).toEqual([GUP(22)]);
    expect(done.events.some((e) => e.type === 'CARD_REVEALED')).toBe(true);
    expect(done.events.some((e) => e.type === 'DECK_SHUFFLED' && e.player === 0)).toBe(true);
  });

  it('the waiting room declared: only its 《戦車道》 characters (not the climax; the two cards paid are there too); the deck is not shuffled', () => {
    const choosing = choose(used(), 'DECLARE_WAITING_ROOM');
    expect(offered(choosing)).toEqual([GUP(15), GUP(4), GUP(5)].sort());
    const done = pick(choosing, [GUP(15)]);
    expect(zoneCards(done.state, 0, 'hand')).toEqual([GUP(15)]);
    expect(done.events.some((e) => e.type === 'DECK_SHUFFLED')).toBe(false);
  });
});

describe('GUP/W141-107 麻雀つもつも作戦です！ カチューシャ', () => {
  /** The card in the centre, two 《戦車道》 characters in the back row; a draw-icon climax in the climax zone or not; on top of the deck `top`. */
  const setup = (top: string, climax = true) =>
    game('GUP_W141', { step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, GUP(107), stageSlot(0, 'FC'));
      take(ctx, 0, GUP(5), stageSlot(0, 'BL'));
      take(ctx, 0, GUP(1), stageSlot(0, 'BR'));
      take(ctx, 0, GUP(1), stageSlot(0, 'FL'));
      if (climax) take(ctx, 0, GUP(113), zone(0, 'climax'));
      take(ctx, 1, GUP(5), stageSlot(1, 'FC'));
      // The first card is the trigger check of the attack; `top` is on top when the battle opponent is reversed.
      stackTop(ctx, 0, [GUP(5), top, GUP(5)]);
      stackTop(ctx, 1, [GUP(1), GUP(1), GUP(1)]);
    });
  /** Attacks the opponent's 500 character and goes on until this card's ability asks something (or the turn moves on). */
  const reversed = (run: Run): Run => until(then(attack(run, 'FC'), { kind: 'COUNTER', card: null }), (r) => asks(r, 'SELECT_OPTION') || r.state.turn?.player === 1 || played(r, GUP(107)) > 0);

  it('【永】 in your turn, ＋2000 per other 《戦車道》 character of the back row (two: ＋4000; the one in the front row does not count)', () => {
    const start = setup(GUP(4));
    // 4000 printed, +4000 (GUP-113 has no continuous ability: its ability is when it is placed).
    const power = getPower(start.state, at(start.state, 0, 'FC'));
    expect(power).toBe(4000 + 4000);
  });

  it('【自】 the battle opponent reversed with a draw-icon climax: the top card shown; a 《戦車道》 character goes to the hand or the stock', () => {
    const asked = reversed(setup(GUP(4)));
    expect(pending(asked.state, 'SELECT_OPTION')).toMatchObject({ prompt: 'EFFECT_DESTINATION', options: ['HAND', 'STOCK'] });
    expect(zoneCards(choose(asked, 'STOCK').state, 0, 'stock')).toContain(GUP(4));
    expect(zoneCards(choose(asked, 'HAND').state, 0, 'hand')).toContain(GUP(4));
  });

  it('a climax on top: nothing is asked and it stays; no draw-icon climax: the ability does not trigger', () => {
    const climaxTop = reversed(setup(GUP(113)));
    expect(asks(climaxTop, 'SELECT_OPTION')).toBe(false);
    const deck = climaxTop.state.zones[0].deck;
    expect(getInstance(climaxTop.state, deck[deck.length - 1]!).cardId).toBe(GUP(113));
    const noClimax = reversed(setup(GUP(4), false));
    expect(played(noClimax, GUP(107))).toBe(0);
  });
});

describe('ANM/W138-069 “T-REXスーツ”玖琉未', () => {
  const setup = (opponents: number) =>
    game('ANM_W138', { step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, ANM(69), stageSlot(0, 'FC'));
      [ANM(5), ANM(9), ANM(16)].slice(0, opponents).forEach((c, k) => take(ctx, 1, c, stageSlot(1, (['FC', 'FL', 'BL'] as const)[k]!)));
      stackTop(ctx, 0, [ANM(5), ANM(5)]);
      stackTop(ctx, 1, [ANM(5), ANM(5)]);
    });

  it('【自】 when it attacks: ＋X (X = the opponent’s characters ×1000) and 《恐竜》, for the turn', () => {
    const done = attack(setup(3), 'FC');
    const self = at(done.state, 0, 'FC');
    expect(getPower(done.state, self)).toBe(3000 + 3000);
    expect(traitsOf(done.state, self)).toEqual(expect.arrayContaining(['風', '考古学者', '恐竜']));
    const next = until(done, (r) => r.state.turn?.player === 1 && r.state.pending?.kind === 'MAIN');
    expect(traitsOf(next.state, at(next.state, 0, 'FC'))).not.toContain('恐竜');
  });

  it('one character of the opponent: ＋1000', () => {
    const done = attack(setup(1), 'FC');
    expect(getPower(done.state, at(done.state, 0, 'FC'))).toBe(4000);
  });
});

describe('BDY/W135-014 YM∞MT 仲町あられ', () => {
  /** The card attacks from the left (not the centre); a choice-icon climax or another one in the climax zone; another 《音楽》 character or not. */
  const setup = (options: { climax?: string; other?: boolean } = {}) =>
    game('BDY_W135', { step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, BDY(14), stageSlot(0, 'FL'));
      take(ctx, 0, options.climax ?? BDY(26), zone(0, 'climax'));
      if (options.other !== false) take(ctx, 0, BDY(1), stageSlot(0, 'BL'));
      take(ctx, 1, BDY(1), stageSlot(1, 'FR'));
      // The first card is the trigger check of the attack; the next three are looked at.
      stackTop(ctx, 0, [BDY(2), BDY(64), BDY(19), BDY(7), BDY(2)]);
      stackTop(ctx, 1, [BDY(2), BDY(2), BDY(2), BDY(19)]);
    });
  const attackEnd = (run: Run): Run => until(then(attack(run, 'FL'), { kind: 'COUNTER', card: null }), (r) => asks(r, 'CONFIRM', 'PAY_COST') || r.state.turn?.player === 1);

  it('【自】 at the end of its attack: the choice-icon climax paid; three cards looked at, a 《音楽》 character shown, then to the hand or the stock', () => {
    const asked = attackEnd(setup());
    expect(pending(asked.state, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST', cardId: BDY(14) });
    let run = accept(asked);
    expect(paid(run)).toEqual(['climax>waitingRoom']);
    for (let k = 0; k < 3; k++) run = accept(run);
    // BDY-064 (a climax) cannot be taken.
    expect(offered(run)).toEqual([BDY(19), BDY(7)].sort());
    const where = pick(run, [BDY(19)]);
    expect(pending(where.state, 'SELECT_OPTION')).toMatchObject({ prompt: 'EFFECT_DESTINATION', options: ['HAND', 'STOCK'] });
    const done = choose(where, 'STOCK');
    expect(zoneCards(done.state, 0, 'stock')).toContain(BDY(19));
    expect(zoneCards(done.state, 0, 'waitingRoom')).toEqual(expect.arrayContaining([BDY(64), BDY(7), BDY(26)]));
  });

  it('another climax in the climax zone, or no other 《音楽》 character: nothing is asked', () => {
    expect(asks(attackEnd(setup({ climax: BDY(64) })), 'CONFIRM', 'PAY_COST')).toBe(false);
    expect(asks(attackEnd(setup({ other: false })), 'CONFIRM', 'PAY_COST')).toBe(false);
  });
});
