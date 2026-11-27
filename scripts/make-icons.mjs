// App icons. Each design is scripts/icons/<name>.svg with two marked parts:
//   <!--bg-->...<!--/bg-->    full-bleed background
//   <!--art-->...<!--/art-->  the artwork (shrunk for maskable icons)
//
//   npm run icons -- <name>        render that design into src/icons/*.png
//   npm run icons -- --preview out.png [a,b,c]   designs side by side, as on a home screen (all, or just those)
// The PNGs are committed, so the normal build and Railway never need a browser.
import { createRequire } from 'node:module';
import { readFile, readdir, mkdir } from 'node:fs/promises';
// Playwright is not a project dependency; use the globally installed one.
const { chromium } = createRequire(import.meta.url)('playwright');

const dir = new URL('./icons/', import.meta.url);
const part = (svg, tag) => (svg.match(new RegExp(`<!--${tag}-->([\\s\\S]*?)<!--/${tag}-->`)) || [])[1] || '';
async function design(name) {
  const svg = await readFile(new URL(`${name}.svg`, dir), 'utf8');
  return { defs: (svg.match(/<defs>[\s\S]*?<\/defs>/) || [''])[0], bg: part(svg, 'bg'), art: part(svg, 'art') };
}
// scale: how much of the canvas the artwork uses (maskable icons keep it inside the central 80% circle)
function svgFor(d, size, { scale = 1, round = 0, id = 'x' } = {}) {
  // give every internal id a per-icon prefix, so designs shown on one page don't borrow each other's gradients
  const ns = t => t.replace(/id="([^"]+)"/g, `id="i${id}-$1"`).replace(/url\(#([^)]+)\)/g, `url(#i${id}-$1)`);
  const defs = ns(d.defs), bg = ns(d.bg), art = ns(d.art);
  const off = (512 - 512 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">${defs}
<clipPath id="r${id}"><rect width="512" height="512" rx="${round}"/></clipPath>
<g clip-path="url(#r${id})">${bg}<g transform="translate(${off} ${off}) scale(${scale})">${art}</g></g></svg>`;
}

const args = process.argv.slice(2);
const browser = await chromium.launch();
const p = await browser.newPage({ deviceScaleFactor: 1 });
if (args[0] === '--preview') {
  const only = args[2] ? args[2].split(',') : null; // optional: a comma list of designs to show
  const names = (await readdir(dir)).filter(f => f.endsWith('.svg')).map(f => f.slice(0, -4)).filter(n => !only || only.includes(n)).sort((a, b) => only ? only.indexOf(a) - only.indexOf(b) : a.localeCompare(b));
  const tiles = [];
  for (const [i, n] of names.entries()) tiles.push(`<figure>${svgFor(await design(n), 150, { scale: .9, round: 115, id: i })}<figcaption>${i + 1}. ${n}</figcaption></figure>`);
  const html = `<html><body style="margin:0;background:linear-gradient(160deg,#1b2a4a,#3b1f4f 55%,#120d1f);font-family:-apple-system,system-ui,sans-serif">
<div style="display:grid;grid-template-columns:repeat(4,150px);gap:34px 30px;padding:36px 40px;width:max-content">
<style>figure{margin:0;text-align:center}figure svg{filter:drop-shadow(0 6px 14px rgba(0,0,0,.45))}figcaption{color:#fff;font-size:17px;margin-top:10px;font-weight:600}</style>${tiles.join('')}</div></body></html>`;
  await p.setContent(html); await p.setViewportSize({ width: 900, height: 600 });
  await p.locator('div').first().screenshot({ path: args[1] || 'icon-preview.png' });
  console.log('preview of', names.length, 'designs ->', args[1] || 'icon-preview.png');
} else {
  const name = args[0] || 'neon-box', d = await design(name);
  const out = new URL('../src/icons/', import.meta.url);
  await mkdir(out, { recursive: true });
  const jobs = [
    ['icon-192.png', 192, { scale: .92, round: 96 }],
    ['icon-512.png', 512, { scale: .92, round: 96 }],
    ['icon-maskable-512.png', 512, { scale: .72 }],
    ['apple-touch-icon.png', 180, { scale: .9 }], // iOS rounds the corners itself; no transparency
  ];
  for (const [file, size, opts] of jobs) {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<html><body style="margin:0;background:transparent">${svgFor(d, size, opts)}</body></html>`);
    await p.locator('svg').screenshot({ path: new URL(file, out).pathname, omitBackground: true });
    console.log('wrote', file, 'from', name);
  }
}
await browser.close();
