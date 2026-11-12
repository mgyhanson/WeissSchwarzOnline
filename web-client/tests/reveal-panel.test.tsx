import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createGame, getPlayerView } from '@wso/game-engine';
import { TEST_DECKS, deckList, defsFor } from '@wso/card-database';
import { RevealPanel } from '../src/components/RevealPanel';
import type { Presentation } from '../src/presentation/queue';

const list = deckList(TEST_DECKS[0]!);
const view = getPlayerView(createGame({ defs: defsFor(new Set(list)), decks: [list, list] }, 'reveal-panel').state, 0);
const base: Presentation = { view, step: null, shown: 0, phase: 'reveal', busy: true, speed: 'NORMAL', history: [], shownSeq: 0 };

describe('reveal panel', () => {
  it('a trigger check of a climax with the same icon twice renders both lines without React key warnings', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const html = renderToStaticMarkup(
      <RevealPanel
        presentation={{ ...base, step: { seq: 1, kind: 'TRIGGER', player: 0, card: { cardId: 'SAO/S20-100' }, icons: ['SOUL', 'SOUL'], reveal: 'TRIGGER_REVEAL' }, phase: 'result' }}
        seat={0}
        onCard={() => {}}
        onSkip={() => {}}
      />,
    );
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
    expect(html.match(/trigger-badge/g)).toHaveLength(2);
    expect(html).toContain('突然の別れ');
    expect(html).toContain('之後這張卡放到 Stock');
  });

  it('a damage step shows the cards turned over so far and, at the end, whether it was cancelled', () => {
    const step = { seq: 2, kind: 'DAMAGE' as const, receiver: 1 as const, cards: [{ cardId: 'SAO/S20-017' }, { cardId: 'SAO/S20-100' }], amount: 2, cancelled: true, partial: false, reveal: 'DAMAGE_REVEAL' as const };
    const first = renderToStaticMarkup(<RevealPanel presentation={{ ...base, step, shown: 1 }} seat={0} onCard={() => {}} onSkip={() => {}} />);
    expect(first.match(/class="card /g)).toHaveLength(1);
    expect(first).toContain('對手受到傷害：第 1 張');
    const result = renderToStaticMarkup(<RevealPanel presentation={{ ...base, step, phase: 'result' }} seat={0} onCard={() => {}} onSkip={() => {}} />);
    expect(result.match(/class="card /g)).toHaveLength(2);
    expect(result).toContain('Cancel！');
  });

  it('the opponent’s draw is only a count, with no card shown', () => {
    const html = renderToStaticMarkup(
      <RevealPanel presentation={{ ...base, step: { seq: 3, kind: 'DRAW', player: 1, cards: [{ cardId: null }, { cardId: null }], reveal: null } }} seat={0} onCard={() => {}} onSkip={() => {}} />,
    );
    expect(html).toContain('對手抽 2 張');
    expect(html).not.toMatch(/class="card /);
  });
});
