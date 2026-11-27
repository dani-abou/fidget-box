// Shell: home screen (built from games/registry.js), hash router, settings
// chips, and the service-worker update toast. Game logic lives in games/.
import ids from './games/registry.js';
import { settings, setSetting } from './lib/settings.js';
import { ac, buzz } from './lib/sound.js';
import { readPal } from './lib/palette.js';

const VERSION = '__BUILD_VERSION__'; // replaced by build.mjs with the content hash
const $ = id => document.getElementById(id);
const home = $('home'), play = $('play'), stage = $('stage'), back = $('back'), title = $('title');

/* ---------- iOS: block pinch zoom (Safari ignores user-scalable=no) ---------- */
for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(t, e => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

/* ---------- settings chips ---------- */
const sndBtn = $('snd'), vibBtn = $('vib');
sndBtn.setAttribute('aria-pressed', settings.sound); vibBtn.setAttribute('aria-pressed', settings.buzz);
if (!('vibrate' in navigator)) vibBtn.hidden = true;
sndBtn.onclick = () => { setSetting('sound', !settings.sound); sndBtn.setAttribute('aria-pressed', settings.sound); if (settings.sound) ac(); };
vibBtn.onclick = () => { setSetting('buzz', !settings.buzz); vibBtn.setAttribute('aria-pressed', settings.buzz); buzz(20); };

/* ---------- games ---------- */
const mods = await Promise.all(ids.map(id => import(`./games/${id}.js`).then(m => m.default)));
const games = new Map();
for (const g of mods) {
  if (games.has(g.id)) console.warn('Duplicate game id', g.id);
  games.set(g.id, g);
  if (g.css) { const s = document.createElement('style'); s.dataset.game = g.id; s.textContent = g.css; document.head.append(s); }
}

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
$('sub').textContent = `${WORDS[mods.length] ?? mods.length} game${mods.length === 1 ? '' : 's'} for the ride. No ads, ever.`;
$('ver').textContent = 'v' + VERSION;

const tiles = $('tiles');
for (const g of mods) {
  const b = document.createElement('button');
  b.className = 'tile'; b.dataset.go = g.id; b.style.setProperty('--c', `var(${g.color})`);
  b.innerHTML = `${g.icon}<span class="name"></span><span class="desc"></span>`;
  b.querySelector('.name').textContent = g.name; b.querySelector('.desc').textContent = g.description;
  b.onclick = () => { ac(); location.hash = g.id; };
  tiles.append(b);
}

/* ---------- router ---------- */
const toast = $('toast');
let waiting = null; // a downloaded service worker waiting to take over
function syncToast() { toast.classList.toggle('show', !!waiting && !home.hidden); }

let cleanup = null;
function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  stage.innerHTML = '';
  const g = games.get(location.hash.slice(1)); readPal();
  if (g) { home.hidden = true; play.hidden = false; back.hidden = false; title.textContent = g.name; cleanup = g.init(stage) || null; }
  else { home.hidden = false; play.hidden = true; back.hidden = true; title.textContent = ''; }
  syncToast();
}
back.onclick = () => { location.hash = ''; };
window.addEventListener('hashchange', route);
route();

/* ---------- service worker + update toast ---------- */
// The toast only shows on the home screen; if an update lands mid-game it
// waits until you go back. Tapping it activates the new worker and reloads.

if ('serviceWorker' in navigator) {
  const reg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
  const hadController = !!navigator.serviceWorker.controller;
  const offer = w => { if (w && navigator.serviceWorker.controller) { waiting = w; syncToast(); } };
  offer(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const w = reg.installing;
    w?.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); });
  });
  const check = () => { if (navigator.onLine) reg.update().catch(() => {}); };
  check();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  window.addEventListener('online', check);

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // First install claims the page silently; only reload when replacing an old worker.
    if (!hadController || reloading) return;
    reloading = true; location.reload();
  });
  toast.onclick = () => { if (waiting) waiting.postMessage('SKIP_WAITING'); toast.classList.remove('show'); };
}
