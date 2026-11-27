// Letter Trail: drag across touching letters (diagonals count) to make words
// before the clock runs out. Words score length - 2 (3 letters = 1, 8 = 6).
// Levels raise the target and shorten the clock; from level 13 the board is
// 5x5. Every board is solved when generated and only used if its common words
// are worth well over the target, so a level is always winnable.
// Dictionary: src/data/words.txt (SCOWL), cached offline with everything else.
import { ac, buzz, click, tone } from '../lib/sound.js';
import { progress } from '../lib/progress.js';
import { panel, levelPicker, starsHTML, pills } from '../lib/ui.js';
import { floater, shake } from '../lib/fx.js';

const LEVELS = 30;
export const levelRules = n => n <= 12
  ? { size: 4, time: Math.round(120 - (n - 1) * 2.5), target: 10 + (n - 1) * 3 }
  : { size: 5, time: Math.round(150 - (n - 13) * 2.5), target: Math.round(35 + (n - 13) * 3.5) };
const points = w => w.length - 2;

const DICE4 = ['AAEEGN', 'ABBJOO', 'ACHOPS', 'AFFKPS', 'AOOTTW', 'CIMOTU', 'DEILRX', 'DELRVY', 'DISTTY', 'EEGHNW', 'EEINSU', 'EHRTVW', 'EIOSST', 'ELRTTY', 'HIMNQU', 'HLNNRZ'];
const DICE5 = ['AAAFRS', 'AAEEEE', 'AAFIRS', 'ADENNN', 'AEEEEM', 'AEEGMU', 'AEGMNN', 'AFIRSY', 'BJKQXZ', 'CCENST', 'CEIILT', 'CEILPT', 'CEIPST', 'DDHNOT', 'DHHLOR', 'DHLNOR', 'DHLNOR', 'EIIITT', 'EMOTTT', 'ENSSSU', 'FIPRSY', 'GORRVW', 'IPRRRY', 'NOOTUW', 'OOOTTU'];

// ---------- dictionary (loaded once per app session) ----------
let dictP = null;
export function parseDict(text) {
  const [a, b = ''] = text.split('\n#\n');
  const common = new Set(a.split('\n').filter(Boolean)), all = new Set(common);
  for (const w of b.split('\n')) if (w) all.add(w);
  const prefixes = new Set();
  for (const w of all) for (let i = 1; i < w.length; i++) prefixes.add(w.slice(0, i));
  return { common, all, prefixes };
}
const loadDict = () => dictP ||= fetch(new URL('../data/words.txt', import.meta.url)).then(r => r.text()).then(parseDict);

// ---------- board ----------
const neighbours = (size, i) => {
  const r = Math.floor(i / size), c = i % size, out = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const rr = r + dr, cc = c + dc;
    if ((dr || dc) && rr >= 0 && cc >= 0 && rr < size && cc < size) out.push(rr * size + cc);
  }
  return out;
};
function roll(size) {
  const dice = (size === 4 ? DICE4 : DICE5).map(d => d[Math.floor(Math.random() * 6)]);
  for (let i = dice.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [dice[i], dice[j]] = [dice[j], dice[i]]; }
  return dice.map(l => l === 'Q' ? 'qu' : l.toLowerCase());
}
/** Every dictionary word on the board. */
export function solve(cells, size, dict) {
  const found = new Set(), used = new Uint8Array(cells.length);
  const go = (i, w) => {
    w += cells[i];
    if (w.length >= 3 && dict.all.has(w)) found.add(w);
    if (!dict.prefixes.has(w)) return;
    used[i] = 1;
    for (const j of neighbours(size, i)) if (!used[j]) go(j, w);
    used[i] = 0;
  };
  for (let i = 0; i < cells.length; i++) go(i, '');
  return found;
}
export function makeBoard(rules, dict) {
  let best = null;
  for (let t = 0; t < 120; t++) {
    const cells = roll(rules.size), words = solve(cells, rules.size, dict);
    const commonPts = [...words].filter(w => dict.common.has(w)).reduce((a, w) => a + points(w), 0);
    if (!best || commonPts > best.commonPts) best = { cells, words, commonPts };
    if (commonPts >= rules.target * 3) break;
  }
  return best;
}

export default {
  id: 'words',
  name: 'Letter Trail',
  description: 'Drag across touching letters to make words. Beat the target before time runs out.',
  color: '--mint',
  icon: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="4" y="4" width="13" height="13" rx="3"/><rect x="23" y="4" width="13" height="13" rx="3"/><rect x="4" y="23" width="13" height="13" rx="3"/><rect x="23" y="23" width="13" height="13" rx="3"/><path d="M10.5 10.5 29.5 29.5 29.5 10.5" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  levels: LEVELS,
  art: `<svg viewBox="0 0 100 100"><rect x="8" y="8" width="84" height="84" rx="16" fill="#3A2A7A" stroke="#0D0920" stroke-width="4"/>
    <g font-family="Fredoka,sans-serif" font-weight="700" font-size="22" text-anchor="middle" fill="#3B2410">
    <rect x="16" y="16" width="31" height="31" rx="8" fill="#FFD25A" stroke="#0D0920" stroke-width="3"/><text x="31.5" y="40">W</text>
    <rect x="53" y="16" width="31" height="31" rx="8" fill="#FFF1D2" stroke="#0D0920" stroke-width="3"/><text x="68.5" y="40">O</text>
    <rect x="16" y="53" width="31" height="31" rx="8" fill="#FFF1D2" stroke="#0D0920" stroke-width="3"/><text x="31.5" y="77">D</text>
    <rect x="53" y="53" width="31" height="31" rx="8" fill="#FFD25A" stroke="#0D0920" stroke-width="3"/><text x="68.5" y="77">R</text></g>
    <path d="M31.5 31.5 68.5 68.5" stroke="#FF8A66" stroke-width="6" stroke-linecap="round" opacity=".85"/></svg>`,
  css: `
.lt{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;padding:2px 16px 12px;position:relative}
.lt-timer{height:18px;width:100%;border-radius:999px;background:#1A1238;border:3px solid var(--outline);overflow:hidden;margin-bottom:8px;box-shadow:0 3px 0 var(--outline)}
.lt-timer i{display:block;height:100%;border-radius:999px;background:linear-gradient(180deg,#8BF5D2,var(--mint));box-shadow:inset 0 -3px 0 rgba(0,0,0,.15);transform-origin:left;transition:transform .25s linear}
.lt-timer.low i{background:linear-gradient(180deg,#FFB49C,var(--peach));animation:pulse .5s ease-in-out infinite alternate}
.lt-word{min-height:46px;max-width:100%;font-size:26px;font-weight:600;letter-spacing:3px;text-transform:uppercase;display:flex;align-items:center;justify-content:center;
  padding:0 18px;border-radius:16px;background:var(--surface);border:3px solid var(--outline);box-shadow:0 4px 0 var(--outline);transition:background .15s,color .15s}
.lt-word:empty{visibility:hidden}
.lt-word.good{background:var(--mint);color:var(--on-accent)} .lt-word.bad{background:var(--peach);color:var(--on-accent)}
.lt-word.old{color:var(--muted);text-transform:none;letter-spacing:0;font-size:17px;font-weight:500}
.lt-board{position:relative;display:grid;gap:8px;touch-action:none;margin:12px 0 12px;padding:10px;border-radius:24px;
  background:linear-gradient(180deg,#3A2A7A,#2C2060);border:3px solid var(--outline);box-shadow:0 7px 0 var(--outline),inset 0 3px 0 rgba(255,255,255,.12)}
.lt-cell{border-radius:14px;display:flex;align-items:center;justify-content:center;width:var(--cs);height:var(--cs);
  font-size:calc(var(--cs)*.5);font-weight:600;text-transform:uppercase;color:#3B2410;
  background:linear-gradient(180deg,#FFF8E6,#F6E3BC);border:3px solid var(--outline);box-shadow:0 4px 0 var(--outline),inset 0 -4px 0 rgba(120,80,30,.18);
  transition:background .1s,transform .12s cubic-bezier(.3,1.8,.5,1)}
.lt-cell.qu{font-size:calc(var(--cs)*.38)}
.lt-cell.on{background:linear-gradient(180deg,#FFE58A,var(--butter));transform:translateY(-3px) scale(1.06)}
.lt-cell.pop{animation:cellpop .35s cubic-bezier(.3,1.8,.5,1)}
@keyframes cellpop{40%{transform:scale(1.15);background:var(--mint)}}
.lt-board svg{position:absolute;inset:0;pointer-events:none;overflow:visible;z-index:1}
.lt-board polyline{fill:none;stroke:var(--peach);stroke-width:9;stroke-linecap:round;stroke-linejoin:round;opacity:.75;filter:drop-shadow(0 0 6px rgba(255,138,102,.8))}
.lt-found{width:100%;flex:1;min-height:40px;overflow:auto;overscroll-behavior:contain;display:flex;flex-wrap:wrap;align-content:flex-start;justify-content:center;gap:6px}
.lt-found span{background:var(--surface);border:2.5px solid var(--outline);border-radius:10px;padding:3px 9px;font-size:14px;font-weight:600;color:var(--ink);
  text-transform:uppercase;letter-spacing:1px;box-shadow:0 3px 0 var(--outline);animation:popin .35s cubic-bezier(.3,1.6,.5,1)}
.lt-found span small{color:var(--butter);margin-left:5px;letter-spacing:0}
.lt-missed{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.lt-missed span{background:rgba(0,0,0,.2);border-radius:8px;padding:2px 8px;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:var(--ink)}`,

  init(el) {
    const prog = progress('words');
    el.innerHTML = `<div class="gbar"><span class="stat"></span><button class="ibtn stop" aria-label="Finish round"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5" fill="currentColor"/></svg></button><button class="ibtn lvls" aria-label="Levels"><svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/></svg></button></div>
      <div class="lt"><div class="lt-timer"><i></i></div><div class="lt-word"></div><div class="lt-board"><svg><polyline/></svg></div><div class="lt-found"></div></div>`;
    const $ = q => el.querySelector(q), stat = $('.stat'), boardEl = $('.lt-board'), wordEl = $('.lt-word'), foundEl = $('.lt-found');
    const timerEl = $('.lt-timer'), bar = $('.lt-timer i'), line = $('polyline'), lt = $('.lt');
    let dict = null, n = 1, R, board = null, found = [], score = 0, left = 0, running = false, path = [], dead = false, tick = null, cellEls = [];

    function updStat() {
      const secs = Math.ceil(left);
      stat.innerHTML = pills([{ label: 'Lv', value: n, cls: 'lvl' }, { label: 'Score', value: `${score}<i>/${R.target}</i>`, cls: score >= R.target ? 'star' : '' },
        { value: `⏱ ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, cls: left <= 10 && running ? 'warn' : '' }]);
      bar.style.transform = `scaleX(${Math.max(0, left / R.time)})`;
      timerEl.classList.toggle('low', left <= 15);
    }
    function layout() {
      if (!board) return;
      const avail = Math.min(lt.clientWidth - 56, lt.clientHeight - 30 - 58 - 60 - 70, 440);
      const cs = Math.max(44, Math.floor((avail - 8 * (R.size - 1)) / R.size));
      boardEl.style.setProperty('--cs', cs + 'px');
      boardEl.style.gridTemplateColumns = `repeat(${R.size}, ${cs}px)`;
    }

    function start(level) {
      n = level; R = levelRules(n); prog.play(n);
      stopTimer(); el.querySelectorAll('.ov').forEach(o => o.remove());
      wordEl.textContent = 'Shuffling…'; wordEl.className = 'lt-word old';
      // let the label paint before the (short) solve runs
      setTimeout(() => {
        if (dead) return;
        board = makeBoard(R, dict); found = []; score = 0; left = R.time; path = [];
        boardEl.querySelectorAll('.lt-cell').forEach(e => e.remove());
        cellEls = board.cells.map((l, i) => {
          const d = document.createElement('div'); d.className = 'lt-cell' + (l === 'qu' ? ' qu' : ''); d.textContent = l === 'qu' ? 'Qu' : l; d.dataset.i = i;
          boardEl.append(d); return d;
        });
        foundEl.innerHTML = ''; wordEl.textContent = 'Drag across letters'; wordEl.className = 'lt-word old';
        layout(); updStat(); drawPath();
        running = true; let prev = performance.now();
        tick = setInterval(() => {
          const now = performance.now(), dt = (now - prev) / 1000; prev = now;
          if (document.visibilityState !== 'visible') return; // paused while the app is in the background
          left = Math.max(0, left - dt); updStat();
          if (left <= 10 && Math.ceil(left) !== Math.ceil(left + dt) && left > 0) click(1200, .02, .1);
          if (left <= 0) finish();
        }, 250);
      }, 30);
    }
    function stopTimer() { running = false; clearInterval(tick); tick = null; }

    // ---------- drag to spell ----------
    const cellAt = (x, y) => {
      for (const d of cellEls) {
        const r = d.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        if (Math.hypot(x - cx, y - cy) < r.width * .42) return +d.dataset.i; // forgiving centre hit, so diagonals work
      }
      return -1;
    };
    const word = () => path.map(i => board.cells[i]).join('');
    function drawPath() {
      const b = boardEl.getBoundingClientRect();
      line.setAttribute('points', path.map(i => { const r = cellEls[i].getBoundingClientRect(); return `${r.left - b.left + r.width / 2},${r.top - b.top + r.height / 2}`; }).join(' '));
      cellEls.forEach((d, i) => d.classList.toggle('on', path.includes(i)));
      if (path.length) { wordEl.textContent = word(); wordEl.className = 'lt-word'; }
    }
    function extend(i) {
      if (i < 0) return;
      const lastI = path[path.length - 1];
      if (path.length >= 2 && i === path[path.length - 2]) { path.pop(); drawPath(); return; } // slide back to undo a letter
      if (path.includes(i) || (path.length && !neighbours(R.size, lastI).includes(i))) return;
      path.push(i); click(700 + path.length * 70, .02, .12, 'triangle'); buzz(4); drawPath();
    }
    boardEl.addEventListener('pointerdown', e => {
      if (!running) return; ac(); boardEl.setPointerCapture(e.pointerId); path = []; extend(cellAt(e.clientX, e.clientY));
    });
    boardEl.addEventListener('pointermove', e => { if (running && path.length) extend(cellAt(e.clientX, e.clientY)); });
    const release = () => {
      if (!path.length) return;
      const w = word(), lastCell = cellEls[path[path.length - 1]], cells = path.map(i => cellEls[i]); path = []; drawPath();
      if (!running) return;
      wordEl.textContent = w;
      if (w.length < 3) { wordEl.className = 'lt-word old'; wordEl.textContent = w.length ? 'Three letters or more' : ''; return; }
      if (found.includes(w)) { wordEl.className = 'lt-word old'; wordEl.textContent = w + ' · already found'; click(300, .05, .15, 'sine'); return; }
      if (!dict.all.has(w)) { wordEl.className = 'lt-word bad'; click(180, .12, .2, 'sine'); buzz(25); shake(boardEl); return; }
      found.push(w); score += points(w); wordEl.className = 'lt-word good'; wordEl.textContent = `${w} +${points(w)}`;
      cells.forEach((c, k) => setTimeout(() => { c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); }, k * 40));
      const r = lastCell.getBoundingClientRect(), h = lt.getBoundingClientRect();
      floater(lt, r.left - h.left + r.width / 2, r.top - h.top, '+' + points(w));
      tone(440 * Math.pow(2, Math.min(12, w.length * 2) / 12)); buzz(12);
      const chip = document.createElement('span'); chip.innerHTML = `${w}<small>+${points(w)}</small>`; foundEl.prepend(chip);
      if (score >= R.target && score - points(w) < R.target) { wordEl.textContent = 'Target reached! Keep going for stars'; [659, 784].forEach((f, k) => setTimeout(() => tone(f), k * 120)); }
      updStat();
    };
    boardEl.addEventListener('pointerup', release); boardEl.addEventListener('pointercancel', release);

    function finish() {
      if (!running) return; stopTimer(); path = []; drawPath();
      const won = score >= R.target;
      const stars = !won ? 0 : score >= R.target * 1.8 ? 3 : score >= R.target * 1.4 ? 2 : 1;
      if (won) { prog.complete(n, stars); [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f), i * 110)); buzz(30); }
      else click(200, .3, .25, 'sine');
      const missed = [...board.words].filter(w => !found.includes(w) && dict.common.has(w)).sort((a, b) => b.length - a.length || a.localeCompare(b)).slice(0, 12);
      const html = (won ? starsHTML(stars) : '') +
        `<p style="text-align:center"><b>${score}</b> points from ${found.length} word${found.length === 1 ? '' : 's'}. Target ${R.target}${won && stars < 3 ? `; ${Math.ceil(R.target * (stars === 1 ? 1.4 : 1.8))} for the next star` : ''}.</p>` +
        (missed.length ? `<p>Some you missed:</p><div class="lt-missed">${missed.map(w => `<span>${w}</span>`).join('')}</div>` : '');
      const last = n >= LEVELS;
      panel(el, {
        title: won ? (last ? 'Every level done!' : `Level ${n} cleared`) : "Time's up!",
        mood: won ? 'win' : 'lose', html,
        buttons: [{ label: 'Levels', onClick: pick }, { label: won ? 'Replay' : 'Try again', primary: !won, onClick: () => start(n) },
          ...(won && !last ? [{ label: 'Next level', primary: true, onClick: () => start(n + 1) }] : [])],
      });
    }

    function pick() { levelPicker(el, { count: LEVELS, prog, onPick: start }); }
    $('.lvls').onclick = pick;
    $('.stop').onclick = () => { if (running) finish(); };

    const ro = new ResizeObserver(layout); ro.observe(lt);
    wordEl.textContent = 'Loading words…';
    loadDict().then(d => { if (dead) return; dict = d; R = levelRules(prog.last); start(prog.last); });
    return () => { dead = true; stopTimer(); ro.disconnect(); };
  },
};
