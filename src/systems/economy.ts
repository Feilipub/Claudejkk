/**
 * Economy: shop stock with restocking, regional supply/demand prices (goods are
 * cheap where produced and dear where scarce), market saturation per region
 * (flooding a market lowers prices, which recover daily), trade posts layered
 * onto the shop table, homestead property (the long-term money sink), regional
 * horse-breed demand, and horse-trader inventories that are generated, priced
 * and physically placed in corrals.
 *
 * The pure pay/price formulas used by the job system live at the bottom of this
 * file so they can be unit-tested without a Game. Design: design/gdd/economy-jobs.md.
 */
import { Rng, hashString } from '../core/rng.ts';
import { BALANCE } from '../data/balance.ts';
import { getBreed } from '../data/breeds.ts';
import { getItem } from '../data/items.ts';
import { JOB_TEMPLATES, PLOTS, TRADE_GOODS, TRADE_POSTS, UPGRADES, type JobBoardDef, type JobTemplate, type PlotDef } from '../data/jobs.ts';
import { SHOPS, getShop, SERVICE_PRICES, type Service, type ShopDef } from '../data/shops.ts';
import type { Game } from '../game.ts';
import { askingPrice, offerPrice, type PriceContext } from '../horse/economy.ts';
import { generateHorse, pickBreed } from '../horse/generator.ts';
import { addHistory, type HorseData } from '../horse/horse.ts';
import { L, tr } from '../core/i18n.ts';

/** A homestead the player owns. */
export interface OwnedPlot {
  upgrades: string[];
  /** Uncollected produce (fractional units accrue daily). */
  stock: Record<string, number>;
  /** Unpaid tax in dollars. */
  arrears: number;
  boughtDay: number;
  /** Day the lean-to stable was last used. */
  stableDay?: number;
}

export class Economy {
  game: Game;
  stock: Record<string, { items: Record<string, number>; day: number }> = {};
  /** Market saturation per item (0 = normal, 1 = flooded). */
  saturation: Record<string, number> = {};
  traderHorses: Record<string, { horses: HorseData[]; day: number }> = {};
  /** Homesteads owned, by plot id. */
  property: Record<string, OwnedPlot> = {};
  lastDay = 0;
  constructor(game: Game) {
    this.game = game;
    applyTradePosts(SHOPS);
  }

  shopStock(id: string): Record<string, number> {
    const def = getShop(id);
    if (!def) return {};
    const day = this.game.clock.day;
    let s = this.stock[id];
    if (!s || day - s.day >= def.restockDays) {
      s = this.stock[id] = { items: { ...def.stock, ...(TRADE_POSTS[id]?.stock ?? {}) }, day };
    }
    return s.items;
  }

  /** Daily tick: markets recover, homestead produce accrues and taxes fall due. */
  daily(): void {
    for (const k of Object.keys(this.saturation)) {
      this.saturation[k] = Math.max(0, this.saturation[k]! - BALANCE.trade.saturationRecovery);
      if (this.saturation[k] === 0) delete this.saturation[k];
    }
    this.propertyDaily();
  }

  /** Regional price multiplier for an item at a shop (see `regionalPriceMul`). */
  regionalMul(def: ShopDef, itemId: string): number {
    return regionalPriceMul(def.region, itemId);
  }

  /** Market saturation of an item in the shop's region (0..1). */
  saturationAt(shopId: string, itemId: string): number {
    const def = getShop(shopId);
    return def ? this.saturation[saturationKey(def.region, itemId)] ?? 0 : 0;
  }

  buyPrice(shopId: string, itemId: string): number {
    const def = getShop(shopId)!;
    const it = getItem(itemId);
    return round(it.price * def.priceMul * this.regionalMul(def, itemId) * this.game.rep.priceMul());
  }

  sellPrice(shopId: string, itemId: string): number {
    const def = getShop(shopId)!;
    const it = getItem(itemId);
    if (!def.buys.includes(it.category)) return 0;
    const sat = this.saturationAt(shopId, itemId);
    const price = it.price * def.buyMul * this.regionalMul(def, itemId) * saturationFactor(sat) * (2 - this.game.rep.priceMul());
    // A shop never buys back what it sells for more than a fixed share of its own asking price.
    const stocked = itemId in (def.stock ?? {}) || itemId in (TRADE_POSTS[shopId]?.stock ?? {});
    return round(stocked ? Math.min(price, this.buyPrice(shopId, itemId) * BALANCE.trade.maxResaleRatio) : price);
  }

  buy(shopId: string, itemId: string): string | null {
    const g = this.game;
    const st = this.shopStock(shopId);
    if ((st[itemId] ?? 0) <= 0) return 'Out of stock.';
    const price = this.buyPrice(shopId, itemId);
    if (g.player.money < price) return 'You can\'t afford that.';
    const it = getItem(itemId);
    if (it.category === 'horseGear') {
      // Tack goes straight to the stable / your horse rather than your pockets.
      g.player.money -= price;
      st[itemId]!--;
      // Fits it on your horse if the slot is free, otherwise stores it and says where.
      g.giveItem(itemId, 1);
      g.quests.onBuy(itemId);
      g.bus.emit('purchase', { itemId, price, shopId });
      return null;
    }
    if (it.category === 'weapon') {
      if (g.player.weapons.includes(itemId)) return 'You already own one.';
      g.player.money -= price;
      st[itemId]!--;
      g.player.weapons.push(itemId);
      g.player.clip[itemId] = 0;
      g.quests.onBuy(itemId);
      return null;
    }
    if (!g.player.inv.canAdd(itemId)) return 'Your satchel is full.';
    g.player.money -= price;
    st[itemId]!--;
    g.player.inv.add(itemId);
    g.quests.onBuy(itemId);
    g.bus.emit('purchase', { itemId, price, shopId });
    return null;
  }

  sell(shopId: string, itemId: string): string | null {
    const g = this.game;
    const price = this.sellPrice(shopId, itemId);
    if (price <= 0) return 'They don\'t buy that here.';
    if (!g.player.inv.remove(itemId)) return 'You have none.';
    g.player.money += price;
    const key = saturationKey(getShop(shopId)!.region, itemId);
    const step = itemId in TRADE_GOODS ? BALANCE.trade.tradeSaturationPerSale : BALANCE.trade.saturationPerSale;
    this.saturation[key] = Math.min(1, (this.saturation[key] ?? 0) + step);
    return null;
  }

  servicePrice(s: Service): number {
    return round(SERVICE_PRICES[s] * this.game.rep.priceMul());
  }

  // --- Horses -------------------------------------------------------------------
  priceCtx(shopId: string, breedId: string): PriceContext {
    const def = getShop(shopId)!;
    const b = getBreed(breedId);
    const local = b.regions.includes(def.region) ? 0.92 : 1.15;
    const day = this.game.clock.day;
    const drift = 0.94 + (hashString(`${shopId}:${breedId}:${Math.floor(day / 3)}`) % 1000) / 1000 * 0.14;
    const sayen = shopId === 'stable_sayen' ? (this.game.rep.get('sayen') >= 20 ? 0.9 : 1.3) : 1;
    return { market: local * drift * def.priceMul * sayen, reputation: this.game.rep.priceMul() };
  }

  horsesFor(shopId: string): HorseData[] {
    const def = getShop(shopId);
    if (!def?.horses) return [];
    const day = this.game.clock.day;
    let t = this.traderHorses[shopId];
    if (!t || day - t.day >= def.restockDays) {
      const period = Math.floor(day / def.restockDays);
      const rng = new Rng(hashString(shopId) + period * 7919);
      const keep = t ? t.horses.filter((h) => h.owner === `trader:${shopId}`).slice(0, 1) : [];
      const horses: HorseData[] = [...keep];
      while (horses.length < def.horses.count) {
        const breedId = def.horses.breeds ? rng.pick(def.horses.breeds) : pickBreed(rng, def.region).id;
        const h = generateHorse(rng.int(1, 1e9), { breedId, training: def.horses.training, owner: `trader:${shopId}` });
        h.gear = { bridle: 'bridleRope' };
        addHistory(h, day, `Offered for sale at ${def.name}.`);
        horses.push(h);
      }
      t = this.traderHorses[shopId] = { horses, day };
      this.game.onTraderRestock(shopId);
    }
    return t.horses.filter((h) => h.owner === `trader:${shopId}`);
  }

  horseAsk(shopId: string, h: HorseData): number {
    return askingPrice(h, this.priceCtx(shopId, h.breedId));
  }
  horseOffer(shopId: string, h: HorseData): number {
    return offerPrice(h, this.priceCtx(shopId, h.breedId), h.owner === 'stolen');
  }

  buyHorse(shopId: string, horseId: string): string | null {
    const g = this.game;
    const h = this.horsesFor(shopId).find((x) => x.id === horseId);
    if (!h) return 'That horse is no longer for sale.';
    const price = this.horseAsk(shopId, h);
    if (g.player.money < price) return 'You can\'t afford this horse.';
    g.player.money -= price;
    h.owner = 'player';
    addHistory(h, g.clock.day, `Bought by you for ${price} dollars.`);
    g.acquireTraderHorse(h, shopId);
    g.bus.emit('horseBought', { horseId: h.id });
    return null;
  }

  sellHorse(shopId: string, horseId: string): string | null {
    const g = this.game;
    const he = g.horses.get(horseId);
    if (!he) return 'No such horse.';
    const h = he.data;
    if (g.player.mount === he) return 'Dismount first.';
    const price = this.horseOffer(shopId, h);
    const stolen = h.owner === 'stolen';
    g.player.money += price;
    if (stolen) g.rep.add('honor', -3);
    h.owner = `trader:${shopId}`;
    addHistory(h, g.clock.day, `Sold to ${getShop(shopId)!.name}.`);
    g.releaseHorseToTrader(he, shopId);
    const t = this.traderHorses[shopId];
    if (t) t.horses.push(h);
    return null;
  }

  // --- Homesteads ----------------------------------------------------------------------------
  /** Buy a plot's deed. Returns an error message or null. */
  buyPlot(plotId: string): string | null {
    const g = this.game;
    const def = PLOTS.find((p) => p.id === plotId);
    if (!def) return 'No such plot.';
    if (this.property[plotId]) return 'You already hold that deed.';
    if (g.player.money < def.price) return `The deed costs ${def.price} dollars.`;
    g.player.money -= def.price;
    this.property[plotId] = { upgrades: [], stock: {}, arrears: 0, boughtDay: g.clock.day };
    g.setFlag(`plot_owned_${plotId}`, true);
    return null;
  }

  /** Improvements that can be built on a plot right now (requirements met, not yet built). */
  availableUpgrades(plotId: string): typeof UPGRADES {
    const own = this.property[plotId];
    if (!own) return [];
    return UPGRADES.filter((u) => !own.upgrades.includes(u.id) && (u.requires ?? []).every((r) => own.upgrades.includes(r)));
  }

  /** Build an improvement on an owned plot. Returns an error message or null. */
  buyUpgrade(plotId: string, upgradeId: string): string | null {
    const g = this.game;
    const own = this.property[plotId];
    const u = UPGRADES.find((x) => x.id === upgradeId);
    if (!own || !u) return 'Nothing to build there.';
    if (own.upgrades.includes(u.id)) return 'Already built.';
    if (!(u.requires ?? []).every((r) => own.upgrades.includes(r))) return `Build ${u.requires!.join(' and ')} first.`;
    if (own.arrears > 0) return 'Settle your taxes first.';
    if (g.player.money < u.price) return `That costs ${u.price} dollars.`;
    g.player.money -= u.price;
    own.upgrades.push(u.id);
    return null;
  }

  /** Hand over all whole units of produce waiting at a plot. Returns what was collected. */
  collectProduce(plotId: string): Record<string, number> {
    const own = this.property[plotId];
    const got: Record<string, number> = {};
    if (!own) return got;
    for (const [item, qty] of Object.entries(own.stock)) {
      const n = Math.floor(qty);
      if (n <= 0) continue;
      this.game.giveItem(item, n);
      own.stock[item] = qty - n;
      got[item] = n;
    }
    return got;
  }

  /** Pay off tax arrears on every plot from the player's purse. */
  settleTaxes(): number {
    const g = this.game;
    let paid = 0;
    for (const own of Object.values(this.property)) {
      const pay = Math.min(own.arrears, g.player.money);
      g.player.money -= pay;
      own.arrears = round(own.arrears - pay);
      paid += pay;
    }
    return round(paid);
  }

  /** Total unpaid tax across plots. */
  arrears(): number {
    return round(Object.values(this.property).reduce((a, o) => a + o.arrears, 0));
  }

  private propertyDaily(): void {
    const g = this.game;
    for (const [id, own] of Object.entries(this.property)) {
      const def = PLOTS.find((p) => p.id === id);
      if (!def) continue;
      const r = dailyPlotTick(own, def, g.player.money);
      g.player.money = round(g.player.money - r.taxPaid);
      if (r.newArrears > 0 && own.arrears === r.newArrears) g.notify(tr`Tax on ${L(def.name)} is unpaid. Settle it at a land office.`, 'bad');
    }
  }

  serialize(): unknown {
    return { stock: this.stock, saturation: this.saturation, traderHorses: this.traderHorses, property: this.property };
  }
  load(d: { stock?: Economy['stock']; saturation?: Economy['saturation']; traderHorses?: Economy['traderHorses']; property?: Economy['property'] }): void {
    this.stock = d.stock ?? {};
    // Saturation is per region since the trade update; older saves keyed it by item alone.
    this.saturation = Object.fromEntries(Object.entries(d.saturation ?? {}).filter(([k]) => k.includes(':')));
    this.traderHorses = d.traderHorses ?? {};
    this.property = d.property ?? {};
  }
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

// =============================================================================================
// Pure formulas (unit-tested in tests/unit/systems/economy-jobs.test.ts).
// Every constant comes from BALANCE or data/jobs.ts; see design/gdd/economy-jobs.md § Formulas.
// =============================================================================================

/** Saturation is tracked per region and item: flooding Larkspur does not depress Port Ashby. */
export function saturationKey(region: string, itemId: string): string {
  return `${region}:${itemId}`;
}

/** Price factor of a market at saturation `sat` (0..1): 1 − sat × depth. */
export function saturationFactor(sat: number): number {
  return 1 - Math.max(0, Math.min(1, sat)) * BALANCE.trade.saturationDepth;
}

/**
 * Regional price multiplier. Trade goods: producedMul where made, scarceMul where
 * scarce, 1 elsewhere. Other goods keep the original rule: remote regions
 * (sierra, drylands) ×1.1; pelts in blackwater ×1.15.
 */
export function regionalPriceMul(region: string, itemId: string): number {
  const tg = TRADE_GOODS[itemId];
  if (tg) {
    if ((tg.produced as string[]).includes(region)) return BALANCE.trade.producedMul;
    if ((tg.scarce as string[]).includes(region)) return BALANCE.trade.scarceMul;
    return 1;
  }
  if (getItem(itemId).category === 'pelt' && region === 'blackwater') return 1.15;
  return region === 'sierra' || region === 'drylands' ? 1.1 : 1;
}

/** Add trade-post stock categories to the shop table (idempotent). */
export function applyTradePosts(shops: ShopDef[]): void {
  for (const def of shops) {
    for (const c of TRADE_POSTS[def.id]?.buys ?? []) if (!def.buys.includes(c)) def.buys.push(c);
    // A shop that never bought anything has buyMul 0; trade posts buy at the general-store rate.
    if (TRADE_POSTS[def.id]?.buys?.length && def.buyMul <= 0) def.buyMul = 0.8;
  }
}

/** Tax and produce for one owned plot over one game day. Mutates `own`. */
export function dailyPlotTick(own: OwnedPlot, def: PlotDef, money: number): { taxPaid: number; newArrears: number } {
  let taxPaid = 0;
  let newArrears = 0;
  const due = def.taxPerDay + own.arrears;
  if (money >= due) {
    taxPaid = due;
    own.arrears = 0;
  } else {
    taxPaid = Math.max(0, money);
    own.arrears = round(due - taxPaid);
    newArrears = own.arrears;
  }
  // Produce stops while taxes are more than the grace period in arrears.
  if (own.arrears <= def.taxPerDay * BALANCE.property.arrearsGraceDays) {
    for (const uid of own.upgrades) {
      const u = UPGRADES.find((x) => x.id === uid);
      for (const y of u?.yields ?? []) own.stock[y.item] = Math.min(y.cap, (own.stock[y.item] ?? 0) + y.perDay);
    }
  }
  return { taxPaid: round(taxPaid), newArrears };
}

// --- Work pay ---------------------------------------------------------------------------------

/** Everything that scales a job's pay. */
export interface PayContext {
  /** Level (1..6) of the template's skill; 1 when the job uses none. */
  skillLevel: number;
  /** Reputation with the template's faction (-100..100); 0 when none. */
  rep: number;
  /** Player's standing with the employing town's board. */
  standing: number;
  /** The offer's daily demand roll. */
  demand: number;
  /** How well the job was done (deadline, strikes, steers penned). */
  perf: number;
}

/** Pay multiplier from skill, faction reputation, town standing, demand and performance, capped at BALANCE.jobs.maxMul. */
export function payMultiplier(c: PayContext): number {
  const J = BALANCE.jobs;
  const skill = 1 + J.skillStep * (Math.max(1, Math.min(6, c.skillLevel)) - 1);
  const rep = clamp(1 + c.rep * J.repStep, J.repMin, J.repMax);
  const standing = 1 + J.standingStep * clamp(c.standing, J.standingMin, J.standingMax);
  const perf = clamp(c.perf, J.perfMin, J.perfMax);
  return Math.min(J.maxMul, skill * rep * standing * c.demand * perf);
}

/** Unscaled pay: base + perUnit × units + perTile × tiles. */
export function basePay(t: Pick<JobTemplate, 'pay'>, units: number, tiles: number): number {
  return t.pay.base + (t.pay.perUnit ?? 0) * units + (t.pay.perTile ?? 0) * tiles;
}

/** Dollars paid for a finished job (rounded to the cent). */
export function jobPay(t: Pick<JobTemplate, 'pay'>, units: number, tiles: number, c: PayContext): number {
  return round(basePay(t, units, tiles) * payMultiplier(c));
}

/** Delivery deadline in game minutes for a straight-line distance in tiles. */
export function deliveryDeadline(tiles: number, pace: 'normal' | 'express'): number {
  const J = BALANCE.jobs;
  return Math.round(J.deliveryGrace[pace]! + tiles * J.minutesPerTile[pace]!);
}

/**
 * Delivery performance: on time → 1 + earlyBonus × (time left / limit);
 * late → 1 − latePenaltyPerHour × hours late. Clamped to [perfMin, perfMax].
 */
export function deliveryPerformance(elapsedMin: number, limitMin: number): number {
  const J = BALANCE.jobs;
  const p = elapsedMin <= limitMin
    ? 1 + J.earlyBonus * (1 - elapsedMin / Math.max(1, limitMin))
    : 1 - J.latePenaltyPerHour * ((elapsedMin - limitMin) / 60);
  return clamp(p, J.perfMin, J.perfMax);
}

/** Strike mini-game performance: share of swings that landed, clamped. */
export function strikePerformance(hits: number, misses: number): number {
  const J = BALANCE.jobs;
  return hits + misses <= 0 ? J.perfMin : clamp(hits / (hits + misses) * J.perfMax, J.perfMin, J.perfMax);
}

/** Position of the strike gauge (0..1) after `t` seconds: a smooth fill-and-empty cycle. */
export function strikeGauge(t: number): number {
  return (1 - Math.cos(t * BALANCE.jobs.strikeSpeed * Math.PI * 2)) / 2;
}

/** Expected real minutes of one job (deliveries add riding time per tile). */
export function expectedMinutes(t: JobTemplate, tiles: number): number {
  return t.minutes + (t.kind === 'deliver' ? (tiles / 100) * BALANCE.jobs.rideMinutesPer100Tiles : 0);
}

/** Dollars per real hour for a job at the given context, counting pay another system adds (externalPay). */
export function hourlyRate(t: JobTemplate, units: number, tiles: number, c: PayContext): number {
  return ((jobPay(t, units, tiles, c) + (t.externalPay ?? 0)) / expectedMinutes(t, tiles)) * 60;
}

/** Straight-line tile distance between two tile points. */
export function tileDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** One posted job on a notice board. */
export interface JobOffer {
  id: string;
  templateId: string;
  /** Settlement whose board posted it. */
  boardId: string;
  day: number;
  units: number;
  tiles: number;
  demand: number;
  /** Delivery destination settlement. */
  destId?: string;
  /** Item a gather contract wants (one of the template's items). */
  item?: string;
  /** Bounty camp id. */
  camp?: string;
}

/**
 * The offers a board posts on a given day. Deterministic in (board, day): the
 * same day always shows the same offers; the next day rotates them. `positions`
 * gives tile coordinates of every board settlement (delivery destinations), and
 * `canOffer` lets the caller veto templates the local world cannot host.
 */
export function rollBoardOffers(
  board: JobBoardDef,
  day: number,
  positions: Record<string, { x: number; y: number }>,
  camps: { id: string; x: number; y: number }[],
  canOffer: (t: JobTemplate) => boolean = () => true,
): JobOffer[] {
  const rng = new Rng(hashString(`${board.settlementId}:${day}`));
  const J = BALANCE.jobs;
  const here = positions[board.settlementId];
  let pool = board.templates.map((id) => JOB_TEMPLATES.find((t) => t.id === id)!).filter((t) => t && canOffer(t));
  const offers: JobOffer[] = [];
  for (let slot = 0; slot < board.slots && pool.length; slot++) {
    const t = rng.weighted(pool, (x) => x.weight ?? 1);
    pool = pool.filter((x) => x !== t);
    const o: JobOffer = { id: `${board.settlementId}:${day}:${slot}`, templateId: t.id, boardId: board.settlementId, day, units: 1, tiles: 0, demand: round(rng.range(J.demandMin, J.demandMax)) };
    if (t.deliver && here) {
      const d = t.deliver;
      const dests = Object.entries(positions).filter(([id, p]) => id !== board.settlementId && tileDistance(here, p) >= d.minTiles && tileDistance(here, p) <= d.maxTiles);
      if (!dests.length) continue;
      const [destId, p] = rng.pick(dests);
      o.destId = destId;
      o.tiles = Math.round(tileDistance(here, p));
    } else if (t.gather) {
      o.item = rng.pick(t.gather.items);
      o.units = rng.int(t.gather.qty[0], t.gather.qty[1]);
    } else if (t.cattle) o.units = rng.int(t.cattle.head[0], t.cattle.head[1]);
    else if (t.chores) o.units = t.chores.count;
    else if (t.bartend) o.units = t.bartend.orders;
    else if (t.bounty) {
      o.units = 1 + rng.int(t.bounty.gang[0], t.bounty.gang[1]);
      if (here && camps.length) {
        const sorted = [...camps].sort((a, b) => tileDistance(a, here) - tileDistance(b, here));
        o.camp = rng.pick(sorted.slice(0, 3)).id;
      }
    }
    offers.push(o);
  }
  return offers;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
