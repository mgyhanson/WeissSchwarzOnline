/**
 * Building blocks of batch 3, part 4: moving a character to an empty slot of a row, "when this card triggers",
 * damage-cancelled triggers (with the source of a damage, CR-4.13.2), the first player's Nth turn, choosing
 * exactly one card to put back on the deck, and the bottom of the opponent's stock. Synthetic cards; the wording
 * each case stands for is in its name.
 */

import { describe, expect, it } from 'vitest';
import { type Ability, type Cost, type Effect, assertInvariants, availableColors, getInstance, getPlayerView, markerSlot, stageSlot } from '../src/index';
import { DRAW_ONE, activate, attack, cards, noClimaxes, played } from './ability-helpers';
import { answer, card, oid, pending, put, scenario } from './helpers';

const act = (effect: Effect[], cost: Cost[] = []): Ability => ({ type: 'ACT', timing: 'MAIN', cost, effect });

describe('前列／後列のキャラのいない枠に動かす', () => {
  const restAndMoveBack = act([
    { do: 'CHOOSE', from: 'YOUR_STAGE', other: true, min: 1, max: 1 },
    { do: 'ORIENT', target: { who: 'CHOSEN' }, to: 'REST' },
    { do: 'MOVE_TO_SLOT', target: { who: 'CHOSEN' }, row: 'BACK' },
  ]);

  it('他の自分のキャラを1枚選び、【レスト】し、後列のキャラのいない枠に動かす: same card, rested, its markers follow', () => {
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [restAndMoveBack] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), stageSlot(0, 'FL'));
      put(ctx, card(0, 5), markerSlot(0, 'FL'));
    }).state;
    const before = oid(start, card(0, 1));
    const atChoose = activate(start, card(0, 0)).state;
    const atSlot = answer(atChoose, { kind: 'SELECT_CARDS', cards: [before] }).state;
    expect(pending(atSlot, 'SELECT_SLOT').slots).toEqual(['BL', 'BR']);
    const { state } = answer(atSlot, { kind: 'SELECT_SLOT', slot: 'BR' });
    expect(state.zones[0].stage.BR).toEqual([card(0, 1)]);
    expect(state.zones[0].stage.FL).toEqual([]);
    expect(getInstance(state, card(0, 1)).orientation).toBe('REST');
    // A move between slots is not a change of zone (CR-3.1.4): still the same card.
    expect(oid(state, card(0, 1))).toBe(before);
    expect(state.zones[0].marker.BR).toEqual([card(0, 5)]);
    assertInvariants(state);
  });

  it('with no empty back slot, or a card that cannot be moved, it is only rested', () => {
    const run = (arrangeMore: Parameters<typeof scenario>[1], extra: Record<string, object> = {}) => {
      const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [restAndMoveBack] }, ...extra }) }, (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, 'FC'));
        put(ctx, card(0, 1), stageSlot(0, 'FL'));
        arrangeMore?.(ctx);
      }).state;
      const atChoose = activate(start, card(0, 0)).state;
      return answer(atChoose, { kind: 'SELECT_CARDS', cards: [oid(atChoose, card(0, 1))] }).state;
    };
    const full = run((ctx) => {
      put(ctx, card(0, 2), stageSlot(0, 'BL'));
      put(ctx, card(0, 3), stageSlot(0, 'BR'));
    });
    expect(full.zones[0].stage.FL).toEqual([card(0, 1)]);
    expect(getInstance(full, card(0, 1)).orientation).toBe('REST');
    const fixed = run(undefined, { '0:1': { abilities: [{ type: 'CONT', cannotMove: true, apply: [] }] } });
    expect(fixed.zones[0].stage.FL).toEqual([card(0, 1)]);
    expect(getInstance(fixed, card(0, 1)).orientation).toBe('REST');
  });

  it('このカードを前列のキャラのいない枠に動かす: only the empty front slots are offered', () => {
    const forward = act([{ do: 'MOVE_TO_SLOT', target: { who: 'SELF' }, row: 'FRONT' }]);
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [forward] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'BL'));
      put(ctx, card(0, 1), stageSlot(0, 'FC'));
    }).state;
    const atSlot = activate(start, card(0, 0)).state;
    expect(pending(atSlot, 'SELECT_SLOT').slots).toEqual(['FL', 'FR']);
    const { state } = answer(atSlot, { kind: 'SELECT_SLOT', slot: 'FR' });
    expect(state.zones[0].stage.FR).toEqual([card(0, 0)]);
    expect(state.zones[0].stage.BL).toEqual([]);
  });
});

describe('triggers', () => {
  it('このカードがトリガーした時: the card turned over by the trigger check, not the same card elsewhere', () => {
    const triggered: Ability = { type: 'AUTO', trigger: { on: 'THIS_TRIGGERED' }, effect: DRAW_ONE };
    const run = (checked: boolean) => {
      const start = scenario({ step: 'ATTACK_START', defs: cards({ '0:41': { abilities: [triggered] }, '0:40': { abilities: [triggered] } }) }, (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, 'FC'));
        noClimaxes(ctx, 0);
        noClimaxes(ctx, 1);
        // Without the checked card on top, it waits on the stage instead.
        if (!checked) put(ctx, card(0, 41), stageSlot(0, 'FL'));
      }).state;
      const { events } = attack(start, card(0, 0), 'DIRECT');
      return played(events, card(0, 41)) + played(events, card(0, 40));
    };
    expect(run(true)).toBe(1);
    // Now card 40 is the one turned over: it triggers; the one on the stage does not.
    expect(run(false)).toBe(1);
  });

  it('このカードの与えたダメージがキャンセルされた時: its battle damage (CR-4.13.2.1) and its effect damage (CR-4.13.2.2), only when cancelled', () => {
    const watch: Ability = { type: 'AUTO', trigger: { on: 'DEALT_DAMAGE_CANCELLED' }, effect: DRAW_ONE };
    const byAttack = (cancel: boolean) => {
      const start = scenario({ step: 'ATTACK_START', defs: cards({ '0:0': { abilities: [watch] } }) }, (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, 'FC'));
        noClimaxes(ctx, 0);
        if (!cancel) noClimaxes(ctx, 1);
      }).state;
      return played(attack(start, card(0, 0), 'DIRECT').events, card(0, 0));
    };
    expect(byAttack(true)).toBe(1);
    expect(byAttack(false)).toBe(0);

    const burn = act([{ do: 'DAMAGE', amount: 1 }]);
    const byEffect = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [burn, watch] } }) }, (ctx) => put(ctx, card(0, 0), stageSlot(0, 'FC'))).state;
    // Player 1's deck has climaxes on top: the damage is cancelled.
    expect(played(activate(byEffect, card(0, 0)).events, card(0, 0))).toBe(2);
  });

  it('このカードのバトル中、あなたの受けたダメージがキャンセルされた時: only for a character in the battle', () => {
    const watch: Ability = { type: 'AUTO', trigger: { on: 'TAKEN_DAMAGE_CANCELLED_IN_BATTLE' }, effect: DRAW_ONE };
    const run = (slot: 'FC' | 'FL') => {
      const start = scenario({ step: 'ATTACK_START', turnPlayer: 1, defs: cards({ '0:0': { abilities: [watch] } }) }, (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, slot));
        if (slot === 'FL') put(ctx, card(0, 1), stageSlot(0, 'FC'));
        put(ctx, card(1, 0), stageSlot(1, 'FC'));
        noClimaxes(ctx, 1);
        // Player 0's deck keeps its climaxes on top: the damage is cancelled.
      }).state;
      // Player 0 plays no counter; then the damage step.
      return played(answer(attack(start, card(1, 0), 'FRONT').state, { kind: 'COUNTER', card: null }).events, card(0, 0));
    };
    expect(run('FC')).toBe(1);
    expect(run('FL')).toBe(0);
  });
});

describe('conditions and effects', () => {
  it('先攻プレイヤーの第1ターンなら: game turn 1 of the first player only', () => {
    const ability = act([{ do: 'IF', condition: { if: 'FIRST_PLAYER_TURN', turn: 1 }, then: DRAW_ONE }]);
    const run = (turnNumber: number) => {
      const start = scenario({ step: 'MAIN_START', turnNumber, defs: cards({ '0:0': { abilities: [ability] } }) }, (ctx) => put(ctx, card(0, 0), stageSlot(0, 'FC'))).state;
      return activate(start, card(0, 0)).state.zones[0].hand.length;
    };
    expect(run(1)).toBe(1);
    expect(run(3)).toBe(0);
  });

  it('山札を上から2枚まで見て、カードを1枚選び、山札の上に置き、残りのカードを控え室に置く: exactly one goes back', () => {
    const look = act([{ do: 'REORDER_TOP', upTo: 2, keep: 1, keepExact: true }]);
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [look] } }) }, (ctx) => put(ctx, card(0, 0), stageSlot(0, 'FC'))).state;
    let state = activate(start, card(0, 0)).state;
    for (let k = 0; k < 2; k++) state = answer(state, { kind: 'CONFIRM', accept: true }).state;
    const keep = pending(state, 'SELECT_CARDS');
    expect(keep).toMatchObject({ min: 1, max: 1 });
    const done = answer(state, { kind: 'SELECT_CARDS', cards: [keep.cards[0]!] }).state;
    expect(done.zones[0].waitingRoom).toHaveLength(1);
  });

  it('相手のストックの下から1枚を、控え室に置く: the bottom card', () => {
    const drain = act([{ do: 'STOCK_BOTTOM_TO_WAITING_ROOM', count: 1, whose: 'OPPONENT' }]);
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [drain] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(1, 0), { player: 1, zone: 'stock' });
      put(ctx, card(1, 1), { player: 1, zone: 'stock' });
    }).state;
    const { state } = activate(start, card(0, 0));
    expect(state.zones[1].stock).toEqual([card(1, 1)]);
    expect(state.zones[1].waitingRoom).toEqual([card(1, 0)]);
  });
});

describe('batch 3 part 5: Level 3 pieces', () => {
  it('相手に2ダメージを2回与える: two separate damage processes (the first cancelled, the second not)', () => {
    const burn = act([{ do: 'REPEAT', times: 2, effects: [{ do: 'DAMAGE', amount: 2 }] }]);
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [burn] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      // Player 1's deck from the top: a climax (the first damage is cancelled), then characters only.
      noClimaxes(ctx, 1);
      put(ctx, card(1, 45), { player: 1, zone: 'deck' });
    }).state;
    const { state, events } = activate(start, card(0, 0));
    const dealt = events.filter((e) => e.type === 'DAMAGE_DEALT');
    expect(dealt.map((e) => (e.type === 'DAMAGE_DEALT' ? [e.amount, e.cancelled] : null))).toEqual([
      [2, true],
      [2, false],
    ]);
    expect(state.zones[1].clock).toHaveLength(2);
  });

  it('このカードは、色条件を満たさずに手札からプレイできる: playable without its colour in the level zone and clock', () => {
    const run = (abilities: Ability[]) => {
      const start = scenario({ step: 'MAIN_START', defs: cards({ '0:5': { level: 1, color: 'blue', abilities } }) }, (ctx) => {
        put(ctx, card(0, 5), { player: 0, zone: 'hand' });
        put(ctx, card(0, 30), { player: 0, zone: 'level' });
      }).state;
      return pending(start, 'MAIN').actions.some((a) => a.type === 'PLAY_CHARACTER' && a.card === oid(start, card(0, 5)));
    };
    expect(run([])).toBe(false);
    expect(run([{ type: 'CONT', inHand: true, ignoresColor: true, apply: [] }])).toBe(true);
  });

  it('相手は自分の山札の上から2枚を、控え室に置く: from the opponent’s deck', () => {
    const mill = act([{ do: 'DECK_TOP', count: 2, to: 'WAITING_ROOM', whose: 'OPPONENT' }]);
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [mill] } }) }, (ctx) => put(ctx, card(0, 0), stageSlot(0, 'FC'))).state;
    const { state } = activate(start, card(0, 0));
    expect(state.zones[1].waitingRoom).toEqual([card(1, 49), card(1, 48)]);
    expect(state.zones[0].waitingRoom).toEqual([]);
  });

  it('あなたの受けたダメージがキャンセルされなかった時: only for damage that reached your clock', () => {
    const watch: Ability = { type: 'AUTO', trigger: { on: 'TAKEN_DAMAGE_NOT_CANCELLED' }, effect: DRAW_ONE };
    const burn = act([{ do: 'DAMAGE', amount: 1 }]);
    const run = (cancel: boolean) => {
      const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [burn] }, '1:0': { abilities: [watch] } }) }, (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, 'FC'));
        put(ctx, card(1, 0), stageSlot(1, 'FC'));
        if (!cancel) noClimaxes(ctx, 1);
      }).state;
      return played(activate(start, card(0, 0)).events, card(1, 0));
    };
    expect(run(false)).toBe(1);
    expect(run(true)).toBe(0);
  });

  it('自分の山札を上から1枚見て、山札の上か控え室に置く', () => {
    const look = act([{ do: 'TOP_OR_BOTTOM', orWaitingRoom: true }]);
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [look] } }) }, (ctx) => put(ctx, card(0, 0), stageSlot(0, 'FC'))).state;
    const asked = activate(start, card(0, 0)).state;
    expect(pending(asked, 'SELECT_OPTION').options).toEqual(['DECK_TOP', 'WAITING_ROOM']);
    const { state } = answer(asked, { kind: 'SELECT_OPTION', option: 'WAITING_ROOM' });
    expect(state.zones[0].waitingRoom).toEqual([card(0, 49)]);
  });

  it('［あなたのレベル置場の表向きのカードを2枚裏向きにする］: face down, hidden from the opponent, no colour (CR-3.9.2.2)', () => {
    const ability = act(DRAW_ONE, [{ pay: 'LEVEL_FACE_DOWN', count: 2 }]);
    const setup = (levels: number) =>
      scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [ability] }, '0:30': { color: 'blue' }, '0:31': { color: 'blue' } }) }, (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, 'FC'));
        for (let k = 0; k < levels; k++) put(ctx, card(0, 30 + k), { player: 0, zone: 'level' });
      }).state;
    expect(pending(setup(1), 'MAIN').actions.some((a) => a.type === 'ACTIVATE')).toBe(false);
    const asked = activate(setup(2), card(0, 0)).state;
    const choose = pending(asked, 'SELECT_CARDS');
    expect(choose).toMatchObject({ min: 2, max: 2 });
    const { state } = answer(asked, { kind: 'SELECT_CARDS', cards: choose.cards });
    expect(state.zones[0].level.map((id) => getInstance(state, id).face)).toEqual(['DOWN', 'DOWN']);
    expect(state.zones[0].hand).toHaveLength(1);
    expect(getPlayerView(state, 1).sides[0].level.every((c) => !('cardId' in c))).toBe(true);
    expect(getPlayerView(state, 0).sides[0].level.every((c) => 'cardId' in c)).toBe(true);
    expect(availableColors(state, 0).has('blue')).toBe(false);
    assertInvariants(state);
  });
});
