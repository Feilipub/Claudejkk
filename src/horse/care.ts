/**
 * Horse needs, condition and care actions. `tickHorseNeeds` advances a horse
 * through game time whether it is on screen or not. Care actions are the
 * verbs the interaction system exposes (feed, water, brush, clean hooves,
 * treat, calm, pet) — each validates its own preconditions.
 */
import { BALANCE } from '../data/balance.ts';
import { getItem } from '../data/items.ts';
import { clamp } from '../core/math.ts';
import { addHistory, type HorseData, type InjuryKind } from './horse.ts';
import { grantBond, penalizeBond } from './bonding.ts';
import { hasTrait, maxHealth, maxStamina, traitAdd, traitMul, rawStat, gearSum } from './stats.ts';
import { L, tr } from '../core/i18n.ts';

export interface NeedsContext {
  /** Game minutes elapsed. */
  minutes: number;
  day: number;
  grazing: boolean;
  drinking: boolean;
  resting: boolean;
  stabled: boolean;
  /** Ambient temperature °F. */
  temperature: number;
  raining: boolean;
  snowing: boolean;
  sheltered: boolean;
  /** Whether the owner or another horse is within sight. */
  companionNear: boolean;
}

/** Advance needs over `ctx.minutes` of game time. */
export function tickHorseNeeds(h: HorseData, ctx: NeedsContext): void {
  const hours = ctx.minutes / 60;
  const B = BALANCE.horse;
  const endurance = rawStat(h, 'endurance');

  if (ctx.stabled) {
    h.hunger = Math.min(100, h.hunger + 30 * hours);
    h.thirst = Math.min(100, h.thirst + 30 * hours);
    h.cleanliness = Math.min(100, h.cleanliness + 4 * hours);
  } else {
    h.hunger = clamp(h.hunger - B.hungerPerHour * hours + (ctx.grazing ? 22 * hours : 0), 0, 100);
    h.thirst = clamp(h.thirst - B.thirstPerHour * hours * (ctx.temperature > 85 ? 1.6 : 1) + (ctx.drinking ? 120 * hours : 0), 0, 100);
  }
  if (ctx.raining) h.cleanliness = Math.max(0, h.cleanliness - 1.5 * hours);

  // Energy: long-term fatigue reserve.
  const restGain = (ctx.resting || ctx.stabled ? B.energyRestPerHour * 1.8 : B.energyRestPerHour * 0.5) * (0.7 + endurance * 0.05);
  h.energy = clamp(h.energy + restGain * hours * (h.hunger < 20 ? 0.4 : 1), 0, 100);

  // Health: slow natural regeneration when needs met, damage when starving.
  const mh = maxHealth(h);
  if (h.hunger <= 0 || h.thirst <= 0) {
    h.health = Math.max(1, h.health - 6 * hours);
  } else if (h.hunger > 20 && h.thirst > 20) {
    // Uninjured horses mend from scrapes within a day; resting or stabled, faster.
    h.health = Math.min(mh, h.health + (ctx.stabled ? 14 : ctx.resting ? 9 : 5) * hours);
  }

  // Cold: blankets and shelter protect.
  const warmth = gearSum(h, 'warmth') * 15 + (ctx.sheltered || ctx.stabled ? 25 : 0);
  const feltTemp = ctx.temperature + warmth - (ctx.raining || ctx.snowing ? 8 : 0);
  if (feltTemp < 22) {
    h.stress = clamp(h.stress + (22 - feltTemp) * 0.2 * hours, 0, 100);
    h.energy = clamp(h.energy - (22 - feltTemp) * 0.15 * hours, 0, 100);
  }

  // Loneliness (social horses) / companionship.
  const lonely = traitAdd(h, 'lonely');
  if (!ctx.companionNear && lonely > 0) h.stress = clamp(h.stress + lonely * 60 * hours, 0, 100);

  // Injuries heal over time; treated and stabled heal faster; bad conditions slow it.
  const healRate = (ctx.stabled ? 3 : 1) * (ctx.resting ? 1.5 : 1) * (h.hunger > 40 && h.thirst > 40 ? 1 : 0.3);
  for (const inj of h.injuries) {
    const rate = (inj.treated ? 6 : 2) * healRate;
    inj.severity -= rate * hours;
    if (!inj.treated && (inj.kind === 'cut' || inj.kind === 'gunshot')) h.health = Math.max(1, h.health - 1.2 * hours);
  }
  h.injuries = h.injuries.filter((i) => i.severity > 0);

  // Stamina regen while not ridden.
  h.stamina = Math.min(maxStamina(h), h.stamina + 40 * hours * 60 * 0.02);

  // Trust drifts back toward a neutral level over days.
  h.trust = clamp(h.trust + (50 - h.trust) * 0.01 * hours, 0, 100);
}

/** Once per game day: neglect and good-care review. Returns a message or null. */
export function dailyCareReview(h: HorseData, day: number): string | null {
  if (h.owner !== 'player') return null;
  const neglected = h.hunger < 15 || h.thirst < 15 || h.cleanliness < 15 || h.injuries.some((i) => !i.treated && i.severity > 40);
  if (neglected) {
    penalizeBond(h, 'neglectDay');
    addHistory(h, day, 'Went hungry, thirsty or untended.');
    return tr`${h.name} is suffering from neglect. Your bond weakens.`;
  }
  if (h.hunger > 55 && h.thirst > 55 && h.cleanliness > 55 && h.hoof > 50) {
    grantBond(h, 'wellCaredDay', day);
    return null;
  }
  return null;
}

/** Apply an injury, respecting health stat (hardier horses take less). */
export function injure(h: HorseData, kind: InjuryKind, severity: number, day: number, cause: string): void {
  const resist = 1.3 - rawStat(h, 'health') * 0.06;
  const sev = clamp(severity * resist, 1, 100);
  const existing = h.injuries.find((i) => i.kind === kind);
  if (existing) {
    existing.severity = Math.min(100, existing.severity + sev * 0.6);
    existing.treated = false;
  } else {
    h.injuries.push({ kind, severity: sev, treated: false, day });
  }
  h.health = Math.max(0, h.health - sev * 0.5);
  addHistory(h, day, `Injured: ${INJURY_NAMES[kind]} (${cause}).`);
}

export const INJURY_NAMES: Record<InjuryKind, string> = {
  cut: 'laceration',
  limp: 'lameness',
  strain: 'tendon strain',
  bruise: 'bruising',
  stoneBruise: 'stone bruise',
  gunshot: 'gunshot wound',
  colic: 'colic',
};

export interface CareResult {
  ok: boolean;
  message: string;
  bondGained?: number;
  /** Animation key the presentation layer should play. */
  anim?: string;
}

/** Feed an item from the player's inventory. Caller removes the item on ok. */
export function feedHorse(h: HorseData, itemId: string, day: number): CareResult {
  const it = getItem(itemId);
  if (it.category !== 'horseFood') return { ok: false, message: tr`${h.name} won't eat that.` };
  const e = it.effects ?? {};
  if (h.hunger > 96 && itemId === 'hay') return { ok: false, message: tr`${h.name} isn't hungry.` };
  h.hunger = Math.min(100, h.hunger + (e.horseHunger ?? 0));
  h.stamina = Math.min(maxStamina(h), h.stamina + (e.horseStamina ?? 0));
  h.stress = clamp(h.stress + (e.horseStress ?? 0), 0, 100);
  const fav = itemId === h.favoriteFood;
  const r = grantBond(h, fav ? 'feedFavorite' : 'feed', day);
  return { ok: true, message: fav ? tr`${h.name} loves ${L(it.name).toLowerCase()} — ears forward, nickering.` : tr`${h.name} eats the ${L(it.name).toLowerCase()}.`, bondGained: r.gained, anim: 'eat' };
}

export function waterHorse(h: HorseData, day: number): CareResult {
  if (h.thirst > 95) return { ok: false, message: tr`${h.name} sniffs the water and turns away.` };
  h.thirst = 100;
  const r = grantBond(h, 'water', day);
  return { ok: true, message: tr`${h.name} drinks deeply.`, bondGained: r.gained, anim: 'drink' };
}

export function brushHorse(h: HorseData, day: number): CareResult {
  if (h.cleanliness > 92) {
    const r = grantBond(h, 'pet', day, 0.5);
    return { ok: true, message: tr`${h.name} is already clean, but leans into the brush.`, bondGained: r.gained, anim: 'brush' };
  }
  h.cleanliness = 100;
  h.stress = Math.max(0, h.stress - 10 * traitMul(h, 'affection'));
  const r = grantBond(h, 'brush', day);
  return { ok: true, message: tr`You brush the dust and sweat out of ${h.name}'s coat.`, bondGained: r.gained, anim: 'brush' };
}

export function cleanHooves(h: HorseData, day: number): CareResult {
  const lameStone = h.injuries.find((i) => i.kind === 'stoneBruise');
  if (h.hoof > 90 && !lameStone) return { ok: false, message: tr`${h.name}'s hooves are clean.` };
  h.hoof = Math.min(100, h.hoof + 45);
  if (lameStone) lameStone.severity = Math.max(0, lameStone.severity - 30);
  const r = grantBond(h, 'cleanHooves', day);
  return { ok: true, message: lameStone ? tr`You pry a sharp stone from ${h.name}'s hoof.` : tr`You pick the packed dirt from ${h.name}'s hooves.`, bondGained: r.gained, anim: 'hoof' };
}

/** Treat injuries with bandage / ointment / liniment. */
export function treatHorse(h: HorseData, itemId: string, day: number): CareResult {
  const it = getItem(itemId);
  const heal = it.effects?.horseHeal ?? 0;
  if (heal <= 0 && !it.effects?.horseHealth) return { ok: false, message: tr`That won't help ${h.name}.` };
  const untreated = h.injuries.filter((i) => !i.treated || i.severity > 0);
  h.health = Math.min(maxHealth(h), h.health + (it.effects?.horseHealth ?? 0));
  h.stamina = Math.min(maxStamina(h), h.stamina + (it.effects?.horseStamina ?? 0));
  if (untreated.length === 0) return { ok: true, message: tr`${h.name} perks up.`, anim: 'treat' };
  // Liniment is best for legs, ointment/bandage for wounds.
  for (const inj of untreated) {
    const legItem = itemId === 'horseLiniment';
    const legInj = inj.kind === 'limp' || inj.kind === 'strain' || inj.kind === 'stoneBruise' || inj.kind === 'bruise';
    const eff = legItem === legInj ? 1 : 0.5;
    inj.severity = Math.max(0, inj.severity - heal * eff * 0.5);
    inj.treated = true;
  }
  h.injuries = h.injuries.filter((i) => i.severity > 0);
  const r = grantBond(h, 'treatInjury', day);
  addHistory(h, day, `You treated ${h.name}'s injuries.`);
  return { ok: true, message: tr`You dress ${h.name}'s wounds. ${L(h.sex === 'mare' ? 'She' : 'He')} will still need rest to heal.`, bondGained: r.gained, anim: 'treat' };
}

/** Soothing voice and hands. Works best when the horse is stressed. */
export function calmHorse(h: HorseData, day: number): CareResult {
  if (h.stress < 15) {
    const r = grantBond(h, 'pet', day, 0.5);
    return { ok: true, message: tr`${h.name} is already at ease.`, bondGained: r.gained, anim: 'pet' };
  }
  const amount = 25 * traitMul(h, 'calmRate') * traitMul(h, 'affection');
  h.stress = Math.max(0, h.stress - amount);
  const r = grantBond(h, 'calm', day);
  return { ok: true, message: tr`You speak low and steady. ${h.name}'s breathing slows.`, bondGained: r.gained, anim: 'pet' };
}

export function petHorse(h: HorseData, day: number): CareResult {
  if (traitAdd(h, 'aggression') > 0.3 && h.trust < 30) {
    penalizeBond(h, 'gunfireNearHead', 0.5);
    return { ok: false, message: tr`${h.name} pins ${L(hisHer(h))} ears and swings ${L(hisHer(h))} head at you.`, anim: 'threat' };
  }
  h.stress = Math.max(0, h.stress - 5 * traitMul(h, 'affection'));
  const r = grantBond(h, 'pet', day, traitMul(h, 'affection'));
  const reactions = hasTrait(h, 'independent')
    ? tr`${h.name} tolerates the attention.`
    : hasTrait(h, 'loyal') || hasTrait(h, 'social')
      ? tr`${h.name} nudges your shoulder, asking for more.`
      : tr`${h.name} lowers ${L(hisHer(h))} head into your hand.`;
  return { ok: true, message: reactions, bondGained: r.gained, anim: 'pet' };
}

/** Condition summary for UI. */
export function conditionWords(h: HorseData): string[] {
  const out: string[] = [];
  if (h.hunger < 30) out.push('Hungry');
  if (h.thirst < 30) out.push('Thirsty');
  if (h.cleanliness < 35) out.push('Dirty');
  if (h.hoof < 40) out.push('Hooves need care');
  if (h.energy < 30) out.push('Exhausted');
  if (h.stress > 60) out.push('Agitated');
  for (const i of h.injuries) out.push(`${INJURY_NAMES[i.kind]}${i.treated ? ' (treated)' : ''}`);
  if (out.length === 0) out.push('In fine condition');
  return out;
}

/** Possessive pronoun for a horse: a named horse is a he or a she, never an "it". */
export function hisHer(h: { sex: string }): string {
  return h.sex === 'mare' || h.sex === 'filly' ? 'her' : 'his';
}
