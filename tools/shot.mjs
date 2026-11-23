// Screenshot helper: node tools/shot.mjs <page> <out.png> [waitExpr] [w] [h]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
const [page = 'index.html', out = 'shot.png', waitExpr = 'true', w = '1280', h = '720'] = process.argv.slice(2);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2' };
const srv = createServer((req, res) => {
  const p = (req.url ?? '/').split('?')[0];
  try { res.writeHead(200, { 'Content-Type': types[extname(p)] ?? 'application/octet-stream' }); res.end(readFileSync(join(process.env.WF_OUT || 'dist', p))); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = srv.address().port;
const browser = await chromium.launch();
const pg = await browser.newPage({ viewport: { width: +w, height: +h } });
const errors = [];
pg.on('pageerror', (e) => errors.push(String(e)));
pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await pg.goto(`http://localhost:${port}/${page}`);
await pg.waitForFunction(waitExpr, null, { timeout: 30000 }).catch((e) => errors.push('wait: ' + e.message));
await pg.screenshot({ path: out, fullPage: true });
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
srv.close();
