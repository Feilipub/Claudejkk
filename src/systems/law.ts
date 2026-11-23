/**
 * Law and crime. Crimes only become "known" through witnesses who can see
 * the act and survive long enough to report it (lawmen who witness report
 * instantly). Wanted status and bounties are per region; response strength
 * scales with the region's law presence. Arrest offers pay / bribe / jail.
 */
import { BALANCE } from '../data/balance.ts';
import { REGIONS, SETTLEMENTS } from '../data/world.ts';
import type { CrimeKind } from '../core/events.ts';
import type { Npc } from '../entities/npc.ts';
import type { Game } from '../game.ts';

export interface WantedState {
  bounty: number;
  /** 0 none, 1 suspicious, 2 wanted, 3 dead-or-alive. */
  level: number;
  crimes: string[];
  /** Game day of last crime, for decay. */
  lastDay: number;
}

const CRIME_NAMES: Record<CrimeKind, string> = {
  murder: 'Murder',
  assault: 'Assault',
  theft: 'Theft',
  horseTheft: 'Horse theft',
  robbery: 'Robbery',
  trespass: 'Trespassing',
  discharge: 'Discharging a firearm in town',
  jailbreak: 'Jailbreak',
  animalCruelty: 'Cruelty to livestock',
};

const HONOR_COST: Record<CrimeKind, number> = {
  murder: 12, assault: 3, theft: 3, horseTheft: 6, robbery: 6, trespass: 0, discharge: 0, jailbreak: 2, animalCruelty: 3,
};

export class LawSystem {
  game: Game;
  wanted: Record<string, WantedState> = {};
  /** Lawmen spawned to hunt the player. */
  private incidentSeq = 0;
  private countedIncidents = new Set<number>();
  posseCooldown = 0;
  constructor(game: Game) {
    this.game = game;
  }

  get(region: string): WantedState {
    return (this.wanted[region] ??= { bounty: 0, level: 0, crimes: [], lastDay: 0 });
  }
  isWanted(region: string): boolean {
    return this.get(region).level >= 2;
  }
  totalBounty(): number {
    return Object.values(this.wanted).reduce((s, w) => s + w.bounty, 0);
  }

  /** True if (x,y) is inside a settlement where firing a gun is a crime. */
  inTown(x: number, y: number): boolean {
    return SETTLEMENTS.some((s) => (s.kind === 'town' || s.kind === 'city' || s.kind === 'station' || s.kind === 'fort') && Math.hypot(s.x * 16 - x, s.y * 16 - y) < 30 * 16);
  }

  /** A crime happened. Witnesses decide whether the law ever hears of it. */
  reportCrime(kind: CrimeKind, x: number, y: number, victimId?: string): void {
    const g = this.game;
    if (kind === 'discharge' && !this.inTown(x, y)) return;
    g.rep.add('honor', -HONOR_COST[kind]);
    if (kind === 'murder' || kind === 'robbery' || kind === 'horseTheft') g.rep.add('notoriety', 4);
    const region = g.world.regionAtPx(x, y);
    const law = REGIONS.find((r) => r.id === region)?.law ?? 0.5;
    let witnessed = false;
    const incident = ++this.incidentSeq;
    for (const e of g.spatial.query(x, y, BALANCE.law.witnessRadius, 'npc')) {
      const n = e as Npc;
      if (!n.alive || n.hostile || n.id === victimId || n.state === 'hogtied') continue;
      if (!g.world.lineOfSight(n.x, n.y - 8, x, y - 8)) continue;
      witnessed = true;
      if (n.occupation === 'sheriff' || n.occupation === 'deputy' || n.occupation === 'soldier') {
        this.addCrime(region, kind, incident);
        n.setState('pursue');
        continue;
      }
      if (n.occupation === 'outlaw') continue;
      n.setState(n.rng.chance(0.5) ? 'flee' : 'cower');
      n.say(kind === 'murder' ? 'Murder! Somebody fetch the sheriff!' : kind === 'discharge' ? 'Who\'s shootin\'?!' : 'Thief! Stop!', 3);
      if (!n.witnessCrime) {
        n.witnessCrime = kind;
        n.witnessIncident = incident;
        n.witnessT = BALANCE.law.reportTimeSec * (1.6 - law);
      }
    }
    if (witnessed && kind !== 'discharge') g.notify(`Witnessed: ${CRIME_NAMES[kind]}. Silence the witness or ride.`, 'law');
  }

  /** A civilian witness made it to the law. */
  witnessReported(n: Npc, kind: string): void {
    const region = this.game.world.regionAtPx(n.x, n.y);
    this.addCrime(region, kind as CrimeKind, n.witnessIncident);
  }

  /** Record a crime. Several witnesses to one incident count it once. */
  addCrime(region: string, kind: CrimeKind, incident = 0): void {
    const g = this.game;
    if (incident) {
      if (this.countedIncidents.has(incident)) return;
      this.countedIncidents.add(incident);
    }
    const w = this.get(region);
    const was = w.level;
    w.bounty += BALANCE.law.bounty[kind] ?? 2;
    w.crimes.push(CRIME_NAMES[kind]);
    w.lastDay = g.clock.day;
    w.level = w.bounty >= 50 ? 3 : w.bounty >= 3 ? 2 : 1;
    if (w.level >= 2 && was < 2) g.notify(`You are WANTED in ${REGIONS.find((r) => r.id === region)?.name}. Bounty: ${w.bounty.toFixed(0)} dollars.`, 'law');
    else if (w.level >= 2) g.notify(`Bounty raised to ${w.bounty.toFixed(0)} dollars.`, 'law');
    // Lawmen in the area are alerted.
    for (const e of g.spatial.query(g.player.x, g.player.y, 500, 'npc')) {
      const l = e as Npc;
      if ((l.occupation === 'sheriff' || l.occupation === 'deputy') && l.alive && l.state === 'schedule') {
        if (w.level >= 3) {
          l.hostile = true;
          l.setState('combat');
        } else l.setState('pursue');
      }
    }
  }

  update(dt: number): void {
    const g = this.game;
    this.posseCooldown -= dt;
    const region = g.currentRegion;
    const w = this.get(region);
    // Bounty hunters ride out after notorious players in the wilds.
    if (w.level >= 2 && w.bounty >= BALANCE.law.hunterThreshold && this.posseCooldown <= 0 && !this.inTown(g.player.x, g.player.y)) {
      this.posseCooldown = 240;
      g.encounters.spawnBountyHunters(Math.min(4, 1 + Math.floor(w.bounty / 40)));
    }
    // Old, minor crimes are slowly forgotten (not murders).
    for (const st of Object.values(this.wanted)) {
      if (st.level === 1 && g.clock.day - st.lastDay > 1) {
        st.level = 0;
        st.bounty = 0;
        st.crimes = [];
      }
    }
  }

  /** Lawman caught a compliant player. */
  arrest(lawman: Npc): void {
    const g = this.game;
    const region = g.currentRegion;
    const w = this.get(region);
    lawman.setState('schedule');
    g.ui.choice(
      `${lawman.name}: "That'll be ${w.bounty.toFixed(0)} dollars, or you sit in a cell."`,
      [
        { label: `Pay the bounty (${w.bounty.toFixed(0)} dollars)`, enabled: g.player.money >= w.bounty, run: () => this.payBounty(region) },
        {
          label: `Offer a bribe (${(w.bounty * 0.6 + 5).toFixed(0)} dollars)`,
          enabled: g.player.money >= w.bounty * 0.6 + 5 && w.level < 3,
          run: () => {
            const honest = lawman.personality.includes('honest') || lawman.personality.includes('stern') || lawman.occupation === 'sheriff';
            if (!honest && lawman.rng.chance(0.65)) {
              g.player.money -= w.bounty * 0.6 + 5;
              this.clear(region);
              g.rep.add('honor', -4);
              g.notify(`${lawman.name} pockets the money and looks the other way.`, 'law');
            } else {
              g.notify(`${lawman.name}: "Bribing an officer? That's another charge."`, 'law');
              w.bounty += 10;
              this.jail(region);
            }
          },
        },
        { label: 'Go to jail', enabled: true, run: () => this.jail(region) },
      ],
      () => this.resistArrest(region, lawman),
    );
  }

  /** Walking away from an arrest is resisting it: the bounty rises and the law turns hostile. */
  resistArrest(region: string, lawman: Npc): void {
    const g = this.game;
    const w = this.get(region);
    w.bounty += 25;
    w.crimes.push('Resisting arrest');
    w.level = 3;
    g.notify(`${lawman.name}: "So that's how it is." Resisting arrest. Bounty ${w.bounty.toFixed(0)} dollars.`, 'law');
    for (const e of g.spatial.query(g.player.x, g.player.y, 600, 'npc')) {
      const l = e as Npc;
      if ((l.occupation === 'sheriff' || l.occupation === 'deputy') && l.alive) {
        l.hostile = true;
        l.setState('combat');
      }
    }
  }

  payBounty(region: string): void {
    const g = this.game;
    const w = this.get(region);
    g.player.money = Math.max(0, g.player.money - w.bounty);
    g.notify(`Bounty of ${w.bounty.toFixed(0)} dollars paid. You're a free citizen in ${REGIONS.find((r) => r.id === region)?.name}.`, 'law');
    this.clear(region);
  }

  jail(region: string): void {
    const g = this.game;
    const w = this.get(region);
    const days = Math.max(1, Math.ceil(w.bounty / 25));
    g.advanceTime(days * 1440);
    g.player.stats.hunger = 30;
    g.player.stats.thirst = 30;
    this.clear(region);
    const sheriff = g.world.buildings.find((b) => b.type === 'sheriff' && SETTLEMENTS.find((s) => s.id === b.settlementId)?.regionId === region) ?? g.world.buildings.find((b) => b.type === 'sheriff')!;
    g.teleportPlayer(sheriff.doorX * 16 + 8, (sheriff.doorY + 2) * 16);
    g.notify(`You served ${days} day${days > 1 ? 's' : ''} in a cell. Your horse was kept at the livery.`, 'law');
  }

  clear(region: string): void {
    this.wanted[region] = { bounty: 0, level: 0, crimes: [], lastDay: this.game.clock.day };
    for (const e of this.game.spatial.query(this.game.player.x, this.game.player.y, 800, 'npc')) {
      const n = e as Npc;
      if ((n.state === 'pursue' || (n.state === 'combat' && (n.occupation === 'sheriff' || n.occupation === 'deputy'))) && n.alive) {
        n.hostile = false;
        n.setState('schedule');
      }
    }
  }
}
