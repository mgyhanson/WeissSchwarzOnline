/**
 * A card, drawn from its data: picture (licensed, user-provided or original
 * artwork), level and cost, trigger icons, name, card number, power and
 * soul. Every value comes from the card database (and current values from
 * the player view); nothing is typed in here. Three sizes keep the 5:7
 * proportion of a real card.
 */

import { memo, useState, useSyncExternalStore } from 'react';
import type { Orientation, StageStats } from '@wso/game-engine';
import { catalog } from '../images/providers';
import { cardInfo } from '../model/cards';
import { KIND_ZH, TRIGGER_SHORT, TRIGGER_ZH } from '../model/text';
import { CardArt } from './CardArt';

export interface CardFaceProps {
  /** Null draws the back of a card. */
  cardId: string | null;
  orientation?: Orientation | null;
  stats?: StageStats;
  /** Something can be done with the card. */
  active?: boolean;
  selected?: boolean;
  size?: 'small' | 'normal' | 'large';
  onClick?: () => void;
  label?: string;
}

function Picture({ cardId, color, kind }: { cardId: string; color: string; kind: 'CHARACTER' | 'EVENT' | 'CLIMAX' }) {
  useSyncExternalStore(catalog.subscribe, catalog.getVersion, catalog.getVersion);
  const image = catalog.imageFor(cardId);
  const [loaded, setLoaded] = useState<string | null>(null);
  return (
    <span className="c-art">
      <CardArt cardId={cardId} color={color} kind={kind} />
      {image && (
        <img
          className={`c-img ${loaded === image.url ? 'is-loaded' : ''}`}
          src={image.url}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(image.url)}
          onError={() => catalog.markFailed(image.url)}
        />
      )}
    </span>
  );
}

export const CardFace = memo(function CardFace({ cardId, orientation, stats, active, selected, size = 'normal', onClick, label }: CardFaceProps) {
  const classes = ['card', `card-${size}`];
  if (orientation === 'REST') classes.push('is-rest');
  if (orientation === 'REVERSE') classes.push('is-reverse');
  if (active) classes.push('is-active');
  if (selected) classes.push('is-selected');
  if (onClick) classes.push('is-clickable');

  // A card that cannot be tapped is not a button, so it can sit inside other controls.
  const Tag = onClick ? 'button' : 'span';
  const interactive = onClick ? { type: 'button' as const, onClick } : { role: 'img' };

  if (!cardId) {
    return (
      <Tag className={[...classes, 'card-back'].join(' ')} {...interactive} aria-label={label ?? '背面的卡'}>
        <span className="card-back-mark">WS</span>
      </Tag>
    );
  }

  const info = cardInfo(cardId);
  classes.push(`color-${info.color}`, `kind-${info.kind.toLowerCase()}`);
  const power = stats?.power ?? info.power;
  const soul = stats?.soul ?? info.soul;
  const level = stats?.level ?? info.level;
  const change = (now: number | undefined, printed: number | null) => (now === undefined || printed === null ? '' : now > printed ? 'up' : now < printed ? 'down' : '');
  const state = orientation === 'REST' ? '，Rest' : orientation === 'REVERSE' ? '，Reverse' : '';
  const triggers = info.triggers.map((t) => TRIGGER_ZH[t]).join('、');
  const tip = `${info.name}（${info.cardId}）${KIND_ZH[info.kind]}${info.kind !== 'CLIMAX' ? `・Lv${info.level}／Cost${info.cost}` : ''}${info.kind === 'CHARACTER' ? `・${power}／Soul ${soul}` : ''}${triggers ? `・Trigger：${triggers}` : ''}`;

  return (
    <Tag className={classes.join(' ')} {...interactive} aria-label={`${info.name}${state}${label ? `，${label}` : ''}`} title={tip}>
      <Picture cardId={cardId} color={info.color} kind={info.kind} />
      {info.kind !== 'CLIMAX' ? (
        <span className="c-cost-badge" aria-hidden="true">
          <span className={`c-lv ${change(stats?.level, info.level)}`}>{level}</span>
          <span className="c-cost">{info.cost}</span>
        </span>
      ) : (
        <span className="c-kind-badge">CX</span>
      )}
      {info.kind === 'EVENT' && <span className="c-kind-badge c-event">EV</span>}
      {(info.triggers.length > 0 || info.counter) && (
        <span className="c-icons" aria-hidden="true">
          {info.counter && <span className="c-icon c-icon-counter">C</span>}
          {info.triggers.map((t, i) => (
            <span key={i} className={`c-icon trig-${t.toLowerCase()}`}>
              {TRIGGER_SHORT[t]}
            </span>
          ))}
        </span>
      )}
      <span className="c-band">
        <span className="c-name">{info.name}</span>
        {size !== 'small' && <span className="c-no">{info.cardId}</span>}
        {size === 'large' && info.traits.length > 0 && <span className="c-traits">{info.traits.map((t) => `《${t}》`).join('')}</span>}
      </span>
      {info.kind === 'CHARACTER' && (
        <span className="c-stats">
          <span className={`c-pow ${change(stats?.power, info.power)}`}>{power}</span>
          <span className={`c-soul ${change(stats?.soul, info.soul)}`}>
            <span className="c-soul-mark" aria-hidden="true">◆</span>
            {soul}
          </span>
        </span>
      )}
    </Tag>
  );
});
