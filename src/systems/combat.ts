/**
 * Combat: hitscan firearms with spread/recoil/ammo, melee, lasso, and the
 * enemy AI loop (cover seeking, flanking, suppressing fire, retreat,
 * surrender). Gunshots emit noise that animals, horses and witnesses hear.
 */
import { Rng } from '../core/rng.ts';
import { clamp } from '../core/math.ts';
import { getItem } from '../data/items.ts';
import type { Animal } from '../entities/animal.ts';
import type { Entity } from '../entities/entity.ts';
import type { HorseEntity } from '../entities/horse.ts';
import type { Npc } from '../entities/npc.ts';
import type { Player } from '../entities/player.ts';
import type { Game } from '../game.ts';
import { OBJ } from '../world/tiles.ts';
import { L, tr } from '../core/i18n.ts';

type Hittable = Npc | Animal | HorseEntity | Player;

export class CombatSystem {
  game: Game;
  rng = new Rng(777);
  /** 0..1 how "hot" combat is around the player (music, UI). */
  tension = 0;
  constructor(game: Game) {
    this.game = game;
  }

  update(dt: number): void {
    let hostiles = 0;
    for (const e of this.game.spatial.query(this.game.player.x, this.game.player.y, 400)) {
      if ((e.kind === 'npc' && (e as Npc).hostile && (e as Npc).alive) || (e.kind === 'animal' && (e as Animal).hostile && (e as Animal).alive)) hostiles++;
    }
    this.tension = clamp(this.tension + (hostiles > 0 ? dt : -dt * 0.3), 0, 1);
  }

  /** Player pulls the trigger toward (tx,ty) in world px. */
  playerFire(p: Player, tx: number, ty: number): void {
    const g = this.game;
    const id = p.weapon;
    if (!id) return;
    const w = getItem(id).weapon!;
    if (w.kind === 'lasso') {
      p.fireCooldown = w.fireDelay;
      this.throwLasso(p, tx, ty);
      return;
    }
    if (w.melee || w.kind === 'knife' || w.kind === 'fists') {
      p.fireCooldown = w.fireDelay;
      this.melee(p, w.damage, w.range);
      return;
    }
    const clip = p.clip[id] ?? 0;
    if (clip <= 0) {
      p.fireCooldown = 0.3;
      g.audio.play('dryfire', p.x, p.y);
      p.startReload(g);
      return;
    }
    p.clip[id] = clip - 1;
    p.fireCooldown = w.fireDelay;
    // Spread: base + recoil + movement + mounted gait.
    const moving = Math.hypot(p.vx, p.vy) > 10 ? 0.04 : 0;
    const mounted = p.mount ? 0.03 + (p.mount.speed / 150) * 0.08 : 0;
    const spread = w.spread * (p.aiming ? 1 : 2.2) + p.spread + moving + mounted + (p.crouching ? -0.01 : 0);
    p.spread = Math.min(0.35, p.spread + w.recoil);
    const ox = p.x;
    const oy = p.y - (p.mount ? 22 : 11);
    const base = Math.atan2(ty - oy, tx - ox);
    let struck: Entity | null = null;
    for (let i = 0; i < (w.pellets ?? 1); i++) {
      const a = base + (this.rng.next() - 0.5) * 2 * Math.max(0.005, spread);
      struck = this.hitscan(ox, oy, a, w.range, w.damage, p, w.kind === 'bow') ?? struck;
    }
    // Readable feedback even with the sound off (phones on silent): a word over what you hit, or where the shot went.
    if (struck) g.renderer.spawn({ x: struck.x, y: struck.y - 18, kind: 'text', text: 'Hit', color: '#ffd27a', vx: 0, vy: -14, life: 0.8, max: 0.8, size: 1 });
    else if (Math.hypot(tx - ox, ty - oy) < w.range) g.renderer.spawn({ x: tx, y: ty - 6, kind: 'text', text: 'Miss', color: '#d8d0c0', vx: 0, vy: -10, life: 0.6, max: 0.6, size: 1 });
    g.renderer.spawn({ x: ox + Math.cos(base) * 8, y: oy + Math.sin(base) * 8, kind: 'muzzle', color: '#ffe0a0', life: 0.1, max: 0.1, size: 4 });
    g.renderer.spawn({ x: ox + Math.cos(base) * 9, y: oy + Math.sin(base) * 9, kind: 'smoke', color: '#d8d4cc', vx: Math.cos(base) * 10, vy: -6, life: 0.9, max: 0.9, size: 2 });
    g.renderer.shake(w.kind === 'rifle' || w.kind === 'shotgun' ? 2 : 1);
    if (w.kind !== 'bow') {
      g.audio.gunshot(p.x, p.y, w.kind);
      g.noise(p.x, p.y, w.noise, 'gunshot', 'player');
    } else g.audio.play('jump', p.x, p.y);
  }

  /** Instant-hit ray; first entity or wall stops it. */
  hitscan(ox: number, oy: number, a: number, range: number, damage: number, shooter: Entity, arrow = false): Entity | null {
    const g = this.game;
    const W = g.world;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const candidates = g.spatial.query(ox + dx * range * 0.5, oy + dy * range * 0.5, range * 0.5 + 20);
    let hit: Entity | null = null;
    let endT = range;
    for (let t = 6; t < range; t += 4) {
      const x = ox + dx * t;
      const y = oy + dy * t;
      const tx = Math.floor(x / 16);
      const ty = Math.floor(y / 16);
      const o = W.objAt(tx, ty);
      if (W.buildingAt[W.idx(tx, ty)] && !W.insideBuilding(x, y) && !W.insideBuilding(ox, oy)) {
        endT = t;
        break;
      }
      if (W.groundAt(tx, ty) === 21) {
        endT = t;
        break;
      }
      if (o && OBJ[o]!.solid && OBJ[o]!.tall && (o === 11 || o === 26 || o === 27 || o === 32 || o === 46 || o === 28) && this.rng.chance(0.85)) {
        endT = t;
        break;
      }
      for (const e of candidates) {
        if (e === shooter || e.dead) continue;
        if (shooter.kind === 'player' && (shooter as Player).mount === e) continue;
        if (e.kind === 'horse' && (e as HorseEntity).rider === shooter) continue;
        // NPC allies don't shoot through each other (same gang, or both lawmen).
        if (shooter.kind === 'npc' && e.kind === 'npc') {
          const a = shooter as Npc;
          const b = e as Npc;
          if ((a.tag && a.tag === b.tag) || (a.hostile && b.hostile) || (!a.hostile && !b.hostile)) continue;
        }
        const alive = (e as { alive?: boolean }).alive !== false;
        if (!alive) continue;
        const cy = e.kind === 'horse' ? e.y - 14 : e.kind === 'animal' ? e.y - 6 : e.y - 10;
        const r = e.kind === 'horse' ? 10 : e.kind === 'animal' ? Math.max(5, e.radius) : 6;
        if ((x - e.x) ** 2 + (y - cy) ** 2 < r * r) {
          hit = e;
          endT = t;
          break;
        }
      }
      if (hit) break;
    }
    const ex = ox + dx * endT;
    const ey = oy + dy * endT;
    if (!arrow) g.renderer.tracers.push({ x1: ox, y1: oy, x2: ex, y2: ey, t: 0.08 });
    else g.renderer.tracers.push({ x1: ox + dx * Math.max(0, endT - 12), y1: oy + dy * Math.max(0, endT - 12), x2: ex, y2: ey, t: 0.25 });
    if (hit) {
      const falloff = 1 - Math.min(0.5, endT / range * 0.5);
      this.damage(hit as Hittable, damage * falloff, shooter);
    } else {
      g.renderer.dust(ex, ey, '#b8a080', 3);
    }
    return hit;
  }

  damage(target: Hittable, amount: number, source: Entity): void {
    const g = this.game;
    const byPlayer = source.kind === 'player' || (source.kind === 'horse' && (source as HorseEntity).rider?.kind === 'player');
    g.audio.play('hit', target.x, target.y);
    if (target.kind === 'npc') {
      const n = target as Npc;
      const wasHostile = n.hostile;
      n.hurt(amount, g, byPlayer);
      if (byPlayer && !wasHostile && n.alive) g.law.reportCrime('assault', n.x, n.y, n.id);
    } else if (target.kind === 'animal') (target as Animal).hurt(amount, g, byPlayer);
    else if (target.kind === 'horse' && (target as HorseEntity).npcRiderLook && this.rng.chance(0.6)) {
      // The bullet takes the rider, not the horse.
      const rider = this.game.dismountNpcRider(target as HorseEntity);
      if (rider) {
        rider.hurt(amount, g, byPlayer);
        if (byPlayer && rider.alive) g.law.reportCrime('assault', rider.x, rider.y, rider.id);
      }
    } else if (target.kind === 'horse') {
      const h = target as HorseEntity;
      if (h.npcRiderLook) this.game.dismountNpcRider(h);
      h.data.health -= amount * 0.7;
      h.data.stress = 100;
      g.injureHorse(h, 'gunshot', amount * 0.6, 'shot');
      // Story horses (tagged for a quest) survive stray NPC fire, so a gunfight can't silently break the quest.
      if (!byPlayer && h.data.tag) h.data.health = Math.max(1, h.data.health);
      if (h.data.health <= 0) g.killHorse(h, byPlayer ? 'shot by you' : 'shot');
      else if (h.rider) h.throwRider(g, 'was shot');
      if (byPlayer && h.data.owner !== 'player' && h.data.owner !== 'wild') g.law.reportCrime('animalCruelty', h.x, h.y);
    } else if (target.kind === 'player') {
      (target as Player).damage(amount, g, (source as Npc).name ?? 'gunfire');
    }
  }

  melee(p: Player, damage: number, range: number): void {
    const g = this.game;
    const target = g.spatial.nearest(p.x + Math.cos(p.angle) * 12, p.y + Math.sin(p.angle) * 12, range + 8, (e) => (e.kind === 'npc' || e.kind === 'animal') && (e as { alive: boolean }).alive);
    p.act(0.3, 'interact');
    if (target) this.damage(target as Hittable, damage, p);
  }

  throwLasso(p: Player, tx: number, ty: number): void {
    const g = this.game;
    const target = g.spatial.nearest(tx, ty, 26, (e) => (e.kind === 'horse' && !(e as HorseEntity).rider) || (e.kind === 'npc' && ((e as Npc).state === 'surrender' || (e as Npc).state === 'flee' || (e as Npc).state === 'cower')));
    g.renderer.tracers.push({ x1: p.x, y1: p.y - 12, x2: tx, y2: ty, t: 0.3 });
    if (!target || Math.hypot(target.x - p.x, target.y - p.y) > 120) {
      g.notify('The loop falls short.', 'info');
      return;
    }
    if (target.kind === 'horse') g.taming.lassoed(target as HorseEntity);
    else {
      const n = target as Npc;
      n.setState('hogtied');
      n.hostile = false;
      g.notify(tr`You hogtie ${n.name}.`, 'info');
      g.bus.emit('flag', { key: `hogtied_${n.id}`, value: true });
    }
  }

  /** NPC weapon fire at a target point. */
  npcFire(n: Npc, tx: number, ty: number): void {
    const g = this.game;
    const id = n.weapon;
    if (!id) return;
    const w = getItem(id).weapon!;
    if (n.clip <= 0) {
      n.reloadT = w.reloadTime;
      n.clip = w.clip;
      return;
    }
    n.clip--;
    n.fireCd = w.fireDelay + this.rng.range(0.3, 1.1);
    const p = g.player;
    const dist = Math.hypot(tx - n.x, ty - n.y);
    const moving = Math.hypot(p.vx, p.vy) + (p.mount ? Math.abs(p.mount.speed) : 0);
    const inacc = (1 - n.combat!.accuracy) * 0.25 + dist / 2000 + moving / 900 + (p.crouching ? 0.03 : 0);
    const oy = n.y - 11;
    const base = Math.atan2(ty - oy, tx - n.x);
    for (let i = 0; i < (w.pellets ?? 1); i++) this.hitscan(n.x, oy, base + (this.rng.next() - 0.5) * 2 * (w.spread + inacc), w.range, w.damage * 0.75, n);
    g.audio.gunshot(n.x, n.y, w.kind);
    g.noise(n.x, n.y, w.noise, 'gunshot', n.id);
    g.renderer.spawn({ x: n.x + Math.cos(base) * 8, y: oy + Math.sin(base) * 8, kind: 'muzzle', color: '#ffe0a0', life: 0.06, max: 0.06, size: 3 });
  }

  /** Enemy and lawman combat behaviour. */
  npcCombat(n: Npc, dt: number): void {
    const g = this.game;
    const p = g.player;
    if (!p.alive) {
      n.setState('schedule');
      n.hostile = false;
      return;
    }
    const dx = p.x - n.x;
    const dy = p.y - n.y;
    const d = Math.hypot(dx, dy);
    const los = g.world.lineOfSight(n.x, n.y - 8, p.x, p.y - 8);
    if (los) n.lastSeenPlayer = g.time;
    if (n.reloadT > 0) n.reloadT -= dt;

    // Lawmen first try to arrest.
    if (n.state === 'pursue') {
      if (d > 50) n.goTo(p.x, p.y, dt, g, 85);
      else {
        n.vx = n.vy = 0;
        n.faceTo(p.x, p.y);
        n.anim = 'shoot';
        if (n.stateT > 0.3 && !n.bubble) n.say('Hands where I can see \'em! You\'re under arrest.', 4);
        if (p.holstered && Math.hypot(p.vx, p.vy) < 5 && !p.mount && n.stateT > 3) g.law.arrest(n);
      }
      if (!p.holstered && (p.aiming || p.fireCooldown > 0)) {
        n.hostile = true;
        n.setState('combat');
        n.say('Drop it!');
      }
      if (n.stateT > 20 && d > 400) n.setState('schedule');
      return;
    }

    // Morale: retreat or surrender when badly hurt.
    const courage = n.combat?.courage ?? 0.5;
    if (n.health < n.maxHealth * 0.3 && n.morale < courage) {
      if (d < 160 && this.rng.chance(dt * 0.8)) {
        n.setState('surrender');
        n.hostile = false;
        n.say(this.rng.pick(['I give up! Don\'t shoot!', 'Alright, alright! I\'m done!', 'Mercy, mister — I yield!']), 4);
        g.bus.emit('flag', { key: `surrendered_${n.id}`, value: true });
        return;
      }
      if (this.rng.chance(dt * 0.5)) {
        n.setState('flee');
        return;
      }
    }
    // Choose a position: cover near us with a view of the player, or flank.
    n.stateT += 0;
    if (!n.coverPos || this.rng.chance(dt * 0.25)) n.coverPos = this.findCover(n, p.x, p.y);
    const range = n.weapon ? getItem(n.weapon).weapon!.range : 150;
    if (n.coverPos && Math.hypot(n.coverPos.x - n.x, n.coverPos.y - n.y) > 6) n.goTo(n.coverPos.x, n.coverPos.y, dt, g, 70);
    else if (!los || d > range * 0.85) n.goTo(p.x, p.y, dt, g, 65);
    else if (d < 50) {
      // Too close: back off sideways.
      n.moveDir(-dy / d, dx / d, 55, dt, g);
      n.anim = 'run';
    } else {
      n.vx *= 0.8;
      n.vy *= 0.8;
      n.anim = 'idle';
    }
    n.faceTo(p.x, p.y);
    if (los && d < range && n.fireCd <= 0 && n.reloadT <= 0) {
      const tgt = p.mount ? { x: p.x, y: p.y - 18 } : { x: p.x, y: p.y - 8 };
      this.npcFire(n, tgt.x, tgt.y);
      if (this.rng.chance(0.1)) n.say(this.rng.pick(['There! By the rocks!', 'Flank \'em!', 'Keep shootin\'!', 'Pin \'em down!', 'Reloading!']), 2);
    }
  }

  /** Find a tile next to solid cover facing away from the threat. */
  findCover(n: Npc, fx: number, fy: number): { x: number; y: number } | null {
    const W = this.game.world;
    const tx0 = Math.floor(n.x / 16);
    const ty0 = Math.floor(n.y / 16);
    let best: { x: number; y: number } | null = null;
    let bestScore = -Infinity;
    for (let dy = -6; dy <= 6; dy++)
      for (let dx = -6; dx <= 6; dx++) {
        const tx = tx0 + dx;
        const ty = ty0 + dy;
        const o = W.objAt(tx, ty);
        if (!o || !OBJ[o]!.solid) continue;
        // Stand on the side of the obstacle away from the threat.
        const ax = tx * 16 + 8 - fx;
        const ay = ty * 16 + 8 - fy;
        const al = Math.hypot(ax, ay) || 1;
        const sx = tx * 16 + 8 + (ax / al) * 14;
        const sy = ty * 16 + 10 + (ay / al) * 14;
        if (W.blockedPx(sx, sy)) continue;
        const distThreat = Math.hypot(sx - fx, sy - fy);
        const score = -Math.hypot(sx - n.x, sy - n.y) * 0.6 - Math.abs(distThreat - 140) * 0.3;
        if (score > bestScore) {
          bestScore = score;
          best = { x: sx, y: sy };
        }
      }
    return best;
  }
}
