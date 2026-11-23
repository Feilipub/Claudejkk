/**
 * Pixel-art painting helpers. Sprites are painted procedurally with canvas
 * primitives, then "pixelised": alpha is thresholded and colours snapped to
 * the sprite's own palette so the result has crisp single pixels like
 * hand-made art, followed by a selective dark outline.
 */

export type Ctx = CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function ctx2d(c: HTMLCanvasElement | OffscreenCanvas): Ctx {
  return c.getContext('2d', { willReadFrequently: true }) as Ctx;
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1);
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

/** Rotate hue `h` toward `target` by up to `amount` degrees. */
function hueToward(h: number, target: number, amount: number): number {
  let d = target - h;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return h + Math.sign(d) * Math.min(Math.abs(d), amount);
}

/**
 * Lighten (t>0) or darken (t<0) a hex colour the way a pixel artist would:
 * shadows cool toward blue-violet and gain a little saturation, highlights
 * warm toward sunlit yellow and lose saturation (hue-shifted ramps).
 */
export function shade(hex: string, t: number): string {
  const [r, g, b] = hexToRgb(hex);
  if (t >= 0) {
    // Lighten toward a warm sunlit cream.
    const k = t * 0.95;
    return rgbToHex(r + (255 - r) * k, g + (246 - g) * k, b + (214 - b) * k);
  }
  // Darken by multiplying, then glaze toward a cool violet so shadows read as shade, not dirt.
  const k = Math.min(1, -t);
  const m = 1 - k * 0.92;
  const glaze = k * 0.38;
  const cr = 44;
  const cg = 36;
  const cb = 72;
  return rgbToHex(r * m * (1 - glaze) + cr * glaze * (1 - k * 0.4), g * m * (1 - glaze) + cg * glaze * (1 - k * 0.4), b * m * (1 - glaze) + cb * glaze * (1 - k * 0.4));
}

/** Build an n-step hue-shifted ramp around a base colour (index n/2 ≈ base). */
export function ramp(base: string, n = 5, spread = 0.5): string[] {
  const out: string[] = [];
  const mid = (n - 1) / 2;
  for (let i = 0; i < n; i++) {
    const t = ((i - mid) / mid) * spread;
    out.push(t === 0 ? base : shade(base, t));
  }
  return out;
}

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/**
 * Silhouette-aware shading pass for flat-painted sprites (light from the
 * upper-left): pixels on the right/bottom rim of each colour region take a
 * cool shadow, left/top rims a warm highlight. Gives clothing and bodies
 * volume without hand-shading every frame.
 */
export function autoShade(c: Ctx, w: number, h: number, strength = 1): void {
  const img = c.getImageData(0, 0, w, h);
  const d = img.data;
  const src = new Uint8ClampedArray(d);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : (y * w + x) * 4);
  const same = (i: number, j: number) => j >= 0 && src[j + 3]! > 110 && Math.abs(src[i]! - src[j]!) + Math.abs(src[i + 1]! - src[j + 1]!) + Math.abs(src[i + 2]! - src[j + 2]!) < 24;
  const cache = new Map<number, [number, number, number]>();
  const tone = (r: number, g: number, b: number, t: number): [number, number, number] => {
    const key = (r << 16) | (g << 8) | b | (Math.round(t * 100) << 24);
    let v = cache.get(key);
    if (!v) cache.set(key, (v = hexToRgb(shade(rgbToHex(r, g, b), t))));
    return v;
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = at(x, y);
      if (src[i + 3]! <= 110) continue;
      const right = !same(i, at(x + 1, y));
      const bottom = !same(i, at(x, y + 1));
      const left = !same(i, at(x - 1, y));
      const top = !same(i, at(x, y - 1));
      let t = 0;
      if (right) t -= 0.2;
      if (bottom) t -= 0.12;
      if (left && !right) t += 0.1;
      if (top && !bottom) t += 0.07;
      if (t === 0) continue;
      const [r, g, b] = tone(src[i]!, src[i + 1]!, src[i + 2]!, Math.max(-0.45, Math.min(0.3, t * strength)));
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
    }
  c.putImageData(img, 0, 0);
}

/** Threshold alpha, snap to palette (if given), and add a selective outline. */
export function pixelise(c: Ctx, w: number, h: number, palette: string[] | null, outline: string | null = '#1a120c', outlineAlpha = 255): void {
  const img = c.getImageData(0, 0, w, h);
  const d = img.data;
  const pal = palette ? palette.map(hexToRgb) : null;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3]! < 110) {
      d[i + 3] = 0;
      continue;
    }
    // Un-premultiply edge pixels.
    const a = d[i + 3]! / 255;
    let r = d[i]! / (a < 1 ? Math.max(a, 0.5) : 1);
    let g = d[i + 1]! / (a < 1 ? Math.max(a, 0.5) : 1);
    let b = d[i + 2]! / (a < 1 ? Math.max(a, 0.5) : 1);
    if (pal) {
      let best = 0;
      let bd = Infinity;
      for (let k = 0; k < pal.length; k++) {
        const p = pal[k]!;
        const dd = (p[0] - r) ** 2 * 0.3 + (p[1] - g) ** 2 * 0.59 + (p[2] - b) ** 2 * 0.11;
        if (dd < bd) {
          bd = dd;
          best = k;
        }
      }
      [r, g, b] = pal[best]!;
    }
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = 255;
  }
  if (outline) {
    const [or, og, ob] = hexToRgb(outline);
    const src = new Uint8ClampedArray(d);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (src[i + 3]) continue;
        const n =
          (x > 0 && src[i - 4 + 3]) || (x < w - 1 && src[i + 4 + 3]) || (y > 0 && src[i - w * 4 + 3]) || (y < h - 1 && src[i + w * 4 + 3]);
        if (n) {
          d[i] = or;
          d[i + 1] = og;
          d[i + 2] = ob;
          d[i + 3] = outlineAlpha;
        }
      }
  }
  c.putImageData(img, 0, 0);
}

/** Simple pixel setters for detail work after pixelisation. */
export function px(c: Ctx, x: number, y: number, color: string): void {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), 1, 1);
}
export function rect(c: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
export function ellipse(c: Ctx, x: number, y: number, rx: number, ry: number, color: string, rot = 0): void {
  c.fillStyle = color;
  c.beginPath();
  c.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), rot, 0, Math.PI * 2);
  c.fill();
}
export function line(c: Ctx, x1: number, y1: number, x2: number, y2: number, color: string, w = 1): void {
  c.strokeStyle = color;
  c.lineWidth = w;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();
}
export function poly(c: Ctx, pts: [number, number][], color: string): void {
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i]![0], pts[i]![1]);
  c.closePath();
  c.fill();
}

/** Tiny 3x5 pixel font for signs (uppercase, digits, few symbols). */
const FONT: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', '0': '111101101101111', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110',
  '4': '101101111001001', '5': '111100110001110', '6': '011100111101111', '7': '111001010010010', '8': '111101111101111',
  '9': '111101111001110', '&': '010101010101011', "'": '010010000000000', '.': '000000000000010', '-': '000000111000000', ' ': '000000000000000',
};

export function pixelText(c: Ctx, text: string, x: number, y: number, color: string): number {
  let cx = x;
  for (const ch of text.toUpperCase()) {
    const g = FONT[ch] ?? FONT[' ']!;
    c.fillStyle = color;
    for (let i = 0; i < 15; i++) if (g[i] === '1') c.fillRect(cx + (i % 3), y + Math.floor(i / 3), 1, 1);
    cx += 4;
  }
  return cx - x - 1;
}
export function pixelTextWidth(text: string): number {
  return text.length * 4 - 1;
}
