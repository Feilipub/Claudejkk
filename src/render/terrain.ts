/**
 * Terrain chunk painter and streaming cache. Each 32×32-tile chunk is built
 * once into a 512×512 canvas from the hand-drawn 16×16 tiles in tiles16.ts:
 * every tile blits a variant of its ground (picked by a stable hash), then the
 * higher ground of each neighbour spills over the seam through a hand-drawn
 * edge mask (scalloped blades for grass, smooth lips for rock, snow and sand).
 * A lip pass gives raised ground a dark front face and a lit rim, casts a
 * one-pixel shadow onto the lower ground, and edges water with foam. Cliffs
 * are drawn from rim/face/foot pieces. Roads get crisp wheel ruts, bridges
 * and rails are laid pixel by pixel. Chunks live in an LRU cache — the world
 * streams around the camera.
 */
import { Rng, hash3, hashf } from '../core/rng.ts';
import { RAILROAD, ROADS } from '../data/world.ts';
import { F, G, O } from '../world/tiles.ts';
import type { World } from '../world/world.ts';
import { ctx2d, makeCanvas } from './pixel.ts';
import { FLAT_OBJECTS, paintFlat } from './propSprite.ts';
import { packed, tileSet, type CliffKind, type Ramp5, type Tile } from './tiles16.ts';

export const CHUNK = 32;
const CPX = CHUNK * 16;
/** Tile margin painted around a chunk so seams and lips are right at its border. */
const MT = 2;
const TW = CHUNK + MT * 2;
const PW = TW * 16;
const OFF = MT * 16;

/**
 * Ground "height" layer for transitions: where a higher layer meets a lower one
 * the higher one spills over the seam, shows a dark front face and a lit rim,
 * and shades the lower ground just below it.
 */
const LAYER = new Uint8Array(32);
{
  const set = (gs: number[], l: number) => gs.forEach((g) => (LAYER[g] = l));
  set([G.DeepWater, G.ShallowWater, G.Ice], 0);
  set([G.Mud, G.Sand, G.DryWash, G.Salt], 1);
  set([G.Desert, G.RedSand, G.Hardpan, G.Dirt, G.Road, G.Street, G.Farmland, G.WoodFloor, G.AdobeFloor], 2);
  set([G.Rock, G.RedRock, G.DryGrass], 3);
  set([G.Grass, G.TallGrass, G.ForestFloor], 4);
  set([G.Snow], 5);
  set([G.Cliff], 9);
}
/** Overlay order: higher layer wins; ties broken by ground id so every pair has one winner. */
const RANK = new Int16Array(32).map((_, g) => LAYER[g]! * 32 + g);
/** Open water. */
const WATER = new Uint8Array(32);
WATER[G.DeepWater] = 1;
WATER[G.ShallowWater] = 1;
/** Grounds whose spill-over edge is a scalloped fringe of blades. */
const GRASSY = new Uint8Array(32);
for (const g of [G.Grass, G.TallGrass, G.DryGrass, G.ForestFloor]) GRASSY[g] = 1;

/** Structured grounds (furrows, boards, packed floors) keep a straight tile edge instead of spilling. */
const NOSPILL = new Uint8Array(32);
for (const g of [G.Farmland, G.WoodFloor, G.AdobeFloor]) NOSPILL[g] = 1;

/** Cool shadow of a packed ABGR colour (cast shade under a lip, a cliff or a bridge). */
function shadow(c: number): number {
  const r = c & 255;
  const g = (c >> 8) & 255;
  const b = (c >> 16) & 255;
  return ((255 << 24) | (Math.min(255, (b * 0.8 + 10) | 0) << 16) | (((g * 0.76) | 0) << 8) | ((r * 0.72) | 0)) >>> 0;
}

/** Smooth tiling noise used only to cluster wildflowers into meadows. */
const MEADOW = new Float32Array(256 * 256);
{
  const cells = [32, 16];
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      let v = 0;
      let w = 0;
      for (let oi = 0; oi < cells.length; oi++) {
        const cell = cells[oi]!;
        const per = 256 / cell;
        const fx = x / cell;
        const fy = y / cell;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const tx = fx - x0;
        const ty = fy - y0;
        const h = (a: number, b: number) => hashf(a % per, b % per, oi, 4321);
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);
        const a = h(x0, y0);
        const b = h(x0 + 1, y0);
        const c = h(x0, y0 + 1);
        const d = h(x0 + 1, y0 + 1);
        const amp = 1 / (oi + 1);
        v += (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) * amp;
        w += amp;
      }
      MEADOW[y * 256 + x] = v / w;
    }
}

/** Wildflower species: [stem, bloom dark, bloom mid, bloom light] and a shape. */
interface Flower {
  cols: Uint32Array;
  shape: 'spike' | 'cup' | 'disc' | 'umbel';
}
const flower = (shape: Flower['shape'], ...names: string[]): Flower => ({ shape, cols: new Uint32Array(names.map(packed)) });
const FL = {
  lupine: flower('spike', 'grass1', 'blue1', 'lupine', 'lupineL'),
  paintbrush: flower('spike', 'grass1', 'barn2', 'barn3', 'barn4'),
  poppy: flower('cup', 'grass1', 'rust2', 'poppy', 'poppyL'),
  sunflower: flower('disc', 'grass1', 'gold0', 'sun', 'sunL'),
  yarrow: flower('umbel', 'grass1', 'white1', 'white2', 'white3'),
  globemallow: flower('cup', 'grass1', 'rust2', 'rust3', 'blush'),
  aster: flower('cup', 'grass1', 'lupine', 'lupineL', 'sun'),
};
/** Species pools per region index (dustfall, blackwater, pinehollow, sierra, drylands, redstone). */
const REGION_FLOWERS: Flower[][] = [
  [FL.lupine, FL.paintbrush, FL.sunflower, FL.poppy],
  [FL.lupine, FL.yarrow, FL.aster, FL.paintbrush],
  [FL.lupine, FL.yarrow, FL.paintbrush],
  [FL.lupine, FL.paintbrush, FL.yarrow, FL.aster],
  [FL.poppy, FL.sunflower, FL.globemallow],
  [FL.paintbrush, FL.globemallow, FL.sunflower],
];

/** Draw one small hand-shaped wildflower (stem at x,y; bloom above) through `set`. */
function putFlower(set: (x: number, y: number, c: number) => void, x: number, y: number, f: Flower, big: boolean): void {
  const [stem, dk, md, lt] = f.cols as unknown as [number, number, number, number];
  set(x, y, stem);
  switch (f.shape) {
    case 'spike':
      set(x, y - 1, dk);
      set(x, y - 2, md);
      set(x, y - 3, lt);
      if (big) set(x + 1, y - 2, dk);
      break;
    case 'cup':
      set(x - 1, y - 1, dk);
      set(x, y - 1, md);
      set(x + 1, y - 1, dk);
      set(x, y - 2, lt);
      break;
    case 'disc':
      set(x - 1, y - 1, md);
      set(x, y - 1, dk);
      set(x + 1, y - 1, md);
      set(x, y - 2, lt);
      break;
    case 'umbel':
      set(x, y - 1, stem);
      set(x - 1, y - 2, md);
      set(x, y - 2, lt);
      set(x + 1, y - 2, dk);
      set(x, y - 3, lt);
      break;
  }
}

/** Bridge and rail colours (palette, packed once). */
const DECK = {
  seam: packed('wood2'),
  plankA: packed('wood3'),
  plankB: packed('wood4'),
  plankOld: packed('gwood3'),
  beamTop: packed('wood1'),
  beamBot: packed('wood0'),
  post: packed('wood0'),
};
const SNOW_HI = packed('snow4');
const SNOW_LO = packed('snow2');
const RAIL = {
  ballast: packed('stone2'),
  ballastEdge: packed('stone1'),
  ballastLit: packed('stone3'),
  tie: packed('wood1'),
  tieLit: packed('wood2'),
  railTop: packed('tin3'),
  railSide: packed('tin1'),
};

export class TerrainCache {
  private chunks = new Map<number, HTMLCanvasElement | OffscreenCanvas>();
  private world: World;
  /** Max chunks kept in memory. */
  capacity = 24;
  constructor(world: World) {
    this.world = world;
  }

  key(cx: number, cy: number): number {
    return cy * 1000 + cx;
  }

  has(cx: number, cy: number): boolean {
    return this.chunks.has(this.key(cx, cy));
  }

  /** Get a chunk canvas, painting it if needed (and if `allowPaint`). */
  get(cx: number, cy: number, allowPaint = true): HTMLCanvasElement | OffscreenCanvas | null {
    const k = this.key(cx, cy);
    const hit = this.chunks.get(k);
    if (hit) {
      this.chunks.delete(k);
      this.chunks.set(k, hit);
      return hit;
    }
    if (!allowPaint) return null;
    const cv = this.paint(cx, cy);
    this.chunks.set(k, cv);
    while (this.chunks.size > this.capacity) this.chunks.delete(this.chunks.keys().next().value!);
    return cv;
  }

  /** Drop a chunk so it repaints (e.g. after a camp is placed). */
  invalidate(tx: number, ty: number): void {
    this.chunks.delete(this.key(Math.floor(tx / CHUNK), Math.floor(ty / CHUNK)));
  }

  get size(): number {
    return this.chunks.size;
  }

  private paint(cx: number, cy: number): HTMLCanvasElement | OffscreenCanvas {
    const W = this.world;
    const cv = makeCanvas(CPX, CPX);
    const c = ctx2d(cv);
    const img = c.createImageData(CPX, CPX);
    const out = new Uint32Array(img.data.buffer);
    const tx0 = cx * CHUNK;
    const ty0 = cy * CHUNK;

    // Ground and "keep crisp" flag per tile, with a margin (interiors, bridges and
    // building footprints neither spill nor receive spill-over).
    const tg = new Uint8Array(TW * TW);
    const tcr = new Uint8Array(TW * TW);
    for (let y = 0; y < TW; y++)
      for (let x = 0; x < TW; x++) {
        const tx = tx0 + x - MT;
        const ty = ty0 + y - MT;
        const i = y * TW + x;
        if (!W.inBounds(tx, ty)) {
          tg[i] = G.DeepWater;
          continue;
        }
        const wi = W.idx(tx, ty);
        tg[i] = W.ground[wi]!;
        tcr[i] = (W.flags[wi]! & (F.Interior | F.Bridge)) !== 0 || W.buildingAt[wi]! > 0 ? 1 : 0;
      }

    const col = new Uint32Array(PW * PW);
    const gid = new Uint8Array(PW * PW);
    paintTiles(W, tg, tcr, col, gid, tx0, ty0);
    paintLips(col, gid, out);

    // Wildflower meadows: small hand-shaped blooms in drifts, on open grass only.
    const gidAt = (x: number, y: number) => gid[(y + OFF) * PW + x + OFF]!;
    for (let ty = 0; ty < CHUNK; ty++)
      for (let tx = 0; tx < CHUNK; tx++) {
        const wtx = tx0 + tx;
        const wty = ty0 + ty;
        if (!W.inBounds(wtx, wty)) continue;
        const i = W.idx(wtx, wty);
        if (W.flags[i]! & (F.Road | F.Rail | F.Interior | F.Bridge | F.Settlement) || W.buildingAt[i]) continue;
        const g = W.ground[i]!;
        const o = W.obj[i]!;
        if (!GRASSY[g] && o !== O.Flowers) continue;
        if (o && o !== O.Flowers) continue;
        const meadow = MEADOW[((wty * 4 + 100) & 255) * 256 + ((wtx * 4 + 50) & 255)]!;
        const zone = MEADOW[((wty * 3 + 7) & 255) * 256 + ((wtx * 3 + 160) & 255)]!;
        const r = new Rng(hash3(wtx, wty, 4, 1));
        let n = o === O.Flowers ? r.int(4, 6) : meadow > 0.68 ? Math.min(4, Math.round((meadow - 0.68) * 30)) : r.chance(0.02) ? 1 : 0;
        // Under the canopy blooms are rare: only where a flower patch was placed.
        if (g === G.ForestFloor && o !== O.Flowers) continue;
        if (!n) continue;
        const pool = REGION_FLOWERS[W.region[i]!] ?? REGION_FLOWERS[0]!;
        const t = Math.max(0, Math.min(0.999, (zone - 0.3) / 0.4));
        const main = pool[Math.floor(t * pool.length)]!;
        const set = (x: number, y: number, cc: number) => {
          if (x >= 0 && y >= 0 && x < CPX && y < CPX && gidAt(x, y) === g) out[y * CPX + x] = cc;
        };
        const cxp = tx * 16 + r.int(4, 11);
        const cyp = ty * 16 + r.int(6, 13);
        for (let q = 0; q < n; q++) {
          const fx = cxp + (q === 0 ? 0 : r.int(-5, 5));
          const fy = cyp + (q === 0 ? 0 : r.int(-3, 3));
          putFlower(set, fx, fy, r.chance(0.85) ? main : pool[r.int(0, pool.length - 1)]!, r.chance(0.3));
        }
      }

    paintRuts(out, gid, tx0, ty0);
    paintBridges(W, out, gid, tx0, ty0);
    paintRails(out, tx0, ty0);
    c.putImageData(img, 0, 0);

    // Flat decals (rocks, bones, rails, lilypads) and stray bridge tiles.
    for (let ty = 0; ty < CHUNK; ty++)
      for (let tx = 0; tx < CHUNK; tx++) {
        const wtx = tx0 + tx;
        const wty = ty0 + ty;
        if (!W.inBounds(wtx, wty)) continue;
        const i = W.idx(wtx, wty);
        const o = W.obj[i]!;
        if (FLAT_OBJECTS.has(o) && o !== O.Flowers) paintFlat(c, o, tx * 16, ty * 16, new Rng(hash3(wtx, wty, 9, 3)), W.region[i]! >= 4 ? 1 : 0);
        // Road bridges are laid as decks along the road; only stray bridge tiles fall back to planks.
        if (W.flags[i]! & F.Bridge && !(W.flags[i]! & (F.Road | F.Trail | F.Rail))) paintBridge(c, W, wtx, wty, tx * 16, ty * 16);
      }
    return cv;
  }
}

/** Stable, well-mixed per-tile hash (top bits used for variant, flip and mask choices). */
function tileHash(x: number, y: number, salt: number): number {
  let h = hash3(x, y, salt, 5);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Variant index from a tile hash: mostly the calm tiles, now and then a detailed one. */
function pickVariant(h: number, n: number): number {
  const r = h >>> 28;
  const v = r < 8 ? 0 : r < 12 ? 1 : r < 14 ? 2 : 3;
  return v < n ? v : v % n;
}

/** Copy a 16×16 tile into the padded buffer, optionally mirrored. */
function blit(col: Uint32Array, gid: Uint8Array, t: Tile, g: number, px: number, py: number, flip: boolean): void {
  for (let y = 0; y < 16; y++) {
    const row = (py + y) * PW + px;
    for (let x = 0; x < 16; x++) {
      col[row + x] = t[y * 16 + (flip ? 15 - x : x)]!;
      gid[row + x] = g;
    }
  }
}

/** Cliff rock material by region: warm sandstone in the south, granite in the mountains, earth elsewhere. */
function cliffKind(region: number): CliffKind {
  return region >= 4 ? 'red' : region === 2 || region === 3 ? 'grey' : 'brown';
}

/**
 * Pass 1: blit every tile (ground variant or cliff piece), then lay the
 * hand-drawn edge masks of each higher neighbouring ground over the seams.
 */
function paintTiles(W: World, tg: Uint8Array, tcr: Uint8Array, col: Uint32Array, gid: Uint8Array, tx0: number, ty0: number): void {
  const TS = tileSet();
  for (let y = 0; y < TW; y++)
    for (let x = 0; x < TW; x++) {
      const g = tg[y * TW + x]!;
      const wtx = tx0 + x - MT;
      const wty = ty0 + y - MT;
      const h = tileHash(wtx, wty, 21);
      if (g === G.Cliff) {
        const kind = cliffKind(W.region[W.idx(Math.max(0, Math.min(W.w - 1, wtx)), Math.max(0, Math.min(W.h - 1, wty)))]!);
        const cl = TS.cliff[kind];
        const up = y > 0 && tg[(y - 1) * TW + x] === G.Cliff;
        const down = y < TW - 1 && tg[(y + 1) * TW + x] === G.Cliff;
        const left = x > 0 && tg[y * TW + x - 1] === G.Cliff;
        const right = x < TW - 1 && tg[y * TW + x + 1] === G.Cliff;
        const mid = cl.mid[((wty % 2) + 2) % 2]!;
        const flip = ((h >> 4) & 1) === 1;
        const snowCap = !up && y > 0 && tg[(y - 1) * TW + x] === G.Snow;
        for (let yy = 0; yy < 16; yy++) {
          // Rim rows from the cap piece, foot rows from the base piece, beds between.
          const src = !up && !down ? cl.one : !up ? cl.top : !down ? cl.bot : mid;
          const row = (y * 16 + yy) * PW + x * 16;
          for (let xx = 0; xx < 16; xx++) {
            let v = src[yy * 16 + (flip ? 15 - xx : xx)]!;
            // Ends of a face: lit on the left (light from the upper-left), shaded on the right.
            if (!left && xx === 0 && yy > 1) v = cl.ramp[3]!;
            else if (!right && xx === 15 && yy > 1) v = cl.ramp[0]!;
            // Snow lying on the cap of a cliff below a snowfield, with a short drip.
            if (snowCap && (yy < 2 || (yy === 2 && ((xx + wtx) & 3) === 1))) v = yy === 0 ? SNOW_HI : SNOW_LO;
            col[row + xx] = v;
            gid[row + xx] = G.Cliff;
          }
        }
        continue;
      }
      const art = TS.ground[g] ?? TS.ground[G.Dirt]!;
      const v = pickVariant(h, art.tiles.length);
      blit(col, gid, art.tiles[v]!, g, x * 16, y * 16, art.flip && ((h >> 4) & 1) === 1);
    }

  // Spill-over: tile (x,y) receives the edge of each higher neighbouring ground.
  const mask = new Uint8Array(256);
  const nb = new Int16Array(8);
  const DX = [0, 1, 1, 1, 0, -1, -1, -1];
  const DY = [-1, -1, 0, 1, 1, 1, 0, -1];
  for (let y = 1; y < TW - 1; y++)
    for (let x = 1; x < TW - 1; x++) {
      const ti = y * TW + x;
      const g0 = tg[ti]!;
      if (tcr[ti] || g0 === G.Cliff) continue;
      const r0 = RANK[g0]!;
      let any = false;
      for (let k = 0; k < 8; k++) {
        const ni = (y + DY[k]!) * TW + x + DX[k]!;
        const gn = tg[ni]!;
        nb[k] = tcr[ni] || gn === G.Cliff || NOSPILL[gn] || RANK[gn]! <= r0 ? -1 : gn;
        if (nb[k]! >= 0) any = true;
      }
      if (!any) continue;
      const h = tileHash(tx0 + x - MT, ty0 + y - MT, 22);
      // Each distinct higher ground, lowest first, so the highest ends on top.
      let last = -1;
      for (;;) {
        let next = -1;
        for (let k = 0; k < 8; k++) {
          const gn = nb[k]!;
          if (gn >= 0 && RANK[gn]! > (last < 0 ? -1 : RANK[last]!) && (next < 0 || RANK[gn]! < RANK[next]!)) next = gn;
        }
        if (next < 0) break;
        last = next;
        const hg = next;
        const N = nb[0] === hg;
        const E = nb[2] === hg;
        const S = nb[4] === hg;
        const Wst = nb[6] === hg;
        mask.fill(0);
        const edges = TS.edgeN[GRASSY[hg] ? 0 : 1];
        const pick = (salt: number) => edges[((h >> salt) & 1) % edges.length]!;
        if (N) addEdge(mask, pick(0), 0);
        if (E) addEdge(mask, pick(1), 1);
        if (S) addEdge(mask, pick(2), 2);
        if (Wst) addEdge(mask, pick(3), 3);
        // Corners: NE(1) between N/E, SE(3) between E/S, SW(5) between S/W, NW(7) between W/N.
        const corner = (diag: number, a: boolean, b: boolean, mx: boolean, my: boolean) => {
          if (a && b) addCorner(mask, TS.cornerIn, mx, my);
          else if (!a && !b && nb[diag] === hg) addCorner(mask, TS.cornerOut, mx, my);
        };
        corner(7, N, Wst, false, false);
        corner(1, N, E, true, false);
        corner(3, S, E, true, true);
        corner(5, S, Wst, false, true);
        const art = TS.ground[hg] ?? TS.ground[G.Dirt]!;
        // Spill uses the calm variants so no detail is cut in half by the edge.
        const t = art.tiles[(h >> 6) & 1 && art.tiles.length > 1 ? 1 : 0]!;
        const bx = x * 16;
        const by = y * 16;
        for (let yy = 0; yy < 16; yy++)
          for (let xx = 0; xx < 16; xx++) {
            if (!mask[yy * 16 + xx]) continue;
            const pi = (by + yy) * PW + bx + xx;
            col[pi] = t[yy * 16 + xx]!;
            gid[pi] = hg;
          }
      }
    }
}

/** OR a north-edge mask into `m`, rotated to side 0=N, 1=E, 2=S, 3=W. */
function addEdge(m: Uint8Array, e: Uint8Array, side: number): void {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      let sx: number;
      let sy: number;
      if (side === 0) {
        sx = x;
        sy = y;
      } else if (side === 1) {
        sx = y;
        sy = 15 - x;
      } else if (side === 2) {
        sx = 15 - x;
        sy = 15 - y;
      } else {
        sx = 15 - y;
        sy = x;
      }
      if (e[sy * 16 + sx]) m[y * 16 + x] = 1;
    }
}

/** OR a north-west corner piece into `m`, mirrored into the wanted corner. */
function addCorner(m: Uint8Array, cpiece: Uint8Array, mx: boolean, my: boolean): void {
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      if (!cpiece[y * 16 + x]) continue;
      m[(my ? 15 - y : y) * 16 + (mx ? 15 - x : x)] = 1;
    }
}

/**
 * Pass 2: lips and shore. Raised ground gets a two-pixel front face (deep, then
 * shade) where it drops to a lower layer, a lit one-pixel rim where it rises,
 * shaded sides, and casts a one-pixel cool shadow onto the ground below. Water
 * gets a two-step foam edge and a dark band where the deep channel begins.
 * Ground at the foot of a cliff sits in its shadow.
 */
function paintLips(col: Uint32Array, gid: Uint8Array, out: Uint32Array): void {
  const TS = tileSet();
  const ramps: (Ramp5 | undefined)[] = TS.ground.map((a) => a?.ramp);
  for (let y = 0; y < CPX; y++) {
    const prow = (y + OFF) * PW + OFF;
    for (let x = 0; x < CPX; x++) {
      const i = prow + x;
      const g = gid[i]!;
      let v = col[i]!;
      if (g !== G.Cliff) {
        const R = ramps[g];
        const gu = gid[i - PW]!;
        const gd = gid[i + PW]!;
        const gl = gid[i - 1]!;
        const gr = gid[i + 1]!;
        if (WATER[g]) {
          if (!WATER[gu] || !WATER[gd] || !WATER[gl] || !WATER[gr]) v = R![4]!;
          else if (!WATER[gid[i - 2 * PW]!] || !WATER[gid[i + 2 * PW]!] || !WATER[gid[i - 2]!] || !WATER[gid[i + 2]!]) v = R![3]!;
          else if (g === G.DeepWater && (gu === G.ShallowWater || gd === G.ShallowWater || gl === G.ShallowWater || gr === G.ShallowWater)) v = R![1]!;
        } else if (R) {
          const L = LAYER[g]!;
          if (LAYER[gd]! < L) v = R[0]!;
          else if (gd === g && LAYER[gid[i + 2 * PW]!]! < L) v = R[1]!;
          else if (LAYER[gu]! < L) v = R[3]!;
          else if (LAYER[gl]! < L || LAYER[gr]! < L) v = R[1]!;
          else if (gu === G.Cliff || gid[i - 2 * PW] === G.Cliff || gid[i - 3 * PW] === G.Cliff) v = shadow(v);
          else if (LAYER[gu]! > L && !WATER[gu]) v = shadow(v);
        }
      }
      out[y * CPX + x] = v;
    }
  }
}

/** Visit every pixel of the chunk near a polyline segment, in segment space (t along, o across). */
function forSegmentPixels(
  x0: number, y0: number, x1: number, y1: number, pad: number, tx0: number, ty0: number,
  fn: (px: number, py: number, t: number, o: number) => void,
): void {
  const ox = tx0 * 16;
  const oy = ty0 * 16;
  const minX = Math.max(ox, Math.floor(Math.min(x0, x1) - pad));
  const maxX = Math.min(ox + CPX - 1, Math.ceil(Math.max(x0, x1) + pad));
  const minY = Math.max(oy, Math.floor(Math.min(y0, y1) - pad));
  const maxY = Math.min(oy + CPX - 1, Math.ceil(Math.max(y0, y1) + pad));
  if (minX > maxX || minY > maxY) return;
  const len = Math.hypot(x1 - x0, y1 - y0);
  const ux = (x1 - x0) / len;
  const uy = (y1 - y0) / len;
  for (let wy = minY; wy <= maxY; wy++)
    for (let wx = minX; wx <= maxX; wx++) {
      const dx = wx + 0.5 - x0;
      const dy = wy + 0.5 - y0;
      fn(wx - ox, wy - oy, dx * ux + dy * uy, -dx * uy + dy * ux);
    }
}

/** Wagon ruts: two crisp dark wheel tracks, each with a lit far wall, on graded road and street. */
function paintRuts(out: Uint32Array, gid: Uint8Array, tx0: number, ty0: number): void {
  const TS = tileSet();
  const R = TS.ground[G.Road]!.ramp;
  for (const road of ROADS) {
    if (road.kind !== 'road') continue;
    for (let i = 0; i < road.points.length - 1; i++) {
      const [ax, ay] = road.points[i]!;
      const [bx, by] = road.points[i + 1]!;
      const x0 = ax * 16 + 8;
      const y0 = ay * 16 + 8;
      const x1 = bx * 16 + 8;
      const y1 = by * 16 + 8;
      const len = Math.hypot(x1 - x0, y1 - y0);
      forSegmentPixels(x0, y0, x1, y1, 8, tx0, ty0, (px, py, t, o) => {
        if (t < -6 || t > len + 6) return;
        const g = gid[(py + OFF) * PW + px + OFF]!;
        if (g !== G.Road && g !== G.Street) return;
        const a = Math.abs(o);
        // Track centred 4.5 px out: the inner half is the dark groove, the outer the lit wall.
        if (a >= 4 && a < 5) out[py * CPX + px] = R[1]!;
        else if (a >= 5 && a < 6) out[py * CPX + px] = R[3]!;
      });
    }
  }
}

/** True where the ground at world pixel (x,y) is water or ice (a bridge is needed). */
function wetAt(W: World, x: number, y: number): boolean {
  const g = W.groundAt(Math.floor(x / 16), Math.floor(y / 16));
  return WATER[g] === 1 || g === G.Ice;
}

/**
 * Road bridges: a straight timber deck laid along the road wherever it crosses
 * water — cross planks with seams, edge beams, railing posts, and a shadow cast
 * on the water below. Drawn pixel by pixel in segment space, so it stays crisp
 * at any angle.
 */
function paintBridges(W: World, out: Uint32Array, gid: Uint8Array, tx0: number, ty0: number): void {
  const deck = new Uint8Array(CPX * CPX);
  let any = false;
  for (const road of ROADS) {
    const half = road.width * 6 + 2;
    for (let i = 0; i < road.points.length - 1; i++) {
      const [ax, ay] = road.points[i]!;
      const [bx, by] = road.points[i + 1]!;
      const x0 = ax * 16 + 8;
      const y0 = ay * 16 + 8;
      const x1 = bx * 16 + 8;
      const y1 = by * 16 + 8;
      if (Math.max(x0, x1) + 64 < tx0 * 16 || Math.min(x0, x1) - 64 > (tx0 + CHUNK) * 16 || Math.max(y0, y1) + 64 < ty0 * 16 || Math.min(y0, y1) - 64 > (ty0 + CHUNK) * 16) continue;
      const len = Math.hypot(x1 - x0, y1 - y0);
      const ux = (x1 - x0) / len;
      const uy = (y1 - y0) / len;
      // Wet runs along this segment, padded so the deck lands on the banks.
      const runs: [number, number][] = [];
      let start = -1;
      for (let t = 0; t <= len; t += 2) {
        const wet = wetAt(W, x0 + ux * t, y0 + uy * t);
        if (wet && start < 0) start = t;
        if (!wet && start >= 0) {
          runs.push([start - 10, t + 10 >= len ? len + half : t + 10]);
          start = -1;
        }
      }
      if (start >= 0) runs.push([start - 10, len + half]);
      // Runs that touch a segment end carry on past the joint so the deck has no notch at a bend.
      for (const r of runs) if (r[0] < 0) r[0] = -half;
      if (!runs.length) continue;
      any = true;
      forSegmentPixels(x0, y0, x1, y1, half + 4, tx0, ty0, (px, py, t, o) => {
        let inRun = false;
        for (const [s, e] of runs) if (t >= s && t <= e) inRun = true;
        if (!inRun) return;
        const a = Math.abs(o);
        const pi = py * CPX + px;
        if (a <= half) {
          deck[pi] = 1;
          if (a > half - 1) out[pi] = o < 0 ? DECK.beamTop : DECK.beamBot;
          else if (a > half - 2) out[pi] = o < 0 ? DECK.plankB : DECK.seam;
          else {
            const k = Math.floor(t / 4);
            const f = t - k * 4;
            out[pi] = f < 1 ? DECK.seam : f < 2 ? DECK.plankB : k % 5 === 2 ? DECK.plankOld : DECK.plankA;
          }
        } else if (a <= half + 2 && ((t % 12) + 12) % 12 < 2) {
          deck[pi] = 1;
          out[pi] = DECK.post;
        }
      });
    }
  }
  if (!any) return;
  // The deck's shadow on the water just below it.
  for (let y = 1; y < CPX; y++)
    for (let x = 0; x < CPX; x++) {
      const pi = y * CPX + x;
      if (deck[pi]) continue;
      if (!WATER[gid[(y + OFF) * PW + x + OFF]!]) continue;
      if (deck[pi - CPX] || (y > 1 && deck[pi - 2 * CPX]) || (y > 2 && deck[pi - 3 * CPX])) out[pi] = shadow(out[pi]!);
    }
}

/** Railroad: ballast bed, ties every 5 px, two steel rails with a lit top — drawn pixel by pixel. */
function paintRails(out: Uint32Array, tx0: number, ty0: number): void {
  for (let i = 0; i < RAILROAD.length - 1; i++) {
    const [ax, ay] = RAILROAD[i]!;
    const [bx, by] = RAILROAD[i + 1]!;
    const x0 = ax * 16 + 8;
    const y0 = ay * 16 + 8;
    const x1 = bx * 16 + 8;
    const y1 = by * 16 + 8;
    const len = Math.hypot(x1 - x0, y1 - y0);
    forSegmentPixels(x0, y0, x1, y1, 9, tx0, ty0, (px, py, t, o) => {
      if (t < -6 || t > len + 6) return;
      const a = Math.abs(o);
      if (a > 6.5) return;
      const pi = py * CPX + px;
      const tm = ((t % 5) + 5) % 5;
      const ro = Math.floor(o);
      if (ro === -4 || ro === 3) out[pi] = RAIL.railTop;
      else if (ro === -3 || ro === 4) out[pi] = RAIL.railSide;
      else if (tm < 2) out[pi] = tm < 1 ? RAIL.tieLit : RAIL.tie;
      else if (a > 5.5) out[pi] = RAIL.ballastEdge;
      else out[pi] = (Math.floor(t) * 3 + ro * 5) % 11 === 0 ? RAIL.ballastLit : RAIL.ballast;
    });
  }
}

function paintBridge(c: CanvasRenderingContext2D, W: World, tx: number, ty: number, x: number, y: number): void {
  const vertical = W.flagAt(tx, ty - 1) & F.Bridge || W.flagAt(tx, ty + 1) & F.Bridge;
  const horizontal = W.flagAt(tx - 1, ty) & F.Bridge || W.flagAt(tx + 1, ty) & F.Bridge;
  const along = vertical && !horizontal ? 'v' : 'h';
  c.fillStyle = '#6c4228';
  c.fillRect(x, y, 16, 16);
  c.fillStyle = '#8e5c36';
  for (let k = 0; k < 16; k += 3) {
    if (along === 'h') c.fillRect(x + k, y, 2, 16);
    else c.fillRect(x, y + k, 16, 2);
  }
  // Rails at the bridge sides if neighbour is water.
  c.fillStyle = '#4a2c1e';
  if (along === 'h') {
    if (!(W.flagAt(tx, ty - 1) & F.Bridge)) c.fillRect(x, y, 16, 2);
    if (!(W.flagAt(tx, ty + 1) & F.Bridge)) c.fillRect(x, y + 14, 16, 2);
  } else {
    if (!(W.flagAt(tx - 1, ty) & F.Bridge)) c.fillRect(x, y, 2, 16);
    if (!(W.flagAt(tx + 1, ty) & F.Bridge)) c.fillRect(x + 14, y, 2, 16);
  }
}

/** Animated water glints for visible water tiles (drawn every frame). */
export function drawWaterGlints(c: CanvasRenderingContext2D, W: World, x0: number, y0: number, x1: number, y1: number, time: number, light: number): void {
  c.fillStyle = light > 0.5 ? '#c4ecf2' : '#76a0bc';
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) {
      const g = W.groundAt(tx, ty);
      if (g !== G.DeepWater && g !== G.ShallowWater) continue;
      if (W.flagAt(tx, ty) & F.Bridge) continue;
      const h = hashf(tx, ty, 2, 11);
      // A three-frame sparkle: dot, dash, dot — only on some tiles at a time.
      const phase = (time * 0.6 + h * 10) % 10;
      if (phase < 1.5) {
        const gx = tx * 16 + 2 + Math.floor((h * 97) % 10);
        const gy = ty * 16 + 2 + Math.floor((h * 53) % 11);
        if (phase < 0.5 || phase >= 1) c.fillRect(gx + 1, gy, 1, 1);
        else c.fillRect(gx, gy, 3, 1);
      }
      // One slow ripple dash drifting with the current.
      const hk = hashf(tx, ty, 5, 13);
      if (hk < 0.18) {
        const drift = Math.floor((time * (3 + hk * 4) + hk * 16) % 14);
        c.globalAlpha = 0.45;
        c.fillRect(tx * 16 + drift, ty * 16 + 4 + Math.floor(hk * 16), 2, 1);
        c.globalAlpha = 1;
      }
    }
}

/** Collect visible "tall" object tiles for y-sorted rendering. */
export function visibleObjects(W: World, x0: number, y0: number, x1: number, y1: number, out: { tx: number; ty: number; o: number }[]): void {
  out.length = 0;
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) {
      if (!W.inBounds(tx, ty)) continue;
      const o = W.obj[W.idx(tx, ty)]!;
      if (o && !FLAT_OBJECTS.has(o)) out.push({ tx, ty, o });
    }
}

export { CPX };
