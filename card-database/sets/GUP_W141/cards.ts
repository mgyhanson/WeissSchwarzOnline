/**
 * ブースターパック ガールズ＆パンツァー (GUP/W141, 2026-10-30): 21 of its 114 cards.
 *
 * Printed information comes from official.json. Ability data below was
 * written from the official text in that file (no Q&A was published for
 * these cards as of 2026-11-12). Errata page checked 2026-11-12 (last
 * updated 2026-11-02): the only entry for the set corrects the artwork of
 * GUP/W141-062S, which is not among these cards. Neo-Standard restriction
 * list checked 2026-11-12: nothing for ガールズ＆パンツァー.
 *
 * Cards that need what the engine cannot do yet were not taken: markers and
 * 搭乗 (e.g. 006, 014, 030), "the opponent cannot play events or backup"
 * (016, 018), two trigger checks (049), amounts counted from the opponent's
 * characters or a character's soul (043, 074, 102), choices between two
 * effects (004, 064), and similar. See docs/04-visual-card-expansion-plan.md.
 * 069 and 108 were added on 2026-11-14 (no Q&A in the official data; errata
 * page and restriction list checked that day: nothing for these two).
 * Chinese explanations are AI-assisted and unverified.
 */

import type { Ability, CardFilter } from '@wso/game-engine';
import { encore } from '@wso/game-engine';
import type { CardRecord } from '../../src/types';

const AI = (zh: string): CardRecord['explanation'] => ({ zh, source: 'AI_ASSISTED', status: '待核實' });

/** 《戦車道》のキャラ */
const TANK: CardFilter = { kind: 'CHARACTER', traits: ['戦車道'] };

const climaxPowerSoul: Ability = {
  type: 'CONT',
  apply: [
    { target: { who: 'ALL_YOURS' }, stat: 'POWER', amount: 1000 },
    { target: { who: 'ALL_YOURS' }, stat: 'SOUL', amount: 1 },
  ],
};

/** 自分の《戦車道》のキャラを1枚選び、そのターン中、パワーを＋N */
const boostTank = (amount: number) =>
  [
    { do: 'CHOOSE', from: 'YOUR_STAGE', filter: TANK, min: 1, max: 1 },
    { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'POWER', amount },
  ] as const;

/** 自分の控え室の《戦車道》のキャラを1枚選び、手札に戻す */
const salvageTank = [
  { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: TANK, min: 1, max: 1 },
  { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
] as const;

export const records: CardRecord[] = [
  // Added 2026-11-14. They stand first so that the order of the older cards (and of test decks made from this list) is unchanged.
  {
    cardId: 'GUP/W141-069',
    support: 'verified',
    abilities: [
      {
        type: 'AUTO',
        trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' },
        condition: { if: 'CHARACTERS', min: 2, other: true, filter: TANK },
        optional: true,
        effect: [
          { do: 'DRAW', count: 1 },
          { do: 'CHOOSE', from: 'YOUR_HAND', min: 1, max: 1 },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'WAITING_ROOM' },
        ],
      },
      {
        type: 'AUTO',
        trigger: { on: 'ATTACKS' },
        effect: [
          { do: 'CHOOSE', from: 'YOUR_STAGE', filter: TANK, other: true, min: 1, max: 1 },
          { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'POWER', amount: 1500, until: 'NEXT_OPPONENT_TURN' },
          { do: 'GRANT', target: { who: 'CHOSEN' }, ability: encore([{ pay: 'DISCARD', count: 1, filter: { kind: 'CHARACTER' } }]), until: 'NEXT_OPPONENT_TURN' },
        ],
      },
    ],
    notes: [
      'First ability: 1枚引いてよい。そうしたら… — the player decides once; drawing is then followed by the discard.',
      '次の相手のターンの終わりまで: the power and the given アンコール last until the end of the opponent\'s next turn (CR-8.2.1.2).',
    ],
    explanation: AI(
      '【自】這張卡由手牌放到舞台時，如果我方其他《戦車道》角色有 2 張或以上，可以抽 1 張；抽了的話，選自己 1 張手牌放到控え室。\n' +
        '【自】這張卡攻擊時：選我方其他 1 張《戦車道》角色，直到對手下一個回合結束為止，Power +1500，並得到「【自】Encore [把手牌 1 張角色放到控え室]」。',
    ),
  },
  {
    cardId: 'GUP/W141-108',
    support: 'verified',
    abilities: [
      {
        type: 'AUTO',
        trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' },
        condition: { if: 'CHARACTERS', min: 4, other: true, filter: TANK },
        optional: true,
        effect: [
          { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: TANK, min: 1, max: 1 },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'STOCK' },
        ],
      },
      {
        type: 'AUTO',
        trigger: { on: 'REVERSED' },
        condition: { if: 'BATTLE_OPPONENT', filter: { levelAboveMasterLevel: true } },
        optional: true,
        effect: [{ do: 'MOVE', target: { who: 'BATTLE_OPPONENT' }, to: 'DECK_BOTTOM' }],
      },
    ],
    notes: ['レベルが相手のレベルより高い: the battle opponent\'s level is compared with the level of the opponent (its master).'],
    explanation: AI(
      '【自】這張卡由手牌放到舞台時，如果我方其他《戦車道》角色有 4 張或以上，可以從控え室選 1 張《戦車道》角色放到 Stock。\n' +
        '【自】這張卡被 Reverse 時，如果它的戰鬥對手的 Level 高於對手玩家的 Level，可以把那張角色放到它主人的山札底。',
    ),
  },
  {
    cardId: 'GUP/W141-001',
    support: 'verified',
    abilities: [
      {
        type: 'CONT',
        condition: { if: 'ALL', of: [{ if: 'YOUR_TURN' }, { if: 'CHARACTERS', min: 2, other: true }] },
        apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: 3000 }],
      },
      {
        type: 'AUTO',
        trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' },
        cost: [{ pay: 'STOCK', count: 1 }, { pay: 'DECK_TOP_TO_CLOCK' }],
        effect: [
          { do: 'CHOOSE', from: 'YOUR_DECK', filter: { kind: 'CHARACTER', levelMax: 1 }, min: 0, max: 1 },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND', reveal: true },
          { do: 'SHUFFLE' },
        ],
      },
    ],
    explanation: AI(
      '【永】我方回合中，如果我方其他角色有 2 張或以上，這張卡 Power +3000。\n' +
        '【自】[(1) 把山札頂 1 張放到 Clock]：這張卡由手牌放到舞台時，可以支付費用；支付後查看自己整個山札，選最多 1 張 Level 1 或以下的角色，給對手看後加入手牌，然後洗山札。',
    ),
  },
  {
    cardId: 'GUP/W141-010',
    support: 'verified',
    abilities: [
      { type: 'AUTO', trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' }, effect: [...boostTank(3000)] },
      {
        type: 'AUTO',
        trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' },
        cost: [{ pay: 'STOCK', count: 1 }, { pay: 'DISCARD', count: 1 }],
        effect: [
          { do: 'CHOOSE', from: 'OPPONENT_STAGE', min: 1, max: 1 },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
        ],
      },
    ],
    explanation: AI(
      '【自】這張卡由手牌放到舞台時，選我方 1 張《戦車道》角色（可以是這張卡），該回合 Power +3000。\n' +
        '【自】[(1) 把 1 張手牌放到控え室]：這張卡由手牌放到舞台時，可以支付費用；支付後選對手 1 張角色，返回其主人的手牌。\n' +
        '兩個能力同時觸發，由你決定先處理哪一個。',
    ),
  },
  {
    cardId: 'GUP/W141-017',
    support: 'verified',
    abilities: [
      { type: 'CONT', apply: [{ target: { who: 'ALL_YOURS', other: true, filter: TANK }, stat: 'POWER', amount: 500 }] },
      { type: 'ACT', timing: 'MAIN', cost: [{ pay: 'STOCK', count: 2 }, { pay: 'REST_SELF' }], effect: [{ do: 'CLOCK_TOP', to: 'WAITING_ROOM' }] },
    ],
    explanation: AI('【永】我方其他《戦車道》角色全部 Power +500。\n【起】[(2) 把這張卡 Rest]：把自己 Clock 最上面 1 張放到控え室（即回復 1 點傷害）。'),
  },
  {
    cardId: 'GUP/W141-025',
    support: 'verified',
    abilities: [climaxPowerSoul],
    explanation: AI('【永】我方所有角色 Power +1000、Soul +1。\nTrigger 圖示「Choice」：翻出時，可以從控え室選 1 張有 Soul Trigger 圖示的角色，加入手牌或放到 Stock。'),
  },
  {
    cardId: 'GUP/W141-027',
    support: 'verified',
    abilities: [climaxPowerSoul],
    explanation: AI('【永】我方所有角色 Power +1000、Soul +1。\nTrigger 圖示「Choice」：翻出時，可以從控え室選 1 張有 Soul Trigger 圖示的角色，加入手牌或放到 Stock。'),
  },
  {
    cardId: 'GUP/W141-038',
    support: 'verified',
    abilities: [
      { type: 'AUTO', trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' }, effect: [{ do: 'MODIFY', target: { who: 'SELF' }, stat: 'POWER', amount: 1500 }] },
      {
        type: 'AUTO',
        trigger: { on: 'STAGE_TO_WAITING_ROOM' },
        cost: [{ pay: 'STOCK', count: 1 }, { pay: 'DECK_TOP_TO_CLOCK' }],
        effect: [...salvageTank],
      },
    ],
    explanation: AI(
      '【自】這張卡由手牌放到舞台時，該回合這張卡 Power +1500。\n' +
        '【自】[(1) 把山札頂 1 張放到 Clock]：這張卡由舞台放到控え室時，可以支付費用；支付後從控え室選 1 張《戦車道》角色加入手牌（可以選這張卡本身）。',
    ),
  },
  {
    cardId: 'GUP/W141-039',
    support: 'verified',
    abilities: [
      {
        type: 'CONT',
        condition: { if: 'ALL', of: [{ if: 'YOUR_TURN' }, { if: 'CHARACTERS', min: 2, other: true, filter: TANK }] },
        apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: 2000 }],
      },
      {
        type: 'AUTO',
        trigger: { on: 'BATTLE_OPPONENT_REVERSED' },
        cost: [{ pay: 'STOCK', count: 1 }],
        effect: [{ do: 'LOOK_TOP', upTo: 4, pick: TANK, reveal: true }],
      },
    ],
    explanation: AI(
      '【永】我方回合中，如果我方其他《戦車道》角色有 2 張或以上，這張卡 Power +2000。\n' +
        '【自】[(1)]：這張卡的戰鬥對手 Reverse 時，可以支付 1 Stock；支付後逐張查看山札頂最多 4 張，選最多 1 張《戦車道》角色給對手看後加入手牌，其餘查看過的卡放到控え室。',
    ),
  },
  {
    cardId: 'GUP/W141-041',
    support: 'verified',
    abilities: [
      { type: 'CONT', condition: { if: 'ALL_CHARACTERS', filter: TANK }, apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: 4000 }] },
      {
        type: 'AUTO',
        keywords: ['CX_COMBO'],
        trigger: { on: 'ATTACKS' },
        condition: { if: 'ALL', of: [{ if: 'CLIMAX_IN_PLAY', name: 'ミフネ作戦' }, { if: 'ALL_CHARACTERS', filter: TANK }] },
        effect: [
          { do: 'CHOOSE', from: 'YOUR_STAGE', filter: TANK, other: true, min: 0, max: 1 },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
          { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: TANK, min: 0, max: 1 },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
        ],
      },
    ],
    explanation: AI(
      '【永】我方所有角色都是《戦車道》時，這張卡 Power +4000。\n' +
        '【自】CX Combo：這張卡攻擊時，如果 Climax 置場有「ミフネ作戦」而且我方所有角色都是《戦車道》：選我方另外最多 1 張《戦車道》角色返回手牌，然後從控え室選最多 1 張《戦車道》角色加入手牌。',
    ),
  },
  {
    cardId: 'GUP/W141-044',
    support: 'verified',
    abilities: [
      {
        type: 'CONT',
        condition: { if: 'ALL', of: [{ if: 'YOUR_TURN' }, { if: 'CHARACTERS', min: 1, other: true, filter: TANK }] },
        apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: 1500 }],
      },
      {
        type: 'AUTO',
        trigger: { on: 'BATTLE_OPPONENT_REVERSED' },
        condition: { if: 'CLIMAX_IN_PLAY' },
        optional: true,
        effect: [{ do: 'DECK_TOP', count: 1, to: 'STOCK' }],
      },
    ],
    explanation: AI(
      '【永】我方回合中，如果我方有其他《戦車道》角色，這張卡 Power +1500。\n' +
        '【自】這張卡的戰鬥對手 Reverse 時，如果我方 Climax 置場有任何 Climax，可以把自己山札頂 1 張放到 Stock。',
    ),
  },
  {
    cardId: 'GUP/W141-048',
    support: 'verified',
    abilities: [
      {
        type: 'AUTO',
        trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' },
        cost: [{ pay: 'DISCARD', count: 1 }],
        effect: [
          { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { ...TANK, levelMax: 0 }, min: 1, max: 1 },
          { do: 'CHOOSE_SLOT', which: 'ANY' },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'CHOSEN_SLOT' },
        ],
      },
      {
        type: 'AUTO',
        trigger: { on: 'CLIMAX_PLACED' },
        effect: [
          { do: 'CHOOSE', from: 'YOUR_STAGE', filter: TANK, min: 0, max: 2 },
          { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'POWER', amount: 1500 },
        ],
      },
    ],
    explanation: AI(
      '【自】[把 1 張手牌放到控え室]：這張卡由手牌放到舞台時，可以支付費用；支付後從控え室選 1 張 Level 0 或以下的《戦車道》角色，放到舞台任意一個枠（枠內原有的角色會被放到控え室）。\n' +
        '【自】我方 Climax 放到 Climax 置場時，選我方最多 2 張《戦車道》角色，該回合 Power +1500。',
    ),
  },
  {
    cardId: 'GUP/W141-052',
    support: 'verified',
    abilities: [climaxPowerSoul],
    explanation: AI('【永】我方所有角色 Power +1000、Soul +1。\nTrigger 圖示「Treasure」：翻出時這張卡加入手牌（不放到 Stock），然後可以把山札頂 1 張放到 Stock。'),
  },
  {
    cardId: 'GUP/W141-054',
    support: 'verified',
    abilities: [climaxPowerSoul],
    explanation: AI('【永】我方所有角色 Power +1000、Soul +1。\nTrigger 圖示「Treasure」：翻出時這張卡加入手牌（不放到 Stock），然後可以把山札頂 1 張放到 Stock。'),
  },
  {
    cardId: 'GUP/W141-084',
    support: 'verified',
    abilities: [
      { type: 'AUTO', trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' }, effect: [...boostTank(1500)] },
      {
        type: 'AUTO',
        trigger: { on: 'STAGE_TO_WAITING_ROOM' },
        cost: [{ pay: 'DISCARD', count: 1 }],
        effect: [{ do: 'LOOK_TOP', upTo: 4, pick: TANK, reveal: true }],
      },
    ],
    explanation: AI(
      '【自】這張卡由手牌放到舞台時，選我方 1 張《戦車道》角色，該回合 Power +1500。\n' +
        '【自】[把 1 張手牌放到控え室]：這張卡由舞台放到控え室時，可以支付費用；支付後逐張查看山札頂最多 4 張，選最多 1 張《戦車道》角色給對手看後加入手牌，其餘查看過的卡放到控え室。',
    ),
  },
  {
    cardId: 'GUP/W141-088',
    support: 'verified',
    abilities: [
      {
        type: 'AUTO',
        trigger: { on: 'CLIMAX_PLACED', filter: { kind: 'CLIMAX', hasTrigger: 'DRAW' } },
        effect: [
          { do: 'CHOOSE', from: 'YOUR_STAGE', min: 1, max: 1 },
          { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'POWER', amount: 1500 },
        ],
      },
      {
        type: 'ACT',
        keywords: ['BRAINSTORM'],
        timing: 'MAIN',
        cost: [{ pay: 'STOCK', count: 1 }, { pay: 'REST_SELF' }],
        effect: [
          {
            do: 'BRAINSTORM',
            count: 4,
            per: { kind: 'CLIMAX', hasTrigger: 'DRAW' },
            each: [
              { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: TANK, min: 0, max: 1 },
              { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
              { do: 'CHOOSE', from: 'YOUR_STAGE', min: 1, max: 1 },
              { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'POWER', amount: 1000 },
            ],
          },
        ],
      },
    ],
    explanation: AI(
      '【自】我方 Trigger 圖示是「Draw」的 Climax 放到 Climax 置場時，選我方 1 張角色，該回合 Power +1500。\n' +
        '【起】集中 [(1) 把這張卡 Rest]：翻開山札頂 4 張放到控え室，其中每有 1 張 Trigger 圖示是「Draw」的 Climax：從控え室選最多 1 張《戦車道》角色加入手牌，然後選我方 1 張角色，該回合 Power +1000。',
    ),
  },
  {
    cardId: 'GUP/W141-091',
    support: 'verified',
    abilities: [
      { type: 'AUTO', trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' }, cost: [{ pay: 'DISCARD', count: 1 }], effect: [...salvageTank] },
      {
        type: 'ACT',
        timing: 'MAIN',
        cost: [{ pay: 'SELF_TO_WAITING_ROOM' }],
        effect: [
          { do: 'CHOOSE', from: 'OPPONENT_STAGE', min: 1, max: 1 },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
        ],
      },
    ],
    explanation: AI(
      '【自】[把 1 張手牌放到控え室]：這張卡由手牌放到舞台時，可以支付費用；支付後從控え室選 1 張《戦車道》角色加入手牌。\n' +
        '【起】[把這張卡放到控え室]：選對手 1 張角色，返回其主人的手牌。',
    ),
  },
  {
    cardId: 'GUP/W141-099',
    support: 'verified',
    abilities: [
      {
        type: 'CONT',
        keywords: ['ASSIST'],
        assist: true,
        apply: [{ target: { who: 'IN_FRONT', filter: TANK }, stat: 'POWER', amount: 500, perTargetLevel: true }],
      },
      {
        type: 'AUTO',
        trigger: { on: 'CLIMAX_PLACED', filter: { kind: 'CLIMAX', hasTrigger: 'GATE' } },
        effect: [
          { do: 'CHOOSE', from: 'YOUR_STAGE', min: 1, max: 1 },
          { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'POWER', amount: 1500 },
        ],
      },
      {
        type: 'ACT',
        timing: 'MAIN',
        cost: [{ pay: 'DISCARD', count: 1, filter: { name: 'BT-42のなんでも屋 アキ' } }, { pay: 'REST_SELF' }],
        effect: [
          { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { kind: 'CHARACTER' }, min: 1, max: 1 },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
        ],
      },
    ],
    notes: ['The third ability needs 「BT-42のなんでも屋 アキ」 (GUP/W141-089) in hand, which is not in the database yet; until then it can never be played, as on a real table without that card.'],
    explanation: AI(
      '【永】應援：放在後列時，它前面的我方《戦車道》角色 Power +X，X = 該角色的 Level × 500。\n' +
        '【自】我方 Trigger 圖示是「Gate」的 Climax 放到 Climax 置場時，選我方 1 張角色，該回合 Power +1500。\n' +
        '【起】[把手牌 1 張「BT-42のなんでも屋 アキ」放到控え室，並把這張卡 Rest]：從控え室選 1 張角色加入手牌。',
    ),
  },
  {
    cardId: 'GUP/W141-104',
    support: 'verified',
    abilities: [
      {
        type: 'AUTO',
        trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' },
        optional: true,
        effect: [
          { do: 'CHOOSE', from: 'YOUR_HAND', min: 1, max: 1 },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'STOCK' },
        ],
      },
      { type: 'AUTO', trigger: { on: 'STAGE_TO_WAITING_ROOM' }, cost: [{ pay: 'STOCK', count: 2 }], effect: [...salvageTank] },
    ],
    explanation: AI(
      '【自】這張卡由手牌放到舞台時，可以選 1 張手牌放到 Stock。\n' +
        '【自】[(2)]：這張卡由舞台放到控え室時，可以支付 2 Stock；支付後從控え室選 1 張《戦車道》角色加入手牌（可以選這張卡本身）。',
    ),
  },
  {
    cardId: 'GUP/W141-111',
    support: 'verified',
    abilities: [climaxPowerSoul],
    explanation: AI('【永】我方所有角色 Power +1000、Soul +1。\nTrigger 圖示「Soul」及「Gate」：Gate 翻出時，可以從控え室選 1 張 Climax 加入手牌。'),
  },
  {
    cardId: 'GUP/W141-113',
    support: 'verified',
    abilities: [
      {
        type: 'AUTO',
        trigger: { on: 'THIS_CLIMAX_PLACED' },
        effect: [
          { do: 'DRAW', count: 1, optional: true },
          { do: 'CHOOSE', from: 'YOUR_STAGE', min: 0, max: 2 },
          { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'SOUL', amount: 1 },
        ],
      },
    ],
    explanation: AI(
      '【自】這張 Climax 由手牌放到 Climax 置場時：可以抽 1 張（也可以不抽），然後選我方最多 2 張角色，該回合 Soul +1。\n' +
        'Trigger 圖示「Draw」：翻出時可以抽 1 張。',
    ),
  },
];
