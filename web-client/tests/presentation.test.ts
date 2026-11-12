import { describe, expect, it } from 'vitest';
import { type GameEvent, type GameEventView, type PlayerId, type PlayerView, createGame, getPlayerView, redactEvent, submitChoice } from '@wso/game-engine';
import { TEST_DECKS, deckList, defsFor, getCard } from '@wso/card-database';
import { createAi } from '@wso/ai';
import type { HostUpdate } from '../src/host/local';
import { PresentationQueue, type Wait } from '../src/presentation/queue';
import { type Step, toSteps } from '../src/presentation/steps';

const card = (id: string) => getCard(id).def;

/** A whole AI game, keeping the raw events and, per answer, an update for each seat. */
function game(seed: string) {
  const lists = TEST_DECKS.map((d) => deckList(d)) as [string[], string[]];
  const ais = ([0, 1] as const).map((p) => createAi({ level: 'NORMAL', card, deck: lists[p], seed: `${seed}-${p}` }));
  const created = createGame({ defs: defsFor(new Set([...lists[0], ...lists[1]])), decks: lists }, seed);
  let state = created.state;
  const raw: GameEvent[] = [...created.events];
  const updates: [HostUpdate[], HostUpdate[]] = [[], []];
  const push = (events: GameEvent[]) => {
    for (const seat of [0, 1] as const) {
      updates[seat].push({ id: updates[seat].length, events: events.map((e) => redactEvent(e, seat)), view: getPlayerView(state, seat) });
    }
  };
  push(created.events);
  while (state.pending && !state.result) {
    const p = state.pending.player;
    const view = getPlayerView(state, p);
    if (!view.decision?.mine) throw new Error('decision not in view');
    const result = submitChoice(state, { player: p, decisionId: state.pending.id, choice: ais[p]!.choose(view, view.decision.decision) });
    if (!result.ok) throw new Error(result.message);
    state = result.state;
    raw.push(...result.events);
    push(result.events);
  }
  return { raw, updates, final: state };
}

const GAMES = ['present-a', 'present-b', 'present-c'].map(game);

function seatEvents(raw: readonly GameEvent[], seat: PlayerId): GameEventView[] {
  return raw.map((e) => redactEvent(e, seat));
}

describe('presentation steps', () => {
  it('your own draws show the cards; the opponent’s draws never do', () => {
    for (const { raw } of GAMES) {
      for (const seat of [0, 1] as const) {
        const draws = toSteps(seatEvents(raw, seat), seat).filter((s): s is Extract<Step, { kind: 'DRAW' }> => s.kind === 'DRAW');
        expect(draws.length).toBeGreaterThan(10);
        for (const draw of draws) {
          if (draw.player === seat) expect(draw.cards.every((c) => c.cardId !== null)).toBe(true);
          else expect(draw.cards.every((c) => c.cardId === null)).toBe(true);
        }
      }
    }
  });

  it('every trigger check becomes one step with its card and icons, seen alike by both players', () => {
    for (const { raw } of GAMES) {
      const checks = raw.filter((e): e is Extract<GameEvent, { type: 'TRIGGER_CHECK' }> => e.type === 'TRIGGER_CHECK');
      for (const seat of [0, 1] as const) {
        const steps = toSteps(seatEvents(raw, seat), seat).filter((s): s is Extract<Step, { kind: 'TRIGGER' }> => s.kind === 'TRIGGER');
        expect(steps.map((s) => [s.player, s.card.cardId, s.icons])).toEqual(checks.map((e) => [e.player, e.cardId, e.icons]));
      }
    }
  });

  it('every damage becomes a step showing the cards turned over, in order, with its outcome', () => {
    for (const { raw } of GAMES) {
      const dealt = raw.filter((e): e is Extract<GameEvent, { type: 'DAMAGE_DEALT' }> => e.type === 'DAMAGE_DEALT');
      for (const seat of [0, 1] as const) {
        const steps = toSteps(seatEvents(raw, seat), seat).filter((s): s is Extract<Step, { kind: 'DAMAGE' }> => s.kind === 'DAMAGE');
        const finished = steps.filter((s) => s.amount !== null);
        expect(finished.map((s) => [s.receiver, s.amount, s.cancelled])).toEqual(dealt.map((e) => [e.receiver, e.amount, e.cancelled]));
        // The cards of a damage are the damage cards moved to the resolution zone, in the same order.
        const turned = raw.filter((e) => e.type === 'CARD_MOVED' && e.reason === 'DAMAGE' && e.to.zone === 'resolution').map((e) => (e as Extract<GameEvent, { type: 'CARD_MOVED' }>).cardId);
        expect(steps.flatMap((s) => s.cards.map((c) => c.cardId))).toEqual(turned);
        for (const step of finished.filter((s) => !s.partial)) {
          const last = step.cards[step.cards.length - 1]!.cardId!;
          if (step.cancelled) expect(getCard(last).def.kind).toBe('CLIMAX');
          else if (step.cards.length === step.amount) expect(step.cards.every((c) => getCard(c.cardId!).def.kind !== 'CLIMAX')).toBe(true);
        }
      }
    }
  });

  it('steps come in the order the engine did things', () => {
    for (const { raw } of GAMES) {
      const seqs = toSteps(seatEvents(raw, 0), 0).map((s) => s.seq);
      expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
    }
  });

  it('a step never names a card the event did not show to that player', () => {
    for (const { raw } of GAMES) {
      for (const seat of [0, 1] as const) {
        const hidden = new Set<string>();
        // Card ids that only ever moved unseen by this seat (e.g. the opponent's hand that was never played).
        const seen = new Set<string>();
        for (const e of raw) {
          if (e.type !== 'CARD_MOVED') continue;
          if (e.visibleBefore[seat] || e.visibleAfter[seat]) seen.add(e.cardId);
          else hidden.add(e.cardId);
        }
        for (const id of seen) hidden.delete(id);
        for (const e of raw) if ('cardId' in e && e.type !== 'CARD_MOVED') hidden.delete(e.cardId);
        const named = JSON.stringify(toSteps(seatEvents(raw, seat), seat));
        for (const id of hidden) expect(named).not.toContain(`"${id}"`);
      }
    }
  });
});

/** A wait that resolves on the next tick, recording nothing. */
const instant: Wait = () => new Promise((resolve) => setTimeout(resolve, 0));

async function idle(queue: PresentationQueue): Promise<void> {
  for (let i = 0; i < 100000 && queue.getSnapshot().busy; i++) await new Promise((r) => setTimeout(r, 0));
}

describe('presentation queue', () => {
  const { updates } = GAMES[0]!;
  const seat = 0;
  const mine = updates[seat];
  const start = (from = 0) => ({ view: mine[from]!.view, updateId: mine[from]!.id, seq: -1 });

  it('plays every step once, in order, and ends on the latest view', async () => {
    const played: number[] = [];
    const busy: boolean[] = [];
    const queue = new PresentationQueue(seat, start(), {
      wait: instant,
      animator: async (step) => {
        played.push(step.seq);
      },
      onBusy: (b) => busy.push(b),
    });
    const part = mine.slice(0, 40);
    queue.sync(part);
    queue.sync(part); // the same updates again: nothing is replayed
    await idle(queue);
    const expected = part.slice(1).flatMap((u) => toSteps(u.events, seat).map((s) => s.seq));
    expect(played).toEqual(expected);
    expect(queue.getSnapshot().view).toEqual(part[part.length - 1]!.view);
    expect(busy).toEqual([true, false]);
    // Later updates continue from where it stopped.
    queue.sync(mine.slice(0, 60));
    await idle(queue);
    expect(played).toEqual(mine.slice(1, 60).flatMap((u) => toSteps(u.events, seat).map((s) => s.seq)));
  });

  it('skipping shows the latest view at once and keeps every reveal in the history', async () => {
    let release: () => void = () => {};
    const slow: Wait = (_ms, signal) =>
      new Promise((resolve) => {
        release = resolve;
        signal.addEventListener('abort', () => resolve(), { once: true });
      });
    const queue = new PresentationQueue(seat, start(), { wait: slow });
    queue.sync(mine);
    await new Promise((r) => setTimeout(r, 0));
    expect(queue.getSnapshot().busy).toBe(true);
    queue.skip();
    release();
    await idle(queue);
    const snap = queue.getSnapshot();
    expect(snap.view).toEqual(mine[mine.length - 1]!.view);
    expect(snap.busy).toBe(false);
    expect(snap.step).toBeNull();
    // The history keeps the newest 60 reveals; the newest one is the last reveal of the game.
    const reveals = mine
      .slice(1)
      .flatMap((u) => toSteps(u.events, seat))
      .filter((s) => s.kind === 'TRIGGER' || s.kind === 'DAMAGE' || s.kind === 'REVEAL' || (s.kind === 'DRAW' && s.player === seat) || (s.kind === 'PLAY' && s.player !== seat));
    expect(reveals.length).toBeGreaterThan(60);
    expect(snap.history).toHaveLength(60);
    expect(snap.history[59]!.seq).toBe(reveals[reveals.length - 1]!.seq);
  });

  it('with animation off nothing is animated and the view follows at once', async () => {
    let animated = 0;
    const queue = new PresentationQueue(seat, start(), {
      speed: 'OFF',
      wait: instant,
      animator: async () => {
        animated++;
      },
    });
    queue.sync(mine.slice(0, 30));
    await idle(queue);
    expect(animated).toBe(0);
    expect(queue.getSnapshot().view).toEqual(mine[29]!.view);
  });

  it('updates restored from a save are shown without animation', async () => {
    let animated = 0;
    const queue = new PresentationQueue(seat, { view: mine[0]!.view, updateId: -1, seq: -1 }, {
      wait: instant,
      animator: async () => {
        animated++;
      },
    });
    queue.sync(mine.slice(0, 25), 24);
    await idle(queue);
    expect(animated).toBe(0);
    expect(queue.getSnapshot().view).toEqual(mine[24]!.view as PlayerView);
  });
});
