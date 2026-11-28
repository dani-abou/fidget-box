// Headless checks of game logic (no browser): `node tests/sim.mjs`.
//  - Spades: AI only ever plays legal cards; sharper opponents win more; scoring rules.
//  - Letter Trail: boards generate quickly and every level's target is reachable.
//  - Slide Free: every level is solvable in exactly its stated minimum.
import { readFileSync } from 'node:fs';
import * as JL from '../src/games/jelly/logic.js';
import { parse as penParse, reach as penReach, starsFor as penStars } from '../src/games/pen/logic.js';
import assert from 'node:assert/strict';
import { legal, trickWinner, scoreHand, aiBid, aiPlay, estimate } from '../src/games/spades.js';
import { parseDict, makeBoard, levelRules as wordRules } from '../src/games/words.js';

let fails = 0;
const check = (name, fn) => { try { fn(); console.log('PASS ', name); } catch (e) { fails++; console.log('FAIL ', name, '\n   ', e.message); } };
const suit = c => Math.floor(c / 13);

// ---------- Spades ----------
check('scoring: made bid, bags, nil, set, 10-bag penalty', () => {
  let sc = [0, 0], bg = [0, 0];
  scoreHand([4, 3, 3, 2], [5, 3, 3, 2], sc, bg); assert.deepEqual(sc, [71, 50]); assert.deepEqual(bg, [1, 0]);
  sc = [0, 0]; bg = [0, 0];
  scoreHand([0, 5, 6, 2], [0, 4, 7, 2], sc, bg); assert.deepEqual(sc, [161, -70]); // nil +100, bid 6 won 7 = 61
  sc = [0, 0]; bg = [9, 0];
  scoreHand([3, 3, 3, 3], [4, 2, 4, 3], sc, bg); assert.deepEqual(sc, [62 - 100, -60]); assert.deepEqual(bg, [1, 0]);
  sc = [0, 0]; bg = [0, 0];
  scoreHand([0, 4, 4, 4], [1, 4, 4, 4], sc, bg); assert.equal(sc[0], -100 + 40); assert.equal(bg[0], 1);
});
check('rules: no spade lead until broken; follow suit; trump wins', () => {
  assert.deepEqual(legal([39, 40, 2], [], false), [2]);
  assert.deepEqual(legal([39, 40], [], false), [39, 40]);
  assert.deepEqual(legal([0, 5, 39], [{ p: 1, c: 3 }], false), [0, 5]);
  assert.equal(trickWinner([{ p: 0, c: 12 }, { p: 1, c: 39 }, { p: 2, c: 11 }, { p: 3, c: 5 }]).p, 1);
  assert.equal(trickWinner([{ p: 0, c: 10 }, { p: 1, c: 25 }, { p: 2, c: 12 }, { p: 3, c: 5 }]).p, 2);
});

function playGame(skills, target = 300) {
  const st = { scores: [0, 0], bags: [0, 0], dealer: 0, skills };
  for (let hand = 0; hand < 40; hand++) {
    const d = Array.from({ length: 52 }, (_, i) => i).sort(() => Math.random() - .5);
    Object.assign(st, { hands: [0, 1, 2, 3].map(p => d.slice(p * 13, p * 13 + 13)), bids: [null, null, null, null], tricks: [0, 0, 0, 0], trick: [], played: [], broken: false });
    st.dealer = (st.dealer + 1) % 4;
    for (let k = 1; k <= 4; k++) { const p = (st.dealer + k) % 4; st.bids[p] = aiBid(st, p); assert.ok(st.bids[p] >= 0 && st.bids[p] <= 13); }
    let lead = (st.dealer + 1) % 4;
    for (let t = 0; t < 13; t++) {
      for (let k = 0; k < 4; k++) {
        const p = (lead + k) % 4, c = aiPlay(st, p);
        if (!legal(st.hands[p], st.trick, st.broken).includes(c)) throw new Error(`illegal card ${c} by ${p}`);
        st.hands[p] = st.hands[p].filter(x => x !== c); st.trick.push({ p, c }); st.played.push(c); if (suit(c) === 3) st.broken = true;
      }
      lead = trickWinner(st.trick).p; st.tricks[lead]++; st.trick = [];
    }
    scoreHand(st.bids, st.tricks, st.scores, st.bags);
    const [a, b] = st.scores;
    if ((a >= target || b >= target || a <= -200 || b <= -200) && a !== b) return a > b ? 0 : 1;
  }
  return st.scores[0] >= st.scores[1] ? 0 : 1;
}
check('spades AI: 600 full games, all plays legal; sharper team wins more', () => {
  const rate = (s0, s1, games = 300) => { let w = 0; for (let g = 0; g < games; g++) w += playGame([s0, s1, s0, s1]) === 0; return w / games; };
  const low = rate(1, .12), mid = rate(1, .56);
  console.log(`     expert pair vs level-1 table: ${(low * 100).toFixed(0)}% wins; vs level-5 table: ${(mid * 100).toFixed(0)}%`);
  assert.ok(low > .6, 'expert should beat level 1 comfortably');
  assert.ok(low > mid, 'level 5 table should be harder than level 1');
});
check('spades bid estimate is sane', () => {
  assert.ok(estimate([51, 50, 49, 48, 47, 12, 25, 38, 11, 24, 37, 10, 23]) > 9);
  assert.ok(estimate([39, 40, 0, 1, 2, 3, 13, 14, 15, 26, 27, 28, 29]) < 1.2);
});

// ---------- Letter Trail ----------
const dict = parseDict(readFileSync(new URL('../src/data/words.txt', import.meta.url), 'utf8'));
check('word boards: fast, and every level target reachable from common words', () => {
  for (const n of [1, 6, 12, 13, 20, 30]) {
    const R = wordRules(n), t0 = performance.now(), b = makeBoard(R, dict), ms = performance.now() - t0;
    console.log(`     level ${n}: ${R.size}x${R.size}, ${R.time}s, target ${R.target}; board has ${b.words.size} words, common worth ${b.commonPts} (${ms.toFixed(0)}ms)`);
    assert.ok(b.commonPts >= R.target * 2, `level ${n} board too thin`);
    assert.ok(ms < 1500, 'board generation too slow');
  }
});

// ---------- Slide Free ----------
check('slide levels: each solvable in exactly its stated minimum', () => {
  const L = JSON.parse(readFileSync(new URL('../src/data/slide-levels.json', import.meta.url), 'utf8'));
  const N = 6;
  for (const [i, lv] of L.entries()) {
    const bl = lv.blocks.map(([r, c, len, d]) => ({ r, c, len, h: d === 'h' }));
    const key = s => s.join(','), start = bl.map(b => b.h ? b.c : b.r);
    const seen = new Set([key(start)]); let q = [start], depth = 0, solvedAt = -1;
    while (q.length && solvedAt < 0) {
      const next = [];
      for (const s of q) {
        if (s[0] === N - 2) { solvedAt = depth; break; }
        const occ = new Set(); bl.forEach((b, j) => { for (let k = 0; k < b.len; k++) occ.add(b.h ? b.r * N + s[j] + k : (s[j] + k) * N + b.c); });
        bl.forEach((b, j) => {
          const cell = p => b.h ? b.r * N + p : p * N + b.c;
          for (let p = s[j] - 1; p >= 0 && !occ.has(cell(p)); p--) { const t = [...s]; t[j] = p; if (!seen.has(key(t))) { seen.add(key(t)); next.push(t); } }
          for (let p = s[j] + b.len; p < N && !occ.has(cell(p)); p++) { const t = [...s]; t[j] = p - b.len + 1; if (!seen.has(key(t))) { seen.add(key(t)); next.push(t); } }
        });
      }
      if (solvedAt < 0) { q = next; depth++; }
    }
    assert.equal(solvedAt, lv.min, `level ${i + 1}: stated ${lv.min}, actual ${solvedAt}`);
  }
  console.log(`     ${L.length} levels, minimum moves ${L[0].min} to ${L[L.length - 1].min}`);
});

// ---------- Sunny Acres ----------
const { CONFIG: FC, UNLOCKS: FU } = await import('../src/games/farm/config.js');
// farm.js reads browser globals only inside init(), so its pure helpers import fine here
const { LEVELS: FL, STAR_TIME_LEFT } = await import('../src/games/farm/config.js');
const { starsFor, goalText } = await import('../src/games/farm.js');
check('farm levels: every goal is reachable with what the level starts with or can build', () => {
  const startIds = [...FC.fields, ...FC.stands, ...FC.zones].filter(e => e.start).map(e => e.id);
  const unlockIds = new Set(FU.map(u => u.id));
  FL.forEach((L, i) => {
    const tag = `level ${i + 1} (${L.name})`;
    const have = new Set([...startIds, ...L.start, ...L.build]);
    for (const id of [...L.start, ...L.build]) assert.ok(unlockIds.has(id), `${tag}: unknown id '${id}'`);
    for (const id of L.build) { const u = FU.find(x => x.id === id); if (u.after) assert.ok(have.has(u.after), `${tag}: '${id}' needs '${u.after}', which this level never has`); }
    const inZone = (p, z) => p.x > z.x && p.x < z.x + z.w && p.y > z.y && p.y < z.y + z.h;
    const zoneOk = p => FC.zones.every(z => z.start || have.has(z.id) || !inZone(p, z));
    for (const id of L.build) assert.ok(zoneOk(FU.find(u => u.id === id).at), `${tag}: '${id}' sits behind a fence this level can't open`);
    const makes = p => FC.fields.some(f => f.crop === p && have.has(f.id)) || FC.pens.some(q => q.product === p && have.has(q.id)) || FC.machines.some(m => m.out === p && have.has(m.id) && makes(m.in));
    for (const gl of L.goals) {
      if (gl.sell) { assert.ok(FC.stands.some(st => st.product === gl.sell && have.has(st.id)), `${tag}: no ${gl.sell} stand`); assert.ok(makes(gl.sell), `${tag}: nothing makes ${gl.sell}`); }
      if (gl.build) assert.ok(L.build.includes(gl.build), `${tag}: goal builds '${gl.build}' but it isn't on the build list`);
      if (gl.fill) for (const p of Object.keys(gl.fill)) assert.ok(makes(p), `${tag}: the cart wants ${p}, which nothing makes`);
      if (gl.orders && gl.with) { assert.ok(makes(gl.with), `${tag}: orders need ${gl.with}, which nothing makes`); assert.ok(FC.stands.some(st => st.product === gl.with && have.has(st.id)), `${tag}: no ${gl.with} stand, so no ${gl.with} orders`); }
      if (gl.inspect) assert.ok(gl.inspect.at.every(t => t < L.time) && L.time >= gl.inspect.at.at(-1) / .7 - 1, `${tag}: inspections must fit the clock with room for 3 stars`);
      assert.ok(goalText(gl).length > 3);
    }
    assert.ok(L.time >= 60, `${tag}: time looks too short`);
  });
  console.log(`     ${FL.length} levels, ${FL.map(L => Math.round(L.time / 60 * 10) / 10 + 'm').join(' ')}`);
});
const { seedsFor, automatedRate } = await import('../src/games/farm.js');
check('farm seeds: first win, new stars and megas pay; replays pay a little', () => {
  assert.equal(seedsFor(3, 0, false), 14); assert.equal(seedsFor(3, 0, true), 28);
  assert.equal(seedsFor(3, 3, false), 1, 'replaying a 3-star level pays the replay seed only');
  assert.equal(seedsFor(3, 1, false), 7, 'two new stars + replay');
});
check('free farm offline earnings: zero until a chain is automated, then positive', () => {
  assert.equal(automatedRate(new Set()), 0);
  assert.equal(automatedRate(new Set(['hand_carrot', 'carrier1'])), 0, 'no cashier: nothing sells');
  assert.ok(automatedRate(new Set(['hand_carrot', 'carrier1', 'cashier'])) > 0);
});
check('farm stars: more time left, more stars', () => {
  assert.equal(starsFor(100, 100), 3); assert.equal(starsFor(STAR_TIME_LEFT[0] * 100, 100), 3);
  assert.equal(starsFor(20, 100), 2); assert.equal(starsFor(1, 100), 1);
});

check('goat pen: edge escape, no diagonal moves, water, bonuses, burrows', () => {
  const L = penParse(['.....', '.~~~.', '.~G..', '.~~~.', '.....']);
  assert.ok(penReach(L, []).escaped, 'an open gap lets it out');
  const i = (r, c) => r * 5 + c;
  assert.equal(penReach(L, [i(2, 3)]).score, 1, 'one fence in the gap pens it on its own tile');
  // fences only touching at a corner still hold: the goat can't step diagonally
  const D = penParse(['.....', '..~..', '.~G~.', '.....', '.....']);
  assert.ok(!penReach(D, [i(3, 2)]).escaped && penReach(D, [i(3, 2)]).score === 1, 'corner gaps are closed');
  const B = penParse(['~~~~~', '~GcT~', '~~~~~', '~.T..', '~~~~~']);
  assert.ok(penReach(B, []).escaped, 'a burrow leads to the other one, and out');
  assert.equal(penReach(B, [i(3, 3)]).score, 1 + 4 + 1 + 1 + 1, 'carrot +3 and both burrow tiles count');
  const Wn = penParse(['~~~~', '~Gw~', '~~~~']);
  assert.equal(penReach(Wn, []).score, 1 + 1 - 5, 'a wasp nest costs 5');
  assert.equal(penStars(30, 30), 3); assert.equal(penStars(24, 30), 2); assert.equal(penStars(5, 30), 1);
});

check('goat pen levels: 40, each par pen fits the budget and scores par', () => {
  const lv = JSON.parse(readFileSync(new URL('../src/data/pen-levels.json', import.meta.url)));
  assert.equal(lv.length, 40);
  lv.forEach((l, k) => {
    const L = penParse(l.rows);
    assert.ok(l.rows.every(r => r.length === l.rows[0].length), `level ${k + 1}: ragged rows`);
    assert.ok(penReach(L, []).escaped, `level ${k + 1}: the goat starts free`);
    assert.ok(l.best.length <= l.fences && l.best.every(f => L.cells[f] === '.'), `level ${k + 1}: par pen is legal`);
    assert.equal(penReach(L, l.best).score, l.par, `level ${k + 1}: par pen scores par`);
  });
});

const FX = await import('../src/games/farm/config.js');
check('free farm keeps growing: endless upgrades, ribbons, Orchard and Bee Garden', () => {
  for (const k of Object.keys(FX.CONFIG.upgrades)) {
    let prevV = FX.upgradeValue(k, 0), prevC = 0, n = 0;
    for (let l = 0; l < 40 && !FX.upgradeMaxed(k, l, true); l++, n++) {
      const c = FX.upgradeCost(k, l), v = FX.upgradeValue(k, l + 1);
      assert.ok(c > prevC, `${k}: cost rises (${prevC} -> ${c} at ${l})`); prevC = c;
      assert.ok(k === 'harvest' ? v <= prevV : v >= prevV, `${k}: value improves`); prevV = v;
    }
    if (!FX.CONFIG.more[k].cap) assert.equal(n, 40, `${k}: never maxes out in Free Farm`);
    if (!FX.CONFIG.upgrades[k].free) assert.ok(FX.upgradeMaxed(k, FX.CONFIG.upgrades[k].cost.length, false), `${k}: levels still stop at the table`);
  }
  assert.equal(FX.upgradeValue('speed', 99), 8.4, 'run speed has a cap');
  assert.equal(FX.ribbonsFor(1999), 0); assert.equal(FX.ribbonsFor(2000), 1); assert.equal(FX.ribbonsFor(8000), 2);
  const free = FX.layoutFor(FX.FREE), lvl = FX.layoutFor(FX.LEVELS[0]);
  assert.deepEqual(free.C.zones.map(z => z.id).filter(id => ['orchard', 'bees'].includes(id)), ['orchard', 'bees']);
  assert.equal(free.C.world.blocked.length, 0, 'Free Farm clears the woods');
  assert.ok(!lvl.C.zones.some(z => z.free) && lvl.C.world.blocked.length === 2, 'levels keep the woods');
  const all = new Set(FX.UNLOCKS.map(u => u.id));
  const before = automatedRate(new Set([...all].filter(id => !['orchard', 'bees'].includes(id) && !FX.UNLOCKS.find(u => u.id === id && FX.UNLOCKS.indexOf(u) >= FX.UNLOCKS.findIndex(x => x.id === 'orchard')))));
  assert.ok(automatedRate(all) > before, 'the new areas earn more on their own');
  assert.ok(automatedRate(all, { prices: 5 }) > automatedRate(all) * 1.4, 'price upgrades raise offline earnings');
});

check('jelly gates: gates, fit, ice, chains, layers, crates, one-way', () => {
  const L = { w: 4, h: 3, floor: ['....', '....', '....'], crates: [],
    gates: [{ side: 'right', line: 3, from: 0, len: 1, color: 'red' }, { side: 'up', line: 0, from: 0, len: 2, color: 'blue' }],
    blocks: [{ cells: [[0, 0]], r: 0, c: 0, color: 'red' }, { cells: [[0, 0], [0, 1]], r: 2, c: 0, color: 'blue', ice: 1 }] };
  const S = JL.makeState(L);
  assert.ok(!JL.gateFor(S, 0), 'not against a gate yet');
  S.blocks[0].c = 3; assert.equal(JL.gateFor(S, 0).color, 'red', 'touching its gate');
  assert.ok(JL.locked(S, S.blocks[1]), 'frozen until one jelly has left');
  JL.passGate(S, 0); assert.ok(!JL.locked(S, S.blocks[1]), 'thawed');
  S.blocks[1].r = 0; assert.ok(JL.gateFor(S, 1), 'a 2-wide jelly fits a 2-wide gate');
  L.gates[1].len = 1; assert.ok(!JL.gateFor(S, 1), 'but not a 1-wide one');
  const D = JL.makeState({ ...L, gates: [{ side: 'right', line: 3, from: 0, len: 1, color: 'red' }], blocks: [{ cells: [[0, 0]], r: 0, c: 3, color: 'red', inner: 'blue' }] });
  assert.equal(JL.passGate(D, 0), 'peeled'); assert.equal(D.blocks[0].color, 'blue'); assert.ok(!D.blocks[0].gone, 'a double jelly loses its outside first');
  const H = JL.makeState({ ...L, gates: [], blocks: [{ cells: [[0, 0]], r: 1, c: 1, color: 'red', axis: 'h' }] });
  assert.ok([...JL.reachable(H, 0).keys()].every(k => Math.floor(k / 4) === 1), 'a one-way jelly stays in its row');
  const C = JL.makeState({ ...L, gates: [], crates: [{ cells: [[1, 2]], n: 1 }], blocks: [{ cells: [[0, 0]], r: 1, c: 0, color: 'red' }, { cells: [[0, 0]], r: 0, c: 0, color: 'blue', key: 'k' }, { cells: [[0, 0]], r: 2, c: 0, color: 'red', lock: 'k' }] });
  assert.ok(!JL.reachable(C, 0).has(1 * 4 + 2), 'a crate is in the way');
  assert.ok(JL.locked(C, C.blocks[2]), 'chained while its key is on the board');
  C.blocks[1].gone = true; C.out = 1;
  assert.ok(!JL.locked(C, C.blocks[2]) && JL.reachable(C, 0).has(1 * 4 + 2), 'key gone: chain off; one out: crate gone');
});

check('jelly gates levels: 60, every one solvable with the game rules', () => {
  const lv = JSON.parse(readFileSync(new URL('../src/data/jelly-levels.json', import.meta.url)));
  assert.equal(lv.length, 60);
  lv.forEach((L, k) => assert.ok(L.packed ? JL.shufflesToSolve(L, 80000) === L.shuffles : JL.solvable(L, 50000), `level ${k + 1} is solvable`));
  const packed = lv.filter(L => L.packed);
  assert.ok(packed.length >= 14 && packed.every(L => L.shuffles >= 1), 'every 4th level is packed and needs shuffling');
  for (const L of packed) { // filled: at most one small jelly's worth of empty floor
    const empty = L.w * L.h - L.blocks.reduce((a, b) => a + b.cells.length, 0);
    assert.ok(empty <= 2, `packed level leaves ${empty} empty`);
  }
});

console.log(fails ? `\n${fails} failed` : '\nall logic checks passed');
process.exit(fails ? 1 : 0);
