// Sunny Acres art: everything is drawn in code. Sprites that repeat (items,
// crops) are rendered once into small canvases and reused, and the static
// ground (grass, paths, soil, fences) is rendered once into one big canvas,
// so a busy frame is mostly cheap drawImage calls.
import { CONFIG, SEASONS } from './config.js';

export const INK = '#2B1D3A';
const OUT = INK;

function rr(g, x, y, w, h, r) {
  g.beginPath();
  if (g.roundRect) { g.roundRect(x, y, w, h, r); return; }
  r = Math.min(r, w / 2, h / 2); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
export { rr };
function blob(g, fill, lw) { g.fillStyle = fill; g.fill(); g.lineWidth = lw; g.strokeStyle = OUT; g.stroke(); }
// deterministic pseudo-random for decoration (same farm every time)
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };

// ---------- items (drawn centred in an s x s box) ----------
const ITEM = {
  carrot(g, s, lw) {
    g.beginPath(); g.moveTo(s * .5, s * .95); g.quadraticCurveTo(s * .22, s * .5, s * .32, s * .3); g.lineTo(s * .68, s * .3); g.quadraticCurveTo(s * .78, s * .5, s * .5, s * .95); g.closePath(); blob(g, '#FF8A2A', lw);
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = lw * .6; g.beginPath(); g.moveTo(s * .38, s * .5); g.lineTo(s * .5, s * .48); g.moveTo(s * .45, s * .68); g.lineTo(s * .57, s * .66); g.stroke();
    for (const a of [-.5, 0, .5]) { g.beginPath(); g.ellipse(s * (.5 + a * .25), s * .17, s * .07, s * .17, a, 0, 7); blob(g, '#4FB848', lw * .7); }
  },
  corn(g, s, lw) {
    g.beginPath(); g.ellipse(s * .5, s * .5, s * .2, s * .38, 0, 0, 7); blob(g, '#FFD23F', lw);
    g.fillStyle = 'rgba(200,140,0,.45)'; for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { g.beginPath(); g.arc(s * (.44 + j * .12), s * (.3 + i * .13), s * .035, 0, 7); g.fill(); }
    for (const d of [-1, 1]) { g.beginPath(); g.moveTo(s * .5, s * .92); g.quadraticCurveTo(s * (.5 + d * .38), s * .7, s * (.5 + d * .22), s * .35); g.quadraticCurveTo(s * (.5 + d * .12), s * .7, s * .5, s * .92); blob(g, '#5CC24E', lw * .8); }
  },
  wheat(g, s, lw) {
    g.strokeStyle = '#C8932E'; g.lineWidth = lw * 1.1; g.beginPath(); for (const a of [-.18, 0, .18]) { g.moveTo(s * .5, s * .95); g.lineTo(s * (.5 + a), s * .25); } g.stroke();
    for (const a of [-.18, 0, .18]) for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(s * (.5 + a * (1 - i * .15)), s * (.22 + i * .12), s * .06, s * .1, a, 0, 7); blob(g, '#F2C14E', lw * .6); }
    rr(g, s * .36, s * .64, s * .28, s * .1, s * .03); blob(g, '#B5702E', lw * .6);
  },
  egg(g, s, lw) { g.beginPath(); g.ellipse(s * .5, s * .55, s * .27, s * .35, 0, 0, 7); blob(g, '#FFF3DC', lw); g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.ellipse(s * .42, s * .42, s * .06, s * .1, -.4, 0, 7); g.fill(); },
  milk(g, s, lw) {
    rr(g, s * .3, s * .3, s * .4, s * .62, s * .08); blob(g, '#FFFFFF', lw);
    rr(g, s * .36, s * .14, s * .28, s * .2, s * .05); blob(g, '#5EA8FF', lw);
    rr(g, s * .3, s * .52, s * .4, s * .16, 0); g.fillStyle = '#5EA8FF'; g.fill();
  },
  flour(g, s, lw) {
    g.beginPath(); g.moveTo(s * .28, s * .3); g.quadraticCurveTo(s * .5, s * .18, s * .72, s * .3); g.lineTo(s * .8, s * .88); g.quadraticCurveTo(s * .5, s * .98, s * .2, s * .88); g.closePath(); blob(g, '#F4E9D2', lw);
    g.fillStyle = '#C9A26A'; g.font = `700 ${s * .32}px Fredoka, sans-serif`; g.textAlign = 'center'; g.fillText('F', s * .5, s * .74);
  },
  bread(g, s, lw) {
    g.beginPath(); g.ellipse(s * .5, s * .58, s * .4, s * .26, 0, 0, 7); blob(g, '#D98B3A', lw);
    g.beginPath(); g.ellipse(s * .5, s * .5, s * .36, s * .2, 0, 3.3, 6.1); g.lineWidth = lw; g.strokeStyle = '#F2B864'; g.stroke();
    g.strokeStyle = '#8A4E1E'; g.lineWidth = lw * .7; g.beginPath(); for (const x of [.36, .5, .64]) { g.moveTo(s * (x - .04), s * .5); g.lineTo(s * (x + .05), s * .62); } g.stroke();
  },
  pumpkin(g, s, lw) {
    for (const [dx, w] of [[-.2, .2], [.2, .2], [0, .24]]) { g.beginPath(); g.ellipse(s * (.5 + dx), s * .6, s * w, s * .3, 0, 0, 7); blob(g, '#FF8C1A', lw); }
    rr(g, s * .45, s * .16, s * .1, s * .2, s * .03); blob(g, '#5A8A2E', lw * .7);
  },
  cheese(g, s, lw) {
    g.beginPath(); g.moveTo(s * .12, s * .72); g.lineTo(s * .88, s * .72); g.lineTo(s * .88, s * .45); g.lineTo(s * .2, s * .3); g.closePath(); blob(g, '#FFD447', lw);
    g.fillStyle = '#E8A92A'; for (const [x, y, r] of [[.4, .55, .06], [.66, .6, .05], [.75, .5, .035]]) { g.beginPath(); g.arc(s * x, s * y, s * r, 0, 7); g.fill(); }
  },
  wool(g, s, lw) {
    g.beginPath(); for (const [x, y] of [[.35, .55], [.5, .42], [.65, .55], [.5, .65], [.32, .4], [.68, .4]]) { g.moveTo(s * x + s * .17, s * y); g.arc(s * x, s * y, s * .17, 0, 7); }
    g.fillStyle = '#FFFFFF'; g.fill(); g.lineWidth = lw; g.strokeStyle = OUT; g.stroke(); g.fill();
    g.fillStyle = 'rgba(190,190,220,.5)'; g.beginPath(); g.arc(s * .55, s * .55, s * .08, 0, 7); g.fill();
  },
  apple(g, s, lw) {
    g.beginPath(); g.arc(s * .38, s * .58, s * .26, 0, 7); g.arc(s * .62, s * .58, s * .26, 0, 7); blob(g, '#E5484D', lw);
    g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(s * .36, s * .48, s * .06, s * .1, -.5, 0, 7); g.fill();
    g.strokeStyle = '#6B4425'; g.lineWidth = lw; g.beginPath(); g.moveTo(s * .5, s * .36); g.lineTo(s * .53, s * .18); g.stroke();
    g.beginPath(); g.ellipse(s * .63, s * .22, s * .11, s * .06, -.5, 0, 7); blob(g, '#4FB848', lw * .7);
  },
  juice(g, s, lw) {
    rr(g, s * .3, s * .26, s * .4, s * .66, s * .08); blob(g, '#FFB020', lw);
    rr(g, s * .3, s * .5, s * .4, s * .22, 0); g.fillStyle = '#FFFFFF'; g.fill();
    g.beginPath(); g.arc(s * .5, s * .61, s * .08, 0, 7); g.fillStyle = '#E5484D'; g.fill();
    g.strokeStyle = '#FF5A8A'; g.lineWidth = lw * 1.2; g.beginPath(); g.moveTo(s * .58, s * .3); g.lineTo(s * .66, s * .08); g.stroke();
  },
  honey(g, s, lw) {
    rr(g, s * .24, s * .34, s * .52, s * .56, s * .14); blob(g, '#FFB627', lw);
    rr(g, s * .28, s * .2, s * .44, s * .16, s * .05); blob(g, '#C98A50', lw * .8);
    g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.ellipse(s * .36, s * .55, s * .05, s * .12, 0, 0, 7); g.fill();
    g.fillStyle = '#8A4E1E'; g.font = `700 ${s * .2}px Fredoka, sans-serif`; g.textAlign = 'center'; g.fillText('H', s * .55, s * .7);
  },
  cake(g, s, lw) {
    rr(g, s * .16, s * .46, s * .68, s * .42, s * .08); blob(g, '#F6C28B', lw);
    rr(g, s * .16, s * .46, s * .68, s * .12, s * .06); blob(g, '#FFB627', lw * .8);
    g.fillStyle = '#FFB627'; for (const x of [.28, .5, .72]) { g.beginPath(); g.ellipse(s * x, s * .6, s * .05, s * .08, 0, 0, 7); g.fill(); }
    g.beginPath(); g.arc(s * .5, s * .36, s * .09, 0, 7); blob(g, '#E5484D', lw * .7);
  },
  coin(g, s, lw) {
    g.beginPath(); g.arc(s * .5, s * .5, s * .38, 0, 7); blob(g, '#FFC93C', lw);
    g.beginPath(); g.arc(s * .5, s * .5, s * .25, 0, 7); g.strokeStyle = '#E09A10'; g.lineWidth = lw * .8; g.stroke();
    g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.ellipse(s * .4, s * .36, s * .06, s * .1, -.6, 0, 7); g.fill();
  },
};

export function createArt(T, dpr) {
  const cache = new Map();
  const lwFor = s => Math.max(1.5, s * .07);
  function sprite(key, size, draw) {
    let c = cache.get(key);
    if (!c) {
      const px = Math.max(8, Math.round(size * dpr));
      c = document.createElement('canvas'); c.width = c.height = px;
      const g = c.getContext('2d'); draw(g, px, lwFor(px)); cache.set(key, c);
    }
    return c;
  }
  const item = type => sprite('i:' + type, T * .56, (g, s, lw) => ITEM[type](g, s, lw));
  const crop = (type, stage) => sprite(`c:${type}:${stage}`, T, (g, s, lw) => {
    if (type === 'apple') { // a little tree: sapling, then leafy, then hung with apples
      rr(g, s * .45, s * (stage ? .5 : .6), s * .1, s * (stage ? .4 : .3), s * .03); blob(g, '#8A5A36', lw * .7);
      if (!stage) { g.beginPath(); g.ellipse(s * .5, s * .56, s * .1, s * .07, 0, 0, 7); blob(g, '#6CCF5A', lw * .6); return; }
      const r = stage === 1 ? .22 : .32; g.beginPath(); g.arc(s * .5, s * (.5 - r * .4), s * r, 0, 7); blob(g, '#4FAE4A', lw * .8);
      if (stage === 3) for (const [x, y] of [[.38, .3], [.6, .26], [.5, .44], [.66, .42], [.34, .46]]) { g.beginPath(); g.arc(s * x, s * y, s * .06, 0, 7); blob(g, '#E5484D', lw * .5); }
      return;
    }
    if (stage === 0) { g.fillStyle = '#6B4425'; g.beginPath(); g.ellipse(s * .5, s * .6, s * .12, s * .06, 0, 0, 7); g.fill(); return; }
    if (stage === 1) { for (const a of [-.6, .6]) { g.beginPath(); g.ellipse(s * (.5 + a * .1), s * .55, s * .05, s * .12, a, 0, 7); blob(g, '#6CCF5A', lw * .6); } return; }
    if (stage === 2) { for (const a of [-.8, 0, .8]) { g.beginPath(); g.ellipse(s * (.5 + a * .14), s * .5, s * .07, s * .2, a, 0, 7); blob(g, '#58C24A', lw * .7); } return; }
    // ripe: the produce itself, bigger, sitting on leaves
    for (const a of [-1, 1]) { g.beginPath(); g.ellipse(s * (.5 + a * .22), s * .68, s * .16, s * .08, a * .4, 0, 7); blob(g, '#4FB848', lw * .6); }
    g.save(); g.translate(s * .14, s * .06); ITEM[type](g, s * .72, lw); g.restore();
  });

  // ---------- the static ground, rendered once per unlock change ----------
  function ground(isOn, lay = {}) {
    const { cols, rows } = CONFIG.world;
    const LC = lay.C || CONFIG, th = lay.theme || SEASONS.spring;
    // the whole farm is one bitmap; keep it under ~14M pixels (iOS refuses canvases past 16.7M), so big tablets get a touch less sharp ground
    const gd = Math.min(dpr, Math.sqrt(14e6 / (cols * rows * T * T)));
    const c = document.createElement('canvas'); c.width = Math.round(cols * T * gd); c.height = Math.round(rows * T * gd); c.gs = T * gd;
    const g = c.getContext('2d'); g.scale(gd, gd);
    const lw = Math.max(1.5, T * .05);
    // grass with soft variation and little flowers
    g.fillStyle = th.grass[0]; g.fillRect(0, 0, cols * T, rows * T);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const h = hash(x, y);
      if (h < .5) { g.fillStyle = h < .25 ? th.grass[1] : th.grass[2]; g.fillRect(x * T, y * T, T, T); }
      if (h > .9) { g.fillStyle = h > .95 ? th.flowers[1] : th.flowers[0]; g.beginPath(); g.arc((x + hash(y, x)) * T, (y + h) * T, T * .05, 0, 7); g.fill(); }
      if (h > .82 && h < .86) { g.strokeStyle = th.tuft; g.lineWidth = lw * .7; g.beginPath(); const gx = (x + .3) * T, gy = (y + .6) * T; g.moveTo(gx, gy); g.lineTo(gx - T * .05, gy - T * .14); g.moveTo(gx, gy); g.lineTo(gx + T * .06, gy - T * .12); g.stroke(); }
    }
    // the woods beside the Hillside: darker ground under the trees drawn at the end
    const W = LC.world || CONFIG.world, M = W.market, R = W.road, mid = M.x + M.w / 2, woods = W.blocked.length > 0;
    for (const b of W.blocked) { g.fillStyle = 'rgba(20,60,30,.22)'; g.fillRect(b.x * T, b.y * T, b.w * T, b.h * T); }
    // dirt paths out of the market in all four directions, then the plaza and the road
    g.fillStyle = th.path;
    rr(g, (mid - 1) * T, .4 * T, 2 * T, (M.y + 1) * T, T * .5); g.fill();                 // north
    rr(g, (mid - 1) * T, (R.y + R.h - .5) * T, 2 * T, (rows - R.y - R.h) * T, T * .5); g.fill(); // south
    rr(g, .4 * T, 13.4 * T, (M.x + 1) * T, 1.7 * T, T * .5); g.fill();                     // west
    rr(g, (M.x + M.w - 1) * T, 13.4 * T, (cols - M.x - M.w + .6) * T, 1.7 * T, T * .5); g.fill(); // east
    decorate(g, lay, th, lw);
    g.fillStyle = '#EAD9B8'; rr(g, (M.x + .3) * T, M.y * T, (M.w - .6) * T, (R.y - M.y - .4) * T, T * .5); g.fill();
    g.strokeStyle = 'rgba(160,130,90,.18)'; g.lineWidth = 1;
    for (let y = Math.ceil(M.y); y < R.y - .5; y++) for (let x = M.x + 1; x < M.x + M.w; x++) if ((x + y) % 2) g.strokeRect(x * T, y * T, T, T);
    g.fillStyle = '#7A7598'; g.fillRect(0, R.y * T, cols * T, R.h * T);
    g.fillStyle = '#FFE58A'; for (let x = 0; x < cols; x += 2) g.fillRect((x + .4) * T, (R.y + R.h / 2 - .07) * T, T * 1.1, T * .14);
    // the bus stop customers arrive at
    { const b = CONFIG.customers.busStop, x = b.x * T, y = b.y * T;
      rr(g, x - T * .05, y - T * 1.3, T * .1, T * 1.3, T * .03); blob(g, '#6B6880', lw * .7);
      rr(g, x - T * .32, y - T * 1.62, T * .64, T * .42, T * .1); blob(g, '#3FA7F5', lw * .8);
      g.fillStyle = '#fff'; g.font = `700 ${T * .26}px Fredoka, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('BUS', x, y - T * 1.4); g.textBaseline = 'alphabetic'; }
    // fields
    for (const f of LC.fields) {
      if (!isOn(f.id)) continue;
      rr(g, (f.x - .1) * T, (f.y - .1) * T, (f.w + .2) * T, (f.h + .2) * T, T * .25); blob(g, '#9C6A43', lw);
      for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) { rr(g, (f.x + x + .08) * T, (f.y + y + .08) * T, T * .84, T * .84, T * .18); g.fillStyle = (x + y) % 2 ? '#8A5A36' : '#7E5131'; g.fill(); }
    }
    // pens: straw floor and a wooden fence
    for (const p of LC.pens) {
      if (!isOn(p.id)) continue;
      rr(g, p.x * T, p.y * T, p.w * T, p.h * T, T * .3); blob(g, '#EBD27E', lw);
      g.strokeStyle = 'rgba(190,150,60,.5)'; g.lineWidth = lw * .6;
      for (let i = 0; i < 18; i++) { const sx = (p.x + .3 + hash(i, p.x) * (p.w - .6)) * T, sy = (p.y + .3 + hash(p.y, i) * (p.h - .6)) * T; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + T * .18, sy - T * .06); g.stroke(); }
      if (p.animal === 'bee') for (const [hx, hy] of [[.9, 1.2], [2.1, 2.1]]) { // two hive boxes
        const x = (p.x + hx) * T, y = (p.y + hy) * T;
        for (let k = 0; k < 3; k++) { rr(g, x - T * .36, y - T * (.1 + k * .24), T * .72, T * .26, T * .05); blob(g, k % 2 ? '#F2C94C' : '#FFE08A', lw * .7); }
        rr(g, x - T * .42, y - T * .78, T * .84, T * .14, T * .04); blob(g, '#B5733D', lw * .7);
        g.fillStyle = INK; g.beginPath(); g.ellipse(x, y + T * .05, T * .08, T * .04, 0, 0, 7); g.fill();
      }
      fenceRect(g, p.x, p.y, p.w, p.h, lw);
    }
    // closed zones: dimmed land behind a fence on every side that faces the farm
    for (const z of LC.zones || CONFIG.zones) {
      if (z.start || isOn(z.id)) continue;
      g.fillStyle = 'rgba(40,30,70,.38)'; g.fillRect(z.x * T, z.y * T, z.w * T, z.h * T);
      if (z.y > 0) fenceLine(g, z.x, z.y, z.w, lw);
      if (z.y + z.h < rows) fenceLine(g, z.x, z.y + z.h, z.w, lw);
      const fh = z.y < R.y && z.y + z.h > R.y ? R.y - z.y : z.h; // stop at the road: customers walk in along it
      if (z.x > 0) fenceCol(g, z.x, z.y, fh, lw);
      if (z.x + z.w < cols) fenceCol(g, z.x + z.w, z.y, fh, lw);
      g.fillStyle = 'rgba(255,255,255,.85)'; g.font = `600 ${T * .5}px Fredoka, sans-serif`; g.textAlign = 'center';
      g.fillText('🔒 ' + z.name, (z.x + z.w / 2) * T, (z.y + z.h / 2) * T);
    }
    // trees round the edge (not across the road, where customers walk in) and filling the woods
    const leaf = (x, y) => th.leaves[Math.floor(hash(y, x) * th.leaves.length)];
    const edge = [];
    for (let x = 1; x < cols; x += 2.6) edge.push([x + hash(x, 1) * 1.2, -.1]);
    for (let y = 1.5; y < R.y - .5; y += 2.6) for (const x of [-.2, cols + .2]) edge.push([x, y + hash(x, y) * 1.2]);
    for (let x = woods ? M.x + 1 : 1; x < (woods ? M.x + M.w : cols); x += 2.6) edge.push([x + hash(x, 2) * 1.2, rows + .1]);
    if (woods) { for (let y = R.y + R.h + 1; y < rows; y += 2.6) for (const x of [M.x - .3, M.x + M.w + .3]) edge.push([x, y + hash(x, y) * 1.2]); }
    else for (let y = R.y + R.h + 1; y < rows; y += 2.6) for (const x of [-.2, cols + .2]) edge.push([x, y + hash(x, y) * 1.2]);
    for (const b of W.blocked) for (let y = b.y + 1.4; y < b.y + b.h + .5; y += 1.7) for (let x = b.x + .8; x < b.x + b.w; x += 1.8) edge.push([x + (hash(x, y) - .5) * .8, y + (hash(y, x) - .5) * .6]);
    edge.sort((p, q) => p[1] - q[1]);
    for (const [x, y] of edge) tree(g, x, y, lw, leaf(x, y), th.snow);
    return c;
  }
  function fenceRect(g, x, y, w, h, lw) {
    g.strokeStyle = '#B5733D'; g.lineWidth = T * .12; g.lineCap = 'round';
    g.strokeRect(x * T, y * T, w * T, h * T);
    g.fillStyle = '#C98A50'; g.strokeStyle = OUT; g.lineWidth = lw * .7;
    for (let i = 0; i <= w; i++) for (const yy of [y, y + h]) { rr(g, (x + i) * T - T * .08, yy * T - T * .16, T * .16, T * .3, T * .05); g.fill(); g.stroke(); }
    for (let i = 1; i < h; i++) for (const xx of [x, x + w]) { rr(g, xx * T - T * .08, (y + i) * T - T * .16, T * .16, T * .3, T * .05); g.fill(); g.stroke(); }
  }
  function fenceCol(g, x, y0, len, lw) {
    g.fillStyle = '#C98A50'; g.strokeStyle = OUT; g.lineWidth = lw * .8;
    rr(g, (x - .2) * T, y0 * T, T * .14, len * T, T * .05); g.fill(); g.stroke();
    rr(g, (x + .06) * T, y0 * T, T * .14, len * T, T * .05); g.fill(); g.stroke();
    for (let i = y0 + .25; i < y0 + len; i += .7) { rr(g, (x - .12) * T, (i - .08) * T, T * .24, T * .2, T * .06); g.fill(); g.stroke(); }
  }
  function fenceLine(g, x0, y, len, lw) {
    g.fillStyle = '#C98A50'; g.strokeStyle = OUT; g.lineWidth = lw * .8;
    rr(g, x0 * T, (y - .12) * T, len * T, T * .14, T * .05); g.fill(); g.stroke();
    rr(g, x0 * T, (y + .08) * T, len * T, T * .14, T * .05); g.fill(); g.stroke();
    for (let i = x0 + .25; i < x0 + len; i += .7) { rr(g, (i - .08) * T, (y - .3) * T, T * .16, T * .55, T * .06); g.fill(); g.stroke(); }
  }
  function tree(g, x, y, lw, leaf = '#4FAE4A', snow = false) {
    g.fillStyle = 'rgba(0,0,0,.15)'; g.beginPath(); g.ellipse(x * T, (y + .5) * T, T * .55, T * .2, 0, 0, 7); g.fill();
    rr(g, (x - .1) * T, (y + .05) * T, T * .2, T * .45, T * .05); blob(g, '#8A5A36', lw);
    if (snow) { // a snowy pine
      for (const [w, top, bot] of [[.6, -.35, .15], [.45, -.75, -.25]]) { g.beginPath(); g.moveTo((x - w) * T, (y + bot) * T); g.lineTo(x * T, (y + top - .3) * T); g.lineTo((x + w) * T, (y + bot) * T); g.closePath(); blob(g, leaf, lw); }
      g.fillStyle = '#FFFFFF'; g.beginPath(); g.moveTo((x - .2) * T, (y - .78) * T); g.lineTo(x * T, (y - 1.05) * T); g.lineTo((x + .2) * T, (y - .78) * T); g.closePath(); g.fill();
      return;
    }
    g.beginPath(); g.arc(x * T, (y - .2) * T, T * .55, 0, 7); blob(g, leaf, lw);
    g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.arc((x - .18) * T, (y - .4) * T, T * .2, 0, 7); g.fill();
  }
  // ---------- decorations on free ground: purely visual, nothing collides with them ----------
  function decorate(g, lay, th, lw) {
    if (!lay.spots) return;
    const seed = lay.decor || 0;
    lay.spots.forEach((sp, i) => {
      const h = hash(i + seed * 7.3, seed + i * 1.7);
      if (h < .3) return; // leave some ground bare
      let kind = th.decor[Math.floor(hash(seed, i) * th.decor.length)];
      if (sp.small && (kind === 'pond' || kind === 'ice')) kind = 'rocks';
      DECOR[kind]?.(g, sp.x * T, sp.y * T, lw, h, th);
    });
  }
  const DECOR = {
    pond(g, x, y, lw) {
      g.beginPath(); g.ellipse(x, y, T * 1.05, T * .55, 0, 0, 7); blob(g, '#6FC3E8', lw);
      g.fillStyle = 'rgba(255,255,255,.45)'; g.beginPath(); g.ellipse(x - T * .3, y - T * .15, T * .35, T * .1, -.2, 0, 7); g.fill();
      g.beginPath(); g.ellipse(x + T * .45, y + T * .15, T * .2, T * .12, 0, 0, 7); blob(g, '#5DB548', lw * .6);
      for (const a of [-1, 1]) { g.strokeStyle = '#4E9A3A'; g.lineWidth = lw * .8; g.beginPath(); g.moveTo(x + a * T * 1, y + T * .2); g.lineTo(x + a * T * 1.1, y - T * .35); g.stroke(); }
    },
    ice(g, x, y, lw) {
      g.beginPath(); g.ellipse(x, y, T * 1, T * .5, 0, 0, 7); blob(g, '#BFE4F5', lw);
      g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = lw * .6; g.beginPath(); g.moveTo(x - T * .5, y - T * .1); g.lineTo(x - T * .1, y + T * .05); g.lineTo(x + T * .3, y - T * .15); g.stroke();
    },
    rocks(g, x, y, lw, h) {
      for (const [dx, dy, r] of [[-.25, .05, .28], [.2, .12, .2], [.05, -.15, .16]]) { g.beginPath(); g.ellipse(x + dx * T, y + dy * T, r * T * (1 + h * .3), r * T * .75, 0, 0, 7); blob(g, '#A9A3B8', lw * .8); }
      g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(x - .3 * T, y - .05 * T, T * .07, 0, 7); g.fill();
    },
    flowers(g, x, y, lw, h, th) {
      const cols = ['#FF6F91', '#FFD24A', '#B58CFF', '#FFFFFF'];
      for (let k = 0; k < 7; k++) {
        const fx = x + (hash(k, h) - .5) * T * 1.4, fy = y + (hash(h, k) - .5) * T * .9;
        g.strokeStyle = th.tuft; g.lineWidth = lw * .6; g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx, fy + T * .18); g.stroke();
        g.fillStyle = cols[k % cols.length]; for (let a = 0; a < 5; a++) { g.beginPath(); g.arc(fx + Math.cos(a * 1.26) * T * .07, fy + Math.sin(a * 1.26) * T * .07, T * .055, 0, 7); g.fill(); }
        g.fillStyle = '#FFB020'; g.beginPath(); g.arc(fx, fy, T * .04, 0, 7); g.fill();
      }
    },
    bush(g, x, y, lw, h, th) {
      g.fillStyle = 'rgba(0,0,0,.13)'; g.beginPath(); g.ellipse(x, y + T * .3, T * .6, T * .16, 0, 0, 7); g.fill();
      for (const [dx, dy, r] of [[-.3, .05, .3], [.3, .05, .3], [0, -.12, .36]]) { g.beginPath(); g.arc(x + dx * T, y + dy * T, r * T, 0, 7); blob(g, th.snow ? '#4F8F6E' : th.tuft, lw * .8); }
      if (th.snow) { g.fillStyle = '#FFFFFF'; g.beginPath(); g.ellipse(x, y - T * .38, T * .3, T * .1, 0, 0, 7); g.fill(); }
      else if (h > .6) { g.fillStyle = '#E5484D'; for (const [dx, dy] of [[-.25, -.05], [.15, -.2], [.3, .1]]) { g.beginPath(); g.arc(x + dx * T, y + dy * T, T * .05, 0, 7); g.fill(); } }
    },
    hay(g, x, y, lw) { // two square bales, one stacked: nothing round, so they never read as coins
      g.fillStyle = 'rgba(0,0,0,.13)'; g.beginPath(); g.ellipse(x, y + T * .32, T * .75, T * .15, 0, 0, 7); g.fill();
      for (const [dx, dy] of [[-.62, -.1], [.02, -.1], [-.3, -.48]]) {
        rr(g, x + dx * T, y + dy * T, T * .6, T * .4, T * .06); blob(g, '#E0B654', lw * .8);
        g.strokeStyle = '#A97C2C'; g.lineWidth = lw * .6;
        for (const f of [.2, .4]) { g.beginPath(); g.moveTo(x + (dx + .05) * T, y + (dy + f) * T); g.lineTo(x + (dx + .55) * T, y + (dy + f) * T); g.stroke(); }
        g.strokeStyle = '#8A5A36'; g.beginPath(); g.moveTo(x + (dx + .3) * T, y + dy * T); g.lineTo(x + (dx + .3) * T, y + (dy + .4) * T); g.stroke();
      }
    },
    leaves(g, x, y, lw, h) {
      const cols = ['#E58A2E', '#D9542F', '#F0B43A', '#B5532A'];
      for (let k = 0; k < 14; k++) { g.fillStyle = cols[k % 4]; g.beginPath(); g.ellipse(x + (hash(k, h) - .5) * T * 1.6, y + (hash(h, k + 3) - .5) * T, T * .09, T * .05, k, 0, 7); g.fill(); }
    },
    mushrooms(g, x, y, lw) {
      for (const [dx, dy, s] of [[-.2, .1, 1], [.18, -.05, .8], [.35, .2, .6]]) {
        rr(g, x + (dx - .05 * s) * T, y + dy * T, T * .1 * s, T * .18 * s, T * .03); blob(g, '#FFF3E0', lw * .6);
        g.beginPath(); g.ellipse(x + dx * T, y + dy * T, T * .16 * s, T * .1 * s, 0, Math.PI, 0); g.closePath(); blob(g, '#E5484D', lw * .6);
        g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(x + (dx - .05) * T, y + (dy - .05) * T, T * .025, 0, 7); g.fill();
      }
    },
    snowman(g, x, y, lw) {
      g.fillStyle = 'rgba(0,0,0,.12)'; g.beginPath(); g.ellipse(x, y + T * .32, T * .4, T * .12, 0, 0, 7); g.fill();
      g.beginPath(); g.arc(x, y + T * .08, T * .3, 0, 7); blob(g, '#FFFFFF', lw * .8);
      g.beginPath(); g.arc(x, y - T * .34, T * .21, 0, 7); blob(g, '#FFFFFF', lw * .8);
      g.fillStyle = '#2B2340'; for (const dx of [-.07, .07]) { g.beginPath(); g.arc(x + dx * T, y - T * .38, T * .03, 0, 7); g.fill(); }
      g.fillStyle = '#FF8A3D'; g.beginPath(); g.moveTo(x, y - T * .33); g.lineTo(x + T * .16, y - T * .3); g.lineTo(x, y - T * .28); g.fill();
      g.fillStyle = '#E5484D'; g.fillRect(x - T * .2, y - T * .18, T * .4, T * .07);
    },
  };

  // ---------- characters ----------
  // sx/sy: squash & stretch. look: -1/1 facing. kind sets the outfit.
  const OUTFIT = {
    player: { shirt: '#FF6B6B', hat: '#FFD23F', brim: true },
    farmhand: { shirt: '#4FB8E8', hat: '#E8C07A', brim: true },
    carrier: { shirt: '#9C7BEA', hat: '#FF8A4C' },
    cashier: { shirt: '#3FB68E', hat: null, tie: true },
  };
  function person(g, x, y, { kind = 'player', shirt, look = 1, sx = 1, sy = 1, bob = 0 } = {}) {
    const o = OUTFIT[kind] || { shirt }, s = T, lw = Math.max(1.5, s * .055);
    g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.ellipse(x, y, s * .3, s * .1, 0, 0, 7); g.fill();
    g.save(); g.translate(x, y - bob); g.scale(sx, sy);
    rr(g, -s * .22, -s * .58, s * .44, s * .52, s * .18); blob(g, shirt || o.shirt, lw);
    if (o.tie) { g.fillStyle = INK; g.fillRect(-s * .03, -s * .52, s * .06, s * .2); }
    g.beginPath(); g.arc(0, -s * .76, s * .22, 0, 7); blob(g, '#FFD9B3', lw);
    g.fillStyle = INK; g.beginPath(); g.arc(look * s * .07, -s * .78, s * .03, 0, 7); g.arc(look * s * .15, -s * .78, s * .03, 0, 7); g.fill();
    g.fillStyle = '#FF9F9F'; g.beginPath(); g.arc(look * s * .13, -s * .7, s * .035, 0, 7); g.fill();
    if (o.hat) {
      if (o.brim) { g.beginPath(); g.ellipse(0, -s * .9, s * .3, s * .08, 0, 0, 7); blob(g, o.hat, lw); }
      rr(g, -s * .16, -s * 1.06, s * .32, s * .17, s * .07); blob(g, o.hat, lw);
    }
    g.restore();
  }
  function animal(g, kind, x, y, t, look) {
    const s = T, lw = Math.max(1.5, s * .05), hop = Math.abs(Math.sin(t * 3)) * s * .05;
    g.fillStyle = 'rgba(0,0,0,.15)'; g.beginPath(); g.ellipse(x, y, s * .3, s * .09, 0, 0, 7); g.fill();
    g.save(); g.translate(x, y - hop); g.scale(look, 1);
    if (kind === 'chicken') {
      g.beginPath(); g.ellipse(0, -s * .25, s * .22, s * .2, 0, 0, 7); blob(g, '#FFFFFF', lw);
      g.beginPath(); g.arc(s * .14, -s * .42, s * .1, 0, 7); blob(g, '#FFFFFF', lw);
      g.fillStyle = '#FF5A4E'; g.beginPath(); g.arc(s * .14, -s * .53, s * .05, 0, 7); g.fill();
      g.fillStyle = '#FFB020'; g.beginPath(); g.moveTo(s * .23, -s * .43); g.lineTo(s * .31, -s * .4); g.lineTo(s * .23, -s * .37); g.fill();
      g.fillStyle = INK; g.beginPath(); g.arc(s * .17, -s * .44, s * .018, 0, 7); g.fill();
    } else if (kind === 'cow') {
      rr(g, -s * .38, -s * .5, s * .7, s * .38, s * .14); blob(g, '#FFFFFF', lw);
      g.fillStyle = INK; for (const [px, py, r] of [[-.15, -.38, .08], [.08, -.28, .06], [-.28, -.22, .05]]) { g.beginPath(); g.arc(s * px, s * py, s * r, 0, 7); g.fill(); }
      rr(g, s * .22, -s * .62, s * .26, s * .28, s * .1); blob(g, '#FFFFFF', lw);
      rr(g, s * .28, -s * .44, s * .2, s * .12, s * .05); blob(g, '#FFB3C1', lw * .8);
      g.fillStyle = INK; g.beginPath(); g.arc(s * .33, -s * .53, s * .02, 0, 7); g.fill();
      g.fillStyle = INK; for (const lx of [-.3, -.12, .06, .2]) g.fillRect(s * lx, -s * .14, s * .06, s * .14);
    } else if (kind === 'bee') { // flies about over the hives: no shadow hop, a bigger bob
      const fy = -s * (.55 + Math.sin(t * 7) * .08);
      for (const d of [-1, 1]) { g.beginPath(); g.ellipse(d * s * .05, fy - s * .1, s * .07, s * .11, d * .5, 0, 7); g.fillStyle = 'rgba(255,255,255,.85)'; g.fill(); g.lineWidth = lw * .5; g.strokeStyle = OUT; g.stroke(); }
      g.beginPath(); g.ellipse(0, fy, s * .13, s * .09, 0, 0, 7); blob(g, '#FFD23F', lw * .7);
      g.fillStyle = INK; for (const dx of [-.04, .04]) g.fillRect(s * (dx - .015), fy - s * .08, s * .03, s * .16);
    } else {
      g.beginPath(); for (const [px, py] of [[-.18, -.3], [0, -.36], [.16, -.3], [-.08, -.22], [.08, -.22]]) { g.moveTo(s * px + s * .15, s * py); g.arc(s * px, s * py, s * .15, 0, 7); }
      g.fillStyle = '#FFFFFF'; g.fill(); g.lineWidth = lw; g.strokeStyle = OUT; g.stroke(); g.fill();
      g.beginPath(); g.ellipse(s * .27, -s * .36, s * .1, s * .12, 0, 0, 7); blob(g, '#4A3B4F', lw * .8);
      g.fillStyle = INK; for (const lx of [-.18, .12]) g.fillRect(s * lx, -s * .14, s * .06, s * .14);
    }
    g.restore();
  }

  // ---------- buildings ----------
  const AWNING = { carrot: '#FF8A2A', corn: '#F2C12E', egg: '#7FC8F8', bread: '#D98B3A', pumpkin: '#FF7A1A', cheese: '#F5C842', wool: '#B9A7F0', apple: '#E5484D', juice: '#FFB020', honey: '#FFB627', cake: '#FF8FB1' };
  function stand(g, x, y, product) {
    const s = T, lw = Math.max(1.5, s * .05);
    rr(g, x - s * .8, y - s * .2, s * 1.6, s * .75, s * .12); blob(g, '#C98A50', lw);
    for (const px of [-.7, .62]) { rr(g, x + px * s, y - s * 1.2, s * .08, s * 1.0, s * .03); blob(g, '#9C6A43', lw * .7); }
    for (let i = 0; i < 4; i++) { rr(g, x - s * .85 + i * s * .425, y - s * 1.35, s * .425, s * .3, i === 0 ? s * .1 : i === 3 ? s * .1 : 0); g.fillStyle = i % 2 ? '#FFFFFF' : AWNING[product]; g.fill(); }
    rr(g, x - s * .85, y - s * 1.35, s * 1.7, s * .3, s * .1); g.lineWidth = lw; g.strokeStyle = OUT; g.stroke();
  }
  function machine(g, m, x, y, t, busy) {
    const s = T, lw = Math.max(1.5, s * .05);
    g.fillStyle = 'rgba(0,0,0,.15)'; g.beginPath(); g.ellipse(x, y + s * .55, s * .95, s * .22, 0, 0, 7); g.fill();
    const wob = busy ? Math.sin(t * 18) * s * .02 : 0;
    if (m.id === 'mill') {
      rr(g, x - s * .6, y - s * .7, s * 1.2, s * 1.25, s * .15); blob(g, '#F4E3C0', lw);
      g.beginPath(); g.moveTo(x - s * .75, y - s * .65); g.lineTo(x, y - s * 1.2); g.lineTo(x + s * .75, y - s * .65); g.closePath(); blob(g, '#D46A4C', lw);
      g.save(); g.translate(x, y - s * .55); g.rotate(t * (busy ? 4 : .4));
      for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 2); rr(g, -s * .07, -s * .85, s * .14, s * .7, s * .04); blob(g, '#FFFFFF', lw * .8); }
      g.beginPath(); g.arc(0, 0, s * .1, 0, 7); blob(g, '#9C6A43', lw * .8); g.restore();
    } else if (m.id === 'bakery') {
      rr(g, x - s * .7, y - s * .6 + wob, s * 1.4, s * 1.15, s * .2); blob(g, '#E58A5C', lw);
      rr(g, x - s * .4, y - s * .25 + wob, s * .8, s * .55, s * .25); blob(g, busy ? '#FFB347' : '#5A3A2A', lw);
      rr(g, x + s * .3, y - s * 1.0, s * .22, s * .45, s * .05); blob(g, '#9C6A43', lw);
      if (busy) for (let i = 0; i < 3; i++) { const k = (t * .7 + i / 3) % 1; g.fillStyle = `rgba(255,255,255,${.6 * (1 - k)})`; g.beginPath(); g.arc(x + s * (.41 + Math.sin(k * 6) * .08), y - s * (1.05 + k * .7), s * (.08 + k * .1), 0, 7); g.fill(); }
    } else if (m.id === 'cider') { // a barrel under a screw press
      g.beginPath(); g.ellipse(x, y + s * .05 + wob, s * .5, s * .5, 0, 0, 7); blob(g, '#B5733D', lw);
      g.strokeStyle = '#7A4A26'; g.lineWidth = lw; for (const dy of [-.25, .3]) { g.beginPath(); g.moveTo(x - s * .48, y + s * dy); g.lineTo(x + s * .48, y + s * dy); g.stroke(); }
      rr(g, x - s * .6, y - s * .75, s * 1.2, s * .18, s * .05); blob(g, '#9C6A43', lw);
      g.save(); g.translate(x, y - s * .66); g.rotate(busy ? t * 4 : 0); rr(g, -s * .45, -s * .05, s * .9, s * .1, s * .04); blob(g, '#6B6880', lw * .7); g.restore();
    } else if (m.id === 'kitchen') { // a pink cottage with a chimney
      rr(g, x - s * .65, y - s * .55 + wob, s * 1.3, s * 1.1, s * .15); blob(g, '#FFB3C8', lw);
      g.beginPath(); g.moveTo(x - s * .8, y - s * .5); g.lineTo(x, y - s * 1.1); g.lineTo(x + s * .8, y - s * .5); g.closePath(); blob(g, '#E5484D', lw);
      rr(g, x - s * .2, y - s * .1 + wob, s * .4, s * .55, s * .15); blob(g, busy ? '#FFD23F' : '#8A5A36', lw);
      rr(g, x + s * .3, y - s * 1.05, s * .18, s * .35, s * .04); blob(g, '#9C6A43', lw);
      if (busy) for (let i = 0; i < 3; i++) { const k = (t * .7 + i / 3) % 1; g.fillStyle = `rgba(255,255,255,${.6 * (1 - k)})`; g.beginPath(); g.arc(x + s * .39, y - s * (1.1 + k * .7), s * (.07 + k * .1), 0, 7); g.fill(); }
    } else {
      rr(g, x - s * .62, y - s * .45 + wob, s * 1.24, s * .95, s * .25); blob(g, "#7FB4E8", lw);
      rr(g, x - s * .5, y - s * .7, s * 1.0, s * .3, s * .1); blob(g, '#FFFFFF', lw);
      g.save(); g.translate(x, y - s * .75); g.rotate(busy ? t * 3 : 0); g.fillStyle = INK; g.fillRect(-s * .04, -s * .25, s * .08, s * .25); g.restore();
    }
  }
  function crate(g, x, y) {
    const s = T, lw = Math.max(1.5, s * .05);
    rr(g, x - s * .42, y - s * .22, s * .84, s * .5, s * .08); blob(g, '#B5733D', lw);
    g.strokeStyle = '#8A5A36'; g.lineWidth = lw * .8; g.beginPath(); g.moveTo(x - s * .42, y + s * .04); g.lineTo(x + s * .42, y + s * .04); g.stroke();
  }
  function register(g, x, y) {
    const s = T, lw = Math.max(1.5, s * .05);
    rr(g, x - s * .7, y - s * .45, s * 1.4, s * .8, s * .15); blob(g, '#9C6A43', lw);
    rr(g, x - s * .7, y - s * .45, s * 1.4, s * .28, s * .12); blob(g, '#C98A50', lw);
    rr(g, x - s * .3, y - s * .85, s * .6, s * .42, s * .08); blob(g, '#5E6B8C', lw);
    rr(g, x - s * .2, y - s * .78, s * .4, s * .16, s * .04); g.fillStyle = '#9BE7A0'; g.fill();
  }
  function mat(g, x, y, color, label) {
    const s = T;
    rr(g, x - s * .62, y - s * .45, s * 1.24, s * .9, s * .2); g.fillStyle = color; g.fill(); g.lineWidth = Math.max(2, s * .05); g.strokeStyle = 'rgba(255,255,255,.85)'; g.setLineDash([s * .14, s * .1]); g.stroke(); g.setLineDash([]);
    if (label) { g.fillStyle = '#fff'; g.font = `600 ${s * .26}px Fredoka, sans-serif`; g.textAlign = 'center'; g.fillText(label, x, y + s * .1); }
  }
  function bin(g, x, y, active) { // the shipping bin: a mat to stand on and a slatted crate behind it
    const s = T, lw = Math.max(1.5, s * .05);
    mat(g, x, y, active ? 'rgba(255,210,63,.75)' : 'rgba(255,170,60,.5)', '');
    rr(g, x - s * .5, y - s * 1.15, s * 1, s * .62, s * .08); blob(g, '#C98A50', lw);
    g.strokeStyle = '#8A5A36'; g.lineWidth = lw * .7;
    for (const f of [.33, .66]) { g.beginPath(); g.moveTo(x - s * .45, y - s * 1.15 + s * .62 * f); g.lineTo(x + s * .45, y - s * 1.15 + s * .62 * f); g.stroke(); }
    g.font = `700 ${s * .22}px Fredoka, sans-serif`; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = INK; g.fillStyle = '#FFE066';
    g.strokeText('SELL ½', x, y + s * .08); g.fillText('SELL ½', x, y + s * .08);
  }
  return { item, crop, ground, person, animal, stand, machine, crate, register, mat, bin, T, dpr };
}
