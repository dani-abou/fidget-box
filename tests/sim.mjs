// Headless checks of game logic (no browser): `node tests/sim.mjs`.
//  - Spades: AI only ever plays legal cards; sharper opponents win more; scoring rules.
//  - Letter Trail: boards generate quickly and every level's target is reachable.
//  - Slide Free: every level is solvable in exactly its stated minimum.
import { readFileSync } from 'node:fs';
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
const { automatedRate } = await import('../src/games/farm.js');
check('farm config: every unlock names a real thing, and `after` points earlier', () => {
  const ids = new Set([...FC.fields, ...FC.pens, ...FC.machines, ...FC.stands, ...FC.zones, ...FC.helpers].map(e => e.id));
  const seen = new Set([...FC.fields, ...FC.stands, ...FC.zones].filter(e => e.start).map(e => e.id));
  for (const u of FU) {
    assert.ok(ids.has(u.id), `unlock '${u.id}' has no matching field/pen/machine/stand/zone/helper`);
    if (u.after) assert.ok(seen.has(u.after), `'${u.id}' is after '${u.after}', which isn't built earlier`);
    assert.ok(u.price > 0 && u.at, `'${u.id}' needs a price and a spot`);
    seen.add(u.id);
  }
  for (const m of FC.machines) assert.ok(FC.products[m.in] && FC.products[m.out], `machine ${m.id} uses unknown products`);
  for (const s of FC.stands) assert.ok(FC.products[s.product]?.price > 0, `stand ${s.id} sells something with no price`);
});
check('farm pacing: first unlock is paid by one round of the starter field', () => {
  const start = FC.fields.find(f => f.start), coins = start.w * start.h * FC.products[start.crop].price;
  assert.ok(FU[0].price <= coins, `first unlock ${FU[0].price} > one harvest worth ${coins}`);
});
check('farm offline earnings: zero until a chain is automated, then positive', () => {
  assert.equal(automatedRate(new Set()), 0);
  assert.equal(automatedRate(new Set(['hand_carrot', 'carrier1'])), 0, 'no cashier: nothing sells');
  const r = automatedRate(new Set(['hand_carrot', 'carrier1', 'cashier']));
  assert.ok(r > 0, 'farmhand + carrier + cashier should earn');
  const all = automatedRate(new Set(FU.map(u => u.id)));
  assert.ok(all > r, 'a bigger farm earns more');
  console.log(`     offline coins/hour: starter automation ${Math.round(r * 3600 * FC.offline.efficiency)}, full farm ${Math.round(all * 3600 * FC.offline.efficiency)}`);
});

console.log(fails ? `\n${fails} failed` : '\nall logic checks passed');
process.exit(fails ? 1 : 0);
