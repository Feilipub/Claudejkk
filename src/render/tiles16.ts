/**
 * Hand-drawn 16×16 ground tiles. Every ground type is drawn as a small set of
 * text-grid tiles (one character per pixel, see pixmap.ts) and mapped through a
 * material key onto the master palette: mostly one calm flat colour, with a few
 * deliberate clusters (a tuft, a pebble pair, a crack, a plank knot). The chunk
 * painter in terrain.ts blits these and lays hand-drawn edge masks over the
 * seams, so the ground reads as a crafted tileset rather than painted noise.
 *
 * Pattern characters (shared by every material key):
 *   a = base, b = shade (one step darker), c = light (one step lighter),
 *   d = deep shade, e = highlight, f/g/h = per-material accents.
 */
import { G } from '../world/tiles.ts';
import { PAL, pixmap } from './pixmap.ts';

type Grid = readonly string[];

// ---------------------------------------------------------------------------
// Patterns. Variants 0–1 are calm (most of the ground), 2–3 carry one small
// deliberate detail. Light comes from the upper-left.
// ---------------------------------------------------------------------------

/** Short meadow grass: flat green with a few small blade tufts. */
const GRASS: Grid[] = [
  [
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaacacaaaaaaaaa',
    'aaaababaaaaaaaaa',
    'aaaaabaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
  ],
  [
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaacacaaa',
    'aaaaaaaaaababaaa',
    'aaaaaaaaaaabaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
  ],
  [
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaacacacaaa',
    'aaaaaaaabababaaa',
    'aaaaaaaaababaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aacacaaaaaaaaaaa',
    'aababaaaaaaaaaaa',
    'aaabaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
  ],
  [
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaffaaaaaaaaa',
    'aaaaafbaaaaaaaaa',
    'aaaaaabaafaaaaaa',
    'aaaaaaaaabaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaacacaa',
    'aaaaaaaaaaababaa',
    'aaaaaaaaaaaabaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
  ],
];

/** Prairie: taller, denser blades with sun-cured tips. */
const TALL: Grid[] = [
  [
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaeaaaaaaaaaaaa',
    'aaacaecaaaaaaaaa',
    'aaabacbaaaaaaaaa',
    'aaaabbaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaeaaaa',
    'aaaaaaaaaecaacaa',
    'aaaaaaaaacbacbaa',
    'aaaaaaaaaabbbaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
  ],
  [
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaeaaaa',
    'aaaaaaaaaacacaaa',
    'aaaaaaaaaabcbaaa',
    'aaaaaaaaaaabaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaeaaaaaaaaaaaaa',
    'aacaecaaaaaaaaaa',
    'aabacbaaaaaaaaaa',
    'aaabbaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
  ],
  [
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaeaaeaaaaaa',
    'aaaaaecaacaeaaaa',
    'aaaaacbacbacaaaa',
    'aaaaabaabaabaaaa',
    'aaaaaabbbbbaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
  ],
  [
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaafaaaaa',
    'aaaaaaaaaagaaaaa',
    'aaaaaaaaaagbaaaa',
    'aaaaaaaaaabaaaaa',
    'aaeaaaaaaabaaaaa',
    'aacaeaaaaaaaaaaa',
    'aabacaaaaaaaaaaa',
    'aaabbaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
  ],
];

/** Forest floor: dark moss with needle drifts, a twig, a leaf. */
const FOREST: Grid[] = [
  [
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaabbaaaaaaaaaaa',
    'aabbbbaaaaaaaaaa',
    'aaabbaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaecaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
  ],
  [
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaacaaaaa',
    'aaaaaaaaacbcaaaa',
    'aaaaaaaaaabaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaabbaaaaaaaaa',
    'aaaabbbbaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
  ],
  [
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaeeaaaaaaaaaa',
    'aaaaafeeaaaaaaaa',
    'aaaaaaafeaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaabbaa',
    'aaaaaaaaaaabbbba',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
  ],
  [
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaahhaaa',
    'aaaaaaaaaagggbaa',
    'aaaaaaaaaaabbaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaacaaaaaaaaaaa',
    'aaacbcaaaaaaaaaa',
    'aaaabaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
  ],
];

/** Bare earth (dirt, sand, hardpan floors): one flat colour, sparse pebble pairs. */
const EARTH: Grid[] = [
  [
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
  ],
  [
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaacaaaa',
    'aaaaaaaaaaaabaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
  ],
  [
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaecaaaaaaaaaa',
    'aaaacbbaaaaaaaaa',
    'aaaaabaacaaaaaaa',
    'aaaaaaaaabaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
  ],
  [
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaecaaaa',
    'aaaaaaaaaacbbaaa',
    'aaaaaaaaaaabbaaa',
    'aaaaaaaaaaaaaaaa',
    'aacaaaaaaaaaaaaa',
    'aaabaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
  ],
];

/** Roads and streets: packed earth, hoof-dimples and a stone; ruts are laid on top. */
const ROAD: Grid[] = [
  EARTH[0]!,
  [
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaabaaaaaaaaa',
    'aaaaaacaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaabaaa',
    'aaaaaaaaaaaacaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
  ],
  [
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaeeaaaaa',
    'aaaaaaaaecbbaaaa',
    'aaaaaaaaabbdaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
  ],
  EARTH[1]!,
];

/** Hardpan / salt: dried clay plates outlined by a few cracks. */
const CRACK: Grid[] = [
  EARTH[0]!,
  EARTH[1]!,
  [
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaabaaaaaaaaaa',
    'aaaaacbaaaaaaaaa',
    'aaaaaaacbaaaaaaa',
    'aaaaaaaacbbaaaaa',
    'aaaaaaaacaacbaaa',
    'aaaaaaacbaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
  ],
  [
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaabbaaaaaaaaaaa',
    'aaacabbaaaaaaaaa',
    'aaaaacabbbaaaaaa',
    'aaaaaaacaacbaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
  ],
];

/** Wind-rippled sand: a couple of crescent ripples with a lit crest. */
const SAND: Grid[] = [
  EARTH[0]!,
  [
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaccccaaaaaaaaa',
    'aaaabbbbaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
  ],
  [
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaacccccaa',
    'aaaaaaaaaabbbbaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaacccaaaaaaaaaa',
    'aaaabbbaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
  ],
  EARTH[2]!,
];

/** Dry wash: pale sand with rounded cobbles strewn along the channel. */
const WASH: Grid[] = [
  EARTH[0]!,
  SAND[1]!,
  [
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaeeaaaaaaaaa',
    'aaaaeffdaaaaaaaa',
    'aaaaadddaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaeaaaa',
    'aaaaaaaaaaefdaaa',
    'aaaaaaaaaaaddaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
  ],
  [
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaeaaaaaa',
    'aaaaaaaaefdaaaaa',
    'aaaaaaaaaddaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
  ],
];

/** Bare rock: flat slabs with a lit top edge and a dark joint. */
const ROCK: Grid[] = [
  [
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
  ],
  [
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaccccaaaaa',
    'aaaaaabbbbbcaaaa',
    'aaaaaaaaaaabaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
  ],
  [
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaccccccaaaaaaa',
    'aaabbbbbbccaaaaa',
    'aaaaaaaaabbaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaadaaaa',
    'aaaaaaaaaadaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
  ],
  [
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaecaaaaa',
    'aaaaaaaaecbbaaaa',
    'aaaaaaaaabbdaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaffaaaaaaaaaa',
    'aaafgaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
  ],
];

/** Snow: bright and flat, a wind scallop here and there. */
const SNOW: Grid[] = [
  EARTH[0]!,
  [
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaacccaaaa',
    'aaaaaaaabbbbcaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
  ],
  [
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaccaaaaaaaaaa',
    'aaabbbcaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaccaaa',
    'aaaaaaaaaabbbcaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
  ],
  EARTH[0]!,
];

/** Ice: pale blue with a lit glint streak and a hairline crack. */
const ICE: Grid[] = [
  EARTH[0]!,
  [
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaeaaaa',
    'aaaaaaaaaaeaaaaa',
    'aaaaaaaaaeaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
  ],
  [
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaabaaaaaaaaaaaa',
    'aaaabaaaaaaaaaaa',
    'aaaaabbaaaaaaaaa',
    'aaaaaaabaaaaaaaa',
    'aaaaaaabaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
  ],
  EARTH[0]!,
];

/** Mud: dark wet earth with a small puddle catching the sky. */
const MUD: Grid[] = [
  EARTH[0]!,
  EARTH[1]!,
  [
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaabbbbaaaaaaa',
    'aaaabfefffbaaaaa',
    'aaaacffffffcaaaa',
    'aaaaaccfffcaaaaa',
    'aaaaaaaccaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
  ],
];

/** Tilled field: furrows running east–west, a lit ridge over each dark trench. */
const FARM: Grid[] = [
  [
    'cccccccccccccccc',
    'aaaaaaaaaaaaaaaa',
    'bbbbbbbbbbbbbbbb',
    'dddddddddddddddd',
    'cccccccccccccccc',
    'aaaaaaaaaaaaaaaa',
    'bbbbbbbbbbbbbbbb',
    'dddddddddddddddd',
    'cccccccccccccccc',
    'aaaaaaaaaaaaaaaa',
    'bbbbbbbbbbbbbbbb',
    'dddddddddddddddd',
    'cccccccccccccccc',
    'aaaaaaaaaaaaaaaa',
    'bbbbbbbbbbbbbbbb',
    'dddddddddddddddd',
  ],
  [
    'cccccccccccccccc',
    'aaaaaaaaaaaaaaaa',
    'bbbbbbbbbbbbbbbb',
    'ddddddddddbddddd',
    'cccccccccccccccc',
    'aaaaaaaaaaaaaaaa',
    'bbbbbbbbbbbbbbbb',
    'dddddddddddddddd',
    'ccccecccccccccec',
    'aaaaaaaaaaaaaaaa',
    'bbbbbbbbbbbbbbbb',
    'dddddddddddddddd',
    'cccccccccccccccc',
    'aaaaaaaaaaaaaaaa',
    'bbbbbbbbbbbbbbbb',
    'ddbddddddddddddd',
  ],
];

/** Floorboards: 4-px planks, staggered butt joints, a knot and a nail pair. */
const PLANK: Grid[] = [
  [
    'cccccccccccccccc',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'dddddddddddddddd',
    'cccccccccdcccccc',
    'aaaaaaaaadaaaaaa',
    'aaaaaaaaadaaaaaa',
    'dddddddddddddddd',
    'ccccdccccccccccc',
    'aaaadaaaaaaaaaaa',
    'aaaadaaaaaaaaaaa',
    'dddddddddddddddd',
    'cccccccccccccdcc',
    'aaaaaaaaaaaaadaa',
    'aaaaaaaaaaaaadaa',
    'dddddddddddddddd',
  ],
  [
    'cccccccccccccccc',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'dddddddddddddddd',
    'cccccccccccccccc',
    'aaaaaaabbaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'dddddddddddddddd',
    'cccccccccccdcccc',
    'aaaaaaaaaaadaaaa',
    'aaaaaaaaaaadaaaa',
    'dddddddddddddddd',
    'ccdccccccccccccc',
    'aadaaaaaaaaaaaaa',
    'aadaaaaaaaaaaaaa',
    'dddddddddddddddd',
  ],
  [
    'cccccccccccccccc',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'dddddddddddddddd',
    'cccccdcccccccccc',
    'aaaaadaaaaaaaaaa',
    'aaaaadaaaaaaaaaa',
    'dddddddddddddddd',
    'cccccccccccccccc',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'dddddddddddddddd',
    'cccccccccdcccccc',
    'aeaaaaaaadaaaaaa',
    'aaaaaaaaadaaaeaa',
    'dddddddddddddddd',
  ],
];

/** Water: calm surface, a short ripple dash or two (the renderer animates glints). */
const WATER: Grid[] = [
  EARTH[0]!,
  [
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaccaaaaaaaaaa',
    'aaacbbcaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
  ],
  [
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaccaaaa',
    'aaaaaaaaacbbbcaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
  ],
  EARTH[0]!,
];

// ---------------------------------------------------------------------------
// Cliff faces: banded strata, a lit cap at the rim, a shaded foot with scree.
// ---------------------------------------------------------------------------

/** Cliff rim tile (top row of a face): lit cap rock, undercut shadow, then beds. */
const CLIFF_TOP: Grid = [
  'eeeeeeeeeeeeeeee',
  'cccccccccccccccc',
  'ccccaccccccccacc',
  'dddddddddddddddd',
  'bbbbbbbbbbbbbbbb',
  'aaaaaaaaaaaaaaaa',
  'aaaaaaaaaaaaaaaa',
  'aaaaaaaaaaaaaaaa',
  'aaaaaaaaaaaaaaaa',
  'bbbbbbbaaaaabbbb',
  'cccccccbbbbbcccc',
  'aaaaaaacccccaaaa',
  'aaaaaaaaaaaaaaaa',
  'aaaaaaaaaaaaaaaa',
  'aaaaaaaaaaaaaaaa',
  'bbbbbbbbbbbbbbbb',
];

/** Cliff body tiles: continuous strata beds (lit ledge, body, undercut) with a dip and one long crack. */
const CLIFF_MID: Grid[] = [
  [
    'cccccccccccccccc',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaacdaaaa',
    'aaaaaaaaaacdaaaa',
    'aaaaaaaaaaadaaaa',
    'bbbbaaaaabbbbbbb',
    'ccccbbbbbccccccc',
    'aaaacccccaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'bbbbbbbbbbbbbbbb',
    'cccccccccccccccc',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'bbbbbbbbbbbbbbbb',
  ],
  [
    'cccccccccccccccc',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'bbbbbbbbbbbbbbbb',
    'dddddddddddddddd',
    'bbbbbbbbbbbbbbbb',
    'cccccccccccccccc',
    'aaaaaaaaaaaaaaaa',
    'aacdaaaaaaaaaaaa',
    'aacdaaaaaaaaaaaa',
    'aaadaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'bbbbbbbbbbbbbbbb',
  ],
];

/** Cliff foot: the lowest bed in shade, with fallen scree against the base. */
const CLIFF_BOT: Grid = [
  'cccccccccccccccc',
  'aaaaaaaaaaaaaaaa',
  'aaaaaaaaaaaaaaaa',
  'aaaaaacdaaaaaaaa',
  'aaaaaacdaaaaaaaa',
  'bbbbbbbdbbbbbbbb',
  'cccccccccccccccc',
  'aaaaaaaaaaaaaaaa',
  'aaaaaaaaaaaaaaaa',
  'aaaaaaaaaaaaaaaa',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbcbbbbbbbbbcbb',
  'ddcaddddddddcadd',
  'ddbbddddddddbbdd',
];

/** One-tile cliff (the common case): lit cap, two beds, a shaded foot with scree. */
const CLIFF_ONE: Grid = [
  'eeeeeeeeeeeeeeee',
  'cccccccccccccccc',
  'ccaccccccccccacc',
  'dddddddddddddddd',
  'bbbbbbbbbbbbbbbb',
  'aaaaaaaaaaaaaaaa',
  'aaaaaaaaacdaaaaa',
  'aaaaaaaaacdaaaaa',
  'bbbbaaaaabbbbbbb',
  'ccccbbbbbccccccc',
  'aaaacccccaaaaaaa',
  'aaaaaaaaaaaaaaaa',
  'bbbbbbbbbbbbbbbb',
  'bbcbbbbbbbbbbcbb',
  'dcaadddddddddcad',
  'ddbbddddddddddbd',
];

// ---------------------------------------------------------------------------
// Transition masks ('#' = covered by the higher ground). Drawn for the north
// edge and the north-west corner; the others are rotations/mirrors. Every edge
// is 4 px deep at both ends so neighbouring pieces always join.
// ---------------------------------------------------------------------------

/** Grassy edges: a scalloped fringe of blades hanging over the lower ground. */
const EDGE_GRASS: Grid[] = [
  [
    '################',
    '################',
    '################',
    '################',
    '.##.####.###.##.',
    '..#..##...#...#.',
    '......#.........',
  ],
  [
    '################',
    '################',
    '################',
    '################',
    '.###.###.####.#.',
    '..#...#...##....',
    '...........#....',
  ],
];
/** Smooth organic edges for bare grounds (rock, snow, sand, water banks). */
const EDGE_PLAIN: Grid[] = [
  [
    '################',
    '################',
    '################',
    '################',
    '..###########...',
    '....######......',
  ],
  [
    '################',
    '################',
    '################',
    '################',
    '.....#########..',
    '......#####.....',
  ],
];
/** Outer corner nub (higher ground only diagonally north-west). */
const CORNER_OUT: Grid = ['####', '####', '###.', '##..'];
/** Inner corner fill (higher ground both north and west): rounds the concave join. */
const CORNER_IN: Grid = ['....', '....', '....', '....', '....##', '....#'];

// ---------------------------------------------------------------------------
// Materials: which pattern and which palette entries each ground uses.
// ---------------------------------------------------------------------------

interface Material {
  pat: Grid[];
  key: Record<string, string>;
  /** Organic texture that may be mirrored for extra variety. */
  flip?: boolean;
}

const k = (a: string, b: string, c: string, d: string, e: string, extra: Record<string, string> = {}) => ({ a, b, c, d, e, ...extra });

/** Ground id → material. Prairie uses three literal olive tones between the grass and dry ramps. */
const MATERIALS: Record<number, Material> = {
  [G.Grass]: { pat: GRASS, key: k('grass3', 'grass2', 'grass4', 'grass1', 'grass5', { f: 'snowflower', g: 'sun' }), flip: true },
  [G.TallGrass]: { pat: TALL, key: k('#87a042', '#68853a', '#a9b458', '#4f6a2e', 'dry4', { f: 'lupineL', g: 'lupine' }), flip: true },
  [G.DryGrass]: { pat: TALL, key: k('dry3', 'dry2', 'dry4', 'dry1', 'dry5', { f: 'poppyL', g: 'poppy' }), flip: true },
  [G.ForestFloor]: { pat: FOREST, key: k('grass1', 'grass0', 'grass2', 'inkGreen', 'dirt3', { f: 'dirt2', g: 'gold2', h: 'gold3' }), flip: true },
  [G.Dirt]: { pat: EARTH, key: k('dirt3', 'dirt2', 'dirt4', 'dirt1', 'dirt5'), flip: true },
  [G.Road]: { pat: ROAD, key: k('dirt4', 'dirt3', 'dirt5', 'dirt2', 'dirt5'), flip: true },
  [G.Street]: { pat: ROAD, key: k('dirt4', 'dirt3', 'dirt5', 'dirt2', 'dirt5'), flip: true },
  [G.AdobeFloor]: { pat: EARTH, key: k('dirt4', 'dirt3', 'dirt5', 'dirt2', 'dirt5') },
  [G.Farmland]: { pat: FARM, key: k('dirt2', 'dirt1', 'dirt3', 'dirt0', 'dirt4') },
  [G.Mud]: { pat: MUD, key: k('dirt1', 'dirt0', 'dirt2', 'inkWarm', 'water4', { f: 'water3' }), flip: true },
  [G.Hardpan]: { pat: CRACK, key: k('sand2', 'sand1', 'sand3', 'sand0', 'sand4'), flip: true },
  [G.Salt]: { pat: CRACK, key: k('white2', 'white1', 'white3', 'cream2', 'white3'), flip: true },
  [G.Desert]: { pat: SAND, key: k('sand3', 'sand2', 'sand4', 'sand1', 'sand4'), flip: true },
  [G.Sand]: { pat: SAND, key: k('cream2', 'cream1', 'cream3', 'cream0', 'cream4'), flip: true },
  [G.RedSand]: { pat: SAND, key: k('red4', 'red3', 'red5', 'red2', 'red5'), flip: true },
  [G.DryWash]: { pat: WASH, key: k('cream2', 'cream1', 'cream3', 'stone2', 'stone4', { f: 'stone3' }), flip: true },
  [G.Rock]: { pat: ROCK, key: k('stone3', 'stone2', 'stone4', 'stone1', 'stone5', { f: 'teal3', g: 'teal2' }), flip: true },
  [G.RedRock]: { pat: ROCK, key: k('red3', 'red2', 'red4', 'red1', 'red5', { f: 'dry4', g: 'dry3' }), flip: true },
  [G.Snow]: { pat: SNOW, key: k('snow3', 'snow2', 'snow4', 'snow1', 'snow4'), flip: true },
  [G.Ice]: { pat: ICE, key: k('blue4', 'blue3', 'snow3', 'blue2', 'snow4'), flip: true },
  [G.WoodFloor]: { pat: PLANK, key: k('wood3', 'wood2', 'wood4', 'wood1', 'wood5') },
  [G.ShallowWater]: { pat: WATER, key: k('water3', 'water2', 'water4', 'water1', 'water5'), flip: true },
  [G.DeepWater]: { pat: WATER, key: k('water2', 'water1', 'water3', 'water0', 'water4'), flip: true },
};

/** Cliff rock materials: warm sandstone (south), granite (mountains), brown earth (plains). */
const CLIFF_KEYS = {
  red: k('red2', 'red1', 'red3', 'red0', 'red4'),
  grey: k('stone2', 'stone1', 'stone3', 'stone0', 'stone4'),
  brown: k('dirt2', 'dirt1', 'dirt3', 'dirt0', 'dirt4'),
};
export type CliffKind = keyof typeof CLIFF_KEYS;

// ---------------------------------------------------------------------------
// Baking: grids → packed ABGR pixel arrays, built once on first use.
// ---------------------------------------------------------------------------

/** A baked 16×16 tile: 256 packed ABGR pixels (little-endian ImageData order). */
export type Tile = Uint32Array;

function bake(grid: Grid, key: Record<string, string>): Tile {
  const cv = pixmap(grid, key);
  const c = cv.getContext('2d') as CanvasRenderingContext2D;
  const d = c.getImageData(0, 0, 16, 16).data;
  return new Uint32Array(d.buffer.slice(0));
}

/** Packed ABGR from a palette name or #hex. */
export function packed(name: string): number {
  const hex = name.startsWith('#') ? name : (PAL as Record<string, string>)[name]!;
  const n = parseInt(hex.slice(1), 16);
  return ((255 << 24) | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
}

/** Ramp used for edges and lips: [deep, shade, base, light, highlight] packed. */
export type Ramp5 = Uint32Array;

export interface GroundArt {
  /** Variants; index 0–1 calm, 2+ detailed. */
  tiles: Tile[];
  ramp: Ramp5;
  flip: boolean;
}

export interface TileSet {
  ground: (GroundArt | undefined)[];
  cliff: Record<CliffKind, { top: Tile; mid: Tile[]; bot: Tile; one: Tile; ramp: Ramp5 }>;
  /** Edge masks for the north side, [grassy variants, plain variants]; 16×16 bytes, 1 = covered. */
  edgeN: [Uint8Array[], Uint8Array[]];
  cornerOut: Uint8Array;
  cornerIn: Uint8Array;
}

function maskOf(grid: Grid): Uint8Array {
  const m = new Uint8Array(256);
  for (let y = 0; y < grid.length && y < 16; y++)
    for (let x = 0; x < grid[y]!.length && x < 16; x++) if (grid[y]![x] === '#') m[y * 16 + x] = 1;
  return m;
}

let SET: TileSet | null = null;

/** Build (once) and return every baked ground tile, cliff piece and transition mask. */
export function tileSet(): TileSet {
  if (SET) return SET;
  const ground: (GroundArt | undefined)[] = [];
  for (const [id, m] of Object.entries(MATERIALS)) {
    const ramp = new Uint32Array(['d', 'b', 'a', 'c', 'e'].map((ch) => packed(m.key[ch]!)));
    ground[+id] = { tiles: m.pat.map((g) => bake(g, m.key)), ramp, flip: !!m.flip };
  }
  const cliff = {} as TileSet['cliff'];
  for (const [kind, key] of Object.entries(CLIFF_KEYS) as [CliffKind, Record<string, string>][]) {
    cliff[kind] = {
      top: bake(CLIFF_TOP, key),
      mid: CLIFF_MID.map((g) => bake(g, key)),
      bot: bake(CLIFF_BOT, key),
      one: bake(CLIFF_ONE, key),
      ramp: new Uint32Array(['d', 'b', 'a', 'c', 'e'].map((ch) => packed(key[ch]!))),
    };
  }
  SET = {
    ground,
    cliff,
    edgeN: [EDGE_GRASS.map(maskOf), EDGE_PLAIN.map(maskOf)],
    cornerOut: maskOf(CORNER_OUT),
    cornerIn: maskOf(CORNER_IN),
  };
  return SET;
}

/** Grids exported for the preview sheet and validation. */
export const GRIDS = { GRASS, TALL, FOREST, EARTH, ROAD, CRACK, SAND, WASH, ROCK, SNOW, ICE, MUD, FARM, PLANK, WATER, CLIFF_MID, CLIFF_TOP: [CLIFF_TOP], CLIFF_BOT: [CLIFF_BOT], CLIFF_ONE: [CLIFF_ONE] };
