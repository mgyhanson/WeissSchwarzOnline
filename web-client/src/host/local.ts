/**
 * A game host that runs in the browser: one human seat against the practice
 * opponent. It holds the game state and hands the interface only the
 * player view and redacted events of the human seat, exactly as the server
 * of STEP 9 will. The opponent likewise decides from its own view only.
 *
 * The game is saved as its seed plus the list of answers, so a page reload
 * replays it to the same position (the engine is deterministic).
 */

import {
  type Choice,
  type GameEventView,
  type GameState,
  type PlayerId,
  type PlayerView,
  createGame,
  getPlayerView,
  redactEvent,
  resign,
  submitChoice,
} from '@wso/game-engine';
import { TEST_DECKS, deckList, defsFor } from '@wso/card-database';
import { type PracticeBot, createPracticeBot } from '../bot/practice';

export interface GameSetup {
  seed: string;
  /** Test deck ids for seat 0 and seat 1. */
  decks: [string, string];
}

type Entry = { player: PlayerId; choice: Choice } | { player: PlayerId; resign: true };

export interface SavedGame {
  version: 1;
  setup: GameSetup;
  entries: Entry[];
}

export interface HostSnapshot {
  view: PlayerView;
  /** Every event of the game so far, as the human seat received it. */
  events: GameEventView[];
  autoPlay: boolean;
  /** The opponent (or auto-play) is about to answer. */
  waiting: boolean;
  error: string | null;
}

export interface GameHost {
  readonly seat: PlayerId;
  readonly setup: GameSetup;
  getSnapshot(): HostSnapshot;
  subscribe(listener: () => void): () => void;
  submit(choice: Choice): void;
  resign(): void;
  setAutoPlay(on: boolean): void;
  dispose(): void;
}

export const SAVE_KEY = 'wso.localGame.v1';

export interface LocalHostOptions {
  /** Milliseconds before the opponent answers. */
  botDelay?: number;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  /** Answers to replay (from a saved game). */
  entries?: Entry[];
}

export function randomSeed(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function deck(id: string): string[] {
  const found = TEST_DECKS.find((d) => d.id === id);
  if (!found) throw new Error(`Unknown deck ${id}`);
  return deckList(found);
}

export class LocalHost implements GameHost {
  readonly seat: PlayerId = 0;
  private state: GameState;
  private events: GameEventView[] = [];
  private entries: Entry[] = [];
  private listeners = new Set<() => void>();
  private snapshot: HostSnapshot;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private autoPlay = false;
  private error: string | null = null;
  private readonly bots: [PracticeBot, PracticeBot] = [createPracticeBot(), createPracticeBot()];
  private readonly botDelay: number;
  private readonly storage: LocalHostOptions['storage'];

  constructor(
    readonly setup: GameSetup,
    options: LocalHostOptions = {},
  ) {
    this.botDelay = options.botDelay ?? 600;
    this.storage = options.storage ?? null;
    const decks: [string[], string[]] = [deck(setup.decks[0]), deck(setup.decks[1])];
    const created = createGame({ defs: defsFor(new Set([...decks[0], ...decks[1]])), decks }, setup.seed);
    this.state = created.state;
    this.record(created.events);
    for (const entry of options.entries ?? []) {
      if (!this.apply(entry)) break;
    }
    this.snapshot = this.makeSnapshot();
    this.save();
    this.schedule();
  }

  // Arrow functions: React calls these unbound (useSyncExternalStore).
  getSnapshot = (): HostSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  submit(choice: Choice): void {
    const pending = this.state.pending;
    if (!pending || pending.player !== this.seat) return;
    this.error = this.apply({ player: this.seat, choice }) ? null : this.error;
    this.changed();
  }

  resign(): void {
    this.apply({ player: this.seat, resign: true });
    this.changed();
  }

  setAutoPlay(on: boolean): void {
    this.autoPlay = on;
    this.changed();
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.listeners.clear();
  }

  /** Applies one answer. Returns false (and keeps the state) when the engine rejects it. */
  private apply(entry: Entry): boolean {
    if ('resign' in entry) {
      const result = resign(this.state, entry.player);
      this.state = result.state;
      this.record(result.events);
      this.entries.push(entry);
      return true;
    }
    const pending = this.state.pending;
    if (!pending) return false;
    const result = submitChoice(this.state, { player: entry.player, decisionId: pending.id, choice: entry.choice });
    if (!result.ok) {
      this.error = `引擎拒絕了這個選擇：${result.message}`;
      return false;
    }
    this.state = result.state;
    this.record(result.events);
    this.entries.push(entry);
    return true;
  }

  private record(events: readonly Parameters<typeof redactEvent>[0][]): void {
    for (const event of events) this.events.push(redactEvent(event, this.seat));
  }

  private botTurn(): boolean {
    const pending = this.state.pending;
    return !!pending && !this.state.result && (pending.player !== this.seat || this.autoPlay);
  }

  private schedule(): void {
    if (this.timer || !this.botTurn()) return;
    const delay = this.state.pending?.player === this.seat ? Math.min(this.botDelay, 250) : this.botDelay;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.botTurn()) return;
      const player = this.state.pending!.player;
      // The opponent sees what its seat is allowed to see, nothing more.
      const view = getPlayerView(this.state, player);
      if (!view.decision?.mine) return;
      this.apply({ player, choice: this.bots[player].choose(view, view.decision.decision) });
      this.changed();
    }, delay);
  }

  private makeSnapshot(): HostSnapshot {
    return {
      view: getPlayerView(this.state, this.seat),
      events: [...this.events],
      autoPlay: this.autoPlay,
      waiting: this.botTurn(),
      error: this.error,
    };
  }

  private save(): void {
    try {
      const saved: SavedGame = { version: 1, setup: this.setup, entries: this.entries };
      this.storage?.setItem(SAVE_KEY, JSON.stringify(saved));
    } catch {
      // Saving is a convenience; a full or blocked storage must not stop the game.
    }
  }

  private changed(): void {
    this.snapshot = this.makeSnapshot();
    this.save();
    this.schedule();
    for (const listener of this.listeners) listener();
  }
}

export function loadSaved(storage: Pick<Storage, 'getItem'> | null): SavedGame | null {
  try {
    const raw = storage?.getItem(SAVE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedGame;
    if (saved.version !== 1 || !Array.isArray(saved.entries) || !saved.setup?.seed) return null;
    return saved;
  } catch {
    return null;
  }
}
