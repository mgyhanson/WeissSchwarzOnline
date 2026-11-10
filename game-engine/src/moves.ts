/**
 * The only functions that change where cards are.
 *
 * Every card movement in the game goes through this module, so that zone
 * bookkeeping, object identity (CR-3.1.4), marker handling (CR-3.7.3) and
 * event recording happen in exactly one place. The engine loop (flow/run.ts)
 * checks for interrupt rule actions (refresh, level up) after every step that
 * calls into this module.
 *
 * These functions mutate ctx.state. Callers that need the previous state
 * must clone it first (see cloneState).
 */

import type { CardMovedEvent, GameEvent, MoveReason } from './events';
import { shuffleInPlace } from './rng';
import { getInstance } from './state';
import type { Face, GameState, Orientation, PlayerId, SlotId, ZoneRef } from './types';
import { visibilityPair } from './visibility';
import { allowsFaceChoice, defaultFace, describeZone, markerSlot, pileOf, sameZone, stageSlot } from './zones';

export interface Ctx {
  state: GameState;
  /** Events produced so far, in order. */
  events: GameEvent[];
}

export function createCtx(state: GameState): Ctx {
  return { state, events: [] };
}

export interface MoveOptions {
  /**
   * Where in the destination the card is placed. Default TOP, which is what
   * the rules prescribe for waiting room, clock, level, stock, markers and
   * resolution zone (CR-3.4.2, 3.8.2, 3.9.3, 3.10.2, 3.7.2, 3.13.2).
   */
  position?: 'TOP' | 'BOTTOM';
  /**
   * State of a card entering a stage slot from elsewhere. Default STAND
   * (CR-3.6.3). Ignored for slot-to-slot moves, which keep the current state.
   */
  orientation?: Orientation;
  /** Non-default facing; only allowed for level, memory and marker zones. */
  face?: Face;
  reason?: MoveReason;
}

function relocate(
  ctx: Ctx,
  instanceId: number,
  to: ZoneRef,
  opts: MoveOptions,
  batch: number,
  reason: MoveReason,
): void {
  const state = ctx.state;
  const inst = getInstance(state, instanceId);
  const from = inst.location;

  if (sameZone(from, to)) {
    throw new Error(`Card ${instanceId} is already in ${describeZone(to)}`);
  }
  const face = opts.face ?? defaultFace(to.zone);
  if (face !== defaultFace(to.zone) && !allowsFaceChoice(to.zone)) {
    throw new Error(`A card cannot be placed ${face} in ${describeZone(to)}`);
  }

  const source = pileOf(state, from);
  const index = source.indexOf(instanceId);
  if (index < 0) {
    throw new Error(`State corrupted: card ${instanceId} is not in ${describeZone(from)}`);
  }

  const visibleBefore = visibilityPair(inst);
  const fromObjectId = inst.objectId;
  const slotToSlot = from.zone === 'stage' && to.zone === 'stage';

  source.splice(index, 1);
  const position = opts.position ?? 'TOP';
  const destination = pileOf(state, to);
  if (position === 'BOTTOM') destination.unshift(instanceId);
  else destination.push(instanceId);

  // CR-3.1.4: a card that changes zone is a new card, except slot to slot.
  if (!slotToSlot) inst.objectId = state.nextObjectId++;

  // CR-3.6.3: enters a slot standing; a move between slots keeps its state.
  if (to.zone === 'stage') {
    if (!slotToSlot) inst.orientation = opts.orientation ?? 'STAND';
  } else {
    inst.orientation = null;
  }

  inst.face = face;
  inst.location = { ...to };
  inst.enteredBatch = batch;

  const event: CardMovedEvent = {
    type: 'CARD_MOVED',
    seq: state.nextEventSeq++,
    batch,
    instanceId,
    cardId: inst.cardId,
    owner: inst.owner,
    from: { ...from },
    to: { ...to },
    fromObjectId,
    toObjectId: inst.objectId,
    toPosition: position,
    orientation: inst.orientation,
    face: inst.face,
    visibleBefore,
    visibleAfter: visibilityPair(inst),
    reason,
  };
  ctx.events.push(event);
}

function discardMarkers(ctx: Ctx, markerIds: number[], batch: number): void {
  for (const id of markerIds) {
    const owner = getInstance(ctx.state, id).owner;
    relocate(ctx, id, { player: owner, zone: 'waitingRoom' }, {}, batch, 'MARKER_DISCARD');
  }
}

/** CR-3.7.3: what happens to the markers of a slot when its card leaves. */
function moveMarkersOfLeavingCard(ctx: Ctx, from: { player: PlayerId; slot: SlotId }, to: ZoneRef, batch: number): void {
  const state = ctx.state;
  const sourceMarkers = [...pileOf(state, markerSlot(from.player, from.slot))];

  if (to.zone === 'stage' && to.player === from.player) {
    // CR-3.7.3.1: markers already at the destination go to their owners'
    // waiting rooms, then the card's own markers follow it.
    const destinationRef = markerSlot(to.player, to.slot);
    discardMarkers(ctx, [...pileOf(state, destinationRef)], batch);
    for (const id of sourceMarkers) {
      const face = getInstance(state, id).face;
      relocate(ctx, id, destinationRef, { face }, batch, 'MARKER_FOLLOW');
    }
    return;
  }

  // CR-3.7.3.2: any other destination.
  discardMarkers(ctx, sourceMarkers, batch);
}

export interface BatchMove {
  instanceId: number;
  to: ZoneRef;
  opts?: MoveOptions;
}

/**
 * Moves several cards simultaneously (one batch), each to its own
 * destination. Cards are placed one after another in the order given: with
 * position TOP each lands on top of the previous one, with BOTTOM below it.
 */
export function moveBatch(ctx: Ctx, moves: readonly BatchMove[]): void {
  if (new Set(moves.map((m) => m.instanceId)).size !== moves.length) {
    throw new Error('moveBatch: the same card was listed twice');
  }
  if (moves.length === 0) return;

  const batch = ctx.state.nextBatchId++;
  for (const move of moves) {
    const opts = move.opts ?? {};
    const inst = getInstance(ctx.state, move.instanceId);
    const from = { ...inst.location };
    // An earlier move of this batch may already have carried the card along
    // (a marker following or being discarded with its character).
    if (sameZone(from, move.to)) continue;
    relocate(ctx, move.instanceId, move.to, opts, batch, opts.reason ?? 'UNSPECIFIED');
    if (from.zone === 'stage') {
      moveMarkersOfLeavingCard(ctx, { player: from.player, slot: from.slot }, move.to, batch);
    }
  }
}

/** Moves several cards simultaneously to the same zone. See moveBatch for the ordering. */
export function moveCards(ctx: Ctx, instanceIds: readonly number[], to: ZoneRef, opts: MoveOptions = {}): void {
  moveBatch(
    ctx,
    instanceIds.map((instanceId) => ({ instanceId, to, opts })),
  );
}

export function moveCard(ctx: Ctx, instanceId: number, to: ZoneRef, opts: MoveOptions = {}): void {
  const inst = getInstance(ctx.state, instanceId);
  if (sameZone(inst.location, to)) {
    throw new Error(`Card ${instanceId} is already in ${describeZone(to)}`);
  }
  moveCards(ctx, [instanceId], to, opts);
}

/**
 * CR-6.5.1.2.4: exchanges the cards of two slots of one player. With a card
 * in both slots they change places simultaneously; with a card in only one
 * it moves to the empty slot; with none nothing happens.
 * Markers travel with their character (CR-3.7.3.1).
 * Returns false when nothing happened.
 */
export function swapSlots(ctx: Ctx, player: PlayerId, a: SlotId, b: SlotId): boolean {
  if (a === b) throw new Error('swapSlots: the two slots must be different');
  const zones = ctx.state.zones[player];
  const cardsA = [...zones.stage[a]];
  const cardsB = [...zones.stage[b]];
  if (cardsA.length > 1 || cardsB.length > 1) {
    throw new Error('swapSlots: a slot holds more than one card; rule actions must be resolved first');
  }
  if (cardsA.length === 0 && cardsB.length === 0) return false;

  const markersA = [...zones.marker[a]];
  const markersB = [...zones.marker[b]];
  const batch = ctx.state.nextBatchId++;

  for (const id of cardsA) relocate(ctx, id, stageSlot(player, b), {}, batch, 'SWAP');
  for (const id of cardsB) relocate(ctx, id, stageSlot(player, a), {}, batch, 'SWAP');

  const follow = (markerIds: number[], hadCharacter: boolean, destination: SlotId): void => {
    if (!hadCharacter) {
      // Markers left in a slot without a character are displaced by the arriving card (CR-3.7.3.1).
      discardMarkers(ctx, markerIds, batch);
      return;
    }
    for (const id of markerIds) {
      const face = getInstance(ctx.state, id).face;
      relocate(ctx, id, markerSlot(player, destination), { face }, batch, 'MARKER_FOLLOW');
    }
  };
  follow(markersA, cardsA.length === 1, b);
  follow(markersB, cardsB.length === 1, a);
  return true;
}

/**
 * Changes the state of a character on the stage (CR-4.6.1).
 * CR-1.3.2.1: putting a card into the state it is already in does nothing;
 * in that case no event is produced and false is returned.
 */
export function setOrientation(ctx: Ctx, instanceId: number, orientation: Orientation): boolean {
  const inst = getInstance(ctx.state, instanceId);
  const location = inst.location;
  if (location.zone !== 'stage' || inst.orientation === null) {
    throw new Error(`setOrientation: card ${instanceId} is not on the stage`);
  }
  if (inst.orientation === orientation) return false;

  const previous = inst.orientation;
  inst.orientation = orientation;
  ctx.events.push({
    type: 'ORIENTATION_CHANGED',
    seq: ctx.state.nextEventSeq++,
    instanceId,
    objectId: inst.objectId,
    player: location.player,
    slot: location.slot,
    from: previous,
    to: orientation,
  });
  return true;
}

/**
 * CR-3.2.4: randomises the order of a player's deck. Every card in the deck
 * gets a new object id so that nothing known about a card's old position
 * can be linked to its new one.
 */
export function shuffleDeck(ctx: Ctx, player: PlayerId): void {
  const state = ctx.state;
  const deck = state.zones[player].deck;
  shuffleInPlace(state.rng, deck);
  for (const id of deck) {
    getInstance(state, id).objectId = state.nextObjectId++;
  }
  ctx.events.push({ type: 'DECK_SHUFFLED', seq: state.nextEventSeq++, player });
}
