/**
 * Sampled worlds for the Expert level ("information set" sampling).
 *
 * The Expert compares its options by playing each of them out in complete
 * game states. It must not learn anything hidden from it, so it never gets
 * the real state. The host (which has the real state) calls
 * createWorldSampler, and each sample is a copy of the real state in which
 * EVERY card the AI cannot see has been replaced:
 *
 *  - its own unseen cards (deck, stock) by its own deck list minus the cards
 *    it can see, in random order: a player knows their own deck list;
 *  - the opponent's unseen cards (hand, deck, stock, face-down cards) by a
 *    guess from public information only: about eight climaxes minus the
 *    climaxes already seen, the rest copies of the opponent's cards seen so
 *    far (or a plain stand-in card when none has been seen yet);
 *  - the random number generator by a fresh random state, so future
 *    shuffles and draws are unknown as well.
 *
 * Which cards are unseen depends only on where cards are and whether they
 * are face up, which is public. The real identity of an unseen card is
 * never read. tests/sampler.test.ts checks this: two real states that
 * differ only in hidden cards give identical samples and identical Expert
 * choices.
 */

import {
  type CardDef,
  type CardInstance,
  type GameState,
  type PlayerId,
  type RngState,
  PILE_ZONES,
  SLOTS,
  canSee,
  cloneState,
  nextInt,
  opponentOf,
} from '@wso/game-engine';
import type { WorldSampler } from './types';

export const FILLER_CHARACTER = 'AI/FILLER-CH';
export const FILLER_CLIMAX = 'AI/FILLER-CX';

/** Stand-ins for opponent cards the AI has never seen. No abilities, no trigger icons. */
const FILLER_DEFS: Record<string, CardDef> = {
  [FILLER_CHARACTER]: { cardId: FILLER_CHARACTER, name: '（未知の角色）', kind: 'CHARACTER', color: 'none', level: 0, cost: 0, power: 3000, soul: 1, traits: [], triggers: [], counter: false },
  [FILLER_CLIMAX]: { cardId: FILLER_CLIMAX, name: '（未知の Climax）', kind: 'CLIMAX', color: 'none', level: null, cost: null, power: null, soul: null, traits: [], triggers: ['SOUL'], counter: false },
};

/** Instance ids of a player's zones in a fixed order (zone by zone, bottom to top). Public structure. */
function positions(state: GameState, player: PlayerId): number[] {
  const zones = state.zones[player];
  return [...PILE_ZONES.flatMap((zone) => zones[zone]), ...SLOTS.flatMap((slot) => [...zones.stage[slot], ...zones.marker[slot]])];
}

function shuffle<T>(rng: RngState, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = nextInt(rng, i + 1);
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

/** Hidden cards the pending decision lets the viewer look at count as seen. */
function lookedAt(state: GameState, viewer: PlayerId): Set<number> {
  const pending = state.pending;
  if (!pending || pending.player !== viewer) return new Set();
  const look = 'look' in pending ? pending.look : undefined;
  return new Set(Object.keys(look ?? {}).map(Number));
}

export function createWorldSampler(state: GameState, viewer: PlayerId, deck: readonly string[]): WorldSampler {
  return (rng) => {
    const world = cloneState(state);
    const looked = lookedAt(state, viewer);
    const known = (inst: CardInstance) => canSee(viewer, inst) || looked.has(inst.objectId);
    const all = [...positions(world, 0), ...positions(world, 1)].map((id) => world.instances[id]!);

    // Own cards: the deck list minus every own card the viewer can see.
    const pool = [...deck];
    const ownHidden: CardInstance[] = [];
    for (const inst of all) {
      if (inst.owner !== viewer) continue;
      if (known(inst)) {
        const index = pool.indexOf(inst.cardId);
        if (index >= 0) pool.splice(index, 1);
      } else ownHidden.push(inst);
    }
    shuffle(rng, pool);
    ownHidden.forEach((inst, i) => {
      inst.cardId = pool[i] ?? FILLER_CHARACTER;
    });

    // Opponent's cards: a guess from what is public.
    const opp = opponentOf(viewer);
    const seenClimaxes: string[] = [];
    const seenOthers: string[] = [];
    const oppHidden: CardInstance[] = [];
    for (const inst of all) {
      if (inst.owner !== opp) continue;
      if (known(inst)) (state.defs[inst.cardId]?.kind === 'CLIMAX' ? seenClimaxes : seenOthers).push(inst.cardId);
      else oppHidden.push(inst);
    }
    const climaxes = Math.min(oppHidden.length, Math.max(0, 8 - seenClimaxes.length));
    const guesses: string[] = [];
    for (let i = 0; i < oppHidden.length; i++) {
      if (i < climaxes) guesses.push(seenClimaxes.length > 0 ? seenClimaxes[nextInt(rng, seenClimaxes.length)]! : FILLER_CLIMAX);
      else guesses.push(seenOthers.length > 0 ? seenOthers[nextInt(rng, seenOthers.length)]! : FILLER_CHARACTER);
    }
    shuffle(rng, guesses);
    oppHidden.forEach((inst, i) => {
      inst.cardId = guesses[i]!;
    });

    world.rng = [nextInt(rng, 0x100000000), nextInt(rng, 0x100000000), nextInt(rng, 0x100000000), nextInt(rng, 0x100000000) | 1] as RngState;
    world.defs = { ...state.defs, ...FILLER_DEFS };
    return world;
  };
}
