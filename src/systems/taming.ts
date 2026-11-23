import { hisHer } from '../horse/care.ts';
/**
 * Wild horse taming. A lassoed wild horse fights the rope; the player
 * approaches and calms it (stress must come down, tameness rises), then
 * mounts and rides out the bucking by countering the horse's lean (A/D).
 * Temperament and courage decide how hard each horse is.
 */
import { clamp } from '../core/math.ts';
import type { HorseEntity } from '../entities/horse.ts';
import type { Game } from '../game.ts';
import { addHistory } from '../horse/horse.ts';
import { rawStat } from '../horse/stats.ts';

export class TamingSystem {
  game: Game;
  /** Horse currently on the rope. */
  roped: HorseEntity | null = null;
  /** Bucking minigame state. */
  breaking: { horse: HorseEntity; t: number; balance: number; lean: number; leanT: number; duration: number } | null = null;
  constructor(game: Game) {
    this.game = game;
  }

  lassoed(h: HorseEntity): void {
    const g = this.game;
    if (h.data.owner !== 'wild' && h.data.owner !== 'player') {
      g.notify(`${h.data.name} already belongs to someone.`, 'info');
      return;
    }
    if (h.data.tameness >= 100) {
      h.leading = true;
      g.notify(`You loop the rope over ${h.data.name}. Leading.`, 'horse');
      return;
    }
    this.roped = h;
    h.data.stress = clamp(h.data.stress + 30, 0, 100);
    h.brain = { state: 'tied', target: null, gait: 'halt', duration: 999, label: 'Fighting the rope' };
    h.brainTimer = 999;
    h.data.tiedAt = { x: g.player.x, y: g.player.y };
    g.notify('Roped! Approach slowly and calm the horse [E], then mount [F].', 'horse');
    g.audio.neigh(h.x, h.y, true);
  }

  /** Calming a roped wild horse: progress depends on temperament and stress. */
  calm(h: HorseEntity): string {
    const temper = rawStat(h.data, 'temperament');
    const gain = (4 + temper * 1.2) * (h.data.stress > 60 ? 0.5 : 1);
    h.data.tameness = clamp(h.data.tameness + gain, 0, 95);
    h.data.stress = clamp(h.data.stress - 12, 0, 100);
    h.data.trust = clamp(h.data.trust + 3, 0, 100);
    if (h.data.tameness >= 60) return `${h.data.name} stops pulling and lets you touch ${hisHer(h.data)} neck. Try mounting.`;
    if (h.data.tameness >= 30) return `${h.data.name} snorts, ears flicking toward your voice.`;
    return `${h.data.name} rolls an eye at you and tosses ${hisHer(h.data)} head.`;
  }

  startBreaking(h: HorseEntity): void {
    const g = this.game;
    if (h.data.tameness < 40) {
      g.notify(`${h.data.name} is too wild to mount. Calm it first.`, 'horse');
      h.rearT = 1;
      return;
    }
    const p = g.player;
    p.mount = h;
    h.rider = p;
    h.speed = 0;
    const courage = rawStat(h.data, 'courage');
    this.breaking = { horse: h, t: 0, balance: 0, lean: 1, leanT: 0, duration: 6 + courage * 0.5 + (100 - h.data.tameness) * 0.04 };
    g.notify('Hold on! Counter the lean with A / D!', 'horse');
  }

  update(dt: number): void {
    const g = this.game;
    if (this.roped && this.roped.data.tameness < 100) {
      const h = this.roped;
      // Rope follows the player; pulling hard drains player stamina.
      const d = Math.hypot(h.x - g.player.x, h.y - g.player.y);
      h.data.tiedAt = { x: g.player.x, y: g.player.y };
      if (d > 140) {
        g.notify('The rope burns through your hands — the horse is free.', 'bad');
        h.data.tiedAt = null;
        this.roped = null;
      }
    }
    const b = this.breaking;
    if (!b) return;
    b.t += dt;
    b.leanT -= dt;
    if (b.leanT <= 0) {
      b.lean = Math.random() < 0.5 ? -1 : 1;
      b.leanT = 0.5 + Math.random() * 0.7;
      b.horse.buckT = 0.6;
    }
    const inp = g.input;
    const counter = (inp.down('left') ? -1 : 0) + (inp.down('right') ? 1 : 0);
    // The horse pushes balance in its lean direction; countering pushes back.
    b.balance += (b.lean * 0.9 - counter * 1.6) * dt;
    b.balance = clamp(b.balance, -1.2, 1.2);
    g.ui.setBreakingMeter(b.balance, b.t / b.duration);
    if (Math.abs(b.balance) >= 1) {
      this.breaking = null;
      g.ui.setBreakingMeter(null, 0);
      b.horse.data.tameness = clamp(b.horse.data.tameness + 10, 0, 95);
      b.horse.throwRider(g, 'bucked you into the dirt');
      return;
    }
    if (b.t >= b.duration) {
      this.breaking = null;
      g.ui.setBreakingMeter(null, 0);
      const h = b.horse;
      if (h.data.tag === 'ranch_colt') {
        // Ranch work: the colt belongs to the Brannigan string — you're paid, not given it.
        h.data.tameness = 100;
        h.data.training.saddle = 45;
        g.player.dismount(g, false);
        h.dead = true;
        const pay = 6 + g.player.skills.level('horsemanship');
        g.player.money += pay;
        g.player.skills.gain('horsemanship', 15);
        g.player.skills.gain('riding', 10);
        g.rep.add('ranchers', 2);
        g.setFlag(`ranchwork_${g.clock.day}`, true);
        g.setFlag('ranchwork_done', ((g.flags.ranchwork_done as number) || 0) + 1);
        g.notify(`The colt settles under you. Hollis pays you ${pay} dollars.`, 'good');
        g.audio.play('coin');
        return;
      }
      h.data.tameness = 100;
      h.data.owner = 'player';
      h.data.tiedAt = null;
      h.herdId = null;
      h.data.training.saddle = Math.max(h.data.training.saddle, 20);
      h.data.trust = 40;
      addHistory(h.data, g.clock.day, 'Broken to saddle by you out on the open range.');
      if (this.roped === h) this.roped = null;
      g.adoptHorse(h);
      g.notify(`${h.data.name} has accepted you! It's yours now.`, 'good');
      g.audio.play('bond');
      g.setFlag(`tamed_${h.data.breedId}`, true);
      g.setFlag('tamed_any', true);
    }
  }
}
