/**
 * How far each set is supported, from the database as the game loads it.
 * With CARD_REPORT=1 (npm run cards:report) the numbers are also written to
 * reports/card_support_stats.json for the written reports.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PATTERN_IDS, SETS, allCards } from '../src/index';

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
});
