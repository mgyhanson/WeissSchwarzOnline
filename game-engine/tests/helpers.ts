/**
 * Test fixtures. The cards here are synthetic ("T0-00"...): they are not
 * real Weiss Schwarz cards and exist only to exercise the engine.
 * Every card has a unique id so tests can tell exactly which card leaked.
 */

import {
  type CardDef,
  type CardInstance,
  type Choice,
  type Ctx,
  type Decision,
  type DecisionKind,
  type GameConfig,
  type GameState,
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
} from '../src/index';

export const DECK_SIZE = 50;

/** Changes to the default test card at a given position of a player's deck list. */
export type DefOverride = (player: PlayerId, index: number) => Partial<CardDef> | undefined;

export function testCardId(player: PlayerId, index: number): string {
  return `T${player}-${String(index).padStart(2, '0')}`;
}

function testDef(cardId: string, index: number): CardDef {
  // Indices 42..49 are climaxes, the rest are level 0 characters.
  if (index >= 42) {
    return {
      cardId,
      name: `Test climax ${cardId}`,
      kind: 'CLIMAX',
      color: 'red',
      level: null,
      cost: null,
      power: null,
      soul: null,
      traits: [],
      triggers: [],
      counter: false,
    };
  }
  return {
    cardId,
    name: `Test character ${cardId}`,
    kind: 'CHARACTER',
    color: 'red',
    level: 0,
    cost: 0,
    power: 1000,
    soul: 1,
    traits: [],
    triggers: [],
    counter: false,
  };
}

/** A test event card, for use in a DefOverride. */
export const EVENT: Partial<CardDef> = { kind: 'EVENT', level: 0, cost: 0, power: null, soul: null };

export function testConfig(override?: DefOverride): GameConfig {
  const defs: Record<string, CardDef> = {};
  const decks: [string[], string[]] = [[], []];
  for (const player of [0, 1] as const) {
    for (let i = 0; i < DECK_SIZE; i++) {
      const id = testCardId(player, i);
      defs[id] = { ...testDef(id, i), ...(override?.(player, i) ?? {}) };
      decks[player].push(id);
    }
  }
  return { defs, decks };
}

export function newTestState(seed = 'test-seed', override?: DefOverride): GameState {
  return createInitialState(testConfig(override), seed);
}

export function newTestCtx(seed = 'test-seed'): Ctx {
  return createCtx(newTestState(seed));
}

/** Instance id of a player's test card: player 0 has 0..49, player 1 has 50..99. */
export function card(player: PlayerId, index: number): number {
  return player * DECK_SIZE + index;
}

/** Moves a card and returns its instance id, for compact test setup. */
export function put(ctx: Ctx, instanceId: number, to: ZoneRef, opts?: Parameters<typeof moveCard>[3]): number {
  moveCard(ctx, instanceId, to, opts);
  return instanceId;
}

/** The object id players use for a card. */
export function oid(state: GameState, instanceId: number): number {
  return getInstance(state, instanceId).objectId;
}

export interface ScenarioOptions {
  /** The step of the turn at which the prepared position starts. */
  step: TurnStep;
  turnPlayer?: PlayerId;
  turnNumber?: number;
  seed?: string;
  defs?: DefOverride;
}

/**
 * Builds a mid-game position: every card starts in its owner's (unshuffled)
 * deck, `arrange` moves cards where the test needs them, then the game runs
 * from the given step of the given player's turn to the first decision.
 */
export function scenario(options: ScenarioOptions, arrange: (ctx: Ctx) => void = () => {}): StepResult {
  const state = newTestState(options.seed, options.defs);
  arrange(createCtx(state));
  state.firstPlayer = 0;
  state.turn = { number: options.turnNumber ?? 3, player: options.turnPlayer ?? 0, phase: 'STAND', attackCount: 0 };
  state.stack = [{ kind: 'TURN', step: options.step }];
  return advance(state);
}

/** The pending decision, which must be of the given kind. */
export function pending<K extends DecisionKind>(state: GameState, kind: K): Extract<Decision, { kind: K }> {
  const decision = state.pending;
  if (!decision || decision.kind !== kind) {
    throw new Error(`Expected a pending ${kind} decision, found ${decision ? decision.kind : 'none'}`);
  }
  return decision as Extract<Decision, { kind: K }>;
}

/** Answers the pending decision as the player it is addressed to; throws if the engine rejects it. */
export function answer(state: GameState, choice: Choice): StepResult {
  const decision = state.pending;
  if (!decision) throw new Error('No decision is pending');
  const result = submitChoice(state, { player: decision.player, decisionId: decision.id, choice });
  if (!result.ok) throw new Error(`Choice rejected: ${result.code} (${result.message})`);
  return { state: result.state, events: result.events };
}

/**
 * Independent statement of the visibility rules (CR-3), written separately
 * from src/visibility.ts so that a mistake there is not copied here.
 */
export function shouldBeHidden(viewer: PlayerId, inst: CardInstance): boolean {
  // CR-4.9.1: a card revealed by an effect is shown to everyone wherever it is.
  if (inst.revealed) return false;
  const mine = inst.location.player === viewer;
  const faceDown = inst.face === 'DOWN';
  const table: Record<string, boolean> = {
    deck: true,
    stock: true,
    hand: !mine,
    waitingRoom: false,
    clock: false,
    climax: false,
    resolution: false,
    stage: false,
    level: faceDown && !mine,
    memory: faceDown && !mine,
    marker: faceDown,
  };
  return table[inst.location.zone]!;
}
