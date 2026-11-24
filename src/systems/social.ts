/**
 * Social life of townsfolk: NPC↔NPC conversations (pairs who meet on the
 * street, groups at a saloon table / porch / campfire), children's games,
 * reactions to the player (bumps, a galloping horse, reputation, regulars),
 * fright at gunfire, weather chatter, and a little town gossip memory fed by
 * world events (crimes witnessed, killings, shots fired).
 *
 * LOD: only NPCs within SOCIAL_TUNING.simRadius of the player take part, and
 * the scan runs every `tickSec` (not every frame). Conversation playback is a
 * handful of timers. Everything else in the world just follows schedules.
 */
import { firstNameOf, isSunday, REACT_LINES, relationBetween, SOCIAL_TUNING as T, TOPICS, WORK_TALK, ACTS, type Exchange, type SocialPerson } from '../data/social.ts';
import { SETTLEMENTS } from '../data/world.ts';
import { Npc } from '../entities/npc.ts';
import type { Game } from '../game.ts';

interface Line {
  who: Npc;
  text: string;
}

/** A conversation being played out line by line. */
export interface Convo {
  members: Npc[];
  lines: Line[];
  i: number;
  t: number;
  /** Topic id, for debugging and tests. */
  topic: string;
}

/** Something the town talks about. */
export interface Gossip {
  kind: 'crime' | 'killing' | 'gunfire';
  /** Game minutes when it happened. */
  at: number;
  settlement: string | null;
  crime?: string;
  victim?: string;
  byPlayer?: boolean;
}

const CRIME_TEXT: Record<string, string> = {
  murder: 'a killing',
  assault: 'a brawl',
  theft: 'thieving',
  horseTheft: 'horse thieving',
  robbery: 'a robbery',
  trespass: 'trespassing',
  discharge: 'gunplay',
  jailbreak: 'a jailbreak',
  animalCruelty: 'cruelty to a horse',
};

const NO_CHAT = new Set(['sleep', 'pray', 'preach', 'piano', 'play', 'stagger']);

function pickOf<T>(a: readonly T[]): T {
  return a[Math.floor(Math.random() * a.length)]!;
}

function person(n: Npc): SocialPerson {
  return { id: n.id, name: n.name, occupation: n.occupation, personality: n.personality, settlement: n.settlementId };
}

export class SocialSystem {
  game: Game;
  convos: Convo[] = [];
  gossip: Gossip[] = [];
  /** Game time (s) of the last gunshot heard near the player. */
  lastGunfire = -9999;
  /** Counters for QA and the debug overlay. */
  stats = { convos: 0, groups: 0, tags: 0, greets: 0, dodges: 0, bumps: 0, hides: 0 };
  private t = 0;
  private pairCd = new Map<string, number>();
  private wasRaining = false;
  private tagGames = new Map<string, { it: Npc; frozenUntil: number }>();
  private active: Npc[] = [];

  constructor(game: Game) {
    this.game = game;
    game.bus.on('npcKilled', (e) => {
      const n = game.entityById(e.npcId) as Npc | null;
      const def = game.content.NPCS.find((d) => d.id === e.npcId);
      const name = n?.name ?? def?.name;
      if (!name || e.hostile) return;
      this.addGossip({ kind: 'killing', at: game.clock.minutes, settlement: n?.settlementId ?? def?.settlement ?? null, victim: firstNameOf(name), byPlayer: e.byPlayer });
    });
    game.bus.on('purchase', (e) => this.onPurchase(e.shopId, e.itemId));
  }

  // --- Memory of the player ----------------------------------------------------------------

  private events(npcId: string): string[] {
    const m = (this.game.npcMemory[npcId] ??= { opinion: 0, events: [] });
    return m.events;
  }
  private remember(npcId: string, ev: string): boolean {
    const evs = this.events(npcId);
    if (evs.includes(ev)) return false;
    evs.push(ev);
    if (evs.length > 24) evs.splice(0, evs.length - 24);
    return true;
  }

  /** The player talked to this NPC today (dialogue calls this). */
  rememberVisit(npcId: string): void {
    this.remember(npcId, `v:${this.game.clock.day}`);
  }

  /** Distinct days the player has come to talk or trade. Regulars are greeted by name. */
  visitDays(npcId: string): number {
    const days = new Set<string>();
    for (const e of this.game.npcMemory[npcId]?.events ?? []) if (e.startsWith('v:') || e.startsWith('b:')) days.add(e.split(':')[1]!);
    return days.size;
  }

  /** Most recent item the player bought from this NPC, if any. */
  lastPurchase(npcId: string): string | null {
    const evs = this.game.npcMemory[npcId]?.events ?? [];
    for (let i = evs.length - 1; i >= 0; i--) if (evs[i]!.startsWith('b:')) return evs[i]!.split(':')[2] ?? null;
    return null;
  }

  private onPurchase(shopId: string, itemId: string): void {
    const g = this.game;
    const keeper = g.entities.find((e) => e instanceof Npc && e.def.shop === shopId && e.alive) as Npc | undefined;
    const id = keeper?.id ?? g.content.NPCS.find((d) => d.shop === shopId)?.id;
    if (!id) return;
    const day = g.clock.day;
    // A little goodwill for custom, once a day.
    if (!this.events(id).some((e) => e.startsWith(`b:${day}:`))) g.changeOpinion(id, 1);
    this.remember(id, `b:${day}:${itemId}`);
  }

  /** Is this NPC a regular's shopkeeper (3+ separate days of business)? */
  isRegular(npcId: string): boolean {
    return this.visitDays(npcId) >= 3;
  }

  // --- Gossip ---------------------------------------------------------------------------------

  /** Record a town event for conversations and barks (keeps the latest dozen). */
  addGossip(gs: Gossip): void {
    this.gossip.push(gs);
    if (this.gossip.length > 12) this.gossip.shift();
  }

  /** Recent gossip for a settlement (within two game days). */
  recentGossip(settlement: string): Gossip[] {
    const now = this.game.clock.minutes;
    return this.gossip.filter((x) => now - x.at < 2 * 1440 && (x.settlement === null || x.settlement === settlement));
  }

  // --- Danger -----------------------------------------------------------------------------------

  /** Registered in Game.noise: shots send civilians under a roof; townsfolk talk about it afterwards. */
  onNoise(x: number, y: number, radius: number, kind: string, source: string): void {
    if (kind !== 'gunshot') return;
    const g = this.game;
    const fresh = g.time - this.lastGunfire > 60;
    this.lastGunfire = g.time;
    if (fresh) {
      const s = SETTLEMENTS.find((st) => Math.hypot(st.x * 16 - x, st.y * 16 - y) < 40 * 16);
      this.addGossip({ kind: 'gunfire', at: g.clock.minutes, settlement: s?.id ?? null });
    }
    for (const e of g.spatial.query(x, y, radius, 'npc')) {
      const n = e as Npc;
      if (!n.alive || n.hostile || n.tag || n.combat || n.id === source) continue;
      if (n.state === 'cower') {
        n.hideFor = Math.max(n.hideFor, T.hideSec[0] + Math.random() * T.hideSec[1]);
        continue;
      }
      if (n.state !== 'schedule' || Math.hypot(n.x - x, n.y - y) > radius * 0.8) continue;
      n.chatWith = null;
      n.steer = null;
      n.hideFor = T.hideSec[0] + Math.random() * T.hideSec[1];
      n.setState('cower');
      this.stats.hides++;
      if (Math.random() < 0.4) n.say(pickOf(REACT_LINES.gunfire), 2.2);
    }
  }

  // --- Main tick --------------------------------------------------------------------------------

  /** Per frame: play conversations; every `tickSec`, run the social scan for NPCs near the player. */
  update(dt: number): void {
    const g = this.game;
    for (const c of this.convos) this.advance(c, dt);
    if (this.convos.some((c) => c.i < 0)) this.convos = this.convos.filter((c) => c.i >= 0);
    this.t -= dt;
    if (this.t > 0) return;
    this.t = T.tickSec;
    const p = g.player;
    const now = g.time;
    const near = g.spatial.query(p.x, p.y, T.simRadius, 'npc') as Npc[];
    const active = this.active;
    active.length = 0;
    for (const n of near) {
      if (!n.alive || n.hostile || n.tag) continue;
      // Witnessed crimes become town gossip.
      if (n.witnessCrime && !n.gossipNoted) {
        n.gossipNoted = true;
        this.addGossip({ kind: 'crime', at: g.clock.minutes, settlement: n.settlementId, crime: CRIME_TEXT[n.witnessCrime] ?? 'trouble' });
      }
      if (n.state === 'schedule' && !n.fixed) active.push(n);
    }
    this.weatherTalk(active);
    this.reactToPlayer(active);
    this.childrenPlay(active);
    if (this.convos.length < T.maxConvos) this.startPairs(active, now);
    if (this.convos.length < T.maxConvos) this.startGroup(active);
    if (this.pairCd.size > 200) for (const [k, v] of this.pairCd) if (v < now) this.pairCd.delete(k);
  }

  private weatherTalk(active: Npc[]): void {
    const raining = this.game.weather.current.rain >= T.rainShelter;
    if (raining && !this.wasRaining) {
      let k = 0;
      for (const n of active) if (n.outdoors && !n.chatWith && k++ < 3) n.say(pickOf(REACT_LINES.rain), 2.4);
    }
    this.wasRaining = raining;
  }

  private fill(s: string, a: Npc | null, b: Npc | null, extra: Record<string, string> = {}): string {
    const g = this.game;
    const town = a ? SETTLEMENTS.find((x) => x.id === a.settlementId)?.name ?? 'town' : 'town';
    let out = s
      .replaceAll('{a}', a ? firstNameOf(a.name) : 'friend')
      .replaceAll('{b}', b ? firstNameOf(b.name) : 'friend')
      .replaceAll('{player}', firstNameOf(g.player.name))
      .replaceAll('{town}', town)
      .replaceAll('{horse}', g.mainHorse()?.data.name ?? 'horse');
    for (const [k, v] of Object.entries(extra)) out = out.replaceAll(`{${k}}`, v);
    return out;
  }

  // --- Reactions to the player -----------------------------------------------------------------

  private seated(n: Npc): boolean {
    return n.arrived && ACTS[n.act].anim === 'sit';
  }

  private reactToPlayer(active: Npc[]): void {
    const g = this.game;
    const p = g.player;
    const mount = p.mount;
    const speed = mount ? Math.abs(mount.speed) : Math.hypot(p.vx, p.vy);
    for (const n of active) {
      const d = Math.hypot(n.x - p.x, n.y - p.y);
      if (d > T.greetRadius + 10) continue;
      if (mount && speed > T.horseDangerSpeed && d < T.horseDangerRadius && n.reactCd <= 0) {
        // Folk jump clear of a horse coming through at speed, and don't thank you for it.
        n.reactCd = 5;
        if (!this.seated(n)) n.dodge(p.x, p.y, 85, 0.6);
        n.say(pickOf(REACT_LINES.horseNear), 2.2);
        if (d < 18) g.changeOpinion(n.id, -1);
        this.stats.dodges++;
      } else if (!mount && d < T.bumpRadius && speed > 25 && n.reactCd <= 0 && n.act !== 'sleep') {
        n.reactCd = 1.6;
        n.bumps += 1;
        if (!this.seated(n)) n.dodge(p.x, p.y, 40, 0.35);
        const rude = n.personality.includes('gruff') || n.personality.includes('proud') || g.npcOpinion(n.id) < -10;
        const pool = n.bumps >= 3 ? REACT_LINES.bumpedAngry : rude ? REACT_LINES.bumpedRude : REACT_LINES.bumped;
        if (n.bumps >= 3) g.changeOpinion(n.id, -2);
        n.say(pickOf(pool), 2.2);
        n.faceTo(p.x, p.y);
        this.stats.bumps++;
      } else if (d < T.greetRadius && n.greetCd <= 0 && !n.bubble && !n.chatWith && n.act !== 'sleep' && n.occupation !== 'outlaw' && (!mount || speed < 40)) {
        n.greetCd = T.greetCooldown * (0.7 + Math.random() * 0.6);
        const line = this.acknowledge(n);
        if (line) {
          n.say(line, 2.6);
          n.faceTo(p.x, p.y);
          n.barkCd = Math.max(n.barkCd, 15);
          g.lastBarkAt = g.time;
          this.stats.greets++;
        }
      }
    }
  }

  /** How an NPC acknowledges the passing player: by reputation, opinion and memory. */
  private acknowledge(n: Npc): string | null {
    const g = this.game;
    const p = g.player;
    const wanted = g.law.isWanted(g.currentRegion);
    const lawman = n.occupation === 'sheriff' || n.occupation === 'deputy' || n.occupation === 'soldier';
    if (lawman && wanted) return null; // the law has other plans
    const notor = g.rep.get('notoriety');
    const honor = g.rep.get('honor');
    const op = g.npcOpinion(n.id);
    const met = !!g.flags[`met_${n.id}`];
    if (!lawman && (wanted || notor > 50)) {
      if (!this.seated(n)) n.dodge(p.x, p.y, 35, 0.8);
      return pickOf(REACT_LINES.wary);
    }
    if (op < -25) return pickOf(REACT_LINES.disliked);
    if (met && n.def.shop && this.isRegular(n.id)) {
      n.gestureT = 0.7;
      return this.fill(pickOf(REACT_LINES.regular), n, null);
    }
    if (met && (op > 15 || honor > 35) && Math.random() < 0.7) {
      n.gestureT = 0.7;
      return this.fill(pickOf(REACT_LINES.tipHat.filter((l) => l.includes('{player}'))), n, null);
    }
    if (honor > 50 && Math.random() < 0.4) {
      n.gestureT = 0.7;
      return pickOf(['Howdy.', 'Afternoon.', 'Good day to you.']);
    }
    return null;
  }

  // --- Children ------------------------------------------------------------------------------

  /** Kids playing tag: whoever is "it" chases the nearest child; the rest scatter. */
  private childrenPlay(active: Npc[]): void {
    const g = this.game;
    const bySettlement = new Map<string, Npc[]>();
    for (const n of active) {
      if (n.occupation !== 'child' || n.act !== 'play' || n.chatWith) continue;
      const l = bySettlement.get(n.settlementId);
      if (l) l.push(n);
      else bySettlement.set(n.settlementId, [n]);
    }
    const hold = T.tickSec + 0.12;
    for (const [sid, kids] of bySettlement) {
      if (kids.length < 2) continue;
      let game = this.tagGames.get(sid);
      if (!game || !kids.includes(game.it)) this.tagGames.set(sid, (game = { it: kids[0]!, frozenUntil: g.time + 1 }));
      const it = game.it;
      let prey: Npc | null = null;
      let pd = 150;
      for (const k of kids) {
        if (k === it) continue;
        const d = Math.hypot(k.x - it.x, k.y - it.y);
        if (d < pd) {
          pd = d;
          prey = k;
        }
      }
      if (!prey) continue;
      if (g.time < game.frozenUntil) it.steer = { x: it.x, y: it.y, speed: 0, t: hold };
      else if (pd < 10) {
        // Tagged!
        it.say('Tag! You\'re it!', 1.8);
        if (Math.random() < 0.5) prey.say(pickOf(['No fair!', 'Aw, shucks!', 'I wasn\'t ready!']), 1.8);
        game.it = prey;
        game.frozenUntil = g.time + 1.5;
        prey.steer = { x: prey.x, y: prey.y, speed: 0, t: 1.5 };
        it.dodge(prey.x, prey.y, 60, 0.8);
        this.stats.tags++;
        continue;
      } else it.steer = { x: prey.x, y: prey.y, speed: 58, t: hold };
      for (const k of kids) {
        if (k === it || (k.steer && k.steer.speed === 0)) continue;
        const d = Math.hypot(k.x - it.x, k.y - it.y);
        if (d < 55) k.steer = { x: it.x, y: it.y, speed: 54, t: hold, away: true };
      }
    }
  }

  // --- Conversations -----------------------------------------------------------------------------

  private canChat(n: Npc): boolean {
    return n.socialCd <= 0 && !n.chatWith && !n.steer && !NO_CHAT.has(n.act) && !n.bubble;
  }

  private startPairs(active: Npc[], now: number): void {
    const R2 = T.meetRadius * T.meetRadius;
    for (let i = 0; i < active.length; i++) {
      const a = active[i]!;
      if (!this.canChat(a)) continue;
      for (let j = i + 1; j < active.length; j++) {
        const b = active[j]!;
        if (!this.canChat(b)) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        if (dx * dx + dy * dy > R2) continue;
        // Seated people talk as a group; a pair needs at least one person on their feet.
        if (this.seated(a) && this.seated(b)) continue;
        if (!(!a.arrived || !b.arrived || (a.outdoors && b.outdoors))) continue;
        const kidA = a.occupation === 'child';
        const kidB = b.occupation === 'child';
        if (kidA !== kidB && relationBetween(person(a), person(b)) !== 'family') continue;
        const key = a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id;
        if ((this.pairCd.get(key) ?? 0) > now) continue;
        if (Math.random() >= T.chatChance * this.chatty(a) * this.chatty(b)) {
          this.pairCd.set(key, now + 12); // just a nod this time
          continue;
        }
        this.pairCd.set(key, now + T.pairCooldown);
        this.begin([a, b]);
        if (this.convos.length >= T.maxConvos) return;
        break;
      }
    }
  }

  private chatty(n: Npc): number {
    const p = n.personality;
    return p.includes('talkative') ? 1.6 : p.includes('friendly') || p.includes('kind') ? 1.25 : p.includes('shy') ? 0.45 : p.includes('nervous') ? 0.7 : p.includes('gruff') ? 0.75 : 1;
  }

  /** Seated folk close together (saloon table, porch, campfire) trade a few lines now and then. */
  private startGroup(active: Npc[]): void {
    const R = T.groupRadius;
    for (const s of active) {
      if (!this.seated(s) || !this.canChat(s) || s.act === 'piano') continue;
      const members = [s];
      for (const o of active) {
        if (o === s || !this.seated(o) || !this.canChat(o) || o.act === 'piano') continue;
        if (Math.abs(o.x - s.x) > R || Math.abs(o.y - s.y) > R || o.outdoors !== s.outdoors) continue;
        members.push(o);
        if (members.length >= 3) break;
      }
      if (members.length < 2) {
        s.socialCd = 4 + Math.random() * 4; // nobody to talk to; look again later
        continue;
      }
      this.begin(members);
      return; // one new group per tick keeps the room from talking in unison
    }
  }

  /** Start a conversation among 2–3 NPCs. */
  begin(members: Npc[]): Convo | null {
    const { lines, topic } = this.compose(members);
    if (!lines.length) return null;
    for (const m of members) {
      m.chatWith = members.find((o) => o !== m) ?? null;
      if (!this.seated(m)) m.faceTo(m.chatWith!.x, m.chatWith!.y);
    }
    const c: Convo = { members, lines, i: 0, t: 0.15, topic };
    this.convos.push(c);
    if (members.length > 2 || members.every((m) => this.seated(m))) this.stats.groups++;
    else this.stats.convos++;
    return c;
  }

  private advance(c: Convo, dt: number): void {
    if (c.i < 0) return;
    c.t -= dt;
    if (c.t > 0) return;
    if (c.i >= c.lines.length || c.members.some((m) => !m.alive || m.state !== 'schedule')) {
      this.end(c);
      return;
    }
    const line = c.lines[c.i]!;
    const who = line.who;
    who.say(line.text, T.lineSec);
    if (!this.seated(who) && Math.random() < 0.5) who.gestureT = 0.6;
    for (const m of c.members) m.chatWith = m === who ? c.members.find((o) => o !== who) ?? null : who;
    c.i++;
    c.t = T.lineSec * 0.85 + T.gapSec;
  }

  private end(c: Convo): void {
    const group = c.members.length > 2 || c.members.every((m) => this.seated(m));
    for (const m of c.members) {
      if (m.chatWith && c.members.includes(m.chatWith)) m.chatWith = null;
      m.socialCd = group ? T.groupCooldown[0] + Math.random() * T.groupCooldown[1] : T.npcCooldown[0] + Math.random() * T.npcCooldown[1];
    }
    c.i = -1;
  }

  /** Choose what they talk about from the world around them, then voice it. */
  compose(members: Npc[]): { lines: Line[]; topic: string } {
    const g = this.game;
    let [a, b] = members as [Npc, Npc];
    const group = members.length > 2 || members.every((m) => this.seated(m));
    const kids = members.every((m) => m.occupation === 'child');
    const anyKid = members.some((m) => m.occupation === 'child');
    const rel = relationBetween(person(a), person(b));
    const hr = g.clock.hour;
    const greet = hr < 12 && hr >= 5 ? TOPICS.greetMorning! : hr < 18 && hr >= 5 ? TOPICS.greetDay! : TOPICS.greetEvening!;
    const pools: { w: number; id: string; ex: Exchange[]; tok?: Record<string, string> }[] = [];
    const add = (w: number, id: string, ex: Exchange[] | undefined, tok?: Record<string, string>) => {
      if (ex?.length && w > 0) pools.push({ w, id, ex, tok });
    };
    if (kids) add(1, 'kids', TOPICS.kids);
    else if (anyKid) {
      add(2, rel === 'family' ? 'family' : 'greet', rel === 'family' ? TOPICS.family : greet);
    } else {
      const w = g.weather.current;
      if (rel !== 'acquaintance') add(2.5, rel, TOPICS[rel]);
      if (w.rain > 0.2) add(3, 'rain', TOPICS.rain);
      if (w.snow > 0.2) add(3, 'snow', TOPICS.snow);
      if (w.dust > 0.3) add(2.5, 'dust', TOPICS.dust);
      if (g.temperatureHere > 30) add(1.5, 'hot', TOPICS.hot);
      else if (g.temperatureHere < 4) add(1.5, 'cold', TOPICS.cold);
      if (hr >= 21 || hr < 5) add(2, 'night', TOPICS.night);
      if (isSunday(g.clock.day) && hr < 15) add(2, 'sunday', TOPICS.sunday);
      add(1.2, 'gossip', TOPICS.gossip);
      for (const gs of this.recentGossip(a.settlementId).slice(-3)) {
        if (gs.kind === 'crime') add(4, 'crime', TOPICS.crime, { crime: gs.crime ?? 'trouble' });
        else if (gs.kind === 'killing') add(4, 'killing', TOPICS.killing!.filter((e) => gs.byPlayer || !e.some((l) => l.includes('{player}'))), { victim: gs.victim ?? 'somebody' });
      }
      if (g.time - this.lastGunfire < 240) add(5, 'gunfire', TOPICS.gunfire);
      // The player as a topic: more likely when they're standing right there.
      const p = g.player;
      const pd = Math.hypot(p.x - a.x, p.y - a.y);
      const close = pd < 260;
      const honor = g.rep.get('honor');
      const notor = g.rep.get('notoriety');
      const known = members.some((m) => g.flags[`met_${m.id}`]);
      if (g.law.isWanted(g.currentRegion) && close) add(5, 'playerWanted', TOPICS.playerWanted);
      else if (notor > 40) add(close ? 3 : 1.5, 'playerBad', TOPICS.playerBad);
      else if (honor > 40) add(close ? 2.5 : 1.2, 'playerGood', TOPICS.playerGood);
      if (known) add(close ? 2 : 1, 'playerKnown', TOPICS.playerKnown);
      else if (close) add(1.6, 'playerNew', TOPICS.playerNew);
      const h = g.mainHorse();
      if (h && Math.hypot(h.x - a.x, h.y - a.y) < 200) add(1.4, 'playerHorse', TOPICS.playerHorse);
      // Shop talk: the first speaker addresses the one with the trade.
      if (WORK_TALK[b.occupation]) add(1.4, 'work', WORK_TALK[b.occupation]);
      else if (WORK_TALK[a.occupation]) {
        [a, b] = [b, a];
        add(1.4, 'work', WORK_TALK[b.occupation]);
      }
      if (group) {
        const inSaloon = !a.outdoors && (a.act === 'drink' || a.act === 'deal' || a.place === 'saloon');
        if (inSaloon) add(3.5, 'saloon', TOPICS.saloon);
        else if (a.place === 'camp' || a.place === 'social') add(3, 'campfire', TOPICS.campfire);
        else if (a.place === 'porch') add(3, 'porch', TOPICS.porch);
      } else add(1, 'greet', greet);
    }
    let total = 0;
    for (const p of pools) total += p.w;
    let r = Math.random() * total;
    let choice = pools[0];
    for (const p of pools) {
      r -= p.w;
      if (r <= 0) {
        choice = p;
        break;
      }
    }
    if (!choice) return { lines: [], topic: '' };
    const ex = pickOf(choice.ex);
    const order = a === members[0] ? members : [a, b, ...members.filter((m) => m !== a && m !== b)];
    const lines: Line[] = [];
    // Strangers to the topic open with a greeting first when they've just met on the street.
    const opener = !group && !kids && choice.id !== 'greet' && !['friend', 'rival', 'family', 'colleague'].includes(choice.id) && Math.random() < 0.5;
    // The partner says hello first, so the exchange keeps its roles (A asks, B — e.g. the one with the trade — answers).
    const speakers = order;
    if (opener) lines.push({ who: order[1]!, text: this.fill(pickOf(greet)[0]!, order[1]!, order[0]!) });
    ex.forEach((text, k) => {
      const who = speakers[k % speakers.length]!;
      lines.push({ who, text: this.fill(text, speakers[0]!, speakers[1]!, choice.tok) });
    });
    return { lines, topic: choice.id };
  }
}
