/**
 * Wildlife species. Behaviour archetypes and the BEHAVIOUR knobs are consumed
 * by entities/animal.ts; look parameters by render/animalSprite.ts; sizes,
 * habitats and yields by systems/hunting.ts (hunting quality, variant
 * streaming). New species reuse an artist sprite through `spriteOf` plus a
 * `tint`, so no sprite file changes are needed to add one.
 */
export type Archetype = 'prey' | 'predator' | 'grazer' | 'bird' | 'snake' | 'herd';

/** Game size class: decides which weapon takes a clean pelt. */
export type GameSize = 'small' | 'medium' | 'large';

/** Where and when a species is found. Hours are a [from, to) window on the 24h clock (wraps past midnight). */
export interface Habitat {
  regions: string[];
  hours?: [number, number];
  /** Weather kinds it comes out in (absent = any). */
  weather?: string[];
  /** Spawn weight against the other variants that fit the moment. */
  weight: number;
}

export interface SpeciesDef {
  id: string;
  name: string;
  archetype: Archetype;
  health: number;
  speed: number; // flee/run px/s
  walk: number;
  /** Sight radius in px; how far it notices the player (crouching halves). */
  sense: number;
  /** Hearing radius in px for gunshots, shouts and hooves. */
  hearing: number;
  /** 0..1 — how readily it bolts and how long it stays spooked. */
  wariness: number;
  /** Game size class for weapon fit. */
  size: GameSize;
  /** Predators: damage per bite, attack range. */
  damage?: number;
  /** Hunts other animals / horses / player. */
  aggression?: number; // 0..1 chance to attack the player when close
  herd?: [number, number];
  /** Fear it causes horses (multiplied by horse fear). */
  horseFear: number;
  yields: { item: string; qty: [number, number] }[];
  look: {
    body: [string, string, string];
    len: number; // body length
    h: number; // body height
    leg: number;
    neck: number;
    head: number;
    tail: 'short' | 'bushy' | 'long' | 'tuft' | 'none' | 'fan';
    horns?: 'antlers' | 'bigAntlers' | 'pronghorn' | 'curl' | 'bison';
    belly?: string;
    rump?: string;
    mane?: string;
    ears?: number;
  };
  /** Night active. */
  nocturnal?: boolean;
  sound?: string;
  /** Species whose animals this predator hunts (ids). */
  preys?: string[];
  /** Print left on soft ground. */
  prints?: 'hoof' | 'paw' | 'none';
  /** Draw with this species' sprite set (new species reuse an artist sprite). */
  spriteOf?: string;
  /** Recolour applied to the borrowed sprite: per-channel multiplier and offset (outline pixels are kept). */
  tint?: { mul: [number, number, number]; add?: [number, number, number] };
  /** Scale applied to the borrowed sprite (0.8 = a smaller cousin). */
  scale?: number;
  /** Habitat used by the hunting system to stream species that are not in a region's base ecology. */
  habitat?: Habitat;
  /** Lands on carcasses (vultures, ravens). */
  scavenger?: boolean;
  /** Only seen flying/circling until it finds a carcass. */
  circles?: boolean;
}

/** Behaviour tuning for entities/animal.ts. Distances in px, times in real seconds unless noted. */
export const BEHAVIOUR = {
  /** Full AI inside this distance from the player; coarse herd drift beyond it. */
  fullAiRange: 600,
  /** Members look for a herd / a leader within this radius. */
  herdJoinRadius: 220,
  /** Loose formation: each member keeps a slot this far from the leader. */
  formation: { minDist: 18, maxDist: 44, slack: 26, catchUpDist: 90 },
  /** Herd daily rhythm, hours on the 24h clock. */
  rhythm: { waterDawn: [5, 8] as [number, number], waterDusk: [17, 20] as [number, number], bed: [11, 15] as [number, number] },
  /** Search radius (tiles) for water and shade when the leader changes activity. */
  searchTiles: 18,
  /** Seconds a herd drinks / beds before the leader re-evaluates. */
  drinkSeconds: 14,
  /** Alarm spreads to herd mates within this radius; flee lasts base + wariness * extra. */
  alarm: { radius: 260, fleeBase: 5, fleeExtra: 9 },
  /** Prey notices a stalking predator at this fraction of its sight radius. */
  predatorNotice: 0.75,
  /** Predators: seconds of hunger before they look for prey, give-up time, feeding time. */
  predator: { hungerAfter: 70, giveUp: 16, feedSeconds: 24, sprintRange: 130, fedAggressionMul: 0.3 },
  /** Vultures: carcass search radius, flee distance from the player, circle radius. */
  scavenger: { searchRadius: 480, fleeFrom: 70, circleRadius: 80 },
  /** Ground birds take off at this fraction of their sight radius and stay up this long. */
  bird: { takeoffAt: 0.45, airSeconds: [4, 7] as [number, number], flyMul: 1.3, altitude: 30 },
  /** Rabbits: zigzag amplitude (rad) and rate (Hz); burrow return distance. */
  rabbit: { zigzag: 0.9, zigzagHz: 9, burrowRange: 160, hideSeconds: [40, 90] as [number, number] },
  /** Snake: rattle warning distance, strike distance, warning seconds before a bite. */
  snake: { rattleAt: 46, strikeAt: 20, warnSeconds: 0.8, cooldown: 1.6 },
  /** Bear bluff charge: trigger fraction of sense, stop distance, seconds standing before it decides. */
  bear: { stopAt: 44, standSeconds: 2.6, commitAt: 30, retryAfter: 60 },
  /** Stampede: seconds, trample damage to a walker, horse stress. */
  stampede: { seconds: [9, 13] as [number, number], trampleDamage: 18, trampleRange: 13, horseStress: 100 },
  /** Prints: stride length in px between prints; tracks sign spacing; droppings while grazing (seconds). */
  signs: { strideHoof: 14, stridePaw: 10, trackEveryPx: 220, droppingsEverySeconds: 90 },
  /** Carcasses stay this many seconds (vultures need time to arrive). */
  carcassSeconds: 600,
} as const;

/** Tile objects that count as shade for midday bedding. */
export const SHADE_TREES = ['Pine', 'Oak', 'Cottonwood', 'Juniper', 'Aspen', 'SnowPine'] as const;

export const SPECIES: SpeciesDef[] = [
  { id: 'deer', name: 'Mule Deer', archetype: 'prey', health: 60, speed: 150, walk: 25, sense: 220, hearing: 300, wariness: 0.7, size: 'medium', horseFear: 0, herd: [1, 4], prints: 'hoof',
    yields: [{ item: 'peltDeer', qty: [1, 1] }, { item: 'meatPrime', qty: [1, 2] }],
    look: { body: ['#6e5038', '#8f6a4b', '#ad8664'], len: 8, h: 4.5, leg: 9, neck: 6, head: 4, tail: 'short', horns: 'antlers', belly: '#d8c7ad', rump: '#e6dccb', ears: 2.5 } },
  { id: 'elk', name: 'Elk', archetype: 'prey', health: 120, speed: 140, walk: 25, sense: 240, hearing: 320, wariness: 0.6, size: 'large', horseFear: 0, herd: [1, 5], prints: 'hoof',
    yields: [{ item: 'peltDeer', qty: [1, 2] }, { item: 'meatPrime', qty: [2, 3] }, { item: 'antlers', qty: [0, 1] }],
    look: { body: ['#5a3d26', '#7d5a3c', '#a07a55'], len: 10, h: 5.5, leg: 10.5, neck: 7, head: 4.5, tail: 'short', horns: 'bigAntlers', belly: '#3d2a1c', rump: '#cdb38f', mane: '#3d2a1c', ears: 2 } },
  { id: 'pronghorn', name: 'Pronghorn', archetype: 'prey', health: 40, speed: 190, walk: 30, sense: 260, hearing: 300, wariness: 0.85, size: 'medium', horseFear: 0, herd: [2, 6], prints: 'hoof',
    yields: [{ item: 'peltDeer', qty: [1, 1] }, { item: 'meatGame', qty: [1, 2] }],
    look: { body: ['#9a6a3a', '#bf8748', '#d6a466'], len: 7, h: 4, leg: 8.5, neck: 5, head: 3.5, tail: 'short', horns: 'pronghorn', belly: '#f2ead8', rump: '#f2ead8', ears: 2 } },
  { id: 'rabbit', name: 'Jackrabbit', archetype: 'prey', health: 10, speed: 170, walk: 20, sense: 120, hearing: 200, wariness: 0.9, size: 'small', horseFear: 0, prints: 'paw',
    yields: [{ item: 'peltRabbit', qty: [1, 1] }, { item: 'meatGame', qty: [1, 1] }],
    look: { body: ['#7c6a55', '#9c8870', '#bba78c'], len: 3, h: 2.5, leg: 2, neck: 1, head: 2, tail: 'tuft', belly: '#e4dccf', ears: 4 } },
  { id: 'coyote', name: 'Coyote', archetype: 'predator', health: 35, speed: 165, walk: 35, sense: 200, hearing: 320, wariness: 0.6, size: 'small', damage: 6, aggression: 0.08, horseFear: 0.4, herd: [1, 3], nocturnal: true, prints: 'paw',
    preys: ['rabbit', 'cottontail', 'turkey', 'duck'],
    yields: [{ item: 'peltCoyote', qty: [1, 1] }, { item: 'meatGame', qty: [0, 1] }],
    look: { body: ['#7d6347', '#9e8060', '#bea07c'], len: 6, h: 3.2, leg: 6, neck: 3, head: 3.5, tail: 'bushy', belly: '#d9ccb6', ears: 2.5 } },
  { id: 'wolf', name: 'Grey Wolf', archetype: 'predator', health: 70, speed: 175, walk: 40, sense: 260, hearing: 380, wariness: 0.3, size: 'medium', damage: 14, aggression: 0.55, horseFear: 1, herd: [2, 4], nocturnal: true, prints: 'paw',
    preys: ['deer', 'whitetail', 'pronghorn', 'rabbit', 'cottontail', 'elk', 'bighorn', 'mountainGoat'],
    yields: [{ item: 'peltWolf', qty: [1, 1] }, { item: 'meatGame', qty: [1, 1] }],
    look: { body: ['#5a5550', '#7c7670', '#a39d95'], len: 7.5, h: 4, leg: 7, neck: 3.5, head: 4, tail: 'bushy', belly: '#cfc8bd', ears: 2.5 } },
  { id: 'cougar', name: 'Cougar', archetype: 'predator', health: 90, speed: 185, walk: 30, sense: 230, hearing: 320, wariness: 0.3, size: 'medium', damage: 24, aggression: 0.8, horseFear: 1.6, prints: 'paw',
    preys: ['deer', 'whitetail', 'bighorn', 'mountainGoat', 'rabbit', 'javelina'],
    yields: [{ item: 'peltCougar', qty: [1, 1] }, { item: 'meatGame', qty: [1, 2] }],
    look: { body: ['#8a6a45', '#ad8a5f', '#c9a97f'], len: 8, h: 3.8, leg: 6, neck: 2.5, head: 3.5, tail: 'long', belly: '#e2d3bb', ears: 1.5 } },
  { id: 'bear', name: 'Black Bear', archetype: 'predator', health: 220, speed: 150, walk: 25, sense: 180, hearing: 260, wariness: 0.2, size: 'large', damage: 32, aggression: 0.35, horseFear: 2, prints: 'paw',
    yields: [{ item: 'peltBear', qty: [1, 1] }, { item: 'meatGame', qty: [2, 3] }],
    look: { body: ['#16120f', '#2a231d', '#433830'], len: 9, h: 7, leg: 6, neck: 3, head: 4.5, tail: 'none', belly: '#2a231d', ears: 1.5 } },
  { id: 'bison', name: 'Plains Bison', archetype: 'herd', health: 300, speed: 130, walk: 18, sense: 180, hearing: 300, wariness: 0.35, size: 'large', damage: 30, aggression: 0.05, horseFear: 0.3, herd: [3, 8], prints: 'hoof',
    yields: [{ item: 'peltBison', qty: [1, 1] }, { item: 'meatGame', qty: [3, 4] }],
    look: { body: ['#2e2016', '#4a3424', '#654a34'], len: 11, h: 7.5, leg: 7, neck: 3, head: 5, tail: 'tuft', horns: 'bison', mane: '#2a1c12', ears: 1 } },
  { id: 'cattle', name: 'Longhorn Steer', archetype: 'herd', health: 160, speed: 110, walk: 14, sense: 90, hearing: 220, wariness: 0.2, size: 'large', horseFear: 0, herd: [4, 9], prints: 'hoof',
    yields: [{ item: 'meatGame', qty: [3, 4] }],
    look: { body: ['#6a3a22', '#8a5232', '#a86e48'], len: 10, h: 5, leg: 7.5, neck: 4.5, head: 4.5, tail: 'tuft', horns: 'bison', belly: '#d8c8b0', ears: 1 } },
  { id: 'boar', name: 'Feral Hog', archetype: 'predator', health: 70, speed: 140, walk: 25, sense: 160, hearing: 240, wariness: 0.3, size: 'medium', damage: 12, aggression: 0.3, horseFear: 0.5, herd: [1, 3], prints: 'hoof',
    yields: [{ item: 'meatGame', qty: [2, 3] }],
    look: { body: ['#2d2520', '#463a32', '#5e5046'], len: 7, h: 4.5, leg: 4, neck: 1.5, head: 4, tail: 'short', ears: 1.5 } },
  { id: 'bighorn', name: 'Bighorn Sheep', archetype: 'prey', health: 70, speed: 140, walk: 20, sense: 220, hearing: 280, wariness: 0.65, size: 'medium', horseFear: 0, herd: [2, 5], prints: 'hoof',
    yields: [{ item: 'meatGame', qty: [1, 2] }, { item: 'antlers', qty: [0, 1] }],
    look: { body: ['#7a6450', '#9a826b', '#b9a18a'], len: 7, h: 4.5, leg: 6.5, neck: 3.5, head: 3.5, tail: 'short', horns: 'curl', rump: '#e9e1d3', belly: '#e9e1d3', ears: 1.5 } },
  { id: 'wildHorse', name: 'Wild Mustang', archetype: 'herd', health: 100, speed: 170, walk: 30, sense: 240, hearing: 300, wariness: 0.6, size: 'large', horseFear: 0, herd: [3, 6], prints: 'hoof',
    yields: [],
    look: { body: ['#000', '#000', '#000'], len: 0, h: 0, leg: 0, neck: 0, head: 0, tail: 'none' } },
  { id: 'turkey', name: 'Wild Turkey', archetype: 'bird', health: 15, speed: 110, walk: 18, sense: 160, hearing: 220, wariness: 0.8, size: 'small', horseFear: 0, herd: [2, 5], prints: 'paw',
    yields: [{ item: 'meatGame', qty: [1, 1] }, { item: 'feathers', qty: [3, 6] }],
    look: { body: ['#2d241c', '#4a3b2d', '#6b5843'], len: 3, h: 3, leg: 3, neck: 3, head: 1.5, tail: 'fan', ears: 0 } },
  { id: 'hawk', name: 'Red-tailed Hawk', archetype: 'bird', health: 8, speed: 120, walk: 0, sense: 200, hearing: 200, wariness: 0.9, size: 'small', horseFear: 0, circles: true, prints: 'none',
    yields: [{ item: 'feathers', qty: [2, 4] }],
    look: { body: ['#5a3c26', '#8a6040', '#c79a6c'], len: 4, h: 1, leg: 0, neck: 0, head: 1, tail: 'fan' } },
  { id: 'vulture', name: 'Turkey Vulture', archetype: 'bird', health: 10, speed: 90, walk: 0, sense: 160, hearing: 200, wariness: 0.7, size: 'small', horseFear: 0, circles: true, scavenger: true, prints: 'none',
    yields: [{ item: 'feathers', qty: [2, 5] }],
    look: { body: ['#1e1a18', '#2e2925', '#4a433d'], len: 5, h: 1, leg: 0, neck: 0, head: 1, tail: 'fan' } },
  { id: 'duck', name: 'Mallard', archetype: 'bird', health: 6, speed: 100, walk: 10, sense: 140, hearing: 200, wariness: 0.8, size: 'small', horseFear: 0, herd: [2, 4], prints: 'paw',
    yields: [{ item: 'meatGame', qty: [1, 1] }, { item: 'feathers', qty: [1, 3] }],
    look: { body: ['#4d4033', '#6e5d4a', '#8f7b62'], len: 2.5, h: 1.6, leg: 1, neck: 1.5, head: 1.2, tail: 'short', mane: '#2e6b3a' } },
  { id: 'heron', name: 'Great Blue Heron', archetype: 'bird', health: 10, speed: 90, walk: 10, sense: 180, hearing: 220, wariness: 0.8, size: 'small', horseFear: 0, prints: 'paw',
    yields: [{ item: 'feathers', qty: [3, 6] }],
    look: { body: ['#5d6a78', '#7c8a98', '#a3b0bc'], len: 3, h: 2, leg: 6, neck: 5, head: 1.5, tail: 'short' } },
  { id: 'rattlesnake', name: 'Rattlesnake', archetype: 'snake', health: 8, speed: 40, walk: 12, sense: 60, hearing: 80, wariness: 0.1, size: 'small', damage: 10, aggression: 0.9, horseFear: 1.4, prints: 'none',
    yields: [],
    look: { body: ['#6b5a40', '#8f7a56', '#b29c72'], len: 6, h: 1, leg: 0, neck: 0, head: 1.5, tail: 'none' } },

  // --- Variants: artist sprites reused with a tint (see spriteOf). Streamed by systems/hunting.ts from `habitat`. ---
  { id: 'whitetail', name: 'Whitetail Deer', archetype: 'prey', health: 55, speed: 160, walk: 25, sense: 210, hearing: 300, wariness: 0.8, size: 'medium', horseFear: 0, herd: [2, 5], prints: 'hoof',
    spriteOf: 'deer', tint: { mul: [1.14, 0.96, 0.84], add: [6, 0, 0] }, scale: 0.92,
    habitat: { regions: ['blackwater', 'pinehollow', 'dustfall'], hours: [5, 10], weight: 3 },
    yields: [{ item: 'peltDeer', qty: [1, 1] }, { item: 'meatPrime', qty: [1, 2] }],
    look: { body: ['#7e5a3c', '#a0744d', '#c09468'], len: 7.5, h: 4.3, leg: 8.5, neck: 6, head: 4, tail: 'short', horns: 'antlers', belly: '#e8dcc8', rump: '#f0eadc', ears: 2.5 } },
  { id: 'cottontail', name: 'Cottontail', archetype: 'prey', health: 6, speed: 150, walk: 18, sense: 110, hearing: 190, wariness: 0.95, size: 'small', horseFear: 0, prints: 'paw',
    spriteOf: 'rabbit', tint: { mul: [0.92, 0.9, 0.9], add: [4, 4, 8] }, scale: 0.8,
    habitat: { regions: ['dustfall', 'blackwater', 'pinehollow'], hours: [17, 8], weight: 4 },
    yields: [{ item: 'peltRabbit', qty: [1, 1] }, { item: 'meatGame', qty: [1, 1] }],
    look: { body: ['#746a60', '#948878', '#b4a898'], len: 2.5, h: 2.2, leg: 1.8, neck: 1, head: 1.8, tail: 'tuft', belly: '#eee8e0', ears: 3 } },
  { id: 'greyFox', name: 'Grey Fox', archetype: 'predator', health: 22, speed: 160, walk: 30, sense: 190, hearing: 320, wariness: 0.85, size: 'small', damage: 3, aggression: 0, horseFear: 0.15, nocturnal: true, prints: 'paw',
    spriteOf: 'coyote', tint: { mul: [0.74, 0.74, 0.82], add: [10, 10, 18] }, scale: 0.78,
    preys: ['rabbit', 'cottontail', 'turkey', 'duck'],
    habitat: { regions: ['pinehollow', 'blackwater', 'dustfall'], hours: [18, 7], weight: 2 },
    yields: [{ item: 'peltFox', qty: [1, 1] }, { item: 'meatGame', qty: [0, 1] }],
    look: { body: ['#5c5a60', '#7c7a80', '#9c9aa0'], len: 5, h: 2.8, leg: 5, neck: 2.5, head: 3, tail: 'bushy', belly: '#d8d4d0', ears: 2.5 } },
  { id: 'grizzly', name: 'Grizzly Bear', archetype: 'predator', health: 320, speed: 160, walk: 25, sense: 200, hearing: 280, wariness: 0.1, size: 'large', damage: 42, aggression: 0.45, horseFear: 2.4, prints: 'paw',
    spriteOf: 'bear', tint: { mul: [1.7, 1.35, 1.0], add: [46, 24, 8] }, scale: 1.1,
    preys: ['elk', 'deer', 'bighorn', 'mountainGoat'],
    habitat: { regions: ['sierra', 'pinehollow'], hours: [5, 21], weight: 0.7 },
    yields: [{ item: 'peltGrizzly', qty: [1, 1] }, { item: 'meatGame', qty: [3, 4] }],
    look: { body: ['#5a3c22', '#7a5430', '#9a6e44'], len: 10, h: 7.5, leg: 6.5, neck: 3, head: 5, tail: 'none', belly: '#6a4a2e', ears: 1.5 } },
  { id: 'mountainGoat', name: 'Mountain Goat', archetype: 'prey', health: 65, speed: 135, walk: 18, sense: 230, hearing: 280, wariness: 0.7, size: 'medium', horseFear: 0, herd: [2, 4], prints: 'hoof',
    spriteOf: 'bighorn', tint: { mul: [1.3, 1.3, 1.28], add: [58, 58, 56] }, scale: 0.95,
    habitat: { regions: ['sierra'], weight: 2 },
    yields: [{ item: 'peltGoat', qty: [1, 1] }, { item: 'meatGame', qty: [1, 2] }],
    look: { body: ['#c8c4bc', '#dcd8d0', '#f0ece4'], len: 7, h: 4.5, leg: 6, neck: 3.5, head: 3.5, tail: 'short', horns: 'curl', rump: '#f4f0e8', belly: '#f4f0e8', ears: 1.5 } },
  { id: 'javelina', name: 'Javelina', archetype: 'predator', health: 45, speed: 130, walk: 22, sense: 150, hearing: 240, wariness: 0.45, size: 'medium', damage: 8, aggression: 0.12, horseFear: 0.4, herd: [2, 5], prints: 'hoof',
    spriteOf: 'boar', tint: { mul: [1.15, 1.12, 1.1], add: [34, 32, 30] }, scale: 0.82,
    habitat: { regions: ['drylands', 'redstone'], hours: [16, 9], weight: 2 },
    yields: [{ item: 'meatGame', qty: [1, 2] }],
    look: { body: ['#4a443c', '#66605a', '#827c76'], len: 6, h: 4, leg: 3.5, neck: 1.5, head: 3.5, tail: 'short', ears: 1.5 } },
  { id: 'raven', name: 'Raven', archetype: 'bird', health: 6, speed: 100, walk: 0, sense: 170, hearing: 220, wariness: 0.8, size: 'small', horseFear: 0, circles: true, scavenger: true, prints: 'none',
    spriteOf: 'vulture', tint: { mul: [0.55, 0.55, 0.72], add: [0, 0, 10] }, scale: 0.7,
    habitat: { regions: ['sierra', 'pinehollow', 'redstone'], weight: 2 },
    yields: [{ item: 'feathers', qty: [2, 4] }],
    look: { body: ['#101014', '#1e1e26', '#30303a'], len: 3.5, h: 1, leg: 0, neck: 0, head: 1, tail: 'fan' } },
];

const BY_ID = new Map(SPECIES.map((s) => [s.id, s]));
export function getSpecies(id: string): SpeciesDef {
  const s = BY_ID.get(id);
  if (!s) throw new Error(`Unknown species ${id}`);
  return s;
}

/** Species streamed by the hunting system (have a habitat and are not in a region's base ecology). */
export function variantSpecies(): SpeciesDef[] {
  return SPECIES.filter((s) => s.habitat);
}

/** Is the hour inside a window that may wrap past midnight (e.g. [18, 7])? */
export function hourInWindow(hour: number, win: [number, number] | undefined): boolean {
  if (!win) return true;
  const [a, b] = win;
  return a <= b ? hour >= a && hour < b : hour >= a || hour < b;
}
