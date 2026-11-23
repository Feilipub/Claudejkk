/**
 * Static world object sprites (trees, cacti, rocks, fences, furniture…).
 * Each object type has a few seeded variants; sprites are anchored at the
 * bottom-centre of their tile.
 */
import { Rng } from '../core/rng.ts';
import { O } from '../world/tiles.ts';
import { ctx2d, ellipse, line, makeCanvas, pixelise, poly, px, rect, shade, type Ctx } from './pixel.ts';

export interface PropSprite {
  img: HTMLCanvasElement | OffscreenCanvas;
  /** Offset from tile's top-left to draw the image. */
  ox: number;
  oy: number;
  /** Shadow ellipse radius (0 = none). */
  shadow: number;
}

type Painter = (c: Ctx, w: number, h: number, r: Rng, variant: number) => void;

interface Spec {
  w: number;
  h: number;
  paint: Painter;
  shadow: number;
  outline?: string | null;
  palette?: string[];
}

/**
 * Volumetric foliage: many small leaf clusters arranged on an ellipsoid and
 * lit from the upper-left, each clump with its own rim highlight and shadowed
 * underside — the "cluster" technique pixel artists use for tree canopies.
 */
function blob(c: Ctx, x: number, y: number, rx: number, ry: number, cols: [string, string, string], r: Rng, n = 7): void {
  const base = cols[1];
  const tones = [shade(cols[0], -0.35), cols[0], base, cols[2], shade(cols[2], 0.3)];
  // Core shadow mass so gaps read as depth, not holes.
  ellipse(c, x, y + ry * 0.08, rx * 0.96, ry * 0.92, tones[0]!);
  const clumps: { x: number; y: number; r: number; t: number }[] = [];
  const count = Math.max(10, Math.round((rx * ry) / 9) + n);
  for (let i = 0; i < count; i++) {
    const a = r.range(0, Math.PI * 2);
    const d = Math.sqrt(r.next()) * 0.85;
    const cx = x + Math.cos(a) * rx * d;
    const cy = y + Math.sin(a) * ry * d;
    const nx = (cx - x) / rx;
    const ny = (cy - y) / ry;
    const lit = -nx * 0.55 - ny * 0.85 + (1 - d) * 0.35 + r.range(-0.25, 0.25);
    const t = lit > 0.7 ? 4 : lit > 0.3 ? 3 : lit > -0.15 ? 2 : lit > -0.55 ? 1 : 0;
    clumps.push({ x: cx, y: cy, r: r.range(2.2, 3.6) * Math.min(1.3, rx / 10), t });
  }
  clumps.sort((a, b) => a.y - b.y);
  for (const k of clumps) {
    ellipse(c, k.x, k.y + 0.6, k.r, k.r * 0.8, tones[Math.max(0, k.t - 1)]!);
    ellipse(c, k.x - 0.4, k.y - 0.2, k.r * 0.85, k.r * 0.65, tones[k.t]!);
    if (k.t >= 3) px(c, k.x - k.r * 0.4, k.y - k.r * 0.45, tones[Math.min(4, k.t + 1)]!);
  }
}

/** Tapered trunk with root flare: lit left edge, shaded right edge, bark notches. */
function trunk(c: Ctx, x: number, yBase: number, yTop: number, w: number, P: readonly [string, string, string], r: Rng): void {
  const [dk, md, lt] = P;
  poly(c, [[x - w / 2 - 2, yBase], [x - w / 2, yBase - 3], [x + w / 2, yBase - 3], [x + w / 2 + 2, yBase]], dk);
  rect(c, x - w / 2, yTop, w, yBase - yTop, md);
  rect(c, x - w / 2, yTop, 1, yBase - yTop, lt);
  rect(c, x + w / 2 - 1, yTop, 1, yBase - yTop, dk);
  for (let y = yTop + 2; y < yBase - 2; y += r.int(2, 4)) px(c, x - w / 2 + 1 + r.int(0, Math.max(0, w - 3)), y, dk);
}

/**
 * Faceted rock: lit top plane, mid front plane, cool shadow side, a crack.
 * P = [base/underside, front, top light, shadow side].
 */
function rock(c: Ctx, cx: number, by: number, rx: number, ry: number, P: readonly string[], r: Rng, strata = false): void {
  const top: [number, number][] = [];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (i / (n - 1)) * Math.PI;
    top.push([cx + Math.cos(a) * (rx + r.range(-1.5, 1) * rx / 10), by - ry * 0.6 + Math.sin(a) * (ry + r.range(-1.5, 1.5) * ry / 9)]);
  }
  const k = rx / 10;
  poly(c, [[cx - rx - 0.5, by - ry * 0.55], ...top, [cx + rx + 0.5, by - ry * 0.55], [cx + rx - 1, by], [cx - rx + 1, by]], P[0]!);
  poly(c, [[cx - rx + 0.5, by - ry * 0.65], ...top.slice(0, 5), [cx + 2 * k, by - ry * 0.75]], P[1]!);
  poly(c, [[cx - 7 * k, by - ry], top[1]!, top[2]!, top[3]!, [cx - k, by - ry * 1.2]], P[2]!);
  poly(c, [[cx + 2 * k, by - ry * 0.75], top[5]!, top[6]!, [cx + rx + 0.5, by - ry * 0.55], [cx + rx - 1, by - 1], [cx + 3 * k, by - 1]], P[3]!);
  if (strata) for (let s = 0; s < 3; s++) line(c, cx - rx + 1, by - 2 - s * ry * 0.3, cx + rx - 1, by - 1.5 - s * ry * 0.3, shade(P[1]!, -0.18), 0.6);
  line(c, cx - 2 * k, by - ry * 1.3, cx + k, by - ry * 0.55, shade(P[0]!, -0.3), 1);
  line(c, cx + k, by - ry * 0.55, cx - k, by - 1, shade(P[0]!, -0.3), 1);
  px(c, cx - 5 * k, by - ry * 1.3, shade(P[2]!, 0.3));
}

const SPECS: Partial<Record<number, Spec>> = {
  [O.Pine]: {
    w: 30, h: 52, shadow: 8,
    paint: (c, w, h, r, variant) => {
      // Variants: 0 lodgepole (classic), 1 tall spire fir, 2 ponderosa (open crown, cinnamon bark).
      const v = variant % 3;
      const cx = w / 2;
      const pond = v === 2;
      const bark: [string, string, string] = pond ? ['#5a2e1c', '#8a4a2a', '#b0683c'] : ['#3a2418', '#4a3022', '#6a4630'];
      trunk(c, cx, h - 1, h - (pond ? 16 : 11), pond ? 4 : 3, bark, r);
      const tones = pond ? ['#1a2c1c', '#25402a', '#345a32', '#4a7a3e', '#78a052'] : ['#14261a', '#1f3a24', '#2c4f2c', '#3f6a36', '#68904a'];
      const tiers = v === 1 ? 8 : pond ? 5 : 6;
      const step = v === 1 ? 5.2 : pond ? 6 : 6;
      const base = pond ? h - 14 : h - 8;
      const width = v === 1 ? 10 : pond ? 13 : 12;
      for (let i = 0; i < tiers; i++) {
        const y = base - i * step;
        const half = width - i * (width / (tiers + 0.6)) + r.range(-0.8, 0.8);
        // Jagged bough silhouette: a fan of needle tips, shaded left (lit) to right (shade).
        for (let k = -half; k <= half; k += 1.5) {
          const tipY = y + r.range(-1, 1.5) - Math.abs(k) * (pond ? 0.3 : 0.15);
          const t = k < -half * 0.35 ? 3 : k < half * 0.25 ? 2 : 1;
          line(c, cx, y - 8, cx + k, tipY, tones[t]!, 1.4);
        }
        poly(c, [[cx - half * 0.7, y - 1], [cx + half * 0.7, y - 1], [cx, y - 9]], tones[2]!);
        line(c, cx - half * 0.7, y, cx + half * 0.7, y, tones[0]!, 1);
        for (let k = 0; k < 3; k++) px(c, cx - half * 0.5 + r.range(0, half * 0.5), y - r.range(2, 6), tones[4]!);
        // Ponderosa: bough gaps show the bark between tiers.
        if (pond && i > 0) rect(c, cx - 1, y - 1, 2, 2, bark[1]);
      }
      const topY = base - tiers * step;
      poly(c, [[cx - 2, topY + 2], [cx + 2, topY + 2], [cx, topY - 5]], tones[2]!);
      px(c, cx - 1, topY - 2, tones[4]!);
    },
  },
  [O.SnowPine]: {
    w: 26, h: 44, shadow: 8,
    paint: (c, w, h, r) => {
      const cx = w / 2;
      rect(c, cx - 1.5, h - 10, 3, 10, '#4a3022');
      for (let i = 0; i < 5; i++) {
        const y = h - 8 - i * 7;
        const half = 11 - i * 1.9 + r.range(-1, 1);
        poly(c, [[cx - half, y], [cx + half, y], [cx, y - 11]], '#1f3426');
        poly(c, [[cx - half, y], [cx + half * 0.2, y - 2], [cx, y - 10]], '#e8eef2');
        poly(c, [[cx - half * 0.6, y - 2], [cx - 1, y - 2], [cx - 1, y - 8]], '#ffffff');
      }
    },
  },
  [O.Oak]: {
    w: 40, h: 44, shadow: 13,
    paint: (c, w, h, r, variant) => {
      // Variants contrast in size, shape and hue so a plain of oaks does not repeat:
      // 0 big broad bur oak, 1 young oak (small, low, fresh green), 2 wind-bent olive oak.
      const v = variant % 3;
      const cx = w / 2;
      const bark = ['#3a281c', '#563c28', '#7a5a3c'] as const;
      const L: [string, string, string] = v === 0 ? ['#2e4220', '#46602d', '#6c8a42'] : v === 1 ? ['#2a4428', '#41623a', '#6c9050'] : ['#384a1e', '#566c2c', '#869a46'];
      if (v === 0) {
        trunk(c, cx, h - 1, h - 17, 5, bark, r);
        line(c, cx, h - 14, cx - 10, h - 22, bark[1], 2.4);
        line(c, cx, h - 15, cx + 10, h - 23, bark[1], 2.4);
        blob(c, cx - 9, h - 26, 9, 7.5, L, r, 5);
        blob(c, cx + 9, h - 27, 9, 7.5, L, r, 5);
        blob(c, cx, h - 31, 12, 9, L, r, 8);
      } else if (v === 1) {
        trunk(c, cx, h - 1, h - 10, 3, bark, r);
        line(c, cx, h - 8, cx + 5, h - 12, bark[1], 1.6);
        blob(c, cx - 1, h - 19, 9, 8, L, r, 6);
        blob(c, cx + 5, h - 13, 4.5, 3.5, L, r, 3);
      } else {
        trunk(c, cx - 2, h - 1, h - 12, 4, bark, r);
        line(c, cx - 2, h - 11, cx + 6, h - 21, bark[1], 2.6);
        line(c, cx - 2, h - 13, cx - 9, h - 19, bark[1], 1.6);
        blob(c, cx + 4, h - 27, 13, 9, L, r, 8);
        blob(c, cx - 10, h - 21, 6, 5, L, r, 3);
      }
    },
  },
  [O.Cottonwood]: {
    w: 42, h: 50, shadow: 13,
    paint: (c, w, h, r, variant) => {
      // Big riverside trees with pale furrowed bark. 0 triple-domed, 1 tall forked, 2 broad with a dead limb.
      const v = variant % 3;
      const cx = w / 2;
      const bark = ['#4a4038', '#7a6e62', '#a89c8a'] as const;
      const L: [string, string, string] = v === 1 ? ['#3e5a30', '#5e8040', '#92b060'] : v === 2 ? ['#4e5e26', '#768a36', '#aebc5a'] : ['#4a5e2a', '#6f8a3a', '#a2b65a'];
      if (v === 0) {
        trunk(c, cx, h - 1, h - 18, 5, bark, r);
        line(c, cx - 1, h - 15, cx - 9, h - 26, bark[1], 2.2);
        line(c, cx, h - 15, cx + 9, h - 28, bark[1], 2.2);
        blob(c, cx - 7, h - 30, 10, 9, L, r, 6);
        blob(c, cx + 8, h - 31, 10, 10, L, r, 6);
        blob(c, cx, h - 37, 10, 8, L, r, 5);
      } else if (v === 1) {
        trunk(c, cx, h - 1, h - 20, 5, bark, r);
        line(c, cx - 1, h - 18, cx - 5, h - 30, bark[1], 2.4);
        line(c, cx + 1, h - 18, cx + 5, h - 32, bark[1], 2.4);
        blob(c, cx - 5, h - 32, 9, 10, L, r, 5);
        blob(c, cx + 5, h - 36, 9, 11, L, r, 6);
        blob(c, cx - 1, h - 24, 7, 5, L, r, 3);
      } else {
        trunk(c, cx + 1, h - 1, h - 15, 6, bark, r);
        // A bare, silvered dead limb — cottonwoods shed them.
        line(c, cx, h - 14, cx - 14, h - 30, '#9a9284', 1.6);
        line(c, cx - 10, h - 25, cx - 15, h - 25, '#9a9284', 1);
        line(c, cx + 1, h - 13, cx + 11, h - 24, bark[1], 2.4);
        blob(c, cx + 5, h - 28, 13, 10, L, r, 8);
        blob(c, cx - 3, h - 34, 9, 7, L, r, 5);
      }
    },
  },
  [O.Aspen]: {
    w: 26, h: 44, shadow: 7,
    paint: (c, w, h, r, variant) => {
      // Slim white trunks with a few black "eyes", always under one shared crown so a
      // grove reads as a tree mass, never as a row of posts. 0 single spire,
      // 1 fall-gold pair splaying from one root, 2 clonal grove at three depths.
      const v = variant % 3;
      const cx = w / 2;
      const L: [string, string, string] = v === 1 ? ['#8a6a1e', '#c8a032', '#f4d860'] : v === 2 ? ['#40582a', '#62803a', '#98b058'] : ['#5e7a2a', '#8aa63a', '#c4d466'];
      const stem = (x0: number, y0: number, x1: number, y1: number, wd: number, back: boolean) => {
        line(c, x0, y0, x1, y1, back ? '#b8b4a8' : '#e2ded2', wd);
        line(c, x0 + wd * 0.35, y0, x1 + wd * 0.35, y1, back ? '#8e8a82' : '#a8a49a', 0.8);
        const eyes = back ? 1 : r.int(1, 2);
        for (let k = 0; k < eyes; k++) {
          const t = r.range(0.2, 0.7);
          rect(c, x0 + (x1 - x0) * t - 0.6, y0 + (y1 - y0) * t, 2, 1, '#2e2a28');
        }
      };
      if (v === 0) {
        stem(cx, h - 1, cx + 1, h - 22, 2.4, false);
        blob(c, cx + 1, h - 30, 7, 12, L, r, 7);
      } else if (v === 1) {
        poly(c, [[cx - 3, h - 1], [cx, h - 4], [cx + 3, h - 1]], '#8e8a82');
        stem(cx, h - 2, cx - 6, h - 19, 2.4, false);
        stem(cx, h - 2, cx + 5, h - 23, 2.2, false);
        blob(c, cx + 4, h - 31, 8, 9, L, r, 6);
        blob(c, cx - 5, h - 26, 8, 8, L, r, 5);
      } else {
        // Grove: back stems thin and grey (further away), a low shared crown, and an
        // understory of saplings and shrubs hiding the stem bases so the grove sits on
        // the ground as one mass instead of standing on white "legs".
        stem(cx + 6, h - 6, cx + 7, h - 20, 1.6, true);
        stem(cx - 6, h - 6, cx - 8, h - 18, 1.5, true);
        stem(cx - 1, h - 1, cx + 1, h - 18, 2.6, false);
        blob(c, cx + 4, h - 26, 9, 10, L, r, 6);
        blob(c, cx - 6, h - 21, 7, 8, L, r, 5);
        blob(c, cx + 1, h - 18, 8, 6, L, r, 6);
        const U: [string, string, string] = ['#34481e', '#4e6a2a', '#7a9440'];
        blob(c, cx - 7, h - 5, 5, 3.6, U, r, 3);
        blob(c, cx + 7, h - 5, 5.5, 3.8, U, r, 3);
      }
    },
  },
  [O.DeadTree]: {
    w: 28, h: 36, shadow: 5,
    paint: (c, w, h, r, variant) => {
      // Weathered snags: 0 forked, 1 broken stub with a woodpecker hollow, 2 twisted silver with twigs.
      const v = variant % 3;
      const cx = w / 2;
      const dk = '#4e4238';
      const md = v === 2 ? '#9a9286' : '#6e6052';
      const lt = v === 2 ? '#c8c2b4' : '#8e8070';
      const limb = (x1: number, y1: number, x2: number, y2: number, wd: number) => {
        line(c, x1, y1, x2, y2, md, wd);
        line(c, x1 - 0.5, y1, x2 - 0.5, y2, lt, Math.max(0.6, wd * 0.35));
      };
      if (v === 0) {
        limb(cx, h - 1, cx + r.range(-1, 1), h - 25, 3);
        limb(cx, h - 14, cx - 7, h - 24, 1.6);
        limb(cx, h - 18, cx + 8, h - 28, 1.6);
        limb(cx - 5, h - 21, cx - 9, h - 22, 1);
        limb(cx + 6, h - 25, cx + 6, h - 31, 1);
      } else if (v === 1) {
        poly(c, [[cx - 3, h - 1], [cx - 2.5, h - 18], [cx - 1, h - 21], [cx, h - 17], [cx + 1.5, h - 20], [cx + 3, h - 1]], md);
        rect(c, cx - 3, h - 18, 1, 17, lt);
        rect(c, cx + 2, h - 18, 1, 17, dk);
        ellipse(c, cx, h - 12, 1, 1.5, '#1e1612');
        limb(cx + 2, h - 10, cx + 7, h - 14, 1.4);
        poly(c, [[cx - 5, h - 1], [cx - 3, h - 4], [cx + 3, h - 4], [cx + 5, h - 1]], dk);
      } else {
        limb(cx, h - 1, cx - 2, h - 12, 3);
        limb(cx - 2, h - 12, cx + 1, h - 22, 2.4);
        limb(cx + 1, h - 22, cx - 1, h - 30, 1.6);
        limb(cx - 2, h - 14, cx - 9, h - 20, 1.4);
        limb(cx - 9, h - 20, cx - 11, h - 26, 1);
        limb(cx + 1, h - 19, cx + 9, h - 23, 1.4);
        limb(cx + 9, h - 23, cx + 12, h - 29, 1);
        for (let k = 0; k < 6; k++) {
          const x = cx + r.range(-11, 11);
          const y = h - r.range(22, 33);
          line(c, x, y, x + r.range(-2, 2), y - r.range(1, 3), md, 0.7);
        }
      }
    },
  },
  [O.Juniper]: {
    w: 26, h: 32, shadow: 9,
    paint: (c, w, h, r, variant) => {
      // Blue-green scale foliage with dusty berries. 0 squat round, 1 twisted shaggy two-lobed, 2 conical.
      const v = variant % 3;
      const cx = w / 2;
      const L: [string, string, string] = ['#2f4130', '#4a5e44', '#71856a'];
      const bark = ['#4a3426', '#6a4a34', '#9a7454'] as const;
      if (v === 0) {
        trunk(c, cx - 1, h - 1, h - 7, 3, bark, r);
        blob(c, cx, h - 12, 10, 8, L, r, 7);
      } else if (v === 1) {
        line(c, cx, h - 1, cx - 3, h - 9, bark[1], 3);
        line(c, cx - 3, h - 9, cx + 3, h - 14, bark[1], 2.2);
        line(c, cx - 2.5, h - 2, cx - 3.5, h - 9, bark[2], 0.8);
        blob(c, cx - 5, h - 13, 7, 6, L, r, 4);
        blob(c, cx + 4, h - 18, 7, 6, L, r, 4);
      } else {
        trunk(c, cx, h - 1, h - 5, 3, bark, r);
        for (let i = 0; i < 4; i++) blob(c, cx, h - 8 - i * 5, 7 - i * 1.4, 4.5, L, r, 3);
      }
      for (let k = 0; k < 5; k++) px(c, cx + r.range(-5, 5) + (v === 1 ? (k % 2 ? 4 : -5) : 0), h - r.range(10, v === 2 ? 20 : 15), '#8a9ac0');
    },
  },
  [O.Saguaro]: {
    w: 20, h: 36, shadow: 5,
    paint: (c, w, h, r) => {
      // Muted desert green with vertical ribs: lit left rib, shadowed right, spines as pale dots.
      const cols = ['#33503c', '#4b6a4a', '#647f58', '#8aa070'];
      const column = (x0: number, yTop: number, yBot: number, wd: number) => {
        rect(c, x0 - wd / 2, yTop, wd, yBot - yTop, cols[1]!);
        rect(c, x0 - wd / 2, yTop, 1, yBot - yTop, cols[2]!);
        rect(c, x0 - wd / 2 + 1, yTop, 1, yBot - yTop, cols[3]!);
        rect(c, x0 + wd / 2 - 1, yTop, 1, yBot - yTop, cols[0]!);
        ellipse(c, x0, yTop, wd / 2, wd / 2.4, cols[2]!);
        for (let y = yTop + 2; y < yBot; y += 3) px(c, x0 - 1 + ((y / 3) % 2), y, '#d8d0b0');
      };
      const cx = w / 2;
      column(cx, h - 31, h - 1, 5);
      const arm = (dir: number, y: number, len: number) => {
        rect(c, cx + dir * 2, y, dir * 4, 3, cols[1]!);
        rect(c, cx + dir * 2, y + 2, dir * 4, 1, cols[0]!);
        column(cx + dir * 6, y - len, y + 3, 4);
      };
      arm(-1, h - 13 - r.int(0, 5), r.int(5, 9));
      if (r.chance(0.75)) arm(1, h - 18 - r.int(0, 4), r.int(4, 8));
      if (r.chance(0.4)) for (let k = 0; k < 3; k++) px(c, cx - 1 + k, h - 32, '#e8e0a8');
    },
  },
  [O.PricklyPear]: {
    w: 18, h: 15, shadow: 5,
    paint: (c, w, h, r) => {
      const pad = (x: number, y: number, rx: number, ry: number) => {
        ellipse(c, x, y, rx, ry, '#4d6b48');
        ellipse(c, x - 0.6, y - 0.6, rx * 0.75, ry * 0.7, '#68845a');
        px(c, x - rx * 0.4, y - ry * 0.4, '#8fa476');
        px(c, x + 1, y, '#d8d0b0');
      };
      pad(w / 2, h - 4, 4, 3.4);
      pad(w / 2 - 4.5, h - 7, 3, 3);
      pad(w / 2 + 3.5, h - 9, 3, 3.4);
      if (r.chance(0.6)) {
        px(c, w / 2 + 3, h - 13, '#c94a6a');
        px(c, w / 2 - 5, h - 10, '#d8a040');
      }
    },
  },
  [O.Cactus2]: {
    w: 16, h: 18, shadow: 4,
    paint: (c, w, h, r) => {
      // Teddy-bear cholla: short jointed segments wrapped in a silvery halo of spines.
      const seg = (x1: number, y1: number, x2: number, y2: number) => {
        line(c, x1, y1, x2, y2, '#8a8f6a', 3.2);
        line(c, x1 - 0.6, y1, x2 - 0.6, y2, '#b8bc98', 1.2);
        px(c, x2, y2 - 1, '#e2e0c8');
      };
      const cx = w / 2;
      line(c, cx, h - 1, cx, h - 4, '#5a5440', 2);
      seg(cx, h - 4, cx, h - 9);
      seg(cx, h - 8, cx - 4, h - 12 - r.int(0, 2));
      seg(cx, h - 9, cx + 4, h - 14);
      seg(cx + 4, h - 14, cx + 5, h - 16);
    },
  },
  [O.Sage]: {
    w: 18, h: 14, shadow: 5, outline: '#3b3a2a',
    paint: (c, w, h, r, variant) => {
      // Big sagebrush: woody grey stems under silvery, ragged-topped clumps (reads as shrub, not stone).
      for (let i = 0; i < 5; i++) line(c, w / 2 + r.range(-2, 2), h - 1, w / 2 + r.range(-6, 6), h - r.range(4, 7), '#5e5446', 1);
      const L: [string, string, string] = variant % 3 === 1 ? ['#62705c', '#86957c', '#b4c0a2'] : ['#6f7a62', '#8f9a7f', '#b8bfa5'];
      blob(c, w / 2 - 2, h - 7, 5, 3.6, L, r, 4);
      blob(c, w / 2 + 3, h - 8, 4.5, 3.4, L, r, 3);
      for (let k = 0; k < 6; k++) {
        const x = w / 2 + r.range(-6, 6);
        line(c, x, h - 9, x + r.range(-1, 1), h - 11 - r.range(0, 2), L[2], 0.8);
      }
      if (variant % 3 === 2) for (let k = 0; k < 4; k++) px(c, w / 2 + r.range(-5, 5), h - r.range(9, 12), '#d8c870');
    },
  },
  [O.Creosote]: {
    w: 16, h: 14, shadow: 5, outline: '#3a3a20',
    paint: (c, w, h, r, variant) => {
      for (let i = 0; i < 5; i++) line(c, w / 2, h - 1, w / 2 + r.range(-6, 6), h - r.range(7, 12), '#5a4a32', 1);
      blob(c, w / 2, h - 8, 6, 4, ['#4a5a2a', '#6a7a3a', '#8a9a4a'], r, 4);
      if (variant % 3 === 1) for (let k = 0; k < 4; k++) px(c, w / 2 + r.range(-5, 5), h - r.range(8, 12), '#f0d040');
    },
  },
  [O.Bush]: {
    w: 20, h: 16, shadow: 6,
    paint: (c, w, h, r, variant) => {
      // 0 green scrub oak, 1 wild rose in bloom, 2 golden-flowered rabbitbrush.
      const v = variant % 3;
      if (v === 0) {
        blob(c, w / 2, h - 6, 7.5, 5, ['#3a4a24', '#56693a', '#7a8e52'], r, 6);
        blob(c, w / 2 + 4, h - 5, 4, 3, ['#3a4a24', '#56693a', '#7a8e52'], r, 3);
      } else if (v === 1) {
        blob(c, w / 2, h - 6, 7, 5, ['#2f4a26', '#4a6a36', '#6e9050'], r, 6);
        for (let i = 0; i < 7; i++) {
          const x = w / 2 + r.range(-5, 5);
          const y = h - 6 + r.range(-4, 2);
          px(c, x, y, '#e07a98');
          px(c, x + 1, y, '#f4b4c8');
          if (i % 3 === 0) px(c, x, y - 1, '#fff0e8');
        }
      } else {
        for (let i = 0; i < 6; i++) line(c, w / 2, h - 1, w / 2 + r.range(-7, 7), h - r.range(5, 9), '#6a6a4a', 1);
        blob(c, w / 2, h - 7, 7.5, 4.5, ['#5a6a42', '#7c8a5a', '#a2ac7a'], r, 5);
        for (let i = 0; i < 9; i++) {
          const x = w / 2 + r.range(-6, 6);
          const y = h - 9 + r.range(-3, 1);
          px(c, x, y, '#d8a828');
          px(c, x, y - 1, '#f4d258');
        }
      }
    },
  },
  [O.BerryBush]: {
    w: 18, h: 14, shadow: 6,
    paint: (c, w, h, r) => {
      blob(c, w / 2, h - 6, 7, 5, ['#34451f', '#4f6534', '#6f874a'], r, 6);
      for (let i = 0; i < 6; i++) {
        const x = w / 2 + r.range(-5, 5);
        const y = h - 6 + r.range(-4, 2);
        rect(c, x, y, 1, 1, '#6a1a2a');
        px(c, x, y - 1, '#c8405a');
      }
    },
  },
  [O.GrassTuft]: {
    w: 14, h: 14, shadow: 0, outline: null,
    paint: (c, w, h, r, variant) => {
      // 0 bunchgrass, 1 foxtail with pale seed plumes, 2 bunchgrass with lupine spikes.
      const v = variant % 3;
      // Variants differ in height and spread as well as colour: low wide green mound,
      // tall golden foxtail, medium lush bunch with lupines.
      const cols = v === 1 ? ['#6a5e2a', '#8a7c3a', '#aa9a4a', '#d0c072'] : v === 2 ? ['#30481f', '#46642a', '#5e8034', '#86a24c'] : ['#3d5226', '#55702f', '#728f3c', '#9cb25a'];
      const [tMin, tMax, spread] = v === 0 ? [3, 6, 6] : v === 1 ? [8, 12, 3] : [5, 9, 4.5];
      ellipse(c, w / 2, h - 1.5, v === 0 ? 5 : 4, 1.6, cols[0]!);
      for (let i = 0; i < (v === 0 ? 12 : 9); i++) {
        const bx = w / 2 + r.range(-3, 3);
        const lean = r.range(-spread, spread);
        const top = h - r.range(tMin, tMax);
        c.strokeStyle = cols[1 + (i % 3)]!;
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(bx, h - 1);
        c.quadraticCurveTo(bx + lean * 0.3, (h + top) / 2, bx + lean, top);
        c.stroke();
        if (v === 1 && i % 2 === 0) {
          line(c, bx + lean, top, bx + lean * 1.3, top - 2.5, '#e8dcae', 1.2);
          px(c, bx + lean * 1.3, top - 3, '#fff4d0');
        }
      }
      if (v === 2) {
        for (const dx of [-2, 2]) {
          const x = w / 2 + dx;
          line(c, x, h - 2, x, h - 7, '#3f5a2c', 1);
          px(c, x, h - 8, '#4a3f8e');
          px(c, x, h - 9, '#6a62c0');
          px(c, x, h - 10, '#6a62c0');
          px(c, x, h - 11, '#a8a2ea');
        }
      } else if (v === 0 && r.chance(0.5)) px(c, w / 2 + r.range(-3, 3), h - 9, '#d8c870');
    },
  },
  [O.Reeds]: {
    w: 12, h: 16, shadow: 0, outline: null,
    paint: (c, w, h, r) => {
      for (let i = 0; i < 6; i++) {
        const x = w / 2 + r.range(-4, 4);
        const top = h - r.range(9, 14);
        line(c, x, h - 1, x + r.range(-1, 1), top, '#5e7a3a', 1);
        if (i % 2 === 0) rect(c, x - 0.5, top, 1.5, 3, '#5a3a22');
      }
    },
  },
  [O.Boulder]: {
    w: 30, h: 24, shadow: 10,
    paint: (c, w, h, r, variant) => {
      // Granite up north (0–2), sandstone in the desert and canyons (3–5).
      // Shapes: 0/3 single faceted rock, 1/4 split pair, 2 mossy dome / 5 bedded slab.
      const warm = variant >= 3;
      const v = variant % 3;
      const P = warm ? ['#7a4e3a', '#b07a52', '#cf9b6c', '#5e3a32'] : ['#5d5a62', '#8d877e', '#aca394', '#4e4b56'];
      const cx = w / 2;
      const by = h - 3;
      if (v === 0) rock(c, cx, by, 10, 9, P, r, warm);
      else if (v === 1) {
        rock(c, cx - 5, by - 1, 7.5, 8, P, r, warm);
        rock(c, cx + 6, by, 6, 5.5, P, r, warm);
      } else if (!warm) {
        // Rounded glacial erratic with a moss cap.
        ellipse(c, cx, by - 6, 11, 7.5, P[0]!);
        ellipse(c, cx - 1, by - 7, 10, 6.5, P[1]!);
        ellipse(c, cx + 5, by - 5, 5, 5, P[3]!);
        ellipse(c, cx - 3, by - 10, 6, 3, P[2]!);
        ellipse(c, cx - 2, by - 12, 5, 1.8, '#6a7a44');
        for (let k = 0; k < 5; k++) px(c, cx - 7 + r.range(0, 10), by - 12 + r.range(-1, 2), '#8a9a56');
        line(c, cx + 2, by - 11, cx + 4, by - 3, shade(P[0]!, -0.3), 1);
        px(c, cx - 6, by - 10, shade(P[2]!, 0.3));
      } else {
        // Flat-bedded sandstone slab: stacked ledges, each lit on top and undercut below.
        for (let s = 0; s < 3; s++) {
          const y = by - s * 4;
          const half = 12 - s * 2.5 + r.range(-1, 1);
          const off = r.range(-1.5, 1.5);
          rect(c, cx - half + off, y - 4, half * 2, 4, P[1]!);
          rect(c, cx - half + off, y - 4, half * 2, 1, P[2]!);
          rect(c, cx - half + off, y - 1, half * 2, 1, P[0]!);
          rect(c, cx + half + off - 3, y - 4, 3, 4, P[3]!);
        }
        px(c, cx - 6, by - 12, shade(P[2]!, 0.3));
      }
      for (let i = 0; i < 4; i++) px(c, cx - 6 + r.range(0, 7), by - r.range(2, 5), warm ? (r.chance(0.5) ? '#d89040' : '#9aa060') : r.chance(0.5) ? '#7d8a52' : '#9aa060');
    },
  },
  [O.Hoodoo]: {
    w: 24, h: 42, shadow: 8,
    paint: (c, w, h, r) => {
      // Stacked soft sandstone eroded into bulbs, a harder dark cap rock balanced on top.
      const cx = w / 2;
      const bands = ['#9c5032', '#b8653e', '#c97c50', '#d8946a'];
      let y = h - 1;
      let layer = 0;
      while (y > 12) {
        const th = r.int(4, 7);
        const wd = (layer === 0 ? 8 : 5 + r.range(-0.5, 2.5)) - layer * 0.3;
        // Each bulb: lit left, shadowed right, darker groove beneath.
        ellipse(c, cx + r.range(-0.6, 0.6), y - th / 2, wd, th / 2 + 0.6, bands[1]!);
        ellipse(c, cx - wd * 0.35, y - th / 2 - 0.5, wd * 0.5, th / 2 - 0.4, bands[2 + (layer % 2)]!);
        rect(c, cx + wd * 0.35, y - th + 1, wd * 0.6, th - 1, bands[0]!);
        rect(c, cx - wd + 1, y - 1, wd * 2 - 2, 1, '#7c3c26');
        y -= th;
        layer++;
      }
      ellipse(c, cx, y - 1, 7.5, 3, '#5e4632');
      ellipse(c, cx - 1, y - 2, 5.5, 1.8, '#7c624a');
      px(c, cx - 4, y - 2, '#9a8064');
    },
  },
  [O.FenceH]: {
    w: 16, h: 14, shadow: 0,
    paint: (c, w, h) => {
      rect(c, 1, h - 12, 2, 12, '#6a4a30');
      rect(c, 0, h - 10, w, 2, '#8a6440');
      rect(c, 0, h - 5, w, 2, '#7a5636');
    },
  },
  [O.FenceV]: {
    w: 16, h: 16, shadow: 0,
    paint: (c, w, h) => {
      rect(c, w / 2 - 1, h - 14, 2, 14, '#6a4a30');
      rect(c, w / 2 - 2, h - 16, 4, 3, '#8a6440');
    },
  },
  [O.Log]: {
    w: 24, h: 12, shadow: 6,
    paint: (c, w, h, r, variant) => {
      // 0 barked log with end rings, 1 mossy log with mushrooms, 2 hollow log with a branch stub.
      const v = variant % 3;
      const len = v === 2 ? w - 6 : w - 4;
      const x0 = 2;
      rect(c, x0, h - 7, len, 6, '#5a3e28');
      rect(c, x0, h - 7, len, 2, '#8a6440');
      rect(c, x0, h - 2, len, 1, '#3e2a1a');
      for (let x = x0 + 2; x < x0 + len - 2; x += r.int(2, 4)) px(c, x, h - 4 - r.int(0, 1), '#3e2a1a');
      if (v === 2) {
        ellipse(c, x0 + len, h - 4, 2.4, 3, '#8a6440');
        ellipse(c, x0 + len, h - 4, 1.4, 2, '#1e1612');
        line(c, x0 + 6, h - 7, x0 + 4, h - 11, '#5a3e28', 1.6);
      } else {
        ellipse(c, x0 + len, h - 4, 2.2, 3, '#b8925e');
        ellipse(c, x0 + len, h - 4, 1, 1.6, '#8a6440');
        px(c, x0 + len, h - 4, '#6a4a30');
      }
      if (v === 1) {
        for (let x = x0; x < x0 + len - 3; x++) if (r.chance(0.6)) px(c, x, h - 7 - (r.chance(0.3) ? 1 : 0), r.chance(0.5) ? '#5a7a32' : '#7a9a42');
        for (const mx of [x0 + 4, x0 + 9]) {
          px(c, mx, h - 2, '#e8dcc0');
          rect(c, mx - 1, h - 3, 3, 1, '#c86a3a');
          px(c, mx, h - 4, '#e88a52');
        }
      }
    },
  },
  [O.Stump]: {
    w: 14, h: 12, shadow: 4,
    paint: (c, w, h, r, variant) => {
      const v = variant % 3;
      poly(c, [[1, h - 1], [3, h - 3], [w - 3, h - 3], [w - 1, h - 1]], '#3e2a1a');
      rect(c, 3, h - 7, 8, 6, '#5a3e28');
      rect(c, 3, h - 7, 1, 6, '#7a5636');
      rect(c, 10, h - 7, 1, 6, '#3e2a1a');
      if (v === 2) {
        // Broken, splintered top.
        poly(c, [[3, h - 7], [5, h - 10], [6, h - 7], [8, h - 11], [9, h - 7], [11, h - 8], [11, h - 7]], '#7a5636');
      } else {
        ellipse(c, w / 2, h - 7, 4, 1.8, '#c09868');
        ellipse(c, w / 2, h - 7, 2.2, 1, '#a07a50');
        px(c, w / 2, h - 7, '#8a6440');
      }
      if (v === 1) {
        px(c, 2, h - 2, '#e8dcc0');
        rect(c, 1, h - 3, 3, 1, '#c86a3a');
      }
    },
  },
  [O.HitchPost]: {
    w: 18, h: 14, shadow: 0,
    paint: (c, w, h) => {
      rect(c, 2, h - 10, 2, 10, '#5a3e28');
      rect(c, w - 4, h - 10, 2, 10, '#5a3e28');
      rect(c, 1, h - 11, w - 2, 2, '#7a5636');
    },
  },
  [O.Well]: {
    w: 20, h: 24, shadow: 7,
    paint: (c, w, h) => {
      ellipse(c, w / 2, h - 5, 7, 4, '#7a746c');
      ellipse(c, w / 2, h - 6, 5, 2.5, '#1d2a30');
      rect(c, 3, h - 20, 2, 15, '#5a3e28');
      rect(c, w - 5, h - 20, 2, 15, '#5a3e28');
      poly(c, [[1, h - 18], [w / 2, h - 24], [w - 1, h - 18]], '#6b4a35');
    },
  },
  [O.Trough]: {
    w: 20, h: 10, shadow: 4,
    paint: (c, w, h) => {
      rect(c, 1, h - 7, w - 2, 6, '#6a4a30');
      rect(c, 2, h - 7, w - 4, 2, '#4f8f9b');
    },
  },
  [O.LampPost]: {
    w: 10, h: 30, shadow: 3,
    paint: (c, w, h) => {
      rect(c, w / 2 - 1, h - 26, 2, 26, '#2e2a28');
      rect(c, w / 2 - 2.5, h - 30, 5, 5, '#3a342e');
      rect(c, w / 2 - 1.5, h - 29, 3, 3, '#f0cf7a');
    },
  },
  [O.Crate]: {
    w: 16, h: 16, shadow: 6,
    paint: (c, w, h) => {
      rect(c, 2, h - 12, 12, 11, '#9a7448');
      rect(c, 2, h - 12, 12, 2, '#b58e5c');
      line(c, 3, h - 10, 13, h - 2, '#6a4a30', 1);
    },
  },
  [O.Barrel]: {
    w: 14, h: 16, shadow: 5,
    paint: (c, w, h) => {
      rect(c, 3, h - 13, 8, 12, '#7a5432');
      ellipse(c, w / 2, h - 13, 4, 1.6, '#9a7044');
      rect(c, 3, h - 10, 8, 1, '#3a3532');
      rect(c, 3, h - 4, 8, 1, '#3a3532');
    },
  },
  [O.HayBale]: {
    w: 18, h: 14, shadow: 6,
    paint: (c, w, h) => {
      rect(c, 1, h - 10, 16, 9, '#c9a54e');
      rect(c, 1, h - 10, 16, 2, '#e0c06a');
      rect(c, 5, h - 10, 1, 9, '#9a7a34');
      rect(c, 12, h - 10, 1, 9, '#9a7a34');
    },
  },
  [O.Grave]: {
    w: 12, h: 16, shadow: 0,
    paint: (c, w, h) => {
      rect(c, w / 2 - 1, h - 14, 2, 13, '#7a6a58');
      rect(c, w / 2 - 4, h - 11, 8, 2, '#7a6a58');
      rect(c, 2, h - 2, 8, 2, '#5a4a38');
    },
  },
  [O.Tombstone]: {
    w: 12, h: 14, shadow: 0,
    paint: (c, w, h) => {
      rect(c, 2, h - 11, 8, 10, '#9a968e');
      ellipse(c, w / 2, h - 11, 4, 2.5, '#9a968e');
      rect(c, 4, h - 8, 4, 1, '#6e6a64');
    },
  },
  [O.Signpost]: {
    w: 20, h: 24, shadow: 0,
    paint: (c, w, h) => {
      rect(c, w / 2 - 1, h - 22, 2, 22, '#5a3e28');
      poly(c, [[2, h - 20], [w - 3, h - 20], [w - 1, h - 18], [w - 3, h - 16], [2, h - 16]], '#9a7448');
      poly(c, [[w - 2, h - 14], [3, h - 14], [1, h - 12], [3, h - 10], [w - 2, h - 10]], '#8a6440');
    },
  },
  [O.MineEntrance]: {
    w: 28, h: 26, shadow: 0,
    paint: (c, w, h) => {
      ellipse(c, w / 2, h - 8, 13, 10, '#6e5a48');
      rect(c, w / 2 - 6, h - 16, 12, 15, '#14100c');
      rect(c, w / 2 - 7, h - 17, 2, 16, '#6a4a30');
      rect(c, w / 2 + 5, h - 17, 2, 16, '#6a4a30');
      rect(c, w / 2 - 8, h - 18, 16, 2, '#7a5636');
    },
  },
  [O.Wagon]: {
    w: 40, h: 26, shadow: 14,
    paint: (c, w, h) => {
      rect(c, 4, h - 16, 30, 8, '#8a6440');
      rect(c, 4, h - 16, 30, 2, '#a5805a');
      ellipse(c, 10, h - 6, 5, 5, '#4a3424');
      ellipse(c, 10, h - 6, 3, 3, '#8a6440');
      ellipse(c, 29, h - 6, 5, 5, '#4a3424');
      ellipse(c, 29, h - 6, 3, 3, '#8a6440');
      line(c, 34, h - 10, 40, h - 8, '#6a4a30', 1.5);
    },
  },
  [O.Tent]: {
    w: 30, h: 22, shadow: 12,
    paint: (c, w, h) => {
      poly(c, [[2, h - 1], [w / 2, h - 20], [w - 2, h - 1]], '#d8ceb4');
      poly(c, [[w / 2, h - 20], [w - 2, h - 1], [w / 2 + 3, h - 1]], '#b8ad92');
      poly(c, [[w / 2 - 3, h - 1], [w / 2, h - 10], [w / 2 + 3, h - 1]], '#3a3024');
    },
  },
  [O.Windmill]: {
    w: 26, h: 52, shadow: 6,
    paint: (c, w, h) => {
      line(c, w / 2 - 5, h - 1, w / 2, h - 36, '#7a6a58', 1.5);
      line(c, w / 2 + 5, h - 1, w / 2, h - 36, '#7a6a58', 1.5);
      line(c, w / 2 - 3, h - 14, w / 2 + 3, h - 14, '#7a6a58', 1);
      line(c, w / 2 - 2, h - 26, w / 2 + 2, h - 26, '#7a6a58', 1);
      ellipse(c, w / 2, h - 40, 10, 10, '#9a948a');
      ellipse(c, w / 2, h - 40, 7, 7, '#6e6a64');
      ellipse(c, w / 2, h - 40, 2, 2, '#3a3532');
      poly(c, [[w / 2 + 2, h - 40], [w / 2 + 12, h - 37], [w / 2 + 12, h - 43]], '#8a6440');
    },
  },
  [O.WaterTower]: {
    w: 34, h: 56, shadow: 14,
    paint: (c, w, h) => {
      for (const x of [6, 13, 21, 28]) line(c, x, h - 1, x, h - 24, '#5a3e28', 2);
      line(c, 6, h - 12, 28, h - 12, '#5a3e28', 1);
      rect(c, 3, h - 44, 28, 20, '#7a5636');
      for (let y = h - 42; y < h - 24; y += 5) rect(c, 3, y, 28, 1, '#3a3532');
      poly(c, [[1, h - 44], [w / 2, h - 54], [w - 1, h - 44]], '#5a4a40');
    },
  },
  [O.Woodpile]: {
    w: 20, h: 12, shadow: 6,
    paint: (c) => {
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3 - (i > 1 ? 1 : 0); j++) ellipse(c, 4 + j * 5 + (i % 2) * 2, 10 - i * 2.5, 2.4, 2, j % 2 ? '#a5825a' : '#8a6440');
    },
  },
  [O.Cornstalk]: {
    w: 18, h: 18, shadow: 0, outline: null,
    paint: (c, w, h, r) => {
      // A dense patch of ripening wheat: many thin stalks, heavy golden heads leaning with the wind.
      const stalk = ['#8a7a3a', '#a89448', '#c2aa58'];
      const head = ['#b88f3a', '#d8b250', '#ecd27a'];
      for (let i = 0; i < 22; i++) {
        const x = 1 + r.next() * (w - 2);
        const base = h - r.range(0, 4);
        const top = base - r.range(8, 13);
        const lean = r.range(0.5, 2.2);
        const t = i % 3;
        line(c, x, base, x + lean, top, stalk[t]!, 1);
        // Seed head: 3px slanted with a highlight grain.
        line(c, x + lean, top, x + lean + 1, top - 3, head[t]!, 1.3);
        if (t === 2) px(c, x + lean, top - 2, head[2]!);
      }
    },
  },
  [O.Anvil]: {
    w: 14, h: 12, shadow: 4,
    paint: (c, w, h) => {
      rect(c, 5, h - 6, 4, 5, '#3a3532');
      rect(c, 2, h - 9, 10, 3, '#4a4540');
      rect(c, 1, h - 9, 2, 2, '#4a4540');
    },
  },
  [O.Teepee]: {
    w: 28, h: 30, shadow: 12,
    paint: (c, w, h) => {
      poly(c, [[2, h - 1], [w / 2, h - 26], [w - 2, h - 1]], '#c9b48e');
      line(c, w / 2 - 2, h - 26, w / 2 - 4, h - 30, '#5a3e28', 1);
      line(c, w / 2 + 2, h - 26, w / 2 + 4, h - 30, '#5a3e28', 1);
      poly(c, [[w / 2 - 3, h - 1], [w / 2, h - 9], [w / 2 + 3, h - 1]], '#3a2a1c');
    },
  },
  // --- Interior furniture (visible when the roof is hidden) -----------------
  [O.Counter]: { w: 16, h: 18, shadow: 0, paint: (c, w, h) => { rect(c, 0, h - 12, w, 11, '#5a3a22'); rect(c, 0, h - 12, w, 3, '#8a5a34'); } },
  [O.Bar]: { w: 16, h: 18, shadow: 0, paint: (c, w, h) => { rect(c, 0, h - 12, w, 11, '#4a2c1a'); rect(c, 0, h - 12, w, 3, '#9a6a3e'); rect(c, 4, h - 15, 2, 3, '#6a8a5a'); rect(c, 10, h - 14, 2, 2, '#a85a2a'); } },
  [O.Table]: { w: 18, h: 14, shadow: 4, paint: (c, w, h) => { rect(c, 2, h - 9, 14, 4, '#7a5432'); rect(c, 3, h - 5, 2, 4, '#5a3e28'); rect(c, 13, h - 5, 2, 4, '#5a3e28'); rect(c, 7, h - 10, 3, 1, '#e8e0d0'); } },
  [O.Chair]: { w: 10, h: 12, shadow: 0, paint: (c, w, h) => { rect(c, 2, h - 6, 6, 2, '#7a5432'); rect(c, 2, h - 11, 2, 10, '#5a3e28'); rect(c, 6, h - 5, 2, 4, '#5a3e28'); } },
  [O.Bed]: { w: 16, h: 18, shadow: 0, paint: (c, w, h) => { rect(c, 1, h - 16, 14, 15, '#5a3e28'); rect(c, 2, h - 14, 12, 12, '#c8bfa8'); rect(c, 2, h - 9, 12, 7, '#7a3a3a'); rect(c, 4, h - 14, 8, 3, '#ece6d8'); } },
  [O.Shelf]: { w: 16, h: 22, shadow: 0, paint: (c, w, h) => { rect(c, 1, h - 21, 14, 20, '#5a3a22'); for (let y = h - 18; y < h - 2; y += 5) { rect(c, 2, y, 12, 1, '#3a2618'); rect(c, 3, y - 3, 2, 3, '#8a3a2a'); rect(c, 7, y - 2, 3, 2, '#c9a54e'); rect(c, 11, y - 3, 2, 3, '#4a6a8a'); } } },
  [O.Stove]: { w: 14, h: 22, shadow: 0, paint: (c, w, h) => { rect(c, 2, h - 12, 10, 11, '#2e2a28'); rect(c, 4, h - 8, 6, 3, '#c0582a'); rect(c, 6, h - 21, 2, 9, '#3a3532'); } },
  [O.Piano]: { w: 18, h: 20, shadow: 0, paint: (c, w, h) => { rect(c, 1, h - 18, 16, 17, '#3a2214'); rect(c, 2, h - 10, 14, 2, '#ece6d8'); for (let x = 3; x < 16; x += 2) rect(c, x, h - 10, 1, 1, '#1a1410'); } },
  [O.Pew]: { w: 16, h: 12, shadow: 0, paint: (c, w, h) => { rect(c, 0, h - 9, w, 3, '#6a4a30'); rect(c, 0, h - 11, w, 2, '#5a3e28'); } },
  [O.Cell]: { w: 16, h: 24, shadow: 0, paint: (c, w, h) => { for (let x = 1; x < 16; x += 3) rect(c, x, h - 23, 1, 22, '#3a3532'); rect(c, 0, h - 23, 16, 2, '#3a3532'); } },
  [O.Desk]: { w: 18, h: 16, shadow: 0, paint: (c, w, h) => { rect(c, 1, h - 11, 16, 10, '#5a3a22'); rect(c, 1, h - 11, 16, 2, '#7a5432'); rect(c, 4, h - 13, 4, 2, '#e8e0d0'); } },
  [O.Safe]: { w: 14, h: 16, shadow: 0, paint: (c, w, h) => { rect(c, 1, h - 14, 12, 13, '#2e3236'); rect(c, 5, h - 9, 3, 3, '#c9a24a'); } },
  [O.Stall]: { w: 16, h: 20, shadow: 0, paint: (c, w, h) => { rect(c, 0, h - 18, 2, 17, '#5a3e28'); rect(c, 0, h - 10, w, 2, '#7a5636'); rect(c, 3, h - 5, 10, 3, '#c9a54e'); } },
  [O.FirePit]: { w: 16, h: 10, shadow: 0, outline: null, paint: (c, w, h) => { for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; ellipse(c, w / 2 + Math.cos(a) * 5, h - 5 + Math.sin(a) * 3, 1.5, 1.2, '#6e6a64'); } ellipse(c, w / 2, h - 5, 3, 1.6, '#2a2420'); } },
};

const cache = new Map<string, PropSprite>();

/** Get a sprite for an object id with a variant seed (0..2). */
export function propSprite(o: number, variant: number): PropSprite | null {
  const spec = SPECS[o];
  if (!spec) return null;
  const key = `${o}:${variant}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const cv = makeCanvas(spec.w, spec.h);
  const c = ctx2d(cv);
  spec.paint(c, spec.w, spec.h, new Rng(o * 131 + variant * 7 + 1), variant);
  pixelise(c, spec.w, spec.h, spec.palette ?? null, spec.outline === undefined ? '#1c140e' : spec.outline, 230);
  const sp: PropSprite = { img: cv, ox: 8 - spec.w / 2, oy: 16 - spec.h, shadow: spec.shadow };
  cache.set(key, sp);
  return sp;
}

/** Objects drawn flat into the terrain chunk instead of as sprites. */
export const FLAT_OBJECTS = new Set<number>([O.Flowers, O.RockSmall, O.Rail, O.Bones, O.Lilypad]);

/**
 * Paint a flat decal into a chunk context at (x,y) tile origin. `tone` 1 picks
 * the warm sandstone palette for desert and canyon country.
 */
export function paintFlat(c: Ctx, o: number, x: number, y: number, r: Rng, tone = 0): void {
  const dot = (fx: number, fy: number, w: number, h: number, col: string) => {
    c.fillStyle = col;
    c.fillRect(fx, fy, w, h);
  };
  switch (o) {
    case O.Flowers: {
      // Fallback (the chunk painter draws meadow flowers itself): a small clustered patch.
      const cols = [['#4a3f8e', '#a8a2ea'], ['#8e2a2a', '#ee7a52'], ['#b8501c', '#ffb45a'], ['#b8b4a0', '#ffffff']][r.int(0, 3)]!;
      for (let i = 0; i < 7; i++) {
        const fx = x + 8 + Math.round(r.range(-5, 5));
        const fy = y + 9 + Math.round(r.range(-4, 4));
        dot(fx, fy, 1, 1, '#3f5a2c');
        dot(fx, fy - 1, 1, 1, cols[0]!);
        dot(fx, fy - 2, 1, 1, cols[1]!);
      }
      break;
    }
    case O.RockSmall: {
      // A scatter of 2–4 stones of varied size: lit top-left, cool shadow side, contact shadow.
      const P = tone ? ['#6a3e30', '#9a6446', '#c48a60', '#e2b48a'] : ['#4a4852', '#706c68', '#958f86', '#bdb6aa'];
      const n = r.int(2, 4);
      for (let i = 0; i < n; i++) {
        const fx = x + r.int(1, 11);
        const fy = y + r.int(3, 12);
        const big = i === 0 && r.chance(0.6);
        const w = big ? 4 : r.int(2, 3);
        const h = big ? 3 : 2;
        dot(fx, fy + h, w, 1, 'rgba(30,24,40,0.35)');
        dot(fx, fy, w, h, P[1]!);
        dot(fx + w - 1, fy + 1, 1, h - 1, P[0]!);
        dot(fx, fy, w - 1, 1, P[2]!);
        if (big) dot(fx, fy, 1, 1, P[3]!);
      }
      break;
    }
    case O.Bones: {
      // Bleached cattle skull and a few scattered ribs.
      const bone = '#e8e0cc';
      const sh = '#a89e8a';
      dot(x + 3, y + 10, 5, 1, sh);
      dot(x + 3, y + 7, 5, 3, bone);
      dot(x + 2, y + 6, 1, 1, bone);
      dot(x + 8, y + 6, 1, 1, bone);
      dot(x + 1, y + 5, 1, 1, sh);
      dot(x + 9, y + 5, 1, 1, sh);
      dot(x + 4, y + 8, 1, 1, '#4a3a30');
      dot(x + 6, y + 8, 1, 1, '#4a3a30');
      for (let k = 0; k < 3; k++) {
        dot(x + 10 + k * 2, y + 9 + (k % 2), 1, 3, bone);
        dot(x + 10 + k * 2, y + 12 + (k % 2), 1, 1, sh);
      }
      break;
    }
    case O.Lilypad:
      for (let i = 0; i < 3; i++) {
        const fx = x + r.int(2, 11);
        const fy = y + r.int(2, 12);
        dot(fx, fy + 1, 4, 1, '#2f5a34');
        dot(fx, fy, 4, 1, '#4a7a3a');
        dot(fx + 1, fy - 1, 2, 1, '#6a9a4a');
        dot(fx + 2, fy, 1, 1, '#2f5a34');
        if (r.chance(0.3)) {
          dot(fx + 1, fy - 1, 1, 1, '#f0d0e0');
          dot(fx + 1, fy - 2, 1, 1, '#ffffff');
        }
      }
      break;
  }
  void shade;
}
