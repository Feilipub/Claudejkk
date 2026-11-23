/**
 * People sprites, hand-pixelled. Each body part (head, hair per style, hat per
 * type, torso per build, arms and legs per pose) is a text grid drawn once in
 * this file; a frame is assembled from parts on a 20×28 char buffer, traced
 * with a per-material dark outline and palette-swapped per HumanLook (see
 * humanPixel.ts for the letter legend and the tools).
 *
 * Style (our own 1888 frontier cast, after the art bible): big head (~45% of
 * the figure), 2×2 eyes with a lash row over white + iris, hair as a 3-tone
 * mass, flat clothing with one shadow and one highlight, light from the
 * upper-left, feet on row 24 (the anchor every caller relies on).
 */
import { PAL } from './pixmap.ts';
import { mix, shade } from './pixel.ts';
import { BH, BW, OUTLINE, dropRow, lift, newBuf, outline, rotCCW, stamp, toCanvas, type Buf, type Grid } from './humanPixel.ts';

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
   * Optional: child proportions (same big head, short body and limbs, no
   * facial hair or gunbelt). Callers that also scale children down may want a
   * milder scale (~0.85) when this is set.
   */
  child?: boolean;
}

export type HumanAnim = 'idle' | 'walk' | 'run' | 'shoot' | 'ride' | 'dead' | 'surrender' | 'interact' | 'sit';
export type Dir = 'down' | 'up' | 'side';

export interface HumanSpriteSet {
  frames: Record<Dir, Record<HumanAnim, (HTMLCanvasElement | OffscreenCanvas)[]>>;
}

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
    const base = mix(hair, '#3a3346', dark ? 0.6 : 0.45);
    return { hair: base, hairL: mix(base, '#8a7ea0', dark ? 0.55 : 0.45), hairD: mix(hair, '#1c1822', 0.4) };
  }
  if (hair !== WHITE_HAIR && hair !== GREY_HAIR && Math.abs(lh - luma(skin)) < 0.14) {
    // Fair hair on fair skin: deepen the body of the hair to a gold-brown and
    // keep the original colour as its highlight, so it doesn't melt into the face.
    const base = mix(hair, '#8a6430', 0.42);
    return { hair: base, hairL: hair, hairD: shade(base, -0.3) };
  }
  return { hair, hairL: shade(hair, hair === WHITE_HAIR ? 0.2 : 0.24), hairD: shade(hair, -0.28) };
}

// ===========================================================================
// Drawings. Coordinates: adult face grid at (4, 3); hair/hat grids start one
// row above the hair line (y = hy0, adult 1, child 5); torso y13..18 (belt on
// 18), hips 19, legs 20..24. Child: torso 17..20, legs 21..24.
// ===========================================================================

// ---- Heads ----------------------------------------------------------------
/** Front face 12×10 (columns 0 and 11 are the ears). */
const FACE_FRONT: Grid = [
  '...SSssss...',
  '..SSsssssz..',
  '.sSSsssssz..',
  '.sSsssssssz.',
  '.sssssssssz.',
  'ssseesseeszz',
  'zssWissiWszz',
  '.s!ssszss!z.',
  '..sssmmssz..',
  '...zzzzzz...',
];
const FACE_BACK: Grid = [
  '...SSssss...',
  '..SSsssssz..',
  '.sSSsssssz..',
  '.sSsssssssz.',
  '.sssssssssz.',
  'sssssssssszz',
  'zsssssssszzz',
  '.sssssssszz.',
  '..sssssszzz.',
  '...zzzzzz...',
];
/** Profile 10×10, facing right (nose at column 9). */
const FACE_SIDE: Grid = [
  '..SSssss..',
  '.SSsssssz.',
  'sSSsssssz.',
  'sSssssssss',
  'sssssssss.',
  'sssZzsees.',
  'ssszzsWiss',
  'zsssss!ss.',
  '.zsssssms.',
  '..zzzzzz..',
];

// ---- Hair (front 14 wide at x3; side 12 wide at x4; back 14 wide at x3) ----
type HairSet = { front: Grid; side: Grid; back: Grid };
const HAIR: Record<Exclude<HumanLook['hairStyle'], 'bald'>, HairSet> = {
  short: {
    front: [
      '....hhhhhh....',
      '...hHHHhhhhy..',
      '..hHHhhhhhhyy.',
      '..hHhhhhhhhhy.',
      '..hhhhhhyhhhy.',
      '..hhhy.hh.yhy.',
      '..hy.......yy.',
      '..y........y..',
    ],
    side: [
      '...hhhhhh...',
      '..hHHHhhhh..',
      '.hHHhhhhhhh.',
      '.hHhhhhhhhy.',
      '.hhhhhhhhy..',
      '.hhhhhy.....',
      '.hhhy.......',
      '.hhy........',
      '.hy.........',
      '.y..........',
    ],
    back: [
      '....hhhhhh....',
      '...hHHHhhhhy..',
      '..hHHhhhhhhyy.',
      '..hHhhhhhhhhy.',
      '..hhhhhhhhhhy.',
      '..hhhhhhhhhhy.',
      '..hhhhhhhhhyy.',
      '..hhhhhhhhhyy.',
      '..yhhhhhhhhyy.',
      '...yyhhhhyyy..',
    ],
  },
  long: {
    front: [
      '....hhhhhh....',
      '...hHHHhhhhy..',
      '..hHHhhhhhhyy.',
      '.hHHhhhhhhhhy.',
      '.hHhhhhyyhhhyy',
      '.hHhhy...yhhyy',
      '.hHhy.....yhy.',
      '.hHh.......hy.',
      '.hh........hy.',
      '.hh........hy.',
      '.hh........yy.',
      '.hh........hy.',
      '.hh........yy.',
      '.hy........yy.',
      '..y........y..',
    ],
    side: [
      '...hhhhhh...',
      '..hHHHhhhh..',
      '.hHHhhhhhhh.',
      '.hHhhhhhhhy.',
      '.hhhhhhhhy..',
      '.hHhhhy.....',
      '.hHhhy......',
      '.hhhy.......',
      '.hhy........',
      '.hhy........',
      '.hhy........',
      '.hy.........',
      '.yy.........',
    ],
    back: [
      '....hhhhhh....',
      '...hHHHhhhhy..',
      '..hHHhhhhhhyy.',
      '.hHHhhhhhhhhy.',
      '.hHhhhhhhhhhyy',
      '.hHhhhhhhhhhyy',
      '.hhhhhhhhhhhyy',
      '.hhhhhhhhhhhy.',
      '.hhhhhhhhhhyy.',
      '.hhhhhhhhhhyy.',
      '.hhhhhyhhhhyy.',
      '.hhhhhyhhhyyy.',
      '.hhhhyyhhhyyy.',
      '..yhyy.yhyyy..',
      '...y......y...',
    ],
  },
  bun: {
    front: [
      '.....Hhhy.....',
      '...hhHyyhhy...',
      '..hHHhhhhhhy..',
      '..hHhhhhhhhhy.',
      '..hhhhhyyhhhy.',
      '..hhhy...yhhy.',
      '..hy......yh..',
      '..h........y..',
    ],
    side: [
      '...hhhhhh...',
      '..hHHHhhhh..',
      '.hHHhhhhhhh.',
      'hHHhhhhhhhy.',
      'Hhhhhhhhhy..',
      'hhyhhhy.....',
      'yyhhhy......',
      '.hhhy.......',
      '.hhy........',
      '.hy.........',
    ],
    back: [
      '....hhhhhh....',
      '...hHHHhhhhy..',
      '..hHHhhhhhhyy.',
      '..hHhhhhhhhhy.',
      '..hhhhhhhhhhy.',
      '..hhhhHHhhhhy.',
      '..hhhHhhhyhyy.',
      '..hhhhhyyyhyy.',
      '..yhhhhhhhhyy.',
      '...yyhhhhyyy..',
    ],
  },
  braid: {
    front: [
      '....hhhhhh....',
      '...hHHHhhhhy..',
      '..hHHhhhhhhyy.',
      '..hHhhhhhhhhy.',
      '..hhhhhyyhhhy.',
      '..hhhy...yhhy.',
      '..hHy.....yh..',
      '.hHh.......y..',
      '.hh...........',
      '.yh...........',
      '.hy...........',
      '.yh...........',
      '.hy...........',
      '..Y...........',
    ],
    side: [
      '...hhhhhh...',
      '..hHHHhhhh..',
      '.hHHhhhhhhh.',
      '.hHhhhhhhhy.',
      '.hhhhhhhhy..',
      '.hhhhhy.....',
      '.hhhy.......',
      '.hhy........',
      '.hy.........',
      '.yh.........',
      '.hy.........',
      '.yh.........',
      '.hy.........',
      '..Y.........',
    ],
    back: [
      '....hhhhhh....',
      '...hHHHhhhhy..',
      '..hHHhhhhhhyy.',
      '..hHhhhhhhhhy.',
      '..hhhhhhhhhhy.',
      '..hhhhhhhhhhy.',
      '..hhhhhyhhhyy.',
      '..hhhhhyhhhyy.',
      '..yhhhhyhhhyy.',
      '...yyhHhhyyy..',
      '......hy......',
      '......yh......',
      '......hy......',
      '......yh......',
      '......Y.......',
    ],
  },
  curly: {
    front: [
      '...h.hhhh.h...',
      '..hHhHhhhhhy..',
      '.hHHHhhhhhhyy.',
      '.hHhhhhhhhhhyy',
      'hhHhhhyhhhhhyy',
      '.hhhh.hh.hhyy.',
      '.hhh.......yy.',
      '.hh........yy.',
      '..h........y..',
    ],
    side: [
      '..h.hhhh.h..',
      '.hHhHhhhhhh.',
      'hHHHhhhhhhhy',
      'hHhhhhhhhhy.',
      'hhhhhhhhhy..',
      'hhhhhhy.....',
      'hhhhy.......',
      'hhhy........',
      '.hhy........',
      '.yy.........',
    ],
    back: [
      '...h.hhhh.h...',
      '..hHhHhhhhhy..',
      '.hHHHhhhhhhyy.',
      '.hHhhhhhhhhhyy',
      'hhHhhhhhhhhhyy',
      '.hhhhhhhhhhhyy',
      'hhhhhhhhhhhyyy',
      '.hhhhhhhhhhyy.',
      '.hhhhhhhhhhyy.',
      '..yhyhhyhyyy..',
    ],
  },
};
/** Bald men keep a fringe above the ears (front, side, back). */
const BALD_FRINGE: HairSet = {
  front: ['', '', '', '', '', '', '..h........y..', '..y........y..'],
  side: ['', '', '', '', '', '', '.hhy........', '.hy.........', '.y..........'],
  back: ['', '', '', '', '', '', '', '', '..yhhhhhhhhyy.', '...yyhhhhyyy..'],
};

// ---- Facial hair (front 12 wide at x4, side 10 wide at x5; first row = y9) --
const FACIAL: Record<Exclude<HumanLook['facial'], 'none'>, { front: Grid; side: Grid }> = {
  mustache: {
    front: ['', '....hhhy....', '....y..y....'],
    side: ['', '.......hy.', '........y.'],
  },
  beard: {
    front: ['.h........y.', '.hh.hhhy.yy.', '.hhhh..hhyy.', '..hhhhhhyy..', '...yhhhyy...'],
    side: ['....h.....', '....hh.hy.', '..hhhhh.h.', '...hhhhhy.', '....yhhy..'],
  },
  goatee: {
    front: ['', '....hhhy....', '............', '.....hy.....', '.....yy.....'],
    side: ['', '.......hy.', '..........', '......hy..', '......y...'],
  },
  stubble: {
    front: ['', '', '..__....__..', '...______...'],
    side: ['', '', '..____....', '...____...'],
  },
};

// ---- Hats (row 0 = y1 for adults) -------------------------------------------
type HatSet = { front: Grid; fx: number; side: Grid; sx: number; back?: Grid };
const HATS: Record<Exclude<HumanLook['hat'], 'none'>, HatSet> = {
  cowboy: {
    fx: 2,
    front: [
      '......TTrr......',
      '....TTtrtttr....',
      '.t..RRRRRRRR..r.',
      '.TTttttttttttrr.',
      '....zzzzzzzz....',
    ],
    sx: 1,
    side: [
      '......TTtr......',
      '.....TTrttr.....',
      't....RRRRRR....r',
      '.TTtttttttttttr.',
      '........zzzzz...',
    ],
  },
  cavalry: {
    fx: 2,
    front: [
      '......TTrr......',
      '....TTtr+ttr....',
      '.t..********..r.',
      '.TTttttttttttrr.',
      '....zzzzzzzz....',
    ],
    sx: 1,
    side: [
      '......TTtr......',
      '.....TTtttr.....',
      't....******....r',
      '.TTtttttttttttr.',
      '........zzzzz...',
    ],
  },
  bowler: {
    fx: 4,
    front: ['...TTtttr...', '..TTttttrr..', '..RRRRRRRR..', 'tTtttttttrrr', '..zzzzzzzz..'],
    sx: 3,
    side: ['....TTtr....', '...TTtttr...', '...RRRRRR...', '.TTtttttttr.', '.....zzzzz..'],
  },
  derby: {
    fx: 4,
    front: ['...TTtttr...', '..TTttttrr..', '..RRRRRRRR..', 'tTtttttttrrr', '..zzzzzzzz..'],
    sx: 3,
    side: ['....TTtr....', '...TTtttr...', '...RRRRRR...', '.TTtttttttr.', '.....zzzzz..'],
  },
  sombrero: {
    fx: 1,
    front: [
      '.......TTtr.......',
      '......TTttrr......',
      't.....R+R+RR.....r',
      '.TTttttttttttttrr.',
      '..rrrrrrrrrrrrrr..',
      '....zzzzzzzzzz....',
    ],
    sx: 1,
    side: [
      '......TTtr........',
      '.....TTttrr.......',
      't....R+R+RR......r',
      '.TTttttttttttttrr.',
      '..rrrrrrrrrrrrrr..',
      '........zzzzz.....',
    ],
  },
  bonnet: {
    fx: 2,
    front: [
      '....TTttttrr....',
      '...TTttttttrr...',
      '..TTTTTTTTTTTr..',
      '..Tr........rr..',
      '..Tr........rr..',
      '..tr........rr..',
      '..tr........rr..',
      '..tr........rt..',
      '..tr........rt..',
      '..tt........rt..',
      '...t........t...',
      '.......rr.......',
    ],
    sx: 2,
    side: [
      '....TTttr.....',
      '..TTttttttr...',
      '.TTttttttttT..',
      '.Ttttttt...T..',
      '.tttttt....T..',
      '.tttttt....T..',
      '.ttttt.....r..',
      '.ttttt.....r..',
      '.tttrr.....r..',
      'ttttrr........',
      'rrrr..........',
    ],
    back: [
      '....TTttttrr....',
      '...TTttttttrr...',
      '..TTttttttttrr..',
      '..Ttttttttttrr..',
      '..ttttttttttrr..',
      '..ttttttttttrr..',
      '..ttttttttttrr..',
      '..ttttttttttrr..',
      '..ttttttttrrrr..',
      '.tttttttttttrrr.',
      '.rrrrrrrrrrrrrr.',
    ],
  },
  cap: {
    fx: 4,
    front: ['', '...TTtttr...', '..TTttttrr..', '.TTtttttttr.', '..rrrrrrrr..', '...zzzzzz...'],
    sx: 4,
    side: ['', '...TTtttr...', '..TTtttttr..', '.Ttttttttrrr', '.........zz.'],
  },
  flat: {
    fx: 2,
    front: ['....TTttttrr....', '....Ttttttrr....', '....RRRRRRRR....', 'TTtttttttttttrrr', '....zzzzzzzz....'],
    sx: 1,
    side: ['.....TTttr......', '.....Ttttr......', '.....RRRRR......', 'TTtttttttttttrr.', '........zzzzz...'],
  },
};
/** Hats with a crown that hides the top of the hair. */
const HIDES_HAIR = new Set(['cowboy', 'cavalry', 'bowler', 'derby', 'sombrero', 'flat', 'cap']);

// ---- Bodies -----------------------------------------------------------------
type Build = 'slim' | 'average' | 'stocky' | 'child';
interface BodyDef {
  tx: number; // torso left x (front/back)
  front: Grid;
  back: Grid;
  sx: number; // torso left x (side)
  side: Grid;
  hips: Grid; // front/back hips row(s) at tx
  hipsX: number;
  legL: Grid;
  legLX: number;
  legR: Grid;
  legRX: number;
  armL: Grid;
  armR: Grid;
  coat: Grid;
  coatX: number;
  coatBack: Grid;
  coatSide: Grid;
}
const BODY: Record<Build, BodyDef> = {
  average: {
    tx: 6,
    front: ['wVCCCCvw', 'wVvCxvvw', 'wvvcxvvw', 'wvvcxvww', 'wvwcxwww', 'lll+*lll'],
    back: ['wVvvvvvw', 'wVvvvvvw', 'wvvvvvww', 'wvvvvvww', 'wvvwwwww', 'llllllll'],
    sx: 7,
    side: ['wVvwC', 'wvvwc', 'wvvwc', 'wvvwc', 'wvwwx', 'lllll'],
    hips: ['Pppnnppn'],
    hipsX: 6,
    legL: ['Ppn', 'Ppn', 'Ppn', 'Bbd', 'bbd'],
    legLX: 6,
    legR: ['ppn', 'ppn', 'pnn', 'Bbd', 'bdd'],
    legRX: 11,
    armL: ['UU', 'Uu', 'Uu', 'Uu', '12', '12', 'Ss'],
    armR: ['uj', 'uj', 'uj', 'jj', '23', '23', 'sz'],
    coatX: 6,
    coat: ['QQ....qg', 'QQ....qg', 'Qq....qg', 'Qq....gg', 'qq....gg', 'qq....gg', 'qq....gg', 'qg....gg', 'gg....gg'],
    coatBack: ['QQqqqqqg', 'Qqqqqqqg', 'Qqqqqqgg', 'qqqqqqgg', 'qqqqqqgg', 'qqqqqggg', 'qqqgqggg', 'qqqgqggg', 'gggggggg'],
    coatSide: ['.QQq..', '.Qqq..', '.qqq..', '.qqg..', '.qqg..', '.qqg..', 'qqgg..', 'qgg...', 'gg....'],
  },
  slim: {
    tx: 7,
    front: ['wCCCCw', 'wVCxvw', 'wvcxvw', 'wvcxww', 'wwcxww', 'll+*ll'],
    back: ['wVvvvw', 'wVvvvw', 'wvvvww', 'wvvvww', 'wvwwww', 'llllll'],
    sx: 8,
    side: ['VvwC', 'vvwc', 'vvwc', 'vvwc', 'vwwx', 'llll'],
    hips: ['Ppnnpn'],
    hipsX: 7,
    legL: ['.Pp', '.Pp', '.Pn', 'Bbd', 'bbd'],
    legLX: 6,
    legR: ['pn.', 'pn.', 'nn.', 'Bbd', 'bdd'],
    legRX: 11,
    armL: ['UU', 'Uu', 'Uu', 'Uu', '12', '12', 'Ss'],
    armR: ['uj', 'uj', 'uj', 'jj', '23', '23', 'sz'],
    coatX: 7,
    coat: ['QQ..qg', 'QQ..qg', 'Qq..qg', 'Qq..gg', 'qq..gg', 'qq..gg', 'qq..gg', 'qg..gg', 'gg..gg'],
    coatBack: ['QQqqqg', 'Qqqqqg', 'Qqqqgg', 'qqqqgg', 'qqqqgg', 'qqqggg', 'qqgqgg', 'qqgqgg', 'gggggg'],
    coatSide: ['..QQ..', '..Qq..', '..qq..', '..qg..', '..qg..', '..qg..', '.qqg..', '.qg...', 'gg....'],
  },
  stocky: {
    tx: 5,
    front: ['wVvCCCCvvw', 'wVvvCxvvvw', 'wvvvcxvvww', 'wvvvcxvvww', 'wvvwcxwwww', 'llll+*llll'],
    back: ['wVvvvvvvvw', 'wVvvvvvvvw', 'wvvvvvvvww', 'wvvvvvvvww', 'wvvvwwwwww', 'llllllllll'],
    sx: 7,
    side: ['wVvwC.', 'wvvwcc', 'wvvwcc', 'wvvwcc', 'wvwwxx', 'llllll'],
    hips: ['Ppppnnpppn'],
    hipsX: 5,
    legL: ['Pppn', 'Pppn', 'Pppn', 'Bbbd', 'bbbd'],
    legLX: 5,
    legR: ['pppn', 'pppn', 'ppnn', 'Bbbd', 'bbdd'],
    legRX: 11,
    armL: ['UU', 'Uu', 'Uu', 'Uu', '12', '12', 'Ss'],
    armR: ['uj', 'uj', 'uj', 'jj', '23', '23', 'sz'],
    coatX: 5,
    coat: ['QQq....qgg', 'QQq....qgg', 'Qqq....qgg', 'Qqq....ggg', 'qqq....ggg', 'qqq....ggg', 'qqq....ggg', 'qqg....ggg', 'ggg....ggg'],
    coatBack: ['QQqqqqqqqg', 'Qqqqqqqqqg', 'Qqqqqqqqgg', 'qqqqqqqqgg', 'qqqqqqqqgg', 'qqqqqqqggg', 'qqqqgqqggg', 'qqqqgqqggg', 'gggggggggg'],
    coatSide: ['.QQq...', '.Qqq...', '.qqq...', '.qqg...', '.qqg...', '.qqg...', 'qqgg...', 'qgg....', 'gg.....'],
  },
  child: {
    tx: 7,
    front: ['wCCCCw', 'wvcxvw', 'wvcxww', 'll+*ll'],
    back: ['wVvvvw', 'wvvvww', 'wvvwww', 'llllll'],
    sx: 8,
    side: ['VvwC', 'vvwc', 'vwwx', 'llll'],
    hips: [],
    hipsX: 7,
    legL: ['.Pp', '.Pn', 'Bbd', 'bbd'],
    legLX: 6,
    legR: ['pn.', 'nn.', 'Bbd', 'bdd'],
    legRX: 11,
    armL: ['UU', 'Uu', '12', 'Ss'],
    armR: ['uj', 'jj', '23', 'sz'],
    coatX: 7,
    coat: ['QQ..qg', 'Qq..qg', 'qq..gg', 'qq..gg', 'qg..gg'],
    coatBack: ['QQqqqg', 'Qqqqgg', 'qqqggg', 'qqgqgg', 'gggggg'],
    coatSide: ['..QQ..', '..qq..', '..qg..', '.qqg..', '.gg...'],
  },
};

// ---- Side legs (10+ wide at x4, first row = hips) ---------------------------
const SIDE_LEGS: Record<'stand' | 'contactA' | 'pass' | 'contactB' | 'runA' | 'runB', Grid> = {
  stand: ['...Ppppn..', '....Ppn...', '....Ppn...', '....ppn...', '....Bbbb..', '....bbbd..'],
  contactA: ['...Ppppn..', '..nnPppn..', '..nn..Ppn.', '.nn....Ppn', 'ddd....Bbbb', 'dd.....bbbd'],
  pass: ['...Ppppn..', '...nPppn..', '...nPpn...', '..ddppn...', '....Bbbb..', '....bbbd..'],
  contactB: ['...Ppppn..', '..Ppnnn...', '..Pp..nnn.', '.Pp....nnn', 'BBb....dddd', 'bb.....dddd'],
  runA: ['...Ppppn...', '..nnPpppn..', '.nnd...Ppn.', 'ddd.....Ppn', '........Bbbb', '........bbbd'],
  runB: ['...Ppppn...', '..PPpnnnn..', '.PpB...nnn.', 'BBb.....nnn', '........dddd', '........dddd'],
};
const SIDE_LEGS_CHILD: Record<keyof typeof SIDE_LEGS, Grid> = {
  stand: ['....Ppn...', '....Ppn...', '....Bbbb..', '....bbbd..'],
  contactA: ['...nPpn...', '..nn..Pn..', '.dd....Bbb', '.dd....bbd'],
  pass: ['...nPpn...', '...dPpn...', '....Bbbb..', '....bbbd..'],
  contactB: ['...Ppnn...', '..Pp..nn..', '.Bb....ddd', '.bb....ddd'],
  runA: ['...nPppn..', '.ndd...Pn.', '.......Bbb', '.......bbd'],
  runB: ['...PPnnn..', '.PBB...nn.', '.......ddd', '.......ddd'],
};

// ---- Side arms (adult rows y13..19; child y17..20) ---------------------------
const SIDE_ARM = {
  hang: ['Uj', 'Uj', 'uj', 'uj', '12', '23', 'Sz'],
  fwd: ['Uj..', 'Uj..', '.uj.', '.uj.', '..12', '..23', '..Sz'],
  back: ['..Uj', '..Uj', '.uj.', '.uj.', '12..', '23..', 'Sz..'],
};
const SIDE_ARM_CHILD = {
  hang: ['Uj', 'uj', '23', 'Sz'],
  fwd: ['Uj.', '.uj', '.23', '.Sz'],
  back: ['.Uj', 'uj.', '23.', 'Sz.'],
};
/** Far-side copy of a grid, pushed into shadow. */
function far(g: Grid): Grid {
  const m: Record<string, string> = { U: 'j', u: 'j', '1': '3', '2': '3', S: 'z', s: 'z', z: 'Z', P: 'n', p: 'n', B: 'd', b: 'd' };
  return g.map((r) => r.replace(/[Uu12SszPpBb]/g, (c) => m[c] ?? c));
}

// ---- Extras -----------------------------------------------------------------
const SKIRT_FRONT: Grid = [
  '..::::::::..',
  '..PPpppppn..',
  '.PPppppppnn.',
  '.PPpppnppnn.',
  'PPppppnpppnn',
  'Pppppppnppnn',
  'nnnnnnnnnnnn',
];
const SKIRT_SIDE: Grid = ['..::::..', '..PPppn.', '.PPpppn.', '.PPpppnn', 'PPpppnnn', 'Pppppnnn', 'nnnnnnnn'];
const SKIRT_CHILD_FRONT: Grid = ['..PPppn...', '.PPpppnn..', 'PPppppnnn.', 'nnnnnnnnn.'];
const SKIRT_CHILD_SIDE: Grid = ['.PPpn.', 'PPppnn', 'nnnnnn'];

const APRON_FRONT: Grid = ['.O..O.', '.AAaa.', '.Aaaa.', '.Aaaa.', '.aaaO.', 'OOOOOO', 'AAaaaO', 'Aaaaaa', 'AaaaaO', 'OOOOOO'];
const APRON_SIDE: Grid = ['a', 'A', 'a', 'a', 'O', 'Aa', 'aa', 'aO', 'OO'];

const BANDANA_FRONT: Grid = ['KKkkkX', '.Kkkk.', '..kX..'];
const BANDANA_SIDE: Grid = ['Kkkk', '..kX'];
const BANDANA_BACK: Grid = ['KkkkkX'];

/** Holster on the right hip (viewer's left in the front view). */
const GUNBELT_FRONT = (w: number): Grid => ['I' + '.'.repeat(w), 'G' + 'l*'.repeat(Math.ceil(w / 2)).slice(0, w), 'll', 'll', 'l.'];
const GUNBELT_SIDE: Grid = ['.GI..', 'llll*', '.ll..', '.ll..', '.l...'];

// ---- Poses: arms ----------------------------------------------------------
const RIDE_L: Grid = ['Uu....', 'Uu....', 'uj....', '.uj1..', '..12Ss'];
const RIDE_R: Grid = ['....uj', '....uj', '....jj', '..32j.', 'sz32..'];
const SHOOT_L: Grid = ['Uu...', 'Uu...', '.Uu..', '..u12', '...1S'];
const SHOOT_R: Grid = ['...uj', '...uj', '..uj.', '23j..', 'sz...'];
const SHOOT_GUN: Grid = ['GG', 'GI'];
const UP_L: Grid = ['Ss.', '12.', 'Uu.', 'Uu.', 'Uu.', 'Uu.', 'Uu.', '.Uu', '.uj'];
const UP_R: Grid = ['.sz', '.23', '.uj', '.uj', '.uj', '.uj', '.uj', 'uj.', 'jj.'];
const UP_L_CHILD: Grid = ['Ss.', 'Uu.', 'Uu.', 'Uu.', '.Uu', '.uj'];
const UP_R_CHILD: Grid = ['.sz', '.uj', '.uj', '.uj', 'uj.', 'jj.'];
/** Brushing across the body (front), two strokes. */
const REACH_R = [
  ['....uj', '....uj', '..2uuj', 'Lsz2j.', '%%....'],
  ['....uj', '....uj', '....uj', '.L2uj.', '%sz...', '%.....'],
];
const SIDE_REACH = [
  ['Uj....', 'Uj....', '.uj...', '..u12S', '.....L', '.....%', '.....%'],
  ['Uj....', 'Uj....', '.uj...', '.uj...', '..u12S', '.....L', '.....%'],
];
const SIDE_SHOOT: Grid = ['Uj.........', 'Uuuuu12SGGGI', 'uj.....zG...'];
const SIDE_RIDE_ARM: Grid = ['Uj....', 'Uj....', 'uj....', '.u12..', '..23Sz', '.....ll', '.......ll'];
const SIDE_UP: Grid = ['..Sz', '..23', '..uj', '..uj', '..uj', '..uj', '.uj.', '.uj.', 'Uj..'];
const SIDE_RIDE_LEGS: Grid = ['...PPppppn', '...nPppppn', '.......Ppn', '.......Ppn', '.......Bbbd', '......GGGGG'];
const FRONT_RIDE_LEGS: Grid = ['..Pppppppppppn..', '.Ppn........ppn.'];
const SIDE_SIT_LEGS: Grid = ['...PPppppn', '........Ppn', '........Ppn', '.......Bbbd'];

// ===========================================================================
// Colours
// ===========================================================================
const SKIN_RAMPS = [
  [PAL.skinA0, PAL.skinA1, PAL.skinA2, PAL.skinA3],
  [PAL.skinB0, PAL.skinB1, PAL.skinB2, PAL.skinB3],
  [PAL.skinC0, PAL.skinC1, PAL.skinC2, PAL.skinC3],
  [PAL.skinD0, PAL.skinD1, PAL.skinD2, PAL.skinD3],
];
const IRISES = ['#4a2e1c', '#5a3a20', '#3a2616', '#6a4a2a', '#4a2e1c', '#5a3a20', '#3a5a8a', '#4a6a3a', '#3a6a7a'];

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Three tones (light, base, shadow) + outline for one material. */
function tones(base: string): [string, string, string, string] {
  const l = luma(base);
  const L = shade(base, l < 0.18 ? 0.3 : l > 0.75 ? 0.12 : 0.2);
  const D = shade(base, l > 0.75 ? -0.18 : -0.3);
  const O = shade(base, l < 0.18 ? -0.55 : -0.68);
  return [L, base, D, O];
}

/** Skin ramp anchored on the nearest PAL skin ramp so every tone shares one hue family. */
export function skinTones(skin: string): { S: string; s: string; z: string; Z: string; o: string } {
  const lv = luma(skin);
  let best = SKIN_RAMPS[0]!;
  let bd = Infinity;
  for (const r of SKIN_RAMPS) {
    const d = Math.abs(luma(r[2]!) - lv);
    if (d < bd) {
      bd = d;
      best = r;
    }
  }
  const dark = lv < 0.36;
  return {
    S: mix(skin, best[3]!, 0.55),
    s: skin,
    z: mix(skin, best[1]!, dark ? 0.5 : 0.62),
    Z: mix(skin, best[0]!, 0.7),
    o: mix(best[0]!, PAL.ink, dark ? 0.55 : 0.35),
  };
}

export function keyFor(L: HumanLook, rolled: boolean): Record<string, string> {
  const k: Record<string, string> = {};
  const sk = skinTones(L.skin);
  const fem = L.skirt;
  const hr = readableHair(L.hair, L.skin);
  k.S = sk.S;
  k.s = sk.s;
  k.z = sk.z;
  k.Z = sk.Z;
  k.e = '#2a1a22';
  k.W = '#f6eedc';
  k.i = IRISES[hashStr(L.skin + L.hair + L.shirt + L.pants) % (luma(L.skin) < 0.4 ? 4 : IRISES.length)]!;
  k['!'] = fem || L.child ? mix(L.skin, '#e2705e', luma(L.skin) < 0.36 ? 0.3 : 0.38) : L.skin;
  k.m = fem ? mix(sk.z, '#a83a44', 0.45) : mix(sk.z, sk.Z, 0.5);
  k._ = mix(L.skin, hr.hairD, 0.35);
  k.H = hr.hairL;
  k.h = hr.hair;
  k.y = hr.hairD;
  k.Y = PAL.cream3;
  const sh = tones(L.shirt);
  [k.C, k.c, k.x] = sh;
  k[':'] = shade(L.shirt, -0.45);
  const side = tones(L.vest ?? L.shirt);
  [k.V, k.v, k.w] = side;
  const coat = tones(L.coat ?? L.shirt);
  [k.Q, k.q, k.g] = coat;
  const sl = L.coat ? coat : sh;
  [k.U, k.u, k.j] = sl;
  if (rolled) {
    k['1'] = sk.S;
    k['2'] = sk.s;
    k['3'] = sk.z;
  } else {
    [k['1'], k['2'], k['3']] = sl;
  }
  const pa = tones(L.pants);
  [k.P, k.p, k.n] = pa;
  const bo = tones(L.boots);
  [k.B, k.b, k.d] = bo;
  const hat = tones(L.hatColor);
  [k.T, k.t, k.r] = hat;
  k.R = L.hat === 'sombrero' ? '#b84a3a' : L.hat === 'bowler' || L.hat === 'derby' || L.hat === 'flat' ? shade(L.hatColor, -0.5) : PAL.leather1;
  k.l = PAL.leather1;
  k.L = PAL.leather3;
  k['%'] = PAL.dry4;
  k['*'] = PAL.brass2;
  k['+'] = PAL.brass3;
  k.G = PAL.tin0;
  k.I = PAL.tin3;
  const bd = tones(L.bandana ?? '#9a2a2a');
  [k.K, k.k, k.X] = bd;
  const ap = tones(L.apron ?? '#7a6a58');
  [k.A, k.a, k.O] = ap;
  // Per-material outlines: the darkest step of each material's own ramp.
  const o = (g: string, c: string) => (k[OUTLINE[g]!] = c);
  o('skin', sk.o);
  o('hair', shade(hr.hairD, -0.5));
  o('shirt', sh[3]);
  o('side', side[3]);
  o('coat', coat[3]);
  o('sleeve', sl[3]);
  o('fore', rolled ? sk.o : sl[3]);
  o('pants', pa[3]);
  o('boots', bo[3]);
  o('hat', hat[3]);
  o('leather', PAL.leather0);
  o('brass', PAL.brass0);
  o('metal', PAL.ink);
  o('band', bd[3]);
  o('apron', ap[3]);
  return k;
}

// ===========================================================================
// Assembly
// ===========================================================================
interface Pose {
  /** Front/back: -1 left leg lifted, 1 right leg lifted. Side: frame name. */
  step?: number;
  side?: keyof typeof SIDE_LEGS;
  arms?: 'hang' | 'swingL' | 'swingR' | 'ride' | 'shoot' | 'up' | 'reach0' | 'reach1';
  bob?: number;
  lean?: number;
  ride?: boolean;
  sit?: boolean;
  noHat?: boolean;
}

const isElder = (L: HumanLook) => !L.child && L.hair === WHITE_HAIR;

function buildOf(L: HumanLook): Build {
  return L.child ? 'child' : L.build;
}

/** Face grid with per-person touches (lashes, crow's feet, child cheeks). */
function faceFront(L: HumanLook): Grid {
  const f = [...FACE_FRONT];
  if (L.skirt && !L.child) {
    f[5] = 'sseeesseeezz'; // lashes flick outward
  }
  if (isElder(L)) f[7] = '.zzssszsszz.';
  if (!L.skirt && !L.child && L.facial !== 'none') f[8] = '..sssmmssz..';
  return f;
}
function faceSide(L: HumanLook): Grid {
  const f = [...FACE_SIDE];
  if (L.skirt && !L.child) f[5] = 'sssZzseee.';
  if (isElder(L)) f[7] = 'zssssz!ss.';
  return f;
}

function hairFor(L: HumanLook): HairSet | null {
  if (L.hairStyle === 'bald') return L.facial !== 'none' || isElder(L) || L.hair === GREY_HAIR ? BALD_FRINGE : null;
  return HAIR[L.hairStyle];
}

/** Hair rows hidden by a hat: the crown covers the top four rows. */
function underHat(g: Grid, L: HumanLook): Grid {
  if (L.hat === 'none') return g;
  if (L.hat === 'bonnet') return g.map((r, i) => (i < 4 ? '' : i < 7 ? r.replace(/^(..).(.*).(..)$/, '$1.$2.$3') : ''));
  if (!HIDES_HAIR.has(L.hat)) return g;
  return g.map((r, i) => (i < 4 ? '' : r));
}

function drawHead(b: Buf, L: HumanLook, dir: Dir, hy0: number, dx: number, noHat: boolean): void {
  const look = noHat ? { ...L, hat: 'none' as const } : L;
  const hair = hairFor(L);
  if (dir === 'down') {
    stamp(b, faceFront(L), 4 + dx, hy0 + 2);
    if (!L.child && L.facial !== 'none') stamp(b, FACIAL[L.facial].front, 4 + dx, hy0 + 8);
    if (hair) stamp(b, underHat(hair.front, look), 3 + dx, hy0);
  } else if (dir === 'up') {
    stamp(b, FACE_BACK, 4 + dx, hy0 + 2);
    if (hair) stamp(b, underHat(hair.back, look).map((r, i) => (i < 4 && look.hat !== 'none' && look.hat !== 'cap' ? '' : r)), 3 + dx, hy0);
  } else {
    stamp(b, faceSide(L), 5 + dx, hy0 + 2);
    if (!L.child && L.facial !== 'none') stamp(b, FACIAL[L.facial].side, 5 + dx, hy0 + 8);
    if (hair) stamp(b, underHat(hair.side, look), 4 + dx, hy0);
  }
  if (look.hat !== 'none') {
    const h = HATS[look.hat];
    if (dir === 'side') stamp(b, h.side, h.sx + dx, hy0);
    else if (dir === 'down') stamp(b, h.front, h.fx + dx, hy0);
    else stamp(b, h.back ?? h.front.map((r) => r.replace(/z/g, '.')), h.fx + dx, hy0);
  }
}

/** One frame as a char buffer (outline not yet traced). */
function frameBuf(L: HumanLook, dir: Dir, p: Pose): Buf {
  const b = newBuf();
  const bd = BODY[buildOf(L)];
  const child = !!L.child;
  const ty = child ? 17 : 13; // torso top
  const tRows = bd.front.length;
  const beltY = ty + tRows - 1;
  const hy0 = child ? 5 : 1;
  const bob = p.bob ?? 0;
  const lean = p.lean ?? 0;
  const tw = bd.front[0]!.length;

  // ---- Legs / skirt (drawn first; the torso overlaps the hips) ----------
  if (dir !== 'side') {
    if (p.ride) stamp(b, FRONT_RIDE_LEGS, 2, beltY + 1);
    else if (L.skirt) {
      const sk = child ? SKIRT_CHILD_FRONT : SKIRT_FRONT;
      const sx = child ? 5 : 4;
      const top = child ? beltY + 1 : beltY;
      const sway = p.step ?? 0;
      const rows = [...sk];
      // Hem swings with the stride.
      for (let i = rows.length - 2; i < rows.length; i++) rows[i] = sway > 0 ? '.' + rows[i]!.slice(0, -1) : sway < 0 ? rows[i]!.slice(1) + '.' : rows[i]!;
      stamp(b, rows, sx, top + (p.sit ? 1 : 0));
      // Boot toes under the hem.
      const toeY = 24;
      if (!p.sit) {
        stamp(b, ['Bd'], 7 - (sway > 0 ? 0 : 0), toeY - (sway < 0 ? 0 : 0));
        stamp(b, ['Bd'], 11, toeY);
      } else stamp(b, ['Bd..Bd'], 7, 24);
    } else if (p.sit) {
      const g = child ? ['Pppnpn', 'Bd..Bd'] : [bd.hips[0]!, ...bd.legL.slice(3).map((r, i) => r + '..' + bd.legR[3 + i]!)];
      stamp(b, g, bd.hipsX, child ? 22 : 21);
    } else {
      stamp(b, bd.hips, bd.hipsX, beltY + 1);
      const legY = beltY + 1 + bd.hips.length;
      const st = p.step ?? 0;
      const up = Math.abs(st) > 1 ? 2 : 1;
      stamp(b, lift(bd.legL, st < 0 ? up : 0), bd.legLX, legY);
      stamp(b, lift(bd.legR, st > 0 ? up : 0), bd.legRX, legY);
    }
  } else {
    const tx = bd.sx;
    if (p.ride) stamp(b, SIDE_RIDE_LEGS, tx - 3, beltY + 1);
    else if (p.sit) stamp(b, SIDE_SIT_LEGS, tx - 3, beltY + 1 + bob);
    else if (L.skirt) {
      const sk = child ? SKIRT_CHILD_SIDE : SKIRT_SIDE;
      stamp(b, sk, child ? tx - 1 : tx - 2, child ? beltY + 1 : beltY);
      const fr = p.side ?? 'stand';
      const fwd = fr === 'contactA' || fr === 'runA' ? 1 : fr === 'contactB' || fr === 'runB' ? -1 : 0;
      stamp(b, ['Bbb'], tx + 2 + fwd, 24);
      if (fwd) stamp(b, ['dd'], tx - 1 - fwd, 24);
    } else {
      const legs = (child ? SIDE_LEGS_CHILD : SIDE_LEGS)[p.side ?? 'stand'];
      if (child) stamp(b, legs, tx - 4, beltY + 1);
      else stamp(b, legs, tx - 3, beltY + 1);
    }
  }

  // ---- Upper body on its own buffer so it can bob/lean as one piece -----
  const u = newBuf();
  if (dir === 'side') {
    const tx = bd.sx;
    const arms = child ? SIDE_ARM_CHILD : SIDE_ARM;
    const ax = tx + 1;
    // Far arm swings opposite the near one, in shadow, behind the body.
    if (p.arms === 'swingL') stamp(u, far(arms.back), ax - (child ? 1 : 2), ty);
    else if (p.arms === 'swingR') stamp(u, far(arms.fwd), ax, ty);
    if (L.coat) stamp(u, bd.coatSide, tx - 1, ty);
    stamp(u, bd.side, tx, ty);
    if (L.apron) stamp(u, child ? APRON_SIDE.slice(0, 5) : APRON_SIDE, tx + bd.side[0]!.length - 1, ty + 1);
    if (L.gunbelt && !child) stamp(u, GUNBELT_SIDE, tx, beltY);
    if (L.bandana) stamp(u, BANDANA_SIDE, tx + 1, ty);
    if (L.badge && !child) stamp(u, ['+', '*'], tx + bd.side[0]!.length - 2, ty + 1);
    // Near arm.
    switch (p.arms) {
      case 'swingL':
        stamp(u, arms.fwd, ax, ty);
        break;
      case 'swingR':
        stamp(u, arms.back, ax - (child ? 1 : 2), ty);
        break;
      case 'shoot':
        stamp(u, child ? SIDE_SHOOT.map((r) => r.slice(0, 8)) : SIDE_SHOOT, ax, ty);
        break;
      case 'ride':
        stamp(u, SIDE_RIDE_ARM, ax, ty);
        break;
      case 'up':
        stamp(u, child ? SIDE_UP.slice(3) : SIDE_UP, ax + 1, child ? ty - 5 : ty - 8);
        break;
      case 'reach0':
      case 'reach1':
        stamp(u, child ? SIDE_REACH[p.arms === 'reach0' ? 0 : 1]!.slice(2) : SIDE_REACH[p.arms === 'reach0' ? 0 : 1]!, ax, ty);
        break;
      default:
        stamp(u, arms.hang, ax, ty);
    }
  } else {
    const back = dir === 'up';
    const tx = bd.tx;
    stamp(u, back ? bd.back : bd.front, tx, ty);
    if (L.coat) stamp(u, back ? bd.coatBack : bd.coat, bd.coatX, ty);
    if (L.skirt && !child) {
      // Fitted bodice: a sash instead of a belt.
      stamp(u, [':'.repeat(tw)], tx, beltY);
    }
    if (L.apron) {
      if (!back) stamp(u, child ? APRON_FRONT.slice(0, 6) : APRON_FRONT, tx + Math.floor((tw - 6) / 2), ty);
      else stamp(u, ['.OO.', 'O..O'], tx + Math.floor((tw - 4) / 2), beltY);
    }
    if (L.gunbelt && !child) {
      const g = GUNBELT_FRONT(tw);
      stamp(u, back ? g.map((r) => [...r].reverse().join('')) : g, back ? tx : tx - 1, beltY);
    }
    if (L.bandana) stamp(u, back ? BANDANA_BACK : BANDANA_FRONT, tx + Math.floor((tw - 6) / 2), ty);
    if (L.badge && !back && !child) stamp(u, ['+', '*'], tx + tw - 2, ty + 1);
    const aL = tx - 2;
    const aR = tx + tw;
    const armL = back ? bd.armR.map((r) => [...r].reverse().join('')) : bd.armL;
    const armR = back ? bd.armL.map((r) => [...r].reverse().join('')) : bd.armR;
    switch (p.arms) {
      case 'swingL':
        stamp(u, armL.filter((_, i) => i !== 1), aL, ty);
        stamp(u, armR, aR, ty);
        break;
      case 'swingR':
        stamp(u, armL, aL, ty);
        stamp(u, armR.filter((_, i) => i !== 1), aR, ty);
        break;
      case 'ride':
        if (back) {
          stamp(u, armL.slice(0, 4), aL, ty);
          stamp(u, armR.slice(0, 4), aR, ty);
        } else {
          stamp(u, RIDE_L, aL, ty);
          stamp(u, RIDE_R, aR - 4, ty);
          stamp(u, ['ll'], 9, ty + 5);
        }
        break;
      case 'shoot':
        if (back) {
          stamp(u, armL.slice(0, 3), aL, ty);
          stamp(u, armR.slice(0, 3), aR, ty);
        } else {
          stamp(u, SHOOT_L, aL, ty);
          stamp(u, SHOOT_R, aR - 3, ty);
          stamp(u, SHOOT_GUN, 9, ty + 4);
        }
        break;
      case 'up': {
        // Hands up beside the head (clear of the ears), sleeves bridging to the shoulders.
        const ul = child ? UP_L_CHILD : UP_L;
        const ur = child ? UP_R_CHILD : UP_R;
        const y0 = child ? ty - 4 : ty - 8;
        stamp(u, ul.slice(0, -2).map((r) => r.slice(0, 2)), 2, y0);
        stamp(u, ur.slice(0, -2).map((r) => r.slice(1)), 16, y0);
        stamp(u, ['UU'.padEnd(Math.max(2, tx - 2), 'u')], 2, ty - 2);
        stamp(u, ['.' + 'U'.repeat(Math.max(1, tx - 3)) + 'u'], 2, ty - 1);
        stamp(u, ['u'.repeat(Math.max(1, 16 - aR)) + 'jj'], aR, ty - 2);
        stamp(u, ['u'.repeat(Math.max(1, 16 - aR)) + 'j'], aR, ty - 1);
        break;
      }
      case 'reach0':
      case 'reach1':
        stamp(u, armL, aL, ty);
        if (back) stamp(u, armR.slice(0, 4), aR, ty);
        else stamp(u, REACH_R[p.arms === 'reach0' ? 0 : 1]!, aR - 4, ty + (child ? -1 : 1));
        break;
      default:
        stamp(u, armL, aL, ty);
        stamp(u, armR, aR, ty);
    }
  }
  drawHead(u, L, dir, hy0, 0, !!p.noHat);
  // Hands-up arms go over the hat brim, so restamp them on top.
  if (p.arms === 'up' && dir !== 'side') {
    const y0 = child ? ty - 4 : ty - 8;
    stamp(u, (child ? UP_L_CHILD : UP_L).slice(0, 3).map((r) => r.slice(0, 2)), 2, y0);
    stamp(u, (child ? UP_R_CHILD : UP_R).slice(0, 3).map((r) => r.slice(1)), 16, y0);
  }
  if (lean) shiftCols(u, lean);
  // Composite: upper body over legs, bobbed.
  for (let y = 0; y < BH; y++)
    for (let x = 0; x < BW; x++) {
      const ch = u[y]![x]!;
      const yy = y + bob;
      if (ch !== '.' && yy >= 0 && yy < BH) b[yy]![x] = ch;
    }
  return b;
}

/** Lean the whole upper body forward by dx pixels (run). */
function shiftCols(b: Buf, dx: number): void {
  for (const row of b) {
    const r = [...row];
    for (let x = 0; x < row.length; x++) row[x] = r[x - dx] ?? '.';
  }
}

function render(L: HumanLook, dir: Dir, p: Pose, key: Record<string, string>): HTMLCanvasElement | OffscreenCanvas {
  const b = frameBuf(L, dir, p);
  // Seated: drop a torso row so the hips land on the saddle row (17) the horse code expects.
  if (p.ride) dropRow(b, L.child ? 18 : 15);
  outline(b);
  return toCanvas(b, key);
}

function renderDead(L: HumanLook, key: Record<string, string>): HTMLCanvasElement | OffscreenCanvas {
  const src = frameBuf(L, 'side', { side: 'stand', arms: 'hang', noHat: true });
  const r = rotCCW(src); // 28 wide × 20 tall: head on the left, face up
  // Find the occupied rows and settle the body on the ground (feet row ≈ 24).
  let y0 = r.length;
  let y1 = -1;
  r.forEach((row, y) => {
    if (row.some((c) => c !== '.')) {
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  });
  const b = newBuf(PW + 8, PH);
  const dy = 24 - y1;
  for (let y = y0; y <= y1; y++) for (let x = 0; x < r[0]!.length; x++) if (r[y]![x] !== '.') b[y + dy]![x] = r[y]![x]!;
  outline(b);
  return toCanvas(b, key);
}

const cache = new Map<string, HumanSpriteSet>();

/** All animation frames for a look; cached by the look's content. */
export function humanSprites(L: HumanLook): HumanSpriteSet {
  const ck = JSON.stringify(L);
  const hit = cache.get(ck);
  if (hit) return hit;
  const key = keyFor(L, !L.coat && !L.skirt && !L.child);
  const frames = {} as HumanSpriteSet['frames'];
  const kid = !!L.child;
  for (const d of ['down', 'up', 'side'] as Dir[]) {
    const r = (p: Pose) => render(L, d, p, key);
    if (d === 'side') {
      frames[d] = {
        idle: [r({ side: 'stand', arms: 'hang' }), r({ side: 'stand', arms: 'hang', bob: kid ? 0 : 1 })],
        walk: [
          r({ side: 'contactA', arms: 'swingR', bob: 1 }),
          r({ side: 'pass', arms: 'hang' }),
          r({ side: 'contactB', arms: 'swingL', bob: 1 }),
          r({ side: 'pass', arms: 'hang' }),
        ],
        run: [
          r({ side: 'runA', arms: 'swingR', bob: 1, lean: 1 }),
          r({ side: 'pass', arms: 'hang', lean: 1 }),
          r({ side: 'runB', arms: 'swingL', bob: 1, lean: 1 }),
          r({ side: 'pass', arms: 'hang', lean: 1 }),
        ],
        shoot: [r({ side: 'stand', arms: 'shoot' })],
        ride: [r({ ride: true, arms: 'ride' }), r({ ride: true, arms: 'ride', bob: 1 })],
        dead: [renderDead(L, key)],
        surrender: [r({ side: 'stand', arms: 'up' })],
        interact: [r({ side: 'stand', arms: 'reach0' }), r({ side: 'stand', arms: 'reach1', bob: 1 })],
        sit: [r({ sit: true, arms: 'hang', bob: 2 })],
      };
    } else {
      frames[d] = {
        idle: [r({ arms: 'hang' }), r({ arms: 'hang', bob: kid ? 0 : 1 })],
        walk: [r({ step: -1, arms: 'swingR', bob: 1 }), r({ arms: 'hang' }), r({ step: 1, arms: 'swingL', bob: 1 }), r({ arms: 'hang' })],
        run: [r({ step: -2, arms: 'swingR', bob: 1 }), r({ arms: 'hang' }), r({ step: 2, arms: 'swingL', bob: 1 }), r({ arms: 'hang' })],
        shoot: [r({ arms: 'shoot' })],
        ride: [r({ ride: true, arms: 'ride' }), r({ ride: true, arms: 'ride', bob: 1 })],
        dead: [renderDead(L, key)],
        surrender: [r({ arms: 'up' })],
        interact: [r({ arms: 'reach0' }), r({ arms: 'reach1', bob: 1 })],
        sit: [r({ sit: true, arms: 'hang', bob: 2 })],
      };
    }
  }
  const set = { frames };
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  cache.set(ck, set);
  return set;
}

export const SKIN_TONES = ['#f1d0b4', '#e3b48f', '#c98f66', '#a96e4b', '#8a5638', '#6b3f28', '#4e2e1f'];
export const HAIR_COLORS = ['#1b1410', '#3a2618', '#5e3c22', '#8a5a30', '#b98a4e', '#d9c08a', '#8e3b1e', '#9c9a95', '#d8d6d0'];
