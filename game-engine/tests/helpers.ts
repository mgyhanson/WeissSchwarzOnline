/**
 * Test fixtures. The cards here are synthetic ("T0-00"...): they are not
 * real Weiss Schwarz cards and exist only to exercise the zone layer.
 * Every card has a unique id so tests can tell exactly which card leaked.
 */

import {
  type CardDef,
  type Ctx,
  type GameState,
  type PlayerId,
  type ZoneRef,
  createCtx,
  createInitialState,
  moveCard,
} from '../src/index';

export const DECK_SIZE = 50;

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

export function newTestState(seed = 'test-seed'): GameState {
  const defs: Record<string, CardDef> = {};
  const decks: [string[], string[]] = [[], []];
  for (const player of [0, 1] as const) {
    for (let i = 0; i < DECK_SIZE; i++) {
      const id = testCardId(player, i);
      defs[id] = testDef(id, i);
      decks[player].push(id);
    }
  }
  return createInitialState({ defs, decks }, seed);
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
