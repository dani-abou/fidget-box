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
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4400 + Math.floor(Math.random() * 500);
const ORIGIN = `http://localhost:${PORT}`;
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
  ok(await page.locator('.tile').count() === 5, 'offline reload: home screen with 5 tiles');
  ok(await page.evaluate(() => document.getElementById('home').getBoundingClientRect().height > innerHeight * .8), 'home screen fills the height (hidden play area takes no space)');
  ok(await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('600 20px Fredoka'); }), 'offline reload: Fredoka font loaded from cache');
  const cold = watch(await ctx.newPage());
  await cold.goto(ORIGIN + '/?source=homescreen#spinner');
  ok((await cold.textContent('#title')) === 'Spinner', 'offline cold start of a new tab (like launching from the home screen)');
  await cold.close();

  const stage = async () => (await page.locator('#stage').boundingBox());
  const drag = async (pts) => {
    await page.mouse.move(pts[0][0], pts[0][1]); await page.mouse.down();
    for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y, { steps: 4 });
    await page.mouse.up();
  };
  const canvasInk = () => page.evaluate(() => {
    const c = document.querySelector('#stage canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n;
  });

  await page.click('.tile[data-go="bubbles"]'); await page.waitForTimeout(150);
  const sb = await page.locator('.sheet').boundingBox();
  const row = await page.locator('.bub').nth(0).boundingBox(); // aim through a row's centre, not the gap
  await drag([[sb.x + 30, row.y + row.height / 2], [sb.x + sb.width - 30, row.y + row.height / 2]]);
  ok(await page.locator('.bub.popped').count() >= 3, `bubbles: dragging popped ${await page.locator('.bub.popped').count()} bubbles (${await page.textContent('.count')})`);
  await page.click('.btn'); ok(await page.locator('.bub.popped').count() === 0, 'bubbles: New sheet resets');

  await page.click('#back'); await page.click('.tile[data-go="spinner"]'); await page.waitForTimeout(100);
  let b = await stage(); const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  await drag([[cx + 100, cy], [cx, cy + 100], [cx - 100, cy], [cx, cy - 100]]);
  await page.waitForTimeout(200);
  ok(/rpm/.test(await page.textContent('#stage .bar')), `spinner: flick spins it (${(await page.textContent('#stage .bar')).trim()})`);

  await page.click('#back'); await page.click('.tile[data-go="switches"]');
  await page.click('.tg >> nth=0'); ok((await page.getAttribute('.tg >> nth=0', 'aria-pressed')) === 'true', 'switchboard: toggle flips');
  await page.locator('.key').first().dispatchEvent('pointerdown'); ok(await page.locator('.key.down').count() === 1, 'switchboard: key presses down');
  await page.locator('.key').first().dispatchEvent('pointerup');
  await page.fill('.notch', '20'); ok((await page.inputValue('.notch')) === '20', 'switchboard: notched slider moves');

  await page.click('#back'); await page.click('.tile[data-go="ripples"]'); await page.waitForTimeout(100);
  b = await stage(); await drag([[b.x + 50, b.y + 100], [b.x + 200, b.y + 300], [b.x + 300, b.y + 500]]);
  ok(await canvasInk() > 100, 'ripples: touch draws rings');

  await page.click('#back'); await page.click('.tile[data-go="dots"]'); await page.waitForTimeout(150);
  b = await stage(); const before = await canvasInk();
  await drag([[b.x + 50, b.y + 200], [b.x + 300, b.y + 400]]);
  ok(before > 100, 'dots: grid drawn'); await page.click('#stage .btn');
  ok((await page.textContent('#stage .btn')) === 'Mode: pull', 'dots: push/pull toggles');
  await page.click('#back');
  ok(errors.length === 0, `no page errors while offline${errors.length ? ': ' + errors.join(' | ') : ''}`);

  // ---- 3. update flow ----
  await ctx.setOffline(false);
  const appJs = join(work, 'src/app.js');
  await writeFile(appJs, (await readFile(appJs, 'utf8')).replace('for the ride.', 'for the journey.'));
  ok(await waitFor(async () => !(await fetch(ORIGIN + '/sw.js').then(r => r.text())).includes(v1.slice(1))), 'rebuild produced a new sw.js version');
  await page.click('.tile[data-go="spinner"]');
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
