/**
 * Helpers shared by the ability tests that use synthetic cards
 * (abilities-batch-3, abilities-batch-5, ...).
 */

import { type CardDef, type Ctx, type Effect, type GameEvent, type GameState, type PlayerId, moveCards } from '../src/index';
import { type DefOverride, answer, card, oid, pending } from './helpers';

/** Ability lists and other changes for single cards: `${player}:${index}`. */
export function cards(map: Record<string, Partial<CardDef>>): DefOverride {
  return (p, i) => map[`${p}:${i}`];
}

export function noClimaxes(ctx: Ctx, player: PlayerId): void {
  moveCards(ctx, [42, 43, 44, 45, 46, 47, 48, 49].map((i) => card(player, i)), { player, zone: 'memory' });
}

export const moves = (events: GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'CARD_MOVED' ? [`${e.reason}:${e.from.zone}>${e.to.zone}`] : []));

export const activate = (state: GameState, instanceId: number, ability = 0) =>
  answer(state, { kind: 'MAIN', action: { type: 'ACTIVATE', card: oid(state, instanceId), ability } });

export const canActivate = (state: GameState): boolean => pending(state, 'MAIN').actions.some((a) => a.type === 'ACTIVATE');

export const attack = (state: GameState, instanceId: number, type: 'FRONT' | 'SIDE' | 'DIRECT' = 'FRONT') =>
  answer(state, { kind: 'ATTACK', attack: { attacker: oid(state, instanceId), type } });

export const DRAW_ONE: Effect[] = [{ do: 'DRAW', count: 1 }];

/** How many abilities of this card were played in these events. */
export const played = (events: GameEvent[], instanceId: number): number =>
  events.filter((e) => e.type === 'ABILITY_PLAYED' && e.instanceId === instanceId).length;
