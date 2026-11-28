// Tiny Inn: run a little hotel. Drag anywhere to walk.
//   Guests queue at the desk -> stand behind it to check them in -> they pay
//   (cash piles up on the desk; walk over it) -> they sleep, then leave a
//   messy room -> run over trash to carry it (it stacks on your head), drop it
//   in the bin, make the bed -> the room is ready again.
// The long game (scaled down from production/automation games):
//   - three wings of rooms up a long hallway (8 -> 24 rooms), opened one at a time
//   - every room upgrades Basic -> Comfy -> Suite; picky guests want the good ones
//   - guest types (backpacker, business, celebrity), patience, and regulars
//   - reputation stars: fast, happy service raises them; they unlock the big builds
//   - a kitchen and room service; trash chutes, skates and staff for the long walks
//   - finish an inn and open the next one in a new town, for a permanent bonus
// To add something to build, add an entry to BUILDS. Progress is saved as you play.
import { ac, buzz, click, tone } from '../lib/sound.js';
import { loadSave, writeSave } from '../lib/progress.js';
import { pills, panel } from '../lib/ui.js';
import { confetti } from '../lib/fx.js';

// ---------- the map (tile units; x across, y down). Wings stack up the hallway. ----------
const COLS = 15, ROWS = 60, LOBBY = 49; // rows 1..48 are rooms (3 wings of 16 rows), lobby from 49
const WALL = 0, FLOOR = 1, CORR = 2, ROOM = 3, DOOR = 4, DESK = 5, OUT = 6;
const ROOM_COLORS = ['#3FB6A8', '#9C7BEA', '#E58A5C', '#5E9BE6', '#D46FA6', '#7FBF5A', '#E0B248', '#6A7FD8'];
const WING_TOP = [33, 17, 1]; // first row of each wing (wing 0 is nearest the lobby)
// Rooms nearest the lobby come first; that's the order they're built in.
const ROOMS = [];
for (let i = 11; i >= 0; i--) for (const side of ['L', 'R']) {
  const r0 = 1 + i * 4;
  ROOMS.push({ side, r0, wing: 2 - Math.floor(i / 4), x0: side === 'L' ? 1 : 10, door: { x: side === 'L' ? 5 : 9, y: r0 + 1 },
    bed: { x: side === 'L' ? 1.9 : 13.1, y: r0 + 1.5 }, inside: { x: side === 'L' ? 3.6 : 11.4, y: r0 + 1.5 } });
}
function buildGrid() {
  const g = Array.from({ length: ROWS }, () => new Array(COLS).fill(WALL));
  for (let y = 1; y <= 48; y++) for (let x = 6; x <= 8; x++) g[y][x] = CORR;
  for (const r of ROOMS) {
    for (let y = r.r0; y < r.r0 + 3; y++) for (let x = r.x0; x < r.x0 + 4; x++) g[y][x] = ROOM;
    g[r.door.y][r.door.x] = DOOR;
  }
  for (let y = 49; y <= 56; y++) for (let x = 1; x <= 13; x++) g[y][x] = FLOOR;
  for (let x = 6; x <= 8; x++) g[57][x] = FLOOR;
  for (let y = 58; y < ROWS; y++) for (let x = 0; x < COLS; x++) g[y][x] = OUT;
  for (let x = 2; x <= 4; x++) g[51][x] = DESK;
  return g;
}

// ---------- fixed spots ----------
const SPOT = {
  desk: { x: 3.5, y: 50.4 },       // stand here (behind the desk) to check guests in
  clerk: { x: 2.1, y: 50.4 }, clerk2: { x: 4.7, y: 50.4 },
  cash: { x: 5.6, y: 50.7 },       // guests' payments pile up here
  bin: { x: 12.4, y: 50.4 },
  vend: { x: 12.6, y: 54.3 }, vendCash: { x: 11.2, y: 54.6 },
  kitchen: { x: 12.4, y: 52.2 }, tray: { x: 11.2, y: 52.4 }, // trays wait on the counter's front
  closet: { x: 1.8, y: 55.6 },
  door: { x: 7.5, y: 59.4 },
  hub: { x: 7.5, y: 49.3 },
};
const CHUTES = { chute2: { x: 8.7, y: 24.6 }, chute3: { x: 8.7, y: 8.6 } }; // extra bins up the wings
const QUEUE = [[3.5, 52.4], [3.5, 53.4], [3.5, 54.4], [4.6, 55.3], [5.8, 56.1], [7, 56.7]];

// ---------- things to build, in order (two are on the floor at a time). Add new ones here. ----------
// stars: reputation needed before the pad takes cash.
const BUILDS = [
  { id: 'room1', label: 'Room 2', icon: '🛏️', price: 15, room: 1 },
  { id: 'room2', label: 'Room 3', icon: '🛏️', price: 30, room: 2 },
  { id: 'clerk', label: 'Hire clerk', icon: '🧑‍💼', price: 50, at: { x: 1.4, y: 49.6 } },
  { id: 'room3', label: 'Room 4', icon: '🛏️', price: 65, room: 3 },
  { id: 'vend', label: 'Vending', icon: '🥤', price: 45, at: { x: 11.2, y: 53.4 } },
  { id: 'maid1', label: 'Housekeeper', icon: '🧹', price: 90, at: { x: 1.6, y: 54.4 } },
  { id: 'arms', label: 'Big arms', icon: '💪', price: 70, at: { x: 10.4, y: 56.1 } },
  { id: 'room4', label: 'Room 5', icon: '🛏️', price: 110, room: 4 },
  { id: 'shoes', label: 'Fast shoes', icon: '👟', price: 90, at: { x: 9, y: 56.1 } },
  { id: 'room5', label: 'Room 6', icon: '🛏️', price: 150, room: 5 },
  { id: 'janitor', label: 'Janitor', icon: '🧽', price: 160, at: { x: 12.4, y: 56.1 } },
  { id: 'lounge', label: 'Lounge', icon: '🛋️', price: 200, at: { x: 9.6, y: 53.4 } },
  { id: 'room6', label: 'Room 7', icon: '🛏️', price: 240, room: 6 },
  { id: 'maid2', label: '2nd housekeeper', icon: '🧹', price: 260, at: { x: 2.9, y: 54.4 } },
  { id: 'luxury', label: 'Luxury beds', icon: '✨', price: 350, at: { x: 9.6, y: 50.6 } },
  { id: 'room7', label: 'Room 8', icon: '🛏️', price: 400, room: 7 },
  // ---- the long game ----
  { id: 'kitchen', label: 'Kitchen', icon: '🍳', price: 450, at: { x: 12.4, y: 52.2 } },
  { id: 'wing2', label: 'Open Wing 2', icon: '🚪', price: 700, stars: 3, at: { x: 7.5, y: 33.6 } },
  { id: 'room8', label: 'Room 9', icon: '🛏️', price: 450, room: 8 },
  { id: 'room9', label: 'Room 10', icon: '🛏️', price: 500, room: 9 },
  { id: 'chute2', label: 'Trash chute', icon: '🕳️', price: 400, at: CHUTES.chute2 },
  { id: 'room10', label: 'Room 11', icon: '🛏️', price: 560, room: 10 },
  { id: 'waiter', label: 'Waiter', icon: '🧑‍🍳', price: 600, at: { x: 4.3, y: 55.6 } },
  { id: 'room11', label: 'Room 12', icon: '🛏️', price: 620, room: 11 },
  { id: 'skates', label: 'Roller skates', icon: '🛼', price: 700, at: { x: 7.5, y: 55.6 } },
  { id: 'room12', label: 'Room 13', icon: '🛏️', price: 700, room: 12 },
  { id: 'maid3', label: '3rd housekeeper', icon: '🧹', price: 750, at: { x: 1.6, y: 53.2 } },
  { id: 'room13', label: 'Room 14', icon: '🛏️', price: 780, room: 13 },
  { id: 'clerk2', label: '2nd clerk', icon: '🧑‍💼', price: 800, at: { x: 4.7, y: 49.6 } },
  { id: 'room14', label: 'Room 15', icon: '🛏️', price: 860, room: 14 },
  { id: 'arms2', label: 'Huge arms', icon: '🦾', price: 900, at: { x: 10.4, y: 55.2 } },
  { id: 'room15', label: 'Room 16', icon: '🛏️', price: 950, room: 15 },
  { id: 'spa', label: 'Spa', icon: '🧖', price: 1400, stars: 4, at: { x: 11, y: 49.6 } },
  { id: 'wing3', label: 'Open Wing 3', icon: '🚪', price: 2200, stars: 4, at: { x: 7.5, y: 17.6 } },
  { id: 'room16', label: 'Room 17', icon: '🛏️', price: 1200, room: 16 },
  { id: 'room17', label: 'Room 18', icon: '🛏️', price: 1300, room: 17 },
  { id: 'chute3', label: 'Trash chute', icon: '🕳️', price: 900, at: CHUTES.chute3 },
  { id: 'room18', label: 'Room 19', icon: '🛏️', price: 1400, room: 18 },
  { id: 'waiter2', label: '2nd waiter', icon: '🧑‍🍳', price: 1500, at: { x: 5.6, y: 55.6 } },
  { id: 'room19', label: 'Room 20', icon: '🛏️', price: 1550, room: 19 },
  { id: 'maid4', label: '4th housekeeper', icon: '🧹', price: 1600, at: { x: 2.9, y: 53.2 } },
  { id: 'room20', label: 'Room 21', icon: '🛏️', price: 1700, room: 20 },
  { id: 'janitor2', label: '2nd janitor', icon: '🧽', price: 1700, at: { x: 12.4, y: 55.2 } },
  { id: 'room21', label: 'Room 22', icon: '🛏️', price: 1850, room: 21 },
  { id: 'pool', label: 'Rooftop pool', icon: '🏊', price: 3000, stars: 5, at: { x: 9.6, y: 49.6 } },
  { id: 'room22', label: 'Room 23', icon: '🛏️', price: 2000, room: 22 },
  { id: 'room23', label: 'Room 24', icon: '🛏️', price: 2200, room: 23 },
];
for (const b of BUILDS) if (b.room !== undefined) {
  const r = ROOMS[b.room]; b.at = { x: r.side === 'L' ? 6.5 : 8.5, y: r.door.y + .5 };
}
const SHOWN = 2; // how many next builds are on the floor at once

// Room quality: Basic -> Comfy -> Suite. Each upgrade is a pad inside the room.
export const TIERS = [{ name: 'Basic', price: 9 }, { name: 'Comfy', price: 16, color: '#FFE08A' }, { name: 'Suite', price: 28, color: '#FF9EC4' }];
export const tierCost = (room, tier) => (tier === 1 ? 40 + room * 14 : 160 + room * 45); // cost to reach `tier`
export const TIER_STARS = [0, 2, 3]; // reputation a room needs for that upgrade
// Guests: who wants what. min: the lowest room tier they'll take.
export const GUESTS = {
  backpacker: { icon: '🎒', min: 0, pay: 1, patience: 45 },
  business: { icon: '💼', min: 1, pay: 1.3, patience: 32 },
  celebrity: { icon: '⭐', min: 2, pay: 2, patience: 40, tip: 15 },
};
export const CHAIN = { bonus: .25, towns: ['Maple Hollow', 'Seaside', 'Pine Ridge', 'Old Town', 'Sunny Dunes', 'Snowcap', 'Harbor City'] };
const TOWN_CORRIDOR = ['#B23F57', '#2F7FA8', '#3E8A55', '#8A5A33', '#C27A2C', '#5C6FB8', '#7A3E8A'];

export const hotelRules = (paid, inns = 0) => ({
  rooms: 1 + BUILDS.filter(b => b.room !== undefined && paid.has(b.id)).length,
  cap: paid.has('arms2') ? 12 : paid.has('arms') ? 8 : 4,
  speed: paid.has('skates') ? 6.6 : paid.has('shoes') ? 5.4 : 4.2,
  mult: (paid.has('luxury') ? 1.4 : 1) * (paid.has('spa') ? 1.15 : 1) * (paid.has('pool') ? 1.2 : 1) * (1 + inns * CHAIN.bonus),
  arrive: (paid.has('lounge') ? 3.4 : 5) * (paid.has('spa') ? .85 : 1),
});
/** Reputation 1..5 moves toward 5 with happy guests and toward 1 with walkouts. */
export const nudge = (rating, good, k) => Math.max(1, Math.min(5, rating + ((good ? 5 : 1) - rating) * k));

const SAVE = 'hotel', CHAIN_SAVE = 'hotel-chain';
const BODY = ['#5EC6FF', '#FF8A66', '#AE8CFF', '#4FE3B2', '#FFD25A', '#FF6FAE', '#8FD0FF', '#F2A65A'];
const TRASH = ['#E8E2D0', '#FFD25A', '#9BD86B', '#C9A27A'];

export default {
  id: 'hotel',
  name: 'Tiny Inn',
  description: 'Check guests in, grab the cash, clean the rooms. Grow to three wings of suites, win stars, then open inns in new towns.',
  color: '--pink',
  icon: '<svg viewBox="0 0 40 40" fill="currentColor"><path d="M6 36V12l14-8 14 8v24h-10v-9h-8v9z"/></svg>',
  art: `<svg viewBox="0 0 100 100"><rect x="0" y="74" width="100" height="26" fill="#3A2A7A"/>
    <rect x="16" y="26" width="68" height="54" rx="6" fill="#FFE3EF" stroke="#0D0920" stroke-width="4"/><path d="M10 30 50 8 90 30z" fill="#FF6FAE" stroke="#0D0920" stroke-width="4" stroke-linejoin="round"/>
    <rect x="24" y="36" width="14" height="12" rx="3" fill="#5EC6FF" stroke="#0D0920" stroke-width="3"/><rect x="43" y="36" width="14" height="12" rx="3" fill="#FFD25A" stroke="#0D0920" stroke-width="3"/><rect x="62" y="36" width="14" height="12" rx="3" fill="#5EC6FF" stroke="#0D0920" stroke-width="3"/>
    <rect x="40" y="56" width="20" height="24" rx="3" fill="#9C5B2E" stroke="#0D0920" stroke-width="3"/><circle cx="55" cy="68" r="2" fill="#FFD25A"/>
    <rect x="30" y="17" width="40" height="11" rx="4" fill="#FFD25A" stroke="#0D0920" stroke-width="3"/><text x="50" y="26" font-size="8.5" font-weight="700" text-anchor="middle" font-family="Fredoka,sans-serif" fill="#1E1438">TINY INN</text>
    <circle cx="82" cy="78" r="9" fill="#4FE3B2" stroke="#0D0920" stroke-width="3"/><text x="82" y="82" font-size="11" font-weight="700" text-anchor="middle" font-family="Fredoka,sans-serif" fill="#0D0920">$</text></svg>`,
  meta() {
    const sv = loadSave(SAVE), paid = new Set(sv?.paid || []), inns = loadSave(CHAIN_SAVE)?.inns || 0;
    return pills([{ value: `💵 ${sv?.cash ?? 0}` }, { value: '★'.repeat(Math.floor(sv?.rating ?? 2.5)), cls: 'star' }, { label: 'Built', value: `${paid.size}/${BUILDS.length}` }, ...(inns ? [{ value: `🏨 ${inns + 1}` }] : [])]);
  },
  css: `
.ht{flex:1;min-height:0;position:relative;overflow:hidden;touch-action:none;background:#140F2A}
.ht canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.ht-joy{position:absolute;width:110px;height:110px;margin:-55px 0 0 -55px;border-radius:50%;pointer-events:none;
  background:rgba(255,255,255,.12);border:3px solid rgba(255,255,255,.35);display:none;z-index:2}
.ht-joy i{position:absolute;left:50%;top:50%;width:48px;height:48px;margin:-24px 0 0 -24px;border-radius:50%;background:rgba(255,255,255,.8);border:3px solid var(--outline)}
.ht-hint{position:absolute;left:50%;top:10px;transform:translateX(-50%);z-index:2;max-width:calc(100% - 24px);text-align:center;pointer-events:none;
  background:rgba(13,9,32,.75);color:#fff;font-weight:600;font-size:14px;padding:6px 14px;border-radius:999px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ht-hint:empty{display:none}
.ht-goals{display:flex;flex-direction:column;gap:6px;margin-top:4px;max-height:42vh;overflow:auto}
.ht-goals div{display:flex;justify-content:space-between;gap:10px;padding:6px 10px;border-radius:12px;background:rgba(0,0,0,.18);color:var(--ink)}
.ht-goals div.done{opacity:.55;text-decoration:line-through}`,

  init(el) { // runInn can restart itself (opening the next inn); the app keeps one cleanup that stops whichever is running
    let stop = null;
    const restart = () => { stop?.(); stop = runInn(el, restart); };
    restart();
    return () => stop?.();
  },
};

function runInn(el, restart) {
  {
    el.innerHTML = `<div class="gbar"><span class="stat"></span><button class="ibtn info" aria-label="Hotel plans"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/></svg></button></div>
      <div class="ht"><canvas></canvas><div class="ht-joy"><i></i></div><div class="ht-hint" aria-live="polite"></div></div>`;
    const root = el.querySelector('.ht'), cv = root.querySelector('canvas'), g = cv.getContext('2d');
    const joyEl = root.querySelector('.ht-joy'), knob = joyEl.querySelector('i'), hintEl = root.querySelector('.ht-hint'), stat = el.querySelector('.stat');
    const grid = buildGrid();

    // ---------- state ----------
    const sv = loadSave(SAVE) || {}, chain = loadSave(CHAIN_SAVE) || { inns: 0 };
    const paid = new Set(sv.paid || []);
    let cash = sv.cash ?? 0, earned = sv.earned ?? 0, wiped = false;
    // a save from before reputation existed: a finished inn starts well thought of
    let rating = sv.rating ?? (paid.size >= 16 ? 4 : 2.5), regulars = sv.regulars ?? 0;
    let R = hotelRules(paid, chain.inns);
    const town = CHAIN.towns[chain.inns % CHAIN.towns.length], corrColor = TOWN_CORRIDOR[chain.inns % TOWN_CORRIDOR.length];
    const P = { x: 7.5, y: 53.5, carry: [], trays: 0, face: 1, walk: 0 };
    const rooms = ROOMS.map((r, i) => ({ ...r, i, open: i === 0 || paid.has('room' + i), tier: sv.tiers?.[i] ?? 0, state: 'clean', made: true, guest: null, claim: null }));
    const guests = [], trash = [], staff = [], floaters = [], flying = [];
    const piles = { desk: sv.deskCash ?? 0, vend: sv.vendCash ?? 0 };
    const progress = { desk: 0, bed: new Map(), pad: null };
    let arriveT = 1, litterT = 8, snackT = 4, saveT = 2, deskBusy = 0, trays = 0, cookT = 0;
    let W = 0, H = 0, T = 46, camX = 0, camY = 0, dead = false, raf, last = performance.now(), padPay = 0;

    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const wingOpen = w => w === 0 || paid.has('wing' + (w + 1));
    const solid = (x, y) => {
      const tx = Math.floor(x), ty = Math.floor(y);
      if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return true;
      const t = grid[ty][tx];
      if (t === WALL || t === DESK) return true;
      if (t === CORR && ((ty < WING_TOP[0] && !wingOpen(1)) || (ty < WING_TOP[1] && !wingOpen(2)))) return true; // a closed wing's hallway
      if (t === DOOR) return !rooms.find(r => r.door.x === tx && r.door.y === ty)?.open;
      return false;
    };
    const roomAt = p => rooms.find(r => p.x >= r.x0 && p.x < r.x0 + 4 && p.y >= r.r0 && p.y < r.r0 + 3);
    const roomPrice = (r, gst) => Math.round(TIERS[r.tier].price * R.mult * (gst ? GUESTS[gst.kind].pay * (gst.regular ? 1.5 : 1) : 1));

    // Routing: every place connects to the corridor spine (x = 7.5).
    function toSpine(p) {
      const r = roomAt(p);
      if (r) return [{ x: r.side === 'L' ? 4.5 : 10.5, y: r.door.y + .5 }, { x: r.door.x + .5, y: r.door.y + .5 }, { x: 7.5, y: r.door.y + .5 }];
      if (p.y < LOBBY - .2) return [{ x: 7.5, y: p.y }];
      const out = [];
      if (p.y > 50.9 && p.y < 52.2 && p.x < 5.3) out.push({ x: 5.6, y: p.y < 51.5 ? 50.5 : 52.4 }); // step round the desk
      out.push({ x: 7.5, y: Math.min(p.y, 56.5) > 50 ? 50.2 : p.y }, SPOT.hub);
      return out;
    }
    function route(a, b) {
      if (roomAt(a) && roomAt(a) === roomAt(b)) return [{ ...b }];
      const up = toSpine(a), down = toSpine(b).reverse();
      const lobbyA = a.y >= LOBBY - .2 && !roomAt(a), lobbyB = b.y >= LOBBY - .2 && !roomAt(b);
      if (lobbyA && lobbyB) return [{ ...b }];
      return [...up, ...down, { ...b }];
    }
    function walk(ch, dt, speed) {
      while (ch.path?.length && dt > 0) {
        const t = ch.path[0], d = dist(ch, t);
        if (d < 1e-3) { ch.path.shift(); continue; }
        const stepLen = Math.min(d, speed * dt);
        ch.face = Math.sign(t.x - ch.x) || ch.face; ch.x += (t.x - ch.x) / d * stepLen; ch.y += (t.y - ch.y) / d * stepLen; ch.walk += stepLen;
        dt -= stepLen / speed;
        if (stepLen >= d - 1e-6) ch.path.shift();
      }
      return !ch.path?.length;
    }
    const bins = () => [SPOT.bin, ...Object.entries(CHUTES).filter(([id]) => paid.has(id)).map(([, p]) => p)];
    const nearestBin = p => bins().sort((a, b) => dist(p, a) - dist(p, b))[0];

    // ---------- staff ----------
    function addStaff(kind) {
      if (kind === 'clerk') staff.push({ kind, x: (staff.some(s => s.kind === 'clerk') ? SPOT.clerk2 : SPOT.clerk).x, y: SPOT.clerk.y, face: 1, walk: 0 });
      else staff.push({ kind, x: SPOT.closet.x + staff.length * .3, y: SPOT.closet.y, face: 1, walk: 0, carry: [], path: [], job: null, t: 0, tray: 0 });
    }
    function applyBuild(b) {
      if (b.room !== undefined) rooms[b.room].open = true;
      if (b.id === 'clerk' || b.id === 'clerk2') addStaff('clerk');
      if (/^maid\d/.test(b.id)) addStaff('maid');
      if (/^janitor/.test(b.id)) addStaff('janitor');
      if (/^waiter/.test(b.id)) addStaff('waiter');
      R = hotelRules(paid, chain.inns);
    }
    for (const b of BUILDS) if (paid.has(b.id)) applyBuild(b);
    const visiblePads = () => BUILDS.filter(b => !paid.has(b.id)).slice(0, SHOWN);
    const stars = () => Math.floor(rating + 1e-9);
    const starsOk = b => !b.stars || stars() >= b.stars;
    // room upgrade pads, inside each open room that isn't a Suite yet
    const tierPads = () => rooms.filter(r => r.open && r.tier < 2 && r.state === 'clean' && !r.guest).map(r => ({
      id: 'tier' + r.i, room: r.i, label: TIERS[r.tier + 1].name + ' room', icon: r.tier ? '👑' : '🛋️', price: tierCost(r.i, r.tier + 1), stars: TIER_STARS[r.tier + 1], at: { x: r.inside.x, y: r.inside.y + .3 } }));
    let padProgress = sv.padProgress || {}; // partial payments survive closing the app

    // ---------- helpers ----------
    const float = (x, y, text, color = '#FFD25A') => floaters.push({ x, y, text, color, t: 0 });
    const save = () => { if (!wiped) writeSave(SAVE, { cash, earned, paid: [...paid], deskCash: piles.desk, vendCash: piles.vend, padProgress, rating: +rating.toFixed(3), regulars, tiers: rooms.map(r => r.tier) }); };
    const fits = (r, gst) => r.open && r.state === 'clean' && !r.guest && r.tier >= GUESTS[gst.kind].min;
    const freeRoomFor = gst => rooms.filter(r => fits(r, gst)).sort((a, b) => a.tier - b.tier)[0]; // the cheapest room they'll take
    function dropTrash(x, y, room) { trash.push({ x, y, room: room ? room.i : -1, c: TRASH[Math.floor(Math.random() * TRASH.length)], k: Math.floor(Math.random() * 3) }); }
    function roomDone(r) { if (r.made && !trash.some(t => t.room === r.i)) { r.state = 'clean'; r.claim = null; } }
    const rate = (good, k, x, y) => { const before = stars(); rating = nudge(rating, good, k); if (stars() > before) { float(x, y - 1.6, `★ ${stars()} stars!`, '#FFD25A'); tone(1568); } };

    // ---------- guests ----------
    function spawnGuest() {
      // who comes depends on what you've built and how well you're rated
      // the guests you get follow the rooms you have: more Comfy rooms bring more business travellers,
      // Suites (and 4 stars) bring celebrities, so upgrading is how you attract the big spenders
      const open = rooms.filter(r => r.open), comfy = open.filter(r => r.tier >= 1).length / open.length, suite = open.filter(r => r.tier >= 2).length / open.length;
      const roll = Math.random(), celeb = rating >= 4 ? suite * .35 : 0;
      const kind = roll < celeb ? 'celebrity' : roll < celeb + comfy * .55 ? 'business' : 'backpacker';
      const regular = Math.random() < regulars / (regulars + 25);
      guests.push({ x: SPOT.door.x, y: SPOT.door.y + .5, face: 1, walk: 0, path: [], state: 'queue', kind, regular, wait: 0,
        patience: GUESTS[kind].patience + (regular ? 15 : 0), color: BODY[Math.floor(Math.random() * BODY.length)], hat: kind === 'business' || Math.random() < .3, bag: true, t: 0, happy: true });
    }
    const queued = () => guests.filter(q => q.state === 'queue');
    function checkIn(gst) {
      const r = freeRoomFor(gst); if (!r) return;
      gst.state = 'toRoom'; gst.room = r; r.guest = gst; r.state = 'busy';
      gst.path = route(gst, r.bed);
      const pay = roomPrice(r, gst) + (GUESTS[gst.kind].tip || 0);
      piles.desk += pay; click(2000, .05, .15, 'sine'); tone(1568);
      float(SPOT.cash.x, SPOT.cash.y - .6, '+$' + pay, '#4FE3B2');
      rate(true, gst.wait < gst.patience * .5 ? .05 : .02, SPOT.desk.x, SPOT.desk.y);
    }

    // ---------- input: a floating joystick ----------
    const joy = { on: false, ox: 0, oy: 0, dx: 0, dy: 0, id: null };
    const keys = new Set();
    root.addEventListener('pointerdown', e => {
      ac(); joy.on = true; joy.id = e.pointerId; root.setPointerCapture(e.pointerId);
      const r = root.getBoundingClientRect(); joy.ox = e.clientX - r.left; joy.oy = e.clientY - r.top; joy.dx = joy.dy = 0;
      joyEl.style.left = joy.ox + 'px'; joyEl.style.top = joy.oy + 'px'; joyEl.style.display = 'block'; knob.style.transform = '';
    });
    root.addEventListener('pointermove', e => {
      if (!joy.on || e.pointerId !== joy.id) return;
      const r = root.getBoundingClientRect(); let dx = e.clientX - r.left - joy.ox, dy = e.clientY - r.top - joy.oy;
      const m = Math.hypot(dx, dy), max = 42; if (m > max) { dx *= max / m; dy *= max / m; }
      joy.dx = dx / max; joy.dy = dy / max; knob.style.transform = `translate(${dx}px,${dy}px)`;
    });
    const endJoy = e => { if (e.pointerId === joy.id) { joy.on = false; joy.dx = joy.dy = 0; joyEl.style.display = 'none'; } };
    root.addEventListener('pointerup', endJoy); root.addEventListener('pointercancel', endJoy);
    const kd = e => { if (/^(Arrow|[wasd]$)/i.test(e.key)) { keys.add(e.key.toLowerCase()); e.preventDefault(); } }, ku = e => keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);

    // ---------- update ----------
    function update(dt) {
      // move the player (joystick or arrow keys), sliding along walls
      let mx = joy.dx, my = joy.dy;
      if (keys.has('arrowleft') || keys.has('a')) mx -= 1; if (keys.has('arrowright') || keys.has('d')) mx += 1;
      if (keys.has('arrowup') || keys.has('w')) my -= 1; if (keys.has('arrowdown') || keys.has('s')) my += 1;
      const m = Math.hypot(mx, my);
      if (m > .12) {
        const sp = R.speed * Math.min(1, m) / Math.max(1, m) * dt, rr = .28;
        const nx = P.x + mx * sp, ny = P.y + my * sp;
        const free = (x, y) => !solid(x - rr, y - rr) && !solid(x + rr, y - rr) && !solid(x - rr, y + rr) && !solid(x + rr, y + rr);
        if (free(nx, P.y)) P.x = nx; if (free(P.x, ny)) P.y = ny;
        P.face = Math.sign(mx) || P.face; P.walk += sp;
      }

      // guests arrive while there's a room or the queue is short
      arriveT -= dt;
      if (arriveT <= 0) { arriveT = R.arrive * (1.3 - rating * .08) * (.8 + Math.random() * .4); if (queued().length < QUEUE.length && guests.filter(q => q.state !== 'leave').length < R.rooms + 3) spawnGuest(); }
      const q = queued();
      q.forEach((gst, i) => { const [x, y] = QUEUE[i]; gst.path = gst.y > 56.9 ? [{ x: 7.5, y: 56.6 }, { x, y }] : [{ x, y }]; }); // come in through the doorway
      // desk: check in the first queued guest who has a room they'll take
      const atDesk = dist(P, SPOT.desk) < .8, clerks = staff.filter(s => s.kind === 'clerk').length;
      const next = q.find((gst, i) => i < 3 && dist(gst, { x: QUEUE[i][0], y: QUEUE[i][1] }) < .05 && freeRoomFor(gst));
      if (next && (atDesk || clerks)) {
        progress.desk += dt * ((atDesk ? 1 : 0) + clerks * .6);
        if (progress.desk >= 1) { progress.desk = 0; checkIn(next); }
      } else progress.desk = Math.max(0, progress.desk - dt);
      deskBusy = q.length && !next ? deskBusy + dt : 0;
      // patience: wait too long in line and they walk out, and your stars dip
      for (const gst of q) {
        gst.wait += dt;
        if (gst.wait > gst.patience) {
          gst.state = 'leave'; gst.happy = false; gst.path = [{ x: 7.5, y: 57 }, { ...SPOT.door }, { x: SPOT.door.x, y: ROWS + 1 }];
          float(gst.x, gst.y - 1.4, 'Too slow! 😤', '#FF8A66'); click(220, .2, .2, 'sine'); rate(false, .12, gst.x, gst.y);
        }
      }

      for (const gst of [...guests]) {
        const arrived = walk(gst, dt, 2.6);
        if (gst.state === 'queue' && gst.y < 56.3 && Math.random() < dt * .012 && trash.filter(t => t.room < 0).length < 8) dropTrash(Math.max(1.5, Math.min(12.5, gst.x + (Math.random() - .5))), Math.min(56.4, gst.y + .5), null); // litter stays in the lobby
        if (gst.state === 'toRoom' && arrived) {
          gst.state = 'sleep'; gst.t = 15 + Math.random() * 6; gst.bag = false;
          if (paid.has('kitchen') && Math.random() < .45) gst.order = { in: 2 + Math.random() * 3, left: 0 }; // they'll ring room service
        } else if (gst.state === 'sleep') {
          gst.t -= dt;
          const o = gst.order;
          if (o && !o.done) {
            if (o.in > 0) { o.in -= dt; if (o.in <= 0) { o.left = 22; float(gst.x, gst.y - 1.4, '🍳 Room service!', '#FFFFFF'); click(1300, .05, .1, 'sine'); } }
            else { o.left -= dt; gst.t = Math.max(gst.t, .5); if (o.left <= 0) { o.done = true; gst.happy = false; float(gst.x, gst.y - 1.4, 'Never came 😞', '#FF8A66'); rate(false, .06, gst.x, gst.y); } }
          }
          if (gst.t <= 0) {
            const r = gst.room; gst.state = 'leave'; r.guest = null; r.state = 'dirty'; r.made = false;
            const n = 2 + Math.floor(Math.random() * 2);
            for (let k = 0; k < n; k++) dropTrash(r.x0 + .6 + Math.random() * 2.8, r.r0 + .4 + Math.random() * 2.2, r);
            if (gst.happy && Math.random() < .25 && regulars < 60) { regulars++; float(gst.x, gst.y - 1.4, '♥ Will be back!', '#FF9EC4'); }
            gst.path = [...route(gst, SPOT.hub), { x: 7.5, y: 57 }, { ...SPOT.door }, { x: SPOT.door.x, y: ROWS + 1 }];
          }
        } else if (gst.state === 'leave' && arrived) guests.splice(guests.indexOf(gst), 1);
      }
      // room service: the kitchen cooks trays; carry one to a guest who's asked
      if (paid.has('kitchen')) { cookT -= dt; if (cookT <= 0) { cookT = 4; if (trays < 3) trays++; } }
      const wantsTray = gst => gst.state === 'sleep' && gst.order && !gst.order.done && gst.order.in <= 0;
      const deliver = (gst, by) => {
        gst.order.done = true; const tip = Math.round(roomPrice(gst.room, gst) * .6) + 3;
        piles.desk += tip; float(gst.x, gst.y - 1.4, `Tip +$${tip}`, '#4FE3B2'); tone(1760); rate(true, .06, gst.x, gst.y);
        if (by === P) P.trays--; else by.tray = 0;
      };
      if (trays && P.trays < 2 && dist(P, SPOT.tray) < 1) { trays--; P.trays++; click(1500, .04, .1, 'triangle'); }
      if (P.trays) for (const gst of guests) if (wantsTray(gst) && dist(P, gst) < 1.4) { deliver(gst, P); break; }
      // vending: waiting guests buy snacks
      if (paid.has('vend')) { snackT -= dt; if (snackT <= 0) { snackT = 3 + Math.random() * 3; if (q.length > 1) { piles.vend += 3; float(SPOT.vendCash.x, SPOT.vendCash.y - .5, '+$3', '#4FE3B2'); } } }
      // lobby litter now and then
      litterT -= dt; if (litterT <= 0) { litterT = 10 + Math.random() * 8; if (trash.filter(t => t.room < 0).length < 6) dropTrash(2 + Math.random() * 10, 52.5 + Math.random() * 3.5, null); }

      // player pickups: trash, cash piles, bins, beds
      for (const t of [...trash]) if (P.carry.length < R.cap && dist(P, t) < .6) {
        trash.splice(trash.indexOf(t), 1); P.carry.push(t.c); click(900 + P.carry.length * 90, .03, .14, 'triangle'); buzz(6);
        if (t.room >= 0) roomDone(rooms[t.room]);
      }
      for (const [k, spot] of [['desk', SPOT.cash], ['vend', SPOT.vendCash]]) if (piles[k] && dist(P, spot) < 1) {
        const amt = piles[k]; piles[k] = 0; cash += amt; earned += amt;
        for (let i = 0; i < Math.min(8, Math.ceil(amt / 3)); i++) flying.push({ kind: 'bill', x: spot.x, y: spot.y, tx: 'player', t: -i * .05 });
        tone(1319); setTimeout(() => tone(1760), 90); buzz(15); float(P.x, P.y - 1.4, '+$' + amt);
      }
      const bin = nearestBin(P);
      if (P.carry.length && dist(P, bin) < 1.1) {
        P.binT = (P.binT || 0) - dt;
        if (P.binT <= 0) { P.binT = .1; P.carry.pop(); cash += 1; earned += 1; flying.push({ kind: 'trash', x: P.x, y: P.y - 1, tx: bin, t: 0 }); click(500, .04, .15, 'triangle'); }
      }
      for (const r of rooms) if (r.state === 'dirty' && !r.made) {
        const near = dist(P, r.bed) < 1.1 || staff.some(s => s.job === r && s.making);
        const v = (progress.bed.get(r.i) || 0) + (near ? dt / 1.2 : -dt);
        progress.bed.set(r.i, Math.max(0, v));
        if (v >= 1) { r.made = true; progress.bed.delete(r.i); click(1200, .05, .15, 'sine'); roomDone(r); }
      }

      // build pads (the next two builds, plus room upgrades): stand on one to pour cash in
      progress.pad = null;
      for (const b of [...visiblePads(), ...tierPads()]) {
        if (Math.abs(P.x - b.at.x) < .75 && Math.abs(P.y - b.at.y) < .75) {
          progress.pad = b;
          if (!starsOk(b)) continue;
          padPay -= dt;
          if (cash > 0 && padPay <= 0) {
            padPay = .04;
            const have = padProgress[b.id] || 0, amt = Math.min(cash, Math.max(1, Math.ceil(b.price / 30)), b.price - have);
            cash -= amt; padProgress[b.id] = have + amt; flying.push({ kind: 'coin', x: P.x, y: P.y - 1, tx: b.at, t: 0 });
            click(1400 + (have / b.price) * 600, .015, .07, 'triangle');
            if (padProgress[b.id] >= b.price) {
              delete padProgress[b.id];
              if (b.room !== undefined && b.id.startsWith('tier')) { rooms[b.room].tier++; }
              else { paid.add(b.id); applyBuild(b); }
              [784, 988, 1175, 1568].forEach((f, i) => setTimeout(() => tone(f), i * 90)); buzz(40); confetti(root, 70);
              float(b.at.x, b.at.y - .8, b.label + '!', '#FFFFFF'); save();
              if (paid.size === BUILDS.length && !b.id.startsWith('tier')) setTimeout(() => !dead && finished(), 800);
            }
          }
        }
      }

      // staff
      for (const s of staff) {
        if (s.kind === 'clerk') continue;
        const arrived = walk(s, dt, s.kind === 'janitor' ? 3 : s.kind === 'waiter' ? 3.6 : 3.2);
        if (!arrived) continue;
        if (s.kind === 'waiter') { // kitchen -> room -> kitchen
          const want = guests.find(gst => wantsTray(gst) && !staff.some(o => o !== s && o.target === gst));
          if (s.tray && s.target && wantsTray(s.target) && dist(s, s.target) < 1.4) { deliver(s.target, s); s.target = null; continue; }
          if (s.tray && s.target && wantsTray(s.target)) { const r = s.target.room; s.path = route(s, { x: r.bed.x + (r.side === 'L' ? .85 : -.85), y: r.bed.y }); continue; } // to the bedside
          if (s.tray && !s.target) { s.target = want || null; if (!want && dist(s, SPOT.tray) > .8) s.path = route(s, SPOT.tray); continue; }
          if (!s.tray && want && trays) { if (dist(s, SPOT.tray) < .8) { trays--; s.tray = 1; s.target = want; } else s.path = route(s, SPOT.tray); continue; }
          s.target = null;
          if (dist(s, SPOT.tray) > .8) s.path = route(s, { x: SPOT.tray.x - .6, y: SPOT.tray.y + .6 });
          continue;
        }
        if (s.making) { if (s.job.made) { s.making = false; s.job = null; } continue; }
        if (s.dumping) { if (s.carry.length) { s.t -= dt; if (s.t <= 0) { s.t = .15; s.carry.pop(); cash += 1; earned += 1; } continue; } s.dumping = false; }
        // next thing to do
        const mine = s.job ? trash.filter(t => t.room === s.job.i) : [];
        const full = s.carry.length >= 6;
        const moreWork = s.kind === 'maid' && (mine.length || (s.job && !s.job.made) || rooms.some(r => r.state === 'dirty' && !r.claim));
        // only head to a bin when full, or when there's nothing left to clean
        const bedFirst = s.kind === 'maid' && s.job && !s.job.made && !mine.length; // making a bed doesn't need free hands
        if (!bedFirst && (full || (s.carry.length && !moreWork && !(s.kind === 'janitor' && trash.some(t => t.room < 0))))) { const b = nearestBin(s); s.path = route(s, { x: b.x - .3, y: b.y + .5 }); s.dumping = true; s.t = .15; continue; }
        if (s.kind === 'maid') {
          if (!s.job) { s.job = rooms.filter(r => r.state === 'dirty' && !r.claim).sort((a, b) => dist(s, a.bed) - dist(s, b.bed))[0] || null; if (s.job) s.job.claim = s; }
          if (s.job) {
            const near = trash.filter(t => t.room === s.job.i).sort((a, b) => dist(s, a) - dist(s, b))[0];
            if (near && dist(s, near) < .4) { trash.splice(trash.indexOf(near), 1); s.carry.push(near.c); roomDone(s.job); continue; }
            if (near) { s.path = route(s, near); continue; }
            if (!s.job.made) { if (dist(s, s.job.bed) > 1.05) s.path = route(s, { x: s.job.bed.x + (s.job.side === 'L' ? .85 : -.85), y: s.job.bed.y }); else s.making = true; continue; } // stand beside the bed (with slack, so rounding can't loop)
            s.job.claim = null; s.job = null; continue;
          }
        }
        const litter = trash.filter(t => t.room < 0).sort((a, b) => dist(s, a) - dist(s, b))[0];
        if (litter && (s.kind === 'janitor' || !staff.some(o => o.kind === 'janitor'))) {
          if (dist(s, litter) < .4) { trash.splice(trash.indexOf(litter), 1); s.carry.push(litter.c); } else s.path = route(s, litter);
          continue;
        }
        if (dist(s, SPOT.closet) > .6) s.path = route(s, { x: SPOT.closet.x + (staff.indexOf(s) % 3) * .5, y: SPOT.closet.y });
      }

      for (const f of floaters) f.t += dt;
      while (floaters.length && floaters[0].t > 1.1) floaters.shift();
      for (const f of flying) f.t += dt;
      for (let i = flying.length - 1; i >= 0; i--) if (flying[i].t > .45) flying.splice(i, 1);

      saveT -= dt; if (saveT <= 0) { saveT = 2; save(); }
    }

    // ---------- what to do next (hint + arrow) ----------
    function objective() {
      const dirty = rooms.find(r => r.state === 'dirty');
      if (P.carry.length >= R.cap) return [nearestBin(P), 'Hands full: drop the trash in a bin'];
      const order = guests.find(gst => gst.state === 'sleep' && gst.order && !gst.order.done && gst.order.in <= 0 && !staff.some(s => s.target === gst));
      if (order && P.trays) return [order, 'Bring the tray to the guest 🍳'];
      if (order && trays && !staff.some(s => s.kind === 'waiter')) return [SPOT.tray, 'Room service! Grab a tray from the kitchen'];
      if (piles.desk >= 20 || (piles.desk && !queued().length)) return [SPOT.cash, 'Grab your cash from the desk'];
      if (piles.vend >= 9) return [SPOT.vendCash, 'Collect the vending cash'];
      const front = queued().find(gst => freeRoomFor(gst));
      if (front && !staff.some(s => s.kind === 'clerk')) return [SPOT.desk, 'Stand behind the desk to check in'];
      if (dirty && !staff.some(s => s.kind === 'maid' && s.job === dirty)) {
        const t = trash.find(t2 => t2.room === dirty.i);
        if (t && P.carry.length < R.cap) return [t, 'Clean the messy room: grab the trash'];
        if (!dirty.made) return [dirty.bed, 'Make the bed'];
      }
      if (P.carry.length) return [nearestBin(P), 'Drop the trash in a bin'];
      const pad = visiblePads().find(b => starsOk(b) && cash + (padProgress[b.id] || 0) >= b.price);
      if (pad) return [pad.at, `Build ${pad.label}: stand on the pad`];
      const picky = queued().find(gst => !freeRoomFor(gst) && GUESTS[gst.kind].min > 0);
      if (picky) return [null, `${GUESTS[picky.kind].icon} wants a ${TIERS[GUESTS[picky.kind].min].name} room: upgrade one`];
      const locked = visiblePads().find(b => !starsOk(b));
      if (locked) return [null, `${locked.label} needs ${'★'.repeat(locked.stars)}: serve guests fast to earn stars`];
      if (piles.desk) return [SPOT.cash, 'Grab your cash'];
      const lit = trash.find(t => t.room < 0);
      if (lit && P.carry.length < R.cap) return [lit, 'Tidy the lobby'];
      if (queued().length && !front) return [null, 'All rooms full: build more!'];
      return [null, ''];
    }

    // ---------- drawing ----------
    const sx = x => (x - camX) * T, sy = y => (y - camY) * T;
    function rrect(x, y, w, h, r) {
      g.beginPath();
      if (g.roundRect) return g.roundRect(x, y, w, h, r);
      r = Math.min(r, w / 2, h / 2); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); // iOS < 16
    }
    function drawChar(c, kind) {
      const x = sx(c.x), y = sy(c.y), bob = Math.abs(Math.sin(c.walk * 3.4)) * T * .06, s = T;
      g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(x, y + s * .05, s * .3, s * .12, 0, 0, 7); g.fill();
      const body = kind === 'player' ? '#FFD25A' : kind === 'clerk' ? '#3F7BE0' : kind === 'maid' ? '#AE8CFF' : kind === 'janitor' ? '#FF8A4C' : kind === 'waiter' ? '#FFFFFF' : c.kind === 'business' ? '#3A3F5C' : c.kind === 'celebrity' ? '#FF4FA0' : c.color;
      g.lineWidth = Math.max(2, s * .06); g.strokeStyle = '#0D0920';
      rrect(x - s * .24, y - s * .62 - bob, s * .48, s * .58, s * .2); g.fillStyle = body; g.fill(); g.stroke();
      if (kind === 'maid') { rrect(x - s * .15, y - s * .4 - bob, s * .3, s * .32, s * .08); g.fillStyle = '#fff'; g.fill(); }
      if (kind === 'waiter') { g.fillStyle = '#0D0920'; g.beginPath(); g.moveTo(x - s * .08, y - s * .58 - bob); g.lineTo(x + s * .08, y - s * .58 - bob); g.lineTo(x, y - s * .5 - bob); g.fill(); }
      g.beginPath(); g.arc(x, y - s * .78 - bob, s * .22, 0, 7); g.fillStyle = '#FFDDB8'; g.fill(); g.stroke();
      g.fillStyle = '#0D0920'; g.beginPath(); g.arc(x + c.face * s * .09, y - s * .8 - bob, s * .035, 0, 7); g.fill();
      if (kind === 'player') { rrect(x - s * .2, y - s * 1.02 - bob, s * .4, s * .14, s * .05); g.fillStyle = '#E0324B'; g.fill(); g.stroke(); }
      if (kind === 'clerk') { g.fillStyle = '#0D0920'; g.fillRect(x - s * .04, y - s * .55 - bob, s * .08, s * .2); }
      if (kind === 'janitor') { rrect(x - s * .2, y - s * 1.0 - bob, s * .4, s * .12, s * .05); g.fillStyle = '#4FE3B2'; g.fill(); g.stroke(); }
      if (kind === 'waiter') { rrect(x - s * .18, y - s * 1.08 - bob, s * .36, s * .2, s * .06); g.fillStyle = '#FFFFFF'; g.fill(); g.stroke(); }
      if (c.hat && kind === 'guest') { rrect(x - s * .22, y - s * 1.0 - bob, s * .44, s * .1, s * .05); g.fillStyle = c.kind === 'business' ? '#1E1438' : '#5A3E2B'; g.fill(); }
      if (c.bag) { rrect(x + c.face * s * .26 - s * .1, y - s * .35, s * .2, s * .26, s * .05); g.fillStyle = c.kind === 'business' ? '#2B2340' : '#C9A27A'; g.fill(); g.stroke(); }
      if (kind === 'guest') { // who they are, how patient, and whether they want room service
        const tag = (c.regular ? '♥' : '') + GUESTS[c.kind].icon;
        if (c.state === 'queue' || c.kind !== 'backpacker' || c.regular) { g.font = `${s * .3}px sans-serif`; g.textAlign = 'center'; g.fillText(tag, x, y - s * 1.2 - bob); }
        if (c.state === 'queue' && c.wait > c.patience * .4) { const k = 1 - c.wait / c.patience; rrect(x - s * .3, y - s * 1.45 - bob, s * .6, s * .09, s * .04); g.fillStyle = 'rgba(13,9,32,.6)'; g.fill(); rrect(x - s * .3, y - s * 1.45 - bob, s * .6 * Math.max(0, k), s * .09, s * .04); g.fillStyle = k > .3 ? '#FFD25A' : '#FF5A4E'; g.fill(); }
        if (c.order && !c.order.done && c.order.in <= 0) { const k = c.order.left / 22; g.font = `${s * .5}px sans-serif`; g.fillText('🍳', x + s * .4, y - s * 1.2); ring(c.x + .4, c.y - 1.7, k, k > .35 ? '#4FE3B2' : '#FF5A4E'); }
      }
      if (c.state === 'sleep') { g.fillStyle = '#fff'; g.font = `600 ${s * .3}px Fredoka, sans-serif`; g.fillText('z', x + s * .3, y - s * 1.1 - Math.sin(performance.now() / 400) * s * .1); }
      const stack = kind === 'player' ? P.carry : c.carry;
      if (stack?.length) stack.forEach((col, i) => {
        rrect(x - s * .2, y - s * 1.22 - bob - i * s * .17, s * .4, s * .2, s * .08); g.fillStyle = col; g.fill(); g.lineWidth = Math.max(1.5, s * .04); g.stroke();
      });
      const nTray = kind === 'player' ? P.trays : c.tray || 0;
      for (let i = 0; i < nTray; i++) { g.font = `${s * .36}px sans-serif`; g.textAlign = 'center'; g.fillText('🍳', x + c.face * s * .35, y - s * .5 - bob - i * s * .2); }
    }
    function draw() {
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
      const d = Math.min(devicePixelRatio || 1, 2); g.setTransform(d, 0, 0, d, 0, 0);
      g.fillStyle = '#1A1238'; g.fillRect(0, 0, W, H);
      const x0 = Math.max(0, Math.floor(camX)), x1 = Math.min(COLS, Math.ceil(camX + W / T) + 1), y0 = Math.max(0, Math.floor(camY)), y1 = Math.min(ROWS, Math.ceil(camY + H / T) + 1);
      // floors
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const t = grid[y][x], X = sx(x), Y = sy(y);
        if (t === FLOOR || t === DESK) { g.fillStyle = (x + y) % 2 ? '#F1DFC0' : '#E8D2AC'; g.fillRect(X, Y, T + 1, T + 1); }
        else if (t === CORR) {
          const closed = (y < WING_TOP[0] && !wingOpen(1)) || (y < WING_TOP[1] && !wingOpen(2));
          g.fillStyle = closed ? '#2E2458' : corrColor; g.fillRect(X, Y, T + 1, T + 1);
          if (!closed && (x === 6 || x === 8)) { g.fillStyle = '#D8A93C'; g.fillRect(x === 6 ? X + T * .12 : X + T * .82, Y, T * .06, T + 1); }
        } else if (t === ROOM || t === DOOR) {
          const r = rooms.find(rm => t === DOOR ? rm.door.x === x && rm.door.y === y : x >= rm.x0 && x < rm.x0 + 4 && y >= rm.r0 && y < rm.r0 + 3);
          g.fillStyle = r?.open ? (t === DOOR ? '#C98A50' : ROOM_COLORS[r.i % ROOM_COLORS.length]) : '#2E2458'; g.fillRect(X, Y, T + 1, T + 1);
          if (r?.open && t === ROOM && (x + y) % 2) { g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(X, Y, T + 1, T + 1); }
          if (r?.open && t === ROOM && r.tier) { g.fillStyle = r.tier === 2 ? 'rgba(255,158,196,.22)' : 'rgba(255,224,138,.18)'; g.fillRect(X, Y, T + 1, T + 1); }
        } else if (t === OUT) { g.fillStyle = y === 58 ? '#7C7894' : '#4D4A66'; g.fillRect(X, Y, T + 1, T + 1); if (y === 59 && x % 3 === 0) { g.fillStyle = '#FFD25A'; g.fillRect(X + T * .2, Y + T * .45, T * .6, T * .1); } }
      }
      // walls with a little height
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const t = grid[y][x], X = sx(x), Y = sy(y);
        const isLocked = t === DOOR && !rooms.find(rm => rm.door.x === x && rm.door.y === y)?.open;
        if (t === WALL || isLocked) {
          g.fillStyle = isLocked ? '#8A5A33' : '#6B4FB0'; g.fillRect(X, Y, T + 1, T + 1);
          if (y + 1 < ROWS && grid[y + 1][x] !== WALL) { g.fillStyle = isLocked ? '#6B4224' : '#4A3487'; g.fillRect(X, Y + T * .62, T + 1, T * .38); }
          if (isLocked) { g.font = `${T * .45}px sans-serif`; g.textAlign = 'center'; g.fillText('🔒', X + T / 2, Y + T * .62); }
        }
      }
      // a closed wing's gate across the hallway
      for (const w of [1, 2]) if (!wingOpen(w)) {
        const gy = WING_TOP[w - 1] - .15; if (gy < camY - 1 || gy > camY + H / T + 1) continue;
        rrect(sx(6), sy(gy - .35), T * 3, T * .5, T * .1); g.fillStyle = '#8A5A33'; g.fill(); g.stroke();
        g.font = `600 ${T * .3}px Fredoka, sans-serif`; g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(`🔒 Wing ${w + 1}`, sx(7.5), sy(gy - .02));
      }
      // furniture
      g.lineWidth = Math.max(2, T * .06); g.strokeStyle = '#0D0920'; g.textAlign = 'center';
      for (const r of rooms) {
        if (r.r0 > camY + H / T + 2 || r.r0 + 3 < camY - 2) continue;
        const X = sx(r.bed.x - .75), Y = sy(r.bed.y - 1.1);
        if (!r.open) { g.fillStyle = 'rgba(255,255,255,.08)'; g.font = `600 ${T * .32}px Fredoka, sans-serif`; g.fillText('Room ' + (r.i + 1), sx(r.inside.x), sy(r.inside.y)); continue; }
        rrect(X, Y, T * 1.5, T * 2.2, T * .2); g.fillStyle = r.tier === 2 ? '#4A2A5A' : '#7A4A26'; g.fill(); g.stroke();
        rrect(X + T * .12, Y + T * .12, T * 1.26, T * .5, T * .15); g.fillStyle = '#FFFFFF'; g.fill(); g.stroke();
        if (r.made) { rrect(X + T * .12, Y + T * .75, T * 1.26, T * 1.32, T * .15); g.fillStyle = r.tier ? TIERS[r.tier].color : paid.has('luxury') ? '#FFD25A' : '#F7F2FF'; g.fill(); g.stroke(); }
        else { g.beginPath(); g.moveTo(X + T * .2, Y + T * .8); g.quadraticCurveTo(X + T * 1.4, Y + T * .7, X + T * 1.3, Y + T * 1.3); g.quadraticCurveTo(X + T * .4, Y + T * 2.3, X + T * .15, Y + T * 1.7); g.closePath(); g.fillStyle = '#D8D0E8'; g.fill(); g.stroke(); }
        if (r.tier) { g.font = `${T * .36}px sans-serif`; g.fillText(r.tier === 2 ? '👑' : '🛋️', sx(r.inside.x + (r.side === 'L' ? .9 : -.9)), sy(r.r0 + .6)); }
        const pr = progress.bed.get(r.i); if (pr) ring(r.bed.x, r.bed.y, pr, '#4FE3B2');
      }
      // desk, bins, vending, kitchen, lounge, spa, pool
      rrect(sx(2), sy(51), T * 3, T * .95, T * .15); g.fillStyle = '#9C5B2E'; g.fill(); g.stroke();
      rrect(sx(2), sy(51), T * 3, T * .32, T * .12); g.fillStyle = '#C98A50'; g.fill(); g.stroke();
      g.font = `${T * .4}px sans-serif`; g.fillText('🛎️', sx(4.4), sy(51.45));
      g.fillText('🗑️', sx(SPOT.bin.x), sy(SPOT.bin.y + .25)); ringDash(SPOT.bin, .95, '#4FE3B2');
      for (const [id, p] of Object.entries(CHUTES)) if (paid.has(id)) { g.font = `${T * .5}px sans-serif`; g.fillText('🕳️', sx(p.x), sy(p.y + .25)); ringDash(p, .95, '#4FE3B2'); }
      if (paid.has('vend')) { rrect(sx(12.1), sy(53.6), T * .85, T * 1.3, T * .12); g.fillStyle = '#E0324B'; g.fill(); g.stroke(); rrect(sx(12.2), sy(53.75), T * .6, T * .7, T * .08); g.fillStyle = '#8FD0FF'; g.fill(); }
      if (paid.has('kitchen')) {
        rrect(sx(11.75), sy(51.75), T * 1.5, T * .85, T * .12); g.fillStyle = '#C9D3E0'; g.fill(); g.stroke();
        g.font = `${T * .42}px sans-serif`; g.fillText('🍳', sx(12.7), sy(52.35));
        for (let i = 0; i < trays; i++) { g.font = `${T * .3}px sans-serif`; g.fillText('🥞', sx(SPOT.tray.x + (i - 1) * .3), sy(SPOT.tray.y + .1)); }
      }
      if (paid.has('lounge')) { g.font = `${T * .8}px sans-serif`; g.fillText('🛋️', sx(9.6), sy(54.5)); g.fillText('🪴', sx(13.2), sy(49.9)); g.fillText('🪴', sx(1.4), sy(57)); }
      if (paid.has('spa')) { g.font = `${T * .6}px sans-serif`; g.fillText('🧖', sx(11), sy(49.9)); }
      if (paid.has('pool')) { g.font = `${T * .6}px sans-serif`; g.fillText('🏊', sx(9.6), sy(49.9)); }
      // cash piles
      for (const [k, spot] of [['desk', SPOT.cash], ['vend', SPOT.vendCash]]) {
        const n = Math.min(10, Math.ceil(piles[k] / 4));
        for (let i = 0; i < n; i++) { rrect(sx(spot.x) - T * .28 + (i % 2) * T * .05, sy(spot.y) - i * T * .07, T * .56, T * .26, T * .05); g.fillStyle = '#5CC97A'; g.fill(); g.lineWidth = Math.max(1.5, T * .035); g.stroke(); }
      }
      g.lineWidth = Math.max(2, T * .06);
      // build pads (greyed until you have the stars)
      for (const b of [...visiblePads(), ...tierPads()]) {
        const X = sx(b.at.x), Y = sy(b.at.y), s = T * 1.3, have = padProgress[b.id] || 0, ok = starsOk(b);
        if (Y < -T * 2 || Y > H + T * 2) continue;
        g.save(); g.setLineDash([T * .14, T * .1]); rrect(X - s / 2, Y - s / 2, s, s, T * .2); g.fillStyle = ok ? 'rgba(255,210,90,.18)' : 'rgba(255,255,255,.08)'; g.fill(); g.strokeStyle = ok ? '#FFD25A' : 'rgba(255,255,255,.45)'; g.stroke(); g.restore();
        if (have) { g.save(); rrect(X - s / 2, Y - s / 2, s, s, T * .2); g.clip(); g.fillStyle = 'rgba(79,227,178,.55)'; g.fillRect(X - s / 2, Y + s / 2 - s * have / b.price, s, s * have / b.price); g.restore(); }
        g.font = `${T * .5}px sans-serif`; g.globalAlpha = ok ? 1 : .5; g.fillText(b.icon, X, Y + T * .05); g.globalAlpha = 1;
        g.font = `600 ${T * .28}px Fredoka, sans-serif`; g.fillStyle = '#fff'; g.strokeStyle = '#0D0920'; g.lineWidth = 3;
        const label = ok ? `$${b.price - have}` : '★'.repeat(b.stars); g.strokeText(label, X, Y + T * .48); g.fillStyle = ok ? '#fff' : '#FFD25A'; g.fillText(label, X, Y + T * .48);
        g.fillStyle = '#fff'; g.font = `600 ${T * .22}px Fredoka, sans-serif`; g.strokeText(b.label, X, Y - T * .5); g.fillText(b.label, X, Y - T * .5); g.lineWidth = Math.max(2, T * .06);
      }
      // trash
      for (const t of trash) { const X = sx(t.x), Y = sy(t.y); if (Y < -T || Y > H + T) continue; g.beginPath(); if (t.k === 0) g.arc(X, Y, T * .13, 0, 7); else rrect(X - T * .13, Y - T * .1, T * .26, T * .2, T * .06); g.fillStyle = t.c; g.fill(); g.lineWidth = Math.max(1.5, T * .04); g.stroke(); }
      g.lineWidth = Math.max(2, T * .06);
      // people, back to front
      const people = [...guests.map(c => [c, 'guest']), ...staff.map(c => [c, c.kind]), [P, 'player']].sort((a, b) => a[0].y - b[0].y);
      for (const [c, k] of people) if (sy(c.y) > -T * 2 && sy(c.y) < H + T * 2) drawChar(c, k);
      if (progress.desk > 0) ring(SPOT.desk.x, SPOT.desk.y - 1.2, progress.desk, '#FFD25A');
      // flying coins/bills/trash
      for (const f of flying) {
        if (f.t < 0) continue;
        const k = Math.min(1, f.t / .45), tgt = f.tx === 'player' ? { x: P.x, y: P.y - 1 } : f.tx;
        const x = f.x + (tgt.x - f.x) * k, y = f.y + (tgt.y - f.y) * k - Math.sin(k * Math.PI) * 1.2;
        if (f.kind === 'coin') { g.beginPath(); g.arc(sx(x), sy(y), T * .12, 0, 7); g.fillStyle = '#FFD25A'; g.fill(); g.stroke(); }
        else { rrect(sx(x) - T * .15, sy(y) - T * .08, T * .3, T * .16, T * .04); g.fillStyle = f.kind === 'bill' ? '#5CC97A' : '#E8E2D0'; g.fill(); g.stroke(); }
      }
      // objective arrow
      const [target] = objective();
      if (target) {
        const X = sx(target.x), Y = sy(target.y) - T * (1.1 + Math.abs(Math.sin(performance.now() / 250)) * .25);
        if (X > 10 && X < W - 10 && Y > 10 && Y < H - 10) { g.beginPath(); g.moveTo(X, Y + T * .3); g.lineTo(X - T * .22, Y); g.lineTo(X + T * .22, Y); g.closePath(); g.fillStyle = '#FFD25A'; g.fill(); g.stroke(); }
        else { // edge pointer toward an off-screen target
          const cx = W / 2, cy = H / 2, a = Math.atan2(Y - cy, X - cx), ex = cx + Math.cos(a) * (W / 2 - 26), ey = cy + Math.sin(a) * (H / 2 - 26);
          g.save(); g.translate(ex, ey); g.rotate(a); g.beginPath(); g.moveTo(T * .35, 0); g.lineTo(-T * .15, -T * .25); g.lineTo(-T * .15, T * .25); g.closePath(); g.fillStyle = '#FFD25A'; g.fill(); g.stroke(); g.restore();
        }
      }
      // floating text
      g.font = `600 ${T * .4}px Fredoka, sans-serif`;
      for (const f of floaters) { g.globalAlpha = 1 - f.t / 1.1; g.fillStyle = f.color; g.lineWidth = 4; g.strokeText(f.text, sx(f.x), sy(f.y - f.t)); g.fillText(f.text, sx(f.x), sy(f.y - f.t)); }
      g.globalAlpha = 1;
    }
    function ring(x, y, v, col) {
      g.beginPath(); g.arc(sx(x), sy(y), T * .32, 0, 7); g.fillStyle = 'rgba(13,9,32,.6)'; g.fill();
      g.beginPath(); g.arc(sx(x), sy(y), T * .26, -Math.PI / 2, -Math.PI / 2 + v * Math.PI * 2); g.strokeStyle = col; g.lineWidth = T * .1; g.stroke();
      g.strokeStyle = '#0D0920'; g.lineWidth = Math.max(2, T * .06);
    }
    function ringDash(p, r, col) { g.save(); g.setLineDash([T * .12, T * .1]); g.beginPath(); g.arc(sx(p.x), sy(p.y + .3), T * r * .7, 0, 7); g.strokeStyle = col; g.lineWidth = 2; g.stroke(); g.restore(); }

    // ---------- finishing an inn: open the next one in a new town ----------
    const nextTown = CHAIN.towns[(chain.inns + 1) % CHAIN.towns.length];
    function openNextInn() {
      wiped = true; writeSave(CHAIN_SAVE, { inns: chain.inns + 1 }); writeSave(SAVE, null);
      confetti(root, 140); setTimeout(restart, 50);
    }
    function finished() {
      panel(el, { title: 'Five-star hotel!', mood: 'win',
        html: `<p style="text-align:center">You built all of ${town}'s inn. Keep it running, or open your next inn in <b>${nextTown}</b> and start fresh with <b>+${CHAIN.bonus * 100}%</b> more for every room, for good.</p>`,
        buttons: [{ label: 'Keep playing' }, { label: `Open in ${nextTown}`, primary: true, onClick: openNextInn }] });
    }

    // ---------- loop ----------
    let hintText = '';
    function frame(now) {
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      if (document.visibilityState === 'visible') update(dt);
      camX += (P.x - W / T / 2 - camX) * Math.min(1, dt * 6); camY += (P.y - H / T / 2 - camY) * Math.min(1, dt * 6);
      camX = Math.max(-.5, Math.min(COLS + .5 - W / T, camX)); camY = Math.max(-.5, Math.min(ROWS - H / T, camY));
      if (W / T > COLS + 1) camX = (COLS - W / T) / 2;
      draw();
      const [, hint] = objective(); if (hint !== hintText) { hintText = hint; hintEl.textContent = hint; }
      stat.innerHTML = pills([{ value: `💵 ${cash}`, cls: 'star' }, { value: '★'.repeat(stars()) + '☆'.repeat(5 - stars()), cls: 'lvl' }, { label: 'Carry', value: `${P.carry.length}/${R.cap}` }]);
      raf = requestAnimationFrame(frame);
    }
    function resize() {
      const d = Math.min(devicePixelRatio || 1, 2); W = root.clientWidth; H = root.clientHeight;
      cv.width = Math.round(W * d); cv.height = Math.round(H * d); T = Math.round(Math.max(36, Math.min(58, W / 9)));
    }
    const ro = new ResizeObserver(resize); ro.observe(root); resize();
    camX = P.x - W / T / 2; camY = P.y - H / T / 2;

    el.querySelector('.info').onclick = () => {
      const done = paid.size === BUILDS.length, suites = rooms.filter(r => r.open && r.tier === 2).length, comfy = rooms.filter(r => r.open && r.tier === 1).length;
      panel(el, {
        title: `${town} Inn`, dismissable: true,
        html: `<p>Reputation <b>${'★'.repeat(stars())}${'☆'.repeat(5 - stars())}</b> (${rating.toFixed(1)}) · regulars <b>♥ ${regulars}</b><br>Rooms <b>${R.rooms}/24</b> · comfy <b>${comfy}</b> · suites <b>${suites}</b> · earned <b>$${earned}</b>` +
          `${chain.inns ? `<br>Inn chain: <b>${chain.inns + 1}</b> inns · <b>+${chain.inns * CHAIN.bonus * 100}%</b> on every room` : ''}</p>` +
          `<p style="font-size:13px;opacity:.8">💼 business guests want Comfy rooms, ⭐ celebrities want Suites (and 4★). Stand inside an empty room to upgrade it. Slow check-ins and missed room service cost stars.</p><div class="ht-goals">` +
          BUILDS.map(b => `<div class="${paid.has(b.id) ? 'done' : ''}"><span>${b.icon} ${b.label}${b.stars ? ' ' + '★'.repeat(b.stars) : ''}</span><b>$${b.price}</b></div>`).join('') + '</div>',
        buttons: [...(done ? [{ label: `Open in ${nextTown}`, onClick: openNextInn }] : []), { label: 'Back to work', primary: true }],
      });
    };

    // read-only-ish handle for the automated browser check (scripts/verify.mjs)
    root._dbg = { P, piles, rooms, guests, trash, paid, staff, get cash() { return cash; }, set cash(v) { cash = v; }, get rating() { return rating; }, set rating(v) { rating = v; }, get trays() { return trays; }, objective, update, applyBuild: id => { paid.add(id); applyBuild(BUILDS.find(b => b.id === id)); } };
    raf = requestAnimationFrame(frame);
    return () => { dead = true; cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); save(); el.querySelectorAll('.ov').forEach(o => o.remove()); };
  }
}
