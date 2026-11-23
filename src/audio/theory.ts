/**
 * Music theory for the generative western score: scales, chords, a seeded PRNG,
 * a Markov melody walker and rhythm cells. Pure functions, no Web Audio, so the
 * composition rules are unit-tested in `tests/unit/audio/theory.test.ts`.
 *
 * Every melody here is generated at runtime from these rules — nothing quotes an
 * existing tune.
 */

/** A scale as semitone offsets from the root inside one octave. */
export type Scale = readonly number[];

/** Scales used by the cues. Degree indices are 0-based. */
export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  minor: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  phrygianDominant: [0, 1, 4, 5, 7, 8, 10],
  pentatonicMajor: [0, 2, 4, 7, 9],
  pentatonicMinor: [0, 3, 5, 7, 10],
} as const satisfies Record<string, Scale>;

export type ScaleName = keyof typeof SCALES;

/** Deterministic 32-bit PRNG (mulberry32). Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a string hash → unsigned 32-bit. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Seed for a cue on a given in-game day: the score varies by day but is stable within one. */
export function cueSeed(day: number, cue: string): number {
  return (hashString(cue) ^ Math.imul((day | 0) + 1, 2654435761)) >>> 0;
}

/** MIDI note number → frequency in Hz (A4 = 69 = 440 Hz). */
export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Semitone offset of a scale degree; degrees outside 0..n-1 wrap through octaves. */
export function degreeToSemis(scale: Scale, deg: number): number {
  const n = scale.length;
  const oct = Math.floor(deg / n);
  const i = ((deg % n) + n) % n;
  return oct * 12 + scale[i]!;
}

/** Scale degrees of a chord stacked in thirds on `deg` (triad by default, 4 for sevenths). */
export function chordDegrees(deg: number, size = 3): number[] {
  const out: number[] = [];
  for (let i = 0; i < size; i++) out.push(deg + i * 2);
  return out;
}

/** Semitone offsets (from the scale root) of a chord on a scale degree. */
export function chordSemis(scale: Scale, deg: number, size = 3): number[] {
  return chordDegrees(deg, size).map((d) => degreeToSemis(scale, d));
}

/** True when `deg` (any octave) belongs to the chord degrees (any octave). */
export function isChordTone(deg: number, chord: readonly number[], scaleLen: number): boolean {
  const m = ((deg % scaleLen) + scaleLen) % scaleLen;
  for (const c of chord) if (((c % scaleLen) + scaleLen) % scaleLen === m) return true;
  return false;
}

/** Weighted choice; equal weights when `weights` is omitted. */
export function pickWeighted<T>(rng: () => number, items: readonly T[], weights?: readonly number[]): T {
  if (!weights) return items[Math.floor(rng() * items.length)]!;
  let total = 0;
  for (let i = 0; i < items.length; i++) total += weights[i] ?? 0;
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i] ?? 0;
    if (r <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

/** Tuning knobs for the Markov melody walker. */
export interface MelodyOpts {
  /** Inclusive degree range the melody stays inside. */
  range: readonly [number, number];
  /** 0..1 — how strongly strong beats pull toward chord tones. */
  chordPull: number;
  /** 0..1 — how often the line leaps a 4th or more. */
  leapChance: number;
}

const INTERVALS = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5] as const;
const STEP_WEIGHTS = [0.3, 0.6, 1.2, 3.5, 5, 1.4, 5, 3.5, 1.2, 0.6, 0.3];

/**
 * One Markov step of the melody: small intervals dominate, leaps follow
 * `leapChance`, and on strong beats chord tones are favoured by `chordPull`.
 * `prevInterval` adds a little inertia (a line that moved up tends to keep
 * going, then turns).
 */
export function nextDegree(rng: () => number, prev: number, chord: readonly number[], scaleLen: number, strong: boolean, opts: MelodyOpts, prevInterval = 0): number {
  const [lo, hi] = opts.range;
  const cands: number[] = [];
  const weights: number[] = [];
  for (let i = 0; i < INTERVALS.length; i++) {
    const iv = INTERVALS[i]!;
    const deg = prev + iv;
    if (deg < lo || deg > hi) continue;
    let w = STEP_WEIGHTS[i]!;
    if (Math.abs(iv) >= 3) w *= 0.25 + opts.leapChance * 2;
    // Inertia: continue in the same direction a little more often, after a leap turn back.
    if (prevInterval !== 0 && Math.abs(prevInterval) <= 2 && Math.sign(iv) === Math.sign(prevInterval)) w *= 1.35;
    if (Math.abs(prevInterval) >= 3 && Math.sign(iv) === -Math.sign(prevInterval)) w *= 1.6;
    const ct = isChordTone(deg, chord, scaleLen);
    if (strong) w *= ct ? 1 + opts.chordPull * 2.5 : Math.max(0.05, 1 - opts.chordPull * 0.85);
    else if (!ct) w *= 1.1; // passing tones live on the weak beats
    cands.push(deg);
    weights.push(w);
  }
  if (!cands.length) return Math.min(hi, Math.max(lo, prev));
  return pickWeighted(rng, cands, weights);
}

/** The nearest chord tone to `deg` (ties resolve downward), used for cadences and motif transposition. */
export function nearestChordTone(deg: number, chord: readonly number[], scaleLen: number): number {
  for (let d = 0; d <= scaleLen; d++) {
    if (isChordTone(deg - d, chord, scaleLen)) return deg - d;
    if (isChordTone(deg + d, chord, scaleLen)) return deg + d;
  }
  return deg;
}

/** A note inside a bar: 16th-step position, scale degree and length in steps. */
export interface BarNote {
  step: number;
  deg: number;
  dur: number;
}

/**
 * Rhythm cells: 16 steps per bar, 1 = onset. Each name is a feel the cues pick
 * from; a bar's note durations run to the next onset (or the bar end).
 */
export const RHYTHM_CELLS: Record<string, readonly (readonly number[])[]> = {
  sparse: [
    [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ],
  walking: [
    [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    [1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    [1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0],
  ],
  ragtime: [
    [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0],
    [1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    [0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0],
    [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0],
  ],
  fingerpick: [
    [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  ],
  flowing: [
    [1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0],
    [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    [1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0],
  ],
  long: [
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
  ],
};

/** Durations from onsets: each note lasts until the next onset or the bar end. */
export function cellDurations(cell: readonly number[]): { step: number; dur: number }[] {
  const on: number[] = [];
  for (let i = 0; i < cell.length; i++) if (cell[i]) on.push(i);
  return on.map((s, i) => ({ step: s, dur: (on[i + 1] ?? cell.length) - s }));
}

/**
 * Generate one bar of melody with the Markov walker over a rhythm cell. Strong
 * beats are steps 0 and 8 (and 4/12 for longer cells).
 */
export function generateBar(rng: () => number, cell: readonly number[], chord: readonly number[], scaleLen: number, startDeg: number, opts: MelodyOpts): { notes: BarNote[]; lastDeg: number } {
  const slots = cellDurations(cell);
  const notes: BarNote[] = [];
  let prev = startDeg;
  let prevIv = 0;
  for (let i = 0; i < slots.length; i++) {
    const { step, dur } = slots[i]!;
    const strong = step % 8 === 0 || (slots.length > 4 && step % 4 === 0);
    const deg = i === 0 && strong ? nearestChordTone(nextDegree(rng, prev, chord, scaleLen, false, opts, prevIv), chord, scaleLen) : nextDegree(rng, prev, chord, scaleLen, strong, opts, prevIv);
    prevIv = deg - prev;
    prev = deg;
    notes.push({ step, deg, dur });
  }
  return { notes, lastDeg: prev };
}

/** Motif transformations used across a phrase. */
export type Variation = 'repeat' | 'transpose' | 'cadence' | 'invert' | 'thin';

/**
 * Vary a motif for a new chord: `transpose` moves the line so its first note is
 * a chord tone, `cadence` ends it on the chord root with a long note, `invert`
 * mirrors the intervals, `thin` drops every other note for breathing room.
 */
export function varyMotif(motif: readonly BarNote[], kind: Variation, chord: readonly number[], scaleLen: number, opts: MelodyOpts): BarNote[] {
  if (!motif.length) return [];
  const [lo, hi] = opts.range;
  const clamp = (d: number) => Math.min(hi, Math.max(lo, d));
  if (kind === 'repeat') return motif.map((n) => ({ ...n }));
  if (kind === 'thin') return motif.filter((_, i) => i % 2 === 0).map((n, i, a) => ({ ...n, dur: (a[i + 1]?.step ?? 16) - n.step }));
  if (kind === 'invert') {
    const pivot = motif[0]!.deg;
    return motif.map((n) => ({ ...n, deg: clamp(nearestChordTone(pivot - (n.deg - pivot), chord, scaleLen) === pivot - (n.deg - pivot) ? pivot - (n.deg - pivot) : pivot - (n.deg - pivot)) }));
  }
  const first = motif[0]!.deg;
  const target = nearestChordTone(first, chord, scaleLen);
  const shift = target - first;
  const out = motif.map((n) => ({ ...n, deg: clamp(n.deg + shift) }));
  if (kind === 'cadence' && out.length) {
    const last = out[out.length - 1]!;
    // Resolve onto the chord root in the nearest octave, held to the bar end.
    const root = chord[0]!;
    let best = last.deg;
    let bestDist = Infinity;
    for (let o = -2; o <= 2; o++) {
      const d = root + o * scaleLen;
      if (d < lo || d > hi) continue;
      const dist = Math.abs(d - last.deg);
      if (dist < bestDist) {
        bestDist = dist;
        best = d;
      }
    }
    last.deg = best;
    last.dur = 16 - last.step;
    if (out.length > 1) out[out.length - 2]!.dur = Math.max(1, last.step - out[out.length - 2]!.step);
  }
  return out;
}

/**
 * Timing humanisation: a seeded jitter in seconds, plus swing on the off-16ths
 * (`swing` 0 = straight, 0.33 = triplet feel).
 */
export function humanize(rng: () => number, step: number, stepDur: number, swing: number, jitter = 0.006): number {
  const off = step % 2 === 1 ? stepDur * swing : 0;
  return off + (rng() - 0.5) * 2 * jitter;
}
