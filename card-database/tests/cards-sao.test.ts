/**
 * Tests for the SAO/S20 cards in the database, using the real card data.
 * Player 0 uses these cards; player 1 uses the 涼宮ハルヒ trial deck cards.
 */

import { describe, expect, it } from 'vitest';
import { type Choice, type Ctx, type GameState, type PlayerId, getCardLevel, getInstance, getPower, getSoul, stageSlot } from '@wso/game-engine';
import { getCard } from '../src/index';
import { HARUHI, SAO, answer, answerAll, oid, pending, scenario, stackTop, take } from './helpers';
import type { RealScenario } from './helpers';

const S = (n: number): string => `SAO/S20-${String(n).padStart(3, '0')}`;
const SY = (n: number): string => `SY/W08-T${String(n).padStart(2, '0')}`;

const sao = (options: Omit<RealScenario, 'sets'>, arrange: (ctx: Ctx) => void = () => {}) => scenario({ ...options, sets: [SAO, HARUHI] }, arrange);

const at = (state: GameState, player: PlayerId, slot: 'FL' | 'FC' | 'FR' | 'BL' | 'BR'): number => state.zones[player].stage[slot][0]!;
const cardIn = (state: GameState, ids: readonly number[], cardId: string): number => ids.find((id) => getInstance(state, id).cardId === cardId)!;
const cardIdOfObject = (state: GameState, objectId: number): string => state.instances.find((i) => i.objectId === objectId)!.cardId;

/** Player 1's deck top without climaxes, so damage to player 1 is never cancelled. */
const safeTopForP1 = (ctx: Ctx): void => {
  stackTop(ctx, 1, [SY(12), SY(12), SY(12), SY(15), SY(15), SY(15)]);
};
/** Player 0's deck top without climaxes (trigger checks and damage without surprises). */
const plainTopForP0 = (ctx: Ctx): void => {
  stackTop(ctx, 0, [S(83), S(83), S(94), S(94), S(15)]);
};

/**
 * Answers the routine decisions until `stop` holds: no more attacks, no
 * counter, and when several encores wait, the card's own (given) one first.
 */
function until(state: GameState, stop: (s: GameState) => boolean): GameState {
  let current = state;
  for (let i = 0; i < 50 && !stop(current); i++) {
    const d = current.pending!;
    let choice: Choice;
    if (d.kind === 'ATTACK') choice = { kind: 'ATTACK', attack: null };
    else if (d.kind === 'COUNTER') choice = { kind: 'COUNTER', card: null };
    else if (d.kind === 'CONFIRM' && d.prompt === 'ENCORE') choice = { kind: 'CONFIRM', accept: false };
    else if (d.kind === 'CHOOSE_ABILITY') choice = { kind: 'CHOOSE_ABILITY', id: (d.abilities.find((a) => a.type === 'CARD') ?? d.abilities[0]!).id };
    else if (d.kind === 'SELECT_OPTION') choice = { kind: 'SELECT_OPTION', option: d.options[0]! };
    else throw new Error(`Unexpected ${d.kind} ${JSON.stringify(d).slice(0, 160)}`);
    current = answer(current, choice).state;
  }
  return current;
}

describe('SAO/S20 ソードアート・オンライン', () => {
  it('SAO/S20-017: a character without text has only its printed values', () => {
    expect(getCard(S(17)).def).toMatchObject({ kind: 'CHARACTER', color: 'yellow', level: 0, cost: 0, power: 3000, soul: 1, triggers: [], traits: ['アバター', '武器'] });
    expect(getCard(S(17)).def.abilities).toBeUndefined();
  });

  it('SAO/S20-001: +1000 with three other 《アバター》 or 《ネット》 characters; with 《スター・スプラッシュ》 its attack may pay (1) to search the deck', () => {
    const two = sao({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, S(1), stageSlot(0, 'FC'));
      take(ctx, 0, S(15), stageSlot(0, 'FL'));
      take(ctx, 0, S(84), stageSlot(0, 'FR'));
    }).state;
    expect(getPower(two, at(two, 0, 'FC'))).toBe(4500);
    const three = sao({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, S(1), stageSlot(0, 'FC'));
      take(ctx, 0, S(15), stageSlot(0, 'FL'));
      take(ctx, 0, S(84), stageSlot(0, 'FR'));
      take(ctx, 0, S(34), stageSlot(0, 'BL'));
    }).state;
    expect(getPower(three, at(three, 0, 'FC'))).toBe(5500);

    const attack = (climax: string | null) =>
      sao({ step: 'ATTACK_START' }, (ctx) => {
        take(ctx, 0, S(1), stageSlot(0, 'FC'));
        if (climax) take(ctx, 0, climax, { player: 0, zone: 'climax' });
        take(ctx, 0, S(17), { player: 0, zone: 'stock' });
        plainTopForP0(ctx);
        safeTopForP1(ctx);
      }).state;
    const withoutCombo = attack(S(25));
    const noAsk = answer(withoutCombo, { kind: 'ATTACK', attack: { attacker: oid(withoutCombo, at(withoutCombo, 0, 'FC')), type: 'DIRECT' } });
    expect(noAsk.events.some((e) => e.type === 'ABILITY_PLAYED')).toBe(false);

    const start = attack(S(24));
    const atPay = answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, at(start, 0, 'FC')), type: 'DIRECT' } }).state;
    expect(pending(atPay, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST', ability: 1 });
    const atSearch = answer(atPay, { kind: 'CONFIRM', accept: true }).state;
    const search = pending(atSearch, 'SELECT_CARDS');
    expect(search).toMatchObject({ prompt: 'EFFECT_CHOOSE', min: 0, max: 1 });
    // Only 《アバター》 or 《ネット》 characters may be chosen; the whole deck may be looked at.
    expect(search.cards.every((o) => getCard(cardIdOfObject(atSearch, o)).def.traits.some((t) => t === 'アバター' || t === 'ネット'))).toBe(true);
    expect(Object.keys(search.look!).length).toBe(atSearch.zones[0].deck.length);
    const chosen = search.cards[0]!;
    const { state, events } = answer(atSearch, { kind: 'SELECT_CARDS', cards: [chosen] });
    expect(state.zones[0].hand.map((id) => getInstance(state, id).cardId)).toEqual([cardIdOfObject(atSearch, chosen)]);
    expect(events.some((e) => e.type === 'CARD_REVEALED')).toBe(true);
    expect(events.some((e) => e.type === 'DECK_SHUFFLED' && e.player === 0)).toBe(true);
    expect(state.zones[0].stock).toHaveLength(1); // paid 1, then the trigger check card went to stock
  });

  describe('SAO/S20-004 and SAO/S20-086: a character with a partner gets +1000 and an encore that discards a character', () => {
    const reversed = (self: string, partner: string | null) =>
      sao({ step: 'ATTACK_START', turnPlayer: 1 }, (ctx) => {
        take(ctx, 0, self, stageSlot(0, 'FC'));
        if (partner) take(ctx, 0, partner, stageSlot(0, 'BL'));
        take(ctx, 0, S(17), { player: 0, zone: 'hand' });
        take(ctx, 1, SY(7), stageSlot(1, 'FC'));
        stackTop(ctx, 1, [SY(12)]);
        stackTop(ctx, 0, [S(15)]);
      }).state;

    for (const [self, partner, word] of [
      [S(4), S(83), 'キリト'],
      [S(86), S(15), 'アスナ'],
    ] as const) {
      it(`${self}: with a character whose name contains 「${word}」, +1000 and, when reversed, an encore paid with a character from hand`, () => {
        const start = reversed(self, partner);
        const card = at(start, 0, 'FC');
        expect(getPower(start, card)).toBe(getCard(self).def.power! + 1000);
        const attacker = at(start, 1, 'FC');
        const atEncore = until(answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, attacker), type: 'FRONT' } }).state, (s) => s.pending?.kind === 'CONFIRM' && s.pending.prompt === 'PAY_COST');
        expect(pending(atEncore, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST', cardId: self });
        const atDiscard = answer(atEncore, { kind: 'CONFIRM', accept: true }).state;
        const { state, events } = answer(atDiscard, { kind: 'SELECT_CARDS', cards: pending(atDiscard, 'SELECT_CARDS').cards });
        expect(state.zones[0].stage.FC.map((id) => getInstance(state, id).cardId)).toEqual([self]);
        // Back in its slot, rested (it stands again in your next stand phase).
        // (A card's own encore is an ability effect; the rules' encore [3] was not used.)
        expect(events.find((e) => e.type === 'CARD_MOVED' && e.to.zone === 'stage')).toMatchObject({ cardId: self, orientation: 'REST', reason: 'EFFECT', to: { zone: 'stage', slot: 'FC' } });
      });

      it(`${self}: without such a character, neither the power nor the encore`, () => {
        const start = reversed(self, null);
        expect(getPower(start, at(start, 0, 'FC'))).toBe(getCard(self).def.power!);
        const attacker = at(start, 1, 'FC');
        const after = until(answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, attacker), type: 'FRONT' } }).state, (s) => s.turn?.player === 0);
        expect(after.zones[0].waitingRoom.map((id) => getInstance(after, id).cardId)).toContain(self);
        expect(after.zones[0].stage.FC).toEqual([]);
      });
    }
  });

  it('SAO/S20-008: 応援 +500 from the back row; when your climax is placed, a character gets +1000', () => {
    const start = sao({ step: 'CLIMAX_START' }, (ctx) => {
      take(ctx, 0, S(8), stageSlot(0, 'BL'));
      take(ctx, 0, S(17), stageSlot(0, 'FL'));
      take(ctx, 0, S(17), stageSlot(0, 'FR'));
      take(ctx, 0, S(100), { player: 0, zone: 'hand' });
      take(ctx, 0, S(84), { player: 0, zone: 'clock' }); // blue, for the colour of the climax
    }).state;
    const fl = at(start, 0, 'FL');
    expect(getPower(start, fl)).toBe(3500);
    expect(getPower(start, at(start, 0, 'FR'))).toBe(3000);
    const atChoose = answer(start, { kind: 'CLIMAX', card: oid(start, start.zones[0].hand[0]!) }).state;
    const { state } = answer(atChoose, { kind: 'SELECT_CARDS', cards: [oid(atChoose, fl)] });
    expect(getPower(state, fl)).toBe(4500);
  });

  it('SAO/S20-009 チェンジ: at the start of your climax phase it may pay (1) and a hand card to become 「囚われの女王 アスナ」', () => {
    const start = sao({ step: 'CLIMAX_START' }, (ctx) => {
      take(ctx, 0, S(9), stageSlot(0, 'FL'));
      take(ctx, 0, S(4), { player: 0, zone: 'waitingRoom' });
      take(ctx, 0, S(17), { player: 0, zone: 'hand' });
      take(ctx, 0, S(17), { player: 0, zone: 'stock' });
    }).state;
    expect(pending(start, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST', ability: 0 });
    const atDiscard = answer(start, { kind: 'CONFIRM', accept: true }).state;
    const atChoose = answer(atDiscard, { kind: 'SELECT_CARDS', cards: pending(atDiscard, 'SELECT_CARDS').cards }).state;
    const queen = cardIn(atChoose, atChoose.zones[0].waitingRoom, S(4));
    expect(pending(atChoose, 'SELECT_CARDS').cards).toEqual([oid(atChoose, queen)]);
    const { state } = answer(atChoose, { kind: 'SELECT_CARDS', cards: [oid(atChoose, queen)] });
    expect(state.zones[0].stage.FL).toEqual([queen]);
    expect(state.zones[0].waitingRoom.map((id) => getInstance(state, id).cardId).sort()).toEqual([S(17), S(17), S(9)].sort());
  });

  describe('助太刀 (backup)', () => {
    const attacked = (backupCard: string, level: number, ownStage: string[]) =>
      sao({ step: 'ATTACK_START', turnPlayer: 1 }, (ctx) => {
        take(ctx, 1, SY(1), stageSlot(1, 'FC')); // 3000: the defender survives, so its power can be read
        take(ctx, 1, SY(1), stageSlot(1, 'FL')); // a second attacker keeps the turn going (the power lasts the turn)
        ownStage.forEach((id, i) => take(ctx, 0, id, stageSlot(0, (['FC', 'FL', 'FR'] as const)[i]!)));
        take(ctx, 0, backupCard, { player: 0, zone: 'hand' });
        take(ctx, 0, S(94), { player: 0, zone: 'stock' });
        for (let i = 0; i < level; i++) take(ctx, 0, S(84), { player: 0, zone: 'level' });
        stackTop(ctx, 1, [SY(12)]);
        stackTop(ctx, 0, [S(15), S(15)]);
      }).state;
    const front = (start: GameState) => answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, at(start, 1, 'FC')), type: 'FRONT' } }).state;

    it('SAO/S20-010 助太刀1000 レベル1: with two 《アバター》 or 《ネット》 characters, using it also gives a character +1000', () => {
      const atCounter = front(attacked(S(10), 1, [S(17), S(15)]));
      const backup = pending(atCounter, 'COUNTER').backups[0]!;
      expect(backup.ability).toBe(1);
      const atAttacked = answer(atCounter, { kind: 'COUNTER', card: backup.card, ability: backup.ability }).state;
      const defender = at(atAttacked, 0, 'FC');
      const atBonus = answer(atAttacked, { kind: 'SELECT_CARDS', cards: [oid(atAttacked, defender)] }).state;
      const bonus = pending(atBonus, 'SELECT_CARDS');
      const { state } = answer(atBonus, { kind: 'SELECT_CARDS', cards: [oid(atBonus, defender)] });
      expect(bonus.cards).toHaveLength(2);
      expect(getPower(state, defender)).toBe(3000 + 1000 + 1000);
    });

    it('SAO/S20-010: with only one such character the extra +1000 does not happen', () => {
      const atCounter = front(attacked(S(10), 1, [S(17)]));
      const backup = pending(atCounter, 'COUNTER').backups[0]!;
      const atAttacked = answer(atCounter, { kind: 'COUNTER', card: backup.card, ability: backup.ability }).state;
      const defender = at(atAttacked, 0, 'FC');
      const after = answer(atAttacked, { kind: 'SELECT_CARDS', cards: [oid(atAttacked, defender)] }).state;
      expect(after.pending?.kind).not.toBe('SELECT_CARDS');
    });

    it('SAO/S20-093 助太刀3000 レベル2: offered only at level 2; costs (1)', () => {
      expect(pending(front(attacked(S(93), 1, [S(17)])), 'COUNTER').backups).toEqual([]);
      const atCounter = front(attacked(S(93), 2, [S(17)]));
      const backup = pending(atCounter, 'COUNTER').backups[0]!;
      const atAttacked = answer(atCounter, { kind: 'COUNTER', card: backup.card, ability: backup.ability }).state;
      expect(atAttacked.zones[0].stock).toHaveLength(0);
      const defender = at(atAttacked, 0, 'FC');
      const { state } = answer(atAttacked, { kind: 'SELECT_CARDS', cards: [oid(atAttacked, defender)] });
      expect(getPower(state, defender)).toBe(6000);
    });
  });

  it('SAO/S20-014 絆: played from hand, may put the top deck card into the clock to return 「血盟騎士団への入団 キリト」; its (1) ability gives an 《アバター》 +500', () => {
    const start = sao({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, S(14), { player: 0, zone: 'hand' });
      take(ctx, 0, S(94), { player: 0, zone: 'waitingRoom' });
      take(ctx, 0, S(17), { player: 0, zone: 'stock' });
      take(ctx, 0, S(17), stageSlot(0, 'FL'));
    }).state;
    const t14 = start.zones[0].hand[0]!;
    const atPay = answer(start, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(start, t14), slot: 'FC' } }).state;
    expect(pending(atPay, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST', ability: 0 });
    const atChoose = answer(atPay, { kind: 'CONFIRM', accept: true }).state;
    expect(atChoose.zones[0].clock).toHaveLength(1);
    const kirito = cardIn(atChoose, atChoose.zones[0].waitingRoom, S(94));
    const after = answer(atChoose, { kind: 'SELECT_CARDS', cards: [oid(atChoose, kirito)] }).state;
    expect(after.zones[0].hand).toEqual([kirito]);

    const fl = at(after, 0, 'FL');
    const atTarget = answer(after, { kind: 'MAIN', action: { type: 'ACTIVATE', card: oid(after, at(after, 0, 'FC')), ability: 1 } }).state;
    const { state } = answer(atTarget, { kind: 'SELECT_CARDS', cards: [oid(atTarget, fl)] });
    expect(getPower(state, fl)).toBe(3500);
    expect(state.zones[0].stock).toHaveLength(0);
  });

  it('SAO/S20-015, SAO/S20-084, SAO/S20-094: +1000 in your turn / in the opponent’s turn', () => {
    const arrange = (ctx: Ctx): void => {
      take(ctx, 0, S(15), stageSlot(0, 'FL'));
      take(ctx, 0, S(84), stageSlot(0, 'FC'));
      take(ctx, 0, S(94), stageSlot(0, 'FR'));
    };
    const mine = sao({ step: 'MAIN_START' }, arrange).state;
    expect(['FL', 'FC', 'FR'].map((s) => getPower(mine, at(mine, 0, s as 'FL')))).toEqual([3500, 2500, 8000]);
    const theirs = sao({ step: 'MAIN_START', turnPlayer: 1 }, arrange).state;
    expect(['FL', 'FC', 'FR'].map((s) => getPower(theirs, at(theirs, 0, s as 'FL')))).toEqual([2500, 3500, 9000]);
  });

  it('SAO/S20-020: in your turn with two other 《アバター》 characters, level +1 and +1500', () => {
    const arrange = (others: number) => (ctx: Ctx): void => {
      take(ctx, 0, S(20), stageSlot(0, 'FC'));
      for (let i = 0; i < others; i++) take(ctx, 0, S(17), stageSlot(0, (['FL', 'FR'] as const)[i]!));
    };
    const two = sao({ step: 'MAIN_START' }, arrange(2)).state;
    expect([getCardLevel(two, at(two, 0, 'FC')), getPower(two, at(two, 0, 'FC'))]).toEqual([3, 10000]);
    const one = sao({ step: 'MAIN_START' }, arrange(1)).state;
    expect([getCardLevel(one, at(one, 0, 'FC')), getPower(one, at(one, 0, 'FC'))]).toEqual([2, 8500]);
    const theirTurn = sao({ step: 'MAIN_START', turnPlayer: 1 }, arrange(2)).state;
    expect(getPower(theirTurn, at(theirTurn, 0, 'FC'))).toBe(8500);
  });

  it('SAO/S20-022 身代わり: a counter event that gives an 《アバター》 or 《ネット》 character +3500 (level and colour needed)', () => {
    const attacked = (colour: boolean) =>
      sao({ step: 'ATTACK_START', turnPlayer: 1 }, (ctx) => {
        take(ctx, 1, SY(7), stageSlot(1, 'FC'));
        take(ctx, 0, S(17), stageSlot(0, 'FC'));
        take(ctx, 0, S(22), { player: 0, zone: 'hand' });
        take(ctx, 0, S(17), { player: 0, zone: 'stock' });
        take(ctx, 0, colour ? S(17) : S(84), { player: 0, zone: 'level' });
        stackTop(ctx, 1, [SY(12)]);
        stackTop(ctx, 0, [S(15)]);
      }).state;
    const counter = (start: GameState) => answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, at(start, 1, 'FC')), type: 'FRONT' } }).state;
    expect(pending(counter(attacked(false)), 'COUNTER').cards).toEqual([]);
    const atCounter = counter(attacked(true));
    const event = pending(atCounter, 'COUNTER').cards[0]!;
    const atChoose = answer(atCounter, { kind: 'COUNTER', card: event }).state;
    const defender = at(atChoose, 0, 'FC');
    const { state } = answer(atChoose, { kind: 'SELECT_CARDS', cards: [oid(atChoose, defender)] });
    // 3000 + 3500 against 9000: still reversed, but the power was given.
    expect(state.zones[0].waitingRoom.map((id) => getInstance(state, id).cardId)).toContain(S(22));
  });

  it('SAO/S20-023 and SAO/S20-099: placed from hand, draw 1 and give a character +2000 power and +1 soul', () => {
    for (const climax of [S(23), S(99)]) {
      const start = sao({ step: 'CLIMAX_START' }, (ctx) => {
        take(ctx, 0, climax, { player: 0, zone: 'hand' });
        take(ctx, 0, S(17), stageSlot(0, 'FC'));
        take(ctx, 0, climax === S(23) ? S(15) : S(84), { player: 0, zone: 'clock' }); // a card of the climax's colour
      }).state;
      const target = at(start, 0, 'FC');
      const atChoose = answer(start, { kind: 'CLIMAX', card: oid(start, start.zones[0].hand[0]!) }).state;
      expect(atChoose.zones[0].hand).toHaveLength(1);
      const { state } = answer(atChoose, { kind: 'SELECT_CARDS', cards: [oid(atChoose, target)] });
      expect([getPower(state, target), getSoul(state, target)]).toEqual([5000, 2]);
    }
  });

  it('SAO/S20-024, SAO/S20-025, SAO/S20-045, SAO/S20-098, SAO/S20-100: climax continuous abilities and their trigger icons', () => {
    expect(getCard(S(24)).def.triggers).toEqual(['SOUL', 'RETURN']);
    expect(getCard(S(25)).def.triggers).toEqual(['SOUL', 'SHOT']);
    expect(getCard(S(45)).def.triggers).toEqual(['TREASURE']);
    expect(getCard(S(98)).def.triggers).toEqual(['DRAW']);
    expect(getCard(S(100)).def.triggers).toEqual(['SOUL', 'SOUL']);
    for (const [climax, power, soul] of [
      [S(24), 4000, 2],
      [S(45), 4000, 2],
      [S(98), 4000, 2],
      [S(100), 3000, 3],
    ] as const) {
      const state = sao({ step: 'MAIN_START' }, (ctx) => {
        take(ctx, 0, S(17), stageSlot(0, 'FC'));
        take(ctx, 0, climax, { player: 0, zone: 'climax' });
      }).state;
      expect([getPower(state, at(state, 0, 'FC')), getSoul(state, at(state, 0, 'FC'))], climax).toEqual([power, soul]);
    }
  });

  describe('trigger icons of the real climaxes', () => {
    const attackRevealing = (climax: string) =>
      sao({ step: 'ATTACK_START' }, (ctx) => {
        take(ctx, 0, S(17), stageSlot(0, 'FC'));
        stackTop(ctx, 0, [climax]);
        safeTopForP1(ctx);
      }).state;
    const attack = (start: GameState) => answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, at(start, 0, 'FC')), type: 'DIRECT' } }).state;

    it('SAO/S20-098 Draw: the player may draw a card', () => {
      const atDraw = attack(attackRevealing(S(98)));
      expect(pending(atDraw, 'CONFIRM').prompt).toBe('TRIGGER_DRAW');
      const { state } = answer(atDraw, { kind: 'CONFIRM', accept: true });
      expect(state.zones[0].hand).toHaveLength(1);
    });

    it('SAO/S20-045 Treasure: the climax goes to hand; the player may put the top deck card into the stock', () => {
      const atStock = attack(attackRevealing(S(45)));
      expect(pending(atStock, 'CONFIRM').prompt).toBe('TRIGGER_TREASURE_STOCK');
      const { state } = answer(atStock, { kind: 'CONFIRM', accept: true });
      expect(state.zones[0].hand.map((id) => getInstance(state, id).cardId)).toEqual([S(45)]);
      expect(state.zones[0].stock).toHaveLength(1);
    });

    it('SAO/S20-025 Shot: when the attacker’s next damage is cancelled, 1 damage', () => {
      const start = sao({ step: 'ATTACK_START' }, (ctx) => {
        take(ctx, 0, S(17), stageSlot(0, 'FC'));
        stackTop(ctx, 0, [S(25)]);
        stackTop(ctx, 1, [SY(10), SY(12), SY(12)]);
      }).state;
      const atOrder = answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, at(start, 0, 'FC')), type: 'DIRECT' } }).state;
      // Two different icons: the player chooses the order (CR-7.3.1.2.1).
      expect(pending(atOrder, 'SELECT_OPTION')).toMatchObject({ prompt: 'TRIGGER_ORDER', options: ['SOUL', 'SHOT'] });
      const { events } = answer(atOrder, { kind: 'SELECT_OPTION', option: 'SHOT' });
      const dealt = events.filter((e) => e.type === 'DAMAGE_DEALT');
      // Soul 1 + 1 (direct) + 1 (soul icon) = 3, cancelled by the climax on top; then the shot deals 1.
      expect(dealt.map((e) => e.type === 'DAMAGE_DEALT' && [e.amount, e.cancelled])).toEqual([
        [3, true],
        [1, false],
      ]);
    });

    it('SAO/S20-024 Return: the player may return an opponent’s character to hand', () => {
      const start = sao({ step: 'ATTACK_START' }, (ctx) => {
        take(ctx, 0, S(17), stageSlot(0, 'FC'));
        take(ctx, 1, SY(1), stageSlot(1, 'FL'));
        stackTop(ctx, 0, [S(24)]);
        safeTopForP1(ctx);
      }).state;
      const atOrder = answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, at(start, 0, 'FC')), type: 'DIRECT' } }).state;
      const atReturn = answer(atOrder, { kind: 'SELECT_OPTION', option: 'RETURN' }).state;
      expect(pending(atReturn, 'SELECT_CARDS').prompt).toBe('TRIGGER_RETURN');
      const target = at(atReturn, 1, 'FL');
      const { state } = answer(atReturn, { kind: 'SELECT_CARDS', cards: [oid(atReturn, target)] });
      expect(state.zones[1].hand).toContain(target);
    });
  });

  it('SAO/S20-034 集中: (1) to turn over four cards; +3000 for each climax among them', () => {
    const start = sao({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, S(34), stageSlot(0, 'FC'));
      take(ctx, 0, S(17), { player: 0, zone: 'stock' });
      stackTop(ctx, 0, [S(24), S(17), S(98), S(15)]);
    }).state;
    const card = at(start, 0, 'FC');
    const { state } = answer(start, { kind: 'MAIN', action: { type: 'ACTIVATE', card: oid(start, card), ability: 0 } });
    expect(state.zones[0].waitingRoom).toHaveLength(5);
    expect(getPower(state, card)).toBe(2500 + 6000);
  });

  it('SAO/S20-044: placed from hand, the top deck card goes to stock and all your characters get +1 soul', () => {
    const start = sao({ step: 'CLIMAX_START' }, (ctx) => {
      take(ctx, 0, S(44), { player: 0, zone: 'hand' });
      take(ctx, 0, S(34), { player: 0, zone: 'clock' });
      take(ctx, 0, S(17), stageSlot(0, 'FL'));
      take(ctx, 0, S(17), stageSlot(0, 'FR'));
    }).state;
    const { state } = answer(start, { kind: 'CLIMAX', card: oid(start, start.zones[0].hand[0]!) });
    expect(state.zones[0].stock).toHaveLength(1);
    expect([getSoul(state, at(state, 0, 'FL')), getSoul(state, at(state, 0, 'FR'))]).toEqual([2, 2]);
  });

  it('SAO/S20-079: played from hand, may pay (1) and a hand card to search the deck for an 《アバター》 character', () => {
    const start = sao({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, S(79), { player: 0, zone: 'hand' });
      take(ctx, 0, S(34), { player: 0, zone: 'hand' });
      take(ctx, 0, S(17), { player: 0, zone: 'stock' });
    }).state;
    const t79 = cardIn(start, start.zones[0].hand, S(79));
    const atPay = answerAll(start, [
      { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(start, t79), slot: 'FC' } },
      { kind: 'CONFIRM', accept: true },
    ]).state;
    const atSearch = answer(atPay, { kind: 'SELECT_CARDS', cards: pending(atPay, 'SELECT_CARDS').cards }).state;
    const search = pending(atSearch, 'SELECT_CARDS');
    // 剣道少女 直葉 is a 《ネット》 character, not 《アバター》: never offered.
    expect(search.cards.every((o) => getCard(cardIdOfObject(atSearch, o)).def.traits.includes('アバター'))).toBe(true);
    const { state } = answer(atSearch, { kind: 'SELECT_CARDS', cards: [search.cards[0]!] });
    expect(state.zones[0].hand).toHaveLength(1);
    // The stock card paid and the discarded hand card.
    expect(state.zones[0].waitingRoom.map((id) => getInstance(state, id).cardId).sort()).toEqual([S(17), S(34)].sort());
  });

  it('SAO/S20-083: without other characters, level +1 and +1500', () => {
    const alone = sao({ step: 'MAIN_START' }, (ctx) => take(ctx, 0, S(83), stageSlot(0, 'FC'))).state;
    expect([getCardLevel(alone, at(alone, 0, 'FC')), getPower(alone, at(alone, 0, 'FC'))]).toEqual([1, 4000]);
    const company = sao({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, S(83), stageSlot(0, 'FC'));
      take(ctx, 0, S(17), stageSlot(0, 'BL'));
    }).state;
    expect([getCardLevel(company, at(company, 0, 'FC')), getPower(company, at(company, 0, 'FC'))]).toEqual([0, 2500]);
  });

  it('SAO/S20-085: your other 「アスナ」 characters +500; in the opponent’s turn all your other characters +500', () => {
    const arrange = (ctx: Ctx): void => {
      take(ctx, 0, S(85), stageSlot(0, 'BL'));
      take(ctx, 0, S(17), stageSlot(0, 'FL')); // 戦いのはじまり アスナ
      take(ctx, 0, S(84), stageSlot(0, 'FC')); // 月夜の黒猫団 サチ
    };
    const mine = sao({ step: 'MAIN_START' }, arrange).state;
    expect([getPower(mine, at(mine, 0, 'FL')), getPower(mine, at(mine, 0, 'FC')), getPower(mine, at(mine, 0, 'BL'))]).toEqual([3500, 2500, 3000]);
    const theirs = sao({ step: 'MAIN_START', turnPlayer: 1 }, arrange).state;
    // サチ also has +1000 of its own in the opponent's turn.
    expect([getPower(theirs, at(theirs, 0, 'FL')), getPower(theirs, at(theirs, 0, 'FC')), getPower(theirs, at(theirs, 0, 'BL'))]).toEqual([4000, 4000, 3000]);
  });

  it('SAO/S20-089 絆: the bond may be paid even when no 「着替え中のアスナ」 is in the waiting room; it then returns nothing', () => {
    const start = sao({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, S(89), { player: 0, zone: 'hand' });
      take(ctx, 0, S(17), { player: 0, zone: 'stock' });
    }).state;
    const atPay = answer(start, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(start, start.zones[0].hand[0]!), slot: 'FC' } }).state;
    expect(pending(atPay, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST', ability: 0 });
    const { state } = answer(atPay, { kind: 'CONFIRM', accept: true });
    expect(state.zones[0].stock).toHaveLength(0);
    expect(state.zones[0].hand).toHaveLength(0);
    expect(state.pending?.kind).toBe('MAIN');
  });
});
