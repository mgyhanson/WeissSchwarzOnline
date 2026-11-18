/**
 * The card work list: what stands between each unsupported card and being
 * playable, computed from the official text and the sentence grammar. No
 * card text has to be read by a person (or an AI) to know where to work
 * next.
 *
 *   npm run cards:worklist            writes the three files below
 *   npm run cards:worklist -- STS     also prints the open cards of one set
 *   npm run cards:worklist -- --part "<text of an unknown part>"
 *                                     prints the cards waiting for that part
 *
 * For every unsupported card each line is split into its parts (trigger,
 * cost actions, conditions, effect sentences); the grammar says which parts
 * it does not know. Unknown parts are ranked by how many cards would become
 * playable if that part alone were added, then by how many cards use it.
 *
 * Output:
 *   reports/CARD_WORKLIST.md        ranking and per-set summary (in Git)
 *   reports/CARD_PATTERN_STATS.md   how often each part and pattern is used
 *   reports/CARD_IMPLEMENTATION_PROGRESS.md  per set and per effect group: implemented, tested, open
 *   reports/card_progress_history.json       one row per day the totals changed
 *   data.nosync/card-worklist.json  every open card with its unknown parts
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GRAMMAR, PATTERN_IDS, SETS, allCards, compileText, readLine, ruleLines, shape, splitLine } from '../card-database/src/index';
import { classifyUnsupported } from '../card-database/tests/classify';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const cards = allCards();
const open = cards.filter((c) => c.record.support === 'unsupported');
const classes = new Map(classifyUnsupported(cards).map((c) => [c.cardId, c.class]));

interface OpenCard {
  cardId: string;
  set: string;
  kind: string;
  level: number | null;
  class: string;
  /** Unknown parts, as "PART: shape of the text". */
  unknown: string[];
  lines: { text: string; known: boolean; unknown: string[] }[];
}

const partKey = (part: string, text: string) => `${part}: ${shape(text)}`;
/** Whether a whole-sentence pattern or the grammar knows this line: a card made of the line alone compiles exactly then. */
const lineKnown = (card: (typeof cards)[number], text: string): boolean => compileText({ ...card.official, text }) !== null;

const work: OpenCard[] = open.map((card) => {
  const lines = ruleLines(card.official).map((text) => {
    // An event is compiled only as a whole (one paragraph of known effect sentences).
    if (card.def.kind === 'EVENT') return { text, known: false, unknown: [`EVENT: ${shape(text).slice(0, 90)}`] };
    const known = lineKnown(card, text);
    return { text, known, unknown: known ? [] : readLine(text).unknown.map((u) => partKey(u.part, u.text)) };
  });
  const unknown = [...new Set(lines.flatMap((l) => l.unknown))];
  return {
    cardId: card.record.cardId,
    set: card.set,
    kind: card.def.kind,
    level: card.def.level,
    class: classes.get(card.record.cardId) ?? '?',
    // Every line known and still unsupported: something else holds the card back (see the card's notes).
    unknown: unknown.length > 0 ? unknown : [`HELD: ${(card.record.notes ?? ['?'])[0]!.slice(0, 60)}`],
    lines,
  };
});

/**
 * Cards left unsupported on purpose: the rules and the official Q&A do not settle how the effect is carried out.
 * They stay unsupported until an official source does.
 */
const DELIBERATE: Record<string, string> = {
  'BDY/W135-074': '「次の2つの効果を1回ずつ行う」：規則及官方 Q&A 沒有說明兩個效果的執行次序',
  'STS/W140-076': '「次の2つの効果を1回ずつ行う」：規則及官方 Q&A 沒有說明兩個效果的執行次序',
  // Batch 13: every paragraph of these events reads by itself, but nothing says how an event's paragraphs relate.
  'ANM/W138-023': 'Event 有兩段效果文字：綜合規則及官方 Q&A 沒有說明各段之間的關係（是否按次序全部執行）',
  'STS/W140-096': 'Event 有兩段效果文字：綜合規則及官方 Q&A 沒有說明各段之間的關係（是否按次序全部執行）',
  'NIK/S135-023': 'Event 有兩段效果文字（第二段有自己的 Cost）：綜合規則及官方 Q&A 沒有說明各段之間的關係',
  // Batch 9: "そのカードが…なら、そのカードを手札に戻し、…置いてよい" does not say whether taking the card back is part of the choice.
  'STS/W140-059': '「…手札に戻し、自分の山札の上から1枚を、控え室に置いてよい」：沒有說明「てよい」是否也包括放回手牌',
};

// Rank the unknown parts.
interface PartRow {
  part: string;
  cards: string[];
  /** Cards for which this is the only unknown part. */
  unlocks: string[];
}
const parts = new Map<string, PartRow>();
for (const item of work) {
  for (const part of item.unknown) {
    const row = parts.get(part) ?? { part, cards: [], unlocks: [] };
    row.cards.push(item.cardId);
    if (item.unknown.length === 1) row.unlocks.push(item.cardId);
    parts.set(part, row);
  }
}
const ranked = [...parts.values()].sort((a, b) => b.unlocks.length - a.unlocks.length || b.cards.length - a.cards.length);
const short = (cardId: string) => cardId.replace('/', '').replace(/^([A-Z0-9]+?)[WS]\d+-/, '$1-');
const setIds = SETS.map((s) => s.id).filter((id) => work.some((w) => w.set === id));
const count = <T>(list: T[], pred: (x: T) => boolean) => list.filter(pred).length;

// --- parts that occur together -------------------------------------------
// For every two and every three different unknown parts found together on at least one card: how many cards
// have all of them (together), and how many cards would be complete with them (every unknown part of the
// card is among them). Occurring together says nothing about one part needing the other.
// Cards held back because the rules are unclear are no targets, and neither are cards held back for another reason.
interface ComboRow {
  parts: string[];
  /** Cards that have every part of the combination. */
  together: string[];
  /** Cards all of whose unknown parts are in the combination. */
  unlocks: string[];
  /** Of those, the cards that need every part of it. */
  needAll: string[];
  /** Whether the parts are of one kind (all EFFECT, all TRIGGER, …): a hint at related work, nothing more. */
  sameKind: boolean;
}
const targets = work.filter((w) => !DELIBERATE[w.cardId] && !w.unknown.some((u) => u.startsWith('HELD: ')));
function combinations(size: 2 | 3): ComboRow[] {
  const keys = new Map<string, string[]>();
  for (const item of targets) {
    const own = [...new Set(item.unknown)].sort();
    const pick = (start: number, chosen: string[]): void => {
      if (chosen.length === size) {
        keys.set(JSON.stringify(chosen), chosen);
        return;
      }
      for (let k = start; k < own.length; k++) pick(k + 1, [...chosen, own[k]!]);
    };
    pick(0, []);
  }
  const rows = [...keys.values()].map((combo): ComboRow => {
    const has = (item: OpenCard) => combo.every((part) => item.unknown.includes(part));
    const within = (item: OpenCard) => item.unknown.every((part) => combo.includes(part));
    const unlocked = targets.filter(within);
    return {
      parts: combo,
      together: targets.filter(has).map((w) => w.cardId),
      unlocks: unlocked.map((w) => w.cardId),
      needAll: unlocked.filter(has).map((w) => w.cardId),
      sameKind: new Set(combo.map((part) => part.split(':')[0])).size === 1,
    };
  });
  return rows.sort((a, b) => b.unlocks.length - a.unlocks.length || b.together.length - a.together.length || Number(b.sameKind) - Number(a.sameKind) || a.parts.join().localeCompare(b.parts.join()));
}
const pairs = combinations(2);
const triples = combinations(3);
const cut = (part: string, length: number) => part.replace(/\|/g, '／').slice(0, length);
const comboTable = (rows: ComboRow[], top: number): string[] => [
  `| # | 片段 | 可解鎖 | 其中全部都需要 | 共現 | 同類 | 可解鎖的卡 |`,
  '|---:|---|---:|---:|---:|:---:|---|',
  ...rows.slice(0, top).map((row, i) => `| ${i + 1} | ${row.parts.map((part, k) => `（${k + 1}）${cut(part, 90)}`).join('<br>')} | ${row.unlocks.length} | ${row.needAll.length} | ${row.together.length} | ${row.sameKind ? '是' : '否'} | ${row.unlocks.map(short).join(' ')} |`),
];

// --- reports/CARD_WORKLIST.md ---------------------------------------------
const playable = (set: string) => cards.filter((c) => c.set === set && c.record.support === 'verified');
const md: string[] = [
  '# 卡牌工作清單',
  '',
  '> 由 `npm run cards:worklist` 產生（`scripts/analyse-card-worklist.ts`）。請勿手改。',
  '',
  '每張未支援的卡的每一句，都由程式拆成觸發、Cost、條件、效果片段，再由句子文法（`card-database/src/grammar.ts`）判斷哪些片段尚未認識。下一步做甚麼，看這份清單即可，不需要重讀卡牌原文。',
  '',
  '## 各系列',
  '',
  '| 系列 | 可對戰角色 | 可對戰 Event | 可對戰 Climax | 未支援 | 只差 1 個片段 | 只差 2 個片段 |',
  '|---|---:|---:|---:|---:|---:|---:|',
  ...setIds.map((id) => {
    const p = playable(id);
    const w = work.filter((x) => x.set === id);
    return `| ${id.replace('_', '/')} | ${count(p, (c) => c.def.kind === 'CHARACTER')} | ${count(p, (c) => c.def.kind === 'EVENT')} | ${count(p, (c) => c.def.kind === 'CLIMAX')} | ${w.length} | ${count(w, (x) => x.unknown.length === 1)} | ${count(w, (x) => x.unknown.length === 2)} |`;
  }),
  '',
  `未支援合計 ${work.length} 張；未認識的片段共 ${ranked.length} 種。`,
  '',
  '## 最值得做的片段（按「只差這一個片段就可對戰的卡數」排序）',
  '',
  '「解鎖」是只差這個片段的卡；「涉及」是所有用到這個片段的卡。片段中的數字、特徵及卡名已換成 N、《…》、「…」。',
  '',
  '| # | 片段 | 解鎖 | 涉及 | 解鎖的卡 |',
  '|---:|---|---:|---:|---|',
  ...ranked.slice(0, 80).map((row, i) => `| ${i + 1} | ${row.part.replace(/\|/g, '／').slice(0, 110)} | ${row.unlocks.length} | ${row.cards.length} | ${row.unlocks.map(short).join(' ')} |`),
  '',
  '## 兩個片段的組合（共現分析）',
  '',
  '所有在同一張卡上一同出現的兩個不同片段。「可解鎖」是完成這兩個片段後全部片段都已認識的卡（包括只需要其中一個的卡）；「其中全部都需要」是兩個都要用到的卡；「共現」是同時有這兩個片段的卡（可能還欠其他片段）。「同類」只表示兩個片段屬於同一種（例如都是效果句子），**一同出現不代表互相依賴**。因規則不明確而刻意不支援的卡不計算在內。',
  '',
  `共 ${pairs.length} 個組合；以下是首 25 個。`,
  '',
  ...comboTable(pairs, 25),
  '',
  '## 三個片段的組合（共現分析）',
  '',
  `計算方法同上。共 ${triples.length} 個組合；以下是首 15 個。`,
  '',
  ...comboTable(triples, 15),
  '',
  '## 只差 1 個片段的卡（按系列）',
  '',
  ...setIds.flatMap((id) => {
    const own = work.filter((x) => x.set === id && x.unknown.length === 1);
    return [`- **${id.replace('_', '/')}**（${own.length}）：${own.map((x) => `${x.cardId.split('-')[1]}${x.kind === 'CHARACTER' ? `·L${x.level}` : x.kind === 'EVENT' ? '·Ev' : '·CX'}`).join('、')}`];
  }),
  '',
  '## 只差 2 個片段的卡（按系列）',
  '',
  ...setIds.flatMap((id) => {
    const own = work.filter((x) => x.set === id && x.unknown.length === 2);
    return [`- **${id.replace('_', '/')}**（${own.length}）：${own.map((x) => `${x.cardId.split('-')[1]}${x.kind === 'CHARACTER' ? `·L${x.level}` : x.kind === 'EVENT' ? '·Ev' : '·CX'}`).join('、')}`];
  }),
  '',
];
writeFileSync(join(ROOT, 'reports/CARD_WORKLIST.md'), `${md.join('\n')}\n`);

// --- reports/CARD_PATTERN_STATS.md ----------------------------------------
const tally = new Map<string, Map<string, { known: boolean; cards: Set<string> }>>();
const add = (group: string, text: string, known: boolean, cardId: string) => {
  const g = tally.get(group) ?? new Map();
  const row = g.get(shape(text)) ?? { known, cards: new Set<string>() };
  row.cards.add(cardId);
  g.set(shape(text), row);
  tally.set(group, g);
};
for (const card of cards) {
  if (card.def.kind === 'EVENT') continue;
  for (const text of ruleLines(card.official)) {
    const split = splitLine(text);
    if (!split) continue;
    const unknown = new Set(readLine(text).unknown.map((u) => shape(u.text)));
    const lineKnown = readLine(text).line !== null;
    if (split.trigger) add('觸發', split.trigger, lineKnown || !unknown.has(shape(split.trigger)), card.record.cardId);
    for (const c of split.cost ?? []) add('Cost', c, lineKnown || !unknown.has(shape(c)), card.record.cardId);
    for (const c of split.conditions) add('條件', c, lineKnown || !unknown.has(shape(c)), card.record.cardId);
    for (const c of split.effects) add('效果句子', c, lineKnown || !unknown.has(shape(c)), card.record.cardId);
  }
}
const usage = (id: string) => count(cards, (c) => c.record.patterns?.includes(id) ?? false);
const stats: string[] = [
  '# 句式及片段統計',
  '',
  '> 由 `npm run cards:worklist` 產生。請勿手改。',
  '',
  `資料庫 ${cards.length} 張卡：可對戰 ${count(cards, (c) => c.record.support === 'verified')}（人手 ${count(cards, (c) => !c.record.origin && c.record.support === 'verified')}、自動 ${count(cards, (c) => c.record.origin === 'PATTERN')}），未支援 ${work.length}。`,
  '',
  '## 自動產生的卡用到的句式',
  '',
  '| 句式 | 卡數 |',
  '|---|---:|',
  `| 句子文法（${GRAMMAR}：由已知片段組成的句子） | ${usage(GRAMMAR)} |`,
  ...PATTERN_IDS.map((id) => `| ${id} | ${usage(id)} |`),
  '',
  '## 片段出現次數（全部 609 張卡的角色及 Climax 文字；「已認識」指文法認識這個片段）',
  '',
  ...[...tally].flatMap(([group, rows]) => {
    const list = [...rows].sort((a, b) => b[1].cards.size - a[1].cards.size);
    return [
      `### ${group}：${list.length} 種，已認識 ${count(list, ([, r]) => r.known)} 種`,
      '',
      '| 片段 | 卡數 | 已認識 |',
      '|---|---:|:---:|',
      ...list.slice(0, 40).map(([text, r]) => `| ${text.replace(/\|/g, '／').slice(0, 100)} | ${r.cards.size} | ${r.known ? '✓' : ''} |`),
      '',
    ];
  }),
];
writeFileSync(join(ROOT, 'reports/CARD_PATTERN_STATS.md'), `${stats.join('\n')}\n`);

// --- reports/CARD_IMPLEMENTATION_PROGRESS.md -------------------------------
const boosters = new Set(setIds);
const isPlayable = (cardId: string) => cards.find((c) => c.record.cardId === cardId)!.record.support === 'verified';
const inBooster = (cardId: string) => boosters.has(cards.find((c) => c.record.cardId === cardId)!.set);
const groups = [...tally].flatMap(([group, rows]) =>
  [...rows].map(([text, r]) => {
    const own = [...r.cards].filter(inBooster);
    const done = own.filter(isPlayable).length;
    return { group, text, known: r.known, total: own.length, done, open: own.length - done };
  }),
);
const totals = {
  date: new Date().toISOString().slice(0, 10),
  cards: cards.length,
  playable: count(cards, (c) => c.record.support === 'verified'),
  handWritten: count(cards, (c) => !c.record.origin && c.record.support === 'verified'),
  wholeSentencePatterns: count(cards, (c) => c.record.origin === 'PATTERN' && !c.record.patterns!.includes(GRAMMAR)),
  grammar: usage(GRAMMAR),
  unsupported: work.length,
  bySet: Object.fromEntries(SETS.map((s) => [s.id, count(cards, (c) => c.set === s.id && c.record.support === 'verified')])),
};
const historyFile = join(ROOT, 'reports/card_progress_history.json');
const history: (typeof totals)[] = existsSync(historyFile) ? JSON.parse(readFileSync(historyFile, 'utf8')) : [];
const last = history[history.length - 1];
if (!last || last.playable !== totals.playable || last.grammar !== totals.grammar || last.handWritten !== totals.handWritten) {
  if (last && last.date === totals.date) history[history.length - 1] = totals;
  else history.push(totals);
  writeFileSync(historyFile, `${JSON.stringify(history, null, 1)}\n`);
}
const groupRows = (rows: typeof groups) =>
  rows.map((g) => `| ${g.group} | ${g.text.replace(/\|/g, '／').slice(0, 90)} | ${g.total} | ${g.done} | ${g.done} | ${g.open} |`);
const progress: string[] = [
  '# 卡牌實裝進度',
  '',
  '> 由 `npm run cards:worklist` 產生。請勿手改。下一批開發由這份紀錄及 `CARD_WORKLIST.md` 繼續，不需要重新分析整個專案。',
  '',
  '## 目前狀態',
  '',
  '| 系列 | 卡數 | 可對戰 | 人手編寫 | 整句句式 | 句子文法 | 未支援 |',
  '|---|---:|---:|---:|---:|---:|---:|',
  ...SETS.map((set) => {
    const own = cards.filter((c) => c.set === set.id);
    const auto = own.filter((c) => c.record.origin === 'PATTERN');
    return `| ${set.id.replace('_', '/')} | ${own.length} | ${count(own, (c) => c.record.support === 'verified')} | ${count(own, (c) => !c.record.origin && c.record.support === 'verified')} | ${count(auto, (c) => !c.record.patterns!.includes(GRAMMAR))} | ${count(auto, (c) => c.record.patterns!.includes(GRAMMAR))} | ${count(own, (c) => c.record.support === 'unsupported')} |`;
  }),
  `| **合計** | ${totals.cards} | ${totals.playable} | ${totals.handWritten} | ${totals.wholeSentencePatterns} | ${totals.grammar} | ${totals.unsupported} |`,
  '',
  '## 歷次紀錄',
  '',
  '| 日期 | 可對戰 | 人手 | 整句句式 | 句子文法 | 未支援 |',
  '|---|---:|---:|---:|---:|---:|',
  ...history.map((h) => `| ${h.date} | ${h.playable} | ${h.handWritten} | ${h.wholeSentencePatterns} | ${h.grammar} | ${h.unsupported} |`),
  '',
  '## 效果組別（五個補充包的角色及 Climax 文字）',
  '',
  '「涉及」是文字中有這個片段的卡；「已實裝」是其中可對戰的卡；可對戰的卡全部有測試（人手卡逐張測試；自動產生的卡有反向核對及完整對局），所以「已測試」與「已實裝」相同；「尚未完成」的卡還有其他未認識的片段，或這個片段本身未認識。',
  '',
  '### 文法已認識的片段（按尚未完成的卡數排序，前 60 項）',
  '',
  '| 類別 | 片段 | 涉及 | 已實裝 | 已測試 | 尚未完成 |',
  '|---|---|---:|---:|---:|---:|',
  ...groupRows(groups.filter((g) => g.known).sort((a, b) => b.open - a.open || b.total - a.total).slice(0, 60)),
  '',
  '### 文法未認識的片段（按涉及卡數排序，前 60 項）',
  '',
  '| 類別 | 片段 | 涉及 | 已實裝 | 已測試 | 尚未完成 |',
  '|---|---|---:|---:|---:|---:|',
  ...groupRows(groups.filter((g) => !g.known).sort((a, b) => b.total - a.total).slice(0, 60)),
  '',
];
writeFileSync(join(ROOT, 'reports/CARD_IMPLEMENTATION_PROGRESS.md'), `${progress.join('\n')}\n`);

// --- reports/LEVEL_3_IMPLEMENTATION.md --------------------------------------
const level3 = cards.filter((c) => c.def.level === 3 && boosters.has(c.set));
const open3 = work.filter((w) => w.level === 3);
const l3Parts = ranked
  .map((row) => ({ ...row, l3: row.cards.filter((id) => open3.some((w) => w.cardId === id)), l3Unlocks: row.unlocks.filter((id) => open3.some((w) => w.cardId === id)) }))
  .filter((row) => row.l3.length > 0)
  .sort((a, b) => b.l3.length - a.l3.length || b.cards.length - a.cards.length);
const kindZh = (kind: string) => (kind === 'CHARACTER' ? '角色' : kind === 'EVENT' ? 'Event' : 'Climax');
const l3: string[] = [
  '# Level 3 卡牌實裝狀況',
  '',
  '> 由 `npm run cards:worklist` 產生。請勿手改。',
  '',
  '| 系列 | Level 3 卡數 | 可對戰 | 未支援 | 只差 1 個片段 |',
  '|---|---:|---:|---:|---:|',
  ...setIds.map((id) => {
    const own = level3.filter((c) => c.set === id);
    return `| ${id.replace('_', '/')} | ${own.length} | ${count(own, (c) => c.record.support === 'verified')} | ${count(own, (c) => c.record.support !== 'verified')} | ${count(open3, (w) => w.set === id && w.unknown.length === 1)} |`;
  }),
  `| **合計** | ${level3.length} | ${count(level3, (c) => c.record.support === 'verified')} | ${open3.length} | ${count(open3, (w) => w.unknown.length === 1)} |`,
  '',
  '## 擋住 Level 3 卡的片段（按涉及的 Level 3 卡數排序）',
  '',
  '「L3 解鎖」是只差這個片段的 Level 3 卡；「全部涉及」包括其他 Level 的卡。',
  '',
  '| 片段 | L3 涉及 | L3 解鎖 | 全部涉及 | 涉及的 Level 3 卡 |',
  '|---|---:|---:|---:|---|',
  ...l3Parts.map((row) => `| ${row.part.replace(/\|/g, '／').slice(0, 100)} | ${row.l3.length} | ${row.l3Unlocks.length} | ${row.cards.length} | ${row.l3.map(short).join(' ')} |`),
  '',
  '## 全部 Level 3 卡',
  '',
  '| 卡號 | 卡名 | 種類 | Cost | 狀態 | 尚欠的片段 |',
  '|---|---|---|---:|---|---|',
  ...level3.map((c) => {
    const item = open3.find((w) => w.cardId === c.record.cardId);
    const state = !item ? (c.record.origin === 'PATTERN' ? '可對戰（自動）' : '可對戰（人手）') : `未支援（${item.class} 類，欠 ${item.unknown.length} 個）`;
    return `| ${c.record.cardId} | ${c.def.name.replace(/\|/g, '／')} | ${kindZh(c.def.kind)} | ${c.def.cost ?? '-'} | ${state} | ${item ? item.unknown.map((u) => u.replace(/\|/g, '／').slice(0, 70)).join('<br>') : ''} |`;
  }),
  '',
];
writeFileSync(join(ROOT, 'reports/LEVEL_3_IMPLEMENTATION.md'), `${l3.join('\n')}\n`);

// --- reports/IMPLEMENTATION_CHECKPOINT.md -----------------------------------
// `--batch "<title>" "<what was done>" "<next>"` adds an entry with the numbers of this moment.
interface Batch { date: string; title: string; done: string; next: string; playable: number; unsupported: number; level3Playable: number; level3Open: number; bySet: Record<string, number> }
const batchFile = join(ROOT, 'reports/implementation-batches.json');
const batches: Batch[] = existsSync(batchFile) ? JSON.parse(readFileSync(batchFile, 'utf8')) : [];
const batchArg = args.indexOf('--batch');
if (batchArg >= 0) {
  batches.push({
    date: totals.date,
    title: args[batchArg + 1] ?? '',
    done: args[batchArg + 2] ?? '',
    next: args[batchArg + 3] ?? '',
    playable: totals.playable,
    unsupported: totals.unsupported,
    level3Playable: count(level3, (c) => c.record.support === 'verified'),
    level3Open: open3.length,
    bySet: totals.bySet,
  });
  writeFileSync(batchFile, `${JSON.stringify(batches, null, 1)}\n`);
}
const checkpoint: string[] = [
  '# 實裝檢查點',
  '',
  '> 由 `npm run cards:worklist` 產生；批次紀錄來自 `reports/implementation-batches.json`（用 `npm run cards:worklist -- --batch "標題" "完成內容" "下一步"` 加入）。',
  '>',
  '> **重新開始工作時先讀這一份**，然後直接看「下一步」及 `CARD_WORKLIST.md`，不需要重新分析整個專案。',
  '',
  '## 現況',
  '',
  `- 可對戰 ${totals.playable}／${totals.cards}（人手 ${totals.handWritten}、整句句式 ${totals.wholeSentencePatterns}、句子文法 ${totals.grammar}）；未支援 ${totals.unsupported}。`,
  `- Level 3（五個補充包）：可對戰 ${count(level3, (c) => c.record.support === 'verified')}／${level3.length}；未支援 ${open3.length}。`,
  `- 各系列可對戰：${setIds.map((id) => `${id.split('_')[0]} ${totals.bySet[id]}`).join('、')}。`,
  `- 未認識的片段 ${ranked.length} 種；只差 1 個片段的卡 ${count(work, (x) => x.unknown.length === 1)} 張，只差 2 個的 ${count(work, (x) => x.unknown.length === 2)} 張。`,
  '',
  '## 下一個最值得處理的片段',
  '',
  ...ranked.slice(0, 12).map((row, i) => `${i + 1}. ${row.part.slice(0, 110)}（解鎖 ${row.unlocks.length}，涉及 ${row.cards.length}）`),
  '',
  '## 位置',
  '',
  '- 文法：`card-database/src/grammar.ts`（片段切分：`fragments.ts`）；反向核對：`card-database/tests/render-ja.ts`；測試：`card-database/tests/grammar.test.ts`。',
  '- 引擎構件：`game-engine/src/abilities/{types,effects,query}.ts`、`game-engine/src/flow/autos.ts`；構件測試：`game-engine/tests/abilities-batch-*.test.ts`。',
  '- 人手卡：`card-database/sets/<系列>/cards.ts`；測試卡組：`card-database/src/decks.ts`。',
  '- 開發期間只跑相關測試：`npx vitest run card-database/tests/grammar game-engine/tests/abilities-batch`；整批完成後才跑完整 QA。',
  '',
  '## 批次紀錄（最新在最後）',
  '',
  '| 日期 | 批次 | 完成內容 | 可對戰 | Level 3 可對戰 | 未支援 | 下一步 |',
  '|---|---|---|---:|---:|---:|---|',
  ...batches.map((b) => `| ${b.date} | ${b.title} | ${b.done} | ${b.playable} | ${b.level3Playable} | ${b.unsupported} | ${b.next} |`),
  '',
];
writeFileSync(join(ROOT, 'reports/IMPLEMENTATION_CHECKPOINT.md'), `${checkpoint.join('\n')}\n`);

// --- reports/BATCH_3_PRIORITY.md ---------------------------------------------
// Each unknown part scored by what it unlocks (all cards, Level 3 cards), how many sets it reaches and how hard it
// looks. Difficulty is a rough reading of the part's own words; it only orders the list.
const hard = /かわりに|追加の|ターン|できない|選ばれない|相手は|トリガーした時|キャンセル|入れ替え|同じカード名|次の.*の始めに|動かす|色条件/;
const medium = /Ｘ|好きな順番|公開|マーカー|回想|リンク|与える|得る|次の\d+つ|つの効果/;
const difficulty = (part: string): '低' | '中' | '高' => (hard.test(part) ? '高' : medium.test(part) ? '中' : '低');
const weight = { 低: 1, 中: 2, 高: 3 } as const;
const open3Ids = new Set(open3.map((w) => w.cardId));
const scored = ranked
  .map((row) => {
    const sets = [...new Set(row.cards.map((id) => id.split('/')[0]))];
    const l3 = row.cards.filter((id) => open3Ids.has(id)).length;
    const l3Unlocks = row.unlocks.filter((id) => open3Ids.has(id)).length;
    const level = difficulty(row.part);
    const score = (row.unlocks.length * 3 + l3Unlocks * 4 + row.cards.length + l3 * 2 + sets.length) / weight[level];
    return { ...row, sets, l3, l3Unlocks, level, score };
  })
  .sort((a, b) => b.score - a.score);
const priority: string[] = [
  '# Batch 3 實裝優先次序',
  '',
  '> 由 `npm run cards:worklist` 產生。請勿手改。',
  '',
  '分數 =（解鎖卡數×3 ＋ 解鎖的 Level 3×4 ＋ 涉及卡數 ＋ 涉及的 Level 3×2 ＋ 涉及系列數）÷ 難度（低 1、中 2、高 3）。難度只按片段本身的用語粗略判斷，用來排序，不代表已分析規則。',
  '',
  '| # | 片段（機制） | 解鎖卡數 | Level 3 解鎖／涉及 | 涉及卡數 | 涉及系列 | 難度 | 分數 |',
  '|---:|---|---:|---:|---:|---|:---:|---:|',
  ...scored.slice(0, 60).map((row, i) => `| ${i + 1} | ${row.part.replace(/\|/g, '／').slice(0, 90)} | ${row.unlocks.length} | ${row.l3Unlocks}／${row.l3} | ${row.cards.length} | ${row.sets.join(' ')} | ${row.level} | ${row.score.toFixed(1)} |`),
  '',
];
writeFileSync(join(ROOT, 'reports/BATCH_3_PRIORITY.md'), `${priority.join('\n')}\n`);

// --- reports/BATCH_3_PROGRESS.md ---------------------------------------------
const b3 = batches.filter((b) => b.title.startsWith('B3'));
const batch3: string[] = [
  '# Batch 3 進度',
  '',
  '> 由 `npm run cards:worklist` 產生；每批用 `npm run cards:worklist -- --batch "B3-…" "完成內容" "下一步"` 記錄。',
  '',
  '| 日期 | 批次 | 完成內容 | 可對戰 | Level 3 | 未支援 | GUP | BDY | STS | ANM | NIK | 下一步 |',
  '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|',
  ...b3.map((b) => `| ${b.date} | ${b.title} | ${b.done} | ${b.playable} | ${b.level3Playable} | ${b.unsupported} | ${b.bySet.GUP_W141} | ${b.bySet.BDY_W135} | ${b.bySet.STS_W140} | ${b.bySet.ANM_W138} | ${b.bySet.NIK_S135} | ${b.next} |`),
  '',
];
writeFileSync(join(ROOT, 'reports/BATCH_3_PROGRESS.md'), `${batch3.join('\n')}\n`);

// --- reports/BATCH_4_PROGRESS.md … BATCH_8_PROGRESS.md ------------------------
/** The four states of the card pool, from the same data as the rest of this file. */
function fourStates(): string[] {
  const short = (id: string) => `${id.split('/')[0]}-${id.split('-').pop()}`;
  const deliberate = work.filter((w) => DELIBERATE[w.cardId]);
  const rest = work.filter((w) => !DELIBERATE[w.cardId]);
  const partial = rest.filter((w) => w.lines.some((l) => l.known));
  const none = rest.filter((w) => !w.lines.some((l) => l.known));
  const playable = count(cards, (c) => c.record.support === 'verified');
  if (playable + partial.length + none.length + deliberate.length !== cards.length) throw new Error('The four states do not add up to the card pool');
  const list = (items: OpenCard[]) => items.map((w) => short(w.cardId)).join('、') || '—';
  return [
    '## 四種狀態（程式計算）',
    '',
    '每張卡只屬於其中一種；未達「已實作並通過測試」的卡一律標記為未支援，不會進入對戰。',
    '',
    '| 狀態 | 卡數 | 意思 |',
    '|---|---:|---|',
    `| 已實作並通過測試 | ${playable} | 整張卡的資料已寫成並通過測試：每一行都能由資料寫回官方日文原文，並在隨機對局中實際執行；本批新增的卡另有逐張的真實卡牌測試 |`,
    `| 部分實作 | ${partial.length} | 卡上部分能力的文字已能讀取，其餘未能讀取；整張卡仍然不開放 |`,
    `| 尚未實作 | ${none.length} | 卡上沒有一行能力能讀取（Event 必須整張讀取） |`,
    `| 因規則或 Q&A 不明確而刻意不支援 | ${deliberate.length} | 文字能讀取，但規則及官方 Q&A 沒有說明如何執行；找到官方依據前不支援 |`,
    '',
    `**部分實作（${partial.length}）**：${list(partial)}`,
    '',
    `**尚未實作（${none.length}）**：${list(none)}`,
    '',
    `**刻意不支援（${deliberate.length}）**：`,
    '',
    ...deliberate.map((w) => `- ${short(w.cardId)}：${DELIBERATE[w.cardId]}`),
    '',
    '每張未支援卡欠缺的部分見 `reports/CARD_WORKLIST.md`。',
    '',
  ];
}

/** The batch whose progress file carries the four states as they are now. */
const LATEST_BATCH = 14;
for (const n of [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]) {
  const rows = batches.filter((b) => b.title.startsWith(`B${n}`));
  writeFileSync(
    join(ROOT, `reports/BATCH_${n}_PROGRESS.md`),
    `${[
      `# Batch ${n} 進度`,
      '',
      `> 由 \`npm run cards:worklist\` 產生；每批用 \`npm run cards:worklist -- --batch "B${n}-…" "完成內容" "下一步"\` 記錄。`,
      '',
      '| 日期 | 批次 | 完成內容 | 可對戰 | Level 3 | 未支援 | GUP | BDY | STS | ANM | NIK | 下一步 |',
      '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|',
      ...rows.map((b) => `| ${b.date} | ${b.title} | ${b.done} | ${b.playable} | ${b.level3Playable} | ${b.unsupported} | ${b.bySet.GUP_W141} | ${b.bySet.BDY_W135} | ${b.bySet.STS_W140} | ${b.bySet.ANM_W138} | ${b.bySet.NIK_S135} | ${b.next} |`),
      '',
      ...(n === LATEST_BATCH ? fourStates() : n >= 7 ? [`四種狀態的現時卡號清單見 \`reports/BATCH_${LATEST_BATCH}_PROGRESS.md\`（由程式按現況計算）；本批完成時的數字記錄在 \`reports/RULES_IMPLEMENTATION_REPORT.md\` 的相應章節。`, ''] : []),
    ].join('\n')}\n`,
  );
}

// --- one source for the support numbers ------------------------------------
// reports/card_support_summary.json, and the block between the support-summary markers in the
// hand-written reports, are all written from here; no other file states the current numbers.
const kinds = ['CHARACTER', 'EVENT', 'CLIMAX'] as const;
const classCount = (cls: string) => count(work, (w) => w.class === cls);
const summary = {
  total: cards.length,
  playable: count(cards, (c) => c.record.support === 'verified'),
  unsupported: work.length,
  bySet: SETS.map((set) => {
    const inSet = cards.filter((c) => c.set === set.id);
    return {
      set: set.id,
      total: inSet.length,
      playable: count(inSet, (c) => c.record.support === 'verified'),
      byKind: Object.fromEntries(kinds.map((k) => [k, { total: count(inSet, (c) => c.def.kind === k), playable: count(inSet, (c) => c.def.kind === k && c.record.support === 'verified') }])),
      level3: { total: count(inSet, (c) => c.def.level === 3), playable: count(inSet, (c) => c.def.level === 3 && c.record.support === 'verified') },
    };
  }),
  level3: { total: level3.length, playable: count(level3, (c) => c.record.support === 'verified') },
  classes: Object.fromEntries(['A', 'B', 'C', 'D', 'E'].map((cls) => [cls, classCount(cls)])),
  topParts: ranked.slice(0, 10).map((r) => ({ part: r.part, unlocks: r.unlocks.length, cards: r.cards.length })),
};
writeFileSync(join(ROOT, 'reports/card_support_summary.json'), `${JSON.stringify(summary, null, 1)}\n`);
const setName = (id: string) => id.replace('_', '/');
const summaryMd = [
  `<!-- support-summary:start (由 npm run cards:worklist 產生，請勿手改；數字只以此為準) -->`,
  `**目前卡牌支援（${new Date().toISOString().slice(0, 10)}，程式計算）**：${summary.total} 張中 **${summary.playable} 張可對戰**，未支援 ${summary.unsupported} 張；Level 3 ${summary.level3.playable}/${summary.level3.total}。`,
  '',
  '| 系列 | 卡數 | 可對戰 | 角色 | Event | Climax | Level 3 |',
  '|---|---:|---:|---:|---:|---:|---:|',
  ...summary.bySet.map(
    (r) =>
      `| ${setName(r.set)} | ${r.total} | ${r.playable} | ${r.byKind.CHARACTER!.playable}/${r.byKind.CHARACTER!.total} | ${r.byKind.EVENT!.playable}/${r.byKind.EVENT!.total} | ${r.byKind.CLIMAX!.playable}/${r.byKind.CLIMAX!.total} | ${r.level3.total > 0 ? `${r.level3.playable}/${r.level3.total}` : '-'} |`,
  ),
  `| **合計** | ${summary.total} | ${summary.playable} | | | | 五個補充包 ${summary.level3.playable}/${summary.level3.total} |`,
  '',
  `未支援分類（初步，只用作排序）：A ${summary.classes.A}、B ${summary.classes.B}、C ${summary.classes.C}、D ${summary.classes.D}、E ${summary.classes.E}。詳細見 \`reports/CARD_WORKLIST.md\`。`,
  '<!-- support-summary:end -->',
].join('\n');
writeFileSync(join(ROOT, 'reports/CARD_SUPPORT_SUMMARY.md'), `# 卡牌支援摘要\n\n${summaryMd}\n`);
for (const file of ['README.md', 'reports/CARD_DATABASE_REPORT.md', 'reports/RULES_IMPLEMENTATION_REPORT.md', 'reports/TEST_REPORT.md']) {
  const path = join(ROOT, file);
  const text = readFileSync(path, 'utf8');
  const replaced = text.replace(/<!-- support-summary:start[\s\S]*?<!-- support-summary:end -->/, summaryMd);
  if (replaced !== text) writeFileSync(path, replaced);
}

// --- what changed since the previous run (data.nosync/worklist-previous.json) --
const previousFile = join(ROOT, 'data.nosync/worklist-previous.json');
const previous: { playable: string[]; textHash: Record<string, string> } = existsSync(previousFile) ? JSON.parse(readFileSync(previousFile, 'utf8')) : { playable: [], textHash: {} };
const playableNow = cards.filter((c) => c.record.support === 'verified').map((c) => c.record.cardId);
const hashOf = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16);
const textHash = Object.fromEntries(cards.map((c) => [c.record.cardId, hashOf(c.official.text)]));
const gained = playableNow.filter((id) => !previous.playable.includes(id));
const lost = previous.playable.filter((id) => !playableNow.includes(id));
const changedText = Object.keys(textHash).filter((id) => previous.textHash[id] !== undefined && previous.textHash[id] !== textHash[id]);
writeFileSync(previousFile, `${JSON.stringify({ playable: playableNow, textHash })}\n`);

// --- data.nosync/card-worklist.json ---------------------------------------
mkdirSync(join(ROOT, 'data.nosync'), { recursive: true });
writeFileSync(join(ROOT, 'data.nosync/card-worklist.json'), `${JSON.stringify({ generatedBy: 'npm run cards:worklist', cards: work, parts: ranked }, null, 1)}\n`);

// --- console: compact ------------------------------------------------------
console.log(`unsupported ${work.length}; unknown parts ${ranked.length}; one part away ${count(work, (x) => x.unknown.length === 1)}; two ${count(work, (x) => x.unknown.length === 2)}`);
if (previous.playable.length > 0) {
  const l3Gained = gained.filter((id) => cards.find((c) => c.record.cardId === id)!.def.level === 3);
  console.log(`since last run: +${gained.length} playable (Level 3 +${l3Gained.length})${lost.length ? `, -${lost.length}: ${lost.join(' ')}` : ''}${changedText.length ? `, official text changed: ${changedText.join(' ')}` : ''}`);
  if (gained.length) console.log(`  new: ${gained.map(short).join(' ')}`);
}
console.log(`next by priority: ${scored[0]?.part.slice(0, 100) ?? '-'} (unlocks ${scored[0]?.unlocks.length ?? 0}, Level 3 ${scored[0]?.l3 ?? 0})`);
const partArg = args.indexOf('--part');
if (partArg >= 0) {
  const row = ranked.find((r) => r.part.includes(args[partArg + 1] ?? '\u0000'));
  if (!row) console.log('no such part');
  else for (const id of row.cards) console.log(id, work.find((w) => w.cardId === id)!.lines.map((l) => `${l.known ? '✓' : '✗'} ${l.text}`).join('\n    '));
} else if (args[0] && !args[0].startsWith('--')) {
  for (const item of work.filter((w) => w.set.startsWith(args[0]!) && w.unknown.length <= Number(args[1] ?? 1))) console.log(`${item.cardId} L${item.level} ${item.kind}: ${item.unknown.join(' ｜ ')}`);
} else {
  const top = Number(process.env.TOP ?? 25);
  for (const row of ranked.slice(0, top)) console.log(`${String(row.unlocks.length).padStart(3)} ${String(row.cards.length).padStart(3)}  ${row.part.slice(0, 120)}  [${row.unlocks.map(short).join(' ')}]`);
}
