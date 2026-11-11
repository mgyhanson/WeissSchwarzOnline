import { describe, expect, it } from 'vitest';
import {
  type AttackType,
  type CardDef,
  type Ctx,
  type GameEvent,
  type GameState,
  type PlayerId,
  type StepResult,
  assertInvariants,
  getInstance,
  getPlayerView,
  moveCards,
  setOrientation,
  stageSlot,
} from '../src/index';
import { type DefOverride, EVENT, answer, card, oid, pending, put, scenario } from './helpers';

/** Removes a player's climaxes (deck positions 42..49) from the game, so damage is never cancelled. */
function noClimaxes(ctx: Ctx, player: PlayerId): void {
  moveCards(
    ctx,
    [42, 43, 44, 45, 46, 47, 48, 49].map((i) => card(player, i)),
    { player, zone: 'memory' },
  );
}

/** Leaves only the given number of cards (from the top) in a player's deck. */
function keepTopOfDeck(ctx: Ctx, player: PlayerId, count: number): void {
  const deck = ctx.state.zones[player].deck;
  moveCards(ctx, deck.slice(0, deck.length - count), { player, zone: 'memory' });
}

function attackScenario(arrange: (ctx: Ctx) => void, defs?: DefOverride, turnNumber = 3): GameState {
  return scenario({ step: 'ATTACK_START', defs, turnNumber }, arrange).state;
}

function declare(state: GameState, attacker: number, type: AttackType): StepResult {
  return answer(state, { kind: 'ATTACK', attack: { attacker: oid(state, attacker), type } });
}

function trace(events: GameEvent[]): string[] {
  return events.flatMap((e) => {
    if (e.type === 'CARD_MOVED') return [`${e.reason}:${e.from.zone}>${e.to.zone}`];
    if (e.type === 'DAMAGE_DEALT') return [e.cancelled ? 'CANCELLED' : `DAMAGE ${e.amount}`];
    if (e.type === 'REFRESH' || e.type === 'LEVEL_UP' || e.type === 'GAME_ENDED') return [e.type];
    if (e.type === 'ORIENTATION_CHANGED') return [`${e.from}>${e.to}`];
    return [];
  });
}

const damageEvents = (events: GameEvent[]): string[] => trace(events).filter((line) => line === 'CANCELLED' || line.startsWith('DAMAGE '));

describe('attack declaration (CR-7.2)', () => {
  it('T-ATK-002 / CR-7.2.1.3.1.1: only standing characters in the front row can attack', () => {
    const state = attackScenario((ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FL'));
      setOrientation(ctx, put(ctx, card(0, 1), stageSlot(0, 'FC')), 'REST');
      put(ctx, card(0, 2), stageSlot(0, 'BL'));
    });
    expect(pending(state, 'ATTACK').attacks).toEqual([{ attacker: oid(state, card(0, 0)), type: 'DIRECT' }]);
  });

  it('T-ATK-006 / CR-7.2.1.4.2: with a character facing it, the attacker chooses between front and side attack', () => {
    const state = attackScenario((ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FL'));
      // T-ZONE-044 / CR-3.6.6: own front-left faces the opponent's front-right.
      put(ctx, card(1, 0), stageSlot(1, 'FR'));
      put(ctx, card(0, 1), stageSlot(0, 'FR'));
    });
    const attacker = oid(state, card(0, 0));
    expect(pending(state, 'ATTACK').attacks).toEqual([
      { attacker, type: 'FRONT' },
      { attacker, type: 'SIDE' },
      { attacker: oid(state, card(0, 1)), type: 'DIRECT' },
    ]);
  });

  it('with no character able to attack the phase moves on without a question', () => {
    const { state, events } = scenario({ step: 'ATTACK_START' }, (ctx) => {
      put(ctx, card(0, 2), stageSlot(0, 'BL'));
    });
    expect(events.flatMap((e) => (e.type === 'PHASE_STARTED' ? [e.phase] : [])).slice(0, 2)).toEqual(['ATTACK', 'END']);
    expect(state.pending?.kind).not.toBe('ATTACK');
  });

  it('T-ATK-005 / CR-7.2.1.4.1, T-ATK-009 / CR-7.2.1.5.3, T-ATK-014 / CR-7.5.1.2, T-DMG-001 / CR-4.12.1.1, T-DMG-003 / CR-4.12.1.3, T-DMG-004 / CR-3.13.1.3.1: a direct attack rests the attacker and deals its soul + 1, card by card', () => {
    const start = attackScenario((ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      noClimaxes(ctx, 1);
    });
    const { state, events } = declare(start, card(0, 0), 'DIRECT');

    expect(events.find((e) => e.type === 'ATTACK_DECLARED')).toMatchObject({ player: 0, attackType: 'DIRECT', attackerSlot: 'FC', defenderObjectId: null });
    expect(getInstance(state, card(0, 0)).orientation).toBe('REST');
    expect(damageEvents(events)).toEqual(['DAMAGE 2']);
    // T-DMG-001 / T-DMG-003 / T-DMG-004: the cards come off the top of the
    // deck one at a time and enter the clock together in that order.
    expect(state.zones[1].clock).toEqual([card(1, 41), card(1, 40)]);
    expect(state.zones[1].resolution).toEqual([]);
  });

  it('T-ATK-006 / CR-7.2.1.4.2: a side attack loses one soul per level of the facing character, and there is no battle', () => {
    const defs: DefOverride = (p, i) => (p === 0 && i === 0 ? { soul: 3 } : p === 1 && i === 0 ? { level: 2, power: 9000 } : undefined);
    const start = attackScenario((ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(1, 0), stageSlot(1, 'FC'));
      noClimaxes(ctx, 1);
    }, defs);
    const { state, events } = declare(start, card(0, 0), 'SIDE');
    expect(damageEvents(events)).toEqual(['DAMAGE 1']);
    // No counter step and no battle: nobody was reversed.
    expect(trace(events).some((line) => line.endsWith('>REVERSE'))).toBe(false);
    expect(state.zones[0].stage.FC).toEqual([card(0, 0)]);
    expect(state.zones[1].stage.FC).toEqual([card(1, 0)]);
  });

  it('T-ATK-015 / CR-7.5.1.2.1: an attacker whose soul is 0 or less deals no damage at all', () => {
    const defs: DefOverride = (p, i) => (p === 1 && i === 0 ? { level: 1 } : undefined);
    const start = attackScenario((ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(1, 0), stageSlot(1, 'FC'));
      noClimaxes(ctx, 1);
    }, defs);
    const { state, events } = declare(start, card(0, 0), 'SIDE');
    expect(damageEvents(events)).toEqual([]);
    expect(state.zones[1].clock).toEqual([]);
    // No card left the deck for damage (the one missing is the draw of player 1's next turn).
    expect(trace(events).some((line) => line.startsWith('DAMAGE'))).toBe(false);
    expect(state.zones[1].deck).toHaveLength(40);
  });

  it('T-ATK-003 / CR-7.2.1.3.1.2: on the first turn of the game only one attack can be made', () => {
    const arrange = (ctx: Ctx): void => {
      put(ctx, card(0, 0), stageSlot(0, 'FL'));
      put(ctx, card(0, 1), stageSlot(0, 'FR'));
      noClimaxes(ctx, 1);
    };
    const firstTurn = declare(attackScenario(arrange, undefined, 1), card(0, 0), 'DIRECT').state;
    expect(firstTurn.pending?.kind).not.toBe('ATTACK');
    expect(getInstance(firstTurn, card(0, 1)).orientation).toBe('STAND');

    const laterTurn = declare(attackScenario(arrange, undefined, 3), card(0, 0), 'DIRECT').state;
    expect(pending(laterTurn, 'ATTACK').attacks).toEqual([{ attacker: oid(laterTurn, card(0, 1)), type: 'DIRECT' }]);
  });

  it('T-ATK-004 / CR-7.2.1.3.2: the turn player may end the attacks instead', () => {
    const start = attackScenario((ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
    });
    const { state, events } = answer(start, { kind: 'ATTACK', attack: null });
    expect(events.some((e) => e.type === 'ATTACK_DECLARED')).toBe(false);
    expect(getInstance(state, card(0, 0)).orientation).toBe('STAND');
    expect(state.turn).toMatchObject({ player: 1 });
  });

  it('T-ATK-007 / CR-7.2.1.4.3: the attack type and its soul change stay even if the facing character leaves', () => {
    const defs: DefOverride = (p, i) => {
      if (p === 0 && i === 0) return { soul: 3 };
      if (p === 0 && i === 49) return { kind: 'CHARACTER', level: 0, cost: 0, power: 1000, soul: 1, triggers: ['RETURN'] };
      if (p === 1 && i === 0) return { level: 2 };
      return undefined;
    };
    const start = attackScenario((ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FL'));
      put(ctx, card(1, 0), stageSlot(1, 'FR'));
      noClimaxes(ctx, 1);
    }, defs);
    const atTrigger = declare(start, card(0, 0), 'SIDE').state;
    const choose = pending(atTrigger, 'SELECT_CARDS');
    expect(choose.prompt).toBe('TRIGGER_RETURN');

    const { state, events } = answer(atTrigger, { kind: 'SELECT_CARDS', cards: [oid(atTrigger, card(1, 0))] });
    expect(state.zones[1].hand).toContain(card(1, 0));
    // Still a side attack with soul 3 - 2, although nothing faces the attacker any more.
    expect(damageEvents(events)).toEqual(['DAMAGE 1']);
  });
});

describe('trigger step (CR-7.3)', () => {
  it('T-ATK-010 / CR-7.3.1.2: the top card goes face up to the resolution zone, then face down into the stock', () => {
    const start = attackScenario((ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      noClimaxes(ctx, 1);
    });
    const { state, events } = declare(start, card(0, 0), 'DIRECT');
    expect(trace(events).filter((line) => line.startsWith('TRIGGER_CHECK'))).toEqual([
      'TRIGGER_CHECK:deck>resolution',
      'TRIGGER_CHECK:resolution>stock',
    ]);
    expect(events.find((e) => e.type === 'TRIGGER_CHECK')).toMatchObject({ player: 0, icons: [] });
    expect(state.zones[0].stock).toEqual([card(0, 49)]);
    expect(getInstance(state, card(0, 49)).face).toBe('DOWN');
    // Both players saw the card while it was in the resolution zone; in the stock nobody sees it.
    expect(JSON.stringify(getPlayerView(state, 0))).not.toContain('"T0-49"');
  });

  it('a deck emptied by the trigger check is refreshed at once; the trigger card still goes to the stock', () => {
    const start = attackScenario((ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      moveCards(ctx, [1, 2, 3, 4, 5].map((i) => card(0, i)), { player: 0, zone: 'waitingRoom' });
      keepTopOfDeck(ctx, 0, 1);
      noClimaxes(ctx, 1);
    });
    const { state, events } = declare(start, card(0, 0), 'DIRECT');
    const lines = trace(events);
    expect(lines.indexOf('REFRESH')).toBeGreaterThan(lines.indexOf('TRIGGER_CHECK:deck>resolution'));
    expect(lines.indexOf('REFRESH')).toBeLessThan(lines.indexOf('TRIGGER_CHECK:resolution>stock'));
    expect(state.zones[0].stock).toEqual([card(0, 49)]);
    expect(state.zones[0].clock).toHaveLength(1);
    expect(state.zones[0].deck).toHaveLength(4);
  });
});

describe('trigger icons (CR-4.14.2)', () => {
  const CHARACTER: Partial<CardDef> = { kind: 'CHARACTER', level: 0, cost: 0, power: 1000, soul: 1 };

  /** Player 0 attacks directly with one character; the trigger check card has the given icons. */
  function triggerScenario(icons: CardDef['triggers'], arrange: (ctx: Ctx) => void = () => {}, extra?: DefOverride): StepResult {
    const defs: DefOverride = (p, i) => (p === 0 && i === 49 ? { ...CHARACTER, triggers: icons } : extra?.(p, i));
    const start = attackScenario((ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      noClimaxes(ctx, 1);
      arrange(ctx);
    }, defs);
    return declare(start, card(0, 0), 'DIRECT');
  }

  it('T-TRG-001 / CR-4.14.2.1: no icon does nothing', () => {
    const { events } = triggerScenario([]);
    expect(damageEvents(events)).toEqual(['DAMAGE 2']);
  });

  it('T-TRG-002 / CR-4.14.2.2: soul gives the attacking character +1 soul, without asking', () => {
    const { state, events } = triggerScenario(['SOUL']);
    expect(damageEvents(events)).toEqual(['DAMAGE 3']);
    expect(state.zones[1].clock).toEqual([card(1, 41), card(1, 40), card(1, 39)]);
  });

  it('T-ATK-011 / CR-7.3.1.2.1: two identical icons are both executed without an order question', () => {
    const { events } = triggerScenario(['SOUL', 'SOUL']);
    expect(damageEvents(events)).toEqual(['DAMAGE 4']);
  });

  it('T-ATK-011 / CR-7.3.1.2.1: different icons are executed in the order the player chooses', () => {
    const atOrder = triggerScenario(['SOUL', 'GATE'], (ctx) => {
      put(ctx, card(0, 46), { player: 0, zone: 'waitingRoom' });
    }).state;
    expect(pending(atOrder, 'SELECT_OPTION')).toMatchObject({ prompt: 'TRIGGER_ORDER', options: ['SOUL', 'GATE'] });

    const atGate = answer(atOrder, { kind: 'SELECT_OPTION', option: 'GATE' }).state;
    expect(pending(atGate, 'SELECT_CARDS').prompt).toBe('TRIGGER_GATE');
    const { state, events } = answer(atGate, { kind: 'SELECT_CARDS', cards: [oid(atGate, card(0, 46))] });
    expect(state.zones[0].hand).toEqual([card(0, 46)]);
    expect(damageEvents(events)).toEqual(['DAMAGE 3']);
  });

  it('T-TRG-003 / CR-4.14.2.3: return may send one of the opponent’s characters back to its owner’s hand', () => {
    const atChoice = triggerScenario(['RETURN'], (ctx) => {
      put(ctx, card(1, 0), stageSlot(1, 'BL'));
      put(ctx, card(1, 1), stageSlot(1, 'FL'));
    }).state;
    const decision = pending(atChoice, 'SELECT_CARDS');
    expect(decision).toMatchObject({ prompt: 'TRIGGER_RETURN', min: 0, max: 1 });
    expect([...decision.cards].sort()).toEqual([oid(atChoice, card(1, 0)), oid(atChoice, card(1, 1))].sort());

    const returned = answer(atChoice, { kind: 'SELECT_CARDS', cards: [oid(atChoice, card(1, 0))] }).state;
    expect(returned.zones[1].hand).toContain(card(1, 0));
    expect(returned.zones[1].stage.BL).toEqual([]);

    const declined = answer(atChoice, { kind: 'SELECT_CARDS', cards: [] }).state;
    expect(declined.zones[1].stage.BL).toEqual([card(1, 0)]);
  });

  it('T-TRG-003: with no character to choose, return asks nothing', () => {
    const { state } = triggerScenario(['RETURN']);
    expect(state.zones[0].stock).toEqual([card(0, 49)]);
  });

  it('T-TRG-004 / CR-4.14.2.4: pool may put the top card of the deck into the stock', () => {
    const atChoice = triggerScenario(['POOL']).state;
    expect(pending(atChoice, 'CONFIRM').prompt).toBe('TRIGGER_POOL');
    expect(answer(atChoice, { kind: 'CONFIRM', accept: true }).state.zones[0].stock).toEqual([card(0, 48), card(0, 49)]);
    expect(answer(atChoice, { kind: 'CONFIRM', accept: false }).state.zones[0].stock).toEqual([card(0, 49)]);
  });

  it('T-TRG-005 / CR-4.14.2.5: comeback may return a character from the waiting room to hand', () => {
    const atChoice = triggerScenario(['COMEBACK'], (ctx) => {
      put(ctx, card(0, 1), { player: 0, zone: 'waitingRoom' });
      put(ctx, card(0, 46), { player: 0, zone: 'waitingRoom' });
    }).state;
    const decision = pending(atChoice, 'SELECT_CARDS');
    expect(decision.prompt).toBe('TRIGGER_COMEBACK');
    expect(decision.cards).toEqual([oid(atChoice, card(0, 1))]);
    const { state } = answer(atChoice, { kind: 'SELECT_CARDS', cards: decision.cards });
    expect(state.zones[0].hand).toEqual([card(0, 1)]);
    expect(state.zones[0].waitingRoom).toEqual([card(0, 46)]);
  });

  it('T-TRG-006 / CR-4.14.2.6: draw may draw one card', () => {
    const atChoice = triggerScenario(['DRAW']).state;
    expect(pending(atChoice, 'CONFIRM').prompt).toBe('TRIGGER_DRAW');
    const drawn = answer(atChoice, { kind: 'CONFIRM', accept: true }).state;
    expect(drawn.zones[0].hand).toEqual([card(0, 48)]);
    expect(drawn.zones[0].stock).toEqual([card(0, 49)]);
    expect(answer(atChoice, { kind: 'CONFIRM', accept: false }).state.zones[0].hand).toEqual([]);
  });

  it('T-TRG-007 / CR-4.14.2.7: shot deals 1 damage when the attacker’s next damage is cancelled', () => {
    // Player 1's deck: a climax on top, characters below.
    const defs: DefOverride = (p, i) => (p === 0 && i === 49 ? { ...CHARACTER, triggers: ['SHOT'] } : undefined);
    const start = attackScenario((ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      moveCards(ctx, [42, 43, 44, 45, 46, 47, 48].map((i) => card(1, i)), { player: 1, zone: 'memory' });
    }, defs);
    const { state, events } = declare(start, card(0, 0), 'DIRECT');
    expect(damageEvents(events)).toEqual(['CANCELLED', 'DAMAGE 1']);
    expect(state.zones[1].waitingRoom).toEqual([card(1, 49)]);
    expect(state.zones[1].clock).toEqual([card(1, 41)]);
    // The second damage came from the trigger card, not from the attacker (CR-4.13.1.1.1).
    const dealt = events.filter((e) => e.type === 'DAMAGE_DEALT');
    expect(dealt[0]).toMatchObject({ sourceObjectId: oid(start, card(0, 0)) });
    expect(dealt[1]).toMatchObject({ sourceObjectId: null });
  });

  it('T-TRG-007 / CR-4.14.2.7.1: shot does nothing when that damage is not cancelled', () => {
    const { state, events } = triggerScenario(['SHOT']);
    expect(damageEvents(events)).toEqual(['DAMAGE 2']);
    expect(state.shotWatchers).toEqual([]);
  });

  it('T-TRG-008 / CR-4.14.2.8: treasure returns itself to hand, then may put the top deck card into the stock', () => {
    const atChoice = triggerScenario(['TREASURE']).state;
    expect(atChoice.zones[0].hand).toEqual([card(0, 49)]);
    expect(pending(atChoice, 'CONFIRM').prompt).toBe('TRIGGER_TREASURE_STOCK');

    const stocked = answer(atChoice, { kind: 'CONFIRM', accept: true }).state;
    // CR-4.14.2.8.1: the trigger card itself does not go to the stock.
    expect(stocked.zones[0].stock).toEqual([card(0, 48)]);
    expect(stocked.zones[0].hand).toEqual([card(0, 49)]);
    expect(answer(atChoice, { kind: 'CONFIRM', accept: false }).state.zones[0].stock).toEqual([]);
  });

  it('T-TRG-009 / CR-4.14.2.9: gate may return a climax from the waiting room to hand', () => {
    const atChoice = triggerScenario(['GATE'], (ctx) => {
      put(ctx, card(0, 1), { player: 0, zone: 'waitingRoom' });
      put(ctx, card(0, 46), { player: 0, zone: 'waitingRoom' });
    }).state;
    const decision = pending(atChoice, 'SELECT_CARDS');
    expect(decision.cards).toEqual([oid(atChoice, card(0, 46))]);
    expect(answer(atChoice, { kind: 'SELECT_CARDS', cards: decision.cards }).state.zones[0].hand).toEqual([card(0, 46)]);
  });

  it('T-TRG-010 / CR-4.14.2.10: standby may put a character of level up to own level + 1 from the waiting room into any slot, rested', () => {
    const levels: DefOverride = (p, i) => (p === 0 && i === 1 ? { level: 1 } : p === 0 && i === 2 ? { level: 2 } : undefined);
    const atChoice = triggerScenario(['STANDBY'], (ctx) => {
      for (const i of [1, 2, 3, 46]) put(ctx, card(0, i), { player: 0, zone: 'waitingRoom' });
    }, levels).state;
    const decision = pending(atChoice, 'SELECT_CARDS');
    expect(decision.prompt).toBe('TRIGGER_STANDBY');
    // Level 0 player: level 0 and level 1 characters qualify, level 2 and climaxes do not.
    expect([...decision.cards].sort()).toEqual([oid(atChoice, card(0, 1)), oid(atChoice, card(0, 3))].sort());

    const atSlot = answer(atChoice, { kind: 'SELECT_CARDS', cards: [oid(atChoice, card(0, 1))] }).state;
    expect(pending(atSlot, 'SELECT_SLOT').slots).toHaveLength(5);
    const { state } = answer(atSlot, { kind: 'SELECT_SLOT', slot: 'BL' });
    expect(state.zones[0].stage.BL).toEqual([card(0, 1)]);
    expect(getInstance(state, card(0, 1)).orientation).toBe('REST');
  });

  it('T-TRG-010 / CR-4.14.2.10.1: standby onto an occupied slot removes the character that was there', () => {
    const atChoice = triggerScenario(['STANDBY'], (ctx) => {
      put(ctx, card(0, 1), { player: 0, zone: 'waitingRoom' });
      put(ctx, card(0, 5), stageSlot(0, 'BR'));
    }).state;
    const atSlot = answer(atChoice, { kind: 'SELECT_CARDS', cards: [oid(atChoice, card(0, 1))] }).state;
    const { state } = answer(atSlot, { kind: 'SELECT_SLOT', slot: 'BR' });
    expect(state.zones[0].stage.BR).toEqual([card(0, 1)]);
    expect(state.zones[0].waitingRoom).toContain(card(0, 5));
  });

  it('T-TRG-011 / CR-4.14.2.11: choice may put a character with a soul trigger from the waiting room into hand or stock', () => {
    const icons: DefOverride = (p, i) => (p === 0 && (i === 1 || i === 46) ? { triggers: ['SOUL'] } : undefined);
    const atChoice = triggerScenario(['CHOICE'], (ctx) => {
      for (const i of [1, 2, 46]) put(ctx, card(0, i), { player: 0, zone: 'waitingRoom' });
    }, icons).state;
    const decision = pending(atChoice, 'SELECT_CARDS');
    // Only the character with a soul icon: not the plain character, not the climax with a soul icon.
    expect(decision.cards).toEqual([oid(atChoice, card(0, 1))]);

    const atDestination = answer(atChoice, { kind: 'SELECT_CARDS', cards: decision.cards }).state;
    expect(pending(atDestination, 'SELECT_OPTION').options).toEqual(['HAND', 'STOCK']);
    expect(answer(atDestination, { kind: 'SELECT_OPTION', option: 'HAND' }).state.zones[0].hand).toEqual([card(0, 1)]);
    expect(answer(atDestination, { kind: 'SELECT_OPTION', option: 'STOCK' }).state.zones[0].stock).toEqual([card(0, 1), card(0, 49)]);
  });

  it('T-TRG-012 / CR-4.14.2.12 and T-ZONE-016 / CR-4.9.1: chance discards itself, reveals up to two cards, one to stock and the other to hand', () => {
    const first = triggerScenario(['CHANCE']).state;
    // CR-4.14.2.12.1: the trigger card went to the waiting room.
    expect(first.zones[0].waitingRoom).toEqual([card(0, 49)]);
    expect(pending(first, 'CONFIRM').prompt).toBe('TRIGGER_CHANCE_REVEAL');

    const second = answer(first, { kind: 'CONFIRM', accept: true }).state;
    // CR-4.9.1: the revealed card stays in the deck and is visible to both players.
    expect(second.zones[0].deck).toContain(card(0, 48));
    expect(JSON.stringify(getPlayerView(second, 1))).toContain('"T0-48"');
    expect(JSON.stringify(getPlayerView(second, 1))).not.toContain('"T0-47"');

    const atStock = answer(second, { kind: 'CONFIRM', accept: true }).state;
    const decision = pending(atStock, 'SELECT_CARDS');
    expect(decision).toMatchObject({ prompt: 'TRIGGER_CHANCE_STOCK', min: 1, max: 1 });
    expect([...decision.cards].sort()).toEqual([oid(atStock, card(0, 48)), oid(atStock, card(0, 47))].sort());

    const { state } = answer(atStock, { kind: 'SELECT_CARDS', cards: [oid(atStock, card(0, 47))] });
    expect(state.zones[0].stock).toEqual([card(0, 47)]);
    expect(state.zones[0].hand).toEqual([card(0, 48)]);
    expect(state.instances.some((inst) => inst.revealed)).toBe(false);
  });

  it('T-TRG-012 / CR-3.2.3.1: chance may stop after one card, which then goes to the stock, or reveal none', () => {
    const first = triggerScenario(['CHANCE']).state;
    const second = answer(first, { kind: 'CONFIRM', accept: true }).state;
    const one = answer(second, { kind: 'CONFIRM', accept: false }).state;
    expect(one.zones[0].stock).toEqual([card(0, 48)]);
    expect(one.zones[0].hand).toEqual([]);

    const none = answer(first, { kind: 'CONFIRM', accept: false }).state;
    expect(none.zones[0].stock).toEqual([]);
    expect(none.zones[0].deck).toContain(card(0, 48));
  });

  it('T-TRG-013 / CR-4.14.2.13 and .13.1: discovery reveals up to three, may take one character, discards the rest; a refresh waits until it is done', () => {
    const makeCharacter: DefOverride = (p, i) => (p === 0 && i === 47 ? CHARACTER : undefined);
    let state = triggerScenario(['DISCOVERY'], (ctx) => keepTopOfDeck(ctx, 0, 4), makeCharacter).state;
    for (let i = 0; i < 3; i++) {
      expect(pending(state, 'CONFIRM').prompt).toBe('TRIGGER_DISCOVERY_REVEAL');
      state = answer(state, { kind: 'CONFIRM', accept: true }).state;
    }
    // All three remaining deck cards are revealed and still in the deck: no refresh yet.
    expect(state.zones[0].deck).toHaveLength(3);
    const decision = pending(state, 'SELECT_CARDS');
    expect(decision).toMatchObject({ prompt: 'TRIGGER_DISCOVERY', min: 0, max: 1 });
    // Only the character among the revealed cards can be taken.
    expect(decision.cards).toEqual([oid(state, card(0, 47))]);

    const result = answer(state, { kind: 'SELECT_CARDS', cards: decision.cards });
    const lines = trace(result.events);
    expect(lines.slice(0, 3).sort()).toEqual(['TRIGGER:deck>hand', 'TRIGGER:deck>waitingRoom', 'TRIGGER:deck>waitingRoom']);
    expect(lines.indexOf('REFRESH')).toBeGreaterThan(2);
    expect(result.state.zones[0].hand).toEqual([card(0, 47)]);
    // The two discarded cards were refreshed into the deck; one went to the clock.
    expect(result.state.zones[0].clock).toHaveLength(1);
    expect(result.state.zones[0].deck).toHaveLength(1);
    expect(result.state.zones[0].stock).toEqual([card(0, 49)]);
  });

  it('T-TRG-014 / CR-4.14.2.14: focus may return an event or a character of cost 0 from the waiting room to hand', () => {
    const kinds: DefOverride = (p, i) => (p === 0 && i === 1 ? EVENT : p === 0 && i === 3 ? { cost: 1 } : undefined);
    const atChoice = triggerScenario(['FOCUS'], (ctx) => {
      for (const i of [1, 2, 3, 46]) put(ctx, card(0, i), { player: 0, zone: 'waitingRoom' });
    }, kinds).state;
    const decision = pending(atChoice, 'SELECT_CARDS');
    expect(decision.prompt).toBe('TRIGGER_FOCUS');
    expect([...decision.cards].sort()).toEqual([oid(atChoice, card(0, 1)), oid(atChoice, card(0, 2))].sort());
  });
});

describe('counter step (CR-7.4)', () => {
  const defs: DefOverride = (p, i) => (p === 1 && i === 1 ? { ...EVENT, counter: true } : p === 1 && i === 2 ? EVENT : undefined);
  const arrange = (ctx: Ctx): void => {
    put(ctx, card(0, 0), stageSlot(0, 'FC'));
    put(ctx, card(1, 0), stageSlot(1, 'FC'));
    put(ctx, card(1, 1), { player: 1, zone: 'hand' });
    put(ctx, card(1, 2), { player: 1, zone: 'hand' });
    noClimaxes(ctx, 1);
  };

  it('T-ATK-013 / CR-7.4.1.2 and T-CARD-003 / CR-2.8.2: on a front attack the defending player may play one card with a counter icon', () => {
    const atCounter = declare(attackScenario(arrange, defs), card(0, 0), 'FRONT').state;
    const decision = pending(atCounter, 'COUNTER');
    expect(decision.player).toBe(1);
    // The event without a counter icon is not offered.
    expect(decision.cards).toEqual([oid(atCounter, card(1, 1))]);
    expect(getPlayerView(atCounter, 1).attack).toMatchObject({ player: 0, type: 'FRONT', attackerSlot: 'FC', defenderSlot: 'FC' });
    assertInvariants(atCounter, { settled: true });

    const { state, events } = answer(atCounter, { kind: 'COUNTER', card: decision.cards[0]! });
    expect(state.zones[1].waitingRoom).toContain(card(1, 1));
    expect(events.find((e) => e.type === 'CARD_PLAYED')).toMatchObject({ player: 1, cardKind: 'EVENT' });
    // CR-7.4.1.2.2: no second counter question followed.
    expect(state.pending?.kind).not.toBe('COUNTER');
  });

  it('T-ATK-013 / CR-7.3.1.3: there is no counter step on a side or direct attack', () => {
    const state = declare(attackScenario(arrange, defs), card(0, 0), 'SIDE').state;
    expect(state.pending?.kind).not.toBe('COUNTER');
    expect(state.zones[1].hand).toContain(card(1, 1));
  });
});

describe('damage (CR-4.12)', () => {
  it('T-DMG-002 / CR-4.12.1.2: a climax cancels the damage; every card turned over goes to the waiting room', () => {
    // Player 1's deck from the top: character 48, then climax 47.
    const defs: DefOverride = (p, i) => (p === 1 && (i === 48 || i === 49) ? { kind: 'CHARACTER', level: 0, cost: 0, power: 1000, soul: 1 } : p === 0 && i === 0 ? { soul: 2 } : undefined);
    const start = attackScenario((ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(1, 49), { player: 1, zone: 'memory' });
    }, defs);
    const { state, events } = declare(start, card(0, 0), 'DIRECT');
    expect(damageEvents(events)).toEqual(['CANCELLED']);
    expect(trace(events).filter((line) => line.startsWith('DAMAGE'))).toEqual([
      'DAMAGE:deck>resolution',
      'DAMAGE:deck>resolution',
      'DAMAGE_CANCEL:resolution>waitingRoom',
      'DAMAGE_CANCEL:resolution>waitingRoom',
    ]);
    expect(state.zones[1].waitingRoom).toEqual([card(1, 48), card(1, 47)]);
    expect(state.zones[1].clock).toEqual([]);
    expect(state.zones[1].resolution).toEqual([]);
  });

  it('T-ZONE-012 / CR-3.2.3.2: a deck that runs out during damage is refreshed, then the damage continues', () => {
    const start = attackScenario((ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      noClimaxes(ctx, 1);
      moveCards(ctx, [0, 1, 2, 3, 4].map((i) => card(1, i)), { player: 1, zone: 'waitingRoom' });
      keepTopOfDeck(ctx, 1, 1);
    });
    const { state, events } = declare(start, card(0, 0), 'DIRECT');
    const lines = trace(events).filter((line) => /DAMAGE|REFRESH/.test(line));
    expect(lines).toEqual([
      'DAMAGE:deck>resolution',
      ...Array(5).fill('REFRESH:waitingRoom>deck'),
      'REFRESH_PENALTY:deck>clock',
      'REFRESH',
      'DAMAGE:deck>resolution',
      'DAMAGE:resolution>clock',
      'DAMAGE:resolution>clock',
      'DAMAGE 2',
    ]);
    // The refresh card first, then the two damage cards on top of it. The
    // card already turned over (41) was not shuffled back into the deck.
    expect(state.zones[1].clock).toHaveLength(3);
    expect(state.zones[1].clock[1]).toBe(card(1, 41));
    // Five refreshed, minus the refresh card, the second damage card and the draw of player 1's next turn.
    expect(state.zones[1].deck).toHaveLength(2);
  });

  it('T-REF-002 / CR-9.2.2.1: running out of deck during damage with nothing to refresh loses the game immediately', () => {
    const start = attackScenario((ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      noClimaxes(ctx, 1);
      keepTopOfDeck(ctx, 1, 1);
    });
    const { state, events } = declare(start, card(0, 0), 'DIRECT');
    expect(state.result).toEqual({ outcome: 'WIN', winner: 0, loser: 1, reason: 'NO_CARDS' });
    // Immediately: the card never reached the clock and no check timing was needed.
    expect(trace(events).slice(-2)).toEqual(['DAMAGE:deck>resolution', 'GAME_ENDED']);
    expect(state.zones[1].clock).toEqual([]);
  });

  it('T-REF-002 / CR-9.2.2.1: not when the last card is a climax, which cancels the damage instead', () => {
    const start = attackScenario((ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      keepTopOfDeck(ctx, 1, 1);
    });
    const { state, events } = declare(start, card(0, 0), 'DIRECT');
    // No immediate loss when the climax was turned over: the damage was
    // cancelled and the cancelled card was refreshed into the deck and then
    // put into the clock.
    const lines = trace(events).filter((line) => /DAMAGE|CANCELLED|REFRESH|GAME_ENDED/.test(line));
    expect(lines).toEqual([
      'DAMAGE:deck>resolution',
      'DAMAGE_CANCEL:resolution>waitingRoom',
      'CANCELLED',
      'REFRESH:waitingRoom>deck',
      'REFRESH_PENALTY:deck>clock',
      'REFRESH',
      // Only now, at the next check timing, does the ordinary losing condition
      // apply: no card in the deck and none in the waiting room (CR-1.2.2.2).
      'GAME_ENDED',
    ]);
    expect(state.zones[1].clock).toEqual([card(1, 49)]);
    expect(state.result).toEqual({ outcome: 'WIN', winner: 0, loser: 1, reason: 'NO_CARDS' });
  });

  it('T-RA-001 / CR-9.1.2.1: a level up caused by damage interrupts the attack; T-TURN-012 / CR-6.8.1.4: the turn’s changes end with the turn', () => {
    const start = attackScenario((ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      noClimaxes(ctx, 1);
      for (let i = 0; i < 6; i++) put(ctx, card(1, i), { player: 1, zone: 'clock' });
    });
    const atLevelUp = declare(start, card(0, 0), 'DIRECT').state;
    const decision = pending(atLevelUp, 'LEVEL_UP');
    expect(decision.player).toBe(1);
    expect(atLevelUp.zones[1].clock).toHaveLength(8);
    // The attack is still going on, with its "this turn" soul bonus in place.
    expect(atLevelUp.attack).not.toBeNull();
    expect(atLevelUp.modifiers).toEqual([{ objectId: oid(atLevelUp, card(0, 0)), stat: 'SOUL', delta: 1 }]);

    const { state } = answer(atLevelUp, { kind: 'LEVEL_UP', card: decision.cards[0]! });
    expect(state.zones[1].level).toHaveLength(1);
    expect(state.zones[1].clock).toHaveLength(1);
    // T-TURN-012 / CR-6.8.1.4: once the turn is over the bonus is gone.
    expect(state.turn).toMatchObject({ player: 1 });
    expect(state.modifiers).toEqual([]);
    expect(state.attack).toBeNull();
  });
});

describe('battle step (CR-7.6) and encore step (CR-7.7)', () => {
  function battle(attackerPower: number, defenderPower: number, arrange: (ctx: Ctx) => void = () => {}): StepResult {
    const defs: DefOverride = (p, i) => (i !== 0 ? undefined : { power: p === 0 ? attackerPower : defenderPower });
    const start = attackScenario((ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(1, 0), stageSlot(1, 'FC'));
      noClimaxes(ctx, 1);
      arrange(ctx);
    }, defs);
    const atCounter = declare(start, card(0, 0), 'FRONT').state;
    return answer(atCounter, { kind: 'COUNTER', card: null });
  }

  it('T-ATK-017 / CR-7.6.1.2: the character with less power is reversed and leaves in the encore step', () => {
    const { state, events } = battle(2000, 1000);
    expect(trace(events)).toContain('STAND>REVERSE');
    // T-ATK-020 / CR-7.7.1.3: the reversed defender went to its owner's waiting room.
    expect(state.zones[1].stage.FC).toEqual([]);
    expect(state.zones[1].waitingRoom).toEqual([card(1, 0)]);
    expect(state.zones[0].stage.FC).toEqual([card(0, 0)]);
    // A front attack deals its damage as well (soul 1, no bonus).
    expect(damageEvents(events)).toEqual(['DAMAGE 1']);
  });

  it('T-ATK-017 / CR-7.6.1.2: with equal power both are reversed; T-ATK-021 / CR-7.7.1.3: the opponent’s reversed character leaves after the turn player’s', () => {
    const { state, events } = battle(1500, 1500);
    expect(trace(events).filter((line) => line.endsWith('>REVERSE'))).toEqual(['REST>REVERSE', 'STAND>REVERSE']);
    expect(state.zones[0].stage.FC).toEqual([]);
    expect(state.zones[1].stage.FC).toEqual([]);
    // CR-7.7.1.2 before CR-7.7.1.3: the turn player's character leaves first.
    const removed = events.flatMap((e) => (e.type === 'CARD_MOVED' && e.reason === 'ENCORE_STEP' ? [e.owner] : []));
    expect(removed).toEqual([0, 1]);
  });

  it('T-ATK-017 / CR-7.6.1.2: an attacker with less power is the one reversed', () => {
    const { state } = battle(500, 3000);
    expect(state.zones[0].stage.FC).toEqual([]);
    expect(state.zones[0].waitingRoom).toEqual([card(0, 0)]);
    expect(state.zones[1].stage.FC).toEqual([card(1, 0)]);
    expect(getInstance(state, card(1, 0)).orientation).toBe('STAND');
  });

  it('T-ATK-018 / CR-7.6.1.3 and T-ATK-008 / CR-7.2.1.5: a defender that left its slot is no longer the defender, so there is no battle; the damage is still dealt', () => {
    const defs: DefOverride = (p, i) => {
      if (p === 0 && i === 49) return { kind: 'CHARACTER', level: 0, cost: 0, power: 1000, soul: 1, triggers: ['RETURN'] };
      if (p === 1 && i === 0) return { power: 9000 };
      return undefined;
    };
    const start = attackScenario((ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FC'));
      put(ctx, card(1, 0), stageSlot(1, 'FC'));
      noClimaxes(ctx, 1);
    }, defs);
    const atTrigger = declare(start, card(0, 0), 'FRONT').state;
    const atCounter = answer(atTrigger, { kind: 'SELECT_CARDS', cards: [oid(atTrigger, card(1, 0))] }).state;
    // Still a front attack: the counter step happens.
    const { state, events } = answer(atCounter, { kind: 'COUNTER', card: null });
    expect(damageEvents(events)).toEqual(['DAMAGE 1']);
    expect(trace(events).some((line) => line.endsWith('>REVERSE'))).toBe(false);
    expect(state.zones[0].stage.FC).toEqual([card(0, 0)]);
  });

  it('T-ATK-020 / CR-7.7.1.2: with several reversed characters the player chooses which leaves first', () => {
    const defs: DefOverride = (p, i) => (p === 1 && i <= 1 ? { power: 9000 } : undefined);
    const start = attackScenario((ctx) => {
      put(ctx, card(0, 0), stageSlot(0, 'FL'));
      put(ctx, card(0, 1), stageSlot(0, 'FR'));
      put(ctx, card(1, 0), stageSlot(1, 'FR'));
      put(ctx, card(1, 1), stageSlot(1, 'FL'));
      noClimaxes(ctx, 1);
    }, defs);
    let state = declare(start, card(0, 0), 'FRONT').state;
    state = answer(state, { kind: 'COUNTER', card: null }).state;
    state = declare(state, card(0, 1), 'FRONT').state;
    state = answer(state, { kind: 'COUNTER', card: null }).state;

    const decision = pending(state, 'SELECT_CARDS');
    expect(decision).toMatchObject({ player: 0, prompt: 'ENCORE_STEP', min: 1, max: 1 });
    expect(decision.cards).toHaveLength(2);
    const after = answer(state, { kind: 'SELECT_CARDS', cards: [oid(state, card(0, 1))] });
    expect(after.state.zones[0].waitingRoom).toEqual([card(0, 1), card(0, 0)]);
  });

  const withStock = (player: PlayerId, count: number) => (ctx: Ctx): void => {
    for (let i = 0; i < count; i++) put(ctx, card(player, 20 + i), { player, zone: 'stock' });
  };

  it('T-KW-002 / CR-10.2.2 and T-KW-003 / CR-10.2.3: every character has encore [3]: pay three stock to return it to its slot, rested', () => {
    // Two stock plus the one from the trigger check make three.
    const atEncore = battle(500, 3000, withStock(0, 2)).state;
    const decision = pending(atEncore, 'CONFIRM');
    expect(decision).toMatchObject({ player: 0, prompt: 'ENCORE', card: oid(atEncore, card(0, 0)) });
    expect(atEncore.zones[0].waitingRoom).toEqual([card(0, 0)]);

    const { state, events } = answer(atEncore, { kind: 'CONFIRM', accept: true });
    expect(state.zones[0].stage.FC).toEqual([card(0, 0)]);
    expect(getInstance(state, card(0, 0)).orientation).toBe('REST');
    expect(state.zones[0].stock).toEqual([]);
    // T-COST-004: paid from the top of the stock down.
    expect(state.zones[0].waitingRoom).toEqual([card(0, 49), card(0, 21), card(0, 20)]);
    expect(trace(events).slice(0, 4)).toEqual(['COST:stock>waitingRoom', 'COST:stock>waitingRoom', 'COST:stock>waitingRoom', 'ENCORE:waitingRoom>stage']);
  });

  it('T-KW-002: declining encore leaves the character in the waiting room and the stock untouched', () => {
    const atEncore = battle(500, 3000, withStock(0, 2)).state;
    const { state } = answer(atEncore, { kind: 'CONFIRM', accept: false });
    expect(state.zones[0].stage.FC).toEqual([]);
    expect(state.zones[0].stock).toHaveLength(3);
  });

  it('T-COST-002 / CR-8.4.2.2: with fewer than three stock encore cannot be paid and is not offered', () => {
    const { state } = battle(500, 3000, withStock(0, 1));
    expect(state.pending?.kind).not.toBe('CONFIRM');
    expect(state.zones[0].waitingRoom).toEqual([card(0, 0)]);
    expect(state.zones[0].stock).toHaveLength(2);
  });

  it('T-KW-003: the defending player’s characters have encore too', () => {
    const atEncore = battle(3000, 500, withStock(1, 3)).state;
    expect(pending(atEncore, 'CONFIRM')).toMatchObject({ player: 1, prompt: 'ENCORE' });
    const { state, events } = answer(atEncore, { kind: 'CONFIRM', accept: true });
    expect(state.zones[1].stage.FC).toEqual([card(1, 0)]);
    // It came back rested. (By now player 1's own stand phase has stood it up again.)
    const back = events.find((e) => e.type === 'CARD_MOVED' && e.reason === 'ENCORE');
    expect(back).toMatchObject({ orientation: 'REST', to: { player: 1, zone: 'stage', slot: 'FC' } });
  });
});

describe('automatic abilities waiting at a check timing (CR-8.5.1, CR-8.7)', () => {
  it('T-AUTO-002 / CR-8.7.3.1: with several of their abilities waiting, the player chooses which to play first', () => {
    // Two characters arrive in one slot simultaneously: both are removed (CR-9.6.2.1), both have encore.
    const start = scenario({ step: 'MAIN_START' }, (ctx) => {
      moveCards(ctx, [card(0, 0), card(0, 1)], stageSlot(0, 'FC'));
      for (let i = 0; i < 3; i++) put(ctx, card(0, 20 + i), { player: 0, zone: 'stock' });
    }).state;
    const decision = pending(start, 'CHOOSE_ABILITY');
    expect(decision.player).toBe(0);
    expect(decision.abilities.map((a) => a.type)).toEqual(['ENCORE', 'ENCORE']);
    expect(decision.abilities.map((a) => a.card).sort()).toEqual([oid(start, card(0, 0)), oid(start, card(0, 1))].sort());

    const second = decision.abilities.find((a) => a.card === oid(start, card(0, 1)))!;
    const atConfirm = answer(start, { kind: 'CHOOSE_ABILITY', id: second.id }).state;
    expect(pending(atConfirm, 'CONFIRM')).toMatchObject({ prompt: 'ENCORE', card: oid(start, card(0, 1)) });

    const { state } = answer(atConfirm, { kind: 'CONFIRM', accept: true });
    // The chosen one came back; the other encore could no longer be paid and was not offered.
    expect(state.zones[0].stage.FC).toEqual([card(0, 1)]);
    expect(state.zones[0].stock).toEqual([]);
    expect(pending(state, 'MAIN').player).toBe(0);
    assertInvariants(state, { settled: true });
  });

  it('CR-10.2.2: encore also triggers for a character replaced by a newly played one, which it then displaces', () => {
    const start = scenario({ step: 'MAIN_START' }, (ctx) => {
      put(ctx, card(0, 0), { player: 0, zone: 'hand' });
      put(ctx, card(0, 5), stageSlot(0, 'FC'));
      for (let i = 0; i < 3; i++) put(ctx, card(0, 20 + i), { player: 0, zone: 'stock' });
    }).state;
    const atEncore = answer(start, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(start, card(0, 0)), slot: 'FC' } }).state;
    expect(pending(atEncore, 'CONFIRM')).toMatchObject({ prompt: 'ENCORE', card: oid(atEncore, card(0, 5)) });

    const { state } = answer(atEncore, { kind: 'CONFIRM', accept: true });
    // The old character returned to the slot last, so the new one is removed (CR-9.6.2).
    expect(state.zones[0].stage.FC).toEqual([card(0, 5)]);
    expect(state.zones[0].waitingRoom).toContain(card(0, 0));
    expect(pending(state, 'MAIN').player).toBe(0);
  });
});
