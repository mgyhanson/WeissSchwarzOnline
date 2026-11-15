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
  /** カード名に「…」を含まない */
  nameExcludes?: string;
  /** トリガーアイコンが[[a]][[b]]の: exactly these icons (e.g. two soul icons). */
  triggersExactly?: TriggerIcon[];
  /** カード名に「A」か「B」か「C」を含む */
  nameIncludesAny?: string[];
  /** 「A」か「B」: the card name is exactly one of these. */
  names?: string[];
  /** …か…: the card matches at least one of these (e.g. 《A》のキャラか「カード名」). */
  anyOf?: CardFilter[];
  /** 『【リンク】 （名称）』を持つ (CR-10.17.4.1) */
  hasLink?: string;
  /** 『回想』を持つ (CR-10.20) */
  hasRecollection?: boolean;
  /** レベルが相手のレベルより高い: the card's level is higher than the level of the player whose card it is. */
  levelAboveMasterLevel?: boolean;
  /** 自分のレベル以下のレベルの: the card's level is at most the level of the player whose zone it is in. */
  levelAtMostOwnLevel?: boolean;
  levelMax?: number;
  levelMin?: number;
  costMax?: number;
  costMin?: number;
  /** パワーN以下の (the current power) */
  powerMax?: number;
  color?: string;
  hasTrigger?: TriggerIcon;
}

export type Condition =
  /** あなたのターン中 */
  | { if: 'YOUR_TURN' }
  /** 先攻プレイヤーの第Nターン: the first player's Nth turn (game turn 2N-1). */
  | { if: 'FIRST_PLAYER_TURN'; turn: number }
  /** 相手のターン中 */
  | { if: 'OPPONENT_TURN' }
  /** クライマックス置場に「…」があるなら (the usual CX combo condition); without a name: CX置場にCXがあるなら */
  | { if: 'CLIMAX_IN_PLAY'; name?: string; /** 相手のCX置場に… */ opponent?: boolean }
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
  /** …してよい。そうしたら、… / 手札に加えたなら: the instruction just before (a MOVE, CLOCK_TOP or LOOK_TOP of this resolution) moved at least one card (inside IF only). */
  | { if: 'DID' }
  /**
   * …がN枚以上/以下、…がいる for cards that are not your characters on the stage: how many cards of a kind are
   * in a zone. `min` defaults to 0 and `max` to no limit. In memory, a face-down card matches no filter.
   */
  | { if: 'COUNT'; where: CountWhere; filter?: CardFilter; other?: boolean; min?: number; max?: number }
  /** …か…: at least one of the conditions holds. */
  | { if: 'ANY'; of: Condition[] }
  /**
   * このカードの下にマーカーがある/ない, このカードの下の異なるカード名のマーカーがN枚以上 (CR-3.7.4): the markers in the
   * marker zone of this card's slot (`of: 'SELF'`) or of the card the ability is about (`of: 'THAT'`). Distinct names
   * count face-up markers only (a face-down marker has no name, CR-3.7.2.3).
   */
  | { if: 'MARKERS'; of: 'SELF' | 'THAT'; min?: number; max?: number; distinctNames?: boolean }
  | { if: 'ALL'; of: Condition[] }
  | { if: 'NOT'; of: Condition };

/** Where a COUNT condition counts. */
export type CountWhere =
  /** あなたのレベル: the cards in your level zone */
  | 'YOUR_LEVEL'
  | 'YOUR_WAITING_ROOM'
  | 'YOUR_HAND'
  | 'YOUR_MEMORY'
  | 'YOUR_CLIMAX'
  | 'YOUR_FRONT_ROW'
  | 'OPPONENT_STAGE'
  | 'OPPONENT_FRONT_ROW'
  /** あなたの、思い出とマーカー置場のカードの合計 (every card, face down too) */
  | 'YOUR_MEMORY_AND_MARKERS';

/** One action of a cost (CR-8.4). Costs are paid in the order listed (CR-8.4.2.1). */
export type Cost =
  /** (N): put N cards from the top of your stock into the waiting room (CR-8.4.3). */
  | { pay: 'STOCK'; count: number }
  /** このカードを【レスト】する */
  | { pay: 'REST_SELF' }
  /** 手札の…をN枚控え室に置く */
  | { pay: 'DISCARD'; count: number; filter?: CardFilter }
  /** (手札の)このカードを控え室に置く */
  /** (手札の/【スタンド】している)このカードを控え室に置く; `standing`: only while it is standing. */
  | { pay: 'SELF_TO_WAITING_ROOM'; standing?: boolean }
  /** 自分の山札の上から1枚をクロック置場に置く (the cost of 加速, CR-10.12) */
  | { pay: 'DECK_TOP_TO_CLOCK' }
  /** このカードをクロック置場に置く */
  | { pay: 'SELF_TO_CLOCK' }
  /** (他の)あなたの(【スタンド】している)…のキャラをN枚【レスト】する: the player chooses standing characters. */
  | { pay: 'REST_CHARACTERS'; count: number; filter?: CardFilter; other?: boolean }
  /** あなたのレベル置場の表向きのカードをN枚裏向きにする (CR-3.9.2.2: a face-down level card has no information) */
  | { pay: 'LEVEL_FACE_DOWN'; count: number }
  /** あなたのストックの上からN枚をクロック置場に置く */
  | { pay: 'STOCK_TO_CLOCK'; count: number }
  /** このカードを思い出にする */
  /** (【スタンド】している)このカードを思い出にする */
  | { pay: 'SELF_TO_MEMORY'; standing?: boolean }
  /** このカードを手札に戻す */
  | { pay: 'SELF_TO_HAND' }
  /** 手札を(の…を)N枚クロック置場に置く: the player chooses hand cards. */
  | { pay: 'HAND_TO_CLOCK'; count: number; filter?: CardFilter }
  /** このカードを山札の下に置く */
  | { pay: 'SELF_TO_DECK_BOTTOM'; standing?: boolean }
  /** このカードをストック置場の下に置く */
  | { pay: 'SELF_TO_STOCK_BOTTOM' }
  /** あなたのCX置場の「…」をN枚控え室に置く */
  | { pay: 'CLIMAX_TO_WAITING_ROOM'; count: number; filter?: CardFilter }
  /** このカードの下のマーカーをN枚控え室に置く: from the top of the marker zone (CR-3.7.2). */
  | { pay: 'MARKERS_TO_WAITING_ROOM'; count: number }
  /** 搭乗: このカードを表向きで他のあなたの「名称」のマーカーにする — the player chooses that character (CR-10.21). */
  | { pay: 'SELF_TO_MARKER'; underName: string }
  /** (他の)あなたの舞台の…のキャラをN枚控え室に置く: the player chooses characters on their stage. */
  | { pay: 'CHARACTERS_TO_WAITING_ROOM'; count: number; filter?: CardFilter; other?: boolean; /** …を思い出にする instead of 控え室に置く */ toMemory?: boolean; /** 【スタンド】している… */ standing?: boolean };

/** Which cards an effect applies to. */
export type Target =
  /** このカード */
  | { who: 'SELF' }
  /** (他の)あなたの…のキャラすべて */
  | { who: 'ALL_YOURS'; filter?: CardFilter; other?: boolean }
  /** 相手のキャラすべて */
  | { who: 'ALL_THEIRS' }
  /** このカードの前のあなたのキャラすべて (CR-3.6.5) */
  | { who: 'IN_FRONT'; filter?: CardFilter }
  /** (他の)あなたの前列の中央の枠のキャラ: your characters in the named slots. */
  | { who: 'YOUR_SLOT'; slots: SlotId[]; other?: boolean }
  /** The cards chosen by the most recent CHOOSE of this resolution. */
  | { who: 'CHOSEN' }
  /** その(舞台に置かれた)キャラ: the card the ability is about (its trigger named it). */
  | { who: 'THAT' }
  /** このマーカーを持つ舞台の…キャラ: the character in the slot whose marker zone this card is in. */
  | { who: 'MARKER_HOLDER'; filter?: CardFilter }
  /** このカードのバトル相手 (CR-7.2.1.5.1; last known per CR-8.11.2) */
  | { who: 'BATTLE_OPPONENT' }
  /** (思い出置場の)そのキャラ: the cards the most recent MOVE of this resolution moved, where they went (`where`: how the text names that zone). */
  | { who: 'MOVED'; where?: 'MEMORY' }
  /** この効果で舞台に置かれたキャラ: the cards this resolution put on the stage. */
  | { who: 'PLACED' };

/** Where a CHOOSE picks from. The player resolving the effect chooses (CR-8.6.5). */
/** When a delayed ability triggers: the start of the next such phase or step of whose turn (the turn start is the stand phase start, CR-6.2.1.1). */
export interface DelayedTime {
  phase?: Phase;
  step?: AttackStepName;
  whose: 'YOURS' | 'OPPONENT' | 'ANY';
}

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
  | 'OPPONENT_CLIMAX'
  /** 相手の控え室のカード */
  | 'OPPONENT_WAITING_ROOM'
  /** 自分の思い出置場の…: face-up cards only (a face-down card has no name or traits, CR-3.12.2.2.1). */
  | 'YOUR_MEMORY'
  /** 他のあなたの舞台の…キャラ, for putting under this card: as YOUR_STAGE. */
  | 'YOUR_OTHER_STAGE'
  /** 自分のバトル中のキャラ: your character in the current battle */
  | 'YOUR_BATTLING';

export type Destination =
  | 'HAND'
  | 'WAITING_ROOM'
  | 'STOCK'
  /** ストック置場の下に置く */
  | 'STOCK_BOTTOM'
  | 'CLOCK'
  | 'MEMORY'
  | 'DECK_TOP'
  | 'DECK_BOTTOM'
  /** 山札に戻す (then the deck is shuffled by the effect): put into the deck */
  | 'DECK'
  /** このカードがいた枠 / それが直前に置かれていた枠: the slot the ability's card is or was in. */
  | 'SOURCE_SLOT'
  /** The slot chosen by the most recent CHOOSE_SLOT of this resolution. */
  | 'CHOSEN_SLOT'
  /** そのキャラがいた枠: the slot the card the ability is about left. */
  | 'ABOUT_SLOT'
  /** このカードの下にマーカーとして置く (face given by the MOVE; CR-3.7.2: face down unless the text says 表向き) */
  | 'UNDER_SELF'
  /** その(舞台に置かれた)キャラの下のマーカーにする */
  | 'UNDER_THAT';

/** …1枚につき: multiplies an amount by the number of (other) characters of yours that match. */
export interface PerCharacter {
  filter?: CardFilter;
  other?: boolean;
}

/** The steps of the attack phase a trigger can name (CR-7). */
export type AttackStepName = 'ATTACK_DECLARATION' | 'TRIGGER' | 'COUNTER' | 'DAMAGE' | 'BATTLE' | 'ENCORE';

export type Effect =
  /** あなたはN枚引く / 引いてよい */
  | { do: 'DRAW'; count: number; optional?: boolean; /** N枚まで引く: the player may stop before each card. */ upTo?: boolean }
  /** 次の行動をN回行う。『…』: the quoted effects, N times in a row. */
  | { do: 'REPEAT'; times: number; effects: Effect[] }
  /**
   * …をN枚(まで)選び: `min` equal to `max` is "choose N", `min: 0` is "choose up to N" (CR-8.6.3.1).
   * `add`: …をN枚までと…をN枚まで選び — these are chosen in addition to the cards of the previous CHOOSE.
   */
  | { do: 'CHOOSE'; from: ChooseFrom; min: number; max: number; filter?: CardFilter; other?: boolean; levelMaxX?: boolean; /** その手札に戻したキャラと同じカード名の: only cards with the name of a card the most recent MOVE moved */ sameNameAsMoved?: boolean; add?: boolean }
  /** …を手札に戻す / 控え室に置く / ストック置場に置く ... `reveal`: 相手に見せ; `rested`: 【レスト】して置く */
  | { do: 'MOVE'; target: Target; to: Destination; /** …に好きな順番で置く: the player chooses the order the cards go there in. */ inOrder?: boolean; reveal?: boolean; rested?: boolean; /** for UNDER_SELF / UNDER_THAT: 表向き or 裏向き */ face?: 'UP' | 'DOWN'; /** …に戻すか…に置く: the player chooses between `to` and this. */ orTo?: Destination }
  /**
   * そのターン中、…のパワー/ソウル/レベルを＋N (`per`: …1枚につき).
   * `until: 'NEXT_OPPONENT_TURN'`: 次の相手のターンの終わりまで instead of this turn.
   */
  | { do: 'MODIFY'; target: Target; stat: 'POWER' | 'SOUL' | 'LEVEL'; amount: number; per?: PerCharacter; until?: 'NEXT_OPPONENT_TURN'; /** Ｘは相手のキャラの枚数×N: the amount times a count (as COUNT) when the effect resolves. */ perCount?: { where: CountWhere; filter?: CardFilter }; /** ＋Ｘ (Ｘは…×N): the amount is multiplied by X of this resolution. */ timesX?: boolean }
  /** …を【スタンド】/【レスト】/【リバース】する */
  | { do: 'ORIENT'; target: Target; to: Orientation }
  /** 相手にNダメージを与える */
  | { do: 'DAMAGE'; amount: number }
  /**
   * 自分の山札の上からN枚を…に置く.
   * `whose: 'EITHER'`: 自分か相手の、山札の上からN枚を… — the player first chooses whose deck.
   */
  | { do: 'DECK_TOP'; count: number; to: 'STOCK' | 'WAITING_ROOM' | 'CLOCK'; whose?: 'EITHER' | 'OPPONENT'; /** 上からN枚までを: the player may stop before each card. */ upTo?: boolean; /** 山札の下からN枚を */ fromBottom?: boolean; /** Ｘはそれらのカードのレベルの合計に等しい (a climax counts as 0) */ setX?: 'LEVEL_TOTAL' }
  /** その山札をシャッフルする */
  | { do: 'SHUFFLE' }
  /** 自分の控え室のカードすべてを、山札に戻す (followed by SHUFFLE) */
  | { do: 'WAITING_ROOM_TO_DECK'; /** すべてのプレイヤーは…: both players, the turn player first */ everyone?: boolean }
  /** [[standby.gif]]の効果を行う (CR-4.14.2.13): the effect of the standby trigger icon. */
  | { do: 'ICON_EFFECT'; icon: 'STANDBY' }
  /**
   * 集中 (CR-10.7): 自分の山札の上からN枚をめくり、控え室に置く。それらのカードの…1枚につき、…
   * `each` is performed once per turned-over card matching `per`.
   */
  | { do: 'BRAINSTORM'; count: number; per: CardFilter; each: Effect[]; setX?: boolean; /** text only: the actions are said in one sentence (…置き、…) */ joined?: boolean }
  /** …なら、… (a condition checked while resolving) */
  | { do: 'IF'; condition: Condition; then: Effect[]; else?: Effect[] }
  /**
   * Choose a slot of your own: 舞台の好きな枠 (ANY) or 後列のキャラのいない枠
   * (EMPTY_BACK). Skipped when the previous CHOOSE chose nothing.
   */
  | { do: 'CHOOSE_SLOT'; which: 'ANY' | 'EMPTY_BACK' }
  /**
   * 前列／後列のキャラのいない枠に動かす: the target character moves to an empty
   * slot of that row of its master's stage (a move between slots, CR-3.1.4:
   * it stays the same card and keeps its state). Nothing happens without such
   * a slot or when the card cannot be moved (このカードは他の枠に動かせない).
   */
  | { do: 'MOVE_TO_SLOT'; target: Target; row: 'FRONT' | 'BACK' | 'ANY' }
  /** 自分のクロックの上から1枚を、控え室に置く; `whose: 'OPPONENT'`: 相手のクロックの上から1枚を… */
  | { do: 'CLOCK_TOP'; to: 'WAITING_ROOM' | 'STOCK'; whose?: 'OPPONENT'; /** 1枚までを: the player may leave it. */ optional?: boolean }
  /**
   * 自分の山札を上からN枚まで見て、…を1枚まで選んで(相手に見せ、)手札に加え、残りのカードを控え室に置く.
   * The player may stop before each card (CR-3.2.3.1). `per` makes N the number of matching characters.
   */
  | { do: 'LOOK_TOP'; upTo: number; per?: PerCharacter; pick?: CardFilter; reveal?: boolean; /** …をN枚まで選んで: how many may be taken (default 1) */ picks?: number }
  /**
   * 自分の山札の上から1枚を公開する。そのカードが…なら(手札に加え、)…。 The top card of your deck is shown to
   * both players. If it matches: with `take` it goes to your hand; then `then` is done. A card that is not
   * taken stays where it was (元に戻す) and is no longer shown.
   */
  | { do: 'REVEAL_TOP'; filter: CardFilter; take?: boolean; then?: Effect[]; /** …ならストック置場に置く: a matching card goes to the stock instead of the hand. */ toStock?: boolean; /** 公開してよい: the player is asked first. */ optional?: boolean; /** そうでないなら、…: done when the card does not match. */ else?: Effect[] }
  /**
   * The cards just chosen are split: up to `take` of them (exactly, with `exact`, as many as there are) go to `to`
   * (in the order the player chooses, with `inOrder`), the rest to `rest`. 1枚手札に加え、残りのカードを…
   */
  | { do: 'SPLIT_CHOSEN'; take: number; exact?: boolean; to: Destination; inOrder?: boolean; rest: Destination; reveal?: boolean }
  /**
   * A delayed ability (CR-8.? 遅延): 次のあなたのターンの始めに／次のあなたのドローフェイズの始めに／アンコールステップの始めに／
   * ターンの終わりに, …. It triggers once, the next time that phase or step begins (`whose` turn), with this
   * resolution's chosen, moved and placed cards, and is then gone.
   */
  | { do: 'DELAYED'; at: DelayedTime; effects: Effect[] }
  /** 相手は自分の思い出置場のそのキャラを、舞台の好きな枠に置く: the owner of each target puts it in a slot of their stage they choose. */
  | { do: 'OWNER_PLACES'; target: Target }
  /** …を選び、舞台のキャラのいない枠に置く: the master chooses an empty slot of the target's owner's stage for it. */
  | { do: 'PLACE_IN_EMPTY_SLOT'; target: Target }
  /** それぞれを【スタンド】して入れ替える: the two chosen characters (or the chosen one and this card) stand and change slots. */
  | { do: 'SWAP_CHOSEN'; withSelf?: boolean }
  /** 自分のレベル置場のカードと控え室のカードをN枚ずつ選び、入れ替える */
  | { do: 'EXCHANGE_LEVEL_WAITING_ROOM'; count: number }
  /** 山札を見て…を1枚まで選んで公開し、自分の手札の…を1枚まで選んで公開し、それらを入れ替え: only when one of each is chosen. */
  | { do: 'SWAP_DECK_HAND'; filter: CardFilter; handFilter?: CardFilter }

  | { do: 'MAY'; effects: Effect[]; /** text only: 次の効果を行ってよい / 次の行動を行ってよい with the effects quoted */ said?: 'EFFECT' | 'ACTION' }
  /**
   * (自分|相手)の山札を上からN枚まで見て、(カードをM枚まで選び、)山札の上に好きな順番で置き(、残りのカードを控え室に置く).
   * The player looks at cards one at a time and may stop (CR-3.2.3.1); with `keep`, chooses up to that many to
   * put back (the rest go to the waiting room); then puts them back on top in the order they choose.
   */
  | { do: 'REORDER_TOP'; upTo: number; whose?: 'OPPONENT'; keep?: number; /** カードを1枚選び、山札の上に置き: exactly `keep` (as many as were looked at, if fewer) go back. */ keepExact?: boolean }
  /** 相手のストックの下からN枚を、控え室に置く */
  | { do: 'STOCK_BOTTOM_TO_WAITING_ROOM'; count: number; whose: 'OPPONENT' }
  /**
   * 相手は自分のストックすべてを、控え室に置き(山札に戻し、その山札をシャッフルし)、自分の山札の上から同じ枚数を
   * ストック置場に置く.
   */
  | { do: 'OPPONENT_STOCK_RESET'; via: 'WAITING_ROOM' | 'DECK' }
  /** 自分の山札の上から1枚を公開し、… Ｘは公開されたカードのレベルに等しい: shown to both players and put back; X is its level (a climax counts as 0). */
  | { do: 'SHOW_TOP' }
  /** 自分の山札を上から1枚見て、山札の上か下に置く: the player looks at the top card and leaves it or puts it on the bottom. */
  | { do: 'TOP_OR_BOTTOM'; /** 山札の上か控え室に置く: the other place is the waiting room. */ orWaitingRoom?: boolean; /** 山札の上か下か控え室に置く */ anyOfThree?: boolean }
  /** このカードの下のマーカーをN枚…に置く: the top N markers of this card's slot (CR-3.7.2). */
  | { do: 'MARKERS_TOP'; count: number; to: 'HAND' | 'STOCK' | 'WAITING_ROOM' }
  /** そのアタック中、あなたはトリガーステップにトリガーチェックをN回行う */
  | { do: 'TRIGGER_CHECKS'; count: number }
  /** 次のNつの効果のうちあなたが選んだ1つを行う。『…』『…』: the player chooses one of the effects. */
  | { do: 'CHOOSE_ONE'; options: Effect[][]; /** How the card says it: 'OR' for "Aするか、B" in one sentence, 'OR_JOINED' without the comma (text only). */ said?: 'OR' | 'OR_JOINED' }
  /** ［cost］ あなたはコストを払ってよい。そうしたら、… inside an effect: an optional payment, then what it buys. */
  | { do: 'MAY_PAY'; cost: Cost[]; then: Effect[]; /** text only: the cost stands in the 【自】［…］ head and "…し、あなたはコストを払ってよい" comes after an effect ('THEN': そうしたら、 / 'IF_PAID': コストを払ったなら、) */ said?: 'THEN' | 'IF_PAID' }
  /** そのターン中 (or 次の相手のターンの終わりまで)、…に次の能力を与える。『…』 */
  | { do: 'GRANT'; target: Target; ability: AutoAbility | ContinuousAbility; until?: 'NEXT_OPPONENT_TURN' };

/** The trigger condition of an automatic ability (CR-8.1.1.2.1). */
export type Trigger =
  /** このカードが(手札から)舞台に置かれた時; HAND_OR_CHANGE: 手札から舞台に置かれた時か『チェンジ』で舞台に置かれた時 */
  | { on: 'PLACED_ON_STAGE'; from?: 'HAND' | 'HAND_OR_CHANGE' | 'HAND_OR_MEMORY' }
  /** このカードが手札からクライマックス置場に置かれた時 */
  | { on: 'THIS_CLIMAX_PLACED' }
  /** あなたのキャラのトリガーチェックで…がでた時 */
  | { on: 'TRIGGER_CHECK_REVEALS'; filter?: CardFilter; /** このカードのトリガーチェックで: only the checks of this card's attack. */ ofThisCard?: boolean }
  /** あなたが【起】を使った時: you played an activated ability (its cost has been paid). */
  | { on: 'YOU_PLAYED_ACT' }
  /** 他のあなたの…のキャラが舞台から控え室に置かれた時: that card (about) and the slot it left (aboutSlot). */
  | { on: 'OTHER_STAGE_TO_WAITING_ROOM'; filter?: CardFilter }
  /** あなたの受けたダメージがキャンセルされなかった時: any damage you received went to your clock. */
  | { on: 'TAKEN_DAMAGE_NOT_CANCELLED' }
  /** このカードがトリガーした時: this card is the one turned over by a trigger check (it is in the resolution zone). */
  | { on: 'THIS_TRIGGERED' }
  /** このカードの与えたダメージがキャンセルされた時: a damage whose source is this card (CR-4.13.2) was cancelled. */
  | { on: 'DEALT_DAMAGE_CANCELLED' }
  /** このカードのバトル中、あなたの受けたダメージがキャンセルされた時 */
  | { on: 'TAKEN_DAMAGE_CANCELLED_IN_BATTLE' }
  /** あなたがこのカードの『助太刀』を使った時 (CR-10.5.3) */
  | { on: 'USED_BACKUP' }
  /** このカードがアタックした時 */
  /** このカードがアタックした時; `placedThisTurn`: …手札から舞台に置かれたターン中、… */
  | { on: 'ATTACKS'; placedThisTurn?: boolean }
  /** このカードのアタックの終わりに (CR-7.5.1.4 / CR-7.6.1.5) */
  | { on: 'ATTACK_END' }
  /** 他のあなたの…のキャラがアタックした時: another character of yours, matching the filter, attacks. */
  | { on: 'OTHER_ATTACKS'; filter?: CardFilter }
  /** このカードが【リバース】した時; `inBattle`: バトル中のこのカードが【リバース】した時 (CR-7.2.1.5.1) */
  | { on: 'REVERSED'; inBattle?: boolean }
  /** このカードのバトル相手が【リバース】した時 */
  /** このカードのバトル相手(でレベルN以上のキャラ)が【リバース】した時; `filter`: what the reversed character must be when it is reversed. */
  | { on: 'BATTLE_OPPONENT_REVERSED'; filter?: CardFilter; placedThisTurn?: boolean }
  /** (あなたの/相手の)…フェイズの始めに */
  | { on: 'PHASE_START'; phase: Phase; turn: 'YOURS' | 'OPPONENT' | 'ANY' }
  /** あなたのクライマックスがクライマックス置場に置かれた時; with a filter: あなたのトリガーアイコンが…のCXがCX置場に置かれた時 */
  | { on: 'CLIMAX_PLACED'; filter?: CardFilter; /** 相手のCXがCX置場に置かれた時 */ opponent?: boolean; /** あなたのCXフェイズ中、… */ duringClimaxPhase?: boolean }
  /** 他のあなたの…のキャラがフロントアタックされた時: the ability is about that character (THAT). */
  | { on: 'OTHER_FRONT_ATTACKED'; filter?: CardFilter }
  /** このカードが舞台から控え室に置かれた時 (the trigger of encore, CR-10.2.1) */
  | { on: 'STAGE_TO_WAITING_ROOM' }
  /** (あなたの/相手の)…ステップの始めに */
  | { on: 'STEP_START'; step: AttackStepName; turn: 'YOURS' | 'OPPONENT' | 'ANY' }
  /** マーカー置場にこのカードがあるなら、このマーカーを持つ舞台の…キャラがアタックした時 (ability with zone 'MARKER') */
  | { on: 'HOLDER_ATTACKS'; filter?: CardFilter }
  /** …した時か…した時: one ability with several trigger conditions; it triggers when any of them is met. */
  | { on: 'EITHER'; of: Trigger[] };

/** Keywords that are labels without rules meaning of their own (CR-10), kept so other effects can refer to them. */
export type Keyword =
  /** 搭乗 (CR-10.21) */
  | 'BOARDING'
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
  /** このカードは相手の効果に選ばれない: the opponent's effects cannot choose this card (CR-8.6.3.1). */
  untargetable?: boolean;
  /** マーカー置場にこのカードがあるなら / 思い出置場にこのカードがあるなら: the ability works while this card is a face-up marker or in memory face up, and only there (CR-2.12.2.3). */
  zone?: 'MARKER' | 'MEMORY';
  /**
   * 回想 (CR-10.20.2): the card has the two automatic abilities of the keyword. While it is face up in its master's
   * memory: when a character of theirs is put on the stage from outside the stage, with no marker under it, they may
   * put this card face up under it. When it moves from a marker zone to a public zone other than a marker zone, it
   * goes to memory. The engine plays both (flow/autos.ts); this flag only says the card has them.
   */
  recollection?: boolean;
  /** 【リンク】 （名称）: an ability with a name and no effect, looked at by other abilities (CR-10.17). */
  link?: string;
  /** このカードはサイドアタックできない: this card cannot make a side attack (CR-7.2.1.4). */
  noSideAttack?: boolean;
  /** …に《特徴》を与える: SELF (given to the card, e.g. by a GRANT for a turn) or every other character on the stage. */
  giveTraits?: { traits: string[]; to: 'SELF' | 'OTHER_CHARACTERS' };
  /** あなたの手札の枚数上限を＋N (CR-6.8.1.2) */
  handLimitPlus?: number;
  /** このカードは、色条件を満たさずに手札からプレイできる (with inHand): the colour condition (CR-8.6.2.1.1) is not checked. */
  ignoresColor?: boolean;
  /** このカードは、…なら、手札からプレイできない (with inHand): the card can be played only while this holds. */
  playOnlyIf?: Condition;
  /** このカードはあなたのスタンドフェイズに【スタンド】しない (also given: そのキャラは次の相手のスタンドフェイズに【スタンド】しない) */
  noStand?: boolean;
  /** このカードは他の枠に動かせない: this card cannot be moved to another slot. */
  cannotMove?: boolean;
  /** このカードのバトル中、相手は(イベントと)『助太刀』を手札からプレイできない */
  noOpponentCounters?: 'BACKUP' | 'EVENT_AND_BACKUP';
  /** このカードのバトル中、すべてのプレイヤーは『助太刀』を手札からプレイできない */
  noBackupsEveryone?: boolean;
  /** そのターン中、そのキャラは【リバース】しない (given for a turn) */
  cannotBeReversed?: boolean;
  /** そのターン中、そのキャラは『【自】 アンコール』を使えない (given for a turn; the rule's encore too) */
  noEncore?: boolean;
  /** このカードと同じカード名のカードは、デッキに好きな枚数入れることができる (a deck-building rule, CR-?; checked by the format) */
  anyNumberInDeck?: boolean;
  /** すべての領域にあるこのカードはトリガーアイコンに…を得る */
  gainsTriggerIcons?: TriggerIcon[];
  /** あなたの手札の「…」のレベルを－N: the level of matching cards in the master's hand changes by `level`. */
  handCards?: { filter: CardFilter; level: number };
  /** …このカードは次の能力を得る。『【永】 …』: continuous abilities this card has while this one is in force. */
  gains?: ContinuousAbility[];
  /**
   * あなたの手札のこのカードの…: the ability works while this card is in its master's hand, and only there
   * (CR-2.12.2.3). It applies to this card itself.
   */
  inHand?: boolean;
  /**
   * 大活躍 (CR-10.6.2): while this character is in its master's front-centre
   * slot and not reversed, a character of the opponent that attacks makes a
   * front attack on this character instead.
   */
  greatPerformance?: boolean;
  condition?: Condition;
  apply: {
    target: Exclude<Target, { who: 'CHOSEN' } | { who: 'BATTLE_OPPONENT' } | { who: 'THAT' } | { who: 'MOVED' } | { who: 'PLACED' }>;
    stat: 'POWER' | 'SOUL' | 'LEVEL';
    amount: number;
    per?: PerCharacter;
    /** Ｘはそのキャラのレベル×N: multiplies the amount by the target's level. */
    perTargetLevel?: boolean;
    /** Ｘはそのキャラのソウル×N: multiplies the amount by the target's soul. */
    perTargetSoul?: boolean;
    /** このカードの下のマーカー1枚につき: multiplies the amount by the number of markers of this card's slot. */
    perMarker?: boolean;
    /** あなたの思い出置場の「…」1枚につき: multiplies the amount by the number of matching cards in a zone (as COUNT). */
    perCount?: { where: CountWhere; filter?: CardFilter };
    /** あなたのターン中、…し、相手のターン中、…: this part applies only while this condition holds too. */
    onlyIf?: Condition;
  }[];
  /** …に『…』を与える: automatic abilities given to the targets while this ability is active. */
  grant?: { target: Exclude<Target, { who: 'CHOSEN' } | { who: 'BATTLE_OPPONENT' } | { who: 'THAT' } | { who: 'MOVED' } | { who: 'PLACED' }>; ability: AutoAbility }[];
}

/** 【自】 (CR-8.1.1.2) */
export interface AutoAbility {
  type: 'AUTO';
  keywords?: Keyword[];
  /** マーカー置場にこのカードがあるなら / 思い出置場にこのカードがあるなら: triggers only while this card is there, face up. */
  zone?: 'MARKER' | 'MEMORY';
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
  /** Ｘ: set by a BRAINSTORM, a DECK_TOP or a SHOW_TOP; used by CHOOSE with levelMaxX and MODIFY with timesX. */
  x?: number;
  /** The slot chosen by the most recent CHOOSE_SLOT. */
  slot?: SlotId | null;
  /** Instance ids moved by the most recent DECK_TOP (for それらのカードに…があるなら). */
  moved?: number[];
  /** Object ids, after the move, of the cards the most recent MOVE moved (target MOVED). */
  lastMoved?: number[];
  /** Object ids of the cards this resolution put on the stage (target PLACED). */
  placed?: number[];
  /** そのキャラがいた枠 (ABOUT_SLOT) */
  aboutSlot?: { player: 0 | 1; slot: SlotId } | null;
  /** Whether the most recent MOVE or CLOCK_TOP moved a card (for そうしたら). */
  did?: boolean;
  /** Object id of the card the ability is about (その舞台に置かれたキャラ), when its trigger named one. */
  about?: number | null;
}
