/**
 * Chinese labels for engine values. Terms follow the glossary (glossary.ts):
 * Japanese zone names that players use as they are (控え室) stay Japanese,
 * the rest use the English loanwords common in Chinese-speaking communities.
 */

import type { AttackStepName, AttackType, Phase, PileZone, PlayerId, PromptId, RuleActionKind, SlotId, TriggerIcon } from '@wso/game-engine';

export const PHASE_ZH: Record<Phase, string> = {
  STAND: 'Stand 階段',
  DRAW: '抽牌階段',
  CLOCK: 'Clock 階段',
  MAIN: '主要階段',
  CLIMAX: 'Climax 階段',
  ATTACK: '攻擊階段',
  END: '結束階段',
};

export const PHASE_TERM: Record<Phase, string> = {
  STAND: 'phase-stand',
  DRAW: 'phase-draw',
  CLOCK: 'phase-clock',
  MAIN: 'phase-main',
  CLIMAX: 'phase-climax',
  ATTACK: 'phase-attack',
  END: 'phase-end',
};

export const ATTACK_STEP_ZH: Record<AttackStepName, string> = {
  ATTACK_DECLARATION: '攻擊宣言步驟',
  TRIGGER: 'Trigger 步驟',
  COUNTER: 'Counter 步驟',
  DAMAGE: '傷害步驟',
  BATTLE: '戰鬥步驟',
  ENCORE: 'Encore 步驟',
};

export const SLOT_ZH: Record<SlotId, string> = {
  FL: '前列左',
  FC: '前列中央',
  FR: '前列右',
  BL: '後列左',
  BR: '後列右',
};

export const ZONE_ZH: Record<PileZone | 'stage' | 'marker', string> = {
  deck: '山札',
  hand: '手牌',
  waitingRoom: '控え室',
  clock: 'Clock',
  level: 'Level 置場',
  stock: 'Stock',
  climax: 'Climax 置場',
  memory: 'Memory',
  resolution: '解決領域',
  stage: '舞台',
  marker: 'Marker',
};

export const ATTACK_ZH: Record<AttackType, string> = {
  FRONT: '正面攻擊',
  SIDE: '側面攻擊',
  DIRECT: '直接攻擊',
};

/** Trigger icons. Only 門 and 風 are given community nicknames; the others keep their English names. */
export const TRIGGER_ZH: Record<TriggerIcon, string> = {
  SOUL: 'Soul',
  RETURN: '風（Return）',
  POOL: 'Pool',
  COMEBACK: '門（Comeback）',
  DRAW: 'Draw',
  SHOT: 'Shot',
  TREASURE: 'Treasure',
  GATE: 'Gate',
  STANDBY: 'Standby',
  CHOICE: 'Choice',
  CHANCE: 'Chance',
  DISCOVERY: 'Discovery',
  FOCUS: 'Focus',
};

/** Short form for card faces. */
export const TRIGGER_SHORT: Record<TriggerIcon, string> = {
  SOUL: '魂',
  RETURN: '風',
  POOL: 'Pool',
  COMEBACK: '門',
  DRAW: 'Draw',
  SHOT: 'Shot',
  TREASURE: 'Trea',
  GATE: 'Gate',
  STANDBY: 'Stby',
  CHOICE: 'Chc',
  CHANCE: 'Chn',
  DISCOVERY: 'Dsc',
  FOCUS: 'Fcs',
};

export const COLOR_ZH: Record<string, string> = {
  yellow: '黃',
  green: '綠',
  red: '紅',
  blue: '藍',
  purple: '紫',
};

export const KIND_ZH = { CHARACTER: '角色', EVENT: 'Event', CLIMAX: 'Climax' } as const;

export const RULE_ACTION_ZH: Record<RuleActionKind, string> = {
  REFRESH: '先 Refresh（山札重組）',
  LEVEL_UP: '先 Level Up（升級）',
};

/** The question each prompt asks. */
export const PROMPT_ZH: Record<PromptId, string> = {
  ENCORE: '要支付 3 Stock 使用 Encore，把這張角色以 Rest 狀態放回原本的枠嗎？',
  ENCORE_STEP: 'Encore 步驟：選擇下一張要處理的 Reverse 角色。',
  PAY_COST: '要支付費用使用這個能力嗎？',
  USE_ABILITY: '要使用這個能力嗎？',
  EFFECT_CHOOSE: '請按卡牌效果選擇卡牌。',
  COST_DISCARD: '請選擇要作為費用放到控え室的手牌。',
  COST_REST: '請選擇要作為費用 Rest 的角色。',
  COST_HAND_TO_CLOCK: '請選擇要作為費用放到 Clock 的手牌。',
  LOOK_NEXT: '要再查看山札頂的下一張卡嗎？',
  EFFECT_SLOT: '請選擇要把卡放到哪一個枠。',
  TRIGGER_ORDER: '翻出的卡有多個 Trigger 圖示，請選擇先執行哪一個。',
  TRIGGER_RETURN: 'Trigger「風」：可以選對手 1 張角色返回手牌。',
  TRIGGER_POOL: 'Trigger「Pool」：要把山札頂 1 張放到 Stock 嗎？',
  TRIGGER_COMEBACK: 'Trigger「門」：可以從控え室選 1 張角色加入手牌。',
  TRIGGER_DRAW: 'Trigger「Draw」：要抽 1 張嗎？',
  TRIGGER_TREASURE_STOCK: 'Trigger「Treasure」：要把山札頂 1 張放到 Stock 嗎？',
  TRIGGER_GATE: 'Trigger「Gate」：可以從控え室選 1 張 Climax 加入手牌。',
  TRIGGER_STANDBY: 'Trigger「Standby」：可以從控え室選 1 張角色放到舞台。',
  TRIGGER_STANDBY_SLOT: 'Trigger「Standby」：請選擇放置的枠。',
  TRIGGER_CHOICE: 'Trigger「Choice」：可以從控え室選 1 張角色。',
  TRIGGER_CHOICE_DESTINATION: 'Trigger「Choice」：選擇的卡放到哪裡？',
  TRIGGER_CHANCE_REVEAL: 'Trigger「Chance」：要再公開山札頂 1 張嗎？',
  TRIGGER_CHANCE_STOCK: 'Trigger「Chance」：選 1 張放到 Stock。',
  TRIGGER_DISCOVERY_REVEAL: 'Trigger「Discovery」：要再公開山札頂 1 張嗎？',
  TRIGGER_DISCOVERY: 'Trigger「Discovery」：可以選 1 張角色加入手牌。',
  TRIGGER_FOCUS: 'Trigger「Focus」：請作出選擇。',
};

export const OPTION_ZH: Record<string, string> = {
  HAND: '加入手牌',
  STOCK: '放到 Stock',
  ...TRIGGER_ZH,
};

export function who(player: PlayerId, seat: PlayerId): string {
  return player === seat ? '你' : '對手';
}

/** What each trigger icon does when executed (CR-4.14.2), in short. */
export const TRIGGER_EFFECT_ZH: Record<TriggerIcon, string> = {
  SOUL: '攻擊角色該回合 Soul +1',
  RETURN: '可選對手 1 張角色返回手牌',
  POOL: '可把山札頂 1 張放到 Stock',
  COMEBACK: '可從控え室選 1 張角色加入手牌',
  DRAW: '可抽 1 張',
  SHOT: '這次攻擊的下一次傷害被 Cancel 時，給予對手 1 點傷害',
  TREASURE: '這張卡加入手牌，然後可把山札頂 1 張放到 Stock',
  GATE: '可從控え室選 1 張 Climax 加入手牌',
  STANDBY: '可從控え室選 1 張 Level 不高於自己 Level +1 的角色，以 Rest 狀態放到舞台',
  CHOICE: '可從控え室選 1 張有 Soul 圖示的角色，加入手牌或放到 Stock',
  CHANCE: '這張卡放到控え室；公開山札頂最多 2 張，1 張放到 Stock，另 1 張加入手牌',
  DISCOVERY: '公開山札頂最多 3 張，可選其中 1 張角色加入手牌，其餘放到控え室',
  FOCUS: '可從控え室選 1 張 Event 或 Cost 0 或以下的角色加入手牌',
};
