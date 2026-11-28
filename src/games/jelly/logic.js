// Jelly Gates rules, free of the DOM so the level maker and tests share them.
//
// A board is a grid of floor ('.') and wall ('#') cells. Blocks are shapes of
// cells with a colour. Drag a block and it slides through free floor. When it
// touches a gate (a coloured gap in the wall) of its colour and fits through
// it, it leaves the board. Clear every block to win.
//
// Extras, each optional on a level:
//   block.ice   frozen: can't move until that many blocks have left
//   block.axis  'h' or 'v': only slides that way
//   block.inner layered: the first matching gate peels the outer colour off,
//               and the block (now `inner`) needs its own gate
//   block.key / block.lock   a chained block (lock) moves once the block with
//               the same key has left
//   gate.ice    frozen gate: opens once that many blocks have left
//   crates      [{ cells, n }]: in the way until n blocks have left
export const DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };

export function makeState(L) {
  return {
    L, out: 0, // blocks that have left
    blocks: L.blocks.map(b => ({ ...b, cells: b.cells.map(c => [...c]) })),
  };
}

const cellsAt = (b, r = b.r, c = b.c) => b.cells.map(([dr, dc]) => [r + dr, c + dc]);
export const floorAt = (L, r, c) => r >= 0 && c >= 0 && r < L.h && c < L.w && L.floor[r][c] === '.';
export const crateUp = (S, cr) => S.out < cr.n;

/** Occupancy grid of everything that blocks movement, except block `skip`. */
export function occupancy(S, skip) {
  const { L } = S, o = new Int16Array(L.w * L.h).fill(-1);
  for (let r = 0; r < L.h; r++) for (let c = 0; c < L.w; c++) if (L.floor[r][c] !== '.') o[r * L.w + c] = -2;
  for (const cr of L.crates || []) if (crateUp(S, cr)) for (const [r, c] of cr.cells) o[r * L.w + c] = -3;
  S.blocks.forEach((b, i) => { if (i !== skip && !b.gone) for (const [r, c] of cellsAt(b)) o[r * L.w + c] = i; });
  return o;
}

export const locked = (S, b) => (b.ice && S.out < b.ice) || (b.lock && S.blocks.some(k => k.key === b.lock && !k.gone));
export const canMove = (S, i) => !S.blocks[i].gone && !locked(S, S.blocks[i]);

/** Every top-left the block can slide to from where it is: Map key r*W+c -> previous key (a BFS tree). */
export function reachable(S, i, occ = occupancy(S, i)) {
  const b = S.blocks[i], { L } = S, W = L.w, prev = new Map([[b.r * W + b.c, -1]]), q = [[b.r, b.c]];
  const fits = (r, c) => cellsAt(b, r, c).every(([rr, cc]) => rr >= 0 && cc >= 0 && rr < L.h && cc < L.w && occ[rr * W + cc] === -1);
  for (let k = 0; k < q.length; k++) {
    const [r, c] = q[k];
    for (const [name, [dr, dc]] of Object.entries(DIRS)) {
      if (b.axis === 'h' && dr) continue;
      if (b.axis === 'v' && dc) continue;
      const nr = r + dr, nc = c + dc, key = nr * W + nc;
      if (!prev.has(key) && fits(nr, nc)) { prev.set(key, r * W + c); q.push([nr, nc]); }
    }
  }
  return prev;
}

/** The colour that a gate would take from this block right now (its outer layer first). */
export const showing = b => b.color;

/**
 * Can block i leave through gate g from where it stands? It must be the gate's
 * colour, the gate must be open, it must lie right against it with its whole
 * width inside the gap, and it must be able to slide straight out.
 */
export function fitsGate(S, i, g, occ = occupancy(S, i)) {
  const b = S.blocks[i], { L } = S;
  if (b.gone || showing(b) !== g.color || (g.ice && S.out < g.ice)) return false;
  if (b.axis === 'h' && (g.side === 'up' || g.side === 'down')) return false;
  if (b.axis === 'v' && (g.side === 'left' || g.side === 'right')) return false;
  const cells = cellsAt(b), vert = g.side === 'up' || g.side === 'down';
  const span = cells.map(([r, c]) => (vert ? c : r)), lo = Math.min(...span), hi = Math.max(...span);
  if (lo < g.from || hi >= g.from + g.len) return false;
  const along = cells.map(([r, c]) => (vert ? r : c));
  const edge = g.side === 'up' || g.side === 'left' ? Math.min(...along) : Math.max(...along);
  if (edge !== g.line) return false;
  // slide straight out: every cell it passes on the way must be free floor, or the gap itself and beyond
  const [dr, dc] = DIRS[g.side];
  for (let k = 1; k <= (vert ? L.h : L.w); k++) for (const [r, c] of cells) {
    const rr = r + dr * k, cc = c + dc * k;
    const past = g.side === 'up' ? rr < g.line : g.side === 'down' ? rr > g.line : g.side === 'left' ? cc < g.line : cc > g.line;
    if (past) continue; // through the gap: the wall there is open
    if (rr < 0 || cc < 0 || rr >= L.h || cc >= L.w || occ[rr * L.w + cc] !== -1) return false;
  }
  return true;
}

/** The first gate block i can use where it stands, or null. */
export function gateFor(S, i) {
  const occ = occupancy(S, i);
  return (S.L.gates || []).find(g => fitsGate(S, i, g, occ)) || null;
}

/** Block i goes through gate g: layered blocks lose their outer colour and stay; others leave. */
export function passGate(S, i) {
  const b = S.blocks[i];
  if (b.inner) { b.color = b.inner; delete b.inner; return 'peeled'; }
  b.gone = true; S.out++; return 'out';
}

export const won = S => S.blocks.every(b => b.gone);

/** Block cells as absolute coordinates (for drawing). */
export const absCells = b => cellsAt(b);

/** Forward check: is there an order that clears the board? (DFS over "move one jelly out", memoised.) */
export function solvable(L, budget = 20000) {
  const seen = new Set(); let steps = 0;
  const key = S => S.blocks.map(b => b.gone ? 'x' : `${b.r},${b.c},${b.color}`).join('|');
  const go = S => {
    if (won(S)) return true;
    if (++steps > budget) return false;
    const k = key(S); if (seen.has(k)) return false; seen.add(k);
    for (let i = 0; i < S.blocks.length; i++) {
      const b = S.blocks[i]; if (b.gone || locked(S, b)) continue;
      const occ = occupancy(S, i), reach = reachable(S, i, occ), r0 = b.r, c0 = b.c;
      for (const p of reach.keys()) {
        b.r = Math.floor(p / L.w); b.c = p % L.w;
        const g = L.gates.find(gg => fitsGate(S, i, gg, occ));
        if (g) {
          const snap = JSON.stringify(S.blocks), out = S.out;
          passGate(S, i);
          if (go(S)) return true;
          S.blocks = JSON.parse(snap); S.out = out;
          break; // any spot that uses a gate is as good as another for this jelly's colour state
        }
      }
      S.blocks[i].r = r0; S.blocks[i].c = c0;
    }
    return false;
  };
  return go(makeState(L));
}

