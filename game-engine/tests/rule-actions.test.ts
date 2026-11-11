import { describe, expect, it } from 'vitest';
import {
  type CardDef,
  type GameEvent,
  assertInvariants,
  getInstance,
  markerSlot,
  moveCards,
  stageSlot,
  submitChoice,
} from '../src/index';
import { answer, card, oid, pending, put, scenario } from './helpers';

/** A compact trace of the events that matter for ordering checks. */
function trace(events: GameEvent[]): string[] {
  return events.flatMap((e) => {
    if (e.type === 'CARD_MOVED') return [`${e.reason}:${e.from.zone}>${e.to.zone}`];
    if (e.type === 'REFRESH' || e.type === 'LEVEL_UP' || e.type === 'GAME_ENDED' || e.type === 'DECK_SHUFFLED') return [e.type];
    return [];
  });
}

describe('refresh (CR-9.2)', () => {
  it('T-REF-001 / CR-9.2.2 and T-ZONE-012 / CR-3.2.3.2: a deck that runs out mid-draw is refreshed at once, then the draw continues', () => {
    const start = scenario({ step: 'CLOCK_START' }, (ctx) => {
      put(ctx, card(0, 0), { player: 0, zone: 'hand' });
      put(ctx, card(0, 1), { player: 0, zone: 'hand' });
      // Leave one card in the deck and put ten in the waiting room.
      const deck = ctx.state.zones[0].deck;
      const rest = deck.slice(0, deck.length - 1);
      moveCards(ctx, rest.slice(0, 10), { player: 0, zone: 'waitingRoom' });
      moveCards(ctx, rest.slice(10), { player: 0, zone: 'memory' });
    }).state;
    expect(start.zones[0].deck).toHaveLength(1);

    const { state, events } = answer(start, { kind: 'CLOCK', card: oid(start, card(0, 0)) });
    const zones = state.zones[0];

    expect(trace(events)).toEqual([
      'CLOCK_PHASE:hand>clock',
      'DRAW:deck>hand', // the last card of the deck
      ...Array(10).fill('REFRESH:waitingRoom>deck'),
      'DECK_SHUFFLED',
      'REFRESH_PENALTY:deck>clock',
      'REFRESH',
      'DRAW:deck>hand', // the second card of "draw two", after the refresh
    ]);
    expect(zones.waitingRoom).toEqual([]);
    expect(zones.clock).toHaveLength(2);
    expect(zones.hand).toHaveLength(3);
    expect(zones.deck).toHaveLength(8);
    assertInvariants(state, { settled: true });
  });

  it('T-DMG-005 / CR-4.12.2: the card put into the clock by a refresh is not damage, so a climax there cancels nothing', () => {
    const start = scenario({ step: 'DRAW_START' }, (ctx) => {
      const deck = ctx.state.zones[0].deck;
      // One card left in the deck; the waiting room holds only climaxes.
      const climaxes = deck.slice(42, 49);
      moveCards(ctx, deck.slice(0, 42), { player: 0, zone: 'memory' });
      moveCards(ctx, climaxes, { player: 0, zone: 'waitingRoom' });
    });
    const zones = start.state.zones[0];
    expect(start.events.some((e) => e.type === 'REFRESH')).toBe(true);
    expect(zones.clock).toHaveLength(1);
    expect(start.state.defs[getInstance(start.state, zones.clock[0]!).cardId]!.kind).toBe('CLIMAX');
    expect(zones.deck).toHaveLength(6);
  });

  it('T-REF-002 / CR-9.2.2.1: with an empty waiting room there is no refresh; T-WIN-004 / CR-1.2.2.2: then having no cards at all loses', () => {
    const { state, events } = scenario({ step: 'DRAW_START' }, (ctx) => {
      const deck = ctx.state.zones[0].deck;
      moveCards(ctx, deck.slice(0, deck.length - 1), { player: 0, zone: 'memory' });
    });
    expect(events.some((e) => e.type === 'REFRESH')).toBe(false);
    // T-WIN-004 / CR-1.2.2.2: no deck and no waiting room is a losing condition,
    // applied at the check timing that follows the draw.
    expect(trace(events)).toEqual(['DRAW:deck>hand', 'GAME_ENDED']);
    expect(state.result).toEqual({ outcome: 'WIN', winner: 1, loser: 0, reason: 'NO_CARDS' });
  });
});

describe('level up (CR-9.3)', () => {
  const sixInClock = scenario({ step: 'CLOCK_START' }, (ctx) => {
    for (let i = 0; i < 6; i++) put(ctx, card(0, 10 + i), { player: 0, zone: 'clock' });
    for (const i of [0, 1, 2]) put(ctx, card(0, i), { player: 0, zone: 'hand' });
  }).state;

  it('T-LVL-001 / CR-9.3.2 and T-RA-001 / CR-9.1.2.1: the seventh clock card interrupts the clock phase before the two cards are drawn', () => {
    const afterClock = answer(sixInClock, { kind: 'CLOCK', card: oid(sixInClock, card(0, 0)) }).state;
    const decision = pending(afterClock, 'LEVEL_UP');
    expect(decision.player).toBe(0);
    expect(decision.cards).toHaveLength(7);
    expect(decision.cards).toContain(oid(afterClock, card(0, 0)));
    // The draw has not happened yet.
    expect(afterClock.zones[0].hand).toEqual([card(0, 1), card(0, 2)]);

    const { state, events } = answer(afterClock, { kind: 'LEVEL_UP', card: oid(afterClock, card(0, 12)) });
    const zones = state.zones[0];
    expect(zones.level).toEqual([card(0, 12)]);
    expect(getInstance(state, card(0, 12)).face).toBe('UP');
    expect(zones.clock).toEqual([]);
    expect([...zones.waitingRoom].sort((a, b) => a - b)).toEqual([card(0, 0), card(0, 10), card(0, 11), card(0, 13), card(0, 14), card(0, 15)]);
    expect(events.find((e) => e.type === 'LEVEL_UP')).toMatchObject({ player: 0, level: 1 });
    // Now the interrupted action continues: two cards are drawn.
    expect(zones.hand).toHaveLength(4);
    expect(pending(state, 'MAIN').player).toBe(0);
    assertInvariants(state, { settled: true });
  });

  it('T-LVL-001 / CR-9.3.2: only the bottom seven clock cards can be chosen; cards above them stay in the clock', () => {
    const start = scenario({ step: 'MAIN_START' }, (ctx) => {
      for (let i = 0; i < 8; i++) put(ctx, card(0, 10 + i), { player: 0, zone: 'clock' });
    }).state;
    const decision = pending(start, 'LEVEL_UP');
    const eighth = oid(start, card(0, 17));
    expect(decision.cards).toHaveLength(7);
    expect(decision.cards).not.toContain(eighth);

    const rejected = submitChoice(start, { player: 0, decisionId: decision.id, choice: { kind: 'LEVEL_UP', card: eighth } });
    expect(rejected).toMatchObject({ ok: false, code: 'ILLEGAL_CHOICE' });

    const { state } = answer(start, { kind: 'LEVEL_UP', card: decision.cards[0]! });
    expect(state.zones[0].clock).toEqual([card(0, 17)]);
    expect(state.zones[0].level).toEqual([card(0, 10)]);
    expect(state.zones[0].waitingRoom).toHaveLength(6);
  });
});

describe('several interrupt rule actions at once (CR-9.1.2.1.1)', () => {
  const bothDue = (): ReturnType<typeof scenario>['state'] =>
    scenario({ step: 'MAIN_START' }, (ctx) => {
      const deck = [...ctx.state.zones[0].deck];
      moveCards(ctx, deck.slice(0, 7), { player: 0, zone: 'clock' });
      moveCards(ctx, deck.slice(7, 12), { player: 0, zone: 'waitingRoom' });
      moveCards(ctx, deck.slice(12), { player: 0, zone: 'memory' });
    }).state;

  it('T-RA-002 / CR-9.1.2.1.1.2: a player with a refresh and a level up due chooses which comes first', () => {
    const start = bothDue();
    expect(pending(start, 'RULE_ACTION_ORDER')).toMatchObject({ player: 0, options: ['REFRESH', 'LEVEL_UP'] });
  });

  it('refresh first: the level up then sees eight clock cards and its six discards stay in the waiting room', () => {
    const start = bothDue();
    const refreshed = answer(start, { kind: 'RULE_ACTION_ORDER', first: 'REFRESH' }).state;
    expect(refreshed.zones[0].clock).toHaveLength(8);
    expect(refreshed.zones[0].deck).toHaveLength(4);
    const levelUp = pending(refreshed, 'LEVEL_UP');
    const { state } = answer(refreshed, { kind: 'LEVEL_UP', card: levelUp.cards[0]! });
    expect(state.zones[0].level).toHaveLength(1);
    expect(state.zones[0].clock).toHaveLength(1);
    expect(state.zones[0].waitingRoom).toHaveLength(6);
    expect(state.zones[0].deck).toHaveLength(4);
    assertInvariants(state, { settled: true });
  });

  it('level up first: its six discards are shuffled into the deck by the refresh that follows', () => {
    const start = bothDue();
    const asked = answer(start, { kind: 'RULE_ACTION_ORDER', first: 'LEVEL_UP' }).state;
    const levelUp = pending(asked, 'LEVEL_UP');
    const { state } = answer(asked, { kind: 'LEVEL_UP', card: levelUp.cards[0]! });
    expect(state.zones[0].level).toHaveLength(1);
    expect(state.zones[0].clock).toHaveLength(1);
    expect(state.zones[0].waitingRoom).toHaveLength(0);
    expect(state.zones[0].deck).toHaveLength(10);
    assertInvariants(state, { settled: true });
  });

  it('CR-9.1.2.1.1.1: the turn player performs their rule actions first', () => {
    const start = scenario({ step: 'MAIN_START', turnPlayer: 1 }, (ctx) => {
      for (const player of [0, 1] as const) {
        for (let i = 0; i < 7; i++) put(ctx, card(player, 10 + i), { player, zone: 'clock' });
      }
    }).state;
    const first = pending(start, 'LEVEL_UP');
    expect(first.player).toBe(1);
    const next = answer(start, { kind: 'LEVEL_UP', card: first.cards[0]! }).state;
    expect(pending(next, 'LEVEL_UP').player).toBe(0);
  });
});

describe('winning and losing (CR-1.2, CR-9.4)', () => {
  it('T-WIN-002 / CR-1.2.2, T-WIN-003 / CR-1.2.2.1 and T-WIN-010 / CR-9.4.1: a fourth level card loses at the next check timing, not immediately', () => {
    const start = scenario({ step: 'CLOCK_START' }, (ctx) => {
      for (let i = 0; i < 3; i++) put(ctx, card(0, 20 + i), { player: 0, zone: 'level' });
      for (let i = 0; i < 6; i++) put(ctx, card(0, 10 + i), { player: 0, zone: 'clock' });
      put(ctx, card(0, 0), { player: 0, zone: 'hand' });
    }).state;
    const afterClock = answer(start, { kind: 'CLOCK', card: oid(start, card(0, 0)) }).state;
    const levelUp = pending(afterClock, 'LEVEL_UP');
    const { state, events } = answer(afterClock, { kind: 'LEVEL_UP', card: levelUp.cards[0]! });

    expect(state.zones[0].level).toHaveLength(4);
    // After reaching level 4 the clock phase still completed its draw of two
    // cards; the game ended only at the check timing after it.
    expect(trace(events).slice(-4)).toEqual(['LEVEL_UP', 'DRAW:deck>hand', 'DRAW:deck>hand', 'GAME_ENDED']);
    expect(state.result).toEqual({ outcome: 'WIN', winner: 1, loser: 0, reason: 'LEVEL_4' });
    expect(state.pending).toBeNull();
  });

  it('T-WIN-005 / CR-1.2.3: both players meeting a losing condition at the same check timing is a draw', () => {
    const { state } = scenario({ step: 'MAIN_START' }, (ctx) => {
      for (const player of [0, 1] as const) {
        for (let i = 0; i < 4; i++) put(ctx, card(player, 20 + i), { player, zone: 'level' });
      }
    });
    expect(state.result).toEqual({ outcome: 'DRAW', reasons: ['LEVEL_4', 'LEVEL_4'] });
  });

  it('T-WIN-001 / CR-1.2.1: the player who did not lose wins, whoever’s turn it is', () => {
    const { state } = scenario({ step: 'MAIN_START', turnPlayer: 0 }, (ctx) => {
      for (let i = 0; i < 4; i++) put(ctx, card(1, 20 + i), { player: 1, zone: 'level' });
    });
    expect(state.result).toEqual({ outcome: 'WIN', winner: 0, loser: 1, reason: 'LEVEL_4' });
  });
});

describe('check-type rule actions (CR-9.5 to CR-9.7)', () => {
  it('T-RA-010 / CR-9.5.1: a character with power 0 or less goes to its owner’s waiting room', () => {
    const defs = (_p: number, i: number): Partial<CardDef> | undefined => (i === 0 ? { power: 0 } : undefined);
    const { state } = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FL'));
      put(ctx, card(0, 1), stageSlot(0, 'FC'));
      // A powerless character owned by player 1 sitting on player 0's stage.
      put(ctx, card(1, 0), stageSlot(0, 'FR'));
    });
    expect(state.zones[0].stage.FL).toEqual([]);
    expect(state.zones[0].waitingRoom).toEqual([card(0, 0)]);
    // A character with power above 0 stays.
    expect(state.zones[0].stage.FC).toEqual([card(0, 1)]);
    // The other player's card goes to its owner's waiting room, not the stage owner's.
    expect(state.zones[0].stage.FR).toEqual([]);
    expect(state.zones[1].waitingRoom).toEqual([card(1, 0)]);
  });

  it('T-RA-011 / CR-9.6.1: a non-character in a slot and a non-climax in the climax zone go to the waiting room', () => {
    const { state } = scenario({ step: 'MAIN_START' }, (ctx) => {
      put(ctx, card(0, 45), stageSlot(0, 'FL'));
      put(ctx, card(0, 0), { player: 0, zone: 'climax' });
      put(ctx, card(0, 46), { player: 0, zone: 'climax' });
    });
    expect(state.zones[0].stage.FL).toEqual([]);
    expect(state.zones[0].climax).toEqual([card(0, 46)]);
    expect([...state.zones[0].waitingRoom].sort((a, b) => a - b)).toEqual([card(0, 0), card(0, 45)]);
  });

  it('T-RA-012 / CR-9.6.2: of several characters in a slot only the one placed last stays', () => {
    const { state } = scenario({ step: 'MAIN_START' }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), stageSlot(0, 'FC'));
      put(ctx, card(0, 2), stageSlot(0, 'FC'));
    });
    expect(state.zones[0].stage.FC).toEqual([card(0, 2)]);
    expect([...state.zones[0].waitingRoom].sort((a, b) => a - b)).toEqual([card(0, 0), card(0, 1)]);
  });

  it('CR-9.6.2.1: when the last placement put several characters there at once, none stays', () => {
    const { state } = scenario({ step: 'MAIN_START' }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      moveCards(ctx, [card(0, 1), card(0, 2)], stageSlot(0, 'FC'));
    });
    expect(state.zones[0].stage.FC).toEqual([]);
    expect(state.zones[0].waitingRoom).toHaveLength(3);
  });

  it('CR-9.6.2: of several climaxes in the climax zone only the one placed last stays', () => {
    const { state } = scenario({ step: 'MAIN_START' }, (ctx) => {
      put(ctx, card(0, 45), { player: 0, zone: 'climax' });
      put(ctx, card(0, 46), { player: 0, zone: 'climax' });
    });
    expect(state.zones[0].climax).toEqual([card(0, 46)]);
    expect(state.zones[0].waitingRoom).toEqual([card(0, 45)]);
  });

  it('T-RA-013 / CR-9.7.1: markers of a slot without a character go to their owners’ waiting rooms', () => {
    const { state } = scenario({ step: 'MAIN_START' }, (ctx) => {
      put(ctx, card(0, 0), markerSlot(0, 'BL'));
      put(ctx, card(1, 0), markerSlot(0, 'BL'), { face: 'UP' });
      // A slot with a character keeps its markers.
      put(ctx, card(0, 1), stageSlot(0, 'FR'));
      put(ctx, card(0, 2), markerSlot(0, 'FR'));
    });
    expect(state.zones[0].marker.BL).toEqual([]);
    expect(state.zones[0].waitingRoom).toEqual([card(0, 0)]);
    expect(state.zones[1].waitingRoom).toEqual([card(1, 0)]);
    expect(state.zones[0].marker.FR).toEqual([card(0, 2)]);
  });

  it('T-RA-003 / CR-9.1.2.2: check-type rule actions wait for a check timing', () => {
    // Two characters share a slot when the clock phase asks its question; the
    // check timing before it has already removed the older one.
    const start = scenario({ step: 'CLOCK_START' }, (ctx) => {
      put(ctx, card(0, 0), { player: 0, zone: 'hand' });
      put(ctx, card(0, 1), stageSlot(0, 'FC'));
      put(ctx, card(0, 2), stageSlot(0, 'FC'));
    });
    expect(start.state.pending?.kind).toBe('CLOCK');
    expect(start.state.zones[0].stage.FC).toEqual([card(0, 2)]);
  });

  it('CR-9.1.2.2.1: all check-type rule actions that apply are performed in the same check timing', () => {
    // A non-character in a slot with a marker, and a stranded marker in
    // another slot: everything is gone by the first play timing.
    const { state } = scenario({ step: 'MAIN_START' }, (ctx) => {
      put(ctx, card(0, 45), stageSlot(0, 'FL'));
      put(ctx, card(0, 3), markerSlot(0, 'FL'));
      put(ctx, card(0, 4), markerSlot(0, 'BR'));
    });
    expect(state.zones[0].stage.FL).toEqual([]);
    expect(state.zones[0].marker.FL).toEqual([]);
    expect(state.zones[0].marker.BR).toEqual([]);
    expect(state.zones[0].waitingRoom).toHaveLength(3);
    assertInvariants(state, { settled: true });
  });
});
