/**
 * Tests for every card of the 五等分の花嫁 一花 Trial Deck+, using the real
 * card data. Player 0 uses these cards; player 1 uses the 涼宮ハルヒ cards.
 */

import { describe, expect, it } from 'vitest';
import { type Ctx, type GameState, type PlayerId, getInstance, getPower, getSoul, stageSlot } from '@wso/game-engine';
import { getCard } from '../src/index';
import { HARUHI, ICHIKA, answer, answerAll, oid, pending, scenario, stackTop, take } from './helpers';
import type { RealScenario } from './helpers';

const HY = (n: number): string => `5HY/W83-T${String(n).padStart(2, '0')}`;
const SY = (n: number): string => `SY/W08-T${String(n).padStart(2, '0')}`;

const ichika = (options: Omit<RealScenario, 'sets'>, arrange: (ctx: Ctx) => void = () => {}) =>
  scenario({ ...options, sets: [ICHIKA, HARUHI] }, arrange);

/** Player 1's deck top without climaxes, so damage to player 1 is never cancelled. */
const safeTopForP1 = (ctx: Ctx): void => {
  stackTop(ctx, 1, [SY(12), SY(12), SY(12), SY(15), SY(15), SY(15)]);
};

const at = (state: GameState, player: PlayerId, slot: 'FL' | 'FC' | 'FR' | 'BL' | 'BR'): number => state.zones[player].stage[slot][0]!;
const cardIn = (state: GameState, ids: readonly number[], cardId: string): number => ids.find((id) => getInstance(state, id).cardId === cardId)!;
const nameOfObject = (state: GameState, objectId: number): string => state.instances.find((i) => i.objectId === objectId)!.cardId;

describe('5HY/W83 Trial Deck+ 一花', () => {
  it('5HY/W83-T09: a character without text has only its printed values', () => {
    expect(getCard(HY(9)).def).toMatchObject({ level: 2, cost: 1, power: 8500, soul: 1, triggers: ['SOUL'] });
    expect(getCard(HY(9)).def.abilities).toBeUndefined();
  });

  it('5HY/W83-T01: in your turn, your other characters get +500', () => {
    const arrange = (ctx: Ctx): void => {
      take(ctx, 0, HY(1), stageSlot(0, 'BL'));
      take(ctx, 0, HY(9), stageSlot(0, 'FC'));
    };
    const mine = ichika({ step: 'MAIN_START' }, arrange).state;
    expect(getPower(mine, at(mine, 0, 'FC'))).toBe(9000);
    expect(getPower(mine, at(mine, 0, 'BL'))).toBe(500);
    const theirs = ichika({ step: 'MAIN_START', turnPlayer: 1 }, arrange).state;
    expect(getPower(theirs, at(theirs, 0, 'FC'))).toBe(8500);
  });

  it('5HY/W83-T01 集中: turn over four cards; for each climax among them, may draw one', () => {
    const start = ichika({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, HY(1), stageSlot(0, 'FC'));
      take(ctx, 0, HY(14), { player: 0, zone: 'stock' });
      stackTop(ctx, 0, [HY(12), HY(9), HY(18), HY(9)]);
    }).state;
    const atFirst = answer(start, { kind: 'MAIN', action: { type: 'ACTIVATE', card: oid(start, at(start, 0, 'FC')), ability: 1 } }).state;
    // Two climaxes: two "draw up to one" questions.
    expect(atFirst.zones[0].waitingRoom).toHaveLength(5);
    expect(pending(atFirst, 'CONFIRM').prompt).toBe('USE_ABILITY');
    const atSecond = answer(atFirst, { kind: 'CONFIRM', accept: true }).state;
    expect(pending(atSecond, 'CONFIRM').prompt).toBe('USE_ABILITY');
    const { state } = answer(atSecond, { kind: 'CONFIRM', accept: false });
    expect(state.zones[0].hand).toHaveLength(1);
    expect(getInstance(state, at(state, 0, 'FC')).orientation).toBe('REST');
  });

  it('5HY/W83-T02: 「居眠り 中野 一花」 gets +1500 and an encore that discards a 《五つ子》 character from hand', () => {
    const start = ichika({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, HY(2), stageSlot(0, 'BL'));
      take(ctx, 0, HY(9), stageSlot(0, 'FC'));
      take(ctx, 0, HY(14), { player: 0, zone: 'hand' });
      take(ctx, 0, HY(13), { player: 0, zone: 'hand' });
    }).state;
    const sleeper = at(start, 0, 'FC');
    expect(getPower(start, sleeper)).toBe(10000);

    const t14 = cardIn(start, start.zones[0].hand, HY(14));
    const atOrder = answer(start, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(start, t14), slot: 'FC' } }).state;
    const given = pending(atOrder, 'CHOOSE_ABILITY').abilities.find((a) => a.type === 'CARD')!;
    expect(given.granted).toBe(true);
    const atConfirm = answer(atOrder, { kind: 'CHOOSE_ABILITY', id: given.id }).state;
    expect(pending(atConfirm, 'CONFIRM').prompt).toBe('PAY_COST');
    const atDiscard = answer(atConfirm, { kind: 'CONFIRM', accept: true }).state;
    const t13 = cardIn(atDiscard, atDiscard.zones[0].hand, HY(13));
    expect(pending(atDiscard, 'SELECT_CARDS')).toMatchObject({ prompt: 'COST_DISCARD', cards: [oid(atDiscard, t13)] });
    const { state } = answer(atDiscard, { kind: 'SELECT_CARDS', cards: [oid(atDiscard, t13)] });
    expect(state.zones[0].stage.FC).toEqual([sleeper]);
    expect(getInstance(state, sleeper).orientation).toBe('REST');
  });

  it('5HY/W83-T02: when it leaves the stage, may pay (1) to return 「不意打ち」 from the waiting room to hand', () => {
    const start = ichika({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, HY(2), stageSlot(0, 'FC'));
      take(ctx, 0, HY(14), { player: 0, zone: 'hand' });
      take(ctx, 0, HY(11), { player: 0, zone: 'waitingRoom' });
      take(ctx, 0, HY(13), { player: 0, zone: 'stock' });
    }).state;
    const t14 = start.zones[0].hand[0]!;
    const atOrder = answer(start, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(start, t14), slot: 'FC' } }).state;
    const own = pending(atOrder, 'CHOOSE_ABILITY').abilities.find((a) => a.type === 'CARD')!;
    const atChoose = answerAll(atOrder, [
      { kind: 'CHOOSE_ABILITY', id: own.id },
      { kind: 'CONFIRM', accept: true },
    ]).state;
    const surprise = cardIn(atChoose, atChoose.zones[0].waitingRoom, HY(11));
    expect(pending(atChoose, 'SELECT_CARDS').cards).toEqual([oid(atChoose, surprise)]);
    const { state } = answer(atChoose, { kind: 'SELECT_CARDS', cards: [oid(atChoose, surprise)] });
    expect(state.zones[0].hand).toEqual([surprise]);
  });

  it('5HY/W83-T03: +1000 in your turn; when its battle opponent is reversed, another 《五つ子》 character is rested and moved to an empty back-row slot', () => {
    const start = ichika({ step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, HY(3), stageSlot(0, 'FC'));
      take(ctx, 0, HY(9), stageSlot(0, 'FL'));
      take(ctx, 0, HY(13), stageSlot(0, 'BL'));
      take(ctx, 1, SY(11), stageSlot(1, 'FC'));
      stackTop(ctx, 0, [HY(9)]);
      safeTopForP1(ctx);
    }).state;
    const t03 = at(start, 0, 'FC');
    const t09 = at(start, 0, 'FL');
    // 2000 + 1000 (your turn) + 500 (応援 of T13 behind it, CR-3.6.5).
    expect(getPower(start, t03)).toBe(3500);
    const atCounter = answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, t03), type: 'FRONT' } }).state;
    const atChoose = answer(atCounter, { kind: 'COUNTER', card: null }).state;
    const choose = pending(atChoose, 'SELECT_CARDS');
    expect(choose.cards.map((o) => nameOfObject(atChoose, o)).sort()).toEqual([HY(13), HY(9)].sort());
    const atSlot = answer(atChoose, { kind: 'SELECT_CARDS', cards: [oid(atChoose, t09)] }).state;
    // Only the empty back-row slot is offered.
    expect(pending(atSlot, 'SELECT_SLOT').slots).toEqual(['BR']);
    const { state } = answer(atSlot, { kind: 'SELECT_SLOT', slot: 'BR' });
    expect(state.zones[0].stage.BR).toEqual([t09]);
    expect(getInstance(state, t09).orientation).not.toBe('STAND');
  });

  it('5HY/W83-T04: from hand, another 《五つ子》 character gets +500 for each of your other 《五つ子》 characters', () => {
    const start = ichika({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, HY(9), stageSlot(0, 'FC'));
      take(ctx, 0, HY(13), stageSlot(0, 'BL'));
      take(ctx, 0, HY(4), { player: 0, zone: 'hand' });
    }).state;
    const t09 = at(start, 0, 'FC');
    const { state } = answerAll(start, [
      { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(start, start.zones[0].hand[0]!), slot: 'FR' } },
      { kind: 'SELECT_CARDS', cards: [oid(start, t09)] },
    ]);
    // Two other 《五つ子》 characters besides T04: +1000; plus 500 from the 応援 of T13 behind it.
    expect(getPower(state, t09)).toBe(10000);
  });

  describe('5HY/W83-T05', () => {
    const fight = (climax: boolean) => {
      const start = ichika({ step: 'ATTACK_START' }, (ctx) => {
        take(ctx, 0, HY(5), stageSlot(0, 'FC'));
        if (climax) take(ctx, 0, HY(12), { player: 0, zone: 'climax' });
        take(ctx, 1, SY(11), stageSlot(1, 'FC'));
        stackTop(ctx, 0, [HY(14)]);
        safeTopForP1(ctx);
      }).state;
      const t05 = at(start, 0, 'FC');
      expect(getPower(start, t05)).toBe(climax ? 6500 : 5500);
      const atCounter = answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, t05), type: 'FRONT' } }).state;
      return answer(atCounter, { kind: 'COUNTER', card: null });
    };

    it('5HY/W83-T05 CX combo: with 「頑張り者へのご褒美」, a reversed battle opponent lets it search the deck for a 《五つ子》 character, shown to the opponent', () => {
      const atSearch = fight(true).state;
      const choose = pending(atSearch, 'SELECT_CARDS');
      expect(choose.min).toBe(0);
      expect(choose.cards.every((o) => getCard(nameOfObject(atSearch, o)).def.traits.includes('五つ子'))).toBe(true);
      const pick = choose.cards.find((o) => nameOfObject(atSearch, o) === HY(10))!;
      const { state, events } = answer(atSearch, { kind: 'SELECT_CARDS', cards: [pick] });
      expect(events.some((e) => e.type === 'CARD_REVEALED' && e.cardId === HY(10))).toBe(true);
      expect(events.some((e) => e.type === 'DECK_SHUFFLED' && e.player === 0)).toBe(true);
      expect(state.zones[0].hand.map((id) => getInstance(state, id).cardId)).toEqual([HY(10)]);
    });

    it('5HY/W83-T05: without that climax nothing happens', () => {
      expect(fight(false).state.pending?.kind).not.toBe('SELECT_CARDS');
    });
  });

  it('5HY/W83-T06: +2000 when it attacks with two or more other 《五つ子》 characters', () => {
    const power = (others: number): number => {
      const start = ichika({ step: 'ATTACK_START' }, (ctx) => {
        take(ctx, 0, HY(6), stageSlot(0, 'FC'));
        if (others >= 1) take(ctx, 0, HY(14), stageSlot(0, 'BL'));
        if (others >= 2) take(ctx, 0, HY(14), stageSlot(0, 'BR'));
        take(ctx, 1, SY(12), stageSlot(1, 'FC'));
        stackTop(ctx, 0, [HY(14)]);
      }).state;
      const t06 = at(start, 0, 'FC');
      const atCounter = answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, t06), type: 'FRONT' } }).state;
      expect(atCounter.pending?.kind).toBe('COUNTER');
      return getPower(atCounter, t06);
    };
    expect(power(1)).toBe(5000);
    expect(power(2)).toBe(7000);
  });

  it('5HY/W83-T07: after its 助太刀 is used, may put the top card of the deck into stock when all your characters are 《五つ子》', () => {
    const start = ichika({ step: 'ATTACK_START', turnPlayer: 1 }, (ctx) => {
      take(ctx, 1, SY(7), stageSlot(1, 'FC'));
      take(ctx, 0, HY(9), stageSlot(0, 'FC'));
      take(ctx, 0, HY(7), { player: 0, zone: 'hand' });
      take(ctx, 0, HY(9), { player: 0, zone: 'level' });
      take(ctx, 0, HY(13), { player: 0, zone: 'stock' });
      stackTop(ctx, 1, [SY(12)]);
      stackTop(ctx, 0, [HY(14), HY(15), HY(15)]);
    }).state;
    const attacker = at(start, 1, 'FC');
    const atCounter = answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, attacker), type: 'FRONT' } }).state;
    const backup = pending(atCounter, 'COUNTER').backups[0]!;
    const atChoose = answer(atCounter, { kind: 'COUNTER', card: backup.card, ability: backup.ability }).state;
    const defender = at(atChoose, 0, 'FC');
    const atConfirm = answer(atChoose, { kind: 'SELECT_CARDS', cards: [oid(atChoose, defender)] }).state;
    expect(pending(atConfirm, 'CONFIRM')).toMatchObject({ player: 0, prompt: 'USE_ABILITY', ability: 0 });
    const { state } = answer(atConfirm, { kind: 'CONFIRM', accept: true });
    expect(state.zones[0].stock.map((id) => getInstance(state, id).cardId)).toEqual([HY(14)]);
    // 8500 + 2000 against 9000: the attacker is the one reversed.
    expect(state.zones[1].waitingRoom.some((id) => getInstance(state, id).cardId === SY(7))).toBe(true);
  });

  it('5HY/W83-T08 応援: the character in front gets +500 per level; its ability looks at up to two cards and takes one', () => {
    const start = ichika({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, HY(8), stageSlot(0, 'BL'));
      take(ctx, 0, HY(9), stageSlot(0, 'FL'));
      take(ctx, 0, HY(4), stageSlot(0, 'FC'));
      take(ctx, 0, HY(13), { player: 0, zone: 'stock' });
      take(ctx, 0, HY(13), { player: 0, zone: 'stock' });
      stackTop(ctx, 0, [HY(10), HY(15)]);
    }).state;
    expect(getPower(start, at(start, 0, 'FL'))).toBe(9500);
    expect(getPower(start, at(start, 0, 'FC'))).toBe(2500);

    const atFirst = answer(start, { kind: 'MAIN', action: { type: 'ACTIVATE', card: oid(start, at(start, 0, 'BL')), ability: 1 } }).state;
    expect(pending(atFirst, 'CONFIRM').prompt).toBe('LOOK_NEXT');
    const atSecond = answer(atFirst, { kind: 'CONFIRM', accept: true }).state;
    // The player sees the card looked at so far; the opponent does not.
    const look = pending(atSecond, 'CONFIRM').look!;
    expect(Object.values(look)).toEqual([HY(10)]);
    const atPick = answer(atSecond, { kind: 'CONFIRM', accept: true }).state;
    const pick = pending(atPick, 'SELECT_CARDS');
    expect(pick.cards).toHaveLength(2);
    const t15 = pick.cards.find((o) => nameOfObject(atPick, o) === HY(15))!;
    const { state } = answer(atPick, { kind: 'SELECT_CARDS', cards: [t15] });
    expect(state.zones[0].hand.map((id) => getInstance(state, id).cardId)).toEqual([HY(15)]);
    expect(state.zones[0].waitingRoom.map((id) => getInstance(state, id).cardId)).toContain(HY(10));
  });

  it('5HY/W83-T10: from hand it looks at up to X cards (X = your 《五つ子》 characters); when attacking, may pay to give them +500 and +1 soul', () => {
    const start = ichika({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, HY(9), stageSlot(0, 'FC'));
      take(ctx, 0, HY(10), { player: 0, zone: 'hand' });
      // Three yellow level cards: T10 is a yellow level 3 card.
      for (const n of [5, 6, 9]) take(ctx, 0, HY(n), { player: 0, zone: 'level' });
      take(ctx, 0, HY(13), { player: 0, zone: 'stock' });
      take(ctx, 0, HY(13), { player: 0, zone: 'stock' });
      stackTop(ctx, 0, [HY(14), HY(15), HY(16)]);
    }).state;
    let state = answer(start, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(start, start.zones[0].hand[0]!), slot: 'FL' } }).state;
    // X = 2 (T09 and T10 itself): two questions at most.
    for (let i = 0; i < 2; i++) state = answer(state, { kind: 'CONFIRM', accept: true }).state;
    const pick = pending(state, 'SELECT_CARDS');
    expect(pick.cards.map((o) => nameOfObject(state, o)).sort()).toEqual([HY(14), HY(15)]);

    const attack = ichika({ step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, HY(10), stageSlot(0, 'FC'));
      take(ctx, 0, HY(9), stageSlot(0, 'FL'));
      take(ctx, 0, HY(13), { player: 0, zone: 'stock' });
      take(ctx, 0, HY(14), { player: 0, zone: 'hand' });
      stackTop(ctx, 0, [HY(14)]);
      safeTopForP1(ctx);
    }).state;
    const t10 = at(attack, 0, 'FC');
    const t09 = at(attack, 0, 'FL');
    const { state: during } = answerAll(attack, [
      { kind: 'ATTACK', attack: { attacker: oid(attack, t10), type: 'DIRECT' } },
      { kind: 'CONFIRM', accept: true },
      { kind: 'SELECT_CARDS', cards: [oid(attack, attack.zones[0].hand[0]!)] },
    ]);
    // Stopped at the next attack declaration, with the bonus in place.
    expect(pending(during, 'ATTACK').player).toBe(0);
    expect([getPower(during, t09), getSoul(during, t09)]).toEqual([9000, 2]);
  });

  it('5HY/W83-T11: look at up to four, take a 《五つ子》 character shown to the opponent, discard the rest, then +3000 to a character', () => {
    const start = ichika({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, HY(11), { player: 0, zone: 'hand' });
      take(ctx, 0, HY(9), stageSlot(0, 'FC'));
      // A yellow level card: T11 is a yellow level 1 event.
      take(ctx, 0, HY(9), { player: 0, zone: 'level' });
      take(ctx, 0, HY(13), { player: 0, zone: 'stock' });
      stackTop(ctx, 0, [HY(12), HY(4), HY(9), HY(14)]);
    }).state;
    let state = answer(start, { kind: 'MAIN', action: { type: 'PLAY_EVENT', card: oid(start, start.zones[0].hand[0]!) } }).state;
    for (let i = 0; i < 4; i++) state = answer(state, { kind: 'CONFIRM', accept: true }).state;
    const pick = pending(state, 'SELECT_CARDS');
    // The climax cannot be taken.
    expect(pick.cards.map((o) => nameOfObject(state, o)).sort()).toEqual([HY(4), HY(9), HY(14)]);
    const t04 = pick.cards.find((o) => nameOfObject(state, o) === HY(4))!;
    const taken = answer(state, { kind: 'SELECT_CARDS', cards: [t04] });
    expect(taken.events.some((e) => e.type === 'CARD_REVEALED' && e.cardId === HY(4))).toBe(true);
    const target = at(taken.state, 0, 'FC');
    const { state: done } = answer(taken.state, { kind: 'SELECT_CARDS', cards: [oid(taken.state, target)] });
    expect(getPower(done, target)).toBe(11500);
    expect(done.zones[0].hand.map((id) => getInstance(done, id).cardId)).toEqual([HY(4)]);
    // Three looked-at cards and the event itself.
    expect(done.zones[0].waitingRoom).toHaveLength(5);
  });

  it('5HY/W83-T12 and 5HY/W83-T18: climaxes giving all your characters +1000 and +1 soul', () => {
    for (const climax of [HY(12), HY(18)]) {
      const { state } = ichika({ step: 'MAIN_START' }, (ctx) => {
        take(ctx, 0, HY(9), stageSlot(0, 'FC'));
        take(ctx, 0, climax, { player: 0, zone: 'climax' });
      });
      expect([getPower(state, at(state, 0, 'FC')), getSoul(state, at(state, 0, 'FC'))]).toEqual([9500, 2]);
    }
  });

  it('5HY/W83-T13: 応援 +500; when your climax is placed, a character gets +1000', () => {
    const start = ichika({ step: 'CLIMAX_START' }, (ctx) => {
      take(ctx, 0, HY(13), stageSlot(0, 'BL'));
      take(ctx, 0, HY(9), stageSlot(0, 'FL'));
      take(ctx, 0, HY(18), { player: 0, zone: 'hand' });
      take(ctx, 0, HY(14), { player: 0, zone: 'clock' });
    }).state;
    const t09 = at(start, 0, 'FL');
    expect(getPower(start, t09)).toBe(9000);
    const { state } = answerAll(start, [
      { kind: 'CLIMAX', card: oid(start, start.zones[0].hand[0]!) },
      { kind: 'SELECT_CARDS', cards: [oid(start, t09)] },
    ]);
    // 8500 + 500 (応援) + 1000 (climax) + 1000 (this ability).
    expect(getPower(state, t09)).toBe(11000);
  });

  it('5HY/W83-T14: +1500 while your stock has two cards or fewer', () => {
    const power = (stock: number): number => {
      const { state } = ichika({ step: 'MAIN_START' }, (ctx) => {
        take(ctx, 0, HY(14), stageSlot(0, 'FC'));
        for (let i = 0; i < stock; i++) take(ctx, 0, HY(13), { player: 0, zone: 'stock' });
      });
      return getPower(state, at(state, 0, 'FC'));
    };
    expect(power(2)).toBe(4000);
    expect(power(3)).toBe(2500);
  });

  it('5HY/W83-T15: +500 per other 《五つ子》 character; アンコール by discarding a character from hand', () => {
    const start = ichika({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, HY(15), stageSlot(0, 'FC'));
      take(ctx, 0, HY(9), stageSlot(0, 'FL'));
      take(ctx, 0, HY(9), stageSlot(0, 'FR'));
      take(ctx, 0, HY(14), { player: 0, zone: 'hand' });
      take(ctx, 0, HY(12), { player: 0, zone: 'hand' });
      take(ctx, 0, HY(13), { player: 0, zone: 'hand' });
    }).state;
    const t15 = at(start, 0, 'FC');
    expect(getPower(start, t15)).toBe(6500);

    const t14 = cardIn(start, start.zones[0].hand, HY(14));
    const atOrder = answer(start, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(start, t14), slot: 'FC' } }).state;
    const own = pending(atOrder, 'CHOOSE_ABILITY').abilities.find((a) => a.type === 'CARD')!;
    const atDiscard = answerAll(atOrder, [
      { kind: 'CHOOSE_ABILITY', id: own.id },
      { kind: 'CONFIRM', accept: true },
    ]).state;
    // Only characters may be discarded: not the climax.
    const discard = pending(atDiscard, 'SELECT_CARDS');
    expect(discard.cards.map((o) => nameOfObject(atDiscard, o))).toEqual([HY(13)]);
    const { state } = answer(atDiscard, { kind: 'SELECT_CARDS', cards: discard.cards });
    expect(state.zones[0].stage.FC).toEqual([t15]);
    expect(getInstance(state, t15).orientation).toBe('REST');
  });

  it('5HY/W83-T16: in your turn, +1000 per other 《五つ子》 character', () => {
    const arrange = (ctx: Ctx): void => {
      take(ctx, 0, HY(16), stageSlot(0, 'FC'));
      take(ctx, 0, HY(9), stageSlot(0, 'FL'));
      take(ctx, 0, HY(14), stageSlot(0, 'BR'));
    };
    const mine = ichika({ step: 'MAIN_START' }, arrange).state;
    expect(getPower(mine, at(mine, 0, 'FC'))).toBe(9500);
    const theirs = ichika({ step: 'MAIN_START', turnPlayer: 1 }, arrange).state;
    expect(getPower(theirs, at(theirs, 0, 'FC'))).toBe(7500);
  });

  it('5HY/W83-T17: from hand, may put the top clock card into the waiting room, and gets +1000 per 《五つ子》 character including itself', () => {
    const start = ichika({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, HY(17), { player: 0, zone: 'hand' });
      take(ctx, 0, HY(9), stageSlot(0, 'FL'));
      for (const n of [13, 13, 13]) take(ctx, 0, HY(n), { player: 0, zone: 'level' });
      take(ctx, 0, HY(14), { player: 0, zone: 'stock' });
      take(ctx, 0, HY(14), { player: 0, zone: 'stock' });
      take(ctx, 0, HY(15), { player: 0, zone: 'clock' });
    }).state;
    const t17 = start.zones[0].hand[0]!;
    const atOrder = answer(start, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(start, t17), slot: 'FC' } }).state;
    // Both abilities trigger together; the player chooses the order.
    const order = pending(atOrder, 'CHOOSE_ABILITY');
    expect(order.abilities.map((a) => a.ability).sort()).toEqual([0, 1]);
    const first = order.abilities.find((a) => a.ability === 0)!;
    const { state } = answerAll(atOrder, [
      { kind: 'CHOOSE_ABILITY', id: first.id },
      { kind: 'CONFIRM', accept: true },
    ]);
    expect(state.zones[0].clock).toEqual([]);
    // 9500 + 2 × 1000.
    expect(getPower(state, t17)).toBe(11500);
  });
});
