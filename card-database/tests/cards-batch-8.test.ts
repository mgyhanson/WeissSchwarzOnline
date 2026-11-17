/**
 * Tests for the cards of batch 8, with the real card data: STS/W140-008 and STS/W140-027 (effects on the
 * character that is attacking), BDY/W135-021 and STS/W140-014 (moving and exchanging the opponent's characters,
 * 他の枠に動かせない), BDY/W135-025 and BDY/W135-001 (a search whose cards the opponent divides).
 * Both players have every card of the booster under test, three copies each.
 */

import { describe, expect, it } from 'vitest';
import { type Choice, type Ctx, type Decision, type GameEvent, type GameState, type PlayerId, type SlotId, getInstance, getPlayerView, getPower, getSoul, stageSlot } from '@wso/game-engine';
import { getCard } from '../src/index';
import { readEvent, readLine } from '../src/grammar';
import { answer, oid, pending, scenario, stackTop, take } from './helpers';
import type { RealScenario } from './helpers';

const id = (prefix: string) => (n: number): string => `${prefix}-${String(n).padStart(3, '0')}`;
const STS = id('STS/W140');
const BDY = id('BDY/W135');

type SetName = 'STS_W140' | 'BDY_W135';
/** Cards used only as bodies (printed numbers and traits, no abilities). */
const BODIES: Record<SetName, string[]> = {
  STS_W140: [STS(1), STS(35), STS(68), STS(36), STS(37), STS(9), STS(2)],
  BDY_W135: [BDY(29), BDY(33), BDY(72), BDY(35), BDY(47), BDY(13), BDY(2)],
};
interface Run {
  state: GameState;
  events: GameEvent[];
}
const game = (set: SetName, options: Omit<RealScenario, 'sets'>, arrange: (ctx: Ctx) => void = () => {}): Run => ({
  state: scenario({ ...options, sets: [`${set}:ALL`, `${set}:ALL`], plain: BODIES[set] }, arrange).state,
  events: [],
});
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
const option = (run: Run, chosen: string): Run => then(run, { kind: 'SELECT_OPTION', option: chosen });
const slot = (run: Run, chosen: SlotId): Run => then(run, { kind: 'SELECT_SLOT', slot: chosen });
const attack = (run: Run, from: SlotId, type: 'FRONT' | 'SIDE' | 'DIRECT'): Run =>
  then(run, { kind: 'ATTACK', attack: { attacker: oid(run.state, at(run.state, run.state.turn!.player, from)), type } });
const activate = (run: Run, from: SlotId, ability: number): Run =>
  then(run, { kind: 'MAIN', action: { type: 'ACTIVATE', card: oid(run.state, at(run.state, 0, from)), ability } });
const inHand = (state: GameState, player: PlayerId, cardId: string): number => state.zones[player].hand.find((i) => getInstance(state, i).cardId === cardId)!;
const asks = (run: Run, kind: Decision['kind'], prompt?: string): boolean =>
  run.state.pending?.kind === kind && (prompt === undefined || (run.state.pending as { prompt?: string }).prompt === prompt);
/** When several abilities wait (a card's and the アンコール every character has), the card's is played first. */
const cardFirst = (run: Run): Run => {
  let current = run;
  while (current.state.pending?.kind === 'CHOOSE_ABILITY') {
    const waiting = current.state.pending.abilities;
    current = then(current, { kind: 'CHOOSE_ABILITY', id: (waiting.find((a) => a.type === 'CARD') ?? waiting[0]!).id });
  }
  return current;
};
const dealt = (run: Run): number[] => run.events.flatMap((e) => (e.type === 'DAMAGE_DEALT' ? [e.amount] : []));
const shown = (run: Run): string[] => run.events.flatMap((e) => (e.type === 'CARD_REVEALED' ? [e.cardId] : []));
const paid = (run: Run): string[] => run.events.flatMap((e) => (e.type === 'CARD_MOVED' && e.reason === 'COST' ? [`${e.from.zone}>${e.to.zone}`] : []));
const swaps = (state: GameState): string[] => pending(state, 'MAIN').actions.flatMap((a) => (a.type === 'SWAP' ? [`${a.a}-${a.b}`] : []));
const printed = (cardId: string) => getCard(cardId).def;
const ability = (cardId: string, index: number) => printed(cardId).abilities![index];
const zone = (player: PlayerId, name: 'waitingRoom' | 'hand' | 'stock' | 'level' | 'clock') => ({ player, zone: name }) as const;

const TEXT = {
  sts008: '【自】【ターン1】 他のあなたのキャラがアタックした時、そのターン中、あなたはそのアタックしているキャラのソウルを－1し、自分の山札の上から1枚を公開する。そのカードがレベル0以下のキャラならストック置場に置く。（そうでないなら元に戻す）',
  sts027: '【自】 他のあなたのキャラがアタックした時、そのターン中、あなたはそのアタックしているキャラのソウルを－1してよい。そうしたら、そのターン中、そのアタックしているキャラのパワーを＋2000。',
  bdy021: '【起】［このカードを控え室に置く］ あなたは相手のキャラを1枚選び、【スタンド】して相手の舞台のキャラのいない他の枠に動かすか、他の相手のキャラを1枚選び、それぞれを【スタンド】して入れ替える。',
  sts014: '【起】［他のあなたの舞台の、《巡遊者》か《魔王》のキャラを1枚控え室に置き、このカードを【レスト】する］ 他のあなたの、《巡遊者》か《魔王》のキャラが2枚以上なら、あなたは相手のキャラを1枚選び、相手の舞台のキャラのいない他の枠に動かし、次の相手のターンの終わりまで、そのキャラに次の能力を与える。『【永】 このカードは他の枠に動かせない。』',
  bdy025: '［あなたの【スタンド】している《音楽》のキャラを1枚【レスト】する］ あなたはコストを払ってよい。そうしたら、あなたは自分の山札を見て《音楽》のキャラを2枚まで選んで相手に見せる。その後、相手はそれらのキャラを1枚選び、控え室に置き、残りのカードをあなたの手札に加え、その山札をシャッフルする。',
};
const ATTACKER = { who: 'THAT', as: 'ATTACKING' };
const CHOSEN = { who: 'CHOSEN' };

// ---------------------------------------------------------------------------------------------------------

describe('reading the new wordings', () => {
  const unknown = (line: string) => readLine(line).unknown.map((u) => u.part);

  it('そのアタックしているキャラ: the character the trigger names, and only when the trigger names one', () => {
    expect(readLine(TEXT.sts027).line!.ability).toEqual({
      type: 'AUTO',
      trigger: { on: 'OTHER_ATTACKS' },
      optional: true,
      effect: [{ do: 'MODIFY', target: ATTACKER, stat: 'SOUL', amount: -1 }, { do: 'IF', condition: { if: 'DID' }, then: [{ do: 'MODIFY', target: ATTACKER, stat: 'POWER', amount: 2000 }] }],
    });
    expect(readLine(TEXT.sts008).line!.ability).toEqual({
      type: 'AUTO',
      trigger: { on: 'OTHER_ATTACKS' },
      limit: 1,
      effect: [{ do: 'MODIFY', target: ATTACKER, stat: 'SOUL', amount: -1 }, { do: 'REVEAL_TOP', filter: { kind: 'CHARACTER', levelMax: 0 }, toStock: true }],
    });
    // "このカードがアタックした時" names no other character: そのアタックしているキャラ is not read.
    expect(readLine(TEXT.sts027.replace('他のあなたのキャラがアタックした時', 'このカードがアタックした時')).line).toBeNull();
    expect(readLine(TEXT.sts008.replace('他のあなたのキャラがアタックした時', 'このカードがアタックした時')).line).toBeNull();
    // What follows そうしたら must be known; the shown card must be said what happens to.
    expect(unknown(TEXT.sts027.replace('そのターン中、そのアタックしているキャラのパワーを＋2000', 'あなたは踊る'))).toEqual(['OPTIONAL']);
    expect(readLine(TEXT.sts008.replace('そのカードがレベル0以下のキャラならストック置場に置く。', '')).line).toBeNull();
    // The level and the kind of the shown card are read as written.
    expect(readLine(TEXT.sts008.replace('レベル0以下のキャラ', 'レベル1以下のキャラ')).line!.ability).toMatchObject({ effect: [{}, { filter: { kind: 'CHARACTER', levelMax: 1 } }] });
  });

  it('相手のキャラを1枚選び、…動かすか、…入れ替える: exactly this choice', () => {
    expect(readLine(TEXT.bdy021).line!.ability).toEqual({
      type: 'ACT',
      timing: 'MAIN',
      cost: [{ pay: 'SELF_TO_WAITING_ROOM' }],
      effect: [
        { do: 'CHOOSE', from: 'OPPONENT_STAGE', min: 1, max: 1 },
        {
          do: 'CHOOSE_ONE',
          afterChoice: true,
          options: [
            [{ do: 'ORIENT', target: CHOSEN, to: 'STAND' }, { do: 'MOVE_TO_SLOT', target: CHOSEN, row: 'ANY' }],
            [{ do: 'CHOOSE', from: 'OPPONENT_STAGE', min: 1, max: 1, add: true, otherThanChosen: true }, { do: 'SWAP_CHOSEN' }],
          ],
        },
      ],
    });
    expect(readLine(TEXT.bdy021.replace('他の相手のキャラを1枚選び', '他の相手のキャラを2枚選び')).line).toBeNull();
    expect(readLine(TEXT.bdy021.replace('あなたは相手のキャラを1枚選び', 'あなたは自分のキャラを1枚選び')).line).toBeNull();
    expect(readLine(TEXT.bdy021.replace('【スタンド】して相手の舞台', '【レスト】して相手の舞台')).line).toBeNull();
    expect(readLine(TEXT.bdy021.replace('相手の舞台のキャラのいない他の枠', '自分の舞台のキャラのいない他の枠')).line).toBeNull();
  });

  it('…他の枠に動かし、次の相手のターンの終わりまで、そのキャラに次の能力を与える。『【永】 このカードは他の枠に動かせない。』', () => {
    expect(readLine(TEXT.sts014).line!.ability).toEqual({
      type: 'ACT',
      timing: 'MAIN',
      cost: [{ pay: 'CHARACTERS_TO_WAITING_ROOM', count: 1, filter: { kind: 'CHARACTER', traits: ['巡遊者', '魔王'] }, other: true }, { pay: 'REST_SELF' }],
      effect: [
        {
          do: 'IF',
          condition: { if: 'CHARACTERS', min: 2, other: true, filter: { kind: 'CHARACTER', traits: ['巡遊者', '魔王'] } },
          then: [
            { do: 'CHOOSE', from: 'OPPONENT_STAGE', min: 1, max: 1 },
            { do: 'MOVE_TO_SLOT', target: CHOSEN, row: 'ANY' },
            { do: 'GRANT', target: CHOSEN, ability: { type: 'CONT', cannotMove: true, apply: [] }, until: 'NEXT_OPPONENT_TURN' },
          ],
        },
      ],
    });
    expect(readLine(TEXT.sts014.replace('相手の舞台のキャラのいない他の枠', '自分の舞台のキャラのいない他の枠')).line).toBeNull();
    expect(readLine(TEXT.sts014.replace('このカードは他の枠に動かせない', 'このカードは踊れない')).line).toBeNull();
    // Another time is another thing: そのターン中 is not this card's wording and is not taken for it.
    expect(readLine(TEXT.sts014.replace('次の相手のターンの終わりまで、そのキャラに', 'そのターン中、そのキャラに')).line).toBeNull();
  });

  it('the event: …選んで相手に見せる。その後、相手はそれらのキャラを1枚選び、控え室に置き、残りのカードをあなたの手札に加え、…', () => {
    expect(readEvent(TEXT.bdy025)!.effect).toEqual([
      {
        do: 'MAY_PAY',
        cost: [{ pay: 'REST_CHARACTERS', count: 1, filter: { kind: 'CHARACTER', traits: ['音楽'] } }],
        then: [
          { do: 'CHOOSE', from: 'YOUR_DECK', filter: { kind: 'CHARACTER', traits: ['音楽'] }, min: 0, max: 2 },
          { do: 'SPLIT_CHOSEN', take: 1, exact: true, to: 'WAITING_ROOM', rest: 'HAND', reveal: true, by: 'OPPONENT' },
          { do: 'SHUFFLE' },
        ],
      },
    ]);
    // The opponent cannot take as many as were shown; それらのキャラ is said of characters; the two sentences belong together.
    expect(readEvent(TEXT.bdy025.replace('それらのキャラを1枚選び', 'それらのキャラを2枚選び'))).toBeNull();
    expect(readEvent(TEXT.bdy025.replace('《音楽》のキャラを2枚まで選んで', 'カードを2枚まで選んで'))).toBeNull();
    expect(readEvent(TEXT.bdy025.replace('その後、相手はそれらのキャラを1枚選び、控え室に置き、残りのカードをあなたの手札に加え、その山札をシャッフルする。', ''))).toBeNull();
    expect(readEvent(TEXT.bdy025.replace('残りのカードをあなたの手札に加え', '残りのカードを相手の手札に加え'))).toBeNull();
    expect(readEvent(TEXT.bdy025.replace('あなたはコストを払ってよい。そうしたら、', ''))).toBeNull();
  });

  it('the six cards: every ability of each card is in its data', () => {
    expect(printed(STS(8)).abilities).toHaveLength(3);
    expect(ability(STS(8), 0)).toEqual({ type: 'CONT', untargetable: true, apply: [] });
    expect(ability(STS(8), 1)).toEqual(readLine(TEXT.sts008).line!.ability);
    expect(ability(STS(8), 2)).toMatchObject({ type: 'ACT', keywords: ['BRAINSTORM'], cost: [{ pay: 'STOCK', count: 1 }, { pay: 'REST_SELF' }], effect: [{ do: 'BRAINSTORM', count: 4, per: { kind: 'CLIMAX' } }] });
    expect(printed(STS(27)).abilities).toHaveLength(3);
    expect(ability(STS(27), 0)).toEqual({ type: 'CONT', untargetable: true, apply: [] });
    expect(ability(STS(27), 1)).toMatchObject({ type: 'CONT', condition: { if: 'YOUR_TURN' }, apply: [{ target: { who: 'ALL_YOURS', other: true }, stat: 'POWER', amount: 1000 }] });
    expect(ability(STS(27), 2)).toEqual(readLine(TEXT.sts027).line!.ability);
    expect(printed(STS(14)).abilities).toHaveLength(2);
    expect(ability(STS(14), 0)).toMatchObject({ trigger: { on: 'OTHER_STAGE_TO_WAITING_ROOM' }, condition: { if: 'SELF_IN_SLOT', slots: ['BL', 'BR'] }, cost: [{ pay: 'SELF_TO_WAITING_ROOM' }], effect: [{ do: 'MOVE', target: { who: 'THAT' }, to: 'ABOUT_SLOT', rested: true }] });
    expect(ability(STS(14), 1)).toEqual(readLine(TEXT.sts014).line!.ability);
    expect(printed(BDY(21)).abilities).toHaveLength(2);
    expect(ability(BDY(21), 0)).toEqual(readLine(TEXT.bdy021).line!.ability);
    expect(ability(BDY(21), 1)).toMatchObject({ type: 'ACT', keywords: ['BACKUP'], timing: 'COUNTER', level: 2, cost: [{ pay: 'STOCK', count: 1 }, { pay: 'SELF_TO_WAITING_ROOM' }] });
    expect(printed(BDY(25))).toMatchObject({ kind: 'EVENT', effect: readEvent(TEXT.bdy025)!.effect });
    expect(printed(BDY(1)).abilities).toHaveLength(2);
    expect(ability(BDY(1), 0)).toMatchObject({ trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' }, effect: [{ do: 'REORDER_TOP', upTo: 2, keep: 2 }] });
    expect(ability(BDY(1), 1)).toMatchObject({
      cost: [{ pay: 'STOCK', count: 1 }, { pay: 'DECK_TOP_TO_CLOCK' }],
      effect: [{ do: 'CHOOSE', from: 'YOUR_DECK', filter: { kind: 'CHARACTER', traits: ['夢限大みゅーたいぷ'] }, min: 0, max: 2 }, { do: 'SPLIT_CHOSEN', take: 1, to: 'WAITING_ROOM', rest: 'HAND', reveal: true, by: 'OPPONENT' }, { do: 'SHUFFLE' }],
    });
  });
});

// ---------------------------------------------------------------------------------------------------------

describe('STS/W140-008 魂の取引 魔王ちゃん', () => {
  const setup = (top: string, more?: (ctx: Ctx) => void) => {
    let tops: number[] = [];
    const run = game('STS_W140', { step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, STS(8), stageSlot(0, 'BL'));
      take(ctx, 0, STS(1), stageSlot(0, 'FC'));
      take(ctx, 0, STS(35), stageSlot(0, 'FL'));
      take(ctx, 0, STS(9), stageSlot(0, 'FR'));
      // The card shown by the ability, then the cards of the trigger checks.
      tops = stackTop(ctx, 0, [top, STS(68), STS(68), STS(9)]);
      stackTop(ctx, 1, [STS(1), STS(1), STS(35), STS(35), STS(68), STS(68)]);
      more?.(ctx);
    });
    return { run, tops };
  };

  it('the cards used here', () => {
    expect([STS(68), STS(36)].map((c) => [printed(c).kind, printed(c).level])).toEqual([['CHARACTER', 0], ['CHARACTER', 1]]);
    expect(printed(STS(31)).kind).toBe('CLIMAX');
    expect(printed(STS(29))).toMatchObject({ kind: 'EVENT', level: 1 });
    // The card itself has no soul icon.
    expect([STS(1), STS(8)].map((c) => printed(c).soul)).toEqual([1, 0]);
  });

  it('another character attacks: that character’s soul −1; a level 0 character shown goes to the stock', () => {
    const { run, tops } = setup(STS(68));
    const after = attack(run, 'FC', 'DIRECT');
    expect(shown(after)).toEqual([STS(68)]);
    // Soul 1 − 1, +1 for the direct attack: 1 damage instead of 2.
    expect(dealt(after)).toEqual([1]);
    // The card with the ability and the character that did not attack keep their soul.
    expect(getSoul(after.state, at(after.state, 0, 'BL'))).toBe(printed(STS(8)).soul);
    expect(getSoul(after.state, at(after.state, 0, 'FL'))).toBe(1);
    // The shown card, then the card of the trigger check.
    expect(after.state.zones[0].stock).toEqual([tops[0], tops[1]]);
  });

  it.each([
    ['a level 1 character', STS(36)],
    ['a climax', STS(31)],
    ['an event', STS(29)],
  ])('%s shown: back where it was; the trigger check then takes it', (_name, top) => {
    const { run, tops } = setup(top);
    const after = attack(run, 'FC', 'DIRECT');
    expect(shown(after)).toEqual([top]);
    const checks = after.events.flatMap((e) => (e.type === 'TRIGGER_CHECK' ? [e.cardId] : []));
    expect(checks).toEqual([top]);
    expect(getInstance(after.state, tops[0]!).revealed).toBe(false);
    expect(after.state.zones[0].stock.filter((i) => i !== tops[0])).toEqual([]);
  });

  it('【ターン1】: the second attack of the turn is not changed; its own attack does not count', () => {
    const { run } = setup(STS(36));
    const first = attack(run, 'FC', 'DIRECT');
    const second = attack({ ...first, events: [] }, 'FL', 'DIRECT');
    expect(shown(second)).toEqual([]);
    expect(dealt(second)).toEqual([2]);

    const own = game('STS_W140', { step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, STS(8), stageSlot(0, 'FC'));
      take(ctx, 0, STS(1), stageSlot(0, 'FL'));
      stackTop(ctx, 0, [STS(68), STS(68), STS(68)]);
      stackTop(ctx, 1, [STS(1), STS(1), STS(35), STS(35)]);
    });
    const self = attack(own, 'FC', 'DIRECT');
    expect(shown(self)).toEqual([]);
    // Printed soul 0, +1 for the direct attack.
    expect(dealt(self)).toEqual([1]);
    // Not used yet: the other character's attack in the same turn still gets it.
    const other = attack({ ...self, events: [] }, 'FL', 'DIRECT');
    expect(shown(other)).toEqual([STS(68)]);
    expect(dealt(other)).toEqual([1]);
  });

  it('集中: four cards; for each climax, up to one character returns from the waiting room', () => {
    let run = game('STS_W140', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, STS(8), stageSlot(0, 'FC'));
      take(ctx, 0, STS(35), zone(0, 'stock'));
      take(ctx, 0, STS(37), zone(0, 'waitingRoom'));
      stackTop(ctx, 0, [STS(1), STS(31), STS(68), STS(9)]);
    });
    run = activate(run, 'FC', 2);
    expect(paid(run)).toEqual(['stock>waitingRoom']);
    expect(getInstance(run.state, at(run.state, 0, 'FC')).orientation).toBe('REST');
    expect(pending(run.state, 'SELECT_CARDS')).toMatchObject({ min: 0, max: 1 });
    run = pick(run, [STS(37)]);
    expect(names(run.state, run.state.zones[0].hand)).toEqual([STS(37)]);
    expect(asks(run, 'MAIN')).toBe(true);
  });

  it('このカードは相手の効果に選ばれない: the opponent’s STS/W140-014 cannot choose it', () => {
    let run = game('STS_W140', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, STS(14), stageSlot(0, 'BL'));
      for (const [k, s] of (['FL', 'FC', 'FR'] as const).entries()) take(ctx, 0, [STS(1), STS(35), STS(9)][k]!, stageSlot(0, s));
      take(ctx, 1, STS(8), stageSlot(1, 'FC'));
      take(ctx, 1, STS(27), stageSlot(1, 'FL'));
      take(ctx, 1, STS(68), stageSlot(1, 'BL'));
    });
    run = pick(activate(run, 'BL', 1), [STS(1)]);
    expect(offered(run)).toEqual([STS(68)]);
  });
});

describe('STS/W140-027 魂の取引 魔王くん', () => {
  const setup = (more?: (ctx: Ctx) => void): Run =>
    game('STS_W140', { step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, STS(27), stageSlot(0, 'BL'));
      take(ctx, 0, STS(1), stageSlot(0, 'FC'));
      take(ctx, 0, STS(35), stageSlot(0, 'FL'));
      take(ctx, 0, STS(9), stageSlot(0, 'FR'));
      stackTop(ctx, 0, [STS(68), STS(68), STS(68)]);
      stackTop(ctx, 1, [STS(1), STS(1), STS(35), STS(35), STS(68), STS(68)]);
      more?.(ctx);
    });
  /** In your turn your other characters have +1000 from this card. */
  const base = (cardId: string) => printed(cardId).power! + 1000;

  it('accepted: the attacking character gets soul −1 and power +2000 for the turn; this card is unchanged', () => {
    const asked = attack(setup(), 'FC', 'DIRECT');
    expect(pending(asked.state, 'CONFIRM')).toMatchObject({ player: 0, prompt: 'USE_ABILITY', cardId: STS(27) });
    const after = accept(asked);
    expect(dealt(after)).toEqual([1]);
    expect(getPower(after.state, at(after.state, 0, 'FC'))).toBe(base(STS(1)) + 2000);
    expect(getPower(after.state, at(after.state, 0, 'BL'))).toBe(printed(STS(27)).power);
    expect(getPower(after.state, at(after.state, 0, 'FL'))).toBe(base(STS(35)));
    expect(getSoul(after.state, at(after.state, 0, 'BL'))).toBe(printed(STS(27)).soul);
  });

  it('declined: nothing changes; the next attack asks again, for its own attacker', () => {
    const first = decline(attack(setup(), 'FC', 'DIRECT'));
    expect(dealt(first)).toEqual([2]);
    expect(getPower(first.state, at(first.state, 0, 'FC'))).toBe(base(STS(1)));
    const second = accept(attack({ ...first, events: [] }, 'FL', 'DIRECT'));
    expect(dealt(second)).toEqual([1]);
    expect(getPower(second.state, at(second.state, 0, 'FL'))).toBe(base(STS(35)) + 2000);
    expect(getPower(second.state, at(second.state, 0, 'FC'))).toBe(base(STS(1)));
  });

  it('in the battle: with the +2000 the attacker wins against a character it would lose to', () => {
    // STS-035: 500 + 1000 in your turn; the opponent's STS-002 has 3000.
    const fight = (take2000: boolean) => {
      let run = attack(setup((ctx) => take(ctx, 1, STS(2), stageSlot(1, 'FR'))), 'FL', 'FRONT');
      run = take2000 ? accept(run) : decline(run);
      run = then(run, { kind: 'COUNTER', card: null });
      return [getInstance(run.state, at(run.state, 0, 'FL')).orientation, getInstance(run.state, at(run.state, 1, 'FR')).orientation];
    };
    expect(printed(STS(2)).power).toBe(3000);
    expect(base(STS(35)) + 2000).toBeGreaterThan(3000);
    expect(fight(true)).toEqual(['REST', 'REVERSE']);
    expect(fight(false)).toEqual(['REVERSE', 'STAND']);
  });

  it('its own attack does not ask; in the opponent’s turn the others have no +1000', () => {
    const own = game('STS_W140', { step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, STS(27), stageSlot(0, 'FC'));
      take(ctx, 0, STS(1), stageSlot(0, 'FL'));
      stackTop(ctx, 0, [STS(68), STS(68)]);
      stackTop(ctx, 1, [STS(1), STS(1), STS(35), STS(35)]);
    });
    expect(asks(attack(own, 'FC', 'DIRECT'), 'CONFIRM')).toBe(false);
    const theirs = game('STS_W140', { step: 'MAIN_START', turnPlayer: 1 }, (ctx) => {
      take(ctx, 0, STS(27), stageSlot(0, 'BL'));
      take(ctx, 0, STS(1), stageSlot(0, 'FC'));
    });
    expect(getPower(theirs.state, at(theirs.state, 0, 'FC'))).toBe(printed(STS(1)).power);
  });

  it('with STS/W140-008 as well: both act on the attacking character', () => {
    let run = attack(setup((ctx) => take(ctx, 0, STS(8), stageSlot(0, 'BR'))), 'FC', 'DIRECT');
    for (let k = 0; k < 4 && !asks(run, 'ATTACK'); k++) {
      const d = run.state.pending!;
      run = d.kind === 'CHOOSE_ABILITY' ? then(run, { kind: 'CHOOSE_ABILITY', id: d.abilities[0]!.id }) : accept(run);
    }
    // Soul 1 − 1 − 1 + 1 (direct attack) = 0: no damage (CR-7.5.1.2.1).
    expect(dealt(run)).toEqual([]);
    expect(getSoul(run.state, at(run.state, 0, 'FC'))).toBe(0);
    expect(getPower(run.state, at(run.state, 0, 'FC'))).toBe(base(STS(1)) + 2000);
    expect(shown(run)).toEqual([STS(68)]);
  });
});

// ---------------------------------------------------------------------------------------------------------

describe('STS/W140-014 白衣の死神？ クルニス', () => {
  /** STS-014 in a slot, `others` other 《巡遊者》 characters in the front row; the opponent has two characters. */
  const setup = (own: SlotId, others: number): Run =>
    game('STS_W140', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, STS(14), stageSlot(0, own));
      (['FL', 'FC', 'FR'] as const).slice(0, others).forEach((s, k) => take(ctx, 0, [STS(1), STS(35), STS(9)][k]!, stageSlot(0, s)));
      take(ctx, 1, STS(68), stageSlot(1, 'FC'), { orientation: 'REST' });
      take(ctx, 1, STS(36), stageSlot(1, 'BL'));
    });
  /** The activated ability paid with STS-001; the automatic ability of the same card (its cost: itself) declined. */
  const used = (others: number): Run => {
    const run = pick(activate(setup('BL', others), 'BL', 1), [STS(1)]);
    return run;
  };

  it('【起】: with two others left after the cost, the opponent’s character is moved to the free slot you choose, as it is', () => {
    let run = used(3);
    expect(paid(run)).toEqual(['stage>waitingRoom']);
    expect(getInstance(run.state, at(run.state, 0, 'BL')).orientation).toBe('REST');
    expect(pending(run.state, 'SELECT_CARDS')).toMatchObject({ player: 0, min: 1, max: 1 });
    expect(offered(run)).toEqual([STS(36), STS(68)].sort());
    run = pick(run, [STS(68)]);
    expect(pending(run.state, 'SELECT_SLOT')).toMatchObject({ player: 0, slots: ['FL', 'FR', 'BR'] });
    run = slot(run, 'FR');
    const moved = at(run.state, 1, 'FR');
    expect(getInstance(run.state, moved)).toMatchObject({ cardId: STS(68), orientation: 'REST' });
    expect(run.state.zones[1].stage.FC).toEqual([]);
  });

  it('【起】: only one other left after the cost: the cost is paid, nothing is moved', () => {
    const run = used(2);
    expect(paid(run)).toEqual(['stage>waitingRoom']);
    expect(asks(run, 'SELECT_CARDS')).toBe(false);
    expect(names(run.state, run.state.zones[1].stage.FC)).toEqual([STS(68)]);
  });

  it('the moved character cannot be moved to another slot until the end of the opponent’s next turn; it can leave the stage', () => {
    let run = cardFirst(slot(pick(used(3), [STS(68)]), 'FR'));
    // The automatic ability of this card saw STS-001 go to the waiting room as the cost: not paid here.
    expect(pending(run.state, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST', cardId: STS(14) });
    run = decline(run);
    const routine = (d: Decision): Choice =>
      d.kind === 'CHOOSE_ABILITY' ? { kind: 'CHOOSE_ABILITY', id: d.abilities[0]!.id }
        : d.kind === 'MAIN' ? { kind: 'MAIN', action: { type: 'PASS' } }
        : d.kind === 'CLIMAX' ? { kind: 'CLIMAX', card: null }
        : d.kind === 'ATTACK' ? { kind: 'ATTACK', attack: null }
        : d.kind === 'CLOCK' ? { kind: 'CLOCK', card: null }
        : d.kind === 'HAND_LIMIT' ? { kind: 'HAND_LIMIT', discard: d.cards.slice(0, d.count) }
        : { kind: 'CONFIRM', accept: false };
    const untilMain = (from: Run, player: PlayerId): Run => {
      let current = then(from, routine(from.state.pending!));
      for (let k = 0; k < 80 && !(current.state.turn?.player === player && current.state.pending?.kind === 'MAIN'); k++) current = then(current, routine(current.state.pending!));
      return current;
    };
    run = untilMain(run, 1);
    expect(names(run.state, run.state.zones[1].stage.FR)).toEqual([STS(68)]);
    // Its owner's main phase: no exchange of slots with FR is offered; the other character moves freely.
    expect(swaps(run.state).some((s) => s.split('-').includes('FR'))).toBe(false);
    expect(swaps(run.state)).toContain('FL-BL');
    // It attacks and may be put into the waiting room like any character (here: a side attack is still its own choice).
    expect(pending(untilMain(untilMain(run, 0), 1).state, 'MAIN').actions.some((a) => a.type === 'SWAP' && (a.a === 'FR' || a.b === 'FR'))).toBe(true);
  });

  it('【自】: another character put into the waiting room, this card in the back row: paid with this card, the character comes back to its slot rested', () => {
    // The cost of its own activated ability puts STS-001 (front left) into the waiting room.
    let run = cardFirst(used(2));
    expect(pending(run.state, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST', cardId: STS(14) });
    const declined = decline(run);
    expect(names(declined.state, declined.state.zones[0].waitingRoom)).toEqual([STS(1)]);
    expect(names(declined.state, declined.state.zones[0].stage.BL)).toEqual([STS(14)]);
    run = accept(run);
    expect(names(run.state, run.state.zones[0].waitingRoom)).toEqual([STS(14)]);
    expect(getInstance(run.state, at(run.state, 0, 'FL'))).toMatchObject({ cardId: STS(1), orientation: 'REST' });
    expect(run.state.zones[0].stage.BL).toEqual([]);
  });

  it('【自】: not from the front row', () => {
    const run = cardFirst(pick(activate(setup('FC', 1), 'FC', 1), [STS(1)]));
    expect(run.state.pending?.kind === 'CONFIRM' && run.state.pending.cardId === STS(14)).toBe(false);
    expect(names(run.state, run.state.zones[0].waitingRoom)).toEqual([STS(1)]);
  });
});

describe('BDY/W135-021 Happy Birthday 仲町あられ', () => {
  const setup = (theirs: Partial<Record<SlotId, string>>, more?: (ctx: Ctx) => void): Run =>
    game('BDY_W135', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, BDY(21), stageSlot(0, 'FC'));
      for (const [s, c] of Object.entries(theirs)) take(ctx, 1, c, stageSlot(1, s as SlotId), { orientation: 'REST' });
      more?.(ctx);
    });

  it('moved: this card goes to the waiting room; the chosen character stands and goes to the free slot you choose', () => {
    let run = activate(setup({ FC: BDY(33), BL: BDY(72) }), 'FC', 0);
    expect(paid(run)).toEqual(['stage>waitingRoom']);
    expect(pending(run.state, 'SELECT_CARDS')).toMatchObject({ player: 0, min: 1, max: 1 });
    run = pick(run, [BDY(33)]);
    expect(pending(run.state, 'SELECT_OPTION')).toMatchObject({ player: 0, options: ['EFFECT_1', 'EFFECT_2'] });
    run = option(run, 'EFFECT_1');
    expect(pending(run.state, 'SELECT_SLOT')).toMatchObject({ player: 0, slots: ['FL', 'FR', 'BR'] });
    run = slot(run, 'BR');
    expect(getInstance(run.state, at(run.state, 1, 'BR'))).toMatchObject({ cardId: BDY(33), orientation: 'STAND' });
    expect(run.state.zones[1].stage.FC).toEqual([]);
    expect(getInstance(run.state, at(run.state, 1, 'BL'))).toMatchObject({ cardId: BDY(72), orientation: 'REST' });
    expect(names(run.state, run.state.zones[0].waitingRoom)).toEqual([BDY(21)]);
    expect(paid(run)).toHaveLength(1);
  });

  it('exchanged: another character is chosen; both stand and change places, the third is untouched', () => {
    let run = option(pick(activate(setup({ FC: BDY(33), BL: BDY(72), FR: BDY(35) }), 'FC', 0), [BDY(33)]), 'EFFECT_2');
    expect(offered(run)).toEqual([BDY(35), BDY(72)].sort());
    run = pick(run, [BDY(72)]);
    expect(getInstance(run.state, at(run.state, 1, 'FC'))).toMatchObject({ cardId: BDY(72), orientation: 'STAND' });
    expect(getInstance(run.state, at(run.state, 1, 'BL'))).toMatchObject({ cardId: BDY(33), orientation: 'STAND' });
    expect(getInstance(run.state, at(run.state, 1, 'FR'))).toMatchObject({ cardId: BDY(35), orientation: 'REST' });
  });

  it('a full stage: the character only stands; a single character: nothing to exchange with, nobody stands', () => {
    const full = option(pick(activate(setup({ FL: BDY(33), FC: BDY(72), FR: BDY(35), BL: BDY(47), BR: BDY(13) }), 'FC', 0), [BDY(72)]), 'EFFECT_1');
    expect(asks(full, 'MAIN')).toBe(true);
    expect(getInstance(full.state, at(full.state, 1, 'FC'))).toMatchObject({ cardId: BDY(72), orientation: 'STAND' });
    const alone = option(pick(activate(setup({ FC: BDY(33) }), 'FC', 0), [BDY(33)]), 'EFFECT_2');
    expect(asks(alone, 'MAIN')).toBe(true);
    expect(getInstance(alone.state, at(alone.state, 1, 'FC'))).toMatchObject({ cardId: BDY(33), orientation: 'REST' });
  });

  it('a marker goes with the moved character', () => {
    let run = setup({ FC: BDY(33) }, (ctx) => take(ctx, 1, BDY(47), { player: 1, zone: 'marker', slot: 'FC' }));
    run = slot(option(pick(activate(run, 'FC', 0), [BDY(33)]), 'EFFECT_1'), 'FL');
    expect(names(run.state, run.state.zones[1].marker.FL)).toEqual([BDY(47)]);
    expect(run.state.zones[1].marker.FC).toEqual([]);
  });

  it('助太刀2500 レベル2: from the hand in the counter step, (1) and this card: the attacked character gets +2500', () => {
    let run = game('BDY_W135', { step: 'ATTACK_START', turnPlayer: 1 }, (ctx) => {
      take(ctx, 1, BDY(35), stageSlot(1, 'FC'));
      take(ctx, 0, BDY(33), stageSlot(0, 'FC'));
      take(ctx, 0, BDY(21), zone(0, 'hand'));
      take(ctx, 0, BDY(47), zone(0, 'stock'));
      for (const c of [BDY(13), BDY(13)]) take(ctx, 0, c, zone(0, 'level'));
      stackTop(ctx, 1, [BDY(29), BDY(29)]);
      stackTop(ctx, 0, [BDY(29), BDY(29), BDY(29)]);
    });
    run = attack(run, 'FC', 'FRONT');
    const backup = pending(run.state, 'COUNTER').backups[0]!;
    expect(cardOf(run.state, backup.card)).toBe(BDY(21));
    const defender = at(run.state, 0, 'FC');
    const attacker = at(run.state, 1, 'FC');
    const before = getPower(run.state, defender);
    run = then({ ...run, events: [] }, { kind: 'COUNTER', card: backup.card, ability: backup.ability });
    if (asks(run, 'SELECT_CARDS')) run = pick(run, [BDY(33)]);
    expect(names(run.state, run.state.zones[0].waitingRoom)).toContain(BDY(21));
    expect(run.state.zones[0].stock).toEqual([]);
    // 1500 + 2500 against 2500: the attacker is reversed, the defender is not.
    expect([before, printed(BDY(35)).power]).toEqual([1500, 2500]);
    const reversed = run.events.flatMap((e) => (e.type === 'ORIENTATION_CHANGED' && e.to === 'REVERSE' ? [e.instanceId] : []));
    expect(reversed).toEqual([attacker]);
    expect(getInstance(run.state, defender).location).toMatchObject({ zone: 'stage', slot: 'FC' });
  });
});

// ---------------------------------------------------------------------------------------------------------

describe('BDY/W135-025 夢限大みゅーたいぷ (event)', () => {
  const setup = (standing = true, more?: (ctx: Ctx) => void): Run => {
    const run = game('BDY_W135', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, BDY(25), zone(0, 'hand'));
      take(ctx, 0, BDY(13), zone(0, 'level'));
      take(ctx, 0, BDY(29), stageSlot(0, 'FC'), standing ? {} : { orientation: 'REST' });
      more?.(ctx);
    });
    return then(run, { kind: 'MAIN', action: { type: 'PLAY_EVENT', card: oid(run.state, inHand(run.state, 0, BDY(25))) } });
  };
  const searching = (): Run => {
    const asked = setup();
    expect(pending(asked.state, 'CONFIRM')).toMatchObject({ player: 0, prompt: 'PAY_COST' });
    const paying = accept(asked);
    expect(pending(paying.state, 'SELECT_CARDS')).toMatchObject({ prompt: 'COST_REST', min: 1, max: 1 });
    return pick(paying, [BDY(29)]);
  };

  it('the cost is paid by resting a standing 《音楽》 character; then up to two 《音楽》 characters of the deck may be chosen', () => {
    const run = searching();
    expect(getInstance(run.state, at(run.state, 0, 'FC')).orientation).toBe('REST');
    const decision = pending(run.state, 'SELECT_CARDS');
    expect(decision).toMatchObject({ player: 0, min: 0, max: 2 });
    // Every character of the deck (all are 《音楽》 in this set), no climax and no event.
    const inDeck = run.state.zones[0].deck.filter((i) => printed(getInstance(run.state, i).cardId).kind === 'CHARACTER');
    expect(decision.cards).toHaveLength(inDeck.length);
    expect(offered(run).every((c) => printed(c).kind === 'CHARACTER' && printed(c).traits.includes('音楽'))).toBe(true);
    expect(run.state.zones[0].deck.some((i) => printed(getInstance(run.state, i).cardId).kind !== 'CHARACTER')).toBe(true);
  });

  it('two shown: the opponent chooses one of them for your waiting room, the other goes to your hand, the deck is shuffled', () => {
    const shownTo = pick(searching(), [BDY(2), BDY(72)]);
    expect(shown(shownTo).sort()).toEqual([BDY(2), BDY(72)].sort());
    const theirs = pending(shownTo.state, 'SELECT_CARDS');
    expect(theirs).toMatchObject({ player: 1, prompt: 'EFFECT_SPLIT_BY_OPPONENT', min: 1, max: 1 });
    expect(offered(shownTo)).toEqual([BDY(2), BDY(72)].sort());
    expect(theirs.look).toBeUndefined();
    const done = pick(shownTo, [BDY(2)]);
    // The event itself and the card the opponent chose are in your waiting room; nothing went to the opponent's.
    expect(names(done.state, done.state.zones[0].waitingRoom).sort()).toEqual([BDY(2), BDY(25)].sort());
    expect(names(done.state, done.state.zones[0].hand)).toEqual([BDY(72)]);
    expect(done.state.zones[1].waitingRoom).toEqual([]);
    expect(done.events.some((e) => e.type === 'DECK_SHUFFLED' && e.player === 0)).toBe(true);
    expect(done.state.instances.some((i) => i.revealed)).toBe(false);
    expect(asks(done, 'MAIN')).toBe(true);
  });

  it('one shown: the opponent must choose it; none shown: the opponent is asked nothing', () => {
    const one = pick(searching(), [BDY(2)]);
    expect(pending(one.state, 'SELECT_CARDS')).toMatchObject({ player: 1, min: 1, max: 1 });
    const done = pick(one, [BDY(2)]);
    expect(names(done.state, done.state.zones[0].hand)).toEqual([]);
    expect(names(done.state, done.state.zones[0].waitingRoom)).toContain(BDY(2));

    const none = pick(searching(), []);
    expect(none.state.pending).toMatchObject({ kind: 'MAIN', player: 0 });
    expect(shown(none)).toEqual([]);
    expect(none.events.some((e) => e.type === 'DECK_SHUFFLED' && e.player === 0)).toBe(true);
  });

  it('what the opponent sees: nothing of the deck while you search; then only the two cards shown', () => {
    const search = searching();
    const during = getPlayerView(search.state, 1);
    expect(during.sides[0].deck.every((c) => !('cardId' in c))).toBe(true);
    expect(JSON.stringify(during.decision ?? {})).not.toContain('cards');
    const shownTo = pick(search, [BDY(2), BDY(72)]);
    const after = getPlayerView(shownTo.state, 1);
    expect(after.sides[0].deck.flatMap((c) => ('cardId' in c ? [c.cardId] : [])).sort()).toEqual([BDY(2), BDY(72)].sort());
    // You are not the one deciding now.
    expect(JSON.stringify(getPlayerView(shownTo.state, 0).decision ?? {})).not.toContain('"cards"');
  });

  it('declined, or no standing 《音楽》 character: nothing is searched; the event is still played', () => {
    const declined = decline(setup());
    expect(shown(declined)).toEqual([]);
    expect(getInstance(declined.state, at(declined.state, 0, 'FC')).orientation).toBe('STAND');
    expect(names(declined.state, declined.state.zones[0].waitingRoom)).toEqual([BDY(25)]);
    const rested = setup(false);
    expect(asks(rested, 'MAIN')).toBe(true);
    expect(names(rested.state, rested.state.zones[0].waitingRoom)).toEqual([BDY(25)]);
    expect(rested.events.some((e) => e.type === 'DECK_SHUFFLED')).toBe(false);
  });
});

describe('BDY/W135-001 夢限の宇宙を進行中 仲町あられ', () => {
  /** Played from the hand; the first ability (looking at the top two) is resolved first and keeps the order. */
  const played = (stock: number): Run => {
    let run = game('BDY_W135', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, BDY(1), zone(0, 'hand'));
      for (let k = 0; k < stock; k++) take(ctx, 0, BDY(33), zone(0, 'stock'));
      stackTop(ctx, 0, [BDY(35), BDY(47), BDY(13)]);
    });
    run = then(run, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(run.state, inHand(run.state, 0, BDY(1))), slot: 'FC' } });
    const first = pending(run.state, 'CHOOSE_ABILITY').abilities.find((a) => a.type === 'CARD' && a.ability === 0)!;
    run = then(run, { kind: 'CHOOSE_ABILITY', id: first.id });
    return run;
  };

  it('placed from the hand: the top two cards may be looked at; those kept go back on top, the rest to the waiting room', () => {
    let run = played(0);
    expect(pending(run.state, 'CONFIRM').prompt).toBe('LOOK_NEXT');
    run = accept(accept(run));
    const keep = pending(run.state, 'SELECT_CARDS');
    expect(keep).toMatchObject({ prompt: 'EFFECT_KEEP', min: 0, max: 2 });
    expect(Object.values(keep.look!).sort()).toEqual([BDY(35), BDY(47)].sort());
    run = pick(run, [BDY(47)]);
    expect(names(run.state, run.state.zones[0].waitingRoom)).toEqual([BDY(35)]);
    expect(names(run.state, run.state.zones[0].deck.slice(-1))).toEqual([BDY(47)]);
    // No stock: the second ability's cost cannot be paid, nothing is asked.
    expect(asks(run, 'MAIN')).toBe(true);
  });

  it('(1) and the top card to the clock: up to two 《夢限大みゅーたいぷ》 characters are shown; the opponent chooses one for the waiting room', () => {
    let run = decline(played(1));
    expect(pending(run.state, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST', cardId: BDY(1) });
    run = accept(run);
    expect(paid(run)).toEqual(['stock>waitingRoom', 'deck>clock']);
    expect(names(run.state, run.state.zones[0].clock)).toEqual([BDY(35)]);
    // 《音楽》 alone is not enough: BDY-072 (フェアリィブゥケ) is not offered.
    expect(printed(BDY(72)).traits).not.toContain('夢限大みゅーたいぷ');
    expect(offered(run)).not.toContain(BDY(72));
    expect(offered(run).every((c) => printed(c).kind === 'CHARACTER' && printed(c).traits.includes('夢限大みゅーたいぷ'))).toBe(true);
    run = pick(run, [BDY(2), BDY(47)]);
    expect(pending(run.state, 'SELECT_CARDS')).toMatchObject({ player: 1, prompt: 'EFFECT_SPLIT_BY_OPPONENT', min: 1, max: 1 });
    expect(offered(run)).toEqual([BDY(2), BDY(47)].sort());
    run = pick(run, [BDY(47)]);
    expect(names(run.state, run.state.zones[0].hand)).toEqual([BDY(2)]);
    expect(names(run.state, run.state.zones[0].waitingRoom).sort()).toEqual([BDY(33), BDY(47)].sort());
    expect(asks(run, 'MAIN')).toBe(true);
  });

  it('the cost declined: nothing is paid and nothing is searched', () => {
    const run = decline(decline(played(1)));
    expect(paid(run)).toEqual([]);
    expect(shown(run)).toEqual([]);
    expect(asks(run, 'MAIN')).toBe(true);
  });
});
