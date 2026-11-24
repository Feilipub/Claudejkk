// Tour every screen in pt-BR and list the strings that had no translation.
// Usage: node tools/build.mjs && node tools/i18n-ui-keys.mjs > ui-keys.json
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const dir = process.env.WF_OUT || 'dist';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2' };
const srv = createServer((req, res) => {
  const p = (req.url ?? '/').split('?')[0];
  try { res.writeHead(200, { 'Content-Type': types[extname(p)] ?? 'application/octet-stream' }); res.end(readFileSync(join(dir, p === '/' ? 'index.html' : p))); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript(() => localStorage.setItem('wf_settings', JSON.stringify({ locale: 'pt-BR' })));
await page.goto(`http://localhost:${srv.address().port}/index.html`);
await page.waitForFunction(() => window.wf?.ready, null, { timeout: 60000 });
const step = async (js) => { try { await page.evaluate(`(async () => { const g = window.game; ${js} })()`); } catch (e) { process.stderr.write(`step failed: ${js.slice(0, 60)} → ${e.message.split('\n')[0]}\n`); } await page.waitForTimeout(150); };
await page.click('#mabout'); await page.waitForTimeout(200);
await page.click('#mback'); await page.waitForTimeout(200);
await page.click('#mnew'); await page.waitForTimeout(300);
await page.click('#go');
await page.waitForFunction(() => window.wf.started);
await page.waitForTimeout(800);
const tabsOf = async (sel) => { const n = await page.locator(sel).count(); for (let i = 0; i < n; i++) { await page.locator(sel).nth(i).click(); await page.waitForTimeout(120); } };
await step(`g.ui.openInventory(null);`);
await step(`g.ui.openInventory(g.mainHorse());`);
await step(`g.ui.openHorse(g.mainHorse());`); await tabsOf('.modal [data-tab]');
await step(`g.ui.openMap();`);
await step(`g.ui.openJournal();`); await tabsOf('.modal [data-tab]');
await step(`g.ui.openCharacter();`);
await step(`g.ui.openSettings();`);
await step(`g.ui.openPause();`);
await step(`g.ui.openShop('store_larkspur');`); await tabsOf('.modal [data-tab]');
await step(`g.ui.openShop('stable_larkspur');`); await tabsOf('.modal [data-tab]');
await step(`g.ui.openShop('saloon_larkspur');`); await tabsOf('.modal [data-tab]');
await step(`g.ui.openBlackjack(); document.querySelector('#bj .btn')?.click();`);
await step(`g.ui.openSleep('camp');`);
await step(`g.ui.closeModal(); const n = g.entityById('josiah'); g.teleportPlayer(n.x + 14, n.y + 4); g.dialogue.start(n);`);
await step(`g.dialogue.choose(0);`);
await step(`g.dialogue.close(); g.ui.closeModal();`);
// A few notifications and prompts: walk around the horse and the trough.
await step(`const h = g.mainHorse(); g.teleportPlayer(h.x + 18, h.y);`);
await page.waitForTimeout(600);
const missing = await page.evaluate(() => [...window.wfI18nMissing]);
const keep = missing.filter((k) => /[A-Za-z]{3,}/.test(k) && !/^\$?[\d.,:% ]+$/.test(k) && k.length < 400).sort();
process.stderr.write(`${keep.length} untranslated UI strings\n`);
process.stdout.write(JSON.stringify(keep, null, 1));
await browser.close();
srv.close();
