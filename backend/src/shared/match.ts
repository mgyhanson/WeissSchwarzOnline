/**
 * One game as a seed plus the list of answers (entries). The engine is
 * deterministic, so the same seed and entries always give the same game:
 * the server stores only these, rebuilds games from them after a restart,
 * and a replay file is the same data.
 *
 * Runs anywhere (server, browser, tests): engine and card data only.
 */

import { type Choice, type GameEvent, type GameState, type PlayerId, createGame, resign, submitChoice } from '@wso/game-engine';
import { defsFor } from '@wso/card-database';

/** One answer, or a concession. `forfeit`: conceded by the server because the player stayed disconnected (a platform rule, not a game rule). */
export type Entry = { player: PlayerId; choice: Choice } | { player: PlayerId; resign: true; forfeit?: true };

export type ApplyResult = { ok: true; events: GameEvent[] } | { ok: false; code: string; message: string };

export class Match {
  state: GameState;
  readonly entries: Entry[] = [];
  /** Events of the setup procedure (createGame). */
  readonly setupEvents: GameEvent[];

  constructor(
    readonly seed: string,
    /** The 50 card ids of each player's deck. */
    readonly decks: [string[], string[]],
  ) {
    const created = createGame({ defs: defsFor(new Set([...decks[0], ...decks[1]])), decks }, seed);
    this.state = created.state;
    this.setupEvents = created.events;
  }

  /**
   * Applies one entry. A rejected entry, or anything the engine throws on
   * (malformed data from the network or a file), changes nothing.
   */
  apply(entry: Entry): ApplyResult {
    try {
      if ('resign' in entry) {
        if (this.state.result) return { ok: false, code: 'GAME_OVER', message: 'The game is over' };
        const result = resign(this.state, entry.player);
        this.state = result.state;
        this.entries.push(entry);
        return { ok: true, events: result.events };
      }
      const pending = this.state.pending;
      if (!pending) return { ok: false, code: 'NO_DECISION', message: 'No decision is pending' };
      const result = submitChoice(this.state, { player: entry.player, decisionId: pending.id, choice: entry.choice });
      if (!result.ok) return result;
      this.state = result.state;
      this.entries.push(entry);
      return { ok: true, events: result.events };
    } catch (error) {
      return { ok: false, code: 'ENGINE_ERROR', message: error instanceof Error ? error.message : String(error) };
    }
  }

  /** Applies an answer only if it is for the decision pending now (the server's duplicate and late submission check). */
  answer(player: PlayerId, decisionId: number, choice: Choice): ApplyResult {
    const pending = this.state.pending;
    if (this.state.result) return { ok: false, code: 'GAME_OVER', message: 'The game is over' };
    if (!pending || pending.id !== decisionId) return { ok: false, code: 'STALE', message: 'That decision is no longer pending' };
    if (pending.player !== player) return { ok: false, code: 'NOT_YOUR_DECISION', message: 'It is the other player’s decision' };
    return this.apply({ player, choice });
  }
}
