import { describe, expect, it } from 'vitest';
import { assertInvariants, checkInvariants, markerSlot, stageSlot } from '../src/index';
import { card, newTestCtx, newTestState, put } from './helpers';

describe('invariant checker', () => {
  it('accepts a fresh game', () => {
    expect(checkInvariants(newTestState(), { settled: true })).toEqual([]);
  });

  it('INV-02: detects a card that is in two zones', () => {
    const state = newTestState();
    state.zones[0].hand.push(card(0, 0));
    expect(checkInvariants(state).join('\n')).toContain('INV-02');
  });

  it('INV-01 / INV-02: detects a card that vanished', () => {
    const state = newTestState();
    state.zones[0].deck.pop();
    const problems = checkInvariants(state).join('\n');
    expect(problems).toContain('INV-01');
    expect(problems).toContain('is in no zone');
  });

  it('detects a card whose recorded location is wrong', () => {
    const state = newTestState();
    const id = state.zones[0].deck.pop()!;
    state.zones[0].waitingRoom.push(id);
    expect(checkInvariants(state).join('\n')).toContain('records P0.deck as its location');
  });

  it('detects a stage card without a stand/rest/reverse state', () => {
    const ctx = newTestCtx();
    const id = put(ctx, card(0, 0), stageSlot(0, 'FL'));
    ctx.state.instances[id]!.orientation = null;
    expect(checkInvariants(ctx.state).join('\n')).toContain('without an orientation');
  });

  it('detects a face-up card in the deck', () => {
    const state = newTestState();
    state.instances[0]!.face = 'UP';
    expect(checkInvariants(state).join('\n')).toContain('face UP in deck');
  });

  it('INV-03: two cards in one slot are tolerated mid-resolution but not once settled', () => {
    const ctx = newTestCtx();
    put(ctx, card(0, 0), stageSlot(0, 'FL'));
    put(ctx, card(0, 1), stageSlot(0, 'FL'));
    expect(checkInvariants(ctx.state)).toEqual([]);
    expect(checkInvariants(ctx.state, { settled: true }).join('\n')).toContain('INV-03');
  });

  it('INV-04: seven clock cards are tolerated mid-resolution but not once settled', () => {
    const ctx = newTestCtx();
    for (let i = 0; i < 7; i++) put(ctx, card(0, i), { player: 0, zone: 'clock' });
    expect(checkInvariants(ctx.state)).toEqual([]);
    expect(checkInvariants(ctx.state, { settled: true }).join('\n')).toContain('INV-04');
  });

  it('INV-05: the resolution zone must be empty once settled', () => {
    const ctx = newTestCtx();
    put(ctx, card(0, 0), { player: 0, zone: 'resolution' });
    expect(checkInvariants(ctx.state)).toEqual([]);
    expect(checkInvariants(ctx.state, { settled: true }).join('\n')).toContain('INV-05');
  });

  it('CR-9.7.1: markers without a character are not allowed once settled', () => {
    const ctx = newTestCtx();
    put(ctx, card(0, 0), markerSlot(0, 'BR'));
    expect(checkInvariants(ctx.state)).toEqual([]);
    expect(checkInvariants(ctx.state, { settled: true }).join('\n')).toContain('CR-9.7.1');
  });

  it('assertInvariants throws with the list of problems', () => {
    const state = newTestState();
    state.zones[0].deck.pop();
    expect(() => assertInvariants(state)).toThrow(/INV-01/);
  });
});
