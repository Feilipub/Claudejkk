/**
 * Camping: pitch a camp in the wilds (needs a bedroll on your horse or in
 * your pack, and somewhere sensible — not in town, not in water, not with
 * enemies around). The campfire is a light and warmth source, cooks raw
 * meat and fish, and lets you sleep, save and tend your horse. Camps persist
 * until broken.
 */
import { getItem } from '../data/items.ts';
import { Entity } from '../entities/entity.ts';
import { HorseEntity } from '../entities/horse.ts';
import type { Game } from '../game.ts';
import { grantBond } from '../horse/bonding.ts';
import type { Renderer } from '../render/renderer.ts';
import type { InteractTarget } from './interactions.ts';

export class Campfire extends Entity {
  fuel = 1;
  constructor(x: number, y: number) {
    super('campfire', 'campfire');
    this.x = x;
    this.y = y;
    this.radius = 8;
  }
  update(dt: number, game: Game): void {
    this.fuel = Math.max(0.25, this.fuel - dt * 0.002);
    if (Math.random() < dt * 8) game.renderer.spawn({ x: this.x + (Math.random() - 0.5) * 6, y: this.y - 3, kind: 'ember', color: '#ffb050', vx: (Math.random() - 0.5) * 6, vz: 18 + Math.random() * 12, life: 0.9, max: 0.9 });
    if (Math.random() < dt * 3) game.renderer.spawn({ x: this.x, y: this.y - 6, kind: 'smoke', color: '#b8b0a4', vx: game.weather.current.wind * 10, vz: 12, life: 2.5, max: 2.5, size: 2 });
    if (Math.random() < dt * 0.5) game.audio.play('fire', this.x, this.y);
  }
  draw(r: Renderer, game: Game): void {
    const t = game.time;
    // Stones, logs, flames.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      r.rect(this.x + Math.cos(a) * 6 - 1, this.y + Math.sin(a) * 3 - 1, 3, 2, i % 2 ? '#6e6a64' : '#8a857e');
    }
    r.rect(this.x - 5, this.y - 1, 10, 2, '#4a3020');
    r.rect(this.x - 2, this.y - 3, 4, 2, '#5a3a24');
    const h = 5 + Math.sin(t * 12) * 1.5;
    r.rect(this.x - 3, this.y - 2 - h * 0.5, 6, h * 0.6, '#d8501e');
    r.rect(this.x - 2, this.y - 3 - h * 0.8, 4, h * 0.7, '#f08a2a');
    r.rect(this.x - 1, this.y - 4 - h, 2, h * 0.6, '#ffd870');
    r.lights.push({ x: this.x, y: this.y - 4, r: 95 * this.fuel + 10, color: 'rgba(255,170,80,0.95)', flicker: true });
    // Bedroll and lean-to tarp beside the fire.
    r.rect(this.x + 14, this.y - 2, 12, 5, '#6d6350');
    r.rect(this.x + 14, this.y - 2, 3, 5, '#8a7a5e');
    r.rect(this.x - 30, this.y - 14, 18, 2, '#c9bc9a');
    r.rect(this.x - 30, this.y - 12, 2, 12, '#5a3e28');
    r.rect(this.x - 14, this.y - 12, 2, 12, '#5a3e28');
    r.rect(this.x - 29, this.y - 12, 16, 8, 'rgba(201,188,154,0.85)');
  }
}

export class CampSystem {
  game: Game;
  fire: Campfire | null = null;
  constructor(game: Game) {
    this.game = game;
  }

  /** Why the player can't camp here, or null if allowed. */
  blocker(): string | null {
    const g = this.game;
    const p = g.player;
    if (p.mount) return 'Dismount first.';
    // A bedroll in your pack, on a horse nearby, or bought and kept with your spare tack all count.
    const bedroll = p.inv.has('bedroll') || Object.entries(g.ownedGear).some(([id, n]) => n > 0 && id.startsWith('bedroll')) || [...g.horses.values()].some((h) => h.data.owner === 'player' && h.data.gear.bedroll && Math.hypot(h.x - p.x, h.y - p.y) < 200);
    if (!bedroll) return 'You need a bedroll (on your horse or in your pack) to make camp.';
    if (g.law.inTown(p.x, p.y) || g.world.insideBuilding(p.x, p.y)) return 'You can\'t make camp in town. Rent a room instead.';
    if (g.world.terrainAt(p.x, p.y).water) return 'Not in the water.';
    if (g.combat.tension > 0.2) return 'Not with enemies nearby.';
    if (g.law.isWanted(g.currentRegion) && g.law.get(g.currentRegion).level >= 3) return 'Too hot — the law is hunting you.';
    return null;
  }

  make(): void {
    const g = this.game;
    const b = this.blocker();
    if (b) {
      g.notify(b, 'info');
      return;
    }
    if (this.fire) this.fire.dead = true;
    const p = g.player;
    this.fire = new Campfire(p.x + Math.cos(p.angle) * 18, p.y + Math.sin(p.angle) * 10 + 4);
    g.addEntity(this.fire);
    g.player.act(2);
    g.notify('You pitch camp and get a fire going.', 'good');
    g.setFlag('made_camp', true);
    // Horses settle near camp.
    for (const h of g.horses.values()) {
      if (h.data.owner === 'player' && Math.hypot(h.x - p.x, h.y - p.y) < 250 && !h.rider) {
        h.data.tiedAt = { x: this.fire.x + 30, y: this.fire.y + 12 };
        grantBond(h.data, 'shelter', g.clock.day, 0.5);
      }
    }
    g.ui.openCamp();
  }

  break(): void {
    if (!this.fire) return;
    this.fire.dead = true;
    this.fire = null;
    for (const h of this.game.horses.values()) if (h.data.owner === 'player') h.data.tiedAt = null;
    this.game.notify('You kick dirt over the coals and pack up.', 'info');
  }

  near(): boolean {
    const p = this.game.player;
    return !!this.fire && Math.hypot(this.fire.x - p.x, this.fire.y - p.y) < 80;
  }

  /** Cook everything raw that can be cooked. */
  cookAll(): string {
    const g = this.game;
    const inv = g.player.inv;
    let n = 0;
    for (const [id, q] of inv.entries()) {
      const it = getItem(id);
      if (!it.cookTo) continue;
      for (let i = 0; i < q; i++) {
        inv.remove(id);
        inv.force(it.cookTo, 1);
        n++;
      }
    }
    if (n) {
      g.player.skills.gain('survival', n * 2);
      g.advanceTime(15 * n);
      g.audio.play('fire');
    }
    return n ? `You cook ${n} portion${n > 1 ? 's' : ''} over the coals.` : 'You have nothing raw to cook.';
  }

  target(): InteractTarget {
    const g = this.game;
    return {
      title: 'Campfire',
      x: this.fire?.x ?? g.player.x,
      y: (this.fire?.y ?? g.player.y) - 20,
      actions: [
        { label: 'Camp menu', run: () => g.ui.openCamp() },
        { label: 'Cook', run: () => g.notify(this.cookAll(), 'info') },
        { label: 'Break camp', run: () => this.break() },
      ],
    };
  }

  /** Horses resting near a campfire recover and feel sheltered. */
  update(): void {
    if (!this.fire) return;
    for (const h of this.game.horses.values()) {
      if (h instanceof HorseEntity && h.data.owner === 'player' && Math.hypot(h.x - this.fire.x, h.y - this.fire.y) < 120) {
        h.data.stress = Math.max(0, h.data.stress - 0.02);
      }
    }
  }
}
