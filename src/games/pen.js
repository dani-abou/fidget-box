// Goat Pen: a fence-building puzzle. You get a few fences; put them down so the
// goat can't wander to the edge of the meadow, and pen in as much as you can.
// Rules live in pen/logic.js. Levels (with their par, the best pen the level
// maker found) come from src/data/pen-levels.json (scripts/make-pen-levels.mjs).
import { ac, buzz, click, tone } from '../lib/sound.js';
import { progress, loadSave, writeSave } from '../lib/progress.js';
import { panel, levelPicker, starsHTML, pills } from '../lib/ui.js';
import { confetti, floater, shake } from '../lib/fx.js';
import { parse, reach, fenceable, escapePath, starsFor, BONUS } from './pen/logic.js';

const INK = '#2B1D3A';

export default {
  id: 'pen',
  name: 'Goat Pen',
  description: 'A few fences, one runaway goat. Pen it in with as much meadow as you can. 40 levels.',
  color: '--mint',
  icon: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 10v22M14 10v22M26 10v22M34 10v22M4 16h32M4 26h32"/></svg>',
  levels: 40,
  art: `<svg viewBox="0 0 100 100"><rect x="8" y="8" width="84" height="84" rx="16" fill="#6FC25A" stroke="#0D0920" stroke-width="4"/>
    <rect x="12" y="62" width="30" height="26" rx="8" fill="#4FA9E8"/><rect x="26" y="26" width="48" height="44" rx="6" fill="#FFE59A" opacity=".85"/>
    <g stroke="#0D0920" stroke-width="2.5" fill="#C98A50"><rect x="22" y="22" width="7" height="18" rx="2"/><rect x="71" y="22" width="7" height="18" rx="2"/><rect x="71" y="60" width="7" height="18" rx="2"/><rect x="22" y="44" width="7" height="18" rx="2"/>
    <rect x="25" y="26" width="50" height="5" rx="2"/><rect x="74" y="34" width="5" height="40" rx="2"/></g>
    <ellipse cx="50" cy="55" rx="15" ry="10" fill="#fff" stroke="#0D0920" stroke-width="3"/><circle cx="62" cy="44" r="8" fill="#fff" stroke="#0D0920" stroke-width="3"/>
    <path d="M58 37l-3-6M64 36l2-7" stroke="#0D0920" stroke-width="3" stroke-linecap="round"/><circle cx="64" cy="43" r="1.8" fill="#0D0920"/><path d="M40 63v6M47 64v6M55 64v6" stroke="#0D0920" stroke-width="3.5" stroke-linecap="round"/></svg>`,
  css: `
.gp-wrap{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:10px 12px 18px}
.gp-board{touch-action:manipulation;border-radius:14px;border:3px solid var(--outline);box-shadow:0 6px 0 var(--outline);cursor:pointer;display:block}
.gp-tip{max-width:460px;min-height:2.6em;text-align:center;color:var(--muted);font-size:15px;line-height:1.3;margin:0}
.gp-done{min-width:170px}
.gp-done:disabled{opacity:.5}
`,

  init(el) {
    el.innerHTML = `<div class="gbar"><span class="stat"></span><button class="ibtn undo" aria-label="Undo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg></button><button class="ibtn restart" aria-label="Clear fences"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-3-6.2"/><path d="M20 3v5h-5"/></svg></button><button class="ibtn lvls" aria-label="Levels"><svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/></svg></button></div>
      <div class="gp-wrap"><canvas class="gp-board"></canvas><p class="gp-tip"></p><button class="btn primary gp-done" disabled>Pen it!</button></div>`;
    const stat = el.querySelector('.stat'), wrap = el.querySelector('.gp-wrap'), cv = el.querySelector('canvas'), g = cv.getContext('2d');
    const tipEl = el.querySelector('.gp-tip'), doneBtn = el.querySelector('.gp-done'), undoBtn = el.querySelector('.undo');
    const prog = progress('pen'), bests = loadSave('pen') || {};
    let LEVELS = [], n = 1, lv = null, L = null, fences = [], cs = 40, dpr = 1, R = null, peek = 0, ghost = null, done = false, dead = false, raf = 0, t0 = performance.now();

    const left = () => lv.fences - fences.length;
    function update() {
      R = reach(L, fences);
      const best = bests[n];
      stat.innerHTML = pills([{ label: 'Lv', value: n, cls: 'lvl' }, { label: 'Fences', value: left(), cls: left() ? '' : 'warn' },
        { label: 'Score', value: R.escaped ? '–' : R.score, cls: !R.escaped && R.score >= lv.par ? 'star' : '' }, ...(best ? [{ label: 'Best', value: best }] : [])]);
      undoBtn.disabled = !fences.length || done;
      doneBtn.disabled = R.escaped || done;
      doneBtn.textContent = R.escaped ? 'The goat can still get out' : `Pen it! · ${R.score}`;
    }

    function start(level) {
      n = level; lv = LEVELS[n - 1]; L = parse(lv.rows); prog.play(n);
      fences = []; done = false; ghost = null; peek = 0;
      tipEl.textContent = lv.tip || `${lv.fences} fences. Tap the goat to see where it would run.`;
      layout(); update();
    }
    function layout() {
      if (!L) return;
      const avail = Math.min(wrap.clientWidth - 24, wrap.clientHeight - 120, 640);
      cs = Math.max(22, Math.floor(avail / Math.max(L.w, L.h)));
      dpr = Math.min(devicePixelRatio || 1, 2);
      cv.style.width = cs * L.w + 'px'; cv.style.height = cs * L.h + 'px';
      cv.width = Math.round(cs * L.w * dpr); cv.height = Math.round(cs * L.h * dpr);
    }

    // ---------- input ----------
    cv.addEventListener('pointerdown', e => {
      if (!L || done) return; ac();
      const b = cv.getBoundingClientRect(), c = Math.floor((e.clientX - b.left) / cs), r = Math.floor((e.clientY - b.top) / cs);
      if (c < 0 || r < 0 || c >= L.w || r >= L.h) return;
      const i = r * L.w + c, k = fences.indexOf(i);
      if (i === L.goat) { peek = peek ? 0 : performance.now(); click(660, .04, .12, 'triangle'); return; }
      if (k >= 0) { fences.splice(k, 1); click(420, .03, .15, 'triangle'); buzz(6); }
      else if (!fenceable(L, i)) { click(180, .05, .12, 'sine'); return; }
      else if (!left()) { shake(stat); click(160, .08, .14, 'square'); buzz(20); floater(el, e.clientX - el.getBoundingClientRect().left, e.clientY - el.getBoundingClientRect().top - 20, 'No fences left'); return; }
      else { fences.push(i); click(760 + fences.length * 30, .035, .16, 'triangle'); buzz(10); }
      const wasOut = R.escaped; update();
      if (wasOut && !R.escaped) { tone(784); peek = 0; }
    });
    undoBtn.onclick = () => { if (done || !fences.length) return; fences.pop(); click(500, .03, .15); update(); };
    el.querySelector('.restart').onclick = () => { if (!L) return; fences = []; done = false; ghost = null; click(900, .03, .2, 'triangle'); update(); };
    el.querySelector('.lvls').onclick = () => levelPicker(el, { count: LEVELS.length, prog, onPick: start });

    doneBtn.onclick = () => {
      if (R.escaped || done) return;
      done = true; update();
      const score = R.score, stars = starsFor(score, lv.par), beat = score > lv.par;
      prog.complete(n, stars);
      if (!bests[n] || score > bests[n]) { bests[n] = score; writeSave('pen', bests); }
      [523, 659, 784, 1047].slice(0, stars + 1).forEach((f, j) => setTimeout(() => tone(f), j * 110)); buzz(30);
      if (stars === 3) confetti(el, 90);
      setTimeout(() => {
        if (dead) return;
        const last = n >= LEVELS.length;
        const show = () => { ghost = lv.best; done = true; draw(); panelUp(); };
        const panelUp = () => panel(el, {
          title: stars === 3 ? (beat ? 'Better than par!' : 'Perfect pen!') : `Level ${n} penned`, mood: 'win',
          html: `${starsHTML(stars)}<p style="text-align:center">Score <b>${score}</b> · par <b>${lv.par}</b>${stars < 3 ? `<br>${lv.par - score} short of par. There's a bigger pen in there.` : ''}</p>`,
          buttons: [
            ...(stars < 3 ? [{ label: 'Show par', onClick: show }] : []),
            { label: 'Retry', onClick: () => start(n) },
            last ? { label: 'Levels', primary: true, onClick: () => levelPicker(el, { count: LEVELS.length, prog, onPick: start }) } : { label: 'Next level', primary: true, onClick: () => start(n + 1) },
          ],
        });
        panelUp();
      }, 600);
    };

    // ---------- drawing ----------
    const isFence = new Set();
    function draw() {
      if (!L) return;
      const t = (performance.now() - t0) / 1000, s = cs, W = L.w, H = L.h;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      isFence.clear(); for (const f of fences) isFence.add(f);
      const inside = new Uint8Array(W * H); if (!R.escaped) for (const i of R.region) inside[i] = 1;
      const roam = new Uint8Array(W * H); if (R.escaped && peek) for (const i of R.region) roam[i] = 1;
      for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
        const i = r * W + c, x = c * s, y = r * s, ch = L.cells[i];
        if (ch === '~') { g.fillStyle = '#4FA9E8'; g.fillRect(x, y, s, s); continue; }
        g.fillStyle = inside[i] ? ((r + c) % 2 ? '#FFE9A6' : '#FFE29A') : ((r + c) % 2 ? '#78C85A' : '#82D163'); g.fillRect(x, y, s, s);
        if (roam[i]) { g.fillStyle = 'rgba(255,90,78,.33)'; g.fillRect(x, y, s, s); }
        if (inside[i] && (i * 7) % 5 === 0) { g.fillStyle = '#fff'; for (const [dx, dy] of [[.25, .3], [.7, .72]]) { g.beginPath(); g.arc(x + dx * s, y + dy * s, s * .045, 0, 7); g.fill(); } }
      }
      // water: ripples and a shore line where it meets land
      g.lineCap = 'round';
      for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
        const i = r * W + c; if (L.cells[i] !== '~') continue;
        const x = c * s, y = r * s;
        g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = Math.max(1.5, s * .05);
        const ph = Math.sin(t * 1.5 + i) * s * .06;
        g.beginPath(); g.moveTo(x + s * .25 + ph, y + s * .45); g.lineTo(x + s * .5 + ph, y + s * .45); g.stroke();
        g.strokeStyle = '#2E7CC0'; g.lineWidth = Math.max(2, s * .07);
        const land = (rr, cc) => rr >= 0 && cc >= 0 && rr < H && cc < W && L.cells[rr * W + cc] !== '~';
        if (land(r - 1, c)) { g.beginPath(); g.moveTo(x, y + 1); g.lineTo(x + s, y + 1); g.stroke(); }
        if (land(r + 1, c)) { g.beginPath(); g.moveTo(x, y + s - 1); g.lineTo(x + s, y + s - 1); g.stroke(); }
        if (land(r, c - 1)) { g.beginPath(); g.moveTo(x + 1, y); g.lineTo(x + 1, y + s); g.stroke(); }
        if (land(r, c + 1)) { g.beginPath(); g.moveTo(x + s - 1, y); g.lineTo(x + s - 1, y + s); g.stroke(); }
      }
      // grid
      g.strokeStyle = 'rgba(0,0,0,.08)'; g.lineWidth = 1;
      for (let c = 1; c < W; c++) { g.beginPath(); g.moveTo(c * s, 0); g.lineTo(c * s, H * s); g.stroke(); }
      for (let r = 1; r < H; r++) { g.beginPath(); g.moveTo(0, r * s); g.lineTo(W * s, r * s); g.stroke(); }
      // the pen's outline
      if (!R.escaped) {
        g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = Math.max(2, s * .06); g.setLineDash([s * .18, s * .12]);
        for (const i of R.region) {
          const r = (i / W) | 0, c = i % W, x = c * s, y = r * s, out = j => !inside[j];
          if (r === 0 || out(i - W)) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + s, y); g.stroke(); }
          if (r === H - 1 || out(i + W)) { g.beginPath(); g.moveTo(x, y + s); g.lineTo(x + s, y + s); g.stroke(); }
          if (c === 0 || out(i - 1)) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + s); g.stroke(); }
          if (c === W - 1 || out(i + 1)) { g.beginPath(); g.moveTo(x + s, y); g.lineTo(x + s, y + s); g.stroke(); }
        }
        g.setLineDash([]);
      }
      // items
      for (let i = 0; i < W * H; i++) { const ch = L.cells[i]; if ('cgwT'.includes(ch)) item(ch, (i % W + .5) * s, (((i / W) | 0) + .5) * s, s, t, inside[i]); }
      // par's fences, ghosted, after "Show par"
      if (ghost) for (const f of ghost) { const x = (f % W) * s, y = ((f / W) | 0) * s; g.fillStyle = 'rgba(255,210,90,.5)'; g.strokeStyle = '#FFD25A'; g.lineWidth = 3; g.setLineDash([5, 4]); g.beginPath(); g.roundRect(x + s * .12, y + s * .12, s * .76, s * .76, s * .15); g.fill(); g.stroke(); g.setLineDash([]); }
      // fences: posts with rails to neighbouring fences (diagonals too, since corners hold)
      for (const f of fences) {
        const r = (f / W) | 0, c = f % W, cx = (c + .5) * s, cy = (r + .5) * s;
        g.strokeStyle = INK; g.lineWidth = s * .2;
        for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) { const j = (r + dr) * W + c + dc; if (r + dr < H && c + dc >= 0 && c + dc < W && isFence.has(j)) { g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + dc * s, cy + dr * s); g.stroke(); } }
        g.strokeStyle = '#C98A50'; g.lineWidth = s * .12;
        for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) { const j = (r + dr) * W + c + dc; if (r + dr < H && c + dc >= 0 && c + dc < W && isFence.has(j)) { g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + dc * s, cy + dr * s); g.stroke(); } }
      }
      for (const f of fences) {
        const x = (f % W + .5) * s, y = (((f / W) | 0) + .5) * s;
        g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.ellipse(x, y + s * .3, s * .25, s * .09, 0, 0, 7); g.fill();
        g.beginPath(); g.roundRect(x - s * .16, y - s * .36, s * .32, s * .66, s * .07); g.fillStyle = '#B5733D'; g.fill(); g.lineWidth = Math.max(2, s * .06); g.strokeStyle = INK; g.stroke();
        g.fillStyle = '#D9995C'; g.beginPath(); g.roundRect(x - s * .1, y - s * .3, s * .08, s * .5, s * .03); g.fill();
      }
      // where the goat would run: a dotted trail to the edge
      if (R.escaped && peek) {
        const path = escapePath(L, fences);
        if (path) {
          g.strokeStyle = '#FF5A4E'; g.lineWidth = Math.max(3, s * .1); g.setLineDash([s * .12, s * .14]); g.lineDashOffset = -t * 30;
          g.beginPath(); path.forEach((p, k) => { const x = (p % W + .5) * s, y = (((p / W) | 0) + .5) * s; k ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.setLineDash([]);
          const e = path[path.length - 1]; g.font = `${s * .6}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('💨', (e % W + .5) * s, (((e / W) | 0) + .5) * s);
        }
      }
      goat((L.goat % L.w + .5) * s, (((L.goat / L.w) | 0) + .5) * s, s, t);
    }
    function item(ch, x, y, s, t, inside) {
      g.save(); g.translate(x, y);
      const lw = Math.max(1.5, s * .05);
      if (ch === 'c' || ch === 'g') {
        const gold = ch === 'g', bob = Math.sin(t * 3 + x) * s * .03;
        g.translate(0, bob); g.rotate(-.5);
        for (const a of [-.4, 0, .4]) { g.beginPath(); g.ellipse(Math.sin(a) * s * .1, -s * .26, s * .05, s * .13, a, 0, 7); g.fillStyle = '#4FB848'; g.fill(); g.lineWidth = lw * .7; g.strokeStyle = INK; g.stroke(); }
        g.beginPath(); g.moveTo(-s * .13, -s * .16); g.quadraticCurveTo(0, -s * .22, s * .13, -s * .16); g.lineTo(0, s * .3); g.closePath();
        g.fillStyle = gold ? '#FFC93C' : '#FF8A2A'; g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
        if (gold) { g.rotate(.5); g.fillStyle = '#fff'; const k = (Math.sin(t * 4) + 1) / 2; g.globalAlpha = .4 + .6 * k; g.font = `${s * .28}px sans-serif`; g.textAlign = 'center'; g.fillText('✦', s * .22, -s * .18); g.globalAlpha = 1; }
      } else if (ch === 'w') {
        g.beginPath(); g.ellipse(0, s * .02, s * .2, s * .26, 0, 0, 7); g.fillStyle = '#B99A6B'; g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
        g.strokeStyle = 'rgba(43,29,58,.45)'; g.lineWidth = lw * .7; for (const dy of [-.1, .04, .16]) { g.beginPath(); g.moveTo(-s * .17, s * dy); g.lineTo(s * .17, s * dy); g.stroke(); }
        g.fillStyle = INK; g.beginPath(); g.arc(0, s * .2, s * .04, 0, 7); g.fill();
        for (let k = 0; k < 3; k++) { const a = t * 3 + k * 2.1, wx = Math.cos(a) * s * .32, wy = Math.sin(a * 1.3) * s * .25 - s * .05; g.fillStyle = '#FFD23F'; g.beginPath(); g.ellipse(wx, wy, s * .06, s * .04, 0, 0, 7); g.fill(); g.fillStyle = INK; g.fillRect(wx - s * .01, wy - s * .04, s * .02, s * .08); }
      } else if (ch === 'T') {
        g.beginPath(); g.ellipse(0, s * .05, s * .34, s * .24, 0, 0, 7); g.fillStyle = '#9C6A43'; g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
        g.beginPath(); g.ellipse(0, s * .08, s * .22, s * .14, 0, 0, 7); g.fillStyle = '#2B1D3A'; g.fill();
        g.globalAlpha = .5 + .5 * Math.sin(t * 3); g.fillStyle = '#AE8CFF'; g.beginPath(); g.ellipse(0, s * .08, s * .1, s * .06, 0, 0, 7); g.fill(); g.globalAlpha = 1;
      }
      if (inside && BONUS[ch]) { // the value it adds, on a little tag
        const v = BONUS[ch], txt = (v > 0 ? '+' : '') + v;
        g.setTransform(dpr, 0, 0, dpr, 0, 0); g.font = `700 ${s * .26}px Fredoka, sans-serif`; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = INK;
        g.fillStyle = v > 0 ? '#FFE066' : '#FF8A66'; g.strokeText(txt, x + s * .3, y - s * .3); g.fillText(txt, x + s * .3, y - s * .3);
      }
      g.restore(); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function goat(x, y, s, t) {
      const penned = !R.escaped, hop = done && penned ? Math.abs(Math.sin(t * 6)) * s * .12 : penned ? 0 : Math.abs(Math.sin(t * 2.4)) * s * .04;
      const look = R.escaped && peek ? Math.sign(((escapePath(L, fences)?.[1] ?? L.goat) % L.w) - L.goat % L.w) || 1 : 1;
      const lw = Math.max(2, s * .06);
      g.save(); g.translate(x, y - hop); g.scale(look, 1);
      g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.ellipse(0, s * .34 + hop, s * .3, s * .08, 0, 0, 7); g.fill();
      g.strokeStyle = INK; g.lineWidth = lw * 1.1; g.lineCap = 'round';
      for (const lx of [-.18, -.06, .08, .18]) { g.beginPath(); g.moveTo(lx * s, s * .1); g.lineTo(lx * s, s * .32); g.stroke(); }
      g.beginPath(); g.ellipse(-s * .02, s * .04, s * .28, s * .17, 0, 0, 7); g.fillStyle = '#FFFFFF'; g.fill(); g.lineWidth = lw; g.stroke();
      g.beginPath(); g.moveTo(-s * .28, -s * .02); g.lineTo(-s * .36, -s * .1); g.stroke(); // tail
      g.beginPath(); g.ellipse(s * .27, -s * .14, s * .13, s * .12, .3, 0, 7); g.fillStyle = '#FFFFFF'; g.fill(); g.stroke();
      g.strokeStyle = '#8A7A6A'; g.lineWidth = lw * 1.2; g.beginPath(); g.moveTo(s * .22, -s * .24); g.quadraticCurveTo(s * .16, -s * .4, s * .08, -s * .38); g.stroke();
      g.beginPath(); g.moveTo(s * .3, -s * .25); g.quadraticCurveTo(s * .3, -s * .42, s * .2, -s * .43); g.stroke();
      g.fillStyle = INK; g.beginPath(); g.arc(s * .31, -s * .16, s * .028, 0, 7); g.fill();
      g.fillStyle = '#E8E0D6'; g.beginPath(); g.moveTo(s * .3, -s * .04); g.lineTo(s * .36, s * .08); g.lineTo(s * .4, -s * .05); g.closePath(); g.fill(); // beard
      g.restore();
      if (penned && !done) { g.font = `${s * .34}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.globalAlpha = .6 + .4 * Math.sin(t * 3); g.fillText('💛', x + s * .38, y - s * .48); g.globalAlpha = 1; }
    }

    const frame = () => { draw(); raf = requestAnimationFrame(frame); };
    const ro = new ResizeObserver(() => { layout(); }); ro.observe(wrap);
    fetch(new URL('../data/pen-levels.json', import.meta.url)).then(r => r.json()).then(l => { if (dead) return; LEVELS = l; start(prog.last); raf = requestAnimationFrame(frame); });
    el._pen = { get L() { return L; }, get fences() { return fences; }, get R() { return R; }, get lv() { return lv; }, start }; // for the automated checks
    return () => { dead = true; cancelAnimationFrame(raf); ro.disconnect(); };
  },
};
