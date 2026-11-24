/**
 * Shop definitions: stock, buy categories, services and horse-trader settings.
 * Prices = item base price × shop priceMul × regional market × reputation.
 */
export type Service = 'stable' | 'vet' | 'shoe' | 'groom' | 'rent' | 'room' | 'bath' | 'train' | 'customize' | 'repair' | 'drink' | 'meal' | 'blackjack' | 'poker' | 'sellHorse' | 'stage';

export interface ShopDef {
  id: string;
  /** Opening hours [open, close) in game hours; close may exceed 24 for places open past midnight. Defaults by kind (see shopHours). */
  hours?: [number, number];
  name: string;
  region: string;
  priceMul: number;
  stock: Record<string, number>;
  /** Item categories this shop buys from the player. */
  buys: string[];
  buyMul: number;
  services: Service[];
  /** Horse trader: number of horses for sale and training level. */
  horses?: { count: number; training: 'green' | 'broke' | 'trained'; breeds?: string[] };
  restockDays: number;
}

const GEN_STOCK = { beans: 10, jerky: 10, bread: 6, coffee: 8, canteenWater: 6, whiskey: 4, bandage: 6, tonicHealth: 4, ammoPistol: 120, ammoRifle: 80, ammoShell: 40, arrow: 30, hay: 12, oats: 10, carrot: 15, apple: 15, sugarCube: 10, horseOintment: 4, horseLiniment: 4, brush: 2, hoofPick: 2, campKit: 2, bedroll: 2, fishingRod: 2, lasso: 2, lockpick: 3, knifeHunting: 2, waterBucket: 2 };
const SADDLERY = { saddleRanch: 1, saddleMcClure: 1, saddleRacing: 1, bridleSnaffle: 2, bridleSilver: 1, blanketWool: 2, blanketHeavy: 1, bagsSmall: 2, bagsLarge: 1, shoesSteel: 3, shoesCaulked: 2, decorConcho: 1, decorRibbon: 2, hay: 15, oats: 15, carrot: 20, apple: 20, sugarCube: 15, horseReviver: 3, horseLiniment: 5, horseOintment: 5, brush: 2, hoofPick: 2 };

export const SHOPS: ShopDef[] = [
  { id: 'store_larkspur', name: 'Pettibone Mercantile', region: 'dustfall', priceMul: 1, stock: { ...GEN_STOCK, rifleVarmint: 2 }, buys: ['pelt', 'meat', 'fish', 'valuable', 'material'], buyMul: 0.85, services: [], restockDays: 2 },
  { id: 'saloon_larkspur', name: 'The Gilded Spur', region: 'dustfall', priceMul: 1, stock: { whiskey: 20, beans: 5, stewCooked: 6, coffee: 10, bread: 5 }, buys: [], buyMul: 0, services: ['drink', 'meal', 'blackjack'], restockDays: 1 },
  { id: 'doctor_larkspur', name: 'Dr. Okafor, Physician', region: 'dustfall', priceMul: 1.05, stock: { tonicHealth: 10, bandage: 15, horseReviver: 2, horseOintment: 4 }, buys: [], buyMul: 0, services: [], restockDays: 2 },
  { id: 'smith_larkspur', name: 'Gatlin Smithy', region: 'dustfall', priceMul: 1, stock: { shoesSteel: 6, shoesCaulked: 3, knifeHunting: 3, bowHunting: 1, pickaxe: 3, lockpick: 4 }, buys: ['valuable'], buyMul: 0.6, services: ['shoe', 'repair'], restockDays: 3 },
  { id: 'stable_larkspur', name: 'Larkspur Livery & Horse Trader', region: 'dustfall', priceMul: 1, stock: SADDLERY, buys: [], buyMul: 0, services: ['stable', 'vet', 'groom', 'rent', 'train', 'customize', 'sellHorse', 'shoe'], horses: { count: 5, training: 'broke' }, restockDays: 3 },
  { id: 'hotel_larkspur', name: 'Calder House Hotel', region: 'dustfall', priceMul: 1, stock: {}, buys: [], buyMul: 0, services: ['stage', 'room', 'bath', 'meal'], restockDays: 1 },
  { id: 'hotel_ashby', name: 'The Grand Meridian Hotel', region: 'blackwater', priceMul: 1.4, stock: {}, buys: [], buyMul: 0, services: ['stage', 'room', 'bath', 'meal'], restockDays: 1 },
  { id: 'saloon_ashby', name: 'The Lakeview Saloon', region: 'blackwater', priceMul: 1.2, stock: { whiskey: 30, stewCooked: 8, coffee: 10, bread: 8 }, buys: [], buyMul: 0, services: ['drink', 'meal', 'blackjack', 'poker'], restockDays: 1 },
  { id: 'gun_ashby', name: 'Ingram Arms', region: 'blackwater', priceMul: 1.1, stock: { revolverCattleman: 2, revolverDoubleAction: 2, repeaterLancaster: 2, rifleRolling: 1, shotgunDouble: 2, bowHunting: 1, ammoPistol: 300, ammoRifle: 200, ammoShell: 100, arrow: 60, knifeHunting: 3 }, buys: ['weapon'], buyMul: 0.5, services: ['repair'], restockDays: 3 },
  { id: 'tailor_ashby', name: 'Delacroix Clothier', region: 'blackwater', priceMul: 1.2, stock: {}, buys: [], buyMul: 0, services: ['customize'], restockDays: 7 },
  { id: 'store_ashby', name: 'Ashby General Supply', region: 'blackwater', priceMul: 1.15, stock: { ...GEN_STOCK, revolverCattleman: 1, repeaterLancaster: 1 }, buys: ['pelt', 'meat', 'fish', 'valuable', 'material'], buyMul: 0.9, services: [], restockDays: 2 },
  { id: 'doctor_ashby', name: 'Ashby Infirmary', region: 'blackwater', priceMul: 1.2, stock: { tonicHealth: 15, bandage: 20, horseReviver: 4, horseOintment: 6, horseLiniment: 6 }, buys: [], buyMul: 0, services: [], restockDays: 2 },
  { id: 'stable_ashby', name: 'Ashby Stables & Horse Exchange', region: 'blackwater', priceMul: 1.2, stock: SADDLERY, buys: [], buyMul: 0, services: ['stable', 'vet', 'groom', 'rent', 'train', 'customize', 'sellHorse', 'shoe'], horses: { count: 7, training: 'trained' }, restockDays: 3 },
  { id: 'ranch_brannigan', name: 'Brannigan Barn', region: 'dustfall', priceMul: 0, stock: {}, buys: [], buyMul: 0, services: ['stable', 'groom', 'train', 'customize'], restockDays: 7 },
  { id: 'assay_sulfur', name: 'Assay Office', region: 'drylands', priceMul: 1, stock: { pickaxe: 3 }, buys: ['valuable'], buyMul: 1.05, services: [], restockDays: 3 },
  { id: 'saloon_sulfur', name: 'The Dry Well', region: 'drylands', priceMul: 1.3, stock: { whiskey: 15, beans: 10, canteenWater: 10 }, buys: [], buyMul: 0, services: ['drink', 'meal', 'blackjack'], restockDays: 1 },
  { id: 'store_sulfur', name: 'Company Store', region: 'drylands', priceMul: 1.35, stock: { ...GEN_STOCK, pickaxe: 4 }, buys: ['pelt', 'meat', 'valuable'], buyMul: 0.7, services: ['stage'], restockDays: 2 },
  { id: 'stable_sulfur', name: 'Sulfur Flats Livery', region: 'drylands', priceMul: 0.95, stock: { hay: 10, oats: 6, carrot: 10, shoesSteel: 4, horseOintment: 3 }, buys: [], buyMul: 0, services: ['stable', 'vet', 'rent', 'sellHorse', 'shoe'], horses: { count: 4, training: 'green', breeds: ['mustang', 'criollo', 'paint', 'quarter'] }, restockDays: 3 },
  { id: 'store_cedar', name: 'Cedar Notch Cookhouse', region: 'pinehollow', priceMul: 1.1, stock: { beans: 10, bread: 8, coffee: 10, stewCooked: 6, jerky: 10, bandage: 4 }, buys: ['pelt', 'meat', 'fish'], buyMul: 0.8, services: ['meal'], restockDays: 2 },
  { id: 'store_whitepeak', name: 'Whitepeak Trading Post', region: 'sierra', priceMul: 1.25, stock: { ...GEN_STOCK, blanketHeavy: 2, shoesCaulked: 3, coffee: 15 }, buys: ['pelt', 'meat', 'fish', 'valuable', 'material'], buyMul: 1.0, services: ['stage'], restockDays: 3 },
  { id: 'stable_whitepeak', name: 'Whitepeak Barn', region: 'sierra', priceMul: 1.1, stock: { hay: 10, oats: 10, blanketHeavy: 2, shoesCaulked: 3 }, buys: [], buyMul: 0, services: ['stable', 'vet', 'sellHorse', 'shoe'], horses: { count: 3, training: 'broke', breeds: ['shire', 'foxtrotter', 'morgan', 'mustang'] }, restockDays: 4 },
  { id: 'store_fort', name: 'Sutler\'s Store', region: 'redstone', priceMul: 1.2, stock: { beans: 10, jerky: 10, coffee: 10, ammoPistol: 150, ammoRifle: 150, bandage: 8, tonicHealth: 4, canteenWater: 10, hay: 10, oats: 10 }, buys: ['pelt'], buyMul: 0.75, services: ['stage'], restockDays: 2 },
  { id: 'station_meridian', name: 'Meridian Junction Depot', region: 'dustfall', priceMul: 1.1, stock: { coffee: 6, bread: 4, canteenWater: 6 }, buys: [], buyMul: 0, services: ['stage'], restockDays: 2 },
  { id: 'stable_sayen', name: 'Sayen Council House', region: 'pinehollow', priceMul: 1.0, stock: { oats: 10, hay: 10, blanketWool: 3, bridleSilver: 1, apple: 15 }, buys: ['pelt'], buyMul: 0.9, services: ['stable', 'train', 'sellHorse'], horses: { count: 4, training: 'trained', breeds: ['appaloosa', 'appaloosa', 'foxtrotter', 'paint'] }, restockDays: 5 },

  // --- Expansion: Harrow Junction (rail town) ---------------------------------
  { id: 'store_harrow', name: 'Mercer & Daughters Dry Goods', region: 'blackwater', priceMul: 1.05, stock: { ...GEN_STOCK, rifleVarmint: 1, revolverCattleman: 1 }, buys: ['pelt', 'meat', 'fish', 'valuable', 'material'], buyMul: 0.85, services: [], restockDays: 2 },
  { id: 'saloon_harrow', name: 'The Iron Horse Saloon', region: 'blackwater', priceMul: 1.1, stock: { whiskey: 25, stewCooked: 6, beans: 6, coffee: 12, bread: 6 }, buys: [], buyMul: 0, services: ['drink', 'meal', 'blackjack', 'poker'], restockDays: 1 },
  { id: 'hotel_harrow', name: 'Junction House Hotel', region: 'blackwater', priceMul: 1.1, stock: {}, buys: [], buyMul: 0, services: ['room', 'bath', 'meal'], restockDays: 1 },
  { id: 'stable_harrow', name: 'Harrow Livery', region: 'blackwater', priceMul: 1.05, stock: { hay: 12, oats: 12, carrot: 12, apple: 12, shoesSteel: 4, horseOintment: 3, horseLiniment: 3, brush: 1, hoofPick: 1, bridleSnaffle: 1, blanketWool: 1 }, buys: [], buyMul: 0, services: ['stable', 'vet', 'groom', 'rent', 'sellHorse', 'shoe'], horses: { count: 4, training: 'broke', breeds: ['quarter', 'morgan', 'walker', 'belgian'] }, restockDays: 3 },
  { id: 'station_harrow', name: 'Harrow Junction Depot', region: 'blackwater', priceMul: 1.1, stock: { coffee: 8, bread: 6, canteenWater: 8, jerky: 6 }, buys: [], buyMul: 0, services: ['stage'], restockDays: 2 },
  // --- Las Golondrinas (border pueblo) ----------------------------------------
  { id: 'store_golondrinas', name: 'Tienda Arvizu', region: 'drylands', priceMul: 0.95, stock: { beans: 12, bread: 8, coffee: 8, jerky: 8, canteenWater: 12, whiskey: 4, bandage: 4, tonicHealth: 2, ammoPistol: 80, ammoRifle: 60, ammoShell: 30, hay: 8, oats: 6, carrot: 10, apple: 6, blanketWool: 3, lasso: 2, knifeHunting: 1, bedroll: 1 }, buys: ['pelt', 'meat', 'valuable', 'material'], buyMul: 0.85, services: ['stage'], restockDays: 2 },
  { id: 'saloon_golondrinas', name: 'Cantina El Farol', region: 'drylands', priceMul: 0.9, stock: { whiskey: 15, beans: 10, stewCooked: 8, coffee: 10, bread: 6, canteenWater: 8 }, buys: [], buyMul: 0, services: ['drink', 'meal', 'blackjack', 'room'], restockDays: 1 },
  { id: 'smith_golondrinas', name: 'Herrería Quintero', region: 'drylands', priceMul: 0.95, stock: { shoesSteel: 5, shoesCaulked: 2, knifeHunting: 2, decorConcho: 2, bridleSilver: 1, lockpick: 2 }, buys: ['valuable'], buyMul: 0.6, services: ['shoe', 'repair'], restockDays: 3 },
  { id: 'stable_golondrinas', name: 'Corrales Navarro', region: 'drylands', priceMul: 0.95, stock: { hay: 10, oats: 8, carrot: 10, saddleRanch: 1, blanketWool: 2, decorConcho: 1, horseOintment: 3 }, buys: [], buyMul: 0, services: ['stable', 'vet', 'groom', 'train', 'sellHorse', 'shoe'], horses: { count: 4, training: 'broke', breeds: ['criollo', 'criollo', 'andalusian', 'mustang'] }, restockDays: 4 },
  // --- Lodestar Camp (Sierra mining camp) -------------------------------------
  { id: 'store_lodestar', name: 'Lodestar Outfitters', region: 'sierra', priceMul: 1.4, stock: { ...GEN_STOCK, pickaxe: 5, blanketHeavy: 2, shoesCaulked: 4, coffee: 15 }, buys: ['pelt', 'meat', 'valuable', 'material'], buyMul: 0.8, services: [], restockDays: 3 },
  { id: 'assay_lodestar', name: 'Lodestar Assay & Claims', region: 'sierra', priceMul: 1, stock: { pickaxe: 2 }, buys: ['valuable'], buyMul: 1.1, services: [], restockDays: 3 },
  { id: 'saloon_lodestar', name: 'The Tin Cup', region: 'sierra', priceMul: 1.35, stock: { whiskey: 20, beans: 8, stewCooked: 6, coffee: 12 }, buys: [], buyMul: 0, services: ['drink', 'meal', 'poker'], restockDays: 1 },
  // --- Toller's Landing (river trading post) ----------------------------------
  { id: 'store_landing', name: 'Toller\'s Landing Trading Post', region: 'blackwater', priceMul: 1.1, stock: { ...GEN_STOCK, fishingRod: 4, rifleVarmint: 1 }, buys: ['pelt', 'meat', 'fish', 'valuable', 'material'], buyMul: 0.95, services: [], restockDays: 2 },
  { id: 'fur_landing', name: 'Lachance Fur & Freight', region: 'blackwater', priceMul: 1.1, stock: { knifeHunting: 3, bowHunting: 1, arrow: 40, campKit: 1, bedroll: 1 }, buys: ['pelt', 'material'], buyMul: 1.1, services: [], restockDays: 3 },
  { id: 'saloon_landing', name: 'The Mudcat', region: 'blackwater', priceMul: 0.95, stock: { whiskey: 15, fishCooked: 8, coffee: 8, bread: 4 }, buys: ['fish'], buyMul: 0.9, services: ['drink', 'meal', 'blackjack'], restockDays: 1 },
  // --- Working ranches ----------------------------------------------------------
  { id: 'ranch_coldiron', name: 'Coldiron Barn', region: 'dustfall', priceMul: 1, stock: { jerky: 15, meatCooked: 6, beans: 8, coffee: 8, hay: 20, oats: 10, lasso: 3, saddleRanch: 1, blanketWool: 1 }, buys: ['meat', 'pelt'], buyMul: 0.9, services: ['stable', 'groom'], restockDays: 3 },
  { id: 'stable_starling', name: 'Starling Horse Ranch', region: 'blackwater', priceMul: 1.25, stock: { hay: 15, oats: 15, carrot: 15, apple: 15, sugarCube: 10, bridleSnaffle: 2, saddleRacing: 1, blanketWool: 2, horseLiniment: 4, horseOintment: 4, brush: 2 }, buys: [], buyMul: 0, services: ['stable', 'vet', 'groom', 'train', 'sellHorse'], horses: { count: 5, training: 'trained', breeds: ['thoroughbred', 'arabian', 'morgan', 'quarter', 'walker'] }, restockDays: 5 },
  { id: 'farm_arrieta', name: 'Arrieta Shearing Shed', region: 'sierra', priceMul: 0.9, stock: { blanketWool: 4, blanketHeavy: 2, jerky: 10, bread: 6, coffee: 6, hay: 10 }, buys: ['pelt', 'meat'], buyMul: 0.85, services: [], restockDays: 4 },
  { id: 'farm_ashgrove', name: 'Ashgrove Cider House', region: 'blackwater', priceMul: 0.8, stock: { apple: 40, carrot: 30, bread: 8, oats: 15, hay: 15, sugarCube: 10 }, buys: [], buyMul: 0, services: [], restockDays: 2 },
];

const BY_ID = new Map(SHOPS.map((s) => [s.id, s]));
export function getShop(id: string): ShopDef | undefined {
  return BY_ID.get(id);
}

/** Service prices in dollars. */
/** Opening hours for a shop: explicit `hours`, else a sensible default by kind of business. */
export function shopHours(def: ShopDef): [number, number] {
  if (def.hours) return def.hours;
  if (def.id.startsWith('hotel')) return [0, 24];
  if (def.id.startsWith('saloon') || def.id.startsWith('cantina')) return [10, 26];
  if (def.id.startsWith('doctor')) return [7, 22];
  if (def.id.startsWith('bank') || def.id.startsWith('telegraph') || def.id.startsWith('assay') || def.id.startsWith('land')) return [8, 18];
  if (def.id.startsWith('stable') || def.id.startsWith('livery')) return [6, 21];
  return [7, 20];
}

/** Is the shop open at `hour` (0–24, fractional)? */
export function shopOpenAt(def: ShopDef, hour: number): boolean {
  const [o, c] = shopHours(def);
  if (c >= 24) return hour >= o || hour < c - 24;
  return hour >= o && hour < c;
}

export const SERVICE_PRICES: Record<Service, number> = {
  stable: 0.5, vet: 2.5, shoe: 1.5, groom: 0.25, rent: 3, room: 1, bath: 0.5, train: 2, customize: 3, repair: 1, drink: 0.25, meal: 0.75, blackjack: 0, poker: 0, sellHorse: 0, stage: 2,
};
