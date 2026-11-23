/**
 * The authored macro-geography of Calder Territory. Worldgen turns these
 * control points into terrain; everything here is in TILE coordinates
 * (1 tile = 16 px ≈ 2 m). See design/world/calder-territory.md.
 */

export const WORLD_W = 768;
export const WORLD_H = 768;
export const WORLD_SEED = 1887;

export type ClimateId = 'temperate' | 'arid' | 'alpine' | 'forest' | 'canyon' | 'wetland';

export interface RegionDef {
  id: string;
  name: string;
  /** Voronoi centre(s); a region may own several seeds to shape it. */
  seeds: [number, number][];
  climate: ClimateId;
  /** Base elevation 0..255 and roughness. */
  elevation: number;
  roughness: number;
  /** Day temperature in °F (night is ~25 cooler, alpine more). */
  temperature: number;
  /** Weather weights. */
  weather: Record<string, number>;
  description: string;
  /** Music mode for the procedural score. */
  music: 'open' | 'lonesome' | 'tense' | 'bustle' | 'cold' | 'forest';
  color: string; // map tint
  /** Law presence 0..1 (how quickly crimes are reported and lawmen respond). */
  law: number;
  wildlife: { species: string; weight: number }[];
}

export const REGIONS: RegionDef[] = [
  {
    id: 'dustfall',
    name: 'Dustfall Plains',
    seeds: [[360, 380], [300, 330], [420, 300]],
    climate: 'temperate',
    elevation: 70,
    roughness: 0.35,
    temperature: 72,
    weather: { clear: 5, cloudy: 3, rain: 1.5, storm: 0.6, fog: 0.4, dust: 0.5 },
    description: 'Rolling shortgrass prairie broken by cottonwood creeks. Cattle country, horse country — the heart of the territory.',
    music: 'open',
    color: '#b9a86a',
    law: 0.7,
    wildlife: [
      { species: 'pronghorn', weight: 3 },
      { species: 'cattle', weight: 3 },
      { species: 'rabbit', weight: 4 },
      { species: 'coyote', weight: 2 },
      { species: 'deer', weight: 2 },
      { species: 'bison', weight: 0.6 },
      { species: 'hawk', weight: 1.5 },
      { species: 'wildHorse', weight: 0.8 },
      { species: 'wolf', weight: 0.4 },
    ],
  },
  {
    id: 'blackwater',
    name: 'Blackwater Basin',
    seeds: [[620, 420], [640, 520], [590, 330]],
    climate: 'wetland',
    elevation: 40,
    roughness: 0.25,
    temperature: 70,
    weather: { clear: 4, cloudy: 4, rain: 2.5, storm: 0.8, fog: 1.5 },
    description: 'A broad, fertile lowland around Blackwater Lake. Money, rail, banks, mills — and the people who own them.',
    music: 'bustle',
    color: '#7f9a6a',
    law: 1,
    wildlife: [
      { species: 'deer', weight: 3 },
      { species: 'cattle', weight: 2 },
      { species: 'rabbit', weight: 3 },
      { species: 'heron', weight: 2 },
      { species: 'duck', weight: 2 },
      { species: 'boar', weight: 1 },
      { species: 'coyote', weight: 1 },
    ],
  },
  {
    id: 'pinehollow',
    name: 'Pine Hollow',
    seeds: [[560, 170], [480, 220], [650, 220]],
    climate: 'forest',
    elevation: 120,
    roughness: 0.6,
    temperature: 60,
    weather: { clear: 3, cloudy: 4, rain: 3, storm: 1, fog: 2 },
    description: 'Dense ponderosa and fir forest, cold creeks and logging camps. Elk bugle in the clearings; bears own the berry thickets.',
    music: 'forest',
    color: '#4f6b44',
    law: 0.4,
    wildlife: [
      { species: 'deer', weight: 4 },
      { species: 'elk', weight: 2 },
      { species: 'bear', weight: 1 },
      { species: 'wolf', weight: 1.5 },
      { species: 'rabbit', weight: 2 },
      { species: 'turkey', weight: 2 },
    ],
  },
  {
    id: 'sierra',
    name: 'High Sierra',
    seeds: [[250, 90], [380, 70], [140, 130]],
    climate: 'alpine',
    elevation: 200,
    roughness: 0.9,
    temperature: 38,
    weather: { clear: 3, cloudy: 3, snow: 3, blizzard: 0.8, fog: 1 },
    description: 'Granite peaks and windswept passes. Snow most of the year, a few stubborn ranchers, trappers and the old pass road.',
    music: 'cold',
    color: '#c9d0d6',
    law: 0.15,
    wildlife: [
      { species: 'elk', weight: 2 },
      { species: 'wolf', weight: 2 },
      { species: 'cougar', weight: 0.8 },
      { species: 'rabbit', weight: 2 },
      { species: 'bighorn', weight: 2 },
    ],
  },
  {
    id: 'drylands',
    name: 'The Drylands',
    seeds: [[150, 470], [130, 610], [230, 560]],
    climate: 'arid',
    elevation: 95,
    roughness: 0.35,
    temperature: 92,
    weather: { clear: 7, cloudy: 1, dust: 2, storm: 0.3 },
    description: 'Creosote flats, salt pans and played-out silver mines. Water is worth more than gold out here, and everyone knows where the springs are.',
    music: 'lonesome',
    color: '#d7b27a',
    law: 0.25,
    wildlife: [
      { species: 'rabbit', weight: 3 },
      { species: 'coyote', weight: 3 },
      { species: 'rattlesnake', weight: 2 },
      { species: 'vulture', weight: 2 },
      { species: 'wildHorse', weight: 1.5 },
      { species: 'pronghorn', weight: 1 },
    ],
  },
  {
    id: 'redstone',
    name: 'Redstone Canyon',
    seeds: [[420, 600], [500, 660], [340, 680]],
    climate: 'canyon',
    elevation: 110,
    roughness: 1,
    temperature: 85,
    weather: { clear: 6, cloudy: 2, dust: 1, storm: 0.8 },
    description: 'Red sandstone mesas cut by slot canyons and the Tinaja River. Hideouts, cliff ruins, cougars — and a cavalry fort watching all of it.',
    music: 'tense',
    color: '#b8603a',
    law: 0.3,
    wildlife: [
      { species: 'cougar', weight: 1 },
      { species: 'coyote', weight: 2 },
      { species: 'rabbit', weight: 2 },
      { species: 'bighorn', weight: 1.5 },
      { species: 'vulture', weight: 2 },
      { species: 'rattlesnake', weight: 1.5 },
    ],
  },
];

/** Polylines in tile coordinates. Width in tiles. */
export interface RiverDef {
  id: string;
  name: string;
  points: [number, number][];
  width: number;
  /** Dry washes render as sand with occasional pools. */
  dry?: boolean;
}

export const RIVERS: RiverDef[] = [
  {
    id: 'calder',
    name: 'Calder River',
    width: 5,
    points: [[300, 40], [310, 110], [330, 170], [352, 230], [365, 290], [378, 340], [398, 372], [430, 392], [470, 394], [520, 396], [560, 405], [600, 420]],
  },
  {
    id: 'pinecreek',
    name: 'Pine Creek',
    width: 3,
    points: [[575, 150], [560, 200], [530, 250], [500, 300], [480, 345], [470, 392]],
  },
  {
    id: 'tinaja',
    name: 'Tinaja River',
    width: 4,
    points: [[300, 560], [350, 590], [400, 615], [450, 640], [510, 630], [570, 610], [640, 590], [700, 560], [760, 545]],
  },
  {
    id: 'rioseco',
    name: 'Rio Seco',
    width: 4,
    dry: true,
    points: [[90, 400], [130, 450], [170, 500], [200, 545], [240, 580], [300, 560]],
  },
  {
    id: 'outlet',
    name: 'Blackwater Outlet',
    width: 5,
    points: [[660, 450], [700, 480], [740, 520], [767, 540]],
  },
];

export interface LakeDef {
  id: string;
  name: string;
  x: number;
  y: number;
  rx: number;
  ry: number;
  frozen?: boolean;
}

export const LAKES: LakeDef[] = [
  { id: 'blackwater', name: 'Blackwater Lake', x: 628, y: 436, rx: 34, ry: 22 },
  { id: 'mirror', name: 'Mirror Lake', x: 590, y: 140, rx: 14, ry: 10 },
  { id: 'tarn', name: 'Grey Tarn', x: 300, y: 36, rx: 9, ry: 7, frozen: true },
  { id: 'saltpan', name: 'Alkali Pan', x: 90, y: 540, rx: 26, ry: 18 },
];

export interface RoadDef {
  id: string;
  points: [number, number][];
  width: number;
  kind: 'road' | 'trail';
}

export const ROADS: RoadDef[] = [
  // Main east-west stage road: Sulfur Flats → Larkspur → Port Ashby
  { id: 'stage', kind: 'road', width: 3, points: [[170, 470], [230, 440], [290, 410], [340, 395], [372, 382], [420, 384], [480, 395], [540, 405], [580, 410], [610, 400]] },
  // Larkspur north to the Sierra pass and Whitepeak
  { id: 'passroad', kind: 'road', width: 2, points: [[372, 382], [352, 330], [320, 280], [300, 220], [282, 160], [262, 110], [248, 86]] },
  // Larkspur south to Fort Rourke and the canyon
  { id: 'fortroad', kind: 'road', width: 2, points: [[372, 382], [380, 440], [400, 500], [420, 545], [455, 575]] },
  // Port Ashby north to Cedar Notch
  { id: 'loggingroad', kind: 'road', width: 2, points: [[610, 400], [600, 340], [585, 290], [560, 240], [545, 205]] },
  // Brannigan ranch spur
  { id: 'ranchspur', kind: 'trail', width: 2, points: [[340, 395], [318, 418], [300, 432]] },
  // Drylands mission trail
  { id: 'missiontrail', kind: 'trail', width: 1, points: [[170, 470], [140, 520], [120, 585], [118, 620]] },
  // Canyon trail into Coyle's Roost
  { id: 'roosttrail', kind: 'trail', width: 1, points: [[455, 575], [480, 610], [500, 650], [515, 690]] },
  // Sayen valley trail
  { id: 'valleytrail', kind: 'trail', width: 1, points: [[300, 220], [360, 200], [420, 190], [455, 175]] },
  // Ghost town trail
  { id: 'ghosttrail', kind: 'trail', width: 1, points: [[290, 410], [250, 360], [230, 320]] },
];

/** Railroad: Meridian & Western line. */
export const RAILROAD: [number, number][] = [
  [767, 470], [700, 455], [640, 395], [600, 390], [540, 372], [480, 352], [420, 350], [372, 360], [320, 375], [260, 420], [200, 470], [150, 500], [90, 520],
];

export type SettlementKind = 'town' | 'city' | 'ranch' | 'camp' | 'fort' | 'ghost' | 'mining' | 'hideout' | 'station' | 'lodge' | 'cabin' | 'farm';

export interface SettlementDef {
  id: string;
  name: string;
  kind: SettlementKind;
  regionId: string;
  x: number;
  y: number;
  /** Layout template key in world/settlements.ts. */
  layout: string;
  description: string;
}

export const SETTLEMENTS: SettlementDef[] = [
  { id: 'larkspur', name: 'Larkspur', kind: 'town', regionId: 'dustfall', x: 372, y: 382, layout: 'town', description: 'A cattle town on the Calder ford: one long street, a stockyard, and opinions about the railroad.' },
  { id: 'portashby', name: 'Port Ashby', kind: 'city', regionId: 'blackwater', x: 600, y: 396, layout: 'city', description: 'Lake port, rail terminus and the territory\'s capital in all but name.' },
  { id: 'brannigan', name: 'Brannigan Horse Ranch', kind: 'ranch', regionId: 'dustfall', x: 296, y: 436, layout: 'ranch', description: 'Your uncle Silas\'s horse ranch. Forty acres, two corrals and a barn that leans west.' },
  { id: 'sulfurflats', name: 'Sulfur Flats', kind: 'mining', regionId: 'drylands', x: 168, y: 470, layout: 'mining', description: 'A silver camp clinging to the last good seam and the only sweet well for twenty miles.' },
  { id: 'cedarnotch', name: 'Cedar Notch', kind: 'camp', regionId: 'pinehollow', x: 545, y: 200, layout: 'camp', description: 'A logging camp and sawmill on Pine Creek.' },
  { id: 'whitepeak', name: 'Whitepeak', kind: 'ranch', regionId: 'sierra', x: 248, y: 84, layout: 'mountainranch', description: 'A high pasture ranch and trading post below the pass.' },
  { id: 'fortrourke', name: 'Fort Rourke', kind: 'fort', regionId: 'redstone', x: 455, y: 572, layout: 'fort', description: 'A cavalry post on the canyon rim, half-staffed and bored.' },
  { id: 'gallowshope', name: 'Gallow\'s Hope', kind: 'ghost', regionId: 'dustfall', x: 230, y: 318, layout: 'ghost', description: 'Abandoned when the cholera came in \'79. The church bell still hangs.' },
  { id: 'mission', name: 'Mission San Isidro', kind: 'ghost', regionId: 'drylands', x: 118, y: 622, layout: 'mission', description: 'Adobe ruins of a border mission, older than the territory itself.' },
  { id: 'roost', name: 'Coyle\'s Roost', kind: 'hideout', regionId: 'redstone', x: 515, y: 690, layout: 'hideout', description: 'A box canyon with one way in.' },
  { id: 'meridian', name: 'Meridian Junction', kind: 'station', regionId: 'dustfall', x: 480, y: 352, layout: 'station', description: 'Water tower, telegraph shack and a platform. The trains stop when they feel like it.' },
  { id: 'sayen', name: 'Sayen Valley Lodge', kind: 'lodge', regionId: 'pinehollow', x: 458, y: 172, layout: 'lodge', description: 'Winter home of the Sayen people, breeders of the finest spotted horses in the territory.' },
  { id: 'halvorsen', name: 'Halvorsen Homestead', kind: 'farm', regionId: 'dustfall', x: 430, y: 318, layout: 'farm', description: 'A Norwegian family\'s wheat farm, fighting the wind and the railroad both.' },
  { id: 'trappercabin', name: 'Hollow Crown Cabin', kind: 'cabin', regionId: 'sierra', x: 160, y: 120, layout: 'cabin', description: 'A trapper\'s cabin under the Hollow Crown peaks.' },
];

export interface PoiDef {
  id: string;
  name: string;
  x: number;
  y: number;
  kind: 'vista' | 'ruin' | 'cave' | 'grave' | 'camp' | 'wreck' | 'spring' | 'mine' | 'treasure' | 'landmark' | 'surveycamp';
  description: string;
  /** Lore document id unlocked on discovery, if any. */
  doc?: string;
  hidden?: boolean;
}

export const POIS: PoiDef[] = [
  { id: 'eagleRock', name: 'Eagle Rock', x: 335, y: 255, kind: 'vista', description: 'A granite knob above the Calder. You can see three regions from here.' },
  { id: 'brokenWagon', name: 'Burned Freight Wagon', x: 262, y: 432, kind: 'wreck', description: 'A Meridian & Western supply wagon, burned to the axles. Not by lightning.', doc: 'doc_wagonManifest' },
  { id: 'saltSpring', name: 'Hackberry Spring', x: 200, y: 600, kind: 'spring', description: 'Sweet water under a hackberry. Every trail in the Drylands bends toward it.' },
  { id: 'cliffHouses', name: 'Old Cliff Houses', x: 380, y: 650, kind: 'ruin', description: 'Masonry rooms tucked under an overhang, built by people long before the Sayen or the settlers. Treated as a sacred place — look, don\'t take.', doc: 'doc_cliffHouses' },
  { id: 'bearCave', name: 'Bruin Den', x: 620, y: 260, kind: 'cave', description: 'Bones at the entrance. Something big sleeps here.', hidden: true },
  { id: 'lostMine', name: 'Widow Ketterman\'s Claim', x: 70, y: 450, kind: 'mine', description: 'A played-out silver drift. Or so the assay office says.', doc: 'doc_ketterman', hidden: true },
  { id: 'surveyCamp', name: 'Abandoned Survey Camp', x: 205, y: 640, kind: 'surveycamp', description: 'A collapsed tent, a tripod, and a theodolite nobody came back for.', doc: 'doc_pruittNote' },
  { id: 'hangingTree', name: 'The Hanging Oak', x: 250, y: 300, kind: 'landmark', description: 'Three notches cut into the bark. The town council never talks about the third.', doc: 'doc_hangingTree' },
  { id: 'trainWreck', name: 'Derailment at Mile 112', x: 210, y: 462, kind: 'wreck', description: 'Twisted rails and a boxcar on its side. The company says it was a washout.', doc: 'doc_derailment' },
  { id: 'cairnPass', name: 'Cairn Pass', x: 200, y: 60, kind: 'vista', description: 'Stones stacked by travellers for luck. Add one.' },
  { id: 'graveyard', name: 'Gallow\'s Hope Cemetery', x: 238, y: 312, kind: 'grave', description: 'Forty-one wooden markers dated 1879.', doc: 'doc_cholera' },
  { id: 'treasureA', name: 'Outlaw Cache', x: 548, y: 676, kind: 'treasure', description: 'A strongbox wedged under a fallen slab.', hidden: true },
  { id: 'hermitCamp', name: 'Hermit\'s Camp', x: 700, y: 180, kind: 'camp', description: 'A tidy camp, a cold fire, and a note pinned under a stone.', doc: 'doc_hermit', hidden: true },
  { id: 'waterfall', name: 'Veil Falls', x: 572, y: 125, kind: 'vista', description: 'Mirror Lake spills over a granite lip into Pine Creek.' },
  { id: 'wildRange', name: 'Mustang Flats', x: 190, y: 390, kind: 'landmark', description: 'Open hardpan where the wild herds water at dawn.' },
];
