/**
 * Entity base and spatial hash. Every moving thing in the world (player,
 * horses, NPCs, animals, projectiles) is an Entity; the spatial hash gives
 * O(1)-ish neighbourhood queries for perception and interaction.
 */
import type { Game } from '../game.ts';
import type { Renderer } from '../render/renderer.ts';

export type EntityKind = 'player' | 'horse' | 'npc' | 'animal' | 'projectile' | 'pickup' | 'effect' | 'campfire' | 'corpse';

let NEXT_ID = 1;

export abstract class Entity {
  id: string;
  kind: EntityKind;
  x = 0;
  y = 0;
  /** Radius used for collision and picking (px). */
  radius = 5;
  alive = true;
  /** Removed at end of frame. */
  dead = false;
  /** Entities beyond simulation radius update in "low" tier. */
  tier: 'full' | 'low' | 'frozen' = 'full';
  constructor(kind: EntityKind, id?: string) {
    this.kind = kind;
    this.id = id ?? `${kind}_${NEXT_ID++}`;
  }
  abstract update(dt: number, game: Game): void;
  abstract draw(r: Renderer, game: Game): void;
  /** Y value used for depth sorting (feet). */
  get sortY(): number {
    return this.y;
  }
  /** Lightweight update for distant entities. */
  updateLow(dt: number, game: Game): void {
    void dt;
    void game;
  }
}

export class SpatialHash {
  private cells = new Map<number, Entity[]>();
  private size: number;
  constructor(cellSize = 128) {
    this.size = cellSize;
  }
  private key(cx: number, cy: number): number {
    return (cy + 1000) * 4096 + (cx + 1000);
  }
  rebuild(entities: Iterable<Entity>): void {
    this.cells.clear();
    for (const e of entities) {
      if (e.dead) continue;
      const k = this.key(Math.floor(e.x / this.size), Math.floor(e.y / this.size));
      let arr = this.cells.get(k);
      if (!arr) this.cells.set(k, (arr = []));
      arr.push(e);
    }
  }
  /** All entities within radius of (x,y), optionally filtered by kind. */
  query(x: number, y: number, radius: number, kind?: EntityKind, out: Entity[] = []): Entity[] {
    out.length = 0;
    const r2 = radius * radius;
    const x0 = Math.floor((x - radius) / this.size);
    const x1 = Math.floor((x + radius) / this.size);
    const y0 = Math.floor((y - radius) / this.size);
    const y1 = Math.floor((y + radius) / this.size);
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const arr = this.cells.get(this.key(cx, cy));
        if (!arr) continue;
        for (const e of arr) {
          if (kind && e.kind !== kind) continue;
          if ((e.x - x) ** 2 + (e.y - y) ** 2 <= r2) out.push(e);
        }
      }
    return out;
  }
  nearest(x: number, y: number, radius: number, pred: (e: Entity) => boolean): Entity | null {
    let best: Entity | null = null;
    let bd = radius * radius;
    for (const e of this.query(x, y, radius)) {
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bd && pred(e)) {
        bd = d;
        best = e;
      }
    }
    return best;
  }
}
