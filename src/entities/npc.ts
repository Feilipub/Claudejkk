/**
 * NPCs: named story characters and generated townsfolk. Each follows a
 * data-driven occupation routine (data/social.ts: wake, meals, work shifts,
 * saloon evenings, church on Sunday, sleep) across settlement places, paths
 * through doors with A*, and performs a visible work activity on arrival
 * (hammering, sweeping, feeding stock, patrolling…) with a hand prop. They
 * shelter from rain, carry lanterns after dark, hide from gunfire, chat with
 * each other (systems/social.ts drives that), bark contextual lines, and —
 * when hostile — fight with cover-seeking, flanking, retreat and surrender
 * behaviour. Lawmen pursue wanted players.
 */
import { Rng, hashString } from '../core/rng.ts';
import { approach, clamp, facing4 } from '../core/math.ts';
import { getItem } from '../data/items.ts';
import { ACTS, blockAt, SOCIAL_TUNING, SPOT_ACT, WORK_ACTS, WORK_SPOTS, type ActKind, type PropKind, type SchedBlock } from '../data/social.ts';
import type { NpcDef } from '../data/schema.ts';
import type { Game } from '../game.ts';
import { humanSprites, PH, PW, type HumanAnim, type HumanLook, type Dir } from '../render/humanSprite.ts';
import type { Renderer } from '../render/renderer.ts';
import { findPath } from '../world/path.ts';
import type { Spot } from '../world/settlements.ts';
import { O, OBJ } from '../world/tiles.ts';
import { Entity } from './entity.ts';

export type NpcState = 'schedule' | 'talk' | 'cower' | 'flee' | 'combat' | 'surrender' | 'dead' | 'pursue' | 'hogtied' | 'follow' | 'duel' | 'guard';

/** Default workplace building type per occupation, for NPCs without an authored `workAt`. */
const OCC_BUILDING: Record<string, string[]> = {
  bartender: ['saloon'], saloongirl: ['saloon'], gambler: ['saloon'], pianist: ['saloon'],
  blacksmith: ['blacksmith'], preacher: ['church', 'chapel'], merchant: ['store', 'tradingpost'], doctor: ['doctor'],
  banker: ['bank'], telegrapher: ['telegraph', 'station'], editor: ['newspaper'], sheriff: ['sheriff'], deputy: ['sheriff'],
  stablehand: ['stable', 'barn'], horsetrader: ['stable'], cook: ['cookhouse'], logger: ['sawmill', 'warehouse'],
  hotelier: ['hotel'], gunsmith: ['gunsmith'], tailor: ['tailor'], surveyor: ['station', 'telegraph'], railroad: ['station', 'warehouse'],
  cowhand: ['barn', 'stable'], rancher: ['ranchhouse'], breeder: ['barn', 'stable'],
};
const PORCH_TYPES = ['house', 'hotel', 'ranchhouse', 'cabin', 'lodgehouse', 'bunkhouse', 'shack', 'store', 'officers', 'cookhouse'];
const BEAT_TYPES = ['sheriff', 'saloon', 'bank', 'store', 'hotel', 'stable', 'church', 'telegraph', 'barracks', 'officers'];
/** Places that are outdoors by nature (rain sends people from these under a roof). */
const OUTDOOR_PLACES = new Set(['street', 'porch', 'shopfront', 'patrol', 'corral', 'field', 'camp', 'guard']);

interface TownPlace {
  x: number;
  y: number;
  type: string;
  bid: string;
}
interface TownPlaces {
  /** Walkable tile just outside each door (boardwalk, porch). */
  doorfronts: TownPlace[];
  /** Just inside each door (rain/gunfire shelter). */
  shelters: TownPlace[];
}
const PLACE_CACHE = new WeakMap<object, Map<string, TownPlaces>>();

/** Derived, cached outdoor places of a settlement (doorfronts, shelters). Pure function of the generated world. */
export function townPlaces(game: Game, sid: string): TownPlaces {
  let m = PLACE_CACHE.get(game.world);
  if (!m) PLACE_CACHE.set(game.world, (m = new Map()));
  let tp = m.get(sid);
  if (tp) return tp;
  const W = game.world;
  const free = (x: number, y: number) => !W.blockedPx(x * 16 + 8, y * 16 + 10) && !W.insideBuilding(x * 16 + 8, y * 16 + 10);
  tp = { doorfronts: [], shelters: [] };
  for (const b of game.buildingsOf(sid)) {
    if (b.ruined) continue;
    const f = free(b.doorX, b.doorY + 1) ? { x: b.doorX, y: b.doorY + 1 } : W.findNear(b.doorX, b.doorY + 1, 2, free);
    if (f) tp.doorfronts.push({ x: f.x * 16 + 8, y: f.y * 16 + 10, type: b.type, bid: b.id });
    const inY = !W.blockedPx(b.doorX * 16 + 8, (b.doorY - 1) * 16 + 10) ? b.doorY - 1 : b.doorY;
    tp.shelters.push({ x: b.doorX * 16 + 8, y: inY * 16 + 10, type: b.type, bid: b.id });
  }
  m.set(sid, tp);
  return tp;
}

/** Nearest shelter (inside a door) to a point, within `maxD` px. */
export function nearestShelter(game: Game, sid: string, x: number, y: number, maxD = 400): { x: number; y: number } | null {
  let best: TownPlace | null = null;
  let bd = maxD;
  for (const s of townPlaces(game, sid).shelters) {
    if (s.type === 'church' || s.type === 'chapel') continue;
    const d = Math.hypot(s.x - x, s.y - y);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best ? { x: best.x, y: best.y } : null;
}

const FACE_OBJ_CACHE = new Map<string, number[]>();
function faceIds(names: string[]): number[] {
  const k = names.join(',');
  let v = FACE_OBJ_CACHE.get(k);
  if (!v) FACE_OBJ_CACHE.set(k, (v = names.map((n) => (O as Record<string, number>)[n]).filter((x): x is number => typeof x === 'number')));
  return v;
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
  /** Current routine activity (data/social.ts ACTS). */
  act: ActKind = 'idle';
  /** Place kind of the current schedule block. */
  place: SchedBlock['place'] = 'street';
  /** True once the NPC has reached its scheduled spot. */
  arrived = false;
  /** The current destination is under a roof. */
  targetIndoor = false;
  private tKey = '';
  private anchor: { x: number; y: number } | null = null;
  private wanderOff = { x: 0, y: 0 };
  private wanderT = 0;
  private faceAngle: number | null = null;
  private lookT = 0;
  private strokeOn = false;
  /** Conversation partner (or the group's current speaker) to face; set by SocialSystem. */
  chatWith: Npc | null = null;
  /** Seconds before this NPC starts another conversation. */
  socialCd = 0;
  /** Seconds before acknowledging the player again. */
  greetCd = 0;
  /** Recent bumps by the player (decays). */
  bumps = 0;
  /** Reaction cooldown (dodging horses, bumps). */
  reactCd = 0;
  /** Short gesture (tip of the hat, wave) in seconds. */
  gestureT = 0;
  /** Steering override from the social layer: run toward (or away from) a point for t seconds. */
  steer: { x: number; y: number; speed: number; t: number; away?: boolean } | null = null;
  /** Seconds a frightened civilian stays hidden (cower state). */
  hideFor = 8;
  private shelter: { x: number; y: number } | null = null;
  /** Outdoors (cached a few times a second; lanterns and rain use it). */
  outdoors = true;
  private outdoorT = 0;
  /** A witnessed crime already passed into town gossip. */
  gossipNoted = false;

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
      this.anchor = t;
      this.pathTarget = t;
      this.tKey = this.targetKey(game);
    }
  }

  private currentBlock(game: Game): { block: SchedBlock; idx: number } {
    return blockAt(this.occupation, this.personality, game.clock.hour, game.clock.day);
  }

  /** Whether weather drives this NPC under a roof for the given block. */
  private shouldShelter(game: Game, block: SchedBlock): boolean {
    const w = game.weather.current;
    if (w.rain < SOCIAL_TUNING.rainShelter && w.snow < 0.6) return false;
    if (this.occupation === 'outlaw' || this.occupation === 'soldier' || this.tag) return false;
    return OUTDOOR_PLACES.has(block.place);
  }

  /** Changes whenever the NPC should pick a new destination (block, patrol step, rain, greeter flag). */
  private targetKey(game: Game): string {
    const { block, idx } = this.currentBlock(game);
    const m = game.clock.minutes;
    const step = block.place === 'patrol' ? Math.floor(m / SOCIAL_TUNING.patrolStepMin) : block.act === 'stroll' || block.act === 'loiter' ? Math.floor(m / SOCIAL_TUNING.strollStepMin) : 0;
    const wet = this.shouldShelter(game, block) ? 1 : 0;
    const gf = this.def.greetUntilFlag && !game.flags[this.def.greetUntilFlag] ? 'g' : '';
    return `${game.clock.day}|${idx}|${step}|${wet}|${gf}`;
  }

  private workBuildings(game: Game): string[] {
    const types = this.def.workAt ? [this.def.workAt] : OCC_BUILDING[this.occupation] ?? [];
    if (!types.length) return [];
    return game.buildingsOf(this.settlementId).filter((b) => types.includes(b.type)).map((b) => b.id);
  }

  private currentTarget(game: Game): { x: number; y: number } | null {
    // Story greeters wait out front, on the street side of their workplace, until the player has met them.
    const gf = this.def.greetUntilFlag;
    if (gf && !game.flags[gf] && this.def.workAt) {
      const b = game.buildingsOf(this.settlementId).find((x) => x.type === this.def.workAt);
      if (b) {
        this.act = 'idle';
        this.place = 'shopfront';
        const tx = b.x + Math.floor(b.w / 2) + 2;
        const free = game.world.findNear(tx, b.y - 2, 4, (x, y) => !game.world.blockedPx(x * 16 + 8, y * 16 + 10) && !game.world.insideBuilding(x * 16 + 8, y * 16 + 10));
        if (free) return { x: free.x * 16 + 8, y: free.y * 16 + 10 };
      }
    }
    const { block, idx } = this.currentBlock(game);
    this.act = block.act;
    this.place = block.place;
    const t = this.resolvePlace(game, block, idx);
    if (!t) return null;
    if (this.shouldShelter(game, block)) {
      const sh = nearestShelter(game, this.settlementId, t.x, t.y);
      if (sh) {
        // Wait it out under a roof, just inside the nearest door.
        this.act = this.occupation === 'child' ? 'idle' : 'loiter';
        const j = ((hashString(this.id) % 3) - 1) * 6;
        return { x: sh.x + (game.world.blockedPx(sh.x + j, sh.y) ? 0 : j), y: sh.y };
      }
    }
    return t;
  }

  /** Resolve a routine place to a world position (px). Works for any settlement layout. */
  private resolvePlace(game: Game, block: SchedBlock, idx: number): { x: number; y: number } | null {
    const sid = this.settlementId;
    const spots = game.spotsFor(sid);
    if (!spots.length) return null;
    const W = game.world;
    const day = game.clock.day;
    const hid = hashString(this.id);
    const hs = (salt: string) => hashString(this.id + ':' + salt);
    const pick = <T>(pool: T[], salt: string): T | null => (pool.length ? pool[hs(salt) % pool.length]! : null);
    const of = (...kinds: Spot['kind'][]) => spots.filter((s) => kinds.includes(s.kind));
    const inTypes = (types: string[]) => {
      const ids = game.buildingsOf(sid).filter((b) => types.includes(b.type)).map((b) => b.id);
      return (s: Spot) => ids.includes(s.buildingId ?? '');
    };
    const workB = this.workBuildings(game);
    const inWork = (s: Spot) => workB.includes(s.buildingId ?? '');
    const tp = townPlaces(game, sid);
    const px = (s: { x: number; y: number } | null | undefined, outdoor = false): { x: number; y: number } | null => {
      if (!s) return null;
      const p = 'type' in s ? { x: s.x, y: s.y } : { x: s.x * 16 + 8, y: s.y * 16 + 10 };
      // Spread people sharing a spot along the boardwalk / around the table.
      const j = outdoor ? ((hid % 5) - 2) * 7 : ((hid % 3) - 1) * 4;
      if (j && !W.blockedPx(p.x + j, p.y) && !W.insideBuilding(p.x + j, p.y) === !W.insideBuilding(p.x, p.y)) p.x += j;
      return p;
    };
    const bedSpot = () => pick(of('bed', 'home'), 'bed');
    let r: { x: number; y: number } | null = null;
    // Trades with a named outdoor workplace in this settlement (mine, stockyard, field, pier…) go there.
    const prefs = WORK_SPOTS[this.occupation];
    if (prefs?.length && WORK_ACTS.has(block.act) && (block.place === 'work' || block.place === 'field' || block.place === 'corral')) {
      for (const name of prefs) {
        const named = spots.filter((s) => s.kind === 'work' && s.id.split(':')[1] === name);
        if (!named.length) continue;
        this.act = SPOT_ACT[name] ?? block.act;
        return px(pick(named, 'ws' + idx), !named[0]!.buildingId);
      }
    }
    switch (block.place) {
      case 'bed':
        r = px(bedSpot());
        break;
      case 'home': {
        const bed = bedSpot();
        const table = spots.find((s) => s.kind === 'home' && s.buildingId && s.buildingId === bed?.buildingId);
        r = px(table ?? pick(of('home'), 'home') ?? bed);
        break;
      }
      case 'counter': {
        const pool = spots.filter((s) => (s.kind === 'counter' || s.kind === 'work') && (workB.length ? inWork(s) : true));
        const counters = pool.filter((s) => s.kind === 'counter');
        r = px(pick(counters.length ? counters : pool, String(idx)));
        break;
      }
      case 'work': {
        let pool = workB.length ? spots.filter((s) => s.kind === 'work' && inWork(s)) : [];
        if (!pool.length && workB.length) pool = spots.filter((s) => s.kind === 'counter' && inWork(s));
        if (!pool.length && (block.act === 'piano' || block.act === 'deal')) pool = spots.filter((s) => s.kind === 'work' && inTypes(['saloon'])(s));
        if (!pool.length) pool = spots.filter((s) => (s.kind === 'work' || s.kind === 'corral') && !s.buildingId);
        if (!pool.length) pool = of('camp', 'street');
        r = px(pick(pool, String(idx)), !pool[0]?.buildingId);
        break;
      }
      case 'field': {
        const pool = spots.filter((s) => s.kind === 'work' && !s.buildingId);
        if (pool.length) r = px(pick(pool, 'field' + idx), true);
        else if (block.act === 'hoe') {
          // No fields in town: tend a kitchen garden in front of a house.
          const gardens = tp.doorfronts.filter((d) => d.type === 'house' || d.type === 'cabin' || d.type === 'ranchhouse' || d.type === 'shack');
          r = px(pick(gardens, 'garden'), true) ?? px(pick(of('corral', 'trough'), 'field' + idx), true);
        } else r = px(pick(of('corral', 'trough'), 'field' + idx), true) ?? px(pick(tp.doorfronts.filter((d) => d.type === 'barn' || d.type === 'stable'), 'field'), true);
        break;
      }
      case 'corral': {
        let pool = of('corral', 'trough');
        if (!pool.length) pool = of('stall');
        r = px(pick(pool, 'corral' + idx), true);
        break;
      }
      case 'stall': {
        let pool = spots.filter((s) => s.kind === 'stall' && (workB.length ? inWork(s) : true));
        if (!pool.length) pool = of('stall');
        if (!pool.length) pool = of('corral');
        r = px(pick(pool, 'stall' + idx));
        break;
      }
      case 'street': {
        // Drunks weave down the main street near the saloon; everyone else uses the whole town.
        const pool: { x: number; y: number }[] = block.act === 'stagger' ? [...of('street'), ...tp.doorfronts.filter((d) => d.type === 'saloon' || d.type === 'hotel')] : [...of('street'), ...tp.doorfronts];
        const step = block.act === 'stroll' || block.act === 'loiter' ? Math.floor(game.clock.minutes / SOCIAL_TUNING.strollStepMin) : 0;
        // Children pick the same play street each day, so they can find each other.
        const salt = block.act === 'play' ? null : `st${idx}:${day}:${step}`;
        r = px(salt === null ? pool[hashString(`${sid}:play:${day}:${idx}`) % pool.length] : pick(pool, salt), true);
        break;
      }
      case 'saloon': {
        let pool = spots.filter((s) => s.kind === 'social' && inTypes(['saloon'])(s));
        if (!pool.length) pool = of('social', 'camp');
        r = px(pick(pool, `sal${idx}:${day}`));
        break;
      }
      case 'church':
        r = px(pick(of('pray'), 'pray')) ?? px(pick(of('street'), 'church'), true);
        break;
      case 'porch': {
        const porches = tp.doorfronts.filter((d) => PORCH_TYPES.includes(d.type));
        // Only a few porches are "the" porches, so porch-sitters gather in little groups.
        const few = porches.slice(0, Math.min(3, porches.length));
        r = px(few.length ? few[hs('porch' + day) % few.length] : pick(of('social', 'camp', 'street'), 'porch'), true);
        break;
      }
      case 'shopfront': {
        const mine = tp.doorfronts.find((d) => workB.includes(d.bid));
        r = px(mine ?? pick(tp.doorfronts, 'front'), true);
        break;
      }
      case 'patrol': {
        const beat: { x: number; y: number }[] = [...of('street', 'guard'), ...tp.doorfronts.filter((d) => BEAT_TYPES.includes(d.type))];
        if (beat.length) r = px(beat[(hid + Math.floor(game.clock.minutes / SOCIAL_TUNING.patrolStepMin)) % beat.length], true);
        break;
      }
      case 'camp': {
        const pool = of('camp');
        r = px(pick(pool.length ? pool : of('social'), 'camp' + idx), true);
        break;
      }
      case 'guard': {
        const pool = of('guard');
        r = px(pick(pool.length ? pool : of('camp', 'street'), 'guard' + idx), true);
        break;
      }
      case 'social': {
        const pool = of('social');
        r = px(pick(pool.length ? pool : of('camp', 'street'), `soc${idx}:${day}`));
        break;
      }
    }
    if (!r) r = px(pick(of('street', 'social', 'camp'), 'any' + idx), true) ?? px(pick(spots, 'any'));
    return r;
  }

  say(text: string, seconds = 3.5): void {
    this.bubble = { text, t: seconds };
  }

  update(dt: number, game: Game): void {
    if (this.state === 'dead') return;
    this.barkCd = Math.max(0, this.barkCd - dt);
    this.fireCd = Math.max(0, this.fireCd - dt);
    this.socialCd -= dt;
    this.greetCd -= dt;
    this.reactCd -= dt;
    this.gestureT -= dt;
    if (this.bumps > 0) this.bumps = Math.max(0, this.bumps - dt * 0.05);
    this.outdoorT -= dt;
    if (this.outdoorT <= 0) {
      this.outdoorT = 0.5 + (hashString(this.id) % 10) * 0.02;
      this.outdoors = !game.world.insideBuilding(this.x, this.y);
    }
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
      case 'cower': {
        // Hide: duck through the nearest door if there is one close by, then crouch until it's quiet.
        if (this.stateT < 0.05 && !this.shelter && this.outdoors) this.shelter = nearestShelter(game, this.settlementId, this.x, this.y, SOCIAL_TUNING.hideSearchRadius);
        const sh = this.shelter;
        if (sh && this.stateT < 7 && Math.hypot(sh.x - this.x, sh.y - this.y) > 6) this.goTo(sh.x, sh.y, dt, game, 75);
        else {
          this.vx = this.vy = 0;
          this.anim = 'sit';
        }
        if (this.stateT > this.hideFor && game.combat.tension < 0.2) {
          this.shelter = null;
          this.hideFor = 8;
          this.setState('schedule');
        }
        break;
      }
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
        // Ambient barks when the player passes by (not mid-conversation; workers may mutter about the job).
        if (dp < 48 && this.barkCd <= 0 && !p.mount && !this.chatWith && this.act !== 'sleep' && game.time - game.lastBarkAt > 4) {
          game.lastBarkAt = game.time;
          this.barkCd = 25 + this.rng.range(0, 20);
          const mutter = this.arrived ? ACTS[this.act].mutter : undefined;
          const line = mutter && this.rng.chance(0.4) ? this.rng.pick(mutter) : game.dialogue.bark(this);
          if (line) this.say(line);
          if (!mutter) this.faceTo(p.x, p.y);
        }
    }
    this.animT += dt * (this.anim === 'run' ? 10 : this.anim === 'walk' ? 7 : this.anim === 'interact' ? 4 : 1.5);
  }

  override updateLow(dt: number, game: Game): void {
    // Off-screen (coarse LOD): snap between schedule spots instead of walking; no social or work simulation.
    if (this.state !== 'schedule' || this.fixed) return;
    const key = this.targetKey(game);
    if (key !== this.tKey) {
      this.tKey = key;
      const t = this.currentTarget(game);
      this.anchor = t;
      this.pathTarget = t;
      this.path = [];
      if (t) {
        this.x = t.x;
        this.y = t.y;
        this.arrived = true;
        this.faceAngle = null;
      }
    }
    this.chatWith = null;
    this.steer = null;
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
    // Social steering (dodging a horse, being shoved, playing tag) overrides the schedule briefly.
    const st = this.steer;
    if (st) {
      st.t -= dt;
      const dx = (st.away ? this.x - st.x : st.x - this.x) || 0.01;
      const dy = st.away ? this.y - st.y : st.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      if (st.speed > 0 && (st.away || d > 4)) {
        this.moveDir(dx / d, dy / d, st.speed, dt, game);
        this.anim = st.speed > 60 ? 'run' : 'walk';
      } else {
        this.vx = this.vy = 0;
        this.anim = 'idle';
      }
      if (st.t <= 0) {
        this.steer = null;
        this.path = [];
        this.repathT = 0;
      }
      return;
    }
    // Mid-conversation: stop and face whoever is talking.
    if (this.chatWith) {
      const o = this.chatWith;
      if (!o.alive || o.state !== 'schedule') this.chatWith = null;
      else {
        this.vx = this.vy = 0;
        this.faceTo(o.x, o.y);
        const seated = this.arrived && ACTS[this.act].anim === 'sit';
        this.anim = seated ? 'sit' : this.gestureT > 0 ? 'interact' : 'idle';
        return;
      }
    }
    const key = this.targetKey(game);
    if (key !== this.tKey || !this.pathTarget) {
      this.tKey = key;
      this.anchor = this.currentTarget(game);
      this.pathTarget = this.anchor;
      this.targetIndoor = !!(this.anchor && game.world.insideBuilding(this.anchor.x, this.anchor.y));
      this.wanderOff = { x: 0, y: 0 };
      this.path = [];
      this.arrived = false;
      this.faceAngle = null;
    }
    const a = this.anchor;
    if (!a) return;
    const tx = a.x + this.wanderOff.x;
    const ty = a.y + this.wanderOff.y;
    const d = Math.hypot(tx - this.x, ty - this.y);
    if (d > 5) {
      if (this.arrived && d < 70) {
        // Short shuffles while working (sweeping along the boardwalk, moving between troughs): no pathfinding.
        const def = ACTS[this.act];
        let nx = (tx - this.x) / d;
        let ny = (ty - this.y) / d;
        if (this.act === 'stagger') {
          const w = Math.sin(game.time * 3.1 + (hashString(this.id) % 7)) * 0.8;
          nx += -ny * w;
          ny += nx * w;
        }
        this.moveDir(nx, ny, this.walk * (this.act === 'stagger' ? 0.55 : def.anim === 'walk' ? 0.8 : 0.6), dt, game);
        this.anim = 'walk';
        if (Math.abs(this.vx) + Math.abs(this.vy) < 1) this.wanderOff = { x: 0, y: 0 };
      } else this.goTo(tx, ty, dt, game);
      if (this.act === 'patrol' && this.gestureT > 0) this.anim = 'idle';
      return;
    }
    this.vx = this.vy = 0;
    if (!this.arrived) {
      this.arrived = true;
      this.faceAngle = this.findFacing(game);
      this.wanderT = 1 + this.rng.range(0, 2);
    }
    this.doActivity(dt, game);
  }

  /** On arrival, turn toward the workplace object (anvil, bar, stove, trough…), if one is at hand. */
  private findFacing(game: Game): number | null {
    const names = ACTS[this.act].faceObj;
    if (!names?.length) return null;
    const ids = faceIds(names);
    const W = game.world;
    const cx = Math.floor(this.x / 16);
    const cy = Math.floor((this.y - 2) / 16);
    let best: { x: number; y: number } | null = null;
    let bd = 99;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        if (!ids.includes(W.objAt(cx + dx, cy + dy))) continue;
        const dd = Math.abs(dx) + Math.abs(dy);
        if (dd < bd) {
          bd = dd;
          best = { x: (cx + dx) * 16 + 8, y: (cy + dy) * 16 + 8 };
        }
      }
    return best ? Math.atan2(best.y - this.y, best.x - this.x) : null;
  }

  /** The visible work/leisure loop once the NPC stands at its spot. */
  private doActivity(dt: number, game: Game): void {
    const def = ACTS[this.act];
    const h = hashString(this.id);
    // Stroke cycle: alternate base pose and stroke pose.
    let anim: HumanAnim = def.anim === 'walk' ? 'idle' : def.anim;
    let stroke = false;
    if (def.alt && def.period) {
      const ph = ((game.time + (h % 97) * 0.13) % def.period) / def.period;
      stroke = ph < (def.duty ?? 0.5);
      if (stroke) anim = def.alt;
    }
    if (this.gestureT > 0 && anim !== 'sit') anim = 'interact';
    this.anim = anim;
    // One particle burst per stroke, only where the camera can see it.
    if (stroke && !this.strokeOn && def.fx && game.isNearCamera(this.x, this.y, 40)) this.workFx(def.fx, game);
    this.strokeOn = stroke;
    // Facing: work object, horse being brushed, or a look around now and then.
    this.lookT -= dt;
    if (this.act === 'brush' && this.lookT <= 0) {
      const horse = game.spatial.nearest(this.x, this.y, 40, (e) => e.kind === 'horse');
      if (horse) this.faceAngle = Math.atan2(horse.y - this.y, horse.x - this.x);
    }
    if (this.lookT <= 0) {
      this.lookT = 2.5 + this.rng.range(0, 4);
      if (def.lookAround && (this.faceAngle === null || this.rng.chance(0.4))) this.angle = this.rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2, Math.PI / 2]);
      else if (this.faceAngle !== null) this.angle = this.faceAngle;
    } else if (this.faceAngle !== null && !def.lookAround) this.angle = this.faceAngle;
    // Drift around the anchor (sweeping the boardwalk, hoeing a row, children at play, a drunk's weave).
    if (def.wander) {
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        this.wanderT = (def.wanderSec ?? 4) * (0.7 + this.rng.next() * 0.6);
        const r = def.wander;
        const ox = this.rng.range(-r, r);
        const oy = def.axis === 'x' ? 0 : this.rng.range(-r * 0.6, r * 0.6);
        const a = this.anchor!;
        const W = game.world;
        const inside = !W.insideBuilding(a.x, a.y);
        const nx = a.x + ox;
        const ny = a.y + oy;
        if (!W.blockedPx(nx, ny) && !W.insideBuilding(nx, ny) === inside && W.lineOfSight(this.x, this.y - 4, nx, ny - 4)) this.wanderOff = { x: ox, y: oy };
      }
    }
  }

  private workFx(fx: NonNullable<(typeof ACTS)[ActKind]['fx']>, game: Game): void {
    const r = game.renderer;
    const f = Math.cos(this.angle);
    const hx = this.x + f * 7;
    const hy = this.y - 4;
    if (fx === 'spark') for (let i = 0; i < 3; i++) r.spawn({ x: hx, y: hy, z: 8, kind: 'spark', color: i ? '#ffcc55' : '#fff2b0', vx: this.rng.range(-30, 30), vy: this.rng.range(-10, 10), vz: this.rng.range(15, 40), life: 0.35, max: 0.35, size: 1 });
    else if (fx === 'dust') r.dust(hx, this.y, '#b8a07a', 2);
    else if (fx === 'hay') r.dust(hx, this.y - 2, '#d8c070', 2);
    else if (fx === 'chips') for (let i = 0; i < 2; i++) r.spawn({ x: hx, y: hy, z: 6, kind: 'dust', color: '#c8a070', vx: this.rng.range(-25, 25), vz: this.rng.range(10, 25), life: 0.5, max: 0.5, size: 1 });
    else if (fx === 'smoke' && this.rng.chance(0.5)) r.spawn({ x: hx, y: hy, z: 14, kind: 'smoke', color: '#d8d0c4', vx: 3, vy: -2, vz: 8, life: 1.6, max: 1.6, size: 2 });
  }

  /** Jump out of the way of something (a galloping horse, a shove). */
  dodge(fromX: number, fromY: number, speed: number, seconds: number): void {
    this.steer = { x: fromX, y: fromY, speed, t: seconds, away: true };
    this.chatWith = null;
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

  /** The tool in hand for the current activity (only while doing it, or a bottle on a drunk's walk). */
  private heldProp(game: Game): PropKind | null {
    if (this.state !== 'schedule' || (this.chatWith && this.act !== 'drink')) return null;
    const p = ACTS[this.act].prop;
    if (!p) return null;
    if (!this.arrived && this.act !== 'stagger' && this.act !== 'feed') return null;
    void game;
    return p;
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
    const live = this.state === 'schedule' || this.state === 'talk' || this.state === 'follow' || this.state === 'flee' || this.state === 'cower' || this.state === 'guard';
    // Hand props and lanterns (held in front, or behind the body when facing away).
    const prop = live ? this.heldProp(game) : null;
    const lantern = live && !child && this.outdoors && game.clock.daylight < SOCIAL_TUNING.lanternDaylight && this.act !== 'sleep' && anim !== 'sit';
    if (dir === 'up') {
      if (prop) drawProp(r, prop, this.x, this.y, dir, flip, anim === 'interact');
      if (lantern) drawLantern(r, this.x - 6, this.y - 10, game.time);
    }
    if (child) r.spriteScaled(fr, this.x, this.y + 1, flip, 0.85);
    else r.sprite(fr, Math.round(this.x - w / 2), Math.round(this.y - PH + 1), flip);
    if (dir !== 'up') {
      if (prop) drawProp(r, prop, this.x, this.y, dir, flip, anim === 'interact');
      if (lantern) drawLantern(r, this.x + (dir === 'side' ? (flip ? 5 : -5) : -7), this.y - 10, game.time);
    }
    if (lantern) r.lights.push({ x: this.x, y: this.y - 10, r: 44, color: 'rgba(255,186,100,0.95)', flicker: true });
    const top = child ? Math.round(PH * 0.85) : PH;
    if (live && this.act === 'sleep' && this.arrived && this.state === 'schedule' && !this.bubble) {
      const zt = (game.time * 0.6 + (hashString(this.id) % 10) * 0.1) % 1;
      r.text(this.x + 4 + zt * 4, this.y - top + 4 - zt * 8, 'z', 'rgba(220,230,255,' + (1 - zt).toFixed(2) + ')');
    }
    // Voices behind a closed roof stay inside: only show bubbles the player could actually see.
    if (this.bubble && (this.outdoors || game.world.insideBuilding(this.x, this.y) === r.insideBuilding)) game.ui.worldBubble(this.x, this.y - top - 2, this.bubble.text, this.name);
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

const WOOD = '#7a5434';
const IRON = '#3c3c44';
const STEEL = '#9a9aa6';

/** Tiny pixel props over the 20x28 human sprite. Placeholder art until humanSprite gains work poses. */
function drawProp(r: Renderer, kind: PropKind, x: number, y: number, dir: Dir, flip: boolean, stroke: boolean): void {
  const s = dir === 'side' ? (flip ? -1 : 1) : dir === 'down' ? 1 : -1;
  const hx = Math.round(x + (dir === 'side' ? 6 * s : 6 * s));
  const hy = Math.round(y - (dir === 'side' ? 12 : 11));
  switch (kind) {
    case 'hammer':
      if (stroke) {
        r.rect(s > 0 ? hx : hx - 3, hy, 4, 1, WOOD);
        r.rect(hx + (s > 0 ? 3 : -4), hy - 1, 2, 3, IRON);
      } else {
        r.rect(hx, hy - 4, 1, 4, WOOD);
        r.rect(hx - 1, hy - 6, 3, 2, IRON);
      }
      break;
    case 'pick':
    case 'axe':
    case 'hoe': {
      const head = kind === 'pick' ? STEEL : kind === 'axe' ? STEEL : IRON;
      if (stroke) {
        r.rect(hx + (s > 0 ? 0 : -6), hy + 2, 7, 1, WOOD);
        r.rect(hx + (s > 0 ? 6 : -7), hy + 1, 2, kind === 'hoe' ? 3 : 4, head);
      } else {
        r.rect(hx, hy - 7, 1, 9, WOOD);
        if (kind === 'pick') r.rect(hx - 2, hy - 8, 5, 1, head);
        else if (kind === 'axe') r.rect(hx + (s > 0 ? 1 : -2), hy - 7, 2, 3, head);
        else r.rect(hx + (s > 0 ? 1 : -2), hy - 8, 2, 1, head);
      }
      break;
    }
    case 'broom': {
      const sw = stroke ? 2 * s : -2 * s;
      r.rect(hx, hy - 3, 1, 12, '#9a7a4a');
      r.rect(hx - 1 + sw, hy + 8, 4, 3, '#d6bc6a');
      break;
    }
    case 'rag':
      r.rect(hx + (stroke ? s : 0), hy + 1, 2, 2, '#e8e0cc');
      break;
    case 'brush':
      r.rect(hx + (stroke ? s * 2 : 0), hy - (stroke ? 2 : 0), 3, 1, WOOD);
      r.rect(hx + (stroke ? s * 2 : 0), hy + 1 - (stroke ? 2 : 0), 3, 1, '#c8b080');
      break;
    case 'hay':
      r.rect(hx - 2, hy - 1, 5, 3, '#d8c070');
      r.rect(hx - 1, hy - 2, 3, 1, '#e8d488');
      break;
    case 'book':
      r.rect(hx - 1, hy - (stroke ? 3 : 0), 3, 3, '#5a2a22');
      r.rect(hx, hy - (stroke ? 3 : 0), 1, 3, '#e8dcc0');
      break;
    case 'cards':
      r.rect(hx - 1, hy, 2, 2, '#f4f0e4');
      r.rect(hx + 1, hy + 1, 1, 1, '#b83a2a');
      break;
    case 'bowl':
      r.rect(hx - 1, hy + 1, 3, 1, '#8a6a4a');
      if (stroke) r.rect(hx, hy - 3, 1, 3, STEEL);
      break;
    case 'mug':
      r.rect(hx, hy - (stroke ? 4 : 0), 2, 2, '#d8a040');
      r.rect(hx, hy - (stroke ? 4 : 0), 2, 1, '#f4ecd4');
      break;
    case 'pen':
      r.rect(hx, hy + (stroke ? 1 : 0), 1, 2, '#2a2a30');
      break;
    case 'ladle':
      r.rect(hx, hy - (stroke ? 1 : 3), 1, 4, STEEL);
      r.rect(hx - 1, hy + (stroke ? 3 : 1), 2, 1, STEEL);
      break;
    case 'bottle':
      r.rect(hx, hy - 1, 1, 3, '#3a6a3a');
      r.rect(hx, hy - 2, 1, 1, '#c8b890');
      break;
  }
}

function drawLantern(r: Renderer, x: number, y: number, t: number): void {
  const sway = Math.round(Math.sin(t * 2.2) * 0.6);
  r.rect(x + sway, y - 2, 1, 2, IRON);
  r.rect(x - 1 + sway, y, 3, 4, IRON);
  r.rect(x + sway, y + 1, 1, 2, '#ffd27a');
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
