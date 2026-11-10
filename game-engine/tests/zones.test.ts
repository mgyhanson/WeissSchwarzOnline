import { describe, expect, it } from 'vitest';
import {
  BACK_SLOTS,
  FRONT_SLOTS,
  SLOTS,
  type CardMovedEvent,
  assertInvariants,
  facingSlot,
  getInstance,
  markerSlot,
  moveCard,
  moveCards,
  setOrientation,
  shuffleDeck,
  slotsBehind,
  slotsInFrontOf,
  stageSlot,
  swapSlots,
} from '../src/index';
import { DECK_SIZE, card, newTestCtx, put, testCardId } from './helpers';

const top = (pile: number[]): number | undefined => pile[pile.length - 1];

describe('stage geometry', () => {
  it('T-ZONE-042 / CR-3.6.4: three front-row slots and two back-row slots', () => {
    expect(SLOTS).toEqual(['FL', 'FC', 'FR', 'BL', 'BR']);
    expect(FRONT_SLOTS).toEqual(['FL', 'FC', 'FR']);
    expect(BACK_SLOTS).toEqual(['BL', 'BR']);
  });

  it('T-ZONE-043 / CR-3.6.5: front/behind relations', () => {
    expect(slotsInFrontOf('BL')).toEqual(['FL', 'FC']);
    expect(slotsInFrontOf('BR')).toEqual(['FC', 'FR']);
    expect(slotsBehind('FL')).toEqual(['BL']);
    expect(slotsBehind('FC')).toEqual(['BL', 'BR']);
    expect(slotsBehind('FR')).toEqual(['BR']);
    for (const slot of FRONT_SLOTS) expect(slotsInFrontOf(slot)).toEqual([]);
    for (const slot of BACK_SLOTS) expect(slotsBehind(slot)).toEqual([]);
  });

  it('T-ZONE-044 / CR-3.6.6: facing relations', () => {
    expect(facingSlot('FL')).toBe('FR');
    expect(facingSlot('FC')).toBe('FC');
    expect(facingSlot('FR')).toBe('FL');
    expect(facingSlot('BL')).toBeNull();
    expect(facingSlot('BR')).toBeNull();
  });
});

describe('initial state', () => {
  it('puts every card in its owner’s deck, face down, last listed card on top', () => {
    const { state } = newTestCtx();
    for (const player of [0, 1] as const) {
      const deck = state.zones[player].deck;
      expect(deck).toHaveLength(DECK_SIZE);
      expect(getInstance(state, top(deck)!).cardId).toBe(testCardId(player, DECK_SIZE - 1));
      for (const id of deck) {
        const inst = getInstance(state, id);
        expect(inst.owner).toBe(player);
        expect(inst.face).toBe('DOWN');
        expect(inst.orientation).toBeNull();
      }
    }
    assertInvariants(state, { settled: true });
  });
});

describe('moving cards', () => {
  it('T-ZONE-030 / CR-3.4.2: a card put in the waiting room goes on top, face up', () => {
    const ctx = newTestCtx();
    const first = put(ctx, card(0, 0), { player: 0, zone: 'waitingRoom' });
    const second = put(ctx, card(0, 1), { player: 0, zone: 'waitingRoom' });
    expect(ctx.state.zones[0].waitingRoom).toEqual([first, second]);
    expect(getInstance(ctx.state, second).face).toBe('UP');
  });

  it('T-ZONE-060 / CR-3.8.2: clock cards stack in the order placed', () => {
    const ctx = newTestCtx();
    const ids = [card(0, 5), card(0, 6), card(0, 7)];
    for (const id of ids) moveCard(ctx, id, { player: 0, zone: 'clock' });
    expect(ctx.state.zones[0].clock).toEqual(ids);
    expect(top(ctx.state.zones[0].clock)).toBe(card(0, 7));
  });

  it('T-ZONE-080 / CR-3.10.2: stock cards go on top, face down', () => {
    const ctx = newTestCtx();
    const first = put(ctx, card(0, 0), { player: 0, zone: 'stock' });
    const second = put(ctx, card(0, 1), { player: 0, zone: 'stock' });
    expect(ctx.state.zones[0].stock).toEqual([first, second]);
    expect(top(ctx.state.zones[0].stock)).toBe(second);
    expect(getInstance(ctx.state, first).face).toBe('DOWN');
    expect(getInstance(ctx.state, second).face).toBe('DOWN');
  });

  it('T-ZONE-090 / CR-3.11.2: a climax in the climax zone is face up', () => {
    const ctx = newTestCtx();
    const climax = put(ctx, card(0, 45), { player: 0, zone: 'climax' });
    expect(ctx.state.zones[0].climax).toEqual([climax]);
    expect(getInstance(ctx.state, climax).face).toBe('UP');
  });

  it('can place a card at the bottom of a zone', () => {
    const ctx = newTestCtx();
    const id = put(ctx, card(0, 49), { player: 0, zone: 'hand' });
    moveCard(ctx, id, { player: 0, zone: 'deck' }, { position: 'BOTTOM' });
    expect(ctx.state.zones[0].deck[0]).toBe(id);
    expect(ctx.state.zones[0].deck).toHaveLength(DECK_SIZE);
  });

  it('T-ZONE-041 / CR-3.6.3: a card entering a slot stands; a move between slots keeps its state', () => {
    const ctx = newTestCtx();
    const id = put(ctx, card(0, 0), stageSlot(0, 'FL'));
    expect(getInstance(ctx.state, id).orientation).toBe('STAND');

    setOrientation(ctx, id, 'REST');
    moveCard(ctx, id, stageSlot(0, 'BR'));
    expect(getInstance(ctx.state, id).orientation).toBe('REST');
    expect(ctx.state.zones[0].stage.FL).toEqual([]);
    expect(ctx.state.zones[0].stage.BR).toEqual([id]);
  });

  it('CR-3.6.3: an effect may place a card in a slot in another state', () => {
    const ctx = newTestCtx();
    const id = put(ctx, card(0, 0), stageSlot(0, 'FC'), { orientation: 'REST' });
    expect(getInstance(ctx.state, id).orientation).toBe('REST');
  });

  it('a card leaving the stage has no stand/rest/reverse state any more', () => {
    const ctx = newTestCtx();
    const id = put(ctx, card(0, 0), stageSlot(0, 'FL'));
    setOrientation(ctx, id, 'REVERSE');
    moveCard(ctx, id, { player: 0, zone: 'waitingRoom' });
    expect(getInstance(ctx.state, id).orientation).toBeNull();
  });

  it('T-ZONE-002 / CR-3.1.4: a card that changes zone is a new object, except slot to slot', () => {
    const ctx = newTestCtx();
    const id = card(0, 0);
    const inDeck = getInstance(ctx.state, id).objectId;

    moveCard(ctx, id, { player: 0, zone: 'hand' });
    const inHand = getInstance(ctx.state, id).objectId;
    expect(inHand).not.toBe(inDeck);

    moveCard(ctx, id, stageSlot(0, 'FL'));
    const onStage = getInstance(ctx.state, id).objectId;
    expect(onStage).not.toBe(inHand);

    moveCard(ctx, id, stageSlot(0, 'FC'));
    expect(getInstance(ctx.state, id).objectId).toBe(onStage);

    moveCard(ctx, id, { player: 0, zone: 'waitingRoom' });
    expect(getInstance(ctx.state, id).objectId).not.toBe(onStage);
  });

  it('T-ZONE-070 / CR-3.9.2: level cards are face up unless an effect says face down', () => {
    const ctx = newTestCtx();
    const faceUp = put(ctx, card(0, 0), { player: 0, zone: 'level' });
    const faceDown = put(ctx, card(0, 1), { player: 0, zone: 'level' }, { face: 'DOWN' });
    expect(getInstance(ctx.state, faceUp).face).toBe('UP');
    expect(getInstance(ctx.state, faceDown).face).toBe('DOWN');
    expect(ctx.state.zones[0].level).toEqual([faceUp, faceDown]);
  });

  it('T-ZONE-100 / CR-3.12.2: memory cards are face up unless an effect says face down', () => {
    const ctx = newTestCtx();
    const faceUp = put(ctx, card(0, 0), { player: 0, zone: 'memory' });
    const faceDown = put(ctx, card(0, 1), { player: 0, zone: 'memory' }, { face: 'DOWN' });
    expect(getInstance(ctx.state, faceUp).face).toBe('UP');
    expect(getInstance(ctx.state, faceDown).face).toBe('DOWN');
  });

  it('rejects a facing the destination zone does not allow', () => {
    const ctx = newTestCtx();
    expect(() => moveCard(ctx, card(0, 0), { player: 0, zone: 'waitingRoom' }, { face: 'DOWN' })).toThrow();
    expect(() => moveCard(ctx, card(0, 0), { player: 0, zone: 'stock' }, { face: 'UP' })).toThrow();
    expect(() => moveCard(ctx, card(0, 0), stageSlot(0, 'FL'), { face: 'DOWN' })).toThrow();
    assertInvariants(ctx.state);
  });

  it('rejects moving a card to the zone it is already in', () => {
    const ctx = newTestCtx();
    expect(() => moveCard(ctx, card(0, 0), { player: 0, zone: 'deck' })).toThrow();
  });

  it('moves several cards simultaneously, keeping the given order', () => {
    const ctx = newTestCtx();
    const ids = [card(1, 10), card(1, 11), card(1, 12)];
    for (const id of ids) moveCard(ctx, id, { player: 1, zone: 'resolution' });
    ctx.events.length = 0;

    // The building block of CR-3.13.1.3.1: damage cards enter the clock together, order unchanged.
    moveCards(ctx, ids, { player: 1, zone: 'clock' });
    expect(ctx.state.zones[1].clock).toEqual(ids);
    expect(ctx.state.zones[1].resolution).toEqual([]);

    const moves = ctx.events.filter((e): e is CardMovedEvent => e.type === 'CARD_MOVED');
    expect(moves).toHaveLength(3);
    expect(new Set(moves.map((e) => e.batch)).size).toBe(1);
  });

  it('refuses to move the same card twice in one simultaneous move', () => {
    const ctx = newTestCtx();
    expect(() => moveCards(ctx, [card(0, 0), card(0, 0)], { player: 0, zone: 'hand' })).toThrow();
  });

  it('a card can be in a zone of the player who does not own it', () => {
    const ctx = newTestCtx();
    const id = put(ctx, card(0, 0), stageSlot(1, 'FC'));
    expect(getInstance(ctx.state, id).owner).toBe(0);
    expect(getInstance(ctx.state, id).location).toEqual(stageSlot(1, 'FC'));
    assertInvariants(ctx.state);
  });
});

describe('markers', () => {
  it('T-ZONE-050 / CR-3.7.2: markers are face down by default and stack on top', () => {
    const ctx = newTestCtx();
    put(ctx, card(0, 0), stageSlot(0, 'FL'));
    const m1 = put(ctx, card(0, 1), markerSlot(0, 'FL'));
    const m2 = put(ctx, card(0, 2), markerSlot(0, 'FL'));
    expect(ctx.state.zones[0].marker.FL).toEqual([m1, m2]);
    expect(getInstance(ctx.state, m1).face).toBe('DOWN');
  });

  it('CR-3.7.2.1: an effect may place a marker face up', () => {
    const ctx = newTestCtx();
    const m = put(ctx, card(0, 1), markerSlot(0, 'FL'), { face: 'UP' });
    expect(getInstance(ctx.state, m).face).toBe('UP');
  });

  it('T-ZONE-052 / CR-3.7.3.1: markers follow their character to another slot; markers already there are discarded', () => {
    const ctx = newTestCtx();
    const character = put(ctx, card(0, 0), stageSlot(0, 'FL'));
    const m1 = put(ctx, card(0, 1), markerSlot(0, 'FL'));
    const m2 = put(ctx, card(0, 2), markerSlot(0, 'FL'), { face: 'UP' });
    // A marker left at the destination, owned by the other player.
    const stray = put(ctx, card(1, 0), markerSlot(0, 'BL'));

    moveCard(ctx, character, stageSlot(0, 'BL'));

    expect(ctx.state.zones[0].stage.BL).toEqual([character]);
    expect(ctx.state.zones[0].marker.FL).toEqual([]);
    expect(ctx.state.zones[0].marker.BL).toEqual([m1, m2]);
    expect(getInstance(ctx.state, m1).face).toBe('DOWN');
    expect(getInstance(ctx.state, m2).face).toBe('UP');
    // The displaced marker goes to its owner's waiting room, not the slot owner's.
    expect(ctx.state.zones[1].waitingRoom).toEqual([stray]);
    expect(ctx.state.zones[0].waitingRoom).toEqual([]);
    assertInvariants(ctx.state, { settled: true });
  });

  it('T-ZONE-053 / CR-3.7.3.2: when a character leaves the stage its markers go to their owners’ waiting rooms', () => {
    const ctx = newTestCtx();
    const character = put(ctx, card(0, 0), stageSlot(0, 'FC'));
    const ownMarker = put(ctx, card(0, 1), markerSlot(0, 'FC'));
    const theirMarker = put(ctx, card(1, 1), markerSlot(0, 'FC'));

    moveCard(ctx, character, { player: 0, zone: 'hand' });

    expect(ctx.state.zones[0].hand).toEqual([character]);
    expect(ctx.state.zones[0].marker.FC).toEqual([]);
    expect(ctx.state.zones[0].waitingRoom).toEqual([ownMarker]);
    expect(ctx.state.zones[1].waitingRoom).toEqual([theirMarker]);
    expect(getInstance(ctx.state, ownMarker).face).toBe('UP');
    assertInvariants(ctx.state, { settled: true });
  });

  it('CR-3.7.3: the character and its markers move in the same simultaneous batch', () => {
    const ctx = newTestCtx();
    const character = put(ctx, card(0, 0), stageSlot(0, 'FC'));
    put(ctx, card(0, 1), markerSlot(0, 'FC'));
    ctx.events.length = 0;

    moveCard(ctx, character, { player: 0, zone: 'waitingRoom' });

    const moves = ctx.events.filter((e): e is CardMovedEvent => e.type === 'CARD_MOVED');
    expect(moves.map((e) => e.reason)).toEqual(['UNSPECIFIED', 'MARKER_DISCARD']);
    expect(new Set(moves.map((e) => e.batch)).size).toBe(1);
  });
});

describe('swapping slots', () => {
  it('T-TURN-007 / CR-6.5.1.2.4: two characters change places, keeping state and identity', () => {
    const ctx = newTestCtx();
    const a = put(ctx, card(0, 0), stageSlot(0, 'FL'));
    const b = put(ctx, card(0, 1), stageSlot(0, 'BR'));
    setOrientation(ctx, a, 'REST');
    const objectA = getInstance(ctx.state, a).objectId;
    const objectB = getInstance(ctx.state, b).objectId;

    expect(swapSlots(ctx, 0, 'FL', 'BR')).toBe(true);

    expect(ctx.state.zones[0].stage.FL).toEqual([b]);
    expect(ctx.state.zones[0].stage.BR).toEqual([a]);
    expect(getInstance(ctx.state, a).orientation).toBe('REST');
    expect(getInstance(ctx.state, b).orientation).toBe('STAND');
    expect(getInstance(ctx.state, a).objectId).toBe(objectA);
    expect(getInstance(ctx.state, b).objectId).toBe(objectB);
    assertInvariants(ctx.state, { settled: true });
  });

  it('CR-6.5.1.2.4: with one empty slot the card moves there', () => {
    const ctx = newTestCtx();
    const a = put(ctx, card(0, 0), stageSlot(0, 'FL'));
    expect(swapSlots(ctx, 0, 'FL', 'FC')).toBe(true);
    expect(ctx.state.zones[0].stage.FL).toEqual([]);
    expect(ctx.state.zones[0].stage.FC).toEqual([a]);
  });

  it('CR-6.5.1.2.4: with two empty slots nothing happens', () => {
    const ctx = newTestCtx();
    expect(swapSlots(ctx, 0, 'FL', 'FC')).toBe(false);
    expect(ctx.events).toEqual([]);
  });

  it('CR-3.7.3.1: each character keeps its own markers through a swap', () => {
    const ctx = newTestCtx();
    const a = put(ctx, card(0, 0), stageSlot(0, 'FL'));
    const b = put(ctx, card(0, 1), stageSlot(0, 'FR'));
    const markerOfA = put(ctx, card(0, 2), markerSlot(0, 'FL'));
    const markerOfB1 = put(ctx, card(0, 3), markerSlot(0, 'FR'));
    const markerOfB2 = put(ctx, card(0, 4), markerSlot(0, 'FR'), { face: 'UP' });

    swapSlots(ctx, 0, 'FL', 'FR');

    expect(ctx.state.zones[0].stage.FR).toEqual([a]);
    expect(ctx.state.zones[0].stage.FL).toEqual([b]);
    expect(ctx.state.zones[0].marker.FR).toEqual([markerOfA]);
    expect(ctx.state.zones[0].marker.FL).toEqual([markerOfB1, markerOfB2]);
    expect(getInstance(ctx.state, markerOfB2).face).toBe('UP');
    expect(ctx.state.zones[0].waitingRoom).toEqual([]);
    assertInvariants(ctx.state, { settled: true });
  });
});

describe('stand / rest / reverse', () => {
  it('T-CARD-010 / CR-4.6.1: a character can be stood, rested and reversed', () => {
    const ctx = newTestCtx();
    const id = put(ctx, card(0, 0), stageSlot(0, 'FC'));
    ctx.events.length = 0;

    expect(setOrientation(ctx, id, 'REST')).toBe(true);
    expect(setOrientation(ctx, id, 'REVERSE')).toBe(true);
    expect(setOrientation(ctx, id, 'STAND')).toBe(true);
    expect(ctx.events.map((e) => e.type)).toEqual([
      'ORIENTATION_CHANGED',
      'ORIENTATION_CHANGED',
      'ORIENTATION_CHANGED',
    ]);
  });

  it('CR-1.3.2.1: putting a card into the state it is already in does nothing', () => {
    const ctx = newTestCtx();
    const id = put(ctx, card(0, 0), stageSlot(0, 'FC'));
    ctx.events.length = 0;
    expect(setOrientation(ctx, id, 'STAND')).toBe(false);
    expect(ctx.events).toEqual([]);
  });

  it('only cards on the stage have a state', () => {
    const ctx = newTestCtx();
    expect(() => setOrientation(ctx, card(0, 0), 'REST')).toThrow();
  });
});

describe('shuffling', () => {
  it('T-ZONE-015 / CR-3.2.4: shuffling keeps the same cards and renews their object ids', () => {
    const ctx = newTestCtx();
    const before = [...ctx.state.zones[0].deck];
    const objectIdsBefore = before.map((id) => getInstance(ctx.state, id).objectId);

    shuffleDeck(ctx, 0);

    const after = ctx.state.zones[0].deck;
    expect([...after].sort((x, y) => x - y)).toEqual([...before].sort((x, y) => x - y));
    expect(after).not.toEqual(before);
    const objectIdsAfter = after.map((id) => getInstance(ctx.state, id).objectId);
    for (const objectId of objectIdsAfter) expect(objectIdsBefore).not.toContain(objectId);
    expect(ctx.events).toEqual([{ type: 'DECK_SHUFFLED', seq: 1, player: 0 }]);
    // The other player's deck is untouched.
    expect(ctx.state.zones[1].deck).toEqual(before.map((id) => id + DECK_SIZE));
    assertInvariants(ctx.state, { settled: true });
  });
});
