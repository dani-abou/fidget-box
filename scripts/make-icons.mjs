// Renders scripts/icon.svg to the PNG icons in src/icons/. Run by hand
// (`npm run icons`) only when the artwork changes; the PNGs are committed,
// so the normal build and Railway never need a browser.
import { createRequire } from 'node:module';
// Playwright is not a project dependency; use the globally installed one.
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFile, mkdir } from 'node:fs/promises';

const svg = await readFile(new URL('./icon.svg', import.meta.url), 'utf8');
const art = svg.match(/<g id="art">[\s\S]*?<\/g>/)[0];
const defs = svg.match(/<defs>[\s\S]*?<\/defs>/)[0];
const BG = '#2A1D58';

// scale: how much of the canvas the artwork uses. Maskable icons must keep
// everything inside the central 80% circle, so the art is shrunk for them.
function page(size, { scale = 1, round = 0 } = {}) {
  const off = (512 - 512 * scale) / 2;
  return `<html><body style="margin:0;background:transparent">
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">${defs}
<rect width="512" height="512" rx="${round}" fill="${BG}"/>
<g transform="translate(${off} ${off}) scale(${scale})">${art}</g></svg></body></html>`;
}

const out = new URL('../src/icons/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const p = await browser.newPage({ deviceScaleFactor: 1 });
const jobs = [
  ['icon-192.png', 192, { scale: .92, round: 96 }],
  ['icon-512.png', 512, { scale: .92, round: 96 }],
  ['icon-maskable-512.png', 512, { scale: .72 }],
  ['apple-touch-icon.png', 180, { scale: .9 }], // iOS rounds the corners itself; no transparency
];
for (const [name, size, opts] of jobs) {
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(page(size, opts));
  await p.locator('svg').screenshot({ path: new URL(name, out).pathname, omitBackground: true });
  console.log('wrote', name);
}
await browser.close();
