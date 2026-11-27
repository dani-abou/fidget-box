// Slide Free: slide blocks along their own direction to get the coral block
// out through the gap on the right. Levels come from src/data/slide-levels.json
// (scripts/make-slide-levels.mjs), each with its proven minimum move count.
import { ac, buzz, click, tone } from '../lib/sound.js';
import { progress } from '../lib/progress.js';
import { panel, levelPicker, starText } from '../lib/ui.js';

const N = 6, EXIT_ROW = 2;
const COLORS = ['--sky', '--mint', '--lilac', '--butter'];

export default {
  id: 'slide',
  name: 'Slide Free',
  description: 'Slide the blocks aside and get the coral one out. 60 levels, harder each time.',
  color: '--peach',
  icon: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="4" y="4" width="32" height="32" rx="5"/><rect x="9" y="17" width="14" height="7" rx="2" fill="currentColor"/><rect x="27" y="9" width="5" height="14" rx="2"/><path d="M36 17v7" stroke-width="5" stroke="var(--c)"/></svg>',
  css: `
.sf-wrap{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:4px 16px 16px}
.sf-board{position:relative;background:var(--surface);border:3px solid var(--line);border-radius:18px;touch-action:none;box-sizing:content-box}
.sf-exit{position:absolute;right:-3px;width:3px;background:var(--surface)}
.sf-exit::after{content:"";position:absolute;left:6px;top:50%;width:10px;height:10px;border-top:3px solid var(--muted);border-right:3px solid var(--muted);transform:translateY(-50%) rotate(45deg);opacity:.6}
.sf-b{position:absolute;left:0;top:0;border-radius:12px;background:var(--c);box-shadow:inset 0 -4px 0 color-mix(in srgb,var(--c) 70%,#000);touch-action:none;will-change:transform}
.sf-b.v{background:linear-gradient(90deg,var(--c) 0 100%)}
.sf-b.key{--c:var(--peach);box-shadow:inset 0 -4px 0 color-mix(in srgb,var(--peach) 65%,#000),0 0 0 3px color-mix(in srgb,var(--peach) 35%,transparent)}
.sf-b.key::after{content:"";position:absolute;right:16%;top:50%;width:22%;aspect-ratio:1;border-top:4px solid rgba(255,255,255,.85);border-right:4px solid rgba(255,255,255,.85);transform:translateY(-50%) rotate(45deg)}
.sf-b.snap{transition:transform .12s ease-out}
.sf-b.out{transition:transform .35s ease-in}
@media (prefers-reduced-motion: reduce){.sf-b.snap,.sf-b.out{transition:none}}`,

  init(el) {
    el.innerHTML = `<div class="gbar"><span class="stat"></span><button class="btn undo" aria-label="Undo">↶</button><button class="btn restart" aria-label="Restart level">↺</button><button class="btn lvls">Levels</button></div>
      <div class="sf-wrap"><div class="sf-board"><div class="sf-exit"></div></div></div>`;
    const stat = el.querySelector('.stat'), board = el.querySelector('.sf-board'), wrap = el.querySelector('.sf-wrap'), exit = el.querySelector('.sf-exit');
    const undoBtn = el.querySelector('.undo');
    const prog = progress('slide');
    let LEVELS = [], n = 1, blocks = [], hist = [], moves = 0, cell = 50, done = false, dead = false;

    const occupied = skip => {
      const o = new Int8Array(N * N).fill(-1);
      blocks.forEach((b, i) => { if (i !== skip) for (let k = 0; k < b.len; k++) o[(b.h ? b.r : b.r + k) * N + (b.h ? b.c + k : b.c)] = i; });
      return o;
    };
    const place = (b, pos) => { b.el.style.transform = `translate(${(b.h ? pos : b.c) * cell + 3}px,${(b.h ? b.r : pos) * cell + 3}px)`; };
    function layout() {
      const size = Math.max(180, Math.min(wrap.clientWidth - 56, wrap.clientHeight - 20, 520)); // room for the exit arrow
      cell = Math.floor(size / N);
      board.style.width = board.style.height = cell * N + 'px';
      exit.style.top = EXIT_ROW * cell + 6 + 'px'; exit.style.height = cell - 12 + 'px';
      for (const b of blocks) {
        b.el.style.width = (b.h ? b.len * cell : cell) - 6 + 'px'; b.el.style.height = (b.h ? cell : b.len * cell) - 6 + 'px';
        place(b, b.h ? b.c : b.r);
      }
    }
    const best = () => LEVELS[n - 1].min;
    function updStat() {
      stat.innerHTML = `Level <b>${n}</b> · Moves <b>${moves}</b> · Best ${best()}`;
      stat.title = `Fewest possible moves: ${best()}`;
      undoBtn.disabled = !hist.length;
    }

    function start(level) {
      n = level; prog.play(n); done = false; hist = []; moves = 0;
      board.querySelectorAll('.sf-b').forEach(e => e.remove());
      blocks = LEVELS[n - 1].blocks.map(([r, c, len, d], i) => {
        const e = document.createElement('div');
        e.className = 'sf-b' + (i === 0 ? ' key' : '') + (d === 'v' ? ' v' : '');
        if (i) e.style.setProperty('--c', `var(${COLORS[i % COLORS.length]})`);
        board.append(e);
        const b = { r, c, len, h: d === 'h', el: e }; e.addEventListener('pointerdown', ev => grab(b, ev)); return b;
      });
      layout(); updStat();
    }

    function grab(b, e) {
      if (done) return; ac(); e.preventDefault();
      b.el.setPointerCapture(e.pointerId); b.el.classList.remove('snap');
      const o = occupied(blocks.indexOf(b)), from = b.h ? b.c : b.r, at = p => o[b.h ? b.r * N + p : p * N + b.c] >= 0;
      let lo = from, hi = from;
      while (lo - 1 >= 0 && !at(lo - 1)) lo--;
      while (hi + b.len < N && !at(hi + b.len)) hi++;
      const p0 = b.h ? e.clientX : e.clientY; let pos = from, lastCell = from;
      const move = ev => {
        pos = Math.max(lo, Math.min(hi, from + ((b.h ? ev.clientX : ev.clientY) - p0) / cell));
        place(b, pos);
        const c = Math.round(pos); if (c !== lastCell) { lastCell = c; click(900 + c * 60, .012, .1, 'triangle'); }
      };
      const up = () => {
        b.el.removeEventListener('pointermove', move); b.el.removeEventListener('pointerup', up); b.el.removeEventListener('pointercancel', up);
        const to = Math.round(pos); b.el.classList.add('snap');
        if (b.h) b.c = to; else b.r = to;
        place(b, to);
        if (to !== from) { hist.push([blocks.indexOf(b), from]); moves++; buzz(8); click(520, .03, .2, 'triangle'); updStat(); }
        if (b === blocks[0] && b.c === N - 2) win();
      };
      b.el.addEventListener('pointermove', move); b.el.addEventListener('pointerup', up); b.el.addEventListener('pointercancel', up);
    }

    function win() {
      done = true; const k = blocks[0];
      k.el.classList.remove('snap'); k.el.classList.add('out'); place(k, N + 1);
      [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f), i * 110)); buzz(30);
      const stars = moves <= best() ? 3 : moves <= Math.ceil(best() * 1.5) + 1 ? 2 : 1;
      prog.complete(n, stars);
      const last = n >= LEVELS.length;
      setTimeout(() => {
        if (dead) return;
        panel(el, {
          title: last ? 'You finished every level!' : `Level ${n} cleared`,
          html: `<div class="big">${starText(stars)}</div><p>${moves} moves. The best possible is ${best()}.</p>` +
            (stars < 3 ? '<p>Match the best for three stars.</p>' : ''),
          buttons: [{ label: 'Retry', onClick: () => start(n) },
            last ? { label: 'Levels', primary: true, onClick: pick } : { label: 'Next level', primary: true, onClick: () => start(n + 1) }],
        });
      }, 450);
    }

    function pick() { levelPicker(el, { count: LEVELS.length, prog, onPick: start }); }
    undoBtn.onclick = () => {
      const h = hist.pop(); if (!h || done) return;
      const b = blocks[h[0]]; if (b.h) b.c = h[1]; else b.r = h[1];
      b.el.classList.add('snap'); place(b, h[1]); moves = Math.max(0, moves - 1); click(700, .02, .15); updStat();
    };
    el.querySelector('.restart').onclick = () => { start(n); click(900, .03, .2, 'triangle'); };
    el.querySelector('.lvls').onclick = pick;

    const ro = new ResizeObserver(() => blocks.length && layout()); ro.observe(wrap);
    fetch(new URL('../data/slide-levels.json', import.meta.url)).then(r => r.json()).then(l => { if (!dead) { LEVELS = l; start(prog.last); } });
    return () => { dead = true; ro.disconnect(); };
  },
};
