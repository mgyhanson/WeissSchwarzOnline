import { describe, expect, it } from 'vitest';
import {
  type CardInstance,
  type GameState,
  type PlayerId,
  canSee,
  checkInvariants,
  cloneState,
  createGame,
  getPlayerView,
  nextInt,
  seedRng,
  serializeState,
  submitChoice,
} from '@wso/game-engine';
import { TEST_DECKS, deckList, defsFor, getCard } from '@wso/card-database';
import { type AiLevel, AI_LEVELS, createAi, createWorldSampler, evaluate } from '../src/index';
import { DECK_IDS, headToHead, playMatch } from './match';

const card = (id: string) => getCard(id).def;
const FAST_EXPERT = { samples: 2, candidates: 3, timeLimitMs: 60_000 };

describe('every level plays legal, complete games', () => {
  const cheap: AiLevel[] = ['BEGINNER', 'NORMAL', 'ADVANCED'];
  for (const a of cheap) {
    for (const b of cheap) {
      it(`${a} against ${b}: every answer accepted, invariants hold, the game ends`, () => {
        for (let i = 0; i < 4; i++) {
          const decks: [string, string] = i % 2 === 0 ? [DECK_IDS[0], DECK_IDS[1]] : [DECK_IDS[1], DECK_IDS[0]];
          const match = playMatch([a, b], decks, `legal-${a}-${b}-${i}`, {}, 10);
          expect(match.problems).toEqual([]);
          expect(match.state.result).not.toBeNull();
        }
      });
    }
  }

  it('EXPERT against BEGINNER and ADVANCED: every answer accepted, invariants hold, the game ends', () => {
    for (const [i, other] of (['BEGINNER', 'ADVANCED'] as const).entries()) {
      const match = playMatch(i === 0 ? ['EXPERT', other] : [other, 'EXPERT'], [DECK_IDS[i], DECK_IDS[1 - i]!], `legal-expert-${i}`, FAST_EXPERT, 10);
      expect(match.problems).toEqual([]);
      expect(match.state.result).not.toBeNull();
    }
  });

  it('the same seed gives the same game (levels are deterministic for a given seed)', () => {
    for (const level of AI_LEVELS) {
      const extra = level === 'EXPERT' ? FAST_EXPERT : {};
      const a = playMatch([level, 'NORMAL'], [DECK_IDS[0], DECK_IDS[1]], `determinism-${level}`, extra);
      const b = playMatch([level, 'NORMAL'], [DECK_IDS[0], DECK_IDS[1]], `determinism-${level}`, extra);
      expect(serializeState(a.state)).toBe(serializeState(b.state));
    }
  });
});

describe('strength', () => {
  it('ADVANCED wins most games against BEGINNER (40 games, seats and decks alternating)', () => {
    const result = headToHead('ADVANCED', 'BEGINNER', 40, 'strength-a-b');
    expect(result.problems).toEqual([]);
    expect(result.winsA).toBeGreaterThanOrEqual(28);
  });
});

/** Positions in the middle of games, each waiting for a decision of `viewer`. */
function positions(): { state: GameState; viewer: PlayerId; deck: string[] }[] {
  const found: { state: GameState; viewer: PlayerId; deck: string[] }[] = [];
  for (let g = 0; g < 3; g++) {
    const lists = (g % 2 === 0 ? [0, 1] : [1, 0]).map((k) => deckList(TEST_DECKS[k]!)) as [string[], string[]];
    const ais = ([0, 1] as const).map((p) => createAi({ level: 'NORMAL', card, deck: lists[p], seed: `pos-${g}-${p}` }));
    let { state } = createGame({ defs: defsFor(new Set([...lists[0], ...lists[1]])), decks: lists }, `positions-${g}`);
    for (let step = 0; state.pending && !state.result; step++) {
      const p = state.pending.player;
      const view = getPlayerView(state, p);
      if (step % 37 === 5) found.push({ state, viewer: p, deck: lists[p] });
      if (!view.decision?.mine) throw new Error('decision not in view');
      const result = submitChoice(state, { player: p, decisionId: state.pending.id, choice: ais[p]!.choose(view, view.decision.decision) });
      if (!result.ok) throw new Error(result.message);
      state = result.state;
    }
  }
  return found;
}

/**
 * The same game, except for everything the viewer cannot know:
 *  - its own hidden cards are in a different order (it knows its deck list,
 *    so only their order is unknown);
 *  - the opponent's hidden cards are different cards altogether, drawn at
 *    random from every card in the game: a different deck, other climax
 *    counts and all;
 *  - the random generator differs.
 */
function differentHiddenCards(state: GameState, viewer: PlayerId, seed: string): GameState {
  const copy = cloneState(state);
  const rng = seedRng(seed);
  const look = state.pending && 'look' in state.pending ? Object.keys(state.pending.look ?? {}).map(Number) : [];
  const hiddenOf = (owner: PlayerId) => copy.instances.filter((inst: CardInstance) => inst.owner === owner && !canSee(viewer, inst) && !look.includes(inst.objectId));
  const own = hiddenOf(viewer);
  const ids = own.map((inst) => inst.cardId);
  const shift = 1 + (rng[0] % Math.max(1, ids.length - 1));
  own.forEach((inst, i) => {
    inst.cardId = ids[(i + shift) % ids.length]!;
  });
  const everyCard = Object.keys(state.defs).sort();
  for (const inst of hiddenOf(viewer === 0 ? 1 : 0)) inst.cardId = everyCard[nextInt(rng, everyCard.length)]!;
  copy.rng = [rng[0] | 1, rng[1], rng[2], rng[3]];
  return copy;
}

describe('the Expert never sees hidden information (sampled worlds)', () => {
  const cases = positions();

  it('the test positions have hidden cards that really differ between the two versions', () => {
    expect(cases.length).toBeGreaterThan(10);
    const changed = cases.filter(({ state, viewer }) => serializeState(differentHiddenCards(state, viewer, 'x')) !== serializeState(state));
    expect(changed.length).toBe(cases.length);
  });

  it('a sample looks exactly the same to the AI as the real game, and is a valid game state', () => {
    for (const { state, viewer, deck } of cases) {
      const sample = createWorldSampler(state, viewer, deck)(seedRng('s'));
      expect(getPlayerView(sample, viewer)).toEqual(getPlayerView(state, viewer));
      expect(checkInvariants(sample)).toEqual([]);
    }
  });

  it('its own unseen cards are drawn from its own deck list', () => {
    for (const { state, viewer, deck } of cases) {
      const sample = createWorldSampler(state, viewer, deck)(seedRng('s'));
      const own = sample.instances.filter((inst) => inst.owner === viewer).map((inst) => inst.cardId);
      expect([...own].sort()).toEqual([...deck].sort());
    }
  });

  it('two games that differ only in cards hidden from the AI give identical samples', () => {
    for (const [i, { state, viewer, deck }] of cases.entries()) {
      const other = differentHiddenCards(state, viewer, `other-${i}`);
      const a = createWorldSampler(state, viewer, deck)(seedRng(`same-${i}`));
      const b = createWorldSampler(other, viewer, deck)(seedRng(`same-${i}`));
      expect(serializeState(a)).toBe(serializeState(b));
    }
  });

  it('and identical Expert choices', () => {
    for (const [i, { state, viewer, deck }] of cases.entries()) {
      const other = differentHiddenCards(state, viewer, `other-${i}`);
      const choices = [state, other].map((s) => {
        const expert = createAi({ level: 'EXPERT', card, deck, seed: `cheat-${i}`, ...FAST_EXPERT });
        const view = getPlayerView(s, viewer);
        if (!view.decision?.mine) throw new Error('not the viewer’s decision');
        return expert.choose(view, view.decision.decision, createWorldSampler(s, viewer, deck));
      });
      expect(choices[1]).toEqual(choices[0]);
    }
  });

  it('the opponent’s unseen cards are a guess: never more climaxes than eight minus those already seen', () => {
    for (const { state, viewer, deck } of cases) {
      const sample = createWorldSampler(state, viewer, deck)(seedRng('g'));
      const opp = viewer === 0 ? 1 : 0;
      const hidden = sample.instances.filter((inst) => inst.owner === opp && !canSee(viewer, state.instances[inst.instanceId]!));
      const seenClimaxes = state.instances.filter((inst) => inst.owner === opp && canSee(viewer, inst) && state.defs[inst.cardId]!.kind === 'CLIMAX').length;
      const sampledClimaxes = hidden.filter((inst) => sample.defs[inst.cardId]!.kind === 'CLIMAX').length;
      expect(sampledClimaxes).toBe(Math.min(hidden.length, Math.max(0, 8 - seenClimaxes)));
    }
  });
});

describe('evaluation', () => {
  it('a won game scores above any position, a lost one below', () => {
    const { state } = createGame({ defs: defsFor(new Set(deckList(TEST_DECKS[0]!))), decks: [deckList(TEST_DECKS[0]!), deckList(TEST_DECKS[0]!)] }, 'eval');
    const view = getPlayerView(state, 0);
    expect(evaluate({ ...view, result: { outcome: 'WIN', winner: 0, loser: 1, reason: 'LEVEL_4' } })).toBe(100_000);
    expect(evaluate({ ...view, result: { outcome: 'WIN', winner: 1, loser: 0, reason: 'LEVEL_4' } })).toBe(-100_000);
    expect(Math.abs(evaluate(view))).toBeLessThan(10_000);
  });
});
