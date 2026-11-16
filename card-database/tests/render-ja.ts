/**
 * Ability data written back as Japanese card text.
 *
 * This is the check on the sentence grammar (src/grammar.ts) and it is
 * written separately from it: the grammar goes from text to data with
 * patterns; this file goes from the meaning of each data field to the words
 * the card list uses for it. If the grammar puts a number, a trait or a
 * clause in the wrong field, or drops one, the text written here differs
 * from the official line and the test fails (grammar.test.ts).
 * Anything this file has no words for throws: nothing is skipped.
 */

import type { Ability, AutoAbility, CardFilter, Condition, Cost, Effect, Target, Trigger } from '@wso/game-engine';

const fail = (what: string, value: unknown): never => {
  throw new Error(`render-ja: no words for ${what} ${JSON.stringify(value)}`);
};
const signed = (amount: number): string => `${amount >= 0 ? '＋' : '－'}${Math.abs(amount)}`;
const ICONS: Record<string, string> = { SOUL: 'soul', COMEBACK: 'salvage', RETURN: 'bounce', SHOT: 'shot', DRAW: 'draw', TREASURE: 'treasure', CHOICE: 'choice', GATE: 'gate', STANDBY: 'standby' };

/** `where`: on the stage a card without a filter is "キャラ", in another zone "カード". */
export function filterJa(filter: CardFilter | undefined, where: 'STAGE' | 'ZONE'): string {
  if (!filter) return where === 'STAGE' ? 'キャラ' : 'カード';
  const keys = Object.keys(filter).sort().join();
  if (keys === 'name') return `「${filter.name}」`;
  if (keys === 'names') return `、${filter.names!.map((name) => `「${name}」`).join('か')}`;
  if (keys === 'anyOf') return filter.anyOf!.map((part) => filterJa(part, 'ZONE')).join('か');
  if (keys === 'hasTrigger,kind' && filter.kind === 'CLIMAX') return `トリガーアイコンが[[${ICONS[filter.hasTrigger!]}.gif]]のCX`;
  if (keys === 'kind,triggersExactly' && filter.kind === 'CLIMAX') return `トリガーアイコンが${filter.triggersExactly!.map((t) => `[[${ICONS[t]}.gif]]`).join('')}のCX`;
  if (keys === 'color') return `${{ red: '赤', blue: '青', yellow: '黄', green: '緑' }[filter.color!] ?? fail('colour', filter)}のカード`;
  if (keys === 'kind,powerMax' && filter.kind === 'CHARACTER') return `パワー${filter.powerMax}以下のキャラ`;
  if (keys === 'nameIncludesAny' || keys === 'kind,nameIncludesAny') return `カード名に${filter.nameIncludesAny!.map((x) => `「${x}」`).join('か')}を含むキャラ`;
  if (keys === 'kind,nameExcludes,traits' && filter.traits!.length === 1) return `、カード名に「${filter.nameExcludes}」を含まない《${filter.traits![0]}》のキャラ`;
  if (keys === 'nameIncludes' || keys === 'kind,nameIncludes') return `カード名に「${filter.nameIncludes}」を含むキャラ`;
  if (keys === 'levelAboveMasterLevel') return 'レベルが相手のレベルより高いキャラ';
  if (keys === 'kind,levelAtMostOwnLevel' && filter.kind === 'CHARACTER') return '自分のレベル以下のレベルのキャラ';
  if (keys === 'hasRecollection,kind' && filter.kind === 'CHARACTER') return '『回想』を持つキャラ';
  if (keys === 'hasLink,kind' && filter.kind === 'CHARACTER') return `『【リンク】 ${filter.hasLink}』を持つキャラ`;
  const rest = { ...filter };
  let text = '';
  if (rest.levelMax !== undefined) text += `レベル${rest.levelMax}以下の`;
  else if (rest.levelMin !== undefined) text += `レベル${rest.levelMin}以上の`;
  else if (rest.costMax !== undefined) text += `コスト${rest.costMax}以下の`;
  if (rest.traits) text += `${rest.traits.map((trait) => `《${trait}》`).join('か')}の`;
  const noun = rest.kind === 'CHARACTER' ? 'キャラ' : rest.kind === 'CLIMAX' ? 'CX' : rest.kind === 'EVENT' ? 'イベント' : rest.kind === undefined ? 'カード' : fail('kind', rest.kind);
  for (const key of ['levelMax', 'levelMin', 'costMax', 'traits', 'kind'] as const) delete rest[key];
  if (Object.keys(rest).length > 0 || (filter.levelMax !== undefined && filter.levelMin !== undefined)) fail('filter', filter);
  return text + noun;
}

export function triggerJa(trigger: Trigger): string {
  switch (trigger.on) {
    case 'PLACED_ON_STAGE':
      return trigger.from === 'HAND' ? 'このカードが手札から舞台に置かれた時' : trigger.from === 'HAND_OR_MEMORY' ? 'このカードが手札か思い出置場から舞台に置かれた時' : fail('trigger', trigger);
    case 'ATTACKS':
      if (trigger.attackType === 'DIRECT') return trigger.placedThisTurn ? fail('trigger', trigger) : 'このカードがダイレクトアタックした時';
      return `${trigger.placedThisTurn ? 'このカードが手札から舞台に置かれたターン中、' : ''}このカードがアタックした時`;
    case 'ATTACK_END':
      return 'このカードのアタックの終わりに';
    case 'OPPONENT_PLAYED_ACT':
      return '相手が【起】を使った時';
    case 'YOU_PLAYED_ACT':
      return 'あなたが【起】を使った時';
    case 'TAKEN_DAMAGE_NOT_CANCELLED':
      return 'あなたの受けたダメージがキャンセルされなかった時';
    case 'THIS_TRIGGERED':
      return 'このカードがトリガーした時';
    case 'DEALT_DAMAGE_CANCELLED':
      return 'このカードの与えたダメージがキャンセルされた時';
    case 'TAKEN_DAMAGE_CANCELLED_IN_BATTLE':
      return 'このカードのバトル中、あなたの受けたダメージがキャンセルされた時';
    case 'EITHER':
    {
      // …した時か…した時: when both parts have the subject "このカードが", it is said once. "このカードのアタックの終わりに"
      // joins as "…終わりか", and the next part keeps its subject.
      const texts = trigger.of.map(triggerJa);
      const shared = texts.every((t) => t.startsWith('このカードが'));
      return texts.map((t, i) => (i > 0 && shared ? t.replace(/^このカードが/, '') : t)).join('か').replace(/終わりにか/, '終わりか');
    }
    case 'USED_BACKUP':
      return 'あなたがこのカードの『助太刀』を使った時';
    case 'BATTLE_OPPONENT_REVERSED':
      if (!trigger.filter) return `${trigger.placedThisTurn ? 'このカードが手札から舞台に置かれたターン中、' : ''}このカードのバトル相手が【リバース】した時`;
      return Object.keys(trigger.filter).join() === 'levelMin' ? `このカードのバトル相手でレベル${trigger.filter.levelMin}以上のキャラが【リバース】した時` : fail('trigger', trigger);
    case 'REVERSED':
      return trigger.inBattle ? fail('trigger', trigger) : 'このカードが【リバース】した時';
    case 'STAGE_TO_WAITING_ROOM':
      return 'このカードが舞台から控え室に置かれた時';
    case 'CLIMAX_PLACED':
      if (trigger.opponent) return trigger.filter ? fail('trigger', trigger) : '相手のCXがCX置場に置かれた時';
      if (!trigger.filter) return 'あなたのCXがCX置場に置かれた時';
      if (['hasTrigger,kind', 'kind,triggersExactly'].includes(Object.keys(trigger.filter).sort().join())) return `あなたの${filterJa(trigger.filter, 'ZONE')}がCX置場に置かれた時`;
      if (Object.keys(trigger.filter).join() !== 'name') return fail('trigger', trigger);
      return trigger.duringClimaxPhase ? `あなたのCXフェイズ中、CX置場に「${trigger.filter.name}」が置かれた時` : `あなたのCX置場に「${trigger.filter.name}」が置かれた時`;
    case 'PHASE_START':
      if (trigger.placedThisTurn) return trigger.turn === 'YOURS' && trigger.phase === 'CLIMAX' ? 'このカードが手札から舞台に置かれたターン中、あなたのCXフェイズの始めに' : fail('trigger', trigger);
      if (trigger.turn === 'OPPONENT' && trigger.phase === 'ATTACK') return '相手のアタックフェイズの始めに';
      if (trigger.turn !== 'YOURS') return fail('trigger', trigger);
      return trigger.phase === 'CLIMAX' ? 'あなたのCXフェイズの始めに' : trigger.phase === 'ATTACK' ? 'あなたのアタックフェイズの始めに' : fail('trigger', trigger);
    case 'STEP_START':
      return trigger.step === 'ENCORE' && trigger.turn === 'YOURS' ? 'あなたのアンコールステップの始めに' : fail('trigger', trigger);
    case 'OTHER_FRONT_ATTACKED':
      if (trigger.slots) return trigger.slots.join() === 'FC' ? `他のあなたの前列の中央の枠の${filterJa(trigger.filter, 'STAGE')}がフロントアタックされた時` : fail('trigger', trigger);
      return `他のあなたの${filterJa(trigger.filter, 'STAGE')}がフロントアタックされた時`;
    case 'THIS_CLIMAX_PLACED':
      return 'このカードが手札からCX置場に置かれた時';
    case 'TRIGGER_CHECK_REVEALS':
      if (trigger.ofThisCard) return `このカードのトリガーチェックで${filterJa(trigger.filter, 'ZONE')}がでた時`;
      if (trigger.filter && Object.keys(trigger.filter).sort().join() === 'hasTrigger,kind') return `あなたの${filterJa(trigger.filter, 'ZONE')}がトリガーした時`;
      if (trigger.filter?.anyOf && Object.keys(trigger.filter).length === 1) return `あなたの、${filterJa(trigger.filter, 'ZONE')}がトリガーした時`;
      return trigger.filter && Object.keys(trigger.filter).join() === 'kind' && trigger.filter.kind === 'CLIMAX' ? 'あなたのCXがトリガーした時' : fail('trigger', trigger);
    case 'HOLDER_ATTACKS':
      return `マーカー置場にこのカードがあるなら、このマーカーを持つ舞台の${filterJa(trigger.filter, 'STAGE')}がアタックした時`;
    case 'OTHER_ATTACKS':
      return `他のあなたの${filterJa(trigger.filter, 'STAGE')}がアタックした時`;
    case 'OTHER_STAGE_TO_WAITING_ROOM':
      return `他のあなたの${filterJa(trigger.filter, 'STAGE')}が舞台から控え室に置かれた時`;
    default:
      return fail('trigger', trigger);
  }
}

export function costJa(cost: Cost): string {
  switch (cost.pay) {
    case 'STOCK':
      // The official text writes a stock cost of 10 or more as a circled number (⑩, NIK/S135-065, the only one).
      return cost.count >= 10 && cost.count <= 20 ? String.fromCharCode(0x245f + cost.count) : `(${cost.count})`;
    case 'REST_SELF':
      return 'このカードを【レスト】する';
    case 'SELF_TO_WAITING_ROOM':
      return `${cost.standing ? '【スタンド】している' : ''}このカードを控え室に置く`;
    case 'SELF_TO_MEMORY':
      return `${cost.standing ? '【スタンド】している' : ''}このカードを思い出にする`;
    case 'SELF_TO_HAND':
      return 'このカードを手札に戻す';
    case 'CLIMAX_TO_WAITING_ROOM': {
      const f = cost.filter ?? {};
      const what = Object.keys(f).join() === 'name' ? `「${f.name}」` : f.kind === 'CLIMAX' && f.color ? `${{ red: '赤', blue: '青', yellow: '黄', green: '緑' }[f.color]}のCX` : fail('cost', cost);
      return `あなたのCX置場の${what}を${cost.count}枚控え室に置く`;
    }
    case 'MARKERS_TO_WAITING_ROOM':
      return `このカードの下のマーカーを${cost.count}枚控え室に置く`;
    case 'SELF_TO_MARKER':
      return `このカードを表向きで他のあなたの「${cost.underName}」のマーカーにする`;
    case 'SELF_TO_CLOCK':
      return `${cost.standing ? '【スタンド】している' : ''}このカードをクロック置場に置く`;
    case 'SELF_TO_STOCK_BOTTOM':
      return 'このカードをストック置場の下に置く';
    case 'SELF_TO_DECK_BOTTOM':
      return `${cost.standing ? '【スタンド】している' : ''}このカードを山札の下に置く`;
    case 'DECK_TOP_TO_CLOCK':
      return 'あなたの山札の上から1枚をクロック置場に置く';
    case 'DISCARD':
      return cost.filter ? `手札の${filterJa(cost.filter, 'ZONE')}を${cost.count}枚控え室に置く` : `手札を${cost.count}枚控え室に置く`;
    case 'HAND_TO_CLOCK':
      return cost.filter ? fail('cost', cost) : `手札を${cost.count}枚クロック置場に置く`;
    case 'CHARACTERS_TO_WAITING_ROOM':
      return `${cost.other ? '他の' : ''}あなたの舞台の${cost.standing ? '【スタンド】している' : ''}${filterJa(cost.filter, 'STAGE')}を${cost.count}枚${cost.toMemory ? '思い出にする' : '控え室に置く'}`;
    case 'LEVEL_FACE_DOWN':
      return `あなたのレベル置場の表向きのカードを${cost.count}枚裏向きにする`;
    case 'REST_CHARACTERS':
      return `${cost.other ? '他の' : ''}あなたの【スタンド】している${filterJa(cost.filter, 'STAGE')}を${cost.count}枚【レスト】する`;
    default:
      return fail('cost', cost);
  }
}

/** A cost list as printed inside ［…］: actions joined in their joining form. */
export function costsJa(costs: readonly Cost[]): string {
  const texts = costs.map(costJa);
  const stock = costs[0]?.pay === 'STOCK' ? `${texts.shift()} ` : '';
  return (stock + texts.map((text, i) => (i < texts.length - 1 ? text.replace(/置く$/, '置き').replace(/する$/, 'し') : text)).join('、')).trim();
}

/** A condition in its plain form ("…がいる"), without "なら". */
function oneConditionJa(c: Condition): string {
  switch (c.if) {
    case 'YOUR_TURN':
      return 'あなたのターン中';
    case 'OPPONENT_TURN':
      return '相手のターン中';
    case 'CHARACTERS':
      return `${c.other ? '他の' : ''}あなたの${filterJa(c.filter, 'STAGE')}が${c.min === 1 ? 'いる' : `${c.min}枚以上`}`;
    case 'MEMORY':
      return c.filter && Object.keys(c.filter).join() === 'name' && c.min === 1 ? `あなたの思い出置場に「${c.filter.name}」がある` : fail('condition', c);
    case 'MARKERS':
      if (c.of !== 'SELF') return fail('condition', c);
      if (c.distinctNames && c.min !== undefined && c.max === undefined) return `このカードの下の異なるカード名のマーカーが${c.min}枚以上`;
      if (!c.distinctNames && c.min === 1 && c.max === undefined) return 'このカードの下にマーカーがある';
      if (!c.distinctNames && c.max === 0 && c.min === undefined) return 'このカードの下にマーカーがない';
      return fail('condition', c);
    case 'COUNT': {
      if (c.where === 'YOUR_FRONT_ROW' && c.other && c.max === 0 && !c.filter && c.min === undefined) return '他のあなたの前列のキャラがいない';
      const bound = c.min !== undefined && c.max === undefined ? (c.min === 1 && c.where !== 'YOUR_WAITING_ROOM' && c.where !== 'YOUR_HAND' && c.where !== 'YOUR_MEMORY' ? (c.where === 'YOUR_CLIMAX' ? 'がある' : 'がいる') : `が${c.min}枚以上`) : c.max !== undefined && c.min === undefined ? `が${c.max}枚以下` : fail('condition', c);
      if (c.where === 'YOUR_MEMORY_AND_MARKERS') return c.filter ? fail('condition', c) : c.max === 0 && c.min === undefined ? 'あなたの、思い出とマーカー置場にカードがない' : `あなたの、思い出とマーカー置場のカードの合計${bound}`;
      if (c.where === 'YOUR_WAITING_ROOM') return `あなたの控え室の${filterJa(c.filter, 'ZONE')}${bound}`;
      if (c.where === 'YOUR_MEMORY' && c.filter && Object.keys(c.filter).join() === 'name' && c.min === 1 && c.max === undefined) return `あなたの思い出置場に「${c.filter.name}」がある`;
      if (c.where === 'YOUR_HAND' || c.where === 'YOUR_MEMORY') return c.filter ? fail('condition', c) : `あなたの${c.where === 'YOUR_HAND' ? '手札' : '思い出'}${bound}`;
      if (c.where === 'YOUR_CLIMAX') return `あなたのCX置場に${filterJa(c.filter, 'ZONE')}${bound}`;
      if (c.where === 'YOUR_FRONT_ROW') return `${c.other ? '他の' : ''}あなたの前列の${filterJa(c.filter, 'STAGE')}${bound}`;
      return `相手の${c.where === 'OPPONENT_FRONT_ROW' ? '前列の' : ''}${filterJa(c.filter, 'STAGE')}${bound}`;
    }
    case 'ANY': {
      const [a, b] = c.of;
      if (c.of.length !== 2 || !a || !b) return fail('condition', c);
      // あなたか相手の…がいる; …がN枚以下かM枚以上; otherwise the two conditions joined by か.
      if (a.if === 'CHARACTERS' && b.if === 'COUNT' && b.where === 'OPPONENT_STAGE' && JSON.stringify(a.filter) === JSON.stringify(b.filter) && a.min === 1 && b.min === 1 && !a.other) return `あなたか相手の${filterJa(a.filter, 'STAGE')}がいる`;
      const [ta, tb] = [oneConditionJa(a), oneConditionJa(b)];
      const split = (t: string) => /^(.+が)(\d+枚以[上下])$/.exec(t);
      const [sa, sb] = [split(ta), split(tb)];
      return sa && sb && sa[1] === sb[1] ? `${ta}か${sb[2]}` : `${ta}か${tb}`;
    }
    case 'NOT':
      return c.of.if === 'CHARACTERS' && c.of.min === 1 ? oneConditionJa(c.of).replace(/がいる$/, 'がいない') : fail('condition', c);
    case 'FIRST_PLAYER_TURN':
      return `先攻プレイヤーの第${c.turn}ターン`;
    case 'CLIMAX_IN_PLAY':
      if (c.opponent) return c.name === undefined ? '相手のCX置場にCXがある' : fail('condition', c);
      return c.name !== undefined ? `CX置場に「${c.name}」がある` : 'あなたのCX置場にCXがある';
    case 'LEVEL':
      if (c.whose === 'OPPONENT') return c.max === undefined ? `相手のレベルが${c.min}以上` : c.max === c.min ? `相手のレベルが${c.min}` : fail('condition', c);
      return `あなたのレベルが${c.min}以上`;
    case 'STOCK':
      return `あなたのストックが${c.max}枚以下`;
    case 'ALL_CHARACTERS':
      return c.filter.kind === 'CHARACTER' && c.filter.traits && Object.keys(c.filter).length === 2 ? `あなたのキャラすべてが${c.filter.traits.map((t) => `《${t}》`).join('か')}` : fail('condition', c);
    case 'EXPERIENCE':
      return `あなたのレベル置場のカードのレベルの合計が${c.min}以上`;
    case 'SELF_IN_SLOT': {
      const slots = c.slots.join();
      const row = slots === 'FC' ? '前列の中央の枠' : slots === 'FL,FC,FR' ? '前列' : slots === 'BL,BR' ? '後列' : fail('condition', c);
      return `${row}にこのカードがいる`;
    }
    case 'BATTLE_OPPONENT': {
      const f = c.filter;
      if (f.levelAboveMasterLevel) return 'このカードのバトル相手のレベルが相手のレベルより高い';
      if (f.costMax !== undefined) return `このカードのバトル相手のコストが${f.costMax}以下`;
      if (f.levelMax !== undefined) return `このカードのバトル相手のレベルが${f.levelMax}以下`;
      if (f.levelMin !== undefined) return `このカードのバトル相手のレベルが${f.levelMin}以上`;
      return fail('condition', c);
    }
    case 'FACING': {
      const f = c.filter;
      if (f.color !== undefined && Object.keys(f).length === 1) return `このカードの正面のキャラが${{ red: '赤', blue: '青', yellow: '黄', green: '緑' }[f.color] ?? fail('colour', c)}`;
      if (f.costMin !== undefined) return `このカードの正面のキャラのコストが${f.costMin}以上`;
      if (f.levelMin !== undefined && f.levelMax !== undefined) return f.levelMin === f.levelMax ? `このカードの正面のキャラのレベルが${f.levelMin}` : fail('condition', c);
      if (f.levelMin !== undefined) return `このカードの正面のキャラのレベルが${f.levelMin}以上`;
      if (f.levelMax !== undefined) return `このカードの正面のキャラのレベルが${f.levelMax}以下`;
      return fail('condition', c);
    }
    default:
      return fail('condition', c);
  }
}

/** Conditions before the effect: "…があり、…がいて、…なら、" (empty when there is none). */
export function conditionJa(condition: Condition | undefined): string {
  if (!condition) return '';
  const all = condition.if === 'ALL' ? condition.of : [condition];
  // あなたの「A」と「B」がいる: two named characters are said together.
  const named = (c: Condition | undefined): string | undefined => (c?.if === 'CHARACTERS' && c.min === 1 && !c.other && c.filter && Object.keys(c.filter).join() === 'name' ? c.filter.name : undefined);
  const parts: (Condition | string)[] = [];
  for (let k = 0; k < all.length; k++) {
    const [a, b] = [named(all[k]), named(all[k + 1])];
    const frontNamed = (c: Condition | undefined): string | undefined => (c?.if === 'COUNT' && c.where === 'YOUR_FRONT_ROW' && c.other && c.min === 1 && c.max === undefined && c.filter && Object.keys(c.filter).join() === 'name' ? c.filter.name : undefined);
    const [fa, fb] = [frontNamed(all[k]), frontNamed(all[k + 1])];
    if (a !== undefined && b !== undefined) {
      parts.push(`あなたの「${a}」と「${b}」がいる`);
      k++;
    } else if (fa !== undefined && fb !== undefined) {
      parts.push(`他のあなたの前列の、「${fa}」と「${fb}」がいる`);
      k++;
    } else parts.push(all[k]!);
  }
  // すべてのプレイヤーのレベルがN以上: yours and the opponent's, said once.
  for (let k = 0; k < parts.length - 1; k++) {
    const [a, b] = [parts[k], parts[k + 1]];
    if (typeof a === 'object' && typeof b === 'object' && a.if === 'LEVEL' && b.if === 'LEVEL' && !a.whose && b.whose === 'OPPONENT' && a.min === b.min && a.max === undefined && b.max === undefined) parts.splice(k, 2, `すべてのプレイヤーのレベルが${a.min}以上`);
  }
  return parts
    .map((part, i) => {
      const text = typeof part === 'string' ? part : oneConditionJa(part);
      if (typeof part === 'string') return i === parts.length - 1 ? `${text}なら、` : `${text.slice(0, -1)}て、`;
      // "あなたのターン中、" stands before the rest and takes no "なら".
      if (part.if === 'YOUR_TURN' || part.if === 'OPPONENT_TURN') return i === 0 ? `${text}、` : fail('condition order', condition);
      if (i === parts.length - 1) return `${text}なら、`;
      if (text.endsWith('がある')) return `${text.slice(0, -1)}り、`;
      if (text.endsWith('がいる')) return `${text.slice(0, -1)}て、`;
      if (text.endsWith('》') || /以[上下]$/.test(text)) return `${text}で、`;
      return fail('condition join', part);
    })
    .join('');
}

const DESTINATION: Record<string, string> = {
  SOURCE_SLOT: 'このカードがいた枠に置く',
  HAND: '手札に戻す',
  WAITING_ROOM: '控え室に置く',
  STOCK: 'ストック置場に置く',
  STOCK_BOTTOM: 'ストック置場の下に置く',
  CLOCK: 'クロック置場に置く',
  MEMORY: '思い出にする',
  DECK_BOTTOM: '山札の下に置く',
  DECK_TOP: '山札の上に置く',
};
const ORIENT: Record<string, string> = { STAND: '【スタンド】する', REST: '【レスト】する', REVERSE: '【リバース】する' };
const STAT: Record<string, string> = { POWER: 'パワー', SOUL: 'ソウル', LEVEL: 'レベル' };
const sameTarget = (a: Target, b: Target) => JSON.stringify(a) === JSON.stringify(b);

/**
 * What is done to one target, starting at effects[i]: a move, a turn, or
 * number changes (and an ability given) for a time. Returns the words and
 * how many effects they cover.
 */
function actionJa(effects: readonly Effect[], i: number, target: Target): { text: string; used: number } {
  const e = effects[i]!;
  if (e.do === 'CHOOSE_SLOT' && e.which === 'ANY') {
    const move = effects[i + 1];
    return move?.do === 'MOVE' && move.to === 'CHOSEN_SLOT' && sameTarget(move.target, target) ? { text: move.rested ? '舞台の好きな枠に【レスト】して置く' : '舞台の好きな枠に置く', used: 2 } : fail('slot', effects);
  }
  if (e.do === 'PLACE_IN_EMPTY_SLOT' && sameTarget(e.target, target)) return { text: '舞台のキャラのいない枠に置く', used: 1 };
  if (e.do === 'MOVE' && sameTarget(e.target, target) && e.inOrder && (e.to === 'STOCK' || e.to === 'STOCK_BOTTOM') && !e.reveal && !e.rested) return { text: e.to === 'STOCK' ? 'ストック置場に好きな順番で置く' : 'ストック置場の下に好きな順番で置く', used: 1 };
  if (e.do === 'MOVE' && sameTarget(e.target, target) && e.to === 'DECK' && effects[i + 1]?.do === 'SHUFFLE') return { text: '山札に戻し、その山札をシャッフルする', used: 2 };
  if (e.do === 'MOVE' && sameTarget(e.target, target) && e.to === 'UNDER_SELF') return { text: `このカードの下にマーカーとして${e.face === 'UP' ? '表' : '裏'}向きに置く`, used: 1 };
  if (e.do === 'MOVE' && sameTarget(e.target, target) && !e.reveal && !e.rested && DESTINATION[e.to]) return { text: e.orTo ? `${DESTINATION[e.to]}か${DESTINATION[e.orTo] ?? fail('destination', e)}` : DESTINATION[e.to]!, used: 1 };
  const row = (x: Effect | undefined) => (x?.do === 'MOVE_TO_SLOT' && sameTarget(x.target, target) ? `${x.row === 'FRONT' ? '前列' : '後列'}のキャラのいない枠に動かす` : null);
  if (e.do === 'ORIENT' && sameTarget(e.target, target) && row(effects[i + 1])) return { text: `${ORIENT[e.to]!.replace(/する$/, '')}し、${row(effects[i + 1])}`, used: 2 };
  if (row(e)) return { text: row(e)!, used: 1 };
  if (e.do === 'ORIENT' && sameTarget(e.target, target)) return { text: ORIENT[e.to]!, used: 1 };
  if ((e.do === 'MODIFY' || e.do === 'GRANT') && sameTarget(e.target, target)) {
    const until = e.until;
    const pieces: string[] = [];
    let used = 0;
    for (let k = i; k < effects.length; k++) {
      const x = effects[k]!;
      if (x.do === 'MODIFY' && sameTarget(x.target, target) && x.until === until && !x.per) pieces.push(`${STAT[x.stat]}を${signed(x.amount)}`);
      else if (x.do === 'GRANT' && sameTarget(x.target, target) && x.until === until && x.ability.type === 'CONT' && x.ability.giveTraits) {
        pieces.push(`${x.ability.giveTraits.traits.map((t) => `《${t}》`).join('')}を与える`);
        used++;
        break;
      } else if (x.do === 'GRANT' && sameTarget(x.target, target) && x.until === until) {
        pieces.push(`『${abilityJa(x.ability)}』を与える`);
        used++;
        break;
      } else break;
      used++;
    }
    return { text: `${until === 'NEXT_OPPONENT_TURN' ? '次の相手のターンの終わりまで' : 'そのターン中'}、${pieces.join('し、')}`, used };
  }
  return fail('action', e);
}

const count = (e: { min: number; max: number }): string => (e.min === e.max ? `${e.max}枚` : e.min === 0 ? `${e.max}枚まで` : fail('count', e));

/** The effect sentences for a list of effects, each without "あなたは" and "。". */
const X_MARK = 7777;
/** "Ｘは…に等しい" for a SET_X. */
function xCountJa(set: Extract<Effect, { do: 'SET_X' }>): string {
  const c = set.count;
  const f = c.filter ? Object.keys(c.filter).sort().join() : '';
  if (c.of === 'MOVED' && f === 'kind' && c.filter!.kind === 'CLIMAX' && !set.plus && !set.minus && !set.tiers) return 'ＸはそれらのカードのCXの枚数に等しい';
  if (c.of === 'OPPONENT_WAITING_ROOM' && f === 'kind' && c.filter!.kind === 'CLIMAX' && set.minus && !set.plus && !set.tiers) return `Ｘは相手の控え室のCXの枚数－${set.minus}に等しい`;
  if (c.of === 'MARKERS' && c.distinctNames && !c.filter && set.plus && !set.tiers) return `Ｘはこのカードの下の異なるカード名のマーカーの枚数＋${set.plus}に等しい`;
  if (c.of === 'MARKERS' && c.distinctNames && !c.filter && set.tiers?.length === 2 && set.tiers[0]!.max !== undefined && set.tiers[1]!.min !== undefined) return `Ｘはこのカードの下の異なるカード名のマーカーが${set.tiers[0]!.max}枚以下なら${set.tiers[0]!.x}、${set.tiers[1]!.min}枚以上なら${set.tiers[1]!.x}に等しい`;
  if (c.of === 'YOUR_MEMORY' && f === 'names' && c.filter!.names!.length === 2) return `Ｘはあなたの思い出置場の、「${c.filter!.names![0]}」と「${c.filter!.names![1]}」の枚数に等しい`;
  return fail('x', set);
}
/** The X fields back as the placeholder number, so the sentences can be written with it. */
function unmarkX(list: readonly Effect[]): Effect[] {
  return list.map((e) => {
    if (e.do === 'DAMAGE' && e.amountX) return { ...e, amount: X_MARK, amountX: undefined } as Effect;
    if (e.do === 'REPEAT') return { ...e, effects: unmarkX(e.effects), ...(e.timesX ? { times: X_MARK, timesX: undefined } : {}) } as Effect;
    if (e.do === 'DECK_TOP' && e.countX) return { ...e, count: X_MARK, countX: undefined } as Effect;
    if (e.do === 'CHOOSE' && e.maxX) return { ...e, max: X_MARK, maxX: undefined } as Effect;
    if (e.do === 'REORDER_TOP' && e.x) return { ...e, upTo: X_MARK, keep: X_MARK, x: undefined } as Effect;
    if (e.do === 'IF') return { ...e, then: unmarkX(e.then) } as Effect;
    return e;
  });
}

export function effectsJa(effects: readonly Effect[]): string[] {
  // Ｘ set by SET_X: the sentences with Ｘ, then "Ｘは…に等しい".
  const setX = effects.find((e): e is Extract<Effect, { do: 'SET_X' }> => e.do === 'SET_X');
  if (setX) {
    const strip = (o: unknown): unknown => (Array.isArray(o) ? o.map(strip) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, strip(v)])) : o);
    const rest = strip(unmarkX(effects.filter((e) => e !== setX))) as Effect[];
    return [...effectsJa(rest).map((t) => t.replaceAll(String(X_MARK), 'Ｘ')), xCountJa(setX)];
  }
  // Ｘ made by the first effect and used by what follows: one sentence, then "Ｘは…に等しい".
  const maker = effects[0];
  if (maker && ((maker.do === 'DECK_TOP' && maker.setX) || maker.do === 'SHOW_TOP')) {
    const rest = effects.slice(1);
    const use = rest[0];
    let usesText: string;
    let times = 1;
    if (use?.do === 'MODIFY' && use.timesX && use.target.who === 'SELF' && rest.length === 1) {
      usesText = `そのターン中、このカードの${STAT[use.stat]}を＋Ｘ`;
      times = use.amount;
    } else if (use?.do === 'CHOOSE' && use.levelMaxX) {
      const plain = effectsJa([{ ...use, levelMaxX: false } as Effect, ...rest.slice(1)]);
      if (plain.length !== 1) fail('x', effects);
      usesText = plain[0]!.replace(/(控え室の)(、?)/, '$1レベルＸ以下の$2');
    } else return fail('x', effects);
    const made = maker.do === 'DECK_TOP' ? `自分の山札の上から${maker.count}枚を、控え室に置き、` : '自分の山札の上から1枚を公開し、';
    const xIs = maker.do === 'DECK_TOP' ? 'それらのカードのレベルの合計' : '公開されたカードのレベル';
    return [`${made}${usesText}`, `Ｘは${xIs}${times > 1 ? `×${times}` : ''}に等しい`];
  }
  const sentences: string[] = [];
  for (let i = 0; i < effects.length; ) {
    const e = effects[i]!;
    // ＋Ｘ where Ｘ is counted from the opponent's characters.
    if (e.do === 'MODIFY' && e.perCount) {
      if (e.perCount.where !== 'OPPONENT_STAGE' || e.perCount.filter) fail('perCount', e);
      const before = effectsJa([{ ...e, perCount: undefined, amount: 1 } as Effect, ...effects.slice(i + 1)]);
      sentences.push(...before.map((t) => t.replace('＋1', '＋Ｘ')), `Ｘは相手のキャラの枚数×${e.amount}に等しい`);
      return sentences;
    }
    const self: Target = { who: 'SELF' };
    if (e.do === 'CHOOSE' && effects[i + 1]?.do === 'MODIFY' && (effects[i + 1] as { per?: unknown }).per) {
      const mod = effects[i + 1] as Extract<Effect, { do: 'MODIFY' }>;
      const plain = effectsJa([e, { ...mod, per: undefined, amount: 1 } as Effect]);
      sentences.push(...plain.map((t) => t.replace('＋1', '＋Ｘ')), `Ｘは${mod.per!.other ? '他の' : ''}あなたの${filterJa(mod.per!.filter, 'STAGE')}の枚数×${mod.amount}に等しい`);
      i += 2;
      continue;
    }
    if (e.do === 'CHOOSE') {
      if (e.from === 'OPPONENT_WAITING_ROOM' && effects[i + 1]?.do === 'MOVE' && (effects[i + 1] as { to: string }).to === 'DECK' && effects[i + 2]?.do === 'SHUFFLE' && (effects[i + 2] as { whose?: string }).whose === 'OPPONENT') {
        const rest = effectsJa(effects.slice(i + 3));
        sentences.push(`相手の控え室の${filterJa(e.filter, 'ZONE')}を${count(e)}選び、山札に戻し、相手はその山札をシャッフルし、${rest[0]}`, ...rest.slice(1));
        i = effects.length;
        continue;
      }
      const given = effects[i + 1];
      if (e.from === 'BATTLING' && given?.do === 'GRANT' && given.ability.type === 'CONT' && given.ability.noDamageToPlayers && !given.until) {
        sentences.push(`バトル中のキャラを${count(e)}選び、そのターン中、次の能力を与える。『【永】 このカードはプレイヤーにダメージを与えることができない。』`);
        i += 2;
        continue;
      }
      if (e.from === 'YOUR_DECK' && given?.do === 'MOVE' && given.to === 'WAITING_ROOM' && given.target.who === 'CHOSEN' && !given.reveal && effects[i + 2]?.do === 'SHUFFLE') {
        sentences.push(`自分の山札を見て${filterJa(e.filter, 'ZONE')}を${count(e)}選び、控え室に置く`, 'その山札をシャッフルする');
        i += 3;
        continue;
      }
      if (e.from === 'YOUR_WAITING_ROOM' && given?.do === 'CHOOSE_SLOT' && effects[i + 2]?.do === 'MOVE' && effects[i + 3]?.do === 'MODIFY' && (effects[i + 3] as { target: Target }).target.who === 'MOVED') {
        const mod = effects[i + 3] as Extract<Effect, { do: 'MODIFY' }>;
        sentences.push(`自分の控え室の${filterJa(e.filter, 'ZONE')}を${count(e)}選び、舞台の好きな枠に置き、そのターン中、そのキャラの${STAT[mod.stat]}を${signed(mod.amount)}`);
        i += 4;
        continue;
      }
      const noStand = effects[i + 1];
      if (noStand?.do === 'GRANT' && noStand.target.who === 'CHOSEN' && noStand.ability.type === 'CONT' && noStand.ability.noStand && noStand.until === 'NEXT_OPPONENT_TURN' && e.min === e.max) {
        const row = e.from === 'OPPONENT_FRONT_ROW' ? '前列の' : e.from === 'OPPONENT_BACK_ROW' ? '後列の' : e.from === 'OPPONENT_STAGE' ? '' : fail('choose', e);
        sentences.push(`相手の${row}${filterJa(e.filter, 'STAGE')}を${e.max}枚選ぶ`, 'そのキャラは次の相手のスタンドフェイズに【スタンド】しない');
        i += 2;
        continue;
      }
      if (e.from === 'YOUR_MEMORY' && effects[i + 1]?.do === 'MOVE' && (effects[i + 1] as { to: string }).to === 'SOURCE_SLOT' && effects[i + 2]?.do === 'MODIFY' && (effects[i + 2] as { target: Target }).target.who === 'MOVED') {
        const mod = effects[i + 2] as Extract<Effect, { do: 'MODIFY' }>;
        if (mod.until !== 'NEXT_OPPONENT_TURN' || mod.stat !== 'POWER') fail('memory', mod);
        sentences.push(`自分の思い出置場の${filterJa(e.filter, 'ZONE')}を${count(e)}選び、このカードがいた枠に置き、次の相手のターンの終わりまで、そのキャラのパワーを${signed(mod.amount)}`);
        i += 3;
        continue;
      }
      const after = effects[i + 1];
      const back = effects[i + 2];
      if (e.from === 'OPPONENT_STAGE' && !e.filter && after?.do === 'MOVE' && after.to === 'MEMORY' && after.target.who === 'CHOSEN') {
        const owner = back?.do === 'OWNER_PLACES' ? back : back?.do === 'DELAYED' && back.at.step === 'ENCORE' && back.effects.length === 1 && back.effects[0]!.do === 'OWNER_PLACES' ? back.effects[0] : null;
        if (owner) {
          sentences.push(`相手のキャラを${count(e)}選び、思い出にし、${back!.do === 'DELAYED' ? 'アンコールステップの始めに、' : ''}相手は自分の思い出置場のそのキャラを、舞台の好きな枠に置く`);
          i += 3;
          continue;
        }
      }
      if (after?.do === 'SWAP_CHOSEN') {
        if (after.withSelf && e.from === 'YOUR_STAGE' && e.other && e.min === 1 && e.max === 1) sentences.push(`自分の${filterJa(e.filter, 'STAGE')}を1枚とこのカードを選び、それぞれを【スタンド】して入れ替える`);
        else if (!after.withSelf && e.from === 'OPPONENT_STAGE' && !e.filter && e.min === 2 && e.max === 2) sentences.push('相手のキャラを2枚選び、それぞれを【スタンド】して入れ替える');
        else fail('swap', after);
        i += 2;
        continue;
      }
      if (e.sameNameAsMoved) {
        if (e.from !== 'YOUR_WAITING_ROOM' || Object.keys(e.filter ?? {}).join() !== 'kind') fail('same name', e);
        const action = actionJa(effects, i + 1, { who: 'CHOSEN' });
        sentences.push(`自分の控え室のその手札に戻したキャラと同じカード名のキャラを${count(e)}選び、${action.text}`);
        i += 1 + action.used;
        continue;
      }
      const split = effects[i + 1];
      if (split?.do === 'SPLIT_CHOSEN') {
        const restPlace: Record<string, string> = { STOCK_BOTTOM: 'ストック置場の下に置く', STOCK: 'ストック置場に置く', WAITING_ROOM: '控え室に置く', MEMORY: '思い出にする' };
        const rest = restPlace[split.rest] ?? fail('split', split);
        if (e.from === 'YOUR_DECK' && split.reveal && split.exact && split.to === 'HAND' && !split.inOrder && effects[i + 2]?.do === 'SHUFFLE') {
          sentences.push(`自分の山札を見て${filterJa(e.filter, 'ZONE')}を${count(e)}選び、公開し、${split.take}枚手札に加え、残りのカードを${rest}`, 'その山札をシャッフルする');
          i += 3;
          continue;
        }
        if (e.from === 'YOUR_WAITING_ROOM' && split.exact && !split.inOrder && !split.reveal && split.to === 'HAND') {
          const restWord: Record<string, string> = { STOCK_BOTTOM: 'ストック置場の下に置く', STOCK: 'ストック置場に置く', WAITING_ROOM: '控え室に置く' };
          sentences.push(`自分の控え室の${filterJa(e.filter, 'ZONE')}を${count(e)}選び、${split.take}枚手札に戻し、残りのカードを${restWord[split.rest] ?? fail('split', split)}`);
          i += 2;
          continue;
        }
        if (e.from === 'YOUR_WAITING_ROOM' && split.inOrder && !split.exact && !split.reveal && split.to === 'STOCK') {
          sentences.push(`自分の控え室の${filterJa(e.filter, 'ZONE')}を${count(e)}選び、${split.take}枚までストック置場に好きな順番で置く`, `残りのカードを${rest}`);
          i += 2;
          continue;
        }
        fail('split', split);
      }
      if (e.from === 'YOUR_DECK') {
        const [move, shuffle] = [effects[i + 1], effects[i + 2]];
        if (e.min !== 0 || move?.do !== 'MOVE' || move.to !== 'HAND' || !move.reveal || shuffle?.do !== 'SHUFFLE') return fail('search', effects);
        sentences.push(`自分の山札を見て${filterJa(e.filter, 'ZONE')}を${e.max}枚まで選んで相手に見せ、手札に加え、その山札をシャッフルする`);
        i += 3;
        continue;
      }
      const action = actionJa(effects, i + 1, { who: 'CHOSEN' });
      const from =
        e.from === 'YOUR_STAGE'
          ? `${e.other ? '他の' : ''}自分の${filterJa(e.filter, 'STAGE')}`
          : e.from === 'YOUR_WAITING_ROOM'
            ? `自分の控え室の${filterJa(e.filter, 'ZONE')}`
            : e.from === 'YOUR_BATTLING' && e.filter
              ? `自分のバトル中の${filterJa(e.filter, 'STAGE')}`
            : e.from === 'YOUR_BATTLING' && !e.filter
              ? '自分のバトル中のキャラ'
            : e.from === 'YOUR_HAND' && !e.filter
              ? '自分の手札'
              : e.from === 'YOUR_HAND'
                ? `自分の手札の${filterJa(e.filter, 'ZONE')}`
              : e.from === 'YOUR_LEVEL' && !e.filter
                ? '自分のレベル置場のカード'
              : e.from === 'YOUR_CLOCK' && !e.filter
                ? '自分のクロック'
                : e.from === 'YOUR_CLOCK'
                  ? `自分のクロック置場の${filterJa(e.filter, 'ZONE')}`
                : e.from === 'YOUR_MEMORY'
                  ? `自分の思い出置場の${filterJa(e.filter, 'ZONE')}`
                : e.from === 'OPPONENT_WAITING_ROOM'
                  ? `相手の控え室の${filterJa(e.filter, 'ZONE')}`
                  : e.from === 'OPPONENT_STAGE' || e.from === 'OPPONENT_FRONT_ROW' || e.from === 'OPPONENT_BACK_ROW'
                  ? `相手の${e.from === 'OPPONENT_FRONT_ROW' ? '前列の' : e.from === 'OPPONENT_BACK_ROW' ? '後列の' : ''}${filterJa(e.filter, 'STAGE')}`
                  : fail('choose', e);
      if (e.add || (e.levelMaxX && e.from !== 'YOUR_WAITING_ROOM') || (e.other && e.from !== 'YOUR_STAGE')) fail('choose', e);
      sentences.push(`${from}を${count(e)}選び、${action.text}`);
      i += 1 + action.used;
      continue;
    }
    // ＋Ｘ where Ｘ is counted from your characters: one MODIFY with per, said with "Ｘはあなたの…の枚数×Nに等しい".
    if (e.do === 'MODIFY' && e.per) {
      const per = e.per;
      const before = effectsJa([{ ...e, per: undefined, amount: 1 } as Effect, ...effects.slice(i + 1)]);
      sentences.push(...before.map((t) => t.replace('＋1', '＋Ｘ')), `Ｘは${per.other ? '他の' : ''}あなたの${filterJa(per.filter, 'STAGE')}の枚数×${e.amount}に等しい`);
      return sentences;
    }
    if ((e.do === 'MODIFY' || e.do === 'GRANT' || e.do === 'MOVE' || e.do === 'ORIENT') && e.target.who === 'ALL_YOURS') {
      const action = actionJa(effects, i, e.target);
      sentences.push(`${e.target.other ? '他の' : ''}あなたの${filterJa(e.target.filter, 'STAGE')}すべてに、${action.text}`);
      i += action.used;
      continue;
    }
    // This card gains an ability for a time (with number changes before it).
    if ((e.do === 'MODIFY' || e.do === 'GRANT') && e.target.who === 'SELF') {
      let k = i;
      const changes: string[] = [];
      while (effects[k]?.do === 'MODIFY' && (effects[k] as { target: Target }).target.who === 'SELF') {
        const x = effects[k] as Extract<Effect, { do: 'MODIFY' }>;
        changes.push(`${STAT[x.stat]}を${signed(x.amount)}`);
        k++;
      }
      const g = effects[k];
      if (g?.do === 'GRANT' && g.target.who === 'SELF' && !(g.ability.type === 'CONT' && g.ability.giveTraits)) {
        const until = g.until === 'NEXT_OPPONENT_TURN' ? '次の相手のターンの終わりまで' : 'そのターン中';
        sentences.push(`${until}、このカード${changes.length ? `の${changes.join('し、')}し、このカード` : ''}は次の能力を得る`, `『${abilityJa(g.ability)}』`);
        i = k + 1;
        continue;
      }
    }
    if ((e.do === 'MODIFY' || e.do === 'MOVE' || e.do === 'ORIENT' || e.do === 'MOVE_TO_SLOT') && e.target.who === 'SELF') {
      const action = actionJa(effects, i, self);
      sentences.push(e.do === 'MODIFY' ? action.text.replace('、', '、このカードの') : `このカードを${action.text}`);
      i += action.used;
      continue;
    }
    if (e.do === 'MOVE' && e.target.who === 'THAT' && e.to === 'ABOUT_SLOT' && e.rested) {
      sentences.push('そのキャラをそのキャラがいた枠に【レスト】して置く');
      i++;
      continue;
    }
    if (e.do === 'GRANT' && e.target.who === 'THAT' && e.ability.type === 'CONT' && (e.ability.cannotBeReversed || e.ability.noEncore) && !e.until) {
      sentences.push(e.ability.cannotBeReversed ? 'そのターン中、そのキャラは【リバース】しない' : 'そのターン中、そのキャラは『【自】 アンコール』を使えない');
      i++;
      continue;
    }
    if (e.do === 'MODIFY' && e.target.who === 'THAT') {
      const action = actionJa(effects, i, e.target);
      sentences.push(action.text.replace('、', e.target.as === 'ATTACKING' ? '、そのアタックしているキャラの' : '、そのキャラの'));
      i += action.used;
      continue;
    }
    if ((e.do === 'MOVE' || e.do === 'ORIENT') && (e.target.who === 'BATTLE_OPPONENT' || e.target.who === 'THAT')) {
      const action = actionJa(effects, i, e.target);
      sentences.push(`${e.target.who === 'BATTLE_OPPONENT' && e.target.said ? 'そのバトル相手' : 'そのキャラ'}を${action.text}`);
      i += action.used;
      continue;
    }
    i++;
    if (e.do === 'DRAW' && !e.optional) sentences.push(`${e.count}枚${e.upTo ? 'まで' : ''}引く`);
    else if (e.do === 'DRAW' && e.count === 1) sentences.push('1枚まで引く');
    else if (e.do === 'MAY_PAY' && e.said) {
      // The cost of the 【自】 head, paid after the effects before it: "…し、あなたはコストを払ってよい。そうしたら、…".
      const before = sentences.pop() ?? fail('mid cost', e);
      const joined = before.endsWith('与える') ? `${before.slice(0, -2)}え` : /＋\d+$/.test(before) ? `${before}し` : fail('mid cost', before);
      const then = effectsJa(e.then);
      sentences.push(`${joined}、コストを払ってよい`, `${e.said === 'THEN' ? 'そうしたら、' : 'コストを払ったなら、'}${then[0]}`, ...then.slice(1));
    } else if (e.do === 'MAY_PAY') sentences.push(`［${costsJa(e.cost)}］ コストを払ってよい`, ...effectsJa(e.then).map((t, k) => (k === 0 ? `そうしたら、${t}` : t)));
    else if (e.do === 'SHUFFLE') sentences.push('その山札をシャッフルする');
    else if (e.do === 'DELAYED') {
      const time = e.at.phase === 'STAND' && e.at.whose === 'YOURS' ? '次のあなたのターンの始めに' : e.at.phase === 'DRAW' && e.at.whose === 'YOURS' ? '次のあなたのドローフェイズの始めに' : e.at.step === 'ENCORE' && e.at.whose === 'ANY' ? 'アンコールステップの始めに' : e.at.phase === 'END' && e.at.whose === 'ANY' ? 'ターンの終わりに' : fail('delayed', e);
      const inner = effectsJa(e.effects);
      sentences.push(`${time}、${inner[0]}`, ...inner.slice(1));
    } else if (e.do === 'OWNER_PLACES' && e.target.who === 'MOVED' && e.target.where === 'MEMORY') sentences.push('相手は自分の思い出置場のそのキャラを、舞台の好きな枠に置く');
    else if (e.do === 'EXCHANGE_LEVEL_WAITING_ROOM' && e.count === 1) sentences.push('自分のレベル置場のカードと控え室のカードを1枚ずつ選び、入れ替える');
    else if (e.do === 'SWAP_DECK_HAND' && effects[i]?.do === 'SHUFFLE' && Object.keys(e.filter).join() === 'kind' && e.filter.kind === 'CLIMAX' && !e.handFilter) {
      sentences.push('自分の山札を見てCXを1枚まで選んで公開し、自分の手札のCXを1枚まで選んで公開し、それらのCXを入れ替え、その山札をシャッフルする');
      i++;
    } else if (e.do === 'MOVE' && e.target.who === 'MOVED' && e.target.where === 'MEMORY') sentences.push(`自分の思い出置場のそのキャラを、${actionJa(effects, i - 1, e.target).text}`);
    else if (e.do === 'MOVE' && e.target.who === 'PLACED' && e.to === 'WAITING_ROOM') sentences.push('この効果で舞台に置かれたキャラを控え室に置く');
    else if (e.do === 'MAY' && e.said) sentences.push(`次の${e.said === 'EFFECT' ? '効果' : '行動'}を行ってよい`, `『${effectsJa(e.effects).join('。')}。』`);
    else if (e.do === 'MAY') {
      const inner = effectsJa(e.effects);
      sentences.push(...inner.slice(0, -1), may(inner[inner.length - 1]!));
    } else if (e.do === 'REPEAT' && e.effects.length === 1 && e.effects[0]!.do === 'DAMAGE') sentences.push(`相手に${e.effects[0]!.amount}ダメージを${e.times}回与える`);
    else if (e.do === 'REPEAT') sentences.push(`次の行動を${e.times > 1 ? `${e.times}回` : ''}行う`, `『${effectsJa(e.effects).join('。')}。』`);
    else if (e.do === 'DAMAGE') sentences.push(`相手に${e.amount}ダメージを与える`);
    else if (e.do === 'REORDER_TOP' && e.keepExact) {
      if (e.keep !== 1 || e.whose) fail('reorder', e);
      sentences.push(`自分の山札を上から${e.upTo}枚まで見て、カードを1枚選び、山札の上に置き、残りのカードを控え室に置く`);
    } else if (e.do === 'STOCK_BOTTOM_TO_WAITING_ROOM') sentences.push(`相手のストックの下から${e.count}枚を、控え室に置く`);
    else if (e.do === 'REORDER_TOP') {
      sentences.push(`${e.whose === 'OPPONENT' ? '相手' : '自分'}の山札を上から${e.upTo}枚まで見て、${e.keep !== undefined ? `カードを${e.keep}枚まで選び、山札の上に好きな順番で置き、残りのカードを控え室に置く` : '山札の上に好きな順番で置く'}`);
    } else if (e.do === 'OPPONENT_STOCK_RESET') {
      sentences.push(e.via === 'WAITING_ROOM' ? '相手は自分のストックすべてを、控え室に置き、自分の山札の上から同じ枚数をストック置場に置く' : '相手は自分のストックすべてを、山札に戻し、その山札をシャッフルし、自分の山札の上から同じ枚数をストック置場に置く');
    } else if (e.do === 'CHOOSE_ONE' && e.said === 'OR_JOINED') {
      const [a, b] = e.options.map((option) => effectsJa(option));
      if (e.options.length !== 2 || a!.length !== 1 || b!.length !== 1) fail('or', e);
      sentences.push(`${a![0]}か${b![0]}`);
    } else if (e.do === 'CHOOSE_ONE' && e.said === 'OR') {
      const [a, b] = e.options.map((option) => effectsJa(option));
      if (e.options.length !== 2 || a!.length !== 1 || b!.length !== 1) fail('or', e);
      sentences.push(`${a![0]}か、${b![0]}`);
    } else if (e.do === 'CLOCK_TOP' && e.optional && (e.count ?? 1) === 1 && effects[i]?.do !== 'MODIFY') {
      if (e.to !== 'WAITING_ROOM' || e.whose) fail('clock', e);
      sentences.push('自分のクロックの上から1枚までを、控え室に置く');
    } else if (e.do === 'CLOCK_TOP' && e.optional && (e.count ?? 1) === 1) {
      // 1枚までを、控え室に置き、そのターン中、このカードの…: said in one sentence with what follows.
      const next = effects[i];
      if (e.to !== 'WAITING_ROOM' || e.whose || next?.do !== 'MODIFY' || next.target.who !== 'SELF') fail('clock', e);
      const action = actionJa(effects, i, { who: 'SELF' });
      sentences.push(`自分のクロックの上から1枚までを、控え室に置き、${action.text.replace('、', '、このカードの')}`);
      i += action.used;
    } else if (e.do === 'CLOCK_TOP' && e.fromBottom) sentences.push(e.count === undefined && !e.optional && !e.whose ? `自分のクロックの下から1枚を、${e.to === 'STOCK' ? 'ストック置場' : '控え室'}に置く` : fail('clock', e));
    else if (e.do === 'CLOCK_TOP' && (e.count ?? 1) > 1) sentences.push(e.optional && e.to === 'WAITING_ROOM' && !e.whose ? `自分のクロックの上から${e.count}枚までを、控え室に置く` : fail('clock', e));
    else if (e.do === 'EXTRA_TURN') sentences.push('追加の1ターンを得る');
    else if (e.do === 'REPLAY') sentences.push(`${e.name}を発動する`);
    else if (e.do === 'CLOCK_ALL_TO_WAITING_ROOM') sentences.push('すべてのプレイヤーは自分のクロックすべてを、控え室に置く');
    else if (e.do === 'REVEAL_DECK_TOP' && effects[i]?.do === 'SHUFFLE') {
      const shuffle = effects[i] as Extract<Effect, { do: 'SHUFFLE' }>;
      const after = effects[i + 1];
      if (e.whose === 'OPPONENT') {
        if (shuffle.whose !== 'OPPONENT' || after?.do !== 'DECK_TOP' || after.whose !== 'OPPONENT' || after.to !== 'CLOCK') fail('reveal', e);
        sentences.push(`相手は自分の山札の上から${e.count}枚を公開し、その山札をシャッフルし、自分の山札の上から${(after as Extract<Effect, { do: 'DECK_TOP' }>).count}枚を、クロック置場に置く`);
        i += 2;
      } else {
        if (shuffle.whose) fail('reveal', e);
        const rest = effectsJa(effects.slice(i + 1));
        sentences.push(`自分の山札の上から${e.count}枚を公開し、その山札をシャッフルし、${rest[0]}`, ...rest.slice(1));
        i = effects.length;
      }
    } else if (e.do === 'CLOCK_TOP') sentences.push(`${e.whose === 'OPPONENT' ? '相手' : '自分'}のクロックの上から1枚を、${e.to === 'STOCK' ? 'ストック置場' : '控え室'}に置く`);
    else if (e.do === 'MARKERS_TOP') sentences.push(`このカードの下のマーカーを${e.count}枚${e.to === 'HAND' ? '手札に戻す' : e.to === 'STOCK' ? 'ストック置場に置く' : '控え室に置く'}`);
    else if (e.do === 'ICON_EFFECT') sentences.push('[[standby.gif]]の効果を行う');
    else if (e.do === 'WAITING_ROOM_TO_DECK' && e.everyone) sentences.push('すべてのプレイヤーは自分の控え室のカードすべてを、山札に戻し、それらの山札をシャッフルする'); else if (e.do === 'TOP_OR_BOTTOM') sentences.push(`自分の山札を上から1枚見て、山札の上か${e.anyOfThree ? '下か控え室' : e.orWaitingRoom ? '控え室' : '下'}に置く`);
    else if (e.do === 'TRIGGER_CHECKS') sentences.push(`そのアタック中、トリガーステップにトリガーチェックを${e.count}回行う`);
    else if (e.do === 'IF' && e.condition.if === 'DID' && !e.else && (effects[i - 2]?.do === 'LOOK_TOP' || (effects[i - 2]?.do === 'SHUFFLE' && effects[i - 3]?.do === 'MOVE'))) {
      const inner = effectsJa(e.then);
      sentences.push(`手札に加えたなら、${inner[0]}`, ...inner.slice(1));
    } else if (e.do === 'CHOOSE_ONE') {
      sentences.push(`次の${e.options.length}つの効果のうちあなたが選んだ1つを行う`, e.options.map((option) => `『${quotedJa(option)}。』`).join(''));
    }
    else if (e.do === 'DECK_TOP') {
      const to = e.to === 'STOCK' ? 'ストック置場' : e.to === 'WAITING_ROOM' ? '控え室' : 'クロック置場';
      if (e.fromBottom) sentences.push(e.whose === 'OPPONENT' && !e.upTo ? `相手の山札の下から${e.count}枚を、${to}に置く` : fail('deck', e));
      else sentences.push(`${e.whose === 'EITHER' ? '自分か相手の、' : e.whose === 'OPPONENT' ? '相手は自分の' : '自分の'}山札の上から${e.count}枚${e.upTo ? 'まで' : ''}を、${to}に置く`);
    } else if (e.do === 'WAITING_ROOM_TO_DECK' && effects[i]?.do === 'SHUFFLE') {
      sentences.push('自分の控え室のカードすべてを、山札に戻し、その山札をシャッフルする');
      i++;
    } else if (e.do === 'LOOK_TOP' && e.per && e.upTo === 1 && !e.pick && !e.reveal && !e.picks) {
      sentences.push('自分の山札を上からＸ枚まで見て、カードを1枚まで選び、手札に加え、残りのカードを控え室に置く', `Ｘは${e.per.other ? '他の' : ''}あなたの${filterJa(e.per.filter, 'STAGE')}の枚数に等しい`);
    } else if (e.do === 'LOOK_TOP' && e.toStock && !e.per && !e.pick && !e.reveal) {
      sentences.push(`自分の山札を上から${e.upTo}枚まで見て、カードを${e.picks ?? 1}枚まで選び、手札に加え、カードを${e.toStock}枚まで選び、ストック置場に置き、残りのカードを控え室に置く`);
    } else if (e.do === 'LOOK_TOP' && !e.per) {
      sentences.push(
        e.pick && e.reveal
          ? `自分の山札を上から${e.upTo}枚まで見て、${filterJa(e.pick, 'ZONE')}を${e.picks ?? 1}枚まで選んで相手に見せ、手札に加え、残りのカードを控え室に置く`
          : !e.pick && !e.reveal
            ? `自分の山札を上から${e.upTo}枚まで見て、カードを1枚まで選び、手札に加え、残りのカードを控え室に置く`
            : fail('look', e),
      );
    } else if (e.do === 'BRAINSTORM' && (e.per.kind === 'CLIMAX' || (e.per.names && Object.keys(e.per).length === 1)) && !e.setX) {
      const each = effectsJa(e.each);
      const per = filterJa(e.per, 'ZONE');
      // One sentence after 1枚につき, or 次の行動を行う。『…』 for longer actions.
      if (e.joined) sentences.push(`自分の山札の上から${e.count}枚をめくり、控え室に置く`, `それらのカードの${per}1枚につき、${each[0]!.replace(/置く$/, '置き')}、${each.slice(1).join('、')}`);
      else if (each.length === 1) sentences.push(`自分の山札の上から${e.count}枚をめくり、控え室に置く`, `それらのカードの${per}1枚につき、${each[0]}`);
      else sentences.push(`自分の山札の上から${e.count}枚をめくり、控え室に置く`, `それらのカードの${per}1枚につき、次の行動を行う`, `『${each.join('。')}。』`);
    } else if (e.do === 'REVEAL_TOP' && e.toStock) {
      if (e.take || e.then) fail('reveal', e);
      const level = Object.keys(e.filter).join() === 'levelMin' ? `のレベルが${e.filter.levelMin}以上` : `が${filterJa(e.filter, 'ZONE')}`;
      sentences.push('自分の山札の上から1枚を公開する', `そのカード${level}ならストック置場に置く`);
    } else if (e.do === 'REVEAL_TOP') {
      const then = e.then ? effectsJa(e.then) : [];
      const otherwise = e.else ? effectsJa(e.else) : [];
      // "…してよい。そうしたら、…" after the shown card: two sentences.
      if (e.then?.length === 2 && e.then[0]!.do === 'MAY' && e.then[1]!.do === 'IF' && (e.then[1] as { condition: Condition }).condition.if === 'DID' && !e.take && !e.else) {
        const which = Object.keys(e.filter).join() === 'levelMin' ? `のレベルが${e.filter.levelMin}以上` : `が${filterJa(e.filter, 'ZONE')}`;
        const after = effectsJa((e.then[1] as Extract<Effect, { do: 'IF' }>).then);
        sentences.push(`自分の山札の上から1枚を公開${e.optional ? 'してよい' : 'する'}`, `そのカード${which}なら、${then[0]}`, `そうしたら、${after[0]}`, ...after.slice(1));
        continue;
      }
      if (then.length > 1 || otherwise.length > 1 || (!e.take && then.length === 0)) fail('reveal', e);
      const which = Object.keys(e.filter).join() === 'levelMin' ? `のレベルが${e.filter.levelMin}以上` : `が${filterJa(e.filter, 'ZONE')}`;
      sentences.push(`自分の山札の上から1枚を公開${e.optional ? 'してよい' : 'する'}`, `そのカード${which}なら${e.take ? (then.length > 0 ? `手札に加え、${then[0]}` : '手札に加える') : `、${otherwise.length ? then[0]!.replace(/戻す$/, '戻し').replace(/置く$/, '置き') : then[0]}`}${otherwise.length ? `、そうでないなら、${otherwise[0]}` : ''}`);
    } else if (e.do === 'IF' && !e.else && e.then.length === 1 && e.then[0]!.do === 'MAY_PAY') {
      // ［cost］ …なら、コストを払ってよい: the condition is said after the cost.
      const pay = e.then[0] as Extract<Effect, { do: 'MAY_PAY' }>;
      sentences.push(`［${costsJa(pay.cost)}］ ${conditionJa(e.condition)}コストを払ってよい`, ...effectsJa(pay.then).map((t, k) => (k === 0 ? `そうしたら、${t}` : t)));
    } else if (e.do === 'IF' && !e.else && e.condition.if === 'DID' && effects[i - 2]?.do === 'DRAW' && (effects[i - 2] as Extract<Effect, { do: 'DRAW' }>).optional) {
      const inner = effectsJa(e.then);
      sentences.push(`${(effects[i - 2] as Extract<Effect, { do: 'DRAW' }>).count}枚引いたなら、${inner[0]}`, ...inner.slice(1));
    } else if (e.do === 'IF' && !e.else && e.condition.if === 'LAST_MOVED' && e.condition.min === 1 && effects[i - 2]?.do === 'DECK_TOP') {
      const inner = effectsJa(e.then);
      sentences.push(`それらのカードに${filterJa(e.condition.filter, 'ZONE')}があるなら、${inner[0]}`, ...inner.slice(1));
    } else if (e.do === 'IF' && !e.else && e.condition.if !== 'DID' && e.condition.if !== 'LAST_MOVED') {
      const inner = effectsJa(e.then);
      sentences.push(conditionJa(e.condition) + inner[0], ...inner.slice(1));
    } else fail('effect', e);
  }
  return sentences;
}

/** One quoted effect of a choice. */
function quotedJa(option: readonly Effect[]): string {
  const first = option[0];
  if (option.length === 1 && (first?.do === 'CLOCK_TOP' || first?.do === 'DRAW') && first.optional) return may(effectsJa([{ ...first, optional: false } as Effect])[0]!);
  if (option.length === 1 && first?.do === 'IF' && !first.else && first.then.length === 1 && first.then[0]!.do === 'MAY_PAY') {
    const pay = first.then[0] as Extract<Effect, { do: 'MAY_PAY' }>;
    return `［${costsJa(pay.cost)}］ ${conditionJa(first.condition)}コストを払ってよい。そうしたら、${effectsJa(pay.then).join('。')}`;
  }
  if (option.length === 1 && first?.do === 'MAY_PAY') return `［${costsJa(first.cost)}］ コストを払ってよい。そうしたら、${effectsJa(first.then).join('。')}`;
  return effectsJa(option).join('。');
}

/** "…する" as "…してよい". */
const may = (sentence: string): string =>
  sentence.endsWith('置く')
    ? `${sentence.slice(0, -1)}いてよい`
    : sentence.endsWith('入れ替える')
      ? `${sentence.slice(0, -1)}てよい`
    : sentence.endsWith('戻す') || sentence.endsWith('動かす') || sentence.endsWith('する')
      ? `${sentence.slice(0, -1)}してよい`.replace(/すしてよい$/, 'してよい').replace(/戻してよい$/, '戻してよい')
      : sentence.endsWith('引く')
        ? `${sentence.slice(0, -1)}いてよい`
        : fail('optional form', sentence);

const KEYWORD: Record<string, string> = { CX_COMBO: '【CXコンボ】', BRAINSTORM: '集中 ', BOARDING: '搭乗 ', MEMORY: ' 記憶 ', EXPERIENCE: ' 経験 ' };

/** One ability as a line of card text (without reminders). */
export function abilityJa(ability: Ability): string {
  if (ability.type === 'CONT') {
    if (ability.assist) {
      const part = ability.apply[0];
      if (ability.apply.length !== 1 || part!.target.who !== 'IN_FRONT' || part!.stat !== 'POWER' || ability.grant) return fail('ability', ability);
      const front = part!.target as { who: 'IN_FRONT'; filter?: CardFilter };
      const x = part!.perTargetLevel;
      return `【永】 応援 ${conditionJa(ability.condition)}このカードの前のあなたの${filterJa(front.filter, 'STAGE')}すべてに、パワーを＋${x ? 'Ｘ' : part!.amount}。${x ? `Ｘはそのキャラのレベル×${part!.amount}に等しい。` : ''}`;
    }
    const words = (ability.keywords ?? []).map((k) => (k === 'MEMORY' ? '記憶 ' : k === 'EXPERIENCE' ? '経験 ' : fail('keyword', k))).join('');
    if (words) return abilityJa({ ...ability, keywords: undefined } as Ability).replace(/^【永】 /, `【永】 ${words}`);
    if (ability.alarm || ability.greatPerformance) return fail('ability', ability);
    const perCountPart = ability.apply.length === 1 && ability.apply[0]!.perCount?.where === 'YOUR_MEMORY' ? ability.apply[0]!.perCount : undefined;
    if (perCountPart) {
      const part = ability.apply[0]!;
      const named = perCountPart.filter && Object.keys(perCountPart.filter).join() === 'name' ? perCountPart.filter.name : fail('perCount', perCountPart);
      if (perCountPart.where !== 'YOUR_MEMORY' || part.target.who !== 'SELF') return fail('ability', ability);
      return `【永】 ${conditionJa(ability.condition)}あなたの思い出置場の「${named}」1枚につき、このカードの${STAT[part.stat]}を${signed(part.amount)}。`;
    }
    if (ability.recollection) return ability.apply.length === 0 && !ability.condition && !ability.grant ? '【永】 回想' : fail('ability', ability);
    if (ability.link !== undefined) return ability.apply.length === 0 && !ability.condition && !ability.grant ? `【永】【リンク】 ${ability.link}` : fail('ability', ability);
    if (ability.zone === 'MARKER') {
      const part = ability.apply[0];
      if (ability.apply.length !== 1 || part!.target.who !== 'MARKER_HOLDER' || ability.grant) return fail('ability', ability);
      const holder = part!.target as { who: 'MARKER_HOLDER'; filter?: CardFilter };
      return `【永】 マーカー置場にこのカードがあるなら、${conditionJa(ability.condition)}このマーカーを持つ舞台の${filterJa(holder.filter, 'STAGE')}の${STAT[part!.stat]}を${signed(part!.amount)}。`;
    }
    if (ability.apply.length === 1 && ability.apply[0]!.perMarker) {
      const part = ability.apply[0]!;
      return `【永】 ${conditionJa(ability.condition)}このカードの下のマーカー1枚につき、このカードの${STAT[part.stat]}を${signed(part.amount)}。`;
    }
    if (ability.playOnlyIf) {
      const c = ability.playOnlyIf;
      if (!ability.inHand || ability.apply.length || c.if !== 'CHARACTERS' || c.other) return fail('ability', ability);
      return `このカードは、あなたの${filterJa(c.filter, 'STAGE')}が${c.min === 1 ? 'いない' : `${(c.min ?? 1) - 1}枚以下`}なら、手札からプレイできない。`;
    }
    if (ability.noStand) return ability.apply.length === 0 && !ability.condition && !ability.grant ? '【永】 このカードはあなたのスタンドフェイズに【スタンド】しない。' : fail('ability', ability);
    if ((ability.grant ?? []).length === 1 && ability.grant![0]!.target.who === 'ALL_THEIRS' && ability.apply.length === 0 && !ability.condition) return `【永】 相手のキャラすべてに、『${abilityJa(ability.grant![0]!.ability)}』を与える。`;
    if (ability.grantConts) {
      const part = ability.grantConts[0]!;
      return ability.grantConts.length === 1 && part.target.who === 'YOUR_SLOT' && part.target.slots.join() === 'BL,BR' && part.target.other && ability.apply.length === 0 && !ability.condition ? `【永】 他のあなたの後列のキャラすべてに、『${abilityJa(part.ability)}』を与える。` : fail('ability', ability);
    }
    if (ability.replay) return ability.apply.length === 0 && !ability.condition ? `【リプレイ】${ability.replay.oncePerGame ? '【ゲーム1】' : ''} ${ability.replay.name} ${effectsJa(ability.replay.effects).join('。')}。` : fail('ability', ability);
    if (ability.triggerChecks) return ability.apply.length === 0 && !ability.condition && !ability.grant ? `【永】 このカードのアタック中、あなたはトリガーステップにトリガーチェックを${ability.triggerChecks}回行う。` : fail('ability', ability);
    if (ability.noBackupsEveryone) return ability.apply.length === 0 && !ability.condition && !ability.grant ? '【永】 このカードのバトル中、すべてのプレイヤーは『助太刀』を手札からプレイできない。' : fail('ability', ability);
    if (ability.anyNumberInDeck) return ability.apply.length === 0 && !ability.condition && !ability.grant ? '【永】 このカードと同じカード名のカードは、デッキに好きな枚数入れることができる。' : fail('ability', ability);
    if (ability.gainsTriggerIcons) return ability.apply.length === 0 && !ability.grant && ability.gainsTriggerIcons.length === 1 ? `【永】 ${conditionJa(ability.condition)}すべての領域にあるこのカードはトリガーアイコンに[[${ICONS[ability.gainsTriggerIcons[0]!]}.gif]]を得る。` : fail('ability', ability);
    if (ability.handCards) return ability.apply.length === 0 && !ability.grant && Object.keys(ability.handCards.filter).join() === 'name' && ability.handCards.level < 0 ? `【永】 ${conditionJa(ability.condition)}あなたの手札の「${ability.handCards.filter.name}」のレベルを－${-ability.handCards.level}。` : fail('ability', ability);
    if (ability.handLimitPlus) return ability.apply.length === 0 && !ability.condition && !ability.grant ? `【永】 あなたの手札の枚数上限を＋${ability.handLimitPlus}。` : fail('ability', ability);
    if (ability.giveTraits) return ability.giveTraits.to === 'OTHER_CHARACTERS' && ability.apply.length === 0 && !ability.condition && !ability.grant ? `【永】 他のキャラすべてに、${ability.giveTraits.traits.map((t) => `《${t}》`).join('')}を与える。` : fail('ability', ability);
    if (ability.apply.length === 2 && ability.apply.every((a) => a.onlyIf && a.target.who === 'SELF') && ability.apply[0]!.onlyIf!.if === 'YOUR_TURN' && ability.apply[1]!.onlyIf!.if === 'OPPONENT_TURN' && !ability.grant) {
      const [a, b] = ability.apply;
      return `【永】 ${conditionJa(ability.condition)}あなたのターン中、このカードの${STAT[a!.stat]}を${signed(a!.amount)}し、相手のターン中、このカードの${STAT[b!.stat]}を${signed(b!.amount)}。`;
    }
    if (ability.apply.length === 1 && ability.apply[0]!.perCount?.where === 'YOUR_LEVEL' && ability.apply[0]!.perCount.filter) {
      const part = ability.apply[0]!;
      if (part.target.who !== 'SELF' || ability.grant) return fail('ability', ability);
      return `【永】 ${conditionJa(ability.condition)}あなたのレベル置場の${filterJa(part.perCount!.filter, 'ZONE')}1枚につき、このカードの${STAT[part.stat]}を${signed(part.amount)}。`;
    }
    if ((ability.grant ?? []).length > 0 && ability.grant!.every((g) => g.target.who === 'ALL_YOURS' && sameTarget(g.target, ability.grant![0]!.target)) && ability.apply.every((a) => sameTarget(a.target, ability.grant![0]!.target) && !a.per && !a.perCount && !a.onlyIf)) {
      const target = ability.grant![0]!.target as { who: 'ALL_YOURS'; filter?: CardFilter; other?: boolean };
      const changes = ability.apply.map((a) => `${STAT[a.stat]}を${signed(a.amount)}`).join('し、');
      const n = ability.grant!.length;
      return `【永】 ${conditionJa(ability.condition)}${target.other ? '他の' : ''}あなたの${filterJa(target.filter, 'STAGE')}すべてに、${changes ? `${changes}し、` : ''}次の${n > 1 ? `${n}つの` : ''}能力を与える。${ability.grant!.map((g) => `『${abilityJa(g.ability)}』`).join('')}`;
    }
    if (ability.ignoresColor) return ability.inHand && ability.apply.length === 0 && !ability.condition && !ability.grant ? '【永】 このカードは、色条件を満たさずに手札からプレイできる。' : fail('ability', ability);
    if (ability.cannotMove) return ability.apply.length === 0 && !ability.condition && !ability.grant ? '【永】 このカードは他の枠に動かせない。' : fail('ability', ability);
    if (ability.noOpponentCounters) return ability.apply.length === 0 && !ability.condition && !ability.grant ? `【永】 このカードのバトル中、相手は${ability.noOpponentCounters === 'EVENT_AND_BACKUP' ? 'イベントと' : ''}『助太刀』を手札からプレイできない。` : fail('ability', ability);
    if (ability.noSideAttack) return ability.apply.length === 0 && !ability.condition && !ability.grant && !ability.inHand && !ability.untargetable ? '【永】 このカードはサイドアタックできない。' : fail('ability', ability);
    if (ability.untargetable) return ability.apply.length === 0 && !ability.condition && !ability.grant && !ability.inHand ? '【永】 このカードは相手の効果に選ばれない。' : fail('ability', ability);
    const per = ability.apply.length === 1 ? ability.apply[0]!.per : undefined;
    if (per) {
      const part = ability.apply[0]!;
      if (part.target.who !== 'SELF' || part.perTargetLevel || ability.grant) return fail('ability', ability);
      return `【永】 ${conditionJa(ability.condition)}${per.other ? '他の' : ''}あなたの${filterJa(per.filter, 'STAGE')}1枚につき、このカードの${STAT[part.stat]}を${signed(part.amount)}。`;
    }
    if (ability.inHand) {
      const only = ability.apply[0];
      return ability.apply.length === 1 && only!.target.who === 'SELF' && only!.stat === 'LEVEL' && only!.amount < 0 && !ability.grant ? `【永】 ${conditionJa(ability.condition)}あなたの手札のこのカードのレベルを－${-only!.amount}。` : fail('ability', ability);
    }
    const target = ability.apply[0]?.target;
    if (ability.apply.some((a) => !sameTarget(a.target, target!) || a.per || a.perTargetLevel || (a.perCount && a.perCount.where !== 'YOUR_LEVEL'))) return fail('ability', ability);
    const bySoul = ability.apply.length === 1 && ability.apply[0]!.perTargetSoul;
    const byLevel = ability.apply.some((a) => a.perCount?.where === 'YOUR_LEVEL');
    const changes = ability.apply.map((a) => `${STAT[a.stat]}を${byLevel || bySoul ? '＋Ｘ' : signed(a.amount)}`).join('し、');
    const subject = !target
      ? ''
      : target.who === 'SELF'
        ? `このカードの${changes}`
        : target.who === 'FACING'
          ? `このカードの正面のキャラの${changes}`
        : target.who === 'ALL_YOURS'
          ? `${target.other ? '他の' : ''}あなたの${filterJa(target.filter, 'STAGE')}すべてに、${changes}`
          : fail('target', target);
    const grants: { ability: Ability }[] = [...(ability.gains ?? []).map((g) => ({ ability: g as Ability })), ...(ability.grant ?? [])];
    if ((ability.grant ?? []).some((g) => g.target.who !== 'SELF')) return fail('grant', ability);
    const gain = grants.length === 0 ? '' : `${subject ? 'し、' : ''}このカードは次の${grants.length > 1 ? `${grants.length}つの` : ''}能力を得る。${grants.map((g) => `『${abilityJa(g.ability)}』`).join('')}`;
    return `【永】 ${conditionJa(ability.condition)}${subject}${gain}${grants.length > 0 ? '' : '。'}${byLevel ? `Ｘはあなたのレベル×${ability.apply[0]!.amount}に等しい。` : ''}${bySoul ? `Ｘはそのキャラのソウル×${ability.apply[0]!.amount}に等しい。` : ''}`;
  }
  if (ability.type === 'ACT') {
    if (ability.timing !== 'MAIN' || ability.level !== undefined) return fail('ability', ability);
    const keywords = (ability.keywords ?? []).map((k) => KEYWORD[k] ?? fail('keyword', k)).join('');
    const limit = ability.limit !== undefined ? `【ターン${ability.limit}】${keywords ? ` ${keywords}` : ''}` : ` ${keywords}`;
    return `【起】${limit}［${costsJa(ability.cost)}］ ${effectsJa(ability.effect).join('。')}。`;
  }
  return autoJa(ability);
}

function autoJa(ability: AutoAbility): string {
  const keywords = ability.keywords ?? [];
  if (keywords.includes('ENCORE')) {
    const move = ability.effect[0];
    const isEncore = ability.trigger.on === 'STAGE_TO_WAITING_ROOM' && ability.cost && ability.effect.length === 1 && move?.do === 'MOVE' && move.to === 'SOURCE_SLOT' && move.rested === true;
    return isEncore ? `【自】 アンコール ［${costsJa(ability.cost!)}］` : fail('encore', ability);
  }
  if (ability.alarm) return fail('ability', ability);
  // "あなたのターン中、…した時": a condition on the turn is said before the trigger.
  const conditions = ability.condition?.if === 'ALL' ? ability.condition.of : ability.condition ? [ability.condition] : [];
  const turn = conditions[0]?.if === 'YOUR_TURN' || conditions[0]?.if === 'OPPONENT_TURN' ? conditions[0] : undefined;
  const rest = turn ? conditions.slice(1) : conditions;
  const after: Condition | undefined = rest.length === 0 ? undefined : rest.length === 1 ? rest[0] : { if: 'ALL', of: rest };
  // 思い出置場にこのカードがあ(る|り、…)なら: said before the trigger, with every condition of the ability.
  const memoryHead = ability.zone === 'MEMORY' ? (after ? `思い出置場にこのカードがあり、${conditionJa(after)}` : '思い出置場にこのカードがあるなら、') : '';
  const midCost = ability.effect.find((x): x is Extract<Effect, { do: 'MAY_PAY' }> => x.do === 'MAY_PAY' && x.said !== undefined);
  if (midCost && ability.cost) return fail('mid cost', ability);
  const head = `【自】${keywords.map((k) => KEYWORD[k] ?? fail('keyword', k)).join('')}${ability.limit !== undefined ? `【ターン${ability.limit}】` : ''}${midCost ? `［${costsJa(midCost.cost)}］` : ''}${ability.cost ? `［${costsJa(ability.cost)}］` : ''} ${memoryHead}${turn ? conditionJa(turn) : ''}${triggerJa(ability.trigger)}、${ability.zone === 'MEMORY' ? '' : conditionJa(after)}`;
  if (ability.cost) return ability.optional ? fail('ability', ability) : `${head}コストを払ってよい。そうしたら、${effectsJa(ability.effect).join('。')}。`;
  if (!ability.optional) return `${head}${effectsJa(ability.effect).join('。')}。`;
  // …してよい: alone; before "そうしたら、" when what follows depends on it having been done; or after drawing.
  const last = ability.effect[ability.effect.length - 1]!;
  if (last.do === 'IF' && last.condition.if === 'DID' && !last.else) {
    const first = effectsJa(ability.effect.slice(0, -1));
    return first.length === 1 ? `${head}${may(first[0]!)}。そうしたら、${effectsJa(last.then).join('。')}。` : fail('optional', ability);
  }
  const sentences = effectsJa(ability.effect);
  if (sentences.length === 1) return `${head}${may(sentences[0]!)}。`;
  if (ability.effect[0]!.do === 'DRAW') return `${head}${may(sentences[0]!)}。そうしたら、${sentences.slice(1).join('。')}。`;
  return fail('optional', ability);
}

/**
 * Both texts brought to one spelling of what the card list writes in several
 * ways without a difference in meaning: spaces, "あなたは", a comma after の,
 * "N枚引き、" for "N枚引く。", the two ways of quoting a given ability, and
 * the reminders the grammar accepts as reminders, あなたのCX置場に「…」 (the
 * player's own climax zone either way) and a comma after している.
 */
export function sameWords(text: string): string {
  return text
    .replace(/(【自】 アンコール ［[^］]*］) （[^（）]*）$/, '$1')
    .replace(/（ダメージキャンセルは発生する）$/, '')
    .replace(/（CXのレベルは0として扱う）$/, '')
    .replace(/（(?:(?:CXのレベルは0として扱う|そうでないなら元に戻す|公開したカードは元に戻す|ダメージキャンセルは発生する)。?)+）$/, '')
    .replace(/、次の能力を与える。『((?:[^『』]|『[^『』]*』)+?)。?』/g, '、『$1』を与える')
    // "このカードは次の能力を得る。『X』" (one ability) says the same as "このカードは『X』を得る".
    .replace(/このカードは次の能力を得る。『((?:[^『』]|『[^『』]*』)+?)。?』(。?)/g, 'このカードは『$1』を得る$2')
    .replace(/。』/g, '』')
    // "CX置場に「…」" in a condition is the player's own climax zone, written with or without あなたの.
    .replace(/あなたのCX置場に「/g, 'CX置場に「')
    .replace(/している、/g, 'している')
    .replace(/』『/g, '』『')
    .replace(/持つ舞台の、/g, '持つ舞台の')
    // The reminder after 回想 restates CR-10.20.2 (CR-2.12.3).
    .replace(/^(【永】 ?回想) ?（[^（）]*）$/, '$1')
    // Resting a character as a cost needs a standing one: "あなたのキャラを2枚【レスト】する" is the same cost.
    .replace(/あなたの【スタンド】している(.+?を\d+枚【レスト】する)/g, 'あなたの$1')
    .replace(/【スタンド】しているこのカードを【レスト】する/g, 'このカードを【レスト】する')
    // Two effects joined in one sentence (…置き、… / …戻し、…) say the same as two sentences.
    .replace(/置き、/g, '置く。')
    .replace(/戻し、/g, '戻す。')
    .replace(/シャッフルし、/g, 'シャッフルする。')
    // "N枚を、クロック置場に置く" and "N枚をクロック置場に置く": a comma only.
    .replace(/枚を、/g, '枚を')
    .replace(/ダメージを与え、(?!あなたはコストを払ってよい|コストを払ってよい)/g, 'ダメージを与える。')
    .replace(/枚まで引き、/g, '枚まで引く。')
    // "次の行動を行う。『X』" (once) says the same as X itself.
    .replace(/次の行動を行う。『([^『』]+?)。?』/g, '$1')
    .replace(/あなたは/g, '')
    .replace(/の、/g, 'の')
    .replace(/枚引き、/g, '枚引く。')
    .replace(/クライマックスフェイズ/g, 'CXフェイズ')
    .replace(/あなたのクライマックスが/g, 'あなたのCXが')
    .replace(/ /g, '')
    .replace(/。$/, '');
}
