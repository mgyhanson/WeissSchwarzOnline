/**
 * Card abilities. The abilities here are attached to synthetic test cards;
 * each one is written the way a real card's text would be encoded, and the
 * wording it stands for is given in the test name or a comment.
 */

import { describe, expect, it } from 'vitest';
import {
  type Ability,
  type CardDef,
  type CardMovedEvent,
  type Ctx,
  type Effect,
  type GameEvent,
  type GameState,
  type PlayerId,
  assertInvariants,
  backup,
  evalCondition,
  getCardLevel,
  getInstance,
  getPlayerView,
  getPower,
  getSoul,
  moveCards,
  redactEvent,
  stageSlot,
  submitChoice,
} from '../src/index';
import { type DefOverride, EVENT, answer, card, oid, pending, put, scenario, testCardId } from './helpers';

/** Gives ability lists to player 0's cards by deck position; other overrides can be merged in. */
function withAbilities(map: Record<number, Ability[]>, extra?: DefOverride): DefOverride {
  return (p, i) => {
    const base = extra?.(p, i);
    return p === 0 && map[i] ? { ...base, abilities: map[i] } : base;
  };
}

function eventCard(effect: Effect[], extra?: Partial<CardDef>): Partial<CardDef> {
  return { ...EVENT, ...extra, effect };
}

function noClimaxes(ctx: Ctx, player: PlayerId): void {
  moveCards(ctx, [42, 43, 44, 45, 46, 47, 48, 49].map((i) => card(player, i)), { player, zone: 'memory' });
}

const moves = (events: GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'CARD_MOVED' ? [`${e.reason}:${e.from.zone}>${e.to.zone}`] : []));

function mainAction(state: GameState, action: Parameters<typeof answer>[1] extends infer C ? (C extends { kind: 'MAIN'; action: infer A } ? A : never) : never) {
  return answer(state, { kind: 'MAIN', action });
}

describe('T-ABL-010 / CR-8.1.1: continuous abilities (CR-8.9)', () => {
  it('T-KW-004 / CR-10.3.2: 応援 このカードの前のあなたのキャラすべてに、パワーを＋500 works only from the back row', () => {
    const defs = withAbilities({ 1: [{ type: 'CONT', keywords: ['ASSIST'], assist: true, apply: [{ target: { who: 'IN_FRONT' }, stat: 'POWER', amount: 500 }] }] });
    const start = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 1), stageSlot(0, 'BL'));
      put(ctx, card(0, 2), stageSlot(0, 'FL'));
      put(ctx, card(0, 3), stageSlot(0, 'FC'));
      put(ctx, card(0, 4), stageSlot(0, 'FR'));
    }).state;
    // T-ZONE-043 / CR-3.6.5: back-left is behind front-left and front-centre only.
    expect([2, 3, 4].map((i) => getPower(start, card(0, i)))).toEqual([1500, 1500, 1000]);
    expect(getPower(start, card(0, 1))).toBe(1000);

    // Moved to the other back slot, it supports the centre and the right instead.
    const moved = mainAction(start, { type: 'SWAP', a: 'BL', b: 'BR' }).state;
    expect([2, 3, 4].map((i) => getPower(moved, card(0, i)))).toEqual([1000, 1500, 1500]);

    // In the front row the ability is not active at all.
    const inFront = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 1), stageSlot(0, 'FC'));
      put(ctx, card(0, 2), stageSlot(0, 'FL'));
    }).state;
    expect(getPower(inFront, card(0, 2))).toBe(1000);
  });

  it('他のあなたの《音楽》のキャラが2枚以上なら、このカードのパワーを＋1000', () => {
    const defs = withAbilities(
      { 0: [{ type: 'CONT', condition: { if: 'CHARACTERS', min: 2, other: true, filter: { traits: ['音楽'] } }, apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: 1000 }] }] },
      (p, i) => (p === 0 && i <= 2 ? { traits: ['音楽'] } : undefined),
    );
    const one = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FL'));
      put(ctx, card(0, 1), stageSlot(0, 'FC'));
      put(ctx, card(0, 5), stageSlot(0, 'FR'));
    }).state;
    // Itself does not count ("other"), and card 5 lacks the trait.
    expect(getPower(one, card(0, 0))).toBe(1000);

    const two = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FL'));
      put(ctx, card(0, 1), stageSlot(0, 'FC'));
      put(ctx, card(0, 2), stageSlot(0, 'FR'));
    }).state;
    expect(getPower(two, card(0, 0))).toBe(2000);
  });

  it('あなたのターン中、このカードのパワーを＋1500 depends on whose turn it is', () => {
    const defs = withAbilities({ 0: [{ type: 'CONT', condition: { if: 'YOUR_TURN' }, apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: 1500 }] }] });
    const arrange = (ctx: Ctx): void => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
    };
    expect(getPower(scenario({ step: 'MAIN_START', defs, turnPlayer: 0 }, arrange).state, card(0, 0))).toBe(2500);
    expect(getPower(scenario({ step: 'MAIN_START', defs, turnPlayer: 1 }, arrange).state, card(0, 0))).toBe(1000);
  });

  it('a climax with あなたのキャラすべてに、パワーを＋1000し、ソウルを＋1 works while it is in the climax zone', () => {
    const defs = withAbilities(
      { 45: [{ type: 'CONT', apply: [{ target: { who: 'ALL_YOURS' }, stat: 'POWER', amount: 1000 }, { target: { who: 'ALL_YOURS' }, stat: 'SOUL', amount: 1 }] }] },
      (p, i) => (p === 1 && i === 0 ? { power: 1500 } : undefined),
    );
    const start = scenario({ step: 'CLIMAX_START', defs }, (ctx) => {
      put(ctx, card(0, 45), { player: 0, zone: 'hand' });
      put(ctx, card(0, 10), { player: 0, zone: 'clock' });
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(1, 0), stageSlot(1, 'FC'));
      noClimaxes(ctx, 1);
    }).state;
    expect(getPower(start, card(0, 0))).toBe(1000);

    const atAttack = answer(start, { kind: 'CLIMAX', card: oid(start, card(0, 45)) }).state;
    expect(getPower(atAttack, card(0, 0))).toBe(2000);
    expect(getSoul(atAttack, card(0, 0))).toBe(2);
    // The opponent's characters are not affected.
    expect(getPower(atAttack, card(1, 0))).toBe(1500);

    const atCounter = answer(atAttack, { kind: 'ATTACK', attack: { attacker: oid(atAttack, card(0, 0)), type: 'FRONT' } }).state;
    const { state, events } = answer(atCounter, { kind: 'COUNTER', card: null });
    // Soul 2 was dealt, and 2000 beat 1500.
    expect(events.find((e) => e.type === 'DAMAGE_DEALT')).toMatchObject({ amount: 2, cancelled: false });
    expect(state.zones[1].waitingRoom).toContain(card(1, 0));
    // The climax left at the end of the turn, and the bonus with it.
    expect(state.zones[0].climax).toEqual([]);
    expect(getPower(state, card(0, 0))).toBe(1000);
  });

  it('T-CONT-001 / CR-8.9.1.2 and 8.9.1.3: changes to level are applied before changes to power', () => {
    const defs = withAbilities({
      1: [{ type: 'CONT', apply: [{ target: { who: 'ALL_YOURS' }, stat: 'LEVEL', amount: 1 }] }],
      2: [{ type: 'CONT', apply: [{ target: { who: 'ALL_YOURS', filter: { levelMin: 1 } }, stat: 'POWER', amount: 1000 }] }],
    });
    const both = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 1), stageSlot(0, 'BL'));
      put(ctx, card(0, 2), stageSlot(0, 'BR'));
      put(ctx, card(0, 3), stageSlot(0, 'FC'));
    }).state;
    // The level 0 character counts as level 1 for the power effect.
    expect(getCardLevel(both, card(0, 3))).toBe(1);
    expect(getPower(both, card(0, 3))).toBe(2000);

    const withoutLevel = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 2), stageSlot(0, 'BR'));
      put(ctx, card(0, 3), stageSlot(0, 'FC'));
    }).state;
    expect(getPower(withoutLevel, card(0, 3))).toBe(1000);
  });

  it('T-CHK-001 / CR-8.5.1.1: rule actions are repeated when the first round causes more', () => {
    // A supporter with power 0 is removed (CR-9.5.1). Without its +500 the
    // character it supported also has power 0, and is removed in a second round.
    const defs = withAbilities(
      { 1: [{ type: 'CONT', assist: true, apply: [{ target: { who: 'IN_FRONT' }, stat: 'POWER', amount: 500 }] }] },
      (p, i) => (p === 0 && i <= 1 ? { power: 0 } : undefined),
    );
    const { state, events } = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FL'));
      put(ctx, card(0, 1), stageSlot(0, 'BL'));
    });
    const removals = events.filter((e): e is CardMovedEvent => e.type === 'CARD_MOVED' && e.reason === 'RULE_ACTION');
    expect(removals.map((e) => e.instanceId)).toEqual([card(0, 1), card(0, 0)]);
    expect(removals[0]!.batch).not.toBe(removals[1]!.batch);
    expect(state.zones[0].stage.FL).toEqual([]);
    assertInvariants(state, { settled: true });
  });
});

describe('T-ABL-010: automatic abilities of cards (CR-8.7)', () => {
  const drawOnPlay = (fromHand: boolean): Ability[] => [
    { type: 'AUTO', trigger: fromHand ? { on: 'PLACED_ON_STAGE', from: 'HAND' } : { on: 'PLACED_ON_STAGE' }, effect: [{ do: 'DRAW', count: 1 }] },
  ];

  it('このカードが手札から舞台に置かれた時、あなたは1枚引く', () => {
    const start = scenario({ step: 'MAIN_START', defs: withAbilities({ 0: drawOnPlay(true) }) }, (ctx) => {
      put(ctx, card(0, 0), { player: 0, zone: 'hand' });
    }).state;
    const { state, events } = mainAction(start, { type: 'PLAY_CHARACTER', card: oid(start, card(0, 0)), slot: 'FC' });
    expect(state.zones[0].hand).toEqual([card(0, 49)]);
    expect(events.find((e) => e.type === 'ABILITY_PLAYED')).toMatchObject({ player: 0, cardId: testCardId(0, 0), ability: 0 });
    // T-CHK-002: the ability was resolved in the check timing before the next play timing.
    expect(pending(state, 'MAIN').player).toBe(0);
  });

  it('"from hand" does not trigger when the character comes back by encore; without it, it does', () => {
    const arrange = (ctx: Ctx): void => {
      put(ctx, card(0, 5), { player: 0, zone: 'hand' });
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      for (let i = 0; i < 3; i++) put(ctx, card(0, 20 + i), { player: 0, zone: 'stock' });
    };
    const run = (fromHand: boolean): GameState => {
      const start = scenario({ step: 'MAIN_START', defs: withAbilities({ 0: drawOnPlay(fromHand) }) }, arrange).state;
      const atEncore = mainAction(start, { type: 'PLAY_CHARACTER', card: oid(start, card(0, 5)), slot: 'FC' }).state;
      let state = answer(atEncore, { kind: 'CONFIRM', accept: true }).state;
      // If the returning character's ability triggered, it waits together with
      // the encore of the character it displaced: play the card ability first.
      if (state.pending?.kind === 'CHOOSE_ABILITY') {
        const own = state.pending.abilities.find((a) => a.type === 'CARD')!;
        state = answer(state, { kind: 'CHOOSE_ABILITY', id: own.id }).state;
      }
      return state;
    };
    expect(run(true).zones[0].hand).toEqual([]);
    expect(run(false).zones[0].hand).toEqual([card(0, 49)]);
  });

  describe('【自】［(1)］ このカードが手札から舞台に置かれた時、あなたはコストを払ってよい。そうしたら、あなたは自分の控え室のキャラを1枚選び、手札に戻す', () => {
    const defs = withAbilities({
      0: [{
        type: 'AUTO',
        trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' },
        cost: [{ pay: 'STOCK', count: 1 }],
        effect: [
          { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { kind: 'CHARACTER' }, min: 1, max: 1 },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
        ],
      }],
    });
    const play = (stock: number): GameState => {
      const start = scenario({ step: 'MAIN_START', defs }, (ctx) => {
        put(ctx, card(0, 0), { player: 0, zone: 'hand' });
        put(ctx, card(0, 1), { player: 0, zone: 'waitingRoom' });
        put(ctx, card(0, 46), { player: 0, zone: 'waitingRoom' });
        for (let i = 0; i < stock; i++) put(ctx, card(0, 20 + i), { player: 0, zone: 'stock' });
      }).state;
      return mainAction(start, { type: 'PLAY_CHARACTER', card: oid(start, card(0, 0)), slot: 'FC' }).state;
    };

    it('T-ABL-011 / CR-8.1.1.2.2: the player is asked whether to pay; paying then performs the effect', () => {
      const atConfirm = play(1);
      expect(pending(atConfirm, 'CONFIRM')).toMatchObject({ player: 0, prompt: 'PAY_COST', ability: 0, card: oid(atConfirm, card(0, 0)) });

      const atChoose = answer(atConfirm, { kind: 'CONFIRM', accept: true }).state;
      const choose = pending(atChoose, 'SELECT_CARDS');
      // The cost is already paid. The characters in the waiting room can be
      // chosen, which now includes the card just paid from the stock; the climax cannot.
      expect(atChoose.zones[0].stock).toEqual([]);
      expect(choose).toMatchObject({ prompt: 'EFFECT_CHOOSE', min: 1, max: 1 });
      expect([...choose.cards].sort()).toEqual([oid(atChoose, card(0, 1)), oid(atChoose, card(0, 20))].sort());
      // T-PLAY-008 / CR-8.6.3.1: "choose 1" cannot be answered with none.
      expect(submitChoice(atChoose, { player: 0, decisionId: choose.id, choice: { kind: 'SELECT_CARDS', cards: [] } })).toMatchObject({ ok: false });

      const { state } = answer(atChoose, { kind: 'SELECT_CARDS', cards: [oid(atChoose, card(0, 1))] });
      expect(state.zones[0].hand).toEqual([card(0, 1)]);
      expect([...state.zones[0].waitingRoom].sort((a, b) => a - b)).toEqual([card(0, 20), card(0, 46)]);
    });

    it('declining pays nothing and does nothing', () => {
      const { state } = answer(play(1), { kind: 'CONFIRM', accept: false });
      expect(state.zones[0].stock).toHaveLength(1);
      expect(state.zones[0].hand).toEqual([]);
    });

    it('T-COST-002 / CR-8.4.2.2: without the stock to pay, the question is not asked', () => {
      const state = play(0);
      expect(pending(state, 'MAIN').player).toBe(0);
      expect(state.zones[0].hand).toEqual([]);
    });
  });

  describe('CX combo: このカードがアタックした時、クライマックス置場に「…」があるなら、そのターン中、このカードのパワーを＋3000', () => {
    const defs = withAbilities(
      { 0: [{ type: 'AUTO', keywords: ['CX_COMBO'], trigger: { on: 'ATTACKS' }, condition: { if: 'CLIMAX_IN_PLAY', name: `Test climax ${testCardId(0, 45)}` }, effect: [{ do: 'MODIFY', target: { who: 'SELF' }, stat: 'POWER', amount: 3000 }] }] },
      (p, i) => (p === 1 && i === 0 ? { power: 3500 } : undefined),
    );
    const fight = (climax: number | null): GameState => {
      const start = scenario({ step: 'ATTACK_START', defs }, (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, 'FC'));
        put(ctx, card(1, 0), stageSlot(1, 'FC'));
        if (climax !== null) put(ctx, card(0, climax), { player: 0, zone: 'climax' });
        noClimaxes(ctx, 1);
      }).state;
      const atCounter = answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, card(0, 0)), type: 'FRONT' } }).state;
      return answer(atCounter, { kind: 'COUNTER', card: null }).state;
    };

    it('with the named climax in the climax zone the attacker wins the battle', () => {
      const state = fight(45);
      expect(state.zones[1].waitingRoom).toContain(card(1, 0));
      expect(state.zones[0].stage.FC).toEqual([card(0, 0)]);
    });

    it('T-ABL-020 / CR-8.12.1: with another climax, or none, the condition fails and the attacker loses; the CX combo label itself does nothing', () => {
      for (const climax of [46, null]) {
        const state = fight(climax);
        expect(state.zones[0].waitingRoom).toContain(card(0, 0));
        expect(state.zones[1].stage.FC).toEqual([card(1, 0)]);
      }
    });
  });

  it('このカードのバトル相手が【リバース】した時、あなたは1枚引く', () => {
    const defs = withAbilities({ 0: [{ type: 'AUTO', trigger: { on: 'BATTLE_OPPONENT_REVERSED' }, effect: [{ do: 'DRAW', count: 1 }] }] }, (p, i) => (p === 0 && i === 0 ? { power: 2000 } : undefined));
    const start = scenario({ step: 'ATTACK_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(1, 0), stageSlot(1, 'FC'));
      noClimaxes(ctx, 1);
    }).state;
    const atCounter = answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, card(0, 0)), type: 'FRONT' } }).state;
    const { state } = answer(atCounter, { kind: 'COUNTER', card: null });
    // Card 49 went to the stock by the trigger check; the ability drew card 48.
    expect(state.zones[0].hand).toEqual([card(0, 48)]);
  });

  it('T-LKI-002 / CR-8.11.2: このカードが【リバース】した時、このカードのバトル相手を【リバース】する', () => {
    const defs: DefOverride = (p, i) => {
      if (i !== 0) return undefined;
      return p === 0
        ? { power: 2000 }
        : { abilities: [{ type: 'AUTO', trigger: { on: 'REVERSED' }, effect: [{ do: 'ORIENT', target: { who: 'BATTLE_OPPONENT' }, to: 'REVERSE' }] }] };
    };
    const start = scenario({ step: 'ATTACK_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(1, 0), stageSlot(1, 'FC'));
      noClimaxes(ctx, 1);
    }).state;
    const atCounter = answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, card(0, 0)), type: 'FRONT' } }).state;
    const { state } = answer(atCounter, { kind: 'COUNTER', card: null });
    // The defender lost the battle; its ability took the winner down with it.
    expect(state.zones[0].waitingRoom).toContain(card(0, 0));
    expect(state.zones[1].waitingRoom).toContain(card(1, 0));
  });

  it('あなたのドローフェイズの始めに、あなたは1枚引く triggers in its master’s draw phase only', () => {
    const defs = withAbilities({ 0: [{ type: 'AUTO', trigger: { on: 'PHASE_START', phase: 'DRAW', turn: 'YOURS' }, effect: [{ do: 'DRAW', count: 1 }] }] });
    const arrange = (ctx: Ctx): void => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
    };
    // Own turn: the ability's card plus the normal draw.
    expect(scenario({ step: 'DRAW_START', defs, turnPlayer: 0 }, arrange).state.zones[0].hand).toHaveLength(2);
    // Opponent's turn: nothing for player 0.
    expect(scenario({ step: 'DRAW_START', defs, turnPlayer: 1 }, arrange).state.zones[0].hand).toHaveLength(0);
  });

  it('T-TURN-009 / CR-6.8.1.1: an end-of-turn ability triggers once, although the end phase is then performed again', () => {
    const defs = withAbilities({ 0: [{ type: 'AUTO', trigger: { on: 'PHASE_START', phase: 'END', turn: 'YOURS' }, effect: [{ do: 'DRAW', count: 1 }] }] });
    const { state, events } = scenario({ step: 'END_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
    });
    expect(events.filter((e) => e.type === 'ABILITY_PLAYED')).toHaveLength(1);
    expect(state.zones[0].hand).toEqual([card(0, 49)]);
    expect(state.turn).toMatchObject({ player: 1 });
  });

  it('T-AUTO-002 / CR-8.7.3.1: two card abilities waiting together are played in the order their master chooses', () => {
    const draw: Ability[] = [{ type: 'AUTO', trigger: { on: 'PHASE_START', phase: 'MAIN', turn: 'YOURS' }, effect: [{ do: 'DRAW', count: 1 }] }];
    const start = scenario({ step: 'MAIN_START', defs: withAbilities({ 0: draw, 1: draw }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FL'));
      put(ctx, card(0, 1), stageSlot(0, 'FR'));
    }).state;
    const decision = pending(start, 'CHOOSE_ABILITY');
    expect(decision.abilities).toEqual([
      { id: decision.abilities[0]!.id, type: 'CARD', ability: 0, card: oid(start, card(0, 0)) },
      { id: decision.abilities[1]!.id, type: 'CARD', ability: 0, card: oid(start, card(0, 1)) },
    ]);
    const { state, events } = answer(start, { kind: 'CHOOSE_ABILITY', id: decision.abilities[1]!.id });
    expect(events.flatMap((e) => (e.type === 'ABILITY_PLAYED' ? [e.cardId] : []))).toEqual([testCardId(0, 1), testCardId(0, 0)]);
    expect(state.zones[0].hand).toHaveLength(2);
  });

  it('…してよい: an optional ability without a cost asks first', () => {
    const defs = withAbilities({ 0: [{ type: 'AUTO', trigger: { on: 'PLACED_ON_STAGE' }, optional: true, effect: [{ do: 'DECK_TOP', count: 1, to: 'STOCK' }] }] });
    const start = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), { player: 0, zone: 'hand' });
    }).state;
    const atConfirm = mainAction(start, { type: 'PLAY_CHARACTER', card: oid(start, card(0, 0)), slot: 'FC' }).state;
    expect(pending(atConfirm, 'CONFIRM').prompt).toBe('USE_ABILITY');
    expect(answer(atConfirm, { kind: 'CONFIRM', accept: true }).state.zones[0].stock).toEqual([card(0, 49)]);
    expect(answer(atConfirm, { kind: 'CONFIRM', accept: false }).state.zones[0].stock).toEqual([]);
  });
});

describe('T-ABL-010: activated abilities (CR-8.1.1.1, CR-6.5.1.2.3)', () => {
  it('T-COST-001 / CR-8.4.2.1: 【起】［(1) このカードを【レスト】する］ あなたは1枚引く pays its cost in the order written', () => {
    const defs = withAbilities({ 0: [{ type: 'ACT', timing: 'MAIN', cost: [{ pay: 'STOCK', count: 1 }, { pay: 'REST_SELF' }], effect: [{ do: 'DRAW', count: 1 }] }] });
    const start = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 20), { player: 0, zone: 'stock' });
    }).state;
    const action = { type: 'ACTIVATE' as const, card: oid(start, card(0, 0)), ability: 0 };
    expect(pending(start, 'MAIN').actions).toContainEqual(action);

    const { state, events } = mainAction(start, action);
    // T-COST-001 / CR-8.4.2.1: the cost is paid in the order written, then the effect.
    expect(moves(events)).toEqual(['COST:stock>waitingRoom', 'DRAW:deck>hand']);
    expect(events.map((e) => e.type).indexOf('ORIENTATION_CHANGED')).toBeGreaterThan(-1);
    expect(getInstance(state, card(0, 0)).orientation).toBe('REST');
    expect(state.zones[0].hand).toEqual([card(0, 49)]);
    // Rested and out of stock: it cannot be played again.
    expect(pending(state, 'MAIN').actions.some((a) => a.type === 'ACTIVATE')).toBe(false);
  });

  it('is not offered when its cost cannot be paid in full', () => {
    const defs = withAbilities({ 0: [{ type: 'ACT', timing: 'MAIN', cost: [{ pay: 'STOCK', count: 1 }, { pay: 'REST_SELF' }], effect: [{ do: 'DRAW', count: 1 }] }] });
    const noStock = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
    }).state;
    expect(pending(noStock, 'MAIN').actions.some((a) => a.type === 'ACTIVATE')).toBe(false);
  });

  it('T-KW-020 / CR-10.19.3: ターン1回: after one use it cannot be played again that turn', () => {
    const defs = withAbilities({ 0: [{ type: 'ACT', timing: 'MAIN', cost: [], limit: 1, effect: [{ do: 'DRAW', count: 1 }] }] });
    const start = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
    }).state;
    const used = mainAction(start, { type: 'ACTIVATE', card: oid(start, card(0, 0)), ability: 0 }).state;
    expect(used.zones[0].hand).toHaveLength(1);
    expect(pending(used, 'MAIN').actions.some((a) => a.type === 'ACTIVATE')).toBe(false);

    // The count is forgotten at the end of the turn.
    let state = mainAction(used, { type: 'PASS' }).state;
    state = answer(state, { kind: 'CLIMAX', card: null }).state;
    state = answer(state, { kind: 'ATTACK', attack: null }).state;
    expect(state.turn).toMatchObject({ player: 1 });
    expect(state.abilityUses).toEqual({});
  });

  it('T-KW-008 / CR-10.7.3: 集中: turn over four cards, discard them, draw one per climax among them', () => {
    const defs = withAbilities({
      0: [{ type: 'ACT', keywords: ['BRAINSTORM'], timing: 'MAIN', cost: [{ pay: 'REST_SELF' }], effect: [{ do: 'BRAINSTORM', count: 4, per: { kind: 'CLIMAX' }, each: [{ do: 'DRAW', count: 1 }] }] }],
    });
    const arrange = (ctx: Ctx): void => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
    };
    // The top four cards of the unshuffled test deck are climaxes.
    const allHits = scenario({ step: 'MAIN_START', defs }, arrange).state;
    const hit = mainAction(allHits, { type: 'ACTIVATE', card: oid(allHits, card(0, 0)), ability: 0 });
    expect(moves(hit.events).slice(0, 8)).toEqual([...Array(4).fill('EFFECT:deck>resolution'), ...Array(4).fill('EFFECT:resolution>waitingRoom')]);
    expect(hit.state.zones[0].waitingRoom).toEqual([49, 48, 47, 46].map((i) => card(0, i)));
    expect(hit.state.zones[0].hand).toHaveLength(4);

    const noHits = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      arrange(ctx);
      noClimaxes(ctx, 0);
    }).state;
    const miss = mainAction(noHits, { type: 'ACTIVATE', card: oid(noHits, card(0, 0)), ability: 0 }).state;
    expect(miss.zones[0].waitingRoom).toHaveLength(4);
    expect(miss.zones[0].hand).toHaveLength(0);
  });

  it('［手札のキャラを1枚控え室に置く］: the player chooses which matching hand card to discard', () => {
    const defs = withAbilities({ 0: [{ type: 'ACT', timing: 'MAIN', cost: [{ pay: 'DISCARD', count: 1, filter: { kind: 'CHARACTER' } }], effect: [{ do: 'DRAW', count: 2 }] }] });
    const start = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), { player: 0, zone: 'hand' });
      put(ctx, card(0, 46), { player: 0, zone: 'hand' });
    }).state;
    const atDiscard = mainAction(start, { type: 'ACTIVATE', card: oid(start, card(0, 0)), ability: 0 }).state;
    expect(pending(atDiscard, 'SELECT_CARDS')).toMatchObject({ prompt: 'COST_DISCARD', cards: [oid(atDiscard, card(0, 1))], min: 1, max: 1 });
    const { state } = answer(atDiscard, { kind: 'SELECT_CARDS', cards: [oid(atDiscard, card(0, 1))] });
    expect(state.zones[0].waitingRoom).toEqual([card(0, 1)]);
    expect(state.zones[0].hand).toHaveLength(3);

    // With only a climax in hand the cost cannot be paid.
    const onlyClimax = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 46), { player: 0, zone: 'hand' });
    }).state;
    expect(pending(onlyClimax, 'MAIN').actions.some((a) => a.type === 'ACTIVATE')).toBe(false);
  });

  it('T-REF-003 / CR-9.2.3 and T-LVL-002 / CR-9.3.3: refresh and level up wait until the whole cost is paid (T-KW-013 / CR-10.12: a 加速 cost)', () => {
    // 加速-style cost: the top card of the deck to the clock, then one stock.
    const defs = withAbilities({ 0: [{ type: 'ACT', keywords: ['ACCELERATE'], timing: 'MAIN', cost: [{ pay: 'DECK_TOP_TO_CLOCK' }, { pay: 'STOCK', count: 1 }], effect: [{ do: 'DRAW', count: 1 }] }] });
    const start = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 20), { player: 0, zone: 'stock' });
      for (let i = 0; i < 6; i++) put(ctx, card(0, 10 + i), { player: 0, zone: 'clock' });
      moveCards(ctx, [1, 2, 3, 4, 5].map((i) => card(0, i)), { player: 0, zone: 'waitingRoom' });
      const deck = ctx.state.zones[0].deck;
      moveCards(ctx, deck.slice(0, deck.length - 1), { player: 0, zone: 'memory' });
    }).state;
    const { state, events } = mainAction(start, { type: 'ACTIVATE', card: oid(start, card(0, 0)), ability: 0 });
    // After the first part of the cost the deck was empty and the clock had
    // seven cards, yet the second part was paid before anything else happened.
    expect(moves(events)).toEqual(['COST:deck>clock', 'COST:stock>waitingRoom']);
    expect(events.some((e) => e.type === 'REFRESH' || e.type === 'LEVEL_UP')).toBe(false);
    // Only now are both rule actions due.
    expect(pending(state, 'RULE_ACTION_ORDER').player).toBe(0);
    expect(state.costDepth).toBe(0);
  });
});

describe('backup (CR-10.5)', () => {
  const backupCard = (level: number, stock: number): Partial<CardDef> => ({
    counter: true,
    abilities: [backup(2000, level, [...(stock > 0 ? [{ pay: 'STOCK' as const, count: stock }] : []), { pay: 'SELF_TO_WAITING_ROOM' }])],
  });
  function atCounter(def: Partial<CardDef>, arrange: (ctx: Ctx) => void = () => {}): GameState {
    const defs: DefOverride = (p, i) => (p === 0 && i === 0 ? { power: 2000 } : p === 1 && i === 1 ? def : undefined);
    const start = scenario({ step: 'ATTACK_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(1, 0), stageSlot(1, 'FC'));
      put(ctx, card(1, 1), { player: 1, zone: 'hand' });
      noClimaxes(ctx, 1);
      arrange(ctx);
    }).state;
    return answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, card(0, 0)), type: 'FRONT' } }).state;
  }

  it('T-KW-006 / CR-10.5.2: 助太刀2000 レベル0 ［手札のこのカードを控え室に置く］ gives the attacked character +2000 for the turn', () => {
    const state = atCounter(backupCard(0, 0));
    const decision = pending(state, 'COUNTER');
    expect(decision.cards).toEqual([]);
    expect(decision.backups).toEqual([{ card: oid(state, card(1, 1)), ability: 0 }]);

    const atChoose = answer(state, { kind: 'COUNTER', card: oid(state, card(1, 1)), ability: 0 }).state;
    // The cost is paid: the backup card is in the waiting room.
    expect(atChoose.zones[1].waitingRoom).toEqual([card(1, 1)]);
    const choose = pending(atChoose, 'SELECT_CARDS');
    expect(choose).toMatchObject({ player: 1, cards: [oid(atChoose, card(1, 0))], min: 1, max: 1 });

    const { state: after } = answer(atChoose, { kind: 'SELECT_CARDS', cards: choose.cards });
    // 1000 + 2000 against 2000: the attacker is the one reversed.
    expect(after.zones[0].waitingRoom).toContain(card(0, 0));
    expect(after.zones[1].stage.FC).toEqual([card(1, 0)]);
    // "For the turn": the bonus is gone afterwards.
    expect(getPower(after, card(1, 0))).toBe(1000);
  });

  it('T-KW-006: it needs the level it names', () => {
    expect(pending(atCounter(backupCard(1, 0)), 'COUNTER').backups).toEqual([]);
    const levelOne = atCounter(backupCard(1, 0), (ctx) => {
      put(ctx, card(1, 30), { player: 1, zone: 'level' });
    });
    expect(pending(levelOne, 'COUNTER').backups).toHaveLength(1);
  });

  it('it needs its cost, and the counter icon', () => {
    expect(pending(atCounter(backupCard(0, 1)), 'COUNTER').backups).toEqual([]);
    expect(pending(atCounter({ ...backupCard(0, 0), counter: false }), 'COUNTER').backups).toEqual([]);
  });

  it('rejects a backup that was not offered', () => {
    const state = atCounter(backupCard(1, 0));
    const decision = pending(state, 'COUNTER');
    const result = submitChoice(state, { player: 1, decisionId: decision.id, choice: { kind: 'COUNTER', card: oid(state, card(1, 1)), ability: 0 } });
    expect(result).toMatchObject({ ok: false, code: 'ILLEGAL_CHOICE' });
  });
});

describe('event effects (CR-8.6.2.5.2)', () => {
  function playEvent(effect: Effect[], arrange: (ctx: Ctx) => void = () => {}, extra?: DefOverride) {
    const defs: DefOverride = (p, i) => (p === 0 && i === 0 ? eventCard(effect) : extra?.(p, i));
    const start = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), { player: 0, zone: 'hand' });
      arrange(ctx);
    }).state;
    return mainAction(start, { type: 'PLAY_EVENT', card: oid(start, card(0, 0)) });
  }

  it('あなたは2枚引き、自分の手札を1枚選び、控え室に置く', () => {
    const atChoose = playEvent([
      { do: 'DRAW', count: 2 },
      { do: 'CHOOSE', from: 'YOUR_HAND', min: 1, max: 1 },
      { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'WAITING_ROOM' },
    ]).state;
    // While it resolves the event is in the resolution zone.
    expect(atChoose.zones[0].resolution).toEqual([card(0, 0)]);
    const choose = pending(atChoose, 'SELECT_CARDS');
    expect([...choose.cards].sort()).toEqual([oid(atChoose, card(0, 49)), oid(atChoose, card(0, 48))].sort());

    const { state } = answer(atChoose, { kind: 'SELECT_CARDS', cards: [oid(atChoose, card(0, 49))] });
    expect(state.zones[0].hand).toEqual([card(0, 48)]);
    // The discarded card first, then the event itself once it has resolved.
    expect(state.zones[0].waitingRoom).toEqual([card(0, 49), card(0, 0)]);
    expect(state.zones[0].resolution).toEqual([]);
    assertInvariants(state, { settled: true });
  });

  it('T-PLAY-009 / CR-8.6.3.1.4: search: 自分の山札を見て《音楽》のキャラを1枚まで選んで相手に見せ、手札に加える。その山札をシャッフルする', () => {
    const search: Effect[] = [
      { do: 'CHOOSE', from: 'YOUR_DECK', filter: { kind: 'CHARACTER', traits: ['音楽'] }, min: 1, max: 1 },
      { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND', reveal: true },
      { do: 'SHUFFLE' },
    ];
    const atChoose = playEvent(search, () => {}, (p, i) => (p === 0 && (i === 10 || i === 11) ? { traits: ['音楽'] } : undefined)).state;
    const choose = pending(atChoose, 'SELECT_CARDS');
    expect([...choose.cards].sort()).toEqual([oid(atChoose, card(0, 10)), oid(atChoose, card(0, 11))].sort());
    // T-PLAY-009 / CR-8.6.3.1.4: from a hidden zone the player may always choose fewer.
    expect(choose).toMatchObject({ min: 0, max: 1 });
    // CR-4.8.1: the searching player looks at the whole deck, not only the
    // cards that may be taken; the opponent is shown nothing.
    const deck = atChoose.zones[0].deck;
    expect(Object.keys(choose.look!)).toHaveLength(deck.length);
    expect(choose.look![oid(atChoose, card(0, 10))]).toBe(testCardId(0, 10));
    expect(choose.look![oid(atChoose, card(0, 20))]).toBe(testCardId(0, 20));
    expect(JSON.stringify(getPlayerView(atChoose, 1))).not.toContain(testCardId(0, 10));

    const found = answer(atChoose, { kind: 'SELECT_CARDS', cards: [oid(atChoose, card(0, 10))] });
    expect(found.state.zones[0].hand).toEqual([card(0, 10)]);
    // "Show it to your opponent": the opponent's version of the move names the card.
    const toHand = found.events.find((e): e is CardMovedEvent => e.type === 'CARD_MOVED' && e.to.zone === 'hand')!;
    expect(redactEvent(toHand, 1)).toMatchObject({ card: { cardId: testCardId(0, 10) } });
    expect(found.events.some((e) => e.type === 'DECK_SHUFFLED' && e.player === 0)).toBe(true);

    const nothing = answer(atChoose, { kind: 'SELECT_CARDS', cards: [] });
    expect(nothing.state.zones[0].hand).toEqual([]);
    expect(nothing.events.some((e) => e.type === 'DECK_SHUFFLED')).toBe(true);
  });

  it('T-CONT-002 / CR-8.9.2: あなたのキャラすべてに、そのターン中、パワーを＋1000 does not reach a character played afterwards', () => {
    const { state } = playEvent([{ do: 'MODIFY', target: { who: 'ALL_YOURS' }, stat: 'POWER', amount: 1000 }], (ctx) => {
      put(ctx, card(0, 1), stageSlot(0, 'FL'));
      put(ctx, card(0, 2), { player: 0, zone: 'hand' });
    });
    expect(getPower(state, card(0, 1))).toBe(2000);
    const later = mainAction(state, { type: 'PLAY_CHARACTER', card: oid(state, card(0, 2)), slot: 'FR' }).state;
    expect(getPower(later, card(0, 2))).toBe(1000);
    expect(getPower(later, card(0, 1))).toBe(2000);
  });

  it('相手に1ダメージを与える goes through the damage process and can be cancelled', () => {
    const dealt = playEvent([{ do: 'DAMAGE', amount: 1 }], (ctx) => noClimaxes(ctx, 1));
    expect(dealt.state.zones[1].clock).toEqual([card(1, 41)]);
    expect(dealt.events.find((e) => e.type === 'DAMAGE_DEALT')).toMatchObject({ receiver: 1, amount: 1, cancelled: false, sourceObjectId: null });

    const cancelled = playEvent([{ do: 'DAMAGE', amount: 1 }]);
    expect(cancelled.state.zones[1].clock).toEqual([]);
    expect(cancelled.state.zones[1].waitingRoom).toEqual([card(1, 49)]);
  });

  it('T-PLAY-008 / CR-8.6.3.1: 相手のキャラを1枚選び、【レスト】する: a required choice must be made', () => {
    const atChoose = playEvent(
      [
        { do: 'CHOOSE', from: 'OPPONENT_STAGE', min: 1, max: 1 },
        { do: 'ORIENT', target: { who: 'CHOSEN' }, to: 'REST' },
      ],
      (ctx) => {
        put(ctx, card(1, 0), stageSlot(1, 'FL'));
        put(ctx, card(1, 1), stageSlot(1, 'FR'));
      },
    ).state;
    const choose = pending(atChoose, 'SELECT_CARDS');
    expect(choose).toMatchObject({ min: 1, max: 1 });
    expect(choose.cards).toHaveLength(2);
    const { state } = answer(atChoose, { kind: 'SELECT_CARDS', cards: [oid(atChoose, card(1, 1))] });
    expect(getInstance(state, card(1, 1)).orientation).toBe('REST');
    expect(getInstance(state, card(1, 0)).orientation).toBe('STAND');
  });

  it('CR-8.6.3.1.3: with nothing to choose, the effect that depends on the choice does nothing', () => {
    const { state } = playEvent([
      { do: 'CHOOSE', from: 'OPPONENT_STAGE', min: 1, max: 1 },
      { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
      { do: 'DRAW', count: 1 },
    ]);
    // No question was asked, nothing moved, and the rest of the effect still happened.
    expect(state.zones[0].hand).toEqual([card(0, 49)]);
    expect(pending(state, 'MAIN').player).toBe(0);
  });

  it('…なら: a condition inside an effect chooses between two outcomes', () => {
    const effect: Effect[] = [{ do: 'IF', condition: { if: 'LEVEL', min: 1 }, then: [{ do: 'DRAW', count: 2 }], else: [{ do: 'DRAW', count: 1 }] }];
    expect(playEvent(effect).state.zones[0].hand).toHaveLength(1);
    expect(playEvent(effect, (ctx) => put(ctx, card(0, 30), { player: 0, zone: 'level' })).state.zones[0].hand).toHaveLength(2);
  });
});

describe('conditions on the level zone and memory (CR-10.9, CR-10.10)', () => {
  const defs: DefOverride = (p, i) => (p === 0 && i === 30 ? { level: 2 } : p === 0 && i === 31 ? { level: 1 } : undefined);

  it('T-KW-011 / CR-10.10: 経験 counts the levels of the cards in the level zone; a face-down card has none', () => {
    const state = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 30), { player: 0, zone: 'level' });
      put(ctx, card(0, 31), { player: 0, zone: 'level' }, { face: 'DOWN' });
    }).state;
    expect(evalCondition(state, 0, card(0, 0), { if: 'EXPERIENCE', min: 2 })).toBe(true);
    expect(evalCondition(state, 0, card(0, 0), { if: 'EXPERIENCE', min: 3 })).toBe(false);
    // The player's own level counts both cards (CR-8.6.2.1.2).
    expect(evalCondition(state, 0, card(0, 0), { if: 'LEVEL', min: 2 })).toBe(true);
  });

  it('T-KW-010 / CR-10.9: 記憶 counts matching cards in memory', () => {
    const state = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 1), { player: 0, zone: 'memory' });
      put(ctx, card(0, 46), { player: 0, zone: 'memory' });
    }).state;
    expect(evalCondition(state, 0, card(0, 0), { if: 'MEMORY', min: 2 })).toBe(true);
    expect(evalCondition(state, 0, card(0, 0), { if: 'MEMORY', min: 2, filter: { kind: 'CHARACTER' } })).toBe(false);
    expect(evalCondition(state, 1, card(1, 0), { if: 'MEMORY', min: 1 })).toBe(false);
  });
});

describe('details found missing by deliberately breaking the engine', () => {
  it('T-KW-004 / CR-10.3.2: 応援 is inactive in the front row whatever its effect targets', () => {
    const defs = withAbilities({ 1: [{ type: 'CONT', assist: true, apply: [{ target: { who: 'ALL_YOURS', other: true }, stat: 'POWER', amount: 500 }] }] });
    const back = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 1), stageSlot(0, 'BR'));
      put(ctx, card(0, 2), stageSlot(0, 'FL'));
    }).state;
    expect(getPower(back, card(0, 2))).toBe(1500);
    const front = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 1), stageSlot(0, 'FR'));
      put(ctx, card(0, 2), stageSlot(0, 'FL'));
    }).state;
    expect(getPower(front, card(0, 2))).toBe(1000);
  });

  it('T-KW-006 / CR-10.5.2: backup can only choose the character that is being front attacked', () => {
    const defs: DefOverride = (p, i) =>
      p === 1 && i === 1 ? { counter: true, abilities: [backup(2000, 0, [{ pay: 'SELF_TO_WAITING_ROOM' }])] } : undefined;
    const start = scenario({ step: 'ATTACK_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(1, 0), stageSlot(1, 'FC'));
      put(ctx, card(1, 2), stageSlot(1, 'FL'));
      put(ctx, card(1, 3), stageSlot(1, 'BR'));
      put(ctx, card(1, 1), { player: 1, zone: 'hand' });
      noClimaxes(ctx, 1);
    }).state;
    const atCounter = answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, card(0, 0)), type: 'FRONT' } }).state;
    const atChoose = answer(atCounter, { kind: 'COUNTER', card: oid(atCounter, card(1, 1)), ability: 0 }).state;
    expect(pending(atChoose, 'SELECT_CARDS').cards).toEqual([oid(atChoose, card(1, 0))]);
  });

  it('T-COST-004 / CR-8.4.3: an ability’s stock cost is paid from the top; このカードを【レスト】する cannot be paid by a rested card', () => {
    const defs = withAbilities({ 0: [{ type: 'ACT', timing: 'MAIN', cost: [{ pay: 'STOCK', count: 1 }, { pay: 'REST_SELF' }], effect: [{ do: 'DRAW', count: 1 }] }] });
    const start = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      for (let i = 0; i < 3; i++) put(ctx, card(0, 20 + i), { player: 0, zone: 'stock' });
    }).state;
    const state = mainAction(start, { type: 'ACTIVATE', card: oid(start, card(0, 0)), ability: 0 }).state;
    expect(state.zones[0].stock).toEqual([card(0, 20), card(0, 21)]);
    expect(state.zones[0].waitingRoom).toEqual([card(0, 22)]);
    // Two stock remain, but the card is rested now.
    expect(pending(state, 'MAIN').actions.some((a) => a.type === 'ACTIVATE')).toBe(false);
  });

  it('T-LKI-002 / CR-8.11.2: このカードのバトル相手が【リバース】した時、そのキャラを控え室に置く knows which character that was', () => {
    const defs = withAbilities(
      { 0: [{ type: 'AUTO', trigger: { on: 'BATTLE_OPPONENT_REVERSED' }, effect: [{ do: 'MOVE', target: { who: 'BATTLE_OPPONENT' }, to: 'WAITING_ROOM' }] }] },
      (p, i) => (p === 0 && i === 0 ? { power: 2000 } : undefined),
    );
    const start = scenario({ step: 'ATTACK_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(1, 0), stageSlot(1, 'FC'));
      noClimaxes(ctx, 1);
    }).state;
    const atCounter = answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, card(0, 0)), type: 'FRONT' } }).state;
    const { events } = answer(atCounter, { kind: 'COUNTER', card: null });
    // The defender was removed by the effect, not later by the encore step.
    const removal = events.find((e): e is CardMovedEvent => e.type === 'CARD_MOVED' && e.instanceId === card(1, 0) && e.to.zone === 'waitingRoom');
    expect(removal?.reason).toBe('EFFECT');
  });
});

describe('rules that had no test of their own until the STEP 5 coverage check', () => {
  it('T-CARD-002 / CR-2.3.2.1.2: "キャラ" with no zone named means characters on the stage', () => {
    const defs = withAbilities({ 0: [{ type: 'CONT', condition: { if: 'CHARACTERS', min: 2, other: true }, apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: 1000 }] }] });
    const elsewhere = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), stageSlot(0, 'FL'));
      for (const i of [2, 3, 4]) put(ctx, card(0, i), { player: 0, zone: 'hand' });
      for (const i of [5, 6, 7]) put(ctx, card(0, i), { player: 0, zone: 'waitingRoom' });
    }).state;
    // Characters in hand or the waiting room do not count: only one other on the stage.
    expect(getPower(elsewhere, card(0, 0))).toBe(1000);
    const onStage = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), stageSlot(0, 'FL'));
      put(ctx, card(0, 2), stageSlot(0, 'FR'));
    }).state;
    expect(getPower(onStage, card(0, 0))).toBe(2000);
  });

  it('T-CARD-004 / CR-2.12.2: character text works on the stage only, climax text in the climax zone only', () => {
    const boost: Ability[] = [{ type: 'CONT', apply: [{ target: { who: 'ALL_YOURS', other: true }, stat: 'POWER', amount: 500 }] }];
    const drawAtMain: Ability[] = [{ type: 'AUTO', trigger: { on: 'PHASE_START', phase: 'MAIN', turn: 'YOURS' }, effect: [{ do: 'DRAW', count: 1 }] }];
    const defs = withAbilities({ 1: boost, 2: drawAtMain, 45: [{ type: 'CONT', apply: [{ target: { who: 'ALL_YOURS' }, stat: 'POWER', amount: 1000 }] }] });
    const { state, events } = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), { player: 0, zone: 'hand' });
      put(ctx, card(0, 2), { player: 0, zone: 'waitingRoom' });
      put(ctx, card(0, 45), { player: 0, zone: 'clock' });
    });
    // Nothing applies or triggers from hand, waiting room or clock.
    expect(getPower(state, card(0, 0))).toBe(1000);
    expect(events.some((e) => e.type === 'ABILITY_PLAYED')).toBe(false);

    const placed = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), stageSlot(0, 'BL'));
      put(ctx, card(0, 2), stageSlot(0, 'BR'));
      put(ctx, card(0, 45), { player: 0, zone: 'climax' });
    });
    expect(getPower(placed.state, card(0, 0))).toBe(2500);
    expect(placed.events.filter((e) => e.type === 'ABILITY_PLAYED')).toHaveLength(1);
  });

  it('T-ATK-022 / CR-7.7.1.4: a character reversed during the encore step is removed in the same step', () => {
    // このカードが舞台から控え室に置かれた時、あなたのキャラすべてを【リバース】する
    const defs = withAbilities(
      { 0: [{ type: 'AUTO', trigger: { on: 'STAGE_TO_WAITING_ROOM' }, effect: [{ do: 'ORIENT', target: { who: 'ALL_YOURS' }, to: 'REVERSE' }] }] },
      (p, i) => (p === 1 && i === 0 ? { power: 9000 } : undefined),
    );
    const start = scenario({ step: 'ATTACK_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), stageSlot(0, 'BL'));
      put(ctx, card(1, 0), stageSlot(1, 'FC'));
      noClimaxes(ctx, 1);
    }).state;
    const atCounter = answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, card(0, 0)), type: 'FRONT' } }).state;
    let { state, events } = answer(atCounter, { kind: 'COUNTER', card: null });
    const all = [...events];
    if (state.pending?.kind === 'CHOOSE_ABILITY') {
      const own = state.pending.abilities.find((a) => a.type === 'CARD')!;
      ({ state, events } = answer(state, { kind: 'CHOOSE_ABILITY', id: own.id }));
      all.push(...events);
    }
    // The attacker lost the battle and left in the encore step; its ability
    // reversed the back-row character, which then also left in that step.
    const removed = all.flatMap((e) => (e.type === 'CARD_MOVED' && e.reason === 'ENCORE_STEP' ? [e.instanceId] : []));
    expect(removed).toEqual([card(0, 0), card(0, 1)]);
    expect(state.zones[0].stage.BL).toEqual([]);
    expect(state.turn).toMatchObject({ player: 1 });
    assertInvariants(state, { settled: true });
  });
});
