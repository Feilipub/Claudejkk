/**
 * Tile vocabulary: ground types and static object types, with their movement
 * and rendering properties. Pure data used by worldgen, collision, riding
 * (terrain sensitivity), audio (footstep surface) and the chunk painter.
 */

export const G = {
  DeepWater: 0,
  ShallowWater: 1,
  Sand: 2,
  Grass: 3,
  TallGrass: 4,
  DryGrass: 5,
  Dirt: 6,
  Desert: 7,
  Hardpan: 8,
  RedRock: 9,
  Rock: 10,
  Snow: 11,
  ForestFloor: 12,
  Road: 13,
  Mud: 14,
  Ice: 15,
  Farmland: 16,
  WoodFloor: 17,
  Street: 18,
  RedSand: 19,
  DryWash: 20,
  Cliff: 21,
  Salt: 22,
  AdobeFloor: 23,} as const;
export type G = (typeof G)[keyof typeof G];

export interface GroundDef {
  name: string;
  /** Speed multiplier on foot / on horseback. */
  speed: number;
  /** Rough terrain factor (0 = smooth, 1 = very rough) — horses with poor trail stat slow more, hooves wear, injuries possible at speed. */
  rough: number;
  /** Footstep surface for audio. */
  surface: 'dirt' | 'grass' | 'water' | 'sand' | 'rock' | 'snow' | 'wood' | 'mud';
  blocked?: boolean;
  /** Horses can graze here. */
  graze?: boolean;
  /** Fresh water to drink/refill. */
  water?: boolean;
  /** Base colour ramp for the painter: [dark, mid, light]. */
  colors: [string, string, string];
}

export const GROUND: Record<number, GroundDef> = {
  [G.DeepWater]: { name: 'Deep water', speed: 0.35, rough: 0.2, surface: 'water', water: true, colors: ['#1f4a5c', '#2b6176', '#3a7a8f'] },
  [G.ShallowWater]: { name: 'Shallows', speed: 0.6, rough: 0.2, surface: 'water', water: true, colors: ['#3b7686', '#4f8f9b', '#6aa9ad'] },
  [G.Sand]: { name: 'Riverbank', speed: 0.9, rough: 0.1, surface: 'sand', colors: ['#b49b6e', '#c8b182', '#dbc79c'] },
  [G.Grass]: { name: 'Grass', speed: 1, rough: 0.05, surface: 'grass', graze: true, colors: ['#5d7a3a', '#728f45', '#88a556'] },
  [G.TallGrass]: { name: 'Prairie', speed: 0.95, rough: 0.1, surface: 'grass', graze: true, colors: ['#7f8a43', '#99a250', '#b2b865'] },
  [G.DryGrass]: { name: 'Dry grass', speed: 1, rough: 0.08, surface: 'grass', graze: true, colors: ['#9b8f55', '#b2a565', '#c7bb7b'] },
  [G.Dirt]: { name: 'Dirt', speed: 1, rough: 0.1, surface: 'dirt', colors: ['#7d6448', '#93785a', '#a88d6c'] },
  [G.Desert]: { name: 'Desert sand', speed: 0.88, rough: 0.15, surface: 'sand', colors: ['#c79f6b', '#d8b47f', '#e7c895'] },
  [G.Hardpan]: { name: 'Hardpan', speed: 1.02, rough: 0.12, surface: 'dirt', colors: ['#b28f6a', '#c4a27c', '#d3b48f'] },
  [G.RedRock]: { name: 'Slickrock', speed: 0.92, rough: 0.45, surface: 'rock', colors: ['#8e4a2c', '#a85c37', '#c27447'] },
  [G.Rock]: { name: 'Granite', speed: 0.8, rough: 0.6, surface: 'rock', colors: ['#6d6b68', '#86837e', '#a19d96'] },
  [G.Snow]: { name: 'Snow', speed: 0.72, rough: 0.3, surface: 'snow', colors: ['#c6d0da', '#dde5ec', '#f1f5f8'] },
  [G.ForestFloor]: { name: 'Forest floor', speed: 0.92, rough: 0.2, surface: 'grass', graze: true, colors: ['#3e4a2b', '#4f5c34', '#61703f'] },
  [G.Road]: { name: 'Road', speed: 1.08, rough: 0, surface: 'dirt', colors: ['#8a7155', '#9f8566', '#b39a7a'] },
  [G.Mud]: { name: 'Mud', speed: 0.75, rough: 0.25, surface: 'mud', colors: ['#4f3f2c', '#5f4c36', '#715b42'] },
  [G.Ice]: { name: 'Ice', speed: 0.8, rough: 0.5, surface: 'snow', colors: ['#9db8c8', '#b5cdda', '#d0e2ea'] },
  [G.Farmland]: { name: 'Farmland', speed: 0.9, rough: 0.15, surface: 'dirt', colors: ['#6c5333', '#7f6340', '#94784e'] },
  [G.WoodFloor]: { name: 'Floorboards', speed: 1, rough: 0, surface: 'wood', colors: ['#5c3d24', '#6e4a2c', '#835a37'] },
  [G.Street]: { name: 'Street', speed: 1.05, rough: 0.02, surface: 'dirt', colors: ['#87694b', '#9a7b5a', '#ad8f6c'] },
  [G.RedSand]: { name: 'Red sand', speed: 0.9, rough: 0.12, surface: 'sand', colors: ['#b0663d', '#c47a4d', '#d69062'] },
  [G.DryWash]: { name: 'Dry wash', speed: 0.92, rough: 0.2, surface: 'sand', colors: ['#bca27a', '#cdb38b', '#dcc49f'] },
  [G.Cliff]: { name: 'Cliff', speed: 0, rough: 1, surface: 'rock', blocked: true, colors: ['#4e3a2e', '#644a3a', '#7a5b48'] },
  [G.Salt]: { name: 'Salt flat', speed: 1.02, rough: 0.05, surface: 'sand', colors: ['#d8d4c8', '#e6e3d9', '#f3f1ea'] },
  [G.AdobeFloor]: { name: 'Packed floor', speed: 1, rough: 0, surface: 'dirt', colors: ['#a07a58', '#b08a66', '#bf9a76'] },
};

export const O = {
  None: 0,
  Pine: 1,
  Oak: 2,
  Cottonwood: 3,
  DeadTree: 4,
  Juniper: 5,
  Saguaro: 6,
  PricklyPear: 7,
  Sage: 8,
  Bush: 9,
  RockSmall: 10,
  Boulder: 11,
  FenceH: 12,
  FenceV: 13,
  Log: 14,
  Stump: 15,
  Flowers: 16,
  GrassTuft: 17,
  SnowPine: 18,
  Reeds: 19,
  Aspen: 20,
  BerryBush: 21,
  HitchPost: 22,
  Well: 23,
  Trough: 24,
  LampPost: 25,
  Crate: 26,
  Barrel: 27,
  HayBale: 28,
  Grave: 29,
  FirePit: 30,
  Signpost: 31,
  Hoodoo: 32,
  MineEntrance: 33,
  Counter: 34,
  Table: 35,
  Chair: 36,
  Bed: 37,
  Shelf: 38,
  Stove: 39,
  Piano: 40,
  Bar: 41,
  Pew: 42,
  Cell: 43,
  Desk: 44,
  Safe: 45,
  Wagon: 46,
  Tent: 47,
  Teepee: 48,
  Rail: 49,
  Windmill: 50,
  WaterTower: 51,
  Cactus2: 52,
  Creosote: 53,
  Stall: 54,
  Anvil: 55,
  Woodpile: 56,
  Cornstalk: 57,
  Tombstone: 58,
  Bones: 59,
  Lilypad: 60,} as const;
export type O = (typeof O)[keyof typeof O];

export interface ObjDef {
  name: string;
  /** Blocks movement (collision box is the bottom-centre of the tile). */
  solid: boolean;
  /** Can be jumped by a horse at canter/gallop. */
  jumpable?: boolean;
  /** Is drawn y-sorted as a sprite (tall) vs flat decal. */
  tall: boolean;
  /** Collision radius in px for solid round things (trees). */
  radius?: number;
  /** Provides shelter from rain/snow when near. */
  shelter?: boolean;
  /** Interaction id for the interaction system. */
  interact?: 'hitch' | 'well' | 'trough' | 'grave' | 'fire' | 'sign' | 'mine' | 'bed' | 'berry' | 'safe' | 'piano' | 'stall';
}

export const OBJ: Record<number, ObjDef> = {
  [O.None]: { name: '', solid: false, tall: false },
  [O.Pine]: { name: 'Ponderosa pine', solid: true, tall: true, radius: 4, shelter: true },
  [O.Oak]: { name: 'Bur oak', solid: true, tall: true, radius: 5, shelter: true },
  [O.Cottonwood]: { name: 'Cottonwood', solid: true, tall: true, radius: 5, shelter: true },
  [O.DeadTree]: { name: 'Snag', solid: true, tall: true, radius: 3 },
  [O.Juniper]: { name: 'Juniper', solid: true, tall: true, radius: 4, shelter: true },
  [O.Saguaro]: { name: 'Organ cactus', solid: true, tall: true, radius: 3 },
  [O.PricklyPear]: { name: 'Prickly pear', solid: false, tall: true },
  [O.Sage]: { name: 'Sagebrush', solid: false, tall: true },
  [O.Bush]: { name: 'Scrub', solid: false, tall: true },
  [O.RockSmall]: { name: 'Stones', solid: false, tall: false },
  [O.Boulder]: { name: 'Boulder', solid: true, tall: true, radius: 7 },
  [O.FenceH]: { name: 'Rail fence', solid: true, jumpable: true, tall: true },
  [O.FenceV]: { name: 'Rail fence', solid: true, jumpable: true, tall: true },
  [O.Log]: { name: 'Fallen log', solid: true, jumpable: true, tall: true },
  [O.Stump]: { name: 'Stump', solid: false, tall: true },
  [O.Flowers]: { name: 'Wildflowers', solid: false, tall: false },
  [O.GrassTuft]: { name: 'Bunchgrass', solid: false, tall: true },
  [O.SnowPine]: { name: 'Snowy fir', solid: true, tall: true, radius: 4, shelter: true },
  [O.Reeds]: { name: 'Cattails', solid: false, tall: true },
  [O.Aspen]: { name: 'Aspen', solid: true, tall: true, radius: 3, shelter: true },
  [O.BerryBush]: { name: 'Chokecherry', solid: false, tall: true, interact: 'berry' },
  [O.HitchPost]: { name: 'Hitching post', solid: true, tall: true, interact: 'hitch' },
  [O.Well]: { name: 'Well', solid: true, tall: true, interact: 'well' },
  [O.Trough]: { name: 'Water trough', solid: true, tall: true, interact: 'trough' },
  [O.LampPost]: { name: 'Lamp post', solid: true, tall: true, radius: 2 },
  [O.Crate]: { name: 'Crate', solid: true, tall: true },
  [O.Barrel]: { name: 'Barrel', solid: true, tall: true, radius: 5 },
  [O.HayBale]: { name: 'Hay bale', solid: true, tall: true, jumpable: true },
  [O.Grave]: { name: 'Grave marker', solid: false, tall: true, interact: 'grave' },
  [O.FirePit]: { name: 'Fire pit', solid: false, tall: false, interact: 'fire' },
  [O.Signpost]: { name: 'Signpost', solid: true, tall: true, radius: 2, interact: 'sign' },
  [O.Hoodoo]: { name: 'Hoodoo', solid: true, tall: true, radius: 6 },
  [O.MineEntrance]: { name: 'Mine adit', solid: true, tall: true, interact: 'mine' },
  [O.Counter]: { name: 'Counter', solid: true, tall: true },
  [O.Table]: { name: 'Table', solid: true, tall: true },
  [O.Chair]: { name: 'Chair', solid: false, tall: true },
  [O.Bed]: { name: 'Bed', solid: true, tall: true, interact: 'bed' },
  [O.Shelf]: { name: 'Shelves', solid: true, tall: true },
  [O.Stove]: { name: 'Stove', solid: true, tall: true },
  [O.Piano]: { name: 'Piano', solid: true, tall: true, interact: 'piano' },
  [O.Bar]: { name: 'Bar', solid: true, tall: true },
  [O.Pew]: { name: 'Pew', solid: true, tall: true },
  [O.Cell]: { name: 'Cell bars', solid: true, tall: true },
  [O.Desk]: { name: 'Desk', solid: true, tall: true },
  [O.Safe]: { name: 'Safe', solid: true, tall: true, interact: 'safe' },
  [O.Wagon]: { name: 'Wagon', solid: true, tall: true },
  [O.Tent]: { name: 'Canvas tent', solid: true, tall: true, shelter: true },
  [O.Teepee]: { name: 'Lodge', solid: true, tall: true, shelter: true },
  [O.Rail]: { name: 'Rails', solid: false, tall: false },
  [O.Windmill]: { name: 'Windmill', solid: true, tall: true, radius: 6 },
  [O.WaterTower]: { name: 'Water tower', solid: true, tall: true, radius: 10, interact: 'well' },
  [O.Cactus2]: { name: 'Cholla', solid: false, tall: true },
  [O.Creosote]: { name: 'Creosote', solid: false, tall: true },
  [O.Stall]: { name: 'Stall', solid: true, tall: true, interact: 'stall' },
  [O.Anvil]: { name: 'Anvil', solid: true, tall: true },
  [O.Woodpile]: { name: 'Woodpile', solid: true, tall: true },
  [O.Cornstalk]: { name: 'Wheat', solid: false, tall: true },
  [O.Tombstone]: { name: 'Headstone', solid: false, tall: true, interact: 'grave' },
  [O.Bones]: { name: 'Bones', solid: false, tall: false },
  [O.Lilypad]: { name: 'Lily pads', solid: false, tall: false },
};

/** World flag bits. */
export const F = {
  Road: 1,
  Rail: 2,
  Bridge: 4,
  River: 8,
  Settlement: 16,
  Interior: 32,
  Trail: 64,
  Camp: 128,
} as const;
