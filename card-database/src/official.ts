/**
 * Converting official card list data into the printed information the
 * engine uses (CR-2). Anything it does not recognise is an error, so a new
 * set cannot slip in with a misread field.
 */

import type { CardDef, CardKind, TriggerIcon } from '@wso/game-engine';
import type { OfficialCard } from './types';

const KINDS: Record<string, CardKind> = { '2': 'CHARACTER', '3': 'EVENT', '4': 'CLIMAX' };

const COLORS = new Set(['yellow', 'green', 'red', 'blue', 'purple']);

/**
 * Trigger icon images of the official card list. Only icons whose meaning
 * was confirmed from reminder text on cards in the database are listed:
 *  - salvage.gif: SY/W08-T10 「このカードがトリガーした時、あなたは自分の控え室のキャラを1枚選び、手札に戻してよい」 = CR-4.14.2.5 カムバック
 *  - bounce.gif: 5HY/W83-T12 「…あなたは相手のキャラを1枚選び、手札に戻してよい」 = CR-4.14.2.3 リターン
 *  - soul.gif: the soul icon, also used for the soul value (CR-2.10.2, CR-4.14.2.2)
 * Other icons must be added here, with their evidence, when a set needs them.
 */
const TRIGGER_ICONS: Record<string, TriggerIcon> = {
  'soul.gif': 'SOUL',
  'salvage.gif': 'COMEBACK',
  'bounce.gif': 'RETURN',
};

function icons(field: string): string[] {
  return [...field.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1] as string);
}

function numberOrNull(field: string, what: string, no: string): number | null {
  if (field === '-' || field === '') return null;
  if (!/^\d+$/.test(field)) throw new Error(`${no}: unreadable ${what} "${field}"`);
  return Number(field);
}

/** CR-2.8.2: the counter icon; the card list shows it as 【カウンター】 in the text. */
export function hasCounterIcon(card: OfficialCard): boolean {
  return card.text.includes('【カウンター】');
}

/** The card text as plain lines, for display and for comparing with ability data. */
export function plainText(card: OfficialCard): string {
  return card.text === '-' ? '' : card.text.replace(/<br\s*\/?>/g, '\n');
}

export function toCardDef(card: OfficialCard): CardDef {
  const kind = KINDS[card.kind];
  if (!kind) throw new Error(`${card.no}: unknown card kind "${card.kind}"`);

  const colorIcons = icons(card.color);
  if (colorIcons.length !== 1 || !COLORS.has(colorIcons[0]!.replace('.gif', ''))) {
    throw new Error(`${card.no}: unreadable colour "${card.color}"`);
  }

  const soulIcons = icons(card.soul);
  if (soulIcons.some((icon) => icon !== 'soul.gif')) throw new Error(`${card.no}: unreadable soul "${card.soul}"`);

  const triggers = card.trigger === '-' ? [] : icons(card.trigger).map((icon) => {
    const mapped = TRIGGER_ICONS[icon];
    if (!mapped) throw new Error(`${card.no}: trigger icon "${icon}" has not been verified yet (see TRIGGER_ICONS)`);
    return mapped;
  });

  const isCharacter = kind === 'CHARACTER';
  return {
    cardId: card.no,
    name: card.name,
    kind,
    color: colorIcons[0]!.replace('.gif', ''),
    level: kind === 'CLIMAX' ? null : numberOrNull(card.level, 'level', card.no),
    cost: kind === 'CLIMAX' ? null : numberOrNull(card.cost, 'cost', card.no),
    power: isCharacter ? numberOrNull(card.power, 'power', card.no) : null,
    soul: isCharacter ? soulIcons.length : null,
    traits: isCharacter ? card.traits.filter((trait) => trait !== '' && trait !== '-') : [],
    triggers,
    counter: hasCounterIcon(card),
  };
}
