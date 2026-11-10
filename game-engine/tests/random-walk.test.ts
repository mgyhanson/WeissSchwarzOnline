/**
 * Thousands of random card movements, checking after every single one that
 * no card was lost or duplicated and that views leak nothing hidden.
 *
 * This exercises the zone layer only; the moves are not legal game actions.
 * Random games played through the real game flow come with STEP 5.
 */

import { describe, expect, it } from 'vitest';
import {
  PILE_ZONES,
  SLOTS,
  type CardInstance,
  type Ctx,
  type Face,
  type Orientation,
  type PlayerId,
  type RngState,
  type ZoneRef,
  checkInvariants,
  createCtx,
  getPlayerView,
  moveCard,
  nextInt,
  redactEvent,
  sameZone,
  seedRng,
  serializeState,
  setOrientation,
  shuffleDeck,
  swapSlots,
} from '../src/index';
import { newTestState } from './helpers';

const ORIENTATIONS: Orientation[] = ['STAND', 'REST', 'REVERSE'];

function randomZone(rng: RngState): ZoneRef {
  const player = nextInt(rng, 2) as PlayerId;
  const pick = nextInt(rng, PILE_ZONES.length + 2);
  if (pick < PILE_ZONES.length) return { player, zone: PILE_ZONES[pick]! };
  const slot = SLOTS[nextInt(rng, SLOTS.length)]!;
  return { player, zone: pick === PILE_ZONES.length ? 'stage' : 'marker', slot };
}

function step(ctx: Ctx, rng: RngState): void {
  const state = ctx.state;
  const action = nextInt(rng, 20);

  if (action === 0) {
    shuffleDeck(ctx, nextInt(rng, 2) as PlayerId);
    return;
  }
  if (action === 1) {
    const player = nextInt(rng, 2) as PlayerId;
    const a = SLOTS[nextInt(rng, SLOTS.length)]!;
    const b = SLOTS[nextInt(rng, SLOTS.length)]!;
    const stage = state.zones[player].stage;
    if (a !== b && stage[a].length <= 1 && stage[b].length <= 1) swapSlots(ctx, player, a, b);
    return;
  }
  if (action === 2) {
    const onStage = state.instances.filter((inst) => inst.location.zone === 'stage');
    if (onStage.length > 0) {
      const inst = onStage[nextInt(rng, onStage.length)]!;
      setOrientation(ctx, inst.instanceId, ORIENTATIONS[nextInt(rng, 3)]!);
    }
    return;
  }

  const inst = state.instances[nextInt(rng, state.instances.length)]!;
  const to = randomZone(rng);
  if (sameZone(inst.location, to)) return;
  const faceChoice = to.zone === 'level' || to.zone === 'memory' || to.zone === 'marker';
  const face: Face | undefined = faceChoice ? (nextInt(rng, 2) === 0 ? 'UP' : 'DOWN') : undefined;
  moveCard(ctx, inst.instanceId, to, {
    position: nextInt(rng, 4) === 0 ? 'BOTTOM' : 'TOP',
    orientation: ORIENTATIONS[nextInt(rng, 3)]!,
    ...(face ? { face } : {}),
  });
}

/**
 * Independent statement of the visibility rules (CR-3), written separately
 * from src/visibility.ts so that a mistake there is not copied here.
 */
function shouldBeHidden(viewer: PlayerId, inst: CardInstance): boolean {
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

function run(seed: string, steps: number): { ctx: Ctx; problems: string[] } {
  const ctx = createCtx(newTestState(seed));
  const rng = seedRng(`walk-${seed}`);
  const problems: string[] = [];

  for (let i = 0; i < steps && problems.length === 0; i++) {
    step(ctx, rng);
    for (const problem of checkInvariants(ctx.state)) problems.push(`step ${i}: ${problem}`);

    if (i % 25 === 0) {
      for (const viewer of [0, 1] as const) {
        const json = JSON.stringify(getPlayerView(ctx.state, viewer));
        if (json.includes('instanceId')) problems.push(`step ${i}: view of P${viewer} exposes instanceId`);
        for (const inst of ctx.state.instances) {
          const shown = json.includes(`"${inst.cardId}"`);
          if (shown === shouldBeHidden(viewer, inst)) {
            problems.push(
              `step ${i}: P${viewer} ${shown ? 'can' : 'cannot'} see ${inst.cardId} in ${inst.location.zone} (face ${inst.face})`,
            );
          }
        }
      }
    }
  }
  return { ctx, problems };
}

describe('random walk over the zone layer', () => {
  it('INV-01 / INV-02 / INV-06: 5000 random movements never lose, duplicate or leak a card', () => {
    for (const seed of ['a', 'b', 'c', 'd']) {
      const { ctx, problems } = run(seed, 5000);
      expect(problems).toEqual([]);
      // Events for moves a player could not observe carry no card identity.
      for (const event of ctx.events) {
        if (event.type !== 'CARD_MOVED') continue;
        for (const viewer of [0, 1] as const) {
          const json = JSON.stringify(redactEvent(event, viewer));
          const observable = event.visibleBefore[viewer] || event.visibleAfter[viewer];
          expect(json.includes(`"${event.cardId}"`)).toBe(observable);
          expect(json).not.toContain('instanceId');
        }
      }
    }
  });

  it('INV-07: the same walk twice ends in exactly the same state', () => {
    const first = run('repeat', 2000);
    const second = run('repeat', 2000);
    expect(first.problems).toEqual([]);
    expect(serializeState(first.ctx.state)).toBe(serializeState(second.ctx.state));
  });
});
