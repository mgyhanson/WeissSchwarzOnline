/**
 * Plays whole games in which one seat answers only through what the
 * interface offers (decisionUi), the way a person clicking would, and the
 * other seat is the Normal computer player. Shared by the client tests.
 */

import {
  type Choice,
  type Decision,
  type GameEventView,
  type GameState,
  type PlayerId,
  type RngState,
  createGame,
  getPlayerView,
  nextInt,
  redactEvent,
  seedRng,
  submitChoice,
  validateChoice,
} from '@wso/game-engine';
import { TEST_DECKS, deckList, defsFor, getCard } from '@wso/card-database';
import { createAi } from '@wso/ai';
import { type DecisionUi, decisionUi } from '../src/model/options';

/** Every choice the interface can produce for a decision. Picks: the given selection sizes. */
export function offeredChoices(ui: DecisionUi, rng: RngState): Choice[] {
  const choices: Choice[] = [...ui.buttons.map((b) => b.choice), ...[...ui.cardActions.values()].flat().map((b) => b.choice)];
  const pick = ui.pick;
  if (pick) {
    const max = Math.min(pick.max, pick.cards.length);
    const size = pick.min + nextInt(rng, max - pick.min + 1);
    const pool = pick.cards.map((c) => c.objectId);
    const selected: number[] = [];
    for (let i = 0; i < size; i++) selected.push(pool.splice(nextInt(rng, pool.length), 1)[0]!);
    choices.push(pick.confirm(selected));
    choices.push(pick.confirm(pick.cards.slice(0, pick.min).map((c) => c.objectId)));
  }
  return choices;
}

/** Every answer the engine lists as legal, for decisions whose answers can be listed (not card subsets). */
export function listedAnswers(decision: Decision): Choice[] | null {
  switch (decision.kind) {
    case 'MAIN':
      return decision.actions.map((action) => ({ kind: 'MAIN', action }));
    case 'ATTACK':
      return [...decision.attacks.map((attack): Choice => ({ kind: 'ATTACK', attack })), { kind: 'ATTACK', attack: null }];
    case 'COUNTER':
      return [
        ...decision.cards.map((card): Choice => ({ kind: 'COUNTER', card })),
        ...decision.backups.map((b): Choice => ({ kind: 'COUNTER', card: b.card, ability: b.ability })),
        { kind: 'COUNTER', card: null },
      ];
    case 'RULE_ACTION_ORDER':
      return decision.options.map((first) => ({ kind: 'RULE_ACTION_ORDER', first }));
    case 'CHOOSE_ABILITY':
      return decision.abilities.map((a) => ({ kind: 'CHOOSE_ABILITY', id: a.id }));
    case 'CONFIRM':
      return [
        { kind: 'CONFIRM', accept: true },
        { kind: 'CONFIRM', accept: false },
      ];
    case 'SELECT_SLOT':
      return decision.slots.map((slot) => ({ kind: 'SELECT_SLOT', slot }));
    case 'SELECT_OPTION':
      return decision.options.map((option) => ({ kind: 'SELECT_OPTION', option }));
    default:
      return null;
  }
}

/** The card picks each decision must offer: [cards, min, max]. */
export function expectedPick(decision: Decision): [number[], number, number] | null {
  switch (decision.kind) {
    case 'MULLIGAN':
      return [decision.cards, 0, decision.cards.length];
    case 'CLOCK':
    case 'CLIMAX':
      return [decision.cards, 0, 1];
    case 'LEVEL_UP':
      return [decision.cards, 1, 1];
    case 'HAND_LIMIT':
      return [decision.cards, decision.count, decision.count];
    case 'SELECT_CARDS':
      return [decision.cards, decision.min, decision.max];
    default:
      return null;
  }
}

function canonical(choice: Choice): string {
  // Stable string regardless of property order, nested objects included.
  return JSON.stringify(choice, (_k, value: unknown) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : value,
  );
}

/** Problems with the interface for one decision (empty when it offers exactly the legal answers). */
export function uiProblems(decision: Decision, ui: DecisionUi, rng: RngState): string[] {
  const problems: string[] = [];
  for (const choice of offeredChoices(ui, rng)) {
    const problem = validateChoice(decision, choice);
    if (problem) problems.push(`${decision.kind}: offers an illegal choice ${canonical(choice)} (${problem})`);
  }
  const listed = listedAnswers(decision);
  if (listed) {
    const offered = new Set([...ui.buttons.map((b) => b.choice), ...[...ui.cardActions.values()].flat().map((b) => b.choice)].map(canonical));
    for (const answer of listed) {
      if (!offered.has(canonical(answer))) problems.push(`${decision.kind}: legal answer ${canonical(answer)} is not offered`);
    }
  }
  const pick = expectedPick(decision);
  if (pick) {
    if (!ui.pick) problems.push(`${decision.kind}: no card pick offered`);
    else {
      const [cards, min, max] = pick;
      if (JSON.stringify(ui.pick.cards.map((c) => c.objectId)) !== JSON.stringify(cards)) {
        problems.push(`${decision.kind}: pick offers other cards than the decision`);
      }
      if (ui.pick.min !== min) problems.push(`${decision.kind}: pick min ${ui.pick.min}, expected ${min}`);
      if (ui.pick.max !== max) problems.push(`${decision.kind}: pick max ${ui.pick.max}, expected ${max}`);
      for (const card of ui.pick.cards) {
        if (card.cardId === null) problems.push(`${decision.kind}: pick card ${card.objectId} cannot be identified from the view`);
      }
    }
  }
  for (const card of ui.shown) {
    if (card.cardId === null) problems.push(`${decision.kind}: shown card ${card.objectId} cannot be identified from the view`);
  }
  return problems;
}

export interface UiGame {
  state: GameState;
  /** Events as the interface seat received them. */
  events: GameEventView[];
  decisions: number;
  kinds: Set<Decision['kind']>;
  problems: string[];
}

/**
 * Plays a game: seat `uiSeat` picks at random among the interface's offers,
 * the other seat is the Normal computer player. With `uiSeat` null both
 * seats are computer players (the log is then seat 0's).
 */
export function playThroughUi(decks: [string, string], seed: string, uiSeat: PlayerId | null = 0, maxDecisions = 6000): UiGame {
  const logSeat: PlayerId = uiSeat ?? 0;
  const lists = decks.map((id) => deckList(TEST_DECKS.find((d) => d.id === id)!)) as [string[], string[]];
  const created = createGame({ defs: defsFor(new Set([...lists[0], ...lists[1]])), decks: lists }, seed);
  let state = created.state;
  const events: GameEventView[] = created.events.map((e) => redactEvent(e, logSeat));
  const rng = seedRng(`ui-${seed}`);
  const bots = ([0, 1] as const).map((p) => createAi({ level: 'NORMAL', card: (id) => getCard(id).def, deck: lists[p], seed: `ui-${seed}-${p}` }));
  const problems: string[] = [];
  const kinds = new Set<Decision['kind']>();
  let decisions = 0;

  while (state.pending && !state.result && decisions < maxDecisions) {
    const decision = state.pending;
    const view = getPlayerView(state, decision.player);
    if (!view.decision?.mine) throw new Error('The deciding player does not get the decision');
    kinds.add(decision.kind);
    let choice: Choice;
    if (decision.player === uiSeat) {
      const ui = decisionUi(view, view.decision.decision);
      problems.push(...uiProblems(decision, ui, rng));
      const offers = offeredChoices(ui, rng).filter((c) => !validateChoice(decision, c));
      // Like the random games of the engine: pass the main phase now and then so turns end.
      const passes = offers.filter((c) => c.kind === 'MAIN' && c.action.type === 'PASS');
      choice = passes.length > 0 && nextInt(rng, 3) === 0 ? passes[0]! : offers[nextInt(rng, offers.length)]!;
    } else {
      choice = bots[decision.player]!.choose(view, view.decision.decision);
    }
    const result = submitChoice(state, { player: decision.player, decisionId: decision.id, choice });
    if (!result.ok) {
      problems.push(`seat ${decision.player} ${decision.kind}: rejected ${canonical(choice)} (${result.message})`);
      break;
    }
    state = result.state;
    events.push(...result.events.map((e) => redactEvent(e, logSeat)));
    decisions++;
  }
  if (!state.result) problems.push(`no result after ${decisions} decisions`);
  return { state, events, decisions, kinds, problems };
}
