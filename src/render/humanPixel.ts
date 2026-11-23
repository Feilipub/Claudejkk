/**
 * Hand-pixelled people. Every body part is a text grid (one character per
 * pixel) drawn once; a frame is assembled by stamping parts onto a 20×28 char
 * buffer, a per-material dark outline is traced around the silhouette, and the
 * buffer is turned into a canvas with `pixmap()` using a key built from the
 * character's HumanLook — the same drawing, palette-swapped per person.
 *
 * Proportions follow the art bible: big readable head (~45% of the height),
 * 2×2 eyes (lash row over white + iris), hair as a 3-tone mass, flat colour
 * regions with one shadow and one highlight, light from the upper-left.
 *
 * Letter legend (see `keyFor`):
 *   skin  S s z Z   eyes e i W   blush !   mouth m   stubble _
 *   hair  H h y     ribbon Y
 *   shirt (inner placket) C c x       side zone (vest, else shirt) V v w
 *   coat  Q q g     sleeve (coat, else shirt) U u j
 *   forearm (rolled sleeve → skin, else sleeve) 1 2 3
 *   pants/skirt P p n   sash :   boots B b d
 *   hat T t r, band R   leather l L   brass * +   gun metal G I
 *   bandana K k X   apron A a O   brush bristles %
 */
import { pixmap } from './pixmap.ts';

export type Grid = readonly string[];
export type Buf = string[][];

export const BW = 20;
export const BH = 28;

export function newBuf(w = BW, h = BH): Buf {
  return Array.from({ length: h }, () => Array<string>(w).fill('.'));
}

/** Stamp a grid at (x, y); '.' and ' ' are transparent. */
export function stamp(b: Buf, g: Grid | null | undefined, x: number, y: number): void {
  if (!g) return;
  for (let j = 0; j < g.length; j++) {
    const row = g[j]!;
    const yy = y + j;
    if (yy < 0 || yy >= b.length) continue;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i]!;
      if (ch === '.' || ch === ' ') continue;
      const xx = x + i;
      if (xx < 0 || xx >= b[0]!.length) continue;
      b[yy]![xx] = ch;
    }
  }
}

/** Drop the first `n` rows of a grid (a leg lifted off the ground). */
export function lift(g: Grid, n: number): Grid {
  return n > 0 ? g.slice(n) : g;
}

/** Mirror a grid horizontally. */
export function mirror(g: Grid): Grid {
  return g.map((r) => [...r].reverse().join(''));
}

/** Remove buffer row `y` and pull everything below it up (the rows above stay). */
export function dropRow(b: Buf, y: number): void {
  const w = b[0]!.length;
  b.splice(y, 1);
  b.push(Array<string>(w).fill('.'));
}

/** Shift the rows in [y0, y1] of a buffer by dy (content outside is cleared). */
export function shiftRows(b: Buf, y0: number, y1: number, dy: number): void {
  if (!dy) return;
  const rows = b.slice(y0, y1 + 1).map((r) => [...r]);
  for (let y = y0; y <= y1; y++) b[y]!.fill('.');
  rows.forEach((r, i) => {
    const yy = y0 + i + dy;
    if (yy < 0 || yy >= b.length) return;
    r.forEach((ch, x) => {
      if (ch !== '.') b[yy]![x] = ch;
    });
  });
}

/** Rotate a buffer 90° counter-clockwise. */
export function rotCCW(b: Buf): Buf {
  const h = b.length;
  const w = b[0]!.length;
  const out = newBuf(h, w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[w - 1 - x]![y] = b[y]![x]!;
  return out;
}

/** Material group per letter, used to pick each outline pixel's colour. */
const GROUP: Record<string, string> = {};
const groups: Record<string, string> = {
  skin: 'SszZ!m_eiW',
  hair: 'HhyY',
  shirt: 'Ccx:',
  side: 'Vvw',
  coat: 'Qqg',
  sleeve: 'Uuj',
  fore: '123',
  pants: 'Ppn',
  boots: 'Bbd',
  hat: 'TtrR',
  leather: 'lL%',
  brass: '*+',
  metal: 'GI',
  band: 'KkX',
  apron: 'AaO',
};
for (const [gname, chars] of Object.entries(groups)) for (const ch of chars) GROUP[ch] = gname;
/** Outline character per group (private-use code points so they never clash with art letters). */
export const OUTLINE: Record<string, string> = {};
Object.keys(groups).forEach((g, i) => (OUTLINE[g] = String.fromCharCode(0xe000 + i)));
const IS_OUTLINE = new Set(Object.values(OUTLINE));

/**
 * Trace a 1-px outline around the silhouette (4-connected). Each outline pixel
 * takes the darkest tone of the material it borders — dark brown around brown
 * hair, deep red around a red shirt — instead of one global black.
 */
export function outline(b: Buf): void {
  const h = b.length;
  const w = b[0]!.length;
  const src = b.map((r) => [...r]);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? '.' : src[y]![x]!);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (src[y]![x] !== '.') continue;
      // Preference: the pixel below (feet, hems), then sides, then above.
      for (const [dx, dy] of [[0, 1], [-1, 0], [1, 0], [0, -1]] as const) {
        const ch = at(x + dx, y + dy);
        if (ch === '.' || IS_OUTLINE.has(ch)) continue;
        b[y]![x] = OUTLINE[GROUP[ch] ?? 'leather'] ?? OUTLINE.leather!;
        break;
      }
    }
}

export function toCanvas(b: Buf, key: Record<string, string>): HTMLCanvasElement | OffscreenCanvas {
  return pixmap(b.map((r) => r.join('')), key);
}

/** Which material group a letter belongs to (for building keys). */
export const GROUP_OF = GROUP;
export const GROUP_LETTERS = groups;
