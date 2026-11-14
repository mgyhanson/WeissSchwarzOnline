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
  if (keys === 'names') return filter.names!.map((name) => `「${name}」`).join('か');
  if (keys === 'anyOf') return filter.anyOf!.map((part) => filterJa(part, 'ZONE')).join('か');
  if (keys === 'hasTrigger,kind' && filter.kind === 'CLIMAX') return `トリガーアイコンが[[${ICONS[filter.hasTrigger!]}.gif]]のCX`;
  if (keys === 'nameIncludes' || keys === 'kind,nameIncludes') return `カード名に「${filter.nameIncludes}」を含むキャラ`;
  if (keys === 'levelAboveMasterLevel') return 'レベルが相手のレベルより高いキャラ';
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
      return trigger.from === 'HAND' ? 'このカードが手札から舞台に置かれた時' : fail('trigger', trigger);
    case 'ATTACKS':
      return 'このカードがアタックした時';
    case 'EITHER':
      // …した時か…した時: the subject is said once.
      return trigger.of.map((part, i) => (i === 0 ? triggerJa(part) : triggerJa(part).replace(/^このカードが/, ''))).join('か').replace(/時か/g, '時か');
    case 'USED_BACKUP':
      return 'あなたがこのカードの『助太刀』を使った時';
    case 'BATTLE_OPPONENT_REVERSED':
      if (!trigger.filter) return 'このカードのバトル相手が【リバース】した時';
      return Object.keys(trigger.filter).join() === 'levelMin' ? `このカードのバトル相手でレベル${trigger.filter.levelMin}以上のキャラが【リバース】した時` : fail('trigger', trigger);
    case 'REVERSED':
      return trigger.inBattle ? fail('trigger', trigger) : 'このカードが【リバース】した時';
    case 'STAGE_TO_WAITING_ROOM':
      return 'このカードが舞台から控え室に置かれた時';
    case 'CLIMAX_PLACED':
      return trigger.filter ? fail('trigger', trigger) : 'あなたのCXがCX置場に置かれた時';
    case 'PHASE_START':
      if (trigger.turn !== 'YOURS') return fail('trigger', trigger);
      return trigger.phase === 'CLIMAX' ? 'あなたのCXフェイズの始めに' : trigger.phase === 'ATTACK' ? 'あなたのアタックフェイズの始めに' : fail('trigger', trigger);
    case 'STEP_START':
      return trigger.step === 'ENCORE' && trigger.turn === 'YOURS' ? 'あなたのアンコールステップの始めに' : fail('trigger', trigger);
    case 'OTHER_ATTACKS':
      return `他のあなたの${filterJa(trigger.filter, 'STAGE')}がアタックした時`;
    default:
      return fail('trigger', trigger);
  }
}

export function costJa(cost: Cost): string {
  switch (cost.pay) {
    case 'STOCK':
      return `(${cost.count})`;
    case 'REST_SELF':
      return 'このカードを【レスト】する';
    case 'SELF_TO_WAITING_ROOM':
      return 'このカードを控え室に置く';
    case 'SELF_TO_MEMORY':
      return 'このカードを思い出にする';
    case 'SELF_TO_CLOCK':
      return 'このカードをクロック置場に置く';
    case 'SELF_TO_DECK_BOTTOM':
      return 'このカードを山札の下に置く';
    case 'DECK_TOP_TO_CLOCK':
      return 'あなたの山札の上から1枚をクロック置場に置く';
    case 'DISCARD':
      return cost.filter ? `手札の${filterJa(cost.filter, 'ZONE')}を${cost.count}枚控え室に置く` : `手札を${cost.count}枚控え室に置く`;
    case 'HAND_TO_CLOCK':
      return cost.filter ? fail('cost', cost) : `手札を${cost.count}枚クロック置場に置く`;
    case 'CHARACTERS_TO_WAITING_ROOM':
      return `${cost.other ? '他の' : ''}あなたの舞台の${filterJa(cost.filter, 'STAGE')}を${cost.count}枚控え室に置く`;
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
    case 'NOT':
      return c.of.if === 'CHARACTERS' && c.of.min === 1 ? oneConditionJa(c.of).replace(/がいる$/, 'がいない') : fail('condition', c);
    case 'CLIMAX_IN_PLAY':
      return c.name !== undefined ? `CX置場に「${c.name}」がある` : 'あなたのCX置場にCXがある';
    case 'LEVEL':
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
  const parts = condition.if === 'ALL' ? condition.of : [condition];
  return parts
    .map((part, i) => {
      const text = oneConditionJa(part);
      // "あなたのターン中、" stands before the rest and takes no "なら".
      if (part.if === 'YOUR_TURN' || part.if === 'OPPONENT_TURN') return i === 0 ? `${text}、` : fail('condition order', condition);
      if (i === parts.length - 1) return `${text}なら、`;
      if (text.endsWith('がある')) return `${text.slice(0, -1)}り、`;
      if (text.endsWith('がいる')) return `${text.slice(0, -1)}て、`;
      if (text.endsWith('》')) return `${text}で、`;
      return fail('condition join', part);
    })
    .join('');
}

const DESTINATION: Record<string, string> = {
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
    return move?.do === 'MOVE' && move.to === 'CHOSEN_SLOT' && sameTarget(move.target, target) ? { text: '舞台の好きな枠に置く', used: 2 } : fail('slot', effects);
  }
  if (e.do === 'MOVE' && sameTarget(e.target, target) && !e.reveal && !e.rested && DESTINATION[e.to]) return { text: DESTINATION[e.to]!, used: 1 };
  if (e.do === 'ORIENT' && sameTarget(e.target, target)) return { text: ORIENT[e.to]!, used: 1 };
  if ((e.do === 'MODIFY' || e.do === 'GRANT') && sameTarget(e.target, target)) {
    const until = e.until;
    const pieces: string[] = [];
    let used = 0;
    for (let k = i; k < effects.length; k++) {
      const x = effects[k]!;
      if (x.do === 'MODIFY' && sameTarget(x.target, target) && x.until === until && !x.per) pieces.push(`${STAT[x.stat]}を${signed(x.amount)}`);
      else if (x.do === 'GRANT' && sameTarget(x.target, target) && x.until === until) {
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
export function effectsJa(effects: readonly Effect[]): string[] {
  const sentences: string[] = [];
  for (let i = 0; i < effects.length; ) {
    const e = effects[i]!;
    const self: Target = { who: 'SELF' };
    if (e.do === 'CHOOSE') {
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
            : e.from === 'YOUR_HAND' && !e.filter
              ? '自分の手札'
              : e.from === 'YOUR_CLOCK' && !e.filter
                ? '自分のクロック'
                : e.from === 'OPPONENT_STAGE' || e.from === 'OPPONENT_FRONT_ROW' || e.from === 'OPPONENT_BACK_ROW'
                  ? `相手の${e.from === 'OPPONENT_FRONT_ROW' ? '前列の' : e.from === 'OPPONENT_BACK_ROW' ? '後列の' : ''}${filterJa(e.filter, 'STAGE')}`
                  : fail('choose', e);
      if (e.add || e.levelMaxX || (e.other && e.from !== 'YOUR_STAGE')) fail('choose', e);
      sentences.push(`${from}を${count(e)}選び、${action.text}`);
      i += 1 + action.used;
      continue;
    }
    if ((e.do === 'MODIFY' || e.do === 'MOVE' || e.do === 'ORIENT') && e.target.who === 'SELF') {
      const action = actionJa(effects, i, self);
      sentences.push(e.do === 'MODIFY' ? action.text.replace('、', '、このカードの') : `このカードを${action.text}`);
      i += action.used;
      continue;
    }
    if ((e.do === 'MOVE' || e.do === 'ORIENT') && e.target.who === 'BATTLE_OPPONENT') {
      const action = actionJa(effects, i, e.target);
      sentences.push(`そのキャラを${action.text}`);
      i += action.used;
      continue;
    }
    i++;
    if (e.do === 'DRAW' && !e.optional) sentences.push(`${e.count}枚引く`);
    else if (e.do === 'DAMAGE') sentences.push(`相手に${e.amount}ダメージを与える`);
    else if (e.do === 'CLOCK_TOP') sentences.push(`${e.whose === 'OPPONENT' ? '相手' : '自分'}のクロックの上から1枚を、控え室に置く`);
    else if (e.do === 'DECK_TOP') {
      const to = e.to === 'STOCK' ? 'ストック置場' : e.to === 'WAITING_ROOM' ? '控え室' : 'クロック置場';
      sentences.push(`${e.whose === 'EITHER' ? '自分か相手の、' : '自分の'}山札の上から${e.count}枚を、${to}に置く`);
    } else if (e.do === 'WAITING_ROOM_TO_DECK' && effects[i]?.do === 'SHUFFLE') {
      sentences.push('自分の控え室のカードすべてを、山札に戻し、その山札をシャッフルする');
      i++;
    } else if (e.do === 'LOOK_TOP' && !e.per) {
      sentences.push(
        e.pick && e.reveal
          ? `自分の山札を上から${e.upTo}枚まで見て、${filterJa(e.pick, 'ZONE')}を1枚まで選んで相手に見せ、手札に加え、残りのカードを控え室に置く`
          : !e.pick && !e.reveal
            ? `自分の山札を上から${e.upTo}枚まで見て、カードを1枚まで選び、手札に加え、残りのカードを控え室に置く`
            : fail('look', e),
      );
    } else if (e.do === 'BRAINSTORM' && e.per.kind === 'CLIMAX' && Object.keys(e.per).length === 1 && !e.setX) {
      const each = effectsJa(e.each);
      if (each.length !== 1) fail('brainstorm', e);
      sentences.push(`自分の山札の上から${e.count}枚をめくり、控え室に置く`, `それらのカードのCX1枚につき、${each[0]}`);
    } else if (e.do === 'REVEAL_TOP') {
      const then = e.then ? effectsJa(e.then) : [];
      if (then.length > 1 || (!e.take && then.length === 0)) fail('reveal', e);
      sentences.push('自分の山札の上から1枚を公開する', `そのカードが${filterJa(e.filter, 'ZONE')}なら${e.take ? (then.length > 0 ? `手札に加え、${then[0]}` : '手札に加える') : `、${then[0]}`}`);
    } else if (e.do === 'IF' && !e.else && e.condition.if !== 'DID' && e.condition.if !== 'LAST_MOVED') {
      const inner = effectsJa(e.then);
      sentences.push(conditionJa(e.condition) + inner[0], ...inner.slice(1));
    } else fail('effect', e);
  }
  return sentences;
}

/** "…する" as "…してよい". */
const may = (sentence: string): string =>
  sentence.endsWith('置く')
    ? `${sentence.slice(0, -1)}いてよい`
    : sentence.endsWith('戻す') || sentence.endsWith('する')
      ? `${sentence.slice(0, -1)}してよい`.replace(/すしてよい$/, 'してよい').replace(/戻してよい$/, '戻してよい')
      : sentence.endsWith('引く')
        ? `${sentence.slice(0, -1)}いてよい`
        : fail('optional form', sentence);

const KEYWORD: Record<string, string> = { CX_COMBO: '【CXコンボ】', BRAINSTORM: '集中 ' };

/** One ability as a line of card text (without reminders). */
export function abilityJa(ability: Ability): string {
  if (ability.type === 'CONT') {
    if (ability.keywords || ability.assist || ability.alarm || ability.greatPerformance) return fail('ability', ability);
    const target = ability.apply[0]?.target;
    if (ability.apply.some((a) => !sameTarget(a.target, target!) || a.per || a.perTargetLevel)) return fail('ability', ability);
    const changes = ability.apply.map((a) => `${STAT[a.stat]}を${signed(a.amount)}`).join('し、');
    const subject = !target
      ? ''
      : target.who === 'SELF'
        ? `このカードの${changes}`
        : target.who === 'ALL_YOURS'
          ? `${target.other ? '他の' : ''}あなたの${filterJa(target.filter, 'STAGE')}すべてに、${changes}`
          : fail('target', target);
    const grants = ability.grant ?? [];
    if (grants.some((g) => g.target.who !== 'SELF')) return fail('grant', ability);
    const gain = grants.length === 0 ? '' : `${subject ? 'し、' : ''}このカードは次の${grants.length > 1 ? `${grants.length}つの` : ''}能力を得る。${grants.map((g) => `『${abilityJa(g.ability)}』`).join('')}`;
    return `【永】 ${conditionJa(ability.condition)}${subject}${gain}${grants.length > 0 ? '' : '。'}`;
  }
  if (ability.type === 'ACT') {
    if (ability.timing !== 'MAIN' || ability.level !== undefined) return fail('ability', ability);
    const keywords = (ability.keywords ?? []).map((k) => KEYWORD[k] ?? fail('keyword', k)).join('');
    return `【起】 ${keywords}［${costsJa(ability.cost)}］ ${effectsJa(ability.effect).join('。')}。`;
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
  if (ability.alarm || ability.limit !== undefined) return fail('ability', ability);
  // "あなたのターン中、…した時": a condition on the turn is said before the trigger.
  const conditions = ability.condition?.if === 'ALL' ? ability.condition.of : ability.condition ? [ability.condition] : [];
  const turn = conditions[0]?.if === 'YOUR_TURN' || conditions[0]?.if === 'OPPONENT_TURN' ? conditions[0] : undefined;
  const rest = turn ? conditions.slice(1) : conditions;
  const after: Condition | undefined = rest.length === 0 ? undefined : rest.length === 1 ? rest[0] : { if: 'ALL', of: rest };
  const head = `【自】${keywords.map((k) => KEYWORD[k] ?? fail('keyword', k)).join('')}${ability.cost ? `［${costsJa(ability.cost)}］` : ''} ${turn ? conditionJa(turn) : ''}${triggerJa(ability.trigger)}、${conditionJa(after)}`;
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
 * the reminders the grammar accepts as reminders.
 */
export function sameWords(text: string): string {
  return text
    .replace(/(【自】 アンコール ［[^］]*］) （[^（）]*）$/, '$1')
    .replace(/(ダメージを与える。)（ダメージキャンセルは発生する）$/, '$1')
    .replace(/（CXのレベルは0として扱う）$/, '')
    .replace(/(公開する。そのカードが[^。]*。)（(?:そうでないなら元に戻す|公開したカードは元に戻す)）$/, '$1')
    .replace(/、次の能力を与える。『(.+?)。?』/g, '、『$1』を与える')
    .replace(/。』/g, '』')
    .replace(/あなたは/g, '')
    .replace(/の、/g, 'の')
    .replace(/枚引き、/g, '枚引く。')
    .replace(/クライマックスフェイズ/g, 'CXフェイズ')
    .replace(/あなたのクライマックスが/g, 'あなたのCXが')
    .replace(/ /g, '')
    .replace(/。$/, '');
}
