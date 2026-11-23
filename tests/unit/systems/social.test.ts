import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTS, blockAt, firstNameOf, isSunday, relationBetween, ROUTINE_OF, ROUTINES, surnameOf, TOPICS, WORK_TALK, type SocialPerson } from '../../../src/data/social.ts';

const OCCUPATIONS = ['rancher', 'cowhand', 'blacksmith', 'merchant', 'doctor', 'bartender', 'sheriff', 'deputy', 'farmer', 'hunter', 'railroad', 'horsetrader', 'banker', 'outlaw', 'saloongirl', 'traveler', 'miner', 'preacher', 'bountyhunter', 'soldier', 'stablehand', 'editor', 'telegrapher', 'logger', 'cook', 'elder', 'breeder', 'trapper', 'gambler', 'pianist', 'hotelier', 'gunsmith', 'tailor', 'surveyor', 'drifter', 'child'];

test('every routine covers 0-24h without gaps or overlaps', () => {
  for (const [id, r] of Object.entries(ROUTINES)) {
    for (const list of [r.week, r.sunday ?? r.week]) {
      assert.equal(list[0]!.from, 0, `${id} starts at midnight`);
      assert.equal(list[list.length - 1]!.to, 24, `${id} ends at midnight`);
      for (let i = 1; i < list.length; i++) assert.equal(list[i]!.from, list[i - 1]!.to, `${id} block ${i} is contiguous`);
      for (const b of list) assert.ok(ACTS[b.act], `${id}: activity ${b.act} is defined`);
    }
  }
});

test('every occupation resolves to a routine', () => {
  for (const o of OCCUPATIONS) assert.ok(ROUTINES[ROUTINE_OF[o] ?? ''], `routine for ${o}`);
});

test('Sundays: day 6 is the first Sunday (day 1 = Tue 3 April 1888)', () => {
  assert.ok(isSunday(6));
  assert.ok(isSunday(13));
  assert.ok(!isSunday(1));
  // Shopkeepers are in church on Sunday morning, at the counter on a weekday.
  assert.equal(blockAt('merchant', [], 9.5, 6).block.place, 'church');
  assert.equal(blockAt('merchant', [], 9.5, 2).block.place, 'counter');
});

test('daily life: smith hammers by day, everyone sleeps at 3am, drunks drink and stagger', () => {
  assert.equal(blockAt('blacksmith', [], 10, 2).block.act, 'hammer');
  for (const o of OCCUPATIONS.filter((x) => !['bartender', 'outlaw', 'deputy', 'saloongirl', 'gambler', 'drifter', 'pianist'].includes(x))) assert.equal(blockAt(o, [], 3, 2).block.act, 'sleep', `${o} sleeps at 3am`);
  assert.equal(blockAt('farmer', ['drunk'], 20, 2).block.act, 'drink');
  assert.equal(blockAt('farmer', ['drunk'], 23.5, 2).block.act, 'stagger');
  assert.equal(blockAt('sheriff', [], 9, 2).block.place, 'patrol');
});

test('relationships are symmetric, deterministic and honour family names', () => {
  const p = (id: string, name: string, occupation = 'farmer', personality = ['kind']): SocialPerson => ({ id, name, occupation, personality, settlement: 'larkspur' });
  const a = p('a1', 'Ezra Hale');
  const b = p('b2', 'Molly Hale');
  assert.equal(relationBetween(a, b), 'family');
  const c = p('c3', 'Jed Stone', 'cowhand', ['gruff']);
  assert.equal(relationBetween(a, c), relationBetween(c, a));
  assert.equal(relationBetween(p('whitlock', 'Sheriff Amos Whitlock'), p('dane', 'Deputy Cyrus Dane')), 'colleague');
  assert.equal(surnameOf('Sheriff Amos Whitlock'), 'Whitlock');
  assert.equal(firstNameOf('Dr. Samuel Okafor'), 'Samuel');
});

test('topic lines only use known tokens', () => {
  const ok = new Set(['a', 'b', 'player', 'town', 'horse', 'victim', 'crime']);
  for (const pool of [...Object.values(TOPICS), ...Object.values(WORK_TALK)])
    for (const ex of pool) {
      assert.ok(ex.length >= 2, 'an exchange has at least two lines');
      for (const l of ex) for (const m of l.matchAll(/\{(\w+)\}/g)) assert.ok(ok.has(m[1]!), `unknown token {${m[1]}} in "${l}"`);
    }
});
