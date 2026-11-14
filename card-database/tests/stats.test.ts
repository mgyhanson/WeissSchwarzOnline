/**
 * How far each set is supported, from the database as the game loads it.
 * With CARD_REPORT=1 (npm run cards:report) the numbers are also written to
 * reports/card_support_stats.json for the written reports.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PATTERN_IDS, SETS, allCards } from '../src/index';
import { type SupportClass, classifyUnsupported } from './classify';

describe('support statistics', () => {
  it('every card is exactly one of: written by hand, compiled from sentence patterns, or unsupported', () => {
    const cards = allCards();
    const sets = SETS.map((set) => {
      const own = cards.filter((c) => c.set === set.id);
      const count = (pred: (c: (typeof own)[number]) => boolean) => own.filter(pred).length;
      return {
        id: set.id,
        product: set.official.source.product,
        cards: own.length,
        handWritten: count((c) => !c.record.origin && c.record.support === 'verified'),
        fromPatterns: count((c) => c.record.origin === 'PATTERN'),
        unsupported: count((c) => c.record.support === 'unsupported'),
        pending: count((c) => c.record.support === 'pending'),
        withoutText: count((c) => c.official.text === '-'),
      };
    });
    for (const s of sets) expect(s.handWritten + s.fromPatterns + s.unsupported + s.pending, s.id).toBe(s.cards);
    const patterns = Object.fromEntries(PATTERN_IDS.map((id) => [id, cards.filter((c) => c.record.patterns?.includes(id)).length]));
    const totals = {
      cards: cards.length,
      playable: cards.filter((c) => c.record.support === 'verified').length,
      handWritten: sets.reduce((n, s) => n + s.handWritten, 0),
      fromPatterns: sets.reduce((n, s) => n + s.fromPatterns, 0),
      unsupported: sets.reduce((n, s) => n + s.unsupported, 0),
      abilitiesRun: cards.reduce((n, c) => n + (c.def.abilities?.length ?? 0) + (c.def.effect ? 1 : 0), 0),
    };
    expect(totals.playable).toBe(totals.handWritten + totals.fromPatterns);
    if (process.env.CARD_REPORT) {
      writeFileSync(fileURLToPath(new URL('../../reports/card_support_stats.json', import.meta.url)), `${JSON.stringify({ totals, sets, patterns }, null, 2)}\n`);
    }
  });

  it('every unsupported card is sorted into exactly one class (A to E) by what its text needs', () => {
    const cards = allCards();
    const sorted = classifyUnsupported(cards);
    expect(sorted).toHaveLength(cards.filter((c) => c.record.support === 'unsupported').length);
    expect(new Set(sorted.map((c) => c.cardId)).size).toBe(sorted.length);
    const classes: SupportClass[] = ['A', 'B', 'C', 'D', 'E'];
    for (const card of sorted) {
      expect(classes, card.cardId).toContain(card.class);
      // A reason is given whenever something new is needed; a card with nothing open would not be unsupported (events aside).
      if (card.class === 'C' || card.class === 'D' || card.class === 'E') expect(card.needs.length, card.cardId).toBeGreaterThan(0);
      if (card.kind !== 'EVENT') expect(card.openLines, card.cardId).toBeGreaterThan(0);
    }
    if (process.env.CARD_REPORT) {
      const count = (pred: (c: (typeof sorted)[number]) => boolean) => sorted.filter(pred).length;
      const setIds = SETS.map((s) => s.id).filter((id) => count((c) => c.set === id) > 0);
      const needs = new Map<string, number>();
      for (const card of sorted) for (const need of card.needs) needs.set(need, (needs.get(need) ?? 0) + 1);
      const lines = [
        '# 未支援卡牌的初步分類',
        '',
        '> 由 `npm run cards:report` 產生（`card-database/tests/classify.ts`）。請勿手改。',
        '',
        '這是按官方日文文字中的用語所作的**初步**分類，用來決定實裝次序；它不判斷卡牌效果。每張卡在實裝前仍會逐張重讀全文、官方 Q&A 及勘誤。',
        '',
        '| 類別 | 意思 |',
        '|---|---|',
        '| A | 未發現需要新構件的字句：可用現有引擎構件逐張手寫 |',
        '| B | 同 A，而且每一句未涵蓋的句子都在另一張卡出現：加句型可一次涵蓋多張 |',
        '| C | 需要新的通用構件（觸發、條件、Cost、效果或數值計算） |',
        '| D | 需要引擎尚未有的整個機制（Marker、置換效果、舞台以外生效的能力等） |',
        '| E | 有官方 Q&A 或勘誤，必須先核對 |',
        '',
        `合計 ${sorted.length} 張。`,
        '',
        `| 系列 | ${classes.join(' | ')} | 合計 |`,
        `|---|${classes.map(() => '---:').join('|')}|---:|`,
        ...setIds.map((id) => `| ${id.replace('_', '/')} | ${classes.map((k) => count((c) => c.set === id && c.class === k)).join(' | ')} | ${count((c) => c.set === id)} |`),
        `| **合計** | ${classes.map((k) => count((c) => c.class === k)).join(' | ')} | ${sorted.length} |`,
        '',
        '## 需要的構件及機制（一張卡可能需要多項）',
        '',
        '| 需要 | 卡數 |',
        '|---|---:|',
        ...[...needs].sort((a, b) => b[1] - a[1]).map(([need, n]) => `| ${need} | ${n} |`),
        '',
        '## 各類別的卡號',
        '',
        ...classes.flatMap((k) => [
          `### ${k}（${count((c) => c.class === k)} 張）`,
          '',
          ...setIds.flatMap((id) => {
            const own = sorted.filter((c) => c.set === id && c.class === k);
            return own.length > 0 ? [`- **${id.replace('_', '/')}**（${own.length}）：${own.map((c) => c.cardId.split('-').pop()).join('、')}`] : [];
          }),
          '',
        ]),
      ];
      writeFileSync(fileURLToPath(new URL('../../reports/UNSUPPORTED_CARDS.md', import.meta.url)), `${lines.join('\n')}\n`);
    }
  });
});
