/**
 * The Beginner level: plays whatever it can, attacks whenever it can, and
 * picks targets at random. Decides from the decision alone.
 */

import { type Choice, type Decision, type PlayerView, type RngState, nextInt } from '@wso/game-engine';
import { stageCard } from './knowledge';

function pick<T>(rng: RngState, items: readonly T[]): T {
  return items[nextInt(rng, items.length)]!;
}

function some(rng: RngState, items: readonly number[], min: number, max: number): number[] {
  const pool = [...items];
  const count = min + nextInt(rng, Math.min(max, pool.length) - min + 1);
  const chosen: number[] = [];
  for (let i = 0; i < count; i++) chosen.push(pool.splice(nextInt(rng, pool.length), 1)[0]!);
  return chosen;
}

export function beginnerChoice(view: PlayerView, decision: Decision, rng: RngState): Choice {
  switch (decision.kind) {
    case 'MULLIGAN':
      return { kind: 'MULLIGAN', discard: [] };
    case 'CLOCK':
      return { kind: 'CLOCK', card: decision.cards.length > 0 && nextInt(rng, 2) === 0 ? pick(rng, decision.cards) : null };
    case 'MAIN': {
      // Characters into empty slots, and events; nothing else.
      const plays = decision.actions.filter(
        (a) => (a.type === 'PLAY_CHARACTER' && !stageCard(view, view.viewer, a.slot)) || a.type === 'PLAY_EVENT',
      );
      return { kind: 'MAIN', action: plays.length > 0 ? pick(rng, plays) : { type: 'PASS' } };
    }
    case 'CLIMAX':
      return { kind: 'CLIMAX', card: decision.cards.length > 0 ? pick(rng, decision.cards) : null };
    case 'ATTACK':
      return { kind: 'ATTACK', attack: decision.attacks.length > 0 ? pick(rng, decision.attacks) : null };
    case 'COUNTER': {
      const options: Choice[] = [
        { kind: 'COUNTER', card: null },
        ...decision.cards.map((card): Choice => ({ kind: 'COUNTER', card })),
        ...decision.backups.map((b): Choice => ({ kind: 'COUNTER', card: b.card, ability: b.ability })),
      ];
      return pick(rng, options);
    }
    case 'LEVEL_UP':
      return { kind: 'LEVEL_UP', card: pick(rng, decision.cards) };
    case 'HAND_LIMIT':
      return { kind: 'HAND_LIMIT', discard: some(rng, decision.cards, decision.count, decision.count) };
    case 'RULE_ACTION_ORDER':
      return { kind: 'RULE_ACTION_ORDER', first: decision.options[0]! };
    case 'CHOOSE_ABILITY':
      return { kind: 'CHOOSE_ABILITY', id: decision.abilities[0]!.id };
    case 'CONFIRM':
      return { kind: 'CONFIRM', accept: true };
    case 'SELECT_CARDS':
      return { kind: 'SELECT_CARDS', cards: some(rng, decision.cards, decision.min, decision.max) };
    case 'SELECT_SLOT':
      return { kind: 'SELECT_SLOT', slot: pick(rng, decision.slots) };
    case 'SELECT_OPTION':
      return { kind: 'SELECT_OPTION', option: pick(rng, decision.options) };
  }
}
