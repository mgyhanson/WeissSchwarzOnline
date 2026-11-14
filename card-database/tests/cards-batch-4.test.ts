/**
 * Tests for the second batch of hand-written cards from the five newest
 * boosters (2026-11-14): ANM/W138, NIK/S135, STS/W140, and two more each of
 * GUP/W141 and BDY/W135, using the real card data. Both players have every
 * card of the booster under test, three copies each; cards without ability
 * data serve as plain characters.
 */

import { describe, expect, it } from 'vitest';
import { type Choice, type Ctx, type Decision, type GameState, type PlayerId, type SlotId, getInstance, getPower, stageSlot } from '@wso/game-engine';
import { getCard } from '../src/index';
import { answer, oid, pending, scenario, stackTop, take } from './helpers';
import type { RealScenario } from './helpers';

const id = (prefix: string) => (n: number): string => `${prefix}-${String(n).padStart(3, '0')}`;
const ANM = id('ANM/W138');
const NIK = id('NIK/S135');
const STS = id('STS/W140');
const GUP = id('GUP/W141');
const BDY = id('BDY/W135');

type SetName = 'ANM_W138' | 'NIK_S135' | 'STS_W140' | 'GUP_W141' | 'BDY_W135';
const game = (set: SetName, options: Omit<RealScenario, 'sets'>, arrange: (ctx: Ctx) => void = () => {}) =>
  scenario({ ...options, sets: [`${set}:ALL`, `${set}:ALL`] }, arrange).state;

const at = (state: GameState, player: PlayerId, slot: SlotId): number => state.zones[player].stage[slot][0]!;
const idsIn = (state: GameState, ids: readonly number[]): string[] => ids.map((i) => getInstance(state, i).cardId);
const cardIdOfObject = (state: GameState, objectId: number): string => state.instances.find((i) => i.objectId === objectId)!.cardId;
const inHand = (state: GameState, cardId: string): number => state.zones[0].hand.find((i) => getInstance(state, i).cardId === cardId)!;
const power = (cardId: string): number => getCard(cardId).def.power!;
const level = (cardId: string): number => getCard(cardId).def.level!;

const play = (state: GameState, cardId: string, slot: SlotId): GameState => answer(state, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(state, inHand(state, cardId)), slot } }).state;
const activate = (state: GameState, slot: SlotId, ability: number): GameState => answer(state, { kind: 'MAIN', action: { type: 'ACTIVATE', card: oid(state, at(state, 0, slot)), ability } }).state;
const attack = (state: GameState, player: PlayerId, slot: SlotId, type: 'FRONT' | 'SIDE' | 'DIRECT'): GameState =>
  answer(state, { kind: 'ATTACK', attack: { attacker: oid(state, at(state, player, slot)), type } }).state;
const accept = (state: GameState): GameState => answer(state, { kind: 'CONFIRM', accept: true }).state;
const decline = (state: GameState): GameState => answer(state, { kind: 'CONFIRM', accept: false }).state;
const pick = (state: GameState, cardIds: string[]): GameState => {
  const decision = pending(state, 'SELECT_CARDS');
  const chosen = cardIds.map((cardId) => {
    const found = decision.cards.find((o) => cardIdOfObject(state, o) === cardId);
    if (found === undefined) throw new Error(`${cardId} cannot be chosen; offered: ${decision.cards.map((o) => cardIdOfObject(state, o)).join(', ')}`);
    return found;
  });
  return answer(state, { kind: 'SELECT_CARDS', cards: chosen }).state;
};
const offered = (state: GameState): string[] => [...new Set(pending(state, 'SELECT_CARDS').cards.map((o) => cardIdOfObject(state, o)))].sort();

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

/** Answers routine decisions (pass, decline) until `stop` holds. */
function until(state: GameState, stop: (s: GameState) => boolean): GameState {
  let current = state;
  for (let i = 0; i < 300 && !stop(current); i++) current = answer(current, routine(current.pending!)).state;
  if (!stop(current)) throw new Error('until: the condition never held');
  return current;
}

/** Paying an アンコール cost by discarding `discard`: whether `card` comes back from the waiting room to the front-centre slot, rested (and is there afterwards). */
function returnsRested(atDiscard: GameState, discard: string, card: string): boolean {
  const result = answer(atDiscard, { kind: 'SELECT_CARDS', cards: [pending(atDiscard, 'SELECT_CARDS').cards.find((o) => cardIdOfObject(atDiscard, o) === discard)!] });
  const back = result.events.find((e) => e.type === 'CARD_MOVED' && e.cardId === card && e.from.zone === 'waitingRoom' && e.to.zone === 'stage');
  return (
    back?.type === 'CARD_MOVED' &&
    back.to.zone === 'stage' &&
    back.to.slot === 'FC' &&
    back.orientation === 'REST' &&
    getInstance(result.state, at(result.state, 0, 'FC')).cardId === card &&
    idsIn(result.state, result.state.zones[0].waitingRoom).includes(discard)
  );
}

const asked = (prompt: 'PAY_COST' | 'USE_ABILITY', cardId: string) => (s: GameState): boolean => s.pending?.kind === 'CONFIRM' && s.pending.prompt === prompt && s.pending.cardId === cardId;
const deciding = (player: PlayerId, kind: Decision['kind']) => (s: GameState): boolean => s.turn?.player === player && s.pending?.kind === kind;

/** Plain characters (no ability data in the engine) of each booster: three level 0 ones and others by level. */
const PLAIN: Record<SetName, { zero: [string, string, string]; one: string; two: string; three: string; climax: string }> = {
  ANM_W138: { zero: [ANM(1), ANM(27), ANM(52)], one: ANM(6), two: ANM(12), three: ANM(2), climax: ANM(24) },
  NIK_S135: { zero: [NIK(4), NIK(28), NIK(56)], one: NIK(1), two: NIK(9), three: NIK(30), climax: NIK(24) },
  STS_W140: { zero: [STS(1), STS(35), STS(68)], one: STS(36), two: STS(44), three: STS(37), climax: STS(31) },
  GUP_W141: { zero: [GUP(29), GUP(58), GUP(2)], one: GUP(89), two: GUP(90), three: GUP(85), climax: GUP(26) },
  BDY_W135: { zero: [BDY(1), BDY(33), BDY(77)], one: BDY(72), two: BDY(79), three: BDY(2), climax: BDY(26) },
};

/** Plain cards on top of both decks, so that trigger checks and damage turn over nothing with an effect. */
function calm(ctx: Ctx, set: SetName): void {
  const cards = PLAIN[set].zero.flatMap((c) => [c, c]);
  stackTop(ctx, 0, cards);
  stackTop(ctx, 1, cards);
}

/** Level zone cards (for the level and colour needed to play a card) and stock cards for player 0. */
function ready(ctx: Ctx, levelCards: string[], stockCards: string[]): void {
  for (const c of levelCards) take(ctx, 0, c, { player: 0, zone: 'level' });
  for (const c of stockCards) take(ctx, 0, c, { player: 0, zone: 'stock' });
}

/** Player 1 front-attacks player 0's front-centre character with `attacker`; player 1 has `opponentLevel` cards in the level zone. */
function attackedBy(set: SetName, attacker: string, opponentLevel: number, arrange: (ctx: Ctx) => void): GameState {
  const start = game(set, { step: 'ATTACK_START', turnPlayer: 1 }, (ctx) => {
    take(ctx, 1, attacker, stageSlot(1, 'FC'));
    for (let i = 0; i < opponentLevel; i++) take(ctx, 1, PLAIN[set].zero[i]!, { player: 1, zone: 'level' });
    arrange(ctx);
    calm(ctx, set);
  });
  return attack(start, 1, 'FC', 'FRONT');
}

/** 【自】［(1) あなたの山札の上から1枚をクロック置場に置く］ …山札を見てレベル1以下のキャラを1枚まで選んで相手に見せ、手札に加え、その山札をシャッフルする (ANM/W138-004, NIK/S135-029). */
function searchesLowLevel(set: SetName, card: string): void {
  const [a, b] = PLAIN[set].zero;
  const start = game(set, { step: 'MAIN_START' }, (ctx) => {
    take(ctx, 0, card, { player: 0, zone: 'hand' });
    ready(ctx, [], [a]);
    stackTop(ctx, 0, [b]);
  });
  const atPay = play(start, card, 'FC');
  expect(pending(atPay, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST', ability: 0 });
  const atChoose = accept(atPay);
  // Paid in the order written: the stock card to the waiting room, then the top card of the deck into the clock.
  expect(idsIn(atChoose, atChoose.zones[0].waitingRoom)).toEqual([a]);
  expect(idsIn(atChoose, atChoose.zones[0].clock)).toEqual([b]);
  expect(pending(atChoose, 'SELECT_CARDS')).toMatchObject({ min: 0, max: 1 });
  const choices = offered(atChoose);
  expect(choices.every((c) => getCard(c).def.kind === 'CHARACTER' && level(c) <= 1)).toBe(true);
  expect(choices).toContain(PLAIN[set].one);
  expect(choices).not.toContain(PLAIN[set].two);
  const before = [...atChoose.zones[0].deck];
  const result = answer(atChoose, { kind: 'SELECT_CARDS', cards: [pending(atChoose, 'SELECT_CARDS').cards.find((o) => cardIdOfObject(atChoose, o) === PLAIN[set].one)!] });
  expect(idsIn(result.state, result.state.zones[0].hand)).toEqual([PLAIN[set].one]);
  expect(result.events.some((e) => e.type === 'CARD_REVEALED')).toBe(true);
  expect(result.events.some((e) => e.type === 'DECK_SHUFFLED')).toBe(true);
  expect(result.state.zones[0].deck).toHaveLength(before.length - 1);

  // Without stock the cost cannot be paid and nothing is asked.
  const poor = game(set, { step: 'MAIN_START' }, (ctx) => take(ctx, 0, card, { player: 0, zone: 'hand' }));
  expect(play(poor, card, 'FC').pending?.kind).toBe('MAIN');
}

/** 【自】 このカードが手札から舞台に置かれた時かアタックした時、あなたは自分の《…》のキャラを1枚選び、そのターン中、パワーを＋N (ANM/W138-068, NIK/S135-031 when placed with nothing else waiting). */
function boostsWhenAttacking(set: SetName, card: string, amount: number): void {
  const ally = PLAIN[set].zero[0];
  const start = game(set, { step: 'ATTACK_START' }, (ctx) => {
    take(ctx, 0, card, stageSlot(0, 'FC'));
    take(ctx, 0, ally, stageSlot(0, 'FL'));
    calm(ctx, set);
  });
  // Another character attacking does not trigger it.
  expect(attack(start, 0, 'FL', 'DIRECT').pending?.kind).toBe('ATTACK');
  // Its own attack does; it may choose itself or another character.
  const atChoose = attack(start, 0, 'FC', 'DIRECT');
  expect(pending(atChoose, 'SELECT_CARDS')).toMatchObject({ min: 1, max: 1 });
  expect(offered(atChoose)).toEqual([card, ally].sort());
  const self = pick(atChoose, [card]);
  expect([getPower(self, at(self, 0, 'FC')), getPower(self, at(self, 0, 'FL'))]).toEqual([power(card) + amount, power(ally)]);
  // Once per attack: the game goes on to the next attack.
  expect(self.pending?.kind).toBe('ATTACK');
  const other = pick(atChoose, [ally]);
  expect([getPower(other, at(other, 0, 'FC')), getPower(other, at(other, 0, 'FL'))]).toEqual([power(card), power(ally) + amount]);
}

/**
 * 【自】 このカードがアタックした時、あなたは他の自分の《…》のキャラを1枚選び、次の相手のターンの終わりまで、パワーを＋Nし、
 * 『【自】 アンコール ［手札のキャラを1枚控え室に置く］』を与える (GUP/W141-069, NIK/S135-029).
 */
function boostsUntilNextOpponentTurn(set: SetName, card: string, amount: number): void {
  const ally = PLAIN[set].one;
  const spare = PLAIN[set].two;
  const start = game(set, { step: 'ATTACK_START' }, (ctx) => {
    take(ctx, 0, card, stageSlot(0, 'FL'));
    take(ctx, 0, ally, stageSlot(0, 'FC'));
    take(ctx, 1, PLAIN[set].three, stageSlot(1, 'FC'));
    take(ctx, 0, spare, { player: 0, zone: 'hand' });
    take(ctx, 0, PLAIN[set].climax, { player: 0, zone: 'hand' }); // a climax cannot pay the アンコール given
    calm(ctx, set);
  });
  const atChoose = attack(start, 0, 'FL', 'DIRECT');
  // Another character only: not this card itself.
  expect(pending(atChoose, 'SELECT_CARDS')).toMatchObject({ min: 1, max: 1 });
  expect(offered(atChoose)).toEqual([ally]);
  const boosted = pick(atChoose, [ally]);
  expect(getPower(boosted, at(boosted, 0, 'FC'))).toBe(power(ally) + amount);

  // It lasts through the opponent's next turn ...
  const opponentTurn = until(boosted, deciding(1, 'ATTACK'));
  expect(getPower(opponentTurn, at(opponentTurn, 0, 'FC'))).toBe(power(ally) + amount);
  // ... and is gone in the turn after it.
  const later = until(opponentTurn, deciding(0, 'MAIN'));
  expect(getPower(later, at(later, 0, 'FC'))).toBe(power(ally));
  expect(later.grants).toHaveLength(0);

  // In that opponent's turn the character is reversed in battle and comes back with the アンコール it was given: discard a character.
  const battle = attack(opponentTurn, 1, 'FC', 'FRONT');
  const atEncore = until(battle, (s) => s.pending?.kind === 'CONFIRM' && s.pending.player === 0 && s.pending.prompt === 'PAY_COST');
  const atDiscard = accept(atEncore);
  expect(pending(atDiscard, 'SELECT_CARDS').prompt).toBe('COST_DISCARD');
  expect(offered(atDiscard)).toEqual([spare]);
  expect(returnsRested(atDiscard, spare, ally)).toBe(true);
}

/** 【自】 このカードが【リバース】した時、このカードのバトル相手のレベルが相手のレベルより高いなら、あなたはそのキャラを山札の下に置いてよい (GUP/W141-108, BDY/W135-091). */
function sendsHigherLevelOpponentToDeckBottom(set: SetName, card: string): void {
  const reversedBy = (attacker: string, opponentLevel: number) => attackedBy(set, attacker, opponentLevel, (ctx) => take(ctx, 0, card, stageSlot(0, 'FC')));
  // A level 3 attacker while the opponent is at level 2: higher.
  const atUse = until(reversedBy(PLAIN[set].three, 2), asked('USE_ABILITY', card));
  const attacker = at(atUse, 1, 'FC');
  const done = accept(atUse);
  expect(done.zones[1].stage.FC).toEqual([]);
  expect(done.zones[1].deck[0]).toBe(attacker);
  // Declining leaves it where it is.
  expect(decline(atUse).zones[1].stage.FC).toEqual([attacker]);
  // The same attacker while the opponent is at level 3: not higher, nothing is asked.
  let equal = reversedBy(PLAIN[set].three, 3);
  for (let i = 0; i < 50 && equal.turn?.player === 1; i++) {
    expect(asked('USE_ABILITY', card)(equal)).toBe(false);
    equal = answer(equal, routine(equal.pending!)).state;
  }
  expect(idsIn(equal, equal.zones[0].waitingRoom)).toContain(card);
}

describe('ANM/W138 anemoi', () => {
  it('ANM/W138-004: (1) and the top card of the deck into the clock search the deck for a level 1 or lower character', () => {
    searchesLowLevel('ANM_W138', ANM(4));
  });

  it('ANM/W138-068: played from hand or attacking, it gives one of your 《風》 characters +3000 for the turn', () => {
    const start = game('ANM_W138', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, ANM(68), { player: 0, zone: 'hand' });
      take(ctx, 0, ANM(1), stageSlot(0, 'FL'));
      ready(ctx, [ANM(52)], []);
    });
    const atChoose = play(start, ANM(68), 'FC');
    expect(pending(atChoose, 'SELECT_CARDS')).toMatchObject({ min: 1, max: 1 });
    expect(offered(atChoose)).toEqual([ANM(1), ANM(68)].sort());
    const done = pick(atChoose, [ANM(1)]);
    expect(done.pending?.kind).toBe('MAIN');
    expect([getPower(done, at(done, 0, 'FL')), getPower(done, at(done, 0, 'FC'))]).toEqual([power(ANM(1)) + 3000, power(ANM(68))]);
    boostsWhenAttacking('ANM_W138', ANM(68), 3000);
  });

  it('ANM/W138-095: attacking, it gets +6000 when the character facing it is level 3 or higher', () => {
    const attacking = (facing: string | null) => {
      const start = game('ANM_W138', { step: 'ATTACK_START' }, (ctx) => {
        take(ctx, 0, ANM(95), stageSlot(0, 'FC'));
        if (facing) take(ctx, 1, facing, stageSlot(1, 'FC'));
        // A level 3 character that does not face it changes nothing.
        take(ctx, 1, ANM(32), stageSlot(1, 'FL'));
        calm(ctx, 'ANM_W138');
      });
      const after = attack(start, 0, 'FC', facing ? 'FRONT' : 'DIRECT');
      return getPower(after, at(after, 0, 'FC'));
    };
    expect(level(ANM(2))).toBe(3);
    expect(attacking(ANM(2))).toBe(power(ANM(95)) + 6000);
    expect(attacking(ANM(12))).toBe(power(ANM(95)));
    expect(attacking(null)).toBe(power(ANM(95)));
  });
});

describe('NIK/S135 勝利の女神：NIKKE Vol.2', () => {
  it('NIK/S135-029: searches for a level 1 or lower character; attacking, gives another 《NIKKE》 character +500 and アンコール until the end of the opponent’s next turn', () => {
    searchesLowLevel('NIK_S135', NIK(29));
    boostsUntilNextOpponentTurn('NIK_S135', NIK(29), 500);
  });

  it('NIK/S135-031: +1500 to one of your 《NIKKE》 characters when played or attacking; (1) and a discard return the whole waiting room to the deck', () => {
    const start = game('NIK_S135', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, NIK(31), { player: 0, zone: 'hand' });
      take(ctx, 0, NIK(9), { player: 0, zone: 'hand' });
      ready(ctx, [], [NIK(4)]);
      for (const c of [NIK(28), NIK(56), NIK(24)]) take(ctx, 0, c, { player: 0, zone: 'waitingRoom' });
      take(ctx, 1, NIK(28), { player: 1, zone: 'waitingRoom' });
    });
    // Both abilities trigger on being played: the player orders them.
    const atOrder = play(start, NIK(31), 'FC');
    const options = pending(atOrder, 'CHOOSE_ABILITY').abilities;
    expect(options.map((o) => o.ability).sort()).toEqual([0, 1]);
    const atPay = answer(atOrder, { kind: 'CHOOSE_ABILITY', id: options.find((o) => o.ability === 1)!.id }).state;
    expect(pending(atPay, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST', ability: 1 });
    const atDiscard = accept(atPay);
    expect(pending(atDiscard, 'SELECT_CARDS').prompt).toBe('COST_DISCARD');
    const before = atDiscard.zones[0].deck.length;
    const returned = pick(atDiscard, [NIK(9)]);
    // Three cards that were there, the stock card and the discarded card: all five are back in the deck.
    expect(returned.zones[0].waitingRoom).toEqual([]);
    expect(returned.zones[0].deck).toHaveLength(before + 5);
    expect(returned.zones[0].clock).toEqual([]);
    expect(returned.zones[1].waitingRoom).toHaveLength(1);
    // Then the other ability: the only 《NIKKE》 character is this card.
    expect(offered(returned)).toEqual([NIK(31)]);
    const done = pick(returned, [NIK(31)]);
    expect(getPower(done, at(done, 0, 'FC'))).toBe(power(NIK(31)) + 1500);
    boostsWhenAttacking('NIK_S135', NIK(31), 1500);
  });
});

describe('STS/W140 ステラソラ', () => {
  it('STS/W140-052: +3000 with two other 《巡遊者》 or 《魔王》 characters; アンコール by discarding such a character', () => {
    const stage = (others: number) => {
      const state = game('STS_W140', { step: 'MAIN_START' }, (ctx) => {
        take(ctx, 0, STS(52), stageSlot(0, 'FC'));
        (['FL', 'FR'] as const).slice(0, others).forEach((slot) => take(ctx, 0, STS(1), stageSlot(0, slot)));
      });
      return getPower(state, at(state, 0, 'FC'));
    };
    expect([stage(2), stage(1), stage(0)]).toEqual([10000, 7000, 7000]);

    const battle = attackedBy('STS_W140', STS(37), 0, (ctx) => {
      take(ctx, 0, STS(52), stageSlot(0, 'FC'));
      take(ctx, 0, STS(1), { player: 0, zone: 'hand' });
      take(ctx, 0, STS(31), { player: 0, zone: 'hand' }); // a climax cannot pay
    });
    const atEncore = until(battle, asked('PAY_COST', STS(52)));
    const atDiscard = accept(atEncore);
    expect(offered(atDiscard)).toEqual([STS(1)]);
    expect(returnsRested(atDiscard, STS(1), STS(52))).toBe(true);
    // Without paying it stays in the waiting room.
    const gone = until(decline(atEncore), deciding(0, 'MAIN'));
    expect(idsIn(gone, gone.zones[0].waitingRoom)).toContain(STS(52));
  });

  it('STS/W140-054: played from hand, an opponent’s front row character gets -1000 for the turn; attacking, another 《巡遊者》 or 《魔王》 character gets +1000', () => {
    const start = game('STS_W140', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, STS(54), { player: 0, zone: 'hand' });
      take(ctx, 1, STS(35), stageSlot(1, 'FC')); // power 500
      take(ctx, 1, STS(36), stageSlot(1, 'FL')); // power 3000
      take(ctx, 1, STS(1), stageSlot(1, 'BL'));
    });
    const atChoose = play(start, STS(54), 'FC');
    // The front row only, and one must be chosen.
    expect(pending(atChoose, 'SELECT_CARDS')).toMatchObject({ min: 1, max: 1 });
    expect(offered(atChoose)).toEqual([STS(35), STS(36)].sort());
    const weakened = pick(atChoose, [STS(36)]);
    expect(getPower(weakened, at(weakened, 1, 'FL'))).toBe(2000);
    // CR-9.5.1: a character whose power is 0 or less is put into the waiting room.
    const removed = pick(atChoose, [STS(35)]);
    expect(removed.zones[1].stage.FC).toEqual([]);
    expect(idsIn(removed, removed.zones[1].waitingRoom)).toEqual([STS(35)]);

    const attackStart = game('STS_W140', { step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, STS(54), stageSlot(0, 'FC'));
      take(ctx, 0, STS(1), stageSlot(0, 'FL'));
      calm(ctx, 'STS_W140');
    });
    const choose = attack(attackStart, 0, 'FC', 'DIRECT');
    expect(offered(choose)).toEqual([STS(1)]);
    const done = pick(choose, [STS(1)]);
    expect(getPower(done, at(done, 0, 'FL'))).toBe(power(STS(1)) + 1000);
  });

  it('STS/W140-073: put into the clock, it looks at up to four cards for a 《巡遊者》 or 《魔王》 character; rested, it gives a character +1500', () => {
    const start = game('STS_W140', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, STS(73), stageSlot(0, 'FC'));
      take(ctx, 0, STS(1), stageSlot(0, 'FL'));
      stackTop(ctx, 0, [STS(31), STS(35), STS(29), STS(36), STS(68)]);
    });
    let state = activate(start, 'FC', 0);
    expect(idsIn(state, state.zones[0].clock)).toEqual([STS(73)]);
    for (let i = 0; i < 4; i++) {
      expect(pending(state, 'CONFIRM').prompt).toBe('LOOK_NEXT');
      state = accept(state);
    }
    // Of the four cards looked at, the climax and the event cannot be taken.
    expect(offered(state)).toEqual([STS(35), STS(36)].sort());
    const result = answer(state, { kind: 'SELECT_CARDS', cards: [pending(state, 'SELECT_CARDS').cards.find((o) => cardIdOfObject(state, o) === STS(36))!] });
    expect(idsIn(result.state, result.state.zones[0].hand)).toEqual([STS(36)]);
    expect(result.events.some((e) => e.type === 'CARD_REVEALED')).toBe(true);
    expect(idsIn(result.state, result.state.zones[0].waitingRoom).sort()).toEqual([STS(31), STS(35), STS(29)].sort());

    const atChoose = activate(start, 'FC', 1);
    expect(getInstance(atChoose, at(atChoose, 0, 'FC')).orientation).toBe('REST');
    expect(offered(atChoose)).toEqual([STS(1), STS(73)].sort());
    const done = pick(atChoose, [STS(1)]);
    expect(getPower(done, at(done, 0, 'FL'))).toBe(power(STS(1)) + 1500);
    // Rested, it cannot be used again.
    expect(pending(done, 'MAIN').actions.some((a) => a.type === 'ACTIVATE' && a.ability === 1)).toBe(false);
  });
});

describe('GUP/W141 ガールズ＆パンツァー, second batch', () => {
  it('GUP/W141-069: with two other 《戦車道》 characters it may draw one, then discards one; attacking, gives another 《戦車道》 character +1500 and アンコール until the end of the opponent’s next turn', () => {
    const placed = (others: number) => {
      const start = game('GUP_W141', { step: 'MAIN_START' }, (ctx) => {
        take(ctx, 0, GUP(69), { player: 0, zone: 'hand' });
        take(ctx, 0, GUP(90), { player: 0, zone: 'hand' });
        ready(ctx, [GUP(58)], []);
        (['FL', 'FR'] as const).slice(0, others).forEach((slot) => take(ctx, 0, GUP(29), stageSlot(0, slot)));
        stackTop(ctx, 0, [GUP(89)]);
      });
      return play(start, GUP(69), 'FC');
    };
    expect(placed(1).pending?.kind).toBe('MAIN');
    const atUse = placed(2);
    expect(pending(atUse, 'CONFIRM')).toMatchObject({ prompt: 'USE_ABILITY', ability: 0 });
    const atDiscard = accept(atUse);
    // The card drawn can be the one discarded.
    expect(pending(atDiscard, 'SELECT_CARDS')).toMatchObject({ min: 1, max: 1 });
    expect(offered(atDiscard)).toEqual([GUP(89), GUP(90)].sort());
    const done = pick(atDiscard, [GUP(90)]);
    expect(idsIn(done, done.zones[0].hand)).toEqual([GUP(89)]);
    expect(idsIn(done, done.zones[0].waitingRoom)).toEqual([GUP(90)]);
    // Not drawing: no discard either.
    const kept = decline(atUse);
    expect(idsIn(kept, kept.zones[0].hand)).toEqual([GUP(90)]);
    expect(kept.zones[0].waitingRoom).toEqual([]);

    boostsUntilNextOpponentTurn('GUP_W141', GUP(69), 1500);
  });

  it('GUP/W141-108: with four other 《戦車道》 characters it may put one from the waiting room into stock; reversed by a character whose level is above the opponent’s, it may put that character under the deck', () => {
    const placed = (others: number) => {
      const start = game('GUP_W141', { step: 'MAIN_START' }, (ctx) => {
        take(ctx, 0, GUP(108), { player: 0, zone: 'hand' });
        ready(ctx, [GUP(89)], [GUP(58)]);
        (['FL', 'FR', 'BL', 'BR'] as const).slice(0, others).forEach((slot, i) => take(ctx, 0, [GUP(29), GUP(29), GUP(2), GUP(2)][i]!, stageSlot(0, slot)));
        take(ctx, 0, GUP(90), { player: 0, zone: 'waitingRoom' });
        take(ctx, 0, GUP(26), { player: 0, zone: 'waitingRoom' });
      });
      return play(start, GUP(108), 'FC');
    };
    expect(placed(3).pending?.kind).toBe('MAIN');
    const atUse = placed(4);
    expect(pending(atUse, 'CONFIRM')).toMatchObject({ prompt: 'USE_ABILITY', ability: 0 });
    const atChoose = accept(atUse);
    // The stock card that paid for playing it is a 《戦車道》 character in the waiting room now; the climax is not offered.
    expect(offered(atChoose)).toEqual([GUP(58), GUP(90)].sort());
    const done = pick(atChoose, [GUP(90)]);
    expect(idsIn(done, done.zones[0].stock)).toEqual([GUP(90)]);

    sendsHigherLevelOpponentToDeckBottom('GUP_W141', GUP(108));
  });
});

describe('BDY/W135 BanG Dream! [夢限大みゅーたいぷ], second batch', () => {
  it('BDY/W135-038: 応援 gives the 《夢限大みゅーたいぷ》 characters in front of it +500 per level; 集中 returns a character for each climax turned over', () => {
    const start = game('BDY_W135', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, BDY(38), stageSlot(0, 'BL'));
      take(ctx, 0, BDY(15), stageSlot(0, 'FL')); // level 2 《夢限大みゅーたいぷ》
      take(ctx, 0, BDY(72), stageSlot(0, 'FC')); // level 1, 《フェアリィブゥケ》: not helped
      take(ctx, 0, BDY(7), stageSlot(0, 'FR')); // level 1 《夢限大みゅーたいぷ》, but not in front of the back-left slot
      take(ctx, 0, BDY(77), { player: 0, zone: 'stock' });
      take(ctx, 0, BDY(79), { player: 0, zone: 'waitingRoom' });
      take(ctx, 0, BDY(64), { player: 0, zone: 'waitingRoom' });
      stackTop(ctx, 0, [BDY(26), BDY(33), BDY(33), BDY(1)]);
    });
    expect(level(BDY(15))).toBe(2);
    expect([getPower(start, at(start, 0, 'FL')), getPower(start, at(start, 0, 'FC')), getPower(start, at(start, 0, 'FR'))]).toEqual([power(BDY(15)) + 1000, power(BDY(72)), power(BDY(7))]);
    // In the front row 応援 does nothing.
    const front = game('BDY_W135', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, BDY(38), stageSlot(0, 'FC'));
      take(ctx, 0, BDY(15), stageSlot(0, 'FL'));
    });
    expect(getPower(front, at(front, 0, 'FL'))).toBe(power(BDY(15)));

    // One climax among the four cards: one choice of up to one character of any trait; climaxes are not offered.
    const atChoose = activate(start, 'BL', 1);
    expect(pending(atChoose, 'SELECT_CARDS')).toMatchObject({ min: 0, max: 1 });
    expect(offered(atChoose)).toEqual([BDY(1), BDY(33), BDY(77), BDY(79)].sort());
    const done = pick(atChoose, [BDY(79)]);
    expect(done.pending?.kind).toBe('MAIN');
    expect(idsIn(done, done.zones[0].hand)).toEqual([BDY(79)]);
    expect(getInstance(done, at(done, 0, 'BL')).orientation).toBe('REST');
  });

  it('BDY/W135-091: gives another 《音楽》 character “+6000 when attacking a facing level 2 or higher character” for the turn; reversed by a character whose level is above the opponent’s, it may put that character under the deck', () => {
    const turn = (facing: string) => {
      const start = game('BDY_W135', { step: 'MAIN_START' }, (ctx) => {
        take(ctx, 0, BDY(91), { player: 0, zone: 'hand' });
        take(ctx, 0, BDY(72), stageSlot(0, 'FC'));
        ready(ctx, [BDY(77), BDY(72)], [BDY(33)]);
        take(ctx, 1, facing, stageSlot(1, 'FC'));
        calm(ctx, 'BDY_W135');
      });
      const atChoose = play(start, BDY(91), 'FL');
      // Another character: not this card itself.
      expect(pending(atChoose, 'SELECT_CARDS')).toMatchObject({ min: 1, max: 1 });
      expect(offered(atChoose)).toEqual([BDY(72)]);
      const given = pick(atChoose, [BDY(72)]);
      expect(getPower(given, at(given, 0, 'FC'))).toBe(power(BDY(72)));
      const atAttack = until(given, deciding(0, 'ATTACK'));
      const after = attack(atAttack, 0, 'FC', 'FRONT');
      return getPower(after, at(after, 0, 'FC'));
    };
    expect(turn(BDY(79))).toBe(power(BDY(72)) + 6000); // facing a level 2 character
    expect(turn(BDY(7))).toBe(power(BDY(72))); // facing a level 1 character

    sendsHigherLevelOpponentToDeckBottom('BDY_W135', BDY(91));
  });
});
