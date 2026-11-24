// Collect every player-facing string from the DATA files (dialogue, quests, items,
// lore, world, jobs, horses, wildlife) plus L()/tr`` keys in code, grouped by
// category, for the translators. Pure data modules only — no DOM.
// Usage: node --experimental-strip-types tools/i18n-keys.mjs > /tmp/keys.json
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const groups = {};
const add = (g, v) => {
  if (typeof v !== 'string') return;
  const t = v.trim();
  if (!t || !/[A-Za-z]{2,}/.test(t)) return;
  (groups[g] ??= new Set()).add(t);
};

const { DIALOGUE, BARKS } = await import('../src/data/story/dialogue.ts');
const { QUESTS } = await import('../src/data/story/quests.ts');
const { LORE } = await import('../src/data/story/lore.ts');
const { NPCS } = await import('../src/data/story/npcs.ts');
const { ENCOUNTERS } = await import('../src/data/story/encounters.ts');
const items = await import('../src/data/items.ts');
const world = await import('../src/data/world.ts');
const jobs = await import('../src/data/jobs.ts');
const breeds = await import('../src/data/breeds.ts');
const coats = await import('../src/data/coats.ts');
const traits = await import('../src/data/personalities.ts');
const wildlife = await import('../src/data/wildlife.ts');
const shops = await import('../src/data/shops.ts');

for (const t of DIALOGUE)
  for (const n of t.nodes) {
    for (const l of n.lines ?? []) (Array.isArray(l.text) ? l.text : [l.text]).forEach((x) => add('dialogue', x));
    for (const o of n.options ?? []) {
      add('dialogue_options', o.text);
      add('dialogue_options', o.lockedHint);
    }
  }
for (const b of BARKS) for (const l of b.lines) add('barks', l);
for (const q of QUESTS) {
  add('quests', q.title);
  add('quests', q.summary);
  for (const st of q.stages) {
    add('quests', st.journal);
    for (const o of st.objectives ?? []) add('quests', o.text);
  }
}
for (const l of LORE) {
  add('lore', l.title);
  add('lore', l.text);
}
for (const n of NPCS) {
  add('occupations', n.occupation);
  add('bios', n.bio);
}
for (const e of ENCOUNTERS) add('encounters', e.name);
const itemList = items.ITEMS ?? Object.values(items).find((v) => Array.isArray(v) && v[0]?.name && v[0]?.description) ?? [];
for (const it of itemList) {
  add('items', it.name);
  add('items', it.description);
  add('item_categories', it.category);
}
for (const r of world.REGIONS ?? []) {
  add('world', r.name);
  add('world', r.description);
}
for (const p of world.POIS ?? []) {
  add('world', p.name);
  add('world', p.description);
}
for (const s of world.SETTLEMENTS ?? []) add('settlement_kinds', s.kind);
for (const t of jobs.JOB_TEMPLATES ?? []) {
  add('jobs', t.title);
  add('jobs', t.blurb);
  add('jobs', t.chores?.label);
}
for (const b of jobs.JOB_BOARDS ?? []) add('jobs', b.name);
for (const g of Object.values(jobs.TRADE_GOODS ?? {})) add('jobs', g.name);
for (const w of Object.values(jobs.WORK_ACTIONS ?? {})) { add('jobs', w.label); add('jobs', w.verb); }
for (const o of jobs.BAR_ORDERS ?? []) { add('jobs', o.ask); add('jobs', o.answer); }
for (const c of jobs.BOUNTY_CAMPS ?? []) add('jobs', c.name);
for (const pl of jobs.PLOTS ?? []) {
  add('jobs', pl.name);
  add('jobs', pl.description);
}
for (const im of jobs.UPGRADES ?? []) {
  add('jobs', im.name);
  add('jobs', im.description);
}
for (const b of breeds.BREEDS ?? []) {
  add('horses', b.name);
  add('horses', b.description);
  add('horses', b.origin);
}
for (const c of coats.COATS ?? []) add('horses', c.name);
for (const v of Object.values(coats.PATTERN_NAMES ?? {})) add('horses', v);
for (const t of traits.TRAITS ?? []) {
  add('horses', t.name);
  add('horses', t.description);
}
for (const sp of wildlife.SPECIES ?? []) add('wildlife', sp.name);
for (const sh of shops.SHOPS ?? []) add('shops', sh.name);

// Code keys: L('…') and tr`…`
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.ts')) {
      const src = readFileSync(p, 'utf8');
      for (const m of src.matchAll(/\bL\(\s*(['"])((?:\\.|(?!\1).)*)\1/g)) add('code', m[2].replace(/\\'/g, "'"));
      for (const m of src.matchAll(/\btr`((?:\\.|[^`])*)`/g)) {
        let i = 0;
        add('code', m[1].replace(/\$\{[^}]*\}/g, () => `{${i++}}`));
      }
    }
  }
};
walk('src');

const out = {};
let total = 0;
for (const [g, set] of Object.entries(groups)) {
  out[g] = [...set];
  total += set.size;
}
process.stderr.write(Object.entries(out).map(([g, a]) => `${g}: ${a.length}`).join(', ') + ` — total ${total}\n`);
process.stdout.write(JSON.stringify(out, null, 1));
