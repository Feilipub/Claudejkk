/**
 * Inventory: stackable item counts with weight capacity. Used for the
 * player's satchel, horse saddlebags, shop stock and camp storage.
 */
import { getItem } from '../data/items.ts';

export class Inventory {
  items: Record<string, number> = {};
  capacity: number;
  constructor(capacity: number, items?: Record<string, number>) {
    this.capacity = capacity;
    if (items) this.items = { ...items };
  }
  count(id: string): number {
    return this.items[id] ?? 0;
  }
  has(id: string, qty = 1): boolean {
    return this.count(id) >= qty;
  }
  get weight(): number {
    let w = 0;
    for (const [id, q] of Object.entries(this.items)) w += getItem(id).weight * q;
    return Math.round(w * 10) / 10;
  }
  /** Can we add qty of item without exceeding weight capacity or stack size? */
  canAdd(id: string, qty = 1): boolean {
    const def = getItem(id);
    if (this.count(id) + qty > def.stack) return false;
    return this.weight + def.weight * qty <= this.capacity + 1e-6;
  }
  /** Add up to qty; returns the number actually added. */
  add(id: string, qty = 1): number {
    const def = getItem(id);
    let n = 0;
    while (n < qty && this.count(id) < def.stack && this.weight + def.weight <= this.capacity + 1e-6) {
      this.items[id] = this.count(id) + 1;
      n++;
    }
    return n;
  }
  /** Add ignoring weight (quest rewards, ammo) but respecting stack. */
  force(id: string, qty = 1): number {
    const def = getItem(id);
    const n = Math.min(qty, def.stack - this.count(id));
    if (n > 0) this.items[id] = this.count(id) + n;
    return n;
  }
  remove(id: string, qty = 1): boolean {
    if (!this.has(id, qty)) return false;
    this.items[id] = this.count(id) - qty;
    if (this.items[id]! <= 0) delete this.items[id];
    return true;
  }
  /** Items in a category, sorted by name. */
  byCategory(cat: string): [string, number][] {
    return Object.entries(this.items)
      .filter(([id]) => getItem(id).category === cat)
      .sort((a, b) => getItem(a[0]).name.localeCompare(getItem(b[0]).name));
  }
  entries(): [string, number][] {
    return Object.entries(this.items).filter(([, q]) => q > 0);
  }
}
