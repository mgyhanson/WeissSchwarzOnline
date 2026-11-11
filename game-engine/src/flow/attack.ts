/**
 * The attack phase (CR-7).
 *
 * One ATTACK_PHASE frame runs the whole phase: any number of attack
 * sub-phases (declaration, trigger, counter, damage, battle), then the
 * encore step.
 *
 * Not expressible in ability data yet: the trigger condition "at the end of
 * the attack" (CR-7.5.1.4, CR-7.6.1.5). Its check timing is in place.
 */

import { greatPerformer } from '../abilities/query';
import type { AttackStepName } from '../abilities/types';
import type { AttackOption } from '../decisions';
import type { Ctx } from '../moves';
import { moveCard, setOrientation } from '../moves';
import { listBackups, listPlayableCounters, playBackup, playCounter } from '../play';
import { getDef, getInstance } from '../state';
import { addModifier, getCardLevel, getPower, getSoul } from '../stats';
import type { CardInstance, GameState, PlayerId, TriggerIcon } from '../types';
import { SLOTS, opponentOf } from '../types';
import { FRONT_SLOTS, facingSlot } from '../zones';
import { attackerInstance, characterInSlot, defenderInstance } from './attack-state';
import { ask, emit, findObject, popFrame, pushCheckTiming, pushFrame, takeAnswer, topOf } from './core';
import { pushDamage } from './damage';
import type { Frame } from './frames';

type AttackFrame = Extract<Frame, { kind: 'ATTACK_PHASE' }>;

/**
 * CR-7.2.1.3.1: the attacks the turn player can declare. A standing
 * character in the front row can attack (CR-7.2.1.3.1.1); with no opposing
 * character facing it the attack is a direct attack, otherwise the player
 * chooses between a front and a side attack (CR-7.2.1.4).
 */
export function listAttackOptions(state: GameState): AttackOption[] {
  const turn = state.turn;
  if (!turn) return [];
  // CR-7.2.1.3.1.2: on the first turn of the first player only one attack may be made.
  if (turn.number === 1 && turn.attackCount >= 1) return [];

  const player = turn.player;
  const options: AttackOption[] = [];
  // CR-10.6.2 大活躍: every attack is instead a front attack on that character.
  const forced = greatPerformer(state, opponentOf(player));
  for (const slot of FRONT_SLOTS) {
    const attacker = characterInSlot(state, player, slot);
    if (!attacker || attacker.orientation !== 'STAND') continue;
    if (forced) {
      options.push({ attacker: attacker.objectId, type: 'FRONT' });
      continue;
    }
    const facing = facingSlot(slot);
    const defender = facing ? characterInSlot(state, opponentOf(player), facing) : null;
    if (defender) {
      options.push({ attacker: attacker.objectId, type: 'FRONT' }, { attacker: attacker.objectId, type: 'SIDE' });
    } else {
      options.push({ attacker: attacker.objectId, type: 'DIRECT' });
    }
  }
  return options;
}

function declareAttack(ctx: Ctx, player: PlayerId, option: AttackOption): void {
  const state = ctx.state;
  const attacker = findObject(state, option.attacker);
  if (attacker.location.zone !== 'stage') throw new Error('Engine bug: the attacker is not on the stage');
  const slot = attacker.location.slot;
  const forced = greatPerformer(state, opponentOf(player));
  // CR-10.6.2: with 大活躍 the defender is that character, wherever the attacker stands.
  const facing = forced ? 'FC' : facingSlot(slot);
  const defender = forced ?? (facing ? characterInSlot(state, opponentOf(player), facing) : null);

  // CR-7.2.1.4: the soul changes below last for the turn, and stay as they
  // are even if the facing character changes afterwards (CR-7.2.1.4.3).
  if (option.type === 'DIRECT') {
    // CR-7.2.1.4.1
    addModifier(state, attacker.objectId, 'SOUL', 1);
  } else if (option.type === 'SIDE' && defender) {
    // CR-7.2.1.4.2: minus one soul per level of the facing character.
    const level = getCardLevel(state, defender.instanceId);
    if (level > 0) addModifier(state, attacker.objectId, 'SOUL', -level);
  }

  // CR-7.2.1.5
  state.attack = {
    player,
    type: option.type,
    attackerObjectId: attacker.objectId,
    attackerSlot: slot,
    defenderObjectId: option.type === 'FRONT' && defender ? defender.objectId : null,
    defenderSlot: option.type === 'FRONT' && defender && facing ? facing : null,
  };
  (state.turn as NonNullable<GameState['turn']>).attackCount++;
  emit(ctx, {
    type: 'ATTACK_DECLARED',
    player,
    attackType: option.type,
    attackerObjectId: attacker.objectId,
    attackerSlot: slot,
    defenderObjectId: state.attack.defenderObjectId,
  });

  // CR-7.2.1.5.3
  setOrientation(ctx, attacker.instanceId, 'REST');
}

/** CR-7.7.1.2 / 7.7.1.3: the reversed characters on a player's stage. */
function reversedCharacters(state: GameState, player: PlayerId): CardInstance[] {
  return SLOTS.flatMap((slot) => state.zones[player].stage[slot])
    .map((id) => getInstance(state, id))
    .filter((inst) => inst.orientation === 'REVERSE');
}

/** Puts a reversed character into its owner's waiting room. */
function removeReversed(ctx: Ctx, inst: CardInstance): void {
  moveCard(ctx, inst.instanceId, { player: inst.owner, zone: 'waitingRoom' }, { reason: 'ENCORE_STEP' });
}

/**
 * One player's part of the encore step: with no reversed character nothing
 * happens and false is returned; with exactly one it is removed; with
 * several the player is asked which one. Which characters are reversed is
 * public, so not asking about a single one reveals nothing.
 */
function encoreFor(ctx: Ctx, frame: AttackFrame, player: PlayerId, answerStep: AttackFrame['step']): boolean {
  const reversed = reversedCharacters(ctx.state, player);
  if (reversed.length === 0) return false;
  if (reversed.length === 1) {
    // "If they do, a check timing occurs, and after it CR-7.7.1.2 is performed again."
    frame.step = 'ENCORE_TURN_PLAYER';
    pushCheckTiming(ctx);
    removeReversed(ctx, reversed[0]!);
    return true;
  }
  frame.step = answerStep;
  ask(ctx, { kind: 'SELECT_CARDS', player, prompt: 'ENCORE_STEP', cards: reversed.map((inst) => inst.objectId), min: 1, max: 1 });
  return true;
}

function encoreAnswer(ctx: Ctx, frame: AttackFrame): void {
  const chosen = findObject(ctx.state, takeAnswer(ctx, 'SELECT_CARDS').cards[0] as number);
  frame.step = 'ENCORE_TURN_PLAYER';
  pushCheckTiming(ctx);
  removeReversed(ctx, chosen);
}

function beginStep(ctx: Ctx, player: PlayerId, step: AttackStepName): void {
  emit(ctx, { type: 'STEP_STARTED', player, step });
}

export function stepAttackPhase(ctx: Ctx, frame: AttackFrame): void {
  const state = ctx.state;
  const turn = state.turn;
  if (!turn) throw new Error('Engine bug: attack phase without a turn');
  const player = turn.player;
  const opponent = opponentOf(player);

  switch (frame.step) {
    // ----- Attack declaration step (CR-7.2) --------------------------------
    case 'START':
      // CR-7.2.1.1: first declaration step of the turn: "at the beginning of
      // the attack phase" triggers (STEP 4d), then a check timing.
      frame.step = 'DECLARE_START';
      pushCheckTiming(ctx);
      return;

    case 'DECLARE_START':
      // CR-7.2.1.2
      beginStep(ctx, player, 'ATTACK_DECLARATION');
      frame.step = 'DECLARE_ASK';
      pushCheckTiming(ctx);
      return;

    case 'DECLARE_ASK': {
      // CR-7.2.1.3. CR-7.2.1.3.1.3: with no character able to attack, the
      // only option is to end the attacks. Which characters can attack is
      // public, so this is done without a question.
      const attacks = listAttackOptions(state);
      if (attacks.length === 0) {
        frame.step = 'ENCORE_START';
        return;
      }
      frame.step = 'DECLARE_ANSWER';
      ask(ctx, { kind: 'ATTACK', player, attacks });
      return;
    }

    case 'DECLARE_ANSWER': {
      const { attack } = takeAnswer(ctx, 'ATTACK');
      if (attack === null) {
        // CR-7.2.1.3.2: ending the attacks leads straight to the encore step.
        frame.step = 'ENCORE_START';
        return;
      }
      // CR-7.2.1.6: check timing, then the trigger step.
      frame.step = 'TRIGGER_START';
      pushCheckTiming(ctx);
      declareAttack(ctx, player, attack);
      return;
    }

    // ----- Trigger step (CR-7.3) -------------------------------------------
    case 'TRIGGER_START':
      // CR-7.3.1.1
      beginStep(ctx, player, 'TRIGGER');
      frame.step = 'TRIGGER_REVEAL';
      pushCheckTiming(ctx);
      return;

    case 'TRIGGER_REVEAL': {
      // CR-7.3.1.2: the top card of the turn player's deck goes face up to
      // the resolution zone. The icons it has at this moment are the ones
      // that will be executed (CR-7.3.1.2.2).
      const top = topOf(state.zones[player].deck);
      if (top === undefined) {
        // No card to check (CR-1.3.2).
        frame.icons = [];
        frame.triggerObjectId = null;
        frame.step = 'TRIGGER_END';
        return;
      }
      frame.step = 'TRIGGER_ICONS';
      moveCard(ctx, top, { player, zone: 'resolution' }, { reason: 'TRIGGER_CHECK' });
      const def = getDef(state, top);
      frame.icons = [...def.triggers];
      frame.triggerObjectId = getInstance(state, top).objectId;
      emit(ctx, { type: 'TRIGGER_CHECK', player, cardId: def.cardId, icons: [...def.triggers] });
      return;
    }

    case 'TRIGGER_ICONS': {
      if (frame.icons.length === 0 || frame.triggerObjectId === null) {
        frame.step = 'TRIGGER_STOCK';
        return;
      }
      // CR-7.3.1.2.1: several icons are executed in any order the player likes.
      const distinct = [...new Set(frame.icons)];
      if (distinct.length > 1) {
        frame.step = 'TRIGGER_ORDER_ANSWER';
        ask(ctx, { kind: 'SELECT_OPTION', player, prompt: 'TRIGGER_ORDER', options: distinct });
        return;
      }
      const icon = frame.icons.shift() as TriggerIcon;
      pushFrame(ctx, { kind: 'TRIGGER_ICON', icon, player, card: frame.triggerObjectId, step: 0, picked: null, revealed: [] });
      return;
    }

    case 'TRIGGER_ORDER_ANSWER': {
      const icon = takeAnswer(ctx, 'SELECT_OPTION').option as TriggerIcon;
      frame.icons.splice(frame.icons.indexOf(icon), 1);
      frame.step = 'TRIGGER_ICONS';
      pushFrame(ctx, { kind: 'TRIGGER_ICON', icon, player, card: frame.triggerObjectId as number, step: 0, picked: null, revealed: [] });
      return;
    }

    case 'TRIGGER_STOCK': {
      // CR-7.3.1.2.3: the card goes face down into the stock, unless an icon
      // already moved it elsewhere (CR-4.14.2.8.1, CR-4.14.2.12.1).
      frame.step = 'TRIGGER_END';
      const card = state.instances.find((inst) => inst.objectId === frame.triggerObjectId);
      frame.triggerObjectId = null;
      if (card && card.location.zone === 'resolution') {
        moveCard(ctx, card.instanceId, { player, zone: 'stock' }, { reason: 'TRIGGER_CHECK' });
      }
      return;
    }

    case 'TRIGGER_END':
      // CR-7.3.1.3: check timing; then the counter step for a front attack,
      // otherwise the damage step.
      frame.step = state.attack?.type === 'FRONT' ? 'COUNTER_START' : 'DAMAGE_START';
      pushCheckTiming(ctx);
      return;

    // ----- Counter step (CR-7.4), front attacks only -----------------------
    case 'COUNTER_START':
      // CR-7.4.1.1; CR-7.4.1.2: play timing for the opponent, preceded by
      // its check timing.
      beginStep(ctx, player, 'COUNTER');
      frame.step = 'COUNTER_ASK';
      pushCheckTiming(ctx);
      return;

    case 'COUNTER_ASK':
      // Always asked: whether the defending player holds a usable counter is hidden.
      frame.step = 'COUNTER_ANSWER';
      ask(ctx, { kind: 'COUNTER', player: opponent, cards: listPlayableCounters(state, opponent), backups: listBackups(state, opponent) });
      return;

    case 'COUNTER_ANSWER': {
      const { card, ability } = takeAnswer(ctx, 'COUNTER');
      // CR-7.4.1.2.2: no second play timing. CR-7.4.1.3: check timing, then the damage step.
      frame.step = 'DAMAGE_START';
      pushCheckTiming(ctx);
      if (card !== null && ability !== undefined) playBackup(ctx, opponent, card, ability);
      else if (card !== null) playCounter(ctx, opponent, card);
      return;
    }

    // ----- Damage step (CR-7.5) --------------------------------------------
    case 'DAMAGE_START':
      // CR-7.5.1.1
      beginStep(ctx, player, 'DAMAGE');
      frame.step = 'DAMAGE_DEAL';
      pushCheckTiming(ctx);
      return;

    case 'DAMAGE_DEAL': {
      // CR-7.5.1.2: the attacking character deals damage equal to its soul.
      // No attacker any more: no damage (CR-7.5.1.2.2). Soul 0 or less: no
      // damage at all, handled by pushDamage (CR-7.5.1.2.1).
      frame.step = 'DAMAGE_END';
      const attacker = attackerInstance(state);
      if (attacker) pushDamage(ctx, opponent, getSoul(state, attacker.instanceId), attacker.objectId);
      return;
    }

    case 'DAMAGE_END':
      // CR-7.5.1.3: check timing; then the battle step for a front attack.
      frame.step = state.attack?.type === 'FRONT' ? 'BATTLE_START' : 'ATTACK_END';
      pushCheckTiming(ctx);
      return;

    // ----- Battle step (CR-7.6), front attacks only ------------------------
    case 'BATTLE_START':
      // CR-7.6.1.1
      beginStep(ctx, player, 'BATTLE');
      frame.step = 'BATTLE_COMPARE';
      pushCheckTiming(ctx);
      return;

    case 'BATTLE_COMPARE': {
      // CR-7.6.1.2: the character with less power becomes reversed; with
      // equal power both do. CR-7.6.1.3: no comparison unless both are still there.
      const attacker = attackerInstance(state);
      const defender = defenderInstance(state);
      if (attacker && defender) {
        const attackerPower = getPower(state, attacker.instanceId);
        const defenderPower = getPower(state, defender.instanceId);
        if (attackerPower <= defenderPower) setOrientation(ctx, attacker.instanceId, 'REVERSE');
        if (defenderPower <= attackerPower) setOrientation(ctx, defender.instanceId, 'REVERSE');
      }
      // CR-7.6.1.4
      frame.step = 'ATTACK_END';
      pushCheckTiming(ctx);
      return;
    }

    case 'ATTACK_END':
      // CR-7.5.1.4 / CR-7.6.1.5: "at the end of the attack" triggers
      // (STEP 4d), then a check timing; the sub-phase ends.
      frame.step = 'ATTACK_CLEANUP';
      pushCheckTiming(ctx);
      return;

    case 'ATTACK_CLEANUP':
      state.attack = null;
      frame.step = 'DECLARE_START';
      return;

    // ----- Encore step (CR-7.7) --------------------------------------------
    case 'ENCORE_START':
      // CR-7.7.1.1
      beginStep(ctx, player, 'ENCORE');
      frame.step = 'ENCORE_TURN_PLAYER';
      pushCheckTiming(ctx);
      return;

    case 'ENCORE_TURN_PLAYER':
      // CR-7.7.1.2: the turn player removes one of their reversed characters.
      if (!encoreFor(ctx, frame, player, 'ENCORE_TURN_PLAYER_ANSWER')) frame.step = 'ENCORE_OPPONENT';
      return;

    case 'ENCORE_TURN_PLAYER_ANSWER':
    case 'ENCORE_OPPONENT_ANSWER':
      encoreAnswer(ctx, frame);
      return;

    case 'ENCORE_OPPONENT':
      // CR-7.7.1.3: then the other player; afterwards back to CR-7.7.1.2.
      if (!encoreFor(ctx, frame, opponent, 'ENCORE_OPPONENT_ANSWER')) frame.step = 'ENCORE_FINISH';
      return;

    case 'ENCORE_FINISH':
      // CR-7.7.1.4
      frame.step = 'ENCORE_DONE';
      pushCheckTiming(ctx);
      return;

    case 'ENCORE_DONE':
      if (reversedCharacters(state, player).length > 0 || reversedCharacters(state, opponent).length > 0) {
        frame.step = 'ENCORE_TURN_PLAYER';
        return;
      }
      // The end phase follows (flow/turn.ts).
      popFrame(ctx, frame);
      return;
  }
}
