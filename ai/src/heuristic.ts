/**
 * The Normal and Advanced levels: rules of thumb that score the legal
 * answers of each decision from the player's own view.
 *
 *  - NORMAL: plays characters to empty slots by strength, attacks by
 *    comparing power, clocks while it is safe, uses a backup only when it
 *    saves the character.
 *  - ADVANCED: adds climax combos, replacing weak characters, keeping stock
 *    for encore, colour needs at level up, the chance of a damage cancel
 *    (estimated from public information only), and an all-out attack when
 *    the opponent is close to losing.
 *
 * Each refinement is a switch (Features) so that its effect can be
 * measured. Measured over 200 games each against Normal (2026-11-12), the
 * all-out attack near the end helped most; two ideas that were tried and
 * measured as harmful were removed: assuming the opponent will always
 * backup, and clocking more cautiously.
 *
 * `rank` lists the answers best first; the Expert level simulates the top
 * few of them.
 */

import {
  type Ability,
  type AttackOption,
  type Choice,
  type Decision,
  type MainAction,
  type PlayerView,
  type SlotId,
  opponentOf,
} from '@wso/game-engine';
import {
  BACK,
  type CardLookup,
  FACING,
  FRONT,
  availableColors,
  cancelChance,
  cardIdOf,
  damageTaken,
  levelOf,
  locate,
  stageCard,
  stageCards,
  visible,
} from './knowledge';

export type HeuristicLevel = 'NORMAL' | 'ADVANCED';

/** The Advanced level's refinements, one switch each so their effect can be measured. */
export interface Features {
  keepTwoClimaxes: boolean;
  replace: boolean;
  stockReserve: boolean;
  activateReserve: boolean;
  swapForward: boolean;
  lethal: boolean;
  cancel: boolean;
  combo: boolean;
  climaxWithOne: boolean;
  counterValue: boolean;
  levelUpColors: boolean;
  encoreCareful: boolean;
  /** Score taken off a front attack that loses the battle (outside lethal range). */
  losingFrontPenalty: number;
  /** Clock while total damage taken is at most this. */
  clockLimit: number;
  /** With `lethal`: the opponent's damage from which every attack goes for damage. */
  lethalDamage: number;
}

const ALL_ON: Features = {
  keepTwoClimaxes: true,
  replace: true,
  stockReserve: true,
  activateReserve: true,
  swapForward: true,
  lethal: true,
  cancel: true,
  combo: true,
  climaxWithOne: true,
  counterValue: true,
  levelUpColors: true,
  encoreCareful: true,
  losingFrontPenalty: 8,
  clockLimit: 17,
  lethalDamage: 21,
};

export const FEATURES: Record<HeuristicLevel, Features> = {
  NORMAL: { ...(Object.fromEntries(Object.keys(ALL_ON).map((k) => [k, false])) as unknown as Features), losingFrontPenalty: 8, clockLimit: 20, lethalDamage: 21 },
  ADVANCED: ALL_ON,
};

/** Collects the climax names of CX combo conditions in a card's abilities. */
function comboNames(abilities: readonly Ability[] | undefined): string[] {
  const names: string[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (record.if === 'CLIMAX_IN_PLAY' && typeof record.name === 'string') names.push(record.name);
      Object.values(record).forEach(walk);
    }
  };
  walk(abilities ?? []);
  return names;
}

function hasAssist(abilities: readonly Ability[] | undefined): boolean {
  return (abilities ?? []).some((a) => a.type === 'CONT' && a.assist === true);
}

/** Power a backup ability gives (its MODIFY POWER amount), 0 if unknown. */
function backupPower(ability: Ability | undefined): number {
  if (!ability || ability.type !== 'ACT') return 0;
  for (const effect of ability.effect) if (effect.do === 'MODIFY' && effect.stat === 'POWER') return effect.amount;
  return 0;
}

export class HeuristicPlayer {
  private activations = { turn: -1, count: 0 };
  private readonly f: Features;

  constructor(
    readonly level: HeuristicLevel,
    private readonly card: CardLookup,
    features: Partial<Features> = {},
  ) {
    this.f = { ...FEATURES[level], ...features };
  }

  // ----- card values -----

  private strength(cardId: string): number {
    const def = this.card(cardId);
    if (def.kind !== 'CHARACTER') return 0;
    return (def.power ?? 0) / 1000 + (def.level ?? 0) * 3 + (def.soul ?? 0) * 1.5 + (def.abilities?.length ?? 0);
  }

  /** How much the player wants to keep a hand card. Lower is more expendable. */
  private keepValue(view: PlayerView, cardId: string, climaxesBefore: number): number {
    const def = this.card(cardId);
    const myLevel = levelOf(view, view.viewer);
    if (def.kind === 'CLIMAX') return climaxesBefore >= (this.f.keepTwoClimaxes ? 2 : 1) ? -5 : 8;
    if (def.kind === 'EVENT') return 4 + (def.counter ? 3 : 0);
    const distance = Math.abs((def.level ?? 0) - myLevel);
    return 10 + this.strength(cardId) * 0.5 - distance * 2 + (def.counter ? 4 : 0);
  }

  /** The `count` least valuable of the given visible cards. */
  private cheapest(view: PlayerView, objectIds: readonly number[], count: number): number[] {
    let climaxes = 0;
    const scored = objectIds.map((id) => {
      const cardId = cardIdOf(view, id);
      const value = cardId ? this.keepValue(view, cardId, climaxes) : 0;
      if (cardId && this.card(cardId).kind === 'CLIMAX') climaxes++;
      return { id, value };
    });
    return scored
      .sort((a, b) => a.value - b.value)
      .slice(0, count)
      .map((s) => s.id);
  }

  /** The `count` most valuable cards (for effects that let the player take or keep cards). */
  private best(view: PlayerView, objectIds: readonly number[], count: number, look?: Record<number, string>): number[] {
    const me = view.viewer;
    const scored = objectIds.map((id) => {
      const where = locate(view, id);
      const cardId = cardIdOf(view, id, look);
      let value = cardId ? this.strength(cardId) + (this.card(cardId).kind === 'CLIMAX' ? 2 : 0) : 0;
      // An opponent's stage character is a target: prefer the strongest.
      if (where && where.side !== me && where.zone === 'stage') value = (where.card.objectId in view.stats ? view.stats[where.card.objectId]!.power / 1000 : 0) + value;
      return { id, value };
    });
    return scored
      .sort((a, b) => b.value - a.value)
      .slice(0, count)
      .map((s) => s.id);
  }

  // ----- main phase -----

  private mainScore(view: PlayerView, action: MainAction): number {
    const me = view.viewer;
    const stock = view.sides[me].stock.length;
    switch (action.type) {
      case 'PLAY_CHARACTER': {
        const cardId = cardIdOf(view, action.card);
        if (!cardId) return -1;
        const def = this.card(cardId);
        const cost = def.cost ?? 0;
        const strength = this.strength(cardId);
        const occupant = stageCard(view, me, action.slot);
        const front = FRONT.includes(action.slot);
        let score: number;
        if (!occupant) score = front ? 40 + strength : 22 + strength * 0.5 + (hasAssist(def.abilities) ? 10 : 0) - (hasAssist(def.abilities) ? 0 : 6);
        else if (!this.f.replace) return -1;
        else {
          // Replacing: only clearly better characters, never a fresh one just played.
          const gain = strength - (occupant.card.orientation === 'REVERSE' ? 0 : this.strength(occupant.card.cardId));
          score = gain > 4 ? 15 + gain : -1;
        }
        if (score < 0) return score;
        // Advanced keeps three stock for an encore when it can.
        const penalty = this.f.stockReserve && stock - cost < 3 && cost > 0 ? cost * 4 : cost;
        return score - penalty;
      }
      case 'PLAY_EVENT':
        return 12;
      case 'ACTIVATE':
        return this.activations.count < 2 && stock >= (this.f.activateReserve ? 4 : 2) ? 6 : -1;
      case 'SWAP': {
        if (!this.f.swapForward) return -1;
        // Move a strong back-row character forward into an empty front slot.
        const a = stageCard(view, me, action.a);
        const b = stageCard(view, me, action.b);
        const [from, to] = a && !b ? [a, action.b] : b && !a ? [b, action.a] : [null, null];
        if (!from || !to) return -1;
        return BACK.includes(from.slot) && FRONT.includes(to) && !hasAssist(this.card(from.card.cardId).abilities) ? 10 : -1;
      }
      case 'PASS':
        return 0;
    }
  }

  // ----- attacks -----

  private attackScore(view: PlayerView, option: AttackOption): number {
    const me = view.viewer;
    const opp = opponentOf(me);
    const attacker = locate(view, option.attacker);
    const stats = view.stats[option.attacker];
    if (!attacker?.slot || !stats) return 0;
    const facing = stageCard(view, opp, FACING[attacker.slot]);
    const oppDamage = damageTaken(view, opp);
    const lethalRange = this.f.lethal && oppDamage >= this.f.lethalDamage;
    const expected = (soul: number) => (this.f.cancel ? soul * (1 - cancelChance(view, soul, this.card)) : soul);
    switch (option.type) {
      case 'DIRECT':
        return 10 + expected(stats.soul + 1) * 3;
      case 'SIDE': {
        const soul = Math.max(0, stats.soul - (facing?.level ?? 0));
        return 2 + expected(soul) * 3;
      }
      case 'FRONT': {
        if (!facing) return 0;
        const margin = stats.power - facing.power;
        const damage = expected(stats.soul) * 3;
        if (margin > 0) return 8 + damage + facing.level * 4 + facing.power / 2000;
        if (margin === 0) return 3 + damage + facing.level * 2;
        // Losing the battle: Advanced prefers to side attack unless going for the win.
        return damage - (lethalRange ? 0 : this.f.losingFrontPenalty);
      }
    }
  }

  // ----- ranking -----

  /** Answers best first, for the decisions the Expert simulates. Null for other decisions. */
  rank(view: PlayerView, decision: Decision): Choice[] | null {
    const me = view.viewer;
    switch (decision.kind) {
      case 'MAIN': {
        const scored = decision.actions.map((action) => ({ action, score: this.mainScore(view, action) }));
        scored.sort((a, b) => b.score - a.score);
        const pass: MainAction = { type: 'PASS' };
        const ordered = scored.filter((s) => s.score > 0).map((s) => s.action);
        return [...ordered, pass].map((action) => ({ kind: 'MAIN', action }));
      }
      case 'ATTACK': {
        const scored = decision.attacks.map((attack) => ({ attack, score: this.attackScore(view, attack) }));
        scored.sort((a, b) => b.score - a.score);
        return [...scored.map((s): Choice => ({ kind: 'ATTACK', attack: s.attack })), { kind: 'ATTACK', attack: null }];
      }
      case 'CLIMAX': {
        if (decision.cards.length === 0) return [{ kind: 'CLIMAX', card: null }];
        const combos = new Set(stageCards(view, me).flatMap((c) => comboNames(this.card(c.card.cardId).abilities)));
        const front = FRONT.filter((slot) => stageCard(view, me, slot)).length;
        const scored = decision.cards.map((card) => {
          const name = this.card(cardIdOf(view, card) ?? '').name;
          return { card, score: (this.f.combo && combos.has(name) ? 10 : 0) + front * 3 };
        });
        scored.sort((a, b) => b.score - a.score);
        const play = scored.map((s): Choice => ({ kind: 'CLIMAX', card: s.card }));
        return front >= (this.f.climaxWithOne ? 1 : 2) ? [...play, { kind: 'CLIMAX', card: null }] : [{ kind: 'CLIMAX', card: null }, ...play];
      }
      case 'CLOCK': {
        const damage = damageTaken(view, me);
        const safe = damage <= this.f.clockLimit;
        const candidates = this.cheapest(view, decision.cards, 3).map((card): Choice => ({ kind: 'CLOCK', card }));
        const skip: Choice = { kind: 'CLOCK', card: null };
        return safe && decision.cards.length >= 2 ? [...candidates, skip] : [skip, ...candidates];
      }
      case 'COUNTER':
        return this.counterRank(view, decision);
      case 'LEVEL_UP': {
        const order = this.levelUpOrder(view, decision.cards);
        return order.map((card) => ({ kind: 'LEVEL_UP', card }));
      }
      default:
        return null;
    }
  }

  private counterRank(view: PlayerView, decision: Extract<Decision, { kind: 'COUNTER' }>): Choice[] {
    const none: Choice = { kind: 'COUNTER', card: null };
    const attack = view.attack;
    const attacker = attack ? view.stats[attack.attackerObjectId] : undefined;
    const defender = attack?.defenderObjectId != null ? view.stats[attack.defenderObjectId] : undefined;
    const backups = decision.backups.map((b) => {
      const cardId = cardIdOf(view, b.card);
      const power = cardId ? backupPower(this.card(cardId).abilities?.[b.ability]) : 0;
      return { choice: { kind: 'COUNTER', card: b.card, ability: b.ability } as Choice, power };
    });
    if (!attacker || !defender) return [none, ...backups.map((b) => b.choice)];
    // Worth it only when the backup turns a lost battle into a won or tied one,
    // and (Advanced) the defender is worth saving.
    const worth = (power: number) =>
      defender.power < attacker.power && defender.power + power >= attacker.power && (!this.f.counterValue || defender.level >= 1 || defender.power + power > attacker.power);
    const useful = backups.filter((b) => worth(b.power)).sort((a, b) => a.power - b.power);
    return [...useful.map((b) => b.choice), none, ...backups.filter((b) => !worth(b.power)).map((b) => b.choice), ...decision.cards.map((card): Choice => ({ kind: 'COUNTER', card }))];
  }

  private levelUpOrder(view: PlayerView, cards: readonly number[]): number[] {
    const me = view.viewer;
    if (!this.f.levelUpColors) {
      const nonClimax = cards.filter((id) => this.card(cardIdOf(view, id) ?? '').kind !== 'CLIMAX');
      return [...nonClimax, ...cards.filter((id) => !nonClimax.includes(id))];
    }
    // Put a card of a colour the hand needs into the level zone; otherwise the least useful card.
    const have = availableColors(view, me, this.card);
    const need = new Map<string, number>();
    for (const c of view.sides[me].hand) {
      if (!visible(c)) continue;
      const def = this.card(c.cardId);
      if ((def.level ?? 0) > 0 && !have.has(def.color)) need.set(def.color, (need.get(def.color) ?? 0) + 1);
    }
    const scored = cards.map((id) => {
      const def = this.card(cardIdOf(view, id) ?? '');
      return { id, score: (need.get(def.color) ?? 0) * 5 + (def.kind === 'CLIMAX' ? -3 : 0) - this.strength(def.cardId) * 0.3 };
    });
    return scored.sort((a, b) => b.score - a.score).map((s) => s.id);
  }

  // ----- choosing -----

  choose(view: PlayerView, decision: Decision): Choice {
    const turn = view.turn?.number ?? 0;
    if (this.activations.turn !== turn) this.activations = { turn, count: 0 };
    const ranked = this.rank(view, decision);
    if (ranked) {
      const choice = ranked[0]!;
      if (choice.kind === 'MAIN' && choice.action.type === 'ACTIVATE') this.activations.count++;
      return choice;
    }
    const me = view.viewer;
    switch (decision.kind) {
      case 'MULLIGAN': {
        // Keep level 0 and 1 characters and events; climaxes and high levels go.
        const discard = decision.cards.filter((id) => {
          const def = this.card(cardIdOf(view, id) ?? '');
          return def.kind === 'CLIMAX' || (def.level ?? 0) >= 2;
        });
        return { kind: 'MULLIGAN', discard };
      }
      case 'HAND_LIMIT':
        return { kind: 'HAND_LIMIT', discard: this.cheapest(view, decision.cards, decision.count) };
      case 'RULE_ACTION_ORDER':
        return { kind: 'RULE_ACTION_ORDER', first: decision.options[0]! };
      case 'CHOOSE_ABILITY':
        return { kind: 'CHOOSE_ABILITY', id: decision.abilities[0]!.id };
      case 'CONFIRM': {
        if (decision.prompt === 'ENCORE') {
          const cardId = decision.cardId ?? (decision.card !== undefined ? cardIdOf(view, decision.card) : null);
          const level = cardId ? (this.card(cardId).level ?? 0) : 0;
          const stock = view.sides[me].stock.length;
          return { kind: 'CONFIRM', accept: this.f.encoreCareful ? level >= 1 || stock >= 6 : level >= 1 || stock >= 5 };
        }
        return { kind: 'CONFIRM', accept: true };
      }
      case 'SELECT_CARDS': {
        if (decision.prompt === 'COST_DISCARD' || decision.prompt === 'COST_REST' || decision.prompt === 'COST_HAND_TO_CLOCK' || decision.prompt === 'TRIGGER_CHANCE_STOCK') {
          return { kind: 'SELECT_CARDS', cards: this.cheapest(view, decision.cards, decision.min) };
        }
        const count = Math.min(decision.max, decision.cards.length);
        return { kind: 'SELECT_CARDS', cards: this.best(view, decision.cards, Math.max(count, decision.min), decision.look) };
      }
      case 'SELECT_SLOT': {
        const order: SlotId[] = [...FRONT, ...BACK];
        const empty = order.find((slot) => decision.slots.includes(slot) && !stageCard(view, me, slot));
        return { kind: 'SELECT_SLOT', slot: empty ?? decision.slots[0]! };
      }
      case 'SELECT_OPTION':
        return { kind: 'SELECT_OPTION', option: decision.options[0]! };
      default:
        throw new Error(`Unhandled decision ${decision.kind}`);
    }
  }
}
