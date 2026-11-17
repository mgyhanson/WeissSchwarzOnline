/**
 * Building blocks of batch 10: an ability that works in the waiting room (控え室にこのカードがあるなら) at the
 * start of its player's first turn, the opponent swapping one of their characters for one of the waiting room
 * whose level is at most X, 絆 with two names, and a counter event whose effect is a choice of two. Synthetic
 * cards; the wording each case stands for is in its name.
 */

import { describe, expect, it } from 'vitest';
import { type Ability, type CardDef, type Choice, type Effect, type GameEvent, type GameState, type PlayerId, bond, createGame, getInstance, opponentOf, stageSlot } from '../src/index';
import { attack, cards } from './ability-helpers';
import { EVENT, answer, card, oid, pending, put, scenario, testConfig } from './helpers';

const character = (level: number, more: Partial<CardDef> = {}): Partial<CardDef> => ({ kind: 'CHARACTER', level, cost: 0, power: 500, soul: 1, ...more });
const zoneOf = (state: GameState, instanceId: number): string => getInstance(state, instanceId).location.zone;
const go = (state: GameState, ...choices: Choice[]) => {
  let events: GameEvent[] = [];
  for (const choice of choices) {
    const next = answer(state, choice);
    state = next.state;
    events = [...events, ...next.events];
  }
  return { state, events };
};
const pick = (state: GameState, ...instanceIds: number[]): Choice => ({ kind: 'SELECT_CARDS', cards: instanceIds.map((id) => oid(state, id)) });
const offered = (state: GameState): number[] => [...pending(state, 'SELECT_CARDS').cards].sort((a, b) => a - b);
const objects = (state: GameState, ...instanceIds: number[]): number[] => instanceIds.map((id) => oid(state, id)).sort((a, b) => a - b);
const YES: Choice = { kind: 'CONFIRM', accept: true };
const NO: Choice = { kind: 'CONFIRM', accept: false };

// ---------------------------------------------------------------------------------------------------------

describe('控え室にこのカードがあるなら、あなたの第1ターンの始めに、あなたはこのカードをストック置場に置いてよい', () => {
  const toStock: Ability = { type: 'AUTO', zone: 'WAITING_ROOM', trigger: { on: 'PHASE_START', phase: 'STAND', turn: 'YOURS', turnOfPlayer: 1 }, optional: true, effect: [{ do: 'MOVE', target: { who: 'SELF' }, to: 'STOCK' }] };
  /** Every card of both decks has the ability; the game starts from the beginning. */
  const game = (seed: string) => createGame(testConfig((_p, i) => (i < 42 ? { abilities: [toStock] } : undefined)), seed).state;
  /** Both players put the first two cards of their hand into the waiting room in the mulligan. */
  const afterMulligan = (seed: string) => {
    let state = game(seed);
    const discarded: Record<PlayerId, number[]> = { 0: [], 1: [] };
    for (let k = 0; k < 2; k++) {
      const decision = pending(state, 'MULLIGAN');
      const ids = decision.cards.slice(0, 2);
      discarded[decision.player] = ids.map((o) => state.instances.find((c) => c.objectId === o)!.instanceId);
      state = answer(state, { kind: 'MULLIGAN', discard: ids }).state;
    }
    return { state, discarded };
  };
  /** The cards with the ability (the test climaxes, indices 42 to 49, have none). */
  const characters = (_state: GameState, ids: number[]) => ids.filter((id) => id % 50 < 42);

  it('cards put into the waiting room in the mulligan: each may go to the stock at the start of their player’s first turn', () => {
    const { state, discarded } = afterMulligan('wr-first-1');
    const first = state.firstPlayer as PlayerId;
    const mine = characters(state, discarded[first]);
    expect(mine.length).toBeGreaterThan(0);
    // The first player's cards are asked about one by one (the order of two waiting abilities is the player's).
    expect(state.turn).toMatchObject({ number: 1, player: first });
    expect(state.turnsTaken).toEqual(first === 0 ? [1, 0] : [0, 1]);
    let current = state;
    const asked: number[] = [];
    for (let k = 0; k < 6 && current.pending && current.pending.kind !== 'MAIN' && current.pending.kind !== 'CLOCK'; k++) {
      const d = current.pending;
      if (d.kind === 'CHOOSE_ABILITY') current = answer(current, { kind: 'CHOOSE_ABILITY', id: d.abilities[0]!.id }).state;
      else if (d.kind === 'CONFIRM') {
        expect(d.player).toBe(first);
        asked.push(d.card!);
        current = answer(current, YES).state;
      } else break;
    }
    expect(asked.sort((a, b) => a - b)).toEqual(objects(state, ...mine));
    for (const id of mine) expect(zoneOf(current, id)).toBe('stock');
    // The second player's cards stay where they are in the first player's turn.
    for (const id of characters(state, discarded[opponentOf(first)])) expect(zoneOf(current, id)).toBe('waitingRoom');
  });

  it('the second player’s first turn is the game’s second turn; in later turns nothing is asked', () => {
    const { state, discarded } = afterMulligan('wr-first-2');
    const first = state.firstPlayer as PlayerId;
    const second = opponentOf(first);
    // Decline everything in the first turn and play on to the second player's first stand phase.
    let current = state;
    for (let k = 0; k < 200 && !(current.turn?.player === second && current.pending?.kind === 'CONFIRM'); k++) {
      const d = current.pending!;
      const choice: Choice =
        d.kind === 'CHOOSE_ABILITY' ? { kind: 'CHOOSE_ABILITY', id: d.abilities[0]!.id }
          : d.kind === 'MAIN' ? { kind: 'MAIN', action: { type: 'PASS' } }
          : d.kind === 'CLIMAX' ? { kind: 'CLIMAX', card: null }
          : d.kind === 'ATTACK' ? { kind: 'ATTACK', attack: null }
          : d.kind === 'CLOCK' ? { kind: 'CLOCK', card: null }
          : d.kind === 'HAND_LIMIT' ? { kind: 'HAND_LIMIT', discard: d.cards.slice(0, d.count) }
          : NO;
      current = answer(current, choice).state;
    }
    expect(current.turn).toMatchObject({ number: 2, player: second });
    expect(current.turnsTaken).toEqual([1, 1]);
    expect(pending(current, 'CONFIRM').player).toBe(second);
    const theirs = characters(state, discarded[second]);
    expect(theirs.length).toBeGreaterThan(0);
    expect(theirs.map((id) => oid(state, id))).toContain(pending(current, 'CONFIRM').card);
    // The first player's cards declined in turn 1 are not asked again.
    for (const id of characters(state, discarded[first])) expect(zoneOf(current, id)).toBe('waitingRoom');
  });

  it('not the first turn: a card in the waiting room is not asked about (turn 3 of a prepared game)', () => {
    const start = scenario({ step: 'STAND_START', defs: cards({ '0:5': { abilities: [toStock] } }) }, (ctx) => {
      put(ctx, card(0, 5), { player: 0, zone: 'waitingRoom' });
      ctx.state.turnsTaken = [1, 1];
    });
    expect(start.state.turnsTaken).toEqual([2, 1]);
    expect(zoneOf(start.state, card(0, 5))).toBe('waitingRoom');
    expect(start.events.some((e) => e.type === 'ABILITY_PLAYED')).toBe(false);
  });

  it('an extra turn is one of the player’s turns: the first player’s second turn is not the first', () => {
    const start = scenario({ step: 'STAND_START', turnNumber: 2, defs: cards({ '0:5': { abilities: [toStock] } }) }, (ctx) => {
      put(ctx, card(0, 5), { player: 0, zone: 'waitingRoom' });
      // Turn 1 was player 0's, and turn 2 is player 0's extra turn.
      ctx.state.turnsTaken = [1, 0];
    });
    expect(start.state.turnsTaken).toEqual([2, 0]);
    expect(start.events.some((e) => e.type === 'ABILITY_PLAYED')).toBe(false);
  });

  it('T-CARD-005 / CR-2.12.2.3: only from the waiting room: on the stage, in the hand or in the stock, the card has no such ability in force', () => {
    for (const zone of ['hand', 'stock', 'clock', 'memory'] as const) {
      const start = scenario({ step: 'STAND_START', turnNumber: 1, defs: cards({ '0:5': { abilities: [toStock] } }) }, (ctx) => put(ctx, card(0, 5), { player: 0, zone }));
      // Nothing is asked: the turn goes on to the draw (the ability is optional, so it would be a question first).
      expect(start.state.pending?.kind === 'CONFIRM' && start.state.pending.prompt === 'USE_ABILITY', zone).toBe(false);
      expect(start.events.some((e) => e.type === 'ABILITY_PLAYED'), zone).toBe(false);
    }
    const staged = scenario({ step: 'STAND_START', turnNumber: 1, defs: cards({ '0:5': { abilities: [toStock] } }) }, (ctx) => put(ctx, card(0, 5), stageSlot(0, 'FC')));
    expect(staged.state.pending?.kind === 'CONFIRM' && staged.state.pending.prompt === 'USE_ABILITY').toBe(false);
    expect(zoneOf(staged.state, card(0, 5))).toBe('stage');
  });

  it('the second player’s first turn after the first player took an extra turn: their own count decides', () => {
    const start = scenario({ step: 'STAND_START', turnPlayer: 1, turnNumber: 3, defs: cards({ '1:5': { abilities: [toStock] } }) }, (ctx) => {
      put(ctx, card(1, 5), { player: 1, zone: 'waitingRoom' });
      ctx.state.turnsTaken = [2, 0];
    });
    expect(start.state.turnsTaken).toEqual([2, 1]);
    expect(pending(start.state, 'CONFIRM')).toMatchObject({ player: 1, card: oid(start.state, card(1, 5)) });
  });

  it('the opponent’s waiting room: their card waits for their own first turn', () => {
    const start = scenario({ step: 'STAND_START', turnNumber: 1, defs: cards({ '1:5': { abilities: [toStock] } }) }, (ctx) => put(ctx, card(1, 5), { player: 1, zone: 'waitingRoom' }));
    expect(start.events.some((e) => e.type === 'ABILITY_PLAYED')).toBe(false);
  });

  it('declined: the card stays in the waiting room; gone from the waiting room before it resolves: nothing is moved', () => {
    const start = scenario({ step: 'STAND_START', turnNumber: 1, defs: cards({ '0:5': { abilities: [toStock] } }) }, (ctx) => put(ctx, card(0, 5), { player: 0, zone: 'waitingRoom' }));
    expect(pending(start.state, 'CONFIRM')).toMatchObject({ player: 0, card: oid(start.state, card(0, 5)) });
    expect(zoneOf(go(start.state, NO).state, card(0, 5))).toBe('waitingRoom');
    expect(zoneOf(go(start.state, YES).state, card(0, 5))).toBe('stock');
  });
});

describe('相手のレベル1以上のキャラを1枚選び、相手は自分の控え室のレベルＸ以下のキャラを1枚選び、入れ替える。Ｘはあなたが選んだキャラのレベル－1に等しい', () => {
  const swap: Effect[] = [
    { do: 'CHOOSE', from: 'OPPONENT_STAGE', filter: { kind: 'CHARACTER', levelMin: 1 }, min: 1, max: 1 },
    { do: 'SET_X', count: { of: 'CHOSEN_LEVEL' }, minus: 1 },
    { do: 'OPPONENT_SWAPS_FROM_WAITING_ROOM', levelMaxX: true },
  ];
  const act: Ability = { type: 'ACT', timing: 'MAIN', cost: [], effect: swap };
  /** Player 1: card 1 (level 2) in the centre, card 2 (level 0) on the left; levels 0, 1 and 2 (cards 10, 11, 12) in the waiting room. */
  const field = (more: Partial<Record<string, Partial<CardDef>>> = {}) =>
    scenario(
      {
        step: 'MAIN_START',
        defs: cards({ '0:0': { abilities: [act] }, '1:1': character(2), '1:2': character(0), '1:10': character(0), '1:11': character(1), '1:12': character(2), ...more }),
      },
      (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, 'FC'));
        put(ctx, card(1, 1), stageSlot(1, 'FC'), { orientation: 'REST' });
        put(ctx, card(1, 2), stageSlot(1, 'FL'));
        for (const i of [10, 11, 12]) put(ctx, card(1, i), { player: 1, zone: 'waitingRoom' });
      },
    ).state;
  const use = (state: GameState) => answer(state, { kind: 'MAIN', action: { type: 'ACTIVATE', card: oid(state, card(0, 0)), ability: 0 } }).state;

  it('only a character of level 1 or higher can be chosen; the opponent then chooses one of level X = 2 − 1 or lower', () => {
    const choosing = use(field());
    expect(pending(choosing, 'SELECT_CARDS')).toMatchObject({ player: 0, min: 1, max: 1 });
    expect(offered(choosing)).toEqual(objects(choosing, card(1, 1)));
    const theirs = go(choosing, pick(choosing, card(1, 1))).state;
    expect(pending(theirs, 'SELECT_CARDS')).toMatchObject({ player: 1, min: 1, max: 1 });
    expect(offered(theirs)).toEqual(objects(theirs, card(1, 10), card(1, 11)));
    const { state } = go(theirs, pick(theirs, card(1, 11)));
    // The chosen character goes to the waiting room; the one chosen by the opponent takes its slot, standing (CR-3.6.3).
    expect(state.zones[1].stage.FC).toEqual([card(1, 11)]);
    expect(getInstance(state, card(1, 11)).orientation).toBe('STAND');
    expect(zoneOf(state, card(1, 1))).toBe('waitingRoom');
  });

  it('a level 1 character chosen: X = 0, only a level 0 character; none in the waiting room: nothing is exchanged', () => {
    const levelOne = use(field({ '1:1': character(1) }));
    const theirs = go(levelOne, pick(levelOne, card(1, 1))).state;
    expect(offered(theirs)).toEqual(objects(theirs, card(1, 10)));
    const none = use(field({ '1:1': character(1), '1:10': character(3) }));
    const after = go(none, pick(none, card(1, 1))).state;
    expect(after.pending?.kind).toBe('MAIN');
    expect(after.zones[1].stage.FC).toEqual([card(1, 1)]);
  });

  it('the level the character has now counts (a level changed by an effect), and a climax in the waiting room is not a character', () => {
    const start = field({ '1:1': character(1), '1:12': { kind: 'CLIMAX', level: null, cost: null, power: null, soul: null } });
    start.modifiers.push({ objectId: oid(start, card(1, 1)), stat: 'LEVEL', delta: 2 });
    const choosing = use(start);
    const theirs = go(choosing, pick(choosing, card(1, 1))).state;
    // Level 1 + 2 = 3: X = 2, levels 0 and 1 (and no climax).
    expect(offered(theirs)).toEqual(objects(theirs, card(1, 10), card(1, 11)));
  });

  it('no character of level 1 or higher: nothing is chosen and nothing happens (CR-8.6.3.1.3)', () => {
    const start = field({ '1:1': character(0) });
    const after = use(start);
    expect(after.pending?.kind).toBe('MAIN');
    expect(after.zones[1].waitingRoom).toHaveLength(3);
  });
});

describe('絆／「A」「B」: a card with either name', () => {
  const twoNames: Ability = bond(['Alpha', 'Beta'], [{ pay: 'DISCARD', count: 1 }]);
  const field = () =>
    scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [twoNames] }, '0:1': { name: 'Alpha' }, '0:2': { name: 'Beta' }, '0:3': { name: 'Gamma' } }) }, (ctx) => {
      put(ctx, card(0, 0), { player: 0, zone: 'hand' });
      put(ctx, card(0, 4), { player: 0, zone: 'hand' });
      for (const i of [1, 2, 3]) put(ctx, card(0, i), { player: 0, zone: 'waitingRoom' });
    }).state;

  it('T-KW-024 / CR-10.4.2.1: played from the hand: the cost may be paid; then one card named Alpha or Beta comes back, not Gamma', () => {
    expect(bond('Alpha', []).effect[0]).toMatchObject({ filter: { name: 'Alpha' } });
    expect(bond(['Alpha'], []).effect[0]).toMatchObject({ filter: { name: 'Alpha' } });
    const start = field();
    const played = answer(start, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(start, card(0, 0)), slot: 'FC' } }).state;
    expect(pending(played, 'CONFIRM').prompt).toBe('PAY_COST');
    const paying = go(played, YES).state;
    const choosing = go(paying, pick(paying, card(0, 4))).state;
    expect(offered(choosing)).toEqual(objects(choosing, card(0, 1), card(0, 2)));
    expect(pending(choosing, 'SELECT_CARDS')).toMatchObject({ min: 1, max: 1 });
    expect(zoneOf(go(choosing, pick(choosing, card(0, 2))).state, card(0, 2))).toBe('hand');
    // Not paid: nothing comes back.
    expect(go(played, NO).state.zones[0].hand).toEqual([card(0, 4)]);
  });
});

describe('【カウンター】 次の2つの効果のうちあなたが選んだ1つを行う (a counter event, CR-7.4.1.2.1)', () => {
  const choice: Effect[] = [
    {
      do: 'CHOOSE_ONE',
      options: [
        [{ do: 'CHOOSE', from: 'YOUR_STAGE', min: 1, max: 1 }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' }],
        [{ do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { kind: 'CHARACTER' }, min: 1, max: 1 }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' }],
      ],
    },
  ];
  /** Player 1 is attacked by card 0 (power 5000) in front of its card 1 (power 500); the counter event (card 20) is in player 1's hand. */
  const field = (counter = true) =>
    scenario({ step: 'ATTACK_START', defs: cards({ '0:0': { power: 5000 }, '1:1': { power: 500 }, '1:20': { ...EVENT, counter, effect: choice }, '1:3': character(0) }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(1, 1), stageSlot(1, 'FC'));
      put(ctx, card(1, 20), { player: 1, zone: 'hand' });
      put(ctx, card(1, 3), { player: 1, zone: 'waitingRoom' });
    }).state;
  const atCounter = (counter = true) => attack(field(counter), card(0, 0), 'FRONT').state;

  it('offered in the counter step only with the counter icon', () => {
    expect(pending(atCounter(), 'COUNTER').cards).toEqual([oid(atCounter(), card(1, 20))]);
    expect(pending(atCounter(false), 'COUNTER').cards).toEqual([]);
  });

  it('the defending character back to the hand: there is no battle, the damage is dealt (CR-7.6.1.3)', () => {
    const start = atCounter();
    const played = go(start, { kind: 'COUNTER', card: oid(start, card(1, 20)) }).state;
    expect(pending(played, 'SELECT_OPTION')).toMatchObject({ player: 1, options: ['EFFECT_1', 'EFFECT_2'] });
    const choosing = go(played, { kind: 'SELECT_OPTION', option: 'EFFECT_1' }).state;
    const { state, events } = go(choosing, pick(choosing, card(1, 1)));
    expect(zoneOf(state, card(1, 1))).toBe('hand');
    expect(zoneOf(state, card(1, 20))).toBe('waitingRoom');
    expect(events.some((e) => e.type === 'DAMAGE_DEALT')).toBe(true);
    expect(events.some((e) => e.type === 'ORIENTATION_CHANGED' && e.to === 'REVERSE')).toBe(false);
  });

  it('the other effect: a character of the waiting room to the hand, and the battle goes on', () => {
    const start = atCounter();
    const choosing = go(start, { kind: 'COUNTER', card: oid(start, card(1, 20)) }, { kind: 'SELECT_OPTION', option: 'EFFECT_2' }).state;
    expect(offered(choosing)).toEqual(objects(choosing, card(1, 3)));
    const { state, events } = go(choosing, pick(choosing, card(1, 3)));
    expect(zoneOf(state, card(1, 3))).toBe('hand');
    expect(events.some((e) => e.type === 'ORIENTATION_CHANGED' && e.to === 'REVERSE' && e.instanceId === card(1, 1))).toBe(true);
  });
});
