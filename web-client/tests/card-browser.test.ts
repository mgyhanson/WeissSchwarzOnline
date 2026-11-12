import { describe, expect, it } from 'vitest';
import { SETS, allCards } from '@wso/card-database';
import { NO_FILTER, matches } from '../src/model/cardFilter';
import { allCardIds, cardInfo, setSummaries } from '../src/model/cards';

const all = allCardIds().map(cardInfo);
const find = (patch: Partial<typeof NO_FILTER>) => all.filter((c) => matches(c, { ...NO_FILTER, ...patch })).map((c) => c.cardId);

describe('card browser', () => {
  it('no filter shows every card', () => {
    expect(find({})).toHaveLength(allCards().length);
  });

  it('searches names, numbers, traits, card text and the Chinese explanation; all words must match', () => {
    expect(find({ text: '勝利宣言' })).toEqual(['SY/W08-T06']);
    expect(find({ text: 'sy/w08-t06' })).toEqual(['SY/W08-T06']);
    expect(find({ text: '団長' }).length).toBeGreaterThan(3);
    expect(find({ text: '集中 団長' })).toEqual(['SY/W08-T06']);
    expect(find({ text: '應援' }).length).toBeGreaterThan(0);
    expect(find({ text: 'no-such-card' })).toEqual([]);
  });

  it('filters by series, kind, colour, level, cost, soul, power, trigger and support', () => {
    expect(find({ set: '5HY_W83_TD_ICHIKA' }).every((id) => id.startsWith('5HY/'))).toBe(true);
    expect(find({ kind: 'CLIMAX' }).every((id) => cardInfo(id).kind === 'CLIMAX')).toBe(true);
    expect(find({ kind: 'EVENT' })).toEqual(['SY/W08-T16', '5HY/W83-T11', 'SAO/S20-022']);
    expect(find({ color: 'blue', set: 'SY_W08_TD' }).every((id) => cardInfo(id).color === 'blue')).toBe(true);
    expect(find({ level: '3' }).every((id) => cardInfo(id).level === 3)).toBe(true);
    expect(find({ cost: '2' }).every((id) => cardInfo(id).cost === 2)).toBe(true);
    expect(find({ soul: '2' }).every((id) => cardInfo(id).soul === 2)).toBe(true);
    expect(find({ powerMin: '9000' }).every((id) => (cardInfo(id).power ?? 0) >= 9000)).toBe(true);
    expect(find({ trigger: 'RETURN' })).toEqual(['5HY/W83-T12', 'SAO/S20-024']);
    expect(find({ trigger: 'GATE' })).toEqual(['GUP/W141-111', 'SAO/S80-097']);
    expect(find({ trigger: 'NONE' }).every((id) => cardInfo(id).triggers.length === 0)).toBe(true);
    expect(find({ support: 'unsupported' })).toEqual(allCards().filter((c) => c.record.support === 'unsupported').map((c) => c.record.cardId));
  });

  it('counts each series and its support states from the database', () => {
    const summaries = setSummaries();
    expect(summaries.map((s) => s.id)).toEqual(SETS.map((s) => s.id));
    for (const s of summaries) {
      const records = SETS.find((x) => x.id === s.id)!.records;
      expect(s.total).toBe(records.length);
      expect(s.verified + s.pending + s.unsupported).toBe(s.total);
    }
  });
});
