// Sunny Acres: an arcade-idle farm played in timed levels. Drag anywhere to
// walk; everything happens by walking onto things. Harvest crops (they stack
// on your back), stock the market stands, work the register, and stand on
// price tiles to build. Each level gives you a farm, a few things to build, a
// goal and a clock. Numbers, layout and levels: farm/config.js. Drawing:
// farm/art.js. This file is the game loop. Levels and stars are saved.
import { ac, buzz, click, tone } from '../lib/sound.js';
import { progress } from '../lib/progress.js';
import { panel, levelPicker, starsHTML } from '../lib/ui.js';
import { confetti } from '../lib/fx.js';
import { CONFIG as C, UNLOCKS, SHOWN_UNLOCKS, LOOKAHEAD, UNLOCK_SECONDS, UNLOCK_DWELL, TUTORIAL, LEVELS, STAR_TIME_LEFT } from './farm/config.js';
import { createArt, rr, INK } from './farm/art.js';

const START_IDS = new Set([...C.fields, ...C.stands, ...C.zones].filter(e => e.start).map(e => e.id));
const zoneAt = y => C.zones.find(z => y >= z.top - 1 && (z.fenceY === undefined || y <= z.fenceY + .5)) || C.zones[0];
const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const easeBack = t => { t = Math.min(1, t); const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const up = (state, key) => C.upgrades[key].levels[state.up[key] || 0];
const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : String(Math.floor(n));

const ICON = { carrot: '🥕', corn: '🌽', egg: '🥚', bread: '🍞', pumpkin: '🎃', cheese: '🧀', wool: '🧶' };
const mmss = t => { t = Math.max(0, Math.ceil(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
/** Text for a level goal, e.g. "Sell 5 🍞". Exported for tests. */
export const goalText = gl => gl.earn ? `Earn 🪙${fmt(gl.earn)}` : gl.sell ? `Sell ${gl.n} ${ICON[gl.sell]}` : gl.serve ? `Serve ${gl.serve} customers` : `Build the ${UNLOCKS.find(u => u.id === gl.build)?.label.toLowerCase()}`;
/** Stars for finishing with `left` of `total` seconds to spare. */
export const starsFor = (left, total) => left / total >= STAR_TIME_LEFT[0] ? 3 : left / total >= STAR_TIME_LEFT[1] ? 2 : 1;

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
  css: `
.fm{flex:1;min-height:0;position:relative;overflow:hidden;overflow:clip;touch-action:none;background:#86CF62}
.fm canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.fm-hud{position:absolute;left:0;right:0;top:0;padding:8px 10px;display:flex;align-items:flex-start;gap:8px;pointer-events:none;z-index:2}
.fm-coins{display:flex;align-items:center;gap:6px;height:40px;padding:0 14px 0 6px;border-radius:999px;background:#FFF7DD;color:${INK};border:3px solid var(--outline);
  box-shadow:0 4px 0 var(--outline);font-weight:600;font-size:22px;min-width:86px}
.fm-coins i{font-style:normal;font-size:24px;line-height:1}
.fm-coins.bump{animation:fmbump .18s}
@keyframes fmbump{50%{transform:scale(1.12)}}
.fm-quest{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;min-height:40px;padding:4px 12px;border-radius:16px;background:rgba(43,29,58,.82);color:#fff;font-size:14px;font-weight:600;line-height:1.2}
.fm-quest b{color:#FFD23F;font-weight:600;white-space:nowrap}
.fm-quest .bar{display:block;height:5px;border-radius:3px;background:rgba(255,255,255,.2);margin-top:3px;overflow:hidden}
.fm-quest .bar i{display:block;height:100%;background:#FFD23F;border-radius:3px;transition:width .2s}
.fm-time{pointer-events:auto;height:40px;display:flex;align-items:center;gap:4px;padding:0 12px;border-radius:999px;background:#FFF7DD;color:${INK};border:3px solid var(--outline);box-shadow:0 4px 0 var(--outline);font-weight:600;font-size:17px;white-space:nowrap;font-variant-numeric:tabular-nums}
.fm-time.low{background:#FF8A66;animation:pulse .5s ease-in-out infinite alternate}
.fm-bag{position:absolute;left:10px;top:58px;z-index:2;pointer-events:none;height:30px;font-size:14px !important;display:flex;align-items:center;padding:0 10px;border-radius:999px;background:#FFF7DD;color:${INK};border:3px solid var(--outline);box-shadow:0 4px 0 var(--outline);font-weight:600;font-size:15px;white-space:nowrap}
.fm-bag.full{background:#FF8A66;animation:pulse .5s ease-in-out infinite alternate}
.fm-joy{position:absolute;width:110px;height:110px;margin:-55px 0 0 -55px;border-radius:50%;pointer-events:none;background:rgba(255,255,255,.18);border:3px solid rgba(255,255,255,.55);display:none;z-index:2}
.fm-joy i{position:absolute;left:50%;top:50%;width:48px;height:48px;margin:-24px 0 0 -24px;border-radius:50%;background:rgba(255,255,255,.9);border:3px solid var(--outline)}
.fm-sheet{position:absolute;left:8px;right:8px;bottom:8px;z-index:3;background:linear-gradient(180deg,var(--surface2),var(--surface));border:3px solid var(--outline);border-radius:22px;
  box-shadow:0 6px 0 var(--outline);padding:10px;max-height:58%;overflow:auto;animation:popin .3s cubic-bezier(.3,1.6,.5,1)}
.fm-sheet h3{margin:0 0 8px;text-align:center;font-size:18px;color:var(--ink)}
.fm-up{display:grid;grid-template-columns:30px 1fr auto;align-items:center;gap:8px;padding:6px 4px;border-top:1px solid rgba(255,255,255,.08)}
.fm-up .ic{font-size:24px;text-align:center}
.fm-up .nm{color:var(--ink);font-weight:600;font-size:15px;line-height:1.15}
.fm-up .nm small{display:block;color:var(--muted);font-weight:500;font-size:12px}
.fm-up .btn{padding:6px 12px;font-size:15px;min-width:84px}
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

// One level: builds a fresh farm from the level's config and runs it. Returns cleanup.
function runLevel(el, n, api) {
  el.innerHTML = `<div class="fm"><canvas></canvas>
    <div class="fm-hud"><div class="fm-coins"><i>🪙</i><b>0</b></div><div class="fm-quest" aria-live="polite"></div><button class="fm-time" aria-label="Pause">⏸ <span>0:00</span></button></div><div class="fm-bag fm-coins">🧺 0/8</div>
    <div class="fm-joy"><i></i></div><div class="fm-sheet" hidden></div></div>`;
  const root = el.querySelector('.fm'), cv = root.querySelector('canvas'), g = cv.getContext('2d');
  const coinEl = root.querySelector('.fm-hud .fm-coins'), coinTxt = coinEl.querySelector('b'), questEl = root.querySelector('.fm-quest'), bagEl = root.querySelector('.fm-bag'), timeEl = root.querySelector('.fm-time'), timeTxt = timeEl.querySelector('span');
  const joyEl = root.querySelector('.fm-joy'), knob = joyEl.querySelector('i'), sheet = root.querySelector('.fm-sheet');

  // ================= state =================
  const L = LEVELS[n - 1], sv = {}; // every level starts fresh from its config
  api.prog.play(n);
  const S = {
    coins: L.coins, unlocked: new Set(L.start), partial: {}, up: {},
    tut: L.tutorial ? 0 : TUTORIAL.length, earned: 0, sold: {}, served: 0,
    timeLeft: L.time, phase: 'intro', paused: false,
  };
  const buildable = new Set(L.build);
  // this level's price tiles (prices scaled by L.priceScale, rounded to 5)
  const TILES = UNLOCKS.map(u => ({ ...u, price: Math.max(5, Math.round(u.price * (L.priceScale ?? 1) / 5) * 5) }));
  // products the level's sell goals depend on (bread -> flour -> wheat); carriers favour these
  const focus = new Set();
  const addChain = q => { focus.add(q); for (const m of C.machines) if (m.out === q) addChain(m.in); };
  for (const gl of L.goals) if (gl.sell) addChain(gl.sell);
  const on = id => START_IDS.has(id) || S.unlocked.has(id);
  const P = { x: sv.player?.x ?? C.world.start.x, y: sv.player?.y ?? C.world.start.y, stack: (sv.player?.stack || []).map(t => ({ t, pop: 1 })),
    look: 1, walk: 0, vx: 0, vy: 0, squash: 0, harvestT: 0, actT: 0 };
  const fields = C.fields.map(f => ({ ...f, plots: Array.from({ length: f.w * f.h }, (_, i) => ({ x: f.x + i % f.w + .5, y: f.y + Math.floor(i / f.w) + .5, g: f.grow, ripeT: 1, claim: null })) }));
  const pens = C.pens.map(p => ({ ...p, n: sv.piles?.[p.id] ?? 0, timer: 0,
    animals: Array.from({ length: p.animals }, (_, i) => ({ x: p.x + .6 + Math.random() * (p.w - 1.2), y: p.y + .8 + Math.random() * (p.h - 1), tx: 0, ty: 0, look: 1, t: i })) }));
  const machines = C.machines.map(m => ({ ...m, inN: sv.machines?.[m.id]?.in ?? 0, outN: sv.machines?.[m.id]?.out ?? 0, prog: 0,
    inAt: { x: m.x - 1.3, y: m.y + .75 }, outAt: { x: m.x + 1.3, y: m.y + .75 } }));
  const stands = C.stands.map(s => ({ ...s, stock: sv.stands?.[s.product] ?? 0, at: { x: s.x, y: C.standY + .75 }, spot: { x: s.x, y: C.standY + 1.55 } }));
  const crates = C.helpers.filter(h => h.kind === 'farmhand').map(h => ({ id: h.id, at: h.crate, n: sv.crates?.[h.id] ?? 0,
    crop: C.fields.find(f => f.id === h.fields[0]).crop }));
  const helpers = [];
  const customers = [], flying = [], coinsFx = [], floaters = [], puffs = [];
  let shake = 0, raf, last = performance.now(), dead = false;
  let W = 0, H = 0, T = 40, dpr = 1, art = null, groundCv = null, camX = 0, camY = 0, coinShown = S.coins, padAcc = 0, padFx = 0;
  let custT = 1, checkoutT = 0, clinkT = 0, sheetFor = null, tileDwell = 0, lastTile = null;

  const cap = () => up(S, 'carry');
  const zoneOpen = z => z.start || on(z.id);
  const topLimit = () => { for (const z of C.zones) if (!zoneOpen(z)) return z.fenceY + .45; return 1.3; };

  function spawnHelper(h) {
    if (helpers.some(x => x.id === h.id)) return;
    const crate = crates.find(c => c.id === h.id);
    const home = h.kind === 'cashier' ? { x: C.register.mat.x + .55, y: C.register.mat.y - .35 } : h.kind === 'carrier' ? h.home : crate.at;
    helpers.push({ ...h, x: home.x, y: home.y, home, stack: [], path: null, look: 1, walk: 0, job: null, t: 0, crate });
  }
  for (const h of C.helpers) if (on(h.id)) spawnHelper(h);

  // ================= saving =================
  const save = () => {}; // a level is a short round; only levels and stars are saved (by api.prog)

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
  const zoneOfTile = u => zoneAt(u.at.y);
  // The next few unbuilt entries in order (a small look-ahead window, so late items never jump the queue),
  // minus any whose zone is closed or whose `after` isn't built yet.
  const visibleTiles = () => TILES.filter(u => buildable.has(u.id) && !S.unlocked.has(u.id)).slice(0, SHOWN_UNLOCKS + LOOKAHEAD).filter(u => zoneOpen(zoneOfTile(u)) && (!u.after || on(u.after))).slice(0, SHOWN_UNLOCKS);
  function unlock(u) {
    S.unlocked.add(u.id); delete S.partial[u.id];
    const z = C.zones.find(zz => zz.id === u.id), h = C.helpers.find(hh => hh.id === u.id);
    if (h) spawnHelper(h);
    groundCv = art.ground(on);
    const big = !!z || u.price >= 300;
    sChime(big); buzz(big ? 60 : 25); shake = big ? .35 : .15;
    burst(u.at.x, u.at.y, '#FFD23F', 12);
    float(u.at.x, u.at.y - .8, u.label + '!', '#FFFFFF');
    if (z) { confetti(root, 120); float(7, z.fenceY - 2, 'Welcome to the ' + z.name + '!', '#FFD23F'); }
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
    const m = Math.hypot(dx, dy), max = 42; if (m > max) { dx *= max / m; dy *= max / m; }
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
    const m = Math.hypot(mx, my), sp = up(S, 'speed');
    let vx = 0, vy = 0;
    if (m > .12) { const k = Math.min(1, m) / m * sp; vx = mx * k; vy = my * k; P.look = Math.sign(mx) || P.look; }
    P.vx += (vx - P.vx) * Math.min(1, dt * 12); P.vy += (vy - P.vy) * Math.min(1, dt * 12);
    P.x = Math.max(.45, Math.min(C.world.cols - .45, P.x + P.vx * dt));
    P.y = Math.max(topLimit(), Math.min(43.3, P.y + P.vy * dt));
    P.walk += Math.hypot(P.vx, P.vy) * dt;
  }

  // ================= walking helpers =================
  function walkTo(ch, to, speed, dt) {
    const d = d2(ch, to); if (d < .05) return true;
    const step = Math.min(d, speed * dt);
    ch.look = Math.sign(to.x - ch.x) || ch.look; ch.x += (to.x - ch.x) / d * step; ch.y += (to.y - ch.y) / d * step; ch.walk = (ch.walk || 0) + step;
    return step >= d - 1e-6;
  }
  const sources = p => [
    ...crates.filter(c => c.crop === p && on(c.id)).map(c => ({ obj: c, at: c.at, get n() { return c.n; }, take() { c.n--; } })),
    ...pens.filter(pn => pn.product === p && on(pn.id)).map(pn => ({ obj: pn, at: pn.pile, get n() { return pn.n; }, take() { pn.n--; } })),
    ...machines.filter(m => m.out === p && on(m.id)).map(m => ({ obj: m, at: m.outAt, get n() { return m.outN; }, take() { m.outN--; } })),
  ];
  const sinks = () => [
    ...stands.filter(s => on(s.id)).map(s => ({ obj: s, p: s.product, at: s.at, get room() { return C.standCap - s.stock; }, put() { s.stock++; } })),
    ...machines.filter(m => on(m.id)).map(m => ({ obj: m, p: m.in, at: m.inAt, get room() { return C.machineCap - m.inN; }, put() { m.inN++; } })),
  ];

  // ================= the simulation =================
  function update(dt) {
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
        P.stack.splice(i, 1); fly(sk.p, { x: P.x, y: P.y - 1.2 }, sk.at, .22, () => sk.put()); sTick(P.stack.length); acted = true;
        P.actT = C.player.dropInterval;
        if (S.tut === 1 && sk.obj.product) S.tut = 2;
        break;
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
    const onMat = d2(P, C.upgradeMat) < .75;
    if (onMat && sheetFor !== 'up') openSheet(); else if (!onMat && sheetFor) closeSheet();

    // --- effects ---
    for (const f of flying) f.t += dt;
    for (let i = flying.length - 1; i >= 0; i--) if (flying[i].t >= flying[i].dur) { flying[i].then?.(); flying.splice(i, 1); }
    for (const p of puffs) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 6 * dt; }
    while (puffs.length && puffs[0].t > .5) puffs.shift();
    for (const f of floaters) f.t += dt;
    while (floaters.length && floaters[0].t > 1.2) floaters.shift();
    shake = Math.max(0, shake - dt);
    // the clock and the goals
    S.timeLeft -= dt;
    if (S.timeLeft <= 10 && Math.ceil(S.timeLeft) !== Math.ceil(S.timeLeft + dt)) { click(1300, .03, .1, 'square'); buzz(8); }
    if (goals().every(gl => gl.done)) finish(true);
    else if (S.timeLeft <= 0) finish(false);
  }

  // ================= goals, start and finish =================
  function goals() {
    return L.goals.map(gl => {
      const [have, need] = gl.earn ? [S.earned, gl.earn] : gl.sell ? [S.sold[gl.sell] || 0, gl.n] : gl.serve ? [S.served, gl.serve] : [on(gl.build) ? 1 : 0, 1];
      return { ...gl, have: Math.min(have, need), need, done: have >= need, text: goalText(gl) };
    });
  }
  const goalList = () => goals().map(gl => `<p style="margin:0 0 6px">${gl.done ? '✅' : '🎯'} <b>${gl.text}</b>${gl.need > 1 ? ` <span style="opacity:.7">(${fmt(gl.have)}/${fmt(gl.need)})</span>` : ''}</p>`).join('');
  function intro() {
    panel(el, {
      title: `Level ${n}: ${L.name}`,
      html: `<p style="text-align:center;margin-bottom:10px">Beat the goal${L.goals.length > 1 ? 's' : ''} in <b>${mmss(L.time)}</b></p>${goalList()}` +
        (L.build.length ? `<p style="margin-top:8px">To build: ${L.build.map(id => TILES.find(u => u.id === id).icon).join(' ')}</p>` : ''),
      buttons: [{ label: 'Levels', onClick: () => api.pick() }, { label: 'Start', primary: true, onClick: () => { S.phase = 'play'; last = performance.now(); sChime(false); } }],
    });
  }
  function finish(won) {
    if (S.phase !== 'play') return;
    S.phase = 'done'; closeSheet(); joy.on = false; joy.dx = joy.dy = 0; joyEl.style.display = 'none';
    const isLast = n >= LEVELS.length;
    if (won) {
      const stars = starsFor(S.timeLeft, L.time);
      api.prog.complete(n, stars);
      confetti(root, 140); shake = .3; [784, 988, 1175, 1568].forEach((f, i) => setTimeout(() => tone(f), i * 110)); buzz(50);
      setTimeout(() => !dead && panel(el, {
        title: isLast ? 'You beat every level!' : `Level ${n} complete!`, mood: 'win',
        html: `${starsHTML(stars)}<p style="text-align:center">Done with <b>${mmss(S.timeLeft)}</b> to spare.${stars < 3 ? ` Finish with ${mmss(L.time * STAR_TIME_LEFT[stars === 1 ? 1 : 0])} left for ${stars === 1 ? 'two' : 'three'} stars.` : ''}</p>`,
        buttons: [{ label: 'Levels', onClick: () => api.pick() }, { label: 'Retry', onClick: () => api.start(n) },
          ...(isLast ? [] : [{ label: 'Next level', primary: true, onClick: () => api.start(n + 1) }])],
      }), 700);
    } else {
      click(220, .35, .25, 'sine'); buzz(30);
      panel(el, {
        title: "Time's up!", mood: 'lose',
        html: `<p style="text-align:center;margin-bottom:10px">Here's how far you got:</p>${goalList()}`,
        buttons: [{ label: 'Levels', onClick: () => api.pick() }, { label: 'Try again', primary: true, onClick: () => api.start(n) }],
      });
    }
  }
  function pauseMenu() {
    if (S.phase !== 'play') return;
    S.paused = true;
    panel(el, {
      title: 'Paused', html: `<p style="text-align:center">Level ${n}: ${L.name} · ${mmss(S.timeLeft)} left</p>${goalList()}`,
      buttons: [{ label: 'Levels', onClick: () => api.pick() }, { label: 'Restart', onClick: () => api.start(n) }, { label: 'Resume', primary: true, onClick: () => { S.paused = false; last = performance.now(); } }],
    });
  }
  timeEl.addEventListener('pointerdown', e => e.stopPropagation()); // not a joystick drag
  timeEl.onclick = pauseMenu;

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
            const score = room + src.n * .5 - d2(h, src.at) * .3 + (focus.has(sk.p) ? 25 : 0); // goal chain first
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
        if (h.stack.length && j.sink.room > 0) { h.stack.pop(); fly(j.sink.p, { x: h.x, y: h.y - 1 }, j.sink.at, .2, () => j.sink.put()); h.t = .1; }
        else { h.job = null; if (h.stack.length) h.stack.length = 0; }
      }
    }
  }

  function updateCustomers(dt) {
    const cc = C.customers, open = stands.filter(s => on(s.id));
    const every = Math.max(cc.everyMin, cc.every + cc.everyPerStand * open.length);
    custT -= dt;
    if (custT <= 0 && customers.length < cc.maxBase + cc.maxPerStand * open.length) {
      custT = every * (.7 + Math.random() * .6);
      const stocked = open.filter(s => s.stock > 0), pool = stocked.length && Math.random() < .8 ? stocked : open;
      const s = pool[Math.floor(Math.random() * pool.length)];
      customers.push({ x: cc.spawn.x + (Math.random() - .5), y: cc.spawn.y, stand: s, want: cc.buyMin + Math.floor(Math.random() * (cc.buyMax - cc.buyMin + 1)), got: [],
        state: 'in', wait: 0, t: 0, look: 1, walk: 0, shirt: ['#FF9EC4', '#7FC8F8', '#FFD23F', '#9C7BEA', '#7BD96B', '#FF8A4C'][Math.floor(Math.random() * 6)] });
    }
    const queue = customers.filter(c => c.state === 'queue');
    const cashier = helpers.some(h => h.kind === 'cashier');
    for (const c of [...customers]) {
      c.t -= dt;
      if (c.state === 'in') { if (walkTo(c, cc.gate, cc.speed, dt)) c.state = 'shop'; }
      else if (c.state === 'shop') {
        if (walkTo(c, c.stand.spot, cc.speed, dt)) {
          if (c.got.length < c.want && c.stand.stock > 0) { if (c.t <= 0) { c.stand.stock--; c.got.push(c.stand.product); fly(c.stand.product, c.stand.at, { x: c.x, y: c.y - .9 }, .2); c.t = cc.takeInterval; c.wait = 0; } }
          else if (c.got.length >= c.want || (c.wait += dt) > cc.patience) c.state = c.got.length ? 'queue' : 'leave';
        }
      } else if (c.state === 'queue') {
        const i = queue.indexOf(c), slot = C.register.queue[Math.min(i, C.register.queue.length - 1)];
        walkTo(c, { x: slot[0], y: slot[1] }, cc.speed, dt);
      } else if (c.state === 'leave') {
        if (walkTo(c, c.left ? cc.spawn : cc.gate, cc.speed, dt)) { if (c.left) customers.splice(customers.indexOf(c), 1); else c.left = true; }
      }
    }
    // checkout: the first customer in line pays when someone works the register
    const front = queue[0], atRegister = d2(P, C.register.mat) < .8;
    if (front && d2(front, { x: C.register.queue[0][0], y: C.register.queue[0][1] }) < .1 && (atRegister || cashier)) {
      const time = atRegister ? C.register.playerTime : C.register.cashierTime;
      checkoutT += dt / time;
      if (checkoutT >= 1) {
        checkoutT = 0;
        const pay = front.got.reduce((a, p) => a + C.products[p].price, 0);
        S.coins += pay; S.earned += pay; S.served++; for (const p of front.got) S.sold[p] = (S.sold[p] || 0) + 1;
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
        `<button class="btn ${!locked && !max && S.coins >= price ? 'go' : ''}" data-k="${k}" ${locked || max || S.coins < price ? 'disabled' : ''}>${max ? 'MAX' : '🪙 ' + fmt(price)}</button></div>`;
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
    const tiles = visibleTiles(), goal = tiles.slice().sort((a, b) => (a.price - (S.partial[a.id] || 0)) - (b.price - (S.partial[b.id] || 0)))[0];
    let at = null;
    const queueWaiting = customers.some(c => c.state === 'queue') && !helpers.some(h => h.kind === 'cashier');
    if (goal && S.coins + (S.partial[goal.id] || 0) >= goal.price) at = goal.at;
    else if (P.stack.length >= capN) at = nearestSink();
    else if (queueWaiting && customers.filter(c => c.state === 'queue').length >= 2) at = C.register.mat;
    else if (P.stack.length && nearestSink()) at = nearestSink();
    else at = nearestSource();
    return { goal, at };
  }
  function nearestSink() { let best = null, bd = 1e9; const types = new Set(P.stack.map(s => s.t)); for (const sk of sinks()) if (types.has(sk.p) && sk.room > 0) { const d = d2(P, sk.at); if (d < bd) { bd = d; best = sk.at; } } return best; }
  function nearestSource() {
    let best = null, bd = 1e9;
    for (const f of fields) if (on(f.id)) for (const pl of f.plots) if (pl.g >= f.grow) { const d = d2(P, pl); if (d < bd) { bd = d; best = pl; } }
    for (const p of Object.keys(C.products)) for (const src of sources(p)) if (src.n > 0 && sinks().some(sk => sk.p === p && sk.room > 0)) { const d = d2(P, src.at); if (d < bd) { bd = d; best = src.at; } }
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
    const price = '🪙' + fmt(u.price - have); g.strokeText(price, 0, T * .42); g.fillText(price, 0, T * .42);
    g.font = `600 ${T * .24}px Fredoka, sans-serif`; g.fillStyle = '#fff'; g.strokeText(u.label, 0, -s / 2 - T * .14); g.fillText(u.label, 0, -s / 2 - T * .14);
    g.restore(); g.textBaseline = 'alphabetic';
  }
  function ring(x, y, v, color) {
    g.beginPath(); g.arc(x, y, T * .3, 0, 7); g.fillStyle = 'rgba(43,29,58,.6)'; g.fill();
    g.beginPath(); g.arc(x, y, T * .24, -Math.PI / 2, -Math.PI / 2 + v * Math.PI * 2); g.lineWidth = T * .09; g.strokeStyle = color; g.lineCap = 'round'; g.stroke(); g.lineCap = 'butt';
  }

  function draw(now) {
    const t = now / 1000;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sx = shake ? (Math.random() - .5) * shake * T * .5 : 0, sy = shake ? (Math.random() - .5) * shake * T * .5 : 0;
    g.translate(sx, sy);
    // static ground: one drawImage of the visible slice
    // the ground image covers the view; only paint the strips beyond the map edges (saves a full-screen fill)
    g.fillStyle = '#86CF62';
    if (camX < 0) g.fillRect(-20, -20, -camX * T + 20, H + 40);
    const right = (C.world.cols - camX) * T; if (right < W) g.fillRect(right, -20, W - right + 20, H + 40);
    if (shake) g.fillRect(-20, -20, W + 40, 20), g.fillRect(-20, H, W + 40, 20);
    const gs = T * dpr;
    g.drawImage(groundCv, camX * gs, camY * gs, W * dpr, H * dpr, 0, 0, W, H);
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
    // everyone, back to front
    const people = [];
    for (const c of customers) people.push([c.y, () => {
      art.person(g, X(c.x), Y(c.y), { kind: 'customer', shirt: c.shirt, look: c.look, sy: 1 + Math.sin(c.walk * 7) * .03, bob: Math.abs(Math.sin(c.walk * 7)) * T * .04 });
      if (c.got.length) for (let i = 0; i < c.got.length; i++) drawItem(c.got[i], X(c.x) + c.look * T * .28, Y(c.y) - T * (.35 + i * .16), .6);
      if (c.state === 'shop' && c.stand.stock === 0 && c.wait > 2) { g.font = `${T * .35}px sans-serif`; g.textAlign = 'center'; g.fillText('💭', X(c.x), Y(c.y) - T * 1.25); }
      if (c.happy) { c.happy = Math.max(0, c.happy - .02); g.font = `${T * .35}px sans-serif`; g.textAlign = 'center'; g.fillText('😊', X(c.x), Y(c.y) - T * 1.3); }
    }]);
    for (const h of helpers) people.push([h.y, () => { const b = Math.abs(Math.sin((h.walk || 0) * 7)) * T * .04; art.person(g, X(h.x), Y(h.y), { kind: h.kind, look: h.look, bob: b }); drawStack(h, h.stack, X(h.x), Y(h.y) - b); }]);
    people.push([P.y, () => {
      const moving = Math.hypot(P.vx, P.vy) > .3, w = Math.sin(P.walk * 7);
      const sq = P.squash * .16, sy = (moving ? 1 + w * .05 : 1 + Math.sin(t * 3) * .02) - sq, sx = 1 / sy + sq * .3;
      const bob = moving ? Math.abs(w) * T * .05 : 0;
      art.person(g, X(P.x), Y(P.y), { kind: 'player', look: P.look, sx, sy, bob });
      drawStack(P, P.stack, X(P.x), Y(P.y) - bob);
    }]);
    people.sort((a, b) => a[0] - b[0]).forEach(p => p[1]());
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
    const cr = coinEl.querySelector('i').getBoundingClientRect(), rr0 = root.getBoundingClientRect(), tx = cr.left - rr0.left + cr.width / 2, ty = cr.top - rr0.top + cr.height / 2;
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
  let questKey = '', sheetKey = '';
  const perf = { update: 0, draw: 0, hud: 0 };
  function hud(ob) {
    coinShown += (S.coins - coinShown) * .18; if (Math.abs(S.coins - coinShown) < .5) coinShown = S.coins;
    coinTxt.textContent = fmt(Math.round(coinShown));
    const n = P.stack.length, c = cap();
    bagEl.textContent = `🧺 ${n}/${c}`; bagEl.classList.toggle('full', n >= c);
    let html;
    if (ob.text) html = `<span>👉 ${ob.text}</span>`;
    else {
      const gs = goals(), cur = gs.find(gl => !gl.done) || gs[gs.length - 1], frac = gs.reduce((a, gl) => a + gl.have / gl.need, 0) / gs.length;
      html = `<span>🎯 ${cur.text} <b>${cur.need > 1 ? fmt(cur.have) + '/' + fmt(cur.need) : ''}</b>${gs.length > 1 ? ` <b>· ${gs.filter(gl => gl.done).length}/${gs.length}</b>` : ''}</span><span class="bar"><i style="width:${100 * frac}%"></i></span>`;
    }
    timeTxt.textContent = mmss(S.timeLeft); timeEl.classList.toggle('low', S.phase === 'play' && S.timeLeft <= 15);
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
    if (document.visibilityState === 'visible' && S.phase === 'play' && !S.paused) update(dt); // the clock stops when the app is hidden
    const t1 = performance.now();
    for (const c of coinsFx) c.t += dt;
    const tx = P.x - W / T / 2, ty = P.y - H / T / 2 - .8;
    camX += (tx - camX) * Math.min(1, dt * 7); camY += (ty - camY) * Math.min(1, dt * 7);
    camX = Math.max(-.3, Math.min(C.world.cols + .3 - W / T, camX)); camY = Math.max(0, Math.min(C.world.rows - H / T, camY));
    if (W / T > C.world.cols) camX = (C.world.cols - W / T) / 2;
    const ob = draw(now); const t2 = performance.now(); hud(ob);
    perf.update += (t1 - t0 - perf.update) * .05; perf.draw += (t2 - t1 - perf.draw) * .05; perf.hud += (performance.now() - t2 - perf.hud) * .05; // running averages (ms)
    raf = requestAnimationFrame(frame);
  }
  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2); W = root.clientWidth; H = root.clientHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const nt = Math.round(Math.max(32, Math.min(58, W / 9.5)));
    if (nt !== T || !art) { T = nt; art = createArt(T, dpr); groundCv = art.ground(on); }
  }

  const onVis = () => { if (document.visibilityState === 'visible') last = performance.now(); };
  document.addEventListener('visibilitychange', onVis);

  const ro = new ResizeObserver(resize); ro.observe(root); resize();
  camX = P.x - W / T / 2; camY = P.y - H / T / 2;
  intro();

  // handle for the automated checks (scripts/verify.mjs, tests); not used by the game
  root._dbg = { L, n, goals, focus, go() { el.querySelectorAll('.ov').forEach(o => o.remove()); S.phase = 'play'; }, perf, unlock: id => unlock(TILES.find(u => u.id === id)), S, P, on, cap, fields, pens, machines, stands, crates, helpers, customers, visibleTiles, sinks, sources, save, update, objective, flying, get coins() { return S.coins; }, set coins(v) { S.coins = v; coinShown = v; } };
  raf = requestAnimationFrame(frame);
  return () => {
    dead = true; cancelAnimationFrame(raf); ro.disconnect(); save();
    window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
    document.removeEventListener('visibilitychange', onVis);
    el.querySelectorAll('.ov').forEach(o => o.remove());
  };
}
