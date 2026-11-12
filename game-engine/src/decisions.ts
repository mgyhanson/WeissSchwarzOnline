/**
 * Decisions and choices.
 *
 * Whenever the rules need a player to choose something, the engine stops and
 * exposes a Decision that says exactly which answers are legal. Nothing
 * continues until a legal Choice for that decision is submitted.
 *
 * Cards are referred to by objectId, the only card id players ever see.
 */

import type { AttackType, PlayerId, SlotId } from './types';

/** The two interrupt-type rule actions (CR-9.1.2.1). */
export type RuleActionKind = 'REFRESH' | 'LEVEL_UP';

/** What the turn player may do at a main phase play timing (CR-6.5.1.2). */
export type MainAction =
  /** CR-6.5.1.2.1: play a character card from hand into a slot. */
  | { type: 'PLAY_CHARACTER'; card: number; slot: SlotId }
  /** CR-6.5.1.2.2: play an event card from hand. */
  | { type: 'PLAY_EVENT'; card: number }
  /** CR-6.5.1.2.3: play activated ability number `ability` of a character on the stage. */
  | { type: 'ACTIVATE'; card: number; ability: number }
  /** CR-6.5.1.2.4: exchange the cards of two slots. */
  | { type: 'SWAP'; a: SlotId; b: SlotId }
  /** CR-6.5.1.3: do nothing; the game proceeds to the climax phase. */
  | { type: 'PASS' };

/** CR-7.2.1.3 / 7.2.1.4: a character that can attack and a way it can attack. */
export interface AttackOption {
  attacker: number;
  type: AttackType;
}

/**
 * What a generic question is about, so that a client can word it. The rule
 * that causes each question is given where the question is asked.
 */
export type PromptId =
  | 'ENCORE'
  | 'ENCORE_STEP'
  /** Pay the cost of an automatic ability? (CR-8.1.1.2.2) */
  | 'PAY_COST'
  /** Use an optional ability or effect? */
  | 'USE_ABILITY'
  /** A card ability asks to choose cards (CR-8.6.3). */
  | 'EFFECT_CHOOSE'
  /** Choose the hand cards to discard as a cost. */
  | 'COST_DISCARD'
  /** Choose the characters to rest as a cost. */
  | 'COST_REST'
  /** Look at the next card from the top of your deck? (CR-3.2.3.1) */
  | 'LOOK_NEXT'
  /** Choose a slot for a card ability. */
  | 'EFFECT_SLOT'
  | 'TRIGGER_ORDER'
  | 'TRIGGER_RETURN'
  | 'TRIGGER_POOL'
  | 'TRIGGER_COMEBACK'
  | 'TRIGGER_DRAW'
  | 'TRIGGER_TREASURE_STOCK'
  | 'TRIGGER_GATE'
  | 'TRIGGER_STANDBY'
  | 'TRIGGER_STANDBY_SLOT'
  | 'TRIGGER_CHOICE'
  | 'TRIGGER_CHOICE_DESTINATION'
  | 'TRIGGER_CHANCE_REVEAL'
  | 'TRIGGER_CHANCE_STOCK'
  | 'TRIGGER_DISCOVERY_REVEAL'
  | 'TRIGGER_DISCOVERY'
  | 'TRIGGER_FOCUS';

/** A waiting automatic ability offered in a CHOOSE_ABILITY decision. */
export interface AbilityOption {
  id: number;
  type: 'ENCORE' | 'SHOT' | 'CARD';
  /** For a card ability: true when the card was given the ability rather than having it printed. */
  granted?: boolean;
  /** For a card ability: its number among the card's abilities. */
  ability?: number;
  /** The card the ability belongs to, when it is still the same visible object. */
  card?: number;
  /** The card id of that card, when the deciding player can see the card where it is now. For display only. */
  cardId?: string;
}

interface DecisionBase {
  /** Unique within a game. A submitted choice must quote it, which makes duplicate or late submissions harmless. */
  id: number;
  player: PlayerId;
}

export type Decision =
  /** CR-5.2.1.4: put any number of hand cards into the waiting room, then draw as many. */
  | (DecisionBase & { kind: 'MULLIGAN'; cards: number[] })
  /** CR-6.4.1.2: may put one hand card into the clock to draw two. */
  | (DecisionBase & { kind: 'CLOCK'; cards: number[] })
  /** CR-6.5.1.2: main phase play timing. `actions` lists every legal action. */
  | (DecisionBase & { kind: 'MAIN'; actions: MainAction[] })
  /** CR-6.6.1.2: may play one climax card. `cards` are the playable ones. */
  | (DecisionBase & { kind: 'CLIMAX'; cards: number[] })
  /** CR-7.2.1.3: attack with one of the listed options, or end the attacks. */
  | (DecisionBase & { kind: 'ATTACK'; attacks: AttackOption[] })
  /**
   * CR-7.4.1.2: the defending player may play one of the listed counter
   * events, or one of the listed backup abilities of cards in hand (CR-10.5).
   */
  | (DecisionBase & { kind: 'COUNTER'; cards: number[]; backups: { card: number; ability: number }[] })
  /** CR-9.3.2: choose one of the bottom seven clock cards to become a level. */
  | (DecisionBase & { kind: 'LEVEL_UP'; cards: number[] })
  /** CR-6.8.1.2: discard exactly `count` cards down to the hand limit. */
  | (DecisionBase & { kind: 'HAND_LIMIT'; cards: number[]; count: number })
  /** CR-9.1.2.1.1.2: both interrupt rule actions are due for this player; choose which to perform first. */
  | (DecisionBase & { kind: 'RULE_ACTION_ORDER'; options: RuleActionKind[] })
  /** CR-8.7.3.1: several of the player's automatic abilities are waiting; choose which to play first. */
  | (DecisionBase & { kind: 'CHOOSE_ABILITY'; abilities: AbilityOption[] })
  /**
   * A "you may" question. `ability` is the ability number when it concerns a
   * card ability; `card` / `cardId` name the card as in AbilityOption. `look` as for SELECT_CARDS: hidden cards this player is looking at.
   */
  | (DecisionBase & { kind: 'CONFIRM'; prompt: PromptId; card?: number; cardId?: string; ability?: number; look?: Record<number, string> })
  /**
   * Choose between `min` and `max` of the listed cards. `look` gives the
   * card ids of hidden cards the effect lets this player look at (e.g. the
   * whole deck when searching it, CR-4.8.1), by object id.
   */
  | (DecisionBase & { kind: 'SELECT_CARDS'; prompt: PromptId; cards: number[]; min: number; max: number; look?: Record<number, string> })
  /** Choose one of the player's own slots. */
  | (DecisionBase & { kind: 'SELECT_SLOT'; prompt: PromptId; slots: SlotId[] })
  /** Choose one of the listed options. */
  | (DecisionBase & { kind: 'SELECT_OPTION'; prompt: PromptId; options: string[] });

export type DecisionKind = Decision['kind'];

/** Distributes Omit over the Decision union. */
export type DecisionInput = Decision extends infer D ? (D extends Decision ? Omit<D, 'id'> : never) : never;

export type Choice =
  | { kind: 'MULLIGAN'; discard: number[] }
  | { kind: 'CLOCK'; card: number | null }
  | { kind: 'MAIN'; action: MainAction }
  | { kind: 'CLIMAX'; card: number | null }
  /** `attack: null` ends the attacks (CR-7.2.1.3.2). */
  | { kind: 'ATTACK'; attack: AttackOption | null }
  /** With `ability` the choice is a backup ability of that hand card; without, a counter event. */
  | { kind: 'COUNTER'; card: number | null; ability?: number }
  | { kind: 'LEVEL_UP'; card: number }
  | { kind: 'HAND_LIMIT'; discard: number[] }
  | { kind: 'RULE_ACTION_ORDER'; first: RuleActionKind }
  | { kind: 'CHOOSE_ABILITY'; id: number }
  | { kind: 'CONFIRM'; accept: boolean }
  | { kind: 'SELECT_CARDS'; cards: number[] }
  | { kind: 'SELECT_SLOT'; slot: SlotId }
  | { kind: 'SELECT_OPTION'; option: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** An array of distinct ids, all taken from `allowed`. */
function isDistinctSubset(value: unknown, allowed: readonly number[]): value is number[] {
  if (!Array.isArray(value)) return false;
  if (!value.every((id) => typeof id === 'number' && allowed.includes(id))) return false;
  return new Set(value).size === value.length;
}

function isOfferedCardOrNull(value: unknown, offered: readonly number[]): boolean {
  return value === null || (typeof value === 'number' && offered.includes(value));
}

export function sameMainAction(a: MainAction, b: MainAction): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'PLAY_CHARACTER':
      return b.type === 'PLAY_CHARACTER' && a.card === b.card && a.slot === b.slot;
    case 'PLAY_EVENT':
      return b.type === 'PLAY_EVENT' && a.card === b.card;
    case 'ACTIVATE':
      return b.type === 'ACTIVATE' && a.card === b.card && a.ability === b.ability;
    case 'SWAP':
      return b.type === 'SWAP' && a.a === b.a && a.b === b.b;
    case 'PASS':
      return true;
  }
}

/**
 * Checks a choice (possibly malformed input from a client) against the
 * pending decision. Returns null when legal, otherwise the reason.
 */
export function validateChoice(decision: Decision, choice: unknown): string | null {
  if (!isRecord(choice)) return 'The choice is not an object';
  if (choice.kind !== decision.kind) {
    return `Expected a ${decision.kind} choice, got ${String(choice.kind)}`;
  }

  switch (decision.kind) {
    case 'MULLIGAN':
      return isDistinctSubset(choice.discard, decision.cards) ? null : 'discard must list distinct cards from your hand';
    case 'CLOCK':
    case 'CLIMAX':
      return isOfferedCardOrNull(choice.card, decision.cards) ? null : 'card must be null or one of the offered cards';
    case 'COUNTER':
      if (choice.ability === undefined) {
        return isOfferedCardOrNull(choice.card, decision.cards) ? null : 'card must be null or one of the offered cards';
      }
      return decision.backups.some((option) => option.card === choice.card && option.ability === choice.ability)
        ? null
        : 'That backup ability cannot be played now';
    case 'MAIN': {
      const action = choice.action;
      if (!isRecord(action) || typeof action.type !== 'string') return 'action is missing';
      const legal = decision.actions.some((candidate) => sameMainAction(candidate, action as MainAction));
      return legal ? null : 'That action is not legal now';
    }
    case 'ATTACK': {
      const attack = choice.attack;
      if (attack === null) return null;
      if (!isRecord(attack)) return 'attack must be null or one of the offered attacks';
      const legal = decision.attacks.some((option) => option.attacker === attack.attacker && option.type === attack.type);
      return legal ? null : 'That attack is not legal now';
    }
    case 'LEVEL_UP':
      return typeof choice.card === 'number' && decision.cards.includes(choice.card)
        ? null
        : 'card must be one of the bottom seven clock cards';
    case 'HAND_LIMIT':
      if (!isDistinctSubset(choice.discard, decision.cards)) return 'discard must list distinct cards from your hand';
      return choice.discard.length === decision.count ? null : `Exactly ${decision.count} cards must be discarded`;
    case 'RULE_ACTION_ORDER':
      return decision.options.includes(choice.first as RuleActionKind) ? null : 'first must be one of the offered rule actions';
    case 'CHOOSE_ABILITY':
      return decision.abilities.some((ability) => ability.id === choice.id) ? null : 'id must be one of the offered abilities';
    case 'CONFIRM':
      return typeof choice.accept === 'boolean' ? null : 'accept must be true or false';
    case 'SELECT_CARDS':
      if (!isDistinctSubset(choice.cards, decision.cards)) return 'cards must list distinct offered cards';
      return choice.cards.length >= decision.min && choice.cards.length <= decision.max
        ? null
        : `Between ${decision.min} and ${decision.max} cards must be chosen`;
    case 'SELECT_SLOT':
      return decision.slots.includes(choice.slot as SlotId) ? null : 'slot must be one of the offered slots';
    case 'SELECT_OPTION':
      return typeof choice.option === 'string' && decision.options.includes(choice.option)
        ? null
        : 'option must be one of the offered options';
  }
}
