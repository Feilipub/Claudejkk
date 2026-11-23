/**
 * Paid work, regional trade and homesteads. Job templates, the notice board in each settlement, who offers
 * what when asked for work, and where reported outlaws camp. Pure data.
 *
 * Every dollar figure here is the pay at skill level 1, reputation 0, employer
 * standing 0, demand 1.0 and performance 1.0; systems/economy.ts `jobPay`
 * applies the multipliers. Rationale and the hourly-rate targets these numbers
 * are tuned against: design/gdd/economy-jobs.md.
 */
import type { RepKey } from './schema.ts';

export type JobKind = 'deliver' | 'gather' | 'cattle' | 'chores' | 'breakHorse' | 'bounty' | 'bartend';

/**
 * Wage band the template is balanced against (GDD § Formulas, hourly rate):
 * honest $5–15 per real hour at skill 1; risky and dangerous pay more.
 */
export type JobRisk = 'honest' | 'risky' | 'dangerous';

/** Skill ids from systems/skills.ts. */
export type JobSkill = 'riding' | 'shooting' | 'horsemanship' | 'survival';

/** World object names from world/tiles.ts `O` that chore markers can sit on. */
export type ChoreObj = 'FenceH' | 'FenceV' | 'Trough' | 'Anvil';

export interface JobTemplate {
  id: string;
  title: string;
  kind: JobKind;
  risk: JobRisk;
  /** What the employer says on the board. */
  blurb: string;
  skill?: JobSkill;
  /** Faction whose reputation scales pay. */
  faction?: RepKey;
  /** base + perUnit × units + perTile × straight-line tiles (deliveries). */
  pay: { base: number; perUnit?: number; perTile?: number };
  /** Money the activity already pays through another system (e.g. the colt-breaking fee). Hourly-rate checks only. */
  externalPay?: number;
  /** Expected real minutes for one job, including walking to the work (deliveries add riding time per tile). Hourly-rate checks only. */
  minutes: number;
  /** Skill XP granted on completion. */
  xp?: number;
  /** Relative chance the template fills a board slot. */
  weight?: number;
  deliver?: { cargo: string; qty: number; pace: 'normal' | 'express'; minTiles: number; maxTiles: number; ambushChance?: number; bandits?: [number, number] };
  gather?: { items: string[]; qty: [number, number]; deadlineDays: number };
  cattle?: { head: [number, number]; limitMinutes: number; spawnTiles: number };
  chores?: { objs: ChoreObj[]; count: number; strikes: number; task: string; label: string; consumes?: string; limitMinutes: number };
  bounty?: { gang: [number, number]; limitDays: number; title: string };
  bartend?: { orders: number };
}

const T = (t: JobTemplate): JobTemplate => t;

export const JOB_TEMPLATES: JobTemplate[] = [
  // --- Ranch work ---------------------------------------------------------------------------
  T({ id: 'cattle_drive', title: 'Pen the strays', kind: 'cattle', risk: 'honest', skill: 'riding', faction: 'ranchers', xp: 12, minutes: 4,
    blurb: 'Some steers broke through the wire. Ride round behind them and push them back through the corral gate.',
    pay: { base: 0.3, perUnit: 0.11 }, cattle: { head: [4, 6], limitMinutes: 240, spawnTiles: 26 } }),
  T({ id: 'mend_fences', title: 'Mend the corral fence', kind: 'chores', risk: 'honest', skill: 'survival', faction: 'ranchers', xp: 8, minutes: 3.5,
    blurb: 'Rails are down all along the corral. Flags mark the bad sections — nail them back up.',
    pay: { base: 0.2, perUnit: 0.1 }, chores: { objs: ['FenceH', 'FenceV'], count: 4, strikes: 2, task: 'mend', label: 'Mend fence', limitMinutes: 240 } }),
  T({ id: 'feed_stock', title: 'Feed the stock', kind: 'chores', risk: 'honest', skill: 'horsemanship', faction: 'ranchers', xp: 8, minutes: 2.5,
    blurb: 'Fork hay into every trough on the place before the stock starts bawling.',
    pay: { base: 0.2, perUnit: 0.08 }, chores: { objs: ['Trough'], count: 3, strikes: 1, task: 'feed', label: 'Fork hay into trough', consumes: 'hay', limitMinutes: 180 } }),
  T({ id: 'break_colt', title: 'Break a green colt', kind: 'breakHorse', risk: 'risky', skill: 'horsemanship', faction: 'ranchers', xp: 0, minutes: 3, externalPay: 7,
    blurb: 'A colt that has never worn a saddle. Stay on until he quits. The breaking fee is paid as usual; the contract adds a bonus.',
    pay: { base: 0.6 } }),

  // --- Freight, mail and strongboxes ---------------------------------------------------------
  T({ id: 'freight', title: 'Freight haul', kind: 'deliver', risk: 'honest', skill: 'riding', faction: 'railroad', xp: 10, minutes: 1.5, weight: 2,
    blurb: 'Two parcels on the waybill. Deliver them to the board at the destination before the deadline.',
    pay: { base: 0.15, perTile: 0.0014 }, deliver: { cargo: 'freightParcel', qty: 2, pace: 'normal', minTiles: 60, maxTiles: 360 } }),
  T({ id: 'mail_run', title: 'Mail rider', kind: 'deliver', risk: 'honest', skill: 'riding', faction: 'railroad', xp: 12, minutes: 1.5,
    blurb: 'One sack of territorial mail on a tight schedule. Ride hard; late mail docks your pay.',
    pay: { base: 0.15, perTile: 0.0013 }, deliver: { cargo: 'mailSack', qty: 1, pace: 'express', minTiles: 60, maxTiles: 360 } }),
  T({ id: 'strongbox', title: 'Strongbox run', kind: 'deliver', risk: 'risky', skill: 'shooting', faction: 'railroad', xp: 15, minutes: 3, weight: 0.7,
    blurb: 'Company payroll. Road agents watch these runs, so the pay is good — if it arrives.',
    pay: { base: 1.2, perTile: 0.004 }, deliver: { cargo: 'strongbox', qty: 1, pace: 'normal', minTiles: 100, maxTiles: 360, ambushChance: 0.6, bandits: [2, 3] } }),

  // --- Labour contracts (bring goods to the board) -------------------------------------------
  T({ id: 'ore_contract', title: 'Muck ore for the mill', kind: 'gather', risk: 'honest', skill: 'survival', faction: 'townsfolk', xp: 8, minutes: 3.5,
    blurb: 'Dig raw ore at the mine entrance with a pick and bring the sacks here. Paid by the sack, no haggling.',
    pay: { base: 0.15, perUnit: 0.1 }, gather: { items: ['oreRaw'], qty: [4, 6], deadlineDays: 2 } }),
  T({ id: 'lumber_contract', title: 'Cut timber for the mill', kind: 'gather', risk: 'honest', skill: 'survival', faction: 'townsfolk', xp: 8, minutes: 3.5,
    blurb: 'Fell timber with an axe and bring the split rails here.',
    pay: { base: 0.15, perUnit: 0.11 }, gather: { items: ['lumber'], qty: [4, 6], deadlineDays: 2 } }),
  T({ id: 'harvest_wheat', title: 'Bring in the wheat', kind: 'gather', risk: 'honest', skill: 'survival', faction: 'townsfolk', xp: 8, minutes: 3,
    blurb: 'The wheat is ripe and the wind is coming. Cut and bind sheaves from the field and stack them here.',
    pay: { base: 0.15, perUnit: 0.05 }, gather: { items: ['wheatSheaf'], qty: [6, 10], deadlineDays: 1 } }),
  T({ id: 'fish_trout', title: 'Fish for the cookhouse', kind: 'gather', risk: 'honest', skill: 'survival', faction: 'townsfolk', xp: 6, minutes: 6.5,
    blurb: 'The crew eats trout on Fridays. Steady price, no matter how full the market is.',
    pay: { base: 0.25, perUnit: 0.16 }, gather: { items: ['fishTrout'], qty: [6, 8], deadlineDays: 2 } }),
  T({ id: 'fish_bass', title: 'Bass for the hotel kitchen', kind: 'gather', risk: 'honest', skill: 'survival', faction: 'townsfolk', xp: 6, minutes: 6.5,
    blurb: 'The hotel kitchen wants smallmouth bass for the supper table. Steady price, however full the market is.',
    pay: { base: 0.25, perUnit: 0.16 }, gather: { items: ['fishBass'], qty: [6, 8], deadlineDays: 2 } }),
  T({ id: 'hunt_deer', title: 'Hunting contract: deer hides', kind: 'gather', risk: 'risky', skill: 'survival', faction: 'townsfolk', xp: 10, minutes: 7,
    blurb: 'A tanner wants clean buckskin. Paid at a guaranteed price.',
    pay: { base: 0.5, perUnit: 3.6 }, gather: { items: ['peltDeer'], qty: [1, 2], deadlineDays: 3 } }),
  T({ id: 'hunt_coyote', title: 'Hunting contract: coyotes', kind: 'gather', risk: 'risky', skill: 'survival', faction: 'ranchers', xp: 10, minutes: 7,
    blurb: 'Coyotes are taking calves. Bring the pelts as proof.',
    pay: { base: 0.5, perUnit: 2.6 }, gather: { items: ['peltCoyote'], qty: [2, 3], deadlineDays: 3 } }),
  T({ id: 'hunt_wolf', title: 'Hunting contract: wolves', kind: 'gather', risk: 'dangerous', skill: 'shooting', faction: 'ranchers', xp: 14, minutes: 9,
    blurb: 'A pack is working the high pastures. Wolf pelts, paid well.',
    pay: { base: 1, perUnit: 6 }, gather: { items: ['peltWolf'], qty: [1, 2], deadlineDays: 3 } }),

  // --- Town shifts --------------------------------------------------------------------------
  T({ id: 'bartend', title: 'Tend bar for a shift', kind: 'bartend', risk: 'honest', faction: 'townsfolk', xp: 0, minutes: 2,
    blurb: 'Short-handed tonight. Pour what they ask for, keep the tab straight, keep the tips.',
    pay: { base: 0.15, perUnit: 0.05 }, bartend: { orders: 5 } }),
  T({ id: 'smith_helper', title: 'Strike for the smith', kind: 'chores', risk: 'honest', faction: 'townsfolk', xp: 0, minutes: 1.8,
    blurb: 'Swing the sledge when the iron is at heat. Miss and you ruin a shoe.',
    pay: { base: 0.3 }, chores: { objs: ['Anvil'], count: 1, strikes: 8, task: 'forge', label: 'Strike at the anvil', limitMinutes: 120 } }),

  // --- Bounties -----------------------------------------------------------------------------
  T({ id: 'bounty_petty', title: 'Wanted: horse thief', kind: 'bounty', risk: 'dangerous', skill: 'shooting', faction: 'townsfolk', xp: 20, minutes: 8, externalPay: 15,
    blurb: 'Alive preferred. Hogtie and bring to any sheriff. Dead pays half, claimed at this board.',
    pay: { base: 2.5, perUnit: 1.5 }, bounty: { gang: [0, 0], limitDays: 3, title: 'Horse Thief' } }),
  T({ id: 'bounty_gang', title: 'Wanted: road agent and gang', kind: 'bounty', risk: 'dangerous', skill: 'shooting', faction: 'townsfolk', xp: 30, minutes: 10, externalPay: 15, weight: 0.6,
    blurb: 'A road agent with friends. The leader is the bounty; the rest are your problem.',
    pay: { base: 4, perUnit: 2 }, bounty: { gang: [1, 2], limitDays: 3, title: 'Road Agent' } }),
];

export interface JobBoardDef {
  settlementId: string;
  name: string;
  /** Building types, in order of preference, whose door hosts the board. */
  buildings: string[];
  templates: string[];
  /** Offers posted per day. */
  slots: number;
  /** Board is closed until this quest is completed. */
  requiresQuest?: string;
}

export const JOB_BOARDS: JobBoardDef[] = [
  { settlementId: 'larkspur', name: 'Larkspur Notice Board', buildings: ['sheriff', 'telegraph', 'hotel'], slots: 4,
    templates: ['freight', 'mail_run', 'strongbox', 'bounty_petty', 'bounty_gang', 'bartend', 'smith_helper', 'hunt_deer', 'hunt_coyote'] },
  { settlementId: 'portashby', name: 'Port Ashby Exchange Board', buildings: ['station', 'sheriff', 'bank'], slots: 4,
    templates: ['freight', 'mail_run', 'strongbox', 'bounty_petty', 'bounty_gang', 'bartend', 'hunt_wolf', 'fish_bass'] },
  { settlementId: 'brannigan', name: 'Brannigan Ranch Chalkboard', buildings: ['ranchhouse', 'barn'], slots: 3, requiresQuest: 'main_arrival',
    templates: ['cattle_drive', 'mend_fences', 'feed_stock', 'break_colt'] },
  { settlementId: 'whitepeak', name: 'Whitepeak Trading Post Board', buildings: ['tradingpost', 'barn'], slots: 3,
    templates: ['cattle_drive', 'mend_fences', 'freight', 'hunt_wolf', 'hunt_deer'] },
  { settlementId: 'sulfurflats', name: 'Sulfur Flats Company Board', buildings: ['assay', 'store'], slots: 3,
    templates: ['ore_contract', 'freight', 'strongbox', 'bartend', 'hunt_coyote'] },
  { settlementId: 'cedarnotch', name: 'Cedar Notch Mill Board', buildings: ['sawmill', 'cookhouse'], slots: 3,
    templates: ['lumber_contract', 'fish_trout', 'freight', 'hunt_deer'] },
  { settlementId: 'fortrourke', name: 'Fort Rourke Sutler\'s Board', buildings: ['officers', 'store'], slots: 3,
    templates: ['bounty_petty', 'bounty_gang', 'freight', 'mail_run', 'hunt_coyote'] },
  { settlementId: 'meridian', name: 'Meridian Junction Freight Office', buildings: ['station', 'telegraph'], slots: 3,
    templates: ['freight', 'mail_run', 'strongbox'] },
  { settlementId: 'halvorsen', name: 'Halvorsen Farm Gate', buildings: ['house', 'barn'], slots: 2,
    templates: ['harvest_wheat', 'mend_fences', 'feed_stock'] },
  // Open-world expansion settlements (world/settlements team).
  { settlementId: 'harrow', name: 'Harrow Junction Freight Office', buildings: ['station', 'warehouse', 'sheriff'], slots: 4,
    templates: ['freight', 'mail_run', 'strongbox', 'bounty_petty', 'bounty_gang', 'bartend', 'smith_helper'] },
  { settlementId: 'golondrinas', name: 'Las Golondrinas Plaza Board', buildings: ['store', 'chapel', 'saloon'], slots: 3,
    templates: ['harvest_wheat', 'smith_helper', 'bartend', 'freight', 'hunt_coyote'] },
  { settlementId: 'lodestar', name: 'Lodestar Claims Board', buildings: ['assay', 'tradingpost'], slots: 3,
    templates: ['ore_contract', 'freight', 'strongbox', 'hunt_wolf', 'bartend'] },
  { settlementId: 'tollers', name: 'Toller\'s Landing Post Board', buildings: ['tradingpost', 'warehouse'], slots: 3,
    templates: ['fish_bass', 'freight', 'mail_run'] },
  { settlementId: 'coldiron', name: 'Coldiron Cattle Co. Office', buildings: ['ranchhouse', 'cookhouse'], slots: 3,
    templates: ['cattle_drive', 'mend_fences', 'feed_stock', 'hunt_coyote'] },
  { settlementId: 'starling', name: 'Starling Ranch Yard', buildings: ['ranchhouse', 'stable'], slots: 2,
    templates: ['feed_stock', 'mend_fences', 'cattle_drive'] },
  { settlementId: 'arrieta', name: 'Arrieta Sheep Camp', buildings: ['house', 'barn'], slots: 2,
    templates: ['mend_fences', 'feed_stock', 'hunt_wolf', 'hunt_coyote'] },
  { settlementId: 'ashgrove', name: 'Ashgrove Orchard Gate', buildings: ['store', 'house', 'barn'], slots: 2,
    templates: ['harvest_wheat', 'mend_fences', 'feed_stock'] },
];

/** "Ask for work" on a townsperson: which board templates that trade can hand out. */
export const OCCUPATION_WORK: Record<string, string[]> = {
  rancher: ['cattle_drive', 'mend_fences', 'feed_stock', 'break_colt'],
  cowhand: ['cattle_drive', 'mend_fences', 'feed_stock', 'break_colt'],
  stablehand: ['feed_stock', 'break_colt'],
  breeder: ['break_colt', 'feed_stock'],
  farmer: ['harvest_wheat', 'feed_stock', 'mend_fences'],
  bartender: ['bartend'],
  blacksmith: ['smith_helper'],
  sheriff: ['bounty_petty', 'bounty_gang'],
  deputy: ['bounty_petty', 'bounty_gang'],
  miner: ['ore_contract'],
  logger: ['lumber_contract'],
  cook: ['fish_trout', 'fish_bass'],
  hunter: ['hunt_deer', 'hunt_coyote', 'hunt_wolf'],
  trapper: ['hunt_deer', 'hunt_coyote', 'hunt_wolf'],
  telegrapher: ['mail_run', 'freight'],
  railroad: ['freight', 'strongbox', 'mail_run'],
  hotelier: ['freight', 'fish_bass'],
  merchant: ['freight', 'strongbox'],
};

/**
 * Self-directed labour at world objects (no job needed unless `needsJob`): the
 * strike mini-game, then `round(performance × yieldPerPerf)` units (at least 1).
 * `perTilePerDay` caps how often one seam, tree or row gives per game day.
 */
export interface WorkActionDef {
  label: string;
  /** World object names from world/tiles.ts `O`. */
  objs: string[];
  tool?: string;
  item: string;
  strikes: number;
  yieldPerPerf: number;
  perTilePerDay: number;
  /** BALANCE.jobs.taskMinutes key: game time each attempt takes. */
  task: string;
  /** Only while this job is active (somebody else's field). */
  needsJob?: string;
  skill: JobSkill;
  xp: number;
}

export const WORK_ACTIONS: Record<string, WorkActionDef> = {
  dig: { label: 'Dig ore', objs: ['MineEntrance'], tool: 'pickaxe', item: 'oreRaw', strikes: 4, yieldPerPerf: 2.5, perTilePerDay: 8, task: 'dig', skill: 'survival', xp: 2 },
  chop: { label: 'Fell timber', objs: ['Pine', 'Oak', 'Cottonwood', 'Aspen', 'SnowPine'], tool: 'axe', item: 'lumber', strikes: 3, yieldPerPerf: 2, perTilePerDay: 1, task: 'chop', skill: 'survival', xp: 2 },
  harvest: { label: 'Cut & bind wheat', objs: ['Cornstalk'], item: 'wheatSheaf', strikes: 2, yieldPerPerf: 2, perTilePerDay: 1, task: 'harvest', needsJob: 'harvest_wheat', skill: 'survival', xp: 1 },
};

/** Where reported outlaws hole up (tile coords; the nearest open tile is used). */
export const BOUNTY_CAMPS: { id: string; name: string; x: number; y: number }[] = [
  { id: 'eagle', name: 'below Eagle Rock', x: 330, y: 250 },
  { id: 'hanging', name: 'near the Hanging Oak', x: 250, y: 300 },
  { id: 'spring', name: 'at Hackberry Spring', x: 200, y: 600 },
  { id: 'cliffs', name: 'under the Old Cliff Houses', x: 380, y: 650 },
  { id: 'fortroad', name: 'off the fort road', x: 400, y: 500 },
  { id: 'bruin', name: 'near Bruin Den', x: 620, y: 260 },
  { id: 'highpass', name: 'on the high pass road', x: 300, y: 170 },
];

/** Saloon shift: what customers ask for and the right pour. */
export const BAR_ORDERS: { ask: string; answer: string }[] = [
  { ask: 'A trail boss, dust to the eyebrows: "Something that burns going down."', answer: 'Whiskey' },
  { ask: 'A railroad clerk with ink on his cuffs: "Something hot. I\'m on shift at six."', answer: 'Coffee' },
  { ask: 'A farm boy, hat in hand: "Something cold, sir — Ma says no liquor."', answer: 'Sarsaparilla' },
  { ask: 'A gambler shuffling one-handed: "Beer. Keep it coming slow."', answer: 'Beer' },
  { ask: 'A widow in black: "Coffee, please. Black as this dress."', answer: 'Coffee' },
  { ask: 'Two drovers just paid off: "Whiskey, and leave the bottle."', answer: 'Whiskey' },
  { ask: 'A preacher, apologetic: "Just a sarsaparilla, son."', answer: 'Sarsaparilla' },
  { ask: 'A sawmill hand, wiping his neck: "Beer, and make it a big one."', answer: 'Beer' },
];
export const BAR_POURS = ['Whiskey', 'Beer', 'Coffee', 'Sarsaparilla'];

// =============================================================================================
// TRADE AND PROPERTY
// - TRADE_GOODS: where each good is produced (cheap) and where it is scarce (dear).
// - TRADE_POSTS: extra stock and buy categories layered onto data/shops.ts at runtime
//   (Economy.applyTradePosts), so trade goods have buyers in every region.
// - PLOTS / UPGRADES: homesteads the player buys and improves (the long-term money sink).
// Formulas: design/gdd/economy-jobs.md § Formulas.
// =============================================================================================

/** Region ids from data/world.ts REGIONS. */
export type TradeRegion = 'dustfall' | 'blackwater' | 'pinehollow' | 'sierra' | 'drylands' | 'redstone';

export interface TradeGoodDef {
  /** Regions where the good is made: shops buy and sell it at BALANCE.trade.producedMul. */
  produced: TradeRegion[];
  /** Regions that lack it: shops buy and sell it at BALANCE.trade.scarceMul. */
  scarce: TradeRegion[];
}

export const TRADE_GOODS: Record<string, TradeGoodDef> = {
  oreRaw: { produced: ['drylands', 'sierra'], scarce: ['blackwater'] },
  lumber: { produced: ['pinehollow'], scarce: ['drylands', 'redstone'] },
  wheatSheaf: { produced: ['dustfall'], scarce: ['pinehollow', 'sierra'] },
  furBundle: { produced: ['sierra'], scarce: ['blackwater'] },
  whiskeyCrate: { produced: ['blackwater'], scarce: ['drylands', 'redstone', 'sierra'] },
  coffeeSack: { produced: ['blackwater'], scarce: ['sierra', 'pinehollow', 'drylands'] },
  toolCrate: { produced: ['blackwater'], scarce: ['drylands', 'pinehollow'] },
  cattleBill: { produced: ['dustfall', 'sierra'], scarce: ['redstone', 'drylands', 'blackwater'] },
};

export interface TradePostDef {
  /** Extra stock (item id → quantity per restock) merged over the shop's own stock. */
  stock?: Record<string, number>;
  /** Extra item categories the shop buys. */
  buys?: string[];
}

/** Keyed by shop id from data/shops.ts. Restock follows the shop's own restockDays. */
export const TRADE_POSTS: Record<string, TradePostDef> = {
  store_larkspur: { stock: { cattleBill: 3, axe: 2 } },
  store_ashby: { stock: { whiskeyCrate: 3, coffeeSack: 3, toolCrate: 2, axe: 1 } },
  store_whitepeak: { stock: { furBundle: 2, cattleBill: 2 } },
  store_cedar: { stock: { axe: 3 }, buys: ['material'] },
  store_sulfur: { buys: ['material'] },
  store_fort: { buys: ['material'] },
  // Open-world expansion shops.
  ranch_coldiron: { stock: { cattleBill: 4 } },
  store_lodestar: { stock: { axe: 1 }, buys: ['material'] },
  store_golondrinas: { buys: ['material'] },
  store_harrow: { stock: { toolCrate: 1, coffeeSack: 2 } },
};

// --- Homesteads ------------------------------------------------------------------------------

export interface PlotDef {
  id: string;
  name: string;
  regionId: TradeRegion;
  /** Tile position of the plot's corner stake; the nearest open tile is used. */
  x: number;
  y: number;
  price: number;
  /** Territorial tax charged every game day while owned. */
  taxPerDay: number;
  /** Settlement whose notice board sells the deed. */
  soldAt: string;
  description: string;
}

export const PLOTS: PlotDef[] = [
  { id: 'plot_calder', name: 'Calder Bend Quarter-Section', regionId: 'dustfall', x: 336, y: 414, price: 60, taxPerDay: 0.1, soldAt: 'larkspur', description: 'Flat bottomland on the stage road, half a mile from Larkspur. Good grass, no water yet.' },
  { id: 'plot_pinecreek', name: 'Pine Creek Clearing', regionId: 'pinehollow', x: 618, y: 262, price: 45, taxPerDay: 0.08, soldAt: 'portashby', description: 'A logged-off clearing on the timber road. Cold winters, sweet water.' },
  { id: 'plot_meridian', name: 'Junction Flats Homestead', regionId: 'dustfall', x: 462, y: 366, price: 80, taxPerDay: 0.15, soldAt: 'portashby', description: 'Rail-side land by Meridian Junction. Dear, but everything you raise is one wagon from the train.' },
];

export interface UpgradeYield {
  item: string;
  /** Units accrued per game day (fractions accumulate). */
  perDay: number;
  /** Most units that pile up uncollected. */
  cap: number;
}

export interface UpgradeDef {
  id: string;
  name: string;
  price: number;
  requires?: string[];
  description: string;
  /** Produce that accrues daily and is collected at the plot. */
  yields?: UpgradeYield[];
  /** Services the upgrade unlocks at the plot. */
  perks?: ('bed' | 'water' | 'stable')[];
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'well', name: 'Dug Well & Trough', price: 12, description: 'Water for you, your horse and a garden.', perks: ['water'] },
  { id: 'cabin', name: 'One-Room Cabin', price: 35, description: 'Four walls, a stove and a bed. Sleep and save here.', perks: ['bed'] },
  { id: 'garden', name: 'Kitchen Garden', price: 10, requires: ['well'], description: 'Carrots and apples for the horses, a little for you.', yields: [{ item: 'carrot', perDay: 3, cap: 12 }, { item: 'apple', perDay: 2, cap: 8 }] },
  { id: 'coop', name: 'Chicken Coop', price: 8, requires: ['cabin'], description: 'A dozen hens. Eggs every morning.', yields: [{ item: 'eggs', perDay: 2, cap: 10 }] },
  { id: 'stable', name: 'Lean-To Stable', price: 30, requires: ['well'], description: 'Shelter and feed: rest your horses here for free once a day.', perks: ['stable'] },
  { id: 'pasture', name: 'Fenced Pasture & Steers', price: 70, requires: ['stable'], description: 'Run a few head of your own. A steer is ready for sale every few days.', yields: [{ item: 'cattleBill', perDay: 0.25, cap: 3 }, { item: 'hay', perDay: 2, cap: 10 }] },
];

/** Notice boards that also act as the territorial land office. */
export const LAND_OFFICES = ['larkspur', 'portashby'];
