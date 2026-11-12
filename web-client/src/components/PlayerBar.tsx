/**
 * The numbers a player always needs, for one side: level, clock, stock,
 * hand, deck, waiting room. All counts are public (CR-3.1.2); the level
 * cards' colours are shown only for face-up cards.
 */

import type { Phase, PileZone, PlayerId, PlayerView } from '@wso/game-engine';
import { cardInfo } from '../model/cards';
import { PHASE_TERM, PHASE_ZH } from '../model/text';

export function PlayerBar({ view, side, label, onZone }: { view: PlayerView; side: PlayerId; label: string; onZone: (side: PlayerId, zone: PileZone) => void }) {
  const zones = view.sides[side];
  const mine = side === view.viewer;
  const turnPlayer = view.turn?.player === side;
  const deciding = view.decision && (view.decision.mine ? view.viewer : view.decision.player) === side;
  const clock = zones.clock.length;
  return (
    <div className={`player-bar ${mine ? 'is-me' : 'is-opponent'} ${turnPlayer ? 'is-turn' : ''}`} data-zone={mine ? undefined : `p${side}-hand`}>
      <span className="pb-name">
        {turnPlayer && <span className="pb-turn" title="回合玩家">▶</span>}
        {label}
        {deciding && <span className="pb-deciding">決定中</span>}
      </span>
      <button type="button" className="pb-stat pb-level" onClick={() => onZone(side, 'level')} title="Level：Level 置場的張數。達到 4 落敗">
        <span className="pb-k">Lv</span>
        <span className="pb-v">{zones.level.length}</span>
        <span className="pb-colors">
          {zones.level.map((c, i) => (
            <span key={i} className={`pb-dot ${!c.hidden && c.face === 'UP' ? `dot-${cardInfo(c.cardId).color}` : 'dot-none'}`} />
          ))}
        </span>
      </button>
      <button type="button" className={`pb-stat pb-clock ${clock >= 6 ? 'is-danger' : ''}`} onClick={() => onZone(side, 'clock')} title="Clock：7 張時 Level Up">
        <span className="pb-k">Clock</span>
        <span className="pb-v">{clock}/7</span>
        <span className="pb-meter" aria-hidden="true">
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} className={i < clock ? 'on' : ''} />
          ))}
        </span>
      </button>
      <span className="pb-stat" title="Stock：支付費用用的卡">
        <span className="pb-k">Stock</span>
        <span className="pb-v">{zones.stock.length}</span>
      </span>
      <button type="button" className="pb-stat" onClick={() => onZone(side, 'hand')} title="手牌張數">
        <span className="pb-k">手牌</span>
        <span className="pb-v">{zones.hand.length}</span>
      </button>
      <span className="pb-stat" title="山札剩餘張數">
        <span className="pb-k">山札</span>
        <span className="pb-v">{zones.deck.length}</span>
      </span>
      <button type="button" className="pb-stat" onClick={() => onZone(side, 'waitingRoom')} title="控え室張數">
        <span className="pb-k">控え室</span>
        <span className="pb-v">{zones.waitingRoom.length}</span>
      </button>
    </div>
  );
}

const PHASES: Phase[] = ['STAND', 'DRAW', 'CLOCK', 'MAIN', 'CLIMAX', 'ATTACK', 'END'];

/** The phases of the turn, with the current one marked. */
export function PhaseTracker({ view, onTerm }: { view: PlayerView; onTerm: (id: string) => void }) {
  const turn = view.turn;
  if (!turn) return null;
  const current = PHASES.indexOf(turn.phase);
  return (
    <ol className={`phase-tracker ${turn.player === view.viewer ? 'is-mine' : 'is-theirs'}`} aria-label="回合階段">
      {PHASES.map((phase, i) => (
        <li key={phase} className={i === current ? 'is-current' : i < current ? 'is-done' : ''} aria-current={i === current ? 'step' : undefined}>
          <button type="button" onClick={() => onTerm(PHASE_TERM[phase])} title={`${PHASE_ZH[phase]}：點擊查看解釋`}>
            {PHASE_ZH[phase].replace(' 階段', '').replace('階段', '')}
          </button>
        </li>
      ))}
    </ol>
  );
}
