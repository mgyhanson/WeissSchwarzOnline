/**
 * Whole games from setup to a result, played by choosing at random among
 * the legal answers, with every invariant checked after every decision.
 * The same games, in much larger numbers, are played by npm run soak.
 */

import { describe, expect, it } from 'vitest';
import { type PlayerId, opponentOf, redactEvent, serializeState } from '../src/index';
import { ALL_ICONS, CHARACTER_ABILITIES, abilityDeck, iconDeck, passivePolicy, playGame, randomPolicy, resultProblems } from './random-play';

describe('complete games', () => {
  it('40 random games reach a result with every invariant holding at every decision', () => {
    const reasons = new Set<string>();
    const winners = new Set<PlayerId>();
    let refreshes = 0;
    let levelUps = 0;
    let played = 0;

    for (let i = 0; i < 40; i++) {
      const game = playGame(`full-${i}`, randomPolicy, 20_000);
      expect(game.problems).toEqual([]);
      expect(resultProblems(game)).toEqual([]);
      const result = game.state.result!;
      expect(result).not.toBeNull();

      if (result.outcome === 'WIN') {
        reasons.add(result.reason);
        winners.add(result.winner);
        expect(result.loser).toBe(opponentOf(result.winner));
        // T-WIN-003: the loser really is at level 4 (or out of cards).
        const loser = game.state.zones[result.loser];
        if (result.reason === 'LEVEL_4') expect(loser.level.length).toBeGreaterThanOrEqual(4);
        if (result.reason === 'NO_CARDS') expect(loser.deck.length + loser.waitingRoom.length).toBe(0);
      }

      // The game ended exactly once, and that is the last thing that happened.
      expect(game.events.filter((e) => e.type === 'GAME_ENDED')).toHaveLength(1);
      expect(game.events[game.events.length - 1]!.type).toBe('GAME_ENDED');
      // Event numbers are consecutive: nothing was dropped or recorded twice.
      game.events.forEach((e, index) => expect(e.seq).toBe(index + 1));

      refreshes += game.events.filter((e) => e.type === 'REFRESH').length;
      levelUps += game.events.filter((e) => e.type === 'LEVEL_UP').length;
      played += game.events.filter((e) => e.type === 'CARD_PLAYED').length;
    }

    // The sample must actually have exercised the mechanics.
    expect(reasons.has('LEVEL_4')).toBe(true);
    expect(winners.size).toBe(2);
    expect(levelUps).toBeGreaterThan(100);
    expect(played).toBeGreaterThan(500);
    expect(refreshes).toBeGreaterThan(0);
  });

  it('games with every trigger icon, counters, levels, colours and costs reach a result', () => {
    const defs = iconDeck;
    const icons = ALL_ICONS;

    const cardKinds = new Set<string>();
    const decisionKinds = new Set<string>();
    const iconsSeen = new Set<string>();
    const attackTypes = new Set<string>();
    let cancelled = 0;
    let dealt = 0;
    let encores = 0;
    let reversed = 0;

    for (let i = 0; i < 25; i++) {
      const game = playGame(`mixed-${i}`, randomPolicy, 20_000, defs);
      expect(game.problems).toEqual([]);
      expect(game.state.result).not.toBeNull();
      for (const kind of game.kinds) decisionKinds.add(kind);
      for (const e of game.events) {
        if (e.type === 'CARD_PLAYED') cardKinds.add(e.cardKind);
        if (e.type === 'TRIGGER_CHECK') for (const icon of e.icons) iconsSeen.add(icon);
        if (e.type === 'ATTACK_DECLARED') attackTypes.add(e.attackType);
        if (e.type === 'DAMAGE_DEALT') e.cancelled ? cancelled++ : dealt++;
        if (e.type === 'CARD_MOVED' && e.reason === 'ENCORE') encores++;
        if (e.type === 'ORIENTATION_CHANGED' && e.to === 'REVERSE') reversed++;
      }
    }

    // The sample must actually have exercised the mechanics.
    expect([...cardKinds].sort()).toEqual(['CHARACTER', 'CLIMAX', 'EVENT']);
    expect([...iconsSeen].sort()).toEqual([...icons].sort());
    expect([...attackTypes].sort()).toEqual(['DIRECT', 'FRONT', 'SIDE']);
    for (const kind of ['MULLIGAN', 'CLOCK', 'MAIN', 'CLIMAX', 'ATTACK', 'COUNTER', 'LEVEL_UP', 'CONFIRM', 'SELECT_CARDS', 'SELECT_SLOT', 'SELECT_OPTION']) {
      expect(decisionKinds.has(kind), `no ${kind} decision came up`).toBe(true);
    }
    expect(cancelled).toBeGreaterThan(20);
    expect(dealt).toBeGreaterThan(200);
    expect(reversed).toBeGreaterThan(50);
    expect(encores).toBeGreaterThan(5);
  });

  it('games played with cards that have abilities reach a result with every invariant holding', () => {
    const defs = abilityDeck;
    const characterAbilities = CHARACTER_ABILITIES;

    const played = new Set<string>();
    let abilityPlays = 0;
    for (let i = 0; i < 30; i++) {
      const game = playGame(`abilities-${i}`, randomPolicy, 30_000, defs);
      expect(game.problems).toEqual([]);
      expect(game.state.result).not.toBeNull();
      // Nothing is left half-done at the end.
      expect(game.state.costDepth).toBe(0);
      for (const e of game.events) {
        if (e.type !== 'ABILITY_PLAYED') continue;
        abilityPlays++;
        played.add(`${Number(e.cardId.slice(3)) % characterAbilities.length}:${e.ability}`);
      }
    }
    // Every automatic and activated ability in the pool was played at least once.
    expect([...played].sort()).toEqual(['1:0', '2:0', '3:0', '4:0', '4:1', '5:0', '6:0']);
    expect(abilityPlays).toBeGreaterThan(100);
  });

  it('a game where nobody ever clocks or plays is decided by refreshes (CR-9.2.2)', () => {
    const game = playGame('passive', passivePolicy, 60_000);
    expect(game.problems).toEqual([]);
    expect(game.state.result).toMatchObject({ outcome: 'WIN', reason: 'LEVEL_4' });
    // Every clock card of this game came from a refresh: 7 per level, 4 levels.
    const loser = (game.state.result as { loser: PlayerId }).loser;
    const loserRefreshes = game.events.filter((e) => e.type === 'REFRESH' && e.player === loser).length;
    expect(loserRefreshes).toBe(28);
    expect(game.events.some((e) => e.type === 'CARD_PLAYED')).toBe(false);
  });

  it('INV-07: the same seed and the same choices replay to exactly the same game', () => {
    const first = playGame('replay', randomPolicy, 20_000);
    const second = playGame('replay', randomPolicy, 20_000);
    expect(first.problems).toEqual([]);
    expect(serializeState(second.state)).toBe(serializeState(first.state));
    expect(JSON.stringify(second.events)).toBe(JSON.stringify(first.events));
  });

  it('INV-06: no event sent to a player reveals a card that player could not see', () => {
    const game = playGame('events', randomPolicy, 20_000);
    expect(game.problems).toEqual([]);
    for (const event of game.events) {
      for (const viewer of [0, 1] as const) {
        const json = JSON.stringify(redactEvent(event, viewer));
        expect(json).not.toContain('instanceId');
        if (event.type === 'CARD_MOVED') {
          const observable = event.visibleBefore[viewer] || event.visibleAfter[viewer];
          expect(json.includes(`"${event.cardId}"`)).toBe(observable);
        }
      }
    }
  });
});
