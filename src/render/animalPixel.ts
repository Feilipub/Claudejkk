/**
 * Hand-pixelled wildlife parts. Each animal is drawn as text grids (one character
 * per pixel, see render/pixmap.ts) facing right: a torso, heads (alert, grazing,
 * attacking), tails, and a leg spec. render/animalSprite.ts stamps these parts
 * into 40×32 frames, adds the legs for each pose and a tinted outline, and turns
 * the result into a canvas with pixmap().
 *
 * Grid characters (shared by every rig; each rig's key gives the colours):
 *   l light fur (lit top, light from the upper left)   m mid fur   d dark fur
 *   D darkest fur / far side    p pale (belly, rump, throat)    P pale in shade
 *   k near-black accent (nose, hooves, tail tip)   e eye   w eye glint / tooth
 *   n horn or antler   N horn or antler shade   r accent (mouth, wattle, bare head)
 *   h mane / shag   H mane shade   i mane highlight
 *   o outline (explicit inner line; the outer outline is added automatically)
 *   '.' transparent
 */
import { PAL } from './pixmap.ts';

/** One stamped grid and its top-left position in the 40×32 frame (at rest, no bob). */
export interface Part {
  rows: readonly string[];
  x: number;
  y: number;
}

/** Leg drawing spec: stepped 1px columns from the belly to the ground. */
export interface LegSpec {
  /** Attach rows (y) for back and front legs, x for near back / near front. */
  y: number;
  backX: number;
  frontX: number;
  /** Far legs sit this many px from the near ones (they peek out behind). */
  farDx: number;
  /** Leg width in px. */
  t: number;
  /** Characters per column for near and far legs, left to right. */
  near: string;
  far: string;
  /** Hoof/paw character and how many rows it covers. */
  hoof: string;
  hoofRows: number;
  /** Paws: the bottom row reaches one px forward (cats, dogs, bears). */
  paw?: boolean;
  /** Hind legs: the hock juts back by this many px at mid-height. */
  hock?: number;
}

export interface Rig {
  key: Readonly<Record<string, string>>;
  body: Part;
  tail?: { stand: Part; flick?: Part; run?: Part };
  heads: { up: Part; graze: Part; bite?: Part; run?: Part };
  legs: LegSpec;
  /** Extra front-of-body pieces drawn over the near legs (e.g. a bison's beard). */
  over?: Part;
}

// --- Shared colour helpers ---------------------------------------------------
const P = PAL;

// =============================================================================
// DEER family (mule deer, pronghorn, bighorn): slim torso, long legs.
// =============================================================================
const SLIM_BODY = [
  '...llllllllllllll...',
  '.pllmmmmmmmmmmmmlll.',
  'pplmmmmmmmmmmmmmmmml',
  'ppmmmmmmmmmmmmmmmmmm',
  'pPdmmmmmmmmmmmmmmmmd',
  '.PddmmmmmmmmmmmmmmdD',
  '..dddddmmmmmmmmdddD.',
  '...DDDDdPPPPPPdDDD..',
];

const DEER_HEAD_UP = [
  '...N..N...N..',
  '...nN.n..Nn..',
  '....nNnNNn...',
  '.....NnnN....',
  '.dd...NN.....',
  'dmmd..llll...',
  '.dpmdllllll..',
  '..dmmllllllll',
  '...mmllelllll',
  '...mmmmemmmmk',
  '...mmmmmmmPP.',
  '...mmmmpp....',
  '..lmmmmpp....',
  '..lmmmmd.....',
  '.llmmmmd.....',
  '.lmmmmmd.....',
];
const DEER_HEAD_GRAZE = [
  'llll..........',
  'mmmmll........',
  'dmmmmmll......',
  '.dmmmmmml.....',
  '..ddmmmmml....',
  '...ddmmmmml..n',
  '....dd.mmmmnnN',
  '.....dd.llnN..',
  '....dPmdlllN..',
  '.....ddmllllm.',
  '.......mllelm.',
  '.......mmlemm.',
  '.......mmmmmm.',
  '.......dmmmPP.',
  '........dPPk..',
];

const DEER: Rig = {
  key: { o: '#3a1e14', l: '#c98e58', m: '#a46b3e', d: '#7a4a2a', D: '#5a3320', p: P.cream4, P: '#dcc096', O: P.cream0, k: P.wood0, e: P.ink, w: P.white3, n: P.cream3, N: '#8a6a44' },
  body: { rows: SLIM_BODY, x: 8, y: 13 },
  tail: {
    stand: { rows: ['pp', 'pp', 'kk'], x: 7, y: 13 },
    flick: { rows: ['.pp', 'pp.', 'kk.'], x: 6, y: 12 },
    run: { rows: ['kk.', 'ppp', '.pp'], x: 6, y: 11 },
  },
  heads: {
    up: { rows: DEER_HEAD_UP, x: 20, y: 1 },
    graze: { rows: DEER_HEAD_GRAZE, x: 22, y: 14 },
  },
  legs: { y: 20, backX: 10, frontX: 23, farDx: 2, t: 2, near: 'md', far: 'DD', hoof: 'k', hoofRows: 1, hock: 1 },
};

/** The same head moved (used for lowered or lunging poses of heavy-headed animals). */
const moved = (p: Part, dx: number, dy: number): Part => ({ rows: p.rows, x: p.x + dx, y: p.y + dy });

// --- Pronghorn: small, orange-tan with white bands, short black pronged horns.
const PRONG_BODY = [
  '...lllllllllllll..',
  '.pllmmmmmmmmmmmmll',
  'ppmmmmmmmmmmmmmmmm',
  'ppmmmmmmmmmmmmmmmd',
  'pPpmmmmmmmmmmmmmdd',
  '.Pppppppppppppppd.',
  '..PPPPPPPPPPPPPP..',
];
const PRONG_HEAD_UP = [
  '...N.N......',
  '...nNn......',
  '....nN......',
  '.dd.N.......',
  '.dmd.llll...',
  '..dmlllllll.',
  '...mllelllll',
  '...mmmmmmmkk',
  '...mmmmmmmk.',
  '...pppmm....',
  '...mmmmm....',
  '..lpppmm....',
  '..lmmmmd....',
  '.lmmmmmd....',
];
const PRONG_HEAD_GRAZE = [
  'llll.........',
  'mmmmll.......',
  'dmmmmmll.....',
  '.dmmmmmml....',
  '..ddmmmmml...',
  '...ddmmmmml..',
  '....dd.mmmnN.',
  '.....dd.llNn.',
  '....dPmdllll.',
  '.....ddmlllm.',
  '.......mllem.',
  '.......pplmm.',
  '.......mmmmm.',
  '.......mmmkk.',
  '........mkk..',
];
const PRONGHORN: Rig = {
  key: { o: '#3a1c10', l: '#e8a85e', m: '#c87e3c', d: '#94562a', D: '#6a3a1e', p: P.cream4, P: '#dcc8a4', O: '#8a6a44', k: '#2a1c16', e: P.ink, w: P.white3, n: '#4a4248', N: '#1c1618' },
  body: { rows: PRONG_BODY, x: 9, y: 15 },
  tail: {
    stand: { rows: ['pp', 'pp'], x: 8, y: 15 },
    flick: { rows: ['.p', 'pp'], x: 8, y: 14 },
    run: { rows: ['pp.', 'ppp'], x: 7, y: 14 },
  },
  heads: { up: { rows: PRONG_HEAD_UP, x: 20, y: 4 }, graze: { rows: PRONG_HEAD_GRAZE, x: 22, y: 15 } },
  legs: { y: 21, backX: 11, frontX: 23, farDx: 2, t: 2, near: 'md', far: 'DD', hoof: 'k', hoofRows: 1, hock: 1 },
};

// --- Elk: big, pale body, chocolate maned neck, sweeping antlers.
const ELK_BODY = [
  '....llllllllllllllll..',
  '..pllmmmmmmmmmmmmmmll.',
  '.ppmmmmmmmmmmmmmmmmmmd',
  'pppmmmmmmmmmmmmmmmmmdd',
  'ppPdmmmmmmmmmmmmmmmmdd',
  'pPPddmmmmmmmmmmmmmmddd',
  '.PddddmmmmmmmmmmmmdddD',
  '..dDDDdddddddddddDDDD.',
];
const ELK_HEAD_UP = [
  'N...N...N.......',
  '.n...n...n......',
  '..n..n..n..N....',
  '...nNn.nN.n.....',
  '....nNnNnn......',
  '.dd...NnN.......',
  'dmmd.llll.......',
  '.dmdlllllll.....',
  '..hmllelllll....',
  '..hmmmmmmmmmk...',
  '..hhmmmmmmmk....',
  '..hhhhhh........',
  '.hhihhhh........',
  '.hhhhhhH........',
  'hhhhhhhH........',
  'hhhhhhHH........',
];
const ELK_HEAD_GRAZE = [
  'hhhh...........',
  'hhhhhh.........',
  'Hhhhhhhh.......',
  '.HhhhhhhhN.N...',
  '..HHhhhhhhn.n..',
  '...HHhhhhhNn.n.',
  '....HH.mmmNnn..',
  '.....dd.lllNNn.',
  '....dPmdllllN..',
  '.....ddmllllm..',
  '.......mllelm..',
  '.......mmlemm..',
  '.......mmmmmm..',
  '.......mmmmmm..',
  '.......dmmmkk..',
  '........dmkk...',
];
const ELK: Rig = {
  key: { o: '#2c1810', l: '#d2aa78', m: '#b08656', d: '#80603c', D: '#5a3e26', h: '#5e3c24', H: '#402816', i: '#7e5634', p: P.cream3, P: '#d8bc8c', O: P.cream0, k: '#24160e', e: P.ink, w: P.white3, n: P.cream3, N: '#8a6a44' },
  body: { rows: ELK_BODY, x: 6, y: 12 },
  tail: { stand: { rows: ['pp', 'pP'], x: 5, y: 12 }, flick: { rows: ['.p', 'pP'], x: 5, y: 11 } },
  heads: { up: { rows: ELK_HEAD_UP, x: 20, y: 0 }, graze: { rows: ELK_HEAD_GRAZE, x: 21, y: 13 } },
  legs: { y: 19, backX: 9, frontX: 23, farDx: 2, t: 2, near: 'md', far: 'DD', hoof: 'k', hoofRows: 1, hock: 1 },
};

// --- Bighorn sheep: stocky grey-brown, white rump and muzzle, curled horns.
const BIGHORN_BODY = [
  '...llllllllllllll..',
  '.pllmmmmmmmmmmmmll.',
  'ppmmmmmmmmmmmmmmmml',
  'ppmmmmmmmmmmmmmmmmm',
  'pPdmmmmmmmmmmmmmmmd',
  '.PddmmmmmmmmmmmmmdD',
  '..dddppppppppppddD.',
  '...DDPPPPPPPPPPDD..',
];
const BIGHORN_HEAD_UP = [
  '...nnnn.....',
  '..nnNNnn....',
  '.nN...Nnl...',
  '.nN..llNlll.',
  '.nN.lllelll.',
  '..nNNmmmmmpk',
  '...NNmmmmpp.',
  '...mmmmmp...',
  '..lmmmmpp...',
  '..lmmmmmd...',
  '.llmmmmmd...',
];
const BIGHORN_HEAD_GRAZE = [
  'llll.........',
  'mmmmll.......',
  'dmmmmmll.....',
  '.dmmmmmml....',
  '..ddmmmmml...',
  '...ddmmnnnn..',
  '....ddnNNNnn.',
  '.....nN.llNn.',
  '.....nNlllNn.',
  '......nNNlel.',
  '.......nmllm.',
  '.......mmmmm.',
  '.......mmmpp.',
  '........ppkp.',
];
const BIGHORN: Rig = {
  key: { o: '#2e2218', l: '#b89c7c', m: '#937658', d: '#6c543c', D: '#4c3a2a', p: P.cream4, P: '#d8ccb4', O: P.cream0, k: '#2a1e16', e: P.ink, w: P.white3, n: '#dcb880', N: '#9a7a4a' },
  body: { rows: BIGHORN_BODY, x: 9, y: 14 },
  tail: { stand: { rows: ['pp', 'Pk'], x: 8, y: 14 }, flick: { rows: ['.pp', 'pk.'], x: 7, y: 13 } },
  heads: { up: { rows: BIGHORN_HEAD_UP, x: 21, y: 6 }, graze: { rows: BIGHORN_HEAD_GRAZE, x: 22, y: 15 } },
  legs: { y: 21, backX: 11, frontX: 23, farDx: 2, t: 2, near: 'md', far: 'DD', hoof: 'k', hoofRows: 1, hock: 1 },
};

// --- Canids (coyote, wolf): lean body, bushy tail, tall ears, long snout.
const CANID_BODY = [
  '..lllllllllllll..',
  '.lmmmmmmmmmmmmmml',
  'lmmmmmmmmmmmmmmmm',
  'mmmmmmmmmmmmmmmmm',
  '.dmmmmmmmmmmmmmpp',
  '..ddddPPPPPPdddp.',
];
const CANID_TAIL = {
  stand: { rows: ['....ll', '...lmm', '..lmmm', '..mmd.', '.mmd..', '.kk...'], x: 5, y: 15 },
  flick: { rows: ['...llm', '..lmmm', '.lmmm.', '.mmd..', 'kmd...', 'k.....'], x: 5, y: 14 },
  run: { rows: ['.....llm', '..llmmmm', 'kkmmmmd.', 'kkdd....'], x: 3, y: 15 },
};
const CANID_HEAD_UP = [
  '..o.o......',
  '.odoko.....',
  '.dmdmd.....',
  '.mlllll....',
  '.mllelllll.',
  '.mmmmppppk.',
  '.mmmmpppp..',
  'mmmmpp.....',
  'mmmppp.....',
  'mmmpp......',
];
const CANID_HEAD_GRAZE = [
  'mm........',
  'mmml......',
  '.mmmlo.o..',
  '..mmmdodo.',
  '...mmllll.',
  '...mmllel.',
  '....mmmml.',
  '....pmmml.',
  '.....ppml.',
  '.....ppp..',
  '......kk..',
];
const CANID_HEAD_BITE = [
  '..o.o.........',
  '.odoko........',
  '.dmdmd........',
  '.mllllllll....',
  '.mlleelllllk..',
  '.mmmmmmmmmm...',
  '.mmmmpwwrr....',
  'mmmmppppppw...',
  'mmmppp........',
  'mmmpp.........',
];
const canid = (key: Rig['key']): Rig => ({
  key,
  body: { rows: CANID_BODY, x: 10, y: 16 },
  tail: CANID_TAIL,
  heads: { up: { rows: CANID_HEAD_UP, x: 24, y: 9 }, graze: { rows: CANID_HEAD_GRAZE, x: 24, y: 19 }, bite: { rows: CANID_HEAD_BITE, x: 24, y: 10 } },
  legs: { y: 21, backX: 12, frontX: 23, farDx: 2, t: 2, near: 'md', far: 'DD', hoof: 'd', hoofRows: 1, paw: true, hock: 1 },
});
const COYOTE = canid({ o: '#3a2618', l: '#d8ae7c', m: '#b4885a', d: '#846242', D: '#5e4430', p: P.cream3, P: '#c8b08a', O: '#7a6448', k: '#2a2018', e: P.ink, w: P.white3, r: '#7a2020' });
const WOLF = canid({ o: '#24202a', l: '#bcb8b2', m: '#8e8a86', d: '#66625f', D: '#46424a', p: '#ece8e2', P: '#bab4ac', O: '#6a6460', k: '#28242a', e: '#e8b838', w: P.white3, r: '#7a2020' });

// --- Cougar: long low tawny body, small round head, long dark-tipped tail.
const COUGAR_BODY = [
  '...llllllllllllll..',
  '.llmmmmmmmmmmmmmmml',
  'lmmmmmmmmmmmmmmmmmm',
  'mmmmmmmmmmmmmmmmmmm',
  '.dmmmmmmmmmmmmmmmpp',
  '..dddPPPPPPPPPddpp.',
];
const COUGAR_HEAD_UP = [
  '.o..o...',
  'odood...',
  'mllllll.',
  'mllellll',
  'mmmmmppk',
  'mmmmpppp',
  'mmmpppp.',
  'mmmpp...',
];
const COUGAR_HEAD_GRAZE = [
  'mm.......',
  'mmml.....',
  '.mmmlo...',
  '..mmmdo..',
  '...mllll.',
  '...mlell.',
  '...mmmmm.',
  '....mmpp.',
  '....pppk.',
];
const COUGAR_HEAD_BITE = [
  '.o..o.....',
  'odood.....',
  'mllllll...',
  'mlleellll.',
  'mmmmmmmmk.',
  'mmmmwrrw..',
  'mmmprrrr..',
  'mmmppppw..',
  'mmmpp.....',
];
const COUGAR: Rig = {
  key: { o: '#3e2414', l: '#e4b47c', m: '#c4905a', d: '#90663e', D: '#664428', p: P.cream4, P: '#dcc4a0', O: '#8a6a4a', k: '#2a1c14', e: '#3a4a1e', w: P.white3, r: '#8a2a2a' },
  body: { rows: COUGAR_BODY, x: 8, y: 17 },
  tail: {
    stand: { rows: ['.....lm', '....mm.', '...mm..', '..md...', '..md...', '..dk...', '...kk..'], x: 2, y: 17 },
    flick: { rows: ['.....lm', '....mm.', '...md..', '..md...', '.kd....', 'kk.....'], x: 2, y: 17 },
    run: { rows: ['.....llm', '..mmmmm.', 'kkdd....'], x: 1, y: 17 },
  },
  heads: { up: { rows: COUGAR_HEAD_UP, x: 25, y: 12 }, graze: { rows: COUGAR_HEAD_GRAZE, x: 25, y: 21 }, bite: { rows: COUGAR_HEAD_BITE, x: 25, y: 12 } },
  legs: { y: 22, backX: 10, frontX: 23, farDx: 2, t: 2, near: 'md', far: 'DD', hoof: 'd', hoofRows: 1, paw: true, hock: 1 },
};

// --- Black bear: round heavy mass, thick legs, tan muzzle.
const BEAR_BODY = [
  '......lllllllll.....',
  '...llllmmmmmmmmll...',
  '..lmmmmmmmmmmmmmmml.',
  '.lmmmmmmmmmmmmmmmmmm',
  'lmmmmmmmmmmmmmmmmmmm',
  'mmmmmmmmmmmmmmmmmmmm',
  'mmmmmmmmmmmmmmmmmmmd',
  'dmmmmmmmmmmmmmmmmmdd',
  '.ddmmmmmmmmmmmmmmdd.',
  '..ddddddddddddddd...',
];
const BEAR_HEAD_UP = [
  '.oo.......',
  'odmo......',
  '.mllll....',
  '.mllwel...',
  '.mmmmmmpp.',
  '.mmmmmppppk',
  '..mmmmpppp.',
  '..mmmm.....',
];
const BEAR_HEAD_BITE = [
  '.oo........',
  'odmo.......',
  '.mllll.....',
  '.mllwee....',
  '.mmmmmmpppk',
  '.mmmmmwrrw.',
  '..mmmmprrr.',
  '..mmmmpppw.',
];
const BEAR: Rig = {
  key: { o: '#0e0b10', l: '#575060', m: '#36303c', d: '#25202a', D: '#18141c', p: '#b4885a', P: '#7e5a3a', O: '#3a2414', k: '#120e14', e: P.ink, w: '#f0e8d8', r: '#9a3030' },
  body: { rows: BEAR_BODY, x: 7, y: 12 },
  heads: { up: { rows: BEAR_HEAD_UP, x: 25, y: 14 }, graze: { rows: BEAR_HEAD_UP, x: 26, y: 21 }, bite: { rows: BEAR_HEAD_BITE, x: 25, y: 13 } },
  legs: { y: 21, backX: 9, frontX: 21, farDx: 2, t: 3, near: 'mdd', far: 'DDD', hoof: 'k', hoofRows: 1, paw: true },
};

// --- Plains bison: shaggy humped forequarters, low massive head, short horns.
const BISON_BODY = [
  '..............iiiii.....',
  '...........iiihhhhhh....',
  '........llhhhhhhhhhhh...',
  '....lllmmhhhhhhhhhhhhh..',
  '..llmmmmmhhhhhhhhhhhhhh.',
  '.lmmmmmmmmhhhhhhhhhhhhhh',
  'lmmmmmmmmmmhhhhhhhhhhhhh',
  'mmmmmmmmmmmmhhhhhhhhhhhH',
  'dmmmmmmmmmmmmhhhhhhhhhHH',
  '.ddmmmmmmmmmmmHhhhhhhhHH',
  '..ddddddddddddHHhhhhhHH.',
];
const BISON_HEAD = [
  '..N.......',
  '.nN.ii....',
  '.n.ihhh...',
  '..hhhhhh..',
  '.hhhwehhh.',
  'hhhhhhhhhh',
  'hhhhhhhhkk',
  'hhhhhhhkk.',
  '.hhHhhhh..',
  '..HHHHH...',
  '...HHH....',
];
const BISON_HEAD_UP: Part = { rows: BISON_HEAD, x: 26, y: 13 };
const BISON: Rig = {
  key: { o: '#22140c', l: '#a88058', m: '#86603c', d: '#62422a', D: '#44301e', h: '#4e3220', H: '#34200f', i: '#72503a', k: '#1c120c', e: '#100a08', w: P.white3, n: '#9a9088', N: '#2a2424' },
  body: { rows: BISON_BODY, x: 4, y: 11 },
  tail: { stand: { rows: ['mm', 'm.', 'm.', 'hh'], x: 3, y: 12 }, flick: { rows: ['.mm', 'm..', 'hh.'], x: 2, y: 11 }, run: { rows: ['..mm', 'hhm.'], x: 1, y: 10 } },
  heads: { up: BISON_HEAD_UP, graze: moved(BISON_HEAD_UP, 1, 6), bite: moved(BISON_HEAD_UP, 1, 3) },
  over: { rows: ['hhhh...hhhh', 'HhhH...HhhH', '.HH.....HH.'], x: 18, y: 21 },
  legs: { y: 21, backX: 7, frontX: 21, farDx: 3, t: 3, near: 'mdd', far: 'DDD', hoof: 'k', hoofRows: 1 },
};

// --- Longhorn steer: red-brown with a white blaze, very wide horns.
const CATTLE_BODY = [
  '...llllllllllllllllll.',
  '.lllmmmmmmmmmmmmmmmmml',
  'lmmmmmmmpppmmmmmmmmmmm',
  'mmmmmmmppppppmmmmmmmmm',
  'mmmmmmmmpppppmmmmmmmmd',
  'dmmmmmmmmppmmmmmmmmmdd',
  '.dmmmmmmmmmmmmmmmmmdd.',
  '..dddddPPPPPPPPddddd..',
];
const CATTLE_HEAD = [
  'N.............N',
  'nn...........nn',
  '.nnnn.....nnnn.',
  '....nnnnnnn....',
  '.....dmmmm.....',
  '.....mllllm....',
  '.....mlelllm...',
  '.....mmmmmmpp..',
  '.....mmmmmpppk.',
  '....mmmmmpppp..',
  '...mmmmmm......',
  '..mmmmmmd......',
];
const CATTLE_HEAD_UP: Part = { rows: CATTLE_HEAD, x: 18, y: 6 };
const CATTLE: Rig = {
  key: { o: '#3a1a0e', l: '#d8864e', m: '#ae5e32', d: '#80401e', D: '#5a2a16', p: '#f6efe2', P: '#cfc2ae', O: '#8a7a64', k: '#2a1810', e: P.ink, w: P.white3, n: '#f0e4c8', N: '#a08868' },
  body: { rows: CATTLE_BODY, x: 6, y: 13 },
  tail: { stand: { rows: ['m.', 'm.', 'm.', 'm.', 'kk'], x: 5, y: 14 }, flick: { rows: ['.m', 'm.', 'm.', 'kk'], x: 4, y: 14 }, run: { rows: ['..mm', 'kkm.'], x: 3, y: 12 } },
  heads: { up: CATTLE_HEAD_UP, graze: moved(CATTLE_HEAD_UP, 2, 9), bite: moved(CATTLE_HEAD_UP, 2, 4) },
  legs: { y: 21, backX: 9, frontX: 23, farDx: 2, t: 2, near: 'md', far: 'DD', hoof: 'k', hoofRows: 1 },
};

// --- Feral hog: low dark bristly wedge, tusks, short legs.
const BOAR_BODY = [
  '....hhhhhh.......',
  '..lhmhmhmhhll....',
  '.lmmmmmmmmmmmml..',
  'lmmmmmmmmmmmmmmm.',
  'mmmmmmmmmmmmmmmmm',
  'dmmmmmmmmmmmmmmmm',
  '.ddmmmmmmmmmmmmdd',
  '..ddddddddddddd..',
];
const BOAR_HEAD = [
  '.o........',
  'odo.......',
  'mllll.....',
  'mlwelll...',
  'mmmmmmmmpk',
  'mmmmmmwmpk',
  'mmmmmmmw..',
  'mmmmm.....',
];
const BOAR_HEAD_UP: Part = { rows: BOAR_HEAD, x: 24, y: 17 };
const BOAR: Rig = {
  key: { o: '#140e0c', l: '#6e5e54', m: '#4e413a', d: '#362c27', D: '#241c19', h: '#221a17', p: '#c8908a', k: '#1a1210', e: '#0c0808', w: '#f4ecd8' },
  body: { rows: BOAR_BODY, x: 9, y: 17 },
  tail: { stand: { rows: ['.d', 'd.', 'd.'], x: 7, y: 18 }, flick: { rows: ['dd', 'd.'], x: 7, y: 17 } },
  heads: { up: BOAR_HEAD_UP, graze: moved(BOAR_HEAD_UP, 1, 4), bite: moved(BOAR_HEAD_UP, 1, 1) },
  legs: { y: 24, backX: 11, frontX: 21, farDx: 2, t: 2, near: 'md', far: 'DD', hoof: 'k', hoofRows: 1 },
};

/** All drawn rigs by species id. */
export const RIGS: Record<string, Rig> = {
  deer: DEER,
  elk: ELK,
  pronghorn: PRONGHORN,
  bighorn: BIGHORN,
  coyote: COYOTE,
  wolf: WOLF,
  cougar: COUGAR,
  bear: BEAR,
  bison: BISON,
  cattle: CATTLE,
  boar: BOAR,
  // Never drawn through this path (mustangs are horse entities); a bay-recoloured deer frame keeps it safe.
  wildHorse: { ...DEER, key: { ...DEER.key, n: DEER.key.m!, N: DEER.key.m! } },
};

// =============================================================================
// Whole-frame sprites: rabbit, birds and snake are small enough to draw each
// pose complete. Frames are centred on the 40×32 canvas, feet on the ground row.
// Extra characters: f feet/legs   y beak   s bare head skin   h head/cap colour   t tail
// =============================================================================
type Anim = 'idle' | 'walk' | 'run' | 'eat' | 'dead' | 'attack' | 'fly';
export interface GridDef {
  key: Readonly<Record<string, string>>;
  frames: Record<string, readonly string[]>;
  seq: Record<Anim, string[]>;
  /** Horizontal offset from centre. */
  x: number;
  /** Frames drawn above the ground row by this many px (hops, flight). */
  air?: Record<string, number>;
}

// --- Jackrabbit: long black-tipped ears, big hind feet. -----------------------
const RABBIT_FRAMES = {
  sit: [
    '.....kk.kk..',
    '.....dm.mr..',
    '.....dm.mr..',
    '......dmmr..',
    '......dmmm..',
    '.....mllll..',
    '....mllllll.',
    '....mllelll.',
    '....mmmmmmmr',
    '..lllmmmmpp.',
    '.lmmmmmmmmp.',
    'lmmmmmmmmpp.',
    'pmmmmmmmmpp.',
    'pddmmmdmdpp.',
    '.DDDdddd.dd.',
  ],
  sit2: [
    '...kk..kk...',
    '...dmm.mr...',
    '....dmmmr...',
    '.....dmmr...',
    '......dmmm..',
    '.....mllll..',
    '....mllllll.',
    '....mllelll.',
    '....mmmmmmmr',
    '..lllmmmmpp.',
    '.lmmmmmmmmp.',
    'lmmmmmmmmpp.',
    'pmmmmmmmmpp.',
    'pddmmmdmdpp.',
    '.DDDdddd.dd.',
  ],
  gather: [
    '...kkk.......',
    '....kdmmr....',
    '......dmmr...',
    '......mllll..',
    '..lllmllelll.',
    '.lmmmmmmmmmmr',
    'lmmmmmmmmmpp.',
    'pmmmmmmmmpp..',
    'pmmmmmmmdp...',
    '.ddddmmdd....',
    'DDDD..dddd...',
  ],
  stretch: [
    '.......kkdmm.....',
    '.........kdmrll..',
    '...lllllll.mllll.',
    '.lmmmmmmmmmmllelr',
    'pmmmmmmmmmmmmmmm.',
    'pmmmmmmmmmmmmpp..',
    'DDdmmmmmmmmmppd..',
    'DD...dddd...pdd..',
  ],
  eat: [
    '..kk.........',
    '...dmr.......',
    '....dmr......',
    '..lllmmr.....',
    '.lmmmmmmll...',
    'lmmmmmmmllll.',
    'mmmmmmmmllell',
    'pmmmmmmmmmmmr',
    'pmmmmmmmmmpp.',
    'pddmmmdmdpp..',
    '.DDDdddd.dd..',
  ],
  eat2: [
    '.kk..........',
    '..ddmr.......',
    '....dmr......',
    '..lllmmr.....',
    '.lmmmmmmll...',
    'lmmmmmmmllll.',
    'mmmmmmmmllell',
    'pmmmmmmmmmmmm',
    'pmmmmmmmmmppr',
    'pddmmmdmdpp..',
    '.DDDdddd.dd..',
  ],
  dead: [
    '..llllllll.....',
    '.lmmmmmmmmlllkk',
    'pmmmmmmmmmmddmm',
    'pmmmmmmmmmmmmd.',
    '.DDDdddppdddd..',
  ],
};
export const RABBIT: GridDef = {
  key: { o: '#3a2a1c', l: '#d2bc9c', m: '#a89072', d: '#7c664c', D: '#5a4832', p: P.cream4, P: '#d8ccb4', O: '#8a7a64', k: '#241a14', r: '#e0a090', e: P.ink, w: P.white3 },
  frames: RABBIT_FRAMES,
  seq: {
    idle: ['sit', 'sit2'],
    walk: ['sit', 'gather', 'stretch', 'gather'],
    run: ['gather', 'stretch', 'stretch', 'gather', 'gather'],
    eat: ['eat', 'eat2'],
    attack: ['sit', 'sit2'],
    fly: [],
    dead: ['dead'],
  },
  x: 0,
  air: { stretch: 3 },
};

// --- Birds ---------------------------------------------------------------------
// Flight is seen from above (wings spread across the screen), which reads best
// in a top-down world. One full-spread drawing: broad wing roots that taper to
// swept-back fingered tips, lit leading edge, dark trailing edge, fanned tail 't'.
// The flap frames keep fewer wing rows (the wings foreshorten as they rise).
const SOAR = [
  '....DD.........',
  '...DdD.........',
  '...ddm.........',
  '...dmm.........',
  '....dml........',
  '....dmml.......',
  '....dmmml......',
  'tt..ddmmml.....',
  'tttmmmmmmmhhyk.',
  'tt..ddmmmm.....',
  '....dmmmm......',
  '....dmmm.......',
  '....dmm........',
  '...dmm.........',
  '...ddm.........',
  '...DdD.........',
  '....DD.........',
];
const pick = (rows: string[], keep: number[]): string[] => keep.map((i) => rows[i]!);
const flyFrames = (): Record<string, string[]> => ({
  f1: SOAR,
  f2: pick(SOAR, [0, 1, 4, 6, 7, 8, 9, 10, 12, 15, 16]),
  f3: pick(SOAR, [1, 6, 7, 8, 9, 10, 15]),
});

const raptorPerch = [
  '...hhh...',
  '..hlllh..',
  '..hlehyk.',
  '..hhllyk.',
  '.mmmpppm.',
  'mdmmpppm.',
  'mddmpPpm.',
  'mdddpPpm.',
  '.mddmPpm.',
  '.rmddmm..',
  '.rr.f.f..',
  'rrr.f.f..',
  '.r.ff.ff.',
];
const raptor = (key: Record<string, string>): GridDef => ({
  key,
  frames: { perch: raptorPerch, perch2: raptorPerch.map((r, i) => (i === 2 ? '..hllhyk.' : r)), ...flyFrames(), dead: ['.....hhh..', 'rrmmmmmmhyk', 'rrmdddmmmh.', '..ff..ff...'] },
  seq: { idle: ['perch', 'perch2'], walk: ['perch', 'perch2', 'perch', 'perch2'], run: ['perch', 'perch2', 'perch', 'perch2'], eat: ['perch', 'perch2'], attack: ['perch'], fly: ['f1', 'f2', 'f3', 'f2'], dead: ['dead'] },
  x: 0,
  air: { f1: 4, f2: 4, f3: 4 },
});

export const BIRDS: Record<string, GridDef> = {
  hawk: raptor({ o: '#2e1a10', l: '#b88050', m: '#8e5c36', d: '#623e22', D: '#40261a', h: '#8e5c36', p: P.cream3, P: '#d8c09a', O: '#8a6a44', r: '#c8582e', t: '#c8582e', y: '#e8b838', f: '#e8b838', k: P.ink, e: P.ink }),
  vulture: raptor({ o: '#141014', l: '#6a6268', m: '#3c3438', d: '#2a2428', D: '#1a1618', h: '#c4483a', p: '#4a4246', P: '#38323a', r: '#2e282c', t: '#2e282c', y: '#efe2d0', f: '#d8c8c0', k: '#efe2d0', e: P.ink }),
  duck: {
    key: { o: '#1e2420', l: '#c8c4be', m: '#a4a09a', d: '#76726e', D: '#4e4a48', h: '#2e8a44', H: '#1e5a2e', p: P.white3, r: '#8e4a2a', k: '#2a2622', y: '#f0c838', f: '#f08a2a', e: P.ink },
    frames: {
      stand: ['......hhh..', '.....hhHhh.', '.....hhehyy', '......hhh..', '......pp...', '.kllllrrr..', 'kkmmmmmrrr.', '.kmmmmmrr..', '..dmmmmd...', '....f.f....', '...ff.ff...'],
      step: ['......hhh..', '.....hhHhh.', '.....hhehyy', '......hhh..', '......pp...', '.kllllrrr..', 'kkmmmmmrrr.', '.kmmmmmrr..', '..dmmmmd...', '....f..f...', '...ff...ff.'],
      peck: ['...........', '...........', '...........', '...........', '.kllll.....', 'kkmmmmrrr..', '.kmmmmmrrpp', '..dmmmmdhhh', '.......hehy', '....f.f.hy.', '...ff.ff...'],
      f1: ['...DD......', '...dml.....', '....dml....', '....dmml...', 'kk..ddmmhh.', 'kkmmmmmmhhy', 'kk..ddmmhh.', '....dmm....', '....dm.....', '...dm......', '...DD......'],
      f2: ['...DD......', '....dml....', '....dmml...', 'kk..ddmmhh.', 'kkmmmmmmhhy', 'kk..ddmmhh.', '....dmm....', '...dm......', '...DD......'],
      f3: ['....Dd.....', '....dmml...', 'kk..ddmmhh.', 'kkmmmmmmhhy', 'kk..ddmmhh.', '....dmm....', '....DD.....'],
      dead: ['.......hh..', '.kllllmhehy', 'kkmmmmmrrr.', '..f.f......'],
    },
    seq: { idle: ['stand', 'stand'], walk: ['stand', 'step', 'stand', 'step'], run: ['stand', 'step', 'stand', 'step'], eat: ['peck', 'stand'], attack: ['stand'], fly: ['f1', 'f2', 'f3', 'f2'], dead: ['dead'] },
    x: 0,
    air: { f1: 4, f2: 4, f3: 4 },
  },
  heron: {
    key: { o: '#1c2230', l: '#b4c2d0', m: '#7e8ea2', d: '#5a687c', D: '#3e4a5c', h: '#7e8ea2', p: '#e8ecf0', k: '#1e2430', y: '#e0b040', f: '#8a8048', r: '#8a8048', t: '#8a8048', e: P.ink },
    frames: {
      stand: ['...kk......', '..kllk.....', '.k.lleyyyy.', '...lll.....', '....ll.....', '....pl.....', '...pl......', '...pl......', '...plm.....', '..mmmmmm...', '.mmmmmmmm..', 'mdddmmmmm..', 'dddddmmmm..', '.dd.ddmm...', '.....ff....', '.....f.f...', '.....f.f...', '.....f.f...', '.....f.f...', '.....f.f...', '....ff.ff..'],
      step: ['...kk......', '..kllk.....', '.k.lleyyyy.', '...lll.....', '....ll.....', '....pl.....', '...pl......', '...pl......', '...plm.....', '..mmmmmm...', '.mmmmmmmm..', 'mdddmmmmm..', 'dddddmmmm..', '.dd.ddmm...', '.....ff....', '.....f.f...', '....f...f..', '....f...f..', '...f....f..', '...f.....f.', '..ff.....ff'],
      peck: ['...........', '...........', '...........', '...........', '...........', '...........', '...........', '...........', '..mmmmmm...', '.mmmmmmmmpl', 'mdddmmmmm.l', 'dddddmmmm.ll', '.dd.ddmm..lel', '.....ff....kky', '.....f.f.....y', '.....f.f......', '.....f.f......', '.....f.f......', '.....f.f......', '.....f.f......', '....ff.ff.....'],
      dead: ['..........kk..', '.mmmmmmlllley', 'dddddmmmpp...', '.ff.ff.......'],
      ...flyFrames(),
    },
    seq: { idle: ['stand', 'stand'], walk: ['stand', 'step', 'stand', 'step'], run: ['stand', 'step', 'stand', 'step'], eat: ['peck', 'stand'], attack: ['stand'], fly: ['f1', 'f2', 'f3', 'f2'], dead: ['dead'] },
    x: 0,
    air: { f1: 4, f2: 4, f3: 4 },
  },
  turkey: {
    key: { o: '#1c140e', l: '#8a7052', m: '#5a4630', d: '#3e3020', D: '#2a2016', h: '#9ab0c4', s: '#9ab0c4', r: '#c83a2a', y: '#d8c8a0', f: '#c87a5a', p: '#d8c8a0', t: '#8a7052', k: '#2a2016', e: P.ink },
    frames: {
      stand: ['........ss..', '.......ssesy', '.......srr..', '.......rr...', '.pl....mm...', 'lmml..mmm...', 'plmml.mmmm..', 'lmmmmmmmmmm.', 'pmmdmmmmmmm.', '.mddmmmmmmd.', '..dddmmmdd..', '.....f.f....', '....ff.ff...'],
      step: ['........ss..', '.......ssesy', '.......srr..', '.......rr...', '.pl....mm...', 'lmml..mmm...', 'plmml.mmmm..', 'lmmmmmmmmmm.', 'pmmdmmmmmmm.', '.mddmmmmmmd.', '..dddmmmdd..', '.....f..f...', '....ff...ff.'],
      peck: ['............', '............', '............', '............', '.pl.........', 'lmml........', 'plmml.mmm...', 'lmmmmmmmmm..', 'pmmdmmmmmmms', '.mddmmmmmmsse', '..dddmmmdd.rsy', '.....f.f...r.', '....ff.ff....'],
      dead: ['.pl.....ss..', 'lmmmmmmmmesy', 'pmddmmmmrr..', '..f.f.......'],
      ...flyFrames(),
    },
    seq: { idle: ['stand', 'stand'], walk: ['stand', 'step', 'stand', 'step'], run: ['stand', 'step', 'stand', 'step'], eat: ['peck', 'stand'], attack: ['stand'], fly: ['f1', 'f2', 'f3', 'f2'], dead: ['dead'] },
    x: 0,
    air: { f1: 4, f2: 4, f3: 4 },
  },
};

// --- Rattlesnake: tan with dark diamond saddles, rattle at the tail. -----------
// Each frame is one body wave laid out column by column: a 3px body (lit back,
// mid flank, shaded belly) whose centre steps in runs of 3–4 px, never zig-zags.
const SNAKE_WAVE = [0, 0, 0, 1, 1, 1, 1, 0, 0, 0, -1, -1, -1, -1];
const snakeFrame = (phase: number, dead: boolean): string[] => {
  const len = 20;
  const rows = Array.from({ length: 6 }, () => Array<string>(len + 6).fill('.'));
  const yAt = (x: number) => 1 + (dead ? 0 : SNAKE_WAVE[(x + phase) % SNAKE_WAVE.length]!);
  for (let x = 0; x < len; x++) {
    const y = yAt(x);
    const rattle = x < 3;
    // Saddles: a 3-wide dark diamond every 5 px (wider on the back than the flank).
    const s5 = (x + 2) % 5;
    const back = rattle ? (x === 1 ? 'k' : 'P') : s5 < 3 ? 'd' : 'l';
    const mid = rattle ? (x === 1 ? 'k' : 'P') : s5 === 1 ? 'd' : 'm';
    const belly = rattle ? (x === 1 ? 'k' : 'P') : 'D';
    rows[y]![x + 1] = back;
    rows[y + 1]![x + 1] = mid;
    rows[y + 2]![x + 1] = belly;
  }
  const hy = yAt(len - 1);
  const head = dead ? ['ll..', 'mmd.', 'DD..'] : ['lll.', 'mmmel', 'DDDd'];
  head.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] !== '.') rows[hy + j]![len + 1 + i] = r[i]!; });
  if (!dead && phase % 2 === 0) rows[hy + 1]![len + 6 - 1] = 'r';
  return rows.map((r) => r.join(''));
};
export const SNAKE: GridDef = {
  key: { o: '#2a2016', l: '#d4b884', m: '#a88a58', d: '#5a3e24', D: '#7a6240', P: '#d8c8a0', k: '#3a2e20', e: P.ink, r: '#c83a3a' },
  frames: { s1: snakeFrame(0, false), s2: snakeFrame(3, false), s3: snakeFrame(7, false), s4: snakeFrame(10, false), dead: snakeFrame(0, true) },
  seq: { idle: ['s1', 's2', 's3', 's4'], walk: ['s1', 's2', 's3', 's4'], run: ['s1', 's2', 's3', 's4'], eat: ['s1', 's2', 's3', 's4'], attack: ['s1', 's2', 's3', 's4'], fly: ['s1', 's2', 's3', 's4'], dead: ['dead'] },
  x: 0,
};
