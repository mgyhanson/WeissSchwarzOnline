/**
 * The building blocks added for the third batch of real cards (BDY/W135).
 * As in abilities.test.ts the cards are synthetic; each ability is written
 * the way the card text it stands for would be encoded, and that wording is
 * given in the test name.
 */

import { describe, expect, it } from 'vitest';
import {
  type Ability,
  type CardDef,
  type Ctx,
  type Effect,
  type GameEvent,
  type GameState,
  type PlayerId,
  assertInvariants,
  getPower,
  moveCards,
  stageSlot,
} from '../src/index';
import { type DefOverride, answer, card, oid, pending, put, scenario, testCardId } from './helpers';

/** Ability lists and other changes for single cards: `${player}:${index}`. */
function cards(map: Record<string, Partial<CardDef>>): DefOverride {
  return (p, i) => map[`${p}:${i}`];
}

function noClimaxes(ctx: Ctx, player: PlayerId): void {
  moveCards(ctx, [42, 43, 44, 45, 46, 47, 48, 49].map((i) => card(player, i)), { player, zone: 'memory' });
}

const moves = (events: GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'CARD_MOVED' ? [`${e.reason}:${e.from.zone}>${e.to.zone}`] : []));

const activate = (state: GameState, instanceId: number, ability = 0) =>
  answer(state, { kind: 'MAIN', action: { type: 'ACTIVATE', card: oid(state, instanceId), ability } });

const canActivate = (state: GameState): boolean => pending(state, 'MAIN').actions.some((a) => a.type === 'ACTIVATE');

const attack = (state: GameState, instanceId: number, type: 'FRONT' | 'SIDE' | 'DIRECT' = 'FRONT') =>
  answer(state, { kind: 'ATTACK', attack: { attacker: oid(state, instanceId), type } });

const DRAW_ONE: Effect[] = [{ do: 'DRAW', count: 1 }];

/** How many abilities of this card were played in these events. */
const played = (events: GameEvent[], instanceId: number): number =>
  events.filter((e) => e.type === 'ABILITY_PLAYED' && e.instanceId === instanceId).length;

describe('costs added for batch 3 (CR-8.4)', () => {
  it('［手札を1枚クロック置場に置く］: the player chooses the hand card; it is a cost, not damage', () => {
    const defs = cards({ '0:0': { abilities: [{ type: 'ACT', timing: 'MAIN', cost: [{ pay: 'HAND_TO_CLOCK', count: 1 }], effect: DRAW_ONE }] } });
    const start = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), { player: 0, zone: 'hand' });
      put(ctx, card(0, 46), { player: 0, zone: 'hand' });
    }).state;
    const atChoice = activate(start, card(0, 0)).state;
    // Any hand card may pay, a climax included.
    expect(pending(atChoice, 'SELECT_CARDS')).toMatchObject({ prompt: 'COST_HAND_TO_CLOCK', min: 1, max: 1 });
    expect(pending(atChoice, 'SELECT_CARDS').cards.sort()).toEqual([oid(atChoice, card(0, 1)), oid(atChoice, card(0, 46))].sort());

    const { state, events } = answer(atChoice, { kind: 'SELECT_CARDS', cards: [oid(atChoice, card(0, 46))] });
    expect(moves(events)).toEqual(['COST:hand>clock', 'DRAW:deck>hand']);
    expect(state.zones[0].clock).toEqual([card(0, 46)]);
    expect(state.zones[0].hand).toEqual([card(0, 1), card(0, 49)]);
    assertInvariants(state);
  });

  it('［手札を1枚クロック置場に置く］ cannot be paid with an empty hand, nor by a card that does not match the filter', () => {
    const plain = cards({ '0:0': { abilities: [{ type: 'ACT', timing: 'MAIN', cost: [{ pay: 'HAND_TO_CLOCK', count: 1 }], effect: DRAW_ONE }] } });
    const empty = scenario({ step: 'MAIN_START', defs: plain }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
    }).state;
    expect(canActivate(empty)).toBe(false);

    const filtered = cards({ '0:0': { abilities: [{ type: 'ACT', timing: 'MAIN', cost: [{ pay: 'HAND_TO_CLOCK', count: 1, filter: { kind: 'CLIMAX' } }], effect: DRAW_ONE }] } });
    const onlyCharacter = scenario({ step: 'MAIN_START', defs: filtered }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), { player: 0, zone: 'hand' });
    }).state;
    expect(canActivate(onlyCharacter)).toBe(false);
  });

  it('a discard and a hand-to-clock cost of the same ability need two different hand cards', () => {
    const defs = cards({
      '0:0': { abilities: [{ type: 'ACT', timing: 'MAIN', cost: [{ pay: 'DISCARD', count: 1 }, { pay: 'HAND_TO_CLOCK', count: 1 }], effect: DRAW_ONE }] },
    });
    const one = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), { player: 0, zone: 'hand' });
    }).state;
    expect(canActivate(one)).toBe(false);
    const two = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), { player: 0, zone: 'hand' });
      put(ctx, card(0, 2), { player: 0, zone: 'hand' });
    }).state;
    expect(canActivate(two)).toBe(true);
  });

  it('［このカードを山札の下に置く］: the card goes under its owner’s deck', () => {
    const defs = cards({ '0:0': { abilities: [{ type: 'ACT', timing: 'MAIN', cost: [{ pay: 'SELF_TO_DECK_BOTTOM' }], effect: DRAW_ONE }] } });
    const start = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
    }).state;
    const top = start.zones[0].deck[start.zones[0].deck.length - 1]!;
    const { state, events } = activate(start, card(0, 0));
    expect(moves(events)).toEqual(['COST:stage>deck', 'DRAW:deck>hand']);
    // The top card was drawn; the card that paid is the last one that would be drawn.
    expect(state.zones[0].hand).toEqual([top]);
    expect(state.zones[0].deck[0]).toBe(card(0, 0));
    expect(state.zones[0].stage.FC).toEqual([]);
    assertInvariants(state);
  });
});

describe('card filters added for batch 3', () => {
  it('「A」か「B」: only cards with exactly one of the names match', () => {
    const names = [`Test climax ${testCardId(0, 45)}`, `Test climax ${testCardId(0, 47)}`];
    const defs = cards({
      '0:0': {
        abilities: [
          {
            type: 'ACT',
            timing: 'MAIN',
            cost: [{ pay: 'DISCARD', count: 1, filter: { names } }],
            effect: [
              { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', min: 1, max: 1, filter: { names } },
              { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
            ],
          },
        ],
      },
    });
    const start = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      for (const i of [1, 45, 46]) put(ctx, card(0, i), { player: 0, zone: 'hand' });
      for (const i of [2, 47, 48]) put(ctx, card(0, i), { player: 0, zone: 'waitingRoom' });
    }).state;
    const atCost = activate(start, card(0, 0)).state;
    // Neither the character nor the other climax in hand can pay.
    expect(pending(atCost, 'SELECT_CARDS').cards).toEqual([oid(atCost, card(0, 45))]);
    const atChoose = answer(atCost, { kind: 'SELECT_CARDS', cards: [oid(atCost, card(0, 45))] }).state;
    // The card just discarded has one of the names too, so it can be taken back.
    expect(pending(atChoose, 'SELECT_CARDS').cards.sort()).toEqual([oid(atChoose, card(0, 45)), oid(atChoose, card(0, 47))].sort());
    const { state } = answer(atChoose, { kind: 'SELECT_CARDS', cards: [oid(atChoose, card(0, 47))] });
    expect(state.zones[0].hand).toContain(card(0, 47));
    expect(state.zones[0].waitingRoom).toEqual(expect.arrayContaining([card(0, 2), card(0, 48), card(0, 45)]));
  });

  it('レベルが相手のレベルより高いキャラ: compared with the level of the player whose character it is', () => {
    const defs = cards({
      '0:0': {
        abilities: [
          {
            type: 'ACT',
            timing: 'MAIN',
            cost: [],
            effect: [
              { do: 'CHOOSE', from: 'OPPONENT_STAGE', min: 1, max: 1, filter: { levelAboveMasterLevel: true } },
              { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'WAITING_ROOM' },
            ],
          },
        ],
      },
      '1:0': { level: 1 },
      '1:1': { level: 0 },
      '1:2': { level: 2 },
    });
    const arrange = (opponentLevel: number) => (ctx: Ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(1, 0), stageSlot(1, 'FL'));
      put(ctx, card(1, 1), stageSlot(1, 'FC'));
      put(ctx, card(1, 2), stageSlot(1, 'BL'));
      // The chooser's own level is irrelevant: give them a higher one.
      for (let k = 0; k < 3; k++) put(ctx, card(0, 30 + k), { player: 0, zone: 'level' });
      for (let k = 0; k < opponentLevel; k++) put(ctx, card(1, 30 + k), { player: 1, zone: 'level' });
    };
    const offered = (opponentLevel: number): number[] => {
      const state = activate(scenario({ step: 'MAIN_START', defs }, arrange(opponentLevel)).state, card(0, 0)).state;
      return state.pending?.kind === 'SELECT_CARDS' ? [...state.pending.cards].sort((a, b) => a - b) : [];
    };
    const at0 = scenario({ step: 'MAIN_START', defs }, arrange(0)).state;
    // Opponent at level 0: the level 1 and level 2 characters; at level 1: the level 2 one only; at level 2: none.
    expect(offered(0)).toEqual([oid(at0, card(1, 0)), oid(at0, card(1, 2))].sort((a, b) => a - b));
    expect(offered(1)).toEqual([oid(at0, card(1, 2))]);
    expect(offered(2)).toEqual([]);
  });
});

describe('conditions added for batch 3', () => {
  const reversedThenDraw = (filter: { costMax: number }): Ability[] => [
    { type: 'AUTO', trigger: { on: 'REVERSED' }, condition: { if: 'BATTLE_OPPONENT', filter }, effect: DRAW_ONE },
  ];

  it('このカードが【リバース】した時、このカードのバトル相手のコストが0以下なら: looks at the character it is fighting', () => {
    const run = (attackerCost: number) => {
      const defs = cards({ '0:0': { power: 2000, cost: attackerCost }, '1:0': { abilities: reversedThenDraw({ costMax: 0 }) } });
      const start = scenario({ step: 'ATTACK_START', defs }, (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, 'FC'));
        put(ctx, card(1, 0), stageSlot(1, 'FC'));
        noClimaxes(ctx, 1);
      }).state;
      const { events } = answer(attack(start, card(0, 0)).state, { kind: 'COUNTER', card: null });
      return played(events, card(1, 0));
    };
    expect(run(0)).toBe(1);
    expect(run(1)).toBe(0);
  });

  it('…バトル相手…なら is false once the battle opponent has left the stage', () => {
    // Both are reversed (equal power). The attacker’s own ability sends it away first; the defender’s ability then finds no battle opponent.
    const defs = cards({
      '0:0': { abilities: [{ type: 'AUTO', trigger: { on: 'REVERSED' }, effect: [{ do: 'MOVE', target: { who: 'SELF' }, to: 'WAITING_ROOM' }] }] },
      '1:0': { abilities: reversedThenDraw({ costMax: 0 }) },
    });
    const start = scenario({ step: 'ATTACK_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(1, 0), stageSlot(1, 'FC'));
      noClimaxes(ctx, 1);
    }).state;
    const { state, events } = answer(attack(start, card(0, 0)).state, { kind: 'COUNTER', card: null });
    expect(state.zones[0].waitingRoom).toContain(card(0, 0));
    // The attacker's ability was played, the defender's was not: its condition is no longer met (CR-8.7.2 "…なら").
    expect(played(events, card(0, 0))).toBe(1);
    expect(played(events, card(1, 0))).toBe(0);
  });

  it('このカードがアタックした時、このカードの正面のキャラのレベルが2なら、そのターン中、このカードのパワーを＋6000', () => {
    const ability: Ability = {
      type: 'AUTO',
      trigger: { on: 'ATTACKS' },
      condition: { if: 'FACING', filter: { levelMin: 2, levelMax: 2 } },
      effect: [{ do: 'MODIFY', target: { who: 'SELF' }, stat: 'POWER', amount: 6000 }],
    };
    const powerAfterAttack = (facingLevel: number | null, type: 'FRONT' | 'DIRECT') => {
      const defs = cards({ '0:0': { abilities: [ability] }, '1:0': { level: facingLevel ?? 0 }, '1:1': { level: 2 } });
      const start = scenario({ step: 'ATTACK_START', defs }, (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, 'FL'));
        if (facingLevel !== null) put(ctx, card(1, 0), stageSlot(1, 'FR'));
        // A level 2 character that is not facing the attacker does not count.
        put(ctx, card(1, 1), stageSlot(1, 'FC'));
        noClimaxes(ctx, 0);
        noClimaxes(ctx, 1);
      }).state;
      return getPower(attack(start, card(0, 0), type).state, card(0, 0));
    };
    expect(powerAfterAttack(2, 'FRONT')).toBe(7000);
    expect(powerAfterAttack(1, 'FRONT')).toBe(1000);
    expect(powerAfterAttack(3, 'FRONT')).toBe(1000);
    expect(powerAfterAttack(null, 'DIRECT')).toBe(1000);
  });
});

describe('targets and choices added for batch 3', () => {
  it('【永】 他のあなたの前列の中央の枠のキャラに、パワーを＋1000', () => {
    const cont: Ability = { type: 'CONT', apply: [{ target: { who: 'YOUR_SLOT', slots: ['FC'], other: true }, stat: 'POWER', amount: 1000 }] };
    const defs = cards({ '0:0': { abilities: [cont] } });
    const behind = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'BL'));
      put(ctx, card(0, 1), stageSlot(0, 'FC'));
      put(ctx, card(0, 2), stageSlot(0, 'FL'));
      put(ctx, card(1, 1), stageSlot(1, 'FC'));
    }).state;
    expect([1, 2].map((i) => getPower(behind, card(0, i)))).toEqual([2000, 1000]);
    // The opponent's centre character is not "yours".
    expect(getPower(behind, card(1, 1))).toBe(1000);

    // In the centre itself the card does not raise its own power.
    const inCentre = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
    }).state;
    expect(getPower(inCentre, card(0, 0))).toBe(1000);
  });

  it('相手の前列のコスト0以下のキャラを1枚までと相手の後列のコスト0以下のキャラを1枚まで選び、控え室に置く', () => {
    const defs = cards({
      '0:0': {
        abilities: [
          {
            type: 'ACT',
            timing: 'MAIN',
            cost: [],
            effect: [
              { do: 'CHOOSE', from: 'OPPONENT_FRONT_ROW', min: 0, max: 1, filter: { costMax: 0 } },
              { do: 'CHOOSE', from: 'OPPONENT_BACK_ROW', min: 0, max: 1, filter: { costMax: 0 }, add: true },
              { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'WAITING_ROOM' },
            ],
          },
        ],
      },
      '1:1': { cost: 1 },
      '1:3': { cost: 1 },
    });
    const start = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(1, 0), stageSlot(1, 'FL'));
      put(ctx, card(1, 1), stageSlot(1, 'FC'));
      put(ctx, card(1, 2), stageSlot(1, 'BL'));
      put(ctx, card(1, 3), stageSlot(1, 'BR'));
    }).state;
    const atFront = activate(start, card(0, 0)).state;
    expect(pending(atFront, 'SELECT_CARDS')).toMatchObject({ cards: [oid(atFront, card(1, 0))], min: 0, max: 1 });
    const atBack = answer(atFront, { kind: 'SELECT_CARDS', cards: [oid(atFront, card(1, 0))] }).state;
    // The back row is asked separately; the front row choice is kept.
    expect(pending(atBack, 'SELECT_CARDS')).toMatchObject({ cards: [oid(atBack, card(1, 2))], min: 0, max: 1 });
    const both = answer(atBack, { kind: 'SELECT_CARDS', cards: [oid(atBack, card(1, 2))] }).state;
    expect(both.zones[1].waitingRoom.sort()).toEqual([card(1, 0), card(1, 2)]);
    expect(both.zones[1].stage.FC).toEqual([card(1, 1)]);
    expect(both.zones[1].stage.BR).toEqual([card(1, 3)]);

    // Choosing none in the front row and one in the back row removes only the back row character.
    const skipFront = answer(atFront, { kind: 'SELECT_CARDS', cards: [] }).state;
    const onlyBack = answer(skipFront, { kind: 'SELECT_CARDS', cards: [oid(skipFront, card(1, 2))] }).state;
    expect(onlyBack.zones[1].waitingRoom).toEqual([card(1, 2)]);
    // Choosing one in the front row and none in the back row removes only the front row character.
    const onlyFront = answer(atBack, { kind: 'SELECT_CARDS', cards: [] }).state;
    expect(onlyFront.zones[1].waitingRoom).toEqual([card(1, 0)]);

    // With nobody to choose in the back row, the front row choice still stands (CR-8.6.3.1.3 applies to the second choice only).
    const emptyBack = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(1, 0), stageSlot(1, 'FL'));
      put(ctx, card(1, 3), stageSlot(1, 'BR'));
    }).state;
    const front = activate(emptyBack, card(0, 0)).state;
    const done = answer(front, { kind: 'SELECT_CARDS', cards: [oid(front, card(1, 0))] }).state;
    expect(done.pending?.kind).toBe('MAIN');
    expect(done.zones[1].waitingRoom).toEqual([card(1, 0)]);
  });

  it('自分の控え室のカードすべてを、山札に戻し、その山札をシャッフルする', () => {
    const defs = cards({
      '0:0': { abilities: [{ type: 'ACT', timing: 'MAIN', cost: [{ pay: 'SELF_TO_WAITING_ROOM' }], effect: [{ do: 'WAITING_ROOM_TO_DECK' }, { do: 'SHUFFLE' }] }] },
    });
    const start = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      for (let i = 1; i <= 20; i++) put(ctx, card(0, i), { player: 0, zone: 'waitingRoom' });
      put(ctx, card(1, 1), { player: 1, zone: 'waitingRoom' });
    }).state;
    const before = [...start.zones[0].deck];
    const { state, events } = activate(start, card(0, 0));
    // The card that paid the cost is in the waiting room by then, so it returns too.
    expect(state.zones[0].waitingRoom).toEqual([]);
    expect(state.zones[0].deck).toHaveLength(50);
    expect(state.zones[0].deck).toContain(card(0, 0));
    expect(events.some((e) => e.type === 'DECK_SHUFFLED')).toBe(true);
    expect(state.zones[0].deck.slice(0, before.length)).not.toEqual(before);
    // The opponent's waiting room is untouched; this is not a refresh (no refresh point).
    expect(state.zones[1].waitingRoom).toEqual([card(1, 1)]);
    expect(state.zones[0].clock).toEqual([]);
    assertInvariants(state);
  });
});

describe('triggers added for batch 3 (CR-8.7)', () => {
  const music = { traits: ['音楽'] };
  const boost: Ability = {
    type: 'AUTO',
    trigger: { on: 'OTHER_ATTACKS', filter: music },
    effect: [{ do: 'MODIFY', target: { who: 'SELF' }, stat: 'POWER', amount: 2000 }],
  };

  it('他のあなたの《音楽》のキャラがアタックした時、そのターン中、このカードのパワーを＋2000', () => {
    const defs = cards({ '0:0': { abilities: [boost], traits: ['音楽'] }, '0:1': { traits: ['音楽'] }, '1:0': { traits: ['音楽'] } });
    const start = scenario({ step: 'ATTACK_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FL'));
      put(ctx, card(0, 1), stageSlot(0, 'FC'));
      put(ctx, card(0, 2), stageSlot(0, 'FR'));
      noClimaxes(ctx, 0);
      noClimaxes(ctx, 1);
    }).state;
    // A character without the trait attacks: nothing.
    const afterPlain = attack(start, card(0, 2), 'DIRECT').state;
    expect(getPower(afterPlain, card(0, 0))).toBe(1000);
    // Another 《音楽》 character attacks: +2000.
    const afterMusic = attack(afterPlain, card(0, 1), 'DIRECT').state;
    expect(getPower(afterMusic, card(0, 0))).toBe(3000);
    // Its own attack is not "another character" attacking (the turn ends after it, so look at the events).
    expect(played(attack(afterPlain, card(0, 1), 'DIRECT').events, card(0, 0))).toBe(1);
    const own = attack(afterMusic, card(0, 0), 'DIRECT');
    expect(played(own.events, card(0, 0))).toBe(0);
  });

  it('does not trigger on the opponent’s attacks, nor from the back row of an inactive place', () => {
    const defs = cards({ '0:0': { abilities: [boost], traits: ['音楽'] }, '1:0': { traits: ['音楽'] } });
    const start = scenario({ step: 'ATTACK_START', turnPlayer: 1, defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FL'));
      put(ctx, card(1, 0), stageSlot(1, 'FC'));
      noClimaxes(ctx, 0);
      noClimaxes(ctx, 1);
    }).state;
    const { state, events } = attack(start, card(1, 0), 'DIRECT');
    expect(played(events, card(0, 0))).toBe(0);
    expect(getPower(state, card(0, 0))).toBe(1000);

    // In the waiting room the ability is not in force (CR-2.12.2).
    const away = scenario({ step: 'ATTACK_START', defs: cards({ '0:0': { abilities: [boost] }, '0:1': { traits: ['音楽'] } }) }, (ctx) => {
      put(ctx, card(0, 0), { player: 0, zone: 'waitingRoom' });
      put(ctx, card(0, 1), stageSlot(0, 'FC'));
      noClimaxes(ctx, 0);
      noClimaxes(ctx, 1);
    }).state;
    expect(attack(away, card(0, 1), 'DIRECT').events.filter((e) => e.type === 'ABILITY_PLAYED')).toHaveLength(0);
  });
});
