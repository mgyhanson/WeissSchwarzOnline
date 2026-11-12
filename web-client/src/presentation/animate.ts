/**
 * Movement on screen for presentation steps, with the Web Animations API.
 *
 * Cards fly between zones as a single floating element each (transform and
 * opacity only, so the board itself is not re-laid out or re-rendered while
 * they move). Zones are found by their data-zone attribute (Board.tsx).
 * Nothing here changes the game: the queue swaps in the new view after the
 * step, whatever happens to an animation. Every animation ends when the
 * signal aborts (skip).
 */

import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { PlayerId, ZoneRef } from '@wso/game-engine';
import { CardFace } from '../components/CardFace';
import type { Animator, Speed } from './queue';
import type { Step, StepCard } from './steps';

const BASE: Record<Speed, number> = { NORMAL: 1, FAST: 0.4, OFF: 0 };
/** Most cards flown for one step; a refresh of 30 cards is shown as a few. */
const MAX_FLYERS = 6;
const EASE = 'cubic-bezier(0.2, 0.7, 0.2, 1)';

/** The data-zone value of a zone (see zoneAnchor in Board.tsx). */
export function anchorOf(ref: ZoneRef): string {
  if (ref.zone === 'stage' || ref.zone === 'marker') return `p${ref.player}-stage-${ref.slot}`;
  if (ref.zone === 'resolution') return 'center';
  return `p${ref.player}-${ref.zone}`;
}

function element(anchor: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-zone="${anchor}"]`);
}

function centre(el: HTMLElement): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

let layer: HTMLDivElement | null = null;

function overlay(): HTMLDivElement {
  if (layer && document.body.contains(layer)) return layer;
  layer = document.createElement('div');
  layer.className = 'fly-layer';
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);
  return layer;
}

/**
 * Resolves when the animation ends, is cancelled or skipped, or at the
 * latest shortly after it should have ended: a hidden tab pauses
 * animations, and the game must not wait for them.
 */
function finished(animation: Animation, expectedMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    const stop = () => {
      animation.cancel();
      done();
    };
    timer = setTimeout(stop, expectedMs + 400);
    animation.addEventListener('finish', done, { once: true });
    animation.addEventListener('cancel', done, { once: true });
    signal.addEventListener('abort', stop, { once: true });
  });
}

/** Flies a card (face up when its id is known to this player) from one zone to another. */
async function fly(card: StepCard, from: string, to: string, ms: number, delay: number, signal: AbortSignal): Promise<void> {
  const a = element(from);
  const b = element(to);
  if (!a || !b || signal.aborted) return;
  const start = centre(a);
  const end = centre(b);
  const holder = document.createElement('div');
  holder.className = 'flyer';
  overlay().appendChild(holder);
  const root = createRoot(holder);
  flushSync(() => root.render(createElement(CardFace, { cardId: card.cardId, size: 'small' })));
  const rect = holder.getBoundingClientRect();
  const x0 = start.x - rect.width / 2;
  const y0 = start.y - rect.height / 2;
  const x1 = end.x - rect.width / 2;
  const y1 = end.y - rect.height / 2;
  const animation = holder.animate(
    [
      { transform: `translate(${x0}px, ${y0}px) scale(0.9)`, opacity: 0 },
      { transform: `translate(${x0}px, ${y0}px) scale(1)`, opacity: 1, offset: 0.12 },
      { transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - 24}px) scale(1.12)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${x1}px, ${y1}px) scale(1)`, opacity: 1, offset: 0.92 },
      { transform: `translate(${x1}px, ${y1}px) scale(0.95)`, opacity: 0 },
    ],
    { duration: ms, delay, easing: EASE, fill: 'both' },
  );
  await finished(animation, ms + delay, signal);
  root.unmount();
  holder.remove();
}

/** A short emphasis on a zone (attack lunge, level up, refresh...). */
async function pulse(anchor: string, keyframes: Keyframe[], ms: number, signal: AbortSignal): Promise<void> {
  const el = element(anchor);
  if (!el || signal.aborted) return;
  await finished(el.animate(keyframes, { duration: ms, easing: EASE }), ms, signal);
}

const GLOW: Keyframe[] = [
  { boxShadow: '0 0 0 0 rgba(242,179,61,0)' },
  { boxShadow: '0 0 0 6px rgba(242,179,61,0.65)' },
  { boxShadow: '0 0 0 0 rgba(242,179,61,0)' },
];

function flights(step: Step, seat: PlayerId): { cards: StepCard[]; from: string; to: string } | null {
  switch (step.kind) {
    case 'DRAW':
      return { cards: step.cards, from: `p${step.player}-deck`, to: `p${step.player}-hand` };
    case 'MOVE':
      // Plays come from the hand of the player who made them; the opponent's hand is the chip on their side.
      return { cards: step.cards, from: anchorOf(step.from), to: anchorOf(step.to) };
    case 'TRIGGER':
      return { cards: [step.card], from: `p${step.player}-deck`, to: 'center' };
    case 'DAMAGE':
      return { cards: step.cards, from: `p${step.receiver}-deck`, to: 'center' };
    case 'REVEAL':
      return step.reason === 'EFFECT' ? { cards: step.cards, from: `p${step.player}-deck`, to: 'center' } : null;
    default:
      void seat;
      return null;
  }
}

/** The animator the presentation queue calls for each step. */
export function createAnimator(seat: PlayerId): Animator {
  return async (step, _view, speed, signal) => {
    const k = BASE[speed];
    if (k === 0 || typeof document === 'undefined' || typeof Element.prototype.animate !== 'function') return;
    // The queue may call this while React is rendering; start on the next task so flyers can render synchronously.
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (signal.aborted) return;
    const flight = flights(step, seat);
    const jobs: Promise<void>[] = [];
    if (flight) {
      const cards = flight.cards.slice(0, MAX_FLYERS);
      const ms = 420 * k;
      const stagger = (step.kind === 'DAMAGE' ? 550 : 90) * k;
      cards.forEach((card, i) => jobs.push(fly(card, flight.from, flight.to, ms, i * stagger, signal)));
    }
    switch (step.kind) {
      case 'ATTACK': {
        const dir = step.player === seat ? -1 : 1;
        jobs.push(
          pulse(
            `p${step.player}-stage-${step.slot}`,
            [{ transform: 'translateY(0)' }, { transform: `translateY(${dir * 18}px) scale(1.06)`, offset: 0.4 }, { transform: 'translateY(0)' }],
            520 * k,
            signal,
          ),
        );
        break;
      }
      case 'LEVEL_UP':
        jobs.push(pulse(`p${step.player}-level`, [{ transform: 'scale(1)' }, { transform: 'scale(1.35)', offset: 0.4 }, { transform: 'scale(1)' }], 700 * k, signal));
        break;
      case 'REFRESH':
        jobs.push(pulse(`p${step.player}-deck`, [{ transform: 'rotate(0)' }, { transform: 'rotate(-8deg) scale(1.1)', offset: 0.3 }, { transform: 'rotate(8deg) scale(1.1)', offset: 0.6 }, { transform: 'rotate(0)' }], 700 * k, signal));
        break;
      case 'ABILITY':
      case 'PLAY':
        jobs.push(pulse(`p${step.player}-${step.kind === 'PLAY' && step.slot ? `stage-${step.slot}` : 'hand'}`, GLOW, 600 * k, signal));
        break;
      default:
        break;
    }
    await Promise.all(jobs);
  };
}
