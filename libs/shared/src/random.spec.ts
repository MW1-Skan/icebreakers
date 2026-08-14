import { describe, expect, it } from 'vitest';
import { mulberry32, pickIndex, shuffled } from './random';

describe('mulberry32', () => {
  it('est déterministe pour une même seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('produit des valeurs dans [0, 1)', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('shuffled', () => {
  it('retourne une permutation sans modifier la source', () => {
    const source = [1, 2, 3, 4, 5, 6, 7, 8];
    const copy = [...source];
    const result = shuffled(source, mulberry32(1));
    expect(source).toEqual(copy);
    expect([...result].sort((x, y) => x - y)).toEqual(copy);
  });

  it('est déterministe pour une même seed', () => {
    expect(shuffled([1, 2, 3, 4, 5], mulberry32(9))).toEqual(shuffled([1, 2, 3, 4, 5], mulberry32(9)));
  });
});

describe('pickIndex', () => {
  it('reste dans les bornes', () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 500; i++) {
      const idx = pickIndex(rng, 7);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(7);
    }
  });
});
