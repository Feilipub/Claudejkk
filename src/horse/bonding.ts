/**
 * Behaviour-driven bonding. XP comes from varied care and shared experience,
 * with per-activity diminishing returns inside a game day so the player cannot
 * bond by spamming one button. Neglect and mistreatment remove XP and trust.
 */
import { BALANCE } from '../data/balance.ts';
import type { HorseData } from './horse.ts';
import { bondLevel, traitMul } from './stats.ts';

export interface BondResult {
  gained: number;
  levelBefore: number;
  levelAfter: number;
  /** True if this activity has been repeated so often today that it barely counts. */
  diminished: boolean;
}

function rollDay(h: HorseData, day: number): void {
  if (h.bondDay !== day) {
    h.bondDay = day;
    h.bondToday = {};
  }
}

/**
 * Award bond XP for an activity. `scale` lets callers pass partial credit
 * (e.g. km ridden, hours together).
 */
export function grantBond(h: HorseData, activity: string, day: number, scale = 1): BondResult {
  rollDay(h, day);
  const base = BALANCE.horse.bondActivity[activity] ?? 0;
  const count = h.bondToday[activity] ?? 0;
  // Continuous activities (riding, time together) are scaled, not counted.
  const continuous = activity === 'rideKm' || activity === 'timeTogetherHour';
  const cap = BALANCE.horse.bondDailySoftCap;
  const over = continuous ? 0 : Math.max(0, count - cap + 1);
  const diminish = Math.pow(BALANCE.horse.bondDiminish, over);
  // Low trust slows bonding; a frightened or neglected horse learns slowly.
  const trustMul = 0.5 + h.trust / 100;
  const gained = base * scale * diminish * traitMul(h, 'bondGain') * trustMul;
  const before = bondLevel(h);
  h.bondXp = Math.min(BALANCE.horse.bondLevels[BALANCE.horse.bondLevels.length - 1]! + 500, h.bondXp + gained);
  if (!continuous) h.bondToday[activity] = count + 1;
  // Trust responds faster than bond, but still diminishes.
  h.trust = Math.min(100, h.trust + (gained / Math.max(1, base * scale)) * Math.min(6, base * scale * 0.4));
  return { gained, levelBefore: before, levelAfter: bondLevel(h), diminished: over > 0 };
}

/** Remove bond XP and trust for mistreatment or neglect. Never drops below level 1. */
export function penalizeBond(h: HorseData, reason: string, scale = 1): number {
  const amt = (BALANCE.horse.bondPenalty[reason] ?? 0) * scale;
  h.bondXp = Math.max(0, h.bondXp - amt);
  h.trust = Math.max(0, h.trust - amt * 0.8);
  return amt;
}

/** Human-readable bond stage names. */
export const BOND_NAMES = ['Wary', 'Familiar', 'Trusting', 'Devoted', 'Kindred'];

export function bondName(h: HorseData): string {
  return BOND_NAMES[bondLevel(h) - 1]!;
}

/** Progress 0..1 to the next bond level. */
export function bondProgress(h: HorseData): number {
  const lv = bondLevel(h);
  const t = BALANCE.horse.bondLevels;
  if (lv >= t.length) return 1;
  const a = t[lv - 1]!;
  const b = t[lv]!;
  return (h.bondXp - a) / (b - a);
}
