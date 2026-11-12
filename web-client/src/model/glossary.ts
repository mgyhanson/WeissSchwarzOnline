/**
 * 術語解釋. Written for this project in our own words (not a translation of
 * the rules), with the rule numbers of the official Comprehensive Rules
 * (JP ver. 1.114) to look up. Unofficial.
 */

export interface Term {
  id: string;
  /** Name as shown in the interface, with the Japanese term where it differs. */
  name: string;
  group: '區域' | '卡牌' | '回合流程' | '攻擊' | '規則處理' | '關鍵字';
  text: string;
  rules: string[];
}

export const GLOSSARY: readonly Term[] = [
  { id: 'deck', name: '山札（Deck）', group: '區域', text: '自己的牌堆，背面向上。任何人（包括自己）都不可以查看內容或改變次序，只有張數是公開的。', rules: ['CR-3.2'] },
  { id: 'hand', name: '手牌（Hand）', group: '區域', text: '只有自己可以看到。回合結束時手牌超過 7 張，要選卡放到控え室直至剩 7 張。', rules: ['CR-3.3', 'CR-6.8.1.2'] },
  { id: 'waiting-room', name: '控え室（Waiting Room）', group: '區域', text: '相當於棄牌區，所有人都可以查看。山札用完時，控え室的卡會洗回山札（Refresh）。', rules: ['CR-3.4'] },
  { id: 'clock', name: 'Clock', group: '區域', text: '受到的傷害會放到這裡，相當於生命值的消耗。累積到 7 張就會 Level Up。Clock 的卡的顏色可以用來滿足顏色條件。', rules: ['CR-3.8', 'CR-9.3'] },
  { id: 'level', name: 'Level 置場', group: '區域', text: '放在這裡的張數就是玩家的 Level。Level 決定可以使用哪些卡；Level 達到 4 就輸掉遊戲。', rules: ['CR-3.9', 'CR-1.2.2.1'] },
  { id: 'stock', name: 'Stock', group: '區域', text: '支付費用用的資源。攻擊時 Trigger Check 翻出的卡會背面放到這裡。支付時由最上面的卡開始放到控え室。任何人都不可以查看內容。', rules: ['CR-3.10', 'CR-8.4.3'] },
  { id: 'climax-zone', name: 'Climax 置場', group: '區域', text: '放置 Climax 卡的地方，原則上只有 1 張。Climax 在回合結束時放到控え室。', rules: ['CR-3.11', 'CR-6.8.1.3'] },
  { id: 'stage', name: '舞台（Stage）', group: '區域', text: '放角色的地方，分前列 3 個枠及後列 2 個枠。只有前列的角色可以攻擊；後列的角色通常以「應援」等能力支援前列。', rules: ['CR-3.6'] },
  { id: 'memory', name: 'Memory（思い出）', group: '區域', text: '被效果放到這裡的卡會留到遊戲結束。表向的卡公開。', rules: ['CR-3.12'] },
  { id: 'resolution', name: '解決領域', group: '區域', text: '處理中的卡暫時放的地方，例如使用中的 Event、Trigger Check 翻出的卡、傷害翻出的卡。', rules: ['CR-3.13'] },

  { id: 'card-level', name: 'Level（卡牌）', group: '卡牌', text: '使用這張卡所需的 Level。卡的 Level 不可以高過玩家的 Level（Climax 除外）。', rules: ['CR-2.6', 'CR-8.6.2.1.2'] },
  { id: 'cost', name: 'Cost', group: '卡牌', text: '使用這張卡要由 Stock 支付的張數。', rules: ['CR-2.7'] },
  { id: 'power', name: 'Power', group: '卡牌', text: '角色在戰鬥中比較的數值。正面攻擊時 Power 較低的角色會 Reverse；相同則雙方都 Reverse。', rules: ['CR-2.9', 'CR-7.6.1.2'] },
  { id: 'soul', name: 'Soul', group: '卡牌', text: '角色攻擊時造成的傷害點數。', rules: ['CR-2.10', 'CR-7.5.1.2'] },
  { id: 'color', name: '顏色條件', group: '卡牌', text: '使用 Level 1 或以上的角色及 Event，自己的 Level 置場或 Clock 要有同色的卡。Level 0 的卡及 Climax 不需要。', rules: ['CR-8.6.2.1.1'] },
  { id: 'climax', name: 'Climax 卡', group: '卡牌', text: '在 Climax 階段放置，通常整個回合強化我方角色。Climax 也是傷害的「Cancel」來源。', rules: ['CR-2.3', 'CR-6.6'] },
  { id: 'counter', name: 'Counter', group: '卡牌', text: '有 Counter 圖示的卡或能力，可以在對手正面攻擊時的 Counter 步驟使用。', rules: ['CR-2.8.2', 'CR-7.4'] },
  { id: 'trigger', name: 'Trigger 圖示', group: '卡牌', text: '攻擊時 Trigger Check 翻出的卡上的圖示會被執行，例如 Soul（這次攻擊 Soul +1）、門（從控え室回收角色）、風（把對手角色返回手牌）。', rules: ['CR-4.14'] },

  { id: 'phase-stand', name: 'Stand 階段', group: '回合流程', text: '回合開始，把自己所有角色回復到 Stand 狀態。', rules: ['CR-6.2'] },
  { id: 'phase-draw', name: '抽牌階段', group: '回合流程', text: '抽 1 張。先攻玩家的第一回合也會抽。', rules: ['CR-6.3'] },
  { id: 'phase-clock', name: 'Clock 階段', group: '回合流程', text: '可以選 1 張手牌放到 Clock，然後抽 2 張；也可以不放。', rules: ['CR-6.4'] },
  { id: 'phase-main', name: '主要階段', group: '回合流程', text: '可以任意次序登場角色、使用 Event、使用起動能力及交換舞台上角色的位置。', rules: ['CR-6.5'] },
  { id: 'phase-climax', name: 'Climax 階段', group: '回合流程', text: '可以從手牌放 1 張 Climax。', rules: ['CR-6.6'] },
  { id: 'phase-attack', name: '攻擊階段', group: '回合流程', text: '前列 Stand 狀態的角色可以逐一攻擊。先攻玩家的第一回合只可以攻擊一次。', rules: ['CR-7.1', 'CR-7.2.1.3.1.2'] },
  { id: 'phase-end', name: '結束階段', group: '回合流程', text: '處理手牌上限、Climax 放到控え室，「回合結束前」的效果消失，然後輪到對手。', rules: ['CR-6.8'] },
  { id: 'until-next-opponent-turn', name: '直到下一個對手回合結束（次の相手のターンの終わりまで）', group: '回合流程', text: '效果一直持續到下一個對手回合的結束階段，所以對手攻擊時仍然有效；之後在自己的回合開始前消失。', rules: ['CR-8.2.1.2', 'CR-6.8.1.4'] },

  { id: 'front-attack', name: '正面攻擊（Front Attack）', group: '攻擊', text: '攻擊正面的對手角色。對手可以在 Counter 步驟回應，之後雙方比較 Power。', rules: ['CR-7.2.1.4'] },
  { id: 'side-attack', name: '側面攻擊（Side Attack）', group: '攻擊', text: '不戰鬥，但這次攻擊的 Soul 減去正面角色的 Level。', rules: ['CR-7.2.1.4.2'] },
  { id: 'direct-attack', name: '直接攻擊（Direct Attack）', group: '攻擊', text: '正面沒有角色時的攻擊，這次攻擊 Soul +1。', rules: ['CR-7.2.1.4.1'] },
  { id: 'trigger-check', name: 'Trigger Check', group: '攻擊', text: '攻擊時翻開自己山札頂 1 張，執行它的 Trigger 圖示，然後背面放到 Stock。', rules: ['CR-7.3'] },
  { id: 'damage', name: '傷害及 Cancel', group: '攻擊', text: '受到 N 點傷害時，從自己山札頂逐張翻開。翻到 Climax 即「Cancel」：這次翻開的卡全部放到控え室，不受傷害。否則 N 張全部放到 Clock。', rules: ['CR-4.12'] },
  { id: 'reverse', name: 'Stand／Rest／Reverse', group: '攻擊', text: '角色的三種狀態：直放（Stand，可以攻擊）、橫放（Rest，已攻擊）、倒轉（Reverse，戰敗）。Reverse 的角色在 Encore 步驟放到控え室。', rules: ['CR-4.6', 'CR-7.7'] },
  { id: 'encore', name: 'Encore（アンコール）', group: '攻擊', text: '角色由舞台放到控え室時，可以支付 3 Stock，把它以 Rest 狀態放回原本的枠。有些卡有其他費用的 Encore。', rules: ['CR-10.2'] },

  { id: 'refresh', name: 'Refresh', group: '規則處理', text: '山札沒有卡時，控え室的卡洗回山札，然後立即受 1 點懲罰（山札頂 1 張放到 Clock，不能 Cancel）。', rules: ['CR-9.2'] },
  { id: 'level-up', name: 'Level Up', group: '規則處理', text: 'Clock 有 7 張時，選其中 1 張放到 Level 置場，其餘 6 張放到控え室。', rules: ['CR-9.3'] },
  { id: 'lose', name: '勝負', group: '規則處理', text: 'Level 達到 4、或山札及控え室都沒有卡時輸掉遊戲。雙方同時輸掉是和局。任何時候都可以投降。', rules: ['CR-1.2'] },

  { id: 'assist', name: '應援（応援）', group: '關鍵字', text: '放在後列時，強化在它前面的我方角色。後列左支援前列左及前列中央，後列右支援前列中央及前列右。', rules: ['CR-10.3'] },
  { id: 'backup', name: '助太刀', group: '關鍵字', text: '在對手正面攻擊時的 Counter 步驟，從手牌支付費用使用，被攻擊的角色 Power 上升。要符合卡上寫的 Level。', rules: ['CR-10.5'] },
  { id: 'brainstorm', name: '集中', group: '關鍵字', text: '翻開山札頂若干張放到控え室，按翻到的卡（通常是 Climax）的張數得到效果。', rules: ['CR-10.7'] },
  { id: 'change', name: 'Change（チェンジ）', group: '關鍵字', text: '把這張卡換成指定的另一張卡，放到同一個枠。', rules: ['CR-10.8'] },
  { id: 'cx-combo', name: 'CX Combo', group: '關鍵字', text: '指定的 Climax 在 Climax 置場時才有效的能力。', rules: [] },
  { id: 'alarm', name: 'アラーム', group: '關鍵字', text: '這張卡在自己 Clock 最上面時才有作用的能力。在舞台上、或被其他 Clock 的卡蓋住時都沒有作用。', rules: ['CR-10.1'] },
  { id: 'experience', name: '経験', group: '關鍵字', text: '計算自己 Level 置場的卡本身的 Level 合計（不是張數）。合計達到卡上寫的數值，能力才有效。', rules: ['CR-10.10'] },
  { id: 'memory-keyword', name: '記憶', group: '關鍵字', text: '自己的思い出置場有指定的卡時才有效的能力。', rules: ['CR-10.9'] },
  { id: 'accelerate', name: '加速', group: '關鍵字', text: '把自己山札頂 1 張直接放到 Clock 作為費用，換取強化。這不是傷害，不能 Cancel；Clock 滿 7 張同樣會 Level Up。', rules: ['CR-10.12'] },
];

export function term(id: string): Term | undefined {
  return GLOSSARY.find((t) => t.id === id);
}
