/**
 * 練習對手: a simple rule-of-thumb opponent so that STEP 7 can be played
 * before the real AI of STEP 8 exists. It is not that AI.
 *
 * It decides from its own PlayerView and the decision only, i.e. from
 * exactly what a human in its seat would see. It never gets the game state.
 * Printed card data it uses is public information.
 */

import type { AttackOption, Choice, Decision, MainAction, PlayerView, SlotId } from '@wso/game-engine';
import { cardInfo } from '../model/cards';
import { cardInSlot, findCard, levelOf } from '../model/view';

const FRONT: readonly SlotId[] = ['FL', 'FC', 'FR'];

/** The opponent's slot in front of one of our front slots (the board is mirrored). */
const FACING: Record<string, SlotId> = { FL: 'FR', FC: 'FC', FR: 'FL' };

function cardIdOf(view: PlayerView, objectId: number): string | null {
  return findCard(view, objectId)?.card.cardId ?? null;
}

function levelOfCard(view: PlayerView, objectId: number): number {
  const id = cardIdOf(view, objectId);
  return id ? (cardInfo(id).level ?? 0) : 0;
}

function isClimax(view: PlayerView, objectId: number): boolean {
  const id = cardIdOf(view, objectId);
  return id ? cardInfo(id).kind === 'CLIMAX' : false;
}

/** Lower is more expendable: extra climaxes first, then the highest-level cards. */
function keepValue(view: PlayerView, objectId: number, climaxesSoFar: number): number {
  if (isClimax(view, objectId)) return climaxesSoFar > 0 ? -10 : 5;
  return 10 - levelOfCard(view, objectId);
}

function cheapest(view: PlayerView, cards: readonly number[], count: number): number[] {
  let climaxes = 0;
  const scored = cards.map((id) => {
    const value = keepValue(view, id, climaxes);
    if (isClimax(view, id)) climaxes++;
    return { id, value };
  });
  return scored.sort((a, b) => a.value - b.value).slice(0, count).map((s) => s.id);
}

function power(view: PlayerView, objectId: number | undefined): number {
  return objectId === undefined ? 0 : (view.stats[objectId]?.power ?? 0);
}

function mainScore(view: PlayerView, action: MainAction, activatedThisTurn: number): number {
  const me = view.viewer;
  switch (action.type) {
    case 'PLAY_CHARACTER': {
      if (cardInSlot(view, me, action.slot)) return -1;
      const level = levelOfCard(view, action.card);
      return (FRONT.includes(action.slot) ? 30 : 20) + level * 3 + (cardIdOf(view, action.card) ? (cardInfo(cardIdOf(view, action.card)!).power ?? 0) / 1000 : 0);
    }
    case 'PLAY_EVENT':
      return 10;
    case 'ACTIVATE':
      return activatedThisTurn < 2 ? 5 : -1;
    case 'SWAP':
    case 'PASS':
      return 0;
  }
}

function attackScore(view: PlayerView, option: AttackOption): number {
  const slot = findCard(view, option.attacker)?.slot;
  const opponent = view.viewer === 0 ? 1 : 0;
  const facing = slot ? cardInSlot(view, opponent, FACING[slot]!) : null;
  switch (option.type) {
    case 'DIRECT':
      return 3;
    case 'FRONT': {
      const mine = power(view, option.attacker);
      const theirs = power(view, facing?.objectId);
      return mine > theirs ? 4 : mine === theirs ? 2 : 0.5;
    }
    case 'SIDE':
      return 1.5;
  }
}

function best<T>(items: readonly T[], score: (item: T) => number): T | undefined {
  let top: T | undefined;
  let topScore = -Infinity;
  for (const item of items) {
    const s = score(item);
    if (s > topScore) {
      top = item;
      topScore = s;
    }
  }
  return top;
}

export interface PracticeBot {
  choose(view: PlayerView, decision: Decision): Choice;
}

export function createPracticeBot(): PracticeBot {
  let activations = { turn: -1, count: 0 };

  return {
    choose(view, decision) {
      const me = view.viewer;
      switch (decision.kind) {
        case 'MULLIGAN': {
          let climaxes = 0;
          const discard = decision.cards.filter((id) => {
            if (isClimax(view, id)) return climaxes++ > 0;
            return levelOfCard(view, id) >= 2;
          });
          return { kind: 'MULLIGAN', discard };
        }
        case 'CLOCK': {
          const clock = view.sides[me].clock.length;
          if (clock >= 5 || levelOf(view, me) >= 3 || decision.cards.length < 3) return { kind: 'CLOCK', card: null };
          return { kind: 'CLOCK', card: cheapest(view, decision.cards, 1)[0] ?? null };
        }
        case 'MAIN': {
          const turn = view.turn?.number ?? 0;
          if (activations.turn !== turn) activations = { turn, count: 0 };
          const action = best(decision.actions, (a) => mainScore(view, a, activations.count));
          if (!action || mainScore(view, action, activations.count) <= 0) return { kind: 'MAIN', action: { type: 'PASS' } };
          if (action.type === 'ACTIVATE') activations.count++;
          return { kind: 'MAIN', action };
        }
        case 'CLIMAX': {
          const characters = FRONT.filter((slot) => cardInSlot(view, me, slot)).length;
          return { kind: 'CLIMAX', card: characters >= 2 ? (decision.cards[0] ?? null) : null };
        }
        case 'ATTACK': {
          const option = best(decision.attacks, (o) => attackScore(view, o));
          return { kind: 'ATTACK', attack: option ?? null };
        }
        case 'COUNTER': {
          const backup = decision.backups[0];
          if (backup) return { kind: 'COUNTER', card: backup.card, ability: backup.ability };
          return { kind: 'COUNTER', card: decision.cards[0] ?? null };
        }
        case 'LEVEL_UP': {
          const card = decision.cards.find((id) => !isClimax(view, id)) ?? decision.cards[0]!;
          return { kind: 'LEVEL_UP', card };
        }
        case 'HAND_LIMIT':
          return { kind: 'HAND_LIMIT', discard: cheapest(view, decision.cards, decision.count) };
        case 'RULE_ACTION_ORDER':
          return { kind: 'RULE_ACTION_ORDER', first: decision.options[0]! };
        case 'CHOOSE_ABILITY':
          return { kind: 'CHOOSE_ABILITY', id: decision.abilities[0]!.id };
        case 'CONFIRM':
          return { kind: 'CONFIRM', accept: true };
        case 'SELECT_CARDS': {
          const count = decision.prompt === 'COST_DISCARD' ? decision.min : Math.min(decision.max, decision.cards.length);
          const cards = decision.prompt === 'COST_DISCARD' ? cheapest(view, decision.cards, count) : decision.cards.slice(0, count);
          return { kind: 'SELECT_CARDS', cards };
        }
        case 'SELECT_SLOT': {
          const empty = decision.slots.find((slot) => !cardInSlot(view, me, slot));
          return { kind: 'SELECT_SLOT', slot: empty ?? decision.slots[0]! };
        }
        case 'SELECT_OPTION':
          return { kind: 'SELECT_OPTION', option: decision.options[0]! };
      }
    },
  };
}
