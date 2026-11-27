// Tiny build: copy src/ to dist/, stamp a content hash as the version, and
// write the service worker's precache list from whatever is actually in dist/.
// No bundler, no dependencies. (`npm run dev` rebuilds on change.)
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const SRC = join(root, 'src'), DIST = join(root, 'dist');
const TEXT = /\.(html|js|css|webmanifest|json|svg|txt)$/;

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    out.push(...(e.isDirectory() ? await walk(p) : [p]));
  }
  return out;
}
const rel = p => relative(SRC, p).split(sep).join('/');

async function checkRegistry(files) {
  const reg = await readFile(join(SRC, 'games/registry.js'), 'utf8');
  const ids = [...reg.matchAll(/^\s*'([\w-]+)'\s*,?\s*$/gm)].map(m => m[1]);
  const gameFiles = files.map(rel).filter(f => /^games\/[\w-]+\.js$/.test(f) && f !== 'games/registry.js');
  const errors = [];
  for (const id of ids) {
    const f = `games/${id}.js`;
    if (!gameFiles.includes(f)) { errors.push(`registry lists '${id}' but ${f} does not exist`); continue; }
    const src = await readFile(join(SRC, f), 'utf8');
    if (!new RegExp(`\\bid:\\s*['"]${id}['"]`).test(src)) errors.push(`${f} must export id: '${id}'`);
    for (const key of ['name', 'description', 'color', 'icon', 'init']) if (!new RegExp(`\\b${key}\\b`).test(src)) errors.push(`${f} is missing '${key}'`);
  }
  if (new Set(ids).size !== ids.length) errors.push('registry has a duplicate id');
  for (const f of gameFiles) if (!ids.includes(f.slice(6, -3))) console.warn(`note: ${f} is not in games/registry.js, so it won't appear on the home screen`);
  if (errors.length) throw new Error('Game registry problems:\n  ' + errors.join('\n  '));
  return ids;
}

export async function build() {
  const t0 = Date.now();
  const files = (await walk(SRC)).sort();
  const ids = await checkRegistry(files);

  // Version = hash of every source file's path and bytes. Same input, same version;
  // any change anywhere gives a new version and so a new service-worker cache.
  const h = createHash('sha256');
  const contents = new Map();
  for (const f of files) { const b = await readFile(f); contents.set(f, b); h.update(rel(f)).update('\0').update(b).update('\0'); }
  const version = h.digest('hex').slice(0, 10);

  const out = files.map(rel);
  const precache = ['./', ...out.filter(f => f !== 'sw.js' && f !== 'index.html'), 'index.html'].map(f => f === './' ? f : './' + f);

  // Icons get a content fingerprint in their URLs (icons/x.png?v=hash) in the page and manifest, so a new
  // icon is a new address: phones can't keep showing a cached old one when you add the app.
  const iconHash = {};
  for (const f of files) if (rel(f).startsWith('icons/')) iconHash[rel(f)] = createHash('sha256').update(contents.get(f)).digest('hex').slice(0, 8);
  const stampIcons = txt => txt.replace(/icons\/([\w.-]+\.png)/g, (m, name) => iconHash['icons/' + name] ? `${m}?v=${iconHash['icons/' + name]}` : m);

  await rm(DIST, { recursive: true, force: true });
  for (const f of files) {
    const dest = join(DIST, rel(f));
    await mkdir(dirname(dest), { recursive: true });
    let data = contents.get(f);
    if (TEXT.test(f)) {
      let s = data.toString('utf8').replaceAll('__BUILD_VERSION__', version);
      if (rel(f) === 'sw.js') s = s.replace('__PRECACHE_LIST__', JSON.stringify(precache, null, 2));
      if (rel(f) === 'index.html' || rel(f) === 'manifest.webmanifest') s = stampIcons(s);
      data = s;
    }
    await writeFile(dest, data);
  }
  console.log(`built dist/ v${version}: ${files.length} files, ${precache.length} precached, ${ids.length} games (${Date.now() - t0}ms)`);
  return version;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { await build(); } catch (e) { console.error(e.message); process.exit(1); }
}
