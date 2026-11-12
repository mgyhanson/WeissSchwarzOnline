/** Searching and filtering the card list. Pure functions over CardInfo. */

import type { TriggerIcon } from '@wso/game-engine';
import type { CardInfo } from './cards';

export interface CardFilter {
  text: string;
  set: string;
  kind: '' | CardInfo['kind'];
  color: string;
  /** Exact level; '' for any. */
  level: string;
  cost: string;
  soul: string;
  /** Minimum power; '' for any. */
  powerMin: string;
  trigger: '' | TriggerIcon | 'NONE';
  support: '' | CardInfo['support'];
}

export const NO_FILTER: CardFilter = { text: '', set: '', kind: '', color: '', level: '', cost: '', soul: '', powerMin: '', trigger: '', support: '' };

/** Lower-case text a search can match: name, number, traits, card text, Chinese explanation. */
function haystack(card: CardInfo): string {
  return [card.name, card.cardId, ...card.traits, ...card.text, card.explanation].join('\n').toLowerCase();
}

export function matches(card: CardInfo, f: CardFilter): boolean {
  if (f.text.trim() && !f.text.trim().toLowerCase().split(/\s+/).every((word) => haystack(card).includes(word))) return false;
  if (f.set && card.set !== f.set) return false;
  if (f.kind && card.kind !== f.kind) return false;
  if (f.color && card.color !== f.color) return false;
  if (f.level !== '' && card.level !== Number(f.level)) return false;
  if (f.cost !== '' && card.cost !== Number(f.cost)) return false;
  if (f.soul !== '' && card.soul !== Number(f.soul)) return false;
  if (f.powerMin !== '' && (card.power ?? -1) < Number(f.powerMin)) return false;
  if (f.trigger === 'NONE' && card.triggers.length > 0) return false;
  if (f.trigger && f.trigger !== 'NONE' && !card.triggers.includes(f.trigger)) return false;
  if (f.support && card.support !== f.support) return false;
  return true;
}
