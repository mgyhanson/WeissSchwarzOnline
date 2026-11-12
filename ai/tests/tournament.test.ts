/**
 * Win rates between neighbouring levels. Slow (the Expert simulates), so it
 * runs only with AI_TOURNAMENT set:
 *
 *   npm run ai:tournament
 *
 * Seats and decks alternate, so each level plays each deck from each seat
 * equally often. Results of the latest run are recorded in ai/README.md.
 */

import { describe, expect, it } from 'vitest';
import type { PlayerId } from '@wso/game-engine';
import type { AiLevel } from '../src/index';
import { DECK_IDS, playMatch } from './match';

const RUN = process.env.AI_TOURNAMENT !== undefined;

const GAMES = 200;

/** stronger, weaker */
const PAIRS: [AiLevel, AiLevel][] = [
  ['NORMAL', 'BEGINNER'],
  ['ADVANCED', 'NORMAL'],
  ['EXPERT', 'ADVANCED'],
];

/**
 * "Clearly stronger": wins more than half by at least two standard errors
 * of a fair coin (for 200 games: at least 115 wins, 57.5%).
 */
const MINIMUM_WINS = Math.ceil(GAMES / 2 + Math.sqrt(GAMES));

describe.skipIf(!RUN)('AI tournament', () => {
  for (const [strong, weak] of PAIRS) {
    const games = GAMES;
    it(`${strong} wins at least ${MINIMUM_WINS} of ${games} games against ${weak}`, async () => {
      let wins = 0;
      const started = performance.now();
      for (let i = 0; i < games; i++) {
        // Let the test worker report progress during long runs.
        if (i % 10 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
        const seat = (i % 2) as PlayerId;
        const decks: [string, string] = Math.floor(i / 2) % 2 === 0 ? [DECK_IDS[0], DECK_IDS[1]] : [DECK_IDS[1], DECK_IDS[0]];
        const match = playMatch(seat === 0 ? [strong, weak] : [weak, strong], decks, `tournament-${strong}-${weak}-${i}`);
        expect(match.problems).toEqual([]);
        if (match.winner === seat) wins++;
      }
      const seconds = (performance.now() - started) / 1000;
      console.log(`[tournament] ${strong} vs ${weak}: ${wins}/${games} (${((wins / games) * 100).toFixed(1)}%), ${seconds.toFixed(0)} s, ${(seconds / games).toFixed(2)} s per game`);
      expect(wins).toBeGreaterThanOrEqual(MINIMUM_WINS);
    }, 3_600_000);
  }
});
