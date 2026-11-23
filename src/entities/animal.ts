/**
 * Wildlife. Archetype-driven behaviour: prey graze and flee in herds,
 * predators stalk and attack (packs for wolves, ambushes for cougars),
 * bison stampede, birds circle or take flight, rattlesnakes warn then strike.
 * Dead animals stay as carcasses for skinning.
 */
import { Rng } from '../core/rng.ts';
import { approach, clamp, turnToward } from '../core/math.ts';
import { getSpecies, type SpeciesDef } from '../data/wildlife.ts';
import type { Game } from '../game.ts';
import { AH, AW, animalSprites, type AnimalAnim } from '../render/animalSprite.ts';
import type { Renderer } from '../render/renderer.ts';
import { Entity } from './entity.ts';

type AState = 'graze' | 'wander' | 'flee' | 'stalk' | 'attack' | 'dead' | 'circle' | 'coil' | 'idle';

export class Animal extends Entity {
  speciesId: string;
  sp: SpeciesDef;
  health: number;
  state: AState = 'graze';
  heading: number;
  speed = 0;
  stateT = 0;
  anim: AnimalAnim = 'idle';
  animT = 0;
  rng: Rng;
  hostile = false;
  herd: string | null = null;
  skinned = false;
  deadT = 0;
  attackCd = 0;
  target: Entity | null = null;
  homeX: number;
  homeY: number;
  flying = false;
  z = 0;

  constructor(speciesId: string, x: number, y: number, seed: number) {
    super('animal');
    this.speciesId = speciesId;
    this.sp = getSpecies(speciesId);
    this.health = this.sp.health;
    this.x = this.homeX = x;
    this.y = this.homeY = y;
    this.rng = new Rng(seed);
    this.heading = this.rng.range(-Math.PI, Math.PI);
    this.radius = Math.max(4, this.sp.look.len * 0.8);
    if (this.sp.id === 'hawk' || this.sp.id === 'vulture') {
      this.flying = true;
      this.state = 'circle';
      this.z = 40;
    }
    if (this.sp.archetype === 'snake') this.state = 'coil';
  }

  update(dt: number, game: Game): void {
    this.stateT += dt;
    this.attackCd = Math.max(0, this.attackCd - dt);
    if (this.state === 'dead') {
      this.deadT += dt;
      this.anim = 'dead';
      if (this.deadT > 600) this.dead = true;
      return;
    }
    const p = game.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const dp = Math.hypot(dx, dy);
    const sense = this.sp.sense * (p.crouching ? 0.45 : 1) * (p.mount ? 1.15 : 1) * (game.clock.isNight && !this.sp.nocturnal ? 0.7 : 1);
    const arch = this.sp.archetype;

    if (this.flying) {
      // Circle lazily over home.
      const a = game.time * 0.3 + this.rng.next() * 0.01;
      this.x = this.homeX + Math.cos(a + this.homeY) * 80;
      this.y = this.homeY + Math.sin(a + this.homeX) * 50;
      this.anim = 'fly';
      this.animT += dt * 4;
      if (this.rng.chance(dt * 0.02)) game.audio.play(this.sp.id === 'hawk' ? 'hawk' : 'bird', this.x, this.y);
      return;
    }
    if (arch === 'snake') {
      this.anim = 'idle';
      this.animT += dt * 3;
      if (dp < 50 && this.rng.chance(dt * 2)) game.audio.play('rattle', this.x, this.y);
      // Horses passing close get spooked by the rattle.
      if (dp < 22 && this.attackCd <= 0) {
        this.attackCd = 1.5;
        if (p.mount) {
          p.mount.data.stress = clamp(p.mount.data.stress + 40 * p.mount.stats.fear, 0, 100);
          p.mount.rearT = 1;
          game.audio.neigh(p.mount.x, p.mount.y, true);
        } else p.damage(this.sp.damage ?? 8, game, 'rattlesnake bite');
      }
      return;
    }

    switch (this.state) {
      case 'graze':
      case 'wander':
      case 'idle': {
        if (this.stateT > this.rng.range(3, 8)) {
          this.state = this.rng.chance(0.55) ? 'graze' : 'wander';
          this.stateT = 0;
          this.heading = this.rng.range(-Math.PI, Math.PI);
        }
        const wanderSpeed = this.state === 'wander' ? this.sp.walk : 0;
        this.speed = approach(this.speed, wanderSpeed, 60 * dt);
        // Stay near home range.
        if (Math.hypot(this.x - this.homeX, this.y - this.homeY) > 220) this.heading = Math.atan2(this.homeY - this.y, this.homeX - this.x);
        if (dp < sense) {
          if (arch === 'predator' && this.rng.chance((this.sp.aggression ?? 0) * (game.clock.isNight ? 1.5 : 1))) {
            this.state = 'stalk';
            this.hostile = true;
            this.target = p.mount ?? p;
            if (this.sp.id === 'wolf') game.audio.play('howl', this.x, this.y);
            if (this.sp.id === 'bear' || this.sp.id === 'cougar') game.audio.play('growl', this.x, this.y);
            // Pack: alert the others nearby.
            for (const o of game.spatial.query(this.x, this.y, 200, 'animal')) {
              const a = o as Animal;
              if (a !== this && a.speciesId === this.speciesId && a.state !== 'dead') {
                a.state = 'stalk';
                a.hostile = true;
                a.target = this.target;
              }
            }
          } else if (arch !== 'predator' || dp < sense * 0.4) this.startFlee(game, p.x, p.y);
          this.stateT = 0;
        }
        break;
      }
      case 'flee': {
        const ax = this.x - p.x;
        const ay = this.y - p.y;
        this.heading = turnToward(this.heading, Math.atan2(ay, ax) + Math.sin(this.stateT * 2) * 0.4, 4 * dt);
        this.speed = approach(this.speed, this.sp.speed, 300 * dt);
        if (this.stateT > 7 && dp > sense * 1.5) {
          this.state = 'graze';
          this.stateT = 0;
          this.homeX = this.x;
          this.homeY = this.y;
        }
        break;
      }
      case 'stalk':
      case 'attack': {
        const t = this.target ?? p;
        const tx = t.x - this.x;
        const ty = t.y - this.y;
        const dt2 = Math.hypot(tx, ty);
        this.heading = turnToward(this.heading, Math.atan2(ty, tx), 5 * dt);
        this.speed = approach(this.speed, this.state === 'stalk' && dt2 > 90 ? this.sp.walk * 1.6 : this.sp.speed, 300 * dt);
        if (dt2 < 90) this.state = 'attack';
        // Predators are opportunists: a chase that goes nowhere is abandoned.
        if (this.stateT > 22 && dt2 > 40) {
          this.target = null;
          this.startFlee(game, t.x, t.y);
          break;
        }
        if (dt2 < 14 && this.attackCd <= 0) {
          this.attackCd = 1.1;
          this.anim = 'attack';
          game.audio.play('growl', this.x, this.y);
          if (p.mount && (t === p.mount || t === p)) {
            // Predators go for the horse's legs.
            const h = p.mount;
            h.data.health = Math.max(1, h.data.health - (this.sp.damage ?? 10) * 0.6);
            h.data.stress = clamp(h.data.stress + 30, 0, 100);
            if (h.rng.chance(0.3)) game.injureHorse(h, 'cut', 20, `${this.sp.name.toLowerCase()} attack`);
            if (h.rng.chance(0.25)) h.throwRider(game, `panicked at the ${this.sp.name.toLowerCase()}`);
          } else if (t === p) p.damage(this.sp.damage ?? 10, game, this.sp.name);
          else if ('data' in t) {
            const hh = t as unknown as { data: { health: number; stress: number } };
            hh.data.health = Math.max(1, hh.data.health - (this.sp.damage ?? 10) * 0.6);
            hh.data.stress = 100;
          }
        }
        // Give up when hurt or player gallops away.
        if (this.health < this.sp.health * 0.35 || dt2 > 500) this.startFlee(game, p.x, p.y);
        break;
      }
    }
    // Move with simple collision and water avoidance.
    const nx = this.x + Math.cos(this.heading) * this.speed * dt;
    const ny = this.y + Math.sin(this.heading) * this.speed * dt;
    const W = game.world;
    if (!W.blockedPx(nx, ny, true) && !W.terrainAt(nx, ny).deep) {
      this.x = nx;
      this.y = ny;
    } else this.heading += this.rng.range(1, 2.5);
    if (this.speed < 2) this.anim = this.state === 'graze' ? 'eat' : 'idle';
    else this.anim = this.speed > this.sp.walk * 1.5 ? 'run' : 'walk';
    this.animT += dt * (this.anim === 'run' ? 9 : this.anim === 'walk' ? 5 : 1.5);
  }

  startFlee(game: Game, fx: number, fy: number): void {
    this.state = 'flee';
    this.stateT = 0;
    this.heading = Math.atan2(this.y - fy, this.x - fx);
    // Herd mates flee too.
    for (const o of game.spatial.query(this.x, this.y, 150, 'animal')) {
      const a = o as Animal;
      if (a !== this && a.speciesId === this.speciesId && a.state !== 'dead' && a.state !== 'flee' && a.sp.archetype !== 'predator') {
        a.state = 'flee';
        a.stateT = 0;
        a.heading = Math.atan2(a.y - fy, a.x - fx);
      }
    }
  }

  hurt(amount: number, game: Game, byPlayer: boolean): void {
    if (this.state === 'dead') return;
    this.health -= amount;
    game.renderer.spawn({ x: this.x, y: this.y - 6, kind: 'blood', color: '#8a1a1a', vz: 20, life: 0.5, max: 0.5, size: 2 });
    if (this.health <= 0) {
      this.state = 'dead';
      this.alive = false;
      this.flying = false;
      this.z = 0;
      game.onAnimalKilled(this, byPlayer);
      return;
    }
    if (this.sp.archetype === 'predator' || (this.sp.archetype === 'herd' && this.rng.chance(0.3))) {
      this.state = 'attack';
      this.hostile = true;
      this.target = game.player.mount ?? game.player;
    } else this.startFlee(game, game.player.x, game.player.y);
  }

  draw(r: Renderer, game: Game): void {
    const set = animalSprites(this.speciesId);
    const frames = set[this.anim].length ? set[this.anim] : set.idle;
    const f = frames[Math.floor(this.animT) % frames.length]!;
    const flip = Math.cos(this.heading) < 0;
    if (!this.flying) r.shadow(this.x, this.y, Math.max(3, this.sp.look.len * 0.9), 2, 0);
    else r.shadow(this.x + 10, this.y + 30, 4, 1.5, 0);
    r.sprite(f, Math.round(this.x - AW / 2), Math.round(this.y - AH + 3 - this.z), this.flying ? false : flip);
    void game;
  }
}
