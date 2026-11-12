/**
 * Original artwork for a card that has no licensed or user-provided
 * picture: abstract shapes in the card's colour, chosen from a hash of the
 * card number so every card looks different but always the same, and an
 * emblem for its kind. No characters are drawn and no official card art is
 * imitated.
 */

import { memo, useId } from 'react';
import type { CardKind } from '@wso/game-engine';

/** FNV-1a, 32 bit. */
export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** Small deterministic generator from a seed (mulberry32). */
function generator(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ART_COLORS: Record<string, [string, string, string]> = {
  yellow: ['#f6d55c', '#c99a12', '#6b4f00'],
  green: ['#6fd59a', '#2f9a5c', '#0f4a2a'],
  red: ['#f38a7c', '#c83a3a', '#5c1414'],
  blue: ['#7fb4f0', '#3271c4', '#122f5c'],
  purple: ['#c09af0', '#7a4cc4', '#36185c'],
};

const NEUTRAL: [string, string, string] = ['#c9ccd6', '#7c8191', '#2d303a'];

function Emblem({ kind, light }: { kind: CardKind; light: string }) {
  switch (kind) {
    case 'CHARACTER':
      // A plain crest.
      return <path d="M50 22 L66 28 L64 48 Q58 60 50 64 Q42 60 36 48 L34 28 Z" fill="none" stroke={light} strokeWidth="2.2" opacity="0.75" />;
    case 'EVENT':
      // A four-pointed star.
      return <path d="M50 20 L55 39 L74 44 L55 49 L50 68 L45 49 L26 44 L45 39 Z" fill={light} opacity="0.55" />;
    case 'CLIMAX':
      // A burst of rays.
      return (
        <g stroke={light} strokeWidth="2" opacity="0.7">
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * Math.PI) / 6;
            return <line key={i} x1={50 + Math.cos(a) * 8} y1={42 + Math.sin(a) * 8} x2={50 + Math.cos(a) * 24} y2={42 + Math.sin(a) * 24} />;
          })}
          <circle cx="50" cy="42" r="6" fill={light} stroke="none" />
        </g>
      );
  }
}

function Pattern({ seed, light }: { seed: number; light: string }) {
  const rand = generator(seed);
  switch (seed % 4) {
    case 0: {
      const cx = 20 + rand() * 60;
      const cy = 15 + rand() * 50;
      return (
        <g fill="none" stroke={light} opacity="0.35">
          {[10, 18, 26, 34, 42, 50].map((r) => (
            <circle key={r} cx={cx} cy={cy} r={r} strokeWidth={1 + rand() * 1.5} />
          ))}
        </g>
      );
    }
    case 1: {
      const angle = rand() * 60 - 30;
      return (
        <g stroke={light} opacity="0.3" transform={`rotate(${angle} 50 40)`}>
          {Array.from({ length: 9 }, (_, i) => (
            <line key={i} x1={-20 + i * 16} y1={-30} x2={-20 + i * 16} y2={110} strokeWidth={2 + rand() * 5} />
          ))}
        </g>
      );
    }
    case 2:
      return (
        <g fill={light} opacity="0.28">
          {Array.from({ length: 7 }, (_, i) => (
            <circle key={i} cx={rand() * 100} cy={rand() * 80} r={4 + rand() * 14} />
          ))}
        </g>
      );
    default:
      return (
        <g fill="none" stroke={light} strokeWidth="1.2" opacity="0.32">
          {Array.from({ length: 5 }, (_, row) =>
            Array.from({ length: 6 }, (_, col) => {
              const x = col * 20 + (row % 2) * 10 - 5;
              const y = row * 18;
              return <path key={`${row}-${col}`} d={`M${x} ${y + 6} L${x + 10} ${y} L${x + 20} ${y + 6} L${x + 20} ${y + 18} L${x + 10} ${y + 24} L${x} ${y + 18} Z`} />;
            }),
          )}
        </g>
      );
  }
}

export const CardArt = memo(function CardArt({ cardId, color, kind }: { cardId: string; color: string; kind: CardKind }) {
  const id = useId();
  const seed = hash(cardId);
  const [light, base, dark] = ART_COLORS[color] ?? NEUTRAL;
  const tilt = (seed >>> 8) % 2 === 0;
  return (
    <svg className="card-art" viewBox="0 0 100 80" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-g`} x1={tilt ? '0' : '1'} y1="0" x2={tilt ? '1' : '0'} y2="1">
          <stop offset="0" stopColor={base} />
          <stop offset="1" stopColor={dark} />
        </linearGradient>
        <radialGradient id={`${id}-r`} cx="0.5" cy="0.45" r="0.6">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="100" height="80" fill={`url(#${id}-g)`} />
      <Pattern seed={seed} light={light} />
      <rect width="100" height="80" fill={`url(#${id}-r)`} />
      <Emblem kind={kind} light={light} />
    </svg>
  );
});
