/**
 * Hand-drawn pixel art for world props (trees, cacti, rocks, fences, town
 * furniture). Every sprite is a text grid mapped through PAL — see
 * design/art/pixel-art-bible.md. Trees are composed from a handful of
 * hand-drawn leaf clumps (each drawn once, then re-toned shade / normal / lit),
 * stacked back-to-front on a hand-drawn trunk, so each species keeps a charming
 * silhouette and three distinct variants without any brush painting.
 */
import { makeCanvas } from './pixel.ts';
import { PAL, flipX, pixmap, type PalName } from './pixmap.ts';

type Cv = HTMLCanvasElement | OffscreenCanvas;
type Key = Readonly<Record<string, string>>;

// ---------------------------------------------------------------------------
// Leaf clumps: o outline, 1 shadow, 2 mid, 3 light, 4 highlight.

const CLUMP_L = [
  '....oooo.ooooo..',
  '..oo4443o34443o.',
  '.o344444334443o.',
  '.o3444443333332o',
  'o33444333332222o',
  'o33333332233212o',
  'o23333222222211o',
  'o22232222112111o',
  'o22122222211111o',
  '.o122222211111o.',
  '.o111211111111o.',
  '..oo111oo1111oo.',
  '....ooo..oooo...',
];
const CLUMP_M = [
  '...ooo.oooo.',
  '.oo443o3443o',
  'o3444433432o',
  'o3444333322o',
  'o3343332221o',
  'o2333222221o',
  'o2222222111o',
  '.o222211111o',
  '..o111o111o.',
  '...ooo.ooo..',
];
const CLUMP_S = [
  '..ooo.o..',
  '.o443o3o.',
  'o3443332o',
  'o3333221o',
  'o2222211o',
  '.o11o11o.',
  '..oo.oo..',
];
// Pine boughs: one tier is a drooping skirt with needle tips; tiers stack bottom-up.
const PINE_T20 = [
  '.........oo.........',
  '.......oo43oo.......',
  '.....oo434322oo.....',
  '...oo3444333221ooo..',
  '..o344443332222211o.',
  '.o34443333222221111o',
  'o233322222221111111o',
  '.o21o.o21o.o11o.o1o.',
  '..oo...oo...oo...o..',
];
const PINE_T14 = [
  '......oo......',
  '....oo43oo....',
  '..oo344322oo..',
  '.o3444332211o.',
  'o344433222111o',
  'o233222221111o',
  '.o2o.o21o.o1o.',
  '..o...oo...o..',
];
const PINE_TOP = [
  '....o....',
  '...o4o...',
  '...o42o..',
  '..o4432o.',
  '.o44322o.',
  '.o433221o',
  'o3332211o',
  '.o2o.o1o.',
  '..o...o..',
];

const SHAPES = { L: CLUMP_L, M: CLUMP_M, S: CLUMP_S, P20: PINE_T20, P14: PINE_T14, PT: PINE_TOP } as const;
type Shape = keyof typeof SHAPES;
/** 0 shade (back / underside), 1 normal, 2 lit (upper-left). */
type Tone = 0 | 1 | 2;
/** Six-step foliage ramp, dark → light; [0] is the outline. */
type Ramp = readonly [string, string, string, string, string, string];

const R = {
  oak: ['inkGreen', 'leaf1', 'leaf2', 'leaf3', 'leaf4', 'leaf5'],
  oakOlive: ['inkGreen', 'leaf1', 'leaf2', 'grass2', 'grass3', 'grass4'],
  oakYoung: ['leaf0', 'leaf2', 'grass2', 'grass3', 'grass4', 'grass5'],
  cotton: ['leaf0', 'leaf2', 'leaf3', 'grass3', 'grass4', 'grass5'],
  cottonDry: ['leaf0', 'leaf2', 'leaf3', 'grass3', 'dry3', 'dry4'],
  aspen: ['leaf0', 'leaf2', 'grass2', 'grass3', 'grass4', 'grass5'],
  aspenGold: ['gold0', 'gold0', 'gold1', 'gold2', 'gold3', 'gold4'],
  pine: ['inkGreen', 'pine1', 'pine2', 'pine3', 'pine4', 'leaf4'],
  ponderosa: ['inkGreen', 'pine2', 'leaf2', 'leaf3', 'leaf4', 'leaf5'],
  juniper: ['inkGreen', 'pine1', 'teal1', 'teal2', '#6a907a', '#9ab89a'],
  sage: ['#2c3626', '#4a5e48', '#6d8466', '#94aa88', '#bccaae', '#dde6cf'],
  scrub: ['inkGreen', 'leaf2', 'leaf3', 'grass2', 'grass3', 'grass4'],
  bush: ['inkGreen', 'grass1', 'grass2', 'grass3', 'grass4', 'grass5'],
  creosote: ['#2a2a14', '#3e4a22', '#56682c', '#72863a', '#94a64c', '#b8c468'],
} as const satisfies Record<string, Ramp>;

function toneKey(r: Ramp, t: Tone): Key {
  const s = t === 0 ? [1, 1, 2, 3] : t === 1 ? [1, 2, 3, 4] : [2, 3, 4, 5];
  return { o: r[0], 1: r[s[0]!], 2: r[s[1]!], 3: r[s[2]!], 4: r[s[3]!] };
}

const stampCache = new Map<string, Cv>();
function clump(shape: Shape, r: Ramp, t: Tone, flip: boolean): Cv {
  const k = `${shape}|${r.join()}|${t}|${flip}`;
  let cv = stampCache.get(k);
  if (!cv) {
    cv = pixmap(SHAPES[shape], toneKey(r, t));
    if (flip) cv = flipX(cv);
    stampCache.set(k, cv);
  }
  return cv;
}

/** One placed clump: [shape, x, y, tone, flip?]. */
type Op = [Shape, number, number, Tone, boolean?];

function canvasOf(w: number, h: number): [Cv, CanvasRenderingContext2D] {
  const cv = makeCanvas(w, h);
  return [cv, cv.getContext('2d') as CanvasRenderingContext2D];
}

function blit(c: CanvasRenderingContext2D, img: Cv, x: number, y: number): void {
  c.drawImage(img as CanvasImageSource, x, y);
}

/** Draw a list of clumps back to front. */
function foliage(c: CanvasRenderingContext2D, r: Ramp, ops: readonly Op[]): void {
  for (const [s, x, y, t, f] of ops) blit(c, clump(s, r, t, !!f), x, y);
}

// ---------------------------------------------------------------------------
// Trunks. o outline, 1 dark, 2 mid, 3 light, 4 glint.

const BARK = ['wood0', 'wood1', 'wood2', 'wood3', 'wood4'] as const;
const BARK_PALE = ['gwood0', 'gwood1', 'gwood2', 'gwood3', 'gwood4'] as const;
const BARK_CINN = ['wood0', 'rust0', 'rust1', 'rust2', 'rust3'] as const;
const barkKey = (b: readonly string[]): Key => ({ o: b[0]!, 1: b[1]!, 2: b[2]!, 3: b[3]!, 4: b[4]! });

const TRUNK_OAK = [
  '..o3o..o2o..',
  '..o32oo21o..',
  '...o3221o...',
  '...o3221o...',
  '...o3211o...',
  '...o4221o...',
  '...o3221o...',
  '...o3211o...',
  '...o3221o...',
  '..o33221o...',
  '..o432211o..',
  '.o3322211oo.',
  'o33o2221o11o',
  'oo.oooooo.oo',
];
const TRUNK_OAK_SMALL = [
  '.o3o.o2o',
  '.o32o21o',
  '..o321o.',
  '..o421o.',
  '..o321o.',
  '..o321o.',
  '.o33211o',
  'o3o321o1o',
  'oo.oooo.o',
];
const TRUNK_LEAN = [
  '........o3o.',
  '.......o32o.',
  '......o321o.',
  '.....o3221o.',
  '....o3221o..',
  '...o3221o...',
  '...o3221o...',
  '..o4221o....',
  '..o3221o....',
  '..o3211o....',
  '.o33211oo...',
  'o3o3221o1o..',
  'oo.ooooo.o..',
];
const TRUNK_PINE = [
  '.o21o.',
  '.o31o.',
  '.o21o.',
  '.o31o.',
  '.o21o.',
  '.o31o.',
  'o3221o',
  'oooooo',
];
const TRUNK_POND = [
  '.o32o.',
  '.o31o.',
  '.o42o.',
  '.o31o.',
  '.o32o.',
  '.o31o.',
  '.o42o.',
  '.o31o.',
  '.o32o.',
  '.o31o.',
  '.o42o.',
  '.o31o.',
  '.o32o.',
  'o33211o',
  'ooooooo',
];
// Aspen: chalk-white bark with black "eyes" (k).
const TRUNK_ASPEN = [
  'o32o',
  'o32o',
  'ok2o',
  'o31o',
  'o32o',
  'o3ko',
  'o32o',
  'o32o',
  'ok2o',
  'o31o',
  'o32o',
  'o3ko',
  'o32o',
  'o321o',
  'ooooo',
];
const ASPEN_KEY: Key = { o: 'stone2', 1: 'white0', 2: 'white1', 3: 'white3', k: 'ink' };

/** Build a tree canvas: trunk first, then foliage clumps back to front. */
function tree(w: number, h: number, trunk: readonly string[], tk: Key, tx: number, ramp: Ramp, ops: readonly Op[], trunkY = h - trunk.length, extra?: (c: CanvasRenderingContext2D) => void): Cv {
  const [cv, c] = canvasOf(w, h);
  blit(c, pixmap(trunk, tk), tx, trunkY);
  foliage(c, ramp, ops);
  seams(c, w, h, ramp);
  extra?.(c);
  return cv;
}

const hex = (n: string): number => parseInt((n.startsWith('#') ? n : (PAL as Record<string, string>)[n]!).slice(1), 16);

/**
 * Clean-up pass after stacking clumps: a clump outline pixel buried inside the
 * canopy (all four neighbours opaque) becomes the shadow tone, so the dark ink
 * stays on the outer silhouette and clumps separate by shadow, not by lines.
 */
function seams(c: CanvasRenderingContext2D, w: number, h: number, ramp: Ramp): void {
  const img = c.getImageData(0, 0, w, h);
  const d = img.data;
  const ink = hex(ramp[0]);
  const sh = hex(ramp[1]);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[(y * w + x) * 4 + 3]!);
  // Enclosed transparent gaps between clumps (not reachable from the border) are filled with shadow.
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const p = stack.pop()!;
    if (seen[p] || d[p * 4 + 3]) continue;
    seen[p] = 1;
    const x = p % w;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (p >= w) stack.push(p - w);
    if (p < w * (h - 1)) stack.push(p + w);
  }
  for (let p = 0; p < w * h; p++) if (!seen[p] && !d[p * 4 + 3]) {
    const i = p * 4;
    d[i] = (sh >> 16) & 255;
    d[i + 1] = (sh >> 8) & 255;
    d[i + 2] = sh & 255;
    d[i + 3] = 255;
  }
  const hits: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (!d[i + 3] || ((d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!) !== ink) continue;
      if (at(x - 1, y) && at(x + 1, y) && at(x, y - 1) && at(x, y + 1)) hits.push(i);
    }
  for (const i of hits) {
    d[i] = (sh >> 16) & 255;
    d[i + 1] = (sh >> 8) & 255;
    d[i + 2] = sh & 255;
  }
  c.putImageData(img, 0, 0);
}

const OAK = (v: number): Cv => {
  if (v === 0)
    // Broad bur oak: wide domed crown, dark underside resting on a stout trunk.
    return tree(40, 44, TRUNK_OAK, barkKey(BARK), 14, R.oak, [
      ['L', 1, 17, 0], ['L', 23, 16, 0, true], ['M', 14, 20, 0],
      ['M', 0, 11, 1], ['L', 5, 7, 1], ['L', 19, 6, 1, true], ['M', 27, 11, 1, true],
      ['L', 10, 1, 2], ['M', 5, 5, 2], ['S', 22, 2, 2],
    ]);
  if (v === 1)
    // Young oak: small, round and fresh green.
    return tree(28, 34, TRUNK_OAK_SMALL, barkKey(BARK), 10, R.oakYoung, [
      ['M', 2, 12, 0], ['M', 14, 12, 0, true],
      ['L', 5, 5, 1], ['M', 14, 6, 1, true],
      ['M', 4, 1, 2], ['S', 13, 2, 2],
    ]);
  // Wind-bent olive oak: crown swept to the right over a leaning trunk.
  return tree(40, 40, TRUNK_LEAN, barkKey(BARK), 10, R.oakOlive, [
    ['M', 5, 14, 0], ['L', 22, 14, 0, true], ['M', 13, 16, 0],
    ['M', 2, 9, 1], ['L', 14, 6, 1], ['M', 27, 8, 1, true],
    ['L', 8, 2, 2], ['S', 22, 2, 2], ['S', 3, 8, 2],
  ]);
};

const COTTONWOOD = (v: number): Cv => {
  const tk = barkKey(BARK_PALE);
  if (v === 0)
    // Triple-domed riverside giant.
    return tree(42, 50, TRUNK_OAK, tk, 15, R.cotton, [
      ['L', 1, 22, 0], ['L', 25, 21, 0, true], ['L', 13, 24, 0],
      ['L', 0, 13, 1], ['L', 24, 11, 1, true], ['M', 15, 16, 1],
      ['L', 6, 5, 1], ['L', 19, 3, 1, true],
      ['L', 11, 0, 2], ['M', 4, 9, 2], ['S', 27, 6, 2],
    ], 50 - TRUNK_OAK.length);
  if (v === 1)
    // Tall, forked: crown is taller than wide.
    return tree(34, 50, TRUNK_OAK, tk, 11, R.cotton, [
      ['L', 2, 25, 0], ['L', 16, 24, 0, true],
      ['L', 1, 16, 1], ['L', 17, 14, 1, true],
      ['L', 4, 7, 1], ['L', 15, 5, 1, true],
      ['L', 9, 0, 2], ['M', 3, 10, 2], ['S', 19, 9, 2],
    ]);
  // Late-summer cottonwood, a few yellowing leaves and a bare silver limb.
  return tree(42, 46, TRUNK_OAK, tk, 16, R.cottonDry, [
    ['L', 6, 19, 0], ['L', 22, 18, 0, true],
    ['M', 6, 13, 1], ['L', 14, 10, 1], ['L', 25, 9, 1, true],
    ['L', 11, 3, 2], ['M', 24, 4, 2], ['S', 8, 10, 2],
  ], 46 - TRUNK_OAK.length, (c) => blit(c, pixmap(DEAD_LIMB, barkKey(BARK_PALE)), 9, 28));
};
const DEAD_LIMB = [
  'o3o.o3o..',
  '.o3oo3o..',
  '..o33o...',
  '...o32o..',
  '....o32o.',
  '.....o32o',
  '......o3o',
];

const ASPEN = (v: number): Cv => {
  if (v === 0)
    // Single spire: narrow tall crown.
    return tree(22, 46, TRUNK_ASPEN, ASPEN_KEY, 9, R.aspen, [
      ['M', 4, 23, 0], ['M', 6, 18, 0, true],
      ['M', 4, 13, 1], ['M', 6, 8, 1, true],
      ['M', 4, 3, 2], ['S', 7, 0, 2], ['S', 3, 13, 2],
    ]);
  if (v === 1) {
    // Fall-gold pair from one root.
    const [cv, c] = canvasOf(30, 44);
    const tk = pixmap(TRUNK_ASPEN, ASPEN_KEY);
    blit(c, tk, 7, 44 - 15 - 2);
    blit(c, tk, 18, 44 - 15);
    foliage(c, R.aspenGold, [
      ['M', 2, 18, 0], ['M', 15, 20, 0, true],
      ['M', 1, 11, 1], ['M', 15, 13, 1, true], ['M', 8, 15, 1],
      ['M', 3, 5, 2], ['M', 14, 7, 2, true], ['S', 9, 3, 2],
    ]);
    seams(c, 30, 44, R.aspenGold);
    return cv;
  }
  // Clonal grove: two grey back stems, one front stem, a shared low crown.
  const [cv, c] = canvasOf(32, 42);
  const back = pixmap(TRUNK_ASPEN, { ...ASPEN_KEY, 3: 'white1', 2: 'white0', 1: 'stone2' });
  blit(c, back, 4, 42 - 15 - 3);
  blit(c, back, 23, 42 - 15 - 2);
  foliage(c, R.aspen, [['M', 0, 14, 0], ['M', 19, 13, 0, true], ['L', 7, 12, 0]]);
  blit(c, pixmap(TRUNK_ASPEN, ASPEN_KEY), 14, 42 - 15);
  foliage(c, R.aspen, [
    ['M', 0, 7, 1], ['L', 8, 4, 1], ['M', 20, 6, 1, true],
    ['M', 6, 0, 2], ['S', 18, 1, 2],
  ]);
  seams(c, 32, 42, R.aspen);
  return cv;
};

/** Pines: tiers stacked bottom-up so each skirt hangs over the shadowed top of the one below. */
function pineStack(w: number, h: number, ramp: Ramp, trunk: readonly string[], tk: Key, tiers: readonly Op[]): Cv {
  const [cv, c] = canvasOf(w, h);
  blit(c, pixmap(trunk, tk), Math.round(w / 2) - Math.ceil(trunk[0]!.length / 2), h - trunk.length);
  foliage(c, ramp, tiers);
  seams(c, w, h, ramp);
  return cv;
}

const PINE = (v: number, ramp: Ramp = R.pine): Cv => {
  if (v === 0)
    // Lodgepole: classic even cone.
    return pineStack(24, 46, ramp, TRUNK_PINE, barkKey(BARK), [
      ['P20', 2, 30, 1], ['P20', 2, 24, 1, true], ['P14', 5, 19, 1], ['P14', 5, 14, 1, true], ['P14', 5, 9, 2], ['PT', 7, 2, 2],
    ]);
  if (v === 1)
    // Spire fir: narrow and tall.
    return pineStack(20, 48, ramp, TRUNK_PINE, barkKey(BARK), [
      ['P14', 3, 33, 1], ['P14', 3, 28, 1, true], ['P14', 3, 23, 1], ['P14', 3, 18, 2, true], ['PT', 5, 12, 2], ['PT', 5, 6, 2], ['PT', 5, 1, 2],
    ]);
  // Ponderosa: open crown with cinnamon bark showing between tiers.
  return pineStack(24, 50, R.ponderosa, TRUNK_POND, barkKey(BARK_CINN), [
    ['P20', 2, 27, 0], ['P20', 2, 19, 1, true], ['P14', 5, 12, 1], ['P14', 5, 7, 2, true], ['PT', 7, 0, 2],
  ]);
};

/** Snowy fir: the lit tops of every bough carry snow. */
const SNOW_RAMP: Ramp = ['inkBlue', 'pine1', 'pine2', 'snow1', 'snow3', 'snow4'];
const SNOWPINE = (v: number): Cv => PINE(v === 2 ? 0 : v, SNOW_RAMP);

const JUNIPER_BERRY = ['b.', '.b'];
const JUNIPER = (v: number): Cv => {
  const tk = barkKey(['wood0', 'wood1', 'wood2', 'wood3', 'wood4']);
  let cv: Cv;
  if (v === 0)
    // Squat round juniper.
    cv = tree(24, 26, TRUNK_OAK_SMALL, tk, 8, R.juniper, [
      ['M', 1, 9, 0], ['M', 11, 9, 0, true], ['L', 4, 3, 1], ['M', 3, 1, 2], ['S', 13, 3, 2],
    ]);
  else if (v === 1)
    // Twisted shaggy juniper, two lobes on a leaning trunk.
    cv = tree(26, 28, TRUNK_LEAN, tk, 5, R.juniper, [
      ['M', 0, 11, 0], ['M', 2, 7, 1], ['S', 2, 6, 2], ['M', 13, 5, 0, true], ['M', 13, 1, 1, true], ['S', 15, 0, 2],
    ]);
  else
    // Conical Rocky Mountain juniper.
    cv = pineStack(20, 30, R.juniper, TRUNK_PINE, tk, [
      ['P14', 3, 16, 0], ['M', 4, 11, 1], ['M', 4, 6, 1, true], ['S', 6, 1, 2],
    ]);
  const c = cv.getContext('2d') as CanvasRenderingContext2D;
  const berry = pixmap(JUNIPER_BERRY, { b: 'blue3' });
  for (const [x, y] of v === 1 ? [[5, 12], [17, 7]] : v === 2 ? [[7, 13], [11, 18]] : [[7, 10], [14, 6], [11, 13]]) blit(c, berry, x!, y!);
  return cv;
};

// Dead snags — whole hand-drawn grids. o outline, 1 dark, 2 mid, 3 silver light.
const SNAG_FORK = [
  '..o3o.........o3o...',
  '...o3o.......o3o....',
  '...o32o.....o32o.o3o',
  '....o32o...o32o.o3o.',
  'o3o..o32o.o32o.o3o..',
  '.o3o..o3o.o3o.o32o..',
  '..o3o.o32o32oo32o...',
  '...o3oo3222o321o....',
  '....o3o32221o1o.....',
  '.....oo32221o.......',
  '.......o3221o.......',
  '.......o3221o.......',
  '.......o3211o.......',
  '.......o3221o.......',
  '.......o3221o.......',
  '.......o3211o.......',
  '.......o3221o.......',
  '.......o3221o.......',
  '......o33221o.......',
  '.....o3o3221oo......',
  '....o3oo32211o1o....',
  '....oo.oooooo.oo....',
];
const SNAG_STUB = [
  '.......o..o.........',
  '......o3oo2o........',
  '......o32o21o.......',
  '......o3222o1o......',
  '......o3221o1o......',
  '......o32221o.......',
  '......o32221o.......',
  '......o3oo21o.......',
  '......o3ok21o..oo...',
  '......o3oo21o.o3o...',
  '......o32221oo3o....',
  '......o322221o3o....',
  '......o32221o.oo....',
  '......o32211o.......',
  '......o32221o.......',
  '.....o332221o.......',
  '....o3o32221oo......',
  '...o3oo322211o1o....',
  '...oo.ooooooo.oo....',
];
const SNAG_TWIST = [
  '.o.o..........o.o...',
  '.o3o...o3o....o3o...',
  '..o3o..o3o...o3o..o.',
  '..o3o...o3o..o3o.o3o',
  '...o3o..o3o.o3o.o3o.',
  '...o32o..o3oo3o.o3o.',
  '....o32o.o32o3oo3o..',
  '.....o32o.o32o32o...',
  '......o32oo3222o....',
  '.......o322221o.....',
  '........o3221o......',
  '.......o3221o.......',
  '.......o3221o.......',
  '.......o3211o.......',
  '........o3221o......',
  '........o3221o......',
  '........o3211o......',
  '.......o3221o.......',
  '.......o3221o.......',
  '......o33221o.......',
  '.....o3o32211o......',
  '....o3oo322211o1o...',
  '....oo.ooooooo.oo...',
];
const SNAG_KEY: Key = { o: 'gwood0', 1: 'gwood1', 2: 'gwood2', 3: 'gwood4', k: 'ink' };
const DEADTREE = (v: number): Cv => pixmap(v === 0 ? SNAG_FORK : v === 1 ? SNAG_STUB : SNAG_TWIST, v === 2 ? { ...SNAG_KEY, 2: 'gwood3', 1: 'gwood2' } : SNAG_KEY);

// ---------------------------------------------------------------------------
// Registry consumed by propSprite.ts.

export interface PropArt {
  /** Canvas size every variant shares (renderer anchors bottom-centre). */
  w: number;
  h: number;
  shadow: number;
  make: (variant: number) => Cv;
}

export const PROP_ART: Partial<Record<number, PropArt>> = {};

/** Register an art builder; canvas size is fixed per object so anchors stay stable. */
export function defineArt(o: number, w: number, h: number, shadow: number, make: (v: number) => Cv): void {
  PROP_ART[o] = { w, h, shadow, make };
}

export const TREES = { OAK, COTTONWOOD, ASPEN, PINE, SNOWPINE, JUNIPER, DEADTREE } as const;
export type { PalName, Cv };

// ===========================================================================
// Shrubs, cacti and grasses.

/** Small foliage builder for shrubs: clumps back-to-front, seams, then accents. */
function shrub(w: number, h: number, ramp: Ramp, ops: readonly Op[], under?: Cv, accents?: (c: CanvasRenderingContext2D) => void): Cv {
  const [cv, c] = canvasOf(w, h);
  if (under) blit(c, under, 0, h - under.height);
  foliage(c, ramp, ops);
  seams(c, w, h, ramp);
  accents?.(c);
  return cv;
}

/** Scatter a stamp at hand-picked spots. */
function dots(c: CanvasRenderingContext2D, img: Cv, at: readonly (readonly [number, number])[]): void {
  for (const [x, y] of at) blit(c, img, x, y);
}

const STEMS_18 = [
  '....1..1..1.1.....',
  '.....1.1.1.1......',
  '......1111........',
];
const STEM_KEY: Key = { 1: '#5e5446' };
const FLOWER_ROSE = ['.r.', 'rYr', '.r.'];
const FLOWER_GOLD = ['.Y.', 'yyy'];
const BERRIES = ['HB', 'BB'];
const SAGE_BLOOM = ['y', 'Y'];

// Sprigs poke out of the round mass so a shrub never reads as a stone.
const SPRIG = ['3.3', '.4.'];
const SPRIG_TALL = ['.3', '3.', '34'];
function sprigs(c: CanvasRenderingContext2D, ramp: Ramp, at: readonly (readonly [number, number])[]): void {
  const a = pixmap(SPRIG, { 3: ramp[3], 4: ramp[4] });
  const b = pixmap(SPRIG_TALL, { 3: ramp[3], 4: ramp[4] });
  at.forEach(([x, y], i) => blit(c, i % 2 ? b : a, x, y));
}

const SAGE = (v: number): Cv => {
  const stems = pixmap(STEMS_18, STEM_KEY);
  if (v === 1)
    return shrub(18, 14, R.sage, [['S', 0, 5, 0], ['S', 8, 6, 0, true], ['M', 4, 2, 1], ['S', 1, 3, 2]], stems,
      (c) => sprigs(c, R.sage, [[5, 0], [9, 0], [13, 3], [1, 2], [15, 6]]));
  return shrub(18, 14, R.sage, [['S', 1, 6, 0], ['S', 8, 6, 0, true], ['M', 3, 2, 1], ['S', 9, 3, 1, true], ['S', 4, 1, 2]], stems, (c) => {
    sprigs(c, R.sage, [[4, 0], [8, 0], [12, 1], [2, 4], [15, 5], [6, 0]]);
    if (v === 2) dots(c, pixmap(SAGE_BLOOM, { y: 'dry3', Y: 'dry4' }), [[5, 2], [10, 1], [13, 4], [3, 6]]);
  });
};

const CREOSOTE = (v: number): Cv => {
  const stems = pixmap(STEMS_18, { 1: 'wood1' });
  return shrub(18, 14, R.creosote, v === 2
    ? [['S', 0, 6, 0], ['M', 5, 3, 1, true], ['S', 3, 1, 2]]
    : [['S', 1, 6, 0], ['S', 8, 5, 0, true], ['M', 3, 1, 1], ['S', 4, 0, 2]], stems,
  v === 1 ? (c) => dots(c, pixmap(['Y'], { Y: 'sun' }), [[6, 2], [10, 1], [13, 5], [4, 6], [9, 5]]) : undefined);
};

const BUSH = (v: number): Cv => {
  if (v === 1)
    // Wild rose in bloom.
    return shrub(20, 16, R.bush, [['M', 0, 6, 0], ['M', 8, 6, 0, true], ['M', 4, 1, 1], ['S', 11, 2, 1, true], ['S', 3, 1, 2]], undefined,
      (c) => dots(c, pixmap(FLOWER_ROSE, { r: 'rose', Y: 'sunL' }), [[4, 3], [11, 2], [14, 8], [7, 9], [2, 9]]));
  if (v === 2)
    // Golden rabbitbrush.
    return shrub(20, 16, R.sage, [['M', 0, 6, 0], ['M', 8, 6, 0, true], ['M', 4, 2, 1], ['S', 6, 1, 2]], pixmap(['....1..1..1.1..1....', '.....1.1.1.1.1......'], STEM_KEY),
      (c) => {
        sprigs(c, R.sage, [[3, 3], [8, 0], [14, 4], [1, 7]]);
        dots(c, pixmap(FLOWER_GOLD, { y: 'gold2', Y: 'gold4' }), [[5, 2], [9, 1], [13, 3], [3, 6], [11, 6], [15, 7], [7, 5]]);
      });
  // Green scrub oak.
  return shrub(20, 16, R.scrub, [['M', 0, 6, 0], ['M', 8, 6, 0, true], ['M', 4, 1, 1], ['S', 11, 2, 1, true], ['S', 3, 0, 2]]);
};

const BERRYBUSH = (v: number): Cv =>
  shrub(18, 14, R.bush, v === 1
    ? [['M', 0, 4, 0], ['S', 9, 6, 0, true], ['M', 5, 0, 1, true], ['S', 2, 1, 2]]
    : [['S', 0, 6, 0], ['S', 8, 6, 0, true], ['M', 3, 1, 1], ['S', 9, 2, 1, true], ['S', 4, 0, 2]], undefined,
  (c) => dots(c, pixmap(BERRIES, { H: 'blush', B: 'barn2' }), v === 2 ? [[4, 4], [12, 7], [7, 9]] : [[4, 4], [10, 3], [13, 8], [6, 9], [2, 8]]));

const GRASS_BUNCH = [
  '.....5...4....',
  '..3..4...4....',
  '...3.4..4...3.',
  '...3..4.4..3..',
  '.2..3.4.4..3..',
  '..2..344..3..2',
  '...2.344.3..2.',
  '...232332322..',
  '....1111111...',
];
const GRASS_FOX = [
  '....p....p....',
  '...pp...pp....',
  '...p4...p4..p.',
  '....4...4..pp.',
  '....3...4..4..',
  '.p...3..4.3...',
  '.pp..3.4..3...',
  '..4..3.4.3....',
  '...3.3.43.....',
  '....3334......',
  '...2223222....',
  '....11111.....',
];
const GRASS_LUPINE = [
  '..L......L....',
  '..L..4...L....',
  '..l..4..4l..3.',
  '..l.3.4.4l.3..',
  '..g.3.4.4g.3..',
  '.2g.3.44.g3..2',
  '..g23.44.g3.2.',
  '...g23442g32..',
  '...223332322..',
  '....1111111...',
];
const GRASSTUFT = (v: number): Cv =>
  v === 1 ? pixmap(GRASS_FOX, { p: 'dry5', 4: 'dry4', 3: 'dry3', 2: 'dry2', 1: 'dry1' })
  : v === 2 ? pixmap(GRASS_LUPINE, { L: 'lupineL', l: 'lupine', g: 'grass2', 4: 'grass4', 3: 'grass3', 2: 'grass2', 1: 'grass1' })
  : pixmap(GRASS_BUNCH, { 5: 'grass5', 4: 'grass4', 3: 'grass3', 2: 'grass2', 1: 'grass1' });

const REEDS_GRID = [
  '..g......g..',
  '.oBo....oBo.',
  '.oBo....oBo.',
  '.obo..g.obo.',
  '.obo.oBoobo.',
  '..g..oBo.g..',
  '..G..obo.G..',
  '.LG..obo.GL.',
  'L.G...g..G.L',
  '.LG.L.g.LG..',
  '..GL..gL.G..',
  '..G.L.G.LG..',
  '...GLGgLG...',
  '...GGgggG...',
  '....1111....',
];
const REEDS = (v: number): Cv => {
  const cv = pixmap(REEDS_GRID, { o: 'wood0', B: 'wood3', b: 'wood1', g: 'grass2', G: 'grass3', L: 'grass4', 1: 'grass1' });
  return v === 1 ? flipX(cv) : cv;
};

// Saguaro: ribbed column (lit rib, highlight rib, mid, shade) with spines (s).
const SAGUARO_GRID = [
  '......oooo......',
  '.....o3442o.....',
  '.....o3421o.....',
  '.....o3421o.....',
  '.....o3s21o.ooo.',
  '.....o3421oo342o',
  '.....o3421oo3s2o',
  '.....o3421oo342o',
  '.ooo.o3421oo342o',
  'o342oo3421oo342o',
  'o3s2oo3421oo342o',
  'o342oo342122221o',
  'o342oo342111111o',
  'o342oo3421ooooo.',
  'o342oo3421o.....',
  'o342223421o.....',
  'o111113421o.....',
  '.ooooo3421o.....',
  '.....o3421o.....',
  '.....o3421o.....',
  '....so3s21o.....',
  '.....o3421o.....',
  '.....o3421os....',
  '.....o3421o.....',
  '.....o34s1o.....',
  '.....o3421o.....',
  '....so3421o.....',
  '.....o3421o.....',
  '.....o3s21o.....',
  '.....o3421os....',
  '.....o3421o.....',
  '....oo3421oo....',
  '....oooooooo....',
];
const SAGUARO_KEY: Key = { o: 'inkGreen', 1: 'leaf1', 2: 'leaf2', 3: 'leaf3', 4: 'grass3', s: 'cream3' };
const SAGUARO = (v: number): Cv => {
  if (v === 2) return pixmap([...SAGUARO_GRID.slice(0, 4), ...SAGUARO_GRID.slice(20)], SAGUARO_KEY);
  const cv = pixmap(SAGUARO_GRID, SAGUARO_KEY);
  return v === 1 ? flipX(cv) : cv;
};

const PAD_A = [
  '..oooo..',
  '.o3442o.',
  'o34s432o',
  'o3443s2o',
  'o3s3221o',
  'o322211o',
  '.o2111o.',
  '..oooo..',
];
const PAD_B = [
  '.oooo.',
  'o3442o',
  'o3s32o',
  'o3321o',
  'o2211o',
  '.oooo.',
];
const PAD_KEY: Key = { o: 'inkGreen', 1: 'leaf2', 2: 'leaf3', 3: 'leaf4', 4: 'leaf5', s: 'cream4' };
const PRICKLYPEAR = (v: number): Cv => {
  const [cv, c] = canvasOf(18, 15);
  const a = pixmap(PAD_A, PAD_KEY);
  const b = pixmap(PAD_B, PAD_KEY);
  blit(c, b, 1, 4);
  blit(c, flipX(b), 11, 2);
  blit(c, a, 5, 7);
  if (v === 0) dots(c, pixmap(['Hf', 'ff'], { H: 'blush', f: 'barn3' }), [[3, 3], [13, 1], [8, 6]]);
  if (v === 2) dots(c, pixmap(['.Y.', 'YyY'], { Y: 'sunL', y: 'sun' }), [[2, 2], [12, 0]]);
  return v === 1 ? flipX(cv) : cv;
};

// Teddy-bear cholla: fuzzy round joints (leaf clumps re-toned straw-silver) on a dark woody stub, spines glinting on the rim.
const CHOLLA_RAMP: Ramp = ['dry0', 'dry1', 'dry2', 'dry3', 'cream3', 'cream4'];
const CACTUS2 = (v: number): Cv => {
  const [cv, c] = canvasOf(16, 16);
  blit(c, pixmap(['.o1o.', '.o1o.', 'o221o', 'ooooo'], { o: 'wood0', 1: 'wood1', 2: 'wood2' }), 6, 12);
  foliage(c, CHOLLA_RAMP, v === 2
    ? [['S', 3, 6, 1], ['S', 5, 1, 2]]
    : [['S', 7, 4, 0, true], ['S', 0, 5, 1], ['S', 4, 7, 1], ['S', 3, 0, 2]]);
  seams(c, 16, 16, CHOLLA_RAMP);
  dots(c, pixmap(['s'], { s: 'white3' }), v === 2 ? [[6, 1], [12, 3], [3, 8]] : [[4, 0], [9, 1], [0, 6], [14, 5], [2, 11], [12, 9]]);
  return v === 1 ? flipX(cv) : cv;
};

// ===========================================================================
// Rocks.

const ROCK_BIG = [
  '........oooooo........',
  '.....ooo554444oo......',
  '....o5555544444ooo....',
  '...o55554444443332o...',
  '..o5544444444333322o..',
  '.o344444444433332221o.',
  '.o333333333332221111o.',
  'o3332222k222221111111o',
  'o332222k2222211111111o',
  'o32222k22222221111111o',
  'o2222k222222211111111o',
  'o22222222222111111111o',
  '.o111111111111111111o.',
  '..oooooooooooooooooo..',
];
const ROCK_SMALL = [
  '...ooooo....',
  '..o55444ooo.',
  '.o554444333o',
  'o3333333211o',
  'o3222222111o',
  'o2222221111o',
  '.o11111111o.',
  '..oooooooo..',
];
const MOSS = ['..mMMm..mm', '.mMMMMmmMm', '..m..m....'];
const ROCK_GREY: Key = { o: 'stone0', 1: 'stone1', 2: 'stone2', 3: 'stone3', 4: 'stone4', 5: 'stone5', k: 'stone0' };
const ROCK_WARM: Key = { o: 'red0', 1: 'red2', 2: 'red3', 3: 'sand2', 4: 'sand3', 5: 'sand4', k: 'red1' };
const BOULDER = (variant: number): Cv => {
  const warm = variant >= 3;
  const v = variant % 3;
  const key = warm ? ROCK_WARM : ROCK_GREY;
  const big = pixmap(ROCK_BIG, key);
  const small = pixmap(ROCK_SMALL, key);
  const [cv, c] = canvasOf(30, 18);
  if (v === 0) blit(c, big, 4, 4);
  else if (v === 1) {
    blit(c, big, 0, 3);
    blit(c, small, 17, 10);
  } else {
    blit(c, small, 0, 9);
    blit(c, flipX(big), 7, 4);
    if (!warm) blit(c, pixmap(MOSS, { m: 'grass2', M: 'grass3' }), 12, 4);
  }
  return cv;
};

const HOODOO_GRID = [
  '...oooooooo...',
  '.ooDDDDCCCcoo.',
  'oDDDCCCCCcccco',
  'occcccccccccco',
  '.oooo4321oooo.',
  '....o4321o....',
  '...o443321o...',
  '..o54443321o..',
  '..o44433221o..',
  '..o33332211o..',
  '...o222111o...',
  '....o2211o....',
  '..o5444332221o',
  '.o54444332211o',
  '.o44443332211o',
  '.o33333222111o',
  '.o22222221111o',
  '..o111111111o.',
  '...o3221111o..',
  '..o544433221o.',
  '.o54444333221o',
  'o444443332221o',
  'o444433322211o',
  'o333333222111o',
  'o322222221111o',
  '.o2222211111o.',
  '..o11111111o..',
  '...o433221o...',
  '..o54443321o..',
  '.o5444433221o.',
  '.o4444333221o.',
  'o444443332211o',
  'o333333222111o',
  'o333222221111o',
  'o222222211111o',
  'o222222111111o',
  'o111111111111o',
  '.oooooooooooo.',
];
const HOODOO_KEY: Key = { o: 'red0', 1: 'red1', 2: 'red2', 3: 'red3', 4: 'red4', 5: 'red5', c: 'dirt1', C: 'dirt2', D: 'dirt3' };
const HOODOO = (v: number): Cv => {
  if (v === 2) return pixmap([...HOODOO_GRID.slice(0, 12), ...HOODOO_GRID.slice(19)], HOODOO_KEY);
  const cv = pixmap(HOODOO_GRID, HOODOO_KEY);
  return v === 1 ? flipX(cv) : cv;
};

// ===========================================================================
// Wood: fences, posts, logs. o outline, 1-5 wood ramp dark → light.

const WOOD: Key = { o: 'wood0', 1: 'wood1', 2: 'wood2', 3: 'wood3', 4: 'wood4', 5: 'wood5' };
const GWOOD: Key = { o: 'gwood0', 1: 'gwood1', 2: 'gwood2', 3: 'gwood3', 4: 'gwood4', 5: 'cream3' };

// Round-topped post with a highlight stripe; rails run edge to edge so fences tile.
const FENCE_H = [
  '..ooo...........',
  '.o453o..........',
  '.o432o..........',
  'oo432ooooooooooo',
  '4o432o4444444444',
  '2o432o2222222122',
  'oo432ooooooooooo',
  '.o432o..........',
  'oo432ooooooooooo',
  '4o432o4444444444',
  '2o321o2221222222',
  'oo321ooooooooooo',
  '.o321o..........',
  '.ooooo..........',
];
const FENCE_V = [
  '......o42o......',
  '......o42o......',
  '......o42o......',
  '......o42o......',
  '......oooo......',
  '......o453o.....',
  '......o432o.....',
  '......o432o.....',
  '......o432o.....',
  '......o432o.....',
  '......o432o.....',
  '......o432o.....',
  '......o321o.....',
  '......o321o.....',
  '......o321o.....',
  '......ooooo.....',
];
const HITCH = [
  '.oooooooooooooooo.',
  'o4444444444444443o',
  'o2222222222222221o',
  '.oooooooooooooooo.',
  '..o43o..tt..o43o..',
  '..o43o.t..t.o43o..',
  '..o43o..tt..o43o..',
  '..o43o......o43o..',
  '..o43o......o43o..',
  '..o42o......o42o..',
  '..o32o......o32o..',
  '..o32o......o32o..',
  '.o3321o....o3321o.',
  '.oooooo....oooooo.',
];

const LOG_BODY = [
  '.oooooooooooooooooo',
  'o444444444444444444',
  'o333322333333223333',
  'o222222112222222112',
  'o221222222221222222',
  'o222222222222222222',
  'o111111111111111111',
  '.oooooooooooooooooo',
];
const LOG_END = [
  '.oooo.',
  'oCCCCo',
  'oCrrCo',
  'oCrnCo',
  'oCnrCo',
  'oCrrCo',
  'oCCCro',
  '.oooo.',
];
const LOG_HOLLOW = [
  '.oooo.',
  'oCCCCo',
  'oCkkCo',
  'oCkkCo',
  'oCkkCo',
  'oCkkCo',
  'oCCCro',
  '.oooo.',
];
const END_KEY: Key = { o: 'wood1', C: 'wood5', r: 'wood4', n: 'wood3', k: 'wood0' };
const LOG_MOSS = ['...gg.....ggg......', '..gGGg...gGGGg..g..'];
const MUSHROOM = ['.MM.', 'MHMm', '.ww.'];
const MUSH_KEY: Key = { M: 'barn3', H: 'blush', m: 'barn1', w: 'white2' };
const LOG = (v: number): Cv => {
  const [cv, c] = canvasOf(24, 12);
  if (v === 2) blit(c, pixmap(['o3o', 'o3o', 'o2o'], WOOD), 6, 1);
  blit(c, pixmap(LOG_BODY, WOOD), 0, 3);
  blit(c, pixmap(v === 2 ? LOG_HOLLOW : LOG_END, END_KEY), 17, 3);
  if (v === 1) {
    blit(c, pixmap(LOG_MOSS, { g: 'grass2', G: 'grass4' }), 0, 2);
    dots(c, pixmap(MUSHROOM, MUSH_KEY), [[3, 8], [9, 9]]);
  }
  return cv;
};

const STUMP_GRID = [
  '..oooooooooo..',
  '.o5555555554o.',
  'o554444444554o',
  'o554443344554o',
  'o555555555544o',
  'o432212222111o',
  'o432222122111o',
  'o422122222111o',
  'o432222221111o',
  'o343222222111o',
  '.oooooooooooo.',
];
const AXE = ['oo......', 'o4o.....', '.o4o....', '..o4o...', '..okKko.', '..okkko.'];
const STUMP = (v: number): Cv => {
  const [cv, c] = canvasOf(14, 14);
  blit(c, pixmap(STUMP_GRID, WOOD), 0, 3);
  if (v === 1) dots(c, pixmap(MUSHROOM, MUSH_KEY), [[0, 11], [10, 11]]);
  if (v === 2) blit(c, pixmap(AXE, { o: 'ink', 4: 'wood4', k: 'tin2', K: 'tin4' }), 3, 0);
  return cv;
};

const RING_5 = ['.ooo.', 'o554o', 'o5n3o', 'o443o', '.ooo.'];
const WOODPILE = (v: number): Cv => {
  const [cv, c] = canvasOf(20, 12);
  const a = pixmap(RING_5, { o: 'wood1', 5: 'wood5', 4: 'wood4', 3: 'wood3', n: 'wood3' });
  const b = pixmap(RING_5, { o: 'wood1', 5: 'wood4', 4: 'wood3', 3: 'wood2', n: 'wood2' });
  const rows: [number, number, number][] = [[0, 7, 5], [2, 4, 4], [4, 1, v === 2 ? 2 : 3]];
  for (const [x0, y, n] of rows) for (let i = 0; i < n; i++) blit(c, (i + y + v) % 2 ? a : b, x0 + i * 4, y);
  return cv;
};

// Wheat stalk: a grain head leaning right on a thin stalk with one leaf.
const WHEAT = ['..L', '.LH', '.Hh', 'LHo', 'Hh.', 'ho.', 's..', 's..', 'sS.', 's.S', 's..', 's..'];
const CORNSTALK = (v: number): Cv => {
  const [cv, c] = canvasOf(18, 18);
  const back = pixmap(WHEAT, { L: 'dry4', H: 'dry3', h: 'dry2', o: 'dry1', s: 'dry1', S: 'dry2' });
  const front = pixmap(WHEAT, { L: 'dry5', H: 'dry4', h: 'dry3', o: 'dry1', s: 'dry2', S: 'grass3' });
  const spots: [number, number, boolean][] = [[1, 3, false], [5, 1, false], [9, 2, false], [13, 0, false], [0, 6, true], [4, 5, true], [7, 6, true], [11, 4, true], [14, 6, true]];
  for (const [x, y, f] of spots) blit(c, f ? front : back, v === 1 ? 15 - x : x, y);
  return cv;
};

// ===========================================================================
// Town props.

const TROUGH = [
  '.oooooooooooooooooo.',
  'o444444444444444443o',
  'o4vvWWvvvvvvvvvvvv2o',
  'o4uvvvvvvvvvWvvvvu2o',
  'o33k333333333333k31o',
  'o22k222222222222k21o',
  'o33k333333333333k31o',
  'o11k111111111111k11o',
  '.o2o............o2o.',
  '.ooo............ooo.',
];
const BARREL = [
  '...oooooooo...',
  '..o44444432o..',
  '.o3433333221o.',
  '.oKkkkkkkkkjo.',
  'o344333322211o',
  'o454333322211o',
  'o454333322211o',
  'oKKkkkkkkkkkjo',
  'o454333322211o',
  'o454333322211o',
  'o344333322211o',
  '.oKkkkkkkkkjo.',
  '.o3433332221o.',
  '..oooooooooo..',
];
const CRATE = [
  '.oooooooooooooo.',
  'o54444444444443o',
  'o43333333333332o',
  'oooooooooooooooo',
  'o44444444444442o',
  'o44433333333332o',
  'o43344333333332o',
  'o41111441111112o',
  'o43333334433332o',
  'o43333333344332o',
  'o41111111111442o',
  'o22222222222221o',
  'oooooooooooooooo',
];
const HAYBALE = [
  '.oooooooooooooooo.',
  'o4455t444455t4443o',
  'o4444t554444t4543o',
  'o3333t333333t3332o',
  'o2222T222222T2221o',
  'o3322T222332T2221o',
  'o2222T332222T3211o',
  'o2332T222222T2211o',
  'o2222T223322T2211o',
  'o1111T111111T1111o',
  '.oooooooooooooooo.',
];
const LAMPPOST = [
  '...oooo...',
  '..o1221o..',
  '.oooooooo.',
  '.o3lLLl1o.',
  '.o3LLLl1o.',
  '.o3lLLl1o.',
  '.o3llll1o.',
  '.oooooooo.',
  '...o21o...',
  '...o31o...',
  '...o31o...',
  '...o31o...',
  '...o31o...',
  '...o31o...',
  '..o3221o..',
  '...o31o...',
  '...o31o...',
  '...o31o...',
  '...o31o...',
  '...o31o...',
  '...o31o...',
  '...o31o...',
  '...o31o...',
  '...o31o...',
  '...o31o...',
  '...o31o...',
  '..o3221o..',
  '.o332211o.',
  '.oooooooo.',
];
const SIGNPOST = [
  '.........oo.........',
  '........o32o........',
  '.oooooooooooooooo...',
  '.o444444444444443o..',
  '.o3113131131133332o.',
  '.o222222222222221o..',
  '.oooooooooooooooo...',
  '........o32o........',
  '...oooooooooooooooo.',
  '..oAAAAAAAAAAAAAABo.',
  '.oBBBkkBkkBkBkkBBCo.',
  '..oCCCCCCCCCCCCCCDo.',
  '...oooooooooooooooo.',
  '........o32o........',
  '........o32o........',
  '........o32o........',
  '........o32o........',
  '........o32o........',
  '........o32o........',
  '........o32o........',
  '........o32o........',
  '........o32o........',
  '.......o33221o......',
  '.......ooooooo......',
];
const WELL = [
  '........oooo........',
  '......ooSSRRoo......',
  '....ooSSSRRRRRoo....',
  '..ooSSSSRRRRRRrroo..',
  'ooSSSSSRRRRRRrrrrroo',
  'oooooooooooooooooooo',
  '..o3o..........o2o..',
  '..o3o4444444444o2o..',
  '..o3o....y.....o2o..',
  '..o3o....y.....o2o..',
  '..o3o...ooo....o2o..',
  '..o3o...o3o....o2o..',
  '..oooooooooooooooo..',
  '.odddcccccccccccbbo.',
  'odcowwwwwwwwwwwwobbo',
  'odcoWwwwwwwwwwwwobao',
  'oddccoooooooooccbbao',
  'oddddaccccaccccabbbo',
  'occccaccccacccbabbbo',
  'oaaaaaaaaaaaaaaaaaao',
  'oddaccccaccccabbbbao',
  'occaccccacccbabbbbao',
  '.oooooooooooooooooo.',
];
const GRAVE = [
  '.....oo.....',
  '....o43o....',
  '....o32o....',
  '.oooo32oooo.',
  'o4444444443o',
  'o2222222221o',
  '.oooo32oooo.',
  '....o32o....',
  '....o32o....',
  '....o32o....',
  '....o32o....',
  '....o31o....',
  '....o31o....',
  '.ooeeeeeeoo.',
  'oeeddddddcco',
  '.oooooooooo.',
];
const TOMBSTONE = [
  '...oooooo...',
  '..o544443o..',
  '.o54444432o.',
  '.o44444432o.',
  '.o4kkkk332o.',
  '.o44444332o.',
  '.o4kkk4332o.',
  '.o44443322o.',
  '.o43333221o.',
  '.o33332221o.',
  'go33322211og',
  '.oooooooooo.',
];

const MINE = [
  '.........oooooooooo.........',
  '......ooo4444444333ooo......',
  '....oo4444444444333332oo....',
  '...o44444444443333332222o...',
  '..o444oooooooooooooooo222o..',
  '.o3444oLLLLLLLLLLLLLLo2221o.',
  '.o3444ollllllllllllllo2221o.',
  'o33444oooooooooooooooo22211o',
  'o33433oLloddddddddoLlo22211o',
  'o23433oLloddddddddoLlo21211o',
  'o33343oLloddddddddoLlo22111o',
  'o32333oLloddddddddoLlo22211o',
  'o33433oLloddddddddoLlo21111o',
  'o23343oLloddddddddoLlo22211o',
  'o33333oLloddddddddoLlo22111o',
  'o32433oLloddddddddoLlo21211o',
  'o33343oLloddddddddoLlo22211o',
  'o23333oLlodtddddtdoLlo22111o',
  'o33433oLlodtddddtdoLlo21211o',
  'o32333oLlodtddddtdoLlo22111o',
  'o22333oLlodtddddtdoLlo21111o',
  'o22222oLlodtddddtdoLlo11111o',
  '.oooooooooooooooooooooooooo.',
];

const WHEEL = [
  '..ooooo..',
  '.o22222o.',
  'o2o.3.o2o',
  'o2.3.3.2o',
  'o23.h.32o',
  'o2.3.3.2o',
  'o2o.3.o2o',
  '.o22222o.',
  '..ooooo..',
];
const WAGON_BODY = [
  'oooooooooooooooooooooooooooooo',
  'o444k444444444444444444444k43o',
  'o333k333333333333333333333k32o',
  'o111k111111111111111111111k11o',
  'o333k333333333333333333333k32o',
  'o222k222222222222222222222k21o',
  'oooooooooooooooooooooooooooooo',
];
const SACK = ['..ooo..', '.o443o.', 'o44332o', 'o43322o', '.ooooo.'];
const SEAT = ['oooooo', 'o4443o', 'oooooo', '.o2o..', '.o2o..'];
const WAGON = (v: number): Cv => {
  const [cv, c] = canvasOf(40, 26);
  const cream: Key = { o: 'inkWarm', 4: 'cream3', 3: 'cream2', 2: 'cream1' };
  blit(c, pixmap(SEAT, WOOD), 26, 9);
  dots(c, pixmap(SACK, cream), v === 1 ? [[6, 10]] : [[7, 10], [12, 10]]);
  if (v !== 1) blit(c, pixmap(BARREL, { ...WOOD, K: 'tin3', k: 'tin1', j: 'tin0' }), 17, 0);
  blit(c, pixmap(WAGON_BODY, { ...WOOD, k: 'tin1' }), 3, 14);
  blit(c, pixmap(['ooooooo', '4444443', 'ooooooo'], WOOD), 33, 18);
  const wheel = pixmap(WHEEL, { o: 'ink', 2: 'wood2', 3: 'wood4', h: 'brass2' });
  blit(c, wheel, 5, 17);
  blit(c, wheel, 24, 17);
  return v === 2 ? flipX(cv) : cv;
};

const TENT_GRID = [
  '.............oo.............',
  '............o44o............',
  '...........o4433o...........',
  '..........o444332o..........',
  '.........o44443322o.........',
  '........o4444333222o........',
  '.......o444443332222o.......',
  '......o444444dd222222o......',
  '.....o444444dddd222222o.....',
  '....o444444dddddd222222o....',
  '...o4444443dddddd3222222o...',
  '..o44444443dddddd32222222o..',
  '.o444444443dddddd322222221o.',
  'o4444444443dddddd3222222211o',
  'o3333333334dddddd2111111111o',
  '.oooooooooooooooooooooooooo.',
];
const TEEPEE_GRID = [
  '........p......p........',
  '.........p....p.........',
  '..........p..p..........',
  '...........oo...........',
  '..........o43o..........',
  '..........o43o..........',
  '.........o4432o.........',
  '.........o4432o.........',
  '........o444322o........',
  '........o443322o........',
  '.......o44443322o.......',
  '.......o44433322o.......',
  '......o4444333221o......',
  '......o4444333221o......',
  '.....o444443332221o.....',
  '.....orrRrrRrrRrrRo.....',
  '....orryrryrryrryrro....',
  '....orrrrrrrrrrrrrro....',
  '...o4444443333322221o...',
  '...o4444443333322211o...',
  '..o4444444dddd3322221o..',
  '..o444444dddddd332221o..',
  '.o4444444dddddd3322221o.',
  '.o4444444dddddd3322221o.',
  'o44444444dddddd33222211o',
  'o33333333dddddd11111111o',
  'oooooooooooooooooooooooo',
];
const CANVAS_KEY: Key = { o: 'inkWarm', 1: 'cream0', 2: 'cream1', 3: 'cream2', 4: 'cream3', d: 'black1', p: 'wood2', r: 'barn2', R: 'cream4', y: 'gold3' };

const WINDMILL_WHEEL = [
  '......ooooo......',
  '....oo34343oo....',
  '...o434343434o...',
  '..o43434o34343o..',
  '.o3434o.o.o4343o.',
  '.o434o..o..o434o.',
  'o3434o..o..o4343o',
  'o434o...o...o434o',
  'o343oooohoooo343o',
  'o434o...o...o434o',
  'o3432o..o..o2323o',
  '.o232o..o..o232o.',
  '.o2323o.o.o2323o.',
  '..o23232o23232o..',
  '...o232323232o...',
  '....oo23232oo....',
  '......ooooo......',
];
const WINDMILL_TOWER = [
  '...oooooooo...',
  '...o332211o...',
  '...oooooooo...',
  '....3o..3o....',
  '....3o..3o....',
  '....3o..3o....',
  '....3o..3o....',
  '....32223o....',
  '....3o..3o....',
  '...3o....3o...',
  '...3o....3o...',
  '...3o....3o...',
  '...3o....3o...',
  '...3o....3o...',
  '...3222223o...',
  '..3o......3o..',
  '..3o......3o..',
  '..3o......3o..',
  '..3o......3o..',
  '..3o......3o..',
  '..3o......3o..',
  '..322222223o..',
  '.3o........3o.',
  '.3o........3o.',
  '.3o........3o.',
  '.3o........3o.',
  '.3o........3o.',
  '.3o........3o.',
  '3o..........3o',
  'oo..........oo',
];
const WINDMILL = (): Cv => {
  const [cv, c] = canvasOf(26, 46);
  blit(c, pixmap(WINDMILL_TOWER, GWOOD), 6, 16);
  blit(c, pixmap(['oooooooooo', 'o44444443o', '.oooooooo.'], { o: 'rust0', 4: 'rust2', 3: 'rust1' }), 13, 8);
  blit(c, pixmap(WINDMILL_WHEEL, { o: 'tin0', 2: 'tin2', 3: 'tin3', 4: 'tin4', h: 'rust2' }), 4, 1);
  return cv;
};

const TOWER_ROOF = [
  '..............oo..............',
  '............oo55oo............',
  '..........oo554443oo..........',
  '........oo5544444332oo........',
  '......oo55444444433322oo......',
  '....oo554444444443333222oo....',
  '..oo5544444444444333332221oo..',
  'oo44444444444443333332222221oo',
  'oooooooooooooooooooooooooooooo',
];
const TANK_S = 'o44343333323323232221221211o';
const TANK_B = 'oKKkkkkkkkkkkkkkkkkkkkkkkkjo';
const TANK = [TANK_S, TANK_S, TANK_B, TANK_S, TANK_S, TANK_S, TANK_S, TANK_S, TANK_S, TANK_B, TANK_S, TANK_S, TANK_S, TANK_S, TANK_S, TANK_B, 'o11111111111111111111111111o', 'oooooooooooooooooooooooooooo'];
const LEG = '...3o.....3o......3o.....3o...';
const TOWER_LEGS = [LEG, LEG, LEG, LEG, LEG, LEG, LEG, '...32222222222222222222223o...', LEG, LEG, LEG, LEG, LEG, LEG, LEG, '...oo.....oo......oo.....oo...'];
const WATERTOWER = (): Cv => {
  const [cv, c] = canvasOf(32, 44);
  blit(c, pixmap(TOWER_LEGS, WOOD), 1, 28);
  blit(c, pixmap(['.ooo.', 'o2k2o', '.oko.', '..k..', '..k..'], { o: 'tin0', 2: 'tin2', k: 'tin1' }), 24, 26);
  blit(c, pixmap(TANK, { ...WOOD, K: 'tin3', k: 'tin1', j: 'tin0' }), 2, 9);
  blit(c, pixmap(TOWER_ROOF, { o: 'ink', 1: 'barn0', 2: 'barn1', 3: 'barn2', 4: 'barn3', 5: 'barn4' }), 1, 0);
  return cv;
};

const ANVIL = [
  '...ooooooooooo.',
  '.oo55444444443o',
  'o4433333333221o',
  '.oo11111111111o',
  '....oo2221oo...',
  '.....o3221o....',
  '....o332211o...',
  '...o43322211o..',
  '...oooooooooo..',
];
const ANVIL_BLOCK = ['ooooooooooooo', 'o44443333221o', 'o32223222111o', 'o32222221111o', 'ooooooooooooo'];

const STALL = [
  'oooooooooooooooo',
  'o44444444444443o',
  'o22222222222221o',
  'oooooooooooooooo',
  'o3o.............',
  'o3o.............',
  'o3o.............',
  'o3o.............',
  'o3o....Y...Y....',
  'o3o..YyYy.YyY...',
  'o3o.YyyzyYyyzyY.',
  'o3oooooooooooooo',
  'o3o444444444443o',
  'o3o222222222221o',
  'o3o111111111111o',
  'o3o333333333332o',
  'o3o222222222221o',
  'o3o111111111111o',
  'o2oooooooooooooo',
  'ooo.............',
];

// ===========================================================================
// Interior furniture (visible when the roof is hidden).

const COUNTER = [
  'oooooooooooooooo',
  '4444444444444444',
  '4444455444444444',
  '3333333333333333',
  'oooooooooooooooo',
  '2222222222222222',
  '1ooooooo1ooooooo',
  '1o33332o1o33332o',
  '1o32222o1o32222o',
  '1o32222o1o32222o',
  '1ooooooo1ooooooo',
  '1111111111111111',
  'oooooooooooooooo',
];
const BOTTLE = ['.o.', 'oGo', 'oGo', 'ogo'];
const TABLE = [
  '.......oo.........',
  '......oKko........',
  '.oooooooooooooooo.',
  'o4444444444444443o',
  'o4444445444444432o',
  'o3333333333333322o',
  'oooooooooooooooooo',
  'o2222222222222221o',
  'oooooooooooooooooo',
  '.o32o........o21o.',
  '.o32o........o21o.',
  '.o32o........o21o.',
  '.oooo........oooo.',
];
const CHAIR = [
  '.oooooooo.',
  '.o443321o.',
  '.oooooooo.',
  '.o3o..o2o.',
  '.o3o..o2o.',
  'oooooooooo',
  'o44444443o',
  'o33333322o',
  'oooooooooo',
  '.o3o..o2o.',
  '.o3o..o1o.',
  '.oo....oo.',
];
const BED = [
  'oooooooooooooooo',
  'o44444444444443o',
  'o33333333333332o',
  'oooooooooooooooo',
  'o2vvvvvvvvvvvv1o',
  'o2vWWWwvvWWWwv1o',
  'o2vwwwvvvwwwvv1o',
  'o2vvvvvvvvvvvv1o',
  'o2RRRRRRRRRRRR1o',
  'o2rrrbbbyyyrrr1o',
  'o2rrrbbbyyyrrr1o',
  'o2bbbyyyrrrbbb1o',
  'o2bbbyyyrrrbbb1o',
  'o2yyyrrrbbbyyy1o',
  'o2yyyrrrbbbyyy1o',
  'o21111111111111o',
  'oooooooooooooooo',
  '.o1o........o1o.',
];
const SHELF = [
  'oooooooooooooooo',
  'o44444444444443o',
  'o3BbRrGgkkkJjk1o',
  'o3BbRrGgkkkJjk1o',
  'o3BbRrGgkTtJjk1o',
  'o34444444444441o',
  'o3kkJjkTtkRrBb1o',
  'o3kkJjkTtkRrBb1o',
  'o3TtJjkTtkRrBb1o',
  'o34444444444441o',
  'o3GgkSSskBbRrk1o',
  'o3GgSSsskBbRrk1o',
  'o3GgSssskBbRrk1o',
  'o34444444444441o',
  'o3o2222oo2222o1o',
  'o3o222KooK222o1o',
  'o3o2222oo2222o1o',
  'o3oooooooooooo1o',
  'oooooooooooooooo',
];
const STOVE = [
  '.....o21o.....',
  '.....o21o.....',
  '.....o21o.....',
  '.....o21o.....',
  '.....o21o.....',
  '.....o31o.....',
  '.....o21o.....',
  '.....o21o.....',
  '.....o21o.....',
  '.....o21o.....',
  '....oooooo....',
  '...o332211o...',
  '..oooooooooo..',
  '.o3322222111o.',
  'o33fFFf221111o',
  'o33ffff221111o',
  'o332222222111o',
  '.o3322221111o.',
  '..oooooooooo..',
  '..o2o....o1o..',
  '.ooo......ooo.',
];
const PIANO = [
  'oooooooooooooooooo',
  'o4444444444444443o',
  'o3333333333333332o',
  'oooooooooooooooooo',
  'o3222222222222221o',
  'o32oooooooooooo21o',
  'o32o3222222221o21o',
  'o32o2222222211o21o',
  'o32oooooooooooo21o',
  'oooooooooooooooooo',
  'owkwkwwkwkwkwwkwko',
  'oWWWWWWWWWWWWWWWWo',
  'oooooooooooooooooo',
  'o3222222222222221o',
  'o3222222222222221o',
  'o2222222222222211o',
  'oooooooooooooooooo',
  '.o1o..........o1o.',
];
const PEW = [
  'oooooooooooooooo',
  '4444444444444444',
  '3333333333333333',
  '2222222222222222',
  'oooooooooooooooo',
  '4444444444444444',
  '3333333333333333',
  'oooooooooooooooo',
  '1111111111111111',
  'oooooooooooooooo',
];
const CELL_BARS = '.4o.4o.4o.4o.4o.';
const CELL = [
  'oooooooooooooooo', '4444444444444444', '2222222222222222', 'oooooooooooooooo',
  CELL_BARS, CELL_BARS, CELL_BARS, CELL_BARS, CELL_BARS, CELL_BARS, CELL_BARS, CELL_BARS, CELL_BARS,
  'oooooooooooooooo', '4444444444444444', '2222222222222222', 'oooooooooooooooo',
  CELL_BARS, CELL_BARS, CELL_BARS, CELL_BARS, CELL_BARS, CELL_BARS, 'oooooooooooooooo',
];
const DESK = [
  'oooooooooooooooooo',
  'o4PPPp4444444kK43o',
  'o3pppp33333333kk2o',
  'oooooooooooooooooo',
  'okkkkkkko32222221o',
  'okkkkkkko2222K221o',
  'okkkkkkko11111111o',
  'okkkkkkko2222K221o',
  'okkkkkkko22222221o',
  'o2o.....o11111111o',
  'ooo.....oooooooooo',
];
const SAFE = [
  'oooooooooooooo',
  'o444444444443o',
  'o3oooooooooo2o',
  'o3o33333321o2o',
  'o3o32222211o2o',
  'o3o32KKk211o2o',
  'o3o32Kkk211o2o',
  'o3o3222H211o2o',
  'o3o32222211o2o',
  'o3o21111111o2o',
  'o3oooooooooo2o',
  'o222222222221o',
  'oooooooooooooo',
  '.o1o......o1o.',
];
const FIREPIT = [
  '....oo.ooo.oo...',
  '..ooSSoSSSoSSoo.',
  '.oSSoaaaaaaaoSo.',
  'oSSoaWWwaeaaoSdo',
  'oSdoaeWWwwaaoSdo',
  'oSdoaaaewWaaoddo',
  '.oSSoaaaaaaoSdo.',
  '..ooSSoSSSoSdoo.',
  '....oo.ooo.oo...',
];
const IRON: Key = { o: 'ink', 1: 'black1', 2: 'black2', 3: 'black3', 4: 'tin2', 5: 'tin3', f: 'fire', F: 'lampL' };
const DARKWOOD: Key = { o: 'ink', 1: 'wood0', 2: 'wood1', 3: 'wood2', 4: 'wood3', 5: 'wood4' };

/** Register every non-tree prop. Called once from propSprite.ts. */
export function defineProps(O: Readonly<Record<string, number>>): void {
  const one = (grid: readonly string[], key: Key) => (): Cv => pixmap(grid, key);
  const flipOdd = (grid: readonly string[], key: Key) => (v: number): Cv => (v === 1 ? flipX(pixmap(grid, key)) : pixmap(grid, key));
  defineArt(O.Saguaro!, 16, 34, 5, SAGUARO);
  defineArt(O.PricklyPear!, 18, 15, 5, PRICKLYPEAR);
  defineArt(O.Cactus2!, 16, 16, 4, CACTUS2);
  defineArt(O.Sage!, 18, 14, 5, SAGE);
  defineArt(O.Creosote!, 18, 14, 5, CREOSOTE);
  defineArt(O.Bush!, 20, 16, 6, BUSH);
  defineArt(O.BerryBush!, 18, 14, 6, BERRYBUSH);
  defineArt(O.GrassTuft!, 14, 12, 0, GRASSTUFT);
  defineArt(O.Reeds!, 12, 16, 0, REEDS);
  defineArt(O.Boulder!, 30, 18, 10, BOULDER);
  defineArt(O.Hoodoo!, 14, 38, 6, HOODOO);
  defineArt(O.FenceH!, 16, 14, 0, one(FENCE_H, WOOD));
  defineArt(O.FenceV!, 16, 16, 0, one(FENCE_V, WOOD));
  defineArt(O.Log!, 24, 12, 6, LOG);
  defineArt(O.Stump!, 14, 14, 4, STUMP);
  defineArt(O.HitchPost!, 18, 14, 0, one(HITCH, { ...WOOD, t: 'tin3' }));
  defineArt(O.Well!, 20, 24, 7, one(WELL, { o: 'ink', R: 'barn2', S: 'barn3', r: 'barn1', 3: 'wood3', 2: 'wood2', 4: 'wood4', y: 'dry3', d: 'stone4', c: 'stone3', b: 'stone2', a: 'stone1', w: 'water0', W: 'water2' }));
  defineArt(O.Trough!, 20, 10, 4, one(TROUGH, { ...WOOD, v: 'water3', W: 'water5', u: 'water2', k: 'tin1' }));
  defineArt(O.LampPost!, 10, 30, 3, one(LAMPPOST, { o: 'ink', 1: 'black1', 2: 'black2', 3: 'black3', l: 'lamp', L: 'lampL' }));
  defineArt(O.Crate!, 16, 16, 6, one(CRATE, WOOD));
  defineArt(O.Barrel!, 14, 16, 5, flipOdd(BARREL, { ...WOOD, K: 'tin3', k: 'tin1', j: 'tin0' }));
  defineArt(O.HayBale!, 18, 14, 6, one(HAYBALE, { o: 'dry0', 1: 'dry1', 2: 'dry2', 3: 'dry3', 4: 'dry4', 5: 'dry5', t: 'wood3', T: 'wood1' }));
  defineArt(O.Grave!, 12, 16, 0, flipOdd(GRAVE, { ...GWOOD, e: 'dirt4', d: 'dirt3', c: 'dirt2' }));
  defineArt(O.Tombstone!, 12, 14, 0, flipOdd(TOMBSTONE, { o: 'stone0', 1: 'stone1', 2: 'stone2', 3: 'stone3', 4: 'stone4', 5: 'stone5', k: 'stone2', g: 'grass3' }));
  defineArt(O.Signpost!, 20, 24, 0, one(SIGNPOST, { ...WOOD, A: 'gwood4', B: 'gwood3', C: 'gwood2', D: 'gwood1', k: 'gwood0' }));
  defineArt(O.MineEntrance!, 28, 24, 0, one(MINE, { o: 'dirt0', 1: 'dirt1', 2: 'dirt2', 3: 'dirt3', 4: 'dirt4', L: 'wood4', l: 'wood3', d: 'black0', t: 'tin2' }));
  defineArt(O.Wagon!, 40, 26, 14, WAGON);
  defineArt(O.Tent!, 28, 18, 12, flipOdd(TENT_GRID, CANVAS_KEY));
  defineArt(O.Teepee!, 24, 28, 6, one(TEEPEE_GRID, CANVAS_KEY));
  defineArt(O.Windmill!, 26, 46, 6, WINDMILL);
  defineArt(O.WaterTower!, 32, 44, 6, WATERTOWER);
  defineArt(O.Woodpile!, 20, 12, 6, WOODPILE);
  defineArt(O.Cornstalk!, 18, 18, 0, CORNSTALK);
  defineArt(O.Anvil!, 16, 14, 4, () => {
    const [cv, c] = canvasOf(16, 14);
    blit(c, pixmap(ANVIL_BLOCK, WOOD), 1, 9);
    blit(c, pixmap(ANVIL, IRON), 0, 1);
    return cv;
  });
  defineArt(O.Stall!, 16, 20, 0, one(STALL, { ...WOOD, y: 'dry3', Y: 'dry4', z: 'dry2' }));
  defineArt(O.Counter!, 16, 18, 0, one(COUNTER, WOOD));
  defineArt(O.Bar!, 16, 18, 0, () => {
    const [cv, c] = canvasOf(16, 18);
    blit(c, pixmap(COUNTER, DARKWOOD), 0, 5);
    blit(c, pixmap(BOTTLE, { o: 'ink', G: 'teal3', g: 'teal1' }), 3, 2);
    blit(c, pixmap(BOTTLE, { o: 'ink', G: 'brass2', g: 'rust1' }), 10, 2);
    blit(c, pixmap(['oo', 'Wo'], { o: 'white0', W: 'white3' }), 7, 4);
    return cv;
  });
  defineArt(O.Table!, 18, 14, 4, one(TABLE, { ...WOOD, K: 'tin4', k: 'tin2' }));
  defineArt(O.Chair!, 10, 12, 0, flipOdd(CHAIR, WOOD));
  defineArt(O.Bed!, 16, 18, 0, one(BED, { ...WOOD, v: 'white1', w: 'white2', W: 'white3', R: 'barn3', r: 'barn2', b: 'blue2', y: 'dry3' }));
  defineArt(O.Shelf!, 16, 22, 0, one(SHELF, { ...WOOD, k: 'wood0', B: 'blue3', b: 'blue1', R: 'barn3', r: 'barn1', G: 'teal3', g: 'teal1', J: 'cream3', j: 'cream1', T: 'tin3', t: 'tin1', S: 'dry4', s: 'dry2', K: 'brass3' }));
  defineArt(O.Stove!, 14, 22, 0, one(STOVE, IRON));
  defineArt(O.Piano!, 18, 20, 0, one(PIANO, { ...DARKWOOD, w: 'white2', W: 'white3', k: 'black0' }));
  defineArt(O.Pew!, 16, 12, 0, one(PEW, WOOD));
  defineArt(O.Cell!, 16, 24, 0, one(CELL, { o: 'tin0', 4: 'tin3', 2: 'tin1' }));
  defineArt(O.Desk!, 18, 16, 0, one(DESK, { ...WOOD, k: 'wood0', P: 'white3', p: 'white1', K: 'brass3' }));
  defineArt(O.Safe!, 14, 16, 0, one(SAFE, { o: 'ink', 1: 'teal0', 2: 'teal1', 3: 'teal2', 4: 'teal3', K: 'brass3', k: 'brass1', H: 'tin3' }));
  defineArt(O.FirePit!, 16, 10, 0, one(FIREPIT, { o: 'stone0', S: 'stone3', d: 'stone2', a: 'black2', w: 'wood2', W: 'wood4', e: 'fire' }));
}

// ===========================================================================
// Flat decals painted into the terrain chunk (no outline beyond the material's own darkest step).

const PEBBLE_L = ['.ooo.', 'o543o', 'o321o', '.ooo.'];
const PEBBLE_S = ['.oo.', 'o43o', '.oo.'];
const SKULL = ['w........w', 'Ww......wW', '.WWwwwwWW.', '..WkWWkW..', '...WWWW...', '...wWWw...', '....ww....'];
const RIBS = ['W.W.W', 'W.W.W', 'w.w.w'];
const LILY = ['.3443.', '34.432', '.2222.'];
const flatCache = new Map<string, Cv>();
function flat(name: string, grid: readonly string[], key: Key): Cv {
  let cv = flatCache.get(name);
  if (!cv) flatCache.set(name, (cv = pixmap(grid, key)));
  return cv;
}
/** Hand-drawn decals for paintFlat: pebbles (grey / warm), bones, lily pads. */
export const DECALS = {
  pebbleL: (warm: boolean) => flat(`pl${warm}`, PEBBLE_L, warm ? ROCK_WARM : ROCK_GREY),
  pebbleS: (warm: boolean) => flat(`ps${warm}`, PEBBLE_S, warm ? ROCK_WARM : ROCK_GREY),
  skull: () => flat('skull', SKULL, { W: 'white3', w: 'white1', k: 'black1' }),
  ribs: () => flat('ribs', RIBS, { W: 'white2', w: 'white0' }),
  lily: () => flat('lily', LILY, { 4: 'leaf5', 3: 'leaf4', 2: 'leaf2' }),
  lilyFlower: () => flat('lilyf', ['.p.', 'pWp'], { p: 'blush', W: 'white3' }),
};
