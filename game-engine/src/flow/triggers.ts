/**
 * The actions of the trigger icons (CR-4.14.2).
 *
 * Each icon of a trigger check card is executed by one TRIGGER_ICON frame.
 * Wherever the rule says the player "may", the player is asked; a choice
 * that cannot be made at all (nothing to choose from, visibly to everyone)
 * is skipped without a question.
 */

import type { PromptId } from '../decisions';
import type { BatchMove, Ctx } from '../moves';
import { moveBatch, moveCard, revealCard } from '../moves';
import { getDef, getInstance } from '../state';
import { addModifier, getCardLevel, playerLevel } from '../stats';
import type { CardDef, CardInstance, GameState, PlayerId } from '../types';
import { SLOTS, opponentOf } from '../types';
import { stageSlot } from '../zones';
import { attackerInstance } from './attack-state';
import { ask, findObject, popFrame, pushFrame, takeAnswer, topOf } from './core';
import type { Frame } from './frames';

type IconFrame = Extract<Frame, { kind: 'TRIGGER_ICON' }>;

/** Object ids of the cards in a player's waiting room that satisfy a condition on their printed data. */
function waitingRoomCards(state: GameState, player: PlayerId, accept: (def: CardDef, instanceId: number) => boolean): number[] {
  return state.zones[player].waitingRoom
    .filter((id) => accept(getDef(state, id), id))
    .map((id) => getInstance(state, id).objectId);
}

/** The trigger check card, if it is still the object that was put into the resolution zone. */
function triggerCard(state: GameState, frame: IconFrame): CardInstance | null {
  const inst = state.instances.find((candidate) => candidate.objectId === frame.card);
  return inst && inst.location.zone === 'resolution' ? inst : null;
}

/** The card chosen in a "choose up to one" question, or null. */
function takeUpToOne(ctx: Ctx): CardInstance | null {
  const chosen = takeAnswer(ctx, 'SELECT_CARDS').cards[0];
  return chosen === undefined ? null : findObject(ctx.state, chosen);
}

/**
 * Icons of the form "you may choose one card in your waiting room that ...
 * and return it to your hand": comeback, gate and focus.
 */
function stepSalvage(ctx: Ctx, frame: IconFrame, prompt: PromptId, accept: (def: CardDef) => boolean): void {
  const { player } = frame;
  if (frame.step === 0) {
    const cards = waitingRoomCards(ctx.state, player, accept);
    if (cards.length === 0) {
      popFrame(ctx, frame);
      return;
    }
    frame.step = 1;
    ask(ctx, { kind: 'SELECT_CARDS', player, prompt, cards, min: 0, max: 1 });
    return;
  }
  const chosen = takeUpToOne(ctx);
  popFrame(ctx, frame);
  if (chosen) moveCard(ctx, chosen.instanceId, { player, zone: 'hand' }, { reason: 'TRIGGER' });
}

/**
 * "Reveal up to N cards from the top of your deck" (CR-3.2.3.1): before each
 * card the player may stop. The cards stay in the deck while revealed.
 * Returns true while the reveal phase is still going on.
 */
function stepRevealUpTo(ctx: Ctx, frame: IconFrame, limit: number, prompt: PromptId, askStep: number, answerStep: number): boolean {
  const state = ctx.state;
  const { player } = frame;
  const deck = state.zones[player].deck;

  if (frame.step === askStep) {
    // CR-3.2.3.3: with fewer cards in the deck, only those can be revealed.
    if (frame.revealed.length >= limit || frame.revealed.length >= deck.length) return false;
    frame.step = answerStep;
    ask(ctx, { kind: 'CONFIRM', player, prompt });
    return true;
  }
  if (frame.step === answerStep) {
    if (!takeAnswer(ctx, 'CONFIRM').accept) return false;
    const next = deck[deck.length - 1 - frame.revealed.length] as number;
    revealCard(ctx, next);
    frame.revealed.push(getInstance(state, next).objectId);
    frame.step = askStep;
    return true;
  }
  return false;
}

/** The revealed cards that are still revealed in the player's deck. */
function revealedInDeck(state: GameState, frame: IconFrame): CardInstance[] {
  return frame.revealed
    .map((objectId) => state.instances.find((inst) => inst.objectId === objectId))
    .filter((inst): inst is CardInstance => inst !== undefined && inst.location.zone === 'deck' && inst.revealed);
}

export function stepTriggerIcon(ctx: Ctx, frame: IconFrame): void {
  const state = ctx.state;
  const { player } = frame;
  const zones = state.zones[player];

  switch (frame.icon) {
    // CR-4.14.2.2: the attacking character gets soul +1 this turn. Mandatory.
    case 'SOUL': {
      const attacker = attackerInstance(state);
      if (attacker) addModifier(state, attacker.objectId, 'SOUL', 1);
      popFrame(ctx, frame);
      return;
    }

    // CR-4.14.2.3: may choose one of the opponent's characters and return it to its owner's hand.
    case 'RETURN': {
      if (frame.step === 0) {
        const opponent = state.zones[opponentOf(player)];
        const cards = SLOTS.flatMap((slot) => opponent.stage[slot])
          .filter((id) => getDef(state, id).kind === 'CHARACTER')
          .map((id) => getInstance(state, id).objectId);
        if (cards.length === 0) {
          popFrame(ctx, frame);
          return;
        }
        frame.step = 1;
        ask(ctx, { kind: 'SELECT_CARDS', player, prompt: 'TRIGGER_RETURN', cards, min: 0, max: 1 });
        return;
      }
      const chosen = takeUpToOne(ctx);
      popFrame(ctx, frame);
      if (chosen) moveCard(ctx, chosen.instanceId, { player: chosen.owner, zone: 'hand' }, { reason: 'TRIGGER' });
      return;
    }

    // CR-4.14.2.4: may put the top card of the deck into the stock.
    case 'POOL': {
      if (frame.step === 0) {
        if (zones.deck.length === 0) {
          popFrame(ctx, frame);
          return;
        }
        frame.step = 1;
        ask(ctx, { kind: 'CONFIRM', player, prompt: 'TRIGGER_POOL' });
        return;
      }
      const { accept } = takeAnswer(ctx, 'CONFIRM');
      popFrame(ctx, frame);
      const top = topOf(zones.deck);
      if (accept && top !== undefined) moveCard(ctx, top, { player, zone: 'stock' }, { reason: 'TRIGGER' });
      return;
    }

    // CR-4.14.2.5: may return one character card from the waiting room to hand.
    case 'COMEBACK':
      return stepSalvage(ctx, frame, 'TRIGGER_COMEBACK', (def) => def.kind === 'CHARACTER');

    // CR-4.14.2.6: may draw one card.
    case 'DRAW': {
      if (frame.step === 0) {
        if (zones.deck.length === 0) {
          popFrame(ctx, frame);
          return;
        }
        frame.step = 1;
        ask(ctx, { kind: 'CONFIRM', player, prompt: 'TRIGGER_DRAW' });
        return;
      }
      const { accept } = takeAnswer(ctx, 'CONFIRM');
      popFrame(ctx, frame);
      if (accept) pushFrame(ctx, { kind: 'DRAW', player, remaining: 1 });
      return;
    }

    // CR-4.14.2.7: creates "this turn, when the next damage dealt by the
    // current attacking character is cancelled, deal 1 damage to your
    // opponent". Mandatory. (CR-4.14.2.7.2 and .3 concern damage dealt to
    // oneself or to several players, which no implemented effect can cause yet.)
    case 'SHOT': {
      const attacker = attackerInstance(state);
      if (attacker) state.shotWatchers.push({ master: player, attackerObjectId: attacker.objectId });
      popFrame(ctx, frame);
      return;
    }

    // CR-4.14.2.8: this card returns to its owner's hand (mandatory); then
    // the player may put the top card of the deck into the stock.
    case 'TREASURE': {
      if (frame.step === 0) {
        frame.step = 1;
        const card = triggerCard(state, frame);
        if (card) moveCard(ctx, card.instanceId, { player: card.owner, zone: 'hand' }, { reason: 'TRIGGER' });
        return;
      }
      if (frame.step === 1) {
        if (zones.deck.length === 0) {
          popFrame(ctx, frame);
          return;
        }
        frame.step = 2;
        ask(ctx, { kind: 'CONFIRM', player, prompt: 'TRIGGER_TREASURE_STOCK' });
        return;
      }
      const { accept } = takeAnswer(ctx, 'CONFIRM');
      popFrame(ctx, frame);
      const top = topOf(zones.deck);
      if (accept && top !== undefined) moveCard(ctx, top, { player, zone: 'stock' }, { reason: 'TRIGGER' });
      return;
    }

    // CR-4.14.2.9: may return one climax card from the waiting room to hand.
    case 'GATE':
      return stepSalvage(ctx, frame, 'TRIGGER_GATE', (def) => def.kind === 'CLIMAX');

    // CR-4.14.2.10: may choose a character in the waiting room whose level
    // is at most the player's level + 1 and put it in any slot, rested.
    // CR-4.14.2.10.1: the slot may be occupied (CR-9.6.2 then applies).
    case 'STANDBY': {
      if (frame.step === 0) {
        const limit = playerLevel(state, player) + 1;
        const cards = waitingRoomCards(state, player, (def, id) => def.kind === 'CHARACTER' && getCardLevel(state, id) <= limit);
        if (cards.length === 0) {
          popFrame(ctx, frame);
          return;
        }
        frame.step = 1;
        ask(ctx, { kind: 'SELECT_CARDS', player, prompt: 'TRIGGER_STANDBY', cards, min: 0, max: 1 });
        return;
      }
      if (frame.step === 1) {
        const chosen = takeUpToOne(ctx);
        if (!chosen) {
          popFrame(ctx, frame);
          return;
        }
        frame.picked = chosen.objectId;
        frame.step = 2;
        ask(ctx, { kind: 'SELECT_SLOT', player, prompt: 'TRIGGER_STANDBY_SLOT', slots: [...SLOTS] });
        return;
      }
      const { slot } = takeAnswer(ctx, 'SELECT_SLOT');
      popFrame(ctx, frame);
      moveCard(ctx, findObject(state, frame.picked as number).instanceId, stageSlot(player, slot), {
        orientation: 'REST',
        reason: 'TRIGGER',
      });
      return;
    }

    // CR-4.14.2.11: may choose a character in the waiting room that has a
    // soul trigger icon and put it into the hand or the stock.
    case 'CHOICE': {
      if (frame.step === 0) {
        const cards = waitingRoomCards(state, player, (def) => def.kind === 'CHARACTER' && def.triggers.includes('SOUL'));
        if (cards.length === 0) {
          popFrame(ctx, frame);
          return;
        }
        frame.step = 1;
        ask(ctx, { kind: 'SELECT_CARDS', player, prompt: 'TRIGGER_CHOICE', cards, min: 0, max: 1 });
        return;
      }
      if (frame.step === 1) {
        const chosen = takeUpToOne(ctx);
        if (!chosen) {
          popFrame(ctx, frame);
          return;
        }
        frame.picked = chosen.objectId;
        frame.step = 2;
        ask(ctx, { kind: 'SELECT_OPTION', player, prompt: 'TRIGGER_CHOICE_DESTINATION', options: ['HAND', 'STOCK'] });
        return;
      }
      const { option } = takeAnswer(ctx, 'SELECT_OPTION');
      popFrame(ctx, frame);
      moveCard(ctx, findObject(state, frame.picked as number).instanceId, { player, zone: option === 'STOCK' ? 'stock' : 'hand' }, {
        reason: 'TRIGGER',
      });
      return;
    }

    // CR-4.14.2.12: this card goes to the waiting room (mandatory); reveal up
    // to two cards from the top of the deck; one of them goes to the stock,
    // then the other goes to the hand.
    case 'CHANCE': {
      if (frame.step === 0) {
        frame.step = 1;
        const card = triggerCard(state, frame);
        if (card) moveCard(ctx, card.instanceId, { player: card.owner, zone: 'waitingRoom' }, { reason: 'TRIGGER' });
        return;
      }
      if (frame.step === 1 || frame.step === 2) {
        if (stepRevealUpTo(ctx, frame, 2, 'TRIGGER_CHANCE_REVEAL', 1, 2)) return;
        frame.step = 3;
        return;
      }
      if (frame.step === 3) {
        const revealed = revealedInDeck(state, frame);
        if (revealed.length === 0) {
          popFrame(ctx, frame);
          return;
        }
        if (revealed.length === 1) {
          popFrame(ctx, frame);
          moveCard(ctx, revealed[0]!.instanceId, { player, zone: 'stock' }, { reason: 'TRIGGER' });
          return;
        }
        frame.step = 4;
        ask(ctx, {
          kind: 'SELECT_CARDS',
          player,
          prompt: 'TRIGGER_CHANCE_STOCK',
          cards: revealed.map((inst) => inst.objectId),
          min: 1,
          max: 1,
        });
        return;
      }
      if (frame.step === 4) {
        const toStock = findObject(state, takeAnswer(ctx, 'SELECT_CARDS').cards[0] as number);
        frame.step = 5;
        moveCard(ctx, toStock.instanceId, { player, zone: 'stock' }, { reason: 'TRIGGER' });
        return;
      }
      popFrame(ctx, frame);
      for (const inst of revealedInDeck(state, frame)) {
        moveCard(ctx, inst.instanceId, { player, zone: 'hand' }, { reason: 'TRIGGER' });
      }
      return;
    }

    // CR-4.14.2.13: reveal up to three cards from the top of the deck; may
    // add one character among them to the hand; the rest go to the waiting
    // room. CR-4.14.2.13.1: the cards are in the deck throughout, so no
    // refresh can happen in between; moving them all at once at the end lets
    // the engine loop perform a refresh afterwards if the deck is then empty.
    case 'DISCOVERY': {
      if (frame.step === 0 || frame.step === 1) {
        if (stepRevealUpTo(ctx, frame, 3, 'TRIGGER_DISCOVERY_REVEAL', 0, 1)) return;
        frame.step = 2;
        return;
      }
      const revealed = revealedInDeck(state, frame);
      if (frame.step === 2) {
        if (revealed.length === 0) {
          popFrame(ctx, frame);
          return;
        }
        const characters = revealed.filter((inst) => getDef(state, inst.instanceId).kind === 'CHARACTER');
        frame.step = 3;
        if (characters.length > 0) {
          ask(ctx, {
            kind: 'SELECT_CARDS',
            player,
            prompt: 'TRIGGER_DISCOVERY',
            cards: characters.map((inst) => inst.objectId),
            min: 0,
            max: 1,
          });
          return;
        }
        // No character to choose: fall through to the move without a question.
        frame.picked = null;
        frame.step = 4;
        return;
      }
      if (frame.step === 3) {
        frame.picked = takeAnswer(ctx, 'SELECT_CARDS').cards[0] ?? null;
        frame.step = 4;
        return;
      }
      popFrame(ctx, frame);
      const moves: BatchMove[] = revealed.map((inst) => ({
        instanceId: inst.instanceId,
        to: { player, zone: inst.objectId === frame.picked ? ('hand' as const) : ('waitingRoom' as const) },
        opts: { reason: 'TRIGGER' as const },
      }));
      moveBatch(ctx, moves);
      return;
    }

    // CR-4.14.2.14: may return one event, or one character of cost 0 or less,
    // from the waiting room to hand.
    case 'FOCUS':
      return stepSalvage(ctx, frame, 'TRIGGER_FOCUS', (def) => def.kind === 'EVENT' || (def.kind === 'CHARACTER' && (def.cost ?? 0) <= 0));
  }
}
