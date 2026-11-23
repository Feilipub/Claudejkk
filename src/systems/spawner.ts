/**
 * World population streaming. Keeps the simulation performance-aware:
 *  - Settlement NPCs exist only while the player is near that settlement
 *    (their persistent state lives in Game.npcMemory).
 *  - Wildlife is spawned out of sight around the player by regional
 *    ecology and time of day, and despawned when far away.
 *  - Wild mustang herds roam the open ranges; trader horses stand in corrals.
 *  - Authored encounters (hideouts, ambushes) spawn when approached.
 */
import { Rng, hashString } from '../core/rng.ts';
import { HORSE_NAMES, FIRST_NAMES_F, FIRST_NAMES_M, SURNAMES } from '../data/names.ts';
import type { EncounterDef, NpcDef, Occupation } from '../data/schema.ts';
import { getSpecies } from '../data/wildlife.ts';
import { REGIONS, ROADS, SETTLEMENTS, WORLD_H, WORLD_W } from '../data/world.ts';
import { completeLook } from '../entities/npc.ts';
import { Animal } from '../entities/animal.ts';
import { HorseEntity } from '../entities/horse.ts';
import { Npc } from '../entities/npc.ts';
import type { Game } from '../game.ts';
import { generateHorse } from '../horse/generator.ts';
import { evalCond } from './script.ts';
import { F, G } from '../world/tiles.ts';

const GENERIC_COUNT: Record<string, number> = { town: 9, city: 13, mining: 5, camp: 4, ranch: 3, fort: 5, lodge: 5, farm: 2, station: 1 };
const GENERIC_OCC: Record<string, Occupation[]> = {
  town: ['cowhand', 'farmer', 'traveler', 'child', 'cowhand', 'drifter', 'railroad', 'saloongirl', 'gambler'],
  city: ['banker', 'railroad', 'traveler', 'child', 'saloongirl', 'gambler', 'drifter', 'merchant', 'railroad', 'cowhand', 'pianist'],
  mining: ['miner', 'miner', 'miner', 'drifter', 'gambler'],
  camp: ['logger', 'logger', 'logger', 'cook'],
  ranch: ['cowhand', 'cowhand', 'stablehand'],
  fort: ['soldier', 'soldier', 'soldier', 'soldier', 'soldier'],
  lodge: ['breeder', 'elder', 'child', 'hunter', 'breeder'],
  farm: ['farmer', 'child'],
  station: ['railroad'],
};

export class Spawner {
  game: Game;
  rng = new Rng(31337);
  loadedSettlements = new Set<string>();
  spawnedEncounters = new Set<string>();
  private t = 0;
  private herdSeq = 0;
  /** Riders travelling the roads between settlements. */
  travelers: { h: HorseEntity; pts: [number, number][]; idx: number; dir: 1 | -1; pause: number; stuckT?: number; lastD?: number }[] = [];
  private travelT = 5;
  constructor(game: Game) {
    this.game = game;
  }

  /** NPC definitions for a settlement: authored + generated townsfolk. */
  npcDefsFor(settlementId: string): NpcDef[] {
    const g = this.game;
    const s = SETTLEMENTS.find((x) => x.id === settlementId)!;
    const named = g.content.NPCS.filter((n) => n.settlement === settlementId);
    const out = [...named];
    const n = GENERIC_COUNT[s.kind] ?? 0;
    const occs = GENERIC_OCC[s.kind] ?? ['traveler'];
    const rng = new Rng(hashString(settlementId + ':gen'));
    for (let i = 0; i < n; i++) {
      const occ = occs[i % occs.length]!;
      const female = occ === 'saloongirl' || rng.chance(0.38);
      const sayen = s.kind === 'lodge';
      const first = female ? rng.pick(FIRST_NAMES_F) : rng.pick(FIRST_NAMES_M);
      out.push({
        id: `gen_${settlementId}_${i}`,
        name: sayen ? `${rng.pick(['Tiyo', 'Asenka', 'Mareh', 'Kotah', 'Lenai', 'Sahro', 'Wenu', 'Talo'])} ${rng.pick(['Ashe', 'Veyna', 'Tolani', 'Rennick', 'Hollow-Creek', 'Osa'])}` : `${first} ${rng.pick(SURNAMES)}`,
        occupation: occ,
        settlement: settlementId,
        look: female ? { skirt: true } : {},
        personality: [rng.pick(['friendly', 'gruff', 'shy', 'talkative', 'nervous', 'proud', 'kind', 'drunk', 'pious', 'shrewd'])],
        faction: sayen ? 'sayen' : s.kind === 'fort' ? 'army' : 'townsfolk',
        bio: '',
      });
    }
    return out;
  }

  /** Per-frame: steer road travellers along their route. */
  updateTravelers(dt: number): void {
    const g = this.game;
    const p = g.player;
    for (const t of this.travelers) {
      if (t.h.dead) continue;
      if (!t.h.npcRiderLook) {
        t.idx = -1; // rider is gone; the horse is on its own now
        continue;
      }
      const far = Math.hypot(t.h.x - p.x, t.h.y - p.y) > 1500;
      const pt = t.pts[t.idx];
      if (far || !pt) {
        if (!far && !pt) { t.dir = (t.dir * -1) as 1 | -1; t.idx += t.dir * 2; if (t.pts[t.idx]) continue; }
        t.h.dead = true;
        continue;
      }
      // Give way: slow to a walk near the player.
      const near = Math.hypot(t.h.x - p.x, t.h.y - p.y) < 70;
      const d = t.h.driveTo(pt[0] * 16 + 8, pt[1] * 16 + 8, near ? 'walk' : t.h.data.stamina > 30 ? 'canter' : 'trot', dt, g);
      if (d < 20) t.idx += t.dir;
      // Not getting closer (wedged on a corner, or the player in the way): give up this point and move on.
      if (d < (t.lastD ?? Infinity) - 0.5) t.stuckT = 0;
      else t.stuckT = (t.stuckT ?? 0) + dt;
      t.lastD = d;
      if ((t.stuckT ?? 0) > 2.5) {
        t.stuckT = 0;
        t.lastD = Infinity;
        t.idx += t.dir;
        // Out of the player's sight a wedged rider is simply moved along.
        const nxt = t.pts[t.idx];
        if (nxt && Math.hypot(t.h.x - p.x, t.h.y - p.y) > 380) {
          t.h.x = nxt[0] * 16 + 8;
          t.h.y = nxt[1] * 16 + 8;
        }
      }
    }
    this.travelers = this.travelers.filter((t) => !t.h.dead && t.idx >= 0);
    this.travelT -= dt;
    if (this.travelT > 0 || this.travelers.length >= 3) return;
    this.travelT = 14 + this.rng.range(0, 16);
    // Pick a road near the player and start a rider out of sight along it.
    for (const road of ROADS) {
      const pts = road.points;
      let best = -1;
      let bd = Infinity;
      pts.forEach(([x, y], i) => {
        const d = Math.hypot(x * 16 - p.x, y * 16 - p.y);
        if (d > 450 && d < 900 && d < bd) {
          bd = d;
          best = i;
        }
      });
      if (best < 0) continue;
      const dir: 1 | -1 = best === 0 ? 1 : best === pts.length - 1 ? -1 : this.rng.chance(0.5) ? 1 : -1;
      const [sx, sy] = pts[best]!;
      const h = generateHorse(this.rng.int(1, 1e9), { regionId: g.currentRegion, training: 'trained', owner: 'npc' });
      h.gear = { saddle: 'saddleStock', bridle: 'bridleSnaffle', ...(this.rng.chance(0.5) ? { bags: 'bagsSmall' } : {}), ...(this.rng.chance(0.4) ? { bedroll: 'bedroll' } : {}) } as typeof h.gear;
      h.x = sx * 16 + 8;
      h.y = sy * 16 + 8;
      const he = new HorseEntity(h);
      he.externallyDriven = true;
      he.npcRiderLook = completeLook({}, new Rng(this.rng.int(1, 1e9)), this.rng.pick(['cowhand', 'traveler', 'railroad', 'drifter']));
      g.addEntity(he);
      this.travelers.push({ h: he, pts, idx: best + dir, dir, pause: 0 });
      break;
    }
  }

  update(dt: number): void {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1.2;
    this.streamSettlements();
    this.streamWildlife();
    this.streamHerds();
    this.streamEncounters();
  }

  private streamSettlements(): void {
    const g = this.game;
    const p = g.player;
    for (const s of SETTLEMENTS) {
      const d = Math.hypot(s.x * 16 - p.x, s.y * 16 - p.y);
      if (d < 900 && !this.loadedSettlements.has(s.id)) {
        this.loadedSettlements.add(s.id);
        for (const def of this.npcDefsFor(s.id)) {
          const mem = g.npcMemory[def.id];
          if (mem?.dead || mem?.left) continue;
          if (def.presentIf && !evalCond(g, def.presentIf)) continue;
          if (g.entityById(def.id)) continue;
          const n = new Npc(def, g);
          n.placeAtSchedule(g);
          g.addEntity(n);
        }
        // Trader horses in the corral.
        g.placeTraderHorses(s.id);
      } else if (d > 1400 && this.loadedSettlements.has(s.id)) {
        this.loadedSettlements.delete(s.id);
        for (const e of g.entities) {
          if (e instanceof Npc && e.settlementId === s.id && !e.hostile && e.state !== 'follow' && !e.tag) e.dead = true;
          if (e instanceof HorseEntity && e.data.owner.startsWith('trader:') && e.pen && Math.hypot(e.x - s.x * 16, e.y - s.y * 16) < 900) e.dead = true;
        }
      }
    }
    // Re-check presence conditions for loaded settlements (story NPCs appearing).
    for (const sid of this.loadedSettlements) {
      for (const def of g.content.NPCS) {
        if (def.settlement !== sid || !def.presentIf) continue;
        const present = evalCond(g, def.presentIf);
        const ent = g.entityById(def.id) as Npc | null;
        if (present && !ent && !g.npcMemory[def.id]?.dead && !g.npcMemory[def.id]?.left) {
          const n = new Npc(def, g);
          n.placeAtSchedule(g);
          g.addEntity(n);
        } else if (!present && ent && ent.state !== 'combat' && ent.state !== 'duel') ent.dead = true;
      }
    }
  }

  private streamWildlife(): void {
    const g = this.game;
    const p = g.player;
    let count = 0;
    for (const e of g.entities) {
      if (!(e instanceof Animal)) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d > 1100) e.dead = true;
      else count++;
    }
    const region = REGIONS.find((r) => r.id === g.currentRegion)!;
    const density = region.climate === 'arid' ? 5 : region.climate === 'alpine' ? 6 : 9;
    if (count >= density) return;
    if (g.law.inTown(p.x, p.y)) return;
    const night = g.clock.isNight;
    const pool = region.wildlife.filter((w) => w.species !== 'wildHorse');
    // Predators keep away from towns and ranches, and the first hour of a new game is spared them.
    const nearTown = SETTLEMENTS.some((st) => Math.hypot(st.x * 16 - p.x, st.y * 16 - p.y) < 1300);
    const safe = nearTown || g.playtime < 3600;
    const pool2 = safe ? pool.filter((w) => getSpecies(w.species).archetype !== 'predator') : pool;
    if (!pool2.length) return;
    const pick = this.rng.weighted(pool2, (w) => w.weight * (getSpecies(w.species).nocturnal ? (night ? 2 : 0.5) : night ? 0.6 : 1));
    const sp = getSpecies(pick.species);
    const pos = this.findSpawnPoint(380, 650);
    if (!pos) return;
    const n = sp.herd ? this.rng.int(sp.herd[0], sp.herd[1]) : 1;
    for (let i = 0; i < n; i++) {
      const a = new Animal(sp.id, pos.x + this.rng.range(-30, 30), pos.y + this.rng.range(-30, 30), this.rng.int(1, 1e9));
      if (g.world.blockedPx(a.x, a.y)) continue;
      g.addEntity(a);
    }
  }

  private streamHerds(): void {
    const g = this.game;
    const p = g.player;
    let herds = 0;
    for (const e of g.entities) {
      if (e instanceof HorseEntity && e.data.owner === 'wild' && !e.data.tag) {
        if (Math.hypot(e.x - p.x, e.y - p.y) > 1400 && g.taming.roped !== e) e.dead = true;
        else if (e.isHerdLeader) herds++;
      }
    }
    const region = REGIONS.find((r) => r.id === g.currentRegion)!;
    const w = region.wildlife.find((x) => x.species === 'wildHorse');
    // Mustang Flats always has a herd nearby.
    const flats = { x: 190 * 16, y: 390 * 16 };
    const nearFlats = Math.hypot(p.x - flats.x, p.y - flats.y) < 900;
    if (herds >= (nearFlats ? 2 : 1) || (!w && !nearFlats)) return;
    if (!nearFlats && !this.rng.chance(0.15 * (w?.weight ?? 0))) return;
    const pos = nearFlats && herds === 0 ? { x: flats.x + this.rng.range(-150, 150), y: flats.y + this.rng.range(-150, 150) } : this.findSpawnPoint(450, 750);
    if (!pos) return;
    this.spawnHerd(pos.x, pos.y, g.currentRegion);
  }

  spawnHerd(x: number, y: number, regionId: string): void {
    const g = this.game;
    const herdId = `herd_${this.herdSeq++}`;
    const n = this.rng.int(3, 6);
    for (let i = 0; i < n; i++) {
      const breedId = regionId === 'drylands' || regionId === 'redstone' ? (this.rng.chance(0.25) ? 'criollo' : 'mustang') : this.rng.chance(0.15) ? 'paint' : 'mustang';
      const h = generateHorse(this.rng.int(1, 1e9), { breedId, training: 'wild', owner: 'wild', name: this.rng.pick(HORSE_NAMES) });
      h.x = x + this.rng.range(-40, 40);
      h.y = y + this.rng.range(-40, 40);
      if (g.world.blockedPx(h.x, h.y)) continue;
      const he = new HorseEntity(h);
      he.herdId = herdId;
      he.isHerdLeader = i === 0;
      g.addEntity(he);
    }
    // The legendary pale mare joins one Mustang Flats herd once her legend is known.
    if (g.flags['pale_mare_known'] && !g.flags['pale_mare_tamed'] && Math.hypot(x - 190 * 16, y - 390 * 16) < 900 && !g.entityById('h_palemare')) {
      const h = generateHorse(777777, { breedId: 'mustang', training: 'wild', owner: 'wild', name: 'The Pale Mare', sex: 'mare', age: 6 });
      h.id = 'h_palemare';
      h.appearance.coat = 'white';
      h.appearance.pattern = 'solid';
      h.appearance.face = 'none';
      h.appearance.legs = ['none', 'none', 'none', 'none'];
      for (const k of Object.keys(h.genes)) h.genes[k] = 1.12;
      h.traits = ['independent', 'brave'];
      h.tag = 'pale_mare';
      h.x = x + 30;
      h.y = y;
      const he = new HorseEntity(h);
      he.herdId = herdId;
      g.addEntity(he);
    }
  }

  private streamEncounters(): void {
    const g = this.game;
    const p = g.player;
    for (const enc of g.content.ENCOUNTERS) {
      if (this.spawnedEncounters.has(enc.id)) continue;
      if (g.flags[`enc_cleared_${enc.id}`] && enc.once !== false) continue;
      const d = Math.hypot(enc.x * 16 - p.x, enc.y * 16 - p.y);
      if (d > 750) continue;
      // Story encounters only exist while a quest references them, or if roaming.
      if (!this.encounterRelevant(enc)) continue;
      this.spawnEncounter(enc);
    }
  }

  encounterRelevant(enc: EncounterDef): boolean {
    const g = this.game;
    const refs = [...g.quests.defs.values()].filter((q) => JSON.stringify(q).includes(`"${enc.id}"`) || q.stages.some((s) => s.objectives.some((o) => enc.enemies.some((e) => e.tag === o.target) || (enc.horses ?? []).some((h) => h.tag === o.target))));
    if (!refs.length) return true; // roaming encounter
    return refs.some((q) => g.quests.state(q.id)?.status === 'active');
  }

  spawnEncounter(enc: EncounterDef): void {
    const g = this.game;
    this.spawnedEncounters.add(enc.id);
    const rng = new Rng(hashString(enc.id));
    let k = 0;
    for (const e of enc.enemies) {
      for (let i = 0; i < (e.count ?? 1); i++) {
        const id = `${enc.id}_${k++}`;
        if (g.npcMemory[id]?.dead) continue;
        const a = rng.range(0, Math.PI * 2);
        const r = rng.range(16, 70);
        let x = enc.x * 16 + Math.cos(a) * r;
        let y = enc.y * 16 + Math.sin(a) * r;
        const free = g.world.findNear(Math.floor(x / 16), Math.floor(y / 16), 6, (tx, ty) => !g.world.blockedPx(tx * 16 + 8, ty * 16 + 10) && !g.world.terrainAt(tx * 16 + 8, ty * 16 + 8).water);
        if (free) {
          x = free.x * 16 + 8;
          y = free.y * 16 + 10;
        }
        const def: NpcDef = {
          id,
          name: (e.count ?? 1) > 1 ? `${e.name}` : e.name,
          occupation: 'outlaw',
          settlement: enc.id,
          look: e.look ?? {},
          personality: ['gruff'],
          faction: 'coyle',
          bio: '',
          combat: { health: e.health, weapon: e.weapon, accuracy: e.accuracy, courage: e.courage },
          fixed: { x: Math.floor(x / 16), y: Math.floor(y / 16) },
        };
        const n = new Npc(def, g);
        n.x = x;
        n.y = y;
        n.tag = e.tag;
        n.setState('guard');
        g.addEntity(n);
      }
    }
    (enc.horses ?? []).forEach((hdef, hi) => {
      for (let i = 0; i < (hdef.count ?? 1); i++) {
        const id = `h_${enc.id}_${hdef.tag}_${hi}_${i}`;
        if (g.horses.has(id)) continue;
        if (g.flags[`delivered_${id}`]) continue;
        const h = generateHorse(hashString(id), { breedId: hdef.breedId, training: 'broke', owner: 'wild', name: (hdef.count ?? 1) > 1 ? `${hdef.name}${i ? ' ' + 'II III IV V'.split(' ')[i - 1] : ''}` : hdef.name });
        h.id = id;
        h.tag = hdef.tag;
        if (hdef.sex) h.sex = hdef.sex;
        if (hdef.coat) h.appearance.coat = hdef.coat;
        if (hdef.pattern) h.appearance.pattern = hdef.pattern as typeof h.appearance.pattern;
        if (hdef.traits) h.traits = hdef.traits;
        if (hdef.age) h.age = hdef.age;
        h.tameness = 100;
        h.x = enc.x * 16 + rng.range(-40, 40);
        h.y = enc.y * 16 + rng.range(20, 60);
        h.tiedAt = { x: h.x, y: h.y };
        const he = new HorseEntity(h);
        g.addEntity(he);
      }
    });
  }

  /** Called when the player leaves the area: allow respawn of roaming encounters later. */
  resetEncounter(id: string): void {
    this.spawnedEncounters.delete(id);
  }

  findSpawnPoint(minD: number, maxD: number): { x: number; y: number } | null {
    const g = this.game;
    const p = g.player;
    for (let i = 0; i < 12; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const d = this.rng.range(minD, maxD);
      const x = p.x + Math.cos(a) * d;
      const y = p.y + Math.sin(a) * d;
      if (x < 64 || y < 64 || x > WORLD_W * 16 - 64 || y > WORLD_H * 16 - 64) continue;
      const tx = Math.floor(x / 16);
      const ty = Math.floor(y / 16);
      const gnd = g.world.groundAt(tx, ty);
      if (gnd === G.DeepWater || gnd === G.ShallowWater || gnd === G.Cliff) continue;
      if (g.world.flagAt(tx, ty) & (F.Settlement | F.Road)) continue;
      if (g.world.blockedPx(x, y, true)) continue;
      return { x, y };
    }
    return null;
  }
}
