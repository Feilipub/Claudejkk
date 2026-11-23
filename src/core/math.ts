/** Small math helpers shared across systems. */

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number): number => clamp((v - a) / (b - a), 0, 1);
export const smoothstep = (a: number, b: number, v: number): number => {
  const t = invLerp(a, b, v);
  return t * t * (3 - 2 * t);
};
export const dist = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(bx - ax, by - ay);
export const dist2 = (ax: number, ay: number, bx: number, by: number): number => (bx - ax) ** 2 + (by - ay) ** 2;

/** Move `cur` toward `target` by at most `maxDelta`. */
export function approach(cur: number, target: number, maxDelta: number): number {
  if (cur < target) return Math.min(cur + maxDelta, target);
  return Math.max(cur - maxDelta, target);
}

/** Wrap angle to (-PI, PI]. */
export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/** Rotate angle `cur` toward `target` by at most `maxDelta` radians. */
export function turnToward(cur: number, target: number, maxDelta: number): number {
  const d = wrapAngle(target - cur);
  if (Math.abs(d) <= maxDelta) return target;
  return wrapAngle(cur + Math.sign(d) * maxDelta);
}

/** Exponential smoothing factor independent of frame rate. */
export const damp = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);

/** 4-way facing from an angle: 0=right 1=down 2=left 3=up. */
export function facing4(angle: number): 0 | 1 | 2 | 3 {
  const a = wrapAngle(angle);
  if (a > -Math.PI / 4 && a <= Math.PI / 4) return 0;
  if (a > Math.PI / 4 && a <= (3 * Math.PI) / 4) return 1;
  if (a > (-3 * Math.PI) / 4 && a <= -Math.PI / 4) return 3;
  return 2;
}

export interface Vec2 {
  x: number;
  y: number;
}
