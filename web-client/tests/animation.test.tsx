import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PILE_ZONES, SLOTS, createGame, getPlayerView } from '@wso/game-engine';
import { TEST_DECKS, deckList, defsFor } from '@wso/card-database';
import { Side } from '../src/components/Board';
import { anchorOf } from '../src/presentation/animate';

describe('animation anchors', () => {
  const list = deckList(TEST_DECKS[0]!);
  const view = getPlayerView(createGame({ defs: defsFor(new Set(list)), decks: [list, list] }, 'anchors').state, 0);
  const noop = () => {};
  const html = [0, 1]
    .map((side) => renderToStaticMarkup(<Side view={view} side={side as 0 | 1} ui={null} picked={[]} onCard={noop} onZone={noop} onSlot={noop} />))
    .join('');
  const anchors = new Set([...html.matchAll(/data-zone="([^"]+)"/g)].map((m) => m[1]));

  it('every zone a card can move to or from has a place on the board to fly to', () => {
    // Hands and the centre are anchored by the game screen itself (hand row, opponent's player bar).
    const elsewhere = new Set(['p0-hand', 'p1-hand', 'center']);
    for (const player of [0, 1] as const) {
      for (const zone of PILE_ZONES) {
        if (zone === 'resolution') continue;
        const anchor = anchorOf({ player, zone });
        expect(anchors.has(anchor) || elsewhere.has(anchor), anchor).toBe(true);
      }
      for (const slot of SLOTS) expect(anchors.has(anchorOf({ player, zone: 'stage', slot })), slot).toBe(true);
    }
    expect(anchorOf({ player: 1, zone: 'resolution' })).toBe('center');
  });

  it('markers fly to the slot they belong to', () => {
    expect(anchorOf({ player: 0, zone: 'marker', slot: 'FC' })).toBe('p0-stage-FC');
  });
});
