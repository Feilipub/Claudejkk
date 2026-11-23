/**
 * Pixel art for the DOM interface, drawn as text grids (one character per pixel,
 * like render/pixmap.ts) and turned into crisp SVG data URIs. Everything here is
 * an original drawing: frames for panels and buttons (carved wood with brass
 * corner plates, stitched leather with studs, chunky buttons with a pressed
 * state), a brass medallion for the touch "interact" button, and the icons for
 * HUD bars and touch controls. Used by ui/style.ts; the UI scales them by
 * integer factors (2×, 3×) so every pixel stays square.
 */

type Key = Readonly<Record<string, string>>;

/** SVG markup for a grid; horizontal runs of one colour merge into one rect. */
export function gridSvg(rows: readonly string[], key: Key, scale = 1): string {
  const w = Math.max(...rows.map((r) => r.length));
  let rects = '';
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x]!;
      let n = 1;
      while (row[x + n] === ch) n++;
      const col = key[ch];
      if (ch !== '.' && col) rects += `<rect x='${x}' y='${y}' width='${n}' height='1' fill='${col}'/>`;
      x += n;
    }
  });
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${w * scale}' height='${rows.length * scale}' viewBox='0 0 ${w} ${rows.length}' shape-rendering='crispEdges'>${rects}</svg>`;
}

/** CSS url() for a grid; `scale` sets the intrinsic size (icons use 2× so `auto` sizing is crisp). */
export function gridUrl(rows: readonly string[], key: Key, scale = 1): string {
  return `url("data:image/svg+xml,${encodeURIComponent(gridSvg(rows, key, scale))}")`;
}

const flipH = (g: readonly string[]) => g.map((r) => [...r].reverse().join(''));
const flipV = (g: readonly string[]) => [...g].reverse();

type Side = 'top' | 'left' | 'right' | 'bottom';
/**
 * A 9-slice frame grid: four corners (n×n) around edges of `tile` px. `band`
 * gives the pixel at a depth from the outside and a position along the edge.
 * The centre is transparent so the element's own background shows through.
 */
function frame9(n: number, tile: number, band: (depth: number, along: number, side: Side) => string, corner: readonly string[], mirrorCorners: boolean): string[] {
  const size = n * 2 + tile;
  const g: string[][] = Array.from({ length: size }, () => Array<string>(size).fill('.'));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (y < n && x >= n && x < n + tile) g[y]![x] = band(y, x - n, 'top');
      else if (y >= n + tile && x >= n && x < n + tile) g[y]![x] = band(size - 1 - y, x - n, 'bottom');
      else if (x < n && y >= n && y < n + tile) g[y]![x] = band(x, y - n, 'left');
      else if (x >= n + tile && y >= n && y < n + tile) g[y]![x] = band(size - 1 - x, y - n, 'right');
    }
  }
  const corners: [readonly string[], number, number][] = [
    [corner, 0, 0],
    [mirrorCorners ? flipH(corner) : corner, n + tile, 0],
    [mirrorCorners ? flipV(corner) : corner, 0, n + tile],
    [mirrorCorners ? flipV(flipH(corner)) : corner, n + tile, n + tile],
  ];
  for (const [c, ox, oy] of corners) c.forEach((row, j) => { for (let i = 0; i < row.length; i++) g[oy + j]![ox + i] = row[i]!; });
  return g.map((r) => r.join(''));
}

// --- Palette (shared with the game's wood and brass ramps) --------------------
const INK = '#1c120b';
const WOOD = { K: INK, D: '#2c1a14', d: '#4a2c1e', m: '#6c4228', g: '#5a3620', l: '#8e5c36', L: '#b47e4c' };
const BRASS = { B: '#8e6420', b: '#c4962e', Y: '#ecc858', W: '#fff0a0', w: '#5a3c14' };

// --- Carved wood frame with brass corner plates (dialogs, menus) -------------
// 8 px edge: ink line, lit top of the moulding, plank with grain knots, shadow,
// ink line and a one-pixel parchment shadow where the frame meets the page.
const WOOD_TOP = ['K', 'L', 'l', 'm', 'm', 'd', 'K', 'S'];
const WOOD_LOW = ['K', 'D', 'd', 'm', 'm', 'l', 'K', 'S'];
const BRASS_PLATE = [
  'KKKKKKKK',
  'KYYYYYbK',
  'KYbbbbBK',
  'KYbWYbBK',
  'KYbYwbBK',
  'KYbbbbBK',
  'KbBBBBBK',
  'KKKKKKKK',
];
const woodBand = (depth: number, along: number, side: Side): string => {
  const ramp = side === 'top' || side === 'left' ? WOOD_TOP : WOOD_LOW;
  const c = ramp[depth]!;
  // Grain: two short dark runs per 8 px tile, offset between the plank rows.
  if (c === 'm' && ((depth === 3 && along >= 1 && along <= 3) || (depth === 4 && along >= 5 && along <= 6))) return 'g';
  return c;
};
const WOOD_FRAME = frame9(8, 8, woodBand, BRASS_PLATE, false);
/** Panel frame: 24×24 grid, slice 8. */
export const FRAME_WOOD = gridUrl(WOOD_FRAME, { ...WOOD, ...BRASS, S: '#c8b08a' });

// --- Stitched leather with brass studs (HUD plates) ---------------------------
const LEATHER = { K: INK, D: '#1e140e', d: '#2e2016', m: '#3e2c1e', l: '#5a4230', s: '#c8a46a' };
const STUD = [
  'KKKK',
  'KYbl',
  'KbBm',
  'Klmd',
];
const leatherBand = (depth: number, along: number, side: Side): string => {
  const lit = side === 'top' || side === 'left';
  if (depth === 0) return 'K';
  if (depth === 1) return lit ? 'l' : 'D';
  if (depth === 2) return along % 3 === 1 ? 's' : 'm';
  return 'd';
};
/** HUD frame: 12×12 grid, slice 4. */
export const FRAME_LEATHER = gridUrl(frame9(4, 4, leatherBand, STUD, true), { ...LEATHER, ...BRASS });

// --- Chunky buttons: raised and pressed -------------------------------------
// Slices: top 3, sides 3, bottom 4. The raised button stands on a dark lip; the
// pressed one drops by a pixel, loses the lip and gains an inner top shadow.
const BTN_UP = [
  '.KKKKKKK.',
  'KHHHHHHHK',
  'KHfffffsK',
  'KhfffffsK',
  'KhfffffsK',
  'KhfffffsK',
  'KsssssssK',
  'KLLLLLLLK',
  '.KKKKKKK.',
  '.........',
];
const BTN_DOWN = [
  '.........',
  '.KKKKKKK.',
  'KLLLLLLLK',
  'KsfffffsK',
  'KsfffffsK',
  'KsfffffsK',
  'KsfffffsK',
  'KsfffffsK',
  'KsssssssK',
  '.KKKKKKK.',
];
const BTN_KEYS = {
  wood: { K: INK, H: '#b47e4c', h: '#8e5c36', f: '#6c4228', s: '#4a2c1e', L: '#2c1a14' },
  red: { K: '#2a0c08', H: '#e88060', h: '#c84e36', f: '#a03626', s: '#702218', L: '#3e1210' },
  gold: { K: '#3a2408', H: '#fff0a0', h: '#ecc858', f: '#d4a63a', s: '#9a6e22', L: '#5a3c14' },
  dark: { K: INK, H: '#6a5038', h: '#4e3a28', f: '#3a2a1c', s: '#2a1e14', L: '#160e08' },
};
export type BtnSkin = keyof typeof BTN_KEYS;
/** Raised / pressed button frames per skin (9×10 grids, slice 3 3 4 3, with fill). */
export const BTN = Object.fromEntries(
  (Object.keys(BTN_KEYS) as BtnSkin[]).map((k) => [k, { up: gridUrl(BTN_UP, BTN_KEYS[k]), down: gridUrl(BTN_DOWN, BTN_KEYS[k]) }]),
) as Record<BtnSkin, { up: string; down: string }>;

// --- Brass medallion and joystick (touch) -----------------------------------
/**
 * A round plate rasterised once into stepped pixel rings (no anti-aliasing):
 * ink edge, rim lit on the upper left, face, and a highlight crescent.
 */
function disc(size: number, key: Key, opts: { rim: number; pressed?: boolean; hollow?: boolean }): string {
  const r = size / 2;
  const rows: string[] = [];
  for (let y = 0; y < size; y++) {
    let row = '';
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - r;
      const dy = y + 0.5 - r;
      const d = Math.hypot(dx, dy);
      const lit = dx + dy < 0; // upper-left half
      let c = '.';
      if (d <= r) c = 'K';
      if (d <= r - 1) c = lit ? 'Y' : 'B';
      if (d <= r - 1 - opts.rim) c = opts.hollow ? 'h' : 'b';
      if (d <= r - 2 - opts.rim && !opts.hollow) {
        c = 'f';
        // Highlight crescent on the upper left of the face, shadow on the lower right.
        const far = Math.hypot(dx + r * 0.32, dy + r * 0.32);
        if (!opts.pressed && far < r * 0.40 && far > r * 0.31 && dx < -r * 0.2 && dy < -r * 0.2) c = 'W';
        else if (dx + dy > r * 0.9) c = 's';
      }
      row += c;
    }
    rows.push(row);
  }
  return gridUrl(rows, key);
}
const MEDAL = { K: '#2a1606', B: '#8e6420', Y: '#ecc858', b: '#a87a26', f: '#d4a63a', W: '#fff0a0', s: '#b08428', h: 'rgba(40,26,14,0.45)' };
export const MEDALLION = disc(34, MEDAL, { rim: 2 });
export const MEDALLION_DOWN = disc(34, { ...MEDAL, f: '#b88a2c', s: '#9a7024' }, { rim: 2, pressed: true });
export const STICK_RING = disc(34, { ...MEDAL, Y: '#c4962e', B: '#6a4a18' }, { rim: 1, hollow: true });
export const STICK_KNOB = disc(16, MEDAL, { rim: 1 });

// --- Parchment fibres: a 16 px tile of a few faint, deliberate specks ---------
export const PARCHMENT = gridUrl([
  '................',
  '..aa............',
  '...a.......b....',
  '................',
  '.........aaa....',
  '................',
  '.....b..........',
  '................',
  '..............a.',
  '.aaa..........a.',
  '................',
  '.........b......',
  '................',
  '....a...........',
  '....aa.......bb.',
  '................',
], { a: 'rgba(120,84,40,0.10)', b: 'rgba(255,250,230,0.35)' });

// --- Icons -----------------------------------------------------------------
// Each material is outlined by its own darkest tone (red heart → deep red line,
// brass → dark brass), filled flat with one shadow and one highlight tone.
// Intrinsic size is 2× the grid; the four HUD-bar icons are at most 11 px on
// their long side, so a 22 px box shows them at exactly 2× and an 11 px box at 1×.
const ic = (rows: readonly string[], key: Key) => gridUrl(rows, key, 2);
export const ICON = {
  heart: ic([
    '.RRR...RRR.',
    'RrrrR.RrrrR',
    'RrhhrRrrrrR',
    'RrhrrrrrrsR',
    'RrrrrrrrrsR',
    '.RrrrrrrsR.',
    '..RrrrrsR..',
    '...RrrsR...',
    '....RsR....',
    '.....R.....',
  ], { R: '#5a1014', r: '#d83a36', h: '#ffb0a0', s: '#a02428' }),
  bolt: ic([
    '.....OOOO',
    '....OyyO.',
    '...OyhyO.',
    '..OyhyO..',
    '.OyhyyOOO',
    'OOOOyyysO',
    '...OyysO.',
    '..OyysO..',
    '..OysO...',
    '.OysO....',
    '.OOO.....',
  ], { O: '#5a3c0c', y: '#f0c838', h: '#fff4b0', s: '#c08a20' }),
  bread: ic([
    '...BBBBB...',
    '.BBhhmhhBB.',
    'BhhmhmmhmsB',
    'BhmmmmmmmsB',
    'BmmmmmmmssB',
    'BssssssssB.',
    '.BBBBBBBB..',
  ], { B: '#4a2a10', h: '#f4d090', m: '#d8984a', s: '#a8682a' }),
  shoe: ic([
    '...IIII...',
    '.IIhhhsII.',
    'IhhhhhhssI',
    'IhhIIIIssI',
    'IhI....IsI',
    'InI....InI',
    'IhI....IsI',
    'InI....InI',
    'IhII..IIsI',
    'IhhI..IssI',
    'IIII..IIII',
  ], { I: '#24242c', h: '#c8ccd4', s: '#7a7e8a', n: '#3a3a44' }),
  whistle: ic([
    '..........W.',
    '........W...',
    'KKKKKKK...W.',
    'KYWWWYYK....',
    'KYYYYYYYKKKK',
    'KYYKKYYYYYYK',
    'KYKwwKYYKKKK',
    'KYKwwKYK....',
    '.KYKKYK.....',
    '..KKKK......',
  ], { K: '#5a3c14', Y: '#d8aa40', W: '#fff0a0', w: '#3a2408' }),
  gun: ic([
    'KKKKKKKKKK.....',
    'KMWWWWWWMMKKK..',
    'KKKKKKKMMMMMMK.',
    '.......KCCCMMMK',
    '.......KKKKMMMK',
    '........KK.KGGK',
    '.........K.KGgK',
    '..........KGGgK',
    '..........KKKK.',
  ], { K: '#24242c', M: '#a8acb4', W: '#eef0f2', C: '#6a6e78', G: '#9a6236', g: '#6a3e1e' }),
  jump: ic([
    '.....K.....',
    '....KWK....',
    '...KWWWK...',
    '..KWWWWWK..',
    '.KKKWWWKKK.',
    '...KWWWK...',
    '...KWsWK...',
    '...KKKKK...',
    '...........',
    'KKKKKKKKKKK',
  ], { K: INK, W: '#f0e2c4', s: '#c8b08a' }),
  boot: ic([
    '..KKKKK....',
    '..KhmmK....',
    '..KhYmK....',
    '..KhmmK....',
    '..KhmmK....',
    '..KhmmmK...',
    '.KhmmmmmKK.',
    'KYKmmmmmmmK',
    'YKmmmmmmssK',
    '.KKKKKKKKKK',
  ], { K: '#2a160a', h: '#c88a52', m: '#9a5e30', s: '#6e3c1c', Y: '#ecc858' }),
  horse: ic([
    '...KK.K......',
    '...KBKBK.....',
    '..KBhBBBK....',
    '.KMBBKBBBK...',
    '.KMBBBBWBBK..',
    'KMMBBBBBWBBK.',
    'KMMBBBKKBWBBK',
    'KMMBBK..KBBdK',
    'KMMBK....KKK.',
    'KMMBK........',
    'KMBBK........',
    'KKKKK........',
  ], { K: '#2a1408', B: '#b8703a', h: '#e0a060', W: '#f4e2c0', M: '#3a2010', d: '#7a4220' }),
  brake: ic([
    'KK.....KK',
    '.KWK.KWK.',
    '..KWKWK..',
    '...KWK...',
    'KK..K..KK',
    '.KWK.KWK.',
    '..KWKWK..',
    '...KWK...',
    '....K....',
  ], { K: INK, W: '#f0e2c4' }),
  sight: ic([
    '....KKK....',
    '..KKWWWKK..',
    '.KWK.W.KWK.',
    '.KK..W..KK.',
    'KWWW.R.WWWK',
    '.KK..W..KK.',
    '.KWK.W.KWK.',
    '..KKWWWKK..',
    '....KKK....',
  ], { K: '#4a1208', W: '#fff0d8', R: '#ffd070' }),
  map: ic([
    '.KKKKKKKKK.',
    'KPPPKPPPPKK',
    'KPRPKPPGPPK',
    'KPPRRPPGPPK',
    'KPPPKRPPPPK',
    'KPGPKPRRXPK',
    'KPPPKPPPPsK',
    '.KKKKKKKKK.',
  ], { K: '#4a2a10', P: '#f0dcb0', s: '#c8a870', R: '#b03a28', G: '#5a8a34', X: INK }),
  bag: ic([
    '...KKKKK...',
    '..K.....K..',
    '.KKKKKKKKK.',
    'KhhhhhhhhmK',
    'KWWWWYWWWWK',
    'KmmmmYmmmsK',
    'KmmmmmmmmsK',
    'KmmmmmmmssK',
    '.KKKKKKKKK.',
  ], { K: '#2a160a', h: '#b07a48', m: '#8a5a32', s: '#5e3a1e', W: '#6e4426', Y: '#ecc858' }),
  book: ic([
    'KKKKKKKKKK.',
    'KhRRRRRRRKP',
    'KRYYYYYRRKP',
    'KRRRRRRRRKP',
    'KRRYYYRRRKP',
    'KRRRRRRRsKP',
    'KRRRRRRssKP',
    'KKKKKKKKKKP',
    '.PPPPPPPPPP',
  ], { K: '#2e0c08', h: '#b04a34', R: '#8a2e20', s: '#5e1c12', Y: '#ecc858', P: '#f0dcb0' }),
  tent: ic([
    '.....K.....',
    '....KCK....',
    '...KCWCK...',
    '..KCCKCsK..',
    '.KCCKDKCsK.',
    'KCCCKDKCssK',
    'KKKKKKKKKKK',
  ], { K: '#3a2614', C: '#e8d6aa', W: '#fff6dc', s: '#b8a074', D: '#3a2414' }),
  menu: ic([
    'KKKKKKKKK',
    'KWWWWWWWK',
    'KKKKKKKKK',
    '.........',
    'KKKKKKKKK',
    'KWWWWWWWK',
    'KKKKKKKKK',
    '.........',
    'KKKKKKKKK',
    'KWWWWWWWK',
    'KKKKKKKKK',
  ], { K: INK, W: '#f0e2c4' }),
  hand: ic([
    '...KK.KK...',
    '..KWWKWWKK.',
    '..KWWKWWKWK',
    'KKKWWKWWKWK',
    'KWKWWWWWWWK',
    'KWWWWWWWWsK',
    '.KWWWWWWsK.',
    '..KWWWssK..',
    '...KKKKK...',
  ], { K: '#3a2408', W: '#fae4b0', s: '#d8b070' }),
  lamp: ic([
    '...KKK...',
    '..K...K..',
    '..KKKKK..',
    '.KbYYYbK.',
    '.KbLFLbK.',
    '.KbFWFbK.',
    '.KbLFLbK.',
    '.KbbbbBK.',
    '..KKKKK..',
  ], { K: '#3a2408', b: '#c4962e', Y: '#ecc858', B: '#8e6420', L: '#ffe8a0', F: '#ff9a2a', W: '#fff6d0' }),
  crouch: ic([
    '...KKKK....',
    '.KKHHHHKK..',
    'KHHHHHHHHK.',
    '..KssssK...',
    '..KCCCCCK..',
    '.KCCCCCCCK.',
    '.KCCKKKCCK.',
    'KCCK...KCCK',
    'KKK.....KKK',
  ], { K: INK, H: '#9a6236', s: '#e8b890', C: '#f0e2c4' }),
  reload: ic([
    '.K...K...K.',
    'KgK.KgK.KgK',
    'KgK.KgK.KgK',
    'KbK.KbK.KbK',
    'KYK.KYK.KYK',
    'KbK.KbK.KbK',
    'KbK.KbK.KbK',
    'KBK.KBK.KBK',
    '.K...K...K.',
  ], { K: '#3a2408', g: '#9aa0a8', Y: '#fff0a0', b: '#d4a63a', B: '#8e6420' }),
};
