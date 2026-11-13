/**
 * Sentence patterns (src/patterns.ts): cards whose ability data was
 * generated from the official text.
 *
 *  1. Cross-check: a hand-verified card whose whole text is covered by
 *     patterns must compile to exactly its hand-written ability data.
 *  2. Every pattern is run in the engine on every card it produced. Each
 *     ability is tested alone (the card's other abilities removed), so one
 *     ability cannot hide a mistake in another.
 */

import { describe, expect, it } from 'vitest';
import {
  type Ability,
  type CardDef,
  type Ctx,
  type GameState,
  type MoveOptions,
  type PlayerId,
  type SlotId,
  type TurnStep,
  type ZoneRef,
  advance,
  backup,
  createCtx,
  createInitialState,
  encore,
  getInstance,
  getPower,
  getSoul,
  moveCard,
  stageSlot,
} from '@wso/game-engine';
import { PATTERN_IDS, allCards, compileText, defsFor, getCard, ruleLines } from '../src/index';
import { answer, oid, pending } from './helpers';

/** A level 0 character without text and without any trait used by the new sets. */
const FILLER = 'SY/W08-T01';

type Take = (cardId: string, to: ZoneRef, opts?: MoveOptions) => number;

/** A position where player 0's deck holds four copies of the given cards. `ability`: the card keeps only this one ability. */
function position(
  cardId: string,
  ability: Ability | null,
  others: string[],
  arrange: (take: Take, ctx: Ctx) => void,
  step: TurnStep = 'MAIN_START',
  turnPlayer: PlayerId = 0,
): GameState {
  const mine = [...[cardId, ...others].flatMap((c) => [c, c, c, c]), ...Array<string>(50).fill(FILLER)].slice(0, 50);
  const theirs = Array<string>(50).fill(FILLER);
  const defs: Record<string, CardDef> = defsFor(new Set([...mine, ...theirs]));
  if (ability) defs[cardId] = { ...defs[cardId]!, abilities: [ability] };
  const state = createInitialState({ defs, decks: [mine, theirs] }, 'pattern-tests');
  const ctx = createCtx(state);
  const take: Take = (id, to, opts) => {
    const instance = state.zones[0].deck.find((i) => getInstance(state, i).cardId === id);
    if (instance === undefined) throw new Error(`no copy of ${id} left`);
    moveCard(ctx, instance, to, opts);
    return instance;
  };
  arrange(take, ctx);
  state.firstPlayer = 0;
  state.turn = { number: 3, player: turnPlayer, phase: 'STAND', attackCount: 0 };
  state.stack = [{ kind: 'TURN', step }];
  return advance(state).state;
}

const at = (state: GameState, slot: SlotId): number => state.zones[0].stage[slot][0]!;
const printed = (cardId: string) => getCard(cardId).def;

/** A character with the trait and no abilities of its own in the engine, other than `not`. */
function partnerWith(traitName: string, not: string): string {
  const found = allCards().find((c) => c.def.kind === 'CHARACTER' && c.def.traits.includes(traitName) && c.record.cardId !== not && !c.def.abilities);
  if (!found) throw new Error(`no plain character with 《${traitName}》`);
  return found.record.cardId;
}

/** Puts the card where it can be played from hand: enough level cards of its colour and enough stock. */
function readyToPlay(take: Take, cardId: string): void {
  const def = printed(cardId);
  take(cardId, { player: 0, zone: 'hand' });
  for (let i = 0; i < (def.level ?? 0); i++) take(cardId, { player: 0, zone: 'level' });
  for (let i = 0; i < (def.cost ?? 0); i++) take(FILLER, { player: 0, zone: 'stock' });
}

function play(state: GameState, cardId: string, slot: SlotId): GameState {
  const hand = state.zones[0].hand.find((i) => getInstance(state, i).cardId === cardId)!;
  return answer(state, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(state, hand), slot } }).state;
}

/** The numbers and traits of an official line, read independently of the pattern that compiled it. */
const numbers = (line: string): number[] => (line.match(/\d+/g) ?? []).map(Number);
const traitsIn = (line: string): string[] => [...line.matchAll(/《([^》]+)》/g)].map((m) => m[1]!);
const last = (list: number[]): number => list[list.length - 1]!;
const inYourTurnOnly = (line: string): boolean => line.startsWith('【永】 あなたのターン中、');

/** A character the engine gives no abilities, matching `pred`. */
function plain(pred: (def: CardDef) => boolean, not = ''): string {
  const found = allCards().find((c) => c.def.kind === 'CHARACTER' && !c.def.abilities && c.record.cardId !== not && pred(c.def));
  if (!found) throw new Error('no plain character for this check');
  return found.record.cardId;
}

/** The climax in hand, playable (its colour in the clock), with three plain characters on stage. Returns the state after it is played. */
function playClimax(cardId: string, ability: Ability, others: string[], waitingRoom: string[]): GameState {
  const start = position(
    cardId,
    ability,
    others,
    (take) => {
      take(cardId, { player: 0, zone: 'hand' });
      take(cardId, { player: 0, zone: 'clock' });
      for (const slot of ['FL', 'FC', 'FR'] as const) take(FILLER, stageSlot(0, slot));
      for (const id of waitingRoom) take(id, { player: 0, zone: 'waitingRoom' });
    },
    'CLIMAX_START',
  );
  const climax = start.zones[0].hand.find((i) => getInstance(start, i).cardId === cardId)!;
  return answer(start, { kind: 'CLIMAX', card: oid(start, climax) }).state;
}

const souls = (state: GameState): number[] => (['FL', 'FC', 'FR'] as const).map((slot) => getSoul(state, at(state, slot)));
const cardIdOf = (state: GameState, objectId: number): string => state.instances.find((i) => i.objectId === objectId)!.cardId;

/** One engine check per pattern. `line` is the official sentence the ability came from; expectations are read from it. */
const CHECKS: Record<string, (cardId: string, ability: Ability, line: string) => void> = {
  CLIMAX_POWER_SOUL: (cardId, ability, line) => {
    const state = position(cardId, ability, [], (take) => {
      take(cardId, { player: 0, zone: 'climax' });
      take(FILLER, stageSlot(0, 'FC'));
    });
    const [power, soul] = numbers(line);
    expect([getPower(state, at(state, 'FC')), getSoul(state, at(state, 'FC'))]).toEqual([printed(FILLER).power! + power!, printed(FILLER).soul! + soul!]);
  },
  CLIMAX_SOUL: (cardId, ability, line) => {
    const state = position(cardId, ability, [], (take) => {
      take(cardId, { player: 0, zone: 'climax' });
      take(FILLER, stageSlot(0, 'FC'));
    });
    expect([getPower(state, at(state, 'FC')), getSoul(state, at(state, 'FC'))]).toEqual([printed(FILLER).power!, printed(FILLER).soul! + numbers(line)[0]!]);
  },
  ASSIST: (cardId, ability, line) => {
    const back = position(cardId, ability, [], (take) => {
      take(cardId, stageSlot(0, 'BL'));
      take(FILLER, stageSlot(0, 'FL'));
    });
    expect(getPower(back, at(back, 'FL'))).toBe(printed(FILLER).power! + numbers(line)[0]!);
    // Not from the front row.
    const front = position(cardId, ability, [], (take) => {
      take(cardId, stageSlot(0, 'FC'));
      take(FILLER, stageSlot(0, 'FL'));
    });
    expect(getPower(front, at(front, 'FL'))).toBe(printed(FILLER).power!);
  },
  YOUR_TURN_POWER: (cardId, ability, line) => {
    const on = (turnPlayer: PlayerId) => {
      const state = position(cardId, ability, [], (take) => take(cardId, stageSlot(0, 'FC')), 'MAIN_START', turnPlayer);
      return getPower(state, at(state, 'FC'));
    };
    expect([on(0), on(1)]).toEqual([printed(cardId).power! + numbers(line)[0]!, printed(cardId).power!]);
  },
  OPPONENT_TURN_POWER: (cardId, ability, line) => {
    const on = (turnPlayer: PlayerId) => {
      const state = position(cardId, ability, [], (take) => take(cardId, stageSlot(0, 'FC')), 'MAIN_START', turnPlayer);
      return getPower(state, at(state, 'FC'));
    };
    expect([on(0), on(1)]).toEqual([printed(cardId).power!, printed(cardId).power! + numbers(line)[0]!]);
  },
  EXPERIENCE_POWER: (cardId, ability, line) => {
    const [min, amount] = numbers(line) as [number, number];
    const high = plain((def) => def.level === 3);
    const withLevels = (count: number) => {
      const state = position(cardId, ability, [high], (take) => {
        take(cardId, stageSlot(0, 'FC'));
        for (let i = 0; i < count; i++) take(high, { player: 0, zone: 'level' });
      });
      return getPower(state, at(state, 'FC'));
    };
    const enough = Math.ceil(min / 3);
    expect(withLevels(enough)).toBe(printed(cardId).power! + amount);
    expect(withLevels(enough - 1)).toBe(printed(cardId).power!);
  },
  ENCORE_DISCARD_CHARACTER: (_cardId, ability) => {
    expect(ability).toEqual(encore([{ pay: 'DISCARD', count: 1, filter: { kind: 'CHARACTER' } }]));
  },
  BACKUP: (cardId, ability, line) => {
    const m = /助太刀(\d+) レベル(\d) ［(?:\((\d)\) )?/.exec(line)!;
    expect(ability).toEqual(backup(Number(m[1]), Number(m[2]), [...(m[3] ? [{ pay: 'STOCK' as const, count: Number(m[3]) }] : []), { pay: 'SELF_TO_WAITING_ROOM' as const }]));
    expect(printed(cardId).counter).toBe(true);
  },
  POWER_WITH_OTHER_TRAIT: (cardId, ability, line) => {
    const min = line.includes('いるなら') ? 1 : numbers(line)[0]!;
    const amount = last(numbers(line));
    const partner = partnerWith(traitsIn(line)[0]!, cardId);
    const slots: SlotId[] = ['FL', 'FR', 'BL', 'BR'];
    expect(min).toBeLessThanOrEqual(4);
    const power = (partners: number, turnPlayer: PlayerId = 0) => {
      const state = position(
        cardId,
        ability,
        [partner],
        (take) => {
          take(cardId, stageSlot(0, 'FC'));
          for (let i = 0; i < partners; i++) take(partner, stageSlot(0, slots[i]!));
          // A character without the trait does not count.
          if (partners < 4) take(FILLER, stageSlot(0, slots[partners]!));
        },
        'MAIN_START',
        turnPlayer,
      );
      return getPower(state, at(state, 'FC'));
    };
    const base = printed(cardId).power!;
    expect(power(min)).toBe(base + amount);
    expect(power(min - 1)).toBe(base);
    expect(power(min, 1)).toBe(inYourTurnOnly(line) ? base : base + amount);
  },
  POWER_ALL_TRAIT: (cardId, ability, line) => {
    const traitName = traitsIn(line)[0]!;
    const partner = partnerWith(traitName, cardId);
    // The card itself is one of "all your characters".
    const bonus = printed(cardId).traits.includes(traitName) ? last(numbers(line)) : 0;
    const power = (withOutsider: boolean, turnPlayer: PlayerId = 0) => {
      const state = position(
        cardId,
        ability,
        [partner],
        (take) => {
          take(cardId, stageSlot(0, 'FC'));
          take(partner, stageSlot(0, 'FL'));
          if (withOutsider) take(FILLER, stageSlot(0, 'FR'));
        },
        'MAIN_START',
        turnPlayer,
      );
      return getPower(state, at(state, 'FC'));
    };
    const base = printed(cardId).power!;
    expect(power(false)).toBe(base + bonus);
    expect(power(true)).toBe(base);
    expect(power(false, 1)).toBe(inYourTurnOnly(line) ? base : base + bonus);
  },
  POWER_PER_OTHER_TRAIT: (cardId, ability, line) => {
    const partner = partnerWith(traitsIn(line)[0]!, cardId);
    const amount = last(numbers(line));
    const power = (partners: number) => {
      const state = position(cardId, ability, [partner], (take) => {
        take(cardId, stageSlot(0, 'FC'));
        for (let i = 0; i < partners; i++) take(partner, stageSlot(0, (['FL', 'FR', 'BL'] as const)[i]!));
        take(FILLER, stageSlot(0, 'BR'));
      });
      return getPower(state, at(state, 'FC'));
    };
    const base = printed(cardId).power!;
    expect([power(0), power(1), power(3)]).toEqual([base, base + amount, base + 3 * amount]);
  },
  YOUR_TURN_OTHERS_TRAIT_POWER: (cardId, ability, line) => {
    const partner = partnerWith(traitsIn(line)[0]!, cardId);
    const amount = last(numbers(line));
    const powers = (turnPlayer: PlayerId) => {
      const state = position(
        cardId,
        ability,
        [partner],
        (take) => {
          take(cardId, stageSlot(0, 'BL'));
          take(partner, stageSlot(0, 'FL'));
          take(FILLER, stageSlot(0, 'FR'));
        },
        'MAIN_START',
        turnPlayer,
      );
      return [getPower(state, at(state, 'FL')), getPower(state, at(state, 'FR')), getPower(state, at(state, 'BL'))];
    };
    // The other character with the trait, in your turn only; not this card itself, not a character without the trait.
    expect(powers(0)).toEqual([printed(partner).power! + amount, printed(FILLER).power!, printed(cardId).power!]);
    expect(powers(1)).toEqual([printed(partner).power!, printed(FILLER).power!, printed(cardId).power!]);
  },
  CX_PHASE_TRAIT_BOOST: (cardId, ability, line) => {
    const traitName = traitsIn(line)[0]!;
    const partner = partnerWith(traitName, cardId);
    const start = position(
      cardId,
      ability,
      [partner],
      (take) => {
        take(cardId, stageSlot(0, 'BL'));
        take(partner, stageSlot(0, 'FL'));
        take(FILLER, stageSlot(0, 'FR'));
      },
      'CLIMAX_START',
    );
    const choose = pending(start, 'SELECT_CARDS');
    const expected = [oid(start, at(start, 'FL')), ...(printed(cardId).traits.includes(traitName) ? [oid(start, at(start, 'BL'))] : [])];
    expect([...choose.cards].sort()).toEqual(expected.sort());
    const after = answer(start, { kind: 'SELECT_CARDS', cards: [oid(start, at(start, 'FL'))] }).state;
    expect(getPower(after, at(after, 'FL'))).toBe(printed(partner).power! + last(numbers(line)));
  },
  PLACED_SELF_POWER: (cardId, ability, line) => {
    const traitName = traitsIn(line)[0];
    const partner = traitName ? partnerWith(traitName, cardId) : null;
    const played = (withPartner: boolean) => {
      const start = position(cardId, ability, partner ? [partner] : [], (take) => {
        readyToPlay(take, cardId);
        take(partner && withPartner ? partner : FILLER, stageSlot(0, 'FL'));
      });
      const state = play(start, cardId, 'FC');
      return getPower(state, at(state, 'FC'));
    };
    const base = printed(cardId).power!;
    expect(played(true)).toBe(base + last(numbers(line)));
    if (partner) expect(played(false)).toBe(base);
  },
  ATTACK_SELF_POWER_WITH_OTHER_TRAIT: (cardId, ability, line) => {
    const partner = partnerWith(traitsIn(line)[0]!, cardId);
    const attack = (withPartner: boolean) => {
      const start = position(
        cardId,
        ability,
        [partner],
        (take) => {
          take(cardId, stageSlot(0, 'FC'));
          take(withPartner ? partner : FILLER, stageSlot(0, 'BL'));
          take(FILLER, stageSlot(0, 'FL')); // a second attacker keeps the turn going
        },
        'ATTACK_START',
      );
      const state = answer(start, { kind: 'ATTACK', attack: { attacker: oid(start, at(start, 'FC')), type: 'DIRECT' } }).state;
      return getPower(state, at(state, 'FC'));
    };
    const base = printed(cardId).power!;
    expect([attack(true), attack(false)]).toEqual([base + last(numbers(line)), base]);
  },
  PLACED_TRAIT_COUNT_TO_STOCK: (cardId, ability, line) => {
    const min = numbers(line)[0]!;
    expect(min).toBeLessThanOrEqual(4);
    const [conditionTrait, prizeTrait] = traitsIn(line) as [string, string];
    const partner = partnerWith(conditionTrait, cardId);
    const prize = partnerWith(prizeTrait, cardId);
    const slots: SlotId[] = ['FL', 'FR', 'BL', 'BR'];
    const played = (partners: number) => {
      const start = position(cardId, ability, [partner, prize], (take) => {
        readyToPlay(take, cardId);
        for (let i = 0; i < partners; i++) take(partner, stageSlot(0, slots[i]!));
        take(prize, { player: 0, zone: 'waitingRoom' });
        take(FILLER, { player: 0, zone: 'waitingRoom' });
      });
      return play(start, cardId, 'FC');
    };
    const asked = played(min);
    expect(pending(asked, 'CONFIRM')).toMatchObject({ prompt: 'USE_ABILITY' });
    const atChoose = answer(asked, { kind: 'CONFIRM', accept: true }).state;
    const choose = pending(atChoose, 'SELECT_CARDS');
    // Only characters with the trait may be chosen, not the plain filler.
    expect(choose.cards.every((o) => printed(cardIdOf(atChoose, o)).traits.includes(prizeTrait))).toBe(true);
    const stock = atChoose.zones[0].stock.length;
    const after = answer(atChoose, { kind: 'SELECT_CARDS', cards: [choose.cards[0]!] }).state;
    expect(after.zones[0].stock).toHaveLength(stock + 1);
    expect(played(min - 1).pending?.kind).toBe('MAIN');
  },
  CX_DRAW_UP_TO_ONE_CHOOSE_SOUL: (cardId, ability, line) => {
    const [, upTo, amount] = numbers(line) as [number, number, number];
    const base = printed(FILLER).soul!;
    // Declining the draw draws nothing; the characters are still chosen.
    for (const draw of [true, false]) {
      const atDraw = playClimax(cardId, ability, [], []);
      const hand = atDraw.zones[0].hand.length;
      expect(pending(atDraw, 'CONFIRM')).toBeTruthy();
      const atChoose = answer(atDraw, { kind: 'CONFIRM', accept: draw }).state;
      expect(atChoose.zones[0].hand).toHaveLength(hand + (draw ? 1 : 0));
      const choose = pending(atChoose, 'SELECT_CARDS');
      expect(choose).toMatchObject({ min: 0, max: upTo });
      const chosen = (['FL', 'FC', 'FR'] as const).slice(0, upTo).map((slot) => oid(atChoose, at(atChoose, slot)));
      const after = answer(atChoose, { kind: 'SELECT_CARDS', cards: chosen }).state;
      expect(souls(after)).toEqual([0, 1, 2].map((i) => base + (i < upTo ? amount : 0)));
    }
  },
  CX_WAITING_ROOM_TO_STOCK_ALL_SOUL: (cardId, ability, line) => {
    const [maxLevel, , amount] = numbers(line) as [number, number, number];
    const low = plain((def) => (def.level ?? 0) <= maxLevel, FILLER);
    const high = plain((def) => (def.level ?? 0) > maxLevel);
    const atChoose = playClimax(cardId, ability, [low, high], [low, high]);
    const choose = pending(atChoose, 'SELECT_CARDS');
    expect(choose).toMatchObject({ min: 0, max: 1 });
    expect(choose.cards.map((o) => cardIdOf(atChoose, o))).toEqual([low]);
    const stock = atChoose.zones[0].stock.length;
    const after = answer(atChoose, { kind: 'SELECT_CARDS', cards: choose.cards }).state;
    expect(after.zones[0].stock).toHaveLength(stock + 1);
    expect(souls(after)).toEqual([0, 1, 2].map(() => printed(FILLER).soul! + amount));
    // Choosing nothing is allowed ("up to one"); the soul bonus still happens.
    const none = answer(atChoose, { kind: 'SELECT_CARDS', cards: [] }).state;
    expect(none.zones[0].stock).toHaveLength(stock);
    expect(souls(none)).toEqual([0, 1, 2].map(() => printed(FILLER).soul! + amount));
  },
  CX_SOUL_TRIGGER_TO_HAND_CHOOSE_SOUL: (cardId, ability, line) => {
    const [, upTo, amount] = numbers(line) as [number, number, number];
    const withSoul = plain((def) => def.triggers.includes('SOUL'));
    const without = plain((def) => !def.triggers.includes('SOUL'), FILLER);
    const atReturn = playClimax(cardId, ability, [withSoul, without], [withSoul, without]);
    const first = pending(atReturn, 'SELECT_CARDS');
    expect(first).toMatchObject({ min: 0, max: 1 });
    expect(first.cards.map((o) => cardIdOf(atReturn, o))).toEqual([withSoul]);
    const atChoose = answer(atReturn, { kind: 'SELECT_CARDS', cards: first.cards }).state;
    expect(atChoose.zones[0].hand.map((i) => getInstance(atChoose, i).cardId)).toContain(withSoul);
    const second = pending(atChoose, 'SELECT_CARDS');
    expect(second).toMatchObject({ min: 0, max: upTo });
    const chosen = (['FL', 'FC', 'FR'] as const).slice(0, upTo).map((slot) => oid(atChoose, at(atChoose, slot)));
    const after = answer(atChoose, { kind: 'SELECT_CARDS', cards: chosen }).state;
    expect(souls(after)).toEqual([0, 1, 2].map((i) => printed(FILLER).soul! + (i < upTo ? amount : 0)));
  },
};

const handVerified = allCards().filter((c) => !c.record.origin && c.record.support === 'verified');
const patternCards = allCards().filter((c) => c.record.origin === 'PATTERN');

describe('sentence patterns', () => {
  it('a hand-verified card fully covered by patterns compiles to exactly its hand-written ability data', () => {
    const checked: string[] = [];
    for (const card of handVerified) {
      const compiled = compileText(card.official);
      if (!compiled) continue;
      expect(card.record.effect, card.record.cardId).toBeUndefined();
      expect(compiled.abilities ?? [], card.record.cardId).toEqual(card.record.abilities ?? []);
      checked.push(card.record.cardId);
    }
    // Vanilla cards, standard climaxes, assists, turn bonuses, encores and backups of the hand-verified sets.
    expect(checked.length).toBeGreaterThanOrEqual(20);
  });

  it('events are never compiled, and a card with one unknown line is not compiled at all', () => {
    for (const card of allCards()) {
      if (card.record.origin !== 'PATTERN') continue;
      expect(card.def.kind, card.record.cardId).not.toBe('EVENT');
      expect(card.record.patterns!.length, card.record.cardId).toBe(card.def.abilities?.length ?? 0);
    }
    const mixed = { ...getCard('SAO/S20-015').official, text: '【永】 あなたのターン中、このカードのパワーを＋1000。<br>【自】 このカードは踊る。' };
    expect(compileText(mixed)).toBeNull();
  });

  it('every pattern has an engine check here', () => {
    expect(Object.keys(CHECKS).sort()).toEqual([...PATTERN_IDS].sort());
  });

  it('a card without text has no abilities', () => {
    for (const card of patternCards.filter((c) => c.record.patterns!.length === 0)) expect(card.def.abilities, card.record.cardId).toBeUndefined();
  });

  for (const id of PATTERN_IDS) {
    const cards = patternCards.filter((c) => c.record.patterns!.includes(id));
    it(`${id}: runs correctly in the engine on each of its ${cards.length} card(s)`, () => {
      for (const card of cards) {
        card.record.patterns!.forEach((pattern, index) => {
          if (pattern !== id) return;
          try {
            CHECKS[id]!(card.record.cardId, card.def.abilities![index]!, ruleLines(card.official)[index]!);
          } catch (error) {
            throw new Error(`${card.record.cardId} ability ${index}: ${error instanceof Error ? error.message : String(error)}`);
          }
        });
      }
    });
  }
});
