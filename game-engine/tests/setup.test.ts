import { describe, expect, it } from 'vitest';
import {
  OPENING_HAND_SIZE,
  type PlayerId,
  assertInvariants,
  createGame,
  getInstance,
  getPendingDecision,
  getPlayerView,
  opponentOf,
  resign,
  serializeState,
  submitChoice,
} from '../src/index';
import { DECK_SIZE, answer, pending, testCardId, testConfig } from './helpers';

describe('game setup (CR-5.2)', () => {
  it('T-SETUP-001 / CR-5.2.1.2: both decks are shuffled', () => {
    const { state } = createGame(testConfig(), 'setup-1');
    for (const player of [0, 1] as const) {
      const zones = state.zones[player];
      const everything = [...zones.deck, ...zones.hand].map((id) => getInstance(state, id).cardId);
      const listed = Array.from({ length: DECK_SIZE }, (_, i) => testCardId(player, i));
      expect([...everything].sort()).toEqual(listed);
      expect(everything).not.toEqual(listed);
    }
    assertInvariants(state, { settled: true });
  });

  it('T-SETUP-002 / CR-5.2.1.3: the first player is decided at random by the seed', () => {
    const firsts = new Set<PlayerId>();
    for (let i = 0; i < 20; i++) {
      const a = createGame(testConfig(), `first-${i}`).state.firstPlayer;
      const b = createGame(testConfig(), `first-${i}`).state.firstPlayer;
      expect(a).not.toBeNull();
      expect(a).toBe(b);
      firsts.add(a as PlayerId);
    }
    expect(firsts.size).toBe(2);
  });

  it('T-SETUP-003 / CR-5.2.1.4: each player draws five cards, then the first player decides the exchange first', () => {
    const { state, events } = createGame(testConfig(), 'setup-3');
    const first = state.firstPlayer as PlayerId;

    expect(state.zones[0].hand).toHaveLength(OPENING_HAND_SIZE);
    expect(state.zones[1].hand).toHaveLength(OPENING_HAND_SIZE);
    expect(state.zones[0].deck).toHaveLength(DECK_SIZE - OPENING_HAND_SIZE);
    expect(events.some((e) => e.type === 'GAME_STARTED' && e.firstPlayer === first)).toBe(true);

    const decision = pending(state, 'MULLIGAN');
    expect(decision.player).toBe(first);
    expect([...decision.cards].sort()).toEqual(state.zones[first].hand.map((id) => getInstance(state, id).objectId).sort());
    expect(state.turn).toBeNull();
  });

  it('T-SETUP-003 / CR-5.2.1.4: discarded cards go to the waiting room and as many are drawn; each player once', () => {
    const start = createGame(testConfig(), 'setup-4').state;
    const first = start.firstPlayer as PlayerId;
    const second = opponentOf(first);
    const discard = pending(start, 'MULLIGAN').cards.slice(0, 2);
    const discardedCards = discard.map((objectId) => start.instances.find((c) => c.objectId === objectId)!.instanceId);

    const afterFirst = answer(start, { kind: 'MULLIGAN', discard }).state;
    expect(afterFirst.zones[first].waitingRoom).toEqual(discardedCards);
    expect(afterFirst.zones[first].hand).toHaveLength(OPENING_HAND_SIZE);
    expect(afterFirst.zones[first].deck).toHaveLength(DECK_SIZE - OPENING_HAND_SIZE - 2);
    for (const id of discardedCards) expect(afterFirst.zones[first].hand).not.toContain(id);

    // Now, and only now, the second player decides.
    expect(pending(afterFirst, 'MULLIGAN').player).toBe(second);
    const afterSecond = answer(afterFirst, { kind: 'MULLIGAN', discard: [] }).state;
    expect(afterSecond.zones[second].waitingRoom).toEqual([]);
    expect(afterSecond.zones[second].hand).toHaveLength(OPENING_HAND_SIZE);
    // Nobody is asked a second time.
    expect(getPendingDecision(afterSecond)?.kind).not.toBe('MULLIGAN');
  });

  it('T-SETUP-004 / CR-5.2.1.5 and T-TURN-002 / CR-6.3.1.2: the first player starts and draws on the first turn', () => {
    let state = createGame(testConfig(), 'setup-5').state;
    const first = state.firstPlayer as PlayerId;
    state = answer(state, { kind: 'MULLIGAN', discard: [] }).state;
    const { state: started, events } = answer(state, { kind: 'MULLIGAN', discard: [] });

    expect(started.turn).toMatchObject({ number: 1, player: first, phase: 'CLOCK' });
    expect(events.filter((e) => e.type === 'PHASE_STARTED').map((e) => e.type === 'PHASE_STARTED' && e.phase)).toEqual([
      'STAND',
      'DRAW',
      'CLOCK',
    ]);
    // Five cards plus the draw of the first draw phase.
    expect(started.zones[first].hand).toHaveLength(OPENING_HAND_SIZE + 1);
    expect(started.zones[opponentOf(first)].hand).toHaveLength(OPENING_HAND_SIZE);
    expect(pending(started, 'CLOCK').player).toBe(first);
    assertInvariants(started, { settled: true });
  });
});

describe('submitting choices', () => {
  const start = createGame(testConfig(), 'submit').state;
  const decision = pending(start, 'MULLIGAN');
  const before = serializeState(start);

  it('rejects a choice from the player who is not deciding', () => {
    const result = submitChoice(start, {
      player: opponentOf(decision.player),
      decisionId: decision.id,
      choice: { kind: 'MULLIGAN', discard: [] },
    });
    expect(result).toMatchObject({ ok: false, code: 'NOT_YOUR_DECISION' });
  });

  it('rejects an illegal choice', () => {
    const notInHand = start.zones[opponentOf(decision.player)].hand[0]!;
    const cases: unknown[] = [
      { kind: 'MULLIGAN', discard: [getInstance(start, notInHand).objectId] },
      { kind: 'MULLIGAN', discard: [decision.cards[0], decision.cards[0]] },
      { kind: 'MULLIGAN', discard: 'all' },
      { kind: 'CLOCK', card: null },
      null,
      'MULLIGAN',
    ];
    for (const choice of cases) {
      const result = submitChoice(start, { player: decision.player, decisionId: decision.id, choice: choice as never });
      expect(result).toMatchObject({ ok: false, code: 'ILLEGAL_CHOICE' });
    }
  });

  it('a rejected submission changes nothing', () => {
    expect(serializeState(start)).toBe(before);
  });

  it('a duplicate or late submission is rejected as stale', () => {
    const next = answer(start, { kind: 'MULLIGAN', discard: [] }).state;
    // The original state is untouched by an accepted submission as well.
    expect(serializeState(start)).toBe(before);
    const again = submitChoice(next, {
      player: decision.player,
      decisionId: decision.id,
      choice: { kind: 'MULLIGAN', discard: [] },
    });
    expect(again).toMatchObject({ ok: false, code: 'STALE_DECISION' });
  });

  it('INV-06: the other player sees who is deciding, but not the options', () => {
    const mine = getPlayerView(start, decision.player).decision;
    const theirs = getPlayerView(start, opponentOf(decision.player)).decision;
    expect(mine).toEqual({ mine: true, decision });
    expect(theirs).toEqual({ mine: false, id: decision.id, player: decision.player, kind: 'MULLIGAN' });
  });
});

describe('conceding', () => {
  it('T-WIN-006 / CR-1.2.4: a player may resign at any time and loses immediately', () => {
    const start = createGame(testConfig(), 'resign').state;
    const resigning = opponentOf(pending(start, 'MULLIGAN').player);
    const { state, events } = resign(start, resigning);

    expect(state.result).toEqual({ outcome: 'WIN', winner: opponentOf(resigning), loser: resigning, reason: 'RESIGNED' });
    expect(events.map((e) => e.type)).toEqual(['GAME_ENDED']);
    expect(getPendingDecision(state)).toBeNull();
    expect(getPlayerView(state, 0).result).toEqual(state.result);

    const late = submitChoice(state, { player: 0, decisionId: 1, choice: { kind: 'MULLIGAN', discard: [] } });
    expect(late).toMatchObject({ ok: false, code: 'GAME_OVER' });
  });
});
