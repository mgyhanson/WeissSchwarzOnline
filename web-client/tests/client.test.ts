import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Decision, type GameEventView, type PromptId, checkInvariants, createGame, getInstance, getPlayerView } from '@wso/game-engine';
import { TEST_DECKS, allCards, deckList, defsFor } from '@wso/card-database';
import { LocalHost, SAVE_KEY, loadSaved } from '../src/host/local';
import { abilityText, allCardIds, cardInfo, iconsToText } from '../src/model/cards';
import { GLOSSARY } from '../src/model/glossary';
import { decisionUi } from '../src/model/options';
import { describe as describeEvent, logLines } from '../src/model/log';
import { PHASE_TERM, PROMPT_ZH } from '../src/model/text';
import { playThroughUi } from './play-through-ui';

const [HARUHI, ICHIKA] = TEST_DECKS.map((d) => d.id) as [string, string];
const PAIRINGS: [string, string][] = [
  [HARUHI, ICHIKA],
  [ICHIKA, HARUHI],
  [HARUHI, HARUHI],
  [ICHIKA, ICHIKA],
];

describe('playing through the interface', () => {
  it('whole games played only with what the interface offers: every offer is legal, every legal answer is offered', () => {
    const kinds = new Set<string>();
    for (let i = 0; i < 24; i++) {
      const game = playThroughUi(PAIRINGS[i % 4]!, `ui-game-${i}`, (i % 2) as 0 | 1);
      expect(game.problems, `game ${i}`).toEqual([]);
      expect(checkInvariants(game.state), `game ${i}`).toEqual([]);
      for (const kind of game.kinds) kinds.add(kind);
    }
    // The games covered the common decisions; the rarer ones are covered by the engine's own tests.
    for (const kind of ['MULLIGAN', 'CLOCK', 'MAIN', 'CLIMAX', 'ATTACK', 'COUNTER', 'LEVEL_UP', 'CONFIRM', 'SELECT_CARDS', 'CHOOSE_ABILITY']) {
      expect(kinds, kind).toContain(kind);
    }
  });

  it('the practice opponent plays complete games against itself', () => {
    for (let i = 0; i < 8; i++) {
      const game = playThroughUi(PAIRINGS[i % 4]!, `bot-${i}`, null);
      expect(game.problems, `game ${i}`).toEqual([]);
      expect(game.state.result, `game ${i}`).not.toBeNull();
    }
  });
});

describe('cards the player is looking at', () => {
  // A position with hidden deck cards, and decisions that let player 0 look at two of them.
  const list = deckList(TEST_DECKS[1]!);
  const { state } = createGame({ defs: defsFor(new Set(list)), decks: [list, list] }, 'look');
  const view = getPlayerView(state, 0);
  const top = state.zones[0].deck.slice(-2).map((id) => getInstance(state, id));
  const look = Object.fromEntries(top.map((inst) => [inst.objectId, inst.cardId]));

  it('are shown with a "look at the next card?" question although the deck is hidden', () => {
    expect(view.sides[0].deck.every((c) => c.hidden)).toBe(true);
    const decision: Decision = { id: 99, player: 0, kind: 'CONFIRM', prompt: 'LOOK_NEXT', look };
    expect(decisionUi(view, decision).shown.map((c) => c.cardId)).toEqual(top.map((inst) => inst.cardId));
  });

  it('can be chosen when an effect searches the deck, and the others are shown too', () => {
    const decision: Decision = { id: 99, player: 0, kind: 'SELECT_CARDS', prompt: 'EFFECT_CHOOSE', cards: [top[0]!.objectId], min: 0, max: 1, look };
    const ui = decisionUi(view, decision);
    expect(ui.pick?.cards).toEqual([{ objectId: top[0]!.objectId, cardId: top[0]!.cardId, where: '山札（只有你看到）' }]);
    expect(ui.shown.map((c) => c.cardId)).toEqual([top[1]!.cardId]);
  });
});

describe('game log', () => {
  const game = playThroughUi([HARUHI, ICHIKA], 'log-game', 0);

  it('describes every game in readable Chinese without missing values', () => {
    const lines = logLines(game.events, 0);
    expect(lines.length).toBeGreaterThan(50);
    for (const line of lines) {
      expect(line.text, line.text).not.toMatch(/undefined|null|NaN|\[object/);
    }
    expect(lines.at(-1)?.text).toMatch(/^遊戲結束/);
  });

  it('a move the player could not see is described without the card', () => {
    const hiddenMoves = game.events.filter((e): e is Extract<GameEventView, { type: 'CARD_MOVED' }> => e.type === 'CARD_MOVED' && !e.card);
    expect(hiddenMoves.length).toBeGreaterThan(0);
    for (const event of hiddenMoves) {
      const line = describeEvent(event, 0);
      if (line) expect(line.text).not.toMatch(/「/);
    }
  });

  it('merges identical consecutive lines', () => {
    const draws = logLines(game.events, 0).filter((l) => l.text === '你抽 1 張');
    expect(draws.some((l) => l.count > 1)).toBe(true);
  });
});

describe('card information', () => {
  it('every card in the database can be shown, with its explanation labelled by source and status', () => {
    expect(allCardIds()).toHaveLength(allCards().length);
    for (const id of allCardIds()) {
      const info = cardInfo(id);
      expect(info.name.length).toBeGreaterThan(0);
      expect(info.explanationLabel).toMatch(/（非官方）・待核實$/);
      expect(info.officialUrl).toBe(`https://ws-tcg.com/cardlist/?cardno=${id}`);
      for (const line of info.text) expect(line).not.toMatch(/\[\[|<br/);
    }
  });

  it('ability text lines up with the ability data for every card that has abilities', () => {
    for (const card of allCards()) {
      const count = card.def.abilities?.length ?? 0;
      if (count === 0) continue;
      expect(cardInfo(card.record.cardId).abilityText, card.record.cardId).toHaveLength(count);
    }
    expect(abilityText('SY/W08-T06', 1)).toMatch(/^【起】 集中/);
    expect(abilityText('SY/W08-T06', -1)).toBe('（由其他卡給予的能力）');
  });

  it('writes out the verified trigger icons in card text', () => {
    expect(iconsToText('[[salvage.gif]] [[bounce.gif]] [[soul.gif]]')).toBe('〔門〕 〔風〕 〔Soul〕');
  });
});

describe('texts', () => {
  it('every prompt the engine can ask has a Chinese question', () => {
    for (const [prompt, text] of Object.entries(PROMPT_ZH) as [PromptId, string][]) {
      expect(text.length, prompt).toBeGreaterThan(4);
    }
  });

  it('every phase links to a glossary entry, and glossary ids are unique', () => {
    const ids = GLOSSARY.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of Object.values(PHASE_TERM)) expect(ids).toContain(id);
  });
});

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
    removeItem: (k: string) => void items.delete(k),
  };
}

describe('local host', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('gives the interface only the view of its own seat', () => {
    const host = new LocalHost({ seed: 'host-view', decks: [HARUHI, ICHIKA] }, { botDelay: 10 });
    const snapshot = host.getSnapshot();
    expect(snapshot.view.viewer).toBe(0);
    expect(JSON.stringify(snapshot)).not.toContain('instanceId');
    expect(snapshot.view.sides[1].hand.every((c) => c.hidden)).toBe(true);
    host.dispose();
  });

  it('the opponent answers by itself, and the game can be played to the end with auto-play', () => {
    const host = new LocalHost({ seed: 'host-auto', decks: [HARUHI, ICHIKA] }, { botDelay: 1 });
    host.setAutoPlay(true);
    for (let i = 0; i < 20000 && !host.getSnapshot().view.result; i++) vi.advanceTimersByTime(5);
    expect(host.getSnapshot().view.result).not.toBeNull();
    expect(host.getSnapshot().error).toBeNull();
    host.dispose();
  });

  it('ignores answers when it is not the human seat’s decision, and accepts a resignation', () => {
    const host = new LocalHost({ seed: 'host-resign', decks: [HARUHI, ICHIKA] }, { botDelay: 10 });
    const before = host.getSnapshot();
    if (!before.view.decision?.mine) {
      host.submit({ kind: 'MULLIGAN', discard: [] });
      expect(host.getSnapshot()).toBe(before);
    }
    host.resign();
    expect(host.getSnapshot().view.result).toMatchObject({ outcome: 'WIN', winner: 1, loser: 0, reason: 'RESIGNED' });
    host.dispose();
  });

  it('a saved game is restored to exactly the same position', () => {
    const storage = memoryStorage();
    const host = new LocalHost({ seed: 'host-save', decks: [ICHIKA, HARUHI] }, { botDelay: 1, storage });
    host.setAutoPlay(true);
    for (let i = 0; i < 300; i++) vi.advanceTimersByTime(5);
    host.setAutoPlay(false);
    for (let i = 0; i < 50; i++) vi.advanceTimersByTime(5);
    const position = host.getSnapshot();
    host.dispose();

    const saved = loadSaved(storage);
    expect(saved?.entries.length).toBeGreaterThan(50);
    const restored = new LocalHost(saved!.setup, { botDelay: 1, storage, entries: saved!.entries });
    expect(restored.getSnapshot().view).toEqual(position.view);
    expect(restored.getSnapshot().events).toEqual(position.events);
    restored.dispose();
  });

  it('a damaged save is not loaded', () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, '{not json');
    expect(loadSaved(storage)).toBeNull();
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 2 }));
    expect(loadSaved(storage)).toBeNull();
  });
});
