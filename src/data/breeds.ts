/**
 * Horse breed definitions — pure data, no behaviour.
 * Stats are on a 1..10 scale; horse/stats.ts turns them into simulation values.
 * Real-world breed names are generic and are not anyone's IP; flavour text is original.
 */

export type BodyType = 'light' | 'stock' | 'gaited' | 'draft' | 'pony';

export interface BreedStats {
  speed: number; // top gallop speed
  acceleration: number;
  stamina: number; // size of the stamina bar
  recovery: number; // stamina regen rate
  agility: number; // turning at speed
  handling: number; // how predictably it follows reins
  jumping: number;
  endurance: number; // long-term fatigue resistance
  strength: number; // pulling, carrying, pushing through mud/snow
  courage: number; // inverse of fear response
  responsiveness: number; // delay between command and action
  health: number; // health core size and injury resistance
  carry: number; // inventory capacity on saddlebags
  trail: number; // rough terrain (rock, slope, forest)
  temperament: number; // baseline calm (10 = placid)
  comfort: number; // smoothness of gaits, rider fatigue
}

export interface CoatOption {
  coat: string; // id in data/coats.ts
  weight: number;
}

export interface BreedDef {
  id: string;
  name: string;
  body: BodyType;
  /** Height in hands; scales the sprite. */
  hands: [number, number];
  stats: BreedStats;
  /** Base market price in dollars for a healthy, 6-year-old, green-broke horse. */
  basePrice: number;
  /** 0..1, lower = rarer at traders and in the wild. */
  commonness: number;
  coats: CoatOption[];
  /** Pattern ids allowed (data/coats.ts PATTERNS). */
  patterns: { id: string; weight: number }[];
  /** Personality trait weights (data/personalities.ts ids). Omitted traits default to 1. */
  traitBias: Record<string, number>;
  /** Regions where traders stock this breed / wild herds appear. */
  regions: string[];
  wild: boolean;
  description: string;
  /** Mane/tail visual heaviness 0..1 (drafts feathering etc.). */
  feathering: number;
  maneLength: number;
}

export const BREEDS: BreedDef[] = [
  {
    id: 'quarter',
    name: 'American Quarter Horse',
    body: 'stock',
    hands: [14.3, 15.3],
    stats: { speed: 7, acceleration: 10, stamina: 6, recovery: 7, agility: 9, handling: 8, jumping: 5, endurance: 6, strength: 6, courage: 7, responsiveness: 9, health: 7, carry: 5, trail: 6, temperament: 7, comfort: 6 },
    basePrice: 140,
    commonness: 0.9,
    coats: [
      { coat: 'sorrel', weight: 4 },
      { coat: 'bay', weight: 3 },
      { coat: 'chestnut', weight: 2 },
      { coat: 'black', weight: 1 },
      { coat: 'buckskin', weight: 1 },
      { coat: 'dun', weight: 1 },
      { coat: 'grullo', weight: 0.5 },
      { coat: 'palomino', weight: 0.6 },
    ],
    patterns: [{ id: 'solid', weight: 1 }],
    traitBias: { calm: 2, loyal: 1.5, energetic: 1.2 },
    regions: ['dustfall', 'blackwater', 'redstone'],
    wild: false,
    description: 'A cow horse bred to explode out of a standstill. Unmatched over a quarter mile, honest under saddle, and quick on its feet around cattle.',
    feathering: 0,
    maneLength: 0.4,
  },
  {
    id: 'thoroughbred',
    name: 'Thoroughbred',
    body: 'light',
    hands: [15.2, 16.3],
    stats: { speed: 10, acceleration: 8, stamina: 7, recovery: 6, agility: 6, handling: 5, jumping: 7, endurance: 5, strength: 4, courage: 4, responsiveness: 8, health: 5, carry: 3, trail: 3, temperament: 3, comfort: 6 },
    basePrice: 420,
    commonness: 0.35,
    coats: [
      { coat: 'bay', weight: 4 },
      { coat: 'darkBay', weight: 3 },
      { coat: 'chestnut', weight: 3 },
      { coat: 'black', weight: 1 },
      { coat: 'grey', weight: 1 },
    ],
    patterns: [{ id: 'solid', weight: 1 }],
    traitBias: { energetic: 2.5, nervous: 2, brave: 0.5, lazy: 0.2 },
    regions: ['blackwater'],
    wild: false,
    description: 'Bred on eastern tracks and shipped west by men with money. The fastest thing on four legs in the territory, and it knows it — hot-blooded, thin-skinned and fragile on broken ground.',
    feathering: 0,
    maneLength: 0.45,
  },
  {
    id: 'arabian',
    name: 'Arabian',
    body: 'light',
    hands: [14.1, 15.1],
    stats: { speed: 9, acceleration: 8, stamina: 8, recovery: 8, agility: 10, handling: 6, jumping: 6, endurance: 9, strength: 4, courage: 5, responsiveness: 10, health: 6, carry: 3, trail: 6, temperament: 3, comfort: 7 },
    basePrice: 650,
    commonness: 0.12,
    coats: [
      { coat: 'grey', weight: 4 },
      { coat: 'fleabitten', weight: 2 },
      { coat: 'chestnut', weight: 2 },
      { coat: 'bay', weight: 2 },
      { coat: 'black', weight: 0.6 },
      { coat: 'white', weight: 0.4 },
    ],
    patterns: [{ id: 'solid', weight: 1 }],
    traitBias: { curious: 2, energetic: 1.8, loyal: 1.6, independent: 1.5, lazy: 0.2 },
    regions: ['blackwater'],
    wild: false,
    description: 'A desert-bred horse with an endless engine and a mind that never stops working. Rare, expensive, and fiercely attached to the one person it trusts.',
    feathering: 0,
    maneLength: 0.55,
  },
  {
    id: 'mustang',
    name: 'Frontier Mustang',
    body: 'stock',
    hands: [13.2, 14.3],
    stats: { speed: 7, acceleration: 7, stamina: 8, recovery: 9, agility: 7, handling: 4, jumping: 6, endurance: 10, strength: 6, courage: 8, responsiveness: 6, health: 9, carry: 5, trail: 9, temperament: 4, comfort: 4 },
    basePrice: 90,
    commonness: 0.7,
    coats: [
      { coat: 'dun', weight: 3 },
      { coat: 'grullo', weight: 2 },
      { coat: 'bay', weight: 3 },
      { coat: 'sorrel', weight: 2 },
      { coat: 'buckskin', weight: 2 },
      { coat: 'blueRoan', weight: 1 },
      { coat: 'redRoan', weight: 1 },
      { coat: 'black', weight: 1 },
    ],
    patterns: [
      { id: 'solid', weight: 6 },
      { id: 'tobiano', weight: 1 },
      { id: 'overo', weight: 1 },
    ],
    traitBias: { independent: 3, stubborn: 2, brave: 1.8, fearful: 1.2, social: 1.5 },
    regions: ['dustfall', 'redstone', 'drylands', 'sierra'],
    wild: true,
    description: 'Feral stock gone back to the land generations ago. Small, hard-hoofed and nearly unbreakable on rough country — but it was never asked to like people.',
    feathering: 0.1,
    maneLength: 0.75,
  },
  {
    id: 'appaloosa',
    name: 'Appaloosa',
    body: 'stock',
    hands: [14.2, 15.3],
    stats: { speed: 7, acceleration: 7, stamina: 7, recovery: 7, agility: 8, handling: 7, jumping: 6, endurance: 8, strength: 6, courage: 7, responsiveness: 7, health: 8, carry: 5, trail: 8, temperament: 6, comfort: 6 },
    basePrice: 210,
    commonness: 0.4,
    coats: [
      { coat: 'bay', weight: 3 },
      { coat: 'black', weight: 2 },
      { coat: 'chestnut', weight: 2 },
      { coat: 'grey', weight: 1 },
      { coat: 'blueRoan', weight: 1 },
    ],
    patterns: [
      { id: 'leopard', weight: 3 },
      { id: 'blanket', weight: 4 },
      { id: 'snowflake', weight: 2 },
      { id: 'frost', weight: 1 },
    ],
    traitBias: { loyal: 2, stubborn: 1.5, curious: 1.3 },
    regions: ['pinehollow', 'sierra', 'dustfall'],
    wild: false,
    description: 'A spotted mountain horse prized by the horse-breeding families of the high valleys. Sure-footed, sensible and stubborn in equal measure.',
    feathering: 0,
    maneLength: 0.25,
  },
  {
    id: 'paint',
    name: 'American Paint',
    body: 'stock',
    hands: [14.2, 15.2],
    stats: { speed: 7, acceleration: 9, stamina: 6, recovery: 7, agility: 8, handling: 8, jumping: 5, endurance: 6, strength: 6, courage: 6, responsiveness: 8, health: 7, carry: 5, trail: 6, temperament: 7, comfort: 6 },
    basePrice: 170,
    commonness: 0.6,
    coats: [
      { coat: 'black', weight: 3 },
      { coat: 'bay', weight: 3 },
      { coat: 'sorrel', weight: 3 },
      { coat: 'chestnut', weight: 2 },
      { coat: 'palomino', weight: 1 },
    ],
    patterns: [
      { id: 'tobiano', weight: 4 },
      { id: 'overo', weight: 3 },
      { id: 'tovero', weight: 1 },
    ],
    traitBias: { social: 2, calm: 1.5, curious: 1.4 },
    regions: ['dustfall', 'redstone', 'drylands'],
    wild: false,
    description: 'Stock-horse muscle under a loud coat. Popular with ranch hands for its cow sense and steady head.',
    feathering: 0,
    maneLength: 0.4,
  },
  {
    id: 'walker',
    name: 'Tennessee Walker',
    body: 'gaited',
    hands: [15, 16],
    stats: { speed: 6, acceleration: 6, stamina: 8, recovery: 8, agility: 6, handling: 9, jumping: 4, endurance: 8, strength: 5, courage: 6, responsiveness: 8, health: 7, carry: 6, trail: 6, temperament: 9, comfort: 10 },
    basePrice: 190,
    commonness: 0.5,
    coats: [
      { coat: 'black', weight: 3 },
      { coat: 'chestnut', weight: 3 },
      { coat: 'bay', weight: 2 },
      { coat: 'roanChestnut', weight: 1 },
      { coat: 'champagne', weight: 1 },
    ],
    patterns: [
      { id: 'solid', weight: 5 },
      { id: 'sabino', weight: 2 },
    ],
    traitBias: { calm: 3, lazy: 1.5, loyal: 1.4, nervous: 0.4, aggressive: 0.3 },
    regions: ['blackwater', 'pinehollow'],
    wild: false,
    description: 'A smooth running-walk that eats up miles without rattling a rider\'s teeth. The doctor\'s horse, the preacher\'s horse, and the long-distance traveller\'s best friend.',
    feathering: 0,
    maneLength: 0.65,
  },
  {
    id: 'morgan',
    name: 'Morgan',
    body: 'stock',
    hands: [14.1, 15.2],
    stats: { speed: 6, acceleration: 6, stamina: 7, recovery: 7, agility: 7, handling: 8, jumping: 5, endurance: 8, strength: 7, courage: 8, responsiveness: 7, health: 8, carry: 6, trail: 7, temperament: 8, comfort: 7 },
    basePrice: 120,
    commonness: 0.75,
    coats: [
      { coat: 'bay', weight: 4 },
      { coat: 'darkBay', weight: 2 },
      { coat: 'black', weight: 2 },
      { coat: 'chestnut', weight: 3 },
      { coat: 'palomino', weight: 0.5 },
    ],
    patterns: [{ id: 'solid', weight: 1 }],
    traitBias: { brave: 2, loyal: 1.8, calm: 1.5 },
    regions: ['dustfall', 'blackwater', 'pinehollow', 'sierra'],
    wild: false,
    description: 'Compact, versatile and unflappable. Pulls a buggy on Sunday and carries a deputy through gunfire on Monday.',
    feathering: 0,
    maneLength: 0.55,
  },
  {
    id: 'foxtrotter',
    name: 'Missouri Fox Trotter',
    body: 'gaited',
    hands: [14, 16],
    stats: { speed: 6, acceleration: 6, stamina: 9, recovery: 7, agility: 6, handling: 8, jumping: 4, endurance: 9, strength: 6, courage: 7, responsiveness: 7, health: 7, carry: 7, trail: 8, temperament: 8, comfort: 9 },
    basePrice: 180,
    commonness: 0.45,
    coats: [
      { coat: 'sorrel', weight: 3 },
      { coat: 'chestnut', weight: 2 },
      { coat: 'black', weight: 2 },
      { coat: 'champagne', weight: 1 },
      { coat: 'silverDapple', weight: 1 },
    ],
    patterns: [
      { id: 'solid', weight: 4 },
      { id: 'sabino', weight: 1 },
    ],
    traitBias: { calm: 2, social: 1.5, loyal: 1.3 },
    regions: ['pinehollow', 'sierra', 'dustfall'],
    wild: false,
    description: 'A mountain trail horse with a sliding, sure-footed gait. Slow to tire, slow to spook, and happy to carry a full pack over a pass.',
    feathering: 0,
    maneLength: 0.5,
  },
  {
    id: 'andalusian',
    name: 'Andalusian',
    body: 'light',
    hands: [15.1, 16.1],
    stats: { speed: 7, acceleration: 7, stamina: 6, recovery: 6, agility: 9, handling: 9, jumping: 7, endurance: 6, strength: 6, courage: 9, responsiveness: 9, health: 7, carry: 4, trail: 5, temperament: 6, comfort: 8 },
    basePrice: 560,
    commonness: 0.1,
    coats: [
      { coat: 'grey', weight: 5 },
      { coat: 'white', weight: 2 },
      { coat: 'bay', weight: 1 },
      { coat: 'black', weight: 1 },
      { coat: 'darkBay', weight: 0.5 },
    ],
    patterns: [{ id: 'solid', weight: 1 }],
    traitBias: { brave: 2.5, loyal: 1.6, curious: 1.2, fearful: 0.3 },
    regions: ['blackwater', 'drylands'],
    wild: false,
    description: 'An old-world parade and war horse brought north through the border haciendas. Proud, collected and astonishingly brave under fire.',
    feathering: 0.1,
    maneLength: 0.95,
  },
  {
    id: 'belgian',
    name: 'Belgian Draft',
    body: 'draft',
    hands: [16.2, 17.2],
    stats: { speed: 4, acceleration: 3, stamina: 6, recovery: 6, agility: 3, handling: 7, jumping: 2, endurance: 7, strength: 10, courage: 9, responsiveness: 5, health: 10, carry: 10, trail: 6, temperament: 10, comfort: 5 },
    basePrice: 230,
    commonness: 0.4,
    coats: [
      { coat: 'sorrel', weight: 5 },
      { coat: 'chestnut', weight: 2 },
      { coat: 'redRoan', weight: 1 },
      { coat: 'blond', weight: 1.5 },
    ],
    patterns: [{ id: 'solid', weight: 1 }],
    traitBias: { calm: 3, lazy: 2, social: 1.5, nervous: 0.2 },
    regions: ['blackwater', 'dustfall'],
    wild: false,
    description: 'A ton of patient muscle. Shrugs off gunfire and wolves alike, carries anything you can strap to it, and will not be hurried.',
    feathering: 0.7,
    maneLength: 0.35,
  },
  {
    id: 'shire',
    name: 'Shire',
    body: 'draft',
    hands: [17, 18],
    stats: { speed: 4, acceleration: 2, stamina: 7, recovery: 5, agility: 2, handling: 6, jumping: 2, endurance: 8, strength: 10, courage: 9, responsiveness: 4, health: 10, carry: 10, trail: 5, temperament: 9, comfort: 5 },
    basePrice: 260,
    commonness: 0.25,
    coats: [
      { coat: 'black', weight: 4 },
      { coat: 'bay', weight: 2 },
      { coat: 'grey', weight: 1 },
      { coat: 'darkBay', weight: 1 },
    ],
    patterns: [
      { id: 'solid', weight: 2 },
      { id: 'sabino', weight: 1 },
    ],
    traitBias: { calm: 2.5, loyal: 1.5, lazy: 1.6 },
    regions: ['blackwater', 'sierra'],
    wild: false,
    description: 'The largest horse in the territory, with dinner-plate hooves and silk feathering. A logging and freight horse that plows through snow drifts like they are not there.',
    feathering: 1,
    maneLength: 0.7,
  },
  {
    id: 'criollo',
    name: 'Borderland Criollo',
    body: 'stock',
    hands: [14, 14.3],
    stats: { speed: 6, acceleration: 7, stamina: 8, recovery: 9, agility: 8, handling: 7, jumping: 5, endurance: 10, strength: 6, courage: 7, responsiveness: 7, health: 9, carry: 5, trail: 9, temperament: 7, comfort: 6 },
    basePrice: 150,
    commonness: 0.4,
    coats: [
      { coat: 'grullo', weight: 3 },
      { coat: 'dun', weight: 3 },
      { coat: 'buckskin', weight: 2 },
      { coat: 'redRoan', weight: 1 },
      { coat: 'sorrel', weight: 1 },
    ],
    patterns: [
      { id: 'solid', weight: 3 },
      { id: 'overo', weight: 1 },
    ],
    traitBias: { independent: 1.6, brave: 1.5, calm: 1.2 },
    regions: ['drylands', 'redstone'],
    wild: false,
    description: 'A tough little horse from the vaquero ranges beyond the southern border. Lives on scrub and bad water and asks for nothing.',
    feathering: 0,
    maneLength: 0.45,
  },
];

const BY_ID = new Map(BREEDS.map((b) => [b.id, b]));

/** Look up a breed by id; throws for unknown ids so data errors surface early. */
export function getBreed(id: string): BreedDef {
  const b = BY_ID.get(id);
  if (!b) throw new Error(`Unknown breed: ${id}`);
  return b;
}
