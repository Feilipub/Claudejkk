/**
 * Paid work. Every settlement with a notice board posts a rotating set of jobs
 * each day (data/jobs.ts JOB_BOARDS); townsfolk whose trade matches a job hand
 * the same offers out when asked for work. One job is active at a time:
 *
 * - deliver:    carry cargo to another board before a deadline (freight, mail,
 *               strongbox runs with a chance of road agents).
 * - gather:     bring goods to the board (ore, timber, wheat, fish, pelts).
 * - cattle:     push stray steers back through a ranch corral gate.
 * - chores:     flagged tasks at world objects (mend fence, feed troughs, strike at the anvil).
 * - breakHorse: the colt-breaking activity at the Brannigan corral, with a contract bonus.
 * - bounty:     an outlaw camp; alive via any sheriff, dead claimed at the board.
 * - bartend:    a saloon shift of customer orders.
 *
 * Self-directed labour (dig ore, fell timber, harvest wheat) and homesteads are
 * offered at world objects through `worldTarget`. Pay formulas live in
 * systems/economy.ts; design in design/gdd/economy-jobs.md. UI is only
 * g.ui.choice / g.notify / g.ui.banner / the shared fishing meter.
 */
import { Rng, hashString } from '../core/rng.ts';
import { BALANCE } from '../data/balance.ts';
import { getItem } from '../data/items.ts';
import {
  BAR_ORDERS, BAR_POURS, BOUNTY_CAMPS, JOB_BOARDS, JOB_TEMPLATES, LAND_OFFICES, OCCUPATION_WORK, PLOTS, UPGRADES, WORK_ACTIONS,
  type JobBoardDef, type JobTemplate, type PlotDef, type WorkActionDef,
} from '../data/jobs.ts';
import { FIRST_NAMES_M, SURNAMES } from '../data/names.ts';
import type { NpcDef } from '../data/schema.ts';
import { SETTLEMENTS } from '../data/world.ts';
import { Animal } from '../entities/animal.ts';
import { Npc } from '../entities/npc.ts';
import type { Game } from '../game.ts';
import type { Action } from './interactions.ts';
import {
  deliveryDeadline, deliveryPerformance, jobPay, rollBoardOffers, strikeGauge, strikePerformance, tileDistance,
  type JobOffer, type PayContext,
} from './economy.ts';
import { O } from '../world/tiles.ts';

/** The job in progress (saved). */
export interface ActiveJob {
  offer: JobOffer;
  /** Absolute game minute the job was taken and the one it must be done by. */
  startedAt: number;
  deadline: number;
  // deliver
  ambushAt?: number;
  ambushed?: boolean;
  // cattle
  penned?: number;
  lost?: number;
  // chores (px positions)
  tasks?: { x: number; y: number; done: boolean }[];
  hits?: number;
  misses?: number;
  // breakHorse
  breaksBefore?: number;
  // bounty
  outlawId?: string;
  outlawDead?: boolean;
}

interface Strike {
  label: string;
  need: number;
  hits: number;
  misses: number;
  t: number;
  cooldown: number;
  onDone: (hits: number, misses: number) => void;
}

interface JobsSave {
  active?: ActiveJob | null;
  taken?: Record<string, number>;
  standing?: Record<string, number>;
  worked?: Record<string, number>;
  stats?: JobSystem['stats'];
}

const TREE_OBJS = new Set<number>();

export class JobSystem {
  game: Game;
  active: ActiveJob | null = null;
  /** Offer id → day taken (an offer is taken once). */
  taken: Record<string, number> = {};
  /** Employer standing per board settlement. */
  standing: Record<string, number> = {};
  /** `${day}:${work}:${tileKey}` → units already taken from that tile today. */
  worked: Record<string, number> = {};
  stats = { done: 0, failed: 0, earned: 0 };
  /** Strike mini-game in progress (blocks other interactions). */
  strike: Strike | null = null;
  private strikeEndedAt = -99;
  private rng = new Rng(77);
  private cattle: Animal[] = [];
  private pennedSet = new Set<Animal>();
  private bandits: Npc[] = [];
  private boardPos = new Map<string, { x: number; y: number } | null>();
  private choreCache = new Map<string, { x: number; y: number }[]>();
  private plotPos = new Map<string, { x: number; y: number }>();
  private ownWaypoint: { x: number; y: number } | null = null;
  private unsub: (() => void) | null = null;

  constructor(game: Game) {
    this.game = game;
    for (const n of WORK_ACTIONS.chop!.objs) TREE_OBJS.add(O[n as keyof typeof O]);
    this.unsub = game.bus.on('npcKilled', (e) => {
      if (this.active?.outlawId === e.npcId) {
        this.active.outlawDead = true;
        const b = JOB_BOARDS.find((x) => x.settlementId === this.active!.offer.boardId);
        game.notify(`The outlaw is dead. Claim the reduced bounty at the ${b?.name ?? 'board'}.`, 'quest');
        this.setWaypoint(this.boardPx(this.active.offer.boardId));
      }
    });
  }

  /** True while a strike mini-game owns the interact key (and for a moment after, so the last swing doesn't fire a prompt). */
  get busy(): boolean {
    return this.strike !== null || this.game.time - this.strikeEndedAt < 0.35;
  }

  // --- Queries ------------------------------------------------------------------------------

  template(id: string): JobTemplate {
    return JOB_TEMPLATES.find((t) => t.id === id)!;
  }

  /** Pay context for a template at a board, with the given performance. */
  payContext(t: JobTemplate, boardId: string, demand: number, perf: number): PayContext {
    const g = this.game;
    return {
      skillLevel: t.skill ? g.player.skills.level(t.skill) : 1,
      rep: t.faction ? g.rep.get(t.faction) : 0,
      standing: this.standing[boardId] ?? 0,
      demand,
      perf,
    };
  }

  /** Pay the offer would earn at performance 1. */
  quote(o: JobOffer): number {
    const t = this.template(o.templateId);
    return jobPay(t, o.units, o.tiles, this.payContext(t, o.boardId, o.demand, 1));
  }

  /** Tile positions of every board settlement (delivery destinations). */
  private boardTiles(): Record<string, { x: number; y: number }> {
    const out: Record<string, { x: number; y: number }> = {};
    for (const b of JOB_BOARDS) {
      const s = SETTLEMENTS.find((x) => x.id === b.settlementId);
      if (s && this.boardPx(b.settlementId)) out[b.settlementId] = { x: s.x, y: s.y };
    }
    return out;
  }

  /** Today's offers at a board. */
  offers(boardId: string): JobOffer[] {
    const b = JOB_BOARDS.find((x) => x.settlementId === boardId);
    if (!b) return [];
    return rollBoardOffers(b, this.game.clock.day, this.boardTiles(), BOUNTY_CAMPS, (t) => this.canHost(t, b));
  }

  /** Whether the local world can host a template (chore objects exist, a corral for cattle…). */
  private canHost(t: JobTemplate, b: JobBoardDef): boolean {
    if (t.chores) return this.choreSpots(b.settlementId, t).length > 0;
    if (t.cattle) return !!this.corralOf(b.settlementId);
    if (t.kind === 'breakHorse') return !!this.corralOf(b.settlementId) && b.settlementId === 'brannigan';
    return true;
  }

  /** Board door position in px (cached), or null if the settlement has no suitable building. */
  boardPx(sid: string): { x: number; y: number } | null {
    if (this.boardPos.has(sid)) return this.boardPos.get(sid)!;
    const def = JOB_BOARDS.find((b) => b.settlementId === sid);
    let pos: { x: number; y: number } | null = null;
    if (def) {
      const bs = this.game.buildingsOf(sid);
      for (const type of def.buildings) {
        const b = bs.find((x) => x.type === type && !x.ruined);
        if (b) {
          pos = { x: b.doorX * 16 + 8, y: (b.doorY + 1) * 16 + 4 };
          break;
        }
      }
    }
    this.boardPos.set(sid, pos);
    return pos;
  }

  private corralOf(sid: string): { x: number; y: number; w: number; h: number; gx: number; gy: number } | null {
    const cs = this.game.corrals.filter((c) => c.settlementId === sid).sort((a, b) => b.w * b.h - a.w * a.h);
    const c = cs[0];
    if (!c) return null;
    return { x: c.x * 16 + 20, y: c.y * 16 + 20, w: (c.w - 2) * 16 - 8, h: (c.h - 2) * 16 - 8, gx: c.gateX * 16 + 8, gy: c.gateY * 16 + 8 };
  }

  /** Reachable tiles holding a chore's objects within a settlement, px centres. */
  private choreSpots(sid: string, t: JobTemplate): { x: number; y: number }[] {
    const key = `${sid}:${t.id}`;
    const hit = this.choreCache.get(key);
    if (hit) return hit;
    const s = SETTLEMENTS.find((x) => x.id === sid);
    const W = this.game.world;
    const objs = new Set((t.chores?.objs ?? []).map((n) => O[n as keyof typeof O] as number));
    const out: { x: number; y: number }[] = [];
    if (s) {
      for (let y = s.y - 28; y <= s.y + 28; y++) {
        for (let x = s.x - 28; x <= s.x + 28; x++) {
          if (!W.inBounds(x, y) || !objs.has(W.objAt(x, y))) continue;
          // Someone has to be able to stand next to it.
          const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !W.blockedPx((x + dx!) * 16 + 8, (y + dy!) * 16 + 10));
          if (open) out.push({ x: x * 16 + 8, y: y * 16 + 8 });
        }
      }
    }
    this.choreCache.set(key, out);
    return out;
  }

  // --- Notice board UI ----------------------------------------------------------------------

  /** Open a settlement's notice board, optionally limited to some templates ("Ask for work"). */
  openBoard(sid: string, only?: string[], who?: string): void {
    const g = this.game;
    const b = JOB_BOARDS.find((x) => x.settlementId === sid);
    if (!b) return;
    if (b.requiresQuest && g.quests.state(b.requiresQuest)?.status !== 'completed') {
      g.notify('Nobody is hiring here yet.', 'info');
      return;
    }
    const a = this.active;
    const opts: { label: string; enabled: boolean; run: () => void }[] = [];
    if (a) {
      const t = this.template(a.offer.templateId);
      const turnIn = this.turnInAction(sid);
      if (turnIn) opts.push({ label: turnIn.label, enabled: turnIn.enabled !== false, run: turnIn.run });
      opts.push({ label: `Quit current job: ${t.title}`, enabled: true, run: () => this.confirmQuit() });
    }
    const offers = this.offers(sid).filter((o) => !only || only.includes(o.templateId));
    for (const o of offers) {
      const t = this.template(o.templateId);
      const taken = this.taken[o.id] !== undefined;
      opts.push({ label: `${t.title} · ${this.detail(o)} · $${this.quote(o).toFixed(2)}${taken ? ' (taken)' : ''}`, enabled: !taken && !a, run: () => this.showOffer(o, only, who) });
    }
    if (LAND_OFFICES.includes(sid) && !only) opts.push({ label: 'Land office: homesteads', enabled: true, run: () => this.openLandOffice(sid) });
    opts.push({ label: 'Leave', enabled: true, run: () => {} });
    const st = Math.round(this.standing[sid] ?? 0);
    const head = who ? `${who} has work going.` : `${b.name}, ${g.clock.dateString()}.`;
    const busy = a ? ` You are on a job: ${this.template(a.offer.templateId).title}.` : '';
    const none = offers.length ? '' : ' Nothing posted today. Come back tomorrow.';
    g.ui.choice(`${head} Your standing here: ${st >= 0 ? '+' : ''}${st}.${busy}${none}`, opts);
  }

  /** One-line summary of what an offer asks for. */
  detail(o: JobOffer): string {
    const t = this.template(o.templateId);
    const dest = o.destId ? SETTLEMENTS.find((s) => s.id === o.destId)?.name ?? o.destId : '';
    switch (t.kind) {
      case 'deliver': return `to ${dest}, ${Math.round(deliveryDeadline(o.tiles, t.deliver!.pace))} min`;
      case 'gather': return `${o.units} × ${getItem(o.item!).name}`;
      case 'cattle': return `${o.units} steers`;
      case 'chores': return `${o.units} × ${t.chores!.label.toLowerCase()}`;
      case 'bounty': return `${BOUNTY_CAMPS.find((c) => c.id === o.camp)?.name ?? 'in the hills'}${o.units > 1 ? `, ${o.units - 1} with him` : ''}`;
      case 'bartend': return `${o.units} orders`;
      default: return 'one session';
    }
  }

  private showOffer(o: JobOffer, only?: string[], who?: string): void {
    const g = this.game;
    const t = this.template(o.templateId);
    const req = this.requirement(t, o);
    g.ui.choice(`${t.title}. ${t.blurb} (${this.detail(o)}; pays about $${this.quote(o).toFixed(2)} at your skill and standing.)${req ? ` ${req}` : ''}`, [
      { label: 'Take the job', enabled: !req, run: () => this.accept(o) },
      { label: 'Back', enabled: true, run: () => this.openBoard(o.boardId, only, who) },
    ]);
  }

  /** Why the player cannot take this job right now, or null. */
  requirement(t: JobTemplate, o: JobOffer): string | null {
    const g = this.game;
    const p = g.player;
    if (this.active) return 'Finish your current job first.';
    if (t.risk === 'honest' && g.rep.get('honor') < BALANCE.jobs.minHonor) return 'Nobody honest will hire someone with your name.';
    if (t.kind === 'bounty' && g.law.isWanted(g.currentRegion)) return 'The law doesn\'t hire wanted men.';
    if (t.deliver) {
      const it = getItem(t.deliver.cargo);
      if (p.inv.capacity - p.inv.weight < it.weight * t.deliver.qty) return `You need ${(it.weight * t.deliver.qty).toFixed(1)} kg free in your satchel.`;
    }
    if (t.chores?.consumes && !p.inv.canAdd(t.chores.consumes)) return 'You need room in your satchel for the hay.';
    if (o.templateId === 'lumber_contract' && !p.inv.has('axe')) return 'You need a felling axe (general stores sell them).';
    if (o.templateId === 'ore_contract' && !p.inv.has('pickaxe')) return 'You need a prospector\'s pick.';
    if (o.templateId.startsWith('fish_') && !p.inv.has('fishingRod')) return 'You need a fishing rod.';
    if (t.kind === 'breakHorse' && g.flags[`ranchwork_${g.clock.day}`]) return 'The colts have had enough for today.';
    return null;
  }

  // --- Lifecycle ----------------------------------------------------------------------------

  /** Take an offer. */
  accept(o: JobOffer): void {
    const g = this.game;
    const t = this.template(o.templateId);
    const req = this.requirement(t, o);
    if (req) {
      g.notify(req, 'bad');
      return;
    }
    const now = g.clock.minutes;
    const a: ActiveJob = { offer: o, startedAt: now, deadline: now + 24 * 60 };
    this.taken[o.id] = g.clock.day;
    this.active = a;
    const board = JOB_BOARDS.find((b) => b.settlementId === o.boardId)!;
    switch (t.kind) {
      case 'deliver': {
        const d = t.deliver!;
        g.player.inv.add(d.cargo, d.qty);
        a.deadline = now + deliveryDeadline(o.tiles, d.pace);
        if (d.ambushChance && this.rng.chance(d.ambushChance)) a.ambushAt = this.rng.range(BALANCE.jobs.ambushWindow[0], BALANCE.jobs.ambushWindow[1]);
        this.setWaypoint(this.boardPx(o.destId!));
        g.notify(`${d.qty} × ${getItem(d.cargo).name} to ${SETTLEMENTS.find((s) => s.id === o.destId)?.name}. Deliver within ${Math.round(a.deadline - now)} minutes.`, 'quest');
        break;
      }
      case 'gather':
        a.deadline = now + t.gather!.deadlineDays * 24 * 60;
        g.notify(`Bring ${o.units} × ${getItem(o.item!).name} to the ${board.name} within ${t.gather!.deadlineDays} day${t.gather!.deadlineDays > 1 ? 's' : ''}.`, 'quest');
        break;
      case 'cattle':
        a.deadline = now + t.cattle!.limitMinutes;
        a.penned = 0;
        a.lost = 0;
        this.spawnCattle(a, o.units);
        g.notify(`${o.units} steers are loose. Ride round behind them and push them through the corral gate.`, 'quest');
        break;
      case 'chores': {
        const c = t.chores!;
        a.deadline = now + c.limitMinutes;
        const spots = this.choreSpots(o.boardId, t);
        a.tasks = this.pickSpread(spots, Math.min(c.count, spots.length)).map((s) => ({ ...s, done: false }));
        a.hits = 0;
        a.misses = 0;
        o.units = a.tasks.length;
        if (c.consumes) g.player.inv.add(c.consumes, a.tasks.length);
        g.notify(`Flags mark the work: ${a.tasks.length} × ${c.label.toLowerCase()}.${c.consumes ? ` You're handed ${a.tasks.length} × ${getItem(c.consumes).name}.` : ''}`, 'quest');
        break;
      }
      case 'breakHorse': {
        const corral = this.corralOf(o.boardId)!;
        a.breaksBefore = Number(g.flags.ranchwork_done ?? 0);
        a.deadline = now + 120;
        g.startRanchWork(corral.x + corral.w / 2, corral.y + corral.h / 2);
        break;
      }
      case 'bounty': {
        a.deadline = now + t.bounty!.limitDays * 24 * 60;
        a.outlawId = `jobbounty_${hashString(o.id)}`;
        const camp = BOUNTY_CAMPS.find((c) => c.id === o.camp) ?? BOUNTY_CAMPS[0]!;
        this.setWaypoint({ x: camp.x * 16 + 8, y: camp.y * 16 + 8 });
        g.notify(`Wanted ${t.bounty!.title} was seen ${camp.name}. Alive: hogtie and hand to a sheriff. Dead: claim here.`, 'quest');
        break;
      }
      case 'bartend':
        this.runBarShift(o.units);
        break;
    }
    g.audio.play('ui');
  }

  private confirmQuit(): void {
    this.game.ui.choice('Quit the job? Your standing with this employer will suffer.', [
      { label: 'Quit', enabled: true, run: () => this.fail('You quit the job.') },
      { label: 'Keep at it', enabled: true, run: () => {} },
    ]);
  }

  /** Finish the active job and pay it. `units` overrides the offer's units (cattle penned, orders served). */
  complete(perf: number, units?: number): number {
    const g = this.game;
    const a = this.active;
    if (!a) return 0;
    const t = this.template(a.offer.templateId);
    const n = units ?? a.offer.units;
    const pay = jobPay(t, n, a.offer.tiles, this.payContext(t, a.offer.boardId, a.offer.demand, perf));
    g.player.money = Math.round((g.player.money + pay) * 100) / 100;
    const J = BALANCE.jobs;
    this.standing[a.offer.boardId] = Math.min(J.standingMax, (this.standing[a.offer.boardId] ?? 0) + J.standingGain);
    if (t.faction) g.rep.add(t.faction, 1);
    if (t.skill && t.xp) g.player.skills.gain(t.skill, t.xp);
    this.stats.done++;
    this.stats.earned = Math.round((this.stats.earned + pay) * 100) / 100;
    g.setFlag('jobs_done', this.stats.done);
    g.notify(`${t.title}: done. Paid $${pay.toFixed(2)}.`, 'good');
    g.audio.play('coin');
    this.cleanup();
    return pay;
  }

  /** End the active job unpaid. */
  fail(reason: string): void {
    const g = this.game;
    const a = this.active;
    if (!a) return;
    const t = this.template(a.offer.templateId);
    const J = BALANCE.jobs;
    this.standing[a.offer.boardId] = Math.max(J.standingMin, (this.standing[a.offer.boardId] ?? 0) - J.standingLoss);
    if (t.faction) g.rep.add(t.faction, -1);
    if (t.deliver) g.player.inv.remove(t.deliver.cargo, Math.min(t.deliver.qty, g.player.inv.count(t.deliver.cargo)));
    this.stats.failed++;
    g.notify(`${t.title}: ${reason}`, 'bad');
    this.cleanup();
  }

  private cleanup(): void {
    const g = this.game;
    for (const c of this.cattle) c.dead = true;
    this.cattle = [];
    this.pennedSet.clear();
    for (const b of this.bandits) if (Math.hypot(b.x - g.player.x, b.y - g.player.y) > 900) b.dead = true;
    this.bandits = [];
    const a = this.active;
    if (a?.tasks?.length && this.template(a.offer.templateId).chores?.consumes) {
      const item = this.template(a.offer.templateId).chores!.consumes!;
      const left = a.tasks.filter((x) => !x.done).length;
      if (left) g.player.inv.remove(item, Math.min(left, g.player.inv.count(item)));
    }
    this.active = null;
    g.raceMarkers = g.activities.busy ? g.raceMarkers : [];
    if (this.ownWaypoint && g.waypoint === this.ownWaypoint) g.waypoint = null;
    this.ownWaypoint = null;
    this.endStrike();
  }

  private setWaypoint(p: { x: number; y: number } | null): void {
    if (!p) return;
    this.ownWaypoint = { x: p.x, y: p.y };
    this.game.waypoint = this.ownWaypoint;
  }

  // --- Per-frame ----------------------------------------------------------------------------

  update(dt: number): void {
    const g = this.game;
    if (this.strike) this.updateStrike(dt);
    const a = this.active;
    if (!a) return;
    const t = this.template(a.offer.templateId);
    const now = g.clock.minutes;
    switch (t.kind) {
      case 'deliver': {
        const late = now - a.deadline;
        if (late > BALANCE.jobs.lateCutoffHours * 60) {
          this.fail('Too late. The consignee hired another rider.');
          return;
        }
        if (a.ambushAt !== undefined && !a.ambushed) {
          const dest = this.boardPx(a.offer.destId!);
          const from = this.boardPx(a.offer.boardId);
          if (dest && from) {
            const total = Math.hypot(dest.x - from.x, dest.y - from.y);
            const prog = 1 - Math.hypot(dest.x - g.player.x, dest.y - g.player.y) / Math.max(1, total);
            if (prog >= a.ambushAt && !g.law.inTown(g.player.x, g.player.y)) {
              a.ambushed = true;
              this.spawnBandits(t);
            }
          }
        }
        break;
      }
      case 'gather':
      case 'bounty':
        if (now > a.deadline) this.fail(t.kind === 'bounty' ? 'The trail went cold.' : 'The deadline passed.');
        else if (t.kind === 'bounty') this.updateBounty(a, t);
        break;
      case 'cattle':
        this.updateCattle(a, dt);
        break;
      case 'chores':
        if (now > a.deadline) {
          this.fail('You ran out of daylight.');
          return;
        }
        if (!g.activities.busy) g.raceMarkers = (a.tasks ?? []).filter((x) => !x.done).map((x) => ({ x: x.x, y: x.y }));
        break;
      case 'breakHorse':
        if (Number(g.flags.ranchwork_done ?? 0) > (a.breaksBefore ?? 0)) this.complete(1);
        else if (!g.taming.breaking) this.fail('The colt won this round.');
        break;
    }
  }

  // --- Strike mini-game ---------------------------------------------------------------------

  /** Start the strike mini-game: press interact as the gauge tops out, `need` times. */
  startStrike(label: string, need: number, onDone: (hits: number, misses: number) => void): void {
    const g = this.game;
    if (g.player.mount) {
      g.notify('Get down off your horse first.', 'info');
      return;
    }
    this.strike = { label, need, hits: 0, misses: 0, t: 0, cooldown: 0.2, onDone };
    g.player.holstered = true;
  }

  private updateStrike(dt: number): void {
    const g = this.game;
    const s = this.strike!;
    s.t += dt;
    s.cooldown -= dt;
    if (Math.hypot(g.player.vx, g.player.vy) > 10) {
      g.notify('You stop working.', 'info');
      this.endStrike();
      return;
    }
    const gauge = strikeGauge(s.t);
    if (g.input.pressed('interact') && s.cooldown <= 0) {
      s.cooldown = 0.18;
      g.player.act(0.35);
      if (gauge >= BALANCE.jobs.strikeSweet) {
        s.hits++;
        g.audio.play('hit');
      } else {
        s.misses++;
        g.audio.play('dryfire');
      }
    }
    g.ui.setWork({ label: `${s.label} — hit E (or tap) in the gold zone`, gauge, zoneFrom: BALANCE.jobs.strikeSweet, progress: s.hits / s.need, hits: s.hits, need: s.need });
    if (s.hits >= s.need || s.misses >= s.need + BALANCE.jobs.strikeMissAllowance) {
      const { hits, misses, onDone } = s;
      this.endStrike();
      onDone(hits, misses);
    }
  }

  private endStrike(): void {
    if (!this.strike) return;
    this.strike = null;
    this.strikeEndedAt = this.game.time;
    this.game.ui.setWork(null);
  }

  // --- World prompts (called from interactions.worldTarget) ---------------------------------

  /** Actions offered at the player's feet: boards, deliveries, chores, labour, homesteads. */
  worldTarget(): { title: string; actions: Action[] } | null {
    const g = this.game;
    const p = g.player;
    if (this.strike) return null;
    const acts: Action[] = [];
    let title = '';
    const a = this.active;
    // Notice boards.
    for (const b of JOB_BOARDS) {
      const pos = this.boardPx(b.settlementId);
      if (!pos || Math.abs(pos.x - p.x) > 40 || Math.abs(pos.y - p.y) > 40 || Math.hypot(pos.x - p.x, pos.y - p.y) > 34) continue;
      title = b.name;
      const ti = this.turnInAction(b.settlementId);
      if (ti) acts.push(ti);
      acts.push({ label: 'Read the notice board', run: () => this.openBoard(b.settlementId) });
    }
    // Chore flags.
    if (a?.tasks) {
      const t = this.template(a.offer.templateId);
      const task = a.tasks.find((x) => !x.done && Math.hypot(x.x - p.x, x.y - p.y) < 30);
      if (task) {
        title = title || t.title;
        const c = t.chores!;
        acts.push({
          label: c.label,
          enabled: !c.consumes || p.inv.has(c.consumes),
          hint: c.consumes ? `You need ${getItem(c.consumes).name}.` : undefined,
          run: () => this.startStrike(c.label, c.strikes, (h, m) => {
            if (c.consumes) p.inv.remove(c.consumes);
            task.done = true;
            a.hits = (a.hits ?? 0) + h;
            a.misses = (a.misses ?? 0) + m;
            g.advanceTime(BALANCE.jobs.taskMinutes[c.task] ?? 10);
            const left = a.tasks!.filter((x) => !x.done).length;
            if (left) g.notify(`${c.label}: done. ${left} to go.`, 'info');
            else this.complete(strikePerformance(a.hits, a.misses));
          }),
        });
      }
    }
    // Self-directed labour.
    for (const [id, w] of Object.entries(WORK_ACTIONS)) {
      const objs = w.objs.map((n) => O[n as keyof typeof O] as number);
      const at = g.interactions.nearObj(p.x, p.y, objs, 1);
      if (!at) continue;
      if (w.needsJob && a?.offer.templateId !== w.needsJob) continue;
      if (id === 'chop' && !p.inv.has('axe')) continue;
      title = title || w.label;
      const key = `${g.clock.day}:${id}:${at.x},${at.y}`;
      const left = w.perTilePerDay - (this.worked[key] ?? 0);
      acts.push({
        label: left > 0 ? w.label : `${w.label} (worked out today)`,
        enabled: left > 0 && (!w.tool || p.inv.has(w.tool)),
        hint: left > 0 ? `You need a ${getItem(w.tool ?? 'pickaxe').name.toLowerCase()}.` : 'Come back tomorrow.',
        run: () => this.startStrike(w.label, w.strikes, (h, m) => this.finishWork(w, key, h, m)),
      });
    }
    // Homesteads.
    for (const plot of PLOTS) {
      const pos = this.plotPx(plot);
      if (Math.hypot(pos.x - p.x, pos.y - p.y) > 48) continue;
      title = title || plot.name;
      acts.push(...this.plotActions(plot));
    }
    return acts.length ? { title, actions: acts } : null;
  }

  private finishWork(w: WorkActionDef, key: string, hits: number, misses: number): void {
    const g = this.game;
    g.advanceTime(BALANCE.jobs.taskMinutes[w.task] ?? 15);
    const perf = strikePerformance(hits, misses);
    const left = w.perTilePerDay - (this.worked[key] ?? 0);
    const qty = Math.max(1, Math.min(left, Math.round(perf * w.yieldPerPerf)));
    this.worked[key] = (this.worked[key] ?? 0) + qty;
    g.giveItem(w.item, qty);
    g.player.skills.gain(w.skill, w.xp);
  }

  /** Turn-in action available at a board for the active job, if any. */
  turnInAction(sid: string): Action | null {
    const g = this.game;
    const a = this.active;
    if (!a) return null;
    const t = this.template(a.offer.templateId);
    if (t.kind === 'deliver' && a.offer.destId === sid) {
      const d = t.deliver!;
      const have = g.player.inv.count(d.cargo);
      return {
        label: `Deliver ${d.qty} × ${getItem(d.cargo).name}`,
        enabled: have >= d.qty,
        hint: `The waybill says ${d.qty}; you carry ${have}.`,
        run: () => {
          g.player.inv.remove(d.cargo, d.qty);
          this.complete(deliveryPerformance(g.clock.minutes - a.startedAt, a.deadline - a.startedAt));
        },
      };
    }
    if (t.kind === 'gather' && a.offer.boardId === sid) {
      const have = g.player.inv.count(a.offer.item!);
      return {
        label: `Hand over ${a.offer.units} × ${getItem(a.offer.item!).name} (${Math.min(have, a.offer.units)}/${a.offer.units})`,
        enabled: have >= a.offer.units,
        hint: 'Bring the full count — saddlebags don\'t count until you take them out.',
        run: () => {
          g.player.inv.remove(a.offer.item!, a.offer.units);
          this.complete(1);
        },
      };
    }
    if (t.kind === 'bounty' && a.outlawDead && a.offer.boardId === sid) {
      return { label: 'Claim the bounty (dead)', run: () => this.complete(BALANCE.jobs.bountyDeadMul) };
    }
    return null;
  }

  /** "Ask for work" on a townsperson whose trade matches jobs on their settlement's board. */
  npcAction(n: Npc): Action | null {
    const list = OCCUPATION_WORK[n.occupation];
    if (!list) return null;
    const b = JOB_BOARDS.find((x) => x.settlementId === n.settlementId);
    if (!b || !b.templates.some((id) => list.includes(id))) return null;
    return { label: 'Ask for work', run: () => this.openBoard(b.settlementId, list, n.name) };
  }

  // --- Cattle -------------------------------------------------------------------------------

  private spawnCattle(a: ActiveJob, count: number): void {
    const g = this.game;
    const t = this.template(a.offer.templateId);
    const corral = this.corralOf(a.offer.boardId);
    if (!corral) return;
    const W = g.world;
    const ang = this.rng.range(0, Math.PI * 2);
    const r = (t.cattle?.spawnTiles ?? 24) * 16;
    const free = W.findNear(Math.floor((corral.gx + Math.cos(ang) * r) / 16), Math.floor((corral.gy + Math.sin(ang) * r) / 16), 10,
      (x, y) => !W.blockedPx(x * 16 + 8, y * 16 + 10) && !W.terrainAt(x * 16 + 8, y * 16 + 8).water && !W.buildingAtPx(x * 16 + 8, y * 16 + 8));
    const cx = free ? free.x * 16 + 8 : corral.gx + Math.cos(ang) * r;
    const cy = free ? free.y * 16 + 8 : corral.gy + Math.sin(ang) * r;
    for (let i = 0; i < count; i++) {
      const s = new Animal('cattle', cx + this.rng.range(-28, 28), cy + this.rng.range(-28, 28), this.rng.int(1, 1e9));
      if (W.blockedPx(s.x, s.y)) {
        s.x = cx;
        s.y = cy;
      }
      g.addEntity(s);
      this.cattle.push(s);
    }
    this.setWaypoint({ x: cx, y: cy });
  }

  private updateCattle(a: ActiveJob, dt: number): void {
    const g = this.game;
    const corral = this.corralOf(a.offer.boardId);
    if (!corral) return;
    // After a reload the steers are gone: turn the rest loose again.
    const remaining = a.offer.units - (a.penned ?? 0) - (a.lost ?? 0);
    if (!this.cattle.length && remaining > 0) this.spawnCattle(a, remaining);
    const J = BALANCE.jobs;
    for (const s of this.cattle) {
      if (this.pennedSet.has(s)) {
        // Penned steers stay in the corral.
        s.x = Math.max(corral.x, Math.min(corral.x + corral.w, s.x));
        s.y = Math.max(corral.y, Math.min(corral.y + corral.h, s.y));
        s.homeX = corral.x + corral.w / 2;
        s.homeY = corral.y + corral.h / 2;
        continue;
      }
      if (s.dead || s.state === 'dead') {
        if (!(s as Animal & { jobLost?: boolean }).jobLost) {
          (s as Animal & { jobLost?: boolean }).jobLost = true;
          a.lost = (a.lost ?? 0) + 1;
        }
        continue;
      }
      if (Math.hypot(s.x - corral.gx, s.y - corral.gy) < J.penRadius) {
        this.pennedSet.add(s);
        a.penned = (a.penned ?? 0) + 1;
        s.x = corral.x + this.rng.range(0, corral.w);
        s.y = corral.y + this.rng.range(0, corral.h);
        s.state = 'graze';
        s.speed = 0;
        g.notify(`Steer penned (${a.penned}/${a.offer.units}).`, 'good');
        continue;
      }
      // Herding: a pushed steer drifts toward the gate it knows.
      if (s.state === 'flee') {
        const want = Math.atan2(corral.gy - s.y, corral.gx - s.x);
        let d = want - s.heading;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        s.heading += d * Math.min(1, J.herdPull * 4 * dt);
      } else {
        s.homeX = s.x;
        s.homeY = s.y;
      }
    }
    const lead = this.cattle.find((s) => !this.pennedSet.has(s) && !s.dead && s.state !== 'dead');
    if (lead && this.ownWaypoint) {
      this.ownWaypoint.x = lead.x;
      this.ownWaypoint.y = lead.y;
    }
    const done = (a.penned ?? 0) + (a.lost ?? 0) >= a.offer.units;
    if (done || g.clock.minutes > a.deadline) {
      const penned = a.penned ?? 0;
      if (penned <= 0) this.fail(done ? 'Every steer was lost.' : 'The strays scattered for good.');
      else this.complete(penned / a.offer.units + (done && !a.lost ? 0.1 : 0), penned);
    }
  }

  // --- Bounties & road agents -----------------------------------------------------------------

  private updateBounty(a: ActiveJob, t: JobTemplate): void {
    const g = this.game;
    if (!a.outlawId) return;
    if (g.flags[`captured_${a.outlawId}`]) {
      this.complete(1);
      return;
    }
    if (a.outlawDead || g.entityById(a.outlawId)) return;
    const camp = BOUNTY_CAMPS.find((c) => c.id === a.offer.camp) ?? BOUNTY_CAMPS[0]!;
    const cx = camp.x * 16 + 8;
    const cy = camp.y * 16 + 8;
    if (Math.hypot(cx - g.player.x, cy - g.player.y) > BALANCE.jobs.bountySpawnRadius) return;
    const rng = new Rng(hashString(a.outlawId));
    const name = `${rng.pick(FIRST_NAMES_M)} ${rng.pick(SURNAMES)}`;
    for (let i = 0; i < a.offer.units; i++) {
      const id = i === 0 ? a.outlawId : `${a.outlawId}_g${i}`;
      if (g.npcMemory[id]?.dead) continue;
      const pos = this.freeNear(cx + rng.range(-50, 50), cy + rng.range(-50, 50));
      const def: NpcDef = {
        id,
        name: i === 0 ? `${name}, ${t.bounty!.title}` : `${name.split(' ')[1]}'s Gunhand`,
        occupation: 'outlaw',
        settlement: `jobcamp_${camp.id}`,
        look: { coat: '#3a2a20', hat: 'cowboy', hatColor: '#2a1e16', bandana: '#5a1e18', gunbelt: true },
        personality: ['gruff'],
        bio: '',
        combat: { health: i === 0 ? 90 : 75, weapon: i === 0 ? 'revolverCattleman' : rng.pick(['revolverCattleman', 'repeaterLancaster']), accuracy: 0.45, courage: i === 0 ? 0.55 : 0.75 },
        fixed: { x: Math.floor(pos.x / 16), y: Math.floor(pos.y / 16) },
      };
      const n = new Npc(def, g);
      n.x = pos.x;
      n.y = pos.y;
      n.tag = 'job_bounty';
      // Wanted men: shooting one first is not murder.
      n.hostile = true;
      n.setState('guard');
      g.addEntity(n);
    }
  }

  private spawnBandits(t: JobTemplate): void {
    const g = this.game;
    const d = t.deliver!;
    const n = this.rng.int(d.bandits?.[0] ?? 2, d.bandits?.[1] ?? 3);
    const at = g.spawner.findSpawnPoint(220, 340) ?? { x: g.player.x + 260, y: g.player.y };
    for (let i = 0; i < n; i++) {
      const pos = this.freeNear(at.x + i * 20, at.y + (i % 2) * 16);
      const def: NpcDef = {
        id: `roadagent_${Math.floor(g.time)}_${i}`,
        name: 'Road Agent',
        occupation: 'outlaw',
        settlement: 'none',
        look: { coat: '#2e2a26', hat: 'cowboy', hatColor: '#1a1612', bandana: '#7a2a20' },
        personality: ['gruff'],
        bio: '',
        combat: { health: 80, weapon: i % 2 ? 'repeaterLancaster' : 'revolverCattleman', accuracy: 0.45, courage: 0.7 },
      };
      const npc = new Npc(def, g);
      npc.x = pos.x;
      npc.y = pos.y;
      npc.hostile = true;
      npc.tag = 'road_agent';
      npc.setState('combat');
      g.addEntity(npc);
      this.bandits.push(npc);
    }
    g.notify('Road agents! They want the strongbox.', 'law');
    g.audio.play('bell');
  }

  private freeNear(x: number, y: number): { x: number; y: number } {
    const W = this.game.world;
    const f = W.findNear(Math.floor(x / 16), Math.floor(y / 16), 6, (tx, ty) => !W.blockedPx(tx * 16 + 8, ty * 16 + 10) && !W.terrainAt(tx * 16 + 8, ty * 16 + 8).water);
    return f ? { x: f.x * 16 + 8, y: f.y * 16 + 10 } : { x, y };
  }

  // --- Saloon shift -------------------------------------------------------------------------

  private runBarShift(orders: number): void {
    const g = this.game;
    const rng = new Rng(hashString(`${this.active!.offer.id}:bar`));
    let served = 0;
    let wrong = 0;
    const finish = (): void => {
      if (!this.active) return;
      if (served <= 0) this.fail('You walked out on the shift.');
      else this.complete(strikePerformance(served, wrong), served);
    };
    const next = (i: number): void => {
      if (i >= orders) return finish();
      const o = rng.pick(BAR_ORDERS);
      const pours = [...BAR_POURS].sort(() => rng.next() - 0.5);
      g.ui.choice(`Order ${i + 1} of ${orders}. ${o.ask}`, [
        ...pours.map((p) => ({
          label: p,
          enabled: true,
          run: () => {
            g.advanceTime(BALANCE.jobs.taskMinutes.pour ?? 20);
            if (p === o.answer) {
              served++;
              g.audio.play('coin');
            } else {
              wrong++;
              g.notify(`Wrong pour. They wanted ${o.answer.toLowerCase()}.`, 'bad');
            }
            next(i + 1);
          },
        })),
        { label: 'End the shift early', enabled: true, run: finish },
      ], finish);
    };
    g.notify('You tie on an apron behind the bar.', 'info');
    next(0);
  }

  // --- Homesteads ---------------------------------------------------------------------------

  /** Plot stake position in px (nearest open tile to the data position). */
  plotPx(plot: PlotDef): { x: number; y: number } {
    let p = this.plotPos.get(plot.id);
    if (!p) {
      const W = this.game.world;
      const f = W.findNear(plot.x, plot.y, 8, (x, y) => !W.blockedPx(x * 16 + 8, y * 16 + 10) && !W.terrainAt(x * 16 + 8, y * 16 + 8).water && !W.buildingAtPx(x * 16 + 8, y * 16 + 8));
      p = f ? { x: f.x * 16 + 8, y: f.y * 16 + 8 } : { x: plot.x * 16 + 8, y: plot.y * 16 + 8 };
      this.plotPos.set(plot.id, p);
    }
    return p;
  }

  private plotActions(plot: PlotDef): Action[] {
    const g = this.game;
    const e = g.economy;
    const own = e.property[plot.id];
    const office = SETTLEMENTS.find((s) => s.id === plot.soldAt)?.name ?? 'town';
    if (!own) return [{ label: `For sale: $${plot.price} at the ${office} land office`, enabled: false, hint: plot.description, run: () => {} }];
    const acts: Action[] = [];
    const ready = Object.entries(own.stock).filter(([, q]) => q >= 1);
    acts.push({
      label: ready.length ? `Collect produce (${ready.map(([i, q]) => `${Math.floor(q)} ${getItem(i).name}`).join(', ')})` : 'Nothing to collect yet',
      enabled: ready.length > 0,
      hint: own.arrears > 0 ? 'Produce stops when taxes go unpaid.' : 'Build a garden, coop or pasture.',
      run: () => { e.collectProduce(plot.id); },
    });
    acts.push({ label: 'Build improvements', run: () => this.openBuild(plot) });
    if (own.upgrades.includes('cabin')) acts.push({ label: 'Sleep in your cabin', run: () => g.ui.openSleep('bed') });
    if (own.upgrades.includes('well')) acts.push({ label: 'Draw water', run: () => { g.player.stats.thirst = 100; g.player.inv.add('canteenWater', 3); for (const h of g.ownedHorses()) if (Math.hypot(h.x - g.player.x, h.y - g.player.y) < 200) h.data.thirst = 100; g.notify('Cold well water for you and your horses.', 'info'); } });
    if (own.upgrades.includes('stable')) {
      const used = own.stableDay === g.clock.day;
      acts.push({
        label: used ? 'Rest horses (done today)' : 'Rest & feed horses in the lean-to',
        enabled: !used,
        hint: 'Once a day.',
        run: () => {
          own.stableDay = g.clock.day;
          for (const h of g.ownedHorses()) {
            if (Math.hypot(h.x - g.player.x, h.y - g.player.y) > 200) continue;
            h.data.hunger = 100;
            h.data.thirst = 100;
            h.data.energy = 100;
          }
          g.notify('Your horses are fed, watered and rested.', 'horse');
        },
      });
    }
    return acts;
  }

  private openBuild(plot: PlotDef): void {
    const g = this.game;
    const e = g.economy;
    const own = e.property[plot.id]!;
    const opts = e.availableUpgrades(plot.id).map((u) => ({
      label: `${u.name} — $${u.price}`,
      enabled: g.player.money >= u.price && own.arrears <= 0,
      run: () => {
        const err = e.buyUpgrade(plot.id, u.id);
        g.notify(err ?? `${u.name} built. ${u.description}`, err ? 'bad' : 'good');
      },
    }));
    const built = own.upgrades.map((id) => UPGRADES.find((u) => u.id === id)?.name).filter(Boolean).join(', ');
    g.ui.choice(`${plot.name}. Built: ${built || 'nothing yet'}.${own.arrears > 0 ? ` Taxes owed: $${own.arrears.toFixed(2)}.` : ''}`, [...opts, { label: 'Leave', enabled: true, run: () => {} }]);
  }

  /** Land office menu: buy deeds and settle taxes. */
  openLandOffice(sid: string): void {
    const g = this.game;
    const e = g.economy;
    const opts: { label: string; enabled: boolean; run: () => void }[] = [];
    const owed = e.arrears();
    if (owed > 0) opts.push({ label: `Settle taxes ($${owed.toFixed(2)})`, enabled: g.player.money > 0, run: () => g.notify(`Paid $${e.settleTaxes().toFixed(2)} in taxes.`, 'info') });
    for (const plot of PLOTS.filter((p) => p.soldAt === sid)) {
      const owned = !!e.property[plot.id];
      opts.push({
        label: owned ? `${plot.name} (yours)` : `${plot.name} — $${plot.price}, tax $${plot.taxPerDay.toFixed(2)}/day`,
        enabled: !owned && g.player.money >= plot.price,
        run: () => {
          const err = e.buyPlot(plot.id);
          if (err) return g.notify(err, 'bad');
          g.notify(`The deed to ${plot.name} is yours. Ride out and build on it.`, 'good');
          this.setWaypoint(this.plotPx(plot));
        },
      });
    }
    opts.push({ label: 'Leave', enabled: true, run: () => {} });
    g.ui.choice('Territorial land office. Deeds are sold as-is; improvements are yours to build. Tax falls due every morning.', opts);
  }

  // --- Helpers ------------------------------------------------------------------------------

  /** Pick `n` spots spread apart (greedy farthest-point from a random start). */
  private pickSpread(spots: { x: number; y: number }[], n: number): { x: number; y: number }[] {
    if (spots.length <= n) return [...spots];
    const out = [spots[this.rng.int(0, spots.length - 1)]!];
    while (out.length < n) {
      let best = spots[0]!;
      let bestD = -1;
      for (const s of spots) {
        const d = Math.min(...out.map((o) => tileDistance(o, s)));
        if (d > bestD) {
          bestD = d;
          best = s;
        }
      }
      out.push(best);
    }
    return out;
  }

  /** Daily housekeeping: forget yesterday's taken offers and worked tiles. */
  daily(): void {
    const day = this.game.clock.day;
    for (const [k, d] of Object.entries(this.taken)) if (d < day - 1) delete this.taken[k];
    for (const k of Object.keys(this.worked)) if (!k.startsWith(`${day}:`)) delete this.worked[k];
  }

  serialize(): JobsSave {
    return { active: this.active, taken: this.taken, standing: this.standing, worked: this.worked, stats: this.stats };
  }

  load(d: JobsSave): void {
    this.active = d.active ?? null;
    this.taken = d.taken ?? {};
    this.standing = d.standing ?? {};
    this.worked = d.worked ?? {};
    this.stats = { done: 0, failed: 0, earned: 0, ...(d.stats ?? {}) };
    this.cattle = [];
    this.pennedSet.clear();
    if (this.active) {
      const t = this.template(this.active.offer.templateId);
      // The colt and the bar shift don't survive a reload; neither does a half-finished strike.
      if (!t || t.kind === 'breakHorse' || t.kind === 'bartend') this.active = null;
      const a = this.active;
      if (a?.offer.destId) this.setWaypoint(this.boardPx(a.offer.destId));
      else if (a?.outlawDead) this.setWaypoint(this.boardPx(a.offer.boardId));
      else if (a?.offer.camp) {
        const c = BOUNTY_CAMPS.find((x) => x.id === a.offer.camp);
        if (c) this.setWaypoint({ x: c.x * 16 + 8, y: c.y * 16 + 8 });
      }
    }
  }

  /** Detach event listeners (tests, new game). */
  dispose(): void {
    this.unsub?.();
  }
}
