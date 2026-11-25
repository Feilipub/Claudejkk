/**
 * Dynamic event: horse thieves. A horse left untied and unwatched near a town
 * at night (or anywhere, rarely) may be stolen. The thief rides off; you can
 * chase it down, or whistle — a horse bonded at level 3+ may throw the thief
 * and come back to you. If the thief gets clean away, the horse turns up a
 * day later at a distant livery, where you can reclaim it.
 */
import { Rng } from '../core/rng.ts';
import { getBreed } from '../data/breeds.ts';
import { SETTLEMENTS } from '../data/world.ts';
import { completeLook, Npc } from '../entities/npc.ts';
import type { HorseEntity } from '../entities/horse.ts';
import type { Game } from '../game.ts';
import { grantBond } from '../horse/bonding.ts';
import { addHistory } from '../horse/horse.ts';
import { bondLevel } from '../horse/stats.ts';
import { L, tr } from '../core/i18n.ts';

export class HorseThiefSystem {
  game: Game;
  rng = new Rng(9091);
  theft: { horse: HorseEntity; heading: number; t: number } | null = null;
  /** Horse waiting at a far livery after a successful theft. */
  impounded: { horseId: string; settlementId: string; day: number } | null = null;
  private checkT = 30;
  constructor(game: Game) {
    this.game = game;
  }

  update(dt: number): void {
    const g = this.game;
    const p = g.player;
    if (this.theft) {
      const t = this.theft;
      const h = t.horse;
      t.t += dt;
      // Ride hard away from the player.
      const tx = h.x + Math.cos(t.heading) * 200;
      const ty = h.y + Math.sin(t.heading) * 200;
      h.driveTo(tx, ty, h.data.stamina > 15 ? 'gallop' : 'canter', dt, g);
      if (h.speed < 10 && t.t > 3) t.heading += this.rng.range(1, 2.5);
      const d = Math.hypot(h.x - p.x, h.y - p.y);
      // Caught up with them: the thief bails out and runs.
      if (d < 50) this.bail('You run the thief down — they jump off and scramble away!');
      else if (d > 2600 || t.t > 240) this.escape();
      return;
    }
    if (this.impounded) {
      const h = g.horses.get(this.impounded.horseId);
      if (!h) this.impounded = null;
      else if (Math.hypot(h.x - p.x, h.y - p.y) < 60) {
        this.impounded = null;
        h.data.tiedAt = null;
        g.waypoint = null;
        grantBond(h.data, 'stressSurvived', g.clock.day);
        g.notify(tr`${h.data.name} nickers when it sees you. The liveryman doesn't argue with your bill of sale.`, 'good');
        addHistory(h.data, g.clock.day, 'Reclaimed by you after being stolen.');
      }
    }
    this.checkT -= dt;
    if (this.checkT > 0) return;
    this.checkT = 20;
    const h = g.mainHorse();
    if (!h || h.rider || h.leading || h.data.tag === 'rental' || g.flags.thief_cooldown_day === g.clock.day) return;
    const d = Math.hypot(h.x - p.x, h.y - p.y);
    if (d < 360) return;
    const nearTown = SETTLEMENTS.some((s) => (s.kind === 'town' || s.kind === 'city' || s.kind === 'mining') && Math.hypot(s.x * 16 - h.x, s.y * 16 - h.y) < 600);
    const tied = !!h.data.tiedAt;
    // Tied horses in town in daylight are safe; untied horses at night are tempting.
    let chance = (g.clock.isNight ? 0.04 : 0.008) * (nearTown ? 2 : 1) * (tied ? 0.25 : 1);
    if (!g.clock.isNight && tied && nearTown) chance = 0;
    if (this.rng.chance(chance)) this.steal(h);
  }

  /** Public for tests/debug: start a theft of this horse now. */
  steal(h: HorseEntity): void {
    const g = this.game;
    g.setFlag('thief_cooldown_day', g.clock.day);
    h.data.tiedAt = null;
    h.externallyDriven = true;
    h.npcRiderLook = completeLook({ bandana: '#2a2a2a', coat: '#2a2520' }, new Rng(this.rng.int(1, 1e9)), 'outlaw');
    this.theft = { horse: h, heading: Math.atan2(h.y - g.player.y, h.x - g.player.x), t: 0 };
    const seen = Math.hypot(h.x - g.player.x, h.y - g.player.y) < 900;
    g.notify(seen ? tr`A thief is riding off on ${h.data.name}! Chase them or whistle [H].` : tr`You hear a distant whinny. Something's wrong with ${h.data.name}.`, 'bad');
    g.audio.neigh(h.x, h.y, true);
    addHistory(h.data, g.clock.day, 'Stolen by a horse thief.');
  }

  /** Called from Game.whistle while a theft is in progress. Returns true if handled. */
  onWhistle(): boolean {
    const t = this.theft;
    if (!t) return false;
    const g = this.game;
    const h = t.horse;
    const bond = bondLevel(h.data);
    const d = Math.hypot(h.x - g.player.x, h.y - g.player.y);
    const range = [180, 320, 520, 820, 1400][bond - 1]!;
    if (d > range * 1.4) {
      g.notify(tr`${h.data.name} is too far away to hear you.`, 'bad');
      return true;
    }
    if (bond >= 3 && this.rng.chance(0.3 + bond * 0.12)) {
      this.bail(tr`${h.data.name} hears you, plants its feet and bucks the thief into the dirt!`);
      h.brain = { state: 'come', target: { x: g.player.x, y: g.player.y }, gait: 'canter', duration: 12, label: 'Coming back to you' };
      h.brainTimer = 12;
      grantBond(h.data, 'stressSurvived', g.clock.day);
      addHistory(h.data, g.clock.day, 'Threw a horse thief and came back to you.');
      return true;
    }
    g.notify(bond < 3 ? `${h.data.name} hesitates, but the thief spurs it on. (A stronger bond might have helped.)` : `${h.data.name} fights the reins but the thief holds on!`, 'bad');
    return true;
  }

  private bail(msg: string): void {
    const g = this.game;
    const t = this.theft!;
    const h = t.horse;
    h.externallyDriven = false;
    h.npcRiderLook = null;
    h.speed = 0;
    h.data.stress = 80;
    this.theft = null;
    const n = new Npc(
      { id: `thief_${Math.floor(g.time)}`, name: 'Horse Thief', occupation: 'outlaw', settlement: 'none', look: { bandana: '#2a2a2a', coat: '#2a2520' }, personality: ['nervous'], bio: '', combat: { health: 60, weapon: 'revolverCattleman', accuracy: 0.4, courage: 0.2 } },
      g,
    );
    n.x = h.x + 14;
    n.y = h.y + 6;
    n.tag = 'horse_thief';
    n.setState('flee');
    g.addEntity(n);
    g.notify(msg, 'good');
    g.audio.neigh(h.x, h.y, true);
  }

  private escape(): void {
    const g = this.game;
    const t = this.theft!;
    const h = t.horse;
    this.theft = null;
    h.externallyDriven = false;
    h.npcRiderLook = null;
    // The horse is sold on at a far-off livery; it'll be waiting there.
    const far = SETTLEMENTS.filter((s) => s.kind === 'mining' || s.kind === 'town' || s.kind === 'city').sort((a, b) => Math.hypot(b.x * 16 - g.player.x, b.y * 16 - g.player.y) - Math.hypot(a.x * 16 - g.player.x, a.y * 16 - g.player.y))[0]!;
    const stable = g.world.buildings.find((b) => b.settlementId === far.id && b.type === 'stable') ?? g.world.buildings.find((b) => b.settlementId === far.id)!;
    h.x = stable.doorX * 16 + 30;
    h.y = (stable.y + stable.h + 1) * 16;
    h.data.tiedAt = { x: h.x, y: h.y };
    h.speed = 0;
    this.impounded = { horseId: h.id, settlementId: far.id, day: g.clock.day };
    g.notify(tr`${h.data.name} is gone. Word may travel — keep your ears open.`, 'bad');
    setTimeout(() => g.notify(tr`A telegram: a ${L(getBreed(h.data.breedId).name).toLowerCase()} matching ${h.data.name} was sold at ${L(far.name)}. It's tied at the livery there.`, 'horse'), 20000);
    g.waypoint = { x: h.x, y: h.y };
  }
}
