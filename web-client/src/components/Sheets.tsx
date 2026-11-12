import { type ReactNode, useEffect } from 'react';
import type { CardView, Choice, StageStats } from '@wso/game-engine';
import { cardInfo } from '../model/cards';
import type { UiButton } from '../model/options';
import { COLOR_ZH, KIND_ZH, TRIGGER_ZH } from '../model/text';
import { CardFace } from './CardFace';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="關閉">
            ✕
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function CardDetail({ cardId, stats }: { cardId: string; stats?: StageStats }) {
  const info = cardInfo(cardId);
  return (
    <div className="card-detail">
      <div className="card-detail-top">
        <CardFace cardId={cardId} size="large" stats={stats} />
        <dl className="card-facts">
          <dt>卡號</dt>
          <dd>{info.cardId}</dd>
          <dt>種類</dt>
          <dd>
            {KIND_ZH[info.kind]}・{COLOR_ZH[info.color] ?? info.color}
          </dd>
          {info.kind !== 'CLIMAX' && (
            <>
              <dt>Level／Cost</dt>
              <dd>
                {info.level}／{info.cost}
              </dd>
            </>
          )}
          {info.kind === 'CHARACTER' && (
            <>
              <dt>Power／Soul</dt>
              <dd>
                {info.power}／{info.soul}
                {stats && (stats.power !== info.power || stats.soul !== info.soul || stats.level !== info.level) && (
                  <span className="now">
                    {' '}
                    現在 {stats.power}／{stats.soul}
                    {stats.level !== info.level ? `，Level ${stats.level}` : ''}
                  </span>
                )}
              </dd>
              <dt>特徵</dt>
              <dd>{info.traits.length > 0 ? info.traits.map((t) => `《${t}》`).join('') : '—'}</dd>
            </>
          )}
          <dt>Trigger</dt>
          <dd>{info.triggers.length > 0 ? info.triggers.map((t) => TRIGGER_ZH[t]).join('、') : '—'}</dd>
        </dl>
      </div>
      <h3>官方卡牌文字</h3>
      {info.text.length > 0 ? (
        <div className="official-text" lang="ja">
          {info.text.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      ) : (
        <p className="muted">（沒有文字）</p>
      )}
      <h3>
        中文說明 <span className="badge-unofficial">{info.explanationLabel}</span>
      </h3>
      <div className="explanation">
        {info.explanation.split('\n').map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
      {info.support !== 'verified' && <p className="warning">未確認 — 暫不支援自動執行</p>}
      {info.faqs.length > 0 && (
        <details className="faqs">
          <summary>官方 Q&A（{info.faqs.length}）</summary>
          {info.faqs.map((faq, i) => (
            <div key={i} className="faq" lang="ja">
              <p className="muted">{faq.date}</p>
              <p>Q：{faq.q}</p>
              <p>A：{faq.a}</p>
            </div>
          ))}
        </details>
      )}
      <p className="source">
        資料來源：<a href={info.officialUrl} target="_blank" rel="noreferrer noopener">官方卡表（ws-tcg.com）</a>・{info.product}
      </p>
    </div>
  );
}

export function CardSheet({
  cardId,
  stats,
  actions,
  onAction,
  onClose,
}: {
  cardId: string;
  stats?: StageStats;
  actions: UiButton[];
  onAction: (choice: Choice) => void;
  onClose: () => void;
}) {
  return (
    <Modal title={cardInfo(cardId).name} onClose={onClose}>
      {actions.length > 0 && (
        <div className="sheet-actions">
          {actions.map((action) => (
            <button key={action.key} type="button" className={`button ${action.tone === 'primary' ? 'primary' : ''}`} onClick={() => onAction(action.choice)}>
              {action.label}
            </button>
          ))}
        </div>
      )}
      <CardDetail cardId={cardId} stats={stats} />
    </Modal>
  );
}

export function ZoneSheet({ title, cards, onCard, onClose }: { title: string; cards: readonly CardView[]; onCard: (cardId: string) => void; onClose: () => void }) {
  // Newest first: the top card of a zone is the last one.
  const ordered = [...cards].reverse();
  return (
    <Modal title={`${title}（${cards.length} 張）`} onClose={onClose}>
      {cards.length === 0 ? (
        <p className="muted">沒有卡。</p>
      ) : (
        <div className="card-grid">
          {ordered.map((card, i) => (
            <CardFace key={i} cardId={card.hidden ? null : card.cardId} onClick={card.hidden ? undefined : () => onCard(card.cardId)} />
          ))}
        </div>
      )}
      {cards.some((c) => c.hidden) && <p className="muted">背面的卡是你看不到的卡。</p>}
    </Modal>
  );
}
