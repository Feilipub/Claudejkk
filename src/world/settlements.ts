/**
 * Settlement layout builder. Each layout template stamps buildings, props,
 * fences, corrals and named "spots" (where NPCs work, sleep, drink, where
 * horses are kept) into the World. Deterministic per settlement.
 */
import { Rng, hashString } from '../core/rng.ts';
import type { SettlementDef } from '../data/world.ts';
import { F, G, O } from './tiles.ts';
import type { Building, BuildingType, World } from './world.ts';

export interface Spot {
  id: string;
  settlementId: string;
  kind: 'work' | 'home' | 'social' | 'bed' | 'counter' | 'hitch' | 'corral' | 'stall' | 'camp' | 'street' | 'guard' | 'pray' | 'cell' | 'spawn' | 'trough';
  x: number; // tile
  y: number;
  buildingId?: string;
}

export interface Corral {
  id: string;
  settlementId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  gateX: number;
  gateY: number;
}

export interface SettlementBuild {
  spots: Spot[];
  corrals: Corral[];
}

const ROOF: Record<string, string[]> = {
  plank: ['#6b4a35', '#5a3d2c', '#7a5a3e', '#4d3a2e'],
  brick: ['#5b3b33', '#4a4440', '#6a4b3a'],
  adobe: ['#a27352', '#93684a'],
  log: ['#55402f', '#4b3a2c'],
  whitewash: ['#5c5550', '#6e4e3a'],
};

class Stamper {
  spots: Spot[] = [];
  corrals: Corral[] = [];
  rng: Rng;
  world: World;
  s: SettlementDef;
  constructor(world: World, s: SettlementDef) {
    this.world = world;
    this.s = s;
    this.rng = new Rng(hashString(s.id));
  }

  clear(x: number, y: number, w: number, h: number, ground: number = G.Dirt): void {
    const W = this.world;
    for (let ty = y; ty < y + h; ty++)
      for (let tx = x; tx < x + w; tx++) {
        if (!W.inBounds(tx, ty)) continue;
        const i = W.idx(tx, ty);
        if (W.ground[i] === G.DeepWater || W.ground[i] === G.ShallowWater) continue;
        W.obj[i] = O.None;
        W.flags[i]! |= F.Settlement;
        if (W.ground[i] === G.Cliff) W.ground[i] = ground;
        if (ground !== 255 && !(W.flags[i]! & F.Road)) W.ground[i] = ground;
      }
  }

  ground(x: number, y: number, w: number, h: number, g: number): void {
    const W = this.world;
    for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) if (W.inBounds(tx, ty)) W.ground[W.idx(tx, ty)] = g;
  }

  put(x: number, y: number, o: number): void {
    const W = this.world;
    if (!W.inBounds(x, y)) return;
    const i = W.idx(x, y);
    if (W.buildingAt[i] && !(W.flags[i]! & F.Interior)) return;
    W.obj[i] = o;
  }

  spot(kind: Spot['kind'], x: number, y: number, buildingId?: string, name?: string): void {
    const id = `${this.s.id}:${name ?? kind}:${this.spots.length}`;
    this.spots.push({ id, settlementId: this.s.id, kind, x, y, buildingId });
  }

  building(
    x: number,
    y: number,
    w: number,
    h: number,
    type: BuildingType,
    name: string,
    opts: { wall?: Building['wall']; shopId?: string; sign?: string; facade?: number; ruined?: boolean; doorOffset?: number } = {},
  ): Building {
    const W = this.world;
    const wall = opts.wall ?? 'plank';
    const roofs = ROOF[wall]!;
    const b: Building = {
      id: `${this.s.id}_${type}_${W.buildings.length}`,
      settlementId: this.s.id,
      type,
      name,
      x,
      y,
      w,
      h,
      doorX: x + Math.floor(w / 2) + (opts.doorOffset ?? 0),
      doorY: y + h - 1,
      wall,
      roof: roofs[this.rng.int(0, roofs.length - 1)]!,
      ruined: !!opts.ruined,
      shopId: opts.shopId,
      sign: opts.sign,
      facade: opts.facade ?? 0,
    };
    W.buildings.push(b);
    const bi = W.buildings.length;
    this.clear(x - 1, y - 1, w + 2, h + 3, 255);
    for (let ty = y; ty < y + h; ty++)
      for (let tx = x; tx < x + w; tx++) {
        const i = W.idx(tx, ty);
        W.buildingAt[i] = bi;
        W.obj[i] = O.None;
        const interior = tx > x && tx < x + w - 1 && ty > y && ty < y + h - 1;
        // The whole footprint is floored so cutaway views never show grass inside walls.
        W.ground[i] = wall === 'adobe' ? G.AdobeFloor : G.WoodFloor;
        if (interior) W.flags[i]! |= F.Interior;
      }
    // Door tile counts as interior so you can walk in.
    const di = W.idx(b.doorX, b.doorY);
    W.flags[di]! |= F.Interior;
    W.ground[di] = wall === 'adobe' ? G.AdobeFloor : G.WoodFloor;
    this.furnish(b);
    return b;
  }

  /** Fill a building with furniture and register its spots. */
  furnish(b: Building): void {
    const ix = b.x + 1;
    const iy = b.y + 1;
    const iw = b.w - 2;
    const ih = b.h - 2;
    if (iw < 1 || ih < 1) return;
    const put = (dx: number, dy: number, o: number) => {
      if (dx >= 0 && dy >= 0 && dx < iw && dy < ih) {
        const tx = ix + dx;
        const ty = iy + dy;
        if (tx === b.doorX && ty >= b.doorY - 1) return;
        this.world.obj[this.world.idx(tx, ty)] = o;
      }
    };
    const s = (kind: Spot['kind'], dx: number, dy: number) => this.spot(kind, ix + dx, iy + dy, b.id, `${b.type}_${kind}`);
    if (b.ruined) {
      if (this.rng.chance(0.5)) put(1, 0, O.Table);
      put(iw - 1, 0, O.Barrel);
      return;
    }
    switch (b.type) {
      case 'saloon':
        for (let dx = 0; dx < iw - 2; dx++) put(dx, 0, O.Bar);
        s('counter', Math.floor((iw - 2) / 2), 0);
        put(iw - 1, 0, O.Piano);
        s('work', iw - 1, 1);
        put(1, 2, O.Table); put(0, 2, O.Chair); put(2, 2, O.Chair);
        put(iw - 2, 3, O.Table); put(iw - 3, 3, O.Chair); put(iw - 1, 3, O.Chair);
        s('social', 0, 2); s('social', 2, 2); s('social', iw - 3, 3); s('social', iw - 1, 3); s('social', 3, 1); s('social', 1, 1);
        break;
      case 'store':
      case 'gunsmith':
      case 'tailor':
      case 'assay':
      case 'tradingpost':
        for (let dx = 1; dx < iw - 1; dx++) put(dx, 1, O.Counter);
        s('counter', Math.floor(iw / 2), 0);
        for (let dx = 0; dx < iw; dx += 2) put(dx, 0, O.Shelf);
        put(0, ih - 1, O.Barrel); put(iw - 1, ih - 1, O.Crate);
        s('social', 1, ih - 1);
        break;
      case 'sheriff':
        put(1, 1, O.Desk); s('work', 1, 2);
        put(iw - 1, 0, O.Cell); put(iw - 2, 0, O.Cell); s('cell', iw - 1, 1);
        put(0, 0, O.Shelf); put(iw - 1, ih - 1, O.Chair);
        s('counter', 1, 2);
        break;
      case 'doctor':
        put(0, 0, O.Shelf); put(1, 0, O.Shelf); put(iw - 1, 0, O.Bed); put(iw - 1, 1, O.Bed);
        put(1, 2, O.Desk); s('counter', 1, 1);
        break;
      case 'bank':
        for (let dx = 0; dx < iw; dx++) if (dx !== 1) put(dx, 1, O.Counter);
        put(iw - 1, 0, O.Safe); put(iw - 2, 0, O.Safe);
        s('counter', 2, 0); s('work', 0, 0);
        break;
      case 'hotel':
        for (let dx = 0; dx < iw; dx += 2) put(dx, 0, O.Bed);
        put(1, ih - 1, O.Counter); s('counter', 1, ih - 2);
        s('bed', 1, 1); s('bed', 3, 1);
        break;
      case 'church':
      case 'chapel':
        for (let dy = 1; dy < ih - 1; dy++) {
          put(0, dy, O.Pew); put(1, dy, O.Pew);
          put(iw - 1, dy, O.Pew); put(iw - 2, dy, O.Pew);
          s('pray', 0, dy);
        }
        put(Math.floor(iw / 2), 0, O.Table); s('work', Math.floor(iw / 2), 1);
        break;
      case 'blacksmith':
        put(1, 1, O.Anvil); put(0, 0, O.Stove); s('work', 2, 1); s('counter', 2, 2);
        put(iw - 1, 0, O.Barrel);
        break;
      case 'stable':
      case 'barn':
        for (let dx = 0; dx < iw; dx += 2) { put(dx, 0, O.Stall); s('stall', dx, 1); }
        put(iw - 1, ih - 1, O.HayBale); s('counter', 1, ih - 1); s('work', 2, ih - 1);
        break;
      case 'house':
      case 'ranchhouse':
      case 'cabin':
      case 'shack':
      case 'officers':
        put(0, 0, O.Bed); s('bed', 0, 1);
        if (iw > 2) { put(iw - 1, 0, O.Stove); put(1, ih - 1, O.Table); put(2, ih - 1, O.Chair); s('home', 2, ih - 1); }
        if (iw > 4) { put(2, 0, O.Bed); s('bed', 2, 1); }
        break;
      case 'bunkhouse':
      case 'barracks':
        for (let dx = 0; dx < iw; dx += 2) { put(dx, 0, O.Bed); s('bed', dx, 1); }
        put(iw - 1, ih - 1, O.Table); s('home', iw - 2, ih - 1);
        break;
      case 'station':
      case 'telegraph':
      case 'newspaper':
        put(0, 0, O.Desk); put(1, 0, O.Shelf); s('counter', 0, 1); s('work', 0, 1);
        put(iw - 1, 0, O.Crate);
        break;
      case 'sawmill':
      case 'warehouse':
        put(0, 0, O.Crate); put(1, 0, O.Crate); put(iw - 1, 0, O.Woodpile); put(iw - 1, ih - 1, O.Barrel);
        s('work', 2, 1); s('work', iw - 2, 1);
        break;
      case 'cookhouse':
        put(0, 0, O.Stove); put(2, 1, O.Table); put(1, 1, O.Chair); put(3, 1, O.Chair);
        s('work', 0, 1); s('social', 1, 1); s('social', 3, 1); s('counter', 1, 0);
        break;
      case 'lodgehouse':
        put(Math.floor(iw / 2), Math.floor(ih / 2), O.FirePit);
        put(0, 0, O.Bed); put(iw - 1, 0, O.Bed);
        s('home', 1, ih - 1); s('bed', 0, 1); s('social', iw - 1, ih - 1);
        break;
    }
  }

  fenceRect(x: number, y: number, w: number, h: number, gateX: number, gateY: number): void {
    for (let tx = x; tx < x + w; tx++) {
      this.put(tx, y, O.FenceH);
      this.put(tx, y + h - 1, O.FenceH);
    }
    for (let ty = y + 1; ty < y + h - 1; ty++) {
      this.put(x, ty, O.FenceV);
      this.put(x + w - 1, ty, O.FenceV);
    }
    this.put(gateX, gateY, O.None);
    if (gateY === y + h - 1 || gateY === y) this.put(gateX + 1, gateY, O.None);
  }

  /** A fenced corral with a gate on the bottom side; `topGateX` adds a second gate on the top side (e.g. facing a stable door). */
  corral(x: number, y: number, w: number, h: number, topGateX?: number): Corral {
    this.clear(x, y, w, h, G.Dirt);
    const gateX = x + Math.floor(w / 2);
    const gateY = y + h - 1;
    this.fenceRect(x, y, w, h, gateX, gateY);
    if (topGateX !== undefined) {
      this.put(topGateX, y, O.None);
      this.put(topGateX + 1, y, O.None);
    }
    this.put(x + 1, y + 1, O.Trough);
    this.put(x + w - 2, y + 1, O.HayBale);
    const c: Corral = { id: `${this.s.id}_corral_${this.corrals.length}`, settlementId: this.s.id, x, y, w, h, gateX, gateY };
    this.corrals.push(c);
    for (let i = 0; i < 3; i++) this.spot('corral', x + 2 + i * 2, y + Math.floor(h / 2));
    return c;
  }

  /** Storefront props: hitching post, trough, lamp, barrels. */
  frontage(b: Building): void {
    const fy = b.y + b.h;
    const left = b.x;
    this.put(left, fy, O.HitchPost);
    this.spot('hitch', left, fy + 1, b.id);
    if (b.w > 4) this.put(b.x + b.w - 1, fy, this.rng.chance(0.5) ? O.Barrel : O.Trough);
    if (this.rng.chance(0.4)) this.put(b.x + b.w - 2, fy, O.Crate);
  }

  /** Clear props in a rect and mark it as settlement, keeping the natural ground (cliffs become `cliffTo`). */
  clearKeep(x: number, y: number, w: number, h: number, cliffTo: number = G.Dirt): void {
    const W = this.world;
    for (let ty = y; ty < y + h; ty++)
      for (let tx = x; tx < x + w; tx++) {
        if (!W.inBounds(tx, ty)) continue;
        const i = W.idx(tx, ty);
        if (W.ground[i] === G.DeepWater || W.ground[i] === G.ShallowWater) continue;
        W.obj[i] = O.None;
        W.flags[i]! |= F.Settlement;
        if (W.ground[i] === G.Cliff) W.ground[i] = cliffTo;
      }
  }

  /** A worked field: farmland ground with a crop row every other line. */
  field(x: number, y: number, w: number, h: number, crop: number = O.Cornstalk): void {
    this.clear(x, y, w, h, G.Farmland);
    for (let ty = y + 1; ty < y + h; ty += 2) for (let tx = x; tx < x + w; tx++) this.put(tx, ty, crop);
  }

  /** Fenced pasture without trough/hay (a paddock); gate on the top side. */
  paddock(x: number, y: number, w: number, h: number, gateX: number): void {
    this.fenceRect(x, y, w, h, gateX, y);
  }

  /**
   * A plank pier running south from (x, y) to the first water and `reach` tiles
   * beyond it; water tiles become bridge decking.
   */
  pier(x: number, y: number, width: number, reach: number): { x: number; y: number } | null {
    const W = this.world;
    let wet = -1;
    let end: { x: number; y: number } | null = null;
    for (let ty = y; ty < y + 40 && W.inBounds(x, ty); ty++) {
      const isWater = W.ground[W.idx(x, ty)] === G.DeepWater || W.ground[W.idx(x, ty)] === G.ShallowWater;
      if (isWater && wet < 0) wet = ty;
      if (wet >= 0 && ty >= wet + reach) break;
      for (let tx = x; tx < x + width; tx++) {
        if (!W.inBounds(tx, ty)) continue;
        const i = W.idx(tx, ty);
        W.obj[i] = O.None;
        W.flags[i]! |= F.Settlement;
        const g = W.ground[i]!;
        if (g === G.DeepWater || g === G.ShallowWater) W.flags[i]! |= F.Bridge;
        else W.ground[i] = G.WoodFloor;
      }
      end = { x, y: ty };
    }
    return wet >= 0 ? end : null;
  }

  street(x: number, y: number, w: number, h: number): void {
    this.clear(x, y, w, h, G.Street);
    for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) if (this.world.inBounds(tx, ty)) this.world.flags[this.world.idx(tx, ty)]! |= F.Road;
  }
}

/** Build every settlement layout into the world. */
export function buildSettlement(world: World, s: SettlementDef): SettlementBuild {
  const st = new Stamper(world, s);
  const cx = s.x;
  const cy = s.y;
  const L = LAYOUTS[s.layout];
  if (!L) throw new Error(`Unknown layout ${s.layout}`);
  L(st, cx, cy);
  return { spots: st.spots, corrals: st.corrals };
}

type Layout = (st: Stamper, cx: number, cy: number) => void;

const LAYOUTS: Record<string, Layout> = {
  town(st, cx, cy) {
    // Main street runs east-west along the stage road.
    st.clear(cx - 26, cy - 14, 52, 30, 255);
    st.street(cx - 26, cy - 1, 52, 4);
    st.street(cx - 1, cy - 14, 3, 13);
    const north: [BuildingType, string, number, string?, string?][] = [
      ['sheriff', 'Sheriff\'s Office', 7, undefined, 'SHERIFF'],
      ['saloon', 'The Gilded Spur Saloon', 10, 'saloon_larkspur', 'SALOON'],
      ['store', 'Pettibone Mercantile', 8, 'store_larkspur', 'GENERAL STORE'],
      ['doctor', 'Dr. Okafor, Physician', 6, 'doctor_larkspur', 'DOCTOR'],
      ['blacksmith', 'Gatlin Smithy', 7, 'smith_larkspur', 'SMITHY'],
    ];
    let x = cx - 25;
    for (const [type, name, w, shop, sign] of north) {
      if (x <= cx + 1 && x + w >= cx - 1) x = cx + 3;
      const b = st.building(x, cy - 8, w, 7, type, name, { shopId: shop, sign, facade: type === 'saloon' || type === 'store' ? 10 : 4 });
      st.frontage(b);
      x += w + 1;
    }
    const south: [BuildingType, string, number, string?, string?][] = [
      ['stable', 'Larkspur Livery & Horse Trader', 12, 'stable_larkspur', 'LIVERY'],
      ['hotel', 'Calder House Hotel', 8, 'hotel_larkspur', 'HOTEL'],
      ['telegraph', 'Post & Telegraph', 5, undefined, 'TELEGRAPH'],
      ['church', 'First Calder Church', 7, undefined, undefined],
    ];
    x = cx - 25;
    for (const [type, name, w, shop, sign] of south) {
      const b = st.building(x, cy + 4, w, 7, type, name, { shopId: shop, sign, facade: type === 'church' ? 14 : 6, wall: type === 'church' ? 'whitewash' : 'plank' });
      if (type !== 'church') st.put(b.x, b.y - 1, O.HitchPost);
      x += w + 2;
      if (type === 'stable') st.corral(b.x, b.y + b.h + 1, 12, 7, b.doorX);
    }
    // Houses on the edges.
    for (let i = 0; i < 4; i++) {
      const hx = cx + 6 + i * 6;
      st.building(hx, cy + 5, 5, 5, 'house', `House`, {});
    }
    st.put(cx + 2, cy + 3, O.Well);
    st.spot('street', cx, cy + 1);
    st.spot('street', cx - 10, cy + 1);
    st.spot('street', cx + 12, cy + 1);
    st.spot('social', cx + 3, cy + 2);
    for (let i = -24; i < 26; i += 8) st.put(cx + i, cy - 1, O.LampPost);
    st.put(cx - 27, cy + 3, O.Signpost);
  },

  city(st, cx, cy) {
    st.clear(cx - 34, cy - 20, 70, 38, 255);
    st.street(cx - 34, cy - 1, 70, 4);
    st.street(cx - 1, cy - 20, 4, 36);
    st.street(cx - 34, cy - 14, 70, 3);
    const rowA: [BuildingType, string, number, string?, string?][] = [
      ['bank', 'Blackwater Savings & Trust', 9, undefined, 'BANK'],
      ['hotel', 'The Grand Meridian Hotel', 10, 'hotel_ashby', 'HOTEL'],
      ['saloon', 'The Lakeview Saloon', 10, 'saloon_ashby', 'SALOON'],
      ['gunsmith', 'Ingram Arms', 7, 'gun_ashby', 'GUNSMITH'],
      ['tailor', 'Delacroix Clothier', 7, 'tailor_ashby', 'TAILOR'],
      ['newspaper', 'The Ashby Clarion', 7, undefined, 'CLARION'],
    ];
    let x = cx - 33;
    for (const [type, name, w, shop, sign] of rowA) {
      if (x <= cx + 3 && x + w >= cx - 1) x = cx + 4;
      const b = st.building(x, cy - 10, w, 9, type, name, { shopId: shop, sign, wall: type === 'bank' || type === 'hotel' ? 'brick' : 'plank', facade: 12 });
      st.frontage(b);
      x += w + 1;
    }
    const rowB: [BuildingType, string, number, string?, string?][] = [
      ['sheriff', 'Territorial Marshal', 8, undefined, 'MARSHAL'],
      ['store', 'Ashby General Supply', 9, 'store_ashby', 'GENERAL SUPPLY'],
      ['doctor', 'Ashby Infirmary', 8, 'doctor_ashby', 'INFIRMARY'],
      ['station', 'Meridian & Western Depot', 12, undefined, 'M&W DEPOT'],
      ['stable', 'Ashby Stables & Horse Exchange', 12, 'stable_ashby', 'HORSE EXCHANGE'],
    ];
    x = cx - 33;
    for (const [type, name, w, shop, sign] of rowB) {
      if (x <= cx + 3 && x + w >= cx - 1) x = cx + 4;
      const b = st.building(x, cy + 4, w, 8, type, name, { shopId: shop, sign, wall: type === 'sheriff' || type === 'station' ? 'brick' : 'plank', facade: 8 });
      st.put(b.x, b.y - 1, O.HitchPost);
      st.spot('hitch', b.x, b.y - 2, b.id);
      x += w + 1;
      if (type === 'stable') st.corral(b.x - 2, b.y + b.h + 1, 14, 6, b.doorX);
    }
    // North residential row
    for (let i = 0; i < 6; i++) st.building(cx - 32 + i * 11, cy - 20, 6, 5, 'house', 'House', { wall: i % 2 ? 'brick' : 'plank' });
    for (let i = -32; i < 34; i += 7) st.put(cx + i, cy - 1, O.LampPost);
    st.put(cx + 1, cy + 3, O.Well);
    st.spot('street', cx, cy + 1);
    st.spot('street', cx - 18, cy + 1);
    st.spot('street', cx + 18, cy + 1);
    st.spot('street', cx + 1, cy - 12);
    st.spot('social', cx + 2, cy + 2);
    st.spot('social', cx - 6, cy - 12);
  },

  ranch(st, cx, cy) {
    st.clear(cx - 14, cy - 12, 30, 26, G.Dirt);
    const house = st.building(cx - 12, cy - 10, 8, 6, 'ranchhouse', 'Brannigan Ranch House', { wall: 'log' });
    st.put(house.x - 1, house.y + house.h, O.Woodpile);
    const barn = st.building(cx + 2, cy - 11, 10, 7, 'barn', 'Brannigan Barn', { wall: 'plank', shopId: 'ranch_brannigan' });
    st.put(barn.x - 1, barn.y + barn.h, O.HitchPost);
    st.building(cx - 12, cy + 1, 7, 5, 'bunkhouse', 'Bunkhouse', { wall: 'log' });
    st.corral(cx - 3, cy - 2, 14, 10);
    st.corral(cx + 12, cy - 8, 8, 8);
    st.put(cx - 4, cy - 3, O.Windmill);
    st.put(cx - 3, cy + 9, O.Trough);
    st.put(cx - 6, cy - 3, O.FirePit);
    st.spot('camp', cx - 6, cy - 2);
    st.spot('work', cx + 3, cy + 9);
    st.spot('social', cx - 7, cy - 2);
    st.put(cx + 14, cy + 4, O.Wagon);
  },

  mining(st, cx, cy) {
    st.clear(cx - 18, cy - 10, 36, 22, G.Hardpan);
    st.street(cx - 18, cy, 36, 3);
    const b1 = st.building(cx - 16, cy - 7, 7, 6, 'assay', 'Assay Office', { shopId: 'assay_sulfur', sign: 'ASSAY' });
    st.frontage(b1);
    const b2 = st.building(cx - 7, cy - 7, 9, 6, 'saloon', 'The Dry Well', { shopId: 'saloon_sulfur', sign: 'SALOON', facade: 8 });
    st.frontage(b2);
    const b3 = st.building(cx + 4, cy - 7, 7, 6, 'store', 'Company Store', { shopId: 'store_sulfur', sign: 'COMPANY STORE' });
    st.frontage(b3);
    for (let i = 0; i < 4; i++) st.building(cx - 16 + i * 6, cy + 4, 4, 4, 'shack', 'Miner\'s shack', {});
    st.building(cx + 9, cy + 4, 7, 5, 'stable', 'Sulfur Flats Livery', { shopId: 'stable_sulfur' });
    st.put(cx + 13, cy - 8, O.MineEntrance);
    st.put(cx + 15, cy - 8, O.Crate);
    st.put(cx + 12, cy - 7, O.Rail);
    st.put(cx, cy + 1, O.Well);
    st.spot('work', cx + 13, cy - 6, undefined, 'mine');
    st.spot('work', cx + 14, cy - 6, undefined, 'mine');
    st.spot('street', cx - 4, cy + 1);
    st.spot('social', cx + 1, cy + 2);
  },

  camp(st, cx, cy) {
    st.clear(cx - 14, cy - 10, 28, 20, G.Dirt);
    st.building(cx - 12, cy - 8, 12, 7, 'sawmill', 'Cedar Notch Sawmill', {});
    st.building(cx + 2, cy - 8, 8, 6, 'cookhouse', 'Cookhouse', { wall: 'log', shopId: 'store_cedar', sign: 'COOK' });
    st.building(cx + 2, cy + 1, 8, 5, 'bunkhouse', 'Loggers\' Bunkhouse', { wall: 'log' });
    for (let i = 0; i < 5; i++) st.put(cx - 12 + i * 2, cy + 3, O.Woodpile);
    st.put(cx - 4, cy + 6, O.Tent);
    st.put(cx - 8, cy + 6, O.Tent);
    st.put(cx - 6, cy + 2, O.FirePit);
    st.spot('camp', cx - 6, cy + 3);
    st.spot('work', cx - 10, cy + 2, undefined, 'logs');
    st.spot('work', cx - 2, cy + 2, undefined, 'logs');
    st.corral(cx + 11, cy - 4, 6, 6);
  },

  mountainranch(st, cx, cy) {
    st.clear(cx - 12, cy - 8, 24, 18, G.Dirt);
    st.building(cx - 10, cy - 6, 8, 6, 'tradingpost', 'Whitepeak Trading Post', { wall: 'log', shopId: 'store_whitepeak', sign: 'TRADING POST' });
    st.building(cx + 1, cy - 7, 9, 6, 'barn', 'Whitepeak Barn', { wall: 'log', shopId: 'stable_whitepeak' });
    st.building(cx - 10, cy + 2, 6, 5, 'cabin', 'Musgrave Cabin', { wall: 'log' });
    st.corral(cx, cy + 1, 10, 7);
    st.put(cx - 2, cy, O.FirePit);
    st.spot('camp', cx - 2, cy + 1);
    st.spot('social', cx - 3, cy + 1);
  },

  fort(st, cx, cy) {
    st.clear(cx - 14, cy - 12, 28, 24, G.Dirt);
    st.fenceRect(cx - 13, cy - 11, 26, 22, cx, cy + 10);
    st.building(cx - 11, cy - 9, 10, 6, 'barracks', 'Barracks', { wall: 'log' });
    st.building(cx + 2, cy - 9, 8, 6, 'officers', 'Officers\' Quarters', { wall: 'whitewash' });
    st.building(cx - 11, cy + 1, 7, 6, 'store', 'Sutler\'s Store', { wall: 'log', shopId: 'store_fort', sign: 'SUTLER' });
    st.building(cx + 2, cy + 1, 9, 6, 'stable', 'Cavalry Stables', { wall: 'log' });
    st.spot('guard', cx, cy + 9);
    st.spot('guard', cx - 1, cy + 9);
    st.spot('street', cx, cy - 2);
    st.spot('street', cx - 4, cy - 1);
    st.put(cx, cy - 2, O.LampPost);
  },

  ghost(st, cx, cy) {
    st.clear(cx - 14, cy - 8, 28, 18, G.DryGrass);
    st.street(cx - 14, cy, 28, 3);
    const types: [BuildingType, string][] = [['saloon', 'Abandoned saloon'], ['store', 'Gutted store'], ['house', 'Empty house'], ['church', 'Gallow\'s Hope Church']];
    let x = cx - 13;
    for (const [t, n] of types) {
      st.building(x, cy - 7, 6, 6, t, n, { ruined: t !== 'church', wall: t === 'church' ? 'whitewash' : 'plank', facade: t === 'church' ? 14 : 4 });
      x += 7;
    }
    st.building(cx - 6, cy + 4, 5, 4, 'house', 'Collapsed house', { ruined: true });
    for (let i = 0; i < 12; i++) st.put(cx + 4 + (i % 4) * 2, cy + 4 + Math.floor(i / 4) * 2, O.Grave);
    st.put(cx - 10, cy + 5, O.DeadTree);
    st.put(cx - 12, cy + 3, O.Wagon);
  },

  mission(st, cx, cy) {
    st.clear(cx - 10, cy - 8, 20, 16, G.Hardpan);
    st.building(cx - 6, cy - 7, 12, 8, 'chapel', 'San Isidro Chapel', { wall: 'adobe', ruined: true, facade: 16 });
    st.building(cx - 9, cy + 2, 6, 5, 'house', 'Friars\' cells', { wall: 'adobe', ruined: true });
    st.put(cx + 3, cy + 3, O.Well);
    for (let i = 0; i < 6; i++) st.put(cx + 2 + (i % 3) * 2, cy + 5 + Math.floor(i / 3), O.Tombstone);
  },

  hideout(st, cx, cy) {
    st.clear(cx - 12, cy - 10, 24, 20, G.RedSand);
    st.building(cx - 10, cy - 8, 7, 5, 'cabin', 'Gang Cabin', { wall: 'log' });
    st.put(cx + 2, cy - 6, O.Tent);
    st.put(cx + 5, cy - 6, O.Tent);
    st.put(cx + 8, cy - 4, O.Tent);
    st.put(cx, cy, O.FirePit);
    st.spot('camp', cx + 1, cy);
    st.spot('camp', cx - 1, cy + 1);
    st.spot('guard', cx, cy + 8);
    st.spot('guard', cx - 3, cy + 6);
    st.spot('guard', cx + 4, cy + 5);
    for (let i = 0; i < 4; i++) st.put(cx - 9 + i, cy + 2, O.Crate);
    st.corral(cx + 3, cy + 2, 8, 6);
  },

  station(st, cx, cy) {
    st.clear(cx - 8, cy - 6, 16, 10, G.Dirt);
    st.building(cx - 6, cy - 6, 6, 5, 'station', 'Meridian Junction Depot', { shopId: 'station_meridian', sign: 'MERIDIAN JCT' });
    st.put(cx + 3, cy - 5, O.WaterTower);
    st.building(cx + 5, cy - 6, 4, 4, 'telegraph', 'Telegraph shack', {});
    st.spot('work', cx - 3, cy);
    st.spot('street', cx, cy);
  },

  lodge(st, cx, cy) {
    st.clear(cx - 14, cy - 10, 28, 22, G.Grass);
    for (let i = 0; i < 4; i++) st.building(cx - 13 + i * 7, cy - 8, 6, 6, 'lodgehouse', 'Winter lodge', { wall: 'log' });
    st.building(cx - 6, cy + 1, 8, 5, 'tradingpost', 'Council House', { wall: 'log', shopId: 'stable_sayen' });
    st.corral(cx + 4, cy + 1, 10, 8);
    st.put(cx - 8, cy + 8, O.FirePit);
    st.spot('camp', cx - 8, cy + 9);
    st.spot('social', cx - 9, cy + 8);
    st.spot('work', cx + 3, cy + 6);
  },

  farm(st, cx, cy) {
    st.clear(cx - 12, cy - 10, 26, 22, G.Dirt);
    st.building(cx - 10, cy - 8, 7, 5, 'house', 'Halvorsen Farmhouse', { wall: 'plank' });
    st.building(cx + 1, cy - 9, 8, 6, 'barn', 'Halvorsen Barn', {});
    st.put(cx - 2, cy - 3, O.Windmill);
    st.ground(cx - 11, cy + 1, 22, 9, G.Farmland);
    for (let y = cy + 2; y < cy + 9; y += 2) for (let x = cx - 10; x < cx + 10; x++) st.put(x, y, O.Cornstalk);
    st.spot('work', cx - 4, cy + 3, undefined, 'field');
    st.spot('work', cx + 4, cy + 5, undefined, 'field');
    st.corral(cx + 10, cy - 8, 6, 6);
  },

  cabin(st, cx, cy) {
    st.clear(cx - 6, cy - 5, 12, 10, G.Dirt);
    st.building(cx - 4, cy - 4, 6, 5, 'cabin', 'Trapper\'s cabin', { wall: 'log' });
    st.put(cx + 3, cy - 2, O.Woodpile);
    st.put(cx + 1, cy + 3, O.FirePit);
    st.spot('camp', cx + 1, cy + 4);
    st.put(cx - 5, cy + 2, O.HitchPost);
  },

  // =========================================================================
  // EXPANSION: towns
  // =========================================================================

  /** Harrow Junction: a rail town strung along the Meridian & Western, with stockyards on the siding. */
  junction(st, cx, cy) {
    st.clear(cx - 24, cy - 20, 49, 31, G.Dirt);
    st.street(cx - 24, cy - 1, 49, 4);
    // Back row: houses and a chapel (built first so the main row's clearing never touches them).
    for (const hx of [cx - 11, cx - 5, cx + 1]) st.building(hx, cy - 18, 5, 5, 'house', 'House', { wall: hx === cx - 5 ? 'brick' : 'plank' });
    st.building(cx + 8, cy - 19, 7, 6, 'church', 'Junction Union Chapel', { wall: 'whitewash', facade: 12 });
    st.building(cx + 17, cy - 18, 5, 5, 'house', 'House', {});
    // Main row, north side of the street.
    const stable = st.building(cx - 23, cy - 10, 10, 8, 'stable', 'Harrow Livery', { shopId: 'stable_harrow', sign: 'LIVERY', facade: 6 });
    st.frontage(stable);
    // Trader horses: the livery corral sits behind the barn (the first corral is the sale pen).
    st.corral(cx - 23, cy - 19, 10, 7);
    const north: [BuildingType, string, number, string?, string?, Building['wall']?][] = [
      ['saloon', 'The Iron Horse Saloon', 10, 'saloon_harrow', 'SALOON', 'plank'],
      ['hotel', 'Junction House Hotel', 9, 'hotel_harrow', 'HOTEL', 'brick'],
      ['store', 'Mercer & Daughters Dry Goods', 8, 'store_harrow', 'DRY GOODS', 'plank'],
      ['sheriff', 'Town Marshal', 7, undefined, 'MARSHAL', 'brick'],
    ];
    let x = cx - 12;
    for (const [type, name, w, shop, sign, wall] of north) {
      const b = st.building(x, cy - 10, w, 8, type, name, { shopId: shop, sign, wall, facade: type === 'saloon' || type === 'hotel' ? 12 : 8 });
      st.frontage(b);
      x += w + 1;
    }
    // South side: depot on the platform, freight house, smithy, then the stockyards on the siding.
    const depot = st.building(cx - 22, cy + 4, 12, 7, 'station', 'Harrow Junction Depot', { shopId: 'station_harrow', sign: 'HARROW JCT', wall: 'brick', facade: 8 });
    st.put(depot.x, depot.y - 1, O.HitchPost);
    st.building(cx - 9, cy + 4, 9, 7, 'warehouse', 'M&W Freight House', { sign: 'FREIGHT' });
    const smith = st.building(cx + 2, cy + 4, 7, 7, 'blacksmith', 'Harrow Smithy', { sign: 'SMITHY' });
    st.put(smith.x + smith.w - 1, smith.y - 1, O.HitchPost);
    st.corral(cx + 10, cy + 4, 14, 7);
    // Platform clutter along the track, and the water tower that gives the place its reason to exist.
    for (const [px, o] of [[cx - 21, O.Crate], [cx - 20, O.Crate], [cx - 13, O.Barrel], [cx - 12, O.Barrel], [cx - 7, O.Crate], [cx - 3, O.Barrel]] as const) st.put(px, cy + 11, o);
    st.put(cx - 5, cy + 12, O.WaterTower);
    st.put(cx + 3, cy + 11, O.Woodpile);
    st.spot('work', cx - 17, cy + 12, depot.id, 'platform');
    st.spot('work', cx - 9, cy + 12, undefined, 'platform');
    st.spot('work', cx + 16, cy + 11, undefined, 'stockyard');
    st.spot('work', cx + 9, cy + 6, undefined, 'stockyard');
    // Street furniture.
    for (let i = -22; i < 24; i += 9) st.put(cx + i, cy - 1, O.LampPost);
    st.put(cx + 4, cy + 2, O.Well);
    st.put(cx + 5, cy + 2, O.Trough);
    st.spot('street', cx, cy + 1);
    st.spot('street', cx - 14, cy + 1);
    st.spot('street', cx + 14, cy + 1);
    st.spot('social', cx - 7, cy);
    st.spot('social', cx + 6, cy + 1);
    st.spot('social', cx - 9, cy - 1);
    st.put(cx - 25, cy - 2, O.Signpost);
    st.put(cx + 25, cy - 2, O.Signpost);
  },

  /** Las Golondrinas: an adobe pueblo around a plaza and its well, on the border road. */
  pueblo(st, cx, cy) {
    st.clear(cx - 19, cy - 15, 41, 34, G.Hardpan);
    st.street(cx - 8, cy - 4, 17, 8);
    const cantina = st.building(cx - 18, cy - 12, 9, 7, 'saloon', 'Cantina El Farol', { wall: 'adobe', shopId: 'saloon_golondrinas', sign: 'CANTINA', facade: 8 });
    st.frontage(cantina);
    st.building(cx - 6, cy - 13, 10, 8, 'chapel', 'Capilla de las Golondrinas', { wall: 'adobe', facade: 16 });
    const tienda = st.building(cx + 6, cy - 12, 8, 7, 'store', 'Tienda Arvizu', { wall: 'adobe', shopId: 'store_golondrinas', sign: 'TIENDA', facade: 6 });
    st.frontage(tienda);
    st.building(cx + 15, cy - 10, 5, 5, 'house', 'Casa', { wall: 'adobe' });
    const smith = st.building(cx - 18, cy + 5, 7, 6, 'blacksmith', 'Herrería Quintero', { wall: 'adobe', shopId: 'smith_golondrinas', sign: 'HERRERIA' });
    st.put(smith.x, smith.y - 1, O.HitchPost);
    st.building(cx - 9, cy + 5, 5, 5, 'house', 'Casa', { wall: 'adobe' });
    st.building(cx - 3, cy + 5, 5, 5, 'house', 'Casa', { wall: 'adobe' });
    const stable = st.building(cx + 6, cy + 5, 9, 6, 'stable', 'Corrales Navarro', { wall: 'adobe', shopId: 'stable_golondrinas', sign: 'CABALLOS' });
    st.put(stable.x, stable.y - 1, O.HitchPost);
    st.corral(cx + 5, cy + 12, 12, 6, stable.doorX);
    // Irrigated chile and corn plot fed from the well.
    st.field(cx - 18, cy + 13, 12, 5);
    st.spot('work', cx - 14, cy + 13, undefined, 'field');
    st.spot('work', cx - 9, cy + 15, undefined, 'field');
    // The plaza: well, a ramada table, a carreta.
    st.put(cx, cy, O.Well);
    st.put(cx + 1, cy, O.Trough);
    st.put(cx + 5, cy - 2, O.Table);
    st.put(cx + 4, cy - 2, O.Chair);
    st.put(cx + 6, cy - 2, O.Chair);
    st.put(cx - 6, cy + 2, O.Wagon);
    st.put(cx - 4, cy - 3, O.FirePit);
    st.spot('social', cx + 4, cy - 1);
    st.spot('social', cx + 6, cy - 1);
    st.spot('social', cx - 4, cy - 2);
    st.spot('social', cx - 1, cy + 1);
    st.spot('street', cx + 2, cy + 2);
    st.spot('street', cx - 7, cy - 1);
    st.spot('camp', cx - 3, cy - 2);
    st.put(cx - 10, cy - 15, O.Signpost);
    st.put(cx + 1, cy + 18, O.Signpost);
  },

  /** Lodestar Camp: a hard-rock silver camp in the Sierra with a stamp mill and a tunnel. */
  minecamp(st, cx, cy) {
    st.clear(cx - 18, cy - 16, 38, 28, G.Dirt);
    st.street(cx - 18, cy - 1, 32, 3);
    const assay = st.building(cx - 17, cy - 8, 8, 6, 'assay', 'Lodestar Assay & Claims', { shopId: 'assay_lodestar', sign: 'ASSAY' });
    st.frontage(assay);
    const saloon = st.building(cx - 8, cy - 8, 8, 6, 'saloon', 'The Tin Cup', { shopId: 'saloon_lodestar', sign: 'SALOON', facade: 8 });
    st.frontage(saloon);
    const post = st.building(cx + 1, cy - 8, 8, 6, 'tradingpost', 'Lodestar Outfitters', { wall: 'log', shopId: 'store_lodestar', sign: 'OUTFITTERS' });
    st.frontage(post);
    st.building(cx - 17, cy + 3, 9, 5, 'bunkhouse', 'Miners\' Bunkhouse', { wall: 'log' });
    st.building(cx - 6, cy + 3, 10, 6, 'sawmill', 'Lodestar Stamp Mill', {});
    const barn = st.building(cx + 6, cy + 3, 7, 5, 'stable', 'Mule Barn', { wall: 'log' });
    st.put(barn.x, barn.y - 1, O.HitchPost);
    st.corral(cx + 14, cy + 3, 6, 6);
    // Shacks and tents up the slope behind the street.
    st.building(cx - 16, cy - 15, 4, 4, 'shack', 'Miner\'s shack', {});
    st.building(cx - 11, cy - 15, 4, 4, 'shack', 'Miner\'s shack', {});
    st.put(cx - 4, cy - 12, O.Tent);
    st.put(cx - 1, cy - 13, O.Tent);
    st.put(cx + 2, cy - 12, O.Tent);
    st.put(cx - 1, cy - 11, O.FirePit);
    st.spot('camp', cx - 2, cy - 10);
    st.spot('camp', cx, cy - 10);
    // The tunnel: adit, ore track down to the street, timbers and powder crates.
    st.put(cx + 13, cy - 7, O.MineEntrance);
    for (let ty = cy - 6; ty <= cy - 2; ty++) st.put(cx + 13, ty, O.Rail);
    st.put(cx + 15, cy - 7, O.Crate);
    st.put(cx + 15, cy - 6, O.Crate);
    st.put(cx + 16, cy - 8, O.Woodpile);
    st.put(cx + 16, cy - 3, O.Wagon);
    st.spot('work', cx + 12, cy - 5, undefined, 'mine');
    st.spot('work', cx + 14, cy - 5, undefined, 'mine');
    st.spot('work', cx + 14, cy - 3, undefined, 'mine');
    st.put(cx - 3, cy + 2, O.Trough);
    st.put(cx - 2, cy + 2, O.Barrel);
    st.spot('street', cx - 6, cy);
    st.spot('street', cx + 6, cy);
    st.spot('social', cx - 4, cy - 1);
    st.put(cx - 19, cy + 2, O.Signpost);
  },

  /** Toller's Landing: a river trading post and ferry pier on the Tinaja. */
  landing(st, cx, cy) {
    st.clear(cx - 15, cy - 11, 33, 22, G.Dirt);
    const post = st.building(cx - 14, cy - 9, 9, 7, 'tradingpost', 'Toller\'s Landing Trading Post', { wall: 'log', shopId: 'store_landing', sign: 'TRADING POST' });
    st.frontage(post);
    const fur = st.building(cx - 2, cy - 9, 9, 7, 'warehouse', 'Lachance Fur & Freight', { shopId: 'fur_landing', sign: 'FURS' });
    st.frontage(fur);
    st.building(cx + 9, cy - 8, 6, 5, 'house', 'Toller House', { wall: 'log' });
    const saloon = st.building(cx - 14, cy + 4, 8, 6, 'saloon', 'The Mudcat', { shopId: 'saloon_landing', sign: 'SALOON', facade: 6 });
    st.put(saloon.x, saloon.y - 1, O.HitchPost);
    st.building(cx - 4, cy + 4, 7, 5, 'stable', 'Ferry Barn', { wall: 'log' });
    st.corral(cx + 10, cy + 3, 8, 6);
    // Pier down to the river, freight stacked at the head of it.
    const end = st.pier(cx + 4, cy + 3, 2, 3);
    st.put(cx + 3, cy + 3, O.Crate);
    st.put(cx + 6, cy + 3, O.Barrel);
    st.put(cx + 6, cy + 4, O.Crate);
    if (end) {
      st.spot('work', cx + 4, end.y, undefined, 'pier');
      st.spot('work', cx + 5, end.y - 1, undefined, 'pier');
    }
    st.spot('work', cx + 4, cy + 4, undefined, 'pier');
    // Rivermen's camp.
    st.put(cx + 8, cy + 9, O.Tent);
    st.put(cx + 11, cy + 10, O.FirePit);
    st.spot('camp', cx + 11, cy + 11);
    st.spot('social', cx + 10, cy + 11);
    st.put(cx + 16, cy - 2, O.Wagon);
    st.put(cx + 1, cy, O.Well);
    st.spot('street', cx, cy + 1);
    st.spot('street', cx - 9, cy + 1);
    st.spot('social', cx - 6, cy + 2);
    st.put(cx - 16, cy - 1, O.Signpost);
  },

  // =========================================================================
  // EXPANSION: ranches and homesteads
  // =========================================================================

  /** Coldiron Cattle Company: holding pens, branding pen, chuck house, bunkhouse. */
  cattleranch(st, cx, cy) {
    st.clearKeep(cx - 16, cy - 13, 34, 27, G.Grass);
    st.clear(cx - 16, cy - 13, 15, 27, G.Dirt);
    const house = st.building(cx - 15, cy - 11, 9, 6, 'ranchhouse', 'Coldiron Ranch House', {});
    st.put(house.x - 1, house.y + house.h, O.Woodpile);
    st.put(house.x + house.w, house.y + house.h, O.HitchPost);
    const barn = st.building(cx - 3, cy - 12, 10, 7, 'barn', 'Coldiron Barn', { shopId: 'ranch_coldiron' });
    st.put(barn.x - 1, barn.y + barn.h, O.HitchPost);
    st.building(cx - 15, cy - 2, 7, 5, 'cookhouse', 'Chuck House', { wall: 'log' });
    st.building(cx - 15, cy + 5, 9, 5, 'bunkhouse', 'Coldiron Bunkhouse', { wall: 'log' });
    st.corral(cx - 4, cy - 2, 12, 9);
    st.corral(cx + 9, cy - 2, 8, 9);
    st.paddock(cx - 4, cy + 8, 21, 6, cx + 6);
    st.put(cx + 10, cy - 10, O.Windmill);
    st.put(cx + 13, cy - 11, O.WaterTower);
    st.put(cx + 12, cy - 8, O.Trough);
    st.put(cx + 13, cy - 8, O.Trough);
    st.put(cx - 7, cy - 1, O.Wagon);
    st.put(cx - 7, cy + 2, O.FirePit);
    st.spot('camp', cx - 7, cy + 3);
    st.spot('social', cx - 6, cy + 3);
    st.spot('work', cx + 2, cy + 7, undefined, 'pens');
    st.spot('work', cx + 12, cy + 7, undefined, 'branding');
    st.spot('work', cx + 8, cy + 11, undefined, 'pasture');
    for (let i = 0; i < 4; i++) st.put(cx + 14 + (i % 2), cy + 10 + Math.floor(i / 2), O.HayBale);
  },

  /** Starling Horse Ranch: breeding barn with a sale corral, round pen and a long paddock. */
  horseranch(st, cx, cy) {
    st.clearKeep(cx - 16, cy - 12, 34, 28, G.Grass);
    st.clear(cx - 16, cy - 12, 34, 15, G.Dirt);
    const house = st.building(cx - 14, cy - 10, 8, 6, 'ranchhouse', 'Starling House', { wall: 'whitewash' });
    st.put(house.x + house.w, house.y + house.h, O.HitchPost);
    const barn = st.building(cx - 3, cy - 11, 12, 7, 'stable', 'Starling Breeding Barn', { shopId: 'stable_starling', sign: 'STARLING', facade: 6 });
    // Sale corral first: trader horses go in the settlement's first corral.
    st.corral(cx - 4, cy - 2, 14, 8, barn.doorX);
    st.corral(cx + 10, cy - 10, 8, 7);
    st.building(cx - 14, cy + 0, 7, 5, 'bunkhouse', 'Hands\' Bunkhouse', { wall: 'log' });
    st.paddock(cx - 14, cy + 7, 32, 8, cx);
    for (const [tx, ty] of [[cx - 11, cy + 9], [cx + 3, cy + 12], [cx + 13, cy + 9]]) st.put(tx!, ty!, O.Trough);
    for (const [tx, ty] of [[cx - 8, cy + 12], [cx + 9, cy + 10]]) st.put(tx!, ty!, O.HayBale);
    st.put(cx + 14, cy - 1, O.Windmill);
    st.put(cx + 13, cy + 1, O.Trough);
    st.put(cx - 7, cy - 3, O.Well);
    st.put(cx + 16, cy + 3, O.Wagon);
    st.spot('work', cx + 13, cy - 3, undefined, 'roundpen');
    st.spot('work', cx + 1, cy + 10, undefined, 'paddock');
    st.spot('social', cx - 8, cy - 3);
    st.spot('social', cx - 6, cy - 2);
  },

  /** Arrieta Sheep Camp: Basque sheep outfit with shearing shed, pens and a sheep wagon. */
  sheepcamp(st, cx, cy) {
    st.clearKeep(cx - 12, cy - 10, 27, 23, G.Grass);
    st.clear(cx - 12, cy - 10, 27, 10, G.Dirt);
    const house = st.building(cx - 11, cy - 9, 7, 5, 'house', 'Arrieta House', { wall: 'whitewash' });
    st.put(house.x - 1, house.y + 2, O.Woodpile);
    st.building(cx - 1, cy - 9, 9, 6, 'barn', 'Shearing Shed', { shopId: 'farm_arrieta' });
    st.corral(cx - 11, cy - 1, 9, 7);
    st.corral(cx - 1, cy - 1, 8, 7);
    st.corral(cx + 8, cy - 1, 6, 6);
    st.paddock(cx - 11, cy + 7, 25, 6, cx);
    st.put(cx + 10, cy - 7, O.Wagon);
    st.put(cx + 12, cy - 5, O.Tent);
    st.put(cx + 10, cy - 4, O.FirePit);
    st.put(cx - 3, cy - 4, O.Well);
    st.spot('camp', cx + 10, cy - 3);
    st.spot('social', cx + 9, cy - 3);
    st.spot('work', cx - 4, cy + 10, undefined, 'flock');
    st.spot('work', cx + 6, cy + 9, undefined, 'flock');
    st.spot('home', cx - 8, cy - 3, undefined, 'porch');
  },

  /** Ashgrove Orchard: apple rows, a corn field, pig pen and a cider house farm stand. */
  orchard(st, cx, cy) {
    st.clearKeep(cx - 14, cy - 13, 31, 27, G.Grass);
    st.clear(cx - 14, cy - 13, 31, 9, G.Dirt);
    st.building(cx - 13, cy - 11, 8, 6, 'house', 'Marsh Farmhouse', { wall: 'whitewash' });
    st.building(cx - 2, cy - 12, 10, 7, 'barn', 'Ashgrove Barn', {});
    const stand = st.building(cx + 9, cy - 10, 8, 5, 'store', 'Ashgrove Cider House', { shopId: 'farm_ashgrove', sign: 'CIDER', facade: 4 });
    st.frontage(stand);
    st.corral(cx - 13, cy - 2, 8, 6);
    st.put(cx - 4, cy - 3, O.Windmill);
    st.put(cx - 4, cy - 2, O.Trough);
    // The orchard: apple trees planted on a three-tile grid.
    st.ground(cx - 4, cy - 2, 20, 8, G.Grass);
    for (let ty = cy - 1; ty <= cy + 3; ty += 2) for (let tx = cx - 3; tx <= cx + 12; tx += 3) st.put(tx, ty, O.Oak);
    st.spot('work', cx - 1, cy + 1, undefined, 'orchard');
    st.spot('work', cx + 5, cy + 2, undefined, 'orchard');
    st.spot('work', cx + 11, cy, undefined, 'orchard');
    st.field(cx - 13, cy + 6, 28, 7);
    st.spot('work', cx - 8, cy + 8, undefined, 'field');
    st.spot('work', cx + 6, cy + 10, undefined, 'field');
    st.put(cx + 9, cy - 3, O.Well);
    st.put(cx + 13, cy - 3, O.Barrel);
    st.put(cx + 14, cy - 3, O.Barrel);
    st.put(cx + 12, cy - 3, O.Crate);
    st.spot('social', cx + 10, cy - 2);
    st.spot('social', cx - 7, cy - 4);
  },
};
