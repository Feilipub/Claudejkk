/**
 * NPC daily life and social data: occupation routines (weekday + Sunday),
 * visible work activities, relationship rules and the topic pools that
 * townsfolk use when they talk to each other. Pure data plus a few pure
 * helpers so it can be unit-tested without a browser.
 *
 * Every occupation in `Occupation` resolves to a routine, so NPCs authored
 * later (story/npcs.ts) get a believable day automatically.
 */

/** Where a schedule block sends an NPC. Resolved against settlement spots and buildings at runtime. */
export type PlaceKind =
  | 'bed' // their bed / home
  | 'home' // home table (meals)
  | 'work' // workplace work spot (anvil, desk, stove, piano…)
  | 'counter' // workplace counter (shops, bar, sheriff desk)
  | 'street' // the main street
  | 'social' // any social spot (tables, cookhouse, lodge)
  | 'saloon' // a seat in the saloon (falls back to social/camp)
  | 'church' // a pew (falls back to street)
  | 'porch' // in front of a house or the hotel
  | 'shopfront' // the boardwalk in front of their workplace
  | 'patrol' // walking a beat between street points and storefronts
  | 'corral' // corral / trough / hay
  | 'stall' // stable stalls
  | 'field' // open work ground (farm rows, corrals at worst)
  | 'camp' // campfire
  | 'guard'; // sentry posts

/** What the NPC visibly does once they arrive. */
export type ActKind =
  | 'idle' | 'sleep' | 'eat' | 'sit' | 'drink' | 'chat' | 'pray' | 'preach' | 'shop' | 'write'
  | 'hammer' | 'wipe' | 'sweep' | 'hoe' | 'pick' | 'chop' | 'brush' | 'feed' | 'cook' | 'tend'
  | 'patrol' | 'guard' | 'loiter' | 'stroll' | 'play' | 'stagger' | 'deal' | 'piano';

export interface SchedBlock {
  /** Start hour, inclusive (0..24). */
  from: number;
  /** End hour, exclusive. */
  to: number;
  place: PlaceKind;
  act: ActKind;
}

export interface Routine {
  week: SchedBlock[];
  /** Sunday variant (church, rest). Falls back to `week`. */
  sunday?: SchedBlock[];
}

/** Hand-held prop drawn over the sprite while working. */
export type PropKind = 'hammer' | 'rag' | 'broom' | 'hoe' | 'pick' | 'axe' | 'brush' | 'hay' | 'book' | 'cards' | 'bowl' | 'mug' | 'pen' | 'ladle' | 'bottle';

export interface ActDef {
  /** Base pose. Uses only keys that exist in humanSprite's HumanAnim. */
  anim: 'idle' | 'sit' | 'interact' | 'walk';
  /** Pose alternated with the base pose (work strokes). */
  alt?: 'idle' | 'sit' | 'interact';
  /** Seconds per stroke cycle. */
  period?: number;
  /** Fraction of the cycle spent in `alt`. */
  duty?: number;
  /** Px the NPC drifts around its anchor (sweeping, hoeing, feeding). */
  wander?: number;
  /** 'x' keeps wandering along a boardwalk/row. */
  axis?: 'x' | 'xy';
  /** Seconds between wander steps. */
  wanderSec?: number;
  prop?: PropKind;
  /** Particles on each stroke (only near the camera). */
  fx?: 'spark' | 'dust' | 'hay' | 'smoke' | 'chips';
  /** Object names (keys of `O` in world/tiles.ts) to turn toward on arrival. */
  faceObj?: string[];
  /** Turn the head now and then. */
  lookAround?: boolean;
  /** Draw sleeping z's. */
  zzz?: boolean;
  /** Lines muttered when the player stands close. */
  mutter?: string[];
}

export const ACTS: Record<ActKind, ActDef> = {
  idle: { anim: 'idle', lookAround: true },
  sleep: { anim: 'sit', zzz: true },
  eat: { anim: 'sit', alt: 'interact', period: 3.2, duty: 0.3, prop: 'bowl', faceObj: ['Table', 'Stove'] },
  sit: { anim: 'sit', lookAround: true },
  drink: { anim: 'sit', alt: 'interact', period: 5, duty: 0.25, prop: 'mug', faceObj: ['Table', 'Bar'], mutter: ['*sips*', 'Another, Rufus.', 'Ahh. That\'s the stuff.'] },
  chat: { anim: 'sit', lookAround: true },
  pray: { anim: 'sit', faceObj: ['Table'] },
  preach: { anim: 'idle', alt: 'interact', period: 4, duty: 0.45, prop: 'book', mutter: ['…and the meek shall inherit.', 'Blessed are the peacemakers.', 'Turn to the Psalms with me.'] },
  shop: { anim: 'idle', alt: 'interact', period: 7, duty: 0.3, faceObj: ['Counter', 'Shelf', 'Desk'], lookAround: true },
  write: { anim: 'idle', alt: 'interact', period: 3, duty: 0.55, prop: 'pen', faceObj: ['Desk', 'Counter'] },
  hammer: { anim: 'interact', alt: 'idle', period: 0.9, duty: 0.4, prop: 'hammer', fx: 'spark', faceObj: ['Anvil'], mutter: ['Hot iron waits for no man.', '*clang* *clang*', 'Mind the sparks.'] },
  wipe: { anim: 'interact', alt: 'idle', period: 1.6, duty: 0.35, wander: 10, axis: 'x', wanderSec: 4, prop: 'rag', faceObj: ['Bar', 'Counter'] },
  sweep: { anim: 'interact', alt: 'idle', period: 1.1, duty: 0.4, wander: 26, axis: 'x', wanderSec: 2.6, prop: 'broom', fx: 'dust', mutter: ['Dust gets everywhere in this town.', 'Wipe your boots, friend.'] },
  hoe: { anim: 'interact', alt: 'idle', period: 1.3, duty: 0.45, wander: 30, axis: 'x', wanderSec: 3.2, prop: 'hoe', fx: 'dust', mutter: ['Ground\'s hard as a church pew.'] },
  pick: { anim: 'interact', alt: 'idle', period: 1.1, duty: 0.45, prop: 'pick', fx: 'spark', wander: 8, wanderSec: 6, mutter: ['*chink*', 'Come on, you stubborn rock.'] },
  chop: { anim: 'interact', alt: 'idle', period: 1.2, duty: 0.4, prop: 'axe', fx: 'chips', faceObj: ['Woodpile'] },
  brush: { anim: 'interact', alt: 'idle', period: 1.0, duty: 0.5, prop: 'brush', wander: 8, wanderSec: 5, faceObj: ['Stall'], mutter: ['Easy, girl. Easy.', 'There\'s a good horse.'] },
  feed: { anim: 'walk', alt: 'interact', period: 2.2, duty: 0.45, wander: 34, axis: 'xy', wanderSec: 3.5, prop: 'hay', fx: 'hay', faceObj: ['Trough', 'HayBale'], mutter: ['Come on, boss. Come on.', 'Hyah, get along.'] },
  cook: { anim: 'interact', alt: 'idle', period: 1.8, duty: 0.5, prop: 'ladle', fx: 'smoke', faceObj: ['Stove', 'FirePit'], mutter: ['Beans again. Don\'t complain.'] },
  tend: { anim: 'interact', alt: 'idle', period: 2.4, duty: 0.5, wander: 10, wanderSec: 6 },
  patrol: { anim: 'idle', lookAround: true },
  guard: { anim: 'idle', lookAround: true },
  loiter: { anim: 'idle', lookAround: true, wander: 14, wanderSec: 7 },
  stroll: { anim: 'idle', lookAround: true, wander: 40, axis: 'x', wanderSec: 6 },
  play: { anim: 'idle', wander: 40, wanderSec: 2.5 },
  stagger: { anim: 'idle', wander: 30, wanderSec: 3, prop: 'bottle', mutter: ['*hic*', 'Who moved the street?', 'I ain\'t drunk, I\'m… *hic*… thirsty.', 'Shh. Shhhh.'] },
  deal: { anim: 'sit', alt: 'interact', period: 2.5, duty: 0.4, prop: 'cards', faceObj: ['Table'], mutter: ['Ante up.', 'Read \'em and weep.'] },
  piano: { anim: 'sit', alt: 'interact', period: 0.7, duty: 0.5, faceObj: ['Piano'] },
};

// --- Routines ------------------------------------------------------------------------------

const b = (from: number, to: number, place: PlaceKind, act: ActKind): SchedBlock => ({ from, to, place, act });

const CHURCH_SUNDAY = (wake = 7, bed = 21.5): SchedBlock[] => [
  b(0, wake, 'bed', 'sleep'),
  b(wake, wake + 1, 'home', 'eat'),
  b(wake + 1, 8.5, 'street', 'stroll'),
  b(8.5, 11, 'church', 'pray'),
  b(11, 12, 'street', 'stroll'),
  b(12, 13, 'home', 'eat'),
  b(13, 17, 'porch', 'chat'),
  b(17, 18.5, 'street', 'stroll'),
  b(18.5, 19.5, 'home', 'eat'),
  b(19.5, bed, 'porch', 'chat'),
  b(bed, 24, 'bed', 'sleep'),
];

export const ROUTINES: Record<string, Routine> = {
  shopkeeper: {
    week: [
      b(0, 6, 'bed', 'sleep'),
      b(6, 6.75, 'home', 'eat'),
      b(6.75, 8, 'shopfront', 'sweep'),
      b(8, 12, 'counter', 'shop'),
      b(12, 13, 'social', 'eat'),
      b(13, 18.5, 'counter', 'shop'),
      b(18.5, 19.5, 'home', 'eat'),
      b(19.5, 21.5, 'porch', 'chat'),
      b(21.5, 24, 'bed', 'sleep'),
    ],
    sunday: CHURCH_SUNDAY(),
  },
  clerk: {
    week: [
      b(0, 6.5, 'bed', 'sleep'),
      b(6.5, 7.5, 'home', 'eat'),
      b(7.5, 12, 'work', 'write'),
      b(12, 13, 'saloon', 'eat'),
      b(13, 18, 'work', 'write'),
      b(18, 19, 'home', 'eat'),
      b(19, 21.5, 'saloon', 'drink'),
      b(21.5, 24, 'bed', 'sleep'),
    ],
    sunday: CHURCH_SUNDAY(),
  },
  smith: {
    week: [
      b(0, 5.5, 'bed', 'sleep'),
      b(5.5, 6.25, 'home', 'eat'),
      b(6.25, 12, 'work', 'hammer'),
      b(12, 13, 'saloon', 'eat'),
      b(13, 18, 'work', 'hammer'),
      b(18, 19, 'home', 'eat'),
      b(19, 22, 'saloon', 'drink'),
      b(22, 24, 'bed', 'sleep'),
    ],
    sunday: CHURCH_SUNDAY(6.5, 22),
  },
  barkeep: {
    week: [
      b(0, 2, 'counter', 'wipe'),
      b(2, 9.5, 'bed', 'sleep'),
      b(9.5, 10, 'home', 'eat'),
      b(10, 14, 'counter', 'wipe'),
      b(14, 15, 'shopfront', 'sweep'),
      b(15, 24, 'counter', 'wipe'),
    ],
  },
  sheriff: {
    week: [
      b(0, 6, 'bed', 'sleep'),
      b(6, 6.5, 'home', 'eat'),
      b(6.5, 8, 'counter', 'write'),
      b(8, 10.5, 'patrol', 'patrol'),
      b(10.5, 12, 'counter', 'write'),
      b(12, 13, 'saloon', 'eat'),
      b(13, 16, 'patrol', 'patrol'),
      b(16, 18, 'counter', 'write'),
      b(18, 19, 'home', 'eat'),
      b(19, 23, 'patrol', 'patrol'),
      b(23, 24, 'bed', 'sleep'),
    ],
    sunday: [
      b(0, 6.5, 'bed', 'sleep'),
      b(6.5, 7, 'home', 'eat'),
      b(7, 8.5, 'patrol', 'patrol'),
      b(8.5, 11, 'church', 'pray'),
      b(11, 18, 'patrol', 'patrol'),
      b(18, 19, 'home', 'eat'),
      b(19, 23, 'patrol', 'patrol'),
      b(23, 24, 'bed', 'sleep'),
    ],
  },
  nightwatch: {
    week: [
      b(0, 2.5, 'patrol', 'patrol'),
      b(2.5, 10, 'bed', 'sleep'),
      b(10, 10.5, 'home', 'eat'),
      b(10.5, 14, 'counter', 'write'),
      b(14, 18, 'patrol', 'patrol'),
      b(18, 19, 'saloon', 'eat'),
      b(19, 24, 'patrol', 'patrol'),
    ],
  },
  soldier: {
    week: [
      b(0, 5, 'bed', 'sleep'),
      b(5, 5.5, 'social', 'eat'),
      b(5.5, 12, 'guard', 'guard'),
      b(12, 13, 'social', 'eat'),
      b(13, 18, 'patrol', 'patrol'),
      b(18, 19, 'social', 'eat'),
      b(19, 22, 'camp', 'chat'),
      b(22, 24, 'bed', 'sleep'),
    ],
  },
  ranchhand: {
    week: [
      b(0, 5, 'bed', 'sleep'),
      b(5, 5.5, 'home', 'eat'),
      b(5.5, 9, 'corral', 'feed'),
      b(9, 12, 'field', 'tend'),
      b(12, 13, 'social', 'eat'),
      b(13, 15, 'stall', 'brush'),
      b(15, 17.5, 'corral', 'feed'),
      b(17.5, 18.5, 'social', 'eat'),
      b(18.5, 22, 'saloon', 'drink'),
      b(22, 24, 'bed', 'sleep'),
    ],
    sunday: [
      b(0, 6, 'bed', 'sleep'),
      b(6, 8.5, 'corral', 'feed'),
      b(8.5, 11, 'church', 'pray'),
      b(11, 13, 'social', 'eat'),
      b(13, 18, 'camp', 'chat'),
      b(18, 22, 'saloon', 'drink'),
      b(22, 24, 'bed', 'sleep'),
    ],
  },
  stable: {
    week: [
      b(0, 5.5, 'bed', 'sleep'),
      b(5.5, 6, 'home', 'eat'),
      b(6, 9, 'stall', 'brush'),
      b(9, 12, 'corral', 'feed'),
      b(12, 13, 'social', 'eat'),
      b(13, 17, 'stall', 'brush'),
      b(17, 18, 'corral', 'feed'),
      b(18, 19, 'home', 'eat'),
      b(19, 21.5, 'porch', 'chat'),
      b(21.5, 24, 'bed', 'sleep'),
    ],
  },
  trader: {
    week: [
      b(0, 6, 'bed', 'sleep'),
      b(6, 6.75, 'home', 'eat'),
      b(6.75, 8, 'corral', 'feed'),
      b(8, 12, 'counter', 'shop'),
      b(12, 13, 'saloon', 'eat'),
      b(13, 16.5, 'counter', 'shop'),
      b(16.5, 18, 'corral', 'feed'),
      b(18, 19, 'home', 'eat'),
      b(19, 21.5, 'saloon', 'drink'),
      b(21.5, 24, 'bed', 'sleep'),
    ],
    sunday: CHURCH_SUNDAY(),
  },
  farmer: {
    week: [
      b(0, 5, 'bed', 'sleep'),
      b(5, 5.5, 'home', 'eat'),
      b(5.5, 12, 'field', 'hoe'),
      b(12, 13, 'home', 'eat'),
      b(13, 18, 'field', 'hoe'),
      b(18, 19, 'home', 'eat'),
      b(19, 21, 'porch', 'chat'),
      b(21, 24, 'bed', 'sleep'),
    ],
    sunday: CHURCH_SUNDAY(6),
  },
  miner: {
    week: [
      b(0, 5, 'bed', 'sleep'),
      b(5, 5.5, 'social', 'eat'),
      b(5.5, 12, 'work', 'pick'),
      b(12, 13, 'social', 'eat'),
      b(13, 18, 'work', 'pick'),
      b(18, 23, 'saloon', 'drink'),
      b(23, 24, 'bed', 'sleep'),
    ],
  },
  logger: {
    week: [
      b(0, 5, 'bed', 'sleep'),
      b(5, 5.5, 'social', 'eat'),
      b(5.5, 12, 'work', 'chop'),
      b(12, 13, 'social', 'eat'),
      b(13, 18, 'work', 'chop'),
      b(18, 22, 'camp', 'chat'),
      b(22, 24, 'bed', 'sleep'),
    ],
  },
  railroad: {
    week: [
      b(0, 5.5, 'bed', 'sleep'),
      b(5.5, 6, 'social', 'eat'),
      b(6, 12, 'field', 'pick'),
      b(12, 13, 'saloon', 'eat'),
      b(13, 18, 'field', 'pick'),
      b(18, 22.5, 'saloon', 'drink'),
      b(22.5, 24, 'bed', 'sleep'),
    ],
  },
  hunter: {
    week: [
      b(0, 4.5, 'bed', 'sleep'),
      b(4.5, 5, 'camp', 'eat'),
      b(5, 11, 'field', 'tend'),
      b(11, 13, 'camp', 'cook'),
      b(13, 18, 'work', 'tend'),
      b(18, 22, 'camp', 'chat'),
      b(22, 24, 'bed', 'sleep'),
    ],
  },
  cook: {
    week: [
      b(0, 4.5, 'bed', 'sleep'),
      b(4.5, 10, 'work', 'cook'),
      b(10, 11, 'shopfront', 'sweep'),
      b(11, 14, 'work', 'cook'),
      b(14, 16, 'social', 'sit'),
      b(16, 20, 'work', 'cook'),
      b(20, 22, 'social', 'chat'),
      b(22, 24, 'bed', 'sleep'),
    ],
  },
  nightlife: {
    week: [
      b(0, 3, 'saloon', 'drink'),
      b(3, 12, 'bed', 'sleep'),
      b(12, 13, 'home', 'eat'),
      b(13, 14.5, 'street', 'stroll'),
      b(14.5, 24, 'saloon', 'drink'),
    ],
  },
  gambler: {
    week: [
      b(0, 4, 'saloon', 'deal'),
      b(4, 11, 'bed', 'sleep'),
      b(11, 12, 'street', 'loiter'),
      b(12, 13, 'saloon', 'eat'),
      b(13, 24, 'saloon', 'deal'),
    ],
  },
  pianist: {
    week: [
      b(0, 2, 'work', 'piano'),
      b(2, 11, 'bed', 'sleep'),
      b(11, 12, 'home', 'eat'),
      b(12, 15, 'street', 'stroll'),
      b(15, 16, 'saloon', 'eat'),
      b(16, 24, 'work', 'piano'),
    ],
  },
  preacher: {
    week: [
      b(0, 6, 'bed', 'sleep'),
      b(6, 7, 'home', 'eat'),
      b(7, 12, 'work', 'preach'),
      b(12, 13, 'home', 'eat'),
      b(13, 17, 'patrol', 'stroll'),
      b(17, 19, 'church', 'pray'),
      b(19, 20, 'home', 'eat'),
      b(20, 24, 'bed', 'sleep'),
    ],
    sunday: [
      b(0, 6, 'bed', 'sleep'),
      b(6, 7, 'home', 'eat'),
      b(7, 8.5, 'church', 'pray'),
      b(8.5, 11, 'work', 'preach'),
      b(11, 13, 'shopfront', 'chat'),
      b(13, 18, 'porch', 'chat'),
      b(18, 19, 'home', 'eat'),
      b(19, 24, 'bed', 'sleep'),
    ],
  },
  drifter: {
    week: [
      b(0, 1.5, 'street', 'stagger'),
      b(1.5, 9, 'bed', 'sleep'),
      b(9, 12, 'street', 'loiter'),
      b(12, 13, 'saloon', 'eat'),
      b(13, 18, 'porch', 'loiter'),
      b(18, 22.5, 'saloon', 'drink'),
      b(22.5, 24, 'street', 'stagger'),
    ],
  },
  traveler: {
    week: [
      b(0, 7, 'bed', 'sleep'),
      b(7, 8, 'saloon', 'eat'),
      b(8, 12, 'street', 'stroll'),
      b(12, 13, 'saloon', 'eat'),
      b(13, 18, 'street', 'loiter'),
      b(18, 22, 'saloon', 'drink'),
      b(22, 24, 'bed', 'sleep'),
    ],
  },
  child: {
    week: [
      b(0, 7, 'bed', 'sleep'),
      b(7, 7.5, 'home', 'eat'),
      b(7.5, 12, 'street', 'play'),
      b(12, 13, 'home', 'eat'),
      b(13, 18, 'street', 'play'),
      b(18, 19, 'home', 'eat'),
      b(19, 20, 'porch', 'chat'),
      b(20, 24, 'bed', 'sleep'),
    ],
    sunday: [
      b(0, 7, 'bed', 'sleep'),
      b(7, 8.5, 'home', 'eat'),
      b(8.5, 11, 'church', 'pray'),
      b(11, 12, 'home', 'eat'),
      b(12, 18, 'street', 'play'),
      b(18, 19, 'home', 'eat'),
      b(19, 24, 'bed', 'sleep'),
    ],
  },
  elder: {
    week: [
      b(0, 6.5, 'bed', 'sleep'),
      b(6.5, 7.5, 'home', 'eat'),
      b(7.5, 12, 'porch', 'chat'),
      b(12, 13, 'home', 'eat'),
      b(13, 18, 'porch', 'chat'),
      b(18, 19, 'home', 'eat'),
      b(19, 21, 'porch', 'chat'),
      b(21, 24, 'bed', 'sleep'),
    ],
    sunday: CHURCH_SUNDAY(6.5, 21),
  },
  outlaw: {
    week: [
      b(0, 6, 'camp', 'sit'),
      b(6, 12, 'guard', 'guard'),
      b(12, 13, 'camp', 'eat'),
      b(13, 20, 'guard', 'guard'),
      b(20, 24, 'camp', 'chat'),
    ],
  },
};

/** Occupation → routine id. Unknown occupations fall back to `shopkeeper`. */
export const ROUTINE_OF: Record<string, string> = {
  merchant: 'shopkeeper', gunsmith: 'shopkeeper', tailor: 'shopkeeper', hotelier: 'shopkeeper', doctor: 'shopkeeper', banker: 'shopkeeper',
  editor: 'clerk', telegrapher: 'clerk', surveyor: 'clerk',
  blacksmith: 'smith',
  bartender: 'barkeep',
  sheriff: 'sheriff', deputy: 'nightwatch', soldier: 'soldier', bountyhunter: 'drifter',
  cowhand: 'ranchhand', rancher: 'ranchhand', breeder: 'ranchhand',
  stablehand: 'stable', horsetrader: 'trader',
  farmer: 'farmer', miner: 'miner', logger: 'logger', railroad: 'railroad', hunter: 'hunter', trapper: 'hunter', cook: 'cook',
  saloongirl: 'nightlife', gambler: 'gambler', pianist: 'pianist', preacher: 'preacher',
  drifter: 'drifter', traveler: 'traveler', child: 'child', elder: 'elder', outlaw: 'outlaw',
};

/**
 * Named outdoor work spots (settlement layouts name them: `spot('work', x, y, _, 'mine')`)
 * that each trade prefers, best first. NPCs fall back to generic spots when a place has none.
 */
export const WORK_SPOTS: Record<string, string[]> = {
  miner: ['mine'],
  logger: ['logs'],
  blacksmith: ['forge'],
  farmer: ['field', 'orchard', 'flock'],
  railroad: ['platform', 'stockyard'],
  telegrapher: ['platform'],
  surveyor: ['platform'],
  cowhand: ['stockyard', 'pens', 'branding', 'pasture'],
  rancher: ['branding', 'pasture', 'pens'],
  stablehand: ['paddock', 'roundpen'],
  breeder: ['roundpen', 'paddock', 'flock'],
  horsetrader: ['roundpen', 'paddock'],
  trapper: ['pier'],
  hunter: ['pier'],
  traveler: ['pier', 'platform'],
  cook: [],
};

/** What a worker does at a named spot (overrides the routine's activity for work blocks). */
export const SPOT_ACT: Record<string, ActKind> = {
  mine: 'pick', logs: 'chop', forge: 'hammer', field: 'hoe', orchard: 'tend', flock: 'feed', platform: 'loiter', stockyard: 'feed',
  pens: 'feed', branding: 'tend', pasture: 'feed', roundpen: 'brush', paddock: 'feed', pier: 'tend',
};

/** Routine activities that count as work (eligible for SPOT_ACT overrides). */
export const WORK_ACTS = new Set<ActKind>(['hammer', 'wipe', 'sweep', 'hoe', 'pick', 'chop', 'brush', 'feed', 'cook', 'tend', 'write', 'shop']);

/** Day 1 is Tuesday 3 April 1888, so Sundays are days 6, 13, 20… */
export function isSunday(day: number): boolean {
  return day % 7 === 6;
}

/**
 * The schedule block an NPC is in. `personality` tweaks it: drunks drink
 * their evenings away and stagger home; the pious pray at dusk.
 */
export function blockAt(occupation: string, personality: readonly string[], hour: number, day: number): { block: SchedBlock; idx: number } {
  const r = ROUTINES[ROUTINE_OF[occupation] ?? 'shopkeeper'] ?? ROUTINES.shopkeeper!;
  const list = (isSunday(day) && r.sunday) || r.week;
  let idx = list.findIndex((x) => hour >= x.from && hour < x.to);
  if (idx < 0) idx = list.length - 1;
  let block = list[idx]!;
  if (personality.includes('drunk') && occupation !== 'child' && occupation !== 'bartender' && occupation !== 'outlaw') {
    if (block.from >= 19 && (block.place === 'porch' || block.place === 'camp' || block.place === 'saloon')) block = { ...block, place: 'saloon', act: 'drink' };
    else if (hour >= 23 && block.act === 'sleep') block = { ...block, place: 'street', act: 'stagger' };
  }
  return { block, idx };
}

// --- Relationships ---------------------------------------------------------------------------

export type Relation = 'family' | 'friend' | 'rival' | 'colleague' | 'acquaintance';

/** Authored relationships between story NPCs (ids from story/npcs.ts). Unknown ids are ignored. */
export const RELATIONS: { a: string; b: string; rel: Relation }[] = [
  { a: 'whitlock', b: 'dane', rel: 'colleague' },
  { a: 'rufus', b: 'gideon', rel: 'friend' },
  { a: 'pettibone', b: 'crane', rel: 'rival' },
  { a: 'gatlin', b: 'josiah', rel: 'friend' },
  { a: 'okafor', b: 'shaw', rel: 'friend' },
  { a: 'rufus', b: 'shaw', rel: 'rival' },
  { a: 'pettibone', b: 'gatlin', rel: 'rival' },
  { a: 'tilly', b: 'crane', rel: 'family' },
];

const GRUFF = ['gruff', 'proud', 'shrewd', 'drunk'];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface SocialPerson {
  id: string;
  name: string;
  occupation: string;
  personality: readonly string[];
  settlement: string;
}

/** Surname = last word of the name, ignoring titles. */
export function surnameOf(name: string): string {
  const parts = name.replace(/^(Sheriff|Deputy|Dr\.|Reverend|Mrs\.|Mr\.|Miss|Ma|Pa|Old)\s+/i, '').trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1]! : '';
}

/** First name for familiar address ("Amos", not "Sheriff Amos Whitlock"). */
export function firstNameOf(name: string): string {
  const parts = name.replace(/^(Sheriff|Deputy|Dr\.|Reverend|Mrs\.|Mr\.|Miss)\s+/i, '').trim().split(/\s+/);
  return parts[0] ?? name;
}

/**
 * Deterministic relationship between two townsfolk. Symmetric:
 * relationBetween(a,b) === relationBetween(b,a).
 */
export function relationBetween(a: SocialPerson, b: SocialPerson): Relation {
  const authored = RELATIONS.find((r) => (r.a === a.id && r.b === b.id) || (r.a === b.id && r.b === a.id));
  if (authored) return authored.rel;
  if (a.settlement === b.settlement) {
    const sa = surnameOf(a.name);
    if (sa && sa === surnameOf(b.name)) return 'family';
  }
  const key = a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id;
  const roll = hash(key) % 100;
  const prickly = (GRUFF.includes(a.personality[0] ?? '') ? 1 : 0) + (GRUFF.includes(b.personality[0] ?? '') ? 1 : 0);
  if (roll < 6 + prickly * 9) return 'rival';
  if (a.occupation === b.occupation && roll < 60) return 'colleague';
  if (roll > 70) return 'friend';
  return 'acquaintance';
}

// --- Conversation topics ---------------------------------------------------------------------

/**
 * An exchange: speaker A, then B, optionally A again. Tokens:
 * {a} {b} speaker/partner first names, {player}, {town}, {horse}, {victim}, {crime}, {item}.
 */
export type Exchange = string[];

export const TOPICS: Record<string, Exchange[]> = {
  greetMorning: [
    ['Mornin\', {b}.', 'Mornin\'. Sleep well?', 'Like a stone.'],
    ['{b}! Coffee\'s on at the hotel.', 'Bless you. I need it.'],
    ['Early start, {b}?', 'Ain\'t they all.'],
  ],
  greetDay: [
    ['Afternoon, {b}.', 'Afternoon, {a}. Keeping well?', 'Can\'t complain. Well — I can.'],
    ['{b}. How\'s the family?', 'Loud. Healthy. Hungry.'],
    ['Hot enough for you, {b}?', 'Hotter in Hell, they say. Not by much.'],
  ],
  greetEvening: [
    ['Evenin\', {b}.', 'Evenin\'. Long day?', 'Longer than most.'],
    ['Heading to the Spur, {b}?', 'Where else is there?'],
  ],
  friend: [
    ['{b}, you old dog!', 'Ha! {a}! Buy you a drink later?', 'You\'re buying.'],
    ['Saved you a seat at supper, {b}.', 'You\'re a saint, {a}.'],
    ['Heard you were sick, {b}.', 'Takes more than a cough to kill me.'],
    ['Fishing Sunday, {b}?', 'If the Lord and my wife allow it.'],
  ],
  rival: [
    ['{b}.', '{a}.', '…'],
    ['You still owe me two dollars, {b}.', 'Put it on my tab, then.', 'You ain\'t got a tab.'],
    ['Your mule\'s in my yard again, {b}.', 'Maybe your yard\'s too close to my mule.'],
    ['Heard your prices went up, {b}.', 'Heard your manners didn\'t.'],
  ],
  family: [
    ['Supper\'s at six, don\'t be late.', 'Yes, yes. I know.'],
    ['Did you fix the porch step?', 'Tomorrow.', 'You said that Tuesday.'],
    ['Mind your manners in town.', 'I always do!'],
  ],
  colleague: [
    ['Busy day, {b}?', 'Busier than I\'d like. Pays the same, though.'],
    ['Boss in a mood today?', 'When ain\'t he.'],
  ],
  rain: [
    ['Rain at last!', 'Don\'t count on it lasting.'],
    ['Street\'s turning to soup.', 'Mind your boots, then.'],
    ['Lord, look at it come down.', 'Good for the grass. Bad for my roof.'],
  ],
  snow: [['Cold enough to freeze a coffee pot.', 'Mine froze last night.'], ['Snow\'s early this year.', 'Or we\'re late.']],
  dust: [['Can\'t see across the street.', 'Tie a kerchief on, it\'s blowin\' all week.']],
  hot: [['Not a cloud in the sky.', 'Wells are running low again.'], ['Too hot to work.', 'Too poor not to.']],
  cold: [['Wind\'s got teeth tonight.', 'Wrap up, {a}.']],
  night: [
    ['Late to be out, {b}.', 'Couldn\'t sleep.'],
    ['Quiet night.', 'Let\'s keep it that way.'],
  ],
  sunday: [
    ['Fine sermon this morning.', 'The Reverend went on a bit.', 'He always does.'],
    ['Day of rest, {b}.', 'Tell that to my cows.'],
  ],
  gossip: [
    ['Railroad men were at the bank again.', 'Buying, or threatening?', 'Both, I\'d wager.'],
    ['Water\'s low at the ford.', 'Water rights again. Mark me — blood before summer.'],
    ['Rustlers hit the Brannigan place.', 'Lord. The law doing anything?', 'Sheriff\'s doing his best.'],
    ['Heard the Coyle boys were seen near the pass.', 'Hush. Don\'t say that name so loud.'],
    ['Fort Rourke\'s buying remounts.', 'Good money for a sound horse.'],
    ['A pale mare\'s running with the mustangs, they say.', 'Folk say a lot of things.'],
  ],
  crime: [
    ['Did you hear? {crime} — right here in {town}.', 'Lord have mercy. Who?', 'Saw it with my own eyes.'],
    ['Somebody saw a {crime} by the street.', 'Sheriff know?', 'Does now.'],
  ],
  killing: [
    ['They say {victim} is dead.', 'Shot? By who?', 'Folk are saying {player}.'],
    ['Poor {victim}.', 'Bad business. Bad business.'],
  ],
  gunfire: [
    ['You hear those shots?', 'Too close for my liking.'],
    ['Gunfire again. In daylight!', 'Keep your head down, {a}.'],
  ],
  playerGood: [
    ['That {player} pulled a man out of trouble, I heard.', 'Good to have decent folk around.'],
    ['{player}\'s a straight one.', 'Rare as rain, these days.'],
  ],
  playerBad: [
    ['See that one? {player}.', 'I know the name. Don\'t stare.'],
    ['{player}\'s trouble, mark me.', 'Then don\'t give \'em any reason.'],
  ],
  playerWanted: [
    ['That\'s the one off the poster!', 'Keep walking. Don\'t look.'],
    ['Somebody fetch the sheriff…', 'You fetch him. I\'m staying alive.'],
  ],
  playerNew: [
    ['New face in {town}.', 'Drifter, by the look.', 'Or trouble.'],
    ['Who\'s the stranger?', 'Name\'s {player}, I heard.'],
  ],
  playerKnown: [
    ['{player} came by my place.', 'Polite?', 'Polite enough.'],
    ['{player} still in town?', 'Saw \'em this morning.'],
  ],
  playerHorse: [
    ['Look at that horse.', 'That {horse}? Well kept, that one.'],
    ['Fine animal {player} rides.', 'Bet it cost a pretty penny.'],
  ],
  work: [
    ['Business slow?', 'Like molasses in January.'],
    ['Got a wagon coming from Port Ashby.', 'Hope it brings flour. We\'re near out.'],
    ['Sold three saddles today.', 'Somebody\'s riding out, then.'],
  ],
  saloon: [
    ['Another round!', 'You\'re paying this time.'],
    ['Deal me in.', 'Money first, friend.'],
    ['To {town}!', 'To {town}! And to dry boots.'],
    ['Play something cheerful!', 'Piano only knows sad songs.'],
  ],
  porch: [
    ['Remember when this was all grass?', 'Grass and Sayen camps. Long time back.'],
    ['Wind\'s turning.', 'Weather\'s coming, then.'],
    ['Look at \'em hurry. Where\'s everybody going?', 'Nowhere fast.'],
  ],
  campfire: [
    ['Coffee\'s burnt.', 'Coffee\'s always burnt.'],
    ['Sing something, {b}.', 'You don\'t want that.', 'No. We don\'t.'],
    ['Cattle\'ll drift if that wind holds.', 'We\'ll ride out at dawn.'],
  ],
  kids: [
    ['Tag! You\'re it!', 'No fair!'],
    ['Race you to the well!', 'You\'re on!'],
    ['I seen a rattler by the church.', 'Liar!', 'Did so!'],
  ],
};

/** Per-occupation work talk (used when either speaker has a matching job). */
export const WORK_TALK: Record<string, Exchange[]> = {
  blacksmith: [['Need that wheel by Friday.', 'You\'ll have it Thursday.']],
  sheriff: [['Any trouble last night, Sheriff?', 'Nothing I couldn\'t handle.']],
  deputy: [['Quiet shift?', 'Too quiet. I don\'t trust it.']],
  bartender: [['Whiskey shipment came in.', 'Watered, I suppose.', 'Only a little.']],
  merchant: [['Got any coffee in?', 'Came in Tuesday. Price went up.']],
  cowhand: [['Herd\'s thin this year.', 'Grass is thinner.']],
  farmer: [['Corn\'s coming in poor.', 'Rain\'ll fix it.', 'If it comes.']],
  miner: [['Seam\'s pinching out.', 'Then dig deeper.']],
  stablehand: [['That bay\'s favouring her left fore.', 'Get the farrier to look.']],
  doctor: [['Doc, my back\'s acting up again.', 'Come by after supper, {a}.'], ['Thank you for the tonic, Doc.', 'Did it help?', 'Slept like a baby.']],
  preacher: [['Mornin\', Reverend.', 'Will we see you Sunday, {a}?', 'Lord willing.']],
};

/** Lines when the player is involved directly (reactions). */
export const REACT_LINES = {
  bumped: ['Pardon me.', 'Excuse me!', 'Watch your step, friend.', 'Oof — easy there.'],
  bumpedRude: ['Watch where you\'re going!', 'Keep your elbows to yourself!', 'You blind?'],
  bumpedAngry: ['That\'s enough shoving!', 'Do that again and see what happens.'],
  horseNear: ['Whoa! Watch that horse!', 'Slow down, you lunatic!', 'Easy! There\'s folk walking here!'],
  rain: ['Rain\'s coming! Get inside!', 'Here it comes!', 'My hat!'],
  gunfire: ['Get down!', 'Lord, they\'re shooting!', 'Inside, quick!', 'Not again…'],
  danger: ['Is it over?', 'Somebody fetch the sheriff.'],
  lantern: ['Dark already.', 'Should\'ve brought a lantern.'],
  tipHat: ['{player}.', 'Afternoon, {player}.', 'Good to see you, {player}.', 'Ma\'am. Sir. Whichever.'],
  regular: ['{player}! My best customer.', 'Ah, {player}. The usual?', 'Back again, {player}? Good, good.'],
  wary: ['I don\'t want trouble.', '…', 'Keep walking.'],
  disliked: ['You again.', 'Hmph.', 'Not you.'],
};

/** Tuning knobs for the social layer (data-driven; see social system). */
export const SOCIAL_TUNING = {
  /** Px from the player within which social AI runs (LOD: beyond it NPCs just follow schedules). */
  simRadius: 560,
  /** Seconds between social ticks. */
  tickSec: 0.3,
  /** Two walkers closer than this may stop and talk. */
  meetRadius: 28,
  /** Seated NPCs within this form a group (saloon table, porch, campfire). */
  groupRadius: 44,
  /** Seconds a line stays up. */
  lineSec: 2.8,
  /** Gap between lines. */
  gapSec: 0.45,
  /** Per-NPC cooldown after a conversation (min, random extra). */
  npcCooldown: [28, 40] as [number, number],
  /** Pair cooldown. */
  pairCooldown: 150,
  /** Group cooldown between exchanges at one table (min, extra). */
  groupCooldown: [9, 14] as [number, number],
  /** Base chance per social tick that a meeting turns into a chat. */
  chatChance: 0.45,
  /** Px within which NPCs acknowledge the passing player. */
  greetRadius: 50,
  greetCooldown: 75,
  /** Player-on-foot overlap that counts as a bump. */
  bumpRadius: 10,
  /** Mounted-player speed (px/s) that makes pedestrians dive aside. */
  horseDangerSpeed: 55,
  horseDangerRadius: 30,
  /** Rain intensity that sends outdoor folk under a roof. */
  rainShelter: 0.35,
  /** Daylight below which NPCs outdoors light a lantern. */
  lanternDaylight: 0.45,
  /** Px from the camera centre for work particles. */
  fxRadius: 380,
  /** Seconds civilians hide after gunfire (min, extra). */
  hideSec: [12, 10] as [number, number],
  /** Max simultaneous conversations (bubble budget). */
  maxConvos: 6,
  /** Game minutes a patrolling lawman spends on each leg of the beat. */
  patrolStepMin: 25,
  /** Game minutes before a stroller/loiterer drifts to another street spot. */
  strollStepMin: 45,
  /** Px a frightened civilian will run to reach a door. */
  hideSearchRadius: 180,
};
