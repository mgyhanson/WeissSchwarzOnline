/**
 * Building blocks of batch 9: what is done with the cards an effect put into the waiting room from the top of
 * the deck (Ｘ from their levels or soul icons, a climax among them, one card each from both decks, a card put
 * there by choice), the card just chosen and moved, an action that follows only under a condition, a card looked
 * at and put on the stage, and このカードがフロントアタックされた時. Synthetic cards; the wording each case
 * stands for is in its name.
 */

import { describe, expect, it } from 'vitest';
import { type Ability, type CardDef, type Choice, type Cost, type Ctx, type Effect, type GameEvent, type GameState, type SlotId, getInstance, getPlayerView, stageSlot } from '../src/index';
import { activate, attack, cards } from './ability-helpers';
import { EVENT, answer, card, oid, pending, put, scenario } from './helpers';

const act = (effect: Effect[], cost: Cost[] = []): Ability => ({ type: 'ACT', timing: 'MAIN', cost, effect });
const character = (level: number, more: Partial<CardDef> = {}): Partial<CardDef> => ({ kind: 'CHARACTER', level, cost: 0, power: 500, soul: 1, ...more });
const CLIMAX: Partial<CardDef> = { kind: 'CLIMAX', level: null, cost: null, power: null, soul: null };
const zoneOf = (state: GameState, instanceId: number): string => getInstance(state, instanceId).location.zone;
const at = (state: GameState, player: 0 | 1, slot: SlotId): number | undefined => state.zones[player].stage[slot][0];
const topOf = (state: GameState, player: 0 | 1): number => state.zones[player].deck[state.zones[player].deck.length - 1]!;
/** The climaxes of a player out of the deck, into the stock (the memory is counted by some of these effects). */
const climaxesAway = (ctx: Ctx, player: 0 | 1, except: number[] = []) => {
  for (const i of [42, 43, 44, 45, 46, 47, 48, 49]) if (!except.includes(i)) put(ctx, card(player, i), { player, zone: 'stock' });
};
/** Answers one decision after another. */
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
const offered = (state: GameState): number[] => pending(state, 'SELECT_CARDS').cards;
const YES: Choice = { kind: 'CONFIRM', accept: true };
const NO: Choice = { kind: 'CONFIRM', accept: false };
const PASS: Choice = { kind: 'COUNTER', card: null };

// ---------------------------------------------------------------------------------------------------------

describe('山札の上からN枚を、控え室に置き、自分の控え室のレベルＸ以下の…を1枚まで選び、手札に戻す。この効果で控え室に置かれたカードにCXがあるなら、…', () => {
  // …あなたは自分の山札の上から1枚を、ストック置場に置いてよい。Ｘはこの効果で控え室に置かれたカードのレベルの合計に等しい。
  const mill: Ability = act([
    { do: 'DECK_TOP', count: 2, to: 'WAITING_ROOM', setX: 'LEVEL_TOTAL', said: 'THIS_EFFECT' },
    { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { kind: 'CHARACTER' }, min: 0, max: 1, levelMaxX: true },
    { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
    { do: 'IF', condition: { if: 'LAST_MOVED', min: 1, filter: { kind: 'CLIMAX' }, said: 'THIS_EFFECT' }, then: [{ do: 'MAY', effects: [{ do: 'DECK_TOP', count: 1, to: 'STOCK' }] }] },
  ]);
  /** Cards 41 and 40 are the top two of the deck; 1, 2, 3 and 4 (levels 0, 1, 3, 4) are in the waiting room. */
  const field = (first: Partial<CardDef>, second: Partial<CardDef>) =>
    scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [mill] }, '0:41': first, '0:40': second, '0:1': character(0), '0:2': character(1), '0:3': character(3), '0:4': character(4) }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      for (const i of [1, 2, 3, 4]) put(ctx, card(0, i), { player: 0, zone: 'waitingRoom' });
      climaxesAway(ctx, 0);
    }).state;
  const inWaitingRoom = (state: GameState, ...indices: number[]) => indices.map((i) => oid(state, card(0, i)));

  it('Ｘ is the total of the levels of the two cards: characters of that level or lower are offered, the two cards among them', () => {
    const { state } = activate(field(character(1), character(2)), card(0, 0));
    // Ｘ = 3: levels 0, 1 and 3 of the waiting room, and the two cards just put there (1 and 2); not the level 4.
    expect([...offered(state)].sort()).toEqual(inWaitingRoom(state, 1, 2, 3, 41, 40).sort());
    expect(pending(state, 'SELECT_CARDS').min).toBe(0);
    const done = go(state, pick(state, card(0, 3)));
    expect(zoneOf(done.state, card(0, 3))).toBe('hand');
    // No climax among the two: nothing is asked, the stock is as it was.
    expect(done.state.pending?.kind).toBe('MAIN');
    expect(done.state.zones[0].stock).toHaveLength(8);
  });

  it('a climax counts as level 0, and with one among the two cards the top card may be put into the stock', () => {
    const { state } = activate(field(CLIMAX, character(1)), card(0, 0));
    // Ｘ = 0 + 1.
    expect([...offered(state)].sort()).toEqual(inWaitingRoom(state, 1, 2, 40).sort());
    const chosen = go(state, pick(state, card(0, 2)));
    expect(pending(chosen.state, 'CONFIRM').player).toBe(0);
    const next = topOf(chosen.state, 0);
    const accepted = go(chosen.state, YES);
    expect(accepted.state.zones[0].stock).toHaveLength(9);
    expect(zoneOf(accepted.state, next)).toBe('stock');
    const declined = go(chosen.state, NO);
    expect(declined.state.zones[0].stock).toHaveLength(8);
    expect(topOf(declined.state, 0)).toBe(next);
  });

  it('two climaxes: Ｘ = 0, only level 0 characters; taking no card still leaves the question about the stock', () => {
    const { state } = activate(field(CLIMAX, CLIMAX), card(0, 0));
    expect(offered(state)).toEqual(inWaitingRoom(state, 1));
    const none = go(state, pick(state));
    expect(none.state.zones[0].hand).toHaveLength(0);
    expect(none.state.pending?.kind).toBe('CONFIRM');
  });

  it('the card taken back may be one of the two; the climax put there with it still counts', () => {
    const { state } = activate(field(character(1), CLIMAX), card(0, 0));
    const taken = go(state, pick(state, card(0, 41)));
    expect(zoneOf(taken.state, card(0, 41))).toBe('hand');
    expect(taken.state.pending?.kind).toBe('CONFIRM');
  });

  it('an event among the two cards counts with its level, and is not a climax', () => {
    const { state } = activate(field({ ...EVENT, level: 3 }, character(0)), card(0, 0));
    expect([...offered(state)].sort()).toEqual(inWaitingRoom(state, 1, 2, 3, 40).sort());
    expect(go(state, pick(state)).state.pending?.kind).toBe('MAIN');
  });
});

describe('Ｘはそれらのカードのトリガーアイコンの soul の合計に等しい', () => {
  const mill: Ability = act([
    { do: 'DECK_TOP', count: 4, to: 'WAITING_ROOM', setX: 'SOUL_ICONS' },
    { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { kind: 'CHARACTER' }, min: 0, max: 1, levelMaxX: true },
    { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
  ]);
  const field = (icons: CardDef['triggers'][]) =>
    scenario(
      {
        step: 'MAIN_START',
        defs: cards({
          '0:0': { abilities: [mill] },
          '0:41': character(9, { triggers: icons[0]! }),
          '0:40': character(9, { triggers: icons[1]! }),
          '0:39': { ...CLIMAX, triggers: icons[2]! },
          '0:38': character(9, { triggers: icons[3]! }),
          '0:1': character(0),
          '0:2': character(3),
          '0:3': character(4),
        }),
      },
      (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, 'FC'));
        for (const i of [1, 2, 3]) put(ctx, card(0, i), { player: 0, zone: 'waitingRoom' });
        climaxesAway(ctx, 0);
      },
    ).state;

  it('every soul icon counts, two on one card are two, on a climax too; other icons do not', () => {
    const { state } = activate(field([['SOUL', 'SOUL'], ['DRAW'], ['SOUL'], []]), card(0, 0));
    // Ｘ = 3: the level 0 and the level 3 character, not the level 4 one (nor the level 9 cards just put there).
    expect([...offered(state)].sort()).toEqual([oid(state, card(0, 1)), oid(state, card(0, 2))].sort());
    expect(state.zones[0].waitingRoom).toHaveLength(3 + 4);
  });

  it('no soul icon: Ｘ = 0, only a level 0 character', () => {
    const { state } = activate(field([[], ['DRAW'], [], ['SHOT']]), card(0, 0));
    expect(offered(state)).toEqual([oid(state, card(0, 1))]);
  });
});

describe('すべてのプレイヤーは自分の山札の上から1枚を、控え室に置く。あなたの…カードのレベルが相手の…カードのレベルより高いなら、あなたは1枚引いてよい', () => {
  const effect: Effect[] = [
    { do: 'DECK_TOP', count: 1, to: 'WAITING_ROOM', whose: 'EVERYONE' },
    { do: 'IF', condition: { if: 'MOVED_LEVEL_HIGHER' }, then: [{ do: 'MAY', effects: [{ do: 'DRAW', count: 1 }] }] },
  ];
  const field = (mine: Partial<CardDef>, theirs: Partial<CardDef>) =>
    scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [act(effect)] }, '0:41': mine, '1:41': theirs }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      climaxesAway(ctx, 0);
      climaxesAway(ctx, 1);
    }).state;
  const movedToWaitingRoom = (events: GameEvent[]) => events.flatMap((e) => (e.type === 'CARD_MOVED' && e.to.zone === 'waitingRoom' ? [e.instanceId] : []));

  it('each player puts the top card of their own deck there, the turn player first; higher level: the draw is offered', () => {
    const { state, events } = activate(field(character(2), character(1)), card(0, 0));
    expect(movedToWaitingRoom(events)).toEqual([card(0, 41), card(1, 41)]);
    expect(zoneOf(state, card(1, 41))).toBe('waitingRoom');
    expect(getInstance(state, card(1, 41)).location.player).toBe(1);
    expect(pending(state, 'CONFIRM').player).toBe(0);
    const top = topOf(state, 0);
    expect(zoneOf(go(state, YES).state, top)).toBe('hand');
    const declined = go(state, NO).state;
    expect(declined.zones[0].hand).toHaveLength(0);
    expect(declined.pending?.kind).toBe('MAIN');
  });

  it.each([
    ['the same level', character(1), character(1)],
    ['a lower level', character(0), character(3)],
    ['a climax (level 0) against a level 0 character', CLIMAX, character(0)],
    ['a climax against a climax', CLIMAX, CLIMAX],
  ])('%s: both cards are put there, no draw is offered', (_name, mine, theirs) => {
    const { state } = activate(field(mine, theirs), card(0, 0));
    expect(zoneOf(state, card(0, 41))).toBe('waitingRoom');
    expect(zoneOf(state, card(1, 41))).toBe('waitingRoom');
    expect(state.pending?.kind).toBe('MAIN');
  });

  it.each([
    ['a level 1 character against a climax', character(1), CLIMAX],
    ['a level 1 event against a level 0 character', { ...EVENT, level: 1 }, character(0)],
  ])('%s: higher, the draw is offered', (_name, mine, theirs) => {
    expect(activate(field(mine, theirs), card(0, 0)).state.pending?.kind).toBe('CONFIRM');
  });

  it('in the opponent\'s turn the opponent (the turn player) goes first; the levels compared are still "yours" against "theirs"', () => {
    const auto: Ability = { type: 'AUTO', trigger: { on: 'PHASE_START', phase: 'ATTACK', turn: 'OPPONENT' }, effect };
    const start = scenario({ step: 'ATTACK_START', turnPlayer: 1, defs: cards({ '0:0': { abilities: [auto] }, '0:41': character(2), '1:41': character(1) }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(1, 0), stageSlot(1, 'FC'));
      climaxesAway(ctx, 0);
      climaxesAway(ctx, 1);
    });
    expect(movedToWaitingRoom(start.events)).toEqual([card(1, 41), card(0, 41)]);
    expect(pending(start.state, 'CONFIRM').player).toBe(0);
  });
});

describe('山札の上から1枚を、控え室に置いてよい。そのカードが…なら、そのターン中、このカードは次の能力を得る。『このカードがフロントアタックされた時、このカードを手札に戻してよい』', () => {
  const back: Ability = { type: 'AUTO', trigger: { on: 'THIS_FRONT_ATTACKED' }, optional: true, effect: [{ do: 'MOVE', target: { who: 'SELF' }, to: 'HAND' }] };
  const gain: Ability = {
    type: 'AUTO',
    trigger: { on: 'PHASE_START', phase: 'ATTACK', turn: 'OPPONENT' },
    effect: [
      { do: 'DECK_TOP', count: 1, to: 'WAITING_ROOM', upTo: true, may: true },
      { do: 'IF', condition: { if: 'LAST_MOVED', min: 1, filter: { kind: 'CHARACTER', levelMax: 2 }, said: 'THAT_CARD' }, then: [{ do: 'GRANT', target: { who: 'SELF' }, ability: back }] },
    ],
  };
  /** Player 1's turn. Player 0 has the card (power 500) in the centre; player 1 has an attacker (power 5000, soul 1) facing it. */
  const field = (top: Partial<CardDef>) =>
    scenario({ step: 'ATTACK_START', turnPlayer: 1, defs: cards({ '0:0': { abilities: [gain], power: 500 }, '0:41': top, '1:0': { power: 5000 } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(1, 0), stageSlot(1, 'FC'));
      climaxesAway(ctx, 0);
      climaxesAway(ctx, 1);
    }).state;
  const dealt = (events: GameEvent[]) => events.flatMap((e) => (e.type === 'DAMAGE_DEALT' ? [e.amount] : []));

  it('accepted, a level 1 character: the card has the ability; front attacked and taken back, there is no battle but the damage is dealt', () => {
    const start = field(character(1));
    expect(pending(start, 'CONFIRM').player).toBe(0);
    const milled = go(start, YES).state;
    expect(zoneOf(milled, card(0, 41))).toBe('waitingRoom');
    expect(milled.grants.some((g) => g.objectId === oid(milled, card(0, 0)))).toBe(true);
    const attacked = attack(milled, card(1, 0), 'FRONT');
    // The player of the attacked card is asked (the ability is optional).
    expect(attacked.state.pending?.player).toBe(0);
    expect(pending(attacked.state, 'CONFIRM').prompt).toBe('USE_ABILITY');
    // The counter step is still held (CR-7.4.1): the attack is a front attack although its target is gone.
    const taken = go(attacked.state, YES, PASS);
    expect(zoneOf(taken.state, card(0, 0))).toBe('hand');
    // CR-7.6.1.3: no power is compared, the attacker is not reversed; the soul of the attack (1, no direct-attack bonus) is dealt.
    expect(dealt(taken.events)).toEqual([1]);
    expect(getInstance(taken.state, card(1, 0)).orientation).toBe('REST');
    expect(taken.events.some((e) => e.type === 'ORIENTATION_CHANGED' && e.to === 'REVERSE')).toBe(false);
  });

  it('declined when attacked: the battle takes place as usual', () => {
    const milled = go(field(character(2)), YES).state;
    const attacked = attack(milled, card(1, 0), 'FRONT');
    const kept = go(attacked.state, NO, PASS);
    expect(zoneOf(kept.state, card(0, 0))).not.toBe('hand');
    expect(kept.events.some((e) => e.type === 'ORIENTATION_CHANGED' && e.to === 'REVERSE' && e.instanceId === card(0, 0))).toBe(true);
  });

  it('a side attack is not a front attack: nothing is asked', () => {
    const milled = go(field(character(1)), YES).state;
    const attacked = attack(milled, card(1, 0), 'SIDE');
    // The player of the card is not asked anything: the attack goes on to its damage.
    expect(attacked.state.pending?.kind === 'CONFIRM' && attacked.state.pending.prompt === 'USE_ABILITY').toBe(false);
    expect(attacked.events.some((e) => e.type === 'DAMAGE_DEALT')).toBe(true);
    expect(zoneOf(attacked.state, card(0, 0))).toBe('stage');
    expect(attacked.events.some((e) => e.type === 'ABILITY_PLAYED' && e.instanceId === card(0, 0))).toBe(false);
  });

  it('not put there (置いてよい): the top card stays, no ability', () => {
    const kept = go(field(character(1)), NO).state;
    expect(topOf(kept, 0)).toBe(card(0, 41));
    expect(kept.grants).toHaveLength(0);
    const attacked = attack(kept, card(1, 0), 'FRONT');
    expect(attacked.events.some((e) => e.type === 'ABILITY_PLAYED' && e.instanceId === card(0, 0))).toBe(false);
  });

  it.each([
    ['a level 3 character', character(3)],
    ['a climax', CLIMAX],
    ['an event of level 1', { ...EVENT, level: 1 }],
  ])('%s put there: it stays in the waiting room, no ability', (_name, top) => {
    const milled = go(field(top), YES).state;
    expect(zoneOf(milled, card(0, 41))).toBe('waitingRoom');
    expect(milled.grants).toHaveLength(0);
  });
});

describe('…を1枚まで選び、手札に戻す。選んだキャラのレベルがN以上なら、あなたは自分の手札を1枚選び、ストック置場に置いてよい', () => {
  const back: Ability = act([
    { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { kind: 'CHARACTER' }, min: 0, max: 1 },
    { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
    { do: 'IF', condition: { if: 'MOVED_CARD', filter: { levelMin: 3 } }, then: [{ do: 'MAY', effects: [{ do: 'CHOOSE', from: 'YOUR_HAND', min: 1, max: 1 }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'STOCK' }] }] },
  ]);
  /** Cards 1 (level 3) and 2 (level 2) in the waiting room, card 5 in the hand. */
  const field = () =>
    scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [back] }, '0:1': character(3), '0:2': character(2) }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), { player: 0, zone: 'waitingRoom' });
      put(ctx, card(0, 2), { player: 0, zone: 'waitingRoom' });
      put(ctx, card(0, 5), { player: 0, zone: 'hand' });
    }).state;

  it('a level 3 character taken back: a card of the hand may be put into the stock, the card just taken back too', () => {
    const { state } = activate(field(), card(0, 0));
    const taken = go(state, pick(state, card(0, 1)));
    expect(zoneOf(taken.state, card(0, 1))).toBe('hand');
    expect(pending(taken.state, 'CONFIRM').player).toBe(0);
    const choosing = go(taken.state, YES).state;
    expect([...offered(choosing)].sort()).toEqual([oid(choosing, card(0, 1)), oid(choosing, card(0, 5))].sort());
    expect(pending(choosing, 'SELECT_CARDS').min).toBe(1);
    const stocked = go(choosing, pick(choosing, card(0, 1))).state;
    expect(zoneOf(stocked, card(0, 1))).toBe('stock');
    expect(zoneOf(stocked, card(0, 5))).toBe('hand');
    // Declined: the hand keeps both cards.
    expect(go(taken.state, NO).state.zones[0].hand).toHaveLength(2);
  });

  it('a level 2 character taken back, or none: nothing more is asked', () => {
    const { state } = activate(field(), card(0, 0));
    const lower = go(state, pick(state, card(0, 2)));
    expect(zoneOf(lower.state, card(0, 2))).toBe('hand');
    expect(lower.state.pending?.kind).toBe('MAIN');
    const none = go(state, pick(state));
    expect(none.state.zones[0].hand).toHaveLength(1);
    expect(none.state.pending?.kind).toBe('MAIN');
  });
});

describe('…を1枚選び、手札に戻し、あなたの、思い出とマーカー置場のカードの合計がN枚以下なら、あなたは…を1枚まで選び、思い出にする', () => {
  const NAME = 'Keeper';
  const back: Ability = act([
    { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { kind: 'CHARACTER', levelMin: 1 }, min: 1, max: 1 },
    { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
    { do: 'IF', condition: { if: 'COUNT', where: 'YOUR_MEMORY_AND_MARKERS', max: 2 }, then: [{ do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { name: NAME }, min: 0, max: 1 }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'MEMORY' }], joined: true },
  ]);
  /** Card 1 (level 1) and card 2 (the named card, level 0) in the waiting room; `memory` cards in memory, `markers` under the source. */
  const field = (memory: number, markers: number, withLevelOne = true) =>
    scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [back] }, '0:1': character(1), '0:2': { name: NAME } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      if (withLevelOne) put(ctx, card(0, 1), { player: 0, zone: 'waitingRoom' });
      put(ctx, card(0, 2), { player: 0, zone: 'waitingRoom' });
      for (let k = 0; k < memory; k++) put(ctx, card(0, 10 + k), { player: 0, zone: 'memory' });
      for (let k = 0; k < markers; k++) put(ctx, card(0, 20 + k), { player: 0, zone: 'marker', slot: 'FC' });
    }).state;

  it.each([
    [2, 0],
    [1, 1],
    [0, 2],
    [0, 0],
  ])('memory %i and markers %i (2 or fewer together): after the card is taken back, the named card may be put into memory', (memory, markers) => {
    const { state } = activate(field(memory, markers), card(0, 0));
    const taken = go(state, pick(state, card(0, 1)));
    expect(zoneOf(taken.state, card(0, 1))).toBe('hand');
    expect(offered(taken.state)).toEqual([oid(taken.state, card(0, 2))]);
    expect(pending(taken.state, 'SELECT_CARDS').min).toBe(0);
    expect(zoneOf(go(taken.state, pick(taken.state, card(0, 2))).state, card(0, 2))).toBe('memory');
    expect(zoneOf(go(taken.state, pick(taken.state)).state, card(0, 2))).toBe('waitingRoom');
  });

  it.each([
    [3, 0],
    [2, 1],
    [0, 3],
  ])('memory %i and markers %i (3 together): the card is taken back, nothing is put into memory', (memory, markers) => {
    const { state } = activate(field(memory, markers), card(0, 0));
    const taken = go(state, pick(state, card(0, 1)));
    expect(zoneOf(taken.state, card(0, 1))).toBe('hand');
    expect(taken.state.pending?.kind).toBe('MAIN');
    expect(zoneOf(taken.state, card(0, 2))).toBe('waitingRoom');
  });

  it('no card to take back: the second action is done all the same (CR-1.3.2)', () => {
    const { state } = activate(field(0, 0, false), card(0, 0));
    expect(offered(state)).toEqual([oid(state, card(0, 2))]);
    expect(state.zones[0].hand).toHaveLength(0);
  });
});

describe('山札を上からN枚まで見て、「…」を1枚まで選び、舞台の好きな枠に置き、残りのカードを控え室に置く', () => {
  const NAME = 'Wanted';
  const look: Ability = act([{ do: 'LOOK_TOP', upTo: 4, pick: { name: NAME }, toStage: true }]);
  /** The top four cards of the deck are 41, 40, 39, 38; `named` of them has the name. Card 1 is in the left front slot. */
  const field = (named: number | null) =>
    scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [look] }, ...(named !== null ? { [`0:${named}`]: { name: NAME } } : {}) }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'BL'));
      put(ctx, card(0, 1), stageSlot(0, 'FL'));
      climaxesAway(ctx, 0);
    }).state;
  const lookAt = (state: GameState, count: number) => {
    let next = activate(state, card(0, 0)).state;
    for (let k = 0; k < count; k++) next = go(next, YES).state;
    return count < 4 ? go(next, NO).state : next;
  };

  it('the named card among the four: put standing into the slot the player chooses, the other three to the waiting room', () => {
    const chosen = lookAt(field(39), 4);
    expect(offered(chosen)).toEqual([oid(chosen, card(0, 39))]);
    expect(pending(chosen, 'SELECT_CARDS').min).toBe(0);
    const slotting = go(chosen, pick(chosen, card(0, 39))).state;
    expect(pending(slotting, 'SELECT_SLOT').slots).toEqual(['FL', 'FC', 'FR', 'BL', 'BR']);
    const { state, events } = go(slotting, { kind: 'SELECT_SLOT', slot: 'FR' });
    expect(at(state, 0, 'FR')).toBe(card(0, 39));
    expect(getInstance(state, card(0, 39)).orientation).toBe('STAND');
    for (const i of [41, 40, 38]) expect(zoneOf(state, card(0, i))).toBe('waitingRoom');
    // The card goes to the stage before the others go to the waiting room.
    const order = events.flatMap((e) => (e.type === 'CARD_MOVED' ? [e.to.zone] : []));
    expect(order.indexOf('stage')).toBeLessThan(order.indexOf('waitingRoom'));
    expect(topOf(state, 0)).toBe(card(0, 37));
  });

  it('a slot with a character: that character goes to the waiting room (CR-4.4.2)', () => {
    const chosen = lookAt(field(41), 4);
    const { state } = go(chosen, pick(chosen, card(0, 41)), { kind: 'SELECT_SLOT', slot: 'FL' });
    expect(at(state, 0, 'FL')).toBe(card(0, 41));
    expect(zoneOf(state, card(0, 1))).toBe('waitingRoom');
  });

  it('not taken (1枚まで), or not among the cards: all the cards looked at go to the waiting room, no slot is asked', () => {
    const chosen = lookAt(field(39), 4);
    const none = go(chosen, pick(chosen)).state;
    expect(none.pending?.kind).toBe('MAIN');
    for (const i of [41, 40, 39, 38]) expect(zoneOf(none, card(0, i))).toBe('waitingRoom');
    const absent = lookAt(field(null), 4);
    expect(absent.pending?.kind).toBe('MAIN');
    for (const i of [41, 40, 39, 38]) expect(zoneOf(absent, card(0, i))).toBe('waitingRoom');
  });

  it('4枚まで: the player may stop earlier; only the cards looked at are concerned', () => {
    const two = lookAt(field(39), 2);
    expect(two.pending?.kind).toBe('MAIN');
    expect(zoneOf(two, card(0, 41))).toBe('waitingRoom');
    expect(zoneOf(two, card(0, 40))).toBe('waitingRoom');
    expect(topOf(two, 0)).toBe(card(0, 39));
  });

  it('the cards looked at are shown to their player only', () => {
    const chosen = lookAt(field(39), 4);
    expect(Object.keys(pending(chosen, 'SELECT_CARDS').look ?? {})).toHaveLength(4);
    const theirs = getPlayerView(chosen, 1);
    // The opponent learns that a choice of cards is being made, not which cards.
    expect(theirs.decision).toEqual({ mine: false, id: chosen.pending!.id, player: 0, kind: 'SELECT_CARDS' });
    expect(theirs.sides[0].deck.every((c) => !('cardId' in c))).toBe(true);
  });
});
