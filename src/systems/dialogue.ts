/**
 * Structured dialogue: authored trees with conditional entry points, lines
 * and options; generic conversations for townsfolk (greeting by reputation,
 * opinion and memory — regulars are greeted by name and asked about what they
 * bought; local talk, directions, shop); and contextual ambient barks that
 * know the player, the town gossip and the time of day. NPC↔NPC
 * conversations live in systems/social.ts.
 */
import type { Bark, DialogueNode, DialogueOption, DialogueTree } from '../data/schema.ts';
import { getItem } from '../data/items.ts';
import { firstNameOf } from '../data/social.ts';
import { REGIONS, SETTLEMENTS } from '../data/world.ts';
import type { Npc } from '../entities/npc.ts';
import type { Game } from '../game.ts';
import { bondLevel } from '../horse/stats.ts';
import { applyEffects, evalCond } from './script.ts';

export interface OpenDialogue {
  npc: Npc;
  tree: DialogueTree | null;
  node: DialogueNode;
  text: string;
  options: { opt: DialogueOption; enabled: boolean }[];
}

const GENERIC_BARKS: Record<string, string[]> = {
  child: ['Is that your horse? Can I pet her?', 'Ma says I can\'t go past the water tower.', 'Clementine is faster than any horse in town. Probably.', 'Are you a real cowboy?', 'I found an arrowhead once. Well, a rock that looked like one.', 'Bet you can\'t catch me!', 'Ma says not to talk to strangers.'],
  any: ['Mornin\'.', 'Afternoon.', 'Evenin\'.', 'Fine horse you got there.', 'Hot one today.', 'Mind the ruts on the stage road.', 'Water\'s getting scarce, they say.', 'Railroad men came through again.'],
  sheriff: ['Keep that iron holstered in my town.', 'Peace and quiet. That\'s all I ask.'],
  deputy: ['Move along.', 'Sheriff\'s watching you, friend.'],
  bartender: ['Bar\'s open.', 'Whiskey\'s warm and the company\'s worse.'],
  merchant: ['Fresh stock in from Port Ashby.', 'Cash only, no credit.'],
  cowhand: ['Long drive coming.', 'Ever rode drag? Eat dust for a month.'],
  miner: ['Seam\'s thinning out.', 'Dust in my lungs and silver in my dreams.'],
  outlaw: ['You lost, friend?', 'Best keep riding.'],
  soldier: ['Halt — state your business.', 'Lieutenant\'s in a mood.'],
  preacher: ['Bless you, traveler.', 'Sunday service at nine.'],
  farmer: ['Wind took half the wheat.', 'Rain\'d be a blessing.'],
};

export class DialogueSystem {
  game: Game;
  trees = new Map<string, DialogueTree>();
  barks: Bark[];
  open: OpenDialogue | null = null;
  constructor(game: Game, trees: DialogueTree[], barks: Bark[]) {
    this.game = game;
    for (const t of trees) {
      this.trees.set(t.id, t);
      if (!this.trees.has('npc:' + t.npc)) this.trees.set('npc:' + t.npc, t);
    }
    this.barks = barks;
  }

  isOpenWith(npcId: string): boolean {
    return this.open?.npc.id === npcId;
  }

  treeFor(npc: Npc): DialogueTree | null {
    return (npc.def.dialogue ? this.trees.get(npc.def.dialogue) : undefined) ?? this.trees.get('npc:' + npc.id) ?? null;
  }

  start(npc: Npc): void {
    const g = this.game;
    const first = !g.flags[`met_${npc.id}`];
    g.setFlag(`met_${npc.id}`, true);
    g.social?.rememberVisit(npc.id);
    npc.chatWith = null;
    npc.setState('talk');
    g.bus.emit('npcTalk', { npcId: npc.id });
    // Pick the entry node BEFORE quest progress so quest-specific openings show.
    const tree = this.treeFor(npc);
    const entry = tree?.entry.find((e) => evalCond(g, e.cond, { npcId: npc.id }));
    const node = tree?.nodes.find((n) => n.id === entry?.node);
    if (tree && node) this.show(npc, tree, node);
    else this.show(npc, null, this.genericNode(npc, first));
    g.quests.onTalk(npc.id);
  }

  private show(npc: Npc, tree: DialogueTree | null, node: DialogueNode): void {
    const g = this.game;
    const ctx = { npcId: npc.id };
    const line = node.lines.find((l) => evalCond(g, l.cond, ctx)) ?? node.lines[0];
    const raw = line ? (Array.isArray(line.text) ? line.text[Math.floor(Math.random() * line.text.length)]! : line.text) : '...';
    applyEffects(g, node.effects, ctx);
    const opts = (node.options ?? [])
      .map((opt) => ({ opt, enabled: evalCond(g, opt.cond, ctx) }))
      .filter((o) => o.enabled || o.opt.lockedHint);
    if (!opts.length) opts.push({ opt: { text: 'Goodbye.', next: 'end' }, enabled: true });
    // Anyone can point you toward the person your mission needs.
    const seek = this.soughtNpc(npc);
    if (seek && !node.id.startsWith('generic_find') && (node.id === 'generic_root' || tree?.nodes[0] === node || tree?.entry.some((e) => e.node === node.id))) {
      opts.splice(Math.max(0, opts.length - 1), 0, { opt: { text: `I'm looking for ${seek.name}.`, next: 'generic:find' }, enabled: true });
    }
    this.open = { npc, tree, node, text: this.fill(raw), options: opts };
    g.ui.showDialogue(this.open);
  }

  /** Substitute tokens like {horse}, {region}, {time}. */
  fill(s: string): string {
    const g = this.game;
    const h = g.mainHorse();
    return s
      .replaceAll('{player}', firstNameOf(g.player.name))
      .replaceAll('{horse}', h?.data.name ?? 'your horse')
      .replaceAll('{region}', REGIONS.find((r) => r.id === g.currentRegion)?.name ?? '')
      .replaceAll('{town}', this.open?.npc ? SETTLEMENTS.find((x) => x.id === this.open!.npc.settlementId)?.name ?? '' : '');
  }

  choose(i: number): void {
    const o = this.open;
    if (!o) return;
    const pick = o.options[i];
    if (!pick || !pick.enabled) return;
    const g = this.game;
    const ctx = { npcId: o.npc.id };
    this.game.audio.play('ui');
    // Tone shifts opinion a little.
    if (pick.opt.tone === 'kind') g.changeOpinion(o.npc.id, 2);
    if (pick.opt.tone === 'threat') g.changeOpinion(o.npc.id, -4);
    if (pick.opt.tone === 'joke' && o.npc.personality.includes('gruff')) g.changeOpinion(o.npc.id, -1);
    const next = pick.opt.next ?? 'end';
    applyEffects(g, pick.opt.effects, ctx);
    if (!this.open) return; // effect closed it (e.g. shop)
    if (next === 'end') {
      this.close();
      return;
    }
    if (next.startsWith('generic:')) {
      this.show(o.npc, null, this.genericNode(o.npc, false, next.slice(8)));
      return;
    }
    const node = o.tree?.nodes.find((n) => n.id === next);
    if (node) this.show(o.npc, o.tree, node);
    else this.close();
  }

  /** Game time the last conversation ended (a held E must not reopen it at once). */
  closedAt = -10;

  close(): void {
    this.closedAt = this.game.time;
    if (this.open) this.open.npc.setState('schedule');
    this.open = null;
    this.game.ui.hideDialogue();
  }

  private genericNode(npc: Npc, first: boolean, topic = 'root'): DialogueNode {
    const g = this.game;
    const honor = g.rep.get('honor');
    const notor = g.rep.get('notoriety');
    const op = g.npcOpinion(npc.id);
    const region = REGIONS.find((r) => r.id === g.currentRegion);
    const town = SETTLEMENTS.find((s) => s.id === npc.settlementId);
    const wanted = g.law.isWanted(g.currentRegion);
    const opts: DialogueOption[] = [];
    let text = '';
    if (topic === 'root') {
      if (wanted && npc.occupation !== 'outlaw') text = 'I know your face from the posters. I don\'t want trouble.';
      else if (notor > 40) text = 'I\'ve heard about you. Say your piece and move along.';
      else if (!first && op < -25) text = 'You again. What do you want?';
      else if (!first && npc.def.shop && g.social?.isRegular(npc.id)) {
        // Regulars are greeted by name, and asked after what they bought.
        const last = g.social.lastPurchase(npc.id);
        const item = last ? (() => { try { return getItem(last).name; } catch { return null; } })() : null;
        text = `${this.fill('{player}')}! Good to see you again.` + (item ? ` How's that ${item.toLowerCase()} treating you?` : ' The usual?');
      } else if (honor > 40 || op > 30) text = first ? `Well, now. Folks speak kindly of you. Welcome to ${town?.name ?? 'these parts'}.` : `Good to see you again, ${this.fill('{player}')}.`;
      else if (first) text = `${npc.name}. ${occupationIntro(npc.occupation)} What can I do for you?`;
      else if ((g.social?.visitDays(npc.id) ?? 0) >= 2) text = `${this.fill('{player}')}, isn't it? Back again.`;
      else text = 'Back again?';
      opts.push({ text: 'What\'s the news around here?', next: 'generic:news' });
      opts.push({ text: 'Know anything about horses for sale?', next: 'generic:horses' });
      if (npc.def.shop) opts.push({ text: 'Let\'s do business.', effects: [{ openShop: npc.def.shop }], next: 'end' });
      opts.push({ text: 'Good day to you.', tone: 'kind', next: 'end' });
    } else if (topic === 'news') {
      const lines = [
        region?.description ?? '',
        'Water rights. Every argument in this territory comes back to water rights.',
        'The Meridian & Western is buying up land along the Calder — or trying to.',
        'Rustlers have been working the plains. Brannigan\'s place got hit hard.',
        'Fort Rourke\'s buying remounts again. Paying good money, no questions asked, I hear.',
        'There\'s a pale mare runs with the mustangs out past Gallow\'s Hope. Nobody\'s caught her.',
        'Snow\'s still deep up on the pass. Blanket your horse if you\'re going up.',
      ];
      text = lines[(npc.rng.int(0, 99) + g.clock.day) % lines.length]!;
      opts.push({ text: 'Anything else?', next: 'generic:root' }, { text: 'Thanks.', next: 'end' });
    } else if (topic === 'find') {
      const seek = this.soughtNpc(npc);
      const loc = seek ? g.npcLocation(seek.id) : null;
      if (seek && loc) {
        const dx = loc.x - npc.x;
        const dy = loc.y - npc.y;
        const yds = Math.round(Math.hypot(dx, dy) / 8);
        const dirs = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
        const dir = dirs[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8]!;
        const work = seek.workAt ? ` Try the ${seek.workAt === 'stable' ? 'livery' : seek.workAt}.` : '';
        text = yds < 25 ? `${seek.name}? Right over there, a stone's throw ${dir}.` : `${seek.name}? Last I saw, ${yds > 400 ? 'a good ride' : 'about ' + yds + ' yards'} ${dir} of here.${work}`;
        g.waypoint = loc;
        g.notify(`${seek.name}'s whereabouts marked on your compass.`, 'info');
      } else text = 'Can\'t say I\'ve seen them today.';
      opts.push({ text: 'Thanks.', next: 'end' });
    } else if (topic === 'horses') {
      const stable = SETTLEMENTS.find((s) => s.id === npc.settlementId && ['town', 'city', 'mining'].includes(s.kind));
      text = stable ? `The livery here deals in horses. Look them over in the corral before you pay — check the legs and the eyes.` : 'Nearest horse trader\'s in Larkspur. Port Ashby if you\'ve got money to burn.';
      const h = g.mainHorse();
      if (h && bondLevel(h.data) >= 4) text += ` Though that ${h.data.name} of yours looks like it'd follow you into a river.`;
      opts.push({ text: 'Anything else?', next: 'generic:root' }, { text: 'Thanks.', next: 'end' });
    }
    return { id: 'generic_' + topic, lines: [{ text }], options: opts };
  }

  /** The NPC the tracked mission wants you to talk to (if it isn't this one). */
  private soughtNpc(npc: Npc): { id: string; name: string; workAt?: string } | null {
    const g = this.game;
    const q = g.quests.tracked;
    if (!q || g.quests.state(q)?.status !== 'active') return null;
    const st = g.quests.state(q)!;
    const o = g.quests.visibleObjectives(q).find((x) => !st.done.includes(x.id) && (x.type === 'talk' || x.type === 'deliver') && x.target);
    if (!o || o.target === npc.id) return null;
    const def = g.content.NPCS.find((n) => n.id === o.target);
    return def ? { id: def.id, name: def.name, workAt: def.workAt } : null;
  }

  /** Pick an ambient line for an NPC. */
  bark(npc: Npc): string | null {
    const g = this.game;
    const ctx = { npcId: npc.id };
    const pool: string[] = [];
    // Children speak like children: only lines written for them.
    if (npc.occupation === 'child') {
      for (const b of this.barks) if (b.occupation === 'child' && evalCond(g, b.cond, ctx)) pool.push(...b.lines);
      pool.push(...GENERIC_BARKS.child!);
      return this.fill(pool[Math.floor(Math.random() * pool.length)]!);
    }
    for (const b of this.barks) {
      if (b.occupation && b.occupation !== npc.occupation) continue;
      if (b.personality && !npc.personality.includes(b.personality)) continue;
      if (b.region && b.region !== g.currentRegion) continue;
      if (!evalCond(g, b.cond, ctx)) continue;
      pool.push(...b.lines);
    }
    if (pool.length < 3) pool.push(...(GENERIC_BARKS[npc.occupation] ?? []), ...GENERIC_BARKS.any!);
    if (g.law.isWanted(g.currentRegion) && npc.occupation !== 'outlaw') pool.push('That\'s the one from the wanted poster...', 'Keep away from me!');
    if (g.player.stats.health < 40) pool.push('You\'re bleeding, friend. Doc\'s down the street.');
    // Memory of the player and of what the town has been through lately.
    const met = !!g.flags[`met_${npc.id}`];
    const op = g.npcOpinion(npc.id);
    if (met && op > 20) pool.push('Good to see you, {player}.', 'Well, if it isn\'t {player}.');
    if (met && op < -20) pool.push('You again.', 'Hmph. {player}.');
    if (met && npc.def.shop && g.social?.isRegular(npc.id)) pool.push('Come in, {player}, come in!', 'Saved something for you, {player}.');
    for (const gs of g.social?.recentGossip(npc.settlementId) ?? []) {
      if (gs.kind === 'killing' && gs.victim) pool.push(`Terrible business about ${gs.victim}.`);
      if (gs.kind === 'crime') pool.push('Town\'s on edge since the trouble.', 'Lock your door tonight, they say.');
      if (gs.kind === 'gunfire') pool.push('Heard the shooting earlier. Anybody hurt?');
    }
    const h = g.mainHorse();
    if (h && Math.hypot(h.x - npc.x, h.y - npc.y) < 80) {
      pool.push(`Handsome ${h.data.name.length < 9 ? 'animal' : 'horse'}.`, 'That horse looks like it\'s been well looked after.');
      if (h.data.cleanliness < 30) pool.push('Your horse could use a brushing, partner.');
    }
    // Greetings follow the clock: no "Evenin'" at breakfast, no "Morning" at 2 a.m.
    const hr = g.clock.hour;
    const fits = (l: string) =>
      !(/^(Mornin'?|Morning)\b/i.test(l) && (hr < 5 || hr >= 12)) && !(/^Afternoon\b/i.test(l) && (hr < 12 || hr >= 18)) && !(/^(Evenin'?|Evening)\b/i.test(l) && hr >= 5 && hr < 17) && !(/^Evenin'?|^Evening/i.test(l) && hr < 5 && hr >= 1);
    const ok = pool.filter(fits);
    const from = ok.length ? ok : pool;
    // Avoid lines heard recently, so a street doesn't sound like one person repeating itself.
    const fresh = from.filter((l) => !this.recentBarks.includes(l));
    const pick = fresh.length ? fresh : from;
    const line = pick.length ? pick[Math.floor(Math.random() * pick.length)]! : null;
    if (line) {
      this.recentBarks.push(line);
      if (this.recentBarks.length > 12) this.recentBarks.shift();
    }
    return line ? this.fill(line) : null;
  }
  private recentBarks: string[] = [];
}

function occupationIntro(o: string): string {
  const m: Record<string, string> = {
    sheriff: 'I keep the peace here.',
    deputy: 'Deputy.',
    bartender: 'I pour the drinks.',
    merchant: 'I keep the store.',
    doctor: 'I patch folks up.',
    blacksmith: 'I shoe horses and mend iron.',
    horsetrader: 'I buy and sell horses.',
    stablehand: 'I muck the stalls.',
    cowhand: 'I ride for the brand.',
    miner: 'I dig.',
    soldier: 'Third Cavalry.',
    preacher: 'I tend the flock.',
    farmer: 'I work the land.',
  };
  return m[o] ?? '';
}
