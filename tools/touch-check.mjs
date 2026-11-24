// Joystick and movement regression check on an emulated phone with a *realistic* thumb
// (per-frame jitter, the way a real thumb trembles on glass). Fails loudly when:
//   - the stick ring does not appear under the finger (notch safe-area offset),
//   - the bottom-left corner is covered by anything that takes the touch (menu bar, prompt),
//   - the ridden horse ignores a trembling thumb (rein-lag reset bug),
//   - walking into a wall creeps sideways, or the sprite facing flickers on a diagonal.
// Screenshots go to the evidence dir. Exit code 1 on any failure.
// Usage: WF_OUT=<build dir> node tools/touch-check.mjs [evidence dir]
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] ?? 'production/qa/evidence/mobile-controls';
mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2' };
const dir = process.env.WF_OUT || 'dist';
const srv = createServer((req, res) => {
  const p = (req.url ?? '/').split('?')[0];
  try { res.writeHead(200, { 'Content-Type': types[extname(p)] ?? 'application/octet-stream' }); res.end(readFileSync(join(dir, p === '/' ? 'index.html' : p))); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13 landscape'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:${srv.address().port}/index.html`);
await page.waitForFunction(() => window.wf?.ready, null, { timeout: 60000 });
await page.tap('#mnew');
await page.tap('#go');
await page.waitForFunction(() => window.wf.started);
await page.evaluate(() => document.body.classList.add('has-touch'));
await page.waitForTimeout(600);
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
const ev = (js) => page.evaluate(`(() => { const g = window.game; ${js} })()`);
const sleep = (ms) => page.waitForTimeout(ms);
let seed = 7;
const rnd = (a) => { seed = (seed * 16807) % 2147483647; return ((seed / 2147483647) * 2 - 1) * a; };
const vp = page.viewportSize();
const X0 = 110, Y0 = vp.height - 70; // where a resting thumb lands

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++; };

async function stick(dx, dy, ms, j = 0) {
  await touch('touchStart', [{ x: X0, y: Y0, id: 1 }]);
  for (let i = 1; i <= 5; i++) { await touch('touchMove', [{ x: X0 + (dx * i) / 5, y: Y0 + (dy * i) / 5, id: 1 }]); await sleep(16); }
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { await touch('touchMove', [{ x: X0 + dx + rnd(j), y: Y0 + dy + rnd(j), id: 1 }]); await sleep(16); }
  await touch('touchEnd', []);
}

// 1. Ring under the finger, even when the HUD root is inset by a notch safe area.
for (const inset of ['0px', '47px']) {
  await ev(`document.getElementById('ui').style.inset = '0px 0px 0px ${inset}'`);
  await touch('touchStart', [{ x: X0, y: Y0, id: 1 }]);
  await sleep(60);
  const r = await ev(`const s = document.querySelector('.tstick').getBoundingClientRect(); return [s.left + s.width / 2, s.top + s.height / 2, s.width]`);
  await touch('touchEnd', []);
  check(Math.abs(r[0] - X0) < 2 && Math.abs(r[1] - Y0) < 2 && r[2] > 0, `stick ring under the thumb with safe-area inset ${inset} (ring at ${r[0].toFixed(0)},${r[1].toFixed(0)}, finger ${X0},${Y0})`);
}
await ev(`document.getElementById('ui').style.inset = ''`);

// 2. Nothing that swallows touches sits over the joystick corner, prompt open or not.
await ev(`g.giveHorse({ breedId: 'morgan', name: 'Biscuit', training: 'trained' }); const h = g.mainHorse(); h.x = g.player.x + 18; h.y = g.player.y; g.spatial.rebuild(g.entities);`);
await sleep(400);
const corner = [[40, vp.height - 40], [X0, Y0], [180, vp.height - 120], [60, vp.height - 160]];
const hits = await ev(`return ${JSON.stringify(corner)}.map(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? (e.closest('.tbtn, .tmenus, .modal, .dialogue') ? 'CONTROL:' + e.className : 'free') : 'free'; })`);
check(hits.every((h) => h === 'free'), `joystick corner is free of buttons and menus (${hits.join(', ')})`);
const bars = await ev(`const r = (s) => { const e = document.querySelector(s); const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; }; return { menus: r('.tmenus'), cores: r('.hud-cores'), mini: r('.minimap'), zone: r('.tzone') }`);
const ov = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
check(!ov(bars.menus, bars.cores) && !ov(bars.menus, bars.mini) && !ov(bars.menus, bars.zone), `menu bar clear of status plates, minimap and stick zone (bar ${bars.menus.map(Math.round)})`);
await page.screenshot({ path: `${out}/01-prompt-open.png` });
// A tap on a prompt row runs that action (the stick must not swallow it); a tap on a menu button opens the menu without a stick ring.
{
  const row = await ev(`const r = document.querySelector('.prompt .pa[data-i="0"]'); const b = r.getBoundingClientRect(); return [b.left + 20, b.top + b.height / 2, r.textContent.trim()]`);
  await ev(`window.__exec = []; const orig = g.interactions.execIndex.bind(g.interactions); g.interactions.execIndex = (i) => { window.__exec.push(i); return orig(i); }`);
  await page.touchscreen.tap(row[0], row[1]);
  await sleep(500);
  const ran = await ev(`return window.__exec`);
  check(ran.length === 1 && ran[0] === 0, `tapping the prompt row "${row[2]}" runs that action and only once (execIndex calls: ${JSON.stringify(ran)})`);
  const m = await ev(`const b = document.querySelector('.tmenus .ti-map').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]`);
  await page.touchscreen.tap(m[0], m[1]);
  await sleep(400);
  const r = await ev(`return [g.ui.modalOpen, document.querySelector('.tstick').classList.contains('on')]`);
  check(r[0] === true && r[1] === false, `tapping the Map button opens the map and does not start the stick`);
  await page.keyboard.press('Escape');
  await sleep(300);
  if (await ev(`return g.ui.modalOpen`)) await ev(`g.ui.closeModal?.(); document.querySelector('.modal .close, .modal .btn')?.click()`);
  await sleep(300);
}

// 3. On foot: moves on a diagonal with a trembling thumb, no facing flicker, stops on release.
await ev(`window.__s = []; (function samp(){ const p = g.player; window.__s.push([p.x, p.y, p.dir, p.flip, p.mount ? p.mount.heading : null, p.mount ? p.mount.speed : null]); requestAnimationFrame(samp); })()`);
await ev(`g.teleportPlayer(300 * 16, 300 * 16)`);
await sleep(300);
await ev(`window.__s.length = 0`);
await stick(40, 40, 1500, 1.5);
{
  const s = await ev(`return window.__s`);
  let flips = 0;
  for (let i = 1; i < s.length; i++) if (s[i][2] !== s[i - 1][2] || s[i][3] !== s[i - 1][3]) flips++;
  const d = [s.at(-1)[0] - s[0][0], s.at(-1)[1] - s[0][1]];
  check(d[0] > 40 && d[1] > 40, `walks on a diagonal with a trembling thumb (moved ${d.map((v) => v.toFixed(0))} px)`);
  check(flips <= 1, `sprite facing does not flicker on the diagonal (${flips} facing changes in ${s.length} frames)`);
}
{
  await stick(50, 0, 500, 0);
  const a = await ev(`return [g.player.x, g.player.y]`);
  await sleep(400);
  const b = await ev(`return [g.player.x, g.player.y]`);
  check(Math.hypot(b[0] - a[0], b[1] - a[1]) < 4, `stops when the thumb lifts (drift ${Math.hypot(b[0] - a[0], b[1] - a[1]).toFixed(1)} px)`);
}

// 4. Walls: pushing into a wall stops you (no sideways creep); pushing straight at a doorway funnels you in.
const bld = await ev(`const b = g.world.buildings.find(b => b.settlementId === 'larkspur' && !b.ruined); return { x: b.x, y: b.y, w: b.w, h: b.h, doorX: b.doorX, doorY: b.doorY }`);
await ev(`g.teleportPlayer(${bld.x * 16 + 8}, ${(bld.y + bld.h) * 16 + 8 + 4})`);
await sleep(200);
let p0 = await ev(`return [g.player.x, g.player.y]`);
await stick(0, -50, 1200, 1.5);
let p1 = await ev(`return [g.player.x, g.player.y]`);
check(Math.abs(p1[0] - p0[0]) < 2, `pushing up into a wall does not creep sideways (drift ${(p1[0] - p0[0]).toFixed(1)} px)`);
await ev(`g.teleportPlayer(${bld.doorX * 16 + 8 + 14}, ${bld.doorY * 16 + 8 + 20})`);
await sleep(200);
await stick(0, -50, 1200, 1.5);
p1 = await ev(`return [g.player.x, g.player.y, !!g.world.insideBuilding(g.player.x, g.player.y)]`);
check(p1[2] === true, `pushing straight at a doorway (14 px off) funnels you through it (inside=${p1[2]})`);
await page.screenshot({ path: `${out}/02-doorway.png` });

// 5. Mounted: the horse answers a trembling thumb and follows a slow sweep.
await ev(`g.teleportPlayer(300 * 16, 300 * 16); const h = g.mainHorse(); h.x = g.player.x + 10; h.y = g.player.y; g.spatial.rebuild(g.entities); g.player.tryMount(h, g);`);
await sleep(300);
check(await ev(`return !!g.player.mount`), 'mounted for the riding checks');
await ev(`g.player.mount.heading = 0; g.player.mount.speed = 0; g.player.mount.gaitLevel = 2; window.__s.length = 0`);
await stick(0, -50, 1500, 1.5);
{
  const s = await ev(`return window.__s`);
  const idx = s.findIndex((r) => r[4] !== null && Math.abs((((r[4] + Math.PI / 2) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI) < 0.3);
  check(idx >= 0 && idx < 70, `horse turns north from east under a trembling thumb (within 17° at frame ${idx} of ${s.length})`);
}
{
  await ev(`g.player.mount.heading = -Math.PI / 2; g.player.mount.speed = 60; g.player.mount.gaitLevel = 3;`);
  await touch('touchStart', [{ x: X0, y: Y0, id: 1 }]);
  const steps = 120;
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + (Math.PI / 2) * (i / steps);
    await touch('touchMove', [{ x: X0 + Math.cos(a) * 50 + rnd(1.5), y: Y0 + Math.sin(a) * 50 + rnd(1.5), id: 1 }]);
    await sleep(16);
  }
  await sleep(200);
  const h = await ev(`return g.player.mount.heading`);
  await page.screenshot({ path: `${out}/03-riding.png` });
  await touch('touchEnd', []);
  check(Math.abs(h) < 0.35, `horse follows a slow thumb sweep north→east (final heading ${(h * 180 / Math.PI).toFixed(0)}°)`);
}
check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
srv.close();
console.log(failed ? `${failed} check(s) FAILED` : 'all touch checks passed');
process.exit(failed ? 1 : 0);
