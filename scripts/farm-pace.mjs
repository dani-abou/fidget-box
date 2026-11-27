// Sunny Acres pacing check: plays every level with a bot that walks at the
// player's speed and does the sensible next thing (harvest, stock stalls, work
// the register, walk onto the first tile it can afford, buy cheap upgrades).
// Fast-forwarded, so all levels take seconds.
//   npm run farm:pace          (all levels)
//   npm run farm:pace -- 5     (just level 5)
// Prints the bot's finishing time against each level's limit. The bot is a
// quick, tireless player: aim for limits around 1.6-1.8x its time.
// Needs Playwright (global or node_modules), like scripts/verify.mjs.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const only = Number(process.argv[2]) || 0, PORT = 4900 + Math.floor(Math.random() * 90);
const server = spawn(process.execPath, ['server.mjs', '--dev'], { cwd: root, env: { ...process.env, PORT: String(PORT) } });
await new Promise(r => server.stdout.on('data', d => String(d).includes('serving') && r()));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`http://localhost:${PORT}/`); await page.evaluate(() => localStorage.clear());
  await page.goto(`http://localhost:${PORT}/#farm`); await page.waitForFunction(() => document.querySelector('.fm')?._dbg);
  const result = await page.evaluate(async only => {
    const { UNLOCKS, CONFIG: C, LEVELS } = await import('./games/farm/config.js');
    const out = [];
    for (let n = 1; n <= LEVELS.length; n++) {
      if (only && n !== only) continue;
      document.querySelector('#stage')._farm.start(n);
      const d = document.querySelector('.fm')._dbg; d.go();
      const DT = 1 / 30, dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
      const lvl = k => C.upgrades[k].levels[d.S.up[k] || 0], reg = C.register.mat;
      function botStep(dt) {
        const P = d.P, cap = lvl('carry'), speed = lvl('speed');
        const tiles = d.visibleTiles(), afford = tiles.find(u => d.coins + (d.S.partial[u.id] || 0) >= u.price);
        const cheapest = tiles.reduce((m, u) => Math.min(m, u.price - (d.S.partial[u.id] || 0)), Infinity);
        for (const [k, u] of Object.entries(C.upgrades)) {
          const l = d.S.up[k] || 0, cost = u.cost[l];
          if (cost !== undefined && (!u.needs || d.on(u.needs)) && d.coins >= cost && cost <= Math.min(cheapest, 400) * .6 && !afford) { d.coins -= cost; d.S.up[k] = l + 1; }
        }
        const queue = d.customers.some(c => c.state === 'queue'), cashier = d.helpers.some(h => h.kind === 'cashier');
        const types = new Set(P.stack.map(s => s.t));
        const sinkHere = d.sinks().filter(s => types.has(s.p) && s.room > 0).sort((a, b) => dist(P, a.at) - dist(P, b.at))[0];
        let target;
        if (afford) target = afford.at;
        else if (queue && !cashier) target = reg;
        else if (P.stack.length >= cap && sinkHere) target = sinkHere.at;
        else {
          // like a person: work the goal's chain first, anything else only if it has nothing to do
          const pick = only => {
            const cands = [];
            if (P.stack.length < cap) {
              for (const f of d.fields) if (d.on(f.id) && (!only || d.focus.has(f.crop)) && d.sinks().some(s => s.p === f.crop && s.room > 0)) for (const pl of f.plots) if (pl.g >= f.grow && !pl.claim) cands.push(pl);
              for (const p of Object.keys(C.products)) if (!only || d.focus.has(p)) for (const src of d.sources(p)) if (src.n > 0 && d.sinks().some(s => s.p === p && s.room > 2)) cands.push(src.at);
            }
            if (sinkHere && (!only || d.focus.has(sinkHere.p))) cands.push(sinkHere.at);
            return cands.sort((a, b) => dist(P, a) - dist(P, b))[0];
          };
          target = (d.focus.size && pick(true)) || pick(false) || reg;
        }
        const dd = dist(P, target);
        if (dd > .05) { const k = Math.min(dd, speed * dt) / dd; P.x += (target.x - P.x) * k; P.y += (target.y - P.y) * k; }
      }
      while (d.S.phase === 'play') { for (let i = 0; i < 300 && d.S.phase === 'play'; i++) { botStep(DT); d.update(DT); } await new Promise(r => setTimeout(r, 0)); }
      const L = LEVELS[n - 1], used = L.time - Math.max(0, d.S.timeLeft);
      out.push({ n, name: L.name, limit: L.time, used, won: d.goals().every(g => g.done), goals: d.goals().map(g => `${g.text} ${g.have}/${g.need}`).join(', ') + ' · built: ' + L.build.filter(id => d.S.unlocked.has(id)).join(' ') + ' · visible now: ' + d.visibleTiles().map(u => u.id).join(' ') });
    }
    return out;
  }, only);
  const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  console.log(' lvl  name              bot     limit   ratio  result');
  for (const r of result) console.log(`${String(r.n).padStart(4)}  ${r.name.padEnd(16)}  ${mmss(r.used).padStart(5)}  ${mmss(r.limit).padStart(6)}   ${(r.limit / r.used).toFixed(2).padStart(4)}x  ${r.won ? 'won' : 'LOST: ' + r.goals}`);
} finally { await browser.close(); server.kill(); }
