// Like scene.mjs, but on an emulated phone held sideways (touch UI on).
// Usage: node tools/phone-scene.mjs out.png "<js using g = window.game>" [waitMs] [device]
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const [outPath, setup = '', wait = '2500', device = 'iPhone 13 landscape'] = process.argv.slice(2);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2' };
const dir = process.env.WF_OUT || 'dist';
const srv = createServer((req, res) => {
  const p = (req.url ?? '/').split('?')[0];
  try { res.writeHead(200, { 'Content-Type': types[extname(p)] ?? 'application/octet-stream' }); res.end(readFileSync(join(dir, p === '/' ? 'index.html' : p))); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices[device] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:${srv.address().port}/index.html`);
await page.waitForFunction(() => window.wf?.ready, null, { timeout: 60000 });
await page.tap('#mnew');
await page.tap('#go');
await page.waitForFunction(() => window.wf.started);
await page.evaluate(() => document.body.classList.add('has-touch'));
const ret = await page.evaluate(`(async () => { const g = window.game; ${setup} })()`);
if (ret !== undefined) console.log(typeof ret === 'string' ? ret : JSON.stringify(ret, null, 1));
await page.waitForTimeout(+wait);
await page.screenshot({ path: outPath });
if (errors.length) console.log(errors.join('\n'));
await browser.close();
srv.close();
