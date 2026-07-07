// Deterministic seeded PRNG (mulberry32). Same seed -> same stream, always —
// this is what makes sim states shareable via seed + param set (spec 1.5, 5).
// The internal state is exposed so full-state saves resume the exact noise
// stream instead of restarting it.

export interface Rng {
  (): number;
  state: number;
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  const next = function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  } as Rng;
  Object.defineProperty(next, 'state', {
    get: () => a >>> 0,
    set: (v: number) => {
      a = v >>> 0;
    },
  });
  return next;
}
