import { type ReactNode, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { Choice, PileZone, PlayerId, SlotId } from '@wso/game-engine';
import { type Replay, replayFileName } from '@wso/server/shared';
import type { GameHost, ReplayStatus } from '../host/types';
import { downloadText } from '../model/download';
import { term } from '../model/glossary';
import { decisionUi, waitingText } from '../model/options';
import { ATTACK_STEP_ZH, ATTACK_ZH, PHASE_TERM, PHASE_ZH, SLOT_ZH, ZONE_ZH, who } from '../model/text';
import { Resolution, Side } from './Board';
import { CardFace } from './CardFace';
import { PhaseTracker, PlayerBar } from './PlayerBar';
import { createAnimator } from '../presentation/animate';
import { type Speed, PresentationQueue, SPEED_ZH } from '../presentation/queue';
import { DecisionPanel, LogPanel, RevealHistory } from './Panels';
import { RevealPanel } from './RevealPanel';
import { CardSheet, Modal, ZoneSheet } from './Sheets';

type Sheet =
  | { type: 'card'; objectId: number | null; cardId: string }
  | { type: 'zone'; side: PlayerId; zone: PileZone }
  | { type: 'term'; id: string }
  | { type: 'log' }
  | { type: 'resign' }
  | null;

const LOSS_TEXT = { LEVEL_4: '達到 Level 4', NO_CARDS: '山札及控え室都沒有卡', RESIGNED: '投降' } as const;

const SPEED_KEY = 'wso.animationSpeed';

function initialSpeed(): Speed {
  try {
    const saved = window.localStorage.getItem(SPEED_KEY);
    if (saved === 'NORMAL' || saved === 'FAST' || saved === 'OFF') return saved;
  } catch {
    // Storage unavailable: use the default.
  }
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'OFF' : 'NORMAL';
}

/** One presentation queue per host, starting from what exists when the game screen opens. */
function useQueue(host: GameHost): PresentationQueue {
  const queue = useMemo(() => {
    const snap = host.getSnapshot();
    const last = snap.updates[snap.updates.length - 1];
    const seq = snap.events.reduce((max, e) => Math.max(max, e.seq), -1);
    return new PresentationQueue(host.seat, { view: last?.view ?? snap.view, updateId: last?.id ?? -1, seq }, { speed: initialSpeed(), animator: createAnimator(host.seat), onBusy: (busy) => host.setHold(busy) });
  }, [host]);
  const snapshot = useSyncExternalStore(host.subscribe, host.getSnapshot);
  useEffect(() => {
    queue.sync(snapshot.updates, snapshot.restoredUpTo);
  }, [queue, snapshot]);
  useEffect(() => () => host.setHold(false), [host]);
  return queue;
}

export interface GameProps {
  host: GameHost;
  onLeave: () => void;
  leaveLabel?: string;
  /** "Play again": a new local game, or a rematch request online. Absent in a replay. */
  onNewGame?: () => void;
  newGameLabel?: string;
  /** Open the replay of this finished game in the viewer. */
  onWatchReplay?: (replay: Replay) => void;
  /** Shown under the result, e.g. the rematch status of an online room. */
  endNote?: ReactNode;
}

function ReplayControls({ host, status }: { host: GameHost; status: ReplayStatus }) {
  const controls = host.replayControls!;
  const done = status.position >= status.total;
  return (
    <div className="decision replay-controls">
      <h2 className="decision-title">重播</h2>
      <p className="muted">
        第 {status.position}／{status.total} 個行動・以「{status.viewer}」的視角
      </p>
      <div className="decision-buttons">
        {status.playing ? (
          <button type="button" className="button" onClick={controls.pause}>
            ⏸ 暫停
          </button>
        ) : (
          <button type="button" className="button primary" onClick={controls.play} disabled={done}>
            ▶ 播放
          </button>
        )}
        <button type="button" className="button" onClick={controls.step} disabled={done}>
          下一步
        </button>
        <button type="button" className="button" onClick={controls.toEnd} disabled={done}>
          跳到結尾
        </button>
      </div>
      <p className="muted">只顯示這名玩家當時看到的資訊。</p>
    </div>
  );
}

export function Game({ host, onLeave, leaveLabel = '回主頁', onNewGame, newGameLabel = '再來一局', onWatchReplay, endNote }: GameProps) {
  const snapshot = useSyncExternalStore(host.subscribe, host.getSnapshot);
  const queue = useQueue(host);
  const presentation = useSyncExternalStore(queue.subscribe, queue.getSnapshot);
  // The board shows what has been presented so far, not what the engine already knows.
  const view = presentation.view;
  const logEvents = useMemo(() => snapshot.events.filter((e) => e.seq <= presentation.shownSeq), [snapshot.events, presentation.shownSeq]);
  const setSpeed = (speed: Speed) => {
    queue.setSpeed(speed);
    try {
      window.localStorage.setItem(SPEED_KEY, speed);
    } catch {
      // Not saved; the choice still applies to this game.
    }
  };
  const seat = host.seat;
  const opponent: PlayerId = seat === 0 ? 1 : 0;
  const [sheet, setSheet] = useState<Sheet>(null);
  const [picked, setPicked] = useState<number[]>([]);

  const decision = view.decision?.mine && !presentation.busy ? view.decision.decision : null;
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
                第 {turn.number} 回合・{turn.player === seat ? '你的回合' : '對手的回合'}
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
          <label className="speed-select">
            動畫
            <select value={presentation.speed} onChange={(e) => setSpeed(e.target.value as Speed)}>
              {(['NORMAL', 'FAST', 'OFF'] as const).map((s) => (
                <option key={s} value={s}>
                  {SPEED_ZH[s]}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="button small mobile-only" onClick={() => setSheet({ type: 'log' })}>
            紀錄
          </button>
          {host.mode !== 'replay' && (
            <>
              <label className="toggle">
                <input type="checkbox" checked={snapshot.autoPlay} onChange={(e) => host.setAutoPlay(e.target.checked)} disabled={!!view.result} />
                自動代打
              </label>
              <button type="button" className="button small" onClick={() => setSheet({ type: 'resign' })} disabled={!!view.result}>
                投降
              </button>
            </>
          )}
          {host.mode === 'replay' && (
            <button type="button" className="button small" onClick={onLeave}>
              {leaveLabel}
            </button>
          )}
        </div>
      </div>

      <div className="game-layout">
        <div className="table">
          <PlayerBar view={view} side={opponent} label={host.opponentLabel} onZone={handlers.onZone} />
          <Side view={view} side={opponent} ui={ui} picked={picked} {...handlers} />
          <div className="midline" data-zone="center">
            <PhaseTracker view={view} onTerm={(id) => setSheet({ type: 'term', id })} />
            {view.attack ? (
              <span className="attack-info">
                {who(view.attack.player, seat)}的{SLOT_ZH[view.attack.attackerSlot]}角色：{ATTACK_ZH[view.attack.type]}
              </span>
            ) : (
              <span className="midline-text">{turn?.phase === 'ATTACK' ? ATTACK_STEP_ZH.ATTACK_DECLARATION : ''}</span>
            )}
            <Resolution view={view} onCard={(objectId, cardId) => setSheet({ type: 'card', objectId, cardId })} />
            <RevealPanel presentation={presentation} seat={seat} onCard={(cardId) => setSheet({ type: 'card', objectId: null, cardId })} onSkip={() => queue.skip()} />
          </div>
          <Side view={view} side={seat} ui={ui} picked={picked} {...handlers} />
          <PlayerBar view={view} side={seat} label="你" onZone={handlers.onZone} />
          <div className="hand" aria-label={`手牌 ${hand.length} 張`} data-zone={`p${seat}-hand`}>
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
            {snapshot.notice && <p className="notice" role="status">{snapshot.notice}</p>}
            {host.mode === 'replay' && snapshot.replay && !(view.result && snapshot.replay.position >= snapshot.replay.total) ? (
              <ReplayControls host={host} status={snapshot.replay} />
            ) : view.result ? (
              <div className="decision">
                <h2 className="decision-title">遊戲結束</h2>
                <p className="result-text">
                  {view.result.outcome === 'DRAW'
                    ? '和局：雙方同時落敗。'
                    : view.result.winner === seat
                      ? `你勝出！（對手${LOSS_TEXT[view.result.reason]}）`
                      : `你落敗。（你${LOSS_TEXT[view.result.reason]}）`}
                </p>
                {endNote}
                <div className="decision-buttons">
                  {onNewGame && (
                    <button type="button" className="button primary" onClick={onNewGame}>
                      {newGameLabel}
                    </button>
                  )}
                  {host.getReplay && (
                    <button type="button" className="button" onClick={() => void saveReplay(host)}>
                      下載重播檔
                    </button>
                  )}
                  {host.getReplay && onWatchReplay && (
                    <button type="button" className="button" onClick={() => void host.getReplay!().then(onWatchReplay)}>
                      觀看重播
                    </button>
                  )}
                  <button type="button" className="button" onClick={onLeave}>
                    {leaveLabel}
                  </button>
                </div>
              </div>
            ) : presentation.busy ? (
              <div className="decision">
                <p className="waiting">正在顯示剛才發生的事…</p>
                <button type="button" className="button small" onClick={() => queue.skip()}>
                  跳過動畫
                </button>
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
            <LogPanel events={logEvents} seat={seat} />
            <RevealHistory records={presentation.history} onCard={(cardId) => setSheet({ type: 'card', objectId: null, cardId })} />
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
          <LogPanel events={logEvents} seat={seat} />
          <RevealHistory records={presentation.history} onCard={(cardId) => setSheet({ type: 'card', objectId: null, cardId })} />
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

async function saveReplay(host: GameHost): Promise<void> {
  try {
    const replay = await host.getReplay!();
    downloadText(replayFileName(replay), JSON.stringify(replay));
  } catch {
    window.alert('暫時未能取得重播檔，請稍後再試。');
  }
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
