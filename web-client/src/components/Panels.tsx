import { useEffect, useMemo, useRef } from 'react';
import type { Choice, GameEventView, PlayerId } from '@wso/game-engine';
import { logLines } from '../model/log';
import { cardInfo } from '../model/cards';
import type { DecisionUi, PickCard } from '../model/options';
import type { RevealRecord } from '../presentation/queue';
import { CardFace } from './CardFace';

function PickList({ cards, picked, onToggle, onInfo }: { cards: PickCard[]; picked?: readonly number[]; onToggle?: (id: number) => void; onInfo: (cardId: string) => void }) {
  return (
    <div className="pick-list">
      {cards.map((card) => (
        <div key={`${card.objectId}-${card.cardId}`} className="pick-item">
          <CardFace
            cardId={card.cardId}
            size="small"
            selected={picked?.includes(card.objectId)}
            active={!!onToggle}
            onClick={onToggle ? () => onToggle(card.objectId) : card.cardId ? () => onInfo(card.cardId!) : undefined}
          />
          <span className="pick-where">{card.where}</span>
          {onToggle && card.cardId && (
            <button type="button" className="link-button" onClick={() => onInfo(card.cardId!)}>
              詳情
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function DecisionPanel({
  ui,
  picked,
  setPicked,
  onChoice,
  onInfo,
}: {
  ui: DecisionUi;
  picked: number[];
  setPicked: (ids: number[]) => void;
  onChoice: (choice: Choice) => void;
  onInfo: (cardId: string) => void;
}) {
  const pick = ui.pick;
  const toggle = (id: number) => {
    if (!pick) return;
    if (picked.includes(id)) setPicked(picked.filter((p) => p !== id));
    else if (pick.max === 1) setPicked([id]);
    else if (picked.length < pick.max) setPicked([...picked, id]);
  };
  const canConfirm = !!pick && picked.length >= pick.min && picked.length <= pick.max;
  const actionCards = ui.cardActions.size;

  return (
    <div className="decision">
      <h2 className="decision-title">{ui.title}</h2>
      <p className="decision-hint">{ui.hint}</p>
      {actionCards > 0 && <p className="decision-sub">有 {actionCards} 張卡可以行動（發光的卡）。</p>}
      {ui.ability && (
        <blockquote className="ability-text" lang="ja">
          {ui.ability.text}
        </blockquote>
      )}
      {ui.shown.length > 0 && (
        <>
          <p className="decision-sub">相關的卡：</p>
          <PickList cards={ui.shown} onInfo={onInfo} />
        </>
      )}
      {pick && (
        <>
          <PickList cards={pick.cards} picked={picked} onToggle={toggle} onInfo={onInfo} />
          <div className="decision-buttons">
            <button type="button" className="button primary" disabled={!canConfirm} onClick={() => onChoice(pick.confirm(picked))}>
              {pick.confirmLabel(picked)}
            </button>
            {pick.min === 0 && picked.length > 0 && (
              <button type="button" className="button" onClick={() => setPicked([])}>
                清除選擇
              </button>
            )}
          </div>
        </>
      )}
      {ui.buttons.length > 0 && (
        <div className="decision-buttons">
          {ui.buttons.map((button) => (
            <button key={button.key} type="button" className={`button ${button.tone === 'primary' ? 'primary' : ''}`} onClick={() => onChoice(button.choice)}>
              {button.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function LogPanel({ events, seat }: { events: readonly GameEventView[]; seat: PlayerId }) {
  const lines = useMemo(() => logLines(events, seat), [events, seat]);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [lines.length]);
  return (
    <div className="log" aria-label="對局紀錄" aria-live="polite">
      {lines.map((line) => (
        <p key={line.seq} className={`log-line log-${line.kind}`}>
          {line.text}
          {line.count > 1 && <span className="log-count"> ×{line.count}</span>}
        </p>
      ))}
      <div ref={end} />
    </div>
  );
}

/** Cards revealed so far (newest first). Only cards the reveal showed to this player; click a name for details. */
export function RevealHistory({ records, onCard }: { records: readonly RevealRecord[]; onCard: (cardId: string) => void }) {
  if (records.length === 0) return null;
  return (
    <details className="reveal-history">
      <summary>已揭示的卡（{records.length}）</summary>
      <ul>
        {[...records].reverse().map((record) => (
          <li key={`${record.kind}-${record.seq}`}>
            <span className="muted">{record.note}：</span>
            {record.cards.map((card, i) =>
              card.cardId ? (
                <button key={i} type="button" className="link-button" onClick={() => onCard(card.cardId!)}>
                  「{cardInfo(card.cardId).name}」
                </button>
              ) : (
                <span key={i} className="muted">
                  （看不到的卡）
                </span>
              ),
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
