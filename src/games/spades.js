// Spades: you (South) and an AI partner (North) against West and East.
// Standard rules: follow suit, spades are trump and can't be led until broken,
// nil bids (+/-100), 10*bid for a made contract, overtricks are bags and every
// 10 bags costs 100. Each level is one game to a target score; opponents get
// sharper each level (fewer slips, card counting, ducking bags, attacking nil).
// The game in progress is saved after every card, so closing the app is safe.
import { ac, buzz, click, tone } from '../lib/sound.js';
import { progress, loadSave, writeSave } from '../lib/progress.js';
import { panel, levelPicker, starsHTML, pills } from '../lib/ui.js';

const LEVELS = 10;
const SUITS = ['♣', '♦', '♥', '♠'], RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SPADE = 3, NAMES = ['You', 'West', 'Partner', 'East'];
const suit = c => Math.floor(c / 13), rank = c => c % 13;
const team = p => p % 2; // 0 = you + partner, 1 = West + East
const RED = c => suit(c) === 1 || suit(c) === 2;

// ---------- level settings ----------
export const levelRules = n => ({
  target: n <= 2 ? 200 : n <= 5 ? 250 : 300,
  skill: Math.min(1, .12 + (n - 1) * .11), // opponents
  partner: .8,
});
const skillOf = (s, p) => s.skills ? s.skills[p] : p === 2 ? levelRules(s.level).partner : levelRules(s.level).skill; // s.skills: test override

// ---------- rules ----------
function shuffleDeal() {
  const d = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 51; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return [0, 1, 2, 3].map(p => d.slice(p * 13, p * 13 + 13).sort(cardOrder));
}
// Hand order: spades, hearts, clubs, diamonds (alternating colours), low to high.
const SUIT_POS = [2, 3, 1, 0];
function cardOrder(a, b) { return SUIT_POS[suit(a)] - SUIT_POS[suit(b)] || rank(a) - rank(b); }

export function legal(hand, trick, broken) {
  if (!trick.length) { const non = hand.filter(c => suit(c) !== SPADE); return broken || !non.length ? hand : non; }
  const f = hand.filter(c => suit(c) === suit(trick[0].c));
  return f.length ? f : hand;
}
export function trickWinner(trick) {
  let w = trick[0];
  for (const t of trick.slice(1)) {
    const ws = suit(w.c), ts = suit(t.c);
    if ((ts === ws && rank(t.c) > rank(w.c)) || (ts === SPADE && ws !== SPADE)) w = t;
  }
  return w;
}
const beats = (c, w, led) => suit(c) === suit(w) ? rank(c) > rank(w) : suit(c) === SPADE && (suit(w) !== SPADE);

/** Score one finished hand for each team; mutates scores/bags, returns rows for the summary. */
export function scoreHand(bids, tricks, scores, bags) {
  const rows = [];
  for (const t of [0, 1]) {
    const ps = [t, t + 2];
    let pts = 0, bag = 0;
    const contract = ps.filter(p => bids[p] > 0).reduce((a, p) => a + bids[p], 0);
    const won = ps.filter(p => bids[p] > 0).reduce((a, p) => a + tricks[p], 0);
    for (const p of ps) if (bids[p] === 0) { pts += tricks[p] === 0 ? 100 : -100; bag += tricks[p]; }
    if (contract > 0) { if (won >= contract) { pts += contract * 10 + (won - contract); bag += won - contract; } else pts -= contract * 10; }
    else bag += won;
    bags[t] += bag;
    let penalty = 0;
    while (bags[t] >= 10) { bags[t] -= 10; penalty += 100; }
    pts -= penalty; scores[t] += pts;
    rows.push({ bid: ps.map(p => bids[p] === 0 ? 'Nil' : bids[p]).join(' + '), won: ps.reduce((a, p) => a + tricks[p], 0), pts, bag, penalty });
  }
  return rows;
}

// ---------- AI ----------
/** Expected tricks from a hand (rough but decent). */
export function estimate(hand) {
  const by = [[], [], [], []];
  for (const c of hand) by[suit(c)].push(rank(c));
  let t = 0;
  const sp = by[SPADE], sl = sp.length, has = r => sp.includes(r);
  if (has(12)) t += 1;
  if (has(11)) t += sl >= 2 ? .9 : .4;
  if (has(10)) t += sl >= 3 ? .7 : .25;
  if (has(9) && sl >= 4) t += .4;
  t += Math.max(0, sl - 3) * .85;
  let spare = Math.max(0, sl - 2);
  for (let s = 0; s < 3; s++) {
    const r = by[s], l = r.length;
    if (r.includes(12)) t += l <= 5 ? .95 : .65;
    if (r.includes(11)) t += l >= 2 && l <= 4 ? .75 : l >= 2 ? .4 : .1;
    if (r.includes(10) && l >= 3 && l <= 4) t += .25;
    if (spare > 0 && l <= 1) { const ruffs = Math.min(spare, 2 - l); t += ruffs * .65; spare -= ruffs; }
  }
  return t;
}
export function aiBid(s, p) {
  const sk = skillOf(s, p), hand = s.hands[p], est = estimate(hand);
  const highSpade = hand.filter(c => suit(c) === SPADE).some(c => rank(c) >= 9);
  const partnerBid = s.bids[(p + 2) % 4];
  if (est < 1.25 && !highSpade && hand.filter(c => suit(c) === SPADE).length <= 3 && partnerBid !== 0 && Math.random() < .25 + sk * .6) return 0;
  const noisy = est + (Math.random() * 2 - 1) * (1 - sk) * 1.7;
  return Math.max(1, Math.min(13, Math.round(noisy - (sk > .6 ? .15 : 0))));
}

export function aiPlay(s, p) {
  const sk = skillOf(s, p), hand = s.hands[p], trick = s.trick;
  const L = legal(hand, trick, s.broken);
  if (L.length === 1) return L[0];
  if (Math.random() < .3 * (1 - sk) ** 1.5) return L[Math.floor(Math.random() * L.length)];

  const counting = sk >= .5;
  const seen = new Set([...s.played, ...hand]);
  // "boss": no higher card of the suit is still out (needs counting; else only aces)
  const boss = c => counting ? !Array.from({ length: 12 - rank(c) }, (_, i) => suit(c) * 13 + rank(c) + 1 + i).some(x => !seen.has(x)) : rank(c) === 12;
  const low = cs => cs.reduce((a, b) => (rank(b) < rank(a) || (rank(b) === rank(a) && suit(a) === SPADE) ? b : a));
  const high = cs => cs.reduce((a, b) => (rank(b) > rank(a) ? b : a));
  const nonSpade = cs => { const n = cs.filter(c => suit(c) !== SPADE); return n.length ? n : cs; };
  const partner = (p + 2) % 4, mine = team(p);
  const alive = q => s.bids[q] === 0 && s.tricks[q] === 0;
  const nilMe = alive(p), nilPartner = alive(partner);
  const oppNil = sk >= .6 ? [(p + 1) % 4, (p + 3) % 4].find(alive) : undefined;
  const need = [mine, mine + 2].filter(q => s.bids[q] > 0).reduce((a, q) => a + s.bids[q] - s.tricks[q], 0);
  const avoidBags = need <= 0 && sk >= .5;

  if (!trick.length) {
    if (nilMe) return low(nonSpade(L));
    if (nilPartner) { const b = L.filter(boss); return b.length ? high(b) : high(nonSpade(L)); }
    if (oppNil !== undefined || avoidBags) return low(nonSpade(L));
    const b = nonSpade(L).filter(boss).filter(c => suit(c) !== SPADE);
    if (b.length) return high(b);
    if (counting && s.broken) { const sb = L.filter(c => suit(c) === SPADE && boss(c)); if (sb.length && need > 0) return high(sb); }
    // lead low from the longest side suit
    const counts = [0, 0, 0, 0]; hand.forEach(c => counts[suit(c)]++);
    const side = nonSpade(L);
    return low(side.filter(c => counts[suit(c)] === Math.max(...side.map(x => counts[suit(x)]))));
  }

  const w = trickWinner(trick), led = suit(trick[0].c);
  const winners = L.filter(c => beats(c, w.c, led)), losers = L.filter(c => !beats(c, w.c, led));
  const last = trick.length === 3;
  const partnerPlayed = trick.some(t => t.p === partner);

  if (nilMe) return losers.length ? high(losers) : high(L);
  if (nilPartner) {
    if (w.p === partner || !partnerPlayed) return winners.length ? (partnerPlayed ? low(winners) : high(winners)) : low(L);
    return low(losers.length ? losers : L);
  }
  if (oppNil !== undefined && (w.p === oppNil || !trick.some(t => t.p === oppNil))) return losers.length ? (w.p === oppNil ? high(losers) : low(losers)) : low(L);
  if (w.p === partner && (last || boss(w.c) || sk < .4)) return losers.length ? (avoidBags ? high(losers) : low(losers)) : low(L);
  if (avoidBags) return losers.length ? high(losers) : low(L);
  if (winners.length) {
    const cheap = low(winners);
    if (last || boss(cheap) || suit(cheap) === SPADE && suit(w.c) !== SPADE) return cheap;
    const b = winners.filter(boss); return b.length ? low(b) : cheap;
  }
  // can't win: throw the lowest card, from the shortest side suit when void (sets up ruffs)
  if (sk >= .5 && suit(L[0]) !== led) {
    const counts = [0, 0, 0, 0]; hand.forEach(c => counts[suit(c)]++);
    const side = L.filter(c => suit(c) !== SPADE);
    if (side.length) return low(side.filter(c => counts[suit(c)] === Math.min(...side.map(x => counts[suit(x)]))));
  }
  return low(nonSpade(L));
}

// ---------- game ----------
export default {
  id: 'spades',
  name: 'Spades',
  description: 'You and your partner against two rivals. They get sharper every level.',
  color: '--lilac',
  icon: '<svg viewBox="0 0 40 40" fill="currentColor"><path d="M20 4C14 12 6 16 6 23a7 7 0 0 0 12 4.8L16 36h8l-2-8.2A7 7 0 0 0 34 23c0-7-8-11-14-19z"/></svg>',
  levels: LEVELS,
  art: `<svg viewBox="0 0 100 100"><ellipse cx="50" cy="54" rx="44" ry="36" fill="#9A5B2E" stroke="#0D0920" stroke-width="4"/><ellipse cx="50" cy="54" rx="35" ry="27" fill="#24905C" stroke="#0D0920" stroke-width="3"/>
    <g transform="rotate(-14 38 50)"><rect x="24" y="30" width="26" height="36" rx="4" fill="#FFFDF7" stroke="#0D0920" stroke-width="3"/><text x="29" y="44" font-size="13" font-weight="700" font-family="Fredoka,sans-serif" fill="#1E1438">A</text><path d="M37 50c-3 4-7 6-7 9.5a3.5 3.5 0 0 0 6 2.4L35 66h4l-1-4.1a3.5 3.5 0 0 0 6-2.4c0-3.5-4-5.5-7-9.5z" fill="#1E1438"/></g>
    <g transform="rotate(12 62 50)"><rect x="50" y="30" width="26" height="36" rx="4" fill="#FFFDF7" stroke="#0D0920" stroke-width="3"/><text x="55" y="44" font-size="13" font-weight="700" font-family="Fredoka,sans-serif" fill="#D23B3B">K</text><path d="M63 62s-8-5-8-10a4 4 0 0 1 8-1.5 4 4 0 0 1 8 1.5c0 5-8 10-8 10z" fill="#D23B3B"/></g></svg>`,
  css: `
.sp{flex:1;min-height:0;display:flex;flex-direction:column}
.sp-table{flex:1;min-height:0;position:relative;margin:10px 24px 20px;border-radius:46px;border:3px solid var(--outline);
  background:radial-gradient(ellipse at 50% 42%,#33AE74 0%,#228452 50%,#145638 100%);
  box-shadow:0 0 0 11px #9A5B2E,0 0 0 14px var(--outline),0 9px 0 14px var(--outline),inset 0 0 50px rgba(0,0,0,.45),inset 0 0 0 2px rgba(255,255,255,.08)}
.sp-table::before{content:"♠";position:absolute;left:50%;top:55%;transform:translate(-50%,-50%);font-size:120px;line-height:1;color:rgba(0,0,0,.13);pointer-events:none}
.sp-seat{position:absolute;display:flex;flex-direction:column;align-items:center;gap:3px;z-index:1}
.sp-av{--c:var(--sky);width:42px;height:42px;border-radius:50%;display:grid;place-items:center;font-weight:600;font-size:19px;color:var(--on-accent);
  background:radial-gradient(circle at 35% 30%,#fff6,transparent 50%),var(--c);border:3px solid var(--outline);box-shadow:0 3px 0 var(--outline)}
.sp-seat.turn .sp-av{animation:turnring 1s ease-in-out infinite alternate}
@keyframes turnring{to{box-shadow:0 3px 0 var(--outline),0 0 0 5px rgba(255,210,90,.85)}}
.sp-nm{font-size:13px;font-weight:600;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.45)}
.sp-chips{display:flex;gap:3px}
.sp-chips span{background:rgba(5,25,15,.55);color:#fff;border-radius:999px;padding:1px 7px;font-size:12px;font-weight:500;white-space:nowrap}
.sp-chips span b{color:var(--butter);font-weight:600}
.sp-n{top:8px;left:50%;transform:translateX(-50%);display:grid;grid-template-columns:auto auto;align-items:center;column-gap:6px;row-gap:2px}
.sp-n .sp-av{--c:var(--mint);grid-row:span 3;width:38px;height:38px;font-size:17px}
.sp-n .sp-nm,.sp-n .sp-chips,.sp-n .sp-backs{justify-self:start}
.sp-w{left:6px;top:8px} .sp-w .sp-av{--c:var(--peach)}
.sp-e{right:6px;top:8px} .sp-e .sp-av{--c:var(--sky)}
.sp-w .sp-chips,.sp-e .sp-chips{flex-direction:column;align-items:center}
.sp-s{bottom:10px;left:50%;transform:translateX(-50%);flex-direction:row;gap:6px} .sp-s .sp-av{--c:var(--butter);width:34px;height:34px;font-size:15px}
.sp-backs{display:flex;justify-content:center;height:15px;padding-left:4px}
.sp-backs i{width:10px;height:15px;border-radius:2px;margin-left:-4px;border:1.5px solid var(--outline);
  background:repeating-linear-gradient(45deg,#7B5CE0 0 2px,#5B3FC0 2px 4px)}
.sp-trick{position:absolute;left:50%;top:55%;width:0;height:0}
.sp-trick .card{position:absolute;transform:translate(-50%,-50%);transition:translate .35s ease-in,opacity .35s ease-in}
.sp-trick .t0{transform:translate(-50%,8%)}
.sp-trick .t1{transform:translate(-145%,-50%) rotate(-6deg)}
.sp-trick .t2{transform:translate(-50%,-108%) rotate(3deg)}
.sp-trick .t3{transform:translate(45%,-50%) rotate(6deg)}
.sp-trick .fly.t0{animation:in0 .3s cubic-bezier(.2,.9,.3,1.15)} @keyframes in0{from{translate:0 200px;opacity:.3}}
.sp-trick .fly.t1{animation:in1 .3s cubic-bezier(.2,.9,.3,1.15)} @keyframes in1{from{translate:-160px 0;opacity:.3}}
.sp-trick .fly.t2{animation:in2 .3s cubic-bezier(.2,.9,.3,1.15)} @keyframes in2{from{translate:0 -170px;opacity:.3}}
.sp-trick .fly.t3{animation:in3 .3s cubic-bezier(.2,.9,.3,1.15)} @keyframes in3{from{translate:160px 0;opacity:.3}}
.sp-trick.to0 .card{translate:0 220px;opacity:0} .sp-trick.to1 .card{translate:-200px 0;opacity:0}
.sp-trick.to2 .card{translate:0 -200px;opacity:0} .sp-trick.to3 .card{translate:200px 0;opacity:0}
.sp-rail{position:relative;background:linear-gradient(180deg,#A0612F,#7A431F);border-top:3px solid var(--outline);box-shadow:inset 0 3px 0 rgba(255,255,255,.2)}
.sp-msg{position:absolute;left:50%;top:0;transform:translate(-50%,-60%);z-index:2;background:var(--butter);color:var(--on-accent);font-size:15px;font-weight:600;
  padding:3px 14px;border-radius:999px;white-space:nowrap;border:2.5px solid var(--outline);box-shadow:0 3px 0 var(--outline)}
.sp-msg:empty{display:none}
.card{width:var(--cw,48px);height:calc(var(--cw,48px)*1.4);border-radius:9px;background:linear-gradient(180deg,#FFFFFF,#F5F0E4);color:#1E1438;
  border:2.5px solid var(--outline);box-shadow:0 3px 0 rgba(0,0,0,.4);position:relative;display:block;padding:0;font-family:inherit;flex:none}
.card.red{color:#D23B3B}
.card .r{position:absolute;left:5px;top:3px;font-size:calc(var(--cw,48px)*.36);font-weight:600;line-height:1}
.card .s{position:absolute;left:5px;top:calc(var(--cw,48px)*.4);font-size:calc(var(--cw,48px)*.3);line-height:1}
.card .pip{position:absolute;right:4px;bottom:2px;font-size:calc(var(--cw,48px)*.58);line-height:1}
.sp-hand{display:grid;grid-template-columns:repeat(7,1fr);gap:8px 4px;padding:16px 10px 12px;justify-items:center}
.sp-hand .card{transition:transform .12s,filter .15s}
.sp-hand .card.ok{transform:translateY(-5px);box-shadow:0 3px 0 rgba(0,0,0,.4),0 0 0 3px var(--butter)}
.sp-hand .card.ok:active{transform:translateY(-1px)}
.sp-hand .card.no{filter:brightness(.62) saturate(.6)}
.sp-bids{display:grid;grid-template-columns:repeat(5,1fr);gap:10px 8px}
.sp-bids .btn{padding:9px 0;font-size:18px}
.sp-sum{width:100%;border-collapse:separate;border-spacing:0;font-size:15px;color:var(--ink);background:rgba(0,0,0,.18);border-radius:14px;overflow:hidden}
.sp-sum th,.sp-sum td{padding:7px 8px;text-align:right}
.sp-sum th:first-child,.sp-sum td:first-child{text-align:left}
.sp-sum th{color:var(--muted);font-weight:500;font-size:13px}
.sp-sum tr+tr td{border-top:1px solid rgba(255,255,255,.08)}
.sp-sum .pos{color:var(--mint)} .sp-sum .neg{color:var(--peach)}`,

  init(el) {
    const prog = progress('spades');
    el.innerHTML = `<div class="gbar"><span class="stat"></span><button class="ibtn menu" aria-label="Menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button></div>
      <div class="sp"><div class="sp-table">
        <div class="sp-seat sp-n" data-p="2"></div><div class="sp-seat sp-w" data-p="1"></div><div class="sp-seat sp-e" data-p="3"></div>
        <div class="sp-trick"></div><div class="sp-seat sp-s" data-p="0"></div>
      </div><div class="sp-rail"><div class="sp-msg" aria-live="polite"></div><div class="sp-hand"></div></div></div>`;
    const $ = q => el.querySelector(q), stat = $('.stat'), trickEl = $('.sp-trick'), msg = $('.sp-msg'), handEl = $('.sp-hand');
    const seats = [...el.querySelectorAll('.sp-seat')].sort((a, b) => a.dataset.p - b.dataset.p);
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };
    let s = loadSave('spades'), closePanel = null;

    const cardHTML = c => `<span class="r">${RANKS[rank(c)]}</span><span class="s">${SUITS[suit(c)]}</span><span class="pip">${SUITS[suit(c)]}</span>`;
    const cardLabel = c => `${RANKS[rank(c)]} of ${['clubs', 'diamonds', 'hearts', 'spades'][suit(c)]}`;
    const save = () => writeSave('spades', s);

    function newGame(level) {
      prog.play(level);
      s = { level, scores: [0, 0], bags: [0, 0], dealer: Math.floor(Math.random() * 4), handNo: 0 };
      newHand();
    }
    function newHand() {
      s.dealer = (s.dealer + 1) % 4; s.handNo++;
      Object.assign(s, { hands: shuffleDeal(), bids: [null, null, null, null], tricks: [0, 0, 0, 0], trick: [], played: [], broken: false, phase: 'bid', turn: (s.dealer + 1) % 4, lastTrick: null });
      save(); render(); step();
    }

    function render() {
      const R = levelRules(s.level);
      stat.innerHTML = pills([{ label: 'Lv', value: s.level, cls: 'lvl' }, { label: 'Us', value: s.scores[0], cls: 'star' }, { label: 'Them', value: s.scores[1] }, { label: 'Goal', value: R.target }]);
      seats.forEach((e, p) => {
        const bid = s.bids[p] === null ? (s.phase === 'bid' ? '…' : '') : s.bids[p] === 0 ? 'Nil' : s.bids[p];
        e.classList.toggle('turn', s.turn === p && s.phase !== 'done');
        const chips = bid === '' ? '' : `<div class="sp-chips"><span>Bid <b>${bid}</b></span><span>Won <b>${s.tricks[p]}</b></span></div>`;
        e.innerHTML = `<div class="sp-av" aria-hidden="true">${'YWPE'[p]}</div>` + (p ? `<div class="sp-nm">${NAMES[p]}</div>` : '') + chips +
          (p && s.hands ? `<div class="sp-backs">${'<i></i>'.repeat(Math.min(13, s.hands[p].length))}</div>` : '');
      });
      // Trick: keep cards already on the table; new ones fly in from their player.
      if (s.turn !== -1) trickEl.className = 'sp-trick'; // clears the slide-to-winner class once the next trick starts
      const want = s.trick.map(t => t.c);
      [...trickEl.children].forEach(ch => { if (!want.includes(+ch.dataset.c)) ch.remove(); });
      for (const t of s.trick) {
        if (trickEl.querySelector(`[data-c="${t.c}"]`)) continue;
        const d = document.createElement('div'); d.dataset.c = t.c;
        d.className = `card t${t.p} fly${RED(t.c) ? ' red' : ''}`; d.setAttribute('aria-label', `${NAMES[t.p]}: ${cardLabel(t.c)}`); d.innerHTML = cardHTML(t.c);
        trickEl.append(d);
      }
      const L = s.phase === 'play' && s.turn === 0 ? legal(s.hands[0], s.trick, s.broken) : [];
      const w = handEl.clientWidth || el.clientWidth;
      handEl.style.setProperty('--cw', Math.min(64, Math.floor((w - 24 - 6 * 4) / 7)) + 'px');
      trickEl.style.setProperty('--cw', Math.min(58, Math.floor(w / 7.4), Math.floor(trickEl.parentElement.clientHeight / 6.2)) + 'px');
      handEl.innerHTML = '';
      for (const c of s.hands[0]) {
        const b = document.createElement('button');
        b.className = 'card' + (RED(c) ? ' red' : '') + (L.length ? (L.includes(c) ? ' ok' : ' no') : '');
        b.innerHTML = cardHTML(c); b.setAttribute('aria-label', cardLabel(c));
        b.disabled = !L.includes(c);
        b.onclick = () => { ac(); play(0, c); };
        handEl.append(b);
      }
      msg.textContent = s.phase === 'bid' ? (s.turn === 0 ? '' : `${NAMES[s.turn]} is bidding…`)
        : s.phase === 'play' ? (s.turn === 0 ? (s.trick.length ? 'Your turn' : 'Your lead') : '') : '';
    }

    function step() {
      if (s.phase === 'bid') {
        if (s.bids.every(b => b !== null)) { s.phase = 'play'; s.turn = (s.dealer + 1) % 4; save(); render(); return step(); }
        if (s.turn === 0) return askBid();
        later(() => { s.bids[s.turn] = aiBid(s, s.turn); click(800, .02, .12, 'triangle'); s.turn = (s.turn + 1) % 4; save(); render(); step(); }, 650);
      } else if (s.phase === 'play' && s.turn !== 0) {
        later(() => play(s.turn, aiPlay(s, s.turn)), 600);
      }
    }

    function askBid() {
      const est = Math.max(1, Math.round(estimate(s.hands[0])));
      const others = [1, 2, 3].filter(p => s.bids[p] !== null).map(p => `${NAMES[p]} ${s.bids[p] === 0 ? 'Nil' : s.bids[p]}`).join(' · ');
      let html = `<p>${others ? others + '. ' : ''}Your hand looks good for about <b>${est}</b>.</p><div class="sp-bids">`;
      html += `<button class="btn" data-b="0">Nil</button>`;
      for (let b = 1; b <= 13; b++) html += `<button class="btn${b === est ? ' primary' : ''}" data-b="${b}">${b}</button>`;
      html += '</div>';
      closePanel = panel(el.querySelector('.sp-table'), { title: 'Your bid', html });
      el.querySelectorAll('.sp-bids .btn').forEach(b => b.onclick = () => {
        ac(); closePanel(); closePanel = null;
        s.bids[0] = +b.dataset.b; s.turn = 1; click(900, .03, .2, 'triangle'); save(); render(); step();
      });
    }

    function play(p, c) {
      if (s.phase !== 'play' || s.turn !== p) return;
      if (!legal(s.hands[p], s.trick, s.broken).includes(c)) return;
      s.hands[p] = s.hands[p].filter(x => x !== c);
      s.trick.push({ p, c }); s.played.push(c);
      if (suit(c) === SPADE) s.broken = true;
      click(p === 0 ? 650 : 520, .025, .2, 'triangle'); if (p === 0) buzz(8);
      if (s.trick.length < 4) { s.turn = (p + 1) % 4; save(); render(); return step(); }
      s.turn = -1; save(); render(); // saved with the full trick, so closing the app now loses nothing
      resolveTrick();
    }

    function resolveTrick() {
      const w = trickWinner(s.trick).p;
      msg.textContent = w === 0 ? 'You take it' : `${NAMES[w]} takes it`;
      if (team(w) === 0) tone(w === 0 ? 659 : 587); else click(300, .08, .2, 'sine');
      later(() => trickEl.classList.add('to' + w), 750); // cards slide to the winner
      later(() => {
        s.tricks[w]++; s.lastTrick = s.trick; s.trick = []; s.turn = w;
        if (!s.hands[0].length) return endHand();
        save(); render(); step();
      }, 1050);
    }

    function endHand() {
      const rows = scoreHand(s.bids, s.tricks, s.scores, s.bags);
      s.phase = 'done'; save(); render();
      const R = levelRules(s.level), [us, them] = s.scores;
      const over = (us >= R.target || them >= R.target || us <= -200) && us !== them;
      const row = (name, r, t) => `<tr><td>${name}</td><td>${r.bid}</td><td>${r.won}</td><td class="${r.pts >= 0 ? 'pos' : 'neg'}">${r.pts > 0 ? '+' : ''}${r.pts}</td><td><b>${s.scores[t]}</b></td></tr>`;
      let html = `<table class="sp-sum"><tr><th></th><th>Bid</th><th>Won</th><th>Pts</th><th>Total</th></tr>${row('Us', rows[0], 0)}${row('Them', rows[1], 1)}</table>`;
      const notes = [];
      rows.forEach((r, t) => { if (r.penalty) notes.push(`${t ? 'They' : 'You'} hit 10 bags: −${r.penalty}.`); });
      html += `<p style="margin-top:10px">Bags: us ${s.bags[0]}, them ${s.bags[1]}. ${notes.join(' ')}</p>`;
      if (!over) { panel(el, { title: `Hand ${s.handNo}`, html, buttons: [{ label: 'Next hand', primary: true, onClick: newHand }] }); return; }

      const won = us > them && us > -200;
      if (won) {
        const stars = us - them >= 120 ? 3 : us - them >= 50 ? 2 : 1;
        prog.complete(s.level, stars); [523, 659, 784, 1047].forEach((f, i) => later(() => tone(f), i * 120)); buzz(40);
        const last = s.level >= LEVELS;
        html = `${starsHTML(stars)}<p style="text-align:center">You won <b>${us}</b> to ${them}.${last ? ' That was the toughest table.' : ' The next table plays sharper.'}</p>` + html;
        writeSave('spades', null);
        panel(el, { title: `Level ${s.level} won!`, mood: 'win', html, buttons: [
          { label: 'Levels', onClick: pick },
          last ? { label: 'Play again', primary: true, onClick: () => newGame(s.level) } : { label: 'Next level', primary: true, onClick: () => newGame(s.level + 1) }] });
      } else {
        click(200, .3, .25, 'sine'); writeSave('spades', null);
        panel(el, { title: 'They won this one', mood: 'lose', html: `<p style="text-align:center">${them} to <b>${us}</b>. Have another go.</p>` + html,
          buttons: [{ label: 'Levels', onClick: pick }, { label: 'Try again', primary: true, onClick: () => newGame(s.level) }] });
      }
    }

    // Stop pending AI moves and close any open panel before starting over.
    const restart = lv => { for (const t of timers) clearTimeout(t); timers.clear(); el.querySelectorAll('.ov').forEach(o => o.remove()); newGame(lv); };
    function pick() { levelPicker(el, { count: LEVELS, prog, onPick: restart }); }
    $('.menu').onclick = () => {
      const R = levelRules(s.level);
      panel(el, {
        title: 'Spades', dismissable: true,
        html: `<p>Level ${s.level}: first team to ${R.target} wins. Nil is worth 100, made bids 10 a trick, and every 10 overtricks (bags) costs 100.</p>` +
          (s.lastTrick ? `<p>Last trick: ${s.lastTrick.map(t => `${NAMES[t.p]} ${RANKS[rank(t.c)]}${SUITS[suit(t.c)]}`).join(', ')}</p>` : ''),
        buttons: [{ label: 'Levels', onClick: pick }, { label: 'Restart level', onClick: () => restart(s.level) }, { label: 'Back', primary: true }],
      });
    };

    const ro = new ResizeObserver(() => s && s.hands && render()); ro.observe(handEl);
    // Resume a saved game. A hand that had finished was already scored, so deal the next one.
    if (s && s.hands && s.phase !== 'done') { render(); s.trick.length === 4 ? resolveTrick() : step(); }
    else if (s && s.hands) newHand();
    else newGame(prog.last);
    return () => { for (const t of timers) clearTimeout(t); ro.disconnect(); };
  },
};
