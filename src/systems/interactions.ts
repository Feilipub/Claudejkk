import { SETTLEMENTS } from '../data/world.ts';
/**
 * Contextual interaction system. Builds the list of actions available right
 * now from what is near the player (horses, people, carcasses, water, beds,
 * fires, hitching posts…) and the state of each (tied, saddled, injured,
 * stressed, owned, wild, items carried). Only relevant actions are offered.
 */
import { getItem } from '../data/items.ts';
import { POIS } from '../data/world.ts';
import { Animal } from '../entities/animal.ts';
import { HorseEntity } from '../entities/horse.ts';
import { Npc } from '../entities/npc.ts';
import type { Game } from '../game.ts';
import { brushHorse, calmHorse, cleanHooves, feedHorse, petHorse, treatHorse, waterHorse } from '../horse/care.ts';
import { grantBond } from '../horse/bonding.ts';
import { F, G, O, OBJ } from '../world/tiles.ts';
import { L, tr } from '../core/i18n.ts';

export interface Action {
  label: string;
  run: () => void;
  enabled?: boolean;
  hint?: string;
}

export interface InteractTarget {
  title: string;
  subtitle?: string;
  x: number;
  y: number;
  actions: Action[];
}

export class InteractionSystem {
  game: Game;
  current: InteractTarget | null = null;
  selected = 0;
  constructor(game: Game) {
    this.game = game;
  }

  /** Entity currently in interaction focus (for hysteresis). */
  private focusEntity: unknown = null;

  update(): void {
    const g = this.game;
    const prev = this.current?.title;
    this.current = g.player.alive && !g.ui.modalOpen && !g.jobs.busy ? this.find() : null;
    if (this.current?.title !== prev) this.selected = 0;
    if (!this.current) return;
    const acts = this.current.actions;
    const inp = g.input;
    if (inp.pressed('weaponNext') && g.player.holstered && acts.length > 1) this.selected = (this.selected + 1) % acts.length;
    if (inp.pressed('weaponPrev') && g.player.holstered && acts.length > 1) this.selected = (this.selected - 1 + acts.length) % acts.length;
    const opt = ['opt1', 'opt2', 'opt3', 'opt4', 'opt5', 'opt6'] as const;
    for (let i = 0; i < opt.length; i++) if (inp.pressed(opt[i]!) && acts[i]) this.exec(acts[i]!);
    // The E that closed a conversation must not immediately start it again.
    if (inp.pressed('interact') && acts[this.selected] && g.time - g.dialogue.closedAt > 0.5) this.exec(acts[this.selected]!);
  }

  /** Run the i-th option of the current prompt (tapped on a touch screen). */
  execIndex(i: number): void {
    const a = this.current?.actions[i];
    if (a) this.exec(a);
  }

  private exec(a: Action): void {
    if (a.enabled === false) {
      if (a.hint) this.game.notify(a.hint, 'info');
      return;
    }
    a.run();
  }

  private find(): InteractTarget | null {
    const g = this.game;
    const p = g.player;
    if (p.mount) return this.mountedActions();
    // Nearest entity in front of the player.
    const fx = p.x + Math.cos(p.angle) * 8;
    const fy = p.y + Math.sin(p.angle) * 8;
    let best: InteractTarget | null = null;
    let bestD = 30;
    let bestE: unknown = null;
    for (const e of g.spatial.query(fx, fy, 34)) {
      // Stickiness: the person already in focus keeps it unless someone is clearly closer,
      // so the prompt you read is the one E acts on, even with people milling about.
      const d = Math.hypot(e.x - fx, e.y - fy) - (e === this.focusEntity ? 10 : 0);
      if (d >= bestD) continue;
      let t: InteractTarget | null = null;
      if (e instanceof HorseEntity && !e.rider) t = this.horseTarget(e);
      else if (e instanceof Npc && e.state !== 'dead') t = this.npcTarget(e);
      else if (e instanceof Npc && e.state === 'dead') t = this.lootTarget(e);
      else if (e instanceof Animal && !e.alive && !e.skinned) t = this.carcassTarget(e);
      else if (e.kind === 'campfire') t = g.camp.target();
      if (t) {
        best = t;
        bestD = d;
        bestE = e;
      }
    }
    this.focusEntity = bestE;
    const world = this.worldTarget();
    // Only your own horse shares a prompt with the trough or well next to it; a person or a trader's horse gets a prompt of their own.
    const ownHorse = bestE instanceof HorseEntity && bestE.data.owner === 'player';
    if (best && world && ownHorse) best.actions.push(...world.actions.filter((a) => !best!.actions.some((b) => b.label === a.label)));
    return best ?? world;
  }

  private mountedActions(): InteractTarget | null {
    const g = this.game;
    const h = g.player.mount!;
    const acts: Action[] = [];
    if (h.data.stress > 30) acts.push({ label: 'Calm horse', run: () => this.care(h, calmHorse(h.data, g.clock.day)) });
    if (Math.abs(h.speed) < 5) acts.push({ label: 'Pat neck', run: () => this.care(h, petHorse(h.data, g.clock.day)) });
    const t = g.world.terrainAt(h.x, h.y);
    const trough = this.nearObj(h.x, h.y, [O.Trough], 2);
    if (((t.water && !t.deep) || trough) && h.data.thirst < 95) acts.push({ label: 'Let horse drink', run: () => this.care(h, waterHorse(h.data, g.clock.day)) });
    if (!acts.length) return null;
    return { title: h.data.name, subtitle: 'Riding', x: h.x, y: h.y - 30, actions: acts };
  }

  care(h: HorseEntity, r: { ok: boolean; message: string; bondGained?: number; anim?: string }): void {
    const g = this.game;
    g.notify(r.message, r.ok ? 'horse' : 'info');
    if (r.ok) {
      g.player.act(r.anim === 'brush' || r.anim === 'hoof' ? 1.2 : 0.7);
      h.speed = 0;
      h.brainTimer = Math.max(h.brainTimer, 3);
      if (r.anim === 'eat' || r.anim === 'drink') {
        h.brain = { state: 'graze', target: null, gait: 'halt', duration: 4, label: r.anim === 'eat' ? 'Eating' : 'Drinking' };
        h.brainTimer = 3;
        g.audio.play(r.anim);
      }
      if (r.anim === 'brush') g.audio.play('brush');
      if (h.data.owner === 'player' && h.data.tag !== 'rental') {
        const flag = r.anim === 'brush' ? 'care_brushed' : r.anim === 'eat' ? 'care_fed' : r.anim === 'drink' ? 'care_watered' : r.anim === 'hoof' ? 'care_hooves' : r.anim === 'pet' ? 'care_calmed' : null;
        if (flag) g.setFlag(flag, true);
      }
      g.player.skills.gain('horsemanship', 2);
    }
    g.checkBondLevel(h);
  }

  private horseTarget(h: HorseEntity): InteractTarget {
    const g = this.game;
    const p = g.player;
    const d = h.data;
    const acts: Action[] = [];
    const owned = d.owner === 'player';
    const trader = d.owner.startsWith('trader:');
    const day = g.clock.day;
    if (h.npcRiderLook) {
      return {
        title: 'Traveller',
        subtitle: /^[AEIOU]/i.test(g.breedName(d.breedId)) ? tr`Riding an ${L(g.breedName(d.breedId))}` : tr`Riding a ${L(g.breedName(d.breedId))}`,
        x: h.x,
        y: h.y - 40,
        actions: [
          { label: 'Greet', run: () => { const town = SETTLEMENTS.filter((st) => st.kind === 'town' || st.kind === 'city').sort((a, b) => Math.hypot(a.x * 16 - h.x, a.y * 16 - h.y) - Math.hypot(b.x * 16 - h.x, b.y * 16 - h.y)).find((st) => Math.hypot(st.x * 16 - h.x, st.y * 16 - h.y) > 600); const hr = g.clock.hour; const hello = hr < 12 ? 'Mornin\'.' : hr < 18 ? 'Afternoon.' : 'Evenin\'.'; const lines = [hello, town ? `Road's clear to ${town.name}.` : 'Quiet road today.', 'Watch for rattlers past the wash.', 'Fine animal you\'ve got.', 'Rain coming, I\'d wager.']; g.notify(`“${lines[Math.floor(Math.random() * lines.length)]}”`, 'info'); h.speed = Math.min(h.speed, 20); } },
          { label: 'Hold up (rob)', run: () => g.ui.choice('Draw on this traveller and rob them? Witnesses will run for the law.', [
            { label: 'Do it', enabled: true, run: () => { const n = g.dismountNpcRider(h); if (n) { n.setState('surrender'); g.law.reportCrime('robbery', n.x, n.y, n.id); g.player.money += 3 + Math.random() * 10; g.notify('You take what they carry.', 'bad'); } } },
            { label: 'Never mind', enabled: true, run: () => undefined },
          ]) },
        ],
      };
    }
    if (trader) {
      const shop = d.owner.slice(7);
      const price = g.economy.horseAsk(shop, d);
      acts.push({ label: 'Inspect', run: () => g.ui.openHorse(h, { shop, price }) });
      acts.push({ label: `Buy for ${price} dollars`, enabled: p.money >= price, hint: 'You can\'t afford this horse.', run: () => g.ui.openHorse(h, { shop, price }) });
      return { title: d.name, subtitle: tr`For sale · ${g.horseSummary(h)}`, x: h.x, y: h.y - 30, actions: acts };
    }
    if (d.owner === 'wild') {
      if (g.taming.roped === h) acts.push({ label: 'Calm (approach slowly)', run: () => g.notify(g.taming.calm(h), 'horse') });
      if (d.tameness >= 100) acts.push({ label: 'Lead', run: () => this.toggleLead(h) });
      acts.push({ label: 'Inspect', run: () => g.ui.openHorse(h) });
      return { title: d.tag === 'pale_mare' ? 'The Pale Mare' : tr`Wild ${L(g.breedName(d.breedId))}`, subtitle: d.tameness >= 100 ? 'Unclaimed' : tr`Wild · tameness ${Math.round(d.tameness)}%`, x: h.x, y: h.y - 30, actions: acts };
    }
    if (!owned) {
      acts.push({ label: 'Inspect', run: () => g.ui.openHorse(h) });
      acts.push({ label: 'Pet', run: () => this.care(h, petHorse(d, day)) });
      return { title: d.name, subtitle: d.owner === 'stolen' ? 'Stolen' : 'Belongs to someone else', x: h.x, y: h.y - 30, actions: acts };
    }
    // Own horse: contextual care.
    if (d.stress > 25) acts.push({ label: 'Calm', run: () => this.care(h, calmHorse(d, day)) });
    acts.push({ label: 'Pet', run: () => this.care(h, petHorse(d, day)) });
    const foods = p.inv.byCategory('horseFood');
    if (foods.length) {
      const fav = foods.find(([id]) => id === d.favoriteFood);
      const pick = fav ?? (d.hunger < 50 ? foods.find(([id]) => id === 'hay' || id === 'oats') : undefined) ?? foods[0]!;
      acts.push({
        label: tr`Feed ${L(getItem(pick[0]).name)}` + (foods.length > 1 ? ' (+)' : ''),
        run: () => {
          const r = feedHorse(d, pick[0], day);
          if (r.ok) p.inv.remove(pick[0]);
          this.care(h, r);
        },
      });
    }
    const nearWater = this.nearWater(p.x, p.y, 2) || this.nearObj(p.x, p.y, [O.Trough, O.Well], 2);
    if (d.thirst < 95 && (nearWater || p.inv.has('waterBucket'))) acts.push({ label: 'Water', run: () => this.care(h, waterHorse(d, day)) });
    if (p.inv.has('brush')) acts.push({ label: 'Brush', run: () => this.care(h, brushHorse(d, day)) });
    if (p.inv.has('hoofPick') && (d.hoof < 90 || d.injuries.some((i) => i.kind === 'stoneBruise'))) acts.push({ label: 'Clean hooves', run: () => this.care(h, cleanHooves(d, day)) });
    const meds = ['horseLiniment', 'horseOintment', 'bandage', 'horseReviver'].filter((m) => p.inv.has(m));
    // Offer treatment only while something is still untreated (or the horse is badly hurt).
    if ((d.injuries.some((i) => !i.treated) || d.health < 60) && meds.length) {
      const leg = d.injuries.some((i) => i.kind === 'limp' || i.kind === 'strain' || i.kind === 'stoneBruise');
      const med = (leg && meds.includes('horseLiniment') ? 'horseLiniment' : meds.find((m) => m !== 'horseReviver')) ?? meds[0]!;
      acts.push({
        label: `Treat with ${getItem(med).name}`,
        run: () => {
          const r = treatHorse(d, med, day);
          if (r.ok) p.inv.remove(med);
          this.care(h, r);
        },
      });
    }
    if (d.tiedAt) acts.push({ label: 'Untie', run: () => { d.tiedAt = null; g.notify(`You untie ${d.name}.`, 'horse'); } });
    else {
      const post = g.world.findNear(Math.floor(h.x / 16), Math.floor(h.y / 16), 2, (x, y) => g.world.objAt(x, y) === O.HitchPost);
      if (post) acts.push({ label: 'Tie to post', run: () => { d.tiedAt = { x: post.x * 16 + 8, y: post.y * 16 + 16 }; h.leading = false; grantBond(d, 'shelter', day, 0.2); g.notify(`${d.name} is tied to the hitching post.`, 'horse'); } });
      acts.push({ label: h.leading ? 'Stop leading' : 'Lead', run: () => this.toggleLead(h) });
    }
    acts.push({ label: 'Saddlebags', run: () => g.ui.openInventory(h) });
    acts.push({ label: 'Inspect & equip', run: () => g.ui.openHorse(h) });
    if (g.player.mainHorseId !== d.id) acts.push({ label: 'Make main horse', run: () => { g.player.mainHorseId = d.id; g.notify(`${d.name} is now your main horse.`, 'horse'); } });
    return { title: d.name, subtitle: g.horseSummary(h), x: h.x, y: h.y - 30, actions: acts };
  }

  private toggleLead(h: HorseEntity): void {
    const g = this.game;
    h.leading = !h.leading;
    if (h.leading) {
      h.data.tiedAt = null;
      for (const o of g.horses.values()) if (o !== h && o.leading && g.horsesLed() >= 3) o.leading = false;
    }
    g.notify(h.leading ? `Leading ${h.data.name}.` : `You let go of ${h.data.name}'s rope.`, 'horse');
    h.brainTimer = 0;
  }

  private npcTarget(n: Npc): InteractTarget {
    const g = this.game;
    const acts: Action[] = [];
    if (n.state === 'hogtied') {
      acts.push({ label: 'Untie', run: () => { n.setState('flee'); g.rep.add('honor', 2); } });
      acts.push({ label: 'Turn over to the law', run: () => g.turnInBounty(n) });
      return { title: n.name, subtitle: 'Hogtied', x: n.x, y: n.y - 30, actions: acts };
    }
    if (n.state === 'surrender') {
      acts.push({ label: 'Hogtie', run: () => { n.setState('hogtied'); g.setFlag(`hogtied_${n.id}`, true); g.notify(`You hogtie ${n.name}.`, 'info'); } });
      acts.push({ label: 'Let them go', run: () => { n.setState('flee'); g.rep.add('honor', 3); g.notify(`${n.name} runs for it.`, 'info'); } });
      acts.push({ label: 'Rob', run: () => { const m = 2 + n.rng.range(0, 12); g.player.money += m; g.law.reportCrime('robbery', n.x, n.y, n.id); g.notify(`You take ${m.toFixed(2)} dollars.`, 'bad'); n.setState('flee'); } });
      if (g.dialogue.treeFor(n)) acts.unshift({ label: 'Talk', run: () => g.dialogue.start(n) });
      return { title: n.name, subtitle: 'Surrendered', x: n.x, y: n.y - 30, actions: acts };
    }
    // A lawman coming for you: you can give yourself up instead of waiting to be shot.
    if ((n.occupation === 'sheriff' || n.occupation === 'deputy') && (n.state === 'pursue' || n.state === 'combat') && g.law.isWanted(g.currentRegion)) {
      return { title: n.name, subtitle: 'Lawman', x: n.x, y: n.y - 30, actions: [{ label: 'Surrender', run: () => { g.player.holstered = true; n.hostile = false; g.law.arrest(n); } }] };
    }
    if (n.hostile) return { title: n.name, subtitle: 'Hostile', x: n.x, y: n.y - 30, actions: [] };
    acts.push({ label: 'Talk', run: () => g.dialogue.start(n) });
    if (n.def.shop && (n.def.shop !== 'stable_sayen' || g.flags.sayen_shop_open)) acts.push({ label: 'Shop', run: () => g.ui.openShop(n.def.shop!) });
    acts.push({ label: 'Greet', run: () => { const l = g.dialogue.bark(n); if (l) n.say(l); g.changeOpinion(n.id, 0.5); } });
    const work = g.jobs.npcAction(n);
    if (work) acts.push(work);
    const occ = n.occupation === 'saloongirl' ? 'hostess' : n.occupation;
    const occL = L(occ);
    return { title: n.name, subtitle: occL.charAt(0).toUpperCase() + occL.slice(1), x: n.x, y: n.y - 30, actions: acts };
  }

  private lootTarget(n: Npc): InteractTarget | null {
    const g = this.game;
    if (g.flags[`looted_${n.id}`]) return null;
    return {
      title: n.name,
      subtitle: 'Dead',
      x: n.x,
      y: n.y - 20,
      actions: [
        {
          label: 'Search body',
          run: () => {
            g.setFlag(`looted_${n.id}`, true);
            const m = Math.round(n.rng.range(0.5, 9) * 100) / 100;
            g.player.money += m;
            const ammo = n.weapon ? getItem(n.weapon).weapon?.ammo : null;
            if (ammo) g.giveItem(ammo, n.rng.int(3, 10));
            if (n.rng.chance(0.3)) g.giveItem(n.rng.pick(['pocketWatch', 'ring', 'jerky', 'whiskey', 'bandage']), 1);
            if (n.weapon && !g.player.weapons.includes(n.weapon)) {
              g.player.weapons.push(n.weapon);
              g.player.clip[n.weapon] = 0;
              g.notify(`Picked up: ${getItem(n.weapon).name}`, 'good');
            }
            g.notify(`Found ${m.toFixed(2)} dollars.`, 'good');
            if (!n.hostile) g.rep.add('honor', -2);
            g.player.act(1);
          },
        },
      ],
    };
  }

  private carcassTarget(a: Animal): InteractTarget {
    const g = this.game;
    return {
      title: a.sp.name,
      subtitle: 'Carcass',
      x: a.x,
      y: a.y - 16,
      actions: [
        {
          label: a.sp.yields.length ? 'Skin & butcher' : 'Inspect',
          run: () => {
            a.skinned = true;
            const bonus = g.player.skills.level('survival') >= 3 ? 1 : 0;
            for (const y of a.sp.yields) {
              const q = a.rng.int(y.qty[0], y.qty[1]) + (y.item.startsWith('meat') ? bonus : 0);
              if (q > 0) g.giveItem(y.item, q);
            }
            g.player.act(1.6);
            g.player.skills.gain('survival', 4);
            if (!a.sp.yields.length) g.notify('Nothing worth taking.', 'info');
            a.deadT = 560;
          },
        },
      ],
    };
  }

  nearWater(x: number, y: number, r: number): boolean {
    const W = this.game.world;
    return !!W.findNear(Math.floor(x / 16), Math.floor(y / 16), r, (tx, ty) => {
      const gnd = W.groundAt(tx, ty);
      return (gnd === G.ShallowWater || gnd === G.DeepWater) && !(W.flagAt(tx, ty) & F.Bridge);
    });
  }
  nearObj(x: number, y: number, objs: number[], r: number): { x: number; y: number } | null {
    const W = this.game.world;
    return W.findNear(Math.floor(x / 16), Math.floor(y / 16), r, (tx, ty) => objs.includes(W.objAt(tx, ty)));
  }

  private worldTarget(): InteractTarget | null {
    const g = this.game;
    const p = g.player;
    const W = g.world;
    const acts: Action[] = [];
    let title = '';
    const water = this.nearWater(p.x, p.y, 1);
    const well = this.nearObj(p.x, p.y, [O.Well, O.Trough, O.WaterTower], 1);
    if (water || well) {
      title = water ? 'Water' : OBJ[W.objAt(well!.x, well!.y)]?.name ?? 'Well';
      // Your horse standing by: water it from here too (the horse's own prompt is often off-screen on a phone).
      const mh = g.horses.size ? [...g.horses.values()].find((h) => h.data.owner === 'player' && !h.rider && h.data.thirst < 95 && Math.hypot(h.x - p.x, h.y - p.y) < 70) : undefined;
      if (mh) acts.push({ label: `Water ${mh.data.name}`, run: () => this.care(mh, waterHorse(mh.data, g.clock.day)) });
      acts.push({ label: 'Drink', run: () => { p.stats.thirst = 100; p.act(1); g.audio.play('drink'); g.notify('You drink your fill.', 'info'); } });
      acts.push({ label: 'Fill canteen', enabled: p.inv.canAdd('canteenWater'), hint: 'No room.', run: () => { const n = p.inv.add('canteenWater', 3); g.notify(n ? `Filled canteen (${n}).` : 'Canteen is full.', 'info'); } });
      if (water && p.inv.has('fishingRod')) acts.push({ label: 'Fish', run: () => g.activities.start('fishing') });
    }
    const obj = this.nearObj(p.x, p.y, [O.Bed, O.Grave, O.Tombstone, O.BerryBush, O.MineEntrance, O.Signpost, O.Piano, O.Safe, O.FirePit], 1);
    if (obj) {
      const o = W.objAt(obj.x, obj.y);
      const def = OBJ[o]!;
      title = title || def.name;
      const key = `${obj.x},${obj.y}`;
      switch (def.interact) {
        case 'bed': {
          const b = W.buildingAtPx(obj.x * 16 + 8, obj.y * 16 + 8);
          const own = b && (b.settlementId === 'brannigan' || b.type === 'hotel');
          const paid = b?.type !== 'hotel' || g.flags[`room_${b.id}`] === g.clock.day;
          if (own && paid) acts.push({ label: 'Sleep', run: () => g.ui.openSleep('bed') });
          else if (b?.type === 'hotel') acts.push({ label: 'Rent the room first (clerk)', enabled: false, hint: 'Talk to the hotel clerk to rent a room.', run: () => {} });
          else acts.push({ label: 'Not your bed', enabled: false, hint: 'Sleeping in a stranger\'s bed would be trespass.', run: () => {} });
          break;
        }
        case 'grave':
          acts.push({ label: 'Pay respects', run: () => { if (!g.flags[`grave_${key}`]) { g.setFlag(`grave_${key}`, true); g.rep.add('honor', 1); } g.notify(graveText(obj.x, obj.y), 'info'); p.act(1.5, 'sit'); } });
          break;
        case 'berry':
          if (!g.flags[`berry_${key}_${g.clock.day}`]) acts.push({ label: 'Forage berries', run: () => { g.setFlag(`berry_${key}_${g.clock.day}`, true); p.stats.hunger = Math.min(100, p.stats.hunger + 8); g.notify('Tart chokecherries. They take the edge off.', 'info'); p.act(1); } });
          break;
        case 'mine':
          acts.push({ label: 'Prospect', enabled: p.inv.has('pickaxe'), hint: 'You need a prospector\'s pick.', run: () => g.activities.prospect(key) });
          break;
        case 'sign':
          acts.push({ label: 'Read sign', run: () => g.notify(g.signText(obj.x, obj.y), 'info') });
          break;
        case 'piano':
          acts.push({ label: 'Play a tune', run: () => { g.notify('You pick out an old tune. Somebody claps.', 'info'); for (let i = 0; i < 8; i++) setTimeout(() => g.audio.play('bird'), i * 120); } });
          break;
        case 'safe':
          acts.push({ label: 'Crack safe', enabled: p.inv.has('lockpick'), hint: 'You need a lockpick.', run: () => g.activities.crackSafe(key) });
          break;
        case 'fire':
          acts.push({ label: 'Make camp here', run: () => g.camp.make() });
          break;
      }
    }
    // Ranch work at the Brannigan corral (after the prologue): break a green colt for pay.
    const ranch = g.corrals.find((c) => c.settlementId === 'brannigan');
    if (ranch && g.quests.state('main_arrival')?.status === 'completed' && !p.mount && Math.hypot(p.x - (ranch.gateX * 16 + 8), p.y - (ranch.gateY * 16 + 8)) < 40) {
      title = title || 'Brannigan corral';
      const done = !!g.flags[`ranchwork_${g.clock.day}`];
      acts.push({
        label: done ? 'Ranch work (done for today)' : 'Ranch work: break a green colt',
        enabled: !done && !g.taming.breaking,
        hint: 'Come back tomorrow — the colts need rest between sessions.',
        run: () => g.startRanchWork(ranch.x * 16 + (ranch.w * 8), ranch.y * 16 + ranch.h * 8),
      });
    }
    // POI notes nearby.
    for (const poi of POIS) {
      if (poi.doc && g.discovered.has(poi.id) && Math.hypot(poi.x * 16 + 8 - p.x, poi.y * 16 + 8 - p.y) < 40) {
        title = title || poi.name;
        acts.push({ label: 'Read what you found', run: () => g.ui.openLore(poi.doc!) });
      }
    }
    // Notice boards, job deliveries and flags, labour (ore, timber, wheat) and homesteads.
    const jobs = g.jobs.worldTarget();
    if (jobs) {
      title = title || jobs.title;
      acts.push(...jobs.actions);
    }
    if (!acts.length) return null;
    return { title, x: p.x, y: p.y - 34, actions: acts };
  }
}

function graveText(x: number, y: number): string {
  const names = ['Eliza Merriwether, 1851–1879. Taken by the fever.', 'Unknown traveller. Rest easy.', 'Amos Kincaid. He kept his word.', 'Baby Ruth, two days old.', 'J.T. — shot over a horse. 1876.', 'Hiram Oakes, b. Ohio. Gone to grass.'];
  return names[(x * 7 + y * 13) % names.length]!;
}
