// Collect translation keys: every L('...'), tr`...` and known data fields, plus
// (optionally) the keys the game reported missing while running in pt-BR.
// Usage: node tools/i18n-extract.mjs [--missing dump.json] > keys.json
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const keys = new Set();
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.ts')) scan(readFileSync(p, 'utf8'));
  }
};
const unescape = (s) => s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n');
function scan(src) {
  // L('...') / L("...")
  for (const m of src.matchAll(/\bL\(\s*(['"])((?:\\.|(?!\1).)*)\1/g)) keys.add(unescape(m[2]));
  // tr`...${x}...` → {n}
  for (const m of src.matchAll(/\btr`((?:\\.|[^`])*)`/g)) {
    let i = 0;
    keys.add(m[1].replace(/\$\{[^}]*\}/g, () => `{${i++}}`));
  }
}
walk('src');
const mi = process.argv.indexOf('--missing');
if (mi > 0) for (const k of JSON.parse(readFileSync(process.argv[mi + 1], 'utf8'))) keys.add(k);
process.stdout.write(JSON.stringify([...keys].sort(), null, 1));
