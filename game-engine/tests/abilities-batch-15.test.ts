/**
 * Building blocks of batch 8: effects on the character that is attacking (another card's ability), moving and
 * exchanging the opponent's characters, 他の枠に動かせない for a time, and a search whose cards the opponent
 * divides. Synthetic cards; the wording each case stands for is in its name.
 */

import { describe, expect, it } from 'vitest';
import { type Ability, type Cost, type Ctx, type Effect, type GameEvent, type GameState, type SlotId, getInstance, getPlayerView, getPower, getSoul, stageSlot } from '../src/index';
import { activate, attack, canActivate, cards, noClimaxes } from './ability-helpers';
import { EVENT, answer, card, oid, pending, put, scenario, shouldBeHidden } from './helpers';

const act = (effect: Effect[], cost: Cost[] = []): Ability => ({ type: 'ACT', timing: 'MAIN', cost, effect });
const dealt = (events: GameEvent[]) => events.flatMap((e) => (e.type === 'DAMAGE_DEALT' ? [e.amount] : []));
const at = (state: GameState, player: 0 | 1, slot: SlotId): number | undefined => state.zones[player].stage[slot][0];
const topOf = (state: GameState, player: 0 | 1): number => state.zones[player].deck[state.zones[player].deck.length - 1]!;
/** Answers the order of waiting abilities with the first offered, until something else is asked. */
const inOrder = (start: { state: GameState; events: GameEvent[] }) => {
  let { state, events } = start;
  while (state.pending?.kind === 'CHOOSE_ABILITY') {
    const next = answer(state, { kind: 'CHOOSE_ABILITY', id: state.pending.abilities[0]!.id });
    state = next.state;
    events = [...events, ...next.events];
  }
  return { state, events };
};
const ATTACKER = { who: 'THAT', as: 'ATTACKING' } as const;

// ---------------------------------------------------------------------------------------------------------

describe('B: 他のあなたのキャラがアタックした時、そのアタックしているキャラのソウルを－1し、山札の上から1枚を公開する', () => {
  // 【自】【ターン1】 …そのターン中、あなたはそのアタックしているキャラのソウルを－1し、自分の山札の上から1枚を公開する。そのカードがレベル0以下のキャラならストック置場に置く。
  const deal: Ability = {
    type: 'AUTO',
    trigger: { on: 'OTHER_ATTACKS' },
    limit: 1,
    effect: [{ do: 'MODIFY', target: ATTACKER, stat: 'SOUL', amount: -1 }, { do: 'REVEAL_TOP', filter: { kind: 'CHARACTER', levelMax: 0 }, toStock: true }],
  };
  /** The source in the back row; card 1 and card 2 (soul 2) in the front row. Card 49 is the top of the deck. */
  const field = (top: Partial<Parameters<typeof cards>[0][string]>, more?: (ctx: Ctx) => void) =>
    scenario({ step: 'ATTACK_START', defs: cards({ '0:0': { abilities: [deal], soul: 2 }, '0:1': { soul: 2 }, '0:2': { soul: 2 }, '0:49': top }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'BL'));
      put(ctx, card(0, 1), stageSlot(0, 'FC'));
      put(ctx, card(0, 2), stageSlot(0, 'FL'));
      noClimaxes(ctx, 1);
      // The climaxes of player 0 leave the deck too, except the top card (49), whatever the test makes of it.
      for (const i of [42, 43, 44, 45, 46, 47, 48]) put(ctx, card(0, i), { player: 0, zone: 'memory' });
      more?.(ctx);
    }).state;
  const character = (level: number) => ({ kind: 'CHARACTER' as const, level, cost: 0, power: 500, soul: 1 });

  it('the attacking character loses the soul, not the card with the ability; a level 0 character shown goes to the stock', () => {
    const start = field(character(0));
    const { state, events } = attack(start, card(0, 1), 'DIRECT');
    // Soul 2 − 1, +1 for the direct attack (which lasts for the turn): 2 damage instead of 3.
    expect(dealt(events)).toEqual([2]);
    expect(getSoul(state, card(0, 1))).toBe(2 - 1 + 1);
    expect(getSoul(state, card(0, 0))).toBe(2);
    expect(getSoul(state, card(0, 2))).toBe(2);
    // The shown card is in the stock, under the card of the trigger check (41), and was shown to both players.
    expect(state.zones[0].stock).toEqual([card(0, 49), card(0, 41)]);
    expect(events.some((e) => e.type === 'CARD_REVEALED' && e.instanceId === card(0, 49))).toBe(true);
    // The ability was resolved before the trigger step.
    const types = events.map((e) => e.type);
    expect(types.indexOf('CARD_REVEALED')).toBeLessThan(types.indexOf('TRIGGER_CHECK'));
  });

  it.each([
    ['a level 1 character', character(1)],
    ['a climax', { kind: 'CLIMAX' as const }],
    ['an event of level 0', EVENT],
  ])('%s shown: it stays on top of the deck, no longer shown, and is the card of the trigger check', (_name, top) => {
    const start = field(top);
    const shown = topOf(start, 0);
    const { state, events } = attack(start, card(0, 1), 'DIRECT');
    expect(shown).toBe(card(0, 49));
    expect(events.some((e) => e.type === 'CARD_REVEALED' && e.instanceId === shown)).toBe(true);
    // Not put into the stock by the effect: the trigger check then takes this very card.
    const check = events.find((e) => e.type === 'TRIGGER_CHECK');
    expect(check && check.type === 'TRIGGER_CHECK' && check.cardId).toBe(getInstance(state, shown).cardId);
    expect(state.zones[0].stock).toEqual([shown]);
    expect(getInstance(state, shown).revealed).toBe(false);
    expect(dealt(events)).toEqual([2]);
  });

  it('（そうでないなら元に戻す）: a card that is not put into the stock is hidden again where it was', () => {
    // The same showing as an activated ability, so that nothing takes the card afterwards.
    const show = act([{ do: 'REVEAL_TOP', filter: { kind: 'CHARACTER', levelMax: 0 }, toStock: true }]);
    const start = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [show] }, '0:49': character(1) }) }, (ctx) => put(ctx, card(0, 0), stageSlot(0, 'FC'))).state;
    const { state, events } = activate(start, card(0, 0));
    expect(events.some((e) => e.type === 'CARD_REVEALED' && e.instanceId === card(0, 49))).toBe(true);
    expect(topOf(state, 0)).toBe(card(0, 49));
    expect(getInstance(state, card(0, 49)).revealed).toBe(false);
    expect(state.zones[0].stock).toEqual([]);
    // Neither player sees a card of the deck afterwards.
    for (const viewer of [0, 1] as const) expect(getPlayerView(state, viewer).sides[0].deck.every((c) => !('cardId' in c))).toBe(true);
  });

  it('【ターン1】: once in a turn; the second attack of the turn is not changed', () => {
    const first = attack(field(character(1)), card(0, 1), 'DIRECT').state;
    const second = attack(first, card(0, 2), 'DIRECT');
    expect(getSoul(second.state, card(0, 2))).toBe(2);
    expect(dealt(second.events)).toEqual([3]);
    expect(second.events.some((e) => e.type === 'CARD_REVEALED')).toBe(false);
  });

  it('not when the card itself attacks (他の); the change lasts for the turn only', () => {
    const own = scenario({ step: 'ATTACK_START', defs: cards({ '0:0': { abilities: [deal], soul: 2 } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), stageSlot(0, 'FL'));
      noClimaxes(ctx, 0);
      noClimaxes(ctx, 1);
    }).state;
    const self = attack(own, card(0, 0), 'DIRECT');
    expect(dealt(self.events)).toEqual([3]);
    expect(self.events.some((e) => e.type === 'CARD_REVEALED')).toBe(false);

    // The other character attacks: −1 now, and the printed soul again in the next turn.
    // (Printed soul 1, −1 by the ability, +1 for the direct attack.)
    const other = attack(self.state, card(0, 1), 'DIRECT');
    expect(dealt(other.events)).toEqual([1]);
    let state = other.state;
    for (let k = 0; k < 40 && state.turn?.player === 0; k++) {
      const d = state.pending!;
      state = answer(
        state,
        d.kind === 'ATTACK' ? { kind: 'ATTACK', attack: null } : d.kind === 'HAND_LIMIT' ? { kind: 'HAND_LIMIT', discard: d.cards.slice(0, d.count) } : d.kind === 'CLOCK' ? { kind: 'CLOCK', card: null } : { kind: 'CONFIRM', accept: false },
      ).state;
    }
    expect(state.turn?.player).toBe(1);
    expect(getSoul(state, card(0, 1))).toBe(1);
  });

  it('one card left in the deck: it is shown and handled as usual, and the game goes on (refresh)', () => {
    const start = field(character(0), (ctx) => {
      // Everything but the top card leaves the deck; the waiting room has cards for the refresh.
      for (const id of [...ctx.state.zones[0].deck]) if (id !== card(0, 49)) put(ctx, id, { player: 0, zone: 'waitingRoom' });
    });
    expect(start.zones[0].deck).toEqual([card(0, 49)]);
    const { state, events } = attack(start, card(0, 1), 'DIRECT');
    expect(state.zones[0].stock[0]).toBe(card(0, 49));
    expect(events.some((e) => e.type === 'REFRESH')).toBe(true);
    expect(events.filter((e) => e.type === 'TRIGGER_CHECK')).toHaveLength(1);
    expect(state.result).toBeNull();
  });
});

describe('B: …そのアタックしているキャラのソウルを－1してよい。そうしたら、そのターン中、そのアタックしているキャラのパワーを＋2000', () => {
  const trade: Ability = {
    type: 'AUTO',
    trigger: { on: 'OTHER_ATTACKS' },
    optional: true,
    effect: [{ do: 'MODIFY', target: ATTACKER, stat: 'SOUL', amount: -1 }, { do: 'IF', condition: { if: 'DID' }, then: [{ do: 'MODIFY', target: ATTACKER, stat: 'POWER', amount: 2000 }] }],
  };
  const field = (more?: (ctx: Ctx) => void, extra: Record<string, object> = {}) =>
    scenario({ step: 'ATTACK_START', defs: cards({ '0:0': { abilities: [trade], soul: 2, power: 1000 }, '0:1': { soul: 2, power: 1000 }, '0:2': { soul: 2, power: 1000 }, ...extra }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'BL'));
      put(ctx, card(0, 1), stageSlot(0, 'FC'));
      put(ctx, card(0, 2), stageSlot(0, 'FL'));
      noClimaxes(ctx, 0);
      noClimaxes(ctx, 1);
      more?.(ctx);
    }).state;

  it('accepted: the attacking character gets soul −1 and power +2000; the card with the ability is unchanged', () => {
    const asked = attack(field(), card(0, 1), 'DIRECT').state;
    expect(pending(asked, 'CONFIRM')).toMatchObject({ player: 0, prompt: 'USE_ABILITY' });
    const { state, events } = answer(asked, { kind: 'CONFIRM', accept: true });
    // Soul 2 − 1, and +1 for the direct attack: 2 damage instead of 3.
    expect(dealt(events)).toEqual([2]);
    expect([getSoul(state, card(0, 1)), getPower(state, card(0, 1))]).toEqual([2 - 1 + 1, 3000]);
    expect([getSoul(state, card(0, 0)), getPower(state, card(0, 0))]).toEqual([2, 1000]);
    expect([getSoul(state, card(0, 2)), getPower(state, card(0, 2))]).toEqual([2, 1000]);
  });

  it('declined: nothing changes', () => {
    const asked = attack(field(), card(0, 1), 'DIRECT').state;
    const { state, events } = answer(asked, { kind: 'CONFIRM', accept: false });
    expect(dealt(events)).toEqual([3]);
    expect([getSoul(state, card(0, 1)), getPower(state, card(0, 1))]).toEqual([2 + 1, 1000]);
  });

  it('each attack of the turn asks again, for the character attacking then', () => {
    // A third character in the front row, so that the turn goes on after the second attack.
    let state = answer(attack(field((ctx) => put(ctx, card(0, 3), stageSlot(0, 'FR'))), card(0, 1), 'DIRECT').state, { kind: 'CONFIRM', accept: true }).state;
    state = attack(state, card(0, 2), 'DIRECT').state;
    expect(pending(state, 'CONFIRM').prompt).toBe('USE_ABILITY');
    const second = answer(state, { kind: 'CONFIRM', accept: true });
    expect(dealt(second.events)).toEqual([2]);
    expect(second.state.pending?.kind).toBe('ATTACK');
    expect([getSoul(second.state, card(0, 2)), getPower(second.state, card(0, 2))]).toEqual([2, 3000]);
    // The first attacker keeps what it got, once; the one that has not attacked has nothing.
    expect([getSoul(second.state, card(0, 1)), getPower(second.state, card(0, 1))]).toEqual([2, 3000]);
    expect(getPower(second.state, card(0, 3))).toBe(1000);
  });

  it('the power counts in the battle: 1000 + 2000 against 2500 wins; without it, it loses', () => {
    const front = () => field((ctx) => put(ctx, card(1, 0), stageSlot(1, 'FC')), { '1:0': { power: 2500 } });
    const fight = (accept: boolean) => {
      let state = answer(attack(front(), card(0, 1), 'FRONT').state, { kind: 'CONFIRM', accept }).state;
      state = answer(state, { kind: 'COUNTER', card: null }).state;
      return [getInstance(state, card(0, 1)).orientation, getInstance(state, card(1, 0)).orientation];
    };
    expect(fight(true)).toEqual(['REST', 'REVERSE']);
    expect(fight(false)).toEqual(['REVERSE', 'STAND']);
  });

  it('the attacking character is gone when the ability resolves: nothing is changed, and nothing follows (そうしたら)', () => {
    // Another ability of the same timing puts the attacker into the waiting room first.
    const leave: Ability = { type: 'AUTO', trigger: { on: 'OTHER_ATTACKS' }, effect: [{ do: 'MOVE', target: { who: 'THAT' }, to: 'WAITING_ROOM' }] };
    const start = scenario({ step: 'ATTACK_START', defs: cards({ '0:0': { abilities: [leave, trade] }, '0:1': { soul: 2, power: 1000 } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'BL'));
      put(ctx, card(0, 1), stageSlot(0, 'FC'));
      noClimaxes(ctx, 0);
      noClimaxes(ctx, 1);
    }).state;
    let run = inOrder(attack(start, card(0, 1), 'DIRECT'));
    if (run.state.pending?.kind === 'CONFIRM') run = { ...answer(run.state, { kind: 'CONFIRM', accept: true }), events: run.events };
    expect(run.state.zones[0].waitingRoom).toContain(card(0, 1));
    // The card in the waiting room is a new card (CR-3.1.4): it carries no change.
    expect(run.state.modifiers.filter((m) => m.objectId === getInstance(run.state, card(0, 1)).objectId)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------

describe('A: 相手のキャラを1枚選び、【スタンド】して…他の枠に動かすか、他の相手のキャラを1枚選び、それぞれを【スタンド】して入れ替える', () => {
  const chosen = { who: 'CHOSEN' } as const;
  const effect: Effect[] = [
    { do: 'CHOOSE', from: 'OPPONENT_STAGE', min: 1, max: 1 },
    {
      do: 'CHOOSE_ONE',
      afterChoice: true,
      options: [
        [{ do: 'ORIENT', target: chosen, to: 'STAND' }, { do: 'MOVE_TO_SLOT', target: chosen, row: 'ANY' }],
        [{ do: 'CHOOSE', from: 'OPPONENT_STAGE', min: 1, max: 1, add: true, otherThanChosen: true }, { do: 'SWAP_CHOSEN' }],
      ],
    },
  ];
  const ability = act(effect, [{ pay: 'SELF_TO_WAITING_ROOM' }]);
  /** Player 1's characters by slot: card index. */
  const field = (theirs: Partial<Record<SlotId, number>>, more?: (ctx: Ctx) => void, defs: Record<string, object> = {}) =>
    scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [ability] }, ...defs }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      for (const [slot, index] of Object.entries(theirs)) put(ctx, card(1, index), stageSlot(1, slot as SlotId), { orientation: 'REST' });
      more?.(ctx);
    }).state;
  const choose = (state: GameState, ...ids: number[]) => answer(state, { kind: 'SELECT_CARDS', cards: ids.map((id) => oid(state, id)) }).state;
  const mode = (state: GameState, k: 1 | 2) => answer(state, { kind: 'SELECT_OPTION', option: `EFFECT_${k}` }).state;

  it('moved: the chosen character stands and goes to the free slot the player of the effect chooses (CR-8.6.5)', () => {
    let state = activate(field({ FC: 0, BL: 1 }), card(0, 0)).state;
    // The cost is paid, once.
    expect(state.zones[0].waitingRoom).toEqual([card(0, 0)]);
    expect(pending(state, 'SELECT_CARDS')).toMatchObject({ player: 0, min: 1, max: 1 });
    state = choose(state, card(1, 0));
    expect(pending(state, 'SELECT_OPTION')).toMatchObject({ player: 0, options: ['EFFECT_1', 'EFFECT_2'] });
    state = mode(state, 1);
    // The free slots of the opponent's stage, not the slot it is in and not the occupied one.
    expect(pending(state, 'SELECT_SLOT')).toMatchObject({ player: 0, slots: ['FL', 'FR', 'BR'] });
    expect(() => answer(state, { kind: 'SELECT_SLOT', slot: 'BL' })).toThrow();
    const before = oid(state, card(1, 0));
    state = answer(state, { kind: 'SELECT_SLOT', slot: 'BR' }).state;
    expect(at(state, 1, 'BR')).toBe(card(1, 0));
    expect(at(state, 1, 'FC')).toBeUndefined();
    expect(getInstance(state, card(1, 0)).orientation).toBe('STAND');
    // The same object in another slot; the other character is untouched.
    expect(oid(state, card(1, 0))).toBe(before);
    expect(getInstance(state, card(1, 1))).toMatchObject({ orientation: 'REST', location: { zone: 'stage', slot: 'BL' } });
    expect(state.zones[0].waitingRoom).toEqual([card(0, 0)]);
    expect(state.pending?.kind).toBe('MAIN');
  });

  it('exchanged: another character is chosen, both stand and change places', () => {
    let state = activate(field({ FC: 0, BL: 1, BR: 2 }), card(0, 0)).state;
    state = mode(choose(state, card(1, 0)), 2);
    // Another one: the first is not offered again.
    expect(pending(state, 'SELECT_CARDS')).toMatchObject({ player: 0, min: 1, max: 1 });
    expect(pending(state, 'SELECT_CARDS').cards).toEqual([oid(state, card(1, 1)), oid(state, card(1, 2))]);
    expect(() => choose(state, card(1, 0))).toThrow();
    state = choose(state, card(1, 2));
    expect([at(state, 1, 'FC'), at(state, 1, 'BR'), at(state, 1, 'BL')]).toEqual([card(1, 2), card(1, 0), card(1, 1)]);
    expect([0, 2].map((i) => getInstance(state, card(1, i)).orientation)).toEqual(['STAND', 'STAND']);
    // The third character is not touched.
    expect(getInstance(state, card(1, 1)).orientation).toBe('REST');
  });

  it('no free slot: the character stands and stays; no second character: nothing is exchanged and nobody stands', () => {
    let full = activate(field({ FL: 0, FC: 1, FR: 2, BL: 3, BR: 4 }), card(0, 0)).state;
    full = mode(choose(full, card(1, 1)), 1);
    expect(full.pending?.kind).toBe('MAIN');
    expect(getInstance(full, card(1, 1))).toMatchObject({ orientation: 'STAND', location: { zone: 'stage', slot: 'FC' } });

    let alone = activate(field({ FC: 0 }), card(0, 0)).state;
    alone = mode(choose(alone, card(1, 0)), 2);
    expect(alone.pending?.kind).toBe('MAIN');
    expect(getInstance(alone, card(1, 0))).toMatchObject({ orientation: 'REST', location: { zone: 'stage', slot: 'FC' } });
  });

  it('no character of the opponent: the cost can be paid, nothing is asked, nothing happens', () => {
    const state = activate(field({}), card(0, 0)).state;
    expect(state.zones[0].waitingRoom).toEqual([card(0, 0)]);
    expect(state.pending?.kind).toBe('MAIN');
  });

  it('markers go with the character, and changes of its numbers stay (it is the same card in another slot)', () => {
    const start = field({ FC: 0 }, (ctx) => {
      put(ctx, card(1, 5), { player: 1, zone: 'marker', slot: 'FC' });
      ctx.state.modifiers.push({ objectId: getInstance(ctx.state, card(1, 0)).objectId, stat: 'POWER', delta: 1500 });
      ctx.state.modifiers.push({ objectId: getInstance(ctx.state, card(1, 0)).objectId, stat: 'SOUL', delta: 1 });
    });
    const power = getPower(start, card(1, 0));
    expect([power, getSoul(start, card(1, 0))]).toEqual([1000 + 1500, 1 + 1]);
    let state = mode(choose(activate(start, card(0, 0)).state, card(1, 0)), 1);
    state = answer(state, { kind: 'SELECT_SLOT', slot: 'BL' }).state;
    expect(state.zones[1].marker.BL).toEqual([card(1, 5)]);
    expect(state.zones[1].marker.FC).toEqual([]);
    expect([getPower(state, card(1, 0)), getSoul(state, card(1, 0))]).toEqual([power, 2]);
  });

  it('exchanged with markers and a change on each: each keeps its own', () => {
    const start = field({ FC: 0, BL: 1 }, (ctx) => {
      put(ctx, card(1, 5), { player: 1, zone: 'marker', slot: 'FC' });
      put(ctx, card(1, 6), { player: 1, zone: 'marker', slot: 'BL' });
    });
    const state = choose(mode(choose(activate(start, card(0, 0)).state, card(1, 0)), 2), card(1, 1));
    expect(state.zones[1].marker.BL).toEqual([card(1, 5)]);
    expect(state.zones[1].marker.FC).toEqual([card(1, 6)]);
    expect([at(state, 1, 'BL'), at(state, 1, 'FC')]).toEqual([card(1, 0), card(1, 1)]);
  });

  it('a character that cannot be chosen by the opponent’s effects is not offered', () => {
    const start = field({ FC: 0, BL: 1 }, undefined, { '1:0': { abilities: [{ type: 'CONT', untargetable: true, apply: [] }] } });
    const state = activate(start, card(0, 0)).state;
    expect(pending(state, 'SELECT_CARDS').cards).toEqual([oid(state, card(1, 1))]);
  });
});

describe('A: …他の枠に動かし、次の相手のターンの終わりまで、そのキャラに『【永】 このカードは他の枠に動かせない。』を与える', () => {
  const chosen = { who: 'CHOSEN' } as const;
  const pin: Effect[] = [
    { do: 'CHOOSE', from: 'OPPONENT_STAGE', min: 1, max: 1 },
    { do: 'MOVE_TO_SLOT', target: chosen, row: 'ANY' },
    { do: 'GRANT', target: chosen, ability: { type: 'CONT', cannotMove: true, apply: [] }, until: 'NEXT_OPPONENT_TURN' },
  ];
  // ［他のあなたの舞台の《A》のキャラを1枚控え室に置き、このカードを【レスト】する］ 他のあなたの《A》のキャラが2枚以上なら、…
  const guarded = act(
    [{ do: 'IF', condition: { if: 'CHARACTERS', min: 2, other: true, filter: { kind: 'CHARACTER', traits: ['A'] } }, then: pin }],
    [{ pay: 'CHARACTERS_TO_WAITING_ROOM', count: 1, filter: { kind: 'CHARACTER', traits: ['A'] }, other: true }, { pay: 'REST_SELF' }],
  );
  // Tools of the tests: move the chosen character of the opponent again; send it to the waiting room.
  const moveAgain = act([{ do: 'CHOOSE', from: 'OPPONENT_STAGE', min: 1, max: 1 }, { do: 'MOVE_TO_SLOT', target: chosen, row: 'ANY' }]);
  const swapTwo = act([{ do: 'CHOOSE', from: 'OPPONENT_STAGE', min: 2, max: 2 }, { do: 'SWAP_CHOSEN' }]);
  const remove = act([{ do: 'CHOOSE', from: 'OPPONENT_STAGE', min: 1, max: 1 }, { do: 'MOVE', target: chosen, to: 'WAITING_ROOM' }]);
  const field = (others: number) =>
    scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [guarded, act(pin), moveAgain, swapTwo, remove] }, '0:1': { traits: ['A'] }, '0:2': { traits: ['A'] }, '0:3': { traits: ['A'] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'BL'));
      (['FL', 'FC', 'FR'] as const).slice(0, others).forEach((slot, k) => put(ctx, card(0, 1 + k), stageSlot(0, slot)));
      put(ctx, card(1, 0), stageSlot(1, 'FC'), { orientation: 'REST' });
      put(ctx, card(1, 1), stageSlot(1, 'BL'));
      noClimaxes(ctx, 0);
      noClimaxes(ctx, 1);
    }).state;
  const choose = (state: GameState, ...ids: number[]) => answer(state, { kind: 'SELECT_CARDS', cards: ids.map((id) => oid(state, id)) }).state;
  /** The plain pin (ability 1) on card(1, 0), moved to FR. */
  const pinned = () => answer(choose(activate(field(3), card(0, 0), 1).state, card(1, 0)), { kind: 'SELECT_SLOT', slot: 'FR' }).state;
  const swaps = (state: GameState) => pending(state, 'MAIN').actions.flatMap((a) => (a.type === 'SWAP' ? [`${a.a}-${a.b}`] : []));

  it('the condition is looked at when the effect is carried out, after the cost: two others left are needed', () => {
    // Three others: one pays the cost, two are left.
    let state = activate(field(3), card(0, 0), 0).state;
    state = choose(state, card(0, 1));
    expect(getInstance(state, card(0, 0)).orientation).toBe('REST');
    expect(pending(state, 'SELECT_CARDS')).toMatchObject({ player: 0, cards: [oid(state, card(1, 0)), oid(state, card(1, 1))] });
    // Two others: after the cost one is left; the cost is paid and nothing happens.
    let short = activate(field(2), card(0, 0), 0).state;
    short = choose(short, card(0, 1));
    expect(short.zones[0].waitingRoom).toEqual([card(0, 1)]);
    expect(short.pending?.kind).toBe('MAIN');
    expect(at(short, 1, 'FC')).toBe(card(1, 0));
  });

  it('moved without standing, and from then on it cannot be moved to another slot; other characters can', () => {
    const state = pinned();
    expect(getInstance(state, card(1, 0))).toMatchObject({ orientation: 'REST', location: { zone: 'stage', slot: 'FR' } });
    // An effect that would move it does nothing (CR-1.3.3); the other character is moved as usual.
    let again = choose(activate(state, card(0, 0), 2).state, card(1, 0));
    expect(again.pending?.kind).toBe('MAIN');
    expect(at(again, 1, 'FR')).toBe(card(1, 0));
    again = answer(choose(activate(state, card(0, 0), 2).state, card(1, 1)), { kind: 'SELECT_SLOT', slot: 'FL' }).state;
    expect(at(again, 1, 'FL')).toBe(card(1, 1));
    // An exchange with it: both stand, the places stay.
    const swapped = choose(activate(state, card(0, 0), 3).state, card(1, 0), card(1, 1));
    expect([at(swapped, 1, 'FR'), at(swapped, 1, 'BL')]).toEqual([card(1, 0), card(1, 1)]);
    expect(getInstance(swapped, card(1, 0)).orientation).toBe('STAND');
  });

  it('it can still leave the stage: only moving to another slot is forbidden', () => {
    const state = choose(activate(pinned(), card(0, 0), 4).state, card(1, 0));
    expect(state.zones[1].waitingRoom).toContain(card(1, 0));
    expect(at(state, 1, 'FR')).toBeUndefined();
  });

  it('in the opponent’s next turn its owner cannot move it in the main phase; after that turn they can', () => {
    let state = pinned();
    const pass = (s: GameState): GameState => {
      const d = s.pending!;
      return answer(
        s,
        d.kind === 'MAIN' ? { kind: 'MAIN', action: { type: 'PASS' } }
          : d.kind === 'CLIMAX' ? { kind: 'CLIMAX', card: null }
          : d.kind === 'ATTACK' ? { kind: 'ATTACK', attack: null }
          : d.kind === 'CLOCK' ? { kind: 'CLOCK', card: null }
          : d.kind === 'HAND_LIMIT' ? { kind: 'HAND_LIMIT', discard: d.cards.slice(0, d.count) }
          : { kind: 'CONFIRM', accept: false },
      ).state;
    };
    const untilMain = (s: GameState, player: 0 | 1): GameState => {
      let current = pass(s);
      for (let k = 0; k < 60 && !(current.turn?.player === player && current.pending?.kind === 'MAIN'); k++) current = pass(current);
      return current;
    };
    // The opponent's main phase: no move with the slot of the pinned character; the other character moves freely.
    state = untilMain(state, 1);
    expect(state.turn?.player).toBe(1);
    expect(swaps(state).some((s) => s.split('-').includes('FR'))).toBe(false);
    expect(swaps(state)).toContain('FL-BL');
    // The turn after that (the first player's): still its owner's stage, the ability has ended with the opponent's turn.
    state = untilMain(state, 0);
    state = untilMain(state, 1);
    expect(at(state, 1, 'FR')).toBe(card(1, 0));
    expect(swaps(state).some((s) => s.split('-').includes('FR'))).toBe(true);
  });

  it('two characters given it: each for itself; one leaving does not free the other', () => {
    let state = pinned();
    // Card(1, 1) too, by the same plain ability (the test card may use it again).
    state = answer(choose(activate(state, card(0, 0), 1).state, card(1, 1)), { kind: 'SELECT_SLOT', slot: 'FL' }).state;
    state = choose(activate(state, card(0, 0), 4).state, card(1, 0));
    const again = choose(activate(state, card(0, 0), 2).state, card(1, 1));
    expect(again.pending?.kind).toBe('MAIN');
    expect(at(again, 1, 'FL')).toBe(card(1, 1));
  });

  it('the cost cannot be paid without another 《A》 character: the ability is not offered', () => {
    const none = scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [guarded] } }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'BL'));
      put(ctx, card(0, 1), stageSlot(0, 'FC'));
      put(ctx, card(1, 0), stageSlot(1, 'FC'));
    }).state;
    expect(canActivate(none)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------

describe('C: 自分の山札を見て…を2枚まで選んで相手に見せる。その後、相手はそれらのキャラを1枚選び、控え室に置き、残りのカードをあなたの手札に加え、その山札をシャッフルする', () => {
  const search: Effect[] = [
    { do: 'CHOOSE', from: 'YOUR_DECK', filter: { kind: 'CHARACTER', traits: ['M'] }, min: 0, max: 2 },
    { do: 'SPLIT_CHOSEN', take: 1, exact: true, to: 'WAITING_ROOM', rest: 'HAND', reveal: true, by: 'OPPONENT' },
    { do: 'SHUFFLE' },
  ];
  // ［あなたの【スタンド】している《M》のキャラを1枚【レスト】する］ あなたはコストを払ってよい。そうしたら、…
  const paid = act([{ do: 'MAY_PAY', cost: [{ pay: 'REST_CHARACTERS', count: 1, filter: { kind: 'CHARACTER', traits: ['M'] } }], then: search }]);
  const M = { traits: ['M'] };
  /** Cards 10, 11, 12 are 《M》 characters in the deck (as many as `inDeck`); card 1 is a 《M》 character on the stage. */
  const field = (inDeck: number, standing = true) =>
    scenario({ step: 'MAIN_START', defs: cards({ '0:0': { abilities: [paid, act(search)] }, '0:1': M, '0:10': M, '0:11': M, '0:12': M }) }, (ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(0, 1), stageSlot(0, 'FL'), standing ? {} : { orientation: 'REST' });
      [10, 11, 12].slice(inDeck).forEach((i) => put(ctx, card(0, i), { player: 0, zone: 'memory' }));
    }).state;
  const pick = (state: GameState, ...ids: number[]) => answer(state, { kind: 'SELECT_CARDS', cards: ids.map((id) => oid(state, id)) });
  /** The search itself (ability 1, no cost). */
  const searching = (inDeck: number) => activate(field(inDeck), card(0, 0), 1).state;

  it('two chosen: shown to the opponent, who chooses one for the waiting room; the other goes to the hand; the deck is shuffled', () => {
    const asked = searching(3);
    expect(pending(asked, 'SELECT_CARDS')).toMatchObject({ player: 0, min: 0, max: 2 });
    expect(pending(asked, 'SELECT_CARDS').cards.map((o) => asked.instances.find((i) => i.objectId === o)!.instanceId).sort((a, b) => a - b)).toEqual([card(0, 10), card(0, 11), card(0, 12)]);
    const shown = pick(asked, card(0, 10), card(0, 12));
    expect(shown.events.filter((e) => e.type === 'CARD_REVEALED').map((e) => (e as { instanceId: number }).instanceId).sort((a, b) => a - b)).toEqual([card(0, 10), card(0, 12)]);
    // The opponent decides, among exactly these two, exactly one; no private look is handed over.
    const theirs = pending(shown.state, 'SELECT_CARDS');
    expect(theirs).toMatchObject({ player: 1, prompt: 'EFFECT_SPLIT_BY_OPPONENT', min: 1, max: 1 });
    expect(theirs.cards).toEqual([oid(shown.state, card(0, 10)), oid(shown.state, card(0, 12))]);
    expect(theirs.look).toBeUndefined();
    expect(() => pick(shown.state, card(0, 11))).toThrow();
    expect(() => pick(shown.state)).toThrow();
    expect(() => pick(shown.state, card(0, 10), card(0, 12))).toThrow();
    const done = pick(shown.state, card(0, 12));
    // Into the waiting room and the hand of the cards' owner.
    expect(done.state.zones[0].waitingRoom).toEqual([card(0, 12)]);
    expect(done.state.zones[0].hand).toEqual([card(0, 10)]);
    expect(done.state.zones[1].waitingRoom).toEqual([]);
    expect(done.events.some((e) => e.type === 'DECK_SHUFFLED')).toBe(true);
    expect(done.state.instances.some((i) => i.revealed)).toBe(false);
    expect(done.state.pending?.kind).toBe('MAIN');
  });

  it('one chosen: the opponent must choose it; nothing is left for the hand', () => {
    const shown = pick(searching(3), card(0, 11)).state;
    expect(pending(shown, 'SELECT_CARDS')).toMatchObject({ player: 1, min: 1, max: 1, cards: [oid(shown, card(0, 11))] });
    const done = pick(shown, card(0, 11)).state;
    expect(done.zones[0].waitingRoom).toEqual([card(0, 11)]);
    expect(done.zones[0].hand).toEqual([]);
  });

  it('none chosen (2枚まで), or none in the deck: the opponent is asked nothing; the deck is still shuffled', () => {
    const none = pick(searching(3));
    expect(none.state.pending).toMatchObject({ kind: 'MAIN', player: 0 });
    expect(none.events.some((e) => e.type === 'CARD_REVEALED')).toBe(false);
    expect(none.events.some((e) => e.type === 'DECK_SHUFFLED')).toBe(true);
    expect([none.state.zones[0].hand, none.state.zones[0].waitingRoom]).toEqual([[], []]);

    const empty = activate(field(0), card(0, 0), 1);
    expect(empty.state.pending).toMatchObject({ kind: 'MAIN', player: 0 });
    expect(empty.events.some((e) => e.type === 'CARD_REVEALED')).toBe(false);
  });

  it('only one such card in the deck: only it can be chosen; other cards never', () => {
    const asked = searching(1);
    expect(pending(asked, 'SELECT_CARDS').cards).toEqual([oid(asked, card(0, 10))]);
    expect(() => pick(asked, card(0, 20))).toThrow();
    expect(() => pick(asked, card(0, 10), card(0, 20))).toThrow();
  });

  it('what each player sees: the searching player’s deck only to them; to the opponent only the cards shown', () => {
    const asked = searching(3);
    // While searching: the opponent learns that a decision is pending, not its cards.
    const whileSearching = JSON.stringify(getPlayerView(asked, 1));
    expect(getPlayerView(asked, 1).sides[0].deck.every((c) => !('cardId' in c))).toBe(true);
    expect(whileSearching).not.toContain('"look"');
    expect(Object.keys(pending(asked, 'SELECT_CARDS').look ?? {})).toHaveLength(asked.zones[0].deck.length);

    const shown = pick(asked, card(0, 10), card(0, 12)).state;
    for (const viewer of [0, 1] as const) {
      const deck = getPlayerView(shown, viewer).sides[0].deck;
      const visible = deck.flatMap((c) => ('cardId' in c ? [c.objectId] : []));
      expect(visible.sort((a, b) => a - b)).toEqual([oid(shown, card(0, 10)), oid(shown, card(0, 12))].sort((a, b) => a - b));
    }
    // Independent statement of the visibility rules: nothing else of the deck is visible to the opponent.
    for (const id of shown.zones[0].deck) expect(shouldBeHidden(1, getInstance(shown, id))).toBe(id !== card(0, 10) && id !== card(0, 12));
    // The player who searched is not the one deciding now and gets no list of answers.
    expect(getPlayerView(shown, 0).decision).not.toHaveProperty('cards');
  });

  it('the position survives being stored and loaded while the opponent decides (reconnect, replay)', () => {
    const shown = pick(searching(3), card(0, 10), card(0, 12)).state;
    const loaded = JSON.parse(JSON.stringify(shown)) as GameState;
    const a = pick(shown, card(0, 10));
    const b = pick(loaded, card(0, 10));
    expect(b.state).toEqual(a.state);
    expect(b.events).toEqual(a.events);
  });

  it('［…を1枚【レスト】する］ あなたはコストを払ってよい: paid once by a standing 《M》 character; declined or not payable, nothing happens', () => {
    let state = activate(field(3), card(0, 0), 0).state;
    expect(pending(state, 'CONFIRM').prompt).toBe('PAY_COST');
    const declined = answer(state, { kind: 'CONFIRM', accept: false }).state;
    expect(declined.pending?.kind).toBe('MAIN');
    expect(getInstance(declined, card(0, 1)).orientation).toBe('STAND');
    state = answer(state, { kind: 'CONFIRM', accept: true }).state;
    // Only the standing 《M》 character can pay (the card itself has no 《M》).
    expect(pending(state, 'SELECT_CARDS')).toMatchObject({ prompt: 'COST_REST', cards: [oid(state, card(0, 1))], min: 1, max: 1 });
    state = pick(state, card(0, 1)).state;
    expect(getInstance(state, card(0, 1)).orientation).toBe('REST');
    expect(pending(state, 'SELECT_CARDS')).toMatchObject({ player: 0, max: 2 });
    // The 《M》 character already rests: the cost cannot be paid, nothing is asked, the deck is not looked at.
    const rested = activate(field(3, false), card(0, 0), 0);
    expect(rested.state.pending?.kind).toBe('MAIN');
    expect(rested.events.some((e) => e.type === 'ORIENTATION_CHANGED')).toBe(false);
  });
});
