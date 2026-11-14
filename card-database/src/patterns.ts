/**
 * Ability data for cards whose official text is made only of sentences the
 * engine is known to run correctly.
 *
 * This is not free text parsing. Each pattern below is one exact sentence
 * form (the whole line must match, numbers aside). A card is compiled only
 * if EVERY line of its text matches a pattern; otherwise compileText returns
 * null and the card stays unsupported until someone writes its abilities by
 * hand. Reminder text in brackets that the official list prints after a
 * keyword or for a trigger icon is not rules text and is skipped.
 *
 * Safeguards (card-database/tests/patterns.test.ts):
 *  - every hand-verified card whose text is fully covered by patterns must
 *    compile to exactly its hand-written ability data;
 *  - every pattern is exercised in the engine on every card it produced.
 */

import type { Ability, Effect } from '@wso/game-engine';
import { backup, encore } from '@wso/game-engine';
import type { OfficialCard } from './types';

export interface Compiled {
  abilities?: Ability[];
  effect?: Effect[];
  /** Traditional Chinese explanation, one line per ability. */
  zh: string[];
  /** Ids of the patterns used, in text order (empty for a card without text). */
  patterns: string[];
}

interface LinePattern {
  id: string;
  /** Matches the whole line. */
  re: RegExp;
  build(m: RegExpExecArray): { ability: Ability; zh: string };
}

const n = (text: string | undefined): number => Number(text);

/** Reminder printed after a keyword, e.g. （このカードが舞台から控え室に置かれた時、…）. */
const REMINDER = '(?: （[^（）]*）)?';

const LINE_PATTERNS: LinePattern[] = [
  {
    id: 'CLIMAX_POWER_SOUL',
    re: /^【永】 あなたのキャラすべてに、パワーを＋(\d+)し、ソウルを＋(\d+)。$/,
    build: (m) => ({
      ability: {
        type: 'CONT',
        apply: [
          { target: { who: 'ALL_YOURS' }, stat: 'POWER', amount: n(m[1]) },
          { target: { who: 'ALL_YOURS' }, stat: 'SOUL', amount: n(m[2]) },
        ],
      },
      zh: `【永】我方所有角色 Power +${m[1]}、Soul +${m[2]}。`,
    }),
  },
  {
    id: 'CLIMAX_SOUL',
    re: /^【永】 あなたのキャラすべてに、ソウルを＋(\d+)。$/,
    build: (m) => ({
      ability: { type: 'CONT', apply: [{ target: { who: 'ALL_YOURS' }, stat: 'SOUL', amount: n(m[1]) }] },
      zh: `【永】我方所有角色 Soul +${m[1]}。`,
    }),
  },
  {
    id: 'ASSIST',
    re: /^【永】 応援 このカードの前のあなたのキャラすべてに、パワーを＋(\d+)。$/,
    build: (m) => ({
      ability: { type: 'CONT', keywords: ['ASSIST'], assist: true, apply: [{ target: { who: 'IN_FRONT' }, stat: 'POWER', amount: n(m[1]) }] },
      zh: `【永】應援：放在後列時，它前面的我方角色全部 Power +${m[1]}。`,
    }),
  },
  {
    id: 'YOUR_TURN_POWER',
    re: /^【永】 あなたのターン中、このカードのパワーを＋(\d+)。$/,
    build: (m) => ({
      ability: { type: 'CONT', condition: { if: 'YOUR_TURN' }, apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: n(m[1]) }] },
      zh: `【永】我方回合中，這張卡 Power +${m[1]}。`,
    }),
  },
  {
    id: 'OPPONENT_TURN_POWER',
    re: /^【永】 相手のターン中、このカードのパワーを＋(\d+)。$/,
    build: (m) => ({
      ability: { type: 'CONT', condition: { if: 'OPPONENT_TURN' }, apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: n(m[1]) }] },
      zh: `【永】對手回合中，這張卡 Power +${m[1]}。`,
    }),
  },
  {
    id: 'EXPERIENCE_POWER',
    re: /^【永】 経験 あなたのレベル置場のカードのレベルの合計が(\d+)以上なら、このカードのパワーを＋(\d+)。$/,
    build: (m) => ({
      ability: { type: 'CONT', keywords: ['EXPERIENCE'], condition: { if: 'EXPERIENCE', min: n(m[1]) }, apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: n(m[2]) }] },
      zh: `【永】經驗：如果我方 Level 置場卡牌的 Level 合計 ${m[1]} 或以上，這張卡 Power +${m[2]}。`,
    }),
  },
  {
    id: 'ENCORE_DISCARD_CHARACTER',
    re: new RegExp(`^【自】 アンコール ［手札のキャラを1枚控え室に置く］${REMINDER}$`),
    build: () => ({
      ability: encore([{ pay: 'DISCARD', count: 1, filter: { kind: 'CHARACTER' } }]),
      zh: '【自】Encore [把 1 張手牌角色放到控え室]：這張卡由舞台放到控え室時，可以支付費用；支付後把它 Rest 放回原本的枠。',
    }),
  },
  {
    id: 'BACKUP',
    re: new RegExp(`^【起】【カウンター】 助太刀(\\d+) レベル(\\d) ［(?:\\((\\d)\\) )?手札のこのカードを控え室に置く］${REMINDER}$`),
    build: (m) => ({
      ability: backup(n(m[1]), n(m[2]), [...(m[3] ? [{ pay: 'STOCK' as const, count: n(m[3]) }] : []), { pay: 'SELF_TO_WAITING_ROOM' as const }]),
      zh: `【起】【Counter】助太刀${m[1]} Level ${m[2]} [${m[3] ? `(${m[3]}) ` : ''}把手牌的這張卡放到控え室]：對手正面攻擊時的 Counter 步驟使用，選我方 1 張被正面攻擊的角色，該回合 Power +${m[1]}。自己的 Level 要達到 ${m[2]}。`,
    }),
  },
];

/** 《…》のキャラ: a character with that trait. */
const trait = (name: string | undefined) => ({ kind: 'CHARACTER' as const, traits: [name as string] });
/** あなたのCXフェイズ / クライマックスフェイズ: the card list writes it both ways. */
const CX_PHASE = '(?:CX|クライマックス)フェイズ';

LINE_PATTERNS.push(
  {
    id: 'POWER_WITH_OTHER_TRAIT',
    re: /^【永】 (あなたのターン中、)?他のあなたの《([^》]+)》のキャラが(?:(\d+)枚以上|いる)なら、このカードのパワーを＋(\d+)。$/,
    build: (m) => {
      const min = m[3] ? n(m[3]) : 1;
      const others = { if: 'CHARACTERS' as const, min, other: true, filter: trait(m[2]) };
      return {
        ability: { type: 'CONT', condition: m[1] ? { if: 'ALL', of: [{ if: 'YOUR_TURN' }, others] } : others, apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: n(m[4]) }] },
        zh: `【永】${m[1] ? '我方回合中，' : ''}如果我方其他《${m[2]}》角色有 ${min} 張或以上，這張卡 Power +${m[4]}。`,
      };
    },
  },
  {
    id: 'POWER_ALL_TRAIT',
    re: /^【永】 (あなたのターン中、)?あなたのキャラすべてが《([^》]+)》なら、このカードのパワーを＋(\d+)。$/,
    build: (m) => {
      const all = { if: 'ALL_CHARACTERS' as const, filter: trait(m[2]) };
      return {
        ability: { type: 'CONT', condition: m[1] ? { if: 'ALL', of: [{ if: 'YOUR_TURN' }, all] } : all, apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: n(m[3]) }] },
        zh: `【永】${m[1] ? '我方回合中，' : ''}如果我方所有角色都是《${m[2]}》，這張卡 Power +${m[3]}。`,
      };
    },
  },
  {
    id: 'POWER_PER_OTHER_TRAIT',
    re: /^【永】 他のあなたの《([^》]+)》のキャラ1枚につき、このカードのパワーを＋(\d+)。$/,
    build: (m) => ({
      ability: { type: 'CONT', apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: n(m[2]), per: { other: true, filter: trait(m[1]) } }] },
      zh: `【永】我方其他《${m[1]}》角色每有 1 張，這張卡 Power +${m[2]}。`,
    }),
  },
  {
    id: 'YOUR_TURN_OTHERS_TRAIT_POWER',
    re: /^【永】 あなたのターン中、他のあなたの《([^》]+)》のキャラすべてに、パワーを＋(\d+)。$/,
    build: (m) => ({
      ability: { type: 'CONT', condition: { if: 'YOUR_TURN' }, apply: [{ target: { who: 'ALL_YOURS', other: true, filter: trait(m[1]) }, stat: 'POWER', amount: n(m[2]) }] },
      zh: `【永】我方回合中，我方其他《${m[1]}》角色全部 Power +${m[2]}。`,
    }),
  },
  {
    id: 'CX_PHASE_TRAIT_BOOST',
    re: new RegExp(`^【自】 あなたの${CX_PHASE}の始めに、あなたは自分の《([^》]+)》のキャラを1枚選び、そのターン中、パワーを＋(\\d+)。$`),
    build: (m) => ({
      ability: {
        type: 'AUTO',
        trigger: { on: 'PHASE_START', phase: 'CLIMAX', turn: 'YOURS' },
        effect: [
          { do: 'CHOOSE', from: 'YOUR_STAGE', filter: trait(m[1]), min: 1, max: 1 },
          { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'POWER', amount: n(m[2]) },
        ],
      },
      zh: `【自】我方 Climax 階段開始時，選我方 1 張《${m[1]}》角色，該回合 Power +${m[2]}。`,
    }),
  },
  {
    id: 'PLACED_SELF_POWER',
    re: /^【自】 このカードが手札から舞台に置かれた時、(?:他のあなたの《([^》]+)》のキャラがいるなら、)?そのターン中、このカードのパワーを＋(\d+)。$/,
    build: (m) => ({
      ability: {
        type: 'AUTO',
        trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' },
        ...(m[1] ? { condition: { if: 'CHARACTERS' as const, min: 1, other: true, filter: trait(m[1]) } } : {}),
        effect: [{ do: 'MODIFY', target: { who: 'SELF' }, stat: 'POWER', amount: n(m[2]) }],
      },
      zh: `【自】這張卡由手牌放到舞台時，${m[1] ? `如果有我方其他《${m[1]}》角色，` : ''}這張卡該回合 Power +${m[2]}。`,
    }),
  },
  {
    id: 'ATTACK_SELF_POWER_WITH_OTHER_TRAIT',
    re: /^【自】 このカードがアタックした時、他のあなたの《([^》]+)》のキャラがいるなら、そのターン中、このカードのパワーを＋(\d+)。$/,
    build: (m) => ({
      ability: {
        type: 'AUTO',
        trigger: { on: 'ATTACKS' },
        condition: { if: 'CHARACTERS', min: 1, other: true, filter: trait(m[1]) },
        effect: [{ do: 'MODIFY', target: { who: 'SELF' }, stat: 'POWER', amount: n(m[2]) }],
      },
      zh: `【自】這張卡攻擊時，如果有我方其他《${m[1]}》角色，這張卡該回合 Power +${m[2]}。`,
    }),
  },
  {
    id: 'PLACED_TRAIT_COUNT_TO_STOCK',
    re: /^【自】 このカードが手札から舞台に置かれた時、他のあなたの《([^》]+)》のキャラが(\d+)枚以上なら、あなたは自分の控え室の《([^》]+)》のキャラを1枚選び、ストック置場に置いてよい。$/,
    build: (m) => ({
      ability: {
        type: 'AUTO',
        trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' },
        condition: { if: 'CHARACTERS', min: n(m[2]), other: true, filter: trait(m[1]) },
        optional: true,
        effect: [
          { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: trait(m[3]), min: 1, max: 1 },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'STOCK' },
        ],
      },
      zh: `【自】這張卡由手牌放到舞台時，如果我方其他《${m[1]}》角色有 ${m[2]} 張或以上，可以從控え室選 1 張《${m[3]}》角色放到 Stock。`,
    }),
  },
);

/** このカードが手札からCX置場 / クライマックス置場に置かれた時 */
const CX_PLACED = '【自】 このカードが手札から(?:CX|クライマックス)置場に置かれた時、';

LINE_PATTERNS.push(
  {
    id: 'CX_DRAW_UP_TO_ONE_CHOOSE_SOUL',
    // 1枚まで引き: "draw up to one" is a draw the player may decline. (Up to two or more is not supported.)
    re: new RegExp(`^${CX_PLACED}あなたは1枚まで引き、自分のキャラを(\\d)枚まで選び、そのターン中、ソウルを＋(\\d)。$`),
    build: (m) => ({
      ability: {
        type: 'AUTO',
        trigger: { on: 'THIS_CLIMAX_PLACED' },
        effect: [
          { do: 'DRAW', count: 1, optional: true },
          { do: 'CHOOSE', from: 'YOUR_STAGE', min: 0, max: n(m[1]) },
          { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'SOUL', amount: n(m[2]) },
        ],
      },
      zh: `【自】這張 Climax 由手牌放到 Climax 置場時：可以抽 1 張，然後選我方最多 ${m[1]} 張角色，該回合 Soul +${m[2]}。`,
    }),
  },
  {
    id: 'CX_WAITING_ROOM_TO_STOCK_ALL_SOUL',
    re: new RegExp(`^${CX_PLACED}あなたは自分の控え室のレベル(\\d)以下のキャラを1枚まで選び、ストック置場に置き、自分のキャラすべてに、そのターン中、ソウルを＋(\\d)。$`),
    build: (m) => ({
      ability: {
        type: 'AUTO',
        trigger: { on: 'THIS_CLIMAX_PLACED' },
        effect: [
          { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { kind: 'CHARACTER', levelMax: n(m[1]) }, min: 0, max: 1 },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'STOCK' },
          { do: 'MODIFY', target: { who: 'ALL_YOURS' }, stat: 'SOUL', amount: n(m[2]) },
        ],
      },
      zh: `【自】這張 Climax 由手牌放到 Climax 置場時：從控え室選最多 1 張 Level ${m[1]} 或以下的角色放到 Stock，然後我方所有角色該回合 Soul +${m[2]}。`,
    }),
  },
  {
    id: 'CX_SOUL_TRIGGER_TO_HAND_CHOOSE_SOUL',
    re: new RegExp(`^${CX_PLACED}あなたは自分の控え室のトリガーアイコンに\\[\\[soul\\.gif\\]\\]があるキャラを1枚まで選び、手札に戻し、自分のキャラを(\\d)枚まで選び、そのターン中、ソウルを＋(\\d)。$`),
    build: (m) => ({
      ability: {
        type: 'AUTO',
        trigger: { on: 'THIS_CLIMAX_PLACED' },
        effect: [
          { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { kind: 'CHARACTER', hasTrigger: 'SOUL' }, min: 0, max: 1 },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
          { do: 'CHOOSE', from: 'YOUR_STAGE', min: 0, max: n(m[1]) },
          { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'SOUL', amount: n(m[2]) },
        ],
      },
      zh: `【自】這張 Climax 由手牌放到 Climax 置場時：從控え室選最多 1 張 Trigger 圖示有 Soul 的角色加入手牌，然後選我方最多 ${m[1]} 張角色，該回合 Soul +${m[2]}。`,
    }),
  },
);

/** A trigger icon reminder: （[[gate.gif]]：このカードがトリガーした時、…）. */
const ICON_REMINDER = /^（\[\[[a-z_]+\.gif\]\]：[^（）]*）$/;

export const PATTERN_IDS: readonly string[] = LINE_PATTERNS.map((p) => p.id);

/** The lines of a card's text that are rules text (icon reminders removed). */
export function ruleLines(card: OfficialCard): string[] {
  if (card.text === '-' || card.text.trim() === '') return [];
  return card.text
    .split(/<br\s*\/?>/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !ICON_REMINDER.test(line));
}

/** Ability data for a character or climax made only of known sentences; null otherwise. Events are never compiled. */
export function compileText(card: OfficialCard): Compiled | null {
  const lines = ruleLines(card);
  if (lines.length === 0) return { zh: [card.kind === '2' ? '沒有能力的角色。' : '沒有文字。'], patterns: [] };
  if (card.kind === '3') return null;
  const abilities: Ability[] = [];
  const zh: string[] = [];
  const patterns: string[] = [];
  for (const line of lines) {
    let matched = false;
    for (const pattern of LINE_PATTERNS) {
      const m = pattern.re.exec(line);
      if (!m) continue;
      const built = pattern.build(m);
      abilities.push(built.ability);
      zh.push(built.zh);
      patterns.push(pattern.id);
      matched = true;
      break;
    }
    if (!matched) return null;
  }
  return { abilities, zh, patterns };
}
