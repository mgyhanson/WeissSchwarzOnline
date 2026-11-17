/**
 * Tests for the cards of batch 11, with the real card data: ANM/W138-087 (this card and 「“カレイドワールド”愛乃」
 * of memory change places, and change back at the start of the encore step) and ANM/W138-079 (from memory, it
 * changes places with a character whose name contains 愛乃; looking at the opponent's deck with one card put to
 * its bottom). Both players have every card of the booster, three copies each.
 */

import { describe, expect, it } from 'vitest';
import { type Choice, type Ctx, type Decision, type GameEvent, type GameState, type PlayerId, type SlotId, getInstance, getPlayerView, stageSlot } from '@wso/game-engine';
import { getCard } from '../src/index';
import { readLine } from '../src/grammar';
import { answer, oid, pending, scenario, stackTop, take } from './helpers';
import type { RealScenario } from './helpers';

const ANM = (n: number): string => `ANM/W138-${String(n).padStart(3, '0')}`;
/** Cards used only as bodies (printed numbers, traits and icons, no abilities). */
const BODIES = [ANM(5), ANM(9), ANM(16), ANM(2), ANM(10), ANM(13), ANM(81), ANM(86)];
interface Run {
  state: GameState;
  events: GameEvent[];
}
const game = (options: Omit<RealScenario, 'sets'>, arrange: (ctx: Ctx) => void = () => {}): Run => {
  const start = scenario({ ...options, sets: ['ANM_W138:ALL', 'ANM_W138:ALL'], plain: BODIES }, arrange);
  return { state: start.state, events: [...start.events] };
};
const then = (run: Run, choice: Choice): Run => {
  const result = answer(run.state, choice);
  return { state: result.state, events: [...run.events, ...result.events] };
};
const at = (state: GameState, player: PlayerId, slot: SlotId): number => state.zones[player].stage[slot][0]!;
const names = (state: GameState, ids: readonly number[]): string[] => ids.map((i) => getInstance(state, i).cardId);
const cardOf = (state: GameState, objectId: number): string => state.instances.find((i) => i.objectId === objectId)!.cardId;
const offered = (run: Run): string[] => pending(run.state, 'SELECT_CARDS').cards.map((o) => cardOf(run.state, o)).sort();
const pick = (run: Run, cardIds: string[]): Run => {
  const decision = pending(run.state, 'SELECT_CARDS');
  const left = [...decision.cards];
  const chosen = cardIds.map((cardId) => {
    const k = left.findIndex((o) => cardOf(run.state, o) === cardId);
    if (k < 0) throw new Error(`${cardId} cannot be chosen; offered: ${[...new Set(offered(run))].join(', ')}`);
    return left.splice(k, 1)[0]!;
  });
  return then(run, { kind: 'SELECT_CARDS', cards: chosen });
};
const accept = (run: Run): Run => then(run, { kind: 'CONFIRM', accept: true });
const decline = (run: Run): Run => then(run, { kind: 'CONFIRM', accept: false });
const asks = (run: Run, kind: Decision['kind'], prompt?: string): boolean =>
  run.state.pending?.kind === kind && (prompt === undefined || (run.state.pending as { prompt?: string }).prompt === prompt);
const inHand = (state: GameState, cardId: string): number => state.zones[0].hand.find((i) => getInstance(state, i).cardId === cardId)!;
const playCharacter = (run: Run, cardId: string, to: SlotId): Run =>
  then(run, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(run.state, inHand(run.state, cardId)), slot: to } });
const paid = (run: Run): string[] => run.events.flatMap((e) => (e.type === 'CARD_MOVED' && e.reason === 'COST' ? [`${e.from.zone}>${e.to.zone}`] : []));
const played = (run: Run, cardId: string): number => run.events.filter((e) => e.type === 'ABILITY_PLAYED' && getInstance(run.state, e.instanceId).cardId === cardId).length;
const printed = (cardId: string) => getCard(cardId).def;
const ability = (cardId: string, index: number) => printed(cardId).abilities![index];
const zone = (player: PlayerId, name: 'waitingRoom' | 'hand' | 'stock' | 'level' | 'clock' | 'memory' | 'climax') => ({ player, zone: name }) as const;
const zoneCards = (state: GameState, player: PlayerId, name: 'waitingRoom' | 'hand' | 'stock' | 'memory'): string[] => names(state, state.zones[player][name]).sort();
/** Nothing is done at every decision, until `stop` holds. */
const routine = (d: Decision): Choice =>
  d.kind === 'CHOOSE_ABILITY' ? { kind: 'CHOOSE_ABILITY', id: d.abilities[0]!.id }
    : d.kind === 'MAIN' ? { kind: 'MAIN', action: { type: 'PASS' } }
    : d.kind === 'CLIMAX' ? { kind: 'CLIMAX', card: null }
    : d.kind === 'ATTACK' ? { kind: 'ATTACK', attack: null }
    : d.kind === 'CLOCK' ? { kind: 'CLOCK', card: null }
    : d.kind === 'COUNTER' ? { kind: 'COUNTER', card: null }
    : d.kind === 'HAND_LIMIT' ? { kind: 'HAND_LIMIT', discard: d.cards.slice(0, d.count) }
    : { kind: 'CONFIRM', accept: false };
const until = (from: Run, stop: (state: GameState) => boolean): Run => {
  let current = from;
  for (let k = 0; k < 120 && !stop(current.state); k++) current = then(current, routine(current.state.pending!));
  if (!stop(current.state)) throw new Error('The position waited for was not reached');
  return current;
};

const TEXT = {
  anm087: '【自】 記憶 ［このカードを【レスト】する］ あなたのアタックフェイズの始めに、あなたのCX置場にCXがあり、前列にこのカードがいるなら、あなたはコストを払ってよい。そうしたら、あなたは自分の思い出置場の「“カレイドワールド”愛乃」を1枚とこのカードを選び、入れ替え、アンコールステップの始めに、それらのキャラを入れ替える。',
  anm079b: '【自】【CXコンボ】 このカードがアタックした時、CX置場に「長い冒険と夢の終わり」があり、他のあなたの《風》のキャラが4枚以上なら、あなたは相手の山札を上から4枚まで見て、カードを1枚まで選び、山札の下に置き、残りのカードを山札の上に好きな順番で置く。',
  anm079c: '【自】 記憶 ［手札の《風》のキャラを1枚控え室に置く］ 思い出置場にこのカードがあり、あなたのレベルが3以上なら、あなたのCXフェイズの始めに、あなたはコストを払ってよい。そうしたら、あなたは自分のカード名に「愛乃」を含むキャラを1枚とこのカードを選び、入れ替える。',
};

// ---------------------------------------------------------------------------------------------------------

describe('reading the new wordings', () => {
  it('the exchange with a card of memory, and back at the start of the encore step', () => {
    expect((readLine(TEXT.anm087).line!.ability as { effect: unknown }).effect).toEqual([
      { do: 'SWAP_STAGE_MEMORY', stage: 'SELF', memory: { filter: { name: '“カレイドワールド”愛乃' } } },
      { do: 'DELAYED', at: { step: 'ENCORE', whose: 'ANY' }, effects: [{ do: 'SWAP_STAGE_MEMORY', stage: 'MOVED', memory: 'MOVED' }] },
    ]);
    // それらのキャラ needs the exchange before it; another time is not read with it.
    expect(readLine(TEXT.anm087.replace('入れ替え、アンコールステップの始めに、それらのキャラを入れ替える', '入れ替える')).line).not.toBeNull();
    expect(readLine('【自】 このカードがアタックした時、アンコールステップの始めに、それらのキャラを入れ替える。').line).toBeNull();
    expect(readLine(TEXT.anm087.replace('アンコールステップの始めに', 'ターンの終わりに')).line).toBeNull();
  });

  it('from memory: a character of the stage and this card; on the stage the same words are not read', () => {
    expect((readLine(TEXT.anm079c).line!.ability as { effect: unknown }).effect).toEqual([{ do: 'SWAP_STAGE_MEMORY', stage: { filter: { nameIncludes: '愛乃' } }, memory: 'SELF' }]);
    expect(readLine('【自】 このカードがアタックした時、あなたは自分のカード名に「愛乃」を含むキャラを1枚とこのカードを選び、入れ替える。').line).toBeNull();
  });

  it('looking at the opponent’s deck, one card to its bottom', () => {
    expect((readLine(TEXT.anm079b).line!.ability as { effect: unknown }).effect).toEqual([{ do: 'REORDER_TOP', upTo: 4, whose: 'OPPONENT', toBottom: 1 }]);
  });

  it('the two cards: every ability of each card is in its data', () => {
    expect(printed(ANM(87)).abilities).toHaveLength(2);
    expect(ability(ANM(87), 0)).toMatchObject({ trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' }, condition: { if: 'COUNT', where: 'YOUR_MEMORY', max: 2 }, optional: true, effect: [{ do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { name: '“カレイドワールド”愛乃' } }, { do: 'MOVE', to: 'MEMORY' }] });
    expect(ability(ANM(87), 1)).toEqual(readLine(TEXT.anm087).line!.ability);
    expect(ability(ANM(87), 1)).toMatchObject({ keywords: ['MEMORY'], cost: [{ pay: 'REST_SELF' }], condition: { if: 'ALL', of: [{ if: 'CLIMAX_IN_PLAY' }, { if: 'SELF_IN_SLOT', slots: ['FL', 'FC', 'FR'] }] } });
    expect(printed(ANM(79)).abilities).toHaveLength(3);
    expect(ability(ANM(79), 0)).toMatchObject({ trigger: { on: 'PLACED_ON_STAGE', from: 'HAND_OR_MEMORY' }, optional: true, effect: [{ do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { kind: 'CHARACTER', traits: ['風'] } }, { do: 'MOVE', to: 'HAND' }] });
    expect(ability(ANM(79), 1)).toEqual(readLine(TEXT.anm079b).line!.ability);
    expect(ability(ANM(79), 2)).toEqual(readLine(TEXT.anm079c).line!.ability);
    expect(ability(ANM(79), 2)).toMatchObject({ zone: 'MEMORY', trigger: { on: 'PHASE_START', phase: 'CLIMAX', turn: 'YOURS' }, condition: { if: 'LEVEL', min: 3 }, cost: [{ pay: 'DISCARD', count: 1, filter: { kind: 'CHARACTER', traits: ['風'] } }] });
    expect(printed(ANM(79)).level).toBe(3);
  });
});

// ---------------------------------------------------------------------------------------------------------

describe('ANM/W138-087 “目指した場所”愛乃', () => {
  /** The attack phase begins: the card in the centre, a climax in the climax zone or not, 「“カレイドワールド”愛乃」 in memory. */
  const setup = (options: { climax?: boolean; slot?: SlotId; partner?: boolean } = {}) =>
    game({ step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, ANM(87), stageSlot(0, options.slot ?? 'FC'));
      if (options.climax !== false) take(ctx, 0, ANM(99), zone(0, 'climax'));
      if (options.partner !== false) take(ctx, 0, ANM(84), zone(0, 'memory'));
      take(ctx, 1, ANM(5), stageSlot(1, 'FC'));
      stackTop(ctx, 0, [ANM(9), ANM(9), ANM(16)]);
      stackTop(ctx, 1, [ANM(9), ANM(16), ANM(16)]);
    });

  it('the cards used here', () => {
    expect(printed(ANM(84))).toMatchObject({ name: '“カレイドワールド”愛乃', kind: 'CHARACTER', level: 1, power: 6000 });
    expect(printed(ANM(99)).kind).toBe('CLIMAX');
  });

  it('【自】 記憶: rested as the cost, it changes places with 「“カレイドワールド”愛乃」, which can attack; at the start of the encore step they change back', () => {
    const start = setup();
    expect(pending(start.state, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST', cardId: ANM(87) });
    const choosing = accept(start);
    // The card of memory is chosen (one copy here).
    expect(offered(choosing)).toEqual([ANM(84)]);
    const swapped = pick(choosing, [ANM(84)]);
    expect(swapped.events.some((e) => e.type === 'ORIENTATION_CHANGED' && e.to === 'REST')).toBe(true);
    expect(names(swapped.state, swapped.state.zones[0].stage.FC)).toEqual([ANM(84)]);
    expect(getInstance(swapped.state, at(swapped.state, 0, 'FC')).orientation).toBe('STAND');
    expect(zoneCards(swapped.state, 0, 'memory')).toEqual([ANM(87)]);
    // The card in memory now gives 「“カレイドワールド”愛乃」 its 記憶 ability (it is in force on the stage).
    expect(pending(swapped.state, 'ATTACK').attacks.some((a) => a.attacker === oid(swapped.state, at(swapped.state, 0, 'FC')))).toBe(true);
    const fought = then(then(swapped, { kind: 'ATTACK', attack: { attacker: oid(swapped.state, at(swapped.state, 0, 'FC')), type: 'FRONT' } }), { kind: 'COUNTER', card: null });
    const back = until(fought, (s) => s.turn?.player === 1 || names(s, s.zones[0].stage.FC).includes(ANM(87)));
    expect(names(back.state, back.state.zones[0].stage.FC)).toEqual([ANM(87)]);
    expect(getInstance(back.state, at(back.state, 0, 'FC')).orientation).toBe('STAND');
    expect(zoneCards(back.state, 0, 'memory')).toEqual([ANM(84)]);
  });

  it('the cost not paid, no climax, in the back row, or no such card in memory: nothing changes', () => {
    const declined = decline(setup());
    expect(names(declined.state, declined.state.zones[0].stage.FC)).toEqual([ANM(87)]);
    expect(asks(setup({ climax: false }), 'CONFIRM', 'PAY_COST')).toBe(false);
    expect(asks(setup({ slot: 'BL' }), 'CONFIRM', 'PAY_COST')).toBe(false);
    const alone = accept(setup({ partner: false }));
    expect(names(alone.state, alone.state.zones[0].stage.FC)).toEqual([ANM(87)]);
    expect(getInstance(alone.state, at(alone.state, 0, 'FC')).orientation).toBe('REST');
  });

  it('played from the hand with 2 or fewer cards in memory: 「“カレイドワールド”愛乃」 may go from the waiting room into memory', () => {
    const play = (memory: number) =>
      game({ step: 'MAIN_START' }, (ctx) => {
        take(ctx, 0, ANM(87), zone(0, 'hand'));
        take(ctx, 0, ANM(87), zone(0, 'level'));
        take(ctx, 0, ANM(84), zone(0, 'waitingRoom'));
        [ANM(9), ANM(9), ANM(16)].slice(0, memory).forEach((c) => take(ctx, 0, c, zone(0, 'memory')));
      });
    const asked = playCharacter(play(2), ANM(87), 'FC');
    expect(pending(asked.state, 'CONFIRM')).toMatchObject({ prompt: 'USE_ABILITY', cardId: ANM(87) });
    expect(zoneCards(pick(accept(asked), [ANM(84)]).state, 0, 'memory')).toContain(ANM(84));
    expect(asks(playCharacter(play(3), ANM(87), 'FC'), 'CONFIRM', 'USE_ABILITY')).toBe(false);
  });
});

describe('ANM/W138-079 “風が見る夢”愛乃', () => {
  /** The climax phase begins at level 3: the card in memory, 愛乃 characters on the stage, a 《風》 character in the hand. */
  const setup = (level = 3) =>
    game({ step: 'CLIMAX_START' }, (ctx) => {
      take(ctx, 0, ANM(79), zone(0, 'memory'));
      take(ctx, 0, ANM(81), stageSlot(0, 'FL'));
      take(ctx, 0, ANM(86), stageSlot(0, 'FC'));
      take(ctx, 0, ANM(5), stageSlot(0, 'FR'));
      take(ctx, 0, ANM(9), zone(0, 'hand'));
      take(ctx, 0, ANM(16), zone(0, 'waitingRoom'));
      for (const c of [ANM(2), ANM(10), ANM(13)].slice(0, level)) take(ctx, 0, c, zone(0, 'level'));
    });

  it('記憶 from memory at level 3: a 《風》 character of the hand paid; a character with 愛乃 in its name changes places with it; then its own ability (from memory to the stage)', () => {
    const start = setup();
    expect(pending(start.state, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST', cardId: ANM(79) });
    const paying = accept(start);
    const choosing = pick(paying, [ANM(9)]);
    expect(paid(choosing)).toEqual(['hand>waitingRoom']);
    // Not 六花 (ANM-005).
    expect(offered(choosing)).toEqual([ANM(81), ANM(86)].sort());
    const swapped = pick(choosing, [ANM(86)]);
    expect(names(swapped.state, swapped.state.zones[0].stage.FC)).toEqual([ANM(79)]);
    expect(zoneCards(swapped.state, 0, 'memory')).toEqual([ANM(86)]);
    // 手札か思い出置場から舞台に置かれた時: a 《風》 character of the waiting room may come back.
    expect(pending(swapped.state, 'CONFIRM')).toMatchObject({ prompt: 'USE_ABILITY', cardId: ANM(79) });
    expect(offered(accept(swapped))).toEqual([ANM(16), ANM(9)].sort());
    expect(played(swapped, ANM(79))).toBeGreaterThanOrEqual(1);
  });

  it('level 2: nothing is asked', () => {
    expect(asks(setup(2), 'CONFIRM', 'PAY_COST')).toBe(false);
  });

  it('CX combo: with 長い冒険と夢の終わり and four other 《風》 characters, the opponent’s top four are looked at, one may go to the bottom', () => {
    const attackRun = (others: number) =>
      game({ step: 'ATTACK_START' }, (ctx) => {
        take(ctx, 0, ANM(79), stageSlot(0, 'FC'));
        take(ctx, 0, ANM(99), zone(0, 'climax'));
        [ANM(5), ANM(9), ANM(16), ANM(2)].slice(0, others).forEach((c, k) => take(ctx, 0, c, stageSlot(0, (['FL', 'FR', 'BL', 'BR'] as const)[k]!)));
        for (const c of [ANM(2), ANM(10), ANM(13)]) take(ctx, 0, c, zone(0, 'level'));
        stackTop(ctx, 1, [ANM(5), ANM(9), ANM(16), ANM(13), ANM(10)]);
        stackTop(ctx, 0, [ANM(9), ANM(9)]);
      });
    let run = then(attackRun(4), { kind: 'ATTACK', attack: { attacker: oid(attackRun(4).state, at(attackRun(4).state, 0, 'FC')), type: 'DIRECT' } });
    for (let k = 0; k < 4; k++) run = accept(run);
    expect(pending(run.state, 'SELECT_CARDS')).toMatchObject({ player: 0, prompt: 'EFFECT_DECK_BOTTOM', min: 0, max: 1 });
    expect(offered(run)).toEqual([ANM(13), ANM(16), ANM(5), ANM(9)].sort());
    // The opponent sees only that a choice is being made.
    expect(getPlayerView(run.state, 1).decision).toMatchObject({ mine: false, kind: 'SELECT_CARDS' });
    run = pick(run, [ANM(5)]);
    // The other three go back on top in the order chosen: 13, then 16, then 9 (the last one left).
    expect(pending(run.state, 'SELECT_CARDS').prompt).toBe('EFFECT_ORDER');
    run = pick(pick(run, [ANM(13)]), [ANM(16)]);
    const deck = run.state.zones[1].deck;
    expect(getInstance(run.state, deck[0]!).cardId).toBe(ANM(5));
    // The direct attack (soul 2, +1 from the climax, +1 for the direct attack) then takes the opponent's top four as damage:
    // the three put back in the order chosen, then ANM-010, which was not looked at.
    const damage = run.events.flatMap((e) => (e.type === 'CARD_MOVED' && e.from.zone === 'deck' && e.from.player === 1 ? [getInstance(run.state, e.instanceId).cardId] : []));
    expect(damage).toEqual([ANM(13), ANM(16), ANM(9), ANM(10)]);
    // Three other characters: no ability.
    const fewer = attackRun(3);
    const noCombo = then(fewer, { kind: 'ATTACK', attack: { attacker: oid(fewer.state, at(fewer.state, 0, 'FC')), type: 'DIRECT' } });
    expect(played(noCombo, ANM(79))).toBe(0);
  });
});
