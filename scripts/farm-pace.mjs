// Sunny Acres pacing check: plays the real game loop with a bot that walks at
// the player's speed and does the sensible next thing (harvest, stock stalls,
// work the register, walk onto the first tile it can afford, buy cheap
// upgrades). Fast-forwarded, so 30 minutes of play take seconds.
//   npm run farm:pace            (default 30 game-minutes)
//   npm run farm:pace -- 60      (60 game-minutes)
// Prints when each unlock happened and the gap since the previous one.
// Needs Playwright (global or node_modules), like scripts/verify.mjs.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const minutes = Number(process.argv[2]) || 30, PORT = 4900 + Math.floor(Math.random() * 90);
const server = spawn(process.execPath, ['server.mjs', '--dev'], { cwd: root, env: { ...process.env, PORT: String(PORT) } });
await new Promise(r => server.stdout.on('data', d => String(d).includes('serving') && r()));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`http://localhost:${PORT}/`); await page.evaluate(() => localStorage.clear());
  await page.goto(`http://localhost:${PORT}/#farm`); await page.waitForFunction(() => document.querySelector('.fm')?._dbg);
  const result = await page.evaluate(async limit => {
    const d = document.querySelector('.fm')._dbg, DT = 1 / 30, log = [], ups = [];
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const { UNLOCKS, CONFIG: C } = await import('./games/farm/config.js');
    const lvl = k => C.upgrades[k].levels[d.S.up[k] || 0];
    const reg = C.register.mat;
    function botStep(dt) {
      const P = d.P, cap = lvl('carry'), speed = lvl('speed');
      const tiles = d.visibleTiles(), afford = tiles.find(u => d.coins + (d.S.partial[u.id] || 0) >= u.price);
      const cheapest = tiles.reduce((m, u) => Math.min(m, u.price - (d.S.partial[u.id] || 0)), Infinity);
      // buy an upgrade when it's cheap next to the next tile (as a person would at the mat)
      for (const [k, u] of Object.entries(C.upgrades)) {
        const l = d.S.up[k] || 0, cost = u.cost[l];
        if (cost !== undefined && (!u.needs || d.on(u.needs)) && d.coins >= cost && cost <= cheapest * .6 && !afford) { d.coins -= cost; d.S.up[k] = l + 1; ups.push({ id: 'upgrade:' + k + ' ' + (l + 1), price: cost }); }
      }
      const queue = d.customers.some(c => c.state === 'queue'), cashier = d.helpers.some(h => h.kind === 'cashier');
      const types = new Set(P.stack.map(s => s.t));
      const sinkHere = d.sinks().filter(s => types.has(s.p) && s.room > 0).sort((a, b) => dist(P, a.at) - dist(P, b.at))[0];
      let target;
      if (afford) target = afford.at;
      else if (queue && !cashier) target = reg;
      else if (P.stack.length >= cap && sinkHere) target = sinkHere.at;
      else {
        const cands = [];
        if (P.stack.length < cap) {
          for (const f of d.fields) if (d.on(f.id) && d.sinks().some(s => s.p === f.crop && s.room > 0)) for (const pl of f.plots) if (pl.g >= f.grow && !pl.claim) cands.push(pl);
          for (const p of Object.keys(C.products)) for (const src of d.sources(p)) if (src.n > 0 && d.sinks().some(s => s.p === p && s.room > 2)) cands.push(src.at);
        }
        if (sinkHere) cands.push(sinkHere.at);
        target = cands.sort((a, b) => dist(P, a) - dist(P, b))[0] || reg;
      }
      const dd = dist(P, target);
      if (dd > .05) { const k = Math.min(dd, speed * dt) / dd; P.x += (target.x - P.x) * k; P.y += (target.y - P.y) * k; }
    }
    let t = 0;
    while (t < limit * 60 && d.S.unlocked.size < UNLOCKS.length) {
      for (let i = 0; i < 300; i++) { botStep(DT); d.update(DT); t += DT; }
      for (const id of d.S.unlocked) if (!log.find(l => l.id === id)) log.push({ id, t, price: UNLOCKS.find(u => u.id === id).price });
      for (const u of ups.splice(0)) log.push({ ...u, t });
      await new Promise(r => setTimeout(r, 0));
    }
    return { log, t, coins: d.coins, earned: d.S.earned };
  }, minutes);
  const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  let prev = 0;
  console.log('time   gap    price  unlock');
  for (const l of result.log) { const upg = l.id.startsWith('upgrade:'); console.log(`${mmss(l.t).padStart(5)}  ${upg ? '      ' : (mmss(l.t - prev)).padStart(5) + ' '} ${String(l.price).padStart(5)}  ${l.id}`); if (!upg) prev = l.t; }
  console.log(`\n${mmss(result.t)} played, ${result.earned} coins earned, ${result.coins} in hand.`);
} finally { await browser.close(); server.kill(); }
