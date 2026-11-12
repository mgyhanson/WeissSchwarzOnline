/**
 * Numbers describing a position from one player's view, used by the
 * learned evaluation (evaluate.ts). Public information only.
 */

import { type PlayerId, type PlayerView, opponentOf } from '@wso/game-engine';
import { BACK, FRONT, damageTaken, stageCard } from './knowledge';

export const FEATURE_NAMES = [
  'bias',
  'damageMe',
  'damageOpp',
  'dangerMe',
  'dangerOpp',
  'handMe',
  'handOpp',
  'stockMe',
  'stockOpp',
  'frontPowerMe',
  'frontPowerOpp',
  'frontSoulMe',
  'frontSoulOpp',
  'frontCountMe',
  'frontCountOpp',
  'backCountMe',
  'backCountOpp',
  'stageLevelMe',
  'stageLevelOpp',
  'deckMe',
  'deckOpp',
  'myTurn',
] as const;

function side(view: PlayerView, player: PlayerId) {
  let frontPower = 0;
  let frontSoul = 0;
  let frontCount = 0;
  let backCount = 0;
  let stageLevel = 0;
  for (const slot of FRONT) {
    const c = stageCard(view, player, slot);
    if (!c || c.card.orientation === 'REVERSE') continue;
    frontPower += c.power / 1000;
    frontSoul += c.soul;
    frontCount++;
    stageLevel += c.level;
  }
  for (const slot of BACK) {
    const c = stageCard(view, player, slot);
    if (!c || c.card.orientation === 'REVERSE') continue;
    backCount++;
    stageLevel += c.level;
  }
  const damage = Math.min(damageTaken(view, player), 27);
  const s = view.sides[player];
  return {
    damage,
    danger: Math.max(0, damage - 20),
    hand: Math.min(s.hand.length, 10),
    stock: Math.min(s.stock.length, 12),
    frontPower,
    frontSoul,
    frontCount,
    backCount,
    stageLevel,
    deck: Math.min(s.deck.length, 50) / 10,
  };
}

export function features(view: PlayerView): number[] {
  const me = side(view, view.viewer);
  const opp = side(view, opponentOf(view.viewer));
  return [
    1,
    me.damage,
    opp.damage,
    me.danger,
    opp.danger,
    me.hand,
    opp.hand,
    me.stock,
    opp.stock,
    me.frontPower,
    opp.frontPower,
    me.frontSoul,
    opp.frontSoul,
    me.frontCount,
    opp.frontCount,
    me.backCount,
    opp.backCount,
    me.stageLevel,
    opp.stageLevel,
    me.deck,
    opp.deck,
    view.turn?.player === view.viewer ? 1 : 0,
  ];
}
