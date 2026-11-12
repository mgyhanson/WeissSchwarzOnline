/**
 * ソードアート・オンライン: 18 cards from later SAO products (SAO/S51, S65,
 * S71, S80, S100), chosen for 経験 (Experience, CR-10.10), 記憶 (Memory,
 * CR-10.9) and アラーム (Alarm, CR-10.1). They share the ソードアート・オンライン
 * Neo-Standard title with SAO/S20, so they can be played together.
 *
 * Printed information comes from official.json. Ability data below was
 * written from the official text and Q&A in that file. Errata page checked
 * 2026-11-12 (last updated 2026-11-02): no errata for these cards. Neo-Standard
 * restriction list checked 2026-11-12: the only ソードアート・オンライン entry is
 * SAO/S100-011, which is not among these cards. See docs/05-card-pool-2.md.
 * Chinese explanations are AI-assisted and unverified.
 */

import type { Ability, AutoAbility, CardFilter, Condition, Effect } from '@wso/game-engine';
import { encore } from '@wso/game-engine';
import type { CardRecord } from '../../src/types';

const AI = (zh: string): CardRecord['explanation'] => ({ zh, source: 'AI_ASSISTED', status: '待核實' });

const FLUCTLIGHT: CardFilter = { kind: 'CHARACTER', traits: ['フラクトライト'] };
const ANNIVERSARY: CardFilter = { kind: 'CHARACTER', traits: ['Anniversary'] };
const AVATAR_OR_NET: CardFilter = { kind: 'CHARACTER', traits: ['アバター', 'ネット'] };

const experience = (min: number): Condition => ({ if: 'EXPERIENCE', min });

/** アンコール ［手札のキャラを1枚控え室に置く］ */
const encoreDiscardCharacter: AutoAbility = encore([{ pay: 'DISCARD', count: 1, filter: { kind: 'CHARACTER' } }]);

/** 【永】 経験 あなたのレベル置場のカードのレベルの合計がN以上なら、このカードのパワーを＋X(し、このカードは『【自】 アンコール ［手札のキャラを1枚控え室に置く］』を得る)。 */
function experiencePower(min: number, amount: number, withEncore = false, yourTurn = false): Ability {
  return {
    type: 'CONT',
    keywords: ['EXPERIENCE'],
    condition: yourTurn ? { if: 'ALL', of: [{ if: 'YOUR_TURN' }, experience(min)] } : experience(min),
    apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount }],
    ...(withEncore ? { grant: [{ target: { who: 'SELF' }, ability: encoreDiscardCharacter }] } : {}),
  };
}

/** 【永】 記憶 あなたの思い出置場に「流星の約束 アスナ」があるなら、このカードのパワーを＋X、ソウルを＋1。 */
function memoryOfPromise(power: number): Ability {
  return {
    type: 'CONT',
    keywords: ['MEMORY'],
    condition: { if: 'MEMORY', min: 1, filter: { name: '流星の約束 アスナ' } },
    apply: [
      { target: { who: 'SELF' }, stat: 'POWER', amount: power },
      { target: { who: 'SELF' }, stat: 'SOUL', amount: 1 },
    ],
  };
}

/** あなたは1枚引いてよい。そうしたら、あなたは自分の手札を1枚選び、控え室に置く。 (as an optional automatic ability) */
const mayDrawThenDiscard: Effect[] = [
  { do: 'DRAW', count: 1 },
  { do: 'CHOOSE', from: 'YOUR_HAND', min: 1, max: 1 },
  { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'WAITING_ROOM' },
];

const ALARM_NOTE =
  'アラーム (CR-10.1): the ability works only while this card is the top card of your clock; it does nothing on the stage. Whether the card is on top is checked when the ability triggers.';

export const records: CardRecord[] = [
  {
    cardId: 'SAO/S100-019',
    support: 'verified',
    abilities: [experiencePower(5, 6000, false, true)],
    explanation: AI('【永】經驗：我方回合中，如果我方 Level 置場卡牌的 Level 合計 5 或以上，這張卡 Power +6000。\n（經驗計算的是 Level 置場卡牌本身印刷的 Level，不是玩家等級。）'),
  },
  {
    cardId: 'SAO/S51-002',
    support: 'verified',
    abilities: [
      {
        type: 'AUTO',
        trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' },
        effect: [
          { do: 'DECK_TOP', count: 2, to: 'WAITING_ROOM' },
          { do: 'IF', condition: { if: 'LAST_MOVED', min: 1, filter: { kind: 'CLIMAX' } }, then: [{ do: 'MODIFY', target: { who: 'SELF' }, stat: 'SOUL', amount: 2 }] },
        ],
      },
      {
        type: 'AUTO',
        trigger: { on: 'REVERSED', inBattle: true },
        cost: [{ pay: 'STOCK_TO_CLOCK', count: 1 }, { pay: 'SELF_TO_MEMORY' }],
        effect: [
          { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { kind: 'CHARACTER', nameIncludesAny: ['キリト', 'アスナ', 'ユイ'] }, min: 1, max: 1 },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
        ],
      },
    ],
    notes: [
      'Q&A 2019.09.20: the two cards go from the top of the deck straight into the waiting room one at a time, not through the resolution zone; that is what DECK_TOP does.',
      'バトル中 (CR-7.2.1.5.1): only while this card is the attacking or the front-attacked character of a battle.',
      'Paying the cost puts this card into memory, so 「流星の約束 アスナ」 is then in memory for 記憶 of SAO/S51-010 and SAO/S51-014.',
    ],
    explanation: AI(
      '【自】這張卡由手牌放到舞台時，把自己山札頂 2 張放到控え室；其中有 Climax 的話，這張卡該回合 Soul +2。\n' +
        '【自】[把自己 Stock 頂 1 張放到 Clock，並把這張卡放到思い出置場]：戰鬥中的這張卡被 Reverse 時，可以支付費用；支付後從控え室選 1 張卡名含「キリト」、「アスナ」或「ユイ」的角色加入手牌。\n' +
        '官方 Q&A：山札頂的卡是逐張直接放到控え室，不經解決領域。放到思い出置場後，可以成為其他卡「記憶」的條件。',
    ),
  },
  {
    cardId: 'SAO/S51-010',
    support: 'verified',
    abilities: [memoryOfPromise(5000)],
    explanation: AI('【永】記憶：如果我方思い出置場有「流星の約束 アスナ」，這張卡 Power +5000、Soul +1。'),
  },
  {
    cardId: 'SAO/S51-014',
    support: 'verified',
    abilities: [memoryOfPromise(1000), encoreDiscardCharacter],
    explanation: AI('【永】記憶：如果我方思い出置場有「流星の約束 アスナ」，這張卡 Power +1000、Soul +1。\n【自】Encore [把 1 張手牌角色放到控え室]：這張卡由舞台放到控え室時，可以支付費用；支付後把它 Rest 放回原本的枠。'),
  },
  {
    cardId: 'SAO/S65-073',
    support: 'verified',
    abilities: [
      {
        type: 'AUTO',
        trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' },
        cost: [{ pay: 'DISCARD', count: 1, filter: { kind: 'CLIMAX' } }],
        effect: [
          { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: FLUCTLIGHT, min: 1, max: 1 },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
        ],
      },
      {
        type: 'AUTO',
        keywords: ['ALARM'],
        alarm: true,
        trigger: { on: 'PHASE_START', phase: 'CLIMAX', turn: 'YOURS' },
        effect: [
          { do: 'CHOOSE', from: 'YOUR_STAGE', min: 1, max: 1 },
          { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'POWER', amount: 1000 },
        ],
      },
    ],
    notes: [ALARM_NOTE],
    explanation: AI(
      '【自】[把 1 張手牌 Climax 放到控え室]：這張卡由手牌放到舞台時，可以支付費用；支付後從控え室選 1 張《フラクトライト》角色加入手牌。\n' +
        '【自】【Clock】Alarm：這張卡在我方 Clock 最上面時，我方 Climax 階段開始時，選我方 1 張角色，該回合 Power +1000。',
    ),
  },
  {
    cardId: 'SAO/S65-079',
    support: 'verified',
    abilities: [
      {
        type: 'AUTO',
        keywords: ['ALARM'],
        alarm: true,
        trigger: { on: 'PHASE_START', phase: 'CLIMAX', turn: 'YOURS' },
        optional: true,
        effect: [...mayDrawThenDiscard],
      },
      {
        type: 'ACT',
        timing: 'MAIN',
        cost: [{ pay: 'REST_SELF' }],
        effect: [
          { do: 'CHOOSE', from: 'YOUR_STAGE', filter: AVATAR_OR_NET, min: 1, max: 1 },
          { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'POWER', amount: 1000 },
        ],
      },
    ],
    notes: [ALARM_NOTE, '「1枚引いてよい。そうしたら、…」: the player is asked once; declining skips both the draw and the discard.'],
    explanation: AI(
      '【自】【Clock】Alarm：這張卡在我方 Clock 最上面時，我方 Climax 階段開始時，可以抽 1 張；抽了的話，再選自己 1 張手牌放到控え室。\n' +
        '【起】[把這張卡 Rest]：選我方 1 張《アバター》或《ネット》角色，該回合 Power +1000。',
    ),
  },
  {
    cardId: 'SAO/S65-083',
    support: 'verified',
    abilities: [experiencePower(2, 1500, true)],
    explanation: AI('【永】經驗：如果我方 Level 置場卡牌的 Level 合計 2 或以上，這張卡 Power +1500，並得到「【自】Encore [把 1 張手牌角色放到控え室]」。'),
  },
  {
    cardId: 'SAO/S65-092',
    support: 'verified',
    abilities: [
      {
        type: 'AUTO',
        keywords: ['EXPERIENCE'],
        trigger: { on: 'BATTLE_OPPONENT_REVERSED' },
        condition: experience(3),
        optional: true,
        effect: [{ do: 'DECK_TOP', count: 1, to: 'STOCK' }],
      },
    ],
    explanation: AI('【自】經驗：這張卡的戰鬥對手被 Reverse 時，如果我方 Level 置場卡牌的 Level 合計 3 或以上，可以把自己山札頂 1 張放到 Stock。'),
  },
  {
    cardId: 'SAO/S71-016',
    support: 'verified',
    abilities: [experiencePower(2, 2000)],
    explanation: AI('【永】經驗：如果我方 Level 置場卡牌的 Level 合計 2 或以上，這張卡 Power +2000。'),
  },
  {
    cardId: 'SAO/S71-022',
    support: 'verified',
    abilities: [
      { type: 'CONT', keywords: ['ASSIST'], assist: true, apply: [{ target: { who: 'IN_FRONT' }, stat: 'POWER', amount: 500 }] },
      {
        type: 'CONT',
        keywords: ['EXPERIENCE'],
        condition: experience(3),
        apply: [],
        grant: [
          {
            target: { who: 'SELF' },
            ability: {
              type: 'AUTO',
              trigger: { on: 'PHASE_START', phase: 'CLIMAX', turn: 'YOURS' },
              effect: [
                { do: 'CHOOSE', from: 'YOUR_STAGE', filter: ANNIVERSARY, min: 1, max: 1 },
                { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'POWER', amount: 1000 },
              ],
            },
          },
        ],
      },
    ],
    explanation: AI(
      '【永】應援：放在後列時，它前面的我方角色全部 Power +500。\n' +
        '【永】經驗：如果我方 Level 置場卡牌的 Level 合計 3 或以上，這張卡得到「【自】我方 Climax 階段開始時，選我方 1 張《Anniversary》角色，該回合 Power +1000」。',
    ),
  },
  {
    cardId: 'SAO/S71-025',
    support: 'verified',
    abilities: [
      experiencePower(2, 1500, true),
      {
        type: 'AUTO',
        trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' },
        condition: { if: 'CHARACTERS', min: 4, other: true, filter: ANNIVERSARY },
        optional: true,
        effect: [
          { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: ANNIVERSARY, min: 1, max: 1 },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'STOCK' },
        ],
      },
    ],
    explanation: AI(
      '【永】經驗：如果我方 Level 置場卡牌的 Level 合計 2 或以上，這張卡 Power +1500，並得到「【自】Encore [把 1 張手牌角色放到控え室]」。\n' +
        '【自】這張卡由手牌放到舞台時，如果我方其他《Anniversary》角色有 4 張或以上，可以從控え室選 1 張《Anniversary》角色放到 Stock。',
    ),
  },
  {
    cardId: 'SAO/S71-079',
    support: 'verified',
    abilities: [
      {
        type: 'AUTO',
        keywords: ['EXPERIENCE'],
        trigger: { on: 'ATTACKS' },
        condition: experience(2),
        effect: [
          { do: 'CHOOSE', from: 'YOUR_STAGE', min: 1, max: 1 },
          { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'POWER', amount: 2000 },
        ],
      },
    ],
    explanation: AI('【自】經驗：這張卡攻擊時，如果我方 Level 置場卡牌的 Level 合計 2 或以上，選我方 1 張角色，該回合 Power +2000。'),
  },
  {
    cardId: 'SAO/S71-085',
    support: 'verified',
    abilities: [
      experiencePower(2, 1500, true),
      {
        type: 'AUTO',
        trigger: { on: 'ATTACKS' },
        condition: { if: 'CHARACTERS', min: 1, other: true, filter: ANNIVERSARY },
        effect: [{ do: 'MODIFY', target: { who: 'SELF' }, stat: 'POWER', amount: 1500 }],
      },
    ],
    explanation: AI(
      '【永】經驗：如果我方 Level 置場卡牌的 Level 合計 2 或以上，這張卡 Power +1500，並得到「【自】Encore [把 1 張手牌角色放到控え室]」。\n' +
        '【自】這張卡攻擊時，如果有我方其他《Anniversary》角色，這張卡該回合 Power +1500。',
    ),
  },
  {
    cardId: 'SAO/S71-095',
    support: 'verified',
    abilities: [experiencePower(5, 6000, false, true), encoreDiscardCharacter],
    explanation: AI(
      '【永】經驗：我方回合中，如果我方 Level 置場卡牌的 Level 合計 5 或以上，這張卡 Power +6000。\n' +
        '【自】Encore [把 1 張手牌角色放到控え室]：這張卡由舞台放到控え室時，可以支付費用；支付後把它 Rest 放回原本的枠。',
    ),
  },
  {
    cardId: 'SAO/S71-104',
    support: 'verified',
    abilities: [experiencePower(5, 3000)],
    explanation: AI('【永】經驗：如果我方 Level 置場卡牌的 Level 合計 5 或以上，這張卡 Power +3000。'),
  },
  {
    cardId: 'SAO/S80-040',
    support: 'verified',
    abilities: [
      {
        type: 'AUTO',
        trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' },
        cost: [{ pay: 'STOCK', count: 1 }, { pay: 'DISCARD', count: 1 }],
        effect: [
          { do: 'CHOOSE', from: 'YOUR_DECK', filter: FLUCTLIGHT, min: 0, max: 1 },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND', reveal: true },
          { do: 'SHUFFLE' },
        ],
      },
      {
        type: 'AUTO',
        keywords: ['ALARM'],
        alarm: true,
        trigger: { on: 'PHASE_START', phase: 'CLIMAX', turn: 'YOURS' },
        condition: { if: 'CHARACTERS', min: 3, filter: FLUCTLIGHT },
        optional: true,
        effect: [...mayDrawThenDiscard],
      },
    ],
    notes: [ALARM_NOTE, 'The number of 《フラクトライト》 characters is checked when the ability resolves, like the other "…なら" conditions of the engine.'],
    explanation: AI(
      '【自】[(1) 把 1 張手牌放到控え室]：這張卡由手牌放到舞台時，可以支付費用；支付後查看自己整個山札，選最多 1 張《フラクトライト》角色，給對手看後加入手牌，然後洗山札。\n' +
        '【自】【Clock】Alarm：這張卡在我方 Clock 最上面，而且我方《フラクトライト》角色有 3 張或以上時，我方 Climax 階段開始時，可以抽 1 張；抽了的話，再選自己 1 張手牌放到控え室。',
    ),
  },
  {
    cardId: 'SAO/S80-074',
    support: 'verified',
    abilities: [
      { type: 'CONT', condition: { if: 'YOUR_TURN' }, apply: [{ target: { who: 'SELF' }, stat: 'POWER', amount: 1000 }] },
      {
        type: 'AUTO',
        keywords: ['CX_COMBO', 'EXPERIENCE'],
        trigger: { on: 'ATTACKS' },
        condition: { if: 'ALL', of: [{ if: 'CLIMAX_IN_PLAY', name: '世界を包む夜空' }, experience(2)] },
        optional: true,
        effect: [
          { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: FLUCTLIGHT, min: 1, max: 1 },
          { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
        ],
      },
    ],
    explanation: AI(
      '【永】我方回合中，這張卡 Power +1000。\n' +
        '【自】【CX Combo】經驗：這張卡攻擊時，如果 Climax 置場有「世界を包む夜空」，而且我方 Level 置場卡牌的 Level 合計 2 或以上，可以從控え室選 1 張《フラクトライト》角色加入手牌。',
    ),
  },
  {
    cardId: 'SAO/S80-097',
    support: 'verified',
    abilities: [
      {
        type: 'CONT',
        apply: [
          { target: { who: 'ALL_YOURS' }, stat: 'POWER', amount: 1000 },
          { target: { who: 'ALL_YOURS' }, stat: 'SOUL', amount: 1 },
        ],
      },
    ],
    explanation: AI('【永】我方所有角色 Power +1000、Soul +1。\nTrigger 圖示「Soul」及「Gate」：Gate 翻出時，可以從自己控え室選 1 張 Climax 加入手牌。'),
  },
];
