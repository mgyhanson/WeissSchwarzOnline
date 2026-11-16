/**
 * Reading the game for abilities: which cards match a filter, whether a
 * condition holds, which cards an effect targets, and what continuous
 * abilities currently add to a card's numbers.
 */

import { getDef, getInstance } from '../state';
import type { ActivatedAbility, XCount } from './types';
import type { CardDef, CardInstance, GameState, PlayerId, TriggerIcon } from '../types';
import { SLOTS, opponentOf, HAND_LIMIT } from '../types';
import { BACK_SLOTS, FRONT_SLOTS, facingSlot, isBackSlot, slotsInFrontOf } from '../zones';
import type { AutoAbility, CardFilter, ChooseFrom, Condition, ContinuousAbility, CountWhere, EffectContext, PerCharacter, Target } from './types';

type Stat = 'POWER' | 'SOUL' | 'LEVEL';

/** A card whose printed abilities are currently in force, and for whom. */
export interface ActiveSource {
  instanceId: number;
  /** CR-4.3.5 / 4.3.6: the master of the card. */
  master: PlayerId;
  def: CardDef;
  /** True for the top card of a clock: only its アラーム abilities are in force (CR-10.1). */
  clockTop: boolean;
  /** True for a face-up marker: only its abilities that work in the marker zone are in force. */
  marker?: boolean;
  /** True for a face-up memory card: only its abilities that work in memory are in force. */
  memory?: boolean;
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
        if (def.kind === 'CHARACTER') sources.push({ instanceId, master, def, clockTop: false });
      }
    }
    for (const instanceId of zones.climax) {
      const def = getDef(state, instanceId);
      if (def.kind === 'CLIMAX') sources.push({ instanceId, master, def, clockTop: false });
    }
    // CR-2.12.2.3: abilities of face-up markers that work in the marker zone (a face-down marker has no abilities, CR-3.7.2.3).
    for (const slot of SLOTS) {
      for (const instanceId of zones.marker[slot]) {
        if (getInstance(state, instanceId).face !== 'UP') continue;
        const def = getDef(state, instanceId);
        if ((def.abilities ?? []).some((ability) => ability.type !== 'ACT' && ability.zone === 'MARKER')) sources.push({ instanceId, master, def, clockTop: false, marker: true });
      }
    }
    // CR-2.12.2.3: abilities of face-up memory cards that work in memory (a face-down one has no information, CR-3.12.2.2.1).
    for (const instanceId of zones.memory) {
      if (getInstance(state, instanceId).face !== 'UP') continue;
      const def = getDef(state, instanceId);
      if ((def.abilities ?? []).some((ability) => ability.type !== 'ACT' && ability.zone === 'MEMORY')) sources.push({ instanceId, master, def, clockTop: false, memory: true });
    }
    // CR-10.1 / CR-2.12.2.3: アラーム abilities of the card on top of the clock.
    const top = zones.clock[zones.clock.length - 1];
    if (top !== undefined) {
      const def = getDef(state, top);
      if ((def.abilities ?? []).some((ability) => ability.type !== 'ACT' && ability.alarm)) {
        sources.push({ instanceId: top, master, def, clockTop: true });
      }
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
  if (filter.traits) {
    const traits = traitsOf(state, instanceId);
    if (!filter.traits.some((trait) => traits.includes(trait))) return false;
  }
  if (filter.nameExcludes !== undefined && def.name.includes(filter.nameExcludes)) return false;
  if (filter.triggersExactly && [...def.triggers].sort().join() !== [...filter.triggersExactly].sort().join()) return false;
  if (filter.anyOf && !filter.anyOf.some((part) => matchesFilter(state, instanceId, part, levelOf))) return false;
  if (filter.hasLink !== undefined && !(def.abilities ?? []).some((ability) => ability.type === 'CONT' && ability.link === filter.hasLink)) return false;
  if (filter.hasRecollection && !(def.abilities ?? []).some((ability) => ability.type === 'CONT' && ability.recollection)) return false;
  if (filter.name !== undefined && def.name !== filter.name) return false;
  if (filter.nameIncludes !== undefined && !def.name.includes(filter.nameIncludes)) return false;
  if (filter.nameIncludesAny !== undefined && !filter.nameIncludesAny.some((part) => def.name.includes(part))) return false;
  if (filter.names !== undefined && !filter.names.includes(def.name)) return false;
  if (filter.levelAtMostOwnLevel) {
    const location = getInstance(state, instanceId).location;
    if (levelOf(state, instanceId) > state.zones[location.player].level.length) return false;
  }
  if (filter.levelAboveMasterLevel) {
    // The player whose card it is: where it is now (CR-4.3.2), i.e. the side of the stage it is on.
    const location = getInstance(state, instanceId).location;
    if (levelOf(state, instanceId) <= state.zones[location.player].level.length) return false;
  }
  if (filter.color !== undefined && def.color !== filter.color) return false;
  if (filter.hasTrigger && !triggerIconsOf(state, instanceId).includes(filter.hasTrigger)) return false;
  if (filter.costMax !== undefined && (def.cost ?? 0) > filter.costMax) return false;
  if (filter.costMin !== undefined && (def.cost ?? 0) < filter.costMin) return false;
  if (filter.powerMax !== undefined && currentStat(state, instanceId, 'POWER') > filter.powerMax) return false;
  if (filter.nameInWaitingRoom) {
    const owner = getInstance(state, instanceId).owner;
    if (!state.zones[owner].waitingRoom.some((id) => getDef(state, id).name === def.name && getDef(state, id).kind === def.kind)) return false;
  }
  if (filter.levelMax !== undefined || filter.levelMin !== undefined) {
    const level = levelOf(state, instanceId);
    if (filter.levelMax !== undefined && level > filter.levelMax) return false;
    if (filter.levelMin !== undefined && level < filter.levelMin) return false;
  }
  return true;
}

/**
 * `battleOpponent`: object id of the battle opponent the ability remembers
 * (EffectContext.battleOpponent), for the BATTLE_OPPONENT condition.
 */
export function evalCondition(
  state: GameState,
  master: PlayerId,
  source: number,
  condition: Condition | undefined,
  battleOpponent: number | null = null,
  about: number | null = null,
): boolean {
  if (!condition) return true;
  const zones = state.zones[master];
  switch (condition.if) {
    case 'YOUR_TURN':
      return state.turn?.player === master;
    case 'FIRST_PLAYER_TURN':
      return !!state.turn && state.turn.player === state.firstPlayer && state.turn.number === condition.turn * 2 - 1;
    case 'OPPONENT_TURN':
      return state.turn !== null && state.turn.player !== master;
    case 'CLIMAX_IN_PLAY':
      return (condition.opponent ? state.zones[opponentOf(master)] : zones).climax.some((id) => getDef(state, id).kind === 'CLIMAX' && (condition.name === undefined || getDef(state, id).name === condition.name));
    case 'CHARACTERS': {
      const count = stageCharacters(state, master).filter(
        (id) => !(condition.other && id === source) && matchesFilter(state, id, condition.filter),
      ).length;
      return count >= condition.min;
    }
    case 'LEVEL': {
      const level = (condition.whose === 'OPPONENT' ? state.zones[opponentOf(master)] : zones).level.length;
      return level >= condition.min && level <= (condition.max ?? Infinity);
    }
    case 'EXPERIENCE': {
      // CR-10.10: refers to the cards in the level zone. A face-down card has no level (CR-3.9.2.2.1).
      let total = 0;
      for (const id of zones.level) {
        if (getInstance(state, id).face === 'UP') total += printedLevel(state, id);
      }
      return total >= condition.min;
    }
    case 'COUNT': {
      const count = zoneCount(state, master, source, condition.where, condition.filter, condition.other);
      return count >= (condition.min ?? 0) && count <= (condition.max ?? Infinity);
    }
    case 'ANY':
      return condition.of.some((part) => evalCondition(state, master, source, part, battleOpponent, about));
    case 'MARKERS': {
      const holder = condition.of === 'SELF' ? source : about === null ? null : (byObjectId(state, about)?.instanceId ?? null);
      if (holder === null) return false;
      const markers = markersOf(state, holder);
      const count = condition.distinctNames
        ? new Set(markers.filter((id) => getInstance(state, id).face === 'UP').map((id) => getDef(state, id).name)).size
        : markers.length;
      return count >= (condition.min ?? 0) && count <= (condition.max ?? Infinity);
    }
    case 'LAST_MOVED':
    case 'DID':
      // Only meaningful while resolving (effects.ts evaluates it with the resolution's moved cards).
      return false;
    case 'BATTLE_OPPONENT': {
      if (battleOpponent === null) return false;
      // A card that leaves the stage is a new card (CR-3.1.4), so an object found here is still that character on the stage.
      const opponent = state.instances.find((inst) => inst.objectId === battleOpponent);
      return !!opponent && matchesFilter(state, opponent.instanceId, condition.filter);
    }
    case 'FACING': {
      const location = getInstance(state, source).location;
      if (location.zone !== 'stage') return false;
      const facing = facingSlot(location.slot);
      if (!facing) return false;
      const other = state.zones[opponentOf(location.player)].stage[facing].find((id) => getDef(state, id).kind === 'CHARACTER');
      return other !== undefined && matchesFilter(state, other, condition.filter);
    }
    case 'MEMORY': {
      // CR-10.9; a face-down memory card is a blank card (CR-3.12.2.2.1).
      const count = zones.memory.filter(
        (id) => getInstance(state, id).face === 'UP' && matchesFilter(state, id, condition.filter, printedLevel),
      ).length;
      return count >= condition.min;
    }
    case 'SELF_IN_SLOT': {
      const location = getInstance(state, source).location;
      return location.zone === 'stage' && location.player === master && condition.slots.includes(location.slot);
    }
    case 'SELF_RESTED': {
      const inst = getInstance(state, source);
      return inst.location.zone === 'stage' && inst.orientation === 'REST';
    }
    case 'ALL_CHARACTERS':
      return stageCharacters(state, master).every((id) => matchesFilter(state, id, condition.filter));
    case 'STOCK':
      return zones.stock.length <= condition.max;
    case 'ALL':
      return condition.of.every((part) => evalCondition(state, master, source, part, battleOpponent, about));
    case 'NOT':
      return !evalCondition(state, master, source, condition.of, battleOpponent, about);
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
    case 'ALL_THEIRS':
      return stageCharacters(state, opponentOf(source.master));
    case 'FACING': {
      // このカードの正面のキャラ (CR-3.6.4)
      const location = getInstance(state, source.instanceId).location;
      const facing = location.zone === 'stage' ? facingSlot(location.slot) : null;
      return facing ? state.zones[opponentOf(location.player)].stage[facing].filter((id) => getDef(state, id).kind === 'CHARACTER') : [];
    }
    case 'IN_FRONT': {
      const location = getInstance(state, source.instanceId).location;
      if (location.zone !== 'stage') return [];
      const zones = state.zones[source.master];
      return slotsInFrontOf(location.slot)
        .flatMap((slot) => zones.stage[slot])
        .filter((id) => getDef(state, id).kind === 'CHARACTER' && matchesFilter(state, id, target.filter, levelOf));
    }
    case 'YOUR_SLOT':
      return target.slots
        .flatMap((slot) => state.zones[source.master].stage[slot])
        .filter((id) => getDef(state, id).kind === 'CHARACTER' && !(target.other && id === source.instanceId));
    case 'MARKER_HOLDER':
      return markerHolder(state, source.instanceId).filter((id) => matchesFilter(state, id, target.filter, levelOf));
  }
}

/** How many cards of a kind are in a zone, for COUNT conditions and +N per card (…1枚につき). */
export function zoneCount(state: GameState, master: PlayerId, source: number, where: CountWhere, filter: CardFilter | undefined, other?: boolean): number {
      const opponent = state.zones[opponentOf(master)];
      const characters = (ids: number[]) => ids.filter((id) => getDef(state, id).kind === 'CHARACTER');
      const pool =
        where === 'YOUR_WAITING_ROOM'
          ? state.zones[master].waitingRoom
          : where === 'YOUR_HAND'
            ? state.zones[master].hand
            : where === 'YOUR_MEMORY'
              ? state.zones[master].memory.filter((id) => !filter || getInstance(state, id).face === 'UP')
              : where === 'YOUR_LEVEL'
                ? // CR-3.9.2.2.1: a face-down level card has no information, so it matches no filter.
                  state.zones[master].level.filter((id) => !filter || getInstance(state, id).face === 'UP')
              : where === 'YOUR_MEMORY_AND_MARKERS'
                ? [...state.zones[master].memory, ...SLOTS.flatMap((slot) => state.zones[master].marker[slot])]
              : where === 'YOUR_CLIMAX'
                ? state.zones[master].climax
                : where === 'YOUR_FRONT_ROW'
                  ? characters(FRONT_SLOTS.flatMap((slot) => state.zones[master].stage[slot]))
                  : where === 'OPPONENT_FRONT_ROW'
                    ? characters(FRONT_SLOTS.flatMap((slot) => opponent.stage[slot]))
                    : characters(SLOTS.flatMap((slot) => opponent.stage[slot]));
      const count = pool.filter((id) => !(other && id === source) && matchesFilter(state, id, filter)).length;
  return count;
}

/** The attacking and the defending character of the current attack, if any (as attack-state.ts reads them). */
function attackerOf(state: GameState): CardInstance | undefined {
  return state.attack ? state.instances.find((inst) => inst.objectId === state.attack!.attackerObjectId) : undefined;
}
function defenderOf(state: GameState): CardInstance | undefined {
  return state.attack && state.attack.defenderObjectId !== null ? state.instances.find((inst) => inst.objectId === state.attack!.defenderObjectId) : undefined;
}

/** The character in the slot whose marker zone this card is in (このマーカーを持つ舞台のキャラ). */
export function markerHolder(state: GameState, instanceId: number): number[] {
  const location = getInstance(state, instanceId).location;
  if (location.zone !== 'marker') return [];
  return state.zones[location.player].stage[location.slot].filter((id) => getDef(state, id).kind === 'CHARACTER');
}

/** The cards in the marker zone of the slot a card on the stage is in (CR-3.7.4), bottom first. */
export function markersOf(state: GameState, instanceId: number): number[] {
  const location = getInstance(state, instanceId).location;
  return location.zone === 'stage' ? [...state.zones[location.player].marker[location.slot]] : [];
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
/** The continuous abilities currently in force, with the card they are on. */
function continuousInForce(state: GameState): { source: ActiveSource; ability: ContinuousAbility }[] {
  const found: { source: ActiveSource; ability: ContinuousAbility }[] = [];
  for (const source of activeSources(state)) {
    for (const ability of source.def.abilities ?? []) {
      if (ability.type !== 'CONT' || ability.inHand) continue;
      // A marker ability works from the marker zone and only from there.
      if ((ability.zone === 'MARKER') !== Boolean(source.marker) || (ability.zone === 'MEMORY') !== Boolean(source.memory)) continue;
      // An アラーム ability works from the top of the clock and only from there.
      if (Boolean(ability.alarm) !== source.clockTop) continue;
      if (ability.assist) {
        // CR-10.3.2: only while this card is in a back-row slot.
        const location = getInstance(state, source.instanceId).location;
        if (location.zone !== 'stage' || !isBackSlot(location.slot)) continue;
      }
      if (!evalCondition(state, source.master, source.instanceId, ability.condition)) continue;
      found.push({ source, ability });
    }
  }
  // …このカードは次の能力を得る。『【永】 …』: the abilities a card has while an ability of its own in force says so.
  for (const { source, ability } of [...found]) {
    for (const inner of ability.gains ?? []) {
      if (inner.type !== 'CONT' || !evalCondition(state, source.master, source.instanceId, inner.condition)) continue;
      found.push({ source, ability: inner });
    }
  }
  // …すべてに、『【永】 …』を与える: the given continuous abilities work from each character given them.
  for (const { source, ability } of [...found]) {
    for (const part of ability.grantConts ?? []) {
      for (const target of continuousTargets(state, source, part.target, currentLevel)) {
        const inst = getInstance(state, target);
        if (inst.location.zone !== 'stage') continue;
        const given = { instanceId: target, master: inst.location.player, def: getDef(state, target), clockTop: false };
        if (part.ability.assist && !BACK_SLOTS.includes(inst.location.slot)) continue;
        if (!evalCondition(state, given.master, target, part.ability.condition)) continue;
        found.push({ source: given, ability: part.ability });
      }
    }
  }
  // Continuous abilities given by effects for a while (そのターン中／次の相手のターンの終わりまで、次の能力を与える), on the stage only.
  for (const grant of state.grants) {
    if (grant.ability.type !== 'CONT') continue;
    const inst = state.instances.find((candidate) => candidate.objectId === grant.objectId);
    if (!inst || inst.location.zone !== 'stage') continue;
    const def = getDef(state, inst.instanceId);
    if (!evalCondition(state, inst.location.player, inst.instanceId, grant.ability.condition)) continue;
    found.push({ source: { instanceId: inst.instanceId, master: inst.location.player, def, clockTop: false }, ability: grant.ability });
  }
  return found;
}

export function continuousTotal(state: GameState, instanceId: number, stat: Stat): number {
  const location = getInstance(state, instanceId).location;
  if (location.zone === 'hand') {
    // あなたの手札のこのカードの…: the card's own abilities that work in the hand.
    let inHand = 0;
    for (const ability of getDef(state, instanceId).abilities ?? []) {
      if (ability.type !== 'CONT' || !ability.inHand || !evalCondition(state, location.player, instanceId, ability.condition)) continue;
      for (const part of ability.apply) if (part.stat === stat && part.target.who === 'SELF') inHand += part.amount;
    }
    // あなたの手札の「…」のレベルを－N: continuous abilities of the owner's cards in force for matching cards in the hand.
    if (stat === 'LEVEL') {
      for (const { source, ability } of continuousInForce(state)) {
        if (!ability.handCards || source.master !== location.player || !matchesFilter(state, instanceId, ability.handCards.filter)) continue;
        inHand += ability.handCards.level;
      }
    }
    return inHand;
  }
  if (location.zone !== 'stage') return 0;
  const levelOf = stat === 'LEVEL' ? printedLevel : currentLevel;
  let total = 0;
  for (const { source, ability } of continuousInForce(state)) {
    for (const part of ability.apply) {
      if (part.stat !== stat || !continuousTargets(state, source, part.target, levelOf).includes(instanceId)) continue;
      if (part.onlyIf && !evalCondition(state, source.master, source.instanceId, part.onlyIf)) continue;
      let amount =
        part.amount *
        perCount(state, source.master, source.instanceId, part.per) *
        (part.perMarker ? markersOf(state, source.instanceId).length : 1) *
        (part.perCount ? zoneCount(state, source.master, source.instanceId, part.perCount.where, part.perCount.filter) : 1);
      // Ｘはそのキャラのレベル×N. Only power and soul use this, so levels are already settled.
      if (part.perTargetLevel) amount = part.amount * currentLevel(state, instanceId);
      if (part.perTargetSoul) amount = part.amount * currentStat(state, instanceId, 'SOUL');
      total += amount;
    }
  }
  return total;
}

/**
 * The automatic abilities a card has been given: by continuous abilities in
 * force (only while it is on the stage) and by effects lasting this turn.
 */
export function grantedAutos(state: GameState, instanceId: number): AutoAbility[] {
  const inst = getInstance(state, instanceId);
  const granted: AutoAbility[] = [];
  if (inst.location.zone === 'stage') {
    for (const { source, ability } of continuousInForce(state)) {
      for (const part of ability.grant ?? []) {
        if (continuousTargets(state, source, part.target, currentLevel).includes(instanceId)) granted.push(part.ability);
      }
    }
  }
  for (const grant of state.grants) {
    if (grant.objectId === inst.objectId && grant.ability.type === 'AUTO') granted.push(grant.ability);
  }
  return granted;
}

/** …1枚につき: how many (other) characters of the player match; 1 when the amount is not scaled. */
export function perCount(state: GameState, master: PlayerId, source: number, per: PerCharacter | undefined): number {
  if (!per) return 1;
  return stageCharacters(state, master).filter((id) => !(per.other && id === source) && matchesFilter(state, id, per.filter, printedLevel)).length;
}

/**
 * CR-10.6.2: the opponent's character that every attack against that player
 * must be a front attack on: one with 大活躍 in the front-centre slot that is
 * not reversed. Null when there is none.
 */
/** このカードはサイドアタックできない, while the ability is in force. */
/** このカードは、色条件を満たさずに手札からプレイできる: an ability of the card in the hand, with its condition. */
export function ignoresColorCondition(state: GameState, instanceId: number): boolean {
  const inst = getInstance(state, instanceId);
  if (inst.location.zone !== 'hand') return false;
  const player = inst.location.player;
  return (getDef(state, instanceId).abilities ?? []).some((ability) => ability.type === 'CONT' && ability.inHand === true && ability.ignoresColor === true && evalCondition(state, player, instanceId, ability.condition));
}

/**
 * The traits a card has: its printed ones and those given by continuous abilities in force (…に《…》を与える),
 * for a character on the stage. While this is being worked out, traits asked for again are the printed ones
 * (a condition of a trait-giving ability that itself looks at traits).
 */
let traitsInProgress = false;
/** The card ids whose own abilities give traits, worked out once per set of card definitions. */
const traitGiverCache = new WeakMap<object, Set<string>>();
function traitGivers(state: GameState): Set<string> {
  let set = traitGiverCache.get(state.defs);
  if (!set) {
    set = new Set(Object.entries(state.defs).filter(([, def]) => (def.abilities ?? []).some((a) => a.type === 'CONT' && a.giveTraits)).map(([id]) => id));
    traitGiverCache.set(state.defs, set);
  }
  return set;
}
export function traitsOf(state: GameState, instanceId: number): readonly string[] {
  const def = getDef(state, instanceId);
  const inst = getInstance(state, instanceId);
  if (traitsInProgress || inst.location.zone !== 'stage') return def.traits;
  const givers = traitGivers(state);
  const anyGiver =
    state.grants.some((grant) => grant.ability.type === 'CONT' && grant.ability.giveTraits) ||
    (givers.size > 0 && [0, 1].some((p) => SLOTS.some((slot) => state.zones[p as PlayerId].stage[slot].some((id) => givers.has(getInstance(state, id).cardId)))));
  if (!anyGiver) return def.traits;
  traitsInProgress = true;
  try {
    const traits = [...def.traits];
    for (const { source, ability } of continuousInForce(state)) {
      const give = ability.giveTraits;
      if (!give) continue;
      const applies = give.to === 'SELF' ? source.instanceId === instanceId : source.instanceId !== instanceId && getDef(state, instanceId).kind === 'CHARACTER';
      if (applies) traits.push(...give.traits.filter((t) => !traits.includes(t)));
    }
    return traits;
  } finally {
    traitsInProgress = false;
  }
}

/** CR-6.8.1.2: the hand limit, raised by あなたの手札の枚数上限を＋N. */
export function handLimit(state: GameState, player: PlayerId): number {
  let limit = HAND_LIMIT;
  for (const { source, ability } of continuousInForce(state)) if (ability.handLimitPlus && source.master === player) limit += ability.handLimitPlus;
  return limit;
}

/** The trigger icons a card has: printed ones and those it gains in every zone (すべての領域にあるこのカードはトリガーアイコンに…を得る). */
export function triggerIconsOf(state: GameState, instanceId: number): TriggerIcon[] {
  const def = getDef(state, instanceId);
  const icons = [...def.triggers];
  const inst = getInstance(state, instanceId);
  const player = inst.location.zone === 'stage' || inst.location.zone === 'marker' ? inst.location.player : inst.owner;
  for (const ability of def.abilities ?? []) {
    if (ability.type === 'CONT' && ability.gainsTriggerIcons && evalCondition(state, player, instanceId, ability.condition)) icons.push(...ability.gainsTriggerIcons);
  }
  return icons;
}

/** そのターン中、そのキャラは【リバース】しない */
export function cannotBeReversed(state: GameState, instanceId: number): boolean {
  return continuousInForce(state).some(({ source, ability }) => ability.cannotBeReversed === true && source.instanceId === instanceId);
}

/** このカードは、…なら、手札からプレイできない: whether the card's own restriction allows playing it now. */
export function playRestrictionMet(state: GameState, player: PlayerId, instanceId: number): boolean {
  return (getDef(state, instanceId).abilities ?? []).every((ability) => ability.type !== 'CONT' || !ability.playOnlyIf || evalCondition(state, player, instanceId, ability.playOnlyIf));
}

/** …はスタンドフェイズに【スタンド】しない */
export function staysRestedInStandPhase(state: GameState, instanceId: number): boolean {
  return continuousInForce(state).some(({ source, ability }) => ability.noStand === true && source.instanceId === instanceId);
}

/** このカードはプレイヤーにダメージを与えることができない */
export function cannotDamagePlayers(state: GameState, instanceId: number): boolean {
  return continuousInForce(state).some(({ source, ability }) => ability.noDamageToPlayers === true && source.instanceId === instanceId);
}

/** The activated abilities a card on the stage has: printed ones by index, then ones it gains (index 100 and up, in order). */
export function activatedAbilitiesOf(state: GameState, instanceId: number): { index: number; ability: ActivatedAbility }[] {
  const list: { index: number; ability: ActivatedAbility }[] = [];
  (getDef(state, instanceId).abilities ?? []).forEach((ability, index) => {
    if (ability.type === 'ACT') list.push({ index, ability });
  });
  if (getInstance(state, instanceId).location.zone !== 'stage') return list;
  // Only a card with a 【永】 that gives it a 【起】 can have more (gains are this card's own).
  if (!(getDef(state, instanceId).abilities ?? []).some((ability) => ability.type === 'CONT' && ability.gains?.some((g) => g.type === 'ACT'))) return list;
  let k = 100;
  for (const { source, ability } of continuousInForce(state)) {
    if (source.instanceId !== instanceId) continue;
    for (const gained of ability.gains ?? []) if (gained.type === 'ACT') list.push({ index: k++, ability: gained });
  }
  return list;
}

/** このカードのアタック中、あなたはトリガーステップにトリガーチェックをN回行う: the number for this character, if any. */
export function attackTriggerChecks(state: GameState, instanceId: number): number | undefined {
  let checks: number | undefined;
  for (const { source, ability } of continuousInForce(state)) if (ability.triggerChecks && source.instanceId === instanceId) checks = Math.max(checks ?? 0, ability.triggerChecks);
  return checks;
}

/** What X counts (SET_X). */
export function countForX(state: GameState, context: EffectContext, count: XCount): number {
  const master = context.master;
  const self = sourceIfUnchanged(state, context);
  const pool =
    count.of === 'MOVED'
      ? (context.moved ?? []).filter((id) => getInstance(state, id))
      : count.of === 'OPPONENT_WAITING_ROOM'
        ? state.zones[opponentOf(master)].waitingRoom
        : count.of === 'YOUR_MEMORY'
          ? state.zones[master].memory.filter((id) => getInstance(state, id).face === 'UP')
          : self && self.location.zone === 'stage'
            ? state.zones[self.location.player].marker[self.location.slot].filter((id) => !count.distinctNames || getInstance(state, id).face === 'UP')
            : [];
  const matching = pool.filter((id) => matchesFilter(state, id, count.filter));
  return count.distinctNames ? new Set(matching.map((id) => getDef(state, id).name)).size : matching.length;
}

export function cannotMove(state: GameState, instanceId: number): boolean {
  return continuousInForce(state).some(({ source, ability }) => ability.cannotMove === true && source.instanceId === instanceId);
}

/** このカードのバトル中、相手は…プレイできない: what the player defending against or attacking such a card may not play. */
export function blockedCounters(state: GameState, player: PlayerId): 'BACKUP' | 'EVENT_AND_BACKUP' | null {
  let blocked: 'BACKUP' | 'EVENT_AND_BACKUP' | null = null;
  const fighters = [attackerOf(state), defenderOf(state)].filter((inst): inst is CardInstance => !!inst && inst.location.zone === 'stage' && inst.location.player !== player);
  const allFighters = [attackerOf(state), defenderOf(state)].filter((inst): inst is CardInstance => !!inst && inst.location.zone === 'stage');
  for (const { source, ability } of continuousInForce(state)) {
    // すべてのプレイヤーは『助太刀』を手札からプレイできない: either side of this card's battle.
    if (ability.noBackupsEveryone && allFighters.some((inst) => inst.instanceId === source.instanceId) && blocked === null) blocked = 'BACKUP';
    if (!ability.noOpponentCounters || !fighters.some((inst) => inst.instanceId === source.instanceId)) continue;
    if (ability.noOpponentCounters === 'EVENT_AND_BACKUP' || blocked === null) blocked = ability.noOpponentCounters;
  }
  return blocked;
}

export function cannotSideAttack(state: GameState, instanceId: number): boolean {
  return continuousInForce(state).some(({ source, ability }) => ability.noSideAttack === true && source.instanceId === instanceId);
}

export function greatPerformer(state: GameState, defendingPlayer: PlayerId): CardInstance | null {
  for (const id of state.zones[defendingPlayer].stage.FC) {
    const def = getDef(state, id);
    const inst = getInstance(state, id);
    if (def.kind !== 'CHARACTER' || inst.orientation === 'REVERSE') continue;
    if ((def.abilities ?? []).some((ability) => ability.type === 'CONT' && ability.greatPerformance)) return inst;
  }
  return null;
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
/**
 * Cards whose level is being worked out. A continuous ability whose condition looks at levels (for example
 * 相手のレベル2以上のキャラがいるなら、あなたの手札のこのカードのレベルを－1) is evaluated while levels are worked out;
 * a card met again on the way gets its level without continuous changes, so the evaluation ends.
 */
const levelsInProgress = new Set<number>();

export function currentStat(state: GameState, instanceId: number, stat: Stat): number {
  const def = getDef(state, instanceId);
  const printed = stat === 'POWER' ? def.power : stat === 'SOUL' ? def.soul : def.level;
  // CR-2.19.1: a number the card does not have counts as 0.
  if (stat !== 'LEVEL') return (printed ?? 0) + continuousTotal(state, instanceId, stat) + turnModifierTotal(state, instanceId, stat);
  if (levelsInProgress.has(instanceId)) return (printed ?? 0) + turnModifierTotal(state, instanceId, stat);
  levelsInProgress.add(instanceId);
  try {
    return (printed ?? 0) + continuousTotal(state, instanceId, stat) + turnModifierTotal(state, instanceId, stat);
  } finally {
    levelsInProgress.delete(instanceId);
  }
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
    case 'ALL_THEIRS':
      return stageCharacters(state, opponentOf(context.master));
    case 'FACING': {
      const self = sourceIfUnchanged(state, context);
      const facing = self && self.location.zone === 'stage' ? facingSlot(self.location.slot) : null;
      return self && facing && self.location.zone === 'stage' ? state.zones[opponentOf(self.location.player)].stage[facing].filter((id) => getDef(state, id).kind === 'CHARACTER') : [];
    }
    case 'IN_FRONT': {
      const self = sourceIfUnchanged(state, context);
      if (!self || self.location.zone !== 'stage') return [];
      const zones = state.zones[self.location.player];
      return slotsInFrontOf(self.location.slot)
        .flatMap((slot) => zones.stage[slot])
        .filter((id) => getDef(state, id).kind === 'CHARACTER' && matchesFilter(state, id, target.filter));
    }
    case 'YOUR_SLOT':
      return target.slots
        .flatMap((slot) => state.zones[context.master].stage[slot])
        .filter((id) => getDef(state, id).kind === 'CHARACTER' && !(target.other && id === context.source));
    case 'MOVED':
    case 'PLACED':
      return (target.who === 'MOVED' ? (context.lastMoved ?? []) : (context.placed ?? [])).flatMap((objectId) => {
        const inst = byObjectId(state, objectId);
        return inst ? [inst.instanceId] : [];
      });
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
    case 'THAT': {
      const inst = context.about == null ? undefined : byObjectId(state, context.about);
      // The same object only (CR-3.1.4: a card that changes zone is a new card): on the stage, or where the trigger saw it go.
      return inst ? [inst.instanceId] : [];
    }
    case 'MARKER_HOLDER': {
      const self = sourceIfUnchanged(state, context);
      return self ? markerHolder(state, self.instanceId).filter((id) => matchesFilter(state, id, target.filter)) : [];
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
  let pool: number[] = [];
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
    case 'YOUR_LEVEL':
      pool = [...zones.level];
      break;
    case 'THOSE':
      pool = (context.moved ?? []).filter((id) => state.instances[id]);
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
    case 'OPPONENT_FRONT_ROW': {
      const opponent = state.zones[opponentOf(master)];
      pool = FRONT_SLOTS.flatMap((slot) => opponent.stage[slot]).filter((id) => getDef(state, id).kind === 'CHARACTER');
      break;
    }
    case 'OPPONENT_WAITING_ROOM':
      pool = [...state.zones[opponentOf(master)].waitingRoom];
      break;
    case 'YOUR_MEMORY':
      pool = zones.memory.filter((id) => getInstance(state, id).face === 'UP');
      break;
    case 'YOUR_OTHER_STAGE':
      pool = stageCharacters(state, master).filter((id) => id !== context.source);
      break;
    case 'YOUR_BATTLING': {
      const mine = [attackerOf(state), defenderOf(state)].filter((inst): inst is CardInstance => !!inst && inst.location.zone === 'stage' && inst.location.player === master);
      pool = mine.map((inst) => inst.instanceId);
      break;
    }
    case 'BATTLING': {
      const both = [attackerOf(state), defenderOf(state)].filter((inst): inst is CardInstance => !!inst && inst.location.zone === 'stage');
      pool = both.map((inst) => inst.instanceId);
      break;
    }
    case 'OPPONENT_BACK_ROW': {
      const opponent = state.zones[opponentOf(master)];
      pool = BACK_SLOTS.flatMap((slot) => opponent.stage[slot]).filter((id) => getDef(state, id).kind === 'CHARACTER');
      break;
    }
    case 'OPPONENT_CLIMAX':
      pool = state.zones[opponentOf(master)].climax.filter((id) => getDef(state, id).kind === 'CLIMAX');
      break;
  }
  return pool.filter((id) => !(other && id === context.source) && matchesFilter(state, id, filter) && !shielded(state, master, id));
}

/**
 * このカードは相手の効果に選ばれない: a character on the stage of the chooser's opponent whose continuous
 * ability in force says so cannot be chosen by the chooser's effects.
 */
function shielded(state: GameState, chooser: PlayerId, instanceId: number): boolean {
  const inst = getInstance(state, instanceId);
  if (inst.location.zone !== 'stage' || inst.location.player === chooser) return false;
  return continuousInForce(state).some(({ source, ability }) => ability.untargetable === true && source.instanceId === instanceId);
}
