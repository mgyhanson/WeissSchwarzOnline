/**
 * Plays the host's updates on screen, in order, one step at a time.
 *
 * The engine has already decided everything; this only decides WHEN the
 * screen shows it. While an update is being shown the board keeps the view
 * from before it, and switches to the update's view when its steps are
 * done, so what is on screen never disagrees with the engine. Each update
 * is played once (updates have increasing ids). Skipping jumps straight to
 * the latest view. While anything is playing the queue reports `busy`, and
 * the host keeps computer players waiting.
 */

import type { PlayerId, PlayerView } from '@wso/game-engine';
import type { HostUpdate } from '../host/types';
import { type Step, type StepCard, toSteps } from './steps';

export type Speed = 'NORMAL' | 'FAST' | 'OFF';

export const SPEED_ZH: Record<Speed, string> = { NORMAL: '一般', FAST: '快速', OFF: '關閉' };

/** A reveal kept for the log. */
export interface RevealRecord {
  seq: number;
  kind: Step['kind'];
  player: PlayerId;
  cards: StepCard[];
  note: string;
}

export interface Presentation {
  /** What the board shows. */
  view: PlayerView;
  /** The step on screen, or null. */
  step: Step | null;
  /** For a damage step: cards turned over so far. */
  shown: number;
  /** A reveal first shows the cards, then the outcome. */
  phase: 'reveal' | 'result';
  busy: boolean;
  speed: Speed;
  /** Recent reveals, newest last. */
  history: RevealRecord[];
  /** Events up to this sequence number may be shown in the log (later ones would spoil what is still playing). */
  shownSeq: number;
}

/** Waits `ms`, or less if aborted. Replaced in tests. */
export type Wait = (ms: number, signal: AbortSignal) => Promise<void>;

/** Optional movement animations (animate.ts). Must resolve, also when aborted. */
export type Animator = (step: Step, view: PlayerView, speed: Speed, signal: AbortSignal) => Promise<void>;

export const realWait: Wait = (ms, signal) =>
  new Promise((resolve) => {
    if (ms <= 0 || signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

/** Base durations at NORMAL speed, in milliseconds. */
export function durations(step: Step, seat: PlayerId): { reveal: number; perCard: number; result: number } {
  switch (step.kind) {
    case 'DRAW':
      return step.player === seat ? { reveal: 650, perCard: 120, result: 0 } : { reveal: 300, perCard: 0, result: 0 };
    case 'TRIGGER':
      return { reveal: 900, perCard: 0, result: 700 };
    case 'DAMAGE':
      return { reveal: 250, perCard: 550, result: 900 };
    case 'REVEAL':
      return { reveal: 900, perCard: 250, result: 300 };
    case 'MOVE':
      return { reveal: 280, perCard: 0, result: 0 };
    case 'ORIENT':
      return { reveal: 220, perCard: 0, result: 0 };
    case 'ATTACK':
      return { reveal: 700, perCard: 0, result: 0 };
    case 'PLAY':
      return step.player === seat ? { reveal: 250, perCard: 0, result: 0 } : { reveal: 900, perCard: 0, result: 0 };
    case 'ABILITY':
      return { reveal: 800, perCard: 0, result: 0 };
    case 'LEVEL_UP':
      return { reveal: 1100, perCard: 0, result: 0 };
    case 'REFRESH':
      return { reveal: 1100, perCard: 0, result: 0 };
    case 'TURN':
      return { reveal: 700, perCard: 0, result: 0 };
    case 'PHASE':
      return { reveal: 200, perCard: 0, result: 0 };
    case 'END':
      return { reveal: 0, perCard: 0, result: 0 };
  }
}

const FACTOR: Record<Speed, number> = { NORMAL: 1, FAST: 0.35, OFF: 0 };
const HISTORY = 60;

function recordOf(step: Step, seat: PlayerId): RevealRecord | null {
  switch (step.kind) {
    case 'DRAW':
      return step.player === seat && step.cards.some((c) => c.cardId) ? { seq: step.seq, kind: step.kind, player: step.player, cards: step.cards, note: '你抽到' } : null;
    case 'TRIGGER':
      return { seq: step.seq, kind: step.kind, player: step.player, cards: [step.card], note: 'Trigger Check' };
    case 'DAMAGE':
      return {
        seq: step.seq,
        kind: step.kind,
        player: step.receiver,
        cards: step.cards,
        note: step.cancelled ? '傷害（Cancel）' : step.amount !== null ? `傷害 ${step.amount}` : '傷害（中途）',
      };
    case 'REVEAL':
      return { seq: step.seq, kind: step.kind, player: step.player, cards: step.cards, note: step.reason === 'EFFECT' ? '效果翻開' : '公開' };
    case 'PLAY':
      return step.player === seat ? null : { seq: step.seq, kind: step.kind, player: step.player, cards: [{ cardId: step.cardId }], note: '對手使用' };
    default:
      return null;
  }
}

export class PresentationQueue {
  private state: Presentation;
  private readonly listeners = new Set<() => void>();
  /** `lastSeq`: the newest event of the update, kept when its events are not animated. */
  private readonly pending: (HostUpdate & { lastSeq: number })[] = [];
  private lastQueued: number;
  private latest: PlayerView;
  private latestSeq: number;
  private running = false;
  private abort = new AbortController();

  constructor(
    private readonly seat: PlayerId,
    start: { view: PlayerView; updateId: number; seq: number },
    private readonly options: { speed?: Speed; wait?: Wait; animator?: Animator; onBusy?: (busy: boolean) => void } = {},
  ) {
    this.lastQueued = start.updateId;
    this.latest = start.view;
    this.latestSeq = start.seq;
    this.state = { view: start.view, step: null, shown: 0, phase: 'reveal', busy: false, speed: options.speed ?? 'NORMAL', history: [], shownSeq: start.seq };
  }

  getSnapshot = (): Presentation => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Adds the updates not seen yet. Updates up to `restoredUpTo` are taken as already shown. */
  sync(updates: readonly HostUpdate[], restoredUpTo = -1): void {
    for (const update of updates) {
      if (update.id <= this.lastQueued) continue;
      this.lastQueued = update.id;
      this.latest = update.view;
      this.latestSeq = Math.max(this.latestSeq, ...update.events.map((e) => e.seq));
      const lastSeq = update.events.reduce((max, e) => Math.max(max, e.seq), -1);
      if (update.id <= restoredUpTo || this.state.speed === 'OFF') {
        // Nothing to animate: show the result at once (after anything still queued).
        this.pending.push({ ...update, events: this.state.speed === 'OFF' ? update.events : [], lastSeq });
      } else this.pending.push({ ...update, lastSeq });
    }
    void this.run();
  }

  setSpeed(speed: Speed): void {
    this.set({ speed });
    if (speed === 'OFF') this.skip();
  }

  /** Stops the current animation and shows the latest view. */
  skip(): void {
    this.abort.abort();
    for (const update of this.pending) this.addHistory(toSteps(update.events, this.seat));
    this.pending.length = 0;
    this.set({ view: this.latest, step: null, shown: 0, phase: 'reveal', shownSeq: this.latestSeq });
  }

  private set(patch: Partial<Presentation>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  private addHistory(steps: readonly Step[]): void {
    const records = steps.map((s) => recordOf(s, this.seat)).filter((r): r is RevealRecord => r !== null);
    if (records.length === 0) return;
    this.state = { ...this.state, history: [...this.state.history, ...records].slice(-HISTORY) };
  }

  private setBusy(busy: boolean): void {
    if (this.state.busy === busy) return;
    this.set({ busy });
    this.options.onBusy?.(busy);
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.setBusy(this.pending.length > 0);
    const wait = this.options.wait ?? realWait;
    while (this.pending.length > 0) {
      const update = this.pending.shift()!;
      if (this.abort.signal.aborted) this.abort = new AbortController();
      const signal = this.abort.signal;
      const steps = toSteps(update.events, this.seat);
      const factor = FACTOR[this.state.speed];
      for (const [index, step] of steps.entries()) {
        if (signal.aborted) {
          // Skipped: the steps not shown still go into the history.
          this.addHistory(steps.slice(index));
          break;
        }
        if (factor === 0) {
          this.addHistory([step]);
          continue;
        }
        const time = durations(step, this.seat);
        this.set({ step, shown: 0, phase: 'reveal', shownSeq: Math.max(this.state.shownSeq, step.seq) });
        const animation = this.options.animator?.(step, this.state.view, this.state.speed, signal);
        await wait(time.reveal * factor, signal);
        const cards = step.kind === 'DAMAGE' ? step.cards.length : step.kind === 'DRAW' || step.kind === 'REVEAL' ? step.cards.length : 0;
        for (let i = 1; i <= cards && !signal.aborted; i++) {
          this.set({ shown: i });
          await wait(time.perCard * factor, signal);
        }
        if (time.result > 0 && !signal.aborted) {
          this.set({ phase: 'result' });
          await wait(time.result * factor, signal);
        }
        await animation;
        this.addHistory([step]);
      }
      // The update is fully shown: the board now shows its result (unless a skip already did).
      if (!signal.aborted) {
        // Also past events that were not animated (a restored update), so the log shows them.
        const lastSeq = Math.max(this.state.shownSeq, update.lastSeq);
        this.set({ view: update.view, step: null, shown: 0, phase: 'reveal', shownSeq: lastSeq });
      }
    }
    this.running = false;
    this.setBusy(false);
  }
}
