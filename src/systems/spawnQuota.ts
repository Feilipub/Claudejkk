/**
 * Wildlife population quota helpers (pure, unit-tested). The spawner's quota counts
 * GROUPS of animals, not heads, so a single herd of cattle doesn't starve an area of
 * every other species.
 */

/** Minimal view of an animal for quota counting. */
export interface QuotaAnimal {
  x: number;
  y: number;
  speciesId: string;
  /** Spawn-group id; animals spawned without one are grouped by species and a 320 px cell. */
  herd: string | null;
}

/** Number of distinct groups and species among the animals near the player. */
export function wildlifeGroups(animals: Iterable<QuotaAnimal>): { groups: number; heads: number; species: Set<string> } {
  const groups = new Set<string>();
  const species = new Set<string>();
  let heads = 0;
  for (const a of animals) {
    heads++;
    species.add(a.speciesId);
    groups.add(a.herd ?? `${a.speciesId}:${Math.floor(a.x / 320)},${Math.floor(a.y / 320)}`);
  }
  return { groups: groups.size, heads, species };
}

/** Group quota per climate, and a hard cap on heads for the frame budget. */
export function wildlifeQuota(climate: string): { groups: number; heads: number } {
  return { groups: climate === 'arid' || climate === 'alpine' ? 3 : 4, heads: 22 };
}
