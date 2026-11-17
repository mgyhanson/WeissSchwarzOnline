/**
 * Building blocks of batch 7: X from a shown card with "Ｘが…なら" follow-ups, "N回行ったら" after trigger checks
 * (CR-7.3.1.2.3), a cost with two choices ([AかB]), and icons whose effect may also choose a named card
 * (CR-4.14.2.9, CR-4.14.2.11). Synthetic cards; the wording each case stands for is in its name.
 */

import { describe, expect, it } from 'vitest';
import { type Ability, type Cost, type Ctx, type Effect, type GameEvent, type GameState, canPayCost, getPlayerView, stageSlot } from '../src/index';
import { activate, attack, canActivate, cards, noClimaxes, played } from './ability-helpers';
import { EVENT, answer, card, oid, pending, put, scenario } from './helpers';

const act = (effect: Effect[], cost: Cost[] = []): Ability => ({ type: 'ACT', timing: 'MAIN', cost, effect });
const dealt = (events: GameEvent[]) => events.flatMap((e) => (e.type === 'DAMAGE_DEALT' ? [(e as unknown as { amount: number }).amount] : []));

describe('A: Ｘは公開されたカードのレベル; Ｘが…なら、山札の上から1枚までを、ストック置場に置く', () => {
  // 山札の上から1枚を公開し、…。Ｘが3以上なら、山札の上から1枚までを、ストック置場に置く。（CXのレベルは0として扱う。ストック置場に置かないなら元に戻す）
  const shown = (atLeast: number): Ability =>
    act([{ do: 'SHOW_TOP' }, { do: 'IF', condition: { if: 'X', min: atLeast }, then: [{ do: 'DECK_TOP', count: 1, to: 'STOCK', upTo: true }] }]);
  const setup = (topLevel: number | null, ability: Ability) =>
    scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [ability] }, '0:49': topLevel === null ? { kind: 'CLIMAX', level: null, cost: null, power: null, soul: null } : { kind: 'CHARACTER', level: topLevel } }) }, (ctx) =>
      put(ctx, card(0, 0), stageSlot(0, 'FC')),
    ).state;

  it('X 3 or more: the shown card may go to the stock; declined, it stays on top, no longer shown', () => {
    let state = activate(setup(3, shown(3)), card(0, 0)).state;
    expect(pending(state, 'CONFIRM').prompt).toBe('DECK_TOP_NEXT');
    const declined = answer(state, { kind: 'CONFIRM', accept: false }).state;
    expect(declined.zones[0].deck[declined.zones[0].deck.length - 1]).toBe(card(0, 49));
    expect(declined.instances[card(0, 49)]!.revealed).toBe(false);
    state = answer(state, { kind: 'CONFIRM', accept: true }).state;
    expect(state.zones[0].stock).toEqual([card(0, 49)]);
  });

  it('T-CARD-011 / CR-2.19.1: X below 3: nothing more; a shown climax counts as level 0', () => {
    expect(activate(setup(2, shown(3)), card(0, 0)).state.pending?.kind).toBe('MAIN');
    // X 0 or less (with a climax shown): the follow-up applies.
    const zero = act([{ do: 'SHOW_TOP' }, { do: 'IF', condition: { if: 'X', max: 0 }, then: [{ do: 'DECK_TOP', count: 1, to: 'STOCK', upTo: true }] }]);
    expect(pending(activate(setup(null, zero), card(0, 0)).state, 'CONFIRM').prompt).toBe('DECK_TOP_NEXT');
    expect(activate(setup(1, zero), card(0, 0)).state.pending?.kind).toBe('MAIN');
  });

  it('このカードの下にマーカーがあり、Ｘが0以下なら: both are needed', () => {
    const both = act([{ do: 'SHOW_TOP' }, { do: 'IF', condition: { if: 'ALL', of: [{ if: 'MARKERS', of: 'SELF', min: 1 }, { if: 'X', max: 0 }] }, then: [{ do: 'DECK_TOP', count: 1, to: 'STOCK', upTo: true }] }]);
    expect(activate(setup(0, both), card(0, 0)).state.pending?.kind).toBe('MAIN');
    const withMarker = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [both] }, '0:49': { level: 0 } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 5), { player: 0, zone: 'marker', slot: 'FC' });
    }).state;
    expect(pending(activate(withMarker, card(0, 0)).state, 'CONFIRM').prompt).toBe('DECK_TOP_NEXT');
  });
});

describe('B: そのアタック中、トリガーチェックを2回行う。2回行ったら、自分のストックの上から1枚を、控え室に置く', () => {
  const twice: Effect = { do: 'TRIGGER_CHECKS', count: 2, then: [{ do: 'STOCK_TOP_TO_WAITING_ROOM', count: 1 }] };
  const onAttack = (...effect: Effect[]): Ability => ({ type: 'AUTO', trigger: { on: 'ATTACKS' }, effect });
  /** Card 0 (with the abilities) and card 1 (plain) in the front row; one card in the stock. */
  const field = (abilities: Ability[], more?: (ctx: Ctx) => void) =>
    scenario({ step: 'ATTACK_START', defs: cards({ '0:0': { abilities } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), stageSlot(0, 'FL'));
      put(ctx, card(0, 20), { player: 0, zone: 'stock' });
      noClimaxes(ctx, 0);
      noClimaxes(ctx, 1);
      more?.(ctx);
    }).state;
  /** Declares the attack and plays the waiting abilities in the order offered. */
  const go = (start: GameState, attacker: number, type: 'DIRECT' | 'FRONT' = 'DIRECT') => {
    let { state, events } = attack(start, card(0, attacker), type);
    while (state.pending?.kind === 'CHOOSE_ABILITY') {
      const next = answer(state, { kind: 'CHOOSE_ABILITY', id: state.pending.abilities[0]!.id });
      state = next.state;
      events = [...events, ...next.events];
    }
    return { state, events };
  };
  const checks = (events: GameEvent[]) => events.filter((e) => e.type === 'TRIGGER_CHECK').length;
  /** Moves into the stock and from the stock to the waiting room, in order. */
  const order = (events: GameEvent[]) =>
    events.flatMap((e) => (e.type === 'CARD_MOVED' && (e.to.zone === 'stock' || (e.from.zone === 'stock' && e.to.zone === 'waitingRoom')) ? [`${e.instanceId}>${e.to.zone}`] : []));

  it('T-ATK-023 / CR-7.3.1.2.3: after the second check is complete, the top stock card goes to the waiting room, once', () => {
    const { state, events } = go(field([onAttack(twice)]), 0);
    expect(checks(events)).toBe(2);
    // The checked cards were 41 then 40; 40 was put on top of the stock and is the one discarded.
    expect(state.zones[0].stock).toEqual([card(0, 20), card(0, 41)]);
    expect(state.zones[0].waitingRoom).toEqual([card(0, 40)]);
    // Not at the first check: the move to the waiting room comes after the second checked card went to the stock.
    expect(order(events)).toEqual([`${card(0, 41)}>stock`, `${card(0, 40)}>stock`, `${card(0, 40)}>waitingRoom`]);
    // Before the damage: the follow-up is part of the trigger step.
    const types = events.map((e) => (e.type === 'CARD_MOVED' && e.to.zone === 'waitingRoom' ? 'FOLLOW_UP' : e.type));
    expect(types.indexOf('FOLLOW_UP')).toBeLessThan(types.indexOf('DAMAGE_DEALT'));
  });

  it('without the ability: one check, nothing leaves the stock', () => {
    const { state, events } = go(field([]), 0);
    expect(checks(events)).toBe(1);
    expect(state.zones[0].stock).toEqual([card(0, 20), card(0, 41)]);
    expect(state.zones[0].waitingRoom).toEqual([]);
  });

  it('two such abilities in one attack: two checks, and each follow-up goes on once', () => {
    const { state, events } = go(field([onAttack(twice), onAttack(twice)]), 0);
    expect(checks(events)).toBe(2);
    expect(state.zones[0].waitingRoom).toEqual([card(0, 40), card(0, 41)]);
    expect(state.zones[0].stock).toEqual([card(0, 20)]);
  });

  it('not done when fewer checks were completed than it waits for', () => {
    // The first effect waits for 3 checks; the next one sets the attack to 2 checks (トリガーチェックを2回行う).
    const three: Effect = { do: 'TRIGGER_CHECKS', count: 3, then: [{ do: 'STOCK_TOP_TO_WAITING_ROOM', count: 1 }] };
    const { state, events } = go(field([onAttack(three, { do: 'TRIGGER_CHECKS', count: 2 })]), 0);
    expect(checks(events)).toBe(2);
    expect(state.zones[0].waitingRoom).toEqual([]);
    expect(state.zones[0].stock).toHaveLength(3);
  });

  it('more checks than it waits for: the follow-up goes on after exactly its count, once', () => {
    // Waits for 2; the attack then makes 3 checks.
    const { state, events } = go(field([onAttack(twice, { do: 'TRIGGER_CHECKS', count: 3 })]), 0);
    expect(checks(events)).toBe(3);
    expect(order(events)).toEqual([`${card(0, 41)}>stock`, `${card(0, 40)}>stock`, `${card(0, 40)}>waitingRoom`, `${card(0, 39)}>stock`]);
    expect(state.zones[0].waitingRoom).toEqual([card(0, 40)]);
  });

  it('each attack counts for itself: nothing is left over and nothing is carried to the next attack', () => {
    // The plain card attacks first (one check), then the card with the ability.
    const first = go(field([onAttack(twice)]), 1);
    expect(checks(first.events)).toBe(1);
    expect(first.state.zones[0].waitingRoom).toEqual([]);
    expect(first.state.attack).toBeNull();
    const second = go(first.state, 0);
    // Two checks of its own: the one check of the earlier attack is not counted.
    expect(checks(second.events)).toBe(2);
    expect(order(second.events)).toEqual([`${card(0, 40)}>stock`, `${card(0, 39)}>stock`, `${card(0, 39)}>waitingRoom`]);
    expect(second.state.attack).toBeNull();

    // The other way round: the ability's attack first, then a plain attack with one check and no follow-up.
    const a = go(field([onAttack(twice)]), 0);
    expect(a.state.attack).toBeNull();
    const b = go(a.state, 1);
    expect(checks(b.events)).toBe(1);
    expect(b.state.zones[0].waitingRoom).toEqual(a.state.zones[0].waitingRoom);
  });

  it('with a cancelled damage and with a front attack: the same', () => {
    // The opponent's top card is a climax: the damage is cancelled (CR-4.10); the checks and the follow-up are as usual.
    const cancelled = scenario({ step: 'ATTACK_START', defs: cards({ '0:0': { abilities: [onAttack(twice)] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 20), { player: 0, zone: 'stock' });
      noClimaxes(ctx, 0);
    }).state;
    const one = go(cancelled, 0);
    expect(one.events.some((e) => e.type === 'CARD_MOVED' && e.reason === 'DAMAGE_CANCEL')).toBe(true);
    expect(one.state.zones[1].clock).toEqual([]);
    expect(checks(one.events)).toBe(2);
    expect(one.state.zones[0].waitingRoom).toEqual([card(0, 40)]);

    const front = field([onAttack(twice)], (ctx) => put(ctx, card(1, 0), stageSlot(1, 'FC')));
    const two = go(front, 0, 'FRONT');
    expect(checks(two.events)).toBe(2);
    expect(two.state.zones[0].waitingRoom).toContain(card(0, 40));
    expect(two.state.zones[0].waitingRoom.filter((id) => id === card(0, 40) || id === card(0, 41))).toEqual([card(0, 40)]);
  });

  it('T-ATK-016 / CR-7.5.1.2.2: the attacker left the stage before the trigger step: no damage; the checks and the follow-up still happen, nothing is left', () => {
    // そのアタック中 is already in effect; it does not depend on the card staying (the effect was resolved).
    const leave: Effect = { do: 'MOVE', target: { who: 'SELF' }, to: 'WAITING_ROOM' };
    const { state, events } = go(field([onAttack(twice, leave)]), 0);
    expect(checks(events)).toBe(2);
    expect(state.zones[0].waitingRoom).toEqual([card(0, 0), card(0, 40)]);
    expect(dealt(events)).toEqual([]);
    expect(state.attack).toBeNull();
  });

  it('the waiting follow-up is engine bookkeeping: neither player’s view carries it', () => {
    // A front attack stops at the opponent’s counter step, after the checks, with the attack still in progress.
    const { state } = go(field([onAttack(twice)], (ctx) => put(ctx, card(1, 0), stageSlot(1, 'FC'))), 0, 'FRONT');
    expect(state.pending?.kind).toBe('COUNTER');
    expect(state.attack?.afterChecks).toHaveLength(1);
    for (const viewer of [0, 1] as const) {
      const view = getPlayerView(state, viewer);
      expect(view.attack).toMatchObject({ player: 0, type: 'FRONT', checksDone: 2 });
      expect(view.attack).not.toHaveProperty('afterChecks');
      expect(JSON.stringify(view)).not.toContain('STOCK_TOP_TO_WAITING_ROOM');
    }
  });

  it('as a given ability (そのターン中、次の能力を与える): the character given it, in its own attack', () => {
    const give = act([{ do: 'CHOOSE', from: 'YOUR_STAGE', min: 1, max: 1 }, { do: 'GRANT', target: { who: 'CHOSEN' }, ability: onAttack(twice) as never }]);
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [give] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), stageSlot(0, 'FL'));
      noClimaxes(ctx, 0);
      noClimaxes(ctx, 1);
    }).state;
    let state = activate(start, card(0, 0)).state;
    state = answer(state, { kind: 'SELECT_CARDS', cards: [oid(state, card(0, 1))] }).state;
    state = answer(state, { kind: 'MAIN', action: { type: 'PASS' } }).state;
    state = answer(state, { kind: 'CLIMAX', card: null }).state;
    // The card that gave the ability attacks: one check.
    const giver = go(state, 0);
    expect(checks(giver.events)).toBe(1);
    const given = go(giver.state, 1);
    expect(checks(given.events)).toBe(2);
    expect(played(given.events, card(0, 1))).toBe(1);
  });
});

describe('C: ［(2)か手札の「…」を1枚控え室に置く］', () => {
  const either: Cost = { pay: 'EITHER', options: [[{ pay: 'STOCK', count: 2 }], [{ pay: 'DISCARD', count: 1, filter: { name: 'Same' } }]] };
  const ability = act([{ do: 'DRAW', count: 1 }], [either]);
  const setup = (stock: number, named: boolean) =>
    scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [ability] }, '0:5': { name: 'Same' } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      for (let k = 0; k < stock; k++) put(ctx, card(0, 20 + k), { player: 0, zone: 'stock' });
      if (named) put(ctx, card(0, 5), { player: 0, zone: 'hand' });
      put(ctx, card(0, 6), { player: 0, zone: 'hand' });
    }).state;
  const context = (state: ReturnType<typeof setup>) => ({ master: 0 as const, source: card(0, 0), sourceObjectId: oid(state, card(0, 0)), chosen: [], battleOpponent: null, sourceSlot: null });

  it('T-COST-005 / CR-8.4.2.2.1: neither can be paid: not payable; one alone is taken without a question', () => {
    const s = setup(1, false);
    expect(canPayCost(s, context(s), [either])).toBe(false);
    expect(pending(s, 'MAIN').actions.some((a) => a.type === 'ACTIVATE')).toBe(false);
  });

  it('only the stock: paid with it, nothing asked, the other untouched', () => {
    const { state } = activate(setup(2, false), card(0, 0));
    expect(state.zones[0].stock).toEqual([]);
    expect(state.zones[0].hand).toContain(card(0, 6));
  });

  it('only the named card: paid by discarding it, the stock untouched', () => {
    let state = activate(setup(1, true), card(0, 0)).state;
    // No choice of cost is asked; only the named card can be discarded.
    expect(pending(state, 'SELECT_CARDS')).toMatchObject({ prompt: 'COST_DISCARD', cards: [oid(state, card(0, 5))], min: 1, max: 1 });
    state = answer(state, { kind: 'SELECT_CARDS', cards: [oid(state, card(0, 5))] }).state;
    expect(state.zones[0].waitingRoom).toEqual([card(0, 5)]);
    expect(state.zones[0].stock).toEqual([card(0, 20)]);
    expect(state.zones[0].hand).toContain(card(0, 6));
  });

  it('both: the player chooses one and only that one is paid', () => {
    const asked = activate(setup(2, true), card(0, 0)).state;
    expect(pending(asked, 'SELECT_OPTION')).toMatchObject({ prompt: 'COST_CHOICE', options: ['COST_1', 'COST_2'] });
    const byStock = answer(asked, { kind: 'SELECT_OPTION', option: 'COST_1' }).state;
    expect(byStock.zones[0].stock).toEqual([]);
    expect(byStock.zones[0].hand).toContain(card(0, 5));
    expect(byStock.zones[0].waitingRoom).toEqual([card(0, 21), card(0, 20)]);
    expect(byStock.pending?.kind).toBe('MAIN');
    let byCard = answer(asked, { kind: 'SELECT_OPTION', option: 'COST_2' }).state;
    byCard = answer(byCard, { kind: 'SELECT_CARDS', cards: [oid(byCard, card(0, 5))] }).state;
    expect(byCard.zones[0].stock).toHaveLength(2);
    expect(byCard.zones[0].waitingRoom).toEqual([card(0, 5)]);
    expect(byCard.pending?.kind).toBe('MAIN');
    // An answer that is not one of the offered costs is refused.
    expect(() => answer(asked, { kind: 'SELECT_OPTION', option: 'COST_3' })).toThrow();
  });
});

describe('C: an either-cost with other costs, and as the cost of an automatic ability', () => {
  const either: Cost = { pay: 'EITHER', options: [[{ pay: 'STOCK', count: 2 }], [{ pay: 'DISCARD', count: 1, filter: { name: 'Same' } }]] };
  const field = (abilities: Ability[], stock: number, named: boolean, step: 'MAIN_START' | 'ATTACK_START' = 'MAIN_START') =>
    scenario({ step, defs: cards({ '0:0': { abilities }, '0:5': { name: 'Same' } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      for (let k = 0; k < stock; k++) put(ctx, card(0, 20 + k), { player: 0, zone: 'stock' });
      if (named) put(ctx, card(0, 5), { player: 0, zone: 'hand' });
      noClimaxes(ctx, 0);
      noClimaxes(ctx, 1);
    }).state;

  it('［(1) (2)か…］: the stock must cover what is paid besides; a choice it cannot cover is not offered', () => {
    const ability = act([{ do: 'DRAW', count: 1 }], [{ pay: 'STOCK', count: 1 }, either]);
    // Stock 2: 1 + 2 cannot be paid, so only the discard is left: no question, 1 stock and the card.
    let state = activate(field([ability], 2, true), card(0, 0)).state;
    expect(pending(state, 'SELECT_CARDS').prompt).toBe('COST_DISCARD');
    state = answer(state, { kind: 'SELECT_CARDS', cards: [oid(state, card(0, 5))] }).state;
    expect(state.zones[0].stock).toHaveLength(1);
    expect(state.zones[0].waitingRoom).toHaveLength(2);
    // Stock 2 without the named card: not payable at all.
    expect(canActivate(field([ability], 2, false))).toBe(false);
    // Stock 3: both can be paid, the player chooses; by the stock, 3 in all and the hand is untouched.
    state = activate(field([ability], 3, true), card(0, 0)).state;
    expect(pending(state, 'SELECT_OPTION').options).toEqual(['COST_1', 'COST_2']);
    state = answer(state, { kind: 'SELECT_OPTION', option: 'COST_1' }).state;
    expect(state.zones[0].stock).toEqual([]);
    expect(state.zones[0].hand).toContain(card(0, 5));
  });

  it('あなたはコストを払ってよい: not asked when neither can be paid; declined, nothing is paid', () => {
    const auto: Ability = { type: 'AUTO', trigger: { on: 'ATTACKS' }, cost: [either], effect: [{ do: 'DRAW', count: 1 }] };
    // Neither: the ability is played, nothing is asked, nothing is done.
    const none = attack(field([auto], 1, false, 'ATTACK_START'), card(0, 0), 'DIRECT');
    expect(none.events.some((e) => e.type === 'CARD_MOVED' && e.reason === 'COST')).toBe(false);
    expect(none.state.pending?.kind).not.toBe('CONFIRM');
    expect(none.state.zones[0].stock.slice(0, 1)).toEqual([card(0, 20)]);
    // Both: first whether to pay, then which.
    let state = attack(field([auto], 2, true, 'ATTACK_START'), card(0, 0), 'DIRECT').state;
    expect(pending(state, 'CONFIRM').prompt).toBe('PAY_COST');
    const declined = answer(state, { kind: 'CONFIRM', accept: false });
    expect(declined.events.some((e) => e.type === 'CARD_MOVED' && e.reason === 'COST')).toBe(false);
    expect(declined.state.zones[0].hand).toContain(card(0, 5));
    state = answer(state, { kind: 'CONFIRM', accept: true }).state;
    expect(pending(state, 'SELECT_OPTION').prompt).toBe('COST_CHOICE');
    const paid = answer(state, { kind: 'SELECT_OPTION', option: 'COST_1' });
    // Exactly the two stock cards were paid, once.
    expect(paid.events.filter((e) => e.type === 'CARD_MOVED' && e.reason === 'COST')).toHaveLength(2);
    expect(paid.state.zones[0].hand).toContain(card(0, 5));
  });
});

describe('D: あなたは[[choice]]か[[gate]]の効果で自分の控え室の「…」を選んでよい', () => {
  type Icon = 'CHOICE' | 'GATE' | 'DRAW' | 'SOUL' | 'TREASURE' | 'COMEBACK' | 'STANDBY' | 'POOL';
  const also = (icons: ('CHOICE' | 'GATE')[] = ['CHOICE', 'GATE']): Ability => ({ type: 'CONT', apply: [], triggerAlsoChooses: { icons, filter: { name: 'Named' } } });
  const NAMED = card(0, 7);
  const SOUL_CHARACTER = card(0, 8);
  const PLAIN_CHARACTER = card(0, 9);
  const CLIMAX = card(0, 42);
  interface Setup {
    icon: Icon;
    /** Who has the ability on the stage; null: nobody. */
    ability?: 0 | 1 | null;
    icons?: ('CHOICE' | 'GATE')[];
    /** The cards of player 0's waiting room. */
    waitingRoom?: number[];
    /** The named card is an event (so no icon chooses it by itself). */
    namedIsEvent?: boolean;
    more?: (ctx: Ctx) => void;
  }
  const check = ({ icon, ability = 0, icons, waitingRoom = [NAMED], namedIsEvent, more }: Setup) => {
    const holder = ability === null ? {} : { [`${ability}:0`]: { abilities: [also(icons)] } };
    const defs = cards({ ...holder, '0:41': { triggers: [icon] }, '0:7': { name: 'Named', ...(namedIsEvent ? EVENT : {}) }, '1:7': { name: 'Named' }, '0:8': { triggers: ['SOUL'] } });
    const start = scenario({ step: 'ATTACK_START', defs }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(1, 0), stageSlot(1, 'BL'));
      noClimaxes(ctx, 0);
      noClimaxes(ctx, 1);
      for (const id of waitingRoom) put(ctx, id, { player: 0, zone: 'waitingRoom' });
      more?.(ctx);
    }).state;
    return attack(start, card(0, 0), 'DIRECT').state;
  };
  const offered = (state: GameState): number[] | null => (state.pending?.kind === 'SELECT_CARDS' ? state.pending.cards.map((objectId) => state.instances.find((inst) => inst.objectId === objectId)!.instanceId) : null);

  it('T-TRG-015 / CR-4.14.2.11: Choice may choose the named card as well as a character with a soul icon', () => {
    let state = check({ icon: 'CHOICE', waitingRoom: [NAMED, SOUL_CHARACTER, PLAIN_CHARACTER] });
    expect(pending(state, 'SELECT_CARDS')).toMatchObject({ player: 0, prompt: 'TRIGGER_CHOICE', min: 0, max: 1 });
    expect(offered(state)).toEqual([NAMED, SOUL_CHARACTER]);
    // Declined: nothing moves.
    expect(answer(state, { kind: 'SELECT_CARDS', cards: [] }).state.zones[0].waitingRoom).toEqual([NAMED, SOUL_CHARACTER, PLAIN_CHARACTER]);
    // A card that is not offered is refused.
    expect(() => answer(state, { kind: 'SELECT_CARDS', cards: [oid(state, PLAIN_CHARACTER)] })).toThrow();
    // Chosen: to the hand or the stock, as the icon says.
    state = answer(state, { kind: 'SELECT_CARDS', cards: [oid(state, NAMED)] }).state;
    expect(pending(state, 'SELECT_OPTION').options).toEqual(['HAND', 'STOCK']);
    const toHand = answer(state, { kind: 'SELECT_OPTION', option: 'HAND' }).state;
    expect(toHand.zones[0].hand).toContain(NAMED);
    const toStock = answer(state, { kind: 'SELECT_OPTION', option: 'STOCK' }).state;
    expect(toStock.zones[0].stock).toContain(NAMED);
  });

  it('T-TRG-016 / CR-4.14.2.9: Gate may choose the named card as well as a climax', () => {
    let state = check({ icon: 'GATE', waitingRoom: [NAMED, CLIMAX, PLAIN_CHARACTER] });
    expect(pending(state, 'SELECT_CARDS')).toMatchObject({ player: 0, prompt: 'TRIGGER_GATE', min: 0, max: 1 });
    expect(offered(state)).toEqual([NAMED, CLIMAX]);
    expect(() => answer(state, { kind: 'SELECT_CARDS', cards: [oid(state, PLAIN_CHARACTER)] })).toThrow();
    state = answer(state, { kind: 'SELECT_CARDS', cards: [oid(state, NAMED)] }).state;
    expect(state.zones[0].hand).toContain(NAMED);
    expect(state.zones[0].waitingRoom).toEqual([CLIMAX, PLAIN_CHARACTER]);
  });

  it('without the ability: only what the icon itself allows', () => {
    expect(offered(check({ icon: 'CHOICE', ability: null, waitingRoom: [NAMED, SOUL_CHARACTER] }))).toEqual([SOUL_CHARACTER]);
    expect(offered(check({ icon: 'GATE', ability: null, waitingRoom: [NAMED, CLIMAX] }))).toEqual([CLIMAX]);
    // Nothing the icon allows: no question at all.
    expect(offered(check({ icon: 'CHOICE', ability: null }))).toBeNull();
    expect(offered(check({ icon: 'GATE', ability: null }))).toBeNull();
  });

  it('the named card is not in your waiting room: nothing is added, and nothing is asked when there is nothing else', () => {
    expect(offered(check({ icon: 'CHOICE', waitingRoom: [] }))).toBeNull();
    expect(offered(check({ icon: 'GATE', waitingRoom: [] }))).toBeNull();
    expect(offered(check({ icon: 'GATE', waitingRoom: [CLIMAX, PLAIN_CHARACTER] }))).toEqual([CLIMAX]);
    // In the hand, the deck, the memory or the opponent's waiting room it is not chosen either (自分の控え室).
    for (const zone of ['hand', 'memory', 'clock'] as const) {
      expect(offered(check({ icon: 'GATE', waitingRoom: [], more: (ctx) => put(ctx, NAMED, { player: 0, zone }) }))).toBeNull();
    }
    expect(offered(check({ icon: 'CHOICE', waitingRoom: [], more: (ctx) => put(ctx, card(1, 7), { player: 1, zone: 'waitingRoom' }) }))).toBeNull();
  });

  it('only the icons the ability names; other icons choose as usual', () => {
    // 「[[choice]]の効果で」 alone does not reach Gate, and the other way round.
    expect(offered(check({ icon: 'GATE', icons: ['CHOICE'] }))).toBeNull();
    expect(offered(check({ icon: 'CHOICE', icons: ['GATE'] }))).toBeNull();
    expect(offered(check({ icon: 'CHOICE', icons: ['CHOICE'] }))).toEqual([NAMED]);
    // Icons that choose nothing from the waiting room.
    for (const icon of ['DRAW', 'SOUL', 'TREASURE', 'POOL'] as const) expect(offered(check({ icon })) ?? []).not.toContain(NAMED);
    // Comeback and Standby choose characters: a named event is not added to them.
    for (const icon of ['COMEBACK', 'STANDBY'] as const) {
      expect(offered(check({ icon, namedIsEvent: true, waitingRoom: [NAMED, PLAIN_CHARACTER] }))).toEqual([PLAIN_CHARACTER]);
    }
    // …while Choice and Gate do take the named event.
    expect(offered(check({ icon: 'GATE', namedIsEvent: true }))).toEqual([NAMED]);
    expect(offered(check({ icon: 'CHOICE', namedIsEvent: true }))).toEqual([NAMED]);
  });

  it('あなたは: the opponent’s ability does nothing for your icons, and the ability must be in force', () => {
    expect(offered(check({ icon: 'CHOICE', ability: 1 }))).toBeNull();
    expect(offered(check({ icon: 'GATE', ability: 1 }))).toBeNull();
    // The card with the ability is in the waiting room, not on the stage: not in force.
    const offStage = scenario({ step: 'ATTACK_START', defs: cards({ '0:1': { abilities: [also()] }, '0:41': { triggers: ['GATE'] }, '0:7': { name: 'Named' } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), { player: 0, zone: 'waitingRoom' });
      put(ctx, NAMED, { player: 0, zone: 'waitingRoom' });
      noClimaxes(ctx, 0);
      noClimaxes(ctx, 1);
    }).state;
    expect(offered(attack(offStage, card(0, 0), 'DIRECT').state)).toBeNull();
  });

  it('only public cards are offered, to the player whose icon it is', () => {
    const state = check({ icon: 'CHOICE', waitingRoom: [NAMED, SOUL_CHARACTER], more: (ctx) => put(ctx, card(0, 10), { player: 0, zone: 'hand' }) });
    const decision = pending(state, 'SELECT_CARDS');
    expect(decision.player).toBe(0);
    for (const id of offered(state)!) expect(state.instances[id]!.location).toMatchObject({ player: 0, zone: 'waitingRoom' });
    expect(JSON.stringify(decision)).not.toContain('look');
  });
});
