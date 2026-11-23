/**
 * Hand-drawn building modules. Every piece of a building — shingle courses,
 * siding boards, windows, doors, cornices, posts, props — is authored here as a
 * small text grid (one character per pixel, see pixmap.ts) and assembled per
 * building by buildingSprite.ts. Variety comes from recolouring the same drawing
 * with a different ramp and from swapping modules, never from noise.
 *
 * Grid conventions used throughout this file:
 *   '0'..'4'  material ramp, dark → light (the building's paint, wood, brick…)
 *   'F' 'f' 'g'  trim ramp: light, mid, dark (window/door frames, cornices)
 *   'G' 'H' 'h'  glass: dark, mid, glint
 *   'o'       outline: the material's darkest tone, never pure black
 */
import { PAL, pixmap } from './pixmap.ts';
import { ctx2d, type Ctx } from './pixel.ts';

export type Cv = HTMLCanvasElement | OffscreenCanvas;
/** Five values, dark → light, as palette names or '#rrggbb'. */
export type Ramp = readonly [string, string, string, string, string];
/** Trim: dark, mid, light. */
export type Trim = readonly [string, string, string];

// ---------------------------------------------------------------------------
// Ramps. Painted siding colours share the palette's hue-shifted ramps.
// ---------------------------------------------------------------------------
export const RAMP = {
  wood: ['wood1', 'wood2', 'wood3', 'wood4', 'wood5'],
  darkwood: ['wood0', 'wood1', 'wood2', 'wood3', 'wood4'],
  gwood: ['gwood0', 'gwood1', 'gwood2', 'gwood3', 'gwood4'],
  cream: ['cream0', 'cream1', 'cream2', 'cream3', 'cream4'],
  white: ['white0', 'white1', 'white2', 'white3', 'white3'],
  blue: ['blue0', 'blue1', 'blue2', 'blue3', 'blue4'],
  teal: ['teal0', 'teal1', 'teal2', 'teal3', 'teal4'],
  barn: ['barn0', 'barn1', 'barn2', 'barn3', 'barn4'],
  ochre: ['dry0', 'dry1', 'dry2', 'dry3', 'dry4'],
  /** Sage green paint (not in PAL: a muted grey-green between teal and dry). */
  sage: ['#2a3628', '#43553c', '#61765a', '#86997a', '#b0bea0'],
  brick: ['red0', 'red1', 'red2', 'red3', 'red4'],
  adobe: ['sand0', 'sand1', 'sand2', 'sand3', 'sand4'],
  stone: ['stone0', 'stone1', 'stone2', 'stone3', 'stone4'],
  brass: ['brass0', 'brass1', 'brass2', 'brass3', 'brass4'],
  tin: ['tin0', 'tin1', 'tin2', 'tin3', 'tin4'],
  rust: ['rust0', 'rust1', 'rust2', 'rust3', 'dirt4'],
  log: ['wood0', 'wood1', 'wood2', 'wood3', 'wood4'],
  /** Red-brown cedar shakes. */
  shakeRed: ['barn0', 'barn1', '#782a22', 'barn2', 'barn3'],
  shakeBrown: ['wood0', 'wood1', 'wood2', 'wood3', 'wood4'],
  shakeGrey: ['gwood0', 'gwood1', 'gwood2', 'gwood3', 'gwood4'],
} as const satisfies Record<string, Ramp>;
export type RampName = keyof typeof RAMP;

export const TRIM = {
  cream: ['cream1', 'cream3', 'cream4'],
  white: ['white1', 'white2', 'white3'],
  brown: ['wood0', 'wood1', 'wood2'],
  green: ['teal0', 'teal1', 'teal2'],
  red: ['barn0', 'barn1', 'barn2'],
  blue: ['blue0', 'blue1', 'blue2'],
  stone: ['stone2', 'stone3', 'stone4'],
} as const satisfies Record<string, Trim>;
export type TrimName = keyof typeof TRIM;

export function hex(v: string): string {
  return v.startsWith('#') ? v : (PAL as Record<string, string>)[v];
}

// ---------------------------------------------------------------------------
// Module cache and assembly helpers.
// ---------------------------------------------------------------------------
const cache = new Map<string, Cv>();

/** Build (once) a pixmap module with a key. */
export function piece(name: string, rows: readonly string[], key: Readonly<Record<string, string>>): Cv {
  const id = name + '|' + Object.entries(key).map(([k, v]) => k + v).join(',');
  let cv = cache.get(id);
  if (!cv) {
    cv = pixmap(rows, key);
    cache.set(id, cv);
  }
  return cv;
}

/** Key mapping '0'..'4' to a ramp, shifted by `shift` steps (negative = darker). */
export function rampKey(r: Ramp, shift = 0): Record<string, string> {
  const k: Record<string, string> = {};
  for (let i = 0; i < 5; i++) k[String(i)] = r[Math.max(0, Math.min(4, i + shift))];
  return k;
}
export function trimKey(t: Trim): Record<string, string> {
  return { g: t[0], f: t[1], F: t[2] };
}

/** Repeat a module over a rectangle (clipped), with the pattern anchored at (ax, ay). */
export function tileRect(c: Ctx, src: Cv, x: number, y: number, w: number, h: number, ax = x, ay = y): void {
  if (w <= 0 || h <= 0) return;
  const sw = src.width;
  const sh = src.height;
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  const x0 = ax + Math.floor((x - ax) / sw) * sw;
  const y0 = ay + Math.floor((y - ay) / sh) * sh;
  for (let py = y0; py < y + h; py += sh) for (let px = x0; px < x + w; px += sw) c.drawImage(src as CanvasImageSource, px, py);
  c.restore();
}

/** Repeat a module along a single horizontal band starting at x (clipped to w). */
export function band(c: Ctx, src: Cv, x: number, y: number, w: number): void {
  tileRect(c, src, x, y, w, src.height, x, y);
}

export function put(c: Ctx, src: Cv, x: number, y: number): void {
  c.drawImage(src as CanvasImageSource, Math.round(x), Math.round(y));
}

export function fill(c: Ctx, x: number, y: number, w: number, h: number, col: string): void {
  if (w <= 0 || h <= 0) return;
  c.fillStyle = hex(col) ?? col;
  c.fillRect(x, y, w, h);
}

/** Mirror rows of a grid (authoring helper for symmetric pieces). */
function mirrorRows(rows: readonly string[]): string[] {
  return rows.map((r) => [...r].reverse().join(''));
}
/** Transpose a grid (a shingle course drawn once, laid either way). */
function transpose(rows: readonly string[]): string[] {
  const w = Math.max(...rows.map((r) => r.length));
  const out: string[] = [];
  for (let x = 0; x < w; x++) out.push(rows.map((r) => r[x] ?? '.').join(''));
  return out;
}

// ---------------------------------------------------------------------------
// ROOFS
// ---------------------------------------------------------------------------
/**
 * Wooden shakes: two staggered courses, 4 px tall, shingles 4–5 px wide with a
 * lit top-left lip, a shaded lower-right and a dark course line under each row.
 */
const SHAKES = [
  '0333320333203332',
  '1222221222212222',
  '1222111222111221',
  '0000000000000000',
  '3320333203332033',
  '2221222212222122',
  '1111222111222111',
  '0000000000000000',
];
/** Same courses with a run of newer, paler shakes nailed in (a repair). */
const SHAKES_PATCH = [
  '0333320444304443',
  '1222221333313333',
  '1222111333111331',
  '0000000000000000',
  '3320333204443033',
  '2221222213333122',
  '1111222111333111',
  '0000000000000000',
];
/** Front-slope course with a cluster of moss on two shakes. */
const SHAKES_MOSS = [
  '0333320333203332',
  '1222221222212m22',
  '12m2111222111mm1',
  '0mmM0000000000M0',
  '3320333203332033',
  '2221222212222122',
  '1111222111222111',
  '0000000000000000',
];
const MOSS = { m: 'leaf2', M: 'leaf1' };

/** Shingle courses for a roof slope. `slope` 0 = lit back slope, 1 = front slope (one step darker). */
export function shakes(r: Ramp, slope: 0 | 1, kind: 'plain' | 'patch' | 'moss' = 'plain'): Cv {
  const key: Record<string, string> = { ...rampKey(r, slope ? -1 : 0), ...MOSS };
  const rows = kind === 'patch' ? SHAKES_PATCH : kind === 'moss' ? SHAKES_MOSS : SHAKES;
  return piece('shakes' + kind + slope, rows, key);
}

/** Barn shakes laid with the ridge running front-to-back (courses vertical). */
export function shakesVertical(r: Ramp, side: 0 | 1): Cv {
  const rows = side ? mirrorRows(transpose(SHAKES)) : transpose(SHAKES);
  return piece('vshakes' + side, rows, rampKey(r, side ? -1 : 0));
}

/** Ridge cap boards: dark seam, sunlit top board, its face, cast shadow. */
export const RIDGE = ['0000000000000000', '4444444444444444', '3333233333332333', '1111111111111111', '0000000000000000'];
export function ridge(r: Ramp): Cv {
  return piece('ridge', RIDGE, rampKey(r));
}

/** Corrugated tin sheet: ribs every 4 px (lit crest, shaded trough), lap and nail heads at the top. */
const TIN = [
  '3333333333333333',
  '1223122312231223',
  '1223122312231223',
  '1223122312231223',
  '1223122312231223',
  '1223122312231223',
  '1223122312231223',
  '1223122312231223',
  '1223122312231223',
  '1223122312231223',
  '1223122312231223',
  '1223122312231223',
  '1223122312231223',
  '1223122312231223',
  '1223122312231223',
  '1223122312231223',
  '1223122312231223',
  '1112111211121112',
  '0000000000000000',
];
/** Same sheet, rust weeping straight down two troughs from the lap nails. */
const TIN_RUST = [
  '3333RR33333333R3',
  '1223r2231223r223',
  '1223r2231223r223',
  '1223r2231223r223',
  '1223r22312231223',
  '1223r22312231223',
  '1223r22312231223',
  '1223122312231223',
  '1223122312231223',
  '1223122312231223',
  '1223122312231223',
  '1223122312231223',
  '1223122312231223',
  '1223122312231223',
  '1223122312231223',
  '1223122312231223',
  '1223122312231223',
  '1112111211121112',
  '0000000000000000',
];
export function tinSheet(slope: 0 | 1, rusty: boolean): Cv {
  const key = { ...rampKey(RAMP.tin, slope ? -1 : 0), r: slope ? 'rust0' : 'rust1', R: 'rust2' };
  return piece('tin' + (rusty ? 'r' : '') + slope, rusty ? TIN_RUST : TIN, key);
}
/** A whole sheet gone to rust (old patch). */
export function tinRusted(slope: 0 | 1): Cv {
  return piece('tinR' + slope, TIN, rampKey(RAMP.rust, slope ? -3 : -2));
}
/** Rolled ridge cap for tin roofs. */
export const TIN_RIDGE = ['0000000000000000', '3333333333333333', '2223222322232223', '1111111111111111', '0000000000000000'];

/** Flat adobe roof (azotea): smooth mud plaster with a few hand-placed cracks and patches. */
const ADOBE_ROOF = [
  '2222222222222222',
  '2222222222222222',
  '2222232222222222',
  '2222333222222222',
  '2222222222222212',
  '2222222222222122',
  '2222222222221222',
  '2222222222222222',
  '2222222222222222',
  '2232222222222222',
  '2222222222222222',
  '2222222223322222',
  '2222222222222222',
  '2122222222222222',
  '2212222222222222',
  '2222222222222222',
];
export function adobeRoof(r: Ramp): Cv {
  return piece('adoberoof', ADOBE_ROOF, rampKey(r));
}

/** Hole in a ruined roof: dark loft with two exposed rafters, ragged shingle edge. */
export const ROOF_HOLE = [
  '..00000000..',
  '.0aa1aaaa10.',
  '0aaa1aaaa1a0',
  '0aaa1aaaa1a0',
  '0aaa1aaaa1a0',
  '.0aa1aaa.1..',
  '..001000.0..',
];
export function roofHole(r: Ramp): Cv {
  return piece('roofhole', ROOF_HOLE, { ...rampKey(r), a: 'ink', '1': 'wood1' });
}

// ---------------------------------------------------------------------------
// WALLS
// ---------------------------------------------------------------------------
/** Lapped clapboard: shadow under each lip, sunlit board face, butt joints and a knot or two. */
const CLAP = [
  '1111111111111111111111111111111',
  '3333333333313333333333333333333',
  '2222222222212222222222232222222',
  '1111111111111111111111111111111',
  '3333331333333333333333333133333',
  '2222221222222222222222222122222',
  '1111111111111111111111111111111',
  '3333333333333333331333333333333',
  '2222232222222222221222222222222',
  '1111111111111111111111111111111',
  '3313333333333333333333331333333',
  '2212222222222222222222221222222',
];
export function clapboard(r: Ramp): Cv {
  return piece('clap', CLAP, rampKey(r));
}

/** Board-and-batten: 2 px battens (lit left edge) over wide boards, one knot. */
const BATTEN = [
  '3122223122223122',
  '3122223122223122',
  '3122223122223122',
  '3122223122223122',
  '3122223122213122',
  '3122223122223122',
  '3122223122223122',
  '3122223122223122',
  '3122223122223122',
  '3122223122223122',
  '3121223122223122',
  '3122223122223122',
  '3122223122223122',
  '3122223122223122',
  '3122223122223122',
  '3122223122223122',
  '3122223122223122',
  '3122223122223122',
  '3111113111113111',
  '3122223122223122',
];
export function battens(r: Ramp): Cv {
  return piece('batten', BATTEN, rampKey(r));
}

/** Running-bond brick: mortar lines, lit top edge on every brick, a few odd bricks. */
const BRICK = [
  'mmmmmmmmmmmmmmmm',
  '3333m3333333m333',
  '2221m2222221m222',
  'mmmmmmmmmmmmmmmm',
  '33333333m4443333',
  '22222221m3332222',
  'mmmmmmmmmmmmmmmm',
  '3333m3333333m333',
  '2221m2221111m222',
  'mmmmmmmmmmmmmmmm',
  '33333333m3333333',
  '22222221m2222221',
];
export function brick(r: Ramp, mortar = 'stone2'): Cv {
  return piece('brick', BRICK, { ...rampKey(r), m: mortar });
}

/** Hewn logs with light chinking between them and a split (check) in each log. */
const LOGS = [
  'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
  '33333333333333333333333333333333',
  '33333322222333333333333333333333',
  '22222222222222222222222212222222',
  '11111111111111111111111111111111',
  'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
  '33333333333333333333333333333333',
  '33333333333333333333332222233333',
  '22222222122222222222222222222222',
  '11111111111111111111111111111111',
];
export function logs(r: Ramp): Cv {
  return piece('logs', LOGS, { ...rampKey(r), k: 'cream1' });
}
/** Notched log end at a cabin corner (5 px course). */
export const LOG_END = ['kkkk', '.33.', '3442', '3421', '.11.'];
export function logEnd(r: Ramp): Cv {
  return piece('logend', LOG_END, { ...rampKey(r), k: 'cream1' });
}

/** Adobe wall: smooth plaster, a fallen patch showing two bricks, a hairline crack. */
const ADOBE_WALL = [
  '22222222222222222222222222222222',
  '22222222222222222222222222222222',
  '22222222222222222222222122222222',
  '22223322222222222222221222222222',
  '22233332222222222222212222222222',
  '22222222222222222222222222222222',
  '22222222222222222222222222222222',
  '22222222222222222111211122222222',
  '22222222222222221222122212222222',
  '22222222222222221111111112222222',
  '22222222222222222222222222222222',
  '22222222222222222222222222222222',
  '22222222222222222222222222222222',
  '23222222222222222222222222222222',
  '22222222222222222222222222222232',
  '22222222222222222222222222222222',
];
export function adobeWall(r: Ramp): Cv {
  return piece('adobewall', ADOBE_WALL, rampKey(r));
}

/** Mud splashed up the foot of a wall: a soft 3-row band of dirt, broken into clusters. */
const GRIME = [
  '..d....dd.......d......dd.....d.',
  '.ddd..dddd.d...ddd....dddd...ddd',
  'DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
];
export function grime(): Cv {
  return piece('grime', GRIME, { d: 'dirt1', D: 'dirt1' });
}

/** Missing board on a ruined wall: dark gap with splintered ends. */
export const BOARD_GAP = ['.0000000.', '0aaaaaaa0', '.0aaaa00.'];

// ---------------------------------------------------------------------------
// WINDOWS (glass rect is reported for night lighting; frame drawn around it)
// ---------------------------------------------------------------------------
export interface WinDef {
  rows: readonly string[];
  /** Glass rect inside the grid. */
  gx: number;
  gy: number;
  gw: number;
  gh: number;
}

/** House sash: 2×2 panes, light frame, sill. Glass 7×9. */
export const WIN_HOUSE: WinDef = {
  rows: [
    '.FFFFFFFFF.',
    '.FGGGfGGGg.',
    '.FGHHfGHhg.',
    '.FGHHfGhHg.',
    '.FGHHfGHHg.',
    '.Ffffffffg.',
    '.FGGGfGGGg.',
    '.FGHhfGHHg.',
    '.FGHHfGHHg.',
    '.FGHHfGHHg.',
    '.ggggggggg.',
    'FFFFFFFFFFF',
    'SSSSSSSSSSS',
  ],
  gx: 2, gy: 1, gw: 7, gh: 9,
};
export const WIN_HOUSE_CURTAIN: WinDef = {
  ...WIN_HOUSE,
  rows: [
    '.FFFFFFFFF.',
    '.FCCCfCCCg.',
    '.FcCHfGCcg.',
    '.FcHHfGhcg.',
    '.FCcHfHcCg.',
    '.Ffffffffg.',
    '.FcGGfGGcg.',
    '.FcHhfGHcg.',
    '.FcHHfGHcg.',
    '.FccHfHccg.',
    '.ggggggggg.',
    'FFFFFFFFFFF',
    'SSSSSSSSSSS',
  ],
};
/** Upper-storey sash. Glass 5×8. */
export const WIN_UPPER: WinDef = {
  rows: [
    '.FFFFFFF.',
    '.FGGfGGg.',
    '.FGHfGhg.',
    '.FGHfhHg.',
    '.Fffffffg',
    '.FGGfGGg.',
    '.FGHfGHg.',
    '.FGHfGHg.',
    '.FGHfGHg.',
    '.ggggggg.',
    'FFFFFFFFF',
    'SSSSSSSSS',
  ].map((r) => r.slice(0, 9)),
  gx: 2, gy: 1, gw: 5, gh: 8,
};
WIN_UPPER.rows = WIN_UPPER.rows.map((r, i) => (i === 4 ? '.Ffffffg.' : r));
export const WIN_UPPER_CURTAIN: WinDef = {
  ...WIN_UPPER,
  rows: [
    '.FFFFFFF.',
    '.FCCfCCg.',
    '.FcHfGcg.',
    '.FcHfhcg.',
    '.Ffffffg.',
    '.FcGfGcg.',
    '.FcHfGcg.',
    '.FcHfGcg.',
    '.FccfHcg.',
    '.ggggggg.',
    'FFFFFFFFF',
    'SSSSSSSSS',
  ],
};
/** Storefront display window: transom lights over two big panes. Glass 11×10. */
export const WIN_SHOP: WinDef = {
  rows: [
    'FFFFFFFFFFFFF',
    'FGGGGGfGGGGGg',
    'FHHHHHfHHHHhg',
    'Ffffffffffffg',
    'FGGGGGfGGGGGg',
    'FGHHHHfGHHhHg',
    'FGHHHHfGHhHHg',
    'FGHHHHfGhHHHg',
    'FGHHHHfGHHHHg',
    'FGHHHHfGHHHHg',
    'FGHHHHfGHHHHg',
    'ggggggggggggg',
  ],
  gx: 1, gy: 1, gw: 11, gh: 10,
};
/** Display window with goods on the sill: bottles, tins and a bolt of cloth. */
export const WIN_SHOP_GOODS: WinDef = {
  ...WIN_SHOP,
  rows: [
    'FFFFFFFFFFFFF',
    'FGGGGGfGGGGGg',
    'FHHHHHfHHHHhg',
    'Ffffffffffffg',
    'FGGGGGfGGGGGg',
    'FGHHHHfGHHhHg',
    'FGHHHHfGHhHHg',
    'FGHyHHfGhHHHg',
    'FGHyHHfGHkkHg',
    'FGtyHtfGrkkHg',
    'FGtyHtfGrkkrg',
    'ggggggggggggg',
  ],
};
/** Saloon window: café curtains on a brass rod across the lower half. */
export const WIN_SHOP_CAFE: WinDef = {
  ...WIN_SHOP,
  rows: [
    'FFFFFFFFFFFFF',
    'FGGGGGfGGGGGg',
    'FHHHHHfHHHHhg',
    'Ffffffffffffg',
    'FGGGGGfGGGGGg',
    'FGHHHHfGHHhHg',
    'FyyyyyfyyyyyF',
    'FCcCcCfCcCcCg',
    'FCcCcCfCcCcCg',
    'FCcCcCfCcCcCg',
    'FCcCcCfCcCcCg',
    'ggggggggggggg',
  ],
};
/** Kick panel under a display window. */
export const KICK = ['FFFFFFFFFFFFF', 'F33333333332g', 'F32222222221g', 'F32222222221g', 'F31111111111g', 'ggggggggggggg'];
/** Barn/stable window: four small panes. Glass 5×5. */
export const WIN_BARN: WinDef = {
  rows: ['FFFFFFF', 'FGGfGGg', 'FGHfGhg', 'Fffffffg'.slice(0, 7), 'FGGfGGg', 'FGHfGHg', 'ggggggg'],
  gx: 1, gy: 1, gw: 5, gh: 5,
};
/** Tall arched chapel window. Glass 5×10. */
export const WIN_ARCH: WinDef = {
  rows: [
    '..FFF..',
    '.FGGGg.',
    'FGHfHhg',
    'FGHfhHg',
    'FGHfHHg',
    'Fffffffg'.slice(0, 7),
    'FGHfGHg',
    'FGHfGHg',
    'FGHfGHg',
    'FGHfGHg',
    'FGHfGHg',
    'FGHfGHg',
    'ggggggg',
    'FFFFFFF',
  ],
  gx: 1, gy: 2, gw: 5, gh: 10,
};
/** Small attic / gable window. Glass 5×5. */
export const WIN_ATTIC: WinDef = {
  rows: ['.FFFFF.', 'FGGfGhg', 'FGHfhHg', 'Ffffffg', 'FGHfGHg', 'FGHfGHg', '.ggggg.'],
  gx: 1, gy: 1, gw: 5, gh: 5,
};
/** Boarded-up window (ruins): dark hole with two crossed planks. */
export const WIN_BOARDED = ['.FFFFFFFFF.', '.Faaaaaaag.', '.F33aaaaag.', '.Fa3332aag.', '.Faaa3332g.', '.Faaaaa33g.', '.F3332aaag.', '.Faa33332g.', '.Faaaaaa3g.', '.Faaaaaaag.', '.ggggggggg.', 'FFFFFFFFFFF', 'SSSSSSSSSSS'];

const GLASS = { G: 'inkBlue', H: 'blue1', h: 'snow3' };
/** A window module in the given trim, curtain colour pair and goods colours. */
export function windowPiece(def: WinDef, trim: Trim, curtain: readonly [string, string] = ['barn2', 'barn3']): Cv {
  const key: Record<string, string> = {
    ...trimKey(trim), ...GLASS, C: curtain[0], c: curtain[1],
    y: 'brass2', t: 'teal3', k: 'barn3', r: 'cream3', a: 'ink', '3': 'wood3', '2': 'wood2', '1': 'wood1',
  };
  // 'S' marks the sill's cast shadow, which the caller lays down translucent.
  const rows = def.rows.map((r) => r.replace(/S/g, '.'));
  return piece('win' + def.rows.join(''), rows, key);
}

/** Louvred shutter (one side), drawn in a shutter ramp. */
export const SHUTTER = ['333', '210', '222', '210', '222', '210', '222', '210', '222', '210', '222', '111'];
export function shutter(r: Ramp): Cv {
  return piece('shutter', SHUTTER, rampKey(r));
}

/** Flower box under an 11-px sill: leaves and two flower colours. */
export const FLOWERBOX = ['..p...q..p.', '.LpL.LqLLpL', 'LlLLlLLlLLl', 'b33333333b.', 'b22222222b.'].map((r) => r.padEnd(11, '.'));
export function flowerBox(p: string, q: string, w = 11): Cv {
  const rows = FLOWERBOX.map((r) => (w === 11 ? r : r.slice(0, 4) + r.slice(11 - (w - 4))));
  // Box sides close at the right edge whatever the width.
  rows[3] = 'b' + '3'.repeat(w - 2) + 'b';
  rows[4] = 'b' + '2'.repeat(w - 2) + 'b';
  return piece('fbox' + w, rows, { p, q, L: 'leaf3', l: 'leaf2', b: 'wood1', '3': 'wood3', '2': 'wood2' });
}

// ---------------------------------------------------------------------------
// DOORS (12 × 17 with frame; door leaf 10 × 16 at (1,1))
// ---------------------------------------------------------------------------
/** Ledged plank door with a brass latch. */
export const DOOR_PLANK = [
  'FFFFFFFFFFFF',
  'F1111111111g',
  'F1321321322g',
  'F1321321322g',
  'F1333333332g',
  'F1222222221g',
  'F1321321322g',
  'F1321321322g',
  'F1321321kk2g',
  'F1321321k12g',
  'F1321321322g',
  'F1321321322g',
  'F1333333332g',
  'F1222222221g',
  'F1321321322g',
  'F1321321322g',
  'g0000000000g',
];
/** Four-panel house door. */
export const DOOR_PANEL = [
  'FFFFFFFFFFFF',
  'F1111111111g',
  'F1033203320g',
  'F1032103210g',
  'F1032103210g',
  'F1032103210g',
  'F1011101110g',
  'F1222222k20g',
  'F1222222220g',
  'F1033203320g',
  'F1032103210g',
  'F1032103210g',
  'F1032103210g',
  'F1032103210g',
  'F1011101110g',
  'F1222222220g',
  'g0000000000g',
];
/** Glazed shop door: big light with a pulled blind, panel below. */
export const DOOR_SHOP = [
  'FFFFFFFFFFFF',
  'F1111111111g',
  'F12GGGGGG20g',
  'F12bbbbbb20g',
  'F12GHHHhG20g',
  'F12GHHhHG20g',
  'F12GHhHHG20g',
  'F12GHHHHG20g',
  'F12222222k0g',
  'F1222222220g',
  'F1033333320g',
  'F1032222210g',
  'F1032222210g',
  'F1031111110g',
  'F1222222220g',
  'F1222222220g',
  'g0000000000g',
];
/** Saloon batwing doors swinging over a dark doorway. */
export const DOOR_BATWING = [
  'FFFFFFFFFFFF',
  'FaaaaaaaaaaF',
  'Faaaaaaaaaag',
  'Faaaaaaaaaag',
  'Faaaaaaaaaag',
  'F3333aa3333g',
  'F3232aa2323g',
  'F3232aa2323g',
  'F3232aa2323g',
  'F3232aa2323g',
  'F3232aa2323g',
  'F1111aa1111g',
  'Faaaaaaaaaag',
  'Faaaaaaaaaag',
  'Faaaaaaaaaag',
  'Faaaaaaaaaag',
  'g0000000000g',
];
/** Iron-strapped door (bank, jail). */
export const DOOR_IRON = [
  'FFFFFFFFFFFF',
  'F1111111111g',
  'F1321321322g',
  'Fiiiiiiiiiig',
  'F1321321322g',
  'F1321321322g',
  'F1321321322g',
  'F13213213k2g',
  'F13213213k2g',
  'F1321321322g',
  'F1321321322g',
  'F1321321322g',
  'Fiiiiiiiiiig',
  'F1321321322g',
  'F1321321322g',
  'F1321321322g',
  'g0000000000g',
];
export function doorPiece(rows: readonly string[], leaf: Ramp, trim: Trim): Cv {
  const key = { ...rampKey(leaf), ...trimKey(trim), ...GLASS, a: 'ink', k: 'brass3', b: 'cream2', i: 'tin1' };
  return piece('door' + rows[2] + rows[8] + rows[5], rows, key);
}

/** One leaf of a barn door: board-and-batten in the barn paint, white X brace and frame. */
export const BARN_LEAF = [
  'wwwwwwwwwwww',
  'www013221www',
  'www013221www',
  'w3ww0322ww2w',
  'w3ww0322ww2w',
  'w32ww02ww32w',
  'w32ww02ww32w',
  'w322wwww132w',
  'w322wwww132w',
  'w3221ww0132w',
  'w3221ww0132w',
  'w322wwww032w',
  'w322wwww032w',
  'w32ww32ww02w',
  'w32ww32ww02w',
  'w3ww1322ww0w',
  'w3ww1322ww0w',
  'www213221www',
  'www213221www',
  'wwwwwwwwwwww',
];
export function barnLeaf(r: Ramp, flip: boolean): Cv {
  return piece('barnleaf' + flip, flip ? mirrorRows(BARN_LEAF) : BARN_LEAF, { ...rampKey(r), w: 'cream3' });
}

// ---------------------------------------------------------------------------
// FALSE FRONTS, PORCHES, BOARDWALKS
// ---------------------------------------------------------------------------
/** Cornice band: cap moulding, its shadow, then a row of dentils. */
export const CORNICE = ['FFFFFFFF', 'ffffffff', 'gggggggg', 'Ff..Ff..', 'gg..gg..'];
/** Scroll bracket under each end of the cornice. */
export const BRACKET = ['FFfg', 'Ffg.', 'Ffg.', 'Fg..', 'fg..', 'g...'];
export function cornice(t: Trim): Cv {
  return piece('cornice', CORNICE, trimKey(t));
}
export function bracket(t: Trim, flip: boolean): Cv {
  return piece('bracket' + flip, flip ? mirrorRows(BRACKET) : BRACKET, trimKey(t));
}

/** Porch roof strip (plank/shake). 5 px. */
export const PORCH_ROOF = ['4444444444444444', '3332333233323332', '2221222122212221', '1110111011101110', '0000000000000000'];
/** Porch roof in tin. */
export const PORCH_TIN = ['4444444444444444', '2324232423242324', '2324232423242324', '1213121312131213', '0000000000000000'];
/** Canvas awning: two stripes, scalloped valance. */
export const AWNING = ['AAAAwwww', 'AAAAwwww', 'AAAAwwww', 'aaaaWWWW', 'aaaaWWWW', '.aa..WW.'];
export function awning(a: readonly [string, string]): Cv {
  return piece('awning', AWNING, { a: a[0], A: a[1], w: 'cream3', W: 'cream2' });
}

/** Turned porch post: capital, shaft lit on the left, base block. Height is tiled from the shaft row. */
export const POST_CAP = ['ffff', '.Ff.'];
export const POST_SHAFT = ['.Fg.'];
export const POST_BASE = ['.Ff.', 'Fffg'];

/** Boardwalk planks in front of the stores: lit nosing, seams, shadowed edge. */
export const BOARDWALK = ['4444444444444444', '3331333313331333', '2221222212221222', '0000000000000000'];
/** Porch deck for houses. */
export const DECK = ['3332333233323332', '1111111111111111'];

/** Railing for balconies: top rail and balusters. */
export const RAIL = ['FFFF', 'gggg', '.f..', '.f..', '.f..', '.g..'];

// ---------------------------------------------------------------------------
// CHIMNEYS AND VENTS
// ---------------------------------------------------------------------------
export const CHIMNEY_BRICK = [
  'oooooooooo',
  'o44444443o',
  'oo000000oo',
  '.o3332m3o.',
  '.o2221m2o.',
  '.ommmmmmo.',
  '.o3m33332o'.slice(0, 10),
  '.o2m22221o'.slice(0, 10),
  '.ommmmmmo.',
  '.o3332m3o.',
  '.o2221m2o.',
  '.ommmmmmo.',
  '.o3m3333o.',
  '.o2m2222o.',
  '.oooooooo.',
];
export const CHIMNEY_STONE = [
  'oooooooooooo',
  'o4444444443o',
  'o0000000000o',
  '.o33o4433o3o'.slice(0, 12),
  '.o221o322o2o'.slice(0, 12),
  '.oo3443oo33o'.slice(0, 12),
  '.o4322o433o.',
  '.o3221o322o.',
  '.ooo33oooo3o'.slice(0, 12),
  '.o4433o4432o'.slice(0, 12),
  '.o3221o3221o'.slice(0, 12),
  '.oo44ooo44oo',
  '.o4332o4322o'.slice(0, 12),
  '.o3221o3211o'.slice(0, 12),
  '.oooooooooo.',
];
export const STOVEPIPE = ['ooooo', 'o344o', 'ooooo', '.o3o.', '.o2o.', '.o2o.', '.ooo.', '.o3o.', '.o2o.', '.o2o.', '.o2o.', '.ooo.'];
export const VENT = ['.oooo.', 'o4443o', 'o3332o', 'oooooo', '.o32o.', '.o32o.', '.o21o.', 'oooooo', 'o3332o', 'oooooo'];
export function chimneyPiece(kind: 'brick' | 'stone' | 'pipe' | 'vent'): Cv {
  if (kind === 'brick') return piece('chim-b', CHIMNEY_BRICK.map((r) => r.padEnd(10, '.')), { ...rampKey(RAMP.brick), o: 'red0', m: 'stone2' });
  if (kind === 'stone') return piece('chim-s', CHIMNEY_STONE.map((r) => r.padEnd(12, '.')), { ...rampKey(RAMP.stone), o: 'stone0' });
  if (kind === 'pipe') return piece('chim-p', STOVEPIPE, { ...rampKey(RAMP.tin), o: 'tin0' });
  return piece('vent', VENT, { ...rampKey(RAMP.tin), o: 'tin0' });
}

// ---------------------------------------------------------------------------
// PROPS (outlined in the material's darkest tone)
// ---------------------------------------------------------------------------
export const BARREL = [
  '.ooooo.',
  'o44443o',
  'o33332o',
  'oiiiiio',
  'o34221o',
  'o34221o',
  'o34221o',
  'oiiiiio',
  'o34221o',
  '.ooooo.',
];
export const CRATE = ['oooooooo', 'o444443o', 'o3o22o2o', 'o32o3o2o', 'o322o32o', 'o3o22o2o', 'o222221o', 'oooooooo'];
export const BENCH = ['o..........o', 'o3333333333o', 'o2222222222o', 'oooooooooooo', 'o4444444444o', 'oooooooooooo', '.o2o....o2o.', '.ooo....ooo.'];
export const ROCKER = ['oo......', 'o3o.....', 'o3o.....', 'o3o.....', 'o3oooooo', 'o344443o', 'oooooooo', '.o2..o2.', 'oo2..o2o', '.oooooo.'];
export const PLANTER = ['.p.q.p.', 'LpLqLpL', 'lLlLlLl', 'o44443o', 'o33332o', 'o22221o', '.ooooo.'];
export const SACKS = ['...ooooo.', '.oo4443o.', 'o4o3332oo', 'o3o3332o.', 'o3o2221o.', 'o22o221o.', 'oooooooo.'];
export const MILKCANS = ['.ooo..ooo.', '.o4o..o4o.', 'oo4oooo4oo', 'o443o443o.', 'o432o432o.', 'o432o432o.', 'o432o432o.', 'o321o321o.', 'oooooooooo'];
export const WOODPILE = ['....oooo....', '...oko4oo...', '..ooo3okoo..', '.oko4ooko4o.', '.o3oko3ooko.', 'okoo4okoo3oo', 'o3oko3oko4oo', 'oooooooooooo'];
export const LANTERN = ['.o.', 'ooo', 'oLo', 'olo', 'ooo'];
export const HAY = ['.oooooooo.', 'o44444443o', 'o33433343o', 'o32332232o', 'o22222222o', 'oooooooooo'];
export const TROUGH = ['oooooooooooo', 'o4wwwwwwww3o', 'o3333333332o', 'o2222222221o', 'oooooooooooo', '.o2o....o2o.'];

export function prop(rows: readonly string[], r: Ramp, extra: Record<string, string> = {}): Cv {
  return piece('prop' + rows.join(''), rows, { ...rampKey(r), o: r[0] === 'wood0' || r[0] === 'wood1' ? 'inkWarm' : r[0], ...extra });
}
export const PROP_KEY = {
  barrel: { i: 'tin1' },
  planter: { L: 'leaf3', l: 'leaf2' },
  woodpile: { k: 'wood5' },
  lantern: { L: 'lampL', l: 'lamp' },
  trough: { w: 'water2' },
};

// ---------------------------------------------------------------------------
// SIGN BOARD FRAME (lettering is set in buildingSprite.ts' sign-writer font)
// ---------------------------------------------------------------------------
/** Corner nail heads and the board's edge are drawn with these trims. */
export const SIGN_NAIL = 'brass2';
