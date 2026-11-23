/**
 * Wildlife sprites, hand-pixelled. Every animal is a rig of text-grid parts
 * (render/animalPixel.ts): torso, heads, tail and a leg spec. Frames are built
 * once per species by stamping the parts into a 40×32 character grid, laying
 * the legs for each pose as clean 1px-stepped columns, adding a per-material
 * outline (the darkest tone of whatever it borders) and handing the grid to
 * pixmap(). No shape-painting, gradients or noise.
 */
import { getSpecies } from '../data/wildlife.ts';
import { pixmap } from './pixmap.ts';
import { RIGS, BIRDS, RABBIT, SNAKE, type GridDef, type Part, type Rig } from './animalPixel.ts';

export const AW = 40;
export const AH = 32;
/** Ground row: hooves and feet stand on this row. */
const GY = 29;

export type AnimalAnim = 'idle' | 'walk' | 'run' | 'eat' | 'dead' | 'attack' | 'fly';
export type AnimalSet = Record<AnimalAnim, (HTMLCanvasElement | OffscreenCanvas)[]>;

// --- Character-grid canvas ----------------------------------------------------

type Mat = string[][];
const blank = (): Mat => Array.from({ length: AH }, () => Array<string>(AW).fill('.'));

function put(m: Mat, x: number, y: number, ch: string): void {
  if (x >= 0 && x < AW && y >= 0 && y < AH) m[y]![x] = ch;
}

/** Stamp a grid; '.' cells are transparent. */
function stamp(m: Mat, rows: readonly string[], x: number, y: number): void {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) if (row[i] !== '.' && row[i] !== ' ') put(m, x + i, y + j, row[i]!);
  });
}
const stampPart = (m: Mat, p: Part | undefined, dx = 0, dy = 0): void => { if (p) stamp(m, p.rows, p.x + dx, p.y + dy); };

/**
 * Outline: every empty cell touching a filled one (4-neighbour) takes the
 * outline of the material it borders — fur gets 'o', pale patches 'O' — so the line is the darkest tone of that material, not a global black.
 * Antler and horn ('n'/'N') carry their own dark edge and are not outlined,
 * so thin tines stay open instead of clogging into a blob.
 */
const OUTLINE_OF: Record<string, string> = { p: 'O', P: 'O', n: 'q', N: 'q', c: 'q', y: 'Y', Y: 'Y', r: 'R', g: 'G', G: 'G', s: 'S', S: 'S' };
const priority = (ch: string): number => (ch === 'o' ? 0 : ch === 'q' ? 1 : ch === 'O' ? 3 : 2);
function outline(m: Mat): void {
  const add: [number, number, string][] = [];
  for (let y = 0; y < AH; y++) {
    for (let x = 0; x < AW; x++) {
      if (m[y]![x] !== '.') continue;
      let best = '';
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const n = m[y + dy]?.[x + dx];
        if (!n || n === '.' || n === 'n' || n === 'N' || n === 'o' || n === 'O' || n === 'q' || n === 'R' || n === 'G' || n === 'Y' || n === 'S') continue;
        const o = OUTLINE_OF[n] ?? 'o';
        if (!best || priority(o) < priority(best)) best = o;
      }
      if (best) add.push([x, y, best]);
    }
  }
  for (const [x, y, ch] of add) m[y]![x] = ch;
}

/** Outline colours a rig does not set fall back to its fur outline 'o'. */
function fullKey(key: Readonly<Record<string, string>>): Record<string, string> {
  const k: Record<string, string> = { ...key };
  for (const c of ['O', 'q', 'R', 'G', 'Y', 'S']) k[c] ??= key.o!;
  return k;
}
function toCanvas(m: Mat, key: Readonly<Record<string, string>>): HTMLCanvasElement | OffscreenCanvas {
  return pixmap(m.map((r) => r.join('')), fullKey(key));
}

// --- Legs --------------------------------------------------------------------

/** A leg pose: knee and foot x offsets from the attach point, and foot lift. */
interface Pose { k: number; f: number; lift: number }
const P0: Pose = { k: 0, f: 0, lift: 0 };

/** Stepped column from (x0,y0) to (x1,y1), `t` px wide, coloured per column. */
function segment(m: Mat, x0: number, y0: number, x1: number, y1: number, cols: string, hoofCh: string, hoofFrom: number): void {
  const dy = y1 - y0;
  const dx = x1 - x0;
  const steps = Math.max(Math.abs(dy), Math.abs(dx), 1);
  for (let s = 0; s <= steps; s++) {
    const y = Math.round(y0 + (dy * s) / steps);
    const x = Math.round(x0 + (dx * s) / steps);
    for (let i = 0; i < cols.length; i++) put(m, x + i, y, y >= hoofFrom ? hoofCh : cols[i]!);
  }
}

function leg(m: Mat, r: Rig, ax: number, ay: number, pose: Pose, near: boolean, hind: boolean, dead = false): void {
  const L = r.legs;
  const cols = near ? L.near : L.far;
  const fy = dead ? ay + 2 : GY - pose.lift;
  const fx = ax + pose.f;
  const ky = Math.round((ay + fy) / 2);
  const kx = ax + pose.k + (hind && L.hock && !dead ? -L.hock : 0);
  const hoofFrom = fy - L.hoofRows + 1;
  segment(m, ax, ay, kx, ky, cols, L.hoof, hoofFrom);
  segment(m, kx, ky, fx, fy, cols, L.hoof, hoofFrom);
  if (L.paw && !dead) put(m, fx + cols.length, fy, L.hoof);
}

// --- Quadruped frames ----------------------------------------------------------

interface QFrame {
  bob: number;
  head: 'up' | 'graze' | 'bite' | 'run';
  hdx?: number;
  hdy?: number;
  tail?: 'stand' | 'flick' | 'run';
  /** near back, near front, far back, far front */
  legs: [Pose, Pose, Pose, Pose];
}

const stand: QFrame['legs'] = [P0, P0, { k: 0, f: 1, lift: 0 }, { k: 0, f: -1, lift: 0 }];
const W = {
  a: [{ k: -1, f: -2, lift: 0 }, { k: 1, f: 2, lift: 0 }, { k: 1, f: 2, lift: 0 }, { k: 0, f: -1, lift: 0 }] as QFrame['legs'],
  b: [{ k: 0, f: 1, lift: 2 }, { k: 0, f: 0, lift: 0 }, { k: 0, f: 0, lift: 0 }, { k: 2, f: 1, lift: 2 }] as QFrame['legs'],
  c: [{ k: 1, f: 2, lift: 0 }, { k: 0, f: -1, lift: 0 }, { k: -1, f: -2, lift: 0 }, { k: 1, f: 2, lift: 0 }] as QFrame['legs'],
  d: [{ k: 0, f: 0, lift: 0 }, { k: 2, f: 1, lift: 2 }, { k: 0, f: 1, lift: 2 }, { k: 0, f: 0, lift: 0 }] as QFrame['legs'],
};
const R = {
  gather: [{ k: 1, f: 3, lift: 1 }, { k: 0, f: -2, lift: 1 }, { k: 1, f: 2, lift: 2 }, { k: 0, f: -1, lift: 2 }] as QFrame['legs'],
  push: [{ k: -2, f: -4, lift: 0 }, { k: 3, f: 3, lift: 3 }, { k: -1, f: -3, lift: 1 }, { k: 3, f: 2, lift: 4 }] as QFrame['legs'],
  fly: [{ k: -2, f: -5, lift: 3 }, { k: 3, f: 5, lift: 4 }, { k: -2, f: -4, lift: 4 }, { k: 3, f: 4, lift: 3 }] as QFrame['legs'],
  land: [{ k: -1, f: -3, lift: 3 }, { k: 1, f: 2, lift: 0 }, { k: -1, f: -2, lift: 2 }, { k: 1, f: 3, lift: 1 }] as QFrame['legs'],
  collect: [{ k: 1, f: 2, lift: 2 }, { k: 0, f: -1, lift: 0 }, { k: 1, f: 1, lift: 3 }, { k: 0, f: 0, lift: 1 }] as QFrame['legs'],
};

const QUAD: Record<Exclude<AnimalAnim, 'dead' | 'fly'>, QFrame[]> = {
  idle: [{ bob: 0, head: 'up', tail: 'stand', legs: stand }, { bob: 0, head: 'up', tail: 'flick', legs: stand }],
  walk: [
    { bob: 0, head: 'up', tail: 'stand', legs: W.a },
    { bob: -1, head: 'up', tail: 'stand', legs: W.b },
    { bob: 0, head: 'up', tail: 'stand', legs: W.c },
    { bob: -1, head: 'up', tail: 'stand', legs: W.d },
  ],
  run: [
    { bob: 0, head: 'run', tail: 'run', legs: R.gather },
    { bob: -1, head: 'run', hdy: -1, tail: 'run', legs: R.push },
    { bob: -2, head: 'run', hdy: -1, tail: 'run', legs: R.fly },
    { bob: -1, head: 'run', hdy: 1, tail: 'run', legs: R.land },
    { bob: 0, head: 'run', tail: 'run', legs: R.collect },
  ],
  eat: [{ bob: 0, head: 'graze', tail: 'stand', legs: stand }, { bob: 0, head: 'graze', hdy: 1, tail: 'flick', legs: stand }],
  attack: [
    { bob: 0, head: 'bite', hdx: -1, tail: 'run', legs: [{ k: -1, f: -2, lift: 0 }, { k: 1, f: 1, lift: 0 }, { k: 0, f: -1, lift: 0 }, { k: 1, f: 2, lift: 0 }] },
    { bob: -1, head: 'bite', hdx: 2, tail: 'run', legs: [{ k: -2, f: -4, lift: 0 }, { k: 3, f: 3, lift: 1 }, { k: -1, f: -3, lift: 0 }, { k: 3, f: 4, lift: 0 }] },
  ],
};

function headPart(r: Rig, which: QFrame['head']): Part {
  if (which === 'bite') return r.heads.bite ?? r.heads.up;
  if (which === 'run') return r.heads.run ?? r.heads.up;
  return r.heads[which];
}

function quadFrame(r: Rig, f: QFrame): HTMLCanvasElement | OffscreenCanvas {
  const m = blank();
  const L = r.legs;
  const ay = L.y + f.bob;
  // Far legs first (behind the body), then torso, near legs, head, tail.
  leg(m, r, L.backX + L.farDx, ay, f.legs[2], false, true);
  leg(m, r, L.frontX + L.farDx, ay, f.legs[3], false, false);
  stampPart(m, r.body, 0, f.bob);
  leg(m, r, L.backX, ay, f.legs[0], true, true);
  leg(m, r, L.frontX, ay, f.legs[1], true, false);
  stampPart(m, r.over, 0, f.bob);
  const tail = r.tail?.[f.tail ?? 'stand'] ?? r.tail?.stand;
  stampPart(m, tail, 0, f.bob);
  const h = headPart(r, f.head);
  // Bite and graze heads were drawn for their pose; for 'run' the alert head leans forward.
  const lean = f.head === 'run' && !r.heads.run ? 1 : 0;
  stampPart(m, h, (f.hdx ?? 0) + lean, f.bob + (f.hdy ?? 0) + lean);
  outline(m);
  return toCanvas(m, r.key);
}

/** Lying on its side: torso on the ground, legs out stiff, eyes shut. */
function quadDead(r: Rig): HTMLCanvasElement | OffscreenCanvas {
  const m = blank();
  const L = r.legs;
  const bodyBottom = r.body.y + r.body.rows.length - 1;
  const drop = GY - 2 - bodyBottom;
  const ay = L.y + drop;
  const stiff: Pose = { k: 2, f: 4, lift: 0 };
  leg(m, r, L.backX + L.farDx, ay - 1, stiff, false, true, true);
  leg(m, r, L.frontX + L.farDx, ay - 1, stiff, false, false, true);
  stampPart(m, r.body, 0, drop);
  leg(m, r, L.backX, ay, stiff, true, true, true);
  leg(m, r, L.frontX, ay, stiff, true, false, true);
  stampPart(m, r.tail?.stand, 0, drop);
  // The grazing head, slid down so the muzzle rests on the ground.
  // Only the part of the neck below the torso's back line is kept, so it lies flat.
  const g = r.heads.graze;
  const gBottom = g.y + g.rows.length - 1;
  const gy = g.y + (GY - gBottom);
  const top = r.body.y + drop + 1;
  const rows = g.rows.map((row, j) => (gy + j < top ? '.'.repeat(row.length) : row.replace(/e/g, 'd').replace(/w/g, 'd')));
  stamp(m, rows, g.x + 1, gy);
  outline(m);
  return toCanvas(m, r.key);
}

function quadSet(r: Rig): AnimalSet {
  const mk = (fs: QFrame[]) => fs.map((f) => quadFrame(r, f));
  return {
    idle: mk(QUAD.idle),
    walk: mk(QUAD.walk),
    run: mk(QUAD.run),
    eat: mk(QUAD.eat),
    attack: mk(QUAD.attack),
    fly: [],
    dead: [quadDead(r)],
  };
}

// --- Whole-frame grids (rabbit, birds, snake) ----------------------------------

/** A sprite drawn as complete frames; rows are placed bottom-aligned on the ground row. */
function frameFrom(rows: readonly string[], key: Readonly<Record<string, string>>, dx: number, ground = GY): HTMLCanvasElement | OffscreenCanvas {
  const m = blank();
  const w = Math.max(...rows.map((r) => r.length));
  stamp(m, rows, Math.round((AW - w) / 2) + dx, ground - rows.length + 1);
  outline(m);
  return toCanvas(m, key);
}

function gridSet(def: GridDef): AnimalSet {
  const cache = new Map<string, HTMLCanvasElement | OffscreenCanvas>();
  const get = (name: string) => {
    let c = cache.get(name);
    if (!c) {
      c = frameFrom(def.frames[name]!, def.key, def.x, GY - (def.air?.[name] ?? 0));
      cache.set(name, c);
    }
    return c;
  };
  const out = {} as AnimalSet;
  for (const a of Object.keys(def.seq) as AnimalAnim[]) out[a] = def.seq[a].map(get);
  return out;
}

const cache = new Map<string, AnimalSet>();

/**
 * Animation frames for a species (built once, cached). Every frame is AW×AH,
 * facing right, feet on row GY. Frame counts per animation: idle 2, walk 4,
 * run 5 (birds 4), eat 2, attack 2 (birds 1), fly 4 (birds only), dead 1;
 * snakes share 4 frames for every live animation.
 */
export function animalSprites(speciesId: string): AnimalSet {
  const hit = cache.get(speciesId);
  if (hit) return hit;
  const S = getSpecies(speciesId);
  let set: AnimalSet;
  if (S.archetype === 'bird') set = gridSet(BIRDS[S.id] ?? BIRDS.hawk!);
  else if (S.archetype === 'snake') set = gridSet(SNAKE);
  else if (S.id === 'rabbit') set = gridSet(RABBIT);
  else set = quadSet(RIGS[S.id] ?? RIGS.deer!);
  cache.set(speciesId, set);
  return set;
}
