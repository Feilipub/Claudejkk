/**
 * NPCs: named story characters and generated townsfolk. Each follows an
 * occupation schedule across named settlement spots (work counter, home bed,
 * saloon table…), paths through doors with A*, reacts to gunfire and crime,
 * barks contextual lines, and — when hostile — fights with cover-seeking,
 * flanking, retreat and surrender behaviour. Lawmen pursue wanted players.
 */
import { Rng, hashString } from '../core/rng.ts';
import { approach, clamp, facing4 } from '../core/math.ts';
import { getItem } from '../data/items.ts';
import type { NpcDef } from '../data/schema.ts';
import type { Game } from '../game.ts';
import { humanSprites, PH, PW, type HumanAnim, type HumanLook, type Dir } from '../render/humanSprite.ts';
import type { Renderer } from '../render/renderer.ts';
import { findPath } from '../world/path.ts';
import type { Spot } from '../world/settlements.ts';
import { OBJ } from '../world/tiles.ts';
import { Entity } from './entity.ts';

export type NpcState = 'schedule' | 'talk' | 'cower' | 'flee' | 'combat' | 'surrender' | 'dead' | 'pursue' | 'hogtied' | 'follow' | 'duel' | 'guard';

interface Block {
  from: number;
  to: number;
  kind: Spot['kind'] | 'workAny';
  anim: HumanAnim;
}

const SHOPKEEP: Block[] = [
  { from: 0, to: 6.5, kind: 'bed', anim: 'sit' },
  { from: 6.5, to: 8, kind: 'street', anim: 'idle' },
  { from: 8, to: 19, kind: 'counter', anim: 'idle' },
  { from: 19, to: 22, kind: 'social', anim: 'sit' },
  { from: 22, to: 24, kind: 'bed', anim: 'sit' },
];
const BARKEEP: Block[] = [
  { from: 0, to: 2, kind: 'counter', anim: 'idle' },
  { from: 2, to: 10, kind: 'bed', anim: 'sit' },
  { from: 10, to: 24, kind: 'counter', anim: 'idle' },
];
const LAW: Block[] = [
  { from: 0, to: 6, kind: 'bed', anim: 'sit' },
  { from: 6, to: 12, kind: 'counter', anim: 'idle' },
  { from: 12, to: 14, kind: 'street', anim: 'idle' },
  { from: 14, to: 20, kind: 'counter', anim: 'idle' },
  { from: 20, to: 23, kind: 'street', anim: 'idle' },
  { from: 23, to: 24, kind: 'bed', anim: 'sit' },
];
const OUTDOOR: Block[] = [
  { from: 0, to: 5, kind: 'bed', anim: 'sit' },
  { from: 5, to: 12, kind: 'workAny', anim: 'interact' },
  { from: 12, to: 13, kind: 'social', anim: 'sit' },
  { from: 13, to: 18, kind: 'workAny', anim: 'interact' },
  { from: 18, to: 22, kind: 'social', anim: 'sit' },
  { from: 22, to: 24, kind: 'bed', anim: 'sit' },
];
const NIGHTLIFE: Block[] = [
  { from: 0, to: 3, kind: 'social', anim: 'sit' },
  { from: 3, to: 13, kind: 'bed', anim: 'sit' },
  { from: 13, to: 24, kind: 'social', anim: 'idle' },
];
const PREACH: Block[] = [
  { from: 0, to: 6, kind: 'bed', anim: 'sit' },
  { from: 6, to: 12, kind: 'workAny', anim: 'idle' },
  { from: 12, to: 15, kind: 'street', anim: 'idle' },
  { from: 15, to: 20, kind: 'workAny', anim: 'idle' },
  { from: 20, to: 24, kind: 'bed', anim: 'sit' },
];
const IDLER: Block[] = [
  { from: 0, to: 7, kind: 'bed', anim: 'sit' },
  { from: 7, to: 12, kind: 'street', anim: 'idle' },
  { from: 12, to: 14, kind: 'social', anim: 'sit' },
  { from: 14, to: 19, kind: 'street', anim: 'idle' },
  { from: 19, to: 23, kind: 'social', anim: 'sit' },
  { from: 23, to: 24, kind: 'bed', anim: 'sit' },
];
const CAMPER: Block[] = [
  { from: 0, to: 6, kind: 'camp', anim: 'sit' },
  { from: 6, to: 20, kind: 'guard', anim: 'idle' },
  { from: 20, to: 24, kind: 'camp', anim: 'sit' },
];

function scheduleFor(occ: string): Block[] {
  switch (occ) {
    case 'bartender':
      return BARKEEP;
    case 'sheriff':
    case 'deputy':
    case 'soldier':
      return LAW;
    case 'cowhand':
    case 'rancher':
    case 'farmer':
    case 'miner':
    case 'logger':
    case 'stablehand':
    case 'breeder':
    case 'hunter':
    case 'trapper':
    case 'railroad':
      return OUTDOOR;
    case 'saloongirl':
    case 'gambler':
    case 'pianist':
      return NIGHTLIFE;
    case 'preacher':
      return PREACH;
    case 'outlaw':
      return CAMPER;
    case 'traveler':
    case 'drifter':
    case 'child':
    case 'elder':
      return IDLER;
    default:
      return SHOPKEEP;
  }
}

export interface CombatProfile {
  health: number;
  weapon: string;
  accuracy: number;
  courage: number;
}

export class Npc extends Entity {
  def: NpcDef;
  look: HumanLook;
  name: string;
  occupation: string;
  personality: string[];
  settlementId: string;
  health: number;
  maxHealth: number;
  hostile = false;
  essential: boolean;
  tag: string | null = null;
  combat: CombatProfile | null;
  state: NpcState = 'schedule';
  angle = Math.PI / 2;
  anim: HumanAnim = 'idle';
  animT = 0;
  vx = 0;
  vy = 0;
  rng: Rng;
  private path: { x: number; y: number }[] = [];
  private pathTarget: { x: number; y: number } | null = null;
  private repathT = 0;
  private blockIdx = -1;
  private activity: HumanAnim = 'idle';
  bubble: { text: string; t: number } | null = null;
  barkCd = 0;
  stateT = 0;
  fireCd = 0;
  clip = 6;
  reloadT = 0;
  coverPos: { x: number; y: number } | null = null;
  morale = 1;
  /** Speed multiplier (generic NPCs vary). */
  walk = 34;
  fixed: { x: number; y: number } | null = null;
  lastSeenPlayer = -99;
  alerted = false;
  /** Seconds a civilian has seen a crime and is going to report it. */
  witnessT = 0;
  witnessCrime: string | null = null;
  witnessIncident = 0;

  constructor(def: NpcDef, game: Game) {
    super('npc', def.id);
    this.def = def;
    this.name = def.name;
    this.occupation = def.occupation;
    this.personality = def.personality;
    this.settlementId = def.settlement;
    this.essential = !!def.essential;
    this.rng = new Rng(hashString(def.id));
    this.look = completeLook(def.look, this.rng, def.occupation);
    // Children get child proportions in the sprite, not just a shrunken adult.
    if (def.occupation === 'child') this.look = { ...this.look, child: true };
    this.combat = def.combat ?? (def.occupation === 'sheriff' || def.occupation === 'deputy' || def.occupation === 'soldier' ? { health: 120, weapon: 'revolverCattleman', accuracy: 0.6, courage: 0.85 } : null);
    this.maxHealth = this.combat?.health ?? 70;
    this.health = this.maxHealth;
    this.walk = 30 + this.rng.range(0, 10);
    if (def.fixed) this.fixed = { x: def.fixed.x * 16 + 8, y: def.fixed.y * 16 + 10 };
    this.radius = 5;
    void game;
  }

  get weapon(): string | null {
    return this.combat?.weapon ?? null;
  }

  /** Called on spawn: place at the current scheduled spot. */
  placeAtSchedule(game: Game): void {
    if (this.fixed) {
      this.x = this.fixed.x;
      this.y = this.fixed.y;
      return;
    }
    const t = this.currentTarget(game);
    if (t) {
      this.x = t.x;
      this.y = t.y;
    }
  }

  private currentBlock(game: Game): { block: Block; idx: number } {
    const sched = scheduleFor(this.occupation);
    const h = game.clock.hour;
    const idx = sched.findIndex((b) => h >= b.from && h < b.to);
    return { block: sched[Math.max(0, idx)]!, idx };
  }

  private currentTarget(game: Game): { x: number; y: number } | null {
    const { block, idx } = this.currentBlock(game);
    const spots = game.spotsFor(this.settlementId);
    if (!spots.length) return null;
    let pool: Spot[] = [];
    const workB = this.def.workAt ? game.buildingsOf(this.settlementId).filter((b) => b.type === this.def.workAt).map((b) => b.id) : [];
    if (block.kind === 'counter') pool = spots.filter((s) => (s.kind === 'counter' || s.kind === 'work') && (workB.length ? workB.includes(s.buildingId ?? '') : true));
    else if (block.kind === 'workAny') {
      pool = spots.filter((s) => (s.kind === 'work' || s.kind === 'corral' || s.kind === 'pray') && (workB.length ? workB.includes(s.buildingId ?? '') || !s.buildingId : true));
      if (!pool.length) pool = spots.filter((s) => s.kind === 'work' || s.kind === 'corral' || s.kind === 'camp' || s.kind === 'street');
    } else if (block.kind === 'bed') pool = spots.filter((s) => s.kind === 'bed' || s.kind === 'home');
    else if (block.kind === 'social') pool = spots.filter((s) => s.kind === 'social' || s.kind === 'camp');
    else if (block.kind === 'guard') pool = spots.filter((s) => s.kind === 'guard' || s.kind === 'camp');
    else pool = spots.filter((s) => s.kind === block.kind);
    if (!pool.length) pool = spots.filter((s) => s.kind === 'street' || s.kind === 'social' || s.kind === 'camp');
    if (!pool.length) pool = spots;
    const pick = pool[hashString(this.id + ':' + idx + ':' + (block.kind === 'bed' ? '' : game.clock.day)) % pool.length]!;
    this.activity = block.anim;
    // Small per-NPC offset so groups don't stack.
    const jitter = (hashString(this.id) % 7) - 3;
    return { x: pick.x * 16 + 8 + (block.kind === 'street' ? jitter * 3 : 0), y: pick.y * 16 + 10 };
  }

  say(text: string, seconds = 3.5): void {
    this.bubble = { text, t: seconds };
  }

  update(dt: number, game: Game): void {
    if (this.state === 'dead') return;
    this.barkCd = Math.max(0, this.barkCd - dt);
    this.fireCd = Math.max(0, this.fireCd - dt);
    this.stateT += dt;
    if (this.bubble) {
      this.bubble.t -= dt;
      if (this.bubble.t <= 0) this.bubble = null;
    }
    const p = game.player;
    const dp = Math.hypot(p.x - this.x, p.y - this.y);
    if (this.witnessT > 0) {
      this.witnessT -= dt;
      if (this.witnessT <= 0 && this.witnessCrime && this.alive) {
        game.law.witnessReported(this, this.witnessCrime);
        this.witnessCrime = null;
      }
    }

    switch (this.state) {
      case 'talk':
        this.faceTo(p.x, p.y);
        this.anim = 'idle';
        this.vx = this.vy = 0;
        if (!game.dialogue.isOpenWith(this.id)) this.state = 'schedule';
        break;
      case 'cower':
        this.anim = 'sit';
        if (this.stateT > 8) this.setState('schedule');
        break;
      case 'flee': {
        const ax = this.x - p.x;
        const ay = this.y - p.y;
        const d = Math.hypot(ax, ay) || 1;
        this.moveDir(ax / d, ay / d, 80, dt, game);
        this.anim = 'run';
        if (this.stateT > 6 && dp > 250) this.setState('schedule');
        break;
      }
      case 'surrender':
        this.anim = 'surrender';
        this.vx = this.vy = 0;
        if (this.stateT > 25 && dp > 300) this.setState('flee');
        break;
      case 'hogtied':
        this.anim = 'dead';
        break;
      case 'combat':
      case 'pursue':
        game.combat.npcCombat(this, dt);
        break;
      case 'duel':
        this.faceTo(p.x, p.y);
        this.anim = 'idle';
        break;
      case 'follow':
        if (dp > 40) this.goTo(p.x, p.y, dt, game, dp > 120 ? 90 : 55);
        else this.anim = 'idle';
        break;
      case 'guard':
        this.updateSchedule(dt, game);
        // Outlaws open fire when an outsider walks into their camp.
        if (dp < 170 && game.rep.get('coyle') < 40 && game.world.lineOfSight(this.x, this.y - 8, p.x, p.y - 8) && p.alive) {
          this.hostile = true;
          this.setState('combat');
          this.say(this.rng.pick(['Who\'s there?!', 'Intruder!', 'Get \'em, boys!', 'You picked the wrong camp.']), 2.5);
          for (const o of game.spatial.query(this.x, this.y, 300, 'npc')) {
            const n = o as Npc;
            if (n.tag === this.tag && n.state === 'guard') {
              n.hostile = true;
              n.setState('combat');
            }
          }
        }
        break;
      default:
        this.updateSchedule(dt, game);
        // Ambient barks when the player passes by.
        if (dp < 48 && this.barkCd <= 0 && !p.mount && game.time - game.lastBarkAt > 4) {
          game.lastBarkAt = game.time;
          this.barkCd = 25 + this.rng.range(0, 20);
          const line = game.dialogue.bark(this);
          if (line) this.say(line);
          this.faceTo(p.x, p.y);
        }
    }
    this.animT += dt * (this.anim === 'run' ? 10 : this.anim === 'walk' ? 7 : 1.5);
  }

  override updateLow(dt: number, game: Game): void {
    // Off-screen: snap between schedule spots instead of walking.
    if (this.state !== 'schedule' || this.fixed) return;
    const { idx } = this.currentBlock(game);
    if (idx !== this.blockIdx) {
      this.blockIdx = idx;
      const t = this.currentTarget(game);
      if (t) {
        this.x = t.x;
        this.y = t.y;
      }
    }
    void dt;
  }

  setState(s: NpcState): void {
    this.state = s;
    this.stateT = 0;
    this.path = [];
  }

  private updateSchedule(dt: number, game: Game): void {
    if (this.fixed) {
      const d = Math.hypot(this.fixed.x - this.x, this.fixed.y - this.y);
      if (d > 6) this.goTo(this.fixed.x, this.fixed.y, dt, game);
      else this.anim = 'idle';
      return;
    }
    const { idx } = this.currentBlock(game);
    if (idx !== this.blockIdx || !this.pathTarget) {
      this.blockIdx = idx;
      this.pathTarget = this.currentTarget(game);
      this.path = [];
    }
    const t = this.pathTarget;
    if (!t) return;
    const d = Math.hypot(t.x - this.x, t.y - this.y);
    if (d > 5) this.goTo(t.x, t.y, dt, game);
    else {
      this.vx = this.vy = 0;
      this.anim = this.activity;
      if (this.activity === 'interact' && this.animT % 6 > 3) this.anim = 'idle';
    }
  }

  /** Walk toward a point using A* paths through doors. */
  goTo(x: number, y: number, dt: number, game: Game, speed = this.walk): void {
    this.repathT -= dt;
    if (!this.path.length || this.repathT <= 0) {
      this.repathT = 3;
      const direct = Math.hypot(x - this.x, y - this.y) < 40 && game.world.lineOfSight(this.x, this.y, x, y);
      this.path = direct ? [{ x, y }] : findPath(game.world, this.x, this.y, x, y, 2500) ?? [{ x, y }];
    }
    const wp = this.path[0];
    if (!wp) return;
    const dx = wp.x - this.x;
    const dy = wp.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 3) {
      this.path.shift();
      return;
    }
    this.moveDir(dx / d, dy / d, speed, dt, game);
    this.anim = speed > 60 ? 'run' : 'walk';
  }

  moveDir(nx: number, ny: number, speed: number, dt: number, game: Game): void {
    this.vx = approach(this.vx, nx * speed, 500 * dt);
    this.vy = approach(this.vy, ny * speed, 500 * dt);
    const W = game.world;
    const tx = this.x + this.vx * dt;
    const ty = this.y + this.vy * dt;
    if (!W.blockedPx(tx, this.y)) this.x = tx;
    else this.repathT = 0;
    if (!W.blockedPx(this.x, ty)) this.y = ty;
    else this.repathT = 0;
    if (Math.abs(this.vx) + Math.abs(this.vy) > 2) this.angle = Math.atan2(this.vy, this.vx);
  }

  faceTo(x: number, y: number): void {
    this.angle = Math.atan2(y - this.y, x - this.x);
  }

  hurt(amount: number, game: Game, byPlayer: boolean): void {
    if (this.state === 'dead') return;
    this.health -= amount;
    game.renderer.spawn({ x: this.x, y: this.y - 10, kind: 'blood', color: '#8a1a1a', vx: (this.rng.next() - 0.5) * 30, vz: 20, life: 0.6, max: 0.6, size: 2 });
    if (this.health <= 0) {
      if (this.essential && !game.quests.allowEssentialDeath(this.id)) {
        this.health = 1;
        this.setState('cower');
        this.say('Enough! Enough!');
        return;
      }
      this.die(game, byPlayer);
      return;
    }
    this.morale -= amount / this.maxHealth;
    if (!this.hostile && !this.combat) {
      this.setState('flee');
      this.say(this.rng.pick(['Help! Murder!', 'Sheriff!', 'Don\'t shoot!', 'Lord have mercy!']));
    } else if (!this.hostile && this.combat && byPlayer) {
      this.hostile = true;
      this.setState('combat');
    }
  }

  die(game: Game, byPlayer: boolean): void {
    this.state = 'dead';
    this.alive = false;
    this.anim = 'dead';
    game.onNpcKilled(this, byPlayer);
  }

  override get sortY(): number {
    return this.y;
  }

  draw(r: Renderer, game: Game): void {
    const set = humanSprites(this.look);
    const f4 = facing4(this.angle);
    const dir: Dir = f4 === 0 || f4 === 2 ? 'side' : f4 === 1 ? 'down' : 'up';
    const flip = f4 === 2;
    let anim = this.anim;
    if ((this.state === 'combat' || this.state === 'pursue') && this.fireCd > 0.2) anim = 'shoot';
    const frames = set.frames[dir][anim] ?? set.frames[dir].idle;
    const fr = frames[Math.floor(this.animT) % frames.length]!;
    r.shadow(this.x, this.y, 5, 2.5, 0);
    const w = anim === 'dead' ? PW + 8 : PW;
    const child = this.occupation === 'child';
    if (child) r.spriteScaled(fr, this.x, this.y + 1, flip, 0.85);
    else r.sprite(fr, Math.round(this.x - w / 2), Math.round(this.y - PH + 1), flip);
    const top = child ? Math.round(PH * 0.85) : PH;
    if (this.bubble) game.ui.worldBubble(this.x, this.y - top - 2, this.bubble.text, this.name);
    if (this.hostile && this.state !== 'dead' && this.state !== 'surrender' && this.state !== 'hogtied') r.rect(this.x - 1, this.y - top - 3, 2, 2, '#d83a2a');
    else if (this.state !== 'dead') {
      const m = game.npcMarker(this.id);
      if (m) {
        const bob = Math.round(Math.sin(game.time * 4) * 1.5);
        r.text(this.x, this.y - top - 3 + bob, m, m === '!' ? '#f0cf7a' : '#9fd0ff');
      }
    }
  }
}

const HATS: HumanLook['hat'][] = ['cowboy', 'cowboy', 'cowboy', 'bowler', 'flat', 'derby', 'cap', 'none'];
const SHIRTS = ['#d8d0bc', '#a8b4c0', '#c9a07a', '#8a9a7a', '#b84a3a', '#6a7aa0', '#e0dcd0', '#9a8a6a'];
const DARK = ['#3a2a20', '#2e3440', '#4a3a2a', '#5a4a3a', '#2a2a2a', '#4a4038', '#6a5040'];

/** Fill a partial look with occupation-appropriate defaults. */
export function completeLook(p: Partial<HumanLook>, rng: Rng, occ: string): HumanLook {
  const skin = ['#f1d0b4', '#e3b48f', '#c98f66', '#a96e4b', '#8a5638', '#6b3f28'][rng.int(0, 5)]!;
  const hair = ['#1b1410', '#3a2618', '#5e3c22', '#8a5a30', '#b98a4e', '#9c9a95'][rng.int(0, 5)]!;
  const skirt = p.skirt ?? false;
  const base: HumanLook = {
    skin,
    hair,
    hairStyle: skirt ? rng.pick(['bun', 'long', 'braid'] as const) : rng.pick(['short', 'short', 'curly', 'long', 'bald'] as const),
    facial: skirt ? 'none' : rng.pick(['none', 'stubble', 'mustache', 'beard', 'goatee'] as const),
    hat: skirt ? rng.pick(['bonnet', 'none', 'none'] as const) : occ === 'soldier' ? 'cavalry' : occ === 'banker' || occ === 'editor' ? 'derby' : occ === 'miner' || occ === 'logger' || occ === 'railroad' ? 'cap' : rng.pick(HATS),
    hatColor: rng.pick(['#3a2a1e', '#5a4632', '#2a2522', '#7a6248', '#4a4a4a', '#8a7a5e']),
    shirt: rng.pick(SHIRTS),
    vest: rng.chance(0.4) ? rng.pick(DARK) : null,
    coat: rng.chance(0.25) ? rng.pick(DARK) : null,
    pants: rng.pick(['#4a4038', '#3a3440', '#5a4a3a', '#6a5a46', '#34302c']),
    boots: rng.pick(['#2a1d14', '#3a2618', '#1e1612']),
    skirt,
    bandana: rng.chance(0.25) ? rng.pick(['#9a2a2a', '#2a4a8a', '#c9a24a']) : null,
    apron: occ === 'blacksmith' || occ === 'bartender' || occ === 'cook' ? '#7a6a58' : null,
    badge: occ === 'sheriff' || occ === 'deputy',
    build: rng.pick(['slim', 'average', 'stocky'] as const),
    gunbelt: occ === 'sheriff' || occ === 'deputy' || occ === 'outlaw' || occ === 'bountyhunter' || occ === 'cowhand' || occ === 'soldier',
  };
  if (occ === 'soldier') {
    base.shirt = '#3a4a6a';
    base.pants = '#5a6a8a';
    base.hatColor = '#2a3048';
  }
  return { ...base, ...p } as HumanLook;
}

export { OBJ, clamp, getItem };
