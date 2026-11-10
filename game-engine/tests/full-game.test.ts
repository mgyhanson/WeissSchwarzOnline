/**
 * Whole games from setup to a result, played by choosing at random among
 * the legal answers, with every invariant checked after every decision.
 *
 * The cards have no abilities and there are no attacks yet (STEP 4c), so
 * these games end through the clock phase and refreshes only. They exercise
 * setup, every phase, playing cards, refresh, level up and the result.
 */

import { describe, expect, it } from 'vitest';
import {
  type CardDef,
  type Choice,
  type Decision,
  type GameEvent,
  type GameState,
  type PlayerId,
  type RngState,
  checkInvariants,
  createGame,
  getPlayerView,
  nextInt,
  opponentOf,
  redactEvent,
  seedRng,
  serializeState,
  submitChoice,
} from '../src/index';
import { shouldBeHidden, testConfig } from './helpers';

function pickSome(rng: RngState, items: readonly number[], count: number): number[] {
  const pool = [...items];
  const picked: number[] = [];
  for (let i = 0; i < count; i++) picked.push(pool.splice(nextInt(rng, pool.length), 1)[0]!);
  return picked;
}

type Policy = (decision: Decision, rng: RngState) => Choice;

/** Picks uniformly among sensible answers; passes the main phase a third of the time so turns end. */
const randomPolicy: Policy = (decision, rng) => {
  switch (decision.kind) {
    case 'MULLIGAN':
      return { kind: 'MULLIGAN', discard: pickSome(rng, decision.cards, nextInt(rng, decision.cards.length + 1)) };
    case 'CLOCK':
      return { kind: 'CLOCK', card: nextInt(rng, 4) === 0 ? null : decision.cards[nextInt(rng, decision.cards.length)]! };
    case 'MAIN': {
      if (nextInt(rng, 3) === 0) return { kind: 'MAIN', action: { type: 'PASS' } };
      return { kind: 'MAIN', action: decision.actions[nextInt(rng, decision.actions.length)]! };
    }
    case 'CLIMAX':
      if (decision.cards.length === 0 || nextInt(rng, 2) === 0) return { kind: 'CLIMAX', card: null };
      return { kind: 'CLIMAX', card: decision.cards[nextInt(rng, decision.cards.length)]! };
    case 'LEVEL_UP':
      return { kind: 'LEVEL_UP', card: decision.cards[nextInt(rng, decision.cards.length)]! };
    case 'HAND_LIMIT':
      return { kind: 'HAND_LIMIT', discard: pickSome(rng, decision.cards, decision.count) };
    case 'RULE_ACTION_ORDER':
      return { kind: 'RULE_ACTION_ORDER', first: decision.options[nextInt(rng, decision.options.length)]! };
  }
};

/** Never clocks, never plays: the game is decided by refreshes alone. */
const passivePolicy: Policy = (decision, rng) => {
  switch (decision.kind) {
    case 'MULLIGAN':
      return { kind: 'MULLIGAN', discard: [] };
    case 'CLOCK':
      return { kind: 'CLOCK', card: null };
    case 'MAIN':
      return { kind: 'MAIN', action: { type: 'PASS' } };
    case 'CLIMAX':
      return { kind: 'CLIMAX', card: null };
    default:
      return randomPolicy(decision, rng);
  }
};

/** Decisions that are only ever asked right after a check timing has finished. */
const SETTLED_KINDS = new Set<Decision['kind']>(['MULLIGAN', 'CLOCK', 'MAIN', 'CLIMAX', 'HAND_LIMIT']);

interface Played {
  state: GameState;
  events: GameEvent[];
  decisions: number;
  problems: string[];
}

function leakProblems(state: GameState, label: string): string[] {
  const problems: string[] = [];
  for (const viewer of [0, 1] as const) {
    const view = getPlayerView(state, viewer);
    const json = JSON.stringify(view);
    if (json.includes('instanceId')) problems.push(`${label}: view of P${viewer} exposes instanceId`);
    for (const inst of state.instances) {
      const shown = json.includes(`"${inst.cardId}"`);
      if (shown === shouldBeHidden(viewer, inst)) {
        problems.push(`${label}: P${viewer} ${shown ? 'can' : 'cannot'} see ${inst.cardId} in ${inst.location.zone}`);
      }
    }
    // The player who is not deciding learns nothing about the options.
    const decision = view.decision;
    if (decision && !decision.mine && Object.keys(decision).sort().join() !== 'id,kind,mine,player') {
      problems.push(`${label}: P${viewer} sees details of the opponent's decision`);
    }
  }
  return problems;
}

function playGame(seed: string, policy: Policy, maxDecisions: number, defs?: Parameters<typeof testConfig>[0]): Played {
  const rng = seedRng(`policy-${seed}`);
  const created = createGame(testConfig(defs), seed);
  let state = created.state;
  const events = [...created.events];
  const problems: string[] = [];
  let decisions = 0;

  while (!state.result && problems.length === 0) {
    const decision = state.pending;
    if (!decision) {
      problems.push('the game has neither a result nor a pending decision');
      break;
    }
    if (decisions >= maxDecisions) {
      problems.push(`no result after ${maxDecisions} decisions`);
      break;
    }
    const label = `decision ${decisions} (${decision.kind})`;
    for (const p of checkInvariants(state, { settled: SETTLED_KINDS.has(decision.kind) })) problems.push(`${label}: ${p}`);
    if (decisions % 20 === 0) problems.push(...leakProblems(state, label));

    const result = submitChoice(state, { player: decision.player, decisionId: decision.id, choice: policy(decision, rng) });
    if (!result.ok) {
      problems.push(`${label}: a choice built from the decision was rejected: ${result.code} ${result.message}`);
      break;
    }
    state = result.state;
    events.push(...result.events);
    decisions++;
  }

  if (state.result) {
    for (const p of checkInvariants(state)) problems.push(`final state: ${p}`);
  }
  return { state, events, decisions, problems };
}

describe('complete games', () => {
  it('40 random games reach a result with every invariant holding at every decision', () => {
    const reasons = new Set<string>();
    const winners = new Set<PlayerId>();
    let refreshes = 0;
    let levelUps = 0;
    let played = 0;

    for (let i = 0; i < 40; i++) {
      const game = playGame(`full-${i}`, randomPolicy, 20_000);
      expect(game.problems).toEqual([]);
      const result = game.state.result!;
      expect(result).not.toBeNull();

      if (result.outcome === 'WIN') {
        reasons.add(result.reason);
        winners.add(result.winner);
        expect(result.loser).toBe(opponentOf(result.winner));
        // T-WIN-003: the loser really is at level 4 (or out of cards).
        const loser = game.state.zones[result.loser];
        if (result.reason === 'LEVEL_4') expect(loser.level.length).toBeGreaterThanOrEqual(4);
        if (result.reason === 'NO_CARDS') expect(loser.deck.length + loser.waitingRoom.length).toBe(0);
      }

      // The game ended exactly once, and that is the last thing that happened.
      expect(game.events.filter((e) => e.type === 'GAME_ENDED')).toHaveLength(1);
      expect(game.events[game.events.length - 1]!.type).toBe('GAME_ENDED');
      // Event numbers are consecutive: nothing was dropped or recorded twice.
      game.events.forEach((e, index) => expect(e.seq).toBe(index + 1));

      refreshes += game.events.filter((e) => e.type === 'REFRESH').length;
      levelUps += game.events.filter((e) => e.type === 'LEVEL_UP').length;
      played += game.events.filter((e) => e.type === 'CARD_PLAYED').length;
    }

    // The sample must actually have exercised the mechanics.
    expect(reasons.has('LEVEL_4')).toBe(true);
    expect(winners.size).toBe(2);
    expect(levelUps).toBeGreaterThan(100);
    expect(played).toBeGreaterThan(500);
    expect(refreshes).toBeGreaterThan(0);
  });

  it('games with coloured, levelled and costed cards also reach a result', () => {
    // Characters of four colours with levels 0 to 3; events; climaxes of two colours.
    const colors = ['red', 'blue', 'green', 'yellow'];
    const defs = (_player: PlayerId, i: number): Partial<CardDef> | undefined => {
      if (i >= 42) return { color: colors[i % 2]! };
      if (i >= 36) return { kind: 'EVENT', power: null, soul: null, level: i % 3, cost: 0, color: colors[i % 4]! };
      return { level: i % 4, cost: 0, color: colors[i % 4]!, power: 500 * (1 + (i % 4)) };
    };
    let kinds = new Set<string>();
    for (let i = 0; i < 15; i++) {
      const game = playGame(`mixed-${i}`, randomPolicy, 20_000, defs);
      expect(game.problems).toEqual([]);
      expect(game.state.result).not.toBeNull();
      for (const e of game.events) if (e.type === 'CARD_PLAYED') kinds.add(e.cardKind);
    }
    expect([...kinds].sort()).toEqual(['CHARACTER', 'CLIMAX', 'EVENT']);
  });

  it('a game where nobody ever clocks or plays is decided by refreshes (CR-9.2.2)', () => {
    const game = playGame('passive', passivePolicy, 60_000);
    expect(game.problems).toEqual([]);
    expect(game.state.result).toMatchObject({ outcome: 'WIN', reason: 'LEVEL_4' });
    // Every clock card of this game came from a refresh: 7 per level, 4 levels.
    const loser = (game.state.result as { loser: PlayerId }).loser;
    const loserRefreshes = game.events.filter((e) => e.type === 'REFRESH' && e.player === loser).length;
    expect(loserRefreshes).toBe(28);
    expect(game.events.some((e) => e.type === 'CARD_PLAYED')).toBe(false);
  });

  it('INV-07: the same seed and the same choices replay to exactly the same game', () => {
    const first = playGame('replay', randomPolicy, 20_000);
    const second = playGame('replay', randomPolicy, 20_000);
    expect(first.problems).toEqual([]);
    expect(serializeState(second.state)).toBe(serializeState(first.state));
    expect(JSON.stringify(second.events)).toBe(JSON.stringify(first.events));
  });

  it('INV-06: no event sent to a player reveals a card that player could not see', () => {
    const game = playGame('events', randomPolicy, 20_000);
    expect(game.problems).toEqual([]);
    for (const event of game.events) {
      for (const viewer of [0, 1] as const) {
        const json = JSON.stringify(redactEvent(event, viewer));
        expect(json).not.toContain('instanceId');
        if (event.type === 'CARD_MOVED') {
          const observable = event.visibleBefore[viewer] || event.visibleAfter[viewer];
          expect(json.includes(`"${event.cardId}"`)).toBe(observable);
        }
      }
    }
  });
});
