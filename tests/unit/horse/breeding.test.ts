import { test } from 'node:test';
import assert from 'node:assert/strict';
import { breedFoal, canBreed } from '../../../src/horse/breeding.ts';
import { generateHorse } from '../../../src/horse/generator.ts';

const pair = () => {
  const dam = generateHorse(101, { breedId: 'arabian', sex: 'mare', age: 7 });
  const sire = generateHorse(202, { breedId: 'arabian', sex: 'stallion', age: 9 });
  return { dam, sire };
};

test('canBreed_mareAndStallion_allowed', () => {
  const { dam, sire } = pair();
  assert.equal(canBreed(dam, sire), null);
});

test('canBreed_gelding_rejected', () => {
  const { dam, sire } = pair();
  sire.sex = 'gelding';
  assert.match(canBreed(dam, sire)!, /gelding/);
});

test('canBreed_injuredMare_rejected', () => {
  const { dam, sire } = pair();
  dam.injuries.push({ kind: 'limp', severity: 30, treated: false, day: 1 });
  assert.ok(canBreed(dam, sire));
});

test('breedFoal_genesNearMidParent', () => {
  const { dam, sire } = pair();
  for (const k of Object.keys(dam.genes)) {
    dam.genes[k] = 1.1;
    sire.genes[k] = 1.1;
  }
  const foal = breedFoal(dam, sire, 5, 1);
  const avg = Object.values(foal.genes).reduce((a, b) => a + b, 0) / Object.keys(foal.genes).length;
  assert.ok(avg > 1.05, `avg ${avg}`);
});

test('breedFoal_coatFromAParent_andDamBreed', () => {
  const { dam, sire } = pair();
  dam.appearance.coat = 'grey';
  sire.appearance.coat = 'black';
  for (let s = 1; s < 30; s++) {
    const f = breedFoal(dam, sire, s, 1);
    assert.ok(['grey', 'black'].includes(f.appearance.coat));
    assert.equal(f.breedId, 'arabian');
    assert.equal(f.owner, 'player');
    assert.ok(f.age < 1);
  }
});
