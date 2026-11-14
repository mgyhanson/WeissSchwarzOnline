/**
 * A first sorting of the cards the engine cannot run yet, by what their
 * text would need. It reads the official Japanese text only and looks for
 * wording that names a mechanism; it does not decide how a card works.
 * Used by stats.test.ts for reports/UNSUPPORTED_CARDS.md (npm run
 * cards:report). Before a card is implemented its whole text, Q&A and
 * errata are read again by hand; this list only says where to start.
 *
 *   A  no wording found that needs anything new: write the card by hand
 *      with the building blocks the engine has
 *   B  as A, and every open sentence also appears on another card, so a
 *      sentence pattern would cover several cards at once
 *   C  needs a new general building block (a trigger, condition, cost,
 *      effect or number the engine does not have yet)
 *   D  needs a whole mechanism the engine does not have (markers,
 *      replacement effects, abilities that work outside the stage, ...)
 *   E  has an official Q&A entry or an erratum that must be read first
 */

import type { DatabaseCard } from '../src/index';
import { compileText, ruleLines } from '../src/index';

export type SupportClass = 'A' | 'B' | 'C' | 'D' | 'E';

/** Cards with an entry on the official errata page (checked 2026-11-14); parallel versions count for their base card. */
export const ERRATA: readonly string[] = ['GUP/W141-008', 'GUP/W141-062', 'GUP/W141-070', 'STS/W140-030'];

interface Marker {
  re: RegExp;
  need: string;
}

/** Wording that needs a whole mechanism (D). */
const MECHANISMS: Marker[] = [
  { re: /マーカー|回想|【リンク】/, need: 'Marker（回想、リンク等）' },
  { re: /かわりに/, need: '置換效果（かわりに）' },
  { re: /(できない|選ばれない|使えない|【スタンド】しない|受けない)/, need: '禁止／不能類的持續效果' },
  { re: /手札のこのカード(の|は)|思い出置場のこのカード|控え室のこのカード|これが思い出にある|このカードが(思い出|控え室)にあるなら/, need: '在舞台以外的區域生效的能力' },
  { re: /このカードがトリガーした時/, need: '這張卡被 Trigger Check 翻出時的能力' },
  { re: /トリガーチェックを[0-9０-９]+回/, need: '多次 Trigger Check' },
  { re: /リプレイ|追加の(ターン|アタック)|もう1回アタック|再度アタック/, need: '額外回合／攻擊、リプレイ' },
  { re: /シフト|フォース|合体|分離|継承|搭乗/, need: '尚未實作的關鍵字' },
  { re: /相手のキャラすべてに|相手の(前列|後列)のキャラすべてに/, need: '影響對手角色的持續效果' },
];

/** Wording that needs a new general building block (C). */
const CONSTRUCTS: Marker[] = [
  { re: /次の[0-9０-９]つの(効果|行動)のうち/, need: '選擇其中一個效果' },
  { re: /好きな順番|山札の上か下に置く/, need: '查看山札頂再排列／放上放下' },
  { re: /入れ替え/, need: '交換兩個區域的卡' },
  { re: /アタックの終わり/, need: '觸發：攻擊結束時' },
  { re: /相手のCXがCX置場に置かれた時/, need: '觸發：對手的 Climax 放到 Climax 置場時' },
  { re: /他の(あなたの|自分の)[^。]*?が[^。]*?(舞台に置かれた時|控え室に置かれた時|【リバース】した時)|あなたのキャラが[^。]*?(舞台に置かれた時|【リバース】した時)/, need: '觸發：其他角色移動或 Reverse 時' },
  { re: /キャンセルされ(た|なかった)時|ダメージを受けた時|ダメージが[^。]*?なら/, need: '觸發／條件：傷害被取消或受到傷害' },
  { re: /レベルアップした時|リフレッシュした時|レベル置場に置かれた時/, need: '觸發：Level Up／Refresh 時' },
  { re: /Ｘは(?![^。]*?(キャラのレベル×|キャラの枚数×))/, need: 'Ｘ按角色張數／Level 以外的數量計算' },
  { re: /パワーが[0-9０-９]+(以上|以下)|パワー以下|パワーより/, need: '以 Power 為條件' },
  { re: /(手札|ストック|クロック|思い出|控え室の[^。、]*?)が[0-9０-９]+枚(以上|以下)/, need: '條件：某區域的張數' },
  { re: /『【(永|起)】/, need: '給予永續或起動能力' },
  { re: /\[\[standby\.gif\]\]の効果/, need: '執行 Standby 圖示的效果' },
  { re: /同じカード名|カード名が同じ/, need: '與指定卡同名的卡' },
  { re: /相手は[^。]*?(選び|引く|置く|見せ)/, need: '由對手作選擇或行動' },
  { re: /(山札|手札|控え室)[^。]*?を公開(し|する)/, need: '公開山札頂／手牌並按結果處理' },
  { re: /ストック置場に置き、[^。]*?ストック|ストックを[^。]*?選び/, need: '選擇或重排 Stock' },
  { re: /枠に動かす|枠に置く|好きな枠/, need: '移動到指定的枠／由其他區域放上舞台' },
  { re: /次の相手の(スタンド|ドロー|クロック|アタック)フェイズ/, need: '延至對手指定階段的效果' },
  { re: /ゲーム中|ターン[2-9２-９]回/, need: '整局或每回合多次的次數限制' },
];

export interface Classified {
  cardId: string;
  set: string;
  kind: string;
  class: SupportClass;
  /** What the open sentences need (empty for A and B). */
  needs: string[];
  /** Rules sentences no sentence pattern covers. */
  openLines: number;
}

const normalise = (line: string): string => line.replace(/[0-9０-９]+/g, 'N').replace(/《[^》]*》/g, '《T》').replace(/「[^」]*」/g, '「N」');

/** The sentences of a card that no existing sentence pattern covers. */
export function openLines(card: DatabaseCard): string[] {
  return ruleLines(card.official).filter((line) => compileText({ ...card.official, kind: '2', text: line }) === null);
}

export function classifyUnsupported(cards: readonly DatabaseCard[]): Classified[] {
  const unsupported = cards.filter((card) => card.record.support === 'unsupported');
  // On how many cards each open sentence appears (numbers, traits and names aside).
  const seen = new Map<string, number>();
  for (const card of unsupported) for (const line of new Set(openLines(card).map(normalise))) seen.set(line, (seen.get(line) ?? 0) + 1);

  return unsupported.map((card) => {
    const lines = openLines(card);
    const find = (markers: Marker[]) => [...new Set(markers.filter((m) => lines.some((line) => m.re.test(line))).map((m) => m.need))];
    const mechanisms = find(MECHANISMS);
    const constructs = find(CONSTRUCTS);
    const faqs = (card.official as { faqs?: unknown[] }).faqs ?? [];
    let cls: SupportClass;
    let needs: string[] = [];
    if (faqs.length > 0 || ERRATA.includes(card.record.cardId)) {
      cls = 'E';
      needs = [faqs.length > 0 ? `官方 Q&A ${faqs.length} 條` : '官方勘誤', ...mechanisms, ...constructs];
    } else if (mechanisms.length > 0) {
      cls = 'D';
      needs = [...mechanisms, ...constructs];
    } else if (constructs.length > 0) {
      cls = 'C';
      needs = constructs;
    } else {
      cls = lines.length > 0 && lines.every((line) => (seen.get(normalise(line)) ?? 0) >= 2) ? 'B' : 'A';
    }
    return { cardId: card.record.cardId, set: card.set, kind: card.def.kind, class: cls, needs, openLines: lines.length };
  });
}
