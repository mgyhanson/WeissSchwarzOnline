/**
 * Refits the weights of the learned evaluation (src/evaluate.ts). Slow, so
 * it runs only on request:
 *
 *   npm run ai:fit
 *
 * Plays FIT_GAMES (default 3000) games between two Advanced players with the
 * test decks, records the features of both players' views at the start of
 * every turn together with who won, and fits a logistic regression. Copy the
 * printed weights into src/evaluate.ts, then rerun npm run ai:tournament.
 */

import { describe, it } from 'vitest';
import { createGame, getPlayerView, submitChoice, type Decision, type PlayerId } from '@wso/game-engine';
import { TEST_DECKS, deckList, defsFor, getCard } from '@wso/card-database';
import { HeuristicPlayer } from '../src/heuristic';
import { features, FEATURE_NAMES } from '../src/features';
const card = (id: string) => getCard(id).def;
describe.skipIf(process.env.AI_FIT === undefined)('evaluation fit', () => {
it('fits the evaluation weights to game results', async () => {
  const X: number[][] = []; const y: number[] = [];
  const games = Number(process.env.FIT_GAMES ?? 3000);
  for (let g = 0; g < games; g++) {
    if (g % 100 === 0) await new Promise((r) => setTimeout(r, 0));
    const ids = g % 2 === 0 ? [0, 1] : [1, 0];
    const lists = ids.map((k) => deckList(TEST_DECKS[k]!)) as [string[], string[]];
    const P = [new HeuristicPlayer('ADVANCED', card), new HeuristicPlayer('ADVANCED', card)];
    let { state } = createGame({ defs: defsFor(new Set([...lists[0], ...lists[1]])), decks: lists }, `fit-${g}`);
    const rows: [number[], PlayerId][] = [];
    let lastTurn = -1;
    while (state.pending && !state.result) {
      const p = state.pending.player; const v = getPlayerView(state, p);
      // One position per turn and player: the start of each turn, seen by both players.
      if (state.turn && state.turn.number !== lastTurn) {
        lastTurn = state.turn.number;
        for (const q of [0, 1] as const) rows.push([features(getPlayerView(state, q)), q]);
      }
      const r = submitChoice(state, { player: p, decisionId: state.pending.id, choice: P[p]!.choose(v, (v.decision as any).decision as Decision) });
      if (!r.ok) throw new Error(r.message); state = r.state;
    }
    const res = state.result!;
    if (res.outcome !== 'WIN') continue;
    for (const [f, q] of rows) { X.push(f); y.push(res.winner === q ? 1 : 0); }
  }
  // Standardise (except bias), then logistic regression by gradient descent with a little L2.
  const n = X.length, d = X[0]!.length;
  const mean = Array(d).fill(0), sd = Array(d).fill(1);
  for (let j = 1; j < d; j++) { mean[j] = X.reduce((a, r) => a + r[j]!, 0) / n; sd[j] = Math.sqrt(X.reduce((a, r) => a + (r[j]! - mean[j]) ** 2, 0) / n) || 1; }
  const Z = X.map((r) => r.map((v, j) => (j === 0 ? 1 : (v - mean[j]) / sd[j])));
  const w = Array(d).fill(0);
  for (let it = 0; it < 3000; it++) {
    const grad = Array(d).fill(0);
    for (let i = 0; i < n; i++) { const z = Z[i]!; const p = 1 / (1 + Math.exp(-z.reduce((a, v, j) => a + v * w[j], 0))); for (let j = 0; j < d; j++) grad[j] += (p - y[i]!) * z[j]!; }
    for (let j = 0; j < d; j++) w[j] -= 0.5 * (grad[j] / n + (j ? 1e-3 * w[j] : 0));
  }
  // Back to raw features.
  const raw = Array(d).fill(0);
  raw[0] = w[0] - w.slice(1).reduce((a, wj, k) => a + (wj * mean[k + 1]) / sd[k + 1], 0);
  for (let j = 1; j < d; j++) raw[j] = w[j] / sd[j];
  let ll = 0, correct = 0;
  for (let i = 0; i < n; i++) { const p = 1 / (1 + Math.exp(-X[i]!.reduce((a, v, j) => a + v * raw[j], 0))); ll += y[i] ? Math.log(p) : Math.log(1 - p); if ((p > 0.5) === (y[i] === 1)) correct++; }
  console.log('[fit] positions', n, 'accuracy', (correct / n).toFixed(3), 'logloss', (-ll / n).toFixed(4));
  console.log('[fit] weights', JSON.stringify(Object.fromEntries(FEATURE_NAMES.map((k, j) => [k, Number(raw[j].toFixed(4))]))));
}, 3_600_000);
});
