/**
 * Deterministic random numbers.
 *
 * The engine must never use Math.random or the system clock: the same seed
 * and the same player choices must always produce the same game (INV-07).
 * The generator state is part of GameState.
 *
 * Generator: xoshiro128** (Blackman & Vigna). Seeding: cyrb128 string hash.
 */

import type { RngState } from './types';

/** Derives a generator state from an arbitrary seed string. */
export function seedRng(seed: string): RngState {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  const state: RngState = [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
  // An all-zero state would make the generator output zeros forever.
  if (state[0] === 0 && state[1] === 0 && state[2] === 0 && state[3] === 0) {
    state[0] = 1;
  }
  return state;
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** Advances the state in place and returns an unsigned 32-bit integer. */
export function nextUint32(s: RngState): number {
  const result = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
  const t = (s[1] << 9) >>> 0;
  s[2] = (s[2] ^ s[0]) >>> 0;
  s[3] = (s[3] ^ s[1]) >>> 0;
  s[1] = (s[1] ^ s[2]) >>> 0;
  s[0] = (s[0] ^ s[3]) >>> 0;
  s[2] = (s[2] ^ t) >>> 0;
  s[3] = rotl(s[3], 11);
  return result;
}

/** Uniform integer in [0, n). Uses rejection sampling, so there is no modulo bias. */
export function nextInt(s: RngState, n: number): number {
  if (!Number.isInteger(n) || n <= 0 || n > 0x100000000) {
    throw new Error(`nextInt: n must be an integer in [1, 2^32], got ${n}`);
  }
  const limit = 0x100000000 - (0x100000000 % n);
  let r = nextUint32(s);
  while (r >= limit) {
    r = nextUint32(s);
  }
  return r % n;
}

/** Fisher-Yates shuffle in place. */
export function shuffleInPlace<T>(s: RngState, items: T[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = nextInt(s, i + 1);
    const tmp = items[i] as T;
    items[i] = items[j] as T;
    items[j] = tmp;
  }
}
