/**
 * The reveal area in the middle of the table: shows the card(s) the current
 * presentation step turned over, why, and where they went. Only cards the
 * step carries are shown; a card this seat may not see stays face down.
 */

import type { PlayerId } from '@wso/game-engine';
import { abilityText, cardInfo } from '../model/cards';
import { ATTACK_ZH, COLOR_ZH, KIND_ZH, SLOT_ZH, TRIGGER_EFFECT_ZH, TRIGGER_ZH, who } from '../model/text';
import type { Presentation } from '../presentation/queue';
import type { Step, StepCard } from '../presentation/steps';
import { CardFace } from './CardFace';

function Facts({ cardId }: { cardId: string }) {
  const info = cardInfo(cardId);
  return (
    <div className="reveal-facts">
      <div className="reveal-name">{info.name}</div>
      <div className="reveal-meta">
        {info.cardId}・{KIND_ZH[info.kind]}・{COLOR_ZH[info.color] ?? info.color}
        {info.kind !== 'CLIMAX' && ` ・Lv ${info.level}／Cost ${info.cost}`}
        {info.kind === 'CHARACTER' && ` ・${info.power}／Soul ${info.soul}`}
      </div>
      {info.triggers.length > 0 && <div className="reveal-meta">Trigger：{info.triggers.map((t) => TRIGGER_ZH[t]).join('、')}</div>}
      {info.abilityText.length > 0 && (
        <div className="reveal-text">
          <div lang="ja">
            {info.abilityText.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
          <div className="reveal-zh">
            <span className="badge-unofficial">{info.explanationLabel}</span>
            {info.explanation.split('\n').map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Cards({ cards, count, onCard, size = 'normal', flip = true }: { cards: StepCard[]; count: number; onCard: (cardId: string) => void; size?: 'normal' | 'large'; flip?: boolean }) {
  return (
    <div className="reveal-cards">
      {cards.slice(0, count).map((card, i) => (
        <span key={i} className={flip ? 'reveal-flip' : undefined} style={{ animationDelay: '0ms' }}>
          <CardFace cardId={card.cardId} size={size} onClick={card.cardId ? () => onCard(card.cardId!) : undefined} />
        </span>
      ))}
    </div>
  );
}

/** Text and cards for one step; null for steps shown only on the board. */
function content(step: Step, p: Presentation, seat: PlayerId, onCard: (cardId: string) => void) {
  switch (step.kind) {
    case 'DRAW':
      if (step.player !== seat) return { title: `對手抽 ${step.cards.length} 張`, tone: 'quiet', body: null };
      return {
        title: `你抽到 ${step.cards.length} 張`,
        tone: 'quiet',
        body: <Cards cards={step.cards} count={Math.max(1, p.shown)} onCard={onCard} />,
      };
    case 'TRIGGER': {
      const id = step.card.cardId;
      return {
        title: `Trigger Check（${who(step.player, seat)}）`,
        tone: 'trigger',
        body: (
          <div className="reveal-single">
            <Cards cards={[step.card]} count={1} onCard={onCard} size="large" />
            <div>
              {id && <Facts cardId={id} />}
              <div className="reveal-outcome">
                {step.icons.length === 0
                  ? '沒有 Trigger 圖示'
                  : step.icons.map((icon, i) => (
                      // A card can show the same icon twice (e.g. two soul icons): key by position.
                      <p key={i}>
                        <span className="trigger-badge">{TRIGGER_ZH[icon]}</span>
                        {TRIGGER_EFFECT_ZH[icon]}
                      </p>
                    ))}
                {p.phase === 'result' && (
                  <p className="reveal-dest">
                    之後這張卡
                    {step.icons.includes('TREASURE') ? '加入手牌' : step.icons.includes('CHANCE') ? '放到控え室' : '放到 Stock'}
                  </p>
                )}
              </div>
            </div>
          </div>
        ),
      };
    }
    case 'DAMAGE': {
      const shown = Math.max(1, p.shown || (p.phase === 'result' ? step.cards.length : 0));
      const result =
        p.phase !== 'result' || step.amount === null
          ? null
          : step.cancelled
            ? `Cancel！翻到 Climax，這 ${step.cards.length} 張放到控え室，傷害無效`
            : `${step.amount} 點傷害成立，翻開的卡放到 Clock`;
      return {
        title: `${who(step.receiver, seat)}受到傷害：第 ${Math.min(shown, step.cards.length)} 張${step.amount !== null ? `／共 ${step.amount} 點` : ''}`,
        tone: step.cancelled && p.phase === 'result' ? 'cancel' : 'damage',
        body: (
          <>
            <Cards cards={step.cards} count={shown} onCard={onCard} />
            {result && <p className={`reveal-dest ${step.cancelled ? 'is-cancel' : ''}`}>{result}</p>}
            {step.partial && <p className="reveal-dest">（傷害處理中途要先 Refresh，之後繼續翻）</p>}
          </>
        ),
      };
    }
    case 'REVEAL':
      return {
        title: step.reason === 'EFFECT' ? `${who(step.player, seat)}的卡牌效果翻開山札頂的卡` : `${who(step.player, seat)}公開卡牌`,
        tone: 'reveal',
        body: <Cards cards={step.cards} count={Math.max(1, p.shown || step.cards.length)} onCard={onCard} />,
      };
    case 'PLAY':
      if (step.player === seat) return null;
      return {
        title: `對手使用${step.cardKind === 'CHARACTER' ? `角色（登場到${step.slot ? SLOT_ZH[step.slot] : '舞台'}）` : step.cardKind === 'CLIMAX' ? ' Climax' : ' Event'}`,
        tone: 'reveal',
        body: (
          <div className="reveal-single">
            <Cards cards={[{ cardId: step.cardId }]} count={1} onCard={onCard} size="large" flip={false} />
            <Facts cardId={step.cardId} />
          </div>
        ),
      };
    case 'ABILITY':
      return {
        title: `「${cardInfo(step.cardId).name}」的能力發動`,
        tone: 'ability',
        body: <blockquote className="ability-text" lang="ja">{abilityText(step.cardId, step.ability)}</blockquote>,
      };
    case 'ATTACK':
      return { title: `${who(step.player, seat)}的${SLOT_ZH[step.slot]}角色：${ATTACK_ZH[step.attackType]}`, tone: 'attack', body: null };
    case 'LEVEL_UP':
      return {
        title: `${who(step.player, seat)} Level Up → Level ${step.level}`,
        tone: 'damage',
        body: step.card ? <Cards cards={[step.card]} count={1} onCard={onCard} flip={false} /> : null,
      };
    case 'REFRESH':
      return {
        title: `${who(step.player, seat)}的山札 Refresh`,
        tone: 'damage',
        body: (
          <>
            <p className="reveal-dest">控え室 {step.cards} 張洗回山札；Refresh 懲罰：山札頂 1 張放到 Clock</p>
            {step.penalty && <Cards cards={[step.penalty]} count={1} onCard={onCard} />}
          </>
        ),
      };
    case 'TURN':
      return { title: `第 ${step.turn} 回合・${step.player === seat ? '你的回合' : '對手的回合'}`, tone: 'turn', body: null };
    default:
      return null;
  }
}

export function RevealPanel({ presentation, seat, onCard, onSkip }: { presentation: Presentation; seat: PlayerId; onCard: (cardId: string) => void; onSkip: () => void }) {
  const step = presentation.step;
  if (!step) return null;
  const shown = content(step, presentation, seat, onCard);
  if (!shown) return null;
  const banner = shown.body === null;
  return (
    <div className={`reveal ${banner ? 'reveal-banner' : 'reveal-panel'} tone-${shown.tone}`} role="status" aria-live="polite" key={step.seq}>
      <div className="reveal-head">
        <span className="reveal-title">{shown.title}</span>
        {!banner && (
          <button type="button" className="link-button" onClick={onSkip}>
            跳過
          </button>
        )}
      </div>
      {shown.body}
    </div>
  );
}
