/**
 * The persistent data model for an individual horse. This is plain data: it is
 * saved verbatim and can be simulated off-screen. Behaviour lives in sibling
 * modules (stats, care, bonding, ai, riding).
 */
import type { HorseSlot } from '../data/items.ts';

export type Sex = 'mare' | 'stallion' | 'gelding';
export type InjuryKind = 'cut' | 'limp' | 'strain' | 'bruise' | 'stoneBruise' | 'gunshot' | 'colic';

export interface Injury {
  kind: InjuryKind;
  /** 0..100 — how bad. Healed when it reaches 0. */
  severity: number;
  /** Treated injuries heal 3x faster and stop bleeding. */
  treated: boolean;
  /** Game-day it happened. */
  day: number;
}

export interface HorseAppearance {
  coat: string;
  pattern: string;
  face: string;
  legs: [string, string, string, string]; // FL FR HL HR
  maneStyle: string;
  tailStyle: string;
  /** 0.6..1.3 scale of mane length (customisable at the stable). */
  maneLength: number;
  /** Override mane colour (dyeing is not period-accurate; kept to natural range). */
  maneTint: string | null;
  /** Small random seed used for spot placement so patterns are stable. */
  patternSeed: number;
}

export interface HorseTraining {
  /** 0..100 each. Raised by training activities at stables/corrals and by riding. */
  groundwork: number; // leading, tying, standing still → mounting, handling
  saddle: number; // acceptance of rider; low = bucking risk
  speed: number; // gallop conditioning
  jumping: number;
  desensitised: number; // gunfire/predator tolerance
}

export interface HorseHistoryEntry {
  day: number;
  text: string;
}

export interface HorseData {
  id: string;
  name: string;
  breedId: string;
  /** Age in years (float, advances slowly with game days). */
  age: number;
  sex: Sex;
  appearance: HorseAppearance;
  traits: string[];
  /** Per-stat genetic multipliers, 0.88..1.12. */
  genes: Record<string, number>;
  training: HorseTraining;
  /** Current values. */
  health: number; // 0..maxHealth
  stamina: number; // 0..maxStamina
  energy: number; // 0..100 long-term fatigue reserve
  hunger: number; // 100 = full
  thirst: number; // 100 = quenched
  stress: number; // 0..100
  cleanliness: number; // 100 = clean
  hoof: number; // 100 = perfect hoof condition
  injuries: Injury[];
  /** Bonding. */
  bondXp: number;
  trust: number; // short-term 0..100, follows treatment in the last day
  /** Count of each bonding activity performed today, for diminishing returns. */
  bondToday: Record<string, number>;
  bondDay: number;
  /** Equipment: slot → item id. Condition is per-slot 0..100. */
  gear: Partial<Record<HorseSlot, string>>;
  gearCondition: Partial<Record<HorseSlot, number>>;
  /** Items stored in saddlebags. */
  bagItems: Record<string, number>;
  owner: string; // 'player' | npc id | 'wild' | 'trader:<shopId>'
  history: HorseHistoryEntry[];
  favoriteFood: string;
  /** Things this horse particularly dislikes: 'water' | 'night' | 'crowds' | 'gunfire' | 'dogs'. */
  dislike: string;
  /** Wild horses must be calmed and broken; 0..100 tameness. */
  tameness: number;
  /** Total distance ridden by the player, km. */
  kmRidden: number;
  /** Position (persisted for off-screen simulation). */
  x: number;
  y: number;
  /** Tied to a hitching post at this position, or null. */
  tiedAt: { x: number; y: number } | null;
  /** Stabled at a stable id (safe, fed, recovers). */
  stabledAt: string | null;
  alive: boolean;
  /** Quest/encounter tag (e.g. 'brannigan_stolen'). */
  tag?: string;
  /** Rental horses return to their stable and are not owned. */
  rentalUntilDay?: number;
}

export function bondLevelFromXp(xp: number, thresholds: readonly number[]): number {
  let lvl = 1;
  for (let i = 0; i < thresholds.length; i++) if (xp >= thresholds[i]!) lvl = i + 1;
  return lvl;
}

export function addHistory(h: HorseData, day: number, text: string): void {
  h.history.push({ day, text });
  if (h.history.length > 40) h.history.splice(0, h.history.length - 40);
}
