/**
 * Economy: shop stock with restocking, supply/demand price drift for goods
 * the player sells (flooding a market with pelts lowers prices, which recover
 * daily), regional horse-breed demand, and horse-trader inventories that are
 * generated, priced and physically placed in corrals.
 */
import { Rng, hashString } from '../core/rng.ts';
import { getBreed } from '../data/breeds.ts';
import { getItem } from '../data/items.ts';
import { getShop, SERVICE_PRICES, type Service, type ShopDef } from '../data/shops.ts';
import type { Game } from '../game.ts';
import { askingPrice, offerPrice, type PriceContext } from '../horse/economy.ts';
import { generateHorse, pickBreed } from '../horse/generator.ts';
import { addHistory, type HorseData } from '../horse/horse.ts';

export class Economy {
  game: Game;
  stock: Record<string, { items: Record<string, number>; day: number }> = {};
  /** Market saturation per item (0 = normal, 1 = flooded). */
  saturation: Record<string, number> = {};
  traderHorses: Record<string, { horses: HorseData[]; day: number }> = {};
  lastDay = 0;
  constructor(game: Game) {
    this.game = game;
  }

  shopStock(id: string): Record<string, number> {
    const def = getShop(id);
    if (!def) return {};
    const day = this.game.clock.day;
    let s = this.stock[id];
    if (!s || day - s.day >= def.restockDays) {
      s = this.stock[id] = { items: { ...def.stock }, day };
    }
    return s.items;
  }

  /** Daily tick: markets recover. */
  daily(): void {
    for (const k of Object.keys(this.saturation)) {
      this.saturation[k] = Math.max(0, this.saturation[k]! - 0.25);
      if (this.saturation[k] === 0) delete this.saturation[k];
    }
  }

  regionalMul(def: ShopDef, itemId: string): number {
    const it = getItem(itemId);
    // Remote regions pay more for pelts and charge more for goods.
    const remote = def.region === 'sierra' || def.region === 'drylands' ? 1.1 : 1;
    if (it.category === 'pelt' && def.region === 'blackwater') return 1.15;
    return remote;
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
    const sat = this.saturation[itemId] ?? 0;
    return round(it.price * def.buyMul * this.regionalMul(def, itemId) * (1 - sat * 0.5) * (2 - this.game.rep.priceMul()));
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
    this.saturation[itemId] = Math.min(1, (this.saturation[itemId] ?? 0) + 0.06);
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

  serialize(): unknown {
    return { stock: this.stock, saturation: this.saturation, traderHorses: this.traderHorses };
  }
  load(d: { stock?: Economy['stock']; saturation?: Economy['saturation']; traderHorses?: Economy['traderHorses'] }): void {
    this.stock = d.stock ?? {};
    this.saturation = d.saturation ?? {};
    this.traderHorses = d.traderHorses ?? {};
  }
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
