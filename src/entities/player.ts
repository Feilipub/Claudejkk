import { freeSpotNear } from './horse.ts';
/**
 * The player character: on-foot movement, mounting/dismounting, riding hand-off
 * to the horse controller, survival stats, weapons and combat, death/respawn.
 */
import { approach, clamp, facing4 } from '../core/math.ts';
import { BALANCE } from '../data/balance.ts';
import { getItem } from '../data/items.ts';
import type { Game } from '../game.ts';
import { humanSprites, PW, PH, type HumanLook, type HumanAnim, type Dir } from '../render/humanSprite.ts';
import { HW, type HorseFrame } from '../render/horseSprite.ts';
import type { Renderer } from '../render/renderer.ts';
import { Inventory } from '../systems/inventory.ts';
import { Skills } from '../systems/skills.ts';
import { Entity } from './entity.ts';
import type { HorseEntity } from './horse.ts';

export interface PlayerStats {
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  hunger: number;
  thirst: number;
  energy: number;
  /** Felt temperature comfort: negative = cold, positive = hot. */
  warmthBuff: number;
}

export class Player extends Entity {
  name = 'Wren Calloway';
  look: HumanLook;
  stats: PlayerStats = { health: 100, maxHealth: 100, stamina: 100, maxStamina: 100, hunger: 85, thirst: 85, energy: 90, warmthBuff: 0 };
  inv = new Inventory(BALANCE.player.carryBase);
  skills = new Skills();
  /** Starting purse: enough for a cheap rifle and a bedroll, not much more (playtest: $18.50 forced a choice between hunting and camping). */
  money = 26.5;
  mount: HorseEntity | null = null;
  /** Main horse id (whistle target). */
  mainHorseId: string | null = null;
  vx = 0;
  vy = 0;
  angle = Math.PI / 2;
  dir: Dir = 'down';
  flip = false;
  anim: HumanAnim = 'idle';
  animT = 0;
  crouching = false;
  aiming = false;
  lantern = false;
  /** Weapons owned (item ids) and the equipped one. */
  weapons: string[] = [];
  weaponIdx = 0;
  holstered = true;
  clip: Record<string, number> = {};
  fireCooldown = 0;
  reloadT = 0;
  spread = 0;
  /** Action timers. */
  actionT = 0;
  actionAnim: HumanAnim | null = null;
  invuln = 0;
  /** Seconds since last hostile act (for witnesses). */
  respawnPoint = { x: 0, y: 0 };
  sleeping = false;
  lastSafe = { x: 0, y: 0 };
  /** Whistle cooldown. */
  whistleT = 0;
  private stepAcc = 0;

  constructor(look: HumanLook) {
    super('player', 'player');
    this.look = look;
    this.radius = 5;
  }

  get weapon(): string | null {
    if (this.holstered || this.weapons.length === 0) return null;
    return this.weapons[this.weaponIdx % this.weapons.length] ?? null;
  }

  get capacity(): number {
    return this.inv.capacity;
  }

  update(dt: number, game: Game): void {
    if (!this.alive) {
      this.anim = 'dead';
      return;
    }
    this.invuln = Math.max(0, this.invuln - dt);
    this.whistleT = Math.max(0, this.whistleT - dt);
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.spread = Math.max(0, this.spread - dt * 0.35);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.finishReload(game);
    }
    if (this.actionT > 0) {
      this.actionT -= dt;
      if (this.actionT <= 0) this.actionAnim = null;
    }
    this.survival(dt, game);

    const inp = game.input;
    // Weapons.
    if (inp.pressed('holster')) {
      this.holstered = !this.holstered;
      if (this.weapons.length === 0) this.holstered = true;
    }
    // While holstered next to something with several options, Z/X scroll those options instead.
    const scrolling = this.holstered && (game.interactions.current?.actions.length ?? 0) > 1;
    if (inp.pressed('weaponNext') && this.weapons.length && !scrolling) {
      this.weaponIdx = (this.weaponIdx + 1) % this.weapons.length;
      this.holstered = false;
    }
    if (inp.pressed('weaponPrev') && this.weapons.length && !scrolling) {
      this.weaponIdx = (this.weaponIdx - 1 + this.weapons.length) % this.weapons.length;
      this.holstered = false;
    }
    if (this.weapon && !game.flags.hintFire) {
      game.setFlag('hintFire', true);
      const touch = typeof document !== 'undefined' && document.body.classList.contains('has-touch');
      game.notify(touch ? 'Weapon drawn. Tap Atirar, or tap the spot you want to hit. Arma holsters, Recarregar reloads.' : 'Weapon drawn. Left-click fires; hold right-click to steady your aim. G holsters.', 'info');
    }
    this.aiming = inp.down('aim') && !!this.weapon;
    const aimWorld = game.mouseWorld();
    if (this.aiming || (this.weapon && inp.down('fire'))) this.angle = Math.atan2(aimWorld.y - this.y, aimWorld.x - this.x);
    if (inp.pressed('reload')) this.startReload(game);
    if (inp.down('fire') && this.weapon && this.fireCooldown <= 0 && this.reloadT <= 0 && !game.ui.pointerOverUi) game.combat.playerFire(this, aimWorld.x, aimWorld.y);
    if (inp.pressed('lantern')) this.lantern = !this.lantern;

    if (this.mount) {
      this.x = this.mount.x;
      this.y = this.mount.y;
      if (inp.pressed('mount')) this.dismount(game, false);
      this.anim = 'ride';
      return;
    }

    // On-foot movement.
    const a = inp.axis();
    if (inp.pressed('crouch')) this.crouching = !this.crouching;
    const sprint = inp.down('sprint') && this.stats.stamina > 1 && !this.crouching;
    let speed = this.crouching ? BALANCE.player.walkSpeed * 0.55 : sprint ? BALANCE.player.runSpeed : BALANCE.player.walkSpeed;
    if (this.aiming) speed *= 0.6;
    const t = game.world.terrainAt(this.x, this.y);
    speed *= t.speed;
    if (t.deep) speed *= 0.8;
    const encumbered = this.inv.weight > this.inv.capacity;
    if (encumbered) speed *= 0.6;
    const len = Math.hypot(a.x, a.y);
    const tvx = len ? (a.x / len) * speed : 0;
    const tvy = len ? (a.y / len) * speed : 0;
    this.vx = approach(this.vx, tvx, 600 * dt);
    this.vy = approach(this.vy, tvy, 600 * dt);
    if (len && !this.aiming) this.angle = Math.atan2(this.vy, this.vx);
    if (sprint && len) this.stats.stamina = Math.max(0, this.stats.stamina - BALANCE.player.sprintDrain * dt);
    else this.stats.stamina = Math.min(this.stats.maxStamina, this.stats.stamina + BALANCE.player.staminaRegen * dt * (this.stats.hunger < 20 ? 0.5 : 1));
    this.moveBy(this.vx * dt, this.vy * dt, game);
    const moving = Math.hypot(this.vx, this.vy) > 5;
    this.anim = this.actionAnim ?? (this.aiming || (this.weapon && this.fireCooldown > 0) ? 'shoot' : moving ? (sprint ? 'run' : 'walk') : this.crouching ? 'sit' : 'idle');
    this.animT += dt * (this.anim === 'run' ? 10 : this.anim === 'walk' ? 7 : 2);
    if (moving) {
      this.stepAcc += dt * (sprint ? 3.4 : 2.2);
      if (this.stepAcc > 1) {
        this.stepAcc = 0;
        game.audio.step(this.x, this.y, t.surface);
        game.renderer.addPrint(this.x + Math.cos(this.angle + Math.PI / 2) * (Math.floor(this.animT) % 2 ? 2 : -2), this.y, this.angle, 'boot', t.surface);
      }
    }
    if (!t.water && !game.world.insideBuilding(this.x, this.y)) this.lastSafe = { x: this.x, y: this.y };

    // Mount.
    if (inp.pressed('mount')) {
      const h = game.nearestRideableHorse(this.x, this.y, 28);
      if (h) this.tryMount(h, game);
    }
    // Whistle.
    if (inp.pressed('whistle') && this.whistleT <= 0) {
      this.whistleT = 1.5;
      game.whistle();
    }
  }

  private moveBy(dx: number, dy: number, game: Game): void {
    const W = game.world;
    const r = 3;
    const blocked = (x: number, y: number) => W.blockedPx(x - r, y) || W.blockedPx(x + r, y) || W.blockedPx(x, y - 2) || W.blockedPx(x, y + 2);
    const x0 = this.x;
    const y0 = this.y;
    if (!blocked(this.x + dx, this.y)) this.x += dx;
    if (!blocked(this.x, this.y + dy)) this.y += dy;
    const want = Math.hypot(dx, dy);
    if (want > 0 && Math.hypot(this.x - x0, this.y - y0) < want * 0.3) {
      // Wedged on a post, trunk or corner: slip around it like a person would.
      const a0 = Math.atan2(dy, dx);
      for (const da of [0.7, -0.7, 1.3, -1.3]) {
        const tx = x0 + Math.cos(a0 + da) * want * 0.8;
        const ty = y0 + Math.sin(a0 + da) * want * 0.8;
        if (!blocked(tx, ty)) {
          this.x = tx;
          this.y = ty;
          return;
        }
      }
      // Already overlapping a collider (e.g. spawned or dismounted into one): step straight out.
      if (blocked(x0, y0)) {
        this.x = x0 + dx;
        this.y = y0 + dy;
      }
      // Still pinned after a moment of trying: hop to the nearest clear spot.
      this.pinnedT += game.dt;
      if (this.pinnedT > 1) {
        this.pinnedT = 0;
        const spot = freeSpotNear(game, x0, y0, (x, y) => !blocked(x, y));
        if (spot) {
          this.x = spot.x;
          this.y = spot.y;
        }
      }
    } else this.pinnedT = 0;
  }
  private pinnedT = 0;

  private survival(dt: number, game: Game): void {
    const gm = game.lastGameMinutes;
    const s = this.stats;
    const hours = gm / 60;
    s.hunger = clamp(s.hunger - BALANCE.player.hungerPerHour * hours, 0, 100);
    s.thirst = clamp(s.thirst - BALANCE.player.thirstPerHour * hours * (game.temperatureHere > 88 ? 1.7 : 1), 0, 100);
    s.energy = clamp(s.energy - BALANCE.player.energyPerHour * hours, 0, 100);
    s.warmthBuff = Math.max(0, s.warmthBuff - gm);
    // Max stamina shrinks with hunger/fatigue (light-touch survival).
    s.maxStamina = 60 + 40 * Math.min(1, (s.hunger + s.energy) / 100);
    s.maxHealth = 100;
    // Health regen when fed; slow damage when starving / freezing.
    if (s.hunger > 30 && s.thirst > 30) s.health = Math.min(s.maxHealth, s.health + dt * 0.6);
    if (s.hunger <= 0 || s.thirst <= 0) s.health -= dt * 0.25;
    const temp = game.temperatureHere + (s.warmthBuff > 0 ? 20 : 0) + (game.nearFire ? 30 : 0) + (game.world.insideBuilding(this.x, this.y) ? 15 : 0);
    if (temp < 20) s.health -= dt * 0.15 * ((20 - temp) / 20);
    if (s.health <= 0) this.die(game, 'the elements');
  }

  tryMount(h: HorseEntity, game: Game): void {
    const d = h.data;
    if (d.owner !== 'player' && d.owner !== 'wild' && !d.rentalUntilDay) {
      // Riding off on someone else's horse is horse theft.
      game.law.reportCrime('horseTheft', this.x, this.y, d.owner);
      game.notify(`You've taken ${d.name}. That's horse theft.`, 'law');
      d.owner = 'stolen';
    }
    if (d.age < 2.5) {
      game.notify(`${d.name} is too young to carry a rider.`, 'horse');
      return;
    }
    if (d.tameness < 100) {
      game.taming.startBreaking(h);
      return;
    }
    if (!d.gear.saddle && d.owner === 'player' && d.training.saddle < 60) {
      game.notify(`${d.name} has no saddle. Riding bareback is unsteady.`, 'horse');
    }
    if (d.tiedAt) d.tiedAt = null;
    h.leading = false;
    // Nervous, low-bond horses sidestep away from a mount attempt.
    if (h.stats.obedience < 0.25 && h.rng.chance(0.5)) {
      game.notify(`${d.name} sidesteps away from you.`, 'horse');
      h.heading += 0.8;
      h.speed = 20;
      return;
    }
    this.mount = h;
    h.rider = this;
    h.gaitLevel = 1;
    h.speed = 0;
    this.holstered = true;
    game.audio.play('mount', h.x, h.y);
    if (d.owner === 'player' && !this.mainHorseId) this.mainHorseId = d.id;
  }

  dismount(game: Game, thrown: boolean): void {
    const h = this.mount;
    if (!h) return;
    if (!thrown && Math.abs(h.speed) > h.stats.gaitSpeed.trot * 1.1) {
      // Leaping off a galloping horse hurts.
      this.damage(10, game, 'fall');
    }
    h.rider = null;
    this.mount = null;
    const side = h.heading + Math.PI / 2;
    // Step down beside the horse — never through a wall into a building the horse isn't in.
    const horseInside = !!game.world.insideBuilding(h.x, h.y);
    for (const off of [12, -12, 20, -20]) {
      const nx = h.x + Math.cos(side) * off;
      const ny = h.y + Math.sin(side) * off;
      if (!game.world.blockedPx(nx, ny) && (horseInside || !game.world.insideBuilding(nx, ny))) {
        this.x = nx;
        this.y = ny;
        break;
      }
    }
    if (thrown) {
      this.actionAnim = 'dead';
      this.actionT = 0.9;
    }
  }

  damage(amount: number, game: Game, source: string): void {
    if (!this.alive || this.invuln > 0) return;
    this.stats.health -= amount;
    game.renderer.shake(Math.min(6, amount * 0.25));
    game.renderer.flashDamage();
    if (this.stats.health <= 0) this.die(game, source);
  }

  die(game: Game, cause: string): void {
    if (!this.alive) return;
    this.alive = false;
    if (this.mount) this.dismount(game, true);
    game.onPlayerDeath(cause);
  }

  startReload(game: Game): void {
    const w = this.weapon;
    if (!w) return;
    const ws = getItem(w).weapon!;
    if (!ws.ammo || ws.clip <= 0) return;
    if ((this.clip[w] ?? 0) >= ws.clip || !this.inv.has(ws.ammo)) return;
    this.reloadT = ws.reloadTime;
    game.audio.play('reload', this.x, this.y);
  }

  private finishReload(game: Game): void {
    const w = this.weapon;
    if (!w) return;
    const ws = getItem(w).weapon!;
    if (!ws.ammo) return;
    const need = ws.clip - (this.clip[w] ?? 0);
    const have = this.inv.count(ws.ammo);
    const n = Math.min(need, have);
    this.inv.remove(ws.ammo, n);
    this.clip[w] = (this.clip[w] ?? 0) + n;
    void game;
  }

  /** Play a short action animation (interactions). */
  act(seconds: number, anim: HumanAnim = 'interact'): void {
    this.actionT = seconds;
    this.actionAnim = anim;
  }

  private dirFromAngle(): { dir: Dir; flip: boolean } {
    const f = facing4(this.angle);
    if (f === 0) return { dir: 'side', flip: false };
    if (f === 2) return { dir: 'side', flip: true };
    return { dir: f === 1 ? 'down' : 'up', flip: false };
  }

  draw(r: Renderer, game: Game): void {
    if (this.mount || game.titleMode) return; // drawn by the horse / hidden on the title screen
    const set = humanSprites(this.look);
    const { dir, flip } = this.dirFromAngle();
    this.dir = dir;
    this.flip = flip;
    const frames = set.frames[dir][this.anim] ?? set.frames[dir].idle;
    const f = frames[Math.floor(this.animT) % frames.length]!;
    r.shadow(this.x, this.y, 5, 2.5, 0);
    const w = this.anim === 'dead' ? PW + 8 : PW;
    r.sprite(f, Math.round(this.x - w / 2), Math.round(this.y - PH + 1), flip, this.crouching ? 0.85 : 1);
    if (this.aiming) r.aimLine(this, game);
  }

  /** Rider composited onto the horse frame. */
  drawMounted(r: Renderer, game: Game, h: HorseEntity, frame: HorseFrame, hx: number, hy: number, flip: boolean, view: 'side' | 'front' | 'back'): void {
    const set = humanSprites(this.look);
    const aimDir = this.aiming ? this.dirFromAngle() : null;
    const dir: Dir = view === 'side' ? 'side' : view === 'front' ? 'down' : 'up';
    const anim: HumanAnim = this.aiming || (this.weapon && this.fireCooldown > 0) ? 'shoot' : 'ride';
    const frames = set.frames[aimDir?.dir ?? dir][anim];
    const f = frames[Math.floor(game.time * 2) % frames.length]!;
    const seatX = flip ? HW - frame.sx : frame.sx;
    const rx = hx + seatX - (view === 'side' ? (flip ? PW - 9 : 9) : 10);
    const ry = hy + frame.sy - 17;
    // Leg hanging over the horse's side.
    const pants = this.look.pants;
    const boots = this.look.boots;
    if (view === 'side') {
      const lx = hx + seatX + (flip ? 0 : -1);
      r.rect(lx, hy + frame.sy, 2, 6, pants);
      r.rect(lx - (flip ? 1 : 0), hy + frame.sy + 6, 3, 2, boots);
    }
    r.sprite(f, Math.round(rx), Math.round(ry), aimDir ? aimDir.flip : flip, 1);
    if (view !== 'side') {
      r.rect(hx + seatX - 7, hy + frame.sy, 2, 6, pants);
      r.rect(hx + seatX + 5, hy + frame.sy, 2, 6, pants);
      r.rect(hx + seatX - 7, hy + frame.sy + 6, 2, 2, boots);
      r.rect(hx + seatX + 5, hy + frame.sy + 6, 2, 2, boots);
    }
    if (this.aiming) r.aimLine(this, game);
    void h;
  }
}
