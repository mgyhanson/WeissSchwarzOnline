/**
 * Consistency checks that must hold for every reachable state.
 *
 * These are not official rules; they are derived from the rules and exist to
 * catch engine bugs (cards vanishing, duplicated, counted twice...). Tests
 * run them after every step. See rules/rule-registry.md, section 13.
 */

import type { GameState, PlayerZones, ZoneRef } from './types';
import { PILE_ZONES, PLAYERS, SLOTS } from './types';
import { defaultFace, allowsFaceChoice, describeZone, sameZone } from './zones';

export interface InvariantOptions {
  /**
   * Also check conditions that only hold once a check timing has finished
   * and no effect is resolving (INV-03, INV-04, INV-05 and CR-9.6 / CR-9.7).
   */
  settled?: boolean;
}

function eachPile(zones: PlayerZones, player: 0 | 1, visit: (ref: ZoneRef, ids: number[]) => void): void {
  for (const zone of PILE_ZONES) visit({ player, zone }, zones[zone]);
  for (const slot of SLOTS) {
    visit({ player, zone: 'stage', slot }, zones.stage[slot]);
    visit({ player, zone: 'marker', slot }, zones.marker[slot]);
  }
}

/** Returns a list of violations; an empty list means the state is consistent. */
export function checkInvariants(state: GameState, options: InvariantOptions = {}): string[] {
  const problems: string[] = [];
  const seenAt = new Map<number, ZoneRef>();
  const ownedCount: [number, number] = [0, 0];

  for (const player of PLAYERS) {
    eachPile(state.zones[player], player, (ref, ids) => {
      for (const id of ids) {
        const inst = state.instances[id];
        if (!inst) {
          problems.push(`${describeZone(ref)} contains unknown card ${id}`);
          continue;
        }
        // INV-02: a physical card is in exactly one place.
        const previous = seenAt.get(id);
        if (previous) {
          problems.push(`INV-02: card ${id} is in both ${describeZone(previous)} and ${describeZone(ref)}`);
          continue;
        }
        seenAt.set(id, ref);
        ownedCount[inst.owner]++;
        if (!sameZone(inst.location, ref)) {
          problems.push(
            `card ${id} is stored in ${describeZone(ref)} but records ${describeZone(inst.location)} as its location`,
          );
        }
      }
    });
  }

  const objectIds = new Set<number>();
  for (const inst of state.instances) {
    if (!seenAt.has(inst.instanceId)) {
      problems.push(`INV-02: card ${inst.instanceId} (${inst.cardId}) is in no zone`);
    }
    if (objectIds.has(inst.objectId)) {
      problems.push(`object id ${inst.objectId} is used by more than one card`);
    }
    objectIds.add(inst.objectId);
    if (!state.defs[inst.cardId]) {
      problems.push(`card ${inst.instanceId} has no definition for "${inst.cardId}"`);
    }

    const zone = inst.location.zone;
    // CR-4.6.1: exactly the cards in stage slots have a stand/rest/reverse state.
    if (zone === 'stage' && inst.orientation === null) {
      problems.push(`card ${inst.instanceId} is on the stage without an orientation`);
    }
    if (zone !== 'stage' && inst.orientation !== null) {
      problems.push(`card ${inst.instanceId} is in ${zone} but has orientation ${inst.orientation}`);
    }
    if (inst.face !== defaultFace(zone) && !allowsFaceChoice(zone)) {
      problems.push(`card ${inst.instanceId} is face ${inst.face} in ${zone}`);
    }
  }

  // INV-01: each player's cards are conserved across all zones of both players.
  for (const player of PLAYERS) {
    if (ownedCount[player] !== state.initialCounts[player]) {
      problems.push(
        `INV-01: player ${player} owns ${ownedCount[player]} cards in play, expected ${state.initialCounts[player]}`,
      );
    }
  }

  if (options.settled) {
    for (const player of PLAYERS) {
      const zones = state.zones[player];
      for (const slot of SLOTS) {
        if (zones.stage[slot].length > 1) {
          problems.push(`INV-03: P${player} slot ${slot} holds ${zones.stage[slot].length} cards`);
        }
        if (zones.stage[slot].length === 0 && zones.marker[slot].length > 0) {
          problems.push(`CR-9.7.1: P${player} slot ${slot} has markers but no character`);
        }
      }
      if (zones.climax.length > 1) {
        problems.push(`CR-9.6.2: P${player} climax zone holds ${zones.climax.length} cards`);
      }
      if (zones.clock.length >= 7) {
        problems.push(`INV-04: P${player} clock holds ${zones.clock.length} cards`);
      }
      if (zones.resolution.length > 0) {
        problems.push(`INV-05: P${player} resolution zone is not empty`);
      }
    }
  }

  return problems;
}

/** Throws when the state is inconsistent. */
export function assertInvariants(state: GameState, options: InvariantOptions = {}): void {
  const problems = checkInvariants(state, options);
  if (problems.length > 0) {
    throw new Error(`Game state invariants violated:\n- ${problems.join('\n- ')}`);
  }
}
