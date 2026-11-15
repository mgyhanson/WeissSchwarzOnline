/**
 * Splits one line of official card text into its parts: ability type,
 * keywords, cost, trigger, conditions and effect sentences. It only cuts the
 * text where the card list's own punctuation says a part ends; it does not
 * decide what a part means. Used by the sentence grammar (grammar.ts) and by
 * the work list (scripts/analyse-card-worklist.ts).
 */

export interface LineParts {
  type: 'CONT' | 'AUTO' | 'ACT' | 'EVENT';
  /** 【CXコンボ】, 【カウンター】 and keyword words that stand before the cost, in order. */
  marks: string[];
  /** The actions inside ［…］, in order; null when the line has no cost. */
  cost: string[] | null;
  /** 【自】 only: the text up to and including "時" / "始めに". */
  trigger: string | null;
  /** Each "…なら" that stands before the effect, without "なら、". */
  conditions: string[];
  /** The effect sentences, each without its final "。". */
  effects: string[];
}

const KEYWORDS = ['集中', '応援', 'アンコール', '絆／', '経験', '記憶', '加速', 'チェンジ', '大活躍', 'アラーム', '助太刀', '回想', '共鳴', 'シフト', '搭乗'];

/** Reminder text in round brackets is not rules text (CR-1.3.x of the card list's own notes). */
const stripReminders = (text: string): string => text.replace(/ ?（[^（）]*(?:（[^（）]*）[^（）]*)*）/g, '');

/** Cuts a cost into its actions: "(1) 手札を1枚控え室に置き、このカードを【レスト】する". */
export function splitCost(cost: string): string[] {
  const parts: string[] = [];
  let rest = cost.trim();
  const stock = /^\((\d+)\) ?/.exec(rest);
  if (stock) {
    parts.push(`(${stock[1]})`);
    rest = rest.slice(stock[0].length);
  }
  if (rest) {
    // Actions are joined by "…し、" / "…置き、": cut at the comma that follows a verb stem.
    for (const piece of rest.split(/(?<=[しき])、/)) parts.push(piece.trim());
  }
  return parts;
}

/**
 * The parts of a line, or null when the line does not have the usual shape.
 * 『…』 (an ability given by the effect) is kept inside its sentence.
 */
export function splitLine(raw: string, kind: 'CHARACTER' | 'EVENT' | 'CLIMAX' = 'CHARACTER'): LineParts | null {
  let line = stripReminders(raw.trim());
  let type: LineParts['type'];
  const head = /^【(自|起|永)】 ?/.exec(line);
  if (head) {
    type = head[1] === '自' ? 'AUTO' : head[1] === '起' ? 'ACT' : 'CONT';
    line = line.slice(head[0].length);
  } else if (kind === 'EVENT') {
    type = 'EVENT';
  } else {
    return null;
  }
  const marks: string[] = [];
  for (;;) {
    const mark = /^【(CXコンボ|カウンター|リンク)】 ?/.exec(line);
    if (mark) {
      marks.push(mark[1]!);
      line = line.slice(mark[0].length);
      continue;
    }
    const keyword = KEYWORDS.find((k) => line.startsWith(k));
    if (keyword && type !== 'EVENT') {
      // A keyword word, with what belongs to it up to the next space (助太刀2000 レベル1, 絆／「…」).
      const word = /^(助太刀\d+ レベル\d|絆／「[^」]+」|\S+) ?/.exec(line)!;
      marks.push(word[1]!);
      line = line.slice(word[0].length);
      continue;
    }
    break;
  }
  let cost: string[] | null = null;
  const bracket = /^［([^］]*)］ ?/.exec(line);
  if (bracket) {
    cost = splitCost(bracket[1]!);
    line = line.slice(bracket[0].length);
  }

  // Sentences end at "。" outside 『…』.
  const sentences: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of line) {
    if (ch === '『') depth++;
    if (ch === '』') depth--;
    if (ch === '。' && depth === 0) {
      if (current.trim()) sentences.push(current.trim());
      current = '';
    } else current += ch;
  }
  if (current.trim()) sentences.push(current.trim());
  if (sentences.length === 0) return { type, marks, cost, trigger: null, conditions: [], effects: [] };

  let trigger: string | null = null;
  const conditions: string[] = [];
  let first = sentences[0]!;
  if (type === 'AUTO') {
    // The trigger ends at the last "時、" or "始めに、" before the effect begins.
    const cut = /^(.*?(?:時|始めに|終わりに))、/.exec(first);
    if (cut) {
      trigger = cut[1]!;
      first = first.slice(cut[0].length);
    }
  }
  // Leading conditions: "…なら、" (a condition never contains "、あなたは").
  for (;;) {
    const cond = /^((?:(?!あなたは|そのターン中)[^『』])*?)なら、/.exec(first);
    if (!cond || cond[1]!.includes('時')) break;
    conditions.push(cond[1]!);
    first = first.slice(cond[0].length);
  }
  sentences[0] = first;
  return { type, marks, cost, trigger, conditions, effects: sentences.filter((s) => s !== '') };
}

/** Numbers, names and traits replaced by placeholders, to compare the shape of two texts. */
export const shape = (text: string): string =>
  text
    .replace(/「[^」]*」/g, '「…」')
    .replace(/《[^》]*》/g, '《…》')
    .replace(/[0-9０-９]+/g, 'N');
