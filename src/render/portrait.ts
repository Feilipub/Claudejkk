/**
 * Head-and-shoulders pixel portraits for dialogue, generated from the same
 * HumanLook as the world sprite so a character is recognisable in both.
 * 40×44 canvas, light from the upper-left, hue-shifted shading.
 *
 * Painted in layers (back hair → body → neck → face → features → facial
 * hair → front hair → hat) and snapped to the portrait's own palette so
 * every pixel is a deliberate colour, like hand-made pixel art. The seed
 * picks per-character variety: brow set (mood), nose, mouth, eye colour and
 * the cut of moustache or beard.
 */
import { Rng, hashString } from '../core/rng.ts';
import { luma, readableHair, type HumanLook } from './humanSprite.ts';
import { ctx2d, ellipse, makeCanvas, mix, pixelise, poly, rect, shade, type Ctx } from './pixel.ts';

export const PORTRAIT_W = 40;
export const PORTRAIT_H = 44;

const cache = new Map<string, HTMLCanvasElement | OffscreenCanvas>();

const WHITE_HAIR = '#d8d6d0';
const GREY_HAIR = '#9c9a95';
const DUST = '#b39a68';
const BRASS = '#e0bc58';
const LASH = '#24160f';
const SCLERA = '#f2ead8';
const SCLERA_D = '#c8bcaa';
const CATCH = '#fffaf0';

/** `child` paints rounder, younger proportions. */
export function portrait(look: HumanLook, seedKey: string, child = false): HTMLCanvasElement | OffscreenCanvas {
  const key = seedKey + (child ? 'c' : '') + JSON.stringify(look);
  const hit = cache.get(key);
  if (hit) return hit;
  const cv = makeCanvas(PORTRAIT_W, PORTRAIT_H);
  const c = ctx2d(cv);
  const used = new Set<string>();
  const brush = new Brush(c, used);
  // Wear has its own stream so adding it never reshuffles faces players already know.
  paint(brush, look, new Rng(hashString(seedKey)), new Rng(hashString(seedKey + '#wear')), child || !!look.child);
  // Snap anti-aliased edges back onto the painted palette, then clear the
  // stray single pixels that snapping leaves inside flat areas (hand-made
  // pixel art keeps colour in clean clusters). Deliberate dots survive.
  snapToPalette(c, [...used]);
  despeckle(c, brush.keep);
  pixelise(c, PORTRAIT_W, PORTRAIT_H, null, '#1a120c', 255);
  if (cache.size > 120) cache.delete(cache.keys().next().value!);
  cache.set(key, cv);
  return cv;
}

/**
 * Threshold alpha and snap anti-aliased pixels to the nearest painted colour
 * (plain RGB distance, so warm browns never snap onto brass or skin).
 */
function snapToPalette(c: Ctx, palette: string[]): void {
  const img = c.getImageData(0, 0, PORTRAIT_W, PORTRAIT_H);
  const d = img.data;
  const pal = palette.map((h) => {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
  });
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3]! < 128) {
      d[i + 3] = 0;
      continue;
    }
    d[i + 3] = 255;
    let best = pal[0]!;
    let bd = Infinity;
    for (const q of pal) {
      const dd = (q[0] - d[i]!) ** 2 + (q[1] - d[i + 1]!) ** 2 + (q[2] - d[i + 2]!) ** 2;
      if (dd < bd) {
        bd = dd;
        best = q;
        if (dd === 0) break;
      }
    }
    d[i] = best[0];
    d[i + 1] = best[1];
    d[i + 2] = best[2];
  }
  c.putImageData(img, 0, 0);
}

/** Replace isolated pixels whose 4-neighbourhood agrees (3 of 4) on another colour. */
function despeckle(c: Ctx, keep: Set<number>): void {
  const W = PORTRAIT_W;
  const H = PORTRAIT_H;
  const img = c.getImageData(0, 0, W, H);
  const d = img.data;
  const src = new Uint32Array(new Uint8ClampedArray(d).buffer);
  const out = new Uint32Array(d.buffer);
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (keep.has(i) || (src[i]! >>> 24) === 0) continue;
      const n = [src[i - 1]!, src[i + 1]!, src[i - W]!, src[i + W]!];
      if (n.includes(src[i]!)) continue;
      for (const v of n) {
        if ((v >>> 24) === 0) continue;
        let k = 0;
        for (const u of n) if (u === v) k++;
        if (k >= 3) {
          out[i] = v;
          break;
        }
      }
    }
  c.putImageData(img, 0, 0);
}

/** Thin wrapper over the pixel helpers that records every colour used. */
class Brush {
  readonly c: Ctx;
  /** Pixel indices placed deliberately one at a time (never despeckled). */
  readonly keep = new Set<number>();
  private used: Set<string>;
  constructor(c: Ctx, used: Set<string>) {
    this.c = c;
    this.used = used;
  }
  private k(col: string): string {
    this.used.add(col);
    return col;
  }
  e(x: number, y: number, rx: number, ry: number, col: string, rot = 0): void {
    ellipse(this.c, x, y, rx, ry, this.k(col), rot);
  }
  p(pts: [number, number][], col: string): void {
    poly(this.c, pts, this.k(col));
  }
  r(x: number, y: number, w: number, h: number, col: string): void {
    rect(this.c, x, y, w, h, this.k(col));
    if (w * h <= 3 && Number.isInteger(x) && Number.isInteger(y)) for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.keep.add((y + j) * PORTRAIT_W + x + i);
  }
  d(x: number, y: number, col: string): void {
    this.c.fillStyle = this.k(col);
    this.c.fillRect(Math.round(x), Math.round(y), 1, 1);
    this.keep.add(Math.round(y) * PORTRAIT_W + Math.round(x));
  }
  /** Run `fn` with drawing clipped to `path`. */
  clip(path: (c: Ctx) => void, fn: () => void): void {
    this.c.save();
    this.c.beginPath();
    path(this.c);
    this.c.clip();
    fn();
    this.c.restore();
  }
}

type Mood = 'calm' | 'stern' | 'kind' | 'wry';

function paint(b: Brush, L: HumanLook, r: Rng, w: Rng, child: boolean): void {
  const cx = 20;
  const fem = L.skirt;
  const old = !child && L.hair === WHITE_HAIR;
  const greying = !child && (old || L.hair === GREY_HAIR);
  const skin = L.skin;
  const dark = luma(skin) < 0.32;
  // Dark skin carries stronger, warmer highlights so planes still read.
  const skinL = shade(skin, dark ? 0.2 : 0.12);
  const skinLL = shade(skin, dark ? 0.36 : 0.24);
  // Shadow steps are shorter on dark skin: the same multiply would push the
  // jaw and mouth into the hair's value range and read as a beard.
  const skinD = shade(skin, dark ? -0.09 : -0.16);
  const skinDD = shade(skin, dark ? -0.18 : -0.32);
  const { hair, hairL, hairD } = readableHair(L.hair, skin);
  // On dark skin a red mix turns muddy: tint lips toward a cool plum and
  // keep the blush light and warm so it reads as glow, not bruise.
  const lip = dark ? mix(shade(skin, -0.1), '#8a3a4a', fem ? 0.3 : 0.18) : fem ? mix(skin, '#a84a46', 0.42) : mix(skin, '#7a3a30', 0.35);
  const rose = dark ? mix(shade(skin, 0.14), '#d86a5a', fem || child ? 0.22 : 0.12) : mix(skin, '#d8605a', fem || child ? 0.32 : 0.18);
  // How lived-in the clothes are: 0 kept, 1 worn, 2 patched and battered.
  const rich = (L.hat === 'derby' || L.hat === 'bowler' || L.hat === 'flat') && !!L.coat;
  const wear = rich ? 0 : Math.min(L.badge || fem ? 1 : 2, child ? w.int(0, 2) : w.chance(0.4) ? 2 : 1);
  const iris = r.pick(['#3a2614', '#4a3218', '#2a1c12', '#5a3a1e', '#2a3a5a', '#3a4a2a', '#2e4458']);
  const mood: Mood = child ? r.pick(['kind', 'calm'] as const) : fem ? r.pick(['kind', 'calm', 'wry'] as const) : r.pick(['calm', 'stern', 'kind', 'wry'] as const);
  const noseKind = child ? 0 : r.int(0, 3);

  // Proportions.
  const jaw = child ? 7.6 : (L.build === 'stocky' ? 8.4 : L.build === 'slim' ? 6.6 : 7.4) * (fem ? 0.95 : 1);
  const faceH = child ? 8.6 : L.build === 'slim' ? 10 : 9.6;
  const faceY = child ? 22 : 21;
  const crown = faceY - faceH; // top of the skull
  const eyeY = child ? faceY : faceY - 1;
  const chinY = faceY + faceH - 0.5;
  const jawSq = L.build === 'stocky' && !fem && !child ? 0.6 : 0;
  const eyeDX = jaw < 7 ? 3 : 3.5;

  const facePath = (c: Ctx) => {
    c.ellipse(cx, faceY - 2, jaw, faceH - 1.5, 0, Math.PI, 0);
    const pts: [number, number][] = [
      [cx + jaw, faceY - 2],
      [cx + jaw + 0.2, faceY + 1],
      [cx + jaw - 1 + jawSq, faceY + 5.5],
      [cx + (child ? 3.2 : 2.6 + jawSq), chinY - 0.6],
      [cx, chinY],
      [cx - (child ? 3.2 : 2.6 + jawSq), chinY - 0.6],
      [cx - jaw + 1 - jawSq, faceY + 5.5],
      [cx - jaw - 0.2, faceY + 1],
      [cx - jaw, faceY - 2],
    ];
    for (const [x, y] of pts) c.lineTo(x, y);
    c.closePath();
  };

  // ---- Hair behind the head ------------------------------------------------
  const longish = L.hairStyle === 'long' || L.hairStyle === 'curly' || (fem && L.hairStyle !== 'bald' && L.hairStyle !== 'short');
  if (L.hairStyle === 'long' || (L.hairStyle === 'curly' && fem)) {
    const len = fem ? 16 : 12;
    b.e(cx, faceY - 3, jaw + 3, faceH + 1, hair);
    b.r(cx - jaw - 3, faceY - 3, 5, len, hair);
    b.r(cx + jaw - 2, faceY - 3, 5, len, hairD);
    b.r(cx - jaw - 2, faceY - 1, 1, len - 4, hairL); // sheen strand
    b.d(cx - jaw - 3, faceY + len - 4, hairD);
  } else if (L.hairStyle === 'bun') {
    b.e(cx + jaw * 0.2, crown + 1, 4, 3.6, hairD);
    b.e(cx + jaw * 0.2 - 1, crown, 2.6, 2.2, hair);
  } else if (L.hairStyle === 'curly') {
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (0.9 + (i / 8) * 1.2);
      b.e(cx + Math.cos(a) * (jaw + 1.5), faceY - 3 + Math.sin(a) * (faceH - 1), 2.4, 2.4, i % 3 === 0 ? hairD : hair);
    }
  }
  if (L.hat === 'bonnet') b.e(cx, crown + 7, jaw + 5, 12.5, shade(L.hatColor, -0.28));

  // ---- Neck ------------------------------------------------------------------
  const neckW = fem || child ? 5 : L.build === 'stocky' ? 8 : 6;
  b.r(cx - neckW / 2, faceY + 4, neckW, 30 - faceY, skin);
  b.r(cx + neckW / 2 - 2, faceY + 4, 2, 30 - faceY, skinD);
  b.r(cx - neckW / 2, chinY, neckW, 2, skinDD); // shadow under the jaw
  if (!fem && !child && L.build !== 'slim') b.d(cx, chinY + 3, skinD); // throat

  // ---- Shoulders & clothes ---------------------------------------------------
  paintBody(b, L, r, w, wear, cx, child);

  // ---- Ears ------------------------------------------------------------------
  if (!(longish && fem) && L.hat !== 'bonnet') {
    for (const side of [-1, 1]) {
      const ex = cx + side * (jaw + 0.6);
      b.e(ex, faceY + 1, 1.7, 2.6, side < 0 ? skin : skinD);
      b.d(ex + (side < 0 ? 0 : 0), faceY + 1, skinDD);
    }
  }

  // ---- Face ------------------------------------------------------------------
  b.clip(facePath, () => {
    b.r(0, 0, 40, 44, skin);
    // Light from the upper-left: lit forehead/cheek, shadowed right side and jaw.
    b.e(cx - 2.5, faceY - 3.5, jaw * 0.75, faceH * 0.55, skinL);
    b.e(cx - 3.5, faceY - 5, 2.4, 1.6, skinLL);
    b.p([[cx + jaw * 0.45, faceY - 8], [cx + jaw + 1, faceY - 8], [cx + jaw + 1, chinY + 1], [cx + 1, chinY + 1], [cx + jaw * 0.55, faceY + 4]], skinD);
    b.p([[cx - jaw - 1, faceY + 4.5], [cx - jaw + 1.5, faceY + 6.5], [cx - 1, chinY - 0.4], [cx - 1, chinY + 1], [cx - jaw - 1, chinY + 1]], skinD);
    // Cheek glow.
    if (fem || child || mood === 'kind') {
      b.e(cx - eyeDX - 0.5, faceY + 2.6, 1.6, 0.9, rose);
      b.e(cx + eyeDX + 0.5, faceY + 2.6, 1.4, 0.9, mix(rose, skinD, 0.5));
    }
    // Age.
    if (greying && !fem) {
      b.r(cx - jaw + 1.5, faceY + 3, 1, 3, skinD); // nasolabial folds
      b.r(cx + jaw - 2.5, faceY + 3, 1, 3, skinDD);
    }
    if (old) {
      b.r(cx - 4, crown + 3.2, 8, 1, skinD); // forehead lines
      b.r(cx - 3, crown + 5, 5, 1, skinD);
    }
  });

  // ---- Eyes & brows ----------------------------------------------------------
  const browCol = greying ? (old ? '#e4e2dc' : shade(GREY_HAIR, -0.15)) : fem ? shade(hair, 0.06) : hairD;
  for (const side of [-1, 1]) {
    const ex = Math.round(cx + side * eyeDX - (side < 0 ? 2.5 : 0.5));
    // ex = left pixel of a 4-wide eye: white on both sides of the iris so
    // the eye reads as an eye on any skin tone, even under a hat brim.
    const ew = 4;
    const eh = child ? 3 : 2;
    const ey = Math.round(eyeY);
    b.r(ex, ey, ew, eh, SCLERA);
    b.d(side < 0 ? ex : ex + ew - 1, ey + eh - 1, SCLERA_D); // corner in shade
    const ix = ex + 1;
    b.r(ix, ey, 2, eh, iris);
    b.r(ix, ey, 2, 1, shade(iris, -0.45)); // pupil/lid shadow along the top
    b.d(ix + 1, ey + eh - 1, shade(iris, 0.3)); // lit lower iris
    b.d(ix, ey, CATCH); // catch-light, always on the lit side
    if (dark) b.r(ex, ey + eh, ew, 1, skinL); // lit lower lid separates eye from cheek
    // Upper lid: a heavy lash line carries expression.
    b.r(ex - (side < 0 ? 1 : 0), ey - 1, ew + 1, 1, fem || child ? LASH : skinDD);
    if (fem) b.d(side < 0 ? ex - 1 : ex + ew, ey - 1, LASH);
    if (mood === 'wry' && side > 0) b.r(ex, ey, ew, 1, skinD); // one lid half-closed
    if (mood === 'stern') b.r(ex, ey, ew, 1, skinDD);
    // Lower lid / age.
    b.d(side < 0 ? ex : ex + ew - 1, ey + eh, skinD);
    if (greying) {
      b.r(ex, ey + eh, ew, 1, skinD);
      b.d(side < 0 ? ex - 1 : ex + ew, ey + eh, skinDD); // crow's feet
    }
    // Brow.
    const by = ey - (child ? 3 : 3);
    const thick = !fem && !child && (L.build === 'stocky' || greying) ? 2 : 1;
    const inner = side < 0 ? ex + ew : ex - 1;
    const outer = side < 0 ? ex - 1 : ex + ew;
    const step = side < 0 ? 1 : -1;
    for (let i = 0; i <= ew + 1; i++) {
      const x = outer + step * i;
      let y = by;
      if (mood === 'stern' && Math.abs(x - inner) <= 1) y += 1;
      if (mood === 'kind' && Math.abs(x - outer) <= 0) y += 1;
      if ((mood === 'wry' && side < 0 && i >= 1 && i <= 2) || (fem && i >= 1 && i <= 2)) y -= 1;
      b.r(x, y, 1, thick, browCol);
    }
  }

  // ---- Nose --------------------------------------------------------------------
  const nTop = Math.round(eyeY + 1);
  const nBot = Math.round(faceY + (child ? 2.5 : 3.6));
  if (child) {
    b.d(cx + 1, nBot - 1, skinD);
    b.d(cx, nBot, skinD);
    b.d(cx - 1, nBot - 1, skinLL);
  } else {
    const w = noseKind === 2 ? 2 : 1;
    b.r(cx + 1, nTop + 1, 1, nBot - nTop - 1, skinD); // shadow side of the bridge
    b.r(cx - 1, nTop + 1, 1, nBot - nTop - 2, skinL);
    if (noseKind === 3) b.d(cx + 1, nTop + 2, skinDD); // broken bump
    b.r(cx - w, nBot, w * 2 + 1, 1, skinD);
    b.d(cx - w - 1, nBot, skinDD);
    b.d(cx + w + 1, nBot, skinDD);
    b.d(cx, nBot - 1, skinLL); // tip highlight
    if (!dark) b.r(cx - 1, nBot + 1, 3, 1, skinD); // shadow under the nose
  }

  // ---- Mouth -------------------------------------------------------------------
  const mY = Math.round(faceY + (child ? 4.6 : 6));
  const mW = child ? 3 : fem ? 4 : 5;
  const mX = Math.round(cx - mW / 2);
  b.r(mX, mY, mW, 1, fem ? lip : skinDD);
  if (fem) {
    b.r(mX + 1, mY + 1, mW - 2, 1, shade(lip, 0.12));
    b.d(mX + 1, mY - 1, shade(lip, -0.1));
    b.d(mX + mW - 2, mY - 1, shade(lip, -0.1));
  } else b.r(mX + 1, mY + 1, mW - 2, 1, mix(skin, lip, 0.5));
  if (mood === 'kind' || child) {
    b.d(mX - 1, mY - 1, skinDD);
    b.d(mX + mW, mY - 1, skinDD);
  } else if (mood === 'wry') b.d(mX + mW, mY - 1, skinDD);
  else if (mood === 'stern') {
    b.d(mX - 1, mY + 1, skinDD);
    b.d(mX + mW, mY + 1, skinDD);
  }
  b.d(cx - 1, mY + 2, skinL); // chin catch-light
  if (child && r.chance(0.5)) {
    const fr = mix(skin, '#8a4a2a', 0.35);
    for (const [x, y] of [[-5, 1], [-4, 2], [-6, 2], [4, 1], [5, 2], [3, 2]] as const) b.d(cx + x, faceY + y, fr);
  }

  // ---- Facial hair -------------------------------------------------------------
  if (!child && !fem) paintFacialHair(b, L, r, cx, faceY, jaw, chinY, mY, skin, hair, hairL, hairD, facePath);

  // ---- Front hair ----------------------------------------------------------------
  paintHair(b, L, r, cx, faceY, crown, jaw, child, hair, hairL, hairD, skinL);

  // ---- Hat -------------------------------------------------------------------------
  paintHat(b, L, w, wear, cx, crown, faceY, jaw, child, skin, facePath);
}

function paintBody(b: Brush, L: HumanLook, r: Rng, w: Rng, wear: number, cx: number, child: boolean): void {
  const fem = L.skirt;
  const half = child ? 12 : L.build === 'stocky' ? 18.5 : L.build === 'slim' ? 15 : 16.5;
  const sh = fem ? half - 1.5 : half;
  const top = child ? 33 : 31.5;
  const x0 = cx - sh;
  const x1 = cx + sh;
  const torsoShape: [number, number][] = [[x0 - 1, 44], [x0, 38], [x0 + 2, 34.5], [x0 + 6, top + 0.5], [cx - 4, top], [cx + 4, top], [x1 - 6, top + 0.5], [x1 - 2, 34.5], [x1, 38], [x1 + 1, 44]];
  const shirt = L.shirt;
  const shirtL = shade(shirt, 0.16);
  const shirtD = shade(shirt, -0.2);
  const outer = L.coat ?? L.vest ?? shirt;
  const outerL = shade(outer, 0.16);
  const outerD = shade(outer, -0.24);
  b.p(torsoShape, outer);
  // Upper-left shoulder catches the light; right side falls into shade.
  b.p([[x0, 38], [x0 + 2, 34.5], [x0 + 6, top + 0.5], [cx - 5, top + 0.2], [x0 + 5, top + 3]], outerL);
  b.p([[x1 + 1, 44], [x1, 38], [x1 - 2, 34.5], [x1 - 4, 36], [x1 - 4, 44]], outerD);
  if (L.coat || L.vest) {
    // Open front showing the shirt (and the vest under a coat).
    const open = L.coat ? 7 : 5;
    if (L.coat && L.vest) {
      b.p([[cx - open, top], [cx + open, top], [cx + 3, 44], [cx - 3, 44]], L.vest);
      b.p([[cx - 3.5, top], [cx + 3.5, top], [cx + 1.5, 40], [cx - 1.5, 40]], shirt);
      for (const y of [38, 41]) b.d(cx + 2, y, shade(L.vest, 0.35));
    } else {
      b.p([[cx - open, top], [cx + open, top], [cx + 1.5, 44], [cx - 1.5, 44]], shirt);
      if (L.vest) for (const y of [37, 40, 43]) b.d(cx + 1 + Math.round((y - 37) / 5), y, shade(L.vest, 0.35));
    }
    if (L.coat) {
      // Notched lapels.
      b.p([[cx - open, top], [cx - 3, 38], [cx - 4, 44], [cx - 6, 44], [cx - open - 2, 36], [cx - open - 1, top + 1]], shade(L.coat, 0.1));
      b.p([[cx + open, top], [cx + 3, 38], [cx + 4, 44], [cx + 6, 44], [cx + open + 2, 36], [cx + open + 1, top + 1]], shade(L.coat, -0.12));
      b.d(cx - open - 1, 35, outerD);
      b.d(cx + open + 1, 35, outerD);
    }
    if (L.vest && !L.coat && !L.apron) for (let i = 0; i < 3; i++) b.d(cx - 7 + i, 39 + (i === 1 ? 1 : 0), BRASS); // watch chain
  } else if (fem) {
    // Blouse: pin-tucks and a brooch.
    b.r(cx - 5, top + 3, 1, 44 - top, shirtD);
    b.r(cx + 4, top + 3, 1, 44 - top, shirtD);
    b.r(cx - 3, top + 4, 1, 44 - top, shirtL);
  } else {
    // Placket and buttons, braces over a work shirt.
    b.r(cx - 0.5, top + 3, 1, 44 - top, shirtD);
    for (const y of [36, 40]) b.d(cx + 1, y, shirtL);
    if (!L.apron && !child && r.chance(0.6)) {
      const br = shade(L.pants, -0.1);
      b.r(cx - 9, top + 1, 2, 44 - top, br);
      b.r(cx + 7, top + 1, 2, 44 - top, shade(br, -0.15));
      b.d(cx - 8, 42, BRASS);
      b.d(cx + 8, 42, BRASS);
    }
  }
  // Collar.
  if (fem) {
    b.p([[cx - 4, top - 2], [cx + 4, top - 2], [cx + 4.5, top + 1.5], [cx, top + 2.5], [cx - 4.5, top + 1.5]], shirtL);
    b.r(cx - 4, top + 1, 8, 1, shirtD);
    b.e(cx, top + 3, 1.3, 1.3, L.badge ? BRASS : mix(L.hatColor, '#8a3a3a', 0.5)); // brooch
    b.d(cx - 0.5, top + 2.5, '#fff2c8');
  } else {
    b.p([[cx - 5, top - 0.5], [cx - 0.5, top + 4], [cx - 3, top + 4.5], [cx - 6, top + 1]], shirtL);
    b.p([[cx + 5, top - 0.5], [cx + 0.5, top + 4], [cx + 3, top + 4.5], [cx + 6, top + 1]], shade(shirt, 0.04));
  }
  if (L.apron) {
    const a = L.apron;
    b.r(cx - 6, 37, 12, 7, a);
    b.r(cx - 6, 37, 12, 1, shade(a, 0.15));
    b.r(cx + 4, 38, 2, 6, shade(a, -0.15));
    b.r(cx - 6, top + 1, 1, 6, shade(a, -0.1)); // neck strap
    b.r(cx + 5, top + 1, 1, 6, shade(a, -0.2));
  }
  if (L.bandana) {
    const bd = L.bandana;
    b.p([[cx - 6, top - 1], [cx + 6, top - 1], [cx + 4, top + 3], [cx, top + 7], [cx - 4, top + 3]], bd);
    b.p([[cx - 6, top - 1], [cx + 6, top - 1], [cx + 5, top + 1], [cx - 5, top + 1]], shade(bd, -0.18)); // wrapped band
    b.e(cx + 3, top + 1, 1.6, 1.2, shade(bd, 0.1)); // knot
    b.d(cx - 2, top + 3, shade(bd, 0.3));
    b.d(cx - 1, top + 5, mix(bd, '#f0e0c0', 0.5)); // print dots
    b.d(cx + 1, top + 3, mix(bd, '#f0e0c0', 0.5));
  }
  if (L.badge && !fem) {
    // Five-point star on the left breast.
    const sx = cx - 10.5;
    const sy = 38.5;
    const pts: [number, number][] = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? 1.2 : 2.8;
      pts.push([sx + Math.cos(a) * rr, sy + Math.sin(a) * rr]);
    }
    b.p(pts, BRASS);
    b.d(sx - 1, sy - 1, '#fff2a8');
    b.d(sx + 1, sy + 1, shade(BRASS, -0.3));
  }
  paintWear(b, L, w, wear, cx, x0, x1, top, outer, outerD, shirt, child);
}

/**
 * Lived-in clothes: shoulder seams, abraded edges, a frayed collar, sun-faded
 * patches with visible stitching and dust settling low. Clustered on the
 * shoulders and collar where the eye already is, so the face stays clean.
 */
function paintWear(b: Brush, L: HumanLook, w: Rng, wear: number, cx: number, x0: number, x1: number, top: number, outer: string, outerD: string, shirt: string, child: boolean): void {
  const fem = L.skirt;
  const layered = !!(L.coat || L.vest);
  if (wear >= 1) {
    // Dust settles on the lit shoulder and in the folds low on the chest.
    b.r(x0 + 2, 36, 3, 1, mix(outer, DUST, 0.35));
    b.r(x0 + 1, 42, 4, 2, mix(outer, DUST, 0.22)); // dust settled low on the lit side
    if (L.coat) {
      // Lapel edges rubbed pale.
      const rub = mix(L.coat, DUST, 0.45);
      b.d(cx - 8, top + 3, rub);
      b.d(cx - 5, top + 7, rub);
      b.d(cx + 6, top + 6, shade(rub, -0.15));
    }
    if (!L.bandana && !fem && !child) {
      // Frayed collar points: a nicked edge and a loose thread.
      const fr = shade(shirt, -0.28);
      b.d(cx - 5, top, fr);
      b.d(cx - 3, top + 4, fr);
      b.d(cx + 4, top + 3, fr);
      b.d(cx - 6, top + 1, mix(shirt, DUST, 0.5));
      if (w.chance(0.6)) b.d(cx + 6, top + 2, mix(shirt, DUST, 0.4));
    }
  }
  if (wear >= 2) {
    // A patch sewn on one shoulder, cut from a different, faded cloth.
    const cloth = w.pick(['#8a6a44', '#6a7a8a', '#7a4a3a', '#6a6a48', '#9a8a6a']);
    const patch = mix(outer, cloth, 0.55);
    const left = w.chance(0.5);
    const px = Math.round(left ? x0 + 3 : x1 - 8);
    const py = Math.round(top + 5 + w.int(0, 2));
    const pw = 5;
    const ph = 4;
    b.r(px, py, pw, ph, left ? shade(patch, 0.1) : shade(patch, -0.06));
    b.r(px, py + ph - 1, pw, 1, shade(patch, -0.16));
    b.r(px, py, pw, 1, shade(patch, 0.2));
    // Running stitch around the edge, every other pixel.
    const thread = mix(outer, '#efe2c2', 0.65);
    for (let i = 0; i < pw; i += 2) b.d(px + i, py, thread);
    for (let j = 2; j < ph; j += 2) {
      b.d(px, py + j, thread);
      b.d(px + pw - 1, py + j, thread);
    }
    // And a small dark mend on the other side.
    const mx = left ? x1 - 5 : x0 + 4;
    b.d(mx, 41, outerD);
    b.d(mx + 1, 42, outerD);
    b.d(mx, 42, mix(outer, '#e8dcc0', 0.3));
  }
}

function paintFacialHair(
  b: Brush,
  L: HumanLook,
  r: Rng,
  cx: number,
  faceY: number,
  jaw: number,
  chinY: number,
  mY: number,
  skin: string,
  hair: string,
  hairL: string,
  hairD: string,
  facePath: (c: Ctx) => void,
): void {
  const lipLine = shade(skin, -0.4);
  switch (L.facial) {
    case 'stubble': {
      const st = mix(skin, hair, 0.28);
      b.clip(facePath, () => {
        b.p([[cx - jaw - 1, faceY + 2], [cx - 3, mY - 1], [cx + 3, mY - 1], [cx + jaw + 1, faceY + 2], [cx + jaw + 1, chinY + 1], [cx - jaw - 1, chinY + 1]], st);
        b.r(cx - 3, mY, 7, 1, lipLine);
        for (let i = 0; i < 14; i++) b.d(cx - jaw + 1.5 + r.next() * (jaw * 2 - 3), faceY + 3.5 + r.next() * (chinY - faceY - 4), mix(skin, hair, 0.5));
      });
      break;
    }
    case 'mustache': {
      const kind = r.int(0, 2);
      if (kind === 0) {
        // Walrus: thick, drooping over the lip.
        b.p([[cx - 5, mY + 1], [cx - 3, mY - 2], [cx + 3, mY - 2], [cx + 5, mY + 1], [cx + 3, mY + 0.5], [cx, mY], [cx - 3, mY + 0.5]], hair);
        b.r(cx - 3, mY - 2, 3, 1, hairL);
      } else if (kind === 1) {
        // Handlebar: thin with upturned waxed tips.
        b.p([[cx - 4, mY], [cx - 1, mY - 2], [cx + 1, mY - 2], [cx + 4, mY], [cx, mY - 0.5]], hair);
        b.d(cx - 5, mY - 1, hair);
        b.d(cx - 6, mY - 2, hair);
        b.d(cx + 4, mY - 1, hairD);
        b.d(cx + 5, mY - 2, hairD);
        b.d(cx - 2, mY - 2, hairL);
      } else {
        // Horseshoe: down the sides of the mouth.
        b.r(cx - 3, mY - 2, 7, 2, hair);
        b.r(cx - 4, mY - 1, 2, 4, hair);
        b.r(cx + 3, mY - 1, 2, 4, hairD);
        b.r(cx - 2, mY - 2, 3, 1, hairL);
      }
      break;
    }
    case 'beard': {
      const kind = r.int(0, 2);
      if (kind === 2) {
        // Mutton chops joined by a moustache, clean chin.
        b.clip(facePath, () => {
          b.p([[cx - jaw - 1, faceY - 1], [cx - jaw + 2, faceY], [cx - 3.5, mY - 1], [cx - 3, mY + 1.5], [cx - jaw + 1.5, faceY + 6]], hair);
          b.p([[cx + jaw + 1, faceY - 1], [cx + jaw - 2, faceY], [cx + 3.5, mY - 1], [cx + 3, mY + 1.5], [cx + jaw - 1.5, faceY + 6]], hairD);
        });
        b.r(cx - 3, mY - 2, 7, 2, hair);
        b.r(cx - jaw + 1, faceY - 1, 1, 3, hairL);
      } else {
        const full = kind === 0;
        const drop = full ? 3.5 : 1.5;
        b.p(
          [
            [cx - jaw - 0.5, faceY - 1],
            [cx - jaw + 1, faceY + 3],
            [cx - 3.5, mY - 1],
            [cx + 3.5, mY - 1],
            [cx + jaw - 1, faceY + 3],
            [cx + jaw + 0.5, faceY - 1],
            [cx + jaw + 0.2, faceY + 4],
            [cx + jaw - 1.5, chinY - 1],
            [cx + 2, chinY + drop],
            [cx, chinY + drop + 0.8],
            [cx - 2, chinY + drop],
            [cx - jaw + 1.5, chinY - 1],
            [cx - jaw - 0.2, faceY + 4],
          ],
          hair,
        );
        // Shadow side and strands.
        b.p([[cx + 2, mY + 1], [cx + jaw, faceY + 3], [cx + jaw - 1.5, chinY - 1], [cx + 2, chinY + drop]], hairD);
        b.r(cx - jaw + 0.5, faceY + 1, 1, 4, hairL);
        b.d(cx - 3, chinY, hairL);
        b.d(cx - 1, chinY + 1, hairD);
        // Moustache over a visible lower lip.
        b.r(cx - 3, mY - 2, 7, 2, hair);
        b.r(cx - 2, mY - 2, 2, 1, hairL);
        b.r(cx - 1, mY + 1, 3, 1, mix(skin, '#7a3a30', 0.35));
      }
      break;
    }
    case 'goatee': {
      if (r.chance(0.5)) {
        // Van Dyke: moustache plus pointed chin tuft.
        b.r(cx - 3, mY - 2, 7, 1, hair);
        b.d(cx - 4, mY - 1, hair);
        b.d(cx + 4, mY - 1, hairD);
      }
      b.p([[cx - 2, mY + 2], [cx + 2.5, mY + 2], [cx + 1.5, chinY + 1.5], [cx + 0.5, chinY + 3], [cx - 1, chinY + 1.5]], hair);
      b.d(cx - 1, mY + 2, hairL);
      b.d(cx + 1, chinY + 1, hairD);
      break;
    }
  }
}

function paintHair(
  b: Brush,
  L: HumanLook,
  r: Rng,
  cx: number,
  faceY: number,
  crown: number,
  jaw: number,
  child: boolean,
  hair: string,
  hairL: string,
  hairD: string,
  skinL: string,
): void {
  const fem = L.skirt;
  const hatted = L.hat !== 'none' && !(fem && L.hat === 'bonnet');
  if (L.hairStyle === 'bald') {
    // Dome shine and a fringe above the ears.
    b.e(cx - 3, crown + 2.5, 2.2, 1.4, skinL);
    b.d(cx - 4, crown + 2, shade(skinL, 0.15));
    b.r(cx - jaw - 0.5, faceY - 4, 2, 4, hair);
    b.r(cx + jaw - 1.5, faceY - 4, 2, 4, hairD);
    return;
  }
  // Temples / sideburns, visible even under a hat brim.
  if (L.hat !== 'bonnet') b.r(cx - jaw - 0.5, faceY - 5, 2, fem ? 6 : 5, hair);
  if (L.hat !== 'bonnet') b.r(cx + jaw - 1.5, faceY - 5, 2, fem ? 6 : 5, hairD);
  if (hatted && L.hat !== 'cap' && L.hat !== 'bonnet') {
    if (L.hairStyle === 'curly') {
      b.e(cx - jaw, faceY - 4, 2, 2, hair);
      b.e(cx + jaw, faceY - 4, 2, 2, hairD);
    }
    return;
  }
  const top = crown + 0.5;
  if (fem) {
    // 1880s centre part, hair swept back over the ears.
    // Kept above the brows so the forehead (and the face) stays open.
    b.e(cx - jaw * 0.5, top + 2.2, jaw * 0.75, 3, hair, -0.25);
    b.e(cx + jaw * 0.5, top + 2.2, jaw * 0.75, 3, hairD, 0.25);
    const sideH = L.hat === 'bonnet' ? 3 : faceY - top + 1;
    b.r(cx - jaw - 0.8, top + 2, 2.5, sideH, hair);
    b.r(cx + jaw - 1.7, top + 2, 2.5, sideH, hairD);
    b.r(cx, top + 0.5, 1, 4, shade(hairD, -0.1)); // the part
    b.p([[cx - 2, top + 1], [cx - jaw + 0.5, top + 4], [cx - jaw + 1, top + 2.5]], hairL);
    if (L.hairStyle === 'braid') {
      // Plait over the left shoulder.
      for (let i = 0; i < 6; i++) {
        const x = cx - jaw - 1 + i * 0.3;
        const y = faceY + 1 + i * 2.6;
        b.e(x, y, 2.1, 1.6, i % 2 ? hairD : hair);
        b.d(x - 1, y - 0.5, hairL);
      }
      b.r(cx - jaw - 1, faceY + 16, 2, 2, '#c8b27a');
    }
    if (L.hairStyle === 'curly') for (let i = 0; i < 6; i++) b.e(cx - jaw + r.next() * jaw * 2, top + 1 + r.next() * 2, 1.4, 1.4, i % 2 ? hairL : hair);
    return;
  }
  if (child) {
    // Tousled mop with a fringe.
    b.e(cx, top + 3, jaw + 1, 4.2, hair);
    b.p([[cx - jaw, top + 4], [cx - 3, top + 7.5], [cx - 1, top + 5], [cx + 1, top + 7], [cx + 3, top + 5], [cx + jaw, top + 6], [cx + jaw, top + 3]], hair);
    b.p([[cx - jaw + 1, top + 2], [cx - 2, top + 0.5], [cx - 3, top + 3]], hairL);
    b.d(cx + 1, top - 0.5, hair); // cowlick
    b.d(cx + 2, top - 1, hair);
    if (L.hairStyle === 'braid' || L.hairStyle === 'long') {
      b.r(cx - jaw - 1.5, top + 3, 2.5, 10, hair);
      b.r(cx + jaw - 1, top + 3, 2.5, 10, hairD);
    }
    return;
  }
  if (L.hairStyle === 'curly') {
    for (let i = 0; i < 11; i++) {
      const a = Math.PI * (1.05 + (i / 10) * 0.9);
      const x = cx + Math.cos(a) * jaw * 0.95;
      const y = top + 4 + Math.sin(a) * 4;
      b.e(x, y, 2, 2, i % 3 === 2 ? hairD : hair);
      b.d(x - 1, y - 1, hairL);
    }
    b.e(cx, top + 3.5, jaw - 1, 2.5, hair);
    return;
  }
  // Short / long men's cut: side part on the left, volume swept right.
  const recede = L.hair === WHITE_HAIR || L.hair === GREY_HAIR ? 1 : 0;
  b.e(cx + 0.5, top + 2.5 + recede * 0.5, jaw + 0.8, 3.8, hair);
  b.p([[cx - jaw - 0.5, top + 3], [cx - jaw + 1, top + 6.5 + (recede ? -1 : 0)], [cx - 3, top + 4 + recede], [cx + 2, top + 5 + recede], [cx + jaw + 0.5, top + 6], [cx + jaw + 0.5, top + 2]], hair);
  b.r(cx - 3, top + 0.5, 1, 3, hairD); // the part
  b.p([[cx - 2, top + 0.5], [cx + 3, top + 0.2], [cx + 1, top + 2.5], [cx - 2, top + 2]], hairL); // sheen
  b.d(cx + 4, top + 3.5, hairD);
  b.d(cx - 5, top + 3, hairL);
}

function paintHat(b: Brush, L: HumanLook, wr: Rng, wear: number, cx: number, crown: number, faceY: number, jaw: number, child: boolean, skin: string, facePath: (c: Ctx) => void): void {
  const h = L.hatColor;
  const hL = shade(h, 0.18);
  const hLL = shade(h, 0.32);
  const hD = shade(h, -0.25);
  const hDD = shade(h, -0.42);
  const brimY = crown + 2.5 + (child ? 1 : 0);
  const shadowFace = (depth: number) =>
    b.clip(facePath, () => {
      b.r(0, 0, 40, brimY + depth, shade(skin, -0.2));
      b.r(0, brimY + depth, 40, 1, shade(skin, -0.1));
    });
  switch (L.hat) {
    case 'cowboy':
    case 'cavalry': {
      // Built from whole-pixel runs so every edge is crisp: a wide brim with
      // curled tips, a creased crown with a lit and a shaded panel, a band.
      shadowFace(1.5);
      const by = Math.round(brimY);
      const w = child ? 12 : 15;
      b.r(cx - w, by, w * 2, 2, h);
      b.r(cx - w + 1, by, w - 2, 1, hL); // lit top edge of the brim (left)
      b.r(cx + 2, by, w - 3, 1, shade(h, 0.06));
      b.r(cx - w + 2, by + 2, w * 2 - 4, 1, hDD); // underside rolling into shadow
      b.r(cx - w - 1, by - 1, 2, 1, h); // curled tips
      b.d(cx - w - 1, by - 2, hL);
      b.r(cx + w - 1, by - 1, 2, 1, hD);
      b.d(cx + w, by - 2, hD);
      b.d(cx - w + 3, by + 1, hLL);
      const cw = child ? 5 : 7;
      const ct = Math.round(crown - (child ? 3.5 : 5));
      const battered = L.hat === 'cowboy' && wear >= 2 && !child;
      b.r(cx - cw + 1, ct, cw * 2 - 2, by - ct, h);
      b.r(cx - cw, ct + 1, cw * 2, by - ct - 1, h);
      b.r(cx - cw, ct + 1, 3, by - ct - 3, hL); // lit left panel
      b.r(cx - cw + 1, ct, 3, 1, hLL);
      b.r(cx + cw - 3, ct + 1, 3, by - ct - 3, hD); // shaded right panel
      b.r(cx - 1, ct, 2, 1, hD); // centre crease
      b.d(cx, ct + 1, hDD);
      b.d(cx - cw + 1, ct + 2, hDD); // front pinch
      b.d(cx + cw - 2, ct + 2, hDD);
      const band = L.hat === 'cavalry' ? BRASS : shade(h, -0.5);
      b.r(cx - cw, by - 2, cw * 2, 2, band);
      if (L.hat === 'cavalry') {
        b.r(cx - cw, by - 2, cw * 2, 1, shade(BRASS, 0.2));
        b.d(cx + cw - 1, by, BRASS); // cord tassel
        b.d(cx + cw - 1, by + 1, shade(BRASS, -0.2));
      } else if (!battered) {
        b.r(cx - cw + 2, by - 2, 2, 2, shade(h, 0.45)); // buckle
        b.d(cx - cw + 2, by - 1, shade(h, 0.2));
      }
      if (wear >= 1 && L.hat === 'cowboy') {
        // Sweat line soaked up above the band, uneven.
        const stain = mix(h, '#2a1a10', 0.3);
        b.r(cx - cw + 4, by - 3, cw * 2 - 7, 1, stain);
        b.d(cx + 1, by - 4, stain);
      }
      if (battered) {
        // Crown caved on the right, brim nicked and frayed, and a rawhide cord tied on where the buckle was lost.
        b.c.clearRect(cx + cw - 3, ct, 3, 1);
        b.c.clearRect(cx + cw - 1, ct + 1, 1, 1);
        b.d(cx + cw - 3, ct + 1, hDD);
        b.d(cx + cw - 2, ct + 2, hD);
        for (const x of [-w + 4, -5, 6, w - 7]) b.d(cx + x, by + 2, hD);
        b.c.clearRect(cx + w - 5, by + 1, 2, 2); // bite out of the brim
        b.d(cx + w - 5, by + 1, hDD);
        b.d(cx - cw + 2, by - 2, '#c8b27a');
        b.d(cx - cw + 2, by - 1, shade('#c8b27a', -0.25));
        b.d(cx - cw + 3, by, shade('#c8b27a', -0.1)); // dangling cord end
      }
      break;
    }
    case 'sombrero': {
      shadowFace(2.5);
      b.e(cx, brimY + 0.8, 19.5, 3.6, hDD);
      b.e(cx, brimY, 19, 3, h);
      b.p([[cx - 19.5, brimY - 3], [cx - 15, brimY + 1], [cx - 18, brimY + 1]], h);
      b.p([[cx + 19.5, brimY - 3], [cx + 15, brimY + 1], [cx + 18, brimY + 1]], hD);
      b.r(cx - 17, brimY + 1.5, 34, 1, hL);
      b.p([[cx - 6, brimY], [cx - 4, crown - 8], [cx, crown - 9.5], [cx + 4, crown - 8], [cx + 6, brimY]], h);
      b.p([[cx - 6, brimY], [cx - 4, crown - 8], [cx - 1, crown - 9], [cx - 2.5, brimY]], hL);
      b.r(cx - 6, brimY - 3, 12, 2, shade(h, 0.35));
      for (let x = -5; x <= 5; x += 2) b.d(cx + x, brimY - 2.5, '#b84a3a');
      break;
    }
    case 'bowler':
    case 'derby': {
      shadowFace(1);
      b.e(cx, brimY + 0.4, 11.5, 2.4, hDD);
      b.e(cx, brimY - 0.2, 11, 1.8, h);
      b.p([[cx - 11.5, brimY - 2], [cx - 9, brimY], [cx - 10.5, brimY + 0.5]], h);
      b.p([[cx + 11.5, brimY - 2], [cx + 9, brimY], [cx + 10.5, brimY + 0.5]], hD);
      b.e(cx, brimY - 4, 7.5, 6.5, h);
      b.r(cx - 8, brimY - 2, 16, 2, h);
      b.e(cx - 3, brimY - 6.5, 3.2, 2, hL); // dome sheen
      b.d(cx - 4, brimY - 7.5, hLL);
      b.e(cx + 4, brimY - 3, 3, 3.5, hD);
      b.r(cx - 7.5, brimY - 2, 15, 1.5, shade(h, -0.55));
      break;
    }
    case 'flat': {
      shadowFace(1.5);
      b.e(cx, brimY + 0.5, 15, 2.6, hDD);
      b.e(cx, brimY - 0.2, 14.5, 2, h);
      b.r(cx - 7, brimY - 6, 14, 6, h);
      b.r(cx - 7, brimY - 6.5, 14, 1, hL);
      b.r(cx - 7, brimY - 6, 3, 5, hL);
      b.r(cx + 4, brimY - 6, 3, 5, hD);
      b.r(cx - 7, brimY - 2.5, 14, 2, shade(h, -0.5));
      b.r(cx - 13, brimY + 0.8, 26, 1, hL);
      break;
    }
    case 'bonnet': {
      // Deep poke brim around the face, ribbon tied under the chin.
      b.clip(facePath, () => b.r(0, 0, 40, crown + 5.5, shade(skin, -0.2)));
      const w = jaw + (child ? 3.5 : 5);
      b.p([[cx - w, faceY + 6], [cx - w - 1, crown + 4], [cx - w + 2, crown - 2.5], [cx, crown - 4], [cx + w - 2, crown - 2.5], [cx + w + 1, crown + 4], [cx + w, faceY + 6], [cx + w - 2.5, faceY + 6], [cx + w - 2, crown + 4], [cx, crown + 1.5], [cx - w + 2, crown + 4], [cx - w + 2.5, faceY + 6]], h);
      b.p([[cx - w + 2, crown + 4], [cx, crown + 1.5], [cx + w - 2, crown + 4], [cx + w - 2.5, crown + 5], [cx, crown + 3], [cx - w + 2.5, crown + 5]], hD); // inside of brim
      b.p([[cx - w - 1, crown + 4], [cx - w + 2, crown - 2.5], [cx - 3, crown - 3.5], [cx - w + 1, crown + 2]], hL);
      for (let i = 0; i < 3; i++) b.d(cx - w + 1.5, crown + 4 + i * 3, hD); // quilting
      const rib = shade(h, -0.15);
      b.r(cx - w + 1, faceY + 6, 2, 3, rib);
      b.r(cx + w - 3, faceY + 6, 2, 3, rib);
      b.e(cx + 2, faceY + 10.5, 2, 1.2, rib); // bow
      b.e(cx - 1, faceY + 10.5, 1.6, 1.1, rib);
      break;
    }
    case 'cap': {
      shadowFace(1.5);
      const w = jaw + 1.5;
      b.e(cx, crown + 2, w, 5, h);
      b.r(cx - w, crown + 2, w * 2, 2, h);
      b.e(cx - 3, crown, 3.5, 2, hL);
      b.e(cx + 3, crown + 2.5, 3, 2, hD);
      b.r(cx - 0.5, crown - 2.5, 1, 1, hLL); // button
      b.r(cx - w, crown + 3.5, w * 2, 1, hDD);
      // Peak, pulled to the right.
      b.p([[cx - w + 2, crown + 4], [cx + w + 2, crown + 4], [cx + w, crown + 6], [cx - w + 3, crown + 5.5]], hD);
      b.r(cx - w + 3, crown + 4, w * 2 - 2, 1, hL);
      break;
    }
  }
}
