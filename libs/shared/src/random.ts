/**
 * RNG seedable (mulberry32) : toutes les décisions aléatoires d'un salon passent
 * par lui, ce qui rend les parties reproductibles en dev/test (seed injectable —
 * exigence du e2e déterministe).
 */

export type Rng = () => number; // uniforme [0, 1)

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

/** Copie mélangée (Fisher-Yates). */
export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function pickIndex(rng: Rng, length: number): number {
  return Math.floor(rng() * length);
}
