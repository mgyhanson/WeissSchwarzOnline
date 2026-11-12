/**
 * Turns the pending decision into what the interface offers: buttons, card
 * actions and card picks. Every offer produces a Choice built only from the
 * decision itself, so the interface can never send something the engine did
 * not list as legal (tests/options.test.ts checks this over whole games).
 */

import type { Choice, Decision, MainAction, PlayerView, SlotId } from '@wso/game-engine';
import { abilityText, cardInfo } from './cards';
import { ATTACK_ZH, OPTION_ZH, PROMPT_ZH, RULE_ACTION_ZH, SLOT_ZH } from './text';
import { cardInSlot, findCard, whereLabel } from './view';

export interface UiButton {
  key: string;
  label: string;
  choice: Choice;
  tone?: 'primary' | 'neutral';
}

export interface PickCard {
  objectId: number;
  /** Null only if the card cannot be identified from the view (should not happen; tests check). */
  cardId: string | null;
  where: string;
}

export interface CardPick {
  cards: PickCard[];
  min: number;
  max: number;
  confirm: (selected: number[]) => Choice;
  confirmLabel: (selected: number[]) => string;
}

export interface DecisionUi {
  title: string;
  hint: string;
  buttons: UiButton[];
  pick: CardPick | null;
  /** Actions offered on a card, by object id. Cards with actions are highlighted. */
  cardActions: Map<number, UiButton[]>;
  /** Own slots to highlight. */
  slots: SlotId[];
  /** Cards shown for information (the card a question is about, cards being looked at). */
  shown: PickCard[];
  /** The ability a question is about. */
  ability?: { cardId: string | null; text: string };
}

function base(title: string, hint: string): DecisionUi {
  return { title, hint, buttons: [], pick: null, cardActions: new Map(), slots: [], shown: [] };
}

function addCardAction(ui: DecisionUi, objectId: number, button: UiButton): void {
  const list = ui.cardActions.get(objectId) ?? [];
  list.push(button);
  ui.cardActions.set(objectId, list);
}

export function pickCard(view: PlayerView, objectId: number, look?: Record<number, string>): PickCard {
  const found = findCard(view, objectId);
  if (found) return { objectId, cardId: found.card.cardId, where: whereLabel(found, view.viewer) };
  const looked = look?.[objectId];
  return { objectId, cardId: looked ?? null, where: looked ? '山札（只有你看到）' : '不明' };
}

export function cardName(view: PlayerView, objectId: number, look?: Record<number, string>): string {
  const id = pickCard(view, objectId, look).cardId;
  return id ? `「${cardInfo(id).name}」` : '（不明卡牌）';
}

/** The buttons for one main phase action, with the cards they are offered on (none: a general button). */
function mainActionButtons(view: PlayerView, action: MainAction, index: number): { card: number | null; button: UiButton }[] {
  const key = `main-${index}`;
  const choice: Choice = { kind: 'MAIN', action };
  switch (action.type) {
    case 'PLAY_CHARACTER': {
      const occupant = cardInSlot(view, view.viewer, action.slot);
      const replace = occupant ? `（取代${cardName(view, occupant.objectId)}）` : '';
      return [{ card: action.card, button: { key, label: `登場到${SLOT_ZH[action.slot]}${replace}`, choice, tone: 'primary' } }];
    }
    case 'PLAY_EVENT':
      return [{ card: action.card, button: { key, label: '使用這張 Event', choice, tone: 'primary' } }];
    case 'ACTIVATE': {
      const found = findCard(view, action.card);
      const text = found ? abilityText(found.card.cardId, action.ability) : '';
      return [{ card: action.card, button: { key, label: `起動能力：${text}`, choice, tone: 'primary' } }];
    }
    case 'SWAP': {
      // Offered on each card that would move.
      const offers: { card: number | null; button: UiButton }[] = [];
      for (const [from, to] of [[action.a, action.b], [action.b, action.a]] as const) {
        const mover = cardInSlot(view, view.viewer, from);
        if (!mover) continue;
        const other = cardInSlot(view, view.viewer, to);
        const label = other ? `與${SLOT_ZH[to]}${cardName(view, other.objectId)}交換位置` : `移動到${SLOT_ZH[to]}`;
        offers.push({ card: mover.objectId, button: { key: `${key}-${from}`, label, choice } });
      }
      return offers;
    }
    case 'PASS':
      return [{ card: null, button: { key, label: '結束主要階段', choice, tone: 'primary' } }];
  }
}

/** The interface for one pending decision of the viewer. */
export function decisionUi(view: PlayerView, decision: Decision): DecisionUi {
  switch (decision.kind) {
    case 'MULLIGAN': {
      const ui = base('換牌', '選擇要換掉的手牌（可以不換）。選中的卡放到控え室，然後抽同樣張數。');
      ui.pick = {
        cards: decision.cards.map((id) => pickCard(view, id)),
        min: 0,
        max: decision.cards.length,
        confirm: (selected) => ({ kind: 'MULLIGAN', discard: selected }),
        confirmLabel: (selected) => (selected.length === 0 ? '不換牌' : `換掉 ${selected.length} 張`),
      };
      return ui;
    }
    case 'CLOCK': {
      const ui = base('Clock 階段', '可以把 1 張手牌放到 Clock，然後抽 2 張；也可以不放。');
      ui.pick = {
        cards: decision.cards.map((id) => pickCard(view, id)),
        min: 0,
        max: 1,
        confirm: (selected) => ({ kind: 'CLOCK', card: selected[0] ?? null }),
        confirmLabel: (selected) => (selected.length === 0 ? '不放 Clock' : '放到 Clock 並抽 2 張'),
      };
      return ui;
    }
    case 'MAIN': {
      const ui = base('主要階段', '點選發光的手牌或角色，查看可以執行的行動。完成後按「結束主要階段」。');
      decision.actions.forEach((action, index) => {
        for (const { card, button } of mainActionButtons(view, action, index)) {
          if (card === null) ui.buttons.push(button);
          else addCardAction(ui, card, button);
        }
      });
      return ui;
    }
    case 'CLIMAX': {
      const ui = base('Climax 階段', '可以從手牌放 1 張 Climax 到 Climax 置場。');
      ui.pick = {
        cards: decision.cards.map((id) => pickCard(view, id)),
        min: 0,
        max: 1,
        confirm: (selected) => ({ kind: 'CLIMAX', card: selected[0] ?? null }),
        confirmLabel: (selected) => (selected.length === 0 ? '不放 Climax' : '放置這張 Climax'),
      };
      return ui;
    }
    case 'ATTACK': {
      const ui = base('攻擊階段', '選擇攻擊的角色及攻擊方式，或結束攻擊。');
      decision.attacks.forEach((option, index) => {
        const found = findCard(view, option.attacker);
        const slot = found?.slot ? SLOT_ZH[found.slot] : '';
        const button: UiButton = {
          key: `attack-${index}`,
          label: `${slot}${cardName(view, option.attacker)}：${ATTACK_ZH[option.type]}`,
          choice: { kind: 'ATTACK', attack: { attacker: option.attacker, type: option.type } },
          tone: 'primary',
        };
        ui.buttons.push(button);
        addCardAction(ui, option.attacker, { ...button, label: ATTACK_ZH[option.type] });
      });
      ui.buttons.push({ key: 'attack-end', label: '結束攻擊', choice: { kind: 'ATTACK', attack: null } });
      return ui;
    }
    case 'COUNTER': {
      const ui = base('Counter 步驟', '對手正在攻擊。可以使用 1 張 Counter 卡或助太刀，也可以不使用。');
      decision.cards.forEach((card, index) => {
        const button: UiButton = { key: `counter-${index}`, label: `使用 Counter ${cardName(view, card)}`, choice: { kind: 'COUNTER', card }, tone: 'primary' };
        ui.buttons.push(button);
        addCardAction(ui, card, { ...button, label: '使用這張 Counter' });
      });
      decision.backups.forEach((option, index) => {
        const button: UiButton = {
          key: `backup-${index}`,
          label: `助太刀 ${cardName(view, option.card)}`,
          choice: { kind: 'COUNTER', card: option.card, ability: option.ability },
          tone: 'primary',
        };
        ui.buttons.push(button);
        addCardAction(ui, option.card, { ...button, label: '使用助太刀' });
      });
      ui.buttons.push({ key: 'counter-none', label: '不使用', choice: { kind: 'COUNTER', card: null } });
      return ui;
    }
    case 'LEVEL_UP': {
      const ui = base('Level Up', 'Clock 達到 7 張。選 1 張放到 Level 置場，其餘 6 張放到控え室。');
      ui.pick = {
        cards: decision.cards.map((id) => pickCard(view, id)),
        min: 1,
        max: 1,
        confirm: (selected) => ({ kind: 'LEVEL_UP', card: selected[0]! }),
        confirmLabel: () => '放到 Level 置場',
      };
      return ui;
    }
    case 'HAND_LIMIT': {
      const ui = base('手牌上限', `手牌超過 7 張。請選 ${decision.count} 張放到控え室。`);
      ui.pick = {
        cards: decision.cards.map((id) => pickCard(view, id)),
        min: decision.count,
        max: decision.count,
        confirm: (selected) => ({ kind: 'HAND_LIMIT', discard: selected }),
        confirmLabel: (selected) => `放到控え室（${selected.length}/${decision.count}）`,
      };
      return ui;
    }
    case 'RULE_ACTION_ORDER': {
      const ui = base('規則處理的次序', 'Refresh 及 Level Up 同時要處理，請選擇先處理哪一個。');
      ui.buttons = decision.options.map((first) => ({ key: `rule-${first}`, label: RULE_ACTION_ZH[first], choice: { kind: 'RULE_ACTION_ORDER', first } }));
      return ui;
    }
    case 'CHOOSE_ABILITY': {
      const ui = base('能力的處理次序', '有多個自動能力同時待機，請選擇先處理哪一個。');
      ui.buttons = decision.abilities.map((option) => {
        const cardId = option.cardId ?? (option.card !== undefined ? pickCard(view, option.card).cardId : null);
        const name = cardId ? `「${cardInfo(cardId).name}」` : '';
        const label =
          option.type === 'ENCORE'
            ? `Encore ${name}`
            : option.type === 'SHOT'
              ? 'Shot Trigger 的傷害'
              : `${name}${option.granted ? '（被給予的能力）' : `：${cardId ? abilityText(cardId, option.ability) : `能力 ${(option.ability ?? 0) + 1}`}`}`;
        return { key: `ability-${option.id}`, label, choice: { kind: 'CHOOSE_ABILITY', id: option.id } };
      });
      return ui;
    }
    case 'CONFIRM': {
      const ui = base('確認', PROMPT_ZH[decision.prompt]);
      const cardId = decision.cardId ?? (decision.card !== undefined ? pickCard(view, decision.card).cardId : null);
      if (decision.card !== undefined) ui.shown.push(pickCard(view, decision.card));
      else if (cardId) ui.shown.push({ objectId: -1, cardId, where: '' });
      if (decision.ability !== undefined || decision.prompt === 'ENCORE') {
        ui.ability = {
          cardId,
          text: decision.prompt === 'ENCORE' ? 'Encore［(3)］：這張角色由舞台放到控え室時，可以支付 3 Stock，把它以 Rest 狀態放回原本的枠。' : cardId ? abilityText(cardId, decision.ability) : '',
        };
      }
      if (decision.look) {
        for (const id of Object.keys(decision.look)) ui.shown.push(pickCard(view, Number(id), decision.look));
      }
      ui.buttons = [
        { key: 'yes', label: '是', choice: { kind: 'CONFIRM', accept: true }, tone: 'primary' },
        { key: 'no', label: '否', choice: { kind: 'CONFIRM', accept: false } },
      ];
      return ui;
    }
    case 'SELECT_CARDS': {
      const ui = base('選擇卡牌', PROMPT_ZH[decision.prompt]);
      const range = decision.min === decision.max ? `${decision.min}` : `${decision.min} 至 ${decision.max}`;
      ui.hint += `（選 ${range} 張）`;
      ui.pick = {
        cards: decision.cards.map((id) => pickCard(view, id, decision.look)),
        min: decision.min,
        max: decision.max,
        confirm: (selected) => ({ kind: 'SELECT_CARDS', cards: selected }),
        confirmLabel: (selected) => (selected.length === 0 ? '不選' : `確定（${selected.length} 張）`),
      };
      if (decision.look) {
        // Cards being looked at that cannot be chosen are still shown (CR-4.8.1).
        for (const id of Object.keys(decision.look).map(Number)) {
          if (!decision.cards.includes(id)) ui.shown.push(pickCard(view, id, decision.look));
        }
      }
      return ui;
    }
    case 'SELECT_SLOT': {
      const ui = base('選擇枠', PROMPT_ZH[decision.prompt]);
      ui.slots = [...decision.slots];
      ui.buttons = decision.slots.map((slot) => {
        const occupant = cardInSlot(view, view.viewer, slot);
        return {
          key: `slot-${slot}`,
          label: `${SLOT_ZH[slot]}${occupant ? `（現有${cardName(view, occupant.objectId)}）` : '（空）'}`,
          choice: { kind: 'SELECT_SLOT', slot },
        };
      });
      return ui;
    }
    case 'SELECT_OPTION': {
      const ui = base('選擇', PROMPT_ZH[decision.prompt]);
      ui.buttons = decision.options.map((option) => ({ key: `option-${option}`, label: OPTION_ZH[option] ?? option, choice: { kind: 'SELECT_OPTION', option } }));
      return ui;
    }
  }
}

/** What the other player is doing, for the waiting message. */
export function waitingText(kind: Decision['kind']): string {
  switch (kind) {
    case 'MULLIGAN':
      return '對手正在換牌…';
    case 'CLOCK':
      return '對手正在決定是否放 Clock…';
    case 'MAIN':
      return '對手的主要階段…';
    case 'CLIMAX':
      return '對手正在決定是否放 Climax…';
    case 'ATTACK':
      return '對手正在選擇攻擊…';
    case 'COUNTER':
      return '對手正在決定是否使用 Counter…';
    default:
      return '對手正在作出選擇…';
  }
}
