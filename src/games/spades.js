// Spades: you (South) and an AI partner (North) against West and East.
// Standard rules: follow suit, spades are trump and can't be led until broken,
// nil bids (+/-100), 10*bid for a made contract, overtricks are bags and every
// 10 bags costs 100. Each level is one game to a target score; opponents get
// sharper each level (fewer slips, card counting, ducking bags, attacking nil).
// The game in progress is saved after every card, so closing the app is safe.
import { ac, buzz, click, tone } from '../lib/sound.js';
import { progress, loadSave, writeSave } from '../lib/progress.js';
import { panel, levelPicker, starText } from '../lib/ui.js';

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
  css: `
.sp{flex:1;min-height:0;display:flex;flex-direction:column}
.sp-table{flex:1;min-height:0;position:relative}
.sp-seat{position:absolute;text-align:center;font-size:13px;color:var(--muted);line-height:1.25}
.sp-seat b{display:block;color:var(--ink);font-size:14px;font-weight:600}
.sp-seat.turn b{color:var(--c,var(--lilac))}
.sp-seat.turn b::after{content:" •"}
.sp-n{top:6px;left:50%;transform:translateX(-50%)}
.sp-w{left:12px;top:42%;transform:translateY(-50%)}
.sp-e{right:12px;top:42%;transform:translateY(-50%)}
.sp-s{bottom:4px;left:50%;transform:translateX(-50%)}
.sp-backs{display:flex;justify-content:center;margin-top:4px;height:16px}
.sp-backs i{width:9px;height:14px;border-radius:2px;margin-left:-3px;background:var(--lilac);border:1px solid var(--surface)}
.sp-trick{position:absolute;left:50%;top:42%;width:0;height:0}
.sp-trick .card{position:absolute;transform:translate(-50%,-50%);transition:transform .25s,opacity .3s}
.sp-trick .t0{transform:translate(-50%,8%)}
.sp-trick .t1{transform:translate(-145%,-50%)}
.sp-trick .t2{transform:translate(-50%,-108%)}
.sp-trick .t3{transform:translate(45%,-50%)}
.sp-trick.gone .card{opacity:0}
.sp-msg{position:absolute;left:0;right:0;bottom:30px;text-align:center;color:var(--muted);font-size:15px;min-height:20px}
.card{width:var(--cw,48px);height:calc(var(--cw,48px)*1.4);border-radius:8px;background:#fff;color:#2A2440;border:1px solid #D8D2EA;box-shadow:0 2px 4px rgba(0,0,0,.12);
  position:relative;display:block;padding:0;font-family:inherit;flex:none}
.card.red{color:#D23B3B}
.card .r{position:absolute;left:5px;top:3px;font-size:calc(var(--cw,48px)*.36);font-weight:600;line-height:1}
.card .s{position:absolute;left:5px;top:calc(var(--cw,48px)*.4);font-size:calc(var(--cw,48px)*.32);line-height:1}
.card .big{position:absolute;right:5px;bottom:3px;font-size:calc(var(--cw,48px)*.55);line-height:1;opacity:.9}
.sp-hand{display:grid;grid-template-columns:repeat(7,1fr);gap:6px 4px;padding:6px 12px 12px;justify-items:center}
.sp-hand .card{transition:transform .12s,opacity .15s}
.sp-hand .card.ok{box-shadow:0 0 0 2px var(--lilac),0 2px 4px rgba(0,0,0,.12)}
.sp-hand .card.ok:active{transform:translateY(-4px)}
.sp-hand .card.no{opacity:.45}
.sp-bids{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
.sp-bids .btn{padding:10px 0;font-size:17px}
.sp-sum{width:100%;border-collapse:collapse;font-size:15px;color:var(--ink)}
.sp-sum th,.sp-sum td{padding:5px 4px;text-align:right;border-bottom:1px solid var(--line)}
.sp-sum th:first-child,.sp-sum td:first-child{text-align:left}
.sp-sum th{color:var(--muted);font-weight:500}`,

  init(el) {
    const prog = progress('spades');
    el.innerHTML = `<div class="gbar"><span class="stat"></span><button class="btn menu">Menu</button></div>
      <div class="sp"><div class="sp-table">
        <div class="sp-seat sp-n" data-p="2"></div><div class="sp-seat sp-w" data-p="1"></div><div class="sp-seat sp-e" data-p="3"></div>
        <div class="sp-trick"></div><div class="sp-msg"></div><div class="sp-seat sp-s" data-p="0"></div>
      </div><div class="sp-hand"></div></div>`;
    const $ = q => el.querySelector(q), stat = $('.stat'), trickEl = $('.sp-trick'), msg = $('.sp-msg'), handEl = $('.sp-hand');
    const seats = [...el.querySelectorAll('.sp-seat')].sort((a, b) => a.dataset.p - b.dataset.p);
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };
    let s = loadSave('spades'), closePanel = null;

    const cardHTML = c => `<span class="r">${RANKS[rank(c)]}</span><span class="s">${SUITS[suit(c)]}</span><span class="big">${SUITS[suit(c)]}</span>`;
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
      stat.innerHTML = `Level <b>${s.level}</b> · Us <b>${s.scores[0]}</b> · Them <b>${s.scores[1]}</b> · to ${R.target}`;
      seats.forEach((e, p) => {
        const bid = s.bids[p] === null ? (s.phase === 'bid' ? '…' : '') : s.bids[p] === 0 ? 'Nil' : s.bids[p];
        e.classList.toggle('turn', s.turn === p && s.phase !== 'done');
        e.innerHTML = `<b>${NAMES[p]}</b>${bid === '' ? '' : `Bid ${bid} · Won ${s.tricks[p]}`}` +
          (p && s.hands ? `<div class="sp-backs">${'<i></i>'.repeat(Math.min(13, s.hands[p].length))}</div>` : '');
      });
      trickEl.classList.remove('gone');
      trickEl.innerHTML = s.trick.map(t => `<div class="card t${t.p}${RED(t.c) ? ' red' : ''}" aria-label="${NAMES[t.p]}: ${cardLabel(t.c)}">${cardHTML(t.c)}</div>`).join('');
      const L = s.phase === 'play' && s.turn === 0 ? legal(s.hands[0], s.trick, s.broken) : [];
      const w = handEl.clientWidth || el.clientWidth;
      handEl.style.setProperty('--cw', Math.min(64, Math.floor((w - 24 - 6 * 4) / 7)) + 'px');
      trickEl.style.setProperty('--cw', Math.min(60, Math.floor(w / 7)) + 'px');
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
      later(() => trickEl.classList.add('gone'), 750);
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
      const row = (name, r, t) => `<tr><td>${name}</td><td>${r.bid}</td><td>${r.won}</td><td>${r.pts > 0 ? '+' : ''}${r.pts}</td><td>${s.scores[t]}</td></tr>`;
      let html = `<table class="sp-sum"><tr><th></th><th>Bid</th><th>Won</th><th>Pts</th><th>Total</th></tr>${row('Us', rows[0], 0)}${row('Them', rows[1], 1)}</table>`;
      const notes = [];
      rows.forEach((r, t) => { if (r.penalty) notes.push(`${t ? 'They' : 'You'} hit 10 bags: −${r.penalty}.`); });
      html += `<p style="margin-top:10px">Bags: us ${s.bags[0]}, them ${s.bags[1]}. ${notes.join(' ')}</p>`;
      if (!over) { panel(el.querySelector('.sp-table'), { title: `Hand ${s.handNo}`, html, buttons: [{ label: 'Next hand', primary: true, onClick: newHand }] }); return; }

      const won = us > them && us > -200;
      if (won) {
        const stars = us - them >= 120 ? 3 : us - them >= 50 ? 2 : 1;
        prog.complete(s.level, stars); [523, 659, 784, 1047].forEach((f, i) => later(() => tone(f), i * 120)); buzz(40);
        const last = s.level >= LEVELS;
        html = `<div class="big">${starText(stars)}</div><p>You won ${us} to ${them}.${last ? ' That was the toughest table.' : ' The next table plays sharper.'}</p>` + html;
        writeSave('spades', null);
        panel(el.querySelector('.sp-table'), { title: `Level ${s.level} won`, html, buttons: [
          { label: 'Levels', onClick: pick },
          last ? { label: 'Play again', primary: true, onClick: () => newGame(s.level) } : { label: 'Next level', primary: true, onClick: () => newGame(s.level + 1) }] });
      } else {
        click(200, .3, .25, 'sine'); writeSave('spades', null);
        panel(el.querySelector('.sp-table'), { title: 'They won this one', html: `<p>${them} to ${us}.</p>` + html,
          buttons: [{ label: 'Levels', onClick: pick }, { label: 'Try again', primary: true, onClick: () => newGame(s.level) }] });
      }
    }

    // Stop pending AI moves and close any open panel before starting over.
    const restart = lv => { for (const t of timers) clearTimeout(t); timers.clear(); el.querySelectorAll('.ov').forEach(o => o.remove()); newGame(lv); };
    function pick() { levelPicker(el.querySelector('.sp-table'), { count: LEVELS, prog, onPick: restart }); }
    $('.menu').onclick = () => {
      const R = levelRules(s.level);
      panel(el.querySelector('.sp-table'), {
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
