import { describe, expect, it } from 'vitest';
import {
  type CardMovedView,
  type Ctx,
  type PlayerId,
  type PlayerView,
  getPlayerView,
  markerSlot,
  moveCard,
  redactEvent,
  stageSlot,
} from '../src/index';
import { DECK_SIZE, card, newTestCtx, put, testCardId } from './helpers';

/** True when the card id appears anywhere in the JSON sent to a player. */
function mentions(payload: unknown, player: PlayerId, index: number): boolean {
  return JSON.stringify(payload).includes(`"${testCardId(player, index)}"`);
}

/**
 * A position with a card in every kind of zone. Player 0's cards:
 *   0 hand, 1 stock, 2 waiting room, 3 clock, 4 level (face up),
 *   5 level (face down), 6 memory (face up), 7 memory (face down),
 *   8 stage, 9 marker (face down), 10 marker (face up), 11 resolution,
 *   45 climax zone, the rest in the deck.
 */
function fullPosition(): Ctx {
  const ctx = newTestCtx();
  put(ctx, card(0, 0), { player: 0, zone: 'hand' });
  put(ctx, card(0, 1), { player: 0, zone: 'stock' });
  put(ctx, card(0, 2), { player: 0, zone: 'waitingRoom' });
  put(ctx, card(0, 3), { player: 0, zone: 'clock' });
  put(ctx, card(0, 4), { player: 0, zone: 'level' });
  put(ctx, card(0, 5), { player: 0, zone: 'level' }, { face: 'DOWN' });
  put(ctx, card(0, 6), { player: 0, zone: 'memory' });
  put(ctx, card(0, 7), { player: 0, zone: 'memory' }, { face: 'DOWN' });
  put(ctx, card(0, 8), stageSlot(0, 'FC'));
  put(ctx, card(0, 9), markerSlot(0, 'FC'));
  put(ctx, card(0, 10), markerSlot(0, 'FC'), { face: 'UP' });
  put(ctx, card(0, 11), { player: 0, zone: 'resolution' });
  put(ctx, card(0, 45), { player: 0, zone: 'climax' });
  return ctx;
}

describe('player view', () => {
  it('T-ZONE-001 / CR-3.1.2: the number of cards in every zone is visible to both players', () => {
    const ctx = fullPosition();
    for (const viewer of [0, 1] as const) {
      const side = getPlayerView(ctx.state, viewer).sides[0];
      expect(side.deck).toHaveLength(DECK_SIZE - 13);
      expect(side.hand).toHaveLength(1);
      expect(side.stock).toHaveLength(1);
      expect(side.waitingRoom).toHaveLength(1);
      expect(side.clock).toHaveLength(1);
      expect(side.level).toHaveLength(2);
      expect(side.memory).toHaveLength(2);
      expect(side.climax).toHaveLength(1);
      expect(side.resolution).toHaveLength(1);
      expect(side.stage.FC).toHaveLength(1);
      expect(side.marker.FC).toHaveLength(2);
    }
  });

  it('T-ZONE-010 / CR-3.2.2: nobody sees the contents of a deck, not even its owner', () => {
    const ctx = fullPosition();
    for (const viewer of [0, 1] as const) {
      const view = getPlayerView(ctx.state, viewer);
      for (const side of view.sides) {
        expect(side.deck.every((c) => c.hidden)).toBe(true);
      }
      expect(mentions(view, 0, 20)).toBe(false);
      expect(mentions(view, 1, 20)).toBe(false);
    }
  });

  it('T-ZONE-080 / CR-3.10.2: nobody sees the contents of the stock, not even its owner', () => {
    const ctx = fullPosition();
    for (const viewer of [0, 1] as const) {
      const view = getPlayerView(ctx.state, viewer);
      expect(view.sides[0].stock).toEqual([{ hidden: true }]);
      expect(mentions(view, 0, 1)).toBe(false);
    }
  });

  it('T-ZONE-020 / CR-3.3.2: a hand is visible only to the player holding it', () => {
    const ctx = fullPosition();
    expect(mentions(getPlayerView(ctx.state, 0), 0, 0)).toBe(true);
    expect(mentions(getPlayerView(ctx.state, 1), 0, 0)).toBe(false);
    expect(getPlayerView(ctx.state, 1).sides[0].hand).toEqual([{ hidden: true }]);
  });

  it('CR-3.4.2 / 3.5.3 / 3.8.2 / 3.11.2 / 3.13.2: waiting room, stage, clock, climax zone and resolution zone are public', () => {
    const ctx = fullPosition();
    for (const viewer of [0, 1] as const) {
      const view = getPlayerView(ctx.state, viewer);
      for (const index of [2, 3, 8, 11, 45]) {
        expect(mentions(view, 0, index)).toBe(true);
      }
    }
  });

  it('T-ZONE-070 / CR-3.9.2: a face-down level card is visible only to the player whose level zone it is', () => {
    const ctx = fullPosition();
    expect(mentions(getPlayerView(ctx.state, 0), 0, 4)).toBe(true);
    expect(mentions(getPlayerView(ctx.state, 1), 0, 4)).toBe(true);
    expect(mentions(getPlayerView(ctx.state, 0), 0, 5)).toBe(true);
    expect(mentions(getPlayerView(ctx.state, 1), 0, 5)).toBe(false);
  });

  it('T-ZONE-100 / CR-3.12.2: a face-down memory card is visible only to the player whose memory it is', () => {
    const ctx = fullPosition();
    expect(mentions(getPlayerView(ctx.state, 0), 0, 6)).toBe(true);
    expect(mentions(getPlayerView(ctx.state, 1), 0, 6)).toBe(true);
    expect(mentions(getPlayerView(ctx.state, 0), 0, 7)).toBe(true);
    expect(mentions(getPlayerView(ctx.state, 1), 0, 7)).toBe(false);
  });

  it('CR-3.7.2 / CR-3.7.2.1: a face-down marker is hidden from everyone, a face-up marker is public', () => {
    const ctx = fullPosition();
    for (const viewer of [0, 1] as const) {
      const view = getPlayerView(ctx.state, viewer);
      expect(mentions(view, 0, 9)).toBe(false);
      expect(mentions(view, 0, 10)).toBe(true);
      expect(view.sides[0].marker.FC[0]).toEqual({ hidden: true });
    }
  });

  it('INV-06: a view never contains the permanent instance id', () => {
    const ctx = fullPosition();
    for (const viewer of [0, 1] as const) {
      expect(JSON.stringify(getPlayerView(ctx.state, viewer))).not.toContain('instanceId');
    }
  });

  it('shows state and identity of visible cards', () => {
    const ctx = fullPosition();
    const view: PlayerView = getPlayerView(ctx.state, 1);
    const onStage = view.sides[0].stage.FC[0];
    expect(onStage).toMatchObject({
      hidden: false,
      cardId: testCardId(0, 8),
      owner: 0,
      orientation: 'STAND',
      face: 'UP',
    });
  });
});

describe('events as seen by a player', () => {
  it('a draw shows the card to the drawing player only', () => {
    const ctx = newTestCtx();
    const id = card(0, 49);
    moveCard(ctx, id, { player: 0, zone: 'hand' });
    const event = ctx.events[0]!;

    const own = redactEvent(event, 0) as CardMovedView;
    expect(own.card).toEqual({ cardId: testCardId(0, 49), owner: 0 });
    expect(own.fromObjectId).toBeUndefined();
    expect(own.toObjectId).toBeDefined();

    const theirs = redactEvent(event, 1) as CardMovedView;
    expect(theirs.card).toBeUndefined();
    expect(theirs.fromObjectId).toBeUndefined();
    expect(theirs.toObjectId).toBeUndefined();
    expect(theirs.from).toEqual({ player: 0, zone: 'deck' });
    expect(theirs.to).toEqual({ player: 0, zone: 'hand' });
    expect(mentions(theirs, 0, 49)).toBe(false);
  });

  it('a card revealed in the resolution zone and then put into stock was seen by both players', () => {
    const ctx = newTestCtx();
    const id = card(0, 49);
    moveCard(ctx, id, { player: 0, zone: 'resolution' });
    moveCard(ctx, id, { player: 0, zone: 'stock' });
    const [reveal, toStock] = ctx.events;

    for (const viewer of [0, 1] as const) {
      const revealed = redactEvent(reveal!, viewer) as CardMovedView;
      expect(revealed.card?.cardId).toBe(testCardId(0, 49));
      expect(revealed.fromObjectId).toBeUndefined();
      expect(revealed.toObjectId).toBeDefined();

      const stocked = redactEvent(toStock!, viewer) as CardMovedView;
      expect(stocked.card?.cardId).toBe(testCardId(0, 49));
      expect(stocked.fromObjectId).toBe(revealed.toObjectId);
      // Once in the stock the card has a new identity that nobody is told.
      expect(stocked.toObjectId).toBeUndefined();
    }
  });

  it('a move between two hidden zones shows no card to the opponent', () => {
    const ctx = newTestCtx();
    const id = put(ctx, card(0, 49), { player: 0, zone: 'hand' });
    moveCard(ctx, id, { player: 0, zone: 'deck' });
    const event = ctx.events[1]!;
    expect(mentions(redactEvent(event, 1), 0, 49)).toBe(false);
    expect(mentions(redactEvent(event, 0), 0, 49)).toBe(true);
  });

  it('INV-06: no event sent to a player contains the permanent instance id', () => {
    const ctx = fullPosition();
    for (const event of ctx.events) {
      for (const viewer of [0, 1] as const) {
        expect(JSON.stringify(redactEvent(event, viewer))).not.toContain('instanceId');
      }
    }
  });
});
