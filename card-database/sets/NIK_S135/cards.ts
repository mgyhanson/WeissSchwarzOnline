/**
 * ブースターパック 勝利の女神：NIKKE Vol.2 (NIK/S135): the cards whose ability data is written by hand.
 * The whole booster is in official.json; a card without a record here is
 * compiled from sentence patterns when its whole text allows, or stays
 * unsupported.
 *
 * Written from the official text in official.json (fetched 2026-11-13).
 * None of these cards has an official Q&A in that data. Errata page (last
 * updated 2026-11-12) and the Neo-Standard restriction list (2026年度後期)
 * checked 2026-11-14: no entry for any of these cards.
 * Chinese explanations are AI-assisted and unverified.
 */

import type { CardFilter } from '@wso/game-engine';
import { encore } from '@wso/game-engine';
import type { CardRecord } from '../../src/types';

const AI = (zh: string): CardRecord['explanation'] => ({ zh, source: 'AI_ASSISTED', status: '待核實' });

/** 《NIKKE》のキャラ */
const NIKKE: CardFilter = { kind: 'CHARACTER', traits: ['NIKKE'] };

export const records: CardRecord[] = [
  {
    cardId: 'NIK/S135-029',
    support: 'verified',
    abilities: [
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
      {
        type: 'AUTO',
        trigger: { on: 'ATTACKS' },
        effect: [
          { do: 'CHOOSE', from: 'YOUR_STAGE', filter: NIKKE, other: true, min: 1, max: 1 },
          { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'POWER', amount: 500, until: 'NEXT_OPPONENT_TURN' },
          { do: 'GRANT', target: { who: 'CHOSEN' }, ability: encore([{ pay: 'DISCARD', count: 1, filter: { kind: 'CHARACTER' } }]), until: 'NEXT_OPPONENT_TURN' },
        ],
      },
    ],
    notes: ['次の相手のターンの終わりまで: the power and the given アンコール last until the end of the opponent\'s next turn (CR-8.2.1.2).'],
    explanation: AI(
      '【自】[(1) 把自己山札頂 1 張放到 Clock]：這張卡由手牌放到舞台時，可以支付費用；支付後查看自己整個山札，選最多 1 張 Level 1 或以下的角色，給對手看後加入手牌，然後洗山札。\n' +
        '【自】這張卡攻擊時：選我方其他 1 張《NIKKE》角色，直到對手下一個回合結束為止，Power +500，並得到「【自】Encore [把手牌 1 張角色放到控え室]」。',
    ),
  },
  {
    cardId: 'NIK/S135-031',
    support: 'verified',
    abilities: [
      {
        type: 'AUTO',
        trigger: { on: 'EITHER', of: [{ on: 'PLACED_ON_STAGE', from: 'HAND' }, { on: 'ATTACKS' }] },
        effect: [
          { do: 'CHOOSE', from: 'YOUR_STAGE', filter: NIKKE, min: 1, max: 1 },
          { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'POWER', amount: 1500 },
        ],
      },
      {
        type: 'AUTO',
        trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' },
        cost: [{ pay: 'STOCK', count: 1 }, { pay: 'DISCARD', count: 1 }],
        effect: [{ do: 'WAITING_ROOM_TO_DECK' }, { do: 'SHUFFLE' }],
      },
    ],
    notes: ['The second ability returns the whole waiting room, the cards that paid its cost included; it is not a refresh, so there is no refresh point.'],
    explanation: AI(
      '【自】這張卡由手牌放到舞台時，或這張卡攻擊時：選我方 1 張《NIKKE》角色（可以選這張卡自己），該回合 Power +1500。\n' +
        '【自】[(1) 把 1 張手牌放到控え室]：這張卡由手牌放到舞台時，可以支付費用；支付後把自己控え室的全部卡放回山札並洗牌（這不是 Refresh，沒有 Refresh 懲罰）。',
    ),
  },
];
