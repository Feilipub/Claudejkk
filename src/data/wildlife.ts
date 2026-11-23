/**
 * Wildlife species. Behaviour archetypes are consumed by entities/animal.ts;
 * look parameters by render/animalSprite.ts. Yields by systems/hunting.
 */
export type Archetype = 'prey' | 'predator' | 'grazer' | 'bird' | 'snake' | 'herd';

export interface SpeciesDef {
  id: string;
  name: string;
  archetype: Archetype;
  health: number;
  speed: number; // flee/run px/s
  walk: number;
  /** Detection radius in px; how far it notices the player (crouching halves). */
  sense: number;
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
}

export const SPECIES: SpeciesDef[] = [
  { id: 'deer', name: 'Mule Deer', archetype: 'prey', health: 60, speed: 150, walk: 25, sense: 220, horseFear: 0, herd: [1, 4],
    yields: [{ item: 'peltDeer', qty: [1, 1] }, { item: 'meatPrime', qty: [1, 2] }],
    look: { body: ['#6e5038', '#8f6a4b', '#ad8664'], len: 8, h: 4.5, leg: 9, neck: 6, head: 4, tail: 'short', horns: 'antlers', belly: '#d8c7ad', rump: '#e6dccb', ears: 2.5 } },
  { id: 'elk', name: 'Elk', archetype: 'prey', health: 120, speed: 140, walk: 25, sense: 240, horseFear: 0, herd: [1, 5],
    yields: [{ item: 'peltDeer', qty: [1, 2] }, { item: 'meatPrime', qty: [2, 3] }, { item: 'antlers', qty: [0, 1] }],
    look: { body: ['#5a3d26', '#7d5a3c', '#a07a55'], len: 10, h: 5.5, leg: 10.5, neck: 7, head: 4.5, tail: 'short', horns: 'bigAntlers', belly: '#3d2a1c', rump: '#cdb38f', mane: '#3d2a1c', ears: 2 } },
  { id: 'pronghorn', name: 'Pronghorn', archetype: 'prey', health: 40, speed: 190, walk: 30, sense: 260, horseFear: 0, herd: [2, 6],
    yields: [{ item: 'peltDeer', qty: [1, 1] }, { item: 'meatGame', qty: [1, 2] }],
    look: { body: ['#9a6a3a', '#bf8748', '#d6a466'], len: 7, h: 4, leg: 8.5, neck: 5, head: 3.5, tail: 'short', horns: 'pronghorn', belly: '#f2ead8', rump: '#f2ead8', ears: 2 } },
  { id: 'rabbit', name: 'Jackrabbit', archetype: 'prey', health: 10, speed: 170, walk: 20, sense: 120, horseFear: 0,
    yields: [{ item: 'peltRabbit', qty: [1, 1] }, { item: 'meatGame', qty: [1, 1] }],
    look: { body: ['#7c6a55', '#9c8870', '#bba78c'], len: 3, h: 2.5, leg: 2, neck: 1, head: 2, tail: 'tuft', belly: '#e4dccf', ears: 4 } },
  { id: 'coyote', name: 'Coyote', archetype: 'predator', health: 35, speed: 165, walk: 35, sense: 200, damage: 6, aggression: 0.08, horseFear: 0.4, herd: [1, 3], nocturnal: true,
    yields: [{ item: 'peltCoyote', qty: [1, 1] }, { item: 'meatGame', qty: [0, 1] }],
    look: { body: ['#7d6347', '#9e8060', '#bea07c'], len: 6, h: 3.2, leg: 6, neck: 3, head: 3.5, tail: 'bushy', belly: '#d9ccb6', ears: 2.5 } },
  { id: 'wolf', name: 'Grey Wolf', archetype: 'predator', health: 70, speed: 175, walk: 40, sense: 260, damage: 14, aggression: 0.55, horseFear: 1, herd: [2, 4], nocturnal: true,
    yields: [{ item: 'peltWolf', qty: [1, 1] }, { item: 'meatGame', qty: [1, 1] }],
    look: { body: ['#5a5550', '#7c7670', '#a39d95'], len: 7.5, h: 4, leg: 7, neck: 3.5, head: 4, tail: 'bushy', belly: '#cfc8bd', ears: 2.5 } },
  { id: 'cougar', name: 'Cougar', archetype: 'predator', health: 90, speed: 185, walk: 30, sense: 230, damage: 24, aggression: 0.8, horseFear: 1.6,
    yields: [{ item: 'peltCougar', qty: [1, 1] }, { item: 'meatGame', qty: [1, 2] }],
    look: { body: ['#8a6a45', '#ad8a5f', '#c9a97f'], len: 8, h: 3.8, leg: 6, neck: 2.5, head: 3.5, tail: 'long', belly: '#e2d3bb', ears: 1.5 } },
  { id: 'bear', name: 'Black Bear', archetype: 'predator', health: 220, speed: 150, walk: 25, sense: 180, damage: 32, aggression: 0.35, horseFear: 2,
    yields: [{ item: 'peltBear', qty: [1, 1] }, { item: 'meatGame', qty: [2, 3] }],
    look: { body: ['#16120f', '#2a231d', '#433830'], len: 9, h: 7, leg: 6, neck: 3, head: 4.5, tail: 'none', belly: '#2a231d', ears: 1.5 } },
  { id: 'bison', name: 'Plains Bison', archetype: 'herd', health: 300, speed: 130, walk: 18, sense: 180, damage: 30, aggression: 0.05, horseFear: 0.3, herd: [3, 8],
    yields: [{ item: 'peltBison', qty: [1, 1] }, { item: 'meatGame', qty: [3, 4] }],
    look: { body: ['#2e2016', '#4a3424', '#654a34'], len: 11, h: 7.5, leg: 7, neck: 3, head: 5, tail: 'tuft', horns: 'bison', mane: '#2a1c12', ears: 1 } },
  { id: 'cattle', name: 'Longhorn Steer', archetype: 'herd', health: 160, speed: 110, walk: 14, sense: 90, horseFear: 0, herd: [4, 9],
    yields: [{ item: 'meatGame', qty: [3, 4] }],
    look: { body: ['#6a3a22', '#8a5232', '#a86e48'], len: 10, h: 5, leg: 7.5, neck: 4.5, head: 4.5, tail: 'tuft', horns: 'bison', belly: '#d8c8b0', ears: 1 } },
  { id: 'boar', name: 'Feral Hog', archetype: 'predator', health: 70, speed: 140, walk: 25, sense: 160, damage: 12, aggression: 0.3, horseFear: 0.5, herd: [1, 3],
    yields: [{ item: 'meatGame', qty: [2, 3] }],
    look: { body: ['#2d2520', '#463a32', '#5e5046'], len: 7, h: 4.5, leg: 4, neck: 1.5, head: 4, tail: 'short', ears: 1.5 } },
  { id: 'bighorn', name: 'Bighorn Sheep', archetype: 'prey', health: 70, speed: 140, walk: 20, sense: 220, horseFear: 0, herd: [2, 5],
    yields: [{ item: 'meatGame', qty: [1, 2] }, { item: 'antlers', qty: [0, 1] }],
    look: { body: ['#7a6450', '#9a826b', '#b9a18a'], len: 7, h: 4.5, leg: 6.5, neck: 3.5, head: 3.5, tail: 'short', horns: 'curl', rump: '#e9e1d3', belly: '#e9e1d3', ears: 1.5 } },
  { id: 'wildHorse', name: 'Wild Mustang', archetype: 'herd', health: 100, speed: 170, walk: 30, sense: 240, horseFear: 0, herd: [3, 6],
    yields: [],
    look: { body: ['#000', '#000', '#000'], len: 0, h: 0, leg: 0, neck: 0, head: 0, tail: 'none' } },
  { id: 'turkey', name: 'Wild Turkey', archetype: 'bird', health: 15, speed: 110, walk: 18, sense: 160, horseFear: 0, herd: [2, 5],
    yields: [{ item: 'meatGame', qty: [1, 1] }, { item: 'feathers', qty: [3, 6] }],
    look: { body: ['#2d241c', '#4a3b2d', '#6b5843'], len: 3, h: 3, leg: 3, neck: 3, head: 1.5, tail: 'fan', ears: 0 } },
  { id: 'hawk', name: 'Red-tailed Hawk', archetype: 'bird', health: 8, speed: 120, walk: 0, sense: 200, horseFear: 0,
    yields: [{ item: 'feathers', qty: [2, 4] }],
    look: { body: ['#5a3c26', '#8a6040', '#c79a6c'], len: 4, h: 1, leg: 0, neck: 0, head: 1, tail: 'fan' } },
  { id: 'vulture', name: 'Turkey Vulture', archetype: 'bird', health: 10, speed: 90, walk: 0, sense: 160, horseFear: 0,
    yields: [{ item: 'feathers', qty: [2, 5] }],
    look: { body: ['#1e1a18', '#2e2925', '#4a433d'], len: 5, h: 1, leg: 0, neck: 0, head: 1, tail: 'fan' } },
  { id: 'duck', name: 'Mallard', archetype: 'bird', health: 6, speed: 100, walk: 10, sense: 140, horseFear: 0, herd: [2, 4],
    yields: [{ item: 'meatGame', qty: [1, 1] }, { item: 'feathers', qty: [1, 3] }],
    look: { body: ['#4d4033', '#6e5d4a', '#8f7b62'], len: 2.5, h: 1.6, leg: 1, neck: 1.5, head: 1.2, tail: 'short', mane: '#2e6b3a' } },
  { id: 'heron', name: 'Great Blue Heron', archetype: 'bird', health: 10, speed: 90, walk: 10, sense: 180, horseFear: 0,
    yields: [{ item: 'feathers', qty: [3, 6] }],
    look: { body: ['#5d6a78', '#7c8a98', '#a3b0bc'], len: 3, h: 2, leg: 6, neck: 5, head: 1.5, tail: 'short' } },
  { id: 'rattlesnake', name: 'Rattlesnake', archetype: 'snake', health: 8, speed: 40, walk: 12, sense: 60, damage: 10, aggression: 0.9, horseFear: 1.4,
    yields: [],
    look: { body: ['#6b5a40', '#8f7a56', '#b29c72'], len: 6, h: 1, leg: 0, neck: 0, head: 1.5, tail: 'none' } },
];

const BY_ID = new Map(SPECIES.map((s) => [s.id, s]));
export function getSpecies(id: string): SpeciesDef {
  const s = BY_ID.get(id);
  if (!s) throw new Error(`Unknown species ${id}`);
  return s;
}
