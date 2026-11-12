/**
 * The Expert level: for the decisions that shape a turn (main phase
 * actions, climax, attacks, clock, counter, level up) it takes the
 * Advanced level's best few answers and plays each of them out in several
 * sampled worlds (sampler.ts) until the end of the following turn, with the
 * Advanced level playing both sides. It picks the answer with the best
 * average result. Every candidate is tried in the same worlds, so the
 * comparison is fair. Other decisions are answered like Advanced.
 *
 * Finishing a game shows up naturally: an answer that wins in the
 * simulations scores far above any position.
 */

import { type Choice, type Decision, type GameState, type PlayerView, type RngState, getPlayerView, submitChoice } from '@wso/game-engine';
import { evaluate } from './evaluate';
import { HeuristicPlayer } from './heuristic';
import type { CardLookup } from './knowledge';
import type { WorldSampler } from './types';

export const DEFAULT_SIMULATED: readonly Decision['kind'][] = ['MAIN', 'CLIMAX', 'ATTACK', 'CLOCK', 'COUNTER', 'LEVEL_UP'];

/** Safety stop for one simulation. */
const MAX_STEPS = 500;

export interface ExpertSettings {
  samples: number;
  candidates: number;
  timeLimitMs: number;
  /** Decisions compared by simulation; the others are answered like Advanced. */
  simulate?: readonly Decision['kind'][];
  /** How far each simulation runs: to the end of this turn, or of the following one. */
  horizon?: 'THIS_TURN' | 'NEXT_TURN';
}

function same(a: Choice, b: Choice): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export class ExpertPlayer {
  private readonly advanced: HeuristicPlayer;

  constructor(
    card: CardLookup,
    private readonly settings: ExpertSettings,
    private readonly rng: RngState,
  ) {
    this.advanced = new HeuristicPlayer('ADVANCED', card);
  }

  choose(view: PlayerView, decision: Decision, sample?: WorldSampler): Choice {
    const simulated = this.settings.simulate ?? DEFAULT_SIMULATED;
    const ranked = simulated.includes(decision.kind) ? this.advanced.rank(view, decision) : null;
    if (!sample || !ranked) return this.advanced.choose(view, decision);
    const candidates: Choice[] = [];
    for (const choice of ranked) {
      if (candidates.length >= this.settings.candidates) break;
      if (!candidates.some((c) => same(c, choice))) candidates.push(choice);
    }
    // Doing nothing is always worth comparing (pass, no climax, end attacks, no counter...).
    const fallback = ranked[ranked.length - 1]!;
    if (decision.kind !== 'LEVEL_UP' && !candidates.some((c) => same(c, fallback))) candidates.push(fallback);
    if (candidates.length === 1) return this.advanced.choose(view, decision);

    const totals = candidates.map(() => 0);
    const started = now();
    let samples = 0;
    while (samples < this.settings.samples && (samples === 0 || now() - started < this.settings.timeLimitMs)) {
      const world = sample(this.rng);
      candidates.forEach((choice, i) => {
        totals[i]! += this.playOut(world, decision, choice);
      });
      samples++;
    }
    let best = 0;
    for (let i = 1; i < candidates.length; i++) if (totals[i]! > totals[best]!) best = i;
    const choice = candidates[best]!;
    // Keep the Advanced player's per-turn bookkeeping in step.
    if (same(choice, ranked[0]!)) this.advanced.choose(view, decision);
    return choice;
  }

  /** Plays `choice` in a sampled world, then both sides as Advanced until the following turn is over. */
  private playOut(world: GameState, decision: Decision, choice: Choice): number {
    const me = decision.player;
    const first = submitChoice(world, { player: me, decisionId: world.pending?.id ?? -1, choice });
    if (!first.ok) return -1e9;
    let state = first.state;
    const lookup: CardLookup = (id) => {
      const def = state.defs[id];
      if (!def) throw new Error(`No card data for ${id}`);
      return def;
    };
    const players = [new HeuristicPlayer('ADVANCED', lookup), new HeuristicPlayer('ADVANCED', lookup)] as const;
    const horizon = (world.turn?.number ?? 0) + (this.settings.horizon === 'THIS_TURN' ? 0 : 1);
    for (let step = 0; step < MAX_STEPS && state.pending && !state.result && (state.turn?.number ?? 0) <= horizon; step++) {
      const pending = state.pending;
      const view = getPlayerView(state, pending.player);
      if (!view.decision?.mine) break;
      const result = submitChoice(state, { player: pending.player, decisionId: pending.id, choice: players[pending.player].choose(view, view.decision.decision) });
      if (!result.ok) break;
      state = result.state;
    }
    return evaluate(getPlayerView(state, me));
  }
}
