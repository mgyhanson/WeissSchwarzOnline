import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  cloneState,
  createCtx,
  moveCard,
  nextInt,
  nextUint32,
  seedRng,
  serializeState,
  shuffleDeck,
  shuffleInPlace,
} from '../src/index';
import { card, newTestState } from './helpers';

describe('random number generator', () => {
  it('produces the same sequence for the same seed', () => {
    const a = seedRng('seed-1');
    const b = seedRng('seed-1');
    const seqA = Array.from({ length: 20 }, () => nextUint32(a));
    const seqB = Array.from({ length: 20 }, () => nextUint32(b));
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = seedRng('seed-1');
    const b = seedRng('seed-2');
    expect(Array.from({ length: 5 }, () => nextUint32(a))).not.toEqual(Array.from({ length: 5 }, () => nextUint32(b)));
  });

  it('keeps its state as unsigned 32-bit integers (safe to store as JSON)', () => {
    const s = seedRng('json');
    for (let i = 0; i < 1000; i++) nextUint32(s);
    for (const word of s) {
      expect(Number.isInteger(word)).toBe(true);
      expect(word).toBeGreaterThanOrEqual(0);
      expect(word).toBeLessThanOrEqual(0xffffffff);
    }
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });

  it('nextInt stays in range and is roughly uniform', () => {
    const s = seedRng('uniform');
    const buckets = [0, 0, 0, 0, 0, 0];
    const samples = 60000;
    for (let i = 0; i < samples; i++) {
      const n = nextInt(s, 6);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(6);
      buckets[n]!++;
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan((samples / 6) * 0.95);
      expect(count).toBeLessThan((samples / 6) * 1.05);
    }
  });

  it('nextInt rejects invalid bounds', () => {
    const s = seedRng('bounds');
    expect(() => nextInt(s, 0)).toThrow();
    expect(() => nextInt(s, 1.5)).toThrow();
  });

  it('shuffleInPlace returns a permutation of its input', () => {
    const s = seedRng('perm');
    const items = Array.from({ length: 50 }, (_, i) => i);
    shuffleInPlace(s, items);
    expect([...items].sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i));
  });

  it('every position is reachable for every card when shuffling', () => {
    // Guards against an off-by-one in Fisher-Yates: over many shuffles of
    // four items, each item must appear in each position.
    const s = seedRng('positions');
    const seen = Array.from({ length: 4 }, () => new Set<number>());
    for (let round = 0; round < 500; round++) {
      const items = [0, 1, 2, 3];
      shuffleInPlace(s, items);
      items.forEach((item, position) => seen[item]!.add(position));
    }
    for (const positions of seen) expect(positions.size).toBe(4);
  });
});

describe('INV-07: determinism', () => {
  function play(seed: string): string {
    const ctx = createCtx(newTestState(seed));
    shuffleDeck(ctx, 0);
    shuffleDeck(ctx, 1);
    for (let i = 0; i < 5; i++) {
      for (const player of [0, 1] as const) {
        const deck = ctx.state.zones[player].deck;
        moveCard(ctx, deck[deck.length - 1]!, { player, zone: 'hand' });
      }
    }
    return serializeState(ctx.state);
  }

  it('the same seed and the same actions give exactly the same state', () => {
    expect(play('game-42')).toBe(play('game-42'));
  });

  it('a different seed gives a different shuffle', () => {
    expect(play('game-42')).not.toBe(play('game-43'));
  });

  it('a copied state is independent of the original and shares the frozen card data', () => {
    const original = newTestState();
    const before = serializeState(original);
    const copy = cloneState(original);
    expect(serializeState(copy)).toBe(before);

    const ctx = createCtx(copy);
    shuffleDeck(ctx, 0);
    moveCard(ctx, card(0, 0), { player: 0, zone: 'hand' });

    expect(serializeState(original)).toBe(before);
    expect(serializeState(copy)).not.toBe(before);
    expect(copy.defs).toBe(original.defs);
    expect(Object.isFrozen(original.defs)).toBe(true);
  });

  it('a state survives a JSON round trip', () => {
    const ctx = createCtx(newTestState());
    shuffleDeck(ctx, 0);
    const text = serializeState(ctx.state);
    expect(JSON.stringify(JSON.parse(text))).toBe(text);
  });
});

describe('engine source', () => {
  it('never uses system randomness or the system clock', () => {
    const srcDir = fileURLToPath(new URL('../src', import.meta.url));
    const forbidden = /Math\.random|Date\.now|new Date|performance\.now|crypto\.|setTimeout|setInterval/;
    const files = readdirSync(srcDir, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const lines = readFileSync(join(srcDir, file), 'utf8').split('\n');
      lines.forEach((line, i) => {
        // Comments may mention the forbidden names when explaining the rule.
        const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
        expect(forbidden.test(code), `${file}:${i + 1} uses a non-deterministic API`).toBe(false);
      });
    }
  });
});
