/** Test clients that talk to a RoomManager directly (no network), and fake timers. */

import type { PlayerId, PlayerView } from '@wso/game-engine';
import { TEST_DECKS, deckList, getCard } from '@wso/card-database';
import { type Ai, createAi } from '@wso/ai';
import type { RoomManager, Session, Timers } from '../src/rooms';
import type { LobbyState, ServerMessage } from '../src/shared';

export class FakeTimers implements Timers {
  now = 1_000_000;
  private next = 1;
  private pending = new Map<number, { at: number; fn: () => void }>();

  set(fn: () => void, ms: number): unknown {
    const id = this.next++;
    this.pending.set(id, { at: this.now + ms, fn });
    return id;
  }

  clear(handle: unknown): void {
    this.pending.delete(handle as number);
  }

  get count(): number {
    return this.pending.size;
  }

  advance(ms: number): void {
    this.now += ms;
    for (const [id, timer] of [...this.pending].sort((a, b) => a[1].at - b[1].at)) {
      if (timer.at <= this.now && this.pending.has(id)) {
        this.pending.delete(id);
        timer.fn();
      }
    }
  }
}

export class Client {
  readonly messages: ServerMessage[] = [];
  readonly raw: string[] = [];
  closedByServer = false;
  session: Session;

  constructor(private readonly manager: RoomManager) {
    this.session = this.open();
  }

  private open(): Session {
    return this.manager.connect({
      send: (message) => {
        const json = JSON.stringify(message);
        this.raw.push(json);
        this.messages.push(JSON.parse(json) as ServerMessage);
      },
      close: () => {
        this.closedByServer = true;
      },
    });
  }

  send(message: object): void {
    this.session.receive(JSON.stringify(message));
  }

  /** The connection drops. */
  disconnect(): void {
    this.session.closed();
  }

  /** A new connection from the same browser (after disconnect()). */
  reconnect(): void {
    this.session = this.open();
  }

  all<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }>[] {
    return this.messages.filter((m): m is Extract<ServerMessage, { t: T }> => m.t === t);
  }

  last<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }> | undefined {
    const list = this.all(t);
    return list[list.length - 1];
  }

  get lobby(): LobbyState | undefined {
    return this.last('lobby')?.lobby;
  }

  get welcome() {
    return this.last('welcome');
  }

  /** The current game number and the newest view of it, from 'game' and 'update' messages. */
  get game(): { game: number; view: PlayerView; lastUpdate: number } | null {
    let current: { game: number; view: PlayerView; lastUpdate: number } | null = null;
    for (const m of this.messages) {
      if (m.t === 'game') {
        const last = m.updates[m.updates.length - 1];
        if (last) current = { game: m.game, view: last.view, lastUpdate: last.id };
      } else if (m.t === 'update' && current && m.game === current.game && m.update.id > current.lastUpdate) {
        current = { game: m.game, view: m.update.view, lastUpdate: m.update.id };
      }
    }
    return current;
  }

  get errors(): string[] {
    return this.all('error').map((e) => e.code);
  }
}

export function aiFor(deckId: string, seed: string): Ai {
  const deck = TEST_DECKS.find((d) => d.id === deckId)!;
  return createAi({ level: 'NORMAL', card: (id) => getCard(id).def, deck: deckList(deck), seed });
}

/** Creates a room with two clients, both ready: the first game has started. */
export function startedRoom(manager: RoomManager, decks: [string, string] = ['test-haruhi', 'test-ichika']): { a: Client; b: Client; code: string } {
  const a = new Client(manager);
  a.send({ t: 'create', name: 'Alice', deck: decks[0] });
  const code = a.welcome!.code;
  const b = new Client(manager);
  b.send({ t: 'join', code, name: 'Bob', deck: decks[1] });
  a.send({ t: 'ready', ready: true });
  b.send({ t: 'ready', ready: true });
  return { a, b, code };
}

/**
 * Both clients answer with their AI until the game ends or `steps` answers
 * were sent. Returns the number of answers sent.
 */
export function play(clients: [Client, Client], ais: [Ai, Ai], steps = 100_000): number {
  let sent = 0;
  while (sent < steps) {
    let moved = false;
    for (const seat of [0, 1] as PlayerId[]) {
      const client = clients[seat]!;
      const current = client.game;
      if (!current || current.view.result || !current.view.decision?.mine) continue;
      const decision = current.view.decision.decision;
      client.send({ t: 'choice', game: current.game, decisionId: decision.id, choice: ais[seat]!.choose(current.view, decision) });
      sent++;
      moved = true;
      if (sent >= steps) break;
    }
    if (!moved) break;
  }
  return sent;
}
