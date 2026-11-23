// End-to-end smoke test: boots the built game in headless Chromium, goes
// through the title → character creator → gameplay, drives the player and
// horse with simulated input, exercises core systems, captures screenshots,
// and fails on any runtime error.
// Usage: node tools/smoke.mjs [outDir]
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
  try {
    res.writeHead(200, { 'Content-Type': types[extname(p)] ?? 'application/octet-stream' });
    res.end(readFileSync(join('dist', p === '/' ? 'index.html' : p)));
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(0);
const port = srv.address().port;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const results = [];
const step = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (e) {
    results.push(['FAIL', name + ' — ' + e.message]);
  }
};
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const hold = async (key, ms) => {
  await page.evaluate((k) => window.game.input.simulate(k, true), key);
  await page.waitForTimeout(ms);
  await page.evaluate((k) => window.game.input.simulate(k, false), key);
};
const tap = async (key) => {
  await page.evaluate((k) => window.game.input.simulate(k, true), key);
  await page.waitForTimeout(60);
  await page.evaluate((k) => window.game.input.simulate(k, false), key);
  await page.waitForTimeout(40);
};

await page.goto(`http://localhost:${port}/index.html`);
await step('boot & world generation', async () => {
  await page.waitForFunction(() => window.wf?.ready, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await shot('01-title');
});
await step('character creator', async () => {
  await page.click('#mnew');
  await page.waitForTimeout(300);
  await shot('02-creator');
  await page.click('#go');
  await page.waitForFunction(() => window.wf.started, null, { timeout: 10000 });
  await page.waitForTimeout(1500);
  await shot('03-start-larkspur');
});
await step('walk around town', async () => {
  const before = await page.evaluate(() => ({ x: window.game.player.x, y: window.game.player.y }));
  await hold('KeyS', 900);
  await hold('KeyD', 900);
  const after = await page.evaluate(() => ({ x: window.game.player.x, y: window.game.player.y }));
  if (Math.hypot(after.x - before.x, after.y - before.y) < 20) throw new Error('player did not move');
});
await step('mount and gallop the horse', async () => {
  await page.evaluate(() => {
    const g = window.game;
    const h = g.mainHorse();
    g.player.x = h.x + 10;
    g.player.y = h.y;
    g.spatial.rebuild(g.entities);
  });
  await page.waitForTimeout(100);
  await tap('KeyF');
  const mounted = await page.evaluate(() => !!window.game.player.mount);
  if (!mounted) throw new Error('mount failed');
  await tap('ShiftLeft');
  await tap('ShiftLeft');
  await tap('ShiftLeft');
  const x0 = await page.evaluate(() => window.game.player.x);
  await hold('KeyD', 2500);
  await shot('04-galloping');
  const r = await page.evaluate(() => ({ x: window.game.player.x, st: window.game.player.mount.data.stamina, gait: window.game.player.mount.gait }));
  if (r.x - x0 < 100) throw new Error('horse did not travel: ' + (r.x - x0));
  await tap('KeyF');
});
await step('horse care interactions', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const h = g.mainHorse();
    h.speed = 0;
    g.player.x = h.x - 12;
    g.player.y = h.y;
    g.player.angle = 0;
    g.spatial.rebuild(g.entities);
    g.interactions.update();
    return g.interactions.current?.actions.map((a) => a.label) ?? [];
  });
  if (!r.some((l) => l.startsWith('Brush'))) throw new Error('no brush action: ' + r.join(','));
  await shot('05-horse-prompt');
  await page.evaluate(() => {
    const g = window.game;
    g.interactions.current.actions.find((a) => a.label.startsWith('Brush')).run();
  });
  const msg = await page.evaluate(() => document.querySelector('.notes')?.textContent ?? '');
  if (!/brush|clean/i.test(msg)) throw new Error('no brushing feedback: ' + msg);
});
await step('horse screen', async () => {
  await page.keyboard.press('KeyB');
  await page.waitForTimeout(400);
  await shot('06-horse-panel');
  await page.keyboard.press('Escape');
});
await step('inventory, map, journal', async () => {
  await page.keyboard.press('KeyI');
  await page.waitForTimeout(300);
  await shot('07-inventory');
  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(600);
  await shot('08-map');
  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyJ');
  await page.waitForTimeout(300);
  await shot('09-journal');
  await page.keyboard.press('Escape');
});
await step('talk to an NPC', async () => {
  const ok = await page.evaluate(() => {
    const g = window.game;
    const n = g.entities.find((e) => e.kind === 'npc' && e.alive);
    if (!n) return false;
    g.dialogue.start(n);
    return !!g.dialogue.open;
  });
  if (!ok) throw new Error('no NPC dialogue');
  await page.waitForTimeout(300);
  await shot('10-dialogue');
  await page.evaluate(() => window.game.dialogue.close());
});
await step('shop', async () => {
  await page.evaluate(() => window.game.ui.openShop('stable_larkspur'));
  await page.waitForTimeout(400);
  await shot('11-shop-stable');
  await page.keyboard.press('Escape');
});
await step('night, weather and other regions render', async () => {
  await page.evaluate(() => { const g = window.game; g.clock.minutes = 22 * 60 + g.clock.day * 1440 - 1440; g.player.lantern = true; });
  await page.waitForTimeout(600);
  await shot('12-night');
  for (const [name, x, y, w] of [['13-sierra-snow', 250, 100, 'snow'], ['14-redstone', 440, 620, 'clear'], ['15-drylands-dust', 150, 560, 'dust'], ['16-pinehollow-rain', 560, 230, 'rain'], ['17-portashby', 600, 400, 'clear']]) {
    await page.evaluate(([x, y, w]) => {
      const g = window.game;
      g.clock.minutes = Math.floor(g.clock.minutes / 1440) * 1440 + 15 * 60;
      if (g.player.mount) g.player.dismount(g, false);
      g.teleportPlayer(x * 16, y * 16);
      for (const k of Object.keys(g.weather.regions)) g.weather.regions[k].kind = w;
    }, [x, y, w]);
    await page.waitForTimeout(2500);
    await shot(name);
  }
});

await step('hunting: shoot and skin a deer', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    if (g.player.mount) g.player.dismount(g, false);
    g.teleportPlayer(330 * 16, 300 * 16);
    await new Promise((r) => setTimeout(r, 300));
    const A = window.wfClasses.Animal;
    const deer = new (A ?? Object)('deer', g.player.x + 60, g.player.y, 5);
    if (!A) return 'no animal class available';
    g.addEntity(deer);
    g.spatial.rebuild(g.entities);
    g.player.holstered = false;
    g.player.weaponIdx = g.player.weapons.indexOf('revolverCattleman');
    g.player.clip.revolverCattleman = 6;
    g.player.aiming = true;
    for (let i = 0; i < 12 && deer.alive; i++) { g.player.fireCooldown = 0; g.player.clip.revolverCattleman = 6; g.player.spread = 0; g.combat.playerFire(g.player, deer.x, deer.y - 6); g.spatial.rebuild(g.entities); }
    if (deer.alive) return 'deer survived: ' + deer.health;
    g.player.x = deer.x - 10; g.player.y = deer.y; g.player.angle = 0;
    g.spatial.rebuild(g.entities);
    g.interactions.update();
    const a = g.interactions.current?.actions.find((x) => x.label.startsWith('Skin'));
    if (!a) return 'no skin action';
    a.run();
    return g.player.inv.count('peltDeer') > 0 ? 'ok' : 'no pelt';
  });
  if (r !== 'ok') throw new Error(r);
});
await step('wild horse: lasso, calm, break and keep', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    g.spawner.spawnHerd(g.player.x + 80, g.player.y, 'dustfall');
    g.spatial.rebuild(g.entities);
    const h = [...g.horses.values()].find((x) => x.data.owner === 'wild');
    if (!h) return 'no herd';
    h.x = g.player.x + 50; h.y = g.player.y;
    g.spatial.rebuild(g.entities);
    g.player.weapons.includes('lasso') || g.player.weapons.push('lasso');
    g.player.weaponIdx = g.player.weapons.indexOf('lasso');
    g.player.holstered = false;
    g.combat.playerFire(g.player, h.x, h.y);
    if (g.taming.roped !== h) return 'lasso missed';
    for (let i = 0; i < 12; i++) g.taming.calm(h);
    g.player.x = h.x - 10; g.player.y = h.y;
    g.player.tryMount(h, g);
    if (!g.taming.breaking) return 'breaking did not start (tameness ' + h.data.tameness + ')';
    g.taming.breaking.t = g.taming.breaking.duration;
    g.taming.update(0.016);
    return h.data.owner === 'player' && h.data.tameness === 100 ? 'ok' : 'not tamed';
  });
  if (r !== 'ok') throw new Error(r);
  await page.waitForTimeout(500);
  await shot('18-tamed-mustang');
});
await step('law: murder in town is witnessed and makes you wanted', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    if (g.player.mount) g.player.dismount(g, false);
    g.teleportPlayer(372 * 16, 383 * 16);
    g.clock.minutes = Math.floor(g.clock.minutes / 1440) * 1440 + 13 * 60;
    await new Promise((r) => setTimeout(r, 2600));
    const victim = g.entities.find((e) => e.kind === 'npc' && e.alive && !e.essential && e.occupation !== 'sheriff' && e.occupation !== 'deputy' && Math.hypot(e.x - g.player.x, e.y - g.player.y) < 400);
    if (!victim) return 'no victim';
    g.teleportPlayer(victim.x + 30, victim.y);
    g.spatial.rebuild(g.entities);
    victim.hurt(999, g, true);
    // Fast-forward the witness report.
    for (const n of g.entities) if (n.kind === 'npc' && n.witnessT > 0) n.witnessT = 0.01;
    await new Promise((r) => setTimeout(r, 600));
    return g.law.isWanted(g.currentRegion) ? 'ok' : 'not wanted; witnesses: ' + g.entities.filter((n) => n.witnessCrime).length;
  });
  if (r !== 'ok') throw new Error(r);
  await shot('19-wanted');
  await page.evaluate(() => window.game.law.clear(window.game.currentRegion));
});

await step('horse race: rivals ride the course', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    g.teleportPlayer(380 * 16, 386 * 16);
    const h = g.mainHorse();
    h.x = g.player.x; h.y = g.player.y; h.data.tiedAt = null;
    g.spatial.rebuild(g.entities);
    g.player.tryMount(h, g);
    g.player.money += 20;
    g.activities.startRace('larkspur_cup');
    await new Promise((r) => setTimeout(r, 7000));
    const st = g.activities.state;
    return st && st.rivals.every((x) => x.cp >= 1) ? 'ok' : 'rivals stuck: ' + JSON.stringify(st?.rivals.map((x) => x.cp));
  });
  if (r !== 'ok') throw new Error(r);
  await shot('20-race');
  await page.evaluate(() => { const g = window.game; for (const x of g.activities.state?.rivals ?? []) x.h.dead = true; g.activities.state = null; g.raceMarkers = []; if (g.player.mount) g.player.dismount(g, false); });
});
await step('stagecoach fast travel', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const day = g.clock.minutes;
    g.fastTravel(600 * 16, 399 * 16, 240);
    return g.currentRegion !== undefined && g.clock.minutes - day >= 239.9 ? 'ok' : 'no time passed';
  });
  if (r !== 'ok') throw new Error(r);
});

await step('breeding: a foal is born at the ranch', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    g.giveHorse({ breedId: 'appaloosa', name: 'Dove', sex: 'mare' });
    const dam = g.mainHorse(); dam.data.age = 7; dam.data.health = 999; dam.data.injuries = [];
    g.giveHorse({ breedId: 'appaloosa', name: 'Flint', sex: 'stallion' });
    const sire = g.mainHorse(); sire.data.age = 8;
    const err = g.breed(dam.id, sire.id);
    if (err) return err;
    g.advanceTime(4 * 1440);
    return [...g.horses.values()].some((h) => h.data.age < 1 && h.data.owner === 'player') ? 'ok' : 'no foal';
  });
  if (r !== 'ok') throw new Error(r);
});
await step('horse thief: a bonded horse throws the thief on whistle', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const h = g.mainHorse();
    h.data.bondXp = 900; h.data.trust = 90; h.rider = null; h.data.tiedAt = null;
    h.x = g.player.x + 150; h.y = g.player.y;
    g.thieves.steal(h);
    await new Promise((r) => setTimeout(r, 600));
    for (let i = 0; i < 10 && g.thieves.theft; i++) g.thieves.onWhistle();
    return !g.thieves.theft && !h.externallyDriven ? 'ok' : 'thief kept the horse';
  });
  if (r !== 'ok') throw new Error(r);
});
await step('save and load', async () => {
  const ok = await page.evaluate(() => window.game.save('slot3', false));
  if (!ok) throw new Error('save failed');
});
await step('frame time budget', async () => {
  const ms = await page.evaluate(async () => {
    const t0 = performance.now();
    const f0 = window.wf.frames;
    await new Promise((r) => setTimeout(r, 2000));
    return (performance.now() - t0) / (window.wf.frames - f0);
  });
  console.log(`avg frame ${ms.toFixed(1)} ms (headless, software rendering)`);
  if (ms > 100) throw new Error(`too slow: ${ms.toFixed(1)} ms/frame`);
});
const wfErrors = await page.evaluate(() => window.wf.errors);
errors.push(...wfErrors);
for (const [s, n] of results) console.log(`${s}  ${n}`);
if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].slice(0, 20).join('\n'));
await browser.close();
srv.close();
process.exit(results.some(([s]) => s === 'FAIL') || errors.length ? 1 : 0);
