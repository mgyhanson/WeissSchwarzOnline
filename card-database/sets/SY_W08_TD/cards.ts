/**
 * 2009年度トライアルデッキ【W】 涼宮ハルヒの憂鬱 (SY/W08-T01 … T17).
 *
 * Printed information comes from official.json. Ability data below was
 * written from the official text and Q&A in that file; no errata exist for
 * these cards (errata page checked 2026-11-11, last updated 2026-11-02).
 * Chinese explanations are AI-assisted and unverified.
 */

import type { Ability, AutoAbility } from '@wso/game-engine';
import { backup } from '@wso/game-engine';
import type { CardRecord } from '../../src/types';

const AI = (zh: string): CardRecord['explanation'] => ({ zh, source: 'AI_ASSISTED', status: '待核實' });

const VANILLA = '沒有能力的角色。';

const assist500: Ability = { type: 'CONT', keywords: ['ASSIST'], assist: true, apply: [{ target: { who: 'IN_FRONT' }, stat: 'POWER', amount: 500 }] };

/** 『【自】 このカードが舞台から控え室に置かれた時、あなたはこのカードをこのカードがいた枠に【レスト】して置いてよい。』 (given by T14) */
const returnWhenLeaving: AutoAbility = {
  type: 'AUTO',
  trigger: { on: 'STAGE_TO_WAITING_ROOM' },
  optional: true,
  effect: [{ do: 'MOVE', target: { who: 'SELF' }, to: 'SOURCE_SLOT', rested: true }],
};

export const records: CardRecord[] = [
  { cardId: 'SY/W08-T01', support: 'verified', explanation: AI(VANILLA) },
  {
    cardId: 'SY/W08-T02',
    support: 'verified',
    abilities: [
      assist500,
      {
        type: 'AUTO',
        trigger: { on: 'TRIGGER_CHECK_REVEALS', filter: { kind: 'CLIMAX', hasTrigger: 'COMEBACK' } },
        cost: [{ pay: 'STOCK', count: 1 }],
        effect: [
          { do: 'CHOOSE', from: 'OPPONENT_FRONT_ROW', filter: { levelMax: 1 }, min: 1, max: 1 },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'WAITING_ROOM' },
        ],
      },
    ],
    notes: [
      'The trigger icon of the revealed climax is judged when it is revealed; the card is face down in the stock by the time the ability resolves, per the official Q&A of 2009.11.20 (icon, then stock, then this ability).',
    ],
    explanation: AI(
      '【永】應援：放在後列時，它前面的我方角色全部 Power +500。\n' +
        '【自】支付 (1)：我方角色攻擊時的 Trigger Check 翻出 Climax，而且那張 Climax 的 Trigger 圖示是「門」（回收）時，可以支付 1 Stock；支付後選對手前列 1 張 Level 1 或以下的角色，放到控え室。\n' +
        '官方 Q&A：先執行 Trigger 圖示的效果，再把翻出的卡放到 Stock，然後才處理這個能力。',
    ),
  },
  { cardId: 'SY/W08-T03', support: 'verified', explanation: AI(VANILLA) },
  {
    cardId: 'SY/W08-T04',
    support: 'verified',
    abilities: [backup(2000, 1, [{ pay: 'STOCK', count: 1 }, { pay: 'SELF_TO_WAITING_ROOM' }])],
    explanation: AI(
      '【起】【Counter】助太刀 2000 Level 1：對手 Front Attack 時的 Counter Step，從手牌支付 1 Stock 並把這張卡放到控え室，被攻擊的我方角色該回合 Power +2000。\n' +
        '官方 Q&A：使用助太刀不需要顏色條件，但我方 Level 必須達到 1。',
    ),
  },
  {
    cardId: 'SY/W08-T05',
    support: 'verified',
    abilities: [{ type: 'CONT', condition: { if: 'SELF_IN_SLOT', slots: ['FC'] }, apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: 1000 }] }],
    explanation: AI('【永】這張卡在前列中央的枠時，Power +1000。'),
  },
  {
    cardId: 'SY/W08-T06',
    support: 'verified',
    abilities: [
      {
        type: 'AUTO',
        keywords: ['CHANGE'],
        trigger: { on: 'STEP_START', step: 'ENCORE', turn: 'YOURS' },
        condition: { if: 'SELF_RESTED' },
        cost: [{ pay: 'STOCK', count: 1 }, { pay: 'SELF_TO_CLOCK' }],
        effect: [
          { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { name: 'トラブルガール ハルヒ' }, min: 1, max: 1 },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'SOURCE_SLOT' },
        ],
      },
      {
        type: 'ACT',
        keywords: ['BRAINSTORM'],
        timing: 'MAIN',
        cost: [{ pay: 'STOCK', count: 3 }],
        effect: [
          { do: 'BRAINSTORM', count: 3, per: { kind: 'CHARACTER', traits: ['団長'] }, each: [], setX: true },
          { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { kind: 'CHARACTER', traits: ['団長'] }, levelMaxX: true, min: 1, max: 1 },
          { do: 'CHOOSE_SLOT', which: 'ANY' },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'CHOSEN_SLOT' },
        ],
      },
    ],
    notes: [
      'Q&A 2011.03.25: when no 《団長》 character is turned over, X = 0 and a level 0 《団長》 character can still be chosen.',
      'Q&A 2022.07.22 (brainstorm with a short deck) is handled by turning cards over one at a time with refresh in between (CR-10.7.3).',
    ],
    explanation: AI(
      '【自】Change：我方 Encore Step 開始時，如果這張卡處於 Rest 狀態，可以支付 1 Stock 並把這張卡放到 Clock；支付後從控え室選 1 張「トラブルガール ハルヒ」放到這張卡原本的枠。\n' +
        '【起】集中 (3)：翻開山札頂 3 張放到控え室。X = 翻開的卡中《団長》角色的張數。從控え室選 1 張 Level X 或以下的《団長》角色，放到舞台任意一個枠。\n' +
        '官方 Q&A：沒有翻到《団長》角色時 X = 0，仍可選 Level 0 的《団長》角色。',
    ),
  },
  { cardId: 'SY/W08-T07', support: 'verified', explanation: AI(VANILLA) },
  {
    cardId: 'SY/W08-T08',
    support: 'verified',
    abilities: [
      { type: 'AUTO', trigger: { on: 'PLACED_ON_STAGE', from: 'HAND_OR_CHANGE' }, optional: true, effect: [{ do: 'CLOCK_TOP', to: 'WAITING_ROOM' }] },
      {
        type: 'AUTO',
        keywords: ['CX_COMBO'],
        trigger: { on: 'ATTACKS' },
        condition: { if: 'CLIMAX_IN_PLAY', name: 'サムデイ イン ザ レイン' },
        optional: true,
        effect: [{ do: 'DAMAGE', amount: 1 }],
      },
    ],
    explanation: AI(
      '【自】由手牌放到舞台時，或經 Change 放到舞台時，可以把我方 Clock 最上面的 1 張放到控え室。\n' +
        '【自】這張卡攻擊時，如果 Climax 置場有「サムデイ イン ザ レイン」，可以給予對手 1 點傷害（可以被 Cancel）。',
    ),
  },
  {
    cardId: 'SY/W08-T09',
    support: 'verified',
    abilities: [
      {
        type: 'AUTO',
        trigger: { on: 'THIS_CLIMAX_PLACED' },
        effect: [
          { do: 'DRAW', count: 1 },
          { do: 'CHOOSE', from: 'YOUR_STAGE', min: 1, max: 1 },
          { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'POWER', amount: 2000 },
          { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'SOUL', amount: 1 },
        ],
      },
    ],
    explanation: AI('【自】這張 Climax 由手牌放到 Climax 置場時：抽 1 張，然後選我方 1 張角色，該回合 Power +2000、Soul +1。'),
  },
  {
    cardId: 'SY/W08-T10',
    support: 'verified',
    abilities: [{ type: 'CONT', apply: [{ target: { who: 'ALL_YOURS' }, stat: 'POWER', amount: 1000 }, { target: { who: 'ALL_YOURS' }, stat: 'SOUL', amount: 1 }] }],
    explanation: AI('【永】我方所有角色 Power +1000、Soul +1。\nTrigger 圖示「門」：Trigger Check 翻出時，可以從控え室選 1 張角色加入手牌。'),
  },
  { cardId: 'SY/W08-T11', support: 'verified', abilities: [assist500], explanation: AI('【永】應援：放在後列時，它前面的我方角色全部 Power +500。') },
  { cardId: 'SY/W08-T12', support: 'verified', explanation: AI(VANILLA) },
  {
    cardId: 'SY/W08-T13',
    support: 'verified',
    abilities: [
      {
        type: 'AUTO',
        keywords: ['CHANGE'],
        trigger: { on: 'STEP_START', step: 'ENCORE', turn: 'YOURS' },
        condition: { if: 'SELF_RESTED' },
        cost: [{ pay: 'STOCK', count: 1 }, { pay: 'SELF_TO_WAITING_ROOM' }],
        effect: [
          { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { name: '水着のハルヒ＆長門' }, min: 1, max: 1 },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'SOURCE_SLOT' },
        ],
      },
    ],
    notes: ['Putting this card from the stage into the waiting room as the cost also triggers its encore (CR-10.2.2); that follows from the rules, not from this data.'],
    explanation: AI('【自】Change：我方 Encore Step 開始時，如果這張卡處於 Rest 狀態，可以支付 1 Stock 並把這張卡放到控え室；支付後從控え室選 1 張「水着のハルヒ＆長門」放到這張卡原本的枠。'),
  },
  {
    cardId: 'SY/W08-T14',
    support: 'verified',
    abilities: [
      {
        type: 'AUTO',
        trigger: { on: 'PLACED_ON_STAGE', from: 'HAND_OR_CHANGE' },
        effect: [
          { do: 'CHOOSE', from: 'YOUR_STAGE', other: true, min: 1, max: 1 },
          { do: 'GRANT', target: { who: 'CHOSEN' }, ability: returnWhenLeaving },
        ],
      },
    ],
    explanation: AI(
      '【自】由手牌放到舞台時，或經 Change 放到舞台時，選我方另外 1 張角色，該回合給予它以下能力：\n' +
        '『【自】這張卡由舞台放到控え室時，可以把這張卡以 Rest 狀態放回它原本的枠。』',
    ),
  },
  { cardId: 'SY/W08-T15', support: 'verified', explanation: AI(VANILLA) },
  {
    cardId: 'SY/W08-T16',
    support: 'verified',
    effect: [
      { do: 'CHOOSE', from: 'OPPONENT_CLIMAX', min: 1, max: 1 },
      { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'WAITING_ROOM' },
    ],
    notes: ['Neo-Standard: 使用不可 (banned) under the 2026 late-season restrictions; see restrictions/neo-standard.ts.'],
    explanation: AI(
      '【Counter】Event：選對手 Climax 置場的 1 張 Climax，放到控え室。\n' +
        '官方 Q&A：在 Counter Step 使用時仍要符合 Level 及顏色條件；也可以在自己的 Main Phase 使用。Climax 離開後，它的永續效果隨即消失，已經處理的自動效果則不受影響。\n' +
        '注意：這張卡在 Neo-Standard 是禁卡。',
    ),
  },
  {
    cardId: 'SY/W08-T17',
    support: 'verified',
    abilities: [{ type: 'CONT', apply: [{ target: { who: 'ALL_YOURS' }, stat: 'SOUL', amount: 2 }] }],
    explanation: AI('【永】我方所有角色 Soul +2。'),
  },
];
