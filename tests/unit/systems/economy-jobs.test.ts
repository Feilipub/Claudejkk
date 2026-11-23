// Formulas and data for jobs, regional trade and homesteads.
// Design: design/gdd/economy-jobs.md (§ Formulas, § Acceptance Criteria).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../../../src/data/balance.ts';
import { ITEMS, getItem } from '../../../src/data/items.ts';
import {
  BAR_ORDERS, BAR_POURS, BOUNTY_CAMPS, JOB_BOARDS, JOB_TEMPLATES, LAND_OFFICES, OCCUPATION_WORK, PLOTS, TRADE_GOODS, TRADE_POSTS, UPGRADES, WORK_ACTIONS,
  type JobTemplate,
} from '../../../src/data/jobs.ts';
import { SHOPS } from '../../../src/data/shops.ts';
import { SETTLEMENTS } from '../../../src/data/world.ts';
import { O } from '../../../src/world/tiles.ts';
import { Reputation } from '../../../src/systems/reputation.ts';
import {
  Economy, basePay, dailyPlotTick, deliveryDeadline, deliveryPerformance, hourlyRate, jobPay, payMultiplier, regionalPriceMul,
  rollBoardOffers, saturationFactor, saturationKey, strikeGauge, strikePerformance, tileDistance, type OwnedPlot, type PayContext,
} from '../../../src/systems/economy.ts';
import type { Game } from '../../../src/game.ts';

/** Skill 1, no reputation, no standing, average demand, a job done properly. */
const NEUTRAL: PayContext = { skillLevel: 1, rep: 0, standing: 0, demand: 1, perf: 1 };
const tpl = (id: string): JobTemplate => JOB_TEMPLATES.find((t) => t.id === id)!;
const boardTiles = (): Record<string, { x: number; y: number }> =>
  Object.fromEntries(JOB_BOARDS.map((b) => { const s = SETTLEMENTS.find((x) => x.id === b.settlementId)!; return [b.settlementId, { x: s.x, y: s.y }]; }));

/** An Economy over a stub game: only reputation and the clock are read by prices. */
function economyAt(honor = 0): Economy {
  const rep = new Reputation();
  rep.values.honor = honor;
  return new Economy({ rep, clock: { day: 1 } } as unknown as Game);
}

// --- Pay -------------------------------------------------------------------------------------

test('jobPay at a neutral context equals base + perUnit × units + perTile × tiles', () => {
  const t = tpl('freight');
  assert.equal(jobPay(t, 1, 200, NEUTRAL), Math.round((0.15 + 0.0014 * 200) * 100) / 100);
  assert.ok(Math.abs(basePay(tpl('cattle_drive'), 5, 0) - (0.3 + 0.11 * 5)) < 1e-9);
});

test('payMultiplier: skill adds skillStep per level above 1 and is capped at level 6', () => {
  assert.equal(payMultiplier({ ...NEUTRAL, skillLevel: 1 }), 1);
  assert.ok(Math.abs(payMultiplier({ ...NEUTRAL, skillLevel: 6 }) - (1 + 5 * BALANCE.jobs.skillStep)) < 1e-9);
  assert.equal(payMultiplier({ ...NEUTRAL, skillLevel: 9 }), payMultiplier({ ...NEUTRAL, skillLevel: 6 }));
});

test('payMultiplier: reputation is clamped to [repMin, repMax]', () => {
  assert.equal(payMultiplier({ ...NEUTRAL, rep: -100 }), BALANCE.jobs.repMin);
  assert.equal(payMultiplier({ ...NEUTRAL, rep: 100 }), BALANCE.jobs.repMax);
  assert.ok(Math.abs(payMultiplier({ ...NEUTRAL, rep: 20 }) - 1.1) < 1e-9);
});

test('payMultiplier: the product of all multipliers never exceeds maxMul', () => {
  const best = payMultiplier({ skillLevel: 6, rep: 100, standing: 99, demand: BALANCE.jobs.demandMax, perf: 5 });
  assert.equal(best, BALANCE.jobs.maxMul);
});

test('payMultiplier: performance is clamped to [perfMin, perfMax]', () => {
  assert.equal(payMultiplier({ ...NEUTRAL, perf: 0 }), BALANCE.jobs.perfMin);
  assert.equal(payMultiplier({ ...NEUTRAL, perf: 9 }), BALANCE.jobs.perfMax);
});

// --- Deliveries ------------------------------------------------------------------------------

test('deliveryDeadline is grace + tiles × minutesPerTile, express is tighter', () => {
  assert.equal(deliveryDeadline(200, 'normal'), Math.round(BALANCE.jobs.deliveryGrace.normal! + 200 * BALANCE.jobs.minutesPerTile.normal!));
  assert.ok(deliveryDeadline(200, 'express') < deliveryDeadline(200, 'normal'));
});

test('deliveryPerformance: instant = 1 + earlyBonus, at the deadline = 1, one hour late = 1 − latePenaltyPerHour, floor perfMin', () => {
  const J = BALANCE.jobs;
  assert.ok(Math.abs(deliveryPerformance(0, 100) - (1 + J.earlyBonus)) < 1e-9);
  assert.equal(deliveryPerformance(100, 100), 1);
  assert.ok(Math.abs(deliveryPerformance(160, 100) - (1 - J.latePenaltyPerHour)) < 1e-9);
  assert.equal(deliveryPerformance(100 + 60 * 24, 100), J.perfMin);
});

test('a riding route at canter fits inside the normal deadline for every board pair', () => {
  // Canter 100 px/s = 6.25 tiles per real second = 6.25 tiles per game minute; roads wind ~1.4× the straight line.
  const pos = boardTiles();
  for (const a of Object.keys(pos)) for (const b of Object.keys(pos)) {
    if (a === b) continue;
    const tiles = tileDistance(pos[a]!, pos[b]!);
    if (tiles > 360) continue;
    assert.ok((tiles * 1.4) / 6.25 < deliveryDeadline(tiles, 'normal'), `${a}→${b}`);
  }
});

// --- Strike mini-game ------------------------------------------------------------------------

test('strikePerformance: clean work earns perfMax, all misses earn perfMin', () => {
  assert.equal(strikePerformance(4, 0), BALANCE.jobs.perfMax);
  assert.equal(strikePerformance(0, 5), BALANCE.jobs.perfMin);
  assert.equal(strikePerformance(0, 0), BALANCE.jobs.perfMin);
  assert.ok(Math.abs(strikePerformance(3, 1) - 0.75 * BALANCE.jobs.perfMax) < 1e-9);
});

test('strikeGauge stays in [0,1], starts empty and tops out at half a cycle', () => {
  const period = 1 / BALANCE.jobs.strikeSpeed;
  assert.ok(strikeGauge(0) < 1e-9);
  assert.ok(Math.abs(strikeGauge(period / 2) - 1) < 1e-9);
  for (let t = 0; t < 5; t += 0.013) assert.ok(strikeGauge(t) >= 0 && strikeGauge(t) <= 1);
  // The sweet spot is reachable for a real window each cycle (> 0.1 s).
  let inSweet = 0;
  for (let t = 0; t < period; t += 0.001) if (strikeGauge(t) >= BALANCE.jobs.strikeSweet) inSweet += 0.001;
  assert.ok(inSweet > 0.1, `sweet window ${inSweet.toFixed(3)} s`);
});

// --- Hourly-rate bands (the owner's balance target) ------------------------------------------

test('honest work earns $5–15 per real hour at skill 1 across every offered size and route', () => {
  const pos = boardTiles();
  for (const t of JOB_TEMPLATES.filter((x) => x.risk === 'honest')) {
    const cases: [number, number][] = [];
    if (t.deliver) {
      for (const b of JOB_BOARDS.filter((x) => x.templates.includes(t.id))) {
        for (const d of Object.keys(pos)) {
          const tiles = tileDistance(pos[b.settlementId]!, pos[d]!);
          if (d !== b.settlementId && tiles >= t.deliver.minTiles && tiles <= t.deliver.maxTiles) cases.push([1, Math.round(tiles)]);
        }
      }
    } else if (t.gather) cases.push([t.gather.qty[0], 0], [t.gather.qty[1], 0]);
    else if (t.cattle) cases.push([t.cattle.head[0], 0], [t.cattle.head[1], 0]);
    else if (t.chores) cases.push([t.chores.count, 0]);
    else if (t.bartend) cases.push([t.bartend.orders, 0]);
    else cases.push([1, 0]);
    assert.ok(cases.length, `${t.id} has cases`);
    for (const [units, tiles] of cases) {
      const r = hourlyRate(t, units, tiles, NEUTRAL);
      assert.ok(r >= 5 && r <= 15, `${t.id} units=${units} tiles=${tiles}: $${r.toFixed(2)}/h`);
    }
  }
});

test('risky and dangerous work pays more than the honest ceiling', () => {
  for (const t of JOB_TEMPLATES.filter((x) => x.risk !== 'honest')) {
    const units = t.gather?.qty[0] ?? (t.bounty ? 1 + t.bounty.gang[0] : 1);
    const tiles = t.deliver?.minTiles ?? 0;
    const r = hourlyRate(t, units, tiles, NEUTRAL);
    assert.ok(r > 15, `${t.id}: $${r.toFixed(2)}/h`);
  }
});

test('dangerous jobs out-earn risky ones on average', () => {
  const avg = (risk: string): number => {
    const ts = JOB_TEMPLATES.filter((x) => x.risk === risk);
    return ts.reduce((s, t) => s + hourlyRate(t, t.gather?.qty[0] ?? (t.bounty ? 1 + t.bounty.gang[0] : 1), t.deliver?.minTiles ?? 0, NEUTRAL), 0) / ts.length;
  };
  assert.ok(avg('dangerous') > avg('risky'));
});

// --- Contracts vs. the open market -----------------------------------------------------------

test('labour contracts (ore, timber, wheat) beat selling the same goods anywhere in the board\'s own region', () => {
  const e = economyAt();
  for (const id of ['ore_contract', 'lumber_contract', 'harvest_wheat']) {
    const t = tpl(id);
    for (const b of JOB_BOARDS.filter((x) => x.templates.includes(id))) {
      const region = SETTLEMENTS.find((s) => s.id === b.settlementId)!.regionId;
      for (const item of t.gather!.items) {
        const best = Math.max(0, ...SHOPS.filter((s) => s.region === region).map((s) => e.sellPrice(s.id, item)));
        const qty = t.gather!.qty[0];
        assert.ok(jobPay(t, qty, 0, NEUTRAL) > best * qty, `${id}@${b.settlementId}: contract ${jobPay(t, qty, 0, NEUTRAL)} vs local market ${(best * qty).toFixed(2)}`);
      }
    }
  }
});

test('fish contracts are a price floor: they beat a flooded market but not a fresh one', () => {
  for (const t of JOB_TEMPLATES.filter((x) => x.id.startsWith('fish_'))) {
    for (const item of t.gather!.items) {
      const fresh = getItem(item).price * 0.8; // the lowest general-store buyMul that buys fish
      assert.ok(t.pay.perUnit! < fresh, `${t.id} ${item}`);
      assert.ok(t.pay.perUnit! > getItem(item).price * saturationFactor(1), `${t.id} ${item}`);
    }
  }
});

test('hunting contracts pay at least the list price of each pelt (general stores pay 60–100% of list)', () => {
  for (const t of JOB_TEMPLATES.filter((x) => x.id.startsWith('hunt_'))) {
    for (const item of t.gather!.items) assert.ok(t.pay.perUnit! >= getItem(item).price, `${t.id}: ${t.pay.perUnit} vs list ${getItem(item).price}`);
  }
});

// --- Regional trade --------------------------------------------------------------------------

test('regionalPriceMul: trade goods are cheap where produced, dear where scarce, neutral elsewhere', () => {
  assert.equal(regionalPriceMul('blackwater', 'whiskeyCrate'), BALANCE.trade.producedMul);
  assert.equal(regionalPriceMul('drylands', 'whiskeyCrate'), BALANCE.trade.scarceMul);
  assert.equal(regionalPriceMul('dustfall', 'whiskeyCrate'), 1);
});

test('regionalPriceMul keeps the original rules for ordinary goods', () => {
  assert.equal(regionalPriceMul('blackwater', 'peltWolf'), 1.15);
  assert.equal(regionalPriceMul('sierra', 'beans'), 1.1);
  assert.equal(regionalPriceMul('dustfall', 'beans'), 1);
});

test('hauling whiskey from Port Ashby to Sulfur Flats turns a profit', () => {
  const e = economyAt();
  const buy = e.buyPrice('store_ashby', 'whiskeyCrate');
  const sell = e.sellPrice('store_sulfur', 'whiskeyCrate');
  assert.ok(sell > buy, `buy ${buy} sell ${sell}`);
});

test('no shop buys back a good it stocks for more than maxResaleRatio of its price, even at max honor', () => {
  for (const honor of [-100, 0, 100]) {
    const e = economyAt(honor);
    for (const s of SHOPS) {
      const stocked = { ...s.stock, ...(TRADE_POSTS[s.id]?.stock ?? {}) };
      for (const item of Object.keys(stocked)) {
        const sell = e.sellPrice(s.id, item);
        if (sell <= 0) continue;
        assert.ok(sell <= e.buyPrice(s.id, item) * BALANCE.trade.maxResaleRatio + 0.01, `${s.id} ${item} honor ${honor}`);
      }
    }
  }
});

test('every region has a general store that buys trade goods', () => {
  economyAt(); // applies trade posts
  for (const region of ['dustfall', 'blackwater', 'pinehollow', 'sierra', 'drylands', 'redstone']) {
    assert.ok(SHOPS.some((s) => s.region === region && s.buys.includes('material')), region);
  }
});

test('saturation is regional: flooding one market leaves the next region untouched', () => {
  const e = economyAt();
  const fresh = e.sellPrice('store_larkspur', 'peltDeer');
  e.saturation[saturationKey('dustfall', 'peltDeer')] = 1;
  const flooded = e.sellPrice('store_larkspur', 'peltDeer');
  assert.ok(Math.abs(flooded - fresh * saturationFactor(1)) < 0.02, `${flooded} vs ${fresh}`);
  assert.equal(e.saturationAt('store_ashby', 'peltDeer'), 0);
});

test('saturationFactor falls linearly to 1 − saturationDepth and is clamped', () => {
  assert.equal(saturationFactor(0), 1);
  assert.ok(Math.abs(saturationFactor(1) - (1 - BALANCE.trade.saturationDepth)) < 1e-9);
  assert.equal(saturationFactor(3), saturationFactor(1));
});

test('loading an old save drops item-only saturation keys', () => {
  const e = economyAt();
  e.load({ saturation: { peltDeer: 0.5, 'dustfall:peltWolf': 0.3 } });
  assert.deepEqual(e.saturation, { 'dustfall:peltWolf': 0.3 });
});

// --- Notice boards ---------------------------------------------------------------------------

test('board offers are the same all day and rotate the next day', () => {
  const pos = boardTiles();
  let rotated = 0;
  for (const b of JOB_BOARDS) {
    const a1 = rollBoardOffers(b, 5, pos, BOUNTY_CAMPS);
    const a2 = rollBoardOffers(b, 5, pos, BOUNTY_CAMPS);
    assert.deepEqual(a1, a2);
    const next = rollBoardOffers(b, 6, pos, BOUNTY_CAMPS);
    if (JSON.stringify(a1.map((o) => [o.templateId, o.units, o.destId])) !== JSON.stringify(next.map((o) => [o.templateId, o.units, o.destId]))) rotated++;
  }
  assert.ok(rotated >= JOB_BOARDS.length - 1, `${rotated} boards rotated`);
});

test('board offers respect slots, never repeat a template and keep deliveries in range', () => {
  const pos = boardTiles();
  for (const b of JOB_BOARDS) {
    for (let day = 1; day < 30; day++) {
      const offers = rollBoardOffers(b, day, pos, BOUNTY_CAMPS);
      assert.ok(offers.length <= b.slots);
      assert.equal(new Set(offers.map((o) => o.templateId)).size, offers.length);
      for (const o of offers) {
        const t = tpl(o.templateId);
        assert.ok(o.demand >= BALANCE.jobs.demandMin && o.demand <= BALANCE.jobs.demandMax);
        if (t.deliver) {
          assert.ok(o.destId && o.destId !== b.settlementId);
          assert.ok(o.tiles >= t.deliver.minTiles - 1 && o.tiles <= t.deliver.maxTiles + 1, `${o.id} ${o.tiles}`);
        }
        if (t.gather) assert.ok(o.units >= t.gather.qty[0] && o.units <= t.gather.qty[1] && t.gather.items.includes(o.item!));
      }
    }
  }
});

test('a vetoed template is never offered', () => {
  const b = JOB_BOARDS.find((x) => x.settlementId === 'brannigan')!;
  for (let day = 1; day < 20; day++) {
    const offers = rollBoardOffers(b, day, boardTiles(), BOUNTY_CAMPS, (t) => t.kind !== 'chores');
    assert.ok(offers.every((o) => tpl(o.templateId).kind !== 'chores'));
  }
});

// --- Homesteads ------------------------------------------------------------------------------

const plot = PLOTS[0]!;
const fresh = (upgrades: string[] = []): OwnedPlot => ({ upgrades, stock: {}, arrears: 0, boughtDay: 1 });

test('dailyPlotTick charges the day\'s tax when the purse covers it', () => {
  const own = fresh();
  const r = dailyPlotTick(own, plot, 10);
  assert.equal(r.taxPaid, plot.taxPerDay);
  assert.equal(own.arrears, 0);
});

test('dailyPlotTick runs up arrears when broke and collects them later', () => {
  const own = fresh();
  dailyPlotTick(own, plot, 0);
  dailyPlotTick(own, plot, 0);
  assert.ok(Math.abs(own.arrears - plot.taxPerDay * 2) < 1e-9);
  const r = dailyPlotTick(own, plot, 50);
  assert.ok(Math.abs(r.taxPaid - plot.taxPerDay * 3) < 1e-9);
  assert.equal(own.arrears, 0);
});

test('produce accrues per day up to its cap', () => {
  const own = fresh(['well', 'garden']);
  for (let d = 0; d < 30; d++) dailyPlotTick(own, plot, 100);
  const garden = UPGRADES.find((u) => u.id === 'garden')!;
  for (const y of garden.yields!) assert.equal(own.stock[y.item], y.cap);
});

test('produce stops once taxes are more than the grace period in arrears', () => {
  const own = fresh(['well', 'garden']);
  for (let d = 0; d < BALANCE.property.arrearsGraceDays + 3; d++) dailyPlotTick(own, plot, 0);
  const before = { ...own.stock };
  dailyPlotTick(own, plot, 0);
  assert.deepEqual(own.stock, before);
});

test('a full homestead pays for itself only slowly (it is a money sink)', () => {
  // Value of a day's produce at base prices vs. the cost of the plot and every upgrade.
  const perDay = UPGRADES.flatMap((u) => u.yields ?? []).reduce((s, y) => s + y.perDay * getItem(y.item).price, 0);
  const cost = plot.price + UPGRADES.reduce((s, u) => s + u.price, 0);
  const days = cost / Math.max(0.01, perDay - plot.taxPerDay);
  assert.ok(days > 30, `payback in ${days.toFixed(0)} days`);
});

// --- Data integrity --------------------------------------------------------------------------

test('jobs data references only things that exist', () => {
  const items = new Set(ITEMS.map((i) => i.id));
  const settlements = new Set(SETTLEMENTS.map((s) => s.id));
  const templates = new Set(JOB_TEMPLATES.map((t) => t.id));
  assert.equal(templates.size, JOB_TEMPLATES.length, 'template ids are unique');
  for (const t of JOB_TEMPLATES) {
    if (t.deliver) assert.ok(items.has(t.deliver.cargo), `${t.id} cargo`);
    for (const it of t.gather?.items ?? []) assert.ok(items.has(it), `${t.id} wants ${it}`);
    for (const o of t.chores?.objs ?? []) assert.ok(o in O, `${t.id} obj ${o}`);
    if (t.chores?.consumes) assert.ok(items.has(t.chores.consumes));
    assert.ok(t.minutes > 0 && t.pay.base >= 0);
  }
  for (const b of JOB_BOARDS) {
    assert.ok(settlements.has(b.settlementId), b.settlementId);
    for (const id of b.templates) assert.ok(templates.has(id), `${b.settlementId} → ${id}`);
  }
  for (const [occ, ids] of Object.entries(OCCUPATION_WORK)) for (const id of ids) assert.ok(templates.has(id), `${occ} → ${id}`);
  for (const [id, w] of Object.entries(WORK_ACTIONS)) {
    assert.ok(items.has(w.item), id);
    if (w.tool) assert.ok(items.has(w.tool), id);
    if (w.needsJob) assert.ok(templates.has(w.needsJob), id);
    for (const o of w.objs) assert.ok(o in O, `${id} obj ${o}`);
    assert.ok(w.task in BALANCE.jobs.taskMinutes, id);
  }
  for (const id of Object.keys(TRADE_GOODS)) assert.ok(items.has(id), id);
  for (const [shop, tp] of Object.entries(TRADE_POSTS)) {
    assert.ok(SHOPS.some((s) => s.id === shop), shop);
    for (const id of Object.keys(tp.stock ?? {})) assert.ok(items.has(id), `${shop} stocks ${id}`);
  }
  for (const p of PLOTS) assert.ok(LAND_OFFICES.includes(p.soldAt), p.id);
  const ups = new Set(UPGRADES.map((u) => u.id));
  for (const u of UPGRADES) {
    for (const r of u.requires ?? []) assert.ok(ups.has(r), `${u.id} requires ${r}`);
    for (const y of u.yields ?? []) assert.ok(items.has(y.item), `${u.id} yields ${y.item}`);
  }
  for (const o of BAR_ORDERS) assert.ok(BAR_POURS.includes(o.answer), o.ask);
});

test('every trade good has a producer region and a scarce region, never both the same', () => {
  for (const [id, g] of Object.entries(TRADE_GOODS)) {
    assert.ok(g.produced.length && g.scarce.length, id);
    assert.ok(!g.produced.some((r) => (g.scarce as string[]).includes(r)), id);
  }
});
