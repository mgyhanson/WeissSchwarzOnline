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
  '## 只差 1 個片段的卡（按系列）',
  '',
  ...setIds.flatMap((id) => {
    const own = work.filter((x) => x.set === id && x.unknown.length === 1);
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

// --- data.nosync/card-worklist.json ---------------------------------------
mkdirSync(join(ROOT, 'data.nosync'), { recursive: true });
writeFileSync(join(ROOT, 'data.nosync/card-worklist.json'), `${JSON.stringify({ generatedBy: 'npm run cards:worklist', cards: work, parts: ranked }, null, 1)}\n`);

// --- console: compact ------------------------------------------------------
console.log(`unsupported ${work.length}; unknown parts ${ranked.length}; one part away ${count(work, (x) => x.unknown.length === 1)}; two ${count(work, (x) => x.unknown.length === 2)}`);
const partArg = args.indexOf('--part');
if (partArg >= 0) {
  const row = ranked.find((r) => r.part.includes(args[partArg + 1] ?? '\u0000'));
  if (!row) console.log('no such part');
  else for (const id of row.cards) console.log(id, work.find((w) => w.cardId === id)!.lines.map((l) => `${l.known ? '✓' : '✗'} ${l.text}`).join('\n    '));
} else if (args[0]) {
  for (const item of work.filter((w) => w.set.startsWith(args[0]!) && w.unknown.length <= Number(args[1] ?? 1))) console.log(`${item.cardId} L${item.level} ${item.kind}: ${item.unknown.join(' ｜ ')}`);
} else {
  const top = Number(process.env.TOP ?? 25);
  for (const row of ranked.slice(0, top)) console.log(`${String(row.unlocks.length).padStart(3)} ${String(row.cards.length).padStart(3)}  ${row.part.slice(0, 120)}  [${row.unlocks.map(short).join(' ')}]`);
}
