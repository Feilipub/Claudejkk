/**
 * Horse valuation. Price = breed base × age × health × training × skills ×
 * temperament × rarity (coat/pattern) × equipment × reputation × regional market.
 */
import { BALANCE } from '../data/balance.ts';
import { getBreed } from '../data/breeds.ts';
import { getCoat, PATTERN_RARITY } from '../data/coats.ts';
import { getItem } from '../data/items.ts';
import type { HorseData } from './horse.ts';
import { ageFactor, maxHealth, rawStat } from './stats.ts';

export interface PriceContext {
  /** Regional market demand for this breed, ~0.8..1.3. */
  market: number;
  /** Player reputation discount/markup multiplier at this trader, ~0.85..1.25. */
  reputation: number;
}

export interface Valuation {
  value: number;
  breakdown: { label: string; mul: number }[];
}

/** Fair value of a horse (what a knowledgeable trader thinks it's worth). */
export function appraise(h: HorseData, ctx: PriceContext = { market: 1, reputation: 1 }): Valuation {
  const breed = getBreed(h.breedId);
  const parts: { label: string; mul: number }[] = [];
  const age = ageFactor(h.age) * (h.age > 4 && h.age < 11 ? 1.05 : 0.95);
  parts.push({ label: 'Age', mul: age });
  const healthMul = 0.5 + 0.5 * (h.health / maxHealth(h)) - h.injuries.reduce((s, i) => s + i.severity, 0) / 400;
  parts.push({ label: 'Health', mul: Math.max(0.3, healthMul) });
  const tr = h.training;
  const trainMul = 0.75 + (tr.groundwork + tr.saddle + tr.speed + tr.jumping + tr.desensitised) / 500 * 0.7;
  parts.push({ label: 'Training', mul: trainMul });
  const temperMul = 0.9 + rawStat(h, 'temperament') * 0.02 + (h.traits.includes('aggressive') ? -0.1 : 0) + (h.traits.includes('calm') ? 0.05 : 0);
  parts.push({ label: 'Temperament', mul: temperMul });
  let genes = 0;
  for (const v of Object.values(h.genes)) genes += v;
  genes /= Object.keys(h.genes).length || 1;
  parts.push({ label: 'Conformation', mul: 0.6 + genes * 0.4 });
  const rarity = getCoat(h.appearance.coat).rarity * (PATTERN_RARITY[h.appearance.pattern] ?? 1);
  parts.push({ label: 'Coat rarity', mul: rarity });
  if (h.sex === 'stallion') parts.push({ label: 'Stallion', mul: 1.1 });
  if (h.tameness < 100) parts.push({ label: 'Unbroken', mul: 0.45 + h.tameness / 200 });
  parts.push({ label: 'Market', mul: ctx.market });
  parts.push({ label: 'Reputation', mul: ctx.reputation });
  let value = breed.basePrice;
  for (const p of parts) value *= p.mul;
  let gearValue = 0;
  for (const id of Object.values(h.gear)) if (id) gearValue += getItem(id).price * 0.5;
  value += gearValue;
  if (gearValue > 0) parts.push({ label: 'Tack (+$)', mul: 1 + gearValue / Math.max(1, value) });
  return { value: Math.max(5, Math.round(value)), breakdown: parts };
}

/** Price a trader asks for a horse. */
export function askingPrice(h: HorseData, ctx: PriceContext): number {
  return Math.round(appraise(h, ctx).value * BALANCE.horse.traderMarkup);
}

/** Price a trader pays the player for a horse. Stolen or wild horses fetch less. */
export function offerPrice(h: HorseData, ctx: PriceContext, stolen = false): number {
  const base = appraise(h, ctx).value * BALANCE.horse.traderBuyback;
  return Math.round(base * (stolen ? 0.4 : 1));
}
