/**
 * Game: owns the world, every system and every entity, runs the fixed
 * update order each frame, and provides the services systems use to talk to
 * each other (notifications, noise, flags, items, horses, persistence).
 */
import { EventBus } from './core/events.ts';
import { Input } from './core/input.ts';
import { Rng } from './core/rng.ts';
import { BALANCE } from './data/balance.ts';
import { getBreed } from './data/breeds.ts';
import { getItem, registerItem } from './data/items.ts';
import type { NpcDef } from './data/schema.ts';
import { getShop } from './data/shops.ts';
import { POIS, REGIONS, SETTLEMENTS } from './data/world.ts';
import { CONTENT, type Content } from './data/content.ts';
import { Animal } from './entities/animal.ts';
import { Entity, SpatialHash } from './entities/entity.ts';
import { HorseEntity } from './entities/horse.ts';
import { Npc } from './entities/npc.ts';
import { Player } from './entities/player.ts';
import { AudioEngine } from './audio/audio.ts';
import { grantBond, penalizeBond } from './horse/bonding.ts';
import { dailyCareReview, injure } from './horse/care.ts';
import { generateHorse } from './horse/generator.ts';
import { breedFoal, canBreed, GESTATION_DAYS } from './horse/breeding.ts';
import { addHistory, type HorseData, type InjuryKind } from './horse/horse.ts';
import { bondLevel, maxStamina } from './horse/stats.ts';
import { Renderer } from './render/renderer.ts';
import type { HumanLook } from './render/humanSprite.ts';
import { TerrainCache } from './render/terrain.ts';
import { Activities } from './systems/activities.ts';
import { CampSystem, Campfire } from './systems/camp.ts';
import { CombatSystem } from './systems/combat.ts';
import { DialogueSystem } from './systems/dialogue.ts';
import { Economy } from './systems/economy.ts';
import { JobSystem } from './systems/jobs.ts';
import { InteractionSystem } from './systems/interactions.ts';
import { LawSystem } from './systems/law.ts';
import { QuestSystem } from './systems/quests.ts';
import { Reputation } from './systems/reputation.ts';
import { readSave, writeSave } from './systems/save.ts';
import { Spawner } from './systems/spawner.ts';
import { TamingSystem } from './systems/taming.ts';
import { HorseThiefSystem } from './systems/horsethief.ts';
import { GameClock } from './systems/time.ts';
import { WeatherSystem } from './systems/weather.ts';
import { SocialSystem } from './systems/social.ts';
import type { UI } from './ui/ui.ts';
import type { Spot, Corral } from './world/settlements.ts';
import type { Building, World } from './world/world.ts';

export interface NpcMemory {
  opinion: number;
  dead?: boolean;
  left?: boolean;
  /** Short memory of notable interactions. */
  events: string[];
}

export class Game {
  world: World;
  spots: Spot[];
  corrals: Corral[];
  private spotIndex = new Map<string, Spot[]>();
  private buildingIndex = new Map<string, Building[]>();
  content: Content = CONTENT;
  bus = new EventBus();
  input: Input;
  clock = new GameClock();
  weather = new WeatherSystem();
  renderer: Renderer;
  audio = new AudioEngine();
  spatial = new SpatialHash(96);
  rng = new Rng(1888);
  player: Player;
  entities: Entity[] = [];
  horses = new Map<string, HorseEntity>();
  flags: Record<string, number | boolean | string> = {};
  rep = new Reputation();
  law: LawSystem;
  quests: QuestSystem;
  dialogue: DialogueSystem;
  economy: Economy;
  /** Paid work, notice boards and homestead prompts (systems/jobs.ts). */
  jobs: JobSystem;
  interactions: InteractionSystem;
  camp: CampSystem;
  activities: Activities;
  taming: TamingSystem;
  thieves: HorseThiefSystem;
  combat: CombatSystem;
  spawner: Spawner;
  social: SocialSystem;
  encounters: { spawn: (id: string) => void; spawnBountyHunters: (n: number) => void };
  ui!: UI;
  npcMemory: Record<string, NpcMemory> = {};
  discovered = new Set<string>();
  loreUnlocked = new Set<string>();
  /** Visited map chunks (8x8 tiles) for the explored-map overlay. */
  explored = new Uint8Array(96 * 96);
  ownedGear: Record<string, number> = {};
  /** Mares in foal at the ranch. */
  pregnancies: { damId: string; sireId: string; dueDay: number; seed: number }[] = [];
  raceMarkers: { x: number; y: number }[] = [];
  /** Player-set map waypoint (px). */
  waypoint: { x: number; y: number } | null = null;
  time = 0;
  /** Last ambient NPC bark (one speaker at a time). */
  lastBarkAt = -99;
  dt = 0;
  playtime = 0;
  lastGameMinutes = 0;
  currentRegion = 'dustfall';
  temperatureHere = 70;
  nearFire = false;
  paused = false;
  /** True while the title menu is showing the live world. */
  titleMode = false;
  slot = 'slot1';
  private lastDay = 1;
  private lastRegion = '';
  private autosaveT = 120;

  constructor(canvas: HTMLCanvasElement, world: World, spots: Spot[], corrals: Corral[], look: HumanLook) {
    this.world = world;
    this.spots = spots;
    this.corrals = corrals;
    for (const s of spots) {
      let a = this.spotIndex.get(s.settlementId);
      if (!a) this.spotIndex.set(s.settlementId, (a = []));
      a.push(s);
    }
    for (const b of world.buildings) {
      let a = this.buildingIndex.get(b.settlementId);
      if (!a) this.buildingIndex.set(b.settlementId, (a = []));
      a.push(b);
    }
    for (const it of this.content.QUEST_ITEMS) registerItem(it);
    this.input = new Input();
    this.input.attach(canvas);
    this.renderer = new Renderer(canvas);
    this.renderer.terrain = new TerrainCache(world);
    this.player = new Player(look);
    this.law = new LawSystem(this);
    this.quests = new QuestSystem(this, this.content.QUESTS);
    this.dialogue = new DialogueSystem(this, this.content.DIALOGUE, this.content.BARKS);
    this.economy = new Economy(this);
    this.jobs = new JobSystem(this);
    this.interactions = new InteractionSystem(this);
    this.camp = new CampSystem(this);
    this.activities = new Activities(this);
    this.taming = new TamingSystem(this);
    this.thieves = new HorseThiefSystem(this);
    this.combat = new CombatSystem(this);
    this.spawner = new Spawner(this);
    this.social = new SocialSystem(this);
    this.encounters = {
      spawn: (id) => {
        const e = this.content.ENCOUNTERS.find((x) => x.id === id);
        if (e) this.spawner.spawnEncounter(e);
      },
      spawnBountyHunters: (n) => this.spawnBountyHunters(n),
    };
    this.player.skills.onLevel = (s, l) => this.notify(`Skill improved: ${s} ${l}`, 'good');
    this.rep.onChange = (k, d) => {
      if (Math.abs(d) >= 3 && k !== 'notoriety') this.notify(`${k === 'honor' ? 'Honor' : k} ${d > 0 ? '▲' : '▼'}`, d > 0 ? 'good' : 'bad');
    };
    this.addEntity(this.player);
  }

  // --- Setup -------------------------------------------------------------------------
  /** Fresh story start in Larkspur with Biscuit, the rental horse. */
  newGame(name: string): void {
    const p = this.player;
    p.name = name;
    const livery = this.world.buildings.find((b) => b.settlementId === 'larkspur' && b.type === 'stable')!;
    p.x = (livery.doorX + 1) * 16 + 8;
    p.y = (livery.y - 2) * 16;
    p.angle = Math.PI / 2;
    p.respawnPoint = { x: p.x, y: p.y };
    p.weapons = ['revolverCattleman', 'knifeHunting', 'lasso'];
    p.clip = { revolverCattleman: 6 };
    p.holstered = true;
    const start: Record<string, number> = { ammoPistol: 24, canteenWater: 2, beans: 2, jerky: 3, carrot: 4, apple: 2, brush: 1, hoofPick: 1, bandage: 2, coffee: 1 };
    for (const [k, v] of Object.entries(start)) p.inv.force(k, v);
    // Biscuit: a calm old Morgan lent by the livery.
    const b = generateHorse(424242, { breedId: 'morgan', name: 'Biscuit', training: 'trained', sex: 'gelding', age: 14 });
    b.traits = ['calm', 'lazy'];
    b.owner = 'player';
    b.rentalUntilDay = 4;
    b.tag = 'rental';
    b.bondXp = 130;
    b.trust = 60;
    b.gear = { saddle: 'saddleStock', bridle: 'bridleSnaffle' };
    b.gearCondition = { saddle: 70, bridle: 80 };
    b.x = p.x + 26;
    b.y = p.y + 6;
    b.tiedAt = { x: (livery.x) * 16 + 8, y: (livery.y - 1) * 16 };
    addHistory(b, 1, 'Rented from Larkspur Livery.');
    this.adoptHorse(new HorseEntity(b));
    p.mainHorseId = b.id;
    this.unlockLore('doc_silasLetter');
    this.renderer.snapCamera = true;
    this.renderer.forcePaint = true;
    this.notify('Larkspur, Calder Territory — April 3rd, 1888.', 'quest');
  }

  // --- Entities ---------------------------------------------------------------------------
  addEntity(e: Entity): void {
    this.entities.push(e);
    if (e instanceof HorseEntity) this.horses.set(e.id, e);
  }
  entityById(id: string): Entity | null {
    return this.entities.find((e) => e.id === id && !e.dead) ?? null;
  }
  adoptHorse(h: HorseEntity): void {
    h.data.owner = 'player';
    if (!this.horses.has(h.id) || !this.entities.includes(h)) this.addEntity(h);
    if (!this.player.mainHorseId) this.player.mainHorseId = h.id;
  }
  mainHorse(): HorseEntity | null {
    const id = this.player.mainHorseId;
    const h = id ? this.horses.get(id) : null;
    return h && h.data.alive && h.data.owner === 'player' ? h : null;
  }
  ownedHorses(): HorseEntity[] {
    return [...this.horses.values()].filter((h) => h.data.owner === 'player' && h.data.alive);
  }
  horsesTagged(tag: string): HorseEntity[] {
    return [...this.horses.values()].filter((h) => h.data.tag === tag && h.data.alive && !h.dead);
  }
  horsesLed(): number {
    return [...this.horses.values()].filter((h) => h.leading).length;
  }
  nearestRideableHorse(x: number, y: number, r: number): HorseEntity | null {
    return this.spatial.nearest(x, y, r, (e) => e instanceof HorseEntity && !e.rider && e.data.alive && !e.data.owner.startsWith('trader:') && !e.externallyDriven) as HorseEntity | null;
  }

  // --- Main loop ------------------------------------------------------------------------------
  update(dt: number): void {
    this.input.pollGamepad();
    this.dt = dt;
    this.time += dt;
    this.playtime += dt;
    if (this.paused || this.ui.modalOpen) {
      this.lastGameMinutes = 0;
      return;
    }
    this.lastGameMinutes = this.clock.tick(dt);
    const p = this.player;
    const region = this.world.regionAtPx(p.x, p.y);
    this.currentRegion = region;
    if (region !== this.lastRegion) {
      const r = REGIONS.find((x) => x.id === region)!;
      if (this.lastRegion) this.ui.banner(r.name, 3);
      this.lastRegion = region;
      this.bus.emit('regionEntered', { regionId: region });
    }
    this.temperatureHere = this.weather.temperature(region, this.clock.hour, this.world.heightPx(p.x, p.y));
    this.nearFire = this.camp.near();
    this.weather.update(this.lastGameMinutes, dt, region, () => {
      setTimeout(() => this.audio.play('thunder'), 400 + Math.random() * 1500);
      this.noise(p.x + 400, p.y - 300, 900, 'thunder', 'sky');
    });
    if (this.clock.day !== this.lastDay) this.onNewDay();

    this.spatial.rebuild(this.entities);
    // Simulation tiers: full near the player, low far away.
    for (const e of this.entities) {
      if (e.dead) continue;
      const d = Math.abs(e.x - p.x) + Math.abs(e.y - p.y);
      if (e === p || d < 900 || (e instanceof HorseEntity && (e.leading || e.rider || e.externallyDriven))) e.update(dt, this);
      else e.updateLow(dt, this);
    }
    if (this.input.pressed('whistle') && p.mount) this.whistle();
    // Story-requested duel starts once the conversation that set it closes.
    if (this.flags.duel_pending && !this.dialogue.open && !this.activities.busy) {
      const id = String(this.flags.duel_pending);
      delete this.flags.duel_pending;
      this.activities.start('duel', id);
    }
    this.taming.update(dt);
    this.thieves.update(dt);
    this.activities.update(dt);
    this.jobs.update(dt);
    this.combat.update(dt);
    this.law.update(dt);
    this.quests.update(dt);
    this.spawner.update(dt);
    this.spawner.updateTravelers(dt);
    this.social.update(dt);
    this.camp.update();
    this.interactions.update();
    this.checkDiscoveries();
    this.updateExplored();
    // Remove dead entities.
    if (this.entities.some((e) => e.dead)) {
      this.entities = this.entities.filter((e) => !e.dead || e === p);
      for (const [id, h] of this.horses) if (h.dead && h.data.owner !== 'player') this.horses.delete(id);
    }
    // Keyboard shortcuts for menus and camp.
    if (this.input.pressed('camp')) this.camp.make();
    if (this.input.pressed('quicksave')) this.save(this.slot, true);
    this.autosaveT -= dt;
    if (this.autosaveT <= 0) {
      this.autosaveT = 180;
      if (p.alive && this.combat.tension < 0.1) this.save('autosave', false);
    }
    const listener = p;
    this.audio.listenerX = listener.x;
    this.audio.listenerY = listener.y;
    this.audio.update(dt, {
      wind: this.weather.current.wind,
      rain: this.weather.current.rain,
      night: this.clock.isNight,
      daylight: this.clock.daylight,
      inside: !!this.world.insideBuilding(p.x, p.y),
      region,
      tension: this.combat.tension,
      music: this.clock.isNight ? 'night' : REGIONS.find((r) => r.id === region)!.music,
    });
  }

  /** Cover a mare at the ranch; the foal arrives after GESTATION_DAYS. */
  breed(damId: string, sireId: string): string | null {
    const dam = this.horses.get(damId);
    const sire = this.horses.get(sireId);
    if (!dam || !sire) return 'Both horses must be here.';
    const err = canBreed(dam.data, sire.data);
    if (err) return err;
    if (this.pregnancies.some((p) => p.damId === damId)) return `${dam.data.name} is already in foal.`;
    this.pregnancies.push({ damId, sireId, dueDay: this.clock.day + GESTATION_DAYS, seed: this.rng.int(1, 1e9) });
    addHistory(dam.data, this.clock.day, `Covered by ${sire.data.name}.`);
    this.notify(`${dam.data.name} is in foal. Expect the foal in ${GESTATION_DAYS} days at the ranch.`, 'horse');
    return null;
  }

  private deliverFoals(): void {
    const corral = this.corrals.find((c) => c.settlementId === 'brannigan');
    for (const p of this.pregnancies.filter((x) => x.dueDay <= this.clock.day)) {
      const dam = this.horses.get(p.damId);
      const sire = this.horses.get(p.sireId);
      if (dam && sire) {
        const foal = breedFoal(dam.data, sire.data, p.seed, this.clock.day);
        if (corral) {
          foal.x = corral.x * 16 + corral.w * 8;
          foal.y = corral.y * 16 + corral.h * 8;
        }
        const fe = new HorseEntity(foal);
        if (corral) fe.pen = { x: corral.x * 16 + 16, y: corral.y * 16 + 16, w: (corral.w - 2) * 16, h: (corral.h - 2) * 16 };
        this.adoptHorse(fe);
        addHistory(dam.data, this.clock.day, 'Gave birth to a healthy foal.');
        this.notify(`A foal was born at the Brannigan ranch, out of ${dam.data.name}! Name it from the horse screen.`, 'good');
      }
    }
    this.pregnancies = this.pregnancies.filter((x) => x.dueDay > this.clock.day);
  }

  private onNewDay(): void {
    this.lastDay = this.clock.day;
    this.deliverFoals();
    this.economy.daily();
    this.jobs.daily();
    for (const h of this.ownedHorses()) {
      const msg = dailyCareReview(h.data, this.clock.day);
      if (msg) this.notify(msg, 'bad');
      // Horses age slowly: one game year per 120 days.
      h.data.age += 1 / 120;
      if (h.data.rentalUntilDay && this.clock.day > h.data.rentalUntilDay && h.data.tag === 'rental' && this.flags['main_horse_chosen']) {
        h.data.owner = 'trader:stable_larkspur';
        h.dead = true;
        this.horses.delete(h.id);
        this.notify('Biscuit has been returned to the Larkspur livery.', 'horse');
      }
    }
  }

  // --- Services -------------------------------------------------------------------------------
  notify(text: string, kind: 'info' | 'good' | 'bad' | 'horse' | 'quest' | 'law' = 'info'): void {
    this.ui?.notify(text, kind);
  }

  setFlag(key: string, value: number | boolean | string): void {
    this.flags[key] = value;
    this.bus.emit('flag', { key, value });
  }

  /** A loud event: animals, horses and NPCs hear it. */
  noise(x: number, y: number, radius: number, kind: 'gunshot' | 'shout' | 'whistle' | 'thunder' | 'predator' | 'crash', source: string): void {
    for (const e of this.spatial.query(x, y, radius)) {
      if (e instanceof HorseEntity) e.hearNoise(x, y, radius, kind, this);
      else if (e instanceof Animal && kind === 'gunshot' && e.alive && e.sp.archetype !== 'predator') e.startFlee(this, x, y);
      else if (e instanceof Npc && kind === 'gunshot' && source === 'player' && e.state === 'schedule' && e.alive) {
        if (e.occupation === 'outlaw' || e.tag) {
          e.hostile = true;
          e.setState('combat');
        } else if (Math.hypot(e.x - x, e.y - y) < radius * 0.5) e.setState(e.rng.chance(0.5) ? 'cower' : 'flee');
      }
    }
    this.social.onNoise(x, y, radius, kind, source);
    if (kind === 'gunshot' && source === 'player') this.law.reportCrime('discharge', x, y);
  }

  mouseWorld(): { x: number; y: number } {
    return this.renderer.screenToWorld(this.input.mouseX, this.input.mouseY);
  }
  isNearCamera(x: number, y: number, pad: number): boolean {
    const r = this.renderer;
    return x > r.camX - pad && x < r.camX + r.vw + pad && y > r.camY - pad && y < r.camY + r.vh + pad;
  }

  /** Whistle: the main horse comes if it can hear you and wants to. */
  whistle(): void {
    const p = this.player;
    this.audio.play('whistle');
    if (this.thieves.onWhistle()) return;
    const h = this.mainHorse();
    if (!h) {
      this.notify('No horse of yours to call.', 'info');
      return;
    }
    if (this.thieves.impounded?.horseId === h.id) {
      this.notify(`${h.data.name} is tied at a livery far away. Go and get it.`, 'horse');
      return;
    }
    if (h.rider) return;
    h.wake('Woken by your whistle');
    const range = BALANCE.horse.whistleRangeByBond[bondLevel(h.data) - 1]! * (h.data.traits.includes('loyal') ? 1.3 : 1);
    const d = Math.hypot(h.x - p.x, h.y - p.y);
    if (d > range) {
      if (d > 2500) {
        // Too far to hear: the horse makes its way to you along the roads (off-screen).
        h.x = p.x + (Math.random() - 0.5) * 500;
        h.y = p.y + 380;
        const free = this.world.findNear(Math.floor(h.x / 16), Math.floor(h.y / 16), 10, (x, y) => !this.world.blockedPx(x * 16 + 8, y * 16 + 8, true) && !this.world.terrainAt(x * 16 + 8, y * 16 + 8).water);
        if (free) {
          h.x = free.x * 16 + 8;
          h.y = free.y * 16 + 8;
          h.calledAt = this.time;
          h.brainTimer = 0;
          h.data.tiedAt = null;
          this.notify(`${h.data.name} heard you from afar and is on the way.`, 'horse');
        }
        return;
      }
      this.notify(`${h.data.name} is too far away to hear you (bond ${bondLevel(h.data)} range).`, 'horse');
      return;
    }
    if (h.data.tiedAt) {
      this.notify(`${h.data.name} whinnies but is tied up.`, 'horse');
      this.audio.neigh(h.x, h.y, false);
      return;
    }
    h.calledAt = this.time;
    h.brainTimer = 0;
  }

  visibleBuildings(x0: number, y0: number, x1: number, y1: number): Building[] {
    return this.world.buildings.filter((b) => b.x * 16 < x1 && (b.x + b.w) * 16 > x0 && (b.y - 2) * 16 < y1 && (b.y + b.h) * 16 > y0);
  }
  spotsFor(settlementId: string): Spot[] {
    return this.spotIndex.get(settlementId) ?? [];
  }
  buildingsOf(settlementId: string): Building[] {
    return this.buildingIndex.get(settlementId) ?? [];
  }

  // --- Horses: economy & stable glue ------------------------------------------------------
  /** Place a trader's horses inside the stable's corral. */
  placeTraderHorses(settlementId: string): void {
    const stable = this.buildingsOf(settlementId).find((b) => b.shopId && getShop(b.shopId)?.horses);
    if (!stable) return;
    const shopId = stable.shopId!;
    const corral = this.corrals.find((c) => c.settlementId === settlementId) ?? null;
    const horses = this.economy.horsesFor(shopId);
    horses.forEach((hd, i) => {
      if (this.horses.has(hd.id) && !this.horses.get(hd.id)!.dead) return;
      const he = new HorseEntity(hd);
      if (corral) {
        he.pen = { x: corral.x * 16 + 16, y: corral.y * 16 + 16, w: (corral.w - 2) * 16, h: (corral.h - 2) * 16 };
        he.x = he.pen.x + 16 + ((i * 37) % Math.max(16, he.pen.w - 32));
        he.y = he.pen.y + 16 + ((i * 23) % Math.max(16, he.pen.h - 32));
      } else {
        he.x = (stable.doorX + i * 2 - 3) * 16;
        he.y = (stable.y + stable.h + 2) * 16;
        hd.tiedAt = { x: he.x, y: he.y };
      }
      hd.x = he.x;
      hd.y = he.y;
      this.addEntity(he);
    });
  }
  onTraderRestock(shopId: string): void {
    for (const h of this.horses.values()) if (h.data.owner === `trader:${shopId}`) h.dead = true;
    const st = SETTLEMENTS.find((s) => this.buildingsOf(s.id).some((b) => b.shopId === shopId));
    if (st && this.spawner.loadedSettlements.has(st.id)) setTimeout(() => this.placeTraderHorses(st.id), 0);
  }
  acquireTraderHorse(h: HorseData, shopId: string): void {
    const he = this.horses.get(h.id);
    const stable = this.world.buildings.find((b) => b.shopId === shopId)!;
    if (he) {
      he.pen = null;
      he.x = stable.doorX * 16 + 8;
      he.y = (stable.y + stable.h + 1) * 16;
    }
    const ent = he ?? new HorseEntity(h);
    if (!he) {
      ent.x = stable.doorX * 16 + 8;
      ent.y = (stable.y + stable.h + 1) * 16;
    }
    this.adoptHorse(ent);
    if (!this.mainHorse() || this.mainHorse()!.data.tag === 'rental') this.player.mainHorseId = h.id;
    this.notify(`${h.name} is yours. Lead it out of the corral.`, 'good');
  }
  releaseHorseToTrader(he: HorseEntity, shopId: string): void {
    he.dead = true;
    this.horses.delete(he.id);
    if (this.player.mainHorseId === he.id) this.player.mainHorseId = this.ownedHorses().find((h) => h !== he)?.id ?? null;
    void shopId;
  }
  /** Story effect: give the player a horse. */
  giveHorse(spec: { breedId: string; name?: string; seed?: number; training?: 'green' | 'broke' | 'trained'; gear?: Record<string, string>; sex?: 'mare' | 'gelding' | 'stallion' }): void {
    const seed = spec.seed ?? (spec.name ? [...spec.name].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0 : this.rng.int(1, 1e9));
    const h = generateHorse(seed, { breedId: spec.breedId, name: spec.name, training: spec.training ?? 'broke', owner: 'player', sex: spec.sex });
    if (spec.gear) h.gear = { ...spec.gear } as HorseData['gear'];
    else h.gear = { bridle: 'bridleRope' };
    for (const s of Object.keys(h.gear)) h.gearCondition[s as keyof HorseData['gear']] = 100;
    // Story horses start a little neglected so the care tutorial matters.
    h.hunger = 35;
    h.thirst = 30;
    h.cleanliness = 25;
    h.stress = 30;
    const p = this.player;
    // Lead the new horse up beside the player (visible, reachable).
    let spot = { x: p.x + 30, y: p.y + 8 };
    for (const [ox, oy] of [[30, 8], [-30, 8], [0, 26], [36, -10], [-36, -10], [0, -24]]) {
      if (!this.world.blockedPx(p.x + ox, p.y + oy, true) && !this.world.blockedPx(p.x + ox + 10, p.y + oy, true) && !this.world.blockedPx(p.x + ox - 10, p.y + oy, true)) {
        spot = { x: p.x + ox, y: p.y + oy };
        break;
      }
    }
    h.x = spot.x;
    h.y = spot.y;
    addHistory(h, this.clock.day, 'Became your horse.');
    const he = new HorseEntity(h);
    this.adoptHorse(he);
    this.player.mainHorseId = h.id;
    this.setFlag('main_horse_chosen', true);
    this.notify(`${h.name} is now your horse.`, 'good');
    this.audio.play('bond');
  }
  injureHorse(h: HorseEntity, kind: InjuryKind, severity: number, cause: string): void {
    injure(h.data, kind, severity, this.clock.day, cause);
  }
  killHorse(h: HorseEntity, cause: string): void {
    h.data.alive = false;
    h.data.health = 0;
    if (h.rider) h.rider.dismount(this, true);
    addHistory(h.data, this.clock.day, `Died: ${cause}.`);
    if (h.data.owner === 'player') {
      this.notify(`${h.data.name} is dead.`, 'bad');
      this.setFlag(`horse_died_${h.id}`, true);
    }
    h.dead = true;
    const carcass = new Animal('deer', h.x, h.y, 1);
    carcass.state = 'dead';
    carcass.alive = false;
    carcass.skinned = true;
    void carcass;
  }
  checkBondLevel(h: HorseEntity): void {
    const lvl = bondLevel(h.data);
    const key = `bond_${h.id}`;
    const prev = (this.flags[key] as number) || 1;
    if (lvl > prev) {
      this.flags[key] = lvl;
      const names = ['', 'Wary', 'Familiar', 'Trusting', 'Devoted', 'Kindred'];
      this.ui.banner(`Bond with ${h.data.name}: ${names[lvl]}`, 3);
      this.audio.play('bond');
      addHistory(h.data, this.clock.day, `Your bond deepened: ${names[lvl]}.`);
      this.bus.emit('horseBond', { horseId: h.id, level: lvl });
    } else if (lvl < prev) this.flags[key] = lvl;
  }
  horseSummary(h: HorseEntity): string {
    const d = h.data;
    return `${getBreed(d.breedId).name} · ${d.sex} · ${Math.floor(d.age)} yrs`;
  }
  breedName(id: string): string {
    return getBreed(id).name;
  }

  // --- NPCs, combat outcomes ---------------------------------------------------------------
  npcOpinion(id: string): number {
    return this.npcMemory[id]?.opinion ?? 0;
  }
  changeOpinion(id: string, d: number): void {
    if (!id) return;
    const m = (this.npcMemory[id] ??= { opinion: 0, events: [] });
    m.opinion = Math.max(-100, Math.min(100, m.opinion + d));
  }
  npcLocation(id: string): { x: number; y: number } | null {
    const e = this.entityById(id);
    if (e) return { x: e.x, y: e.y };
    const def = this.content.NPCS.find((n) => n.id === id);
    if (!def) return null;
    if (def.fixed) return { x: def.fixed.x * 16 + 8, y: def.fixed.y * 16 + 8 };
    const s = SETTLEMENTS.find((x) => x.id === def.settlement);
    return s ? { x: s.x * 16, y: s.y * 16 } : null;
  }
  makeHostile(id: string): void {
    const n = this.entityById(id) as Npc | null;
    if (n) {
      n.hostile = true;
      n.combat ??= { health: 100, weapon: 'revolverCattleman', accuracy: 0.6, courage: 0.7 };
      n.setState('combat');
    }
  }
  npcLeave(id: string): void {
    (this.npcMemory[id] ??= { opinion: 0, events: [] }).left = true;
    const n = this.entityById(id);
    if (n) n.dead = true;
  }
  onNpcKilled(n: Npc, byPlayer: boolean): void {
    (this.npcMemory[n.id] ??= { opinion: 0, events: [] }).dead = true;
    this.quests.onKill(n.id, n.tag);
    this.bus.emit('npcKilled', { npcId: n.id, byPlayer, hostile: n.hostile });
    if (byPlayer && !n.hostile && n.state !== 'surrender') this.law.reportCrime('murder', n.x, n.y, n.id);
    else if (byPlayer && n.state === 'surrender') this.rep.add('honor', -6);
    if (byPlayer && n.hostile) this.player.skills.gain('shooting', 6);
    if (n.tag) {
      const left = this.entities.filter((e) => e instanceof Npc && e.tag === n.tag && e.alive && e.state !== 'surrender' && e.state !== 'hogtied');
      const enc = this.content.ENCOUNTERS.find((e) => e.enemies.some((x) => x.tag === n.tag) && Math.hypot(e.x * 16 - n.x, e.y * 16 - n.y) < 600);
      if (!left.length && enc) {
        this.setFlag(`enc_cleared_${enc.id}`, true);
        this.notify(`${enc.name}: cleared.`, 'quest');
      }
    }
  }
  onAnimalKilled(a: Animal, byPlayer: boolean): void {
    if (!byPlayer) return;
    // Branded cattle belong to someone: killing a steer is theft of livestock.
    if (a.speciesId === 'cattle') this.law.reportCrime('animalCruelty', a.x, a.y);
    this.quests.onHunt(a.speciesId);
    this.bus.emit('animalKilled', { speciesId: a.speciesId, byPlayer, x: a.x, y: a.y });
    this.player.skills.gain('survival', 3);
  }
  turnInBounty(n: Npc): void {
    const sheriff = this.spatial.nearest(n.x, n.y, 400, (e) => e instanceof Npc && (e.occupation === 'sheriff' || e.occupation === 'deputy'));
    if (!sheriff && !this.law.inTown(n.x, n.y)) {
      this.notify('Bring them to a sheriff\'s office in town.', 'info');
      return;
    }
    this.setFlag(`captured_${n.id}`, true);
    if (n.tag) this.setFlag(`captured_${n.tag}`, true);
    this.quests.onKill(n.id, n.tag);
    n.dead = true;
    (this.npcMemory[n.id] ??= { opinion: 0, events: [] }).left = true;
    const reward = 15;
    this.player.money += reward;
    this.rep.add('honor', 3);
    this.notify(`The law takes ${n.name} into custody. +${reward} dollars`, 'good');
  }
  private spawnBountyHunters(n: number): void {
    const pos = this.spawner.findSpawnPoint(350, 500);
    if (!pos) return;
    for (let i = 0; i < n; i++) {
      const def: NpcDef = {
        id: `hunter_${Math.floor(this.time)}_${i}`,
        name: 'Bounty Hunter',
        occupation: 'bountyhunter',
        settlement: 'none',
        look: { coat: '#2a2520', hat: 'cowboy', hatColor: '#1e1a16' },
        personality: ['stern'],
        bio: '',
        combat: { health: 110, weapon: i % 2 ? 'repeaterLancaster' : 'revolverCattleman', accuracy: 0.65, courage: 0.8 },
      };
      const npc = new Npc(def, this);
      npc.x = pos.x + i * 18;
      npc.y = pos.y;
      npc.hostile = true;
      npc.tag = 'bounty_hunter';
      npc.setState('combat');
      this.addEntity(npc);
    }
    this.notify('Bounty hunters are on your trail!', 'law');
  }

  // --- Items & lore ------------------------------------------------------------------------
  giveItem(id: string, qty = 1): void {
    const it = getItem(id);
    if (it.category === 'horseGear') {
      // Fit it straight onto the main horse if that slot is empty or only has a rope halter.
      const h = this.mainHorse();
      const slot = it.gear!.slot;
      if (h && h.data.tag !== 'rental' && (!h.data.gear[slot] || h.data.gear[slot] === 'bridleRope')) {
        h.data.gear[slot] = id;
        h.data.gearCondition[slot] = 100;
        h.refreshStats();
        if (qty > 1) this.ownedGear[id] = (this.ownedGear[id] ?? 0) + qty - 1;
        this.notify(`${it.name} fitted on ${h.data.name}.`, 'good');
        return;
      }
      this.ownedGear[id] = (this.ownedGear[id] ?? 0) + qty;
      this.notify(`Received: ${it.name} (stored with your tack — fit it from the horse screen [B])`, 'good');
      return;
    }
    if (it.category === 'weapon') {
      if (!this.player.weapons.includes(id)) this.player.weapons.push(id);
      this.notify(`Received: ${it.name}`, 'good');
      return;
    }
    const n = this.player.inv.add(id, qty);
    const overflow = qty - n;
    let stored = 0;
    if (overflow > 0) {
      const h = this.mainHorse();
      if (h && Math.hypot(h.x - this.player.x, h.y - this.player.y) < 200) {
        h.data.bagItems[id] = (h.data.bagItems[id] ?? 0) + overflow;
        stored = overflow;
      }
    }
    if (n + stored > 0) this.notify(`+${n + stored} ${it.name}${stored ? ' (to saddlebags)' : ''}`, 'good');
    else this.notify(`No room for ${it.name}.`, 'bad');
    this.bus.emit('itemGained', { itemId: id, qty });
  }
  unlockLore(id: string): void {
    if (this.loreUnlocked.has(id)) return;
    if (!this.content.LORE.some((l) => l.id === id)) return;
    this.loreUnlocked.add(id);
    const doc = this.content.LORE.find((l) => l.id === id)!;
    this.notify(`Document added to journal: ${doc.title}`, 'quest');
  }
  discoverPoi(id: string, silent = false): void {
    if (this.discovered.has(id)) return;
    this.discovered.add(id);
    const poi = POIS.find((p) => p.id === id);
    if (!poi) return;
    this.bus.emit('locationDiscovered', { poiId: id });
    if (!silent) {
      this.ui.banner(`Discovered: ${poi.name}`, 3);
      this.rep.add('honor', 0);
      this.player.skills.gain('survival', 5);
    }
    if (poi.doc) this.unlockLore(poi.doc);
    if (poi.kind === 'treasure' && !this.flags[`treasure_${id}`]) {
      this.setFlag(`treasure_${id}`, true);
      this.player.money += 60;
      this.giveItem('goldNugget', 2);
    }
  }
  private checkDiscoveries(): void {
    const p = this.player;
    for (const poi of POIS) {
      if (this.discovered.has(poi.id)) continue;
      if (Math.hypot(poi.x * 16 + 8 - p.x, poi.y * 16 + 8 - p.y) < (poi.hidden ? 48 : 110)) this.discoverPoi(poi.id);
    }
    for (const s of SETTLEMENTS) {
      const k = `visited_${s.id}`;
      if (!this.flags[k] && Math.hypot(s.x * 16 - p.x, s.y * 16 - p.y) < 300) {
        this.flags[k] = true;
        this.ui.banner(s.name, 3);
      }
    }
  }
  private updateExplored(): void {
    const p = this.player;
    const cx = Math.floor(p.x / 128);
    const cy = Math.floor(p.y / 128);
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && y >= 0 && x < 96 && y < 96) this.explored[y * 96 + x] = 1;
      }
  }
  signText(x: number, y: number): string {
    // Same scale as the quest tracker (1 tile = 2 yards); the town you're standing in is named, not pointed at.
    const all = SETTLEMENTS.map((s) => ({ s, d: Math.hypot(s.x - x, s.y - y) })).sort((a, b) => a.d - b.d);
    const here = all[0] && all[0].d < 30 ? all[0].s : null;
    const near = all
      .filter(({ s }) => s !== here)
      .slice(0, 3)
      .map(({ s, d }) => {
        const ang = Math.atan2(s.y - y, s.x - x);
        const dir = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'][(Math.round(ang / (Math.PI / 4)) + 8) % 8];
        const yds = d * 2;
        return `${s.name} — ${yds < 1760 ? Math.round(yds / 10) * 10 + ' yds' : (yds / 1760).toFixed(1) + ' mi'} ${dir}`;
      });
    if (here) near.unshift(`You are in ${here.name}`);
    return near.join('  ·  ');
  }

  advanceTime(minutes: number): void {
    // Simulate needs for everyone in coarse steps (sleep, jail, waiting).
    const step = 30;
    let left = minutes;
    while (left > 0) {
      const m = Math.min(step, left);
      left -= m;
      this.clock.advance(m);
      this.lastGameMinutes = m;
      for (const h of this.horses.values()) h.updateLow(0, this);
      const s = this.player.stats;
      s.hunger = Math.max(0, s.hunger - (BALANCE.player.hungerPerHour * m) / 60 * 0.5);
      s.thirst = Math.max(0, s.thirst - (BALANCE.player.thirstPerHour * m) / 60 * 0.5);
      if (this.clock.day !== this.lastDay) this.onNewDay();
    }
    this.lastGameMinutes = 0;
  }

  /** Sleep: restores energy and health, advances time, autosaves. */
  sleep(hours: number): void {
    const p = this.player;
    this.advanceTime(hours * 60);
    p.stats.energy = Math.min(100, p.stats.energy + hours * 12);
    p.stats.health = Math.min(p.stats.maxHealth, p.stats.health + hours * 8);
    p.stats.stamina = p.stats.maxStamina;
    for (const h of this.ownedHorses()) {
      if (Math.hypot(h.x - p.x, h.y - p.y) < 200) {
        h.data.energy = Math.min(100, h.data.energy + hours * 6);
        h.data.stamina = maxStamina(h.data);
        if (this.camp.near()) grantBond(h.data, 'timeTogetherHour', this.clock.day, hours * 0.5);
      }
    }
    this.notify(`You sleep ${hours} hours. It's ${this.clock.timeString()}.`, 'info');
    this.save('autosave', false);
  }

  /** A mounted traveller or rival is knocked or pulled from the saddle and becomes a full NPC. */
  dismountNpcRider(h: HorseEntity): Npc | null {
    if (!h.npcRiderLook) return null;
    const def: NpcDef = {
      id: `rider_${h.id}`,
      name: h.data.tag === 'race' ? 'Jockey' : 'Traveller',
      occupation: 'traveler',
      settlement: 'none',
      look: h.npcRiderLook,
      personality: ['nervous'],
      bio: '',
    };
    const n = new Npc(def, this);
    n.x = h.x + 12;
    n.y = h.y + 4;
    this.addEntity(n);
    h.npcRiderLook = null;
    h.externallyDriven = false;
    h.speed = 0;
    h.data.owner = 'npc';
    return n;
  }

  /** Ranch work: a green colt is brought out; ride out its bucking to get paid. */
  startRanchWork(x: number, y: number): void {
    const h = generateHorse(this.rng.int(1, 1e9), { breedId: this.rng.pick(['quarter', 'paint', 'mustang', 'morgan']), training: 'green', owner: 'wild', age: 3 });
    h.tag = 'ranch_colt';
    h.tameness = 70;
    h.training.saddle = 5;
    h.gear = { saddle: 'saddleStock', bridle: 'bridleRope' };
    h.x = x;
    h.y = y;
    const he = new HorseEntity(h);
    this.addEntity(he);
    this.teleportPlayer(x - 12, y);
    this.notify('Hollis leads out a snorting colt. Mount it and stay on!', 'horse');
    this.taming.startBreaking(he);
  }

  /** Stagecoach travel: the main horse comes along; time passes. */
  fastTravel(x: number, y: number, minutes: number): void {
    const p = this.player;
    if (p.mount) p.dismount(this, false);
    this.advanceTime(minutes);
    this.teleportPlayer(x, y);
    const h = this.mainHorse();
    if (h) {
      h.x = x + 24;
      h.y = y + 6;
      h.data.tiedAt = null;
      h.leading = false;
    }
    for (const w of Object.values(this.weather.regions)) void w;
    this.weather.current.rain = this.weather.current.snow = this.weather.current.dust = 0;
  }

  teleportPlayer(x: number, y: number): void {
    const p = this.player;
    if (p.mount) {
      p.mount.x = x;
      p.mount.y = y;
    }
    p.x = x;
    p.y = y;
    this.renderer.snapCamera = true;
    this.renderer.forcePaint = true;
  }

  onPlayerDeath(cause: string): void {
    this.ui.showDeath(cause);
  }
  respawn(): void {
    const p = this.player;
    p.alive = true;
    p.stats.health = 60;
    p.stats.stamina = 60;
    const lost = Math.round(p.money * 0.15 * 100) / 100;
    p.money -= lost;
    // Wake at the nearest doctor's.
    const docs = this.world.buildings.filter((b) => b.type === 'doctor');
    const doc = docs.sort((a, b) => Math.hypot(a.x * 16 - p.x, a.y * 16 - p.y) - Math.hypot(b.x * 16 - p.x, b.y * 16 - p.y))[0]!;
    this.advanceTime(8 * 60);
    // The doctor's broth and water bucket: you don't wake starving.
    p.stats.hunger = Math.max(p.stats.hunger, 60);
    p.stats.thirst = Math.max(p.stats.thirst, 60);
    p.stats.energy = Math.max(p.stats.energy, 70);
    this.teleportPlayer(doc.doorX * 16 + 8, (doc.doorY + 2) * 16);
    for (const e of this.entities) if (e instanceof Npc && e.hostile) e.setState('schedule');
    const h = this.mainHorse();
    if (h && Math.hypot(h.x - p.x, h.y - p.y) > 400) {
      h.x = p.x + 30;
      h.y = p.y + 10;
      h.data.tiedAt = null;
    }
    this.notify(`You wake at the doctor's. The bill: ${lost.toFixed(2)} dollars.`, 'bad');
  }

  private markerCache = { t: -1, give: new Set<string>(), talk: new Set<string>() };
  /** Quest marker for an NPC: '!' offers work, '?' is needed by an active objective. */
  npcMarker(id: string): '!' | '?' | null {
    const mc = this.markerCache;
    if (this.time - mc.t > 1) {
      mc.t = this.time;
      mc.give.clear();
      mc.talk.clear();
      for (const q of this.quests.active())
        for (const o of this.quests.visibleObjectives(q.id))
          if ((o.type === 'talk' || o.type === 'deliver') && o.target && !this.quests.state(q.id)!.done.includes(o.id)) mc.talk.add(o.target);
      for (const t of this.content.DIALOGUE) {
        const json = JSON.stringify(t);
        for (const m of json.matchAll(/"startQuest":"([a-z_]+)"/g)) if (!this.quests.state(m[1]!) && !this.quests.defs.get(m[1]!)?.autoStart) mc.give.add(t.npc);
      }
    }
    if (mc.talk.has(id)) return '?';
    if (mc.give.has(id)) return '!';
    return null;
  }

  /** Markers drawn into the world buffer (quest targets, race flags). */
  drawWorldMarkers(r: Renderer): void {
    for (const m of this.raceMarkers) {
      r.rect(m.x - 1, m.y - 24, 2, 24, '#3a2618');
      r.rect(m.x + 1, m.y - 24, 9, 6, Math.floor(this.time * 3) % 2 ? '#d83a2a' : '#f0c040');
    }
  }

  // --- Persistence --------------------------------------------------------------------------
  serialize(): Record<string, unknown> {
    const p = this.player;
    return {
      player: {
        name: p.name, look: p.look, x: p.x, y: p.y, stats: p.stats, inv: p.inv.items, money: p.money, weapons: p.weapons, clip: p.clip,
        mainHorseId: p.mainHorseId, skills: p.skills.xp, mounted: p.mount?.id ?? null,
      },
      horses: this.ownedHorses().map((h) => ({ ...h.data, x: h.x, y: h.y })),
      clock: this.clock.minutes,
      weather: this.weather.serialize(),
      flags: this.flags,
      rep: this.rep.values,
      law: this.law.wanted,
      quests: this.quests.serialize(),
      npcMemory: this.npcMemory,
      discovered: [...this.discovered],
      lore: [...this.loreUnlocked],
      explored: Array.from(this.explored).join(''),
      economy: this.economy.serialize(),
      jobs: this.jobs.serialize(),
      ownedGear: this.ownedGear,
      pregnancies: this.pregnancies,
      camp: this.camp.fire ? { x: this.camp.fire.x, y: this.camp.fire.y } : null,
      playtime: this.playtime,
    };
  }

  save(slot: string, announce: boolean): boolean {
    if (!this.player.alive) return false;
    const label = `${this.player.name} — ${this.clock.dateString()} — ${REGIONS.find((r) => r.id === this.currentRegion)?.name}`;
    const ok = writeSave(slot, label, this.playtime, this.serialize());
    if (announce) this.notify(ok ? 'Game saved.' : 'Save failed — storage unavailable.', ok ? 'good' : 'bad');
    return ok;
  }

  load(slot: string): boolean {
    const res = readSave(slot);
    if (!res) return false;
    const d = res.file.data as Record<string, any>;
    const p = this.player;
    try {
      const pd = d.player;
      p.name = pd.name;
      p.look = pd.look;
      p.x = pd.x;
      p.y = pd.y;
      Object.assign(p.stats, pd.stats);
      p.inv.items = { ...pd.inv };
      p.money = pd.money;
      p.weapons = pd.weapons;
      p.clip = pd.clip ?? {};
      p.skills.xp = { ...p.skills.xp, ...(pd.skills ?? {}) };
      for (const hd of d.horses as HorseData[]) {
        const he = new HorseEntity(hd);
        he.x = hd.x;
        he.y = hd.y;
        this.adoptHorse(he);
      }
      p.mainHorseId = pd.mainHorseId;
      if (pd.mounted) {
        const h = this.horses.get(pd.mounted);
        if (h) {
          p.mount = h;
          h.rider = p;
        }
      }
      this.clock.minutes = d.clock;
      this.lastDay = this.clock.day;
      this.weather.load(d.weather ?? {});
      this.flags = d.flags ?? {};
      Object.assign(this.rep.values, d.rep ?? {});
      this.law.wanted = d.law ?? {};
      this.quests.load(d.quests ?? {});
      this.npcMemory = d.npcMemory ?? {};
      this.discovered = new Set(d.discovered ?? []);
      this.loreUnlocked = new Set(d.lore ?? []);
      if (typeof d.explored === 'string') for (let i = 0; i < Math.min(d.explored.length, this.explored.length); i++) this.explored[i] = d.explored[i] === '1' ? 1 : 0;
      this.economy.load(d.economy ?? {});
      this.jobs.load(d.jobs ?? {});
      this.ownedGear = d.ownedGear ?? {};
      this.pregnancies = d.pregnancies ?? [];
      this.playtime = d.playtime ?? 0;
      if (d.camp) {
        this.camp.fire = new Campfire(d.camp.x, d.camp.y);
        this.addEntity(this.camp.fire);
      }
      this.slot = slot.startsWith('autosave') ? 'slot1' : slot;
      this.renderer.snapCamera = true;
      this.renderer.forcePaint = true;
      if (res.usedBackup) this.notify('Main save was damaged — loaded the backup copy.', 'bad');
      else this.notify('Game loaded.', 'good');
      void penalizeBond;
      return true;
    } catch (e) {
      console.error('Load failed', e);
      return false;
    }
  }
}
