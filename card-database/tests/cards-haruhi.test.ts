/**
 * Tests for every card of the 涼宮ハルヒの憂鬱 trial deck, using the real
 * card data. Player 0 uses these cards; player 1 uses the 一花 cards.
 */

import { describe, expect, it } from 'vitest';
import { type CardMovedEvent, type Ctx, getInstance, getPower, getSoul, stageSlot } from '@wso/game-engine';
import { getCard } from '../src/index';
import { answer, answerAll, oid, pending, scenario, stackTop, take } from './helpers';

const SY = (n: number): string => `SY/W08-T${String(n).padStart(2, '0')}`;
const HY = (n: number): string => `5HY/W83-T${String(n).padStart(2, '0')}`;

/** Player 1's deck top: cards without a climax, so damage to player 1 is never cancelled in these tests. */
const safeTopForP1 = (ctx: Ctx): void => {
  stackTop(ctx, 1, [HY(14), HY(14), HY(14), HY(15), HY(15), HY(15)]);
};

describe('SY/W08 trial deck', () => {
  it('SY/W08-T01, SY/W08-T03, SY/W08-T07, SY/W08-T12, SY/W08-T15: characters without text have only their printed values', () => {
    const expected: Record<number, [number, number, number, number]> = {
      1: [0, 0, 3000, 1],
      3: [1, 0, 5500, 1],
      7: [2, 2, 9000, 2],
      12: [0, 0, 3000, 1],
      15: [1, 0, 5500, 1],
    };
    const { state } = scenario({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, SY(1), stageSlot(0, 'FL'));
      take(ctx, 0, SY(3), stageSlot(0, 'FC'));
      take(ctx, 0, SY(7), stageSlot(0, 'FR'));
      take(ctx, 0, SY(12), stageSlot(0, 'BL'));
      take(ctx, 0, SY(15), stageSlot(0, 'BR'));
    });
    for (const [n, [level, cost, power, soul]] of Object.entries(expected)) {
      const card = getCard(SY(Number(n)));
      expect(card.def.abilities, card.def.cardId).toBeUndefined();
      expect([card.def.level, card.def.cost, card.def.power, card.def.soul]).toEqual([level, cost, power, soul]);
    }
    // On the stage with nothing else in play, current values equal printed values.
    for (const slot of ['FL', 'FC', 'FR', 'BL', 'BR'] as const) {
      const id = state.zones[0].stage[slot][0]!;
      expect(getPower(state, id)).toBe(getCard(getInstance(state, id).cardId).def.power);
    }
  });

  it('SY/W08-T02 応援 and SY/W08-T11 応援: +500 to the characters in front, from the back row only', () => {
    const { state } = scenario({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, SY(2), stageSlot(0, 'BL'));
      take(ctx, 0, SY(11), stageSlot(0, 'BR'));
      take(ctx, 0, SY(1), stageSlot(0, 'FL'));
      take(ctx, 0, SY(3), stageSlot(0, 'FC'));
      take(ctx, 0, SY(12), stageSlot(0, 'FR'));
    });
    const power = (slot: 'FL' | 'FC' | 'FR' | 'BL'): number => getPower(state, state.zones[0].stage[slot][0]!);
    // Front left: behind it only T02. Front centre: both. Front right: only T11.
    expect(power('FL')).toBe(3500);
    expect(power('FC')).toBe(6500);
    expect(power('FR')).toBe(3500);
    expect(power('BL')).toBe(500);
  });

  describe('SY/W08-T02 自動能力', () => {
    const arrange = (climax: string) => (ctx: Ctx): void => {
      take(ctx, 0, SY(2), stageSlot(0, 'BL'));
      take(ctx, 0, SY(7), stageSlot(0, 'FC'));
      take(ctx, 0, SY(1), { player: 0, zone: 'stock' });
      stackTop(ctx, 0, [climax]);
      take(ctx, 1, HY(4), stageSlot(1, 'FL'));
      take(ctx, 1, HY(9), stageSlot(1, 'FR'));
      safeTopForP1(ctx);
    };

    it('SY/W08-T02: a climax with the door icon in its own trigger check lets it send a level 1 or lower opponent front-row character to the waiting room', () => {
      const start = scenario({ step: 'ATTACK_START' }, arrange(SY(10))).state;
      const attacker = start.zones[0].stage.FC[0]!;
      const atConfirm = answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, attacker), type: 'DIRECT' } });
      // Official Q&A 2009.11.20: the icon is resolved and the card goes to the stock before this ability.
      const moves = atConfirm.events.filter((e): e is CardMovedEvent => e.type === 'CARD_MOVED').map((e) => `${e.reason}:${e.to.zone}`);
      expect(moves).toEqual(['TRIGGER_CHECK:resolution', 'TRIGGER_CHECK:stock']);
      expect(pending(atConfirm.state, 'CONFIRM')).toMatchObject({ player: 0, prompt: 'PAY_COST' });

      const atChoose = answer(atConfirm.state, { kind: 'CONFIRM', accept: true }).state;
      const choose = pending(atChoose, 'SELECT_CARDS');
      // Level 0 「五つ子の長女」 qualifies; the level 2 character does not.
      const levelZero = atChoose.zones[1].stage.FL[0]!;
      expect(choose.cards).toEqual([oid(atChoose, levelZero)]);

      const { state } = answer(atChoose, { kind: 'SELECT_CARDS', cards: choose.cards });
      expect(state.zones[1].waitingRoom).toContain(levelZero);
      expect(state.zones[1].stage.FR).toHaveLength(1);
    });

    it('SY/W08-T02: a climax without the door icon does not trigger it', () => {
      const start = scenario({ step: 'ATTACK_START' }, arrange(SY(9))).state;
      const attacker = start.zones[0].stage.FC[0]!;
      const { state } = answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, attacker), type: 'DIRECT' } });
      expect(state.pending?.kind).not.toBe('CONFIRM');
      expect(state.zones[1].stage.FL).toHaveLength(1);
    });
  });

  it('SY/W08-T04 助太刀2000 レベル1: offered only at level 1 or higher; +2000 to the front-attacked character', () => {
    const arrange = (level: number) => (ctx: Ctx): void => {
      take(ctx, 1, HY(6), stageSlot(1, 'FC'));
      take(ctx, 0, SY(1), stageSlot(0, 'FC'));
      take(ctx, 0, SY(4), { player: 0, zone: 'hand' });
      take(ctx, 0, SY(12), { player: 0, zone: 'stock' });
      for (let i = 0; i < level; i++) take(ctx, 0, SY(3), { player: 0, zone: 'level' });
      stackTop(ctx, 1, [HY(6)]);
      stackTop(ctx, 0, [SY(1), SY(1)]);
    };
    const attack = (level: number) => {
      const start = scenario({ step: 'ATTACK_START', turnPlayer: 1 }, arrange(level)).state;
      const attacker = start.zones[1].stage.FC[0]!;
      return answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, attacker), type: 'FRONT' } }).state;
    };

    expect(pending(attack(0), 'COUNTER').backups).toEqual([]);

    const atCounter = attack(1);
    const decision = pending(atCounter, 'COUNTER');
    expect(decision.backups).toHaveLength(1);
    const atChoose = answer(atCounter, { kind: 'COUNTER', card: decision.backups[0]!.card, ability: decision.backups[0]!.ability }).state;
    const { state } = answer(atChoose, { kind: 'SELECT_CARDS', cards: pending(atChoose, 'SELECT_CARDS').cards });
    // 3000 + 2000 against 5000: both are reversed, so the attacker went to the waiting room too.
    expect(state.zones[1].waitingRoom.some((id) => getInstance(state, id).cardId === HY(6))).toBe(true);
    expect(state.zones[0].waitingRoom.some((id) => getInstance(state, id).cardId === SY(4))).toBe(true);
  });

  it('SY/W08-T05: +1000 power while in the front-centre slot', () => {
    const { state } = scenario({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, SY(5), stageSlot(0, 'FC'));
      take(ctx, 0, SY(5), stageSlot(0, 'FL'));
    });
    expect(getPower(state, state.zones[0].stage.FC[0]!)).toBe(9000);
    expect(getPower(state, state.zones[0].stage.FL[0]!)).toBe(8000);
  });

  it('SY/W08-T06 チェンジ and SY/W08-T08: at the encore step a rested T06 can change into トラブルガール ハルヒ, whose ability then triggers', () => {
    const start = scenario({ step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, SY(6), stageSlot(0, 'FC'));
      take(ctx, 0, SY(8), { player: 0, zone: 'waitingRoom' });
      take(ctx, 0, SY(12), { player: 0, zone: 'stock' });
      take(ctx, 0, SY(11), { player: 0, zone: 'clock' });
      stackTop(ctx, 0, [SY(1)]);
      safeTopForP1(ctx);
    }).state;
    const t06 = start.zones[0].stage.FC[0]!;
    const atChange = answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, t06), type: 'DIRECT' } }).state;
    expect(pending(atChange, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST', card: oid(atChange, t06) });

    const atChoose = answer(atChange, { kind: 'CONFIRM', accept: true }).state;
    // The cost put T06 into the clock.
    expect(atChoose.zones[0].clock).toContain(t06);
    const choose = pending(atChoose, 'SELECT_CARDS');
    const t08 = atChoose.zones[0].waitingRoom.find((id) => getInstance(atChoose, id).cardId === SY(8))!;
    expect(choose.cards).toEqual([oid(atChoose, t08)]);

    const placed = answer(atChoose, { kind: 'SELECT_CARDS', cards: choose.cards });
    const move = placed.events.find((e): e is CardMovedEvent => e.type === 'CARD_MOVED' && e.instanceId === t08)!;
    expect(move).toMatchObject({ reason: 'CHANGE', to: { zone: 'stage', slot: 'FC' }, orientation: 'STAND' });
    // T08: placed "by change", so its first ability triggers: may put the top clock card (T06) into the waiting room.
    expect(pending(placed.state, 'CONFIRM')).toMatchObject({ prompt: 'USE_ABILITY', ability: 0 });
    const { state } = answer(placed.state, { kind: 'CONFIRM', accept: true });
    expect(state.zones[0].clock).not.toContain(t06);
    expect(state.zones[0].waitingRoom).toContain(t06);
    expect(state.zones[0].stage.FC).toEqual([t08]);
  });

  it('SY/W08-T06: チェンジ is not offered when the card is standing', () => {
    const { state } = scenario({ step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, SY(6), stageSlot(0, 'BL'));
      take(ctx, 0, SY(8), { player: 0, zone: 'waitingRoom' });
      take(ctx, 0, SY(12), { player: 0, zone: 'stock' });
    });
    expect(state.pending?.kind).not.toBe('CONFIRM');
    expect(state.zones[0].stage.BL).toHaveLength(1);
  });

  describe('SY/W08-T06 集中', () => {
    const run = (top: string[], inWaitingRoom: string[] = []) => {
      const start = scenario({ step: 'MAIN_START' }, (ctx) => {
        take(ctx, 0, SY(6), stageSlot(0, 'FC'));
        for (const id of inWaitingRoom) take(ctx, 0, id, { player: 0, zone: 'waitingRoom' });
        for (let i = 0; i < 3; i++) take(ctx, 0, SY(11), { player: 0, zone: 'stock' });
        stackTop(ctx, 0, top);
      }).state;
      const t06 = start.zones[0].stage.FC[0]!;
      return answer(start, { kind: 'MAIN', action: { type: 'ACTIVATE', card: oid(start, t06), ability: 1 } }).state;
    };

    it('SY/W08-T06: X is the number of 《団長》 characters turned over; a 《団長》 character of level X or lower goes to any slot', () => {
      const atChoose = run([SY(1), SY(12), SY(5)]);
      const choose = pending(atChoose, 'SELECT_CARDS');
      const names = choose.cards.map((o) => atChoose.instances.find((i) => i.objectId === o)!.cardId).sort();
      // X = 2: T01 (団長, level 0) and T05 (団長, level 2) qualify; T12 has no 《団長》.
      expect(names).toEqual([SY(1), SY(5)]);
      const t05 = choose.cards.find((o) => atChoose.instances.find((i) => i.objectId === o)!.cardId === SY(5))!;
      const atSlot = answer(atChoose, { kind: 'SELECT_CARDS', cards: [t05] }).state;
      expect(pending(atSlot, 'SELECT_SLOT').slots).toHaveLength(5);
      const { state } = answer(atSlot, { kind: 'SELECT_SLOT', slot: 'BL' });
      expect(getInstance(state, state.zones[0].stage.BL[0]!).cardId).toBe(SY(5));
    });

    it('SY/W08-T06: official Q&A 2011.03.25: with X = 0 a level 0 《団長》 character can still be chosen', () => {
      // No 《団長》 among the cards turned over. In the waiting room: a level 0 and a level 1 《団長》.
      const atChoose = run([SY(12), SY(12), SY(15)], [SY(1), SY(4)]);
      const names = pending(atChoose, 'SELECT_CARDS').cards.map((o) => atChoose.instances.find((i) => i.objectId === o)!.cardId);
      expect(names).toEqual([SY(1)]);
    });
  });

  it('SY/W08-T08: from hand it may put the top clock card into the waiting room; with サムデイ イン ザ レイン it may deal 1 damage when attacking', () => {
    const atPlay = scenario({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, SY(8), { player: 0, zone: 'hand' });
      for (const n of [3, 3, 3]) take(ctx, 0, SY(n), { player: 0, zone: 'level' });
      take(ctx, 0, SY(12), { player: 0, zone: 'stock' });
      take(ctx, 0, SY(12), { player: 0, zone: 'stock' });
      take(ctx, 0, SY(11), { player: 0, zone: 'clock' });
      take(ctx, 0, SY(1), { player: 0, zone: 'clock' });
    }).state;
    const t08 = atPlay.zones[0].hand[0]!;
    const atConfirm = answer(atPlay, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(atPlay, t08), slot: 'FC' } }).state;
    expect(pending(atConfirm, 'CONFIRM')).toMatchObject({ prompt: 'USE_ABILITY', ability: 0 });
    const topClock = atConfirm.zones[0].clock[atConfirm.zones[0].clock.length - 1]!;
    const after = answer(atConfirm, { kind: 'CONFIRM', accept: true }).state;
    expect(after.zones[0].clock).toHaveLength(1);
    expect(after.zones[0].waitingRoom).toContain(topClock);

    const atAttack = scenario({ step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, SY(8), stageSlot(0, 'FC'));
      take(ctx, 0, SY(10), { player: 0, zone: 'climax' });
      stackTop(ctx, 0, [SY(1)]);
      safeTopForP1(ctx);
    }).state;
    const attacker = atAttack.zones[0].stage.FC[0]!;
    const atDamage = answer(atAttack, { kind: 'ATTACK', attack: { attacker: oid(atAttack, attacker), type: 'DIRECT' } }).state;
    expect(pending(atDamage, 'CONFIRM')).toMatchObject({ prompt: 'USE_ABILITY', ability: 1 });
    const { events } = answer(atDamage, { kind: 'CONFIRM', accept: true });
    const dealt = events.filter((e) => e.type === 'DAMAGE_DEALT');
    // 1 from the ability, then the attack: soul 2 + 1 (climax) + 1 (direct) = 4.
    expect(dealt.map((e) => e.type === 'DAMAGE_DEALT' && e.amount)).toEqual([1, 4]);
  });

  it('SY/W08-T09: played from hand, draw 1 and give a character +2000 power and +1 soul for the turn', () => {
    const start = scenario({ step: 'CLIMAX_START' }, (ctx) => {
      take(ctx, 0, SY(9), { player: 0, zone: 'hand' });
      take(ctx, 0, SY(1), { player: 0, zone: 'clock' });
      take(ctx, 0, SY(3), stageSlot(0, 'FC'));
    }).state;
    const t09 = start.zones[0].hand[0]!;
    const target = start.zones[0].stage.FC[0]!;
    const atChoose = answer(start, { kind: 'CLIMAX', card: oid(start, t09) }).state;
    expect(atChoose.zones[0].hand).toHaveLength(1);
    const { state } = answer(atChoose, { kind: 'SELECT_CARDS', cards: [oid(atChoose, target)] });
    expect(getPower(state, target)).toBe(7500);
    expect(getSoul(state, target)).toBe(2);
  });

  it('SY/W08-T10 and SY/W08-T17: climax continuous abilities', () => {
    const t10 = scenario({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, SY(1), stageSlot(0, 'FC'));
      take(ctx, 0, SY(10), { player: 0, zone: 'climax' });
      take(ctx, 1, HY(9), stageSlot(1, 'FC'));
    }).state;
    expect([getPower(t10, t10.zones[0].stage.FC[0]!), getSoul(t10, t10.zones[0].stage.FC[0]!)]).toEqual([4000, 2]);
    // Only the player's own characters.
    expect(getPower(t10, t10.zones[1].stage.FC[0]!)).toBe(8500);

    const t17 = scenario({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, SY(1), stageSlot(0, 'FC'));
      take(ctx, 0, SY(17), { player: 0, zone: 'climax' });
    }).state;
    expect([getPower(t17, t17.zones[0].stage.FC[0]!), getSoul(t17, t17.zones[0].stage.FC[0]!)]).toEqual([3000, 3]);
  });

  it('SY/W08-T13 チェンジ into SY/W08-T14, whose ability gives another character a free return for the turn', () => {
    const start = scenario({ step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, SY(13), stageSlot(0, 'FC'));
      take(ctx, 0, SY(1), stageSlot(0, 'BL'));
      take(ctx, 0, SY(14), { player: 0, zone: 'waitingRoom' });
      take(ctx, 0, SY(12), { player: 0, zone: 'stock' });
      stackTop(ctx, 0, [SY(1)]);
      safeTopForP1(ctx);
    }).state;
    const t13 = start.zones[0].stage.FC[0]!;
    const other = start.zones[0].stage.BL[0]!;
    const atChange = answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, t13), type: 'DIRECT' } }).state;
    expect(pending(atChange, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST' });
    const atChoose = answer(atChange, { kind: 'CONFIRM', accept: true }).state;
    // The cost put T13 into the waiting room (which also triggers its encore, CR-10.2.2).
    expect(atChoose.zones[0].waitingRoom).toContain(t13);
    const t14 = atChoose.zones[0].waitingRoom.find((id) => getInstance(atChoose, id).cardId === SY(14))!;
    const afterPlace = answer(atChoose, { kind: 'SELECT_CARDS', cards: [oid(atChoose, t14)] }).state;

    // Two abilities wait: T13's encore (3 stock not available, so it will do nothing) and T14's.
    const order = pending(afterPlace, 'CHOOSE_ABILITY');
    const t14Ability = order.abilities.find((a) => a.type === 'CARD')!;
    const atTarget = answer(afterPlace, { kind: 'CHOOSE_ABILITY', id: t14Ability.id }).state;
    expect(pending(atTarget, 'SELECT_CARDS').cards).toEqual([oid(atTarget, other)]);
    const { state } = answer(atTarget, { kind: 'SELECT_CARDS', cards: [oid(atTarget, other)] });
    expect(state.zones[0].stage.FC).toEqual([t14]);
    // The ability was given for that turn only; the turn has ended since.
    expect(state.turn).toMatchObject({ player: 1 });
    expect(state.grants).toEqual([]);
  });

  it('SY/W08-T14: the given ability returns the character to its slot, rested, when it leaves the stage', () => {
    const start = scenario({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, SY(14), { player: 0, zone: 'hand' });
      take(ctx, 0, SY(12), { player: 0, zone: 'hand' });
      take(ctx, 0, SY(1), stageSlot(0, 'FC'));
      take(ctx, 0, SY(11), { player: 0, zone: 'level' });
    }).state;
    const t14 = start.zones[0].hand.find((id) => getInstance(start, id).cardId === SY(14))!;
    const t12 = start.zones[0].hand.find((id) => getInstance(start, id).cardId === SY(12))!;
    const target = start.zones[0].stage.FC[0]!;

    const { state: granted } = answerAll(start, [
      { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(start, t14), slot: 'BR' } },
      { kind: 'SELECT_CARDS', cards: [oid(start, target)] },
    ]);
    expect(granted.grants).toHaveLength(1);

    // Playing another character onto its slot sends it to the waiting room.
    const atOrder = answer(granted, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(granted, t12), slot: 'FC' } }).state;
    const order = pending(atOrder, 'CHOOSE_ABILITY');
    const given = order.abilities.find((a) => a.type === 'CARD')!;
    expect(given.granted).toBe(true);
    const atConfirm = answer(atOrder, { kind: 'CHOOSE_ABILITY', id: given.id }).state;
    expect(pending(atConfirm, 'CONFIRM').prompt).toBe('USE_ABILITY');
    const { state } = answer(atConfirm, { kind: 'CONFIRM', accept: true });
    // It came back rested and last, so the newly played character is the one removed (CR-9.6.2).
    expect(state.zones[0].stage.FC).toEqual([target]);
    expect(getInstance(state, target).orientation).toBe('REST');
    expect(state.zones[0].waitingRoom).toContain(t12);
  });

  it('SY/W08-T16 情報連結解除: in the counter step, the attacker’s climax goes to the waiting room and its bonus ends', () => {
    const start = scenario({ step: 'ATTACK_START', turnPlayer: 1 }, (ctx) => {
      take(ctx, 1, HY(9), stageSlot(1, 'FC'));
      take(ctx, 1, HY(12), { player: 1, zone: 'climax' });
      take(ctx, 0, SY(15), stageSlot(0, 'FC'));
      take(ctx, 0, SY(16), { player: 0, zone: 'hand' });
      take(ctx, 0, SY(11), { player: 0, zone: 'level' });
      take(ctx, 0, SY(11), { player: 0, zone: 'level' });
      stackTop(ctx, 1, [HY(6)]);
      stackTop(ctx, 0, [SY(1), SY(1)]);
    }).state;
    const attacker = start.zones[1].stage.FC[0]!;
    expect([getPower(start, attacker), getSoul(start, attacker)]).toEqual([9500, 2]);
    const atCounter = answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, attacker), type: 'FRONT' } }).state;
    const t16 = atCounter.zones[0].hand[0]!;
    expect(pending(atCounter, 'COUNTER').cards).toEqual([oid(atCounter, t16)]);

    const atChoose = answer(atCounter, { kind: 'COUNTER', card: oid(atCounter, t16) }).state;
    const climax = atChoose.zones[1].climax[0]!;
    expect(pending(atChoose, 'SELECT_CARDS').cards).toEqual([oid(atChoose, climax)]);
    const { state, events } = answer(atChoose, { kind: 'SELECT_CARDS', cards: [oid(atChoose, climax)] });
    expect(state.zones[1].waitingRoom).toContain(climax);
    // Without the climax the attacker deals its printed soul of 1.
    expect(events.find((e) => e.type === 'DAMAGE_DEALT')).toMatchObject({ receiver: 0, amount: 1 });
  });
});
