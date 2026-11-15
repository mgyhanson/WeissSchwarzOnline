/**
 * The sentence grammar: ability data for a line of official text that is
 * built from known parts.
 *
 * patterns.ts knows whole sentences. Most cards, however, say something
 * nobody else says in exactly those words, while the parts of what they say
 * (the trigger, the cost, the condition, each effect) are common. This file
 * knows those parts. A line is compiled only when EVERY part of it is known,
 * exactly: an unknown trigger, cost action, condition or effect sentence
 * makes the whole line unknown, and with it the whole card (compileText).
 * Nothing is guessed and nothing is left out.
 *
 * Every part maps to a building block the engine already has and tests.
 * Safeguards (card-database/tests/grammar.test.ts):
 *  - a line of a hand-written, tested card that the grammar can read must
 *    give exactly the hand-written ability data;
 *  - every compiled line is written back to Japanese by separate code
 *    (tests/render-ja.ts) and must equal the official text;
 *  - the compiled cards are played in complete games.
 */

import type { Ability, AutoAbility, CardFilter, Condition, Cost, Effect, SlotId, Target, Trigger } from '@wso/game-engine';
import { encore } from '@wso/game-engine';
import { type LineParts, splitCost, splitLine } from './fragments';
import { TRIGGER_ICONS } from './official';

/** What a part means, and how to say it in Chinese. */
type Out<T> = { data: T; zh: string } | null;
const out = <T>(data: T, zh: string): Out<T> => ({ data, zh });
const n = (text: string | undefined): number => Number(text);

// ---------------------------------------------------------------------------
// Card filters: 《A》のキャラ, レベル1以下のキャラ, 「カード名」, CX ...
// ---------------------------------------------------------------------------

const FILTER = /^、?(?:(レベル|コスト)(\d+)(以下|以上)の)?(?:、?《([^》]+)》(?:か《([^》]+)》)?の)?(キャラ|CX|イベント|カード)$/;

/** `bare`: what a plain "キャラ" means here: no filter on the stage (only characters are there), a kind filter elsewhere. */
export function parseFilter(text: string, bare: 'STAGE' | 'ZONE'): Out<CardFilter | undefined> {
  const whole = parseOneFilter(text, bare);
  if (whole) return whole;
  // "AかB": two kinds of card, each known by itself (《A》か《B》のキャラ is one kind and was tried first).
  for (let i = text.indexOf('か'); i > 0; i = text.indexOf('か', i + 1)) {
    const a = parseOneFilter(text.slice(0, i), 'ZONE');
    const b = parseOneFilter(text.slice(i + 1), 'ZONE');
    if (a?.data && b?.data) return out({ anyOf: [a.data, b.data] }, `${a.zh}或${b.zh}`);
  }
  return null;
}

function parseOneFilter(text: string, bare: 'STAGE' | 'ZONE'): Out<CardFilter | undefined> {
  const icon = /^トリガーアイコンが\[\[([a-z]+\.gif)\]\]のCX$/.exec(text);
  if (icon && TRIGGER_ICONS[icon[1]!]) return out({ kind: 'CLIMAX', hasTrigger: TRIGGER_ICONS[icon[1]!]! }, `Trigger 圖示是 ${TRIGGER_ICONS[icon[1]!]} 的 Climax`);
  const name = /^「([^」]+)」$/.exec(text);
  if (name) return out({ name: name[1]! }, `「${name[1]}」`);
  const names = /^、?「([^」]+)」か「([^」]+)」$/.exec(text);
  if (names) return out({ names: [names[1]!, names[2]!] }, `「${names[1]}」或「${names[2]}」`);
  const includes = /^カード名に「([^」]+)」を含むキャラ$/.exec(text);
  if (includes) return out(bare === 'STAGE' ? { nameIncludes: includes[1]! } : { kind: 'CHARACTER', nameIncludes: includes[1]! }, `卡名含有「${includes[1]}」的角色`);
  if (/^、?レベルが相手のレベルより高いキャラ$/.test(text)) return out({ levelAboveMasterLevel: true }, 'Level 高於對手玩家 Level 的角色');
  if (/^自分のレベル以下のレベルのキャラ$/.test(text)) return out({ kind: 'CHARACTER', levelAtMostOwnLevel: true }, 'Level 不高於自己 Level 的角色');
  const m = FILTER.exec(text);
  if (!m) return null;
  const [, stat, value, bound, traitA, traitB, noun] = m;
  const filter: CardFilter = {};
  let zh = '';
  if (noun === 'キャラ') filter.kind = 'CHARACTER';
  else if (noun === 'CX') filter.kind = 'CLIMAX';
  else if (noun === 'イベント') filter.kind = 'EVENT';
  if (traitA) {
    if (noun !== 'キャラ') return null;
    filter.traits = traitB ? [traitA, traitB] : [traitA];
    zh += traitB ? `《${traitA}》或《${traitB}》` : `《${traitA}》`;
  }
  if (stat === 'レベル') {
    if (bound === '以下') filter.levelMax = n(value);
    else filter.levelMin = n(value);
    zh = `Level ${value} ${bound === '以下' ? '或以下' : '或以上'}的${zh}`;
  } else if (stat === 'コスト') {
    if (bound !== '以下') return null; // The engine has no "cost N or more" filter.
    filter.costMax = n(value);
    zh = `Cost ${value} 或以下的${zh}`;
  }
  zh += noun === 'キャラ' ? '角色' : noun === 'CX' ? 'Climax' : noun === 'イベント' ? 'Event' : '卡';
  const plain = noun === 'キャラ' && !traitA && !stat;
  if (noun === 'カード' && !stat) return out(undefined, zh);
  if (noun === 'カード') delete filter.kind;
  return out(plain && bare === 'STAGE' ? undefined : filter, zh);
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

const TRIGGERS: [RegExp, (m: RegExpExecArray) => Out<Trigger>][] = [
  [/^このカードが手札から舞台に置かれた時$/, () => out({ on: 'PLACED_ON_STAGE', from: 'HAND' }, '這張卡由手牌放到舞台時')],
  [/^このカードがアタックした時$/, () => out({ on: 'ATTACKS' }, '這張卡攻擊時')],
  [/^このカードが手札から舞台に置かれたターン中、このカードがアタックした時$/, () => out({ on: 'ATTACKS', placedThisTurn: true }, '這張卡由手牌放到舞台的回合中，這張卡攻擊時')],
  [
    /^このカードが手札から舞台に置かれたターン中、このカードのバトル相手が【リバース】した時$/,
    () => out({ on: 'BATTLE_OPPONENT_REVERSED', placedThisTurn: true }, '這張卡由手牌放到舞台的回合中，這張卡的戰鬥對手被 Reverse 時'),
  ],
  [/^このカードのアタックの終わりに$/, () => out({ on: 'ATTACK_END' }, '這張卡的攻擊結束時')],
  [/^このカードのアタックの終わりかこのカードが【リバース】した時$/, () => out({ on: 'EITHER', of: [{ on: 'ATTACK_END' }, { on: 'REVERSED' }] }, '這張卡的攻擊結束時，或這張卡被 Reverse 時')],
  [
    /^このカードが手札から舞台に置かれた時か舞台から控え室に置かれた時$/,
    () => out({ on: 'EITHER', of: [{ on: 'PLACED_ON_STAGE', from: 'HAND' }, { on: 'STAGE_TO_WAITING_ROOM' }] }, '這張卡由手牌放到舞台時，或由舞台放到控え室時'),
  ],
  [/^相手のCXがCX置場に置かれた時$/, () => out({ on: 'CLIMAX_PLACED', opponent: true }, '對手的 Climax 放到 Climax 置場時')],
  [/^このカードが手札か思い出置場から舞台に置かれた時$/, () => out({ on: 'PLACED_ON_STAGE', from: 'HAND_OR_MEMORY' }, '這張卡由手牌或思い出放到舞台時')],
  [/^あなたのCX置場に「([^」]+)」が置かれた時$/, (m) => out({ on: 'CLIMAX_PLACED', filter: { name: m[1]! } }, `我方的 Climax 置場放置了「${m[1]}」時`)],
  [
    /^このカードが手札から舞台に置かれた時かアタックした時$/,
    () => out({ on: 'EITHER', of: [{ on: 'PLACED_ON_STAGE', from: 'HAND' }, { on: 'ATTACKS' }] }, '這張卡由手牌放到舞台時，或這張卡攻擊時'),
  ],
  [/^あなたがこのカードの『助太刀』を使った時$/, () => out({ on: 'USED_BACKUP' }, '使用了這張卡的「助太刀」時')],
  [/^このカードのバトル相手が【リバース】した時$/, () => out({ on: 'BATTLE_OPPONENT_REVERSED' }, '這張卡的戰鬥對手被 Reverse 時')],
  [
    /^このカードのバトル相手でレベル(\d+)以上のキャラが【リバース】した時$/,
    (m) => out({ on: 'BATTLE_OPPONENT_REVERSED', filter: { levelMin: n(m[1]) } }, `這張卡的戰鬥對手（Level ${m[1]} 或以上的角色）被 Reverse 時`),
  ],
  [/^このカードが【リバース】した時$/, () => out({ on: 'REVERSED' }, '這張卡被 Reverse 時')],
  [/^このカードが舞台から控え室に置かれた時$/, () => out({ on: 'STAGE_TO_WAITING_ROOM' }, '這張卡由舞台放到控え室時')],
  [/^あなたの(?:CX|クライマックス)がCX置場に置かれた時$/, () => out({ on: 'CLIMAX_PLACED' }, '我方的 Climax 放到 Climax 置場時')],
  [/^あなたの(?:CX|クライマックス)フェイズの始めに$/, () => out({ on: 'PHASE_START', phase: 'CLIMAX', turn: 'YOURS' }, '我方 Climax 階段開始時')],
  [/^あなたのアタックフェイズの始めに$/, () => out({ on: 'PHASE_START', phase: 'ATTACK', turn: 'YOURS' }, '我方攻擊階段開始時')],
  [/^あなたのアンコールステップの始めに$/, () => out({ on: 'STEP_START', step: 'ENCORE', turn: 'YOURS' }, '我方 Encore 步驟開始時')],
  [
    /^他のあなたの《([^》]+)》のキャラがアタックした時$/,
    (m) => out({ on: 'OTHER_ATTACKS', filter: { kind: 'CHARACTER', traits: [m[1]!] } }, `我方其他《${m[1]}》角色攻擊時`),
  ],
];

export function parseTrigger(text: string): Out<Trigger> {
  for (const [re, build] of TRIGGERS) {
    const m = re.exec(text);
    if (m) return build(m);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Costs
// ---------------------------------------------------------------------------

/** One cost action; the verb may be in its joining form (置き、). */
export function parseCostAction(raw: string): Out<Cost> {
  const text = raw.replace(/置き$/, '置く').replace(/し$/, 'する');
  let m: RegExpExecArray | null;
  if ((m = /^\((\d+)\)$/.exec(text))) return out({ pay: 'STOCK', count: n(m[1]) }, `(${m[1]})`);
  if (text === 'このカードを【レスト】する') return out({ pay: 'REST_SELF' }, '把這張卡 Rest');
  if (text === 'このカードを控え室に置く') return out({ pay: 'SELF_TO_WAITING_ROOM' }, '把這張卡放到控え室');
  if (text === '【スタンド】しているこのカードを控え室に置く') return out({ pay: 'SELF_TO_WAITING_ROOM', standing: true }, '把 Stand 中的這張卡放到控え室');
  if (text === '【スタンド】しているこのカードを【レスト】する') return out({ pay: 'REST_SELF' }, '把 Stand 中的這張卡 Rest');
  if (text === 'このカードを思い出にする') return out({ pay: 'SELF_TO_MEMORY' }, '把這張卡放到思い出');
  if (text === 'このカードをクロック置場に置く') return out({ pay: 'SELF_TO_CLOCK' }, '把這張卡放到 Clock');
  if (text === 'このカードを山札の下に置く') return out({ pay: 'SELF_TO_DECK_BOTTOM' }, '把這張卡放到山札底');
  if (text === 'あなたの山札の上から1枚をクロック置場に置く') return out({ pay: 'DECK_TOP_TO_CLOCK' }, '把自己山札頂 1 張放到 Clock');
  if ((m = /^手札を(\d+)枚控え室に置く$/.exec(text))) return out({ pay: 'DISCARD', count: n(m[1]) }, `把 ${m[1]} 張手牌放到控え室`);
  if ((m = /^手札を(\d+)枚クロック置場に置く$/.exec(text))) return out({ pay: 'HAND_TO_CLOCK', count: n(m[1]) }, `把 ${m[1]} 張手牌放到 Clock`);
  if ((m = /^手札の(.+?)を(\d+)枚控え室に置く$/.exec(text))) {
    const filter = parseFilter(m[1]!, 'ZONE');
    if (filter?.data) return out({ pay: 'DISCARD', count: n(m[2]), filter: filter.data }, `把手牌 ${m[2]} 張${filter.zh}放到控え室`);
  }
  if ((m = /^(他の)?あなたの舞台の(.+?)を(\d+)枚控え室に置く$/.exec(text))) {
    const filter = parseFilter(m[2]!, 'STAGE');
    if (filter && (!filter.data || filter.data.kind === 'CHARACTER' || filter.data.name !== undefined)) {
      return out(
        { pay: 'CHARACTERS_TO_WAITING_ROOM', count: n(m[3]), ...(filter.data ? { filter: filter.data } : {}), ...(m[1] ? { other: true } : {}) },
        `把我方舞台上${m[1] ? '其他 ' : ''}${m[3]} 張${filter.zh}放到控え室`,
      );
    }
  }
  if ((m = /^(他の)?あなたの【スタンド】している(.+?)を(\d+)枚【レスト】する$/.exec(text))) {
    const filter = parseFilter(m[2]!, 'STAGE');
    if (filter) {
      return out(
        { pay: 'REST_CHARACTERS', count: n(m[3]), ...(filter.data ? { filter: filter.data } : {}), ...(m[1] ? { other: true } : {}) },
        `把我方${m[1] ? '其他 ' : ''}${m[3]} 張 Stand 中的${filter.zh} Rest`,
      );
    }
  }
  return null;
}

function parseCost(actions: string[]): Out<Cost[]> {
  const parsed = actions.map(parseCostAction);
  if (parsed.some((p) => p === null)) return null;
  return out(
    parsed.map((p) => p!.data),
    parsed.map((p) => p!.zh).join('，'),
  );
}

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

const ROWS: Record<string, SlotId[]> = { 前列の中央の枠: ['FC'], 前列: ['FL', 'FC', 'FR'], 後列: ['BL', 'BR'] };

function parseOneCondition(text: string): Out<Condition> {
  let m: RegExpExecArray | null;
  if (text === 'あなたのターン中') return out({ if: 'YOUR_TURN' }, '我方回合中');
  if (text === '相手のターン中') return out({ if: 'OPPONENT_TURN' }, '對手回合中');
  if ((m = /^(他の)?あなたの(.+?)が(?:(\d+)枚以上|いる)$/.exec(text))) {
    const filter = parseFilter(m[2]!, 'STAGE');
    if (filter) {
      const min = m[3] ? n(m[3]) : 1;
      return out(
        { if: 'CHARACTERS', min, ...(m[1] ? { other: true } : {}), ...(filter.data ? { filter: filter.data } : {}) },
        `我方${m[1] ? '其他' : ''}${filter.zh}有 ${min} 張或以上`,
      );
    }
  }
  if ((m = /^(.+)がいない$/.exec(text))) {
    const some = parseOneCondition(`${m[1]}がいる`);
    if (some?.data.if === 'CHARACTERS') return out({ if: 'NOT', of: some.data }, `沒有${some.zh.replace(/有 1 張或以上$/, '')}`);
  }
  // Cards counted in a zone, or the opponent's characters.
  const bounds = (count: string | undefined, bound: string | undefined) => (count === undefined ? { min: 1 } : bound === '以上' ? { min: n(count) } : { max: n(count) });
  const boundsZh = (count: string | undefined, bound: string | undefined) => (count === undefined ? '至少有 1 張' : `有 ${count} 張${bound === '以上' ? '或以上' : '或以下'}`);
  if ((m = /^あなたの控え室の(.+?)が(\d+)枚(以下|以上)$/.exec(text))) {
    const filter = parseFilter(m[1]!, 'ZONE');
    if (filter) return out({ if: 'COUNT', where: 'YOUR_WAITING_ROOM', ...(filter.data ? { filter: filter.data } : {}), ...bounds(m[2], m[3]) }, `我方控え室的${filter.zh}${boundsZh(m[2], m[3])}`);
  }
  if ((m = /^あなたの(手札|思い出)が(\d+)枚(以下|以上)$/.exec(text))) {
    return out({ if: 'COUNT', where: m[1] === '手札' ? 'YOUR_HAND' : 'YOUR_MEMORY', ...bounds(m[2], m[3]) }, `我方${m[1] === '手札' ? '手牌' : '思い出'}${boundsZh(m[2], m[3])}`);
  }
  if ((m = /^相手の(前列の)?(.+?)が(?:(\d+)枚(以下|以上)|いる)$/.exec(text))) {
    const filter = parseFilter(m[2]!, 'STAGE');
    if (filter && (!filter.data || filter.data.kind === 'CHARACTER' || filter.data.levelAboveMasterLevel)) {
      return out(
        { if: 'COUNT', where: m[1] ? 'OPPONENT_FRONT_ROW' : 'OPPONENT_STAGE', ...(filter.data ? { filter: filter.data } : {}), ...bounds(m[3], m[4]) },
        `對手${m[1] ? '前列' : ''}的${filter.zh}${boundsZh(m[3], m[4])}`,
      );
    }
  }
  if ((m = /^(他の)?あなたの前列の(.+?)が(?:(\d+)枚(以上)|いる)$/.exec(text))) {
    const filter = parseFilter(m[2]!, 'STAGE');
    if (filter && (!filter.data || filter.data.kind === 'CHARACTER' || filter.data.name !== undefined)) {
      return out(
        { if: 'COUNT', where: 'YOUR_FRONT_ROW', ...(filter.data ? { filter: filter.data } : {}), ...(m[1] ? { other: true } : {}), ...bounds(m[3], m[4]) },
        `我方前列${m[1] ? '其他' : ''}的${filter.zh}${boundsZh(m[3], m[4])}`,
      );
    }
  }
  if ((m = /^あなたのCX置場に(トリガーアイコンが\[\[[a-z]+\.gif\]\]のCX)がある$/.exec(text))) {
    const filter = parseFilter(m[1]!, 'ZONE');
    if (filter?.data) return out({ if: 'COUNT', where: 'YOUR_CLIMAX', filter: filter.data, min: 1 }, `我方 Climax 置場有${filter.zh}`);
  }
  if ((m = /^あなたの、?「([^」]+)」と「([^」]+)」がいる$/.exec(text))) {
    return out({ if: 'ALL', of: [{ if: 'CHARACTERS', min: 1, filter: { name: m[1]! } }, { if: 'CHARACTERS', min: 1, filter: { name: m[2]! } }] }, `我方有「${m[1]}」及「${m[2]}」`);
  }
  if ((m = /^あなたか相手の、?(.+)がいる$/.exec(text))) {
    const filter = parseFilter(m[1]!, 'STAGE');
    if (filter?.data && filter.data.kind === 'CHARACTER') {
      return out({ if: 'ANY', of: [{ if: 'CHARACTERS', min: 1, filter: filter.data }, { if: 'COUNT', where: 'OPPONENT_STAGE', filter: filter.data, min: 1 }] }, `我方或對手有${filter.zh}`);
    }
  }
  if ((m = /^(.+が)(\d+)枚以下か(\d+)枚以上$/.exec(text))) {
    const low = parseOneCondition(`${m[1]}${m[2]}枚以下`);
    const high = parseOneCondition(`${m[1]}${m[3]}枚以上`);
    if (low && high) return out({ if: 'ANY', of: [low.data, high.data] }, `${low.zh}，或${high.zh.replace(/^.*?有 /, '有 ')}`);
  }
  if ((m = /^(?:あなたの)?CX置場に「([^」]+)」がある$/.exec(text))) return out({ if: 'CLIMAX_IN_PLAY', name: m[1]! }, `Climax 置場有「${m[1]}」`);
  if (text === 'あなたのCX置場にCXがある') return out({ if: 'CLIMAX_IN_PLAY' }, '我方 Climax 置場有 Climax');
  if ((m = /^あなたのレベルが(\d+)以上$/.exec(text))) return out({ if: 'LEVEL', min: n(m[1]) }, `我方 Level ${m[1]} 或以上`);
  if ((m = /^あなたのストックが(\d+)枚以下$/.exec(text))) return out({ if: 'STOCK', max: n(m[1]) }, `我方 Stock ${m[1]} 張或以下`);
  if ((m = /^あなたのキャラすべてが《([^》]+)》(?:か《([^》]+)》)?$/.exec(text))) {
    const traits = m[2] ? [m[1]!, m[2]] : [m[1]!];
    return out({ if: 'ALL_CHARACTERS', filter: { kind: 'CHARACTER', traits } }, `我方所有角色都是${traits.map((t) => `《${t}》`).join('或')}`);
  }
  if ((m = /^あなたのレベル置場のカードのレベルの合計が(\d+)以上$/.exec(text))) return out({ if: 'EXPERIENCE', min: n(m[1]) }, `我方 Level 置場卡牌的 Level 合計 ${m[1]} 或以上`);
  if ((m = /^(前列の中央の枠|前列|後列)にこのカードがいる$/.exec(text))) {
    return out({ if: 'SELF_IN_SLOT', slots: ROWS[m[1]!]! }, `這張卡在${m[1] === '前列の中央の枠' ? '前列中央的枠' : m[1] === '前列' ? '前列' : '後列'}`);
  }
  if ((m = /^このカードのバトル相手の(レベル|コスト)が(\d+)(以下|以上)$/.exec(text))) {
    if (m[1] === 'コスト' && m[3] === '以上') return null;
    const filter: CardFilter = m[1] === 'コスト' ? { costMax: n(m[2]) } : m[3] === '以下' ? { levelMax: n(m[2]) } : { levelMin: n(m[2]) };
    return out({ if: 'BATTLE_OPPONENT', filter }, `這張卡的戰鬥對手 ${m[1] === 'コスト' ? 'Cost' : 'Level'} ${m[2]} ${m[3] === '以下' ? '或以下' : '或以上'}`);
  }
  if (text === 'このカードのバトル相手のレベルが相手のレベルより高い') {
    return out({ if: 'BATTLE_OPPONENT', filter: { levelAboveMasterLevel: true } }, '這張卡的戰鬥對手的 Level 高於對手玩家的 Level');
  }
  if ((m = /^このカードの正面のキャラのコストが(\d+)以上$/.exec(text))) return out({ if: 'FACING', filter: { costMin: n(m[1]) } }, `這張卡正面的角色 Cost ${m[1]} 或以上`);
  if ((m = /^このカードの正面のキャラのレベルが(\d+)(以上|以下)?$/.exec(text))) {
    const filter: CardFilter = m[2] === '以上' ? { levelMin: n(m[1]) } : m[2] === '以下' ? { levelMax: n(m[1]) } : { levelMin: n(m[1]), levelMax: n(m[1]) };
    return out({ if: 'FACING', filter }, `這張卡正面的角色 Level ${m[1]}${m[2] === '以上' ? ' 或以上' : m[2] === '以下' ? ' 或以下' : ''}`);
  }
  return null;
}

/** A condition, possibly several joined by …があり、 / …がいて、 / …で、 / ターン中、. */
export function parseCondition(text: string): Out<Condition> {
  const whole = parseOneCondition(text);
  if (whole) return whole;
  // "AかB": either condition, each known by itself.
  for (let i = text.indexOf('か'); i > 0; i = text.indexOf('か', i + 1)) {
    const a = parseOneCondition(text.slice(0, i));
    const b = parseOneCondition(text.slice(i + 1));
    if (a && b) return out({ if: 'ANY', of: [a.data, b.data] }, `${a.zh}，或${b.zh}`);
  }
  const joins: [RegExp, string][] = [
    [/^(あなたのターン中|相手のターン中)、(.+)$/, ''],
    [/^(.+?があ)り、(.+)$/, 'る'],
    [/^(.+?がい)て、(.+)$/, 'る'],
    [/^(.+?》)で、(.+)$/, ''],
    [/^(.+?以[上下])で、(.+)$/, ''],
  ];
  for (const [re, ending] of joins) {
    const m = re.exec(text);
    if (!m) continue;
    const left = parseOneCondition(m[1]! + ending);
    const right = parseCondition(m[2]!);
    if (!left || !right) continue;
    const rest = right.data.if === 'ALL' ? right.data.of : [right.data];
    return out({ if: 'ALL', of: [...(left.data.if === 'ALL' ? left.data.of : [left.data]), ...rest] }, `${left.zh}，而且${right.zh}`);
  }
  return null;
}

function allOf(conditions: Out<Condition>[]): Out<Condition | undefined> {
  if (conditions.some((c) => c === null)) return null;
  if (conditions.length === 0) return out(undefined, '');
  const flat = conditions.flatMap((c) => (c!.data.if === 'ALL' ? c!.data.of : [c!.data]));
  return out(flat.length === 1 ? flat[0]! : { if: 'ALL', of: flat }, conditions.map((c) => c!.zh).join('，而且'));
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

/** Number changes: パワーを＋1000 / パワーを＋1000し、ソウルを＋1 / ソウルを－1. */
function parseChanges(text: string): { stat: 'POWER' | 'SOUL' | 'LEVEL'; amount: number; zh: string }[] | null {
  const parts = text.split('し、');
  const result: { stat: 'POWER' | 'SOUL' | 'LEVEL'; amount: number; zh: string }[] = [];
  for (const part of parts) {
    const m = /^(パワー|ソウル|レベル)を([＋－])(\d+)$/.exec(part);
    if (!m) return null;
    const stat = m[1] === 'パワー' ? 'POWER' : m[1] === 'ソウル' ? 'SOUL' : 'LEVEL';
    result.push({ stat, amount: (m[2] === '＋' ? 1 : -1) * n(m[3]), zh: `${stat === 'POWER' ? 'Power' : stat === 'SOUL' ? 'Soul' : 'Level'} ${m[2] === '＋' ? '+' : '－'}${m[3]}` });
  }
  return result;
}

const DURATION = /^(そのターン中|次の相手のターンの終わりまで)、(.+)$/;
const DESTINATIONS: Record<string, ['HAND' | 'WAITING_ROOM' | 'STOCK' | 'STOCK_BOTTOM' | 'CLOCK' | 'MEMORY' | 'DECK_BOTTOM' | 'DECK_TOP', string]> = {
  ストック置場の下に置く: ['STOCK_BOTTOM', '放到 Stock 最下面'],
  手札に戻す: ['HAND', '加入手牌'],
  控え室に置く: ['WAITING_ROOM', '放到控え室'],
  ストック置場に置く: ['STOCK', '放到 Stock'],
  クロック置場に置く: ['CLOCK', '放到 Clock'],
  思い出にする: ['MEMORY', '放到思い出'],
  山札の下に置く: ['DECK_BOTTOM', '放到山札底'],
  山札の上に置く: ['DECK_TOP', '放到山札頂'],
};
const ORIENTATIONS: Record<string, ['STAND' | 'REST' | 'REVERSE', string]> = { '【スタンド】する': ['STAND', 'Stand'], '【レスト】する': ['REST', 'Rest'], '【リバース】する': ['REVERSE', 'Reverse'] };

/** What is done to a target: moved, turned, or its numbers changed for a while. */
function parseAction(text: string, target: Target, noun: string): Out<Effect[]> {
  if (DESTINATIONS[text]) return out([{ do: 'MOVE', target, to: DESTINATIONS[text]![0] }], `把${noun}${DESTINATIONS[text]![1]}`);
  const either = /^(.+?す)か(.+)$/.exec(text);
  if (either && DESTINATIONS[either[1]!] && DESTINATIONS[either[2]!]) {
    return out([{ do: 'MOVE', target, to: DESTINATIONS[either[1]!]![0], orTo: DESTINATIONS[either[2]!]![0] }], `把${noun}${DESTINATIONS[either[1]!]![1]}或${DESTINATIONS[either[2]!]![1]}（自己選）`);
  }
  if (text === '舞台の好きな枠に【レスト】して置く' && target.who === 'CHOSEN') return out([{ do: 'CHOOSE_SLOT', which: 'ANY' }, { do: 'MOVE', target, to: 'CHOSEN_SLOT', rested: true }], '以 Rest 狀態放到我方舞台上自己選的枠');
  if (text === '舞台の好きな枠に置く' && target.who === 'CHOSEN') return out([{ do: 'CHOOSE_SLOT', which: 'ANY' }, { do: 'MOVE', target, to: 'CHOSEN_SLOT' }], `放到我方舞台上自己選的枠`);
  if (ORIENTATIONS[text]) return out([{ do: 'ORIENT', target, to: ORIENTATIONS[text]![0] }], `把${noun} ${ORIENTATIONS[text]![1]}`);
  const timed = DURATION.exec(text);
  if (timed) {
    const until = timed[1] === 'そのターン中' ? {} : { until: 'NEXT_OPPONENT_TURN' as const };
    const lasts = timed[1] === 'そのターン中' ? '該回合' : '直到對手下一個回合結束為止，';
    // …し、『…』を与える / 『…』を与える: the target is given an automatic ability for that time.
    const gives = /^(?:(.+?)し、)?『(.+)』を与える$/.exec(timed[2]!);
    if (gives) {
      const before = gives[1] ? parseChanges(gives[1]) : [];
      const inner = readLine(gives[2]!);
      if (!before || !inner.line || inner.line.ability.type !== 'AUTO') return null;
      return out(
        [...before.map((c) => ({ do: 'MODIFY' as const, target, stat: c.stat, amount: c.amount, ...until })), { do: 'GRANT', target, ability: inner.line.ability, ...until }],
        `${lasts}${noun} ${before.map((c) => c.zh).join('、')}${before.length > 0 ? '，並' : ''}得到以下能力：「${inner.line.zh}」`,
      );
    }
    const changes = parseChanges(timed[2]!);
    if (!changes) return null;
    return out(
      changes.map((c) => ({ do: 'MODIFY' as const, target, stat: c.stat, amount: c.amount, ...until })),
      `${timed[1] === 'そのターン中' ? '該回合' : '直到對手下一個回合結束為止，'}${noun} ${changes.map((c) => c.zh).join('、')}`,
    );
  }
  return null;
}

const COUNT = '(\\d+)枚(まで)?';
const range = (count: string | undefined, upTo: string | undefined) => ({ min: upTo ? 0 : n(count), max: n(count) });
const countZh = (count: string | undefined, upTo: string | undefined) => `${upTo ? '最多 ' : ''}${count} 張`;

/** 「…してよい」 put back into its plain form; null when the sentence is not optional. */
function plainForm(sentence: string): string | null {
  const m = /^(.*?)(置いて|戻して|して|引いて|加えて)よい$/.exec(sentence);
  if (!m) return null;
  const verb = { 置いて: '置く', 戻して: '戻す', して: 'する', 引いて: '引く', 加えて: '加える' }[m[2]!]!;
  return m[1]! + verb;
}

/** One effect sentence (without "あなたは" and without a final よい). `battle`: "そのキャラ" is the battle opponent here. */
function parseSentence(sentence: string, battle: boolean): Out<Effect[]> {
  const text = sentence.replace(/^あなたは/, '');
  let m: RegExpExecArray | null;

  // このカード
  if ((m = /^(?:そのターン中|次の相手のターンの終わりまで)、このカードの(.+)$/.exec(text))) {
    return parseAction(text.replace('このカードの', ''), { who: 'SELF' }, '這張卡');
  }
  if ((m = /^このカードを(.+)$/.exec(text))) {
    const action = parseAction(m[1]!, { who: 'SELF' }, '這張卡');
    if (action) return action;
  }
  // そのキャラ: the battle opponent of this card.
  if (battle && (m = /^そのキャラを(.+)$/.exec(text))) return parseAction(m[1]!, { who: 'BATTLE_OPPONENT' }, '那張角色');

  // Choosing cards, then one action on them.
  if ((m = new RegExp(`^(他の)?自分の(.+?)を${COUNT}選び、(.+)$`).exec(text)) && !/^(控え室|手札|クロック|山札|思い出|ストック)/.test(m[2]!)) {
    const filter = parseFilter(m[2]!, 'STAGE');
    const action = filter && parseAction(m[5]!, { who: 'CHOSEN' }, '');
    if (filter && action && (!filter.data || filter.data.kind === 'CHARACTER')) {
      return out(
        [{ do: 'CHOOSE', from: 'YOUR_STAGE', ...(filter.data ? { filter: filter.data } : {}), ...(m[1] ? { other: true } : {}), ...range(m[3], m[4]) }, ...action.data],
        `選我方${m[1] ? '其他 ' : ''}${countZh(m[3], m[4])}${filter.zh}，${action.zh}`,
      );
    }
  }
  if ((m = new RegExp(`^自分の控え室の(.+?)を${COUNT}選び、(.+)$`).exec(text))) {
    const filter = parseFilter(m[1]!, 'ZONE');
    const action = filter && parseAction(m[4]!, { who: 'CHOSEN' }, '');
    if (filter && action) {
      return out(
        [{ do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', ...(filter.data ? { filter: filter.data } : {}), ...range(m[2], m[3]) }, ...action.data],
        `從自己的控え室選${countZh(m[2], m[3])}${filter.zh}，${action.zh}`,
      );
    }
  }
  if ((m = new RegExp(`^自分の手札の(.+?)を${COUNT}選び、(.+)$`).exec(text))) {
    const filter = parseFilter(m[1]!, 'ZONE');
    const action = filter?.data && parseAction(m[4]!, { who: 'CHOSEN' }, '');
    if (filter?.data && action) return out([{ do: 'CHOOSE', from: 'YOUR_HAND', filter: filter.data, ...range(m[2], m[3]) }, ...action.data], `選自己手牌${countZh(m[2], m[3])}${filter.zh}，${action.zh}`);
  }
  if ((m = new RegExp(`^自分の手札を${COUNT}選び、(.+)$`).exec(text))) {
    const action = parseAction(m[3]!, { who: 'CHOSEN' }, '');
    if (action) return out([{ do: 'CHOOSE', from: 'YOUR_HAND', ...range(m[1], m[2]) }, ...action.data], `選自己${countZh(m[1], m[2])}手牌，${action.zh}`);
  }
  if ((m = new RegExp(`^自分のクロックを${COUNT}選び、(.+)$`).exec(text))) {
    const action = parseAction(m[3]!, { who: 'CHOSEN' }, '');
    if (action) return out([{ do: 'CHOOSE', from: 'YOUR_CLOCK', ...range(m[1], m[2]) }, ...action.data], `選自己 Clock 的${countZh(m[1], m[2])}卡，${action.zh}`);
  }
  if ((m = new RegExp(`^相手の(前列の|後列の)?(.+?)を${COUNT}選び、(.+)$`).exec(text))) {
    const filter = parseFilter(m[2]!, 'STAGE');
    const action = filter && parseAction(m[5]!, { who: 'CHOSEN' }, '');
    if (filter && action && (!filter.data || filter.data.kind === 'CHARACTER' || filter.data.levelAboveMasterLevel)) {
      const from = m[1] === '前列の' ? 'OPPONENT_FRONT_ROW' : m[1] === '後列の' ? 'OPPONENT_BACK_ROW' : 'OPPONENT_STAGE';
      return out(
        [{ do: 'CHOOSE', from, ...(filter.data ? { filter: filter.data } : {}), ...range(m[3], m[4]) }, ...action.data],
        `選對手${m[1] === '前列の' ? '前列' : m[1] === '後列の' ? '後列' : ''}${countZh(m[3], m[4])}${filter.zh}，${action.zh}`,
      );
    }
  }

  // Drawing, damage, the top of the deck and of the clock.
  if ((m = /^(\d+)枚引く$/.exec(text))) return out([{ do: 'DRAW', count: n(m[1]) }], `抽 ${m[1]} 張`);
  if ((m = /^そのアタック中、(?:あなたは)?トリガーステップにトリガーチェックを(\d+)回行う$/.exec(sentence))) return out([{ do: 'TRIGGER_CHECKS', count: n(m[1]) }], `這次攻擊的 Trigger 步驟進行 ${m[1]} 次 Trigger Check`);
  if ((m = /^(\d+)枚引き、自分の手札を(\d+)枚選び、控え室に置く$/.exec(text))) {
    return out(
      [{ do: 'DRAW', count: n(m[1]) }, { do: 'CHOOSE', from: 'YOUR_HAND', min: n(m[2]), max: n(m[2]) }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'WAITING_ROOM' }],
      `抽 ${m[1]} 張，然後選自己 ${m[2]} 張手牌放到控え室`,
    );
  }
  if ((m = /^相手に(\d+)ダメージを与える$/.exec(text))) return out([{ do: 'DAMAGE', amount: n(m[1]) }], `給予對手 ${m[1]} 點傷害`);
  if (text === '自分のクロックの上から1枚を、控え室に置く') return out([{ do: 'CLOCK_TOP', to: 'WAITING_ROOM' }], '把自己 Clock 最上面 1 張放到控え室');
  if (text === '自分のクロックの上から1枚を、ストック置場に置く') return out([{ do: 'CLOCK_TOP', to: 'STOCK' }], '把自己 Clock 最上面 1 張放到 Stock');
  if ((m = /^自分のクロックの上から1枚までを、控え室に置き、(そのターン中、このカードの.+)$/.exec(text))) {
    const then = parseAction(m[1]!.replace('このカードの', ''), { who: 'SELF' }, '這張卡');
    if (then) return out([{ do: 'CLOCK_TOP', to: 'WAITING_ROOM', optional: true }, ...then.data], `可以把自己 Clock 最上面 1 張放到控え室，然後${then.zh}`);
  }
  if ((m = new RegExp(`^相手の控え室の(.+?)を${COUNT}選び、(.+)$`).exec(text))) {
    const filter = parseFilter(m[1]!, 'ZONE');
    const action = filter && parseAction(m[4]!, { who: 'CHOSEN' }, '');
    if (filter && action) {
      return out(
        [{ do: 'CHOOSE', from: 'OPPONENT_WAITING_ROOM', ...(filter.data ? { filter: filter.data } : {}), ...range(m[2], m[3]) }, ...action.data],
        `從對手的控え室選${countZh(m[2], m[3])}${filter.zh}，${action.zh}`,
      );
    }
  }
  if (text === '相手のクロックの上から1枚を、控え室に置く') return out([{ do: 'CLOCK_TOP', to: 'WAITING_ROOM', whose: 'OPPONENT' }], '把對手 Clock 最上面 1 張放到控え室');
  if ((m = /^自分の山札の上から(\d+)枚を、(ストック置場|控え室|クロック置場)に置く$/.exec(text))) {
    const to = m[2] === 'ストック置場' ? 'STOCK' : m[2] === '控え室' ? 'WAITING_ROOM' : 'CLOCK';
    return out([{ do: 'DECK_TOP', count: n(m[1]), to }], `把自己山札頂 ${m[1]} 張放到${m[2] === 'ストック置場' ? ' Stock' : m[2] === '控え室' ? '控え室' : ' Clock'}`);
  }
  if ((m = /^自分か相手の、山札の上から(\d+)枚を、控え室に置く$/.exec(text))) {
    return out([{ do: 'DECK_TOP', count: n(m[1]), to: 'WAITING_ROOM', whose: 'EITHER' }], `選自己或對手，把那名玩家山札頂 ${m[1]} 張放到控え室`);
  }
  if (text === '自分の控え室のカードすべてを、山札に戻し、その山札をシャッフルする') {
    return out([{ do: 'WAITING_ROOM_TO_DECK' }, { do: 'SHUFFLE' }], '把自己控え室的全部卡放回山札並洗牌');
  }

  // Searching the deck; looking at the top cards.
  if ((m = /^自分の山札を見て(.+?)を(\d+)枚まで選んで相手に見せ、手札に加え、その山札をシャッフルする$/.exec(text))) {
    const filter = parseFilter(m[1]!, 'ZONE');
    if (filter) {
      return out(
        [{ do: 'CHOOSE', from: 'YOUR_DECK', ...(filter.data ? { filter: filter.data } : {}), min: 0, max: n(m[2]) }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND', reveal: true }, { do: 'SHUFFLE' }],
        `查看自己整個山札，選最多 ${m[2]} 張${filter.zh}，給對手看後加入手牌，然後洗山札`,
      );
    }
  }
  if ((m = /^自分の山札を上から(\d+)枚まで見て、(.+?)を1枚まで選んで相手に見せ、手札に加え、残りのカードを控え室に置く$/.exec(text))) {
    const filter = parseFilter(m[2]!, 'ZONE');
    if (filter?.data) return out([{ do: 'LOOK_TOP', upTo: n(m[1]), pick: filter.data, reveal: true }], `查看自己山札頂最多 ${m[1]} 張，選最多 1 張${filter.zh}，給對手看後加入手牌，其餘放到控え室`);
  }
  if ((m = /^自分の山札を上から(\d+)枚まで見て、カードを1枚まで選び、手札に加え、残りのカードを控え室に置く$/.exec(text))) {
    return out([{ do: 'LOOK_TOP', upTo: n(m[1]) }], `查看自己山札頂最多 ${m[1]} 張，選最多 1 張加入手牌，其餘放到控え室`);
  }
  // Looking at the top of a deck and putting cards back in any order.
  if ((m = /^(自分|相手)の山札を上から(\d+)枚まで見て、(?:カードを(\d+)枚まで選び、)?山札の上に好きな順番で置(?:く|き、残りのカードを控え室に置く)$/.exec(text))) {
    const keep = m[3] !== undefined;
    if (keep !== text.endsWith('残りのカードを控え室に置く')) return null;
    return out(
      [{ do: 'REORDER_TOP', upTo: n(m[2]), ...(m[1] === '相手' ? { whose: 'OPPONENT' as const } : {}), ...(keep ? { keep: n(m[3]) } : {}) }],
      `查看${m[1] === '相手' ? '對手' : '自己'}山札頂最多 ${m[2]} 張，${keep ? `選最多 ${m[3]} 張按自己喜歡的次序放回山札頂，其餘放到控え室` : '按自己喜歡的次序放回山札頂'}`,
    );
  }
  if (text === '相手は自分のストックすべてを、控え室に置き、自分の山札の上から同じ枚数をストック置場に置く') {
    return out([{ do: 'OPPONENT_STOCK_RESET', via: 'WAITING_ROOM' }], '對手把自己全部 Stock 放到控え室，再把自己山札頂同樣張數放到 Stock');
  }
  if (text === '相手は自分のストックすべてを、山札に戻し、その山札をシャッフルし、自分の山札の上から同じ枚数をストック置場に置く') {
    return out([{ do: 'OPPONENT_STOCK_RESET', via: 'DECK' }], '對手把自己全部 Stock 放回山札並洗牌，再把自己山札頂同樣張數放到 Stock');
  }
  if (text === '自分のクロックの上から1枚までを、控え室に置く') return out([{ do: 'CLOCK_TOP', to: 'WAITING_ROOM', optional: true }], '可以把自己 Clock 最上面 1 張放到控え室');
  // Effects on all of your characters for a while.
  if ((m = /^(他の)?あなたの(.+?)すべてに、((?:そのターン中|次の相手のターンの終わりまで)、.+)$/.exec(text))) {
    const filter = parseFilter(m[2]!, 'STAGE');
    if (filter && (!filter.data || filter.data.kind === 'CHARACTER')) {
      const target: Target = { who: 'ALL_YOURS', ...(filter.data ? { filter: filter.data } : {}), ...(m[1] ? { other: true } : {}) };
      const action = parseAction(m[3]!, target, `我方${m[1] ? '其他' : '所有'}${filter.zh}`);
      if (action) return action;
    }
  }
  // "Aするか、B": one of two effects, chosen by the player.
  for (let i = text.indexOf('か、'); i > 0; i = text.indexOf('か、', i + 1)) {
    if (!/[るすく]$/.test(text.slice(0, i))) continue;
    const a = parseSentence(text.slice(0, i), battle);
    const b = parseSentence(text.slice(i + 2), battle);
    if (a && b) return out([{ do: 'CHOOSE_ONE', options: [a.data, b.data], said: 'OR' }], `${a.zh}，或${b.zh}（自己選）`);
  }
  // "AしB": two effects in one sentence, done in order. Tried last, so a known whole sentence is never split.
  for (const join of ['置き、', '戻し、']) {
    for (let i = text.indexOf(join); i > 0; i = text.indexOf(join, i + 1)) {
      const a = parseSentence(`${text.slice(0, i)}${join === '置き、' ? '置く' : '戻す'}`, battle);
      const b = a && parseSentence(text.slice(i + join.length), battle);
      if (a && b) return out([...a.data, ...b.data], `${a.zh}，然後${b.zh}`);
    }
  }
  return null;
}

/** One quoted effect of a choice: plain effect sentences, or "［cost］ あなたはコストを払ってよい。そうしたら、…". */
function parseQuotedEffect(inner: string, battle: boolean): Out<Effect[]> {
  const paid = /^［([^］]*)］ ?あなたはコストを払ってよい。そうしたら、(.+)$/.exec(inner);
  const sentences = (paid ? paid[2]! : inner).split('。').filter((s) => s !== '');
  // One "…してよい" sentence alone: the effects that can be declined by themselves.
  if (!paid && sentences.length === 1 && plainForm(sentences[0]!) !== null) {
    const plain = parseEffects([plainForm(sentences[0]!)!], battle);
    const only = plain?.data.length === 1 ? plain.data[0] : undefined;
    if (only?.do === 'CLOCK_TOP' && !only.optional) return out([{ ...only, optional: true }], `可以${plain!.zh}`);
    if (only?.do === 'DRAW' && !only.optional) return out([{ ...only, optional: true }], `可以${plain!.zh}`);
    return null;
  }
  if (sentences.some((s) => s.startsWith('そうしたら、') || plainForm(s) !== null)) return null;
  const effects = parseEffects(sentences, battle);
  if (!effects || !paid) return effects;
  const cost = parseCost(splitCost(paid[1]!));
  return cost && out([{ do: 'MAY_PAY', cost: cost.data, then: effects.data }], `可以支付 [${cost.zh}]，支付後${effects.zh}`);
}

/**
 * Which effect sentences are not known, for the work list: sentences that only make sense together
 * (集中, a choice of effects, a revealed card, a given ability) are judged together, and inside a
 * choice each quoted effect is judged by itself.
 */
function unknownEffects(sentences: string[], battle: boolean): Unknown[] {
  const found: Unknown[] = [];
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i]!;
    const next = sentences[i + 1];
    if (/^(?:あなたは)?次の\dつの効果のうちあなたが選んだ1つを行う$/.test(s) && next?.startsWith('『')) {
      for (const q of [...next.matchAll(/『([^『』]+)』/g)]) if (!parseQuotedEffect(q[1]!, battle)) found.push({ part: 'EFFECT', text: `選擇其一: ${q[1]}` });
      if (found.length === 0) found.push({ part: 'EFFECT', text: s });
      i++;
      continue;
    }
    const pair = next !== undefined && (/山札の上から\d+枚をめくり、控え室に置く$|山札の上から1枚を公開する$|次の能力を与える$/.test(s));
    if (pair) {
      if (!parseEffects([s, next!], battle)) found.push({ part: 'EFFECT', text: `${s}。${next}` });
      i++;
      continue;
    }
    if (!parseEffects([s], battle)) found.push({ part: 'EFFECT', text: s });
  }
  return found;
}

/** The effect sentences of an ability, in order. 集中 takes two sentences. */
function parseEffects(all: string[], battle: boolean): Out<Effect[]> {
  const effects: Effect[] = [];
  const zh: string[] = [];
  // "Ｘは…に等しい": where X comes from, said after the sentence that uses it.
  // "Ｘはあなたの…の枚数×Nに等しい": Ｘ is N per character of yours that matches (the engine's per).
  const perDef = all.map((s) => /^Ｘは(他の)?あなたの(.+?)の枚数×(\d+)に等しい$/.exec(s)).find((m) => m);
  if (perDef) {
    const filter = parseFilter(perDef[2]!, 'STAGE');
    const rest = all.filter((s) => s !== perDef[0]).map((s) => s.replace('＋Ｘ', `＋${perDef[3]}`));
    if (!filter || (filter.data && filter.data.kind !== 'CHARACTER') || rest.length !== all.length - 1 || all.filter((s) => s.includes('＋Ｘ')).length !== 1) return null;
    const plain = parseEffects(rest, battle);
    const modifies = plain?.data.filter((e) => e.do === 'MODIFY') ?? [];
    if (!plain || modifies.length !== 1) return null;
    const per = { ...(filter.data ? { filter: filter.data } : {}), ...(perDef[1] ? { other: true } : {}) };
    return out(
      plain.data.map((e) => (e.do === 'MODIFY' ? { ...e, per } : e)),
      `${plain.zh}（數值改為：我方${perDef[1] ? '其他' : ''}${filter.zh}每張 ${perDef[3]}）`,
    );
  }
  const xDef = all.map((s) => /^Ｘは(それらのカードのレベルの合計|公開されたカードのレベル)(?:×(\d+))?に等しい$/.exec(s)).find((m) => m);
  const sentences = xDef ? all.filter((s) => s !== xDef[0]) : all;
  if (xDef) {
    // The sentence that makes X: the top cards to the waiting room, or one card shown; then what uses X.
    const made =
      xDef[1] === 'それらのカードのレベルの合計'
        ? /^あなたは自分の山札の上から(\d+)枚を、控え室に置き、(.+Ｘ.*)$/.exec(sentences[0] ?? '')
        : /^あなたは自分の山札の上から1枚を公開し、(.+Ｘ.*)$/.exec(sentences[0] ?? '');
    if (!made || sentences.length !== 1) return null;
    const uses = made[made.length - 1]!;
    const times = xDef[2] ? n(xDef[2]) : 1;
    let usesX: Out<Effect[]> = null;
    const boost = /^そのターン中、このカードの(パワー|ソウル)を＋Ｘ$/.exec(uses);
    if (boost) {
      usesX = out([{ do: 'MODIFY', target: { who: 'SELF' }, stat: boost[1] === 'パワー' ? 'POWER' : 'SOUL', amount: times, timesX: true }], `該回合這張卡 ${boost[1] === 'パワー' ? 'Power' : 'Soul'} +Ｘ${times > 1 ? `×${times}` : ''}`);
    } else if (/レベルＸ以下の/.test(uses) && times === 1) {
      const chosen = parseSentence(uses.replace('レベルＸ以下の', ''), battle);
      const first = chosen?.data[0];
      if (first?.do === 'CHOOSE') usesX = out([{ ...first, levelMaxX: true }, ...chosen!.data.slice(1)], chosen!.zh.replace(/選/, '選 Level Ｘ 或以下的'));
    }
    if (!usesX) return null;
    const maker: Effect = xDef[1] === 'それらのカードのレベルの合計' ? { do: 'DECK_TOP', count: n(made[1]), to: 'WAITING_ROOM', setX: 'LEVEL_TOTAL' } : { do: 'SHOW_TOP' };
    const makerZh = xDef[1] === 'それらのカードのレベルの合計' ? `把自己山札頂 ${made[1]} 張放到控え室（Ｘ是這些卡的 Level 合計，Climax 當作 0）` : '公開自己山札頂 1 張後放回原處（Ｘ是該卡的 Level，Climax 當作 0）';
    return out([maker, ...usesX.data], `${makerZh}，然後${usesX.zh}`);
  }
  for (let i = 0; i < sentences.length; i++) {
    const brainstorm = /^あなたは自分の山札の上から(\d+)枚をめくり、控え室に置く$/.exec(sentences[i]!);
    const each = brainstorm && /^それらのカードのCX1枚につき、(.+)$/.exec(sentences[i + 1] ?? '');
    if (brainstorm && each) {
      const plain = plainForm(each[1]!);
      const inner = parseSentence(plain ?? each[1]!, false);
      // "…してよい" inside: only for a choice of cards, where it is "up to" in effect; kept out for now.
      if (!inner || plain) return null;
      effects.push({ do: 'BRAINSTORM', count: n(brainstorm[1]), per: { kind: 'CLIMAX' }, each: inner.data });
      zh.push(`翻開山札頂 ${brainstorm[1]} 張放到控え室，其中每有 1 張 Climax，${inner.zh}`);
      i++;
      continue;
    }
    // "次のNつの効果のうちあなたが選んだ1つを行う。『…』『…』": the player chooses one of the quoted effects.
    const choice = /^(?:あなたは)?次の(\d)つの効果のうちあなたが選んだ1つを行う$/.exec(sentences[i]!);
    if (choice) {
      const quoted = [...(sentences[i + 1] ?? '').matchAll(/『([^『』]+)』/g)].map((q) => q[1]!);
      if (quoted.length !== n(choice[1]) || quoted.map((q) => `『${q}』`).join('') !== sentences[i + 1]) return null;
      const options = quoted.map((q) => parseQuotedEffect(q, battle));
      if (options.some((o) => o === null)) return null;
      effects.push({ do: 'CHOOSE_ONE', options: options.map((o) => o!.data) });
      zh.push(`從以下 ${quoted.length} 個效果選 1 個執行：${options.map((o, k) => `（${k + 1}）${o!.zh}`).join('；')}`);
      i++;
      continue;
    }
    // "自分の山札の上から1枚を公開する。そのカードが…なら…": the card is taken into the hand, or something else is done.
    const shown = sentences[i] === 'あなたは自分の山札の上から1枚を公開する' ? /^そのカード(?:が(.+?)|のレベルが(\d+)以上)なら(手札に加える|ストック置場に置く|手札に加え、(.+)|、(.+))$/.exec(sentences[i + 1] ?? '') : null;
    if (sentences[i] === 'あなたは自分の山札の上から1枚を公開する') {
      const levelFilter = shown?.[2] !== undefined ? out<CardFilter | undefined>({ levelMin: n(shown[2]) }, `Level ${shown[2]} 或以上的卡`) : null;
      const filter = shown && (levelFilter ?? parseFilter(shown[1]!, 'ZONE'));
      if (shown && shown[3] === 'ストック置場に置く' && filter?.data) {
        effects.push({ do: 'REVEAL_TOP', filter: filter.data, toStock: true });
        zh.push(`公開自己山札頂 1 張：如果是${filter.zh}，放到 Stock（否則放回原處）`);
        i++;
        continue;
      }
      // Groups: 4 = what follows 手札に加え、, 5 = what follows "なら、" (the card is not taken).
      const rest = shown?.[4] ?? shown?.[5];
      const then = rest ? parseSentence(rest, battle) : null;
      if (!shown || !filter?.data || (rest && !then)) return null;
      const take = shown[5] === undefined;
      effects.push({ do: 'REVEAL_TOP', filter: filter.data, ...(take ? { take: true } : {}), ...(then ? { then: then.data } : {}) });
      zh.push(`公開自己山札頂 1 張：如果是${filter.zh}，${take ? '加入手牌' : ''}${then ? `${take ? '，然後' : ''}${then.zh}` : ''}（否則放回原處）`);
      i++;
      continue;
    }
    // "手札に加えたなら、…": only if the search or look just before put a card into the hand.
    const added = /^手札に加えたなら、(.+)$/.exec(sentences[i]!);
    const lastEffect = effects[effects.length - 1];
    if (added && (lastEffect?.do === 'LOOK_TOP' || (lastEffect?.do === 'SHUFFLE' && effects[effects.length - 2]?.do === 'MOVE'))) {
      const then = parseEffects([added[1]!], battle);
      if (!then) return null;
      effects.push({ do: 'IF', condition: { if: 'DID' }, then: then.data });
      zh.push(`加入了手牌的話，${then.zh}`);
      continue;
    }
    // "…、次の能力を与える。『…』": the ability given is the next, quoted sentence.
    const giving = /^(.*、)次の能力を与える$/.exec(sentences[i]!);
    const quoted = giving && /^『(.+?)。?』$/.exec(sentences[i + 1] ?? '');
    const one = giving && quoted ? parseSentence(`${giving[1]}『${quoted[1]}。』を与える`, battle) : parseSentence(sentences[i]!, battle);
    if (giving && quoted && one) i++;
    if (!one) return null;
    effects.push(...one.data);
    zh.push(one.zh);
  }
  return effects.length > 0 ? out(effects, zh.join('，然後')) : null;
}

// ---------------------------------------------------------------------------
// Whole lines
// ---------------------------------------------------------------------------

export interface GrammarLine {
  ability: Ability;
  zh: string;
}

/** Which part of a line the grammar does not know; for the work list. */
export interface Unknown {
  part: 'SHAPE' | 'MARK' | 'TRIGGER' | 'COST' | 'CONDITION' | 'EFFECT' | 'OPTIONAL';
  text: string;
}

function automatic(parts: LineParts, unknown: Unknown[]): GrammarLine | null {
  const combo = parts.marks.includes('CXコンボ');
  const isEncore = parts.marks.includes('アンコール');
  if (parts.marks.some((mark) => mark !== 'CXコンボ' && mark !== 'アンコール')) unknown.push({ part: 'MARK', text: parts.marks.join(' ') });
  const cost = parts.cost ? parseCost(parts.cost) : out<Cost[]>([], '');
  if (!cost) for (const action of parts.cost ?? []) if (!parseCostAction(action)) unknown.push({ part: 'COST', text: action });
  if (isEncore) {
    // 【自】 アンコール ［cost］: the rest of the line is reminder text.
    if (parts.trigger || parts.effects.length > 0 || parts.conditions.length > 0 || !parts.cost) unknown.push({ part: 'SHAPE', text: 'アンコール' });
    if (unknown.length > 0 || !cost) return null;
    return { ability: encore(cost.data), zh: `【自】Encore [${cost.zh}]：這張卡由舞台放到控え室時，可以支付費用；支付後把它 Rest 放回原本的枠。` };
  }
  // "あなたのターン中、…した時": the trigger with a condition on whose turn it is.
  const inTurn = /^(あなたのターン中|相手のターン中)、(.+)$/.exec(parts.trigger ?? '');
  const trigger = parts.trigger ? parseTrigger(inTurn ? inTurn[2]! : parts.trigger) : null;
  if (!trigger) unknown.push({ part: 'TRIGGER', text: parts.trigger ?? '(none)' });
  const conditions = [...(inTurn ? [inTurn[1]!] : []), ...parts.conditions].map(parseCondition);
  conditions.forEach((c, i) => c === null && unknown.push({ part: 'CONDITION', text: [...(inTurn ? [inTurn[1]!] : []), ...parts.conditions][i]! }));
  const condition = allOf(conditions);

  // The effect: after paying a cost, after choosing to ("…してよい"), or always.
  let sentences = parts.effects;
  let optional = false;
  if (parts.cost) {
    if (sentences[0] !== 'あなたはコストを払ってよい' || !sentences[1]?.startsWith('そうしたら、')) {
      unknown.push({ part: 'SHAPE', text: 'cost without あなたはコストを払ってよい。そうしたら、' });
      return null;
    }
    sentences = [sentences[1].slice('そうしたら、'.length), ...sentences.slice(2)];
  } else {
    const first = plainForm(sentences[0] ?? '');
    if (first !== null) {
      // "…してよい": the player is asked once. Alone, or "N枚引いてよい。そうしたら、…" (drawing can always be done).
      const drawThen = /^あなたは\d+枚引く$/.test(first) && sentences.length === 2 && sentences[1]!.startsWith('そうしたら、');
      if (sentences.length === 1) sentences = [first];
      else if (drawThen) sentences = [first, sentences[1]!.slice('そうしたら、'.length)];
      else if (sentences.length === 2 && sentences[1]!.startsWith('そうしたら、')) {
        // "Aしてよい。そうしたら、B": B happens only if A was really done (it may be impossible, e.g. nothing to choose).
        const fights = trigger?.data.on === 'BATTLE_OPPONENT_REVERSED' || parts.conditions.some((c) => c.includes('バトル相手'));
        const a = parseEffects([first], fights);
        const b = parseEffects([sentences[1]!.slice('そうしたら、'.length)], fights);
        const last = a?.data[a.data.length - 1];
        const cond = condition;
        if (a && b && trigger && cond && unknown.length === 0 && (last?.do === 'MOVE' || last?.do === 'CLOCK_TOP')) {
          return {
            ability: {
              type: 'AUTO',
              ...(combo ? { keywords: ['CX_COMBO'] } : {}),
              trigger: trigger.data,
              ...(cond.data ? { condition: cond.data } : {}),
              optional: true,
              effect: [...a.data, { do: 'IF', condition: { if: 'DID' }, then: b.data }],
            },
            zh: `【自】${combo ? '【CX Combo】' : ''}${trigger.zh}${cond.zh ? `，如果${cond.zh}` : ''}：可以${a.zh}；這樣做了的話，${b.zh}。`,
          };
        }
        unknown.push({ part: 'OPTIONAL', text: sentences.join('。') });
        return null;
      } else {
        unknown.push({ part: 'OPTIONAL', text: sentences.join('。') });
        return null;
      }
      optional = true;
    }
  }
  if (sentences.some((s) => s.startsWith('そうしたら、') || plainForm(s) !== null)) {
    unknown.push({ part: 'OPTIONAL', text: sentences.join('。') });
    return null;
  }
  const battle = trigger?.data.on === 'BATTLE_OPPONENT_REVERSED' || parts.conditions.some((c) => c.includes('バトル相手'));
  const effects = parseEffects(sentences, battle);
  if (!effects) unknown.push(...unknownEffects(sentences, battle));
  if (unknown.length > 0 || !trigger || !cost || !condition || !effects) return null;

  const ability: AutoAbility = {
    type: 'AUTO',
    ...(combo ? { keywords: ['CX_COMBO'] } : {}),
    trigger: trigger.data,
    ...(condition.data ? { condition: condition.data } : {}),
    ...(parts.cost ? { cost: cost.data } : {}),
    ...(optional ? { optional: true } : {}),
    effect: effects.data,
  };
  const zh =
    `【自】${combo ? '【CX Combo】' : ''}${parts.cost ? `[${cost.zh}] ` : ''}${trigger.zh}` +
    `${condition.zh ? `，如果${condition.zh}` : ''}：${parts.cost ? '可以支付費用；支付後' : optional ? '可以' : ''}${effects.zh}。`;
  return { ability, zh };
}

function activated(parts: LineParts, unknown: Unknown[]): GrammarLine | null {
  const brainstorm = parts.marks.includes('集中');
  if (parts.marks.some((mark) => mark !== '集中')) unknown.push({ part: 'MARK', text: parts.marks.join(' ') });
  // "…なら、…" in an activated ability: the cost can be paid anyway; the effect happens only if the condition holds then.
  const conditions = parts.conditions.map(parseCondition);
  conditions.forEach((c, i) => c === null && unknown.push({ part: 'CONDITION', text: parts.conditions[i]! }));
  const condition = allOf(conditions);
  const cost = parts.cost ? parseCost(parts.cost) : null;
  if (!parts.cost) unknown.push({ part: 'SHAPE', text: '【起】 without a cost' });
  else if (!cost) for (const action of parts.cost) if (!parseCostAction(action)) unknown.push({ part: 'COST', text: action });
  if (parts.effects.some((s) => s.startsWith('そうしたら、') || plainForm(s) !== null)) {
    unknown.push({ part: 'OPTIONAL', text: parts.effects.join('。') });
    return null;
  }
  const effects = parseEffects(parts.effects, false);
  if (!effects) unknown.push(...unknownEffects(parts.effects, false));
  if (effects && brainstorm !== (effects.data[0]?.do === 'BRAINSTORM')) unknown.push({ part: 'SHAPE', text: '集中' });
  if (unknown.length > 0 || !cost || !effects || !condition) return null;
  if (condition.data && brainstorm) return null;
  return {
    ability: {
      type: 'ACT',
      ...(brainstorm ? { keywords: ['BRAINSTORM'] } : {}),
      timing: 'MAIN',
      cost: cost.data,
      effect: condition.data ? [{ do: 'IF', condition: condition.data, then: effects.data }] : effects.data,
    },
    zh: `【起】${brainstorm ? '集中 ' : ''}[${cost.zh}]：${condition.zh ? `如果${condition.zh}，` : ''}${effects.zh}。`,
  };
}

/** 【永】: this card's or your characters' numbers, while conditions hold. */
function continuous(parts: LineParts, unknown: Unknown[]): GrammarLine | null {
  if (parts.marks.length > 0 || parts.cost) unknown.push({ part: 'MARK', text: [...parts.marks, parts.cost ? '［cost］' : ''].join(' ') });
  // "…し、このカードは次の能力を得る。『【自】…』": the abilities this card has while the condition holds.
  const given: { ability: AutoAbility; zh: string }[] = [];
  let body = parts.effects;
  const gains = /^(.*?)(?:し、)?このカードは次の(?:(\d)つの)?能力を得る$/.exec(body[0] ?? '');
  if (gains) {
    const quoted = body.slice(1);
    if (quoted.length !== n(gains[2] ?? '1') || quoted.some((q) => !/^『.*』$/.test(q))) {
      unknown.push({ part: 'EFFECT', text: body.join('。') });
      return null;
    }
    for (const q of quoted) {
      const inner = readLine(q.slice(1, -1).replace(/。$/, '') + '。');
      if (!inner.line || inner.line.ability.type !== 'AUTO') {
        unknown.push({ part: 'EFFECT', text: `得る: ${q}` });
        return null;
      }
      given.push({ ability: inner.line.ability, zh: inner.line.zh });
    }
    body = gains[1] ? [gains[1]] : [];
  }
  if (body.length !== (gains && !gains[1] ? 0 : 1)) {
    unknown.push({ part: 'EFFECT', text: parts.effects.join('。') });
    return null;
  }
  // "あなたのターン中、…" before the effect is a condition too.
  let sentence = body[0] ?? '';
  const texts = [...parts.conditions];
  const turn = /^(あなたのターン中|相手のターン中)、(.+)$/.exec(sentence);
  if (turn && parts.conditions.length === 0) {
    texts.push(turn[1]!);
    sentence = turn[2]!;
  }
  const conditions = texts.map(parseCondition);
  conditions.forEach((c, i) => c === null && unknown.push({ part: 'CONDITION', text: texts[i]! }));
  const condition = allOf(conditions);

  if (sentence === 'このカードは相手の効果に選ばれない' && given.length === 0) {
    if (unknown.length > 0 || !condition || condition.data) return null;
    return { ability: { type: 'CONT', untargetable: true, apply: [] }, zh: '【永】這張卡不會被對手的效果選擇。' };
  }
  const perMatch = /^(他の)?あなたの(.+?)(\d+)枚につき、このカードの(パワー|ソウル)を＋(\d+)$/.exec(sentence);
  if (perMatch && perMatch[3] === '1' && given.length === 0) {
    const filter = parseFilter(perMatch[2]!, 'STAGE');
    if (unknown.length > 0 || !condition || !filter || (filter.data && filter.data.kind !== 'CHARACTER')) return null;
    const stat = perMatch[4] === 'パワー' ? 'POWER' : 'SOUL';
    return {
      ability: {
        type: 'CONT',
        ...(condition.data ? { condition: condition.data } : {}),
        apply: [{ target: { who: 'SELF' }, stat, amount: n(perMatch[5]), per: { ...(filter.data ? { filter: filter.data } : {}), ...(perMatch[1] ? { other: true } : {}) } }],
      },
      zh: `【永】${condition.zh ? `${condition.zh}，` : ''}我方${perMatch[1] ? '其他' : ''}${filter.zh}每有 1 張，這張卡 ${stat === 'POWER' ? 'Power' : 'Soul'} +${perMatch[5]}。`,
    };
  }
  // "あなたの手札のこのカードのレベルを－N": works while the card is in the hand.
  const inHand = /^あなたの手札のこのカードのレベルを－(\d+)$/.exec(sentence);
  if (inHand && given.length === 0) {
    if (unknown.length > 0 || !condition) return null;
    return {
      ability: { type: 'CONT', inHand: true, ...(condition.data ? { condition: condition.data } : {}), apply: [{ target: { who: 'SELF' }, stat: 'LEVEL', amount: -n(inHand[1]) }] },
      zh: `【永】${condition.zh ? `${condition.zh}，` : ''}這張卡在手牌時 Level －${inHand[1]}（可以提早使用）。`,
    };
  }
  let target: Extract<Target, { who: 'SELF' | 'ALL_YOURS' }> | null = null;
  let targetZh = '';
  let changes: ReturnType<typeof parseChanges> = null;
  let m: RegExpExecArray | null;
  if ((m = /^このカードの(.+)$/.exec(sentence))) {
    target = { who: 'SELF' };
    targetZh = '這張卡';
    changes = parseChanges(m[1]!);
  } else if ((m = /^(他の)?あなたの(.+?)すべてに、(.+)$/.exec(sentence))) {
    const filter = parseFilter(m[2]!, 'STAGE');
    if (filter && (!filter.data || filter.data.kind === 'CHARACTER')) {
      target = { who: 'ALL_YOURS', ...(filter.data ? { filter: filter.data } : {}), ...(m[1] ? { other: true } : {}) };
      targetZh = `我方${m[1] ? '其他' : '所有'}${filter.zh}全部`;
      changes = parseChanges(m[3]!);
    }
  }
  const noChange = given.length > 0 && sentence === '';
  if (!noChange && (!target || !changes)) unknown.push({ part: 'EFFECT', text: sentence });
  if (given.length > 0 && target && target.who !== 'SELF') unknown.push({ part: 'EFFECT', text: sentence });
  if (unknown.length > 0 || !condition) return null;
  const apply = noChange ? [] : changes!.map((c) => ({ target: target!, stat: c.stat, amount: c.amount }));
  return {
    ability: {
      type: 'CONT',
      ...(condition.data ? { condition: condition.data } : {}),
      apply,
      ...(given.length > 0 ? { grant: given.map((g) => ({ target: { who: 'SELF' as const }, ability: g.ability })) } : {}),
    },
    zh:
      `【永】${condition.zh ? `${condition.zh}，` : ''}${noChange ? '這張卡' : `${targetZh} ${changes!.map((c) => c.zh).join('、')}`}` +
      `${given.length > 0 ? `${noChange ? '' : '，並'}得到以下能力：${given.map((g) => `「${g.zh}」`).join('')}` : ''}。`,
  };
}

/** Ability data for one line of a character's or climax's text, or what is unknown about it. */
/**
 * The reminder in round brackets at the end of a line, removed when every note in it is known to say only
 * what the engine does anyway; otherwise the line is returned as it is (and stays unknown). Text in round
 * brackets anywhere else may carry meaning.
 */
function withoutReminders(line: string): string {
  const m = /（([^（）]*)）$/.exec(line);
  if (!m || /^【自】 アンコール ［[^］]*］ （[^（）]*）$/.test(line)) return line;
  const body = line.slice(0, m.index);
  const notes = m[1]!.split('。').filter((note) => note !== '');
  const known = notes.every((note) => {
    // CR-4.12.1.2: damage by an effect can be cancelled like any damage.
    if (note === 'ダメージキャンセルは発生する') return /ダメージを/.test(body);
    // CR-2.19.1: a climax has no level, so it counts as 0 — which is how the engine reads every level.
    if (note === 'CXのレベルは0として扱う') return /レベル/.test(body);
    // A card shown from the top of the deck and not taken stays where it was (REVEAL_TOP, SHOW_TOP).
    if (note === 'そうでないなら元に戻す') return /公開する。そのカード(?:が|の)[^。]*なら(?:手札に加え|ストック置場に置)/.test(body);
    if (note === '公開したカードは元に戻す') return /公開する。そのカード(?:が|の)[^。]*なら、|山札の上から1枚を公開し、/.test(body);
    return false;
  });
  return known ? body : line;
}

export function readLine(raw: string): { line: GrammarLine | null; unknown: Unknown[] } {
  let line = raw;
  const unknown: Unknown[] = [];
  line = withoutReminders(line);
  if (line.includes('（') && !/^【自】 アンコール ［[^］]*］ （[^（）]*）$/.test(line)) return { line: null, unknown: [{ part: 'SHAPE', text: `（…）: ${/（[^（）]*）/.exec(line)?.[0].slice(0, 30) ?? ''}` }] };
  const parts = splitLine(line);
  if (!parts) return { line: null, unknown: [{ part: 'SHAPE', text: line.slice(0, 40) }] };
  const result = parts.type === 'AUTO' ? automatic(parts, unknown) : parts.type === 'ACT' ? activated(parts, unknown) : parts.type === 'CONT' ? continuous(parts, unknown) : null;
  if (!result && unknown.length === 0) unknown.push({ part: 'SHAPE', text: line.slice(0, 40) });
  return { line: result, unknown: result ? [] : unknown };
}

/** The effect of an event card whose whole text is one paragraph of known effect sentences. Counter events are not read. */
export function readEvent(text: string): { effect: Effect[]; zh: string } | null {
  const line = withoutReminders(text.trim());
  if (line.includes('（') || line.includes('【') || line.includes('『')) return null;
  const parts = splitLine(line, 'EVENT');
  if (!parts || parts.type !== 'EVENT' || parts.marks.length > 0 || parts.cost || parts.trigger || parts.conditions.length > 0) return null;
  if (parts.effects.some((s) => s.startsWith('そうしたら、') || plainForm(s) !== null)) return null;
  const effects = parseEffects(parts.effects, false);
  return effects ? { effect: effects.data, zh: `${effects.zh}。` } : null;
}
