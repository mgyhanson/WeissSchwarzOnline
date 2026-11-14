/**
 * The data format for card abilities.
 *
 * An ability is data, not code: the same interpreter executes every card.
 * Each construct below corresponds to a wording that actually occurs on
 * cards; the Japanese wording is quoted next to it. A card whose text needs
 * a construct that does not exist here cannot be encoded and must be marked
 * "unsupported" in the card database rather than approximated.
 *
 * What cannot be expressed yet is listed in rules/rule-registry.md,
 * section 14.
 */

import type { CardKind, Orientation, Phase, SlotId, TriggerIcon } from '../types';

/** Conditions on a card's information. All given parts must hold. */
export interface CardFilter {
  kind?: CardKind;
  /** 《A》か《B》: has at least one of these traits. */
  traits?: string[];
  /** 「カード名」: exact card name. */
  name?: string;
  /** カード名に「…」を含む */
  nameIncludes?: string;
  /** カード名に「A」か「B」か「C」を含む */
  nameIncludesAny?: string[];
  /** 「A」か「B」: the card name is exactly one of these. */
  names?: string[];
  /** レベルが相手のレベルより高い: the card's level is higher than the level of the player whose card it is. */
  levelAboveMasterLevel?: boolean;
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
  /** クライマックス置場に「…」があるなら (the usual CX combo condition); without a name: CX置場にCXがあるなら */
  | { if: 'CLIMAX_IN_PLAY'; name?: string }
  /** (他の)あなたの…のキャラがN枚以上なら */
  | { if: 'CHARACTERS'; min: number; filter?: CardFilter; other?: boolean }
  /** あなたのレベルがN以上なら */
  | { if: 'LEVEL'; min: number }
  /** 経験: あなたのレベル置場のカードのレベルの合計がN以上なら */
  | { if: 'EXPERIENCE'; min: number }
  /** 記憶: あなたの思い出置場に…がN枚以上あるなら */
  | { if: 'MEMORY'; min: number; filter?: CardFilter }
  /** 前列の中央の枠にこのカードがいるなら */
  | { if: 'SELF_IN_SLOT'; slots: SlotId[] }
  /** このカードが【レスト】しているなら */
  | { if: 'SELF_RESTED' }
  /** あなたのキャラすべてが…なら */
  | { if: 'ALL_CHARACTERS'; filter: CardFilter }
  /** あなたのストックがN枚以下なら */
  | { if: 'STOCK'; max: number }
  /** このカードのバトル相手の…が…なら: the battle opponent of this card matches (cost, level, ...). False when it is no longer on the stage. */
  | { if: 'BATTLE_OPPONENT'; filter: CardFilter }
  /** このカードの正面のキャラの…が…なら: there is a character facing this card and it matches. */
  | { if: 'FACING'; filter: CardFilter }
  /** それらのカードに…があるなら: the cards moved by the most recent DECK_TOP of this resolution (inside IF only). */
  | { if: 'LAST_MOVED'; min: number; filter?: CardFilter }
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
  | { pay: 'DECK_TOP_TO_CLOCK' }
  /** このカードをクロック置場に置く */
  | { pay: 'SELF_TO_CLOCK' }
  /** (他の)あなたの(【スタンド】している)…のキャラをN枚【レスト】する: the player chooses standing characters. */
  | { pay: 'REST_CHARACTERS'; count: number; filter?: CardFilter; other?: boolean }
  /** あなたのストックの上からN枚をクロック置場に置く */
  | { pay: 'STOCK_TO_CLOCK'; count: number }
  /** このカードを思い出にする */
  | { pay: 'SELF_TO_MEMORY' }
  /** 手札を(の…を)N枚クロック置場に置く: the player chooses hand cards. */
  | { pay: 'HAND_TO_CLOCK'; count: number; filter?: CardFilter }
  /** このカードを山札の下に置く */
  | { pay: 'SELF_TO_DECK_BOTTOM' };

/** Which cards an effect applies to. */
export type Target =
  /** このカード */
  | { who: 'SELF' }
  /** (他の)あなたの…のキャラすべて */
  | { who: 'ALL_YOURS'; filter?: CardFilter; other?: boolean }
  /** このカードの前のあなたのキャラすべて (CR-3.6.5) */
  | { who: 'IN_FRONT'; filter?: CardFilter }
  /** (他の)あなたの前列の中央の枠のキャラ: your characters in the named slots. */
  | { who: 'YOUR_SLOT'; slots: SlotId[]; other?: boolean }
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
  | 'FRONT_ATTACKED'
  /** 相手の前列のキャラ */
  | 'OPPONENT_FRONT_ROW'
  /** 相手の後列のキャラ */
  | 'OPPONENT_BACK_ROW'
  /** 相手のクライマックス置場のクライマックス */
  | 'OPPONENT_CLIMAX';

export type Destination =
  | 'HAND'
  | 'WAITING_ROOM'
  | 'STOCK'
  | 'CLOCK'
  | 'MEMORY'
  | 'DECK_TOP'
  | 'DECK_BOTTOM'
  /** このカードがいた枠 / それが直前に置かれていた枠: the slot the ability's card is or was in. */
  | 'SOURCE_SLOT'
  /** The slot chosen by the most recent CHOOSE_SLOT of this resolution. */
  | 'CHOSEN_SLOT';

/** …1枚につき: multiplies an amount by the number of (other) characters of yours that match. */
export interface PerCharacter {
  filter?: CardFilter;
  other?: boolean;
}

/** The steps of the attack phase a trigger can name (CR-7). */
export type AttackStepName = 'ATTACK_DECLARATION' | 'TRIGGER' | 'COUNTER' | 'DAMAGE' | 'BATTLE' | 'ENCORE';

export type Effect =
  /** あなたはN枚引く / 引いてよい */
  | { do: 'DRAW'; count: number; optional?: boolean }
  /**
   * …をN枚(まで)選び: `min` equal to `max` is "choose N", `min: 0` is "choose up to N" (CR-8.6.3.1).
   * `add`: …をN枚までと…をN枚まで選び — these are chosen in addition to the cards of the previous CHOOSE.
   */
  | { do: 'CHOOSE'; from: ChooseFrom; min: number; max: number; filter?: CardFilter; other?: boolean; levelMaxX?: boolean; add?: boolean }
  /** …を手札に戻す / 控え室に置く / ストック置場に置く ... `reveal`: 相手に見せ; `rested`: 【レスト】して置く */
  | { do: 'MOVE'; target: Target; to: Destination; reveal?: boolean; rested?: boolean }
  /**
   * そのターン中、…のパワー/ソウル/レベルを＋N (`per`: …1枚につき).
   * `until: 'NEXT_OPPONENT_TURN'`: 次の相手のターンの終わりまで instead of this turn.
   */
  | { do: 'MODIFY'; target: Target; stat: 'POWER' | 'SOUL' | 'LEVEL'; amount: number; per?: PerCharacter; until?: 'NEXT_OPPONENT_TURN' }
  /** …を【スタンド】/【レスト】/【リバース】する */
  | { do: 'ORIENT'; target: Target; to: Orientation }
  /** 相手にNダメージを与える */
  | { do: 'DAMAGE'; amount: number }
  /** 自分の山札の上からN枚を…に置く */
  | { do: 'DECK_TOP'; count: number; to: 'STOCK' | 'WAITING_ROOM' | 'CLOCK' }
  /** その山札をシャッフルする */
  | { do: 'SHUFFLE' }
  /** 自分の控え室のカードすべてを、山札に戻す (followed by SHUFFLE) */
  | { do: 'WAITING_ROOM_TO_DECK' }
  /**
   * 集中 (CR-10.7): 自分の山札の上からN枚をめくり、控え室に置く。それらのカードの…1枚につき、…
   * `each` is performed once per turned-over card matching `per`.
   */
  | { do: 'BRAINSTORM'; count: number; per: CardFilter; each: Effect[]; setX?: boolean }
  /** …なら、… (a condition checked while resolving) */
  | { do: 'IF'; condition: Condition; then: Effect[]; else?: Effect[] }
  /**
   * Choose a slot of your own: 舞台の好きな枠 (ANY) or 後列のキャラのいない枠
   * (EMPTY_BACK). Skipped when the previous CHOOSE chose nothing.
   */
  | { do: 'CHOOSE_SLOT'; which: 'ANY' | 'EMPTY_BACK' }
  /** 自分のクロックの上から1枚を、控え室に置く */
  | { do: 'CLOCK_TOP'; to: 'WAITING_ROOM' }
  /**
   * 自分の山札を上からN枚まで見て、…を1枚まで選んで(相手に見せ、)手札に加え、残りのカードを控え室に置く.
   * The player may stop before each card (CR-3.2.3.1). `per` makes N the number of matching characters.
   */
  | { do: 'LOOK_TOP'; upTo: number; per?: PerCharacter; pick?: CardFilter; reveal?: boolean }
  /** そのターン中 (or 次の相手のターンの終わりまで)、…に次の能力を与える。『…』 */
  | { do: 'GRANT'; target: Target; ability: AutoAbility; until?: 'NEXT_OPPONENT_TURN' };

/** The trigger condition of an automatic ability (CR-8.1.1.2.1). */
export type Trigger =
  /** このカードが(手札から)舞台に置かれた時; HAND_OR_CHANGE: 手札から舞台に置かれた時か『チェンジ』で舞台に置かれた時 */
  | { on: 'PLACED_ON_STAGE'; from?: 'HAND' | 'HAND_OR_CHANGE' }
  /** このカードが手札からクライマックス置場に置かれた時 */
  | { on: 'THIS_CLIMAX_PLACED' }
  /** あなたのキャラのトリガーチェックで…がでた時 */
  | { on: 'TRIGGER_CHECK_REVEALS'; filter?: CardFilter }
  /** あなたがこのカードの『助太刀』を使った時 (CR-10.5.3) */
  | { on: 'USED_BACKUP' }
  /** このカードがアタックした時 */
  | { on: 'ATTACKS' }
  /** 他のあなたの…のキャラがアタックした時: another character of yours, matching the filter, attacks. */
  | { on: 'OTHER_ATTACKS'; filter?: CardFilter }
  /** このカードが【リバース】した時; `inBattle`: バトル中のこのカードが【リバース】した時 (CR-7.2.1.5.1) */
  | { on: 'REVERSED'; inBattle?: boolean }
  /** このカードのバトル相手が【リバース】した時 */
  | { on: 'BATTLE_OPPONENT_REVERSED' }
  /** (あなたの/相手の)…フェイズの始めに */
  | { on: 'PHASE_START'; phase: Phase; turn: 'YOURS' | 'OPPONENT' | 'ANY' }
  /** あなたのクライマックスがクライマックス置場に置かれた時; with a filter: あなたのトリガーアイコンが…のCXがCX置場に置かれた時 */
  | { on: 'CLIMAX_PLACED'; filter?: CardFilter }
  /** このカードが舞台から控え室に置かれた時 (the trigger of encore, CR-10.2.1) */
  | { on: 'STAGE_TO_WAITING_ROOM' }
  /** (あなたの/相手の)…ステップの始めに */
  | { on: 'STEP_START'; step: AttackStepName; turn: 'YOURS' | 'OPPONENT' | 'ANY' };

/** Keywords that are labels without rules meaning of their own (CR-10), kept so other effects can refer to them. */
export type Keyword =
  | 'ASSIST'
  | 'BACKUP'
  | 'BRAINSTORM'
  | 'EXPERIENCE'
  | 'MEMORY'
  | 'ACCELERATE'
  | 'CX_COMBO'
  | 'BOND'
  | 'ENCORE'
  | 'CHANGE'
  | 'ALARM'
  | 'GREAT_PERFORMANCE';

/** 【永】 (CR-8.1.1.3): effects that hold for as long as the ability is active. */
export interface ContinuousAbility {
  type: 'CONT';
  keywords?: Keyword[];
  /**
   * 応援 (CR-10.3.2): the ability is active only while this card is in a
   * back-row slot.
   */
  assist?: boolean;
  /**
   * アラーム (CR-10.1): the ability is active while this card is the top
   * card of its master's clock, and not otherwise.
   */
  alarm?: boolean;
  /**
   * 大活躍 (CR-10.6.2): while this character is in its master's front-centre
   * slot and not reversed, a character of the opponent that attacks makes a
   * front attack on this character instead.
   */
  greatPerformance?: boolean;
  condition?: Condition;
  apply: {
    target: Exclude<Target, { who: 'CHOSEN' } | { who: 'BATTLE_OPPONENT' }>;
    stat: 'POWER' | 'SOUL' | 'LEVEL';
    amount: number;
    per?: PerCharacter;
    /** Ｘはそのキャラのレベル×N: multiplies the amount by the target's level. */
    perTargetLevel?: boolean;
  }[];
  /** …に『…』を与える: automatic abilities given to the targets while this ability is active. */
  grant?: { target: Exclude<Target, { who: 'CHOSEN' } | { who: 'BATTLE_OPPONENT' }>; ability: AutoAbility }[];
}

/** 【自】 (CR-8.1.1.2) */
export interface AutoAbility {
  type: 'AUTO';
  keywords?: Keyword[];
  /** アラーム (CR-10.1): triggers only while this card is the top card of its master's clock. */
  alarm?: boolean;
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

/**
 * 絆／「カード名」 [cost] (CR-10.4.2): when this card is placed on the stage
 * from hand, you may pay the cost; if you do, choose a card named so in your
 * waiting room and return it to your hand.
 */
export function bond(name: string, cost: Cost[]): AutoAbility {
  return {
    type: 'AUTO',
    keywords: ['BOND'],
    trigger: { on: 'PLACED_ON_STAGE', from: 'HAND' },
    cost,
    effect: [
      { do: 'CHOOSE', from: 'YOUR_WAITING_ROOM', filter: { name }, min: 1, max: 1 },
      { do: 'MOVE', target: { who: 'CHOSEN' }, to: 'HAND' },
    ],
  };
}

/**
 * アンコール [cost] (CR-10.2.2) with a cost other than the (3) every
 * character has: when this character is put from the stage into the waiting
 * room, you may pay the cost; if you do, put it in the slot it was in, rested.
 */
export function encore(cost: Cost[]): AutoAbility {
  return {
    type: 'AUTO',
    keywords: ['ENCORE'],
    trigger: { on: 'STAGE_TO_WAITING_ROOM' },
    cost,
    // Without a cost the ability is still optional: "you may".
    ...(cost.length === 0 ? { optional: true } : {}),
    effect: [{ do: 'MOVE', target: { who: 'SELF' }, to: 'SOURCE_SLOT', rested: true }],
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
  /** The slot the card is in, or was in when it left the stage (CR-8.7.4.1.2). */
  sourceSlot: { player: 0 | 1; slot: SlotId } | null;
  /** Keywords of the ability (moves made by a チェンジ ability count as change, CR-10.8.4). */
  keywords?: Keyword[];
  /** Ｘ: set by a BRAINSTORM with setX, used by CHOOSE with levelMaxX. */
  x?: number;
  /** The slot chosen by the most recent CHOOSE_SLOT. */
  slot?: SlotId | null;
  /** Instance ids moved by the most recent DECK_TOP (for それらのカードに…があるなら). */
  moved?: number[];
}
