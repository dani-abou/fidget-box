// Builds src/data/words.txt from SCOWL (npm package wordlist-english, MIT /
// SCOWL licence: src/data/WORDS-LICENSE.txt). Run by hand: `npm run words`.
// Format: common words (SCOWL size <=35), a line "#", then less common words
// (sizes 40-50). All are accepted; only common ones count toward level targets.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const req = createRequire(import.meta.url);
let pkg;
try { pkg = dirname(req.resolve('wordlist-english/package.json')); }
catch { console.error('npm i --no-save wordlist-english   first'); process.exit(1); }
const tier = n => ['english', 'american'].flatMap(v => JSON.parse(readFileSync(join(pkg, `${v}-words-${n}.json`))));
const ok = w => /^[a-z]{3,10}$/.test(w);
const common = new Set([10, 20, 35].flatMap(tier).filter(ok));
const all = new Set([10, 20, 35, 40, 50].flatMap(tier).filter(ok));
const extra = [...all].filter(w => !common.has(w)).sort();
const out = new URL('../src/data/', import.meta.url);
writeFileSync(new URL('words.txt', out), [...common].sort().join('\n') + '\n#\n' + extra.join('\n') + '\n');
copyFileSync(join(pkg, 'Copyright'), new URL('WORDS-LICENSE.txt', out));
console.log(`words.txt: ${common.size} common + ${extra.length} extra`);
