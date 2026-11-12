import { type CardView, type PileZone, type PlayerId, type PlayerView, type SlotId, SLOTS } from '@wso/game-engine';
import type { DecisionUi } from '../model/options';
import { SLOT_ZH, ZONE_ZH } from '../model/text';
import { CardFace } from './CardFace';

export interface BoardHandlers {
  /** A visible card was tapped. */
  onCard: (objectId: number, cardId: string) => void;
  /** A zone was tapped (to list its cards). */
  onZone: (side: PlayerId, zone: PileZone) => void;
  /** A highlighted slot was tapped. */
  onSlot: (slot: SlotId) => void;
}

interface SideProps extends BoardHandlers {
  view: PlayerView;
  side: PlayerId;
  ui: DecisionUi | null;
  picked: readonly number[];
}

function isActive(ui: DecisionUi | null, objectId: number): boolean {
  if (!ui) return false;
  return ui.cardActions.has(objectId) || !!ui.pick?.cards.some((c) => c.objectId === objectId);
}

function top(cards: readonly CardView[]): CardView | undefined {
  return cards[cards.length - 1];
}

/** The value of the data-zone attribute animations use to find a zone on screen (presentation/animate.ts). */
export function zoneAnchor(player: PlayerId, zone: string, slot?: SlotId): string {
  return slot ? `p${player}-${zone}-${slot}` : `p${player}-${zone}`;
}

function Pile({ title, cards, onOpen, area, faceUp = true, anchor }: { title: string; cards: readonly CardView[]; onOpen?: () => void; area: string; faceUp?: boolean; anchor: string }) {
  const card = top(cards);
  return (
    <div className={`zone zone-${area}`} style={{ gridArea: area }} data-zone={anchor}>
      <button type="button" className="pile" onClick={onOpen} disabled={!onOpen} aria-label={`${title}：${cards.length} 張`}>
        {card ? <CardFace cardId={faceUp && !card.hidden ? card.cardId : null} size="small" /> : <span className="empty-frame" />}
        <span className="count">{cards.length}</span>
      </button>
      <span className="zone-label">{title}</span>
    </div>
  );
}

export function Side({ view, side, ui, picked, onCard, onZone, onSlot }: SideProps) {
  const zones = view.sides[side];
  const mine = side === view.viewer;
  const attack = view.attack;

  const slotCell = (slot: SlotId) => {
    const card = zones.stage[slot][0];
    const highlighted = mine && !!ui?.slots.includes(slot);
    const markers = zones.marker[slot].length;
    let role = '';
    if (card && !card.hidden && attack) {
      if (attack.attackerObjectId === card.objectId) role = 'is-attacker';
      else if (attack.defenderObjectId === card.objectId) role = 'is-defender';
    }
    return (
      <div key={slot} className={`zone slot ${highlighted ? 'is-target' : ''} ${role}`} style={{ gridArea: slot.toLowerCase() }} data-zone={zoneAnchor(side, 'stage', slot)}>
        {card && !card.hidden ? (
          <CardFace
            cardId={card.cardId}
            orientation={card.orientation}
            stats={view.stats[card.objectId]}
            active={isActive(ui, card.objectId)}
            selected={picked.includes(card.objectId)}
            onClick={() => (highlighted ? onSlot(slot) : onCard(card.objectId, card.cardId))}
            label={SLOT_ZH[slot]}
          />
        ) : (
          <button type="button" className="empty-slot" onClick={highlighted ? () => onSlot(slot) : undefined} disabled={!highlighted} aria-label={`${SLOT_ZH[slot]}（空）`}>
            {SLOT_ZH[slot]}
          </button>
        )}
        {markers > 0 && <span className="marker-count">Marker {markers}</span>}
      </div>
    );
  };

  const climax = top(zones.climax);
  const clockCards = zones.clock;
  return (
    <section className={`side ${mine ? 'side-me' : 'side-opponent'}`} aria-label={mine ? '我方' : '對方'}>
      {SLOTS.map(slotCell)}
      <div className="zone zone-cx" style={{ gridArea: 'cx' }} data-zone={zoneAnchor(side, 'climax')}>
        {climax && !climax.hidden ? (
          <CardFace cardId={climax.cardId} size="small" onClick={() => onCard(climax.objectId, climax.cardId)} />
        ) : (
          <span className="empty-frame climax-frame">CX</span>
        )}
        <span className="zone-label">Climax</span>
      </div>
      <Pile title={ZONE_ZH.deck} cards={zones.deck} area="dk" faceUp={false} anchor={zoneAnchor(side, 'deck')} />
      <Pile title={ZONE_ZH.waitingRoom} cards={zones.waitingRoom} area="wr" onOpen={() => onZone(side, 'waitingRoom')} anchor={zoneAnchor(side, 'waitingRoom')} />
      <div className="zone zone-lv" style={{ gridArea: 'lv' }} data-zone={zoneAnchor(side, 'level')}>
        <button type="button" className="level-stack" onClick={() => onZone(side, 'level')} aria-label={`Level ${zones.level.length}`}>
          {zones.level.map((card, i) => (
            <span key={i} className="level-card">
              <CardFace cardId={card.hidden ? null : card.cardId} size="small" />
            </span>
          ))}
          <span className="level-number">Lv {zones.level.length}</span>
        </button>
      </div>
      <div className="zone zone-st" style={{ gridArea: 'st' }} data-zone={zoneAnchor(side, 'stock')}>
        <div className="pile stock-pile" aria-label={`Stock：${zones.stock.length} 張`}>
          {zones.stock.length > 0 ? <CardFace cardId={null} size="small" /> : <span className="empty-frame" />}
          <span className="count">{zones.stock.length}</span>
        </div>
        <span className="zone-label">Stock</span>
      </div>
      <div className="zone zone-ck" style={{ gridArea: 'ck' }} data-zone={zoneAnchor(side, 'clock')}>
        <button type="button" className="clock-row" onClick={() => onZone(side, 'clock')} aria-label={`Clock：${clockCards.length} 張`}>
          {Array.from({ length: 7 }, (_, i) => {
            const card = clockCards[i];
            return (
              <span key={i} className={`clock-cell ${card ? '' : 'clock-empty'}`}>
                {card && <CardFace cardId={card.hidden ? null : card.cardId} size="small" />}
              </span>
            );
          })}
        </button>
        <span className="zone-label">Clock {clockCards.length}/7</span>
      </div>
      <div className="zone zone-mm" style={{ gridArea: 'mm' }} data-zone={zoneAnchor(side, mine ? 'memory' : 'hand')}>
        {!mine && (
          <button type="button" className="chip" onClick={() => onZone(side, 'hand')}>
            手牌 {zones.hand.length}
          </button>
        )}
        {zones.memory.length > 0 && (
          <button type="button" className="chip" onClick={() => onZone(side, 'memory')}>
            Memory {zones.memory.length}
          </button>
        )}
      </div>
    </section>
  );
}

export function Resolution({ view, onCard }: { view: PlayerView; onCard: BoardHandlers['onCard'] }) {
  const cards = [...view.sides[0].resolution, ...view.sides[1].resolution];
  if (cards.length === 0) return null;
  return (
    <div className="resolution" aria-label="解決領域" data-zone="resolution">
      <span className="zone-label">解決領域</span>
      {cards.map((card, i) => (
        <CardFace key={i} cardId={card.hidden ? null : card.cardId} size="small" onClick={card.hidden ? undefined : () => onCard(card.objectId, card.cardId)} />
      ))}
    </div>
  );
}
