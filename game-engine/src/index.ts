/**
 * Public surface of the rules engine.
 *
 * Running a game: createGame, getPendingDecision, submitChoice, resign and
 * getPlayerView (see game.ts and view.ts). The other exports are building
 * blocks used by tests and, later, by the ability engine.
 */

export * from './types';
export * from './events';
export * from './rng';
export * from './zones';
export * from './state';
export * from './visibility';
export * from './moves';
export * from './view';
export * from './invariants';
export * from './decisions';
export * from './abilities/types';
export { activeSources, continuousTotal, evalCondition, matchesFilter } from './abilities/query';
export { canPayCost } from './abilities/effects';
export * from './stats';
export * from './play';
export * from './game';
export type { Frame, FrameKind, TurnStep } from './flow/frames';
export { OPENING_HAND_SIZE } from './flow/setup';
export { isLevelUpDue, isRefreshDue, losingCondition } from './flow/rule-actions';
export type { AttackStep } from './flow/frames';
export { listAttackOptions } from './flow/attack';
export { attackerInstance, defenderInstance } from './flow/attack-state';
