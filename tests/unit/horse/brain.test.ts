import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../../../src/core/rng.ts';
import { decide, type HorseSenses } from '../../../src/horse/brain.ts';
import { generateHorse } from '../../../src/horse/generator.ts';

const senses = (over: Partial<HorseSenses> = {}): HorseSenses => ({
  x: 0, y: 0, owner: null, threat: null, water: null, canGrazeHere: true, shelter: null, otherHorse: null,
  novelty: null, night: false, storm: false, tied: false, leading: false, called: false, pen: null, herdLeader: null, ...over,
});

function countStates(h: ReturnType<typeof generateHorse>, s: HorseSenses, n = 200): Record<string, number> {
  const out: Record<string, number> = {};
  const rng = new Rng(5);
  for (let i = 0; i < n; i++) {
    const d = decide(h, s, rng);
    out[d.state] = (out[d.state] ?? 0) + 1;
  }
  return out;
}

test('a hungry horse on grass mostly grazes', () => {
  const h = generateHorse(1);
  h.hunger = 5;
  h.thirst = 100;
  h.energy = 100;
  const c = countStates(h, senses());
  assert.ok((c.graze ?? 0) > 100, JSON.stringify(c));
});

test('a thirsty horse heads for water it can see', () => {
  const h = generateHorse(2);
  h.thirst = 5;
  h.hunger = 100;
  const c = countStates(h, senses({ water: { x: 50, y: 0 } }));
  assert.ok((c.drink ?? 0) > 100, JSON.stringify(c));
});

test('nervous horse flees a wolf that a brave horse tolerates', () => {
  const nerv = generateHorse(3, { breedId: 'thoroughbred' });
  nerv.traits = ['nervous'];
  const brave = generateHorse(3, { breedId: 'belgian' });
  brave.traits = ['brave', 'calm'];
  const threat = { x: 60, y: 0, level: 0.45, kind: 'wolf' };
  const cn = countStates(nerv, senses({ threat }));
  const cb = countStates(brave, senses({ threat }));
  const fled = (c: Record<string, number>) => (c.flee ?? 0) + (c.spooked ?? 0);
  assert.ok(fled(cn) > 150, JSON.stringify(cn));
  assert.ok(fled(cb) < 20, JSON.stringify(cb));
});

test('flee direction points away from the threat', () => {
  const h = generateHorse(4);
  h.traits = ['fearful'];
  const rng = new Rng(9);
  for (let i = 0; i < 50; i++) {
    const d = decide(h, senses({ threat: { x: 100, y: 0, level: 1, kind: 'cougar' } }), rng);
    if (d.state === 'flee') assert.ok(d.target!.x < 0);
  }
});

test('a bonded horse comes to the whistle far more reliably than a wary one', () => {
  const wary = generateHorse(5);
  wary.traits = ['stubborn'];
  wary.bondXp = 0;
  wary.trust = 10;
  const bonded = generateHorse(5);
  bonded.traits = ['loyal'];
  bonded.bondXp = 1300;
  bonded.trust = 90;
  const owner = { x: 300, y: 0, dist: 300, mounted: false };
  const cw = countStates(wary, senses({ called: true, owner }));
  const cb = countStates(bonded, senses({ called: true, owner }));
  assert.ok((cb.come ?? 0) > (cw.come ?? 0) + 40, `${JSON.stringify(cw)} vs ${JSON.stringify(cb)}`);
  assert.ok((cb.come ?? 0) > 180);
});

test('tied horses never wander off', () => {
  const h = generateHorse(6);
  const c = countStates(h, senses({ tied: true }));
  assert.equal(c.wander ?? 0, 0);
});

test('horses seek shelter in storms when shelter exists', () => {
  const h = generateHorse(7);
  h.hunger = 100;
  h.thirst = 100;
  h.energy = 100;
  const c = countStates(h, senses({ storm: true, shelter: { x: 40, y: 40 } }));
  assert.ok((c.shelter ?? 0) > 100, JSON.stringify(c));
});
