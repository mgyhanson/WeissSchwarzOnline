/**
 * Building blocks of batch 11: a character of the stage and a character of memory change places (this card on
 * the stage, or this card in memory), and change back at the start of the encore step (それらのキャラを入れ替える);
 * looking at the top of a deck with up to N cards put to its bottom. Synthetic cards; the wording each case stands
 * for is in its name.
 */

import { describe, expect, it } from 'vitest';
import { type Ability, type CardDef, type Choice, type Effect, type GameEvent, type GameState, createCtx, getInstance, getPlayerView, moveCard, stageSlot } from '../src/index';
import { cards } from './ability-helpers';
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
const NAME = 'Partner';

// ---------------------------------------------------------------------------------------------------------

describe('自分の思い出置場の「…」を1枚とこのカードを選び、入れ替え、アンコールステップの始めに、それらのキャラを入れ替える', () => {
  const swap: Effect[] = [
    { do: 'SWAP_STAGE_MEMORY', stage: 'SELF', memory: { filter: { name: NAME } } },
    { do: 'DELAYED', at: { step: 'ENCORE', whose: 'ANY' }, effects: [{ do: 'SWAP_STAGE_MEMORY', stage: 'MOVED', memory: 'MOVED' }] },
  ];
  const atAttack: Ability = { type: 'AUTO', trigger: { on: 'PHASE_START', phase: 'ATTACK', turn: 'YOURS' }, cost: [{ pay: 'REST_SELF' }], effect: swap };
  /** The card (0) in the centre; two partners (1 and 2, power 5000) in memory, face up; the opponent has card 0 in the centre. */
  const field = (more: (ctx: Parameters<Parameters<typeof scenario>[1] & object>[0]) => void = () => {}, defs: Record<string, Partial<CardDef>> = {}) =>
    scenario({ step: 'ATTACK_START', defs: cards({ '0:0': { abilities: [atAttack] }, '0:1': { name: NAME, power: 5000 }, '0:2': { name: NAME, power: 5000 }, '1:0': { power: 500 }, ...defs }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), { player: 0, zone: 'memory' });
      put(ctx, card(0, 2), { player: 0, zone: 'memory' });
      put(ctx, card(1, 0), stageSlot(1, 'FC'));
      more(ctx);
    }).state;
  const paid = (state: GameState) => go(state, YES).state;

  it('the card is rested as the cost; the partner chosen in memory takes its slot, standing; the card goes to memory', () => {
    const start = field();
    expect(pending(start, 'CONFIRM').prompt).toBe('PAY_COST');
    const choosing = paid(start);
    expect(offered(choosing)).toEqual(objects(choosing, card(0, 1), card(0, 2)));
    expect(pending(choosing, 'SELECT_CARDS')).toMatchObject({ player: 0, min: 1, max: 1 });
    const { state, events } = go(choosing, pick(choosing, card(0, 2)));
    expect(state.zones[0].stage.FC).toEqual([card(0, 2)]);
    expect(getInstance(state, card(0, 2)).orientation).toBe('STAND');
    expect(zoneOf(state, card(0, 0))).toBe('memory');
    expect(getInstance(state, card(0, 0)).face).toBe('UP');
    expect(zoneOf(state, card(0, 1))).toBe('memory');
    // Both moved in one step: the partner was placed from memory.
    const moved = events.filter((e) => e.type === 'CARD_MOVED' && (e.instanceId === card(0, 0) || e.instanceId === card(0, 2)));
    expect(moved.map((e) => (e.type === 'CARD_MOVED' ? `${e.from.zone}>${e.to.zone}` : ''))).toEqual(['stage>memory', 'memory>stage']);
    // The partner can attack in this attack phase.
    expect(pending(state, 'ATTACK').attacks.some((a) => a.attacker === oid(state, card(0, 2)))).toBe(true);
  });

  it('at the start of the encore step they change back: the partner to memory, the card to the slot (standing)', () => {
    // Another character (5) in the left slot: only the two cards of the exchange change back.
    const withOther = field((ctx) => put(ctx, card(0, 5), stageSlot(0, 'FL')));
    const swapped = go(paid(withOther), pick(paid(withOther), card(0, 1))).state;
    const attacked = go(swapped, { kind: 'ATTACK', attack: { attacker: oid(swapped, card(0, 1)), type: 'FRONT' } }, { kind: 'COUNTER', card: null });
    // The opponent's card (500) was reversed; the turn goes on to the encore step, where the exchange back happens.
    let state = attacked.state;
    for (let k = 0; k < 20 && state.turn?.player === 0 && zoneOf(state, card(0, 0)) !== 'stage'; k++) {
      const d = state.pending!;
      state = answer(state, d.kind === 'ATTACK' ? { kind: 'ATTACK', attack: null } : d.kind === 'CHOOSE_ABILITY' ? { kind: 'CHOOSE_ABILITY', id: d.abilities[0]!.id } : { kind: 'CONFIRM', accept: false }).state;
    }
    expect(state.zones[0].stage.FC).toEqual([card(0, 0)]);
    expect(getInstance(state, card(0, 0)).orientation).toBe('STAND');
    expect(zoneOf(state, card(0, 1))).toBe('memory');
    expect(zoneOf(state, card(0, 2))).toBe('memory');
    expect(state.zones[0].stage.FL).toEqual([card(0, 5)]);
  });

  it('the partner has left the stage before the encore step: nothing changes back (the card stays in memory)', () => {
    const swapped = go(paid(field()), pick(paid(field()), card(0, 1))).state;
    // The partner leaves the stage (to the waiting room, as by an effect of the opponent) before the encore step.
    moveCard(createCtx(swapped), card(0, 1), { player: 0, zone: 'waitingRoom' }, { reason: 'EFFECT' });
    let state = answer(swapped, { kind: 'ATTACK', attack: null }).state;
    for (let k = 0; k < 20 && state.turn?.player === 0; k++) {
      const d = state.pending!;
      state = answer(state, d.kind === 'CHOOSE_ABILITY' ? { kind: 'CHOOSE_ABILITY', id: d.abilities[0]!.id } : d.kind === 'HAND_LIMIT' ? { kind: 'HAND_LIMIT', discard: d.cards.slice(0, d.count) } : { kind: 'CONFIRM', accept: false }).state;
    }
    expect(zoneOf(state, card(0, 0))).toBe('memory');
    expect(zoneOf(state, card(0, 1))).toBe('waitingRoom');
  });

  it('no such card in memory, or only face down: nothing is exchanged and the card stays (rested)', () => {
    const none = paid(field(() => {}, { '0:1': { name: 'Other' }, '0:2': { name: 'Other' } }));
    expect(none.zones[0].stage.FC).toEqual([card(0, 0)]);
    expect(none.pending?.kind).not.toBe('SELECT_CARDS');
    expect(getInstance(none, card(0, 0)).orientation).toBe('REST');
    const facedown = paid(field((ctx) => {
      getInstance(ctx.state, card(0, 1)).face = 'DOWN';
      getInstance(ctx.state, card(0, 2)).face = 'DOWN';
    }));
    expect(facedown.zones[0].stage.FC).toEqual([card(0, 0)]);
    expect(facedown.pending?.kind).not.toBe('SELECT_CARDS');
  });

  it('an event of that name in memory is not a character and cannot be put on the stage', () => {
    const start = paid(field(() => {}, { '0:1': { name: NAME, kind: 'EVENT', level: 0, cost: 0, power: null, soul: null }, '0:2': { name: 'Other' } }));
    expect(start.zones[0].stage.FC).toEqual([card(0, 0)]);
    expect(start.pending?.kind).not.toBe('SELECT_CARDS');
  });
});

describe('思い出置場にこのカードがあり、…なら、…自分のカード名に「…」を含むキャラを1枚とこのカードを選び、入れ替える', () => {
  const swap: Ability = {
    type: 'AUTO',
    zone: 'MEMORY',
    trigger: { on: 'PHASE_START', phase: 'CLIMAX', turn: 'YOURS' },
    optional: true,
    effect: [{ do: 'SWAP_STAGE_MEMORY', stage: { filter: { nameIncludes: 'Ai' } }, memory: 'SELF' }],
  };
  const back: Ability = { type: 'AUTO', trigger: { on: 'PLACED_ON_STAGE', from: 'HAND_OR_MEMORY' }, effect: [{ do: 'DRAW', count: 1 }] };
  /** The card (0) in memory; 1 "Ai one" (left) and 2 "Ai two" (centre, rested) and 3 "Other" (right) on the stage. */
  const field = () =>
    scenario({ step: 'CLIMAX_START', defs: cards({ '0:0': { abilities: [swap, back] }, '0:1': { name: 'Ai one' }, '0:2': { name: 'Ai two' }, '0:3': { name: 'Other' } }) }, (ctx) => {
      put(ctx, card(0, 0), { player: 0, zone: 'memory' });
      put(ctx, card(0, 1), stageSlot(0, 'FL'));
      put(ctx, card(0, 2), stageSlot(0, 'FC'), { orientation: 'REST' });
      put(ctx, card(0, 3), stageSlot(0, 'FR'));
    }).state;

  it('a character whose name contains the word is chosen; the card from memory takes its slot (standing) and its own 思い出置場から舞台に置かれた時 triggers', () => {
    const start = field();
    expect(pending(start, 'CONFIRM').prompt).toBe('USE_ABILITY');
    const choosing = go(start, YES).state;
    expect(offered(choosing)).toEqual(objects(choosing, card(0, 1), card(0, 2)));
    const { state, events } = go(choosing, pick(choosing, card(0, 2)));
    expect(state.zones[0].stage.FC).toEqual([card(0, 0)]);
    expect(getInstance(state, card(0, 0)).orientation).toBe('STAND');
    expect(zoneOf(state, card(0, 2))).toBe('memory');
    expect(events.some((e) => e.type === 'ABILITY_PLAYED' && e.instanceId === card(0, 0))).toBe(true);
  });

  it('no such character on the stage: nothing happens; the card stays in memory', () => {
    const start = scenario({ step: 'CLIMAX_START', defs: cards({ '0:0': { abilities: [swap] }, '0:3': { name: 'Other' } }) }, (ctx) => {
      put(ctx, card(0, 0), { player: 0, zone: 'memory' });
      put(ctx, card(0, 3), stageSlot(0, 'FR'));
    }).state;
    const after = go(start, YES).state;
    expect(zoneOf(after, card(0, 0))).toBe('memory');
    expect(after.zones[0].stage.FR).toEqual([card(0, 3)]);
  });
});

describe('相手の山札を上から4枚まで見て、カードを1枚まで選び、山札の下に置き、残りのカードを山札の上に好きな順番で置く', () => {
  const look: Ability = { type: 'ACT', timing: 'MAIN', cost: [], effect: [{ do: 'REORDER_TOP', upTo: 4, whose: 'OPPONENT', toBottom: 1 }] };
  const field = () => scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [look] } }) }, (ctx) => put(ctx, card(0, 0), stageSlot(0, 'FC'))).state;
  /** The opponent's top cards are 49, 48, 47, 46 (top first). */
  const lookAt = (count: number) => {
    let state = answer(field(), { kind: 'MAIN', action: { type: 'ACTIVATE', card: oid(field(), card(0, 0)), ability: 0 } }).state;
    for (let k = 0; k < count; k++) state = answer(state, YES).state;
    return count < 4 ? answer(state, { kind: 'CONFIRM', accept: false }).state : state;
  };
  const deckOf = (state: GameState) => state.zones[1].deck;

  it('one card to the bottom; the other three back on top in the order chosen (first chosen on the very top)', () => {
    const choosing = lookAt(4);
    expect(pending(choosing, 'SELECT_CARDS')).toMatchObject({ player: 0, prompt: 'EFFECT_DECK_BOTTOM', min: 0, max: 1 });
    expect(offered(choosing)).toEqual(objects(choosing, card(1, 49), card(1, 48), card(1, 47), card(1, 46)));
    const ordering = go(choosing, pick(choosing, card(1, 48))).state;
    const { state } = go(ordering, pick(ordering, card(1, 46)), pick(ordering, card(1, 49)));
    const deck = deckOf(state);
    expect(deck[0]).toBe(card(1, 48));
    expect(deck.slice(-3)).toEqual([card(1, 47), card(1, 49), card(1, 46)]);
    expect(deck).toHaveLength(50);
    // Nothing goes to a waiting room.
    expect(state.zones[1].waitingRoom).toHaveLength(0);
  });

  it('none to the bottom: all four back on top in the order chosen; fewer looked at: only those', () => {
    const choosing = lookAt(4);
    const ordering = go(choosing, pick(choosing)).state;
    const { state } = go(ordering, pick(ordering, card(1, 47)), pick(ordering, card(1, 46)), pick(ordering, card(1, 49)));
    expect(deckOf(state).slice(-4)).toEqual([card(1, 48), card(1, 49), card(1, 46), card(1, 47)]);
    const two = lookAt(2);
    expect(offered(two)).toEqual(objects(two, card(1, 49), card(1, 48)));
    const after = go(two, pick(two, card(1, 49))).state;
    expect(deckOf(after)[0]).toBe(card(1, 49));
    expect(deckOf(after)[49]).toBe(card(1, 48));
  });

  it('the opponent does not see which cards were looked at or where they went', () => {
    const choosing = lookAt(4);
    const theirs = getPlayerView(choosing, 1);
    expect(theirs.decision).toMatchObject({ mine: false, kind: 'SELECT_CARDS' });
    expect(theirs.decision).not.toHaveProperty('decision');
    expect(theirs.sides[1].deck.every((c) => !('cardId' in c))).toBe(true);
  });
});

