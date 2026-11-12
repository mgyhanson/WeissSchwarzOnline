import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { Choice, PileZone, PlayerId, SlotId } from '@wso/game-engine';
import type { GameHost } from '../host/local';
import { term } from '../model/glossary';
import { decisionUi, waitingText } from '../model/options';
import { ATTACK_STEP_ZH, ATTACK_ZH, PHASE_TERM, PHASE_ZH, SLOT_ZH, ZONE_ZH, who } from '../model/text';
import { Resolution, Side } from './Board';
import { CardFace } from './CardFace';
import { DecisionPanel, LogPanel } from './Panels';
import { CardSheet, Modal, ZoneSheet } from './Sheets';

type Sheet =
  | { type: 'card'; objectId: number | null; cardId: string }
  | { type: 'zone'; side: PlayerId; zone: PileZone }
  | { type: 'term'; id: string }
  | { type: 'log' }
  | { type: 'resign' }
  | null;

const LOSS_TEXT = { LEVEL_4: '達到 Level 4', NO_CARDS: '山札及控え室都沒有卡', RESIGNED: '投降' } as const;

export function Game({ host, onLeave, onNewGame }: { host: GameHost; onLeave: () => void; onNewGame: () => void }) {
  const snapshot = useSyncExternalStore(host.subscribe, host.getSnapshot);
  const { view } = snapshot;
  const seat = host.seat;
  const opponent: PlayerId = seat === 0 ? 1 : 0;
  const [sheet, setSheet] = useState<Sheet>(null);
  const [picked, setPicked] = useState<number[]>([]);

  const decision = view.decision?.mine ? view.decision.decision : null;
  const ui = useMemo(() => (decision ? decisionUi(view, decision) : null), [view, decision]);
  const decisionKey = view.decision ? `${view.decision.mine ? view.decision.decision.id : view.decision.id}` : 'none';

  // A new decision starts with nothing picked and no stale card sheet.
  useEffect(() => {
    setPicked([]);
    setSheet((current) => (current?.type === 'card' ? null : current));
  }, [decisionKey]);

  const choose = (choice: Choice) => {
    setSheet(null);
    host.submit(choice);
  };

  const onCard = (objectId: number, cardId: string) => {
    // During a card pick, tapping a pickable card toggles it.
    if (ui?.pick?.cards.some((c) => c.objectId === objectId)) {
      const pick = ui.pick;
      if (picked.includes(objectId)) setPicked(picked.filter((id) => id !== objectId));
      else if (pick.max === 1) setPicked([objectId]);
      else if (picked.length < pick.max) setPicked([...picked, objectId]);
      return;
    }
    setSheet({ type: 'card', objectId, cardId });
  };

  const onSlot = (slot: SlotId) => {
    const button = ui?.buttons.find((b) => b.choice.kind === 'SELECT_SLOT' && b.choice.slot === slot);
    if (button) choose(button.choice);
  };

  const handlers = { onCard, onZone: (side: PlayerId, zone: PileZone) => setSheet({ type: 'zone', side, zone }), onSlot };
  const turn = view.turn;
  const hand = view.sides[seat].hand;

  return (
    <div className="game">
      <div className="game-bar">
        <div className="turn-info">
          {turn ? (
            <>
              <span className={`turn-owner ${turn.player === seat ? 'mine' : 'theirs'}`}>
                第 {turn.number} 回合・{who(turn.player, seat)}
              </span>
              <button type="button" className="phase-chip" onClick={() => setSheet({ type: 'term', id: PHASE_TERM[turn.phase] })}>
                {PHASE_ZH[turn.phase]} ⓘ
              </button>
            </>
          ) : (
            <span>準備中</span>
          )}
        </div>
        <div className="bar-buttons">
          <button type="button" className="button small mobile-only" onClick={() => setSheet({ type: 'log' })}>
            紀錄
          </button>
          <label className="toggle">
            <input type="checkbox" checked={snapshot.autoPlay} onChange={(e) => host.setAutoPlay(e.target.checked)} disabled={!!view.result} />
            自動代打
          </label>
          <button type="button" className="button small" onClick={() => setSheet({ type: 'resign' })} disabled={!!view.result}>
            投降
          </button>
        </div>
      </div>

      <div className="game-layout">
        <div className="table">
          <Side view={view} side={opponent} ui={ui} picked={picked} {...handlers} />
          <div className="midline">
            {view.attack ? (
              <span className="attack-info">
                {who(view.attack.player, seat)}的{SLOT_ZH[view.attack.attackerSlot]}角色：{ATTACK_ZH[view.attack.type]}
              </span>
            ) : (
              <span className="midline-text">{turn?.phase === 'ATTACK' ? ATTACK_STEP_ZH.ATTACK_DECLARATION : ''}</span>
            )}
            <Resolution view={view} onCard={(objectId, cardId) => setSheet({ type: 'card', objectId, cardId })} />
          </div>
          <Side view={view} side={seat} ui={ui} picked={picked} {...handlers} />
          <div className="hand" aria-label={`手牌 ${hand.length} 張`}>
            {hand.map((card, i) =>
              card.hidden ? (
                <CardFace key={i} cardId={null} />
              ) : (
                <CardFace
                  key={card.objectId}
                  cardId={card.cardId}
                  active={!!ui && (ui.cardActions.has(card.objectId) || !!ui.pick?.cards.some((c) => c.objectId === card.objectId))}
                  selected={picked.includes(card.objectId)}
                  onClick={() => onCard(card.objectId, card.cardId)}
                />
              ),
            )}
            {hand.length === 0 && <span className="muted">（沒有手牌）</span>}
          </div>
        </div>

        <aside className="sidebar">
          <div className="panel decision-panel">
            {view.result ? (
              <div className="decision">
                <h2 className="decision-title">遊戲結束</h2>
                <p className="result-text">
                  {view.result.outcome === 'DRAW'
                    ? '和局：雙方同時落敗。'
                    : view.result.winner === seat
                      ? `你勝出！（對手${LOSS_TEXT[view.result.reason]}）`
                      : `你落敗。（你${LOSS_TEXT[view.result.reason]}）`}
                </p>
                <div className="decision-buttons">
                  <button type="button" className="button primary" onClick={onNewGame}>
                    再來一局
                  </button>
                  <button type="button" className="button" onClick={onLeave}>
                    回主頁
                  </button>
                </div>
              </div>
            ) : ui ? (
              snapshot.autoPlay ? (
                <p className="waiting">自動代打中…</p>
              ) : (
                <DecisionPanel ui={ui} picked={picked} setPicked={setPicked} onChoice={choose} onInfo={(cardId) => setSheet({ type: 'card', objectId: null, cardId })} />
              )
            ) : view.decision && !view.decision.mine ? (
              <p className="waiting">{waitingText(view.decision.kind)}</p>
            ) : (
              <p className="waiting">處理中…</p>
            )}
            {snapshot.error && <p className="warning">{snapshot.error}</p>}
          </div>
          <div className="panel log-panel desktop-only">
            <h2 className="panel-title">對局紀錄</h2>
            <LogPanel events={snapshot.events} seat={seat} />
          </div>
        </aside>
      </div>

      {sheet?.type === 'card' && (
        <CardSheet
          cardId={sheet.cardId}
          stats={sheet.objectId !== null ? view.stats[sheet.objectId] : undefined}
          actions={sheet.objectId !== null && !snapshot.autoPlay ? (ui?.cardActions.get(sheet.objectId) ?? []) : []}
          onAction={choose}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.type === 'zone' && (
        <ZoneSheet
          title={`${sheet.side === seat ? '我方' : '對方'}${ZONE_ZH[sheet.zone]}`}
          cards={view.sides[sheet.side][sheet.zone]}
          onCard={(cardId) => setSheet({ type: 'card', objectId: null, cardId })}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.type === 'term' && <TermSheet id={sheet.id} onClose={() => setSheet(null)} />}
      {sheet?.type === 'log' && (
        <Modal title="對局紀錄" onClose={() => setSheet(null)}>
          <LogPanel events={snapshot.events} seat={seat} />
        </Modal>
      )}
      {sheet?.type === 'resign' && (
        <Modal title="投降" onClose={() => setSheet(null)}>
          <p>確定要投降嗎？投降後立即落敗（CR-1.2.4）。</p>
          <div className="decision-buttons">
            <button
              type="button"
              className="button danger"
              onClick={() => {
                setSheet(null);
                host.resign();
              }}
            >
              確定投降
            </button>
            <button type="button" className="button" onClick={() => setSheet(null)}>
              取消
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function TermSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const t = term(id);
  if (!t) return null;
  return (
    <Modal title={t.name} onClose={onClose}>
      <p>{t.text}</p>
      {t.rules.length > 0 && <p className="muted">綜合規則：{t.rules.join('、')}（JP ver. 1.114）</p>}
      <p className="muted">本專案自行撰寫的說明，非官方。</p>
    </Modal>
  );
}
