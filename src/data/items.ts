/**
 * Item catalogue. All gameplay numbers for consumables, horse equipment, weapons
 * and trade goods live here so balance changes never touch system code.
 */

export type ItemCategory =
  | 'weapon'
  | 'ammo'
  | 'food'
  | 'drink'
  | 'medicine'
  | 'horseFood'
  | 'horseMedicine'
  | 'horseCare'
  | 'horseGear'
  | 'tool'
  | 'pelt'
  | 'meat'
  | 'fish'
  | 'valuable'
  | 'document'
  | 'quest'
  | 'material'
  | 'clothing';

export type HorseSlot = 'saddle' | 'bridle' | 'blanket' | 'bags' | 'shoes' | 'decoration' | 'bedroll';

export interface ItemEffects {
  hunger?: number; // player hunger restored (0..100 scale)
  thirst?: number;
  health?: number;
  stamina?: number;
  warmth?: number; // minutes of warmth buff
  horseHunger?: number;
  horseThirst?: number;
  horseHealth?: number;
  horseStamina?: number;
  horseStress?: number; // negative = calming
  horseHeal?: number; // injury healing points
  horseBondFeed?: number; // bond multiplier when fed (favourite foods)
  energy?: number; // player sleep/energy
}

export interface HorseGearStats {
  slot: HorseSlot;
  staminaDrain?: number; // multiplier
  staminaRegen?: number;
  speed?: number;
  carry?: number; // extra inventory weight capacity
  comfort?: number; // rider fatigue reduction & bond gain while riding
  terrain?: number; // rough-terrain multiplier (shoes)
  handling?: number;
  warmth?: number; // blanket cold protection
  /** Condition lost per km ridden (0..100 scale). */
  wear?: number;
  /** Tint colour for the sprite. */
  color?: string;
  tier?: number;
}

export interface WeaponStats {
  kind: 'revolver' | 'rifle' | 'shotgun' | 'repeater' | 'bow' | 'knife' | 'lasso' | 'fists';
  damage: number;
  range: number; // px
  fireDelay: number; // seconds between shots
  reloadTime: number;
  clip: number;
  ammo?: string; // ammo item id
  spread: number; // radians at rest
  recoil: number; // added spread per shot
  pellets?: number;
  noise: number; // radius px
  melee?: boolean;
}

export interface ItemDef {
  id: string;
  name: string;
  category: ItemCategory;
  weight: number;
  price: number;
  stack: number; // max stack size, 1 = unique
  description: string;
  effects?: ItemEffects;
  gear?: HorseGearStats;
  weapon?: WeaponStats;
  /** Icon key for the item icon painter. */
  icon: string;
  /** Raw meat spoils; cooked meat lasts. Value is in game-days. */
  spoilDays?: number;
  cookTo?: string;
  sellOnly?: boolean;
}

const I = (d: ItemDef): ItemDef => d;

export const ITEMS: ItemDef[] = [
  // --- Weapons ---------------------------------------------------------
  I({ id: 'revolverCattleman', name: 'Calder Cattleman Revolver', category: 'weapon', weight: 1.2, price: 50, stack: 1, icon: 'revolver', description: 'A dependable single-action six-shooter. Every ranch hand in the territory carries one.', weapon: { kind: 'revolver', damage: 34, range: 200, fireDelay: 0.38, reloadTime: 1.8, clip: 6, ammo: 'ammoPistol', spread: 0.05, recoil: 0.06, noise: 520 } }),
  I({ id: 'revolverDoubleAction', name: 'Harlow Double-Action', category: 'weapon', weight: 1.1, price: 128, stack: 1, icon: 'revolver', description: 'A modern double-action revolver favoured by lawmen. Fires as fast as you can squeeze.', weapon: { kind: 'revolver', damage: 30, range: 190, fireDelay: 0.22, reloadTime: 1.6, clip: 6, ammo: 'ammoPistol', spread: 0.07, recoil: 0.07, noise: 520 } }),
  I({ id: 'repeaterLancaster', name: 'Lancaster Lever Repeater', category: 'weapon', weight: 3.4, price: 95, stack: 1, icon: 'rifle', description: 'Lever-action carbine. Accurate enough at range, quick enough up close.', weapon: { kind: 'repeater', damage: 42, range: 300, fireDelay: 0.55, reloadTime: 2.6, clip: 12, ammo: 'ammoRifle', spread: 0.03, recoil: 0.05, noise: 650 } }),
  I({ id: 'rifleRolling', name: 'Rolling-Block Rifle', category: 'weapon', weight: 4.1, price: 210, stack: 1, icon: 'rifle', description: 'A single-shot buffalo rifle. Slow to load, deadly at distance. Clean kills for hunters.', weapon: { kind: 'rifle', damage: 95, range: 460, fireDelay: 1.4, reloadTime: 1.4, clip: 1, ammo: 'ammoRifle', spread: 0.012, recoil: 0.12, noise: 800 } }),
  I({ id: 'shotgunDouble', name: 'Double-Barrel Shotgun', category: 'weapon', weight: 3.6, price: 85, stack: 1, icon: 'shotgun', description: 'Two barrels, a lot of pellets. Ruins pelts but stops anything at close range.', weapon: { kind: 'shotgun', damage: 14, range: 120, fireDelay: 0.35, reloadTime: 2.2, clip: 2, ammo: 'ammoShell', spread: 0.22, recoil: 0.1, pellets: 7, noise: 700 } }),
  I({ id: 'rifleVarmint', name: 'Pettibone Varmint Rifle', category: 'weapon', weight: 2.6, price: 15, stack: 1, icon: 'rifle', description: 'A worn single-shot rifle the mercantile sells to farm boys. Takes small game cleanly at a distance; useless in a gunfight.', weapon: { kind: 'rifle', damage: 32, range: 340, fireDelay: 1.1, reloadTime: 1.2, clip: 1, ammo: 'ammoRifle', spread: 0.015, recoil: 0.06, noise: 420 } }),
  I({ id: 'bowHunting', name: 'Hunting Bow', category: 'weapon', weight: 1.0, price: 40, stack: 1, icon: 'bow', description: 'Quiet. Spooks nothing but the animal it hits. Arrows can be recovered and crafted.', weapon: { kind: 'bow', damage: 55, range: 240, fireDelay: 0.9, reloadTime: 0.6, clip: 1, ammo: 'arrow', spread: 0.02, recoil: 0, noise: 30 } }),
  I({ id: 'knifeHunting', name: 'Skinning Knife', category: 'weapon', weight: 0.4, price: 12, stack: 1, icon: 'knife', description: 'For skinning game. And for when things get close.', weapon: { kind: 'knife', damage: 40, range: 22, fireDelay: 0.45, reloadTime: 0, clip: 0, spread: 0, recoil: 0, noise: 40, melee: true } }),
  I({ id: 'lasso', name: 'Lariat', category: 'tool', weight: 0.8, price: 8, stack: 1, icon: 'lasso', description: 'Braided rawhide rope. Catch a wild horse, hogtie a bounty, or drag a stubborn calf.', weapon: { kind: 'lasso', damage: 0, range: 110, fireDelay: 1.0, reloadTime: 0, clip: 0, spread: 0.02, recoil: 0, noise: 20 } }),

  // --- Ammo ------------------------------------------------------------
  I({ id: 'ammoPistol', name: 'Pistol Cartridges', category: 'ammo', weight: 0.01, price: 0.08, stack: 200, icon: 'ammo', description: '.44 centerfire cartridges.' }),
  I({ id: 'ammoRifle', name: 'Rifle Cartridges', category: 'ammo', weight: 0.02, price: 0.12, stack: 200, icon: 'ammo', description: 'Long rifle cartridges for repeaters and rifles.' }),
  I({ id: 'ammoShell', name: 'Shotgun Shells', category: 'ammo', weight: 0.03, price: 0.15, stack: 100, icon: 'shell', description: 'Paper buckshot shells.' }),
  I({ id: 'arrow', name: 'Arrows', category: 'ammo', weight: 0.03, price: 0.2, stack: 60, icon: 'arrow', description: 'Fletched hunting arrows.' }),

  // --- Player food & medicine ------------------------------------------
  I({ id: 'beans', name: 'Can of Beans', category: 'food', weight: 0.4, price: 0.25, stack: 20, icon: 'can', description: 'Never goes bad. Never tastes good either.', effects: { hunger: 30, health: 2 } }),
  I({ id: 'jerky', name: 'Beef Jerky', category: 'food', weight: 0.1, price: 0.3, stack: 30, icon: 'jerky', description: 'Salted, smoked, chewable for hours.', effects: { hunger: 18, stamina: 10 } }),
  I({ id: 'bread', name: 'Sourdough Loaf', category: 'food', weight: 0.3, price: 0.15, stack: 10, icon: 'bread', description: 'From the Brannigan bakery.', effects: { hunger: 25 }, spoilDays: 4 }),
  I({ id: 'coffee', name: 'Coffee', category: 'drink', weight: 0.2, price: 0.2, stack: 20, icon: 'coffee', description: 'Strong camp coffee. Wakes the dead.', effects: { thirst: 15, energy: 25, warmth: 60 } }),
  I({ id: 'canteenWater', name: 'Canteen Water', category: 'drink', weight: 0.5, price: 0.05, stack: 10, icon: 'canteen', description: 'Clean water. Refill at pumps, wells and fresh streams.', effects: { thirst: 40 } }),
  I({ id: 'whiskey', name: 'Whiskey', category: 'drink', weight: 0.5, price: 1.0, stack: 10, icon: 'bottle', description: 'Warms the belly, dulls the aim.', effects: { thirst: 5, health: 5, warmth: 120 } }),
  I({ id: 'tonicHealth', name: 'Doc Fennimore\'s Tonic', category: 'medicine', weight: 0.2, price: 1.5, stack: 10, icon: 'tonic', description: 'Patent medicine that does, remarkably, help.', effects: { health: 45 } }),
  I({ id: 'bandage', name: 'Bandage Roll', category: 'medicine', weight: 0.1, price: 0.6, stack: 15, icon: 'bandage', description: 'Clean linen. Stops bleeding — yours or your horse\'s.', effects: { health: 20, horseHeal: 25 } }),
  I({ id: 'stewCooked', name: 'Venison Stew', category: 'food', weight: 0.6, price: 1.2, stack: 10, icon: 'stew', description: 'Cooked over an open fire. Restores a lot.', effects: { hunger: 70, health: 25, stamina: 30, warmth: 90 } }),
  I({ id: 'meatCooked', name: 'Cooked Meat', category: 'food', weight: 0.3, price: 0.5, stack: 20, icon: 'meatCooked', description: 'Charred over coals.', effects: { hunger: 40, health: 10 } }),
  I({ id: 'fishCooked', name: 'Cooked Fish', category: 'food', weight: 0.2, price: 0.4, stack: 20, icon: 'fishCooked', description: 'Flaky and smoky.', effects: { hunger: 35, health: 8 } }),

  // --- Raw meat & fish ---------------------------------------------------
  I({ id: 'meatGame', name: 'Raw Game Meat', category: 'meat', weight: 0.8, price: 0.6, stack: 20, icon: 'meatRaw', description: 'Cook it at a campfire before it turns.', spoilDays: 3, cookTo: 'meatCooked' }),
  I({ id: 'meatPrime', name: 'Prime Venison', category: 'meat', weight: 0.9, price: 1.1, stack: 20, icon: 'meatRaw', description: 'Best cut. Makes a fine stew.', spoilDays: 3, cookTo: 'stewCooked' }),
  I({ id: 'fishTrout', name: 'Cutthroat Trout', category: 'fish', weight: 0.6, price: 0.9, stack: 20, icon: 'fish', description: 'Caught in cold mountain water.', spoilDays: 2, cookTo: 'fishCooked' }),
  I({ id: 'fishBass', name: 'Smallmouth Bass', category: 'fish', weight: 0.8, price: 0.8, stack: 20, icon: 'fish', description: 'River fish, good eating.', spoilDays: 2, cookTo: 'fishCooked' }),
  I({ id: 'fishCatfish', name: 'Channel Catfish', category: 'fish', weight: 1.4, price: 1.4, stack: 20, icon: 'fish', description: 'Whiskered bottom-feeder from the slow rivers.', spoilDays: 2, cookTo: 'fishCooked' }),

  // --- Pelts --------------------------------------------------------------
  I({ id: 'peltRabbit', name: 'Rabbit Pelt', category: 'pelt', weight: 0.2, price: 0.75, stack: 20, icon: 'pelt', description: 'Soft and small.', sellOnly: true }),
  I({ id: 'peltDeer', name: 'Deer Hide', category: 'pelt', weight: 2.0, price: 3.5, stack: 10, icon: 'pelt', description: 'Supple buckskin, much wanted by tanners.', sellOnly: true }),
  I({ id: 'peltWolf', name: 'Wolf Pelt', category: 'pelt', weight: 1.8, price: 5.5, stack: 10, icon: 'peltGrey', description: 'Thick winter fur.', sellOnly: true }),
  I({ id: 'peltCoyote', name: 'Coyote Pelt', category: 'pelt', weight: 1.2, price: 2.5, stack: 10, icon: 'pelt', description: 'Scrubby but sellable.', sellOnly: true }),
  I({ id: 'peltCougar', name: 'Cougar Pelt', category: 'pelt', weight: 2.4, price: 14, stack: 5, icon: 'peltGold', description: 'Lion of the canyons. Trappers pay well.', sellOnly: true }),
  I({ id: 'peltBear', name: 'Black Bear Hide', category: 'pelt', weight: 5.0, price: 18, stack: 3, icon: 'peltDark', description: 'Heavy, warm, valuable.', sellOnly: true }),
  I({ id: 'peltBison', name: 'Bison Robe', category: 'pelt', weight: 7.0, price: 22, stack: 3, icon: 'peltDark', description: 'From one of the last wild herds. Think on that.', sellOnly: true }),
  I({ id: 'antlers', name: 'Elk Antlers', category: 'material', weight: 1.5, price: 4, stack: 10, icon: 'antler', description: 'Carvers and gunsmiths buy these.', sellOnly: true }),
  I({ id: 'feathers', name: 'Feathers', category: 'material', weight: 0.01, price: 0.1, stack: 99, icon: 'feather', description: 'Fletching for arrows.' }),

  // --- Horse food, care & medicine ---------------------------------------
  I({ id: 'hay', name: 'Timothy Hay', category: 'horseFood', weight: 1.0, price: 0.2, stack: 20, icon: 'hay', description: 'Plain, filling forage.', effects: { horseHunger: 35, horseStamina: 5 } }),
  I({ id: 'oats', name: 'Rolled Oats', category: 'horseFood', weight: 0.5, price: 0.4, stack: 20, icon: 'oats', description: 'Energy feed. Horses love it.', effects: { horseHunger: 25, horseStamina: 25 } }),
  I({ id: 'carrot', name: 'Carrot', category: 'horseFood', weight: 0.1, price: 0.05, stack: 30, icon: 'carrot', description: 'A treat. Good for trust.', effects: { horseHunger: 8, horseStress: -8 } }),
  I({ id: 'apple', name: 'Apple', category: 'horseFood', weight: 0.15, price: 0.08, stack: 30, icon: 'apple', description: 'A crisp treat.', effects: { horseHunger: 10, horseStress: -6 } }),
  I({ id: 'sugarCube', name: 'Sugar Cubes', category: 'horseFood', weight: 0.02, price: 0.1, stack: 40, icon: 'sugar', description: 'Pure bribery.', effects: { horseHunger: 2, horseStress: -12, horseStamina: 10 } }),
  I({ id: 'horseReviver', name: 'Horse Reviver', category: 'horseMedicine', weight: 0.3, price: 2.5, stack: 5, icon: 'tonic', description: 'Smelling salts and stimulant. Gets a downed horse back on its feet.', effects: { horseHealth: 40, horseStamina: 50 } }),
  I({ id: 'horseLiniment', name: 'Liniment', category: 'horseMedicine', weight: 0.3, price: 1.5, stack: 10, icon: 'liniment', description: 'Rubbed into sore legs. Speeds healing of strains and limps.', effects: { horseHeal: 45, horseHealth: 10 } }),
  I({ id: 'horseOintment', name: 'Wound Ointment', category: 'horseMedicine', weight: 0.2, price: 1.2, stack: 10, icon: 'ointment', description: 'Cleans and seals cuts.', effects: { horseHeal: 35, horseHealth: 15 } }),
  I({ id: 'brush', name: 'Curry Comb & Brush', category: 'horseCare', weight: 0.4, price: 1.0, stack: 1, icon: 'brush', description: 'Keeps a coat clean and a horse happy.' }),
  I({ id: 'hoofPick', name: 'Hoof Pick', category: 'horseCare', weight: 0.1, price: 0.5, stack: 1, icon: 'hoofpick', description: 'Clears stones before they turn into lameness.' }),
  I({ id: 'waterBucket', name: 'Canvas Water Bucket', category: 'horseCare', weight: 0.6, price: 0.8, stack: 1, icon: 'bucket', description: 'Water your horse anywhere you can fill it.' }),

  // --- Horse gear ------------------------------------------------------------
  I({ id: 'saddleStock', name: 'Stock Saddle', category: 'horseGear', weight: 12, price: 0, stack: 1, icon: 'saddle', description: 'A plain working saddle.', gear: { slot: 'saddle', staminaDrain: 1, staminaRegen: 1, comfort: 1, wear: 0.4, color: '#6b4126', tier: 1 } }),
  I({ id: 'saddleRanch', name: 'Rio Bravo Ranch Saddle', category: 'horseGear', weight: 14, price: 55, stack: 1, icon: 'saddle', description: 'Deep seat and wide skirts spread the load.', gear: { slot: 'saddle', staminaDrain: 0.92, staminaRegen: 1.08, comfort: 1.15, wear: 0.3, color: '#8a5a2b', tier: 2 } }),
  I({ id: 'saddleMcClure', name: 'McClure Cavalry Saddle', category: 'horseGear', weight: 10, price: 80, stack: 1, icon: 'saddle', description: 'Army-issue, light and open-treed. Built for long marches.', gear: { slot: 'saddle', staminaDrain: 0.85, staminaRegen: 1.12, comfort: 1.05, wear: 0.25, color: '#3d2a1c', tier: 3 } }),
  I({ id: 'saddleRacing', name: 'Flat Racing Saddle', category: 'horseGear', weight: 4, price: 120, stack: 1, icon: 'saddle', description: 'Barely there. Speed over comfort.', gear: { slot: 'saddle', staminaDrain: 0.95, staminaRegen: 0.95, speed: 1.05, comfort: 0.8, carry: -6, wear: 0.6, color: '#a08060', tier: 3 } }),
  I({ id: 'bridleRope', name: 'Rope Halter', category: 'horseGear', weight: 0.4, price: 0, stack: 1, icon: 'bridle', description: 'A rope halter. Little control.', gear: { slot: 'bridle', handling: 0.92, wear: 0.2, color: '#9c8a6a', tier: 0 } }),
  I({ id: 'bridleSnaffle', name: 'Snaffle Bridle', category: 'horseGear', weight: 0.8, price: 12, stack: 1, icon: 'bridle', description: 'A gentle bit. Good communication.', gear: { slot: 'bridle', handling: 1.05, wear: 0.15, color: '#4a2f1d', tier: 1 } }),
  I({ id: 'bridleSilver', name: 'Silver-Conchoed Bridle', category: 'horseGear', weight: 1.0, price: 45, stack: 1, icon: 'bridle', description: 'Border-made headstall with silver conchos.', gear: { slot: 'bridle', handling: 1.12, wear: 0.1, color: '#2b1c14', tier: 2 } }),
  I({ id: 'blanketWool', name: 'Stepped-Weave Blanket', category: 'horseGear', weight: 2, price: 8, stack: 1, icon: 'blanket', description: 'Hand-loomed wool saddle blanket bought from a Tesoro Valley weaver.', gear: { slot: 'blanket', comfort: 1.05, warmth: 1, wear: 0.15, color: '#a8392b', tier: 1 } }),
  I({ id: 'blanketHeavy', name: 'Heavy Winter Blanket', category: 'horseGear', weight: 4, price: 22, stack: 1, icon: 'blanket', description: 'Felted and thick. Keeps a horse warm through a Sierra night.', gear: { slot: 'blanket', comfort: 1.05, warmth: 2.5, wear: 0.1, color: '#3c5a6e', tier: 2 } }),
  I({ id: 'bagsSmall', name: 'Saddlebags', category: 'horseGear', weight: 2, price: 10, stack: 1, icon: 'bags', description: 'Leather saddlebags.', gear: { slot: 'bags', carry: 20, wear: 0.1, color: '#5e3a20', tier: 1 } }),
  I({ id: 'bagsLarge', name: 'Packer Saddlebags', category: 'horseGear', weight: 4, price: 30, stack: 1, icon: 'bags', description: 'Twin heavy panniers for pelts and supplies.', gear: { slot: 'bags', carry: 45, staminaDrain: 1.03, wear: 0.08, color: '#4a301a', tier: 2 } }),
  I({ id: 'shoesSteel', name: 'Steel Horseshoes', category: 'horseGear', weight: 1, price: 6, stack: 1, icon: 'shoe', description: 'Protects hooves on rock and road. Wears down.', gear: { slot: 'shoes', terrain: 1.15, wear: 0.5, tier: 1 } }),
  I({ id: 'shoesCaulked', name: 'Caulked Winter Shoes', category: 'horseGear', weight: 1.2, price: 14, stack: 1, icon: 'shoe', description: 'Studded for ice and snow.', gear: { slot: 'shoes', terrain: 1.25, wear: 0.45, tier: 2 } }),
  I({ id: 'decorConcho', name: 'Mane Conchos', category: 'horseGear', weight: 0.2, price: 9, stack: 1, icon: 'concho', description: 'Silver discs braided into the mane. Pure vanity.', gear: { slot: 'decoration', color: '#d8d8d0', tier: 1 } }),
  I({ id: 'decorRibbon', name: 'Ribbon Braids', category: 'horseGear', weight: 0.1, price: 3, stack: 1, icon: 'ribbon', description: 'Coloured ribbon for the mane.', gear: { slot: 'decoration', color: '#b02d2d', tier: 1 } }),
  I({ id: 'bedroll', name: 'Bedroll & Tarp', category: 'horseGear', weight: 4, price: 6, stack: 1, icon: 'bedroll', description: 'Rolled behind the saddle. Needed to make camp.', gear: { slot: 'bedroll', tier: 1, color: '#6d6350' } }),

  // --- Tools, valuables, documents --------------------------------------
  I({ id: 'fishingRod', name: 'Fishing Rod', category: 'tool', weight: 1, price: 6, stack: 1, icon: 'rod', description: 'Cane rod with a brass reel.' }),
  I({ id: 'pickaxe', name: 'Prospector\'s Pick', category: 'tool', weight: 3, price: 7, stack: 1, icon: 'pick', description: 'Chip at quartz seams and creek-side gravel for color.' }),
  I({ id: 'campKit', name: 'Camp Kit', category: 'tool', weight: 3, price: 5, stack: 1, icon: 'camp', description: 'Pot, tin cup, flint. With a bedroll you can camp anywhere sensible.' }),
  I({ id: 'goldNugget', name: 'Gold Nugget', category: 'valuable', weight: 0.05, price: 18, stack: 50, icon: 'gold', description: 'Panned or chipped from the hills.', sellOnly: true }),
  I({ id: 'silverOre', name: 'Silver Ore', category: 'valuable', weight: 0.5, price: 4, stack: 50, icon: 'ore', description: 'Galena-rich ore from the Drylands seams.', sellOnly: true }),
  I({ id: 'pocketWatch', name: 'Pocket Watch', category: 'valuable', weight: 0.1, price: 12, stack: 10, icon: 'watch', description: 'Engraved. Someone misses this.', sellOnly: true }),
  I({ id: 'ring', name: 'Gold Ring', category: 'valuable', weight: 0.01, price: 20, stack: 10, icon: 'ring', description: 'Simple band.', sellOnly: true }),
  I({ id: 'lockbox', name: 'Strongbox Cash', category: 'valuable', weight: 1, price: 45, stack: 10, icon: 'cash', description: 'Bundled banknotes. Hot money.', sellOnly: true }),
  I({ id: 'lockpick', name: 'Lockpick', category: 'tool', weight: 0.01, price: 1.5, stack: 10, icon: 'lockpick', description: 'Opens locks. Sometimes breaks.' }),
];

const BY_ID = new Map(ITEMS.map((i) => [i.id, i]));

/** Register additional items at runtime (quest items from data/quests). */
export function registerItem(def: ItemDef): void {
  if (!BY_ID.has(def.id)) {
    ITEMS.push(def);
    BY_ID.set(def.id, def);
  }
}

/** Look up an item; throws for unknown ids so broken data shows up in tests. */
export function getItem(id: string): ItemDef {
  const it = BY_ID.get(id);
  if (!it) throw new Error(`Unknown item: ${id}`);
  return it;
}

export function hasItemDef(id: string): boolean {
  return BY_ID.has(id);
}
