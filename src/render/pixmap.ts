/**
 * Hand-drawn pixel art. Sprites are authored as text grids — one character per
 * pixel — and mapped through the master palette, so every pixel on screen was
 * placed on purpose (no brush shapes, no anti-aliasing, no noise). This is the
 * art pipeline for all new assets; see design/art/pixel-art-bible.md.
 *
 * Grid rules: '.' or ' ' = transparent. Any other character is looked up in the
 * sprite's key, which maps it to a palette name (PAL) or a literal '#rrggbb'.
 */
import { makeCanvas } from './pixel.ts';

/**
 * Master palette: warm frontier colours in short hue-shifted ramps (dark → light).
 * Shadows lean cool/violet, highlights lean warm/yellow. Prefer these names over
 * new hex values so the whole game shares one coherent set of colours.
 */
export const PAL = {
  // Outlines and near-blacks (never pure black).
  ink: '#211a24', inkWarm: '#2e1f1a', inkGreen: '#17261c', inkBlue: '#1a2233',
  // Grass (spring green → sunlit).
  grass0: '#25402a', grass1: '#33582f', grass2: '#4a7a35', grass3: '#6a9d3f', grass4: '#93c255', grass5: '#c2e07a',
  // Prairie / dry grass gold.
  dry0: '#4d4422', dry1: '#71622c', dry2: '#9a8237', dry3: '#c2a64a', dry4: '#e2cc74', dry5: '#f4e6a6',
  // Dirt and roads.
  dirt0: '#3b261c', dirt1: '#5a3a26', dirt2: '#7c5434', dirt3: '#a07046', dirt4: '#c49462', dirt5: '#e0bd8a',
  // Desert sand.
  sand0: '#6e4632', sand1: '#9a6644', sand2: '#c08a58', sand3: '#dcae74', sand4: '#f0d09a',
  // Red rock / mesa.
  red0: '#3c1c1c', red1: '#662a24', red2: '#93402e', red3: '#bc5c3a', red4: '#dc8452', red5: '#f0b07a',
  // Stone grey (slightly violet in shadow).
  stone0: '#2a2832', stone1: '#43414e', stone2: '#62606c', stone3: '#8a8892', stone4: '#b5b3b8', stone5: '#dedbd8',
  // Water.
  water0: '#16304a', water1: '#1f4a6e', water2: '#2a6c96', water3: '#3e94bc', water4: '#76c2dc', water5: '#c4ecf2',
  // Snow / ice.
  snow0: '#6f7f9a', snow1: '#9aaac2', snow2: '#c4d2e2', snow3: '#e6eef6', snow4: '#ffffff',
  // Tree foliage (deeper, bluer than grass so trees separate from ground).
  leaf0: '#152a22', leaf1: '#22402c', leaf2: '#335d34', leaf3: '#4c7f3a', leaf4: '#72a646', leaf5: '#a2cc5c',
  // Pine needles.
  pine0: '#10221e', pine1: '#18342a', pine2: '#244a34', pine3: '#356640', pine4: '#4f8a4a',
  // Autumn / aspen gold.
  gold0: '#6a3e1a', gold1: '#9a5e20', gold2: '#c88a2a', gold3: '#e8b842', gold4: '#f8dc78',
  // Wood (planks, posts, bark).
  wood0: '#2c1a14', wood1: '#4a2c1e', wood2: '#6c4228', wood3: '#8e5c36', wood4: '#b47e4c', wood5: '#d8a874',
  // Weathered grey wood.
  gwood0: '#2e2a2a', gwood1: '#4a4442', gwood2: '#6c645c', gwood3: '#918676', gwood4: '#b8ac98',
  // Barn red / painted red.
  barn0: '#3a1418', barn1: '#62201e', barn2: '#8c3026', barn3: '#b44a34', barn4: '#d8704c',
  // Painted siding colours.
  blue0: '#232c44', blue1: '#34466a', blue2: '#4e6a92', blue3: '#7896b8', blue4: '#aec4d8',
  teal0: '#173634', teal1: '#24534c', teal2: '#36786a', teal3: '#5aa090', teal4: '#94ccb8',
  cream0: '#6e5a44', cream1: '#9c8466', cream2: '#c8b08a', cream3: '#e8d6b0', cream4: '#faf0d8',
  // Metal: tin roof, iron, brass.
  tin0: '#2c3036', tin1: '#4a5058', tin2: '#6e767e', tin3: '#98a0a6', tin4: '#c8ced0',
  rust0: '#4a2216', rust1: '#7a3a1e', rust2: '#a8582a', rust3: '#cc7c3e',
  brass0: '#5a3c14', brass1: '#8e6420', brass2: '#c4962e', brass3: '#ecc858', brass4: '#fff0a0',
  // Skin ramps (light → deep), each dark → light.
  skinA0: '#8a5440', skinA1: '#c4806a', skinA2: '#e8ac90', skinA3: '#f8d0b4',
  skinB0: '#6c3e2c', skinB1: '#a86a4a', skinB2: '#d0946c', skinB3: '#eab890',
  skinC0: '#4e2a1e', skinC1: '#7e4a30', skinC2: '#a8704a', skinC3: '#c8946a',
  skinD0: '#2e1812', skinD1: '#50301e', skinD2: '#74482e', skinD3: '#96664a',
  // Cloth basics.
  white0: '#8e8a8a', white1: '#c2bcb4', white2: '#e8e2d6', white3: '#fffaf0',
  black0: '#18161c', black1: '#2c2a32', black2: '#44424c', black3: '#5e5c66',
  denim0: '#1c2436', denim1: '#2c3a56', denim2: '#40567c', denim3: '#6a84a6',
  leather0: '#2a1812', leather1: '#4a2c1c', leather2: '#6e4428', leather3: '#946238', leather4: '#bc8a52',
  // Accents.
  rose: '#d85a6a', blush: '#e88a7a', lupine: '#7a6ad8', lupineL: '#a89cf0', poppy: '#f07a2a', poppyL: '#ffb048',
  sun: '#f8d838', sunL: '#fff28a', snowflower: '#f6f2e8', lamp: '#ffd27a', lampL: '#fff2c0', fire: '#ff8a2a',
} as const;

export type PalName = keyof typeof PAL;

/** Resolve a key entry: palette name or literal '#rrggbb'. */
function colourOf(v: string): string {
  return v.startsWith('#') ? v : (PAL as Record<string, string>)[v] ?? (() => { throw new Error(`pixmap: unknown palette name "${v}"`); })();
}

/**
 * Turn a text grid into a canvas. Rows may differ in length (short rows pad with
 * transparency). `key` maps characters to palette names or hex colours.
 */
export function pixmap(rows: readonly string[], key: Readonly<Record<string, string>>): HTMLCanvasElement | OffscreenCanvas {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const cv = makeCanvas(w, h);
  const c = cv.getContext('2d') as CanvasRenderingContext2D;
  const img = c.createImageData(w, h);
  const cache = new Map<string, [number, number, number]>();
  for (let y = 0; y < h; y++) {
    const row = rows[y]!;
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]!;
      if (ch === '.' || ch === ' ') continue;
      let rgb = cache.get(ch);
      if (!rgb) {
        const v = key[ch];
        if (v === undefined) throw new Error(`pixmap: no key for "${ch}" (row ${y})`);
        const n = parseInt(colourOf(v).slice(1), 16);
        rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        cache.set(ch, rgb);
      }
      const i = (y * w + x) * 4;
      img.data[i] = rgb[0];
      img.data[i + 1] = rgb[1];
      img.data[i + 2] = rgb[2];
      img.data[i + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
  return cv;
}

/**
 * Palette swap: same drawing, different colours (e.g. one coat drawn once, recoloured
 * per horse; one shirt drawn once, dyed per NPC). `swap` maps from → to (names or hex).
 */
export function recolor(src: HTMLCanvasElement | OffscreenCanvas, swap: Readonly<Record<string, string>>): HTMLCanvasElement | OffscreenCanvas {
  const w = src.width;
  const h = src.height;
  const cv = makeCanvas(w, h);
  const c = cv.getContext('2d') as CanvasRenderingContext2D;
  c.drawImage(src as CanvasImageSource, 0, 0);
  const img = c.getImageData(0, 0, w, h);
  const map = new Map<number, [number, number, number]>();
  for (const [from, to] of Object.entries(swap)) {
    const a = parseInt(colourOf(from).slice(1), 16);
    const b = parseInt(colourOf(to).slice(1), 16);
    map.set(a, [(b >> 16) & 255, (b >> 8) & 255, b & 255]);
  }
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const t = map.get((d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!);
    if (t) {
      d[i] = t[0];
      d[i + 1] = t[1];
      d[i + 2] = t[2];
    }
  }
  c.putImageData(img, 0, 0);
  return cv;
}

/** Mirror a sprite horizontally (for left-facing frames drawn once facing right). */
export function flipX(src: HTMLCanvasElement | OffscreenCanvas): HTMLCanvasElement | OffscreenCanvas {
  const cv = makeCanvas(src.width, src.height);
  const c = cv.getContext('2d') as CanvasRenderingContext2D;
  c.translate(src.width, 0);
  c.scale(-1, 1);
  c.drawImage(src as CanvasImageSource, 0, 0);
  return cv;
}

/** Stack layers (body, clothes, hat…) of equal size into one sprite, bottom first. */
export function compose(...layers: (HTMLCanvasElement | OffscreenCanvas | null | undefined)[]): HTMLCanvasElement | OffscreenCanvas {
  const base = layers.find((l) => l)!;
  const cv = makeCanvas(base.width, base.height);
  const c = cv.getContext('2d') as CanvasRenderingContext2D;
  for (const l of layers) if (l) c.drawImage(l as CanvasImageSource, 0, 0);
  return cv;
}
