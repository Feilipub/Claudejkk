// Build script: bundles the game with esbuild into dist/, and also produces a
// single self-contained HTML file (dist/wild-frontier.html) with JS and fonts inlined.
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';

const serve = process.argv.includes('--serve');
// WF_OUT lets several people (or agents) build side by side without clobbering dist/.
const OUT = process.env.WF_OUT || 'dist';
mkdirSync(`${OUT}/fonts`, { recursive: true });

const entries = { game: 'src/main.ts', gallery: 'src/dev/gallery.ts' };
const result = await esbuild.build({
  entryPoints: entries,
  bundle: true,
  outdir: OUT,
  format: 'esm',
  target: 'es2022',
  minify: !serve,
  sourcemap: serve ? 'inline' : false,
  metafile: true,
  logLevel: 'warning',
  plugins: [{
    name: 'story-fallback',
    setup(b) {
      b.onResolve({ filter: /story\/index\.ts$/ }, () => existsSync('src/data/story/index.ts') ? undefined : { path: resolve('tools/stub/story-stub.ts') });
    },
  }],
});

for (const f of readdirSync('assets/fonts')) copyFileSync(join('assets/fonts', f), join(`${OUT}/fonts`, f));
const html = readFileSync('web/index.html', 'utf8');
writeFileSync(`${OUT}/index.html`, html);
writeFileSync(`${OUT}/gallery.html`, html.replace('game.js', 'gallery.js'));

// Single-file build: inline fonts as base64 and the JS bundle.
let single = html;
for (const f of readdirSync('assets/fonts')) {
  const b64 = readFileSync(join('assets/fonts', f)).toString('base64');
  single = single.replaceAll(`fonts/${f}`, `data:font/woff2;base64,${b64}`);
}
const js = readFileSync(`${OUT}/game.js`, 'utf8').replaceAll('</script', '<\\/script');
// A function replacement: the minified code can contain $' or $` sequences that a string replacement would expand.
single = single.replace('<script type="module" src="game.js"></script>', () => `<script type="module">${js}</script>`);
writeFileSync(`${OUT}/wild-frontier.html`, single);
// Artifact variant: page content only (the host adds the document skeleton).
const head = single.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<meta[^>]*>/g, '');
const bodyHtml = single.match(/<body>([\s\S]*?)<\/body>/)[1];
mkdirSync(`${OUT}/artifact`, { recursive: true });
writeFileSync(`${OUT}/artifact/wild-frontier.html`, `${head.trim()}\n${bodyHtml.trim()}\n`);
const kb = (n) => Math.round(n / 1024) + ' KB';
console.log('built', Object.entries(result.metafile.outputs).map(([k, v]) => `${k} ${kb(v.bytes)}`).join(', '), '| single file', kb(single.length));

if (serve) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.png': 'image/png' };
  const port = Number(process.env.PORT ?? 8080);
  createServer((req, res) => {
    let p = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (p === '/') p = '/index.html';
    try {
      const data = readFileSync(join(OUT, p));
      res.writeHead(200, { 'Content-Type': types[extname(p)] ?? 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  }).listen(port, () => console.log(`serving dist/ at http://localhost:${port}`));
}
