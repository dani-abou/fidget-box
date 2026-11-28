// Jelly Gates: drag each jelly to the gate of its colour before the clock runs out.
// Rules in jelly/logic.js; levels (all proven solvable) from src/data/jelly-levels.json
// (scripts/make-jelly-levels.mjs).
import { ac, buzz, click, tone } from '../lib/sound.js';
import { progress, loadSave, writeSave } from '../lib/progress.js';
import { panel, levelPicker, starsHTML, pills } from '../lib/ui.js';
import { confetti, floater, shake } from '../lib/fx.js';
import { makeState, reachable, occupancy, gateFor, passGate, locked, won, absCells, DIRS } from './jelly/logic.js';

const INK = '#1A1238';
const HUE = { red: '#FF5A6E', blue: '#4DA6FF', yellow: '#FFD23F', green: '#4FD67A', purple: '#A77BFF', orange: '#FF9A3C' };
const BOOST = { freeze: { icon: '❄️', label: 'Freeze', cost: 40, tip: 'Stops the clock for 15 seconds.' },
  hammer: { icon: '🔨', label: 'Hammer', cost: 60, tip: 'Tap ice, a chain, a crate or an icy gate to smash it.' },
  rocket: { icon: '🚀', label: 'Rocket', cost: 90, tip: 'Tap a jelly to blast it off the board.' } };
const starsFor = (left, total) => (left / total >= .5 ? 3 : left / total >= .25 ? 2 : 1);

export default {
  id: 'jelly',
  name: 'Jelly Gates',
  description: 'Slide every jelly out through the gate of its colour, against the clock. Ice, chains, crates and double jellies. 60 levels.',
  color: '--pink',
  icon: '<svg viewBox="0 0 40 40" fill="currentColor"><rect x="5" y="9" width="14" height="14" rx="4"/><rect x="21" y="17" width="14" height="14" rx="4" opacity=".7"/><path d="M14 2h12v4H14z"/></svg>',
  levels: 60,
  art: `<svg viewBox="0 0 100 100"><rect x="8" y="8" width="84" height="84" rx="16" fill="#3A2A7A" stroke="#0D0920" stroke-width="4"/>
    <rect x="38" y="4" width="26" height="9" rx="3" fill="#4FD67A" stroke="#0D0920" stroke-width="3"/><rect x="84" y="50" width="9" height="24" rx="3" fill="#FF5A6E" stroke="#0D0920" stroke-width="3"/>
    <g stroke="#0D0920" stroke-width="3"><rect x="18" y="18" width="30" height="30" rx="9" fill="#4FD67A"/><rect x="52" y="18" width="30" height="30" rx="9" fill="#FFD23F"/><rect x="18" y="52" width="64" height="30" rx="9" fill="#4DA6FF"/><rect x="60" y="56" width="18" height="22" rx="6" fill="#FF5A6E"/></g>
    <g fill="#0D0920"><circle cx="28" cy="33" r="2.5"/><circle cx="38" cy="33" r="2.5"/><circle cx="40" cy="67" r="2.5"/><circle cx="50" cy="67" r="2.5"/></g>
    <g fill="#fff" opacity=".55"><rect x="22" y="22" width="10" height="5" rx="2.5"/><rect x="56" y="22" width="10" height="5" rx="2.5"/><rect x="22" y="56" width="14" height="5" rx="2.5"/></g></svg>`,
  css: `
.jg-wrap{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:6px 10px 14px}
.jg-board{touch-action:none;display:block}
.jg-tip{max-width:460px;min-height:1.3em;text-align:center;color:var(--muted);font-size:14px;line-height:1.3;margin:0}
.jg-boosts{display:flex;gap:12px}
.jg-boost{position:relative;width:62px;height:58px;border-radius:18px;font-size:28px;display:grid;place-items:center;background:var(--surface2);border:3px solid var(--outline);box-shadow:var(--shadow),var(--bevel);color:var(--ink)}
.jg-boost:active{transform:translateY(3px)} .jg-boost.on{background:var(--butter);animation:pulse .5s ease-in-out infinite alternate}
.jg-boost b{position:absolute;right:-8px;bottom:-8px;font-size:11px;background:var(--surface);border:2px solid var(--outline);border-radius:999px;padding:1px 6px;font-weight:600}
.pill.time.low{background:var(--peach);color:var(--on-accent)}
`,

  init(el) {
    el.innerHTML = `<div class="gbar"><span class="stat"></span><button class="ibtn undo" aria-label="Undo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg></button><button class="ibtn restart" aria-label="Restart level"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-3-6.2"/><path d="M20 3v5h-5"/></svg></button><button class="ibtn lvls" aria-label="Levels"><svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/></svg></button></div>
      <div class="jg-wrap"><canvas class="jg-board"></canvas><p class="jg-tip"></p><div class="jg-boosts">${Object.entries(BOOST).map(([k, b]) => `<button class="jg-boost" data-b="${k}" aria-label="${b.label}">${b.icon}<b>${b.cost}</b></button>`).join('')}</div></div>`;
    const stat = el.querySelector('.stat'), wrap = el.querySelector('.jg-wrap'), cv = el.querySelector('canvas'), g = cv.getContext('2d');
    const tipEl = el.querySelector('.jg-tip'), undoBtn = el.querySelector('.undo');
    const prog = progress('jelly'), bank = loadSave('jelly') || { coins: 150 };
    let LEVELS = [], n = 1, L = null, S = null, hist = [], cs = 40, ox = 0, oy = 0, dpr = 1, dead = false, raf = 0, last = performance.now();
    let timeLeft = 0, frozenFor = 0, phase = 'play', drag = null, armed = null, fx = [], view = [];

    const saveBank = () => writeSave('jelly', bank);
    function hud() {
      const tl = Math.ceil(timeLeft), mm = `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`;
      stat.innerHTML = pills([{ label: 'Lv', value: n, cls: 'lvl' }, { value: (frozenFor > 0 ? '❄️ ' : '⏱ ') + mm, cls: 'time' + (timeLeft < 15 && !frozenFor ? ' low' : '') }, { value: `🪙 ${bank.coins}`, cls: 'star' }]);
      undoBtn.disabled = !hist.length || phase !== 'play';
      el.querySelectorAll('.jg-boost').forEach(b => { b.classList.toggle('on', armed === b.dataset.b); b.disabled = phase !== 'play'; });
    }
    let hudT = 0;

    function start(level) {
      n = level; L = LEVELS[n - 1]; S = makeState(L); prog.play(n);
      hist = []; timeLeft = L.time; frozenFor = 0; phase = 'play'; drag = null; armed = null; fx = [];
      view = S.blocks.map(b => ({ r: b.r, c: b.c, path: [], out: 0, pop: 0 }));
      tipEl.textContent = L.tip || '';
      layout(); hud();
    }
    function layout() {
      if (!L) return;
      dpr = Math.min(devicePixelRatio || 1, 2);
      const W = wrap.clientWidth - 8, H = wrap.clientHeight - 110;
      cs = Math.max(18, Math.floor(Math.min(W / (L.w + 1.4), H / (L.h + 1.4), 64)));
      const bw = (L.w + 1.4) * cs, bh = (L.h + 1.4) * cs; ox = oy = .7 * cs;
      cv.style.width = bw + 'px'; cv.style.height = bh + 'px'; cv.width = Math.round(bw * dpr); cv.height = Math.round(bh * dpr);
    }

    // ---------- moves ----------
    const snapshot = () => ({ blocks: JSON.stringify(S.blocks), out: S.out });
    const restore = h => { S.blocks = JSON.parse(h.blocks); S.out = h.out; view = S.blocks.map(b => ({ r: b.r, c: b.c, path: [], out: b.gone ? 1 : 0, pop: 0 })); };
    function moveTo(i, tr, tc) { // slide to the reachable spot nearest (tr, tc), along the path
      const b = S.blocks[i], reach = reachable(S, i), W = L.w;
      let best = b.r * W + b.c, bd = Math.hypot(tr - b.r, tc - b.c);
      for (const k of reach.keys()) { const d = Math.hypot(tr - Math.floor(k / W), tc - k % W); if (d < bd - 1e-6) { bd = d; best = k; } }
      if (best === b.r * W + b.c) return;
      const path = []; for (let k = best; k !== -1 && k !== b.r * W + b.c; k = reach.get(k)) path.unshift([Math.floor(k / W), k % W]);
      view[i].path.push(...path); b.r = Math.floor(best / W); b.c = best % W;
      click(700 + path.length * 40, .02, .08, 'triangle');
      checkGate(i);
    }
    function checkGate(i) {
      const gt = gateFor(S, i); if (!gt) return;
      const res = passGate(S, i);
      if (res === 'out') {
        view[i].exit = gt.side; drag = null; tone(880); buzz(15);
        burstAt(i, HUE[gt.color]);
        if (won(S)) setTimeout(win, 500);
      } else { view[i].pop = 1; click(1200, .05, .12, 'square'); buzz(10); burstAt(i, HUE[gt.color]); drag = null; }
    }
    function burstAt(i, color) {
      const b = S.blocks[i], cells = absCells(b), cr = cells.reduce((a, [r]) => a + r, 0) / cells.length, cc = cells.reduce((a, [, c]) => a + c, 0) / cells.length;
      for (let k = 0; k < 14; k++) fx.push({ x: cc + .5, y: cr + .5, vx: (Math.random() - .5) * 6, vy: (Math.random() - .5) * 6 - 2, t: 0, color });
    }
    const cellAt = e => { const b = cv.getBoundingClientRect(); return [(e.clientY - b.top - oy) / cs, (e.clientX - b.left - ox) / cs]; };
    const blockAt = (r, c) => S.blocks.findIndex(b => !b.gone && absCells(b).some(([rr, cc]) => rr === Math.floor(r) && cc === Math.floor(c)));

    cv.addEventListener('pointerdown', e => {
      if (!S || phase !== 'play') return; ac();
      const [r, c] = cellAt(e), i = blockAt(r, c);
      if (armed) return useBoost(armed, r, c, i);
      if (i < 0) return;
      const b = S.blocks[i];
      if (locked(S, b)) {
        shake(cv); click(160, .08, .12, 'square'); buzz(20);
        const why = b.ice && S.out < b.ice ? `Frozen: ${b.ice - S.out} more to go` : 'Chained: free its key first';
        const bx = cv.getBoundingClientRect(), ex = el.getBoundingClientRect();
        floater(el, e.clientX - ex.left, e.clientY - ex.top - 20, why); return;
      }
      cv.setPointerCapture(e.pointerId);
      hist.push(snapshot()); if (hist.length > 60) hist.shift();
      drag = { i, r0: b.r, c0: b.c, pr: r, pc: c, moved: false };
      click(500, .02, .1, 'sine');
    });
    cv.addEventListener('pointermove', e => {
      if (!drag || phase !== 'play') return;
      const [r, c] = cellAt(e), tr = Math.round(drag.r0 + r - drag.pr), tc = Math.round(drag.c0 + c - drag.pc);
      const b = S.blocks[drag.i];
      if (tr !== b.r || tc !== b.c) { drag.moved = true; moveTo(drag.i, tr, tc); hud(); }
    });
    const up = () => { if (drag && !drag.moved) hist.pop(); drag = null; hud(); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

    undoBtn.onclick = () => { const h = hist.pop(); if (!h || phase !== 'play') return; restore(h); click(600, .03, .15); hud(); };
    el.querySelector('.restart').onclick = () => { start(n); click(900, .03, .2, 'triangle'); };
    el.querySelector('.lvls').onclick = () => { phase = 'menu'; levelPicker(el, { count: LEVELS.length, prog, onPick: start }); };

    // ---------- boosters ----------
    el.querySelectorAll('.jg-boost').forEach(btn => btn.onclick = () => {
      if (phase !== 'play') return; ac();
      const k = btn.dataset.b, bo = BOOST[k];
      if (bank.coins < bo.cost) { shake(btn); floater(el, btn.offsetLeft + 30, btn.offsetTop - 10, `Needs 🪙 ${bo.cost}`); return; }
      if (k === 'freeze') { bank.coins -= bo.cost; saveBank(); frozenFor = 15; tone(1320); hud(); return; }
      armed = armed === k ? null : k; tipEl.textContent = armed ? bo.tip : (L.tip || ''); hud();
    });
    function useBoost(k, r, c, i) {
      const bo = BOOST[k]; let used = false;
      if (k === 'rocket' && i >= 0) {
        hist.push(snapshot()); const b = S.blocks[i];
        b.gone = true; S.out++; view[i].exit = 'up'; burstAt(i, HUE[b.color]); used = true;
        if (won(S)) setTimeout(win, 500);
      }
      if (k === 'hammer') {
        const b = i >= 0 ? S.blocks[i] : null;
        const ri = Math.floor(r), ci = Math.floor(c);
        const crate = (L.crates || []).find(cr => S.out < cr.n && cr.cells.some(([a, bb]) => a === ri && bb === ci));
        const gate = (L.gates || []).find(gg => gg.ice && S.out < gg.ice && gateHit(gg, r, c));
        hist.push(snapshot());
        if (b && b.ice && S.out < b.ice) { b.ice = 0; used = true; }
        else if (b && b.lock) { delete b.lock; used = true; }
        else if (crate) { crate.n = 0; used = true; }
        else if (gate) { gate.ice = 0; used = true; }
        else hist.pop();
        if (used) { shake(cv); click(140, .1, .2, 'square'); buzz(30); }
      }
      if (used) { bank.coins -= bo.cost; saveBank(); }
      armed = null; tipEl.textContent = L.tip || ''; hud();
    }
    const gateHit = (gg, r, c) => { // a tap on the frame beside the gap
      const vert = gg.side === 'up' || gg.side === 'down', a = vert ? c : r, d = vert ? r : c;
      const edge = gg.side === 'up' || gg.side === 'left' ? -.7 : (vert ? L.h : L.w) - .3;
      return a >= gg.from && a < gg.from + gg.len && Math.abs(d - edge - .35) < 1;
    };

    // ---------- end of level ----------
    function win() {
      if (phase !== 'play') return; phase = 'done';
      const stars = starsFor(timeLeft, L.time), coins = 10 + stars * 10;
      prog.complete(n, stars); bank.coins += coins; saveBank();
      confetti(el, 100); [523, 659, 784, 1047].forEach((f, j) => setTimeout(() => tone(f), j * 100)); buzz(40);
      const lastLv = n >= LEVELS.length;
      setTimeout(() => !dead && panel(el, {
        title: lastLv ? 'All 60 cleared!' : `Level ${n} cleared`, mood: 'win',
        html: `${starsHTML(stars)}<p style="text-align:center">${Math.ceil(timeLeft)}s to spare · +🪙 ${coins}${stars < 3 ? '<br>Finish with half the clock left for three stars.' : ''}</p>`,
        buttons: [{ label: 'Retry', onClick: () => start(n) },
          lastLv ? { label: 'Levels', primary: true, onClick: () => levelPicker(el, { count: LEVELS.length, prog, onPick: start }) } : { label: 'Next level', primary: true, onClick: () => start(n + 1) }],
      }), 600);
      hud();
    }
    function timeUp() {
      phase = 'over'; click(220, .3, .2, 'sawtooth'); buzz(60); hud();
      panel(el, {
        title: 'Out of time!', html: `<p style="text-align:center">${S.blocks.filter(b => !b.gone).length} jellies still on the board.</p>`,
        buttons: [{ label: 'Retry', onClick: () => start(n) }, { label: `+20s · 🪙 50`, primary: true, onClick: () => {
          if (bank.coins < 50) { start(n); return; } bank.coins -= 50; saveBank(); timeLeft = 20; phase = 'play'; hud(); } }],
      });
    }

    // ---------- drawing ----------
    function roundCells(cells, inset, rad, x0, y0) { // one rounded shape over a set of cells, joined where they touch
      const has = new Set(cells.map(([r, c]) => r + ',' + c));
      g.beginPath();
      for (const [r, c] of cells) {
        const x = x0 + c * cs, y = y0 + r * cs;
        const l = has.has(r + ',' + (c - 1)) ? 0 : inset, rt = has.has(r + ',' + (c + 1)) ? 0 : inset;
        const t = has.has((r - 1) + ',' + c) ? 0 : inset, bt = has.has((r + 1) + ',' + c) ? 0 : inset;
        g.roundRect(x + l, y + t, cs - l - rt, cs - t - bt, [(!l || !t) ? 0 : rad, (!rt || !t) ? 0 : rad, (!rt || !bt) ? 0 : rad, (!l || !bt) ? 0 : rad]);
      }
    }
    function jelly(b, v, t) {
      const rel = b.cells, x0 = ox + v.c * cs, y0 = oy + v.r * cs, pop = v.pop ? 1 + Math.sin(v.pop * Math.PI) * .08 : 1;
      const cr = rel.reduce((a, [r]) => a + r, 0) / rel.length, cc = rel.reduce((a, [, c]) => a + c, 0) / rel.length;
      g.save(); const cx = x0 + (cc + .5) * cs, cy = y0 + (cr + .5) * cs;
      g.translate(cx, cy); g.scale(pop, pop); g.translate(-cx, -cy);
      if (v.exit) g.globalAlpha = Math.max(0, 1 - v.out);
      const base = HUE[b.color], wob = drag && S.blocks[drag.i] === b ? Math.sin(t * 20) * .6 : 0;
      g.fillStyle = 'rgba(0,0,0,.28)'; roundCells(rel, cs * .07, cs * .26, x0, y0 + cs * .07); g.fill();
      roundCells(rel, cs * .06 - wob, cs * .26, x0, y0); g.fillStyle = base; g.fill(); g.lineWidth = Math.max(2, cs * .06); g.strokeStyle = INK; g.stroke();
      if (b.inner) { roundCells(rel, cs * .24, cs * .16, x0, y0); g.fillStyle = HUE[b.inner]; g.fill(); g.lineWidth = Math.max(1.5, cs * .04); g.stroke(); }
      // gloss and a face on the first cell
      g.fillStyle = 'rgba(255,255,255,.42)';
      for (const [r, c] of rel) { g.beginPath(); g.roundRect(x0 + c * cs + cs * .16, y0 + r * cs + cs * .14, cs * .3, cs * .12, cs * .06); g.fill(); }
      const [fr, fc] = rel[rel.length >> 1], fx0 = x0 + (fc + .5) * cs, fy0 = y0 + (fr + .55) * cs;
      g.fillStyle = INK; for (const dx of [-.12, .12]) { g.beginPath(); g.arc(fx0 + dx * cs, fy0, cs * .05, 0, 7); g.fill(); }
      g.lineWidth = Math.max(1.5, cs * .035); g.strokeStyle = INK; g.beginPath(); g.arc(fx0, fy0 + cs * .06, cs * .07, .3, Math.PI - .3); g.stroke();
      if (b.axis) { // one-way stripes
        g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = Math.max(2, cs * .06); g.lineCap = 'round';
        for (const [r, c] of rel) { const x = x0 + c * cs, y = y0 + r * cs; g.beginPath();
          if (b.axis === 'h') { g.moveTo(x + cs * .2, y + cs * .8); g.lineTo(x + cs * .8, y + cs * .8); } else { g.moveTo(x + cs * .82, y + cs * .2); g.lineTo(x + cs * .82, y + cs * .8); } g.stroke(); }
        g.fillStyle = '#fff'; g.font = `700 ${cs * .32}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(b.axis === 'h' ? '⇆' : '⇅', x0 + (rel[0][1] + .5) * cs, y0 + (rel[0][0] + .28) * cs);
      }
      if (b.key) badge(x0 + (rel[0][1] + .78) * cs, y0 + (rel[0][0] + .22) * cs, '🔑');
      if (b.lock && S.blocks.some(k => k.key === b.lock && !k.gone)) {
        g.strokeStyle = '#C9C3D9'; g.lineWidth = cs * .09; g.setLineDash([cs * .12, cs * .06]);
        for (const [r, c] of rel) { const x = x0 + c * cs, y = y0 + r * cs; g.beginPath(); g.moveTo(x, y); g.lineTo(x + cs, y + cs); g.moveTo(x + cs, y); g.lineTo(x, y + cs); g.stroke(); }
        g.setLineDash([]); badge(x0 + (rel[0][1] + .5) * cs, y0 + (rel[0][0] + .5) * cs, '🔒');
      }
      if (b.ice && S.out < b.ice) {
        roundCells(rel, cs * .04, cs * .24, x0, y0); g.fillStyle = 'rgba(210,240,255,.72)'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
        num(x0 + (cc + .5) * cs, y0 + (cr + .5) * cs, b.ice - S.out, '#2E7CC0');
      }
      g.restore();
    }
    function badge(x, y, ch) { g.font = `${cs * .34}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, x, y); }
    function num(x, y, v, color) {
      g.font = `700 ${cs * .42}px Fredoka, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = Math.max(3, cs * .09); g.strokeStyle = '#fff'; g.strokeText(v, x, y); g.fillStyle = color; g.fillText(v, x, y);
    }
    function draw(t) {
      const W = L.w, H = L.h;
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
      // frame
      g.fillStyle = '#2A1F5C'; g.strokeStyle = INK; g.lineWidth = 3;
      g.beginPath(); g.roundRect(ox - cs * .55, oy - cs * .55, W * cs + cs * 1.1, H * cs + cs * 1.1, cs * .45); g.fill(); g.stroke();
      // floor
      for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
        if (L.floor[r][c] !== '.') continue;
        g.fillStyle = (r + c) % 2 ? '#3F3285' : '#45378F'; g.fillRect(ox + c * cs, oy + r * cs, cs, cs);
      }
      // walls inside the frame (notches, pillars): raised blocks
      for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (L.floor[r][c] !== '.') {
        g.fillStyle = '#2A1F5C'; g.fillRect(ox + c * cs - .5, oy + r * cs - .5, cs + 1, cs + 1);
        g.fillStyle = 'rgba(255,255,255,.06)'; g.beginPath(); g.roundRect(ox + c * cs + cs * .12, oy + r * cs + cs * .12, cs * .76, cs * .76, cs * .15); g.fill();
      }
      // gates: coloured gaps in the frame with an arrow; icy ones show how many must leave first
      for (const gt of L.gates) {
        const vert = gt.side === 'up' || gt.side === 'down', th = cs * .5;
        const x = vert ? ox + gt.from * cs + 3 : gt.side === 'left' ? ox - th - 2 : ox + W * cs + 2;
        const y = vert ? (gt.side === 'up' ? oy - th - 2 : oy + H * cs + 2) : oy + gt.from * cs + 3;
        const w = vert ? gt.len * cs - 6 : th, h = vert ? th : gt.len * cs - 6, iced = gt.ice && S.out < gt.ice;
        g.beginPath(); g.roundRect(x, y, w, h, cs * .14); g.fillStyle = iced ? '#D2F0FF' : HUE[gt.color]; g.fill(); g.lineWidth = 2.5; g.strokeStyle = INK; g.stroke();
        if (iced) { g.fillStyle = HUE[gt.color]; g.beginPath(); g.roundRect(x + (vert ? 0 : w * .3), y + (vert ? h * .3 : 0), vert ? w : w * .4, vert ? h * .4 : h, 3); g.globalAlpha = .5; g.fill(); g.globalAlpha = 1; num(x + w / 2, y + h / 2, gt.ice - S.out, '#2E7CC0'); }
        else { g.fillStyle = 'rgba(255,255,255,.9)'; g.font = `700 ${cs * .32}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText({ up: '▲', down: '▼', left: '◀', right: '▶' }[gt.side], x + w / 2, y + h / 2 + 1); }
      }
      // crates
      for (const cr of L.crates || []) if (S.out < cr.n) {
        const rs = cr.cells.map(c => c[0]), cs2 = cr.cells.map(c => c[1]), r0 = Math.min(...rs), c0 = Math.min(...cs2), rw = Math.max(...cs2) - c0 + 1, rh = Math.max(...rs) - r0 + 1;
        const x = ox + c0 * cs + 3, y = oy + r0 * cs + 3, w = rw * cs - 6, h = rh * cs - 6;
        g.beginPath(); g.roundRect(x, y, w, h, cs * .12); g.fillStyle = '#C98A50'; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
        g.strokeStyle = '#8A5A36'; g.lineWidth = cs * .1; g.beginPath(); g.moveTo(x + 6, y + 6); g.lineTo(x + w - 6, y + h - 6); g.moveTo(x + w - 6, y + 6); g.lineTo(x + 6, y + h - 6); g.stroke();
        g.beginPath(); g.roundRect(x + w / 2 - cs * .32, y + h / 2 - cs * .24, cs * .64, cs * .48, cs * .1); g.fillStyle = '#7A2E2E'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#FFD23F'; g.stroke();
        g.font = `700 ${cs * .34}px Fredoka, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(cr.n - S.out, x + w / 2, y + h / 2 + 1);
      }
      // jellies (the one you hold on top)
      const order = S.blocks.map((b, i) => i).sort((a, b) => (drag?.i === a) - (drag?.i === b));
      for (const i of order) { const b = S.blocks[i], v = view[i]; if (b.gone && (!v.exit || v.out >= 1)) continue; jelly(b, v, t); }
      // hammer/rocket targeting hint
      if (armed) { g.strokeStyle = '#FFD25A'; g.lineWidth = 3; g.setLineDash([8, 6]); g.lineDashOffset = -t * 30; g.beginPath(); g.roundRect(ox - 2, oy - 2, W * cs + 4, H * cs + 4, 8); g.stroke(); g.setLineDash([]); }
      for (const p of fx) { g.globalAlpha = Math.max(0, 1 - p.t / .7); g.fillStyle = p.color; g.beginPath(); g.arc(ox + p.x * cs, oy + p.y * cs, cs * .09, 0, 7); g.fill(); }
      g.globalAlpha = 1;
    }

    function frame(now) {
      const dt = Math.min(.05, (now - last) / 1000); last = now; const t = now / 1000;
      if (L) {
        if (phase === 'play' && document.visibilityState === 'visible' && !el.querySelector('.ov')) {
          if (frozenFor > 0) frozenFor = Math.max(0, frozenFor - dt); else timeLeft -= dt;
          if ((hudT -= dt) <= 0) { hudT = .25; hud(); }
          if (timeLeft <= 0) { timeLeft = 0; timeUp(); }
        }
        // jellies glide along their paths; leaving ones slide out through the gap
        view.forEach((v, i) => {
          const b = S.blocks[i];
          if (v.path.length) { const [tr, tc] = v.path[0], d = Math.hypot(tr - v.r, tc - v.c), step = dt * 22; if (d <= step) { v.r = tr; v.c = tc; v.path.shift(); } else { v.r += (tr - v.r) / d * step; v.c += (tc - v.c) / d * step; } }
          else if (!v.exit) { v.r = b.r; v.c = b.c; }
          if (v.exit && !v.path.length) { const [dr, dc] = DIRS[v.exit]; v.out += dt * 2.5; v.r += dr * dt * 9; v.c += dc * dt * 9; }
          if (v.pop) v.pop = Math.max(0, v.pop - dt * 3);
        });
        for (const p of fx) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 9 * dt; }
        fx = fx.filter(p => p.t < .7);
        draw(t);
      }
      raf = requestAnimationFrame(frame);
    }

    const ro = new ResizeObserver(layout); ro.observe(wrap);
    fetch(new URL('../data/jelly-levels.json', import.meta.url)).then(r => r.json()).then(l => { if (dead) return; LEVELS = l; start(prog.last); raf = requestAnimationFrame(frame); });
    el._jelly = { get S() { return S; }, get L() { return L; }, moveTo: (i, r, c) => moveTo(i, r, c), reachable: i => reachable(S, i), start, get phase() { return phase; } }; // for the automated checks
    return () => { dead = true; cancelAnimationFrame(raf); ro.disconnect(); };
  },
};
