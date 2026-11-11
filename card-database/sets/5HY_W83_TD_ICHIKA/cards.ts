/**
 * トライアルデッキ＋ 五等分の花嫁 一花 (5HY/W83-T01 … T18).
 *
 * Printed information comes from official.json. Ability data below was
 * written from the official text and Q&A in that file; no errata exist for
 * these cards (errata page checked 2026-11-11, last updated 2026-11-02), and
 * none of them is restricted in Neo-Standard. Parallel printings
 * (T03SP, T04S, T07R, T10R, T12R, T17S) have the same text and are not listed.
 * Chinese explanations are AI-assisted and unverified.
 */

import type { Ability, CardFilter } from '@wso/game-engine';
import { backup, encore } from '@wso/game-engine';
import type { CardRecord } from '../../src/types';

const AI = (zh: string): CardRecord['explanation'] => ({ zh, source: 'AI_ASSISTED', status: '待核實' });

const VANILLA = '沒有能力的角色。';

const QUINTUPLET: CardFilter = { kind: 'CHARACTER', traits: ['五つ子'] };

const assist500: Ability = { type: 'CONT', keywords: ['ASSIST'], assist: true, apply: [{ target: { who: 'IN_FRONT' }, stat: 'POWER', amount: 500 }] };

const climaxPowerSoul: Ability = {
  type: 'CONT',
  apply: [
    { target: { who: 'ALL_YOURS' }, stat: 'POWER', amount: 1000 },
    { target: { who: 'ALL_YOURS' }, stat: 'SOUL', amount: 1 },
  ],
};

const yourTurnPlus1000: Ability = { type: 'CONT', condition: { if: 'YOUR_TURN' }, apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: 1000 }] };

export const records: CardRecord[] = [
  {
    cardId: '5HY/W83-T01',
    support: 'verified',
    abilities: [
      { type: 'CONT', condition: { if: 'YOUR_TURN' }, apply: [{ target: { who: 'ALL_YOURS', other: true }, stat: 'POWER', amount: 500 }] },
      {
        type: 'ACT',
        keywords: ['BRAINSTORM'],
        timing: 'MAIN',
        cost: [{ pay: 'STOCK', count: 1 }, { pay: 'REST_SELF' }],
        effect: [{ do: 'BRAINSTORM', count: 4, per: { kind: 'CLIMAX' }, each: [{ do: 'DRAW', count: 1, optional: true }] }],
      },
    ],
    notes: ['Q&A 2022.07.22 (brainstorm with a short deck): cards are turned over one at a time; a refresh in between does not take back the cards already turned over (CR-10.7.3).'],
    explanation: AI(
      '【永】我方回合中，我方其他所有角色 Power +500。\n' +
        '【起】集中 [(1) 把這張卡 Rest]：翻開山札頂 4 張放到控え室，其中每有 1 張 Climax，就可以抽最多 1 張。\n' +
        '官方 Q&A：山札不足時，先翻已有的卡，Refresh 後再翻餘下的；已翻開的卡不會被洗回山札。',
    ),
  },
  {
    cardId: '5HY/W83-T02',
    support: 'verified',
    abilities: [
      {
        type: 'CONT',
        apply: [{ target: { who: 'ALL_YOURS', other: true, filter: { name: '居眠り 中野 一花' } }, stat: 'POWER', amount: 1500 }],
        grant: [
          {
            target: { who: 'ALL_YOURS', other: true, filter: { name: '居眠り 中野 一花' } },
            ability: encore([{ pay: 'DISCARD', count: 1, filter: QUINTUPLET }]),
          },
        ],
      },
      {
        type: 'AUTO',
        trigger: { on: 'STAGE_TO_WAITING_ROOM' },
        cost: [{ pay: 'STOCK', count: 1 }],
        effect: [
          { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { name: '不意打ち' }, min: 1, max: 1 },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
        ],
      },
    ],
    notes: [
      'The encore given to 「居眠り 中野 一花」 is judged as it was on the stage (CR-8.7.4.1.2): it applies if this card was on the stage when that character left.',
    ],
    explanation: AI(
      '【永】我方其他所有「居眠り 中野 一花」Power +1500，並給予『【自】Encore [把手牌 1 張《五つ子》角色放到控え室]』。\n' +
        '【自】支付 (1)：這張卡由舞台放到控え室時，可以支付 1 Stock；支付後從控え室選 1 張「不意打ち」加入手牌。',
    ),
  },
  {
    cardId: '5HY/W83-T03',
    support: 'verified',
    abilities: [
      yourTurnPlus1000,
      {
        type: 'AUTO',
        trigger: { on: 'BATTLE_OPPONENT_REVERSED' },
        effect: [
          { do: 'CHOOSE', from: 'YOUR_STAGE', filter: QUINTUPLET, other: true, min: 1, max: 1 },
          { do: 'ORIENT', target: { who: 'CHOSEN' }, to: 'REST' },
          { do: 'CHOOSE_SLOT', which: 'EMPTY_BACK' },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'CHOSEN_SLOT' },
        ],
      },
    ],
    notes: ['Q&A 2017.11.24: a character that is already rested or reversed may be chosen; it cannot be rested again but is still moved.'],
    explanation: AI(
      '【永】我方回合中，這張卡 Power +1000。\n' +
        '【自】這張卡的戰鬥對手 Reverse 時，選我方另外 1 張《五つ子》角色，把它 Rest，並移到後列沒有角色的枠。\n' +
        '官方 Q&A：已經 Rest 或 Reverse 的角色也可以選，只是不能再 Rest，移動照樣進行。',
    ),
  },
  {
    cardId: '5HY/W83-T04',
    support: 'verified',
    abilities: [
      {
        type: 'AUTO',
        trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' },
        effect: [
          { do: 'CHOOSE', from: 'YOUR_STAGE', filter: QUINTUPLET, other: true, min: 1, max: 1 },
          { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'POWER', amount: 500, per: { other: true, filter: QUINTUPLET } },
        ],
      },
    ],
    explanation: AI('【自】由手牌放到舞台時，選我方另外 1 張《五つ子》角色，該回合 Power +X。X = 這張卡以外我方《五つ子》角色的張數 × 500。'),
  },
  {
    cardId: '5HY/W83-T05',
    support: 'verified',
    abilities: [
      yourTurnPlus1000,
      {
        type: 'AUTO',
        keywords: ['CX_COMBO'],
        trigger: { on: 'BATTLE_OPPONENT_REVERSED' },
        condition: { if: 'CLIMAX_IN_PLAY', name: '頑張り者へのご褒美' },
        effect: [
          { do: 'CHOOSE', from: 'YOUR_DECK', filter: QUINTUPLET, min: 0, max: 1 },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND', reveal: true },
          { do: 'SHUFFLE' },
        ],
      },
    ],
    explanation: AI(
      '【永】我方回合中，這張卡 Power +1000。\n' +
        '【自】【CX Combo】這張卡的戰鬥對手 Reverse 時，如果我方 Climax 置場有「頑張り者へのご褒美」，查看山札，選最多 1 張《五つ子》角色，給對手看後加入手牌，然後洗山札。',
    ),
  },
  {
    cardId: '5HY/W83-T06',
    support: 'verified',
    abilities: [
      {
        type: 'AUTO',
        trigger: { on: 'ATTACKS' },
        condition: { if: 'CHARACTERS', min: 2, other: true, filter: QUINTUPLET },
        effect: [{ do: 'MODIFY', target: { who: 'SELF' }, stat: 'POWER', amount: 2000 }],
      },
    ],
    explanation: AI('【自】這張卡攻擊時，如果我方另外有 2 張或以上《五つ子》角色，該回合這張卡 Power +2000。'),
  },
  {
    cardId: '5HY/W83-T07',
    support: 'verified',
    abilities: [
      {
        type: 'AUTO',
        trigger: { on: 'USED_BACKUP' },
        condition: { if: 'ALL_CHARACTERS', filter: { traits: ['五つ子'] } },
        optional: true,
        effect: [{ do: 'DECK_TOP', count: 1, to: 'STOCK' }],
      },
      backup(2000, 1, [{ pay: 'STOCK', count: 1 }, { pay: 'SELF_TO_WAITING_ROOM' }]),
    ],
    notes: ['The first ability works from the waiting room, where the card is once its backup has been used (CR-2.12.2.3, CR-10.5.3).'],
    explanation: AI(
      '【自】我方使用這張卡的助太刀時，如果我方所有角色都是《五つ子》，可以把山札頂 1 張放到 Stock。\n' +
        '【起】【Counter】助太刀 2000 Level 1：對手 Front Attack 時的 Counter Step，從手牌支付 1 Stock 並把這張卡放到控え室，被攻擊的我方角色該回合 Power +2000。',
    ),
  },
  {
    cardId: '5HY/W83-T08',
    support: 'verified',
    abilities: [
      { type: 'CONT', keywords: ['ASSIST'], assist: true, apply: [{ target: { who: 'IN_FRONT' }, stat: 'POWER', amount: 500, perTargetLevel: true }] },
      { type: 'ACT', timing: 'MAIN', cost: [{ pay: 'STOCK', count: 2 }, { pay: 'REST_SELF' }], effect: [{ do: 'LOOK_TOP', upTo: 2 }] },
    ],
    explanation: AI(
      '【永】應援：放在後列時，它前面的我方角色 Power +X。X = 那張角色的 Level × 500。\n' +
        '【起】[(2) 把這張卡 Rest]：查看山札頂最多 2 張，選最多 1 張加入手牌，其餘放到控え室。',
    ),
  },
  { cardId: '5HY/W83-T09', support: 'verified', explanation: AI(VANILLA) },
  {
    cardId: '5HY/W83-T10',
    support: 'verified',
    abilities: [
      { type: 'AUTO', trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' }, effect: [{ do: 'LOOK_TOP', upTo: 1, per: { filter: QUINTUPLET } }] },
      {
        type: 'AUTO',
        trigger: { on: 'ATTACKS' },
        cost: [{ pay: 'STOCK', count: 1 }, { pay: 'DISCARD', count: 1 }],
        effect: [
          { do: 'MODIFY', target: { who: 'ALL_YOURS', filter: QUINTUPLET }, stat: 'POWER', amount: 500 },
          { do: 'MODIFY', target: { who: 'ALL_YOURS', filter: QUINTUPLET }, stat: 'SOUL', amount: 1 },
        ],
      },
    ],
    explanation: AI(
      '【自】由手牌放到舞台時，查看山札頂最多 X 張，選最多 1 張加入手牌，其餘放到控え室。X = 我方《五つ子》角色的張數（包括這張卡）。\n' +
        '【自】支付 [(1) 把 1 張手牌放到控え室]：這張卡攻擊時，可以支付；支付後我方所有《五つ子》角色該回合 Power +500、Soul +1。',
    ),
  },
  {
    cardId: '5HY/W83-T11',
    support: 'verified',
    effect: [
      { do: 'LOOK_TOP', upTo: 4, pick: QUINTUPLET, reveal: true },
      { do: 'CHOOSE', from: 'YOUR_STAGE', min: 1, max: 1 },
      { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'POWER', amount: 3000 },
    ],
    explanation: AI('Event：查看山札頂最多 4 張，選最多 1 張《五つ子》角色，給對手看後加入手牌，其餘放到控え室；然後選我方 1 張角色，該回合 Power +3000。'),
  },
  {
    cardId: '5HY/W83-T12',
    support: 'verified',
    abilities: [climaxPowerSoul],
    explanation: AI('【永】我方所有角色 Power +1000、Soul +1。\nTrigger 圖示「Soul」及「風」（返回）：風圖示翻出時，可以選對手 1 張角色返回手牌。'),
  },
  {
    cardId: '5HY/W83-T13',
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
    explanation: AI('【永】應援：放在後列時，它前面的我方角色全部 Power +500。\n【自】我方的 Climax 放到 Climax 置場時，選我方 1 張角色，該回合 Power +1000。'),
  },
  {
    cardId: '5HY/W83-T14',
    support: 'verified',
    abilities: [{ type: 'CONT', condition: { if: 'STOCK', max: 2 }, apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: 1500 }] }],
    explanation: AI('【永】我方 Stock 在 2 張或以下時，這張卡 Power +1500。'),
  },
  {
    cardId: '5HY/W83-T15',
    support: 'verified',
    abilities: [
      { type: 'CONT', apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: 500, per: { other: true, filter: QUINTUPLET } }] },
      encore([{ pay: 'DISCARD', count: 1, filter: { kind: 'CHARACTER' } }]),
    ],
    explanation: AI(
      '【永】我方其他《五つ子》角色每有 1 張，這張卡 Power +500。\n' +
        '【自】Encore [把手牌 1 張角色放到控え室]：這張卡由舞台放到控え室時，可以支付；支付後以 Rest 狀態放回原本的枠。',
    ),
  },
  {
    cardId: '5HY/W83-T16',
    support: 'verified',
    abilities: [{ type: 'CONT', condition: { if: 'YOUR_TURN' }, apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: 1000, per: { other: true, filter: QUINTUPLET } }] }],
    explanation: AI('【永】我方回合中，我方其他《五つ子》角色每有 1 張，這張卡 Power +1000。'),
  },
  {
    cardId: '5HY/W83-T17',
    support: 'verified',
    abilities: [
      { type: 'AUTO', trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' }, optional: true, effect: [{ do: 'CLOCK_TOP', to: 'WAITING_ROOM' }] },
      {
        type: 'AUTO',
        trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' },
        effect: [{ do: 'MODIFY', target: { who: 'SELF' }, stat: 'POWER', amount: 1000, per: { filter: QUINTUPLET } }],
      },
    ],
    explanation: AI(
      '【自】由手牌放到舞台時，可以把我方 Clock 最上面的 1 張放到控え室。\n' +
        '【自】由手牌放到舞台時，該回合這張卡 Power +X。X = 我方《五つ子》角色的張數（包括這張卡）× 1000。',
    ),
  },
  {
    cardId: '5HY/W83-T18',
    support: 'verified',
    abilities: [climaxPowerSoul],
    explanation: AI('【永】我方所有角色 Power +1000、Soul +1。\nTrigger 圖示「門」：翻出時，可以從控え室選 1 張角色加入手牌。'),
  },
];
