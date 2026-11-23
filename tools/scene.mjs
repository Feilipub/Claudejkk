// Visual QA helper: start a new game, run a setup snippet, wait, screenshot.
// Usage: node tools/scene.mjs out.png "<js using g = window.game>" [waitMs]
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const [outPath, setup = '', wait = '2500'] = process.argv.slice(2);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2' };
const srv = createServer((req, res) => {
  const p = (req.url ?? '/').split('?')[0];
  try { res.writeHead(200, { 'Content-Type': types[extname(p)] ?? 'application/octet-stream' }); res.end(readFileSync(join(process.env.WF_OUT || 'dist', p === '/' ? 'index.html' : p))); }
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
const ret = await page.evaluate(`(async () => { const g = window.game; ${setup} })()`);
if (ret !== undefined) console.log(typeof ret === "string" ? ret : JSON.stringify(ret, null, 1));
await page.waitForTimeout(+wait);
await page.screenshot({ path: outPath });
if (errors.length) console.log(errors.join('\n'));
await browser.close();
srv.close();
