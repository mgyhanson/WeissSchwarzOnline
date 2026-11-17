/**
 * Tests for the cards of batch 9, with the real card data: STS/W140-016, ANM/W138-046, NIK/S135-099 and
 * STS/W140-040 (what is done with the cards an effect put into the waiting room from the top of the deck),
 * STS/W140-040 and GUP/W141-089 (このカードがフロントアタックされた時), ANM/W138-029 (the level of the card
 * just taken back), STS/W140-077 and ANM/W138-080 (an action that follows only under a condition),
 * ANM/W138-090 (a card name that contains one of four words) and ANM/W138-030 (a card looked at and put on
 * the stage). Both players have every card of the booster under test, three copies each.
 */

import { describe, expect, it } from 'vitest';
import { type Choice, type Ctx, type Decision, type GameEvent, type GameState, type PlayerId, type SlotId, getInstance, getPlayerView, getPower, stageSlot } from '@wso/game-engine';
import { getCard } from '../src/index';
import { readEvent, readLine } from '../src/grammar';
import { answer, oid, pending, scenario, stackTop, take } from './helpers';
import type { RealScenario } from './helpers';

const id = (prefix: string) => (n: number): string => `${prefix}-${String(n).padStart(3, '0')}`;
const STS = id('STS/W140');
const ANM = id('ANM/W138');
const NIK = id('NIK/S135');
const GUP = id('GUP/W141');

type SetName = 'STS_W140' | 'ANM_W138' | 'NIK_S135' | 'GUP_W141';
/** Cards used only as bodies (printed numbers, traits and icons, no abilities). */
const BODIES: Record<SetName, string[]> = {
  STS_W140: [STS(68), STS(36), STS(2), STS(3), STS(21), STS(35), STS(9), STS(1)],
  ANM_W138: [ANM(5), ANM(9), ANM(10), ANM(2), ANM(13), ANM(16), ANM(17), ANM(28), ANM(52), ANM(56), ANM(63), ANM(4)],
  NIK_S135: [NIK(4), NIK(5), NIK(7), NIK(8), NIK(9)],
  GUP_W141: [GUP(1), GUP(5), GUP(6), GUP(15), GUP(13)],
};
interface Run {
  state: GameState;
  events: GameEvent[];
}
const game = (set: SetName, options: Omit<RealScenario, 'sets'>, arrange: (ctx: Ctx) => void = () => {}): Run => {
  const start = scenario({ ...options, sets: [`${set}:ALL`, `${set}:ALL`], plain: BODIES[set] }, arrange);
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
const slot = (run: Run, chosen: SlotId): Run => then(run, { kind: 'SELECT_SLOT', slot: chosen });
const noCounter = (run: Run): Run => then(run, { kind: 'COUNTER', card: null });
const attack = (run: Run, from: SlotId, type: 'FRONT' | 'SIDE' | 'DIRECT'): Run =>
  then(run, { kind: 'ATTACK', attack: { attacker: oid(run.state, at(run.state, run.state.turn!.player, from)), type } });
const activate = (run: Run, from: SlotId, ability: number): Run =>
  then(run, { kind: 'MAIN', action: { type: 'ACTIVATE', card: oid(run.state, at(run.state, 0, from)), ability } });
const canActivate = (run: Run, from: SlotId): boolean =>
  pending(run.state, 'MAIN').actions.some((a) => a.type === 'ACTIVATE' && a.card === oid(run.state, at(run.state, 0, from)));
const inHand = (state: GameState, player: PlayerId, cardId: string): number => state.zones[player].hand.find((i) => getInstance(state, i).cardId === cardId)!;
const playCharacter = (run: Run, cardId: string, to: SlotId): Run =>
  then(run, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(run.state, inHand(run.state, 0, cardId)), slot: to } });
const asks = (run: Run, kind: Decision['kind'], prompt?: string): boolean =>
  run.state.pending?.kind === kind && (prompt === undefined || (run.state.pending as { prompt?: string }).prompt === prompt);
/** Of the abilities that wait, the card's ability with this index is played first (default: any ability of a card before アンコール). */
const abilityFirst = (run: Run, index?: number): Run => {
  if (run.state.pending?.kind !== 'CHOOSE_ABILITY') return run;
  const waiting = run.state.pending.abilities;
  const wanted = waiting.find((a) => a.type === 'CARD' && (index === undefined || a.ability === index)) ?? waiting[0]!;
  return then(run, { kind: 'CHOOSE_ABILITY', id: wanted.id });
};
const dealt = (run: Run): number[] => run.events.flatMap((e) => (e.type === 'DAMAGE_DEALT' ? [e.amount] : []));
const paid = (run: Run): string[] => run.events.flatMap((e) => (e.type === 'CARD_MOVED' && e.reason === 'COST' ? [`${e.from.zone}>${e.to.zone}`] : []));
const reversed = (run: Run): string[] => run.events.flatMap((e) => (e.type === 'ORIENTATION_CHANGED' && e.to === 'REVERSE' ? [getInstance(run.state, e.instanceId).cardId] : []));
const played = (run: Run, cardId: string): number => run.events.filter((e) => e.type === 'ABILITY_PLAYED' && getInstance(run.state, e.instanceId).cardId === cardId).length;
const printed = (cardId: string) => getCard(cardId).def;
const ability = (cardId: string, index: number) => printed(cardId).abilities![index];
const zone = (player: PlayerId, name: 'waitingRoom' | 'hand' | 'stock' | 'level' | 'clock' | 'memory' | 'climax') => ({ player, zone: name }) as const;
const zoneCards = (state: GameState, player: PlayerId, name: 'waitingRoom' | 'hand' | 'stock' | 'memory' | 'deck'): string[] => names(state, state.zones[player][name]).sort();
const topCard = (state: GameState, player: PlayerId): string => getInstance(state, state.zones[player].deck[state.zones[player].deck.length - 1]!).cardId;
/** Nothing is done at every decision (no card played, no attack, no cost paid), until `stop` holds. */
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
const decides = (player: PlayerId, kind: Decision['kind']) => (state: GameState) => state.pending?.kind === kind && state.pending.player === player;

const TEXT = {
  sts016: '【自】［手札を1枚控え室に置く］ このカードが舞台から控え室に置かれた時、あなたはコストを払ってよい。そうしたら、あなたは自分の山札の上から2枚を、控え室に置き、自分の控え室のレベルＸ以下の、《巡遊者》か《魔王》のキャラを1枚まで選び、手札に戻す。この効果で控え室に置かれたカードにCXがあるなら、あなたは自分の山札の上から1枚を、ストック置場に置いてよい。Ｘはこの効果で控え室に置かれたカードのレベルの合計に等しい。（CXのレベルは0として扱う）',
  sts040: '【自】 相手のアタックフェイズの始めに、あなたのキャラすべてが《巡遊者》か《魔王》なら、あなたは自分の山札の上から1枚を、控え室に置いてよい。そのカードがレベル2以下のキャラなら、そのターン中、このカードは次の能力を得る。『【自】 このカードがフロントアタックされた時、あなたはこのカードを手札に戻してよい。』',
  sts059: '【自】【CXコンボ】 このカードがアタックした時、CX置場に「その願い、たしかに引き受けた」があるなら、あなたは自分の山札の上から1枚を、控え室に置いてよい。そのカードが《巡遊者》か《魔王》のキャラかイベントなら、あなたはそのカードを手札に戻し、自分の山札の上から1枚を、控え室に置いてよい。そのカードが《巡遊者》か《魔王》のキャラかイベントなら、あなたはそのカードを手札に戻す。',
  sts077: '【起】［手札を1枚控え室に置き、【スタンド】しているこのカードを控え室に置く］ あなたは自分の控え室のレベル1以上のキャラを1枚選び、手札に戻し、あなたの、思い出とマーカー置場のカードの合計が2枚以下なら、あなたは自分の控え室の「森のうっかりさん テレサ」を1枚まで選び、思い出にする。',
  anm029: '【自】【CXコンボ】 このカードがアタックした時、CX置場に「嘘つきなさよなら」があり、他のあなたの《風》のキャラが3枚以上なら、あなたは自分の控え室の《風》のキャラを1枚まで選び、手札に戻す。選んだキャラのレベルが3以上なら、あなたは自分の手札を1枚選び、ストック置場に置いてよい。',
  anm030: '【自】 このカードが手札から舞台に置かれた時、あなたは自分の山札を上から4枚まで見て、「“風の便りを届けに”小詠」を1枚まで選び、舞台の好きな枠に置き、残りのカードを控え室に置く。',
  anm046: 'あなたは自分の山札の上から4枚を、控え室に置き、自分の控え室のレベルＸ以下の《風》のキャラを1枚まで選び、手札に戻す。Ｘはそれらのカードのトリガーアイコンの[[soul.gif]]の合計に等しい。',
  anm080: '【起】［(1) このカードを控え室に置く］ あなたは自分のキャラを1枚選び、そのターン中、パワーを＋2000し、あなたの思い出が4枚以下なら、あなたは自分の控え室の「“風が見る夢”愛乃」を2枚まで選び、思い出にする。',
  anm090: '【起】［手札を1枚控え室に置き、このカードを控え室に置く］ あなたは自分の控え室のカード名に「朱比華」か「六花」か「陽彩」か「愛乃」を含むキャラを1枚選び、手札に戻す。',
  nik099: '【自】 このカードが手札から舞台に置かれた時、すべてのプレイヤーは自分の山札の上から1枚を、控え室に置く。あなたのこの効果で控え室に置かれたカードのレベルが相手のこの効果で控え室に置かれたカードのレベルより高いなら、あなたは1枚引いてよい。（CXのレベルは0として扱う）',
  gup089: '【自】【CXコンボ】［手札を1枚控え室に置く］ このカードのアタックの終わりに、CX置場に「冬ごもりの準備」があり、他のあなたの《戦車道》のキャラが2枚以上なら、あなたはコストを払ってよい。そうしたら、あなたは自分の控え室の《戦車道》のキャラを1枚まで選び、手札に戻し、次の相手のターンの終わりまで、このカードのレベルを＋2し、このカードは次の能力を得る。『【自】 このカードがフロントアタックされた時、あなたはこのカードを手札に戻してよい。』',
};
const BACK_WHEN_ATTACKED = { type: 'AUTO', trigger: { on: 'THIS_FRONT_ATTACKED' }, optional: true, effect: [{ do: 'MOVE', target: { who: 'SELF' }, to: 'HAND' }] };

// ---------------------------------------------------------------------------------------------------------

describe('reading the new wordings', () => {
  const unknown = (line: string) => readLine(line).unknown.map((u) => u.part);
  const effectOf = (line: string) => (readLine(line).line!.ability as { effect: unknown[] }).effect;

  it('the cards put into the waiting room by the effect: Ｘ from their levels, a climax among them', () => {
    expect(effectOf(TEXT.sts016)).toEqual([
      { do: 'DECK_TOP', count: 2, to: 'WAITING_ROOM', setX: 'LEVEL_TOTAL', said: 'THIS_EFFECT' },
      { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { kind: 'CHARACTER', traits: ['巡遊者', '魔王'] }, min: 0, max: 1, levelMaxX: true },
      { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
      { do: 'IF', condition: { if: 'LAST_MOVED', min: 1, filter: { kind: 'CLIMAX' }, said: 'THIS_EFFECT' }, then: [{ do: 'MAY', effects: [{ do: 'DECK_TOP', count: 1, to: 'STOCK' }] }] },
    ]);
    // "この効果で控え室に置かれたカードに…" needs the cards of this effect: not after "それらのカードのレベルの合計".
    expect(readLine(TEXT.sts016.replace('Ｘはこの効果で控え室に置かれたカードのレベルの合計', 'Ｘはそれらのカードのレベルの合計')).line).toBeNull();
  });

  it('Ｘ from the soul icons of the cards (an event)', () => {
    expect(readEvent(TEXT.anm046)!.effect).toEqual([
      { do: 'DECK_TOP', count: 4, to: 'WAITING_ROOM', setX: 'SOUL_ICONS' },
      { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { kind: 'CHARACTER', traits: ['風'] }, min: 0, max: 1, levelMaxX: true },
      { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
    ]);
    // Another icon is not read as the soul icon.
    expect(readEvent(TEXT.anm046.replace('[[soul.gif]]', '[[draw.gif]]'))).toBeNull();
  });

  it('one card from each deck, the levels compared: exactly this pair of sentences, one card each', () => {
    expect(effectOf(TEXT.nik099)).toEqual([
      { do: 'DECK_TOP', count: 1, to: 'WAITING_ROOM', whose: 'EVERYONE' },
      { do: 'IF', condition: { if: 'MOVED_LEVEL_HIGHER' }, then: [{ do: 'MAY', effects: [{ do: 'DRAW', count: 1 }] }] },
    ]);
    expect(readLine(TEXT.nik099.replace('上から1枚を', '上から2枚を')).line).toBeNull();
    expect(readLine(TEXT.nik099.replace('より高いなら', 'より低いなら')).line).toBeNull();
    // The comparison alone, without the cards of both players before it.
    expect(readLine(TEXT.nik099.replace('すべてのプレイヤーは自分の山札の上から1枚を、控え室に置く。', '')).line).toBeNull();
  });

  it('1枚を、控え室に置いてよい。そのカードが…なら、…: the card put there; a second "…してよい" inside is not read', () => {
    expect(effectOf(TEXT.sts040)).toEqual([
      { do: 'DECK_TOP', count: 1, to: 'WAITING_ROOM', upTo: true, may: true },
      { do: 'IF', condition: { if: 'LAST_MOVED', min: 1, filter: { kind: 'CHARACTER', levelMax: 2 }, said: 'THAT_CARD' }, then: [{ do: 'GRANT', target: { who: 'SELF' }, ability: BACK_WHEN_ATTACKED }] },
    ]);
    // The ability itself is not optional: only the card of the deck is.
    expect(readLine(TEXT.sts040).line!.ability).not.toHaveProperty('optional');
    // STS/W140-059: "…手札に戻し、…置いてよい" does not say whether taking the card back is part of the choice.
    expect(readLine(TEXT.sts059).line).toBeNull();
    expect(() => getCard(STS(59))).not.toThrow();
    expect(printed(STS(59)).abilities ?? []).toHaveLength(0);
  });

  it('このカードがフロントアタックされた時: a trigger of the card itself', () => {
    expect(readLine('【自】 このカードがフロントアタックされた時、あなたはこのカードを手札に戻してよい。').line!.ability).toEqual(BACK_WHEN_ATTACKED);
    expect(unknown('【自】 このカードがサイドアタックされた時、あなたはこのカードを手札に戻してよい。')).toEqual(['TRIGGER']);
  });

  it('選んだキャラのレベルがN以上なら: only right after one character was chosen and moved', () => {
    expect(effectOf(TEXT.anm029)).toEqual([
      { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { kind: 'CHARACTER', traits: ['風'] }, min: 0, max: 1 },
      { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
      { do: 'IF', condition: { if: 'MOVED_CARD', filter: { levelMin: 3 } }, then: [{ do: 'MAY', effects: [{ do: 'CHOOSE', from: 'YOUR_HAND', min: 1, max: 1 }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'STOCK' }] }] },
    ]);
    expect(readLine(TEXT.anm029).line!.ability).not.toHaveProperty('optional');
    expect(readLine('【自】 このカードがアタックした時、あなたは1枚引く。選んだキャラのレベルが3以上なら、あなたは自分の手札を1枚選び、ストック置場に置いてよい。').line).toBeNull();
    expect(readLine(TEXT.anm029.replace('1枚まで選び、手札に戻す', '2枚まで選び、手札に戻す')).line).toBeNull();
  });

  it('…し、あなたの…なら、あなたは…: the second action only under the condition', () => {
    const when = (line: string) => (effectOf(line)[2] as { condition: unknown; joined: boolean; then: unknown[] });
    expect(when(TEXT.sts077)).toMatchObject({ do: 'IF', condition: { if: 'COUNT', where: 'YOUR_MEMORY_AND_MARKERS', max: 2 }, joined: true });
    expect(when(TEXT.sts077).then).toEqual([{ do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { name: '森のうっかりさん テレサ' }, min: 0, max: 1 }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'MEMORY' }]);
    expect(effectOf(TEXT.sts077).slice(0, 2)).toEqual([{ do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { kind: 'CHARACTER', levelMin: 1 }, min: 1, max: 1 }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' }]);
    expect(when(TEXT.anm080)).toMatchObject({ do: 'IF', condition: { if: 'COUNT', where: 'YOUR_MEMORY', max: 4 }, joined: true });
    expect(effectOf(TEXT.anm080).slice(0, 2)).toEqual([{ do: 'CHOOSE', from: 'YOUR_STAGE', min: 1, max: 1 }, { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'POWER', amount: 2000 }]);
    // A condition that is not known stays unknown.
    expect(readLine(TEXT.anm080.replace('あなたの思い出が4枚以下なら', 'あなたの思い出が偶数なら')).line).toBeNull();
  });

  it('カード名に「A」か「B」か「C」か「D」を含むキャラ: any number of words', () => {
    expect(effectOf(TEXT.anm090)).toEqual([
      { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { kind: 'CHARACTER', nameIncludesAny: ['朱比華', '六花', '陽彩', '愛乃'] }, min: 1, max: 1 },
      { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
    ]);
  });

  it('…を1枚まで選び、舞台の好きな枠に置き、残りのカードを控え室に置く: a character only', () => {
    expect(effectOf(TEXT.anm030)).toEqual([{ do: 'LOOK_TOP', upTo: 4, pick: { name: '“風の便りを届けに”小詠' }, toStage: true }]);
    expect(readLine(TEXT.anm030.replace('「“風の便りを届けに”小詠」', 'CX')).line).toBeNull();
    expect(readLine(TEXT.anm030.replace('「“風の便りを届けに”小詠」', '《風》のキャラ')).line).not.toBeNull();
  });

  it('the ten cards: every ability of each card is in its data', () => {
    expect(printed(STS(16)).abilities).toEqual([readLine(TEXT.sts016).line!.ability]);
    expect(printed(STS(40)).abilities).toHaveLength(2);
    expect(ability(STS(40), 0)).toEqual({ type: 'CONT', noStand: true, apply: [] });
    expect(ability(STS(40), 1)).toEqual(readLine(TEXT.sts040).line!.ability);
    expect(ability(STS(40), 1)).toMatchObject({ trigger: { on: 'PHASE_START', phase: 'ATTACK', turn: 'OPPONENT' }, condition: { if: 'ALL_CHARACTERS', filter: { traits: ['巡遊者', '魔王'] } } });
    expect(printed(STS(77)).abilities).toHaveLength(3);
    expect(ability(STS(77), 0)).toEqual(readLine(TEXT.sts077).line!.ability);
    expect(ability(STS(77), 0)).toMatchObject({ type: 'ACT', cost: [{ pay: 'DISCARD', count: 1 }, { pay: 'SELF_TO_WAITING_ROOM', standing: true }] });
    expect(ability(STS(77), 1)).toMatchObject({ type: 'CONT', recollection: true });
    expect(ability(STS(77), 2)).toMatchObject({ type: 'CONT', zone: 'MARKER', condition: { if: 'YOUR_TURN' }, apply: [{ target: { who: 'MARKER_HOLDER' }, stat: 'POWER', amount: 1000 }] });
    expect(printed(ANM(29)).abilities).toHaveLength(2);
    expect(ability(ANM(29), 0)).toMatchObject({ type: 'CONT', apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: 1500, perCount: { where: 'YOUR_MEMORY', filter: { name: '一人前の郵便屋になるために' } } }] });
    expect(ability(ANM(29), 1)).toEqual(readLine(TEXT.anm029).line!.ability);
    expect(ability(ANM(29), 1)).toMatchObject({ keywords: ['CX_COMBO'], trigger: { on: 'ATTACKS' }, condition: { if: 'ALL', of: [{ if: 'CLIMAX_IN_PLAY', name: '嘘つきなさよなら' }, { if: 'CHARACTERS', min: 3, other: true }] } });
    expect(printed(ANM(30)).abilities).toHaveLength(2);
    expect(ability(ANM(30), 0)).toEqual(readLine(TEXT.anm030).line!.ability);
    expect(ability(ANM(30), 1)).toMatchObject({ trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' }, cost: [{ pay: 'STOCK', count: 1 }], effect: [{ do: 'SWAP_DECK_HAND', filter: { kind: 'CLIMAX' } }, { do: 'SHUFFLE' }] });
    expect(printed(ANM(46))).toMatchObject({ kind: 'EVENT', level: 1, effect: readEvent(TEXT.anm046)!.effect });
    expect(printed(ANM(80)).abilities).toHaveLength(2);
    expect(ability(ANM(80), 0)).toMatchObject({ type: 'CONT', assist: true, apply: [{ target: { who: 'IN_FRONT', filter: { levelMax: 0 } }, stat: 'POWER', amount: 1000 }] });
    expect(ability(ANM(80), 1)).toEqual(readLine(TEXT.anm080).line!.ability);
    expect(ability(ANM(80), 1)).toMatchObject({ cost: [{ pay: 'STOCK', count: 1 }, { pay: 'SELF_TO_WAITING_ROOM' }] });
    expect(printed(ANM(90)).abilities).toHaveLength(2);
    expect(ability(ANM(90), 0)).toMatchObject({ trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' }, optional: true, effect: [{ do: 'EXCHANGE_ZONES', count: 1 }] });
    expect(ability(ANM(90), 1)).toEqual(readLine(TEXT.anm090).line!.ability);
    expect(printed(NIK(99)).abilities).toHaveLength(2);
    expect(ability(NIK(99), 0)).toMatchObject({ trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' }, effect: [{ do: 'TOP_OR_BOTTOM' }] });
    expect(ability(NIK(99), 1)).toEqual(readLine(TEXT.nik099).line!.ability);
    expect(printed(GUP(89)).abilities).toHaveLength(2);
    expect(ability(GUP(89), 0)).toMatchObject({ type: 'CONT', apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: 4000 }] });
    expect(ability(GUP(89), 1)).toEqual(readLine(TEXT.gup089).line!.ability);
    expect(ability(GUP(89), 1)).toMatchObject({
      keywords: ['CX_COMBO'],
      trigger: { on: 'ATTACK_END' },
      cost: [{ pay: 'DISCARD', count: 1 }],
      effect: [
        { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { kind: 'CHARACTER', traits: ['戦車道'] }, min: 0, max: 1 },
        { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
        { do: 'MODIFY', target: { who: 'SELF' }, stat: 'LEVEL', amount: 2, until: 'NEXT_OPPONENT_TURN' },
        { do: 'GRANT', target: { who: 'SELF' }, ability: BACK_WHEN_ATTACKED, until: 'NEXT_OPPONENT_TURN' },
      ],
    });
  });
});

// ---------------------------------------------------------------------------------------------------------

describe('STS/W140-016 多忙な上司に休日を フィレン', () => {
  /**
   * The card is reversed and alone in the front row: nobody can attack, the encore step puts it into the
   * waiting room. `tops` are the top cards of the deck. Levels 3 (STS-003) and 2 (STS-021) wait in the waiting room.
   */
  const setup = (tops: string[], withHand = true) =>
    game('STS_W140', { step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, STS(16), stageSlot(0, 'FC'), { orientation: 'REVERSE' });
      if (withHand) take(ctx, 0, STS(68), zone(0, 'hand'));
      take(ctx, 0, STS(3), zone(0, 'waitingRoom'));
      take(ctx, 0, STS(21), zone(0, 'waitingRoom'));
      stackTop(ctx, 0, tops);
    });
  const pay = (run: Run): Run => pick(accept(abilityFirst(run)), [STS(68)]);

  it('the cards used here', () => {
    expect([STS(68), STS(36), STS(21), STS(3)].map((c) => printed(c).level)).toEqual([0, 1, 2, 3]);
    expect(printed(STS(31)).kind).toBe('CLIMAX');
    expect(printed(STS(29))).toMatchObject({ kind: 'EVENT', level: 1 });
    // Every character of this booster is 《巡遊者》 or 《魔王》: a character without them cannot be tried with real cards.
  });

  it('put into the waiting room from the stage: the cost may be paid; Ｘ is the total of the levels of the two cards', () => {
    const start = abilityFirst(setup([STS(36), STS(21), STS(2)]));
    expect(pending(start.state, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST', cardId: STS(16) });
    const run = pick(accept(start), [STS(68)]);
    expect(paid(run)).toEqual(['hand>waitingRoom']);
    // Ｘ = 1 + 2: every character of the waiting room of level 3 or lower, the card itself and the cards just put there too.
    expect(offered(run)).toEqual([STS(3), STS(16), STS(21), STS(21), STS(36), STS(68)].sort());
    expect(pending(run.state, 'SELECT_CARDS').min).toBe(0);
    const taken = pick(run, [STS(3)]);
    expect(zoneCards(taken.state, 0, 'hand')).toEqual([STS(3)]);
    // No climax among the two cards: nothing is asked about the stock.
    expect(asks(taken, 'CONFIRM', 'USE_ABILITY')).toBe(false);
    expect(taken.state.zones[0].stock).toHaveLength(0);
    expect(topCard(taken.state, 0)).toBe(STS(2));
  });

  it('a climax among the two: it counts as level 0, and the top card of the deck may be put into the stock', () => {
    const run = pay(setup([STS(31), STS(36), STS(2)]));
    // Ｘ = 0 + 1: not the level 2 and level 3 characters.
    expect(offered(run)).toEqual([STS(16), STS(36), STS(68)].sort());
    const taken = pick(run, [STS(36)]);
    expect(asks(taken, 'CONFIRM', 'USE_ABILITY')).toBe(true);
    expect(zoneCards(accept(taken).state, 0, 'stock')).toEqual([STS(2)]);
    const kept = decline(taken);
    expect(kept.state.zones[0].stock).toHaveLength(0);
    expect(topCard(kept.state, 0)).toBe(STS(2));
  });

  it('the card itself may be taken back; no card taken: the stock is still asked about', () => {
    const run = pay(setup([STS(31), STS(31), STS(2)]));
    // Ｘ = 0: level 0 characters only.
    expect(offered(run)).toEqual([STS(16), STS(68)].sort());
    const back = pick(run, [STS(16)]);
    expect(zoneCards(back.state, 0, 'hand')).toEqual([STS(16)]);
    expect(asks(back, 'CONFIRM', 'USE_ABILITY')).toBe(true);
    expect(asks(pick(run, []), 'CONFIRM', 'USE_ABILITY')).toBe(true);
  });

  it('an event among the two counts with its level and is not a climax', () => {
    const run = pay(setup([STS(29), STS(68), STS(2)]));
    expect(offered(run)).toEqual([STS(16), STS(68), STS(68)].sort());
    expect(asks(pick(run, []), 'CONFIRM', 'USE_ABILITY')).toBe(false);
  });

  it('the cost not paid, or no card in the hand to pay with: no card leaves the deck', () => {
    const declined = decline(abilityFirst(setup([STS(36), STS(21), STS(2)])));
    expect(topCard(declined.state, 0)).toBe(STS(36));
    expect(zoneCards(declined.state, 0, 'hand')).toEqual([STS(68)]);
    const broke = abilityFirst(setup([STS(36), STS(21), STS(2)], false));
    expect(asks(broke, 'CONFIRM', 'PAY_COST')).toBe(false);
    expect(topCard(broke.state, 0)).toBe(STS(36));
  });
});

describe('STS/W140-040 カモメのポテト ラール', () => {
  /** The opponent's attack phase begins. The card (power 4000) faces STS-002 (power 3000). `top` is the top card of the deck. */
  const setup = (top: string) =>
    game('STS_W140', { step: 'ATTACK_START', turnPlayer: 1 }, (ctx) => {
      take(ctx, 0, STS(40), stageSlot(0, 'FC'));
      take(ctx, 0, STS(68), stageSlot(0, 'BL'));
      take(ctx, 1, STS(2), stageSlot(1, 'FC'));
      stackTop(ctx, 0, [top, STS(35), STS(35)]);
      stackTop(ctx, 1, [STS(68), STS(68)]);
    });
  const granted = (state: GameState) => state.grants.filter((g) => g.objectId === oid(state, at(state, 0, 'FC')));

  it('the opponent’s attack phase begins: the top card may be put into the waiting room; a level 1 character gives the ability', () => {
    const start = setup(STS(36));
    expect(pending(start.state, 'CONFIRM')).toMatchObject({ player: 0, prompt: 'DECK_TOP_NEXT' });
    const milled = accept(start);
    expect(zoneCards(milled.state, 0, 'waitingRoom')).toEqual([STS(36)]);
    expect(granted(milled.state).map((g) => g.ability)).toEqual([BACK_WHEN_ATTACKED]);
    // Front attacked: its player may take it back to the hand.
    const attacked = attack(milled, 'FC', 'FRONT');
    expect(pending(attacked.state, 'CONFIRM')).toMatchObject({ player: 0, prompt: 'USE_ABILITY', cardId: STS(40) });
    const taken = noCounter(accept(attacked));
    // (The opponent has no other attacker: the game has gone on to the next turn, with its draw.)
    expect(zoneCards(taken.state, 0, 'hand')).toContain(STS(40));
    expect(taken.state.zones[0].stage.FC).toEqual([]);
    // CR-7.6.1.3: nobody is reversed; the attack still deals its soul (1, no bonus of a direct attack).
    expect(reversed(taken)).toEqual([]);
    expect(dealt(taken)).toEqual([1]);
  });

  it('the ability not used: the battle takes place (4000 against 3000)', () => {
    const fought = noCounter(decline(attack(accept(setup(STS(21))), 'FC', 'FRONT')));
    expect(reversed(fought)).toEqual([STS(2)]);
    expect(names(fought.state, fought.state.zones[0].stage.FC)).toEqual([STS(40)]);
  });

  it('a side attack does not trigger it', () => {
    const side = attack(accept(setup(STS(36))), 'FC', 'SIDE');
    expect(asks(side, 'CONFIRM', 'USE_ABILITY')).toBe(false);
    expect(dealt(side)).toHaveLength(1);
    expect(played(side, STS(40))).toBe(1);
    expect(names(side.state, side.state.zones[0].stage.FC)).toEqual([STS(40)]);
  });

  it.each([
    ['a level 3 character', STS(3)],
    ['a climax', STS(31)],
    ['an event', STS(29)],
  ])('%s put into the waiting room: no ability', (_name, top) => {
    const milled = accept(setup(top));
    expect(zoneCards(milled.state, 0, 'waitingRoom')).toEqual([top]);
    expect(granted(milled.state)).toEqual([]);
    const attacked = attack(milled, 'FC', 'FRONT');
    expect(asks(attacked, 'CONFIRM', 'USE_ABILITY')).toBe(false);
  });

  it('置いてよい: declined, the card stays on top of the deck and there is no ability', () => {
    const kept = decline(setup(STS(36)));
    expect(topCard(kept.state, 0)).toBe(STS(36));
    expect(granted(kept.state)).toEqual([]);
  });

  it('そのターン中: the ability is gone in the next turn', () => {
    const next = until(accept(setup(STS(36))), decides(0, 'MAIN'));
    expect(names(next.state, next.state.zones[0].stage.FC)).toEqual([STS(40)]);
    expect(granted(next.state)).toEqual([]);
  });

  it('このカードはあなたのスタンドフェイズに【スタンド】しない', () => {
    const run = game('STS_W140', { step: 'STAND_START' }, (ctx) => {
      take(ctx, 0, STS(40), stageSlot(0, 'FC'), { orientation: 'REST' });
      take(ctx, 0, STS(68), stageSlot(0, 'FL'), { orientation: 'REST' });
    });
    expect(getInstance(run.state, at(run.state, 0, 'FC')).orientation).toBe('REST');
    expect(getInstance(run.state, at(run.state, 0, 'FL')).orientation).toBe('STAND');
  });
});

describe('STS/W140-077 森のうっかりさん テレサ', () => {
  /** `memory` cards in memory, a marker under the left character or not; STS-002 (level 1) in the waiting room or not. */
  const setup = (memory: number, marker = false, options: { rested?: boolean; levelOne?: boolean } = {}) =>
    game('STS_W140', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, STS(77), stageSlot(0, 'FC'), options.rested ? { orientation: 'REST' } : {});
      take(ctx, 0, STS(35), stageSlot(0, 'FL'));
      take(ctx, 0, STS(68), zone(0, 'hand'));
      if (options.levelOne !== false) take(ctx, 0, STS(2), zone(0, 'waitingRoom'));
      for (let k = 0; k < memory; k++) take(ctx, 0, STS(9), zone(0, 'memory'));
      if (marker) take(ctx, 0, STS(1), { player: 0, zone: 'marker', slot: 'FL' });
    });
  const use = (run: Run): Run => pick(activate(run, 'FC', 0), [STS(68)]);

  it.each([
    [0, false],
    [2, false],
    [1, true],
  ])('memory %i, a marker %s: a level 1 character comes back, then the card itself may go from the waiting room into memory', (memory, marker) => {
    const run = use(setup(memory, marker));
    expect(paid(run)).toEqual(['hand>waitingRoom', 'stage>waitingRoom']);
    // 1枚選び: the level 1 character (the level 0 cards just paid are not offered).
    expect(offered(run)).toEqual([STS(2)]);
    expect(pending(run.state, 'SELECT_CARDS').min).toBe(1);
    const back = pick(run, [STS(2)]);
    expect(zoneCards(back.state, 0, 'hand')).toEqual([STS(2)]);
    expect(offered(back)).toEqual([STS(77)]);
    expect(pending(back.state, 'SELECT_CARDS').min).toBe(0);
    const kept = pick(back, [STS(77)]);
    expect(zoneCards(kept.state, 0, 'memory').filter((c) => c === STS(77))).toHaveLength(1);
    expect(kept.state.zones[0].memory).toHaveLength(memory + 1);
    // 1枚まで: it may stay in the waiting room.
    expect(zoneCards(pick(back, []).state, 0, 'waitingRoom')).toEqual([STS(68), STS(77)].sort());
  });

  it.each([
    [3, false],
    [2, true],
  ])('memory %i, a marker %s (3 together): the character comes back, nothing goes into memory', (memory, marker) => {
    const back = pick(use(setup(memory, marker)), [STS(2)]);
    expect(zoneCards(back.state, 0, 'hand')).toEqual([STS(2)]);
    expect(back.state.pending?.kind).toBe('MAIN');
    expect(back.state.zones[0].memory).toHaveLength(memory);
  });

  it('no level 1 character in the waiting room: the second part is done all the same', () => {
    const run = use(setup(0, false, { levelOne: false }));
    expect(offered(run)).toEqual([STS(77)]);
    expect(run.state.zones[0].hand).toHaveLength(0);
  });

  it('【スタンド】しているこのカード: a rested card cannot pay; neither can a player without a hand', () => {
    expect(canActivate(setup(0), 'FC')).toBe(true);
    expect(canActivate(setup(0, false, { rested: true }), 'FC')).toBe(false);
    const noHand = game('STS_W140', { step: 'MAIN_START' }, (ctx) => take(ctx, 0, STS(77), stageSlot(0, 'FC')));
    expect(canActivate(noHand, 'FC')).toBe(false);
  });
});

describe('ANM/W138-029 “風の便りを届けに”小詠', () => {
  /** The card in the centre, `others` other characters, the climax or not. ANM-002 (level 3) and ANM-010 (level 1) in the waiting room. */
  const setup = (options: { climax?: boolean; others?: number } = {}) =>
    game('ANM_W138', { step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, ANM(29), stageSlot(0, 'FC'));
      [ANM(5), ANM(9), ANM(16)].slice(0, options.others ?? 3).forEach((c, k) => take(ctx, 0, c, stageSlot(0, (['FL', 'BL', 'BR'] as const)[k]!)));
      if (options.climax !== false) take(ctx, 0, ANM(48), zone(0, 'climax'));
      take(ctx, 0, ANM(2), zone(0, 'waitingRoom'));
      take(ctx, 0, ANM(10), zone(0, 'waitingRoom'));
      take(ctx, 0, ANM(17), zone(0, 'hand'));
      stackTop(ctx, 0, [ANM(5), ANM(5)]);
      stackTop(ctx, 1, [ANM(9), ANM(9), ANM(9)]);
    });

  it('the cards used here', () => {
    expect(printed(ANM(48))).toMatchObject({ kind: 'CLIMAX', name: '嘘つきなさよなら' });
    expect([ANM(2), ANM(10)].map((c) => printed(c).level)).toEqual([3, 1]);
    expect(printed(ANM(45)).name).toBe('一人前の郵便屋になるために');
  });

  it('CX combo: a level 3 character taken back, then a card of the hand may be put into the stock', () => {
    const run = attack(setup(), 'FC', 'DIRECT');
    expect(offered(run)).toEqual([ANM(2), ANM(10)].sort());
    expect(pending(run.state, 'SELECT_CARDS').min).toBe(0);
    const taken = pick(run, [ANM(2)]);
    expect(pending(taken.state, 'CONFIRM')).toMatchObject({ player: 0, prompt: 'USE_ABILITY' });
    const choosing = accept(taken);
    // 自分の手札を1枚: the card just taken back is one of them.
    expect(offered(choosing)).toEqual([ANM(2), ANM(17)].sort());
    expect(pending(choosing.state, 'SELECT_CARDS').min).toBe(1);
    const stocked = pick(choosing, [ANM(17)]);
    expect(names(stocked.state, stocked.state.zones[0].stock)).toContain(ANM(17));
    expect(zoneCards(stocked.state, 0, 'hand')).toEqual([ANM(2)]);
    // Declined: both cards stay in the hand.
    expect(zoneCards(decline(taken).state, 0, 'hand')).toEqual([ANM(2), ANM(17)].sort());
  });

  it('a level 1 character taken back, or none: nothing is asked about the hand', () => {
    const run = attack(setup(), 'FC', 'DIRECT');
    const lower = pick(run, [ANM(10)]);
    expect(zoneCards(lower.state, 0, 'hand')).toEqual([ANM(10), ANM(17)].sort());
    expect(asks(lower, 'CONFIRM', 'USE_ABILITY')).toBe(false);
    expect(asks(lower, 'SELECT_CARDS')).toBe(false);
    const none = pick(run, []);
    expect(asks(none, 'CONFIRM', 'USE_ABILITY')).toBe(false);
    expect(zoneCards(none.state, 0, 'hand')).toEqual([ANM(17)]);
  });

  it('without the climax, or with two other characters only: no ability', () => {
    for (const options of [{ climax: false }, { others: 2 }]) {
      const run = attack(setup(options), 'FC', 'DIRECT');
      expect(played(run, ANM(29))).toBe(0);
      expect(zoneCards(run.state, 0, 'waitingRoom')).toEqual([ANM(2), ANM(10)].sort());
    }
  });

  it('記憶: +1500 for each 一人前の郵便屋になるために in memory', () => {
    const run = game('ANM_W138', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, ANM(29), stageSlot(0, 'FC'));
      take(ctx, 0, ANM(45), zone(0, 'memory'));
      take(ctx, 0, ANM(45), zone(0, 'memory'));
      take(ctx, 0, ANM(9), zone(0, 'memory'));
    });
    expect(getPower(run.state, at(run.state, 0, 'FC'))).toBe(printed(ANM(29)).power! + 3000);
  });
});

describe('ANM/W138-030 “さすらいの恐竜ハンター”玖琉未', () => {
  /** The card in the hand (level 1, green: a copy in the level zone), ANM-016 in the left front slot. */
  const setup = (tops: string[]) =>
    game('ANM_W138', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, ANM(30), zone(0, 'hand'));
      take(ctx, 0, ANM(30), zone(0, 'level'));
      take(ctx, 0, ANM(16), stageSlot(0, 'FL'));
      stackTop(ctx, 0, tops);
    });
  const TOPS = [ANM(5), ANM(29), ANM(10), ANM(9), ANM(17)];
  /** Played to the centre; the first ability first; `count` cards are looked at. */
  const look = (run: Run, count: number): Run => {
    let current = abilityFirst(playCharacter(run, ANM(30), 'FC'), 0);
    for (let k = 0; k < count; k++) {
      expect(pending(current.state, 'CONFIRM').prompt).toBe('LOOK_NEXT');
      current = accept(current);
    }
    return count < 4 ? decline(current) : current;
  };

  it('played from the hand: of the top four cards, 「“風の便りを届けに”小詠」 goes to the slot chosen, the others to the waiting room', () => {
    const run = look(setup(TOPS), 4);
    expect(offered(run)).toEqual([ANM(29)]);
    expect(pending(run.state, 'SELECT_CARDS').min).toBe(0);
    const choosing = pick(run, [ANM(29)]);
    expect(pending(choosing.state, 'SELECT_SLOT').slots).toEqual(['FL', 'FC', 'FR', 'BL', 'BR']);
    const placed = slot(choosing, 'FR');
    expect(names(placed.state, placed.state.zones[0].stage.FR)).toEqual([ANM(29)]);
    expect(getInstance(placed.state, at(placed.state, 0, 'FR')).orientation).toBe('STAND');
    expect(zoneCards(placed.state, 0, 'waitingRoom')).toEqual([ANM(5), ANM(10), ANM(9)].sort());
    expect(topCard(placed.state, 0)).toBe(ANM(17));
    // The second ability needs (1): no stock, so it is not offered.
    expect(placed.state.pending?.kind).toBe('MAIN');
  });

  it('好きな枠: a slot with a character, that character goes to the waiting room; the slot of the card itself too', () => {
    const choosing = pick(look(setup(TOPS), 4), [ANM(29)]);
    const overLeft = slot(choosing, 'FL');
    expect(names(overLeft.state, overLeft.state.zones[0].stage.FL)).toEqual([ANM(29)]);
    expect(zoneCards(overLeft.state, 0, 'waitingRoom')).toContain(ANM(16));
    const overItself = slot(choosing, 'FC');
    expect(names(overItself.state, overItself.state.zones[0].stage.FC)).toEqual([ANM(29)]);
    expect(zoneCards(overItself.state, 0, 'waitingRoom')).toContain(ANM(30));
  });

  it('not taken, not among the cards, or fewer cards looked at: the cards looked at go to the waiting room', () => {
    const none = pick(look(setup(TOPS), 4), []);
    expect(asks(none, 'SELECT_SLOT')).toBe(false);
    expect(zoneCards(none.state, 0, 'waitingRoom')).toEqual([ANM(5), ANM(29), ANM(10), ANM(9)].sort());
    const absent = look(setup([ANM(5), ANM(13), ANM(10), ANM(9), ANM(17)]), 4);
    expect(asks(absent, 'SELECT_CARDS')).toBe(false);
    expect(zoneCards(absent.state, 0, 'waitingRoom')).toEqual([ANM(5), ANM(13), ANM(10), ANM(9)].sort());
    const one = look(setup(TOPS), 1);
    expect(zoneCards(one.state, 0, 'waitingRoom')).toEqual([ANM(5)]);
    expect(topCard(one.state, 0)).toBe(ANM(29));
  });

  it('the cards looked at are not shown to the opponent', () => {
    const run = look(setup(TOPS), 4);
    expect(Object.values(pending(run.state, 'SELECT_CARDS').look ?? {}).sort()).toEqual(TOPS.slice(0, 4).sort());
    const theirs = getPlayerView(run.state, 1);
    expect(theirs.decision).toMatchObject({ mine: false, kind: 'SELECT_CARDS' });
    expect(theirs.decision).not.toHaveProperty('decision');
    expect(theirs.sides[0].deck.every((c) => !('cardId' in c))).toBe(true);
  });
});

describe('ANM/W138-046 世界が壊れた日 (event)', () => {
  /** The event in the hand (level 1, green). Levels 3 (ANM-002), 2 (ANM-013) and 1 (ANM-010) in the waiting room. */
  const setup = (tops: string[]) =>
    game('ANM_W138', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, ANM(46), zone(0, 'hand'));
      take(ctx, 0, ANM(30), zone(0, 'level'));
      for (const c of [ANM(2), ANM(13), ANM(10)]) take(ctx, 0, c, zone(0, 'waitingRoom'));
      stackTop(ctx, 0, tops);
    });
  const play = (run: Run): Run => then(run, { kind: 'MAIN', action: { type: 'PLAY_EVENT', card: oid(run.state, inHand(run.state, 0, ANM(46))) } });

  it('the cards used here: their soul icons', () => {
    const souls = (c: string) => printed(c).triggers.filter((t) => t === 'SOUL').length;
    expect([ANM(26), ANM(4), ANM(5), ANM(48), ANM(9), ANM(16)].map(souls)).toEqual([2, 1, 0, 0, 0, 0]);
    expect(printed(ANM(26)).kind).toBe('CLIMAX');
    expect(printed(ANM(48)).triggers.length).toBeGreaterThan(0);
  });

  it('four cards to the waiting room; Ｘ is the number of their soul icons (two on one climax, one on a character)', () => {
    const run = play(setup([ANM(26), ANM(4), ANM(5), ANM(48)]));
    // Ｘ = 3: every 《風》 character of level 3 or lower, the two characters just put there too; not the climaxes.
    expect(offered(run)).toEqual([ANM(2), ANM(13), ANM(10), ANM(4), ANM(5)].sort());
    expect(pending(run.state, 'SELECT_CARDS').min).toBe(0);
    const taken = pick(run, [ANM(2)]);
    expect(zoneCards(taken.state, 0, 'hand')).toEqual([ANM(2)]);
    // The event itself is in the waiting room after it is done.
    expect(zoneCards(taken.state, 0, 'waitingRoom')).toEqual([ANM(13), ANM(10), ANM(26), ANM(4), ANM(5), ANM(48), ANM(46)].sort());
  });

  it('Ｘ = 2: not the level 3 character', () => {
    expect(offered(play(setup([ANM(26), ANM(5), ANM(9), ANM(48)])))).toEqual([ANM(13), ANM(10), ANM(5), ANM(9)].sort());
  });

  it('no soul icon: Ｘ = 0, level 0 characters only', () => {
    expect(offered(play(setup([ANM(5), ANM(9), ANM(48), ANM(16)])))).toEqual([ANM(5), ANM(9), ANM(16)].sort());
  });
});

describe('ANM/W138-080 “夢の終わりを願うために”愛乃', () => {
  /** The card in the back row behind ANM-005 (level 0) and ANM-010 (level 1); two 「“風が見る夢”愛乃」 in the waiting room. */
  const setup = (memory: number) =>
    game('ANM_W138', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, ANM(80), stageSlot(0, 'BL'));
      take(ctx, 0, ANM(5), stageSlot(0, 'FL'));
      take(ctx, 0, ANM(10), stageSlot(0, 'FC'));
      take(ctx, 0, ANM(17), zone(0, 'stock'));
      take(ctx, 0, ANM(79), zone(0, 'waitingRoom'));
      take(ctx, 0, ANM(79), zone(0, 'waitingRoom'));
      [ANM(9), ANM(9), ANM(9), ANM(16), ANM(16)].slice(0, memory).forEach((c) => take(ctx, 0, c, zone(0, 'memory')));
    });

  it('応援: the level 0 character in front has +1000, the level 1 character has not', () => {
    const run = setup(0);
    expect(printed(ANM(79)).name).toBe('“風が見る夢”愛乃');
    expect(getPower(run.state, at(run.state, 0, 'FL'))).toBe(printed(ANM(5)).power! + 1000);
    expect(getPower(run.state, at(run.state, 0, 'FC'))).toBe(printed(ANM(10)).power!);
  });

  it.each([0, 4])('memory %i: a character gets +2000 for the turn, then up to two 「“風が見る夢”愛乃」 go from the waiting room into memory', (memory) => {
    const run = activate(setup(memory), 'BL', 1);
    expect(paid(run)).toEqual(['stock>waitingRoom', 'stage>waitingRoom']);
    expect(offered(run)).toEqual([ANM(5), ANM(10)].sort());
    const boosted = pick(run, [ANM(10)]);
    expect(getPower(boosted.state, at(boosted.state, 0, 'FC'))).toBe(printed(ANM(10)).power! + 2000);
    // The card left the stage: its 応援 is gone.
    expect(getPower(boosted.state, at(boosted.state, 0, 'FL'))).toBe(printed(ANM(5)).power!);
    expect(offered(boosted)).toEqual([ANM(79), ANM(79)]);
    expect(pending(boosted.state, 'SELECT_CARDS')).toMatchObject({ min: 0, max: 2 });
    const both = pick(boosted, [ANM(79), ANM(79)]);
    expect(both.state.zones[0].memory).toHaveLength(memory + 2);
    expect(zoneCards(both.state, 0, 'waitingRoom')).toEqual([ANM(17), ANM(80)].sort());
    expect(pick(boosted, [ANM(79)]).state.zones[0].memory).toHaveLength(memory + 1);
    expect(pick(boosted, []).state.zones[0].memory).toHaveLength(memory);
  });

  it('memory 5: the +2000 only', () => {
    const boosted = pick(activate(setup(5), 'BL', 1), [ANM(5)]);
    expect(getPower(boosted.state, at(boosted.state, 0, 'FL'))).toBe(printed(ANM(5)).power! + 2000);
    expect(boosted.state.pending?.kind).toBe('MAIN');
    expect(boosted.state.zones[0].memory).toHaveLength(5);
  });
});

describe('ANM/W138-090 “でも誰に？”愛乃', () => {
  const WAITING = [ANM(2), ANM(5), ANM(52), ANM(28), ANM(63), ANM(56)];

  it('the cards used here: the names', () => {
    expect(WAITING.map((c) => printed(c).name)).toEqual(['“風の還り路”朱比華', '“温泉を堪能”六花', '“クレオメが咲き誇るこの場所で”陽彩', '“相性抜群で最強な”小詠', '“優しく心を蝕む呪い”玖琉未', '“かわいい子には旅をさせよ”穂乃夏']);
    expect(printed(ANM(17)).name).toBe('“ラジオ、はじめました”塁');
  });

  it('【起】: a character whose name contains 朱比華, 六花, 陽彩 or 愛乃 comes back from the waiting room, the card itself too', () => {
    const start = game('ANM_W138', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, ANM(90), stageSlot(0, 'FC'));
      take(ctx, 0, ANM(17), zone(0, 'hand'));
      for (const c of WAITING) take(ctx, 0, c, zone(0, 'waitingRoom'));
    });
    const run = pick(activate(start, 'FC', 1), [ANM(17)]);
    expect(paid(run)).toEqual(['hand>waitingRoom', 'stage>waitingRoom']);
    // Not 小詠, 玖琉未, 穂乃夏, nor 塁 (the card just discarded).
    expect(offered(run)).toEqual([ANM(2), ANM(5), ANM(52), ANM(90)].sort());
    expect(pending(run.state, 'SELECT_CARDS')).toMatchObject({ min: 1, max: 1 });
    expect(zoneCards(pick(run, [ANM(90)]).state, 0, 'hand')).toEqual([ANM(90)]);
    expect(zoneCards(pick(run, [ANM(52)]).state, 0, 'hand')).toEqual([ANM(52)]);
  });

  it('【自】: played from the hand, a 《風》 character of the waiting room and one of memory may change places', () => {
    const start = game('ANM_W138', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, ANM(90), zone(0, 'hand'));
      take(ctx, 0, ANM(2), zone(0, 'waitingRoom'));
      take(ctx, 0, ANM(5), zone(0, 'memory'));
    });
    const asked = playCharacter(start, ANM(90), 'FC');
    expect(pending(asked.state, 'CONFIRM')).toMatchObject({ prompt: 'USE_ABILITY', cardId: ANM(90) });
    let run = accept(asked);
    for (let k = 0; k < 4 && run.state.pending?.kind === 'SELECT_CARDS'; k++) run = then(run, { kind: 'SELECT_CARDS', cards: pending(run.state, 'SELECT_CARDS').cards.slice(0, 1) });
    expect(zoneCards(run.state, 0, 'waitingRoom')).toEqual([ANM(5)]);
    expect(zoneCards(run.state, 0, 'memory')).toEqual([ANM(2)]);
    const kept = decline(asked);
    expect(zoneCards(kept.state, 0, 'waitingRoom')).toEqual([ANM(2)]);
    expect(zoneCards(kept.state, 0, 'memory')).toEqual([ANM(5)]);
  });
});

describe('NIK/S135-099 ミランダ - シーフ・オブ・ジャスティス', () => {
  /** The card in the hand; `mine` and `theirs` are the top cards of the two decks, NIK-005 is under `mine`. */
  const setup = (mine: string, theirs: string) =>
    game('NIK_S135', { step: 'MAIN_START' }, (ctx) => {
      take(ctx, 0, NIK(99), zone(0, 'hand'));
      stackTop(ctx, 0, [mine, NIK(5)]);
      stackTop(ctx, 1, [theirs]);
    });
  /** Played; of its two abilities, the one that puts the cards into the waiting rooms first. */
  const play = (run: Run): Run => abilityFirst(playCharacter(run, NIK(99), 'FC'), 1);

  it('the cards used here', () => {
    expect([NIK(4), NIK(7), NIK(9)].map((c) => printed(c).level)).toEqual([0, 1, 2]);
    expect(printed(NIK(24)).kind).toBe('CLIMAX');
    expect(printed(NIK(79))).toMatchObject({ kind: 'EVENT', level: 3 });
  });

  it('each player’s top card goes to their own waiting room; a higher level: one card may be drawn', () => {
    const run = play(setup(NIK(7), NIK(4)));
    expect(zoneCards(run.state, 0, 'waitingRoom')).toEqual([NIK(7)]);
    expect(zoneCards(run.state, 1, 'waitingRoom')).toEqual([NIK(4)]);
    // The turn player's card first.
    const moved = run.events.flatMap((e) => (e.type === 'CARD_MOVED' && e.to.zone === 'waitingRoom' ? [e.to.player] : []));
    expect(moved).toEqual([0, 1]);
    expect(pending(run.state, 'CONFIRM')).toMatchObject({ player: 0, prompt: 'USE_ABILITY' });
    expect(zoneCards(accept(run).state, 0, 'hand')).toEqual([NIK(5)]);
    const kept = decline(run);
    expect(kept.state.zones[0].hand).toHaveLength(0);
    expect(topCard(kept.state, 0)).toBe(NIK(5));
  });

  it.each([
    ['a level 1 character against a climax (level 0)', NIK(7), NIK(24)],
    ['a level 3 event against a level 2 character', NIK(79), NIK(9)],
  ])('%s: higher', (_name, mine, theirs) => {
    expect(asks(play(setup(mine, theirs)), 'CONFIRM', 'USE_ABILITY')).toBe(true);
  });

  it.each([
    ['the same level', NIK(7), NIK(7)],
    ['a lower level', NIK(4), NIK(9)],
    ['a climax against a level 0 character', NIK(24), NIK(4)],
    ['a climax against a climax', NIK(24), NIK(24)],
  ])('%s: both cards go to the waiting rooms, no card may be drawn', (_name, mine, theirs) => {
    const run = play(setup(mine, theirs));
    expect(zoneCards(run.state, 0, 'waitingRoom')).toEqual([mine]);
    expect(zoneCards(run.state, 1, 'waitingRoom')).toEqual([theirs]);
    expect(asks(run, 'CONFIRM', 'USE_ABILITY')).toBe(false);
    expect(run.state.zones[0].hand).toHaveLength(0);
  });

  it('the other ability first: the card looked at and left on top is the card compared', () => {
    let run = abilityFirst(playCharacter(setup(NIK(7), NIK(4)), NIK(99), 'FC'), 0);
    // 山札の上か下に置く: put to the bottom, so NIK-005 (level 0) is the card of the second ability.
    while (run.state.pending?.kind === 'CONFIRM' && run.state.pending.prompt === 'LOOK_NEXT') run = accept(run);
    const options = pending(run.state, 'SELECT_OPTION').options;
    run = then(run, { kind: 'SELECT_OPTION', option: options[options.length - 1]! });
    expect(zoneCards(run.state, 0, 'waitingRoom')).toEqual([NIK(5)]);
    expect(asks(run, 'CONFIRM', 'USE_ABILITY')).toBe(false);
  });
});

describe('GUP/W141-089 BT-42のなんでも屋 アキ', () => {
  /** The card in the centre with two other characters and the climax; the opponent has GUP-013 in the left front slot. */
  const setup = (options: { climax?: boolean } = {}) =>
    game('GUP_W141', { step: 'ATTACK_START' }, (ctx) => {
      take(ctx, 0, GUP(89), stageSlot(0, 'FC'));
      take(ctx, 0, GUP(1), stageSlot(0, 'BL'));
      take(ctx, 0, GUP(6), stageSlot(0, 'BR'));
      if (options.climax !== false) take(ctx, 0, GUP(112), zone(0, 'climax'));
      take(ctx, 0, GUP(5), zone(0, 'hand'));
      take(ctx, 0, GUP(15), zone(0, 'waitingRoom'));
      take(ctx, 1, GUP(13), stageSlot(1, 'BL'));
      stackTop(ctx, 0, [GUP(5), GUP(5), GUP(1), GUP(1)]);
      stackTop(ctx, 1, [GUP(1), GUP(1), GUP(1), GUP(6), GUP(6), GUP(6), GUP(5), GUP(5)]);
    });
  const level = (state: GameState, cardId: string) => state.modifiers.filter((m) => m.stat === 'LEVEL' && state.instances.find((i) => i.objectId === m.objectId)?.cardId === cardId).map((m) => m.delta);
  const granted = (state: GameState) => state.grants.filter((g) => state.instances.find((i) => i.objectId === g.objectId)?.cardId === GUP(89)).map((g) => g.ability);
  const used = (): Run => {
    const ended = attack(setup(), 'FC', 'DIRECT');
    expect(pending(ended.state, 'CONFIRM')).toMatchObject({ prompt: 'PAY_COST', cardId: GUP(89) });
    return pick(accept(ended), [GUP(5)]);
  };

  it('the cards used here', () => {
    expect(printed(GUP(112))).toMatchObject({ kind: 'CLIMAX', name: '冬ごもりの準備' });
    expect(printed(GUP(89)).level).toBe(1);
  });

  it('its attack ends: the cost may be paid; a character comes back, level +2 and the ability until the end of the opponent’s next turn', () => {
    const run = used();
    expect(paid(run)).toEqual(['hand>waitingRoom']);
    expect(offered(run)).toEqual([GUP(15), GUP(5)].sort());
    expect(pending(run.state, 'SELECT_CARDS').min).toBe(0);
    const back = pick(run, [GUP(15)]);
    expect(zoneCards(back.state, 0, 'hand')).toEqual([GUP(15)]);
    expect(level(back.state, GUP(89))).toEqual([2]);
    expect(granted(back.state)).toEqual([BACK_WHEN_ATTACKED]);
    // No character taken back: the rest is done all the same.
    const none = pick(run, []);
    expect(level(none.state, GUP(89))).toEqual([2]);
    expect(granted(none.state)).toEqual([BACK_WHEN_ATTACKED]);
  });

  it('in the opponent’s next turn: front attacked, it may go back to the hand; after that turn the level and the ability are gone', () => {
    const mine = pick(used(), []);
    // The opponent's turn: their character moves in front of the card and attacks it.
    let run = until(mine, decides(1, 'MAIN'));
    expect(level(run.state, GUP(89))).toEqual([2]);
    const body = run.state.zones[1].hand.find((i) => printed(getInstance(run.state, i).cardId).kind === 'CHARACTER' && printed(getInstance(run.state, i).cardId).level === 0)!;
    run = then(run, { kind: 'MAIN', action: { type: 'PLAY_CHARACTER', card: oid(run.state, body), slot: 'FC' } });
    run = until(run, decides(1, 'ATTACK'));
    const attacked = attack(run, 'FC', 'FRONT');
    expect(pending(attacked.state, 'CONFIRM')).toMatchObject({ player: 0, prompt: 'USE_ABILITY', cardId: GUP(89) });
    const taken = accept(attacked);
    expect(zoneCards(taken.state, 0, 'hand')).toContain(GUP(89));
    // Not taken back: it stays, and when the opponent's turn is over the level and the ability have ended.
    const stayed = until(decline(attacked), decides(0, 'MAIN'));
    expect(level(stayed.state, GUP(89))).toEqual([]);
    expect(granted(stayed.state)).toEqual([]);
  });

  it('the cost not paid, or no climax: nothing changes', () => {
    const declined = decline(attack(setup(), 'FC', 'DIRECT'));
    expect(level(declined.state, GUP(89))).toEqual([]);
    expect(granted(declined.state)).toEqual([]);
    expect(zoneCards(declined.state, 0, 'hand')).toEqual([GUP(5)]);
    const without = attack(setup({ climax: false }), 'FC', 'DIRECT');
    expect(asks(without, 'CONFIRM', 'PAY_COST')).toBe(false);
    expect(played(without, GUP(89))).toBe(0);
  });

  it('【永】: +4000 in its player’s turn with two other 《戦車道》 characters', () => {
    const run = setup({ climax: false });
    expect(getPower(run.state, at(run.state, 0, 'FC'))).toBe(printed(GUP(89)).power! + 4000);
  });
});
