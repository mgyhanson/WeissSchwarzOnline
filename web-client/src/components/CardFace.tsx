import type { Orientation, StageStats } from '@wso/game-engine';
import { cardInfo } from '../model/cards';
import { TRIGGER_SHORT } from '../model/text';

export interface CardFaceProps {
  /** Null draws the back of a card. */
  cardId: string | null;
  orientation?: Orientation | null;
  stats?: StageStats;
  /** Something can be done with the card. */
  active?: boolean;
  selected?: boolean;
  size?: 'normal' | 'small' | 'large';
  onClick?: () => void;
  label?: string;
}

export function CardFace({ cardId, orientation, stats, active, selected, size = 'normal', onClick, label }: CardFaceProps) {
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
  const powerChange = stats && info.power !== null ? Math.sign(stats.power - info.power) : 0;
  const soulChange = stats && info.soul !== null ? Math.sign(stats.soul - info.soul) : 0;
  const state = orientation === 'REST' ? '，Rest' : orientation === 'REVERSE' ? '，Reverse' : '';

  return (
    <Tag className={classes.join(' ')} {...interactive} aria-label={`${info.name}${state}${label ? `，${label}` : ''}`} title={info.name}>
      <span className="c-top">
        {info.kind !== 'CLIMAX' && (
          <span className="c-lc">
            <span className="c-lv">{level}</span>
            <span className="c-cost">{info.cost}</span>
          </span>
        )}
        {info.kind === 'CLIMAX' && <span className="c-kind">CX</span>}
        {info.kind === 'EVENT' && <span className="c-kind">EV</span>}
        {info.counter && <span className="c-counter" title="Counter">C</span>}
        <span className="c-trig">{info.triggers.map((t) => TRIGGER_SHORT[t]).join('')}</span>
      </span>
      <span className="c-name">{info.name}</span>
      {info.kind === 'CHARACTER' && (
        <span className="c-bottom">
          <span className={`c-pow ${powerChange > 0 ? 'up' : powerChange < 0 ? 'down' : ''}`}>{power}</span>
          <span className={`c-soul ${soulChange > 0 ? 'up' : soulChange < 0 ? 'down' : ''}`}>S{soul}</span>
        </span>
      )}
    </Tag>
  );
}
