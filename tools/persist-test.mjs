// Persistence round-trip: play a little, save, reload the page, Continue,
// and compare player, horse, quest, flag, reputation and economy state.
// Also corrupts the main save to prove the backup copy is used.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2' };
const srv = createServer((req, res) => {
  const p = (req.url ?? '/').split('?')[0];
  try { res.writeHead(200, { 'Content-Type': types[extname(p)] ?? 'application/octet-stream' }); res.end(readFileSync(join(process.env.WF_OUT || 'dist', p === '/' ? 'index.html' : p))); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const url = `http://localhost:${srv.address().port}/index.html`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url);
await page.waitForFunction(() => window.wf?.ready, null, { timeout: 60000 });
await page.click('#mnew');
await page.fill('#nm', 'Ada Merriwether');
await page.click('#go');
await page.waitForFunction(() => window.wf.started);
const snap = () => page.evaluate(() => {
  const g = window.game;
  const h = g.mainHorse();
  return {
    name: g.player.name, money: Math.round(g.player.money * 100), beans: g.player.inv.count('beans'),
    x: Math.round(g.player.x), y: Math.round(g.player.y), day: g.clock.day, hour: Math.floor(g.clock.hour),
    horse: h && { id: h.id, name: h.data.name, bond: Math.round(h.data.bondXp), inj: h.data.injuries.length, saddle: h.data.gear.saddle, hist: h.data.history.length },
    quest: g.quests.state('main_arrival')?.stage, flag: g.flags.persist_marker, honor: g.rep.get('honor'),
    discovered: g.discovered.size, sat: JSON.stringify(g.economy.saturation),
  };
});
await page.evaluate(() => {
  const g = window.game;
  const h = g.mainHorse();
  h.data.bondXp = 222;
  g.injureHorse(h, 'cut', 40, 'test');
  g.player.money = 77.25;
  g.player.inv.force('beans', 5);
  g.setFlag('persist_marker', 'yes');
  g.rep.add('honor', 12);
  g.discoverPoi('eagleRock', true);
  g.economy.saturation['dustfall:peltDeer'] = 0.4; // per-region key (economy.load drops legacy region-less keys)
  g.save('slot2', false);
});
const before = await snap();
// Reload and continue from the title screen.
await page.reload();
await page.waitForFunction(() => window.wf?.ready, null, { timeout: 60000 });
await page.click('#mcont');
await page.waitForFunction(() => window.wf.started);
const after = await snap();
const same = JSON.stringify(before) === JSON.stringify(after);
console.log(same ? 'PASS  round trip identical' : 'FAIL  round trip differs\n' + JSON.stringify(before) + '\n' + JSON.stringify(after));
// Corrupt the main slot: the loader must fall back to the backup.
const bak = await page.evaluate(() => {
  const g = window.game;
  g.save('slot2', false); // previous good save becomes the backup
  localStorage.setItem('wildfrontier_save_slot2', '{"meta":{},"data":{"player":1},"checksum":1}');
  return g.load('slot2');
});
console.log(bak ? 'PASS  corrupted save falls back to backup' : 'FAIL  backup not used');
if (errors.length) console.log('ERRORS\n' + errors.join('\n'));
await browser.close();
srv.close();
process.exit(same && bak && !errors.length ? 0 : 1);
