/**
 * The long run: thousands of complete random games with every invariant
 * checked at every decision. Too slow for every test run, so it only runs
 * when SOAK is set:
 *
 *   npm run soak              (1000 games per deck, 3000 in all)
 *   SOAK=200 npx vitest run game-engine/tests/soak.test.ts
 */

import { describe, expect, it } from 'vitest';
import { type DefOverride } from './helpers';
import { type Played, abilityDeck, iconDeck, playGame, randomPolicy, resultProblems } from './random-play';
import { serializeState } from '../src/index';

const GAMES = Number(process.env.SOAK ?? 0);

interface Tally {
  games: number;
  decisions: number;
  maxDecisions: number;
  outcomes: Record<string, number>;
  events: Record<string, number>;
}

function tally(games: Played[]): Tally {
  const result: Tally = { games: games.length, decisions: 0, maxDecisions: 0, outcomes: {}, events: {} };
  for (const game of games) {
    result.decisions += game.decisions;
    result.maxDecisions = Math.max(result.maxDecisions, game.decisions);
    const outcome = game.state.result!;
    const key = outcome.outcome === 'DRAW' ? 'DRAW' : outcome.reason;
    result.outcomes[key] = (result.outcomes[key] ?? 0) + 1;
    for (const e of game.events) {
      const name = e.type === 'DAMAGE_DEALT' ? (e.cancelled ? 'DAMAGE_CANCELLED' : 'DAMAGE_DEALT') : e.type;
      if (['REFRESH', 'LEVEL_UP', 'ATTACK_DECLARED', 'DAMAGE_DEALT', 'DAMAGE_CANCELLED', 'TRIGGER_CHECK', 'CARD_PLAYED', 'ABILITY_PLAYED'].includes(name)) {
        result.events[name] = (result.events[name] ?? 0) + 1;
      }
    }
  }
  return result;
}

const decks: [string, DefOverride | undefined][] = [
  ['plain', undefined],
  ['icons', iconDeck],
  ['abilities', abilityDeck],
];

describe.skipIf(GAMES <= 0)(`soak: ${GAMES} random games per deck`, () => {
  for (const [name, deck] of decks) {
    it(`${name} deck: every game reaches a result with all invariants holding (INV-01 to INV-07)`, () => {
      const games: Played[] = [];
      const failures: string[] = [];
      for (let i = 0; i < GAMES; i++) {
        const seed = `soak-${name}-${i}`;
        const game = playGame(seed, randomPolicy, 50_000, deck);
        const problems = [...game.problems, ...(game.state.result ? resultProblems(game) : [])];
        // INV-07 on every tenth game: the same seed and choices give the same game.
        if (i % 10 === 0 && problems.length === 0) {
          const again = playGame(seed, randomPolicy, 50_000, deck);
          if (serializeState(again.state) !== serializeState(game.state)) problems.push('replay differs (INV-07)');
        }
        if (problems.length > 0) failures.push(`${seed}: ${problems.slice(0, 3).join(' | ')}`);
        else games.push(game);
      }
      const summary = tally(games);
      console.log(`[soak ${name}] ${JSON.stringify(summary)}`);
      expect(failures).toEqual([]);
      expect(summary.games).toBe(GAMES);
    }, 600_000);
  }
});
