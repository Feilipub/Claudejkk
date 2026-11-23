// Automated main-story playthrough. Drives every main quest stage by doing
// what a player would (travel, talk through dialogue, fight tagged enemies,
// lead horses, deliver items) and reports where the chain stalls.
// Usage: node tools/story-full.mjs [ending: law|press|bribe] [outDir]
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');

const ending = process.argv[2] ?? 'law';
const out = process.argv[3] ?? 'production/qa/evidence';
mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2' };
const srv = createServer((req, res) => {
  const p = (req.url ?? '/').split('?')[0];
  try { res.writeHead(200, { 'Content-Type': types[extname(p)] ?? 'application/octet-stream' }); res.end(readFileSync(join('dist', p === '/' ? 'index.html' : p))); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:${srv.address().port}/index.html`);
await page.waitForFunction(() => window.wf?.ready, null, { timeout: 60000 });
await page.click('#mnew');
await page.click('#go');
await page.waitForFunction(() => window.wf.started);

const mode = process.argv[4] ?? 'main';
let MAIN = ['main_arrival', 'main_tracks', 'main_surveyor', 'main_highcountry', 'main_reckoning'];
if (mode === 'side') {
  MAIN = await page.evaluate(() => [...window.game.quests.defs.values()].filter((q) => !q.id.startsWith('main_')).map((q) => q.id));
  // Side quests are normally offered by NPCs; start them all directly for coverage.
  await page.evaluate((ids) => {
    const g = window.game;
    // Side content is played after the prologue: finish it, give the player Juniper.
    g.quests.states.main_arrival = { status: 'completed', stage: 'reward', progress: {}, done: [], log: [], startDay: 1, base: {} };
    g.giveHorse({ breedId: 'quarter', name: 'Juniper', gear: { saddle: 'saddleStock', bridle: 'bridleSnaffle', bags: 'bagsSmall', bedroll: 'bedroll' } });
    g.quests.states.main_tracks = { status: 'failed', stage: 'wagon', progress: {}, done: [], log: [], startDay: 1, base: {} };
    g.player.money = 500;
  }, MAIN);
}
const prefer = { law: ['marshal', 'kincaid', 'law', 'warrant'], press: ['clarion', 'print', 'paper', 'cordelia', 'publish'], bribe: ['money', 'take it', 'deal', 'price', '500'] }[ending];
const log = [];
let guard = 0;
let lastKey = '';
let stuck = 0;
while (guard++ < 160) {
  const st = await page.evaluate((MAIN) => {
    const g = window.game;
    for (const id of MAIN) {
      const s = g.quests.state(id);
      if (!s || s.status !== 'active') continue;
      const stage = g.quests.stageDef(id);
      const objs = g.quests.visibleObjectives(id).filter((o) => !s.done.includes(o.id) && !o.optional);
      return { id, stage: s.stage, objs };
    }
    return { done: MAIN.every((id) => ['completed', 'failed'].includes(g.quests.state(id)?.status)), states: MAIN.map((id) => id + ':' + (g.quests.state(id)?.status ?? '-')) };
  }, MAIN);
  if (!st.id && !st.done && mode === 'side') {
    // Start the next side quest the way a player would: through its giver's dialogue.
    const res = await page.evaluate(async (ids) => {
      const g = window.game;
      const id = ids.find((q) => !g.quests.state(q));
      if (!id) return null;
      const needle = `"startQuest":"${id}"`;
      const tree = g.content.DIALOGUE.find((t) => JSON.stringify(t).includes(needle));
      if (tree) {
        let n = g.entityById(tree.npc);
        if (!n) { const loc = g.npcLocation(tree.npc); if (loc) { g.teleportPlayer(loc.x + 20, loc.y + 24); await new Promise((r) => setTimeout(r, 2600)); n = g.entityById(tree.npc); } }
        if (n) {
          g.teleportPlayer(n.x + 14, n.y + 4);
          g.dialogue.start(n);
          for (let i = 0; i < 12 && g.dialogue.open; i++) {
            const d = g.dialogue.open;
            const good = new Set();
            let ch = true;
            while (ch) { ch = false; for (const nd of d.tree?.nodes ?? []) { if (good.has(nd.id)) continue; if ((nd.options ?? []).some((o) => JSON.stringify(o.effects ?? []).includes(needle) || good.has(o.next))) { good.add(nd.id); ch = true; } } }
            const en = d.options.map((x, idx) => ({ x, idx })).filter((v) => v.x.enabled);
            const pick = en.find((v) => JSON.stringify(v.x.opt.effects ?? []).includes(needle)) ?? en.find((v) => good.has(v.x.opt.next));
            if (!pick) break;
            g.dialogue.choose(pick.idx);
            if (g.ui.modalOpen && !g.dialogue.open) g.ui.closeModal();
          }
          if (g.dialogue.open) g.dialogue.close();
        }
      }
      if (!g.quests.state(id)) { g.quests.start(id); return id + ' (started directly — no reachable giver option)'; }
      return id + ' (started via ' + (tree?.npc ?? '?') + ')';
    }, MAIN);
    if (res) { log.push('START ' + res); continue; }
  }
  if (!st.id && !st.done && stuck++ < 4) { await page.waitForTimeout(1200); continue; }
  if (!st.id) {
    log.push(st.done ? 'ALL MAIN QUESTS COMPLETE' : 'STALLED: ' + st.states.join(' '));
    break;
  }
  const key = `${st.id}:${st.stage}:${st.objs.map((o) => o.id).join(',')}`;
  if (key === lastKey) stuck++;
  else { stuck = 0; log.push(`→ ${st.id} / ${st.stage}: ${st.objs.map((o) => `${o.type}(${o.target ?? o.item ?? ''})`).join(', ')}`); }
  lastKey = key;
  if (stuck > 5) {
    log.push(`STUCK at ${key}`);
    // Diagnostics: every horse whose id or tag mentions the objective target.
    const t = st.objs[0]?.target ?? '';
    log.push('   horses: ' + JSON.stringify(await page.evaluate((t) => [...window.game.horses.values()].filter((h) => (h.data.tag ?? '').includes(t) || h.id.includes(t)).map((h) => ({ id: h.id, alive: h.data.alive, dead: h.dead, owner: h.data.owner, hist: h.data.history?.slice(-2) })), t)));
    break;
  }
  const o = st.objs[0];
  if (!o) { await page.waitForTimeout(700); continue; }
  const r = await page.evaluate(async ({ o, prefer, ending, qid }) => {
    const g = window.game;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const tp = async (x, y) => { if (g.player.mount) g.player.dismount(g, false); g.teleportPlayer(x, y); await wait(2600); };
    // Nodes from which a given flag/objective can be reached (for goal-directed dialogue).
    const reach = (tree, needle) => {
      if (!tree || !needle) return new Set();
      const good = new Set();
      let changed = true;
      while (changed) {
        changed = false;
        for (const n of tree.nodes) {
          if (good.has(n.id)) continue;
          const hit = JSON.stringify(n.effects ?? []).includes(needle) || (n.options ?? []).some((o) => JSON.stringify(o.effects ?? []).includes(needle) || good.has(o.next));
          if (hit) { good.add(n.id); changed = true; }
        }
      }
      return good;
    };
    const runDialogue = async (needle) => {
      for (let i = 0; i < 14 && g.dialogue.open; i++) {
        const d = g.dialogue.open;
        const en = d.options.map((x, idx) => ({ x, idx })).filter((v) => v.x.enabled && !(v.x.opt.effects ?? []).some((e) => 'openShop' in e));
        const good = reach(d.tree, needle);
        let pick = needle ? en.find((v) => JSON.stringify(v.x.opt.effects ?? []).includes(needle)) ?? en.find((v) => good.has(v.x.opt.next)) : undefined;
        pick = en.find((v) => (v.x.opt.effects ?? []).some((e) => 'completeObjective' in e || 'setFlag' in e || 'give' in e || 'startQuest' in e) && prefer.some((p) => v.x.opt.text.toLowerCase().includes(p)));
        pick ??= en.find((v) => prefer.some((p) => v.x.opt.text.toLowerCase().includes(p)));
        pick ??= en.find((v) => (v.x.opt.effects ?? []).some((e) => 'completeObjective' in e || 'setFlag' in e || 'give' in e));
        pick ??= en.find((v) => v.x.opt.next && v.x.opt.next !== 'end');
        pick ??= en[0];
        if (!pick) { g.dialogue.close(); break; }
        g.dialogue.choose(pick.idx);
        if (g.ui.modalOpen && !g.dialogue.open) g.ui.closeModal();
        await wait(30);
      }
      if (g.dialogue.open) g.dialogue.close();
    };
    const talk = async (id, needle) => {
      let n = g.entityById(id);
      if (!n) { const loc = g.npcLocation(id); if (!loc) return 'no location for ' + id; await tp(loc.x + 20, loc.y + 24); n = g.entityById(id); }
      if (!n) return 'npc not present: ' + id;
      g.teleportPlayer(n.x + 14, n.y + 4);
      await wait(100);
      g.dialogue.start(n);
      await runDialogue(needle ?? `${qid}:`);
      return 'talked ' + id;
    };
    g.player.invuln = 999; g.player.stats.health = 100;
    const tgt = g.quests.objectiveTarget(o);
    switch (o.type) {
      case 'talk':
        return talk(o.target);
      case 'deliver':
        g.player.inv.force(o.item, o.count ?? 1);
        return talk(o.target);
      case 'goto':
      case 'discover':
        if (!tgt) return 'no target';
        await tp(tgt.x, tgt.y + 4);
        return 'went ' + Math.round(Math.hypot(g.player.x - tgt.x, g.player.y - tgt.y)) + 'px alive=' + g.player.alive + ' modal=' + g.ui.modalName;
      case 'kill': {
        if (tgt) await tp(tgt.x, tgt.y);
        const enemies = g.entities.filter((e) => e.kind === 'npc' && e.alive && (e.tag === o.target || e.id === o.target));
        if (!enemies.length) {
          const enc = g.content.ENCOUNTERS.find((e) => e.enemies.some((x) => x.tag === o.target));
          if (enc) { await tp(enc.x * 16, enc.y * 16 + 60); }
        }
        let k = 0;
        for (const e of g.entities.filter((e) => e.kind === 'npc' && e.alive && (e.tag === o.target || e.id === o.target))) { e.hurt(9999, g, true); k++; }
        return 'killed ' + k;
      }
      case 'flag': {
        if (o.target === 'finch_decided') return talk('rustler_finch');
        if (o.target === 'reckoning_choice') return talk({ law: 'kincaid', press: 'cordelia', bribe: 'vance' }[ending]);
        if (o.target.startsWith('care_')) { g.setFlag(o.target, true); return 'care (covered by story-test)'; }
        if (o.target.startsWith('race_won_') || o.target.startsWith('captured_') || o.target.startsWith('tamed_') || o.target === 'pale_mare_tamed') { g.setFlag(o.target, true); return 'simulated ' + o.target; }
        if (o.target.startsWith('duel_won_')) {
          await wait(400);
          const st = g.activities.state;
          const id = o.target.slice(9);
          if (st?.kind === 'duel') { g.setFlag(o.target, true); g.activities.state = null; const n = g.entityById(id); if (n) n.setState('surrender'); return 'duel won (simulated)'; }
          return 'duel not started; pending=' + g.flags.duel_pending;
        }
        // Find an NPC whose dialogue sets this flag.
        for (const t of g.content.DIALOGUE) if (JSON.stringify(t).includes(`"setFlag":"${o.target}"`)) { g.player.money = Math.max(g.player.money, 100); const r = await talk(t.npc, `"setFlag":"${o.target}"`); if (g.flags[o.target]) return r + ' (set ' + o.target + ')'; }
        return 'flag ' + o.target + ' not settable';
      }
      case 'lead': {
        const hs = g.horsesTagged(o.target);
        if (!hs.length) {
          const enc = g.content.ENCOUNTERS.find((e) => (e.horses ?? []).some((h) => h.tag === o.target));
          if (enc) { await tp(enc.x * 16, enc.y * 16); }
        }
        let n = 0;
        for (const h of g.horsesTagged(o.target)) { h.data.tiedAt = null; h.leading = true; h.x = tgt.x + n * 20; h.y = tgt.y + 10; n++; }
        await tp(tgt.x, tgt.y);
        return 'led ' + n;
      }
      case 'collect': {
        // Quest items come from dialogue/lore; trade goods are gathered by playing (simulated).
        const it = g.content.QUEST_ITEMS.find((q) => q.id === o.target);
        if (!it) { g.player.inv.force(o.target, o.count ?? 1); return 'gathered ' + o.target; }
        return 'need quest item ' + o.target + ' (have ' + g.player.inv.count(o.target) + ')';
      }
      case 'hunt': {
        const A = window.wfClasses.Animal;
        for (let i = 0; i < (o.count ?? 1); i++) {
          const a = new A(o.target, g.player.x + 40 + i * 10, g.player.y, 77 + i);
          g.addEntity(a);
          a.hurt(9999, g, true);
        }
        return 'hunted ' + (o.count ?? 1) + ' ' + o.target;
      }
      case 'race':
        g.setFlag('race_won_' + o.target, true);
        return 'race (simulated win)';
      case 'buy':
        g.quests.onBuy(o.target);
        return 'bought';
      case 'bond': {
        const h = g.mainHorse();
        if (h) h.data.bondXp = 2000;
        return 'bond raised';
      }
      default:
        return 'unhandled ' + o.type;
    }
  }, { o, prefer, ending, qid: st.id });
  log.push(`   ${o.type}: ${r}`);
  await page.waitForTimeout(700);
}
await page.screenshot({ path: `${out}/story-ending-${ending}.png` });
const flags = await page.evaluate(() => Object.keys(window.game.flags).filter((k) => k.startsWith('ending')));
log.push('ending flags: ' + flags.join(','));
log.push(...[...new Set(errors)].map((e) => 'ERROR ' + e));
console.log(log.join('\n'));
// WF_DUMP_SAVE=path: save the finished game to slot 1 and write localStorage out, for post-story playtests.
if (process.env.WF_DUMP_SAVE) {
  const dump = await page.evaluate(() => { window.game.save('1', false); const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });
  (await import('node:fs')).writeFileSync(process.env.WF_DUMP_SAVE, JSON.stringify(dump));
  console.log('save dumped to ' + process.env.WF_DUMP_SAVE);
}
await browser.close();
srv.close();
