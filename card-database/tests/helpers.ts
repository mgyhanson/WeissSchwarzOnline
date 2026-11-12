/**
 * Helpers for testing real cards. Each player's deck holds three copies of
 * every card of one set, in card number order (the last one listed is on
 * top). Tests then move the cards they need where they need them.
 */

import {
  type Choice,
  type Ctx,
  type Decision,
  type DecisionKind,
  type GameState,
  type MoveOptions,
  type PlayerId,
  type StepResult,
  type TurnStep,
  type ZoneRef,
  advance,
  createCtx,
  createInitialState,
  getInstance,
  moveCard,
  submitChoice,
} from '@wso/game-engine';
import { SETS, defsFor } from '../src/index';

function setCards(setId: string): string[] {
  const set = SETS.find((s) => s.id === setId);
  if (!set) throw new Error(`Unknown set ${setId}`);
  return set.records.map((record) => record.cardId);
}

export const HARUHI = 'SY_W08_TD';
export const ICHIKA = '5HY_W83_TD_ICHIKA';
export const SAO = 'SAO_S20';
export const GUP = 'GUP_W141';

export interface RealScenario {
  step: TurnStep;
  turnPlayer?: PlayerId;
  turnNumber?: number;
  /** The set each player's deck is made of. Default: player 0 Haruhi, player 1 Ichika. */
  sets?: [string, string];
}

export function realState(sets: [string, string] = [HARUHI, ICHIKA]): GameState {
  const decks: [string[], string[]] = [0, 1].map((p) => setCards(sets[p]!).flatMap((id) => [id, id, id])) as [string[], string[]];
  return createInitialState({ defs: defsFor(new Set([...decks[0], ...decks[1]])), decks }, 'card-tests');
}

/** Moves a copy of the card that is still in its owner's deck to a zone, and returns its instance id. */
export function take(ctx: Ctx, player: PlayerId, cardId: string, to: ZoneRef, opts?: MoveOptions): number {
  const id = ctx.state.zones[player].deck.find((candidate) => getInstance(ctx.state, candidate).cardId === cardId);
  if (id === undefined) throw new Error(`No copy of ${cardId} left in player ${player}'s deck`);
  moveCard(ctx, id, to, opts);
  return id;
}

/** Puts copies of the listed cards on top of the player's deck, the first one on the very top. Test setup only. */
export function stackTop(ctx: Ctx, player: PlayerId, cardIds: readonly string[]): number[] {
  const deck = ctx.state.zones[player].deck;
  const chosen: number[] = [];
  for (const cardId of cardIds) {
    const id = deck.find((candidate) => getInstance(ctx.state, candidate).cardId === cardId && !chosen.includes(candidate));
    if (id === undefined) throw new Error(`No copy of ${cardId} left in player ${player}'s deck`);
    chosen.push(id);
  }
  const rest = deck.filter((id) => !chosen.includes(id));
  deck.splice(0, deck.length, ...rest, ...[...chosen].reverse());
  return chosen;
}

/** Leaves only the given cards in the player's deck (first listed on top); the rest go to memory. Test setup only. */
export function onlyInDeck(ctx: Ctx, player: PlayerId, cardIds: readonly string[]): number[] {
  const kept = stackTop(ctx, player, cardIds);
  for (const id of [...ctx.state.zones[player].deck]) {
    if (!kept.includes(id)) moveCard(ctx, id, { player, zone: 'memory' });
  }
  return kept;
}

export function scenario(options: RealScenario, arrange: (ctx: Ctx) => void = () => {}): StepResult {
  const state = realState(options.sets);
  arrange(createCtx(state));
  state.firstPlayer = 0;
  state.turn = { number: options.turnNumber ?? 3, player: options.turnPlayer ?? 0, phase: 'STAND', attackCount: 0 };
  state.stack = [{ kind: 'TURN', step: options.step }];
  return advance(state);
}

export function oid(state: GameState, instanceId: number): number {
  return getInstance(state, instanceId).objectId;
}

export function pending<K extends DecisionKind>(state: GameState, kind: K): Extract<Decision, { kind: K }> {
  const decision = state.pending;
  if (!decision || decision.kind !== kind) {
    throw new Error(`Expected a pending ${kind} decision, found ${decision ? `${decision.kind} ${JSON.stringify(decision).slice(0, 200)}` : 'none'}`);
  }
  return decision as Extract<Decision, { kind: K }>;
}

export function answer(state: GameState, choice: Choice): StepResult {
  const decision = state.pending;
  if (!decision) throw new Error('No decision is pending');
  const result = submitChoice(state, { player: decision.player, decisionId: decision.id, choice });
  if (!result.ok) throw new Error(`Choice rejected: ${result.code} (${result.message})`);
  return { state: result.state, events: result.events };
}

/** Answers a run of decisions in order, collecting all events. */
export function answerAll(state: GameState, choices: Choice[]): StepResult {
  let current = state;
  const events: StepResult['events'] = [];
  for (const choice of choices) {
    const result = answer(current, choice);
    current = result.state;
    events.push(...result.events);
  }
  return { state: current, events };
}

export function cardIdOf(state: GameState, instanceId: number): string {
  return getInstance(state, instanceId).cardId;
}
