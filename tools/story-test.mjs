// Story integration test: plays "A Letter from Larkspur" and the start of
// "Empty Corrals" through real dialogue, travel, horse choice and care actions.
// Usage: node tools/story-test.mjs [outDir]
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');

const out = process.argv[2] ?? 'production/qa/evidence';
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
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const log = [];
const ok = (c, msg) => { log.push(`${c ? 'PASS' : 'FAIL'}  ${msg}`); return c; };
await page.goto(`http://localhost:${srv.address().port}/index.html`);
await page.waitForFunction(() => window.wf?.ready, null, { timeout: 60000 });
await page.click('#mnew');
await page.click('#go');
await page.waitForFunction(() => window.wf.started);
await page.waitForTimeout(800);

const ev = (fn, arg) => page.evaluate(fn, arg);
const questStage = (id) => ev((id) => window.game.quests.state(id) && `${window.game.quests.state(id).status}:${window.game.quests.state(id).stage}`, id);
const talk = async (npcId) => {
  // Walk up to the NPC (teleport next to it) and open dialogue.
  const found = await ev(async (id) => {
    const g = window.game;
    let n = g.entityById(id);
    if (!n) {
      const loc = g.npcLocation(id);
      if (loc) g.teleportPlayer(loc.x + 20, loc.y + 20);
      await new Promise((r) => setTimeout(r, 2600));
      n = g.entityById(id);
    }
    if (!n) return false;
    g.teleportPlayer(n.x + 14, n.y + 4);
    g.dialogue.start(n);
    return true;
  }, npcId);
  return found;
};
const dialogueText = () => ev(() => window.game.dialogue.open ? { text: window.game.dialogue.open.text, opts: window.game.dialogue.open.options.map((o) => o.opt.text + (o.enabled ? '' : ' [locked]')) } : null);
const choose = (match) => ev((m) => {
  const d = window.game.dialogue.open;
  if (!d) return false;
  const i = d.options.findIndex((o) => o.enabled && o.opt.text.toLowerCase().includes(m.toLowerCase()));
  if (i < 0) return false;
  window.game.dialogue.choose(i);
  return true;
}, match);
const firstOption = () => ev(() => { const d = window.game.dialogue.open; if (!d) return false; const i = d.options.findIndex((o) => o.enabled && !(o.opt.effects ?? []).some((e) => 'openShop' in e)); window.game.dialogue.choose(Math.max(0, i)); if (window.game.ui.modalOpen && !window.game.dialogue.open) window.game.ui.closeModal(); return true; });

ok((await questStage('main_arrival'))?.startsWith('active'), `main_arrival auto-started (${await questStage('main_arrival')})`);
ok(await talk('josiah'), 'found Josiah at the livery');
await page.screenshot({ path: `${out}/story-01-josiah.png` });
log.push('  Josiah: ' + JSON.stringify(await dialogueText()).slice(0, 300));
for (let i = 0; i < 6 && (await dialogueText()); i++) await firstOption();
ok((await questStage('main_arrival')) !== 'active:livery', `after Josiah: ${await questStage('main_arrival')}`);

// Ride Biscuit to the ranch: teleport mounted near the ranch and let the goto fire.
await ev(() => {
  const g = window.game;
  const h = g.mainHorse();
  g.player.x = h.x; g.player.y = h.y; g.spatial.rebuild(g.entities);
  g.player.tryMount(h, g);
  g.teleportPlayer(300 * 16, 432 * 16);
});
await page.waitForTimeout(2500);
ok((await questStage('main_arrival')) !== 'active:ride_ranch', `arrived at ranch: ${await questStage('main_arrival')}`);
await page.screenshot({ path: `${out}/story-02-ranch.png` });
await ev(() => window.game.player.dismount(window.game, false));
ok(await talk('hollis'), 'found Hollis');
log.push('  Hollis: ' + JSON.stringify(await dialogueText()).slice(0, 400));
await page.screenshot({ path: `${out}/story-03-hollis.png` });
// Walk the conversation until the horse choice appears, then choose Juniper.
let chosen = false;
for (let i = 0; i < 10 && (await dialogueText()); i++) {
  if (await choose('juniper')) { chosen = true; break; }
  await firstOption();
}
for (let i = 0; i < 4 && (await dialogueText()); i++) await firstOption();
const horse = await ev(() => { const h = window.game.mainHorse(); return h && { name: h.data.name, breed: h.data.breedId }; });
ok(chosen && horse?.name === 'Juniper', `chose Juniper: ${JSON.stringify(horse)} stage ${await questStage('main_arrival')}`);
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/story-04-juniper.png` });

// Care tutorial using the real interaction actions.
await ev(() => window.game.player.inv.force('hay', 2));
for (const want of ['Brush', 'Feed', 'Water']) {
  const r = await ev((want) => {
    const g = window.game;
    const h = g.mainHorse();
    const corral = g.corrals.find((c) => c.settlementId === 'brannigan');
    // Stand at the trough for watering.
    if (want === 'Water') { h.x = corral.x * 16 + 40; h.y = corral.y * 16 + 40; g.player.x = corral.x * 16 + 24; g.player.y = corral.y * 16 + 26; }
    else { g.player.x = h.x - 12; g.player.y = h.y; }
    g.player.angle = Math.atan2(h.y - g.player.y, h.x - g.player.x);
    g.spatial.rebuild(g.entities);
    g.interactions.update();
    const a = g.interactions.current?.actions.find((x) => x.label.startsWith(want));
    if (!a) return 'missing: ' + (g.interactions.current?.actions.map((x) => x.label).join(',') ?? 'no target');
    a.run();
    return 'ok';
  }, want);
  ok(r === 'ok', `care action ${want}: ${r}`);
}
await page.waitForTimeout(1200);
ok((await questStage('main_arrival')) === 'active:reward', `care stage done: ${await questStage('main_arrival')}`);
ok(await talk('hollis'), 'back to Hollis');
for (let i = 0; i < 6 && (await dialogueText()); i++) await firstOption();
await page.waitForTimeout(1200);
ok((await questStage('main_arrival'))?.startsWith('completed'), `main_arrival complete: ${await questStage('main_arrival')}`);
const gear = await ev(() => window.game.mainHorse().data.gear);
ok(!!gear.saddle && !!gear.bags, 'tack fitted on horse: ' + JSON.stringify(gear));
ok((await questStage('main_tracks'))?.startsWith('active'), `main_tracks started: ${await questStage('main_tracks')}`);
await page.keyboard.press('KeyJ');
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/story-05-journal.png` });
await page.keyboard.press('Escape');
log.push(...[...new Set(errors)].map((e) => 'ERROR ' + e));
console.log(log.join('\n'));
await browser.close();
srv.close();
process.exit(log.some((l) => l.startsWith('FAIL') || l.startsWith('ERROR')) ? 1 : 0);
