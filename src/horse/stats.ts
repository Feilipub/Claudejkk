/**
 * Derived horse statistics. Converts breed data × genetics × age × personality ×
 * training × bond × condition × equipment into the numbers the riding and AI
 * code consumes. Pure functions — see tests/unit/horse/stats.test.ts.
 */
import { BALANCE } from '../data/balance.ts';
import { getBreed, type BreedStats } from '../data/breeds.ts';
import { getItem, type HorseSlot } from '../data/items.ts';
import { getTrait, type TraitDef } from '../data/personalities.ts';
import { bondLevelFromXp, type HorseData } from './horse.ts';

export type Gait = 'back' | 'halt' | 'walk' | 'trot' | 'canter' | 'gallop';
export const GAITS: Gait[] = ['back', 'halt', 'walk', 'trot', 'canter', 'gallop'];

/** Breed stat × individual gene, on the 1..10ish scale. */
export function rawStat(h: HorseData, key: keyof BreedStats): number {
  return getBreed(h.breedId).stats[key] * (h.genes[key] ?? 1);
}

/** Age performance curve: young horses are green, old horses fade. 0.7..1. */
export function ageFactor(age: number): number {
  if (age < 3) return 0.7;
  if (age < 5) return 0.9 + (age - 3) * 0.05;
  if (age <= 13) return 1;
  if (age <= 22) return 1 - (age - 13) * 0.025;
  return 0.75;
}

/** Combined personality modifier: multiplicative for mul keys. */
export function traitMul(h: HorseData, key: keyof Omit<TraitDef, 'id' | 'name' | 'description'>): number {
  let m = 1;
  for (const t of h.traits) m *= getTrait(t)[key] as number;
  return m;
}
/** Combined personality modifier: additive for add keys (obedience, aggression, lonely). */
export function traitAdd(h: HorseData, key: 'obedience' | 'aggression' | 'lonely'): number {
  let s = 0;
  for (const t of h.traits) s += getTrait(t)[key];
  return s;
}
export function hasTrait(h: HorseData, id: string): boolean {
  return h.traits.includes(id);
}

export function bondLevel(h: HorseData): number {
  return bondLevelFromXp(h.bondXp, BALANCE.horse.bondLevels);
}

/** Product of a numeric gear stat across all equipped, non-broken gear. */
export function gearMul(h: HorseData, key: 'staminaDrain' | 'staminaRegen' | 'speed' | 'comfort' | 'terrain' | 'handling'): number {
  let m = 1;
  for (const slot of Object.keys(h.gear) as HorseSlot[]) {
    const id = h.gear[slot];
    if (!id) continue;
    const g = getItem(id).gear;
    const v = g?.[key];
    if (v === undefined) continue;
    const cond = (h.gearCondition[slot] ?? 100) / 100;
    // Worn gear loses up to half its benefit (or exaggerates its penalty).
    m *= 1 + (v - 1) * (0.5 + 0.5 * cond);
  }
  return m;
}
export function gearSum(h: HorseData, key: 'carry' | 'warmth'): number {
  let s = 0;
  for (const slot of Object.keys(h.gear) as HorseSlot[]) {
    const id = h.gear[slot];
    if (id) s += getItem(id).gear?.[key] ?? 0;
  }
  return s;
}

export function maxHealth(h: HorseData): number {
  return Math.round(BALANCE.horse.baseHealth * (0.6 + rawStat(h, 'health') * 0.08) * (0.85 + 0.15 * ageFactor(h.age)));
}

/** Stamina bar size, shrinking with long-term fatigue (energy) and hunger/thirst. */
export function maxStamina(h: HorseData): number {
  const base = BALANCE.horse.baseStamina * (0.55 + rawStat(h, 'stamina') * 0.09) * ageFactor(h.age);
  const conditioning = 1 + h.training.speed / 400;
  const fatigue = 0.55 + 0.45 * (h.energy / 100);
  const nourish = h.hunger < 25 || h.thirst < 25 ? 0.75 : 1;
  return Math.max(20, Math.round(base * conditioning * fatigue * nourish));
}

/** Total injury severity, and worst leg injury severity (limps, strains). */
export function injuryLoad(h: HorseData): { total: number; leg: number } {
  let total = 0;
  let leg = 0;
  for (const inj of h.injuries) {
    total += inj.severity;
    if (inj.kind === 'limp' || inj.kind === 'strain' || inj.kind === 'stoneBruise') leg = Math.max(leg, inj.severity);
  }
  return { total, leg };
}

export interface RideStats {
  /** px/s target speed for each gait. */
  gaitSpeed: Record<Gait, number>;
  /** Highest gait allowed right now (injuries / exhaustion / training). */
  maxGait: Gait;
  accel: number; // px/s^2
  decel: number;
  /** Turn rate rad/s at walk and at gallop. */
  turnSlow: number;
  turnFast: number;
  staminaMax: number;
  drainMul: number;
  regenMul: number;
  /** 0..1 probability multiplier of clearing an obstacle. */
  jumpSkill: number;
  /** 0..1, higher = fewer refusals, faster whistle response, less rein lag. */
  obedience: number;
  /** Fear multiplier applied to stress from threats. */
  fear: number;
  /** Rough terrain penalty multiplier (1 = no penalty). */
  terrain: number;
  /** Extra player carry capacity in kg. */
  carry: number;
  /** Seconds of input lag on rein commands. */
  reinLag: number;
  comfort: number;
}

const GAIT_ORDER: Gait[] = ['halt', 'walk', 'trot', 'canter', 'gallop'];

export function gaitIndex(g: Gait): number {
  return g === 'back' ? -1 : GAIT_ORDER.indexOf(g);
}
export function gaitFromIndex(i: number): Gait {
  if (i < 0) return 'back';
  return GAIT_ORDER[Math.min(GAIT_ORDER.length - 1, i)]!;
}

/** Everything the riding controller needs, computed from the full horse state. */
export function rideStats(h: HorseData): RideStats {
  const breed = getBreed(h.breedId);
  const bond = bondLevel(h);
  const age = ageFactor(h.age);
  const inj = injuryLoad(h);
  const spd = rawStat(h, 'speed');
  const condition = (h.hunger < 15 ? 0.9 : 1) * (h.thirst < 15 ? 0.9 : 1) * (0.85 + 0.15 * (h.energy / 100));
  const legPenalty = 1 - Math.min(0.5, inj.leg / 160);
  const speedMul = (0.6 + spd * 0.08) * age * traitMul(h, 'speed') * gearMul(h, 'speed') * condition * legPenalty * (1 + h.training.speed / 600);
  const gs = BALANCE.horse.gaitSpeed;
  const gaitSpeed: Record<Gait, number> = {
    back: gs.back!,
    halt: 0,
    walk: gs.walk! * (0.9 + speedMul * 0.1) * (breed.body === 'gaited' ? 1.15 : 1),
    trot: gs.trot! * (0.75 + speedMul * 0.25) * (breed.body === 'gaited' ? 1.2 : 1),
    canter: gs.canter! * speedMul,
    gallop: gs.gallop! * speedMul,
  };

  let maxGait: Gait = 'gallop';
  if (inj.leg > 55) maxGait = 'walk';
  else if (inj.leg > 30) maxGait = 'trot';
  else if (inj.leg > 15 || h.energy < 10) maxGait = 'canter';
  if (h.health < maxHealth(h) * 0.15) maxGait = 'walk';

  const handling = rawStat(h, 'handling');
  const agility = rawStat(h, 'agility');
  const resp = rawStat(h, 'responsiveness');
  const obedienceRaw =
    0.35 + handling * 0.025 + bond * 0.07 + h.training.groundwork / 500 + h.training.saddle / 500 + traitAdd(h, 'obedience') - h.stress / 400 + (h.trust - 50) / 500;
  const obedience = Math.max(0.05, Math.min(1, obedienceRaw));
  const accel = (25 + rawStat(h, 'acceleration') * 9) * age * (h.traits.includes('lazy') ? 0.85 : 1);
  const bondHandling = 1 + (bond - 1) * 0.04;

  return {
    gaitSpeed,
    maxGait,
    accel,
    decel: accel * 1.6 + rawStat(h, 'strength') * 4,
    turnSlow: (2.4 + agility * 0.12) * gearMul(h, 'handling') * bondHandling,
    turnFast: (0.75 + agility * 0.11) * gearMul(h, 'handling') * bondHandling,
    staminaMax: maxStamina(h),
    drainMul: traitMul(h, 'drain') * gearMul(h, 'staminaDrain') * (1.25 - rawStat(h, 'endurance') * 0.04) * (1 - (bond - 1) * 0.03),
    regenMul: (0.5 + rawStat(h, 'recovery') * 0.1) * traitMul(h, 'recovery') * gearMul(h, 'staminaRegen') * (h.hunger < 25 ? 0.6 : 1) * (h.thirst < 25 ? 0.6 : 1),
    jumpSkill: Math.min(0.98, 0.15 + rawStat(h, 'jumping') * 0.06 + h.training.jumping / 250 + bond * 0.04 - inj.leg / 200),
    obedience,
    fear: traitMul(h, 'fear') * (1.6 - rawStat(h, 'courage') * 0.1) * (1 - h.training.desensitised / 250) * (1 - (bond - 1) * 0.06),
    terrain: Math.min(1, (0.55 + rawStat(h, 'trail') * 0.045) * gearMul(h, 'terrain') * (h.hoof < 40 ? 0.85 : 1)),
    carry: rawStat(h, 'carry') * 1.5 + gearSum(h, 'carry'),
    reinLag: Math.max(0, 0.28 - resp * 0.022 - bond * 0.015),
    comfort: (rawStat(h, 'comfort') / 7) * gearMul(h, 'comfort'),
  };
}

/** A short descriptor of a 1..10 stat for the UI. */
export function statWord(v: number): string {
  if (v >= 9) return 'Exceptional';
  if (v >= 7.5) return 'Strong';
  if (v >= 6) return 'Good';
  if (v >= 4.5) return 'Average';
  if (v >= 3) return 'Modest';
  return 'Poor';
}
