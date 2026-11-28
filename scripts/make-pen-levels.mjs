// Builds src/data/pen-levels.json for Goat Pen: 40 levels, each with a fence
// budget, the best score the solver could find for it (par) and that pen.
//   node scripts/make-pen-levels.mjs
// Deterministic (seeded), so rerunning gives the same file.
//
// Par comes from two searches. A min cut (goat -> border, a fence on a tile
// costs lambda) gives the best pen for each "price of a fence"; sweeping lambda
// traces the best score for most budgets exactly. Local search (swap a fence,
// keep the swap if the score doesn't drop) then fills in budgets the sweep skips.
import { writeFileSync } from 'node:fs';
import { parse, reach, fenceable, BONUS } from '../src/games/pen/logic.js';

const REPS = Number(process.env.PEN_REPS) || 8, ITERS = Number(process.env.PEN_ITERS) || 25000;
const OUT = new URL('../src/data/pen-levels.json', import.meta.url);
let seed = 20261128;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));

// ---------- max flow (Dinic) ----------
function maxflowCut(nNodes, edges, s, t) {
  const head = new Int32Array(nNodes).fill(-1), to = [], cap = [], next = [];
  const add = (u, v, c) => { to.push(v); cap.push(c); next.push(head[u]); head[u] = to.length - 1; to.push(u); cap.push(0); next.push(head[v]); head[v] = to.length - 1; };
  for (const [u, v, c] of edges) add(u, v, c);
  const level = new Int32Array(nNodes), it = new Int32Array(nNodes);
  const bfs = () => { level.fill(-1); level[s] = 0; const q = [s]; for (let k = 0; k < q.length; k++) { const u = q[k]; for (let e = head[u]; e >= 0; e = next[e]) if (cap[e] > 1e-9 && level[to[e]] < 0) { level[to[e]] = level[u] + 1; q.push(to[e]); } } return level[t] >= 0; };
  const dfs = (u, f) => { if (u === t) return f; for (; it[u] >= 0; it[u] = next[it[u]]) { const e = it[u], v = to[e]; if (cap[e] > 1e-9 && level[v] === level[u] + 1) { const d = dfs(v, Math.min(f, cap[e])); if (d > 0) { cap[e] -= d; cap[e ^ 1] += d; return d; } } } return 0; };
  while (bfs()) { it.set(head); while (dfs(s, Infinity) > 0); }
  const side = new Uint8Array(nNodes), q = [s]; side[s] = 1; // reachable from s in the residual graph
  for (let k = 0; k < q.length; k++) { const u = q[k]; for (let e = head[u]; e >= 0; e = next[e]) if (cap[e] > 1e-9 && !side[to[e]]) { side[to[e]] = 1; q.push(to[e]); } }
  return side;
}

/** The pen that maximises score - lambda * fences. */
function lagrangePen(L, lambda) {
  const { w, h, cells, goat, burrows } = L, N = w * h, S = 2 * N, T = 2 * N + 1, INF = 1e9, edges = [];
  const open = i => cells[i] !== '~';
  for (let i = 0; i < N; i++) if (open(i)) {
    const r = (i / w) | 0, c = i % w, inN = 2 * i, outN = 2 * i + 1;
    edges.push([inN, outN, fenceable(L, i) ? lambda : INF]);
    const val = 1 + (BONUS[cells[i]] || 0);
    if (val > 0) edges.push([S, outN, val]); else edges.push([outN, T, -val]);
    if (r === 0 || c === 0 || r === h - 1 || c === w - 1) edges.push([outN, T, INF]);
    for (const j of [r > 0 ? i - w : -1, r < h - 1 ? i + w : -1, c > 0 ? i - 1 : -1, c < w - 1 ? i + 1 : -1]) if (j >= 0 && open(j)) edges.push([outN, 2 * j, INF]);
    if (cells[i] === 'T') for (const b of burrows) if (b !== i) edges.push([outN, 2 * b, INF]);
  }
  edges.push([S, 2 * goat, INF]);
  const side = maxflowCut(2 * N + 2, edges, S, T), fences = [];
  for (let i = 0; i < N; i++) if (open(i) && side[2 * i] && !side[2 * i + 1]) fences.push(i);
  return fences;
}

/** Local search from a start: swap one fence at a time, keep it if the score holds or rises. */
function improve(L, start, k, iters = 4000) {
  const N = L.w * L.h, spots = []; for (let i = 0; i < N; i++) if (fenceable(L, i)) spots.push(i);
  let cur = [...start].slice(0, k), curS = reach(L, cur).score;
  let best = cur.slice(), bestS = curS;
  for (let t = 0; t < iters; t++) {
    const cand = cur.slice();
    const temp = 2 * (1 - t / iters);
    if (cand.length < k && rnd() < .3) cand.push(spots[ri(0, spots.length - 1)]);
    else if (cand.length) {
      const j = ri(0, cand.length - 1), near = rnd() < .5;
      if (near) { const f = cand[j], r = (f / L.w) | 0, c = f % L.w, nr = r + ri(-2, 2), nc = c + ri(-2, 2); if (nr < 0 || nc < 0 || nr >= L.h || nc >= L.w) continue; cand[j] = nr * L.w + nc; }
      else cand[j] = spots[ri(0, spots.length - 1)];
      if (!fenceable(L, cand[j]) || cand.indexOf(cand[j]) !== j) continue;
    } else continue;
    const s = reach(L, cand).score;
    if (s >= curS || rnd() < Math.exp((s - curS) / Math.max(.02, temp)) * (s > 0 ? 1 : .02)) { cur = cand; curS = s; }
    if (curS > bestS) { bestS = curS; best = cur.slice(); }
  }
  return { fences: best, score: bestS };
}

/** Best pen we can find with at most k fences. */
function solve(L, k, frontier, reps = REPS) {
  let best = { fences: [], score: 0 };
  for (const f of frontier) if (f.fences.length <= k && f.score > best.score) best = f;
  const seeds = [...frontier.filter(f => f.fences.length <= k + 3).map(f => f.fences), []];
  for (const sd of seeds) for (let rep = 0; rep < reps; rep++) {
    const r = improve(L, rep % 2 ? best.fences : sd.slice(0, k), k, ITERS); // alternate fresh starts with polishing the best so far
    if (r.score > best.score) best = r;
  }
  return best;
}
function frontierOf(L) {
  const out = [], seen = new Set();
  for (let lam = .3; lam <= 40; lam *= 1.12) {
    const fences = lagrangePen(L, lam), key = fences.join(',');
    if (seen.has(key)) continue; seen.add(key);
    const score = reach(L, fences).score; if (score > 0) out.push({ fences, score });
  }
  return out;
}

// ---------- terrain ----------
function makeGrid(size, n) {
  const w = size, h = size, g = Array.from({ length: h }, () => Array(w).fill('.'));
  // ponds: a few blobs; a river now and then
  const blobs = ri(2, 3 + Math.floor(size / 4));
  for (let b = 0; b < blobs; b++) {
    let r = ri(0, h - 1), c = ri(0, w - 1); const len = ri(size, size * 2);
    for (let s = 0; s < len; s++) { g[r][c] = '~'; if (rnd() < .5) r = Math.max(0, Math.min(h - 1, r + ri(-1, 1))); else c = Math.max(0, Math.min(w - 1, c + ri(-1, 1))); }
  }
  if (n > 8 && rnd() < .5) { // a river across, with fords
    const vert = rnd() < .5; let p = ri(2, size - 3);
    for (let s = 0; s < size; s++) { if (rnd() > .18) { if (vert) g[s][p] = '~'; else g[p][s] = '~'; } if (rnd() < .3) p = Math.max(1, Math.min(size - 2, p + ri(-1, 1))); }
  }
  // the goat somewhere central on meadow
  const free = []; for (let r = 2; r < h - 2; r++) for (let c = 2; c < w - 2; c++) if (g[r][c] === '.') free.push([r, c]);
  if (!free.length) return null;
  free.sort((a, b) => Math.hypot(a[0] - h / 2, a[1] - w / 2) - Math.hypot(b[0] - h / 2, b[1] - w / 2));
  const [gr, gc] = free[ri(0, Math.min(free.length - 1, 6))]; g[gr][gc] = 'G';
  const put = (ch, k) => { for (let t = 0; t < k; t++) { for (let tries = 0; tries < 50; tries++) { const r = ri(1, h - 2), c = ri(1, w - 2); if (g[r][c] === '.') { g[r][c] = ch; break; } } } };
  if (n >= 6) put('c', ri(1, 3));
  if (n >= 11) { put('g', ri(0, 1) + (n >= 20 ? 1 : 0)); put('w', ri(1, 2 + (n >= 20 ? 1 : 0))); }
  if (n >= 16 && rnd() < .7) put('T', 2);
  return g.map(r => r.join(''));
}

// ---------- the first levels are hand-made: one idea each ----------
const HAND = [
  { tip: 'Tap meadow to put down a fence. The goat can\'t swim. Pen it in!', rows: [
    '~~~~~~~',
    '~~...~~',
    '~.....~',
    '~..G...',
    '~.....~',
    '~~...~~',
    '~~~~~~~'] },
  { tip: 'If the goat can reach the edge, it\'s gone. Close every gap.', rows: [
    '~~~.~~~',
    '~.....~',
    '~.....~',
    '...G...',
    '~.....~',
    '~.....~',
    '~~~.~~~'] },
  { tip: 'The goat never walks diagonally, so fences only need to touch at the corners.', rows: [
    '.......',
    '.~~~~~.',
    '.~...~.',
    '.~.G.~.',
    '.~...~.',
    '.~~.~~.',
    '.......'] },
  { tip: 'Every tile inside the pen is a point. A bigger pen with the same fences scores more.', rows: [
    '~~~~~~~~',
    '~......~',
    '~.~~~~.~',
    '~.~..~..',
    '~...G~.~',
    '~.~~~~.~',
    '~......~',
    '~~~~.~~~'] },
];

const levels = [];
const tipFor = { 6: 'Carrots are worth 3 extra points if they\'re inside the pen.', 11: 'Golden carrots are worth 10. Wasp nests cost 5, so keep them out if you can.', 16: 'Burrows: the goat can pop out of the other one. Pen both ends.' };
for (let n = 1; n <= 40; n++) {
  let lvl = null;
  for (let attempt = 0; attempt < 400 && !lvl; attempt++) {
    const hand = HAND[n - 1];
    const size = n <= 5 ? 7 : n <= 10 ? 8 : n <= 18 ? 9 : n <= 28 ? 10 : n <= 35 ? 11 : 12;
    const rows = hand ? hand.rows : makeGrid(size, n);
    if (!rows) continue;
    const L = parse(rows);
    if (!reach(L, []).escaped) continue; // must need at least one fence
    const front = frontierOf(L);
    if (!front.length) continue;
    const kmin = Math.min(...front.map(f => f.fences.length));
    const extra = hand ? [0, 0, 1, 1][n - 1] : Math.min(8, 1 + Math.floor(n / 5) + ri(0, 2));
    const k = Math.max(1, kmin + extra);
    if (!hand && (k < 3 || k > 16)) continue;
    const best = solve(L, k, front);
    if (best.score <= 0) continue;
    const open = L.cells.filter(ch => ch !== '~').length;
    if (!hand && (best.score < Math.max(10, k * 2) || reach(L, best.fences).n === open)) continue;
    // a pen with fewer fences must score clearly less, or the extra fences are pointless
    const tight = solve(L, kmin, front, 2);
    if (!hand && best.score - tight.score < 3) continue;
    lvl = { rows, fences: k, par: best.score, best: best.fences.sort((a, b) => a - b) };
    const tip = hand?.tip || tipFor[n]; if (tip) lvl.tip = tip;
  }
  if (!lvl) throw new Error('could not make level ' + n);
  levels.push(lvl);
  console.log(`${String(n).padStart(2)}  ${lvl.rows[0].length}x${lvl.rows.length}  fences ${String(lvl.fences).padStart(2)}  par ${lvl.par}`);
}
writeFileSync(OUT, JSON.stringify(levels));
console.log('wrote', OUT.pathname);
