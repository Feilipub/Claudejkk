/**
 * Horse entity: the living animal in the world. Runs the autonomous brain
 * when unridden, the riding controller when ridden, simulates needs every
 * frame, reacts to threats/noise, and renders its procedural sprite.
 */
import { Rng } from '../core/rng.ts';
import { approach, clamp, turnToward, wrapAngle } from '../core/math.ts';
import { BALANCE } from '../data/balance.ts';
import { getItem } from '../data/items.ts';
import { getSpecies } from '../data/wildlife.ts';
import type { Game } from '../game.ts';
import { decide, type BrainDecision, type HorseSenses } from '../horse/brain.ts';
import { grantBond, penalizeBond } from '../horse/bonding.ts';
import { injure, tickHorseNeeds } from '../horse/care.ts';
import { addHistory, type HorseData } from '../horse/horse.ts';
import { bondLevel, gaitIndex, hasTrait, maxStamina, rideStats, type Gait, type RideStats } from '../horse/stats.ts';
import { horseSprites, HW, GROUND_Y, type HorseAnim } from '../render/horseSprite.ts';
import { humanSprites, PW, type HumanLook } from '../render/humanSprite.ts';
import type { Renderer } from '../render/renderer.ts';
import { F, OBJ } from '../world/tiles.ts';
import { Entity } from './entity.ts';
import type { Player } from './player.ts';

const GAIT_LEVELS: Gait[] = ['halt', 'walk', 'trot', 'canter', 'gallop'];

export class HorseEntity extends Entity {
  data: HorseData;
  heading = 0;
  speed = 0;
  /** Selected gait level while ridden (1 walk .. 4 gallop). */
  gaitLevel = 1;
  /** Seconds the ridden horse has been pressing into an obstacle. */
  private bumpT = 0;
  rider: Player | null = null;
  /** Visual animation state. */
  anim: HorseAnim = 'idle';
  animT = 0;
  brain: BrainDecision = { state: 'idle', target: null, gait: 'halt', duration: 1, label: 'Standing quietly' };
  brainTimer = 0;
  rng: Rng;
  stats: RideStats;
  private statsTimer = 0;
  /** Special-action timers. */
  jumpT = 0;
  rearT = 0;
  buckT = 0;
  bolting = 0;
  /** Led on a rope by the player. */
  leading = false;
  calledAt = -999;
  private lastNoise: { x: number; y: number; level: number; kind: string; t: number } | null = null;
  private distAcc = 0;
  private stepAcc = 0;
  private spurCooldown = 0;
  private pendingHeading: number | null = null;
  private pendingTimer = 0;
  /** Pen (corral) bounds in px for stable/trader horses. */
  pen: { x: number; y: number; w: number; h: number } | null = null;
  herdId: string | null = null;
  isHerdLeader = false;
  /** Time spent with owner nearby (for passive bonding). */
  private togetherAcc = 0;
  /** NPC-owned horses idle by their owner. */
  ownerNpcId: string | null = null;
  displayHeading = 0;
  /** Seconds the owner has been away (for greeting whinnies on return). */
  private apartT = 0;
  /** AI-ridden horses (race rivals, travellers) show a rider and are steered externally. */
  npcRiderLook: HumanLook | null = null;
  externallyDriven = false;

  constructor(data: HorseData) {
    super('horse', data.id);
    this.data = data;
    this.x = data.x;
    this.y = data.y;
    this.radius = 7;
    this.rng = new Rng(data.appearance.patternSeed ^ 0x55aa);
    this.stats = rideStats(data);
    this.heading = this.rng.range(-Math.PI, Math.PI);
    this.displayHeading = this.heading;
  }

  get ridden(): boolean {
    return this.rider !== null;
  }

  /** Current gait derived from actual speed. */
  get gait(): Gait {
    const g = this.stats.gaitSpeed;
    const s = this.speed;
    if (s < -2) return 'back';
    if (s < 4) return 'halt';
    if (s < g.walk * 1.25) return 'walk';
    if (s < g.trot * 1.12) return 'trot';
    if (s < g.canter * 1.06) return 'canter';
    return 'gallop';
  }

  refreshStats(): void {
    this.stats = rideStats(this.data);
  }

  /** Called when gunfire or other loud noise happens nearby. */
  hearNoise(x: number, y: number, radius: number, kind: string, game: Game): void {
    const d = Math.hypot(x - this.x, y - this.y);
    if (d > radius) return;
    let level = (1 - d / radius) * (kind === 'gunshot' ? 0.9 : kind === 'thunder' ? 0.6 : 0.5);
    if (this.data.dislike === 'gunfire' && kind === 'gunshot') level *= 1.5;
    // Firing from the saddle right next to its head is the scariest thing.
    if (this.rider && kind === 'gunshot' && d < 20) {
      level = 0.75;
      if (this.rng.chance(0.15)) penalizeBond(this.data, 'gunfireNearHead');
    }
    this.lastNoise = { x, y, level, kind: kind === 'gunshot' ? 'gunfire' : kind, t: game.time };
    const stressGain = level * 40 * this.stats.fear;
    this.data.stress = clamp(this.data.stress + stressGain, 0, 100);
    if (!this.rider) this.brainTimer = 0;
  }

  update(dt: number, game: Game): void {
    const d = this.data;
    if (!d.alive) return;
    this.statsTimer -= dt;
    if (this.statsTimer <= 0) {
      this.refreshStats();
      this.statsTimer = 0.5;
    }
    this.spurCooldown = Math.max(0, this.spurCooldown - dt);
    // --- Needs simulation ------------------------------------------------------
    const gm = game.lastGameMinutes;
    const terrain = game.world.terrainAt(this.x, this.y);
    const region = game.world.regionAtPx(this.x, this.y);
    const temp = game.weather.temperature(region, game.clock.hour, game.world.heightPx(this.x, this.y));
    const sheltered = this.isSheltered(game);
    const owner = game.player;
    const companion = (owner && Math.hypot(owner.x - this.x, owner.y - this.y) < 200) || game.spatial.query(this.x, this.y, 160, 'horse').length > 1;
    tickHorseNeeds(d, {
      minutes: gm,
      day: game.clock.day,
      grazing: this.brain.state === 'graze' && this.speed < 2 && !this.rider,
      drinking: this.brain.state === 'drink' && terrain.water,
      resting: this.speed < 2 && (this.brain.state === 'rest' || this.brain.state === 'sleep' || this.brain.state === 'idle' || this.brain.state === 'tied'),
      stabled: false,
      temperature: temp,
      raining: game.weather.current.rain > 0.3,
      snowing: game.weather.current.snow > 0.3,
      sheltered,
      companionNear: !!companion,
    });
    // Stress decays.
    d.stress = Math.max(0, d.stress - BALANCE.horse.stressDecay * dt * (this.rider ? 0.8 : 1) * (hasTrait(d, 'calm') ? 1.5 : 1));
    // Passive bond from time together.
    if (d.owner === 'player' && owner && Math.hypot(owner.x - this.x, owner.y - this.y) < 120) {
      this.togetherAcc += gm;
      if (this.togetherAcc >= 60) {
        this.togetherAcc -= 60;
        grantBond(d, 'timeTogetherHour', game.clock.day);
      }
    }
    // A bonded horse greets you when you come back after a while apart.
    if (d.owner === 'player' && owner && !this.rider) {
      const dist = Math.hypot(owner.x - this.x, owner.y - this.y);
      if (dist > 400) this.apartT += dt;
      else if (dist < 70 && this.apartT > 45) {
        const lvl = bondLevel(d);
        if (lvl >= 2) {
          game.audio.neigh(this.x, this.y, false);
          game.notify(lvl >= 4 ? `${d.name} whinnies and trots to meet you, ears pricked.` : `${d.name} lifts its head and nickers at you.`, 'horse');
          if (lvl >= 4 && !d.tiedAt) {
            this.brain = { state: 'come', target: { x: owner.x, y: owner.y }, gait: 'trot', duration: 4, label: 'Greeting you' };
            this.brainTimer = 4;
          }
        }
        this.apartT = 0;
      } else if (dist < 70) this.apartT = 0;
    }
    // Predator perception.
    this.perceiveThreats(game);

    if (this.rider) this.updateRidden(dt, game);
    else if (!this.externallyDriven) this.updateBrain(dt, game);

    this.jumpT = Math.max(0, this.jumpT - dt);
    this.rearT = Math.max(0, this.rearT - dt);
    this.buckT = Math.max(0, this.buckT - dt);
    this.updateAnim(dt);
    d.x = this.x;
    d.y = this.y;
    // Footstep sounds.
    if (this.speed > 4 && game.isNearCamera(this.x, this.y, 300)) {
      this.stepAcc += dt * (this.gait === 'gallop' ? 7 : this.gait === 'canter' ? 5.5 : this.gait === 'trot' ? 4.5 : 3);
      if (this.stepAcc >= 1) {
        this.stepAcc = 0;
        game.audio.hoof(this.x, this.y, terrain.surface, this.gait, this.rider !== null);
        game.renderer.addPrint(this.x - Math.cos(this.heading) * (this.rng.chance(0.5) ? 8 : -6), this.y + 1, this.heading, 'hoof', terrain.surface);
        // Kicked-up ground: dust on dry ground, spray in water, puffs of powder in snow.
        const fast = this.gait === 'gallop' || this.gait === 'canter';
        const hx = this.x - Math.cos(this.heading) * 8;
        const hy = this.y + 1;
        const r = game.renderer;
        if (terrain.water) {
          for (let i = 0; i < (fast ? 5 : 2); i++)
            r.spawn({ x: hx + this.rng.range(-6, 6), y: hy, kind: 'splash', color: 'rgba(210,230,240,0.9)', vx: this.rng.range(-14, 14), vy: this.rng.range(-4, 4), vz: this.rng.range(14, 30), life: 0.45, max: 0.45, size: this.rng.chance(0.3) ? 2 : 1 });
        } else if (terrain.surface === 'snow') {
          if (fast || this.rng.chance(0.4)) r.dust(hx, hy, '#eef2f6', fast ? 3 : 1);
        } else if (fast && (terrain.surface === 'dirt' || terrain.surface === 'sand' || (terrain.surface === 'grass' && game.weather.current.rain < 0.2))) {
          const col = terrain.surface === 'sand' ? '#d8c090' : terrain.surface === 'grass' ? '#a89868' : '#b09070';
          r.dust(hx, hy, col, this.gait === 'gallop' ? 3 : 2);
        }
      }
    }
  }

  /** Lightweight off-screen update: needs only, no movement. */
  override updateLow(dt: number, game: Game): void {
    this.apartT += dt;
    tickHorseNeeds(this.data, {
      minutes: game.lastGameMinutes,
      day: game.clock.day,
      grazing: !this.pen && !this.data.tiedAt,
      drinking: false,
      resting: true,
      stabled: !!this.pen,
      temperature: 60,
      raining: false,
      snowing: false,
      sheltered: true,
      companionNear: true,
    });
    void dt;
  }

  private isSheltered(game: Game): boolean {
    const W = game.world;
    if (W.insideBuilding(this.x, this.y)) return true;
    const tx = Math.floor(this.x / 16);
    const ty = Math.floor(this.y / 16);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const o = W.objAt(tx + dx, ty + dy);
        if (o && OBJ[o]!.shelter) return true;
      }
    return false;
  }

  private perceiveThreats(game: Game): void {
    const near = game.spatial.query(this.x, this.y, 220, 'animal');
    let best: { x: number; y: number; level: number; kind: string } | null = null;
    for (const e of near) {
      const a = e as unknown as { speciesId: string; alive: boolean; x: number; y: number; hostile: boolean };
      if (!a.alive) continue;
      const sp = getSpecies(a.speciesId);
      if (sp.horseFear <= 0) continue;
      const dd = Math.hypot(a.x - this.x, a.y - this.y);
      const lvl = sp.horseFear * (1 - dd / 220) * (a.hostile ? 1.3 : 1);
      if (!best || lvl > best.level) best = { x: a.x, y: a.y, level: lvl, kind: sp.name.toLowerCase() };
    }
    if (best && best.level > 0.15) {
      const gain = best.level * 18 * this.stats.fear * game.dt;
      this.data.stress = clamp(this.data.stress + gain, 0, 100);
      this.lastNoise = { ...best, t: game.time };
    }
  }

  private senses(game: Game): HorseSenses {
    const W = game.world;
    const p = game.player;
    const isOwner = this.data.owner === 'player' && p && p.alive;
    const tx = Math.floor(this.x / 16);
    const ty = Math.floor(this.y / 16);
    const waterTile = W.findNear(tx, ty, 10, (x, y) => {
      const t = W.terrainAt(x * 16 + 8, y * 16 + 8);
      return t.water && !t.deep && !(W.flagAt(x, y) & F.Bridge);
    });
    const shelterTile = game.weather.current.rain > 0.5 || game.weather.current.snow > 0.5 ? W.findNear(tx, ty, 12, (x, y) => !!OBJ[W.objAt(x, y)]?.shelter) : null;
    const other = game.spatial.nearest(this.x, this.y, 200, (e) => e !== this && e.kind === 'horse');
    const threat = this.lastNoise && game.time - this.lastNoise.t < 4 ? this.lastNoise : null;
    let herdLeader: { x: number; y: number } | null = null;
    if (this.herdId && !this.isHerdLeader) {
      const l = game.spatial.nearest(this.x, this.y, 400, (e) => e instanceof HorseEntity && e.herdId === this.herdId && e.isHerdLeader);
      if (l) herdLeader = { x: l.x + this.rng.range(-30, 30), y: l.y + this.rng.range(-30, 30) };
    }
    return {
      x: this.x,
      y: this.y,
      owner: isOwner ? { x: p.x, y: p.y, dist: Math.hypot(p.x - this.x, p.y - this.y), mounted: !!p.mount } : null,
      threat,
      water: waterTile ? { x: waterTile.x * 16 + 8, y: waterTile.y * 16 + 8 } : null,
      canGrazeHere: !!W.terrainAt(this.x, this.y) && isGrazeable(W, this.x, this.y),
      shelter: shelterTile ? { x: shelterTile.x * 16 + 8, y: shelterTile.y * 16 + 14 } : null,
      otherHorse: other ? { x: other.x, y: other.y } : null,
      novelty: null,
      night: game.clock.isNight,
      storm: game.weather.current.rain > 0.6 || game.weather.current.snow > 0.6,
      tied: !!this.data.tiedAt,
      leading: this.leading,
      called: game.time - this.calledAt < 1,
      pen: this.pen,
      herdLeader,
    };
  }

  private updateBrain(dt: number, game: Game): void {
    this.brainTimer -= dt;
    // Tie state changed under the brain (tied or untied by the player): rethink now so the HUD label is true.
    if (this.brain.state === 'tied' ? !this.data.tiedAt : !!this.data.tiedAt && this.brain.state !== 'spooked') this.brainTimer = 0;
    // A sleeping horse wakes when its owner walks up to it (so care actions never happen "asleep").
    if (this.brain.state === 'sleep' && this.data.owner === 'player' && Math.hypot(game.player.x - this.x, game.player.y - this.y) < 30) this.wake('Awake');
    if (this.rearT > 0) {
      this.speed = approach(this.speed, 0, 200 * dt);
      return;
    }
    if (this.brainTimer <= 0) {
      const prev = this.brain.state;
      this.brain = decide(this.data, this.senses(game), this.rng);
      this.brainTimer = this.brain.duration;
      if (this.brain.state === 'spooked') {
        this.rearT = 0.9;
        game.audio.neigh(this.x, this.y, true);
      } else if (this.brain.state === 'come' && prev !== 'come') {
        game.audio.neigh(this.x, this.y, false);
      } else if (this.brain.state === 'flee' && prev !== 'flee' && this.rng.chance(0.5)) {
        game.audio.neigh(this.x, this.y, true);
      }
      if (this.brain.state === 'come' && this.data.owner === 'player') game.notify(`${this.data.name} heard your whistle.`, 'horse');
    }
    const b = this.brain;
    let target = b.target;
    if ((b.state === 'come' || b.state === 'lead' || b.state === 'follow') && game.player) target = { x: game.player.x, y: game.player.y };
    let gait = b.gait;
    if (target) {
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const dist = Math.hypot(dx, dy);
      const arrive = b.state === 'lead' ? 22 : b.state === 'come' || b.state === 'follow' ? 30 : 10;
      if (dist < arrive) {
        gait = 'halt';
        if (b.state === 'come') {
          this.brainTimer = 0.1;
          this.brain = { ...b, state: 'idle', target: null, label: 'Waiting by you' };
          this.brainTimer = 6;
        }
        if (b.state === 'wander' || b.state === 'investigate' || b.state === 'drink' || b.state === 'shelter') {
          if (b.state === 'drink') this.brain = { ...b, state: 'drink', target: null, duration: 6 };
        }
      } else {
        if (b.state === 'lead') gait = dist > 60 ? (dist > 110 ? 'canter' : 'trot') : 'walk';
        // A lead rope is only so long: if the horse falls far behind (snagged on a corner), it is drawn up to you.
        if (b.state === 'lead' && dist > 140) {
          const k = (dist - 50) / dist;
          const nx = this.x + dx * k;
          const ny = this.y + dy * k;
          if (!game.world.blockedPx(nx, ny, true)) {
            this.x = nx;
            this.y = ny;
          }
        }
        if (b.state === 'come' && dist < 80) gait = 'trot';
        if (b.state === 'come' && dist < 40) gait = 'walk';
        this.steer(Math.atan2(dy, dx), dt, game);
      }
    } else if (b.state !== 'flee') gait = 'halt';
    if (this.data.tiedAt) {
      const t = this.data.tiedAt;
      const dd = Math.hypot(this.x - t.x, this.y - t.y);
      if (dd > 18) this.steer(Math.atan2(t.y - this.y, t.x - this.x), dt, game);
      gait = dd > 18 ? 'walk' : 'halt';
    }
    // Limp: injuries cap autonomous gait too.
    const maxG = gaitIndex(this.stats.maxGait);
    if (gaitIndex(gait as Gait) > maxG) gait = this.stats.maxGait as typeof gait;
    const targetSpeed = gait === 'halt' ? 0 : this.stats.gaitSpeed[gait as Gait] * game.world.terrainAt(this.x, this.y).speed;
    this.speed = approach(this.speed, targetSpeed, (targetSpeed > this.speed ? this.stats.accel * 0.7 : this.stats.decel) * dt);
    this.move(dt, game, false);
    // Stamina while running free.
    const g = this.gait;
    const rate = BALANCE.horse.gaitStamina[g] ?? 4;
    this.data.stamina = clamp(this.data.stamina + rate * (rate > 0 ? this.stats.regenMul : this.stats.drainMul) * dt, 0, maxStamina(this.data));
    // Keep inside pen.
    if (this.pen) {
      this.x = clamp(this.x, this.pen.x + 6, this.pen.x + this.pen.w - 6);
      this.y = clamp(this.y, this.pen.y + 6, this.pen.y + this.pen.h - 6);
    }
  }

  /** Turn toward a heading, with local obstacle/cliff/deep-water avoidance. */
  private steer(desired: number, dt: number, game: Game): void {
    const W = game.world;
    const look = 14 + this.speed * 0.25;
    const ok = (a: number) => {
      const px = this.x + Math.cos(a) * look;
      const py = this.y + Math.sin(a) * look;
      if (W.blockedPx(px, py, true)) return false;
      const t = W.terrainAt(px, py);
      if (t.deep && !this.rider) return false;
      return true;
    };
    let a = desired;
    if (!ok(a)) {
      for (const off of [0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.4, -2.4]) {
        if (ok(desired + off)) {
          a = desired + off;
          break;
        }
      }
    }
    const rate = this.speed > 60 ? this.stats.turnFast : this.stats.turnSlow;
    this.heading = turnToward(this.heading, a, rate * dt);
  }

  /** Leave sleep/rest for a short idle so the HUD label and whistle response are truthful. */
  wake(label = 'Awake'): void {
    if (this.brain.state !== 'sleep' && this.brain.state !== 'rest') return;
    this.brain = { state: 'idle', target: null, gait: 'halt', duration: 10, label };
    this.brainTimer = 10;
  }

  /** Move along heading with collision. Returns true if blocked. */
  private move(dt: number, game: Game, ridden: boolean): boolean {
    if (Math.abs(this.speed) < 0.01) return false;
    const W = game.world;
    const vx = Math.cos(this.heading) * this.speed * dt;
    const vy = Math.sin(this.heading) * this.speed * dt;
    const jumping = this.jumpT > 0;
    const blocked = (x: number, y: number) => {
      // Body collision: check centre and head/rump points.
      const fx = Math.cos(this.heading) * 9;
      const fy = Math.sin(this.heading) * 4;
      for (const [px, py] of [[x, y], [x + fx, y + fy], [x - fx * 0.7, y - fy * 0.7]] as [number, number][]) {
        if (W.blockedPx(px, py, true)) {
          if (jumping) {
            const o = W.objAt(Math.floor(px / 16), Math.floor(py / 16));
            if (o && OBJ[o]!.jumpable) continue;
          }
          return true;
        }
      }
      return false;
    };
    const nx = this.x + vx;
    const ny = this.y + vy;
    let hit = false;
    if (!blocked(nx, ny)) {
      this.x = nx;
      this.y = ny;
    } else if (!blocked(nx, this.y)) {
      this.x = nx;
      hit = true;
    } else if (!blocked(this.x, ny)) {
      this.y = ny;
      hit = true;
    } else {
      hit = true;
      // Glance off: try deflected headings so the horse slides around posts and fence corners.
      const step = Math.hypot(vx, vy) * 0.7;
      let freed = false;
      for (const da of [0.5, -0.5, 1.0, -1.0, 1.5, -1.5]) {
        const a = this.heading + da;
        const tx = this.x + Math.cos(a) * step;
        const ty = this.y + Math.sin(a) * step;
        if (!blocked(tx, ty)) {
          this.x = tx;
          this.y = ty;
          freed = true;
          break;
        }
      }
      // Already overlapping something (e.g. after turning in place): let the body's centre lead it out.
      if (!freed && blocked(this.x, this.y) && !W.blockedPx(nx, ny, true)) {
        this.x = nx;
        this.y = ny;
      }
    }
    const moved = Math.hypot(vx, vy);
    if (ridden && moved > 0) {
      this.distAcc += moved;
      if (this.distAcc > 160) {
        // ~160px ≈ 0.32 km at our scale (1 tile ≈ 2 m … scaled for gameplay): treat 500px as 1km.
        const km = this.distAcc / 500;
        this.distAcc = 0;
        this.data.kmRidden += km;
        this.data.cleanliness = Math.max(0, this.data.cleanliness - BALANCE.horse.dirtPerKm * km);
        const shod = !!this.data.gear.shoes;
        const rough = W.terrainAt(this.x, this.y).rough;
        if (!shod) this.data.hoof = Math.max(0, this.data.hoof - BALANCE.horse.hoofWearPerKmUnshod * km * (1 + rough * 2));
        for (const slot of Object.keys(this.data.gear) as (keyof HorseData['gear'])[]) {
          const id = this.data.gear[slot];
          if (!id) continue;
          const wear = (getItem(id).gear?.wear ?? 0) * km;
          this.data.gearCondition[slot] = Math.max(0, (this.data.gearCondition[slot] ?? 100) - wear);
        }
        const comfort = this.stats.comfort;
        grantBond(this.data, 'rideKm', game.clock.day, km * comfort);
        this.data.training.speed = Math.min(100, this.data.training.speed + km * (this.gait === 'gallop' ? 0.35 : 0.1));
        this.data.training.saddle = Math.min(100, this.data.training.saddle + km * 0.15);
      }
    }
    return hit;
  }

  /** Drive toward a point at a gait (race rivals, scripted travel). Returns distance left. */
  driveTo(x: number, y: number, gait: Gait, dt: number, game: Game): number {
    const d = Math.hypot(x - this.x, y - this.y);
    this.steer(Math.atan2(y - this.y, x - this.x), dt, game);
    const target = gait === 'halt' ? 0 : this.stats.gaitSpeed[gait] * game.world.terrainAt(this.x, this.y).speed;
    this.speed = approach(this.speed, target, (target > this.speed ? this.stats.accel : this.stats.decel) * dt);
    this.move(dt, game, false);
    const rate = BALANCE.horse.gaitStamina[this.gait] ?? 4;
    this.data.stamina = clamp(this.data.stamina + rate * (rate > 0 ? this.stats.regenMul : this.stats.drainMul) * dt, 0, maxStamina(this.data));
    return d;
  }

  // --- Riding controller --------------------------------------------------------
  private updateRidden(dt: number, game: Game): void {
    const d = this.data;
    const inp = game.input;
    const rs = this.stats;
    const W = game.world;
    const axis = inp.axis();
    const moving = axis.x !== 0 || axis.y !== 0;

    // Bolting: the horse has taken control.
    if (this.bolting > 0) {
      this.bolting -= dt;
      this.speed = approach(this.speed, rs.gaitSpeed.gallop, rs.accel * dt);
      if (this.move(dt, game, true)) this.heading += Math.PI * 0.6;
      if (inp.pressed('slow') || inp.pressed('interact')) {
        // Calming while bolting: bond helps.
        if (this.rng.chance(0.35 + bondLevel(d) * 0.1)) {
          this.bolting = 0;
          game.notify(`You rein ${d.name} in.`, 'horse');
        }
      }
      return;
    }
    if (this.rearT > 0 || this.buckT > 0) {
      this.speed = approach(this.speed, 0, 300 * dt);
      return;
    }

    if (inp.pressed('sprint')) {
      if (this.gaitLevel < 4) this.gaitLevel++;
      else if (this.spurCooldown <= 0) {
        // Spurring at full gallop: burst of speed at a stamina and trust cost.
        this.spurCooldown = 0.4;
        d.stamina -= 4 * rs.drainMul;
        d.trust = Math.max(0, d.trust - 0.4);
        this.speed += 12;
      }
    }
    if (inp.pressed('slow')) this.gaitLevel = Math.max(1, this.gaitLevel - 1);

    // Desired heading from input, applied after rein lag (responsiveness).
    if (moving) {
      const want = Math.atan2(axis.y, axis.x);
      if (this.pendingHeading === null || Math.abs(wrapAngle(want - this.pendingHeading)) > 0.01) {
        this.pendingHeading = want;
        this.pendingTimer = rs.reinLag;
      }
    }
    if (this.pendingTimer > 0) this.pendingTimer -= dt;
    const desired = this.pendingHeading ?? this.heading;

    // Gait target.
    let gait: Gait = moving ? GAIT_LEVELS[this.gaitLevel]! : 'halt';
    if (inp.down('reinBack') && !moving) gait = 'back';
    if (gaitIndex(gait) > gaitIndex(rs.maxGait)) gait = rs.maxGait;
    // Exhaustion: horse refuses to gallop on an empty tank unless forced.
    const exhausted = d.stamina <= 1;
    if (exhausted && (gait === 'gallop' || gait === 'canter')) {
      if (inp.down('sprint')) {
        // Forcing an exhausted horse: overexertion.
        d.health = Math.max(1, d.health - BALANCE.horse.overexertionDamage * dt);
        d.stress = clamp(d.stress + 15 * dt, 0, 100);
        if (this.rng.chance(dt * 0.4)) {
          penalizeBond(d, 'overexertion');
          injure(d, 'strain', 20, game.clock.day, 'overexertion');
          game.notify(`${d.name} is overexerted and pulls up lame.`, 'bad');
          this.gaitLevel = 1;
        }
      } else {
        gait = 'trot';
        if (this.gaitLevel > 2) {
          this.gaitLevel = 2;
          game.notify(`${d.name} is blown and drops to a trot.`, 'horse');
        }
      }
    }
    // Stubborn/disobedient refusals of a gait increase when stressed and bond is low.
    if ((gait === 'gallop' || gait === 'canter') && rs.obedience < 0.3 && this.rng.chance(dt * 0.2)) {
      gait = 'trot';
      this.gaitLevel = Math.min(this.gaitLevel, 2);
      game.notify(`${d.name} ignores your heels.`, 'horse');
    }

    // Terrain and slope.
    const t = W.terrainAt(this.x, this.y);
    const terrainPenalty = 1 - (1 - t.speed) * (1.45 - rs.terrain * 0.6);
    const ahead = W.heightPx(this.x + Math.cos(this.heading) * 10, this.y + Math.sin(this.heading) * 10);
    const here = W.heightPx(this.x, this.y);
    const slope = (ahead - here) / 10; // height units per px
    const slopeMul = slope > 0 ? Math.max(0.55, 1 - slope * 3.5) : Math.min(1.1, 1 - slope * 1.2);
    let targetSpeed = gait === 'halt' ? 0 : gait === 'back' ? -rs.gaitSpeed.back : rs.gaitSpeed[gait] * terrainPenalty * slopeMul;
    if (t.deep) targetSpeed = Math.min(targetSpeed, 38);
    // Water-shy horses balk at the edge.
    if (t.water && d.dislike === 'water' && this.speed > 5 && this.rng.chance(dt * 0.8) && rs.obedience < 0.7) {
      targetSpeed = 0;
      d.stress = clamp(d.stress + 10, 0, 100);
      game.notify(`${d.name} balks at the water.`, 'horse');
    }

    const acc = targetSpeed > this.speed ? rs.accel : rs.decel;
    this.speed = approach(this.speed, targetSpeed, acc * dt);
    // Turning: tighter at low speed.
    const gallopFrac = clamp(this.speed / Math.max(1, rs.gaitSpeed.gallop), 0, 1);
    const turnRate = rs.turnSlow + (rs.turnFast - rs.turnSlow) * gallopFrac;
    if (moving && this.pendingTimer <= 0) {
      // A horse picks its own way around posts, walls and trees rather than ploughing into them.
      let steerTo = desired;
      const look = 12 + Math.abs(this.speed) * 0.18;
      // At a canter or faster a fence or log ahead is a jump to line up, not something to steer around.
      const lining = this.speed > rs.gaitSpeed.trot * 1.05;
      const blockAt = (px: number, py: number) => {
        if (!W.blockedPx(px, py, true)) return false;
        if (!lining) return true;
        const o = W.objAt(Math.floor(px / 16), Math.floor(py / 16));
        return !(o && OBJ[o]!.jumpable);
      };
      const free = (a: number) => !blockAt(this.x + Math.cos(a) * look, this.y + Math.sin(a) * look) && !blockAt(this.x + Math.cos(a) * look * 0.5, this.y + Math.sin(a) * look * 0.5);
      if (!free(desired)) {
        for (const off of [0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.5, -1.5]) {
          if (free(desired + off)) {
            steerTo = desired + off;
            break;
          }
        }
      }
      this.heading = turnToward(this.heading, steerTo, turnRate * dt);
    }

    // Jump.
    if (inp.pressed('jump') && this.jumpT <= 0) {
      if (this.speed > rs.gaitSpeed.trot * 0.8) this.tryJump(game);
      else game.notify('Pick up at least a trot to jump.', 'info');
    }

    // Stamina.
    const rate = BALANCE.horse.gaitStamina[this.gait] ?? 4;
    let delta = rate > 0 ? rate * rs.regenMul : rate * rs.drainMul;
    if (slope > 0.4 && this.speed > 20) delta -= slope * 2.5;
    if (t.deep) delta -= 4;
    d.stamina = clamp(d.stamina + delta * dt, 0, rs.staminaMax);
    if (this.gait === 'gallop') d.energy = Math.max(0, d.energy - BALANCE.horse.energyDrainGallop * dt * (1.3 - rs.terrain * 0.3));

    // Rough-ground injury risk at speed.
    if (this.gait === 'gallop' && t.rough > 0.3 && this.rng.chance(dt * t.rough * (1.1 - rs.terrain) * 0.05)) {
      injure(d, this.rng.chance(0.6) ? 'stoneBruise' : 'limp', 18 + this.rng.range(0, 20), game.clock.day, 'rough ground at a gallop');
      game.notify(`${d.name} stumbles on the rocks and comes up sore.`, 'bad');
      this.speed *= 0.5;
    }
    // Downhill stumble at full gallop on steep ground.
    if (this.gait === 'gallop' && slope < -1.2 && this.rng.chance(dt * 0.2 * (1.1 - rs.terrain))) this.fall(game, 'stumbled down the slope');

    // Fear while ridden: spook (rear) or bolt depending on obedience.
    if (d.stress > 70) {
      const p = (d.stress - 70) / 30;
      if (this.rng.chance(dt * p * (1.2 - rs.obedience))) {
        if (this.rng.chance(0.5)) {
          this.rearT = 1.1;
          game.audio.neigh(this.x, this.y, true);
          if (this.rng.chance(0.4 * (1 - rs.obedience))) this.throwRider(game, 'reared and threw you');
        } else {
          this.bolting = 2.5;
          game.notify(`${d.name} bolts! (${typeof document !== 'undefined' && document.body.classList.contains('has-touch') ? 'Frear or E' : 'Ctrl / E'} to calm)`, 'bad');
        }
      }
    }
    // Unbroken / poorly saddle-trained horses buck.
    if (d.training.saddle < 25 && this.speed > 10 && this.rng.chance(dt * (0.3 - d.training.saddle / 100))) this.buck(game);

    // Only a head-on hit at a full gallop is a crash; anything slower just pulls up short.
    const wasFast = Math.abs(this.speed) > rs.gaitSpeed.gallop * 0.85;
    const hit = this.move(dt, game, true);
    if (hit && wasFast) this.crash(game);
    else if (hit) this.speed *= 0.6;
    // Pressed against something for a moment: the horse checks itself to a walk so the HUD and feel agree.
    this.bumpT = hit ? this.bumpT + dt : 0;
    if (this.bumpT > 0.5 && this.gaitLevel > 1) this.gaitLevel = 1;
    // Wedged for over a second while the rider keeps asking: step the horse to the nearest clear spot.
    if (this.bumpT > 1.1) {
      const spot = freeSpotNear(game, this.x, this.y, (x, y) => !game.world.blockedPx(x, y, true) && !game.world.blockedPx(x + Math.cos(this.heading) * 9, y + Math.sin(this.heading) * 4, true) && !game.world.blockedPx(x - Math.cos(this.heading) * 6, y - Math.sin(this.heading) * 3, true));
      if (spot) {
        this.x = spot.x;
        this.y = spot.y;
      }
      this.bumpT = 0;
    }
  }

  private tryJump(game: Game): void {
    const W = game.world;
    let obstacle = false;
    for (let dd = 10; dd <= 34; dd += 6) {
      const px = this.x + Math.cos(this.heading) * dd;
      const py = this.y + Math.sin(this.heading) * dd;
      const o = W.objAt(Math.floor(px / 16), Math.floor(py / 16));
      if (o && OBJ[o]!.jumpable) obstacle = true;
    }
    const d = this.data;
    // Rail fences and logs are low: most sound horses will take them; skill and trust decide the rest.
    const chance = obstacle ? Math.min(0.97, 0.45 + this.stats.jumpSkill * 0.5 + this.stats.obedience * 0.15) : 1;
    if (this.rng.chance(chance)) {
      this.jumpT = obstacle ? 0.7 : 0.55;
      game.audio.play('jump', this.x, this.y);
      if (obstacle) {
        d.training.jumping = Math.min(100, d.training.jumping + 1.5);
        grantBond(d, 'train', game.clock.day, 0.3);
      }
    } else {
      // Refusal: slam on the brakes.
      this.speed *= 0.2;
      this.rearT = 0.7;
      d.stress = clamp(d.stress + 12, 0, 100);
      game.notify(`${d.name} refuses the jump!`, 'horse');
      if (this.rng.chance(0.25 * (1 - this.stats.obedience))) this.throwRider(game, 'refused the jump and you went over its head');
    }
  }

  private crash(game: Game): void {
    const d = this.data;
    game.audio.play('crash', this.x, this.y);
    d.stress = clamp(d.stress + 30, 0, 100);
    if (this.rng.chance(0.4)) injure(d, 'bruise', 15 + this.speed * 0.1, game.clock.day, 'ran into an obstacle');
    if (this.rng.chance(0.25 * (1.2 - this.stats.obedience))) this.throwRider(game, 'crashed and you were thrown');
    this.speed = 0;
    penalizeBond(d, 'fall', 0.4);
  }

  private buck(game: Game): void {
    this.buckT = 0.8;
    game.audio.neigh(this.x, this.y, true);
    if (this.rng.chance(0.5 - this.data.training.saddle / 100)) this.throwRider(game, 'bucked you off');
    else this.data.training.saddle = Math.min(100, this.data.training.saddle + 2);
  }

  /** Fall: horse goes down, both get hurt. */
  fall(game: Game, why: string): void {
    injure(this.data, this.rng.chance(0.5) ? 'cut' : 'limp', 25, game.clock.day, why);
    penalizeBond(this.data, 'fall');
    this.throwRider(game, why);
  }

  throwRider(game: Game, why: string): void {
    const r = this.rider;
    if (!r) return;
    game.notify(`${this.data.name} ${why}!`, 'bad');
    game.ui.banner('Thrown from the saddle', 2.5);
    addHistory(this.data, game.clock.day, `Threw the rider: ${why}.`);
    r.dismount(game, true);
    r.damage(8 + this.speed * 0.08, game, 'fall');
    this.speed = 0;
    // Spooked horse trots off a little way.
    if (this.data.stress > 50) {
      this.brain = { state: 'flee', target: { x: this.x + Math.cos(this.heading) * 120, y: this.y + Math.sin(this.heading) * 120 }, gait: 'canter', duration: 3, label: 'Running off' };
      this.brainTimer = 3;
    }
  }

  private updateAnim(dt: number): void {
    let a: HorseAnim;
    const g = this.gait;
    if (this.rearT > 0) a = 'rear';
    else if (this.buckT > 0) a = 'buck';
    else if (this.jumpT > 0) a = 'jump';
    else if (g === 'halt') {
      const st = this.rider ? 'idle' : this.brain.state;
      a = st === 'graze' || st === 'drink' ? 'graze' : (st === 'sleep' || st === 'rest') && !this.rider && this.data.energy < 50 && st === 'sleep' ? 'lie' : 'idle';
    } else if (g === 'back') a = 'walk';
    else a = g as HorseAnim;
    if (a !== this.anim) {
      this.anim = a;
      this.animT = 0;
    }
    // Advance by distance for locomotion (no foot sliding), by time otherwise.
    const cycle: Record<string, number> = { walk: 34, trot: 44, canter: 70, gallop: 96 };
    if (cycle[a]) this.animT += (Math.abs(this.speed) * dt) / cycle[a]!;
    else if (a === 'jump') this.animT = 1 - this.jumpT / 0.55;
    else if (a === 'rear') this.animT = 1 - this.rearT / 1.1;
    else this.animT += dt * (a === 'graze' ? 0.35 : 0.5);
    this.displayHeading = this.heading;
  }

  override get sortY(): number {
    return this.y + 2;
  }

  draw(r: Renderer, game: Game): void {
    const set = horseSprites(this.data);
    const h = this.displayHeading;
    const cx = Math.cos(h);
    const sy = Math.sin(h);
    const view = Math.abs(cx) >= Math.abs(sy) * 0.7 ? 'side' : sy > 0 ? 'front' : 'back';
    const lift = this.jumpT > 0 ? Math.sin((1 - this.jumpT / 0.55) * Math.PI) * 10 : 0;
    r.shadow(this.x, this.y, view === 'side' ? 15 : 12, view === 'side' ? 4 : 7, lift);
    let frame;
    if (view === 'side') {
      const frames = set.side[this.anim];
      const i = Math.floor((this.animT % 1) * frames.length) % frames.length;
      frame = frames[this.anim === 'jump' || this.anim === 'rear' ? Math.min(frames.length - 1, Math.floor(this.animT * frames.length)) : i]!;
    } else {
      const fb = view === 'front' ? set.front : set.back;
      const key = this.anim === 'idle' || this.anim === 'graze' || this.anim === 'lie' || this.anim === 'rear' || this.anim === 'buck' ? 'idle' : this.anim === 'walk' ? 'walk' : 'run';
      const frames = fb[key];
      frame = frames[Math.floor((this.animT % 1) * frames.length) % frames.length]!;
    }
    const flip = view === 'side' && cx < 0;
    const dx = Math.round(this.x - HW / 2 + (flip ? -2 : 2));
    const dy = Math.round(this.y - GROUND_Y - lift);
    r.sprite(frame.img, dx, dy, flip, this.data.stress > 85 && !this.rider ? 0.9 : 1);
    if (this.rider) this.rider.drawMounted(r, game, this, frame, dx, dy, flip, view);
    else if (this.npcRiderLook) {
      const hs = humanSprites(this.npcRiderLook);
      const dir = view === 'side' ? 'side' : view === 'front' ? 'down' : 'up';
      const f = hs.frames[dir].ride[0]!;
      const seatX = flip ? HW - frame.sx : frame.sx;
      r.sprite(f, Math.round(dx + seatX - (view === 'side' ? (flip ? PW - 9 : 9) : 10)), Math.round(dy + frame.sy - 17), flip);
    }
  }
}

function isGrazeable(W: Game['world'], x: number, y: number): boolean {
  const g = W.groundAt(Math.floor(x / 16), Math.floor(y / 16));
  return g === 3 || g === 4 || g === 5 || g === 12;
}

/** Nearest point (ring search, 4px steps up to 40px) where `ok` holds. Used to free wedged riders and walkers. */
export function freeSpotNear(game: Game, x: number, y: number, ok: (x: number, y: number) => boolean): { x: number; y: number } | null {
  void game;
  for (let r = 4; r <= 40; r += 4)
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (ok(px, py)) return { x: px, y: py };
    }
  return null;
}
