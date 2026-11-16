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

import type { Ability, ActivatedAbility, AutoAbility, CardFilter, Condition, ContinuousAbility, Cost, DelayedTime, Effect, SlotId, Target, Trigger } from '@wso/game-engine';
import { encore } from '@wso/game-engine';
import { type LineParts, outsideNames, splitCost, splitLine } from './fragments';
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
  // トリガーアイコンが[[soul.gif]][[soul.gif]]のCX: exactly those icons.
  const icons = /^トリガーアイコンが((?:\[\[[a-z]+\.gif\]\]){2,})のCX$/.exec(text);
  if (icons) {
    const list = [...icons[1]!.matchAll(/\[\[([a-z]+\.gif)\]\]/g)].map((x) => TRIGGER_ICONS[x[1]!]);
    if (list.every((x) => x)) return out({ kind: 'CLIMAX', triggersExactly: list as NonNullable<(typeof list)[number]>[] }, `Trigger 圖示是 ${list.join('＋')} 的 Climax`);
  }
  const icon = /^トリガーアイコンが\[\[([a-z]+\.gif)\]\]のCX$/.exec(text);
  if (icon && TRIGGER_ICONS[icon[1]!]) return out({ kind: 'CLIMAX', hasTrigger: TRIGGER_ICONS[icon[1]!]! }, `Trigger 圖示是 ${TRIGGER_ICONS[icon[1]!]} 的 Climax`);
  const name = /^「([^」]+)」$/.exec(text);
  if (name) return out({ name: name[1]! }, `「${name[1]}」`);
  const names = /^、?「([^」]+)」か「([^」]+)」$/.exec(text);
  if (names) return out({ names: [names[1]!, names[2]!] }, `「${names[1]}」或「${names[2]}」`);
  const includesAny = /^カード名に「([^」]+)」か「([^」]+)」を含むキャラ$/.exec(text);
  if (includesAny) return out(bare === 'STAGE' ? { nameIncludesAny: [includesAny[1]!, includesAny[2]!] } : { kind: 'CHARACTER', nameIncludesAny: [includesAny[1]!, includesAny[2]!] }, `卡名含有「${includesAny[1]}」或「${includesAny[2]}」的角色`);
  const colour = /^(赤|青|黄|緑)のカード$/.exec(text);
  if (colour) return out({ color: { 赤: 'red', 青: 'blue', 黄: 'yellow', 緑: 'green' }[colour[1] as '赤'] }, `${colour[1]}色的卡`);
  const power = /^(前列の|後列の)?パワー(\d+)以下のキャラ$/.exec(text);
  if (power && !power[1]) return out({ kind: 'CHARACTER', powerMax: n(power[2]) }, `Power ${power[2]} 或以下的角色`);
  if (text === '自分の控え室にあるCXと同じカード名のCX') return out({ kind: 'CLIMAX', nameInWaitingRoom: true }, '與自己控え室的 Climax 同名的 Climax');
  const excludes = /^、?カード名に「([^」]+)」を含まない《([^》]+)》のキャラ$/.exec(text);
  if (excludes) return out({ kind: 'CHARACTER', traits: [excludes[2]!], nameExcludes: excludes[1]! }, `卡名不含「${excludes[1]}」的《${excludes[2]}》角色`);
  const includes = /^カード名に「([^」]+)」を含むキャラ$/.exec(text);
  if (includes) return out(bare === 'STAGE' ? { nameIncludes: includes[1]! } : { kind: 'CHARACTER', nameIncludes: includes[1]! }, `卡名含有「${includes[1]}」的角色`);
  if (/^、?レベルが相手のレベルより高いキャラ$/.test(text)) return out({ levelAboveMasterLevel: true }, 'Level 高於對手玩家 Level 的角色');
  if (text === '『回想』を持つキャラ') return out({ kind: 'CHARACTER', hasRecollection: true }, '有「回想」的角色');
  const linked = /^『【リンク】 ([^』]+)』を持つキャラ$/.exec(text);
  if (linked) return out({ kind: 'CHARACTER', hasLink: linked[1]! }, `有「Link ${linked[1]}」的角色`);
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
  [
    /^マーカー置場にこのカードがあるなら、このマーカーを持つ舞台の、?(.+?)がアタックした時$/,
    (m) => {
      const filter = parseFilter(m[1]!, 'STAGE');
      return filter && (!filter.data || filter.data.kind === 'CHARACTER') ? out({ on: 'HOLDER_ATTACKS', ...(filter.data ? { filter: filter.data } : {}) }, `這張卡是 Marker 時，持有這個 Marker 的${filter.zh}攻擊時`) : null;
    },
  ],
  [/^あなたのCXフェイズ中、CX置場に「([^」]+)」が置かれた時$/, (m) => out({ on: 'CLIMAX_PLACED', filter: { name: m[1]! }, duringClimaxPhase: true }, `我方 Climax 階段中，Climax 置場放置了「${m[1]}」時`)],
  [/^相手のアタックフェイズの始めに$/, () => out({ on: 'PHASE_START', phase: 'ATTACK', turn: 'OPPONENT' }, '對手攻擊階段開始時')],
  [/^このカードが手札からCX置場に置かれた時$/, () => out({ on: 'THIS_CLIMAX_PLACED' }, '這張卡由手牌放到 Climax 置場時')],
  [
    /^他のあなたの前列の中央の枠の(.+?)がフロントアタックされた時$/,
    (m) => {
      const filter = parseFilter(m[1]!, 'STAGE');
      return filter && (!filter.data || filter.data.kind === 'CHARACTER') ? out({ on: 'OTHER_FRONT_ATTACKED', slots: ['FC'], ...(filter.data ? { filter: filter.data } : {}) }, `我方前列中央其他${filter.zh}被正面攻擊時`) : null;
    },
  ],
  [
    /^他のあなたの(.+?)がフロントアタックされた時$/,
    (m) => {
      const filter = parseFilter(m[1]!, 'STAGE');
      return filter && (!filter.data || filter.data.kind === 'CHARACTER') ? out({ on: 'OTHER_FRONT_ATTACKED', ...(filter.data ? { filter: filter.data } : {}) }, `我方其他${filter.zh}被正面攻擊時`) : null;
    },
  ],
  [
    /^あなたのトリガーアイコンが\[\[([a-z]+)\.gif\]\]のCXがトリガーした時$/,
    (m) => (TRIGGER_ICONS[`${m[1]}.gif`] ? out({ on: 'TRIGGER_CHECK_REVEALS', filter: { kind: 'CLIMAX', hasTrigger: TRIGGER_ICONS[`${m[1]}.gif`]! } }, `我方 Trigger Check 翻出 Trigger 圖示是 ${TRIGGER_ICONS[`${m[1]}.gif`]} 的 Climax 時`) : null),
  ],
  [/^このカードかこのカードのバトル相手が【リバース】した時$/, () => out({ on: 'EITHER', of: [{ on: 'REVERSED' }, { on: 'BATTLE_OPPONENT_REVERSED' }] }, '這張卡或這張卡的戰鬥對手被 Reverse 時')],
  [/^相手が【起】を使った時$/, () => out({ on: 'OPPONENT_PLAYED_ACT' }, '對手使用【起】能力時')],
  [/^このカードがダイレクトアタックした時$/, () => out({ on: 'ATTACKS', attackType: 'DIRECT' }, '這張卡直接攻擊時')],
  [/^このカードが手札から舞台に置かれたターン中、あなたのCXフェイズの始めに$/, () => out({ on: 'PHASE_START', phase: 'CLIMAX', turn: 'YOURS', placedThisTurn: true }, '這張卡由手牌放到舞台的回合中，我方 Climax 階段開始時')],
  [/^あなたが【起】を使った時$/, () => out({ on: 'YOU_PLAYED_ACT' }, '我方使用【起】能力時')],
  [
    /^あなたの(トリガーアイコンが(?:\[\[[a-z]+\.gif\]\]){2,}のCX)がCX置場に置かれた時$/,
    (m) => {
      const filter = parseFilter(m[1]!, 'ZONE');
      return filter?.data ? out({ on: 'CLIMAX_PLACED', filter: filter.data }, `我方${filter.zh}放到 Climax 置場時`) : null;
    },
  ],
  [
    /^このカードのトリガーチェックで(.+)がでた時$/,
    (m) => {
      const filter = parseFilter(m[1]!, 'ZONE');
      return filter?.data ? out({ on: 'TRIGGER_CHECK_REVEALS', filter: filter.data, ofThisCard: true }, `這張卡的 Trigger Check 翻出${filter.zh}時`) : null;
    },
  ],
  [/^あなたの受けたダメージがキャンセルされなかった時$/, () => out({ on: 'TAKEN_DAMAGE_NOT_CANCELLED' }, '我方受到的傷害沒有被 Cancel 時')],
  [/^このカードがトリガーした時$/, () => out({ on: 'THIS_TRIGGERED' }, '這張卡在 Trigger Check 被翻出時')],
  [/^このカードの与えたダメージがキャンセルされた時$/, () => out({ on: 'DEALT_DAMAGE_CANCELLED' }, '這張卡造成的傷害被 Cancel 時')],
  [/^このカードのバトル中、あなたの受けたダメージがキャンセルされた時$/, () => out({ on: 'TAKEN_DAMAGE_CANCELLED_IN_BATTLE' }, '這張卡戰鬥中，我方受到的傷害被 Cancel 時')],
  [
    /^あなたの、(.+)がトリガーした時$/,
    (m) => {
      const filter = parseFilter(m[1]!, 'ZONE');
      return filter?.data?.anyOf ? out({ on: 'TRIGGER_CHECK_REVEALS', filter: filter.data }, `我方 Trigger Check 翻出${filter.zh}時`) : null;
    },
  ],
  [/^あなたのCXがトリガーした時$/, () => out({ on: 'TRIGGER_CHECK_REVEALS', filter: { kind: 'CLIMAX' } }, '我方 Trigger Check 翻出 Climax 時')],
  [/^相手のCXがCX置場に置かれた時$/, () => out({ on: 'CLIMAX_PLACED', opponent: true }, '對手的 Climax 放到 Climax 置場時')],
  [
    /^あなたのトリガーアイコンが\[\[([a-z]+)\.gif\]\]のCXがCX置場に置かれた時$/,
    (m) => (TRIGGER_ICONS[`${m[1]}.gif`] ? out({ on: 'CLIMAX_PLACED', filter: { kind: 'CLIMAX', hasTrigger: TRIGGER_ICONS[`${m[1]}.gif`]! } }, `我方 Trigger 圖示是 ${TRIGGER_ICONS[`${m[1]}.gif`]} 的 Climax 放到 Climax 置場時`) : null),
  ],
  [/^このカードが手札か思い出置場から舞台に置かれた時$/, () => out({ on: 'PLACED_ON_STAGE', from: 'HAND_OR_MEMORY' }, '這張卡由手牌或思い出放到舞台時')],
  [/^あなたのCX置場に「([^」]+)」が置かれた時$/, (m) => out({ on: 'CLIMAX_PLACED', filter: { name: m[1]! } }, `我方的 Climax 置場放置了「${m[1]}」時`)],
  [
    /^このカードが手札から舞台に置かれた時か【リバース】した時$/,
    () => out({ on: 'EITHER', of: [{ on: 'PLACED_ON_STAGE', from: 'HAND' }, { on: 'REVERSED' }] }, '這張卡由手牌放到舞台時，或這張卡被 Reverse 時'),
  ],
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
  [/^他のあなたのキャラがアタックした時$/, () => out({ on: 'OTHER_ATTACKS' }, '我方其他角色攻擊時')],
  [
    /^他のあなたの(.+?)が舞台から控え室に置かれた時$/,
    (m) => {
      const filter = parseFilter(m[1]!, 'STAGE');
      return filter && (!filter.data || filter.data.kind === 'CHARACTER') ? out({ on: 'OTHER_STAGE_TO_WAITING_ROOM', ...(filter.data ? { filter: filter.data } : {}) }, `我方其他${filter.zh}由舞台放到控え室時`) : null;
    },
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
  // ⑩: a stock cost written with a circled number (as (10)).
  if ((m = /^([①-⑳])$/.exec(text))) return out({ pay: 'STOCK', count: m[1]!.charCodeAt(0) - 0x245f }, `(${m[1]!.charCodeAt(0) - 0x245f})`);
  if (text === 'このカードを【レスト】する') return out({ pay: 'REST_SELF' }, '把這張卡 Rest');
  if (text === 'このカードを控え室に置く') return out({ pay: 'SELF_TO_WAITING_ROOM' }, '把這張卡放到控え室');
  if (text === '【スタンド】しているこのカードを控え室に置く') return out({ pay: 'SELF_TO_WAITING_ROOM', standing: true }, '把 Stand 中的這張卡放到控え室');
  if (text === '【スタンド】しているこのカードを【レスト】する') return out({ pay: 'REST_SELF' }, '把 Stand 中的這張卡 Rest');
  if (text === '【スタンド】しているこのカードを思い出にする') return out({ pay: 'SELF_TO_MEMORY', standing: true }, '把 Stand 中的這張卡放到思い出');
  if (text === 'このカードを手札に戻す') return out({ pay: 'SELF_TO_HAND' }, '把這張卡放回手牌');
  if ((m = /^あなたのCX置場の(「[^」]+」|(?:赤|青|黄|緑)のCX)を(\d+)枚控え室に置く$/.exec(text))) {
    const named = /^「([^」]+)」$/.exec(m[1]!);
    const colour = { 赤: 'red', 青: 'blue', 黄: 'yellow', 緑: 'green' }[m[1]!.slice(0, 1) as '赤'];
    const filter = named ? { name: named[1]! } : { kind: 'CLIMAX' as const, color: colour };
    return out({ pay: 'CLIMAX_TO_WAITING_ROOM', count: n(m[2]), filter }, `把我方 Climax 置場的${m[1]} ${m[2]} 張放到控え室`);
  }
  if ((m = /^このカードの下のマーカーを(\d+)枚控え室に置く$/.exec(text))) return out({ pay: 'MARKERS_TO_WAITING_ROOM', count: n(m[1]) }, `把這張卡下面的 Marker ${m[1]} 張放到控え室`);
  if ((m = /^このカードを表向きで他のあなたの「([^」]+)」のマーカーにする$/.exec(text))) return out({ pay: 'SELF_TO_MARKER', underName: m[1]! }, `把這張卡以表向放到我方其他「${m[1]}」下面作為 Marker`);
  if ((m = /^(他の)?あなたの舞台の(【スタンド】している)?(.+?)を(\d+)枚思い出にする$/.exec(text))) {
    const filter = parseFilter(m[3]!, 'STAGE');
    if (filter?.data && filter.data.kind === 'CHARACTER') {
      return out({ pay: 'CHARACTERS_TO_WAITING_ROOM', count: n(m[4]), filter: filter.data, toMemory: true, ...(m[1] ? { other: true } : {}), ...(m[2] ? { standing: true } : {}) }, `把我方舞台上${m[1] ? '其他 ' : ''}${m[4]} 張${m[2] ? ' Stand 中的' : ''}${filter.zh}放到思い出`);
    }
  }
  if (text === 'このカードを思い出にする') return out({ pay: 'SELF_TO_MEMORY' }, '把這張卡放到思い出');
  if (text === 'このカードをクロック置場に置く') return out({ pay: 'SELF_TO_CLOCK' }, '把這張卡放到 Clock');
  if (text === 'このカードを山札の下に置く') return out({ pay: 'SELF_TO_DECK_BOTTOM' }, '把這張卡放到山札底');
  if (text === '【スタンド】しているこのカードをクロック置場に置く') return out({ pay: 'SELF_TO_CLOCK', standing: true }, '把 Stand 中的這張卡放到 Clock');
  if (text === 'このカードをストック置場の下に置く') return out({ pay: 'SELF_TO_STOCK_BOTTOM' }, '把這張卡放到 Stock 最下面');
  if (text === '【スタンド】しているこのカードを山札の下に置く') return out({ pay: 'SELF_TO_DECK_BOTTOM', standing: true }, '把 Stand 中的這張卡放到山札底');
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
  if ((m = /^あなたのレベル置場の表向きのカードを(\d+)枚裏向きにする$/.exec(text))) return out({ pay: 'LEVEL_FACE_DOWN', count: n(m[1]) }, `把我方 Level 置場 ${m[1]} 張表向的卡翻成裏向`);
  if ((m = /^あなたの(.+?)を(\d+)枚【レスト】する$/.exec(text)) && !m[1]!.includes('【スタンド】')) {
    // Resting is only possible for a standing character, so this is the same cost as with 【スタンド】している.
    const filter = parseFilter(m[1]!, 'STAGE');
    if (filter) return out({ pay: 'REST_CHARACTERS', count: n(m[2]), ...(filter.data ? { filter: filter.data } : {}) }, `把我方 ${m[2]} 張${filter.zh} Rest`);
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
  // 記憶 (CR-10.9): the engine's MEMORY condition, as the hand-written cards use it.
  if ((m = /^あなたの思い出置場に「([^」]+)」がある$/.exec(text))) return out({ if: 'MEMORY', min: 1, filter: { name: m[1]! } }, `我方思い出有「${m[1]}」`);
  if (text === 'このカードの下にマーカーがある') return out({ if: 'MARKERS', of: 'SELF', min: 1 }, '這張卡下面有 Marker');
  if (text === 'このカードの下にマーカーがない') return out({ if: 'MARKERS', of: 'SELF', max: 0 }, '這張卡下面沒有 Marker');
  if ((m = /^このカードの下の異なるカード名のマーカーが(\d+)枚以上$/.exec(text))) return out({ if: 'MARKERS', of: 'SELF', min: n(m[1]), distinctNames: true }, `這張卡下面不同卡名的 Marker 有 ${m[1]} 張或以上`);
  if ((m = /^あなたの、?思い出とマーカー置場のカードの合計が(\d+)枚(以下|以上)$/.exec(text))) {
    return out({ if: 'COUNT', where: 'YOUR_MEMORY_AND_MARKERS', ...(m[2] === '以下' ? { max: n(m[1]) } : { min: n(m[1]) }) }, `我方思い出及 Marker 置場的卡合計 ${m[1]} 張${m[2] === '以下' ? '或以下' : '或以上'}`);
  }
  if (text === 'あなたの、思い出とマーカー置場にカードがない') return out({ if: 'COUNT', where: 'YOUR_MEMORY_AND_MARKERS', max: 0 }, '我方思い出及 Marker 置場沒有卡');
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
  if ((m = /^あなたのCX置場に(トリガーアイコンが(?:\[\[[a-z]+\.gif\]\])+のCX)がある$/.exec(text))) {
    const filter = parseFilter(m[1]!, 'ZONE');
    if (filter?.data) return out({ if: 'COUNT', where: 'YOUR_CLIMAX', filter: filter.data, min: 1 }, `我方 Climax 置場有${filter.zh}`);
  }
  if ((m = /^他のあなたの前列の、?「([^」]+)」と「([^」]+)」がいる$/.exec(text))) {
    return out({ if: 'ALL', of: [{ if: 'COUNT', where: 'YOUR_FRONT_ROW', other: true, filter: { name: m[1]! }, min: 1 }, { if: 'COUNT', where: 'YOUR_FRONT_ROW', other: true, filter: { name: m[2]! }, min: 1 }] }, `我方前列有其他的「${m[1]}」及「${m[2]}」`);
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
  if ((m = /^すべてのプレイヤーのレベルが(\d+)以上$/.exec(text))) return out({ if: 'ALL', of: [{ if: 'LEVEL', min: n(m[1]) }, { if: 'LEVEL', whose: 'OPPONENT', min: n(m[1]) }] }, `所有玩家 Level ${m[1]} 或以上`);
  if (text === '他のあなたの前列のキャラがいない') return out({ if: 'COUNT', where: 'YOUR_FRONT_ROW', other: true, max: 0 }, '我方前列沒有其他角色');
  if ((m = /^このカードの(ソウル|パワー)が(\d+)(以下|以上)$/.exec(text))) return out({ if: 'SELF_STAT', stat: m[1] === 'ソウル' ? 'SOUL' : 'POWER', ...(m[3] === '以下' ? { max: n(m[2]) } : { min: n(m[2]) }) }, `這張卡的 ${m[1] === 'ソウル' ? 'Soul' : 'Power'} ${m[2]} ${m[3] === '以下' ? '或以下' : '或以上'}`);
  if (text === '相手のCX置場にCXがある') return out({ if: 'CLIMAX_IN_PLAY', opponent: true }, '對手 Climax 置場有 Climax');
  if ((m = /^あなたのレベルが(\d+)以上$/.exec(text))) return out({ if: 'LEVEL', min: n(m[1]) }, `我方 Level ${m[1]} 或以上`);
  if ((m = /^相手のレベルが(\d+)(以上)?$/.exec(text))) return out({ if: 'LEVEL', whose: 'OPPONENT', min: n(m[1]), ...(m[2] ? {} : { max: n(m[1]) }) }, `對手 Level ${m[1]}${m[2] ? ' 或以上' : ''}`);
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
  if ((m = /^このカードの正面のキャラが(赤|青|黄|緑)$/.exec(text))) return out({ if: 'FACING', filter: { color: { 赤: 'red', 青: 'blue', 黄: 'yellow', 緑: 'green' }[m[1] as '赤'] } }, `這張卡正面的角色是${m[1]}色`);
  if ((m = /^先攻プレイヤーの第(\d+)ターン$/.exec(text))) return out({ if: 'FIRST_PLAYER_TURN', turn: n(m[1]) }, `先攻玩家的第 ${m[1]} 回合`);
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
/** …に好きな順番で置く: the same places, with the order chosen by the player. */
const ORDERED: Record<string, ['STOCK' | 'STOCK_BOTTOM', string]> = {
  ストック置場に好きな順番で置く: ['STOCK', '按自己喜歡的次序放到 Stock'],
  ストック置場の下に好きな順番で置く: ['STOCK_BOTTOM', '按自己喜歡的次序放到 Stock 最下面'],
};
const ORIENTATIONS: Record<string, ['STAND' | 'REST' | 'REVERSE', string]> = { '【スタンド】する': ['STAND', 'Stand'], '【レスト】する': ['REST', 'Rest'], '【リバース】する': ['REVERSE', 'Reverse'] };

/** What is done to a target: moved, turned, or its numbers changed for a while. */
function parseAction(text: string, target: Target, noun: string): Out<Effect[]> {
  if (DESTINATIONS[text]) return out([{ do: 'MOVE', target, to: DESTINATIONS[text]![0] }], `把${noun}${DESTINATIONS[text]![1]}`);
  if (text === '舞台のキャラのいない枠に置く' && target.who === 'CHOSEN') return out([{ do: 'PLACE_IN_EMPTY_SLOT', target }], `把${noun}放到其主人舞台上沒有角色的枠（自己選）`);
  if (ORDERED[text]) return out([{ do: 'MOVE', target, to: ORDERED[text]![0], inOrder: true }], `把${noun}${ORDERED[text]![1]}`);
  const either = /^(.+?す)か(.+)$/.exec(text);
  if (either && DESTINATIONS[either[1]!] && DESTINATIONS[either[2]!]) {
    return out([{ do: 'MOVE', target, to: DESTINATIONS[either[1]!]![0], orTo: DESTINATIONS[either[2]!]![0] }], `把${noun}${DESTINATIONS[either[1]!]![1]}或${DESTINATIONS[either[2]!]![1]}（自己選）`);
  }
  const under = /^このカードの下にマーカーとして(表|裏)向きに置く$/.exec(text);
  if (under && target.who === 'CHOSEN') return out([{ do: 'MOVE', target, to: 'UNDER_SELF', face: under[1] === '表' ? 'UP' : 'DOWN' }], `以${under[1]}向放到這張卡下面作為 Marker`);
  if (text === 'このカードがいた枠に置く' && target.who === 'CHOSEN') return out([{ do: 'MOVE', target, to: 'SOURCE_SLOT' }], '放到這張卡原本所在的枠');
  if (text === '舞台の好きな枠に【レスト】して置く' && target.who === 'CHOSEN') return out([{ do: 'CHOOSE_SLOT', which: 'ANY' }, { do: 'MOVE', target, to: 'CHOSEN_SLOT', rested: true }], '以 Rest 狀態放到我方舞台上自己選的枠');
  if (text === '舞台の好きな枠に置く' && target.who === 'CHOSEN') return out([{ do: 'CHOOSE_SLOT', which: 'ANY' }, { do: 'MOVE', target, to: 'CHOSEN_SLOT' }], `放到我方舞台上自己選的枠`);
  if (ORIENTATIONS[text]) return out([{ do: 'ORIENT', target, to: ORIENTATIONS[text]![0] }], `把${noun} ${ORIENTATIONS[text]![1]}`);
  if (text === '山札に戻し、その山札をシャッフルする') return out([{ do: 'MOVE', target, to: 'DECK' }, { do: 'SHUFFLE' }], `把${noun}放回山札，然後洗牌`);
  // (【レスト】し、)前列／後列のキャラのいない枠に動かす
  const toRow = /^(?:(【スタンド】|【レスト】)し、)?(前列|後列)のキャラのいない枠に動かす$/.exec(text);
  if (toRow) {
    const turn = toRow[1] ? ORIENTATIONS[`${toRow[1]}する`]! : null;
    return out(
      [...(turn ? [{ do: 'ORIENT' as const, target, to: turn[0] }] : []), { do: 'MOVE_TO_SLOT', target, row: toRow[2] === '前列' ? 'FRONT' : 'BACK' }],
      `${turn ? `把${noun} ${turn[1]}，並` : '把' + noun}移動到${toRow[2]}沒有角色的枠`,
    );
  }
  const timed = DURATION.exec(text);
  if (timed) {
    const until = timed[1] === 'そのターン中' ? {} : { until: 'NEXT_OPPONENT_TURN' as const };
    const lasts = timed[1] === 'そのターン中' ? '該回合' : '直到對手下一個回合結束為止，';
    // …し、『…』を与える / 『…』を与える: the target is given an automatic ability for that time.
    // …し、《特徴》を与える: the trait for that time.
    const trait = /^(?:(.+?)し、)?《([^》]+)》を与える$/.exec(timed[2]!);
    if (trait) {
      const before = trait[1] ? parseChanges(trait[1]) : [];
      if (!before) return null;
      return out(
        [...before.map((c) => ({ do: 'MODIFY' as const, target, stat: c.stat, amount: c.amount, ...until })), { do: 'GRANT', target, ability: { type: 'CONT', apply: [], giveTraits: { traits: [trait[2]!], to: 'SELF' } }, ...until }],
        `${lasts}${noun} ${before.map((c) => c.zh).join('、')}${before.length > 0 ? '，並' : ''}得到特徵《${trait[2]}》`,
      );
    }
    const gives = /^(?:(.+?)し、)?『(.+)』を与える$/.exec(timed[2]!);
    if (gives) {
      const before = gives[1] ? parseChanges(gives[1]) : [];
      const inner = readLine(gives[2]!);
      if (!before || !inner.line || inner.line.ability.type === 'ACT') return null;
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

/** leftOptional over sentences; "そうしたら、…" right after a shown card's "そのカードが…なら、…してよい" is read with it. */
function anyLeftOptional(sentences: readonly string[]): boolean {
  return sentences.some((s, k) => leftOptional(s) && !(s.startsWith('そうしたら、') && k > 0 && /^そのカード(?:が|の).+なら、.+てよい$/.test(sentences[k - 1]!)));
}

/** A sentence that is optional in a way only some readers handle: "そうしたら、…" or "…してよい", except after a card shown from the deck (そのカードが…なら、…してよい). */
function leftOptional(s: string): boolean {
  if (/^そのカード(?:が|の).+なら、/.test(s)) return false;
  if (s === 'あなたは自分の山札の上から1枚を公開してよい') return false;
  if (/^(?:あなたは)?次の(?:効果|行動)を行ってよい$/.test(s)) return false;
  if (/^(?:あなたは)?自分の山札の上から\d+枚までを、公開してよい$/.test(s)) return false;
  if (/^それらのカードに.+があるなら、/.test(s)) return false;
  return s.startsWith('そうしたら、') || plainForm(s) !== null;
}

/** Sentences split at 。 outside 『』. */
function splitOutsideQuotes(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '『') depth++;
    if (ch === '』') depth--;
    if (ch === '。' && depth === 0) {
      if (current.trim()) out.push(current.trim());
      current = '';
    } else current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** 『A』『B』 (nested 『』 allowed inside) as ['『A』', '『B』']; anything else as it is. */
function splitQuotes(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '『') {
      if (depth === 0 && i !== start) return [text];
      depth++;
    } else if (text[i] === '』') {
      depth--;
      if (depth < 0) return [text];
      if (depth === 0) {
        parts.push(text.slice(start, i + 1));
        start = i + 1;
      }
    }
  }
  return depth === 0 && start === text.length && parts.length > 0 ? parts : [text];
}

/** 「…してよい」 put back into its plain form; null when the sentence is not optional. */
function plainForm(sentence: string): string | null {
  const m = /^(.*?)(置いて|戻して|動かして|入れ替えて|して|引いて|加えて|行って)よい$/.exec(sentence);
  if (!m) return null;
  const verb = { 置いて: '置く', 戻して: '戻す', 動かして: '動かす', 入れ替えて: '入れ替える', して: 'する', 引いて: '引く', 加えて: '加える', 行って: '行う' }[m[2]!]!;
  return m[1]! + verb;
}

/** Set while reading an ability whose trigger names a character (他の…がフロントアタックされた時): "そのキャラ" is that character. */
let aboutThat = false;

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
  // そのキャラ: the battle opponent of this card, or the character the trigger named.
  if (battle && (m = /^そのキャラを(.+)$/.exec(text))) return parseAction(m[1]!, { who: 'BATTLE_OPPONENT' }, '那張角色');
  if (aboutThat && text === 'そのキャラをそのキャラがいた枠に【レスト】して置く') return out([{ do: 'MOVE', target: { who: 'THAT' }, to: 'ABOUT_SLOT', rested: true }], '把那張角色以 Rest 狀態放回它原本所在的枠');
  // そのアタックしているキャラ: the attacking character the trigger names.
  if (aboutThat && (m = /^そのターン中、そのアタックしているキャラの(.+)$/.exec(text))) return parseAction(`そのターン中、${m[1]}`, { who: 'THAT', as: 'ATTACKING' }, '那張攻擊中的角色');
  if (battle && (m = /^そのバトル相手を(.+)$/.exec(text))) return parseAction(m[1]!, { who: 'BATTLE_OPPONENT', said: 'BATTLE_OPPONENT' }, '戰鬥對手');
  if ((m = /^自分の控え室の「([^」]+)」を(\d+)枚選び、舞台の好きな枠に置き、そのターン中、そのキャラのレベルを＋(\d+)$/.exec(text))) {
    return out(
      [{ do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { name: m[1]! }, min: n(m[2]), max: n(m[2]) }, { do: 'CHOOSE_SLOT', which: 'ANY' }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'CHOSEN_SLOT' }, { do: 'MODIFY', target: { who: 'MOVED' }, stat: 'LEVEL', amount: n(m[3]) }],
      `從自己控え室選 ${m[2]} 張「${m[1]}」放到舞台上自己選的枠，該回合那張角色 Level +${m[3]}`,
    );
  }
  if ((m = /^自分の山札を上から(\d+)枚まで見て、カードを(\d+)枚まで選び、手札に加え、カードを(\d+)枚まで選び、ストック置場に置き、残りのカードを控え室に置く$/.exec(text))) {
    return out([{ do: 'LOOK_TOP', upTo: n(m[1]), ...(m[2] !== '1' ? { picks: n(m[2]) } : {}), toStock: n(m[3]) }], `查看自己山札頂最多 ${m[1]} 張，選最多 ${m[2]} 張加入手牌、最多 ${m[3]} 張放到 Stock，其餘放到控え室`);
  }
  if ((m = /^自分の山札を見て(.+?)を(\d+)枚まで選び、控え室に置き、その山札をシャッフルする$/.exec(text))) {
    const filter = parseFilter(m[1]!, 'ZONE');
    if (filter) return out([{ do: 'CHOOSE', from: 'YOUR_DECK', ...(filter.data ? { filter: filter.data } : {}), min: 0, max: n(m[2]) }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'WAITING_ROOM' }, { do: 'SHUFFLE' }], `查看自己整個山札，選最多 ${m[2]} 張${filter.zh}放到控え室，然後洗山札`);
  }
  if (aboutThat && (m = /^そのキャラを(.+)$/.exec(text))) return parseAction(m[1]!, { who: 'THAT' }, '那張角色');
  if (aboutThat && (m = /^そのターン中、そのキャラの(.+)$/.exec(text))) return parseAction(`そのターン中、${m[1]}`, { who: 'THAT' }, '那張角色');
  if (aboutThat && text === 'そのターン中、そのキャラは【リバース】しない') return out([{ do: 'GRANT', target: { who: 'THAT' }, ability: { type: 'CONT', apply: [], cannotBeReversed: true } }], '該回合那張角色不會被 Reverse');
  if (aboutThat && text === 'そのターン中、そのキャラは『【自】 アンコール』を使えない') return out([{ do: 'GRANT', target: { who: 'THAT' }, ability: { type: 'CONT', apply: [], noEncore: true } }], '該回合那張角色不能使用 Encore（包括規則的 Encore）');

  // Choosing cards, then one action on them.
  if ((m = new RegExp(`^(他の)?自分の(.+?)を${COUNT}選び、(.+)$`).exec(text)) && !/^(控え室|手札|クロック|山札|思い出|ストック)/.test(m[2]!)) {
    const filter = parseFilter(m[2]!, 'STAGE');
    const action = filter && parseAction(m[5]!, { who: 'CHOSEN' }, '');
    if (filter && action && (!filter.data || filter.data.kind === 'CHARACTER' || (filter.data.names && Object.keys(filter.data).length === 1))) {
      return out(
        [{ do: 'CHOOSE', from: 'YOUR_STAGE', ...(filter.data ? { filter: filter.data } : {}), ...(m[1] ? { other: true } : {}), ...range(m[3], m[4]) }, ...action.data],
        `選我方${m[1] ? '其他 ' : ''}${countZh(m[3], m[4])}${filter.zh}，${action.zh}`,
      );
    }
  }
  if ((m = new RegExp(`^自分の控え室のその手札に戻したキャラと同じカード名のキャラを${COUNT}選び、(.+)$`).exec(text))) {
    const action = parseAction(m[3]!, { who: 'CHOSEN' }, '');
    if (action) return out([{ do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { kind: 'CHARACTER' }, sameNameAsMoved: true, ...range(m[1], m[2]) }, ...action.data], `從自己的控え室選${countZh(m[1], m[2])}與剛才放回手牌的角色同名的角色，${action.zh}`);
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
  if ((m = new RegExp(`^自分のバトル中の(.+?)を${COUNT}選び、(.+)$`).exec(text)) && m[1] !== 'キャラ') {
    const filter = parseFilter(m[1]!, 'STAGE');
    const action = filter?.data && parseAction(m[4]!, { who: 'CHOSEN' }, '');
    if (filter?.data && action) return out([{ do: 'CHOOSE', from: 'YOUR_BATTLING', filter: filter.data, ...range(m[2], m[3]) }, ...action.data], `選我方戰鬥中的${countZh(m[2], m[3])}${filter.zh}，${action.zh}`);
  }
  if ((m = new RegExp(`^バトル中のキャラを${COUNT}選び、そのターン中、次の能力を与える。『【永】 このカードはプレイヤーにダメージを与えることができない。』$`).exec(text))) {
    return out([{ do: 'CHOOSE', from: 'BATTLING', ...range(m[1], m[2]) }, { do: 'GRANT', target: { who: 'CHOSEN' }, ability: { type: 'CONT', apply: [], noDamageToPlayers: true } }], `選戰鬥中的${countZh(m[1], m[2])}角色，該回合它不能對玩家造成傷害`);
  }
  if ((m = new RegExp(`^自分のバトル中のキャラを${COUNT}選び、(.+)$`).exec(text))) {
    const action = parseAction(m[3]!, { who: 'CHOSEN' }, '');
    if (action) return out([{ do: 'CHOOSE', from: 'YOUR_BATTLING', ...range(m[1], m[2]) }, ...action.data], `選我方戰鬥中的${countZh(m[1], m[2])}角色，${action.zh}`);
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
  if ((m = new RegExp(`^自分の(思い出置場|クロック置場)の(.+?)を${COUNT}選び、(.+)$`).exec(text))) {
    const filter = parseFilter(m[2]!, 'ZONE');
    const action = filter && parseAction(m[5]!, { who: 'CHOSEN' }, '');
    if (filter && action) {
      return out(
        [{ do: 'CHOOSE', from: m[1] === '思い出置場' ? 'YOUR_MEMORY' : 'YOUR_CLOCK', ...(filter.data ? { filter: filter.data } : {}), ...range(m[3], m[4]) }, ...action.data],
        `從自己的${m[1] === '思い出置場' ? '思い出' : ' Clock '}選${countZh(m[3], m[4])}${filter.zh}，${action.zh}`,
      );
    }
  }
  if (text === '[[standby.gif]]の効果を行う') return out([{ do: 'ICON_EFFECT', icon: 'STANDBY' }], '執行 Standby 圖示的效果');
  if (text === 'すべてのプレイヤーは自分の控え室のカードすべてを、山札に戻し、それらの山札をシャッフルする') {
    return out([{ do: 'WAITING_ROOM_TO_DECK', everyone: true }], '所有玩家把自己控え室的全部卡放回山札並洗牌');
  }
  if ((m = new RegExp(`^自分のクロックを${COUNT}選び、(.+)$`).exec(text))) {
    const action = parseAction(m[3]!, { who: 'CHOSEN' }, '');
    if (action) return out([{ do: 'CHOOSE', from: 'YOUR_CLOCK', ...range(m[1], m[2]) }, ...action.data], `選自己 Clock 的${countZh(m[1], m[2])}卡，${action.zh}`);
  }
  if ((m = new RegExp(`^相手のキャラを${COUNT}選び、思い出にし、(アンコールステップの始めに、)?相手は自分の思い出置場のそのキャラを、舞台の好きな枠に置く$`).exec(text))) {
    const back: Effect = { do: 'OWNER_PLACES', target: { who: 'MOVED', where: 'MEMORY' } };
    return out(
      [{ do: 'CHOOSE', from: 'OPPONENT_STAGE', ...range(m[1], m[2]) }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'MEMORY' }, m[3] ? { do: 'DELAYED', at: { step: 'ENCORE', whose: 'ANY' }, effects: [back] } : back],
      `選對手${countZh(m[1], m[2])}角色放到思い出，${m[3] ? '這回合的 Encore 步驟開始時，' : ''}對手把該角色從思い出放到自己舞台上自己選的枠`,
    );
  }
  if ((m = new RegExp(`^相手のキャラを2枚選び、それぞれを【スタンド】して入れ替える$`).exec(text))) {
    return out([{ do: 'CHOOSE', from: 'OPPONENT_STAGE', min: 2, max: 2 }, { do: 'SWAP_CHOSEN' }], '選對手 2 張角色，各自 Stand 後互換位置');
  }
  if ((m = new RegExp(`^自分の(.+?)を1枚とこのカードを選び、それぞれを【スタンド】して入れ替える$`).exec(text))) {
    const filter = parseFilter(m[1]!, 'STAGE');
    if (filter && (!filter.data || filter.data.kind === 'CHARACTER')) {
      return out([{ do: 'CHOOSE', from: 'YOUR_STAGE', other: true, ...(filter.data ? { filter: filter.data } : {}), min: 1, max: 1 }, { do: 'SWAP_CHOSEN', withSelf: true }], `選我方另外 1 張${filter.zh}和這張卡，各自 Stand 後互換位置`);
    }
  }
  if (text === '自分のレベル置場のカードと控え室のカードを1枚ずつ選び、入れ替える') return out([{ do: 'EXCHANGE_LEVEL_WAITING_ROOM', count: 1 }], '選自己 Level 置場和控え室各 1 張互換');
  if (text === '自分の山札を見てCXを1枚まで選んで公開し、自分の手札のCXを1枚まで選んで公開し、それらのCXを入れ替え、その山札をシャッフルする') {
    return out([{ do: 'SWAP_DECK_HAND', filter: { kind: 'CLIMAX' } }, { do: 'SHUFFLE' }], '從山札選最多 1 張 Climax 公開、從手牌選最多 1 張 Climax 公開，兩張都有的話互換，然後洗山札');
  }
  // そのキャラ in a zone: the card the last move put there.
  if ((m = /^自分の思い出置場のそのキャラを、(.+)$/.exec(text))) return parseAction(m[1]!, { who: 'MOVED', where: 'MEMORY' }, '那張角色');
  if ((m = /^自分の思い出置場の「([^」]+)」を(\d+)枚選び、このカードがいた枠に置き、次の相手のターンの終わりまで、そのキャラのパワーを＋(\d+)$/.exec(text))) {
    return out(
      [{ do: 'CHOOSE', from: 'YOUR_MEMORY', filter: { name: m[1]! }, min: n(m[2]), max: n(m[2]) }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'SOURCE_SLOT' }, { do: 'MODIFY', target: { who: 'MOVED' }, stat: 'POWER', amount: n(m[3]), until: 'NEXT_OPPONENT_TURN' }],
      `從自己思い出選 ${m[2]} 張「${m[1]}」放到這張卡原本所在的枠，直到對手下一個回合結束為止，該角色 Power +${m[3]}`,
    );
  }
  if ((m = /^相手の山札の下から(\d+)枚を、控え室に置く$/.exec(text))) return out([{ do: 'DECK_TOP', count: n(m[1]), to: 'WAITING_ROOM', whose: 'OPPONENT', fromBottom: true }], `把對手山札最下面 ${m[1]} 張放到控え室`);
  if (aboutThat && text === 'そのキャラをそのキャラがいた枠に【レスト】して置く') return out([{ do: 'MOVE', target: { who: 'THAT' }, to: 'ABOUT_SLOT', rested: true }], '把那張角色以 Rest 狀態放回它原本所在的枠');
  if (text === 'この効果で舞台に置かれたキャラを控え室に置く') return out([{ do: 'MOVE', target: { who: 'PLACED' }, to: 'WAITING_ROOM' }], '把這個效果放到舞台的角色放到控え室');
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
  // 1枚まで引く is an optional draw of one, as the hand-written cards have it; more cards are drawn one at a time.
  if ((m = /^(\d+)枚まで引く$/.exec(text))) return m[1] === '1' ? out([{ do: 'DRAW', count: 1, optional: true }], '可以抽 1 張') : out([{ do: 'DRAW', count: n(m[1]), upTo: true }], `最多抽 ${m[1]} 張（每張之前可以停止）`);
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
  if ((m = /^自分の山札を見て(.+?)を(\d+)枚まで選び、公開し、(\d+)枚手札に加え、残りのカードを(ストック置場の下|控え室)に置き、その山札をシャッフルする$/.exec(text))) {
    const filter = parseFilter(m[1]!, 'ZONE');
    if (filter) {
      return out(
        [{ do: 'CHOOSE', from: 'YOUR_DECK', ...(filter.data ? { filter: filter.data } : {}), min: 0, max: n(m[2]) }, { do: 'SPLIT_CHOSEN', take: n(m[3]), exact: true, to: 'HAND', rest: m[4] === '控え室' ? 'WAITING_ROOM' : 'STOCK_BOTTOM', reveal: true }, { do: 'SHUFFLE' }],
        `查看自己整個山札，選最多 ${m[2]} 張${filter.zh}公開，其中 ${m[3]} 張加入手牌，其餘放到${m[4] === '控え室' ? '控え室' : ' Stock 最下面'}，然後洗山札`,
      );
    }
  }
  if ((m = /^自分の控え室の(.+?)を(\d+)枚まで選び、(\d+)枚まで(ストック置場)に好きな順番で置き、残りのカードを(思い出にする|控え室に置く)$/.exec(text))) {
    const filter = parseFilter(m[1]!, 'ZONE');
    if (filter) {
      return out(
        [{ do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', ...(filter.data ? { filter: filter.data } : {}), min: 0, max: n(m[2]) }, { do: 'SPLIT_CHOSEN', take: n(m[3]), to: 'STOCK', inOrder: true, rest: m[5] === '思い出にする' ? 'MEMORY' : 'WAITING_ROOM' }],
        `從自己控え室選最多 ${m[2]} 張${filter.zh}，其中最多 ${m[3]} 張按自己喜歡的次序放到 Stock，其餘${m[5] === '思い出にする' ? '放到思い出' : '放到控え室'}`,
      );
    }
  }
  if (text === 'その山札をシャッフルする') return out([{ do: 'SHUFFLE' }], '洗山札');
  if ((m = /^自分の思い出置場の「([^」]+)」すべてをこのカードの下にマーカーとして好きな順番で表向きに置き、(.+)$/.exec(text))) {
    const rest = parseEffects([m[2]!], battle);
    if (rest) return out([{ do: 'CHOOSE', from: 'YOUR_MEMORY', filter: { name: m[1]! }, min: 0, max: 99, all: true }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'UNDER_SELF', face: 'UP', inOrder: true }, ...rest.data], `把自己思い出中所有「${m[1]}」按喜歡的次序以表向放到這張卡下面作為 Marker，然後${rest.zh}`);
  }
  if ((m = /^そのアタック中、このカードが相手にアタックのダメージを与える時、かわりに(.+)$/.exec(text))) {
    const instead = parseEffects([m[1]!], battle);
    if (instead) return out([{ do: 'REPLACE_ATTACK_DAMAGE', effects: instead.data }], `這次攻擊中，這張卡對對手造成攻擊傷害時，改為${instead.zh}（置換效果）`);
  }
  if ((m = /^相手の山札の上から(\d+)枚を、控え室に置く$/.exec(text))) return out([{ do: 'DECK_TOP', count: n(m[1]), to: 'WAITING_ROOM', whose: 'OPPONENT', actor: 'YOU' }], `把對手山札頂 ${m[1]} 張放到控え室`);
  if (text === '追加の1ターンを得る') return out([{ do: 'EXTRA_TURN' }], '得到額外 1 個回合');
  if ((m = /^(\S+)を発動する$/.exec(text)) && !text.startsWith('『')) return out([{ do: 'REPLAY', name: m[1]! }], `發動「${m[1]}」（這張卡的 Replay）`);
  if ((m = new RegExp(`^自分のレベル置場のカードを${COUNT}選び、(.+)$`).exec(text))) {
    const action = parseAction(m[3]!, { who: 'CHOSEN' }, '');
    if (action) return out([{ do: 'CHOOSE', from: 'YOUR_LEVEL', ...range(m[1], m[2]) }, ...action.data], `選自己 Level 置場 ${countZh(m[1], m[2])}卡，${action.zh}`);
  }
  if ((m = /^自分の山札の上から(\d+)枚をクロック置場に置く$/.exec(text))) return out([{ do: 'DECK_TOP', count: n(m[1]), to: 'CLOCK' }], `把自己山札頂 ${m[1]} 張放到 Clock`);
  if (text === '自分のクロックの下から1枚を、ストック置場に置く') return out([{ do: 'CLOCK_TOP', to: 'STOCK', fromBottom: true }], '把自己 Clock 最下面 1 張放到 Stock');
  if ((m = /^自分のクロックの上から(\d+)枚までを、控え室に置く$/.exec(text)) && m[1] !== '1') return out([{ do: 'CLOCK_TOP', to: 'WAITING_ROOM', count: n(m[1]), optional: true }], `把自己 Clock 最上面最多 ${m[1]} 張逐張放到控え室`);
  if (text === 'すべてのプレイヤーは自分のクロックすべてを、控え室に置く') return out([{ do: 'CLOCK_ALL_TO_WAITING_ROOM', everyone: true }], '所有玩家把自己的 Clock 全部放到控え室');
  // 山札の上からN枚を公開し、その山札をシャッフルし、…: the cards are shown where they are, then the deck is shuffled.
  if ((m = /^相手は自分の山札の上から(\d+)枚を公開し、その山札をシャッフルし、自分の山札の上から(\d+)枚を、クロック置場に置く$/.exec(text))) {
    return out([{ do: 'REVEAL_DECK_TOP', count: n(m[1]), whose: 'OPPONENT' }, { do: 'SHUFFLE', whose: 'OPPONENT' }, { do: 'DECK_TOP', count: n(m[2]), to: 'CLOCK', whose: 'OPPONENT' }], `對手公開自己山札頂 ${m[1]} 張後洗牌，再把山札頂 ${m[2]} 張放到 Clock`);
  }
  if ((m = /^自分の山札の上から(\d+)枚を公開し、その山札をシャッフルし、(.+)$/.exec(text))) {
    const rest = parseEffects([m[2]!], battle);
    if (rest) return out([{ do: 'REVEAL_DECK_TOP', count: n(m[1]) }, { do: 'SHUFFLE' }, ...rest.data], `公開自己山札頂 ${m[1]} 張後洗牌，${rest.zh}`);
  }
  if ((m = /^相手の控え室のカードを(\d+)枚まで選び、山札に戻し、相手はその山札をシャッフルし、(.+)$/.exec(text))) {
    const rest = parseEffects([m[2]!], battle);
    if (rest) return out([{ do: 'CHOOSE', from: 'OPPONENT_WAITING_ROOM', min: 0, max: n(m[1]) }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'DECK' }, { do: 'SHUFFLE', whose: 'OPPONENT' }, ...rest.data], `從對手控え室選最多 ${m[1]} 張放回山札，對手洗牌，${rest.zh}`);
  }
  if ((m = /^自分の控え室の(.+?)を(\d+)枚まで選び、(\d+)枚手札に戻し、残りのカードを(ストック置場の下|ストック置場|控え室)に置く$/.exec(text))) {
    const filter = parseFilter(m[1]!, 'ZONE');
    if (filter) return out([{ do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', ...(filter.data ? { filter: filter.data } : {}), min: 0, max: n(m[2]) }, { do: 'SPLIT_CHOSEN', take: n(m[3]), exact: true, to: 'HAND', rest: m[4] === 'ストック置場の下' ? 'STOCK_BOTTOM' : m[4] === 'ストック置場' ? 'STOCK' : 'WAITING_ROOM' }], `從自己控え室選最多 ${m[2]} 張${filter.zh}，其中 ${m[3]} 張加入手牌，其餘放到${m[4]}`);
  }
  if ((m = /^自分の山札を見て(.+?)を(\d+)枚まで選んで相手に見せ、手札に加え、その山札をシャッフルする$/.exec(text))) {
    const filter = parseFilter(m[1]!, 'ZONE');
    if (filter) {
      return out(
        [{ do: 'CHOOSE', from: 'YOUR_DECK', ...(filter.data ? { filter: filter.data } : {}), min: 0, max: n(m[2]) }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND', reveal: true }, { do: 'SHUFFLE' }],
        `查看自己整個山札，選最多 ${m[2]} 張${filter.zh}，給對手看後加入手牌，然後洗山札`,
      );
    }
  }
  if ((m = /^自分の山札を上から(\d+)枚まで見て、(.+?)を(\d+)枚まで選んで相手に見せ、手札に加え、残りのカードを控え室に置く$/.exec(text))) {
    const filter = parseFilter(m[2]!, 'ZONE');
    if (filter?.data) return out([{ do: 'LOOK_TOP', upTo: n(m[1]), pick: filter.data, reveal: true, ...(m[3] !== '1' ? { picks: n(m[3]) } : {}) }], `查看自己山札頂最多 ${m[1]} 張，選最多 1 張${filter.zh}，給對手看後加入手牌，其餘放到控え室`);
  }
  if ((m = /^自分の山札を上から(\d+)枚まで見て、カードを1枚まで選び、手札に加え、残りのカードを控え室に置く$/.exec(text))) {
    return out([{ do: 'LOOK_TOP', upTo: n(m[1]) }], `查看自己山札頂最多 ${m[1]} 張，選最多 1 張加入手牌，其餘放到控え室`);
  }
  // Looking at the top of a deck and putting cards back in any order.
  if ((m = /^自分の山札を上から(\d+)枚まで見て、カードを1枚選び、山札の上に置き、残りのカードを控え室に置く$/.exec(text))) {
    return out([{ do: 'REORDER_TOP', upTo: n(m[1]), keep: 1, keepExact: true }], `查看自己山札頂最多 ${m[1]} 張，選 1 張放回山札頂，其餘放到控え室`);
  }
  if ((m = /^相手のストックの下から(\d+)枚を、控え室に置く$/.exec(text))) return out([{ do: 'STOCK_BOTTOM_TO_WAITING_ROOM', count: n(m[1]), whose: 'OPPONENT' }], `把對手 Stock 最下面 ${m[1]} 張放到控え室`);
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
  if ((m = /^このカードの下のマーカーを(\d+)枚(手札に戻す|ストック置場に置く|控え室に置く)$/.exec(text))) {
    const to = m[2] === '手札に戻す' ? 'HAND' : m[2] === 'ストック置場に置く' ? 'STOCK' : 'WAITING_ROOM';
    return out([{ do: 'MARKERS_TOP', count: n(m[1]), to }], `把這張卡下面最上面的 Marker ${m[1]} 張${to === 'HAND' ? '加入手牌' : to === 'STOCK' ? '放到 Stock' : '放到控え室'}`);
  }
  if (text === '自分の山札を上から1枚見て、山札の上か下か控え室に置く') return out([{ do: 'TOP_OR_BOTTOM', anyOfThree: true }], '查看自己山札頂 1 張，放回山札頂、放到山札底或放到控え室');
  if ((m = /^自分の山札の上から(\d+)枚までを、(ストック置場|控え室|クロック置場)に置く$/.exec(text))) return out([{ do: 'DECK_TOP', count: n(m[1]), to: m[2] === 'ストック置場' ? 'STOCK' : m[2] === '控え室' ? 'WAITING_ROOM' : 'CLOCK', upTo: true }], `把自己山札頂最多 ${m[1]} 張逐張放到${m[2]}（每張之前可以停止）`);
  if (text === '相手の山札を上から1枚見て、山札の上か控え室に置く') return out([{ do: 'TOP_OR_BOTTOM', orWaitingRoom: true, whose: 'OPPONENT' }], '查看對手山札頂 1 張，放回山札頂或放到控え室');
  if ((m = /^(\d+)枚まで引き、自分の手札を同じ枚数選び、控え室に置く$/.exec(text))) return out([{ do: 'DRAW', count: n(m[1]), upTo: true }, { do: 'CHOOSE', from: 'YOUR_HAND', min: 0, max: 0, exactX: true }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'WAITING_ROOM' }], `最多抽 ${m[1]} 張，再選同樣張數的手牌放到控え室`);
  if ((m = /^自分のストックの下から(\d+)枚までを、手札に戻し、自分の手札を同じ枚数選び、ストック置場の下に好きな順番で置く$/.exec(text))) return out([{ do: 'STOCK_BOTTOM_TO_HAND', count: n(m[1]) }, { do: 'CHOOSE', from: 'YOUR_HAND', min: 0, max: 0, exactX: true }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'STOCK_BOTTOM', inOrder: true }], `把自己 Stock 最下面最多 ${m[1]} 張加入手牌，再選同樣張數的手牌按次序放到 Stock 最下面`);
  if ((m = /^自分の控え室の(.+?)と思い出置場の(.+?)を(\d+)枚ずつ選び、入れ替える$/.exec(text))) {
    const [a, b] = [parseFilter(m[1]!, 'ZONE'), parseFilter(m[2]!, 'ZONE')];
    if (a && b) return out([{ do: 'EXCHANGE_ZONES', a: { zone: 'WAITING_ROOM', ...(a.data ? { filter: a.data } : {}) }, b: { zone: 'MEMORY', ...(b.data ? { filter: b.data } : {}) }, count: n(m[3]) }], `選自己控え室的${a.zh}和思い出的${b.zh}各 ${m[3]} 張互換`);
  }
  if ((m = /^自分の控え室の(.+?)を(\d+)枚とこのカードを選び、入れ替える$/.exec(text))) {
    const a = parseFilter(m[1]!, 'ZONE');
    if (a) return out([{ do: 'EXCHANGE_ZONES', a: { zone: 'WAITING_ROOM', ...(a.data ? { filter: a.data } : {}) }, b: 'SELF', count: n(m[2]) }], `選自己控え室的 ${m[2]} 張${a.zh}和（思い出中的）這張卡互換`);
  }
  if ((m = new RegExp(`^バトル中のキャラを${COUNT}選び、(.+)$`).exec(text))) {
    const action = parseAction(m[3]!, { who: 'CHOSEN' }, '');
    if (action) return out([{ do: 'CHOOSE', from: 'BATTLING', ...range(m[1], m[2]) }, ...action.data], `選戰鬥中的${countZh(m[1], m[2])}角色，${action.zh}`);
  }
  if (text === '自分の山札を上から1枚見て、山札の上か控え室に置く') return out([{ do: 'TOP_OR_BOTTOM', orWaitingRoom: true }], '查看自己山札頂 1 張，放回山札頂或放到控え室');
  if ((m = /^相手は自分の山札の上から(\d+)枚を、控え室に置く$/.exec(text))) return out([{ do: 'DECK_TOP', count: n(m[1]), to: 'WAITING_ROOM', whose: 'OPPONENT' }], `對手把自己山札頂 ${m[1]} 張放到控え室`);
  if ((m = /^相手に(\d+)ダメージを(\d+)回与える$/.exec(text))) return out([{ do: 'REPEAT', times: n(m[2]), effects: [{ do: 'DAMAGE', amount: n(m[1]) }] }], `給予對手 ${m[1]} 點傷害 ${m[2]} 次（每次分開處理）`);
  if (text === '自分の山札を上から1枚見て、山札の上か下に置く') return out([{ do: 'TOP_OR_BOTTOM' }], '查看自己山札頂 1 張，放回山札頂或放到山札底');
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
  // "1枚まで引くか相手のキャラを1枚まで選び、手札に戻す": the same without the comma.
  const joinedOr = /^(\d+枚まで引く)か(相手の.+)$/.exec(text);
  if (joinedOr) {
    const a = parseSentence(joinedOr[1]!, battle);
    const b = parseSentence(joinedOr[2]!, battle);
    if (a && b) return out([{ do: 'CHOOSE_ONE', options: [a.data, b.data], said: 'OR_JOINED' }], `${a.zh}，或${b.zh}（自己選）`);
  }
  // "Aするか、B": one of two effects, chosen by the player.
  for (let i = text.indexOf('か、'); i > 0; i = text.indexOf('か、', i + 1)) {
    if (!/[るすく]$/.test(text.slice(0, i))) continue;
    const a = parseSentence(text.slice(0, i), battle);
    const b = parseSentence(text.slice(i + 2), battle);
    if (a && b) return out([{ do: 'CHOOSE_ONE', options: [a.data, b.data], said: 'OR' }], `${a.zh}，或${b.zh}（自己選）`);
  }
  // "AしB": two effects in one sentence, done in order. Tried last, so a known whole sentence is never split.
  for (const join of ['置き、', '戻し、', '引き、']) {
    for (let i = text.indexOf(join); i > 0; i = text.indexOf(join, i + 1)) {
      const a = parseSentence(`${text.slice(0, i)}${join === '置き、' ? '置く' : join === '戻し、' ? '戻す' : '引く'}`, battle);
      const b = a && parseSentence(text.slice(i + join.length), battle);
      if (a && b) return out([...a.data, ...b.data], `${a.zh}，然後${b.zh}`);
    }
  }
  return null;
}

/** One quoted effect of a choice: plain effect sentences, or "［cost］ あなたはコストを払ってよい。そうしたら、…". */
function parseQuotedEffect(inner: string, battle: boolean): Out<Effect[]> {
  // ［cost］ (…なら、)あなたはコストを払ってよい。そうしたら、…
  const paid = /^［([^］]*)］ ?(?:([^。]+?)なら、)?あなたはコストを払ってよい。そうしたら、(.+)$/s.exec(inner);
  const sentences = splitOutsideQuotes(paid ? paid[3]! : inner);
  // One "…してよい" sentence alone: the effects that can be declined by themselves.
  if (!paid && sentences.length === 1 && plainForm(sentences[0]!) !== null) {
    const plain = parseEffects([plainForm(sentences[0]!)!], battle);
    const only = plain?.data.length === 1 ? plain.data[0] : undefined;
    if (only?.do === 'CLOCK_TOP' && !only.optional) return out([{ ...only, optional: true }], `可以${plain!.zh}`);
    if (only?.do === 'DRAW' && !only.optional) return out([{ ...only, optional: true }], `可以${plain!.zh}`);
    return plain ? out([{ do: 'MAY', effects: plain.data }], `可以${plain.zh}`) : null;
  }
  if (anyLeftOptional(sentences)) return null;
  const effects = parseEffects(sentences, battle);
  if (!effects || !paid) return effects;
  const cost = parseCost(splitCost(paid[1]!));
  const when = paid[2] ? parseCondition(paid[2]) : null;
  if (!cost || (paid[2] && !when?.data)) return null;
  const pay: Effect = { do: 'MAY_PAY', cost: cost.data, then: effects.data };
  return out(when ? [{ do: 'IF', condition: when.data!, then: [pay] }] : [pay], `${when ? `如果${when.zh}，` : ''}可以支付 [${cost.zh}]，支付後${effects.zh}`);
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
/** "A置き、B" / "A戻し、B" / "Aシャッフルし、B": the first split point where both parts are known effects. */
function splitJoined(sentence: string, battle: boolean): Out<Effect[]> {
  const joints: [RegExp, string][] = [
    [/置き、/g, '置く'],
    [/与え、/g, '与える'],
    [/思い出にし、/g, '思い出にする'],
    [/戻し、/g, '戻す'],
    [/シャッフルし、/g, 'シャッフルする'],
  ];
  for (const [joint, plain] of joints) {
    for (const m of sentence.matchAll(joint)) {
      const first = `${sentence.slice(0, m.index)}${plain}`;
      const second = sentence.slice(m.index! + m[0].length);
      // The second part must stand alone: its own subject, not "それら"/"その…" pointing back.
      if (!/^(?:あなたは)?(?:自分の|相手の|相手に|その山札|このカード|そのターン中、このカード)/.test(second) || /^その(?!山札|ターン中、このカード)/.test(second)) continue;
      const a = parseEffects([first], battle);
      const b = a && parseEffects([second], battle);
      if (a && b) return out([...a.data, ...b.data], `${a.zh}，然後${b.zh}`);
    }
  }
  return null;
}

const X_MARK = 7777;

/** "Ｘは…に等しい": the counts X can be (SET_X). */
function readXCount(sentence: string): { set: Extract<Effect, { do: 'SET_X' }>; zh: string } | null {
  let m: RegExpExecArray | null;
  if ((m = /^Ｘはこのカードの下のマーカーの枚数が(\d+)枚以下なら(\d+)、(\d+)枚か(\d+)枚なら(\d+)、(\d+)枚以上なら(\d+)に等しい$/.exec(sentence))) {
    return { set: { do: 'SET_X', count: { of: 'MARKERS' }, tiers: [{ max: n(m[1]), x: n(m[2]) }, { min: n(m[3]), max: n(m[4]), x: n(m[5]) }, { min: n(m[6]), x: n(m[7]) }] }, zh: `Ｘ＝這張卡下面 Marker ${m[1]} 張或以下時 ${m[2]}、${m[3]} 或 ${m[4]} 張時 ${m[5]}、${m[6]} 張或以上時 ${m[7]}` };
  }
  if ((m = /^Ｘはあなたが選んだキャラのレベル－(\d+)に等しい$/.exec(sentence))) return { set: { do: 'SET_X', count: { of: 'CHOSEN_LEVEL' }, minus: n(m[1]) }, zh: `Ｘ＝你選的角色的 Level －${m[1]}` };
  if (sentence === 'Ｘはこのカードのソウルに等しい') return { set: { do: 'SET_X', count: { of: 'SELF_SOUL' } }, zh: 'Ｘ＝這張卡的 Soul' };
  if (sentence === 'ＸはそれらのカードのCXの枚数に等しい') return { set: { do: 'SET_X', count: { of: 'MOVED', filter: { kind: 'CLIMAX' } } }, zh: 'Ｘ＝這些卡中 Climax 的張數' };
  if ((m = /^Ｘは相手の控え室のCXの枚数－(\d+)に等しい$/.exec(sentence))) return { set: { do: 'SET_X', count: { of: 'OPPONENT_WAITING_ROOM', filter: { kind: 'CLIMAX' } }, minus: n(m[1]) }, zh: `Ｘ＝對手控え室 Climax 張數 －${m[1]}` };
  if ((m = /^Ｘはこのカードの下の異なるカード名のマーカーの枚数＋(\d+)に等しい$/.exec(sentence))) return { set: { do: 'SET_X', count: { of: 'MARKERS', distinctNames: true }, plus: n(m[1]) }, zh: `Ｘ＝這張卡下面不同卡名 Marker 的數目 +${m[1]}` };
  if ((m = /^Ｘはこのカードの下の異なるカード名のマーカーが(\d+)枚以下なら(\d+)、(\d+)枚以上なら(\d+)に等しい$/.exec(sentence))) {
    return { set: { do: 'SET_X', count: { of: 'MARKERS', distinctNames: true }, tiers: [{ max: n(m[1]), x: n(m[2]) }, { min: n(m[3]), x: n(m[4]) }] }, zh: `Ｘ＝這張卡下面不同卡名的 Marker ${m[1]} 張或以下時 ${m[2]}、${m[3]} 張或以上時 ${m[4]}` };
  }
  if ((m = /^Ｘはあなたの思い出置場の、「([^」]+)」と「([^」]+)」の枚数に等しい$/.exec(sentence))) return { set: { do: 'SET_X', count: { of: 'YOUR_MEMORY', filter: { names: [m[1]!, m[2]!] } } }, zh: `Ｘ＝我方思い出中「${m[1]}」及「${m[2]}」的張數` };
  return null;
}

/** The X placeholder turned into X of this resolution, with the count set just before its first use; null when it stands somewhere X cannot. */
function markX(effects: Effect[], set?: Extract<Effect, { do: 'SET_X' }>): Effect[] | null {
  void set;
  let ok = true;
  const walk = (list: Effect[]): Effect[] =>
    list.map((e) => {
      if (e.do === 'DAMAGE' && e.amount === X_MARK) return { ...e, amount: 1, amountX: true };
      if (e.do === 'REPEAT') return e.times === X_MARK ? { ...e, times: 1, timesX: true, effects: walk(e.effects) } : { ...e, effects: walk(e.effects) };
      if (e.do === 'DECK_TOP' && e.count === X_MARK) return { ...e, count: 1, countX: true };
      if (e.do === 'CHOOSE' && e.max === X_MARK) return { ...e, max: 1, maxX: true };
      if (e.do === 'REORDER_TOP' && e.upTo === X_MARK && e.keep === X_MARK) return { ...e, upTo: 1, keep: 1, x: true };
      if (e.do === 'IF') return { ...e, then: walk(e.then) };
      if (e.do === 'REPLACE_ATTACK_DAMAGE') return { ...e, effects: walk(e.effects) };
      if (e.do === 'OPPONENT_SWAPS_FROM_WAITING_ROOM' && e.filter?.levelMax === X_MARK) {
        const { levelMax: _drop, ...rest } = e.filter;
        void _drop;
        return { ...e, filter: rest, levelMaxX: true };
      }
      if (JSON.stringify(e).includes(String(X_MARK))) ok = false;
      return e;
    });
  const out = walk(effects);
  return ok ? out : null;
}

function parseEffects(all: string[], battle: boolean): Out<Effect[]> {
  const effects: Effect[] = [];
  const zh: string[] = [];
  // "Ｘは…に等しい": where X comes from, said after the sentence that uses it.
  // "Ｘは相手のキャラの枚数×Nに等しい": N per character of the opponent, counted when the effect resolves.
  const opponentDef = all.map((s) => /^Ｘは相手のキャラの枚数×(\d+)に等しい$/.exec(s)).find((m) => m);
  if (opponentDef) {
    const rest = all.filter((s) => s !== opponentDef[0]);
    if (rest.filter((s) => s.includes('＋Ｘ')).length !== 1) return null;
    const plain = parseEffects(rest.map((s) => s.replace('＋Ｘ', `＋${opponentDef[1]}`)), battle);
    const modifies = plain?.data.filter((e) => e.do === 'MODIFY') ?? [];
    if (!plain || modifies.length !== 1) return null;
    return out(
      plain.data.map((e) => (e.do === 'MODIFY' ? { ...e, perCount: { where: 'OPPONENT_STAGE' as const } } : e)),
      `${plain.zh}（數值改為：對手每有 1 張角色 ${opponentDef[1]}）`,
    );
  }
  // "上からＸ枚まで見て…。Ｘはあなたの…の枚数に等しい": as many cards as characters of yours that match.
  const lookDef = all.length === 2 ? /^Ｘは(他の)?あなたの(.+?)の枚数に等しい$/.exec(all[1]!) : null;
  if (lookDef && /上からＸ枚まで見て/.test(all[0]!)) {
    const filter = parseFilter(lookDef[2]!, 'STAGE');
    const plain = parseEffects([all[0]!.replace('上からＸ枚まで見て', '上から1枚まで見て')], battle);
    const look = plain?.data.length === 1 && plain.data[0]!.do === 'LOOK_TOP' && plain.data[0]!.upTo === 1 ? plain.data[0]! : null;
    if (!filter || (filter.data && filter.data.kind !== 'CHARACTER') || !look) return null;
    const per = { ...(filter.data ? { filter: filter.data } : {}), ...(lookDef[1] ? { other: true } : {}) };
    return out([{ ...look, per }], `${plain!.zh}（張數改為：我方${lookDef[1] ? '其他' : ''}${filter.zh}的張數）`);
  }
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
  // "…Ｘ…。Ｘは…に等しい" (a count): read with X as a placeholder, then the placeholder becomes X of this resolution.
  const xCount = all.length >= 2 ? readXCount(all[all.length - 1]!) : null;
  if (xCount) {
    const uses = all.slice(0, -1);
    const plain = parseEffects(uses.map((s) => s.replace(/Ｘ/g, String(X_MARK))), battle);
    if (!plain) return null;
    const walked = markX(plain.data);
    if (!walked) return null;
    const usesX = (e: Effect): boolean => /"(amountX|timesX|countX|maxX|x|levelMaxX)":true/.test(JSON.stringify(e));
    const first = walked.findIndex(usesX);
    if (first < 0) return null;
    // A replacement works out X when it replaces (the soul then), so the count goes inside it.
    const firstUse = walked[first]!;
    const marked = firstUse.do === 'REPLACE_ATTACK_DAMAGE' ? [...walked.slice(0, first), { ...firstUse, effects: [xCount.set, ...firstUse.effects] }, ...walked.slice(first + 1)] : [...walked.slice(0, first), xCount.set, ...walked.slice(first)];
    return out(marked, `${plain.zh.replaceAll(String(X_MARK), 'Ｘ')}（${xCount.zh}）`.replace(/^/, '').replace(/$/, ''));
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
  // "…置き、次の行動を(N回)行う。『…』": the first action, then the repeated one.
  for (let k = 0; k < sentences.length; k++) {
    const joined = /^(.+置)き、(次の行動を(?:\d+回)?行う)$/.exec(sentences[k]!);
    if (joined) sentences.splice(k, 1, `${joined[1]}く`, joined[2]!);
  }
  for (let i = 0; i < sentences.length; i++) {
    const brainstorm = /^あなたは自分の山札の上から(\d+)枚をめくり、控え室に置く$/.exec(sentences[i]!);
    const each = brainstorm && /^それらのカードの(CX|トリガーアイコンが(?:\[\[[a-z]+\.gif\]\])+のCX)1枚につき、(.+)$/.exec(sentences[i + 1] ?? '');
    if (brainstorm && each) {
      const per = parseFilter(each[1]!, 'ZONE');
      // "次の行動を行う。『…』": the action is the next, quoted sentence.
      const quotedAction = each[2] === '次の行動を行う' ? /^『(.+?)。?』$/.exec(sentences[i + 2] ?? '') : null;
      const plain = quotedAction ? null : plainForm(each[2]!);
      // Two actions in one sentence (…置き、…): read as two sentences.
      const joined = !quotedAction && !plain ? /^(.+?置)き、(自分の.+)$/.exec(each[2]!) : null;
      const inner = quotedAction
        ? parseEffects(quotedAction[1]!.split('。').filter((x) => x !== ''), false)
        : joined
          ? parseEffects([`${joined[1]}く`, joined[2]!], false)
          : parseSentence(plain ?? each[2]!, false);
      // "…してよい" inside: only for a choice of cards, where it is "up to" in effect; kept out for now.
      if (!inner || plain || !per?.data) return null;
      effects.push({ do: 'BRAINSTORM', count: n(brainstorm[1]), per: per.data, each: inner.data, ...(joined ? { joined: true } : {}) });
      zh.push(`翻開山札頂 ${brainstorm[1]} 張放到控え室，其中每有 1 張${per.zh}，${inner.zh}`);
      i += quotedAction ? 2 : 1;
      continue;
    }
    // "相手の…を1枚選ぶ。そのキャラは次の相手のスタンドフェイズに【スタンド】しない"
    const pick = /^(?:あなたは)?相手の(前列の|後列の)?(.+?)を(\d+)枚選ぶ$/.exec(sentences[i]!);
    if (pick && sentences[i + 1] === 'そのキャラは次の相手のスタンドフェイズに【スタンド】しない') {
      const filter = parseFilter(pick[2]!, 'STAGE');
      if (!filter || (filter.data && filter.data.kind !== 'CHARACTER' && !filter.data.levelAboveMasterLevel)) return null;
      const from = pick[1] === '前列の' ? 'OPPONENT_FRONT_ROW' : pick[1] === '後列の' ? 'OPPONENT_BACK_ROW' : 'OPPONENT_STAGE';
      effects.push({ do: 'CHOOSE', from, ...(filter.data ? { filter: filter.data } : {}), min: n(pick[3]), max: n(pick[3]) }, { do: 'GRANT', target: { who: 'CHOSEN' }, ability: { type: 'CONT', apply: [], noStand: true }, until: 'NEXT_OPPONENT_TURN' });
      zh.push(`選對手${pick[1] === '前列の' ? '前列' : pick[1] === '後列の' ? '後列' : ''} ${pick[3]} 張${filter.zh}，該角色在對手下一個 Stand 階段不會 Stand`);
      i++;
      continue;
    }
    // "(…置き、)そのターン中、このカード(のパワーを＋Nし、このカード)は次の能力を得る。『…』": this card gains the quoted ability for that time.
    const selfGain = /^(?:(.+?(?:置|与|戻))(?:き|え|し)、)?(?:([^、]+?)なら、)?(そのターン中|次の相手のターンの終わりまで)、このカード(?:の(.+?)し、このカード)?は次の能力を得る$/.exec(sentences[i]!);
    const selfQuoted = selfGain && /^『(.+?)。?』$/.exec(sentences[i + 1] ?? '');
    if (selfGain && selfQuoted) {
      const before = selfGain[1] ? parseEffects([`${selfGain[1]}${selfGain[1].endsWith('与') ? 'える' : selfGain[1].endsWith('戻') ? 'す' : 'く'}`], battle) : out<Effect[]>([], '');
      const changes = selfGain[4] ? parseChanges(selfGain[4]) : [];
      const inner = readLine(selfQuoted[1]! + '。');
      if (!before || !changes || !inner.line || inner.line.ability.type === 'ACT') return null;
      const until = selfGain[3] === 'そのターン中' ? {} : { until: 'NEXT_OPPONENT_TURN' as const };
      const gained: Effect[] = [...changes.map((c) => ({ do: 'MODIFY' as const, target: { who: 'SELF' as const }, stat: c.stat, amount: c.amount, ...until })), { do: 'GRANT', target: { who: 'SELF' }, ability: inner.line.ability, ...until }];
      // "…なら、そのターン中、…": only while that holds when this is done.
      const when = selfGain[2] ? parseCondition(selfGain[2]) : null;
      if (selfGain[2] && !when?.data) return null;
      effects.push(...before.data, ...(when ? [{ do: 'IF' as const, condition: when.data!, then: gained }] : gained));
      zh.push(`${before.zh ? `${before.zh}，` : ''}${selfGain[3] === 'そのターン中' ? '該回合' : '直到對手下一個回合結束為止，'}這張卡${changes.map((c) => ` ${c.zh}`).join('、')}${changes.length ? '，並' : ''}得到以下能力：「${inner.line.zh}」`);
      i++;
      continue;
    }
    // "山札の上からN枚までを、公開してよい。1枚以上公開したなら、それらのカードの…を1枚まで選び、手札に加え、残りのカードを控え室に置き、…"
    const showUpTo = /^(?:あなたは)?自分の山札の上から(\d+)枚までを、公開してよい$/.exec(sentences[i]!);
    const shownThen = showUpTo && /^1枚以上公開したなら、(?:あなたは)?それらのカードの(.+?)を(\d+)枚まで選び、手札に加え、残りのカードを控え室に置(?:く|き、(.+))$/.exec(sentences[i + 1] ?? '');
    if (showUpTo && shownThen) {
      const filter = parseFilter(shownThen[1]!, 'ZONE');
      const more = shownThen[3] ? parseEffects([shownThen[3]], battle) : out<Effect[]>([], '');
      if (!filter || !more) return null;
      effects.push(
        { do: 'REVEAL_DECK_TOP', count: n(showUpTo[1]), upTo: true },
        { do: 'IF', condition: { if: 'LAST_MOVED', min: 1 }, then: [{ do: 'CHOOSE', from: 'THOSE', ...(filter.data ? { filter: filter.data } : {}), min: 0, max: n(shownThen[2]) }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' }, { do: 'MOVE_REST', to: 'WAITING_ROOM' }, ...more.data] },
      );
      zh.push(`可以逐張公開自己山札頂最多 ${showUpTo[1]} 張；公開了 1 張或以上的話，從中選最多 ${shownThen[2]} 張${filter.zh}加入手牌，其餘放到控え室${more.zh ? `，然後${more.zh}` : ''}`);
      i++;
      continue;
    }
    // "相手の…を1枚選んでよい。そうしたら、相手は自分の控え室の…を1枚選び、入れ替える"
    const pickTheirs = /^(?:あなたは)?相手の(.+?)を(\d+)枚選んでよい$/.exec(sentences[i]!);
    const theySwap = pickTheirs && /^そうしたら、相手は自分の控え室の(.+?)を1枚選び、入れ替える$/.exec(sentences[i + 1] ?? '');
    if (pickTheirs && theySwap) {
      const mine = parseFilter(pickTheirs[1]!, 'STAGE');
      const theirs = parseFilter(theySwap[1]!, 'ZONE');
      if (!mine || !theirs || (mine.data && mine.data.kind !== 'CHARACTER')) return null;
      const theirFilter = theirs.data ? (({ kind: _k, ...rest }) => (void _k, rest))(theirs.data) : undefined;
      effects.push({ do: 'CHOOSE', from: 'OPPONENT_STAGE', ...(mine.data ? { filter: mine.data } : {}), min: 0, max: n(pickTheirs[2]) }, { do: 'OPPONENT_SWAPS_FROM_WAITING_ROOM', ...(theirFilter && Object.keys(theirFilter).length ? { filter: theirFilter } : {}) });
      zh.push(`可以選對手 ${pickTheirs[2]} 張${mine.zh}；選了的話，對手從自己控え室選 1 張${theirs.zh}與它互換`);
      i++;
      continue;
    }
    // "あなたは次の効果を行ってよい。『…』": the quoted effects, if the player wants.
    const mayDo = /^(?:あなたは)?次の(効果|行動)を行ってよい$/.exec(sentences[i]!);
    const mayQuoted = mayDo && /^『(.+?)。?』$/.exec(sentences[i + 1] ?? '');
    if (mayDo && mayQuoted) {
      const inner = parseEffects(mayQuoted[1]!.split('。').filter((x) => x !== ''), battle);
      if (!inner) return null;
      effects.push({ do: 'MAY', effects: inner.data, said: mayDo[1] === '効果' ? 'EFFECT' : 'ACTION' });
      zh.push(`可以進行以下${mayDo[1] === '効果' ? '效果' : '行動'}：${inner.zh}`);
      i++;
      continue;
    }
    // A delayed ability: "次のあなたのターンの始めに、…" and the like (a time, then what is done then).
    const later = /^(次のあなたのターンの始めに|次のあなたのドローフェイズの始めに|アンコールステップの始めに|ターンの終わりに)、(.+)$/.exec(sentences[i]!);
    if (later) {
      const times: Record<string, DelayedTime> = {
        次のあなたのターンの始めに: { phase: 'STAND', whose: 'YOURS' },
        次のあなたのドローフェイズの始めに: { phase: 'DRAW', whose: 'YOURS' },
        アンコールステップの始めに: { step: 'ENCORE', whose: 'ANY' },
        ターンの終わりに: { phase: 'END', whose: 'ANY' },
      };
      const then = parseEffects([later[2]!], battle);
      if (!then) return null;
      effects.push({ do: 'DELAYED', at: times[later[1]!]!, effects: then.data });
      zh.push(`${later[1]!.replace('次のあなたのターンの始めに', '我方下一個回合開始時').replace('次のあなたのドローフェイズの始めに', '我方下一個抽牌階段開始時').replace('アンコールステップの始めに', '這回合的 Encore 步驟開始時').replace('ターンの終わりに', '這回合結束時')}，${then.zh}`);
      continue;
    }
    // "N枚引いたなら、…": after an optional draw of N, only if it was done.
    const drewIf = /^(\d+)枚引いたなら、(.+)$/.exec(sentences[i]!);
    const lastDraw = effects[effects.length - 1];
    if (drewIf && lastDraw?.do === 'DRAW' && lastDraw.optional && lastDraw.count === n(drewIf[1])) {
      const then = parseEffects([drewIf[2]!], battle);
      if (!then) return null;
      effects.push({ do: 'IF', condition: { if: 'DID' }, then: then.data });
      zh.push(`抽了 ${drewIf[1]} 張的話，${then.zh}`);
      continue;
    }
    // "それらのカードに…があるなら、…": the cards just moved from the top of the deck.
    const amongThem = /^それらのカードに(.+?)があるなら、(.+)$/.exec(sentences[i]!);
    if (amongThem && lastDraw?.do === 'DECK_TOP' && !lastDraw.upTo) {
      const filter = parseFilter(amongThem[1]!, 'ZONE');
      const plainThen = plainForm(amongThem[2]!);
      const inner = parseEffects([plainThen ?? amongThem[2]!], battle);
      const then = inner && plainThen ? out<Effect[]>([{ do: 'MAY', effects: inner.data }], `可以${inner.zh}`) : inner;
      if (!filter?.data || !then) return null;
      effects.push({ do: 'IF', condition: { if: 'LAST_MOVED', min: 1, filter: filter.data }, then: then.data });
      zh.push(`這些卡中有${filter.zh}的話，${then.zh}`);
      continue;
    }
    // "次の行動を(N回)行う。『…』": the quoted action, once or N times.
    const repeat = /^(?:あなたは)?次の行動を(?:(\d+)回)?行う$/.exec(sentences[i]!);
    const action = repeat && /^『(.+?)。?』$/.exec(sentences[i + 1] ?? '');
    if (repeat && action) {
      const inner = parseEffects(action[1]!.split('。').filter((x) => x !== ''), battle);
      if (!inner) return null;
      const times = repeat[1] ? n(repeat[1]) : 1;
      effects.push({ do: 'REPEAT', times, effects: inner.data });
      zh.push(`${times > 1 ? `以下行動進行 ${times} 次` : '進行以下行動'}：${inner.zh}`);
      i++;
      continue;
    }
    // "次のNつの効果のうちあなたが選んだ1つを行う。『…』『…』": the player chooses one of the quoted effects.
    const choice = /^(?:あなたは)?次の(\d)つの効果のうちあなたが選んだ1つを行う$/.exec(sentences[i]!);
    if (choice) {
      // Each quoted effect may hold quotes of its own (『…『…』』).
      const pieces = splitQuotes(sentences[i + 1] ?? '');
      const quoted = pieces.every((q) => /^『.*』$/.test(q)) ? pieces.map((q) => q.slice(1, -1)) : [];
      if (quoted.length !== n(choice[1])) return null;
      const options = quoted.map((q) => parseQuotedEffect(q, battle));
      if (options.some((o) => o === null)) return null;
      effects.push({ do: 'CHOOSE_ONE', options: options.map((o) => o!.data) });
      zh.push(`從以下 ${quoted.length} 個效果選 1 個執行：${options.map((o, k) => `（${k + 1}）${o!.zh}`).join('；')}`);
      i++;
      continue;
    }
    // "自分の山札の上から1枚を公開する。そのカードが…なら…": the card is taken into the hand, or something else is done.
    // 公開してよい: the same, asked first.
    const mayShow = sentences[i] === 'あなたは自分の山札の上から1枚を公開してよい';
    if (mayShow) sentences[i] = 'あなたは自分の山札の上から1枚を公開する';
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
      let rest = shown?.[4] ?? shown?.[5];
      // …、そうでないなら、…: what is done when the card does not match.
      const otherwise = rest ? /^(.+?)、そうでないなら、(.+)$/.exec(rest) : null;
      if (otherwise) rest = otherwise[1]!.replace(/戻し$/, '戻す').replace(/置き$/, '置く');
      const readThen = (text: string): Out<Effect[]> => {
        // …してよい: the player is asked.
        const plain = plainForm(text);
        const inner = plain ? parseSentence(plain, battle) : parseSentence(text, battle);
        return inner && plain ? out([{ do: 'MAY', effects: inner.data }], `可以${inner.zh}`) : inner;
      };
      let then = rest ? readThen(rest) : null;
      // "…なら、…してよい。そうしたら、…": the next sentence happens only if that was done.
      let used = 1;
      if (then && then.data.length === 1 && then.data[0]!.do === 'MAY' && (sentences[i + 2] ?? '').startsWith('そうしたら、')) {
        const after = parseEffects([sentences[i + 2]!.slice('そうしたら、'.length)], battle);
        if (!after) return null;
        then = out([...then.data, { do: 'IF', condition: { if: 'DID' }, then: after.data }], `${then.zh}；這樣做了的話，${after.zh}`);
        used = 2;
      }
      const elseDo = otherwise ? readThen(otherwise[2]!.replace(/^自分の/, 'あなたは自分の')) : null;
      if (!shown || !filter?.data || (rest && !then) || (otherwise && !elseDo)) return null;
      const take = shown[5] === undefined;
      if (otherwise && take) return null;
      effects.push({ do: 'REVEAL_TOP', filter: filter.data, ...(take ? { take: true } : {}), ...(then ? { then: then.data } : {}), ...(elseDo ? { else: elseDo.data } : {}), ...(mayShow ? { optional: true } : {}) });
      zh.push(`公開自己山札頂 1 張：如果是${filter.zh}，${take ? '加入手牌' : ''}${then ? `${take ? '，然後' : ''}${then.zh}` : ''}（否則放回原處）`);
      i += used;
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
    if (!one) {
      // Two actions joined in one sentence (…置き、… / …戻し、… / …シャッフルし、…): read as two sentences, each known by itself.
      const split = splitJoined(sentences[i]!, battle);
      if (!split) return null;
      effects.push(...split.data);
      zh.push(split.zh);
      continue;
    }
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

function automatic(input: LineParts, unknown: Unknown[]): GrammarLine | null {
  let parts = input;
  const combo = parts.marks.includes('CXコンボ');
  const isEncore = parts.marks.includes('アンコール');
  // 記憶 and 経験 are keyword words with no effect of their own (CR-10.9.1, CR-10.10.1).
  const words: ('MEMORY' | 'EXPERIENCE')[] = parts.marks.flatMap((mark) => (mark === '記憶' ? ['MEMORY' as const] : mark === '経験' ? ['EXPERIENCE' as const] : []));
  if (parts.marks.some((mark) => mark !== 'CXコンボ' && mark !== 'アンコール' && mark !== '記憶' && mark !== '経験')) unknown.push({ part: 'MARK', text: parts.marks.join(' ') });
  const cost = parts.cost ? parseCost(parts.cost) : out<Cost[]>([], '');
  if (!cost) for (const action of parts.cost ?? []) if (!parseCostAction(action)) unknown.push({ part: 'COST', text: action });
  if (isEncore) {
    // 【自】 アンコール ［cost］: the rest of the line is reminder text.
    if (parts.trigger || parts.effects.length > 0 || parts.conditions.length > 0 || !parts.cost) unknown.push({ part: 'SHAPE', text: 'アンコール' });
    if (unknown.length > 0 || !cost) return null;
    return { ability: encore(cost.data), zh: `【自】Encore [${cost.zh}]：這張卡由舞台放到控え室時，可以支付費用；支付後把它 Rest 放回原本的枠。` };
  }
  // "思い出置場にこのカードがあ(る|り、…)なら、…した時": the ability works from memory (CR-2.12.2.3).
  const memoryZone = /^思い出置場にこのカードがあ(?:る|り、(.+?))なら、(.+)$/.exec(parts.trigger ?? '');
  if (memoryZone) parts = { ...parts, trigger: memoryZone[2]!, conditions: [...(memoryZone[1] ? [memoryZone[1]] : []), ...parts.conditions] };
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
  // "…し、あなたはコストを払ってよい。そうしたら／コストを払ったなら、…": the cost of the head is paid partway through.
  let midPay: { then: string[]; said: 'THEN' | 'IF_PAID' } | null = null;
  const midAt = parts.cost && sentences[0] !== 'あなたはコストを払ってよい' ? sentences.findIndex((s, k) => /、あなたはコストを払ってよい$/.test(s) && /^(そうしたら|コストを払ったなら)、/.test(sentences[k + 1] ?? '')) : -1;
  if (midAt >= 0) {
    const head = sentences[midAt]!.replace(/、あなたはコストを払ってよい$/, '').replace(/与え$/, '与える').replace(/(＋\d+)し$/, '$1');
    const next = sentences[midAt + 1]!;
    midPay = { then: [next.replace(/^(そうしたら|コストを払ったなら)、/, ''), ...sentences.slice(midAt + 2)], said: next.startsWith('そうしたら、') ? 'THEN' : 'IF_PAID' };
    sentences = [...sentences.slice(0, midAt), head];
  } else if (parts.cost) {
    if (sentences[0] !== 'あなたはコストを払ってよい' || !sentences[1]?.startsWith('そうしたら、')) {
      unknown.push({ part: 'SHAPE', text: 'cost without あなたはコストを払ってよい。そうしたら、' });
      return null;
    }
    sentences = [sentences[1].slice('そうしたら、'.length), ...sentences.slice(2)];
  } else {
    // 公開してよい。そのカードが…なら…: read with the shown card (REVEAL_TOP optional), not here.
    const showFirst = (sentences[0] === 'あなたは自分の山札の上から1枚を公開してよい' && (sentences[1] ?? '').startsWith('そのカード')) || /^(?:あなたは)?次の(?:効果|行動)を行ってよい$/.test(sentences[0] ?? '') || /^(?:あなたは)?自分の山札の上から\d+枚までを、公開してよい$/.test(sentences[0] ?? '');
    const first = showFirst ? null : plainForm(sentences[0] ?? '');
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
  if (anyLeftOptional(sentences)) {
    unknown.push({ part: 'OPTIONAL', text: sentences.join('。') });
    return null;
  }
  const battle = trigger?.data.on === 'BATTLE_OPPONENT_REVERSED' || parts.conditions.some((c) => c.includes('バトル相手'));
  // "そのキャラ": the character the trigger names (the attacked or attacking one, or the one reversed of the two).
  aboutThat = trigger?.data.on === 'OTHER_FRONT_ATTACKED' || trigger?.data.on === 'OTHER_ATTACKS' || trigger?.data.on === 'OTHER_STAGE_TO_WAITING_ROOM' || (trigger?.data.on === 'EITHER' && JSON.stringify(trigger.data.of) === JSON.stringify([{ on: 'REVERSED' }, { on: 'BATTLE_OPPONENT_REVERSED' }]));
  const effects = parseEffects(sentences, battle);
  if (!effects) unknown.push(...unknownEffects(sentences, battle));
  const paidThen = midPay ? parseEffects(midPay.then, battle) : null;
  if (midPay && !paidThen) unknown.push(...unknownEffects(midPay.then, battle));
  if (unknown.length > 0 || !trigger || !cost || !condition || !effects || (midPay && !paidThen)) return null;

  const ability: AutoAbility = {
    type: 'AUTO',
    ...(combo || words.length > 0 ? { keywords: [...(combo ? ['CX_COMBO' as const] : []), ...words] } : {}),
    ...(trigger.data.on === 'HOLDER_ATTACKS' ? { zone: 'MARKER' as const } : memoryZone ? { zone: 'MEMORY' as const } : {}),
    trigger: trigger.data,
    ...(condition.data ? { condition: condition.data } : {}),
    ...(parts.cost && !midPay ? { cost: cost.data } : {}),
    ...(optional ? { optional: true } : {}),
    effect: midPay ? [...effects.data, { do: 'MAY_PAY', cost: cost.data, then: paidThen!.data, said: midPay.said }] : effects.data,
  };
  const zh =
    `【自】${combo ? '【CX Combo】' : ''}${parts.cost ? `[${cost.zh}] ` : ''}${trigger.zh}` +
    `${condition.zh ? `，如果${condition.zh}` : ''}：${parts.cost ? '可以支付費用；支付後' : optional ? '可以' : ''}${effects.zh}。`;
  return { ability, zh };
}

function activated(parts: LineParts, unknown: Unknown[]): GrammarLine | null {
  const brainstorm = parts.marks.includes('集中');
  const boarding = parts.marks.includes('搭乗');
  const comboAct = parts.marks.includes('CXコンボ');
  if (parts.marks.some((mark) => mark !== '集中' && mark !== '搭乗' && mark !== 'CXコンボ')) unknown.push({ part: 'MARK', text: parts.marks.join(' ') });
  // "…なら、…" in an activated ability: the cost can be paid anyway; the effect happens only if the condition holds then.
  const conditions = parts.conditions.map(parseCondition);
  conditions.forEach((c, i) => c === null && unknown.push({ part: 'CONDITION', text: parts.conditions[i]! }));
  const condition = allOf(conditions);
  const cost = parts.cost ? parseCost(parts.cost) : null;
  if (!parts.cost) unknown.push({ part: 'SHAPE', text: '【起】 without a cost' });
  else if (!cost) for (const action of parts.cost) if (!parseCostAction(action)) unknown.push({ part: 'COST', text: action });
  if (anyLeftOptional(parts.effects)) {
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
      ...(brainstorm || boarding || comboAct ? { keywords: [...(comboAct ? ['CX_COMBO' as const] : []), ...(brainstorm ? ['BRAINSTORM' as const] : boarding ? ['BOARDING' as const] : [])] } : {}),
      timing: 'MAIN',
      cost: cost.data,
      effect: condition.data ? [{ do: 'IF', condition: condition.data, then: effects.data }] : effects.data,
    },
    zh: `【起】${brainstorm ? '集中 ' : boarding ? '搭乘 ' : ''}[${cost.zh}]：${condition.zh ? `如果${condition.zh}，` : ''}${effects.zh}。`,
  };
}

/** 【永】: this card's or your characters' numbers, while conditions hold. */
function continuous(input: LineParts, unknown: Unknown[]): GrammarLine | null {
  // 記憶 and 経験 are words only (CR-10.9.1, CR-10.10.1): read the line without them, then name them on the ability.
  const said = input.marks.filter((mark): mark is '記憶' | '経験' => mark === '記憶' || mark === '経験');
  const result = continuousBody({ ...input, marks: input.marks.filter((mark) => mark !== '記憶' && mark !== '経験') }, unknown);
  if (!result || said.length === 0 || result.ability.type !== 'CONT') return result;
  return { ...result, ability: { ...result.ability, keywords: [...said.map((w) => (w === '記憶' ? ('MEMORY' as const) : ('EXPERIENCE' as const))), ...(result.ability.keywords ?? [])] } };
}

function continuousBody(input: LineParts, unknown: Unknown[]): GrammarLine | null {
  let parts = input;
  // 回想 (CR-10.20.2) and 【リンク】 （名称） (CR-10.17): keyword abilities, the second with only a name.
  if (parts.marks.join() === '回想' && parts.effects.length === 0 && parts.conditions.length === 0 && !parts.cost) {
    return { ability: { type: 'CONT', recollection: true, apply: [] }, zh: '【永】回想（這張卡在思い出時，我方角色由舞台以外放到舞台而下面沒有 Marker 的話，可以把這張卡以表向放到它下面作為 Marker；這張卡由 Marker 置場移到其他公開區域時放到思い出）。' };
  }
  if (parts.marks.join() === 'リンク' && parts.effects.length === 1 && parts.conditions.length === 0 && !parts.cost) {
    return { ability: { type: 'CONT', link: parts.effects[0]!, apply: [] }, zh: `【永】【Link】${parts.effects[0]}（本身沒有效果，供其他能力參照）。` };
  }
  // マーカー置場にこのカードがあるなら: the ability works from the marker zone, on the character that has the marker.
  const fromMarker = parts.conditions[0] === 'マーカー置場にこのカードがある';
  if (fromMarker && parts.marks.length === 0 && !parts.cost && parts.effects.length === 1) {
    const rest = parts.conditions.slice(1);
    let sentence = parts.effects[0]!;
    const turn = /^(あなたのターン中|相手のターン中)、(.+)$/.exec(sentence);
    if (turn) {
      rest.push(turn[1]!);
      sentence = turn[2]!;
    }
    const holder = /^このマーカーを持つ舞台の、?(.+?)の(パワー|ソウル)を＋(\d+)$/.exec(sentence);
    const filter = holder && parseFilter(holder[1]!, 'STAGE');
    const conditions = rest.map(parseCondition);
    const condition = allOf(conditions);
    if (holder && filter && (!filter.data || filter.data.kind === 'CHARACTER') && condition) {
      const stat = holder[2] === 'パワー' ? 'POWER' : 'SOUL';
      return {
        ability: { type: 'CONT', zone: 'MARKER', ...(condition.data ? { condition: condition.data } : {}), apply: [{ target: { who: 'MARKER_HOLDER', ...(filter.data ? { filter: filter.data } : {}) }, stat, amount: n(holder[3]) }] },
        zh: `【永】這張卡是 Marker 時，${condition.zh ? `${condition.zh}，` : ''}持有這個 Marker 的${filter.zh} ${stat === 'POWER' ? 'Power' : 'Soul'} +${holder[3]}。`,
      };
    }
  }
  const perMarker = parts.marks.length === 0 && parts.effects.length === 1 ? /^(?:(あなたのターン中)、)?このカードの下のマーカー1枚につき、このカードの(パワー|ソウル)を＋(\d+)$/.exec(parts.effects[0]!) : null;
  if (perMarker && parts.conditions.length === 0 && !parts.cost) {
    const stat = perMarker[2] === 'パワー' ? 'POWER' : 'SOUL';
    return {
      ability: { type: 'CONT', ...(perMarker[1] ? { condition: { if: 'YOUR_TURN' as const } } : {}), apply: [{ target: { who: 'SELF' }, stat, amount: n(perMarker[3]), perMarker: true }] },
      zh: `【永】${perMarker[1] ? '我方回合中，' : ''}這張卡下面每有 1 張 Marker，這張卡 ${stat === 'POWER' ? 'Power' : 'Soul'} +${perMarker[3]}。`,
    };
  }
  // 応援 (CR-10.3.2): in force only while this card is in the back row; it gives the characters in front of it.
  if (parts.marks.join() === '応援' && !parts.cost) {
    const [first, second] = parts.effects;
    const texts = [...parts.conditions];
    let sentence = first ?? '';
    const turn = /^(あなたのターン中|相手のターン中)、(.+)$/.exec(sentence);
    if (turn) {
      texts.push(turn[1]!);
      sentence = turn[2]!;
    }
    const assist = /^このカードの前のあなたの(.+?)すべてに、パワーを＋(\d+|Ｘ)$/.exec(sentence);
    const byLevel = assist?.[2] === 'Ｘ' ? /^Ｘはそのキャラのレベル×(\d+)に等しい$/.exec(second ?? '') : null;
    const filter = assist && parseFilter(assist[1]!, 'STAGE');
    const condition = allOf(texts.map(parseCondition));
    const fits = assist && filter && condition && (!filter.data || filter.data.kind === 'CHARACTER') && (assist[2] === 'Ｘ' ? byLevel && parts.effects.length === 2 : parts.effects.length === 1);
    if (fits) {
      const amount = n(assist[2] === 'Ｘ' ? byLevel![1] : assist[2]);
      return {
        ability: {
          type: 'CONT',
          keywords: ['ASSIST'],
          assist: true,
          ...(condition.data ? { condition: condition.data } : {}),
          apply: [{ target: { who: 'IN_FRONT', ...(filter.data ? { filter: filter.data } : {}) }, stat: 'POWER', amount, ...(assist[2] === 'Ｘ' ? { perTargetLevel: true } : {}) }],
        },
        zh: `【永】應援：${condition.zh ? `${condition.zh}，` : ''}放在後列時，它前面的我方${filter.zh}全部 Power +${assist[2] === 'Ｘ' ? `該角色 Level×${amount}` : amount}。`,
      };
    }
  }
  // 記憶 / 経験 are words only (CR-10.9.1, CR-10.10.1).
  const contWords = parts.marks.filter((mark) => mark === '記憶' || mark === '経験');
  if (contWords.length > 0 && contWords.length === parts.marks.length) parts = { ...parts, marks: [] };
  const perMemory = parts.marks.length === 0 && parts.effects.length === 1 ? /^(?:(あなたのターン中)、)?あなたの思い出置場の「([^」]+)」1枚につき、このカードのパワーを＋(\d+)$/.exec(parts.effects[0]!) : null;
  if (perMemory && parts.conditions.length === 0 && !parts.cost) {
    return {
      ability: {
        type: 'CONT',
        ...(contWords.length > 0 ? { keywords: contWords.map((w) => (w === '記憶' ? ('MEMORY' as const) : ('EXPERIENCE' as const))) } : {}),
        ...(perMemory[1] ? { condition: { if: 'YOUR_TURN' as const } } : {}),
        apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: n(perMemory[3]), perCount: { where: 'YOUR_MEMORY', filter: { name: perMemory[2]! } } }],
      },
      zh: `【永】${perMemory[1] ? '我方回合中，' : ''}我方思い出每有 1 張「${perMemory[2]}」，這張卡 Power +${perMemory[3]}。`,
    };
  }
  if (parts.marks.length > 0 || parts.cost) unknown.push({ part: 'MARK', text: [...parts.marks, parts.cost ? '［cost］' : ''].join(' ') });
  // "…し、このカードは次の能力を得る。『【自】…』": the abilities this card has while the condition holds.
  const given: { ability: AutoAbility; zh: string }[] = [];
  const gainedConts: { ability: ContinuousAbility | ActivatedAbility; zh: string }[] = [];
  let body = parts.effects;
  // "(他の)あなたの…すべてに、(…し、)次の能力を与える。『【自】…』": given to those characters while this is in force.
  const giveAll = /^(?:(あなたのターン中|相手のターン中)、)?(他の)?あなたの(.+?)すべてに、(?:(.+?)し、)?次の(?:(\d)つの)?能力を与える$/.exec(body[0] ?? '');
  if (giveAll && parts.marks.length === 0 && !parts.cost) {
    const quoted = body.slice(1).flatMap(splitQuotes);
    const filter = parseFilter(giveAll[3]!, 'STAGE');
    const changes = giveAll[4] ? parseChanges(giveAll[4]) : [];
    const turnTexts = [...parts.conditions, ...(giveAll[1] ? [giveAll[1]] : [])];
    const turnConditions = turnTexts.map(parseCondition);
    const cond = allOf(turnConditions);
    const inner = quoted.map((q) => (/^『.*』$/.test(q) ? readLine(q.slice(1, -1).replace(/。$/, '') + '。') : { line: null, unknown: [] }));
    if (filter && changes && cond && quoted.length === n(giveAll[5] ?? '1') && inner.every((x) => x.line?.ability.type === 'AUTO') && (!filter.data || filter.data.kind === 'CHARACTER' || filter.data.name)) {
      const target = { who: 'ALL_YOURS' as const, ...(filter.data ? { filter: filter.data } : {}), ...(giveAll[2] ? { other: true } : {}) };
      return {
        ability: {
          type: 'CONT',
          ...(cond.data ? { condition: cond.data } : {}),
          apply: changes.map((c) => ({ target, stat: c.stat, amount: c.amount })),
          grant: inner.map((x) => ({ target, ability: x.line!.ability as AutoAbility })),
        },
        zh: `【永】${cond.zh ? `${cond.zh}，` : ''}我方${giveAll[2] ? '其他' : '所有'}${filter.zh}全部${changes.length ? ` ${changes.map((c) => c.zh).join('、')}，並` : ''}得到以下能力：${inner.map((x) => `「${x.line!.zh}」`).join('')}`,
      };
    }
  }
  // "…し、このカードは『…』を得る": one ability, said inline.
  const inlineGain = body.length === 1 ? /^(.*?)(?:し、)?このカードは『(.+)』を得る$/.exec(body[0]!) : null;
  if (inlineGain) {
    body = [`${inlineGain[1] ? `${inlineGain[1]}し、` : ''}このカードは次の能力を得る`, `『${inlineGain[2]}』`];
  }
  const gains = /^(.*?)(?:し、)?このカードは次の(?:(\d)つの)?能力を得る$/.exec(body[0] ?? '');
  if (gains) {
    // 『…』『…』 with nothing between them comes as one sentence.
    const quoted = body.slice(1).flatMap(splitQuotes);
    if (quoted.length !== n(gains[2] ?? '1') || quoted.some((q) => !/^『.*』$/.test(q))) {
      unknown.push({ part: 'EFFECT', text: body.join('。') });
      return null;
    }
    for (const q of quoted) {
      const inner = readLine(q.slice(1, -1).replace(/。$/, '') + '。');
      if (!inner.line) {
        unknown.push({ part: 'EFFECT', text: `得る: ${q}` });
        return null;
      }
      // Continuous abilities are kept apart from automatic ones: only the order 【永】 before 【自】 can be written back.
      if (inner.line.ability.type !== 'AUTO' && given.length > 0) {
        unknown.push({ part: 'SHAPE', text: '得る: 【自】 before 【永】' });
        return null;
      }
      if (inner.line.ability.type !== 'AUTO') gainedConts.push({ ability: inner.line.ability, zh: inner.line.zh });
      else given.push({ ability: inner.line.ability, zh: inner.line.zh });
    }
    body = gains[1] ? [gains[1]] : [];
  }
  // "…すべてに、パワーを＋Ｘ。Ｘはそのキャラのソウル×Nに等しい": per target's soul.
  let bySoul: number | null = null;
  const soulX = body.length === 2 ? /^Ｘはそのキャラのソウル×(\d+)に等しい$/.exec(body[1]!) : null;
  if (soulX && body[0]!.endsWith('パワーを＋Ｘ')) {
    bySoul = n(soulX[1]);
    body = [body[0]!.replace(/＋Ｘ$/, `＋${soulX[1]}`)];
  }
  // "…＋Ｘ。Ｘはあなたのレベル×Nに等しい": N per card in the level zone.
  let byLevel: number | null = null;
  const levelX = body.length === 2 ? /^Ｘはあなたのレベル×(\d+)に等しい$/.exec(body[1]!) : null;
  if (levelX && body[0]!.endsWith('＋Ｘ')) {
    byLevel = n(levelX[1]);
    body = [body[0]!.replace(/＋Ｘ$/, `＋${levelX[1]}`)];
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

  const toBackRow = /^他のあなたの後列のキャラすべてに、『(.+)』を与える$/.exec(sentence);
  if (toBackRow && given.length === 0) {
    const inner = readLine(toBackRow[1]!.replace(/。$/, '') + '。');
    if (unknown.length > 0 || !condition || condition.data || inner.line?.ability.type !== 'CONT') return null;
    return { ability: { type: 'CONT', apply: [], grantConts: [{ target: { who: 'YOUR_SLOT', slots: ['BL', 'BR'], other: true }, ability: inner.line.ability }] }, zh: `【永】我方其他後列角色全部得到「${inner.line.zh}」。` };
  }
  const toTheirs = /^相手のキャラすべてに、『(.+)』を与える$/.exec(sentence);
  if (toTheirs && given.length === 0) {
    const inner = readLine(toTheirs[1]!.replace(/。$/, '') + '。');
    if (unknown.length > 0 || !condition || condition.data || inner.line?.ability.type !== 'AUTO') return null;
    return { ability: { type: 'CONT', apply: [], grant: [{ target: { who: 'ALL_THEIRS' }, ability: inner.line.ability }] }, zh: `【永】對手所有角色得到「${inner.line.zh}」。` };
  }
  if (sentence === 'このカードはあなたのスタンドフェイズに【スタンド】しない' && given.length === 0) {
    if (unknown.length > 0 || !condition || condition.data) return null;
    return { ability: { type: 'CONT', noStand: true, apply: [] }, zh: '【永】這張卡在我方 Stand 階段不會 Stand。' };
  }
  if (sentence === 'このカードのバトル中、すべてのプレイヤーは『助太刀』を手札からプレイできない' && given.length === 0) {
    if (unknown.length > 0 || !condition || condition.data) return null;
    return { ability: { type: 'CONT', noBackupsEveryone: true, apply: [] }, zh: '【永】這張卡戰鬥中，所有玩家都不能從手牌使用助太刀。' };
  }
  if (sentence === 'このカードと同じカード名のカードは、デッキに好きな枚数入れることができる' && given.length === 0) {
    if (unknown.length > 0 || !condition || condition.data) return null;
    return { ability: { type: 'CONT', anyNumberInDeck: true, apply: [] }, zh: '【永】與這張卡同名的卡可以在卡組放入任意張數（構築規則）。' };
  }
  const gainIcon = /^すべての領域にあるこのカードはトリガーアイコンに\[\[([a-z]+\.gif)\]\]を得る$/.exec(sentence);
  if (gainIcon && given.length === 0 && TRIGGER_ICONS[gainIcon[1]!]) {
    if (unknown.length > 0 || !condition) return null;
    return { ability: { type: 'CONT', ...(condition.data ? { condition: condition.data } : {}), gainsTriggerIcons: [TRIGGER_ICONS[gainIcon[1]!]!], apply: [] }, zh: `【永】${condition.zh ? `${condition.zh}，` : ''}在所有區域的這張卡得到 Trigger 圖示 ${TRIGGER_ICONS[gainIcon[1]!]}。` };
  }
  const handNamed = /^あなたの手札の「([^」]+)」のレベルを－(\d+)$/.exec(sentence);
  if (handNamed && given.length === 0) {
    if (unknown.length > 0 || !condition) return null;
    return { ability: { type: 'CONT', ...(condition.data ? { condition: condition.data } : {}), handCards: { filter: { name: handNamed[1]! }, level: -n(handNamed[2]) }, apply: [] }, zh: `【永】${condition.zh ? `${condition.zh}，` : ''}我方手牌中的「${handNamed[1]}」Level －${handNamed[2]}。` };
  }
  if (sentence === 'あなたの手札の枚数上限を＋1' && given.length === 0) {
    if (unknown.length > 0 || !condition || condition.data) return null;
    return { ability: { type: 'CONT', handLimitPlus: 1, apply: [] }, zh: '【永】我方手牌張數上限 +1。' };
  }
  const traitsToOthers = /^他のキャラすべてに、《([^》]+)》を与える$/.exec(sentence);
  if (traitsToOthers && given.length === 0) {
    if (unknown.length > 0 || !condition || condition.data) return null;
    return { ability: { type: 'CONT', giveTraits: { traits: [traitsToOthers[1]!], to: 'OTHER_CHARACTERS' }, apply: [] }, zh: `【永】其他所有角色（雙方）得到特徵《${traitsToOthers[1]}》。` };
  }
  const split = /^あなたのターン中、このカードの(パワー|ソウル)を＋(\d+)し、相手のターン中、このカードの(パワー|ソウル)を＋(\d+)$/.exec(sentence);
  if (split && given.length === 0) {
    if (unknown.length > 0 || !condition) return null;
    const stat = (w: string) => (w === 'パワー' ? ('POWER' as const) : ('SOUL' as const));
    return {
      ability: {
        type: 'CONT',
        ...(condition.data ? { condition: condition.data } : {}),
        apply: [
          { target: { who: 'SELF' }, stat: stat(split[1]!), amount: n(split[2]), onlyIf: { if: 'YOUR_TURN' } },
          { target: { who: 'SELF' }, stat: stat(split[3]!), amount: n(split[4]), onlyIf: { if: 'OPPONENT_TURN' } },
        ],
      },
      zh: `【永】${condition.zh ? `${condition.zh}，` : ''}我方回合中這張卡 ${split[1] === 'パワー' ? 'Power' : 'Soul'} +${split[2]}，對手回合中 ${split[3] === 'パワー' ? 'Power' : 'Soul'} +${split[4]}。`,
    };
  }
  const perLevelCard = /^あなたのレベル置場の(.+?)1枚につき、このカードの(パワー|ソウル)を＋(\d+)$/.exec(sentence);
  if (perLevelCard && given.length === 0) {
    const filter = parseFilter(perLevelCard[1]!, 'ZONE');
    if (unknown.length > 0 || !condition || !filter?.data) return null;
    return {
      ability: { type: 'CONT', ...(condition.data ? { condition: condition.data } : {}), apply: [{ target: { who: 'SELF' }, stat: perLevelCard[2] === 'パワー' ? 'POWER' : 'SOUL', amount: n(perLevelCard[3]), perCount: { where: 'YOUR_LEVEL', filter: filter.data } }] },
      zh: `【永】${condition.zh ? `${condition.zh}，` : ''}我方 Level 置場每有 1 張${filter.zh}（表向），這張卡 ${perLevelCard[2] === 'パワー' ? 'Power' : 'Soul'} +${perLevelCard[3]}。`,
    };
  }
  if (sentence === 'このカードはプレイヤーにダメージを与えることができない' && given.length === 0) {
    if (unknown.length > 0 || !condition || condition.data) return null;
    return { ability: { type: 'CONT', noDamageToPlayers: true, apply: [] }, zh: '【永】這張卡不能對玩家造成傷害。' };
  }
  const checks = /^このカードのアタック中、あなたはトリガーステップにトリガーチェックを(\d+)回行う$/.exec(sentence);
  if (checks && given.length === 0) {
    if (unknown.length > 0 || !condition || condition.data) return null;
    return { ability: { type: 'CONT', triggerChecks: n(checks[1]), apply: [] }, zh: `【永】這張卡攻擊時，Trigger 步驟進行 ${checks[1]} 次 Trigger Check。` };
  }
  if (sentence === 'このカードは、色条件を満たさずに手札からプレイできる' && given.length === 0) {
    if (unknown.length > 0 || !condition || condition.data) return null;
    return { ability: { type: 'CONT', inHand: true, ignoresColor: true, apply: [] }, zh: '【永】這張卡不需滿足顏色條件也可以從手牌使用。' };
  }
  if (sentence === 'このカードは他の枠に動かせない' && given.length === 0) {
    if (unknown.length > 0 || !condition || condition.data) return null;
    return { ability: { type: 'CONT', cannotMove: true, apply: [] }, zh: '【永】這張卡不能移動到其他枠。' };
  }
  const blockCounter = /^このカードのバトル中、相手は(イベントと)?『助太刀』を手札からプレイできない$/.exec(sentence);
  if (blockCounter && given.length === 0) {
    if (unknown.length > 0 || !condition || condition.data) return null;
    return {
      ability: { type: 'CONT', noOpponentCounters: blockCounter[1] ? 'EVENT_AND_BACKUP' : 'BACKUP', apply: [] },
      zh: `【永】這張卡戰鬥中，對手不能從手牌使用${blockCounter[1] ? ' Event 及' : ''}助太刀。`,
    };
  }
  if (sentence === 'このカードはサイドアタックできない' && given.length === 0) {
    if (unknown.length > 0 || !condition || condition.data) return null;
    return { ability: { type: 'CONT', noSideAttack: true, apply: [] }, zh: '【永】這張卡不能進行側面攻擊。' };
  }
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
  if ((m = /^このカードの正面のキャラの(.+)$/.exec(sentence))) {
    target = { who: 'FACING' } as unknown as Extract<Target, { who: 'SELF' }>;
    targetZh = '這張卡正面的角色';
    changes = parseChanges(m[1]!);
  } else if ((m = /^このカードの(.+)$/.exec(sentence))) {
    target = { who: 'SELF' };
    targetZh = '這張卡';
    changes = parseChanges(m[1]!);
  } else if ((m = /^(他の)?あなたの(.+?)すべてに、(.+)$/.exec(sentence))) {
    const filter = parseFilter(m[2]!, 'STAGE');
    if (filter && (!filter.data || filter.data.kind === 'CHARACTER' || filter.data.nameIncludesAny || filter.data.nameIncludes || filter.data.name)) {
      target = { who: 'ALL_YOURS', ...(filter.data ? { filter: filter.data } : {}), ...(m[1] ? { other: true } : {}) };
      targetZh = `我方${m[1] ? '其他' : '所有'}${filter.zh}全部`;
      changes = parseChanges(m[3]!);
    }
  }
  // Only abilities gained (【自】 given, or 【永】/【起】 the card has), with no number change of its own.
  const noChange = (given.length > 0 || gainedConts.length > 0) && sentence === '';
  if (!noChange && (!target || !changes)) unknown.push({ part: 'EFFECT', text: sentence });
  if (given.length > 0 && target && target.who !== 'SELF') unknown.push({ part: 'EFFECT', text: sentence });
  if (unknown.length > 0 || !condition) return null;
  const apply = noChange ? [] : changes!.map((c) => ({ target: target!, stat: c.stat, amount: c.amount, ...(byLevel !== null ? { perCount: { where: 'YOUR_LEVEL' as const } } : {}), ...(bySoul !== null ? { perTargetSoul: true } : {}) }));
  return {
    ability: {
      type: 'CONT',
      ...(contWords.length > 0 ? { keywords: contWords.map((w) => (w === '記憶' ? ('MEMORY' as const) : ('EXPERIENCE' as const))) } : {}),
      ...(condition.data ? { condition: condition.data } : {}),
      apply,
      ...(given.length > 0 ? { grant: given.map((g) => ({ target: { who: 'SELF' as const }, ability: g.ability })) } : {}),
      ...(gainedConts.length > 0 ? { gains: gainedConts.map((g) => g.ability) } : {}),
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
  const m = /（([^（）]*)）$/.exec(outsideNames(line));
  if (!m || /^【自】 アンコール ［[^］]*］ （[^（）]*）$/.test(line)) return line;
  const body = line.slice(0, m.index);
  // 回想 has the meaning CR-10.20.2 gives it, which the engine plays; its reminder only restates it (CR-2.12.3).
  if (body.trim() === '【永】 回想') return body.trim();
  const notes = m[1]!.split('。').filter((note) => note !== '');
  const known = notes.every((note) => {
    // CR-4.12.1.2: damage by an effect can be cancelled like any damage.
    if (note === 'ダメージキャンセルは発生する') return /ダメージを/.test(body);
    // The replacing damage is attack damage of the card (its source, CR-4.13.2.1), not damage by an 【自】 effect.
    if (note === 'このダメージは【自】の効果によるダメージではない') return /アタックのダメージを与える時、かわりに/.test(body);
    // The rule's encore is an 【自】 アンコール too (CR-10.2.3), so "『【自】 アンコール』を使えない" already covers it.
    if (note === 'ルールによる『【自】 アンコール ［(3)］』も使えない') return /『【自】 アンコール』を使えない/.test(body);
    // CR-2.19.1: a climax has no level, so it counts as 0 — which is how the engine reads every level.
    if (note === 'CXのレベルは0として扱う') return /レベル/.test(body);
    // A card shown from the top of the deck and not taken stays where it was (REVEAL_TOP, SHOW_TOP).
    if (note === 'そうでないなら元に戻す') return /公開する。そのカード(?:が|の)[^。]*なら(?:手札に加え|ストック置場に置)/.test(body);
    if (note === '公開したカードは元に戻す') return /公開(?:する|してよい)。そのカード(?:が|の)[^。]*なら、|山札の上から\d+枚を公開し、/.test(body);
    return false;
  });
  return known ? body : line;
}

export function readLine(raw: string): { line: GrammarLine | null; unknown: Unknown[] } {
  let line = raw;
  aboutThat = false;
  const unknown: Unknown[] = [];
  line = withoutReminders(line);
  if (outsideNames(line).includes('（') && !/^【自】 アンコール ［[^］]*］ （[^（）]*）$/.test(line)) return { line: null, unknown: [{ part: 'SHAPE', text: `（…）: ${/（[^（）]*）/.exec(line)?.[0].slice(0, 30) ?? ''}` }] };
  // 【リプレイ】(【ゲーム1】) (name) (effects) (CR-11.3.1.2): done only through this card's "(name)を発動する".
  const replay = /^【リプレイ】(【ゲーム1】)? ?(\S+) (.+)$/.exec(line);
  if (replay) {
    const effects = parseEffects(splitOutsideQuotes(replay[3]!), false);
    if (!effects) return { line: null, unknown: unknownEffects(splitOutsideQuotes(replay[3]!), false) };
    return { line: { ability: { type: 'CONT', apply: [], replay: { name: replay[2]!, ...(replay[1] ? { oncePerGame: true } : {}), effects: effects.data } }, zh: `【Replay】${replay[1] ? '【每局 1 次】' : ''}${replay[2]}：${effects.zh}。` }, unknown: [] };
  }
  const parts = splitLine(line);
  if (!parts) return { line: null, unknown: [{ part: 'SHAPE', text: line.slice(0, 40) }] };
  // 【ターンN】 (CR-10.19): the ability can be played only N times a turn.
  const turnMarks = parts.marks.filter((mark) => /^ターン\d$/.test(mark));
  if (turnMarks.length > 1 || (turnMarks.length > 0 && parts.type !== 'AUTO' && parts.type !== 'ACT')) unknown.push({ part: 'MARK', text: parts.marks.join(' ') });
  const plain = turnMarks.length > 0 ? { ...parts, marks: parts.marks.filter((mark) => !/^ターン\d$/.test(mark)) } : parts;
  let result = plain.type === 'AUTO' ? automatic(plain, unknown) : plain.type === 'ACT' ? activated(plain, unknown) : plain.type === 'CONT' ? continuous(plain, unknown) : null;
  if (result && unknown.length > 0) result = null;
  if (result && turnMarks.length === 1 && (result.ability.type === 'AUTO' || result.ability.type === 'ACT')) {
    const limit = n(turnMarks[0]!.slice('ターン'.length));
    result = { ability: { ...result.ability, limit }, zh: result.zh.replace(/^【(自|起)】/, (head) => `${head}【每回合 ${limit} 次】`) };
  }
  if (!result && unknown.length === 0) unknown.push({ part: 'SHAPE', text: line.slice(0, 40) });
  return { line: result, unknown: result ? [] : unknown };
}

/** The effect of an event card whose whole text is one paragraph of known effect sentences. Counter events are not read. */
/** "このカードは、あなたの…がいないなら／N枚以下なら、手札からプレイできない": the condition under which the card can be played. */
export function readPlayRestriction(text: string): { condition: Condition; zh: string } | null {
  const m = /^このカードは、(.+?)(がいない|が(\d+)枚以下)なら、手札からプレイできない$/.exec(text);
  if (!m) return null;
  const allowed = m[2] === 'がいない' ? `${m[1]}がいる` : `${m[1]}が${n(m[3]) + 1}枚以上`;
  const condition = parseCondition(allowed);
  return condition?.data ? { condition: condition.data, zh: `只可以在${condition.zh}時從手牌使用` } : null;
}

export function readEvent(text: string): { effect: Effect[]; zh: string } | null {
  const line = withoutReminders(text.trim());
  // Quotes only for the actions of 次の行動を(N回)行う / 次の効果を行ってよい.
  const quotesOk = !line.includes('『') || /次の(?:行動|効果)を(?:\d+回)?(?:行う|行ってよい)。『/.test(line);
  if (outsideNames(line).includes('（') || line.includes('【') || !quotesOk) return null;
  const parts = splitLine(line, 'EVENT');
  if (!parts || parts.type !== 'EVENT' || parts.marks.length > 0 || parts.trigger) return null;
  // ［cost］ (…なら、)あなたはコストを払ってよい。そうしたら、…: an optional payment, then what it buys.
  if (parts.cost) {
    const cost = parseCost(parts.cost);
    const conditions = allOf(parts.conditions.map(parseCondition));
    if (!cost || !conditions || parts.effects[0] !== 'あなたはコストを払ってよい' || !parts.effects[1]?.startsWith('そうしたら、')) return null;
    const rest = [parts.effects[1].slice('そうしたら、'.length), ...parts.effects.slice(2)];
    if (anyLeftOptional(rest)) return null;
    const bought = parseEffects(rest, false);
    if (!bought) return null;
    const pay: Effect = { do: 'MAY_PAY', cost: cost.data, then: bought.data };
    return {
      effect: conditions.data ? [{ do: 'IF', condition: conditions.data, then: [pay] }] : [pay],
      zh: `${conditions.zh ? `如果${conditions.zh}，` : ''}可以支付 [${cost.zh}]；支付後${bought.zh}。`,
    };
  }
  if (parts.conditions.length > 0) return null;
  if (anyLeftOptional(parts.effects)) return null;
  const effects = parseEffects(parts.effects, false);
  return effects ? { effect: effects.data, zh: `${effects.zh}。` } : null;
}
