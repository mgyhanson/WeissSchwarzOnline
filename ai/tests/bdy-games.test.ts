/**
 * The BDY/W135 test deck in complete games between computer players:
 * against every other test deck, from both seats, with the rules checked
 * along the way. The numbers are printed for reports/TEST_REPORT.md.
 */

import { describe, expect, it } from 'vitest';
import { TEST_DECKS } from '@wso/card-database';
import { playMatch } from './match';

describe('BDY/W135 test deck: complete games between computer players', () => {
  it('ADVANCED against ADVANCED: 40 games against the five other decks all reach a result without a rule problem', () => {
    const others = TEST_DECKS.filter((d) => d.id !== 'test-bdy').map((d) => d.id);
    expect(others).toHaveLength(5);
    let wins = 0;
    let games = 0;
    let decisions = 0;
    for (const other of others) {
      for (let g = 0; g < 8; g++) {
        const bdySeat = g % 2;
        const decks: [string, string] = bdySeat === 0 ? ['test-bdy', other] : [other, 'test-bdy'];
        const match = playMatch(['ADVANCED', 'ADVANCED'], decks, `bdy-${other}-${g}`, {}, 10);
        expect(match.problems, `${other} game ${g}`).toEqual([]);
        expect(match.state.result, `${other} game ${g}`).not.toBeNull();
        games++;
        decisions += match.decisions;
        if (match.winner === bdySeat) wins++;
      }
    }
    console.log(`[bdy games] ${JSON.stringify({ games, bdyWins: wins, averageDecisions: Math.round(decisions / games) })}`);
    expect(games).toBe(40);
    // The deck is able to win and to lose: it is neither helpless nor broken.
    expect(wins).toBeGreaterThan(4);
    expect(wins).toBeLessThan(36);
  });
});
