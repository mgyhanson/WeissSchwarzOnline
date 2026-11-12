/**
 * What one seat receives: every event redacted for that seat, and one
 * update (the redacted events of one step plus the player view afterwards)
 * per step. The local host, the server (one feed per seat) and the replay
 * viewer all build updates this way, so the interface handles them alike.
 */

import { type GameEvent, type GameEventView, type GameState, type PlayerId, type PlayerView, getPlayerView, redactEvent } from '@wso/game-engine';

/**
 * What one step (the game setup, or one answer) produced, as one seat sees
 * it. The presentation layer plays updates in order; `id` increases by one
 * per update.
 */
export interface HostUpdate {
  id: number;
  events: GameEventView[];
  view: PlayerView;
}

/** How many recent updates are kept (older ones are only needed for animation, which never lags that far). */
export const KEPT_UPDATES = 120;

export class SeatFeed {
  readonly events: GameEventView[] = [];
  readonly updates: HostUpdate[] = [];
  private nextId = 0;

  constructor(readonly seat: PlayerId) {}

  record(events: readonly GameEvent[], state: GameState): HostUpdate {
    const redacted = events.map((event) => redactEvent(event, this.seat));
    this.events.push(...redacted);
    const update: HostUpdate = { id: this.nextId++, events: redacted, view: getPlayerView(state, this.seat) };
    this.updates.push(update);
    if (this.updates.length > KEPT_UPDATES) this.updates.splice(0, this.updates.length - KEPT_UPDATES);
    return update;
  }

  /** Id of the most recent update, -1 before the first. */
  get lastId(): number {
    return this.nextId - 1;
  }
}
