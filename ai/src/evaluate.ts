/**
 * How good a position looks for the viewer, from the viewer's PlayerView.
 * The Expert level scores the end of each simulation with it.
 *
 * The weights were learned, not guessed: a logistic regression predicting
 * the winner from the features in features.ts, fitted on the positions at
 * the start of every turn of 3000 games between two Advanced players with
 * the two test decks (85,478 positions, 66% of winners predicted, log loss
 * 0.581; 2026-11-12). The score is the log-odds of winning times 1000.
 * A hand-written version valued a card in hand at a third of a point of
 * damage; the data say they are worth about the same, and stock more.
 *
 * Refit when the card pool changes (ai/README.md describes how).
 */

import type { PlayerView } from '@wso/game-engine';
import { features } from './features';

/** Weights in the order of FEATURE_NAMES. */
const WEIGHTS = [
  -0.3708, // bias
  -0.0949, // damageMe
  0.0949, // damageOpp
  -0.3159, // dangerMe (damage above 20)
  0.3159, // dangerOpp
  0.0985, // handMe
  -0.0985, // handOpp
  0.1498, // stockMe
  -0.1498, // stockOpp
  0.0528, // frontPowerMe (per 1000)
  -0.0528, // frontPowerOpp
  0.1141, // frontSoulMe
  -0.1141, // frontSoulOpp
  -0.2462, // frontCountMe
  0.2462, // frontCountOpp
  0.1894, // backCountMe
  -0.1894, // backCountOpp
  0.0278, // stageLevelMe
  -0.0278, // stageLevelOpp
  0.021, // deckMe (per 10 cards)
  -0.021, // deckOpp
  0.7415, // myTurn
];

/** Log-odds of winning × 1000. A won game is worth far more than any position. */
export function evaluate(view: PlayerView): number {
  if (view.result) {
    if (view.result.outcome === 'DRAW') return 0;
    return view.result.winner === view.viewer ? 100_000 : -100_000;
  }
  const f = features(view);
  let logit = 0;
  for (let i = 0; i < WEIGHTS.length; i++) logit += WEIGHTS[i]! * f[i]!;
  return logit * 1000;
}

/** The estimated chance of winning, for display and tests. */
export function winChance(view: PlayerView): number {
  return 1 / (1 + Math.exp(-evaluate(view) / 1000));
}
