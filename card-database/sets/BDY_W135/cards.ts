/**
 * ブースターパック BanG Dream! [夢限大みゅーたいぷ] (BDY/W135): the cards whose
 * ability data is written by hand. The whole booster (100 base cards) is in
 * official.json; a card without a record here is compiled from sentence
 * patterns when its whole text allows (the climaxes), or stays unsupported.
 *
 * Written from the official text in official.json (fetched 2026-11-13, the
 * booster's release day). None of these cards has an official Q&A yet.
 * Errata page (last updated 2026-11-12) and the Neo-Standard restriction
 * list (2026年度後期) checked 2026-11-14: no entry for a BDY/W135 card.
 * Chinese explanations are AI-assisted and unverified.
 *
 * First batch (docs: reports/RULES_IMPLEMENTATION_REPORT.md): 14 characters
 * across levels 0 to 3 in yellow, red and blue, enough for a legal deck
 * together with the booster's climaxes.
 */

import type { CardFilter } from '@wso/game-engine';
import { backup } from '@wso/game-engine';
import type { CardRecord } from '../../src/types';

const AI = (zh: string): CardRecord['explanation'] => ({ zh, source: 'AI_ASSISTED', status: '待核實' });

/** 《音楽》のキャラ */
const MUSIC: CardFilter = { kind: 'CHARACTER', traits: ['音楽'] };
/** 《夢限大みゅーたいぷ》のキャラ */
const MUGENDAI: CardFilter = { kind: 'CHARACTER', traits: ['夢限大みゅーたいぷ'] };
/** 「愛は衝動」か「TearJerker」 */
const TWO_CLIMAXES: CardFilter = { names: ['愛は衝動', 'TearJerker'] };

export const records: CardRecord[] = [
  {
    cardId: 'BDY/W135-006',
    support: 'verified',
    abilities: [
      { type: 'CONT', apply: [{ target: { who: 'YOUR_SLOT', slots: ['FC'], other: true }, stat: 'POWER', amount: 1000 }] },
      {
        type: 'ACT',
        keywords: ['BRAINSTORM'],
        timing: 'MAIN',
        cost: [{ pay: 'STOCK', count: 1 }, { pay: 'REST_SELF' }],
        effect: [
          {
            do: 'BRAINSTORM',
            count: 4,
            per: { kind: 'CLIMAX' },
            each: [
              { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: MUSIC, min: 0, max: 1 },
              { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
            ],
          },
        ],
      },
    ],
    notes: ['「他のあなたの前列の中央の枠のキャラ」: the character in your front centre slot, unless it is this card itself.'],
    explanation: AI(
      '【永】我方前列中央的枠的其他角色 Power +1000（這張卡自己在前列中央時不會加給自己）。\n' +
        '【起】集中 [(1) 把這張卡 Rest]：翻開山札頂 4 張放到控え室，其中每有 1 張 Climax，可以從控え室選最多 1 張《音楽》角色加入手牌。',
    ),
  },
  {
    cardId: 'BDY/W135-013',
    support: 'verified',
    abilities: [
      {
        type: 'AUTO',
        keywords: ['CX_COMBO'],
        trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' },
        cost: [{ pay: 'DISCARD', count: 1, filter: TWO_CLIMAXES }],
        effect: [
          { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: TWO_CLIMAXES, min: 1, max: 1 },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
        ],
      },
    ],
    notes: ['The 【CXコンボ】 mark has no rules meaning (CR-8.12.1): this ability does not need a climax in the climax area. The climax just discarded is in the waiting room and may be the one returned.'],
    explanation: AI(
      '【自】【CX Combo】[把 1 張手牌的「愛は衝動」或「TearJerker」放到控え室]：這張卡由手牌放到舞台時，可以支付費用；支付後從控え室選 1 張「愛は衝動」或「TearJerker」加入手牌。\n' +
        '即是可以把手上的其中一張 Climax 換成控え室的另一張（也可以取回剛棄掉的那張）。',
    ),
  },
  {
    cardId: 'BDY/W135-019',
    support: 'verified',
    abilities: [
      {
        type: 'AUTO',
        trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' },
        condition: { if: 'CHARACTERS', min: 4, other: true, filter: MUSIC },
        optional: true,
        effect: [
          { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: MUSIC, min: 1, max: 1 },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'STOCK' },
        ],
      },
      {
        type: 'AUTO',
        trigger: { on: 'ATTACKS' },
        condition: { if: 'FACING', filter: { levelMin: 2, levelMax: 2 } },
        effect: [{ do: 'MODIFY', target: { who: 'SELF' }, stat: 'POWER', amount: 6000 }],
      },
    ],
    notes: ['「正面のキャラのレベルが2なら」: exactly level 2 (its current level, effects included), not 2 or more.'],
    explanation: AI(
      '【自】這張卡由手牌放到舞台時，如果我方其他《音楽》角色有 4 張或以上，可以從控え室選 1 張《音楽》角色放到 Stock。\n' +
        '【自】這張卡攻擊時，如果它正面的對手角色 Level 剛好是 2，這張卡該回合 Power +6000。',
    ),
  },
  {
    cardId: 'BDY/W135-020',
    support: 'verified',
    abilities: [
      {
        type: 'AUTO',
        trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' },
        cost: [{ pay: 'STOCK', count: 1 }, { pay: 'DISCARD', count: 1 }],
        effect: [
          { do: 'CHOOSE', from: 'OPPONENT_FRONT_ROW', filter: { costMax: 0 }, min: 0, max: 1 },
          { do: 'CHOOSE', from: 'OPPONENT_BACK_ROW', filter: { costMax: 0 }, min: 0, max: 1, add: true },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'WAITING_ROOM' },
        ],
      },
    ],
    explanation: AI('【自】[(1) 把 1 張手牌放到控え室]：這張卡由手牌放到舞台時，可以支付費用；支付後選對手前列 Cost 0 或以下的角色最多 1 張，以及後列 Cost 0 或以下的角色最多 1 張，把它們放到控え室。'),
  },
  {
    cardId: 'BDY/W135-035',
    support: 'verified',
    abilities: [
      {
        type: 'AUTO',
        trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' },
        cost: [{ pay: 'HAND_TO_CLOCK', count: 1 }],
        effect: [
          { do: 'CHOOSE', from: 'YOUR_DECK', filter: MUGENDAI, min: 0, max: 1 },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND', reveal: true },
          { do: 'SHUFFLE' },
        ],
      },
    ],
    notes: ['The cost puts a hand card into the clock: it is not damage and cannot be cancelled; a seventh clock card causes a level up once the cost is paid (CR-9.3.3).'],
    explanation: AI(
      '【自】[把 1 張手牌放到 Clock]：這張卡由手牌放到舞台時，可以支付費用；支付後查看自己整個山札，選最多 1 張《夢限大みゅーたいぷ》角色，給對手看後加入手牌，然後洗山札。\n' +
        '費用是把手牌直接放進 Clock（不是傷害，不能 Cancel），Clock 滿 7 張會 Level Up。',
    ),
  },
  {
    cardId: 'BDY/W135-039',
    support: 'verified',
    abilities: [
      {
        type: 'AUTO',
        trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' },
        cost: [{ pay: 'DISCARD', count: 1 }],
        effect: [
          { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: MUSIC, min: 1, max: 1 },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
        ],
      },
      {
        type: 'ACT',
        timing: 'MAIN',
        cost: [{ pay: 'SELF_TO_WAITING_ROOM' }],
        effect: [{ do: 'WAITING_ROOM_TO_DECK' }, { do: 'SHUFFLE' }],
      },
    ],
    notes: ['The second ability puts this card into the waiting room as its cost, so it goes back into the deck with the rest.'],
    explanation: AI(
      '【自】[把 1 張手牌放到控え室]：這張卡由手牌放到舞台時，可以支付費用；支付後從控え室選 1 張《音楽》角色加入手牌。\n' +
        '【起】[把這張卡放到控え室]：把自己控え室的所有卡放回山札，然後洗山札（這張卡自己也會一起洗回去）。可以把 Climax 洗回山札，增加 Cancel 傷害的機會。',
    ),
  },
  {
    cardId: 'BDY/W135-041',
    support: 'verified',
    abilities: [
      {
        type: 'AUTO',
        trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' },
        cost: [{ pay: 'STOCK', count: 1 }, { pay: 'DISCARD', count: 1, filter: MUSIC }],
        effect: [
          { do: 'CHOOSE', from: 'YOUR_DECK', filter: { kind: 'CLIMAX' }, min: 0, max: 1 },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND', reveal: true },
          { do: 'SHUFFLE' },
          { do: 'DAMAGE', amount: 1 },
        ],
      },
    ],
    notes: ['（ダメージキャンセルは発生する）: the 1 damage is ordinary effect damage and can be cancelled.'],
    explanation: AI('【自】[(1) 把 1 張手牌的《音楽》角色放到控え室]：這張卡由手牌放到舞台時，可以支付費用；支付後查看自己整個山札，選最多 1 張 Climax，給對手看後加入手牌，洗山札，然後給予對手 1 點傷害（可以被 Cancel）。'),
  },
  {
    cardId: 'BDY/W135-047',
    support: 'verified',
    abilities: [
      {
        type: 'CONT',
        condition: { if: 'ALL', of: [{ if: 'YOUR_TURN' }, { if: 'ALL_CHARACTERS', filter: MUSIC }] },
        apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: 8000 }],
      },
      {
        type: 'AUTO',
        trigger: { on: 'REVERSED' },
        effect: [
          { do: 'DECK_TOP', count: 1, to: 'CLOCK' },
          { do: 'ORIENT', target: { who: 'SELF' }, to: 'REST' },
        ],
      },
    ],
    notes: ['The second ability is not optional: when this card is reversed, the top card of your deck goes to your clock and this card becomes rested instead of staying reversed (so it is not put into the waiting room in the encore step).'],
    explanation: AI(
      '【永】我方回合中，如果我方所有角色都是《音楽》，這張卡 Power +8000。\n' +
        '【自】這張卡被 Reverse 時，把自己山札頂 1 張放到 Clock，然後把這張卡轉為 Rest（強制發動）。即是它不會因 Reverse 而離場，但每次都要多受 1 張 Clock。',
    ),
  },
  {
    cardId: 'BDY/W135-051',
    support: 'verified',
    abilities: [
      {
        type: 'AUTO',
        trigger: { on: 'USED_BACKUP' },
        cost: [{ pay: 'STOCK', count: 1 }, { pay: 'DISCARD', count: 1, filter: MUSIC }],
        effect: [{ do: 'CLOCK_TOP', to: 'WAITING_ROOM' }],
      },
      backup(2500, 2, [{ pay: 'STOCK', count: 1 }, { pay: 'SELF_TO_WAITING_ROOM' }]),
    ],
    explanation: AI(
      '【自】[(1) 把 1 張手牌的《音楽》角色放到控え室]：使用了這張卡的「助太刀」時，可以支付費用；支付後把自己 Clock 最上面 1 張放到控え室（回復 1 點）。\n' +
        '【起】【Counter】助太刀2500 Level 2 [(1) 把手牌的這張卡放到控え室]：對手正面攻擊時的 Counter 步驟使用，選我方 1 張被正面攻擊的角色，該回合 Power +2500。',
    ),
  },
  {
    cardId: 'BDY/W135-057',
    support: 'verified',
    abilities: [
      {
        type: 'AUTO',
        trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' },
        cost: [{ pay: 'STOCK', count: 1 }, { pay: 'DISCARD', count: 1 }],
        effect: [{ do: 'CLOCK_TOP', to: 'WAITING_ROOM' }],
      },
      {
        type: 'AUTO',
        trigger: { on: 'OTHER_ATTACKS', filter: MUSIC },
        effect: [{ do: 'MODIFY', target: { who: 'SELF' }, stat: 'POWER', amount: 2000 }],
      },
    ],
    explanation: AI(
      '【自】[(1) 把 1 張手牌放到控え室]：這張卡由手牌放到舞台時，可以支付費用；支付後把自己 Clock 最上面 1 張放到控え室（回復 1 點）。\n' +
        '【自】我方其他《音楽》角色攻擊時，這張卡該回合 Power +2000（每次攻擊都會累加）。',
    ),
  },
  {
    cardId: 'BDY/W135-070',
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
      {
        type: 'ACT',
        timing: 'MAIN',
        cost: [{ pay: 'STOCK', count: 1 }, { pay: 'SELF_TO_WAITING_ROOM' }],
        effect: [{ do: 'LOOK_TOP', upTo: 4, pick: MUSIC, reveal: true }],
      },
    ],
    explanation: AI(
      '【自】這張卡由手牌放到舞台時，可以選自己 1 張手牌放到 Stock。\n' +
        '【起】[(1) 把這張卡放到控え室]：查看自己山札頂最多 4 張，選最多 1 張《音楽》角色給對手看後加入手牌，其餘放到控え室。',
    ),
  },
  {
    cardId: 'BDY/W135-086',
    support: 'verified',
    abilities: [
      {
        type: 'AUTO',
        trigger: { on: 'USED_BACKUP' },
        cost: [{ pay: 'DISCARD', count: 2 }],
        effect: [
          { do: 'CHOOSE', from: 'OPPONENT_STAGE', filter: { levelAboveMasterLevel: true }, min: 1, max: 1 },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'WAITING_ROOM' },
        ],
      },
      backup(1000, 1, [{ pay: 'SELF_TO_WAITING_ROOM' }]),
    ],
    notes: ['「レベルが相手のレベルより高いキャラ」: a character of the opponent whose level (its current level) is higher than the number of cards in the opponent\'s level zone.'],
    explanation: AI(
      '【自】[把 2 張手牌放到控え室]：使用了這張卡的「助太刀」時，可以支付費用；支付後選對手 1 張「Level 比對手玩家的 Level 高」的角色，放到控え室。用來對付對手提早登場的高 Level 角色。\n' +
        '【起】【Counter】助太刀1000 Level 1 [把手牌的這張卡放到控え室]：對手正面攻擊時的 Counter 步驟使用，選我方 1 張被正面攻擊的角色，該回合 Power +1000。',
    ),
  },
  {
    cardId: 'BDY/W135-087',
    support: 'verified',
    abilities: [
      {
        type: 'CONT',
        condition: { if: 'ALL', of: [{ if: 'YOUR_TURN' }, { if: 'CHARACTERS', min: 2, other: true, filter: MUSIC }] },
        apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: 4000 }],
      },
      {
        type: 'AUTO',
        trigger: { on: 'REVERSED' },
        condition: { if: 'BATTLE_OPPONENT', filter: { costMax: 0 } },
        optional: true,
        effect: [{ do: 'MOVE', target: { who: 'BATTLE_OPPONENT' }, to: 'DECK_BOTTOM' }],
      },
    ],
    notes: ['The battle opponent goes to the bottom of its owner\'s deck (CR-3.1.6).'],
    explanation: AI(
      '【永】我方回合中，如果我方其他《音楽》角色有 2 張或以上，這張卡 Power +4000。\n' +
        '【自】這張卡被 Reverse 時，如果它的戰鬥對手 Cost 是 0 或以下，可以把那張角色放到它主人的山札底。',
    ),
  },
  {
    cardId: 'BDY/W135-089',
    support: 'verified',
    abilities: [
      {
        type: 'ACT',
        timing: 'MAIN',
        cost: [{ pay: 'STOCK', count: 1 }, { pay: 'SELF_TO_DECK_BOTTOM' }],
        effect: [
          { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: MUGENDAI, min: 0, max: 2 },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
        ],
      },
      backup(3000, 2, [{ pay: 'STOCK', count: 1 }, { pay: 'SELF_TO_WAITING_ROOM' }]),
    ],
    explanation: AI(
      '【起】[(1) 把這張卡放到山札底]：從控え室選最多 2 張《夢限大みゅーたいぷ》角色加入手牌。\n' +
        '【起】【Counter】助太刀3000 Level 2 [(1) 把手牌的這張卡放到控え室]：對手正面攻擊時的 Counter 步驟使用，選我方 1 張被正面攻擊的角色，該回合 Power +3000。',
    ),
  },
];
