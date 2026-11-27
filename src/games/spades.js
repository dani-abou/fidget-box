// Spades: you (South) and an AI partner (North) against West and East.
// Standard rules: follow suit, spades are trump and can't be led until broken,
// nil bids (+/-100), 10*bid for a made contract, overtricks are bags and every
// 10 bags costs 100. Each level is one game (to 500 unless changed in settings); opponents get
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
// "Game to" is a setting (menu), 500 by default; levels only change how sharp the rivals are.
export const TARGETS = [150, 250, 300, 500];
const getTarget = () => { const t = loadSave('spades-target'); return TARGETS.includes(t) ? t : 500; };
export const levelRules = n => ({
  target: getTarget(),
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
// Hand order, left to right: diamonds, clubs, hearts, spades; low to high within a suit.
const SUIT_POS = [1, 0, 2, 3]; // indexed by suit: clubs, diamonds, hearts, spades
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

// ---------- characters and table talk ----------
// Your partner is always Ollie; each level seats a new pair of rivals.
const PARTNER = { name: 'Ollie', icon: '🦉', color: '#4FE3B2' };
const YOU = { name: 'You', icon: '😎', color: '#FFD25A' };
const RIVALS = [
  [{ name: 'Pip', icon: '🐧', color: '#5EC6FF' }, { name: 'Bea', icon: '🐝', color: '#FFB547' }],
  [{ name: 'Momo', icon: '🐼', color: '#C9C2E8' }, { name: 'Rex', icon: '🦖', color: '#7BD96B' }],
  [{ name: 'Kiki', icon: '🐨', color: '#A9B7D0' }, { name: 'Taco', icon: '🐶', color: '#E8B27A' }],
  [{ name: 'Luna', icon: '🐱', color: '#FF9EC4' }, { name: 'Bolt', icon: '🦊', color: '#FF8A4C' }],
  [{ name: 'Fizz', icon: '🐸', color: '#8FE36B' }, { name: 'Nova', icon: '🦄', color: '#D9A6FF' }],
  [{ name: 'Duke', icon: '🐻', color: '#C08A5B' }, { name: 'Zara', icon: '🦓', color: '#E6E6E6' }],
  [{ name: 'Ace', icon: '🦁', color: '#FFC64F' }, { name: 'Vex', icon: '🐍', color: '#6FD6A0' }],
  [{ name: 'Bruno', icon: '🐗', color: '#B98E7A' }, { name: 'Ivy', icon: '🦚', color: '#4FC9C0' }],
  [{ name: 'Shade', icon: '🐺', color: '#9AA4C4' }, { name: 'Talon', icon: '🦅', color: '#D9A066' }],
  [{ name: 'Drake', icon: '🐉', color: '#5FD68A' }, { name: 'Fin', icon: '🦈', color: '#7FB4E8' }],
];
const cast = level => { const [w, e] = RIVALS[(level - 1) % RIVALS.length]; return [YOU, w, PARTNER, e]; };
const pick = a => a[Math.floor(Math.random() * a.length)];
const LINES = {
  nilBid: ['Going nil! 🤞', 'Nil. Watch me 😇', 'Nil… gulp 😬'],
  bigBid: ['Big hand 💪', 'Easy 😎', "Let's go! 🔥"],
  trump: ['Trumped! ♠️', 'Cut! ✂️', '😎', 'Mine! 😏'],
  trumped: ['😤', 'Hey! 😠', 'Rude 🙄'],
  nilBust: ['Noooo 😱', 'My nil! 💔', 'Ugh 😩'],
  nilBustGloat: ['😏', 'Gotcha! 😈', 'Hehe 😜'],
  praise: ['Nice! 👏', 'Great play 🙌', '👍'],
  made: ['Bid made ✅', 'Done! 😌', 'Safe 🙂'],
  set: ['Set! 😫', 'Oof 😣', 'So close 😔'],
  setGloat: ['Gotcha 😏', 'Set you! 😈', '🎯'],
  bags: ['Bags! 🎒😬', 'Too many bags 🙈'],
  idle: ['🤔', '🍿', '☕', 'Hmm…', '😴', '🎵'],
  win: ['GG! 🎉', 'Woo! 🥳', 'Team! 🙌'],
  lose: ['Rematch? 😤', 'GG 😭', 'Next time 😑'],
  bidReply: ['Got your back 🛡️', 'Ok partner 👌', 'Nice bid 👍'],
};
const EMOTES = ['👍', '😂', '😮', '😤', '🎉', '🙏'];

// ---------- game ----------
export default {
  id: 'spades',
  name: 'Spades',
  description: 'You and Ollie the owl against a new pair of rivals each level. They get sharper every time.',
  color: '--lilac',
  icon: '<svg viewBox="0 0 40 40" fill="currentColor"><path d="M20 4C14 12 6 16 6 23a7 7 0 0 0 12 4.8L16 36h8l-2-8.2A7 7 0 0 0 34 23c0-7-8-11-14-19z"/></svg>',
  levels: LEVELS,
  art: `<svg viewBox="0 0 100 100"><ellipse cx="50" cy="54" rx="44" ry="36" fill="#9A5B2E" stroke="#0D0920" stroke-width="4"/><ellipse cx="50" cy="54" rx="35" ry="27" fill="#24905C" stroke="#0D0920" stroke-width="3"/>
    <g transform="rotate(-14 38 50)"><rect x="24" y="30" width="26" height="36" rx="4" fill="#FFFDF7" stroke="#0D0920" stroke-width="3"/><text x="29" y="44" font-size="13" font-weight="700" font-family="Fredoka,sans-serif" fill="#1E1438">A</text><path d="M37 50c-3 4-7 6-7 9.5a3.5 3.5 0 0 0 6 2.4L35 66h4l-1-4.1a3.5 3.5 0 0 0 6-2.4c0-3.5-4-5.5-7-9.5z" fill="#1E1438"/></g>
    <g transform="rotate(12 62 50)"><rect x="50" y="30" width="26" height="36" rx="4" fill="#FFFDF7" stroke="#0D0920" stroke-width="3"/><text x="55" y="44" font-size="13" font-weight="700" font-family="Fredoka,sans-serif" fill="#D23B3B">K</text><path d="M63 62s-8-5-8-10a4 4 0 0 1 8-1.5 4 4 0 0 1 8 1.5c0 5-8 10-8 10z" fill="#D23B3B"/></g></svg>`,
  css: `
.sp{flex:1;min-height:0;display:flex;flex-direction:column;position:relative;overflow:hidden;overflow:clip;
  background:repeating-linear-gradient(92deg,#8A4E26 0 14px,#93552B 14px 20px,#814822 20px 34px);border-top:3px solid var(--outline)}
.sp-table{flex:1;min-height:0;position:relative}
.sp-felt{position:absolute;inset:44px 12px -40px;border-radius:70px 70px 0 0;border:4px solid #5C3216;
  background:radial-gradient(ellipse at 50% 40%,#3DB979 0%,#26904F 55%,#17623A 100%);box-shadow:inset 0 0 0 3px rgba(255,255,255,.07),inset 0 10px 40px rgba(0,0,0,.35),0 0 0 3px var(--outline)}
/* card backs */
.sp-back{position:absolute;width:40px;height:58px;border-radius:6px;border:2px solid #fff;box-shadow:0 0 0 2px var(--outline),0 2px 4px rgba(0,0,0,.4);
  background:radial-gradient(circle,#FFD25A 0 4px,transparent 5px),repeating-linear-gradient(45deg,#6B35D6 0 4px,#5124AE 4px 8px)}
.sp-fan{position:absolute;pointer-events:none}
.sp-fan-n{top:-22px;left:50%}
.sp-fan-w{left:-20px;top:44%} .sp-fan-e{right:-20px;top:44%}
/* players */
.sp-seat{position:absolute;z-index:2;display:flex;flex-direction:column;align-items:center;gap:3px}
.sp-av{width:54px;height:54px;border-radius:16px;display:grid;place-items:center;font-size:32px;line-height:1;background:var(--c);
  border:3px solid var(--outline);box-shadow:0 4px 0 var(--outline),inset 0 3px 0 rgba(255,255,255,.45),inset 0 -5px 0 rgba(0,0,0,.15);transition:transform .2s}
.sp-seat.turn .sp-av{animation:turnring 1s ease-in-out infinite alternate}
@keyframes turnring{to{box-shadow:0 4px 0 var(--outline),0 0 0 5px rgba(255,210,90,.9),0 0 22px rgba(255,210,90,.6)}}
.sp-tag{font-size:12px;font-weight:600;color:#fff;background:rgba(5,25,15,.65);border-radius:999px;padding:1px 9px;white-space:nowrap}
.sp-tag b{color:var(--butter)}
.sp-n{top:46px;left:50%;transform:translateX(-50%)}
.sp-w{left:26px;top:40%;transform:translateY(-50%)}
.sp-e{right:26px;top:40%;transform:translateY(-50%)}
.sp-s{bottom:8px;left:50%;transform:translateX(-50%)}
.sp-s .sp-av{width:50px;height:50px;font-size:30px;cursor:pointer}
/* speech bubbles */
.sp-say{position:absolute;z-index:8;background:#fff;color:#1E1438;font-weight:600;font-size:15px;padding:6px 12px;border-radius:16px;border:3px solid var(--outline);
  box-shadow:0 4px 0 var(--outline);white-space:nowrap;pointer-events:none;animation:sayin .3s cubic-bezier(.3,1.7,.5,1)}
.sp-say.big{font-size:28px;padding:2px 10px}
.sp-say.out{animation:sayout .25s forwards}
@keyframes sayin{from{transform:scale(0);opacity:0}}
@keyframes sayout{to{transform:scale(.6);opacity:0}}
.sp-say::after{content:"";position:absolute;width:12px;height:12px;background:#fff;border:3px solid var(--outline);border-top:0;border-left:0}
.sp-say.at-n{top:52px;left:calc(50% + 36px);transform-origin:left top} .sp-say.at-n::after{left:-6px;top:10px;transform:rotate(135deg)}
.sp-say.at-w{top:calc(40% + 40px);left:10px;transform-origin:left top} .sp-say.at-w::after{left:16px;top:-8px;transform:rotate(-135deg)}
.sp-say.at-e{top:calc(40% + 40px);right:10px;transform-origin:right top} .sp-say.at-e::after{right:16px;top:-8px;transform:rotate(-135deg)}
.sp-say.at-s{bottom:34px;left:calc(50% + 36px);transform-origin:left bottom} .sp-say.at-s::after{left:-6px;bottom:10px;transform:rotate(135deg)}
/* score boxes */
.sp-score{position:absolute;z-index:3;min-width:84px;text-align:center;border-radius:14px;padding:4px 10px 6px;border:3px solid var(--outline);color:#fff;
  box-shadow:0 4px 0 var(--outline),inset 0 3px 0 rgba(255,255,255,.25)}
.sp-score small{display:block;font-size:12px;font-weight:600;opacity:.9;letter-spacing:.5px}
.sp-score b{display:block;font-size:26px;line-height:1.05}
.sp-score span{display:block;font-size:11px;opacity:.9}
.sp-them{top:6px;right:8px;background:linear-gradient(180deg,#C8404F,#962A3A)}
.sp-us{bottom:8px;left:8px;background:linear-gradient(180deg,#3F7BE0,#2A57AE)}
.sp-score.bump b{animation:pulse .3s 2 alternate}
/* trick */
.sp-trick{position:absolute;left:50%;top:52%;width:0;height:0;z-index:1}
.sp-trick .card{position:absolute;transform:translate(-50%,-50%);transition:translate .35s ease-in,opacity .35s ease-in}
.sp-trick .t0{transform:translate(-50%,6%)}
.sp-trick .t1{transform:translate(-140%,-50%) rotate(-7deg)}
.sp-trick .t2{transform:translate(-50%,-106%) rotate(3deg)}
.sp-trick .t3{transform:translate(40%,-50%) rotate(7deg)}
.sp-trick .fly.t0{animation:in0 .3s cubic-bezier(.2,.9,.3,1.15)} @keyframes in0{from{translate:0 260px;opacity:.3}}
.sp-trick .fly.t1{animation:in1 .3s cubic-bezier(.2,.9,.3,1.15)} @keyframes in1{from{translate:-170px 0;opacity:.3}}
.sp-trick .fly.t2{animation:in2 .3s cubic-bezier(.2,.9,.3,1.15)} @keyframes in2{from{translate:0 -190px;opacity:.3}}
.sp-trick .fly.t3{animation:in3 .3s cubic-bezier(.2,.9,.3,1.15)} @keyframes in3{from{translate:170px 0;opacity:.3}}
.sp-trick.to0 .card{translate:0 260px;opacity:0} .sp-trick.to1 .card{translate:-200px 0;opacity:0}
.sp-trick.to2 .card{translate:0 -200px;opacity:0} .sp-trick.to3 .card{translate:200px 0;opacity:0}
.sp-msg{position:absolute;left:50%;bottom:76px;transform:translateX(-50%);z-index:3;background:var(--butter);color:var(--on-accent);font-size:15px;font-weight:600;
  padding:3px 14px;border-radius:999px;white-space:nowrap;border:2.5px solid var(--outline);box-shadow:0 3px 0 var(--outline)}
.sp-msg:empty{display:none}
/* cards */
.card{width:var(--cw,56px);height:calc(var(--cw,56px)*1.42);border-radius:9px;background:linear-gradient(180deg,#FFFFFF,#F4EFE3);color:#1E1438;
  border:2.5px solid var(--outline);box-shadow:0 3px 0 rgba(0,0,0,.35);position:relative;display:block;padding:0;font-family:inherit;flex:none;overflow:hidden}
.card.red{color:#D9343F}
/* four-colour deck (colorblind setting): every suit its own colour */
.sp.fourc .card.su0{color:#1E9E55} .sp.fourc .card.su1{color:#2F6FE0} .sp.fourc .card.su2{color:#D9343F} .sp.fourc .card.su3{color:#1E1438}
.card .r{position:absolute;left:4px;top:1px;font-size:calc(var(--cw,56px)*.44);font-weight:600;line-height:1;letter-spacing:-1px}
.card .s{position:absolute;left:5px;top:calc(var(--cw,56px)*.45);font-size:calc(var(--cw,56px)*.36);line-height:1}
.card .pip{position:absolute;right:-6%;bottom:-8%;font-size:calc(var(--cw,56px)*.9);line-height:1;opacity:.95}
/* hand: a fan along an arc */
.sp-hand{position:relative;height:calc(var(--cw,70px)*1.42 + 26px);flex:none;z-index:4}
.sp-hand .card{position:absolute;bottom:6px;transform-origin:50% 130%;transition:transform .15s,filter .15s,bottom .15s;touch-action:none}
.sp-hand .card .r{font-size:var(--rk);letter-spacing:0} /* sized to the visible strip so Q, K and 10 aren't covered by the next card */
.sp-hand .card .s{top:calc(var(--rk) + 3px);font-size:calc(var(--rk) * .8)}
.card .r.ten{letter-spacing:-.08em;transform:scaleX(.8);transform-origin:left top}
.sp-hand .card.dragging{transition:none;z-index:99 !important;box-shadow:0 14px 24px rgba(0,0,0,.35);filter:none}
.sp-hand .card.ok{bottom:20px}
.sp-hand .card.no{filter:brightness(.6) saturate(.6)}
/* bid picker */
.sp-bidq{color:var(--ink);font-size:20px;font-weight:600;text-align:center;margin:2px 0 8px}
.sp-step{display:flex;align-items:center;justify-content:center;gap:10px;margin:4px 0 6px}
.sp-step button.arrow{width:44px;height:56px;font-size:34px;font-weight:600;color:var(--ink)}
.sp-step button.arrow:disabled{opacity:.25}
.sp-step .side{width:54px;text-align:center;font-size:24px;font-weight:600;color:var(--muted);opacity:.7}
.sp-step .cur{width:92px;height:100px;border-radius:18px;display:grid;place-items:center;font-size:64px;font-weight:600;color:#fff;
  background:rgba(255,255,255,.12);border:3px solid var(--outline);box-shadow:inset 0 3px 0 rgba(255,255,255,.12)}
.sp-step .cur.nil{font-size:36px}
.sp-bidhint{text-align:center;font-size:14px;margin:0 0 4px}
.sp-bidgo{width:100%;font-size:24px;padding:12px}
/* the bid window stays small and light, so the players on either side stay visible */
.sp-bidov{background:rgba(10,6,26,.22);padding:12px 12px 70px;align-items:flex-end} /* sits below West/East, above you */
.sp-bidov .panel{max-width:236px;padding:24px 12px 12px}
.sp-bidov .panel h2{font-size:17px;padding:4px 16px}
.sp-bidov .sp-bidq{font-size:15px;margin:0 0 4px}
.sp-bidov .sp-step{gap:2px;margin:2px 0;touch-action:none;cursor:grab}
.sp-step .cur{transition:transform .15s}
.sp-step .side{cursor:pointer}
.sp-bidov .sp-step button.arrow{width:30px;height:48px;font-size:28px}
.sp-bidov .sp-step .side{width:30px;font-size:17px}
.sp-bidov .sp-step .cur{width:64px;height:72px;font-size:44px;border-radius:14px}
.sp-bidov .sp-step .cur.nil{font-size:26px}
.sp-bidov .sp-bidhint{font-size:15px;margin:2px 0 6px}
.sp-bidov .sp-bidgo{font-size:19px;padding:8px}
.sp-opts{display:flex;gap:6px;margin:4px 0 12px}
.sp-opts .btn{flex:1;padding:7px 0;font-size:16px}
/* emote picker */
.sp-emotes{position:absolute;z-index:9;bottom:76px;left:50%;transform:translateX(-50%);display:flex;gap:6px;padding:8px;background:var(--surface);
  border:3px solid var(--outline);border-radius:18px;box-shadow:0 5px 0 var(--outline);animation:popin .3s cubic-bezier(.3,1.6,.5,1)}
.sp-emotes button{font-size:28px;width:42px;height:42px;border-radius:12px;background:rgba(255,255,255,.08)}
.sp-sum{width:100%;border-collapse:separate;border-spacing:0;font-size:15px;color:var(--ink);background:rgba(0,0,0,.18);border-radius:14px;overflow:hidden}
.sp-sum th,.sp-sum td{padding:7px 8px;text-align:right}
.sp-sum th:first-child,.sp-sum td:first-child{text-align:left}
.sp-sum th{color:var(--muted);font-weight:500;font-size:13px}
.sp-sum tr+tr td{border-top:1px solid rgba(255,255,255,.08)}
.sp-sum .pos{color:var(--mint)} .sp-sum .neg{color:var(--peach)}`,

  init(el) {
    const prog = progress('spades');
    el.innerHTML = `<div class="gbar"><span class="stat"></span><button class="ibtn menu" aria-label="Settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button></div>
      <div class="sp"><div class="sp-table">
        <div class="sp-felt"></div>
        <div class="sp-fan sp-fan-n" data-p="2"></div><div class="sp-fan sp-fan-w" data-p="1"></div><div class="sp-fan sp-fan-e" data-p="3"></div>
        <div class="sp-seat sp-n" data-p="2"></div><div class="sp-seat sp-w" data-p="1"></div><div class="sp-seat sp-e" data-p="3"></div><div class="sp-seat sp-s" data-p="0"></div>
        <div class="sp-score sp-them"></div><div class="sp-score sp-us"></div>
        <div class="sp-trick"></div><div class="sp-msg" aria-live="polite"></div>
      </div><div class="sp-hand"></div></div>`;
    const $ = q => el.querySelector(q), stat = $('.stat'), table = $('.sp-table'), trickEl = $('.sp-trick'), msg = $('.sp-msg'), handEl = $('.sp-hand');
    const seats = [...el.querySelectorAll('.sp-seat')].sort((a, b) => a.dataset.p - b.dataset.p);
    const fans = [null, $('.sp-fan-w'), $('.sp-fan-n'), $('.sp-fan-e')];
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };
    let s = loadSave('spades'), closePanel = null, who = cast(1);
    let drag = null, pendingHand = false, lastFrom = null; // hand gestures and the played card's starting spot

    const cardHTML = c => `<span class="r${rank(c) === 8 ? ' ten' : ''}">${RANKS[rank(c)]}</span><span class="s">${SUITS[suit(c)]}</span><span class="pip">${SUITS[suit(c)]}</span>`;
    const cardLabel = c => `${RANKS[rank(c)]} of ${['clubs', 'diamonds', 'hearts', 'spades'][suit(c)]}`;
    const save = () => writeSave('spades', s);
    const nm = p => who[p].name;

    // ---------- speech bubbles ----------
    const lastSaid = [0, 0, 0, 0], bubbles = [null, null, null, null];
    function say(p, text, { chance = 1, force = false } = {}) {
      if (Math.random() > chance) return;
      const now = performance.now();
      if (!force && now - lastSaid[p] < 2500) return;
      lastSaid[p] = now;
      bubbles[p]?.remove();
      const b = document.createElement('div');
      b.className = 'sp-say at-' + 'swne'[p] + ([...text].length <= 2 ? ' big' : ''); b.textContent = text;
      table.append(b); bubbles[p] = b;
      later(() => { b.classList.add('out'); later(() => b.remove(), 260); }, 2300);
      if (p) click(1500, .02, .06, 'sine');
    }
    const teammate = p => (p + 2) % 4, rivalsOf = p => [(p + 1) % 4, (p + 3) % 4];
    const someAI = ps => pick(ps.filter(q => q !== 0));

    function newGame(level) {
      prog.play(level);
      s = { level, scores: [0, 0], bags: [0, 0], dealer: Math.floor(Math.random() * 4), handNo: 0 };
      who = cast(level);
      newHand();
      later(() => { say(1, pick(['Hi! 👋', 'Good luck 😏', 'Ready? 🃏'])); later(() => say(3, pick(['Let’s play! 🃏', '😎', 'Bring it 💪'])), 700); }, 400);
    }
    function newHand() {
      s.dealer = (s.dealer + 1) % 4; s.handNo++;
      Object.assign(s, { hands: shuffleDeal(), bids: [null, null, null, null], tricks: [0, 0, 0, 0], trick: [], played: [], broken: false, phase: 'bid', turn: (s.dealer + 1) % 4, lastTrick: null });
      save(); render(); step();
    }

    // ---------- drawing ----------
    function teamLine(t) {
      if (!s.bids) return '';
      const ps = [t, t + 2], bid = ps.filter(p => s.bids[p]).reduce((a, p) => a + s.bids[p], 0), won = ps.reduce((a, p) => a + s.tricks[p], 0);
      return s.bids.some(b => b === null) ? `Bags ${s.bags[t]}` : `Bid ${bid} · Won ${won}`;
    }
    function render() {
      const R = levelRules(s.level);
      stat.innerHTML = pills([{ label: 'Lv', value: s.level, cls: 'lvl' }, { label: 'Goal', value: R.target }, { label: 'Hand', value: s.handNo || 1 }]);
      $('.sp-them').innerHTML = `<small>THEM</small><b>${s.scores[1]}</b><span>${teamLine(1)}</span>`;
      $('.sp-us').innerHTML = `<small>US</small><b>${s.scores[0]}</b><span>${teamLine(0)}</span>`;
      seats.forEach((e, p) => {
        const bid = s.bids[p] === null ? (s.phase === 'bid' && s.turn === p ? 'Bidding…' : '') : `${s.bids[p] === 0 ? 'Nil' : 'Bid ' + s.bids[p]} · <b>${s.tricks[p]}</b>`;
        e.classList.toggle('turn', s.turn === p && s.phase !== 'done');
        e.style.setProperty('--c', who[p].color);
        e.innerHTML = `<div class="sp-av" ${p ? 'aria-hidden="true"' : 'role="button" aria-label="Send an emote"'}>${who[p].icon}</div>` +
          `<div class="sp-tag">${p ? nm(p) + (bid ? ' · ' : '') : ''}${bid || (p ? '' : 'You')}</div>`;
      });
      seats[0].querySelector('.sp-av').onclick = emotePicker;
      // opponents' card backs, fanned
      fans.forEach((f, p) => {
        if (!f) return;
        const n = s.hands[p].length, horiz = p === 2;
        let h = '';
        for (let i = 0; i < n; i++) {
          const off = (i - (n - 1) / 2);
          h += `<div class="sp-back" style="${horiz ? `left:${off * 11 - 20}px;top:${Math.abs(off) * .8}px;transform:rotate(${off * 2}deg)` : `top:${off * 9 - 29}px;${p === 1 ? 'left' : 'right'}:${Math.abs(off) * .6}px;transform:rotate(${(p === 1 ? 90 : -90) + off * 1.5}deg)`}"></div>`;
        }
        f.innerHTML = h;
      });
      // trick: keep cards already down; new ones fly in from their player
      if (s.turn !== -1) trickEl.className = 'sp-trick';
      const want = s.trick.map(t => t.c);
      [...trickEl.children].forEach(ch => { if (!want.includes(+ch.dataset.c)) ch.remove(); });
      for (const t of s.trick) {
        if (trickEl.querySelector(`[data-c="${t.c}"]`)) continue;
        const d = document.createElement('div'); d.dataset.c = t.c;
        const mine = t.p === 0 && lastFrom?.c === t.c;
        d.className = `card t${t.p}${mine ? '' : ' fly'}${RED(t.c) ? ' red' : ''} su${suit(t.c)}`; d.setAttribute('aria-label', `${nm(t.p)}: ${cardLabel(t.c)}`); d.innerHTML = cardHTML(t.c);
        trickEl.append(d);
        if (mine) { // FLIP: start exactly over the card you played, then glide to the table
          const to = d.getBoundingClientRect(), fr = lastFrom.rect;
          d.style.transition = 'none';
          d.style.translate = `${fr.left + fr.width / 2 - (to.left + to.width / 2)}px ${fr.top + fr.height / 2 - (to.top + to.height / 2)}px`;
          d.style.scale = String(fr.width / to.width);
          void d.offsetWidth;
          d.style.transition = 'translate .3s cubic-bezier(.2,.8,.3,1), scale .3s cubic-bezier(.2,.8,.3,1)';
          d.style.translate = '0px 0px'; d.style.scale = '1';
          later(() => { d.style.transition = ''; d.style.translate = ''; d.style.scale = ''; }, 320); // hand back to the slide-to-winner animation
          lastFrom = null;
        }
      }
      msg.textContent = s.phase === 'play' && s.turn === 0 ? (s.trick.length ? 'Your turn' : 'Your lead') : '';
      // your hand along an arc
      s.hands[0].sort(cardOrder);
      const L = s.phase === 'play' && s.turn === 0 ? legal(s.hands[0], s.trick, s.broken) : [];
      const W = handEl.clientWidth || el.clientWidth, n = s.hands[0].length;
      const cw = Math.round(Math.max(58, Math.min(92, W / 5)));
      handEl.style.setProperty('--cw', cw + 'px');
      trickEl.style.setProperty('--cw', Math.round(Math.min(66, W / 6.2, table.clientHeight / 5.6)) + 'px');
      const stepX = n > 1 ? Math.min(cw * .62, (W - cw - 30) / (n - 1)) : 0, x0 = (W - (stepX * (n - 1) + cw)) / 2; // 30px spare for the arc's lean
      handEl.style.setProperty('--rk', Math.round(Math.max(16, Math.min(cw * .44, stepX * 1.05 + 1))) + 'px');
      if (drag) { pendingHand = true; return; } // never rebuild the hand under a finger
      handEl.innerHTML = '';
      s.hands[0].forEach((c, i) => {
        const b = document.createElement('button'), off = i - (n - 1) / 2;
        b.className = `card su${suit(c)}` + (RED(c) ? ' red' : '') + (L.length ? (L.includes(c) ? ' ok' : ' no') : '');
        b.innerHTML = cardHTML(c); b.setAttribute('aria-label', cardLabel(c));
        b.style.left = x0 + i * stepX + 'px'; b.style.transform = `rotate(${off * 1.3}deg) translateY(${off * off * .55}px)`; b.style.zIndex = i;
        b.disabled = !L.includes(c); b.dataset.c = c; b.dataset.rest = b.style.transform;
        handEl.append(b);
      });

    }

    // ---------- your cards: tap, drag onto the table, or flick upward ----------
    function playMine(c, b) { lastFrom = { c, rect: b.getBoundingClientRect() }; play(0, c); }
    handEl.addEventListener('pointerdown', e => {
      const b = e.target.closest('.card'); if (!b || b.disabled || drag) return;
      ac(); b.setPointerCapture(e.pointerId);
      drag = { b, c: +b.dataset.c, id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, vy: 0, ly: e.clientY, lt: performance.now() };
    });
    handEl.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0, now = performance.now();
      drag.vy = (e.clientY - drag.ly) / Math.max(1, now - drag.lt); drag.ly = e.clientY; drag.lt = now;
      if (!drag.moved && Math.hypot(dx, dy) > 8) { drag.moved = true; drag.b.classList.add('dragging'); buzz(4); }
      if (drag.moved) drag.b.style.transform = `translate(${dx}px,${dy}px) rotate(${dx * .04}deg) scale(1.08)`;
    });
    const endDrag = e => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag; drag = null;
      if (!d.moved) playMine(d.c, d.b); // a plain tap
      else {
        const r = d.b.getBoundingClientRect(), top = handEl.getBoundingClientRect().top;
        const flicked = d.vy < -.6 && e.clientY < d.y0 - 30; // a quick upward swipe
        if (r.top + r.height * .3 < top || flicked) playMine(d.c, d.b);
        else { d.b.classList.remove('dragging'); d.b.style.transform = d.b.dataset.rest; click(400, .03, .08, 'sine'); } // not far enough: back into the hand
      }
      if (pendingHand) { pendingHand = false; render(); }
    };
    handEl.addEventListener('pointerup', endDrag); handEl.addEventListener('pointercancel', endDrag);

    // ---------- flow ----------
    function step() {
      if (s.phase === 'bid') {
        if (s.bids.every(b => b !== null)) { s.phase = 'play'; s.turn = (s.dealer + 1) % 4; save(); render(); return step(); }
        if (s.turn === 0) return askBid();
        later(() => {
          const p = s.turn, b = aiBid(s, p); s.bids[p] = b; click(800, .02, .12, 'triangle');
          if (b === 0) say(p, pick(LINES.nilBid), { force: true }); else if (b >= 5) say(p, pick(LINES.bigBid), { chance: .5 });
          s.turn = (s.turn + 1) % 4; save(); render(); step();
        }, 750);
      } else if (s.phase === 'play' && s.turn !== 0) {
        later(() => play(s.turn, aiPlay(s, s.turn)), 650);
      }
    }

    function askBid() {
      let v = 1;
      const others = [1, 2, 3].filter(p => s.bids[p] !== null).map(p => `${who[p].icon} ${s.bids[p] === 0 ? 'Nil' : s.bids[p]}`).join(' &nbsp; ');
      const html = `<div class="sp-bidq">How many tricks will you win?</div>
        <div class="sp-step"><button class="arrow prev" aria-label="Fewer">‹</button><span class="side lo"></span><span class="cur" aria-live="polite"></span><span class="side hi"></span><button class="arrow next" aria-label="More">›</button></div>
        ${others ? `<p class="sp-bidhint">${others}</p>` : ''}
        <button class="btn go sp-bidgo">Place bid</button>`;
      closePanel = panel(table, { title: 'Your bid', html, cls: 'sp-bidov' });
      const ov = table.lastElementChild, lab = x => x === 0 ? 'Nil' : String(x);
      const show = () => {
        ov.querySelector('.cur').textContent = lab(v); ov.querySelector('.cur').classList.toggle('nil', v === 0);
        ov.querySelector('.lo').textContent = v > 0 ? lab(v - 1) : ''; ov.querySelector('.hi').textContent = v < 13 ? lab(v + 1) : '';
        ov.querySelector('.prev').disabled = v === 0; ov.querySelector('.next').disabled = v === 13;
      };
      ov.querySelector('.prev').onclick = () => { v = Math.max(0, v - 1); click(700 + v * 30, .02, .12, 'triangle'); buzz(4); show(); };
      ov.querySelector('.next').onclick = () => { v = Math.min(13, v + 1); click(700 + v * 30, .02, .12, 'triangle'); buzz(4); show(); };
      // Slide to pick: drag the number row like a wheel (left = higher). Tapping a side number picks it.
      const stepEl = ov.querySelector('.sp-step'), curEl = ov.querySelector('.cur'), STEP = 58; // px of drag per number: wide enough to land on the one you want
      let sx = null, base = 0, moved = false, downOn = null;
      stepEl.addEventListener('pointerdown', e => {
        if (e.target.closest('.arrow')) return;
        sx = e.clientX; base = v; moved = false; downOn = e.target; stepEl.setPointerCapture(e.pointerId); // capture retargets pointerup, so remember what was touched curEl.style.transition = 'none';
      });
      stepEl.addEventListener('pointermove', e => {
        if (sx === null) return;
        const dx = e.clientX - sx; if (Math.abs(dx) > 6) moved = true;
        const steps = Math.trunc(-dx / STEP + Math.sign(-dx) * .2); // a step counts after ~80% of its width, so small wobbles don't change the bid
        const nv = Math.max(0, Math.min(13, base + steps));
        if (nv !== v) { v = nv; click(700 + v * 30, .02, .12, 'triangle'); buzz(3); show(); }
        const rest = (-dx / STEP) - (v - base); // how far between numbers, for a little follow-the-finger
        curEl.style.transform = `translateX(${Math.max(-1, Math.min(1, -rest)) * 14}px)`;
      });
      const release = () => {
        if (sx === null) return; sx = null; curEl.style.transition = ''; curEl.style.transform = '';
        if (!moved) { // a tap on a side number selects it
          if (downOn.closest('.lo') && v > 0) { v--; click(700 + v * 30, .02, .12, 'triangle'); show(); }
          if (downOn.closest('.hi') && v < 13) { v++; click(700 + v * 30, .02, .12, 'triangle'); show(); }
        }
      };
      stepEl.addEventListener('pointerup', release); stepEl.addEventListener('pointercancel', release);
      ov.querySelector('.sp-bidgo').onclick = () => {
        ac(); closePanel(); closePanel = null;
        s.bids[0] = v; s.turn = 1; click(900, .03, .2, 'triangle'); save(); render();
        say(2, v === 0 ? 'Nil? I got you 🛡️' : pick(LINES.bidReply), { chance: v === 0 ? 1 : .35 });
        step();
      };
      show();
    }

    function play(p, c) {
      if (s.phase !== 'play' || s.turn !== p) return;
      if (!legal(s.hands[p], s.trick, s.broken).includes(c)) return;
      s.hands[p] = s.hands[p].filter(x => x !== c);
      s.trick.push({ p, c }); s.played.push(c);
      if (suit(c) === SPADE) s.broken = true;
      click(p === 0 ? 650 : 520, .025, .2, 'triangle'); if (p === 0) buzz(8);
      el.querySelector('.sp-emotes')?.remove();
      if (s.trick.length < 4) {
        s.turn = (p + 1) % 4; save(); render();
        if (p && Math.random() < .04) say(p, pick(LINES.idle));
        return step();
      }
      s.turn = -1; save(); render(); // saved with the full trick, so closing the app now loses nothing
      resolveTrick();
    }

    function reactToTrick(w) {
      const win = trickWinner(s.trick), lead = s.trick[0];
      const nilBroken = s.bids[w] === 0 && s.tricks[w] === 1;
      if (nilBroken) {
        if (w) say(w, pick(LINES.nilBust), { force: true });
        const gloater = someAI(rivalsOf(w)); if (gloater !== undefined) later(() => say(gloater, pick(LINES.nilBustGloat), { chance: .7 }), 500);
        return;
      }
      if (suit(win.c) === SPADE && suit(lead.c) !== SPADE) {
        if (w) say(w, pick(LINES.trump), { chance: .4 });
        const victim = someAI(rivalsOf(w)); if (victim !== undefined) later(() => say(victim, pick(LINES.trumped), { chance: .3 }), 450);
        return;
      }
      const t = team(w), ps = [t, t + 2], contract = ps.filter(q => s.bids[q] > 0).reduce((a, q) => a + s.bids[q], 0);
      const won = ps.filter(q => s.bids[q] > 0).reduce((a, q) => a + s.tricks[q], 0);
      if (contract && won === contract) { const q = someAI(ps); if (q !== undefined) say(q, pick(LINES.made), { chance: .6 }); return; }
      if (w === 0) { say(2, pick(LINES.praise), { chance: .22 }); return; }
      if (Math.random() < .05) say(someAI([1, 2, 3]), pick(LINES.idle));
    }

    function resolveTrick() {
      const w = trickWinner(s.trick).p;
      msg.textContent = w === 0 ? 'You take it!' : `${nm(w)} takes it`;
      if (team(w) === 0) tone(w === 0 ? 659 : 587); else click(300, .08, .2, 'sine');
      later(() => trickEl.classList.add('to' + w), 750); // cards slide to the winner
      later(() => {
        s.tricks[w]++; reactToTrick(w); s.lastTrick = s.trick; s.trick = []; s.turn = w;
        if (!s.hands[0].length) return endHand();
        save(); render(); step();
      }, 1050);
    }

    function endHand() {
      const rows = scoreHand(s.bids, s.tricks, s.scores, s.bags);
      s.phase = 'done'; save(); render();
      ['.sp-us', '.sp-them'].forEach(q => { const b = $(q); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); });
      const R = levelRules(s.level), [us, them] = s.scores;
      const over = (us >= R.target || them >= R.target || us <= -200) && us !== them;
      // table talk between hands
      rows.forEach((r, t) => {
        const ps = [t, t + 2], contract = ps.filter(q => s.bids[q] > 0).reduce((a, q) => a + s.bids[q], 0);
        const made = ps.filter(q => s.bids[q] > 0).reduce((a, q) => a + s.tricks[q], 0) >= contract;
        if (contract && !made) { const q = someAI(ps); if (q !== undefined) say(q, pick(LINES.set), { force: true }); const g = someAI(rivalsOf(t)); if (g !== undefined) later(() => say(g, pick(LINES.setGloat), { force: true }), 600); }
        if (r.penalty) { const q = someAI(ps); if (q !== undefined) later(() => say(q, pick(LINES.bags), { force: true }), 1200); }
      });
      const row = (name, r, t) => `<tr><td>${name}</td><td>${r.bid}</td><td>${r.won}</td><td class="${r.pts >= 0 ? 'pos' : 'neg'}">${r.pts > 0 ? '+' : ''}${r.pts}</td><td><b>${s.scores[t]}</b></td></tr>`;
      let html = `<table class="sp-sum"><tr><th></th><th>Bid</th><th>Won</th><th>Pts</th><th>Total</th></tr>${row(`${YOU.icon}${PARTNER.icon} Us`, rows[0], 0)}${row(`${who[1].icon}${who[3].icon} Them`, rows[1], 1)}</table>`;
      const notes = [];
      rows.forEach((r, t) => { if (r.penalty) notes.push(`${t ? 'They' : 'You'} hit 10 bags: −${r.penalty}.`); });
      html += `<p style="margin-top:10px">Bags: us ${s.bags[0]}, them ${s.bags[1]}. ${notes.join(' ')}</p>`;
      if (!over) { later(() => panel(el, { title: `Hand ${s.handNo}`, html, buttons: [{ label: 'Next hand', primary: true, onClick: newHand }] }), 900); return; }

      const won = us > them && us > -200;
      writeSave('spades', null);
      if (won) {
        const stars = us - them >= R.target * .24 ? 3 : us - them >= R.target * .1 ? 2 : 1; // margin, relative to the game length
        prog.complete(s.level, stars); [523, 659, 784, 1047].forEach((f, i) => later(() => tone(f), i * 120)); buzz(40);
        say(2, pick(LINES.win), { force: true }); later(() => say(pick([1, 3]), pick(LINES.lose), { force: true }), 700);
        const last = s.level >= LEVELS, next = cast(s.level + 1);
        html = `${starsHTML(stars)}<p style="text-align:center">You beat ${who[1].icon} ${nm(1)} and ${who[3].icon} ${nm(3)}, <b>${us}</b> to ${them}.` +
          (last ? ' That was the toughest table.' : `<br>Next table: ${next[1].icon} ${next[1].name} &amp; ${next[3].icon} ${next[3].name}. They play sharper.`) + '</p>' + html;
        later(() => panel(el, { title: `Level ${s.level} won!`, mood: 'win', html, buttons: [
          { label: 'Levels', onClick: pickLevel },
          last ? { label: 'Play again', primary: true, onClick: () => newGame(s.level) } : { label: 'Next table', primary: true, onClick: () => newGame(s.level + 1) }] }), 1400);
      } else {
        click(200, .3, .25, 'sine');
        say(pick([1, 3]), pick(LINES.win), { force: true }); later(() => say(2, pick(LINES.lose), { force: true }), 700);
        later(() => panel(el, { title: 'They won this one', mood: 'lose', html: `<p style="text-align:center">${them} to <b>${us}</b>. Have another go.</p>` + html,
          buttons: [{ label: 'Levels', onClick: pickLevel }, { label: 'Try again', primary: true, onClick: () => newGame(s.level) }] }), 1400);
      }
    }

    // ---------- your emotes ----------
    function emotePicker() {
      if (el.querySelector('.sp-emotes')) { el.querySelector('.sp-emotes').remove(); return; }
      const box = document.createElement('div'); box.className = 'sp-emotes';
      box.innerHTML = EMOTES.map(e => `<button aria-label="${e}">${e}</button>`).join('');
      box.querySelectorAll('button').forEach(b => b.onclick = () => {
        box.remove(); say(0, b.textContent, { force: true }); buzz(6);
        const replies = { '👍': ['👍', '😊'], '😂': ['😂', '🤣'], '😮': ['😮', '👀'], '😤': ['😏', '😤', '🙄'], '🎉': ['🎉', '🥳'], '🙏': ['🙏', '👌'] }[b.textContent];
        later(() => say(pick([1, 2, 3]), pick(replies), { chance: .7 }), 700);
      });
      table.append(box);
    }

    // Stop pending AI moves and close any open panel before starting over.
    const restart = lv => { for (const t of timers) clearTimeout(t); timers.clear(); el.querySelectorAll('.ov,.sp-say,.sp-emotes').forEach(o => o.remove()); newGame(lv); };
    function pickLevel() { levelPicker(el, { count: LEVELS, prog, onPick: restart }); }
    $('.menu').onclick = () => {
      const R = levelRules(s.level);
      panel(el, {
        title: 'Settings', dismissable: true,
        html: `<p><b>Colorblind cards</b>: every suit its own colour</p><div class="sp-opts sp-4c">${[['on', 'On ♦♣♥♠'], ['off', 'Off']].map(([k, t]) => `<button class="btn${(k === 'on') === fourColor() ? ' primary' : ''}" data-4c="${k}">${t}</button>`).join('')}</div>` +
          `<p><b>Game to</b> (applies right away)</p><div class="sp-opts">${TARGETS.map(t => `<button class="btn${t === R.target ? ' primary' : ''}" data-t="${t}">${t}</button>`).join('')}</div>` +
          `<p>Level ${s.level} vs ${who[1].icon} ${nm(1)} &amp; ${who[3].icon} ${nm(3)}. Nil is worth 100, made bids 10 a trick, and every 10 overtricks (bags) costs 100.</p>` +
          `<p>Tap your ${YOU.icon} to send an emote.</p>` +
          (s.lastTrick ? `<p>Last trick: ${s.lastTrick.map(t => `${who[t.p].icon} ${RANKS[rank(t.c)]}${SUITS[suit(t.c)]}`).join(', ')}</p>` : ''),
        buttons: [{ label: 'Levels', onClick: pickLevel }, { label: 'Restart', onClick: () => restart(s.level) }, { label: 'Back', primary: true }],
      });
      el.querySelectorAll('.sp-4c .btn').forEach(b => b.onclick = () => {
        writeSave('spades-4color', b.dataset['4c'] === 'on'); applyColors();
        el.querySelectorAll('.sp-4c .btn').forEach(o => o.classList.toggle('primary', o === b));
      });
      el.querySelectorAll('.sp-opts:not(.sp-4c) .btn').forEach(b => b.onclick = () => {
        writeSave('spades-target', +b.dataset.t);
        el.querySelectorAll('.sp-opts:not(.sp-4c) .btn').forEach(o => o.classList.toggle('primary', o === b));
        render();
      });
    };

    const fourColor = () => loadSave('spades-4color') ?? true; // on unless switched off
    const applyColors = () => $('.sp').classList.toggle('fourc', fourColor());
    applyColors();
    const sp = $('.sp'); sp.addEventListener('scroll', () => { sp.scrollTop = 0; sp.scrollLeft = 0; });
    const ro = new ResizeObserver(() => s && s.hands && render()); ro.observe(handEl);
    // Resume a saved game. A hand that had finished was already scored, so deal the next one.
    if (s && s.hands) who = cast(s.level);
    if (s && s.hands && s.phase !== 'done') { render(); s.trick.length === 4 ? resolveTrick() : step(); }
    else if (s && s.hands) newHand();
    else newGame(prog.last);
    return () => { for (const t of timers) clearTimeout(t); ro.disconnect(); };
  },
};
