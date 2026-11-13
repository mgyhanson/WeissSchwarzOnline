/**
 * Plain-language narration of what is being shown: for every step, what
 * happened, why, and the result; and for every phase, what it is for and
 * what the player may do. Written for this project (not a translation of
 * the rules), with rule numbers of the Comprehensive Rules JP ver. 1.114.
 *
 * Like the steps themselves, this only uses what the seat received: a card
 * the seat cannot see is never named.
 */

import type { AttackStepName, Phase, PlayerId, PlayerView } from '@wso/game-engine';
import { cardInfo } from '../model/cards';
import { ATTACK_STEP_ZH, ATTACK_ZH, PHASE_ZH, SLOT_ZH, TRIGGER_EFFECT_ZH, TRIGGER_ZH, ZONE_ZH, who } from '../model/text';
import type { Step, StepCard } from './steps';

export interface PhaseGuide {
  name: string;
  /** What the phase is for. */
  summary: string;
  /** What the turn player may do. */
  youCan: string;
  /** What the game does by itself. */
  system: string;
  /** When the next phase begins. */
  next: string;
  rules: string;
}

export const PHASE_GUIDE: Record<Phase, PhaseGuide> = {
  STAND: {
    name: 'Stand 階段',
    summary: '回合開始，讓上一回合攻擊過的角色可以再行動。',
    youCan: '這個階段沒有需要你選擇的事。',
    system: '系統把回合玩家舞台上所有 Rest 的角色轉回 Stand。',
    next: '完成後自動進入抽牌階段。',
    rules: 'CR-6.2',
  },
  DRAW: {
    name: '抽牌階段',
    summary: '回合玩家補充手牌。',
    youCan: '這個階段沒有需要你選擇的事。',
    system: '系統從回合玩家的山札頂抽 1 張放入手牌。',
    next: '抽牌後自動進入 Clock 階段。',
    rules: 'CR-6.3',
  },
  CLOCK: {
    name: 'Clock 階段',
    summary: '可以用 1 張手牌換 2 張新牌，代價是自己的 Clock 多 1 張（離升級近一步）。',
    youCan: '選 1 張手牌放到 Clock，然後抽 2 張；也可以選擇不放。',
    system: '放了的話，系統把該卡移到 Clock 並抽 2 張。Clock 滿 7 張會 Level Up。',
    next: '決定後進入主要階段。',
    rules: 'CR-6.4',
  },
  MAIN: {
    name: '主要階段',
    summary: '佈置舞台的階段。',
    youCan: '登場角色（要符合 Level、顏色及 Cost）、使用 Event、使用【起】能力、交換舞台上角色的位置，次序及次數不限。',
    system: '每個行動之後，系統處理因此觸發的【自】能力。',
    next: '你按「結束主要階段」後進入 Climax 階段。',
    rules: 'CR-6.5',
  },
  CLIMAX: {
    name: 'Climax 階段',
    summary: '可以打出 1 張 Climax 卡，強化這個回合的攻擊。',
    youCan: '從手牌放 1 張 Climax 到 Climax 置場（要符合顏色），或者不放。',
    system: '「Climax 階段開始時」的能力在這時觸發；放置 Climax 後它的效果立即生效。',
    next: '決定後進入攻擊階段。',
    rules: 'CR-6.6',
  },
  ATTACK: {
    name: '攻擊階段',
    summary: '用前列 Stand 的角色逐一攻擊，對對手造成傷害。',
    youCan: '每次選 1 張前列 Stand 的角色及攻擊方式（正面／側面／直接），或結束攻擊。先攻玩家的第一回合只可以攻擊 1 次。',
    system: '每次攻擊依次進行：攻擊宣言 → Trigger → Counter（只限正面攻擊）→ 傷害 → 戰鬥（只限正面攻擊）。全部攻擊結束後進行 Encore 步驟。',
    next: '沒有角色可以攻擊或你選擇結束後，進行 Encore 步驟，然後進入結束階段。',
    rules: 'CR-7',
  },
  END: {
    name: '結束階段',
    summary: '回合收尾。',
    youCan: '手牌多於 7 張時，選卡放到控え室直至剩 7 張。',
    system: '系統把 Climax 置場的卡放到控え室；「該回合中」的效果在這時消失。',
    next: '完成後輪到對手的回合。',
    rules: 'CR-6.8',
  },
};

export const ATTACK_STEP_GUIDE: Record<AttackStepName, string> = {
  ATTACK_DECLARATION: '選擇攻擊角色及攻擊方式。攻擊角色會轉為 Rest。直接攻擊 Soul +1；側面攻擊的 Soul 要減去正面對手角色的 Level。（CR-7.2）',
  TRIGGER: '攻擊方翻開自己山札頂 1 張（Trigger Check），執行它的 Trigger 圖示，然後把它放到 Stock。（CR-7.3）',
  COUNTER: '只限正面攻擊：防守方可以從手牌使用 1 張有 Counter 圖示的卡或「助太刀」能力。（CR-7.4）',
  DAMAGE: '防守方受到等於攻擊角色 Soul 的傷害：逐張翻開山札頂，翻到 Climax 就 Cancel（全部放到控え室，不受傷害）；否則全部放到 Clock。（CR-7.5）',
  BATTLE: '只限正面攻擊：比較雙方角色的 Power，較低的一方被 Reverse；相同則雙方都 Reverse。（CR-7.6）',
  ENCORE: '被 Reverse 的角色放到控え室。這時可以支付 3 Stock（或卡上寫的其他費用）把它以 Rest 放回原位（Encore）。（CR-7.7）',
};

export interface Caption {
  /** Short headline, e.g. "Trigger Check". */
  title: string;
  /** What happened, why, and the result. */
  lines: string[];
  player: PlayerId | null;
  /** Cards the seat was shown in this step. */
  cards: StepCard[];
  /** The card whose effect this is, when the step is an effect. */
  sourceCardId?: string;
  /** Major steps are kept in the battle log; minor ones (plain moves) only narrate. */
  major: boolean;
}

const nameOf = (cardId: string | null | undefined): string => (cardId ? `「${cardInfo(cardId).name}」` : '（看不到的卡）');

/** The card id of a stage card by object id, from the view on screen. */
function stageCardId(view: PlayerView, objectId: number | null): string | null {
  if (objectId === null) return null;
  for (const side of view.sides) {
    for (const cards of Object.values(side.stage)) {
      for (const card of cards) if (!card.hidden && card.objectId === objectId) return card.cardId;
    }
  }
  return null;
}

const MOVE_REASON_ZH: Record<string, string> = {
  PLAY: '使用卡牌',
  COST: '支付費用',
  EFFECT: '卡牌效果',
  CLOCK_PHASE: 'Clock 階段的選擇',
  HAND_LIMIT: '手牌上限',
  END_PHASE: '結束階段',
  ENCORE: 'Encore',
  REVERSED: '角色被 Reverse',
  RULE: '規則處理',
  MULLIGAN: '開局換牌',
  SETUP: '遊戲準備',
  TRIGGER: 'Trigger 圖示的效果',
  REPLACED: '同一個枠放了新角色',
};

export function explainStep(step: Step, seat: PlayerId, view: PlayerView): Caption {
  const w = (p: PlayerId) => who(p, seat);
  switch (step.kind) {
    case 'TURN':
      return { title: `第 ${step.turn} 回合`, lines: [`輪到${w(step.player)}的回合。`], player: step.player, cards: [], major: true };
    case 'PHASE': {
      const guide = PHASE_GUIDE[step.phase];
      return { title: `${w(step.player)}的${guide.name}`, lines: [guide.summary, guide.system], player: step.player, cards: [], major: true };
    }
    case 'STEP':
      return { title: ATTACK_STEP_ZH[step.step], lines: [ATTACK_STEP_GUIDE[step.step]], player: step.player, cards: [], major: false };
    case 'DRAW': {
      const n = step.cards.length;
      const seen = step.cards.filter((c) => c.cardId);
      return {
        title: `${w(step.player)}抽 ${n} 張`,
        lines: [`從山札頂抽 ${n} 張放入手牌。${step.player === seat && seen.length > 0 ? `抽到：${seen.map((c) => nameOf(c.cardId)).join('、')}。` : step.player !== seat ? '對手抽到的卡不會公開。' : ''}`],
        player: step.player,
        cards: step.player === seat ? step.cards : [],
        major: true,
      };
    }
    case 'ATTACK': {
      const attacker = nameOf(stageCardId(view, step.attacker));
      const defender = step.defender !== null ? nameOf(stageCardId(view, step.defender)) : null;
      const how =
        step.attackType === 'DIRECT'
          ? '正面沒有對手角色，所以是直接攻擊：這次攻擊 Soul +1，不會進行戰鬥。'
          : step.attackType === 'SIDE'
            ? `側面攻擊：不與 ${defender ?? '對手角色'} 戰鬥，但這次攻擊的 Soul 要減去該角色的 Level。`
            : `正面攻擊：目標是 ${defender ?? '正面的對手角色'}。傷害結算後雙方比較 Power。`;
      return {
        title: `${w(step.player)}發動${ATTACK_ZH[step.attackType]}`,
        lines: [`${w(step.player)}的${SLOT_ZH[step.slot]}角色 ${attacker} 攻擊，並轉為 Rest。`, how],
        player: step.player,
        cards: [],
        major: true,
      };
    }
    case 'TRIGGER': {
      const icons = step.icons.length > 0 ? step.icons.map((icon) => `${TRIGGER_ZH[icon]}（${TRIGGER_EFFECT_ZH[icon]}）`).join('、') : null;
      return {
        title: 'Trigger Check',
        lines: [`${w(step.player)}翻開山札頂 1 張：${nameOf(step.card.cardId)}。`, icons ? `Trigger 圖示：${icons}。` : '這張卡沒有 Trigger 圖示，沒有額外效果。', '這張卡隨後放到 Stock。'],
        player: step.player,
        cards: [step.card],
        major: true,
      };
    }
    case 'DAMAGE': {
      const turned = step.cards.length;
      if (step.amount === null) {
        return { title: '傷害判定（進行中）', lines: [`${w(step.receiver)}已翻開 ${turned} 張，途中發生了其他處理（例如山札用完要 Refresh），傷害稍後繼續。`], player: step.receiver, cards: step.cards, major: true };
      }
      const last = step.cards[turned - 1];
      const result = step.cancelled
        ? `第 ${turned} 張翻到 Climax ${nameOf(last?.cardId)}，傷害被 Cancel：翻開的 ${turned} 張全部放到控え室，${w(step.receiver)}不受傷害。`
        : `沒有翻到 Climax，沒有取消：${step.amount} 張全部放到${w(step.receiver)}的 Clock。`;
      return {
        title: `傷害判定：${w(step.receiver)}受到 ${step.amount} 點傷害`,
        lines: [`從${w(step.receiver)}的山札頂逐張翻開，最多 ${step.amount} 張。`, result],
        player: step.receiver,
        cards: step.cards,
        major: true,
      };
    }
    case 'REVEAL':
      return {
        title: step.reason === 'EFFECT' ? '效果翻開山札' : '公開卡牌',
        lines: [`${w(step.player)}${step.reason === 'EFFECT' ? '因卡牌效果翻開山札頂的卡' : '按效果向對手展示'}：${step.cards.map((c) => nameOf(c.cardId)).join('、')}。`],
        player: step.player,
        cards: step.cards,
        major: true,
      };
    case 'ORIENT': {
      const card = nameOf(stageCardId(view, step.objectId));
      const text =
        step.to === 'REVERSE'
          ? `${w(step.player)}的${SLOT_ZH[step.slot]}角色 ${card} 被 Reverse（戰鬥中 Power 較低或相同，或受效果影響）。它會在 Encore 步驟放到控え室。`
          : step.to === 'REST'
            ? `${w(step.player)}的${SLOT_ZH[step.slot]}角色 ${card} 轉為 Rest。`
            : `${w(step.player)}的${SLOT_ZH[step.slot]}角色 ${card} 轉為 Stand。`;
      return { title: step.to === 'REVERSE' ? '角色 Reverse' : step.to === 'REST' ? 'Rest' : 'Stand', lines: [text], player: step.player, cards: [], major: step.to === 'REVERSE' };
    }
    case 'PLAY': {
      const kind = step.cardKind === 'CHARACTER' ? `登場角色到${step.slot ? SLOT_ZH[step.slot] : '舞台'}` : step.cardKind === 'EVENT' ? '使用 Event' : '放置 Climax';
      return { title: `${w(step.player)}${kind}`, lines: [`${w(step.player)}${kind}：${nameOf(step.cardId)}。`], player: step.player, cards: [{ cardId: step.cardId }], sourceCardId: step.cardId, major: true };
    }
    case 'ABILITY': {
      const info = cardInfo(step.cardId);
      const text = info.abilityText.length > step.ability && step.ability >= 0 ? info.abilityText[step.ability] : null;
      return {
        title: '能力發動',
        lines: [`${w(step.player)}的 ${nameOf(step.cardId)} 的能力發動。`, ...(text ? [`效果原文：${text}`] : [])],
        player: step.player,
        cards: [{ cardId: step.cardId }],
        sourceCardId: step.cardId,
        major: true,
      };
    }
    case 'MOVE': {
      const from = `${w(step.from.player)}的${ZONE_ZH[step.from.zone as keyof typeof ZONE_ZH] ?? step.from.zone}`;
      const to = `${w(step.to.player)}的${ZONE_ZH[step.to.zone as keyof typeof ZONE_ZH] ?? step.to.zone}`;
      const seen = step.cards.filter((c) => c.cardId);
      const names = seen.length > 0 ? `：${seen.map((c) => nameOf(c.cardId)).join('、')}` : '';
      const reason = MOVE_REASON_ZH[step.reason] ?? step.reason;
      return { title: '卡牌移動', lines: [`${step.cards.length} 張卡由${from}移到${to}${names}。原因：${reason}。`], player: step.to.player, cards: seen, major: false };
    }
    case 'LEVEL_UP':
      return {
        title: `${w(step.player)} Level Up`,
        lines: [`${w(step.player)}的 Clock 滿 7 張：選 1 張${step.card?.cardId ? ` ${nameOf(step.card.cardId)} ` : ''}放到 Level 置場，其餘 6 張放到控え室。現在是 Level ${step.level}。${step.level >= 4 ? 'Level 4 即落敗。' : ''}`],
        player: step.player,
        cards: step.card ? [step.card] : [],
        major: true,
      };
    case 'REFRESH':
      return {
        title: `${w(step.player)} Refresh`,
        lines: [`${w(step.player)}的山札用完：控え室的 ${step.cards} 張洗勻成為新的山札，然後受 1 點懲罰（山札頂 1 張直接放到 Clock，不能 Cancel）。`],
        player: step.player,
        cards: step.penalty ? [step.penalty] : [],
        major: true,
      };
    case 'END':
      return { title: '遊戲結束', lines: ['遊戲結束，結果見右方（手機在下方）。'], player: null, cards: [], major: true };
  }
}

export { PHASE_ZH };
