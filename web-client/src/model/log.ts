/**
 * The game log in Chinese, written from the events one player received
 * (already redacted by the engine). Moves the player could not see are only
 * described by zone, never by card.
 */

import type { GameEventView, LossReason, PlayerId } from '@wso/game-engine';
import { cardInfo } from './cards';
import { ATTACK_STEP_ZH, ATTACK_ZH, PHASE_ZH, SLOT_ZH, TRIGGER_ZH, ZONE_ZH, who } from './text';

export interface LogLine {
  /** Sequence number of the first event the line describes. */
  seq: number;
  text: string;
  kind: 'turn' | 'phase' | 'action' | 'attack' | 'damage' | 'result' | 'info';
  count: number;
}

const LOSS_ZH: Record<LossReason, string> = {
  LEVEL_4: '達到 Level 4',
  NO_CARDS: '山札及控え室都沒有卡',
  RESIGNED: '投降',
};

function name(cardId: string): string {
  try {
    return `「${cardInfo(cardId).name}」`;
  } catch {
    return `「${cardId}」`;
  }
}

/** One event as a log line, or null for events not worth a line of their own. */
export function describe(event: GameEventView, seat: PlayerId): Omit<LogLine, 'count'> | null {
  const line = (text: string, kind: LogLine['kind']): Omit<LogLine, 'count'> => ({ seq: event.seq, text, kind });
  switch (event.type) {
    case 'GAME_STARTED':
      return line(`遊戲開始。先攻：${who(event.firstPlayer, seat)}`, 'turn');
    case 'TURN_STARTED':
      return line(`第 ${event.turn} 回合（${who(event.player, seat)}）`, 'turn');
    case 'PHASE_STARTED':
      return line(PHASE_ZH[event.phase], 'phase');
    case 'STEP_STARTED':
      return event.step === 'ATTACK_DECLARATION' || event.step === 'ENCORE' ? line(ATTACK_STEP_ZH[event.step], 'phase') : null;
    case 'CARD_PLAYED': {
      const paid = event.stockPaid > 0 ? `（支付 ${event.stockPaid} Stock）` : '';
      if (event.cardKind === 'CHARACTER') return line(`${who(event.player, seat)}登場${name(event.cardId)}到${event.slot ? SLOT_ZH[event.slot] : '舞台'}${paid}`, 'action');
      if (event.cardKind === 'CLIMAX') return line(`${who(event.player, seat)}放置 Climax ${name(event.cardId)}`, 'action');
      return line(`${who(event.player, seat)}使用 Event ${name(event.cardId)}${paid}`, 'action');
    }
    case 'ABILITY_PLAYED':
      return line(`${name(event.cardId)}的能力發動`, 'action');
    case 'ATTACK_DECLARED':
      return line(`${who(event.player, seat)}的${SLOT_ZH[event.attackerSlot]}角色${ATTACK_ZH[event.attackType]}`, 'attack');
    case 'TRIGGER_CHECK': {
      const icons = event.icons.length > 0 ? `，Trigger：${event.icons.map((icon) => TRIGGER_ZH[icon]).join('、')}` : '，沒有 Trigger 圖示';
      return line(`Trigger Check 翻出${name(event.cardId)}${icons}`, 'attack');
    }
    case 'DAMAGE_DEALT':
      return event.cancelled
        ? line(`${who(event.receiver, seat)}的 ${event.amount} 點傷害被 Cancel`, 'damage')
        : line(`${who(event.receiver, seat)}受到 ${event.amount} 點傷害`, 'damage');
    case 'LEVEL_UP':
      return line(`${who(event.player, seat)}升到 Level ${event.level}`, 'damage');
    case 'REFRESH':
      return line(`${who(event.player, seat)}的山札 Refresh（控え室洗回山札，之後受 1 點 Refresh 懲罰）`, 'damage');
    case 'DECK_SHUFFLED':
      return line(`${who(event.player, seat)}洗山札`, 'info');
    case 'CARD_REVEALED':
      return line(`公開${name(event.cardId)}`, 'info');
    case 'ORIENTATION_CHANGED':
      return event.to === 'REVERSE' ? line(`${who(event.player, seat)}的${SLOT_ZH[event.slot]}角色 Reverse`, 'attack') : null;
    case 'GAME_ENDED': {
      const result = event.result;
      if (result.outcome === 'DRAW') return line('遊戲結束：和局（雙方同時落敗）', 'result');
      return line(`遊戲結束：${who(result.winner, seat)}勝出（${who(result.loser, seat)}${LOSS_ZH[result.reason]}）`, 'result');
    }
    case 'CARD_MOVED': {
      const mover = who(event.to.player, seat);
      const card = event.card ? name(event.card.cardId) : '1 張卡';
      switch (event.reason) {
        case 'DRAW':
          return line(`${mover}抽 1 張`, 'info');
        case 'MULLIGAN':
          return event.to.zone === 'waitingRoom' ? line(`${mover}換牌：${card}放到控え室`, 'info') : null;
        case 'CLOCK_PHASE':
          return line(`${mover}把${card}放到 Clock`, 'action');
        case 'ENCORE':
          return line(`${card} Encore，回到${event.to.zone === 'stage' ? SLOT_ZH[event.to.slot] : ZONE_ZH[event.to.zone]}`, 'action');
        case 'ENCORE_STEP':
        case 'RULE_ACTION':
          return event.from.zone === 'stage' ? line(`${card}由舞台放到控え室`, 'attack') : null;
        case 'EFFECT':
        case 'CHANGE':
        case 'TRIGGER': {
          const to = event.to.zone === 'stage' ? SLOT_ZH[event.to.slot] : ZONE_ZH[event.to.zone];
          const from = event.from.zone === 'stage' ? SLOT_ZH[event.from.slot] : ZONE_ZH[event.from.zone];
          const owner = who(event.from.player, seat);
          return line(`${card}：${owner}${from} → ${who(event.to.player, seat)}${to}`, 'action');
        }
        case 'COST':
          return line(`支付費用：${card}由${ZONE_ZH[event.from.zone]}放到${ZONE_ZH[event.to.zone]}`, 'info');
        case 'HAND_LIMIT':
          return line(`${mover}因手牌上限把${card}放到控え室`, 'info');
        default:
          return null;
      }
    }
  }
}

/** Log lines for a list of events, with identical consecutive lines merged ("抽 1 張 ×2"). */
export function logLines(events: readonly GameEventView[], seat: PlayerId): LogLine[] {
  const lines: LogLine[] = [];
  for (const event of events) {
    const line = describe(event, seat);
    if (!line) continue;
    const last = lines[lines.length - 1];
    if (last && last.text === line.text) last.count++;
    else lines.push({ ...line, count: 1 });
  }
  return lines;
}
