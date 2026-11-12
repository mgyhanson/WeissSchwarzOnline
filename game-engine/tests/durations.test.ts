/**
 * Constructs added for the second SAO batch (docs/05-card-pool-2.md):
 * effects lasting 次の相手のターンの終わりまで, costs that rest characters,
 * move stock to the clock or put the card into memory, 「それらのカードに…
 * があるなら」 and 「バトル中のこのカードが【リバース】した時」. As elsewhere,
 * the abilities are attached to synthetic test cards.
 */

import { describe, expect, it } from 'vitest';
import { type Ability, type Choice, type Decision, type GameState, type PlayerId, getInstance, getPower, getSoul, stageSlot } from '../src/index';
import { type DefOverride, answer, card, oid, pending, put, scenario } from './helpers';

function withAbilities(player: PlayerId, map: Record<number, Ability[]>): DefOverride {
  return (p, i) => (p === player && map[i] ? { abilities: map[i] } : undefined);
}

function routine(d: Decision): Choice {
  switch (d.kind) {
    case 'MAIN':
      return { kind: 'MAIN', action: { type: 'PASS' } };
    case 'CLIMAX':
      return { kind: 'CLIMAX', card: null };
    case 'ATTACK':
      return { kind: 'ATTACK', attack: null };
    case 'COUNTER':
      return { kind: 'COUNTER', card: null };
    case 'CLOCK':
      return { kind: 'CLOCK', card: null };
    case 'CONFIRM':
      return { kind: 'CONFIRM', accept: false };
    case 'CHOOSE_ABILITY':
      return { kind: 'CHOOSE_ABILITY', id: d.abilities[0]!.id };
    default:
      throw new Error(`Unexpected ${d.kind}`);
  }
}

/** Answers routine decisions until the main phase of the given turn. */
function toMain(state: GameState, turnNumber: number): GameState {
  let current = state;
  for (let i = 0; i < 200 && !(current.turn?.number === turnNumber && current.pending?.kind === 'MAIN'); i++) {
    current = answer(current, routine(current.pending!)).state;
  }
  expect(current.turn?.number).toBe(turnNumber);
  return current;
}

describe('次の相手のターンの終わりまで (CR-8.2.1.2, CR-6.8.1.4)', () => {
  it('T-DUR-001 / CR-8.2.1.2: given in your turn, it lasts through the opponent’s next turn and ends at its end (CR-6.8.1.4); そのターン中 ends with your turn', () => {
    const defs = withAbilities(0, {
      0: [
        { type: 'ACT', timing: 'MAIN', cost: [], limit: 1, effect: [{ do: 'MODIFY', target: { who: 'SELF' }, stat: 'POWER', amount: 1000, until: 'NEXT_OPPONENT_TURN' }] },
        { type: 'ACT', timing: 'MAIN', cost: [], limit: 1, effect: [{ do: 'MODIFY', target: { who: 'SELF' }, stat: 'SOUL', amount: 1 }] },
      ],
    });
    const start = scenario({ step: 'MAIN_START', turnNumber: 3, defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'BL')); // in the back row, so it never attacks
    }).state;
    const self = card(0, 0);
    const first = answer(start, { kind: 'MAIN', action: { type: 'ACTIVATE', card: oid(start, self), ability: 0 } }).state;
    const both = answer(first, { kind: 'MAIN', action: { type: 'ACTIVATE', card: oid(first, self), ability: 1 } }).state;
    expect([getPower(both, self), getSoul(both, self)]).toEqual([2000, 2]);

    const theirs = toMain(both, 4);
    expect(theirs.turn!.player).toBe(1);
    expect([getPower(theirs, self), getSoul(theirs, self)]).toEqual([2000, 1]);

    const mine = toMain(theirs, 5);
    expect([getPower(mine, self), getSoul(mine, self)]).toEqual([1000, 1]);
    expect(mine.modifiers).toEqual([]);
  });

  it('T-DUR-002 / CR-8.2.1.2: given in the opponent’s turn, it lasts until the end of the opponent’s following turn, not the current one', () => {
    const defs = withAbilities(0, {
      0: [
        {
          type: 'AUTO',
          trigger: { on: 'PHASE_START', phase: 'CLIMAX', turn: 'OPPONENT' },
          effect: [{ do: 'MODIFY', target: { who: 'SELF' }, stat: 'POWER', amount: 1000, until: 'NEXT_OPPONENT_TURN' }],
        },
      ],
    });
    const start = scenario({ step: 'CLIMAX_START', turnPlayer: 1, turnNumber: 4, defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'BL'));
    }).state;
    const self = card(0, 0);
    expect(getPower(start, self)).toBe(2000);
    expect(start.modifiers.map((m) => m.untilTurn)).toEqual([6]);
    // Through the end of turn 4 and your turn 5 ...
    expect(getPower(toMain(start, 5), self)).toBe(2000);
    // ... and into turn 6, before its climax phase triggers the ability again.
    const six = toMain(start, 6);
    expect(six.modifiers.map((m) => m.untilTurn)).toEqual([6]);
    // At the end of turn 6 the first change ends; the one from turn 6 lasts until turn 8.
    const seven = toMain(six, 7);
    expect(seven.modifiers.map((m) => m.untilTurn)).toEqual([8]);
    expect(getPower(seven, self)).toBe(2000);
  });

  it('T-DUR-003 / CR-8.2.1.2: a given automatic ability lasts for the same period', () => {
    const granted: Ability = {
      type: 'AUTO',
      trigger: { on: 'PHASE_START', phase: 'MAIN', turn: 'ANY' },
      effect: [{ do: 'MODIFY', target: { who: 'SELF' }, stat: 'SOUL', amount: 1 }],
    };
    const defs = withAbilities(0, {
      0: [{ type: 'ACT', timing: 'MAIN', cost: [], limit: 1, effect: [{ do: 'GRANT', target: { who: 'SELF' }, ability: granted as Extract<Ability, { type: 'AUTO' }>, until: 'NEXT_OPPONENT_TURN' }] }],
    });
    const start = scenario({ step: 'MAIN_START', turnNumber: 3, defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'BL'));
    }).state;
    const self = card(0, 0);
    const after = answer(start, { kind: 'MAIN', action: { type: 'ACTIVATE', card: oid(start, self), ability: 0 } }).state;
    expect(after.grants.map((g) => g.untilTurn)).toEqual([4]);
    // In the opponent's main phase the given ability triggers.
    const theirs = toMain(after, 4);
    expect(getSoul(theirs, self)).toBe(2);
    // In your next main phase it is gone, so nothing triggers.
    const mine = toMain(theirs, 5);
    expect(mine.grants).toEqual([]);
    expect(getSoul(mine, self)).toBe(1);
  });
});

describe('costs added for the second SAO batch', () => {
  const restTwo: Ability = {
    type: 'ACT',
    timing: 'MAIN',
    cost: [{ pay: 'REST_CHARACTERS', count: 2 }],
    effect: [{ do: 'MODIFY', target: { who: 'SELF' }, stat: 'POWER', amount: 1500 }],
  };
  const restOtherAndSelf: Ability = {
    type: 'ACT',
    timing: 'MAIN',
    cost: [{ pay: 'REST_CHARACTERS', count: 1, other: true }, { pay: 'REST_SELF' }],
    effect: [{ do: 'MODIFY', target: { who: 'SELF' }, stat: 'POWER', amount: 1000 }],
  };

  it('T-COST-002 / CR-8.4.2.2: あなたのキャラをN枚【レスト】する: chooses N standing characters, itself included; not offered with fewer', () => {
    const defs = withAbilities(0, { 0: [restTwo] });
    const start = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), stageSlot(0, 'FL'));
      put(ctx, card(0, 2), stageSlot(0, 'FR'), { orientation: 'REST' });
    }).state;
    const atRest = answer(start, { kind: 'MAIN', action: { type: 'ACTIVATE', card: oid(start, card(0, 0)), ability: 0 } }).state;
    const select = pending(atRest, 'SELECT_CARDS');
    expect(select).toMatchObject({ prompt: 'COST_REST', min: 2, max: 2 });
    // The rested character cannot be chosen.
    expect([...select.cards].sort()).toEqual([oid(atRest, card(0, 0)), oid(atRest, card(0, 1))].sort());
    const { state } = answer(atRest, { kind: 'SELECT_CARDS', cards: select.cards });
    expect(getPower(state, card(0, 0))).toBe(2500);
    expect(getInstance(state, card(0, 1)).orientation).toBe('REST');
    // With no standing character left, the ability is no longer offered.
    expect(pending(state, 'MAIN').actions.some((a) => a.type === 'ACTIVATE')).toBe(false);
  });

  it('T-COST-002: 他のあなたのキャラを1枚とこのカードを【レスト】する: the other character is chosen, then this card rests; not offered without another', () => {
    const defs = withAbilities(0, { 0: [restOtherAndSelf] });
    const alone = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
    }).state;
    expect(pending(alone, 'MAIN').actions.some((a) => a.type === 'ACTIVATE')).toBe(false);

    const start = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), stageSlot(0, 'FL'));
    }).state;
    const atRest = answer(start, { kind: 'MAIN', action: { type: 'ACTIVATE', card: oid(start, card(0, 0)), ability: 0 } }).state;
    expect(pending(atRest, 'SELECT_CARDS').cards).toEqual([oid(atRest, card(0, 1))]);
    const { state } = answer(atRest, { kind: 'SELECT_CARDS', cards: [oid(atRest, card(0, 1))] });
    expect([getInstance(state, card(0, 0)).orientation, getInstance(state, card(0, 1)).orientation]).toEqual(['REST', 'REST']);
    expect(getPower(state, card(0, 0))).toBe(2000);
  });

  it('T-COST-001 / CR-8.4.2.1: ストックの上から1枚をクロック置場に置き、このカードを思い出にする, paid in that order; needs a stock card', () => {
    const defs = withAbilities(0, {
      0: [{ type: 'ACT', timing: 'MAIN', cost: [{ pay: 'STOCK_TO_CLOCK', count: 1 }, { pay: 'SELF_TO_MEMORY' }], effect: [{ do: 'DRAW', count: 1 }] }],
    });
    const noStock = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
    }).state;
    expect(pending(noStock, 'MAIN').actions.some((a) => a.type === 'ACTIVATE')).toBe(false);

    const start = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 10), { player: 0, zone: 'stock' });
      put(ctx, card(0, 11), { player: 0, zone: 'stock' }); // the top of the stock
    }).state;
    const { state, events } = answer(start, { kind: 'MAIN', action: { type: 'ACTIVATE', card: oid(start, card(0, 0)), ability: 0 } });
    expect(state.zones[0].clock).toEqual([card(0, 11)]);
    expect(state.zones[0].stock).toEqual([card(0, 10)]);
    expect(state.zones[0].memory).toEqual([card(0, 0)]);
    expect(state.zones[0].hand).toHaveLength(1);
    const moves = events.filter((e) => e.type === 'CARD_MOVED').map((e) => (e as { to: { zone: string } }).to.zone);
    expect(moves.slice(0, 2)).toEqual(['clock', 'memory']);
  });
});

describe('それらのカードに…があるなら and バトル中のこのカードが【リバース】した時', () => {
  it('山札の上から2枚を控え室に置く。それらのカードにクライマックスがあるなら… looks at the cards just moved', () => {
    const defs = withAbilities(0, {
      0: [
        {
          type: 'AUTO',
          trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' },
          effect: [
            { do: 'DECK_TOP', count: 2, to: 'WAITING_ROOM' },
            { do: 'IF', condition: { if: 'LAST_MOVED', min: 1, filter: { kind: 'CLIMAX' } }, then: [{ do: 'MODIFY', target: { who: 'SELF' }, stat: 'SOUL', amount: 2 }] },
          ],
        },
      ],
    });
    const play = (top: number[], waiting: number[]) => {
      const start = scenario({ step: 'MAIN_START', defs }, (ctx) => {
        put(ctx, card(0, 0), { player: 0, zone: 'hand' });
        for (const id of waiting) put(ctx, id, { player: 0, zone: 'waitingRoom' });
        // The deck's last card is its top: put the chosen cards on top, the first one uppermost.
        for (const id of [...top].reverse()) {
          put(ctx, id, { player: 0, zone: 'memory' });
          put(ctx, id, { player: 0, zone: 'deck' });
        }
      }).state;
      return answer(start, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(start, card(0, 0)), slot: 'FC' } }).state;
    };
    expect(getSoul(play([card(0, 5), card(0, 42)], []), card(0, 0))).toBe(3);
    // A climax already in the waiting room is not one of "those cards".
    expect(getSoul(play([card(0, 5), card(0, 6)], [card(0, 43)]), card(0, 0))).toBe(1);
  });

  it('T-ATK-008 / CR-7.2.1.5: バトル中のこのカードが【リバース】した時 triggers when it is reversed as a character in battle', () => {
    const atAttack = scenario(
      {
        step: 'ATTACK_START',
        turnPlayer: 1,
        defs: (p, i) =>
          p === 0 && i === 0
            ? { abilities: [{ type: 'AUTO', trigger: { on: 'REVERSED', inBattle: true }, effect: [{ do: 'DRAW', count: 1 }] }] }
            : p === 1 && i === 0
              ? { power: 5000 }
              : undefined,
      },
      (ctx) => {
        put(ctx, card(0, 0), stageSlot(0, 'FC'));
        put(ctx, card(1, 0), stageSlot(1, 'FC'));
      },
    ).state;
    const handBefore = atAttack.zones[0].hand.length;
    let state = answer(atAttack, { kind: 'ATTACK', attack: { attacker: oid(atAttack, card(1, 0)), type: 'FRONT' } }).state;
    const events = [];
    for (let i = 0; i < 20 && getInstance(state, card(0, 0)).location.zone === 'stage'; i++) {
      const result = answer(state, routine(state.pending!));
      state = result.state;
      events.push(...result.events);
    }
    // Reversed in the battle step, it drew a card; the encore was declined and it went to the waiting room.
    expect(events.some((e) => e.type === 'ORIENTATION_CHANGED' && (e as { instanceId?: number }).instanceId === card(0, 0) && (e as { to?: string }).to === 'REVERSE')).toBe(true);
    // (The game then went on into player 0's turn, so the hand also holds that turn's draw.)
    expect(events.filter((e) => e.type === 'ABILITY_PLAYED' && (e as { cardId?: string }).cardId === 'T0-00')).toHaveLength(1);
    expect(state.zones[0].hand.length).toBe(handBefore + 2);
    expect(state.zones[0].waitingRoom).toContain(card(0, 0));
  });
});
