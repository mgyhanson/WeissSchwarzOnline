/**
 * Building blocks of batch 12: new counts for X (the soul of the character chosen, your level, the opponent's
 * characters, the cards of a kind put into the waiting room), X times N, ＋Ｘ／－Ｘ on a chosen character,
 * looking at X cards, characters of the back row counted, a card shown or looked at that goes to the hand or the
 * stock, a search of a declared zone, a trait gained for the turn, and two costs (hand cards of a kind to the
 * clock; a climax with a trigger icon from the climax zone). Synthetic cards; the wording each case stands for is
 * in its name.
 */

import { describe, expect, it } from 'vitest';
import { type Ability, type CardDef, type Choice, type Ctx, type Effect, type GameEvent, type GameState, addModifier, canPayCost, getCardLevel, getInstance, getPower, stageSlot, traitsOf } from '../src/index';
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
const TANK = 'Tank';
/** A card of player 0 put on the top of the deck, in this order (the last one on top). */
const onTop = (ctx: Ctx, ...instanceIds: number[]) => {
  for (const id of instanceIds) {
    // Out of the deck first (every card starts there), then back onto its top.
    put(ctx, id, { player: 0, zone: 'memory' });
    put(ctx, id, { player: 0, zone: 'deck' });
  }
};
const act = (effect: Effect[], cost: Ability extends never ? never : NonNullable<Extract<Ability, { type: 'ACT' }>['cost']> = []): Ability => ({ type: 'ACT', timing: 'MAIN', cost, effect });
/** Player 0's card 0 in the centre with these abilities; `arrange` places the rest. */
const main = (abilities: Ability[], defs: Record<string, Partial<CardDef>> = {}, arrange: (ctx: Ctx) => void = () => {}) =>
  scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities }, ...defs }) }, (ctx) => {
    put(ctx, card(0, 0), stageSlot(0, 'FC'));
    arrange(ctx);
  }).state;

// ---------------------------------------------------------------------------------------------------------

describe('他の自分の…を1枚選び、そのターン中、パワーを＋Ｘ。Ｘはそのキャラのソウル×1000に等しい', () => {
  const boost = act([
    { do: 'CHOOSE', from: 'YOUR_STAGE', other: true, min: 1, max: 1 },
    { do: 'SET_X', count: { of: 'CHOSEN_SOUL' }, times: 1000 },
    { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'POWER', amount: 1, timesX: true },
  ]);
  const field = (soulBonus = 0) =>
    main([boost], { '0:1': character(0, { soul: 2 }), '0:2': character(0, { soul: 1 }) }, (ctx) => {
      put(ctx, card(0, 1), stageSlot(0, 'FL'));
      put(ctx, card(0, 2), stageSlot(0, 'FR'));
      if (soulBonus) addModifier(ctx.state, getInstance(ctx.state, card(0, 1)).objectId, 'SOUL', soulBonus);
    });

  it('the soul of the character chosen, as it is now (printed 2, and 3 with +1): +2000, +3000; the card itself cannot be chosen', () => {
    const choosing = activate(field(), card(0, 0)).state;
    expect(offered(choosing)).toEqual(objects(choosing, card(0, 1), card(0, 2)));
    const { state } = go(choosing, pick(choosing, card(0, 1)));
    expect(getPower(state, card(0, 1))).toBe(3000);
    expect(getPower(state, card(0, 2))).toBe(1000);
    const more = activate(field(1), card(0, 0)).state;
    expect(getPower(go(more, pick(more, card(0, 1))).state, card(0, 1))).toBe(4000);
    // Soul 1: +1000.
    const one = activate(field(), card(0, 0)).state;
    expect(getPower(go(one, pick(one, card(0, 2))).state, card(0, 2))).toBe(2000);
  });
});

describe('自分のキャラを1枚選び、パワーを＋Ｘ（Ｘはあなたのレベル×1500）／レベルを－Ｘ（Ｘはあなたのレベル）', () => {
  const power = act([
    { do: 'CHOOSE', from: 'YOUR_STAGE', min: 1, max: 1 },
    { do: 'SET_X', count: { of: 'YOUR_LEVEL' }, times: 1500 },
    { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'POWER', amount: 1, timesX: true },
  ]);
  const level = act([
    { do: 'CHOOSE', from: 'YOUR_STAGE', min: 1, max: 1 },
    { do: 'SET_X', count: { of: 'YOUR_LEVEL' } },
    { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'LEVEL', amount: -1, until: 'NEXT_OPPONENT_TURN', timesX: true },
  ]);
  /** `levels` cards in player 0's level zone (and 3 in player 1's, which do not count). */
  const field = (ability: Ability, levels: number) =>
    main([ability], { '0:1': character(3) }, (ctx) => {
      put(ctx, card(0, 1), stageSlot(0, 'FL'));
      for (let k = 0; k < levels; k++) put(ctx, card(0, 20 + k), { player: 0, zone: 'level' });
      for (let k = 0; k < 3; k++) put(ctx, card(1, 20 + k), { player: 1, zone: 'level' });
    });

  it('level 2: +3000; level 0: +0 (the opponent\'s level does not count)', () => {
    const two = activate(field(power, 2), card(0, 0)).state;
    expect(getPower(go(two, pick(two, card(0, 1))).state, card(0, 1))).toBe(4000);
    const zero = activate(field(power, 0), card(0, 0)).state;
    expect(getPower(go(zero, pick(zero, card(0, 1))).state, card(0, 1))).toBe(1000);
  });

  it('level 2: the level 3 character chosen becomes level 1 until the end of the next turn of the opponent', () => {
    const choosing = activate(field(level, 2), card(0, 0)).state;
    const { state } = go(choosing, pick(choosing, card(0, 1)));
    expect(getCardLevel(state, card(0, 1))).toBe(1);
    const mod = state.modifiers.find((m) => m.objectId === oid(state, card(0, 1)) && m.stat === 'LEVEL');
    expect(mod).toMatchObject({ delta: -2, untilTurn: (state.turn!.number) + 1 });
  });
});

describe('相手の前列のキャラを1枚選び、そのターン中、パワーを－Ｘ。Ｘは他のあなたの《…》のキャラの枚数×1000に等しい', () => {
  const weaken = act([
    { do: 'CHOOSE', from: 'OPPONENT_FRONT_ROW', min: 1, max: 1 },
    { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'POWER', amount: -1000, per: { filter: { kind: 'CHARACTER', traits: [TANK] }, other: true } },
  ]);
  it('two other characters with the trait (the card itself has it too and does not count): −2000; one without the trait does not count', () => {
    const start = main([weaken], { '0:0': { abilities: [weaken], traits: [TANK] }, '0:1': character(0, { traits: [TANK] }), '0:2': character(0, { traits: [TANK] }), '0:3': character(0), '1:0': character(0, { power: 5000 }) }, (ctx) => {
      put(ctx, card(0, 1), stageSlot(0, 'FL'));
      put(ctx, card(0, 2), stageSlot(0, 'BL'));
      put(ctx, card(0, 3), stageSlot(0, 'FR'));
      put(ctx, card(1, 0), stageSlot(1, 'FC'));
      put(ctx, card(1, 1), stageSlot(1, 'BL'));
    });
    const choosing = activate(start, card(0, 0)).state;
    // Only the opponent's front row.
    expect(offered(choosing)).toEqual(objects(choosing, card(1, 0)));
    expect(getPower(go(choosing, pick(choosing, card(1, 0))).state, card(1, 0))).toBe(3000);
  });
});

describe('自分の山札の上からN枚までを、控え室に置き、自分の控え室のレベルＸ以下の《…》のキャラを1枚選び、手札に戻す。Ｘはそれらのカードの《…》のキャラの枚数に等しい', () => {
  const salvage = act([
    { do: 'DECK_TOP', count: 3, to: 'WAITING_ROOM', upTo: true },
    { do: 'SET_X', count: { of: 'MOVED', filter: { kind: 'CHARACTER', traits: [TANK] } } },
    { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { kind: 'CHARACTER', traits: [TANK] }, levelMaxX: true, min: 1, max: 1 },
    { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
  ]);
  /** On top of the deck: 11 (Tank, level 1), 12 (Tank, level 3), 13 (no trait) — 13 on top. In the waiting room: 14 (Tank, level 2), 15 (level 0, no trait). */
  const field = () =>
    main([salvage], { '0:11': character(1, { traits: [TANK] }), '0:12': character(3, { traits: [TANK] }), '0:13': character(0), '0:14': character(2, { traits: [TANK] }), '0:15': character(0) }, (ctx) => {
      onTop(ctx, card(0, 11), card(0, 12), card(0, 13));
      put(ctx, card(0, 14), { player: 0, zone: 'waitingRoom' });
      put(ctx, card(0, 15), { player: 0, zone: 'waitingRoom' });
    });

  it('three cards, two of them with the trait: X = 2, characters with the trait of level 2 or lower (the ones just put there too)', () => {
    const asked = activate(field(), card(0, 0)).state;
    expect(pending(asked, 'CONFIRM').prompt).toBe('DECK_TOP_NEXT');
    const choosing = go(asked, YES, YES, YES).state;
    expect(offered(choosing)).toEqual(objects(choosing, card(0, 11), card(0, 14)));
    const { state } = go(choosing, pick(choosing, card(0, 14)));
    expect(zoneOf(state, card(0, 14))).toBe('hand');
  });

  it('the player stops after the first card (no trait): X = 0, nothing of level 0 with the trait, nothing is chosen', () => {
    const asked = activate(field(), card(0, 0)).state;
    const { state } = go(asked, YES, NO);
    expect(zoneOf(state, card(0, 13))).toBe('waitingRoom');
    expect(zoneOf(state, card(0, 12))).toBe('deck');
    expect(state.pending?.kind).toBe('MAIN');
    expect(zoneOf(state, card(0, 14))).toBe('waitingRoom');
  });
});

describe('［手札の《…》のキャラを1枚クロック置場に置く］ … 自分の山札を上からＸ枚まで見て… Ｘは相手のキャラの枚数＋1に等しい', () => {
  const look: Ability = {
    type: 'ACT',
    timing: 'MAIN',
    cost: [{ pay: 'HAND_TO_CLOCK', count: 1, filter: { kind: 'CHARACTER', traits: [TANK] } }],
    effect: [{ do: 'SET_X', count: { of: 'OPPONENT_STAGE' }, plus: 1 }, { do: 'LOOK_TOP', upTo: 1, upToX: true }],
  };
  const field = (opponents: number, handTraits: string[] = [TANK]) =>
    main([look], { '0:5': character(0, { traits: handTraits }), '0:6': character(0) }, (ctx) => {
      put(ctx, card(0, 5), { player: 0, zone: 'hand' });
      put(ctx, card(0, 6), { player: 0, zone: 'hand' });
      for (let k = 0; k < opponents; k++) put(ctx, card(1, k), stageSlot(1, (['FL', 'FC', 'FR'] as const)[k]!));
    });

  it('only a hand card with the trait pays; two characters of the opponent: up to 3 cards are looked at', () => {
    const paying = activate(field(2), card(0, 0)).state;
    expect(pending(paying, 'SELECT_CARDS').prompt).toBe('COST_HAND_TO_CLOCK');
    expect(offered(paying)).toEqual(objects(paying, card(0, 5)));
    let state = go(paying, pick(paying, card(0, 5))).state;
    expect(zoneOf(state, card(0, 5))).toBe('clock');
    let looked = 0;
    while (state.pending?.kind === 'CONFIRM' && state.pending.prompt === 'LOOK_NEXT') {
      state = answer(state, YES).state;
      looked++;
    }
    expect(looked).toBe(3);
    expect(pending(state, 'SELECT_CARDS').cards).toHaveLength(3);
  });

  it('no character of the opponent: X = 1; no hand card with the trait: the ability cannot be played', () => {
    let state = go(activate(field(0), card(0, 0)).state, pick(activate(field(0), card(0, 0)).state, card(0, 5))).state;
    let looked = 0;
    while (state.pending?.kind === 'CONFIRM' && state.pending.prompt === 'LOOK_NEXT') {
      state = answer(state, YES).state;
      looked++;
    }
    expect(looked).toBe(1);
    const none = field(2, []);
    expect(pending(none, 'MAIN').actions.some((a) => a.type === 'ACTIVATE')).toBe(false);
  });
});

describe('【永】 他のあなたの後列の《…》のキャラ1枚につき、このカードのパワーを＋N', () => {
  const perBack: Ability = { type: 'CONT', apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: 2000, per: { filter: { kind: 'CHARACTER', traits: [TANK] }, other: true, slots: ['BL', 'BR'] } }] };
  it('two in the back row count; one with the trait in the front row and the card itself in the back row do not', () => {
    const tank = character(0, { traits: [TANK] });
    const state = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [perBack], traits: [TANK] }, '0:1': tank, '0:2': tank, '0:3': tank, '0:4': character(0) }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'BL'));
      put(ctx, card(0, 1), stageSlot(0, 'BR'));
      put(ctx, card(0, 2), stageSlot(0, 'FC'));
      put(ctx, card(0, 3), stageSlot(0, 'FL'));
    }).state;
    expect(getPower(state, card(0, 0))).toBe(1000 + 2000);
    const two = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [perBack] }, '0:1': tank, '0:2': tank, '0:4': character(0) }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), stageSlot(0, 'BR'));
      put(ctx, card(0, 2), stageSlot(0, 'BL'));
      put(ctx, card(0, 4), stageSlot(0, 'FL'));
    }).state;
    expect(getPower(two, card(0, 0))).toBe(1000 + 4000);
  });
});

describe('自分の山札の上から1枚を公開する。そのカードが《…》のキャラなら手札に加えるかストック置場に置く', () => {
  const reveal = act([{ do: 'REVEAL_TOP', filter: { kind: 'CHARACTER', traits: [TANK] }, handOrStock: true }]);
  const field = (traits: string[]) => main([reveal], { '0:9': character(0, { traits }) }, (ctx) => onTop(ctx, card(0, 9)));

  it('a match: the player chooses the hand or the stock', () => {
    const asked = activate(field([TANK]), card(0, 0)).state;
    expect(pending(asked, 'SELECT_OPTION')).toMatchObject({ player: 0, prompt: 'EFFECT_DESTINATION', options: ['HAND', 'STOCK'] });
    expect(getInstance(asked, card(0, 9)).revealed).toBe(true);
    expect(zoneOf(go(asked, option('STOCK')).state, card(0, 9))).toBe('stock');
    expect(zoneOf(go(asked, option('HAND')).state, card(0, 9))).toBe('hand');
  });

  it('no match: nothing is asked and the card stays on the top, no longer shown', () => {
    const state = activate(field([]), card(0, 0)).state;
    expect(state.pending?.kind).toBe('MAIN');
    const deck = state.zones[0].deck;
    expect(deck[deck.length - 1]).toBe(card(0, 9));
    expect(getInstance(state, card(0, 9)).revealed).toBe(false);
  });
});

describe('山札か控え室を宣言し、宣言した自分の領域を見て…を1枚まで選んで相手に見せ、手札に加える。山札を宣言したなら、その山札をシャッフルする', () => {
  const search = act([{ do: 'SEARCH_DECLARED_ZONE', filter: { kind: 'CHARACTER', traits: [TANK] }, max: 1 }]);
  /** Card 7 (Tank) in the deck, card 8 (Tank) in the waiting room, card 9 (no trait) in the waiting room. */
  const field = (deckTraits: string[] = [TANK]) =>
    main([search], { '0:7': character(0, { traits: deckTraits }), '0:8': character(0, { traits: [TANK] }), '0:9': character(0) }, (ctx) => {
      put(ctx, card(0, 8), { player: 0, zone: 'waitingRoom' });
      put(ctx, card(0, 9), { player: 0, zone: 'waitingRoom' });
    });

  it('the deck declared: a card of the deck is chosen, shown and taken; the deck is shuffled', () => {
    const asked = activate(field(), card(0, 0)).state;
    expect(pending(asked, 'SELECT_OPTION')).toMatchObject({ player: 0, prompt: 'EFFECT_DECLARE_ZONE', options: ['DECLARE_DECK', 'DECLARE_WAITING_ROOM'] });
    const choosing = go(asked, option('DECLARE_DECK')).state;
    expect(pending(choosing, 'SELECT_CARDS')).toMatchObject({ min: 0, max: 1 });
    expect(pending(choosing, 'SELECT_CARDS').cards).toContain(oid(choosing, card(0, 7)));
    expect(pending(choosing, 'SELECT_CARDS').cards).not.toContain(oid(choosing, card(0, 8)));
    const { state, events } = go(choosing, pick(choosing, card(0, 7)));
    expect(zoneOf(state, card(0, 7))).toBe('hand');
    expect(events.some((e) => e.type === 'CARD_REVEALED')).toBe(true);
    expect(events.some((e) => e.type === 'DECK_SHUFFLED')).toBe(true);
  });

  it('the waiting room declared: only its cards; the deck is not shuffled', () => {
    const choosing = go(activate(field(), card(0, 0)).state, option('DECLARE_WAITING_ROOM')).state;
    expect(offered(choosing)).toEqual(objects(choosing, card(0, 8)));
    const { state, events } = go(choosing, pick(choosing, card(0, 8)));
    expect(zoneOf(state, card(0, 8))).toBe('hand');
    expect(events.some((e) => e.type === 'DECK_SHUFFLED')).toBe(false);
  });

  it('the deck declared with nothing to take: nothing is taken, but the deck is still shuffled', () => {
    const asked = activate(field([]), card(0, 0)).state;
    // Card 7 has no trait now, and the other deck cards have none either: there is nothing to choose.
    const { state, events } = go(asked, option('DECLARE_DECK'));
    expect(state.pending?.kind).toBe('MAIN');
    expect(events.some((e) => e.type === 'DECK_SHUFFLED')).toBe(true);
  });
});

describe('自分の山札を上からN枚まで見て、《…》のキャラを1枚まで選んで相手に見せ、手札に加えるかストック置場に置き、残りのカードを控え室に置く', () => {
  const look = act([{ do: 'LOOK_TOP', upTo: 2, pick: { kind: 'CHARACTER', traits: [TANK] }, reveal: true, handOrStock: true }]);
  const field = () => main([look], { '0:9': character(0, { traits: [TANK] }), '0:10': character(0) }, (ctx) => onTop(ctx, card(0, 10), card(0, 9)));
  const lookedAt = (state: GameState) => go(go(activate(state, card(0, 0)).state, YES, YES).state, pick(go(activate(state, card(0, 0)).state, YES, YES).state, card(0, 9))).state;

  it('the card taken is shown, then the player chooses the stock: to the stock, the other to the waiting room', () => {
    const asked = lookedAt(field());
    expect(pending(asked, 'SELECT_OPTION')).toMatchObject({ prompt: 'EFFECT_DESTINATION', options: ['HAND', 'STOCK'] });
    expect(getInstance(asked, card(0, 9)).revealed).toBe(true);
    const state = go(asked, option('STOCK')).state;
    expect(zoneOf(state, card(0, 9))).toBe('stock');
    expect(zoneOf(state, card(0, 10))).toBe('waitingRoom');
    expect(zoneOf(go(asked, option('HAND')).state, card(0, 9))).toBe('hand');
  });

  it('no card taken: nothing is asked, both to the waiting room', () => {
    const choosing = go(activate(field(), card(0, 0)).state, YES, YES).state;
    const state = go(choosing, { kind: 'SELECT_CARDS', cards: [] }).state;
    expect(state.pending?.kind).toBe('MAIN');
    expect(zoneOf(state, card(0, 9))).toBe('waitingRoom');
  });
});

describe('そのターン中、このカードのパワーを＋Ｘし、このカードは《…》を得る（Ｘは相手のキャラの枚数×1000）; ［あなたのCX置場のトリガーアイコンが…のCXを1枚控え室に置く］', () => {
  it('two characters of the opponent: +2000 and the trait, for the turn', () => {
    const gain = act([
      { do: 'MODIFY', target: { who: 'SELF' }, stat: 'POWER', amount: 1000, perCount: { where: 'OPPONENT_STAGE' } },
      { do: 'GRANT', target: { who: 'SELF' }, ability: { type: 'CONT', apply: [], giveTraits: { traits: ['Dino'], to: 'SELF' } } },
    ]);
    const start = main([gain], {}, (ctx) => {
      put(ctx, card(1, 0), stageSlot(1, 'FC'));
      put(ctx, card(1, 1), stageSlot(1, 'BL'));
    });
    const state = activate(start, card(0, 0)).state;
    expect(getPower(state, card(0, 0))).toBe(3000);
    expect(traitsOf(state, card(0, 0))).toContain('Dino');
  });

  it('the climax cost can be paid only with a climax with that icon in the climax zone', () => {
    const cost = [{ pay: 'CLIMAX_TO_WAITING_ROOM' as const, count: 1, filter: { kind: 'CLIMAX' as const, hasTrigger: 'CHOICE' as const } }];
    const withIcon = (triggers: CardDef['triggers']) =>
      main([act([{ do: 'DRAW', count: 1 }], cost)], { '0:42': { triggers } }, (ctx) => put(ctx, card(0, 42), { player: 0, zone: 'climax' }));
    const yes = withIcon(['CHOICE']);
    expect(canPayCost(yes, { master: 0, source: card(0, 0), sourceObjectId: oid(yes, card(0, 0)), chosen: [] } as never, cost)).toBe(true);
    const paid = activate(yes, card(0, 0)).state;
    expect(zoneOf(paid, card(0, 42))).toBe('waitingRoom');
    const no = withIcon(['SOUL']);
    expect(pending(no, 'MAIN').actions.some((a) => a.type === 'ACTIVATE')).toBe(false);
  });
});
