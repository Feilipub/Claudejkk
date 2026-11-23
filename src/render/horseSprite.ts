/**
 * Procedural horse sprite painter. Builds a complete animated sprite set for
 * one individual horse from its breed (body type plus per-breed conformation:
 * dished or Roman face, crest, hindquarter bulk, tail carriage, hoof size),
 * size, coat, pattern, markings, mane/tail style and equipment.
 *
 * Legs use a stance/swing gait model: each hoof lands at its own beat, stays
 * planted for the gait's duty factor while the body passes over it, then
 * swings forward. Suspension phases fall out of the timing, so the walk reads
 * as 4-beat, the trot as diagonal pairs, the canter as 3-beat with a rocking
 * pitch and the gallop as an extended 4-beat with a gathered flight.
 */
import { getBreed, type BodyType } from '../data/breeds.ts';
import { getCoat } from '../data/coats.ts';
import { getItem } from '../data/items.ts';
import type { HorseData } from '../horse/horse.ts';
import { Rng } from '../core/rng.ts';
import { ctx2d, ellipse, hexToRgb, line, makeCanvas, mix, pixelise, poly, px, rect, shade, type Ctx } from './pixel.ts';

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

/** Per-breed conformation on top of the body type. All multipliers default to 1. */
interface BreedShape {
  len?: number; // barrel length
  depth?: number; // barrel depth
  leg?: number; // leg length
  legW?: number; // bone
  neck?: number;
  head?: number;
  headW?: number;
  carriage?: number; // extra head carriage (rad)
  hind?: number; // hindquarter bulk
  chest?: number; // chest/shoulder bulk
  profile?: number; // -1 dished (Arabian) .. +1 Roman nose (Shire)
  tailSet?: number; // 0 normal .. 1 high, flagged tail
  crest?: number; // extra neck crest
  sparse?: boolean; // thin mane and "rat" tail
  shaggy?: number; // rough, unkempt hair
  hoof?: number; // hoof size
  mottle?: boolean; // mottled muzzle, white sclera, striped hooves
  width?: number; // breadth seen from front/back
}

const BREED_SHAPE: Record<string, BreedShape> = {
  quarter: { hind: 1.28, chest: 1.12, head: 0.9, neck: 0.94, len: 0.96, width: 1.1 },
  thoroughbred: { leg: 1.1, len: 1.05, depth: 0.94, neck: 1.08, hind: 0.95, head: 1.04, legW: 0.92, width: 0.94, carriage: 0.05 },
  arabian: { profile: -1, tailSet: 1, head: 0.84, headW: 0.95, carriage: 0.2, len: 0.92, crest: 0.35, legW: 0.9, width: 0.94 },
  mustang: { len: 0.94, leg: 0.96, profile: 0.45, shaggy: 1, carriage: -0.1, width: 1.0 },
  appaloosa: { sparse: true, mottle: true, hind: 1.12, width: 1.04 },
  paint: { hind: 1.18, chest: 1.06, width: 1.06 },
  walker: { carriage: 0.06, neck: 1.06, len: 1.04, width: 0.96 },
  morgan: { crest: 0.7, carriage: 0.22, len: 0.94, head: 0.92, hind: 1.08, width: 1.04 },
  foxtrotter: { carriage: 0.1, neck: 1.04 },
  andalusian: { crest: 1.1, carriage: 0.22, profile: 0.3, depth: 1.05, hind: 1.1, width: 1.06 },
  belgian: { head: 1.12, headW: 1.08, width: 1.04, crest: 0.9, hoof: 1.45, depth: 1.06, neck: 0.9, hind: 1.18, chest: 1.15, carriage: -0.05 },
  shire: { head: 1.14, headW: 1.1, width: 1.0, profile: 0.85, hoof: 1.5, leg: 1.05, crest: 0.55, chest: 1.1 },
  criollo: { len: 0.92, depth: 1.05, width: 1.1, shaggy: 0.5, hind: 1.1 },
};

interface Look {
  body: [string, string, string];
  /** Specular highlight: warm on light coats, a cool sky sheen on black and near-black coats. */
  hi: string;
  /** Cool top-edge rim light for dark coats (null on coats light enough to read by their own ramp). */
  rim: string | null;
  /** Coat colour of the spots on a leopard Appaloosa (whose body ramp is the white). */
  spot: string | null;
  /** Legs painted white to the elbow/stifle (tobiano and sabino). */
  legFull: boolean[];
  mane: [string, string];
  points: string | null;
  dorsal?: string;
  speckle?: { color: string; density: number; kind: string };
  white: string;
  hoof: string;
  eye: string;
  pattern: string;
  face: string;
  legs: string[];
  maneStyle: string;
  tailStyle: string;
  maneLen: number;
  feather: number;
  seed: number;
  gear: Record<string, string | undefined>;
  shape: BreedShape;
  gaited: boolean;
}

interface Proportions {
  s: number; // overall scale
  bodyLen: number;
  bodyH: number;
  legLen: number;
  legW: number;
  neckLen: number;
  neckW: number;
  headLen: number;
  headW: number;
  headCarriage: number; // neck angle bias (rad, more = higher)
}

function proportions(body: BodyType, hands: number, sh: BreedShape): Proportions {
  const p = proportionsRaw(body, hands);
  // Longer barrel and slightly finer legs read better as a horse at this pixel scale.
  return {
    ...p,
    bodyLen: p.bodyLen * 1.14 * (sh.len ?? 1),
    bodyH: p.bodyH * (sh.depth ?? 1),
    legLen: p.legLen * 1.04 * (sh.leg ?? 1),
    legW: p.legW * 0.9 * (sh.legW ?? 1),
    neckLen: p.neckLen * 1.06 * (sh.neck ?? 1),
    headLen: p.headLen * 1.08 * (sh.head ?? 1),
    headW: p.headW * (sh.headW ?? 1),
    headCarriage: p.headCarriage + (sh.carriage ?? 0),
  };
}

function proportionsRaw(body: BodyType, hands: number): Proportions {
  const s = hands / 15.2;
  const base: Proportions = { s, bodyLen: 11, bodyH: 6, legLen: 12, legW: 2.4, neckLen: 10, neckW: 4.6, headLen: 7.5, headW: 3.4, headCarriage: 0 };
  switch (body) {
    case 'light':
      return { ...base, bodyLen: 11.5, bodyH: 5.5, legLen: 13.2, legW: 2.1, neckLen: 11, neckW: 4.1, headLen: 7.2, headW: 3.1, headCarriage: 0.1 };
    case 'stock':
      return { ...base, bodyLen: 10.8, bodyH: 6.4, legLen: 11.6, legW: 2.6, neckLen: 9.2, neckW: 5, headLen: 7, headW: 3.5 };
    case 'gaited':
      return { ...base, bodyLen: 11.5, bodyH: 6, legLen: 12.4, legW: 2.3, neckLen: 11, neckW: 4.5, headLen: 7.5, headW: 3.2, headCarriage: 0.25 };
    case 'draft':
      return { ...base, bodyLen: 12.5, bodyH: 7.8, legLen: 12.4, legW: 3.6, neckLen: 10, neckW: 6.4, headLen: 8.5, headW: 4.2, headCarriage: -0.05 };
    case 'pony':
      return { ...base, bodyLen: 9, bodyH: 5.5, legLen: 9, legW: 2.4, neckLen: 7.5, neckW: 4.5, headLen: 6, headW: 3.2 };
  }
}

/**
 * Gait timing. `land` is the cycle time each hoof touches down (FL, FR, HL, HR;
 * FL/HL are the near side), `duty` the fraction of the cycle it stays planted.
 * `bob` is the barrel's vertical travel (bobN times per cycle, lowest at bobAt);
 * `pitch` rocks the body nose-up at pitchAt.
 */
interface Gait {
  land: [number, number, number, number];
  duty: number;
  stride: number;
  lift: number;
  frontLift: number;
  bob: number;
  bobN: number;
  bobAt: number;
  neck: number;
  pitch: number;
  pitchAt: number;
  reach: number; // forward shift of the front feet (extension)
  tail: number; // tail lift
  frames: number;
  /** How hard the knee and hock fold in the swing phase. */
  flex?: number;
}

const GAITS: Record<string, Gait> = {
  idle: { land: [0, 0, 0, 0], duty: 1, stride: 0, lift: 0, frontLift: 1, bob: 0, bobN: 1, bobAt: 0, neck: 0, pitch: 0, pitchAt: 0, reach: 0, tail: 0, frames: 4 },
  // Lateral 4-beat: LH, LF, RH, RF; always two or three feet down; head nods twice.
  walk: { land: [0.25, 0.75, 0, 0.5], duty: 0.64, stride: 3.6, lift: 1.9, frontLift: 1.1, bob: 0.45, bobN: 2, bobAt: 0.12, neck: 0.1, pitch: 0, pitchAt: 0, reach: 0, tail: 0, frames: 8, flex: 0.45 },
  // Diagonal pairs (LF+RH, RF+LH) with a moment of suspension between beats.
  trot: { land: [0, 0.5, 0.5, 0], duty: 0.42, stride: 5.6, lift: 3.2, frontLift: 1.3, bob: 1.1, bobN: 2, bobAt: 0.2, neck: 0.04, pitch: 0, pitchAt: 0, reach: 0.4, tail: 2.5, frames: 8, flex: 1.0 },
  // Gaited breeds: smooth 4-beat running walk, big overstride, strong head nod, no bounce.
  runwalk: { land: [0.25, 0.75, 0, 0.5], duty: 0.52, stride: 5.6, lift: 2.4, frontLift: 1.35, bob: 0.25, bobN: 2, bobAt: 0.12, neck: 0.22, pitch: 0, pitchAt: 0, reach: 0.6, tail: 1.5, frames: 8, flex: 0.95 },
  // Right-lead 3-beat: LH | RH+LF | RF, then suspension; rocking-horse pitch.
  canter: { land: [0.2, 0.4, 0, 0.2], duty: 0.36, stride: 7.6, lift: 3.6, frontLift: 1.2, bob: 1.5, bobN: 1, bobAt: 0.32, neck: 0.2, pitch: 0.075, pitchAt: 0.04, reach: 1, tail: 5, frames: 8, flex: 0.85 },
  // Transverse 4-beat: LH, RH, LF, RF, then a gathered flight under the belly.
  gallop: { land: [0.3, 0.42, 0, 0.1], duty: 0.3, stride: 10.5, lift: 4, frontLift: 1.15, bob: 1.5, bobN: 1, bobAt: 0.3, neck: 0.3, pitch: 0.06, pitchAt: 0.05, reach: 2, tail: 6, frames: 8, flex: 0.95 },
};

/** Relative luminance 0..1 of a hex colour (perceptual weights, no gamma). */
function luma(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (r * 0.3 + g * 0.59 + b * 0.11) / 255;
}

function lookFor(h: HorseData): Look {
  const coat = getCoat(h.appearance.coat);
  const breed = getBreed(h.breedId);
  const pattern = h.appearance.pattern;
  const white = '#f2efe8';
  let body: [string, string, string] = [...coat.body];
  let hi = shade(body[2], 0.22);
  let rim: string | null = null;
  let spot: string | null = null;
  const lum = luma(body[1]);
  if (pattern === 'leopard') {
    // Leopard Appaloosa: a white horse carrying coat-coloured spots.
    spot = coat.body[1];
    body = [mix(coat.body[1], white, 0.62), '#dcd6cb', white];
    hi = '#fbf8f1';
  } else if (lum < 0.26) {
    // Black and near-black coats read by their sheen, not their local colour: a longer dark
    // ramp that climbs into cool, sky-reflecting greys on the top planes plus a cool rim.
    const k = Math.min(1, (0.26 - lum) / 0.13);
    body = [body[0], mix(body[1], '#2b3040', 0.35 * k), mix(body[2], '#56627a', 0.5 * k)];
    hi = mix(coat.body[2], '#9eabc0', 0.3 + 0.45 * k);
    rim = mix(coat.body[1], '#7c8aa6', 0.35 + 0.35 * k);
  }
  let face = h.appearance.face;
  const legs = [...h.appearance.legs];
  const legFull = [false, false, false, false];
  if (pattern === 'tobiano') {
    // Tobiano white comes down over the topline and runs on down the legs; the head stays dark.
    for (let i = 0; i < 4; i++) if (legs[i] === 'none' || legs[i] === 'coronet') legs[i] = i < 2 ? 'sock' : 'stocking';
    legFull[2] = legFull[3] = (h.appearance.patternSeed & 1) === 0;
  } else if (pattern === 'overo' || pattern === 'tovero') {
    // Frame overo: a bald face, white rarely reaches the legs.
    face = 'bald';
  } else if (pattern === 'sabino') {
    // Sabino: high, ragged white legs and a broad blaze running off the chin.
    for (let i = 0; i < 4; i++) legs[i] = 'stocking';
    legFull[2] = legFull[3] = true;
    if (face === 'none' || face === 'star' || face === 'snip' || face === 'strip') face = 'blaze';
  }
  return {
    body,
    hi,
    rim,
    spot,
    legFull,
    mane: h.appearance.maneTint ? [shade(h.appearance.maneTint, -0.3), h.appearance.maneTint] : coat.mane,
    points: coat.points,
    dorsal: coat.dorsal,
    speckle: coat.speckle,
    white,
    hoof: '#3a3029',
    eye: '#0c0806',
    pattern,
    face,
    legs: legs as string[],
    maneStyle: h.appearance.maneStyle,
    tailStyle: h.appearance.tailStyle,
    maneLen: h.appearance.maneLength,
    feather: breed.feathering,
    seed: h.appearance.patternSeed,
    gear: { ...h.gear },
    shape: BREED_SHAPE[h.breedId] ?? {},
    gaited: breed.body === 'gaited',
  };
}

interface Pose {
  gait: string;
  t: number; // 0..1 cycle
  graze?: number; // 0..1 head lowering
  rear?: number; // 0..1
  jump?: number; // 0..1 phase of jump
  lie?: boolean;
  buck?: number;
}

/** Solve 2-segment leg; returns knee point. bendDir +1 = knee forward. */
function knee(ax: number, ay: number, bx: number, by: number, l1: number, l2: number, bendDir: number): [number, number] {
  const dx = bx - ax;
  const dy = by - ay;
  let d = Math.hypot(dx, dy);
  d = Math.min(d, l1 + l2 - 0.01);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const hgt = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const mx = ax + (dx * a) / d;
  const my = ay + (dy * a) / d;
  return [mx + bendDir * (-dy / d) * hgt * -1, my + bendDir * (dx / d) * hgt * -1];
}

/** Hoof offset for leg `li` at cycle time t: planted and sliding back, or swinging forward. */
function footAt(g: Gait, li: number, t: number): { dx: number; lift: number; swing: number } {
  const u = (((t - g.land[li]!) % 1) + 1) % 1;
  if (u < g.duty) return { dx: g.stride * (0.5 - u / g.duty), lift: 0, swing: 0 };
  const v = (u - g.duty) / (1 - g.duty);
  const e = v * v * (3 - 2 * v);
  // Forelegs snatch up early in the swing (knee folds), hinds lift more evenly.
  const front = li < 2;
  const dx = g.stride * (-0.5 + e);
  let lift = Math.sin(Math.PI * Math.pow(v, front ? 0.75 : 1)) * g.lift * (front ? g.frontLift : 1);
  // A long reach can only happen off the ground: raise far-flung hooves so the leg stays its length.
  lift = Math.max(lift, (Math.abs(dx) - 3.4) * 0.8 * Math.sin(Math.PI * v));
  // Joint fold: peaks early in the swing (the knee snaps up), opens out again to reach for the landing.
  const swing = Math.sin(Math.PI * Math.pow(v, front ? 0.7 : 0.9));
  return { dx, lift, swing };
}

/** Paint one side-view frame (facing right). Returns saddle anchor. */
function paintSide(c: Ctx, L: Look, P: Proportions, pose: Pose): { sx: number; sy: number } {
  const g = GAITS[pose.gait] ?? GAITS.idle!;
  const sh = L.shape;
  const s = P.s;
  const tau = Math.PI * 2;
  const moving = g.stride > 0 && !pose.lie && pose.jump === undefined && !pose.rear && !pose.buck;
  const bob = moving ? Math.cos(tau * g.bobN * (pose.t - g.bobAt)) * g.bob * s : pose.gait === 'idle' && !pose.lie ? (pose.t >= 0.5 ? 0.35 : 0) : 0;
  const legLen = P.legLen * s;
  const groundY = GROUND_Y;
  let cy = groundY - legLen - P.bodyH * s * 0.55 + bob; // barrel centre
  const cx = HW / 2 - 2;
  if (pose.lie) cy = groundY - P.bodyH * s * 0.92 + (pose.t >= 0.5 ? -0.4 : 0);
  if (pose.jump !== undefined) cy -= Math.sin(pose.jump * Math.PI) * 9;

  c.save();
  // Rear and buck: rotate around hind hooves / front hooves.
  if (pose.rear) {
    const pivotX = cx - P.bodyLen * s * 0.8;
    c.translate(pivotX, groundY);
    c.rotate(-0.62 * pose.rear);
    c.translate(-pivotX, -groundY);
  } else if (pose.buck) {
    const pivotX = cx + P.bodyLen * s * 0.8;
    c.translate(pivotX, groundY);
    c.rotate(0.35 * pose.buck);
    c.translate(-pivotX, -groundY);
  } else if (moving && g.pitch) {
    c.translate(cx, cy);
    c.rotate(-Math.cos(tau * (pose.t - g.pitchAt)) * g.pitch);
    c.translate(-cx, -cy);
  }

  const [dark, mid, light] = L.body;
  const bl = P.bodyLen * s;
  const bh = P.bodyH * s;
  const hindK = sh.hind ?? 1;
  const chestK = sh.chest ?? 1;
  const shoulderX = cx + bl * 0.62;
  const hipX = cx - bl * 0.62;
  const legTopY = cy + bh * 0.35;
  const w = P.legW * s;

  // --- Legs: hoof targets and knees ----------------------------------------
  interface Leg { top: [number, number]; knee: [number, number]; x: number; y: number; front: boolean; near: boolean; idx: number }
  const legs: Leg[] = [];
  for (const li of [0, 1, 2, 3]) {
    const front = li < 2;
    const near = li === 0 || li === 2;
    const top: [number, number] = [(front ? shoulderX : hipX) + (near ? 0.8 : -0.8), legTopY];
    const baseX = top[0];
    let hx = baseX;
    let hy = groundY;
    let kn: [number, number] | null = null;
    if (pose.lie) {
      // Sternal rest: forelegs folded under the chest, near hind tucked with its hoof forward.
      if (front) {
        kn = [baseX + (near ? 3.2 : 2.2) * s, groundY - 1.6];
        hx = baseX - (near ? 2.2 : 1) * s;
        hy = groundY - 0.4;
      } else {
        kn = [baseX - 2.6 * s, groundY - 1.8];
        hx = baseX + (near ? 5.5 : 4) * s;
        hy = groundY - 0.4;
      }
      if (!near) top[1] = cy + bh * 0.2;
    } else if (pose.rear && front) {
      hx = baseX + 3 * s + (near ? 1 : -1);
      hy = legTopY + legLen * 0.7;
    } else if (pose.buck && !front) {
      hx = baseX - 6 * s;
      hy = legTopY + legLen * 0.6;
    } else if (pose.jump !== undefined) {
      const j = pose.jump;
      const tuck = Math.sin(j * Math.PI);
      hx = baseX + (front ? 4 : -4) * s * (j < 0.5 ? 1 : -0.3);
      hy = Math.min(groundY + Math.sin(j * Math.PI) * 9, legTopY + legLen * (1 - tuck * 0.45));
    } else if (moving) {
      const f = footAt(g, li, pose.t);
      hx = baseX + (f.dx + (front ? g.reach : -g.reach * 0.4)) * s;
      hy = groundY - f.lift * s;
    } else if (pose.graze !== undefined) {
      hx = baseX + (front ? (near ? 2.5 : 0.5) : 0);
    } else if (pose.gait === 'idle') {
      // Square stance with the far feet slightly offset so all four legs read.
      hx = baseX + (front ? (near ? 0.6 : -0.4) : near ? -0.6 : 0.6);
    }
    if (!kn) kn = knee(top[0], top[1], hx, hy - 1, legLen * 0.52, legLen * 0.56, front ? 1 : -1);
    if (moving && g.flex) {
      // Fold the joints while the leg is in the air; zero at lift-off and landing, so the stance stays planted.
      const fl = footAt(g, li, pose.t).swing * g.flex;
      if (fl > 0) {
        // Flexed pose by joint angles (radians from vertical, + toward the head): forelegs reach
        // the forearm forward with the cannon hanging back under the knee ("<" shape); hinds
        // carry the gaskin back and swing the cannon forward under the hock. Blended in over
        // the IK pose by how deep into the swing the leg is.
        const l1 = legLen * 0.52;
        const l2 = legLen * 0.56;
        const base = Math.atan2(hx - top[0], hy - 1 - top[1]) * 0.6;
        const a1 = base + (front ? 0.8 : -0.3) * fl;
        const a2 = base + (front ? -0.5 : 0.45) * fl;
        const fk: [number, number] = [top[0] + Math.sin(a1) * l1, top[1] + Math.cos(a1) * l1];
        const fx = fk[0] + Math.sin(a2) * l2;
        const fy = fk[1] + Math.cos(a2) * l2;
        const wgt = Math.min(1, fl * 1.5);
        kn = [kn[0] + (fk[0] - kn[0]) * wgt, kn[1] + (fk[1] - kn[1]) * wgt];
        hx += (fx - hx) * wgt;
        hy = Math.min(groundY, hy + (fy + 1 - hy) * wgt);
      }
    }
    legs.push({ top, knee: kn, x: hx, y: hy, front, near, idx: li });
  }

  const hoofK = sh.hoof ?? 1;
  const drawLeg = (L2: Leg) => {
    const [topX, topY] = L2.top;
    const [kx, ky] = L2.knee;
    const col = L2.near ? mid : dark;
    // Upper leg (forearm/gaskin) is a muscled wedge tapering to a fine cannon; joints bulge slightly.
    line(c, topX, topY - 1, kx, ky, col, w * (L2.front ? 1.7 : 1.85));
    line(c, kx, ky, L2.x, L2.y - 1, col, w * 0.95);
    ellipse(c, kx, ky, w * 0.62, w * 0.55, col);
    if (L2.near) {
      // Sun catches the front edge of the near legs; back of the cannon sits in shade.
      const off = L2.front ? 0.7 : -0.7;
      line(c, topX + off, topY, kx + off * 0.6, ky - 0.5, light, 0.9);
      line(c, kx + off * 0.5, ky + 0.5, L2.x + off * 0.4, L2.y - 2.5, shade(mid, 0.12), 0.8);
    }
    const marking = L.legs[L2.idx] ?? 'none';
    const pointCol = L.points ? (L2.near ? L.points : shade(L.points, -0.2)) : null;
    if (pointCol) line(c, kx + (L2.x - kx) * 0.1, ky + (L2.y - ky) * 0.1, L2.x, L2.y - 1, pointCol, w);
    if (marking !== 'none') {
      const frac = marking === 'coronet' ? 0.2 : marking === 'sock' ? 0.5 : 1.0;
      const sx = L2.x + (kx - L2.x) * frac;
      const sy = L2.y - 1 + (ky - L2.y + 1) * frac;
      line(c, L2.x, L2.y - 1, sx, sy, L2.near ? L.white : '#d8d4cc', w);
      if (L.legFull[L2.idx]) {
        // White running up from the body patch: the whole leg is white.
        line(c, kx, ky, topX, topY + 0.5, L2.near ? L.white : '#d8d4cc', w * (L2.front ? 1.5 : 1.65));
        ellipse(c, kx, ky, w * 0.55, w * 0.5, L2.near ? L.white : '#d8d4cc');
      }
    }
    if (L.spot && L2.near) {
      // Leopard spots carry on down the legs.
      px(c, (topX + kx) / 2, (topY + ky) / 2, L.spot);
      px(c, kx + (L2.x - kx) * 0.55, ky + (L2.y - ky) * 0.55, L.spot);
    }
    if (L.feather > 0.3) {
      // Draft feathering: silky hair flaring from the back of the cannon over the hoof.
      const fc = marking !== 'none' ? (L2.near ? L.white : '#d8d4cc') : L2.near ? L.mane[1] : L.mane[0];
      const fx = L2.x - 0.3;
      poly(c, [[kx - w * 0.3, ky + 1.5], [kx + w * 0.4, ky + 1.5], [fx + w * 0.9 * (0.5 + L.feather * 0.5), L2.y - 0.6], [fx - w * (0.7 + L.feather * 0.6), L2.y - 0.6]], fc);
    }
    // Hoof: pale horn under a white marking, dark otherwise (striped on mottled breeds).
    const hoofCol = marking === 'sock' || marking === 'stocking' ? '#b5a68a' : L.hoof;
    const hc = L2.near ? hoofCol : shade(hoofCol, -0.25);
    line(c, L2.x - 0.4 * hoofK, L2.y - 0.6, L2.x + 0.9 * hoofK, L2.y - 0.6, hc, w * 0.95 * (0.85 + 0.15 * hoofK));
    if (sh.mottle && L2.near && L2.y >= groundY - 0.5) px(c, L2.x + 0.4, L2.y - 1, '#b5a68a');
  };

  // Far legs first.
  for (const L2 of legs) if (!L2.near) drawLeg(L2);

  // --- Tail -----------------------------------------------------------------
  paintSideTail(c, L, pose, g, cx - bl * 0.98, cy - bh * (0.55 + (sh.tailSet ?? 0) * 0.25), s, moving, groundY);

  // --- Body ----------------------------------------------------------------
  // Silhouette: barrel, round croup set high, withers rising over the shoulder,
  // and a chest that pushes forward past the front legs.
  ellipse(c, cx, cy + bh * 0.05, bl, bh * 0.95, mid);
  ellipse(c, hipX + 1.2, cy - bh * 0.4, bh * 1.0 * hindK, bh * 1.08 * (0.92 + 0.08 * hindK), mid);
  ellipse(c, shoulderX + 0.2, cy - bh * 0.2, bh * 0.85 * chestK, bh * 1.04, mid);
  ellipse(c, shoulderX - 0.8, cy - bh * 0.88, bh * 0.55, bh * 0.38, mid);
  ellipse(c, shoulderX + bh * 0.45, cy + bh * 0.05, bh * 0.62 * chestK, bh * 0.72, mid);
  // Form shading, light from upper-left: belly and flank in shadow, topline and
  // the big muscle masses (shoulder, croup) catching the light.
  const deep = shade(dark, -0.28);
  const hi = L.hi;
  ellipse(c, cx, cy + bh * 0.55, bl * 0.85, bh * 0.45, dark);
  ellipse(c, cx + bl * 0.05, cy + bh * 0.85, bl * 0.62, bh * 0.2, deep);
  ellipse(c, cx - bl * 0.1, cy - bh * 0.55, bl * 0.75, bh * 0.35, light);
  ellipse(c, hipX + 1.5, cy - bh * 0.95, bh * 0.6 * hindK, bh * 0.35, light);
  ellipse(c, hipX - 1, cy + bh * 0.25, bh * 0.45, bh * 0.6, dark);
  // Croup and shoulder highlights.
  ellipse(c, hipX + 0.5, cy - bh * 1.05, bh * 0.38 * hindK, bh * 0.16, hi);
  ellipse(c, shoulderX - 0.5, cy - bh * 0.55, bh * 0.35, bh * 0.45, light);
  // Shoulder blade edge and stifle: thin shadow lines that sell the anatomy.
  c.strokeStyle = dark;
  c.lineWidth = 0.8;
  c.beginPath();
  c.moveTo(shoulderX - bh * 0.55, cy - bh * 0.95);
  c.quadraticCurveTo(shoulderX - bh * 0.9, cy - bh * 0.1, shoulderX - bh * 0.2, cy + bh * 0.55);
  c.stroke();
  c.beginPath();
  c.moveTo(hipX + bh * 0.85 * hindK, cy - bh * 0.2);
  c.quadraticCurveTo(hipX + bh * 0.7 * hindK, cy + bh * 0.4, hipX + bh * 0.35, cy + bh * 0.75);
  c.stroke();
  if (pose.lie) {
    // Barrel spreads on the ground; a soft shadow line where it meets the dirt.
    ellipse(c, cx, groundY - 1.6, bl * 0.95, 1.6, dark);
  }

  // --- Neck and head ----------------------------------------------------------
  const nod = moving ? Math.sin(tau * g.bobN * (pose.t - g.bobAt) + 0.6) * g.neck : 0;
  let neckAng = -1.0 - P.headCarriage + g.neck * 0.8 + nod;
  if (pose.graze !== undefined) neckAng = -1.0 + pose.graze * 1.9;
  if (pose.rear) neckAng = -1.25 + 0.55 * pose.rear; // the neck flexes forward as the forehand rises (and stays inside the frame)
  if (pose.lie) neckAng = -0.55 + (pose.t >= 0.5 ? 0.06 : 0);
  const nl = P.neckLen * s;
  const nbx = shoulderX + 1;
  const nby = cy - bh * 0.6;
  const ntx = nbx + Math.cos(neckAng) * nl * 0.8 + 2;
  const nty = nby + Math.sin(neckAng) * nl;
  const nw = P.neckW * s * 1.08;
  const crest = sh.crest ?? 0;
  // Neck: arched crest on top, straighter throat line below, broad where it meets the chest.
  const archX = (nbx + ntx) / 2 - nw * (0.55 + crest * 0.22);
  const archY = (nby + nty) / 2 - nw * (0.45 + crest * 0.25);
  c.fillStyle = mid;
  c.beginPath();
  c.moveTo(nbx - 4, nby - 0.6);
  c.quadraticCurveTo(archX, archY, ntx - 1.2, nty - nw * 0.3);
  c.lineTo(ntx + nw * 0.5, nty + nw * 0.38);
  c.quadraticCurveTo((ntx + nbx) / 2 + nw * 0.5, (nty + cy) / 2 + nw * 0.2, nbx + bh * 0.85 * chestK, cy + bh * 0.3);
  c.closePath();
  c.fill();
  line(c, nbx - 2.5, nby, ntx - 0.5, nty, light, 1.4 + crest * 0.5);
  // Throat and underside of the neck sit in shadow.
  line(c, ntx + nw * 0.4, nty + nw * 0.4, nbx + bh * 0.5, cy + bh * 0.05, dark, 1.2);
  // Head: wedge from poll towards muzzle; the front edge carries the breed's profile.
  let headAng = neckAng + 1.9 - (pose.graze ?? 0) * 0.35;
  if (pose.lie) headAng += 0.25; // dozing, nose dropped
  const hl = P.headLen * s * 1.08;
  const hw = P.headW * s * 1.15;
  const mx = ntx + Math.cos(headAng) * hl;
  const my = nty + Math.sin(headAng) * hl;
  const nfx = Math.cos(headAng - Math.PI / 2); // unit normal toward the face front
  const nfy = Math.sin(headAng - Math.PI / 2);
  const prof = sh.profile ?? 0;
  // Head in its own frame: u runs poll -> muzzle (in head lengths), v toward the face front
  // (in head widths). The front edge carries the breed's profile: a bulging Roman nasal bone,
  // or a dished face with a domed forehead and a small teacup muzzle.
  const H = (u: number, v: number): [number, number] => [ntx + Math.cos(headAng) * u * hl + nfx * v * hw, nty + Math.sin(headAng) * u * hl + nfy * v * hw];
  const rom = Math.max(0, prof);
  const dish = Math.max(0, -prof);
  const headPoly: [number, number][] = [
    H(-0.06, 0.3),
    H(0.1, 0.56 + dish * 0.12),
    H(0.28, 0.54 + rom * 0.16 + dish * 0.04),
    H(0.48, 0.47 + rom * 0.34 - dish * 0.22),
    H(0.68, 0.42 + rom * 0.32 - dish * 0.16),
    H(0.86, 0.36 + rom * 0.12 - dish * 0.06),
    H(1.0, 0.24 - dish * 0.06),
    H(1.05, 0.02),
    H(1.0, -0.2 + dish * 0.04),
    H(0.88, -0.27),
    H(0.62, -0.3),
    H(0.4, -0.5),
    H(0.24, -0.66),
    H(0.08, -0.62),
    H(-0.04, -0.36),
  ];
  poly(c, headPoly, mid);
  // Light falls on the flat of the face along the nasal bone; the jaw and chin turn into shadow.
  poly(c, [H(0.06, 0.46), H(0.3, 0.46 + rom * 0.14), H(0.5, 0.38 + rom * 0.3 - dish * 0.2), H(0.82, 0.26 + rom * 0.08), H(0.8, 0.1), H(0.3, 0.2)], light);
  poly(c, [H(0.42, -0.36), H(0.62, -0.18), H(0.9, -0.14), H(0.9, -0.27), H(0.62, -0.3), H(0.4, -0.5)], dark);
  // Round cheek (jowl) with a shadowed lower rim.
  const [jx, jy] = H(0.24, -0.26);
  ellipse(c, jx, jy, hw * 0.34, hw * 0.3, light);
  const [jx2, jy2] = H(0.26, -0.5);
  ellipse(c, jx2, jy2, hw * 0.26, hw * 0.12, dark, headAng);
  // Soft, darker muzzle; broad on the drafts, small on the dished breeds.
  const muzK = dish ? 0.78 : 1 + rom * 0.12;
  const [mzx, mzy] = H(0.93, -0.01);
  ellipse(c, mzx, mzy, hw * 0.26 * muzK, hw * 0.24 * muzK, L.points ? mix(mid, L.points, 0.4) : shade(mid, -0.18));
  // Ears: pricked forward when moving, pinned when rearing/bucking, relaxed sideways when dozing.
  const earBase = H(-0.02, 0.42);
  const earPin = pose.rear || pose.buck ? 0.8 : pose.lie ? 0.5 : 0;
  // Black-pointed coats (bay, buckskin, dun) carry the black onto the ear rims and muzzle.
  poly(c, [earBase, [earBase[0] - 1.8 - earPin * 2, earBase[1] - 2.6 + earPin * 1.5], [earBase[0] + 0.8, earBase[1] - 0.2]], L.points ?? dark);
  if (L.rim) px(c, earBase[0] - 1.2 - earPin * 2, earBase[1] - 1.8 + earPin * 1.5, L.rim);

  // Face markings run down the front of the face.
  if (L.face !== 'none') {
    c.strokeStyle = L.white;
    c.lineCap = 'round';
    const front = (t: number) => H(t, 0.34 - t * 0.12 + (t > 0.3 && t < 0.8 ? rom * 0.25 - dish * 0.15 : 0));
    const draw = (t0: number, t1: number, wd: number) => {
      const [x0, y0] = front(t0);
      const [x1, y1] = front(t1);
      c.lineWidth = wd;
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      c.stroke();
    };
    if (L.face === 'star') draw(0.18, 0.24, 1.6);
    else if (L.face === 'snip') draw(0.86, 0.96, 1.2);
    else if (L.face === 'strip') draw(0.25, 0.9, 1);
    else if (L.face === 'blaze') draw(0.12, 1.0, 1.8);
    else if (L.face === 'bald') {
      // Bald face: white wraps the whole front of the face down over the muzzle.
      poly(c, [H(0.05, 0.56), H(0.5, 0.5 + rom * 0.34), H(1.0, 0.3), H(1.06, 0), H(0.95, -0.22), H(0.7, -0.05), H(0.35, 0.12), H(0.1, 0.25)], L.white);
    }
  }

  const flow = pose.gait === 'gallop' || pose.gait === 'canter' ? -2.2 : pose.gait === 'trot' ? -0.8 : 0;
  paintSideMane(c, L, pose, { nbx, nby, ntx, nty, hw, flow, s });

  // --- Pattern (white patches) via source-atop on the body so far -----------
  applyPattern(c, L, cx, cy, bl, bh, ntx, nty, mx, my);

  // Eye with a brow shadow above it; nostril.
  const [ex, ey] = H(0.24, 0.18);
  if (pose.lie) {
    line(c, ex - 0.6, ey + 0.3, ex + 0.8, ey + 0.6, shade(mid, -0.25), 0.9);
  } else {
    px(c, ex - 0.6, ey - 1, shade(mid, -0.25));
    if (sh.mottle) px(c, ex - 1, ey, L.white);
    px(c, ex, ey, L.eye);
  }
  const [nx, ny] = H(0.9, 0.1);
  px(c, nx, ny, shade(L.body[0], -0.5));
  if (sh.mottle) {
    // Appaloosa mottled skin around the muzzle.
    px(c, mx + 0.6, my + 0.3, '#c9a49a');
    px(c, mx - 1.2, my + 0.8, '#c9a49a');
  }

  // Dorsal stripe (duns).
  if (L.dorsal) line(c, hipX - 1, cy - bh * 0.95, shoulderX, cy - bh * 1.05, L.dorsal, 1);

  // Near legs over body.
  for (const L2 of legs) if (L2.near) drawLeg(L2);

  // --- Gear -------------------------------------------------------------------
  const seatX = cx + bl * 0.12;
  const seatY = cy - bh * 0.95;
  paintGear(c, L, seatX, seatY, bl, bh, s, ntx, nty, mx, my, nbx, nby);
  c.restore();

  // Rider anchor must follow rotation; approximate for rear/buck.
  let ax = seatX;
  let ay = seatY;
  if (pose.rear) {
    ay -= 6 * pose.rear;
    ax -= 3 * pose.rear;
  }
  if (pose.buck) ay -= 3 * pose.buck;
  return { sx: ax, sy: ay };
}

/** Tail in side view: carriage per breed and gait, shape per tail style. */
function paintSideTail(c: Ctx, L: Look, pose: Pose, g: Gait, tailX: number, tailY: number, s: number, moving: boolean, groundY: number): void {
  const tau = Math.PI * 2;
  const sh = L.shape;
  const set = sh.tailSet ?? 0;
  const swish = Math.sin(pose.t * tau + 1) * (moving ? 1.6 : 1.1);
  const tailLift = (moving ? g.tail : 0) + set * 3;
  const style = L.tailStyle;
  let tailLen = (style === 'long' ? 19 : style === 'banged' ? 12.5 : style === 'knotted' ? 6 : style === 'braided' ? 13 : 14) * s;
  if (sh.sparse) tailLen *= 0.85;
  if (pose.lie) {
    // Lying: tail rests on the ground behind the quarters.
    const ex = tailX - tailLen * 0.55;
    c.strokeStyle = L.mane[0];
    c.lineWidth = (sh.sparse ? 1.8 : 3) * s;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(tailX, tailY);
    c.quadraticCurveTo(tailX - 3, groundY - 2, ex, groundY - 1.2);
    c.stroke();
    return;
  }
  // Streams back with speed but keeps some weight: the end always droops below the dock.
  const tEndX = tailX - 3 - Math.min(tailLift * 1.1, tailLen * 0.55) + swish;
  const tEndY = Math.min(groundY - 1, tailY + Math.max(tailLen * 0.4, tailLen - tailLift * 1.8));
  // A high-set tail arcs up off the croup before it falls (flagged Arabian tail).
  const ctrlX = tailX - 4 - tailLift;
  const ctrlY = tailY + 2 - set * 4.5 - (moving ? g.tail * 0.3 : 0);
  const thick = (sh.sparse ? 1.7 : style === 'braided' ? 2 : style === 'banged' ? 3.8 : style === 'long' ? 3.6 : 3.2) * s * (1 + (sh.shaggy ?? 0) * 0.12);
  c.strokeStyle = L.mane[0];
  c.lineCap = style === 'banged' ? 'butt' : 'round';
  c.lineWidth = thick;
  c.beginPath();
  c.moveTo(tailX, tailY);
  c.quadraticCurveTo(ctrlX, ctrlY, tEndX, tEndY);
  c.stroke();
  c.lineCap = 'round';
  // Highlight strand; skipped on the thin braid.
  if (style !== 'braided') {
    c.strokeStyle = L.mane[1];
    c.lineWidth = 1.2 * s;
    c.beginPath();
    c.moveTo(tailX - 0.5, tailY + 1);
    c.quadraticCurveTo(ctrlX + 0.5, ctrlY + 1, tEndX + 0.6, tEndY - 1.5);
    c.stroke();
  }
  if (style === 'banged') line(c, tEndX - thick * 0.45, tEndY, tEndX + thick * 0.45, tEndY, L.mane[0], 1.4);
  if (style === 'knotted') {
    ellipse(c, tEndX, tEndY, 2.1 * s, 1.7 * s, L.mane[0]);
    px(c, tEndX - 0.6, tEndY - 0.8, shade(L.mane[1], 0.25));
  }
  if (style === 'braided') {
    // Plait: alternating lit strands down the dock, a small tuft at the end.
    for (let k = 1; k < 6; k++) {
      const tt = k / 6;
      const x = (1 - tt) * (1 - tt) * tailX + 2 * (1 - tt) * tt * ctrlX + tt * tt * tEndX;
      const y = (1 - tt) * (1 - tt) * tailY + 2 * (1 - tt) * tt * ctrlY + tt * tt * tEndY;
      px(c, x + (k % 2 ? -0.5 : 0.5), y, shade(L.mane[1], 0.25));
    }
    ellipse(c, tEndX, tEndY + 0.8, 1.4 * s, 1.6 * s, L.mane[0]);
  }
  if (sh.shaggy && style !== 'braided' && style !== 'knotted') {
    // Rough, wind-tangled ends.
    line(c, tEndX, tEndY, tEndX - 1.5, tEndY + 1.2, L.mane[0], 1);
    line(c, tEndX + 1, tEndY - 1, tEndX + 2, tEndY + 0.8, L.mane[0], 1);
  }
}

/** Mane in side view: crest line plus style-specific locks. */
function paintSideMane(c: Ctx, L: Look, pose: Pose, m: { nbx: number; nby: number; ntx: number; nty: number; hw: number; flow: number; s: number }): void {
  const tau = Math.PI * 2;
  const { nbx, nby, ntx, nty, hw, flow, s } = m;
  const sh = L.shape;
  const style = L.maneStyle;
  const shaggy = sh.shaggy ?? 0;
  const midX = (nbx + ntx) / 2 - 2 - (sh.crest ?? 0) * 0.8;
  const midY = (nby + nty) / 2 - 1.5 - (sh.crest ?? 0) * 1.1;
  const crestPath = (dx: number, dy: number) => {
    c.beginPath();
    c.moveTo(nbx - 3.6 + dx, nby - 0.8 + dy);
    c.quadraticCurveTo(midX + flow + dx, midY + dy, ntx - 1 + dx, nty - hw * 0.45 + dy);
  };
  const pt = (t: number): [number, number] => {
    const x0 = nbx - 3.6;
    const y0 = nby - 0.8;
    const x2 = ntx - 1;
    const y2 = nty - hw * 0.45;
    return [(1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * (midX + flow) + t * t * x2, (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * midY + t * t * y2];
  };
  c.lineCap = 'round';
  if (style === 'roached') {
    // Clipped to a short upright brush along the crest; no forelock.
    c.strokeStyle = L.mane[0];
    c.lineWidth = 1.2;
    crestPath(0, -0.3);
    c.stroke();
    for (let k = 1; k < 6; k++) {
      const [x, y] = pt(k / 6);
      px(c, x - 0.3, y - 1.1, L.mane[1]);
    }
    return;
  }
  const sparse = sh.sparse ? 0.6 : 1;
  const maneW = (style === 'long' ? 2.4 : style === 'pulled' ? 1.4 : style === 'braided' ? 1.5 : 1.9) * sparse;
  const hang = (style === 'long' ? 4.6 : style === 'pulled' ? 0.8 : style === 'braided' ? 0 : 2.2 + shaggy * 1.2) * L.maneLen * s;
  c.strokeStyle = L.mane[0];
  c.lineWidth = maneW * 1.6;
  crestPath(0, 0);
  c.stroke();
  if (hang > 0) {
    const n = style === 'long' ? 7 : sh.sparse ? 3 : 5 + Math.round(shaggy * 2);
    for (let k = 0; k < n; k++) {
      const [x, y] = pt(0.04 + (0.9 * k) / n);
      const wave = Math.sin(k * 1.7 + pose.t * tau);
      const len = hang * (0.65 + 0.35 * wave) * (shaggy && k % 2 ? 1.25 : 1);
      line(c, x, y, x - 1 + flow * 0.9 - hang * 0.15, y + len, L.mane[k % 2], style === 'long' ? 1.4 : 1.2);
    }
  }
  // Light running along the top of the mane.
  c.strokeStyle = shade(L.mane[1], 0.18);
  c.lineWidth = 0.8;
  crestPath(0.4, -0.6);
  c.stroke();
  if (style === 'braided') {
    // Button braids: a row of tight knobs, each with a lit top.
    for (let k = 1; k < 6; k++) {
      const [x, y] = pt(k / 6.2);
      ellipse(c, x - 0.3, y + 0.6, 0.95, 1.1, L.mane[0]);
      px(c, x - 0.6, y, shade(L.mane[1], 0.3));
    }
  }
  // Forelock: longer and wilder on long and shaggy manes.
  const fl = style === 'long' || shaggy > 0.5 ? 1.7 : style === 'pulled' || style === 'braided' ? 0.8 : 1.2;
  line(c, ntx - 0.4, nty - hw * 0.3, ntx + 1.2 * fl, nty + 0.7 * fl, L.mane[1], 1);
}

/** Irregular blob: an ellipse whose rim is pushed in and out at `n` seeded points (frame-overo and sabino splashes). */
function jagged(c: Ctx, r: Rng, x: number, y: number, rx: number, ry: number, n: number, jit: number, color: string): void {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + (r.next() * 2 - 1) * jit;
    pts.push([x + Math.cos(a) * rx * k, y + Math.sin(a) * ry * k]);
  }
  poly(c, pts, color);
}

/**
 * Evenly scattered spots on a jittered grid (Appaloosa spots, dapples, roaning). A grid keeps the
 * spacing even the way the real coat is, where pure random points clump into blotches.
 */
function scatter(c: Ctx, r: Rng, x0: number, y0: number, x1: number, y1: number, sp: number, rad: [number, number], color: string, keep: (x: number, y: number) => number): void {
  let row = 0;
  for (let y = y0; y <= y1; y += sp, row++) {
    for (let x = x0 + (row % 2 ? sp * 0.5 : 0); x <= x1; x += sp) {
      const jx = x + (r.next() - 0.5) * sp * 0.7;
      const jy = y + (r.next() - 0.5) * sp * 0.7;
      const pr = keep(jx, jy);
      const rr = r.range(rad[0], rad[1]);
      if (r.next() < pr) ellipse(c, jx, jy, rr, rr * 0.85, color);
    }
  }
}

function applyPattern(c: Ctx, L: Look, cx: number, cy: number, bl: number, bh: number, ntx: number, nty: number, mx: number, my: number): void {
  const r = new Rng(L.seed);
  c.save();
  c.globalCompositeOperation = 'source-atop';
  const W = L.white;
  const neckX = (cx + bl * 0.62 + ntx) / 2;
  const neckY = (cy - bh * 0.6 + nty) / 2;
  const onBody = (x: number, y: number) => x > cx - bl * 1.15 && x < cx + bl * 0.95 && y > cy - bh * 1.3 && y < cy + bh * 1.05;
  switch (L.pattern) {
    case 'tobiano':
      // Smooth, rounded white crossing the topline between withers and dock; head stays dark.
      ellipse(c, cx - bl * 0.18 + r.range(-1.5, 1.5), cy - bh * 0.15, bl * 0.4, bh * 1.6, W, 0.18);
      ellipse(c, cx - bl * 0.95, cy + bh * 0.35, bh * 0.95, bh * 1.25, W);
      if (r.chance(0.6)) ellipse(c, neckX + r.range(-1, 1), neckY + 2, 2.6, 3.4, W, -0.5);
      break;
    case 'overo':
      // Frame overo: horizontal, ragged splash on the side that never crosses the back.
      jagged(c, r, cx + r.range(-2, 2), cy + bh * 0.25, bl * 0.52, bh * 0.52, 14, 0.32, W);
      if (r.chance(0.7)) jagged(c, r, neckX, neckY + 1.5, 2.4, 1.8, 8, 0.3, W);
      break;
    case 'tovero':
      // Mostly white with a coloured "shield" on the chest and a coloured cap over the ears.
      ellipse(c, cx - bl * 0.1, cy, bl * 0.9, bh * 1.35, W);
      ellipse(c, neckX, neckY, 3, 4, W);
      ellipse(c, (ntx + mx) / 2, (nty + my) / 2, 3, 3, W);
      ellipse(c, cx + bl * 0.75, cy - bh * 0.2, 3, 3.2, L.body[1]);
      break;
    case 'sabino': {
      // Ragged white belly whose edge breaks up into roaned flecks.
      jagged(c, r, cx, cy + bh * 0.95, bl * 0.78, bh * 0.45, 16, 0.3, W);
      const fleck = mix(L.body[1], W, 0.7);
      scatter(c, r, cx - bl * 0.95, cy - bh * 0.3, cx + bl * 0.85, cy + bh * 0.8, 1.7, [0.35, 0.55], fleck, (x, y) => (onBody(x, y) ? Math.max(0, (y - (cy - bh * 0.4)) / (bh * 1.2)) * 0.7 : 0));
      break;
    }
    case 'leopard': {
      // White horse with even, round coat-coloured spots, densest over the hindquarters.
      const sp = L.spot ?? L.body[1];
      const sp2 = shade(sp, -0.15);
      scatter(c, r, cx - bl * 1.2, cy - bh * 1.3, mx + 2, cy + bh * 1.1, 2.9, [0.6, 1.05], sp, (x) => (x < cx - bl * 0.2 ? 0.85 : 0.6));
      scatter(c, r, cx - bl * 1.2, cy - bh * 1.2, cx, cy + bh * 0.4, 4.2, [0.45, 0.7], sp2, () => 0.45);
      break;
    }
    case 'blanket': {
      // White blanket over the loins and hips, edge slightly broken, a few dark spots inside it.
      const bx = cx - bl * 0.62;
      const by = cy - bh * 0.55;
      const rx = bl * 0.55;
      const ry = bh * 0.85;
      jagged(c, r, bx, by, rx, ry, 14, 0.12, W);
      scatter(c, r, bx - rx, by - ry, bx + rx, by + ry, 3.1, [0.55, 0.95], L.body[1], (x, y) => (((x - bx) / rx) ** 2 + ((y - by) / ry) ** 2 < 0.6 ? 0.75 : 0));
      break;
    }
    case 'snowflake':
      scatter(c, r, cx - bl * 1.1, cy - bh * 1.1, cx + bl * 0.9, cy + bh, 2.6, [0.35, 0.6], W, (x, y) => (onBody(x, y) ? 0.6 : 0));
      break;
    case 'frost':
      scatter(c, r, cx - bl * 1.1, cy - bh * 1.2, cx + bl * 0.3, cy + bh * 0.2, 2, [0.3, 0.5], mix(L.body[1], W, 0.75), (x, y) => (onBody(x, y) ? 0.55 : 0));
      break;
  }
  if (L.speckle) {
    const sk = L.speckle;
    if (sk.kind === 'dapple') {
      // Dapples: light rings in a net of the base colour over barrel, shoulder and quarters,
      // fading out down the belly; head and legs stay plain.
      scatter(c, r, cx - bl * 1.1, cy - bh * 1.0, cx + bl * 0.75, cy + bh * 0.7, 3.1, [0.85, 1.25], shade(sk.color, 0.15), (x, y) => (onBody(x, y) ? 0.9 - Math.max(0, (y - cy) / bh) * 0.9 : 0));
    } else if (sk.kind === 'roan') {
      // Roan: white hairs through the body only, the head and legs stay solid.
      scatter(c, r, cx - bl * 1.05, cy - bh * 1.1, cx + bl * 0.8, cy + bh * 0.9, 1.5, [0.3, 0.5], sk.color, (x, y) => (onBody(x, y) ? Math.min(0.95, sk.density * 2.2) : 0));
    } else {
      scatter(c, r, cx - bl * 1.1, cy - bh * 1.1, cx + bl, cy + bh, 2.2, [0.3, 0.45], sk.color, (x, y) => (onBody(x, y) || Math.hypot(x - neckX, y - neckY) < 4 ? sk.density * 4 : 0));
    }
  }
  c.restore();
}

function paintGear(c: Ctx, L: Look, sx: number, sy: number, bl: number, bh: number, s: number, ntx: number, nty: number, mx: number, my: number, nbx: number, nby: number): void {
  const gear = L.gear;
  const col = (slot: string, fallback: string) => {
    const id = gear[slot];
    return id ? getItem(id).gear?.color ?? fallback : fallback;
  };
  void bl;
  if (gear.blanket) {
    // Wool blanket showing below the skirt: a band of colour with a woven stripe and a pale fringe edge.
    const bc = col('blanket', '#a8392b');
    poly(c, [[sx - 5.6 * s, sy + 0.5], [sx + 4.6 * s, sy], [sx + 4.2 * s, sy + bh * 0.95], [sx - 5.2 * s, sy + bh * 1.05]], bc);
    line(c, sx - 5.2 * s, sy + bh * 0.72, sx + 4.1 * s, sy + bh * 0.66, shade(bc, 0.35), 1);
    line(c, sx - 5.2 * s, sy + bh * 0.98, sx + 4.1 * s, sy + bh * 0.9, shade(bc, -0.45), 1);
  }
  if (gear.saddle) {
    const sc = col('saddle', '#6b4126');
    const edge = shade(sc, -0.5);
    // Skirt: a square leather pad with a dark edge so it reads on any coat.
    poly(c, [[sx - 5.2 * s, sy - 0.2], [sx + 4.3 * s, sy - 0.4], [sx + 4 * s, sy + bh * 0.55], [sx - 4.8 * s, sy + bh * 0.62]], edge);
    poly(c, [[sx - 4.6 * s, sy + 0.3], [sx + 3.7 * s, sy + 0.1], [sx + 3.5 * s, sy + bh * 0.45], [sx - 4.2 * s, sy + bh * 0.5]], shade(sc, -0.12));
    // Seat dips between a high cantle (back) and the horn (front), lit along the top.
    ellipse(c, sx, sy + 0.6, 4 * s, 1.5 * s, sc);
    line(c, sx - 2.6 * s, sy - 0.3, sx + 2.4 * s, sy - 0.3, shade(sc, 0.3), 0.9);
    poly(c, [[sx - 4.6 * s, sy - 2], [sx - 3.2 * s, sy - 0.4], [sx - 4.9 * s, sy + 0.9], [sx - 5.4 * s, sy - 1]], edge);
    px(c, sx - 4.5 * s, sy - 1.6, shade(sc, 0.3));
    line(c, sx + 3.5 * s, sy - 0.2, sx + 4.3 * s, sy - 2.6, edge, 1.3);
    px(c, sx + 4.4 * s, sy - 2.8, shade(sc, 0.25));
    // Fender and stirrup hang below the skirt.
    poly(c, [[sx - 1.5 * s, sy + 1.4], [sx + 1.5 * s, sy + 1.4], [sx + 1.1 * s, sy + bh * 1.05], [sx - 1.7 * s, sy + bh * 1.0]], shade(sc, 0.08));
    line(c, sx + 1.3 * s, sy + 1.6, sx + 0.9 * s, sy + bh * 1.02, edge, 0.8);
    rect(c, sx - 1.6 * s, sy + bh * 1.05, 2.6 * s, 1.2, '#2a1d14');
    // Cinch.
    line(c, sx + 2.4 * s, sy + bh * 0.5, sx + 2.6 * s, sy + bh * 1.35, '#3a2a1f', 1);
  }
  if (gear.bags) {
    // Saddlebags on the hip behind the cantle: a leather pouch with a darker flap and a brass buckle.
    const bc = col('bags', '#5e3a20');
    const big = gear.bags === 'bagsLarge';
    const bw2 = (big ? 4.6 : 3.8) * s;
    const bh2 = (big ? 4.4 : 3.6) * s;
    const bx = sx - 6.8 * s;
    const by = sy + bh * 0.25;
    rect(c, bx - bw2 / 2 - 0.5, by - 0.5, bw2 + 1, bh2 + 1, shade(bc, -0.5));
    rect(c, bx - bw2 / 2, by, bw2, bh2, bc);
    rect(c, bx - bw2 / 2, by, bw2, bh2 * 0.4, shade(bc, -0.3));
    px(c, bx, by + bh2 * 0.4, '#c9b27a');
  }
  if (gear.bedroll) {
    // Bedroll tied across behind the cantle: a canvas cylinder, a lit top, two leather straps.
    const rc = col('bedroll', '#6d6350');
    const rx = sx - 6.4 * s;
    const ry = sy - 0.8;
    ellipse(c, rx, ry, 2.6 * s, 1.7 * s, shade(rc, -0.45));
    ellipse(c, rx, ry, 2.2 * s, 1.35 * s, rc);
    line(c, rx - 1.6 * s, ry - 0.9 * s, rx + 1.6 * s, ry - 0.9 * s, shade(rc, 0.35), 0.8);
    for (const k of [-0.9, 0.9]) line(c, rx + k * s, ry - 1.6 * s, rx + k * s, ry + 1.5 * s, '#3a2617', 0.9);
  }
  if (gear.bridle) {
    const bc = gear.bridle === 'bridleRope' ? '#bfae88' : col('bridle', '#3a2617');
    // Cheek piece & noseband, reins to the saddle horn.
    line(c, ntx - 0.5, nty - 1, ntx + (mx - ntx) * 0.75, nty + (my - nty) * 0.75, bc, 1);
    line(c, ntx + (mx - ntx) * 0.78 - 1.2, nty + (my - nty) * 0.78 - 0.6, ntx + (mx - ntx) * 0.78 + 1.6, nty + (my - nty) * 0.78 + 1, bc, 1);
    if (gear.saddle) line(c, mx - 0.6, my, sx + 4 * s, sy - 0.8, shade(bc, -0.2), 0.8);
    if (gear.bridle === 'bridleSilver') px(c, ntx + (mx - ntx) * 0.3, nty + (my - nty) * 0.3, '#e0e0e0');
  }
  if (gear.decoration) {
    const dc = col('decoration', '#d8d8d0');
    for (let k = 1; k < 4; k++) px(c, nbx - 3 + (ntx - nbx + 2) * (k / 4), nby + (nty - nby) * (k / 4) - 1, dc);
  }
}

/**
 * Front and back views in the game's 3/4 top-down perspective.
 * Front (coming toward camera): the head and broad chest are nearest and
 * lowest on screen; the back, saddle and croup recede upward. Back (going
 * away): the round quarters and tail are nearest; neck and ears recede upward.
 * The barrel is drawn noticeably wider than the rider so the horse reads as a
 * mass the rider sits on, not a post the rider hides.
 */
function paintFrontBack(c: Ctx, L: Look, P: Proportions, view: 'front' | 'back', gait: string, t: number): { sx: number; sy: number } {
  const s = P.s;
  const sh = L.shape;
  const tau = Math.PI * 2;
  const cx = HW / 2;
  const moving = gait !== 'idle';
  const run = gait === 'run';
  // Barrel rises over each planted leg: twice per stride.
  const bob = moving ? -Math.abs(Math.sin(t * tau)) * (run ? 1.8 : 0.7) : t >= 0.5 ? 0.4 : 0;
  // Leopard Appaloosas are white all over with coat-coloured spots: paint the white as the coat.
  const [dark, mid, light] = L.body;
  const deep = shade(dark, -0.28);
  const hi = L.hi;
  const W = sh.width ?? 1;
  // Never narrower than the rider's straddle (legs hang at about +-7px from the seat).
  const bw = Math.max(9, P.bodyH * s * 1.62 * W); // half-width of the barrel
  const depth = P.bodyLen * s * 1.22; // foreshortened length of the back up the screen
  const lw = Math.max(2, P.legW * s * 1.05);
  const hoofK = sh.hoof ?? 1;
  const gy = GROUND_Y;
  const lift = (ph: number) => (moving ? Math.max(0, Math.sin((t + ph) * tau)) * (run ? 3.4 : 1.9) : 0);
  const legMark = (i: number) => L.legs[i] ?? 'none';
  const gearCol = (slot: string, fb: string) => (L.gear[slot] ? getItem(L.gear[slot]!).gear?.color ?? fb : fb);

  /** Leg seen end-on: muscled upper, knee/hock bump, fine cannon, wide hoof. */
  const fbLeg = (x: number, top: number, bottom: number, mark: string, near: boolean, upperW: number, lit: number, lifted: number) => {
    const col = near ? mid : dark;
    const len = bottom - top;
    const kneeY = top + len * 0.52;
    line(c, x, top, x, kneeY, col, upperW);
    line(c, x, kneeY, x, bottom - 1.2, col, lw);
    ellipse(c, x, kneeY + 0.3, lw * 0.62, lw * 0.5, col);
    if (near) line(c, x + lit * (upperW * 0.32), top + 0.5, x + lit * (lw * 0.3), kneeY, lit < 0 ? light : dark, 1);
    if (L.points) line(c, x, kneeY - 0.5, x, bottom - 1.2, near ? L.points : shade(L.points, -0.2), lw * 0.95);
    if (mark !== 'none') line(c, x, bottom - 1.2, x, bottom - 1 - Math.min(len * 0.55, (mark === 'coronet' ? 1 : mark === 'sock' ? 3.2 : 6.5) * s), near ? L.white : '#d8d4cc', lw * 0.95);
    if (L.feather > 0.3) {
      const fc = mark !== 'none' ? L.white : L.mane[near ? 1 : 0];
      poly(c, [[x - lw * 0.4, kneeY + 1.5], [x + lw * 0.4, kneeY + 1.5], [x + lw * (0.7 + L.feather * 0.35), bottom - 0.5], [x - lw * (0.7 + L.feather * 0.35), bottom - 0.5]], fc);
    }
    const hoofCol = mark === 'sock' || mark === 'stocking' ? '#b5a68a' : L.hoof;
    // A lifted hoof tips its dark sole toward the camera.
    ellipse(c, x, bottom - 0.9, lw * 0.58 * hoofK, 1.1, lifted > 1 ? shade(L.hoof, -0.25) : near ? hoofCol : shade(hoofCol, -0.25));
  };

  /** Mane as seen from front/back: falls to the horse's off side; style decides the shape. */
  const fbMane = (x0: number, y0: number, y1: number, fromBack: boolean) => {
    const st = L.maneStyle;
    const sparse = sh.sparse ? 0.6 : 1;
    if (st === 'roached') {
      line(c, x0, y0, x0, y1, L.mane[0], 1.2);
      return;
    }
    if (st === 'braided') {
      line(c, x0, y0, x0, y1, L.mane[0], 1.3);
      for (let yy = y0 + 1; yy < y1; yy += 2) px(c, x0 + 0.5, yy, shade(L.mane[1], 0.3));
      return;
    }
    const side = fromBack ? 1 : -1; // falls on the horse's right
    const wdt = (st === 'long' ? 3 : st === 'pulled' ? 1.3 : 2.2) * sparse * (1 + (sh.shaggy ?? 0) * 0.25) * (0.7 + L.maneLen * 0.4);
    const drop = st === 'long' ? 3.5 * L.maneLen : st === 'pulled' ? 0.5 : 1.5 * L.maneLen;
    poly(c, [[x0 - 0.5, y0], [x0 + 0.5, y0], [x0 + side * wdt * s, y1 + drop], [x0 + side * (wdt * 0.4) * s, y1 + drop * 1.2]], L.mane[0]);
    line(c, x0, y0 + 0.5, x0 + side * wdt * 0.5 * s, y1 + drop * 0.6, L.mane[1], 1);
  };

  let seat = { sx: cx, sy: 0 };

  if (view === 'front') {
    const legF = P.legLen * s * 0.8;
    const chestY = gy - legF + bob; // where the forelegs leave the chest
    // Seen from the front the back is more foreshortened than from behind: the head, not the
    // barrel, should own the silhouette.
    const croupTop = chestY - depth * 0.86; // far end of the back
    const midY = (chestY + croupTop) / 2;
    const seatY = croupTop + (chestY - croupTop) * 0.46;
    // Tail tip flicks out above the croup.
    const sw = Math.sin(t * tau) * (moving ? 2 : 1.2);
    line(c, cx + bw * 0.15 + sw * 0.4, croupTop + 2, cx + bw * 0.35 + sw * 1.4, croupTop - 1.5 - (run ? 2 : 0), L.mane[0], (sh.sparse ? 1.5 : 2.4) * s);
    // Hind legs, far: lower legs and hooves seen under the belly.
    const hindGround = gy - 4.2 * s;
    for (const [i, side, ph] of [[2, -1, 0.25], [3, 1, 0.75]] as const) fbLeg(cx + side * bw * 0.5, chestY - 3, hindGround - lift(ph) * 0.6, legMark(i), false, lw * 1.2, side, lift(ph));

    // Body silhouette: croup lobes at the top, barrel, then the shoulders.
    ellipse(c, cx - bw * 0.36, croupTop + 3.4 * s, bw * 0.5, 3.6 * s, mid);
    ellipse(c, cx + bw * 0.36, croupTop + 3.4 * s, bw * 0.5, 3.6 * s, mid);
    ellipse(c, cx, midY + 1, bw, (chestY - croupTop) / 2 - 0.5, mid);
    // Form shading, clipped to the body: lit back and near (left) flank, shadowed off flank.
    c.save();
    c.globalCompositeOperation = 'source-atop';
    ellipse(c, cx + bw * 0.95, midY + 1, bw * 0.45, depth * 0.55, dark);
    ellipse(c, cx + bw * 1.08, midY + 2, bw * 0.2, depth * 0.45, deep);
    ellipse(c, cx - bw * 0.9, midY + 1, bw * 0.28, depth * 0.45, shade(mid, -0.08));
    ellipse(c, cx - bw * 0.2, midY - 1, bw * 0.45, depth * 0.42, light);
    ellipse(c, cx - bw * 0.1, midY - 2, bw * 0.16, depth * 0.3, hi);
    ellipse(c, cx, chestY - 2, bw * 0.9, 3 * s, shade(mid, -0.08));
    ellipse(c, cx - bw * 0.42, croupTop + 2.2 * s, bw * 0.26, 1.6 * s, hi);
    ellipse(c, cx + bw * 0.42, croupTop + 2.2 * s, bw * 0.22, 1.2 * s, light);
    c.restore();
    line(c, cx, croupTop + 1.5, cx, croupTop + 4 * s, dark, 1); // croup split
    applySimplePattern(c, L, cx, midY, bw, depth, 'front');
    if (L.dorsal) line(c, cx, croupTop + 2, cx, chestY - 6, L.dorsal, 1);
    paintTackTop(c, L, cx, seatY, bw, s, 'front', gearCol);
    seat = { sx: cx, sy: seatY };

    // Shoulders and chest, nearest the camera. The chest is a vertical plane facing us, so it sits
    // a step darker than the sunlit back; only the points of the shoulders catch the light.
    const chK = sh.chest ?? 1;
    const chest = shade(mid, -0.1);
    ellipse(c, cx - bw * 0.44, chestY - 3.2 * s, bw * 0.42 * chK, 4 * s, chest);
    ellipse(c, cx + bw * 0.44, chestY - 3.2 * s, bw * 0.42 * chK, 4 * s, chest);
    ellipse(c, cx, chestY - 1.2 * s, bw * 0.55 * chK, 2.8 * s, chest);
    ellipse(c, cx - bw * 0.56, chestY - 4.6 * s, bw * 0.22, 1.8 * s, light);
    ellipse(c, cx + bw * 0.5, chestY - 4.8 * s, bw * 0.16, 1.3 * s, mid);
    ellipse(c, cx + bw * 0.66, chestY - 2.4 * s, bw * 0.2, 2.6 * s, dark);
    line(c, cx, chestY - 2.5 * s, cx, chestY + 0.5, dark, 1); // pectoral split
    // Forelegs, splayed at the shoulder points.
    for (const [i, side, ph] of [[0, -1, 0.5], [1, 1, 0]] as const) fbLeg(cx + side * bw * 0.58, chestY - 3 * s, gy - lift(ph), legMark(i), true, lw * 1.55, side < 0 ? -1 : 1, lift(ph));

    // Neck coming toward us, head hanging in front of the chest.
    const nodY = moving ? Math.sin(t * tau * 2) * (run ? 0.9 : 0.6) : 0;
    // The head hangs well down in front of the chest, the muzzle at about knee height, so it
    // reads as the nearest, most important shape (the face is what a front view is about).
    const hl = P.headLen * s * 1.72;
    const hw = P.headW * s * 1.0;
    const poll = chestY - 6 * s + nodY + (run ? 1 : 0);
    ellipse(c, cx, chestY - 6.4 * s, bw * 0.4 * (1 + (sh.crest ?? 0) * 0.15), 3.6 * s, mid);
    ellipse(c, cx - bw * 0.15, chestY - 7.4 * s, bw * 0.2, 1.6 * s, light);
    fbMane(cx + 0.5, chestY - 9.7 * s, chestY - 4.7 * s, false);
    // Ears, then the face: broad forehead and cheeks, a long narrow nasal bone, flared nostrils.
    const earUp = run ? 0.7 : 1;
    const earTip = poll - 4.6 * s * earUp;
    // Ears: a crisp 1px inner outline parts them from the back behind them (the barrel there is
    // the same colour), dark inside the cup. Dark coats get the cool rim instead of a dark line.
    const sep = L.rim ?? shade(L.body[0], -0.62);
    for (const side of [-1, 1]) {
      const ex0 = cx + side * hw * 0.15;
      const ex1 = cx + side * hw * 1.0;
      const tipX = cx + side * hw * 1.05;
      poly(c, [[ex0 - side * 0.6, poll + 1.4], [tipX + side * 0.9, earTip - 1.2], [ex1 + side * 1.2, poll + 1.4]], sep);
      poly(c, [[ex0 + side * 0.4, poll + 1], [tipX, earTip + 0.4], [ex1, poll + 1]], side < 0 ? light : mid);
      px(c, tipX - side * 0.2, poll - 0.6, side < 0 ? dark : deep);
      if (L.points) px(c, tipX, earTip + 0.8, L.points);
    }
    const dish = (sh.profile ?? 0) < 0 ? 0.82 : 1 + (sh.profile ?? 0) * 0.12;
    const face = (g: number): [number, number][] => [
      [cx - hw - g, poll + 0.4 - g],
      [cx + hw + g, poll + 0.4 - g],
      [cx + hw * 1.02 + g, poll + hl * 0.3],
      [cx + hw * 0.58 * dish + g, poll + hl * 0.66],
      [cx + hw * 0.72 * dish + g, poll + hl * 0.9],
      [cx + hw * 0.48 * dish + g, poll + hl + 0.3 + g],
      [cx - hw * 0.48 * dish - g, poll + hl + 0.3 + g],
      [cx - hw * 0.72 * dish - g, poll + hl * 0.9],
      [cx - hw * 0.58 * dish - g, poll + hl * 0.66],
      [cx - hw * 1.02 - g, poll + hl * 0.3],
    ];
    // The head casts a shadow down the chest and is rimmed so it separates from the body: a dark
    // rim on light coats, a cool sky rim along the lit (left) side on dark coats.
    ellipse(c, cx + 1, poll + hl * 0.72, hw * 1.55, hl * 0.45, deep);
    if (L.rim) poly(c, face(1.2), deep);
    poly(c, face(L.rim ? 0.8 : 1.2), sep);
    poly(c, face(0), mid);
    // Value steps down the face: lit forehead, mid nasal bone, dark soft muzzle; off cheek in shade.
    poly(c, [[cx - hw * 0.95, poll + 0.8], [cx + hw * 0.6, poll + 0.8], [cx + hw * 0.4, poll + hl * 0.38], [cx - hw * 0.5, poll + hl * 0.55], [cx - hw * 0.95, poll + hl * 0.32]], light);
    px(c, cx - hw * 0.55, poll + 1, hi);
    px(c, cx - hw * 0.2, poll + hl * 0.45, hi);
    poly(c, [[cx + hw * 0.98, poll + hl * 0.3], [cx + hw * 0.56 * dish, poll + hl * 0.68], [cx + hw * 0.3, poll + hl * 0.6], [cx + hw * 0.7, poll + hl * 0.2]], dark);
    ellipse(c, cx, poll + hl * 0.88, hw * 0.66 * dish, hw * 0.5, L.points ? mix(mid, L.points, 0.4) : shade(mid, -0.2));
    px(c, cx - hw * 0.42, poll + hl * 0.9, deep);
    px(c, cx + hw * 0.42, poll + hl * 0.9, deep);
    if (sh.mottle) px(c, cx, poll + hl * 0.98, '#c9a49a');
    // Eyes sit wide, on the corners of the forehead, with a lit brow above the near one.
    // Big dark eyes are what make a face read at a glance: 1x2 with a catch-light on the near one.
    for (const side of [-1, 1]) {
      rect(c, cx + side * hw * 0.82 - 0.5, poll + hl * 0.24, 1, 2, L.eye);
      px(c, cx + side * hw * 0.82, poll + hl * 0.24 - 1, side < 0 ? hi : dark);
    }
    px(c, cx - hw * 0.82 - 0.5, poll + hl * 0.24, shade(L.white, -0.1));
    if (L.face !== 'none') {
      const len = L.face === 'star' ? 1.2 : L.face === 'snip' ? 1 : hl * 0.85;
      const wd = L.face === 'bald' ? hw * 1.4 : L.face === 'blaze' ? 2 : 1;
      const y0 = L.face === 'snip' ? poll + hl * 0.72 : poll + hl * 0.15;
      line(c, cx, y0, cx, y0 + len, L.white, wd);
    }
    // Forelock over the brow.
    if (L.maneStyle !== 'roached') {
      const fl = L.maneStyle === 'long' || (sh.shaggy ?? 0) > 0.5 ? 1.5 : L.maneStyle === 'pulled' ? 0.7 : 1;
      poly(c, [[cx - 1.2, poll - 0.5], [cx + 1.2, poll - 0.5], [cx + 0.8, poll + hl * 0.28 * fl], [cx - 0.4, poll + hl * 0.32 * fl]], L.mane[0]);
      px(c, cx - 0.4, poll + 0.5, L.mane[1]);
    }
    if (L.gear.bridle) {
      const bc = L.gear.bridle === 'bridleRope' ? '#bfae88' : gearCol('bridle', '#3a2617');
      line(c, cx - hw * 0.62, poll + hl * 0.62, cx + hw * 0.62, poll + hl * 0.62, bc, 1);
      line(c, cx - hw * 0.95, poll + 0.8, cx - hw * 0.62, poll + hl * 0.62, bc, 0.9);
      line(c, cx + hw * 0.95, poll + 0.8, cx + hw * 0.62, poll + hl * 0.62, bc, 0.9);
      line(c, cx - hw * 0.8, poll + 0.6, cx + hw * 0.8, poll + 0.6, bc, 0.9);
      if (L.gear.bridle === 'bridleSilver') px(c, cx - hw * 0.62, poll + hl * 0.62, '#e0e0e0');
    }
  } else {
    const legB = P.legLen * s * 0.74;
    const rumpY = gy - legB + bob; // point of the buttock, nearest the camera
    const withersY = rumpY - depth;
    const midY = (rumpY + withersY) / 2;
    const seatY = withersY + depth * 0.44;
    // Front legs, far: hooves peek out under the belly.
    const foreGround = gy - 4.6 * s;
    for (const [i, side, ph] of [[0, -1, 0.75], [1, 1, 0.25]] as const) fbLeg(cx + side * bw * 0.42, rumpY - 2, foreGround - lift(ph) * 0.6, legMark(i), false, lw * 1.2, side, lift(ph));
    // Neck and head at the far end, ears pricked.
    const hw = P.headW * s * 0.8;
    const nodY = moving ? Math.sin(t * tau * 2) * 0.5 : 0;
    const poll = withersY - 6 * s + nodY;
    ellipse(c, cx, withersY - 2.2 * s, bw * 0.42 * (1 + (sh.crest ?? 0) * 0.15), 4 * s, mid);
    ellipse(c, cx, poll + 1.5, hw, 2.2 * s, mid);
    poly(c, [[cx - hw * 0.4, poll + 0.5], [cx - hw * 0.95, poll - 3.2 * s], [cx + 0.2, poll]], mid);
    poly(c, [[cx + hw * 0.4, poll + 0.5], [cx + hw * 0.95, poll - 3.2 * s], [cx - 0.2, poll]], shade(mid, -0.08));
    // Back and barrel receding up from the quarters.
    ellipse(c, cx, midY, bw * 0.98, depth * 0.5 + 1, mid);
    c.save();
    c.globalCompositeOperation = 'source-atop';
    ellipse(c, cx + bw * 0.95, midY + 1, bw * 0.42, depth * 0.55, dark);
    ellipse(c, cx + bw * 1.06, midY + 2, bw * 0.18, depth * 0.45, deep);
    ellipse(c, cx - bw * 0.3, midY - 1, bw * 0.38, depth * 0.4, light);
    ellipse(c, cx - bw * 0.25, withersY - 2.5 * s, bw * 0.15, 2 * s, light);
    c.restore();
    fbMane(cx + 0.3, poll + 2, withersY + 1, true);
    if (L.dorsal) line(c, cx, withersY + 2, cx, rumpY - 4, L.dorsal, 1);
    applySimplePattern(c, L, cx, midY, bw, depth, 'back');
    paintTackTop(c, L, cx, seatY, bw, s, 'back', gearCol, 'under');
    seat = { sx: cx, sy: seatY };
    // Hind legs (near): broad gaskins, hocks, fine cannons.
    for (const [i, side, ph] of [[2, -1, 0.25], [3, 1, 0.75]] as const) fbLeg(cx + side * bw * 0.58, rumpY - 1, gy - lift(ph), legMark(i), true, lw * 1.8, side < 0 ? -1 : 1, lift(ph));
    // Quarters: two big rounded masses split by the tail, catching light on top.
    const hk = sh.hind ?? 1;
    const qy = rumpY - 3 * s;
    ellipse(c, cx - bw * 0.48, qy, bw * 0.6 * hk, 5.4 * s, mid);
    ellipse(c, cx + bw * 0.48, qy, bw * 0.6 * hk, 5.4 * s, mid);
    c.save();
    c.globalCompositeOperation = 'source-atop';
    ellipse(c, cx - bw * 0.62, qy - 2.4 * s, bw * 0.32 * hk, 2 * s, light);
    ellipse(c, cx - bw * 0.7, qy - 3.1 * s, bw * 0.16 * hk, 1 * s, hi);
    ellipse(c, cx + bw * 0.38, qy - 2.6 * s, bw * 0.24 * hk, 1.5 * s, light);
    ellipse(c, cx + bw * 0.95 * hk, qy + 1.5 * s, bw * 0.3, 4 * s, dark);
    ellipse(c, cx, qy + 4 * s, bw * 0.75, 1.8 * s, dark);
    c.restore();
    line(c, cx, qy - 2 * s, cx, rumpY + 2.4 * s, deep, 1.2);
    applySimplePattern(c, L, cx, qy, bw, depth, 'rump');
    paintTackTop(c, L, cx, seatY, bw, s, 'back', gearCol, 'over');
    paintBackTail(c, L, cx, qy - 4 * s, s, t, moving, run, gy);
  }
  if (L.spot) {
    // Leopard spots over chest, legs and head once everything is down (tack excepted: it is
    // a different colour family, so the spot test below skips it).
    const r = new Rng(L.seed + 3);
    const sp = L.spot;
    const img = c.getImageData(0, 0, HW, HH);
    const [wr, wg, wb] = hexToRgb(L.white);
    c.save();
    for (let y = 2; y < gy; y += 3)
      for (let x = (y % 2) * 1.5 + 1; x < HW - 1; x += 3) {
        const jx = Math.round(x + (r.next() - 0.5) * 2);
        const jy = Math.round(y + (r.next() - 0.5) * 2);
        const i = (jy * HW + jx) * 4;
        const d = img.data;
        // Only on the white coat (not tack, mane or hooves).
        if (d[i + 3]! < 200 || Math.abs(d[i]! - wr) + Math.abs(d[i + 1]! - wg) + Math.abs(d[i + 2]! - wb) > 90) continue;
        if (r.next() < 0.55) ellipse(c, jx, jy, r.range(0.55, 0.95), 0.7, sp);
      }
    c.restore();
  }
  return seat;
}

/** Tack on the horse's back seen from above (front or back view). */
function paintTackTop(c: Ctx, L: Look, cx: number, seatY: number, bw: number, s: number, view: 'front' | 'back', gearCol: (slot: string, fb: string) => string, part: 'all' | 'under' | 'over' = 'all'): void {
  const toward = view === 'front' ? 1 : -1; // +1: the horn is nearer the camera (lower on screen)
  if (part !== 'under') paintTackBehind(c, L, cx, seatY, bw, s, view, gearCol, toward);
  if (part === 'over') return;
  if (L.gear.blanket) {
    const bc = gearCol('blanket', '#a8392b');
    ellipse(c, cx, seatY, bw * 0.98, 5.2 * s, bc);
    ellipse(c, cx + bw * 0.7, seatY + 0.5, bw * 0.3, 4.2 * s, shade(bc, -0.35));
    line(c, cx - bw * 0.98, seatY - 2 * s, cx - bw * 0.98, seatY + 2 * s, shade(bc, 0.35), 1);
  }
  if (L.gear.saddle) {
    const sc = gearCol('saddle', '#6b4126');
    // Skirt, fenders hanging down both flanks, seat, cantle and horn.
    ellipse(c, cx, seatY, bw * 0.78, 4.2 * s, shade(sc, -0.15));
    // Fenders lie flat against the flanks, stirrups just below.
    rect(c, cx - bw * 0.93, seatY, 2, 5 * s, shade(sc, 0.1));
    rect(c, cx + bw * 0.93 - 2, seatY, 2, 5 * s, shade(sc, -0.3));
    rect(c, cx - bw * 0.93 - 0.5, seatY + 5 * s, 3, 1, '#2a1d14');
    rect(c, cx + bw * 0.93 - 2.5, seatY + 5 * s, 3, 1, '#2a1d14');
    ellipse(c, cx, seatY, bw * 0.5, 2.6 * s, sc);
    ellipse(c, cx - bw * 0.15, seatY - 0.5, bw * 0.25, 1.2 * s, shade(sc, 0.1));
    ellipse(c, cx, seatY - toward * 3 * s, bw * 0.45, 1.2 * s, shade(sc, -0.25)); // cantle
    ellipse(c, cx, seatY + toward * 3.2 * s, 1.2 * s, 1.1 * s, shade(sc, -0.3)); // horn
  }
}

/** Bags and bedroll, the tack behind the cantle (drawn over the quarters in back view). */
function paintTackBehind(c: Ctx, L: Look, cx: number, seatY: number, bw: number, s: number, view: 'front' | 'back', gearCol: (slot: string, fb: string) => string, toward: number): void {
  if (L.gear.bags) {
    const bc = gearCol('bags', '#5e3a20');
    const big = L.gear.bags === 'bagsLarge';
    // Bags hang flat on the flanks behind the cantle: squarish leather with a flap and a buckle,
    // tall rather than round so they never read as ears from the front.
    const by = view === 'front' ? seatY + 0.5 : seatY + 3.4 * s + 1;
    const bwid = (big ? 2.2 : 1.7) * s;
    const bh2 = (big ? 3.2 : 2.6) * s;
    for (const side of [-1, 1]) {
      const x = cx + side * bw * 0.97;
      const col = side < 0 ? bc : shade(bc, -0.3);
      rect(c, x - bwid / 2, by - bh2 / 2, bwid, bh2, col);
      rect(c, x - bwid / 2, by - bh2 / 2, bwid, 1, shade(bc, side < 0 ? 0.2 : -0.1));
      px(c, x, by, '#c9b27a');
    }
  }
  if (L.gear.bedroll) {
    // A canvas roll across the loin: dark underside, lit top, two leather straps.
    const rc = gearCol('bedroll', '#6d6350');
    // Back view: it rests just above the croup, which hides the loin behind the cantle.
    const ry = view === 'front' ? seatY - 4.8 * s : seatY + 1.2 * s;
    ellipse(c, cx, ry + 0.4, bw * 0.66, 1.7 * s, shade(rc, -0.45));
    ellipse(c, cx, ry, bw * 0.62, 1.3 * s, rc);
    line(c, cx - bw * 0.5, ry - 0.8 * s, cx + bw * 0.5, ry - 0.8 * s, shade(rc, 0.35), 0.8);
    for (const k of [-0.32, 0.32]) line(c, cx + k * bw, ry - 1.5 * s, cx + k * bw, ry + 1.5 * s, '#3a2617', 1);
  }
}

/** Tail hanging between the quarters in back view, per style. */
function paintBackTail(c: Ctx, L: Look, cx: number, dockY: number, s: number, t: number, moving: boolean, run: boolean, gy: number): void {
  const sh = L.shape;
  const st = L.tailStyle;
  const sw = Math.sin(t * Math.PI * 2) * (moving ? (run ? 2.4 : 1.6) : 0.8);
  let tl = (st === 'long' ? 17 : st === 'knotted' ? 6 : st === 'banged' ? 11 : 12.5) * s;
  if (run) tl *= 0.8; // carried up and streaming back toward us
  const end = Math.min(gy - 1, dockY + tl);
  const wd = (sh.sparse ? 1.6 : st === 'braided' ? 1.8 : st === 'banged' ? 3.8 : st === 'long' ? 3.6 : 3) * s;
  ellipse(c, cx, dockY + 0.5, 1.5 * s, 1.6 * s, L.mane[0]); // dock
  if (st === 'banged') {
    poly(c, [[cx - wd * 0.3, dockY], [cx + wd * 0.3, dockY], [cx + sw + wd * 0.55, end], [cx + sw - wd * 0.55, end]], L.mane[0]);
  } else {
    line(c, cx, dockY, cx + sw, end, L.mane[0], wd);
  }
  if (st !== 'braided') line(c, cx - 0.5, dockY + 1, cx + sw * 0.8 - 0.6, end - 1.5, L.mane[1], 1);
  if (st === 'braided') for (let y = dockY + 1; y < end; y += 2) px(c, cx + sw * ((y - dockY) / (end - dockY)) + ((y | 0) % 4 ? 0.5 : -0.5), y, shade(L.mane[1], 0.25));
  if (st === 'knotted') ellipse(c, cx + sw, end, 2 * s, 1.7 * s, L.mane[0]);
}

function applySimplePattern(c: Ctx, L: Look, cx: number, cy: number, bw: number, depth: number, part: 'front' | 'back' | 'rump'): void {
  if (L.pattern === 'solid' && !L.speckle) return;
  const r = new Rng(L.seed + (part === 'rump' ? 11 : 7));
  c.save();
  c.globalCompositeOperation = 'source-atop';
  const p = L.pattern;
  const W = L.white;
  const hRange = part === 'rump' ? 5 : depth * 0.5;
  // Where the loins and hips are on screen: the far end in front view, the near end in back view.
  const loinY = part === 'front' ? cy - depth * 0.2 : part === 'back' ? cy + depth * 0.2 : cy - 2;
  if (p === 'blanket') {
    const by = part === 'rump' ? cy : part === 'front' ? cy - depth * 0.4 : cy + depth * 0.3;
    const ry = part === 'rump' ? 7 : depth * 0.42;
    jagged(c, r, cx, by, bw * 1.15, ry, 14, 0.1, W);
    scatter(c, r, cx - bw, by - ry, cx + bw, by + ry, 3.1, [0.55, 0.9], L.body[1], (x, y) => (((x - cx) / bw) ** 2 + ((y - by) / ry) ** 2 < 0.6 ? 0.7 : 0));
  }
  if (p === 'tobiano') {
    // White crossing the back as a band over the loins, wrapping down both sides.
    if (part === 'rump') ellipse(c, cx + bw * r.range(-0.5, 0.5), cy - 1, bw * 0.75, 4, W);
    else ellipse(c, cx + r.range(-1, 1), loinY, bw * 1.25, depth * 0.24, W);
  }
  if (p === 'tovero') ellipse(c, cx, cy, bw * 1.2, hRange * 1.1, W);
  if (p === 'overo' && part !== 'rump') {
    // Frame overo: ragged white low on the sides; the back stays coloured.
    jagged(c, r, cx - bw * 0.95, cy + hRange * 0.15, bw * 0.32, hRange * 0.5, 10, 0.3, W);
    jagged(c, r, cx + bw * 0.95, cy + hRange * 0.05, bw * 0.3, hRange * 0.45, 10, 0.3, W);
  }
  if (p === 'sabino' && part !== 'rump') {
    const fleck = mix(L.body[1], W, 0.7);
    for (const side of [-1, 1]) jagged(c, r, cx + side * bw * 1.02, cy + hRange * 0.2, bw * 0.16, hRange * 0.55, 9, 0.35, W);
    scatter(c, r, cx - bw, cy - hRange, cx + bw, cy + hRange, 1.8, [0.35, 0.5], fleck, (x) => Math.max(0, (Math.abs(x - cx) / bw - 0.45) * 1.1));
  }
  if (p === 'snowflake' || p === 'frost') scatter(c, r, cx - bw, cy - hRange, cx + bw, cy + hRange, 2.6, [0.35, 0.55], p === 'frost' ? mix(L.body[1], W, 0.75) : W, () => 0.55);
  if (L.speckle && p !== 'leopard') {
    const sk = L.speckle;
    if (sk.kind === 'dapple') scatter(c, r, cx - bw, cy - hRange, cx + bw, cy + hRange, 3.1, [0.85, 1.2], shade(sk.color, 0.15), (x) => 0.85 - (Math.abs(x - cx) / bw) * 0.4);
    else if (sk.kind === 'roan') scatter(c, r, cx - bw, cy - hRange, cx + bw, cy + hRange, 1.5, [0.3, 0.5], sk.color, () => Math.min(0.95, sk.density * 2.2));
    else scatter(c, r, cx - bw, cy - hRange, cx + bw, cy + hRange, 2.2, [0.3, 0.45], sk.color, () => sk.density * 4);
  }
  c.restore();
}

function paletteFor(L: Look): string[] {
  const pal = [shade(L.body[0], -0.28), L.hi, shade(L.body[1], -0.1), shade(L.body[1], -0.2), shade(L.body[1], -0.18), shade(L.body[1], 0.12), shade(L.body[1], -0.25), shade(L.mane[1], 0.18), shade(L.hoof, -0.25), '#b5a68a', shade('#b5a68a', -0.25), ...L.body, ...L.mane, L.white, L.hoof, L.eye, shade(L.body[0], -0.5), '#d8d4cc', shade(L.body[1], -0.08)];
  if (L.points) pal.push(L.points, shade(L.points, -0.2), mix(L.body[1], L.points, 0.4));
  if (L.rim) pal.push(L.rim);
  else pal.push(shade(L.body[0], -0.62));
  if (L.spot) pal.push(L.spot, shade(L.spot, -0.15));
  if (L.pattern === 'sabino') pal.push(mix(L.body[1], L.white, 0.7));
  if (L.dorsal) pal.push(L.dorsal);
  if (L.speckle) pal.push(L.speckle.color, shade(L.speckle.color, 0.15), mix(L.body[1], L.white, 0.6));
  if (L.pattern !== 'solid') pal.push(mix(L.body[1], L.white, 0.6), mix(L.body[1], L.white, 0.75));
  if (L.shape.mottle) pal.push('#c9a49a');
  pal.push(shade(L.mane[1], 0.25), shade(L.mane[1], 0.3));
  for (const slot of Object.keys(L.gear)) {
    const id = L.gear[slot];
    if (!id) continue;
    const g = getItem(id).gear;
    const c = g?.color ?? '#6b4126';
    pal.push(c, shade(c, 0.35), shade(c, -0.35), shade(c, -0.15), shade(c, 0.1), shade(c, -0.25), shade(c, -0.3), shade(c, -0.5), shade(c, -0.45), shade(c, -0.12), shade(c, 0.3), shade(c, 0.08), shade(c, 0.2));
  }
  pal.push('#c9b27a', '#bfae88', '#3a2617', '#2a1d14', '#3a2a1f', '#e0e0e0', '#a8392b', shade('#bfae88', -0.2), shade('#3a2617', -0.2));
  return pal;
}

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

const OUTLINE = '#1c130d';

/**
 * Cool rim light for dark coats: every coat pixel on the top edge of the silhouette (sky above
 * it) takes the rim colour, the way a black horse is drawn by the sky catching its topline.
 * Light pixels (white markings, pale tack) and the outline are left alone.
 */
function rimLight(c: Ctx, rim: string): void {
  const img = c.getImageData(0, 0, HW, HH);
  const d = img.data;
  const [rr, rg, rb] = hexToRgb(rim);
  const [or, og, ob] = hexToRgb(OUTLINE);
  const isBody = (i: number) => d[i + 3] === 255 && !(d[i] === or && d[i + 1] === og && d[i + 2] === ob);
  const hits: number[] = [];
  for (let y = 1; y < HH; y++)
    for (let x = 0; x < HW; x++) {
      const i = (y * HW + x) * 4;
      if (!isBody(i) || isBody(i - HW * 4)) continue;
      if ((d[i]! * 0.3 + d[i + 1]! * 0.59 + d[i + 2]! * 0.11) / 255 > 0.3) continue;
      hits.push(i);
    }
  for (const i of hits) {
    d[i] = rr;
    d[i + 1] = rg;
    d[i + 2] = rb;
  }
  c.putImageData(img, 0, 0);
}

function frame(pal: string[], paint: (c: Ctx) => { sx: number; sy: number }, rim: string | null = null): HorseFrame {
  const cv = makeCanvas(HW, HH);
  const c = ctx2d(cv);
  const a = paint(c);
  pixelise(c, HW, HH, pal, OUTLINE);
  if (rim) rimLight(c, rim);
  return { img: cv, sx: Math.round(a.sx), sy: Math.round(a.sy) };
}

/** Build (or fetch from cache) the full sprite set for a horse. */
export function horseSprites(h: HorseData): HorseSpriteSet {
  const key = horseSpriteKey(h);
  const hit = cache.get(key);
  if (hit) return hit;
  const breed = getBreed(h.breedId);
  const L = lookFor(h);
  const P = proportions(breed.body, getBreedHands(h), L.shape);
  const pal = paletteFor(L);
  const seq = (n: number, f: (t: number, i: number) => Pose) => Array.from({ length: n }, (_, i) => frame(pal, (c) => paintSide(c, L, P, f(i / n, i)), L.rim));
  const fb = (view: 'front' | 'back', gait: string, n: number) => Array.from({ length: n }, (_, i) => frame(pal, (c) => paintFrontBack(c, L, P, view, gait, i / n), L.rim));
  // Gaited breeds show their smooth running walk where other horses trot.
  const trotGait = L.gaited ? 'runwalk' : 'trot';
  const set: HorseSpriteSet = {
    side: {
      idle: seq(4, (t) => ({ gait: 'idle', t })),
      walk: seq(GAITS.walk!.frames, (t) => ({ gait: 'walk', t })),
      trot: seq(GAITS[trotGait]!.frames, (t) => ({ gait: trotGait, t })),
      canter: seq(GAITS.canter!.frames, (t) => ({ gait: 'canter', t })),
      gallop: seq(GAITS.gallop!.frames, (t) => ({ gait: 'gallop', t })),
      graze: seq(4, (t, i) => ({ gait: 'idle', t, graze: i < 2 ? 0.92 : 1 })),
      rear: seq(4, (_t, i) => ({ gait: 'idle', t: 0, rear: [0.4, 0.8, 1, 0.6][i]! })),
      jump: seq(5, (t) => ({ gait: 'idle', t: 0, jump: t + 0.1 })),
      lie: seq(2, (t) => ({ gait: 'idle', t, lie: true })),
      buck: seq(4, (_t, i) => ({ gait: 'idle', t: 0, buck: [0.5, 1, 0.7, 0.2][i]! })),
    },
    front: { idle: fb('front', 'idle', 2), walk: fb('front', 'walk', 4), run: fb('front', 'run', 4) },
    back: { idle: fb('back', 'idle', 2), walk: fb('back', 'walk', 4), run: fb('back', 'run', 4) },
  };
  if (cache.size > 60) cache.delete(cache.keys().next().value!);
  cache.set(key, set);
  return set;
}
