/**
 * Online play: one WebSocket connection to the game server.
 *
 * OnlineClient holds the connection, the room (lobby) and the seat token.
 * The token is kept in localStorage, so after a page reload the client goes
 * straight back to its seat. A lost connection is retried automatically
 * (0.5 s, 1 s, 2 s ... at most 5 s apart); a heartbeat notices a connection
 * that died without closing.
 *
 * RemoteGame is the GameHost of one online game. Like LocalHost it only has
 * its own seat's player view and redacted events, and here that is all the
 * browser ever receives: the game itself runs on the server. 自動代打 uses
 * the Advanced computer player on this seat's own view only.
 */

import type { Choice, GameEventView, PlayerId, PlayerView } from '@wso/game-engine';
import { getCard } from '@wso/card-database';
import { type Ai, createAi } from '@wso/ai';
import { type ClientMessage, type DeckChoice, ERROR_ZH, type LobbyState, type Replay, type ServerMessage, WS_PATH } from '@wso/server/shared';
import type { GameHost, HostSnapshot, HostUpdate } from './types';

export const ONLINE_KEY = 'wso.online.v1';
const KEPT_UPDATES = 120;
const HEARTBEAT_MS = 5000;
/** No message for this long: the connection is treated as dead and reopened. */
const SILENCE_MS = 12_000;

export interface OnlineSession {
  code: string;
  token: string;
  seat: PlayerId;
}

export type Connection = 'idle' | 'connecting' | 'open' | 'reconnecting';

export interface OnlineSnapshot {
  connection: Connection;
  session: OnlineSession | null;
  lobby: LobbyState | null;
  game: RemoteGame | null;
  error: string | null;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function serverUrl(loc: Pick<Location, 'protocol' | 'host'> = window.location): string {
  return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}${WS_PATH}`;
}

export function loadOnlineSession(storage: StorageLike | null): OnlineSession | null {
  try {
    const raw = storage?.getItem(ONLINE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as OnlineSession;
    return typeof s.code === 'string' && typeof s.token === 'string' && (s.seat === 0 || s.seat === 1) ? s : null;
  } catch {
    return null;
  }
}

export interface OnlineClientOptions {
  url?: string;
  storage?: StorageLike | null;
  /** Delay before 自動代打 answers, ms. */
  autoPlayDelay?: number;
  WebSocketImpl?: typeof WebSocket;
}

export class OnlineClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<() => void>();
  private snapshot: OnlineSnapshot;
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private lastHeard = 0;
  private closedForGood = false;
  /** Sent once the connection opens (create or join). */
  private pendingIntro: ClientMessage | null = null;
  private replayWaiters: ((replay: Replay) => void)[] = [];
  private readonly url: string;
  private readonly storage: StorageLike | null;
  private readonly WS: typeof WebSocket;
  readonly autoPlayDelay: number;

  constructor(options: OnlineClientOptions = {}) {
    this.url = options.url ?? serverUrl();
    this.storage = options.storage ?? null;
    this.WS = options.WebSocketImpl ?? WebSocket;
    this.autoPlayDelay = options.autoPlayDelay ?? 300;
    this.snapshot = { connection: 'idle', session: loadOnlineSession(this.storage), lobby: null, game: null, error: null };
  }

  getSnapshot = (): OnlineSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private set(patch: Partial<OnlineSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  // ----- Actions -------------------------------------------------------------

  create(name: string, deck: DeckChoice): void {
    this.intro({ t: 'create', name, deck });
  }

  join(code: string, name: string, deck: DeckChoice): void {
    this.intro({ t: 'join', code: code.trim().toUpperCase(), name, deck });
  }

  /** Back to the seat saved in this browser (after a reload). */
  resume(): void {
    if (!this.snapshot.session) return;
    this.closedForGood = false;
    this.open();
  }

  setDeck(deck: DeckChoice): void {
    this.send({ t: 'deck', deck });
  }

  setReady(ready: boolean): void {
    this.send({ t: 'ready', ready });
  }

  rematch(): void {
    this.send({ t: 'rematch' });
  }

  /** Leaves the room for good: concedes a game in progress, forgets the seat. */
  leave(): void {
    this.send({ t: 'leave' });
    this.forget();
    this.disconnect();
    this.set({ connection: 'idle', lobby: null, game: null, error: null });
  }

  requestReplay(game: number): Promise<Replay> {
    return new Promise((resolve, reject) => {
      this.replayWaiters.push(resolve);
      this.send({ t: 'replay', game });
      setTimeout(() => reject(new Error('timeout')), 10_000);
    });
  }

  clearError(): void {
    this.set({ error: null });
  }

  /** Closes the connection without leaving the room (the page is going away). */
  dispose(): void {
    this.closedForGood = true;
    this.snapshot.game?.dispose();
    this.disconnect();
  }

  send(message: ClientMessage): boolean {
    if (this.ws?.readyState !== this.WS.OPEN) return false;
    this.ws.send(JSON.stringify(message));
    return true;
  }

  // ----- Connection ----------------------------------------------------------

  private intro(message: ClientMessage): void {
    this.closedForGood = false;
    this.set({ error: null });
    if (this.ws?.readyState === this.WS.OPEN) {
      this.send(message);
      return;
    }
    this.pendingIntro = message;
    this.open();
  }

  private open(): void {
    if (this.ws && (this.ws.readyState === this.WS.OPEN || this.ws.readyState === this.WS.CONNECTING)) return;
    this.set({ connection: this.retry > 0 ? 'reconnecting' : 'connecting' });
    let ws: WebSocket;
    try {
      ws = new this.WS(this.url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.retry = 0;
      this.lastHeard = Date.now();
      this.set({ connection: 'open' });
      this.startHeartbeat();
      const session = this.snapshot.session;
      if (this.pendingIntro) {
        this.send(this.pendingIntro);
        this.pendingIntro = null;
      } else if (session) {
        const game = this.snapshot.game;
        this.send({ t: 'resume', code: session.code, token: session.token, game: game?.gameNo ?? 0, lastUpdate: game?.lastUpdateId ?? -1 });
      }
    };
    ws.onmessage = (event) => {
      if (this.ws !== ws) return;
      this.lastHeard = Date.now();
      let message: ServerMessage;
      try {
        message = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        return;
      }
      this.receive(message);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.stopHeartbeat();
      this.snapshot.game?.setConnected(false);
      if (this.closedForGood) {
        this.set({ connection: 'idle' });
        return;
      }
      this.scheduleRetry();
    };
    ws.onerror = () => {
      // onclose follows.
    };
  }

  private scheduleRetry(): void {
    if (this.closedForGood || this.retryTimer) return;
    // Nothing to come back to: stay idle (the lobby form is shown).
    if (!this.snapshot.session && !this.pendingIntro) {
      this.set({ connection: 'idle', error: '無法連接伺服器。請確定已啟動伺服器（npm run server），並用伺服器的網址開啟本頁。' });
      return;
    }
    const delay = Math.min(5000, 500 * 2 ** this.retry);
    this.retry++;
    this.set({ connection: 'reconnecting' });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.open();
    }, delay);
  }

  private disconnect(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.stopHeartbeat();
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      if (Date.now() - this.lastHeard > SILENCE_MS) {
        // Silent for too long: close and let onclose reconnect.
        const ws = this.ws;
        this.ws = null;
        this.stopHeartbeat();
        this.snapshot.game?.setConnected(false);
        ws?.close();
        this.scheduleRetry();
        return;
      }
      this.send({ t: 'ping' });
    }, HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  private forget(): void {
    try {
      this.storage?.removeItem(ONLINE_KEY);
    } catch {
      // Nothing saved.
    }
    this.snapshot.game?.dispose();
    this.snapshot = { ...this.snapshot, session: null };
  }

  // ----- Messages ------------------------------------------------------------

  private receive(message: ServerMessage): void {
    switch (message.t) {
      case 'welcome': {
        const session: OnlineSession = { code: message.code, token: message.token, seat: message.seat };
        try {
          this.storage?.setItem(ONLINE_KEY, JSON.stringify(session));
        } catch {
          // Without storage a reload cannot come back; the game still works.
        }
        this.set({ session, error: null });
        this.snapshot.game?.setConnected(true);
        return;
      }
      case 'lobby': {
        this.set({ lobby: message.lobby });
        this.snapshot.game?.setLobby(message.lobby);
        return;
      }
      case 'game': {
        const current = this.snapshot.game;
        if (current && current.gameNo === message.game) {
          current.resync(message.events, message.updates, message.restoredUpTo);
          current.setConnected(true);
          return;
        }
        current?.dispose();
        const game = new RemoteGame(this, message.game, message.seat, message.cards, message.opponent, message.events, message.updates, message.restoredUpTo);
        if (this.snapshot.lobby) game.setLobby(this.snapshot.lobby);
        this.set({ game });
        return;
      }
      case 'update':
        if (this.snapshot.game?.gameNo === message.game) this.snapshot.game.push(message.update);
        return;
      case 'replay':
        for (const resolve of this.replayWaiters.splice(0)) resolve(message.replay);
        return;
      case 'pong':
        return;
      case 'error': {
        if (message.code === 'STALE') return; // A duplicate answer: harmless.
        if (message.code === 'BAD_TOKEN' || message.code === 'NOT_FOUND') {
          // The saved seat is gone (room removed or left): start over.
          if (this.snapshot.session && !this.pendingIntro) {
            this.forget();
            this.closedForGood = true;
            this.disconnect();
            this.set({ connection: 'idle', lobby: null, game: null, error: '之前的房間已不存在或已離開，請重新建立或加入房間。' });
            return;
          }
        }
        // A refused deck comes with the validation engine's reason.
        const text = message.code === 'BAD_DECK' && message.message ? `${ERROR_ZH.BAD_DECK}${message.message}` : (ERROR_ZH[message.code] ?? message.message);
        this.set({ error: text });
        this.snapshot.game?.setError(text);
        return;
      }
    }
  }
}

export class RemoteGame implements GameHost {
  readonly mode = 'online' as const;
  private events: GameEventView[];
  private updates: HostUpdate[];
  private restoredUpTo: number;
  private listeners = new Set<() => void>();
  private snapshot: HostSnapshot;
  private autoPlay = false;
  private hold = false;
  private connected = true;
  private lobby: LobbyState | null = null;
  private error: string | null = null;
  private answered = -1;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ai: Ai | null = null;
  private disposed = false;

  constructor(
    private readonly client: OnlineClient,
    readonly gameNo: number,
    readonly seat: PlayerId,
    /** This seat's own 50 card ids (for 自動代打). */
    readonly deckCards: string[],
    readonly opponentName: string,
    events: GameEventView[],
    updates: HostUpdate[],
    restoredUpTo: number,
  ) {
    this.events = [...events];
    this.updates = [...updates];
    this.restoredUpTo = restoredUpTo;
    this.snapshot = this.makeSnapshot();
  }

  get opponentLabel(): string {
    return `對手・${this.opponentName || '玩家'}`;
  }

  get lastUpdateId(): number {
    return this.updates[this.updates.length - 1]?.id ?? -1;
  }

  private get view(): PlayerView {
    return this.updates[this.updates.length - 1]!.view;
  }

  getSnapshot = (): HostSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  submit(choice: Choice): void {
    const decision = this.view.decision;
    if (!decision?.mine || this.view.result) return;
    const id = decision.decision.id;
    // One answer per decision: a double tap sends nothing more.
    if (this.answered === id) return;
    if (this.client.send({ t: 'choice', game: this.gameNo, decisionId: id, choice })) {
      this.answered = id;
      this.error = null;
      this.changed();
    }
  }

  resign(): void {
    this.client.send({ t: 'resign', game: this.gameNo });
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

  getReplay = (): Promise<Replay> => this.client.requestReplay(this.gameNo);

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.listeners.clear();
  }

  // ----- From the client -------------------------------------------------------

  push(update: HostUpdate): void {
    if (update.id <= this.lastUpdateId) return;
    this.events.push(...update.events);
    this.updates.push(update);
    if (this.updates.length > KEPT_UPDATES) this.updates.splice(0, this.updates.length - KEPT_UPDATES);
    this.changed();
  }

  /** The server's copy after coming back: complete events, recent updates. */
  resync(events: GameEventView[], updates: HostUpdate[], restoredUpTo: number): void {
    this.events = [...events];
    const newer = updates.filter((u) => u.id > this.lastUpdateId);
    this.updates.push(...newer);
    if (this.updates.length > KEPT_UPDATES) this.updates.splice(0, this.updates.length - KEPT_UPDATES);
    this.restoredUpTo = Math.max(this.restoredUpTo, restoredUpTo);
    this.answered = -1;
    this.changed();
  }

  setConnected(connected: boolean): void {
    if (this.connected === connected) return;
    this.connected = connected;
    if (connected) this.answered = -1; // An answer lost with the connection may be sent again.
    this.changed();
  }

  setLobby(lobby: LobbyState): void {
    this.lobby = lobby;
    this.changed();
  }

  setError(error: string): void {
    this.error = error;
    this.answered = -1;
    this.changed();
  }

  // ----- Snapshot and 自動代打 -------------------------------------------------------

  private notice(): string | null {
    if (!this.connected) return '與伺服器的連線中斷，正在重新連線…（對局會保留）';
    const lobby = this.lobby;
    if (lobby?.disconnect && !this.view.result) {
      const minutes = Math.max(1, Math.ceil((lobby.disconnect.at - Date.now()) / 60_000));
      if (lobby.disconnect.seat === this.seat) return null;
      return `對手斷線，正在等待對手重新連線。約 ${minutes} 分鐘內未回來，對手會被判投降（平台規則，不是遊戲規則）。`;
    }
    if (this.view.result && lobby?.forfeit !== null && lobby?.forfeit !== undefined) {
      return lobby.forfeit === this.seat ? '你斷線超過保留時間，系統已代你投降。' : '對手斷線超過保留時間，系統已代對手投降。';
    }
    return null;
  }

  private makeSnapshot(): HostSnapshot {
    const view = this.view;
    return {
      view,
      events: this.events,
      updates: [...this.updates],
      restoredUpTo: this.restoredUpTo,
      autoPlay: this.autoPlay,
      waiting: !!view.decision && !view.decision.mine && !view.result,
      error: this.error,
      notice: this.notice(),
    };
  }

  private changed(): void {
    if (this.disposed) return;
    this.snapshot = this.makeSnapshot();
    this.schedule();
    for (const listener of this.listeners) listener();
  }

  private schedule(): void {
    if (this.timer || this.hold || !this.autoPlay || !this.connected) return;
    const decision = this.view.decision;
    if (!decision?.mine || this.view.result || this.answered === decision.decision.id) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const current = this.view.decision;
      if (this.disposed || this.hold || !this.autoPlay || !current?.mine || this.view.result || this.answered === current.decision.id) return;
      this.ai ??= createAi({ level: 'ADVANCED', card: (id) => getCard(id).def, deck: this.deckCards, seed: `auto-${this.gameNo}-${this.seat}` });
      // Only this seat's own view: the same information the player has.
      this.submit(this.ai.choose(this.view, current.decision));
    }, this.client.autoPlayDelay);
  }
}
