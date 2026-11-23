/**
 * Autonomous horse behaviour: a utility-scored state machine. Each decision
 * scores candidate behaviours from needs, personality, bond, weather, time of
 * day and perceived threats; interrupts (gunfire, predators) pre-empt it.
 * Pure logic over a `HorseSenses` snapshot so it is unit-testable.
 */
import { Rng } from '../core/rng.ts';
import type { HorseData } from './horse.ts';
import { bondLevel, hasTrait, rideStats, traitAdd, traitMul } from './stats.ts';

export type BrainState =
  | 'idle' | 'graze' | 'drink' | 'wander' | 'rest' | 'sleep' | 'follow' | 'lead' | 'come' | 'flee' | 'spooked'
  | 'tied' | 'investigate' | 'socialize' | 'shelter' | 'herd' | 'corral';

export interface Point {
  x: number;
  y: number;
}

export interface HorseSenses {
  x: number;
  y: number;
  owner: (Point & { dist: number; mounted: boolean }) | null;
  /** Strongest current threat (predator, gunfire, hostile) with fear level 0..1+. */
  threat: (Point & { level: number; kind: string }) | null;
  water: Point | null;
  canGrazeHere: boolean;
  shelter: Point | null;
  otherHorse: Point | null;
  /** Something novel to investigate (curious horses). */
  novelty: Point | null;
  night: boolean;
  storm: boolean;
  tied: boolean;
  /** Owner asked us to follow on a lead. */
  leading: boolean;
  /** Owner whistled recently. */
  called: boolean;
  /** Bounds the horse must stay inside (corral), if any. */
  pen: { x: number; y: number; w: number; h: number } | null;
  /** Herd leader position for wild horses. */
  herdLeader: Point | null;
}

export interface BrainDecision {
  state: BrainState;
  target: Point | null;
  /** Movement gait while executing. */
  gait: 'halt' | 'walk' | 'trot' | 'canter' | 'gallop';
  /** Seconds before re-deciding (unless interrupted). */
  duration: number;
  /** Status line for UI ("Grazing", "Spooked by wolves"). */
  label: string;
}

const LABELS: Record<BrainState, string> = {
  idle: 'Standing quietly',
  graze: 'Grazing',
  drink: 'Drinking',
  wander: 'Wandering',
  rest: 'Resting',
  sleep: 'Sleeping',
  follow: 'Following you',
  lead: 'On the lead',
  come: 'Coming to your whistle',
  flee: 'Fleeing',
  spooked: 'Spooked!',
  tied: 'Tied up',
  investigate: 'Investigating something',
  socialize: 'With the other horses',
  shelter: 'Seeking shelter',
  herd: 'With the herd',
  corral: 'In the corral',
};

/** How frightened the horse is by a threat (0 = not at all). */
export function fearResponse(h: HorseData, threatLevel: number): number {
  return threatLevel * rideStats(h).fear;
}

/** Decide the next behaviour. */
export function decide(h: HorseData, s: HorseSenses, rng: Rng): BrainDecision {
  const mk = (state: BrainState, target: Point | null, gait: BrainDecision['gait'], duration: number, label?: string): BrainDecision => ({
    state,
    target,
    gait,
    duration,
    label: label ?? LABELS[state],
  });
  const bond = bondLevel(h);
  const obedience = rideStats(h).obedience;

  // --- Interrupt layer ------------------------------------------------------
  if (s.threat) {
    const fear = fearResponse(h, s.threat.level) + h.stress / 120;
    if (fear > 0.55) {
      // Brave/bonded horses near their owner stand their ground more often.
      const holdGround = s.owner && s.owner.dist < 60 && bond >= 3 && rng.chance(0.35 + bond * 0.08);
      if (s.tied) return mk('spooked', null, 'halt', 1.2, `Pulling at the rope — ${s.threat.kind}!`);
      if (!holdGround) {
        const dx = s.x - s.threat.x;
        const dy = s.y - s.threat.y;
        const d = Math.hypot(dx, dy) || 1;
        const run = 260 + fear * 120;
        // Loyal, bonded horses bolt towards the owner instead of away blindly.
        if (s.owner && bond >= 4 && hasTrait(h, 'loyal')) return mk('flee', { x: s.owner.x, y: s.owner.y }, 'gallop', 3, `Running to you from the ${s.threat.kind}`);
        if (rng.chance(0.3)) return mk('spooked', null, 'halt', 1.0, `Rearing at the ${s.threat.kind}!`);
        return mk('flee', { x: s.x + (dx / d) * run, y: s.y + (dy / d) * run }, 'gallop', 3 + fear, `Bolting from the ${s.threat.kind}`);
      }
      return mk('idle', null, 'halt', 1.5, `Watching the ${s.threat.kind} warily`);
    }
  }
  if (s.tied) {
    if (h.hunger < 60 && s.canGrazeHere && rng.chance(0.6)) return mk('graze', null, 'halt', rng.range(4, 9), 'Grazing at the hitch');
    return mk('tied', null, 'halt', rng.range(3, 7));
  }
  if (s.called && s.owner && !s.owner.mounted) {
    // Obedience and bond decide whether it actually comes.
    const willing = rng.chance(Math.min(0.98, 0.45 + obedience * 0.55 + (hasTrait(h, 'loyal') ? 0.1 : 0)));
    if (willing) return mk('come', { x: s.owner.x, y: s.owner.y }, s.owner.dist > 200 ? 'gallop' : s.owner.dist > 80 ? 'canter' : 'trot', 12);
    return mk('idle', null, 'halt', 2, 'Ignoring your whistle');
  }
  if (s.leading && s.owner) return mk('lead', { x: s.owner.x, y: s.owner.y }, 'walk', 0.4);

  // --- Utility layer ----------------------------------------------------------
  const scores: [BrainState, number][] = [];
  const hungry = 1 - h.hunger / 100;
  const thirsty = 1 - h.thirst / 100;
  const tired = 1 - h.energy / 100;
  scores.push(['graze', s.canGrazeHere ? hungry * 1.4 + 0.15 : 0]);
  scores.push(['drink', s.water ? thirsty * 1.6 : 0]);
  scores.push(['rest', tired * 1.1 + (hasTrait(h, 'lazy') ? 0.25 : 0)]);
  scores.push(['sleep', s.night ? 0.5 + tired * 0.8 : 0]);
  scores.push(['idle', 0.25]);
  scores.push(['wander', s.pen ? 0.2 : traitMul(h, 'wander') * 0.45]);
  scores.push(['investigate', s.novelty && hasTrait(h, 'curious') ? 0.8 : s.novelty ? 0.15 : 0]);
  scores.push(['socialize', s.otherHorse && traitAdd(h, 'lonely') > 0 ? 0.6 : s.otherHorse ? 0.15 : 0]);
  scores.push(['shelter', s.storm && s.shelter ? 1.0 : 0]);
  if (s.herdLeader) scores.push(['herd', 0.9]);
  if (s.owner && h.owner === 'player' && !s.pen) {
    const slack = rideStats(h).obedience > 0.4 ? h.traits.reduce((m, t) => Math.min(m, t === 'loyal' ? 3 : t === 'independent' ? 10 : 6), 6) : 10;
    const tooFar = s.owner.dist > slack * 16 + 60;
    scores.push(['follow', tooFar && bond >= 2 && !s.owner.mounted ? 0.5 + bond * 0.15 : 0]);
  }
  for (const sc of scores) sc[1] *= rng.range(0.85, 1.15);
  scores.sort((a, b) => b[1] - a[1]);
  const pick = scores[0]![0];
  switch (pick) {
    case 'graze':
      return mk('graze', null, 'halt', rng.range(6, 16));
    case 'drink':
      return mk('drink', s.water, 'walk', 8);
    case 'rest':
      return mk('rest', null, 'halt', rng.range(8, 20));
    case 'sleep':
      return mk('sleep', null, 'halt', rng.range(15, 30));
    case 'wander': {
      const r = 40 + rng.range(0, 90);
      const a = rng.range(0, Math.PI * 2);
      let t = { x: s.x + Math.cos(a) * r, y: s.y + Math.sin(a) * r };
      if (s.pen) t = { x: s.pen.x + rng.range(8, s.pen.w - 8), y: s.pen.y + rng.range(8, s.pen.h - 8) };
      return mk('wander', t, 'walk', 10);
    }
    case 'investigate':
      return mk('investigate', s.novelty, 'walk', 8);
    case 'socialize':
      return mk('socialize', s.otherHorse, 'walk', 8);
    case 'shelter':
      return mk('shelter', s.shelter, 'trot', 15);
    case 'herd':
      return mk('herd', s.herdLeader, 'walk', 4);
    case 'follow':
      return mk('follow', s.owner ? { x: s.owner.x, y: s.owner.y } : null, s.owner && s.owner.dist > 200 ? 'canter' : 'walk', 3);
    default:
      return mk('idle', null, 'halt', rng.range(3, 8));
  }
}
