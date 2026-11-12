/**
 * Turns the events one seat received into presentation steps: what the
 * screen shows, in the order the engine did it.
 *
 * Input is only what the seat is allowed to have: GameEventView, already
 * redacted by the engine (redactEvent). A card's identity appears in a step
 * only when the event carried it, so nothing hidden can be shown. The
 * reveal kinds below are presentation categories of this client, not rules
 * terms.
 */

import type { AttackType, CardMovedView, GameEventView, MoveReason, Orientation, Phase, PlayerId, SlotId, TriggerIcon, ZoneRef } from '@wso/game-engine';

export type RevealKind = 'PRIVATE_DRAW' | 'TRIGGER_REVEAL' | 'DAMAGE_REVEAL' | 'PUBLIC_REVEAL';

/** A card in a step. `cardId` is null when this seat cannot see the card. */
export interface StepCard {
  cardId: string | null;
  /** Object id after the move, when the seat can see the card there. */
  objectId?: number;
}

interface Base {
  /** Sequence number of the first event of the step: stable, so a step is never shown twice. */
  seq: number;
}

export type Step = Base &
  (
    | { kind: 'DRAW'; player: PlayerId; cards: StepCard[]; reveal: RevealKind | null }
    | { kind: 'TRIGGER'; player: PlayerId; card: StepCard; icons: TriggerIcon[]; reveal: 'TRIGGER_REVEAL' }
    | {
        kind: 'DAMAGE';
        receiver: PlayerId;
        /** Cards turned over so far in this damage, in order. */
        cards: StepCard[];
        /** Known once the damage is over: its size and whether it was cancelled. */
        amount: number | null;
        cancelled: boolean | null;
        /** True when the damage was interrupted (e.g. by a refresh) and continues in a later step. */
        partial: boolean;
        reveal: 'DAMAGE_REVEAL';
      }
    | { kind: 'REVEAL'; player: PlayerId; cards: StepCard[]; reason: 'EFFECT' | 'SHOWN'; reveal: 'PUBLIC_REVEAL' }
    | { kind: 'MOVE'; from: ZoneRef; to: ZoneRef; reason: MoveReason; cards: StepCard[] }
    | { kind: 'ORIENT'; player: PlayerId; slot: SlotId; objectId: number; to: Orientation }
    | { kind: 'ATTACK'; player: PlayerId; slot: SlotId; attackType: AttackType; attacker: number; defender: number | null }
    | { kind: 'PLAY'; player: PlayerId; cardId: string; cardKind: 'CHARACTER' | 'EVENT' | 'CLIMAX'; slot?: SlotId }
    | { kind: 'ABILITY'; player: PlayerId; cardId: string; ability: number }
    | { kind: 'LEVEL_UP'; player: PlayerId; level: number; card: StepCard | null }
    | { kind: 'REFRESH'; player: PlayerId; cards: number; penalty: StepCard | null }
    | { kind: 'TURN'; player: PlayerId; turn: number }
    | { kind: 'PHASE'; player: PlayerId; phase: Phase }
    | { kind: 'END' }
  );

function sameZone(a: ZoneRef, b: ZoneRef): boolean {
  return a.player === b.player && a.zone === b.zone && (a.zone === 'stage' || a.zone === 'marker' ? a.slot === (b as typeof a).slot : true);
}

function stepCard(event: CardMovedView): StepCard {
  return { cardId: event.card?.cardId ?? null, ...(event.toObjectId !== undefined ? { objectId: event.toObjectId } : {}) };
}

/** Moves that belong to a step started elsewhere, so they are not shown again as plain moves. */
const ABSORBED: ReadonlySet<MoveReason> = new Set(['DAMAGE_CANCEL', 'MARKER_FOLLOW']);

export function toSteps(events: readonly GameEventView[], seat: PlayerId): Step[] {
  const steps: Step[] = [];
  let damage: Extract<Step, { kind: 'DAMAGE' }> | null = null;
  let refresh: { seq: number; player: PlayerId; cards: number; penalty: StepCard | null } | null = null;
  let levelUp: { seq: number; card: StepCard | null } | null = null;

  const last = () => steps[steps.length - 1];
  const closeDamage = (partial: boolean) => {
    if (damage) damage.partial = partial;
    damage = null;
  };

  for (const event of events) {
    if (event.type === 'CARD_MOVED') {
      const card = stepCard(event);
      switch (event.reason) {
        case 'DRAW': {
          closeDamage(true);
          const player = event.to.player;
          const prev = last();
          if (prev?.kind === 'DRAW' && prev.player === player) prev.cards.push(card);
          else steps.push({ seq: event.seq, kind: 'DRAW', player, cards: [card], reveal: player === seat ? 'PRIVATE_DRAW' : null });
          continue;
        }
        case 'TRIGGER_CHECK':
          // To the resolution zone: shown by the TRIGGER_CHECK event that follows. To stock: part of that step.
          continue;
        case 'DAMAGE': {
          if (event.to.zone === 'resolution') {
            if (!damage) {
              damage = { seq: event.seq, kind: 'DAMAGE', receiver: event.to.player, cards: [], amount: null, cancelled: null, partial: false, reveal: 'DAMAGE_REVEAL' };
              steps.push(damage);
            }
            damage.cards.push(card);
          }
          continue;
        }
        case 'REFRESH':
          closeDamage(true);
          refresh ??= { seq: event.seq, player: event.to.player, cards: 0, penalty: null };
          refresh.cards++;
          continue;
        case 'REFRESH_PENALTY':
          if (refresh) refresh.penalty = card;
          continue;
        case 'LEVEL_UP':
          levelUp ??= { seq: event.seq, card: null };
          if (event.to.zone === 'level') levelUp.card = card;
          continue;
        default:
          break;
      }
      if (ABSORBED.has(event.reason)) continue;
      closeDamage(true);
      // Cards an effect turns over into the resolution zone are shown to everyone (e.g. 集中).
      if (event.reason === 'EFFECT' && event.to.zone === 'resolution' && event.from.zone === 'deck') {
        const prev = last();
        if (prev?.kind === 'REVEAL' && prev.reason === 'EFFECT' && prev.player === event.to.player) prev.cards.push(card);
        else steps.push({ seq: event.seq, kind: 'REVEAL', player: event.to.player, cards: [card], reason: 'EFFECT', reveal: 'PUBLIC_REVEAL' });
        continue;
      }
      // Plain moves; simultaneous moves between the same zones form one step.
      const prev = last();
      if (prev?.kind === 'MOVE' && prev.reason === event.reason && sameZone(prev.from, event.from) && sameZone(prev.to, event.to)) prev.cards.push(card);
      else steps.push({ seq: event.seq, kind: 'MOVE', from: event.from, to: event.to, reason: event.reason, cards: [card] });
      continue;
    }

    switch (event.type) {
      case 'DAMAGE_DEALT': {
        // Close the damage started by the moves above (possibly continued after an interruption).
        const open = damage ?? [...steps].reverse().find((s): s is Extract<Step, { kind: 'DAMAGE' }> => s.kind === 'DAMAGE' && s.amount === null);
        if (open) {
          open.amount = event.amount;
          open.cancelled = event.cancelled;
          open.partial = false;
        }
        damage = null;
        continue;
      }
      case 'TRIGGER_CHECK':
        closeDamage(true);
        steps.push({ seq: event.seq, kind: 'TRIGGER', player: event.player, card: { cardId: event.cardId }, icons: [...event.icons], reveal: 'TRIGGER_REVEAL' });
        continue;
      case 'REFRESH':
        steps.push({ seq: refresh?.seq ?? event.seq, kind: 'REFRESH', player: event.player, cards: refresh?.cards ?? 0, penalty: refresh?.penalty ?? null });
        refresh = null;
        continue;
      case 'LEVEL_UP':
        closeDamage(true);
        steps.push({ seq: levelUp?.seq ?? event.seq, kind: 'LEVEL_UP', player: event.player, level: event.level, card: levelUp?.card ?? null });
        levelUp = null;
        continue;
      case 'DECK_SHUFFLED':
        continue;
      default:
        break;
    }
    closeDamage(true);
    switch (event.type) {
      case 'CARD_REVEALED':
        steps.push({ seq: event.seq, kind: 'REVEAL', player: event.zone.player, cards: [{ cardId: event.cardId }], reason: 'SHOWN', reveal: 'PUBLIC_REVEAL' });
        break;
      case 'ORIENTATION_CHANGED':
        steps.push({ seq: event.seq, kind: 'ORIENT', player: event.player, slot: event.slot, objectId: event.objectId, to: event.to });
        break;
      case 'ATTACK_DECLARED':
        steps.push({ seq: event.seq, kind: 'ATTACK', player: event.player, slot: event.attackerSlot, attackType: event.attackType, attacker: event.attackerObjectId, defender: event.defenderObjectId });
        break;
      case 'CARD_PLAYED':
        steps.push({ seq: event.seq, kind: 'PLAY', player: event.player, cardId: event.cardId, cardKind: event.cardKind, ...(event.slot ? { slot: event.slot } : {}) });
        break;
      case 'ABILITY_PLAYED':
        steps.push({ seq: event.seq, kind: 'ABILITY', player: event.player, cardId: event.cardId, ability: event.ability });
        break;
      case 'TURN_STARTED':
        steps.push({ seq: event.seq, kind: 'TURN', player: event.player, turn: event.turn });
        break;
      case 'PHASE_STARTED':
        steps.push({ seq: event.seq, kind: 'PHASE', player: event.player, phase: event.phase });
        break;
      case 'GAME_ENDED':
        steps.push({ seq: event.seq, kind: 'END' });
        break;
      default:
        break;
    }
  }
  return steps;
}
