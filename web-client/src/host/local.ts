/**
 * A game host that runs in the browser: one human seat against a computer
 * player of the chosen level. It holds the game state and hands the
 * interface only the player view and redacted events of the human seat,
 * exactly as the server of STEP 9 will. The computer player likewise gets
 * its own view only; an Expert also gets worlds sampled from what it is
 * allowed to know (ai/src/sampler.ts).
 *
 * The game is saved as its seed plus the list of answers, so a page reload
 * replays it to the same position (the engine is deterministic).
 */

import {
  type Choice,
  type GameEventView,
  type GameState,
  type PlayerId,
  RULES_VERSION,
  createGame,
  getPlayerView,
  redactEvent,
  resign,
  submitChoice,
} from '@wso/game-engine';
import { TEST_DECKS, deckList, defsFor, getCard } from '@wso/card-database';
import { AI_LEVEL_ZH, type Ai, type AiLevel, createAi, createWorldSampler } from '@wso/ai';
import type { Replay } from '@wso/server/shared';
import type { GameHost, HostSnapshot, HostUpdate } from './types';

export type { GameHost, HostSnapshot, HostUpdate } from './types';

export interface GameSetup {
  seed: string;
  /** Test deck ids for seat 0 and seat 1. */
  decks: [string, string];
  /** Level of the computer opponent. Saves from before STEP 8 have none and get NORMAL. */
  level?: AiLevel;
}

/** Level used for 自動代打 (the computer answering for the human seat). */
const AUTO_PLAY_LEVEL: AiLevel = 'ADVANCED';

type Entry = { player: PlayerId; choice: Choice } | { player: PlayerId; resign: true };

export interface SavedGame {
  version: 1;
  setup: GameSetup;
  entries: Entry[];
}

/** How many recent updates the snapshot keeps (older ones are only needed for animation, which never lags that far). */
const KEPT_UPDATES = 120;

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
  readonly mode = 'local' as const;
  private state: GameState;
  private events: GameEventView[] = [];
  private entries: Entry[] = [];
  private listeners = new Set<() => void>();
  private updates: HostUpdate[] = [];
  private nextUpdateId = 0;
  private restoredUpTo = -1;
  private hold = false;
  private snapshot: HostSnapshot;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private autoPlay = false;
  private error: string | null = null;
  private readonly ais: [Ai, Ai];
  private readonly lists: [string[], string[]];
  private readonly botDelay: number;
  private readonly storage: LocalHostOptions['storage'];

  constructor(
    readonly setup: GameSetup,
    options: LocalHostOptions = {},
  ) {
    this.botDelay = options.botDelay ?? 600;
    this.storage = options.storage ?? null;
    const decks: [string[], string[]] = [deck(setup.decks[0]), deck(setup.decks[1])];
    this.lists = decks;
    const card = (id: string) => getCard(id).def;
    const levels: [AiLevel, AiLevel] = [AUTO_PLAY_LEVEL, setup.level ?? 'NORMAL'];
    this.ais = [0, 1].map((p) => createAi({ level: levels[p]!, card, deck: decks[p]!, seed: `${setup.seed}-ai-${p}` })) as [Ai, Ai];
    const created = createGame({ defs: defsFor(new Set([...decks[0], ...decks[1]])), decks }, setup.seed);
    this.state = created.state;
    this.record(created.events);
    for (const entry of options.entries ?? []) {
      if (!this.apply(entry)) break;
    }
    if ((options.entries ?? []).length > 0) this.restoredUpTo = this.nextUpdateId - 1;
    this.snapshot = this.makeSnapshot();
    this.save();
    this.schedule();
  }

  get opponentLabel(): string {
    return `對手・${AI_LEVEL_ZH[this.setup.level ?? 'NORMAL']} AI`;
  }

  /** The replay of this game once it is over (it contains the seed, so not before). */
  getReplay = async (): Promise<Replay> => {
    if (!this.state.result) throw new Error('The game is not over');
    const deckOf = (id: string, cards: string[]) => ({ id, name: TEST_DECKS.find((d) => d.id === id)?.name ?? id, cards });
    return {
      format: 'wso-replay',
      version: 1,
      rulesVersion: RULES_VERSION,
      createdAt: new Date().toISOString(),
      source: 'local',
      players: ['你', this.opponentLabel.replace('對手・', '')],
      seed: this.setup.seed,
      decks: [deckOf(this.setup.decks[0], this.lists[0]), deckOf(this.setup.decks[1], this.lists[1])],
      entries: this.entries.map((entry) => ('resign' in entry ? { player: entry.player, resign: true } : { player: entry.player, choice: entry.choice })),
      result: this.state.result,
    };
  };

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

  setHold(hold: boolean): void {
    if (this.hold === hold) return;
    this.hold = hold;
    if (!hold) this.schedule();
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
    const redacted = events.map((event) => redactEvent(event, this.seat));
    this.events.push(...redacted);
    this.updates.push({ id: this.nextUpdateId++, events: redacted, view: getPlayerView(this.state, this.seat) });
    if (this.updates.length > KEPT_UPDATES) this.updates.splice(0, this.updates.length - KEPT_UPDATES);
  }

  private botTurn(): boolean {
    const pending = this.state.pending;
    return !!pending && !this.state.result && (pending.player !== this.seat || this.autoPlay);
  }

  private schedule(): void {
    if (this.timer || this.hold || !this.botTurn()) return;
    const delay = this.state.pending?.player === this.seat ? Math.min(this.botDelay, 250) : this.botDelay;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.hold || !this.botTurn()) return;
      const player = this.state.pending!.player;
      // The computer player sees what its seat is allowed to see, nothing more.
      const view = getPlayerView(this.state, player);
      if (!view.decision?.mine) return;
      const ai = this.ais[player];
      const sample = ai.level === 'EXPERT' ? createWorldSampler(this.state, player, this.lists[player]) : undefined;
      this.apply({ player, choice: ai.choose(view, view.decision.decision, sample) });
      this.changed();
    }, delay);
  }

  private makeSnapshot(): HostSnapshot {
    return {
      view: getPlayerView(this.state, this.seat),
      events: [...this.events],
      updates: [...this.updates],
      restoredUpTo: this.restoredUpTo,
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
