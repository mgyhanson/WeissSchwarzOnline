/**
 * Computer players for four levels. See docs/02-architecture.md section 7.
 *
 *   const ai = createAi({ level: 'ADVANCED', card, deck, seed });
 *   const choice = ai.choose(view, view.decision.decision);
 */

import { seedRng } from '@wso/game-engine';
import { beginnerChoice } from './beginner';
import { ExpertPlayer } from './expert';
import { HeuristicPlayer } from './heuristic';
import type { Ai, AiOptions } from './types';

export * from './types';
export { evaluate } from './evaluate';
export { createWorldSampler, FILLER_CHARACTER, FILLER_CLIMAX } from './sampler';
export { HeuristicPlayer } from './heuristic';

export function createAi(options: AiOptions): Ai {
  const rng = seedRng(`ai-${options.level}-${options.seed}`);
  switch (options.level) {
    case 'BEGINNER':
      return { level: 'BEGINNER', choose: (view, decision) => beginnerChoice(view, decision, rng) };
    case 'NORMAL':
    case 'ADVANCED': {
      const player = new HeuristicPlayer(options.level, options.card);
      return { level: options.level, choose: (view, decision) => player.choose(view, decision) };
    }
    case 'EXPERT': {
      const expert = new ExpertPlayer(
        options.card,
        { samples: options.samples ?? 6, candidates: options.candidates ?? 6, timeLimitMs: options.timeLimitMs ?? 1500 },
        rng,
      );
      return { level: 'EXPERT', choose: (view, decision, sample) => expert.choose(view, decision, sample) };
    }
  }
}
