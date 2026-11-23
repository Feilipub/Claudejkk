/**
 * Procedural horse generation. Produces unique individuals from breed data:
 * genetics, coat, pattern, markings, age, sex, personality, preferences and
 * starting training. Deterministic for a given seed.
 */
import { Rng } from '../core/rng.ts';
import { BREEDS, getBreed, type BreedDef } from '../data/breeds.ts';
import { FACE_MARKINGS, LEG_MARKINGS, MANE_STYLES, TAIL_STYLES } from '../data/coats.ts';
import { TRAITS, TRAIT_CONFLICTS } from '../data/personalities.ts';
import { HORSE_NAMES } from '../data/names.ts';
import type { HorseData, Sex } from './horse.ts';
import { maxHealth, maxStamina } from './stats.ts';

export const STAT_KEYS = [
  'speed', 'acceleration', 'stamina', 'recovery', 'agility', 'handling', 'jumping', 'endurance',
  'strength', 'courage', 'responsiveness', 'health', 'carry', 'trail', 'temperament', 'comfort',
] as const;

const FAVORITES = ['carrot', 'apple', 'sugarCube', 'oats'];
const DISLIKES = ['water', 'night', 'crowds', 'gunfire', 'dogs', 'none', 'none'];

export interface GenerateOptions {
  breedId?: string;
  regionId?: string;
  owner?: string;
  /** 'green' (barely broke), 'broke', 'trained', 'wild'. */
  training?: 'wild' | 'green' | 'broke' | 'trained';
  sex?: Sex;
  name?: string;
  age?: number;
}

/** Pick a breed appropriate for a region (or any breed), weighted by commonness. */
export function pickBreed(rng: Rng, regionId?: string, wildOnly = false): BreedDef {
  let pool = BREEDS.filter((b) => (!regionId || b.regions.includes(regionId)) && (!wildOnly || b.wild));
  if (pool.length === 0) pool = BREEDS.filter((b) => !wildOnly || b.wild);
  return rng.weighted(pool, (b) => b.commonness);
}

function pickTraits(rng: Rng, breed: BreedDef): string[] {
  const weight = (id: string) => breed.traitBias[id] ?? 1;
  const first = rng.weighted(TRAITS, (t) => weight(t.id)).id;
  if (rng.chance(0.3)) return [first];
  const conflicts = (a: string, b: string) => a === b || TRAIT_CONFLICTS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const candidates = TRAITS.filter((t) => !conflicts(first, t.id));
  return [first, rng.weighted(candidates, (t) => weight(t.id)).id];
}

/** Generate a complete, unique horse. */
export function generateHorse(seed: number, opts: GenerateOptions = {}): HorseData {
  const rng = new Rng(seed);
  const breed = opts.breedId ? getBreed(opts.breedId) : pickBreed(rng, opts.regionId, opts.training === 'wild');
  const coat = rng.weighted(breed.coats, (c) => c.weight).coat;
  const pattern = rng.weighted(breed.patterns, (p) => p.weight).id;
  const sex: Sex = opts.sex ?? (rng.chance(0.5) ? 'mare' : rng.chance(0.75) ? 'gelding' : 'stallion');
  const age = opts.age ?? Math.round(rng.range(3, 16) * 10) / 10;

  const genes: Record<string, number> = {};
  for (const k of STAT_KEYS) genes[k] = Math.round(rng.gauss(1, 0.045) * 1000) / 1000;
  for (const k of STAT_KEYS) genes[k] = Math.min(1.12, Math.max(0.88, genes[k]!));

  const faceChance = pattern === 'solid' ? 0.6 : 0.85;
  const face = rng.chance(faceChance) ? rng.pick(FACE_MARKINGS.slice(1)) : 'none';
  const legChance = pattern === 'sabino' ? 0.9 : 0.35;
  const legs = [0, 1, 2, 3].map(() => (rng.chance(legChance) ? rng.pick(LEG_MARKINGS.slice(1)) : 'none')) as HorseData['appearance']['legs'];

  const training = opts.training ?? 'broke';
  const tBase = { wild: 0, green: 12, broke: 35, trained: 65 }[training];
  const tr = () => Math.max(0, Math.min(100, Math.round(tBase + rng.range(-8, 12))));

  const traits = pickTraits(rng, breed);
  const name = opts.name ?? rng.pick(HORSE_NAMES);
  const id = `h_${seed.toString(36)}`;

  const h: HorseData = {
    id,
    name,
    breedId: breed.id,
    age,
    sex,
    appearance: {
      coat,
      pattern,
      face,
      legs,
      maneStyle: training === 'wild' ? 'long' : rng.pick(MANE_STYLES.slice(0, 2)),
      tailStyle: training === 'wild' ? 'long' : rng.pick(TAIL_STYLES.slice(0, 2)),
      maneLength: Math.round((breed.maneLength * 0.6 + 0.6 + rng.range(-0.1, 0.1)) * 100) / 100,
      maneTint: null,
      patternSeed: rng.int(1, 1e9),
    },
    traits,
    genes,
    training: { groundwork: tr(), saddle: tr(), speed: tr(), jumping: tr(), desensitised: tr() },
    health: 0,
    stamina: 0,
    energy: 100,
    hunger: rng.range(70, 100),
    thirst: rng.range(70, 100),
    stress: training === 'wild' ? 40 : 5,
    cleanliness: rng.range(55, 95),
    hoof: rng.range(70, 100),
    injuries: [],
    bondXp: 0,
    trust: training === 'wild' ? 5 : 30,
    bondToday: {},
    bondDay: 0,
    gear: training === 'wild' ? {} : { bridle: 'bridleRope' },
    gearCondition: training === 'wild' ? {} : { bridle: 100 },
    bagItems: {},
    owner: opts.owner ?? (training === 'wild' ? 'wild' : 'trader'),
    history: [],
    favoriteFood: rng.pick(FAVORITES),
    dislike: rng.pick(DISLIKES),
    tameness: training === 'wild' ? 0 : 100,
    kmRidden: 0,
    x: 0,
    y: 0,
    tiedAt: null,
    stabledAt: null,
    alive: true,
  };
  h.health = maxHealth(h);
  h.stamina = maxStamina(h);
  return h;
}
