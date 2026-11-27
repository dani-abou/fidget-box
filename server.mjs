// Minimal static server for dist/. No dependencies. Loads the whole (small)
// site into memory at start, with ETags and gzip for text files.
import { createServer } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const DIST = join(dirname(fileURLToPath(import.meta.url)), 'dist');
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
// sw.js, the page and the manifest must always be revalidated so updates are seen.
// Everything else revalidates too (cheap 304s); the service worker serves it offline.
// Fonts and icons rarely change, so they may sit in the HTTP cache for a day.
const cacheControl = p => /^\/(fonts|icons)\//.test(p) ? 'public, max-age=86400' : 'no-cache';

const SECURITY = {
  // Enforces "no third-party network calls": the page can only talk to this origin.
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
};

const files = new Map();
async function load(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { await load(p); continue; }
    const body = await readFile(p), type = MIME[extname(p)] || 'application/octet-stream';
    const url = '/' + relative(DIST, p).split(sep).join('/');
    const gz = /^(text|application\/(json|manifest)|image\/svg)/.test(type) && body.length > 512 ? gzipSync(body, { level: 9 }) : null;
    files.set(url, { body, gz, type, etag: '"' + createHash('sha1').update(body).digest('base64url').slice(0, 20) + '"' });
  }
}
// `node server.mjs --dev`: build, then rebuild and reload on every change in src/.
if (process.argv.includes('--dev')) {
  const { build } = await import('./build.mjs');
  const { watch } = await import('node:fs');
  await build();
  let timer;
  watch(join(DIST, '..', 'src'), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(async () => { try { await build(); files.clear(); await load(DIST); } catch (e) { console.error(e.message); } }, 100);
  });
}
await load(DIST).catch(() => { console.error('dist/ missing: run `npm run build` first'); process.exit(1); });

createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
  let path;
  try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  if (path === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }).end('ok'); return; }
  if (path.endsWith('/')) path += 'index.html';
  const f = files.get(path);
  if (!f) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY }).end('Not found'); return; }

  const headers = { 'Content-Type': f.type, 'Cache-Control': cacheControl(path), ETag: f.etag, Vary: 'Accept-Encoding', ...SECURITY };
  if (path === '/sw.js') headers['Service-Worker-Allowed'] = '/';
  if (req.headers['if-none-match'] === f.etag) { res.writeHead(304, headers).end(); return; }
  const useGz = f.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  const body = useGz ? f.gz : f.body;
  if (useGz) headers['Content-Encoding'] = 'gzip';
  headers['Content-Length'] = body.length;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}).listen(PORT, () => console.log(`fidget-box serving dist/ on http://localhost:${PORT}`));
