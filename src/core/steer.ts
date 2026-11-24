/**
 * Input-feel helpers shared by the player and the ridden horse: rein lag that
 * survives an analog thumb, sticky 4-way facing, and analog walk speed.
 * Pure functions, no DOM and no entities — see tests/unit/core/steer.test.ts.
 *
 * Why this file exists: the keyboard changes direction in exact 45° steps, but
 * a thumb on the on-screen joystick trembles by a degree or two every frame.
 * Anything that treats "the angle changed" as "a new command" breaks on a phone.
 */
import { facing4, wrapAngle } from './math.ts';

/** Mutable rein state owned by a ridden horse (kept as one object: no per-frame allocation). */
export interface ReinState {
  /** Direction the rider is asking for, or null when the stick is centred. */
  heading: number | null;
  /** Seconds left before the horse answers the latest *new* direction. */
  timer: number;
}

/**
 * Advance the rein state by one frame. Only a genuinely new direction — more
 * than `threshold` radians from the current command — restarts the lag; smaller
 * drift updates the command in place, so the horse keeps following a moving thumb.
 *
 * @example
 * const rein = { heading: null, timer: 0 };
 * reinCommand(rein, -Math.PI / 2, dt, 0.25); // ask for north: lag starts
 * reinCommand(rein, -Math.PI / 2 + 0.02, dt, 0.25); // thumb trembles: lag keeps counting down
 */
export function reinCommand(s: ReinState, want: number | null, dt: number, lag: number, threshold = 0.3): void {
  if (want !== null) {
    if (s.heading === null || Math.abs(wrapAngle(want - s.heading)) > threshold) {
      s.heading = want;
      s.timer = lag;
    } else s.heading = want;
  }
  if (s.timer > 0) s.timer -= dt;
}

/**
 * 4-way facing with hysteresis: keeps the current facing until the angle is
 * `margin` radians past the sector boundary, so a thumb held near a diagonal
 * does not flip the sprite between two facings every frame.
 * Sectors as in `facing4`: 0 right, 1 down, 2 left, 3 up.
 */
export function facing4Sticky(angle: number, cur: 0 | 1 | 2 | 3, margin = 0.2): 0 | 1 | 2 | 3 {
  const centre = (cur * Math.PI) / 2;
  if (Math.abs(wrapAngle(angle - centre)) <= Math.PI / 4 + margin) return cur;
  return facing4(angle);
}

/**
 * Walk-speed factor from stick deflection. A keyboard reads as length 1 (or √2
 * on a diagonal) and gets full speed; a thumb eases in from a creep at the dead
 * zone so you can line up to a trough or a doorway without overshooting.
 */
export function analogSpeed(len: number): number {
  if (len <= 0) return 0;
  return Math.min(1, Math.max(0.45, len));
}
