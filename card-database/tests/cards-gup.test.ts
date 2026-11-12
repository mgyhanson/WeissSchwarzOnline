/**
 * Tests for the GUP/W141 cards in the database, using the real card data.
 * Player 0 uses these cards; player 1 uses the 涼宮ハルヒ trial deck cards.
 */

import { describe, expect, it } from 'vitest';
import { type Choice, type Ctx, type GameState, type PlayerId, getInstance, getPower, getSoul, stageSlot } from '@wso/game-engine';
import { getCard } from '../src/index';
import { GUP, HARUHI, answer, answerAll, oid, pending, scenario, stackTop, take } from './helpers';
import type { RealScenario } from './helpers';

const G = (n: number): string => `GUP/W141-${String(n).padStart(3, '0')}`;
const SY = (n: number): string => `SY/W08-T${String(n).padStart(2, '0')}`;

const gup = (options: Omit<RealScenario, 'sets'>, arrange: (ctx: Ctx) => void = () => {}) => scenario({ ...options, sets: [GUP, HARUHI] }, arrange);

const at = (state: GameState, player: PlayerId, slot: 'FL' | 'FC' | 'FR' | 'BL' | 'BR'): number => state.zones[player].stage[slot][0]!;
const cardIn = (state: GameState, ids: readonly number[], cardId: string): number => ids.find((id) => getInstance(state, id).cardId === cardId)!;
const cardIdOfObject = (state: GameState, objectId: number): string => state.instances.find((i) => i.objectId === objectId)!.cardId;
const ids = (state: GameState, list: readonly number[]): string[] => list.map((id) => getInstance(state, id).cardId);

const safeTopForP1 = (ctx: Ctx): void => {
  stackTop(ctx, 1, [SY(12), SY(12), SY(12), SY(15), SY(15), SY(15)]);
};
/** Player 0's deck top without climaxes. */
const plainTopForP0 = (ctx: Ctx): void => {
  stackTop(ctx, 0, [G(17), G(17), G(44), G(44)]);
};

/** Answers routine decisions (no attacks, no counter, no rules encore) until `stop` holds. */
function until(state: GameState, stop: (s: GameState) => boolean): GameState {
  let current = state;
  for (let i = 0; i < 50 && !stop(current); i++) {
    const d = current.pending!;
    let choice: Choice;
    if (d.kind === 'ATTACK') choice = { kind: 'ATTACK', attack: null };
    else if (d.kind === 'COUNTER') choice = { kind: 'COUNTER', card: null };
    else if (d.kind === 'CONFIRM' && d.prompt === 'ENCORE') choice = { kind: 'CONFIRM', accept: false };
    else if (d.kind === 'CHOOSE_ABILITY') choice = { kind: 'CHOOSE_ABILITY', id: (d.abilities.find((a) => a.type === 'CARD') ?? d.abilities[0]!).id };
    else throw new Error(`Unexpected ${d.kind} ${JSON.stringify(d).slice(0, 160)}`);
    current = answer(current, choice).state;
  }
  return current;
}

/** Player 1 front-attacks player 0's front-centre character with a 9000 character, and the game runs to the first PAY_COST question. */
function defeated(arrange: (ctx: Ctx) => void): GameState {
  const start = gup({ step: 'ATTACK_START', turnPlayer: 1 }, (ctx) => {
    take(ctx, 1, SY(7), stageSlot(1, 'FC'));
    arrange(ctx);
    stackTop(ctx, 1, [SY(12)]);
    stackTop(ctx, 0, [G(17)]);
  }).state;
  const atCounter = answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, at(start, 1, 'FC')), type: 'FRONT' } }).state;
  return until(atCounter, (s) => s.pending?.kind === 'CONFIRM' && s.pending.prompt === 'PAY_COST');
}

describe('GUP/W141 ガールズ＆パンツァー', () => {
  it('converts the printed information, including the new trigger icons', () => {
    expect(getCard(G(1)).def).toMatchObject({ kind: 'CHARACTER', color: 'yellow', level: 0, cost: 0, power: 1000, soul: 1, traits: ['戦車道', '大学選抜チーム'] });
    expect(getCard(G(25)).def.triggers).toEqual(['CHOICE']);
    expect(getCard(G(54)).def.triggers).toEqual(['TREASURE']);
    expect(getCard(G(111)).def.triggers).toEqual(['SOUL', 'GATE']);
    expect(getCard(G(113)).def.triggers).toEqual(['DRAW']);
  });

  it('GUP/W141-001: +3000 in your turn with two other characters; from hand, may pay (1) and the top deck card to search for a level 1 or lower character', () => {
    const arrange = (others: number) => (ctx: Ctx): void => {
      take(ctx, 0, G(1), stageSlot(0, 'FC'));
      for (let i = 0; i < others; i++) take(ctx, 0, G(17), stageSlot(0, (['FL', 'FR'] as const)[i]!));
    };
    const two = gup({ step: 'MAIN_START' }, arrange(2)).state;
    expect(getPower(two, at(two, 0, 'FC'))).toBe(1000 + 3000 + 500 + 500); // and 017's +500 twice
    const one = gup({ step: 'MAIN_START' }, arrange(1)).state;
    expect(getPower(one, at(one, 0, 'FC'))).toBe(1500);

    const start = gup({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, G(1), { player: 0, zone: 'hand' });
      take(ctx, 0, G(44), { player: 0, zone: 'stock' });
    }).state;
    const atPay = answer(start, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(start, start.zones[0].hand[0]!), slot: 'FC' } }).state;
    expect(pending(atPay, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST', ability: 1 });
    const atSearch = answer(atPay, { kind: 'CONFIRM', accept: true }).state;
    expect(atSearch.zones[0].clock).toHaveLength(1);
    const search = pending(atSearch, 'SELECT_CARDS');
    expect(search.cards.length).toBeGreaterThan(0);
    expect(search.cards.every((o) => getCard(cardIdOfObject(atSearch, o)).def.kind === 'CHARACTER' && getCard(cardIdOfObject(atSearch, o)).def.level! <= 1)).toBe(true);
    const { state } = answer(atSearch, { kind: 'SELECT_CARDS', cards: [search.cards[0]!] });
    expect(state.zones[0].hand).toHaveLength(1);
  });

  it('GUP/W141-010: from hand, a 《戦車道》 character +3000; and may pay (1) and a hand card to return an opponent’s character to hand', () => {
    const start = gup({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, G(10), { player: 0, zone: 'hand' });
      take(ctx, 0, G(44), { player: 0, zone: 'hand' });
      take(ctx, 0, G(17), stageSlot(0, 'FL'));
      take(ctx, 0, G(44), { player: 0, zone: 'stock' });
      take(ctx, 1, SY(7), stageSlot(1, 'FC'));
    }).state;
    const t10 = cardIn(start, start.zones[0].hand, G(10));
    const atOrder = answer(start, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(start, t10), slot: 'FC' } }).state;
    const both = pending(atOrder, 'CHOOSE_ABILITY').abilities;
    expect(both.map((a) => a.ability).sort()).toEqual([0, 1]);
    const fl = at(atOrder, 0, 'FL');
    const atBoost = answer(atOrder, { kind: 'CHOOSE_ABILITY', id: both.find((a) => a.ability === 0)!.id }).state;
    const atPay = answer(atBoost, { kind: 'SELECT_CARDS', cards: [oid(atBoost, fl)] }).state;
    expect(getPower(atPay, fl)).toBe(1000 + 3000);
    const atDiscard = answer(atPay, { kind: 'CONFIRM', accept: true }).state;
    const atTarget = answer(atDiscard, { kind: 'SELECT_CARDS', cards: pending(atDiscard, 'SELECT_CARDS').cards }).state;
    const enemy = at(atTarget, 1, 'FC');
    const { state } = answer(atTarget, { kind: 'SELECT_CARDS', cards: [oid(atTarget, enemy)] });
    expect(state.zones[1].hand).toContain(enemy);
  });

  it('GUP/W141-017: other 《戦車道》 characters +500; (2) and rest it to put the top clock card into the waiting room', () => {
    const start = gup({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, G(17), stageSlot(0, 'BL'));
      take(ctx, 0, G(44), stageSlot(0, 'FL'));
      take(ctx, 0, G(38), { player: 0, zone: 'clock' });
      take(ctx, 0, G(38), { player: 0, zone: 'clock' });
      take(ctx, 0, G(84), { player: 0, zone: 'stock' });
      take(ctx, 0, G(84), { player: 0, zone: 'stock' });
    }).state;
    expect(getPower(start, at(start, 0, 'FL'))).toBe(2000 + 500 + 1500);
    const topClock = start.zones[0].clock[1]!;
    const { state } = answer(start, { kind: 'MAIN', action: { type: 'ACTIVATE', card: oid(start, at(start, 0, 'BL')), ability: 1 } });
    expect(state.zones[0].clock).toHaveLength(1);
    expect(state.zones[0].waitingRoom).toContain(topClock);
    expect(getInstance(state, at(state, 0, 'BL')).orientation).toBe('REST');
  });

  it('GUP/W141-025 and GUP/W141-027: +1000 and +1 soul; Choice returns a character with a soul icon to hand or stock', () => {
    for (const climax of [G(25), G(27)]) {
      const state = gup({ step: 'MAIN_START' }, (ctx) => {
        take(ctx, 0, G(17), stageSlot(0, 'FC'));
        take(ctx, 0, climax, { player: 0, zone: 'climax' });
      }).state;
      expect([getPower(state, at(state, 0, 'FC')), getSoul(state, at(state, 0, 'FC'))]).toEqual([2000, 2]);
    }
    const start = gup({ step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, G(17), stageSlot(0, 'FC'));
      take(ctx, 0, G(91), { player: 0, zone: 'waitingRoom' }); // soul trigger icon
      take(ctx, 0, G(38), { player: 0, zone: 'waitingRoom' }); // no trigger icon
      stackTop(ctx, 0, [G(25)]);
      safeTopForP1(ctx);
    }).state;
    const atChoice = answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, at(start, 0, 'FC')), type: 'DIRECT' } }).state;
    const choice = pending(atChoice, 'SELECT_CARDS');
    expect(choice.prompt).toBe('TRIGGER_CHOICE');
    expect(choice.cards.map((o) => cardIdOfObject(atChoice, o))).toEqual([G(91)]);
    const atWhere = answer(atChoice, { kind: 'SELECT_CARDS', cards: choice.cards }).state;
    expect(pending(atWhere, 'SELECT_OPTION').options).toEqual(['HAND', 'STOCK']);
    const { state } = answer(atWhere, { kind: 'SELECT_OPTION', option: 'STOCK' });
    // The chosen card and the trigger check card are both in the stock.
    expect(state.zones[0].stock).toHaveLength(2);
  });

  it('GUP/W141-038: from hand +1500; when it leaves the stage, may pay (1) and the top deck card to return a 《戦車道》 character', () => {
    const start = gup({ step: 'MAIN_START' }, (ctx) => take(ctx, 0, G(38), { player: 0, zone: 'hand' })).state;
    const { state: placed } = answer(start, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(start, start.zones[0].hand[0]!), slot: 'FC' } });
    expect(getPower(placed, at(placed, 0, 'FC'))).toBe(3500);

    const atPay = defeated((ctx) => {
      take(ctx, 0, G(38), stageSlot(0, 'FC'));
      take(ctx, 0, G(44), { player: 0, zone: 'stock' });
    });
    expect(atPay.pending).toMatchObject({ player: 0, prompt: 'PAY_COST', ability: 1 });
    const atChoose = answer(atPay, { kind: 'CONFIRM', accept: true }).state;
    // The card itself is in the waiting room now and may be chosen.
    const choose = pending(atChoose, 'SELECT_CARDS');
    expect(choose.cards.map((o) => cardIdOfObject(atChoose, o))).toContain(G(38));
    const itself = choose.cards.find((o) => cardIdOfObject(atChoose, o) === G(38))!;
    const { state } = answer(atChoose, { kind: 'SELECT_CARDS', cards: [itself] });
    // (The game then runs on into your next turn, so the hand may hold a drawn card too.)
    expect(ids(state, state.zones[0].hand)).toContain(G(38));
  });

  it('GUP/W141-039: +2000 in your turn with two other 《戦車道》; when its battle opponent is reversed, may pay (1) to look at up to four cards for a 《戦車道》 character', () => {
    const start = gup({ step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, G(39), stageSlot(0, 'FC'));
      take(ctx, 0, G(17), stageSlot(0, 'FL'));
      take(ctx, 0, G(17), stageSlot(0, 'FR'));
      take(ctx, 0, G(44), { player: 0, zone: 'stock' });
      take(ctx, 1, SY(1), stageSlot(1, 'FC'));
      stackTop(ctx, 0, [G(17), G(41), G(54), G(84)]);
      safeTopForP1(ctx);
    }).state;
    const me = at(start, 0, 'FC');
    expect(getPower(start, me)).toBe(4500 + 2000 + 1000);
    const atCounter = answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, me), type: 'FRONT' } }).state;
    const atPay = answer(atCounter, { kind: 'COUNTER', card: null }).state;
    expect(pending(atPay, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST', ability: 1 });
    // The trigger check took 017; look at 041, then 054, then stop.
    const atNext = answerAll(atPay, [
      { kind: 'CONFIRM', accept: true },
      { kind: 'CONFIRM', accept: true },
      { kind: 'CONFIRM', accept: true },
    ]).state;
    const atPick = answer(atNext, { kind: 'CONFIRM', accept: false }).state;
    const pick = pending(atPick, 'SELECT_CARDS');
    expect(pick.cards.map((o) => pick.look![o])).toEqual([G(41)]);
    const { state } = answer(atPick, { kind: 'SELECT_CARDS', cards: pick.cards });
    expect(ids(state, state.zones[0].hand)).toEqual([G(41)]);
    expect(ids(state, state.zones[0].waitingRoom)).toContain(G(54));
  });

  it('GUP/W141-041: +4000 while all your characters are 《戦車道》; with ミフネ作戦 its attack returns another 《戦車道》 character and one from the waiting room', () => {
    const start = gup({ step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, G(41), stageSlot(0, 'FC'));
      take(ctx, 0, G(17), stageSlot(0, 'BL'));
      take(ctx, 0, G(54), { player: 0, zone: 'climax' });
      take(ctx, 0, G(84), { player: 0, zone: 'waitingRoom' });
      plainTopForP0(ctx);
      safeTopForP1(ctx);
    }).state;
    const me = at(start, 0, 'FC');
    expect(getPower(start, me)).toBe(6000 + 4000 + 500 + 1000);
    const atReturn = answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, me), type: 'DIRECT' } }).state;
    const own = pending(atReturn, 'SELECT_CARDS');
    expect(own).toMatchObject({ min: 0, max: 1 });
    expect(own.cards.map((o) => cardIdOfObject(atReturn, o))).toEqual([G(17)]);
    const atSalvage = answer(atReturn, { kind: 'SELECT_CARDS', cards: own.cards }).state;
    const salvage = pending(atSalvage, 'SELECT_CARDS');
    const { state } = answer(atSalvage, { kind: 'SELECT_CARDS', cards: salvage.cards.filter((o) => cardIdOfObject(atSalvage, o) === G(84)) });
    expect(ids(state, state.zones[0].hand).sort()).toEqual([G(17), G(84)].sort());
  });

  it('GUP/W141-044: +1500 in your turn with another 《戦車道》; when its battle opponent is reversed and a climax is in your climax zone, may put the top deck card into the stock', () => {
    const run = (climax: boolean) =>
      gup({ step: 'ATTACK_START' }, (ctx) => {
        take(ctx, 0, G(44), stageSlot(0, 'FC'));
        take(ctx, 0, G(17), stageSlot(0, 'BL'));
        if (climax) take(ctx, 0, G(25), { player: 0, zone: 'climax' });
        take(ctx, 1, SY(1), stageSlot(1, 'FC'));
        plainTopForP0(ctx);
        safeTopForP1(ctx);
      }).state;
    const without = run(false);
    expect(getPower(without, at(without, 0, 'FC'))).toBe(2000 + 1500 + 500);
    const noAsk = answer(answer(without, { kind: 'ATTACK', attack: { attacker: oid(without, at(without, 0, 'FC')), type: 'FRONT' } }).state, { kind: 'COUNTER', card: null }).state;
    expect(noAsk.pending?.kind).not.toBe('CONFIRM');

    const start = run(true);
    const atAsk = answer(answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, at(start, 0, 'FC')), type: 'FRONT' } }).state, { kind: 'COUNTER', card: null }).state;
    expect(pending(atAsk, 'CONFIRM')).toMatchObject({ prompt: 'USE_ABILITY', ability: 1 });
    const stockBefore = atAsk.zones[0].stock.length;
    const { state } = answer(atAsk, { kind: 'CONFIRM', accept: true });
    expect(state.zones[0].stock).toHaveLength(stockBefore + 1);
  });

  it('GUP/W141-048: from hand, may discard to put a level 0 《戦車道》 character from the waiting room in any slot; when your climax is placed, up to two 《戦車道》 +1500', () => {
    const start = gup({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, G(48), { player: 0, zone: 'hand' });
      take(ctx, 0, G(41), { player: 0, zone: 'hand' });
      take(ctx, 0, G(38), { player: 0, zone: 'waitingRoom' }); // level 0
      take(ctx, 0, G(39), { player: 0, zone: 'waitingRoom' }); // level 1: not allowed
      take(ctx, 0, G(38), { player: 0, zone: 'level' });
    }).state;
    const t48 = cardIn(start, start.zones[0].hand, G(48));
    const atDiscard = answerAll(start, [
      { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(start, t48), slot: 'FC' } },
      { kind: 'CONFIRM', accept: true },
    ]).state;
    const atChoose = answer(atDiscard, { kind: 'SELECT_CARDS', cards: pending(atDiscard, 'SELECT_CARDS').cards }).state;
    const choose = pending(atChoose, 'SELECT_CARDS');
    expect(choose.cards.map((o) => cardIdOfObject(atChoose, o))).toEqual([G(38)]);
    const atSlot = answer(atChoose, { kind: 'SELECT_CARDS', cards: choose.cards }).state;
    const { state: placed } = answer(atSlot, { kind: 'SELECT_SLOT', slot: 'BR' });
    expect(ids(placed, placed.zones[0].stage.BR)).toEqual([G(38)]);

    const climax = gup({ step: 'CLIMAX_START' }, (ctx) => {
      take(ctx, 0, G(48), stageSlot(0, 'FC'));
      take(ctx, 0, G(17), stageSlot(0, 'FL'));
      take(ctx, 0, G(17), stageSlot(0, 'FR'));
      take(ctx, 0, G(113), { player: 0, zone: 'hand' });
      take(ctx, 0, G(84), { player: 0, zone: 'clock' });
    }).state;
    const atOrder = answer(climax, { kind: 'CLIMAX', card: oid(climax, climax.zones[0].hand[0]!) }).state;
    const own = pending(atOrder, 'CHOOSE_ABILITY').abilities.find((a) => a.cardId === G(48))!;
    const atTwo = answer(atOrder, { kind: 'CHOOSE_ABILITY', id: own.id }).state;
    const two = pending(atTwo, 'SELECT_CARDS');
    expect(two).toMatchObject({ min: 0, max: 2 });
    const fl = at(atTwo, 0, 'FL');
    const fr = at(atTwo, 0, 'FR');
    const { state } = answer(atTwo, { kind: 'SELECT_CARDS', cards: [oid(atTwo, fl), oid(atTwo, fr)] });
    expect([getPower(state, fl), getPower(state, fr)]).toEqual([1000 + 500 + 1500, 1000 + 500 + 1500]);
  });

  it('GUP/W141-052 and GUP/W141-054 Treasure, GUP/W141-111 Gate: the trigger icons of the real climaxes', () => {
    const reveal = (climax: string) =>
      gup({ step: 'ATTACK_START' }, (ctx) => {
        take(ctx, 0, G(17), stageSlot(0, 'FC'));
        take(ctx, 0, G(25), { player: 0, zone: 'waitingRoom' });
        stackTop(ctx, 0, [climax]);
        safeTopForP1(ctx);
      }).state;
    for (const treasure of [G(52), G(54)]) {
      const start = reveal(treasure);
      const atStock = answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, at(start, 0, 'FC')), type: 'DIRECT' } }).state;
      expect(pending(atStock, 'CONFIRM').prompt).toBe('TRIGGER_TREASURE_STOCK');
      const { state } = answer(atStock, { kind: 'CONFIRM', accept: false });
      expect(ids(state, state.zones[0].hand)).toEqual([treasure]);
    }
    const start = reveal(G(111));
    const atOrder = answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, at(start, 0, 'FC')), type: 'DIRECT' } }).state;
    const atGate = answer(atOrder, { kind: 'SELECT_OPTION', option: 'GATE' }).state;
    const gate = pending(atGate, 'SELECT_CARDS');
    expect(gate.prompt).toBe('TRIGGER_GATE');
    const { state } = answer(atGate, { kind: 'SELECT_CARDS', cards: gate.cards });
    expect(ids(state, state.zones[0].hand)).toEqual([G(25)]);
  });

  it('GUP/W141-084: from hand a 《戦車道》 +1500; when it leaves the stage, may discard to look at up to four cards for a 《戦車道》 character', () => {
    const start = gup({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, G(84), { player: 0, zone: 'hand' });
      take(ctx, 0, G(17), stageSlot(0, 'FL'));
    }).state;
    const fl = at(start, 0, 'FL');
    const atBoost = answer(start, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(start, start.zones[0].hand[0]!), slot: 'FC' } }).state;
    const { state: boosted } = answer(atBoost, { kind: 'SELECT_CARDS', cards: [oid(atBoost, fl)] });
    expect(getPower(boosted, fl)).toBe(2500);

    const atPay = defeated((ctx) => {
      take(ctx, 0, G(84), stageSlot(0, 'FC'));
      take(ctx, 0, G(44), { player: 0, zone: 'hand' });
      stackTop(ctx, 0, [G(54), G(41)]);
    });
    expect(atPay.pending).toMatchObject({ player: 0, prompt: 'PAY_COST', ability: 1 });
    const atLook = answerAll(atPay, [
      { kind: 'CONFIRM', accept: true },
      { kind: 'SELECT_CARDS', cards: pending(answer(atPay, { kind: 'CONFIRM', accept: true }).state, 'SELECT_CARDS').cards },
      { kind: 'CONFIRM', accept: true },
      { kind: 'CONFIRM', accept: true },
    ]).state;
    const atPick = answer(atLook, { kind: 'CONFIRM', accept: false }).state;
    const pick = pending(atPick, 'SELECT_CARDS');
    // Only the 《戦車道》 character can be chosen; the climax that was looked at cannot.
    expect(pick.cards.map((o) => pick.look![o])).toEqual([G(41)]);
    expect(Object.values(pick.look!)).toContain(G(113));
    const { state } = answer(atPick, { kind: 'SELECT_CARDS', cards: pick.cards });
    expect(ids(state, state.zones[0].hand)).toContain(G(41));
  });

  it('GUP/W141-088: when your climax with the Draw icon is placed, a character +1500 (not for other climaxes); 集中 counts Draw-icon climaxes', () => {
    const place = (climax: string, colour: string) =>
      gup({ step: 'CLIMAX_START' }, (ctx) => {
        take(ctx, 0, G(88), stageSlot(0, 'FC'));
        take(ctx, 0, climax, { player: 0, zone: 'hand' });
        take(ctx, 0, colour, { player: 0, zone: 'clock' });
      }).state;
    const other = place(G(25), G(17));
    const afterOther = answer(other, { kind: 'CLIMAX', card: oid(other, other.zones[0].hand[0]!) }).state;
    expect(afterOther.pending?.kind).not.toBe('SELECT_CARDS');

    const draw = place(G(113), G(84));
    const atOrder = answer(draw, { kind: 'CLIMAX', card: oid(draw, draw.zones[0].hand[0]!) }).state;
    const own = pending(atOrder, 'CHOOSE_ABILITY').abilities.find((a) => a.cardId === G(88))!;
    const atChoose = answer(atOrder, { kind: 'CHOOSE_ABILITY', id: own.id }).state;
    const me = at(atChoose, 0, 'FC');
    const { state } = answer(atChoose, { kind: 'SELECT_CARDS', cards: [oid(atChoose, me)] });
    expect(getPower(state, me)).toBe(3500);

    const brain = gup({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, G(88), stageSlot(0, 'FC'));
      take(ctx, 0, G(44), { player: 0, zone: 'stock' });
      take(ctx, 0, G(38), { player: 0, zone: 'waitingRoom' });
      stackTop(ctx, 0, [G(113), G(25), G(17), G(17)]);
    }).state;
    const card = at(brain, 0, 'FC');
    const atSalvage = answer(brain, { kind: 'MAIN', action: { type: 'ACTIVATE', card: oid(brain, card), ability: 1 } }).state;
    // One Draw-icon climax among the four (025 has Choice): one round.
    const salvage = pending(atSalvage, 'SELECT_CARDS');
    expect(salvage).toMatchObject({ min: 0, max: 1 });
    const atBoost = answer(atSalvage, { kind: 'SELECT_CARDS', cards: salvage.cards.filter((o) => cardIdOfObject(atSalvage, o) === G(38)) }).state;
    const { state: after } = answer(atBoost, { kind: 'SELECT_CARDS', cards: [oid(atBoost, card)] });
    expect(after.pending?.kind).toBe('MAIN');
    expect(ids(after, after.zones[0].hand)).toEqual([G(38)]);
    expect(getPower(after, card)).toBe(3000);
  });

  it('GUP/W141-091: from hand, may discard to return a 《戦車道》 character; its ability puts it into the waiting room to return an opponent’s character to hand', () => {
    const start = gup({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, G(91), { player: 0, zone: 'hand' });
      take(ctx, 0, G(44), { player: 0, zone: 'hand' });
      take(ctx, 0, G(39), { player: 0, zone: 'waitingRoom' });
      take(ctx, 0, G(84), { player: 0, zone: 'level' });
      take(ctx, 0, G(84), { player: 0, zone: 'level' });
      take(ctx, 0, G(84), { player: 0, zone: 'stock' });
      take(ctx, 1, SY(7), stageSlot(1, 'FC'));
    }).state;
    const t91 = cardIn(start, start.zones[0].hand, G(91));
    const atDiscard = answerAll(start, [
      { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(start, t91), slot: 'FC' } },
      { kind: 'CONFIRM', accept: true },
    ]).state;
    const atChoose = answer(atDiscard, { kind: 'SELECT_CARDS', cards: pending(atDiscard, 'SELECT_CARDS').cards }).state;
    const after = answer(atChoose, { kind: 'SELECT_CARDS', cards: pending(atChoose, 'SELECT_CARDS').cards.filter((o) => cardIdOfObject(atChoose, o) === G(39)) }).state;
    expect(ids(after, after.zones[0].hand)).toEqual([G(39)]);

    const atTarget = answer(after, { kind: 'MAIN', action: { type: 'ACTIVATE', card: oid(after, at(after, 0, 'FC')), ability: 1 } }).state;
    expect(ids(atTarget, atTarget.zones[0].waitingRoom)).toContain(G(91));
    const enemy = at(atTarget, 1, 'FC');
    const { state } = answer(atTarget, { kind: 'SELECT_CARDS', cards: [oid(atTarget, enemy)] });
    expect(state.zones[1].hand).toContain(enemy);
  });

  it('GUP/W141-099: 応援 +500 × level to the 《戦車道》 in front; +1500 when a Gate-icon climax is placed; its third ability needs 「BT-42のなんでも屋 アキ」 in hand', () => {
    const start = gup({ step: 'CLIMAX_START' }, (ctx) => {
      take(ctx, 0, G(99), stageSlot(0, 'BL'));
      take(ctx, 0, G(39), stageSlot(0, 'FL')); // level 1
      take(ctx, 0, G(38), stageSlot(0, 'FC')); // level 0
      take(ctx, 0, G(111), { player: 0, zone: 'hand' });
      take(ctx, 0, G(84), { player: 0, zone: 'clock' });
    }).state;
    // FL: 039 4500 + its own +2000 (two other 《戦車道》) + 応援 500 × level 1; FC: level 0, so 応援 adds 0.
    expect([getPower(start, at(start, 0, 'FL')), getPower(start, at(start, 0, 'FC'))]).toEqual([4500 + 2000 + 500, 2000]);
    const atChoose = answer(start, { kind: 'CLIMAX', card: oid(start, start.zones[0].hand[0]!) }).state;
    const fc = at(atChoose, 0, 'FC');
    const { state } = answer(atChoose, { kind: 'SELECT_CARDS', cards: [oid(atChoose, fc)] });
    expect(getPower(state, fc)).toBe(2000 + 1500 + 1000);

    const main = gup({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, G(99), stageSlot(0, 'BL'));
      take(ctx, 0, G(44), { player: 0, zone: 'hand' });
      take(ctx, 0, G(38), { player: 0, zone: 'waitingRoom' });
    }).state;
    const actions = pending(main, 'MAIN').actions;
    expect(actions.some((a) => a.type === 'ACTIVATE')).toBe(false);
  });

  it('GUP/W141-104: from hand, may put a hand card into the stock; when it leaves the stage, may pay (2) to return a 《戦車道》 character', () => {
    const start = gup({ step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, G(104), { player: 0, zone: 'hand' });
      take(ctx, 0, G(44), { player: 0, zone: 'hand' });
    }).state;
    const t104 = cardIn(start, start.zones[0].hand, G(104));
    const atUse = answer(start, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(start, t104), slot: 'FC' } }).state;
    expect(pending(atUse, 'CONFIRM')).toMatchObject({ prompt: 'USE_ABILITY', ability: 0 });
    const atChoose = answer(atUse, { kind: 'CONFIRM', accept: true }).state;
    const { state: stocked } = answer(atChoose, { kind: 'SELECT_CARDS', cards: pending(atChoose, 'SELECT_CARDS').cards });
    expect(stocked.zones[0].stock).toHaveLength(1);
    expect(stocked.zones[0].hand).toHaveLength(0);

    const atPay = defeated((ctx) => {
      take(ctx, 0, G(104), stageSlot(0, 'FC'));
      take(ctx, 0, G(44), { player: 0, zone: 'stock' });
      take(ctx, 0, G(44), { player: 0, zone: 'stock' });
    });
    expect(atPay.pending).toMatchObject({ player: 0, prompt: 'PAY_COST', ability: 1 });
    const atBack = answer(atPay, { kind: 'CONFIRM', accept: true }).state;
    const itself = pending(atBack, 'SELECT_CARDS').cards.find((o) => cardIdOfObject(atBack, o) === G(104))!;
    expect(atBack.zones[0].stock).toHaveLength(0); // (2) paid
    const { state } = answer(atBack, { kind: 'SELECT_CARDS', cards: [itself] });
    expect(ids(state, state.zones[0].hand)).toContain(G(104));
  });

  it('GUP/W141-113: placed from hand, may draw a card and up to two characters get +1 soul', () => {
    const start = gup({ step: 'CLIMAX_START' }, (ctx) => {
      take(ctx, 0, G(113), { player: 0, zone: 'hand' });
      take(ctx, 0, G(84), { player: 0, zone: 'clock' });
      take(ctx, 0, G(17), stageSlot(0, 'FL'));
      take(ctx, 0, G(44), stageSlot(0, 'FC'));
    }).state;
    const atDraw = answer(start, { kind: 'CLIMAX', card: oid(start, start.zones[0].hand[0]!) }).state;
    expect(pending(atDraw, 'CONFIRM').prompt).toBe('USE_ABILITY');
    const atChoose = answer(atDraw, { kind: 'CONFIRM', accept: false }).state;
    expect(atChoose.zones[0].hand).toHaveLength(0);
    const fl = at(atChoose, 0, 'FL');
    const fc = at(atChoose, 0, 'FC');
    expect(pending(atChoose, 'SELECT_CARDS')).toMatchObject({ min: 0, max: 2 });
    const { state } = answer(atChoose, { kind: 'SELECT_CARDS', cards: [oid(atChoose, fl), oid(atChoose, fc)] });
    expect([getSoul(state, fl), getSoul(state, fc)]).toEqual([2, 2]);
  });
});
