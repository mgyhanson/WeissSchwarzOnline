/**
 * Tests for the second batch of ソードアート・オンライン cards: SAO/S20-018, 076
 * and 080, and the SAO_OTHERS set (経験, 記憶, アラーム and 次の相手のターンの終わりまで).
 * Player 0 uses these cards; player 1 uses the 涼宮ハルヒ trial deck cards.
 */

import { describe, expect, it } from 'vitest';
import { type Choice, type Ctx, type Decision, type GameState, type PlayerId, type SlotId, getInstance, getPower, getSoul, stageSlot } from '@wso/game-engine';
import { getCard } from '../src/index';
import { HARUHI, SAO, SAO_OTHERS, answer, oid, pending, scenario, stackTop, take } from './helpers';
import type { RealScenario } from './helpers';

const S = (n: number): string => `SAO/S20-${String(n).padStart(3, '0')}`;
const O = (no: string): string => `SAO/${no}`;
const SY = (n: number): string => `SY/W08-T${String(n).padStart(2, '0')}`;

const s20 = (options: Omit<RealScenario, 'sets'>, arrange: (ctx: Ctx) => void = () => {}) => scenario({ ...options, sets: [SAO, HARUHI] }, arrange);
const others = (options: Omit<RealScenario, 'sets'>, arrange: (ctx: Ctx) => void = () => {}) => scenario({ ...options, sets: [SAO_OTHERS, HARUHI] }, arrange);

const at = (state: GameState, player: PlayerId, slot: SlotId): number => state.zones[player].stage[slot][0]!;
const cardIn = (state: GameState, ids: readonly number[], cardId: string): number => ids.find((id) => getInstance(state, id).cardId === cardId)!;
const cardIdOfObject = (state: GameState, objectId: number): string => state.instances.find((i) => i.objectId === objectId)!.cardId;
const idsIn = (state: GameState, ids: readonly number[]): string[] => ids.map((id) => getInstance(state, id).cardId);
const level = (ctx: Ctx, cardIds: readonly string[]): void => {
  for (const id of cardIds) take(ctx, 0, id, { player: 0, zone: 'level' });
};

/** Player 1's deck top without climaxes, so damage to player 1 is never cancelled. */
const safeTopForP1 = (ctx: Ctx): void => {
  stackTop(ctx, 1, [SY(12), SY(12), SY(12), SY(15), SY(15), SY(15)]);
};

/** The answer a test gives to a routine decision it does not care about. */
function routine(d: Decision): Choice {
  switch (d.kind) {
    case 'MAIN':
      return { kind: 'MAIN', action: { type: 'PASS' } };
    case 'CLIMAX':
      return { kind: 'CLIMAX', card: null };
    case 'ATTACK':
      return { kind: 'ATTACK', attack: null };
    case 'COUNTER':
      return { kind: 'COUNTER', card: null };
    case 'CLOCK':
      return { kind: 'CLOCK', card: null };
    case 'LEVEL_UP':
      return { kind: 'LEVEL_UP', card: d.cards[0]! };
    case 'HAND_LIMIT':
      return { kind: 'HAND_LIMIT', discard: d.cards.slice(0, d.count) };
    case 'RULE_ACTION_ORDER':
      return { kind: 'RULE_ACTION_ORDER', first: d.options[0]! };
    case 'CHOOSE_ABILITY':
      return { kind: 'CHOOSE_ABILITY', id: (d.abilities.find((a) => a.type === 'CARD') ?? d.abilities[0]!).id };
    case 'SELECT_OPTION':
      return { kind: 'SELECT_OPTION', option: d.options[0]! };
    case 'CONFIRM':
      return { kind: 'CONFIRM', accept: false };
    case 'SELECT_CARDS':
      return { kind: 'SELECT_CARDS', cards: d.cards.slice(0, d.min) };
    default:
      throw new Error(`Unexpected ${d.kind}`);
  }
}

/** Answers routine decisions until `stop` holds. */
function until(state: GameState, stop: (s: GameState) => boolean): GameState {
  let current = state;
  for (let i = 0; i < 300 && !stop(current); i++) current = answer(current, routine(current.pending!)).state;
  if (!stop(current)) throw new Error('until: the condition never held');
  return current;
}

const mainOf = (player: PlayerId) => (s: GameState): boolean => s.turn?.player === player && s.pending?.kind === 'MAIN';
const askedToPay = (cardId: string) => (s: GameState): boolean => s.pending?.kind === 'CONFIRM' && s.pending.prompt === 'PAY_COST' && s.pending.cardId === cardId;
const askedToUse = (cardId: string) => (s: GameState): boolean => s.pending?.kind === 'CONFIRM' && s.pending.prompt === 'USE_ABILITY' && s.pending.cardId === cardId;
const played = (events: readonly { type: string }[], cardId: string, ability: number): boolean =>
  events.some((e) => e.type === 'ABILITY_PLAYED' && (e as { cardId?: string }).cardId === cardId && (e as { ability?: number }).ability === ability);

describe('SAO/S20 second batch', () => {
  it('SAO/S20-018: (1) and resting two of your characters, itself included, gives it +1500 and soul +1 for the turn', () => {
    const start = s20({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, S(18), stageSlot(0, 'FC'));
      take(ctx, 0, S(17), stageSlot(0, 'FL'));
      take(ctx, 0, S(17), { player: 0, zone: 'stock' });
    }).state;
    const card = at(start, 0, 'FC');
    const fl = at(start, 0, 'FL');
    const atRest = answer(start, { kind: 'MAIN', action: { type: 'ACTIVATE', card: oid(start, card), ability: 0 } }).state;
    const rest = pending(atRest, 'SELECT_CARDS');
    expect(rest).toMatchObject({ prompt: 'COST_REST', min: 2, max: 2 });
    expect([...rest.cards].sort()).toEqual([oid(atRest, card), oid(atRest, fl)].sort());
    const { state } = answer(atRest, { kind: 'SELECT_CARDS', cards: rest.cards });
    expect([getPower(state, card), getSoul(state, card)]).toEqual([4000, 2]);
    expect([getInstance(state, card).orientation, getInstance(state, fl).orientation]).toEqual(['REST', 'REST']);
    expect(state.zones[0].stock).toHaveLength(0);
  });

  it('SAO/S20-018: with only one standing character, the cost cannot be paid and the ability is not offered', () => {
    const start = s20({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, S(18), stageSlot(0, 'FC'));
      take(ctx, 0, S(17), stageSlot(0, 'FL'), { orientation: 'REST' });
      take(ctx, 0, S(17), { player: 0, zone: 'stock' });
    }).state;
    const actions = pending(start, 'MAIN').actions;
    expect(actions.some((a) => a.type === 'ACTIVATE')).toBe(false);
  });

  it('SAO/S20-076: (1) draws a card, then a hand card goes to the waiting room', () => {
    const start = s20({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, S(76), stageSlot(0, 'FC'));
      take(ctx, 0, S(17), { player: 0, zone: 'stock' });
      take(ctx, 0, S(15), { player: 0, zone: 'hand' });
      stackTop(ctx, 0, [S(83)]);
    }).state;
    const atDiscard = answer(start, { kind: 'MAIN', action: { type: 'ACTIVATE', card: oid(start, at(start, 0, 'FC')), ability: 0 } }).state;
    const discard = pending(atDiscard, 'SELECT_CARDS');
    expect(discard.cards).toHaveLength(2);
    const fifteen = cardIn(atDiscard, atDiscard.zones[0].hand, S(15));
    const { state } = answer(atDiscard, { kind: 'SELECT_CARDS', cards: [oid(atDiscard, fifteen)] });
    expect(idsIn(state, state.zones[0].hand)).toEqual([S(83)]);
    expect(idsIn(state, state.zones[0].waitingRoom)).toContain(S(15));
  });

  it('SAO/S20-076: resting another character and itself gives a character +1000 until the end of the opponent’s next turn (CR-6.8.1.4)', () => {
    const start = s20({ step: 'MAIN_START', turnNumber: 3 }, (ctx) => {
      take(ctx, 0, S(76), stageSlot(0, 'BL'));
      take(ctx, 0, S(83), stageSlot(0, 'FL'));
      take(ctx, 0, S(17), stageSlot(0, 'FC'));
    }).state;
    const self = at(start, 0, 'BL');
    const fl = at(start, 0, 'FL');
    const fc = at(start, 0, 'FC');
    const atRest = answer(start, { kind: 'MAIN', action: { type: 'ACTIVATE', card: oid(start, self), ability: 1 } }).state;
    const rest = pending(atRest, 'SELECT_CARDS');
    // 他のあなたのキャラ: not this card itself.
    expect(rest).toMatchObject({ prompt: 'COST_REST', min: 1, max: 1 });
    expect([...rest.cards].sort()).toEqual([oid(atRest, fl), oid(atRest, fc)].sort());
    const atTarget = answer(atRest, { kind: 'SELECT_CARDS', cards: [oid(atRest, fl)] }).state;
    expect(getInstance(atTarget, self).orientation).toBe('REST');
    const mine = answer(atTarget, { kind: 'SELECT_CARDS', cards: [oid(atTarget, fc)] }).state;
    expect(getPower(mine, fc)).toBe(4000);

    // It still holds in the opponent's turn ...
    const theirs = until(mine, mainOf(1));
    expect(theirs.turn!.number).toBe(4);
    expect(getPower(theirs, fc)).toBe(4000);
    // ... and has ended once that turn is over.
    const next = until(theirs, mainOf(0));
    expect(next.turn!.number).toBe(5);
    expect(getPower(next, fc)).toBe(3000);
    expect(next.modifiers).toEqual([]);
  });

  it('SAO/S20-080 加速: at the start of your climax phase, the top card of the deck may go to the clock for +2500 until the end of the opponent’s next turn', () => {
    const start = s20({ step: 'CLIMAX_START' }, (ctx) => {
      take(ctx, 0, S(80), stageSlot(0, 'FC'));
      stackTop(ctx, 0, [S(17)]);
    }).state;
    const card = at(start, 0, 'FC');
    expect(pending(start, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST', ability: 1, cardId: S(80) });
    const declined = answer(start, { kind: 'CONFIRM', accept: false }).state;
    expect([getPower(declined, card), declined.zones[0].clock.length]).toEqual([4000, 0]);

    const paid = answer(start, { kind: 'CONFIRM', accept: true }).state;
    expect(idsIn(paid, paid.zones[0].clock)).toEqual([S(17)]);
    expect(getPower(paid, card)).toBe(6500);
    const theirs = until(paid, mainOf(1));
    expect(getPower(theirs, card)).toBe(6500);
    const next = until(theirs, mainOf(0));
    expect(getPower(next, card)).toBe(4000);
  });

  it('SAO/S20-080: when it attacks with 「世界の終焉」 in the climax area, it may pay (1) to draw a card', () => {
    const attack = (climax: string) =>
      s20({ step: 'ATTACK_START' }, (ctx) => {
        take(ctx, 0, S(80), stageSlot(0, 'FC'));
        take(ctx, 0, climax, { player: 0, zone: 'climax' });
        take(ctx, 0, S(17), { player: 0, zone: 'stock' });
        stackTop(ctx, 0, [S(83), S(84)]);
        safeTopForP1(ctx);
      }).state;
    const other = attack(S(100));
    const { events } = answer(other, { kind: 'ATTACK', attack: { attacker: oid(other, at(other, 0, 'FC')), type: 'DIRECT' } });
    expect(played(events, S(80), 0)).toBe(false);

    const start = attack(S(99));
    const atPay = answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, at(start, 0, 'FC')), type: 'DIRECT' } }).state;
    expect(pending(atPay, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST', ability: 0 });
    const { state } = answer(atPay, { kind: 'CONFIRM', accept: true });
    expect(idsIn(state, state.zones[0].hand)).toEqual([S(83)]);
  });
});

describe('SAO_OTHERS 記憶 (Memory)', () => {
  it('SAO/S51-002: played from hand, the top two cards go to the waiting room; with a climax among them, soul +2', () => {
    const play = (top: string[]) => {
      const start = others({ step: 'MAIN_START' }, (ctx) => {
        take(ctx, 0, O('S51-002'), { player: 0, zone: 'hand' });
        stackTop(ctx, 0, top);
      }).state;
      return answer(start, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(start, start.zones[0].hand[0]!), slot: 'FC' } }).state;
    };
    const withClimax = play([O('S71-016'), O('S80-097')]);
    expect(idsIn(withClimax, withClimax.zones[0].waitingRoom)).toEqual([O('S71-016'), O('S80-097')]);
    expect(getSoul(withClimax, at(withClimax, 0, 'FC'))).toBe(3);
    const without = play([O('S71-016'), O('S71-079')]);
    expect(without.zones[0].waitingRoom).toHaveLength(2);
    expect(getSoul(without, at(without, 0, 'FC'))).toBe(1);
  });

  it('SAO/S51-002: reversed in battle, it may put a stock card into the clock and itself into memory to return a キリト/アスナ/ユイ character', () => {
    const start = others({ step: 'ATTACK_START', turnPlayer: 1 }, (ctx) => {
      take(ctx, 0, O('S51-002'), stageSlot(0, 'FC'));
      take(ctx, 0, O('S65-083'), { player: 0, zone: 'waitingRoom' }); // “剣士の矜恃”キリト
      take(ctx, 0, O('S71-016'), { player: 0, zone: 'waitingRoom' }); // さすらいの一座: no such name
      take(ctx, 0, O('S71-104'), { player: 0, zone: 'stock' });
      take(ctx, 1, SY(7), stageSlot(1, 'FC'));
      stackTop(ctx, 1, [SY(12)]);
      stackTop(ctx, 0, [O('S71-079'), O('S71-079'), O('S71-079')]);
    }).state;
    const attacked = answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, at(start, 1, 'FC')), type: 'FRONT' } }).state;
    const atPay = until(attacked, askedToPay(O('S51-002')));
    const clockBefore = atPay.zones[0].clock.length;
    const atChoose = answer(atPay, { kind: 'CONFIRM', accept: true }).state;
    expect(idsIn(atChoose, atChoose.zones[0].memory)).toEqual([O('S51-002')]);
    expect(atChoose.zones[0].clock).toHaveLength(clockBefore + 1);
    expect(atChoose.zones[0].stock).toHaveLength(0);
    const choose = pending(atChoose, 'SELECT_CARDS');
    expect(choose.cards.map((o) => cardIdOfObject(atChoose, o))).toEqual([O('S65-083')]);
    const { state } = answer(atChoose, { kind: 'SELECT_CARDS', cards: choose.cards });
    // (The game then goes on into your next turn, whose draw adds a card.)
    expect(idsIn(state, state.zones[0].hand)).toContain(O('S65-083'));
    expect(idsIn(state, state.zones[0].waitingRoom)).not.toContain(O('S65-083'));
  });

  describe('SAO/S51-010 and SAO/S51-014 記憶', () => {
    for (const [cardId, base, bonus] of [
      [O('S51-010'), 4500, 5000],
      [O('S51-014'), 4000, 1000],
    ] as const) {
      it(`${cardId}: with 「流星の約束 アスナ」 in your memory, +${bonus} and soul +1; another card in memory does not count`, () => {
        const make = (memory: string | null) =>
          others({ step: 'MAIN_START' }, (ctx) => {
            take(ctx, 0, cardId, stageSlot(0, 'FC'));
            if (memory) take(ctx, 0, memory, { player: 0, zone: 'memory' });
          }).state;
        const withMemory = make(O('S51-002'));
        expect([getPower(withMemory, at(withMemory, 0, 'FC')), getSoul(withMemory, at(withMemory, 0, 'FC'))]).toEqual([base + bonus, 2]);
        const otherMemory = make(O('S71-016'));
        expect([getPower(otherMemory, at(otherMemory, 0, 'FC')), getSoul(otherMemory, at(otherMemory, 0, 'FC'))]).toEqual([base, 1]);
      });
    }
  });

  it('SAO/S51-014 アンコール: reversed, it may discard a character from hand to come back rested', () => {
    const start = others({ step: 'ATTACK_START', turnPlayer: 1 }, (ctx) => {
      take(ctx, 0, O('S51-014'), stageSlot(0, 'FC'));
      take(ctx, 0, O('S71-016'), { player: 0, zone: 'hand' });
      take(ctx, 1, SY(7), stageSlot(1, 'FC'));
      stackTop(ctx, 1, [SY(12)]);
      stackTop(ctx, 0, [O('S71-079'), O('S71-079'), O('S71-079')]);
    }).state;
    const attacked = answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, at(start, 1, 'FC')), type: 'FRONT' } }).state;
    const atPay = until(attacked, askedToPay(O('S51-014')));
    const atDiscard = answer(atPay, { kind: 'CONFIRM', accept: true }).state;
    const { state, events } = answer(atDiscard, { kind: 'SELECT_CARDS', cards: pending(atDiscard, 'SELECT_CARDS').cards });
    expect(idsIn(state, state.zones[0].stage.FC)).toEqual([O('S51-014')]);
    // Put back rested (the stand phase of your next turn, already reached, stands it again).
    expect(events.find((e) => e.type === 'CARD_MOVED' && e.to.zone === 'stage')).toMatchObject({ cardId: O('S51-014'), orientation: 'REST', to: { zone: 'stage', slot: 'FC' } });
  });
});

describe('SAO_OTHERS アラーム (Alarm)', () => {
  it('SAO/S65-073: played from hand, may discard a climax to return a 《フラクトライト》 character from the waiting room', () => {
    const start = others({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, O('S65-073'), { player: 0, zone: 'hand' });
      take(ctx, 0, O('S80-097'), { player: 0, zone: 'hand' });
      take(ctx, 0, O('S71-016'), { player: 0, zone: 'hand' });
      take(ctx, 0, O('S65-092'), { player: 0, zone: 'waitingRoom' }); // 《フラクトライト》
      take(ctx, 0, O('S71-104'), { player: 0, zone: 'waitingRoom' }); // not 《フラクトライト》
    }).state;
    const card = cardIn(start, start.zones[0].hand, O('S65-073'));
    const atPay = answer(start, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(start, card), slot: 'FC' } }).state;
    expect(pending(atPay, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST', ability: 0 });
    const atDiscard = answer(atPay, { kind: 'CONFIRM', accept: true }).state;
    const discard = pending(atDiscard, 'SELECT_CARDS');
    expect(discard.cards.map((o) => cardIdOfObject(atDiscard, o))).toEqual([O('S80-097')]);
    const atChoose = answer(atDiscard, { kind: 'SELECT_CARDS', cards: discard.cards }).state;
    const choose = pending(atChoose, 'SELECT_CARDS');
    expect(choose.cards.map((o) => cardIdOfObject(atChoose, o))).toEqual([O('S65-092')]);
    const { state } = answer(atChoose, { kind: 'SELECT_CARDS', cards: choose.cards });
    expect(idsIn(state, state.zones[0].hand).sort()).toEqual([O('S65-092'), O('S71-016')].sort());
  });

  describe('SAO/S65-073 アラーム: only from the top of the clock', () => {
    const climaxPhase = (where: 'clockTop' | 'clockUnder' | 'stage') =>
      others({ step: 'CLIMAX_START' }, (ctx) => {
        take(ctx, 0, O('S71-079'), stageSlot(0, 'FC'));
        if (where === 'stage') take(ctx, 0, O('S65-073'), stageSlot(0, 'FL'));
        else {
          if (where === 'clockUnder') {
            take(ctx, 0, O('S65-073'), { player: 0, zone: 'clock' });
            take(ctx, 0, O('S71-016'), { player: 0, zone: 'clock' });
          } else {
            take(ctx, 0, O('S71-016'), { player: 0, zone: 'clock' });
            take(ctx, 0, O('S65-073'), { player: 0, zone: 'clock' });
          }
        }
      });

    it('SAO/S65-073: on top of the clock, a character gets +1000 at the start of your climax phase', () => {
      const start = climaxPhase('clockTop').state;
      const choose = pending(start, 'SELECT_CARDS');
      const fc = at(start, 0, 'FC');
      const { state } = answer(start, { kind: 'SELECT_CARDS', cards: [oid(start, fc)] });
      expect(choose.cards).toEqual([oid(start, fc)]);
      expect(getPower(state, fc)).toBe(5500);
    });

    it('SAO/S65-073: under another clock card, or on the stage, it does nothing', () => {
      for (const where of ['clockUnder', 'stage'] as const) {
        const { state, events } = climaxPhase(where);
        expect(state.pending?.kind, where).toBe('CLIMAX');
        expect(played(events, O('S65-073'), 1), where).toBe(false);
      }
    });
  });

  it('SAO/S65-079 アラーム: on top of the clock, you may draw a card and then discard one; declining does neither', () => {
    const start = others({ step: 'CLIMAX_START' }, (ctx) => {
      take(ctx, 0, O('S65-079'), { player: 0, zone: 'clock' });
      take(ctx, 0, O('S71-016'), { player: 0, zone: 'hand' });
      stackTop(ctx, 0, [O('S71-104')]);
    }).state;
    expect(pending(start, 'CONFIRM')).toMatchObject({ prompt: 'USE_ABILITY', ability: 0 });
    const declined = answer(start, { kind: 'CONFIRM', accept: false }).state;
    expect(idsIn(declined, declined.zones[0].hand)).toEqual([O('S71-016')]);
    const atDiscard = answer(start, { kind: 'CONFIRM', accept: true }).state;
    const discard = pending(atDiscard, 'SELECT_CARDS');
    expect(discard.cards).toHaveLength(2);
    const old = cardIn(atDiscard, atDiscard.zones[0].hand, O('S71-016'));
    const { state } = answer(atDiscard, { kind: 'SELECT_CARDS', cards: [oid(atDiscard, old)] });
    expect(idsIn(state, state.zones[0].hand)).toEqual([O('S71-104')]);
  });

  it('SAO/S65-079: resting it gives an 《アバター》 or 《ネット》 character +1000', () => {
    const start = others({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, O('S65-079'), stageSlot(0, 'BL'));
      take(ctx, 0, O('S71-104'), stageSlot(0, 'FC')); // アバター/ネット
      take(ctx, 0, O('S80-040'), stageSlot(0, 'FL')); // フラクトライト/貴族
    }).state;
    const self = at(start, 0, 'BL');
    const fc = at(start, 0, 'FC');
    const atChoose = answer(start, { kind: 'MAIN', action: { type: 'ACTIVATE', card: oid(start, self), ability: 1 } }).state;
    const choose = pending(atChoose, 'SELECT_CARDS');
    expect([...choose.cards].sort()).toEqual([oid(atChoose, self), oid(atChoose, fc)].sort());
    const { state } = answer(atChoose, { kind: 'SELECT_CARDS', cards: [oid(atChoose, fc)] });
    expect(getPower(state, fc)).toBe(8500);
    expect(getInstance(state, self).orientation).toBe('REST');
  });

  it('SAO/S80-040: played from hand, (1) and a discard search the deck for a 《フラクトライト》 character', () => {
    const start = others({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, O('S80-040'), { player: 0, zone: 'hand' });
      take(ctx, 0, O('S71-104'), { player: 0, zone: 'hand' });
      take(ctx, 0, O('S71-016'), { player: 0, zone: 'stock' });
    }).state;
    const card = cardIn(start, start.zones[0].hand, O('S80-040'));
    const atPay = answer(start, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(start, card), slot: 'FC' } }).state;
    const atDiscard = answer(atPay, { kind: 'CONFIRM', accept: true }).state;
    const atSearch = answer(atDiscard, { kind: 'SELECT_CARDS', cards: pending(atDiscard, 'SELECT_CARDS').cards }).state;
    const search = pending(atSearch, 'SELECT_CARDS');
    expect(search).toMatchObject({ min: 0, max: 1 });
    expect(search.cards.length).toBeGreaterThan(0);
    expect(search.cards.every((o) => getCard(cardIdOfObject(atSearch, o)).def.traits.includes('フラクトライト'))).toBe(true);
    const { state, events } = answer(atSearch, { kind: 'SELECT_CARDS', cards: [search.cards[0]!] });
    expect(idsIn(state, state.zones[0].hand)).toEqual([cardIdOfObject(atSearch, search.cards[0]!)]);
    expect(events.some((e) => e.type === 'DECK_SHUFFLED' && e.player === 0)).toBe(true);
  });

  it('SAO/S80-040 アラーム: from the top of the clock, with three 《フラクトライト》 characters you may draw and discard', () => {
    const climaxPhase = (fluctlights: number) =>
      others({ step: 'CLIMAX_START' }, (ctx) => {
        take(ctx, 0, O('S80-040'), { player: 0, zone: 'clock' });
        const cards = [O('S65-083'), O('S65-092'), O('S80-074')].slice(0, fluctlights);
        cards.forEach((id, i) => take(ctx, 0, id, stageSlot(0, (['FL', 'FC', 'FR'] as const)[i]!)));
        take(ctx, 0, O('S71-104'), stageSlot(0, 'BL'));
      }).state;
    expect(pending(climaxPhase(3), 'CONFIRM')).toMatchObject({ prompt: 'USE_ABILITY', ability: 1 });
    expect(climaxPhase(2).pending?.kind).toBe('CLIMAX');
  });
});

describe('SAO_OTHERS 経験 (Experience)', () => {
  const onStage = (cardId: string, levelCards: string[], turnPlayer: PlayerId = 0) =>
    others({ step: 'MAIN_START', turnPlayer }, (ctx) => {
      take(ctx, 0, cardId, stageSlot(0, 'FC'));
      level(ctx, levelCards);
    }).state;
  const powerOf = (cardId: string, levelCards: string[], turnPlayer: PlayerId = 0): number => {
    const state = onStage(cardId, levelCards, turnPlayer);
    return getPower(state, at(state, 0, 'FC'));
  };
  // Levels of the cards: S51-002, S65-073 0; S71-016, S65-083 1; S51-010, S71-104 2.

  it('SAO/S71-016: the total level of the cards in your level zone, not their number, must be 2 or more (CR-10.10)', () => {
    expect(powerOf(O('S71-016'), [O('S51-002'), O('S65-073')])).toBe(4500); // two cards, total 0
    expect(powerOf(O('S71-016'), [O('S65-083')])).toBe(4500); // total 1
    expect(powerOf(O('S71-016'), [O('S51-010')])).toBe(6500); // one card, total 2
  });

  it('SAO/S71-104: +3000 with a total of 5 or more, in either turn', () => {
    expect(powerOf(O('S71-104'), [O('S51-010'), O('S71-104')])).toBe(7500);
    expect(powerOf(O('S71-104'), [O('S51-010'), O('S71-104'), O('S65-083')])).toBe(10500);
    expect(powerOf(O('S71-104'), [O('S51-010'), O('S71-104'), O('S65-083')], 1)).toBe(10500);
  });

  describe('SAO/S100-019 and SAO/S71-095: your turn only', () => {
    for (const cardId of [O('S100-019'), O('S71-095')]) {
      it(`${cardId}: +6000 in your turn with a total of 5 or more; not in the opponent’s turn`, () => {
        const base = getCard(cardId).def.power!;
        const five = [O('S51-010'), O('S71-104'), O('S65-083')];
        expect(powerOf(cardId, five)).toBe(base + 6000);
        expect(powerOf(cardId, five, 1)).toBe(base);
        expect(powerOf(cardId, [O('S51-010'), O('S71-104')])).toBe(base);
      });
    }
  });

  describe('SAO/S65-083, SAO/S71-025, SAO/S71-085: a total of 2 gives +1500 and 『アンコール ［手札のキャラを1枚控え室に置く］』', () => {
    const reversed = (cardId: string, levelCards: string[]) =>
      others({ step: 'ATTACK_START', turnPlayer: 1 }, (ctx) => {
        take(ctx, 0, cardId, stageSlot(0, 'FC'));
        level(ctx, levelCards);
        take(ctx, 0, O('S71-016'), { player: 0, zone: 'hand' });
        take(ctx, 1, SY(7), stageSlot(1, 'FC'));
        stackTop(ctx, 1, [SY(12)]);
        stackTop(ctx, 0, [O('S71-079'), O('S71-079'), O('S71-079')]);
      }).state;

    for (const cardId of [O('S65-083'), O('S71-025'), O('S71-085')]) {
      it(`${cardId}: with a total of 2, +1500 and the encore; with 1, neither`, () => {
        const base = getCard(cardId).def.power!;
        const start = reversed(cardId, [O('S51-010')]);
        expect(getPower(start, at(start, 0, 'FC'))).toBe(base + 1500);
        const attacked = answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, at(start, 1, 'FC')), type: 'FRONT' } }).state;
        const atPay = until(attacked, askedToPay(cardId));
        const atDiscard = answer(atPay, { kind: 'CONFIRM', accept: true }).state;
        const { state } = answer(atDiscard, { kind: 'SELECT_CARDS', cards: pending(atDiscard, 'SELECT_CARDS').cards });
        expect(idsIn(state, state.zones[0].stage.FC)).toEqual([cardId]);

        const low = reversed(cardId, [O('S65-083')]);
        expect(getPower(low, at(low, 0, 'FC'))).toBe(base);
        const lowAttacked = answer(low, { kind: 'ATTACK', attack: { attacker: oid(low, at(low, 1, 'FC')), type: 'FRONT' } }).state;
        const after = until(lowAttacked, mainOf(0));
        expect(idsIn(after, after.zones[0].waitingRoom)).toContain(cardId);
      });
    }
  });

  it('SAO/S71-025: played from hand with four other 《Anniversary》 characters, may put an 《Anniversary》 character from the waiting room into stock', () => {
    const play = (count: number) => {
      const start = others({ step: 'MAIN_START' }, (ctx) => {
        take(ctx, 0, O('S71-025'), { player: 0, zone: 'hand' });
        level(ctx, [O('S71-016')]); // yellow, level 1
        take(ctx, 0, O('S51-002'), { player: 0, zone: 'stock' }); // pays the cost; not 《Anniversary》
        const anniversary = [O('S71-079'), O('S71-079'), O('S71-085'), O('S71-022')].slice(0, count);
        anniversary.forEach((id, i) => take(ctx, 0, id, stageSlot(0, (['FL', 'FC', 'FR', 'BL'] as const)[i]!)));
        take(ctx, 0, O('S71-095'), { player: 0, zone: 'waitingRoom' }); // 《Anniversary》
        take(ctx, 0, O('S65-092'), { player: 0, zone: 'waitingRoom' }); // not
      }).state;
      return answer(start, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(start, start.zones[0].hand[0]!), slot: 'BR' } }).state;
    };
    const four = play(4);
    expect(pending(four, 'CONFIRM')).toMatchObject({ prompt: 'USE_ABILITY', ability: 1 });
    const atChoose = answer(four, { kind: 'CONFIRM', accept: true }).state;
    const choose = pending(atChoose, 'SELECT_CARDS');
    expect(choose.cards.map((o) => cardIdOfObject(atChoose, o))).toEqual([O('S71-095')]);
    const { state } = answer(atChoose, { kind: 'SELECT_CARDS', cards: choose.cards });
    expect(idsIn(state, state.zones[0].stock)).toEqual([O('S71-095')]);

    expect(play(3).pending?.kind).toBe('MAIN');
  });

  it('SAO/S71-022: 応援 +500; with a total of 3 it has 『at the start of your climax phase, an 《Anniversary》 character gets +1000』', () => {
    const climaxPhase = (levelCards: string[]) =>
      others({ step: 'CLIMAX_START' }, (ctx) => {
        take(ctx, 0, O('S71-022'), stageSlot(0, 'BL'));
        take(ctx, 0, O('S71-079'), stageSlot(0, 'FL'));
        take(ctx, 0, O('S65-092'), stageSlot(0, 'FC'));
        level(ctx, levelCards);
      }).state;
    const low = climaxPhase([O('S51-010')]);
    expect(low.pending?.kind).toBe('CLIMAX');
    expect(getPower(low, at(low, 0, 'FL'))).toBe(5000); // 4500 + 応援 500

    const start = climaxPhase([O('S51-010'), O('S65-083')]);
    const choose = pending(start, 'SELECT_CARDS');
    const fl = at(start, 0, 'FL');
    // Only 《Anniversary》 characters: S71-079 and this card, not S65-092.
    expect([...choose.cards].sort()).toEqual([oid(start, fl), oid(start, at(start, 0, 'BL'))].sort());
    const before = getPower(start, fl);
    const { state } = answer(start, { kind: 'SELECT_CARDS', cards: [oid(start, fl)] });
    expect(getPower(state, fl)).toBe(before + 1000);
  });

  it('SAO/S65-092: when its battle opponent is reversed, with a total of 3 you may put the top deck card into stock', () => {
    const attack = (levelCards: string[]) => {
      const start = others({ step: 'ATTACK_START' }, (ctx) => {
        take(ctx, 0, O('S65-092'), stageSlot(0, 'FC'));
        level(ctx, levelCards);
        take(ctx, 1, SY(1), stageSlot(1, 'FC'));
        stackTop(ctx, 0, [O('S71-016'), O('S71-104')]);
        safeTopForP1(ctx);
      }).state;
      return answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, at(start, 0, 'FC')), type: 'FRONT' } }).state;
    };
    const atUse = until(attack([O('S51-010'), O('S65-083')]), askedToUse(O('S65-092')));
    const stock = atUse.zones[0].stock.length;
    const { state } = answer(atUse, { kind: 'CONFIRM', accept: true });
    expect(state.zones[0].stock).toHaveLength(stock + 1);

    const low = until(attack([O('S51-010')]), (s) => s.pending?.kind === 'ATTACK' || s.turn?.player === 1);
    expect(low.zones[1].waitingRoom.map((id) => getInstance(low, id).cardId)).toContain(SY(1));
  });

  it('SAO/S71-079: when it attacks with a total of 2, a character gets +2000', () => {
    const attack = (levelCards: string[]) => {
      const start = others({ step: 'ATTACK_START' }, (ctx) => {
        take(ctx, 0, O('S71-079'), stageSlot(0, 'FC'));
        take(ctx, 0, O('S65-092'), stageSlot(0, 'FL')); // a second attacker keeps the turn going
        level(ctx, levelCards);
        stackTop(ctx, 0, [O('S71-016')]);
        safeTopForP1(ctx);
      }).state;
      return answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, at(start, 0, 'FC')), type: 'DIRECT' } });
    };
    const { state } = attack([O('S51-010')]);
    const fc = at(state, 0, 'FC');
    const after = answer(state, { kind: 'SELECT_CARDS', cards: [oid(state, fc)] }).state;
    expect(getPower(after, fc)).toBe(6500);
    expect(played(attack([O('S65-083')]).events, O('S71-079'), 0)).toBe(false);
  });

  it('SAO/S71-085: when it attacks with another 《Anniversary》 character, +1500', () => {
    const attack = (partner: string) => {
      const start = others({ step: 'ATTACK_START' }, (ctx) => {
        take(ctx, 0, O('S71-085'), stageSlot(0, 'FC'));
        take(ctx, 0, partner, stageSlot(0, 'BR'));
        take(ctx, 0, O('S65-083'), stageSlot(0, 'FL')); // a second attacker keeps the turn going
        stackTop(ctx, 0, [O('S71-016')]);
        safeTopForP1(ctx);
      }).state;
      const card = at(start, 0, 'FC');
      const { state } = answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, card), type: 'DIRECT' } });
      return getPower(state, card);
    };
    expect(attack(O('S71-016'))).toBe(7000);
    expect(attack(O('S65-092'))).toBe(5500);
  });

  it('SAO/S80-074: +1000 in your turn; 【CXコンボ】 with 「世界を包む夜空」 and a total of 2, it may return a 《フラクトライト》 character', () => {
    const attack = (climax: string, levelCards: string[]) => {
      const start = others({ step: 'ATTACK_START' }, (ctx) => {
        take(ctx, 0, O('S80-074'), stageSlot(0, 'FC'));
        take(ctx, 0, climax, { player: 0, zone: 'climax' });
        level(ctx, levelCards);
        take(ctx, 0, O('S65-092'), { player: 0, zone: 'waitingRoom' });
        take(ctx, 0, O('S71-104'), { player: 0, zone: 'waitingRoom' });
        stackTop(ctx, 0, [O('S71-016')]);
        safeTopForP1(ctx);
      }).state;
      return { start, ...answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, at(start, 0, 'FC')), type: 'DIRECT' } }) };
    };
    const { start, state } = attack(O('S80-097'), [O('S51-010')]);
    expect(getPower(start, at(start, 0, 'FC'))).toBe(4500 + 1000 + 1000); // own +1000, climax +1000
    expect(pending(state, 'CONFIRM')).toMatchObject({ prompt: 'USE_ABILITY', ability: 1 });
    const atChoose = answer(state, { kind: 'CONFIRM', accept: true }).state;
    const choose = pending(atChoose, 'SELECT_CARDS');
    expect(choose.cards.map((o) => cardIdOfObject(atChoose, o))).toEqual([O('S65-092')]);
    const after = answer(atChoose, { kind: 'SELECT_CARDS', cards: choose.cards }).state;
    expect(idsIn(after, after.zones[0].hand)).toEqual([O('S65-092')]);

    expect(played(attack(O('S80-097'), [O('S65-083')]).events, O('S80-074'), 1)).toBe(false);
    const theirTurn = others({ step: 'MAIN_START', turnPlayer: 1 }, (ctx) => take(ctx, 0, O('S80-074'), stageSlot(0, 'FC'))).state;
    expect(getPower(theirTurn, at(theirTurn, 0, 'FC'))).toBe(4500);
  });

  it('SAO/S80-097: a climax giving all your characters +1000 and soul +1, with the soul and gate trigger icons', () => {
    expect(getCard(O('S80-097')).def).toMatchObject({ kind: 'CLIMAX', color: 'blue', triggers: ['SOUL', 'GATE'] });
    const state = others({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, O('S71-016'), stageSlot(0, 'FC'));
      take(ctx, 0, O('S80-097'), { player: 0, zone: 'climax' });
    }).state;
    expect([getPower(state, at(state, 0, 'FC')), getSoul(state, at(state, 0, 'FC'))]).toEqual([5500, 2]);
  });
});
