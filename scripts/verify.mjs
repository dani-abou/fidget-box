// End-to-end check in headless Chromium (needs Playwright installed globally
// or in node_modules; it is not a dependency of the app):
//   1. first visit online installs the service worker; no third-party requests
//   2. offline: reload, cold-open a new tab, and play every game
//   3. update flow: edit a file, rebuild, toast waits while a game is open,
//      appears on the home screen, tap applies the new version, old cache gone
//   4. installability, as Chrome DevTools' Manifest panel reports it
// Runs against a temporary copy of the project, so src/ is never modified.
import { createRequire } from 'node:module';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4400 + Math.floor(Math.random() * 500);
const ORIGIN = `http://localhost:${PORT}`;
// Shortest solution for a Slide Free level: [[blockIndex, cellsToMove, horizontal], ...]
function solveSlide(blocks) {
  const N = 6, bl = blocks.map(([r, c, len, d]) => ({ r, c, len, h: d === 'h' })), start = bl.map(b => b.h ? b.c : b.r);
  const prev = new Map([[start.join(), null]]); let q = [start], goal = null;
  while (q.length && !goal) {
    const next = [];
    for (const s of q) {
      if (s[0] === N - 2) { goal = s; break; }
      const occ = new Set(); bl.forEach((b, j) => { for (let k = 0; k < b.len; k++) occ.add(b.h ? b.r * N + s[j] + k : (s[j] + k) * N + b.c); });
      bl.forEach((b, j) => {
        const cell = p => b.h ? b.r * N + p : p * N + b.c, add = to => { const t = [...s]; t[j] = to; if (!prev.has(t.join())) { prev.set(t.join(), [s, j, to - s[j], b.h]); next.push(t); } };
        for (let p = s[j] - 1; p >= 0 && !occ.has(cell(p)); p--) add(p);
        for (let p = s[j] + b.len; p < N && !occ.has(cell(p)); p++) add(p - b.len + 1);
      });
    }
    q = next;
  }
  const moves = []; for (let k = goal.join(); prev.get(k); ) { const [s, j, d, h] = prev.get(k); moves.unshift([j, d, h]); k = s.join(); }
  return moves;
}
// A common dictionary word on a Letter Trail board, with the cells to drag through.
function findWordPath(cells, size) {
  const text = readFileSync(join(root, 'src/data/words.txt'), 'utf8'); const common = new Set(text.split('\n#\n')[0].split('\n'));
  const pre = new Set(); for (const w of common) for (let i = 1; i < w.length; i++) pre.add(w.slice(0, i));
  let best = null; const used = [];
  const go = (i, w) => {
    w += cells[i]; used.push(i);
    if (w.length >= 4 && common.has(w) && (!best || w.length > best.word.length)) best = { word: w, cells: [...used] };
    if (pre.has(w)) { const r = Math.floor(i / size), c = i % size;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const rr = r + dr, cc = c + dc, j = rr * size + cc;
        if ((dr || dc) && rr >= 0 && cc >= 0 && rr < size && cc < size && !used.includes(j)) go(j, w); } }
    used.pop();
  };
  for (let i = 0; i < cells.length; i++) go(i, '');
  return best;
}
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

const work = await mkdtemp(join(tmpdir(), 'fidget-verify-'));
await cp(root, work, { recursive: true, filter: s => !/node_modules|[\\/]dist([\\/]|$)|[\\/]\.git([\\/]|$)/.test(s.slice(root.length)) });
const server = spawn(process.execPath, ['server.mjs', '--dev'], { cwd: work, env: { ...process.env, PORT: String(PORT) } });
let log = ''; server.stdout.on('data', d => log += d); server.stderr.on('data', d => log += d);
const waitFor = async (fn, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 100)); } return false; };
await waitFor(() => log.includes('serving'));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 1 });
ctx.setDefaultTimeout(15000);
const foreign = [], errors = [];
ctx.on('request', r => { if (!r.url().startsWith(ORIGIN) && !r.url().startsWith('data:')) foreign.push(r.url()); });
const watch = p => { p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); return p; };

try {
  // ---- 1. first visit ----
  const page = watch(await ctx.newPage());
  await page.goto(ORIGIN + '/');
  ok(await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 }).then(() => true, () => false), 'service worker installed and controlling the page');
  const v1 = (await page.textContent('#ver')).trim();
  const cached = await page.evaluate(async () => { const ks = await caches.keys(); const c = await caches.open(ks[0]); return { ks, n: (await c.keys()).length }; });
  ok(cached.ks.length === 1 && cached.n >= 20, `one versioned cache (${cached.ks[0]}) with ${cached.n} files`);

  // ---- 2. offline ----
  await ctx.setOffline(true);
  await page.reload();
  ok(await page.waitForFunction(() => document.querySelectorAll('.tile').length === 6, null, { timeout: 5000 }).then(() => true, () => false), 'offline reload: home screen with 6 games');
  ok(await page.evaluate(() => document.getElementById('home').getBoundingClientRect().height > innerHeight * .8), 'home screen fills the height (hidden play area takes no space)');
  ok(await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('600 20px Fredoka'); }), 'offline reload: Fredoka font loaded from cache');
  const cold = watch(await ctx.newPage());
  await cold.goto(ORIGIN + '/?source=homescreen#slide');
  ok(await cold.waitForFunction(() => document.getElementById('title').textContent === 'Slide Free', null, { timeout: 5000 }).then(() => true, () => false), 'offline cold start of a new tab (like launching from the home screen)');
  await cold.close();

  // --- Slide Free: solve level 1 by dragging blocks along a BFS solution ---
  await page.click('.tile[data-go="slide"]'); await page.waitForSelector('.sf-b');
  const lv1 = JSON.parse(await readFile(join(work, 'src/data/slide-levels.json'), 'utf8'))[0];
  const sol = solveSlide(lv1.blocks);
  ok(sol.length === lv1.min, `slide: level 1 needs ${lv1.min} moves (solver agrees: ${sol.length})`);
  const cellPx = (await page.locator('.sf-board').boundingBox()).width / 6;
  for (const [j, delta, horiz] of sol) {
    const bb = await page.locator('.sf-b').nth(j).boundingBox();
    const x = bb.x + Math.min(bb.width, cellPx) / 2, y = bb.y + Math.min(bb.height, cellPx) / 2;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + (horiz ? delta * cellPx : 0), y + (horiz ? 0 : delta * cellPx), { steps: 8 }); await page.mouse.up();
    await page.waitForTimeout(150);
  }
  ok(await page.waitForSelector('.panel h2:has-text("Level 1 cleared")', { timeout: 3000 }).then(() => true, () => false) && (await page.locator('.panel .big span.on').count()) === 3, 'slide: solving in the minimum shows "Level 1 cleared" with 3 stars');
  await page.click('.panel .btn.primary'); // next level
  ok(/Lv\s*2(?!\d)/.test(await page.textContent('#stage .stat')), 'slide: next level loads, progress saved');
  await page.click('#back');

  // --- Letter Trail: spell a real word by dragging across the board ---
  await page.click('.tile[data-go="words"]'); await page.waitForSelector('.lt-cell');
  const cells = await page.$$eval('.lt-cell', es => es.map(e => e.textContent.toLowerCase()));
  const path = findWordPath(cells, Math.sqrt(cells.length));
  ok(!!path, `words: found "${path?.word}" on the board`);
  const centre = async i => { const bb = await page.locator('.lt-cell').nth(i).boundingBox(); return [bb.x + bb.width / 2, bb.y + bb.height / 2]; };
  let [x0, y0] = await centre(path.cells[0]); await page.mouse.move(x0, y0); await page.mouse.down();
  for (const i of path.cells.slice(1)) { const [x, y] = await centre(i); await page.mouse.move(x, y, { steps: 6 }); }
  await page.mouse.up();
  ok(/\+\d/.test(await page.textContent('.lt-word')) && await page.locator('.lt-found span').count() === 1, `words: "${path.word}" scored (${(await page.textContent('#stage .stat')).trim()})`);
  await page.click('#stage .stop');
  ok(await page.waitForSelector('.panel h2', { timeout: 3000 }).then(() => true, () => false), 'words: Finish shows the result panel');
  await page.click('#back');

  // --- Sunny Acres: walk onto the carrots, they stack on your back; drop them at the stand ---
  await page.click('.tile[data-go="farm"]'); await page.waitForFunction(() => document.querySelector('.fm')?._dbg, null, { timeout: 5000 });
  ok(/Level 1/.test(await page.textContent('.panel h2')), 'farm: a level intro shows the goal before the clock starts');
  await page.click('.panel .btn.primary'); // Start
  await page.evaluate(() => { const d = document.querySelector('.fm')._dbg; d.P.x = 1.5; d.P.y = 31.5; });
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(900); await page.keyboard.up('ArrowRight');
  const picked = await page.evaluate(() => document.querySelector('.fm')._dbg.P.stack.length);
  ok(picked >= 2, `farm: walking over carrots picks them (${picked} on your back)`);
  await page.evaluate(() => { const d = document.querySelector('.fm')._dbg; d.P.x = d.stands[0].at.x; d.P.y = d.stands[0].at.y + .3; });
  ok(await page.waitForFunction(() => document.querySelector('.fm')._dbg.stands[0].stock > 0, null, { timeout: 3000 }).then(() => true, () => false), 'farm: standing at the stand stocks it');
  await page.click('#back');

  // --- Free Farm: no clock, straight into play ---
  await page.click('.tile[data-go="farm-free"]'); await page.waitForFunction(() => document.querySelector('.fm')?._dbg, null, { timeout: 5000 });
  ok(!(await page.locator('.panel').count()) && (await page.textContent('.fm-time')).includes('☰'), 'free farm: opens straight into play with a menu, no clock');
  await page.click('#back');

  // --- Tiny Inn: walk with the keyboard, then check a guest in at the desk ---
  await page.click('.tile[data-go="hotel"]'); await page.waitForFunction(() => document.querySelector('.ht')?._dbg, null, { timeout: 5000 });
  const hx = await page.evaluate(() => document.querySelector('.ht')._dbg.P.x);
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(600); await page.keyboard.up('ArrowRight');
  ok(await page.evaluate(x => document.querySelector('.ht')._dbg.P.x > x + .8, hx), 'hotel: player walks');
  await page.evaluate(() => { const d = document.querySelector('.ht')._dbg; d.P.x = 3.5; d.P.y = 18.4; });
  ok(await page.waitForFunction(() => document.querySelector('.ht')._dbg.piles.desk > 0, null, { timeout: 15000 }).then(() => true, () => false), 'hotel: standing at the desk checks a guest in (cash on the desk)');
  await page.click('#back');

  // --- Spades: bid, play three tricks, then reload and resume the same hand ---
  await page.click('.tile[data-go="spades"]');
  await page.waitForSelector('.sp-bidgo', { timeout: 12000 });
  { // slide the bid picker: dragging left by ~3 numbers' width (58px each) raises the bid from 1 to 4
    const bb = await page.locator('.sp-step .cur').boundingBox(), y = bb.y + bb.height / 2;
    await page.mouse.move(bb.x + bb.width / 2, y); await page.mouse.down(); await page.mouse.move(bb.x + bb.width / 2 - 180, y, { steps: 12 }); await page.mouse.up();
    ok((await page.textContent('.sp-step .cur')) === '4', `spades: sliding the bid picker changes the bid (1 -> ${await page.textContent('.sp-step .cur')})`);
  }
  await page.click('.sp-bidgo');
  // cards are fanned, so tap each card's visible left strip like a thumb would
  for (let t = 0; t < 3; t++) { await page.waitForSelector('.sp-hand .card.ok', { timeout: 12000 }); await page.locator('.sp-hand .card.ok').first().click({ position: { x: 16, y: 55 } }); }
  const handBefore = await page.locator('.sp-hand .card').count();
  const wonBefore = await page.$$eval('.sp-seat', es => es.map(e => e.textContent).join('|'));
  ok(handBefore === 10, `spades: played 3 cards legally (${handBefore} left in hand)`);
  await page.reload(); await page.waitForSelector('.sp-hand .card');
  const handAfter = await page.locator('.sp-hand .card').count();
  ok(handAfter === handBefore && (await page.textContent('#title')) === 'Spades', `spades: reload (offline) resumes the same hand (${handBefore} -> ${handAfter} cards)`);
  await page.click('#back');
  ok(errors.length === 0, `no page errors while offline${errors.length ? ': ' + errors.join(' | ') : ''}`);

  // ---- 3. update flow ----
  await ctx.setOffline(false);
  const appJs = join(work, 'src/app.js');
  await writeFile(appJs, (await readFile(appJs, 'utf8')).replace('for the ride.', 'for the journey.'));
  ok(await waitFor(async () => !(await fetch(ORIGIN + '/sw.js').then(r => r.text())).includes(v1.slice(1))), 'rebuild produced a new sw.js version');
  await page.click('.tile[data-go="slide"]');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); // app came back to the foreground
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration()).waiting, null, { timeout: 10000 });
  ok(!(await page.locator('#toast.show').count()), 'update downloaded, toast held back while a game is open');
  await page.click('#back');
  ok(await page.waitForSelector('#toast.show', { timeout: 5000 }).then(() => true, () => false), 'toast "Update ready, tap to reload" appears on the home screen');
  await Promise.all([page.waitForEvent('load'), page.click('#toast')]);
  await page.waitForFunction(v => document.querySelector('#ver').textContent.trim() !== v, v1);
  const v2 = (await page.textContent('#ver')).trim();
  ok(v2 !== v1 && (await page.textContent('#sub')).includes('journey'), `tap reloaded into the new version (${v1} -> ${v2})`);
  const keys = await page.evaluate(() => caches.keys());
  ok(keys.length === 1 && keys[0].endsWith(v2.slice(1)), `old cache deleted on activate (${keys.join(', ')})`);

  // ---- 4. installability ----
  const cdp = await ctx.newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  ok(installabilityErrors.length === 0, `installable per Chrome${installabilityErrors.length ? ': ' + JSON.stringify(installabilityErrors) : ''}`);
  const { url, errors: mErr } = await cdp.send('Page.getAppManifest');
  ok(url.endsWith('manifest.webmanifest') && mErr.length === 0, 'manifest parses with no errors');

  ok(foreign.length === 0, `no third-party requests${foreign.length ? ': ' + foreign.join(', ') : ''}`);
} catch (e) {
  ok(false, 'threw: ' + e.message);
} finally {
  await browser.close(); server.kill(); await rm(work, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
