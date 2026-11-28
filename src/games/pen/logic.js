// Goat Pen rules, free of the DOM so the level maker and tests can use them too.
// A level is rows of characters:
//   .  meadow (fences go here)      ~  pond (the goat can't cross it)
//   G  the goat                     c  carrot (+3)      g  golden carrot (+10)
//   w  wasp nest (-5)               T  burrow: the goat pops out of the other one
// The goat walks up, down, left and right (never diagonally). If it can reach a
// tile on the border, it gets away. Otherwise the score is every tile it can
// reach (1 each, its own included) plus the bonuses on them.

export const BONUS = { c: 3, g: 10, w: -5 };

export function parse(rows) {
  const h = rows.length, w = rows[0].length, cells = [], burrows = [];
  let goat = -1;
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const ch = rows[r][c], i = r * w + c;
    cells.push(ch);
    if (ch === 'G') goat = i;
    if (ch === 'T') burrows.push(i);
  }
  return { w, h, cells, goat, burrows };
}

/** Can a fence go here? Only on plain meadow. */
export const fenceable = (L, i) => L.cells[i] === '.';

/**
 * Where can the goat get to with these fences (a Set or array of tile indexes)?
 * Returns { region: Int32Array of tiles, n, escaped, exit (a border tile it reached, or -1), score }.
 */
export function reach(L, fences) {
  const { w, h, cells, goat, burrows } = L;
  const fence = fences instanceof Set ? fences : new Set(fences);
  const seen = new Uint8Array(w * h), q = new Int32Array(w * h);
  let head = 0, tail = 0, exit = -1, score = 0;
  const push = i => { if (!seen[i] && cells[i] !== '~' && !fence.has(i)) { seen[i] = 1; q[tail++] = i; } };
  push(goat);
  while (head < tail) {
    const i = q[head++], r = (i / w) | 0, c = i - r * w;
    score += 1 + (BONUS[cells[i]] || 0);
    if (exit < 0 && (r === 0 || c === 0 || r === h - 1 || c === w - 1)) exit = i;
    if (r > 0) push(i - w);
    if (r < h - 1) push(i + w);
    if (c > 0) push(i - 1);
    if (c < w - 1) push(i + 1);
    if (cells[i] === 'T') for (const b of burrows) push(b);
  }
  return { region: q.subarray(0, tail), n: tail, escaped: exit >= 0, exit, score: exit >= 0 ? 0 : score };
}

export const scoreOf = (L, fences) => reach(L, fences).score;

/** Shortest walk from the goat to the border, for the "where would it go?" preview. */
export function escapePath(L, fences) {
  const { w, h, cells, goat, burrows } = L;
  const fence = fences instanceof Set ? fences : new Set(fences);
  const prev = new Int32Array(w * h).fill(-2), q = [goat];
  prev[goat] = -1;
  for (let k = 0; k < q.length; k++) {
    const i = q[k], r = (i / w) | 0, c = i - r * w;
    if (r === 0 || c === 0 || r === h - 1 || c === w - 1) {
      const path = []; for (let j = i; j >= 0; j = prev[j]) path.unshift(j);
      return path;
    }
    const next = [];
    if (r > 0) next.push(i - w);
    if (r < h - 1) next.push(i + w);
    if (c > 0) next.push(i - 1);
    if (c < w - 1) next.push(i + 1);
    if (cells[i] === 'T') next.push(...burrows);
    for (const j of next) if (prev[j] === -2 && cells[j] !== '~' && !fence.has(j)) { prev[j] = i; q.push(j); }
  }
  return null;
}

/** Stars for a finished pen: par (the best the level maker found) = 3, within 80% = 2, any pen = 1. */
export const starsFor = (score, par) => (score <= 0 ? 0 : score >= par ? 3 : score >= Math.ceil(par * .8) ? 2 : 1);
