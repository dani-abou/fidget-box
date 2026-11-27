// Generates src/data/slide-levels.json for the Slide Free game. Run by hand
// (`npm run levels`); the output is committed so the build stays instant.
//
// Board: 6x6, exit on the right edge of row 2. Block 0 is the key block
// (horizontal, length 2, row 2). A move slides one block any distance.
// For each random block set we explore every reachable arrangement, find the
// solved ones, and pick the arrangement furthest from any solution. That
// distance is the level's minimum move count, which the stars are based on.
import { writeFileSync } from 'node:fs';

const N = 6, EXIT_ROW = 2, LEVELS = 60, CANDIDATES = 400, CLIMBS = 40, STEPS = 70;

let seed = 20261127;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const ri = n => Math.floor(rnd() * n);

// blocks: [{len, h, fixedLine}] ; state: Int8Array of the moving coordinate per block
function makeSet() {
  const occ = new Uint8Array(N * N);
  const blocks = [], pos = [];
  const place = (h, len, line, at) => {
    for (let k = 0; k < len; k++) { const r = h ? line : at + k, c = h ? at + k : line; if (occ[r * N + c]) return false; }
    for (let k = 0; k < len; k++) { const r = h ? line : at + k, c = h ? at + k : line; occ[r * N + c] = 1; }
    blocks.push({ len, h, line }); pos.push(at); return true;
  };
  place(true, 2, EXIT_ROW, ri(3)); // key block starts in the left half
  const want = 7 + ri(7);
  for (let tries = 0; blocks.length < want && tries < 300; tries++) {
    const h = rnd() < .5, len = rnd() < .28 ? 3 : 2, line = ri(N), at = ri(N - len + 1);
    if (h && line === EXIT_ROW) continue; // nothing else horizontal in the exit row
    place(h, len, line, at);
  }
  return { blocks, start: Int8Array.from(pos) };
}

function neighbours(blocks, s) {
  const occ = new Int8Array(N * N).fill(-1);
  blocks.forEach((b, i) => { for (let k = 0; k < b.len; k++) occ[b.h ? b.line * N + s[i] + k : (s[i] + k) * N + b.line] = i; });
  const out = [];
  blocks.forEach((b, i) => {
    const cell = p => b.h ? b.line * N + p : p * N + b.line;
    for (let p = s[i] - 1; p >= 0 && occ[cell(p)] < 0; p--) { const t = Int8Array.from(s); t[i] = p; out.push(t); }
    for (let p = s[i] + b.len; p < N && occ[cell(p)] < 0; p++) { const t = Int8Array.from(s); t[i] = p - b.len + 1; out.push(t); }
  });
  return out;
}
const key = s => String.fromCharCode(...s.map(v => v + 48));
const solved = s => s[0] === N - 2;

function hardest({ blocks, start }) {
  // 1. every arrangement reachable from start
  const seen = new Map([[key(start), start]]), q = [start];
  for (let i = 0; i < q.length; i++) {
    if (q.length > 25000) return null;
    for (const t of neighbours(blocks, q[i])) { const k = key(t); if (!seen.has(k)) { seen.set(k, t); q.push(t); } }
  }
  const goals = q.filter(solved);
  if (!goals.length) return null;
  // 2. distance from the nearest solved arrangement (moves are reversible)
  const dist = new Map(goals.map(g => [key(g), 0])), q2 = [...goals];
  let far = goals[0], best = 0;
  for (let i = 0; i < q2.length; i++) {
    const d = dist.get(key(q2[i]));
    if (d > best) { best = d; far = q2[i]; }
    for (const t of neighbours(blocks, q2[i])) { const k = key(t); if (!dist.has(k)) { dist.set(k, d + 1); q2.push(t); } }
  }
  // The game ends as soon as the key block reaches the exit, so this is the move count.
  return { min: best, blocks: blocks.map((b, i) => [b.h ? b.line : far[i], b.h ? far[i] : b.line, b.len, b.h ? 'h' : 'v']) };
}

// Turn a level back into a block set so it can be mutated.
const toSet = lv => ({ blocks: lv.blocks.map(([r, c, len, d]) => ({ len, h: d === 'h', line: d === 'h' ? r : c })), start: Int8Array.from(lv.blocks.map(([r, c, , d]) => d === 'h' ? c : r)) });
function fits(blocks, s, b, at, skip = -1) {
  for (let k = 0; k < b.len; k++) {
    const r = b.h ? b.line : at + k, c = b.h ? at + k : b.line;
    for (let i = 0; i < blocks.length; i++) {
      if (i === skip) continue; const o = blocks[i];
      for (let m = 0; m < o.len; m++) if ((o.h ? o.line : s[i] + m) === r && (o.h ? s[i] + m : o.line) === c) return false;
    }
  }
  return true;
}
function mutate(lv) {
  const { blocks, start } = toSet(lv); const s = Array.from(start);
  const op = rnd();
  if (op < .3 && blocks.length > 4) { const i = 1 + ri(blocks.length - 1); blocks.splice(i, 1); s.splice(i, 1); }
  else {
    if (op < .65 && blocks.length > 1) { const i = 1 + ri(blocks.length - 1); blocks.splice(i, 1); s.splice(i, 1); }
    for (let t = 0; t < 60; t++) {
      const b = { h: rnd() < .5, len: rnd() < .3 ? 3 : 2, line: ri(N) }, at = ri(N - b.len + 1);
      if (b.h && b.line === EXIT_ROW) continue;
      if (fits(blocks, s, b, at)) { blocks.push(b); s.push(at); break; }
    }
  }
  return { blocks, start: Int8Array.from(s) };
}

const pool = [];
for (let i = 0; i < CANDIDATES; i++) { const h = hardest(makeSet()); if (h && h.min >= 2) pool.push(h); }
// Hill-climb from the hardest seeds: keep any mutation that is at least as hard.
const seeds = [...pool].sort((a, b) => b.min - a.min).slice(0, CLIMBS);
for (const seedLv of seeds) {
  let cur = seedLv;
  for (let k = 0; k < STEPS; k++) {
    const h = hardest(mutate(cur));
    if (!h) continue;
    pool.push(h);
    if (h.min >= cur.min) cur = h;
  }
}
// Unique layouts only, then pick along an even curve from 3 moves to the hardest found.
const uniq = [...new Map(pool.map(l => [JSON.stringify(l.blocks), l])).values()].sort((a, b) => a.min - b.min);
const maxMin = uniq[uniq.length - 1].min;
const levels = [], used = new Set();
for (let i = 0; i < LEVELS; i++) {
  const target = 2 + (maxMin - 2) * Math.pow(i / (LEVELS - 1), 1.15);
  let bestJ = -1;
  for (let j = 0; j < uniq.length; j++) if (!used.has(j) && (bestJ < 0 || Math.abs(uniq[j].min - target) < Math.abs(uniq[bestJ].min - target))) bestJ = j;
  used.add(bestJ); levels.push(uniq[bestJ]);
}
levels.sort((a, b) => a.min - b.min);
writeFileSync(new URL('../src/data/slide-levels.json', import.meta.url), JSON.stringify(levels));
console.log(`${uniq.length} solvable layouts; levels use min moves ${levels.map(l => l.min).join(' ')}`);
