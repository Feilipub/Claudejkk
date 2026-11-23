/**
 * Horse coat colours, patterns and markings. Used by the horse generator and the
 * procedural horse sprite painter. Colours are hand-tuned ramps (shadow → base → highlight).
 */

export interface CoatDef {
  id: string;
  name: string;
  /** Body ramp: dark, base, light. */
  body: [string, string, string];
  mane: [string, string];
  /** Lower-leg colour ("points"), null = same as body. */
  points: string | null;
  /** Dorsal stripe and leg barring (dun factor). */
  dorsal?: string;
  /** Speckling roan / flea-bitten / dapple overlay colour. */
  speckle?: { color: string; density: number; kind: 'roan' | 'fleck' | 'dapple' };
  rarity: number; // price multiplier
}

export const COATS: CoatDef[] = [
  { id: 'bay', name: 'Bay', body: ['#5a2e17', '#86461f', '#a65f2e'], mane: ['#17100c', '#2b1d15'], points: '#1c130e', rarity: 1 },
  { id: 'darkBay', name: 'Dark Bay', body: ['#2e1a10', '#4b2a18', '#653a22'], mane: ['#0f0a08', '#20160f'], points: '#120c09', rarity: 1.05 },
  { id: 'chestnut', name: 'Chestnut', body: ['#6b2f14', '#97461d', '#b8602d'], mane: ['#5e2810', '#8a4019'], points: null, rarity: 1 },
  { id: 'sorrel', name: 'Sorrel', body: ['#8a4519', '#b5652a', '#d0843f'], mane: ['#c58a4a', '#e0ae6c'], points: null, rarity: 1 },
  { id: 'black', name: 'Black', body: ['#0e0d10', '#1d1b22', '#34313b'], mane: ['#070608', '#141217'], points: null, rarity: 1.1 },
  { id: 'grey', name: 'Dapple Grey', body: ['#7c8086', '#a6aab0', '#cdd0d4'], mane: ['#4e5157', '#7b7f85'], points: '#5c5f64', speckle: { color: '#c8ccd1', density: 0.18, kind: 'dapple' }, rarity: 1.1 },
  { id: 'white', name: 'White', body: ['#bdb9b2', '#e2ded6', '#f6f4ef'], mane: ['#cfcac1', '#ece8e1'], points: null, rarity: 1.35 },
  { id: 'fleabitten', name: 'Flea-bitten Grey', body: ['#a7a39e', '#cbc7c1', '#e7e4df'], mane: ['#9e9a95', '#c4c0bb'], points: null, speckle: { color: '#7a4a32', density: 0.08, kind: 'fleck' }, rarity: 1.15 },
  { id: 'buckskin', name: 'Buckskin', body: ['#a07a3f', '#c8a161', '#e0c084'], mane: ['#15100c', '#2a1f17'], points: '#1c140f', rarity: 1.2 },
  { id: 'palomino', name: 'Palomino', body: ['#b4853c', '#d6a95a', '#ecc883'], mane: ['#efe4cc', '#fbf6e9'], points: null, rarity: 1.25 },
  { id: 'dun', name: 'Dun', body: ['#9b7a4c', '#bf9d69', '#d6b98a'], mane: ['#3b2a1c', '#5a422d'], points: '#3a2a1d', dorsal: '#4d3624', rarity: 1.1 },
  { id: 'grullo', name: 'Grullo', body: ['#56524d', '#77716a', '#958e85'], mane: ['#1a1817', '#2d2a27'], points: '#211f1d', dorsal: '#25221f', rarity: 1.3 },
  { id: 'blueRoan', name: 'Blue Roan', body: ['#3a3d45', '#5a5e68', '#7d828c'], mane: ['#121216', '#23232a'], points: '#16161a', speckle: { color: '#b8bcc4', density: 0.35, kind: 'roan' }, rarity: 1.3 },
  { id: 'redRoan', name: 'Red Roan', body: ['#6e3a26', '#93533a', '#b07155'], mane: ['#2a1810', '#43271a'], points: '#2c1a12', speckle: { color: '#d9c3b7', density: 0.32, kind: 'roan' }, rarity: 1.2 },
  { id: 'roanChestnut', name: 'Strawberry Roan', body: ['#8b4d33', '#b0694a', '#c98767'], mane: ['#7a3d22', '#9c5330'], points: null, speckle: { color: '#ead7cf', density: 0.36, kind: 'roan' }, rarity: 1.2 },
  { id: 'champagne', name: 'Amber Champagne', body: ['#9a7a52', '#c09d72', '#dcc29b'], mane: ['#6f563b', '#8f7150'], points: '#7a6145', rarity: 1.4 },
  { id: 'silverDapple', name: 'Silver Dapple', body: ['#3a2f2a', '#5a4b43', '#776558'], mane: ['#ddd6cc', '#f2ede5'], points: '#2b231f', speckle: { color: '#8b786b', density: 0.15, kind: 'dapple' }, rarity: 1.45 },
  { id: 'blond', name: 'Blond Sorrel', body: ['#a8692e', '#cf8d45', '#e6ad66'], mane: ['#ead6aa', '#f8edd2'], points: null, rarity: 1.1 },
];

export const PATTERNS = ['solid', 'tobiano', 'overo', 'tovero', 'sabino', 'leopard', 'blanket', 'snowflake', 'frost'] as const;
export type PatternId = (typeof PATTERNS)[number];

export const PATTERN_NAMES: Record<string, string> = {
  solid: 'Solid',
  tobiano: 'Tobiano',
  overo: 'Overo',
  tovero: 'Tovero',
  sabino: 'Sabino',
  leopard: 'Leopard',
  blanket: 'Blanket',
  snowflake: 'Snowflake',
  frost: 'Frost',
};

export const PATTERN_RARITY: Record<string, number> = {
  solid: 1,
  tobiano: 1.15,
  overo: 1.2,
  tovero: 1.35,
  sabino: 1.1,
  leopard: 1.35,
  blanket: 1.2,
  snowflake: 1.15,
  frost: 1.2,
};

export const FACE_MARKINGS = ['none', 'star', 'snip', 'strip', 'blaze', 'bald'] as const;
export const LEG_MARKINGS = ['none', 'coronet', 'sock', 'stocking'] as const;
export type FaceMarking = (typeof FACE_MARKINGS)[number];
export type LegMarking = (typeof LEG_MARKINGS)[number];

export const MANE_STYLES = ['natural', 'pulled', 'roached', 'braided', 'long'] as const;
export const TAIL_STYLES = ['natural', 'banged', 'braided', 'knotted', 'long'] as const;

const BY_ID = new Map(COATS.map((c) => [c.id, c]));
export function getCoat(id: string): CoatDef {
  return BY_ID.get(id) ?? COATS[0]!;
}
