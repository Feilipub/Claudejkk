/**
 * Building assembler. Each building is put together from the hand-drawn pixel
 * modules in buildingPixel.ts — shingle courses, siding boards, windows, doors,
 * cornices, porch posts, props — chosen and recoloured per building from a
 * stable hash of its id. Produces an exterior sprite (roof, false front, walls,
 * windows, door, sign, porch) and an interior "cutaway" sprite used while the
 * player is inside, so towns are seamless — no loading screens.
 */
import { Rng, hashString } from '../core/rng.ts';
import type { Building } from '../world/world.ts';
import { ctx2d, makeCanvas, type Ctx } from './pixel.ts';
import * as P from './buildingPixel.ts';
import type { Cv, Ramp, Trim } from './buildingPixel.ts';

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

// ---------------------------------------------------------------------------
// Building-type groups.
// ---------------------------------------------------------------------------
const COMMERCIAL = new Set<Building['type']>(['saloon', 'store', 'sheriff', 'doctor', 'hotel', 'bank', 'gunsmith', 'tailor', 'newspaper', 'assay', 'telegraph', 'tradingpost', 'station']);
const TIN_ROOF = new Set<Building['type']>(['saloon', 'store', 'bank', 'hotel', 'gunsmith', 'tailor', 'newspaper', 'assay', 'station', 'warehouse', 'sawmill', 'doctor', 'sheriff', 'telegraph']);
const CHIMNEY = new Set<Building['type']>(['house', 'ranchhouse', 'cabin', 'saloon', 'hotel', 'blacksmith', 'cookhouse', 'bunkhouse', 'barracks', 'officers', 'shack', 'lodgehouse']);
const HOMELY = new Set<Building['type']>(['house', 'ranchhouse', 'cabin', 'bunkhouse', 'officers', 'lodgehouse', 'cookhouse', 'barracks']);

type WallKind = 'clap' | 'batten' | 'brick' | 'log' | 'adobe';

/** Per-building look, rolled once from the building's id so it is stable. */
interface Style {
  wallKind: WallKind;
  wall: Ramp;
  trim: Trim;
  roof: Ramp;
  door: Ramp;
  curtain: readonly [string, string] | null;
  shutter: Ramp | null;
  boxes: boolean;
  flowers: readonly [string, string];
  board: Ramp;
  gold: boolean;
  awning: readonly [string, string];
}

const LIGHT_PAINT = new Set<string>(['cream', 'white', 'ochre']);
const CURTAINS: (readonly [string, string])[] = [['barn2', 'barn3'], ['cream2', 'cream3'], ['blue2', 'blue3'], ['gold2', 'gold3'], ['teal2', 'teal3'], ['#a85068', 'rose']];
const FLOWER_PAIRS: (readonly [string, string])[] = [['rose', 'sun'], ['poppy', 'snowflower'], ['lupine', 'rose'], ['sunL', 'poppy'], ['snowflower', 'lupineL'], ['blush', 'sun']];

function rollStyle(b: Building, r: Rng): Style {
  const barnish = b.type === 'barn' || b.type === 'stable';
  let wallKind: WallKind = 'clap';
  let paint: P.RampName = 'cream';
  if (b.wall === 'plank') {
    if (barnish) {
      wallKind = 'batten';
      paint = r.chance(0.8) ? 'barn' : 'wood';
    } else if (['shack', 'sawmill', 'warehouse', 'blacksmith'].includes(b.type) || r.chance(0.15)) {
      wallKind = 'batten';
      paint = r.pick(['wood', 'gwood', 'wood'] as const);
    } else paint = r.pick(['cream', 'white', 'blue', 'teal', 'sage', 'ochre', 'barn', 'wood', 'cream', 'blue'] as const);
  } else if (b.wall === 'whitewash') paint = 'white';
  else if (b.wall === 'brick') {
    wallKind = 'brick';
    paint = 'brick';
  } else if (b.wall === 'log') {
    wallKind = 'log';
    paint = 'log';
  } else {
    wallKind = 'adobe';
    paint = 'adobe';
  }
  let trimName: P.TrimName;
  if (wallKind === 'brick') trimName = r.pick(['stone', 'cream'] as const);
  else if (wallKind === 'log' || wallKind === 'adobe') trimName = r.pick(['cream', 'green', 'brown', 'cream'] as const);
  else if (barnish) trimName = 'cream';
  else if (LIGHT_PAINT.has(paint)) trimName = r.pick(['brown', 'green', 'red', 'blue', 'brown'] as const);
  else trimName = r.pick(['cream', 'white', 'cream'] as const);
  let roofName: P.RampName;
  if (barnish) roofName = r.chance(0.6) ? 'shakeRed' : 'shakeBrown';
  else if (b.wall === 'adobe') roofName = 'adobe';
  else roofName = r.pick(['shakeRed', 'shakeBrown', 'shakeBrown', 'shakeRed', 'shakeGrey'] as const);
  return {
    wallKind,
    wall: P.RAMP[paint],
    trim: P.TRIM[trimName],
    roof: P.RAMP[roofName],
    door: P.RAMP[r.pick(['darkwood', 'teal', 'barn', 'blue', 'sage', 'darkwood'] as const)],
    curtain: !b.ruined && r.chance(0.7) ? r.pick(CURTAINS) : null,
    shutter: r.chance(HOMELY.has(b.type) ? 0.55 : 0.2) ? P.RAMP[r.pick(['teal', 'barn', 'blue', 'darkwood', 'sage'] as const)] : null,
    boxes: !b.ruined && (HOMELY.has(b.type) ? r.chance(0.7) : r.chance(0.25)),
    flowers: r.pick(FLOWER_PAIRS),
    board: b.type === 'bank' ? P.RAMP.stone : P.RAMP[r.pick(['teal', 'barn', 'blue', 'darkwood', 'sage'] as const)],
    gold: b.type === 'bank' || r.chance(0.5),
    awning: r.pick([['barn2', 'barn3'], ['teal1', 'teal2'], ['blue1', 'blue2'], ['gold1', 'gold2']] as const),
  };
}

/** The siding module for a style. */
function wallTile(st: Style): Cv {
  switch (st.wallKind) {
    case 'clap': return P.clapboard(st.wall);
    case 'batten': return P.battens(st.wall);
    case 'brick': return P.brick(st.wall);
    case 'log': return P.logs(st.wall);
    case 'adobe': return P.adobeWall(st.wall);
  }
}

/** Translucent flat shadow rows (cast by eaves, porch roofs, sills). */
function shadowRows(c: Ctx, x: number, y: number, w: number, alphas: readonly number[]): void {
  alphas.forEach((a, k) => {
    c.fillStyle = `rgba(28,18,40,${a})`;
    c.fillRect(x, y + k, w, 1);
  });
}

// ---------------------------------------------------------------------------
// Roofs, assembled from shingle / tin / plaster modules.
// ---------------------------------------------------------------------------
interface RoofOut {
  ridge: number;
}

/** Gable roof seen from above: lit back slope, ridge cap, shaded front slope, eave fascia. */
function gableRoof(c: Ctx, y: number, w: number, h: number, ramp: Ramp, tin: boolean, rust: number, r: Rng, ridgeFrac: number, cap: boolean): RoofOut {
  const ridge = y + Math.floor(h * ridgeFrac);
  const capH = cap ? 5 : 0;
  if (tin) {
    const back = P.tinSheet(0, false);
    const front = P.tinSheet(1, false);
    P.tileRect(c, back, 0, y, w, ridge - y, 0, ridge);
    P.tileRect(c, front, 0, ridge + capH, w, y + h - ridge - capH, 0, ridge + capH);
    // Swap whole sheets for rusty or rusted-through ones (modules, not noise).
    for (const [y0, y1, slope] of [[y, ridge, 0], [ridge + capH, y + h, 1]] as const) {
      const anchor = slope ? ridge + capH : ridge;
      for (let sy = anchor - Math.ceil((anchor - y0) / 19) * 19; sy < y1; sy += 19)
        for (let sx = 0; sx < w; sx += 16) {
          const roll = r.next();
          if (roll > rust * 0.35) continue;
          const tile = roll < rust * 0.06 ? P.tinRusted(slope) : P.tinSheet(slope, true);
          const top = Math.max(y0, sy);
          c.save();
          c.beginPath();
          c.rect(sx, top, 16, Math.min(sy + 19, y1) - top);
          c.clip();
          P.put(c, tile, sx, sy);
          c.restore();
        }
    }
    if (cap) P.band(c, P.piece('tinridge', P.TIN_RIDGE, P.rampKey(P.RAMP.tin)), 0, ridge, w);
  } else {
    P.tileRect(c, P.shakes(ramp, 0), 0, y, w, ridge - y, 0, ridge);
    P.tileRect(c, P.shakes(ramp, 1), 0, ridge + capH, w, y + h - ridge - capH, 0, ridge + capH);
    // A few repaired runs and mossy patches, swapped in whole 16×8 cells.
    for (let sy = ridge - 8; sy >= y; sy -= 8) for (let sx = 0; sx < w; sx += 16) if (r.chance(0.07)) P.put(c, P.shakes(ramp, 0, 'patch'), sx, sy);
    for (let sy = ridge + capH; sy + 8 <= y + h - 2; sy += 8)
      for (let sx = 0; sx < w; sx += 16) {
        const k = r.next();
        if (k < 0.07) P.put(c, P.shakes(ramp, 1, 'moss'), sx, sy);
        else if (k < 0.12) P.put(c, P.shakes(ramp, 1, 'patch'), sx, sy);
      }
    if (cap) P.band(c, P.ridge(ramp), 0, ridge, w);
  }
  // Verges: the roof edge at each gable end.
  P.fill(c, 0, y, 1, h, ramp[0]);
  P.fill(c, w - 1, y, 1, h, ramp[0]);
  P.fill(c, 1, y, 1, h, tin ? 'tin3' : ramp[3]);
  return { ridge };
}

/** Gable-front barn roof: ridge runs front-to-back, courses vertical, a gambrel break each side. */
function barnRoof(c: Ctx, y: number, w: number, h: number, ramp: Ramp): void {
  const mid = Math.floor(w / 2);
  P.tileRect(c, P.shakesVertical(ramp, 0), 0, y, mid, h, mid - 16 * Math.ceil(mid / 16), y);
  P.tileRect(c, P.shakesVertical(ramp, 1), mid, y, w - mid, h, mid, y);
  // Gambrel breaks: the steeper lower slopes sit a step darker past the knuckle.
  const knuckle = Math.floor(mid * 0.62);
  for (const [x0, x1] of [[0, mid - knuckle], [mid + knuckle, w]] as const) {
    c.fillStyle = 'rgba(28,18,40,0.22)';
    c.fillRect(x0, y, x1 - x0, h);
  }
  P.fill(c, mid - knuckle, y, 1, h, ramp[0]);
  P.fill(c, mid + knuckle, y, 1, h, ramp[0]);
  P.fill(c, mid - knuckle + 1, y, 1, h, ramp[3]);
  // Ridge cap.
  P.fill(c, mid - 2, y, 1, h, ramp[0]);
  P.fill(c, mid - 1, y, 2, h, ramp[4]);
  P.fill(c, mid + 1, y, 1, h, ramp[2]);
  P.fill(c, mid + 2, y, 1, h, ramp[0]);
  P.fill(c, 0, y, 1, h, ramp[0]);
  P.fill(c, w - 1, y, 1, h, ramp[0]);
  P.fill(c, 0, y, w, 1, ramp[0]);
}

/** Flat adobe roof behind a parapet, with canales (drain spouts) through the front. */
function adobeRoof(c: Ctx, y: number, w: number, h: number, ramp: Ramp): void {
  P.tileRect(c, P.adobeRoof(ramp), 0, y, w, h, 0, y);
  // Parapet rim: lit cap all round, inner shadow under the back and left walls.
  P.fill(c, 0, y, w, 3, ramp[3]);
  P.fill(c, 0, y, w, 1, ramp[4]);
  P.fill(c, 0, y, 3, h, ramp[3]);
  P.fill(c, w - 3, y, 3, h, ramp[2]);
  P.fill(c, 3, y + 3, w - 6, 1, ramp[1]);
  P.fill(c, 3, y + 3, 1, h - 3, ramp[1]);
  P.fill(c, 0, y, 1, h, ramp[0]);
  P.fill(c, w - 1, y, 1, h, ramp[0]);
  P.fill(c, 0, y + h - 3, w, 3, ramp[3]);
  P.fill(c, 0, y + h - 3, w, 1, ramp[4]);
}

/** Holes punched through a ruined roof (dark loft, exposed rafters). */
function roofHoles(c: Ctx, y: number, w: number, h: number, ramp: Ramp, r: Rng): void {
  for (let i = 0; i < Math.max(2, Math.floor(w / 40)); i++) P.put(c, P.roofHole(ramp), r.int(4, Math.max(5, w - 16)), y + r.int(4, Math.max(5, h - 12)));
}

/** Big weathered lettering painted across a barn roof slope: every 5th pixel flaked off on a fixed lattice. */
function roofLettering(c: Ctx, text: string, cx: number, y: number, maxW: number): void {
  const s = 2;
  if (signTextWidth(text, false) * s > maxW) return;
  const w = (signTextWidth(text, false) + 1) * s;
  const t = makeCanvas(w, SIGN_H * s);
  const tc = ctx2d(t);
  signText(tc, text, 0, 0, P.hex('cream3'), false, s);
  tc.globalCompositeOperation = 'destination-out';
  for (let py = 0; py < SIGN_H * s; py++) for (let px = (py * 3) % 5; px < w; px += 5) tc.fillRect(px, py, 1, 1);
  c.globalAlpha = 0.8;
  c.drawImage(t as CanvasImageSource, Math.round(cx - w / 2), y);
  c.globalAlpha = 1;
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
      c.fillStyle = typeof ink === 'string' ? ink : ink[Math.min(ink.length - 1, Math.floor((row * ink.length) / SIGN_H))];
      for (let k = 0; k < g[row].length; k++) {
        if (g[row][k] !== '#') continue;
        c.fillRect(cx + k * s, y + row * s, (bold ? 2 : 1) * s, s);
      }
    }
    cx += (g[0].length + (bold ? 1 : 0) + 1) * s;
  }
}

const GILT = ['brass4', 'brass3', 'brass3', 'brass3', 'brass2', 'brass2', 'brass1'].map(P.hex);
const CREAM_INK = ['cream4', 'cream4', 'cream4', 'cream3', 'cream3', 'cream3', 'cream2'].map(P.hex);

/**
 * Painted sign board: ink-dark edge, trim frame, a two-plank board with a lit
 * top edge, brass nail heads in the corners, letters with a drop shadow. Returns its rect.
 */
function signBoard(c: Ctx, text: string, cx: number, y: number, maxW: number, st: Style, ruined: boolean): { x: number; y: number; w: number; h: number } {
  let label = text;
  const bold = signTextWidth(label, true) + 12 <= maxW;
  if (!bold) while (label.length > 1 && signTextWidth(label, false) + 8 > maxW) label = label.slice(0, -1).trimEnd();
  const tw = signTextWidth(label, bold);
  const w = tw + (bold ? 12 : 8);
  const h = SIGN_H + 6;
  const x = Math.round(cx - w / 2);
  const bd = st.board;
  P.fill(c, x - 1, y - 1, w + 2, h + 2, bd[0]);
  P.fill(c, x, y, w, h, st.trim[2]);
  P.fill(c, x, y + h - 1, w, 1, st.trim[0]);
  P.fill(c, x + w - 1, y, 1, h, st.trim[0]);
  P.fill(c, x + 1, y + 1, w - 2, h - 2, bd[1]);
  P.fill(c, x + 1, y + 1, w - 2, 1, bd[2]);
  P.fill(c, x + 1, y + Math.floor(h / 2), w - 2, 1, bd[0]);
  for (const [nx, ny] of [[x + 1, y + 1], [x + w - 2, y + 1], [x + 1, y + h - 2], [x + w - 2, y + h - 2]]) P.fill(c, nx, ny, 1, 1, ruined ? 'rust1' : 'brass2');
  const tx = x + Math.floor((w - tw) / 2);
  const ty = y + 3;
  signText(c, label, tx + 1, ty + 1, P.hex(bd[0]), bold);
  const ink = ruined ? P.hex(st.gold ? 'brass1' : 'cream1') : st.gold ? GILT : CREAM_INK;
  signText(c, label, tx, ty, ink, bold);
  if (ruined) for (let k = 0; k < tw; k += 4) P.fill(c, tx + k, ty + ((k * 3) % SIGN_H), 2, 1, bd[1]); // flaked paint
  shadowRows(c, x, y + h + 1, w, [0.35]);
  return { x, y, w, h };
}

/** Hanging lantern; its glass becomes a lit "window" after dusk. */
function lantern(c: Ctx, x: number, y: number, windows: BuildingSprite['windows']): void {
  P.fill(c, x + 1, y - 2, 1, 2, 'ink');
  P.put(c, P.prop(P.LANTERN, P.RAMP.darkwood, { ...P.PROP_KEY.lantern, o: 'ink' }), x, y);
  windows.push({ x: x + 1, y: y + 2, w: 1, h: 2 });
}

/** Window module with its glass rect registered for night lighting. Returns the module's left x. */
function placeWindow(c: Ctx, def: P.WinDef, gx: number, gy: number, st: Style, curtain: readonly [string, string] | null, windows: BuildingSprite['windows'] | null): void {
  const curtained = curtain && (def === P.WIN_HOUSE ? P.WIN_HOUSE_CURTAIN : def === P.WIN_UPPER ? P.WIN_UPPER_CURTAIN : null);
  const d = curtained || def;
  const x = gx - def.gx;
  const y = gy - def.gy;
  P.put(c, P.windowPiece(d, st.trim, curtain ?? undefined), x, y);
  const sillShadow = d.rows.findIndex((r) => r.includes('S'));
  if (sillShadow >= 0) shadowRows(c, x, y + sillShadow, d.rows[0].length, [0.35]);
  if (windows) windows.push({ x: gx, y: gy, w: def.gw, h: def.gh });
}

// --- Porch props (standing on the ground line gy) ---------------------------
function propAt(c: Ctx, rows: readonly string[], ramp: Ramp, x: number, gy: number, extra: Record<string, string> = {}): number {
  const p = P.prop(rows, ramp, extra);
  P.put(c, p, x, gy - p.height);
  return p.width;
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
  const homely = HOMELY.has(b.type);
  const wallT = wallTile(st);
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
  const doorX = (b.doorX - b.x) * 16 + 3;
  const doorC = doorX + 5;
  const falseFront = commercial && !adobe && b.wall !== 'log' && (b.facade > 0 || !!b.sign);
  const ff = falseFront ? Math.max(b.sign ? 18 : 12, b.facade + 8) : 0;
  const siding = (x: number, y: number, w: number, h: number) => P.tileRect(c, wallT, x, y, w, h, 0, wallTop);

  // --- Roof ---------------------------------------------------------------
  const tin = TIN_ROOF.has(b.type) && b.wall !== 'log' && !adobe;
  const roofY = top - 4;
  const roofH = wallTop - roofY;
  let ridgeAbs = roofY + Math.floor(roofH * 0.42);
  const rustiness = b.ruined ? 1 : ['sawmill', 'warehouse', 'assay', 'tradingpost'].includes(b.type) ? r.range(0.5, 0.9) : r.range(0.1, 0.5);
  if (barnish && !adobe) barnRoof(c, roofY, bw, roofH, st.roof);
  else if (adobe) adobeRoof(c, roofY, bw, roofH, st.roof);
  else {
    // Deep buildings grew a rear lean-to: lower, a different material, stepped down behind the main roof.
    let mainY = roofY;
    let mainH = roofH;
    if (!b.ruined && roofH >= 84 && r.chance(0.8)) {
      const L = Math.floor(roofH * r.range(0.26, 0.34));
      const leanTin = tin ? r.chance(0.5) : r.chance(0.3);
      gableRoof(c, roofY, bw, L, st.roof, leanTin, Math.min(1, rustiness + 0.25), r, 1, false);
      mainY = roofY + L;
      mainH = roofH - L;
      shadowRows(c, 0, mainY - 4, bw, [0.08, 0.16, 0.26, 0.36]);
    }
    ridgeAbs = gableRoof(c, mainY, bw, mainH, st.roof, tin, rustiness, r, 0.42, true).ridge;
    if (mainY !== roofY) {
      P.fill(c, 0, mainY, bw, 1, 'ink');
      P.fill(c, 0, mainY + 1, bw, 1, tin ? 'tin4' : st.roof[4]);
    }
  }
  if (b.ruined && !adobe) roofHoles(c, roofY, bw, roofH, st.roof, r);
  if (barnish && !b.ruined) {
    const word = (b.sign ?? b.name.split(/\s+/)[0] ?? '').toUpperCase();
    const half = Math.floor(bw / 2);
    const letterY = top + 2;
    if (word && wallTop - 36 - letterY > 10) roofLettering(c, word, Math.floor(half / 2) + 1, letterY, half - 12);
  }
  // Chimney / stovepipe.
  if (!b.ruined && CHIMNEY.has(b.type)) {
    const cx = r.int(8, Math.max(9, bw - 16));
    const cy = top + Math.floor((wallTop - top) * 0.25);
    const kind = b.type === 'shack' || (b.wall === 'log' && r.chance(0.4)) ? 'pipe' : b.wall === 'log' ? 'stone' : 'brick';
    const ch = P.chimneyPiece(kind);
    const chY = cy + 4 - ch.height;
    shadowRows(c, cx + 2, cy + 4, ch.width, [0.35, 0.25, 0.12]); // shadow falls down-right on the shingles
    P.put(c, ch, cx, chY);
    chimney = { x: cx + Math.floor(ch.width / 2), y: chY };
  }
  // Roof vents on big tin roofs that have no chimney.
  if (tin && !chimney && !b.ruined && bw >= 96) {
    for (let k = 0; k < (bw >= 160 ? 2 : 1); k++) {
      const vx = Math.floor(bw * (bw >= 160 ? (k ? 0.72 : 0.28) : 0.5)) + r.int(-6, 6);
      const v = P.chimneyPiece('vent');
      shadowRows(c, vx + 2, ridgeAbs + 4, v.width, [0.35, 0.2]);
      P.put(c, v, vx, ridgeAbs + 4 - v.height);
    }
  }

  // --- Front wall -----------------------------------------------------------
  siding(0, wallTop, bw, wallH);
  if (st.wallKind === 'log') {
    const end = P.logEnd(st.wall);
    P.tileRect(c, end, 0, wallTop, 4, wallH, 0, wallTop);
    P.tileRect(c, end, bw - 4, wallTop, 4, wallH, bw - 4, wallTop);
  } else if (st.wallKind !== 'adobe') {
    // Corner boards.
    P.fill(c, 0, wallTop, 1, wallH, st.trim[2]);
    P.fill(c, 1, wallTop, 1, wallH, st.trim[1]);
    P.fill(c, bw - 2, wallTop, 1, wallH, st.trim[1]);
    P.fill(c, bw - 1, wallTop, 1, wallH, st.trim[0]);
  }
  // Eave: dark fascia line and the strong shadow the overhang throws on the wall.
  if (!falseFront) {
    P.fill(c, 0, wallTop, bw, 1, adobe ? st.roof[1] : st.roof[0]);
    shadowRows(c, 0, wallTop + 1, bw, adobe ? [0.3, 0.15] : [0.55, 0.38, 0.2]);
  }

  // --- False front / gable / tower / parapet -----------------------------
  let signY = -1;
  if (falseFront) {
    const fy = wallTop - ff;
    siding(0, fy, bw, ff);
    P.fill(c, 0, fy, 1, ff, st.trim[2]);
    P.fill(c, 1, fy, 1, ff, st.trim[1]);
    P.fill(c, bw - 2, fy, 1, ff, st.trim[1]);
    P.fill(c, bw - 1, fy, 1, ff, st.trim[0]);
    // Crown: flat cornice, stepped, pediment or double-stepped.
    const crown = st.wallKind === 'brick' ? 0 : r.int(0, 3);
    const corn = P.cornice(st.trim);
    const capRow = (x: number, y: number, w: number) => {
      P.fill(c, x, y, w, 1, st.trim[2]);
      P.fill(c, x, y + 1, w, 1, st.trim[1]);
      P.fill(c, x, y + 2, w, 1, st.trim[0]);
    };
    if (crown === 1 || crown === 3) {
      const cw = Math.floor((bw * (crown === 1 ? 0.5 : 0.7)) / 2) * 2;
      const cx0 = Math.floor((bw - cw) / 2);
      siding(cx0, fy - 6, cw, 6);
      capRow(cx0 - 1, fy - 7, cw + 2);
      if (crown === 3) {
        const cw2 = Math.floor((bw * 0.3) / 2) * 2;
        const cx1 = Math.floor((bw - cw2) / 2);
        siding(cx1, fy - 11, cw2, 5);
        capRow(cx1 - 1, fy - 12, cw2 + 2);
      }
    } else if (crown === 2) {
      // Pediment: stepped 2-px runs either side, cap moulding along the rake.
      const pw = Math.min(40, Math.floor(bw * 0.4)) & ~1;
      const steps = 7;
      for (let k = 0; k <= steps; k++) {
        const hw = Math.round((pw / 2) * (1 - k / (steps + 1)));
        siding(Math.floor(bw / 2) - hw, fy - k, hw * 2, 1);
        P.fill(c, Math.floor(bw / 2) - hw - 1, fy - k - 1, 3, 1, st.trim[2]);
        P.fill(c, Math.floor(bw / 2) + hw - 2, fy - k - 1, 3, 1, st.trim[1]);
        P.fill(c, Math.floor(bw / 2) - hw - 1, fy - k, 1, 1, st.trim[0]);
      }
    }
    P.band(c, corn, 0, fy - 2, bw);
    P.put(c, P.bracket(st.trim, false), 0, fy + 3);
    P.put(c, P.bracket(st.trim, true), bw - 4, fy + 3);
    // Sill line where the false front meets the storey below.
    P.fill(c, 0, wallTop - 1, bw, 1, st.trim[0]);
    P.fill(c, 0, wallTop, bw, 1, st.trim[2]);
    signY = fy + Math.max(5, Math.floor((ff - 14) / 2) + 3);
  }
  if (barnish && !adobe) {
    // Gambrel gable end facing the street, with hay loft.
    const gh = Math.max(20, Math.min(36, Math.floor(bw * 0.2)));
    const xl = (d: number) => (d <= gh * 0.62 ? Math.round((bw * 0.14 * d) / (gh * 0.62)) : Math.round(bw * 0.14 + ((bw / 2 - bw * 0.14) * (d - gh * 0.62)) / (gh * 0.38)));
    for (let d = 0; d <= gh + 2; d++) {
      const l = Math.max(0, xl(Math.min(d, gh)) - 2);
      P.fill(c, l, wallTop - d, bw - 2 * l, 1, st.roof[0]); // verge overhang
    }
    for (let d = 0; d <= gh; d++) {
      const l = xl(d);
      const y = wallTop - d;
      if (bw - 2 * l <= 0) continue;
      siding(l, y, bw - 2 * l, 1);
      const nl = d < gh ? xl(d + 1) : l + 1;
      P.fill(c, l, y, Math.max(1, nl - l), 1, 'cream3');
      P.fill(c, bw - nl, y, Math.max(1, nl - l), 1, 'cream3');
    }
    P.fill(c, 0, wallTop, bw, 1, 'cream3');
    shadowRows(c, 0, wallTop + 1, bw, [0.45, 0.25]);
    const signH = b.sign ? 14 : 0;
    const loftTop = wallTop - gh + 7;
    const loftBot = wallTop - (b.sign ? signH + 3 : 4);
    if (loftBot - loftTop >= 7) {
      const lw = 14;
      const lx = Math.floor(bw / 2 - lw / 2);
      const lh = loftBot - loftTop;
      P.fill(c, lx - 1, loftTop - 1, lw + 2, lh + 2, 'cream3');
      P.fill(c, lx + lw, loftTop, 1, lh + 1, 'cream1');
      P.fill(c, lx, loftTop, lw, lh, 'ink');
      const hayH = Math.floor(lh * 0.55);
      // Hay: three tufted tones, tufts in a fixed rhythm along the top.
      P.fill(c, lx, loftBot - hayH, lw, hayH, 'dry3');
      P.fill(c, lx, loftBot - 2, lw, 2, 'dry2');
      for (let k = 0; k < lw; k += 3) P.fill(c, lx + k, loftBot - hayH - 1, 2, 1, 'dry4');
      for (let k = 1; k < lw; k += 4) P.fill(c, lx + k, loftBot - hayH + 2, 1, 2, 'dry2');
      P.fill(c, lx + 1, loftBot, 3, 1, 'dry4');
      // Hay hood and pulley beam.
      P.fill(c, Math.floor(bw / 2) - 1, wallTop - gh + 1, 2, 5, 'wood0');
      P.fill(c, Math.floor(bw / 2), wallTop - gh + 6, 1, lh - hayH, 'cream1');
    }
    if (b.sign) signY = wallTop - signH - 1;
  }
  if (church && b.facade > 0 && !adobe) {
    const fy = wallTop - 6;
    siding(0, fy, bw, 7);
    P.fill(c, 0, fy, bw, 1, st.trim[2]);
    // Steeple with louvred belfry and cross.
    const tx = Math.floor(bw / 2) - 7;
    siding(tx, fy - 18, 14, 20);
    P.fill(c, tx - 1, fy - 18, 1, 20, st.trim[2]);
    P.fill(c, tx + 14, fy - 18, 1, 20, st.trim[0]);
    for (let k = 0; k < 6; k++) {
      P.fill(c, tx - 1 + k, fy - 19 - k, 16 - k * 2, 1, st.roof[k < 2 ? 1 : 2]);
      P.fill(c, tx - 1 + k, fy - 19 - k, 1, 1, st.roof[0]);
      P.fill(c, tx + 14 - k, fy - 19 - k, 1, 1, st.roof[0]);
    }
    P.fill(c, tx + 4, fy - 13, 6, 7, 'ink');
    for (let k = 1; k < 7; k += 2) P.fill(c, tx + 4, fy - 13 + k, 6, 1, 'gwood1');
    P.fill(c, tx + 6, fy - 10, 2, 3, 'brass2');
    P.fill(c, tx + 6, fy - 32, 2, 8, 'wood0');
    P.fill(c, tx + 4, fy - 29, 6, 2, 'wood0');
    P.fill(c, tx + 6, fy - 32, 1, 8, 'wood2');
    // Round window over the door.
    placeWindow(c, P.WIN_ATTIC, doorC - 2, wallTop + 3, st, null, windows);
  }
  if (adobe) {
    // Vigas: roof-beam ends poking through the wall, each with its shadow.
    for (let px = 6; px < bw - 4; px += 10) {
      P.fill(c, px, wallTop + 2, 3, 2, 'wood1');
      P.fill(c, px, wallTop + 2, 3, 1, 'wood3');
      shadowRows(c, px, wallTop + 4, 3, [0.4]);
    }
    if (b.facade > 0) {
      const fy = wallTop - b.facade;
      const pw = 30;
      const px0 = Math.floor(bw / 2) - pw / 2;
      siding(px0, fy, pw, b.facade + 2);
      // Curved espadaña top.
      for (let k = 0; k < 4; k++) P.fill(c, px0 + k * 3, fy - k, pw - k * 6, 1, k === 3 ? st.wall[4] : st.wall[3]);
      P.fill(c, Math.floor(bw / 2) - 4, fy + 4, 8, 8, 'ink');
      P.fill(c, Math.floor(bw / 2) - 3, fy + 3, 6, 1, 'ink');
      if (!b.ruined) P.fill(c, Math.floor(bw / 2) - 1, fy + 7, 2, 3, 'brass2');
    }
  }

  // Front cross-gable over the door on homesteads: breaks the long eave line.
  if (homely && !b.ruined && !adobe && bw >= 80 && b.type !== 'barracks' && r.chance(b.type === 'house' || b.type === 'ranchhouse' ? 0.75 : 0.4)) {
    const gw = Math.min(56, Math.max(36, Math.floor(bw * 0.42))) & ~1;
    const gh = Math.floor(gw * 0.36);
    const gx = Math.max(2, Math.min(bw - gw - 2, doorC - gw / 2));
    for (let d = 0; d <= gh + 2; d++) {
      const hw = Math.round((gw / 2 + 2) * (1 - d / (gh + 2)));
      if (hw > 0) P.fill(c, gx + gw / 2 - hw, wallTop - d + 1, hw * 2, 1, d < 2 ? st.roof[0] : st.roof[1]);
      if (hw > 0) P.fill(c, gx + gw / 2 - hw, wallTop - d + 1, 2, 1, st.roof[0]);
      if (hw > 0) P.fill(c, gx + gw / 2 + hw - 2, wallTop - d + 1, 2, 1, st.roof[0]);
    }
    for (let d = 0; d < gh; d++) {
      const hw = Math.round((gw / 2) * (1 - d / gh));
      if (hw <= 0) continue;
      siding(gx + gw / 2 - hw, wallTop - d, hw * 2, 1);
      P.fill(c, gx + gw / 2 - hw, wallTop - d, 1, 1, st.trim[2]);
      P.fill(c, gx + gw / 2 + hw - 1, wallTop - d, 1, 1, st.trim[0]);
    }
    placeWindow(c, P.WIN_ATTIC, gx + gw / 2 - 2, wallTop - Math.floor(gh / 2) - 3, st, null, windows);
    P.fill(c, gx, wallTop, gw, 1, st.trim[1]);
  }

  // --- Windows --------------------------------------------------------------
  const ruinedWin = (gx: number, gy2: number) => P.put(c, P.windowPiece({ rows: P.WIN_BOARDED, gx: 2, gy: 1, gw: 7, gh: 9 }, st.trim), gx - 2, gy2 - 1);
  const winHouse = (gx: number, gy2: number, opts: { shutter: boolean; box: boolean }) => {
    if (b.ruined) return ruinedWin(gx, gy2);
    if (opts.shutter && st.shutter) {
      const sh = P.shutter(st.shutter);
      P.put(c, sh, gx - 5, gy2 - 1);
      P.put(c, sh, gx + 8, gy2 - 1);
    }
    placeWindow(c, P.WIN_HOUSE, gx, gy2, st, st.curtain, windows);
    if (opts.box) P.put(c, P.flowerBox(st.flowers[0], st.flowers[1]), gx - 2, gy2 + 8);
  };
  const doorClear = (x0: number, x1: number, pad: number) => x1 > doorX - pad && x0 < doorX + 10 + pad;
  if (commercial && !adobe) {
    // Ground floor: big display windows; upper storey: a regular row.
    const big = ['store', 'saloon', 'tailor', 'gunsmith', 'newspaper', 'tradingpost'].includes(b.type);
    const def = b.type === 'saloon' ? P.WIN_SHOP_CAFE : ['store', 'tradingpost', 'gunsmith'].includes(b.type) ? P.WIN_SHOP_GOODS : P.WIN_SHOP;
    const step = big ? 22 : r.pick([16, 18]);
    const ww = big ? 11 : 7;
    const wy = gy - 17;
    for (let px = 6; px + ww < bw - 5; px += step) {
      if (doorClear(px - 4, px + ww + 4, 2)) continue;
      if (big) {
        if (b.ruined) {
          ruinedWin(px + 2, wy);
          continue;
        }
        placeWindow(c, def, px, wy, st, def === P.WIN_SHOP_CAFE ? st.curtain ?? ['barn2', 'barn3'] : null, windows);
        P.put(c, P.piece('kick', P.KICK, { ...P.rampKey(st.door), ...P.trimKey(st.trim) }), px - 1, wy + 11);
      } else winHouse(px, wy, { shutter: false, box: st.boxes && !b.ruined });
    }
    const upper = wallTop + 3;
    if (gy - 25 - upper >= 8) {
      const ustep = r.pick([16, 18, 20]);
      for (let px = 7; px + 6 < bw - 5; px += ustep) {
        if (b.ruined) continue;
        placeWindow(c, P.WIN_UPPER, px, upper, st, st.curtain, windows);
      }
    }
  } else if (!barnish && !church) {
    const step = r.pick([16, 18, 20]);
    const wy = wallTop + 9;
    const pad = st.shutter ? 6 : 3;
    for (let px = 8; px + 7 < bw - 6; px += step) {
      if (doorClear(px - pad, px + 7 + pad, 3)) continue;
      if (px - pad < 2 || px + 7 + pad > bw - 2) continue;
      winHouse(px, wy, { shutter: true, box: st.boxes });
    }
  } else if (barnish) {
    for (let px = 8; px + 6 < bw - 6; px += 18) {
      if (doorClear(px - 10, px + 14, 0)) continue;
      // Barn and stable windows stay dark at night: nobody keeps a lamp burning in the hay.
      placeWindow(c, P.WIN_BARN, px, wallTop + 8, st, null, null);
    }
  } else if (church) {
    for (let px = 8; px + 5 < bw - 6; px += 16) {
      if (doorClear(px - 4, px + 9, 2)) continue;
      if (b.ruined) continue;
      placeWindow(c, P.WIN_ARCH, px, wallTop + 8, st, null, windows);
    }
  }

  // --- Door -----------------------------------------------------------------
  if (barnish) {
    const dh = Math.min(20, wallH - 6);
    const dx = doorC - 12;
    const dy = gy - dh;
    P.fill(c, dx - 3, dy - 3, 30, 2, 'tin1'); // sliding-door track
    P.fill(c, dx - 3, dy - 3, 30, 1, 'tin3');
    const leafRamp = P.RAMP[st.wall === P.RAMP.barn ? 'barn' : 'wood'];
    const open = !b.ruined && r.chance(0.35);
    c.save();
    c.beginPath();
    c.rect(dx, dy, 24, dh);
    c.clip();
    P.put(c, P.barnLeaf(leafRamp, false), dx, dy);
    if (open) {
      // One leaf slid open: dark stable interior and straw on the floor.
      P.fill(c, dx + 12, dy, 12, dh, 'ink');
      P.fill(c, dx + 12, dy, 12, 2, 'inkWarm');
      P.fill(c, dx + 12, gy - 3, 12, 3, 'dry2');
      for (let k = 0; k < 12; k += 3) P.fill(c, dx + 12 + k, gy - 4, 2, 1, 'dry3');
    } else P.put(c, P.barnLeaf(leafRamp, true), dx + 12, dy);
    c.restore();
    if (!b.ruined) lantern(c, dx - 6, dy - 6, windows);
  } else {
    const dy = gy - 16;
    let rows: readonly string[] = homely ? P.DOOR_PANEL : P.DOOR_PLANK;
    if (b.type === 'saloon') rows = P.DOOR_BATWING;
    else if (b.type === 'bank' || b.type === 'sheriff') rows = P.DOOR_IRON;
    else if (commercial) rows = P.DOOR_SHOP;
    const leaf = b.ruined ? P.RAMP.gwood : rows === P.DOOR_BATWING ? P.RAMP.wood : st.door;
    P.put(c, P.doorPiece(rows, leaf, st.trim), doorX - 1, dy - 1);
    // Head trim.
    P.fill(c, doorX - 2, dy - 2, 14, 1, st.trim[2]);
    // Little gabled hood over a homestead door.
    if (homely && !b.ruined && wallH >= 24) {
      for (let k = 0; k < 4; k++) {
        P.fill(c, doorX - 2 + k, dy - 3 - k, 14 - k * 2, 1, st.roof[k === 3 ? 3 : 2]);
        P.fill(c, doorX - 2 + k, dy - 3 - k, 1, 1, st.roof[0]);
        P.fill(c, doorX + 11 - k, dy - 3 - k, 1, 1, st.roof[0]);
      }
      P.fill(c, doorX - 2, dy - 2, 14, 1, st.roof[0]);
    }
    // Horseshoe over the odd door, for luck.
    if (!b.ruined && (homely || b.type === 'blacksmith') && r.chance(0.35) && wallH >= 26) {
      P.put(c, P.piece('shoe', ['o.o', 'o.o', '.o.'], { o: 'tin3' }), doorC - 1, dy - (homely ? 10 : 6));
    }
  }

  // --- Sign -----------------------------------------------------------------
  if (b.sign) {
    let sy = signY;
    if (sy < 0) {
      // No false front: board stands on the eave, braced by two short posts.
      sy = wallTop - 9;
      const sb = signBoard(c, b.sign, doorC, sy, bw - 8, st, b.ruined);
      for (const px of [sb.x + 3, sb.x + sb.w - 4]) {
        P.fill(c, px, sb.y + sb.h + 1, 1, wallTop - (sb.y + sb.h) + 1, 'wood1');
      }
    } else signBoard(c, b.sign, Math.floor(bw / 2), sy, bw - 8, st, b.ruined);
    if (!b.ruined && (falseFront || b.type === 'stable')) {
      const sbW = Math.min(bw - 8, signTextWidth(b.sign, true) + 12);
      const lx = Math.floor(bw / 2 - sbW / 2) - 5;
      if (lx > 3) {
        lantern(c, lx - 1, sy + 3, windows);
        lantern(c, bw - lx - 2, sy + 3, windows);
      }
    }
  }

  // --- Porch / awning / balcony ------------------------------------------------
  const porchY = gy - 22; // porch roof line on two-storey fronts
  const postKey = { ...P.trimKey([P.RAMP.wood[0], P.RAMP.wood[2], P.RAMP.wood[4]]) };
  const post = (px: number, y0: number, y1: number) => {
    P.put(c, P.piece('postcap', P.POST_CAP, postKey), px - 1, y0);
    P.tileRect(c, P.piece('postshaft', P.POST_SHAFT, postKey), px - 1, y0 + 2, 4, y1 - y0 - 4, px - 1, y0);
    P.put(c, P.piece('postbase', P.POST_BASE, postKey), px - 1, y1 - 2);
  };
  if (commercial && !adobe) {
    const awY = wallH >= 34 ? porchY : wallTop + 4;
    const canvasAwning = !b.ruined && ['store', 'tailor', 'doctor', 'gunsmith'].includes(b.type) && r.chance(0.6);
    if (!b.ruined) {
      let awH = 5;
      if (canvasAwning) {
        const aw = P.awning(st.awning);
        awH = 5;
        shadowRows(c, 0, awY + awH, bw, [0.45, 0.32, 0.2, 0.1]);
        P.band(c, aw, 0, awY, bw);
      } else {
        const pr = tin ? P.piece('porchtin', P.PORCH_TIN, P.rampKey(P.RAMP.tin)) : P.piece('porchroof', P.PORCH_ROOF, P.rampKey(st.roof));
        shadowRows(c, 0, awY + awH, bw, [0.5, 0.36, 0.22, 0.1]);
        P.band(c, pr, 0, awY, bw);
      }
      // Hotels and saloons get a railed balcony on the porch roof.
      if ((b.type === 'hotel' || b.type === 'saloon') && wallH >= 34) P.band(c, P.piece('rail', P.RAIL, P.trimKey(st.trim)), 0, awY - 6, bw);
      // Posts.
      const posts: number[] = [1, bw - 3];
      for (let px = 40; px < bw - 20; px += 40) if (!doorClear(px - 2, px + 2, 2)) posts.push(px);
      for (const px of posts) post(px, awY + awH, gy + 3);
    } else {
      // Ruined: only a couple of leaning posts remain.
      P.fill(c, 1, awY + 6, 2, gy - awY - 3, 'gwood1');
      P.fill(c, 1, awY + 6, 1, gy - awY - 3, 'gwood2');
      for (let k = 0; k < gy - awY - 8; k += 3) P.fill(c, bw - 6 + Math.floor(k / 6), awY + 8 + k, 2, 3, 'gwood1');
    }
  } else if (homely && !b.ruined && bw >= 80) {
    // Covered front porch across part (or all) of the house.
    const full = b.type === 'ranchhouse' || b.type === 'bunkhouse' || r.chance(0.4);
    if (full || r.chance(0.6)) {
      const px0 = full ? 0 : Math.max(0, doorX - 18);
      const px1 = full ? bw : Math.min(bw, doorX + 28);
      const py = wallTop + 1;
      shadowRows(c, px0, py + 5, px1 - px0, [0.45, 0.3, 0.16]);
      P.tileRect(c, P.piece('porchroof', P.PORCH_ROOF, P.rampKey(st.roof)), px0, py, px1 - px0, 5, px0, py);
      for (const px of [px0 + 1, px1 - 3, ...(full ? [Math.floor(bw / 3), Math.floor((2 * bw) / 3)] : [])]) {
        if (doorClear(px - 2, px + 4, 1)) continue;
        post(px, py + 5, gy - 1);
      }
      P.tileRect(c, P.piece('deck', P.DECK, P.rampKey(P.RAMP.wood)), px0, gy - 2, px1 - px0, 2, px0, gy - 2);
    }
  }

  // --- Lanterns by the door -----------------------------------------------------
  if (!b.ruined && !barnish && (commercial || r.chance(0.5)) && doorX - 5 > 2) lantern(c, doorX - 5, gy - 15, windows);

  // --- Lived-in props along the front ------------------------------------------
  if (!b.ruined) {
    const kit: ((x: number) => number)[] = [];
    const W = P.RAMP.wood;
    const add = (rows: readonly string[], ramp: Ramp, extra: Record<string, string> = {}) => kit.push((x) => propAt(c, rows, ramp, x, gy, extra));
    if (commercial) {
      add(P.BARREL, W, P.PROP_KEY.barrel);
      if (b.type === 'store' || b.type === 'tradingpost') add(P.SACKS, P.RAMP.cream), add(P.CRATE, W);
      if (b.type === 'saloon' || b.type === 'hotel' || b.type === 'sheriff') add(P.BENCH, W);
      if (r.chance(0.4)) add(P.PLANTER, P.RAMP.brick, { ...P.PROP_KEY.planter, p: st.flowers[0], q: st.flowers[1] });
    } else if (barnish) {
      add(P.HAY, P.RAMP.ochre);
      add(P.MILKCANS, P.RAMP.tin);
      if (r.chance(0.6)) add(P.TROUGH, W, P.PROP_KEY.trough);
      add(P.BARREL, W, P.PROP_KEY.barrel);
    } else if (homely || b.type === 'shack') {
      if (r.chance(0.6)) add(P.ROCKER, W);
      if (r.chance(0.6)) add(P.PLANTER, P.RAMP.brick, { ...P.PROP_KEY.planter, p: st.flowers[0], q: st.flowers[1] });
      if (r.chance(0.5)) add(P.BARREL, W, P.PROP_KEY.barrel);
      if (b.wall === 'log' || r.chance(0.3)) add(P.WOODPILE, W, P.PROP_KEY.woodpile);
      if (r.chance(0.4)) add(P.BENCH, W);
    }
    // Place from both ends inward, never in front of the door or a doorway.
    let lx = 5;
    let rx = bw - 5;
    const reserve0 = barnish ? doorC - 18 : doorX - 6;
    const reserve1 = barnish ? doorC + 18 : doorX + 15;
    kit.forEach((place, i) => {
      if (i % 2 === 0) {
        if (lx + 13 < reserve0) lx += place(lx) + r.int(2, 4);
      } else if (rx - 13 > reserve1) rx -= place(rx - 13) + r.int(2, 4);
    });
  }

  // --- Boardwalk, grime, contact shadow -------------------------------------------
  c.globalAlpha = 0.3;
  P.band(c, P.grime(), 0, gy - 3, bw);
  c.globalAlpha = 1;
  if (commercial && !b.ruined) P.band(c, P.piece('boardwalk', P.BOARDWALK, P.rampKey(P.RAMP.wood)), 0, gy, bw);
  shadowRows(c, 0, gy - 1, bw, [0.4]);
  if (b.ruined) {
    // Missing boards.
    const gap = P.piece('gap', P.BOARD_GAP, { '0': st.wall[0], a: 'ink' });
    for (let i = 0; i < 3; i++) P.put(c, gap, r.int(4, bw - 12), wallTop - ff + r.int(2, 8) + i * 4);
  }

  // --- Interior cutaway: back wall + side walls + low front wall -------------
  const inter = makeCanvas(bw, H);
  const ic = ctx2d(inter);
  const backTop = top;
  P.tileRect(ic, wallT, 0, backTop - 6, bw, 22, 0, backTop - 6);
  P.fill(ic, 0, backTop + 15, bw, 1, 'inkWarm');
  P.tileRect(ic, wallT, 0, backTop - 6, 12, b.h * 16 + 6, 0, backTop - 6);
  P.tileRect(ic, wallT, bw - 12, backTop - 6, 12, b.h * 16 + 6, 0, backTop - 6);
  shadowRows(ic, 0, backTop + 16, bw, [0.35, 0.2]);
  P.fill(ic, 11, backTop + 16, 1, b.h * 16 - 22, 'inkWarm');
  P.fill(ic, bw - 12, backTop + 16, 1, b.h * 16 - 22, 'inkWarm');
  // Back-wall decor: picture frames and lamps, modules shared with the exterior.
  const frameP = P.piece('frame', ['oooooooo', 'o444443o', 'o4pppp3o', 'o4pPpp3o', 'o3pppp2o', 'o222221o', 'oooooooo'], { ...P.rampKey(P.RAMP.brass), o: 'wood0', p: 'teal2', P: 'cream3' });
  for (let px = 28; px < bw - 20; px += 40) P.put(ic, frameP, px, backTop + 1);
  for (let px = 20; px < bw - 20; px += 40) P.put(ic, P.prop(P.LANTERN, P.RAMP.darkwood, { ...P.PROP_KEY.lantern, o: 'brass1' }), px, backTop + 4);
  const fwy = top + b.h * 16 - 6;
  P.tileRect(ic, wallT, 0, fwy, bw, 6, 0, fwy);
  P.fill(ic, 0, fwy, bw, 1, st.wallKind === 'log' ? st.wall[3] : st.trim[2]);
  ic.clearRect(doorX, fwy, 10, 6);
  P.fill(ic, 0, backTop - 7, bw, 1, 'inkWarm');
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
