/**
 * Markers (CR-3.7), 回想 (CR-10.20), 搭乗 (CR-10.21) and リンク (CR-10.17).
 * Synthetic cards; the card wording each case stands for is in its name.
 */

import { describe, expect, it } from 'vitest';
import { type Ability, type Cost, type Ctx, type Effect, assertInvariants, getPlayerView, getPower, markerSlot, stageSlot } from '../src/index';
import { DRAW_ONE, activate, attack, canActivate, cards, noClimaxes, played } from './ability-helpers';
import { answer, card, oid, pending, put, scenario, testCardId } from './helpers';

const act = (effect: Effect[], cost: Cost[] = []): Ability => ({ type: 'ACT', timing: 'MAIN', cost, effect });
const markerZone = (state: ReturnType<typeof scenario>['state'], player: 0 | 1, slot: 'FC' | 'FL' | 'FR' | 'BL' | 'BR') => state.zones[player].marker[slot];
const putUnder = (face: 'UP' | 'DOWN'): Effect[] => [{ do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', min: 1, max: 1 }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'UNDER_SELF', face }];

describe('putting cards under a character, and taking them back', () => {
  const start = (abilities: Ability[], arrange: (ctx: Ctx) => void = () => {}) =>
    scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 5), { player: 0, zone: 'waitingRoom' });
      put(ctx, card(0, 6), { player: 0, zone: 'waitingRoom' });
      arrange(ctx);
    }).state;

  it.each(['UP', 'DOWN'] as const)('このカードの下にマーカーとして%s向きに置く: the card goes to the marker zone of this card’s slot, with that face', (face) => {
    const atChoose = activate(start([act(putUnder(face))]), card(0, 0)).state;
    const done = answer(atChoose, { kind: 'SELECT_CARDS', cards: [oid(atChoose, card(0, 5))] }).state;
    expect(markerZone(done, 0, 'FC')).toEqual([card(0, 5)]);
    expect(done.instances[card(0, 5)]!.face).toBe(face);
    // Hidden information: a face-down marker is hidden from both players (CR-3.7.2); a face-up one is public (CR-3.7.2.1).
    for (const viewer of [0, 1] as const) {
      const shown = getPlayerView(done, viewer).sides[0].marker.FC;
      expect(shown[0]!.hidden, `viewer ${viewer}`).toBe(face === 'DOWN');
      if (face === 'DOWN') expect(JSON.stringify(shown)).not.toContain(testCardId(0, 5));
    }
    assertInvariants(done);
  });

  it('このカードの下のマーカーを1枚手札に戻す: the top marker (the last one put there, CR-3.7.2)', () => {
    const state = start([act([{ do: 'MARKERS_TOP', count: 1, to: 'HAND' }])], (ctx) => {
      put(ctx, card(0, 7), markerSlot(0, 'FC'));
      put(ctx, card(0, 8), markerSlot(0, 'FC'));
    });
    const done = activate(state, card(0, 0)).state;
    expect(done.zones[0].hand).toEqual([card(0, 8)]);
    expect(markerZone(done, 0, 'FC')).toEqual([card(0, 7)]);
  });

  it('［このカードの下のマーカーを1枚控え室に置く］: paid from the top; not payable without a marker', () => {
    const ability = act(DRAW_ONE, [{ pay: 'MARKERS_TO_WAITING_ROOM', count: 1 }]);
    expect(canActivate(start([ability]))).toBe(false);
    const withMarkers = start([ability], (ctx) => {
      put(ctx, card(0, 7), markerSlot(0, 'FC'));
      put(ctx, card(0, 8), markerSlot(0, 'FC'));
    });
    const done = activate(withMarkers, card(0, 0)).state;
    expect(done.zones[0].waitingRoom).toContain(card(0, 8));
    expect(markerZone(done, 0, 'FC')).toEqual([card(0, 7)]);
  });

  it('the markers go to the waiting room when their character leaves the stage (CR-3.7.3.2)', () => {
    const state = start([act([{ do: 'MOVE', target: { who: 'SELF' }, to: 'HAND' }])], (ctx) => put(ctx, card(0, 7), markerSlot(0, 'FC'), { face: 'UP' }));
    const done = activate(state, card(0, 0)).state;
    expect(done.zones[0].hand).toEqual([card(0, 0)]);
    expect(done.zones[0].waitingRoom).toContain(card(0, 7));
    expect(markerZone(done, 0, 'FC')).toEqual([]);
  });
});

describe('conditions and numbers about markers', () => {
  const boost = (condition: Ability extends infer A ? (A extends { type: 'CONT'; condition?: infer C } ? C : never) : never): Ability => ({ type: 'CONT', condition, apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: 1000 }] });
  const power = (abilities: Ability[], markers: { id: number; face: 'UP' | 'DOWN' }[], defs: Record<string, object> = {}) => {
    const state = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities }, ...defs }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      for (const m of markers) put(ctx, card(0, m.id), markerSlot(0, 'FC'), { face: m.face });
    }).state;
    return getPower(state, card(0, 0));
  };

  it('このカードの下にマーカーがある / ない (a face-down marker counts: the character "has a marker", CR-3.7.4)', () => {
    const has = boost({ if: 'MARKERS', of: 'SELF', min: 1 });
    const none = boost({ if: 'MARKERS', of: 'SELF', max: 0 });
    expect([power([has], []), power([has], [{ id: 5, face: 'DOWN' }])]).toEqual([1000, 2000]);
    expect([power([none], []), power([none], [{ id: 5, face: 'UP' }])]).toEqual([2000, 1000]);
  });

  it('このカードの下の異なるカード名のマーカーが2枚以上: face-up markers with different names; a face-down marker has no name (CR-3.7.2.3)', () => {
    const distinct = boost({ if: 'MARKERS', of: 'SELF', min: 2, distinctNames: true });
    expect(power([distinct], [{ id: 5, face: 'UP' }, { id: 6, face: 'UP' }])).toBe(2000);
    expect(power([distinct], [{ id: 5, face: 'UP' }, { id: 6, face: 'UP' }], { '0:6': { name: `Test character ${testCardId(0, 5)}` } })).toBe(1000);
    expect(power([distinct], [{ id: 5, face: 'UP' }, { id: 6, face: 'DOWN' }])).toBe(1000);
  });

  it('このカードの下のマーカー1枚につき、このカードのパワーを＋3000', () => {
    const per: Ability = { type: 'CONT', apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: 3000, perMarker: true }] };
    expect([power([per], []), power([per], [{ id: 5, face: 'DOWN' }, { id: 6, face: 'UP' }])]).toEqual([1000, 7000]);
  });

  it('あなたの、思い出とマーカー置場のカードの合計が2枚以下: memory and every marker zone of the player, face down too', () => {
    const counted = boost({ if: 'COUNT', where: 'YOUR_MEMORY_AND_MARKERS', max: 2 });
    const state = (memory: number, markers: number) =>
      scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [counted] } }) }, (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, 'FC'));
        put(ctx, card(0, 1), stageSlot(0, 'FL'));
        for (let i = 0; i < memory; i++) put(ctx, card(0, 10 + i), { player: 0, zone: 'memory' });
        for (let i = 0; i < markers; i++) put(ctx, card(0, 20 + i), markerSlot(0, 'FL'));
      }).state;
    expect(getPower(state(1, 1), card(0, 0))).toBe(2000);
    expect(getPower(state(1, 2), card(0, 0))).toBe(1000);
  });
});

describe('abilities that work from the marker zone', () => {
  const shine: Ability = { type: 'CONT', zone: 'MARKER', apply: [{ target: { who: 'MARKER_HOLDER', filter: { kind: 'CHARACTER', traits: ['巡遊者'] } }, stat: 'POWER', amount: 1500 }] };
  const holderAttack: Ability = { type: 'AUTO', zone: 'MARKER', trigger: { on: 'HOLDER_ATTACKS' }, effect: DRAW_ONE };
  const start = (face: 'UP' | 'DOWN', abilities: Ability[] = [shine], traits = ['巡遊者']) =>
    scenario({ step: 'ATTACK_START', defs: cards({ '0:0': { traits }, '0:7': { abilities } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), stageSlot(0, 'FL'));
      put(ctx, card(0, 7), markerSlot(0, 'FC'), { face });
      noClimaxes(ctx, 0);
      noClimaxes(ctx, 1);
    }).state;

  it('マーカー置場にこのカードがあるなら、このマーカーを持つ舞台の《巡遊者》のキャラのパワーを＋1500: face up only, the holder only, matching only', () => {
    expect(getPower(start('UP'), card(0, 0))).toBe(2500);
    expect(getPower(start('UP'), card(0, 1))).toBe(1000);
    expect(getPower(start('DOWN'), card(0, 0))).toBe(1000);
    expect(getPower(start('UP', [shine], []), card(0, 0))).toBe(1000);
  });

  it('the same card on the stage does not use its marker-zone ability', () => {
    const state = scenario({ step: 'MAIN_START', defs: cards({ '0:7': { abilities: [shine], traits: ['巡遊者'] } }) }, (ctx) => put(ctx, card(0, 7), stageSlot(0, 'FC'))).state;
    expect(getPower(state, card(0, 7))).toBe(1000);
  });

  it('…このマーカーを持つ舞台のキャラがアタックした時: the holder’s attack triggers it, another character’s does not', () => {
    const state = start('UP', [holderAttack]);
    expect(played(attack(state, card(0, 1), 'DIRECT').events, card(0, 7))).toBe(0);
    expect(played(attack(state, card(0, 0), 'DIRECT').events, card(0, 7))).toBe(1);
    expect(played(attack(start('DOWN', [holderAttack]), card(0, 0), 'DIRECT').events, card(0, 7))).toBe(0);
  });
});

describe('回想 (CR-10.20)', () => {
  const recollect: Ability = { type: 'CONT', recollection: true, apply: [] };

  it('from memory: when a character of yours is put on the stage from elsewhere, it may go face up under it; a second one finds a marker there and stays', () => {
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:5': { abilities: [recollect] }, '0:6': { abilities: [recollect] } }) }, (ctx) => {
      put(ctx, card(0, 0), { player: 0, zone: 'hand' });
      put(ctx, card(0, 5), { player: 0, zone: 'memory' });
      put(ctx, card(0, 6), { player: 0, zone: 'memory' });
    }).state;
    let state = answer(start, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(start, card(0, 0)), slot: 'FC' } }).state;
    // Both triggered: the player orders them, then the first is accepted.
    if (state.pending?.kind === 'CHOOSE_ABILITY') state = answer(state, { kind: 'CHOOSE_ABILITY', id: pending(state, 'CHOOSE_ABILITY').abilities[0]!.id }).state;
    expect(pending(state, 'CONFIRM').prompt).toBe('USE_ABILITY');
    state = answer(state, { kind: 'CONFIRM', accept: true }).state;
    // The second one's condition no longer holds: nothing is asked.
    expect(state.pending?.kind).toBe('MAIN');
    expect(markerZone(state, 0, 'FC')).toHaveLength(1);
    const under = markerZone(state, 0, 'FC')[0]!;
    expect(state.instances[under]!.face).toBe('UP');
    expect(state.zones[0].memory).toHaveLength(1);
    assertInvariants(state);
  });

  it('a face-down memory card has no 回想; a character put on the stage from the stage (moved between slots) does not trigger it', () => {
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:5': { abilities: [recollect] } }) }, (ctx) => {
      put(ctx, card(0, 0), { player: 0, zone: 'hand' });
      put(ctx, card(0, 5), { player: 0, zone: 'memory' }, { face: 'DOWN' });
    }).state;
    const state = answer(start, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(start, card(0, 0)), slot: 'FC' } }).state;
    expect(state.pending?.kind).toBe('MAIN');
    const moved = scenario({ step: 'MAIN_START', defs: cards({ '0:5': { abilities: [recollect] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 5), { player: 0, zone: 'memory' });
    }).state;
    const swap = pending(moved, 'MAIN').actions.find((a) => a.type === 'SWAP' && ((a.a === 'FC' && a.b === 'FL') || (a.a === 'FL' && a.b === 'FC')))!;
    expect(answer(moved, { kind: 'MAIN', action: swap }).state.pending?.kind).toBe('MAIN');
  });

  it('when it moves from the marker zone to a public zone (its character left the stage), it goes to memory', () => {
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [act([{ do: 'MOVE', target: { who: 'SELF' }, to: 'WAITING_ROOM' }])] }, '0:5': { abilities: [recollect] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 5), markerSlot(0, 'FC'), { face: 'UP' });
    }).state;
    // The encore of the character (a rule) and the 回想 return wait together: the player orders them, and declines the encore.
    let state = activate(start, card(0, 0)).state;
    for (let i = 0; i < 5 && state.pending?.kind !== 'MAIN'; i++) {
      const d = state.pending!;
      if (d.kind === 'CHOOSE_ABILITY') state = answer(state, { kind: 'CHOOSE_ABILITY', id: (d.abilities.find((a) => a.type === 'CARD') ?? d.abilities[0]!).id }).state;
      else if (d.kind === 'CONFIRM') state = answer(state, { kind: 'CONFIRM', accept: false }).state;
      else throw new Error(`unexpected ${d.kind}`);
    }
    expect(state.zones[0].memory).toEqual([card(0, 5)]);
    expect(state.zones[0].waitingRoom).toEqual([card(0, 0)]);
    // Taken into the hand (not public), it stays there.
    const toHand = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [act([{ do: 'MARKERS_TOP', count: 1, to: 'HAND' }])] }, '0:5': { abilities: [recollect] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 5), markerSlot(0, 'FC'), { face: 'UP' });
    }).state;
    expect(activate(toHand, card(0, 0)).state.zones[0].hand).toEqual([card(0, 5)]);
  });

  it('［あなたの舞台の『回想』を持つキャラを1枚思い出にする］ and 『【リンク】 ７つのかくご』を持つ', () => {
    const cost: Cost[] = [{ pay: 'CHARACTERS_TO_WAITING_ROOM', count: 1, filter: { kind: 'CHARACTER', hasRecollection: true }, toMemory: true }];
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [act(DRAW_ONE, cost)] }, '0:1': { abilities: [recollect] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), stageSlot(0, 'FL'));
      put(ctx, card(0, 2), stageSlot(0, 'FR'));
    }).state;
    const atCost = activate(start, card(0, 0)).state;
    expect(pending(atCost, 'SELECT_CARDS').cards).toEqual([oid(atCost, card(0, 1))]);
    expect(answer(atCost, { kind: 'SELECT_CARDS', cards: [oid(atCost, card(0, 1))] }).state.zones[0].memory).toEqual([card(0, 1)]);
    const link = act([{ do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { kind: 'CHARACTER', hasLink: '７つのかくご' }, min: 0, max: 1 }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' }]);
    const linked = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [link] }, '0:5': { abilities: [{ type: 'CONT', link: '７つのかくご', apply: [] }] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 5), { player: 0, zone: 'waitingRoom' });
      put(ctx, card(0, 6), { player: 0, zone: 'waitingRoom' });
    }).state;
    expect(pending(activate(linked, card(0, 0)).state, 'SELECT_CARDS').cards).toEqual([oid(linked, card(0, 5))]);
  });
});

describe('搭乗 (CR-10.21): ［このカードを表向きで他のあなたの「名称」のマーカーにする］', () => {
  const board = (name: string): Ability => ({ type: 'ACT', keywords: ['BOARDING'], timing: 'MAIN', cost: [{ pay: 'SELF_TO_MARKER', underName: name }], effect: DRAW_ONE });
  const tank = `Test character ${testCardId(0, 1)}`;

  it('the card goes face up under the chosen character of that name; then the effect', () => {
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [board(tank)] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), stageSlot(0, 'FL'));
      put(ctx, card(0, 2), stageSlot(0, 'FR'));
    }).state;
    const atChoose = activate(start, card(0, 0)).state;
    expect(pending(atChoose, 'SELECT_CARDS')).toMatchObject({ prompt: 'COST_BOARD', cards: [oid(atChoose, card(0, 1))] });
    const done = answer(atChoose, { kind: 'SELECT_CARDS', cards: [oid(atChoose, card(0, 1))] }).state;
    expect(markerZone(done, 0, 'FL')).toEqual([card(0, 0)]);
    expect(done.instances[card(0, 0)]!.face).toBe('UP');
    expect(done.zones[0].stage.FC).toEqual([]);
    expect(done.zones[0].hand).toHaveLength(1);
    assertInvariants(done);
  });

  it('without another character of that name it cannot be played', () => {
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [board(tank)] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 2), stageSlot(0, 'FR'));
    }).state;
    expect(canActivate(start)).toBe(false);
  });
});
