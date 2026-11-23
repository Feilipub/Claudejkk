/**
 * Dialogue portraits (40×44, shown 3× in the dialogue box), hand-pixelled
 * from text grids like the world sprites: a face, hair mass per style, hat per
 * type, facial hair and a head-and-shoulders bust with collar, vest, coat,
 * bandana, apron and badge layers. Colours come from the same HumanLook via
 * the sprite's palette key (palette swap), so a character matches in both.
 *
 * The seed picks per-character variety without touching the drawing: brow
 * set (mood), mouth, nose shape and eye colour. Light from the upper-left,
 * flat regions with one shadow and one highlight, per-material dark outline.
 */
import { Rng, hashString } from '../core/rng.ts';
import { keyFor, luma, readableHair, type HumanLook } from './humanSprite.ts';
import { newBuf, outline, stamp, toCanvas, type Buf, type Grid } from './humanPixel.ts';
import { mix, shade } from './pixel.ts';

export const PORTRAIT_W = 40;
export const PORTRAIT_H = 44;

const cache = new Map<string, HTMLCanvasElement | OffscreenCanvas>();

const WHITE_HAIR = '#d8d6d0';
const GREY_HAIR = '#9c9a95';

// ---------------------------------------------------------------------------
// Drawings. Face at (9, 10); front hair at (7, 4); hats at (0, 0); bust from
// row 33; neck at (15, 30); facial hair at (9, 24) (face row 14).
// ---------------------------------------------------------------------------
const FACE: Grid = [
  '.......SSSsssss.......',
  '.....SSSSsssssssz.....',
  '...SSSSSssssssssszz...',
  '..sSSSsssssssssssssz..',
  '..sSSssssssssssssssz..',
  '..sSsssssssssssssssz..',
  '..sSsssssssssssssssz..',
  '..sssssssssssssssssz..',
  '..sssssssssssssssssz..',
  '..sssssssssssssssssz..',
  'ssssseeeesssseeeesszzz',
  'sSsssWi@isssi@iWsszZzz',
  'sSsssWieisssieiWsszZzz',
  '.sSssssssssssssssszzz.',
  '..sSsssssssszssssszz..',
  '..s!!sssssszZsss!!zz..',
  '..ssssssssZzzZsssszz..',
  '...sssssssssssssssz...',
  '...ssssssmmmmsssszz...',
  '....sssssssssssszz....',
  '.....zssssssssszz.....',
  '......zzzzzzzzzz......',
];
const BODY: Grid = [
  '...............CC......CC...............',
  '...........VVVVCCC....CCCvvvw...........',
  '........VVVVVVvvCCC..CCCvvvvvvww........',
  '......VVVVVvvvvvvCCCCCCvvvvvvvvvww......',
  '.....VVVVvvvvvvvCCccccxxvvvvvvvvvww.....',
  '....VVVvvvvvvvvvvCcccxxvvvvvvvvvvvww....',
  '...VVVvvvvvvvvvvvvCccxvvvvvvvvvvvvvww...',
  '...VVvvvvvvvvvvvvvCccxvvvvvvvvvvvvvww...',
  '..VVvvvvvvvvvvvvvvvcxvvvvvvvvvvvvvvvww..',
  '..VVvvvvvvvvvvvvvvvcxvvvvvvvvvvvvvvvww..',
  '..Vvvvvvvvvvvvvvvvvcxvvvvvvvvvvvvvvvvw..',
];
const COAT: Grid = [
  '...........QQQQ...........ggg...........',
  '........QQQQQQQ...........gggggg........',
  '......QQQQQqqqQ...........gqqqqggg......',
  '.....QQQQqqqqqqQ.........gqqqqqqqgg.....',
  '....QQQqqqqqqqqQ.........gqqqqqqqqgg....',
  '...QQQqqqqqqqqqqQ.......gqqqqqqqqqqgg...',
  '...QQqqqqqqqqqqqQ.......gqqqqqqqqqqgg...',
  '..QQqqqqqqqqqqqqqQ.....gqqqqqqqqqqqqgg..',
  '..QQqqqqqqqqqqqqqQ.....gqqqqqqqqqqqqgg..',
  '..Qqqqqqqqqqqqqqqq.....qqqqqqqqqqqqqqg..',
];
const NECK: Grid = [
  'ssssssszzz',
  'sssssszzzz',
  'ZZzzzzzzZZ',
  'sssssszzzz',
  'ssssssszzz',
  'sssssszzzz',
];
const H_SHORT: Grid = [
  '.........hhhhhhhh.........',
  '......hhhHHHhhhhhhhh......',
  '....hhHHHHHhhhhhhhhhyy....',
  '...hHHHHhhhhhhhhhhhhhyy...',
  '..hHHHhhhhhhhhhhhhhhhhyy..',
  '..hHHhhhhhhhhhhhhhhhhhhy..',
  '.hHHhhhhhhhhhhhhhhhhhhhyy.',
  '.hHhhhhhhhhhhhyhhhhhhhhyy.',
  '.hhhhhhhhhhhhyhhhhhhyhhyy.',
  '.hhhhhhyhhhhyhhhhhhyyhhyy.',
  '.hhhyhhh.yhh..hhhhy..yhyy.',
  '.hhy....h..y....yy....hyy.',
  '.hh....................hy.',
  '.hy....................yy.',
  '..y....................y..',
];
const H_LONG: Grid = [
  '.........hhhhhhhh.........',
  '......hhhHHHhhhhhhhh......',
  '....hhHHHHHhhhhhhhhhyy....',
  '...hHHHHhhhhhhhhhhhhhyy...',
  '..hHHHhhhhhhhhhhhhhhhhyy..',
  '..hHHhhhhhhhhyhhhhhhhhhy..',
  '.hHHhhhhhhhhyyhhhhhhhhhyy.',
  '.hHhhhhhhhhy..yhhhhhhhhyy.',
  '.hHhhhhhhhy....yhhhhhhhyy.',
  '.hHhhhhhy........yhhhhhhy.',
  '.hHhhhy............yhhhhy.',
  '.hHhhy..............yhhyy.',
  '.hHhy................yhyy.',
  '.hHh..................hyy.',
  '.hHh..................hyy.',
  '.hhh..................hyy.',
  '.hhh..................hyy.',
  '.hhh..................yyy.',
  '.hhh..................hyy.',
  '.hhy..................yyy.',
  '.hhy..................yy..',
  '.hy....................y..',
];
const H_LONG_BACK: Grid = [
  '......hhhhhhhhhhhhhhhh......',
  '....hhhhhhhhhhhhhhhhhhhy....',
  '...hhhhhhhhhhhhhhhhhhhhhyy..',
  '..hhhhhhhhhhhhhhhhhhhhhhhyy.',
  '..hhhhhhhhhhhhhhhhhhhhhhhyy.',
  '.hhhhhhhhhhhhhhhhhhhhhhhhhyy',
  '.hHhhhhhhhhhhhhhhhhhhhhhhhyy',
  '.hHhhhhhhhhhhhhhhhhhhhhhhhyy',
  '.hHhhhhhhhhhhhhhhhhhhhhhhhyy',
  '.hHhhhhhhhhhhhhhhhhhhhhhhhyy',
  '.hHhhhhhhhhhhhhhhhhhhhhhhhyy',
  '.hHhhhhhhhhhhhhhhhhhhhhhhhyy',
  '.hhhhhhhhhhhhhhhhhhhhhhhhhyy',
  '.hhhhhhhhhhhhhhhhhhhhhhhhhyy',
  '.hhhhhhhhhhhhhhhhhhhhhhhhhyy',
  '.hhhhhhhhhhhhhhhhhhhhhhhhhyy',
  '.hhhhhhhhhhhhhhhhhhhhhhhhhyy',
  '.hhhhhhhhhhhhhhhhhhhhhhhhhyy',
  '.hhhhhhhhhhhhhhhhhhhhhhhhhyy',
  '.hhhhhhhhhhhhhhhhhhhhhhhhyyy',
  '.hhhhhhhhhhhhhhhhhhhhhhhhyyy',
  '.hhhhyhhhhhhhhhhhhhhhhyhhyy.',
  '.hhhyyhhhhhhhhhhhhhhhhyyhyy.',
  '.hhy.yhhh..........hhyy.yy..',
  '..y...yy.............yy.....',
];
const H_BUN: Grid = [
  '..........................',
  '..........................',
  '....hhhhHHHhhhhhhhhhyy....',
  '...hHHHHHhhhhhhhhhhhhyy...',
  '..hHHHhhhhhhhhhhhhhhhhyy..',
  '..hHhhhhhhhhhhyhhhhhhhhy..',
  '.hHhhhhhhhhhhhyhhhhhhhhyy.',
  '.hHhhhhhhhhhhyhhhhhhhhhyy.',
  '.hhhhhhhhhhyy.yyhhhhhhhyy.',
  '.hhhhhhhyyy.....yyhhhhhyy.',
  '.hhhhyyy...........yyhhyy.',
  '.hhy..................hyy.',
  '.hh....................y..',
  '.hy....................y..',
  '..y.......................',
];
const H_BUN_BACK: Grid = [
  '........hhhhhhhh........',
  '......hHHHhhhhhhhy......',
  '.....hHHhhhhhhhhhyy.....',
  '.....hHhhhhhhhhhhyy.....',
  '.....hhhhhhhhhhhhyy.....',
  '......hhhhhhhhhhyy......',
  '........yyyyyyyy........',
];
const H_CURLY: Grid = [
  '.......hh.hhhh.hh.........',
  '.....hhHHhHHhhhhhhhh......',
  '...hhHHHHHHhhhhhhhhhyy....',
  '..hHHHHHhhhhhhhhhhhhhyy...',
  '.hHHHHhhhhhhhhhhhhhhhhyy..',
  '.hHHHhhhhhhhhhhhhhhhhhhyy.',
  'hhHHhhhhhhhhhhhhhhhhhhhhyy',
  'hHHhhhhhhhhyhhhhhhyhhhhhyy',
  'hHhhhhhyhhhhhhhhyhhhhhhhyy',
  '.hhhhhhhhhhhyhhhhhhhhyhhyy',
  '.hhhhhy.hhy..yhh.yhh..hhyy',
  'hhhhy.....y......y.....hyy',
  'hhhy...................hyy',
  '.hhy...................yyy',
  'hhhy....................yy',
  '.hy....................yy.',
  'hhy.....................yy',
  '.y.......................y',
];
const H_BRAID: Grid = [
  '..........................',
  '..........................',
  '....hhhhHHHhhhhhhhhhyy....',
  '...hHHHHHhhhhhhhhhhhhyy...',
  '..hHHHhhhhhhhhhhhhhhhhyy..',
  '..hHhhhhhhhhhhyhhhhhhhhy..',
  '.hHhhhhhhhhhhhyhhhhhhhhyy.',
  '.hHhhhhhhhhhhyhhhhhhhhhyy.',
  '.hhhhhhhhhhyy.yyhhhhhhhyy.',
  '.hhhhhhhyyy.....yyhhhhhyy.',
  '.hhhhyyy...........yyhhyy.',
  '.hhy..................hyy.',
  '.hh....................y..',
  '.hh....................y..',
  '.hh.......................',
  '.hh.......................',
  '.hhh......................',
  '.hhh......................',
  '..hhh.....................',
  '..HhHy....................',
  '..hHyy....................',
  '..yHhh....................',
  '...hHhy...................',
  '...yHhh...................',
  '...hhHy...................',
  '...yhHh...................',
  '...hyhy...................',
  '....YY....................',
  '....YY....................',
];
const H_BALD: Grid = [
  '..........................',
  '..........................',
  '..........................',
  '..........................',
  '..........................',
  '..........................',
  '..........................',
  '..........................',
  '..........................',
  '..........................',
  '..........................',
  '..........................',
  '..........................',
  '..........................',
  '.hy....................yy.',
  '.hh....................hy.',
  '.hh....................hy.',
  '.hy....................yy.',
  '..y.....................y.',
];
const T_COWBOY: Grid = [
  '..............TTTttrr...................',
  '............TTTTttrrttr.................',
  '...........TTTTtttrttttr................',
  '...........TTTttttrtttttr...............',
  '..........TTTtttttttttttr...............',
  '..........TTtttttttttttttr..............',
  '..........TTtttttttttttttr..............',
  '..........RRRRRRRRRRRRRRRRR.............',
  '..........RRRRRRRRRRRRRRRRR.............',
  'tt......TTtttttttttttttttttrr.......rr..',
  '.TTTTTTTTtttttttttttttttttttttttttrrrr..',
  '...TTTTtttttttttttttttttttttttttrrrr....',
  '.......rrrrrrrrrrrrrrrrrrrrrrrrrr.......',
  '..........zzzzzzzzzzzzzzzzzzz...........',
];
const T_BOWLER: Grid = [
  '........................................',
  '........................................',
  '...............TTTtttr..................',
  '.............TTTTttttttr................',
  '............TTTttttttttrr...............',
  '...........TTTtttttttttttr..............',
  '...........TTttttttttttttrr.............',
  '...........TTttttttttttttrr.............',
  '...........RRRRRRRRRRRRRRRR.............',
  '...........RRRRRRRRRRRRRRRR.............',
  '.........TTtttttttttttttttttrr..........',
  '........rrtttttttttttttttttttrr.........',
  '..........rrrrrrrrrrrrrrrrrrr...........',
  '...........zzzzzzzzzzzzzzzzzz...........',
];
const T_FLAT: Grid = [
  '........................................',
  '........................................',
  '........................................',
  '..........TTTTttttttttttttrr............',
  '..........TTtttttttttttttttr............',
  '..........TTtttttttttttttttr............',
  '..........TTtttttttttttttttr............',
  '..........RRRRRRRRRRRRRRRRRR............',
  '..........RRRRRRRRRRRRRRRRRR............',
  '..TTTTTTTTtttttttttttttttttttttttttrr...',
  '..rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr...',
  '..........zzzzzzzzzzzzzzzzzz............',
];
const T_SOMBRERO: Grid = [
  '.................TTtr...................',
  '................TTtttr..................',
  '...............TTttttr..................',
  '..............TTtttttrr.................',
  '.............TTtttttttrr................',
  '............TTtttttttttrr...............',
  '...........TTttttttttttttr..............',
  '...........RR+RR+RR+RR+RRR..............',
  'TT........RR+RR+RR+RR+RRRR.........rr...',
  '.TTTT...TTttttttttttttttttrr....rrrr....',
  '..TTTTTTtttttttttttttttttttttttttrr.....',
  '....TTTttttttttttttttttttttttttrrr......',
  '.........rrrrrrrrrrrrrrrrrrrrrr.........',
  '...........zzzzzzzzzzzzzzzzzz...........',
];
const T_CAP: Grid = [
  '........................................',
  '........................................',
  '........................................',
  '........................................',
  '..............TTTTttttrr................',
  '...........TTTTTtttttttttrr.............',
  '.........TTTTttttttttttttttrr...........',
  '........TTTtttttttttttttttttrr..........',
  '........TTtttttttttttttttttttrr.........',
  '........Tttttttttttttttttttttrr.........',
  '........ttttttttttttttttttttttr.........',
  '..........rrrrrrrrrrrrrrrrrrr...........',
  '.........rrrrrrrrrrrrrrrrrrrrr..........',
  '...........zzzzzzzzzzzzzzzzzz...........',
];
const T_BONNET: Grid = [
  '........................................',
  '........................................',
  '..............TTTTttttttrr..............',
  '...........TTTTTttttttttttrr............',
  '.........TTTTtttttttttttttttrr..........',
  '........TTTtttttttttttttttttttr.........',
  '.......TTTttttttttttttttttttttrr........',
  '......TTTTTTTTTTTTTTTTTTTTTTTTTTr.......',
  '......TTr....................rtr........',
  '......Ttr....................rtr........',
  '......Ttr....................rtr........',
  '......ttr....................rtr........',
  '......ttr....................rtr........',
  '......ttr....................rtr........',
  '......ttr....................rtr........',
  '......ttr....................rtr........',
  '......ttr....................rtr........',
  '......ttr....................rtr........',
  '......ttr....................rtr........',
  '......ttr....................rtr........',
  '......ttt....................ttr........',
];
const T_BONNET_BACK: Grid = [
  '......TTTTTttttttttttttttttrr...',
  '.....TTTTtttttttttttttttttttrr..',
  '.....TTTttttttttttttttttttttrr..',
  '.....TTtttttttttttttttttttttrr..',
  '.....TTtttttttttttttttttttttrr..',
  '.....TTtttttttttttttttttttttrr..',
  '.....Tttttttttttttttttttttttrr..',
  '.....ttttttttttttttttttttttttr..',
  '.....ttttttttttttttttttttttttr..',
  '.....ttttttttttttttttttttttttr..',
  '....tttttttttttttttttttttttttrr.',
  '...ttttttttttttttttttttttttttrrr',
  '...rrrrrrrrrrrrrrrrrrrrrrrrrrrrr',
];
const F_MUSTACHE: Grid = [
  '......................',
  '......................',
  '......................',
  '.......HhhhhhhhY......',
  '......hhhhyyhhhhy.....',
  '......hy......yhy.....',
  '......y........y......',
];
const F_BEARD: Grid = [
  '.h..................y.',
  '.hh................yy.',
  '.hhh..............hyy.',
  '.hhh...HhhhhhhhY..hyy.',
  '.hHhhhhhhhyyhhhhhhhyy.',
  '.hHhhhhy......yhhhhyy.',
  '..hHhhhhhhhhhhhhhhhy..',
  '..hhhhhhhhhhhhhhhhyy..',
  '...hhhhhhhhhhhhhhhy...',
  '....hhhhhhhhhhhhyy....',
  '.....yhhhhhhhhhyy.....',
  '.......yyhhhhyy.......',
];
const F_GOATEE: Grid = [
  '......................',
  '......................',
  '......................',
  '.......HhhhhhhhY......',
  '......hhhhyyhhhhy.....',
  '......y........y......',
  '.........hhhh.........',
  '........hhhhhy........',
  '.........hhhy.........',
  '..........yy..........',
];
const F_STUBBLE: Grid = [
  '......................',
  '......................',
  '..__..............__..',
  '..___............___..',
  '...___..........___...',
  '....____......____....',
  '.....____________.....',
  '......__________......',
];

const BONNET_TIE: Grid = ['..rr..rr..', '...rrrr...', '..rr..rr..'];
const FEM_COLLAR: Grid = ['.CCCCCCCC.', 'CCCcccccxx', '.cccC+cxx.', '....c*....'];
const BANDANA: Grid = ['KKKKKkkkkkkX', '.KkkkkkkkkX.', '..KkkkkkkX..', '...KkkkkX...', '....kkkX....', '.....kX.....'];
const BADGE: Grid = ['..+..', '+++*+', '.+**.', '.*.*.'];
const APRON: Grid = ['.O..........O.', '.O..........O.', '.O..........O.', '.O..........O.', 'AAAAAAAaaaaaaO', 'AAaaaaaaaaaaaO', 'AaaaaaaaaaaaaO', 'AaaaaaaaaaaaaO'];
const SUSPENDERS: Grid = ['L.............l', 'L.............l', 'L.............l', 'L.............l', 'L.............l', 'L.............l', '*.............*', 'L.............l', 'L.............l'];
const WATCH: Grid = ['+*', '..*'];

type Mood = 'calm' | 'stern' | 'kind' | 'wry';

function setRow(f: string[], y: number, x: number, s: string): void {
  const r = f[y]!;
  f[y] = r.slice(0, x) + s + r.slice(x + s.length);
}

/** Face grid with the seed's brows, mouth and nose, plus age/sex/child touches. */
function faceGrid(L: HumanLook, mood: Mood, nose: number, child: boolean, thick: boolean, old: boolean): string[] {
  const f = [...FACE];
  const fem = L.skirt && !child;
  // Brows (letter b).
  if (fem || child) {
    setRow(f, 8, 6, 'bb');
    setRow(f, 8, 14, 'bb');
    setRow(f, 9, 5, 'b');
    setRow(f, 9, 16, 'b');
    if (mood === 'wry') setRow(f, 7, 6, 'bb');
  } else {
    if (mood === 'stern') {
      setRow(f, 8, 5, 'bbb');
      setRow(f, 9, 8, 'b');
      setRow(f, 8, 14, 'bbb');
      setRow(f, 9, 13, 'b');
    } else if (mood === 'kind') {
      setRow(f, 8, 6, 'bbb');
      setRow(f, 9, 5, 'b');
      setRow(f, 8, 13, 'bbb');
      setRow(f, 9, 16, 'b');
    } else if (mood === 'wry') {
      setRow(f, 7, 5, 'bbbb');
      setRow(f, 8, 13, 'bbbb');
    } else {
      setRow(f, 8, 5, 'bbbb');
      setRow(f, 8, 13, 'bbbb');
    }
    if (thick) {
      setRow(f, mood === 'wry' ? 8 : 7, 6, 'bb');
      setRow(f, 7, 14, 'bb');
    }
  }
  // Eyes: lashes for women, taller eyes for children.
  if (fem) {
    setRow(f, 9, 4, 'e');
    setRow(f, 9, 17, 'e');
    setRow(f, 10, 4, 'e');
    setRow(f, 10, 17, 'e');
  }
  if (child) {
    setRow(f, 13, 5, 'Wiii');
    setRow(f, 13, 13, 'iiiW');
  }
  if (old) {
    setRow(f, 13, 5, 'zsSz');
    setRow(f, 13, 13, 'zSsz');
    setRow(f, 5, 7, 'zzz');
    setRow(f, 5, 12, 'zzz');
  }
  // Nose.
  if (child) {
    setRow(f, 14, 11, 's');
    setRow(f, 15, 11, 'zz');
    setRow(f, 16, 10, 'ssss');
  } else if (nose === 1) setRow(f, 16, 9, 'ZzzzZ');
  else if (nose === 2) {
    setRow(f, 13, 11, 'z');
    setRow(f, 14, 10, 'Sz');
  } else if (nose === 3) setRow(f, 14, 12, 'z');
  // Mouth.
  if (child) {
    setRow(f, 18, 9, 'smms');
    if (mood === 'kind') {
      setRow(f, 17, 9, 'm');
      setRow(f, 17, 12, 'm');
    }
  } else if (fem) {
    setRow(f, 18, 9, 'mmmm');
    setRow(f, 19, 10, 'MM');
    if (mood === 'kind') {
      setRow(f, 17, 8, 'm');
      setRow(f, 17, 13, 'm');
    }
  } else if (mood === 'kind') {
    setRow(f, 17, 8, 'm');
    setRow(f, 17, 13, 'm');
  } else if (mood === 'stern') {
    setRow(f, 19, 8, 'z');
    setRow(f, 19, 13, 'z');
  } else if (mood === 'wry') setRow(f, 17, 13, 'm');
  if (!fem && !child && L.build === 'stocky') setRow(f, 20, 7, 'zz');
  return f;
}

/** Remove the first `n` rows of a grid (hidden under a hat crown/brim). */
function cut(g: Grid, n: number): Grid {
  return g.map((r, i) => (i < n ? '' : r));
}

/** Clear grid columns outside [x0, x1] of a stamped buffer region (narrower busts). */
function trimCols(b: Buf, x0: number, x1: number, y0: number): void {
  for (let y = y0; y < b.length; y++) for (let x = 0; x < b[0]!.length; x++) if (x < x0 || x > x1) b[y]![x] = '.';
}

const HAT_GRID: Partial<Record<HumanLook['hat'], { g: Grid; dx: number; hide: number }>> = {
  cowboy: { g: T_COWBOY, dx: 1, hide: 9 },
  cavalry: { g: T_COWBOY, dx: 1, hide: 9 },
  bowler: { g: T_BOWLER, dx: 1, hide: 9 },
  derby: { g: T_BOWLER, dx: 1, hide: 9 },
  flat: { g: T_FLAT, dx: 1, hide: 8 },
  sombrero: { g: T_SOMBRERO, dx: 1, hide: 9 },
  cap: { g: T_CAP, dx: 0, hide: 9 },
  bonnet: { g: T_BONNET, dx: 0, hide: 6 },
};

/** `child` paints younger proportions (smaller bust, taller eyes). */
export function portrait(look: HumanLook, seedKey: string, child = false): HTMLCanvasElement | OffscreenCanvas {
  const ck = seedKey + (child ? 'c' : '') + JSON.stringify(look);
  const hit = cache.get(ck);
  if (hit) return hit;
  const L = look;
  const kid = child || !!L.child;
  const r = new Rng(hashString(seedKey));
  const fem = L.skirt && !kid;
  const old = !kid && L.hair === WHITE_HAIR;
  const greying = !kid && (old || L.hair === GREY_HAIR);
  const mood: Mood = kid ? r.pick(['kind', 'calm'] as const) : fem ? r.pick(['kind', 'calm', 'wry'] as const) : r.pick(['calm', 'stern', 'kind', 'wry'] as const);
  const nose = kid ? 0 : r.int(0, 3);
  const iris = r.pick(luma(L.skin) < 0.4 ? ['#3a2614', '#4a3218', '#2a1c12', '#5a3a1e'] : ['#3a2614', '#4a3218', '#5a3a1e', '#2a4a6a', '#3a5a2a', '#2e5466', '#6a4a24']);
  const suspenders = !L.vest && !L.coat && !L.apron && !fem && !kid && r.chance(0.6);

  const b = newBuf(PORTRAIT_W, PORTRAIT_H);
  const dy = kid ? 3 : 0;
  const hat = HAT_GRID[L.hat];
  const hide = hat?.hide ?? 0;

  // ---- Behind the head ------------------------------------------------------
  if (L.hat === 'bonnet') stamp(b, T_BONNET_BACK, 4, 5 + dy);
  if (L.hairStyle === 'long' || (L.hairStyle === 'curly' && fem)) stamp(b, cut(H_LONG_BACK, hat ? 4 : 0), 6, 8 + dy);
  if (L.hairStyle === 'bun' && !hat) stamp(b, H_BUN_BACK, 8, 1 + dy);

  // ---- Bust -------------------------------------------------------------------
  const bust = newBuf(PORTRAIT_W, PORTRAIT_H);
  stamp(bust, NECK, 15, 30 + dy);
  stamp(bust, BODY, 0, 33 + dy);
  if (L.coat) stamp(bust, COAT, 0, 34 + dy);
  if (fem) stamp(bust, FEM_COLLAR, 15, 31 + dy);
  if (suspenders) stamp(bust, SUSPENDERS, 12, 35 + dy);
  if (L.vest && !L.coat && !fem) stamp(bust, WATCH, 11, 40 + dy);
  if (L.apron) stamp(bust, APRON, 13, 33 + dy);
  if (L.bandana) stamp(bust, BANDANA, 14, 31 + dy);
  if (L.badge) stamp(bust, BADGE, fem ? 25 : 9, 37 + dy);
  const half = kid ? 12 : fem || L.build === 'slim' ? 15 : L.build === 'stocky' ? 18 : 17;
  trimCols(bust, 20 - half, 19 + half, 0);
  for (let y = 0; y < PORTRAIT_H; y++) for (let x = 0; x < PORTRAIT_W; x++) if (bust[y]![x] !== '.') b[y]![x] = bust[y]![x]!;

  // ---- Face -------------------------------------------------------------------
  const thick = !fem && !kid && (L.build === 'stocky' || greying);
  stamp(b, faceGrid(L, mood, nose, kid, thick, old), 9, 10 + dy);
  if (!kid && !fem && L.facial !== 'none') {
    const fg = { mustache: F_MUSTACHE, beard: F_BEARD, goatee: F_GOATEE, stubble: F_STUBBLE }[L.facial];
    stamp(b, fg, 9, 24 + dy);
  }

  // ---- Hair -------------------------------------------------------------------
  const front: Grid | null =
    L.hairStyle === 'short' ? H_SHORT : L.hairStyle === 'long' ? H_LONG : L.hairStyle === 'bun' ? H_BUN : L.hairStyle === 'braid' ? H_BRAID : L.hairStyle === 'curly' ? H_CURLY : !kid && (L.facial !== 'none' || greying) ? H_BALD : null;
  if (front) stamp(b, cut(front, hide), 7, 4 + dy);

  // ---- Hat --------------------------------------------------------------------
  if (hat) stamp(b, hat.g, hat.dx, dy);
  if (L.hat === 'bonnet') stamp(b, BONNET_TIE, 15, 31 + dy);

  outline(b);
  // Palette: the sprite's key plus portrait-only letters.
  const key = keyFor(L, false);
  const hr = readableHair(L.hair, L.skin);
  key.b = greying ? (old ? '#e8e4dc' : shade(GREY_HAIR, -0.2)) : fem ? hr.hair : hr.hairD;
  key['@'] = '#fffaf0';
  key.i = iris;
  key.M = mix(key.m!, '#f0a0a0', 0.35);
  if (L.hat === 'cavalry') key.R = '#c4962e';
  const cv = toCanvas(b, key);
  if (cache.size > 120) cache.delete(cache.keys().next().value!);
  cache.set(ck, cv);
  return cv;
}
