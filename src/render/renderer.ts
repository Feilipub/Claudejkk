/**
 * Frame renderer. Draws the low-resolution world buffer (terrain chunks,
 * y-sorted props/buildings/entities, weather, lighting) and scales it to the
 * screen with integer pixel-perfect scaling.
 */
import { Rng } from '../core/rng.ts';
import type { Entity } from '../entities/entity.ts';
import type { Player } from '../entities/player.ts';
import type { Game } from '../game.ts';
import { F, O, OBJ } from '../world/tiles.ts';
import type { Building } from '../world/world.ts';
import { buildingSprite } from './buildingSprite.ts';
import { propSprite } from './propSprite.ts';
import { CHUNK, CPX, TerrainCache, drawWaterGlints, visibleObjects } from './terrain.ts';

interface Drawable {
  y: number;
  draw: () => void;
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  color: string;
  size: number;
  kind: 'dust' | 'splash' | 'blood' | 'smoke' | 'spark' | 'ember' | 'muzzle' | 'text';
  text?: string;
}

export interface Light {
  x: number;
  y: number;
  r: number;
  color: string;
  flicker?: boolean;
}

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Low-res world buffer. */
  buf: HTMLCanvasElement;
  c: CanvasRenderingContext2D;
  light: HTMLCanvasElement;
  lc: CanvasRenderingContext2D;
  scale = 3;
  vw = 480;
  vh = 270;
  camX = 0;
  camY = 0;
  terrain!: TerrainCache;
  private drawables: Drawable[] = [];
  private objs: { tx: number; ty: number; o: number }[] = [];
  particles: Particle[] = [];
  lights: Light[] = [];
  private shakeAmt = 0;
  private dmgFlash = 0;
  private rain: { x: number; y: number; s: number }[] = [];
  private rng = new Rng(99);
  tracers: { x1: number; y1: number; x2: number; y2: number; t: number }[] = [];
  /** Hoof prints and footprints pressed into soft ground; they fade over a couple of minutes. */
  prints: { x: number; y: number; a: number; kind: 'hoof' | 'boot'; surface: string; t: number }[] = [];

  /** Leave a print on soft ground (snow, sand, mud, wet dirt). */
  addPrint(x: number, y: number, heading: number, kind: 'hoof' | 'boot', surface: string): void {
    if (surface !== 'snow' && surface !== 'sand' && surface !== 'mud') return;
    this.prints.push({ x, y, a: heading, kind, surface, t: 0 });
    if (this.prints.length > 500) this.prints.splice(0, this.prints.length - 500);
  }
  /** Building the player is currently inside (roof hidden). */
  insideBuilding: Building | null = null;
  roofFade = new Map<string, number>();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.buf = document.createElement('canvas');
    this.c = this.buf.getContext('2d')!;
    this.light = document.createElement('canvas');
    this.lc = this.light.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    for (let i = 0; i < 400; i++) this.rain.push({ x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 0.8 });
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.scale = Math.max(2, Math.round(h / 270));
    this.vw = Math.ceil(w / this.scale);
    this.vh = Math.ceil(h / this.scale);
    this.canvas.width = w;
    this.canvas.height = h;
    this.buf.width = this.vw;
    this.buf.height = this.vh;
    this.light.width = this.vw;
    this.light.height = this.vh;
    this.ctx.imageSmoothingEnabled = false;
    this.c.imageSmoothingEnabled = false;
  }

  /** Accessibility: disables screen shake when true. */
  reducedMotion = false;
  shake(n: number): void {
    if (this.reducedMotion) return;
    this.shakeAmt = Math.max(this.shakeAmt, n);
  }
  flashDamage(): void {
    this.dmgFlash = 1;
  }

  /** Screen (CSS px) → world px. */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: this.camX + sx / this.scale, y: this.camY + sy / this.scale };
  }

  // --- Primitive helpers used by entities (world coordinates) ---------------
  /** Draw a sprite shrunk about its bottom-centre (children, foals). Nearest-neighbour keeps it crisp. */
  spriteScaled(img: CanvasImageSource | OffscreenCanvas, footX: number, footY: number, flip: boolean, scale: number): void {
    const c = this.c;
    const w = (img as HTMLCanvasElement).width;
    const h = (img as HTMLCanvasElement).height;
    const sw = Math.round(w * scale);
    const sh = Math.round(h * scale);
    const dx = Math.round(footX - sw / 2 - this.camX);
    const dy = Math.round(footY - sh - this.camY);
    c.save();
    c.imageSmoothingEnabled = false;
    if (flip) {
      c.translate(dx + sw, dy);
      c.scale(-1, 1);
      c.drawImage(img as CanvasImageSource, 0, 0, sw, sh);
    } else c.drawImage(img as CanvasImageSource, dx, dy, sw, sh);
    c.restore();
  }

  sprite(img: CanvasImageSource | OffscreenCanvas, x: number, y: number, flip: boolean, alpha = 1): void {
    const c = this.c;
    const dx = Math.round(x - this.camX);
    const dy = Math.round(y - this.camY);
    const w = (img as HTMLCanvasElement).width;
    if (alpha !== 1) c.globalAlpha = alpha;
    if (flip) {
      c.save();
      c.translate(dx + w, dy);
      c.scale(-1, 1);
      c.drawImage(img as CanvasImageSource, 0, 0);
      c.restore();
    } else c.drawImage(img as CanvasImageSource, dx, dy);
    if (alpha !== 1) c.globalAlpha = 1;
  }
  rect(x: number, y: number, w: number, h: number, color: string): void {
    this.c.fillStyle = color;
    this.c.fillRect(Math.round(x - this.camX), Math.round(y - this.camY), w, h);
  }
  shadow(x: number, y: number, rx: number, ry: number, lift: number): void {
    const c = this.c;
    c.fillStyle = `rgba(20,14,10,${0.28 * this.shadowStrength})`;
    c.beginPath();
    c.ellipse(Math.round(x - this.camX + this.sunDx * 2), Math.round(y - this.camY + 1), rx * (1 - lift * 0.02), ry, 0, 0, Math.PI * 2);
    c.fill();
  }
  aimLine(p: Player, game: Game): void {
    const m = game.mouseWorld();
    const c = this.c;
    c.strokeStyle = 'rgba(255,240,200,0.25)';
    c.setLineDash([2, 3]);
    c.beginPath();
    c.moveTo(Math.round(p.x - this.camX), Math.round(p.y - 10 - this.camY));
    c.lineTo(Math.round(m.x - this.camX), Math.round(m.y - this.camY));
    c.stroke();
    c.setLineDash([]);
  }
  text(x: number, y: number, s: string, color = '#f4e8c8'): void {
    const c = this.c;
    c.font = '8px Pix, monospace';
    c.textAlign = 'center';
    c.fillStyle = 'rgba(0,0,0,0.6)';
    c.fillText(s, Math.round(x - this.camX) + 1, Math.round(y - this.camY) + 1);
    c.fillStyle = color;
    c.fillText(s, Math.round(x - this.camX), Math.round(y - this.camY));
  }

  spawn(p: Partial<Particle> & { x: number; y: number; kind: Particle['kind'] }): void {
    if (this.particles.length > 600) return;
    this.particles.push({ z: 0, vx: 0, vy: 0, vz: 0, life: 1, max: 1, color: '#c8b48a', size: 1, ...p } as Particle);
  }
  dust(x: number, y: number, color: string, n = 2): void {
    for (let i = 0; i < n; i++)
      this.spawn({ x: x + this.rng.range(-4, 4), y: y + this.rng.range(-1, 2), vx: this.rng.range(-10, 10), vy: this.rng.range(-5, 2), vz: this.rng.range(6, 16), kind: 'dust', life: 0.8, max: 0.8, color, size: this.rng.chance(0.45) ? 2 : 1 });
  }

  private sunDx = 0;
  private shadowStrength = 1;

  render(game: Game, dt: number): void {
    const W = game.world;
    const c = this.c;
    const p = game.player;
    // Camera follows player with look-ahead when riding.
    let tx = p.x;
    let ty = p.y - 8;
    if (p.mount) {
      tx += Math.cos(p.mount.heading) * p.mount.speed * 0.35;
      ty += Math.sin(p.mount.heading) * p.mount.speed * 0.25;
    }
    if (p.aiming) {
      const m = game.mouseWorld();
      tx += (m.x - p.x) * 0.25;
      ty += (m.y - p.y) * 0.25;
    }
    const k = 1 - Math.exp(-6 * dt);
    this.camXf += (tx - this.vw / 2 - this.camXf) * k;
    this.camYf += (ty - this.vh / 2 - this.camYf) * k;
    if (this.snapCamera) {
      this.camXf = tx - this.vw / 2;
      this.camYf = ty - this.vh / 2;
      this.snapCamera = false;
    }
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 20);
    this.camX = Math.round(this.camXf + (this.shakeAmt ? this.rng.range(-this.shakeAmt, this.shakeAmt) : 0));
    this.camY = Math.round(this.camYf + (this.shakeAmt ? this.rng.range(-this.shakeAmt, this.shakeAmt) : 0));
    const sun = game.clock.sun;
    this.sunDx = sun.dx * sun.len;
    this.shadowStrength = 0.4 + game.clock.daylight * 0.6 - game.weather.current.clouds * 0.3;

    // Terrain chunks (paint at most one new chunk per frame unless forced).
    c.fillStyle = '#1b2a30';
    c.fillRect(0, 0, this.vw, this.vh);
    const cx0 = Math.floor(this.camX / CPX);
    const cy0 = Math.floor(this.camY / CPX);
    const cx1 = Math.floor((this.camX + this.vw) / CPX);
    const cy1 = Math.floor((this.camY + this.vh) / CPX);
    let painted = 0;
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++) {
        if (cx < 0 || cy < 0 || cx * CHUNK >= W.w || cy * CHUNK >= W.h) continue;
        const allow = painted < 2 || this.forcePaint;
        const had = this.terrain.has(cx, cy);
        const ch = this.terrain.get(cx, cy, allow);
        if (!had && ch) painted++;
        if (ch) c.drawImage(ch as CanvasImageSource, cx * CPX - this.camX, cy * CPX - this.camY);
      }
    this.forcePaint = false;
    // Pre-stream neighbours lazily.
    if (painted === 0) {
      const hx = p.mount ? Math.cos(p.mount.heading) : 0;
      const hy = p.mount ? Math.sin(p.mount.heading) : 0;
      const ncx = Math.floor((p.x + hx * 400) / CPX);
      const ncy = Math.floor((p.y + hy * 300) / CPX);
      if (ncx >= 0 && ncy >= 0 && ncx * CHUNK < W.w && ncy * CHUNK < W.h) this.terrain.get(ncx, ncy, true);
    }

    const ttx0 = Math.floor(this.camX / 16) - 2;
    const tty0 = Math.floor(this.camY / 16) - 2;
    const ttx1 = Math.floor((this.camX + this.vw) / 16) + 2;
    const tty1 = Math.floor((this.camY + this.vh) / 16) + 4;
    c.save();
    c.translate(-this.camX, -this.camY);
    drawWaterGlints(c, W, ttx0, tty0, ttx1, tty1, game.time, game.clock.daylight);
    c.restore();

    // Tracks in soft ground, under everything else.
    for (const pr of this.prints) {
      pr.t += dt;
      const life = pr.surface === 'snow' ? 240 : 150;
      if (pr.t > life) continue;
      const sx = Math.round(pr.x - this.camX);
      const sy = Math.round(pr.y - this.camY);
      if (sx < -4 || sy < -4 || sx > this.vw + 4 || sy > this.vh + 4) continue;
      c.globalAlpha = (1 - pr.t / life) * (pr.surface === 'snow' ? 0.55 : 0.35);
      c.fillStyle = pr.surface === 'snow' ? '#7484a4' : pr.surface === 'mud' ? '#2e2218' : '#8a6a48';
      const px2 = Math.round(Math.cos(pr.a + Math.PI / 2) * 2);
      const py2 = Math.round(Math.sin(pr.a + Math.PI / 2) * 1);
      if (pr.kind === 'hoof') {
        c.fillRect(sx - px2 - 1, sy - py2, 2, 2);
        c.fillRect(sx + px2 - 1, sy + py2, 2, 2);
      } else c.fillRect(sx, sy, 2, 1);
    }
    c.globalAlpha = 1;
    this.prints = this.prints.filter((p) => p.t < (p.surface === 'snow' ? 240 : 150));

    // Inside detection for roof hiding.
    this.insideBuilding = p.mount ? null : W.insideBuilding(p.x, p.y);

    // Collect drawables.
    const dr = this.drawables;
    dr.length = 0;
    visibleObjects(W, ttx0, tty0, ttx1, tty1, this.objs);
    for (const ob of this.objs) {
      const warmRock = (ob.o === O.Boulder || ob.o === O.RockSmall) && W.region[W.idx(ob.tx, ob.ty)]! >= 4; // drylands, redstone
      const sp = propSprite(ob.o, ((ob.tx * 7 + ob.ty * 13) % 3) + (warmRock ? 3 : 0));
      if (!sp) continue;
      const x = ob.tx * 16 + sp.ox;
      const y = ob.ty * 16 + sp.oy;
      const big = sp.shadow > 6;
      const def = OBJ[ob.o]!;
      if (ob.o === O.LampPost && game.clock.daylight < 0.6) this.lights.push({ x: ob.tx * 16 + 8, y: ob.ty * 16 - 10, r: 76, color: 'rgba(255,190,105,1)', flicker: true });
      // Fences and furniture align with the tile bottom; trees anchor near their base.
      dr.push({
        y: ob.ty * 16 + (def.radius ? 12 : 14),
        draw: () => {
          if (sp.shadow) {
            c.fillStyle = `rgba(20,14,10,${0.22 * this.shadowStrength})`;
            c.beginPath();
            const sx = ob.tx * 16 + 8 - this.camX + this.sunDx * (big ? 5 : 2);
            c.ellipse(Math.round(sx), ob.ty * 16 + 13 - this.camY, sp.shadow * (big ? 1 + Math.abs(this.sunDx) * 0.3 : 1), sp.shadow * 0.4, 0, 0, Math.PI * 2);
            c.fill();
          }
          const img = sp.img as CanvasImageSource;
          const w = (sp.img as HTMLCanvasElement).width;
          const hgt = (sp.img as HTMLCanvasElement).height;
          const dx = Math.round(x - this.camX);
          const dy = Math.round(y - this.camY);
          // See-through canopy when the player (or their horse) is hidden behind it.
          const p = game.player;
          const behind = big && p.y < ob.ty * 16 + 12 && p.y > y + 4 && Math.abs(p.x - (ob.tx * 16 + 8)) < w / 2 + 4;
          if (behind) c.globalAlpha = 0.5;
          if (big && hgt > 30) {
            // Canopy sways in the wind: the top slice shears a pixel or two, the trunk stays put.
            const wind = game.weather.current.wind;
            const sway = Math.round(Math.sin(game.time * (1.2 + wind) + ob.tx * 0.7 + ob.ty * 0.3) * (0.6 + wind * 1.6));
            const split = Math.floor(hgt * 0.55);
            c.drawImage(img, 0, 0, w, split, dx + sway, dy, w, split);
            c.drawImage(img, 0, split, w, hgt - split, dx, dy + split, w, hgt - split);
          } else c.drawImage(img, dx, dy);
          if (behind) c.globalAlpha = 1;
        },
      });
    }
    // Buildings.
    for (const b of game.visibleBuildings(this.camX - 64, this.camY - 64, this.camX + this.vw + 64, this.camY + this.vh + 96)) {
      const bs = buildingSprite(b);
      const inside = this.insideBuilding === b;
      const fade = this.roofFade.get(b.id) ?? 1;
      const nf = inside ? Math.max(0, fade - dt * 5) : Math.min(1, fade + dt * 5);
      this.roofFade.set(b.id, nf);
      const bx = b.x * 16 + bs.ox;
      const by = b.y * 16 + bs.oy;
      // Interior back wall drawn first (behind furniture), exterior after.
      if (nf < 1) {
        dr.push({ y: b.y * 16, draw: () => c.drawImage(bs.interior as CanvasImageSource, bx - this.camX, by - this.camY) });
        // Interior lamplight.
        for (let px = 20; px < b.w * 16 - 20; px += 40) this.lights.push({ x: b.x * 16 + px + 1, y: b.y * 16 + 14, r: 70, color: 'rgba(255,190,110,0.9)', flicker: true });
      }
      dr.push({
        y: (b.y + b.h) * 16 - 1,
        draw: () => {
          if (nf <= 0) return;
          c.globalAlpha = nf;
          c.drawImage(bs.exterior as CanvasImageSource, bx - this.camX, by - this.camY);
          // Lamplit windows after dusk (some households turn in early).
          const night = 1 - game.clock.daylight;
          if (night > 0.3 && !b.ruined) {
            const hr = game.clock.hour;
            bs.windows.forEach((wn, wi) => {
              const asleep = (hr > 23.5 || hr < 5) && (wi * 7 + b.x) % 3 !== 0;
              if (asleep) return;
              c.fillStyle = `rgba(255,${190 + ((wi * 37) % 30)},${90 + ((wi * 53) % 40)},${0.85 * night})`;
              c.fillRect(bx + wn.x - this.camX, by + wn.y - this.camY, wn.w, wn.h);
              c.fillStyle = `rgba(120,70,30,${0.5 * night})`;
              c.fillRect(bx + wn.x + Math.floor(wn.w / 2) - this.camX, by + wn.y - this.camY, 1, wn.h);
            });
          }
          c.globalAlpha = 1;
        },
      });
      // Chimney smoke at breakfast and supper time.
      const hr = game.clock.hour;
      if (bs.chimney && ((hr > 5.5 && hr < 9) || (hr > 17 && hr < 22.5)) && Math.random() < dt * 2.5)
        this.spawn({ x: bx + bs.chimney.x, y: by + bs.chimney.y + 30, z: 30, kind: 'smoke', color: '#c8c0b4', vx: 4 + game.weather.current.wind * 14, vy: -2, vz: 10, life: 3, max: 3, size: 2 });
      // Window lights at night.
      if (game.clock.daylight < 0.6 && !b.ruined) for (const w of bs.windows) this.lights.push({ x: bx + w.x + w.w / 2, y: by + w.y + w.h / 2 + 4, r: 30, color: 'rgba(255,190,100,1)' });
    }
    // Entities.
    for (const e of game.entities) {
      if (e.dead) continue;
      if (e.x < this.camX - 64 || e.x > this.camX + this.vw + 64 || e.y < this.camY - 32 || e.y > this.camY + this.vh + 64) continue;
      dr.push({ y: e.sortY, draw: () => e.draw(this, game) });
    }
    dr.sort((a, b) => a.y - b.y);
    for (const d of dr) d.draw();

    // Particles & tracers.
    this.updateParticles(dt, game);
    for (const t of this.tracers) {
      c.strokeStyle = `rgba(255,230,160,${t.t * 3})`;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(t.x1 - this.camX, t.y1 - this.camY);
      c.lineTo(t.x2 - this.camX, t.y2 - this.camY);
      c.stroke();
      t.t -= dt;
    }
    this.tracers = this.tracers.filter((t) => t.t > 0);

    this.updateWeeds(game, dt);
    this.drawWeather(game, dt);
    this.drawLighting(game);
    this.drawAtmosphere(game, dt);
    // Overlays inside world buffer: markers.
    game.drawWorldMarkers(this);

    // Present scaled to screen.
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.buf, 0, 0, this.vw * this.scale, this.vh * this.scale);
    // Vignette & damage flash at full res.
    if (this.dmgFlash > 0) {
      ctx.fillStyle = `rgba(140,10,10,${this.dmgFlash * 0.35})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.dmgFlash = Math.max(0, this.dmgFlash - dt * 2.5);
    }
    if (game.weather.flash > 0) {
      ctx.fillStyle = `rgba(235,240,255,${game.weather.flash * 0.6})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    const g = ctx.createRadialGradient(this.canvas.width / 2, this.canvas.height / 2, this.canvas.height * 0.45, this.canvas.width / 2, this.canvas.height / 2, this.canvas.height * 0.95);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    // Vignette takes the hour's colour: warm umber by day, deep blue at night.
    const nightV = 1 - game.clock.daylight;
    const vr = Math.round(10 + 2 * (1 - nightV));
    const vgc = Math.round(6 + 6 * nightV);
    const vb = Math.round(4 + 22 * nightV);
    // Storms close the frame in: heavy cloud deepens and cools the edges.
    const gloom = game.weather.current.clouds * game.weather.current.rain;
    g.addColorStop(1, `rgba(${vr},${vgc},${Math.round(vb + gloom * 14)},${p.alive ? 0.45 + nightV * 0.08 + gloom * 0.2 : 0.8})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  camXf = 0;
  camYf = 0;
  snapCamera = true;
  forcePaint = true;

  private updateParticles(dt: number, game: Game): void {
    const c = this.c;
    for (const pt of this.particles) {
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.z += pt.vz * dt;
      if (pt.kind !== 'smoke' && pt.kind !== 'ember' && pt.kind !== 'text') pt.vz -= 60 * dt;
      if (pt.z < 0) {
        pt.z = 0;
        pt.vz = 0;
        pt.vx *= 0.5;
        pt.vy *= 0.5;
      }
      const a = Math.max(0, pt.life / pt.max);
      if (pt.kind === 'text') {
        c.globalAlpha = a;
        this.text(pt.x, pt.y - pt.z, pt.text ?? '', pt.color);
        c.globalAlpha = 1;
        continue;
      }
      c.globalAlpha = pt.kind === 'smoke' ? a * 0.5 : pt.kind === 'dust' ? a * 0.8 : a;
      c.fillStyle = pt.color;
      const s = pt.kind === 'smoke' ? pt.size + (1 - a) * 3 : pt.size;
      c.fillRect(Math.round(pt.x - this.camX - s / 2), Math.round(pt.y - pt.z - this.camY - s / 2), Math.ceil(s), Math.ceil(s));
      if (pt.kind === 'muzzle' || pt.kind === 'ember') this.lights.push({ x: pt.x, y: pt.y - pt.z, r: pt.kind === 'muzzle' ? 30 : 6, color: 'rgba(255,190,90,0.9)' });
    }
    c.globalAlpha = 1;
    this.particles = this.particles.filter((p) => p.life > 0);
    void game;
  }

  /** Decorative tumbleweeds rolling with the wind across dry country. */
  private weeds: { x: number; y: number; vx: number; z: number; vz: number; r: number; rot: number; life: number }[] = [];
  private weedCanvas: HTMLCanvasElement | null = null;
  private weedSprite(): HTMLCanvasElement {
    if (this.weedCanvas) return this.weedCanvas;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 12;
    const c = cv.getContext('2d')!;
    const rng = new Rng(55);
    c.strokeStyle = '#8a7048';
    c.lineWidth = 1;
    for (let i = 0; i < 16; i++) {
      const a = rng.range(0, Math.PI * 2);
      const b = a + rng.range(1, 3);
      c.strokeStyle = i % 3 ? '#8a7048' : '#b0925e';
      c.beginPath();
      c.moveTo(6 + Math.cos(a) * 5, 6 + Math.sin(a) * 5);
      c.quadraticCurveTo(6, 6, 6 + Math.cos(b) * 5, 6 + Math.sin(b) * 5);
      c.stroke();
    }
    this.weedCanvas = cv;
    return cv;
  }
  private updateWeeds(game: Game, dt: number): void {
    const c = this.c;
    const w = game.weather.current;
    const dry = game.currentRegion === 'drylands' || game.currentRegion === 'dustfall' || game.currentRegion === 'redstone';
    if (dry && w.rain < 0.1 && this.weeds.length < 3 && this.rng.chance(dt * (0.05 + w.wind * 0.25))) {
      this.weeds.push({ x: this.camX - 10, y: this.camY + this.rng.range(20, this.vh - 10), vx: 30 + w.wind * 50 + this.rng.range(0, 20), z: 0, vz: 0, r: 0, rot: 0, life: 30 });
    }
    const img = this.weedSprite();
    for (const t of this.weeds) {
      t.life -= dt;
      t.x += t.vx * dt;
      t.vz -= 120 * dt;
      t.z += t.vz * dt;
      if (t.z <= 0) {
        t.z = 0;
        t.vz = this.rng.range(20, 45); // bounce
      }
      t.rot += (t.vx / 6) * dt;
      const sx = Math.round(t.x - this.camX);
      const sy = Math.round(t.y - this.camY);
      c.fillStyle = 'rgba(20,14,10,0.22)';
      c.fillRect(sx - 4, sy + 4, 8, 2);
      c.save();
      c.translate(sx, sy - t.z);
      c.rotate(Math.round(t.rot * 4) / 4);
      c.drawImage(img, -6, -6);
      c.restore();
    }
    this.weeds = this.weeds.filter((t) => t.life > 0 && t.x < this.camX + this.vw + 20);
  }

  private cloudCanvas: HTMLCanvasElement | null = null;
  private fogCanvas: HTMLCanvasElement | null = null;
  /** A tileable sheet of soft cloud shadows. */
  private cloudShadows(): HTMLCanvasElement {
    if (!this.cloudCanvas) this.cloudCanvas = this.blobSheet(7, 9, '24,26,48', 0.55);
    return this.cloudCanvas;
  }
  /** A tileable sheet of pale fog banks (drawn before lighting, so the hour tints it). */
  private fogBanks(): HTMLCanvasElement {
    if (!this.fogCanvas) this.fogCanvas = this.blobSheet(31, 14, '226,230,234', 0.5);
    return this.fogCanvas;
  }
  private blobSheet(seed: number, blobs: number, rgb: string, alpha: number): HTMLCanvasElement {
    const size = 640;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const c = cv.getContext('2d')!;
    const rng = new Rng(seed);
    for (let i = 0; i < blobs; i++) {
      const cx = rng.range(0, size);
      const cy = rng.range(0, size);
      for (let k = 0; k < 6; k++) {
        const x = cx + rng.range(-70, 70);
        const y = cy + rng.range(-30, 30);
        const r = rng.range(40, 90);
        for (const [dx, dy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
          const g = c.createRadialGradient(x + dx!, y + dy!, 0, x + dx!, y + dy!, r);
          g.addColorStop(0, `rgba(${rgb},${alpha})`);
          g.addColorStop(1, `rgba(${rgb},0)`);
          c.fillStyle = g;
          c.fillRect(x + dx! - r, y + dy! - r, r * 2, r * 2);
        }
      }
    }
    return cv;
  }

  private drawWeather(game: Game, dt: number): void {
    const c = this.c;
    const w = game.weather.current;
    const inside = !!this.insideBuilding;
    // Cloud shadows: soft dark shapes drifting across the land with the wind.
    if (!inside) {
      const cover = 0.18 + w.clouds * 0.8;
      const cs = this.cloudShadows();
      const size = cs.width;
      const drift = game.time * (6 + w.wind * 22);
      const ox = ((((this.camX + drift) * 0.9) % size) + size) % size;
      const oy = ((((this.camY + drift * 0.35) * 0.9) % size) + size) % size;
      c.globalAlpha = Math.min(0.55, cover * 0.55) * (0.4 + 0.6 * game.clock.daylight);
      for (let y = -oy; y < this.vh; y += size) for (let x = -ox; x < this.vw; x += size) c.drawImage(cs, Math.round(x), Math.round(y));
      c.globalAlpha = 1;
      if (w.clouds > 0.05) {
        c.fillStyle = `rgba(30,35,50,${w.clouds * 0.14})`;
        c.fillRect(0, 0, this.vw, this.vh);
      }
    }
    if (w.rain > 0.004 && !inside) {
      // Drops ramp in on a curve so the first light shower is visible as soon as the
      // weather turns, not only once the blend has crept past a few percent.
      const vis = Math.min(1, Math.pow(w.rain, 0.55) * 1.1);
      // Wet ground: a cool glaze that deepens as the rain settles in.
      c.fillStyle = `rgba(36,52,78,${vis * 0.12})`;
      c.fillRect(0, 0, this.vw, this.vh);
      // Storm sheets: broad translucent curtains of rain sweeping with the wind.
      if (w.rain > 0.45) {
        const sheetA = (w.rain - 0.45) * 0.11;
        const slant = 40 + w.wind * 60;
        for (let k = 0; k < 3; k++) {
          const span = this.vw + slant + 160;
          const x0 = ((game.time * (70 + w.wind * 90) + k * 197) % span) - slant - 80;
          c.fillStyle = `rgba(200,212,232,${sheetA * (k === 1 ? 1.3 : 0.8)})`;
          c.beginPath();
          c.moveTo(x0 + slant, 0);
          c.lineTo(x0 + slant + 50 + k * 18, 0);
          c.lineTo(x0 + 50 + k * 18, this.vh);
          c.lineTo(x0, this.vh);
          c.fill();
        }
      }
      c.strokeStyle = `rgba(196,210,230,${0.3 + vis * 0.32})`;
      c.lineWidth = 1;
      c.beginPath();
      const n = Math.floor(this.rain.length * vis);
      for (let i = 0; i < n; i++) {
        const d = this.rain[i]!;
        d.y += dt * 1.6 * d.s;
        d.x += dt * 0.25 * w.wind;
        if (d.y > 1) {
          d.y -= 1;
          d.x = Math.random();
          if (this.rng.chance(0.3)) this.spawn({ x: this.camX + d.x * this.vw, y: this.camY + this.rng.range(0, this.vh), kind: 'splash', life: 0.2, max: 0.2, color: 'rgba(200,215,235,0.8)' });
        }
        if (d.x > 1) d.x -= 1;
        const x = Math.round(d.x * this.vw);
        const y = Math.round(d.y * this.vh);
        c.moveTo(x, y);
        c.lineTo(x - 2 * w.wind, y + (d.s > 1.1 ? 6 : 4));
      }
      c.stroke();
    }
    if (w.snow > 0.02 && !inside) {
      c.fillStyle = 'rgba(245,248,252,0.9)';
      const n = Math.floor(this.rain.length * w.snow);
      for (let i = 0; i < n; i++) {
        const d = this.rain[i]!;
        d.y += dt * 0.12 * d.s;
        d.x += dt * (0.05 * w.wind + Math.sin(game.time + i) * 0.01);
        if (d.y > 1) d.y -= 1;
        if (d.x > 1) d.x -= 1;
        if (d.x < 0) d.x += 1;
        c.fillRect(Math.round(d.x * this.vw), Math.round(d.y * this.vh), d.s > 1.1 ? 2 : 1, 1);
      }
      if (w.snow > 0.6) {
        c.fillStyle = `rgba(230,236,245,${(w.snow - 0.6) * 0.8})`;
        c.fillRect(0, 0, this.vw, this.vh);
      }
    }
    if (w.dust > 0.05 && !inside) {
      c.fillStyle = `rgba(190,150,100,${w.dust * 0.35})`;
      c.fillRect(0, 0, this.vw, this.vh);
      c.fillStyle = 'rgba(210,175,120,0.6)';
      const n = Math.floor(200 * w.dust);
      for (let i = 0; i < n; i++) {
        const d = this.rain[i]!;
        d.x += dt * 0.5 * d.s;
        if (d.x > 1) d.x -= 1;
        c.fillRect(Math.round(d.x * this.vw), Math.round(d.y * this.vh), 2, 1);
      }
    }
    // Fog: drifting banks at two depths over an even veil, plus a thin ground mist
    // that pools at dawn on clear mornings.
    const hr = game.clock.hour;
    const dawnMist = inside ? 0 : Math.max(0, 1 - Math.abs(hr - 6.3) / 1.6) * 0.32 * (1 - w.rain) * (1 - w.dust);
    const fog = Math.max(w.fog, dawnMist);
    if (fog > 0.03) {
      c.fillStyle = `rgba(206,210,214,${fog * 0.16})`;
      c.fillRect(0, 0, this.vw, this.vh);
      const fb = this.fogBanks();
      const size = fb.width;
      for (let layer = 0; layer < 2; layer++) {
        const par = layer ? 1.15 : 0.85;
        const drift = game.time * (4 + w.wind * 10) * (layer ? 1.6 : 1);
        const ox = ((((this.camX * par + drift) % size) + size) % size) + layer * 211;
        const oy = ((((this.camY * par + drift * 0.2) % size) + size) % size) + layer * 97;
        c.globalAlpha = Math.min(1, fog * (layer ? 0.45 : 0.7));
        for (let y = -(oy % size); y < this.vh; y += size) for (let x = -(ox % size); x < this.vw; x += size) c.drawImage(fb, Math.round(x), Math.round(y));
      }
      c.globalAlpha = 1;
      // A clear pocket around the player keeps them readable in the murk.
      const g = c.createRadialGradient(this.vw / 2, this.vh / 2, 10, this.vw / 2, this.vh / 2, this.vw * 0.65);
      g.addColorStop(0, 'rgba(206,210,214,0)');
      g.addColorStop(1, `rgba(206,210,214,${fog * 0.4})`);
      c.fillStyle = g;
      c.fillRect(0, 0, this.vw, this.vh);
    }
  }

  private rayCanvas: HTMLCanvasElement | null = null;
  private rayShadeCanvas: HTMLCanvasElement | null = null;
  /**
   * A strip of uneven light shafts; stretched and rotated it reads as sun through haze.
   * Its complement (the gaps) is kept as a second strip of cool shadow bands: shafts
   * only read on pale ground when the light is framed by darker air on either side.
   */
  private raySheet(): HTMLCanvasElement {
    if (this.rayCanvas) return this.rayCanvas;
    const mk = () => {
      const cv = document.createElement('canvas');
      cv.width = 96;
      cv.height = 8;
      return cv;
    };
    const cv = mk();
    const sh = mk();
    const c = cv.getContext('2d')!;
    const d = sh.getContext('2d')!;
    const rng = new Rng(17);
    // Each band is a soft-edged column (horizontal falloff) faded along its length, so
    // stretched across the screen the shafts have the feathered edges of light in haze.
    const band = (ctx: CanvasRenderingContext2D, x: number, w: number, rgb: string, a: number, tail: number) => {
      for (let y = 0; y < 8; y++) {
        const k = a * (1 - (1 - tail) * (y / 7));
        const g = ctx.createLinearGradient(x - 1.5, 0, x + w + 1.5, 0);
        g.addColorStop(0, `rgba(${rgb},0)`);
        g.addColorStop(0.35, `rgba(${rgb},${k})`);
        g.addColorStop(0.65, `rgba(${rgb},${k})`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x - 1.5, y, w + 3, 1);
      }
    };
    for (let x = 0; x < 96; ) {
      const w = Math.round(rng.range(2, 10));
      if (rng.chance(0.45)) band(c, x, w, '255,222,150', rng.range(0.45, 1), 0.2);
      else band(d, x, w, '96,78,120', rng.range(0.4, 1), 0.35);
      x += w;
    }
    this.rayCanvas = cv;
    this.rayShadeCanvas = sh;
    return cv;
  }

  /**
   * Post-light atmosphere, composited over the graded world: low-sun shafts and
   * floating motes at golden hour, and a heat shimmer over hot dry country at midday.
   * All of it is a handful of draw calls; no per-pixel work.
   */
  private drawAtmosphere(game: Game, dt: number): void {
    void dt;
    if (this.insideBuilding) return;
    const c = this.c;
    const w = game.weather.current;
    const h = game.clock.hour;
    const clear = Math.max(0, 1 - w.clouds * 1.4) * (1 - w.rain) * (1 - w.fog * 0.6);
    const golden = (Math.max(0, 1 - Math.abs(h - 18.1) / 1.5) + Math.max(0, 1 - Math.abs(h - 6.9) / 1.3) * 0.8) * clear;
    if (golden > 0.02) {
      const morning = h < 12;
      const sheet = this.raySheet();
      const diag = Math.hypot(this.vw, this.vh);
      const drift = this.reducedMotion ? 0 : Math.sin(game.time * 0.07) * 18;
      const lean = morning ? -0.55 : 0.55;
      const slide = drift - ((this.camX * 0.3) % 40);
      c.save();
      c.imageSmoothingEnabled = true;
      // Low-sun haze: the whole frame washes warm toward the sun's side (aerial
      // perspective), which is what makes the shafts feel like they come from somewhere.
      // Same side the cast shadows point away from (see clock.sun): left at dawn, right at dusk.
      const sunX = morning ? 0 : this.vw;
      const haze = c.createLinearGradient(sunX, 0, this.vw - sunX, this.vh * 0.6);
      haze.addColorStop(0, 'rgba(255,200,120,0.5)');
      haze.addColorStop(0.55, 'rgba(255,190,120,0.12)');
      haze.addColorStop(1, 'rgba(255,190,120,0)');
      c.globalCompositeOperation = 'screen';
      c.globalAlpha = golden * 0.55;
      c.fillStyle = haze;
      c.fillRect(0, 0, this.vw, this.vh);
      // Rays slant away from the low sun: from the east in the morning, the west at evening.
      c.translate(this.vw / 2, this.vh / 2);
      c.rotate(lean);
      // Cool shadow bands between the shafts first (multiply), then the shafts (screen).
      if (this.rayShadeCanvas) {
        c.globalCompositeOperation = 'multiply';
        c.globalAlpha = Math.min(0.32, golden * 0.34);
        c.drawImage(this.rayShadeCanvas, -diag / 2 + slide, -diag / 2, diag, diag);
      }
      c.globalCompositeOperation = 'screen';
      c.globalAlpha = Math.min(0.66, golden * 0.7);
      c.drawImage(sheet, -diag / 2 + slide, -diag / 2, diag, diag);
      c.restore();
      c.imageSmoothingEnabled = false;
      // Warm motes of dust and pollen drifting in the slanting light.
      const n = Math.round(46 * golden);
      const t = this.reducedMotion ? 0 : game.time;
      c.fillStyle = 'rgba(255,232,178,0.75)';
      for (let i = 0; i < n; i++) {
        const sx = (i * 97.3 + t * (4 + (i % 5)) * (morning ? -1 : 1) - this.camX * 0.6) % this.vw;
        const sy = (i * 53.7 + Math.sin(t * 0.6 + i) * 6 - this.camY * 0.6) % this.vh;
        c.globalAlpha = golden * (0.35 + 0.35 * Math.sin(t * 1.3 + i * 2.1));
        if (c.globalAlpha > 0.05) c.fillRect(Math.round(sx < 0 ? sx + this.vw : sx), Math.round(sy < 0 ? sy + this.vh : sy), 1, 1);
      }
      c.globalAlpha = 1;
    }
    // Heat shimmer: a few thin horizontal bands of the frame nudged sideways a pixel.
    const dry = game.currentRegion === 'drylands' || game.currentRegion === 'dustfall' || game.currentRegion === 'redstone';
    const heat = dry && !this.reducedMotion ? Math.max(0, 1 - Math.abs(h - 14) / 2.6) * clear : 0;
    if (heat > 0.15) {
      const bands = 7;
      for (let i = 0; i < bands; i++) {
        const y = Math.floor(((i * 41 + game.time * 9) % this.vh) / 2) * 2;
        const off = Math.round(Math.sin(game.time * 5 + i * 1.7) * heat);
        if (!off) continue;
        c.drawImage(this.buf, 0, y, this.vw, 2, off, y, this.vw, 2);
      }
    }
  }

  private drawLighting(game: Game): void {
    const day = game.clock.daylight;
    const lc = this.lc;
    const h = game.clock.hour;
    // Time-of-day light, keyed like a landscape painter's day: pink dawn, warm morning,
    // neutral noon, golden afternoon, orange sunset, violet dusk, blue night.
    const KEYS: [number, [number, number, number]][] = [
      [0, [66, 80, 132]], [4.5, [70, 82, 132]], [5.6, [150, 112, 134]], [6.6, [255, 196, 150]], [8, [255, 240, 222]],
      [12, [255, 252, 244]], [16, [255, 246, 228]], [17.4, [255, 224, 176]], [18.7, [252, 176, 124]], [19.7, [160, 106, 132]],
      [21, [76, 86, 138]], [24, [66, 80, 132]],
    ];
    let ki = 0;
    while (ki < KEYS.length - 2 && KEYS[ki + 1]![0] <= h) ki++;
    const [h0, c0] = KEYS[ki]!;
    const [h1, c1] = KEYS[ki + 1]!;
    const kt = Math.min(1, Math.max(0, (h - h0) / (h1 - h0)));
    let amb: [number, number, number] = [0, 1, 2].map((i) => Math.round(c0[i]! + (c1[i]! - c0[i]!) * kt)) as [number, number, number];
    void day;
    // Regional colour grade: warm desert and canyon, cool high country, green-tinted forest.
    const grade: Record<string, [number, number, number]> = {
      drylands: [1.05, 1.0, 0.9],
      redstone: [1.06, 0.96, 0.9],
      sierra: [0.94, 0.98, 1.06],
      pinehollow: [0.95, 1.0, 0.95],
      blackwater: [0.98, 1.0, 1.0],
      dustfall: [1.02, 1.0, 0.96],
    };
    const gr = grade[game.currentRegion] ?? [1, 1, 1];
    amb = amb.map((v, i) => Math.min(255, Math.round(v * gr[i]!))) as [number, number, number];
    // Overcast flattens the light; rain on top of it sinks the world into storm gloom.
    const storm = game.weather.current.clouds;
    const wet = game.weather.current.rain;
    amb = amb.map((v, i) => Math.round(v * (1 - storm * 0.22 - wet * 0.16) * (i === 2 ? 1 + wet * 0.06 : 1))) as [number, number, number];
    if (this.insideBuilding) amb = amb.map((v) => Math.round(v * 0.85 + 20)) as [number, number, number];
    lc.globalCompositeOperation = 'source-over';
    lc.fillStyle = `rgb(${amb[0]},${amb[1]},${amb[2]})`;
    lc.fillRect(0, 0, this.vw, this.vh);
    // Light sources only matter when it's not full day.
    if (day < 0.95 || this.insideBuilding) {
      const p = game.player;
      const nightK = 1 - day;
      if (p.lantern || this.insideBuilding) {
        // Lantern: a wide warm pool plus a hot core so faces and tack read inside it.
        this.lights.push({ x: p.x, y: p.y - 8, r: this.insideBuilding ? 96 : 92, color: 'rgba(255,196,120,0.95)', flicker: true });
        this.lights.push({ x: p.x, y: p.y - 10, r: 34, color: 'rgba(255,226,170,0.7)', flicker: true });
      } else if (!this.insideBuilding && nightK > 0.2) {
        // Moonlight rim: a faint cool pool so the rider never vanishes into the dark.
        this.lights.push({ x: p.x, y: p.y - 10, r: 58, color: `rgba(84,100,138,${Math.min(1, nightK)})` });
      }
      lc.globalCompositeOperation = 'lighter';
      for (const L of this.lights) {
        const x = L.x - this.camX;
        const y = L.y - this.camY;
        if (x < -L.r || y < -L.r || x > this.vw + L.r || y > this.vh + L.r) continue;
        const r = L.r * (L.flicker ? 0.95 + Math.sin(game.time * 13 + L.x) * 0.05 : 1);
        const g = lc.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, L.color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        lc.fillStyle = g;
        lc.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
    const c = this.c;
    c.globalCompositeOperation = 'multiply';
    c.drawImage(this.light, 0, 0);
    // Night bloom: multiply can only darken, so warm sources (windows, fires, lanterns)
    // get a soft screen-blended halo on top, the glow that spills into night air.
    // Cool fill lights (the moon rim) are skipped so the dark stays blue.
    const bloomK = this.insideBuilding ? 0 : Math.max(0, 0.85 - day) * (1 + game.weather.current.fog * 0.6);
    if (bloomK > 0.05) {
      c.globalCompositeOperation = 'screen';
      for (const L of this.lights) {
        if (!L.color.startsWith('rgba(255')) continue;
        const x = L.x - this.camX;
        const y = L.y - this.camY;
        const r = L.r * 0.7;
        if (r < 8 || x < -r || y < -r || x > this.vw + r || y > this.vh + r) continue;
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(255,170,80,${Math.min(0.32, bloomK * 0.3)})`);
        g.addColorStop(0.45, `rgba(240,120,50,${Math.min(0.1, bloomK * 0.1)})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
    c.globalCompositeOperation = 'source-over';
    this.lights.length = 0;
  }
}

export { F, O };
