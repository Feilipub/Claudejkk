import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wildlifeGroups, wildlifeQuota, type QuotaAnimal } from '../../../src/systems/spawnQuota.ts';

const herd = (id: string, species: string, n: number, x = 0, y = 0): QuotaAnimal[] => Array.from({ length: n }, (_, i) => ({ x: x + i * 4, y, speciesId: species, herd: id }));

test('a single cattle herd of nine counts as one group, leaving room for other species', () => {
  // Arrange: the playtest case — one big herd near the player in a temperate region.
  const animals = herd('wg_1', 'cattle', 9);
  // Act
  const r = wildlifeGroups(animals);
  const q = wildlifeQuota('temperate');
  // Assert
  assert.equal(r.heads, 9);
  assert.equal(r.groups, 1);
  assert.ok(r.groups < q.groups && r.heads < q.heads, 'quota still allows more groups');
});

test('ungrouped animals are grouped by species and area', () => {
  const animals: QuotaAnimal[] = [
    { x: 10, y: 10, speciesId: 'rabbit', herd: null },
    { x: 30, y: 12, speciesId: 'rabbit', herd: null },
    { x: 900, y: 900, speciesId: 'rabbit', herd: null },
    { x: 20, y: 20, speciesId: 'deer', herd: null },
  ];
  const r = wildlifeGroups(animals);
  assert.equal(r.groups, 3);
  assert.deepEqual([...r.species].sort(), ['deer', 'rabbit']);
});

test('quota allows several groups and caps heads', () => {
  assert.equal(wildlifeQuota('arid').groups, 3);
  assert.equal(wildlifeQuota('temperate').groups, 4);
  const many = [...herd('a', 'bison', 8), ...herd('b', 'cattle', 9), ...herd('c', 'elk', 5)];
  assert.ok(wildlifeGroups(many).heads >= wildlifeQuota('temperate').heads);
});
