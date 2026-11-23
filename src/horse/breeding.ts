/**
 * Horse breeding at the Brannigan ranch. A foal inherits genes (mid-parent
 * value plus variation), coat from either parent, pattern and traits with
 * inheritance chances, and the dam's breed (cross-breeds are recorded in the
 * foal's history). Pure logic — see tests/unit/horse/breeding.test.ts.
 */
import { Rng } from '../core/rng.ts';
import { TRAIT_CONFLICTS } from '../data/personalities.ts';
import { generateHorse } from './generator.ts';
import { addHistory, type HorseData } from './horse.ts';
import { maxHealth, maxStamina } from './stats.ts';

/** Game days from covering to foaling (compressed from ~11 months). */
export const GESTATION_DAYS = 3;

export function canBreed(dam: HorseData, sire: HorseData): string | null {
  if (dam.sex !== 'mare') return `${dam.name} is not a mare.`;
  if (sire.sex !== 'stallion') return `${sire.name} is not a stallion (geldings can't sire foals).`;
  if (dam.age < 4 || sire.age < 4) return 'Both horses must be at least four years old.';
  if (dam.age > 20) return `${dam.name} is too old to carry a foal.`;
  if (dam.health < maxHealth(dam) * 0.6 || dam.injuries.length) return `${dam.name} must be healthy and uninjured.`;
  return null;
}

/** Produce a foal from two parents. Deterministic for a seed. */
export function breedFoal(dam: HorseData, sire: HorseData, seed: number, day: number): HorseData {
  const rng = new Rng(seed);
  const foal = generateHorse(seed, { breedId: dam.breedId, training: 'wild', owner: 'player', age: 0.4 });
  // Genes: mid-parent plus Mendelian-ish noise, clamped to the same range as wild stock.
  for (const k of Object.keys(foal.genes)) {
    const mid = ((dam.genes[k] ?? 1) + (sire.genes[k] ?? 1)) / 2;
    foal.genes[k] = Math.min(1.12, Math.max(0.88, Math.round((mid + rng.gauss(0, 0.025)) * 1000) / 1000));
  }
  // Coat and pattern come from one parent or the other.
  const coatFrom = rng.chance(0.5) ? dam : sire;
  foal.appearance.coat = coatFrom.appearance.coat;
  foal.appearance.pattern = rng.chance(0.5) ? dam.appearance.pattern : sire.appearance.pattern;
  // Personality: each parent's traits are inherited with 45% chance each; no conflicts.
  const traits: string[] = [];
  for (const t of [...dam.traits, ...sire.traits]) {
    if (traits.includes(t) || traits.length >= 2 || !rng.chance(0.45)) continue;
    if (traits.some((x) => TRAIT_CONFLICTS.some(([a, b]) => (a === x && b === t) || (a === t && b === x)))) continue;
    traits.push(t);
  }
  if (traits.length) foal.traits = traits;
  foal.name = 'Unnamed foal';
  foal.tameness = 100; // ranch-raised foals are handled from birth
  foal.training = { groundwork: 10, saddle: 0, speed: 0, jumping: 0, desensitised: 15 };
  foal.trust = 60;
  foal.bondXp = 60;
  foal.gear = {};
  foal.gearCondition = {};
  foal.health = maxHealth(foal);
  foal.stamina = maxStamina(foal);
  addHistory(foal, day, `Foaled at the Brannigan ranch, out of ${dam.name} by ${sire.name}${dam.breedId !== sire.breedId ? ' (cross-bred)' : ''}.`);
  return foal;
}
