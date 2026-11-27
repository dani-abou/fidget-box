// Tiny Inn: run a little hotel. Drag anywhere to walk.
//   Guests queue at the desk -> stand behind it to check them in -> they pay
//   (cash piles up on the desk; walk over it) -> they sleep, then leave a
//   messy room -> run over trash to carry it (it stacks on your head), drop it
//   in the bin, make the bed -> the room is ready again.
// Spend cash by standing on build pads: rooms, staff (clerk, housekeepers,
// janitor), a vending machine and upgrades. To add something to build, add an
// entry to BUILDS. Progress is saved as you play.
import { ac, buzz, click, tone } from '../lib/sound.js';
import { loadSave, writeSave } from '../lib/progress.js';
import { pills, panel } from '../lib/ui.js';
import { confetti } from '../lib/fx.js';

// ---------- the map (tile units; x across, y down) ----------
const COLS = 15, ROWS = 28;
const WALL = 0, FLOOR = 1, CORR = 2, ROOM = 3, DOOR = 4, DESK = 5, OUT = 6;
const ROOM_COLORS = ['#3FB6A8', '#9C7BEA', '#E58A5C', '#5E9BE6', '#D46FA6', '#7FBF5A', '#E0B248', '#6A7FD8'];
// Rooms nearest the lobby come first; that's the order they're built in.
const ROOMS = [];
for (let i = 3; i >= 0; i--) for (const side of ['L', 'R']) {
  const r0 = 1 + i * 4;
  ROOMS.push({ side, r0, x0: side === 'L' ? 1 : 10, door: { x: side === 'L' ? 5 : 9, y: r0 + 1 },
    bed: { x: side === 'L' ? 1.9 : 13.1, y: r0 + 1.5 }, inside: { x: side === 'L' ? 3.6 : 11.4, y: r0 + 1.5 } });
}
function buildGrid() {
  const g = Array.from({ length: ROWS }, () => new Array(COLS).fill(WALL));
  for (let y = 1; y <= 16; y++) for (let x = 6; x <= 8; x++) g[y][x] = CORR;
  for (const r of ROOMS) {
    for (let y = r.r0; y < r.r0 + 3; y++) for (let x = r.x0; x < r.x0 + 4; x++) g[y][x] = ROOM;
    g[r.door.y][r.door.x] = DOOR;
  }
  for (let y = 17; y <= 24; y++) for (let x = 1; x <= 13; x++) g[y][x] = FLOOR;
  for (let x = 6; x <= 8; x++) g[25][x] = FLOOR;
  for (let y = 26; y < ROWS; y++) for (let x = 0; x < COLS; x++) g[y][x] = OUT;
  for (let x = 2; x <= 4; x++) g[19][x] = DESK;
  return g;
}

// ---------- fixed spots ----------
const SPOT = {
  desk: { x: 3.5, y: 18.4 },       // stand here (behind the desk) to check guests in
  clerk: { x: 2.1, y: 18.4 },
  cash: { x: 5.6, y: 18.7 },       // guests' payments pile up here
  bin: { x: 12.4, y: 18.4 },
  vend: { x: 12.6, y: 22.3 }, vendCash: { x: 11.2, y: 22.6 },
  closet: { x: 1.8, y: 23.6 },
  door: { x: 7.5, y: 27.4 },
  hub: { x: 7.5, y: 17.3 },
};
const QUEUE = [[3.5, 20.4], [3.5, 21.4], [3.5, 22.4], [4.6, 23.3], [5.8, 24.1], [7, 24.7]];

// ---------- things to build, in order. Add new ones here. ----------
// at: where the pad sits. need: what must be built first (defaults to the previous entry).
const BUILDS = [
  { id: 'room1', label: 'Room 2', icon: '🛏️', price: 15, room: 1 },
  { id: 'room2', label: 'Room 3', icon: '🛏️', price: 30, room: 2 },
  { id: 'clerk', label: 'Hire clerk', icon: '🧑‍💼', price: 50, at: { x: 1.4, y: 17.6 } },
  { id: 'room3', label: 'Room 4', icon: '🛏️', price: 65, room: 3 },
  { id: 'vend', label: 'Vending', icon: '🥤', price: 45, at: { x: 11.2, y: 21.2 } },
  { id: 'maid1', label: 'Housekeeper', icon: '🧹', price: 90, at: { x: 1.6, y: 22.4 } },
  { id: 'arms', label: 'Big arms', icon: '💪', price: 70, at: { x: 10.4, y: 24.1 } },
  { id: 'room4', label: 'Room 5', icon: '🛏️', price: 110, room: 4 },
  { id: 'shoes', label: 'Fast shoes', icon: '👟', price: 90, at: { x: 9, y: 24.1 } },
  { id: 'room5', label: 'Room 6', icon: '🛏️', price: 150, room: 5 },
  { id: 'janitor', label: 'Janitor', icon: '🧽', price: 160, at: { x: 12.4, y: 24.1 } },
  { id: 'lounge', label: 'Lounge', icon: '🛋️', price: 200, at: { x: 9.6, y: 21.4 } },
  { id: 'room6', label: 'Room 7', icon: '🛏️', price: 240, room: 6 },
  { id: 'maid2', label: '2nd housekeeper', icon: '🧹', price: 260, at: { x: 2.9, y: 22.4 } },
  { id: 'luxury', label: 'Luxury beds', icon: '✨', price: 350, at: { x: 9.6, y: 18.6 } },
  { id: 'room7', label: 'Room 8', icon: '🛏️', price: 400, room: 7 },
];
for (const b of BUILDS) if (b.room !== undefined) {
  const r = ROOMS[b.room]; b.at = { x: r.side === 'L' ? 6.5 : 8.5, y: r.door.y + .5 };
}
const SHOWN = 2; // how many next builds are on the floor at once

export const hotelRules = paid => ({
  rooms: 1 + BUILDS.filter(b => b.room !== undefined && paid.has(b.id)).length,
  cap: paid.has('arms') ? 8 : 4,
  speed: paid.has('shoes') ? 5.4 : 4.2,
  price: paid.has('luxury') ? 14 : 9,
  arrive: paid.has('lounge') ? 3.4 : 5,
  stars: Math.min(5, 1 + Math.floor(paid.size / 4)),
});

const SAVE = 'hotel';
const BODY = ['#5EC6FF', '#FF8A66', '#AE8CFF', '#4FE3B2', '#FFD25A', '#FF6FAE', '#8FD0FF', '#F2A65A'];
const TRASH = ['#E8E2D0', '#FFD25A', '#9BD86B', '#C9A27A'];

export default {
  id: 'hotel',
  name: 'Tiny Inn',
  description: 'Check guests in, grab the cash, clean the rooms. Build it up and hire staff.',
  color: '--pink',
  icon: '<svg viewBox="0 0 40 40" fill="currentColor"><path d="M6 36V12l14-8 14 8v24h-10v-9h-8v9z"/></svg>',
  art: `<svg viewBox="0 0 100 100"><rect x="0" y="74" width="100" height="26" fill="#3A2A7A"/>
    <rect x="16" y="26" width="68" height="54" rx="6" fill="#FFE3EF" stroke="#0D0920" stroke-width="4"/><path d="M10 30 50 8 90 30z" fill="#FF6FAE" stroke="#0D0920" stroke-width="4" stroke-linejoin="round"/>
    <rect x="24" y="36" width="14" height="12" rx="3" fill="#5EC6FF" stroke="#0D0920" stroke-width="3"/><rect x="43" y="36" width="14" height="12" rx="3" fill="#FFD25A" stroke="#0D0920" stroke-width="3"/><rect x="62" y="36" width="14" height="12" rx="3" fill="#5EC6FF" stroke="#0D0920" stroke-width="3"/>
    <rect x="40" y="56" width="20" height="24" rx="3" fill="#9C5B2E" stroke="#0D0920" stroke-width="3"/><circle cx="55" cy="68" r="2" fill="#FFD25A"/>
    <rect x="30" y="17" width="40" height="11" rx="4" fill="#FFD25A" stroke="#0D0920" stroke-width="3"/><text x="50" y="26" font-size="8.5" font-weight="700" text-anchor="middle" font-family="Fredoka,sans-serif" fill="#1E1438">TINY INN</text>
    <circle cx="82" cy="78" r="9" fill="#4FE3B2" stroke="#0D0920" stroke-width="3"/><text x="82" y="82" font-size="11" font-weight="700" text-anchor="middle" font-family="Fredoka,sans-serif" fill="#0D0920">$</text></svg>`,
  meta() {
    const sv = loadSave(SAVE), paid = new Set(sv?.paid || []);
    return pills([{ value: `💵 ${sv?.cash ?? 0}` }, { value: '★'.repeat(hotelRules(paid).stars), cls: 'star' }, { label: 'Built', value: `${paid.size}/${BUILDS.length}` }]);
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
.ht-goals{display:flex;flex-direction:column;gap:6px;margin-top:4px}
.ht-goals div{display:flex;justify-content:space-between;gap:10px;padding:6px 10px;border-radius:12px;background:rgba(0,0,0,.18);color:var(--ink)}
.ht-goals div.done{opacity:.55;text-decoration:line-through}`,

  init(el) {
    el.innerHTML = `<div class="gbar"><span class="stat"></span><button class="ibtn info" aria-label="Hotel plans"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/></svg></button></div>
      <div class="ht"><canvas></canvas><div class="ht-joy"><i></i></div><div class="ht-hint" aria-live="polite"></div></div>`;
    const root = el.querySelector('.ht'), cv = root.querySelector('canvas'), g = cv.getContext('2d');
    const joyEl = root.querySelector('.ht-joy'), knob = joyEl.querySelector('i'), hintEl = root.querySelector('.ht-hint'), stat = el.querySelector('.stat');
    const grid = buildGrid();

    // ---------- state ----------
    const sv = loadSave(SAVE) || {};
    const paid = new Set(sv.paid || []);
    let cash = sv.cash ?? 0, earned = sv.earned ?? 0;
    let R = hotelRules(paid);
    const P = { x: 7.5, y: 21.5, carry: [], face: 1, walk: 0 };
    const rooms = ROOMS.map((r, i) => ({ ...r, i, open: i === 0 || paid.has('room' + i), state: 'clean', made: true, guest: null, claim: null }));
    const guests = [], trash = [], staff = [], floaters = [], flying = [];
    const piles = { desk: sv.deskCash ?? 0, vend: sv.vendCash ?? 0 };
    const progress = { desk: 0, bed: new Map(), pad: null };
    let arriveT = 1, litterT = 8, snackT = 4, saveT = 2, deskBusy = 0;
    let W = 0, H = 0, T = 46, camX = 0, camY = 0, dead = false, raf, last = performance.now(), padPay = 0;

    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const solid = (x, y) => {
      const tx = Math.floor(x), ty = Math.floor(y);
      if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return true;
      const t = grid[ty][tx];
      if (t === WALL || t === DESK) return true;
      if (t === DOOR) return !rooms.find(r => r.door.x === tx && r.door.y === ty)?.open;
      return false;
    };
    const roomAt = p => rooms.find(r => p.x >= r.x0 && p.x < r.x0 + 4 && p.y >= r.r0 && p.y < r.r0 + 3);

    // Routing: every place connects to the corridor spine (x = 7.5).
    function toSpine(p) {
      const r = roomAt(p);
      if (r) return [{ x: r.side === 'L' ? 4.5 : 10.5, y: r.door.y + .5 }, { x: r.door.x + .5, y: r.door.y + .5 }, { x: 7.5, y: r.door.y + .5 }];
      if (p.y < 16.8) return [{ x: 7.5, y: p.y }];
      const out = [];
      if (p.y > 18.9 && p.y < 20.2 && p.x < 5.3) out.push({ x: 5.6, y: p.y < 19.5 ? 18.5 : 20.4 }); // step round the desk
      out.push({ x: 7.5, y: Math.min(p.y, 24.5) > 18 ? 18.2 : p.y }, SPOT.hub);
      return out;
    }
    function route(a, b) {
      if (roomAt(a) && roomAt(a) === roomAt(b)) return [{ ...b }];
      const up = toSpine(a), down = toSpine(b).reverse();
      const lobbyA = a.y >= 16.8 && !roomAt(a), lobbyB = b.y >= 16.8 && !roomAt(b);
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

    // ---------- staff ----------
    function addStaff(kind) {
      if (kind === 'clerk') staff.push({ kind, x: SPOT.clerk.x, y: SPOT.clerk.y, face: 1, walk: 0 });
      else staff.push({ kind, x: SPOT.closet.x + staff.length * .4, y: SPOT.closet.y, face: 1, walk: 0, carry: [], path: [], job: null, t: 0 });
    }
    function applyBuild(b) {
      if (b.room !== undefined) rooms[b.room].open = true;
      if (b.id === 'clerk') addStaff('clerk');
      if (b.id === 'maid1' || b.id === 'maid2') addStaff('maid');
      if (b.id === 'janitor') addStaff('janitor');
      R = hotelRules(paid);
    }
    for (const b of BUILDS) if (paid.has(b.id)) applyBuild(b);
    const visiblePads = () => BUILDS.filter(b => !paid.has(b.id)).slice(0, SHOWN);
    let padProgress = sv.padProgress || {}; // partial payments survive closing the app

    // ---------- helpers ----------
    const float = (x, y, text, color = '#FFD25A') => floaters.push({ x, y, text, color, t: 0 });
    const save = () => writeSave(SAVE, { cash, earned, paid: [...paid], deskCash: piles.desk, vendCash: piles.vend, padProgress });
    function freeRoom() { return rooms.find(r => r.open && r.state === 'clean' && !r.guest); }
    function dropTrash(x, y, room) { trash.push({ x, y, room: room ? room.i : -1, c: TRASH[Math.floor(Math.random() * TRASH.length)], k: Math.floor(Math.random() * 3) }); }
    function roomDone(r) { if (r.made && !trash.some(t => t.room === r.i)) { r.state = 'clean'; r.claim = null; } }

    // ---------- guests ----------
    function spawnGuest() {
      const gst = { x: SPOT.door.x, y: SPOT.door.y + .5, face: 1, walk: 0, path: [], state: 'queue', color: BODY[Math.floor(Math.random() * BODY.length)], hat: Math.random() < .4, bag: true, t: 0 };
      guests.push(gst);
    }
    const queued = () => guests.filter(q => q.state === 'queue');
    function checkIn(gst) {
      const r = freeRoom(); if (!r) return;
      gst.state = 'toRoom'; gst.room = r; r.guest = gst; r.state = 'busy';
      gst.path = route(gst, r.bed);
      piles.desk += R.price; click(2000, .05, .15, 'sine'); tone(1568);
      float(SPOT.cash.x, SPOT.cash.y - .6, '+$' + R.price, '#4FE3B2');
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
      if (arriveT <= 0) { arriveT = R.arrive * (.8 + Math.random() * .4); if (queued().length < QUEUE.length && guests.filter(q => q.state !== 'leave').length < R.rooms + 3) spawnGuest(); }
      const q = queued();
      q.forEach((gst, i) => { const [x, y] = QUEUE[i]; gst.path = gst.y > 24.9 ? [{ x: 7.5, y: 24.6 }, { x, y }] : [{ x, y }]; }); // come in through the doorway
      // desk: check in the front guest when someone's behind it and a room is free
      const front = q[0], atDesk = dist(P, SPOT.desk) < .8, clerk = staff.some(s => s.kind === 'clerk');
      if (front && dist(front, { x: QUEUE[0][0], y: QUEUE[0][1] }) < .05 && (atDesk || clerk) && freeRoom()) {
        progress.desk += dt * ((atDesk ? 1 : 0) + (clerk ? .6 : 0));
        if (progress.desk >= 1) { progress.desk = 0; checkIn(front); }
      } else progress.desk = Math.max(0, progress.desk - dt);
      deskBusy = front && !freeRoom() ? deskBusy + dt : 0;

      for (const gst of [...guests]) {
        const arrived = walk(gst, dt, 2.6);
        if (gst.state === 'queue' && gst.y < 24.3 && Math.random() < dt * .012 && trash.filter(t => t.room < 0).length < 8) dropTrash(Math.max(1.5, Math.min(12.5, gst.x + (Math.random() - .5))), Math.min(24.4, gst.y + .5), null); // litter stays in the lobby
        if (gst.state === 'toRoom' && arrived) { gst.state = 'sleep'; gst.t = 15 + Math.random() * 6; gst.bag = false; }
        else if (gst.state === 'sleep') {
          gst.t -= dt;
          if (gst.t <= 0) {
            const r = gst.room; gst.state = 'leave'; r.guest = null; r.state = 'dirty'; r.made = false;
            const n = 2 + Math.floor(Math.random() * 2);
            for (let k = 0; k < n; k++) dropTrash(r.x0 + .6 + Math.random() * 2.8, r.r0 + .4 + Math.random() * 2.2, r);
            gst.path = [...route(gst, SPOT.hub), { x: 7.5, y: 25 }, { ...SPOT.door }, { x: SPOT.door.x, y: ROWS + 1 }];
          }
        } else if (gst.state === 'leave' && arrived) guests.splice(guests.indexOf(gst), 1);
      }
      // vending: waiting guests buy snacks
      if (paid.has('vend')) { snackT -= dt; if (snackT <= 0) { snackT = 3 + Math.random() * 3; if (q.length > 1) { piles.vend += 3; float(SPOT.vendCash.x, SPOT.vendCash.y - .5, '+$3', '#4FE3B2'); } } }
      // lobby litter now and then
      litterT -= dt; if (litterT <= 0) { litterT = 10 + Math.random() * 8; if (trash.filter(t => t.room < 0).length < 6) dropTrash(2 + Math.random() * 10, 20.5 + Math.random() * 3.5, null); }

      // player pickups: trash, cash piles, bin, beds
      for (const t of [...trash]) if (P.carry.length < R.cap && dist(P, t) < .6) {
        trash.splice(trash.indexOf(t), 1); P.carry.push(t.c); click(900 + P.carry.length * 90, .03, .14, 'triangle'); buzz(6);
        if (t.room >= 0) roomDone(rooms[t.room]);
      }
      for (const [k, spot] of [['desk', SPOT.cash], ['vend', SPOT.vendCash]]) if (piles[k] && dist(P, spot) < 1) {
        const amt = piles[k]; piles[k] = 0; cash += amt; earned += amt;
        for (let i = 0; i < Math.min(8, Math.ceil(amt / 3)); i++) flying.push({ kind: 'bill', x: spot.x, y: spot.y, tx: 'player', t: -i * .05 });
        tone(1319); setTimeout(() => tone(1760), 90); buzz(15); float(P.x, P.y - 1.4, '+$' + amt);
      }
      if (P.carry.length && dist(P, SPOT.bin) < 1.1) {
        P.binT = (P.binT || 0) - dt;
        if (P.binT <= 0) { P.binT = .1; P.carry.pop(); cash += 1; earned += 1; flying.push({ kind: 'trash', x: P.x, y: P.y - 1, tx: 'bin', t: 0 }); click(500, .04, .15, 'triangle'); }
      }
      for (const r of rooms) if (r.state === 'dirty' && !r.made) {
        const near = dist(P, r.bed) < 1.1 || staff.some(s => s.job === r && s.making);
        const v = (progress.bed.get(r.i) || 0) + (near ? dt / 1.2 : -dt);
        progress.bed.set(r.i, Math.max(0, v));
        if (v >= 1) { r.made = true; progress.bed.delete(r.i); click(1200, .05, .15, 'sine'); roomDone(r); }
      }

      // build pads: stand on one to pour cash in
      progress.pad = null;
      for (const b of visiblePads()) {
        if (Math.abs(P.x - b.at.x) < .75 && Math.abs(P.y - b.at.y) < .75) {
          progress.pad = b;
          padPay -= dt;
          if (cash > 0 && padPay <= 0) {
            padPay = .04;
            const have = padProgress[b.id] || 0, amt = Math.min(cash, Math.max(1, Math.ceil(b.price / 30)), b.price - have);
            cash -= amt; padProgress[b.id] = have + amt; flying.push({ kind: 'coin', x: P.x, y: P.y - 1, tx: b.at, t: 0 });
            click(1400 + (have / b.price) * 600, .015, .07, 'triangle');
            if (padProgress[b.id] >= b.price) {
              paid.add(b.id); delete padProgress[b.id]; applyBuild(b);
              [784, 988, 1175, 1568].forEach((f, i) => setTimeout(() => tone(f), i * 90)); buzz(40); confetti(root, 70);
              float(b.at.x, b.at.y - .8, b.label + '!', '#FFFFFF'); save();
              if (paid.size === BUILDS.length) setTimeout(() => !dead && panel(el, { title: 'Five-star hotel!', mood: 'win', html: '<p style="text-align:center">You built everything. The inn runs itself now: enjoy the cash.</p>', buttons: [{ label: 'Keep playing', primary: true }] }), 800);
            }
          }
        }
      }

      // staff
      for (const s of staff) {
        if (s.kind === 'clerk') continue;
        const arrived = walk(s, dt, s.kind === 'janitor' ? 3 : 3.2);
        if (!arrived) continue;
        if (s.making) { if (s.job.made) { s.making = false; s.job = null; } continue; }
        if (s.dumping) { if (s.carry.length) { s.t -= dt; if (s.t <= 0) { s.t = .15; s.carry.pop(); cash += 1; earned += 1; } continue; } s.dumping = false; }
        // next thing to do
        const mine = s.job ? trash.filter(t => t.room === s.job.i) : [];
        const full = s.carry.length >= 6;
        const moreWork = s.kind === 'maid' && (mine.length || (s.job && !s.job.made) || rooms.some(r => r.state === 'dirty' && !r.claim));
        // only head to the bin when full, or when there's nothing left to clean
        const bedFirst = s.kind === 'maid' && s.job && !s.job.made && !mine.length; // making a bed doesn't need free hands
        if (!bedFirst && (full || (s.carry.length && !moreWork && !(s.kind === 'janitor' && trash.some(t => t.room < 0))))) { s.path = route(s, { x: SPOT.bin.x - .3, y: SPOT.bin.y + .5 }); s.dumping = true; s.t = .15; continue; }
        if (s.kind === 'maid') {
          if (!s.job) { s.job = rooms.find(r => r.state === 'dirty' && !r.claim) || null; if (s.job) s.job.claim = s; }
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
      if (P.carry.length >= R.cap) return [SPOT.bin, 'Hands full: drop the trash in the bin'];
      if (piles.desk >= R.price * 2 || (piles.desk && !queued().length)) return [SPOT.cash, 'Grab your cash from the desk'];
      if (piles.vend >= 9) return [SPOT.vendCash, 'Collect the vending cash'];
      const front = queued()[0];
      if (front && freeRoom() && !staff.some(s => s.kind === 'clerk')) return [SPOT.desk, 'Stand behind the desk to check in'];
      if (dirty && !staff.some(s => s.kind === 'maid' && s.job === dirty)) {
        const t = trash.find(t2 => t2.room === dirty.i);
        if (t && P.carry.length < R.cap) return [t, 'Clean the messy room: grab the trash'];
        if (!dirty.made) return [dirty.bed, 'Make the bed'];
      }
      if (P.carry.length) return [SPOT.bin, 'Drop the trash in the bin'];
      const pad = visiblePads().find(b => cash + (padProgress[b.id] || 0) >= b.price);
      if (pad) return [pad.at, `Build ${pad.label}: stand on the pad`];
      if (piles.desk) return [SPOT.cash, 'Grab your cash'];
      const lit = trash.find(t => t.room < 0);
      if (lit && P.carry.length < R.cap) return [lit, 'Tidy the lobby'];
      if (front && !freeRoom()) return [null, 'All rooms full: build more!'];
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
      const body = kind === 'player' ? '#FFD25A' : kind === 'clerk' ? '#3F7BE0' : kind === 'maid' ? '#AE8CFF' : kind === 'janitor' ? '#FF8A4C' : c.color;
      g.lineWidth = Math.max(2, s * .06); g.strokeStyle = '#0D0920';
      rrect(x - s * .24, y - s * .62 - bob, s * .48, s * .58, s * .2); g.fillStyle = body; g.fill(); g.stroke();
      if (kind === 'maid') { rrect(x - s * .15, y - s * .4 - bob, s * .3, s * .32, s * .08); g.fillStyle = '#fff'; g.fill(); }
      g.beginPath(); g.arc(x, y - s * .78 - bob, s * .22, 0, 7); g.fillStyle = '#FFDDB8'; g.fill(); g.stroke();
      g.fillStyle = '#0D0920'; g.beginPath(); g.arc(x + c.face * s * .09, y - s * .8 - bob, s * .035, 0, 7); g.fill();
      if (kind === 'player') { rrect(x - s * .2, y - s * 1.02 - bob, s * .4, s * .14, s * .05); g.fillStyle = '#E0324B'; g.fill(); g.stroke(); }
      if (kind === 'clerk') { g.fillStyle = '#0D0920'; g.fillRect(x - s * .04, y - s * .55 - bob, s * .08, s * .2); }
      if (kind === 'janitor') { rrect(x - s * .2, y - s * 1.0 - bob, s * .4, s * .12, s * .05); g.fillStyle = '#4FE3B2'; g.fill(); g.stroke(); }
      if (c.hat) { rrect(x - s * .22, y - s * 1.0 - bob, s * .44, s * .1, s * .05); g.fillStyle = '#5A3E2B'; g.fill(); }
      if (c.bag) { rrect(x + c.face * s * .26 - s * .1, y - s * .35, s * .2, s * .26, s * .05); g.fillStyle = '#C9A27A'; g.fill(); g.stroke(); }
      if (c.state === 'sleep') { g.fillStyle = '#fff'; g.font = `600 ${s * .3}px Fredoka, sans-serif`; g.fillText('z', x + s * .3, y - s * 1.1 - Math.sin(performance.now() / 400) * s * .1); }
      const stack = kind === 'player' ? P.carry : c.carry;
      if (stack?.length) stack.forEach((col, i) => {
        rrect(x - s * .2, y - s * 1.22 - bob - i * s * .17, s * .4, s * .2, s * .08); g.fillStyle = col; g.fill(); g.lineWidth = Math.max(1.5, s * .04); g.stroke();
      });
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
        else if (t === CORR) { g.fillStyle = '#B23F57'; g.fillRect(X, Y, T + 1, T + 1); if (x === 6 || x === 8) { g.fillStyle = '#D8A93C'; g.fillRect(x === 6 ? X + T * .12 : X + T * .82, Y, T * .06, T + 1); } }
        else if (t === ROOM || t === DOOR) {
          const r = rooms.find(rm => t === DOOR ? rm.door.x === x && rm.door.y === y : x >= rm.x0 && x < rm.x0 + 4 && y >= rm.r0 && y < rm.r0 + 3);
          g.fillStyle = r?.open ? (t === DOOR ? '#C98A50' : ROOM_COLORS[r.i]) : '#2E2458'; g.fillRect(X, Y, T + 1, T + 1);
          if (r?.open && t === ROOM && (x + y) % 2) { g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(X, Y, T + 1, T + 1); }
        } else if (t === OUT) { g.fillStyle = y === 26 ? '#7C7894' : '#4D4A66'; g.fillRect(X, Y, T + 1, T + 1); if (y === 27 && x % 3 === 0) { g.fillStyle = '#FFD25A'; g.fillRect(X + T * .2, Y + T * .45, T * .6, T * .1); } }
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
      // furniture
      g.lineWidth = Math.max(2, T * .06); g.strokeStyle = '#0D0920'; g.textAlign = 'center';
      for (const r of rooms) {
        const X = sx(r.bed.x - .75), Y = sy(r.bed.y - 1.1);
        if (!r.open) { g.fillStyle = 'rgba(255,255,255,.08)'; g.font = `600 ${T * .32}px Fredoka, sans-serif`; g.fillText('Room ' + (r.i + 1), sx(r.inside.x), sy(r.inside.y)); continue; }
        rrect(X, Y, T * 1.5, T * 2.2, T * .2); g.fillStyle = '#7A4A26'; g.fill(); g.stroke();
        rrect(X + T * .12, Y + T * .12, T * 1.26, T * .5, T * .15); g.fillStyle = '#FFFFFF'; g.fill(); g.stroke();
        if (r.made) { rrect(X + T * .12, Y + T * .75, T * 1.26, T * 1.32, T * .15); g.fillStyle = paid.has('luxury') ? '#FFD25A' : '#F7F2FF'; g.fill(); g.stroke(); }
        else { g.beginPath(); g.moveTo(X + T * .2, Y + T * .8); g.quadraticCurveTo(X + T * 1.4, Y + T * .7, X + T * 1.3, Y + T * 1.3); g.quadraticCurveTo(X + T * .4, Y + T * 2.3, X + T * .15, Y + T * 1.7); g.closePath(); g.fillStyle = '#D8D0E8'; g.fill(); g.stroke(); }
        const pr = progress.bed.get(r.i); if (pr) ring(r.bed.x, r.bed.y, pr, '#4FE3B2');
      }
      // desk, bin, vending, lounge
      rrect(sx(2), sy(19), T * 3, T * .95, T * .15); g.fillStyle = '#9C5B2E'; g.fill(); g.stroke();
      rrect(sx(2), sy(19), T * 3, T * .32, T * .12); g.fillStyle = '#C98A50'; g.fill(); g.stroke();
      g.font = `${T * .4}px sans-serif`; g.fillText('🛎️', sx(4.4), sy(19.45));
      g.fillText('🗑️', sx(SPOT.bin.x), sy(SPOT.bin.y + .25)); ringDash(SPOT.bin, .95, '#4FE3B2');
      if (paid.has('vend')) { rrect(sx(12.1), sy(21.6), T * .85, T * 1.3, T * .12); g.fillStyle = '#E0324B'; g.fill(); g.stroke(); rrect(sx(12.2), sy(21.75), T * .6, T * .7, T * .08); g.fillStyle = '#8FD0FF'; g.fill(); }
      if (paid.has('lounge')) { g.font = `${T * .8}px sans-serif`; g.fillText('🛋️', sx(9.6), sy(22.5)); g.fillText('🪴', sx(13.2), sy(17.9)); g.fillText('🪴', sx(1.4), sy(25)); }
      // cash piles
      for (const [k, spot] of [['desk', SPOT.cash], ['vend', SPOT.vendCash]]) {
        const n = Math.min(10, Math.ceil(piles[k] / 4));
        for (let i = 0; i < n; i++) { rrect(sx(spot.x) - T * .28 + (i % 2) * T * .05, sy(spot.y) - i * T * .07, T * .56, T * .26, T * .05); g.fillStyle = '#5CC97A'; g.fill(); g.lineWidth = Math.max(1.5, T * .035); g.stroke(); }
      }
      g.lineWidth = Math.max(2, T * .06);
      // build pads
      for (const b of visiblePads()) {
        const X = sx(b.at.x), Y = sy(b.at.y), s = T * 1.3, have = padProgress[b.id] || 0;
        g.save(); g.setLineDash([T * .14, T * .1]); rrect(X - s / 2, Y - s / 2, s, s, T * .2); g.fillStyle = 'rgba(255,210,90,.18)'; g.fill(); g.strokeStyle = '#FFD25A'; g.stroke(); g.restore();
        if (have) { g.save(); rrect(X - s / 2, Y - s / 2, s, s, T * .2); g.clip(); g.fillStyle = 'rgba(79,227,178,.55)'; g.fillRect(X - s / 2, Y + s / 2 - s * have / b.price, s, s * have / b.price); g.restore(); }
        g.font = `${T * .5}px sans-serif`; g.fillText(b.icon, X, Y + T * .05);
        g.font = `600 ${T * .28}px Fredoka, sans-serif`; g.fillStyle = '#fff'; g.strokeStyle = '#0D0920'; g.lineWidth = 3;
        const label = `$${b.price - have}`; g.strokeText(label, X, Y + T * .48); g.fillText(label, X, Y + T * .48);
        g.font = `600 ${T * .22}px Fredoka, sans-serif`; g.strokeText(b.label, X, Y - T * .5); g.fillText(b.label, X, Y - T * .5); g.lineWidth = Math.max(2, T * .06);
      }
      // trash
      for (const t of trash) { const X = sx(t.x), Y = sy(t.y); g.beginPath(); if (t.k === 0) g.arc(X, Y, T * .13, 0, 7); else rrect(X - T * .13, Y - T * .1, T * .26, T * .2, T * .06); g.fillStyle = t.c; g.fill(); g.lineWidth = Math.max(1.5, T * .04); g.stroke(); }
      g.lineWidth = Math.max(2, T * .06);
      // people, back to front
      const people = [...guests.map(c => [c, 'guest']), ...staff.map(c => [c, c.kind]), [P, 'player']].sort((a, b) => a[0].y - b[0].y);
      for (const [c, k] of people) drawChar(c, k);
      if (progress.desk > 0) ring(SPOT.desk.x, SPOT.desk.y - 1.2, progress.desk, '#FFD25A');
      // flying coins/bills/trash
      for (const f of flying) {
        if (f.t < 0) continue;
        const k = Math.min(1, f.t / .45), tgt = f.tx === 'player' ? { x: P.x, y: P.y - 1 } : f.tx === 'bin' ? SPOT.bin : f.tx;
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
      stat.innerHTML = pills([{ value: `💵 ${cash}`, cls: 'star' }, { value: '★'.repeat(R.stars), cls: 'lvl' }, { label: 'Carry', value: `${P.carry.length}/${R.cap}` }]);
      raf = requestAnimationFrame(frame);
    }
    function resize() {
      const d = Math.min(devicePixelRatio || 1, 2); W = root.clientWidth; H = root.clientHeight;
      cv.width = Math.round(W * d); cv.height = Math.round(H * d); T = Math.round(Math.max(36, Math.min(58, W / 9)));
    }
    const ro = new ResizeObserver(resize); ro.observe(root); resize();
    camX = P.x - W / T / 2; camY = P.y - H / T / 2;

    el.querySelector('.info').onclick = () => panel(el, {
      title: 'Hotel plans', dismissable: true,
      html: `<p>Earned so far: <b>$${earned}</b>. Rooms: <b>${R.rooms}</b>. Room price: <b>$${R.price}</b>.</p><div class="ht-goals">` +
        BUILDS.map(b => `<div class="${paid.has(b.id) ? 'done' : ''}"><span>${b.icon} ${b.label}</span><b>$${b.price}</b></div>`).join('') + '</div>',
      buttons: [{ label: 'Back to work', primary: true }],
    });

    // read-only-ish handle for the automated browser check (scripts/verify.mjs)
    root._dbg = { P, piles, rooms, guests, trash, paid, staff, get cash() { return cash; }, set cash(v) { cash = v; }, objective };
    raf = requestAnimationFrame(frame);
    return () => { dead = true; cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); save(); };
  },
};
