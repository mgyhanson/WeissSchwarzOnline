/**
 * Creating and copying game states.
 */

import { seedRng } from './rng';
import type { CardDef, CardInstance, GameState, PlayerId, PlayerZones, SlotId } from './types';
import { PLAYERS, RULES_VERSION, SLOTS } from './types';

export interface GameConfig {
  /** Printed data for every card id that appears in either deck. */
  defs: Record<string, CardDef>;
  /**
   * The two deck lists as card ids. The first id ends up at the bottom of the
   * deck and the last at the top; decks are shuffled during game setup
   * (CR-5.2.1.2).
   */
  decks: [string[], string[]];
}

function emptySlots(): Record<SlotId, number[]> {
  const slots = {} as Record<SlotId, number[]>;
  for (const slot of SLOTS) slots[slot] = [];
  return slots;
}

function emptyZones(): PlayerZones {
  return {
    deck: [],
    hand: [],
    waitingRoom: [],
    clock: [],
    level: [],
    stock: [],
    climax: [],
    memory: [],
    resolution: [],
    stage: emptySlots(),
    marker: emptySlots(),
  };
}

function freezeDefs(defs: Record<string, CardDef>): Readonly<Record<string, CardDef>> {
  const copy: Record<string, CardDef> = {};
  for (const [id, def] of Object.entries(defs)) {
    copy[id] = Object.freeze({
      ...def,
      traits: Object.freeze([...def.traits]) as unknown as string[],
      triggers: Object.freeze([...def.triggers]) as unknown as CardDef['triggers'],
    });
  }
  return Object.freeze(copy);
}

/**
 * Builds the state before game setup: every card is in its owner's deck, in
 * the order listed, nothing has been shuffled or drawn, and no procedure is
 * running. Use createGame (game.ts) to start an actual game.
 *
 * Deck legality (CR-5.1) is checked by the deck validator, not here, so that
 * tests can use small decks.
 */
export function createInitialState(config: GameConfig, seed: string): GameState {
  const defs = freezeDefs(config.defs);
  const instances: CardInstance[] = [];
  const zones: [PlayerZones, PlayerZones] = [emptyZones(), emptyZones()];
  let nextObjectId = 1;

  for (const player of PLAYERS) {
    for (const cardId of config.decks[player]) {
      if (!defs[cardId]) {
        throw new Error(`createInitialState: unknown card id "${cardId}" in deck of player ${player}`);
      }
      const instanceId = instances.length;
      instances.push({
        instanceId,
        owner: player,
        cardId,
        objectId: nextObjectId++,
        location: { player, zone: 'deck' },
        enteredBatch: 0,
        orientation: null,
        face: 'DOWN',
      });
      zones[player].deck.push(instanceId);
    }
  }

  return {
    rulesVersion: RULES_VERSION,
    defs,
    instances,
    zones,
    initialCounts: [config.decks[0].length, config.decks[1].length],
    rng: seedRng(seed),
    nextObjectId,
    nextEventSeq: 1,
    nextBatchId: 1,
    nextDecisionId: 1,
    firstPlayer: null,
    turn: null,
    stack: [],
    pending: null,
    answer: null,
    result: null,
    lastCheckActed: false,
  };
}

/**
 * Deep copy of a state. The frozen card definitions are shared, everything
 * else is copied, so mutating the copy never affects the original.
 */
export function cloneState(state: GameState): GameState {
  const { defs, ...rest } = state;
  const copy = structuredClone(rest) as Omit<GameState, 'defs'>;
  return { ...copy, defs };
}

/** Canonical JSON of the mutable part of a state, for comparing and hashing. */
export function serializeState(state: GameState): string {
  const { defs: _defs, ...rest } = state;
  return JSON.stringify(rest);
}

export function getInstance(state: GameState, instanceId: number): CardInstance {
  const inst = state.instances[instanceId];
  if (!inst) throw new Error(`Unknown card instance ${instanceId}`);
  return inst;
}

export function getDef(state: GameState, instanceId: number): CardDef {
  const inst = getInstance(state, instanceId);
  const def = state.defs[inst.cardId];
  if (!def) throw new Error(`Missing card definition for "${inst.cardId}"`);
  return def;
}

/** CR-4.3.2: the master of a card is the player whose zone it is in. */
export function masterOf(state: GameState, instanceId: number): PlayerId {
  return getInstance(state, instanceId).location.player;
}
