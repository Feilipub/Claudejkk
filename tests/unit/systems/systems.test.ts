import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Inventory } from '../../../src/systems/inventory.ts';
import { Reputation } from '../../../src/systems/reputation.ts';
import { Skills } from '../../../src/systems/skills.ts';
import { GameClock } from '../../../src/systems/time.ts';
import { migrate, SAVE_VERSION, type SaveFile } from '../../../src/systems/save.ts';
import { ITEMS } from '../../../src/data/items.ts';
import { BREEDS } from '../../../src/data/breeds.ts';
import { COATS } from '../../../src/data/coats.ts';
import { TRAITS } from '../../../src/data/personalities.ts';
import { SHOPS } from '../../../src/data/shops.ts';
import { SPECIES } from '../../../src/data/wildlife.ts';
import { REGIONS } from '../../../src/data/world.ts';

test('inventory respects weight capacity and stack size', () => {
  const inv = new Inventory(5);
  assert.equal(inv.add('beans', 100), 12); // 0.4 kg each → 12 fit in 5 kg
  assert.ok(!inv.canAdd('beans'));
  assert.ok(inv.remove('beans', 2));
  assert.equal(inv.count('beans'), 10);
  assert.ok(!inv.remove('beans', 50));
});

test('reputation clamps and affects prices both ways', () => {
  const r = new Reputation();
  r.add('honor', 500);
  assert.equal(r.get('honor'), 100);
  const good = r.priceMul();
  r.add('honor', -200);
  r.add('notoriety', 80);
  assert.ok(r.priceMul() > good);
});

test('skills level up with practice', () => {
  const s = new Skills();
  let leveled = 0;
  s.onLevel = () => leveled++;
  s.gain('riding', 61);
  assert.equal(s.level('riding'), 2);
  assert.equal(leveled, 1);
});

test('clock: day/night and dates', () => {
  const c = new GameClock();
  c.minutes = 12 * 60;
  assert.equal(c.daylight, 1);
  c.minutes = 23 * 60;
  assert.ok(c.isNight);
  assert.equal(new GameClock().dateString(), 'April 3, 1888');
});

test('save migration fills new fields', () => {
  const f: SaveFile = { meta: { slot: 'x', version: 1, savedAt: 0, label: '', playtime: 0 }, data: { player: {} }, checksum: 0 };
  const m = migrate(f);
  assert.equal(m.meta.version, SAVE_VERSION);
  assert.ok((m.data.player as Record<string, unknown>).skills);
  assert.deepEqual(m.data.ownedGear, {});
});

test('data integrity: every id referenced by data exists', () => {
  const items = new Set(ITEMS.map((i) => i.id));
  const coats = new Set(COATS.map((c) => c.id));
  const traits = new Set(TRAITS.map((t) => t.id));
  for (const b of BREEDS) {
    for (const c of b.coats) assert.ok(coats.has(c.coat), `${b.id} coat ${c.coat}`);
    for (const t of Object.keys(b.traitBias)) assert.ok(traits.has(t), `${b.id} trait ${t}`);
  }
  for (const s of SHOPS) for (const id of Object.keys(s.stock)) assert.ok(items.has(id), `${s.id} stocks ${id}`);
  const species = new Set(SPECIES.map((s) => s.id));
  for (const r of REGIONS) for (const w of r.wildlife) assert.ok(species.has(w.species), `${r.id} ${w.species}`);
  for (const sp of SPECIES) for (const y of sp.yields) assert.ok(items.has(y.item), `${sp.id} yields ${y.item}`);
  for (const it of ITEMS) if (it.cookTo) assert.ok(items.has(it.cookTo));
});
