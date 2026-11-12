/**
 * Watching a finished game. The replay (seed, decks, answers) is run through
 * the engine again, one answer per step, and shown from one seat's point of
 * view exactly as that player saw it during the game: the board, the
 * animations and the log work as in a live game.
 */

import type { Choice, PlayerId } from '@wso/game-engine';
import { Match, type Replay, SeatFeed } from '@wso/server/shared';
import type { GameHost, HostSnapshot } from './types';

export class ReplayHost implements GameHost {
  readonly mode = 'replay' as const;
  private readonly match: Match;
  private readonly feed: SeatFeed;
  private position = 0;
  private playing = false;
  private hold = false;
  private restoredUpTo = -1;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();
  private snapshot: HostSnapshot;
  private error: string | null = null;

  constructor(
    readonly replay: Replay,
    readonly seat: PlayerId,
    private readonly stepDelay = 700,
  ) {
    this.match = new Match(replay.seed, [replay.decks[0].cards, replay.decks[1].cards]);
    this.feed = new SeatFeed(seat);
    this.feed.record(this.match.setupEvents, this.match.state);
    this.restoredUpTo = this.feed.lastId;
    this.snapshot = this.makeSnapshot();
  }

  get opponentLabel(): string {
    const other = this.seat === 0 ? 1 : 0;
    return `對手・${this.replay.players[other]}`;
  }

  getSnapshot = (): HostSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  submit(_choice: Choice): void {}
  resign(): void {}
  setAutoPlay(_on: boolean): void {}

  setHold(hold: boolean): void {
    if (this.hold === hold) return;
    this.hold = hold;
    if (!hold) this.schedule();
  }

  dispose(): void {
    this.playing = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.listeners.clear();
  }

  replayControls = {
    play: (): void => {
      if (this.position >= this.replay.entries.length) return;
      this.playing = true;
      this.changed();
    },
    pause: (): void => {
      this.playing = false;
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      this.changed();
    },
    step: (): void => {
      this.playing = false;
      this.advance();
      this.changed();
    },
    /** Straight to the end, without animating the rest. */
    toEnd: (): void => {
      this.playing = false;
      while (this.position < this.replay.entries.length && this.advance());
      this.restoredUpTo = this.feed.lastId;
      this.changed();
    },
  };

  private advance(): boolean {
    const entry = this.replay.entries[this.position];
    if (!entry) return false;
    const result = this.match.apply(entry);
    if (!result.ok) {
      this.error = `重播在第 ${this.position + 1} 步停止：${result.message}`;
      this.playing = false;
      return false;
    }
    this.position++;
    this.feed.record(result.events, this.match.state);
    return true;
  }

  private schedule(): void {
    if (this.timer || !this.playing || this.hold) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.playing || this.hold) return;
      if (!this.advance() || this.position >= this.replay.entries.length) this.playing = false;
      this.changed();
    }, this.stepDelay);
  }

  private makeSnapshot(): HostSnapshot {
    const last = this.feed.updates[this.feed.updates.length - 1]!;
    return {
      view: last.view,
      events: [...this.feed.events],
      updates: [...this.feed.updates],
      restoredUpTo: this.restoredUpTo,
      autoPlay: false,
      waiting: false,
      error: this.error,
      notice: null,
      replay: { position: this.position, total: this.replay.entries.length, playing: this.playing, viewer: this.replay.players[this.seat] },
    };
  }

  private changed(): void {
    this.snapshot = this.makeSnapshot();
    this.schedule();
    for (const listener of this.listeners) listener();
  }
}
