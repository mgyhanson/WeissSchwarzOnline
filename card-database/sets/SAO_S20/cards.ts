/**
 * ブースターパック ソードアート・オンライン (SAO/S20): 27 of its 104 cards.
 *
 * Printed information comes from official.json. Ability data below was
 * written from the official text and Q&A in that file. Errata page checked
 * 2026-11-12 (last updated 2026-11-02): no errata for these cards. Neo-Standard
 * restriction list checked 2026-11-12: the only ソードアート・オンライン entry is
 * SAO/S100-011, which is not among these cards.
 *
 * Cards of the set that need what the engine cannot do yet were not taken:
 * effects lasting until the end of the opponent's next turn (e.g. 加速 on
 * 006, 080), markers (011, 082), abilities active in memory (071), "the
 * opponent cannot encore" (006), "draw up to two" (081), triggers on other
 * characters attacking (005) and similar. See docs/04-visual-card-expansion-plan.md.
 * Chinese explanations are AI-assisted and unverified.
 */

import type { Ability, CardFilter } from '@wso/game-engine';
import { backup, bond, encore } from '@wso/game-engine';
import type { CardRecord } from '../../src/types';

const AI = (zh: string): CardRecord['explanation'] => ({ zh, source: 'AI_ASSISTED', status: '待核實' });

const VANILLA = '沒有能力的角色。';

/** 《アバター》か《ネット》のキャラ */
const AVATAR_OR_NET: CardFilter = { kind: 'CHARACTER', traits: ['アバター', 'ネット'] };
const AVATAR: CardFilter = { kind: 'CHARACTER', traits: ['アバター'] };

const assist500: Ability = { type: 'CONT', keywords: ['ASSIST'], assist: true, apply: [{ target: { who: 'IN_FRONT' }, stat: 'POWER', amount: 500 }] };

const climaxPowerSoul: Ability = {
  type: 'CONT',
  apply: [
    { target: { who: 'ALL_YOURS' }, stat: 'POWER', amount: 1000 },
    { target: { who: 'ALL_YOURS' }, stat: 'SOUL', amount: 1 },
  ],
};

/** 【自】 このカードが手札からクライマックス置場に置かれた時、あなたは1枚引き、自分のキャラを1枚選び、そのターン中、パワーを＋2000し、ソウルを＋1。 */
const drawAndBoost: Ability = {
  type: 'AUTO',
  trigger: { on: 'THIS_CLIMAX_PLACED' },
  effect: [
    { do: 'DRAW', count: 1 },
    { do: 'CHOOSE', from: 'YOUR_STAGE', min: 1, max: 1 },
    { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'POWER', amount: 2000 },
    { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'SOUL', amount: 1 },
  ],
};

/** 【永】 他のあなたのカード名に「…」を含むキャラがいるなら、このカードのパワーを＋1000し、このカードは『【自】 アンコール ［手札のキャラを1枚控え室に置く］』を得る。 */
function withPartner(name: string): Ability {
  return {
    type: 'CONT',
    condition: { if: 'CHARACTERS', min: 1, other: true, filter: { nameIncludes: name } },
    apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: 1000 }],
    grant: [{ target: { who: 'SELF' }, ability: encore([{ pay: 'DISCARD', count: 1, filter: { kind: 'CHARACTER' } }]) }],
  };
}

const BACKUP_QA = 'Q&A 2011.03.25: a backup needs no colour, but your level must be at least the level it names.';

export const records: CardRecord[] = [
  {
    cardId: 'SAO/S20-001',
    support: 'verified',
    abilities: [
      { type: 'CONT', condition: { if: 'CHARACTERS', min: 3, other: true, filter: AVATAR_OR_NET }, apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: 1000 }] },
      {
        type: 'AUTO',
        keywords: ['CX_COMBO'],
        trigger: { on: 'ATTACKS' },
        condition: { if: 'CLIMAX_IN_PLAY', name: '《スター・スプラッシュ》' },
        cost: [{ pay: 'STOCK', count: 1 }],
        effect: [
          { do: 'CHOOSE', from: 'YOUR_DECK', filter: AVATAR_OR_NET, min: 0, max: 1 },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND', reveal: true },
          { do: 'SHUFFLE' },
        ],
      },
    ],
    explanation: AI(
      '【永】我方其他《アバター》或《ネット》角色有 3 張或以上時，這張卡 Power +1000。\n' +
        '【自】支付 (1)：這張卡攻擊時，如果 Climax 置場有「《スター・スプラッシュ》」，可以支付 1 Stock；支付後查看自己整個山札，選最多 1 張《アバター》或《ネット》角色，給對手看後加入手牌，然後洗山札。（CX Combo）',
    ),
  },
  {
    cardId: 'SAO/S20-004',
    support: 'verified',
    abilities: [withPartner('キリト')],
    explanation: AI(
      '【永】我方有其他卡名包含「キリト」的角色時：這張卡 Power +1000，並得到『【自】Encore [把手牌 1 張角色放到控え室]』。\n' +
        '即是這張卡由舞台放到控え室時，可以棄 1 張角色手牌，把它以 Rest 狀態放回原本的枠。條件不成立時沒有這個 Encore（仍可用規則的 3 Stock Encore）。',
    ),
  },
  {
    cardId: 'SAO/S20-008',
    support: 'verified',
    abilities: [
      assist500,
      {
        type: 'AUTO',
        trigger: { on: 'CLIMAX_PLACED' },
        effect: [
          { do: 'CHOOSE', from: 'YOUR_STAGE', min: 1, max: 1 },
          { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'POWER', amount: 1000 },
        ],
      },
    ],
    explanation: AI('【永】應援：放在後列時，它前面的我方角色全部 Power +500。\n【自】我方 Climax 放到 Climax 置場時，選我方 1 張角色，該回合 Power +1000。'),
  },
  {
    cardId: 'SAO/S20-009',
    support: 'verified',
    abilities: [
      {
        type: 'AUTO',
        keywords: ['CHANGE'],
        trigger: { on: 'PHASE_START', phase: 'CLIMAX', turn: 'YOURS' },
        cost: [{ pay: 'STOCK', count: 1 }, { pay: 'DISCARD', count: 1 }, { pay: 'SELF_TO_WAITING_ROOM' }],
        effect: [
          { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { name: '囚われの女王 アスナ' }, min: 1, max: 1 },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'SOURCE_SLOT' },
        ],
      },
    ],
    notes: ['Putting this card into the waiting room as part of the cost also triggers its encore (CR-10.2.2); that follows from the rules, not from this data.'],
    explanation: AI(
      '【自】Change [(1) 把 1 張手牌放到控え室，並把這張卡放到控え室]：我方 Climax 階段開始時，可以支付這些費用；支付後從控え室選 1 張「囚われの女王 アスナ」放到這張卡原本的枠。\n' +
        '注意：費用中把這張卡放到控え室，也會觸發規則的 Encore。',
    ),
  },
  {
    cardId: 'SAO/S20-010',
    support: 'verified',
    abilities: [
      {
        type: 'AUTO',
        trigger: { on: 'USED_BACKUP' },
        condition: { if: 'CHARACTERS', min: 2, filter: AVATAR_OR_NET },
        effect: [
          { do: 'CHOOSE', from: 'YOUR_STAGE', min: 1, max: 1 },
          { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'POWER', amount: 1000 },
        ],
      },
      backup(1000, 1, [{ pay: 'SELF_TO_WAITING_ROOM' }]),
    ],
    notes: [BACKUP_QA],
    explanation: AI(
      '【自】使用這張卡的助太刀時，如果我方《アバター》或《ネット》角色有 2 張或以上，選我方 1 張角色，該回合 Power +1000。\n' +
        '【起】【Counter】助太刀 1000 Level 1 [把手牌的這張卡放到控え室]：對手 Front Attack 時的 Counter 步驟，被攻擊的角色該回合 Power +1000。\n' +
        '官方 Q&A：助太刀不需要顏色條件，但我方 Level 必須達到 1。',
    ),
  },
  {
    cardId: 'SAO/S20-014',
    support: 'verified',
    abilities: [
      bond('血盟騎士団への入団 キリト', [{ pay: 'DECK_TOP_TO_CLOCK' }]),
      {
        type: 'ACT',
        timing: 'MAIN',
        cost: [{ pay: 'STOCK', count: 1 }],
        effect: [
          { do: 'CHOOSE', from: 'YOUR_STAGE', filter: AVATAR, min: 1, max: 1 },
          { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'POWER', amount: 500 },
        ],
      },
    ],
    explanation: AI(
      '【自】絆／「血盟騎士団への入団 キリト」[把山札頂 1 張放到 Clock]：這張卡被使用而放到舞台時，可以支付費用；支付後從控え室選 1 張「血盟騎士団への入団 キリト」加入手牌。\n' +
        '【起】[(1)]：選我方 1 張《アバター》角色，該回合 Power +500。可以在主要階段重複使用。',
    ),
  },
  { cardId: 'SAO/S20-015', support: 'verified', abilities: [{ type: 'CONT', condition: { if: 'YOUR_TURN' }, apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: 1000 }] }], explanation: AI('【永】我方回合中，這張卡 Power +1000。') },
  { cardId: 'SAO/S20-017', support: 'verified', explanation: AI(VANILLA) },
  {
    cardId: 'SAO/S20-020',
    support: 'verified',
    abilities: [
      {
        type: 'CONT',
        condition: { if: 'ALL', of: [{ if: 'YOUR_TURN' }, { if: 'CHARACTERS', min: 2, other: true, filter: AVATAR }] },
        apply: [
          { target: { who: 'SELF' }, stat: 'LEVEL', amount: 1 },
          { target: { who: 'SELF' }, stat: 'POWER', amount: 1500 },
        ],
      },
    ],
    explanation: AI('【永】我方回合中，如果我方其他《アバター》角色有 2 張或以上，這張卡 Level +1、Power +1500。\n（Level 上升會影響側面攻擊時對手失去的 Soul 等。）'),
  },
  {
    cardId: 'SAO/S20-022',
    support: 'verified',
    effect: [
      { do: 'CHOOSE', from: 'YOUR_STAGE', filter: AVATAR_OR_NET, min: 1, max: 1 },
      { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'POWER', amount: 3500 },
    ],
    notes: ['Q&A 2011.03.25: a counter event needs the level and colour conditions like any card. Q&A 2008.04.14: it may also be played in your own main phase.'],
    explanation: AI(
      '【Counter】Event：選我方 1 張《アバター》或《ネット》角色，該回合 Power +3500。\n' +
        '官方 Q&A：在 Counter 步驟使用時仍要符合 Level 及顏色條件；也可以在自己的主要階段使用。',
    ),
  },
  { cardId: 'SAO/S20-023', support: 'verified', abilities: [drawAndBoost], explanation: AI('【自】這張 Climax 由手牌放到 Climax 置場時：抽 1 張，然後選我方 1 張角色，該回合 Power +2000、Soul +1。') },
  {
    cardId: 'SAO/S20-024',
    support: 'verified',
    abilities: [climaxPowerSoul],
    explanation: AI('【永】我方所有角色 Power +1000、Soul +1。\nTrigger 圖示「Soul」及「風」（Return）：風圖示翻出時，可以選對手 1 張角色返回手牌。'),
  },
  {
    cardId: 'SAO/S20-025',
    support: 'verified',
    abilities: [climaxPowerSoul],
    explanation: AI('【永】我方所有角色 Power +1000、Soul +1。\nTrigger 圖示「Soul」及「Shot」：這回合翻出它的攻擊角色下一次造成的傷害被 Cancel 時，給予對手 1 點傷害。'),
  },
  {
    cardId: 'SAO/S20-034',
    support: 'verified',
    abilities: [
      {
        type: 'ACT',
        keywords: ['BRAINSTORM'],
        timing: 'MAIN',
        cost: [{ pay: 'STOCK', count: 1 }],
        effect: [{ do: 'BRAINSTORM', count: 4, per: { kind: 'CLIMAX' }, each: [{ do: 'MODIFY', target: { who: 'SELF' }, stat: 'POWER', amount: 3000 }] }],
      },
    ],
    notes: ['Q&A 2022.07.22 and 2019.09.20 (brainstorm turns cards over one at a time; with a short deck a refresh happens in between, and the cards already turned over are not shuffled back) are what the engine does (CR-10.7.3).'],
    explanation: AI(
      '【起】集中 [(1)]：翻開山札頂 4 張放到控え室，其中每有 1 張 Climax，這張卡該回合 Power +3000。\n' +
        '官方 Q&A：卡是逐張翻開的；山札不夠時先翻已有的卡，Refresh（受 1 點懲罰）後再翻餘下的，已翻開的卡不會被洗回山札。',
    ),
  },
  {
    cardId: 'SAO/S20-044',
    support: 'verified',
    abilities: [
      {
        type: 'AUTO',
        trigger: { on: 'THIS_CLIMAX_PLACED' },
        effect: [
          { do: 'DECK_TOP', count: 1, to: 'STOCK' },
          { do: 'MODIFY', target: { who: 'ALL_YOURS' }, stat: 'SOUL', amount: 1 },
        ],
      },
    ],
    explanation: AI('【自】這張 Climax 由手牌放到 Climax 置場時：把自己山札頂 1 張放到 Stock，然後我方所有角色該回合 Soul +1。'),
  },
  {
    cardId: 'SAO/S20-045',
    support: 'verified',
    abilities: [climaxPowerSoul],
    explanation: AI('【永】我方所有角色 Power +1000、Soul +1。\nTrigger 圖示「Treasure」：翻出時這張卡加入手牌（不放到 Stock），然後可以把山札頂 1 張放到 Stock。'),
  },
  {
    cardId: 'SAO/S20-079',
    support: 'verified',
    abilities: [
      {
        type: 'AUTO',
        trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' },
        cost: [{ pay: 'STOCK', count: 1 }, { pay: 'DISCARD', count: 1 }],
        effect: [
          { do: 'CHOOSE', from: 'YOUR_DECK', filter: AVATAR, min: 0, max: 1 },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND', reveal: true },
          { do: 'SHUFFLE' },
        ],
      },
    ],
    explanation: AI('【自】[(1) 把 1 張手牌放到控え室]：這張卡由手牌放到舞台時，可以支付費用；支付後查看自己整個山札，選最多 1 張《アバター》角色，給對手看後加入手牌，然後洗山札。'),
  },
  {
    cardId: 'SAO/S20-083',
    support: 'verified',
    abilities: [
      {
        type: 'CONT',
        condition: { if: 'NOT', of: { if: 'CHARACTERS', min: 1, other: true } },
        apply: [
          { target: { who: 'SELF' }, stat: 'LEVEL', amount: 1 },
          { target: { who: 'SELF' }, stat: 'POWER', amount: 1500 },
        ],
      },
    ],
    explanation: AI('【永】我方舞台上沒有其他角色時，這張卡 Level +1、Power +1500。'),
  },
  { cardId: 'SAO/S20-084', support: 'verified', abilities: [{ type: 'CONT', condition: { if: 'OPPONENT_TURN' }, apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: 1000 }] }], explanation: AI('【永】對手回合中，這張卡 Power +1000。') },
  {
    cardId: 'SAO/S20-085',
    support: 'verified',
    abilities: [
      { type: 'CONT', apply: [{ target: { who: 'ALL_YOURS', other: true, filter: { nameIncludes: 'アスナ' } }, stat: 'POWER', amount: 500 }] },
      { type: 'CONT', condition: { if: 'OPPONENT_TURN' }, apply: [{ target: { who: 'ALL_YOURS', other: true }, stat: 'POWER', amount: 500 }] },
    ],
    explanation: AI('【永】我方其他卡名包含「アスナ」的角色全部 Power +500。\n【永】對手回合中，我方其他所有角色 Power +500。\n兩個效果可以同時加在同一張角色上。'),
  },
  {
    cardId: 'SAO/S20-086',
    support: 'verified',
    abilities: [withPartner('アスナ')],
    explanation: AI(
      '【永】我方有其他卡名包含「アスナ」的角色時：這張卡 Power +1000，並得到『【自】Encore [把手牌 1 張角色放到控え室]』。\n' +
        '條件不成立時沒有這個 Encore（仍可用規則的 3 Stock Encore）。',
    ),
  },
  {
    cardId: 'SAO/S20-089',
    support: 'verified',
    abilities: [bond('着替え中のアスナ', [{ pay: 'STOCK', count: 1 }])],
    notes: ['「着替え中のアスナ」 (SAO/S20-005) is not in the database yet; the bond still works and simply finds nothing when no card of that name is in the waiting room.'],
    explanation: AI('【自】絆／「着替え中のアスナ」[(1)]：這張卡被使用而放到舞台時，可以支付 1 Stock；支付後從控え室選 1 張「着替え中のアスナ」加入手牌。'),
  },
  {
    cardId: 'SAO/S20-093',
    support: 'verified',
    abilities: [backup(3000, 2, [{ pay: 'STOCK', count: 1 }, { pay: 'SELF_TO_WAITING_ROOM' }])],
    notes: [BACKUP_QA],
    explanation: AI('【起】【Counter】助太刀 3000 Level 2 [(1) 把手牌的這張卡放到控え室]：對手 Front Attack 時的 Counter 步驟，被攻擊的角色該回合 Power +3000。\n官方 Q&A：不需要顏色條件，但我方 Level 必須達到 2。'),
  },
  { cardId: 'SAO/S20-094', support: 'verified', abilities: [{ type: 'CONT', condition: { if: 'OPPONENT_TURN' }, apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: 1000 }] }], explanation: AI('【永】對手回合中，這張卡 Power +1000。') },
  {
    cardId: 'SAO/S20-098',
    support: 'verified',
    abilities: [climaxPowerSoul],
    explanation: AI('【永】我方所有角色 Power +1000、Soul +1。\nTrigger 圖示「Draw」：翻出時可以抽 1 張。'),
  },
  { cardId: 'SAO/S20-099', support: 'verified', abilities: [drawAndBoost], explanation: AI('【自】這張 Climax 由手牌放到 Climax 置場時：抽 1 張，然後選我方 1 張角色，該回合 Power +2000、Soul +1。') },
  {
    cardId: 'SAO/S20-100',
    support: 'verified',
    abilities: [{ type: 'CONT', apply: [{ target: { who: 'ALL_YOURS' }, stat: 'SOUL', amount: 2 }] }],
    explanation: AI('【永】我方所有角色 Soul +2。'),
  },
];
