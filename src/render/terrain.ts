/**
 * Terrain chunk painter and streaming cache. Each 32×32-tile chunk is
 * painted once per pixel into a 512×512 canvas: organic ground borders via a
 * noise warp, raised-edge transitions between ground layers (grass lips over
 * dirt, snow over rock), hill-shading from the height map, shoreline foam and
 * wet banks, layered cliff strata with cast shadows and scree, then a detail
 * pass of grass tufts, clustered wildflower meadows, pebbles and cracks.
 * Chunks are kept in an LRU cache — the world streams around the camera.
 */
import { Rng, hash3, hashf } from '../core/rng.ts';
import { RAILROAD, ROADS } from '../data/world.ts';
import { F, G, GROUND, O } from '../world/tiles.ts';
import type { World } from '../world/world.ts';
import { ctx2d, hexToRgb, makeCanvas, rgbToHex, shade } from './pixel.ts';
import { FLAT_OBJECTS, paintFlat } from './propSprite.ts';

export const CHUNK = 32;
/** Ground-id buffer margins: rows above (cliff faces look up to their rim) and sides. */
const PASS_MT = 28;
const PASS_MS = 3;
const CPX = CHUNK * 16;

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.47);

function pack(r: number, g: number, b: number): number {
  return (255 << 24) | (Math.max(0, Math.min(255, b)) << 16) | (Math.max(0, Math.min(255, g)) << 8) | Math.max(0, Math.min(255, r));
}
const packHex = (h: string): number => pack(...hexToRgb(h));

/**
 * 7-step hue-shifted ramp as packed ABGR: 0 = deep violet-glazed shadow,
 * 3 = the authored mid tone, 6 = warm sunlit cream highlight.
 */
function ramp7(dark: string, mid: string, light: string): Uint32Array {
  const cols = [shade(dark, -0.45), shade(dark, -0.28), shade(dark, -0.06), mid, shade(light, 0.04), shade(light, 0.22), shade(light, 0.42)];
  return new Uint32Array(cols.map(packHex));
}

/** Ground colour ramps (7 shades) indexed by ground id. */
const RAMPS: Uint32Array[] = [];
for (const k of Object.keys(GROUND)) {
  const def = GROUND[+k]!;
  RAMPS[+k] = ramp7(def.colors[0], def.colors[1], def.colors[2]);
}
const mixHex = (a: string, b: string, t: number): string => {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
};
/**
 * Landscape-scale colour drift: five ramps per ground, from a cool/lush end
 * (index 0) through the authored ramp (2) to a sun-cured/bleached end (4).
 * Chosen by a very low-frequency field so a plain reads as broad drifts of
 * greener and more golden grass (hundreds of pixels across) instead of a
 * repeated tile — variation at the scale of the landscape, calm up close.
 */
const VAR: (Uint32Array[] | undefined)[] = [];
{
  const ends: [number, [string, string, string], [string, string, string]][] = [
    [G.Grass, ['#4a7034', '#5c8640', '#76a052'], ['#76823c', '#8e9a4a', '#a8b15e']],
    [G.TallGrass, ['#6a8240', '#82984c', '#9cb05e'], ['#968a46', '#b0a254', '#c8ba6c']],
    [G.DryGrass, ['#848a58', '#9c9f68', '#b4b67e'], ['#ab9150', '#c4a860', '#d8c07a']],
    [G.ForestFloor, ['#34482e', '#445a38', '#566c44'], ['#4a4a2a', '#5c5c34', '#707040']],
    [G.Desert, ['#bc9870', '#cdab82', '#dcbe96'], ['#d2aa70', '#e2be84', '#efd29e']],
    [G.RedSand, ['#a6603e', '#b8724e', '#ca8862'], ['#bc7244', '#d08656', '#e09c6c']],
  ];
  for (const [g, cool, warm] of ends) {
    const base = GROUND[g]!.colors;
    VAR[g] = [0, 0.5, 0, 0.5, 1].map((t, i) => {
      if (i === 2) return RAMPS[g]!;
      const end = i < 2 ? cool : warm;
      return ramp7(mixHex(base[0], end[0], t), mixHex(base[1], end[1], t), mixHex(base[2], end[2], t));
    });
  }
}

/** Secondary strata ramps for cliff faces: pale cross-bedded sandstone, light granite, buff mudstone. */
const STRATA_ALT = {
  red: ramp7('#9a6a4c', '#c39069', '#e0b98c'),
  grey: ramp7('#5e5c62', '#8a867f', '#b4aea2'),
  brown: ramp7('#6c5644', '#8c7258', '#aa9072'),
};

/**
 * Ground "height" layer for transitions: where a higher layer meets a lower one,
 * the higher one gets a lit rim and a dark front lip, and casts a soft shadow
 * onto the lower ground below it — the raised-turf look of hand-made tilesets.
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
/** Sine lookup (1024 steps per turn) for sand ripples in the per-pixel loop. */
const SIN = new Float32Array(1024).map((_, i) => Math.sin((i / 1024) * Math.PI * 2));
const SIN_K = 1024 / (Math.PI * 2);
/** 1 for open water grounds (fast lookup in the per-pixel loop). */
const WATER = new Uint8Array(32);
WATER[G.DeepWater] = 1;
WATER[G.ShallowWater] = 1;
/** Grounds whose upper edge sprouts blades over the ground below. */
const GRASSY = new Uint8Array(32);
for (const g of [G.Grass, G.TallGrass, G.DryGrass, G.ForestFloor]) GRASSY[g] = 1;

/** Grounds painted with the calm (speck-free, low-dither) texture. */
const CALM = new Uint8Array(32);
for (const g of [G.Grass, G.TallGrass, G.DryGrass, G.ForestFloor, G.Desert, G.RedSand, G.Sand]) CALM[g] = 1;
/** Bare rock and flats: no per-pixel specks, softer dither (their cracks carry the texture). */
const CALM_ROCK = new Uint8Array(32);
for (const g of [G.Rock, G.RedRock, G.Hardpan, G.DryWash, G.Salt, G.Mud]) CALM_ROCK[g] = 1;

/** Tiling smooth-noise textures for clustered ground shading, warping and meadows. */
const NOISE_A = new Float32Array(128 * 128);
const NOISE_B = new Float32Array(256 * 256);
const NOISE_WX = new Float32Array(256 * 256);
const NOISE_WY = new Float32Array(256 * 256);
{
  const tileNoise = (out: Float32Array, size: number, cells: number[], seed: number) => {
    // Periodic value noise: sum of octaves on lattices that divide the tile size.
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        let v = 0;
        let w = 0;
        for (let oi = 0; oi < cells.length; oi++) {
          const cell = cells[oi]!;
          const per = size / cell;
          const fx = x / cell;
          const fy = y / cell;
          const x0 = Math.floor(fx);
          const y0 = Math.floor(fy);
          const tx = fx - x0;
          const ty = fy - y0;
          const h = (a: number, b: number) => hashf(((a % per) + per) % per, ((b % per) + per) % per, oi, seed);
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
        out[y * size + x] = v / w;
      }
  };
  tileNoise(NOISE_A, 128, [8, 4], 1234);
  tileNoise(NOISE_B, 256, [32, 16], 4321);
  tileNoise(NOISE_WX, 256, [8, 4], 911);
  tileNoise(NOISE_WY, 256, [8, 4], 1913);
}
/**
 * Very low-frequency field for landscape-scale colour drift, sampled at 1/8
 * resolution (one cell = 8 px, period 2048 px): two decorrelated NOISE_B reads
 * so the drift has no visible repeat across a biome.
 */
const MACRO = new Float32Array(256 * 256);
for (let y = 0; y < 256; y++)
  for (let x = 0; x < 256; x++) {
    const a = NOISE_B[y * 256 + x]!;
    const b = NOISE_B[((y * 3 + 101) & 255) * 256 + ((x * 3 + 57) & 255)]!;
    MACRO[y * 256 + x] = a * 0.75 + b * 0.25;
  }

/** Border warp: noise-driven (no visible period), ±~7 px, so tile edges read as organic. */
const WARP = 256;
const warpX = new Int8Array(WARP * WARP);
const warpY = new Int8Array(WARP * WARP);
for (let i = 0; i < WARP * WARP; i++) {
  // Broad meander (32 px cells) plus fine wobble (8/4 px cells) so no straight tile-row runs survive.
  const j = (i + 128 * WARP + 77) % (WARP * WARP);
  warpX[i] = Math.max(-10, Math.min(10, Math.round((NOISE_WX[i]! - 0.5) * 22 + (NOISE_B[i]! - 0.5) * 12)));
  warpY[i] = Math.max(-10, Math.min(10, Math.round((NOISE_WY[i]! - 0.5) * 22 + (NOISE_B[j]! - 0.5) * 12)));
}

/**
 * Cliff strata profile, one entry per world-pixel row (period 256): tone offset
 * per row, band id, and whether the band is the alternate (pale) bed. Beds vary
 * in thickness; each has a lit ledge on top and an undercut shadow beneath.
 */
const STRATA_T = new Float32Array(256);
const STRATA_ID = new Uint16Array(256);
const STRATA_ALTBED = new Uint8Array(256);
{
  const r = new Rng(7781);
  let y = 0;
  let id = 0;
  while (y < 256) {
    const th = Math.min(256 - y, r.int(2, 8));
    const tone = r.pick([-0.5, -0.1, 0.3, 0.6, 0]);
    const alt = r.chance(0.3) ? 1 : 0;
    for (let k = 0; k < th; k++) {
      STRATA_T[y + k] = k === 0 ? tone + 1.1 : k === th - 1 && th > 2 ? tone - 1.1 : tone;
      STRATA_ID[y + k] = id;
      STRATA_ALTBED[y + k] = alt;
    }
    y += th;
    id++;
  }
}

/** Wildflower species: [stem, bloom dark, bloom mid, bloom light] and a shape. */
interface Flower {
  cols: Uint32Array;
  shape: 'spike' | 'cup' | 'disc' | 'umbel' | 'brush';
}
const flower = (shape: Flower['shape'], ...hex: string[]): Flower => ({ shape, cols: new Uint32Array(hex.map(packHex)) });
const FL = {
  lupine: flower('spike', '#3f5a2c', '#4a3f8e', '#6a62c0', '#a8a2ea'),
  paintbrush: flower('brush', '#3f5a2c', '#8e2a2a', '#c8402e', '#ee7a52'),
  poppy: flower('cup', '#4a6430', '#b8501c', '#ec7c26', '#ffb45a'),
  sunflower: flower('disc', '#4a6430', '#6a4220', '#e8b828', '#fff07a'),
  yarrow: flower('umbel', '#4a6430', '#b8b4a0', '#ece6d2', '#ffffff'),
  globemallow: flower('cup', '#5a6a3a', '#b05a30', '#e48a50', '#ffc08a'),
  aster: flower('cup', '#3f5a2c', '#6a4a98', '#9a78c8', '#e8d070'),
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

/** Write a wildflower into a packed pixel buffer (stem at x,y; bloom above). */
function putFlower(buf: Uint32Array, x: number, y: number, f: Flower, big: boolean): void {
  const set = (xx: number, yy: number, col: number) => {
    if (xx >= 0 && yy >= 0 && xx < CPX && yy < CPX) buf[yy * CPX + xx] = col;
  };
  const [stem, dk, md, lt] = f.cols as unknown as [number, number, number, number];
  set(x, y, stem);
  switch (f.shape) {
    case 'spike':
      set(x, y - 1, dk);
      set(x, y - 2, md);
      set(x, y - 3, lt);
      if (big) {
        set(x + 1, y - 1, dk);
        set(x, y - 4, lt);
      }
      break;
    case 'brush':
      set(x, y - 1, dk);
      set(x - 1, y - 2, md);
      set(x, y - 2, lt);
      if (big) set(x + 1, y - 2, md);
      break;
    case 'cup':
      set(x - 1, y - 1, dk);
      set(x, y - 1, md);
      set(x + 1, y - 1, md);
      set(x, y - 2, lt);
      if (big) {
        set(x - 1, y - 2, md);
        set(x + 1, y - 2, lt);
      }
      break;
    case 'disc':
      set(x, y - 1, stem);
      set(x - 1, y - 2, md);
      set(x + 1, y - 2, md);
      set(x, y - 3, lt);
      set(x, y - 2, dk);
      if (big) set(x, y - 1, md);
      break;
    case 'umbel':
      set(x - 1, y - 1, md);
      set(x, y - 1, lt);
      set(x + 1, y - 1, md);
      if (big) set(x, y - 2, lt);
      break;
  }
}

const LEAF_GOLD = packHex('#d8b040');
const LEAF_RUST = packHex('#b06a2c');
const COTTON = packHex('#f2eee2');
const NEEDLE = packHex('#7a5a36');
const GRAVEL = [packHex('#6e6a66'), packHex('#9a948a')];
const GRAVEL_WARM = [packHex('#8a5a40'), packHex('#c08a62')];

/**
 * Ground litter painted under a tall prop, seeded by the tile so it differs at
 * every position even though the sprite itself has only three variants: a lusher
 * drip-line under broadleaf crowns plus fallen leaves (gold/rust in places),
 * cottonwood fluff, conifer needle mats, gravel crumbs around boulders.
 */
function litterUnder(o: number, g: number, R: Uint32Array, bx: number, by: number, r: Rng, put: (x: number, y: number, g: number, col: number) => void): void {
  const scatter = (n: number, rx: number, ry: number, col: () => number) => {
    for (let k = 0; k < n; k++) put(bx + 8 + Math.round(r.range(-rx, rx)), by + 12 + Math.round(r.range(-ry, ry)), g, col());
  };
  switch (o) {
    case O.Oak:
    case O.Cottonwood:
    case O.Aspen: {
      const n = r.int(2, 7);
      const warm = r.chance(0.35);
      scatter(n, 9, 4, () => (o === O.Aspen || warm ? (r.chance(0.6) ? LEAF_GOLD : LEAF_RUST) : R[r.chance(0.5) ? 1 : 4]!));
      if (o === O.Cottonwood && r.chance(0.6)) scatter(r.int(3, 8), 11, 5, () => COTTON);
      break;
    }
    case O.Pine:
    case O.SnowPine:
    case O.Juniper:
      if (g !== G.Snow) scatter(r.int(3, 8), 7, 3, () => (r.chance(0.6) ? NEEDLE : R[1]!));
      break;
    case O.Boulder:
    case O.Hoodoo: {
      const P = g === G.RedSand || g === G.Desert ? GRAVEL_WARM : GRAVEL;
      scatter(r.int(1, 5), 10, 3, () => P[r.int(0, 1)]!);
      break;
    }
    case O.GrassTuft:
    case O.Sage:
    case O.Bush:
      if (GRASSY[g]) scatter(r.int(0, 3), 7, 3, () => R[r.chance(0.5) ? 2 : 4]!);
      break;
  }
}

/**
 * Pass 2 of the chunk painter: per-pixel ground colour (hill shade, clustered
 * texture, landscape drift, layer transitions, water depth and foam, cliff strata).
 */
function paintPixels(
  buf: Uint32Array, gbuf: Uint8Array, crispBuf: Uint8Array, topRun: Uint8Array, botRun: Uint8Array, belowCliff: Uint8Array,
  depth: Uint8Array, shadeGrid: Float32Array, uni: Uint8Array, W: World, wx0: number, wy0: number, GW: number,
): void {
  const MT = PASS_MT;
  const MS = PASS_MS;
  const DG = CHUNK + 2;
  const SG = CHUNK + 2;
  const ww = W.w;
  const wh = W.h;
  // Pass 2: per-pixel colour. `hrow` carries the previous row's pixel hash (pebble shadows).
  const hrow = new Uint8Array(CPX);
  const rowShade = new Float32Array(SG);
  const MCOLS = (CPX >> 3) + 2;
  const rowMacro = new Float32Array(MCOLS);
  for (let px = 0; px < CPX; px++) hrow[px] = hash3(wx0 + px, wy0 - 1, 3, 77) & 255;
  for (let py = 0; py < CPX; py++) {
    const wy = wy0 + py;
    const gyRow = (py + MT) * GW + MS;
    // Hill shade interpolated down the column once per row; per pixel only across.
    const gyf = py / 16 + 0.5;
    const iyr = gyf | 0;
    const fyr = gyf - iyr;
    for (let x = 0; x < SG; x++) {
      const a0 = shadeGrid[iyr * SG + x]!;
      rowShade[x] = a0 + (shadeGrid[(iyr + 1) * SG + x]! - a0) * fyr;
    }
    const uniRow = (py >> 4) * CHUNK;
    // Macro drift field: bilinear (vertical once per row into rowMacro, horizontal per
    // pixel) so drift borders are smooth curves, not 8-px stair steps.
    {
      const my = wy / 8 + 91;
      const myi = Math.floor(my);
      const myf = my - myi;
      const r0 = (myi & 255) * 256;
      const r1 = ((myi + 1) & 255) * 256;
      const mx0 = (wx0 >> 3) + 13;
      for (let k = 0; k < MCOLS; k++) {
        const a0 = MACRO[r0 + ((mx0 + k) & 255)]!;
        rowMacro[k] = a0 + (MACRO[r1 + ((mx0 + k) & 255)]! - a0) * myf;
      }
    }
    for (let px = 0; px < CPX; px++) {
      const wx = wx0 + px;
      const gi = gyRow + px;
      const g = gbuf[gi]!;
      // Bilinear hill shade.
      const gx = px / 16 + 0.5;
      const gy = gyf;
      const ix = gx | 0;
      const fx = gx - ix;
      const fy = fyr;
      const sa = rowShade[ix]!;
      const sh = sa + (rowShade[ix + 1]! - sa) * fx;
      const fast = uni[uniRow + (px >> 4)]!;
      // Clustered texture (soft blobs of colour, like hand-placed clusters) instead of per-pixel static.
      const n = NOISE_A[(wy & 127) * 128 + (wx & 127)]!;
      const n2 = NOISE_B[((wy + 61) & 255) * 256 + ((wx * 0.5 + 37) & 255)]!;
      const dith = BAYER[(py & 3) * 4 + (px & 3)]!;
      const h = hash3(wx, wy, 3, 77) & 255;
      const hUp = hrow[px]!;
      hrow[px] = h;
      let col: number;
      if (g === G.DeepWater || g === G.ShallowWater) {
        // Depth: bilinear shore distance → light shallows at the edge, dark pools in the middle.
        const di = gx | 0;
        const dj = gy | 0;
        const d00 = depth[dj * DG + di]!;
        const d10 = depth[dj * DG + di + 1]!;
        const d01 = depth[(dj + 1) * DG + di]!;
        const d11 = depth[(dj + 1) * DG + di + 1]!;
        const dep = d00 + (d10 - d00) * fx + (d01 - d00) * fy + (d00 - d10 - d01 + d11) * fx * fy;
        let v = 4.3 - dep * 0.75 + (n2 - 0.5) * 0.7 + dith * 0.6;
        // Foam line hugging the bank, broken into clumps.
        const nearLand = !fast && (!WATER[gbuf[gi + 2]!] || !WATER[gbuf[gi - 2]!] || !WATER[gbuf[gi + 2 * GW]!] || !WATER[gbuf[gi - 2 * GW]!]);
        const atBank = !fast && (!WATER[gbuf[gi + 1]!] || !WATER[gbuf[gi - 1]!] || !WATER[gbuf[gi + GW]!] || !WATER[gbuf[gi - GW]!]);
        if (atBank) v = n > 0.35 ? 6 : 5;
        else if (nearLand && n > 0.42) v = 5;
        col = RAMPS[G.ShallowWater]![Math.max(0, Math.min(6, Math.round(v)))]!;
        if (dep > 2.2) col = RAMPS[G.DeepWater]![Math.max(0, Math.min(6, Math.round(v + 1.5)))]!;
      } else if (g === G.Cliff) {
        const dT = topRun[gi]!;
        const dB = botRun[gi]!;
        // Beds wander a little so the strata read as rock, not ruled lines.
        const yy = (wy + (((n - 0.5) * 7) | 0) + ((wx >> 5) & 1)) & 255;
        const bed = STRATA_ID[yy]!;
        let v = 3 + STRATA_T[yy]! + sh * 1.2 + (n2 - 0.5) * 0.7 + dith * 0.35;
        // Vertical joints: a dark fissure with a lit lip on its left.
        const jh = hash3(wx, bed, 7, 2) & 31;
        if (jh === 0) v -= 1.6;
        else if ((hash3(wx + 1, bed, 7, 2) & 31) === 0) v += 0.8;
        // Rim: lit cap rock, then the shadowed undercut below it.
        if (dT <= 2) v = 6 - (dT - 1);
        else if (dT <= 4) v -= 1.3;
        // Foot of the face sits in shade.
        if (dB <= 7) v -= (8 - dB) * 0.28;
        const ri = W.region[Math.min(wh - 1, Math.max(0, wy >> 4)) * ww + Math.min(ww - 1, Math.max(0, wx >> 4))]!;
        const warm = ri >= 4;
        const alpine = ri === 2 || ri === 3;
        const rmp = STRATA_ALTBED[yy] && dT > 2 ? (warm ? STRATA_ALT.red : alpine ? STRATA_ALT.grey : STRATA_ALT.brown) : warm ? RAMPS[G.RedRock]! : alpine ? RAMPS[G.Rock]! : RAMPS[G.Cliff]!;
        col = rmp[Math.max(0, Math.min(6, Math.round(v)))]!;
      } else {
        // Snow is bright and low-contrast so tracks read; soft blue wind drifts.
        // Grass and sand stay calm (Stardew: the ground is a quiet stage so figures
        // pop): broad soft value drifts, a whisper of dither, no per-pixel specks.
        const calm = CALM[g]!;
        let v =
          g === G.Snow
            ? 4.6 + sh * 1.1 + (n2 - 0.5) * 1.0 + (n - 0.5) * 0.4 + dith * 0.2
            : calm
              ? 3 + sh * 1.6 + (n2 - 0.5) * 1.05 + (n - 0.5) * 0.5 + dith * 0.16
              : CALM_ROCK[g]
                ? 3 + sh * 1.7 + (n - 0.5) * 0.9 + (n2 - 0.5) * 0.8 + dith * 0.22
                : 3 + sh * 1.7 + (n - 0.5) * 1.15 + (n2 - 0.5) * 0.8 + dith * 0.32 + (h < 4 ? -0.6 : 0);
        // Landscape-scale hue drift (greener / more golden fields, bleached / deeper sand).
        let RG = RAMPS[g]!;
        const vr = VAR[g];
        if (vr) {
          const mk = px >> 3;
          const m0 = rowMacro[mk]!;
          const m = m0 + (rowMacro[mk + 1]! - m0) * ((px & 7) / 8) + (n - 0.5) * 0.08;
          RG = vr[m < 0.4 ? 0 : m < 0.47 ? 1 : m < 0.54 ? 2 : m < 0.61 ? 3 : 4]!;
        }
        const crisp = crispBuf[gi]! | fast;
        if (g === G.WoodFloor) {
          // Plank floor.
          v = 3 + ((wy & 3) === 0 ? -1 : 0) + ((((wy >> 2) * 7 + (wx >> 4)) % 5 === 0 && (wx & 15) === 0) ? -1 : 0) + (n - 0.5) * 0.4;
        } else if (!crisp) {
          // Raised-edge transitions between ground layers.
          const L = LAYER[g]!;
          const gN = gbuf[gi - GW]!;
          const gN2 = gbuf[gi - 2 * GW]!;
          const gS = gbuf[gi + GW]!;
          const LN = LAYER[gN]!;
          if (gN !== g && LN > L && LN < 9 && gN !== G.Snow && GRASSY[gN] && (h & 3) !== 0 && h < 150) {
            // Blades of the turf above spill over its edge.
            v = 2.5 + (h & 1) * 1.5;
            buf[py * CPX + px] = RAMPS[gN]![Math.round(v)]!;
            continue;
          }
          if (gN !== g && LN > L && LN < 9) v -= 1.4;
          else if (gN2 !== g && LAYER[gN2]! > L && LAYER[gN2]! < 9) v -= 0.8;
          else if (gS !== g && LAYER[gS]! < L) v -= 1.1;
          else if ((gN !== g && LN < L) || (gbuf[gi - 1] !== g && LAYER[gbuf[gi - 1]!]! < L)) v += 1;
          // Wet bank: land right beside water is darker and cooler.
          if (L > 0 && (WATER[gbuf[gi + 2]!] || WATER[gbuf[gi - 2]!] || WATER[gbuf[gi + 2 * GW]!] || WATER[gbuf[gi - 2 * GW]!])) v -= 0.9;
          // Cast shadow of a cliff face onto the ground at its foot, and fallen scree.
          const bc = belowCliff[gi]!;
          if (bc > 0 && bc < 7) v -= (7 - bc) * 0.3 + dith * 0.3;
          else if (bc < 14 && h > 250) v += 1.6;
        }
        switch (g) {
          case G.Road:
          case G.Street:
            if (n > 0.93) v -= 1.2;
            if (h < 3) v += 1.4;
            else if (hUp < 3) v -= 1.3;
            break;
          case G.Dirt:
          case G.Farmland:
            if (h < 4) v += 1.3;
            else if (hUp < 4) v -= 1.2;
            break;
          case G.Desert:
          case G.RedSand: {
            // Wind ripples only in drifting dune fields (where the broad noise is high),
            // a single lit crest line each — sand reads smooth, not gritty.
            if (n2 > 0.55) {
              const r = SIN[((((wy + n2 * 26) * 0.55 + wx * 0.1) * SIN_K) | 0) & 1023]!;
              if (r > 0.94) v += 0.75;
              else if (r < -0.97) v -= 0.45;
            }
            break;
          }
          case G.Mud:
            // Drying mud: a few wet glints and shallow cracks.
            if (h < 3) v += 2;
            else if (Math.abs(NOISE_A[((wy + 40) & 127) * 128 + ((wx + 90) & 127)]! - 0.5) < 0.012) v -= 1;
            break;
          case G.Hardpan:
          case G.Salt:
          case G.DryWash: {
            // Mud-crack network: contour lines of a noise field.
            const k = NOISE_A[((wy + 40) & 127) * 128 + ((wx * 1 + 90) & 127)]!;
            if (Math.abs(k - 0.5) < 0.014) v -= g === G.Salt ? 0.9 : 1.4;
            else if (Math.abs(k - 0.5) < 0.03) v += 0.4;
            break;
          }
          case G.Rock:
          case G.RedRock: {
            const k = NOISE_A[((wy * 2 + 17) & 127) * 128 + ((wx + 5) & 127)]!;
            // Joint cracks, plus lit exfoliation plates.
            if (Math.abs(k - 0.5) < 0.016) v -= 1.5;
            else if (k > 0.5 && k < 0.53) v += 0.7;
            else if (k > 0.66) v += 0.5;
            if (g === G.RedRock) v += STRATA_T[(wy + ((n2 * 12) | 0)) & 255]! * 0.2;
            break;
          }
          case G.Snow:
            if (h < 2 && v > 4.5) {
              buf[py * CPX + px] = 0xffffffff;
              continue;
            }
            break;
        }
        const vi = (v + 0.5) | 0;
        col = RG[vi < 0 ? 0 : vi > 6 ? 6 : vi]!;
      }
      buf[py * CPX + px] = col;
    }
  }
}

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
    const buf = new Uint32Array(img.data.buffer);
    const tx0 = cx * CHUNK;
    const ty0 = cy * CHUNK;
    const wx0 = tx0 * 16;
    const wy0 = ty0 * 16;

    // Distance from each water tile to the nearest shore (0..5), for depth colouring.
    const DG = CHUNK + 2;
    const depth = new Uint8Array(DG * DG);
    for (let y = 0; y < DG; y++)
      for (let x = 0; x < DG; x++) {
        const tx = tx0 + x - 1;
        const ty = ty0 + y - 1;
        if (!isWater(W.groundAt(tx, ty))) continue;
        let dmin = 5;
        for (let r = 1; r < 5 && dmin === 5; r++)
          for (let k = -r; k <= r; k++)
            if (!isWater(W.groundAt(tx + k, ty - r)) || !isWater(W.groundAt(tx + k, ty + r)) || !isWater(W.groundAt(tx - r, ty + k)) || !isWater(W.groundAt(tx + r, ty + k))) {
              dmin = r;
              break;
            }
        depth[y * DG + x] = dmin;
      }
    // Per-tile hill shade on a (CHUNK+2)^2 grid, light from the north-west.
    const SG = CHUNK + 2;
    const shadeGrid = new Float32Array(SG * SG);
    for (let y = 0; y < SG; y++)
      for (let x = 0; x < SG; x++) {
        const tx = tx0 + x - 1;
        const ty = ty0 + y - 1;
        const h = W.heightAt(tx, ty);
        const dx = W.heightAt(tx + 1, ty) - W.heightAt(tx - 1, ty);
        const dy = W.heightAt(tx, ty + 1) - W.heightAt(tx, ty - 1);
        shadeGrid[y * SG + x] = Math.max(-1, Math.min(1, (-dx - dy) * 0.045)) + (h - 100) * 0.0012;
      }

    // Pass 1: warped ground id per pixel, with a margin (tall on top so cliff faces
    // know how far below their rim a pixel sits).
    const MT = PASS_MT;
    const MS = PASS_MS;
    const GW = CPX + MS * 2;
    const GH = CPX + MT + MS;
    const gbuf = new Uint8Array(GW * GH);
    const crispBuf = new Uint8Array(GW * GH);
    const Wg = W.ground;
    const Wf = W.flags;
    const Wb = W.buildingAt;
    const ww = W.w;
    const wh = W.h;
    // Tiles that must keep crisp edges (interiors, bridges, building footprints) — and
    // tiles whose ground may not bleed into a neighbour — looked up once per tile.
    const CRISP_F = F.Interior | F.Bridge;
    const INT_F = F.Interior;
    const TX0 = tx0 - 1;
    const TY0 = ty0 - 2;
    const TW = CHUNK + 2;
    const TH = CHUNK + 3;
    const tCrisp = new Uint8Array(TW * TH);
    for (let y = 0; y < TH; y++)
      for (let x = 0; x < TW; x++) {
        const tx = TX0 + x;
        const ty = TY0 + y;
        if (tx < 0 || ty < 0 || tx >= ww || ty >= wh) continue;
        const bi = ty * ww + tx;
        tCrisp[y * TW + x] = (Wf[bi]! & CRISP_F) !== 0 || Wb[bi]! > 0 ? 1 : 0;
      }
    for (let gy = 0; gy < GH; gy++) {
      const wy = wy0 + gy - MT;
      const tty = wy >> 4;
      const wrow = (wy & (WARP - 1)) * WARP;
      for (let gx = 0; gx < GW; gx++) {
        const wx = wx0 + gx - MS;
        const ttx = wx >> 4;
        const gi = gy * GW + gx;
        if (ttx < 0 || tty < 0 || ttx >= ww || tty >= wh) {
          gbuf[gi] = G.DeepWater;
          continue;
        }
        const bi = tty * ww + ttx;
        if (tCrisp[(tty - TY0) * TW + ttx - TX0]) {
          gbuf[gi] = Wg[bi]!;
          crispBuf[gi] = 1;
          continue;
        }
        const wi = wrow + (wx & (WARP - 1));
        const sx = (wx + warpX[wi]!) >> 4;
        const sy = (wy + warpY[wi]!) >> 4;
        if (sx < 0 || sy < 0 || sx >= ww || sy >= wh) {
          gbuf[gi] = Wg[bi]!;
          continue;
        }
        const si = sy * ww + sx;
        gbuf[gi] = Wf[si]! & INT_F || Wb[si] ? Wg[bi]! : Wg[si]!;
      }
    }
    // Column runs: how deep inside a cliff face (from its rim / to its foot), and
    // how far below the last cliff pixel a ground pixel sits (for cast shadow, scree).
    const topRun = new Uint8Array(GW * GH);
    const botRun = new Uint8Array(GW * GH);
    const belowCliff = new Uint8Array(GW * GH);
    for (let gx = 0; gx < GW; gx++) {
      let run = 0;
      let since = 255;
      for (let gy = 0; gy < GH; gy++) {
        const gi = gy * GW + gx;
        if (gbuf[gi] === G.Cliff) {
          run = Math.min(255, run + 1);
          since = 0;
        } else {
          run = 0;
          since = Math.min(255, since + 1);
        }
        topRun[gi] = run;
        belowCliff[gi] = since;
      }
      run = 0;
      for (let gy = GH - 1; gy >= 0; gy--) {
        const gi = gy * GW + gx;
        run = gbuf[gi] === G.Cliff ? Math.min(255, run + 1) : 0;
        botRun[gi] = run;
      }
    }

    // Tiles whose whole 5×5 neighbourhood is one ground (no cliff, nothing crisp): no
    // transition, wet-bank or cliff-shadow test can fire in them, so pass 2 skips those
    // neighbour lookups — most of a big biome is interior, which keeps first paint cheap.
    const uni = new Uint8Array(CHUNK * CHUNK);
    {
      const NW = CHUNK + 4;
      const ng = new Int16Array(NW * NW);
      for (let y = 0; y < NW; y++)
        for (let x = 0; x < NW; x++) {
          const tx = tx0 + x - 2;
          const ty = ty0 + y - 2;
          const inb = tx >= 0 && ty >= 0 && tx < ww && ty < wh;
          const bi = ty * ww + tx;
          ng[y * NW + x] = !inb ? -1 : (Wf[bi]! & CRISP_F) !== 0 || Wb[bi]! > 0 ? -2 : Wg[bi]!;
        }
      for (let y = 0; y < CHUNK; y++)
        for (let x = 0; x < CHUNK; x++) {
          const g0 = ng[(y + 2) * NW + x + 2]!;
          if (g0 < 0 || g0 === G.Cliff) continue;
          let same = 1;
          for (let k = 0; k < 25 && same; k++) if (ng[(y + ((k / 5) | 0)) * NW + x + (k % 5)] !== g0) same = 0;
          uni[y * CHUNK + x] = same;
        }
    }

    // Pass 2 lives in its own function: kept out of this (very large) method so the
    // hot per-pixel loop gets optimised on its own — a monolithic paint() deopts.
    paintPixels(buf, gbuf, crispBuf, topRun, botRun, belowCliff, depth, shadeGrid, uni, W, wx0, wy0, GW);

    // Pass 3: hand-placed-looking details written straight into the pixel buffer —
    // grass tufts, forest litter, pebbles, and clustered wildflower meadows.
    const ownGround = (x: number, y: number, g: number) => x >= 0 && y >= 0 && x < CPX && y < CPX && gbuf[(y + MT) * GW + x + MS] === g;
    const put = (x: number, y: number, g: number, col: number) => {
      if (ownGround(x, y, g)) buf[y * CPX + x] = col;
    };
    const flowerPools = REGION_FLOWERS;
    for (let ty = 0; ty < CHUNK; ty++)
      for (let tx = 0; tx < CHUNK; tx++) {
        const wtx = tx0 + tx;
        const wty = ty0 + ty;
        if (!W.inBounds(wtx, wty)) continue;
        const i = W.idx(wtx, wty);
        const fl = W.flags[i]!;
        if (fl & (F.Road | F.Rail | F.Interior | F.Bridge) || W.buildingAt[i]) continue;
        const o = W.obj[i]!;
        const g = W.ground[i]!;
        const R = RAMPS[g]!;
        const r = new Rng(hash3(wtx, wty, 4, 1));
        const bx = tx * 16;
        const by = ty * 16;
        const reg = W.region[i]!;
        // Meadow mask (low frequency → drifts of flowers) and species zones.
        const meadow = NOISE_B[((wty * 4 + 100) & 255) * 256 + ((wtx * 4 + 50) & 255)]!;
        const zone = NOISE_B[((wty * 3 + 7) & 255) * 256 + ((wtx * 3 + 160) & 255)]!;
        const pool = flowerPools[reg] ?? flowerPools[0]!;
        const pickSpecies = (accent: boolean) => {
          const t = Math.max(0, Math.min(0.999, (zone - 0.3) / 0.4));
          let k = Math.floor(t * pool.length);
          if (accent) k = (k + 1 + r.int(0, pool.length - 2)) % pool.length;
          return pool[k]!;
        };
        const flowersHere = (count: number) => {
          const cxp = bx + r.int(3, 12);
          const cyp = by + r.int(5, 14);
          const main = pickSpecies(false);
          for (let k = 0; k < count; k++) {
            const fx = Math.round(cxp + r.range(-5, 5));
            const fy = Math.round(cyp + r.range(-4, 4));
            if (!ownGround(fx, fy, g) && o !== O.Flowers) continue;
            putFlower(buf, fx, fy, r.chance(0.88) ? main : pickSpecies(true), r.chance(0.35));
          }
        };
        if (o === O.Flowers) {
          flowersHere(7 + r.int(0, 4));
          continue;
        }
        if (o) {
          if (GRASSY[g] || g === G.Snow || g === G.Desert || g === G.RedSand || g === G.Dirt) litterUnder(o, g, R, bx, by, r, put);
          continue;
        }
        switch (g) {
          case G.Grass:
          case G.TallGrass:
          case G.DryGrass: {
            // Tufts come in small hand-placed clumps where a field says so, and most
            // tiles stay bare — sparse marks, not an even sprinkle (calm ground).
            const tall = g === G.TallGrass;
            const field = NOISE_A[((wty * 5) & 127) * 128 + ((wtx * 5 + 30) & 127)]!;
            const clumps = (field > 0.6 ? 2 : field > 0.48 ? 1 : r.chance(0.22) ? 1 : 0) + (tall && r.chance(0.5) ? 1 : 0);
            for (let q = 0; q < clumps; q++) {
              const cx = bx + r.int(3, 12);
              const cy = by + r.int(5, 14);
              const k = r.int(2, tall ? 4 : 3);
              for (let j = 0; j < k; j++) {
                const x = cx + r.int(-3, 3);
                const y = cy + r.int(-1, 1) + (j & 1);
                if (r.chance(0.55)) {
                  // V tuft: dark root, two lit blades.
                  put(x, y, g, R[2]!);
                  put(x - 1, y - 1, g, R[4]!);
                  put(x + 1, y - 1, g, R[5]!);
                } else {
                  // Single tall blade with a lit tip (taller on prairie).
                  put(x, y, g, R[2]!);
                  put(x, y - 1, g, R[4]!);
                  if (tall) put(x + (j & 1), y - 2, g, R[5]!);
                }
              }
            }
            if (meadow > 0.62) flowersHere(Math.min(10, Math.round((meadow - 0.62) * 80)));
            else if (r.chance(0.025)) flowersHere(1);
            break;
          }
          case G.ForestFloor: {
            // Needle litter and moss in a couple of loose patches per tile.
            const k = r.int(1, 3);
            const cx = bx + r.int(3, 12);
            const cy = by + r.int(3, 12);
            for (let j = 0; j < k; j++) {
              const x = cx + r.int(-4, 4);
              const y = cy + r.int(-3, 3);
              if (r.chance(0.5)) {
                put(x, y, g, R[1]!);
                put(x + 1, y + 1, g, R[2]!);
              } else {
                put(x, y, g, R[4]!);
                put(x + 1, y, g, R[3]!);
              }
            }
            if (meadow > 0.66) flowersHere(Math.min(5, Math.round((meadow - 0.66) * 30)));
            break;
          }
          case G.Desert:
          case G.RedSand:
          case G.Hardpan:
          case G.DryWash:
          case G.Dirt: {
            const peb = r.int(0, 2);
            for (let k = 0; k < peb; k++) {
              const x = bx + r.int(1, 13);
              const y = by + r.int(1, 13);
              put(x, y, g, R[5]!);
              put(x + 1, y, g, R[4]!);
              put(x, y + 1, g, R[1]!);
              put(x + 1, y + 1, g, R[0]!);
            }
            // A spring bloom drifts into the desert where the meadow field peaks.
            if (reg >= 4 && meadow > 0.66 && g !== G.Dirt) flowersHere(Math.min(4, Math.round((meadow - 0.66) * 25)));
            break;
          }
          case G.Rock:
          case G.RedRock:
            if (r.chance(0.22)) {
              // Lichen rosettes.
              const x = bx + r.int(2, 12);
              const y = by + r.int(2, 12);
              const lc = reg >= 4 ? 0xff3a8ad8 : 0xff6aa89a;
              put(x, y, g, lc);
              put(x + 1, y, g, lc);
              put(x, y + 1, g, R[2]!);
            }
            break;
          case G.Snow:
            if (r.chance(0.25)) {
              // Tiny wind scallop: lit crest, cool hollow.
              const x = bx + r.int(1, 12);
              const y = by + r.int(2, 14);
              put(x, y, g, R[3]!);
              put(x + 1, y, g, R[3]!);
              put(x, y - 1, g, R[6]!);
            }
            break;
        }
      }
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
        // Road bridges are drawn as proper decks below; only stray bridge tiles fall back to planks.
        if (W.flags[i]! & F.Bridge && !(W.flags[i]! & (F.Road | F.Trail | F.Rail))) paintBridge(c, W, wtx, wty, tx * 16, ty * 16);
      }


    // Bridges: a straight timber deck laid along the road wherever it crosses water,
    // with a shadow on the water, cross planks, edge beams, railing posts.
    c.save();
    c.translate(-tx0 * 16, -ty0 * 16);
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
        const ang = Math.atan2(y1 - y0, x1 - x0);
        let runStart = -1;
        const flush = (endT: number) => {
          const st = Math.max(0, runStart - 10);
          const en = Math.min(len, endT + 10);
          c.save();
          c.translate(x0 + Math.cos(ang) * st, y0 + Math.sin(ang) * st);
          c.rotate(ang);
          const L = en - st;
          c.fillStyle = 'rgba(16,28,40,0.35)';
          c.fillRect(2, -half + 5, L, half * 2);
          c.fillStyle = '#6a4a30';
          c.fillRect(0, -half, L, half * 2);
          for (let k = 0; k < L; k += 3) {
            c.fillStyle = (k / 3) % 4 === 0 ? '#5a3e28' : (k / 3) % 2 ? '#8a6440' : '#7a5636';
            c.fillRect(k, -half + 1, 2, half * 2 - 2);
          }
          c.fillStyle = '#3e2a1a';
          c.fillRect(0, -half - 1, L, 2);
          c.fillRect(0, half - 1, L, 2);
          for (let k = 2; k < L; k += 12) {
            c.fillStyle = '#4a3220';
            c.fillRect(k, -half - 3, 2, 3);
            c.fillRect(k, half - 1, 2, 3);
          }
          c.restore();
        };
        for (let t = 0; t <= len; t += 2) {
          const px2 = x0 + Math.cos(ang) * t;
          const py2 = y0 + Math.sin(ang) * t;
          const g = W.groundAt(Math.floor(px2 / 16), Math.floor(py2 / 16));
          const wet = isWater(g) || g === G.Ice;
          if (wet && runStart < 0) runStart = t;
          if (!wet && runStart >= 0) {
            flush(t);
            runStart = -1;
          }
        }
        if (runStart >= 0) flush(len);
      }
    }
    c.restore();

    // Wagon ruts worn into the roads: two darker wheel tracks with a hoof-beaten crown between.
    c.save();
    c.translate(-tx0 * 16, -ty0 * 16);
    for (const road of ROADS) {
      if (road.kind !== 'road') continue;
      for (let i = 0; i < road.points.length - 1; i++) {
        const [ax, ay] = road.points[i]!;
        const [bx, by] = road.points[i + 1]!;
        const x0 = ax * 16 + 8;
        const y0 = ay * 16 + 8;
        const x1 = bx * 16 + 8;
        const y1 = by * 16 + 8;
        if (Math.max(x0, x1) + 16 < tx0 * 16 || Math.min(x0, x1) - 16 > (tx0 + CHUNK) * 16 || Math.max(y0, y1) + 16 < ty0 * 16 || Math.min(y0, y1) - 16 > (ty0 + CHUNK) * 16) continue;
        const len = Math.hypot(x1 - x0, y1 - y0);
        const nx = -(y1 - y0) / len;
        const ny = (x1 - x0) / len;
        for (let t = 0; t < len; t += 1) {
          const bxp = x0 + ((x1 - x0) * t) / len;
          const byp = y0 + ((y1 - y0) * t) / len;
          const wob = Math.sin(t * 0.05 + i) * 1.2;
          for (const off of [-4.5, 4.5]) {
            const rx = Math.round(bxp + nx * (off + wob));
            const ry = Math.round(byp + ny * (off + wob));
            const tile = W.groundAt(rx >> 4, ry >> 4);
            if (tile !== 13 && tile !== 18) continue; // only on graded road / street
            if ((hash3(rx, ry, 9, 3) & 7) === 0) continue;
            c.fillStyle = 'rgba(70,50,34,0.32)';
            c.fillRect(rx, ry, 1, 1);
            if ((hash3(rx, ry, 4, 1) & 3) === 0) {
              c.fillStyle = 'rgba(190,160,120,0.35)';
              c.fillRect(rx - Math.round(nx), ry - Math.round(ny), 1, 1);
            }
          }
        }
      }
    }
    c.restore();

    // Railroad drawn from its polyline (ties + two rails), clipped to the chunk.
    c.save();
    c.translate(-tx0 * 16, -ty0 * 16);
    for (let i = 0; i < RAILROAD.length - 1; i++) {
      const [ax, ay] = RAILROAD[i]!;
      const [bx, by] = RAILROAD[i + 1]!;
      const x0 = ax * 16 + 8;
      const y0 = ay * 16 + 8;
      const x1 = bx * 16 + 8;
      const y1 = by * 16 + 8;
      const minX = Math.min(x0, x1) - 16;
      const maxX = Math.max(x0, x1) + 16;
      const minY = Math.min(y0, y1) - 16;
      const maxY = Math.max(y0, y1) + 16;
      if (maxX < tx0 * 16 || minX > (tx0 + CHUNK) * 16 || maxY < ty0 * 16 || minY > (ty0 + CHUNK) * 16) continue;
      const len = Math.hypot(x1 - x0, y1 - y0);
      const ux = (x1 - x0) / len;
      const uy = (y1 - y0) / len;
      const nx = -uy;
      const ny = ux;
      // Ballast.
      c.strokeStyle = '#7a7068';
      c.lineWidth = 12;
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      c.stroke();
      c.fillStyle = '#5a3e2a';
      for (let t = 0; t < len; t += 5) {
        const x = Math.round(x0 + ux * t);
        const y = Math.round(y0 + uy * t);
        c.save();
        c.translate(x, y);
        c.rotate(Math.atan2(ny, nx));
        c.fillRect(-7, -1, 14, 2);
        c.restore();
      }
      c.strokeStyle = '#3a3a3e';
      c.lineWidth = 1;
      for (const off of [-4, 4]) {
        c.beginPath();
        c.moveTo(Math.round(x0 + nx * off) + 0.5, Math.round(y0 + ny * off) + 0.5);
        c.lineTo(Math.round(x1 + nx * off) + 0.5, Math.round(y1 + ny * off) + 0.5);
        c.stroke();
      }
      c.strokeStyle = '#8c8c94';
      for (const off of [-3, 5]) {
        c.beginPath();
        c.moveTo(Math.round(x0 + nx * off) + 0.5, Math.round(y0 + ny * off) - 0.5);
        c.lineTo(Math.round(x1 + nx * off) + 0.5, Math.round(y1 + ny * off) - 0.5);
        c.stroke();
      }
    }
    c.restore();
    return cv;
  }
}

function isWater(g: number): boolean {
  return g === G.DeepWater || g === G.ShallowWater;
}

function paintBridge(c: CanvasRenderingContext2D, W: World, tx: number, ty: number, x: number, y: number): void {
  const vertical = W.flagAt(tx, ty - 1) & F.Bridge || W.flagAt(tx, ty + 1) & F.Bridge;
  const horizontal = W.flagAt(tx - 1, ty) & F.Bridge || W.flagAt(tx + 1, ty) & F.Bridge;
  const along = vertical && !horizontal ? 'v' : 'h';
  c.fillStyle = '#6a4a30';
  c.fillRect(x, y, 16, 16);
  c.fillStyle = '#8a6440';
  for (let k = 0; k < 16; k += 3) {
    if (along === 'h') c.fillRect(x + k, y, 2, 16);
    else c.fillRect(x, y + k, 16, 2);
  }
  // Rails at the bridge sides if neighbour is water.
  c.fillStyle = '#4a3424';
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
  c.fillStyle = light > 0.5 ? 'rgba(220,240,240,0.75)' : 'rgba(150,170,200,0.5)';
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) {
      const g = W.groundAt(tx, ty);
      if (g !== G.DeepWater && g !== G.ShallowWater) continue;
      if (W.flagAt(tx, ty) & F.Bridge) continue;
      const h = hashf(tx, ty, 2, 11);
      const phase = (time * 0.6 + h * 10) % 4;
      if (phase < 1.4) {
        const gx = tx * 16 + ((h * 97) % 12) + Math.floor(phase * 2);
        const gy = ty * 16 + ((h * 53) % 12);
        c.fillRect(gx, gy, phase < 0.7 ? 2 : 3, 1);
      }
      // Slow drifting ripple lines (current), two per tile.
      for (let k = 0; k < 2; k++) {
        const hk = hashf(tx, ty, 5 + k, 13);
        const drift = (time * (4 + hk * 5) + hk * 16) % 16;
        const ry = ty * 16 + 3 + Math.floor(hk * 10);
        const len = 2 + Math.floor(hk * 3);
        c.globalAlpha = 0.35;
        c.fillRect(tx * 16 + Math.floor(drift), ry, len, 1);
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
void O;
