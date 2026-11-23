import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateHorse } from '../../../src/horse/generator.ts';
import { rideStats, bondLevel, maxStamina } from '../../../src/horse/stats.ts';
import { grantBond, penalizeBond } from '../../../src/horse/bonding.ts';
import { feedHorse, injure, tickHorseNeeds, treatHorse, type NeedsContext } from '../../../src/horse/care.ts';
import { appraise } from '../../../src/horse/economy.ts';
import { BREEDS } from '../../../src/data/breeds.ts';
import { TRAIT_CONFLICTS } from '../../../src/data/personalities.ts';

const ctx = (over: Partial<NeedsContext> = {}): NeedsContext => ({
  minutes: 60, day: 1, grazing: false, drinking: false, resting: false, stabled: false,
  temperature: 65, raining: false, snowing: false, sheltered: false, companionNear: true, ...over,
});

test('generator is deterministic for a seed', () => {
  assert.deepEqual(generateHorse(42), generateHorse(42));
  assert.notDeepEqual(generateHorse(42).appearance, generateHorse(43).appearance);
});

test('at least 12 breeds with distinct stat profiles', () => {
  assert.ok(BREEDS.length >= 12);
  const sigs = new Set(BREEDS.map((b) => JSON.stringify(b.stats)));
  assert.equal(sigs.size, BREEDS.length);
});

test('generated horses never carry conflicting traits', () => {
  for (let s = 1; s < 400; s++) {
    const h = generateHorse(s);
    for (const [a, b] of TRAIT_CONFLICTS) assert.ok(!(h.traits.includes(a) && h.traits.includes(b)), `seed ${s}`);
  }
});

test('thoroughbred gallops faster than a shire; shire carries more', () => {
  const tb = generateHorse(7, { breedId: 'thoroughbred', age: 7 });
  const sh = generateHorse(7, { breedId: 'shire', age: 7 });
  tb.traits = ['calm']; sh.traits = ['calm'];
  assert.ok(rideStats(tb).gaitSpeed.gallop > rideStats(sh).gaitSpeed.gallop * 1.5);
  assert.ok(rideStats(sh).carry > rideStats(tb).carry);
});

test('nervous horse has higher fear than brave horse of same breed', () => {
  const a = generateHorse(9, { breedId: 'morgan' });
  const b = generateHorse(9, { breedId: 'morgan' });
  a.traits = ['nervous']; b.traits = ['brave'];
  assert.ok(rideStats(a).fear > rideStats(b).fear * 2);
});

test('bonding has diminishing returns for repeated activity in one day', () => {
  const h = generateHorse(11);
  h.traits = ['calm'];
  const first = grantBond(h, 'brush', 1).gained;
  grantBond(h, 'brush', 1);
  const third = grantBond(h, 'brush', 1).gained;
  assert.ok(third < first * 0.5, `${third} vs ${first}`);
  // A new day resets.
  const nextDay = grantBond(h, 'brush', 2).gained;
  assert.ok(nextDay > third);
});

test('spamming pets alone cannot reach max bond in a day', () => {
  const h = generateHorse(12);
  for (let i = 0; i < 500; i++) grantBond(h, 'pet', 1);
  assert.ok(bondLevel(h) <= 2, `level ${bondLevel(h)}`);
});

test('mistreatment lowers bond and trust', () => {
  const h = generateHorse(13);
  h.bondXp = 400; h.trust = 70;
  penalizeBond(h, 'hit');
  assert.ok(h.bondXp < 400 && h.trust < 70);
});

test('leg injury restricts gait and heals slowly, faster when treated', () => {
  const h = generateHorse(14);
  injure(h, 'limp', 70, 1, 'fall');
  assert.notEqual(rideStats(h).maxGait, 'gallop');
  const untreated = structuredClone(h);
  treatHorse(h, 'horseLiniment', 1);
  tickHorseNeeds(h, ctx({ minutes: 600 }));
  tickHorseNeeds(untreated, ctx({ minutes: 600 }));
  const sev = (x: typeof h) => x.injuries.reduce((s, i) => s + i.severity, 0);
  assert.ok(sev(h) < sev(untreated));
  assert.ok(sev(untreated) > 0, 'does not instantly heal');
});

test('needs decay over time and starvation reduces max stamina', () => {
  const h = generateHorse(15);
  const before = maxStamina(h);
  tickHorseNeeds(h, ctx({ minutes: 60 * 48 }));
  assert.ok(h.hunger < 10 && h.thirst < 10);
  assert.ok(maxStamina(h) < before);
});

test('feeding favourite food gives more bond than plain hay', () => {
  const a = generateHorse(16); a.favoriteFood = 'apple'; a.hunger = 20;
  const b = structuredClone(a);
  const fav = feedHorse(a, 'apple', 1).bondGained!;
  const hay = feedHorse(b, 'hay', 1).bondGained!;
  assert.ok(fav > hay);
});

test('appraisal: injured horse is worth less than healthy twin', () => {
  const a = generateHorse(17, { breedId: 'arabian' });
  const b = structuredClone(a);
  injure(b, 'strain', 80, 1, 'test');
  assert.ok(appraise(b).value < appraise(a).value);
  assert.ok(appraise(generateHorse(1, { breedId: 'arabian' })).value > appraise(generateHorse(1, { breedId: 'mustang' })).value);
});
