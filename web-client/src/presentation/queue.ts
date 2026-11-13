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

import type { Phase, PlayerId, PlayerView } from '@wso/game-engine';
import type { HostUpdate } from '../host/types';
import { type Caption, explainStep } from './explain';
import { type Step, type StepCard, toSteps } from './steps';

export type Speed = 'SLOW' | 'NORMAL' | 'FAST' | 'OFF';

export const SPEEDS: readonly Speed[] = ['SLOW', 'NORMAL', 'FAST', 'OFF'];
export const SPEED_ZH: Record<Speed, string> = { SLOW: '慢速', NORMAL: '正常', FAST: '快速', OFF: '關閉' };

/** One line of the battle log: a step that was shown, with its explanation. */
export interface BattleLogEntry extends Caption {
  seq: number;
  /** Clock time it was shown, HH:MM:SS. */
  time: string;
  turn: number | null;
}

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
  /** The explanation of the step on screen (kept after it until the next one). */
  caption: Caption | null;
  /** Explained steps so far, newest last. */
  log: BattleLogEntry[];
  /** Playing is held until resume(). */
  paused: boolean;
  /** Step-by-step mode: after every step the queue waits for next(). */
  stepMode: boolean;
  /** In step-by-step mode: the step is done and next() is awaited. */
  awaitingNext: boolean;
  /**
   * The phase and turn player being narrated, while the board still shows the
   * state from before the update: the phase indicator follows the narration.
   */
  phaseNow: { player: PlayerId; phase: Phase } | null;
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

/**
 * Base durations at NORMAL speed, in milliseconds. Different things take
 * different times: a card move 600 to 900, a card turned over 500 to 800
 * each, an attack about 1000, an ability 1200, a phase change 650.
 */
export function durations(step: Step, seat: PlayerId): { reveal: number; perCard: number; result: number } {
  switch (step.kind) {
    case 'DRAW':
      return step.player === seat ? { reveal: 800, perCard: 300, result: 0 } : { reveal: 700, perCard: 0, result: 0 };
    case 'TRIGGER':
      return { reveal: 1100, perCard: 0, result: 1000 };
    case 'DAMAGE':
      return { reveal: 500, perCard: 700, result: 1200 };
    case 'REVEAL':
      return { reveal: 1000, perCard: 400, result: 500 };
    case 'MOVE':
      return { reveal: 700, perCard: 0, result: 0 };
    case 'ORIENT':
      return step.to === 'REVERSE' ? { reveal: 900, perCard: 0, result: 0 } : { reveal: 500, perCard: 0, result: 0 };
    case 'ATTACK':
      return { reveal: 1100, perCard: 0, result: 0 };
    case 'PLAY':
      return step.player === seat ? { reveal: 700, perCard: 0, result: 0 } : { reveal: 1100, perCard: 0, result: 0 };
    case 'ABILITY':
      return { reveal: 1300, perCard: 0, result: 0 };
    case 'LEVEL_UP':
      return { reveal: 1400, perCard: 0, result: 0 };
    case 'REFRESH':
      return { reveal: 1400, perCard: 0, result: 0 };
    case 'TURN':
      return { reveal: 900, perCard: 0, result: 0 };
    case 'PHASE':
      return { reveal: 700, perCard: 0, result: 0 };
    case 'STEP':
      return { reveal: 600, perCard: 0, result: 0 };
    case 'END':
      return { reveal: 0, perCard: 0, result: 0 };
  }
}

export const FACTOR: Record<Speed, number> = { SLOW: 1.7, NORMAL: 1, FAST: 0.35, OFF: 0 };
const HISTORY = 60;
const LOG = 400;

function clock(): string {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
}

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
  /** Resolves the wait of pause or step-by-step mode. */
  private release: (() => void) | null = null;
  /** Updates skipped while another was playing; logged once that one has been logged. */
  private skipped: HostUpdate[] = [];

  constructor(
    private readonly seat: PlayerId,
    start: { view: PlayerView; updateId: number; seq: number },
    private readonly options: { speed?: Speed; wait?: Wait; animator?: Animator; onBusy?: (busy: boolean) => void } = {},
  ) {
    this.lastQueued = start.updateId;
    this.latest = start.view;
    this.latestSeq = start.seq;
    this.state = {
      view: start.view,
      step: null,
      shown: 0,
      phase: 'reveal',
      busy: false,
      speed: options.speed ?? 'NORMAL',
      history: [],
      shownSeq: start.seq,
      caption: null,
      log: [],
      paused: false,
      stepMode: false,
      awaitingNext: false,
      phaseNow: null,
    };
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

  /** Stops the current animation and shows the latest view. Everything skipped still goes into the log. */
  skip(): void {
    this.abort.abort();
    // Logged after the rest of the update now playing, so the battle log stays in order.
    this.skipped.push(...this.pending.splice(0));
    this.set({ view: this.latest, step: null, shown: 0, phase: 'reveal', shownSeq: this.latestSeq, awaitingNext: false, phaseNow: null });
    this.letGo();
    if (!this.running) this.flushSkipped();
  }

  private flushSkipped(): void {
    for (const update of this.skipped.splice(0)) this.addHistory(toSteps(update.events, this.seat));
  }

  /** Holds playing after the step now on screen. The game itself is never held: only what is shown. */
  pause(): void {
    this.set({ paused: true });
  }

  resume(): void {
    this.set({ paused: false });
    this.letGo();
  }

  /** Step-by-step mode: every step waits for next(). */
  setStepMode(on: boolean): void {
    this.set({ stepMode: on });
    if (!on) this.letGo();
  }

  /** In step-by-step mode or while paused: show the next step. */
  next(): void {
    this.letGo();
  }

  private letGo(): void {
    const release = this.release;
    this.release = null;
    // At once, so a second press of "next" before the next step is shown does nothing.
    if (release && this.state.awaitingNext) this.set({ awaitingNext: false });
    release?.();
  }

  /** Waits while paused, or (when `afterStep`) for next() in step-by-step mode. A skip ends the wait. */
  private async gate(signal: AbortSignal, afterStep: boolean): Promise<void> {
    const mustWait = () => !signal.aborted && this.state.speed !== 'OFF' && (this.state.paused || (afterStep && this.state.stepMode));
    if (!mustWait()) return;
    if (afterStep && this.state.stepMode) this.set({ awaitingNext: true });
    await new Promise<void>((resolve) => {
      this.release = resolve;
      signal.addEventListener('abort', () => resolve(), { once: true });
    });
    if (this.state.awaitingNext) this.set({ awaitingNext: false });
  }

  private set(patch: Partial<Presentation>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  private addHistory(steps: readonly Step[]): void {
    if (steps.length === 0) return;
    const records = steps.map((s) => recordOf(s, this.seat)).filter((r): r is RevealRecord => r !== null);
    // Every explained step goes into the battle log, whether it was animated or skipped.
    const view = this.state.view;
    const entries: BattleLogEntry[] = steps
      .map((s) => ({ ...explainStep(s, this.seat, view), seq: s.seq, time: clock(), turn: view.turn?.number ?? null }))
      .filter((entry) => entry.major);
    this.state = { ...this.state, history: [...this.state.history, ...records].slice(-HISTORY), log: [...this.state.log, ...entries].slice(-LOG) };
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
      for (const [index, step] of steps.entries()) {
        // Read each time: the speed may be changed while an update plays.
        const factor = FACTOR[this.state.speed];
        if (signal.aborted) {
          // Skipped: the steps not shown still go into the history.
          this.addHistory(steps.slice(index));
          break;
        }
        if (factor === 0) {
          this.addHistory([step]);
          continue;
        }
        await this.gate(signal, false);
        if (signal.aborted) {
          this.addHistory(steps.slice(index));
          break;
        }
        const time = durations(step, this.seat);
        this.set({
          step,
          shown: 0,
          phase: 'reveal',
          shownSeq: Math.max(this.state.shownSeq, step.seq),
          caption: explainStep(step, this.seat, this.state.view),
          ...(step.kind === 'PHASE' ? { phaseNow: { player: step.player, phase: step.phase } } : {}),
        });
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
        await this.gate(signal, true);
      }
      if (signal.aborted) this.flushSkipped();
      // The update is fully shown: the board now shows its result (unless a skip already did).
      if (!signal.aborted) {
        // Also past events that were not animated (a restored update), so the log shows them.
        const lastSeq = Math.max(this.state.shownSeq, update.lastSeq);
        this.set({ view: update.view, step: null, shown: 0, phase: 'reveal', shownSeq: lastSeq, phaseNow: null });
      }
    }
    this.running = false;
    this.setBusy(false);
  }
}
