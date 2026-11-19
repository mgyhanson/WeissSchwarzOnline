/**
 * Building blocks of batch 16: a card name taken while a condition holds; choosing from the hand or the markers under
 * this card; another character and this card to memory, then each onto a slot of its own later; a 【起】 a card has
 * in the waiting room; 手札から…か「名称」の【起】の効果で舞台に置かれた時; このカードが【スタンド】している.
 * Synthetic cards; the wording each case stands for is in its name.
 */

import { describe, expect, it } from 'vitest';
import { type Ability, type CardDef, type Choice, type GameEvent, type GameState, evalCondition, getInstance, matchesFilter, stageSlot } from '../src/index';
import { activate, cards } from './ability-helpers';
import { answer, card, oid, pending, put, scenario } from './helpers';
import { listMainActions } from '../src/play';

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
const slot = (s: string): Choice => ({ kind: 'SELECT_SLOT', slot: s as never });
const character = (level: number, more: Partial<CardDef> = {}): Partial<CardDef> => ({ kind: 'CHARACTER', level, cost: 0, power: 1000, soul: 1, ...more });

describe('【永】 このカードの下にマーカーがないなら、このカードはカード名の「A」をすべて失い、このカードのカード名は「B」として扱う', () => {
  const rename: Ability = { type: 'CONT', condition: { if: 'MARKERS', of: 'SELF', max: 0 }, nameAs: 'B', saidLost: 'A', apply: [] };
  const field = (marker: boolean, onStage = true) =>
    scenario({ step: 'MAIN_START', defs: cards({ '0:0': { name: 'A', abilities: [rename] } }) }, (ctx) => {
      put(ctx, card(0, 0), onStage ? stageSlot(0, 'FC') : { player: 0, zone: 'hand' });
      if (marker) put(ctx, card(0, 5), { player: 0, zone: 'marker', slot: 'FC' });
    }).state;

  it('no marker: named B (not A); a marker: A again; in the hand: A', () => {
    expect(matchesFilter(field(false), card(0, 0), { name: 'B' })).toBe(true);
    expect(matchesFilter(field(false), card(0, 0), { name: 'A' })).toBe(false);
    expect(matchesFilter(field(true), card(0, 0), { name: 'A' })).toBe(true);
    expect(matchesFilter(field(false, false), card(0, 0), { name: 'A' })).toBe(true);
  });

  it('only its own ability renames it: a second copy without a marker does not rename the one with a marker', () => {
    const state = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { name: 'A', abilities: [rename] }, '0:1': { name: 'A', abilities: [rename] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 5), { player: 0, zone: 'marker', slot: 'FC' });
      put(ctx, card(0, 1), stageSlot(0, 'FL'));
    }).state;
    expect(matchesFilter(state, card(0, 0), { name: 'A' })).toBe(true);
    expect(matchesFilter(state, card(0, 1), { name: 'B' })).toBe(true);
  });
});

describe('自分の、手札かこのカードの下のマーカーの「X」を1枚選び、舞台の好きな枠に置き、このカードを控え室に置く', () => {
  const swap: Ability = {
    type: 'ACT',
    timing: 'MAIN',
    cost: [],
    effect: [
      { do: 'CHOOSE', from: 'YOUR_HAND_OR_SELF_MARKERS', filter: { name: 'X' }, min: 1, max: 1 },
      { do: 'CHOOSE_SLOT', which: 'ANY' },
      { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'CHOSEN_SLOT' },
      { do: 'MOVE', target: { who: 'SELF' }, to: 'WAITING_ROOM' },
    ],
  };
  /** Card 5 (X) in the hand; card 6 (X) under this card face up, card 7 (X) face down; card 8 (X) in the waiting room. */
  const field = () =>
    scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [swap] }, '0:5': character(0, { name: 'X' }), '0:6': character(0, { name: 'X' }), '0:7': character(0, { name: 'X' }), '0:8': character(0, { name: 'X' }) }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 5), { player: 0, zone: 'hand' });
      put(ctx, card(0, 6), { player: 0, zone: 'marker', slot: 'FC' }, { face: 'UP' });
      put(ctx, card(0, 7), { player: 0, zone: 'marker', slot: 'FC' }, { face: 'DOWN' });
      put(ctx, card(0, 8), { player: 0, zone: 'waitingRoom' });
    }).state;

  it('the hand card and the face-up marker are offered; not the face-down one or the waiting room', () => {
    const asked = activate(field(), card(0, 0)).state;
    expect(offered(asked)).toEqual(objects(asked, card(0, 5), card(0, 6)));
  });

  it('the marker goes to the slot chosen; this card goes to the waiting room', () => {
    const asked = activate(field(), card(0, 0)).state;
    const { state } = go(asked, pick(asked, card(0, 6)), slot('FL'));
    expect(getInstance(state, card(0, 6)).location).toMatchObject({ zone: 'stage', slot: 'FL' });
    expect(zoneOf(state, card(0, 0))).toBe('waitingRoom');
  });
});

describe('他の自分のキャラを1枚と、このカードを選び、思い出にする。次のあなたのドローフェイズの始めに、…それらのキャラを、舞台の別々の枠に置く', () => {
  const away: Ability = {
    type: 'ACT',
    timing: 'MAIN',
    cost: [],
    effect: [
      { do: 'CHOOSE', from: 'YOUR_STAGE', other: true, filter: { kind: 'CHARACTER' }, min: 1, max: 1 },
      { do: 'MOVE', target: { who: 'CHOSEN_AND_SELF' }, to: 'MEMORY' },
      { do: 'DELAYED', at: { phase: 'DRAW', whose: 'YOURS' }, effects: [{ do: 'PLACE_EACH_IN_SLOT', target: { who: 'MOVED', where: 'MEMORY' } }] },
    ],
  };
  const field = () =>
    scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [away] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), stageSlot(0, 'FL'));
    }).state;

  it('both go to memory; at the next draw phase of this player each goes to a slot of its own', () => {
    const asked = activate(field(), card(0, 0)).state;
    const gone = go(asked, pick(asked, card(0, 1))).state;
    expect(zoneOf(gone, card(0, 0))).toBe('memory');
    expect(zoneOf(gone, card(0, 1))).toBe('memory');
    // Pass until player 0's next draw phase asks for the slots (player 1's turn in between does nothing).
    let state = gone;
    for (let k = 0; k < 200 && !(state.pending?.kind === 'SELECT_SLOT' && state.pending.player === 0); k++) {
      const d = state.pending!;
      const choice: Choice =
        d.kind === 'MAIN' ? { kind: 'MAIN', action: { type: 'PASS' } }
        : d.kind === 'CLIMAX' ? { kind: 'CLIMAX', card: null }
        : d.kind === 'ATTACK' ? { kind: 'ATTACK', attack: null }
        : d.kind === 'CLOCK' ? { kind: 'CLOCK', card: null }
        : d.kind === 'HAND_LIMIT' ? { kind: 'HAND_LIMIT', discard: d.cards.slice(0, d.count) }
        : d.kind === 'CHOOSE_ABILITY' ? { kind: 'CHOOSE_ABILITY', id: d.abilities[0]!.id }
        : { kind: 'CONFIRM', accept: false };
      state = answer(state, choice).state;
    }
    expect(state.turn).toMatchObject({ player: 0, phase: 'DRAW' });
    const first = pending(state, 'SELECT_SLOT').slots;
    expect(first).toHaveLength(5);
    const second = go(state, slot('FL')).state;
    // The slot already used is not offered again.
    expect(pending(second, 'SELECT_SLOT').slots).not.toContain('FL');
    const done = go(second, slot('BR')).state;
    const placed = [card(0, 0), card(0, 1)].map((id) => getInstance(done, id).location);
    expect(placed.map((l) => l.zone)).toEqual(['stage', 'stage']);
    expect(placed.map((l) => (l as { slot: string }).slot).sort()).toEqual(['BR', 'FL']);
  });
});

describe('【永】 控え室にこのカードがあり、…なら、このカードは次の能力を得る。『【起】 控え室のこのカードを舞台のキャラのいない枠に置く。』 / 「名称」の【起】の効果で舞台に置かれた時', () => {
  const placeSelf: Ability = { type: 'ACT', timing: 'MAIN', cost: [], effect: [{ do: 'PLACE_IN_EMPTY_SLOT', target: { who: 'SELF' }, fromWaitingRoom: true }] };
  const inWaiting: Ability = { type: 'CONT', zone: 'WAITING_ROOM', condition: { if: 'LEVEL', min: 1 }, apply: [], gains: [placeSelf] };
  const drawn: Ability = { type: 'AUTO', trigger: { on: 'PLACED_ON_STAGE', from: 'HAND_OR_ACT', actOf: 'Viper' }, effect: [{ do: 'DRAW', count: 1 }] };
  const field = (level: number) =>
    scenario({ step: 'MAIN_START', defs: cards({ '0:5': character(1, { name: 'Viper', abilities: [inWaiting, drawn] }) }) }, (ctx) => {
      put(ctx, card(0, 5), { player: 0, zone: 'waitingRoom' });
      for (let k = 0; k < level; k++) put(ctx, card(0, 20 + k), { player: 0, zone: 'level' });
    }).state;
  const actions = (state: GameState) => listMainActions(state, 0).filter((a) => a.type === 'ACTIVATE' && a.card === oid(state, card(0, 5)));

  it('the 【起】 is offered in the waiting room only while the condition holds', () => {
    expect(actions(field(1))).toHaveLength(1);
    expect(actions(field(0))).toHaveLength(0);
  });

  it('…あなたのキャラすべてが《…》なら: not offered while a character without the trait is on the stage', () => {
    const allTrait: Ability = { type: 'CONT', zone: 'WAITING_ROOM', condition: { if: 'ALL_CHARACTERS', filter: { kind: 'CHARACTER', traits: ['Nikke'] } }, apply: [], gains: [placeSelf] };
    const state = (trait: boolean) =>
      scenario({ step: 'MAIN_START', defs: cards({ '0:5': character(1, { abilities: [allTrait] }), '0:1': character(0, { traits: trait ? ['Nikke'] : [] }) }) }, (ctx) => {
        put(ctx, card(0, 5), { player: 0, zone: 'waitingRoom' });
        put(ctx, card(0, 1), stageSlot(0, 'FC'));
      }).state;
    expect(actions(state(true))).toHaveLength(1);
    expect(actions(state(false))).toHaveLength(0);
  });

  it('it puts the card into an empty slot; that triggers 「Viper」の【起】の効果で舞台に置かれた時', () => {
    const start = field(1);
    const handBefore = start.zones[0].hand.length;
    const asked = answer(start, { kind: 'MAIN', action: actions(start)[0]! }).state;
    const { state } = go(asked, slot('FC'));
    expect(getInstance(state, card(0, 5)).location).toMatchObject({ zone: 'stage', slot: 'FC' });
    expect(state.zones[0].hand.length).toBe(handBefore + 1);
  });
});

describe('このカードが【スタンド】している', () => {
  it('standing on the stage: true; rested: false', () => {
    const state = (rested: boolean) =>
      scenario({ step: 'MAIN_START' }, (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, 'FC'), rested ? { orientation: 'REST' } : undefined);
      }).state;
    expect(evalCondition(state(false), 0, card(0, 0), { if: 'SELF_STANDING' })).toBe(true);
    expect(evalCondition(state(true), 0, card(0, 0), { if: 'SELF_STANDING' })).toBe(false);
  });
});
