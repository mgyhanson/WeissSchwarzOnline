/**
 * Tests for the hand-written BanG Dream! [夢限大みゅーたいぷ] cards (BDY/W135),
 * using the real card data. Player 0 has every card of the booster (cards
 * without ability data serve as plain characters); player 1 uses the
 * 涼宮ハルヒ trial deck cards.
 */

import { describe, expect, it } from 'vitest';
import { type Choice, type Ctx, type Decision, type GameState, type PlayerId, type SlotId, backup, getInstance, getPower, stageSlot } from '@wso/game-engine';
import { getCard } from '../src/index';
import { BDY, HARUHI, answer, oid, pending, scenario, stackTop, take } from './helpers';
import type { RealScenario } from './helpers';

const B = (n: number): string => `BDY/W135-${String(n).padStart(3, '0')}`;
const SY = (n: number): string => `SY/W08-T${String(n).padStart(2, '0')}`;

/** Plain characters of the booster (no ability data): yellow, red and blue level 0, and a level 1. */
const PLAIN = { yellow: B(1), red: B(33), blue: B(77), level1: B(7) };
const LOVE = B(26); // 愛は衝動 (yellow climax)
const TEAR = B(62); // TearJerker (red climax)

const bdy = (options: Omit<RealScenario, 'sets'>, arrange: (ctx: Ctx) => void = () => {}) => scenario({ ...options, sets: [BDY, HARUHI] }, arrange);

const at = (state: GameState, player: PlayerId, slot: SlotId): number => state.zones[player].stage[slot][0]!;
const idsIn = (state: GameState, ids: readonly number[]): string[] => ids.map((id) => getInstance(state, id).cardId);
const cardIdOfObject = (state: GameState, objectId: number): string => state.instances.find((i) => i.objectId === objectId)!.cardId;
const inHand = (state: GameState, cardId: string): number => state.zones[0].hand.find((id) => getInstance(state, id).cardId === cardId)!;
const power = (cardId: string): number => getCard(cardId).def.power!;

/** Level zone cards (for the level and colour needed to play a card) and stock cards. */
function ready(ctx: Ctx, levelCards: string[], stock: number): void {
  for (const id of levelCards) take(ctx, 0, id, { player: 0, zone: 'level' });
  for (let i = 0; i < stock; i++) take(ctx, 0, PLAIN.blue, { player: 0, zone: 'stock' });
}

const play = (state: GameState, cardId: string, slot: SlotId): GameState => answer(state, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(state, inHand(state, cardId)), slot } }).state;
const activate = (state: GameState, slot: SlotId, ability: number): GameState => answer(state, { kind: 'MAIN', action: { type: 'ACTIVATE', card: oid(state, at(state, 0, slot)), ability } }).state;
const accept = (state: GameState): GameState => answer(state, { kind: 'CONFIRM', accept: true }).state;
const pick = (state: GameState, cardIds: string[]): GameState => {
  const decision = pending(state, 'SELECT_CARDS');
  const chosen = cardIds.map((cardId) => {
    const found = decision.cards.find((o) => cardIdOfObject(state, o) === cardId);
    if (found === undefined) throw new Error(`${cardId} cannot be chosen; offered: ${decision.cards.map((o) => cardIdOfObject(state, o)).join(', ')}`);
    return found;
  });
  return answer(state, { kind: 'SELECT_CARDS', cards: chosen }).state;
};
const offered = (state: GameState): string[] => pending(state, 'SELECT_CARDS').cards.map((o) => cardIdOfObject(state, o)).sort();

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
    case 'CHOOSE_ABILITY':
      return { kind: 'CHOOSE_ABILITY', id: (d.abilities.find((a) => a.type === 'CARD') ?? d.abilities[0]!).id };
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

const asked = (prompt: 'PAY_COST' | 'USE_ABILITY', cardId: string) => (s: GameState): boolean => s.pending?.kind === 'CONFIRM' && s.pending.prompt === prompt && s.pending.cardId === cardId;

/** The opponent front-attacks player 0's front-centre character with the given card. */
function attackedBy(attacker: string, arrange: (ctx: Ctx) => void): GameState {
  const start = bdy({ step: 'ATTACK_START', turnPlayer: 1 }, (ctx) => {
    take(ctx, 1, attacker, stageSlot(1, 'FC'));
    stackTop(ctx, 1, [SY(12), SY(12)]);
    stackTop(ctx, 0, [PLAIN.yellow, PLAIN.yellow, PLAIN.yellow]);
    arrange(ctx);
  }).state;
  return answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, at(start, 1, 'FC')), type: 'FRONT' } }).state;
}

describe('BDY/W135 BanG Dream! [夢限大みゅーたいぷ]', () => {
  it('BDY/W135-006: the other character in your front-centre slot gets +1000; 集中 returns 《音楽》 characters for each climax turned over', () => {
    const start = bdy({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, B(6), stageSlot(0, 'BL'));
      take(ctx, 0, PLAIN.yellow, stageSlot(0, 'FC'));
      take(ctx, 0, PLAIN.red, stageSlot(0, 'FL'));
      take(ctx, 0, PLAIN.level1, { player: 0, zone: 'waitingRoom' });
      take(ctx, 0, PLAIN.blue, { player: 0, zone: 'stock' });
      stackTop(ctx, 0, [LOVE, PLAIN.red, PLAIN.red, TEAR]);
    }).state;
    expect([getPower(start, at(start, 0, 'FC')), getPower(start, at(start, 0, 'FL'))]).toEqual([power(PLAIN.yellow) + 1000, power(PLAIN.red)]);
    // In the front-centre slot itself it gives itself nothing (他の).
    const centre = bdy({ step: 'MAIN_START' }, (ctx) => take(ctx, 0, B(6), stageSlot(0, 'FC'))).state;
    expect(getPower(centre, at(centre, 0, 'FC'))).toBe(power(B(6)));

    // Two climaxes among the four cards: two choices, each of up to one 《音楽》 character.
    const first = activate(start, 'BL', 1);
    expect(pending(first, 'SELECT_CARDS')).toMatchObject({ min: 0, max: 1 });
    expect(offered(first).every((id) => getCard(id).def.kind === 'CHARACTER')).toBe(true);
    const second = pick(first, [PLAIN.level1]);
    const done = pick(second, [PLAIN.red]);
    expect(idsIn(done, done.zones[0].hand).sort()).toEqual([PLAIN.level1, PLAIN.red].sort());
    expect(getInstance(done, at(done, 0, 'BL')).orientation).toBe('REST');
    expect(done.zones[0].stock).toHaveLength(0);
    expect(idsIn(done, done.zones[0].waitingRoom)).toEqual(expect.arrayContaining([LOVE, TEAR]));
  });

  it('BDY/W135-013: played from hand, may discard 「愛は衝動」 or 「TearJerker」 to return one of them from the waiting room', () => {
    const start = bdy({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, B(13), { player: 0, zone: 'hand' });
      take(ctx, 0, LOVE, { player: 0, zone: 'hand' });
      take(ctx, 0, PLAIN.red, { player: 0, zone: 'hand' });
      take(ctx, 0, TEAR, { player: 0, zone: 'waitingRoom' });
      take(ctx, 0, B(64), { player: 0, zone: 'waitingRoom' }); // another climax: not one of the two names
    }).state;
    const atPay = play(start, B(13), 'FC');
    expect(pending(atPay, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST', ability: 0 });
    const atDiscard = accept(atPay);
    // Only the named climaxes can pay.
    expect(offered(atDiscard)).toEqual([LOVE]);
    const atChoose = pick(atDiscard, [LOVE]);
    // The one just discarded may be taken back, or the other one.
    expect(offered(atChoose)).toEqual([LOVE, TEAR].sort());
    const done = pick(atChoose, [TEAR]);
    expect(idsIn(done, done.zones[0].hand).sort()).toEqual([TEAR, PLAIN.red].sort());

    const without = bdy({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, B(13), { player: 0, zone: 'hand' });
      take(ctx, 0, B(64), { player: 0, zone: 'hand' });
      take(ctx, 0, TEAR, { player: 0, zone: 'waitingRoom' });
    }).state;
    expect(play(without, B(13), 'FC').pending?.kind).toBe('MAIN');
  });

  it('BDY/W135-019: with four other 《音楽》 characters it may put one from the waiting room into stock; attacking a facing level 2 character gives +6000', () => {
    const placed = (others: number) => {
      const start = bdy({ step: 'MAIN_START' }, (ctx) => {
        take(ctx, 0, B(19), { player: 0, zone: 'hand' });
        ready(ctx, [PLAIN.yellow], 1);
        (['FL', 'FR', 'BL', 'BR'] as const).slice(0, others).forEach((slot, i) => take(ctx, 0, [PLAIN.red, PLAIN.red, PLAIN.yellow, PLAIN.yellow][i]!, stageSlot(0, slot)));
        take(ctx, 0, PLAIN.level1, { player: 0, zone: 'waitingRoom' });
        take(ctx, 0, LOVE, { player: 0, zone: 'waitingRoom' });
      }).state;
      return play(start, B(19), 'FC');
    };
    expect(placed(3).pending?.kind).toBe('MAIN');
    const atUse = placed(4);
    expect(pending(atUse, 'CONFIRM')).toMatchObject({ prompt: 'USE_ABILITY', ability: 0 });
    const atChoose = accept(atUse);
    // The stock card that paid for playing it is a 《音楽》 character in the waiting room now; the climax is not offered.
    expect(offered(atChoose)).toEqual([PLAIN.level1, PLAIN.blue].sort());
    const done = pick(atChoose, [PLAIN.level1]);
    expect(idsIn(done, done.zones[0].stock)).toEqual([PLAIN.level1]);

    const attack = (facing: string | null) => {
      const start = bdy({ step: 'ATTACK_START' }, (ctx) => {
        take(ctx, 0, B(19), stageSlot(0, 'FC'));
        take(ctx, 0, PLAIN.red, stageSlot(0, 'FL'));
        if (facing) take(ctx, 1, facing, stageSlot(1, 'FC'));
        stackTop(ctx, 0, [PLAIN.yellow, PLAIN.yellow]);
        stackTop(ctx, 1, [SY(12), SY(12), SY(12)]);
      }).state;
      const card = at(start, 0, 'FC');
      const state = answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, card), type: facing ? 'FRONT' : 'DIRECT' } }).state;
      return getPower(state, card);
    };
    expect(attack(SY(5))).toBe(5500 + 6000); // level 2
    expect(attack(SY(3))).toBe(5500); // level 1
    expect(attack(SY(8))).toBe(5500); // level 3: "is 2", not "2 or more"
    expect(attack(null)).toBe(5500);
  });

  it('BDY/W135-020: played from hand, (1) and a discard send one cost-0 character of the opponent’s front row and one of the back row to the waiting room', () => {
    const start = bdy({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, B(20), { player: 0, zone: 'hand' });
      take(ctx, 0, PLAIN.red, { player: 0, zone: 'hand' });
      ready(ctx, [PLAIN.yellow, PLAIN.yellow], 1);
      take(ctx, 1, SY(1), stageSlot(1, 'FL')); // cost 0
      take(ctx, 1, SY(5), stageSlot(1, 'FC')); // cost 1
      take(ctx, 1, SY(2), stageSlot(1, 'BL')); // cost 0
      take(ctx, 1, SY(4), stageSlot(1, 'BR')); // cost 1
    }).state;
    const atFront = pick(accept(play(start, B(20), 'FC')), [PLAIN.red]);
    expect(pending(atFront, 'SELECT_CARDS')).toMatchObject({ min: 0, max: 1 });
    expect(offered(atFront)).toEqual([SY(1)]);
    const atBack = pick(atFront, [SY(1)]);
    expect(offered(atBack)).toEqual([SY(2)]);
    const done = pick(atBack, [SY(2)]);
    expect(idsIn(done, done.zones[1].waitingRoom).sort()).toEqual([SY(1), SY(2)]);
    expect([done.zones[1].stage.FC.length, done.zones[1].stage.BR.length]).toEqual([1, 1]);
    // Choosing nobody in the front row still allows the back row choice.
    const onlyBack = pick(pick(atFront, []), [SY(2)]);
    expect(idsIn(onlyBack, onlyBack.zones[1].waitingRoom)).toEqual([SY(2)]);
  });

  it('BDY/W135-035: played from hand, may put a hand card into the clock to search the deck for a 《夢限大みゅーたいぷ》 character', () => {
    const start = bdy({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, B(35), { player: 0, zone: 'hand' });
      take(ctx, 0, PLAIN.red, { player: 0, zone: 'hand' });
    }).state;
    const atPay = play(start, B(35), 'FC');
    expect(pending(atPay, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST', ability: 0 });
    const atCost = accept(atPay);
    expect(pending(atCost, 'SELECT_CARDS')).toMatchObject({ prompt: 'COST_HAND_TO_CLOCK', min: 1, max: 1 });
    const atSearch = pick(atCost, [PLAIN.red]);
    expect(idsIn(atSearch, atSearch.zones[0].clock)).toEqual([PLAIN.red]);
    const search = pending(atSearch, 'SELECT_CARDS');
    expect(search).toMatchObject({ min: 0, max: 1 });
    expect(search.cards.every((o) => getCard(cardIdOfObject(atSearch, o)).def.traits.includes('夢限大みゅーたいぷ'))).toBe(true);
    // 《フェアリィブゥケ》 characters of the booster are not offered.
    expect(search.cards.map((o) => cardIdOfObject(atSearch, o))).not.toContain(B(72));
    const { state, events } = answer(atSearch, { kind: 'SELECT_CARDS', cards: [search.cards[0]!] });
    expect(state.zones[0].hand).toHaveLength(1);
    expect(events.some((e) => e.type === 'CARD_REVEALED')).toBe(true);
    expect(events.some((e) => e.type === 'DECK_SHUFFLED' && e.player === 0)).toBe(true);

    // With no other hand card the cost cannot be paid, so it is not offered.
    const alone = bdy({ step: 'MAIN_START' }, (ctx) => take(ctx, 0, B(35), { player: 0, zone: 'hand' })).state;
    expect(play(alone, B(35), 'FC').pending?.kind).toBe('MAIN');
  });

  it('BDY/W135-039: played from hand, a discard returns a 《音楽》 character; its other ability shuffles the whole waiting room back into the deck', () => {
    const start = bdy({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, B(39), { player: 0, zone: 'hand' });
      take(ctx, 0, LOVE, { player: 0, zone: 'hand' });
      ready(ctx, [PLAIN.red, PLAIN.red], 1);
      take(ctx, 0, PLAIN.level1, { player: 0, zone: 'waitingRoom' });
      take(ctx, 0, TEAR, { player: 0, zone: 'waitingRoom' });
    }).state;
    const atChoose = pick(accept(play(start, B(39), 'FC')), [LOVE]);
    // Climaxes are not 《音楽》 characters; the stock card that paid for playing it is one.
    expect(offered(atChoose)).toEqual([PLAIN.level1, PLAIN.blue].sort());
    const back = pick(atChoose, [PLAIN.level1]);
    expect(idsIn(back, back.zones[0].hand)).toEqual([PLAIN.level1]);

    const deckBefore = back.zones[0].deck.length;
    const inWaitingRoom = back.zones[0].waitingRoom.length;
    const { state, events } = answer(back, { kind: 'MAIN', action: { type: 'ACTIVATE', card: oid(back, at(back, 0, 'FC')), ability: 1 } });
    expect(state.zones[0].waitingRoom).toEqual([]);
    expect(state.zones[0].stage.FC).toEqual([]);
    // Everything that was there, and this card itself (its cost put it there).
    expect(state.zones[0].deck).toHaveLength(deckBefore + inWaitingRoom + 1);
    expect(idsIn(state, state.zones[0].deck)).toEqual(expect.arrayContaining([B(39), LOVE, TEAR]));
    expect(events.some((e) => e.type === 'DECK_SHUFFLED' && e.player === 0)).toBe(true);
  });

  it('BDY/W135-041: played from hand, (1) and a 《音楽》 character from hand search a climax and deal 1 damage', () => {
    const start = bdy({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, B(41), { player: 0, zone: 'hand' });
      take(ctx, 0, PLAIN.yellow, { player: 0, zone: 'hand' });
      take(ctx, 0, LOVE, { player: 0, zone: 'hand' });
      ready(ctx, [PLAIN.red, PLAIN.red, PLAIN.red], 3);
      stackTop(ctx, 1, [SY(12), SY(12)]);
    }).state;
    const atPay = play(start, B(41), 'FC');
    expect(pending(atPay, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST', ability: 0 });
    const atDiscard = accept(atPay);
    expect(offered(atDiscard)).toEqual([PLAIN.yellow]); // the climax in hand is not a 《音楽》 character
    const atSearch = pick(atDiscard, [PLAIN.yellow]);
    const search = pending(atSearch, 'SELECT_CARDS');
    expect(search.cards.every((o) => getCard(cardIdOfObject(atSearch, o)).def.kind === 'CLIMAX')).toBe(true);
    const { state, events } = answer(atSearch, { kind: 'SELECT_CARDS', cards: [search.cards[0]!] });
    expect(idsIn(state, state.zones[0].hand).filter((id) => getCard(id).def.kind === 'CLIMAX')).toHaveLength(2);
    expect(state.zones[0].stock).toHaveLength(0); // 2 to play it, 1 for the ability
    expect(events.find((e) => e.type === 'DAMAGE_DEALT')).toMatchObject({ receiver: 1, amount: 1, cancelled: false });
    expect(idsIn(state, state.zones[1].clock)).toEqual([SY(12)]);
  });

  it('BDY/W135-047: +8000 in your turn when all your characters are 《音楽》; reversed, it takes one clock card and becomes rested instead', () => {
    const arrange = (ctx: Ctx): void => {
      take(ctx, 0, B(47), stageSlot(0, 'FC'));
      take(ctx, 0, PLAIN.blue, stageSlot(0, 'FL'));
    };
    const mine = bdy({ step: 'MAIN_START' }, arrange).state;
    expect(getPower(mine, at(mine, 0, 'FC'))).toBe(2000 + 8000);
    const theirs = bdy({ step: 'MAIN_START', turnPlayer: 1 }, arrange).state;
    expect(getPower(theirs, at(theirs, 0, 'FC'))).toBe(2000);

    const start = bdy({ step: 'ATTACK_START', turnPlayer: 1 }, (ctx) => {
      take(ctx, 0, B(47), stageSlot(0, 'FC'));
      take(ctx, 1, SY(7), stageSlot(1, 'FC'));
      stackTop(ctx, 1, [SY(12)]);
      stackTop(ctx, 0, [PLAIN.yellow, PLAIN.yellow, PLAIN.yellow, PLAIN.red]);
    }).state;
    const card = at(start, 0, 'FC');
    let state = answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, at(start, 1, 'FC')), type: 'FRONT' } }).state;
    const events: { type: string; reason?: string; to?: unknown }[] = [];
    for (let i = 0; i < 30 && state.turn?.player === 1; i++) {
      const result = answer(state, routine(state.pending!));
      state = result.state;
      events.push(...result.events);
    }
    const mineEvents = events.filter((e) => (e as { instanceId?: number }).instanceId === card && e.type === 'ORIENTATION_CHANGED').map((e) => (e as { to?: string }).to);
    expect(mineEvents.slice(0, 2)).toEqual(['REVERSE', 'REST']);
    // The soul 2 attack dealt 2 damage; the ability then put a third card from the deck top into the clock.
    expect(idsIn(state, state.zones[0].clock)).toEqual([PLAIN.yellow, PLAIN.yellow, PLAIN.yellow]);
    expect(events.filter((e) => e.type === 'CARD_MOVED' && e.reason === 'EFFECT' && (e.to as { zone: string }).zone === 'clock')).toHaveLength(1);
    // Not reversed any more, it was not put into the waiting room in the encore step.
    expect(state.zones[0].stage.FC).toEqual([card]);
  });

  it('BDY/W135-051 助太刀2500 レベル2: after using it, (1) and a 《音楽》 character from hand heal one clock card', () => {
    const atCounter = attackedBy(SY(7), (ctx) => {
      take(ctx, 0, PLAIN.level1, stageSlot(0, 'FC'));
      take(ctx, 0, B(51), { player: 0, zone: 'hand' });
      take(ctx, 0, PLAIN.red, { player: 0, zone: 'hand' });
      ready(ctx, [PLAIN.red, PLAIN.red], 2);
      take(ctx, 0, PLAIN.blue, { player: 0, zone: 'clock' });
      take(ctx, 0, PLAIN.yellow, { player: 0, zone: 'clock' });
    });
    const offeredBackup = pending(atCounter, 'COUNTER').backups[0]!;
    expect(offeredBackup.ability).toBe(1);
    const atTarget = answer(atCounter, { kind: 'COUNTER', card: offeredBackup.card, ability: offeredBackup.ability }).state;
    const defender = at(atTarget, 0, 'FC');
    const atPay = answer(atTarget, { kind: 'SELECT_CARDS', cards: [oid(atTarget, defender)] }).state;
    expect(getPower(atPay, defender)).toBe(power(PLAIN.level1) + 2500);
    expect(pending(atPay, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST', ability: 0, cardId: B(51) });
    const atDiscard = accept(atPay);
    expect(offered(atDiscard)).toEqual([PLAIN.red]);
    const clockBefore = idsIn(atDiscard, atDiscard.zones[0].clock);
    const healed = pick(atDiscard, [PLAIN.red]);
    // The top clock card (the last one put there) went to the waiting room.
    expect(clockBefore).toEqual([PLAIN.blue, PLAIN.yellow]);
    expect(idsIn(healed, healed.zones[0].waitingRoom)).toContain(PLAIN.yellow);
    expect(healed.zones[0].stock).toHaveLength(0);
    expect(getCard(B(51)).def.abilities![1]).toEqual(backup(2500, 2, [{ pay: 'STOCK', count: 1 }, { pay: 'SELF_TO_WAITING_ROOM' }]));
  });

  it('BDY/W135-057: played from hand, (1) and a discard heal one clock card; it gets +2000 whenever another 《音楽》 character of yours attacks', () => {
    const start = bdy({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, B(57), { player: 0, zone: 'hand' });
      take(ctx, 0, PLAIN.blue, { player: 0, zone: 'hand' });
      ready(ctx, [PLAIN.red], 1);
      take(ctx, 0, PLAIN.yellow, { player: 0, zone: 'clock' });
    }).state;
    const healed = pick(accept(play(start, B(57), 'FC')), [PLAIN.blue]);
    expect(healed.zones[0].clock).toEqual([]);
    expect(idsIn(healed, healed.zones[0].waitingRoom)).toEqual(expect.arrayContaining([PLAIN.yellow, PLAIN.blue]));

    const attacks = bdy({ step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, B(57), stageSlot(0, 'BL'));
      take(ctx, 0, B(57), stageSlot(0, 'FR'));
      take(ctx, 0, PLAIN.red, stageSlot(0, 'FL'));
      take(ctx, 0, PLAIN.blue, stageSlot(0, 'FC'));
      stackTop(ctx, 0, [PLAIN.yellow, PLAIN.yellow, PLAIN.yellow]);
      stackTop(ctx, 1, [SY(12), SY(12), SY(12), SY(15), SY(15), SY(15)]);
    }).state;
    const [back, front] = [at(attacks, 0, 'BL'), at(attacks, 0, 'FR')];
    // Two copies trigger at once: the player is asked in which order they resolve (CR-8.7.3.1).
    const direct = (state: GameState, slot: SlotId) => {
      let next = answer(state, { kind: 'ATTACK', attack: { attacker: oid(state, at(state, 0, slot)), type: 'DIRECT' } }).state;
      while (next.pending?.kind === 'CHOOSE_ABILITY') next = answer(next, { kind: 'CHOOSE_ABILITY', id: next.pending.abilities[0]!.id }).state;
      return next;
    };
    const one = direct(attacks, 'FL');
    expect([getPower(one, back), getPower(one, front)]).toEqual([3500 + 2000, 3500 + 2000]);
    // When it attacks itself, only the other copy gets the bonus (他の). (The third character has not attacked yet, so the turn goes on.)
    const two = direct(one, 'FR');
    expect([getPower(two, back), getPower(two, front)]).toEqual([3500 + 4000, 3500 + 2000]);
  });

  it('BDY/W135-070: played from hand, may put a hand card into stock; (1) and itself look at up to four cards for a 《音楽》 character', () => {
    const start = bdy({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, B(70), { player: 0, zone: 'hand' });
      take(ctx, 0, PLAIN.red, { player: 0, zone: 'hand' });
      stackTop(ctx, 0, [LOVE, PLAIN.level1, TEAR, PLAIN.yellow, B(64)]);
    }).state;
    const atUse = play(start, B(70), 'FC');
    expect(pending(atUse, 'CONFIRM')).toMatchObject({ prompt: 'USE_ABILITY', ability: 0 });
    const stocked = pick(accept(atUse), [PLAIN.red]);
    expect(idsIn(stocked, stocked.zones[0].stock)).toEqual([PLAIN.red]);
    expect(stocked.zones[0].hand).toEqual([]);

    // Look at all four (the player may stop earlier), then take one 《音楽》 character.
    let state = activate(stocked, 'FC', 1);
    for (let i = 0; i < 4; i++) {
      expect(pending(state, 'CONFIRM').prompt).toBe('LOOK_NEXT');
      state = accept(state);
    }
    expect(offered(state)).toEqual([PLAIN.yellow, PLAIN.level1].sort());
    const result = answer(state, { kind: 'SELECT_CARDS', cards: [pending(state, 'SELECT_CARDS').cards.find((o) => cardIdOfObject(state, o) === PLAIN.level1)!] });
    expect(idsIn(result.state, result.state.zones[0].hand)).toEqual([PLAIN.level1]);
    expect(result.events.some((e) => e.type === 'CARD_REVEALED')).toBe(true);
    // The other three looked at, the stock card paid and this card itself are in the waiting room; the fifth card was not touched.
    expect(idsIn(result.state, result.state.zones[0].waitingRoom).sort()).toEqual([LOVE, TEAR, PLAIN.yellow, PLAIN.red, B(70)].sort());
    expect(getInstance(result.state, result.state.zones[0].deck[result.state.zones[0].deck.length - 1]!).cardId).toBe(B(64));
  });

  it('BDY/W135-086 助太刀1000 レベル1: after using it, two discards remove an opponent’s character whose level is above the opponent’s level', () => {
    const counter = (opponentLevel: number) =>
      attackedBy(SY(5), (ctx) => {
        take(ctx, 0, PLAIN.level1, stageSlot(0, 'FC'));
        take(ctx, 0, B(86), { player: 0, zone: 'hand' });
        take(ctx, 0, PLAIN.red, { player: 0, zone: 'hand' });
        take(ctx, 0, PLAIN.blue, { player: 0, zone: 'hand' });
        ready(ctx, [PLAIN.blue], 0);
        take(ctx, 1, SY(1), stageSlot(1, 'FL')); // level 0
        for (let i = 0; i < opponentLevel; i++) take(ctx, 1, SY(13), { player: 1, zone: 'level' });
      });
    const use = (state: GameState): GameState => {
      const b = pending(state, 'COUNTER').backups[0]!;
      expect(b.ability).toBe(1);
      const atTarget = answer(state, { kind: 'COUNTER', card: b.card, ability: b.ability }).state;
      return answer(atTarget, { kind: 'SELECT_CARDS', cards: [oid(atTarget, at(atTarget, 0, 'FC'))] }).state;
    };
    // The attacker is level 2 and the opponent is level 1: it can be removed; the level 0 character cannot.
    const atPay = use(counter(1));
    expect(getPower(atPay, at(atPay, 0, 'FC'))).toBe(power(PLAIN.level1) + 1000);
    expect(pending(atPay, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST', ability: 0 });
    const atDiscard = accept(atPay);
    expect(pending(atDiscard, 'SELECT_CARDS')).toMatchObject({ prompt: 'COST_DISCARD', min: 2, max: 2 });
    const atChoose = answer(atDiscard, { kind: 'SELECT_CARDS', cards: pending(atDiscard, 'SELECT_CARDS').cards }).state;
    expect(offered(atChoose)).toEqual([SY(5)]);
    const done = pick(atChoose, [SY(5)]);
    expect(idsIn(done, done.zones[1].waitingRoom)).toContain(SY(5));
    expect(done.zones[1].stage.FC).toEqual([]);

    // An opponent at level 2 has no character above their level: the cost may still be paid, and nothing is removed.
    const level = accept(use(counter(2)));
    const after = answer(level, { kind: 'SELECT_CARDS', cards: pending(level, 'SELECT_CARDS').cards }).state;
    expect(after.pending?.kind).not.toBe('SELECT_CARDS');
    expect(after.zones[1].stage.FC).toHaveLength(1);
  });

  it('BDY/W135-087: +4000 in your turn with two other 《音楽》 characters; reversed by a cost-0 character, it may put that character on the bottom of its owner’s deck', () => {
    const stage = (others: number, turnPlayer: PlayerId = 0) => {
      const state = bdy({ step: 'MAIN_START', turnPlayer }, (ctx) => {
        take(ctx, 0, B(87), stageSlot(0, 'FC'));
        (['FL', 'FR'] as const).slice(0, others).forEach((slot) => take(ctx, 0, PLAIN.red, stageSlot(0, slot)));
      }).state;
      return getPower(state, at(state, 0, 'FC'));
    };
    expect([stage(2), stage(1), stage(2, 1)]).toEqual([6000, 2000, 2000]);

    const reversedBy = (attacker: string) => attackedBy(attacker, (ctx) => take(ctx, 0, B(87), stageSlot(0, 'FC')));
    // 涼宮ハルヒ SY/W08-T01: cost 0, power 3000 against this card's 2000 in the opponent's turn.
    const atUse = until(reversedBy(SY(1)), asked('USE_ABILITY', B(87)));
    const attacker = at(atUse, 1, 'FC');
    const done = accept(atUse);
    expect(done.zones[1].stage.FC).toEqual([]);
    expect(done.zones[1].deck[0]).toBe(attacker); // the bottom of its owner's deck
    // A cost 1 attacker (SY/W08-T05): the condition does not hold, nothing is asked.
    let costly = reversedBy(SY(5));
    for (let i = 0; i < 50 && costly.turn?.player === 1; i++) {
      expect(asked('USE_ABILITY', B(87))(costly)).toBe(false);
      costly = answer(costly, routine(costly.pending!)).state;
    }
    expect(costly.zones[1].stage.FC).toHaveLength(1);
    expect(idsIn(costly, costly.zones[0].waitingRoom)).toContain(B(87));
  });

  it('BDY/W135-089: (1) and itself to the bottom of the deck return up to two 《夢限大みゅーたいぷ》 characters; 助太刀3000 レベル2', () => {
    const start = bdy({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, B(89), stageSlot(0, 'FC'));
      take(ctx, 0, PLAIN.blue, { player: 0, zone: 'stock' });
      take(ctx, 0, PLAIN.yellow, { player: 0, zone: 'waitingRoom' });
      take(ctx, 0, PLAIN.red, { player: 0, zone: 'waitingRoom' });
      take(ctx, 0, B(72), { player: 0, zone: 'waitingRoom' }); // 《フェアリィブゥケ》, not 《夢限大みゅーたいぷ》
      take(ctx, 0, LOVE, { player: 0, zone: 'waitingRoom' });
    }).state;
    const card = at(start, 0, 'FC');
    const atChoose = activate(start, 'FC', 0);
    expect(atChoose.zones[0].deck[0]).toBe(card);
    expect(pending(atChoose, 'SELECT_CARDS')).toMatchObject({ min: 0, max: 2 });
    // The stock card that paid the cost is a 《夢限大みゅーたいぷ》 character too and is in the waiting room now.
    expect(offered(atChoose)).toEqual([PLAIN.yellow, PLAIN.red, PLAIN.blue].sort());
    const done = pick(atChoose, [PLAIN.yellow, PLAIN.red]);
    expect(idsIn(done, done.zones[0].hand).sort()).toEqual([PLAIN.yellow, PLAIN.red].sort());
    expect(getCard(B(89)).def.abilities![1]).toEqual(backup(3000, 2, [{ pay: 'STOCK', count: 1 }, { pay: 'SELF_TO_WAITING_ROOM' }]));
    expect(getCard(B(89)).def.counter).toBe(true);
  });
});
