/**
 * Reading the game for abilities: which cards match a filter, whether a
 * condition holds, which cards an effect targets, and what continuous
 * abilities currently add to a card's numbers.
 */

import { getDef, getInstance } from '../state';
import type { CardDef, CardInstance, GameState, PlayerId } from '../types';
import { SLOTS, opponentOf } from '../types';
import { isBackSlot, slotsInFrontOf } from '../zones';
import type { CardFilter, ChooseFrom, Condition, ContinuousAbility, EffectContext, Target } from './types';

type Stat = 'POWER' | 'SOUL' | 'LEVEL';

/** A card whose printed abilities are currently in force, and for whom. */
export interface ActiveSource {
  instanceId: number;
  /** CR-4.3.5 / 4.3.6: the master of the card. */
  master: PlayerId;
  def: CardDef;
}

/**
 * CR-2.12.2: character text works while the character is on the stage,
 * climax text while the climax is in the climax zone.
 */
export function activeSources(state: GameState): ActiveSource[] {
  const sources: ActiveSource[] = [];
  for (const master of [0, 1] as const) {
    const zones = state.zones[master];
    for (const slot of SLOTS) {
      for (const instanceId of zones.stage[slot]) {
        const def = getDef(state, instanceId);
        if (def.kind === 'CHARACTER') sources.push({ instanceId, master, def });
      }
    }
    for (const instanceId of zones.climax) {
      const def = getDef(state, instanceId);
      if (def.kind === 'CLIMAX') sources.push({ instanceId, master, def });
    }
  }
  return sources;
}

/** Characters on a player's stage, in slot order. */
export function stageCharacters(state: GameState, player: PlayerId): number[] {
  const zones = state.zones[player];
  return SLOTS.flatMap((slot) => zones.stage[slot]).filter((id) => getDef(state, id).kind === 'CHARACTER');
}

function printedLevel(state: GameState, instanceId: number): number {
  return getDef(state, instanceId).level ?? 0;
}

/**
 * Whether a card matches a filter. `levelOf` supplies the level to compare
 * against; it defaults to the current level including effects.
 */
export function matchesFilter(
  state: GameState,
  instanceId: number,
  filter: CardFilter | undefined,
  levelOf: (state: GameState, instanceId: number) => number = currentLevel,
): boolean {
  if (!filter) return true;
  const def = getDef(state, instanceId);
  if (filter.kind && def.kind !== filter.kind) return false;
  if (filter.traits && !filter.traits.some((trait) => def.traits.includes(trait))) return false;
  if (filter.name !== undefined && def.name !== filter.name) return false;
  if (filter.nameIncludes !== undefined && !def.name.includes(filter.nameIncludes)) return false;
  if (filter.color !== undefined && def.color !== filter.color) return false;
  if (filter.hasTrigger && !def.triggers.includes(filter.hasTrigger)) return false;
  if (filter.costMax !== undefined && (def.cost ?? 0) > filter.costMax) return false;
  if (filter.levelMax !== undefined || filter.levelMin !== undefined) {
    const level = levelOf(state, instanceId);
    if (filter.levelMax !== undefined && level > filter.levelMax) return false;
    if (filter.levelMin !== undefined && level < filter.levelMin) return false;
  }
  return true;
}

export function evalCondition(state: GameState, master: PlayerId, source: number, condition: Condition | undefined): boolean {
  if (!condition) return true;
  const zones = state.zones[master];
  switch (condition.if) {
    case 'YOUR_TURN':
      return state.turn?.player === master;
    case 'OPPONENT_TURN':
      return state.turn !== null && state.turn.player !== master;
    case 'CLIMAX_IN_PLAY':
      return zones.climax.some((id) => getDef(state, id).kind === 'CLIMAX' && getDef(state, id).name === condition.name);
    case 'CHARACTERS': {
      const count = stageCharacters(state, master).filter(
        (id) => !(condition.other && id === source) && matchesFilter(state, id, condition.filter),
      ).length;
      return count >= condition.min;
    }
    case 'LEVEL':
      return zones.level.length >= condition.min;
    case 'EXPERIENCE': {
      // CR-10.10: refers to the cards in the level zone. A face-down card has no level (CR-3.9.2.2.1).
      let total = 0;
      for (const id of zones.level) {
        if (getInstance(state, id).face === 'UP') total += printedLevel(state, id);
      }
      return total >= condition.min;
    }
    case 'MEMORY': {
      // CR-10.9; a face-down memory card is a blank card (CR-3.12.2.2.1).
      const count = zones.memory.filter(
        (id) => getInstance(state, id).face === 'UP' && matchesFilter(state, id, condition.filter, printedLevel),
      ).length;
      return count >= condition.min;
    }
    case 'ALL':
      return condition.of.every((part) => evalCondition(state, master, source, part));
    case 'NOT':
      return !evalCondition(state, master, source, condition.of);
  }
}

/** The cards a continuous ability on `source` applies to. */
function continuousTargets(
  state: GameState,
  source: ActiveSource,
  target: ContinuousAbility['apply'][number]['target'],
  levelOf: (state: GameState, instanceId: number) => number,
): number[] {
  switch (target.who) {
    case 'SELF':
      return [source.instanceId];
    case 'ALL_YOURS':
      return stageCharacters(state, source.master).filter(
        (id) => !(target.other && id === source.instanceId) && matchesFilter(state, id, target.filter, levelOf),
      );
    case 'IN_FRONT': {
      const location = getInstance(state, source.instanceId).location;
      if (location.zone !== 'stage') return [];
      const zones = state.zones[source.master];
      return slotsInFrontOf(location.slot)
        .flatMap((slot) => zones.stage[slot])
        .filter((id) => getDef(state, id).kind === 'CHARACTER' && matchesFilter(state, id, target.filter, levelOf));
    }
  }
}

/**
 * What the continuous abilities in force add to one number of a card on the
 * stage (CR-8.9.1).
 *
 * Order of application: a change that is not to power or soul comes before
 * the changes to power and soul (CR-8.9.1.2, 8.9.1.3). Levels are therefore
 * worked out first, from printed levels, and the filters of power and soul
 * effects then see those levels. Everything implemented so far is an
 * addition, so the order within a step cannot change the result.
 */
export function continuousTotal(state: GameState, instanceId: number, stat: Stat): number {
  if (getInstance(state, instanceId).location.zone !== 'stage') return 0;
  const levelOf = stat === 'LEVEL' ? printedLevel : currentLevel;
  let total = 0;
  for (const source of activeSources(state)) {
    for (const ability of source.def.abilities ?? []) {
      if (ability.type !== 'CONT') continue;
      if (!ability.apply.some((part) => part.stat === stat)) continue;
      if (ability.assist) {
        // CR-10.3.2: only while this card is in a back-row slot.
        const location = getInstance(state, source.instanceId).location;
        if (location.zone !== 'stage' || !isBackSlot(location.slot)) continue;
      }
      if (!evalCondition(state, source.master, source.instanceId, ability.condition)) continue;
      for (const part of ability.apply) {
        if (part.stat === stat && continuousTargets(state, source, part.target, levelOf).includes(instanceId)) {
          total += part.amount;
        }
      }
    }
  }
  return total;
}

function turnModifierTotal(state: GameState, instanceId: number, stat: Stat): number {
  const objectId = getInstance(state, instanceId).objectId;
  let total = 0;
  for (const modifier of state.modifiers) {
    if (modifier.objectId === objectId && modifier.stat === stat) total += modifier.delta;
  }
  return total;
}

/** A card's current value of a number: printed value, continuous abilities, then effects lasting this turn. */
export function currentStat(state: GameState, instanceId: number, stat: Stat): number {
  const def = getDef(state, instanceId);
  const printed = stat === 'POWER' ? def.power : stat === 'SOUL' ? def.soul : def.level;
  // CR-2.19.1: a number the card does not have counts as 0.
  return (printed ?? 0) + continuousTotal(state, instanceId, stat) + turnModifierTotal(state, instanceId, stat);
}

function currentLevel(state: GameState, instanceId: number): number {
  return currentStat(state, instanceId, 'LEVEL');
}

/** The card the ability is on, if it is still the object it was when the ability was played (CR-8.7.7). */
export function sourceIfUnchanged(state: GameState, context: EffectContext): CardInstance | null {
  const inst = getInstance(state, context.source);
  return inst.objectId === context.sourceObjectId ? inst : null;
}

function byObjectId(state: GameState, objectId: number): CardInstance | undefined {
  return state.instances.find((inst) => inst.objectId === objectId);
}

/** Instance ids of the cards a one-shot effect applies to. */
export function resolveTarget(state: GameState, context: EffectContext, target: Target): number[] {
  switch (target.who) {
    case 'SELF': {
      const self = sourceIfUnchanged(state, context);
      return self ? [self.instanceId] : [];
    }
    case 'ALL_YOURS':
      return stageCharacters(state, context.master).filter(
        (id) => !(target.other && id === context.source) && matchesFilter(state, id, target.filter),
      );
    case 'IN_FRONT': {
      const self = sourceIfUnchanged(state, context);
      if (!self || self.location.zone !== 'stage') return [];
      const zones = state.zones[self.location.player];
      return slotsInFrontOf(self.location.slot)
        .flatMap((slot) => zones.stage[slot])
        .filter((id) => getDef(state, id).kind === 'CHARACTER' && matchesFilter(state, id, target.filter));
    }
    case 'CHOSEN':
      return context.chosen.flatMap((objectId) => {
        const inst = byObjectId(state, objectId);
        return inst ? [inst.instanceId] : [];
      });
    case 'BATTLE_OPPONENT': {
      if (context.battleOpponent === null) return [];
      const inst = byObjectId(state, context.battleOpponent);
      return inst && inst.location.zone === 'stage' ? [inst.instanceId] : [];
    }
  }
}

/** Instance ids a CHOOSE effect may pick from. */
export function chooseCandidates(
  state: GameState,
  context: EffectContext,
  from: ChooseFrom,
  filter: CardFilter | undefined,
  other: boolean | undefined,
): number[] {
  const { master } = context;
  const zones = state.zones[master];
  let pool: number[];
  switch (from) {
    case 'YOUR_STAGE':
      pool = stageCharacters(state, master);
      break;
    case 'OPPONENT_STAGE':
      pool = stageCharacters(state, opponentOf(master));
      break;
    case 'YOUR_WAITING_ROOM':
      pool = [...zones.waitingRoom];
      break;
    case 'YOUR_HAND':
      pool = [...zones.hand];
      break;
    case 'YOUR_CLOCK':
      pool = [...zones.clock];
      break;
    case 'YOUR_DECK':
      pool = [...zones.deck];
      break;
    case 'FRONT_ATTACKED': {
      // CR-10.5.2: "a character of yours that is being front attacked".
      const attack = state.attack;
      if (!attack || attack.type !== 'FRONT' || attack.defenderObjectId === null || attack.player === master) return [];
      const defender = byObjectId(state, attack.defenderObjectId);
      const stillDefending =
        defender && defender.location.zone === 'stage' && defender.location.player === master && defender.location.slot === attack.defenderSlot;
      pool = stillDefending ? [defender.instanceId] : [];
      break;
    }
  }
  return pool.filter((id) => !(other && id === context.source) && matchesFilter(state, id, filter));
}
