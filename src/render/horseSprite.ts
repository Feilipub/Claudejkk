/**
 * Horse sprites, hand-pixelled. Every pose is a drawing in `horsePixel.ts` (one character per
 * pixel); this module only chooses drawings and swaps palettes, it paints nothing itself.
 *
 * - Three body templates (light/refined, stock, heavy draft) chosen by breed.
 * - Side view is layered from parts so one drawing serves every gait: far legs, tail, the body
 *   with neck and head (six head carriages), near legs, then tack. Each leg is a pose from a small
 *   hand-drawn library, so every leg carries its own markings.
 * - Coats are palette swaps of the same drawing (hand-tuned 4-step ramps per coat); white patterns,
 *   spots, roaning, dapples and the dun stripe are hand-drawn masks laid over the body grid.
 * - Front and back views (riding south/north) are their own drawings with separate legs.
 *
 * Everything is built once per horse and cached.
 */
import { getBreed } from '../data/breeds.ts';
import { getCoat } from '../data/coats.ts';
import { getItem } from '../data/items.ts';
import type { HorseData } from '../horse/horse.ts';
import { Rng } from '../core/rng.ts';
import { ctx2d, makeCanvas, mix, shade } from './pixel.ts';
import { pixmap, PAL } from './pixmap.ts';
import { HORSE_ART, type FBArt, type Grid, type HorseArt, type SideArt, type TailVar, type UpperVar } from './horsePixel.ts';

export const HW = 64;
export const HH = 44;
export const GROUND_Y = 40;

export type HorseAnim = 'idle' | 'walk' | 'trot' | 'canter' | 'gallop' | 'graze' | 'rear' | 'jump' | 'lie' | 'buck';
export type View = 'side' | 'front' | 'back';

export interface HorseFrame {
  img: HTMLCanvasElement | OffscreenCanvas;
  /** Saddle seat position (for the rider) relative to the frame's top-left. */
  sx: number;
  sy: number;
}

export interface HorseSpriteSet {
  side: Record<HorseAnim, HorseFrame[]>;
  front: Record<'idle' | 'walk' | 'run', HorseFrame[]>;
  back: Record<'idle' | 'walk' | 'run', HorseFrame[]>;
}

type Cv = HTMLCanvasElement | OffscreenCanvas;
type Key = Record<string, string>;

// ---------------------------------------------------------------------------------------------
// Coats: hand-tuned ramps. Outline is the coat's own darkest tone (never black), one shadow,
// the base and one warm highlight (a cool sky sheen on the black). Saturated and clean.
// ---------------------------------------------------------------------------------------------
interface Ramp {
  coat: [string, string, string, string]; // outline, shadow, base, highlight
  mane: [string, string, string]; // outline, base, highlight
  points: [string, string, string] | null; // outline, shadow, base of the lower legs
  muzzle: string;
  roan?: string;
  dapple?: string;
  fleck?: string;
  dorsal?: string;
}

const BLACK_POINTS: [string, string, string] = ['#0e0a09', '#1e1612', '#30241c'];
const RAMPS: Record<string, Ramp> = {
  bay: { coat: ['#3a1a10', '#7a3a1a', '#a5552a', '#c97a40'], mane: ['#0e0a09', '#22180f', '#3e2c20'], points: BLACK_POINTS, muzzle: '#4a2a1a' },
  darkBay: { coat: ['#1c0e09', '#3e2014', '#5c321e', '#80502e'], mane: ['#08060a', '#16100c', '#2c201a'], points: BLACK_POINTS, muzzle: '#2c1810' },
  chestnut: { coat: ['#4a1c0c', '#8a3a16', '#b4521e', '#d8763a'], mane: ['#4a1c0c', '#93401a', '#c0622c'], points: null, muzzle: '#7a3418' },
  sorrel: { coat: ['#5a2810', '#a4561e', '#cc7a32', '#eca25a'], mane: ['#7a4a20', '#e0b070', '#f6d8a0'], points: null, muzzle: '#94481c' },
  black: { coat: ['#09080b', '#17151b', '#29272f', '#4a5266'], mane: ['#060508', '#131117', '#2e3140'], points: null, muzzle: '#1e1a1e' },
  grey: { coat: ['#3c3e46', '#7a7e88', '#a6aab2', '#d4d7da'], mane: ['#2c2e34', '#5c5f66', '#8a8d94'], points: ['#24262a', '#3e4046', '#585b62'], muzzle: '#4a4a50', dapple: '#d4d7da' },
  white: { coat: ['#7a746c', '#bcb6ac', '#e4e0d6', '#fbf8f2'], mane: ['#8a847a', '#d6d0c4', '#f4f0e8'], points: null, muzzle: '#c9a49a' },
  fleabitten: { coat: ['#6a6662', '#aaa69f', '#cfcbc4', '#eeebe6'], mane: ['#5e5a56', '#a8a49e', '#cac6c0'], points: null, muzzle: '#8a7a74', fleck: '#7a4a32' },
  buckskin: { coat: ['#5a3c1a', '#a87c3e', '#d2a862', '#eecc8a'], mane: ['#0e0a09', '#22180f', '#3e2c20'], points: BLACK_POINTS, muzzle: '#5e4428' },
  palomino: { coat: ['#6a4618', '#b8862e', '#dfae50', '#f6d484'], mane: ['#a8946e', '#f0e6cc', '#fffaee'], points: null, muzzle: '#8a6a40' },
  dun: { coat: ['#4e3820', '#9c7a48', '#c2a26a', '#dec28e'], mane: ['#1c140c', '#3a2a1c', '#56402c'], points: ['#1c140c', '#2e2218', '#3e2e20'], muzzle: '#4a3824', dorsal: '#4a3422' },
  grullo: { coat: ['#24201c', '#524d47', '#757068', '#9a948a'], mane: ['#0e0c0b', '#1c1a18', '#2e2b28'], points: ['#0e0c0b', '#1a1816', '#26231f'], muzzle: '#2a2622', dorsal: '#221f1c' },
  blueRoan: { coat: ['#181a20', '#363a44', '#565a66', '#7c8290'], mane: ['#0a0a0e', '#1a1a20', '#2e2e38'], points: ['#0a0a0e', '#16161a', '#24242a'], muzzle: '#22222a', roan: '#aeb4c0' },
  redRoan: { coat: ['#3e1c12', '#7a3e28', '#9c5a40', '#be7c5c'], mane: ['#1c100a', '#2e1c12', '#46291b'], points: ['#1c100a', '#2a1810', '#3a2418'], muzzle: '#3e2418', roan: '#dcc4b8' },
  roanChestnut: { coat: ['#4e2416', '#94523a', '#b86e50', '#d6906e'], mane: ['#4e2416', '#8e4a2c', '#b0663e'], points: null, muzzle: '#7a3a26', roan: '#eedcd2' },
  champagne: { coat: ['#5a4028', '#a07e56', '#c4a276', '#e2c69e'], mane: ['#4a3826', '#8f7150', '#ae906c'], points: ['#4a3826', '#6a5440', '#7e6448'], muzzle: '#b08878' },
  silverDapple: { coat: ['#241c18', '#4a3c34', '#665448', '#887260'], mane: ['#8a8278', '#ddd6cc', '#f6f2ea'], points: ['#1c1612', '#2e2520', '#3e322a'], muzzle: '#3a2e28', dapple: '#9a8676' },
  blond: { coat: ['#5e3412', '#ac6a2c', '#d29048', '#eeb66e'], mane: ['#a08860', '#ead6aa', '#fcf2dc'], points: null, muzzle: '#8e5424' },
};

/** Ramp for any coat id (falls back to a ramp built from the coat definition). */
function rampFor(coatId: string): Ramp {
  const r = RAMPS[coatId];
  if (r) return r;
  const c = getCoat(coatId);
  return {
    coat: [shade(c.body[0], -0.45), c.body[0], c.body[1], c.body[2]],
    mane: [shade(c.mane[0], -0.3), c.mane[0], c.mane[1]],
    points: c.points ? [shade(c.points, -0.4), shade(c.points, -0.15), c.points] : null,
    muzzle: shade(c.body[0], -0.2),
    roan: c.speckle?.kind === 'roan' ? c.speckle.color : undefined,
    dapple: c.speckle?.kind === 'dapple' ? c.speckle.color : undefined,
    fleck: c.speckle?.kind === 'fleck' ? c.speckle.color : undefined,
    dorsal: c.dorsal,
  };
}

const WHITE: [string, string, string, string] = ['#8a8076', '#cac2b4', '#eee8dc', '#fffbf2'];
const HOOF_DARK = ['#241c18', '#40342c', '#62544a'];
/** White socks read brighter than body white: thin legs need the lighter values to stay white at 1×. */
const LEG_WHITE = ['#9a8e80', '#dcd4c6', '#f6f1e8'];
const HOOF_PALE = ['#6a5a46', '#b49c7c', '#d8c4a0'];
const FAR_TINT = '#1c1424';

// ---------------------------------------------------------------------------------------------
// Breeds → body template, plus small per-breed touches (tail carriage, mane weight).
// ---------------------------------------------------------------------------------------------
type Template = 'light' | 'stock' | 'draft';
const TEMPLATE: Record<string, Template> = {
  thoroughbred: 'light', arabian: 'light', walker: 'light', foxtrotter: 'light', andalusian: 'light',
  quarter: 'stock', mustang: 'stock', appaloosa: 'stock', paint: 'stock', morgan: 'stock', criollo: 'stock',
  belgian: 'draft', shire: 'draft',
};
function templateFor(h: HorseData): Template {
  const t = TEMPLATE[h.breedId];
  if (t) return t;
  const body = getBreed(h.breedId).body;
  return body === 'draft' ? 'draft' : body === 'light' || body === 'gaited' ? 'light' : 'stock';
}
/** Breeds that carry the tail high and flagged (Arabian). */
const HIGH_TAIL = new Set(['arabian']);
/** Breeds with a heavy, long mane by nature. */
const HEAVY_MANE = new Set(['andalusian', 'shire', 'belgian', 'criollo', 'mustang']);

// ---------------------------------------------------------------------------------------------
// Grids → canvases
// ---------------------------------------------------------------------------------------------
/** Lay pattern masks over a grid (character substitution only). `map` turns a grid pixel into mask space. */
function applyMasks(g: Grid, masks: Grid[], map: (x: number, y: number) => [number, number] = (x, y) => [x, y]): Grid {
  if (!masks.length) return g;
  const [gx, gy, rows] = g;
  const at = (m: Grid, x: number, y: number): string => {
    const r = m[2][y - m[1]];
    return r ? r[x - m[0]] ?? '.' : '.';
  };
  const out = rows.map((row, y) =>
    Array.from(row, (ch, x) => {
      const [mx, my] = map(gx + x, gy + y);
      let c = ch;
      for (const m of masks) {
        const k = at(m, mx, my);
        if (k === '.') continue;
        if (k === 'W') c = ({ o: 'O', '1': '5', '2': '6', '3': '7' } as Record<string, string>)[c] ?? c;
        else if (k === 's') c = '1235673'.includes(c) ? '4' : c;
        else if (k === 'r') c = c === '2' || c === '3' ? '8' : c;
        else if (k === 'd') c = c === '2' || c === '1' ? '9' : c;
        else if (k === '0') c = '2367'.includes(c) ? '0' : c;
        else if (k === 'D') c = '123'.includes(c) ? 'D' : c;
      }
      return c;
    }).join(''),
  );
  return [gx, gy, out];
}

function draw(c: CanvasRenderingContext2D, img: Cv | null, x: number, y: number): void {
  if (img) c.drawImage(img as CanvasImageSource, x, y);
}

/** Paint a grid at its own position (or offset) through a key. Missing characters fall back to transparent-safe keys. */
function gridCanvas(g: Grid, key: Key): Cv | null {
  if (!g[2].length) return null;
  return pixmap(g[2], key);
}

// ---------------------------------------------------------------------------------------------
// Per-horse look
// ---------------------------------------------------------------------------------------------
interface Look {
  t: Template;
  art: HorseArt;
  key: Key; // body key
  far: Key; // darker key for far legs
  legKeys: Key[]; // FL FR HL HR
  farLegKeys: Key[];
  masks: string[]; // mask names (pattern + coat speckle)
  dorsal: boolean;
  maneLong: boolean;
  tailStyle: string;
  highTail: boolean;
  gear: Partial<Record<'saddle' | 'blanket' | 'bags' | 'bedroll' | 'bridle', Key>>;
}

function darken(key: Key): Key {
  const out: Key = {};
  for (const [k, v] of Object.entries(key)) out[k] = mix(v, FAR_TINT, 0.32);
  return out;
}

function gearKey(color: string, accent?: string): Key {
  return {
    a: shade(color, -0.55), b: shade(color, -0.25), c: color, d: shade(color, 0.22),
    h: accent ?? '#c9b27a', I: accent ?? shade(color, 0.35),
    i: shade(color, -0.5), j: shade(color, -0.22), k: color, l: shade(color, 0.2),
    t: shade(color, -0.5), u: shade(color, -0.2), v: color, w: shade(color, 0.22),
    A: shade(color, -0.6), B: shade(color, -0.35), C: shade(color, -0.15), D: shade(color, 0.1),
  };
}

function lookFor(h: HorseData): Look {
  const t = templateFor(h);
  const art = HORSE_ART[t];
  const ap = h.appearance;
  const R = rampFor(ap.coat);
  const pattern = ap.pattern;
  const leopard = pattern === 'leopard';
  const coat = leopard ? WHITE : R.coat;
  const mane: [string, string, string] = ap.maneTint ? [shade(ap.maneTint, -0.5), ap.maneTint, shade(ap.maneTint, 0.2)] : R.mane;
  // Face markings: overo/tovero go bald, sabino gets at least a blaze.
  let face = ap.face;
  if (pattern === 'overo' || pattern === 'tovero') face = 'bald';
  if (pattern === 'sabino' && (face === 'none' || face === 'star' || face === 'snip' || face === 'strip')) face = 'blaze';
  const zones: Record<string, string[]> = { none: [], star: ['S'], snip: ['N'], strip: ['S', 'T'], blaze: ['S', 'T', 'U', 'N'], bald: ['S', 'T', 'U', 'N', 'B'] };
  const white = new Set(zones[face] ?? []);
  const key: Key = {
    o: coat[0], '1': coat[1], '2': coat[2], '3': coat[3],
    O: WHITE[0], '5': WHITE[1], '6': WHITE[2], '7': WHITE[3],
    '4': leopard ? R.coat[2] : R.coat[2],
    '8': pattern === 'frost' ? WHITE[2] : R.roan ?? mix(coat[2], WHITE[2], 0.55),
    '9': R.dapple ?? mix(coat[2], coat[3], 0.6),
    '0': R.fleck ?? '#7a4a32',
    D: R.dorsal ?? coat[1],
    M: mane[0], m: mane[1], n: mane[2],
    e: '#1a1210', y: '#f8f2e6', x: coat[0],
    z: face === 'bald' || face === 'blaze' ? '#c9a49a' : leopard ? '#b8988c' : R.muzzle,
  };
  for (const z of ['S', 'T', 'U', 'N', 'B']) key[z] = white.has(z) ? WHITE[2] : coat[2];
  const pts = R.points && !leopard ? R.points : ([coat[0], coat[1], coat[2]] as [string, string, string]);
  // Every key carries the whole alphabet (leg, hoof and feather characters too), so any drawing
  // can be painted through any key without a missing character.
  Object.assign(key, {
    q: pts[0], p: pts[1], P: pts[2], Q: pts[0], r: pts[1], R: pts[2], J: pts[0], k: pts[1], K: pts[2],
    g: HOOF_DARK[0], f: HOOF_DARK[1], F: HOOF_DARK[2], V: mane[0], v: mane[1], w: mane[2],
  });
  // Legs: each leg its own key so socks and stockings land on the right leg.
  const legs = [...ap.legs] as string[];
  const legFull = [false, false, false, false];
  if (pattern === 'tobiano') {
    for (let i = 0; i < 4; i++) if (legs[i] === 'none' || legs[i] === 'coronet') legs[i] = i < 2 ? 'sock' : 'stocking';
    legFull[2] = legFull[3] = (ap.patternSeed & 1) === 0;
  } else if (pattern === 'sabino') {
    for (let i = 0; i < 4; i++) legs[i] = 'stocking';
    legFull[2] = legFull[3] = true;
  }
  const breed = getBreed(h.breedId);
  const legKeys = legs.map((m, i) => {
    const lvl = m === 'stocking' ? 3 : m === 'sock' ? 2 : m === 'coronet' ? 1 : 0;
    const k: Key = { ...key };
    if (legFull[i]) Object.assign(k, { o: WHITE[0], '1': WHITE[1], '2': WHITE[2], '3': WHITE[3] });
    const W3 = LEG_WHITE;
    const set = (chars: string, white3: boolean) => {
      const c = white3 ? W3 : pts;
      k[chars[0]!] = c[0]!;
      k[chars[1]!] = c[1]!;
      k[chars[2]!] = c[2]!;
    };
    set('qpP', lvl >= 3 || legFull[i]!);
    set('QrR', lvl >= 2 || legFull[i]!);
    set('JkK', lvl >= 1 || legFull[i]!);
    const hoof = lvl >= 1 || legFull[i] ? HOOF_PALE : HOOF_DARK;
    k.g = hoof[0]!;
    k.f = hoof[1]!;
    k.F = hoof[2]!;
    // Feathering: silky white over white legs, mane-coloured otherwise.
    const fw = lvl >= 2 || legFull[i] ? W3 : [mane[0], mix(pts[2], mane[2], 0.5), mix(mane[2], '#d8cfc0', breed.feathering * 0.3)];
    k.V = fw[0]!;
    k.v = fw[1]!;
    k.w = fw[2]!;
    return k;
  });
  // Pattern masks (two hand-drawn variants for the loud patterns, picked by the horse's seed).
  const v = (ap.patternSeed >> 1) & 1 ? 'B' : 'A';
  const masks: string[] = [];
  if (pattern === 'tobiano') masks.push('tobiano' + v);
  else if (pattern === 'overo') masks.push('overo' + v);
  else if (pattern === 'tovero') masks.push('tobianoA', 'overo' + v);
  else if (pattern === 'sabino') masks.push('sabino');
  else if (pattern === 'blanket') masks.push('blanket' + v);
  else if (pattern === 'leopard') masks.push('leopard');
  else if (pattern === 'snowflake') masks.push('snowflake');
  else if (pattern === 'frost') masks.push('frost');
  if (R.roan) masks.unshift('roan');
  if (R.dapple) masks.unshift('dapple');
  if (R.fleck) masks.unshift('fleck');
  const gear: Look['gear'] = {};
  for (const slot of ['saddle', 'blanket', 'bags', 'bedroll', 'bridle'] as const) {
    const id = h.gear[slot];
    if (!id) continue;
    const g = getItem(id).gear;
    const col = g?.color ?? '#6b4126';
    const accent = slot === 'bridle' ? (id.includes('Silver') ? '#e8ecf0' : '#b89a5a') : slot === 'blanket' ? (id.includes('Heavy') ? '#c8b48a' : '#e8d4a0') : slot === 'saddle' ? (id.includes('McClure') ? '#c9b27a' : '#d8c8a0') : undefined;
    gear[slot] = gearKey(col, accent);
    if (slot === 'saddle') Object.assign(gear[slot]!, { t: '#6a5a44', u: '#a8987a', v: '#cabaa0', w: '#e0d4bc' }); // cotton cinch
  }
  return {
    t,
    art,
    key,
    far: darken(key),
    legKeys,
    farLegKeys: legKeys.map(darken),
    masks,
    dorsal: !!R.dorsal,
    maneLong: ap.maneStyle === 'long' || (HEAVY_MANE.has(h.breedId) && ap.maneStyle !== 'pulled' && ap.maneStyle !== 'roached'),
    tailStyle: ap.tailStyle,
    highTail: HIGH_TAIL.has(h.breedId),
    gear,
  };
}

/** Mane style as a key tweak: roached manes take the coat, braids show as dark knots. */
function maneStyled(key: Key, style: string): Key {
  if (style === 'roached') return { ...key, M: key.o!, m: key['2']!, n: key['3']! };
  if (style === 'braided') return { ...key, n: key.M! };
  return key;
}

// ---------------------------------------------------------------------------------------------
// Side view
// ---------------------------------------------------------------------------------------------
// Leg pose library (see horsePixel.ts): fore 0 stand · 1 planted forward · 2 planted back · 3 folded
// · 4 knee up · 5 reach · 6 trailing · 7 tucked. Hind 0 stand · 1 under · 2 pushing back · 3 folded
// · 4 swinging · 5 reaching under · 6 trailing · 7 kick · 8 tucked.
const OFF_FRONT = new Set([3, 4, 5, 6, 7]);
const OFF_HIND = new Set([3, 4, 5, 6, 7, 8]);

interface SidePose {
  legs: [number, number, number, number]; // FL (near), FR (far), HL (near), HR (far)
  upper: UpperVar;
  tail: TailVar;
  blink?: boolean;
  bob?: number;
}

/** Each leg steps through `seq` starting at its landing frame; bob lifts the body in suspension. */
function cycle(n: number, land: [number, number, number, number], front: number[], hind: number[], upper: (i: number) => UpperVar, tail: (i: number) => TailVar): SidePose[] {
  return Array.from({ length: n }, (_, i) => {
    const legs = land.map((l, li) => (li < 2 ? front : hind)[(i - l + n * 2) % n]!) as SidePose['legs'];
    const air = OFF_FRONT.has(legs[0]) && OFF_FRONT.has(legs[1]) && OFF_HIND.has(legs[2]) && OFF_HIND.has(legs[3]);
    return { legs, upper: upper(i), tail: tail(i), bob: air ? -1 : 0 };
  });
}

const GAITS = {
  // Lateral 4-beat: HL, FL, HR, FR — always two or three feet down.
  walk: cycle(8, [2, 6, 0, 4], [1, 0, 0, 2, 2, 3, 4, 5], [1, 0, 0, 2, 2, 3, 4, 5], () => 'stand', (i) => (i < 6 ? 'hang' : 'swish')),
  // Diagonal pairs with a moment of suspension.
  trot: cycle(8, [0, 4, 4, 0], [1, 0, 2, 6, 3, 4, 4, 5], [1, 0, 2, 6, 3, 4, 4, 5], () => 'stand', (i) => (i % 4 < 2 ? 'hang' : 'swish')),
  // Gaited breeds: smooth 4-beat running walk with overstride, no bounce.
  runwalk: cycle(8, [2, 6, 0, 4], [1, 0, 2, 2, 3, 4, 5, 5], [1, 0, 2, 2, 3, 4, 5, 5], (i) => (i % 4 < 2 ? 'stand' : 'reach2'), () => 'hang'),
  // Right-lead 3-beat: HL | HR+FL | FR, then suspension; head rocks with the stride.
  canter: cycle(8, [2, 3, 0, 2], [1, 0, 2, 6, 3, 4, 5, 5], [1, 0, 2, 6, 3, 4, 5, 5], (i) => (i < 4 ? 'reach2' : 'reach'), () => 'flow'),
  // Transverse 4-beat with a gathered flight.
  gallop: cycle(8, [2, 3, 0, 1], [1, 2, 6, 3, 3, 4, 5, 5], [1, 2, 6, 6, 3, 4, 5, 5], (i) => (i % 4 < 2 ? 'reach' : 'reach2'), () => 'flow'),
};

class SideBuilder {
  private cache = new Map<string, Cv | null>();
  private L: Look;
  private A: SideArt;
  constructor(L: Look, A: SideArt) {
    this.L = L;
    this.A = A;
  }
  private memo(id: string, make: () => Cv | null): Cv | null {
    let c = this.cache.get(id);
    if (c === undefined) {
      c = make();
      this.cache.set(id, c);
    }
    return c;
  }
  private masks(): Grid[] {
    const m = this.L.masks.map((n) => this.A.masks[n]!).filter(Boolean);
    if (this.L.dorsal) m.push(this.A.dorsal);
    return m;
  }
  upper(v: UpperVar, blink: boolean): Cv | null {
    return this.memo(`u${v}${blink}`, () => {
      const key = maneStyled(this.L.key, '');
      const k = blink ? { ...key, e: key['1']!, y: key['1']! } : key;
      return gridCanvas(applyMasks(this.A.upper[v], this.masks()), k);
    });
  }
  leg(front: boolean, pose: number, li: number, far: boolean): Cv | null {
    return this.memo(`l${front}${pose}${li}${far}`, () => gridCanvas((front ? this.A.front : this.A.hind)[pose]!, (far ? this.L.farLegKeys : this.L.legKeys)[li]!));
  }
  tail(v: TailVar): Cv | null {
    return this.memo(`t${v}`, () => gridCanvas(this.A.tail[v], this.L.key));
  }
  part(id: string, g: Grid, key: Key | undefined): Cv | null {
    if (!key) return null;
    return this.memo(id, () => gridCanvas(g, key));
  }
  tailFor(v: TailVar): TailVar {
    if (this.L.tailStyle === 'knotted' && (v === 'hang' || v === 'swish')) return 'short';
    if (this.L.highTail && v === 'hang') return 'high';
    return v;
  }
  frame(p: SidePose): HorseFrame {
    const A = this.A;
    const L = this.L;
    const cv = makeCanvas(HW, HH);
    const c = ctx2d(cv) as CanvasRenderingContext2D;
    const b = p.bob ?? 0;
    const at = (g: Grid, dx = 0, dy = 0): [number, number] => [g[0] + dx, g[1] + dy + b];
    const leg = (front: boolean, li: number, far: boolean) => {
      const pose = p.legs[li]!;
      const g = (front ? A.front : A.hind)[pose]!;
      const [ax, ay] = front ? A.anchors.front : A.anchors.hind;
      const [fx, fy] = far ? (front ? A.anchors.farFront : A.anchors.farHind) : [0, 0];
      draw(c, this.leg(front, pose, li, far), ax + fx + g[0], ay + fy + g[1] + b);
    };
    leg(false, 3, true);
    leg(true, 1, true);
    const tv = this.tailFor(p.tail);
    draw(c, this.tail(tv), ...at(A.tail[tv]));
    draw(c, this.upper(p.upper, !!p.blink), ...at(A.upper[p.upper]));
    if (L.maneLong) draw(c, this.part(`ml${p.upper}`, A.maneLong[p.upper], L.key), ...at(A.maneLong[p.upper]));
    leg(false, 2, false);
    leg(true, 0, false);
    const G = L.gear;
    draw(c, this.part('gb', A.gear.blanket, G.blanket), ...at(A.gear.blanket));
    draw(c, this.part('gs', A.gear.saddle, G.saddle), ...at(A.gear.saddle));
    draw(c, this.part('gg', A.gear.bags, G.bags), ...at(A.gear.bags));
    draw(c, this.part('gr', A.gear.bedroll, G.bedroll), ...at(A.gear.bedroll));
    draw(c, this.part(`br${p.upper}`, A.bridle[p.upper], G.bridle), ...at(A.bridle[p.upper]));
    return { img: cv, sx: A.anchors.seat[0], sy: A.anchors.seat[1] + b };
  }
  rear(i: number): HorseFrame {
    const A = this.A;
    const R = A.rear[i]!;
    const cv = makeCanvas(HW, HH);
    const c = ctx2d(cv) as CanvasRenderingContext2D;
    const rad = (R.angle * Math.PI) / 180;
    const [px, py] = R.pivot;
    // Masks live in standing-body space: rotate each pixel back to find its mask cell.
    const back = (x: number, y: number): [number, number] => {
      const dx = x + 0.5 - px;
      const dy = y + 0.5 - R.drop - py;
      return [Math.floor(px + dx * Math.cos(rad) - dy * Math.sin(rad)), Math.floor(py + dx * Math.sin(rad) + dy * Math.cos(rad))];
    };
    draw(c, this.memo(`r${i}`, () => gridCanvas(applyMasks(R.img, this.masksBody(), back), this.L.legKeys[0]!)), R.img[0], R.img[1]);
    const G = this.L.gear;
    for (const s of ['blanket', 'saddle', 'bags', 'bedroll', 'bridle'] as const) draw(c, this.part(`r${i}${s}`, R.gear[s], G[s]), R.gear[s][0], R.gear[s][1]);
    const [sx, sy] = A.anchors.seat;
    const dx = sx - px;
    const dy = sy - py;
    return { img: cv, sx: Math.round(px + dx * Math.cos(-rad) - dy * Math.sin(-rad)), sy: Math.round(py + dx * Math.sin(-rad) + dy * Math.cos(-rad)) + R.drop };
  }
  /** Masks without the leg-reaching ones (rear and lie draw legs inside the same grid). */
  private masksBody(): Grid[] {
    return this.masks();
  }
  lie(): HorseFrame {
    const A = this.A;
    const d = A.lieDy;
    const cv = makeCanvas(HW, HH);
    const c = ctx2d(cv) as CanvasRenderingContext2D;
    const key = { ...this.L.legKeys[0]!, e: this.L.key['1']!, y: this.L.key['1']! };
    draw(c, this.memo('lie', () => gridCanvas(applyMasks(A.lie, this.masks(), (x, y) => [x, y - d]), key)), A.lie[0], A.lie[1]);
    const G = this.L.gear;
    for (const s of ['blanket', 'saddle', 'bags', 'bedroll'] as const) draw(c, this.part(`lie${s}`, A.gear[s], G[s]), A.gear[s][0], A.gear[s][1] + d);
    return { img: cv, sx: A.anchors.seat[0], sy: A.anchors.seat[1] + d };
  }
}

// ---------------------------------------------------------------------------------------------
// Front / back views
// ---------------------------------------------------------------------------------------------
type FBPose = { lifts: [number, number, number, number]; bob?: number; blink?: boolean; swish?: boolean };
const FB_ANIMS: Record<'idle' | 'walk' | 'run', FBPose[]> = {
  idle: [{ lifts: [0, 0, 0, 0] }, { lifts: [0, 0, 0, 0], blink: true, swish: true }],
  walk: [{ lifts: [1, 0, 0, 1] }, { lifts: [0, 0, 0, 0], swish: true }, { lifts: [0, 1, 1, 0], swish: true }, { lifts: [0, 0, 0, 0] }],
  run: [{ lifts: [2, 0, 0, 2] }, { lifts: [1, 1, 1, 1], bob: -1 }, { lifts: [0, 2, 2, 0], swish: true }, { lifts: [1, 1, 1, 1], bob: -1, swish: true }],
};

function fbFrames(L: Look, view: 'front' | 'back', anim: 'idle' | 'walk' | 'run'): HorseFrame[] {
  const A: FBArt = L.art[view];
  const masks = L.masks.map((n) => A.masks[n]!).filter(Boolean);
  const cache = new Map<string, Cv | null>();
  const memo = (id: string, make: () => Cv | null) => {
    let c = cache.get(id);
    if (c === undefined) cache.set(id, (c = make()));
    return c;
  };
  return FB_ANIMS[anim].map((p) => {
    const cv = makeCanvas(HW, HH);
    const c = ctx2d(cv) as CanvasRenderingContext2D;
    const b = p.bob ?? 0;
    const cx = HW / 2;
    const { nearDx, farDx, nearY, farY } = A.anchors;
    // Leg order on screen, left to right. Front view: the horse's right side is on screen left.
    const nearIdx = view === 'front' ? [1, 0] : [2, 3];
    const farIdx = view === 'front' ? [3, 2] : [0, 1];
    const legAt = (li: number, side: number, far: boolean) => {
      const g = A.legs[(side < 0 ? 0 : 3) + p.lifts[li]!]!;
      const keys = far ? L.farLegKeys : L.legKeys;
      const img = memo(`l${li}${p.lifts[li]}${far}${side}`, () => gridCanvas(g, keys[li]!));
      draw(c, img, cx + side * (far ? farDx : nearDx) + g[0], (far ? farY : nearY) + g[1] + (far ? 0 : 0) + b);
    };
    legAt(farIdx[0]!, -1, true);
    legAt(farIdx[1]!, 1, true);
    const blink = !!p.blink;
    const key = blink ? { ...L.key, e: L.key['1']!, y: L.key['1']! } : L.key;
    const body = view === 'back' && p.swish && A.bodySwish ? A.bodySwish : A.body;
    draw(c, memo(`b${body === A.body}${blink}`, () => gridCanvas(applyMasks(body, masks), key)), body[0], body[1] + b);
    legAt(nearIdx[0]!, -1, false);
    legAt(nearIdx[1]!, 1, false);
    const G = L.gear;
    for (const s of ['blanket', 'saddle'] as const) {
      const g = A.gear[s];
      if (g && G[s]) draw(c, memo(s, () => gridCanvas(g, G[s]!)), g[0], g[1] + b);
    }
    if (A.head) draw(c, memo(`h${blink}`, () => gridCanvas(applyMasks(A.head!, masks), key)), A.head[0], A.head[1] + b);
    for (const s of ['bags', 'bedroll', 'bridle'] as const) {
      const g = A.gear[s];
      if (g && G[s]) draw(c, memo(s, () => gridCanvas(g, G[s]!)), g[0], g[1] + b);
    }
    return { img: cv, sx: A.seat[0], sy: A.seat[1] + b };
  });
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------
const cache = new Map<string, HorseSpriteSet>();

/** Cache key covers everything visible on the sprite. */
export function horseSpriteKey(h: HorseData): string {
  return `${h.breedId}|${JSON.stringify(h.appearance)}|${JSON.stringify(h.gear)}|${Math.round(getBreedHands(h) * 4)}`;
}

function getBreedHands(h: HorseData): number {
  const b = getBreed(h.breedId);
  const r = new Rng(h.appearance.patternSeed);
  const adult = b.hands[0] + (b.hands[1] - b.hands[0]) * r.next();
  // Foals and yearlings are drawn smaller until they're grown at three.
  return h.age < 3 ? adult * (0.62 + 0.38 * Math.max(0, h.age) / 3) : adult;
}

/** Foals: the grown drawing shrunk toward the ground line (nearest-neighbour, no smoothing). */
function shrink(f: HorseFrame, s: number): HorseFrame {
  if (s >= 0.97) return f;
  const cv = makeCanvas(HW, HH);
  const c = ctx2d(cv) as CanvasRenderingContext2D;
  c.imageSmoothingEnabled = false;
  const w = Math.round(HW * s);
  const h = Math.round(HH * s);
  const ox = Math.round((HW - w) / 2);
  const oy = Math.round(GROUND_Y - GROUND_Y * s);
  c.drawImage(f.img as CanvasImageSource, ox, oy, w, h);
  return { img: cv, sx: Math.round(ox + f.sx * s), sy: Math.round(oy + f.sy * s) };
}

/** Build (or fetch from cache) the full sprite set for a horse. */
export function horseSprites(h: HorseData): HorseSpriteSet {
  const key = horseSpriteKey(h);
  const hit = cache.get(key);
  if (hit) return hit;
  const L = lookFor(h);
  L.key = maneStyled(L.key, h.appearance.maneStyle);
  L.legKeys = L.legKeys.map((k) => maneStyled(k, h.appearance.maneStyle));
  const S = new SideBuilder(L, L.art.side);
  const still = (o: Partial<SidePose>): SidePose => ({ legs: [0, 0, 0, 0], upper: 'stand', tail: 'hang', ...o });
  const gaited = getBreed(h.breedId).body === 'gaited';
  const side: Record<HorseAnim, HorseFrame[]> = {
    idle: [still({}), still({}), still({ tail: 'swish' }), still({ blink: true })].map((p) => S.frame(p)),
    walk: GAITS.walk.map((p) => S.frame(p)),
    trot: (gaited ? GAITS.runwalk : GAITS.trot).map((p) => S.frame(p)),
    canter: GAITS.canter.map((p) => S.frame(p)),
    gallop: GAITS.gallop.map((p) => S.frame(p)),
    graze: [still({ upper: 'graze' }), still({ upper: 'graze', blink: true }), still({ upper: 'graze', tail: 'swish' }), still({ upper: 'graze' })].map((p) => S.frame(p)),
    rear: [0, 1, 1, 0].map((i) => S.rear(i)),
    jump: [
      { legs: [7, 7, 2, 2], upper: 'reach2', tail: 'hang' },
      { legs: [7, 7, 8, 8], upper: 'reach', tail: 'flow' },
      { legs: [7, 7, 6, 6], upper: 'reach', tail: 'flow' },
      { legs: [5, 5, 6, 6], upper: 'reach', tail: 'flow' },
      { legs: [1, 5, 6, 3], upper: 'reach2', tail: 'hang' },
    ].map((p) => S.frame(p as SidePose)),
    lie: [S.lie(), S.lie()],
    buck: [
      { legs: [2, 2, 6, 6], upper: 'low', tail: 'swish' },
      { legs: [2, 2, 7, 7], upper: 'low', tail: 'kick' },
      { legs: [2, 2, 7, 6], upper: 'low', tail: 'kick' },
      { legs: [2, 2, 2, 2], upper: 'low', tail: 'hang' },
    ].map((p) => S.frame(p as SidePose)),
  };
  const fb = (v: 'front' | 'back') => ({ idle: fbFrames(L, v, 'idle'), walk: fbFrames(L, v, 'walk'), run: fbFrames(L, v, 'run') });
  let set: HorseSpriteSet = { side, front: fb('front'), back: fb('back') };
  const scale = getBreedHands(h) / getBreedHandsAdult(h);
  if (scale < 0.97) {
    const m = <K extends string>(r: Record<K, HorseFrame[]>) => Object.fromEntries(Object.entries<HorseFrame[]>(r).map(([k, v]) => [k, v.map((f) => shrink(f, scale))])) as Record<K, HorseFrame[]>;
    set = { side: m(set.side), front: m(set.front), back: m(set.back) };
  }
  void PAL;
  if (cache.size > 60) cache.delete(cache.keys().next().value!);
  cache.set(key, set);
  return set;
}

function getBreedHandsAdult(h: HorseData): number {
  return getBreedHands({ ...h, age: Math.max(3, h.age) });
}
