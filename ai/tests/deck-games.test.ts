/**
 * Every test deck made from the newest boosters in complete games between
 * computer players: against every other test deck, from both seats, with
 * the rules checked along the way. The numbers are printed for
 * reports/TEST_REPORT.md.
 */

import { describe, expect, it } from 'vitest';
import { TEST_DECKS } from '@wso/card-database';
import { playMatch } from './match';

describe('test decks of the newest boosters: complete games between computer players', () => {
  it.each(['test-bdy', 'test-sts', 'test-anm', 'test-nik'])('%s: ADVANCED against ADVANCED, four games against each other deck, all reach a result without a rule problem', (deckId) => {
    const others = TEST_DECKS.filter((d) => d.id !== deckId).map((d) => d.id);
    expect(others).toHaveLength(TEST_DECKS.length - 1);
    let wins = 0;
    let games = 0;
    let decisions = 0;
    for (const other of others) {
      for (let g = 0; g < 4; g++) {
        const seat = g % 2;
        const decks: [string, string] = seat === 0 ? [deckId, other] : [other, deckId];
        const match = playMatch(['ADVANCED', 'ADVANCED'], decks, `${deckId}-${other}-${g}`, {}, 10);
        expect(match.problems, `${other} game ${g}`).toEqual([]);
        expect(match.state.result, `${other} game ${g}`).not.toBeNull();
        games++;
        decisions += match.decisions;
        if (match.winner === seat) wins++;
      }
    }
    console.log(`[deck games] ${JSON.stringify({ deck: deckId, games, wins, averageDecisions: Math.round(decisions / games) })}`);
    expect(games).toBe(4 * (TEST_DECKS.length - 1));
    // The deck is able to win and to lose: it is neither helpless nor broken.
    expect(wins).toBeGreaterThan(0);
    expect(wins).toBeLessThan(games);
    // The BDY deck keeps the bounds it had when it was the only one (more than 10%, fewer than 90% of its games).
    if (deckId === 'test-bdy') {
      expect(wins).toBeGreaterThan(games * 0.1);
      expect(wins).toBeLessThan(games * 0.9);
    }
  });
});
