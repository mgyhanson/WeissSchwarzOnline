/**
 * Building blocks of batch 13: trigger icons given to cards of a kind in every zone, a waiting-room card put under
 * the clock as a cost, X from an icon of the card shown and "Ｘ枚まで選んで", X from your waiting room, looking at the
 * opponent's deck without changing it, cards of the opponent's deck chosen for the waiting room, what a look or a
 * brainstorm put into the waiting room (…がある／ないなら), the card a deck-top move just put there (to the hand or
 * a back slot), the back row counted, and two effects in the order the player chooses. Synthetic cards; the wording each case stands for is in its name.
 */

import { describe, expect, it } from 'vitest';
import { type Ability, type CardDef, type Choice, type Ctx, type Effect, type GameEvent, type GameState, canPayCost, evalCondition, getInstance, stageSlot, triggerIconsOf } from '../src/index';
import { activate, cards } from './ability-helpers';
import { answer, card, oid, pending, put, scenario } from './helpers';

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
const option = (o: string): Choice => ({ kind: 'SELECT_OPTION', option: o });
const character = (level: number, more: Partial<CardDef> = {}): Partial<CardDef> => ({ kind: 'CHARACTER', level, cost: 0, power: 1000, soul: 1, ...more });
const climax = (more: Partial<CardDef> = {}): Partial<CardDef> => ({ kind: 'CLIMAX', level: null, cost: null, power: null, soul: null, ...more });
const WIND = 'Wind';
/** Cards of a player put on the top of their deck, in this order (the last one on top). */
const onTop = (ctx: Ctx, player: 0 | 1, ...instanceIds: number[]) => {
  for (const id of instanceIds) {
    put(ctx, id, { player, zone: 'memory' });
    put(ctx, id, { player, zone: 'deck' });
  }
};
const topCards = (state: GameState, player: 0 | 1, n: number): number[] => state.zones[player].deck.slice(-n).reverse();
const act = (effect: Effect[], cost: NonNullable<Extract<Ability, { type: 'ACT' }>['cost']> = []): Ability => ({ type: 'ACT', timing: 'MAIN', cost, effect });
/** Player 0's card 0 in the centre with these abilities; `arrange` places the rest. */
const main = (abilities: Ability[], defs: Record<string, Partial<CardDef>> = {}, arrange: (ctx: Ctx) => void = () => {}) =>
  scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities }, ...defs }) }, (ctx) => {
    put(ctx, card(0, 0), stageSlot(0, 'FC'));
    arrange(ctx);
  }).state;

// ---------------------------------------------------------------------------------------------------------

describe('【永】 他のあなたの「X」がいないなら、あなたのすべての領域のトリガーアイコンが[[treasure]]のCXのトリガーアイコンに[[bounce]]を与える', () => {
  const give: Ability = {
    type: 'CONT',
    condition: { if: 'NOT', of: { if: 'CHARACTERS', min: 1, other: true, filter: { name: 'X' } } },
    givesTriggerIcons: { filter: { kind: 'CLIMAX', hasTrigger: 'TREASURE' }, icons: ['RETURN'] },
    apply: [],
  };
  const defs = { '0:0': { name: 'X', abilities: [give] }, '0:1': { name: 'X' }, '0:45': climax({ triggers: ['TREASURE'] }), '0:46': climax({ triggers: ['SOUL'] }), '1:45': climax({ triggers: ['TREASURE'] }) };
  const field = (twin = false, onStage = true) =>
    scenario({ step: 'MAIN_START', defs: cards(defs) }, (ctx) => {
      if (onStage) put(ctx, card(0, 0), stageSlot(0, 'FC'));
      if (twin) put(ctx, card(0, 1), stageSlot(0, 'FL'));
      put(ctx, card(0, 45), { player: 0, zone: 'hand' });
    }).state;

  it('your treasure climaxes gain the bounce icon in every zone (hand, deck, the resolution zone of a trigger check)', () => {
    const state = field();
    expect(triggerIconsOf(state, card(0, 45))).toEqual(['TREASURE', 'RETURN']);
    // Still in the deck; and in the resolution zone, as a trigger check puts it there.
    const deck = scenario({ step: 'MAIN_START', defs: cards(defs) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 45), { player: 0, zone: 'resolution' });
    }).state;
    expect(triggerIconsOf(deck, card(0, 45))).toEqual(['TREASURE', 'RETURN']);
    expect(triggerIconsOf(state, card(0, 46))).toEqual(['SOUL']);
  });

  it('not the opponent\'s climaxes; not while another "X" is on your stage; not while the card is off the stage', () => {
    expect(triggerIconsOf(field(), card(1, 45))).toEqual(['TREASURE']);
    expect(triggerIconsOf(field(true), card(0, 45))).toEqual(['TREASURE']);
    expect(triggerIconsOf(field(false, false), card(0, 45))).toEqual(['TREASURE']);
  });

  it('by name, and an ability whose condition asks about trigger icons gives no loop', () => {
    const byName: Ability = { type: 'CONT', givesTriggerIcons: { filter: { name: 'Red' }, icons: ['COMEBACK'] }, condition: { if: 'COUNT', where: 'YOUR_CLIMAX', filter: { kind: 'CLIMAX', hasTrigger: 'COMEBACK' }, min: 1 }, apply: [] };
    const state = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [byName] }, '0:45': climax({ name: 'Red', triggers: ['SHOT'] }), '0:46': climax({ name: 'Red', triggers: ['COMEBACK'] }) }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
    }).state;
    // No salvage climax in the climax zone yet: nothing given.
    expect(triggerIconsOf(state, card(0, 45))).toEqual(['SHOT']);
    const placed = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [byName] }, '0:45': climax({ name: 'Red', triggers: ['SHOT'] }), '0:46': climax({ name: 'Red', triggers: ['COMEBACK'] }) }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 46), { player: 0, zone: 'climax' });
    }).state;
    expect(triggerIconsOf(placed, card(0, 45))).toEqual(['SHOT', 'COMEBACK']);
  });
});

describe('［あなたの控え室の《…》のキャラを1枚クロック置場の下に置く］', () => {
  const cost = [{ pay: 'WAITING_ROOM_TO_CLOCK_BOTTOM' as const, count: 1, filter: { kind: 'CHARACTER' as const, traits: [WIND] } }];
  const ability = act([{ do: 'DRAW', count: 1 }], cost);
  const field = (clock: number, wind = true) =>
    main([ability], { '0:7': character(1, { traits: wind ? [WIND] : [] }), '0:8': character(1) }, (ctx) => {
      put(ctx, card(0, 7), { player: 0, zone: 'waitingRoom' });
      put(ctx, card(0, 8), { player: 0, zone: 'waitingRoom' });
      for (let k = 0; k < clock; k++) put(ctx, card(0, 20 + k), { player: 0, zone: 'clock' });
    });

  it('only a matching waiting-room card can pay; it goes under the clock cards', () => {
    expect(canPayCost(field(2, false), { master: 0, source: card(0, 0), sourceObjectId: 0, chosen: [], battleOpponent: null, sourceSlot: null }, cost)).toBe(false);
    const asked = activate(field(2), card(0, 0)).state;
    expect(pending(asked, 'SELECT_CARDS')).toMatchObject({ prompt: 'COST_WAITING_ROOM_TO_CLOCK', min: 1, max: 1 });
    expect(offered(asked)).toEqual(objects(asked, card(0, 7)));
    const { state } = go(asked, pick(asked, card(0, 7)));
    expect(state.zones[0].clock[0]).toBe(card(0, 7));
    expect(state.zones[0].clock).toHaveLength(3);
  });

  it('a seventh clock card: the level up waits for the cost and then offers the bottom seven, the new card among them (CR-9.3.2, 9.3.3)', () => {
    const asked = activate(field(6), card(0, 0)).state;
    const { state } = go(asked, pick(asked, card(0, 7)));
    const levelUp = pending(state, 'LEVEL_UP');
    expect(levelUp.cards).toContain(oid(state, card(0, 7)));
    expect(levelUp.cards).toHaveLength(7);
  });
});

describe('自分の山札の上から1枚を公開し、自分の山札を上から4枚まで見て、《…》のキャラをＸ枚まで選んで相手に見せ、手札に加え、残りのカードを控え室に置く。Ｘは公開されたカードのトリガーアイコンに[[soul]]があるなら2、ないなら1に等しい', () => {
  const look = act([
    { do: 'SHOW_TOP', iconX: { icon: 'SOUL', yes: 2, no: 1 } },
    { do: 'LOOK_TOP', upTo: 4, pick: { kind: 'CHARACTER', traits: [WIND] }, reveal: true, picksX: true },
  ]);
  /** Top of the deck: 9 (soul icon or not), then 8, 7 (both Wind). */
  const field = (soul: boolean) =>
    main([look], { '0:9': character(0, { traits: [WIND], triggers: soul ? ['SOUL'] : [] }), '0:8': character(0, { traits: [WIND] }), '0:7': character(0, { traits: [WIND] }) }, (ctx) => onTop(ctx, 0, card(0, 7), card(0, 8), card(0, 9)));
  const lookThree = (state: GameState) => go(state, YES, YES, YES, NO).state;

  it('a soul icon on the card shown: up to 2 are taken; the card shown stays on top and is looked at too', () => {
    const asked = activate(field(true), card(0, 0)).state;
    expect(topCards(asked, 0, 1)).toEqual([card(0, 9)]);
    expect(getInstance(asked, card(0, 9)).revealed).toBe(false);
    const choosing = lookThree(asked);
    expect(pending(choosing, 'SELECT_CARDS')).toMatchObject({ min: 0, max: 2 });
    expect(offered(choosing)).toEqual(objects(choosing, card(0, 7), card(0, 8), card(0, 9)));
  });

  it('no soul icon: up to 1', () => {
    const choosing = lookThree(activate(field(false), card(0, 0)).state);
    expect(pending(choosing, 'SELECT_CARDS')).toMatchObject({ min: 0, max: 1 });
  });
});

describe('自分の控え室のレベルＸ以下の《…》のキャラを1枚選び、手札に戻す。Ｘはあなたの控え室の「…」の枚数に等しい', () => {
  const back = act([
    { do: 'SET_X', count: { of: 'YOUR_WAITING_ROOM', filter: { name: 'Grave' } } },
    { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { kind: 'CHARACTER', traits: [WIND] }, levelMaxX: true, min: 1, max: 1 },
    { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
  ]);
  it('two "Grave" in your waiting room (one in the opponent\'s does not count): level 2 or lower', () => {
    const state = main([back], { '0:5': character(2, { name: 'Grave' }), '0:6': character(2, { name: 'Grave' }), '1:5': character(2, { name: 'Grave' }), '0:7': character(2, { traits: [WIND] }), '0:8': character(3, { traits: [WIND] }) }, (ctx) => {
      for (const id of [card(0, 5), card(0, 6), card(0, 7), card(0, 8)]) put(ctx, id, { player: 0, zone: 'waitingRoom' });
      put(ctx, card(1, 5), { player: 1, zone: 'waitingRoom' });
    });
    const asked = activate(state, card(0, 0)).state;
    expect(offered(asked)).toEqual(objects(asked, card(0, 7)));
  });
});

describe('相手の山札を上から2枚まで見て、山札の上に元の順番で置く / 相手の山札を上から4枚まで見て、カードを4枚まで選び、控え室に置き、残りのカードを山札に戻し、相手はその山札をシャッフルする', () => {
  it('looked at one at a time (the player may stop); the order stays', () => {
    const peek = act([{ do: 'REORDER_TOP', upTo: 2, whose: 'OPPONENT', sameOrder: true }]);
    const start = main([peek]);
    const before = topCards(start, 1, 3);
    const first = activate(start, card(0, 0)).state;
    expect(pending(first, 'CONFIRM')).toMatchObject({ player: 0, prompt: 'LOOK_NEXT', lookDeck: 1 });
    const second = go(first, YES).state;
    // The card shown is in the opponent's deck, and the decision says so (CR-8.6.6).
    expect(Object.keys(pending(second, 'CONFIRM').look!).map(Number)).toEqual([oid(second, topCards(start, 1, 1)[0]!)]);
    expect(pending(second, 'CONFIRM').lookDeck).toBe(1);
    const { state } = go(second, YES);
    expect(state.pending?.kind).toBe('MAIN');
    expect(topCards(state, 1, 3)).toEqual(before);
    // Stopped at once: nothing changes either.
    expect(topCards(go(first, NO).state, 1, 3)).toEqual(before);
  });

  it('the cards chosen go to the opponent\'s waiting room, the others stay in the deck, which the opponent shuffles', () => {
    const mill = act([{ do: 'REORDER_TOP', upTo: 4, whose: 'OPPONENT', toWaitingRoom: 4 }, { do: 'SHUFFLE', whose: 'OPPONENT' }]);
    const start = main([mill]);
    const [a, b, c] = topCards(start, 1, 3);
    const choosing = go(activate(start, card(0, 0)).state, YES, YES, YES, NO).state;
    expect(pending(choosing, 'SELECT_CARDS')).toMatchObject({ prompt: 'EFFECT_DECK_TO_WAITING_ROOM', min: 0, max: 3 });
    const { state, events } = go(choosing, pick(choosing, a!, c!));
    expect(zoneOf(state, a!)).toBe('waitingRoom');
    expect(zoneOf(state, c!)).toBe('waitingRoom');
    expect(zoneOf(state, b!)).toBe('deck');
    expect(state.zones[1].deck).toHaveLength(48);
    expect(events.some((e) => e.type === 'DECK_SHUFFLED')).toBe(true);
  });
});

describe('この効果で控え室に置かれたカードにCXがあるなら／ないなら (after a look and after a brainstorm)', () => {
  it('after a look: only when a climax was among the cards put into the waiting room', () => {
    const look = act([
      { do: 'LOOK_TOP', upTo: 2, pick: { kind: 'CHARACTER' }, reveal: true },
      { do: 'IF', condition: { if: 'LAST_MOVED', min: 1, filter: { kind: 'CLIMAX' }, said: 'THIS_EFFECT' }, then: [{ do: 'DRAW', count: 1 }] },
    ]);
    const field = (secondIsClimax: boolean) => main([look], { '0:9': character(0), '0:8': secondIsClimax ? climax() : character(0) }, (ctx) => onTop(ctx, 0, card(0, 8), card(0, 9)));
    const run = (secondIsClimax: boolean, take: number) => {
      const choosing = go(activate(field(secondIsClimax), card(0, 0)).state, YES, YES).state;
      return go(choosing, pick(choosing, card(0, take))).state;
    };
    const hand = (state: GameState) => state.zones[0].hand.length;
    const base = hand(field(false));
    // A climax went to the waiting room with the rest: one more card drawn.
    expect(hand(run(true, 9))).toBe(base + 2);
    // No climax: only the card taken.
    expect(hand(run(false, 9))).toBe(base + 1);
  });

  it('after a brainstorm with nothing per card: それらのカードにCXがあるなら; and …がないなら after one with a count per climax', () => {
    const when = act([{ do: 'BRAINSTORM', count: 2, each: [] }, { do: 'IF', condition: { if: 'LAST_MOVED', min: 1, filter: { kind: 'CLIMAX' } }, then: [{ do: 'DRAW', count: 1 }] }]);
    const unless = act([
      { do: 'BRAINSTORM', count: 2, per: { kind: 'CLIMAX' }, each: [] },
      { do: 'IF', condition: { if: 'LAST_MOVED', min: 0, max: 0, filter: { kind: 'CLIMAX' }, said: 'THIS_EFFECT' }, then: [{ do: 'DRAW', count: 1 }] },
    ]);
    const field = (ability: Ability, withClimax: boolean) => main([ability], { '0:9': character(0), '0:8': withClimax ? climax() : character(0) }, (ctx) => onTop(ctx, 0, card(0, 8), card(0, 9)));
    const drawn = (ability: Ability, withClimax: boolean) => {
      const start = field(ability, withClimax);
      const state = activate(start, card(0, 0)).state;
      expect(zoneOf(state, card(0, 8))).toBe('waitingRoom');
      expect(zoneOf(state, card(0, 9))).toBe('waitingRoom');
      return state.zones[0].hand.length - start.zones[0].hand.length;
    };
    expect(drawn(when, true)).toBe(1);
    expect(drawn(when, false)).toBe(0);
    expect(drawn(unless, true)).toBe(0);
    expect(drawn(unless, false)).toBe(1);
  });
});

describe('自分の山札の上から1枚を、控え室に置いてよい。そのカードが…なら、そのカードを手札に戻す／そのキャラを後列の好きな枠に置く', () => {
  const mill = (then: Effect[]): Ability =>
    act([{ do: 'DECK_TOP', count: 1, to: 'WAITING_ROOM', upTo: true, may: true }, { do: 'IF', condition: { if: 'LAST_MOVED', min: 1, filter: { kind: 'CHARACTER', levelMax: 0 }, said: 'THAT_CARD' }, then }]);
  const toHand = mill([{ do: 'MOVE', target: { who: 'MILLED' }, to: 'HAND' }]);
  const toBack = mill([{ do: 'CHOOSE_SLOT', which: 'BACK', of: { who: 'MILLED', said: 'CHARACTER' } }, { do: 'MOVE', target: { who: 'MILLED', said: 'CHARACTER' }, to: 'CHOSEN_SLOT' }]);
  const field = (ability: Ability, level: number) => main([ability], { '0:9': character(level), '0:3': character(0) }, (ctx) => {
    onTop(ctx, 0, card(0, 9));
    put(ctx, card(0, 3), stageSlot(0, 'BL'));
  });

  it('the card put there goes back to the hand when it matches; otherwise it stays; declined, nothing moves', () => {
    expect(zoneOf(go(activate(field(toHand, 0), card(0, 0)).state, YES).state, card(0, 9))).toBe('hand');
    expect(zoneOf(go(activate(field(toHand, 1), card(0, 0)).state, YES).state, card(0, 9))).toBe('waitingRoom');
    expect(zoneOf(go(activate(field(toHand, 0), card(0, 0)).state, NO).state, card(0, 9))).toBe('deck');
  });

  it('そのカード is the card in the waiting room only: once it has left, it is not moved again', () => {
    const twice = mill([{ do: 'MOVE', target: { who: 'MILLED' }, to: 'HAND' }, { do: 'MOVE', target: { who: 'MILLED' }, to: 'STOCK' }]);
    expect(zoneOf(go(activate(field(twice, 0), card(0, 0)).state, YES).state, card(0, 9))).toBe('hand');
  });

  it('to either back slot, chosen by the player; a character already there goes to the waiting room', () => {
    const asked = go(activate(field(toBack, 0), card(0, 0)).state, YES).state;
    expect(pending(asked, 'SELECT_SLOT').slots).toEqual(['BL', 'BR']);
    const { state } = go(asked, { kind: 'SELECT_SLOT', slot: 'BL' });
    expect(getInstance(state, card(0, 9)).location).toMatchObject({ zone: 'stage', slot: 'BL' });
    expect(zoneOf(state, card(0, 3))).toBe('waitingRoom');
    // Not a match: nothing is asked.
    expect(go(activate(field(toBack, 1), card(0, 0)).state, YES).state.pending?.kind).toBe('MAIN');
  });
});

describe('他のあなたの後列のキャラがいない', () => {
  it('counts the characters of your back row other than this card', () => {
    const none: Parameters<typeof evalCondition>[3] = { if: 'COUNT', where: 'YOUR_BACK_ROW', other: true, max: 0 };
    const empty = main([], {}, (ctx) => put(ctx, card(1, 1), stageSlot(1, 'BL')));
    expect(evalCondition(empty, 0, card(0, 0), none)).toBe(true);
    const one = main([], {}, (ctx) => put(ctx, card(0, 1), stageSlot(0, 'BR')));
    expect(evalCondition(one, 0, card(0, 0), none)).toBe(false);
    // The card itself in the back row does not count.
    const self = scenario({ step: 'MAIN_START' }, (ctx) => put(ctx, card(0, 0), stageSlot(0, 'BL'))).state;
    expect(evalCondition(self, 0, card(0, 0), none)).toBe(true);
  });
});

describe('次の2つの効果を好きな順番で1回ずつ行う。『…』『…』', () => {
  const both = act([{ do: 'IN_ANY_ORDER', options: [[{ do: 'DRAW', count: 1 }], [{ do: 'CHOOSE', from: 'YOUR_HAND', min: 1, max: 1 }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'WAITING_ROOM' }]] }]);
  it('the player says which is first; both are done', () => {
    const start = main([both], {}, (ctx) => put(ctx, card(0, 5), { player: 0, zone: 'hand' }));
    const asked = activate(start, card(0, 0)).state;
    expect(pending(asked, 'SELECT_OPTION')).toMatchObject({ prompt: 'EFFECT_ORDER_FIRST', options: ['EFFECT_1', 'EFFECT_2'] });
    // The discard first: only card 5 can be discarded, then a card is drawn.
    const discardFirst = go(asked, option('EFFECT_2')).state;
    expect(offered(discardFirst)).toEqual(objects(discardFirst, card(0, 5)));
    const done = go(discardFirst, pick(discardFirst, card(0, 5))).state;
    expect(done.zones[0].hand).toHaveLength(1);
    // The draw first: the card drawn can be discarded too.
    const drawFirst = go(asked, option('EFFECT_1')).state;
    expect(pending(drawFirst, 'SELECT_CARDS').cards).toHaveLength(2);
  });
});

describe('…を1枚選び、手札に戻す。山札を上からN枚まで見て、カードをN枚まで選び、山札の上に好きな順番で置き、残りのカードを控え室に置く (stopped before the first card)', () => {
  it('nothing looked at: nothing is kept or ordered, and the card chosen before is left alone', () => {
    const ability = act([
      { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', min: 1, max: 1 },
      { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
      { do: 'REORDER_TOP', upTo: 3, keep: 3 },
    ]);
    const start = main([ability], {}, (ctx) => put(ctx, card(0, 5), { player: 0, zone: 'waitingRoom' }));
    const looking = go(activate(start, card(0, 0)).state, pick(activate(start, card(0, 0)).state, card(0, 5))).state;
    expect(pending(looking, 'CONFIRM')).toMatchObject({ prompt: 'LOOK_NEXT' });
    const { state } = go(looking, NO);
    expect(state.pending?.kind).toBe('MAIN');
    expect(zoneOf(state, card(0, 5))).toBe('hand');
  });
});
