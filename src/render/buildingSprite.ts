/**
 * Building painter. Produces an exterior sprite (roof, false front, walls,
 * windows, door, sign, porch) and an interior "cutaway" sprite used while
 * the player is inside, so towns are seamless — no loading screens.
 */
import { Rng, hashString } from '../core/rng.ts';
import type { Building } from '../world/world.ts';
import { ctx2d, makeCanvas, rect, shade, type Ctx } from './pixel.ts';

export interface BuildingSprite {
  exterior: HTMLCanvasElement | OffscreenCanvas;
  interior: HTMLCanvasElement | OffscreenCanvas;
  /** Draw offset from the building's tile origin (px). */
  ox: number;
  oy: number;
  /** Window rectangles in sprite coords (lit at night). */
  windows: { x: number; y: number; w: number; h: number }[];
  /** Chimney top in sprite coords (for smoke), if any. */
  chimney: { x: number; y: number } | null;
}

const WALL: Record<Building['wall'], [string, string, string]> = {
  plank: ['#6e4c31', '#8a6243', '#a57b57'],
  log: ['#5a3e28', '#76543a', '#94704f'],
  adobe: ['#a77c58', '#c09372', '#d6ab8a'],
  brick: ['#6e3a2c', '#8a4a38', '#a5624c'],
  whitewash: ['#b9b4a8', '#d8d4ca', '#eeebe3'],
};

const WALL_H = 22;

function wallTexture(c: Ctx, x: number, y: number, w: number, h: number, kind: Building['wall'], r: Rng, tint?: string): void {
  const [d, m, l] = tint ? [shade(tint, -0.25), tint, shade(tint, 0.2)] : WALL[kind];
  rect(c, x, y, w, h, m);
  switch (kind) {
    case 'plank':
    case 'whitewash':
      for (let px = x; px < x + w; px += 3) {
        rect(c, px, y, 1, h, d);
        if (r.chance(0.3)) rect(c, px + 1, y + r.int(0, h - 3), 1, 2, l);
      }
      break;
    case 'log':
      for (let py = y; py < y + h; py += 4) {
        rect(c, x, py + 3, w, 1, d);
        rect(c, x, py, w, 1, l);
      }
      break;
    case 'brick':
      for (let py = y; py < y + h; py += 3) {
        rect(c, x, py, w, 1, d);
        const off = ((py - y) / 3) % 2 ? 2 : 0;
        for (let px = x + off; px < x + w; px += 5) rect(c, px, py, 1, 3, d);
      }
      break;
    case 'adobe':
      for (let i = 0; i < w * h * 0.03; i++) rect(c, x + r.int(0, w - 1), y + r.int(0, h - 1), 1, 1, r.chance(0.5) ? d : l);
      rect(c, x, y + h - 2, w, 2, d);
      break;
  }
}

// ---------------------------------------------------------------------------
// Numeric colour helpers for the per-pixel roof painters (painted once, cached).
// ---------------------------------------------------------------------------
type RGB = [number, number, number];
function rgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** Same ramp idea as pixel.ts shade(): warm cream highlights, cool violet shadows. */
function toneRGB(c: RGB, t: number): RGB {
  if (t >= 0) {
    const k = Math.min(1, t * 0.95);
    return [c[0] + (255 - c[0]) * k, c[1] + (246 - c[1]) * k, c[2] + (214 - c[2]) * k];
  }
  const k = Math.min(1, -t);
  return [c[0] * (1 - k) + 34 * k * 0.5, c[1] * (1 - k) + 24 * k * 0.5, c[2] * (1 - k) + 56 * k * 0.5];
}
function mixRGB(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
/** Stable per-pixel hash in [0,1) — texture noise without consuming the building's Rng. */
function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Plain wooden-shake roof plane (also used for lean-tos), lit back slope / shaded front slope. */
function roofTexture(c: Ctx, x: number, y: number, w: number, h: number, color: string, wall: Building['wall'], r: Rng, ruined: boolean, ridgeFrac = 0.42, cap = true): void {
  if (wall === 'adobe') {
    adobeRoof(c, x, y, w, h, color, r, ruined);
    return;
  }
  const ridge = y + Math.floor(h * ridgeFrac);
  const back = shade(color, 0.14);
  const front = shade(color, -0.06);
  // A replaced patch of newer, redder shakes on some roofs.
  const patch = r.chance(0.55) ? { x: x + r.int(4, Math.max(5, w - 30)), y: y + r.int(2, Math.max(3, h - 16)), w: r.int(14, 26), h: r.int(8, 14) } : null;
  for (let row = 0, py = y; py < y + h; row++, py += 4) {
    const slopeCol = py < ridge ? back : front;
    let px = x - (row % 2 ? 3 : 0);
    while (px < x + w) {
      const sw = r.int(4, 7);
      const fresh = patch && px >= patch.x && px < patch.x + patch.w && py >= patch.y && py < patch.y + patch.h;
      const tone = shade(fresh ? shade(mixHex(slopeCol, '#a8683a', 0.35), 0.06) : slopeCol, r.range(-0.12, 0.1));
      const x0 = Math.max(x, px);
      const ww = Math.min(sw, x + w - x0);
      rect(c, x0, py, ww, 4, tone);
      rect(c, x0, py + 3, ww, 1, shade(tone, -0.32));
      rect(c, x0, py, 1, 3, shade(tone, -0.2));
      if (r.chance(0.25)) rect(c, x0 + 1, py, Math.max(1, sw - 2), 1, shade(tone, 0.18));
      if (!fresh && r.chance(0.025)) rect(c, x0, py, ww, 3, shade(tone, -0.42)); // split / missing shake
      px += sw;
    }
  }
  // Light falls across the slopes: sun-washed upper plane, shading deepening toward each eave.
  for (let py = y; py < y + h; py++) {
    const up = py < ridge;
    const d = up ? (ridge - py) / Math.max(1, ridge - y) : (py - ridge) / Math.max(1, y + h - ridge);
    c.fillStyle = up ? `rgba(255,236,190,${0.13 * (1 - d) + 0.02})` : `rgba(30,20,40,${0.05 + 0.2 * d})`;
    c.fillRect(x, py, w, 1);
  }
  // Moss and lichen on the shaded slope.
  for (let i = 0; i < Math.floor((w * h) / 320); i++) {
    const px = x + r.int(3, Math.max(4, w - 10));
    const py = y + r.int(Math.floor(h * 0.45), Math.max(4, h - 5));
    rect(c, px, py, r.int(2, 5), 1, r.chance(0.6) ? '#5a6a3a' : '#6e7a44');
    rect(c, px + 1, py + 1, r.int(1, 3), 1, '#4a5a32');
  }
  // Sawtooth eave trim, ridge cap boards and verges.
  for (let px = x; px < x + w; px += 4) rect(c, px, y + h - 2, 2, 2, shade(color, -0.45));
  if (cap) {
    rect(c, x, ridge - 2, w, 1, shade(color, -0.2));
    rect(c, x, ridge - 1, w, 2, shade(color, 0.3));
    rect(c, x, ridge + 1, w, 1, shade(color, -0.35));
    c.fillStyle = 'rgba(30,20,40,0.25)';
    c.fillRect(x, ridge + 2, w, 1);
    for (let px = x + 3; px < x + w; px += 9) rect(c, px, ridge, 1, 1, shade(color, -0.1));
  }
  rect(c, x, y + h - 1, w, 1, shade(color, -0.4));
  rect(c, x, y, 1, h, shade(color, -0.3));
  rect(c, x + w - 1, y, 1, h, shade(color, -0.35));
  if (ruined) {
    c.save();
    c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 4; i++) {
      const hx = x + r.int(3, Math.max(4, w - 14));
      const hy = y + r.int(3, Math.max(4, h - 10));
      c.fillRect(hx, hy, r.int(6, 12), r.int(4, 8));
    }
    c.restore();
    // Exposed rafters.
    for (let px = x + 4; px < x + w - 2; px += 6) rect(c, px, y + 2, 1, h - 4, '#3a2a1c');
  }
}

function mixHex(a: string, b: string, t: number): string {
  const m = mixRGB(rgb(a), rgb(b), t);
  return '#' + ((1 << 24) | (Math.round(m[0]) << 16) | (Math.round(m[1]) << 8) | Math.round(m[2])).toString(16).slice(1);
}

interface TinOpts {
  ridgeFrac: number;
  /** 0 = fresh galvanised, 1 = badly rusted. */
  rust: number;
  cap: boolean;
  seed: number;
}

/**
 * Corrugated-tin roof painted per pixel: sheets laid in courses with lapped
 * joints, each sheet weathered differently (galvanised, dull, rusted), rust
 * bleeding from the laps and running downslope in streaks, value falling off
 * from the ridge toward both eaves, then laps, nails, patches, skylights and a
 * rolled ridge cap drawn on top. Big roofs read as a patchwork, not a slab.
 */
function tinRoof(c: Ctx, x: number, y: number, w: number, h: number, r: Rng, o: TinOpts): void {
  const ridge = Math.floor(h * o.ridgeFrac);
  // Kept a step darker than the facades so the street fronts, not the roofs, carry the eye.
  const base = rgb(r.pick(['#62676c', '#666a70', '#5e646a', '#686a66']));
  const rustA = rgb('#7c4a32');
  const rustB = rgb('#94603e');
  const rustD = rgb('#56362a');
  const galv = rgb('#868f95');
  // Sheet grid: columns aligned to the 4 px corrugation, courses lapping every 12–16 px away from the ridge.
  const cols: number[] = [0];
  while (cols[cols.length - 1] < w) cols.push(cols[cols.length - 1] + r.pick([16, 16, 20, 24]));
  const laps: number[] = [];
  for (let ly = ridge + r.int(12, 16); ly < h - 4; ly += r.int(12, 16)) laps.push(ly);
  for (let ly = ridge - r.int(12, 16); ly > 3; ly -= r.int(12, 16)) laps.push(ly);
  laps.sort((a, b) => a - b);
  const colOf = (px: number) => {
    let i = 0;
    while (i + 1 < cols.length && cols[i + 1] <= px) i++;
    return i;
  };
  const rowOf = (py: number) => {
    let i = 0;
    while (i < laps.length && laps[i] <= py) i++;
    return i;
  };
  const sheets = new Map<number, { t: number; rust: number; galv: number }>();
  const sheet = (ci: number, ri: number) => {
    const k = ci * 64 + ri;
    let s = sheets.get(k);
    if (!s) {
      const roll = r.next();
      s = roll < 0.12 ? { t: 0.06, rust: 0, galv: 0.55 } : roll < 0.17 + 0.3 * o.rust ? { t: -0.05, rust: r.range(0.45, 0.95), galv: 0 } : { t: r.range(-0.08, 0.05), rust: r.range(0, 0.15) * o.rust, galv: 0 };
      sheets.set(k, s);
    }
    return s;
  };
  // Rust field: laps and eaves hold water; streaks run downslope (toward the nearer eave) from nail rows.
  const rust = new Float32Array(w * h);
  const addRust = (px: number, py: number, v: number) => {
    if (px >= 0 && px < w && py >= 0 && py < h) rust[py * w + px] += v;
  };
  for (const ly of laps) {
    const down = ly > ridge ? 1 : -1;
    for (let px = 0; px < w; px++) {
      const n = hash2(px, ly, o.seed);
      for (let k = 0; k < 3; k++) addRust(px, ly + down * k, (0.42 - k * 0.12) * o.rust * (0.4 + n));
    }
    // Streaks from nail heads.
    for (let px = 2; px < w; px += 8) {
      if (hash2(px, ly + 7, o.seed) > 0.25 + 0.4 * o.rust) continue;
      const len = 3 + Math.floor(hash2(px, ly, o.seed + 1) * 10);
      for (let k = 0; k < len; k++) addRust(px, ly + down * k, 0.85 * (1 - k / len));
    }
  }
  for (let px = 0; px < w; px++)
    for (let k = 0; k < 4; k++) {
      addRust(px, h - 1 - k, (0.5 - k * 0.12) * o.rust * hash2(px, k, o.seed + 2) * 1.6);
      addRust(px, k, (0.3 - k * 0.08) * o.rust * hash2(px, k, o.seed + 3) * 1.4);
    }
  const RIB = [0.08, 0.02, -0.05, -0.13];
  const img = c.createImageData(w, h);
  const d = img.data;
  for (let py = 0; py < h; py++) {
    const up = py < ridge;
    const f = up ? (ridge - py) / Math.max(1, ridge) : (py - ridge) / Math.max(1, h - ridge);
    const slope = up ? 0.12 - 0.08 * f : -0.03 - 0.15 * f * f - 0.04 * f;
    const ri = rowOf(py);
    const sTop = ri > 0 ? laps[ri - 1] : 0;
    const sBot = ri < laps.length ? laps[ri] : h;
    // Position within the sheet measured downslope: rust gathers where water runs off.
    const along = (py - sTop) / Math.max(1, sBot - sTop);
    const downPos = up ? 1 - along : along;
    for (let px = 0; px < w; px++) {
      const s = sheet(colOf(px), ri);
      const n = hash2(px, py, o.seed);
      const t = slope + RIB[px % 4] + s.t + (n - 0.5) * 0.04;
      let col = toneRGB(s.galv ? mixRGB(base, galv, s.galv) : base, t);
      // Rust runs in the troughs of the corrugation as thin vertical runs, heavier toward the sheet's low edge.
      const trough = px % 4 === 3 ? 0.25 : px % 4 === 0 ? -0.1 : 0;
      const runs = hash2(px, Math.floor(py / 5), o.seed + 4) * 0.7 + hash2(px >> 1, Math.floor(py / 3), o.seed + 6) * 0.5;
      const rv = Math.min(1, s.rust * (0.15 + 1.1 * downPos) * runs * 1.4 + rust[py * w + px] + (s.rust > 0 ? trough * s.rust : 0));
      if (rv > 0.2) {
        const rc = n < 0.25 ? rustD : mixRGB(rustA, rustB, hash2(px, py >> 1, o.seed + 5));
        col = mixRGB(col, toneRGB(rc, t * 0.9), Math.min(0.92, (rv - 0.2) * 1.6));
      }
      const i = (py * w + px) * 4;
      d[i] = col[0];
      d[i + 1] = col[1];
      d[i + 2] = col[2];
      d[i + 3] = 255;
    }
  }
  c.putImageData(img, x, y);
  // Lapped joints: the upper sheet's edge catches light, casts a hairline shadow; nails along it.
  for (const ly of laps) {
    const down = ly > ridge;
    rect(c, x, y + ly - (down ? 1 : 0), w, 1, 'rgba(255,240,210,0.16)');
    rect(c, x, y + ly + (down ? 0 : -1), w, 1, 'rgba(24,16,34,0.38)');
    for (let px = 1; px < w; px += 8) rect(c, x + px, y + ly + (down ? -2 : 1), 1, 1, 'rgba(40,30,30,0.55)');
  }
  // Side laps between sheet columns: one rib sits proud.
  for (const cx of cols) if (cx > 0 && cx < w) rect(c, x + cx, y, 1, h, 'rgba(24,16,34,0.16)');
  // Patches: a smaller replacement sheet bolted over a hole, nails all round.
  const nPatch = h < 24 ? 0 : Math.floor((w * h) / 5200) + (r.chance(0.5) ? 1 : 0);
  for (let i = 0; i < nPatch; i++) {
    const pw = r.pick([8, 12]);
    const ph = r.int(6, 10);
    const px = x + r.int(1, Math.max(2, Math.floor((w - pw - 2) / 4))) * 4;
    const py = y + r.int(3, Math.max(4, h - ph - 4));
    const pc = r.pick(['#7e868c', '#5e6266', '#8a5a3a']);
    for (let k = 0; k < pw; k++) rect(c, px + k, py, 1, ph, shade(pc, RIB[k % 4] + (py - y < ridge ? 0.05 : -0.06)));
    rect(c, px, py + ph, pw, 1, 'rgba(24,16,34,0.4)');
    rect(c, px - 1, py, 1, ph, 'rgba(24,16,34,0.25)');
    for (let k = 0; k < pw; k += 3) {
      rect(c, px + k, py, 1, 1, '#2e2a28');
      rect(c, px + k, py + ph - 1, 1, 1, '#2e2a28');
    }
  }
  // Skylights: translucent corrugated panels, milky and dirty, on large roofs.
  if (w * h > 7000) {
    const nSky = Math.min(3, Math.floor((w * h) / 7000));
    for (let i = 0; i < nSky; i++) {
      const sw = 8;
      const sh = r.int(9, 12);
      const sx = x + Math.floor((w * (i + 0.5)) / nSky / 4) * 4 + r.int(-2, 2) * 4;
      const sy = y + (i % 2 ? Math.max(3, ridge - sh - 3) : Math.min(h - sh - 6, ridge + 5));
      for (let k = 0; k < sw; k++) rect(c, sx + k, sy, 1, sh, shade('#a8b8b2', RIB[k % 4] * 1.5 + (sy - y < ridge ? 0.06 : -0.08)));
      for (let k = 0; k < sh; k += 2) rect(c, sx + (k % 4 ? 2 : 5), sy + k, 1, 1, 'rgba(90,80,60,0.35)'); // grime
      rect(c, sx, sy + sh - 2, sw, 2, 'rgba(120,100,70,0.3)');
      rect(c, sx - 1, sy - 1, sw + 2, 1, 'rgba(24,16,34,0.3)');
      rect(c, sx - 1, sy + sh, sw + 2, 1, 'rgba(24,16,34,0.35)');
    }
  }
  // Rolled ridge cap with rivets.
  if (o.cap) {
    rect(c, x, y + ridge - 2, w, 1, '#3c3e42');
    rect(c, x, y + ridge - 1, w, 1, '#b2b4ae');
    rect(c, x, y + ridge, w, 1, '#8a8c8a');
    rect(c, x, y + ridge + 1, w, 1, '#55585c');
    rect(c, x, y + ridge + 2, w, 1, 'rgba(24,16,34,0.35)');
    for (let px = 3; px < w; px += 7) rect(c, x + px, y + ridge, 1, 1, '#3c3e42');
    for (let px = 5; px < w; px += 23) if (hash2(px, ridge, o.seed) < o.rust) rect(c, x + px, y + ridge + 2, 1, r.int(2, 5), '#8c4a2a');
  }
  // Verge trim, back fascia, eave gutter.
  rect(c, x, y, 1, h, '#3c3e42');
  rect(c, x + w - 1, y, 1, h, '#34363a');
  rect(c, x, y, w, 1, '#4a4c50');
  rect(c, x, y + 1, w, 1, 'rgba(255,240,210,0.12)');
  rect(c, x, y + h - 3, w, 1, '#8c9094');
  rect(c, x, y + h - 2, w, 2, '#4a4c50');
}

/**
 * Flat adobe roof (azotea): raised parapet rim, mud plaster patched in
 * different batches, hairline cracks, darker drainage toward the canales,
 * and on large roofs a raised nave block with its own parapet and shadow.
 */
function adobeRoof(c: Ctx, x: number, y: number, w: number, h: number, color: string, r: Rng, ruined: boolean): void {
  const baseHex = shade(color, 0.1);
  const base = rgb(baseHex);
  const seed = r.int(0, 1 << 20);
  // Patch blobs (fresh mud is lighter and warmer, old mud greyer).
  const blobs: { cx: number; cy: number; rx: number; ry: number; t: number }[] = [];
  for (let i = 0; i < Math.max(3, Math.floor((w * h) / 700)); i++) blobs.push({ cx: r.int(0, w), cy: r.int(0, h), rx: r.int(6, 18), ry: r.int(4, 10), t: r.pick([-1, 1]) * r.range(0.06, 0.13) });
  const img = c.createImageData(w, h);
  const d = img.data;
  for (let py = 0; py < h; py++) {
    // Slight fall toward the front where the canales drain.
    const fall = -0.1 * (py / h);
    for (let px = 0; px < w; px++) {
      let t = fall + (hash2(px, py, seed) - 0.5) * 0.06 + (hash2(px >> 2, py >> 1, seed + 1) - 0.5) * 0.05;
      for (const b of blobs) {
        const dx = (px - b.cx) / b.rx;
        const dy = (py - b.cy) / b.ry;
        if (dx * dx + dy * dy < 1 + (hash2(px, py, seed + 2) - 0.5) * 0.3) t += b.t;
      }
      const col = toneRGB(base, t);
      const i = (py * w + px) * 4;
      d[i] = col[0];
      d[i + 1] = col[1];
      d[i + 2] = col[2];
      d[i + 3] = 255;
    }
  }
  c.putImageData(img, x, y);
  // Hairline cracks wander across the dried mud.
  for (let k = 0; k < Math.max(2, Math.floor((w * h) / 1400)); k++) {
    let cx = x + r.int(6, w - 6);
    let cy = y + r.int(6, h - 6);
    const horiz = r.chance(0.5);
    for (let s = 0; s < r.int(5, 14); s++) {
      rect(c, cx, cy, 1, 1, shade(baseHex, -0.36));
      if (horiz) {
        cx += 1;
        cy += r.int(-1, 1);
      } else {
        cy += 1;
        cx += r.int(-1, 1);
      }
    }
  }
  // Canales: water stains running to the front edge.
  for (let px = 14 + r.int(0, 8); px < w - 8; px += r.int(26, 36)) {
    for (let k = 0; k < 10; k++) {
      c.fillStyle = `rgba(60,36,24,${0.04 + k * 0.022})`;
      c.fillRect(x + px - 1, y + h - 14 + k, 4, 1);
    }
  }
  const parapet = (px: number, py: number, pw: number, ph: number, lit: string) => {
    const th = 3;
    rect(c, px, py, pw, th, lit);
    rect(c, px, py + ph - th, pw, th, shade(lit, -0.08));
    rect(c, px, py, th, ph, shade(lit, -0.02));
    rect(c, px + pw - th, py, th, ph, shade(lit, -0.12));
    rect(c, px, py, pw, 1, shade(lit, 0.2)); // sunlit cap
    rect(c, px, py + ph - 1, pw, 1, shade(lit, -0.3));
    // Inner shadow on the far and left inside faces; inner lip lit on the near side.
    c.fillStyle = 'rgba(40,24,30,0.28)';
    c.fillRect(px + th, py + th, pw - 2 * th, 2);
    c.fillRect(px + th, py + th, 2, ph - 2 * th);
    c.fillStyle = 'rgba(255,240,210,0.14)';
    c.fillRect(px + th, py + ph - th - 1, pw - 2 * th, 1);
    // Weathered gaps in the coping.
    for (let i = 0; i < Math.floor(pw / 18); i++) rect(c, px + r.int(4, pw - 6), py + (r.chance(0.5) ? 0 : ph - 1), r.int(2, 4), 1, shade(lit, -0.25));
  };
  parapet(x, y, w, h, shade(baseHex, 0.12));
  // Raised nave / upper storey block on big roofs.
  if (w >= 140 && h >= 60) {
    const bw = Math.floor(w * 0.56);
    const bh = Math.floor(h * 0.6);
    const bx = x + Math.floor((w - bw) / 2);
    const by = y + 6;
    c.fillStyle = 'rgba(40,24,30,0.32)';
    c.fillRect(bx + 4, by + 4, bw, bh); // cast shadow down-right
    const sub = makeCanvas(bw, bh);
    const sc = ctx2d(sub);
    for (let py = 0; py < bh; py++)
      for (let px = 0; px < bw; px++) {
        const col = toneRGB(base, 0.06 + (hash2(px, py, seed + 9) - 0.5) * 0.06 - 0.06 * (py / bh));
        sc.fillStyle = `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`;
        sc.fillRect(px, py, 1, 1);
      }
    c.drawImage(sub as CanvasImageSource, bx, by);
    parapet(bx, by, bw, bh, shade(baseHex, 0.22));
    // Front wall face of the raised block.
    rect(c, bx, by + bh, bw, 4, shade(baseHex, -0.05));
    rect(c, bx, by + bh + 3, bw, 1, shade(baseHex, -0.3));
    for (let px = bx + 6; px < bx + bw - 4; px += 10) rect(c, px, by + bh + 1, 2, 2, '#4a3424'); // viga ends
    // Wooden roof hatch.
    rect(c, bx + bw - 16, by + 8, 8, 7, '#5a4030');
    rect(c, bx + bw - 16, by + 8, 8, 1, '#7a5a40');
    rect(c, bx + bw - 13, by + 8, 1, 7, '#3e2c20');
  }
  if (ruined) {
    // Fallen-in sections: dark void with surviving vigas across it.
    for (let i = 0; i < 2 + Math.floor((w * h) / 5000); i++) {
      const hw = r.int(12, 26);
      const hh = r.int(7, 14);
      const hx = x + r.int(6, Math.max(7, w - hw - 6));
      const hy = y + r.int(6, Math.max(7, h - hh - 8));
      for (let py = 0; py < hh; py++) {
        const inset = Math.abs(py - hh / 2) > hh / 2 - 2 ? 2 : 0;
        rect(c, hx + inset + (hash2(py, i, seed) * 2) | 0, hy + py, hw - inset * 2, 1, '#241a14');
      }
      for (let px = hx + 2; px < hx + hw - 1; px += 5) rect(c, px, hy - 1, 2, hh + 2, '#6a4a30');
      rect(c, hx, hy + hh, hw, 1, shade(baseHex, 0.2));
    }
  }
}

// ---------------------------------------------------------------------------
// Building-type groups.
// ---------------------------------------------------------------------------
const COMMERCIAL = new Set<Building['type']>(['saloon', 'store', 'sheriff', 'doctor', 'hotel', 'bank', 'gunsmith', 'tailor', 'newspaper', 'assay', 'telegraph', 'tradingpost', 'station']);
const TIN_ROOF = new Set<Building['type']>(['saloon', 'store', 'bank', 'hotel', 'gunsmith', 'tailor', 'newspaper', 'assay', 'station', 'warehouse', 'sawmill', 'doctor', 'sheriff', 'telegraph']);
const CHIMNEY = new Set<Building['type']>(['house', 'ranchhouse', 'cabin', 'saloon', 'hotel', 'blacksmith', 'cookhouse', 'bunkhouse', 'barracks', 'officers', 'shack', 'lodgehouse']);
const HOMELY = new Set<Building['type']>(['house', 'ranchhouse', 'cabin', 'bunkhouse', 'officers', 'lodgehouse', 'cookhouse', 'barracks']);

/** Painted clapboard colours: weathered white, ochre, sage, oxblood, slate blue, tan, buff, raw. */
const SIDING = ['#cfc6b0', '#b99a62', '#7f8e6c', '#8e4c3c', '#6d7e8c', '#a8805a', '#c4b08a', '#93755a', '#d8cfb8', '#a89070', '#9a5a44', '#b8a888'];
const SIGN_BOARD = ['#24342a', '#4a1e1a', '#1e2228', '#2a3448', '#3a2616'];
const SIGN_INK = ['#f2e6c4', '#f0d27a', '#f6eedc'];
const CURTAIN = ['#b8483a', '#e8e0cc', '#5a7a9a', '#c8a050', '#7a8a5a'];
const FLOWERS = ['#d8584a', '#e8c84a', '#e88ab0', '#f0ecd8', '#9a6ad0'];
const RAW_WOOD = '#8a6a4c';

/** Per-building look, rolled once from the building's id so it is stable. */
interface Style {
  siding: 'clap' | 'batten' | 'native';
  base: string;
  trim: string;
  peel: number;
  curtain: string | null;
  shutter: string | null;
  boxes: boolean;
  board: string;
  ink: string;
}

function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11;
}

function rollStyle(b: Building, r: Rng): Style {
  const barnish = b.type === 'barn' || b.type === 'stable';
  let siding: Style['siding'] = 'native';
  let base = WALL[b.wall][1];
  if (b.wall === 'plank') {
    if (barnish) {
      siding = 'batten';
      base = r.pick(['#8a3426', '#7e3326', '#93402c', '#7a3a2a']);
      if (r.chance(0.2)) base = '#8a6a4c';
    } else if (['shack', 'sawmill', 'warehouse', 'blacksmith'].includes(b.type) || r.chance(0.18)) {
      siding = 'batten';
      base = r.pick(['#7e5c40', '#8a6a4c', '#6e5038']);
    } else {
      siding = 'clap';
      base = r.pick(SIDING);
    }
  } else if (b.wall === 'whitewash') {
    siding = 'clap';
    base = r.pick(['#d8d4ca', '#e2ddd0', '#cfcabd']);
  } else if (b.wall === 'brick') {
    base = r.pick(['#8a4a38', '#7e4434', '#94523c']);
  }
  const light = lum(base) > 150;
  const trim = light ? r.pick(['#3a2a20', '#4a3a2c', '#5a3a2a', '#2e3a44']) : r.pick(['#efe6d0', '#e2d3a8', '#efe6d0', '#3a2a20']);
  return {
    siding,
    base,
    trim,
    peel: b.ruined ? 0.9 : r.range(0, 0.6),
    curtain: !b.ruined && r.chance(0.75) ? r.pick(CURTAIN) : null,
    shutter: r.chance(HOMELY.has(b.type) ? 0.55 : 0.2) ? r.pick(['#3a5a44', '#5a2a24', '#2e3e52', '#3a2a20', shade(base, -0.35)]) : null,
    boxes: !b.ruined && (HOMELY.has(b.type) ? r.chance(0.65) : r.chance(0.2)),
    board: b.type === 'bank' ? '#1a1a1e' : r.pick(SIGN_BOARD),
    ink: b.type === 'bank' ? '#f0d27a' : r.pick(SIGN_INK),
  };
}

/** Horizontal lapped clapboard: a lit lip and a cast shadow on every board, butt joints, peeling paint. */
function clapboard(c: Ctx, x: number, y: number, w: number, h: number, base: string, r: Rng, peel: number): void {
  rect(c, x, y, w, h, base);
  const hi = shade(base, 0.14);
  const lo = shade(base, -0.3);
  const mid = shade(base, -0.1);
  for (let py = y; py < y + h; py += 3) {
    rect(c, x, py, w, 1, hi);
    rect(c, x, py + 2, w, 1, mid);
    if (py + 3 < y + h) rect(c, x, py + 3, w, 1, lo);
    // Butt joints where two boards meet.
    for (let k = 0; k < Math.floor(w / 26); k++) rect(c, x + r.int(2, Math.max(3, w - 3)), py + 1, 1, 2, lo);
  }
  // Peeling paint shows grey raw wood beneath, worst near the ground and the corners.
  const n = Math.floor(((w * h) / 140) * peel);
  for (let i = 0; i < n; i++) {
    const px = x + r.int(0, Math.max(0, w - 5));
    const py = y + Math.floor(h * Math.sqrt(r.next())) - 1;
    const pw = r.int(2, 5);
    rect(c, px, Math.max(y, py), pw, 1, shade(RAW_WOOD, r.range(-0.15, 0.05)));
    if (r.chance(0.5)) rect(c, px + 1, Math.max(y, py) + 1, Math.max(1, pw - 2), 1, shade(RAW_WOOD, -0.2));
  }
}

/** Vertical board-and-batten siding (barns, sheds, shacks). */
function battens(c: Ctx, x: number, y: number, w: number, h: number, base: string, r: Rng, peel: number): void {
  rect(c, x, y, w, h, base);
  for (let px = x; px < x + w; px += 5) {
    const tone = shade(base, r.range(-0.08, 0.08));
    rect(c, px, y, 5, h, tone);
    rect(c, px, y, 1, h, shade(tone, -0.38));
    rect(c, px + 1, y, 1, h, shade(tone, 0.16));
    if (r.chance(0.35)) rect(c, px + 3, y + r.int(1, Math.max(2, h - 3)), 1, 1, shade(tone, -0.4)); // knot
  }
  const n = Math.floor(((w * h) / 160) * peel);
  for (let i = 0; i < n; i++) rect(c, x + r.int(0, w - 2), y + r.int(0, h - 3), 1, r.int(1, 3), shade(RAW_WOOD, r.range(-0.2, 0.1)));
}

/** Front wall siding for a given style, with grime splashed up from the ground. */
function siding(c: Ctx, x: number, y: number, w: number, h: number, b: Building, st: Style, r: Rng): void {
  if (st.siding === 'clap') clapboard(c, x, y, w, h, st.base, r, st.peel);
  else if (st.siding === 'batten') battens(c, x, y, w, h, st.base, r, st.peel);
  else if (b.wall === 'brick') {
    rect(c, x, y, w, h, shade(st.base, -0.38));
    for (let row = 0, py = y; py < y + h; row++, py += 3) {
      for (let px = x - (row % 2 ? 2 : 0); px < x + w; px += 5) {
        const tone = shade(st.base, r.range(-0.12, 0.1));
        const bx = Math.max(x, px);
        rect(c, bx, py, Math.min(4, x + w - bx), Math.min(2, y + h - py), tone);
        rect(c, bx, py, Math.min(4, x + w - bx), 1, shade(tone, 0.1));
      }
    }
  } else wallTexture(c, x, y, w, h, b.wall, r, st.base === WALL[b.wall][1] ? undefined : st.base);
}

function grime(c: Ctx, x: number, y: number, w: number, h: number): void {
  for (let k = 0; k < 4; k++) {
    c.fillStyle = `rgba(60,40,24,${0.22 - k * 0.05})`;
    c.fillRect(x, y + h - 1 - k, w, 1);
  }
}

// ---------------------------------------------------------------------------
// Sign-writer's font: a private 5×7 (variable width) capital alphabet with a
// little slab weight, so painted boards read as lettering, not as the HUD's
// 3×5 debug glyphs. Rows top→bottom, '#' = ink.
// ---------------------------------------------------------------------------
const SIGN_GLYPHS: Record<string, string[]> = {
  A: [' ### ', '#   #', '#   #', '#####', '#   #', '#   #', '#   #'],
  B: ['#### ', '#   #', '#   #', '#### ', '#   #', '#   #', '#### '],
  C: [' ### ', '#   #', '#    ', '#    ', '#    ', '#   #', ' ### '],
  D: ['#### ', '#   #', '#   #', '#   #', '#   #', '#   #', '#### '],
  E: ['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#####'],
  F: ['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#    '],
  G: [' ### ', '#   #', '#    ', '# ###', '#   #', '#   #', ' ####'],
  H: ['#   #', '#   #', '#   #', '#####', '#   #', '#   #', '#   #'],
  I: ['###', ' # ', ' # ', ' # ', ' # ', ' # ', '###'],
  J: ['  ###', '   # ', '   # ', '   # ', '   # ', '#  # ', ' ##  '],
  K: ['#   #', '#  # ', '# #  ', '##   ', '# #  ', '#  # ', '#   #'],
  L: ['#    ', '#    ', '#    ', '#    ', '#    ', '#    ', '#####'],
  M: ['#   #', '## ##', '# # #', '# # #', '#   #', '#   #', '#   #'],
  N: ['#   #', '##  #', '##  #', '# # #', '#  ##', '#  ##', '#   #'],
  O: [' ### ', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### '],
  P: ['#### ', '#   #', '#   #', '#### ', '#    ', '#    ', '#    '],
  Q: [' ### ', '#   #', '#   #', '#   #', '# # #', '#  # ', ' ## #'],
  R: ['#### ', '#   #', '#   #', '#### ', '# #  ', '#  # ', '#   #'],
  S: [' ####', '#    ', '#    ', ' ### ', '    #', '    #', '#### '],
  T: ['#####', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '  #  '],
  U: ['#   #', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### '],
  V: ['#   #', '#   #', '#   #', '#   #', '#   #', ' # # ', '  #  '],
  W: ['#   #', '#   #', '#   #', '# # #', '# # #', '# # #', ' # # '],
  X: ['#   #', '#   #', ' # # ', '  #  ', ' # # ', '#   #', '#   #'],
  Y: ['#   #', '#   #', ' # # ', '  #  ', '  #  ', '  #  ', '  #  '],
  Z: ['#####', '    #', '   # ', '  #  ', ' #   ', '#    ', '#####'],
  '0': [' ### ', '#   #', '#  ##', '# # #', '##  #', '#   #', ' ### '],
  '1': [' # ', '## ', ' # ', ' # ', ' # ', ' # ', '###'],
  '2': [' ### ', '#   #', '    #', '   # ', '  #  ', ' #   ', '#####'],
  '3': ['#### ', '    #', '    #', ' ### ', '    #', '    #', '#### '],
  '4': ['   # ', '  ## ', ' # # ', '#  # ', '#####', '   # ', '   # '],
  '5': ['#####', '#    ', '#### ', '    #', '    #', '#   #', ' ### '],
  '6': [' ### ', '#    ', '#    ', '#### ', '#   #', '#   #', ' ### '],
  '7': ['#####', '    #', '   # ', '  #  ', '  #  ', '  #  ', '  #  '],
  '8': [' ### ', '#   #', '#   #', ' ### ', '#   #', '#   #', ' ### '],
  '9': [' ### ', '#   #', '#   #', ' ####', '    #', '    #', ' ### '],
  '&': [' ##  ', '#  # ', '#  # ', ' ##  ', '# # #', '#  # ', ' ## #'],
  '$': ['  #  ', ' ####', '# #  ', ' ### ', '  # #', '#### ', '  #  '],
  "'": ['#', '#', ' ', ' ', ' ', ' ', ' '],
  '.': [' ', ' ', ' ', ' ', ' ', ' ', '#'],
  ',': ['  ', '  ', '  ', '  ', '  ', ' #', '# '],
  '-': ['   ', '   ', '   ', '###', '   ', '   ', '   '],
  '!': ['#', '#', '#', '#', '#', ' ', '#'],
  ' ': ['  ', '  ', '  ', '  ', '  ', '  ', '  '],
};
const SIGN_H = 7;

function signGlyph(ch: string): string[] {
  return SIGN_GLYPHS[ch.toUpperCase()] ?? SIGN_GLYPHS[' '];
}
/** Width in px of `text` in the sign font (bold adds one column per glyph). */
function signTextWidth(text: string, bold: boolean): number {
  let w = 0;
  for (const ch of text) w += signGlyph(ch)[0].length + (bold ? 1 : 0) + 1;
  return Math.max(0, w - 1);
}
/**
 * Paint sign lettering. `ink` may be a single colour or a gilded ramp
 * (light top rows, darker foot) like gold-leaf letters on a dark board.
 */
function signText(c: Ctx, text: string, x: number, y: number, ink: string | string[], bold: boolean, s = 1): void {
  let cx = x;
  for (const ch of text) {
    const g = signGlyph(ch);
    for (let row = 0; row < SIGN_H; row++) {
      const col = typeof ink === 'string' ? ink : ink[Math.min(ink.length - 1, Math.floor((row * ink.length) / SIGN_H))];
      for (let k = 0; k < g[row].length; k++) {
        if (g[row][k] !== '#') continue;
        rect(c, cx + k * s, y + row * s, (bold ? 2 : 1) * s, s, col);
      }
    }
    cx += (g[0].length + (bold ? 1 : 0) + 1) * s;
  }
}

/**
 * Painted sign board: dark board, light ink with a drop shadow (stays legible
 * when night darkens the scene), trim frame and weathered scuffs. Returns its rect.
 */
function signBoard(c: Ctx, text: string, cx: number, y: number, maxW: number, st: Style, r: Rng, ruined: boolean): { x: number; y: number; w: number; h: number } {
  let label = text;
  let bold = signTextWidth(label, true) + 12 <= maxW;
  if (!bold) while (label.length > 1 && signTextWidth(label, false) + 8 > maxW) label = label.slice(0, -1).trimEnd();
  const tw = signTextWidth(label, bold);
  const w = tw + (bold ? 12 : 8);
  const h = SIGN_H + 6;
  const x = Math.round(cx - w / 2);
  rect(c, x - 1, y - 1, w + 2, h + 2, '#1a120c');
  rect(c, x, y, w, h, st.trim === st.board ? '#efe6d0' : shade(st.trim, lum(st.trim) > 150 ? -0.1 : 0.25));
  rect(c, x + 1, y + 1, w - 2, h - 2, st.board);
  rect(c, x + 1, y + 1, w - 2, 1, shade(st.board, 0.18));
  // Board planks and weathering: lighter scuffs, a split seam, a thin inset rule.
  rect(c, x + 1, y + Math.floor(h / 2), w - 2, 1, shade(st.board, -0.12));
  for (let i = 0; i < Math.floor(w / 6); i++) rect(c, x + r.int(1, w - 3), r.chance(0.5) ? y + 1 : y + h - 2, r.int(1, 3), 1, shade(st.board, 0.22));
  if (bold && w > 40) {
    rect(c, x + 2, y + 2, w - 4, 1, shade(st.ink, -0.35));
    rect(c, x + 2, y + h - 3, w - 4, 1, shade(st.ink, -0.35));
  }
  const tx = x + Math.floor((w - tw) / 2);
  const ty = y + 3;
  const inkC = ruined ? shade(st.ink, -0.3) : st.ink;
  const gilded = !ruined && lum(st.ink) < 215; // gold / cream inks get a gold-leaf ramp
  signText(c, label, tx + 1, ty + 1, shade(st.board, -0.6), bold);
  signText(c, label, tx, ty, gilded ? [shade(inkC, 0.35), shade(inkC, 0.1), inkC, inkC, shade(inkC, -0.12), shade(inkC, -0.25), shade(inkC, -0.3)] : inkC, bold);
  if (ruined) for (let i = 0; i < Math.floor(tw / 3); i++) rect(c, tx + r.int(0, tw), ty + r.int(0, SIGN_H - 1), 1, 1, st.board); // flaked paint
  rect(c, x, y + h + 1, w, 1, 'rgba(20,12,8,0.35)');
  return { x, y, w, h };
}

interface WinOpts {
  frame: string;
  curtain: string | null;
  shutter: string | null;
  box: boolean;
  bars: boolean;
  lintel: string | null;
}

/** Window with frame, sill, muntins, optional curtains, shutters, bars and flower box. Glass rect = (x,y,w,h). */
function windowAt(c: Ctx, x: number, y: number, w: number, h: number, o: WinOpts, r: Rng): void {
  if (o.shutter) {
    for (const sx of [x - 4, x + w + 1]) {
      rect(c, sx, y - 1, 3, h + 2, o.shutter);
      for (let k = 1; k < h + 1; k += 2) rect(c, sx, y - 1 + k, 3, 1, shade(o.shutter, -0.3));
      rect(c, sx, y - 1, 1, h + 2, shade(o.shutter, 0.15));
    }
  }
  if (o.lintel) rect(c, x - 2, y - 3, w + 4, 2, o.lintel);
  rect(c, x - 1, y - 1, w + 2, h + 2, o.frame);
  rect(c, x, y, w, h, '#1e2a33');
  rect(c, x, y, w, 1, '#4a6170');
  rect(c, x, y + 1, 1, Math.max(1, h - 2), '#2c3c48');
  if (w > 4) rect(c, x + w - 2, y + 1, 1, 1, '#8aa4b4'); // glint
  if (o.curtain) {
    const cl = Math.max(1, Math.floor(w / 4));
    rect(c, x, y, cl, h - 1, o.curtain);
    rect(c, x + w - cl, y, cl, h - 1, o.curtain);
    rect(c, x, y, w, 1, shade(o.curtain, -0.2));
    rect(c, x + cl, y + 1, 1, 2, shade(o.curtain, -0.15));
    rect(c, x + w - cl - 1, y + 1, 1, 2, shade(o.curtain, -0.15));
  }
  const muntin = lum(o.frame) > 150 ? shade(o.frame, -0.3) : o.frame;
  rect(c, x + Math.floor(w / 2), y, 1, h, muntin);
  rect(c, x, y + Math.floor(h / 2), w, 1, muntin);
  if (o.bars) for (let bx = x + 1; bx < x + w; bx += 2) rect(c, bx, y, 1, h, '#2a2a2e');
  // Sill.
  rect(c, x - 2, y + h + 1, w + 4, 1, shade(o.frame, 0.2));
  rect(c, x - 2, y + h + 2, w + 4, 1, 'rgba(20,12,8,0.35)');
  if (o.box) {
    rect(c, x - 1, y + h + 2, w + 2, 3, '#6a4a30');
    rect(c, x - 1, y + h + 2, w + 2, 1, '#8a6440');
    for (let fx = x - 1; fx < x + w + 1; fx++) {
      rect(c, fx, y + h + 1, 1, 1, r.chance(0.7) ? '#4a7a3a' : '#5e8e44');
      if (r.chance(0.5)) rect(c, fx, y + h + (r.chance(0.5) ? 0 : 1), 1, 1, r.pick(FLOWERS));
    }
  }
}

// --- Porch props (standing on the ground line gy) ---------------------------
function barrel(c: Ctx, x: number, gy: number): void {
  rect(c, x, gy - 8, 6, 8, '#7a5236');
  rect(c, x + 1, gy - 8, 1, 8, '#94683f');
  rect(c, x + 5, gy - 8, 1, 8, '#5a3a24');
  rect(c, x, gy - 7, 6, 1, '#3a3632');
  rect(c, x, gy - 2, 6, 1, '#3a3632');
  rect(c, x, gy - 8, 6, 1, '#4a3424');
}
function crate(c: Ctx, x: number, gy: number): void {
  rect(c, x, gy - 7, 8, 7, '#9a7448');
  rect(c, x, gy - 7, 8, 1, '#b48c5a');
  rect(c, x + 7, gy - 7, 1, 7, '#6a4a2c');
  for (let k = 0; k < 6; k++) {
    rect(c, x + 1 + k, gy - 6 + k, 1, 1, '#6a4a2c');
    rect(c, x + 6 - k, gy - 6 + k, 1, 1, '#6a4a2c');
  }
}
function bench(c: Ctx, x: number, gy: number, w: number): void {
  rect(c, x, gy - 9, w, 1, '#5a3e28');
  rect(c, x, gy - 5, w, 2, '#8a6440');
  rect(c, x, gy - 5, w, 1, '#a57b57');
  rect(c, x + 1, gy - 3, 1, 3, '#4a3020');
  rect(c, x + w - 2, gy - 3, 1, 3, '#4a3020');
  rect(c, x, gy - 9, 1, 5, '#5a3e28');
  rect(c, x + w - 1, gy - 9, 1, 5, '#5a3e28');
}
function rocker(c: Ctx, x: number, gy: number): void {
  rect(c, x, gy - 11, 1, 9, '#5a3a24');
  rect(c, x + 1, gy - 11, 3, 1, '#5a3a24');
  rect(c, x + 1, gy - 9, 3, 1, '#6a4a2c');
  rect(c, x, gy - 5, 6, 2, '#8a6440');
  rect(c, x + 5, gy - 5, 1, 4, '#5a3a24');
  rect(c, x - 1, gy - 1, 8, 1, '#4a3020');
  rect(c, x - 1, gy - 2, 1, 1, '#4a3020');
  rect(c, x + 7, gy - 2, 1, 1, '#4a3020');
}
function planter(c: Ctx, x: number, gy: number, r: Rng): void {
  rect(c, x, gy - 4, 5, 4, '#9a5a3a');
  rect(c, x, gy - 4, 5, 1, '#b4704a');
  for (let k = 0; k < 5; k++) {
    rect(c, x + k, gy - 6 - (k % 2), 1, 2, '#4a7a3a');
    if (r.chance(0.6)) rect(c, x + k, gy - 7 - (k % 2), 1, 1, r.pick(FLOWERS));
  }
}
function sacks(c: Ctx, x: number, gy: number): void {
  rect(c, x, gy - 5, 6, 5, '#c8b48a');
  rect(c, x + 4, gy - 7, 5, 7, '#b8a47a');
  rect(c, x + 4, gy - 7, 5, 1, '#d8c49a');
  rect(c, x + 8, gy - 7, 1, 7, '#8a7a5a');
}
function milkcans(c: Ctx, x: number, gy: number): void {
  for (let k = 0; k < 2; k++) {
    rect(c, x + k * 5, gy - 7, 4, 7, '#9aa0a4');
    rect(c, x + k * 5 + 1, gy - 9, 2, 2, '#7a8084');
    rect(c, x + k * 5, gy - 7, 1, 7, '#c4cace');
  }
}
function woodstack(c: Ctx, x: number, gy: number, r: Rng): void {
  for (let row = 0; row < 3; row++)
    for (let k = 0; k < 4 - row; k++) {
      const lx = x + k * 3 + row;
      const ly = gy - 3 - row * 3;
      rect(c, lx, ly, 3, 3, r.chance(0.5) ? '#7a5436' : '#6a4a2c');
      rect(c, lx + 1, ly + 1, 1, 1, '#c8a070');
    }
}

/** Hanging lantern; its glass becomes a lit "window" after dusk. */
function lantern(c: Ctx, x: number, y: number, windows: BuildingSprite['windows']): void {
  rect(c, x, y - 2, 1, 2, '#2a2420');
  rect(c, x - 1, y, 3, 4, '#2a2420');
  rect(c, x, y + 1, 1, 2, '#e8c070');
  windows.push({ x, y: y + 1, w: 1, h: 2 });
}

/** Gable-front barn roof: ridge runs front-to-back, shingle courses run parallel to it. */
function barnRoof(c: Ctx, x: number, y: number, w: number, h: number, color: string, r: Rng, ruined: boolean): void {
  const mid = x + Math.floor(w / 2);
  for (let side = 0; side < 2; side++) {
    const base = shade(color, side === 0 ? 0.12 : -0.12);
    for (let course = 0; ; course++) {
      const cx0 = side === 0 ? mid - (course + 1) * 4 : mid + course * 4;
      if (side === 0 ? cx0 + 4 <= x : cx0 >= x + w) break;
      const gambrel = course * 4 > (w / 2) * 0.62;
      const ctone = shade(base, gambrel ? (side === 0 ? -0.06 : -0.1) : 0);
      let py = y - (course % 2 ? 3 : 0);
      while (py < y + h) {
        const sl = r.int(4, 7);
        const t = shade(ctone, r.range(-0.12, 0.1));
        const x0 = Math.max(x, cx0);
        const ww = Math.min(4, x + w - x0, cx0 + 4 - x0);
        const y0 = Math.max(y, py);
        const hh = Math.min(sl, y + h - y0);
        if (ww > 0 && hh > 0) {
          rect(c, x0, y0, ww, hh, t);
          rect(c, x0, y0, ww, 1, shade(t, -0.2));
          // Outer edge (away from the ridge) catches the shadow of the course above.
          rect(c, side === 0 ? x0 : x0 + ww - 1, y0, 1, hh, shade(t, -0.32));
        }
        py += sl;
      }
    }
  }
  for (let i = 0; i < Math.floor((w * h) / 360); i++) {
    const px = mid + r.int(4, Math.max(5, Math.floor(w / 2) - 6));
    const py = y + r.int(3, Math.max(4, h - 4));
    rect(c, px, py, 1, r.int(2, 4), r.chance(0.6) ? '#5a6a3a' : '#6e7a44');
  }
  rect(c, mid - 1, y, 2, h, shade(color, 0.3));
  rect(c, mid + 1, y, 1, h, shade(color, -0.3));
  rect(c, x, y, 1, h, shade(color, -0.4));
  rect(c, x + w - 1, y, 1, h, shade(color, -0.45));
  rect(c, x, y, w, 1, shade(color, -0.35));
  if (ruined) {
    c.save();
    c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 4; i++) c.fillRect(x + r.int(3, Math.max(4, w - 14)), y + r.int(3, Math.max(4, h - 10)), r.int(6, 12), r.int(4, 8));
    c.restore();
  }
}

/** Big weathered lettering painted across a barn roof slope (visible from any side). */
function roofLettering(c: Ctx, text: string, cx: number, y: number, maxW: number, r: Rng): void {
  const s = 2;
  if (signTextWidth(text, false) * s > maxW) return;
  const w = (signTextWidth(text, false) + 1) * s;
  const t = makeCanvas(w, SIGN_H * s);
  const tc = ctx2d(t);
  signText(tc, text, 0, 0, '#e8e0cc', false, s);
  tc.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < (w * SIGN_H * s) / 7; i++) tc.fillRect(r.int(0, w - 1), r.int(0, SIGN_H * s - 1), 1, 1);
  c.globalAlpha = 0.85;
  c.drawImage(t as CanvasImageSource, Math.round(cx - w / 2), y);
  c.globalAlpha = 1;
}

export function paintBuilding(b: Building): BuildingSprite {
  const r = new Rng(hashString(b.id));
  const st = rollStyle(b, r);
  const bw = b.w * 16;
  const top = b.facade + 6;
  const H = top + b.h * 16 + 4;
  const ext = makeCanvas(bw, H);
  const c = ctx2d(ext);
  const gy = top + b.h * 16; // ground line (bottom of the footprint)
  const barnish = b.type === 'barn' || b.type === 'stable';
  const commercial = COMMERCIAL.has(b.type);
  const church = b.type === 'church' || b.type === 'chapel';
  const adobe = b.wall === 'adobe';
  // Taller fronts so facades and signage, not roofs, dominate the street.
  let wallH = 26;
  if (barnish) wallH = 30;
  else if (church) wallH = 30;
  else if (commercial && !adobe) wallH = b.h >= 7 ? 38 : 32;
  else if (['sawmill', 'warehouse'].includes(b.type)) wallH = 30;
  else if (b.type === 'shack' || b.h <= 4) wallH = 24;
  wallH = Math.min(wallH, b.h * 16 - 22);
  const wallTop = gy - wallH;
  const windows: BuildingSprite['windows'] = [];
  let chimney: BuildingSprite['chimney'] = null;
  const tint = barnish && b.wall === 'plank' ? st.base : undefined;
  const doorX = (b.doorX - b.x) * 16 + 3;
  const doorC = doorX + 5;
  const frame = st.siding === 'native' ? shade(WALL[b.wall][0], -0.2) : st.trim;
  const falseFront = commercial && !adobe && b.wall !== 'log' && (b.facade > 0 || !!b.sign);
  const ff = falseFront ? Math.max(b.sign ? 18 : 12, b.facade + 8) : 0;

  // --- Roof ---------------------------------------------------------------
  const tin = TIN_ROOF.has(b.type) && b.wall !== 'log';
  const roofY = top - 4;
  const roofH = wallTop - top + 6;
  let ridgeAbs = roofY + Math.floor(roofH * 0.42);
  let monitor = false;
  const rustiness = b.ruined ? 1 : ['sawmill', 'warehouse', 'assay', 'tradingpost'].includes(b.type) ? r.range(0.6, 1) : r.range(0.2, 0.8);
  const seed = hashString(b.id + ':roof') & 0xffff;
  if (barnish && !adobe) barnRoof(c, 0, roofY, bw, roofH, b.roof, r, b.ruined);
  else if (adobe) adobeRoof(c, 0, roofY, bw, roofH, b.roof, r, b.ruined);
  else {
    // Deep buildings grew a rear lean-to: lower, a different material, stepped down behind the main roof.
    let mainY = roofY;
    let mainH = roofH;
    if (!b.ruined && roofH >= 84 && r.chance(0.8)) {
      const L = Math.floor(roofH * r.range(0.26, 0.34));
      if (tin ? r.chance(0.5) : r.chance(0.3)) tinRoof(c, 0, roofY, bw, L + 2, r, { ridgeFrac: 1, rust: Math.min(1, rustiness + 0.25), cap: false, seed: seed + 11 });
      else roofTexture(c, 0, roofY, bw, L + 2, shade(b.roof, r.range(-0.1, 0.08)), b.wall, r, false, 1, false);
      for (let k = 0; k < 5; k++) {
        c.fillStyle = `rgba(28,18,36,${0.08 + k * 0.08})`;
        c.fillRect(0, roofY + L - 5 + k, bw, 1);
      }
      mainY = roofY + L;
      mainH = roofH - L;
    }
    if (tin) tinRoof(c, 0, mainY, bw, mainH, r, { ridgeFrac: 0.42, rust: rustiness, cap: true, seed });
    else roofTexture(c, 0, mainY, bw, mainH, b.roof, b.wall, r, b.ruined, 0.42, true);
    if (mainY !== roofY) {
      rect(c, 0, mainY, bw, 1, '#2a2226');
      rect(c, 0, mainY + 1, bw, 1, tin ? '#9a9c98' : shade(b.roof, 0.25));
    }
    ridgeAbs = mainY + Math.floor(mainH * 0.42);
    // Clerestory monitor along the ridge of mills, warehouses and some big halls.
    monitor = tin && !b.ruined && bw >= 112 && mainH >= 50 && (['sawmill', 'warehouse', 'station'].includes(b.type) || r.chance(0.3));
    if (monitor) {
      const mw = Math.floor((bw * r.range(0.4, 0.6)) / 4) * 4;
      const mx = Math.floor((bw - mw) / 2 / 4) * 4;
      const my = ridgeAbs - 9;
      c.fillStyle = 'rgba(28,18,36,0.3)';
      c.fillRect(mx + 3, my + 14, mw, 4);
      tinRoof(c, mx, my, mw, 11, r, { ridgeFrac: 0.45, rust: rustiness * 0.8, cap: true, seed: seed + 5 });
      rect(c, mx, my + 11, mw, 4, '#5e4a38');
      rect(c, mx, my + 11, mw, 1, '#2a2226');
      for (let px = mx + 2; px < mx + mw - 3; px += 6) {
        rect(c, px, my + 12, 4, 2, '#1e1a18');
        rect(c, px, my + 12, 4, 1, '#3a3430');
      }
      rect(c, mx, my + 15, mw, 1, '#3a2e26');
    }
  }
  if (barnish && !b.ruined) {
    const word = (b.sign ?? b.name.split(/\s+/)[0] ?? '').toUpperCase();
    const half = Math.floor(bw / 2);
    const letterY = top + 2;
    if (word && wallTop - 36 - letterY > 10) roofLettering(c, word, Math.floor(half / 2) + 1, letterY, half - 10, r);
  }
  // Chimney / stovepipe.
  if (!b.ruined && CHIMNEY.has(b.type)) {
    const cx = r.int(8, Math.max(9, bw - 16));
    const cy = top + Math.floor((wallTop - top) * 0.25);
    chimney = { x: cx + 3, y: cy - 12 };
    if (b.type === 'shack' || (b.wall === 'log' && r.chance(0.5))) {
      rect(c, cx, cy - 8, 4, 12, '#2e2a28');
      rect(c, cx, cy - 8, 1, 12, '#4a4440');
      rect(c, cx - 1, cy - 9, 6, 2, '#3a3532');
      rect(c, cx + 4, cy + 2, 3, 2, 'rgba(20,12,30,0.35)');
    } else if (b.wall === 'log') {
      // Fieldstone chimney.
      rect(c, cx - 1, cy - 12, 10, 17, '#4e4840');
      for (let row = 0, py = cy - 11; py < cy + 4; row++, py += 3)
        for (let px = cx - 1 + (row % 2 ? 2 : 0); px < cx + 8; px += r.int(3, 4)) {
          const t = r.pick(['#8a847a', '#76706a', '#9a9288', '#6a645c']);
          rect(c, px, py, Math.min(3, cx + 9 - px), 2, t);
          rect(c, px, py, 1, 1, shade(t, 0.2));
        }
      rect(c, cx - 2, cy - 13, 12, 2, '#5a544c');
      rect(c, cx - 2, cy - 13, 12, 1, '#8a847a');
      rect(c, cx + 1, cy - 13, 6, 1, '#1e1a18');
      rect(c, cx + 9, cy - 10, 3, 15, 'rgba(20,12,30,0.32)');
    } else {
      rect(c, cx, cy - 10, 8, 14, '#7a3a2c');
      for (let k = 0; k < 14; k += 3) rect(c, cx, cy - 10 + k, 8, 1, '#5a2a20');
      rect(c, cx, cy - 10, 1, 14, '#9a5040');
      rect(c, cx - 1, cy - 11, 10, 2, '#4a2a22');
      rect(c, cx + 8, cy - 8, 3, 12, 'rgba(20,12,30,0.3)');
    }
  }

  // Roof vents on big tin roofs that have no chimney.
  if (tin && !chimney && !monitor && !b.ruined && bw >= 96) {
    for (let k = 0; k < (bw >= 160 ? 2 : 1); k++) {
      // Cowl ventilators sit on the ridge cap.
      const vx = Math.floor(bw * (bw >= 160 ? (k ? 0.72 : 0.28) : 0.5)) + r.int(-6, 6);
      const vy = ridgeAbs - 1;
      rect(c, vx - 2, vy + 1, 8, 3, 'rgba(20,12,30,0.35)');
      rect(c, vx, vy - 6, 4, 8, '#5a5e64');
      rect(c, vx, vy - 6, 1, 8, '#9aa0a6');
      rect(c, vx - 1, vy - 8, 6, 2, '#3e4248');
      rect(c, vx + 4, vy - 4, 3, 6, 'rgba(20,12,30,0.3)');
      rect(c, vx + 2, vy + 2, 1, 4, '#8a5030');
    }
  }

  // --- Front wall -----------------------------------------------------------
  siding(c, 0, wallTop, bw, wallH, b, st, r);
  // Corner boards.
  if (st.siding !== 'native') {
    rect(c, 0, wallTop, 2, wallH, frame);
    rect(c, bw - 2, wallTop, 2, wallH, shade(frame, -0.15));
  } else if (b.wall === 'log') {
    // Log ends notched at the corners.
    for (let py = wallTop; py < gy - 1; py += 4) {
      rect(c, 0, py, 3, 3, '#a8845c');
      rect(c, 1, py + 1, 1, 1, '#6a4a2c');
      rect(c, bw - 3, py, 3, 3, '#a8845c');
      rect(c, bw - 2, py + 1, 1, 1, '#6a4a2c');
    }
  }
  // Eave overhang shadow on the wall under the roof edge.
  if (!falseFront) {
    for (let k = 0; k < 4; k++) {
      c.fillStyle = `rgba(30,18,40,${0.42 - k * 0.1})`;
      c.fillRect(0, wallTop + 2 + k, bw, 1);
    }
  }
  rect(c, 0, wallTop, bw, 1, shade(st.base, -0.45));

  // --- False front / gable / tower / parapet -----------------------------
  let signY = -1;
  if (falseFront) {
    const fy = wallTop - ff;
    siding(c, 0, fy, bw, ff + 1, b, st, r);
    rect(c, 0, fy, 2, ff, frame);
    rect(c, bw - 2, fy, 2, ff, shade(frame, -0.15));
    // Crown: flat cornice, stepped, pediment or double-stepped.
    const crown = b.wall === 'brick' ? 0 : r.int(0, 3);
    const corn = b.wall === 'brick' ? '#c8bca4' : frame;
    if (crown === 1 || crown === 3) {
      const cw = Math.floor(bw * (crown === 1 ? 0.5 : 0.7));
      const cx0 = Math.floor((bw - cw) / 2);
      siding(c, cx0, fy - 5, cw, 6, b, st, r);
      rect(c, cx0 - 1, fy - 6, cw + 2, 2, corn);
      if (crown === 3) {
        const cw2 = Math.floor(bw * 0.3);
        const cx1 = Math.floor((bw - cw2) / 2);
        siding(c, cx1, fy - 9, cw2, 4, b, st, r);
        rect(c, cx1 - 1, fy - 10, cw2 + 2, 2, corn);
      }
    } else if (crown === 2) {
      const pw = Math.min(40, Math.floor(bw * 0.4));
      for (let k = 0; k < 7; k++) {
        const hw = Math.floor((pw / 2) * (1 - k / 7));
        rect(c, Math.floor(bw / 2) - hw, fy - k, hw * 2, 1, k === 6 ? corn : st.base);
        rect(c, Math.floor(bw / 2) - hw - 1, fy - k - 1, 2, 1, corn);
        rect(c, Math.floor(bw / 2) + hw - 1, fy - k - 1, 2, 1, corn);
      }
    }
    rect(c, 0, fy - 1, bw, 2, corn);
    rect(c, 0, fy + 1, bw, 1, shade(corn, -0.45));
    if (b.wall === 'brick' || r.chance(0.5)) for (let px = 2; px < bw - 2; px += 4) rect(c, px, fy + 2, 2, 1, shade(corn, -0.2)); // dentils
    // Shadow the false front casts on the roof behind it is implicit; give its base a sill line.
    rect(c, 0, wallTop - 1, bw, 1, shade(frame, -0.3));
    signY = fy + Math.max(4, Math.floor((ff - 14) / 2) + 2);
  }
  if (barnish && !adobe) {
    // Gambrel gable end facing the street, with hay loft.
    const gh = Math.max(20, Math.min(36, Math.floor(bw * 0.2)));
    const xl = (d: number) => (d <= gh * 0.62 ? Math.round((bw * 0.14 * d) / (gh * 0.62)) : Math.round(bw * 0.14 + ((bw / 2 - bw * 0.14) * (d - gh * 0.62)) / (gh * 0.38)));
    const tmp = makeCanvas(bw, gh + 1);
    const tc = ctx2d(tmp);
    siding(tc, 0, 0, bw, gh + 1, b, st, r);
    for (let d = 0; d <= gh + 2; d++) {
      const l = Math.max(0, xl(Math.min(d, gh)) - 2);
      rect(c, l, wallTop - d, bw - 2 * l, 1, shade(b.roof, -0.45)); // verge overhang
    }
    for (let d = 0; d <= gh; d++) {
      const l = xl(d);
      const y = wallTop - d;
      if (bw - 2 * l <= 0) continue;
      c.drawImage(tmp as CanvasImageSource, l, y - (wallTop - gh), bw - 2 * l, 1, l, y, bw - 2 * l, 1);
      rect(c, l, y, 1, 1, '#e6dccb');
      rect(c, bw - l - 1, y, 1, 1, '#e6dccb');
    }
    rect(c, 0, wallTop, bw, 1, '#e6dccb');
    rect(c, 0, wallTop + 1, bw, 2, 'rgba(30,18,40,0.3)');
    const signH = b.sign ? 14 : 0;
    const loftTop = wallTop - gh + 7;
    const loftBot = wallTop - (b.sign ? signH + 3 : 4);
    if (loftBot - loftTop >= 7) {
      const lw = 14;
      const lx = Math.floor(bw / 2 - lw / 2);
      rect(c, lx - 1, loftTop - 1, lw + 2, loftBot - loftTop + 2, '#e6dccb');
      rect(c, lx, loftTop, lw, loftBot - loftTop, '#241810');
      const hayH = Math.floor((loftBot - loftTop) * 0.55);
      rect(c, lx, loftBot - hayH, lw, hayH, '#c8a442');
      for (let k = 0; k < lw; k++) if (r.chance(0.6)) rect(c, lx + k, loftBot - hayH - r.int(1, 2), 1, 2, k % 2 ? '#d8b850' : '#b08a34');
      rect(c, lx + 1, loftBot, 3, 1, '#d8b850');
      // Hay hood and pulley beam.
      rect(c, Math.floor(bw / 2) - 1, wallTop - gh + 1, 2, 5, '#3a2a1c');
      rect(c, Math.floor(bw / 2), wallTop - gh + 6, 1, loftBot - loftTop - hayH, '#b8a07a');
    }
    if (b.sign) signY = wallTop - signH - 1;
  }
  if (church && b.facade > 0 && !adobe) {
    const fy = wallTop - 6;
    rect(c, 0, fy, bw, 6, st.base);
    siding(c, 0, fy, bw, 7, b, st, r);
    rect(c, 0, fy, bw, 2, shade(st.base, 0.1));
    // Steeple with louvred belfry and cross.
    const tx = Math.floor(bw / 2) - 7;
    siding(c, tx, fy - 18, 14, 20, b, st, r);
    rect(c, tx - 1, fy - 18, 1, 20, shade(st.base, -0.3));
    rect(c, tx + 14, fy - 18, 1, 20, shade(st.base, -0.35));
    for (let k = 0; k < 6; k++) rect(c, tx - 1 + k, fy - 19 - k, 16 - k * 2, 1, shade(b.roof, k < 2 ? -0.2 : 0));
    rect(c, tx + 4, fy - 13, 6, 7, '#1e1a18');
    for (let k = 0; k < 7; k += 2) rect(c, tx + 4, fy - 13 + k, 6, 1, '#3a3430');
    rect(c, tx + 6, fy - 10, 2, 3, '#b8963a');
    rect(c, tx + 6, fy - 32, 2, 8, '#3a2a1c');
    rect(c, tx + 4, fy - 29, 6, 2, '#3a2a1c');
    // Round window over the door.
    rect(c, doorC - 2, wallTop + 3, 4, 4, '#1e2a33');
    rect(c, doorC - 3, wallTop + 4, 6, 2, '#1e2a33');
    windows.push({ x: doorC - 2, y: wallTop + 3, w: 4, h: 4 });
  }
  if (adobe) {
    for (let px = 6; px < bw - 4; px += 10) {
      rect(c, px, wallTop + 2, 3, 2, '#4a3424');
      rect(c, px, wallTop + 4, 3, 1, 'rgba(30,18,40,0.35)');
    }
    if (b.facade > 0) {
      const fy = wallTop - b.facade;
      const pw = 30;
      wallTexture(c, Math.floor(bw / 2) - pw / 2, fy, pw, b.facade + 2, 'adobe', r);
      // Curved espadaña top.
      for (let k = 0; k < 4; k++) rect(c, Math.floor(bw / 2) - pw / 2 + k * 3, fy - k, pw - k * 6, 1, '#c09372');
      rect(c, Math.floor(bw / 2) - 4, fy + 4, 8, 8, '#1e1a18');
      rect(c, Math.floor(bw / 2) - 3, fy + 3, 6, 1, '#1e1a18');
      if (!b.ruined) rect(c, Math.floor(bw / 2) - 1, fy + 7, 2, 3, '#b8963a');
    }
  }

  // Front cross-gable over the door on homesteads: breaks the long eave line.
  if (HOMELY.has(b.type) && !b.ruined && !adobe && bw >= 80 && b.type !== 'barracks' && r.chance(b.type === 'house' || b.type === 'ranchhouse' ? 0.75 : 0.4)) {
    const gw = Math.min(56, Math.max(36, Math.floor(bw * 0.42))) & ~1;
    const gh = Math.floor(gw * 0.36);
    const gx = Math.max(2, Math.min(bw - gw - 2, doorC - gw / 2));
    const tmp = makeCanvas(gw, gh + 1);
    siding(ctx2d(tmp), 0, 0, gw, gh + 1, b, st, r);
    for (let d = 0; d <= gh + 2; d++) {
      const hw = Math.round((gw / 2 + 2) * (1 - d / (gh + 2)));
      if (hw > 0) rect(c, gx + gw / 2 - hw, wallTop - d + 1, hw * 2, 1, shade(b.roof, -0.4));
    }
    for (let d = 0; d < gh; d++) {
      const hw = Math.round((gw / 2) * (1 - d / gh));
      if (hw <= 0) continue;
      c.drawImage(tmp as CanvasImageSource, gw / 2 - hw, gh - d, hw * 2, 1, gx + gw / 2 - hw, wallTop - d, hw * 2, 1);
      rect(c, gx + gw / 2 - hw, wallTop - d, 1, 1, frame);
      rect(c, gx + gw / 2 + hw - 1, wallTop - d, 1, 1, frame);
    }
    // Attic window.
    const ay = wallTop - Math.floor(gh / 2) - 2;
    rect(c, gx + gw / 2 - 3, ay - 1, 6, 6, frame);
    rect(c, gx + gw / 2 - 2, ay, 4, 4, '#1e2a33');
    rect(c, gx + gw / 2 - 2, ay, 4, 1, '#4a6170');
    windows.push({ x: gx + gw / 2 - 2, y: ay, w: 4, h: 4 });
    rect(c, gx, wallTop, gw, 1, frame);
  }

  // --- Windows --------------------------------------------------------------
  const winBase: WinOpts = { frame, curtain: st.curtain, shutter: st.shutter, box: st.boxes, bars: b.type === 'bank' || b.type === 'sheriff', lintel: b.wall === 'brick' ? '#c8bca4' : null };
  const groundWin = (x: number, y: number, w: number, h: number, o: WinOpts) => {
    if (b.ruined && r.chance(0.5)) {
      rect(c, x - 1, y - 1, w + 2, h + 2, frame);
      rect(c, x, y, w, h, '#0e0b0a');
      rect(c, x + 1, y + h - 2, 2, 1, '#6a5a4a');
      return;
    }
    windowAt(c, x, y, w, h, o, r);
    windows.push({ x, y, w, h });
  };
  const doorClear = (x0: number, x1: number, pad: number) => x1 > doorX - pad && x0 < doorX + 10 + pad;
  if (commercial && !adobe) {
    // Ground floor: big display windows; upper storey: a regular row.
    const big = ['store', 'saloon', 'tailor', 'gunsmith', 'newspaper', 'tradingpost'].includes(b.type);
    const ww = big ? 12 : 7;
    const wh = big ? 10 : 9;
    const step = big ? 22 : r.pick([16, 18]);
    const wy = gy - 17;
    for (let px = 6; px + ww < bw - 5; px += step) {
      if (doorClear(px - 4, px + ww + 4, 2)) continue;
      groundWin(px, wy, ww, wh, { ...winBase, shutter: null, box: big ? false : winBase.box });
    }
    const upper = wallTop + 3;
    if (gy - 25 - upper >= 6) {
      const uh = Math.min(9, gy - 25 - upper);
      const ustep = r.pick([16, 18, 20]);
      for (let px = 7; px + 6 < bw - 5; px += ustep) groundWin(px, upper, 6, uh, { ...winBase, box: false, shutter: null });
    }
  } else if (!barnish && !church) {
    const ww = b.type === 'shack' ? 6 : r.pick([7, 8]);
    const step = r.pick([14, 16, 18]);
    const wy = wallTop + 7;
    for (let px = 7; px + ww < bw - 6; px += step) {
      if (doorClear(px - (winBase.shutter ? 5 : 2), px + ww + (winBase.shutter ? 5 : 2), 3)) continue;
      groundWin(px, wy, ww, Math.min(9, wallH - 14), winBase);
    }
  } else if (barnish) {
    for (let px = 8; px + 6 < bw - 6; px += 18) {
      if (doorClear(px - 10, px + 14, 0)) continue;
      // Barn and stable windows stay dark at night: nobody keeps a lamp burning in the hay.
      windowAt(c, px, wallTop + 7, 6, 6, { ...winBase, curtain: null, shutter: null, box: false }, r);
    }
  } else if (church) {
    for (let px = 8; px + 5 < bw - 6; px += 16) {
      if (doorClear(px - 4, px + 9, 2)) continue;
      // Tall arched windows.
      groundWin(px, wallTop + 8, 5, 12, { ...winBase, curtain: null, shutter: null, box: false });
      rect(c, px + 1, wallTop + 7, 3, 1, '#1e2a33');
    }
  }

  // --- Door -----------------------------------------------------------------
  if (barnish) {
    const dw = 24;
    const dh = Math.min(20, wallH - 6);
    const dx = doorC - dw / 2;
    const dy = gy - dh;
    const leaf = shade(st.base, -0.2);
    rect(c, dx - 2, dy - 3, dw + 4, 2, '#3a3632'); // sliding-door track
    rect(c, dx - 1, dy - 1, dw + 2, dh + 1, '#e6dccb');
    const open = !b.ruined && r.chance(0.35);
    if (open) {
      // One leaf slid open: dark stable interior and straw.
      battens(c, dx, dy, dw / 2, dh, leaf, r, 0);
      rect(c, dx + dw / 2, dy, dw / 2, dh, '#1a120c');
      rect(c, dx + dw / 2, gy - 3, dw / 2, 3, '#7a6232');
    } else battens(c, dx, dy, dw, dh, leaf, r, 0);
    for (let k = 0; k < 2; k++) {
      const lx = dx + k * (dw / 2);
      const lw = dw / 2;
      if (k === 1 && open) continue;
      rect(c, lx, dy, lw, 1, '#e6dccb');
      rect(c, lx, gy - 1, lw, 1, '#e6dccb');
      rect(c, lx, dy, 1, dh, '#e6dccb');
      rect(c, lx + lw - 1, dy, 1, dh, '#e6dccb');
      for (let i = 0; i < dh; i++) {
        const t = Math.round((i * (lw - 1)) / (dh - 1));
        rect(c, lx + t, dy + i, 1, 1, '#e6dccb');
        rect(c, lx + lw - 1 - t, dy + i, 1, 1, '#e6dccb');
      }
    }
    if (!b.ruined) lantern(c, dx - 4, dy - 6, windows);
  } else {
    const doorH = 16;
    const dy = gy - doorH;
    rect(c, doorX - 1, dy - 1, 12, doorH + 1, frame);
    if (b.type === 'saloon') {
      rect(c, doorX, dy, 10, doorH, '#1a1210');
      rect(c, doorX, dy + 5, 4, 7, '#8a6440');
      rect(c, doorX + 6, dy + 5, 4, 7, '#8a6440');
      rect(c, doorX, dy + 5, 4, 1, '#a57b57');
      rect(c, doorX + 6, dy + 5, 4, 1, '#a57b57');
      rect(c, doorX + 3, dy + 6, 1, 5, '#5a3e28');
      rect(c, doorX + 6, dy + 6, 1, 5, '#5a3e28');
    } else {
      const door = b.ruined ? '#241810' : r.pick(['#3a2618', '#4a2e1c', '#2e3a30', '#5a2a22', shade(st.trim, -0.2)]);
      rect(c, doorX, dy, 10, doorH, door);
      rect(c, doorX + 1, dy + 1, 3, 6, shade(door, 0.12));
      rect(c, doorX + 6, dy + 1, 3, 6, shade(door, 0.12));
      rect(c, doorX + 1, dy + 9, 3, 5, shade(door, 0.12));
      rect(c, doorX + 6, dy + 9, 3, 5, shade(door, 0.12));
      if (commercial) rect(c, doorX + 2, dy + 2, 6, 4, '#2a3a44'); // glazed upper panel
      rect(c, doorX + 7, dy + 9, 1, 1, '#c9a24a');
      rect(c, doorX - 1, dy - 2, 12, 1, shade(frame, 0.15)); // head trim
    }
    rect(c, doorX, gy - 1, 10, 1, '#2a1c12');
    // Little gabled hood over a homestead door.
    if (HOMELY.has(b.type) && !b.ruined && wallH >= 24) {
      for (let k = 0; k < 4; k++) rect(c, doorX - 2 + k, dy - 3 - k, 14 - k * 2, 1, shade(b.roof, k === 3 ? 0.1 : -0.1));
      rect(c, doorX - 2, dy - 2, 14, 1, 'rgba(30,18,40,0.4)');
    }
  }

  // --- Sign -----------------------------------------------------------------
  if (b.sign) {
    let sy = signY;
    if (sy < 0) {
      // No false front: board stands on the eave, braced by two short posts.
      sy = wallTop - 9;
      const sb = signBoard(c, b.sign, doorC, sy, bw - 8, st, r, b.ruined);
      rect(c, sb.x + 3, sb.y + sb.h + 1, 1, wallTop - (sb.y + sb.h) + 1, '#3a2a1c');
      rect(c, sb.x + sb.w - 4, sb.y + sb.h + 1, 1, wallTop - (sb.y + sb.h) + 1, '#3a2a1c');
    } else signBoard(c, b.sign, Math.floor(bw / 2), sy, bw - 8, st, r, b.ruined);
    if (!b.ruined && (falseFront || b.type === 'stable')) {
      const sbW = Math.min(bw - 8, signTextWidth(b.sign, true) + 12);
      const lx = Math.floor(bw / 2 - sbW / 2) - 4;
      if (lx > 3) lantern(c, lx, sy + 3, windows);
      if (bw - lx < bw - 3) lantern(c, bw - lx - 1, sy + 3, windows);
    }
  }

  // --- Porch / awning / balcony ------------------------------------------------
  const porchY = gy - 22; // porch roof line on two-storey fronts
  if (commercial && !adobe) {
    const awY = wallH >= 34 ? porchY : wallTop + 4;
    const canvasAwning = !b.ruined && ['store', 'tailor', 'doctor', 'gunsmith'].includes(b.type) && r.chance(0.6);
    // Shade under the porch roof.
    for (let k = 0; k < 9; k++) {
      c.fillStyle = `rgba(30,18,40,${0.4 - k * 0.04})`;
      c.fillRect(0, awY + 4 + k, bw, 1);
    }
    if (!b.ruined) {
      if (canvasAwning) {
        const a = r.pick(['#a83a2c', '#3a6a4a', '#2e4a6a', '#8a6a2a']);
        for (let px = 0; px < bw; px += 4) rect(c, px, awY, 4, 4, (px / 4) % 2 ? '#e8e0cc' : a);
        for (let px = 0; px < bw; px += 4) rect(c, px + 1, awY + 4, 2, 1, (px / 4) % 2 ? '#e8e0cc' : a); // scalloped valance
        rect(c, 0, awY, bw, 1, 'rgba(255,240,210,0.25)');
      } else {
        const ac = tin ? '#80848a' : shade(b.roof, 0.05);
        rect(c, 0, awY, bw, 4, ac);
        for (let px = 0; px < bw; px += tin ? 3 : 5) rect(c, px, awY, 1, 4, shade(ac, -0.2));
        rect(c, 0, awY, bw, 1, shade(ac, 0.25));
        rect(c, 0, awY + 3, bw, 1, shade(ac, -0.4));
      }
      // Hotels and saloons get a railed balcony on the porch roof.
      if ((b.type === 'hotel' || b.type === 'saloon') && wallH >= 34) {
        rect(c, 0, awY - 5, bw, 1, frame);
        for (let px = 1; px < bw; px += 3) rect(c, px, awY - 4, 1, 4, frame);
      }
      // Posts.
      const posts: number[] = [1, bw - 3];
      for (let px = 40; px < bw - 20; px += 40) if (!doorClear(px - 2, px + 2, 2)) posts.push(px);
      for (const px of posts) {
        rect(c, px, awY + 4, 2, gy + 3 - awY - 4, '#5a3e28');
        rect(c, px, awY + 4, 1, gy + 3 - awY - 4, '#7a5636');
        rect(c, px - 1, awY + 4, 4, 1, '#4a3020');
      }
    } else {
      // Ruined: only a couple of leaning posts remain.
      rect(c, 1, awY + 6, 2, gy - awY - 3, '#4a3424');
      for (let k = 0; k < gy - awY - 8; k++) if (k % 3 === 0) rect(c, bw - 6 + Math.floor(k / 6), awY + 8 + k, 2, 3, '#4a3424');
    }
  } else if (HOMELY.has(b.type) && !b.ruined && bw >= 80) {
    // Covered front porch across part (or all) of the house.
    const full = b.type === 'ranchhouse' || b.type === 'bunkhouse' || r.chance(0.4);
    if (full || r.chance(0.6)) {
      const px0 = full ? 0 : Math.max(0, doorX - 18);
      const px1 = full ? bw : Math.min(bw, doorX + 28);
      const py = wallTop + 4;
      for (let k = 0; k < 7; k++) {
        c.fillStyle = `rgba(30,18,40,${0.34 - k * 0.04})`;
        c.fillRect(px0, py + 3 + k, px1 - px0, 1);
      }
      const ac = shade(b.roof, 0.08);
      rect(c, px0, py, px1 - px0, 3, ac);
      for (let px = px0; px < px1; px += 4) rect(c, px, py + 2, 2, 1, shade(ac, -0.35));
      rect(c, px0, py, px1 - px0, 1, shade(ac, 0.25));
      for (const px of [px0 + 1, px1 - 3, ...(full ? [Math.floor(bw / 3), Math.floor((2 * bw) / 3)] : [])]) {
        if (doorClear(px - 1, px + 3, 1)) continue;
        rect(c, px, py + 3, 2, gy - py - 2, b.wall === 'log' ? '#6a4a2c' : st.trim);
      }
      rect(c, px0, gy - 2, px1 - px0, 2, '#7a5636');
      for (let px = px0; px < px1; px += 4) rect(c, px, gy - 2, 1, 2, '#5a3e28');
    }
  }

  // --- Lanterns by the door -----------------------------------------------------
  if (!b.ruined && !barnish && (commercial || r.chance(0.5)) && doorX - 4 > 2) lantern(c, doorX - 4, gy - 15, windows);

  // --- Lived-in props along the front ------------------------------------------
  if (!b.ruined) {
    const kit: ((x: number) => number)[] = [];
    const add = (p: (x: number) => void, w: number) => kit.push((x) => (p(x), w));
    if (commercial) {
      add((x) => barrel(c, x, gy), 7);
      if (b.type === 'store' || b.type === 'tradingpost') add((x) => sacks(c, x, gy), 10), add((x) => crate(c, x, gy), 9);
      if (b.type === 'saloon' || b.type === 'hotel' || b.type === 'sheriff') add((x) => bench(c, x, gy, 12), 13);
      if (r.chance(0.4)) add((x) => planter(c, x, gy, r), 6);
    } else if (barnish) {
      add((x) => barrel(c, x, gy), 7);
      add((x) => milkcans(c, x, gy), 10);
      if (r.chance(0.6)) add((x) => sacks(c, x, gy), 10);
    } else if (HOMELY.has(b.type) || b.type === 'shack') {
      if (r.chance(0.6)) add((x) => rocker(c, x, gy), 8);
      if (r.chance(0.5)) add((x) => planter(c, x, gy, r), 6);
      if (r.chance(0.5)) add((x) => barrel(c, x, gy), 7);
      if (b.wall === 'log' || r.chance(0.3)) add((x) => woodstack(c, x, gy, r), 13);
      if (r.chance(0.4)) add((x) => bench(c, x, gy, 10), 11);
    }
    // Place from both ends inward, never in front of the door or a doorway.
    let lx = 5;
    let rx = bw - 5;
    const reserve0 = barnish ? doorC - 16 : doorX - 4;
    const reserve1 = barnish ? doorC + 16 : doorX + 14;
    kit.forEach((place, i) => {
      if (i % 2 === 0) {
        const w = 13;
        if (lx + w < reserve0) lx += place(lx) + r.int(2, 6);
      } else {
        const w = 13;
        if (rx - w > reserve1) {
          const wPlaced = place(rx - w);
          rx -= wPlaced + r.int(2, 6);
        }
      }
    });
  }

  // --- Boardwalk, grime, contact shadow -------------------------------------------
  grime(c, 0, wallTop, bw, wallH);
  if (commercial && !b.ruined) {
    rect(c, 0, gy, bw, 4, '#7a5636');
    rect(c, 0, gy, bw, 1, '#94704f');
    for (let px = 0; px < bw; px += 4) rect(c, px + r.int(0, 1), gy, 1, 4, '#5a3e28');
    rect(c, 0, gy + 3, bw, 1, '#4a3020');
  }
  rect(c, 0, gy - 1, bw, 1, 'rgba(20,12,8,0.5)');
  if (b.ruined) {
    // Missing boards.
    c.save();
    c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 3; i++) c.fillRect(r.int(4, bw - 10), wallTop - ff + r.int(0, 6), r.int(3, 8), r.int(2, 5));
    c.restore();
  }

  // --- Interior cutaway: back wall + side walls + low front wall -------------
  const inter = makeCanvas(bw, H);
  const ic = ctx2d(inter);
  const backTop = top;
  wallTexture(ic, 0, backTop - 6, bw, 22, b.wall, r, tint);
  rect(ic, 0, backTop + 15, bw, 1, '#1e1610');
  wallTexture(ic, 0, backTop - 6, 12, b.h * 16 + 6, b.wall, r, tint);
  wallTexture(ic, bw - 12, backTop - 6, 12, b.h * 16 + 6, b.wall, r, tint);
  rect(ic, 11, backTop + 16, 1, b.h * 16 - 22, 'rgba(20,12,8,0.6)');
  rect(ic, bw - 12, backTop + 16, 1, b.h * 16 - 22, 'rgba(20,12,8,0.6)');
  // Lamps on the back wall.
  for (let px = 20; px < bw - 20; px += 40) {
    rect(ic, px, backTop + 4, 3, 5, '#c9a24a');
    rect(ic, px + 1, backTop + 5, 1, 3, '#fff0b0');
  }
  const fwy = top + b.h * 16 - 6;
  wallTexture(ic, 0, fwy, bw, 6, b.wall, r, tint);
  ic.clearRect(doorX, fwy, 10, 6);
  rect(ic, 0, backTop - 7, bw, 1, '#1e1610');
  // Back-wall decor: picture frames, lamps.
  for (let px = 10; px < bw - 12; px += 22) {
    rect(ic, px, backTop + 2, 8, 6, '#3a2618');
    rect(ic, px + 1, backTop + 3, 6, 4, r.chance(0.5) ? '#6a7a5a' : '#8a6a4a');
  }
  return { exterior: ext, interior: inter, ox: 0, oy: -top, windows, chimney };
}

const cache = new Map<string, BuildingSprite>();
export function buildingSprite(b: Building): BuildingSprite {
  let s = cache.get(b.id);
  if (!s) {
    s = paintBuilding(b);
    cache.set(b.id, s);
  }
  return s;
}
