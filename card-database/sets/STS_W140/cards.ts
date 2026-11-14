/**
 * ブースターパック ステラソラ (STS/W140): the cards whose ability data is written by hand.
 * The whole booster is in official.json; a card without a record here is
 * compiled from sentence patterns when its whole text allows, or stays
 * unsupported.
 *
 * Written from the official text in official.json (fetched 2026-11-13).
 * None of these cards has an official Q&A in that data. Errata page (last
 * updated 2026-11-12) and the Neo-Standard restriction list (2026年度後期)
 * checked 2026-11-14: no entry for any of these cards.
 * (The erratum for STS/W140-030 concerns a card that is not among these.)
 * Chinese explanations are AI-assisted and unverified.
 */

import type { CardFilter } from '@wso/game-engine';
import { encore } from '@wso/game-engine';
import type { CardRecord } from '../../src/types';

const AI = (zh: string): CardRecord['explanation'] => ({ zh, source: 'AI_ASSISTED', status: '待核實' });

/** 《巡遊者》か《魔王》のキャラ */
const TRAVELLER: CardFilter = { kind: 'CHARACTER', traits: ['巡遊者', '魔王'] };

export const records: CardRecord[] = [
  {
    cardId: 'STS/W140-052',
    support: 'verified',
    abilities: [
      {
        type: 'CONT',
        condition: { if: 'CHARACTERS', min: 2, other: true, filter: TRAVELLER },
        apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: 3000 }],
      },
      encore([{ pay: 'DISCARD', count: 1, filter: TRAVELLER }]),
    ],
    explanation: AI(
      '【永】我方其他《巡遊者》或《魔王》角色有 2 張或以上時，這張卡 Power +3000。\n' +
        '【自】Encore [把手牌 1 張《巡遊者》或《魔王》角色放到控え室]：這張卡由舞台放到控え室時，可以支付費用；支付後把它以 Rest 狀態放回原來的枠。',
    ),
  },
  {
    cardId: 'STS/W140-054',
    support: 'verified',
    abilities: [
      {
        type: 'AUTO',
        trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' },
        effect: [
          { do: 'CHOOSE', from: 'OPPONENT_FRONT_ROW', min: 1, max: 1 },
          { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'POWER', amount: -1000 },
        ],
      },
      {
        type: 'AUTO',
        trigger: { on: 'ATTACKS' },
        effect: [
          { do: 'CHOOSE', from: 'YOUR_STAGE', filter: TRAVELLER, other: true, min: 1, max: 1 },
          { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'POWER', amount: 1000 },
        ],
      },
    ],
    notes: ['A character whose power becomes 0 or less by the first ability is put into the waiting room by the rules (CR-9.5.1).'],
    explanation: AI(
      '【自】這張卡由手牌放到舞台時：選對手前列 1 張角色，該回合 Power －1000。\n' +
        '【自】這張卡攻擊時：選我方其他 1 張《巡遊者》或《魔王》角色，該回合 Power +1000。',
    ),
  },
  {
    cardId: 'STS/W140-073',
    support: 'verified',
    abilities: [
      {
        type: 'ACT',
        timing: 'MAIN',
        cost: [{ pay: 'SELF_TO_CLOCK' }],
        effect: [{ do: 'LOOK_TOP', upTo: 4, pick: TRAVELLER, reveal: true }],
      },
      {
        type: 'ACT',
        timing: 'MAIN',
        cost: [{ pay: 'REST_SELF' }],
        effect: [
          { do: 'CHOOSE', from: 'YOUR_STAGE', min: 1, max: 1 },
          { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'POWER', amount: 1500 },
        ],
      },
    ],
    explanation: AI(
      '【起】[把這張卡放到 Clock]：查看自己山札頂最多 4 張，選最多 1 張《巡遊者》或《魔王》角色，給對手看後加入手牌，其餘放到控え室。\n' +
        '【起】[把這張卡 Rest]：選我方 1 張角色，該回合 Power +1500。',
    ),
  },
];
