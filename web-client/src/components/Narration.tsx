import { useState } from 'react';
import type { PlayerId } from '@wso/game-engine';
import type { BattleLogEntry, Presentation, PresentationQueue } from '../presentation/queue';
import { CardFace } from './CardFace';

/**
 * What is being shown right now, in words, with the controls of the
 * presentation: pause, step by step, skip. These only control what the
 * screen shows; the game state is decided by the rules engine and cannot be
 * changed from here.
 */
export function Narration({ presentation, queue, onCard }: { presentation: Presentation; queue: PresentationQueue; onCard: (cardId: string) => void }) {
  const caption = presentation.caption;
  return (
    <div className="decision narration" aria-live="polite">
      {caption ? (
        <>
          <h2 className="decision-title narration-title">{caption.title}</h2>
          {caption.lines.map((line, i) => (
            <p key={i} className="narration-line">
              {line}
            </p>
          ))}
          {caption.sourceCardId && (
            <button type="button" className="button small" onClick={() => onCard(caption.sourceCardId!)}>
              查看這張卡
            </button>
          )}
        </>
      ) : (
        <p className="waiting">正在顯示剛才發生的事…</p>
      )}
      <div className="narration-controls">
        {presentation.stepMode ? (
          <button type="button" className="button primary" onClick={() => queue.next()} disabled={!presentation.awaitingNext}>
            下一步 ▶
          </button>
        ) : presentation.paused ? (
          <button type="button" className="button primary" onClick={() => queue.resume()}>
            ▶ 繼續
          </button>
        ) : (
          <button type="button" className="button" onClick={() => queue.pause()}>
            ⏸ 暫停
          </button>
        )}
        <label className="toggle">
          <input type="checkbox" checked={presentation.stepMode} onChange={(e) => queue.setStepMode(e.target.checked)} />
          逐步播放
        </label>
        <button type="button" className="button small" onClick={() => queue.skip()}>
          跳過動畫
        </button>
      </div>
    </div>
  );
}

const SIDE_CLASS = (player: PlayerId | null, seat: PlayerId): string => (player === null ? '' : player === seat ? 'mine' : 'theirs');

/** The battle log: every explained step, newest first; an entry opens to its full explanation and cards. */
export function BattleLog({ entries, seat, onCard }: { entries: readonly BattleLogEntry[]; seat: PlayerId; onCard: (cardId: string) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  if (entries.length === 0) return <p className="muted">還沒有紀錄。</p>;
  const newestFirst = [...entries].reverse();
  return (
    <ol className="battle-log">
      {newestFirst.map((entry) => {
        const expanded = open === entry.seq;
        return (
          <li key={entry.seq} className={`battle-entry ${SIDE_CLASS(entry.player, seat)} ${expanded ? 'open' : ''}`}>
            <button type="button" className="battle-entry-head" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : entry.seq)}>
              <span className="battle-entry-title">{entry.title}</span>
              <span className="muted battle-entry-meta">
                {entry.turn !== null ? `第 ${entry.turn} 回合・` : ''}
                {entry.time}
              </span>
            </button>
            {expanded && (
              <div className="battle-entry-body">
                {entry.lines.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
                {entry.cards.some((c) => c.cardId) && (
                  <div className="battle-entry-cards">
                    {entry.cards
                      .filter((c) => c.cardId)
                      .map((c, i) => (
                        <CardFace key={i} cardId={c.cardId} size="small" onClick={() => onCard(c.cardId!)} />
                      ))}
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
