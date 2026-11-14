/**
 * ブースターパック anemoi (ANM/W138): the cards whose ability data is written by hand.
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
import type { CardRecord } from '../../src/types';

const AI = (zh: string): CardRecord['explanation'] => ({ zh, source: 'AI_ASSISTED', status: '待核實' });

/** 《風》のキャラ */
const WIND: CardFilter = { kind: 'CHARACTER', traits: ['風'] };

export const records: CardRecord[] = [
  {
    cardId: 'ANM/W138-004',
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
    ],
    notes: ['The cost is paid in the order written: (1), then the top card of your deck into your clock (CR-8.4.2.1); that card is not damage.'],
    explanation: AI('【自】[(1) 把自己山札頂 1 張放到 Clock]：這張卡由手牌放到舞台時，可以支付費用；支付後查看自己整個山札，選最多 1 張 Level 1 或以下的角色，給對手看後加入手牌，然後洗山札。'),
  },
  {
    cardId: 'ANM/W138-068',
    support: 'verified',
    abilities: [
      {
        type: 'AUTO',
        trigger: { on: 'EITHER', of: [{ on: 'PLACED_ON_STAGE', from: 'HAND' }, { on: 'ATTACKS' }] },
        effect: [
          { do: 'CHOOSE', from: 'YOUR_STAGE', filter: WIND, min: 1, max: 1 },
          { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'POWER', amount: 3000 },
        ],
      },
    ],
    notes: ['One ability with two trigger conditions (手札から舞台に置かれた時かアタックした時). The chosen character may be this card itself.'],
    explanation: AI('【自】這張卡由手牌放到舞台時，或這張卡攻擊時：選我方 1 張《風》角色（可以選這張卡自己），該回合 Power +3000。'),
  },
  {
    cardId: 'ANM/W138-095',
    support: 'verified',
    abilities: [
      {
        type: 'AUTO',
        trigger: { on: 'ATTACKS' },
        condition: { if: 'FACING', filter: { levelMin: 3 } },
        effect: [{ do: 'MODIFY', target: { who: 'SELF' }, stat: 'POWER', amount: 6000 }],
      },
    ],
    explanation: AI('【自】這張卡攻擊時，如果這張卡正面的角色 Level 是 3 或以上，該回合這張卡 Power +6000。'),
  },
];
