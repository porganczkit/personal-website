// ─────────────────────────────────────────────────────────────────────────────
// Seeded PRNG (mulberry32). The simulation must never call Math.random(), so
// that the same seed plus the same inputs always replays the same game.
// ─────────────────────────────────────────────────────────────────────────────

export interface Rng {
  s: number;
}

export function createRng(seed: number): Rng {
  return { s: seed >>> 0 };
}

/** Uniform float in [0, 1). */
export function nextFloat(rng: Rng): number {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Uniform float in [min, max). */
export function range(rng: Rng, min: number, max: number): number {
  return min + (max - min) * nextFloat(rng);
}

/** Uniform integer in [min, max]. */
export function rangeInt(rng: Rng, min: number, max: number): number {
  return Math.floor(range(rng, min, max + 1));
}

/** Standard normal, via Box–Muller. Used by the wind random walk. */
export function gaussian(rng: Rng): number {
  const u = Math.max(nextFloat(rng), 1e-9);
  const v = nextFloat(rng);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(nextFloat(rng) * items.length))];
}
