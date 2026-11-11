/**
 * The data format for card abilities.
 *
 * An ability is data, not code: the same interpreter executes every card.
 * Each construct below corresponds to a wording that actually occurs on
 * cards; the Japanese wording is quoted next to it. A card whose text needs
 * a construct that does not exist here cannot be encoded and must be marked
 * "unsupported" in the card database rather than approximated.
 *
 * This is the first part of the format (STEP 4d-1). Replacement effects,
 * abilities that work from the clock or memory, markers and several keywords
 * are not expressible yet.
 */

import type { CardKind, Orientation, Phase, TriggerIcon } from '../types';

/** Conditions on a card's information. All given parts must hold. */
export interface CardFilter {
  kind?: CardKind;
  /** 《A》か《B》: has at least one of these traits. */
  traits?: string[];
  /** 「カード名」: exact card name. */
  name?: string;
  /** カード名に「…」を含む */
  nameIncludes?: string;
  levelMax?: number;
  levelMin?: number;
  costMax?: number;
  color?: string;
  hasTrigger?: TriggerIcon;
}

export type Condition =
  /** あなたのターン中 */
  | { if: 'YOUR_TURN' }
  /** 相手のターン中 */
  | { if: 'OPPONENT_TURN' }
  /** クライマックス置場に「…」があるなら (the usual CX combo condition) */
  | { if: 'CLIMAX_IN_PLAY'; name: string }
  /** (他の)あなたの…のキャラがN枚以上なら */
  | { if: 'CHARACTERS'; min: number; filter?: CardFilter; other?: boolean }
  /** あなたのレベルがN以上なら */
  | { if: 'LEVEL'; min: number }
  /** 経験: あなたのレベル置場のカードのレベルの合計がN以上なら */
  | { if: 'EXPERIENCE'; min: number }
  /** 記憶: あなたの思い出置場に…がN枚以上あるなら */
  | { if: 'MEMORY'; min: number; filter?: CardFilter }
  | { if: 'ALL'; of: Condition[] }
  | { if: 'NOT'; of: Condition };

/** One action of a cost (CR-8.4). Costs are paid in the order listed (CR-8.4.2.1). */
export type Cost =
  /** (N): put N cards from the top of your stock into the waiting room (CR-8.4.3). */
  | { pay: 'STOCK'; count: number }
  /** このカードを【レスト】する */
  | { pay: 'REST_SELF' }
  /** 手札の…をN枚控え室に置く */
  | { pay: 'DISCARD'; count: number; filter?: CardFilter }
  /** (手札の)このカードを控え室に置く */
  | { pay: 'SELF_TO_WAITING_ROOM' }
  /** 自分の山札の上から1枚をクロック置場に置く (the cost of 加速, CR-10.12) */
  | { pay: 'DECK_TOP_TO_CLOCK' };

/** Which cards an effect applies to. */
export type Target =
  /** このカード */
  | { who: 'SELF' }
  /** (他の)あなたの…のキャラすべて */
  | { who: 'ALL_YOURS'; filter?: CardFilter; other?: boolean }
  /** このカードの前のあなたのキャラすべて (CR-3.6.5) */
  | { who: 'IN_FRONT'; filter?: CardFilter }
  /** The cards chosen by the most recent CHOOSE of this resolution. */
  | { who: 'CHOSEN' }
  /** このカードのバトル相手 (CR-7.2.1.5.1; last known per CR-8.11.2) */
  | { who: 'BATTLE_OPPONENT' };

/** Where a CHOOSE picks from. The player resolving the effect chooses (CR-8.6.5). */
export type ChooseFrom =
  | 'YOUR_STAGE'
  | 'OPPONENT_STAGE'
  | 'YOUR_WAITING_ROOM'
  | 'YOUR_HAND'
  | 'YOUR_CLOCK'
  /** 自分の山札を見て…: a hidden zone, so choosing fewer is always allowed (CR-8.6.3.1.4). */
  | 'YOUR_DECK'
  /** あなたがマスターであるフロントアタックされたキャラ (backup, CR-10.5.2) */
  | 'FRONT_ATTACKED';

export type Destination = 'HAND' | 'WAITING_ROOM' | 'STOCK' | 'CLOCK' | 'MEMORY' | 'DECK_TOP' | 'DECK_BOTTOM';

export type Effect =
  /** あなたはN枚引く / 引いてよい */
  | { do: 'DRAW'; count: number; optional?: boolean }
  /** …をN枚(まで)選び: `min` equal to `max` is "choose N", `min: 0` is "choose up to N" (CR-8.6.3.1). */
  | { do: 'CHOOSE'; from: ChooseFrom; min: number; max: number; filter?: CardFilter; other?: boolean }
  /** …を手札に戻す / 控え室に置く / ストック置場に置く ... `reveal`: 相手に見せ */
  | { do: 'MOVE'; target: Target; to: Destination; reveal?: boolean }
  /** そのターン中、…のパワー/ソウル/レベルを＋N */
  | { do: 'MODIFY'; target: Target; stat: 'POWER' | 'SOUL' | 'LEVEL'; amount: number }
  /** …を【スタンド】/【レスト】/【リバース】する */
  | { do: 'ORIENT'; target: Target; to: Orientation }
  /** 相手にNダメージを与える */
  | { do: 'DAMAGE'; amount: number }
  /** 自分の山札の上からN枚を…に置く */
  | { do: 'DECK_TOP'; count: number; to: 'STOCK' | 'WAITING_ROOM' | 'CLOCK' }
  /** その山札をシャッフルする */
  | { do: 'SHUFFLE' }
  /**
   * 集中 (CR-10.7): 自分の山札の上からN枚をめくり、控え室に置く。それらのカードの…1枚につき、…
   * `each` is performed once per turned-over card matching `per`.
   */
  | { do: 'BRAINSTORM'; count: number; per: CardFilter; each: Effect[] }
  /** …なら、… (a condition checked while resolving) */
  | { do: 'IF'; condition: Condition; then: Effect[]; else?: Effect[] };

/** The trigger condition of an automatic ability (CR-8.1.1.2.1). */
export type Trigger =
  /** このカードが(手札から)舞台に置かれた時 */
  | { on: 'PLACED_ON_STAGE'; from?: 'HAND' }
  /** このカードがアタックした時 */
  | { on: 'ATTACKS' }
  /** このカードが【リバース】した時 */
  | { on: 'REVERSED' }
  /** このカードのバトル相手が【リバース】した時 */
  | { on: 'BATTLE_OPPONENT_REVERSED' }
  /** (あなたの/相手の)…フェイズの始めに */
  | { on: 'PHASE_START'; phase: Phase; turn: 'YOURS' | 'OPPONENT' | 'ANY' }
  /** あなたのクライマックスがクライマックス置場に置かれた時 */
  | { on: 'CLIMAX_PLACED' };

/** Keywords that are labels without rules meaning of their own (CR-10), kept so other effects can refer to them. */
export type Keyword = 'ASSIST' | 'BACKUP' | 'BRAINSTORM' | 'EXPERIENCE' | 'MEMORY' | 'ACCELERATE' | 'CX_COMBO';

/** 【永】 (CR-8.1.1.3): effects that hold for as long as the ability is active. */
export interface ContinuousAbility {
  type: 'CONT';
  keywords?: Keyword[];
  /**
   * 応援 (CR-10.3.2): the ability is active only while this card is in a
   * back-row slot.
   */
  assist?: boolean;
  condition?: Condition;
  apply: { target: Exclude<Target, { who: 'CHOSEN' } | { who: 'BATTLE_OPPONENT' }>; stat: 'POWER' | 'SOUL' | 'LEVEL'; amount: number }[];
}

/** 【自】 (CR-8.1.1.2) */
export interface AutoAbility {
  type: 'AUTO';
  keywords?: Keyword[];
  trigger: Trigger;
  /** …なら: checked when the ability resolves. */
  condition?: Condition;
  /** [cost]: "you may pay the cost; if you do, ..." (CR-8.1.1.2.2). */
  cost?: Cost[];
  /** …してよい without a cost: the player is asked before the effect. */
  optional?: boolean;
  /** ターンN回 (CR-10.19) */
  limit?: number;
  effect: Effect[];
}

/** 【起】 (CR-8.1.1.1) */
export interface ActivatedAbility {
  type: 'ACT';
  keywords?: Keyword[];
  /**
   * MAIN: played by the turn player in the main phase, from the stage
   * (CR-6.5.1.2.3). COUNTER: played from hand by the defending player in the
   * counter step, i.e. backup (CR-10.5); `level` is the level it requires.
   */
  timing: 'MAIN' | 'COUNTER';
  level?: number;
  condition?: Condition;
  cost: Cost[];
  /** ターンN回 (CR-10.19) */
  limit?: number;
  effect: Effect[];
}

export type Ability = ContinuousAbility | AutoAbility | ActivatedAbility;

/** 助太刀N レベルY [cost] (CR-10.5.2), written out in the general format. */
export function backup(power: number, level: number, cost: Cost[]): ActivatedAbility {
  return {
    type: 'ACT',
    keywords: ['BACKUP'],
    timing: 'COUNTER',
    level,
    cost,
    effect: [
      { do: 'CHOOSE', from: 'FRONT_ATTACKED', min: 1, max: 1 },
      { do: 'MODIFY', target: { who: 'CHOSEN' }, stat: 'POWER', amount: power },
    ],
  };
}

/** What an effect needs to know about the ability it belongs to. Stored inside frames, so plain data. */
export interface EffectContext {
  /** CR-4.3.3: the player the effect belongs to. */
  master: 0 | 1;
  /** The card the ability is on, by permanent id and by the object it was when the ability was played. */
  source: number;
  sourceObjectId: number;
  /** Object ids chosen by the most recent CHOOSE. */
  chosen: number[];
  /** CR-8.11.2: object id of the battle opponent when the ability triggered. */
  battleOpponent: number | null;
}
