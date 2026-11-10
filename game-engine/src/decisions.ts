/**
 * Decisions and choices.
 *
 * Whenever the rules need a player to choose something, the engine stops and
 * exposes a Decision that says exactly which answers are legal. Nothing
 * continues until a legal Choice for that decision is submitted.
 *
 * Cards are referred to by objectId, the only card id players ever see.
 */

import type { PlayerId, SlotId } from './types';

/** The two interrupt-type rule actions (CR-9.1.2.1). */
export type RuleActionKind = 'REFRESH' | 'LEVEL_UP';

/** What the turn player may do at a main phase play timing (CR-6.5.1.2). */
export type MainAction =
  /** CR-6.5.1.2.1: play a character card from hand into a slot. */
  | { type: 'PLAY_CHARACTER'; card: number; slot: SlotId }
  /** CR-6.5.1.2.2: play an event card from hand. */
  | { type: 'PLAY_EVENT'; card: number }
  /** CR-6.5.1.2.4: exchange the cards of two slots. */
  | { type: 'SWAP'; a: SlotId; b: SlotId }
  /** CR-6.5.1.3: do nothing; the game proceeds to the climax phase. */
  | { type: 'PASS' };

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
  /** CR-9.3.2: choose one of the bottom seven clock cards to become a level. */
  | (DecisionBase & { kind: 'LEVEL_UP'; cards: number[] })
  /** CR-6.8.1.2: discard exactly `count` cards down to the hand limit. */
  | (DecisionBase & { kind: 'HAND_LIMIT'; cards: number[]; count: number })
  /** CR-9.1.2.1.1.2: both interrupt rule actions are due for this player; choose which to perform first. */
  | (DecisionBase & { kind: 'RULE_ACTION_ORDER'; options: RuleActionKind[] });

export type DecisionKind = Decision['kind'];

/** Distributes Omit over the Decision union. */
export type DecisionInput = Decision extends infer D ? (D extends Decision ? Omit<D, 'id'> : never) : never;

export type Choice =
  | { kind: 'MULLIGAN'; discard: number[] }
  | { kind: 'CLOCK'; card: number | null }
  | { kind: 'MAIN'; action: MainAction }
  | { kind: 'CLIMAX'; card: number | null }
  | { kind: 'LEVEL_UP'; card: number }
  | { kind: 'HAND_LIMIT'; discard: number[] }
  | { kind: 'RULE_ACTION_ORDER'; first: RuleActionKind };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** An array of distinct ids, all taken from `allowed`. */
function isDistinctSubset(value: unknown, allowed: readonly number[]): value is number[] {
  if (!Array.isArray(value)) return false;
  if (!value.every((id) => typeof id === 'number' && allowed.includes(id))) return false;
  return new Set(value).size === value.length;
}

export function sameMainAction(a: MainAction, b: MainAction): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'PLAY_CHARACTER':
      return b.type === 'PLAY_CHARACTER' && a.card === b.card && a.slot === b.slot;
    case 'PLAY_EVENT':
      return b.type === 'PLAY_EVENT' && a.card === b.card;
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
      if (choice.card === null) return null;
      return typeof choice.card === 'number' && decision.cards.includes(choice.card)
        ? null
        : 'card must be null or one of the offered cards';
    case 'MAIN': {
      const action = choice.action;
      if (!isRecord(action) || typeof action.type !== 'string') return 'action is missing';
      const legal = decision.actions.some((candidate) => sameMainAction(candidate, action as MainAction));
      return legal ? null : 'That action is not legal now';
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
  }
}
