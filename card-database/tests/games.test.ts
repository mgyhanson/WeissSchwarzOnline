/**
 * Complete games with the real test decks, played by choosing at random
 * among the legal answers, with every invariant checked at every decision.
 * More of the same games are played by npm run soak.
 */

import { describe, expect, it } from 'vitest';
import { serializeState } from '@wso/game-engine';
import { type Played, playGameWith, randomPolicy, resultProblems } from '../../game-engine/tests/random-play';
import { GUP_TEST_DECK, TEST_DECKS, allCards, deckList, defsFor, expandDeck, getCard, validateDeck } from '../src/index';
import { abilitiesPlayed, realDeckConfig } from './real-decks';

describe('complete games with the real test decks', () => {
  it('90 random games, every pairing of the six test decks from both seats, reach a result with every invariant holding at every decision', () => {
    const games: Played[] = [];
    for (let i = 0; i < 90; i++) {
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
    // BDY/W135 batch 1: most of its 22 abilities are played in these games (the soak lists any never played).
    expect([...used].filter((u) => u.startsWith('BDY/W135-')).length).toBeGreaterThan(12);
  });

  it('a deck built with newly imported cards (GUP climaxes compiled from sentence patterns) is legal and plays whole games', () => {
    const imported = allCards().filter((c) => c.set === 'GUP_W141' && c.record.origin === 'PATTERN' && c.def.kind === 'CLIMAX');
    expect(imported.length).toBeGreaterThanOrEqual(4);
    // The test deck's characters, with its climaxes replaced by imported ones (two copies each of four kinds, one with an ability when placed).
    const withAbility = imported.filter((c) => c.def.abilities?.some((a) => a.type === 'AUTO'));
    const chosen = [...withAbility.slice(0, 1), ...imported.filter((c) => !withAbility.includes(c))].slice(0, 4);
    const entries = [...GUP_TEST_DECK.entries.filter((e) => getCard(e.cardId).def.kind !== 'CLIMAX'), ...chosen.map((c) => ({ cardId: c.record.cardId, count: 2 }))];
    const check = validateDeck(entries);
    expect(check.problems).toEqual([]);
    expect(check.playable).toBe(true);
    const mine = expandDeck(entries);
    const games: Played[] = [];
    for (let i = 0; i < 12; i++) {
      const other = deckList(TEST_DECKS[i % TEST_DECKS.length]!);
      const decks: [string[], string[]] = i % 2 === 0 ? [mine, other] : [other, mine];
      const game = playGameWith({ defs: defsFor(new Set([...decks[0], ...decks[1]])), decks }, `imported-${i}`, randomPolicy, 30_000);
      expect(game.problems, `imported-${i}`).toEqual([]);
      expect(resultProblems(game), `imported-${i}`).toEqual([]);
      games.push(game);
    }
    const used = abilitiesPlayed(games);
    // The imported climax with an ability was placed and its ability played.
    if (withAbility[0]) expect([...used].some((u) => u.startsWith(`${withAbility[0]!.record.cardId}#`))).toBe(true);
  });

  it('the second batch of the newest boosters (ANM, NIK, STS, GUP, BDY) plays whole games: an exercise deck of those twelve cards against every test deck', () => {
    // Not a legal deck (five titles) and not offered to players: it only puts the cards into complete games.
    const batch = ['ANM/W138-004', 'ANM/W138-068', 'ANM/W138-095', 'NIK/S135-029', 'NIK/S135-031', 'STS/W140-052', 'STS/W140-054', 'STS/W140-073', 'GUP/W141-069', 'GUP/W141-108', 'BDY/W135-038', 'BDY/W135-091'];
    for (const cardId of batch) expect(getCard(cardId).record.support, cardId).toBe('verified');
    const mine = expandDeck([...batch, 'BDY/W135-013', 'BDY/W135-035'].map((cardId) => ({ cardId, count: 3 })).concat([{ cardId: 'BDY/W135-026', count: 4 }, { cardId: 'GUP/W141-026', count: 4 }]));
    expect(mine).toHaveLength(50);
    const games: Played[] = [];
    for (let i = 0; i < 60; i++) {
      const other = deckList(TEST_DECKS[i % TEST_DECKS.length]!);
      const decks: [string[], string[]] = i % 2 === 0 ? [mine, other] : [other, mine];
      const game = playGameWith({ defs: defsFor(new Set([...decks[0], ...decks[1]])), decks }, `batch-4-${i}`, randomPolicy, 30_000);
      expect(game.problems, `batch-4-${i}`).toEqual([]);
      expect(resultProblems(game), `batch-4-${i}`).toEqual([]);
      games.push(game);
    }
    const used = abilitiesPlayed(games);
    const expected = batch.flatMap((cardId) => (getCard(cardId).def.abilities ?? []).flatMap((ability, index) => (ability.type === 'CONT' ? [] : [`${cardId}#${index}`])));
    expect(expected).toHaveLength(19);
    // Four abilities have conditions that random play with this deck does not reach (none in 180 games): a facing
    // level 3 character while at level 2 (ANM/W138-095), four other 《戦車道》 characters when the deck has only two
    // kinds (GUP/W141-108 #0), and being reversed by a character whose level is above its master's level, which
    // needs an effect that plays a character early (GUP/W141-108 #1, BDY/W135-091 #1). Those are covered by the
    // tests of the cards themselves (cards-batch-4.test.ts). Every other ability is played in these games.
    const rare = ['ANM/W138-095#0', 'GUP/W141-108#0', 'GUP/W141-108#1', 'BDY/W135-091#1'];
    expect(expected.filter((key) => !used.has(key) && !rare.includes(key))).toEqual([]);
  });

  it('INV-07: a game with the real decks replays exactly', () => {
    const first = playGameWith(realDeckConfig(), 'real-replay', randomPolicy, 30_000);
    const second = playGameWith(realDeckConfig(), 'real-replay', randomPolicy, 30_000);
    expect(first.problems).toEqual([]);
    expect(serializeState(second.state)).toBe(serializeState(first.state));
  });
});
