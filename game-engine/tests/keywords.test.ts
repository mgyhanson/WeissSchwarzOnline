/**
 * Keywords and constructs added in STEP 4d-2: bond, encore with another
 * cost, change, great performance, alarm, step triggers and "for each ..."
 * amounts. As elsewhere, the abilities are attached to synthetic test cards.
 */

import { describe, expect, it } from 'vitest';
import {
  type Ability,
  type CardMovedEvent,
  type Ctx,
  type GameState,
  type PlayerId,
  assertInvariants,
  bond,
  encore,
  getInstance,
  getPower,
  moveCards,
  stageSlot,
} from '../src/index';
import { type DefOverride, answer, card, oid, pending, put, scenario, testCardId } from './helpers';

function withAbilities(player: PlayerId, map: Record<number, Ability[]>, extra?: DefOverride): DefOverride {
  return (p, i) => {
    const base = extra?.(p, i);
    return p === player && map[i] ? { ...base, abilities: map[i] } : base;
  };
}

function noClimaxes(ctx: Ctx, player: PlayerId): void {
  moveCards(ctx, [42, 43, 44, 45, 46, 47, 48, 49].map((i) => card(player, i)), { player, zone: 'memory' });
}

const nameOf = (player: PlayerId, index: number): string => `Test character ${testCardId(player, index)}`;

describe('絆 bond (CR-10.4)', () => {
  it('T-KW-005 / CR-10.4.2: 絆／「…」 ［(1)］ returns a card of that name from the waiting room to hand', () => {
    const defs = withAbilities(0, { 0: [bond(nameOf(0, 1), [{ pay: 'STOCK', count: 1 }])] });
    const start = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), { player: 0, zone: 'hand' });
      put(ctx, card(0, 1), { player: 0, zone: 'waitingRoom' });
      put(ctx, card(0, 2), { player: 0, zone: 'waitingRoom' });
      put(ctx, card(0, 20), { player: 0, zone: 'stock' });
    }).state;
    const atConfirm = answer(start, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(start, card(0, 0)), slot: 'FC' } }).state;
    expect(pending(atConfirm, 'CONFIRM').prompt).toBe('PAY_COST');
    const atChoose = answer(atConfirm, { kind: 'CONFIRM', accept: true }).state;
    // Only the card with the named card name, not the other characters there.
    expect(pending(atChoose, 'SELECT_CARDS').cards).toEqual([oid(atChoose, card(0, 1))]);
    const { state } = answer(atChoose, { kind: 'SELECT_CARDS', cards: [oid(atChoose, card(0, 1))] });
    expect(state.zones[0].hand).toEqual([card(0, 1)]);
  });
});

describe('encore with another cost (CR-10.2.2)', () => {
  it('アンコール ［手札のキャラを1枚控え室に置く］ returns the character to its slot, rested', () => {
    const defs = withAbilities(0, { 0: [encore([{ pay: 'DISCARD', count: 1, filter: { kind: 'CHARACTER' } }])] });
    const start = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 5), { player: 0, zone: 'hand' });
      put(ctx, card(0, 6), { player: 0, zone: 'hand' });
    }).state;
    // Playing another character onto the slot sends this one to the waiting room.
    const atOrder = answer(start, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(start, card(0, 5)), slot: 'FC' } }).state;
    // CR-10.2.3: it also has the encore (3) of every character; both wait.
    const order = pending(atOrder, 'CHOOSE_ABILITY');
    expect(order.abilities.map((a) => a.type).sort()).toEqual(['CARD', 'ENCORE']);

    const atConfirm = answer(atOrder, { kind: 'CHOOSE_ABILITY', id: order.abilities.find((a) => a.type === 'CARD')!.id }).state;
    expect(pending(atConfirm, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST', card: oid(atConfirm, card(0, 0)) });
    const atDiscard = answer(atConfirm, { kind: 'CONFIRM', accept: true }).state;
    expect(pending(atDiscard, 'SELECT_CARDS')).toMatchObject({ prompt: 'COST_DISCARD', cards: [oid(atDiscard, card(0, 6))] });

    const { state, events } = answer(atDiscard, { kind: 'SELECT_CARDS', cards: [oid(atDiscard, card(0, 6))] });
    const back = events.find((e): e is CardMovedEvent => e.type === 'CARD_MOVED' && e.instanceId === card(0, 0) && e.to.zone === 'stage');
    expect(back).toMatchObject({ orientation: 'REST', to: { player: 0, zone: 'stage', slot: 'FC' } });
    // It returned last, so the newly played character is the one removed (CR-9.6.2).
    expect(state.zones[0].stage.FC).toEqual([card(0, 0)]);
    expect([...state.zones[0].waitingRoom].sort((a, b) => a - b)).toEqual([card(0, 5), card(0, 6)]);
    assertInvariants(state, { settled: true });
  });
});

describe('チェンジ change (CR-10.8)', () => {
  const change: Ability[] = [{
    type: 'AUTO',
    keywords: ['CHANGE'],
    trigger: { on: 'PHASE_START', phase: 'CLIMAX', turn: 'YOURS' },
    cost: [{ pay: 'STOCK', count: 1 }, { pay: 'SELF_TO_WAITING_ROOM' }],
    effect: [
      { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { name: nameOf(0, 1) }, min: 1, max: 1 },
      { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'SOURCE_SLOT' },
    ],
  }];

  it('T-KW-009: at the start of the climax phase, pay the cost to replace this character with the named one from the waiting room', () => {
    const start = scenario({ step: 'CLIMAX_START', defs: withAbilities(0, { 0: change }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'BL'));
      put(ctx, card(0, 1), { player: 0, zone: 'waitingRoom' });
      put(ctx, card(0, 20), { player: 0, zone: 'stock' });
    }).state;
    expect(pending(start, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST', card: oid(start, card(0, 0)) });
    const atChoose = answer(start, { kind: 'CONFIRM', accept: true }).state;
    expect(pending(atChoose, 'SELECT_CARDS').cards).toEqual([oid(atChoose, card(0, 1))]);
    const { state } = answer(atChoose, { kind: 'SELECT_CARDS', cards: [oid(atChoose, card(0, 1))] });
    // The new character stands in the slot the old one was in (CR-3.6.3).
    expect(state.zones[0].stage.BL).toEqual([card(0, 1)]);
    expect(getInstance(state, card(0, 1)).orientation).toBe('STAND');
    expect(state.zones[0].waitingRoom).toContain(card(0, 0));
    expect(pending(state, 'CLIMAX').player).toBe(0);
  });

  it('does not trigger in the opponent’s climax phase', () => {
    const state = scenario({ step: 'CLIMAX_START', turnPlayer: 1, defs: withAbilities(0, { 0: change }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'BL'));
      put(ctx, card(0, 1), { player: 0, zone: 'waitingRoom' });
      put(ctx, card(0, 20), { player: 0, zone: 'stock' });
    }).state;
    expect(pending(state, 'CLIMAX').player).toBe(1);
  });
});

describe('大活躍 great performance (CR-10.6)', () => {
  const great: Ability[] = [{ type: 'CONT', keywords: ['GREAT_PERFORMANCE'], greatPerformance: true, apply: [] }];
  const arrange = (slot: 'FC' | 'FL', reversed: boolean) => (ctx: Ctx): void => {
    put(ctx, card(0, 0), stageSlot(0, 'FL'));
    put(ctx, card(0, 1), stageSlot(0, 'FR'));
    const performer = put(ctx, card(1, 0), stageSlot(1, slot));
    if (reversed) getInstance(ctx.state, performer).orientation = 'REVERSE';
    noClimaxes(ctx, 1);
  };
  const defs = withAbilities(1, { 0: great }, (p, i) => (p === 1 && i === 0 ? { power: 5000 } : undefined));

  it('T-KW-007 / CR-10.6.2: every attack becomes a front attack on the character in the front centre', () => {
    const start = scenario({ step: 'ATTACK_START', defs }, arrange('FC', false)).state;
    // Neither attacker faces it (they are on the left and right), yet front attacks on it are the only options.
    expect(pending(start, 'ATTACK').attacks).toEqual([
      { attacker: oid(start, card(0, 0)), type: 'FRONT' },
      { attacker: oid(start, card(0, 1)), type: 'FRONT' },
    ]);
    const atCounter = answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, card(0, 0)), type: 'FRONT' } }).state;
    expect(atCounter.attack).toMatchObject({ type: 'FRONT', attackerSlot: 'FL', defenderSlot: 'FC', defenderObjectId: oid(atCounter, card(1, 0)) });
    const afterBattle = answer(atCounter, { kind: 'COUNTER', card: null }).state;
    // The attacker (1000) lost the battle to it (5000).
    expect(getInstance(afterBattle, card(0, 0)).orientation).toBe('REVERSE');
    expect(pending(afterBattle, 'ATTACK').attacks).toEqual([{ attacker: oid(afterBattle, card(0, 1)), type: 'FRONT' }]);
  });

  it('T-KW-007: it does nothing when reversed, or when not in the front centre', () => {
    const reversed = scenario({ step: 'ATTACK_START', defs }, arrange('FC', true)).state;
    expect(pending(reversed, 'ATTACK').attacks.every((a) => a.type === 'DIRECT')).toBe(true);

    const elsewhere = scenario({ step: 'ATTACK_START', defs }, arrange('FL', false)).state;
    // In the front left it only faces the attacker on player 0's front right.
    expect(pending(elsewhere, 'ATTACK').attacks).toEqual([
      { attacker: oid(elsewhere, card(0, 0)), type: 'DIRECT' },
      { attacker: oid(elsewhere, card(0, 1)), type: 'FRONT' },
      { attacker: oid(elsewhere, card(0, 1)), type: 'SIDE' },
    ]);
  });
});

describe('アラーム alarm (CR-10.1)', () => {
  const alarm: Ability[] = [{
    type: 'CONT',
    keywords: ['ALARM'],
    alarm: true,
    condition: { if: 'LEVEL', min: 1 },
    apply: [{ target: { who: 'ALL_YOURS' }, stat: 'POWER', amount: 500 }],
  }];
  const defs = withAbilities(0, { 0: alarm });
  const power = (arrange: (ctx: Ctx) => void): number =>
    getPower(scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 5), stageSlot(0, 'FC'));
      arrange(ctx);
    }).state, card(0, 5));

  it('T-KW-001 / CR-10.1.1: works while the card is the top card of the clock and its condition holds', () => {
    expect(power((ctx) => {
      put(ctx, card(0, 30), { player: 0, zone: 'level' });
      put(ctx, card(0, 10), { player: 0, zone: 'clock' });
      put(ctx, card(0, 0), { player: 0, zone: 'clock' });
    })).toBe(1500);
  });

  it('T-KW-001: not when another card is above it, not without its condition, and not from the stage', () => {
    expect(power((ctx) => {
      put(ctx, card(0, 30), { player: 0, zone: 'level' });
      put(ctx, card(0, 0), { player: 0, zone: 'clock' });
      put(ctx, card(0, 10), { player: 0, zone: 'clock' });
    })).toBe(1000);
    expect(power((ctx) => {
      put(ctx, card(0, 0), { player: 0, zone: 'clock' });
    })).toBe(1000);
    expect(power((ctx) => {
      put(ctx, card(0, 30), { player: 0, zone: 'level' });
      put(ctx, card(0, 0), stageSlot(0, 'BL'));
    })).toBe(1000);
  });
});

describe('triggers at the beginning of a step (CR-7)', () => {
  const drawAt = (step: 'ENCORE' | 'BATTLE'): Ability[] => [
    { type: 'AUTO', trigger: { on: 'STEP_START', step, turn: 'YOURS' }, effect: [{ do: 'DRAW', count: 1 }] },
  ];

  it('T-ATK-020 / CR-7.7.1.1: あなたのアンコールステップの始めに triggers once per attack phase', () => {
    const { state, events } = scenario({ step: 'ATTACK_START', defs: withAbilities(0, { 0: drawAt('ENCORE') }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'BL'));
    });
    expect(events.filter((e) => e.type === 'ABILITY_PLAYED')).toHaveLength(1);
    expect(state.zones[0].hand).toEqual([card(0, 49)]);
  });

  it('あなたの…: it does not trigger in the opponent’s turn', () => {
    const { state, events } = scenario({ step: 'ATTACK_START', turnPlayer: 1, defs: withAbilities(0, { 0: drawAt('ENCORE') }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'BL'));
    });
    expect(events.some((e) => e.type === 'ABILITY_PLAYED')).toBe(false);
    // Player 0's only card is the ordinary draw of the turn that followed.
    expect(state.turn).toMatchObject({ player: 0 });
    expect(state.zones[0].hand).toHaveLength(1);
  });

  it('CR-7.5.1.3: the battle step exists only for a front attack', () => {
    const plays = (type: 'FRONT' | 'SIDE'): number => {
      const start = scenario({ step: 'ATTACK_START', defs: withAbilities(0, { 5: drawAt('BATTLE') }) }, (ctx) => {
        put(ctx, card(0, 5), stageSlot(0, 'BL'));
        put(ctx, card(0, 0), stageSlot(0, 'FC'));
        put(ctx, card(1, 0), stageSlot(1, 'FC'));
        noClimaxes(ctx, 1);
      }).state;
      let result = answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, card(0, 0)), type } });
      const events = [...result.events];
      if (result.state.pending?.kind === 'COUNTER') {
        result = answer(result.state, { kind: 'COUNTER', card: null });
        events.push(...result.events);
      }
      return events.filter((e) => e.type === 'ABILITY_PLAYED').length;
    };
    expect(plays('FRONT')).toBe(1);
    expect(plays('SIDE')).toBe(0);
  });
});

describe('…1枚につき amounts', () => {
  it('他のあなたの《音楽》のキャラ1枚につき、このカードのパワーを＋500', () => {
    const defs = withAbilities(
      0,
      { 0: [{ type: 'CONT', apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: 500, per: { other: true, filter: { traits: ['音楽'] } } }] }] },
      (p, i) => (p === 0 && i <= 2 ? { traits: ['音楽'] } : undefined),
    );
    const state: GameState = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), stageSlot(0, 'FL'));
      put(ctx, card(0, 2), stageSlot(0, 'BL'));
      put(ctx, card(0, 5), stageSlot(0, 'BR'));
    }).state;
    // Two other characters with the trait; itself and the one without it do not count.
    expect(getPower(state, card(0, 0))).toBe(2000);
  });

  it('このカードがアタックした時、そのターン中、あなたのキャラ1枚につき、このカードのパワーを＋1000 is fixed when it resolves', () => {
    const defs = withAbilities(0, { 0: [{ type: 'AUTO', trigger: { on: 'ATTACKS' }, effect: [{ do: 'MODIFY', target: { who: 'SELF' }, stat: 'POWER', amount: 1000, per: {} }] }] });
    const start = scenario({ step: 'ATTACK_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), stageSlot(0, 'BL'));
      put(ctx, card(0, 2), stageSlot(0, 'BR'));
      for (let i = 0; i < 6; i++) put(ctx, card(1, i), { player: 1, zone: 'clock' });
      noClimaxes(ctx, 1);
    }).state;
    // Stop inside the attack (the damage causes a level up) to read the power.
    const during = answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, card(0, 0)), type: 'DIRECT' } }).state;
    expect(during.pending?.kind).toBe('LEVEL_UP');
    expect(getPower(during, card(0, 0))).toBe(4000);
  });
});
