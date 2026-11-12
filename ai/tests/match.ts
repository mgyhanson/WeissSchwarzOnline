/**
 * Plays games between computer players the way a host does: each player
 * gets its own view and decision; an Expert also gets a world sampler made
 * by the host from the real state.
 */

import { type GameState, type PlayerId, checkInvariants, createGame, getPlayerView, submitChoice } from '@wso/game-engine';
import { TEST_DECKS, deckList, defsFor, getCard } from '@wso/card-database';
import { type AiLevel, type AiOptions, createAi, createWorldSampler } from '../src/index';

export const DECK_IDS = TEST_DECKS.map((d) => d.id) as [string, string];

export interface MatchResult {
  state: GameState;
  winner: PlayerId | null;
  decisions: number;
  problems: string[];
}

export function playMatch(
  levels: [AiLevel, AiLevel],
  decks: [string, string],
  seed: string,
  extra: Partial<AiOptions> = {},
  checkEvery = 0,
): MatchResult {
  const lists = decks.map((id) => deckList(TEST_DECKS.find((d) => d.id === id)!)) as [string[], string[]];
  const card = (id: string) => getCard(id).def;
  const ais = ([0, 1] as const).map((p) => createAi({ level: levels[p], card, deck: lists[p], seed: `${seed}-${p}`, ...extra }));
  let { state } = createGame({ defs: defsFor(new Set([...lists[0], ...lists[1]])), decks: lists }, seed);
  const problems: string[] = [];
  let decisions = 0;
  while (state.pending && !state.result && decisions < 5000) {
    const pending = state.pending;
    const p = pending.player;
    const view = getPlayerView(state, p);
    if (!view.decision?.mine) throw new Error('decision not in view');
    const sample = ais[p]!.level === 'EXPERT' ? createWorldSampler(state, p, lists[p]) : undefined;
    const choice = ais[p]!.choose(view, view.decision.decision, sample);
    const result = submitChoice(state, { player: p, decisionId: pending.id, choice });
    if (!result.ok) {
      problems.push(`${levels[p]} ${pending.kind}: ${result.message}`);
      break;
    }
    state = result.state;
    decisions++;
    if (checkEvery > 0 && decisions % checkEvery === 0) problems.push(...checkInvariants(state));
  }
  if (!state.result) problems.push(`no result after ${decisions} decisions`);
  const r = state.result;
  return { state, winner: r && r.outcome === 'WIN' ? r.winner : null, decisions, problems };
}

/** Plays `games` games with seats and decks alternating; returns the first level's wins. */
export function headToHead(a: AiLevel, b: AiLevel, games: number, prefix: string, extra: Partial<AiOptions> = {}) {
  let winsA = 0;
  let draws = 0;
  const problems: string[] = [];
  for (let i = 0; i < games; i++) {
    const aSeat = (i % 2) as PlayerId;
    const levels: [AiLevel, AiLevel] = aSeat === 0 ? [a, b] : [b, a];
    const decks: [string, string] = Math.floor(i / 2) % 2 === 0 ? [DECK_IDS[0], DECK_IDS[1]] : [DECK_IDS[1], DECK_IDS[0]];
    const match = playMatch(levels, decks, `${prefix}-${i}`, extra);
    problems.push(...match.problems);
    if (match.winner === null) draws++;
    else if (match.winner === aSeat) winsA++;
  }
  return { winsA, draws, games, problems };
}
