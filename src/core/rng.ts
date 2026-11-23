/**
 * Deterministic random number generation and hashing.
 * Everything procedural in Wild Frontier (terrain, horses, NPC names) is seeded
 * so the world is identical across sessions and saves only store deltas.
 */

/** A seeded PRNG (mulberry32). Same seed -> same sequence. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }
  /** Float in [0, 1). */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }
  /** Uniform pick from a non-empty array. */
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)]!;
  }
  /** Weighted pick; weights must be >= 0 and not all zero. */
  weighted<T>(items: readonly T[], weight: (t: T) => number): T {
    let total = 0;
    for (const it of items) total += weight(it);
    let r = this.next() * total;
    for (const it of items) {
      r -= weight(it);
      if (r <= 0) return it;
    }
    return items[items.length - 1]!;
  }
  /** Approximately normal distribution (Irwin-Hall, 3 samples). */
  gauss(mean = 0, sd = 1): number {
    const u = (this.next() + this.next() + this.next() - 1.5) / 0.5;
    return mean + u * sd;
  }
  /** Current internal state, for persistence. */
  get state(): number {
    return this.s;
  }
}

/** 32-bit integer hash of up to 3 ints plus a seed. */
export function hash3(x: number, y: number, z: number, seed = 0): number {
  let h = (seed ^ 0x27d4eb2d) >>> 0;
  h = Math.imul(h ^ (x | 0), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13) ^ (y | 0), 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16) ^ (z | 0), 0x27d4eb2f);
  h ^= h >>> 15;
  return h >>> 0;
}

/** Hash to float in [0,1). */
export function hashf(x: number, y: number, z = 0, seed = 0): number {
  return hash3(x, y, z, seed) / 4294967296;
}

/** Hash a string to a 32-bit seed. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Smooth 2D value noise in [0,1]. */
export function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const a = hashf(xi, yi, 0, seed);
  const b = hashf(xi + 1, yi, 0, seed);
  const c = hashf(xi, yi + 1, 0, seed);
  const d = hashf(xi + 1, yi + 1, 0, seed);
  const u = fade(xf);
  const v = fade(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fractal Brownian motion over value noise, result roughly in [0,1]. */
export function fbm(x: number, y: number, seed: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + i * 1013);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/** Ridged noise for mountain ridges and canyon walls, in [0,1]. */
export function ridged(x: number, y: number, seed: number, octaves = 4): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise(x * freq, y * freq, seed + i * 7919) * 2 - 1);
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}
