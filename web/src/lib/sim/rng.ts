// Deterministic seeded PRNG (mulberry32) so demo runs are reproducible.
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function rand(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(rand: () => number, mean = 0, stddev = 1): number {
  const u1 = Math.max(rand(), 1e-9);
  const u2 = rand();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z0 * stddev;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
