/**
 * Horse personality traits. Every number here is consumed by simulation code —
 * none of these are flavour-only. A horse has 1 or 2 traits; modifiers stack
 * multiplicatively (mul) or additively (add).
 */

export interface TraitDef {
  id: string;
  name: string;
  description: string;
  /** Fear response multiplier (stress gained from threats, gunfire, predators). */
  fear: number;
  /** Stamina drain multiplier while ridden. */
  drain: number;
  /** Stamina/energy recovery multiplier. */
  recovery: number;
  /** Bond XP gain multiplier. */
  bondGain: number;
  /** Additive obedience modifier (-1..1): affects refusals, whistle response, rein lag. */
  obedience: number;
  /** Chance per minute of idling to wander off / investigate (0..1 scale factor). */
  wander: number;
  /** How far it lets the owner get before following when unlead (tiles). */
  followSlack: number;
  /** Chance modifier to kick/bite at strangers or when mishandled. */
  aggression: number;
  /** Stress gained per minute when no other horse or owner is near. */
  lonely: number;
  /** Top speed modifier (small). */
  speed: number;
  /** Speed at which stress decays. */
  calmRate: number;
  /** Fondness for being touched: multiplies trust gains from petting/brushing. */
  affection: number;
}

const base: Omit<TraitDef, 'id' | 'name' | 'description'> = {
  fear: 1,
  drain: 1,
  recovery: 1,
  bondGain: 1,
  obedience: 0,
  wander: 0.3,
  followSlack: 6,
  aggression: 0,
  lonely: 0,
  speed: 1,
  calmRate: 1,
  affection: 1,
};

function t(id: string, name: string, description: string, over: Partial<typeof base>): TraitDef {
  return { ...base, ...over, id, name, description };
}

export const TRAITS: TraitDef[] = [
  t('calm', 'Calm', 'Takes the world as it comes. Slow to spook, quick to settle.', { fear: 0.6, calmRate: 1.6, speed: 0.98 }),
  t('nervous', 'Nervous', 'Every rustle is a cougar. Spooks at gunfire and strange places, but is quick off the mark.', { fear: 1.7, calmRate: 0.6, speed: 1.03, drain: 1.08 }),
  t('curious', 'Curious', 'Noses into everything. Wanders off to investigate and learns new things quickly.', { wander: 0.9, bondGain: 1.15, fear: 0.9 }),
  t('aggressive', 'Aggressive', 'Pins its ears at strangers and other horses. May kick or bite when handled badly.', { aggression: 0.45, fear: 0.8, obedience: -0.15, affection: 0.7 }),
  t('stubborn', 'Stubborn', 'Has its own opinions. Refuses commands until it trusts you; training takes longer.', { obedience: -0.35, bondGain: 0.8, fear: 0.9 }),
  t('loyal', 'Loyal', 'Once bonded it stays close, comes when called from far away and holds steady for you.', { obedience: 0.25, bondGain: 1.3, followSlack: 3, wander: 0.1 }),
  t('energetic', 'Energetic', 'Always wants to go. More speed, recovers fast, but burns energy fidgeting.', { speed: 1.04, recovery: 1.25, drain: 1.05, wander: 0.5 }),
  t('lazy', 'Lazy', 'Would rather graze. Slow to accelerate and reluctant to gallop, but sips stamina.', { speed: 0.95, drain: 0.82, obedience: -0.1, wander: 0.15 }),
  t('social', 'Social', 'Calmer near other horses, unhappy when left alone for long.', { lonely: 0.25, calmRate: 1.2 }),
  t('independent', 'Independent', 'Does not need company — or you. Bonds slowly but tolerates being left anywhere.', { bondGain: 0.75, followSlack: 10, wander: 0.6, lonely: -0.05 }),
  t('fearful', 'Fearful', 'Deeply wary of predators and loud noise; may bolt when threatened.', { fear: 2, calmRate: 0.7, affection: 1.2 }),
  t('brave', 'Brave', 'Stands its ground against wolves and gunfire. A warhorse temperament.', { fear: 0.45, obedience: 0.1 }),
];

const BY_ID = new Map(TRAITS.map((x) => [x.id, x]));
export function getTrait(id: string): TraitDef {
  const tr = BY_ID.get(id);
  if (!tr) throw new Error(`Unknown trait: ${id}`);
  return tr;
}

/** Contradictory pairs that a generated horse never gets together. */
export const TRAIT_CONFLICTS: [string, string][] = [
  ['calm', 'nervous'],
  ['brave', 'fearful'],
  ['energetic', 'lazy'],
  ['social', 'independent'],
  ['loyal', 'independent'],
  ['calm', 'fearful'],
  ['brave', 'nervous'],
];
