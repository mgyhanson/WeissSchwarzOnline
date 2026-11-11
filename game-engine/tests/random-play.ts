/**
 * Playing whole games by choosing at random among the legal answers, with
 * every invariant checked at every decision. Shared by the regular complete
 * game tests and the long soak run (npm run soak).
 */

import {
  type Ability,
  type CardDef,
  type Choice,
  type Decision,
  type Effect,
  type GameConfig,
  type GameEvent,
  type GameState,
  type PlayerId,
  type RngState,
  type TriggerIcon,
  type CardView,
  PILE_ZONES,
  SLOTS,
  backup,
  checkInvariants,
  createGame,
  getPlayerView,
  nextInt,
  opponentOf,
  seedRng,
  submitChoice,
} from '../src/index';
import { type DefOverride, shouldBeHidden, testConfig } from './helpers';

function pickSome(rng: RngState, items: readonly number[], count: number): number[] {
  const pool = [...items];
  const picked: number[] = [];
  for (let i = 0; i < count; i++) picked.push(pool.splice(nextInt(rng, pool.length), 1)[0]!);
  return picked;
}

export type Policy = (decision: Decision, rng: RngState) => Choice;

/** Picks uniformly among sensible answers; passes the main phase a third of the time so turns end. */
export const randomPolicy: Policy = (decision, rng) => {
  switch (decision.kind) {
    case 'MULLIGAN':
      return { kind: 'MULLIGAN', discard: pickSome(rng, decision.cards, nextInt(rng, decision.cards.length + 1)) };
    case 'CLOCK':
      return { kind: 'CLOCK', card: nextInt(rng, 4) === 0 ? null : decision.cards[nextInt(rng, decision.cards.length)]! };
    case 'MAIN': {
      if (nextInt(rng, 3) === 0) return { kind: 'MAIN', action: { type: 'PASS' } };
      return { kind: 'MAIN', action: decision.actions[nextInt(rng, decision.actions.length)]! };
    }
    case 'CLIMAX':
      if (decision.cards.length === 0 || nextInt(rng, 2) === 0) return { kind: 'CLIMAX', card: null };
      return { kind: 'CLIMAX', card: decision.cards[nextInt(rng, decision.cards.length)]! };
    case 'LEVEL_UP':
      return { kind: 'LEVEL_UP', card: decision.cards[nextInt(rng, decision.cards.length)]! };
    case 'HAND_LIMIT':
      return { kind: 'HAND_LIMIT', discard: pickSome(rng, decision.cards, decision.count) };
    case 'RULE_ACTION_ORDER':
      return { kind: 'RULE_ACTION_ORDER', first: decision.options[nextInt(rng, decision.options.length)]! };
    case 'ATTACK':
      if (nextInt(rng, 6) === 0) return { kind: 'ATTACK', attack: null };
      return { kind: 'ATTACK', attack: decision.attacks[nextInt(rng, decision.attacks.length)]! };
    case 'COUNTER': {
      const options: Choice[] = [
        ...decision.cards.map((card): Choice => ({ kind: 'COUNTER', card })),
        ...decision.backups.map((b): Choice => ({ kind: 'COUNTER', card: b.card, ability: b.ability })),
      ];
      if (options.length === 0 || nextInt(rng, 3) === 0) return { kind: 'COUNTER', card: null };
      return options[nextInt(rng, options.length)]!;
    }
    case 'CHOOSE_ABILITY':
      return { kind: 'CHOOSE_ABILITY', id: decision.abilities[nextInt(rng, decision.abilities.length)]!.id };
    case 'CONFIRM':
      return { kind: 'CONFIRM', accept: nextInt(rng, 2) === 0 };
    case 'SELECT_CARDS': {
      const max = Math.min(decision.max, decision.cards.length);
      const count = decision.min + nextInt(rng, max - decision.min + 1);
      return { kind: 'SELECT_CARDS', cards: pickSome(rng, decision.cards, count) };
    }
    case 'SELECT_SLOT':
      return { kind: 'SELECT_SLOT', slot: decision.slots[nextInt(rng, decision.slots.length)]! };
    case 'SELECT_OPTION':
      return { kind: 'SELECT_OPTION', option: decision.options[nextInt(rng, decision.options.length)]! };
  }
};

/** Never clocks, never plays: the game is decided by refreshes alone. */
export const passivePolicy: Policy = (decision, rng) => {
  switch (decision.kind) {
    case 'MULLIGAN':
      return { kind: 'MULLIGAN', discard: [] };
    case 'CLOCK':
      return { kind: 'CLOCK', card: null };
    case 'MAIN':
      return { kind: 'MAIN', action: { type: 'PASS' } };
    case 'CLIMAX':
      return { kind: 'CLIMAX', card: null };
    default:
      return randomPolicy(decision, rng);
  }
};

/** Decisions that are only ever asked right after a check timing has finished. */
const SETTLED_KINDS = new Set<Decision['kind']>(['MULLIGAN', 'CLOCK', 'MAIN', 'CLIMAX', 'ATTACK', 'COUNTER', 'HAND_LIMIT']);

export interface Played {
  state: GameState;
  events: GameEvent[];
  decisions: number;
  /** Every kind of decision that came up. */
  kinds: Set<Decision['kind']>;
  problems: string[];
}

/**
 * Compares each player's view with the state position by position: every
 * card must be hidden exactly when the rules say so (an independent
 * statement in helpers.ts), and a visible card must show the right card.
 * Hidden cards a player may look at are only given in that player's own
 * decision, and only for cards of their own deck.
 */
function leakProblems(state: GameState, label: string): string[] {
  const problems: string[] = [];
  for (const viewer of [0, 1] as const) {
    const view = getPlayerView(state, viewer);
    if (JSON.stringify(view).includes('instanceId')) problems.push(`${label}: view of P${viewer} exposes instanceId`);

    for (const owner of [0, 1] as const) {
      const zones = state.zones[owner];
      const side = view.sides[owner];
      const piles: [string, number[], CardView[]][] = [
        ...PILE_ZONES.map((zone): [string, number[], CardView[]] => [zone, zones[zone], side[zone]]),
        ...SLOTS.flatMap((slot): [string, number[], CardView[]][] => [
          [`stage.${slot}`, zones.stage[slot], side.stage[slot]],
          [`marker.${slot}`, zones.marker[slot], side.marker[slot]],
        ]),
      ];
      for (const [name, ids, cards] of piles) {
        if (ids.length !== cards.length) problems.push(`${label}: P${viewer} sees ${cards.length} cards in P${owner}.${name}, there are ${ids.length}`);
        ids.forEach((id, i) => {
          const inst = state.instances[id]!;
          const shown = cards[i];
          if (!shown) return;
          if (shown.hidden !== shouldBeHidden(viewer, inst)) {
            problems.push(`${label}: P${viewer} ${shown.hidden ? 'cannot' : 'can'} see ${inst.cardId} in P${owner}.${name}`);
          } else if (!shown.hidden && (shown.cardId !== inst.cardId || shown.objectId !== inst.objectId)) {
            problems.push(`${label}: P${viewer} sees the wrong card in P${owner}.${name}`);
          }
        });
      }
    }

    const decision = view.decision;
    if (decision && !decision.mine && Object.keys(decision).sort().join() !== 'id,kind,mine,player') {
      problems.push(`${label}: P${viewer} sees details of the opponent's decision`);
    }
    if (decision?.mine && (decision.decision.kind === 'SELECT_CARDS' || decision.decision.kind === 'CONFIRM')) {
      for (const objectId of Object.keys(decision.decision.look ?? {}).map(Number)) {
        const inst = state.instances.find((i) => i.objectId === objectId);
        if (!inst || inst.location.zone !== 'deck' || inst.location.player !== viewer) {
          problems.push(`${label}: P${viewer} is shown a card outside their own deck`);
        } else if (decision.decision.look![objectId] !== inst.cardId) {
          problems.push(`${label}: P${viewer} is shown the wrong card for a card they look at`);
        }
      }
    }
  }
  return problems;
}

export function playGame(seed: string, policy: Policy, maxDecisions: number, defs?: DefOverride): Played {
  return playGameWith(testConfig(defs), seed, policy, maxDecisions);
}

/** Plays a complete game with any card data and decks (for example real cards from the card database). */
export function playGameWith(config: GameConfig, seed: string, policy: Policy, maxDecisions: number): Played {
  const rng = seedRng(`policy-${seed}`);
  const created = createGame(config, seed);
  let state = created.state;
  const events = [...created.events];
  const problems: string[] = [];
  const kinds = new Set<Decision['kind']>();
  let decisions = 0;

  while (!state.result && problems.length === 0) {
    const decision = state.pending;
    if (!decision) {
      problems.push('the game has neither a result nor a pending decision');
      break;
    }
    if (decisions >= maxDecisions) {
      problems.push(`no result after ${maxDecisions} decisions`);
      break;
    }
    kinds.add(decision.kind);
    const label = `decision ${decisions} (${decision.kind})`;
    for (const p of checkInvariants(state, { settled: SETTLED_KINDS.has(decision.kind) })) problems.push(`${label}: ${p}`);
    // Views are compared every 20 decisions, and at every decision that shows the player hidden cards.
    const looks = (decision.kind === 'SELECT_CARDS' || decision.kind === 'CONFIRM') && decision.look !== undefined;
    if (decisions % 20 === 0 || looks) problems.push(...leakProblems(state, label));

    const result = submitChoice(state, { player: decision.player, decisionId: decision.id, choice: policy(decision, rng) });
    if (!result.ok) {
      problems.push(`${label}: a choice built from the decision was rejected: ${result.code} ${result.message}`);
      break;
    }
    state = result.state;
    events.push(...result.events);
    decisions++;
  }

  if (state.result) {
    for (const p of checkInvariants(state)) problems.push(`final state: ${p}`);
  }
  return { state, events, decisions, kinds, problems };
}

/** Checks on a finished game: one result, consecutive events, and a loser who really meets a losing condition. */
export function resultProblems(game: Played): string[] {
  const problems: string[] = [];
  const result = game.state.result;
  if (!result) return ['the game has no result'];
  const ended = game.events.filter((e) => e.type === 'GAME_ENDED').length;
  if (ended !== 1) problems.push(`the game ended ${ended} times`);
  if (game.events[game.events.length - 1]?.type !== 'GAME_ENDED') problems.push('something happened after the game ended');
  game.events.forEach((e, index) => {
    if (e.seq !== index + 1) problems.push(`event ${index} has number ${e.seq}`);
  });
  if (result.outcome === 'WIN') {
    if (result.loser !== opponentOf(result.winner)) problems.push('winner and loser are the same player');
    const loser = game.state.zones[result.loser];
    if (result.reason === 'LEVEL_4' && loser.level.length < 4) problems.push('lost at level 4 with fewer than four level cards');
    if (result.reason === 'NO_CARDS' && loser.deck.length + loser.waitingRoom.length > 0) problems.push('lost for having no cards while having some');
  }
  if (game.state.costDepth !== 0) problems.push('a cost payment was left unfinished');
  return problems;
}

// ---------------------------------------------------------------------------
// Test decks. Synthetic cards only; see helpers.ts.
// ---------------------------------------------------------------------------

const COLORS = ['red', 'blue', 'green', 'yellow'];
export const ALL_ICONS: TriggerIcon[] = ['SOUL', 'RETURN', 'POOL', 'COMEBACK', 'DRAW', 'SHOT', 'TREASURE', 'GATE', 'STANDBY', 'CHOICE', 'CHANCE', 'DISCOVERY', 'FOCUS'];
const CLIMAX_ICONS: TriggerIcon[][] = [['SOUL', 'SOUL'], ['SOUL', 'GATE'], ['SHOT'], ['TREASURE'], ['CHANCE'], ['DISCOVERY'], ['STANDBY', 'SOUL'], ['CHOICE']];

/** Every trigger icon, counters, four colours, levels 0 to 2 and costs 0 to 1. */
export const iconDeck: DefOverride = (_player: PlayerId, i: number): Partial<CardDef> | undefined => {
  if (i >= 42) return { color: COLORS[i % 2]!, triggers: CLIMAX_ICONS[i - 42]! };
  if (i >= 36) return { kind: 'EVENT', power: null, soul: null, level: 0, cost: i % 2, color: COLORS[i % 4]!, counter: i % 2 === 0 };
  return {
    level: i % 3,
    cost: i % 2,
    color: COLORS[i % 4]!,
    power: 500 * (1 + (i % 5)),
    soul: 1 + (i % 2),
    triggers: i % 2 === 0 ? [ALL_ICONS[i % ALL_ICONS.length]!] : [],
  };
};

const DRAW: Effect[] = [{ do: 'DRAW', count: 1 }];

/** Characters get these ability sets in turn, by deck position. */
export const CHARACTER_ABILITIES: Ability[][] = [
  // 応援
  [{ type: 'CONT', assist: true, apply: [{ target: { who: 'IN_FRONT' }, stat: 'POWER', amount: 500 }] }],
  // when played from hand, may pay (1) to return a character from the waiting room
  [{ type: 'AUTO', trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' }, cost: [{ pay: 'STOCK', count: 1 }], effect: [{ do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { kind: 'CHARACTER' }, min: 1, max: 1 }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' }] }],
  // 集中
  [{ type: 'ACT', timing: 'MAIN', cost: [{ pay: 'REST_SELF' }], effect: [{ do: 'BRAINSTORM', count: 3, per: { kind: 'CLIMAX' }, each: DRAW }] }],
  // 助太刀
  [backup(1500, 0, [{ pay: 'SELF_TO_WAITING_ROOM' }])],
  // when it attacks, +1000 power for the turn; when its battle opponent is reversed, may draw
  [
    { type: 'AUTO', trigger: { on: 'ATTACKS' }, effect: [{ do: 'MODIFY', target: { who: 'SELF' }, stat: 'POWER', amount: 1000 }] },
    { type: 'AUTO', trigger: { on: 'BATTLE_OPPONENT_REVERSED' }, optional: true, effect: DRAW },
  ],
  // once per turn: discard a card to put the top deck card into stock
  [{ type: 'ACT', timing: 'MAIN', limit: 1, cost: [{ pay: 'DISCARD', count: 1 }], effect: [{ do: 'DECK_TOP', count: 1, to: 'STOCK' }] }],
  // 加速-style: top deck card to clock, then deal 1 damage
  [{ type: 'ACT', timing: 'MAIN', limit: 1, cost: [{ pay: 'DECK_TOP_TO_CLOCK' }, { pay: 'REST_SELF' }], effect: [{ do: 'DAMAGE', amount: 1 }] }],
  // 大活躍 and an アラーム power bonus
  [
    { type: 'CONT', greatPerformance: true, apply: [] },
    { type: 'CONT', alarm: true, apply: [{ target: { who: 'ALL_YOURS' }, stat: 'POWER', amount: 500 }] },
  ],
];

const EVENT_EFFECTS: Effect[][] = [
  [{ do: 'DRAW', count: 2 }, { do: 'CHOOSE', from: 'YOUR_HAND', min: 1, max: 1 }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'WAITING_ROOM' }],
  [{ do: 'CHOOSE', from: 'YOUR_DECK', filter: { kind: 'CHARACTER' }, min: 1, max: 1 }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND', reveal: true }, { do: 'SHUFFLE' }],
  [{ do: 'MODIFY', target: { who: 'ALL_YOURS' }, stat: 'POWER', amount: 1000 }],
  [{ do: 'CHOOSE', from: 'OPPONENT_STAGE', min: 1, max: 1 }, { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'WAITING_ROOM' }],
  [{ do: 'DAMAGE', amount: 1 }],
  [{ do: 'IF', condition: { if: 'LEVEL', min: 1 }, then: [{ do: 'DRAW', count: 2 }], else: DRAW }],
];

const CLIMAX_ABILITY: Ability[] = [{ type: 'CONT', apply: [{ target: { who: 'ALL_YOURS' }, stat: 'POWER', amount: 1000 }, { target: { who: 'ALL_YOURS' }, stat: 'SOUL', amount: 1 }] }];

/** Characters with abilities, events with effects, climaxes with a continuous effect. */
export const abilityDeck: DefOverride = (_player: PlayerId, i: number): Partial<CardDef> | undefined => {
  if (i >= 42) return { abilities: CLIMAX_ABILITY, triggers: i % 2 === 0 ? ['SOUL', 'SOUL'] : ['SOUL'] };
  if (i >= 36) return { kind: 'EVENT', power: null, soul: null, level: 0, cost: 0, counter: i % 3 === 0, effect: EVENT_EFFECTS[i - 36]! };
  const abilities = CHARACTER_ABILITIES[i % CHARACTER_ABILITIES.length]!;
  return { power: 500 * (1 + (i % 4)), abilities, counter: i % CHARACTER_ABILITIES.length === 3, triggers: i % 3 === 0 ? ['SOUL'] : [] };
};
