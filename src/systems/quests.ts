/**
 * Quest system: data-driven stages and objectives with persistence,
 * event-driven progress (talk, kill, hunt, buy, discover), polled progress
 * (goto, collect, bond, flag, ride, lead), branching next-stage conditions,
 * fail conditions, rewards and journal entries.
 */
import type { Objective, QuestDef, QuestStage } from '../data/schema.ts';
import { POIS, SETTLEMENTS } from '../data/world.ts';
import type { Game } from '../game.ts';
import { bondLevel } from '../horse/stats.ts';
import { applyEffects, evalCond } from './script.ts';

export interface QuestState {
  status: 'active' | 'completed' | 'failed';
  stage: string;
  progress: Record<string, number>;
  done: string[];
  /** Journal lines accumulated as stages are entered. */
  log: string[];
  startDay: number;
  /** Baseline values captured at stage start (e.g. km ridden). */
  base: Record<string, number>;
}

export class QuestSystem {
  game: Game;
  defs = new Map<string, QuestDef>();
  states: Record<string, QuestState> = {};
  tracked: string | null = null;
  private pollT = 0;
  constructor(game: Game, defs: QuestDef[]) {
    this.game = game;
    for (const d of defs) this.defs.set(d.id, d);
  }

  state(id: string): QuestState | undefined {
    return this.states[id];
  }
  active(): QuestDef[] {
    return [...this.defs.values()].filter((d) => this.states[d.id]?.status === 'active');
  }
  stageDef(id: string): QuestStage | undefined {
    const st = this.states[id];
    return st ? this.defs.get(id)?.stages.find((s) => s.id === st.stage) : undefined;
  }

  start(id: string): void {
    const d = this.defs.get(id);
    if (!d) {
      console.warn('Unknown quest', id);
      return;
    }
    const existing = this.states[id];
    if (existing && (existing.status === 'active' || (existing.status === 'completed' && !d.repeatable))) return;
    this.states[id] = { status: 'active', stage: d.stages[0]!.id, progress: {}, done: [], log: [], startDay: this.game.clock.day, base: {} };
    this.game.notify(`New ${d.kind === 'main' ? 'story mission' : 'quest'}: ${d.title}`, 'quest');
    this.game.audio.play('quest');
    if (!this.tracked || d.kind === 'main') this.tracked = id;
    this.enterStage(id, d.stages[0]!);
  }

  private enterStage(id: string, s: QuestStage): void {
    const st = this.states[id]!;
    st.stage = s.id;
    st.progress = {};
    st.done = [];
    st.log.push(s.journal);
    st.base = { km: this.game.mainHorse()?.data.kmRidden ?? 0 };
    applyEffects(this.game, s.onEnter);
    this.game.bus.emit('questUpdate', { questId: id });
  }

  setStage(id: string, stage: string): void {
    const d = this.defs.get(id);
    const s = d?.stages.find((x) => x.id === stage);
    if (!d || !s) return;
    if (!this.states[id]) this.start(id);
    this.enterStage(id, s);
  }

  fail(id: string): void {
    const st = this.states[id];
    if (!st || st.status !== 'active') return;
    st.status = 'failed';
    this.game.notify(`Quest failed: ${this.defs.get(id)!.title}`, 'bad');
    if (this.tracked === id) this.tracked = this.active()[0]?.id ?? null;
  }

  completeObjective(id: string, objId: string): void {
    const st = this.states[id];
    if (!st || st.status !== 'active') return;
    if (!st.done.includes(objId)) {
      const obj = this.stageDef(id)?.objectives.find((o) => o.id === objId);
      if (!obj) return;
      st.done.push(objId);
      if (!obj.hidden) this.game.notify(`✓ ${obj.text}`, 'quest');
    }
    this.checkStage(id);
  }

  /** Is an objective visible (hidden ones show after earlier ones are done)? */
  visibleObjectives(id: string): Objective[] {
    const s = this.stageDef(id);
    const st = this.states[id];
    if (!s || !st) return [];
    const out: Objective[] = [];
    for (const o of s.objectives) {
      if (o.hidden && out.some((p) => !st.done.includes(p.id) && !p.optional)) break;
      out.push(o);
    }
    return out;
  }

  private checkStage(id: string): void {
    const d = this.defs.get(id)!;
    const st = this.states[id]!;
    const s = this.stageDef(id);
    if (!s) return;
    if (!s.objectives.every((o) => o.optional || st.done.includes(o.id))) return;
    applyEffects(this.game, s.onComplete);
    if (st.status !== 'active' || st.stage !== s.id) return; // effects may have moved the quest
    let next: string | undefined;
    if (typeof s.next === 'string') next = s.next;
    else if (Array.isArray(s.next)) next = s.next.find((b) => evalCond(this.game, b.cond))?.stage;
    if (next) {
      const ns = d.stages.find((x) => x.id === next);
      if (ns) {
        this.enterStage(id, ns);
        this.game.notify(`${d.title}: ${ns.objectives[0]?.text ?? 'Updated'}`, 'quest');
        return;
      }
    }
    this.complete(id);
  }

  private complete(id: string): void {
    const d = this.defs.get(id)!;
    const st = this.states[id]!;
    st.status = 'completed';
    const g = this.game;
    const r = d.rewards;
    if (r.money) g.player.money += r.money;
    if (r.items) for (const [it, q] of Object.entries(r.items)) g.giveItem(it, q);
    if (r.rep) for (const [k, v] of Object.entries(r.rep)) g.rep.add(k as never, v as number);
    if (r.honor) g.rep.add('honor', r.honor);
    g.notify(`Completed: ${d.title}${r.money ? ` (+${r.money} dollars)` : ''}`, 'quest');
    g.audio.play('quest');
    g.setFlag(`quest_done_${id}`, true);
    if (this.tracked === id) this.tracked = this.active().find((q) => q.kind === 'main')?.id ?? this.active()[0]?.id ?? null;
    g.bus.emit('questUpdate', { questId: id });
  }

  /** Whether quest scripting currently permits an essential NPC to die. */
  allowEssentialDeath(npcId: string): boolean {
    for (const q of this.active())
      for (const o of this.stageDef(q.id)?.objectives ?? []) if (o.type === 'kill' && o.target === npcId) return true;
    return false;
  }

  // --- Event hooks ------------------------------------------------------------
  onTalk(npcId: string): void {
    this.forEachObjective((q, o) => {
      if (o.type === 'talk' && o.target === npcId) this.completeObjective(q, o.id);
      if (o.type === 'deliver' && o.target === npcId && o.item) {
        const n = o.count ?? 1;
        if (this.game.player.inv.count(o.item) >= n) {
          this.game.player.inv.remove(o.item, n);
          this.completeObjective(q, o.id);
        }
      }
    });
  }
  onKill(npcId: string, tag: string | null): void {
    this.forEachObjective((q, o) => {
      if (o.type === 'kill' && (o.target === npcId || (tag && o.target === tag))) this.increment(q, o);
    });
  }
  onHunt(speciesId: string): void {
    this.forEachObjective((q, o) => {
      if (o.type === 'hunt' && o.target === speciesId) this.increment(q, o);
    });
  }
  onBuy(itemId: string): void {
    this.forEachObjective((q, o) => {
      if (o.type === 'buy' && o.target === itemId) this.completeObjective(q, o.id);
    });
  }

  private increment(q: string, o: Objective): void {
    const st = this.states[q]!;
    st.progress[o.id] = (st.progress[o.id] ?? 0) + 1;
    if (st.progress[o.id]! >= (o.count ?? 1)) this.completeObjective(q, o.id);
    else this.game.notify(`${o.text} (${st.progress[o.id]}/${o.count})`, 'quest');
  }

  private forEachObjective(fn: (questId: string, o: Objective) => void): void {
    for (const d of this.active()) {
      const st = this.states[d.id]!;
      for (const o of this.visibleObjectives(d.id)) if (!st.done.includes(o.id)) fn(d.id, o);
    }
  }

  /** Objective world target in px, if it has one. */
  objectiveTarget(o: Objective): { x: number; y: number } | null {
    // People move: a talk/deliver objective tracks the live NPC before any authored spot.
    if ((o.type === 'talk' || o.type === 'deliver') && o.target) {
      const live = this.game.npcLocation(o.target);
      if (live) return live;
    }
    if (o.x !== undefined && o.y !== undefined) return { x: o.x * 16 + 8, y: o.y * 16 + 8 };
    if ((o.type === 'goto' || o.type === 'discover') && o.target) {
      const p = POIS.find((x) => x.id === o.target);
      if (p) return { x: p.x * 16 + 8, y: p.y * 16 + 8 };
      const s = SETTLEMENTS.find((x) => x.id === o.target);
      if (s) return { x: s.x * 16, y: s.y * 16 };
    }
    if ((o.type === 'talk' || o.type === 'deliver') && o.target) return this.game.npcLocation(o.target);
    return null;
  }

  /** Polled objectives and auto-starts. */
  update(dt: number): void {
    this.pollT -= dt;
    if (this.pollT > 0) return;
    this.pollT = 0.5;
    const g = this.game;
    for (const d of this.defs.values()) {
      if (!this.states[d.id] && d.autoStart && evalCond(g, d.autoStart)) this.start(d.id);
    }
    const p = g.player;
    this.forEachObjective((q, o) => {
      const st = this.states[q]!;
      switch (o.type) {
        case 'goto': {
          const t = this.objectiveTarget(o);
          if (t && Math.hypot(p.x - t.x, p.y - t.y) < (o.radius ?? 4) * 16) this.completeObjective(q, o.id);
          break;
        }
        case 'discover':
          if (o.target && g.discovered.has(o.target)) this.completeObjective(q, o.id);
          break;
        case 'collect':
          if (o.target && p.inv.count(o.target) >= (o.count ?? 1)) this.completeObjective(q, o.id);
          break;
        case 'flag':
        case 'race':
          if (o.target && g.flags[o.type === 'race' ? `race_won_${o.target}` : o.target]) this.completeObjective(q, o.id);
          break;
        case 'bond': {
          const h = g.mainHorse();
          if (h && bondLevel(h.data) >= (o.count ?? 2)) this.completeObjective(q, o.id);
          break;
        }
        case 'ride': {
          const h = g.mainHorse();
          if (h && h.data.kmRidden - (st.base.km ?? 0) >= (o.count ?? 1)) this.completeObjective(q, o.id);
          break;
        }
        case 'lead': {
          const t = this.objectiveTarget(o);
          if (!t || !o.target) break;
          const n = g.horsesTagged(o.target).filter((h) => Math.hypot(h.x - t.x, h.y - t.y) < (o.radius ?? 8) * 16).length;
          st.progress[o.id] = n;
          if (n >= (o.count ?? 1)) this.completeObjective(q, o.id);
          break;
        }
        case 'interact':
          if (o.target && g.flags[`interacted_${o.target}`]) this.completeObjective(q, o.id);
          break;
      }
    });
    for (const d of this.active()) {
      const s = this.stageDef(d.id);
      if (s?.failIf && evalCond(g, s.failIf)) this.fail(d.id);
    }
  }

  serialize(): unknown {
    return { states: this.states, tracked: this.tracked };
  }
  load(d: { states?: Record<string, QuestState>; tracked?: string | null }): void {
    this.states = d.states ?? {};
    this.tracked = d.tracked ?? null;
  }
}
