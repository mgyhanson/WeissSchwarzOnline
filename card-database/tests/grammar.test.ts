/**
 * The sentence grammar (src/grammar.ts): cards compiled from known parts.
 *
 * Three independent checks, none of which uses the compiled data as its own
 * expectation:
 *  1. hand-written cards (each tested in the engine by its own test) are the
 *     reference: every line of theirs that the grammar can read must give
 *     exactly the hand-written ability data;
 *  2. every compiled line is written back to Japanese by render-ja.ts and
 *     must say what the official line says;
 *  3. lines with anything unknown in them are not compiled.
 * The compiled cards are played in complete games in games.test.ts, and the
 * engine parts they use are tested in game-engine/tests.
 */

import { describe, expect, it } from 'vitest';
import { ERRATA_UNCHECKED, GRAMMAR, allCards, compileText, readLine, ruleLines } from '../src/index';
import { abilityJa, effectsJa, sameWords } from './render-ja';

const cards = allCards();
const handWritten = cards.filter((c) => !c.record.origin && c.record.support === 'verified');
const compiled = cards.filter((c) => c.record.origin === 'PATTERN' && c.record.patterns!.includes(GRAMMAR));

describe('sentence grammar', () => {
  it('reads lines of hand-written cards to exactly the hand-written ability data', () => {
    let read = 0;
    for (const card of handWritten) {
      if (card.def.kind === 'EVENT') continue;
      const lines = ruleLines(card.official);
      const abilities = card.def.abilities ?? [];
      if (lines.length !== abilities.length) continue; // e.g. a keyword line written as two abilities
      lines.forEach((line, index) => {
        const result = readLine(line).line;
        if (!result) return;
        expect(result.ability, `${card.record.cardId} line ${index + 1}`).toEqual(abilities[index]);
        read++;
      });
    }
    // Over a hundred lines across every hand-written set agree.
    expect(read).toBeGreaterThanOrEqual(100);
  });

  it('hand-written events whose paragraph it can read give exactly the hand-written effect', () => {
    for (const card of handWritten.filter((c) => c.def.kind === 'EVENT')) {
      const result = compileText(card.official);
      if (result) expect(result.effect, card.record.cardId).toEqual(card.record.effect);
    }
  });

  it('compiles a useful number of cards, and none that is held back', () => {
    expect(compiled.length).toBeGreaterThanOrEqual(40);
    for (const cardId of ERRATA_UNCHECKED) expect(cards.find((c) => c.record.cardId === cardId)!.record.support, cardId).toBe('unsupported');
  });

  describe('every compiled line, written back to Japanese, says what the official line says', () => {
    it.each(compiled.map((card) => [card.record.cardId, card] as const))('%s', (_cardId, card) => {
      const lines = ruleLines(card.official);
      if (card.def.kind === 'EVENT') {
        // A play restriction (このカードは、…なら、手札からプレイできない。) comes first, on its own line or not.
        const restriction = (card.def.abilities ?? []).map((ability) => abilityJa(ability)).join('');
        // 【カウンター】 is the card's counter icon (CardDef.counter), written before the effect.
        expect(sameWords(`${card.def.counter ? '【カウンター】 ' : ''}${restriction}${effectsJa(card.def.effect!).join('。')}。`)).toBe(sameWords(lines.join('')));
        return;
      }
      expect(card.def.abilities).toHaveLength(lines.length);
      lines.forEach((line, index) => {
        if (card.record.patterns![index] !== GRAMMAR) return; // whole-sentence patterns have their own checks (patterns.test.ts)
        expect(sameWords(abilityJa(card.def.abilities![index]!)), `line ${index + 1}`).toBe(sameWords(line));
      });
    });
  });

  it('the hand-written lines it reads also come back as the official text', () => {
    for (const card of handWritten) {
      if (card.def.kind === 'EVENT') continue;
      for (const line of ruleLines(card.official)) {
        const result = readLine(line).line;
        if (result) expect(sameWords(abilityJa(result.ability)), card.record.cardId).toBe(sameWords(line));
      }
    }
  });

  it('keyword-only and gain-only lines: 回想 with its reminder, and a 【永】 that only gives the card a 【起】', () => {
    const recollection = readLine('【永】 回想 （【自】 これが思い出にあるなら、あなたのキャラが舞台以外から舞台に置かれた時、その下にマーカーがないなら、これを表でその下のマーカーにしてよい。 【自】 これがマーカー置場から離れた時、これを思い出にする）');
    expect(recollection.unknown).toEqual([]);
    expect(recollection.line?.ability).toEqual({ type: 'CONT', recollection: true, apply: [] });
    const gainsAct = readLine('【永】 あなたのレベルが2以上なら、このカードは次の能力を得る。『【起】［(1) このカードを思い出にする］ あなたは自分の手札の「X」を1枚まで選び、このカードがいた枠に置く。』');
    expect(gainsAct.unknown).toEqual([]);
    expect(gainsAct.line?.ability).toMatchObject({ type: 'CONT', condition: { if: 'LEVEL', min: 2 }, apply: [], gains: [{ type: 'ACT' }] });
    // No reason for an unknown line is ever an empty sentence.
    for (const card of allCards().filter((c) => c.record.support === 'unsupported')) {
      for (const line of ruleLines(card.official)) for (const u of readLine(line).unknown) expect(u.text.trim(), card.record.cardId).not.toBe('');
    }
  });

  it('does not compile a line with anything it does not know, and says which part that is', () => {
    const unknown = (line: string) => readLine(line).unknown.map((u) => u.part);
    expect(readLine('【自】 このカードがアタックした時、そのターン中、このカードのパワーを＋1000。').line).not.toBeNull();
    // An unknown trigger, cost action, condition and effect sentence.
    expect(unknown('【自】 このカードが踊った時、そのターン中、このカードのパワーを＋1000。')).toEqual(['TRIGGER']);
    expect(unknown('【自】［このカードを食べる］ このカードがアタックした時、あなたはコストを払ってよい。そうしたら、あなたは1枚引く。')).toEqual(['COST']);
    expect(unknown('【自】 このカードがアタックした時、今日が晴れなら、あなたは1枚引く。')).toEqual(['CONDITION']);
    expect(unknown('【自】 このカードがアタックした時、あなたは1枚引く。あなたは踊る。')).toEqual(['EFFECT']);
    // One unknown sentence among known ones leaves the whole line (and so the whole card) uncompiled.
    expect(readLine('【自】 このカードがアタックした時、あなたは1枚引く。あなたは踊る。').line).toBeNull();
    // Text in brackets is a reminder only where it is known to be one.
    expect(readLine('【自】 このカードがアタックした時、あなたは1枚引く。（そうでないなら元に戻す）').line).toBeNull();
    expect(readLine('【自】 このカードがアタックした時、相手に1ダメージを与える。（ダメージキャンセルは発生する）').line).not.toBeNull();
    // "…してよい。そうしたら、…": what follows depends on the first part having been done.
    const swap = readLine('【自】 このカードが手札から舞台に置かれた時、あなたは自分のクロックを1枚選び、手札に戻してよい。そうしたら、あなたは自分の手札を1枚選び、クロック置場に置く。').line!;
    expect(swap.ability).toMatchObject({ optional: true, effect: [{ do: 'CHOOSE', from: 'YOUR_CLOCK' }, { do: 'MOVE', to: 'HAND' }, { do: 'IF', condition: { if: 'DID' } }] });
    // A cost with no "あなたはコストを払ってよい。そうしたら、" is not the usual shape.
    expect(readLine('【自】［(1)］ このカードがアタックした時、あなたは1枚引く。').line).toBeNull();
  });
});
