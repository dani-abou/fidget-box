// Builds src/data/jelly-levels.json for Jelly Gates: 60 levels, each proven
// solvable. node scripts/make-jelly-levels.mjs (deterministic, seeded).
//
// Levels are built backwards. Blocks go down in reverse exit order: the block
// placed now leaves before every block already on the board, so it must be able
// to slide in from its gate past all of them. That makes a packed board with a
// working order baked in. Ice, chains, frozen gates and crates are then given
// only numbers that order satisfies, and every level is re-solved forwards with
// the game's own rules (src/games/jelly/logic.js) before it's kept.
import { writeFileSync } from 'node:fs';
import { makeState, reachable, occupancy, fitsGate, passGate, locked, won, DIRS, solvable } from '../src/games/jelly/logic.js';

const OUT = new URL('../src/data/jelly-levels.json', import.meta.url);
let seed = 424242;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = a => a[Math.floor(rnd() * a.length)];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const COLORS = ['red', 'blue', 'yellow', 'green', 'purple', 'orange'];
const SHAPES = {
  dot: [[0, 0]], bar2: [[0, 0], [0, 1]], col2: [[0, 0], [1, 0]], sq: [[0, 0], [0, 1], [1, 0], [1, 1]],
  bar3: [[0, 0], [0, 1], [0, 2]], col3: [[0, 0], [1, 0], [2, 0]],
  l3a: [[0, 0], [1, 0], [1, 1]], l3b: [[0, 1], [1, 0], [1, 1]], l3c: [[0, 0], [0, 1], [1, 0]], l3d: [[0, 0], [0, 1], [1, 1]],
  l4a: [[0, 0], [1, 0], [2, 0], [2, 1]], l4b: [[0, 0], [0, 1], [0, 2], [1, 0]], l4c: [[0, 0], [0, 1], [1, 1], [2, 1]], l4d: [[0, 2], [1, 0], [1, 1], [1, 2]],
  t4: [[0, 0], [0, 1], [0, 2], [1, 1]], rect: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]],
};
const shapesFor = n => [
  'dot', 'bar2', 'col2', 'dot', 'bar2', 'col2',
  ...(n >= 3 ? ['sq', 'bar3', 'col3'] : []),
  ...(n >= 5 ? ['l3a', 'l3b', 'l3c', 'l3d'] : []),
  ...(n >= 12 ? ['l4a', 'l4b', 'l4c', 'l4d', 't4'] : []),
  ...(n >= 30 ? ['rect'] : []),
];

// What each level adds, and its first-time tip
const FEATURES = { arrows: 7, ice: 10, frozenGate: 16, layered: 22, chain: 28, crate: 34 };
const TIPS = {
  1: 'Drag a jelly to the gate of its colour to send it out.', 2: 'Jellies slide around each other. Order matters!',
  3: 'Big jellies only fit through gates as wide as they are.', 7: 'Striped jellies only slide one way.',
  10: 'Frozen jellies thaw after that many others have left.', 16: 'An icy gate opens after that many jellies have left.',
  22: 'Double jellies: the first gate peels the outside colour, then send the inside one out.',
  28: 'A chained jelly is free once the jelly with the matching key is gone.',
  34: 'Crates are in the way until that many jellies have left.',
};

const occOf = (L, placed, crates, eAt) => { // what's in the way for a block that leaves e-th (crates up while e < n)
  const S = { L: { ...L, crates: crates.map(c => ({ ...c, n: eAt < c.n ? 1 : 0 })) }, out: 0, blocks: placed };
  return S;
};

function build(n) {
  const w = Math.min(8, 4 + Math.floor((n + 3) / 7)), h = Math.min(9, 5 + Math.floor((n + 1) / 7));
  const floor = Array.from({ length: h }, () => Array(w).fill('.'));
  if (n >= 8) for (let k = 0; k < ri(1, 2 + Math.floor(n / 20)); k++) { // notch a corner or two
    const cr = pick([0, h - 1]), cc = pick([0, w - 1]), dh = ri(1, 2), dw = ri(1, 2);
    for (let r = 0; r < dh; r++) for (let c = 0; c < dw; c++) floor[cr ? h - 1 - r : r][cc ? w - 1 - c : c] = '#';
  }
  if (n >= 18 && rnd() < .5) floor[ri(2, h - 3)][ri(2, w - 3)] = '#'; // a pillar
  const L = { w, h, floor: floor.map(r => r.join('')), gates: [], crates: [] };
  const fl = (r, c) => r >= 0 && c >= 0 && r < h && c < w && L.floor[r][c] === '.';
  const nColors = Math.min(6, 2 + Math.floor(n / 6)), colors = shuffle(COLORS.slice()).slice(0, nColors);
  // gates along the outer edges, on floor, not overlapping
  const taken = new Set();
  const addGate = color => {
    for (let t = 0; t < 60; t++) {
      const side = pick(Object.keys(DIRS)), vert = side === 'up' || side === 'down', max = vert ? w : h;
      const len = Math.min(max - 2, pick([1, 2, 2, 3, n > 20 ? 3 : 2])), from = ri(0, max - len);
      const line = side === 'up' ? 0 : side === 'down' ? h - 1 : side === 'left' ? 0 : w - 1;
      let ok = true;
      for (let k = -1; k <= len; k++) { const a = from + k; if (taken.has(side + a) && k >= 0 && k < len) ok = false; }
      for (let k = 0; k < len; k++) { const a = from + k, [r, c] = vert ? [line, a] : [a, line]; if (!fl(r, c)) ok = false; }
      if (!ok) continue;
      for (let k = -1; k <= len; k++) taken.add(side + (from + k)); // keep a post between gates
      L.gates.push({ side, line, from, len, color }); return true;
    }
    return false;
  };
  for (const c of colors) if (!addGate(c)) return null;
  for (const c of colors) if (rnd() < .35) addGate(c);
  if (n >= FEATURES.frozenGate) { const g = pick(L.gates); g.ice = ri(2, 4); }
  if (n >= FEATURES.crate && rnd() < .8) { // a 2x2 crate somewhere inside
    for (let t = 0; t < 30; t++) { const r = ri(1, h - 3), c = ri(1, w - 3), cells = [[r, c], [r, c + 1], [r + 1, c], [r + 1, c + 1]];
      if (cells.every(([a, b]) => fl(a, b))) { L.crates.push({ cells, n: ri(2, 4) }); break; } }
  }
  // how many blocks: fill most of the floor
  const floorN = L.floor.join('').split('').filter(ch => ch === '.').length - L.crates.reduce((a, c) => a + c.cells.length, 0);
  const T = Math.min(16, Math.max(3, Math.round(floorN * (n < 4 ? .2 : .32 + Math.min(.12, n / 400)) / 1.8)));
  const shapes = shapesFor(n), placed = [];
  const crateCells = new Set(L.crates.flatMap(c => c.cells.map(([r, cc]) => r * w + cc)));
  for (let step = 0; step < T; step++) {
    const e = T - 1 - step; // this block is the e-th to leave (0 = first)
    let done = false;
    for (let t = 0; t < 120 && !done; t++) {
      const layered = n >= FEATURES.layered && rnd() < .22 && nColors > 1;
      const open = L.gates.filter(g => !g.ice || e >= g.ice);
      const gOut = pick(open); if (!gOut) break;
      const shapeName = pick(shapes), cells = SHAPES[shapeName];
      const axis = n >= FEATURES.arrows && rnd() < .18 ? (gOut.side === 'up' || gOut.side === 'down' ? 'v' : 'h') : undefined;
      // entry spot: against the gate, whole width inside it
      const vert = gOut.side === 'up' || gOut.side === 'down';
      const rows = cells.map(c => c[0]), cols = cells.map(c => c[1]);
      const bh = Math.max(...rows) + 1, bw = Math.max(...cols) + 1, width = vert ? bw : bh;
      if (width > gOut.len) continue;
      const off = ri(0, gOut.len - width);
      const r0 = gOut.side === 'up' ? gOut.line - Math.min(...rows.filter((_, k) => true)) : gOut.side === 'down' ? gOut.line - (bh - 1) : gOut.from + off;
      const c0 = gOut.side === 'left' ? gOut.line : gOut.side === 'right' ? gOut.line - (bw - 1) : gOut.from + off;
      const b = { cells, r: r0, c: c0, color: gOut.color, ...(axis ? { axis } : {}) };
      const S = occOf(L, placed, L.crates, e); S.blocks = [...placed, b];
      const occ = occupancy(S, placed.length);
      if (b.cells.some(([dr, dc]) => { const rr = b.r + dr, cc = b.c + dc; return !fl(rr, cc) || occ[rr * w + cc] !== -1; })) continue;
      if (!fitsGate(S, placed.length, gOut, occ)) continue;
      let reach = reachable(S, placed.length, occ);
      let peelColor = null;
      if (layered) { // from the inner gate, reach a spot against an outer-colour gate, then go on from there
        const outer = pick(colors.filter(c => c !== gOut.color));
        const gates2 = L.gates.filter(g => g.color === outer && (!g.ice || e >= g.ice));
        const spots = shuffle([...reach.keys()]).filter(k => { b.r = Math.floor(k / w); b.c = k % w; S.blocks[placed.length] = { ...b, color: outer }; return gates2.some(g => fitsGate(S, placed.length, g, occ)); });
        if (!spots.length) continue;
        const k = spots[0]; b.r = Math.floor(k / w); b.c = k % w; S.blocks[placed.length] = b;
        reach = reachable(S, placed.length, occ); peelColor = outer;
      }
      // final spot: reachable, off the crates, not already able to leave, as far in as possible
      const entry = [r0, c0];
      const finals = [...reach.keys()].map(k => [Math.floor(k / w), k % w]).filter(([r, c]) => {
        if (cells.some(([dr, dc]) => crateCells.has((r + dr) * w + c + dc))) return false;
        return Math.abs(r - entry[0]) + Math.abs(c - entry[1]) >= (n < 3 ? 1 : 2);
      });
      if (!finals.length) continue;
      // prefer snug spots (touching walls and other jellies) far from the gate
      const snug = ([r, c]) => { let s = 0; for (const [dr, dc] of cells) for (const [a, bb] of Object.values(DIRS)) { const rr = r + dr + a, cc = c + dc + bb; if (!fl(rr, cc) || placed.some(p => p.cells.some(([x, y]) => p.r + x === rr && p.c + y === cc))) s++; } return s + (Math.abs(r - entry[0]) + Math.abs(c - entry[1])) * .6 + rnd() * 2; };
      finals.sort((p, q) => snug(q) - snug(p));
      const [fr, fc] = finals[0];
      const blk = { cells, r: fr, c: fc, color: peelColor || gOut.color, ...(peelColor ? { inner: gOut.color } : {}), ...(axis ? { axis } : {}), e };
      placed.push(blk); done = true;
    }
    if (!done) return null;
  }
  // ice and chains: only numbers the built-in order allows
  const byE = [...placed].sort((a, b) => a.e - b.e);
  if (n >= FEATURES.ice) for (const b of shuffle(placed.filter(b => b.e >= 2)).slice(0, ri(1, 2))) b.ice = ri(Math.max(1, b.e - 2), b.e);
  if (n >= FEATURES.chain) {
    const late = shuffle(placed.filter(b => b.e >= 2 && !b.ice))[0];
    if (late) { const key = pick(byE.filter(k => k.e < late.e && !k.key && !k.lock)); if (key) { key.key = 'k1'; late.lock = 'k1'; } }
  }
  L.blocks = placed.map(({ e, ...b }) => b);
  L.time = Math.round((30 + placed.length * 8 + (n > 20 ? 20 : 0)) / 5) * 5; // about 8s a jelly
  return L;
}

const levels = [];
for (let n = 1; n <= 60; n++) {
  let L = null;
  for (let t = 0; t < 400 && !L; t++) { const c = build(n); if (c && solvable(c)) L = c; }
  if (!L) throw new Error('no level ' + n);
  if (TIPS[n]) L.tip = TIPS[n];
  levels.push(L);
  const f = [L.blocks.some(b => b.axis) && 'arrows', L.blocks.some(b => b.ice) && 'ice', L.gates.some(g => g.ice) && 'icy gate', L.blocks.some(b => b.inner) && 'double', L.blocks.some(b => b.lock) && 'chain', L.crates.length && 'crate'].filter(Boolean);
  console.log(`${String(n).padStart(2)}  ${L.w}x${L.h}  ${String(L.blocks.length).padStart(2)} jellies  ${L.gates.length} gates  ${L.time}s  ${f.join(' ')}`);
}
writeFileSync(OUT, JSON.stringify(levels));
console.log('wrote', OUT.pathname);
