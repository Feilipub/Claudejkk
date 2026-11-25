/**
 * Activities woven into the world: horse races against AI rivals over real
 * road checkpoints, quick-draw duels, fishing with a bite/reel minigame,
 * blackjack at saloon tables, horse training sessions at stables,
 * prospecting at mine adits and safe-cracking.
 */
import { Rng } from '../core/rng.ts';
import { clamp } from '../core/math.ts';
import { HorseEntity } from '../entities/horse.ts';
import { completeLook, type Npc } from '../entities/npc.ts';
import type { Game } from '../game.ts';
import { grantBond } from '../horse/bonding.ts';
import { generateHorse } from '../horse/generator.ts';
import { L, tr } from '../core/i18n.ts';

interface RaceDef {
  id: string;
  name: string;
  checkpoints: [number, number][];
  entry: number;
  purse: number;
  rivals: { name: string; breedId: string; skill: number }[];
}

export const RACES: RaceDef[] = [
  {
    id: 'larkspur_cup',
    name: 'The Larkspur Cup',
    checkpoints: [[404, 385], [440, 389], [478, 396], [520, 399], [500, 380], [470, 360], [430, 352], [395, 362], [378, 384]],
    entry: 5,
    purse: 40,
    rivals: [
      { name: 'Dell Ashby on Tinder', breedId: 'quarter', skill: 0.85 },
      { name: 'Ines Garza on Sorghum', breedId: 'paint', skill: 0.8 },
      { name: 'Kit Holloway on Rattler', breedId: 'thoroughbred', skill: 0.75 },
    ],
  },
  {
    id: 'ashby_derby',
    name: 'The Ashby Derby',
    checkpoints: [[575, 398], [545, 405], [520, 397], [545, 385], [575, 380], [600, 396]],
    entry: 15,
    purse: 120,
    rivals: [
      { name: 'Ellery Vance\'s jockey on Meridian', breedId: 'thoroughbred', skill: 0.95 },
      { name: 'Lorenzo Reyes on Arroyo', breedId: 'arabian', skill: 0.9 },
      { name: 'Ida Crowe on Velvet', breedId: 'thoroughbred', skill: 0.85 },
    ],
  },
];

type State =
  | { kind: 'race'; race: RaceDef; t: number; countdown: number; playerCp: number; rivals: { h: HorseEntity; cp: number; skill: number; done: number }[]; finished: string[] }
  | { kind: 'duel'; npc: Npc; t: number; signal: number; fired: boolean; npcReact: number; done: boolean }
  | { kind: 'fishing'; t: number; phase: 'wait' | 'bite' | 'reel'; biteAt: number; tension: number; progress: number }
  | null;

export class Activities {
  game: Game;
  state: State = null;
  rng = new Rng(2024);
  constructor(game: Game) {
    this.game = game;
  }

  get busy(): boolean {
    return this.state !== null;
  }

  start(kind: string, npcId?: string): void {
    const g = this.game;
    switch (kind) {
      case 'race':
        this.startRace(npcId === 'ashby' || g.currentRegion === 'blackwater' ? 'ashby_derby' : 'larkspur_cup');
        break;
      case 'blackjack':
      case 'poker':
        g.ui.openBlackjack();
        break;
      case 'fishing':
        if (!g.player.inv.has('fishingRod')) {
          g.notify('You need a fishing rod.', 'info');
          return;
        }
        this.state = { kind: 'fishing', t: 0, phase: 'wait', biteAt: this.rng.range(2.5, 9), tension: 0, progress: 0 };
        g.notify('You cast your line… wait for a bite, then press E.', 'info');
        break;
      case 'shooting':
        g.notify('The shooting gallery is closed for repairs.', 'info');
        break;
      case 'training':
        g.ui.openTraining();
        break;
      case 'duel':
        if (npcId) this.startDuel(npcId);
        break;
    }
  }

  startRace(id: string): void {
    const g = this.game;
    const race = RACES.find((r) => r.id === id)!;
    const p = g.player;
    if (!p.mount || p.mount.data.owner !== 'player') {
      g.notify('You need to be mounted on your own horse to race.', 'info');
      return;
    }
    if (p.money < race.entry) {
      g.notify(tr`The entry fee is ${race.entry} dollars.`, 'info');
      return;
    }
    p.money -= race.entry;
    const [sx, sy] = race.checkpoints[race.checkpoints.length - 1]!;
    g.teleportPlayer(sx * 16 + 8, sy * 16 + 8);
    const rivals = race.rivals.map((rv, i) => {
      const h = generateHorse(9000 + i * 31 + id.length, { breedId: rv.breedId, training: 'trained', owner: 'npc', name: rv.name.split(' on ')[1] });
      h.x = sx * 16 + 8 + (i + 1) * 14;
      h.y = sy * 16 + 8 + ((i % 2) * 2 - 1) * 12;
      h.gear = { saddle: 'saddleRacing', bridle: 'bridleSnaffle' };
      const he = new HorseEntity(h);
      he.externallyDriven = true;
      he.npcRiderLook = completeLook({}, new Rng(i + 7), 'cowhand');
      he.heading = Math.atan2(race.checkpoints[0]![1] * 16 - h.y, race.checkpoints[0]![0] * 16 - h.x);
      g.addEntity(he);
      return { h: he, cp: 0, skill: rv.skill, done: 0 };
    });
    this.state = { kind: 'race', race, t: 0, countdown: 3.5, playerCp: 0, rivals, finished: [] };
    g.notify(tr`${L(race.name)}! Ride through every flag. Purse: ${race.purse} dollars.`, 'quest');
  }

  startDuel(npcId: string): void {
    const g = this.game;
    const n = g.entityById(npcId) as Npc | null;
    if (!n) return;
    const p = g.player;
    if (p.mount) p.dismount(g, false);
    if (!p.weapons.some((w) => w.startsWith('revolver'))) {
      g.notify('You need a revolver to duel.', 'bad');
      return;
    }
    p.weaponIdx = p.weapons.findIndex((w) => w.startsWith('revolver'));
    p.holstered = true;
    n.setState('duel');
    n.hostile = false;
    // Square off at 70 px.
    const a = Math.atan2(n.y - p.y, n.x - p.x);
    n.x = p.x + Math.cos(a) * 70;
    n.y = p.y + Math.sin(a) * 70;
    this.state = { kind: 'duel', npc: n, t: 0, signal: this.rng.range(2.5, 5), fired: false, npcReact: 0.45 - (n.combat?.accuracy ?? 0.5) * 0.2 + this.rng.range(0, 0.15), done: false };
    g.ui.banner('Steady… wait for DRAW, then aim and fire (click on them).', 3);
  }

  update(dt: number): void {
    const s = this.state;
    if (!s) return;
    const g = this.game;
    if (s.kind === 'race') this.updateRace(s, dt);
    else if (s.kind === 'duel') {
      s.t += dt;
      const p = g.player;
      const n = s.npc;
      if (!s.done && s.t >= s.signal && s.t - dt < s.signal) {
        g.ui.banner('DRAW!', 1);
        g.audio.play('bell');
      }
      if (!s.done && g.input.pressed('fire')) {
        if (s.t < s.signal) {
          s.done = true;
          g.ui.banner('You drew early. There\'s no honor in that.', 3);
          g.rep.add('honor', -5);
          n.hostile = true;
          n.setState('combat');
          this.state = null;
          return;
        }
        p.holstered = false;
        const m = g.mouseWorld();
        const onTarget = Math.hypot(m.x - n.x, m.y - (n.y - 10)) < 14;
        const reaction = s.t - s.signal;
        g.audio.gunshot(p.x, p.y, 'revolver');
        if (onTarget && reaction < s.npcReact + 0.25) {
          s.done = true;
          g.ui.banner(tr`You were faster. (${reaction.toFixed(2)}s)`, 3);
          n.health = 1;
          n.setState('surrender');
          n.say('Ugh… you got me. It\'s done.');
          g.setFlag(`duel_won_${n.id}`, true);
          g.player.skills.gain('shooting', 30);
          this.state = null;
          return;
        }
      }
      if (!s.done && s.t >= s.signal + s.npcReact + 0.25) {
        s.done = true;
        g.audio.gunshot(n.x, n.y, 'revolver');
        g.ui.banner('Too slow.', 2);
        p.damage(55, g, `${n.name} in a duel`);
        n.hostile = true;
        n.setState('combat');
        this.state = null;
      }
    } else if (s.kind === 'fishing') this.updateFishing(s, dt);
  }

  private updateRace(s: Extract<State, { kind: 'race' }>, dt: number): void {
    const g = this.game;
    const cps = s.race.checkpoints;
    const p = g.player;
    if (s.countdown > 0) {
      s.countdown -= dt;
      g.ui.banner(s.countdown > 0.5 ? String(Math.ceil(s.countdown - 0.5)) : L('GO!'), 0.3);
      if (p.mount) p.mount.speed = 0;
      return;
    }
    s.t += dt;
    const cp = cps[s.playerCp];
    if (cp && Math.hypot(p.x - cp[0] * 16, p.y - cp[1] * 16) < 48) {
      s.playerCp++;
      g.audio.play('ui');
      if (s.playerCp >= cps.length) s.finished.push('you');
    }
    for (const r of s.rivals) {
      if (!r.h.npcRiderLook) continue;
      if (r.cp >= cps.length) {
        r.h.driveTo(r.h.x, r.h.y, 'halt', dt, g);
        continue;
      }
      const c = cps[r.cp]!;
      // Rivals pace their horses: gallop when stamina allows, canter to recover.
      const gait = r.h.data.stamina > 25 * (1.2 - r.skill) ? 'gallop' : 'canter';
      const d = r.h.driveTo(c[0] * 16 + 8, c[1] * 16 + 8, gait, dt * (0.9 + r.skill * 0.12), g);
      if (d < 40) {
        r.cp++;
        if (r.cp >= cps.length) s.finished.push(r.h.data.name);
      }
    }
    const markers = s.playerCp < cps.length ? [cps[s.playerCp]!] : [];
    g.raceMarkers = markers.map(([x, y]) => ({ x: x * 16 + 8, y: y * 16 + 8 }));
    const pos = 1 + s.rivals.filter((r) => r.cp > s.playerCp).length;
    g.ui.banner(tr`Flag ${Math.min(s.playerCp + 1, cps.length)}/${cps.length} · Position ${pos} · ${s.t.toFixed(1)}s`, 0.3);
    if (s.finished.includes('you') || s.t > 240) {
      const place = s.finished.indexOf('you') + 1;
      if (place === 1) {
        p.money += s.race.purse;
        g.setFlag(`race_won_${s.race.id}`, true);
        g.ui.banner(tr`You won ${L(s.race.name)}! +${s.race.purse} dollars`, 4);
        if (p.mount) grantBond(p.mount.data, 'stressSurvived', g.clock.day);
        g.rep.add('townsfolk', 4);
        g.audio.play('quest');
      } else g.ui.banner(place ? `You finished ${['', 'first', 'second', 'third', 'fourth'][place]}.` : 'Race abandoned.', 4);
      for (const r of s.rivals) r.h.dead = true;
      g.raceMarkers = [];
      this.state = null;
    }
  }

  private updateFishing(s: Extract<State, { kind: 'fishing' }>, dt: number): void {
    const g = this.game;
    const inp = g.input;
    s.t += dt;
    if (Math.hypot(g.player.vx, g.player.vy) > 10) {
      this.state = null;
      g.ui.setFishing(null);
      g.notify('You reel in your line.', 'info');
      return;
    }
    if (s.phase === 'wait') {
      g.ui.setFishing({ phase: 'Waiting for a bite…', tension: 0, progress: 0 });
      if (s.t >= s.biteAt) {
        s.phase = 'bite';
        s.t = 0;
        g.audio.play('splash');
      }
    } else if (s.phase === 'bite') {
      g.ui.setFishing({ phase: 'BITE! Press E!', tension: 0, progress: 0 });
      if (inp.pressed('interact')) {
        s.phase = 'reel';
        s.t = 0;
      } else if (s.t > 0.9) {
        s.phase = 'wait';
        s.t = 0;
        s.biteAt = this.rng.range(2, 7);
        g.notify('It got away.', 'info');
      }
    } else {
      const reeling = inp.down('interact');
      const pull = 0.5 + Math.sin(s.t * 3.1) * 0.5 + (this.rng.chance(dt) ? 0.8 : 0);
      s.tension = clamp(s.tension + (reeling ? 0.9 : -0.8) * dt + pull * dt * 0.6, 0, 1.05);
      if (reeling && s.tension < 0.95) s.progress += dt * 0.28;
      g.ui.setFishing({ phase: 'Hold E to reel — don\'t snap the line!', tension: s.tension, progress: s.progress });
      if (s.tension >= 1) {
        g.notify('Snap! The line breaks.', 'bad');
        this.state = null;
        g.ui.setFishing(null);
      } else if (s.progress >= 1) {
        const region = g.currentRegion;
        const fish = region === 'sierra' || region === 'pinehollow' ? 'fishTrout' : region === 'blackwater' ? (this.rng.chance(0.5) ? 'fishCatfish' : 'fishBass') : 'fishBass';
        g.giveItem(fish, 1);
        g.setFlag('fishing_caught', true);
        g.player.skills.gain('survival', 5);
        this.state = null;
        g.ui.setFishing(null);
      }
    }
  }

  prospect(key: string): void {
    const g = this.game;
    const day = g.clock.day;
    if (g.flags[`prospect_${key}`] === day) {
      g.notify('You\'ve picked this seam clean for today.', 'info');
      return;
    }
    g.setFlag(`prospect_${key}`, day);
    g.advanceTime(60);
    g.player.act(2);
    const r = this.rng.next();
    if (r < 0.15) g.giveItem('goldNugget', 1);
    else if (r < 0.65) g.giveItem('silverOre', this.rng.int(1, 3));
    else g.notify('An hour of chipping and nothing but quartz.', 'info');
  }

  crackSafe(key: string): void {
    const g = this.game;
    if (g.flags[`safe_${key}`]) {
      g.notify('Already emptied.', 'info');
      return;
    }
    g.player.inv.remove('lockpick');
    if (this.rng.chance(0.55)) {
      g.setFlag(`safe_${key}`, true);
      g.giveItem('lockbox', 1);
      g.player.money += 25;
      g.law.reportCrime('robbery', g.player.x, g.player.y);
    } else g.notify('The pick snaps in the tumblers.', 'bad');
  }
}
