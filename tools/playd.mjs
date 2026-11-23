// Human-style playtest daemon: keeps one browser running the game and accepts
// only human inputs (keys, mouse, waiting) plus screenshots and visible UI text.
// No access to game internals — testers see what a player sees.
// Usage: node tools/playd.mjs PORT   (then drive with tools/play.mjs)
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const port = +(process.argv[2] ?? 9300);
// `mobile` as the 2nd argument emulates a phone held sideways: touch only, no keyboard.
const mobile = process.argv[3] === 'mobile';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2' };
const files = createServer((req, res) => {
  const p = (req.url ?? '/').split('?')[0];
  try { res.writeHead(200, { 'Content-Type': types[extname(p)] ?? 'application/octet-stream' }); res.end(readFileSync(join(process.env.WF_OUT || 'dist', p === '/' ? 'index.html' : p))); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const browser = await chromium.launch();
const ctx = await browser.newContext(mobile ? { ...devices['iPhone 13 landscape'] } : { viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const cdp = mobile ? await ctx.newCDPSession(page) : null;
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:${files.address().port}/index.html`);
await page.waitForFunction(() => window.wf?.ready, null, { timeout: 60000 });

async function visibleText() {
  return page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.children.length && !['BUTTON', 'LABEL'].includes(el.tagName)) continue;
      const t = (el.innerText ?? '').trim();
      if (!t) continue;
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if (r.width < 1 || r.height < 1 || st.visibility === 'hidden' || st.display === 'none' || +st.opacity === 0) continue;
      out.push(t.replace(/\s+/g, ' '));
    }
    return [...new Set(out)].join(' | ').slice(0, 4000);
  });
}

async function run(a) {
  if (mobile && (a.press || a.hold || a.type || a.mouse)) return 'REFUSED: this is a phone — no keyboard or mouse. Use tap / tapText / stick / swipe.';
  if (a.tap) { await page.touchscreen.tap(a.tap[0], a.tap[1]); await page.waitForTimeout(a.after ?? 200); return `tapped ${a.tap}`; }
  if (a.tapText) { await page.getByText(a.tapText, { exact: false }).first().tap({ timeout: 3000 }); await page.waitForTimeout(250); return 'tapped text ' + a.tapText; }
  if (a.tapSel) { await page.tap(a.tapSel, { timeout: 3000 }); await page.waitForTimeout(250); return 'tapped ' + a.tapSel; }
  if (a.stick) {
    // Thumb on the left half: press, drag by (dx,dy) up to 60px, hold, release. Optionally hold a button with the other thumb.
    const [dx, dy] = a.stick;
    const x0 = 130, y0 = 280;
    const ms = Math.min(a.ms ?? 1000, 15000);
    const other = a.withTap ? [{ x: a.withTap[0], y: a.withTap[1], id: 2 }] : [];
    await touch('touchStart', [{ x: x0, y: y0, id: 1 }, ...other]);
    for (let i = 1; i <= 5; i++) { await touch('touchMove', [{ x: x0 + (dx * i) / 5, y: y0 + (dy * i) / 5, id: 1 }, ...other]); await page.waitForTimeout(30); }
    await page.waitForTimeout(ms);
    await touch('touchEnd', []);
    return `stick ${dx},${dy} for ${ms}ms`;
  }
  if (a.swipe) {
    const [x1, y1, x2, y2] = a.swipe;
    await touch('touchStart', [{ x: x1, y: y1, id: 3 }]);
    for (let i = 1; i <= 8; i++) { await touch('touchMove', [{ x: x1 + ((x2 - x1) * i) / 8, y: y1 + ((y2 - y1) * i) / 8, id: 3 }]); await page.waitForTimeout(25); }
    await touch('touchEnd', []);
    return 'swiped';
  }
  if (a.press) { await page.keyboard.press(a.press); await page.waitForTimeout(a.after ?? 150); return 'pressed ' + a.press; }
  if (a.hold) {
    const keys = Array.isArray(a.hold) ? a.hold : [a.hold];
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(Math.min(a.ms ?? 1000, 15000));
    for (const k of keys.reverse()) await page.keyboard.up(k);
    return `held ${keys.join('+')} ${a.ms}ms`;
  }
  if (a.type) { await page.keyboard.type(a.type, { delay: 30 }); return 'typed'; }
  if (a.click) { await page.click(a.click, { timeout: 3000 }); await page.waitForTimeout(200); return 'clicked ' + a.click; }
  if (a.clickText) { await page.getByText(a.clickText, { exact: false }).first().click({ timeout: 3000 }); await page.waitForTimeout(200); return 'clicked text ' + a.clickText; }
  if (a.mouse) {
    const [x, y] = a.mouse;
    await page.mouse.move(x, y);
    if (a.button) await page.mouse.click(x, y, { button: a.button });
    return `mouse ${x},${y} ${a.button ?? 'move'}`;
  }
  if (a.wait) { await page.waitForTimeout(Math.min(a.wait, 30000)); return 'waited ' + a.wait; }
  if (a.shot) { await page.screenshot({ path: a.shot }); return 'screenshot ' + a.shot; }
  if (a.text) return 'SCREEN TEXT: ' + (await visibleText());
  return 'unknown action ' + JSON.stringify(a);
}

createServer(async (req, res) => {
  let body = '';
  for await (const ch of req) body += ch;
  const out = [];
  try {
    const actions = JSON.parse(body);
    for (const a of actions) {
      try { out.push(await run(a)); } catch (e) { out.push('FAILED ' + JSON.stringify(a) + ': ' + e.message.split('\n')[0]); }
    }
  } catch (e) { out.push('bad json: ' + e.message); }
  if (errors.length) out.push('PAGE ERRORS: ' + errors.splice(0).join(' / '));
  res.end(out.join('\n'));
}).listen(port, () => console.log('playd ready on ' + port));
