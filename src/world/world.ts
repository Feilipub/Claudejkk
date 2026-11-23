/**
 * World container: tile layers plus spatial queries used by every system.
 * Terrain is regenerated deterministically from the seed at boot; only
 * player-caused changes (camps, opened caches) go into the save.
 */
import { GROUND, OBJ, F, G, O } from './tiles.ts';
import { REGIONS, WORLD_H, WORLD_W } from '../data/world.ts';

export type BuildingType =
  | 'saloon' | 'store' | 'sheriff' | 'doctor' | 'stable' | 'hotel' | 'blacksmith' | 'church' | 'bank' | 'house'
  | 'station' | 'newspaper' | 'gunsmith' | 'tailor' | 'barn' | 'ranchhouse' | 'bunkhouse' | 'assay' | 'shack'
  | 'sawmill' | 'cookhouse' | 'barracks' | 'officers' | 'telegraph' | 'cabin' | 'warehouse' | 'lodgehouse' | 'chapel' | 'tradingpost';

export interface Building {
  id: string;
  settlementId: string;
  type: BuildingType;
  name: string;
  /** Tile rect (outer walls included). */
  x: number;
  y: number;
  w: number;
  h: number;
  doorX: number;
  doorY: number;
  wall: 'plank' | 'log' | 'adobe' | 'brick' | 'whitewash';
  roof: string;
  ruined: boolean;
  /** Shop id in data/shops.ts if this building trades. */
  shopId?: string;
  /** Storefront sign text. */
  sign?: string;
  /** Height of the façade in px (false fronts are taller). */
  facade: number;
}

export class World {
  readonly w = WORLD_W;
  readonly h = WORLD_H;
  ground = new Uint8Array(WORLD_W * WORLD_H);
  height = new Uint8Array(WORLD_W * WORLD_H);
  obj = new Uint8Array(WORLD_W * WORLD_H);
  flags = new Uint8Array(WORLD_W * WORLD_H);
  region = new Uint8Array(WORLD_W * WORLD_H);
  buildings: Building[] = [];
  /** Building index per tile (+1), 0 = none. Covers the full footprint. */
  buildingAt = new Uint16Array(WORLD_W * WORLD_H);

  idx(tx: number, ty: number): number {
    return ty * this.w + tx;
  }
  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h;
  }
  groundAt(tx: number, ty: number): number {
    if (!this.inBounds(tx, ty)) return G.DeepWater;
    return this.ground[this.idx(tx, ty)]!;
  }
  objAt(tx: number, ty: number): number {
    if (!this.inBounds(tx, ty)) return O.None;
    return this.obj[this.idx(tx, ty)]!;
  }
  flagAt(tx: number, ty: number): number {
    if (!this.inBounds(tx, ty)) return 0;
    return this.flags[this.idx(tx, ty)]!;
  }
  heightAt(tx: number, ty: number): number {
    if (!this.inBounds(tx, ty)) return 0;
    return this.height[this.idx(tx, ty)]!;
  }
  /** Bilinear height at a pixel position, for slope calculations. */
  heightPx(px: number, py: number): number {
    const fx = px / 16 - 0.5;
    const fy = py / 16 - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const a = this.heightAt(x0, y0);
    const b = this.heightAt(x0 + 1, y0);
    const c = this.heightAt(x0, y0 + 1);
    const d = this.heightAt(x0 + 1, y0 + 1);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  }
  regionAt(tx: number, ty: number): string {
    if (!this.inBounds(tx, ty)) return REGIONS[0]!.id;
    return REGIONS[this.region[this.idx(tx, ty)]!]!.id;
  }
  regionAtPx(px: number, py: number): string {
    return this.regionAt(Math.floor(px / 16), Math.floor(py / 16));
  }
  buildingAtPx(px: number, py: number): Building | null {
    const tx = Math.floor(px / 16);
    const ty = Math.floor(py / 16);
    if (!this.inBounds(tx, ty)) return null;
    const b = this.buildingAt[this.idx(tx, ty)]!;
    return b ? this.buildings[b - 1]! : null;
  }
  /** Is the pixel inside a building's interior (not on its wall)? */
  insideBuilding(px: number, py: number): Building | null {
    const tx = Math.floor(px / 16);
    const ty = Math.floor(py / 16);
    return (this.flagAt(tx, ty) & F.Interior) !== 0 ? this.buildingAtPx(px, py) : null;
  }

  /** Movement collision at a pixel point. `mounted` makes small props block (fences still block without a jump). */
  blockedPx(px: number, py: number, mounted = false): boolean {
    const tx = Math.floor(px / 16);
    const ty = Math.floor(py / 16);
    if (!this.inBounds(tx, ty)) return true;
    const i = this.idx(tx, ty);
    const g = this.ground[i]!;
    if (GROUND[g]!.blocked) return true;
    if (this.buildingAt[i] && !(this.flags[i]! & F.Interior)) {
      const b = this.buildings[this.buildingAt[i]! - 1]!;
      if (!(tx === b.doorX && ty === b.doorY)) return !b.ruined || (tx + ty) % 3 === 0;
    }
    const o = this.obj[i]!;
    if (o === O.None) return false;
    const def = OBJ[o]!;
    if (!def.solid) return false;
    const lx = px - tx * 16;
    const ly = py - ty * 16;
    if (def.radius) {
      // Trees/barrels: round collider at the trunk base (bottom centre of tile).
      const dx = lx - 8;
      const dy = ly - 12;
      const r = def.radius + (mounted ? 2 : 0);
      return dx * dx + dy * dy < r * r;
    }
    if (o === O.FenceH) return ly > 7 && ly < 14;
    if (o === O.HitchPost) return ly > 8 && ly < 14 && lx > 1 && lx < 15;
    if (o === O.FenceV) return lx > 5 && lx < 11;
    return true;
  }

  /** Movement multiplier and roughness at a pixel. */
  terrainAt(px: number, py: number): { speed: number; rough: number; surface: string; water: boolean; deep: boolean; g: number } {
    const tx = Math.floor(px / 16);
    const ty = Math.floor(py / 16);
    const i = this.inBounds(tx, ty) ? this.idx(tx, ty) : 0;
    let g = this.ground[i]!;
    if (this.flags[i]! & F.Bridge) return { speed: 1.05, rough: 0, surface: 'wood', water: false, deep: false, g: G.WoodFloor };
    const def = GROUND[g]!;
    return { speed: def.speed, rough: def.rough, surface: def.surface, water: !!def.water, deep: g === G.DeepWater, g };
  }

  /** Find the nearest tile matching a predicate within radius (tiles). */
  findNear(tx: number, ty: number, radius: number, pred: (x: number, y: number) => boolean): { x: number; y: number } | null {
    for (let r = 0; r <= radius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = tx + dx;
          const y = ty + dy;
          if (this.inBounds(x, y) && pred(x, y)) return { x, y };
        }
      }
    }
    return null;
  }

  /** Line of sight between two pixel points (blocked by buildings, boulders, cliffs, trees). */
  lineOfSight(ax: number, ay: number, bx: number, by: number): boolean {
    const d = Math.hypot(bx - ax, by - ay);
    const steps = Math.ceil(d / 8);
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      const tx = Math.floor(x / 16);
      const ty = Math.floor(y / 16);
      if (!this.inBounds(tx, ty)) return false;
      const i = this.idx(tx, ty);
      if (this.ground[i] === G.Cliff) return false;
      if (this.buildingAt[i] && !(this.flags[i]! & F.Interior)) return false;
      const o = this.obj[i]!;
      if (o === O.Boulder || o === O.Hoodoo || o === O.Crate || o === O.Wagon) return false;
    }
    return true;
  }
}
