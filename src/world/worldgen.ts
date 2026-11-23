/**
 * Deterministic world generation for Calder Territory. Combines the authored
 * macro layout (data/world.ts) with noise for natural detail: domain-warped
 * region borders, per-climate elevation models, carved rivers and lakes,
 * cliffs from slope, roads/rail with bridges, settlements and vegetation.
 */
import { fbm, hashf, ridged, valueNoise } from '../core/rng.ts';
import { clamp, smoothstep } from '../core/math.ts';
import { LAKES, POIS, RAILROAD, REGIONS, RIVERS, ROADS, SETTLEMENTS, SIGNPOSTS, WORLD_H, WORLD_W, WORLD_SEED, type RegionDef } from '../data/world.ts';
import { F, G, O } from './tiles.ts';
import { World } from './world.ts';
import { buildSettlement, type Corral, type Spot } from './settlements.ts';

export interface GenResult {
  world: World;
  spots: Spot[];
  corrals: Corral[];
}

const S = WORLD_SEED;

interface Seed {
  r: number;
  x: number;
  y: number;
}

function elevationFor(r: RegionDef, x: number, y: number): number {
  const n = fbm(x / 48, y / 48, S + 11, 4);
  switch (r.climate) {
    case 'alpine': {
      const rg = ridged(x / 38, y / 38, S + 21, 5);
      return 150 + rg * 110 + n * 20;
    }
    case 'forest':
      return 95 + fbm(x / 30, y / 30, S + 31, 4) * 70;
    case 'temperate':
      return 55 + n * 40 + fbm(x / 120, y / 120, S + 41, 2) * 25;
    case 'wetland':
      return 30 + n * 22;
    case 'arid': {
      const butte = smoothstep(0.66, 0.7, fbm(x / 26, y / 26, S + 51, 3));
      return 75 + n * 25 + butte * 45;
    }
    case 'canyon': {
      const m = fbm(x / 22, y / 22, S + 61, 4);
      const mesa = smoothstep(0.5, 0.53, m) * 55 + smoothstep(0.62, 0.64, m) * 30;
      return 85 + mesa + n * 10;
    }
  }
}

/** Stamp a polyline with optional wobble, calling `fn` for every tile within radius. */
function stampLine(
  points: [number, number][],
  radius: number,
  wobble: number,
  seed: number,
  fn: (tx: number, ty: number, d: number) => void,
): void {
  let along = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i]!;
    const [bx, by] = points[i + 1]!;
    const len = Math.hypot(bx - ax, by - ay);
    const nx = -(by - ay) / len;
    const ny = (bx - ax) / len;
    for (let t = 0; t <= len; t += 0.5) {
      const off = wobble ? (valueNoise((along + t) / 14, 0, seed) - 0.5) * wobble * Math.min(1, t / 6, (len - t) / 6 + (i < points.length - 2 ? 1 : 0)) : 0;
      const cx = ax + ((bx - ax) * t) / len + nx * off;
      const cy = ay + ((by - ay) * t) / len + ny * off;
      const r = Math.ceil(radius);
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const tx = Math.round(cx + dx);
          const ty = Math.round(cy + dy);
          const d = Math.hypot(tx - cx, ty - cy);
          if (d <= radius) fn(tx, ty, d);
        }
    }
    along += len;
  }
}

/** Generate the whole territory. ~0.5–1.5 s in a browser. */
export function generateWorld(onProgress?: (p: number, label: string) => void): GenResult {
  const W = new World();
  const seeds: Seed[] = [];
  REGIONS.forEach((r, ri) => r.seeds.forEach(([x, y]) => seeds.push({ r: ri, x, y })));

  // --- 1. Regions & elevation --------------------------------------------
  onProgress?.(0.05, 'Surveying the territory');
  const regionW = new Float32Array(REGIONS.length);
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      const wx = x + (fbm(x / 70, y / 70, S + 1, 3) - 0.5) * 110;
      const wy = y + (fbm(x / 70, y / 70, S + 2, 3) - 0.5) * 110;
      regionW.fill(0);
      let best = 0;
      let bestD = Infinity;
      for (const sd of seeds) {
        const d = Math.hypot(wx - sd.x, wy - sd.y);
        if (d < bestD) {
          bestD = d;
          best = sd.r;
        }
        const wgt = Math.exp(-d / 30);
        if (wgt > regionW[sd.r]!) regionW[sd.r] = wgt;
      }
      let sum = 0;
      let h = 0;
      for (let r = 0; r < REGIONS.length; r++) {
        const wgt = regionW[r]!;
        if (wgt < 1e-5) continue;
        sum += wgt;
        h += wgt * elevationFor(REGIONS[r]!, x, y);
      }
      const i = y * WORLD_W + x;
      W.region[i] = best;
      W.height[i] = clamp(Math.round(sum > 0 ? h / sum : elevationFor(REGIONS[best]!, x, y)), 0, 255);
    }
  }

  // --- 2. Base ground by climate ------------------------------------------
  onProgress?.(0.3, 'Laying the grass');
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      const i = y * WORLD_W + x;
      const r = REGIONS[W.region[i]!]!;
      const h = W.height[i]!;
      const n1 = fbm(x / 18, y / 18, S + 101, 3);
      const n2 = fbm(x / 9, y / 9, S + 102, 2);
      let g: number = G.Grass;
      switch (r.climate) {
        case 'temperate':
          g = n1 > 0.62 ? G.TallGrass : n1 < 0.36 ? G.DryGrass : G.Grass;
          if (n2 > 0.8) g = G.Dirt;
          break;
        case 'wetland':
          g = n1 > 0.7 ? G.TallGrass : G.Grass;
          if (h < 36 && n2 > 0.6) g = G.Mud;
          break;
        case 'forest':
          g = n1 > 0.58 ? G.Grass : G.ForestFloor;
          break;
        case 'alpine':
          g = h > 215 ? G.Snow : h > 190 ? (n2 > 0.45 ? G.Snow : G.Rock) : h > 170 ? (n1 > 0.5 ? G.Rock : G.Grass) : G.Grass;
          if (h <= 170 && n1 < 0.4) g = G.DryGrass;
          break;
        case 'arid':
          g = n1 > 0.6 ? G.Hardpan : n1 < 0.33 ? G.DryGrass : G.Desert;
          if (n2 > 0.82) g = G.Dirt;
          break;
        case 'canyon':
          g = h > 128 ? (n2 > 0.5 ? G.RedRock : G.RedSand) : n1 > 0.55 ? G.RedSand : n1 < 0.35 ? G.DryGrass : G.RedRock;
          break;
      }
      W.ground[i] = g;
    }
  }

  // --- 3. Lakes ------------------------------------------------------------
  onProgress?.(0.4, 'Filling the lakes');
  for (const lk of LAKES) {
    const pad = 6;
    for (let y = Math.floor(lk.y - lk.ry - pad); y <= lk.y + lk.ry + pad; y++)
      for (let x = Math.floor(lk.x - lk.rx - pad); x <= lk.x + lk.rx + pad; x++) {
        if (!W.inBounds(x, y)) continue;
        const d = Math.hypot((x - lk.x) / lk.rx, (y - lk.y) / lk.ry) + (fbm(x / 8, y / 8, S + 201, 2) - 0.5) * 0.35;
        const i = W.idx(x, y);
        if (lk.id === 'saltpan') {
          if (d < 1) W.ground[i] = G.Salt;
          continue;
        }
        if (d < 0.75) W.ground[i] = lk.frozen ? G.Ice : G.DeepWater;
        else if (d < 1) W.ground[i] = lk.frozen ? G.Ice : G.ShallowWater;
        else if (d < 1.15) W.ground[i] = lk.id === 'blackwater' ? G.Mud : G.Sand;
        else continue;
        W.height[i] = Math.min(W.height[i]!, 30);
        W.obj[i] = O.None;
      }
  }

  // --- 4. Rivers -------------------------------------------------------------
  onProgress?.(0.45, 'Cutting the rivers');
  for (const rv of RIVERS) {
    const half = rv.width / 2;
    const seed = S + rv.id.length * 97;
    stampLine(rv.points, half + 2.5, 10, seed, (tx, ty, d) => {
      if (!W.inBounds(tx, ty)) return;
      const i = W.idx(tx, ty);
      if (W.ground[i] === G.DeepWater || W.ground[i] === G.ShallowWater) return;
      if (d <= half + 2.5 && d > half) {
        if (W.ground[i] !== G.ShallowWater) W.ground[i] = rv.dry ? G.DryWash : G.Sand;
      }
    });
    stampLine(rv.points, half, 10, seed, (tx, ty, d) => {
      if (!W.inBounds(tx, ty)) return;
      const i = W.idx(tx, ty);
      W.flags[i]! |= F.River;
      if (rv.dry) {
        W.ground[i] = hashf(tx >> 2, ty >> 2, 0, S) > 0.93 ? G.ShallowWater : G.DryWash;
      } else {
        const r = REGIONS[W.region[i]!]!;
        const frozen = r.climate === 'alpine' && W.height[i]! > 200;
        W.ground[i] = frozen ? G.Ice : d < half * 0.55 && rv.width >= 4 ? G.DeepWater : G.ShallowWater;
      }
    });
  }
  // Rivers carve their valleys: lower height near water, smooth banks.
  carveValleys(W);

  // --- 5. Cliffs from slope -------------------------------------------------
  onProgress?.(0.5, 'Raising the cliffs');
  for (let y = 1; y < WORLD_H - 1; y++)
    for (let x = 1; x < WORLD_W - 1; x++) {
      const i = y * WORLD_W + x;
      const g = W.ground[i]!;
      if (g === G.DeepWater || g === G.ShallowWater || g === G.Ice) continue;
      const h = W.height[i]!;
      // Only the upper side of a steep drop becomes cliff, so cliffs face down-slope.
      const drop = Math.max(h - W.height[i + 1]!, h - W.height[i - 1]!, h - W.height[i + WORLD_W]!, h - W.height[i - WORLD_W]!);
      const r = REGIONS[W.region[i]!]!;
      const thresh = r.climate === 'canyon' ? 9 : r.climate === 'alpine' ? 11 : 13;
      if (drop >= thresh) W.ground[i] = G.Cliff;
    }

  // --- 6. Roads, trails & rail ----------------------------------------------
  onProgress?.(0.6, 'Grading the roads');
  for (const rd of ROADS) {
    const half = rd.width / 2;
    stampLine(rd.points, half + 2, 3, S + 400 + rd.id.length, (tx, ty, d) => {
      if (!W.inBounds(tx, ty)) return;
      const i = W.idx(tx, ty);
      if (W.ground[i] === G.Cliff) W.ground[i] = G.Dirt;
      if (d <= half + 1) W.obj[i] = O.None;
    });
    stampLine(rd.points, half, 3, S + 400 + rd.id.length, (tx, ty) => {
      if (!W.inBounds(tx, ty)) return;
      const i = W.idx(tx, ty);
      const g = W.ground[i]!;
      if (g === G.DeepWater || g === G.ShallowWater || g === G.Ice || g === G.Mud || (W.flags[i]! & F.River)) {
        if (g === G.DeepWater || g === G.ShallowWater || g === G.Ice) W.flags[i]! |= F.Bridge;
        W.flags[i]! |= rd.kind === 'road' ? F.Road : F.Trail;
        return;
      }
      W.flags[i]! |= rd.kind === 'road' ? F.Road : F.Trail;
      W.ground[i] = rd.kind === 'road' ? G.Road : REGIONS[W.region[i]!]!.climate === 'alpine' && W.height[i]! > 210 ? G.Snow : G.Dirt;
      W.obj[i] = O.None;
    });
  }
  // Smooth heights along roads so there are no cliffs on them.
  for (let y = 1; y < WORLD_H - 1; y++)
    for (let x = 1; x < WORLD_W - 1; x++) {
      const i = y * WORLD_W + x;
      if (!(W.flags[i]! & (F.Road | F.Trail))) continue;
      for (const j of [i - 1, i + 1, i - WORLD_W, i + WORLD_W]) if (W.ground[j] === G.Cliff) W.ground[j] = G.Rock;
    }
  stampLine(RAILROAD, 0.6, 0, 0, (tx, ty) => {
    if (!W.inBounds(tx, ty)) return;
    const i = W.idx(tx, ty);
    W.flags[i]! |= F.Rail;
    const g = W.ground[i]!;
    if (g === G.DeepWater || g === G.ShallowWater || g === G.Ice) W.flags[i]! |= F.Bridge;
    else if (g === G.Cliff) W.ground[i] = G.Dirt;
    W.obj[i] = O.None;
  });
  stampLine(RAILROAD, 2.2, 0, 0, (tx, ty) => {
    if (!W.inBounds(tx, ty)) return;
    const i = W.idx(tx, ty);
    if (W.ground[i] === G.Cliff) W.ground[i] = G.Dirt;
  });

  // --- 7. Vegetation & props -------------------------------------------------
  onProgress?.(0.7, 'Planting the forests');
  scatter(W);

  // --- 8. Settlements ----------------------------------------------------------
  onProgress?.(0.85, 'Raising the towns');
  const spots: Spot[] = [];
  const corrals: Corral[] = [];
  for (const s of SETTLEMENTS) {
    const b = buildSettlement(W, s);
    spots.push(...b.spots);
    corrals.push(...b.corrals);
  }

  // --- 8b. Junction signposts ------------------------------------------------------
  for (const [sx, sy] of SIGNPOSTS) placeSignpost(W, sx, sy);

  // --- 9. Make POIs reachable ---------------------------------------------------
  for (const p of POIS) {
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const x = p.x + dx;
        const y = p.y + dy;
        if (!W.inBounds(x, y)) continue;
        const i = W.idx(x, y);
        if (W.ground[i] === G.Cliff) W.ground[i] = G.Rock;
        if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) W.obj[i] = O.None;
      }
  }
  onProgress?.(1, 'Ready');
  return { world: W, spots, corrals };
}

/**
 * Put a signpost on the free tile nearest (x, y): beside the road, never on it,
 * on water, rail, a building or a settlement's yard. Deterministic (fixed scan order).
 */
function placeSignpost(W: World, x: number, y: number): void {
  for (let r = 0; r <= 4; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = x + dx;
        const ty = y + dy;
        if (!W.inBounds(tx, ty)) continue;
        const i = W.idx(tx, ty);
        const g = W.ground[i]!;
        if (g === G.DeepWater || g === G.ShallowWater || g === G.Ice || g === G.Cliff || g === G.Mud) continue;
        if (W.flags[i]! & (F.Road | F.Trail | F.Rail | F.River | F.Bridge | F.Settlement) || W.buildingAt[i]) continue;
        // Must stand next to the road it labels.
        let byRoad = false;
        for (let ny = -1; ny <= 1 && !byRoad; ny++) for (let nx = -1; nx <= 1; nx++) if (W.flagAt(tx + nx, ty + ny) & (F.Road | F.Trail)) byRoad = true;
        if (!byRoad) continue;
        W.obj[i] = O.Signpost;
        return;
      }
}

function carveValleys(W: World): void {
  // Distance-limited BFS from water tiles lowering height towards water level.
  const dist = new Uint8Array(W.w * W.h).fill(255);
  const queue: number[] = [];
  for (let i = 0; i < dist.length; i++) {
    const g = W.ground[i]!;
    if (g === G.DeepWater || g === G.ShallowWater || g === G.Ice || g === G.DryWash) {
      dist[i] = 0;
      queue.push(i);
    }
  }
  let head = 0;
  while (head < queue.length) {
    const i = queue[head++]!;
    const d = dist[i]!;
    if (d >= 10) continue;
    const x = i % W.w;
    const y = (i / W.w) | 0;
    const nb = [x > 0 ? i - 1 : -1, x < W.w - 1 ? i + 1 : -1, y > 0 ? i - W.w : -1, y < W.h - 1 ? i + W.w : -1];
    for (const j of nb) {
      if (j < 0 || dist[j]! <= d + 1) continue;
      dist[j] = d + 1;
      queue.push(j);
    }
  }
  // Water level of each water tile = its own height; lower neighbours progressively.
  for (let i = 0; i < dist.length; i++) {
    const d = dist[i]!;
    if (d === 255) continue;
    if (d === 0) {
      W.height[i] = Math.max(0, W.height[i]! - 12);
      continue;
    }
    const t = d / 10;
    W.height[i] = Math.round(W.height[i]! * (0.7 + 0.3 * t));
  }
}

function scatter(W: World): void {
  for (let y = 0; y < W.h; y++)
    for (let x = 0; x < W.w; x++) {
      const i = y * W.w + x;
      if (W.obj[i] || W.flags[i]! & (F.Road | F.Rail | F.Trail | F.River)) continue;
      const g = W.ground[i]!;
      if (g === G.DeepWater || g === G.Cliff || g === G.Ice || g === G.Salt) continue;
      const r = REGIONS[W.region[i]!]!;
      const h = hashf(x, y, 7, S);
      const h2 = hashf(x, y, 8, S);
      const dense = fbm(x / 22, y / 22, S + 501, 3);
      const near = (gg: number) => W.groundAt(x + 2, y) === gg || W.groundAt(x - 2, y) === gg || W.groundAt(x, y + 2) === gg || W.groundAt(x, y - 2) === gg;
      let o: number = O.None;
      if (g === G.ShallowWater) {
        if (h < 0.05 && near(G.Sand)) o = O.Reeds;
        else if (h < 0.03) o = O.Lilypad;
        W.obj[i] = o;
        continue;
      }
      if (g === G.Sand && h < 0.12) {
        W.obj[i] = h < 0.06 ? O.Reeds : O.Cottonwood;
        continue;
      }
      switch (r.climate) {
        case 'temperate':
          if (near(G.ShallowWater) || near(G.Sand)) o = h < 0.12 ? O.Cottonwood : h < 0.18 ? O.Bush : O.None;
          else if (dense > 0.66 && h < 0.18) o = h < 0.1 ? O.Oak : O.Bush;
          else if (h < 0.006) o = O.Oak;
          else if (h < 0.02) o = O.Boulder;
          else if (h < 0.05) o = O.Flowers;
          else if (h < 0.11) o = O.GrassTuft;
          else if (h < 0.115) o = O.Log;
          else if (h < 0.12) o = O.RockSmall;
          break;
        case 'wetland':
          if (dense > 0.6 && h < 0.2) o = h < 0.12 ? O.Oak : O.Bush;
          else if (h < 0.02) o = O.Cottonwood;
          else if (h < 0.06) o = O.Flowers;
          else if (h < 0.1) o = O.GrassTuft;
          else if (g === G.Mud && h < 0.18) o = O.Reeds;
          break;
        case 'forest':
          if (g === G.ForestFloor) {
            if (dense > 0.4 && h < 0.42) o = h2 < 0.15 ? O.Aspen : O.Pine;
            else if (h < 0.06) o = O.Pine;
            else if (h < 0.08) o = O.Log;
            else if (h < 0.1) o = O.Stump;
            else if (h < 0.13) o = O.BerryBush;
            else if (h < 0.16) o = O.Bush;
            else if (h < 0.17) o = O.Boulder;
          } else {
            if (h < 0.03) o = O.Pine;
            else if (h < 0.08) o = O.Flowers;
            else if (h < 0.13) o = O.GrassTuft;
            else if (h < 0.135) o = O.Boulder;
          }
          break;
        case 'alpine':
          if (g === G.Snow) o = dense > 0.55 && h < 0.2 ? O.SnowPine : h < 0.015 ? O.Boulder : O.None;
          else if (g === G.Rock) o = h < 0.06 ? O.Boulder : h < 0.12 ? O.RockSmall : O.None;
          else o = dense > 0.5 && h < 0.3 ? (h2 < 0.2 ? O.Aspen : O.SnowPine) : h < 0.03 ? O.Boulder : h < 0.08 ? O.GrassTuft : h < 0.1 ? O.Flowers : O.None;
          break;
        case 'arid':
          if (h < 0.012) o = O.Saguaro;
          else if (h < 0.03) o = O.PricklyPear;
          else if (h < 0.07) o = O.Creosote;
          else if (h < 0.09) o = O.Sage;
          else if (h < 0.1) o = O.Cactus2;
          else if (h < 0.105) o = O.DeadTree;
          else if (h < 0.115) o = O.RockSmall;
          else if (h < 0.118) o = O.Bones;
          else if (h < 0.122) o = O.Boulder;
          break;
        case 'canyon':
          if (W.height[i]! > 128) o = h < 0.04 ? O.Juniper : h < 0.06 ? O.RockSmall : h < 0.07 ? O.Sage : O.None;
          else if (h < 0.025) o = O.Hoodoo;
          else if (h < 0.06) o = O.Juniper;
          else if (h < 0.1) o = O.Sage;
          else if (h < 0.12) o = O.PricklyPear;
          else if (h < 0.14) o = O.RockSmall;
          else if (h < 0.15) o = O.Boulder;
          break;
      }
      W.obj[i] = o;
    }
}
