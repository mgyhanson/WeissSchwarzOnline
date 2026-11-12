/**
 * What a computer player is given. Nothing here exposes the game state:
 * a computer player decides from its PlayerView and the pending decision,
 * exactly like a person in its seat. See sampler.ts for the one exception
 * (the Expert level), and why it does not leak hidden information.
 */

import type { CardDef, Choice, Decision, GameState, PlayerView, RngState } from '@wso/game-engine';

export type AiLevel = 'BEGINNER' | 'NORMAL' | 'ADVANCED' | 'EXPERT';

export const AI_LEVELS: readonly AiLevel[] = ['BEGINNER', 'NORMAL', 'ADVANCED', 'EXPERT'];

export const AI_LEVEL_ZH: Record<AiLevel, string> = {
  BEGINNER: '入門',
  NORMAL: '普通',
  ADVANCED: '進階',
  EXPERT: '專家',
};

/** Draws a complete game state that agrees with everything the AI knows, and with nothing else. */
export type WorldSampler = (rng: RngState) => GameState;

export interface AiOptions {
  level: AiLevel;
  /** Printed data of a card id the AI has seen (public information). */
  card: (cardId: string) => CardDef;
  /** The AI's own deck list. A player knows what is in their own deck. */
  deck: readonly string[];
  /** Seed of the AI's own random choices. */
  seed: string;
  /** Expert: sampled worlds per candidate (default 6). */
  samples?: number;
  /** Expert: most candidates compared by simulation (default 6). */
  candidates?: number;
  /** Expert: stop simulating after this many milliseconds and use what was found (default 1500). */
  timeLimitMs?: number;
}

export interface Ai {
  readonly level: AiLevel;
  /**
   * Chooses an answer to `decision`, which must be the decision in `view`.
   * `sample` is used by the Expert level only; the other levels ignore it.
   */
  choose(view: PlayerView, decision: Decision, sample?: WorldSampler): Choice;
}
