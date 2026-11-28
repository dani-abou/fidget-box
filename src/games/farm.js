// Sunny Acres: an arcade-idle farm played in timed levels. Drag anywhere to
// walk; everything happens by walking onto things. Harvest crops (they stack
// on your back), stock the market stands, work the register, and stand on
// price tiles to build. Each level gives you a farm, a few things to build, a
// goal and a clock. Numbers, layout and levels: farm/config.js. Drawing:
// farm/art.js. This file is the game loop. Levels and stars are saved.
import { ac, buzz, click, tone } from '../lib/sound.js';
import { progress, loadSave, writeSave } from '../lib/progress.js';
import { panel, levelPicker, starsHTML, pills } from '../lib/ui.js';
import { confetti } from '../lib/fx.js';
import { CONFIG as C, UNLOCKS, layoutFor, SHOWN_UNLOCKS, LOOKAHEAD, UNLOCK_SECONDS, UNLOCK_DWELL, TUTORIAL, LEVELS, STAR_TIME_LEFT, FREE, META } from './farm/config.js';
import { createArt, rr, INK } from './farm/art.js';

const START_IDS = new Set([...C.fields, ...C.stands, ...C.zones].filter(e => e.start).map(e => e.id));
const inRect = (p, r, pad = 0) => p.x > r.x - pad && p.x < r.x + r.w + pad && p.y > r.y - pad && p.y < r.y + r.h + pad;
// the zone a point is in; the market (in no zone) counts as the starting zone
const zoneAt = (zones, p) => zones.find(z => inRect(p, z)) || zones.find(z => z.start);
const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const easeBack = t => { t = Math.min(1, t); const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const up = (state, key) => C.upgrades[key].levels[state.up[key] || 0];
const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : String(Math.floor(n));

export const COIN = '<svg class="coin" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.6" fill="#FFC93C" stroke="#2B1D3A" stroke-width="2"/><circle cx="10" cy="10" r="5" fill="none" stroke="#E09A10" stroke-width="1.6"/><ellipse cx="7.6" cy="6.8" rx="1.4" ry="2.2" fill="#fff" opacity=".7" transform="rotate(-35 7.6 6.8)"/></svg>';
const ICON = { carrot: '🥕', corn: '🌽', egg: '🥚', bread: '🍞', pumpkin: '🎃', cheese: '🧀', wool: '🧶' };
const mmss = t => { t = Math.max(0, Math.ceil(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
/** Text for a level goal, e.g. "Sell 5 🍞". Exported for tests. */
export const goalText = gl =>
  gl.earn ? `Earn ${COIN}${fmt(gl.earn)}` : gl.sell ? `Sell ${gl.n} ${ICON[gl.sell]}` : gl.serve ? `Serve ${gl.serve} customers` :
  gl.fill ? `Fill the festival cart: ${Object.entries(gl.fill).map(([p, k]) => `${k} ${ICON[p]}`).join(' ')}` :
  gl.orders ? `Fill ${gl.orders} special orders${gl.with ? ` with ${ICON[gl.with]}` : ''}` :
  gl.crows !== undefined ? `Shoo the crows: lose no more than ${gl.crows} crops` :
  gl.streak ? `Serve ${gl.streak} happy customers in a row` :
  gl.builds ? `Build ${gl.builds} things` :
  gl.inspect ? `Pass ${gl.inspect.at.length} stall inspections (${gl.inspect.min}+ on the stall they pick)` :
  `Build the ${UNLOCKS.find(u => u.id === gl.build)?.label.toLowerCase()}`;
/** Stars for finishing with `left` of `total` seconds to spare. */
export const starsFor = (left, total) => left / total >= STAR_TIME_LEFT[0] ? 3 : left / total >= STAR_TIME_LEFT[1] ? 2 : 1;

const START_ON = id => START_IDS.has(id);
/** Coins per second the farm makes on its own (Free Farm offline earnings). Exported for tests. */
export function automatedRate(unlocked, upLevels = {}) {
  const on = id => START_ON(id) || unlocked.has(id);
  const has = kind => C.helpers.some(h => h.kind === kind && on(h.id));
  if (!has('cashier') || !has('carrier')) return 0;
  const mSpeed = C.upgrades.machineSpeed.levels[upLevels.machineSpeed || 0];
  const prod = p => {
    let u = 0;
    for (const f of C.fields) if (f.crop === p && on(f.id) && C.helpers.some(h => h.kind === 'farmhand' && on(h.id) && h.fields.includes(f.id))) u += f.w * f.h / f.grow;
    for (const pen of C.pens) if (pen.product === p && on(pen.id)) u += pen.animals / pen.interval;
    for (const m of C.machines) if (m.out === p && on(m.id)) u += Math.min(prod(m.in), mSpeed / m.time);
    return u;
  };
  const stands = C.stands.filter(s => on(s.id));
  const every = Math.max(C.customers.everyMin, C.customers.every + C.customers.everyPerStand * stands.length);
  const demand = (C.customers.buyMin + C.customers.buyMax) / 2 / every;
  let units = 0, value = 0;
  for (const s of stands) { const u = prod(s.product); units += u; value += u * C.products[s.product].price; }
  return units > 0 ? value * Math.min(1, demand / units) : 0;
}

// ---- seeds: the level mode's permanent currency ----
export const loadMeta = () => { const m = loadSave('farm-meta') || {}; return { seeds: m.seeds || 0, up: m.up || {}, total: m.total || 0 }; };
const saveMeta = m => writeSave('farm-meta', m);
export const metaValue = (m, k) => META.upgrades[k].levels[m.up[k] || 0];
/** Seeds for a win: first-win bonus, new stars over your best, plus a little for any win. */
export function seedsFor(stars, prevStars, mega) {
  const R = META.reward;
  const n = (prevStars ? 0 : R.firstWin) + Math.max(0, stars - prevStars) * R.perStar + R.replay;
  return mega ? n * R.megaMult : n;
}
/** The seed shop, as a panel over `host`. onChange runs after each purchase. */
function metaShop(host, onChange) {
  const m = loadMeta();
  panel(host, { title: `${META.icon} Seed Shop`, html: '<div class="fm-meta"></div>', buttons: [{ label: 'Done', primary: true }], dismissable: true });
  const box = host.lastElementChild.querySelector('.fm-meta');
  const render = () => {
    let h = `<p style="text-align:center;margin-bottom:8px">You have <b>${META.icon} ${m.seeds}</b>. Win levels for more; new stars pay best.<br><small>These upgrades apply to every level.</small></p>`;
    for (const [k, u] of Object.entries(META.upgrades)) {
      const lvl = m.up[k] || 0, max = lvl >= u.cost.length, price = u.cost[lvl];
      const dots = u.levels.map((_, i) => `<i class="${i <= lvl ? 'on' : ''}"></i>`).join('');
      h += `<div class="fm-up"><span class="ic">${u.icon}</span><span class="nm">${u.label}<span class="fm-lv">${dots}</span><small>${max ? 'Maxed' : `${u.levels[lvl]} → ${u.levels[lvl + 1]} ${u.unit}`}</small></span>` +
        `<button class="btn ${!max && m.seeds >= price ? 'go' : ''}" data-k="${k}" ${max || m.seeds < price ? 'disabled' : ''}>${max ? 'MAX' : META.icon + ' ' + price}</button></div>`;
    }
    box.innerHTML = h;
    box.querySelectorAll('.btn[data-k]').forEach(b => b.onclick = () => {
      const k = b.dataset.k, price = META.upgrades[k].cost[m.up[k] || 0];
      if (m.seeds < price) return;
      m.seeds -= price; m.up[k] = (m.up[k] || 0) + 1; saveMeta(m);
      [784, 988, 1175].forEach((f, i) => setTimeout(() => tone(f), i * 80)); buzz(20); render(); onChange?.();
    });
  };
  render();
}

export default {
  id: 'farm',
  name: 'Sunny Acres',
  description: 'Pick crops, stock the stalls, ring up customers. Beat each level\'s goal before the clock runs out.',
  color: '--mint',
  icon: '<svg viewBox="0 0 40 40" fill="currentColor"><path d="M20 6c-6 0-10 5-10 11 0 5 4 9 10 9s10-4 10-9c0-6-4-11-10-11zM8 30h24v4H8z"/></svg>',
  art: `<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#86CF62"/><rect x="0" y="70" width="100" height="30" fill="#E9D29A"/>
    <rect x="10" y="22" width="42" height="40" rx="6" fill="#9C6A43" stroke="#2B1D3A" stroke-width="4"/>
    <g stroke="#2B1D3A" stroke-width="2.5"><path d="M20 40l4-12 4 12z" fill="#FF8A2A"/><path d="M34 40l4-12 4 12z" fill="#FF8A2A"/><path d="M20 56l4-12 4 12z" fill="#FF8A2A"/><path d="M34 56l4-12 4 12z" fill="#FF8A2A"/></g>
    <g fill="#4FB848"><circle cx="24" cy="26" r="3"/><circle cx="38" cy="26" r="3"/><circle cx="24" cy="42" r="3"/><circle cx="38" cy="42" r="3"/></g>
    <rect x="60" y="40" width="32" height="26" rx="4" fill="#C98A50" stroke="#2B1D3A" stroke-width="4"/><path d="M57 40h38l-4-12H61z" fill="#FF6B6B" stroke="#2B1D3A" stroke-width="4" stroke-linejoin="round"/>
    <circle cx="70" cy="84" r="9" fill="#FFC93C" stroke="#2B1D3A" stroke-width="3.5"/><circle cx="84" cy="80" r="7" fill="#FFC93C" stroke="#2B1D3A" stroke-width="3"/></svg>`,
  levels: LEVELS.length,
  meta() {
    const pr = progress('farm');
    return pills([{ label: 'Level', value: Math.min(pr.unlocked, LEVELS.length), cls: 'lvl' }, { value: `★ ${pr.totalStars}<i>/${LEVELS.length * 3}</i>`, cls: 'star' }, { value: `${META.icon} ${loadMeta().seeds}` }]);
  },
  css: `
.fm{flex:1;min-height:0;position:relative;overflow:hidden;overflow:clip;touch-action:none;background:#86CF62}
.fm canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.fm-hud{position:absolute;left:0;right:0;top:0;padding:8px 10px;display:flex;align-items:flex-start;gap:8px;pointer-events:none;z-index:2}
.fm-coins{display:flex;align-items:center;gap:6px;height:40px;padding:0 14px 0 6px;border-radius:999px;background:#FFF7DD;color:${INK};border:3px solid var(--outline);
  box-shadow:0 4px 0 var(--outline);font-weight:600;font-size:22px;min-width:86px}
.fm-coins i{font-style:normal;font-size:24px;line-height:1;display:flex}
.coin{width:1em;height:1em;vertical-align:-.14em;display:inline-block}
.fm-coins.bump{animation:fmbump .18s}
@keyframes fmbump{50%{transform:scale(1.12)}}
.fm-quest{pointer-events:auto;cursor:pointer;flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;min-height:40px;padding:4px 12px;border-radius:16px;background:rgba(43,29,58,.82);color:#fff;font-size:14px;font-weight:600;line-height:1.2}
.fm-quest b{color:#FFD23F;font-weight:600;white-space:nowrap}
.fm-quest .bar{display:block;height:5px;border-radius:3px;background:rgba(255,255,255,.2);margin-top:3px;overflow:hidden}
.fm-quest .bar i{display:block;height:100%;background:#FFD23F;border-radius:3px;transition:width .2s}
.fm-time{pointer-events:auto;height:40px;display:flex;align-items:center;gap:4px;padding:0 12px;border-radius:999px;background:#FFF7DD;color:${INK};border:3px solid var(--outline);box-shadow:0 4px 0 var(--outline);font-weight:600;font-size:17px;white-space:nowrap;font-variant-numeric:tabular-nums}
.fm-time.low{background:#FF8A66;animation:pulse .5s ease-in-out infinite alternate}
.fm-bag{position:absolute;left:10px;top:58px;z-index:2;pointer-events:none;height:30px;font-size:14px !important;display:flex;align-items:center;padding:0 10px;border-radius:999px;background:#FFF7DD;color:${INK};border:3px solid var(--outline);box-shadow:0 4px 0 var(--outline);font-weight:600;font-size:15px;white-space:nowrap}
.fm-bag.full{background:#FF8A66;animation:pulse .5s ease-in-out infinite alternate}
.fm-joy{position:absolute;width:140px;height:140px;margin:-70px 0 0 -70px;border-radius:50%;pointer-events:none;background:rgba(255,255,255,.18);border:3px solid rgba(255,255,255,.55);display:none;z-index:2}
.fm-joy i{position:absolute;left:50%;top:50%;width:48px;height:48px;margin:-24px 0 0 -24px;border-radius:50%;background:rgba(255,255,255,.9);border:3px solid var(--outline)}
.fm-sheet{position:absolute;left:8px;right:8px;bottom:8px;z-index:3;background:linear-gradient(180deg,var(--surface2),var(--surface));border:3px solid var(--outline);border-radius:22px;
  box-shadow:0 6px 0 var(--outline);padding:10px;max-height:58%;overflow:auto;animation:popin .3s cubic-bezier(.3,1.6,.5,1)}
.fm-sheet h3{margin:0 0 8px;text-align:center;font-size:18px;color:var(--ink)}
.fm-up{display:grid;grid-template-columns:30px 1fr auto;align-items:center;gap:8px;padding:6px 4px;border-top:1px solid rgba(255,255,255,.08)}
.fm-up .ic{font-size:24px;text-align:center}
.fm-up .nm{color:var(--ink);font-weight:600;font-size:15px;line-height:1.15}
.fm-up .nm small{display:block;color:var(--muted);font-weight:500;font-size:12px}
.fm-up .btn{padding:6px 12px;font-size:15px;min-width:84px}
.panel.mega h2{--ribbon:linear-gradient(90deg,#2FE6FF,#AE8CFF,#FF6FAE)}
.fm-shopbtn{display:block;width:100%;margin-top:10px;--b:#5B3FB8}
.fm-goal{background:rgba(0,0,0,.18);border-radius:14px;padding:8px 10px;margin-bottom:8px;color:var(--ink)}
.fm-goal p{margin:0 0 4px;display:flex;justify-content:space-between;gap:8px}
.fm-goal p span{color:var(--butter);white-space:nowrap;font-weight:600}
.fm-goal .bar{display:block;height:6px;border-radius:3px;background:rgba(255,255,255,.15);overflow:hidden;margin:2px 0 6px}
.fm-goal .bar i{display:block;height:100%;background:var(--butter)}
.fm-goal small{color:var(--muted);font-size:13px;line-height:1.3;display:block}
.fm-lv{display:inline-flex;gap:3px;margin-left:4px;vertical-align:middle}
.fm-lv i{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.2)} .fm-lv i.on{background:#FFD23F}`,

  init(el) {
    const prog = progress('farm');
    let stop = null;
    const api = {
      prog,
      start(n) { stop?.(); stop = runLevel(el, Math.max(1, Math.min(LEVELS.length, n)), api); },
      pick() { levelPicker(el, { count: LEVELS.length, prog, onPick: n => api.start(n) }); },
    };
    el._farm = api; // lets the automated checks start a level
    api.start(prog.last);
    return () => stop?.();
  },
};

// One level (mode 'levels'), or the endless Free Farm (mode 'free', n = 0). Returns cleanup.
export function runLevel(el, n, api, mode = 'levels') {
  const free = mode === 'free';
  el.innerHTML = `<div class="fm"><canvas></canvas>
    <div class="fm-hud"><div class="fm-coins"><i>${COIN}</i><b>0</b></div><div class="fm-quest" aria-live="polite"></div><button class="fm-time" aria-label="Pause">⏸ <span>0:00</span></button></div><div class="fm-bag fm-coins">🧺 0/8</div>
    <div class="fm-joy"><i></i></div><div class="fm-sheet" hidden></div></div>`;
  const root = el.querySelector('.fm'), cv = root.querySelector('canvas'), g = cv.getContext('2d');
  const coinEl = root.querySelector('.fm-hud .fm-coins'), coinTxt = coinEl.querySelector('b'), questEl = root.querySelector('.fm-quest'), bagEl = root.querySelector('.fm-bag'), timeEl = root.querySelector('.fm-time'), timeTxt = timeEl.querySelector('span');
  const joyEl = root.querySelector('.fm-joy'), knob = joyEl.querySelector('i'), sheet = root.querySelector('.fm-sheet');

  // ================= state =================
  // levels start fresh from their config; the Free Farm restores its save
  const L = free ? FREE : LEVELS[n - 1], sv = free ? (loadSave('farm-free') || {}) : {};
  // Free Farm saves from before the cross-shaped map: keep what was built, put the farmer back in
  // the market, and open the Hillside for anyone who had already built down there
  if (free && sv.savedAt && sv.map !== 2) {
    delete sv.player?.x; delete sv.player?.y;
    if (sv.unlocked?.some(id => ['pumpkin', 'sheep', 'stand_pumpkin', 'stand_wool', 'hand_pumpkin'].includes(id)) && !sv.unlocked.includes('hillside')) sv.unlocked.push('hillside');
  }
  // this level's dressing: mirrored farm, season and decorations (shadows the module's CONFIG and UNLOCKS)
  const LAY = layoutFor(L), C = LAY.C, UNLOCKS = LAY.unlocks;
  if (!free) api.prog.play(n);
  const S = {
    coins: sv.coins ?? L.coins, unlocked: new Set(sv.unlocked || L.start), partial: sv.partial || {}, up: sv.up || {},
    tut: sv.tut ?? (L.tutorial ? 0 : TUTORIAL.length), earned: sv.earned ?? 0, sold: {}, served: 0, streak: 0, bestStreak: 0, crowLost: 0, failReason: '', built: 0,
    timeLeft: L.time ?? Infinity, phase: free ? 'play' : 'intro', paused: false,
  };
  const bonus = { prices: 1, patience: 0, scare: 0 }; // from seed-shop upgrades, applied when a level starts
  function applyMeta() {
    const m = loadMeta(), v = k => metaValue(m, k);
    S.coins += v('headStart'); coinShown = S.coins; S.timeLeft = L.time + v('time');
    for (const k of ['speed', 'carry', 'harvest']) S.up[k] = Math.min(C.upgrades[k].cost.length, v(k));
    Object.assign(bonus, { prices: v('prices'), patience: v('patience'), scare: v('scarecrow') });
  }
  const buildable = new Set(L.build);
  // this level's price tiles (prices scaled by L.priceScale, rounded to 5)
  const TILES = UNLOCKS.map(u => ({ ...u, price: Math.max(5, Math.round(u.price * (L.priceScale ?? 1) / 5) * 5) }));
  // products the level's sell goals depend on (bread -> flour -> wheat); carriers favour these
  // products the level is about right now (bread -> flour -> wheat, the cart's and VIP's wants,
  // stalls the inspector will check); carriers and the arrow favour these
  const baseFocus = new Set(), focus = new Set();
  const addChain = (set, q) => { set.add(q); for (const m of C.machines) if (m.out === q) addChain(set, m.in); };
  for (const gl of L.goals) if (gl.sell) addChain(baseFocus, gl.sell);
  // level events
  const gFill = L.goals.find(gl => gl.fill), gOrders = L.goals.find(gl => gl.orders), gCrows = L.goals.find(gl => gl.crows !== undefined);
  const gStreak = L.goals.find(gl => gl.streak), gInspect = L.goals.find(gl => gl.inspect);
  const cart = gFill ? { at: C.cart, got: {} } : null;
  const orders = { done: 0, missed: 0, vip: null, t: 3 };
  const crows = []; let crowT = C.crows.every[0];
  const insp = { next: 0, passed: 0 };
  const on = id => START_IDS.has(id) || S.unlocked.has(id);
  const P = { x: sv.player?.x ?? C.world.start.x, y: sv.player?.y ?? C.world.start.y, stack: (sv.player?.stack || []).map(t => ({ t, pop: 1 })),
    look: 1, walk: 0, vx: 0, vy: 0, squash: 0, harvestT: 0, actT: 0 };
  const fields = C.fields.map(f => ({ ...f, plots: Array.from({ length: f.w * f.h }, (_, i) => ({ x: f.x + i % f.w + .5, y: f.y + Math.floor(i / f.w) + .5, g: f.grow, ripeT: 1, claim: null })) }));
  for (const f of fields) for (const pl of f.plots) pl.field = f;
  const pens = C.pens.map(p => ({ ...p, n: sv.piles?.[p.id] ?? 0, timer: 0,
    animals: Array.from({ length: p.animals }, (_, i) => ({ x: p.x + .6 + Math.random() * (p.w - 1.2), y: p.y + .8 + Math.random() * (p.h - 1), tx: 0, ty: 0, look: 1, t: i })) }));
  const machines = C.machines.map(m => ({ ...m, inN: sv.machines?.[m.id]?.in ?? 0, outN: sv.machines?.[m.id]?.out ?? 0, prog: 0,
    inAt: { x: m.x - 1.3 * m.dir, y: m.y + .75 }, outAt: { x: m.x + 1.3 * m.dir, y: m.y + .75 } }));
  const stands = C.stands.map(s => ({ ...s, stock: sv.stands?.[s.product] ?? 0, at: { x: s.x, y: C.standY + .75 }, spot: { x: s.x, y: C.standY + 1.55 } }));
  const crates = C.helpers.filter(h => h.kind === 'farmhand').map(h => ({ id: h.id, at: h.crate, n: sv.crates?.[h.id] ?? 0,
    crop: C.fields.find(f => f.id === h.fields[0]).crop }));
  const helpers = [];
  const customers = [], flying = [], coinsFx = [], floaters = [], puffs = [];
  let shake = 0, raf, last = performance.now(), dead = false, saveT = 3, offlinePanel = null;
  let W = 0, H = 0, T = 40, dpr = 1, art = null, groundCv = null, camX = 0, camY = 0, coinShown = S.coins, padAcc = 0, padFx = 0;
  let shipped = 0, shipT = 0, binHint = false, binDwell = 0;
  let custT = 1, checkoutT = 0, clinkT = 0, sheetFor = null, tileDwell = 0, lastTile = null;

  const cap = () => up(S, 'carry');
  const zoneOpen = z => z.start || on(z.id);
  // you can stand anywhere except in a closed zone or the woods (with half a body of clearance)
  const walkable = (x, y) => { const p = { x, y }, w = C.world;
    if (x < .45 || x > w.cols - .45 || y < .6 || y > w.rows - .45) return false;
    for (const b of w.blocked) if (inRect(p, b, .45)) return false;
    for (const z of C.zones) if (!zoneOpen(z) && inRect(p, z, .45)) return false;
    return true; };

  function spawnHelper(h) {
    if (helpers.some(x => x.id === h.id)) return;
    const crate = crates.find(c => c.id === h.id);
    const home = h.kind === 'cashier' ? { x: C.register.mat.x + .55, y: C.register.mat.y - .35 } : h.kind === 'carrier' ? h.home : crate.at;
    helpers.push({ ...h, x: home.x, y: home.y, home, stack: [], path: null, look: 1, walk: 0, job: null, t: 0, crate });
  }
  for (const h of C.helpers) if (on(h.id)) spawnHelper(h);

  // ================= saving =================
  // Free Farm saves everything; a level is a short round (only levels, stars and seeds are kept)
  const save = () => { if (free) writeSave('farm-free', {
    map: 2, coins: S.coins, unlocked: [...S.unlocked], partial: S.partial, up: S.up, tut: S.tut, earned: S.earned,
    player: { x: +P.x.toFixed(2), y: +P.y.toFixed(2), stack: P.stack.map(x => x.t) },
    piles: Object.fromEntries(pens.map(q => [q.id, q.n])), crates: Object.fromEntries(crates.map(c => [c.id, c.n])),
    stands: Object.fromEntries(stands.map(x => [x.product, x.stock])), machines: Object.fromEntries(machines.map(m => [m.id, { in: m.inN, out: m.outN }])),
    savedAt: Date.now(),
  }); };

  // ================= sounds (short, soft, synthesised) =================
  const sPop = () => { click(520 + Math.random() * 120, .06, .18, 'sine'); click(1100, .02, .06, 'triangle'); };
  const sTick = n => click(700 + Math.min(n, 20) * 40, .025, .1, 'triangle');
  const sClink = () => { const now = performance.now(); if (now - clinkT < 55) return; clinkT = now; click(2400 + Math.random() * 300, .05, .08, 'sine'); click(3200, .03, .05, 'sine'); };
  const sChime = big => [784, 988, 1175, big ? 1568 : 0].filter(Boolean).forEach((f, i) => setTimeout(() => tone(f), i * 90));

  // ================= effects =================
  const float = (x, y, text, color = '#FFFFFF') => floaters.push({ x, y, text, color, t: 0 });
  const fly = (type, from, to, dur = .35, then) => flying.push({ type, x: from.x, y: from.y, to, t: 0, dur, then });
  const burst = (x, y, color, n = 5) => { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28; puffs.push({ x, y, vx: Math.cos(a) * 2.2, vy: Math.sin(a) * 2.2 - 1.2, t: 0, color }); } };
  function coinsTo(fromWorld, n) { // coins arc from a spot in the world to the counter
    for (let i = 0; i < Math.min(n, 14); i++) coinsFx.push({ x: (fromWorld.x - camX) * T + (Math.random() - .5) * T * .6, y: (fromWorld.y - camY) * T - T * .5, t: -i * .045, dur: .55 + Math.random() * .15 });
  }

  // ================= unlocking =================
  const zoneOfTile = u => zoneAt(C.zones, u.at);
  // The next few unbuilt entries in order (a small look-ahead window, so late items never jump the queue),
  // minus any whose zone is closed or whose `after` isn't built yet.
  const visibleTiles = () => TILES.filter(u => buildable.has(u.id) && !S.unlocked.has(u.id)).slice(0, SHOWN_UNLOCKS + LOOKAHEAD).filter(u => zoneOpen(zoneOfTile(u)) && (!u.after || on(u.after))).slice(0, SHOWN_UNLOCKS);
  function unlock(u) {
    S.unlocked.add(u.id); delete S.partial[u.id]; S.built++; frameNo++;
    const z = C.zones.find(zz => zz.id === u.id), h = C.helpers.find(hh => hh.id === u.id);
    if (h) spawnHelper(h);
    groundCv = art.ground(on, LAY);
    const big = !!z || u.price >= 300;
    sChime(big); buzz(big ? 60 : 25); shake = big ? .35 : .15;
    burst(u.at.x, u.at.y, '#FFD23F', 12);
    float(u.at.x, u.at.y - .8, u.label + '!', '#FFFFFF');
    if (z) { confetti(root, 120); float(u.at.x, u.at.y - 1.6, 'Welcome to the ' + z.name + '!', '#FFD23F'); }
    save();
  }

  // ================= movement & input: floating joystick =================
  const joy = { on: false, ox: 0, oy: 0, dx: 0, dy: 0, id: null };
  const keys = new Set();
  root.addEventListener('pointerdown', e => {
    if (e.target.closest('.fm-sheet')) return;
    ac(); joy.on = true; joy.id = e.pointerId; root.setPointerCapture(e.pointerId);
    const r = root.getBoundingClientRect(); joy.ox = e.clientX - r.left; joy.oy = e.clientY - r.top; joy.dx = joy.dy = 0;
    joyEl.style.left = joy.ox + 'px'; joyEl.style.top = joy.oy + 'px'; joyEl.style.display = 'block'; knob.style.transform = '';
  });
  root.addEventListener('pointermove', e => {
    if (!joy.on || e.pointerId !== joy.id) return;
    const r = root.getBoundingClientRect(); let dx = e.clientX - r.left - joy.ox, dy = e.clientY - r.top - joy.oy;
    const m = Math.hypot(dx, dy), max = 56; if (m > max) { dx *= max / m; dy *= max / m; }
    joy.dx = dx / max; joy.dy = dy / max; knob.style.transform = `translate(${dx}px,${dy}px)`;
  });
  const endJoy = e => { if (e.pointerId === joy.id) { joy.on = false; joy.dx = joy.dy = 0; joyEl.style.display = 'none'; } };
  root.addEventListener('pointerup', endJoy); root.addEventListener('pointercancel', endJoy);
  const kd = e => { if (/^(Arrow|[wasd]$)/i.test(e.key)) { keys.add(e.key.toLowerCase()); e.preventDefault(); } }, ku = e => keys.delete(e.key.toLowerCase());
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);

  function movePlayer(dt) {
    let mx = joy.dx, my = joy.dy;
    if (keys.has('arrowleft') || keys.has('a')) mx -= 1; if (keys.has('arrowright') || keys.has('d')) mx += 1;
    if (keys.has('arrowup') || keys.has('w')) my -= 1; if (keys.has('arrowdown') || keys.has('s')) my += 1;
    // smooth the stick itself: finger tremor no longer wobbles your heading
    P.ix = (P.ix || 0) + (mx - (P.ix || 0)) * Math.min(1, dt * 25); P.iy = (P.iy || 0) + (my - (P.iy || 0)) * Math.min(1, dt * 25);
    if (!mx && !my && Math.hypot(P.ix, P.iy) < .1) P.ix = P.iy = 0;
    mx = P.ix; my = P.iy;
    const m = Math.hypot(mx, my), sp = up(S, 'speed');
    // dead zone, then a quick ramp: half a thumb's travel is already full speed, so small wobbles don't change speed
    let want = m > .1 ? Math.min(1, (m - .1) / .4) * sp : 0;
    P.spd ??= 0; P.hd ??= 0;
    if (want) {
      const aim = Math.atan2(my, mx);
      if (P.spd < .25 * sp) P.hd = aim; // from a standstill you face where you push
      else {
        // otherwise the heading swings round at a capped rate (a U-turn takes about 0.4s) and
        // sharp turns shed speed, so reversing arcs through a slowdown instead of snapping about
        let diff = aim - P.hd; diff -= Math.round(diff / (2 * Math.PI)) * 2 * Math.PI;
        const turn = 8 * dt; P.hd += Math.max(-turn, Math.min(turn, diff));
        want *= .45 + .55 * Math.max(0, Math.cos(diff));
      }
    }
    P.spd += (want - P.spd) * Math.min(1, dt * (want > P.spd ? 12 : 16)); // full speed in ~.2s; stops crisply
    if (P.spd < .02) P.spd = 0;
    P.vx = Math.cos(P.hd) * P.spd; P.vy = Math.sin(P.hd) * P.spd;
    if (Math.abs(P.vx) > .35 * sp) P.look = Math.sign(P.vx); // only face the other way once actually moving that way
    const nx = P.x + P.vx * dt, ny = P.y + P.vy * dt; // slide along fences and the woods
    if (walkable(nx, ny)) { P.x = nx; P.y = ny; } else if (walkable(nx, P.y)) P.x = nx; else if (walkable(P.x, ny)) P.y = ny;
    P.walk += Math.hypot(P.vx, P.vy) * dt;
  }

  const pickSpawn = () => C.customers.spawn[Math.floor(Math.random() * C.customers.spawn.length)];

  // ================= walking helpers =================
  function walkTo(ch, to, speed, dt) {
    const d = d2(ch, to); if (d < .05) return true;
    const step = Math.min(d, speed * dt);
    ch.look = Math.sign(to.x - ch.x) || ch.look; ch.x += (to.x - ch.x) / d * step; ch.y += (to.y - ch.y) / d * step; ch.walk = (ch.walk || 0) + step;
    return step >= d - 1e-6;
  }
  const memo = { id: -1, sinks: null, src: {} };
  let frameNo = 0;
  const fresh = () => { if (memo.id !== frameNo) { memo.id = frameNo; memo.sinks = null; memo.src = {}; } };
  const sources = p => { fresh(); return memo.src[p] ||= buildSources(p); };
  const sinks = () => { fresh(); return memo.sinks ||= buildSinks(); };
  const buildSources = p => [
    ...crates.filter(c => c.crop === p && on(c.id)).map(c => ({ obj: c, at: c.at, get n() { return c.n; }, take() { c.n--; } })),
    ...pens.filter(pn => pn.product === p && on(pn.id)).map(pn => ({ obj: pn, at: pn.pile, get n() { return pn.n; }, take() { pn.n--; } })),
    ...machines.filter(m => m.out === p && on(m.id)).map(m => ({ obj: m, at: m.outAt, get n() { return m.outN; }, take() { m.outN--; } })),
  ];
  const buildSinks = () => [
    ...stands.filter(s => on(s.id)).map(s => ({ obj: s, p: s.product, at: s.at, get room() { return C.standCap - s.stock; }, put() { s.stock++; } })),
    ...machines.filter(m => on(m.id)).map(m => ({ obj: m, p: m.in, at: m.inAt, get room() { return C.machineCap - m.inN; }, put() { m.inN++; } })),
    ...(cart ? Object.entries(gFill.fill).map(([p, need]) => ({ obj: cart, p, at: cart.at, get room() { return need - (cart.got[p] || 0); }, put() { cart.got[p] = (cart.got[p] || 0) + 1; } })) : []),
    ...(orders.vip?.state === 'wait' ? Object.entries(orders.vip.want).map(([p, need]) => { const v = orders.vip; return { obj: v, p, at: v, get room() { return need - (v.got[p] || 0) - (v.coming[p] || 0); }, put() { v.got[p] = (v.got[p] || 0) + 1; v.coming[p]--; }, reserve() { v.coming[p] = (v.coming[p] || 0) + 1; } }; }) : []),
  ];
  const producible = p => fields.some(f => f.crop === p && on(f.id)) || pens.some(q => q.product === p && on(q.id)) || machines.some(m => m.out === p && on(m.id) && producible(m.in));

  // ================= the simulation =================
  function update(dt) {
    frameNo++;
    movePlayer(dt);
    const capN = cap();
    P.squash = Math.max(0, P.squash - dt * 5);
    for (const s of P.stack) s.pop = Math.min(1, s.pop + dt * 4);

    // --- crops grow ---
    for (const f of fields) if (on(f.id)) for (const pl of f.plots) {
      if (pl.g < f.grow) { pl.g += dt; if (pl.g >= f.grow) pl.ripeT = 0; }
      pl.ripeT = Math.min(1, pl.ripeT + dt * 3);
    }
    // --- player harvests by walking over ripe plots ---
    P.harvestT += dt;
    const wanted = new Set(sinks().map(sk => sk.p)); // only pick crops that have a stand or machine to go to
    if (P.stack.length < capN) for (const f of fields) {
      if (!on(f.id) || !wanted.has(f.crop)) continue;
      for (const pl of f.plots) if (pl.g >= f.grow && Math.abs(pl.x - P.x) < .62 && Math.abs(pl.y - P.y) < .62 && P.harvestT >= up(S, 'harvest')) {
        P.harvestT = 0; pl.g = 0; pl.claim = null;
        P.stack.push({ t: f.crop, pop: 0 }); P.squash = 1; sPop(); buzz(5); burst(pl.x, pl.y, '#6CCF5A', 4);
        if (S.tut === 0) S.tut = 1;
        if (P.stack.length >= capN) break;
      }
    }
    // --- player picks up from piles / crates / machine outputs, and drops at stands / machine inputs ---
    binDwell = d2(P, C.shipBin) < .8 ? binDwell + dt : 0;
    P.actT -= dt;
    if (P.actT <= 0) {
      let acted = false;
      if (P.stack.length < capN) for (const p of Object.keys(C.products)) for (const src of sources(p)) {
        if (acted || src.n <= 0 || d2(P, src.at) > C.player.reach) continue;
        src.take(); P.stack.push({ t: p, pop: 0 }); fly(p, src.at, null, .2); sTick(P.stack.length); P.squash = .6; acted = true;
        P.actT = C.player.pickupInterval;
      }
      if (!acted) for (const sk of sinks()) {
        if (sk.room <= 0 || d2(P, sk.at) > C.player.reach) continue;
        const i = P.stack.map(s => s.t).lastIndexOf(sk.p); if (i < 0) continue;
        P.stack.splice(i, 1); sk.reserve?.(); fly(sk.p, { x: P.x, y: P.y - 1.2 }, { x: sk.at.x, y: sk.at.y }, .22, () => sk.put()); sTick(P.stack.length); acted = true;
        P.actT = C.player.dropInterval;
        if (S.tut === 1 && sk.obj.product) S.tut = 2;
        break;
      }
      // the shipping bin takes anything, one item at a time, for a cut of the price
      if (!acted && P.stack.length && binDwell >= UNLOCK_DWELL) { // after a moment's stand, so walking across sells nothing
        const it = P.stack.pop(), pay = Math.max(C.shipBin.min, Math.floor(C.products[it.t].price * C.shipBin.rate * bonus.prices));
        S.coins += pay; S.earned += pay; shipped += pay; shipT = .8;
        fly(it.t, { x: P.x, y: P.y - 1.2 }, C.shipBin, .22); sClink(); P.actT = C.player.dropInterval;
      }
    }
    // --- animals ---
    for (const pn of pens) if (on(pn.id)) {
      for (const a of pn.animals) {
        a.t += dt;
        if (d2(a, { x: a.tx, y: a.ty }) < .1 || !a.tx) { a.tx = pn.x + .5 + Math.random() * (pn.w - 1); a.ty = pn.y + .8 + Math.random() * (pn.h - 1.1); }
        walkTo(a, { x: a.tx, y: a.ty }, .5, dt);
      }
      pn.timer += dt;
      const every = pn.interval / pn.animals.length; // pn.animals is the array of animals here
      if (pn.timer >= every) { pn.timer -= every; if (pn.n < C.pileCap) { const a = pn.animals[Math.floor(Math.random() * pn.animals.length)]; fly(pn.product, { x: a.x, y: a.y - .4 }, pn.pile, .4, () => { pn.n = Math.min(C.pileCap, pn.n + 1); }); } }
    }
    // --- machines ---
    const mSpeed = up(S, 'machineSpeed');
    for (const m of machines) if (on(m.id)) {
      m.busy = m.inN > 0 && m.outN < C.machineCap;
      if (m.busy) { m.prog += dt * mSpeed / m.time; if (m.prog >= 1) { m.prog = 0; m.inN--; fly(m.out, { x: m.x, y: m.y - .3 }, m.outAt, .3, () => m.outN++); } }
    }
    // --- level events ---
    updateEvents(dt);
    // --- helpers ---
    updateHelpers(dt);
    // --- customers ---
    updateCustomers(dt);
    // --- unlock tiles: stand on one and coins drain into it ---
    let onTile = null;
    for (const u of visibleTiles()) if (Math.abs(P.x - u.at.x) < .7 && Math.abs(P.y - u.at.y) < .7) onTile = u;
    tileDwell = onTile && onTile === lastTile ? tileDwell + dt : 0; lastTile = onTile;
    if (onTile && S.coins > 0 && tileDwell >= UNLOCK_DWELL) {
      const have = S.partial[onTile.id] || 0;
      padAcc += dt * onTile.price / UNLOCK_SECONDS;
      const amt = Math.min(S.coins, onTile.price - have, Math.floor(padAcc));
      if (amt > 0) { padAcc -= amt; S.coins -= amt; coinShown = Math.min(coinShown, S.coins); S.partial[onTile.id] = have + amt; }
      padFx -= dt; if (padFx <= 0) { padFx = .05; fly('coin', { x: P.x, y: P.y - 1 }, onTile.at, .3); click(1500 + (have / onTile.price) * 900, .015, .06, 'triangle'); }
      if (S.partial[onTile.id] >= onTile.price) unlock(onTile);
    } else padAcc = 0;
    // --- upgrade mat ---
    if (!binHint && P.stack.length >= cap() && !nearestSink()) { binHint = true; float(P.x, P.y - 1.8, 'Nowhere for that? Sell it at the bin', '#FFFFFF'); }
    if (shipped && (shipT -= dt) <= 0) { float(C.shipBin.x, C.shipBin.y - 1.2, `Shipped +${shipped}`, '#FFD23F'); coinsTo(C.shipBin, Math.min(8, 2 + shipped / 5)); shipped = 0; }
    const onMat = d2(P, C.upgradeMat) < .75;
    if (onMat && sheetFor !== 'up') openSheet(); else if (!onMat && sheetFor) closeSheet();

    // --- effects ---
    for (const f of flying) f.t += dt;
    for (let i = flying.length - 1; i >= 0; i--) if (flying[i].t >= flying[i].dur) { flying[i].then?.(); flying.splice(i, 1); }
    for (const p of puffs) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 6 * dt; }
    while (puffs.length && puffs[0].t > .5) puffs.shift();
    for (const f of floaters) f.t += dt;
    while (floaters.length && floaters[0].t > 1.2) floaters.shift();
    // the clock and the goals
    if (free) { saveT -= dt; if (saveT <= 0) { saveT = 3; save(); } return; }
    S.timeLeft -= dt;
    if (S.timeLeft <= 10 && Math.ceil(S.timeLeft) !== Math.ceil(S.timeLeft + dt)) { click(1300, .03, .1, 'square'); buzz(8); }
    if (S.phase === 'play' && goals().every(gl => gl.done)) finish(true);
    else if (S.timeLeft <= 0) finish(false);
  }

  // ================= goals, start and finish =================
  function goals() {
    return L.goals.map(gl => {
      if (gl.crows !== undefined) return { ...gl, have: S.crowLost, need: gl.crows, done: S.crowLost <= gl.crows, limit: true, text: goalText(gl) };
      const [have, need] = gl.earn ? [S.earned, gl.earn] : gl.sell ? [S.sold[gl.sell] || 0, gl.n] : gl.serve ? [S.served, gl.serve] :
        gl.fill ? [Object.entries(gl.fill).reduce((a, [p, k]) => a + Math.min(k, cart.got[p] || 0), 0), Object.values(gl.fill).reduce((a, k) => a + k, 0)] :
        gl.builds ? [S.built, gl.builds] : gl.orders ? [orders.done, gl.orders] : gl.streak ? [S.bestStreak, gl.streak] : gl.inspect ? [insp.passed, gl.inspect.at.length] : [on(gl.build) ? 1 : 0, 1];
      return { ...gl, have: Math.min(have, need), need, done: have >= need, text: goalText(gl) };
    });
  }
  const goalList = () => goals().map(gl => `<p style="margin:0 0 6px">${gl.limit ? (gl.done ? '🛡️' : '❌') : gl.done ? '✅' : '🎯'} <b>${gl.text}</b>${gl.limit ? ` <span style="opacity:.7">(lost ${gl.have})</span>` : gl.need > 1 ? ` <span style="opacity:.7">(${fmt(gl.have)}/${fmt(gl.need)})</span>` : ''}</p>`).join('');
  const shopBtn = () => `<button class="btn fm-shopbtn">${META.icon} Seed Shop · ${loadMeta().seeds}</button>`;
  const wireShop = () => { const ov = el.querySelector('.ov:last-child'), b = ov?.querySelector('.fm-shopbtn'); if (b) b.onclick = () => metaShop(el, () => { b.textContent = `${META.icon} Seed Shop · ${loadMeta().seeds}`; }); };
  function intro() {
    const m = loadMeta(), extra = metaValue(m, 'time');
    panel(el, {
      title: L.mega ? `Level ${n}: MEGA EXPANSION` : `Level ${n}: ${L.name}`, mood: L.mega ? 'mega' : undefined,
      html: (L.mega ? `<p style="text-align:center;margin-bottom:6px"><b>${L.name.replace('Mega Expansion: ', '')}</b>: one long build-out. Seeds x${META.reward.megaMult}.</p>` : '') +
        `<p style="text-align:center;margin-bottom:10px">Beat the goal${L.goals.length > 1 ? 's' : ''} in <b>${mmss(L.time + extra)}</b>${extra ? ` <small>(+${extra}s from the shop)</small>` : ''}</p>${goalList()}` +
        (L.build.length ? `<p style="margin-top:8px">To build: ${L.build.map(id => TILES.find(u => u.id === id).icon).join(' ')}</p>` : '') + shopBtn(),
      buttons: [{ label: 'Levels', onClick: () => api.pick() }, { label: 'Start', primary: true, onClick: () => { applyMeta(); S.phase = 'play'; last = performance.now(); sChime(false); } }],
    });
    wireShop();
  }
  function finish(won, reason = '') {
    if (S.phase !== 'play') return;
    S.failReason = reason;
    S.phase = 'done'; shake = 0; closeSheet(); joy.on = false; joy.dx = joy.dy = 0; joyEl.style.display = 'none';
    const isLast = n >= LEVELS.length;
    if (won) {
      const stars = starsFor(S.timeLeft, L.time), prev = api.prog.stars(n);
      api.prog.complete(n, stars);
      const seeds = seedsFor(stars, prev, L.mega), m = loadMeta(); m.seeds += seeds; m.total += seeds; saveMeta(m);
      confetti(root, 140); shake = .3; [784, 988, 1175, 1568].forEach((f, i) => setTimeout(() => tone(f), i * 110)); buzz(50);
      setTimeout(() => !dead && panel(el, {
        title: isLast ? 'You beat every level!' : `Level ${n} complete!`, mood: 'win',
        html: `${starsHTML(stars)}<p style="text-align:center">Done with <b>${mmss(S.timeLeft)}</b> to spare.${stars < 3 ? ` Finish with ${mmss(L.time * STAR_TIME_LEFT[stars === 1 ? 1 : 0])} left for ${stars === 1 ? 'two' : 'three'} stars.` : ''}</p>` +
          `<p style="text-align:center;font-size:22px;margin:6px 0"><b>+${META.icon} ${seeds}</b> seeds</p>` + shopBtn(),
        buttons: [{ label: 'Levels', onClick: () => api.pick() }, { label: 'Retry', onClick: () => api.start(n) },
          ...(isLast ? [] : [{ label: 'Next level', primary: true, onClick: () => api.start(n + 1) }])],
      }) && wireShop(), 700);
    } else {
      click(220, .35, .25, 'sine'); buzz(30);
      panel(el, {
        title: reason ? 'Level failed' : "Time's up!", mood: 'lose',
        html: `<p style="text-align:center;margin-bottom:10px">${reason || "Here's how far you got:"}</p>${goalList()}` + shopBtn(),
        buttons: [{ label: 'Levels', onClick: () => api.pick() }, { label: 'Try again', primary: true, onClick: () => api.start(n) }],
      });
      wireShop();
    }
  }
  function pauseMenu() {
    if (S.phase !== 'play') return;
    S.paused = true;
    if (free) {
      const built = UNLOCKS.filter(u => S.unlocked.has(u.id)).length;
      panel(el, {
        title: 'Free Farm', html: `<p style="text-align:center">Built <b>${built}/${UNLOCKS.length}</b> · earned <b>${COIN} ${fmt(S.earned)}</b><br>Saved as you play. Helpers keep earning while you're away.</p>`,
        buttons: [{ label: 'Start over', onClick: () => panel(el, { title: 'Start over?', html: '<p style="text-align:center">This wipes your Free Farm.</p>', buttons: [
            { label: 'Keep it', primary: true, onClick: () => { S.paused = false; last = performance.now(); } },
            { label: 'Wipe it', onClick: () => { writeSave('farm-free', null); api.start(0); } }] }) },
          { label: 'Back to farming', primary: true, onClick: () => { S.paused = false; last = performance.now(); } }],
      });
      return;
    }
    panel(el, {
      title: 'Paused', html: `<p style="text-align:center">Level ${n}: ${L.name} · ${mmss(S.timeLeft)} left</p>${goalList()}`,
      buttons: [{ label: 'Levels', onClick: () => api.pick() }, { label: 'Restart', onClick: () => api.start(n) }, { label: 'Resume', primary: true, onClick: () => { S.paused = false; last = performance.now(); } }],
    });
  }
  timeEl.addEventListener('pointerdown', e => e.stopPropagation()); // not a joystick drag
  questEl.addEventListener('pointerdown', e => e.stopPropagation());
  // tap the goal bar: every goal with progress and how it works
  const HOW = {
    earn: 'Coins from sales count, including special orders and inspection rewards. Starting coins don\'t.',
    sell: 'Stock the stall; it counts when a customer pays at the register.',
    serve: 'Each customer you (or the cashier) ring up counts once.',
    build: 'Stand on its price tile until the coins drain in.',
    builds: 'Anything you build counts: fields, stalls, pens, machines and helpers.',
    fill: 'Carry the produce to the festival cart (by the market). Carriers help too.',
    orders: 'A ⭐ customer waits by the stalls with a bubble of what they want. Walk up with those items before their bar runs out. Pays double.',
    crows: 'Crows land on ripe crops (red ring = time left). Run close to scare them off. Losing more than allowed fails the level.',
    streak: 'Ring customers up before they give up (30s in line, or an empty stall). Anyone leaving unhappy resets the streak.',
    inspect: 'The inspector names one stall 25s ahead and closes it to shoppers; have enough on it in time, or the level fails.',
  };
  function goalDetails() {
    if (free || S.phase !== 'play') return;
    S.paused = true;
    const rows = goals().map(gl => {
      const kind = Object.keys(HOW).find(k => gl[k] !== undefined);
      const prog = gl.limit ? `lost ${gl.have} of ${gl.need} allowed` : `${fmt(gl.have)} / ${fmt(gl.need)}`;
      return `<div class="fm-goal"><p><b>${gl.limit ? (gl.done ? '🛡️' : '❌') : gl.done ? '✅' : '🎯'} ${gl.text}</b> <span>${prog}</span></p>` +
        (gl.limit ? '' : `<span class="bar"><i style="width:${100 * gl.have / gl.need}%"></i></span>`) + `<small>${HOW[kind] || ''}</small></div>`;
    }).join('');
    panel(el, { title: `Level ${n} goals`, dismissable: false, html: `<p style="text-align:center;margin-bottom:8px">${mmss(S.timeLeft)} left · paused</p>${rows}`,
      buttons: [{ label: 'Back to it', primary: true, onClick: () => { S.paused = false; last = performance.now(); } }] });
  }
  questEl.onclick = goalDetails;
  timeEl.onclick = pauseMenu;

  function refreshFocus() {
    focus.clear(); for (const q of baseFocus) focus.add(q);
    if (cart) for (const [p, k] of Object.entries(gFill.fill)) if ((cart.got[p] || 0) < k) addChain(focus, p);
    if (orders.vip) for (const p of Object.keys(orders.vip.want)) addChain(focus, p);
    if (insp.warning) for (const st of stands) if (insp.check?.has(st.id) && st.stock < gInspect.inspect.min) addChain(focus, st.product);
  }
  function updateEvents(dt) {
    const elapsed = L.time - S.timeLeft;
    // special orders: one VIP at a time walks up with a basket they want filled
    if (gOrders && orders.done < gOrders.orders) {
      const v = orders.vip;
      if (!v) {
        orders.t -= dt;
        const can = Object.keys(ICON).filter(p => producible(p) && stands.some(st => st.product === p && on(st.id)));
        if (orders.t <= 0 && can.length && (!gOrders.with || can.includes(gOrders.with))) {
          const kinds = [gOrders.with || can[Math.floor(Math.random() * can.length)]];
          const other = can.filter(p => p !== kinds[0]); if (other.length && Math.random() < .75) kinds.push(other[Math.floor(Math.random() * other.length)]);
          const total = C.vip.items[0] + Math.floor(Math.random() * (C.vip.items[1] - C.vip.items[0] + 1)), want = {};
          for (let i = 0; i < total; i++) { const p = kinds[i % kinds.length]; want[p] = (want[p] || 0) + 1; }
          const from = pickSpawn(); orders.vip = { from, x: from.x, y: from.y, look: 1, walk: 0, state: 'in', want, got: {}, coming: {}, wait: C.vip.patience + bonus.patience };
          float(C.vip.spot.x, C.vip.spot.y - 1.6, '⭐ Special order!', '#FFD23F'); tone(1319);
        }
      } else if (v.state === 'in') {
        const to = v.y > C.customers.gate.y + .1 ? C.customers.gate : C.vip.spot;
        if (walkTo(v, to, C.customers.speed * 1.2, dt) && to === C.vip.spot) { v.state = 'wait'; frameNo++; }
      } else if (v.state === 'wait') {
        v.wait -= dt;
        if (Object.entries(v.want).every(([p, k]) => (v.got[p] || 0) >= k)) {
          const pay = Math.round(Object.entries(v.want).reduce((a, [p, k]) => a + C.products[p].price * k, 0) * C.vip.bonus * bonus.prices);
          S.coins += pay; S.earned += pay; orders.done++; v.state = 'out'; v.happy = 1; frameNo++;
          coinsTo(v, 14); float(v.x, v.y - 1.8, `Order filled! +${pay}`, '#FFD23F'); sChime(true); buzz(30); burst(v.x, v.y - 1, '#FFD23F', 14); orders.t = C.vip.every;
        } else if (v.wait <= 0) { frameNo++; v.state = 'out'; v.sad = 1; orders.missed++; float(v.x, v.y - 1.8, 'Too slow 😤', '#FF8A66'); click(220, .2, .2, 'sine'); orders.t = C.vip.every; }
      } else {
        const to = v.y < C.customers.gate.y - .1 ? C.customers.gate : v.from;
        if (walkTo(v, to, C.customers.speed * 1.2, dt) && to === v.from) orders.vip = null;
      }
    }
    // crows: land on ripe crops; get close and they scatter
    if (gCrows) {
      crowT -= dt;
      const ripe = fields.filter(f => on(f.id)).flatMap(f => f.plots.filter(pl => pl.g >= f.grow && !crows.some(c => c.plot === pl)));
      if (crowT <= 0 && ripe.length && crows.filter(c => c.state !== 'flee').length < C.crows.max) {
        crowT = C.crows.every[0] + Math.random() * (C.crows.every[1] - C.crows.every[0]);
        const plot = ripe[Math.floor(Math.random() * ripe.length)], from = { x: plot.x + (Math.random() < .5 ? -6 : 6), y: plot.y - 5 };
        crows.push({ plot, x: from.x, y: from.y, fx: from.x, fy: from.y, state: 'fly', t: 0, flap: Math.random() * 6 });
        click(900, .08, .12, 'sawtooth');
      }
      for (const c of [...crows]) {
        c.t += dt; c.flap += dt * 14;
        if (c.state !== 'flee' && d2(P, c.plot) < C.crows.scare + bonus.scare) { c.state = 'flee'; c.t = 0; c.fx = c.x; c.fy = c.y; click(1400, .06, .14, 'square'); buzz(8); burst(c.x, c.y - .3, '#2B1D3A', 6); float(c.x, c.y - 1.2, 'Shoo!', '#FFFFFF'); }
        if (c.state === 'fly') { const k = Math.min(1, c.t / C.crows.fly); c.x = c.fx + (c.plot.x - c.fx) * k; c.y = c.fy + (c.plot.y - .1 - c.fy) * k - Math.sin(k * Math.PI) * 1.2; if (k >= 1) { c.state = 'peck'; c.t = 0; } }
        else if (c.state === 'peck') {
          if (c.plot.g < c.plot.field.grow) { c.state = 'flee'; c.t = 0; c.fx = c.x; c.fy = c.y; } // harvested first
          else if (c.t >= C.crows.peck) {
            c.plot.g = 0; S.crowLost++; c.state = 'flee'; c.t = 0; c.fx = c.x; c.fy = c.y;
            float(c.x, c.y - 1, `A crow ate one! (${S.crowLost}/${gCrows.crows} allowed)`, '#FF8A66'); click(300, .15, .2, 'sawtooth'); shake = .15;
            if (S.crowLost > gCrows.crows) finish(false, `The crows ate ${S.crowLost} crops (${gCrows.crows} allowed).`);
          }
        } else { c.x = c.fx + c.t * 7 * (c.fx < C.world.cols / 2 ? -1 : 1); c.y = c.fy - c.t * 6; if (c.t > 1.2) crows.splice(crows.indexOf(c), 1); }
      }
    }
    // inspections: a warning, then every open stall must have enough on it
    if (gInspect && insp.next < gInspect.inspect.at.length) {
      const due = gInspect.inspect.at[insp.next];
      insp.warning = elapsed >= due - C.inspect.warn ? Math.max(.01, due - elapsed) : 0;
      if (insp.warning && !insp.warned) { // pick one stall to inspect: the emptiest one that can be stocked
        insp.warned = true;
        const pickable = stands.filter(st => on(st.id) && producible(st.product)).sort((a, b) => a.stock - b.stock || Math.random() - .5);
        insp.stall = pickable[0] || stands[0]; insp.check = new Set([insp.stall.id]);
        float(insp.stall.at.x, insp.stall.at.y - 2.6, `📋 Inspector checks this stall!`, '#FFD23F'); tone(880);
      }
      if (elapsed >= due) {
        const short = stands.filter(st => insp.check?.has(st.id) && st.stock < gInspect.inspect.min);
        insp.next++; insp.warned = false; insp.warning = 0;
        if (short.length) finish(false, `The inspector found only ${short[0].stock} on the ${C.products[short[0].product].name.toLowerCase()} stall (needed ${gInspect.inspect.min}).`);
        else { insp.passed++; S.coins += C.inspect.reward; S.earned += C.inspect.reward; sChime(true); float(C.world.start.x, C.standY + .8, `Inspection passed! +${C.inspect.reward}`, '#4FE378'); for (const st of stands) if (on(st.id)) burst(st.at.x, st.at.y - 1, '#4FE378', 4); }
      }
    }
    refreshFocus();
  }

  function updateHelpers(dt) {
    const hs = up(S, 'helperSpeed'), hc = up(S, 'helperCarry');
    for (const h of helpers) {
      h.t -= dt;
      if (h.kind === 'cashier') { h.look = -1; continue; }
      if (h.kind === 'farmhand') {
        const mine = fields.filter(f => h.fields.includes(f.id) && on(f.id) && sinks().some(sk => sk.p === f.crop));
        if (h.stack.length >= hc || (h.stack.length && !mine.some(f => f.plots.some(pl => pl.g >= f.grow)))) {
          if (walkTo(h, { x: h.crate.at.x, y: h.crate.at.y - .3 }, hs, dt) && h.t <= 0) {
            if (h.crate.n < C.crateCap) { h.stack.pop(); fly(h.crate.crop, { x: h.x, y: h.y - 1 }, h.crate.at, .2, () => { h.crate.n = Math.min(C.crateCap, h.crate.n + 1); }); }
            h.t = .1;
          }
          continue;
        }
        let target = h.job && h.job.g >= h.job.field.grow ? h.job : null;
        if (!target) {
          if (h.job) h.job.claim = null;
          let best = null, bd = 1e9;
          for (const f of mine) for (const pl of f.plots) if (pl.g >= f.grow && !pl.claim) { const d = d2(h, pl); if (d < bd) { bd = d; best = pl; best.field = f; } }
          h.job = best; if (best) best.claim = h; target = best;
        }
        if (!target) { walkTo(h, { x: h.crate.at.x + .6, y: h.crate.at.y - .8 }, hs, dt); continue; }
        if (walkTo(h, target, hs, dt)) {
          h.harvestT = (h.harvestT || 0) + dt;
          if (h.harvestT >= C.harvestTimeHelper) { h.harvestT = 0; target.g = 0; target.claim = null; h.job = null; h.stack.push({ t: target.field.crop, pop: 0 }); burst(target.x, target.y, '#6CCF5A', 3); }
        }
        continue;
      }
      // carrier: take from wherever there's stock to wherever needs it most
      for (const s of h.stack) s.pop = Math.min(1, s.pop + dt * 4);
      if (!h.job) {
        let best = null;
        for (const sk of sinks()) {
          const claimed = helpers.filter(o => o !== h && o.kind === 'carrier' && o.job?.sink?.obj === sk.obj).reduce((a, o) => a + o.job.n, 0); // only other carriers' deliveries
          const room = sk.room - claimed; if (room <= 0) continue;
          for (const src of sources(sk.p)) if (src.n > 0) {
            const score = room + src.n * .5 - d2(h, src.at) * .3 + (focus.has(sk.p) ? 25 : 0) + (sk.obj === cart || sk.obj === orders.vip ? 15 : 0); // goal chain first
            if (!best || score > best.score) best = { src, sink: sk, n: Math.min(hc, src.n, room), score };
          }
        }
        if (best) { h.job = best; h.phase = 'get'; } else { walkTo(h, h.home, hs, dt); continue; }
      }
      const j = h.job;
      if (h.phase === 'get') {
        if (walkTo(h, j.src.at, hs, dt) && h.t <= 0) {
          if (j.src.n > 0 && h.stack.length < j.n) { j.src.take(); h.stack.push({ t: j.sink.p, pop: 0 }); h.t = .1; }
          else h.phase = h.stack.length ? 'put' : (h.job = null, 'get');
        }
      } else if (walkTo(h, j.sink.at, hs, dt) && h.t <= 0) {
        if (h.stack.length && j.sink.room > 0 && (j.sink.obj !== orders.vip || orders.vip?.state === 'wait')) { h.stack.pop(); j.sink.reserve?.(); fly(j.sink.p, { x: h.x, y: h.y - 1 }, { x: j.sink.at.x, y: j.sink.at.y }, .2, () => j.sink.put()); h.t = .1; }
        else { h.job = null; if (h.stack.length) h.stack.length = 0; }
      }
    }
  }

  function unhappy(c) {
    c.sad = 1;
    if (gStreak && S.streak > 0) { float(c.x, c.y - 1.8, `Streak lost (${S.streak})`, '#FF8A66'); click(220, .2, .2, 'sine'); buzz(20); }
    S.streak = 0;
  }
  function updateCustomers(dt) {
    const cc = C.customers, open = stands.filter(s => on(s.id));
    const every = Math.max(cc.everyMin, cc.every + cc.everyPerStand * open.length);
    custT -= dt;
    if (custT <= 0 && customers.length < cc.maxBase + cc.maxPerStand * open.length) {
      custT = every * (.7 + Math.random() * .6);
      const stocked = open.filter(s => s.stock > 0), pool = stocked.length && Math.random() < .8 ? stocked : open;
      const s = pool[Math.floor(Math.random() * pool.length)];
      const from = pickSpawn(); customers.push({ from, x: from.x, y: from.y + (Math.random() - .5) * .6, stand: s, want: cc.buyMin + Math.floor(Math.random() * (cc.buyMax - cc.buyMin + 1)), got: [],
        state: 'in', wait: 0, t: 0, look: 1, walk: 0, shirt: ['#FF9EC4', '#7FC8F8', '#FFD23F', '#9C7BEA', '#7BD96B', '#FF8A4C'][Math.floor(Math.random() * 6)] });
    }
    const queue = customers.filter(c => c.state === 'queue');
    const cashier = helpers.some(h => h.kind === 'cashier');
    for (const c of [...customers]) {
      c.t -= dt;
      if (c.state === 'in') { if (walkTo(c, cc.gate, cc.speed, dt)) c.state = 'shop'; }
      else if (c.state === 'shop') {
        if (walkTo(c, c.stand.spot, cc.speed, dt)) {
          if (c.got.length < c.want && c.stand.stock > 0 && !(insp.warning && insp.stall === c.stand)) { /* the inspected stall is closed during the warning */ if (c.t <= 0) { c.stand.stock--; c.got.push(c.stand.product); fly(c.stand.product, c.stand.at, { x: c.x, y: c.y - .9 }, .2); c.t = cc.takeInterval; c.wait = 0; } }
          else if (c.got.length >= c.want || (c.wait += dt) > cc.patience) { c.state = c.got.length ? 'queue' : 'leave'; c.qwait = 0; if (!c.got.length) unhappy(c); }
        }
      } else if (c.state === 'queue') {
        if ((c.qwait += dt) > cc.queuePatience) { c.state = 'leave'; c.stand.stock += c.got.length; c.got = []; unhappy(c); continue; } // gave up waiting in line
        const i = queue.indexOf(c), slot = C.register.queue[Math.min(i, C.register.queue.length - 1)];
        walkTo(c, { x: slot[0], y: slot[1] }, cc.speed, dt);
      } else if (c.state === 'leave') {
        if (walkTo(c, c.left ? c.from : cc.gate, cc.speed, dt)) { if (c.left) customers.splice(customers.indexOf(c), 1); else c.left = true; }
      }
    }
    // checkout: the first customer in line pays when someone works the register
    const front = queue[0], atRegister = d2(P, C.register.mat) < .8;
    if (front && d2(front, { x: C.register.queue[0][0], y: C.register.queue[0][1] }) < .1 && (atRegister || cashier)) {
      const time = atRegister ? C.register.playerTime : C.register.cashierTime;
      checkoutT += dt / time;
      if (checkoutT >= 1) {
        checkoutT = 0;
        const pay = Math.round(front.got.reduce((a, p) => a + C.products[p].price, 0) * bonus.prices);
          S.coins += pay; S.earned += pay; S.served++; for (const p of front.got) S.sold[p] = (S.sold[p] || 0) + 1;
          S.streak++; S.bestStreak = Math.max(S.bestStreak, S.streak);
          if (gStreak && S.streak > 1) float(front.x, front.y - 2.1, `${S.streak} in a row!`, '#4FE378');
        coinsTo(C.register.counter, Math.ceil(pay / 2) + 2);
        float(C.register.counter.x, C.register.counter.y - 1, '+' + pay, '#FFD23F');
        click(1800, .04, .12, 'sine'); buzz(10);
        front.state = 'leave'; front.happy = 1;
        if (S.tut === 2) S.tut = 3;
      }
    } else checkoutT = Math.max(0, checkoutT - dt);
  }

  // ================= upgrades sheet (opens when you stand on the mat) =================
  function openSheet() {
    sheetFor = 'up'; sheet.hidden = false; renderSheet(); click(900, .04, .12, 'sine');
  }
  function closeSheet() { sheetFor = null; sheet.hidden = true; }
  function renderSheet() {
    let h = '<h3>⬆️ Upgrades</h3>';
    for (const [k, u] of Object.entries(C.upgrades)) {
      const lvl = S.up[k] || 0, max = lvl >= u.cost.length, price = u.cost[lvl], locked = u.needs && !on(u.needs);
      const val = u.levels[lvl], next = u.levels[lvl + 1];
      const dots = u.levels.map((_, i) => `<i class="${i <= lvl ? 'on' : ''}"></i>`).join('');
      const detail = locked ? `Needs ${TILES.find(x => x.id === u.needs)?.label || u.needs}` : max ? 'Maxed out' : `${val}${u.unit ? ' ' + u.unit : ''} → ${next}`;
      h += `<div class="fm-up"><span class="ic">${u.icon}</span><span class="nm">${u.label}<span class="fm-lv">${dots}</span><small>${detail}</small></span>` +
        `<button class="btn ${!locked && !max && S.coins >= price ? 'go' : ''}" data-k="${k}" ${locked || max || S.coins < price ? 'disabled' : ''}>${max ? 'MAX' : COIN + ' ' + fmt(price)}</button></div>`;
    }
    sheet.innerHTML = h;
    sheet.querySelectorAll('.btn[data-k]').forEach(b => b.onclick = () => {
      const k = b.dataset.k, lvl = S.up[k] || 0, price = C.upgrades[k].cost[lvl];
      if (S.coins < price) return;
      S.coins -= price; coinShown = Math.min(coinShown, S.coins); S.up[k] = lvl + 1; sChime(false); buzz(20); burst(P.x, P.y - 1, '#FFD23F', 10); float(P.x, P.y - 1.6, C.upgrades[k].label + ' up!', '#FFD23F');
      save(); renderSheet();
    });
  }

  // ================= quest + arrow =================
  function objective() {
    const capN = cap();
    if (S.tut < TUTORIAL.length) {
      if (S.tut === 0) { let best = null, bd = 1e9; for (const pl of fields[0].plots) if (pl.g >= fields[0].grow) { const d = d2(P, pl); if (d < bd) { bd = d; best = pl; } } return { text: TUTORIAL[0].text, at: best || fields[0].plots[1] }; }
      if (S.tut === 1) return { text: TUTORIAL[1].text, at: stands[0].at };
      return { text: TUTORIAL[2].text, at: C.register.mat };
    }
    const pecking = crows.filter(c => c.state !== 'flee').sort((a, b) => d2(P, a.plot) - d2(P, b.plot))[0];
    if (pecking) return { at: pecking.plot };
    const carrying = new Set(P.stack.map(s => s.t));
    const v = orders.vip;
    if (v?.state === 'wait' && Object.entries(v.want).some(([p, k]) => carrying.has(p) && (v.got[p] || 0) < k)) return { at: v };
    if (cart && Object.entries(gFill.fill).some(([p, k]) => carrying.has(p) && (cart.got[p] || 0) < k)) return { at: cart.at };
    if (insp.warning) { const st = stands.find(x => insp.check?.has(x.id) && x.stock < gInspect.inspect.min && carrying.has(x.product)); if (st) return { at: st.at }; }
    const tiles = visibleTiles(), goal = tiles.slice().sort((a, b) => (a.price - (S.partial[a.id] || 0)) - (b.price - (S.partial[b.id] || 0)))[0];
    let at = null;
    const queueWaiting = customers.some(c => c.state === 'queue') && !helpers.some(h => h.kind === 'cashier');
    if (goal && S.coins + (S.partial[goal.id] || 0) >= goal.price) at = goal.at;
    else if (P.stack.length >= capN) at = nearestSink() || C.shipBin; // nowhere to put it: sell it off
    else if (queueWaiting && customers.filter(c => c.state === 'queue').length >= 2) at = C.register.mat;
    else if (P.stack.length && nearestSink()) at = nearestSink();
    else at = nearestSource();
    return { goal, at };
  }
  function nearestSink() { let best = null, bd = 1e9; const types = new Set(P.stack.map(s => s.t)); for (const sk of sinks()) if (types.has(sk.p) && sk.room > 0) { const d = d2(P, sk.at); if (d < bd) { bd = d; best = sk.at; } } return best; }
  function nearestSource() { // the level's products first, anything else otherwise
    return (focus.size && nearestSourceOf(p => focus.has(p))) || nearestSourceOf(() => true);
  }
  function nearestSourceOf(ok) {
    let best = null, bd = 1e9;
    for (const f of fields) if (on(f.id) && ok(f.crop)) for (const pl of f.plots) if (pl.g >= f.grow) { const d = d2(P, pl); if (d < bd) { bd = d; best = pl; } }
    for (const p of Object.keys(C.products)) if (ok(p)) for (const src of sources(p)) if (src.n > 0 && sinks().some(sk => sk.p === p && sk.room > 0)) { const d = d2(P, src.at); if (d < bd) { bd = d; best = src.at; } }
    return best;
  }

  // ================= drawing =================
  const X = x => (x - camX) * T, Y = y => (y - camY) * T;
  const onScreen = (x, y, m = 2) => x > camX - m && x < camX + W / T + m && y > camY - m && y < camY + H / T + m;
  function drawItem(type, x, y, scale = 1) { const sp = art.item(type), s = T * .56 * scale; g.drawImage(sp, x - s / 2, y - s / 2, s, s); }
  function drawStack(ch, stack, x, y) {
    const n = stack.length; if (!n) return;
    const sway = -(ch.vx || 0) * .012 * T;
    const gap = Math.min(.25, 3.2 / n); // tall stacks squeeze together instead of towering off screen
    for (let i = 0; i < n; i++) { const it = stack[i]; drawItem(it.t, x + sway * i * .5 - ch.look * T * .05, y - T * (1.12 + i * gap), easeBack(it.pop)); }
  }
  function drawPile(type, at, n, cols = 4) {
    for (let i = 0; i < n; i++) { const c = i % cols, r = Math.floor(i / cols); drawItem(type, X(at.x) + (c - (cols - 1) / 2) * T * .3, Y(at.y) - r * T * .18 + T * .1, .85); }
  }
  function drawTile(u, t) {
    const have = S.partial[u.id] || 0, afford = S.coins + have >= u.price, x = X(u.at.x), y = Y(u.at.y), s = T * 1.35;
    const pulse = afford ? 1 + Math.sin(t * 6) * .05 : 1;
    g.save(); g.translate(x, y); g.scale(pulse, pulse);
    rr(g, -s / 2, -s / 2, s, s, T * .25); g.fillStyle = afford ? 'rgba(255,210,63,.5)' : 'rgba(255,255,255,.35)'; g.fill();
    if (have) { g.save(); rr(g, -s / 2, -s / 2, s, s, T * .25); g.clip(); g.fillStyle = 'rgba(79,227,120,.65)'; g.fillRect(-s / 2, s / 2 - s * have / u.price, s, s * have / u.price); g.restore(); }
    g.setLineDash([T * .16, T * .1]); rr(g, -s / 2, -s / 2, s, s, T * .25); g.lineWidth = Math.max(2, T * .06); g.strokeStyle = afford ? '#FFF2A8' : '#FFFFFF'; g.stroke(); g.setLineDash([]);
    g.font = `${T * .5}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(u.icon, 0, -T * .08);
    g.font = `600 ${T * .3}px Fredoka, sans-serif`; g.lineWidth = 4; g.strokeStyle = INK; g.fillStyle = '#FFE066';
    const price = fmt(u.price - have), pw = g.measureText(price).width; // the drawn gold coin, then the number
    drawItem('coin', -pw / 2 - T * .05, T * .4, .55); g.textAlign = 'left'; g.strokeText(price, -pw / 2 + T * .12, T * .5); g.fillText(price, -pw / 2 + T * .12, T * .5); g.textAlign = 'center';
    g.font = `600 ${T * .24}px Fredoka, sans-serif`; g.fillStyle = '#fff'; g.strokeText(u.label, 0, -s / 2 - T * .14); g.fillText(u.label, 0, -s / 2 - T * .14);
    g.restore(); g.textBaseline = 'alphabetic';
  }
  function ring(x, y, v, color) {
    g.beginPath(); g.arc(x, y, T * .3, 0, 7); g.fillStyle = 'rgba(43,29,58,.6)'; g.fill();
    g.beginPath(); g.arc(x, y, T * .24, -Math.PI / 2, -Math.PI / 2 + v * Math.PI * 2); g.lineWidth = T * .09; g.strokeStyle = color; g.lineCap = 'round'; g.stroke(); g.lineCap = 'butt';
  }

  function draw(now) {
    frameNo++;
    const t = now / 1000;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sx = shake ? (Math.random() - .5) * shake * T * .5 : 0, sy = shake ? (Math.random() - .5) * shake * T * .5 : 0;
    g.translate(sx, sy);
    // static ground: one drawImage of the visible slice
    // the ground image covers the view; only paint the strips beyond the map edges (saves a full-screen fill)
    g.fillStyle = LAY.theme.grass[0];
    if (camX < 0) g.fillRect(-20, -20, -camX * T + 20, H + 40);
    const right = (C.world.cols - camX) * T; if (right < W) g.fillRect(right, -20, W - right + 20, H + 40);
    if (shake) g.fillRect(-20, -20, W + 40, 20), g.fillRect(-20, H, W + 40, 20);
    const gs = groundCv.gs;
    g.drawImage(groundCv, camX * gs, camY * gs, W / T * gs, H / T * gs, 0, 0, W, H);
    // crops
    for (const f of fields) {
      if (!on(f.id) || !onScreen(f.x + f.w / 2, f.y + f.h / 2, f.w + 2)) continue;
      for (const pl of f.plots) {
        const k = pl.g / f.grow, stage = k >= 1 ? 3 : k > .55 ? 2 : k > .15 ? 1 : 0;
        const sc = stage === 3 ? easeBack(pl.ripeT) * (1 + Math.sin(t * 2 + pl.x) * .03) : 1;
        const sp = art.crop(f.crop, stage), s = T * sc;
        g.drawImage(sp, X(pl.x) - s / 2, Y(pl.y) - s * .6, s, s);
      }
    }
    for (const f of fields) if (on(f.id) && !sinks().some(sk => sk.p === f.crop) && onScreen(f.x + f.w / 2, f.y, 3)) {
      g.font = `600 ${T * .26}px Fredoka, sans-serif`; g.textAlign = 'center'; g.lineWidth = 4; g.strokeStyle = INK; g.fillStyle = '#FFE066';
      const msg = `Needs a ${C.products[f.crop].name.toLowerCase()} stand`; g.strokeText(msg, X(f.x + f.w / 2), Y(f.y) - T * .2); g.fillText(msg, X(f.x + f.w / 2), Y(f.y) - T * .2);
    }
    // pens (animals), crates, piles
    for (const pn of pens) if (on(pn.id) && onScreen(pn.x + 1.5, pn.y + 1.5, 4)) {
      for (const a of [...pn.animals].sort((p, q) => p.y - q.y)) art.animal(g, pn.animal, X(a.x), Y(a.y), a.t, a.look);
      art.crate(g, X(pn.pile.x), Y(pn.pile.y) + T * .15); drawPile(pn.product, pn.pile, pn.n, 3);
    }
    for (const c of crates) if (on(c.id)) { art.crate(g, X(c.at.x), Y(c.at.y) + T * .15); drawPile(c.crop, c.at, Math.min(c.n, 16), 4); if (c.n > 16) { g.fillStyle = '#fff'; g.font = `600 ${T * .26}px Fredoka`; g.textAlign = 'center'; g.fillText('×' + c.n, X(c.at.x), Y(c.at.y) - T * .9); } }
    // floor mats: register + upgrades
    art.mat(g, X(C.register.mat.x), Y(C.register.mat.y), 'rgba(63,182,142,.55)', '');
    art.mat(g, X(C.upgradeMat.x), Y(C.upgradeMat.y), 'rgba(94,168,255,.6)', 'UPGRADES');
    art.bin(g, X(C.shipBin.x), Y(C.shipBin.y), d2(P, C.shipBin) < .8 && P.stack.length > 0);
    // unlock tiles
    for (const u of visibleTiles()) if (onScreen(u.at.x, u.at.y)) drawTile(u, t);
    // machines with their input/output piles
    for (const m of machines) if (on(m.id) && onScreen(m.x, m.y, 4)) {
      art.machine(g, m, X(m.x), Y(m.y), t, m.busy);
      art.crate(g, X(m.inAt.x), Y(m.inAt.y) + T * .15); drawPile(m.in, m.inAt, Math.min(m.inN, 12), 3);
      art.crate(g, X(m.outAt.x), Y(m.outAt.y) + T * .15); drawPile(m.out, m.outAt, Math.min(m.outN, 12), 3);
      if (m.busy) ring(X(m.x), Y(m.y) - T * 1.6, m.prog, '#FFD23F');
      g.font = `600 ${T * .22}px Fredoka`; g.fillStyle = INK; g.textAlign = 'center'; g.fillText(`${C.products[m.in].name} → ${C.products[m.out].name}`, X(m.x), Y(m.y) + T * 1.35);
    }
    // stands with their stock
    for (const s of stands) if (on(s.id)) {
      art.stand(g, X(s.x), Y(C.standY), s.product);
      const n = Math.min(s.stock, 10);
      for (let i = 0; i < n; i++) drawItem(s.product, X(s.x) + ((i % 5) - 2) * T * .27, Y(C.standY) - T * .05 - Math.floor(i / 5) * T * .2, .7);
      if (s.stock > 10) { g.font = `600 ${T * .22}px Fredoka`; g.fillStyle = INK; g.textAlign = 'center'; g.fillText(s.stock, X(s.x), Y(C.standY) + T * .45); }
      drawItem(s.product, X(s.x), Y(C.standY) - T * 1.62, .7);
    }
    art.register(g, X(C.register.counter.x), Y(C.register.counter.y));
    // festival cart: bunting, wheels and a card of what it still needs
    if (cart && onScreen(cart.at.x, cart.at.y, 3)) {
      const x = X(cart.at.x), y = Y(cart.at.y), s = T, lw = Math.max(1.5, s * .05);
      for (const dx of [-.55, .55]) { g.beginPath(); g.arc(x + dx * s, y + s * .32, s * .2, 0, 7); g.fillStyle = '#8A5A36'; g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.stroke(); }
      rr(g, x - s * .85, y - s * .45, s * 1.7, s * .75, s * .12); g.fillStyle = '#E58A5C'; g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
      g.strokeStyle = '#8A5A36'; g.lineWidth = lw * 1.2; g.beginPath(); g.moveTo(x - s * .85, y - s * .45); g.lineTo(x - s * .85, y - s * 1.15); g.moveTo(x + s * .85, y - s * .45); g.lineTo(x + s * .85, y - s * 1.15); g.stroke();
      const flags = ['#FF6B6B', '#FFD23F', '#4FE3B2', '#5EC6FF', '#AE8CFF'];
      for (let i = 0; i < 5; i++) { const fx = x - s * .8 + i * s * .4; g.beginPath(); g.moveTo(fx, y - s * 1.12); g.lineTo(fx + s * .4, y - s * 1.12); g.lineTo(fx + s * .2, y - s * .88); g.closePath(); g.fillStyle = flags[i]; g.fill(); }
      let i = 0; for (const [p, k] of Object.entries(cart.got)) for (let j = 0; j < Math.min(k, 4); j++, i++) drawItem(p, x - s * .6 + (i % 8) * s * .17, y - s * .32 - Math.floor(i / 8) * s * .14, .55);
      const items = Object.entries(gFill.fill), cw = items.length * s * .9 + s * .2;
      rr(g, x - cw / 2, y - s * 2.15, cw, s * .62, s * .2); g.fillStyle = '#FFF7DD'; g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
      g.font = `600 ${s * .24}px Fredoka, sans-serif`; g.textAlign = 'left';
      items.forEach(([p, k], j) => { const ix = x - cw / 2 + s * .25 + j * s * .9, got = Math.min(k, cart.got[p] || 0); drawItem(p, ix, y - s * 1.84, .6); g.fillStyle = got >= k ? '#2E9E5B' : INK; g.fillText(got >= k ? '✓' : `${got}/${k}`, ix + s * .18, y - s * 1.76); });
    }
    // inspection warning: a red ! over any stall that's short
    if (insp.warning) for (const st of stands) if (insp.check?.has(st.id) && st.stock < gInspect.inspect.min) {
      const x = X(st.x), y = Y(C.standY) - T * 2.05 - Math.abs(Math.sin(t * 6)) * T * .15;
      g.beginPath(); g.arc(x, y, T * .26, 0, 7); g.fillStyle = '#FF5A4E'; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
      g.fillStyle = '#fff'; g.font = `700 ${T * .34}px Fredoka, sans-serif`; g.textAlign = 'center'; g.fillText('!', x, y + T * .12);
      g.font = `600 ${T * .22}px Fredoka, sans-serif`; g.lineWidth = 4; g.strokeStyle = INK; g.strokeText('Closed for inspection', X(st.x), Y(C.standY) + T * .62); g.fillText('Closed for inspection', X(st.x), Y(C.standY) + T * .62);
    }
    // everyone, back to front
    const people = [];
    for (const c of customers) people.push([c.y, () => {
      g.globalAlpha = Math.min(1, d2(c, c.from) / .7); // step off / onto the bus
      art.person(g, X(c.x), Y(c.y), { kind: 'customer', shirt: c.shirt, look: c.look, sy: 1 + Math.sin(c.walk * 7) * .03, bob: Math.abs(Math.sin(c.walk * 7)) * T * .04 });
      if (c.got.length) for (let i = 0; i < c.got.length; i++) drawItem(c.got[i], X(c.x) + c.look * T * .28, Y(c.y) - T * (.35 + i * .16), .6);
      if (c.state === 'shop' && c.stand.stock === 0 && c.wait > 2) { g.font = `${T * .35}px sans-serif`; g.textAlign = 'center'; g.fillText('💭', X(c.x), Y(c.y) - T * 1.25); }
      if (c.happy) { c.happy = Math.max(0, c.happy - .02); g.font = `${T * .35}px sans-serif`; g.textAlign = 'center'; g.fillText('😊', X(c.x), Y(c.y) - T * 1.3); }
    }]);
    for (const h of helpers) people.push([h.y, () => { const b = Math.abs(Math.sin((h.walk || 0) * 7)) * T * .04; art.person(g, X(h.x), Y(h.y), { kind: h.kind, look: h.look, bob: b }); drawStack(h, h.stack, X(h.x), Y(h.y) - b); }]);
    people.push([P.y, () => {
      const moving = Math.hypot(P.vx, P.vy) > .3, w = Math.sin(P.walk * 5.5);
      const sq = P.squash * .14, sy = (moving ? 1 + w * .03 : 1 + Math.sin(t * 3) * .02) - sq, sx = 1 / sy + sq * .3;
      const bob = moving ? Math.abs(w) * T * .035 : 0;
      art.person(g, X(P.x), Y(P.y), { kind: 'player', look: P.look, sx, sy, bob });
      drawStack(P, P.stack, X(P.x), Y(P.y) - bob);
    }]);
    const v = orders.vip;
    if (v) people.push([v.y, () => {
      g.globalAlpha = Math.min(1, d2(v, v.from) / .7);
      art.person(g, X(v.x), Y(v.y), { kind: 'customer', shirt: '#FFD23F', look: v.look, bob: Math.abs(Math.sin((v.walk || 0) * 5.5)) * T * .03 });
      g.font = `${T * .36}px sans-serif`; g.textAlign = 'center'; g.fillText(v.happy ? '😍' : v.sad ? '😤' : '⭐', X(v.x), Y(v.y) - T * 1.18);
      if (v.state === 'wait') { // the order bubble with a patience bar
        const entries = Object.entries(v.want), bw = entries.length * T * .95 + T * .3, bx = X(v.x) - bw / 2, by = Y(v.y) - T * 2.35;
        rr(g, bx, by, bw, T * .8, T * .22); g.fillStyle = '#FFFFFF'; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
        g.font = `600 ${T * .24}px Fredoka, sans-serif`; g.textAlign = 'left';
        entries.forEach(([p, k], j) => { const ix = bx + T * .32 + j * T * .95, left = k - (v.got[p] || 0); drawItem(p, ix, by + T * .33, .62); g.fillStyle = left <= 0 ? '#2E9E5B' : INK; g.fillText(left <= 0 ? '✓' : '×' + left, ix + T * .2, by + T * .42); });
        const k = Math.max(0, v.wait / (C.vip.patience + bonus.patience));
        rr(g, bx + T * .12, by + T * .6, bw - T * .24, T * .1, T * .05); g.fillStyle = 'rgba(43,29,58,.15)'; g.fill();
        rr(g, bx + T * .12, by + T * .6, (bw - T * .24) * k, T * .1, T * .05); g.fillStyle = k > .35 ? '#4FE378' : '#FF8A66'; g.fill();
      }
    }]);
    for (const c of crows) people.push([c.y + 5, () => { // crows draw above people
      const x = X(c.x), y = Y(c.y), s = T, flap = c.state === 'peck' ? Math.sin(c.flap * .4) * .15 : Math.sin(c.flap) * .6;
      if (c.state === 'peck') { g.beginPath(); g.arc(X(c.plot.x), Y(c.plot.y), T * .5, 0, 7); g.strokeStyle = `rgba(255,90,78,${.5 + Math.sin(t * 10) * .3})`; g.lineWidth = 3; g.stroke();
        g.beginPath(); g.arc(X(c.plot.x), Y(c.plot.y), T * .5, -Math.PI / 2, -Math.PI / 2 + (c.t / C.crows.peck) * Math.PI * 2); g.strokeStyle = '#FF5A4E'; g.lineWidth = 4; g.stroke(); }
      g.fillStyle = 'rgba(0,0,0,.18)'; if (c.state === 'peck') { g.beginPath(); g.ellipse(x, y + s * .05, s * .22, s * .07, 0, 0, 7); g.fill(); }
      g.save(); g.translate(x, y - s * .3); g.scale((c.fx > c.plot.x ? -1 : 1) * 1.35, 1.35); // a bit bigger so it's easy to spot
      for (const side of [-1, 1]) { g.save(); g.rotate(side * flap); g.beginPath(); g.ellipse(-s * .05, -s * .05, s * .26, s * .09, side * .4, 0, 7); g.fillStyle = '#3A3550'; g.fill(); g.restore(); }
      g.beginPath(); g.ellipse(0, 0, s * .2, s * .14, 0, 0, 7); g.fillStyle = '#2B2640'; g.fill(); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
      g.beginPath(); g.arc(s * .16, -s * .08, s * .1, 0, 7); g.fill(); g.stroke();
      g.fillStyle = '#FFB020'; g.beginPath(); g.moveTo(s * .25, -s * .1); g.lineTo(s * .36, -s * .06); g.lineTo(s * .25, -s * .03); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(s * .19, -s * .11, s * .03, 0, 7); g.fill();
      g.restore();
    }]);
    people.sort((a, b) => a[0] - b[0]).forEach(p => { g.globalAlpha = 1; p[1](); }); g.globalAlpha = 1;
    if (checkoutT > 0) ring(X(C.register.counter.x), Y(C.register.counter.y) - T * 1.2, checkoutT, '#4FE378');
    // items in flight
    for (const f of flying) {
      const k = Math.min(1, f.t / f.dur), to = f.to || { x: P.x, y: P.y - 1.2 - P.stack.length * .25 };
      const x = f.x + (to.x - f.x) * k, y = f.y + (to.y - f.y) * k - Math.sin(k * Math.PI) * .9;
      if (f.type === 'coin') drawItem('coin', X(x), Y(y), .6); else drawItem(f.type, X(x), Y(y), .8);
    }
    for (const p of puffs) { g.globalAlpha = 1 - p.t / .5; g.fillStyle = p.color; g.beginPath(); g.arc(X(p.x), Y(p.y), T * .07, 0, 7); g.fill(); }
    g.globalAlpha = 1;
    // the objective arrow
    const ob = objective();
    if (ob.at) {
      const ax = X(ob.at.x), ay = Y(ob.at.y) - T * (1.05 + Math.abs(Math.sin(t * 4)) * .25);
      if (ax > 20 && ax < W - 20 && ay > 70 && ay < H - 20) {
        g.beginPath(); g.moveTo(ax, ay + T * .32); g.lineTo(ax - T * .26, ay); g.lineTo(ax - T * .1, ay); g.lineTo(ax - T * .1, ay - T * .25); g.lineTo(ax + T * .1, ay - T * .25); g.lineTo(ax + T * .1, ay); g.lineTo(ax + T * .26, ay); g.closePath();
        g.fillStyle = '#FFD23F'; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
      } else {
        const cx = W / 2, cy = H / 2, a = Math.atan2(ay - cy, ax - cx), ex = cx + Math.cos(a) * (W / 2 - 30), ey = Math.max(80, cy + Math.sin(a) * (H / 2 - 30));
        g.save(); g.translate(ex, ey); g.rotate(a); g.beginPath(); g.moveTo(T * .4, 0); g.lineTo(-T * .18, -T * .3); g.lineTo(-T * .18, T * .3); g.closePath(); g.fillStyle = '#FFD23F'; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke(); g.restore();
      }
    }
    // floating text
    g.textAlign = 'center';
    for (const f of floaters) { g.globalAlpha = Math.min(1, 2.4 - f.t * 2); g.font = `600 ${T * .42}px Fredoka, sans-serif`; g.lineWidth = 5; g.strokeStyle = INK; g.fillStyle = f.color; const yy = Y(f.y - f.t * .8); g.strokeText(f.text, X(f.x), yy); g.fillText(f.text, X(f.x), yy); }
    g.globalAlpha = 1;
    // coins flying to the counter (screen space)
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { x: tx, y: ty } = coinTarget; // measured on resize, not per frame (reading layout every frame causes hitches)
    for (let i = coinsFx.length - 1; i >= 0; i--) {
      const c = coinsFx[i]; if (c.t < 0) continue;
      const k = Math.min(1, c.t / c.dur), e = k * k * (3 - 2 * k);
      const x = c.x + (tx - c.x) * e, y = c.y + (ty - c.y) * e - Math.sin(k * Math.PI) * T * 1.4;
      drawItem('coin', x, y, .75 - k * .2);
      if (k >= 1) { coinsFx.splice(i, 1); sClink(); coinEl.classList.remove('bump'); void coinEl.offsetWidth; coinEl.classList.add('bump'); }
    }
    return ob;
  }

  // ================= HUD =================
  let questKey = '', sheetKey = '', coinTarget = { x: 30, y: 30 };
  const setText = (el, v) => { if (el.textContent !== v) el.textContent = v; }; // untouched DOM = no layout work
  const perf = { update: 0, draw: 0, hud: 0 };
  function hud(ob) {
    coinShown += (S.coins - coinShown) * .18; if (Math.abs(S.coins - coinShown) < .5) coinShown = S.coins;
    setText(coinTxt, fmt(Math.round(coinShown)));
    const n = P.stack.length, c = cap();
    setText(bagEl, `🧺 ${n}/${c}`); if (bagEl.classList.contains('full') !== (n >= c)) bagEl.classList.toggle('full', n >= c);
    let html;
    if (ob.text) html = `<span>👉 ${ob.text}</span>`;
    else if (insp.warning) html = `<span>📋 Inspector checks the ${ICON[insp.stall.product]} stall in <b>${Math.ceil(insp.warning)}s</b>: ${insp.stall.stock}/${gInspect.inspect.min}</span>`;
    else if (free) {
      const gl = ob.goal; const have = gl ? Math.min(gl.price, S.coins + (S.partial[gl.id] || 0)) : 0;
      html = gl ? `<span>🎯 ${gl.icon} ${gl.label} <b>${COIN}${fmt(have)}/${fmt(gl.price)}</b></span><span class="bar"><i style="width:${100 * have / gl.price}%"></i></span>` : '<span>🏆 Everything built! Enjoy your farm.</span>';
    }
    else {
      const gs = goals(), cur = gs.find(gl => !gl.done) || gs[gs.length - 1], frac = gs.reduce((a, gl) => a + gl.have / gl.need, 0) / gs.length;
      html = `<span>🎯 ${cur.text} <b>${cur.need > 1 ? fmt(cur.have) + '/' + fmt(cur.need) : ''}</b>${gs.length > 1 ? ` <b>· ${gs.filter(gl => gl.done).length}/${gs.length}</b>` : ''}</span><span class="bar"><i style="width:${100 * frac}%"></i></span>`;
    }
    if (!free) setText(timeTxt, mmss(S.timeLeft)); const low = S.phase === 'play' && S.timeLeft <= 15; if (timeEl.classList.contains('low') !== low) timeEl.classList.toggle('low', low);
    if (html !== questKey) { questKey = html; questEl.innerHTML = html; }
    if (sheetFor) { // re-render only when what you can afford changes, so taps aren't swallowed
      const k = Object.entries(C.upgrades).map(([id, u]) => S.coins >= (u.cost[S.up[id] || 0] ?? Infinity) ? 1 : 0).join('');
      if (k !== sheetKey) { sheetKey = k; renderSheet(); }
    }
  }

  // ================= loop =================
  function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    const t0 = performance.now();
    if (document.visibilityState === 'visible' && S.phase === 'play' && !S.paused && !offlinePanel) update(dt); // the clock stops when the app is hidden
    const t1 = performance.now();
    for (const c of coinsFx) c.t += dt;
    shake = Math.max(0, shake - dt); // fades even when the game is paused or over
    const tx = P.x - W / T / 2, ty = P.y - H / T / 2 - .8; // centred on you; no look-ahead swing when you turn
    camX += (tx - camX) * Math.min(1, dt * 12); camY += (ty - camY) * Math.min(1, dt * 12);
    camX = Math.max(-.3, Math.min(C.world.cols + .3 - W / T, camX)); camY = Math.max(0, Math.min(C.world.rows - H / T, camY));
    if (W / T > C.world.cols) camX = (C.world.cols - W / T) / 2;
    const px = T * dpr; camX = Math.round(camX * px) / px; camY = Math.round(camY * px) / px; // whole device pixels: no shimmer
    const ob = draw(now); const t2 = performance.now(); hud(ob);
    perf.update += (t1 - t0 - perf.update) * .05; perf.draw += (t2 - t1 - perf.draw) * .05; perf.hud += (performance.now() - t2 - perf.hud) * .05; // running averages (ms)
    raf = requestAnimationFrame(frame);
  }
  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2); W = root.clientWidth; H = root.clientHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const cr = coinEl.querySelector('i').getBoundingClientRect(), r0 = root.getBoundingClientRect();
    coinTarget = { x: cr.left - r0.left + cr.width / 2, y: cr.top - r0.top + cr.height / 2 };
    const nt = Math.round(Math.max(32, Math.min(58, W / 9.5)));
    if (nt !== T || !art) { T = nt; art = createArt(T, dpr); groundCv = art.ground(on, LAY); }
  }

  function offlineEarnings(seconds) {
    if (!free || seconds < C.offline.minSeconds) return;
    const secs = Math.min(seconds, C.offline.maxHours * 3600);
    const amt = Math.floor(automatedRate(S.unlocked, S.up) * secs * C.offline.efficiency);
    for (const f of fields) for (const pl of f.plots) pl.g = f.grow; // crops kept growing
    if (amt <= 0) return;
    const hrs = Math.floor(secs / 3600), mins = Math.round(secs % 3600 / 60);
    offlinePanel = panel(el, {
      title: 'While you were away', mood: 'win',
      html: `<p style="text-align:center;font-size:34px;margin:4px 0 6px;color:#FFD23F;font-weight:600">+${COIN} ${fmt(amt)}</p>` +
        `<p style="text-align:center">Your helpers kept the farm running for ${hrs ? hrs + 'h ' : ''}${mins}m.${seconds > secs ? ` (Earnings stop after ${C.offline.maxHours}h.)` : ''}</p>`,
      buttons: [{ label: 'Collect', primary: true, onClick: () => { offlinePanel = null; S.coins += amt; S.earned += amt; coinsTo({ x: camX + W / T / 2, y: camY + H / T / 2 }, 14); sChime(true); save(); last = performance.now(); } }],
    });
  }
  let hiddenAt = 0;
  const onVis = () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); save(); return; }
    last = performance.now();
    if (hiddenAt && free && !offlinePanel) offlineEarnings((Date.now() - hiddenAt) / 1000);
    hiddenAt = 0;
  };
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', onVis);

  const ro = new ResizeObserver(resize); ro.observe(root); resize();
  camX = P.x - W / T / 2; camY = P.y - H / T / 2;
  if (free) { timeEl.textContent = '☰'; timeEl.setAttribute('aria-label', 'Menu'); if (sv.savedAt) offlineEarnings((Date.now() - sv.savedAt) / 1000); }
  else intro();

  // handle for the automated checks (scripts/verify.mjs, tests); not used by the game
  root._dbg = { C, get shake() { return shake; }, crows, orders, cart, insp, L, n, goals, focus, go() { el.querySelectorAll('.ov').forEach(o => o.remove()); S.phase = 'play'; }, perf, unlock: id => unlock(TILES.find(u => u.id === id)), S, P, on, cap, fields, pens, machines, stands, crates, helpers, customers, visibleTiles, sinks, sources, save, update, objective, flying, get coins() { return S.coins; }, set coins(v) { S.coins = v; coinShown = v; } };
  raf = requestAnimationFrame(frame);
  return () => {
    dead = true; cancelAnimationFrame(raf); ro.disconnect(); save();
    window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
    document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', save);
    el.querySelectorAll('.ov').forEach(o => o.remove());
  };
}
