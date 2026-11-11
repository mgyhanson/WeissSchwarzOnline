import { describe, expect, it } from 'vitest';
import {
  type CardDef,
  type CardMovedEvent,
  type GameEvent,
  type GameState,
  type MainAction,
  advance,
  assertInvariants,
  getInstance,
  markerSlot,
  setOrientation,
  stageSlot,
  submitChoice,
} from '../src/index';
import { EVENT, answer, card, newTestState, oid, pending, put, scenario } from './helpers';

const moves = (events: GameEvent[]): CardMovedEvent[] =>
  events.filter((e): e is CardMovedEvent => e.type === 'CARD_MOVED');

const phases = (events: GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'PHASE_STARTED' ? [e.phase] : []));

/** Object ids of the hand cards that the pending MAIN decision allows to be played. */
function playable(state: GameState): number[] {
  const cards = pending(state, 'MAIN').actions.flatMap((a) =>
    a.type === 'PLAY_CHARACTER' || a.type === 'PLAY_EVENT' ? [a.card] : [],
  );
  return [...new Set(cards)];
}

describe('stand phase (CR-6.2)', () => {
  it('T-TURN-001 / CR-6.2.1.2: the turn player stands all their characters; the opponent’s are untouched', () => {
    const { state } = scenario({ step: 'STAND_START' }, (ctx) => {
      const rested = put(ctx, card(0, 0), stageSlot(0, 'FL'));
      const reversed = put(ctx, card(0, 1), stageSlot(0, 'BR'));
      const theirs = put(ctx, card(1, 0), stageSlot(1, 'FL'));
      setOrientation(ctx, rested, 'REST');
      setOrientation(ctx, reversed, 'REVERSE');
      setOrientation(ctx, theirs, 'REST');
    });
    expect(getInstance(state, card(0, 0)).orientation).toBe('STAND');
    expect(getInstance(state, card(0, 1)).orientation).toBe('STAND');
    expect(getInstance(state, card(1, 0)).orientation).toBe('REST');
  });
});

describe('draw phase (CR-6.3)', () => {
  it('T-TURN-002 / CR-6.3.1.2: the turn player draws the top card of their deck', () => {
    const { state, events } = scenario({ step: 'DRAW_START' });
    expect(state.zones[0].hand).toEqual([card(0, 49)]);
    expect(state.zones[1].hand).toEqual([]);
    expect(moves(events).map((e) => e.reason)).toEqual(['DRAW']);
  });
});

describe('clock phase (CR-6.4)', () => {
  const start = scenario({ step: 'CLOCK_START' }, (ctx) => {
    for (const i of [0, 1, 2]) put(ctx, card(0, i), { player: 0, zone: 'hand' });
  }).state;

  it('T-TURN-003 / CR-6.4.1.2: the turn player may put one hand card into the clock and then draws two', () => {
    const decision = pending(start, 'CLOCK');
    expect(decision.player).toBe(0);
    expect([...decision.cards].sort()).toEqual([0, 1, 2].map((i) => oid(start, card(0, i))).sort());

    const { state } = answer(start, { kind: 'CLOCK', card: oid(start, card(0, 1)) });
    expect(state.zones[0].clock).toEqual([card(0, 1)]);
    expect(state.zones[0].hand).toEqual([card(0, 0), card(0, 2), card(0, 49), card(0, 48)]);
    expect(state.zones[0].deck).toHaveLength(45);
    expect(pending(state, 'MAIN').player).toBe(0);
  });

  it('T-TURN-003 / CR-6.4.1.2: declining changes nothing', () => {
    const { state, events } = answer(start, { kind: 'CLOCK', card: null });
    expect(state.zones[0].clock).toEqual([]);
    expect(state.zones[0].hand).toHaveLength(3);
    expect(moves(events)).toEqual([]);
    expect(pending(state, 'MAIN').player).toBe(0);
  });

  it('with an empty hand there is nothing to decide', () => {
    const { state, events } = scenario({ step: 'CLOCK_START' });
    expect(phases(events)).toEqual(['CLOCK', 'MAIN']);
    expect(pending(state, 'MAIN').player).toBe(0);
  });
});

describe('main phase (CR-6.5)', () => {
  it('T-TURN-004 / CR-6.5.1.2.1: a character is played from hand into a chosen slot, standing', () => {
    const start = scenario({ step: 'MAIN_START' }, (ctx) => {
      put(ctx, card(0, 0), { player: 0, zone: 'hand' });
      put(ctx, card(0, 1), { player: 0, zone: 'hand' });
    }).state;
    // Two characters x five slots, plus passing. No swap: the stage is empty.
    expect(pending(start, 'MAIN').actions).toHaveLength(11);

    const { state, events } = answer(start, {
      kind: 'MAIN',
      action: { type: 'PLAY_CHARACTER', card: oid(start, card(0, 0)), slot: 'FC' },
    });
    expect(state.zones[0].stage.FC).toEqual([card(0, 0)]);
    expect(getInstance(state, card(0, 0)).orientation).toBe('STAND');
    expect(state.zones[0].hand).toEqual([card(0, 1)]);
    expect(events.find((e) => e.type === 'CARD_PLAYED')).toMatchObject({ player: 0, cardKind: 'CHARACTER', slot: 'FC', stockPaid: 0 });
    // CR-4.5.3.1: after an action the player gets another play timing.
    expect(pending(state, 'MAIN').player).toBe(0);
    assertInvariants(state, { settled: true });
  });

  it('T-PLAY-003 / CR-8.6.2.1.2: a card whose level exceeds the number of level cards cannot be played', () => {
    const defs = (_p: number, i: number): Partial<CardDef> | undefined => (i === 0 ? { level: 1 } : undefined);
    const tooEarly = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), { player: 0, zone: 'hand' });
      put(ctx, card(0, 10), { player: 0, zone: 'clock' });
    }).state;
    expect(playable(tooEarly)).toEqual([]);

    const levelOne = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), { player: 0, zone: 'hand' });
      put(ctx, card(0, 10), { player: 0, zone: 'level' });
    }).state;
    expect(playable(levelOne)).toEqual([oid(levelOne, card(0, 0))]);
  });

  it('T-PLAY-001 / CR-8.6.2.1.1: the card’s colour must match a card in the level zone or the clock', () => {
    const defs = (_p: number, i: number): Partial<CardDef> | undefined =>
      i === 0 ? { level: 1, color: 'blue' } : i === 11 ? { color: 'blue' } : undefined;

    const noBlue = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), { player: 0, zone: 'hand' });
      put(ctx, card(0, 10), { player: 0, zone: 'level' });
    }).state;
    expect(playable(noBlue)).toEqual([]);

    const blueInClock = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), { player: 0, zone: 'hand' });
      put(ctx, card(0, 10), { player: 0, zone: 'level' });
      put(ctx, card(0, 11), { player: 0, zone: 'clock' });
    }).state;
    expect(playable(blueInClock)).toEqual([oid(blueInClock, card(0, 0))]);

    const blueInLevel = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), { player: 0, zone: 'hand' });
      put(ctx, card(0, 11), { player: 0, zone: 'level' });
    }).state;
    expect(playable(blueInLevel)).toEqual([oid(blueInLevel, card(0, 0))]);
  });

  it('T-PLAY-002 / CR-8.6.2.1.1.1: level 0 characters and events need no matching colour', () => {
    const defs = (_p: number, i: number): Partial<CardDef> | undefined =>
      i === 0 ? { color: 'blue' } : i === 1 ? { ...EVENT, color: 'green' } : undefined;
    const state = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), { player: 0, zone: 'hand' });
      put(ctx, card(0, 1), { player: 0, zone: 'hand' });
    }).state;
    expect(playable(state).sort()).toEqual([oid(state, card(0, 0)), oid(state, card(0, 1))].sort());
  });

  it('CR-3.9.2.2.1: a face-down level card counts towards the level but provides no colour', () => {
    const defs = (_p: number, i: number): Partial<CardDef> | undefined =>
      i === 0 ? { level: 1, color: 'blue' } : i === 11 ? { color: 'blue' } : undefined;
    const state = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), { player: 0, zone: 'hand' });
      put(ctx, card(0, 1), { player: 0, zone: 'hand' });
      put(ctx, card(0, 11), { player: 0, zone: 'level' }, { face: 'DOWN' });
    }).state;
    // The blue level 1 card has the level but not the colour; the red level 0 card needs neither.
    expect(playable(state)).toEqual([oid(state, card(0, 1))]);
  });

  it('T-COST-004 / CR-8.4.3 and T-COST-002 / CR-8.4.2.2: the cost is paid from the top of the stock, and must be payable in full', () => {
    const defs = (_p: number, i: number): Partial<CardDef> | undefined => (i === 0 ? { cost: 2 } : undefined);

    const poor = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), { player: 0, zone: 'hand' });
      put(ctx, card(0, 20), { player: 0, zone: 'stock' });
    }).state;
    expect(playable(poor)).toEqual([]);

    const rich = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), { player: 0, zone: 'hand' });
      for (const i of [20, 21, 22]) put(ctx, card(0, i), { player: 0, zone: 'stock' });
    }).state;
    const { state, events } = answer(rich, {
      kind: 'MAIN',
      action: { type: 'PLAY_CHARACTER', card: oid(rich, card(0, 0)), slot: 'FL' },
    });
    expect(state.zones[0].stock).toEqual([card(0, 20)]);
    // Taken from the top down: the top stock card reaches the waiting room first.
    expect(state.zones[0].waitingRoom).toEqual([card(0, 22), card(0, 21)]);
    expect(events.find((e) => e.type === 'CARD_PLAYED')).toMatchObject({ stockPaid: 2 });
    // CR-8.6.2.3 before CR-8.6.2.5: the cost is paid before the character enters the stage.
    expect(moves(events).map((e) => e.reason)).toEqual(['COST', 'COST', 'PLAY']);
  });

  it('T-PLAY-006 / CR-8.6.2.5.1 and T-RA-012 / CR-9.6.2: a character played onto an occupied slot replaces the one there', () => {
    const start = scenario({ step: 'MAIN_START' }, (ctx) => {
      put(ctx, card(0, 0), { player: 0, zone: 'hand' });
      put(ctx, card(0, 5), stageSlot(0, 'FC'));
      put(ctx, card(0, 6), markerSlot(0, 'FC'));
    }).state;
    const { state, events } = answer(start, {
      kind: 'MAIN',
      action: { type: 'PLAY_CHARACTER', card: oid(start, card(0, 0)), slot: 'FC' },
    });
    expect(state.zones[0].stage.FC).toEqual([card(0, 0)]);
    // The old character and its marker (CR-3.7.3.2) are in the waiting room.
    expect([...state.zones[0].waitingRoom].sort()).toEqual([card(0, 5), card(0, 6)]);
    expect(state.zones[0].marker.FC).toEqual([]);
    expect(moves(events).map((e) => e.reason)).toEqual(['PLAY', 'RULE_ACTION', 'MARKER_DISCARD']);
    // T-CHK-002 / CR-4.5.2: the rule action was resolved before the next play timing.
    expect(pending(state, 'MAIN').player).toBe(0);
    assertInvariants(state, { settled: true });
  });

  it('T-TURN-005 / CR-6.5.1.2.2 and T-PLAY-007 / CR-8.6.2.5.2: an event goes to the resolution zone, then to the waiting room', () => {
    const defs = (_p: number, i: number): Partial<CardDef> | undefined => (i === 0 ? EVENT : undefined);
    const start = scenario({ step: 'MAIN_START', defs }, (ctx) => {
      put(ctx, card(0, 0), { player: 0, zone: 'hand' });
    }).state;
    expect(pending(start, 'MAIN').actions).toEqual([
      { type: 'PLAY_EVENT', card: oid(start, card(0, 0)) },
      { type: 'PASS' },
    ]);
    const { state, events } = answer(start, { kind: 'MAIN', action: { type: 'PLAY_EVENT', card: oid(start, card(0, 0)) } });
    expect(state.zones[0].waitingRoom).toEqual([card(0, 0)]);
    expect(state.zones[0].resolution).toEqual([]);
    expect(moves(events).map((e) => e.to.zone)).toEqual(['resolution', 'waitingRoom']);
  });

  it('CR-6.5.1.2: a climax card cannot be played in the main phase', () => {
    const state = scenario({ step: 'MAIN_START' }, (ctx) => {
      put(ctx, card(0, 45), { player: 0, zone: 'hand' });
      put(ctx, card(0, 10), { player: 0, zone: 'clock' });
    }).state;
    expect(pending(state, 'MAIN').actions).toEqual([{ type: 'PASS' }]);
  });

  it('T-TURN-007 / CR-6.5.1.2.4: the turn player may exchange the cards of two slots', () => {
    const start = scenario({ step: 'MAIN_START' }, (ctx) => {
      put(ctx, card(0, 5), stageSlot(0, 'FL'));
    }).state;
    const swaps = pending(start, 'MAIN').actions.filter((a): a is Extract<MainAction, { type: 'SWAP' }> => a.type === 'SWAP');
    // Only pairs that include the occupied slot are offered.
    expect(swaps).toHaveLength(4);
    expect(swaps.every((a) => a.a === 'FL' || a.b === 'FL')).toBe(true);

    const { state } = answer(start, { kind: 'MAIN', action: { type: 'SWAP', a: 'FL', b: 'BR' } });
    expect(state.zones[0].stage.FL).toEqual([]);
    expect(state.zones[0].stage.BR).toEqual([card(0, 5)]);
    expect(pending(state, 'MAIN').player).toBe(0);
  });

  it('rejects an action that is not among the legal ones', () => {
    const start = scenario({ step: 'MAIN_START' }, (ctx) => {
      put(ctx, card(0, 0), { player: 0, zone: 'hand' });
    }).state;
    const decision = pending(start, 'MAIN');
    const illegal: MainAction[] = [
      { type: 'PLAY_CHARACTER', card: oid(start, card(1, 49)), slot: 'FL' },
      { type: 'PLAY_EVENT', card: oid(start, card(0, 0)) },
      { type: 'SWAP', a: 'FL', b: 'FC' },
    ];
    for (const action of illegal) {
      const result = submitChoice(start, { player: 0, decisionId: decision.id, choice: { kind: 'MAIN', action } });
      expect(result).toMatchObject({ ok: false, code: 'ILLEGAL_CHOICE' });
    }
  });

  it('CR-6.5.1.3: passing ends the main phase', () => {
    const start = scenario({ step: 'MAIN_START' }).state;
    const { state, events } = answer(start, { kind: 'MAIN', action: { type: 'PASS' } });
    expect(phases(events)).toEqual(['CLIMAX']);
    expect(pending(state, 'CLIMAX').player).toBe(0);
  });
});

describe('climax phase (CR-6.6)', () => {
  const start = scenario({ step: 'CLIMAX_START' }, (ctx) => {
    put(ctx, card(0, 45), { player: 0, zone: 'hand' });
    put(ctx, card(0, 46), { player: 0, zone: 'hand' });
    put(ctx, card(0, 10), { player: 0, zone: 'clock' });
  }).state;

  it('T-TURN-008 / CR-6.6.1.2 and T-PLAY-004 / CR-8.6.2.1.2.1: a climax of a usable colour may be played, whatever the level', () => {
    const decision = pending(start, 'CLIMAX');
    expect([...decision.cards].sort()).toEqual([oid(start, card(0, 45)), oid(start, card(0, 46))].sort());
  });

  it('T-TURN-008 / CR-6.6.1.2.2: only one climax per turn, and T-TURN-011 / CR-6.8.1.3: it leaves at the end of the turn', () => {
    const { state, events } = answer(start, { kind: 'CLIMAX', card: oid(start, card(0, 45)) });

    // The climax was in the climax zone for the attack phase...
    const order = events.flatMap((e) => {
      if (e.type === 'PHASE_STARTED') return [e.phase];
      if (e.type === 'CARD_MOVED' && e.instanceId === card(0, 45)) return [`to ${e.to.zone}`];
      return [];
    });
    expect(order.slice(0, 4)).toEqual(['to climax', 'ATTACK', 'END', 'to waitingRoom']);
    // ...and no second climax decision came: the next decision belongs to the opponent's turn.
    expect(state.zones[0].climax).toEqual([]);
    expect(state.zones[0].waitingRoom).toEqual([card(0, 45)]);
    expect(state.zones[0].hand).toEqual([card(0, 46)]);
    expect(state.pending?.player).toBe(1);
  });

  it('CR-8.6.2.1.1: a climax needs a matching colour; the decision is still asked when none can be played', () => {
    const noColour = scenario({ step: 'CLIMAX_START' }, (ctx) => {
      put(ctx, card(0, 45), { player: 0, zone: 'hand' });
    }).state;
    expect(pending(noColour, 'CLIMAX').cards).toEqual([]);
    const { state } = answer(noColour, { kind: 'CLIMAX', card: null });
    expect(state.zones[0].hand).toEqual([card(0, 45)]);
  });
});

describe('end phase (CR-6.8)', () => {
  it('T-TURN-010 / CR-6.8.1.2: the turn player discards down to the hand limit of seven', () => {
    const start = scenario({ step: 'END_START' }, (ctx) => {
      for (let i = 0; i < 9; i++) put(ctx, card(0, i), { player: 0, zone: 'hand' });
    }).state;
    const decision = pending(start, 'HAND_LIMIT');
    expect(decision.count).toBe(2);
    expect(decision.cards).toHaveLength(9);

    const tooFew = submitChoice(start, {
      player: 0,
      decisionId: decision.id,
      choice: { kind: 'HAND_LIMIT', discard: [decision.cards[0]!] },
    });
    expect(tooFew).toMatchObject({ ok: false, code: 'ILLEGAL_CHOICE' });

    const discard = [oid(start, card(0, 3)), oid(start, card(0, 7))];
    const { state } = answer(start, { kind: 'HAND_LIMIT', discard });
    expect(state.zones[0].hand).toHaveLength(7);
    expect(state.zones[0].waitingRoom).toEqual([card(0, 3), card(0, 7)]);
  });

  it('with seven cards or fewer nothing is discarded', () => {
    const { state } = scenario({ step: 'END_START' }, (ctx) => {
      for (let i = 0; i < 7; i++) put(ctx, card(0, i), { player: 0, zone: 'hand' });
    });
    expect(state.zones[0].hand).toHaveLength(7);
    expect(state.pending?.kind).not.toBe('HAND_LIMIT');
  });

  it('T-TURN-013 / CR-6.8.1.5: the opponent becomes the turn player and the next turn starts with the stand phase', () => {
    const { state, events } = scenario({ step: 'END_START', turnPlayer: 0, turnNumber: 5 });
    expect(phases(events)).toEqual(['END', 'STAND', 'DRAW', 'CLOCK']);
    expect(events.find((e) => e.type === 'TURN_STARTED')).toMatchObject({ turn: 6, player: 1 });
    expect(state.turn).toMatchObject({ number: 6, player: 1, phase: 'CLOCK' });
    expect(pending(state, 'CLOCK').player).toBe(1);
  });

  it('CR-6.8.1.5: when the last check timing resolved something, the end phase is performed again', () => {
    const state = newTestState();
    state.firstPlayer = 0;
    state.turn = { number: 5, player: 0, phase: 'END', attackCount: 0 };
    state.stack = [{ kind: 'TURN', step: 'END_FINISH' }];
    state.lastCheckActed = true;
    const { state: after, events } = advance(state);
    // One more pass through the end phase (not announced again, CR-6.8.1.1), then the turn passes.
    expect(phases(events)).toEqual(['STAND', 'DRAW', 'CLOCK']);
    expect(after.lastCheckActed).toBe(false);
    expect(after.turn).toMatchObject({ number: 6, player: 1, phase: 'CLOCK' });
  });
});
