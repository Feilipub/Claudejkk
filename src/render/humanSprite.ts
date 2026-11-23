/**
 * Procedural human sprite painter — hand-placed pixel rectangles (no
 * anti-aliasing) for crisp 20×28 characters. Supports hats, hair, facial
 * hair, clothing layers (shirt, vest, duster, apron, dress), gunbelts and the
 * poses the game needs.
 *
 * Art principles (original work, no borrowed assets): a readable silhouette
 * per build and outfit, light from the upper-left with hue-shifted ramps,
 * contact-low / passing-high walk bob, cloth that lags the body (coat tails,
 * skirt hems), and dust/wear on hems, knees and boots.
 */
import { autoShade, ctx2d, makeCanvas, mix, pixelise, shade, type Ctx } from './pixel.ts';

export const PW = 20;
export const PH = 28;

export interface HumanLook {
  skin: string;
  hair: string;
  hairStyle: 'short' | 'long' | 'bun' | 'bald' | 'braid' | 'curly';
  facial: 'none' | 'stubble' | 'mustache' | 'beard' | 'goatee';
  hat: 'none' | 'cowboy' | 'bowler' | 'sombrero' | 'bonnet' | 'cap' | 'derby' | 'cavalry' | 'flat';
  hatColor: string;
  shirt: string;
  vest: string | null;
  coat: string | null;
  pants: string;
  boots: string;
  skirt: boolean;
  bandana: string | null;
  apron?: string | null;
  badge?: boolean;
  build: 'slim' | 'average' | 'stocky';
  gunbelt?: boolean;
  /**
   * Optional: paint child proportions (bigger head, short limbs, no facial
   * hair or gunbelt). Callers that also scale children down may want a
   * milder scale (~0.85) when this is set.
   */
  child?: boolean;
}

export type HumanAnim = 'idle' | 'walk' | 'run' | 'shoot' | 'ride' | 'dead' | 'surrender' | 'interact' | 'sit';
export type Dir = 'down' | 'up' | 'side';

export interface HumanSpriteSet {
  frames: Record<Dir, Record<HumanAnim, (HTMLCanvasElement | OffscreenCanvas)[]>>;
}

function R(c: Ctx, x: number, y: number, w: number, h: number, col: string): void {
  if (w <= 0 || h <= 0) return;
  c.fillStyle = col;
  c.fillRect(x, y, w, h);
}
function P(c: Ctx, x: number, y: number, col: string): void {
  c.fillStyle = col;
  c.fillRect(x, y, 1, 1);
}

interface PoseH {
  legA: number; // -1..1 stride
  armA: number;
  bob: number;
  run?: boolean;
  aim?: boolean;
  ride?: boolean;
  hands?: boolean;
  reach?: boolean;
  sit?: boolean;
  /** 0/1 — brush-stroke phase for the interact pose. */
  stroke?: number;
}

const DUST = '#b39a68';
const LEATHER = '#5e3d24';
const LEATHER_D = '#3b2618';
const BRASS = '#d4ae52';
const METAL = '#2e2e36';
const METAL_L = '#8c8c96';
const EYE = '#1e140f';
const WHITE_HAIR = '#d8d6d0';
const GREY_HAIR = '#9c9a95';

/** Relative luminance 0..1 of a hex colour (sRGB weights, no gamma). */
export function luma(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255;
}

/**
 * Hair ramp that keeps value separation from the skin. Near-black hair on a
 * dark face would merge into one silhouette, so it is lifted to a cool
 * violet-black with a cool sheen (the classic pixel-art way to paint black
 * hair) and the darkest step is kept off the outline colour.
 */
export function readableHair(hair: string, skin: string): { hair: string; hairL: string; hairD: string } {
  const lh = luma(hair);
  if (lh < 0.16) {
    const dark = luma(skin) < 0.4;
    const base = mix(hair, '#36303e', dark ? 0.55 : 0.4);
    return { hair: base, hairL: mix(base, '#867a96', dark ? 0.5 : 0.4), hairD: mix(hair, '#1c1822', 0.4) };
  }
  if (hair !== WHITE_HAIR && hair !== GREY_HAIR && Math.abs(lh - luma(skin)) < 0.14) {
    // Fair hair on fair skin: deepen the body of the hair to a gold-brown
    // and keep the original colour as its highlight, so beard and fringe
    // don't dissolve into the face.
    const base = mix(hair, '#8a6430', 0.42);
    return { hair: base, hairL: hair, hairD: shade(base, -0.3) };
  }
  return { hair, hairL: shade(hair, hair === WHITE_HAIR ? 0.2 : 0.22), hairD: shade(hair, -0.25) };
}

/** Colours used across all frames of one look. */
interface Pal {
  skin: string;
  skinD: string;
  skinL: string;
  hair: string;
  hairD: string;
  hairL: string;
  shirt: string;
  shirtD: string;
  shirtL: string;
  pants: string;
  pantsD: string;
  pantsW: string;
  boots: string;
  bootsL: string;
  bootsD: string;
  coat: string;
  coatD: string;
  coatL: string;
  coatH: string;
  vest: string;
  vestD: string;
  vestL: string;
  hat: string;
  hatD: string;
  hatL: string;
  rose: string;
}

function palette(L: HumanLook): Pal {
  const coat = L.coat ?? L.shirt;
  const vest = L.vest ?? L.shirt;
  const hr = readableHair(L.hair, L.skin);
  const darkSkin = luma(L.skin) < 0.32;
  return {
    // Very dark skin gets a touch more light so 1-px features still read.
    skin: darkSkin ? shade(L.skin, 0.06) : L.skin,
    skinD: shade(L.skin, -0.2),
    skinL: shade(L.skin, darkSkin ? 0.26 : 0.12),
    hair: hr.hair,
    hairD: hr.hairD,
    hairL: hr.hairL,
    shirt: L.shirt,
    shirtD: shade(L.shirt, -0.2),
    shirtL: shade(L.shirt, 0.18),
    pants: L.pants,
    pantsD: shade(L.pants, -0.22),
    pantsW: mix(L.pants, DUST, 0.3),
    boots: L.boots,
    bootsL: shade(L.boots, 0.25),
    bootsD: shade(L.boots, -0.2),
    coat,
    coatD: shade(coat, -0.22),
    coatL: shade(coat, 0.16),
    coatH: mix(coat, DUST, 0.35),
    vest,
    vestD: shade(vest, -0.2),
    vestL: shade(vest, 0.3),
    hat: L.hatColor,
    hatD: shade(L.hatColor, -0.3),
    hatL: shade(L.hatColor, 0.2),
    rose: mix(L.skin, '#d8605a', 0.35),
  };
}

const isElder = (L: HumanLook) => !L.child && L.hair === WHITE_HAIR;
const hairShows = (L: HumanLook) => L.hairStyle !== 'bald';

/** Vertical layout for one frame (feet always land on row 24). */
function layout(L: HumanLook, p: PoseH): { headY: number; torsoY: number; legY: number; headH: number; torsoH: number; legH: number } {
  const child = !!L.child;
  const headH = child ? 7 : 6;
  const torsoH = child ? 5 : 7;
  const legH = child ? 5 : 7;
  const legY = 25 - legH + p.bob;
  const torsoY = legY - torsoH;
  const headY = torsoY - headH;
  return { headY, torsoY, legY, headH, torsoH, legH };
}

// ---------------------------------------------------------------------------
// Front / back
// ---------------------------------------------------------------------------

/**
 * Head painting is deferred into `heads` when given, so render() can shade the
 * body with the strong rim pass and the face with a gentle one: 1-px eyes and
 * cheek lights must keep their exact values.
 */
type HeadLayer = ((c: Ctx) => void)[] | undefined;
function emitHead(c: Ctx, heads: HeadLayer, fn: (c: Ctx) => void): void {
  if (heads) heads.push(fn);
  else fn(c);
}

function paintFront(c: Ctx, L: HumanLook, C: Pal, p: PoseH, back: boolean, heads?: HeadLayer): void {
  const cx = 10;
  const child = !!L.child;
  const hw = child ? 3 : L.build === 'slim' ? 3 : L.build === 'stocky' ? 5 : 4;
  const { headY, torsoY, legY, headH, torsoH, legH } = layout(L, p);
  const tl = cx - hw; // torso left x
  const tw = hw * 2;
  const la = Math.round(p.legA);
  const coatLen = child ? 2 : 4;

  // ---- Legs / skirt -------------------------------------------------------
  if (p.ride) {
    // Thighs spread around the barrel; the horse painter adds the hanging shins.
    R(c, cx - 7, legY, 4, 2, C.pants);
    R(c, cx + 3, legY, 4, 2, C.pants);
    R(c, cx - 3, legY, 6, 1, C.pantsD);
  } else if (L.skirt) {
    const sway = la;
    const hemY = 24 - 1;
    for (let y = legY - 1; y <= hemY; y++) {
      const t = (y - legY + 1) / (hemY - legY + 1);
      const flare = Math.round(t * 2);
      const off = y >= hemY - 1 ? sway : 0;
      R(c, tl - flare + off + (hw > 3 ? 0 : 0), y, tw + flare * 2, 1, y === hemY ? mix(L.pants, DUST, 0.25) : L.pants);
    }
    // Folds catch the light from the upper-left.
    R(c, cx - 2, legY + 1, 1, hemY - legY - 1, shade(L.pants, 0.12));
    R(c, cx + 1, legY + 2, 1, hemY - legY - 2, C.pantsD);
    // Boot toes peek under the hem.
    P(c, cx - 2 + (la > 0 ? -1 : 0), 24, C.boots);
    P(c, cx - 3 + (la > 0 ? -1 : 0), 24, C.boots);
    P(c, cx + 1 + (la < 0 ? 1 : 0), 24, C.boots);
    P(c, cx + 2 + (la < 0 ? 1 : 0), 24, C.boots);
  } else if (p.sit) {
    R(c, cx - 3, legY, 6, 2, C.pants);
    R(c, cx - 3, legY + 2, 2, 3, C.pants);
    R(c, cx + 1, legY + 2, 2, 3, C.pants);
    R(c, cx - 3, legY + 5, 2, 1, C.boots);
    R(c, cx + 1, legY + 5, 2, 1, C.boots);
  } else {
    const spread = L.build === 'stocky' && !child ? 1 : 0;
    const lift = p.run ? 2 : 1;
    const liftL = la > 0 ? lift : 0;
    const liftR = la < 0 ? lift : 0;
    const bootH = child ? 1 : 2;
    const legs: [number, number][] = [
      [cx - 3 - spread, liftL],
      [cx + spread, liftR],
    ];
    for (const [x, up] of legs) {
      const h = legH - bootH - up;
      R(c, x, legY, 3, h, C.pants);
      if (!back && h > 3) P(c, x + 1, legY + h - 2, C.pantsW); // worn knee
      R(c, x, legY + h, 3, bootH, C.boots);
      if (!back) P(c, x, legY + h, C.bootsL);
    }
    // Inseam: a shadowed gap so the two legs read separately.
    R(c, cx - 1, legY, 2, 1, C.pantsD);
    if (spread) R(c, cx - 1, legY + 1, 2, legH - 2, 'rgba(0,0,0,0)');
    else R(c, cx - 1, legY + 2, 1, legH - 3 - Math.max(liftL, 0), C.pantsD);
  }

  // ---- Torso --------------------------------------------------------------
  // Shoulders slope: the top row is one pixel narrower each side.
  R(c, tl + 1, torsoY, tw - 2, 1, C.shirt);
  R(c, tl, torsoY + 1, tw, torsoH - 1, C.shirt);
  if (L.skirt && !child) {
    // Fitted bodice: nipped waist.
    P(c, tl, torsoY + torsoH - 2, 'rgba(0,0,0,0)');
    c.clearRect(tl, torsoY + torsoH - 2, 1, 2);
    c.clearRect(tl + tw - 1, torsoY + torsoH - 2, 1, 2);
  }
  if (L.build === 'stocky' && !child && !L.skirt) R(c, tl, torsoY + torsoH - 3, tw, 2, C.shirt); // belly
  // Side seams in shadow so the arms separate from the body.
  R(c, tl, torsoY + 2, 1, torsoH - 3, C.shirtD);
  R(c, tl + tw - 1, torsoY + 2, 1, torsoH - 3, C.shirtD);
  if (!back) {
    // Collar and placket.
    P(c, cx - 2, torsoY, C.shirtL);
    P(c, cx + 1, torsoY, C.shirtL);
    R(c, cx - 1, torsoY, 2, 1, C.skinD);
    if (!L.skirt && !L.vest && !L.coat) for (let y = torsoY + 2; y < torsoY + torsoH - 1; y += 2) P(c, cx - 1, y, C.shirtD);
    if (L.skirt) R(c, cx - 1, torsoY + 1, 2, 1, C.shirtL); // lace collar
  }
  if (L.vest) {
    if (back) R(c, tl, torsoY + 1, tw, torsoH - 2, C.vest);
    else {
      const pw = hw - 1;
      R(c, tl, torsoY + 1, pw, torsoH - 1, C.vest);
      R(c, cx + 1, torsoY + 1, pw, torsoH - 1, C.vest);
      P(c, tl + pw - 1, torsoY + torsoH - 1, C.vest); // pointed hem
      R(c, tl + 1, torsoY, pw - 1, 1, C.vest);
      R(c, cx + 1, torsoY, pw - 1, 1, C.vest);
      P(c, cx - 2, torsoY + 2, C.vestL);
      P(c, cx - 2, torsoY + 4, C.vestL);
      if (tw >= 8) P(c, tl + 1, torsoY + 2, C.vestD); // pocket + watch chain
      if (tw >= 8) P(c, tl + 2, torsoY + 3, BRASS);
    }
  }
  const coatOn = !!L.coat;
  if (coatOn) {
    const hem = legY + coatLen;
    const swing = la;
    if (back) {
      R(c, tl, torsoY, tw, hem - torsoY, C.coat);
      R(c, tl + 1, torsoY, tw - 2, 1, C.coatL); // yoke
      R(c, cx - 1 + (swing > 0 ? 0 : 1) - 1, legY + 1, 1, hem - legY - 1, C.coatD); // centre vent
      R(c, tl, hem - 1, tw, 1, C.coatH);
    } else {
      const pw = Math.max(2, hw - 1);
      for (const side of [0, 1]) {
        const x = side === 0 ? tl - 1 : cx + hw - pw + 1;
        const sx = side === 0 ? -Math.max(0, swing) : Math.max(0, -swing);
        R(c, x, torsoY, pw, legY - torsoY, C.coat);
        R(c, x + (side === 0 ? sx : -sx), legY, pw, hem - legY, C.coat);
        R(c, x + (side === 0 ? sx : -sx), hem - 1, pw, 1, C.coatH);
      }
      // Lapels: lit on the left, shaded on the right.
      R(c, cx - hw + pw - 1, torsoY, 1, 3, C.coatL);
      R(c, cx + hw - pw, torsoY, 1, 3, C.coatD);
    }
  }
  if (L.apron && !back) {
    R(c, cx - 3, torsoY + 1, 6, torsoH - 1, L.apron);
    R(c, cx - (L.skirt ? 4 : 3), legY, L.skirt ? 8 : 6, child ? 3 : 5, L.apron);
    R(c, cx - 3, legY + (child ? 2 : 4), 6, 1, shade(L.apron, -0.18));
    P(c, cx - 2, torsoY, shade(L.apron, -0.1));
    P(c, cx + 1, torsoY, shade(L.apron, -0.1));
    R(c, cx - 2, legY + 1, 1, 3, shade(L.apron, 0.15));
  } else if (L.apron && back) {
    R(c, cx - 1, legY - 1, 2, 1, L.apron); // tied bow
    P(c, cx - 2, legY, L.apron);
    P(c, cx + 1, legY, L.apron);
  }
  // Belt / gunbelt.
  if (!L.skirt) {
    R(c, tl, legY - 1, tw, 1, LEATHER_D);
    if (!back) R(c, cx - 1, legY - 1, 2, 1, BRASS);
  } else if (!child) {
    R(c, tl + 1, legY - 1, tw - 2, 1, shade(L.shirt, -0.3)); // sash
  }
  if (L.gunbelt && !child) {
    // Slung low on the hips with cartridge loops and a holstered revolver.
    R(c, tl, legY, tw, 1, LEATHER);
    if (!back) for (let x = tl + 1; x < tl + tw; x += 2) P(c, x, legY, BRASS);
    const hx = back ? tl - 1 : tl + tw - 1;
    R(c, hx, legY, 2, 4, LEATHER_D);
    P(c, hx + (back ? 0 : 1), legY - 1, METAL);
    P(c, hx, legY + 1, LEATHER);
  }
  if (L.bandana && !back) {
    R(c, cx - 2, torsoY, 4, 1, L.bandana);
    R(c, cx - 1, torsoY + 1, 2, 1, L.bandana);
    P(c, cx - 2, torsoY, shade(L.bandana, 0.25));
  } else if (L.bandana && back) R(c, cx - 2, torsoY, 4, 1, L.bandana);
  if (L.badge && !back) {
    P(c, tl + 1, torsoY + 2, BRASS);
    P(c, tl + 1, torsoY + 1, '#fff2a8');
  }

  // ---- Arms ---------------------------------------------------------------
  const sleeve = L.coat ?? L.shirt;
  const rolled = !L.coat && !L.skirt && !child; // working men roll their sleeves
  const armL = tl - 2;
  const armR = tl + tw;
  const armLen = child ? 4 : 6;
  const arm = (x: number, y: number, len: number) => {
    const sl = rolled ? Math.ceil(len / 2) : len;
    R(c, x, y, 2, sl, sleeve);
    if (rolled) {
      P(c, x, y + sl - 1, shade(sleeve, 0.15));
      R(c, x, y + sl, 2, len - sl, C.skin);
    } else R(c, x, y + len - 1, 2, 1, shade(sleeve, -0.15)); // cuff
    R(c, x, y + len, 2, 1, C.skin);
  };
  const aa = Math.round(p.armA);
  if (p.hands) {
    for (const x of [armL, armR]) {
      R(c, x, torsoY - 4, 2, 5, sleeve);
      R(c, x, torsoY - 6, 2, 2, C.skin);
    }
  } else if (p.ride) {
    // Elbows bent, both fists together over the pommel holding the reins.
    const hy = torsoY + 4 + Math.round(p.armA);
    R(c, armL, torsoY + 1, 2, 3, sleeve);
    R(c, armR, torsoY + 1, 2, 3, sleeve);
    R(c, armL + 1, torsoY + 4, cx - armL - 2, 1, sleeve);
    R(c, cx + 1, torsoY + 4, armR - cx, 1, sleeve);
    if (!back) {
      R(c, cx - 2, hy, 4, 2, C.skin);
      P(c, cx - 1, hy + 2, LEATHER_D);
      P(c, cx, hy + 2, LEATHER_D);
      R(c, cx - 2, hy + 3, 1, 2, LEATHER_D);
      R(c, cx + 1, hy + 3, 1, 2, LEATHER_D);
    }
  } else if (p.aim) {
    if (back) {
      arm(armL, torsoY + 1, armLen);
      R(c, armR, torsoY + 1, 2, 3, sleeve);
    } else {
      // Two-handed point toward the viewer: arms converge, muzzle front-centre.
      R(c, armL, torsoY + 1, 2, 2, sleeve);
      R(c, armL + 1, torsoY + 3, 3, 2, sleeve);
      R(c, armR, torsoY + 1, 2, 2, sleeve);
      R(c, armR - 2, torsoY + 3, 3, 2, sleeve);
      R(c, cx - 2, torsoY + 4, 4, 2, C.skin);
      R(c, cx - 1, torsoY + 5, 2, 2, METAL);
      P(c, cx - 1, torsoY + 5, METAL_L);
    }
  } else if (p.reach) {
    // Brushing / working at waist-to-chest height: right forearm across the body.
    const s = p.stroke ?? 0;
    arm(armL, torsoY + 1, armLen);
    if (back) {
      R(c, armR, torsoY + 1, 2, 3, sleeve);
      R(c, armR + 1, torsoY + 3 + s, 2, 2, sleeve);
    } else {
      R(c, armR, torsoY + 1, 2, 3, sleeve);
      const fx = cx - 1 + s;
      const fy = torsoY + 3 + s;
      R(c, fx + 1, fy, armR - fx, 2, rolled ? C.skin : sleeve);
      R(c, fx - 1, fy, 2, 2, C.skin);
      R(c, fx - 3, fy - 1, 3, 1, LEATHER); // brush back
      R(c, fx - 3, fy, 3, 1, '#c8b27a'); // bristles
    }
  } else {
    arm(armL, torsoY + 1 + aa, armLen);
    arm(armR, torsoY + 1 - aa, armLen);
  }

  // ---- Head ---------------------------------------------------------------
  emitHead(c, heads, (h) => {
    paintHeadFront(h, L, C, cx, headY, headH, back);
    paintHatFront(h, L, C, cx, headY, back);
  });
}

function paintHeadFront(c: Ctx, L: HumanLook, C: Pal, cx: number, hy: number, hh: number, back: boolean): void {
  const child = !!L.child;
  const hl = child ? cx - 4 : cx - 3;
  const hwid = child ? 8 : 6;
  // Skull with rounded chin.
  R(c, hl, hy, hwid, hh - 1, C.skin);
  R(c, hl + 1, hy + hh - 1, hwid - 2, 1, C.skin);
  P(c, hl, hy, 'rgba(0,0,0,0)');
  c.clearRect(hl, hy, 1, 1);
  c.clearRect(hl + hwid - 1, hy, 1, 1);
  R(c, hl + 1, hy + hh - 1, hwid - 2, 1, C.skinD);
  const covered = L.hat !== 'none' && L.hat !== 'bonnet' && L.hat !== 'cap';
  const H = C.hair;
  if (back) {
    if (hairShows(L)) {
      R(c, hl, hy, hwid, hh - 2, H);
      R(c, hl + 1, hy - 1, hwid - 2, 1, H);
      R(c, hl + 1, hy + 1, 1, 2, C.hairL);
      if (L.hairStyle === 'long') R(c, hl, hy + hh - 2, hwid, 4, H);
      if (L.hairStyle === 'curly') {
        R(c, hl - 1, hy + 1, hwid + 2, 3, H);
        P(c, hl + 1, hy + hh - 2, C.hairD);
      }
      if (L.hairStyle === 'braid') {
        for (let i = 0; i < (child ? 5 : 6); i++) R(c, cx - 1, hy + hh - 2 + i, 2, 1, i % 2 ? C.hairD : H);
        P(c, cx - 1, hy + hh + (child ? 3 : 4), '#c8b27a');
      }
      if (L.hairStyle === 'bun') {
        R(c, cx - 2, hy + 1, 4, 3, C.hairD);
        R(c, cx - 1, hy + 1, 2, 2, H);
      }
    } else R(c, hl + 1, hy, hwid - 2, 1, C.skinL);
    return;
  }
  // ---- Face ----
  const eyeY = hy + (child ? 4 : 3);
  const eL = child ? cx - 3 : cx - 2;
  const eR = child ? cx + 2 : cx + 1;
  if (covered) R(c, hl, hy + 1, hwid, 1, C.skinD); // brim shadow
  // Brows read the mood: older/gruff men get a heavier line.
  const brow = L.hair === WHITE_HAIR ? GREY_HAIR : C.hairD;
  if (!covered && !child && L.facial !== 'none') {
    P(c, eL, eyeY - 1, brow);
    P(c, eR, eyeY - 1, brow);
  }
  P(c, eL, eyeY, EYE);
  P(c, eR, eyeY, EYE);
  if (luma(L.skin) < 0.32) {
    // Dark faces: the eye row and cheekbones catch the light so the pupils
    // sit in a lit band instead of sinking into the skin.
    R(c, eL + 1, eyeY, eR - eL - 1, 1, C.skinL);
    P(c, eL, eyeY + (child ? 2 : 1), C.skinL);
    P(c, eR, eyeY + (child ? 2 : 1), C.skinL);
  }
  if (child) {
    P(c, eL, eyeY + 1, EYE); // tall, round kid eyes
    P(c, eR, eyeY + 1, EYE);
    P(c, eL - 1, eyeY + 2, C.rose);
    P(c, eR + 1, eyeY + 2, C.rose);
  } else {
    P(c, cx, eyeY + 1, C.skinD); // nose shadow on the right
    if (L.skirt) {
      P(c, eL - 1, eyeY, EYE); // lashes
      P(c, eR + 1, eyeY, EYE);
      P(c, cx - 1, eyeY + 2, C.rose);
    }
    if (isElder(L)) {
      P(c, eL - 1, eyeY + 1, C.skinD); // crow's feet
      P(c, eR + 1, eyeY + 1, C.skinD);
    }
  }
  // Hair framing the face.
  if (hairShows(L)) {
    if (covered) {
      // Under a brim only the temples show; the forehead stays a band of
      // shade so the face reads as a face, not a mass of hair and hat.
      R(c, hl, hy, hwid, 1, H);
      P(c, hl, hy + 1, H);
      P(c, hl + hwid - 1, hy + 1, C.hairD);
    } else {
      R(c, hl, hy, hwid, 2, H);
      R(c, hl + 1, hy - 1, hwid - 2, 1, H);
      P(c, hl + 1, hy, C.hairL);
      P(c, hl + 2, hy - 1, C.hairL);
    }
    if (!covered) {
      // Side part: a lock dips over the forehead.
      P(c, hl + (child ? 2 : 1), hy + 2, H);
      if (child) R(c, hl + 1, hy + 2, 3, 1, H);
    }
    R(c, hl, hy + 2, 1, 2, H); // sideburns / temples
    R(c, hl + hwid - 1, hy + 2, 1, 2, H);
    switch (L.hairStyle) {
      case 'long':
        R(c, hl - 1, hy, 1, hh + 2, H);
        R(c, hl + hwid, hy, 1, hh + 2, C.hairD);
        R(c, hl, hy + 2, 1, hh - 1, H);
        R(c, hl + hwid - 1, hy + 2, 1, hh - 1, C.hairD);
        break;
      case 'curly':
        R(c, hl - 1, hy, 1, 4, H);
        R(c, hl + hwid, hy, 1, 4, C.hairD);
        for (let x = hl; x < hl + hwid; x += 2) P(c, x, hy - 1, x === hl ? C.hairL : H);
        P(c, hl - 1, hy + 4, C.hairD);
        P(c, hl + hwid, hy + 4, C.hairD);
        P(c, hl + 2, hy + 1, C.hairD);
        P(c, hl + 4, hy, C.hairD);
        break;
      case 'bun':
        if (L.hat !== 'none') break;
        R(c, cx - 1, hy - 3, 2, 2, H);
        P(c, cx - 1, hy - 3, C.hairL);
        break;
      case 'braid': {
        // Plait over the left shoulder.
        const by = hy + 3;
        for (let i = 0; i < (child ? 5 : 7); i++) P(c, hl - 1 + (i > 3 ? 1 : 0), by + i, i % 2 ? C.hairD : H);
        P(c, hl - 1 + 1, by + (child ? 5 : 7), '#c8b27a');
        if (child) {
          for (let i = 0; i < 5; i++) P(c, hl + hwid - (i > 3 ? 1 : 0), by + i, i % 2 ? C.hairD : H);
          P(c, hl + hwid - 1, by + 5, '#c8b27a');
        }
        break;
      }
    }
  } else {
    // Bald: shine on the dome, fringe above the ears.
    P(c, hl + 2, hy, C.skinL);
    P(c, hl + 1, hy + 1, C.skinL);
    if (L.facial !== 'none' || isElder(L) || L.hair === GREY_HAIR) {
      R(c, hl, hy + 2, 1, 2, H);
      R(c, hl + hwid - 1, hy + 2, 1, 2, H);
    }
  }
  if (child) return;
  // Facial hair.
  const mY = eyeY + 1;
  const fh = C.hair;
  switch (L.facial) {
    case 'mustache':
      R(c, cx - 2, mY + 1, 4, 1, fh);
      P(c, cx - 2, mY + 2, fh); // drooping horseshoe tips
      P(c, cx + 1, mY + 2, C.hairD);
      P(c, cx - 1, mY + 1, C.hairL);
      break;
    case 'beard':
      R(c, hl, mY, 1, 2, fh);
      R(c, hl + hwid - 1, mY, 1, 2, C.hairD);
      R(c, hl + 1, mY + 1, hwid - 2, 1, fh);
      R(c, hl + 1, mY + 2, hwid - 2, 1, fh);
      R(c, cx - 2, mY + 3, 4, 1, C.hairD);
      P(c, cx - 1, mY + 2, shade(C.skin, -0.35)); // mouth in the beard
      P(c, cx, mY + 2, shade(C.skin, -0.35));
      P(c, hl + 1, mY + 1, C.hairL);
      break;
    case 'goatee':
      R(c, cx - 1, mY + 1, 2, 1, C.hairD);
      R(c, cx - 1, mY + 2, 2, 2, fh);
      break;
    case 'stubble': {
      const st = mix(C.skin, C.hair, 0.4);
      R(c, hl + 1, mY + 1, hwid - 2, 1, st);
      P(c, hl, mY, st);
      P(c, hl + hwid - 1, mY, st);
      P(c, cx - 1, mY + 1, shade(C.skin, -0.3));
      break;
    }
    case 'none':
      if (!L.skirt) P(c, cx - 1, mY + 1, shade(C.skin, -0.28));
      break;
  }
}

function paintHatFront(c: Ctx, L: HumanLook, C: Pal, cx: number, hy: number, back: boolean): void {
  const h = C.hat;
  const hd = C.hatD;
  const hlit = C.hatL;
  const band = back ? hd : LEATHER_D;
  const kid = L.child ? 1 : 0;
  switch (L.hat) {
    case 'cowboy':
    case 'cavalry': {
      // Brim curled at the tips, pinched crown, band.
      R(c, cx - 5 - kid, hy, 10 + kid * 2, 1, h);
      P(c, cx - 6 - kid, hy - 1, h);
      P(c, cx + 5 + kid, hy - 1, hd);
      R(c, cx - 3, hy - 3, 6, 3, h);
      R(c, cx - 2, hy - 4, 4, 1, h);
      P(c, cx - 1, hy - 4, hd); // crease
      P(c, cx, hy - 4, hd);
      R(c, cx - 3, hy - 1, 6, 1, L.hat === 'cavalry' ? BRASS : band);
      P(c, cx - 3, hy - 3, hlit);
      P(c, cx - 4 - kid, hy, hlit);
      if (L.hat === 'cavalry' && !back) P(c, cx + 2, hy - 2, BRASS); // crossed-sabres pin
      break;
    }
    case 'sombrero':
      R(c, cx - 7, hy, 14, 1, h);
      P(c, cx - 8, hy - 1, h);
      P(c, cx + 7, hy - 1, hd);
      R(c, cx - 2, hy - 4, 4, 4, h);
      R(c, cx - 1, hy - 5, 2, 1, h);
      R(c, cx - 2, hy - 1, 4, 1, shade(h, 0.35));
      P(c, cx - 1, hy - 1, '#b84a3a');
      P(c, cx - 2, hy - 4, hlit);
      break;
    case 'bowler':
    case 'derby':
      R(c, cx - 4, hy, 8, 1, h);
      P(c, cx - 5, hy - 1, h);
      P(c, cx + 4, hy - 1, hd);
      R(c, cx - 3, hy - 3, 6, 3, h);
      R(c, cx - 2, hy - 4, 4, 1, h);
      R(c, cx - 3, hy - 1, 6, 1, shade(h, -0.45));
      P(c, cx - 2, hy - 3, hlit);
      break;
    case 'flat':
      R(c, cx - 6, hy, 12, 1, h);
      R(c, cx - 3, hy - 2, 6, 2, h);
      R(c, cx - 3, hy - 3, 6, 1, hlit);
      R(c, cx - 3, hy - 1, 6, 1, band);
      break;
    case 'bonnet': {
      // Prairie bonnet: a deep poke brim wider than the head frames the face.
      const w = L.child ? 12 : 10;
      const x0 = cx - w / 2;
      R(c, x0 + 1, hy - 2, w - 2, 1, h);
      R(c, x0, hy - 1, w, 2, h);
      R(c, x0, hy + 1, 1, 5, h);
      R(c, x0 + w - 1, hy + 1, 1, 5, hd);
      if (!back) {
        R(c, x0 + 1, hy, w - 2, 1, hlit); // stitched brim edge
        R(c, x0 + 1, hy + 1, 1, 4, hd); // inside of the brim in shade
        R(c, x0 + w - 2, hy + 1, 1, 4, hd);
        P(c, cx - 1, hy + (L.child ? 7 : 6), shade(h, -0.15)); // chin ribbon
        P(c, cx, hy + (L.child ? 7 : 6), shade(h, -0.15));
      } else {
        R(c, x0 + 1, hy + 1, w - 2, 4, h);
        R(c, x0 + 1, hy + 5, w - 2, 1, hd); // neck curtain
        R(c, x0 + 2, hy + 2, 1, 3, hlit);
      }
      break;
    }
    case 'cap':
      R(c, cx - 3 - kid, hy - 1, 6 + kid * 2, 2, h);
      R(c, cx - 2 - kid, hy - 2, 4 + kid * 2, 1, h);
      P(c, cx - 2, hy - 1, hlit);
      if (!back) R(c, cx - 3 - kid, hy + 1, 6 + kid * 2, 1, hd);
      break;
  }
}

// ---------------------------------------------------------------------------
// Side (facing right)
// ---------------------------------------------------------------------------

function paintSide(c: Ctx, L: HumanLook, C: Pal, p: PoseH, heads?: HeadLayer): void {
  const child = !!L.child;
  const lean = p.run ? 1 : 0;
  const stoop = isElder(L) ? 1 : 0;
  const cx = 9;
  const { headY, torsoY, legY, headH, torsoH, legH } = layout(L, p);
  const tx0 = child ? cx - 2 : L.build === 'slim' ? cx - 2 : L.build === 'stocky' ? cx - 3 : cx - 2;
  const tx1 = child ? cx + 1 : L.build === 'slim' ? cx + 1 : cx + 2; // inclusive
  const s = p.legA * (p.run ? 2.2 : 1.5);
  const coatLen = child ? 2 : 4;

  // Coat tails behind the body (swing opposite the stride).
  if (L.coat && !p.sit) {
    const tail = p.ride ? 2 : Math.round(Math.abs(s) * 0.7) + lean;
    R(c, tx0 - 1, torsoY + 2, 2, legY - torsoY - 2, C.coatD);
    R(c, tx0 - 1 - tail, legY, 3, coatLen, C.coat);
    R(c, tx0 - 1 - tail, legY + coatLen - 1, 3, 1, C.coatH);
  }
  // Long hair / braid hangs behind.
  if (p.ride) {
    // Seated: thigh forward, shin down the horse's flank, boot in the stirrup.
    R(c, cx - 1, legY, 5, 2, C.pants);
    R(c, cx + 2, legY + 2, 2, 3, C.pants);
    R(c, cx + 2, legY + 5, 3, 2, C.boots);
    P(c, cx + 2, legY + 5, C.bootsL);
    R(c, cx + 1, legY + 7, 4, 1, METAL); // stirrup tread
  } else if (L.skirt) {
    const sw = Math.round(p.legA);
    for (let y = legY - 1; y <= 23; y++) {
      const t = (y - legY + 1) / (23 - legY + 1);
      const f = Math.round(t * 1.6);
      const off = y >= 22 ? -sw : 0;
      R(c, tx0 - f + off, y, tx1 - tx0 + 1 + f * 2, 1, y === 23 ? mix(L.pants, DUST, 0.25) : L.pants);
    }
    R(c, tx0 + 1, legY + 1, 1, 22 - legY, shade(L.pants, 0.12));
    R(c, cx + 1 + sw, 24, 3, 1, C.boots);
    if (sw !== 0) R(c, cx - 1 - sw, 24, 2, 1, C.bootsD);
  } else if (p.sit) {
    R(c, cx - 2, legY, 6, 2, C.pants);
    R(c, cx + 3, legY + 2, 2, 3, C.pants);
    R(c, cx + 3, legY + 5, 3, 1, C.boots);
  } else {
    const bootH = child ? 1 : 2;
    const legLen = legH - bootH;
    const leg = (dx: number, pants: string, boots: string) => {
      const half = Math.round(dx / 2);
      const d = Math.round(dx);
      const knee = Math.ceil(legLen / 2);
      R(c, cx - 1 + half, legY, 3, knee, pants);
      R(c, cx - 1 + d, legY + knee, 2, legLen - knee, pants);
      R(c, cx - 1 + d, legY + legLen, 3, bootH, boots);
      if (bootH > 1) P(c, cx + 1 + d, legY + legLen, 'rgba(0,0,0,0)');
    };
    leg(-s, C.pantsD, C.bootsD); // far leg darker
    leg(s, C.pants, C.boots);
    P(c, cx - 1 + Math.round(s), legY + legLen, C.bootsL);
  }

  // Torso (leans into a run, belly on stocky men).
  const tX = tx0 + lean;
  const tW = tx1 - tx0 + 1;
  R(c, tX, torsoY + 1, tW, torsoH - 1, C.shirt);
  R(c, tX + (stoop ? 0 : 0), torsoY, tW - 1, 1, C.shirt);
  if (L.build === 'stocky' && !child && !L.skirt) R(c, tX + tW, torsoY + 3, 1, 3, C.shirt);
  if (L.skirt && !child) c.clearRect(tX + tW - 1, torsoY + torsoH - 2, 1, 2);
  if (stoop) R(c, tX - 1, torsoY, 1, 3, C.shirt); // rounded back
  if (L.vest) {
    R(c, tX, torsoY + 1, tW - 1, torsoH - 1, C.vest);
    P(c, tX + tW - 2, torsoY + 2, C.vestL);
  }
  if (L.coat) {
    R(c, tX, torsoY, tW - 1, legY - torsoY, C.coat);
    R(c, tX - 1, torsoY + 1, 1, legY - torsoY - 1, C.coatD);
    R(c, tX + tW - 2, torsoY, 1, 3, C.coatL); // lapel
    if (!p.ride) R(c, tX + tW - 2 + Math.max(0, Math.round(s * 0.5)), legY, 2, coatLen - 1, C.coat);
  }
  if (L.apron) {
    R(c, tX + tW - 1, torsoY + 1, 1, torsoH - 1, L.apron);
    R(c, tX + tW - 1, legY, 1, child ? 3 : 5, L.apron);
    P(c, tX - 1 + (L.coat ? 0 : 1), legY - 1, L.apron);
  }
  if (!L.skirt) R(c, tX, legY - 1, tW, 1, LEATHER_D);
  if (L.gunbelt && !child) {
    R(c, tX, legY, tW, 1, LEATHER);
    P(c, tX + 1, legY, BRASS);
    R(c, tX, legY, 2, 4, LEATHER_D); // holster on the hip
    R(c, tX, legY - 1, 2, 1, METAL); // grip
    P(c, tX + 1, legY - 1, METAL_L);
  }
  if (L.bandana) {
    R(c, tX + 1, torsoY, tW - 1, 1, L.bandana);
    P(c, tX + tW - 1, torsoY + 1, L.bandana);
  }
  if (L.badge) P(c, tX + tW - 2, torsoY + 2, BRASS);

  // Arm.
  const sleeve = L.coat ?? L.shirt;
  const rolled = !L.coat && !L.skirt && !child;
  const ax = cx - 1 + lean;
  const armLen = child ? 4 : 6;
  if (p.aim) {
    R(c, ax, torsoY + 1, 2, 2, sleeve);
    R(c, ax + 2, torsoY + 1, 4, 2, rolled ? C.skin : sleeve);
    R(c, ax + 6, torsoY + 1, 1, 2, C.skin);
    R(c, ax + 7, torsoY + 1, 3, 1, METAL); // barrel
    P(c, ax + 7, torsoY + 2, METAL); // grip
    P(c, ax + 8, torsoY + 1, METAL_L);
  } else if (p.hands) {
    R(c, ax, torsoY - 4, 2, 6, sleeve);
    R(c, ax, torsoY - 6, 2, 2, C.skin);
  } else if (p.ride) {
    // Upper arm down, forearm forward, fists low over the horn with the reins.
    const hb = Math.round(p.armA);
    R(c, ax, torsoY + 1, 2, 3, sleeve);
    R(c, ax + 1, torsoY + 4, 3, 2, rolled ? C.skin : sleeve);
    R(c, ax + 4, torsoY + 4 + hb, 2, 2, C.skin);
    // Reins sag forward toward the bit.
    R(c, ax + 6, torsoY + 5 + hb, 2, 1, LEATHER_D);
    R(c, ax + 8, torsoY + 6 + hb, 3, 1, LEATHER_D);
  } else if (p.reach) {
    // Working at chest height: forearm forward with a brush, stroke on alternate frames.
    const st = p.stroke ?? 0;
    R(c, ax, torsoY + 1, 2, 3, sleeve);
    R(c, ax + 1, torsoY + 3 + st, 3, 2, rolled ? C.skin : sleeve);
    R(c, ax + 4, torsoY + 3 + st, 2, 2, C.skin);
    R(c, ax + 6, torsoY + 2 + st, 1, 3, LEATHER);
    R(c, ax + 7, torsoY + 2 + st, 1, 3, '#c8b27a');
  } else {
    const a = p.armA * (p.run ? 1.6 : 1.3);
    const up = Math.round(a * 0.5);
    const lo = Math.round(a);
    const half = Math.ceil(armLen / 2);
    R(c, ax + up - 1, torsoY + 2, 1, armLen - 1, shade(L.vest && !L.coat ? L.vest : sleeve, -0.25));
    R(c, ax + up, torsoY + 1, 2, half, sleeve);
    if (rolled) P(c, ax + up, torsoY + half, shade(sleeve, 0.15));
    R(c, ax + lo, torsoY + 1 + half, 2, armLen - half, rolled ? C.skin : sleeve);
    R(c, ax + lo, torsoY + 1 + armLen, 2, 1, C.skin);
  }

  // Head (profile, facing right).
  const hx = cx - 2 + lean + stoop;
  const hwid = child ? 6 : 5;
  const hy = headY + stoop;
  emitHead(c, heads, (h) => paintHeadSide(h, L, C, hx, hy, hwid, headH));
}

function paintHeadSide(c: Ctx, L: HumanLook, C: Pal, hx: number, hy: number, hwid: number, headH: number): void {
  const child = !!L.child;
  R(c, hx, hy, hwid, headH - 1, C.skin);
  R(c, hx + 1, hy + headH - 1, hwid - 1, 1, C.skinD);
  c.clearRect(hx, hy, 1, 1);
  P(c, hx + hwid, hy + (child ? 3 : 2), C.skin); // nose
  if (!child) P(c, hx + hwid, hy + 3, C.skinD);
  const covered = L.hat !== 'none' && L.hat !== 'bonnet' && L.hat !== 'cap';
  if (covered) R(c, hx + 1, hy + 1, hwid - 1, 1, C.skinD);
  const H = C.hair;
  if (hairShows(L)) {
    if (covered) R(c, hx, hy, hwid - 1, 1, H); // the brim hides all but the back
    else {
      R(c, hx, hy, hwid, 2, H);
      R(c, hx + 1, hy - 1, hwid - 2, 1, H);
      P(c, hx + 2, hy - 1, C.hairL);
    }
    R(c, hx, hy, 2, child ? 5 : 4, H);
    switch (L.hairStyle) {
      case 'long':
        R(c, hx - 1, hy + 1, 2, headH + 1, H);
        break;
      case 'braid':
        for (let i = 0; i < (child ? 6 : 8); i++) P(c, hx - 1, hy + 2 + i, i % 2 ? C.hairD : H);
        P(c, hx - 1, hy + (child ? 8 : 10), '#c8b27a');
        break;
      case 'curly':
        R(c, hx - 1, hy, 1, 4, H);
        P(c, hx + 1, hy - 2, H);
        P(c, hx + 3, hy - 2, H);
        break;
      case 'bun':
        R(c, hx - 2, hy, 2, 2, H);
        P(c, hx - 2, hy, C.hairL);
        break;
    }
  } else {
    P(c, hx + 2, hy, C.skinL);
    if (L.facial !== 'none' || isElder(L)) R(c, hx, hy + 2, 1, 2, H);
  }
  P(c, hx + 1, hy + 3, C.skinD); // ear
  const eyeY = hy + (child ? 4 : 3);
  P(c, hx + hwid - 2, eyeY, EYE);
  if (luma(L.skin) < 0.32) {
    P(c, hx + hwid - 1, eyeY, C.skinL); // lit cheek in front of the eye
    P(c, hx + hwid - 3, eyeY + (child ? 2 : 1), C.skinL);
  }
  if (child) {
    P(c, hx + hwid - 2, eyeY + 1, EYE);
    P(c, hx + hwid - 3, eyeY + 2, C.rose);
  } else {
    if (L.skirt) P(c, hx + hwid - 1, eyeY - 1, EYE);
    if (isElder(L)) P(c, hx + hwid - 3, eyeY + 1, C.skinD);
    const fh = C.hair;
    switch (L.facial) {
      case 'mustache':
        R(c, hx + hwid - 2, hy + 4, 3, 1, fh);
        break;
      case 'beard':
        R(c, hx + 1, hy + 3, 1, 2, fh);
        R(c, hx + 2, hy + 4, hwid - 1, 2, fh);
        P(c, hx + hwid, hy + 4, fh);
        P(c, hx + hwid - 1, hy + 6, C.hairD);
        break;
      case 'goatee':
        R(c, hx + hwid - 2, hy + 5, 2, 2, fh);
        break;
      case 'stubble':
        R(c, hx + 2, hy + 5, hwid - 2, 1, mix(C.skin, C.hair, 0.4));
        P(c, hx + 1, hy + 4, mix(C.skin, C.hair, 0.4));
        break;
    }
  }
  // Hat in profile: brim forward, crown sits back on the head.
  const h = C.hat;
  const hd = C.hatD;
  const hl = C.hatL;
  switch (L.hat) {
    case 'cowboy':
    case 'cavalry':
      R(c, hx - 2, hy, hwid + 5, 1, h);
      P(c, hx - 3, hy - 1, h);
      P(c, hx + hwid + 3, hy + 1, h); // front brim dips over the eyes
      R(c, hx, hy - 3, hwid, 3, h);
      R(c, hx + 1, hy - 4, hwid - 2, 1, h);
      P(c, hx + 2, hy - 4, hd);
      R(c, hx, hy - 1, hwid, 1, L.hat === 'cavalry' ? BRASS : LEATHER_D);
      P(c, hx, hy - 3, hl);
      break;
    case 'sombrero':
      R(c, hx - 4, hy, hwid + 8, 1, h);
      P(c, hx - 5, hy - 1, h);
      P(c, hx + hwid + 4, hy - 1, h);
      R(c, hx + 1, hy - 4, 3, 4, h);
      P(c, hx + 2, hy - 5, h);
      R(c, hx + 1, hy - 1, 3, 1, shade(h, 0.35));
      break;
    case 'bowler':
    case 'derby':
      R(c, hx - 1, hy, hwid + 3, 1, h);
      R(c, hx, hy - 3, hwid, 3, h);
      R(c, hx + 1, hy - 4, hwid - 2, 1, h);
      R(c, hx, hy - 1, hwid, 1, shade(h, -0.45));
      P(c, hx + 1, hy - 3, hl);
      break;
    case 'flat':
      R(c, hx - 2, hy, hwid + 5, 1, h);
      R(c, hx, hy - 2, hwid, 2, h);
      R(c, hx, hy - 3, hwid, 1, hl);
      R(c, hx, hy - 1, hwid, 1, LEATHER_D);
      break;
    case 'bonnet':
      R(c, hx - 1, hy - 1, hwid + 1, 3, h);
      R(c, hx + hwid - 1, hy, 2, 3, hl); // poke brim around the face
      R(c, hx - 1, hy + 2, 2, 3, hd);
      break;
    case 'cap':
      R(c, hx, hy - 1, hwid, 2, h);
      R(c, hx + 1, hy - 2, hwid - 2, 1, h);
      R(c, hx + hwid - 1, hy + 1, 3, 1, hd);
      break;
  }
}

function render(L: HumanLook, C: Pal, dir: Dir, p: PoseH): HTMLCanvasElement | OffscreenCanvas {
  const cv = makeCanvas(PW, PH);
  const c = ctx2d(cv);
  const heads: ((c: Ctx) => void)[] = [];
  if (dir === 'side') paintSide(c, L, C, p, heads);
  else paintFront(c, L, C, p, dir === 'up', heads);
  autoShade(c, PW, PH, 0.85);
  // Head and hat on their own layer with a light rim pass, then composited.
  const hv = makeCanvas(PW, PH);
  const hc = ctx2d(hv);
  for (const fn of heads) fn(hc);
  autoShade(hc, PW, PH, 0.3);
  c.drawImage(hv as CanvasImageSource, 0, 0);
  // Fully opaque outline: characters must hold their shape over busy ground.
  pixelise(c, PW, PH, null, '#1a120c', 255);
  return cv;
}

function renderDead(L: HumanLook, C: Pal): HTMLCanvasElement | OffscreenCanvas {
  const cv = makeCanvas(PW + 8, PH);
  const c = ctx2d(cv);
  // Lying on the ground, rotated side view.
  c.save();
  c.translate(PW / 2 + 4, PH - 6);
  c.rotate(-Math.PI / 2);
  c.translate(-9, -14);
  paintSide(c, { ...L, hat: 'none' }, C, { legA: 0, armA: 0, bob: 0 });
  c.restore();
  pixelise(c, PW + 8, PH, null, '#1a120c', 220);
  return cv;
}

const cache = new Map<string, HumanSpriteSet>();

/** All animation frames for a look; cached by the look's content. */
export function humanSprites(L: HumanLook): HumanSpriteSet {
  const key = JSON.stringify(L);
  const hit = cache.get(key);
  if (hit) return hit;
  const C = palette(L);
  const walk = [0, 1, 0, -1];
  const dirs: Dir[] = ['down', 'up', 'side'];
  const frames = {} as HumanSpriteSet['frames'];
  for (const d of dirs) {
    const r = (p: PoseH) => render(L, C, d, p);
    frames[d] = {
      idle: [r({ legA: 0, armA: 0, bob: 0 }), r({ legA: 0, armA: 0, bob: L.child ? 0 : 1 })],
      // Contact frames (legs apart) sit a pixel lower than passing frames.
      walk: walk.map((w) => r({ legA: w, armA: -w * 0.8, bob: w !== 0 ? 1 : 0 })),
      run: walk.map((w) => r({ legA: w * 1.4, armA: -w * 1.4, bob: w !== 0 ? 1 : 0, run: true })),
      shoot: [r({ legA: 0, armA: 0, bob: 0, aim: true })],
      ride: [r({ legA: 0, armA: 0, bob: 0, ride: true }), r({ legA: 0, armA: 1, bob: 0, ride: true })],
      dead: [renderDead(L, C)],
      surrender: [r({ legA: 0, armA: 0, bob: 0, hands: true })],
      interact: [r({ legA: 0, armA: 0, bob: 0, reach: true, stroke: 0 }), r({ legA: 0, armA: 0, bob: 1, reach: true, stroke: 1 })],
      sit: [r({ legA: 0, armA: 0, bob: 2, sit: true })],
    };
  }
  const set = { frames };
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  cache.set(key, set);
  return set;
}

export const SKIN_TONES = ['#f1d0b4', '#e3b48f', '#c98f66', '#a96e4b', '#8a5638', '#6b3f28', '#4e2e1f'];
export const HAIR_COLORS = ['#1b1410', '#3a2618', '#5e3c22', '#8a5a30', '#b98a4e', '#d9c08a', '#8e3b1e', '#9c9a95', '#d8d6d0'];
