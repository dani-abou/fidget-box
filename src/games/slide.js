// Slide Free: slide blocks along their own direction to get the coral block
// out through the gap on the right. Levels come from src/data/slide-levels.json
// (scripts/make-slide-levels.mjs), each with its proven minimum move count.
import { ac, buzz, click, tone } from '../lib/sound.js';
import { progress } from '../lib/progress.js';
import { panel, levelPicker, starsHTML, pills } from '../lib/ui.js';
import { floater } from '../lib/fx.js';

const N = 6, EXIT_ROW = 2;
const COLORS = ['--sky', '--mint', '--lilac', '--butter'];

export default {
  id: 'slide',
  name: 'Slide Free',
  description: 'Slide the blocks aside and get the coral one out. 60 levels, harder each time.',
  color: '--peach',
  icon: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="4" y="4" width="32" height="32" rx="5"/><rect x="9" y="17" width="14" height="7" rx="2" fill="currentColor"/><rect x="27" y="9" width="5" height="14" rx="2"/><path d="M36 17v7" stroke-width="5" stroke="var(--c)"/></svg>',
  levels: 60,
  art: `<svg viewBox="0 0 100 100"><rect x="8" y="8" width="84" height="84" rx="14" fill="#C9844B" stroke="#0D0920" stroke-width="4"/>
    <rect x="17" y="17" width="66" height="66" rx="7" fill="#6E4126" stroke="#0D0920" stroke-width="3"/><rect x="86" y="41" width="10" height="17" fill="#6E4126"/>
    <rect x="21" y="21" width="13" height="28" rx="4" fill="#5EC6FF" stroke="#0D0920" stroke-width="2.5"/><rect x="38" y="21" width="41" height="14" rx="4" fill="#FFD25A" stroke="#0D0920" stroke-width="2.5"/>
    <rect x="46" y="42" width="30" height="15" rx="4" fill="#FF5A4E" stroke="#0D0920" stroke-width="2.5"/><path d="M63 45l5 4.5-5 4.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="21" y="53" width="13" height="27" rx="4" fill="#AE8CFF" stroke="#0D0920" stroke-width="2.5"/><rect x="38" y="62" width="41" height="14" rx="4" fill="#4FE3B2" stroke="#0D0920" stroke-width="2.5"/></svg>`,
  css: `
.sf-wrap{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:18px 36px 26px 16px}
.sf-board{position:relative;touch-action:none;box-sizing:content-box;border:3px solid var(--outline);border-radius:12px;
  background:linear-gradient(rgba(0,0,0,.2) 2px,transparent 2px) 0 0/var(--cell) var(--cell),linear-gradient(90deg,rgba(0,0,0,.2) 2px,transparent 2px) 0 0/var(--cell) var(--cell),
    repeating-linear-gradient(97deg,#6E4126 0 9px,#74462A 9px 13px,#683C22 13px 22px);
  box-shadow:0 0 0 13px #C9844B,0 0 0 16px var(--outline),0 9px 0 16px var(--outline),inset 0 4px 10px rgba(0,0,0,.45)}
.sf-exit{position:absolute;right:-16px;width:16px;background:#6E4126;box-shadow:inset 0 3px 0 var(--outline),inset 0 -3px 0 var(--outline)}
.sf-exit::after{content:"";position:absolute;left:22px;top:50%;width:14px;height:14px;border-top:5px solid var(--butter);border-right:5px solid var(--butter);border-radius:2px;
  transform:translateY(-50%) rotate(45deg);filter:drop-shadow(0 2px 0 var(--outline));animation:nudge .8s ease-in-out infinite alternate}
@keyframes nudge{to{left:30px}}
.sf-b{--c:var(--sky);position:absolute;left:0;top:0;border-radius:12px;border:3px solid var(--outline);touch-action:none;will-change:transform;
  background:linear-gradient(180deg,color-mix(in srgb,var(--c) 70%,#fff) 0,var(--c) 30%,color-mix(in srgb,var(--c) 82%,#000) 100%);
  box-shadow:inset 0 3px 0 rgba(255,255,255,.4),inset 0 -5px 0 rgba(0,0,0,.22),0 4px 0 rgba(0,0,0,.35)}
.sf-b::before{content:"";position:absolute;left:10%;top:12%;width:22%;height:16%;max-height:9px;border-radius:99px;background:rgba(255,255,255,.55)}
.sf-b.key{--c:#FF5A4E;animation:glow 1.4s ease-in-out infinite alternate}
@keyframes glow{to{box-shadow:inset 0 3px 0 rgba(255,255,255,.4),inset 0 -5px 0 rgba(0,0,0,.22),0 4px 0 rgba(0,0,0,.35),0 0 18px 2px rgba(255,120,90,.7)}}
.sf-b.key::after{content:"";position:absolute;right:14%;top:50%;width:20%;aspect-ratio:1;border-top:5px solid #fff;border-right:5px solid #fff;border-radius:2px;transform:translateY(-50%) rotate(45deg)}
.sf-b.grab{filter:brightness(1.12);z-index:2}
.sf-b.snap{transition:transform .14s cubic-bezier(.3,1.5,.5,1)}
.sf-b.out{transition:transform .45s cubic-bezier(.5,-.3,.8,.6)}
@media (prefers-reduced-motion: reduce){.sf-b.snap,.sf-b.out{transition:none}}`,

  init(el) {
    el.innerHTML = `<div class="gbar"><span class="stat"></span><button class="ibtn undo" aria-label="Undo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg></button><button class="ibtn restart" aria-label="Restart level"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-3-6.2"/><path d="M20 3v5h-5"/></svg></button><button class="ibtn lvls" aria-label="Levels"><svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/></svg></button></div>
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
      const size = Math.max(180, Math.min(wrap.clientWidth - 100, wrap.clientHeight - 70, 500)); // room for the wooden frame and exit arrow
      cell = Math.floor(size / N);
      board.style.width = board.style.height = cell * N + 'px'; board.style.setProperty('--cell', cell + 'px');
      exit.style.top = EXIT_ROW * cell + 6 + 'px'; exit.style.height = cell - 12 + 'px';
      for (const b of blocks) {
        b.el.style.width = (b.h ? b.len * cell : cell) - 6 + 'px'; b.el.style.height = (b.h ? cell : b.len * cell) - 6 + 'px';
        place(b, b.h ? b.c : b.r);
      }
    }
    const best = () => LEVELS[n - 1].min;
    function updStat() {
      stat.innerHTML = pills([{ label: 'Lv', value: n, cls: 'lvl' }, { label: 'Moves', value: moves, cls: moves > best() ? '' : 'star' }, { label: 'Best', value: best() }]);
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
      b.el.setPointerCapture(e.pointerId); b.el.classList.remove('snap'); b.el.classList.add('grab');
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
        const to = Math.round(pos); b.el.classList.add('snap'); b.el.classList.remove('grab');
        if (b.h) b.c = to; else b.r = to;
        place(b, to);
        if (to !== from) { hist.push([blocks.indexOf(b), from]); moves++; buzz(8); click(520, .03, .2, 'triangle'); updStat(); }
        if (b === blocks[0] && b.c === N - 2) win();
      };
      b.el.addEventListener('pointermove', move); b.el.addEventListener('pointerup', up); b.el.addEventListener('pointercancel', up);
    }

    function win() {
      done = true; const k = blocks[0];
      k.el.classList.remove('snap'); k.el.classList.add('out'); place(k, N + 2);
      floater(el, el.clientWidth * .75, el.clientHeight * .45, 'Free!');
      [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f), i * 110)); buzz(30);
      const stars = moves <= best() ? 3 : moves <= Math.ceil(best() * 1.5) + 1 ? 2 : 1;
      prog.complete(n, stars);
      const last = n >= LEVELS.length;
      setTimeout(() => {
        if (dead) return;
        panel(el, {
          title: last ? 'All 60 cleared!' : `Level ${n} cleared`, mood: 'win',
          html: `${starsHTML(stars)}<p style="text-align:center"><b>${moves}</b> moves · best possible <b>${best()}</b>${stars < 3 ? '<br>Match the best for three stars.' : ''}</p>`,
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
