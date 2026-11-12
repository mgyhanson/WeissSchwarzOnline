/**
 * Complete games with the real test decks, played by choosing at random
 * among the legal answers, with every invariant checked at every decision.
 * More of the same games are played by npm run soak.
 */

import { describe, expect, it } from 'vitest';
import { serializeState } from '@wso/game-engine';
import { type Played, playGameWith, randomPolicy, resultProblems } from '../../game-engine/tests/random-play';
import { abilitiesPlayed, realDeckConfig } from './real-decks';

describe('complete games with the real test decks', () => {
  it('60 random games, every pairing of the five test decks from both seats, reach a result with every invariant holding at every decision', () => {
    const games: Played[] = [];
    for (let i = 0; i < 60; i++) {
      const game = playGameWith(realDeckConfig(i), `real-${i}`, randomPolicy, 30_000);
      expect(game.problems, `real-${i}`).toEqual([]);
      expect(resultProblems(game), `real-${i}`).toEqual([]);
      games.push(game);
    }
    const used = abilitiesPlayed(games);
    // The games actually exercised the card abilities of both decks.
    expect([...used].filter((u) => u.startsWith('SY/')).length).toBeGreaterThan(5);
    expect([...used].filter((u) => u.startsWith('5HY/')).length).toBeGreaterThan(8);
    expect(used.has('5HY/W83-T11#event')).toBe(true);
    expect([...used].filter((u) => u.startsWith('SAO/')).length).toBeGreaterThan(5);
    expect([...used].filter((u) => u.startsWith('GUP/')).length).toBeGreaterThan(5);
    // The second SAO batch: its own sets' abilities and the three new SAO/S20 cards.
    expect([...used].filter((u) => /^SAO\/S(51|65|71|80)-/.test(u)).length).toBeGreaterThan(5);
    expect([...used].filter((u) => /^SAO\/S20-0(18|76|80)#/.test(u)).length).toBeGreaterThan(1);
  });

  it('INV-07: a game with the real decks replays exactly', () => {
    const first = playGameWith(realDeckConfig(), 'real-replay', randomPolicy, 30_000);
    const second = playGameWith(realDeckConfig(), 'real-replay', randomPolicy, 30_000);
    expect(first.problems).toEqual([]);
    expect(serializeState(second.state)).toBe(serializeState(first.state));
  });
});
