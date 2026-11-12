/**
 * What the game screen needs from whoever runs the game: a local game
 * against the computer (local.ts), an online game on the server
 * (remote.ts), or a replay (replay.ts). The screen only ever gets one
 * seat's player view and that seat's redacted events.
 */

import type { Choice, GameEventView, PlayerId, PlayerView } from '@wso/game-engine';
import type { HostUpdate, Replay } from '@wso/server/shared';

export type { HostUpdate } from '@wso/server/shared';

export interface ReplayStatus {
  /** Answers shown so far. */
  position: number;
  total: number;
  playing: boolean;
  /** Whose point of view is shown. */
  viewer: string;
}

export interface HostSnapshot {
  view: PlayerView;
  /** Every event of the game so far, as this seat received it. */
  events: GameEventView[];
  /** The most recent updates, oldest first. */
  updates: HostUpdate[];
  /** Updates up to this id need no animation (a reload, or a jump in a replay). */
  restoredUpTo: number;
  autoPlay: boolean;
  /** The opponent (or auto-play) is about to answer. */
  waiting: boolean;
  error: string | null;
  /** Something the player should know now, e.g. a lost connection. */
  notice?: string | null;
  replay?: ReplayStatus;
}

export interface GameHost {
  readonly seat: PlayerId;
  readonly mode: 'local' | 'online' | 'replay';
  /** How the opponent is named on the board. */
  readonly opponentLabel: string;
  getSnapshot(): HostSnapshot;
  subscribe(listener: () => void): () => void;
  submit(choice: Choice): void;
  resign(): void;
  setAutoPlay(on: boolean): void;
  /** While held, computer players wait (the screen is still showing what happened). Rules are never delayed. */
  setHold(hold: boolean): void;
  dispose(): void;
  /** The replay of this game; only once it is over. */
  getReplay?(): Promise<Replay>;
  /** Replay viewer controls. */
  replayControls?: { play(): void; pause(): void; step(): void; toEnd(): void };
}
