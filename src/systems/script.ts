/**
 * Condition and effect interpreter for authored content (dialogue, quests,
 * encounters). Keeps story data declarative: see data/schema.ts.
 */
import type { Cond, Effect, RepKey } from '../data/schema.ts';
import type { Game } from '../game.ts';
import { bondLevel } from '../horse/stats.ts';
import { L, tr } from '../core/i18n.ts';

export interface ScriptCtx {
  npcId?: string;
}

export function evalCond(g: Game, c: Cond | undefined, ctx: ScriptCtx = {}): boolean {
  if (!c) return true;
  if ('all' in c) return c.all.every((x) => evalCond(g, x, ctx));
  if ('any' in c) return c.any.some((x) => evalCond(g, x, ctx));
  if ('not' in c) return !evalCond(g, c.not, ctx);
  if ('flag' in c) {
    const v = g.flags[c.flag];
    if (c.eq !== undefined) return v === c.eq;
    if (c.gte !== undefined) return typeof v === 'number' && v >= c.gte;
    if (c.lte !== undefined) return typeof v === 'number' && v <= c.lte;
    return !!v;
  }
  if ('notFlag' in c) return !g.flags[c.notFlag];
  if ('quest' in c) {
    const st = g.quests.state(c.quest);
    const status = st?.status ?? 'notStarted';
    if (c.stage && (!st || st.stage !== c.stage || status !== 'active')) return false;
    if (c.state === 'started') return status !== 'notStarted';
    return status === c.state;
  }
  if ('rep' in c) {
    const v = g.rep.get(c.rep as RepKey);
    return (c.gte === undefined || v >= c.gte) && (c.lte === undefined || v <= c.lte);
  }
  if ('opinion' in c) return g.npcOpinion(ctx.npcId ?? '') >= c.opinion;
  if ('opinionBelow' in c) return g.npcOpinion(ctx.npcId ?? '') < c.opinionBelow;
  if ('item' in c) return g.player.inv.count(c.item) >= (c.qty ?? 1);
  if ('money' in c) return g.player.money >= c.money;
  if ('time' in c) {
    const h = g.clock.hour;
    switch (c.time) {
      case 'day':
        return !g.clock.isNight;
      case 'night':
        return g.clock.isNight;
      case 'morning':
        return h >= 5 && h < 12;
      case 'afternoon':
        return h >= 12 && h < 18;
      case 'evening':
        return h >= 18 && h < 22;
    }
  }
  if ('horseBond' in c) {
    const h = g.mainHorse();
    return !!h && bondLevel(h.data) >= c.horseBond;
  }
  if ('hasHorse' in c) return !!g.mainHorse() === c.hasHorse;
  if ('wanted' in c) return g.law.isWanted(g.currentRegion) === c.wanted;
  if ('region' in c) return g.currentRegion === c.region;
  if ('weather' in c) {
    const w = g.weather.current;
    if (c.weather === 'rain') return w.rain > 0.3;
    if (c.weather === 'snow') return w.snow > 0.3;
    return w.rain < 0.1 && w.snow < 0.1;
  }
  if ('metNpc' in c) return !!g.flags[`met_${c.metNpc}`];
  if ('chance' in c) return Math.random() < c.chance;
  return false;
}

export function applyEffects(g: Game, effects: Effect[] | undefined, ctx: ScriptCtx = {}): void {
  if (!effects) return;
  for (const e of effects) applyEffect(g, e, ctx);
}

function applyEffect(g: Game, e: Effect, ctx: ScriptCtx): void {
  if ('setFlag' in e) g.setFlag(e.setFlag, e.value ?? true);
  else if ('addFlag' in e) g.setFlag(e.addFlag, ((g.flags[e.addFlag] as number) || 0) + e.amount);
  else if ('give' in e) g.giveItem(e.give, e.qty ?? 1);
  else if ('take' in e) g.player.inv.remove(e.take, Math.min(e.qty ?? 1, g.player.inv.count(e.take)));
  else if ('money' in e) {
    g.player.money = Math.max(0, g.player.money + e.money);
    if (e.money > 0) g.notify(tr`+ ${e.money.toFixed(2)} dollars`, 'good');
    g.audio.play('coin');
  } else if ('pay' in e) {
    g.player.money = Math.max(0, g.player.money - e.pay);
    g.audio.play('coin');
  } else if ('startQuest' in e) g.quests.start(e.startQuest);
  else if ('completeObjective' in e) {
    const [q, o] = e.completeObjective.split(':');
    g.quests.completeObjective(q!, o!);
  } else if ('setStage' in e) g.quests.setStage(e.setStage, e.stage);
  else if ('failQuest' in e) g.quests.fail(e.failQuest);
  else if ('rep' in e) g.rep.add(e.rep, e.amount);
  else if ('opinion' in e) g.changeOpinion(ctx.npcId ?? '', e.opinion);
  else if ('openShop' in e) g.ui.openShop(e.openShop);
  else if ('notify' in e) g.notify(e.notify, 'info');
  else if ('giveHorse' in e) g.giveHorse(e.giveHorse);
  else if ('spawnEncounter' in e) g.encounters.spawn(e.spawnEncounter);
  else if ('lore' in e) g.unlockLore(e.lore);
  else if ('revealPoi' in e) g.discoverPoi(e.revealPoi, true);
  else if ('heal' in e) g.player.stats.health = Math.min(g.player.stats.maxHealth, g.player.stats.health + e.heal);
  else if ('advanceTime' in e) g.advanceTime(e.advanceTime);
  else if ('npcHostile' in e) g.makeHostile(e.npcHostile);
  else if ('npcLeave' in e) g.npcLeave(e.npcLeave);
  else if ('startActivity' in e) g.activities.start(e.startActivity, ctx.npcId);
  else if ('bountyClear' in e) g.law.clear(g.currentRegion);
}
