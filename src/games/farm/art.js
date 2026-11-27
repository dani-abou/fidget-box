// Sunny Acres art: everything is drawn in code. Sprites that repeat (items,
// crops) are rendered once into small canvases and reused, and the static
// ground (grass, paths, soil, fences) is rendered once into one big canvas,
// so a busy frame is mostly cheap drawImage calls.
import { CONFIG } from './config.js';

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
    if (stage === 0) { g.fillStyle = '#6B4425'; g.beginPath(); g.ellipse(s * .5, s * .6, s * .12, s * .06, 0, 0, 7); g.fill(); return; }
    if (stage === 1) { for (const a of [-.6, .6]) { g.beginPath(); g.ellipse(s * (.5 + a * .1), s * .55, s * .05, s * .12, a, 0, 7); blob(g, '#6CCF5A', lw * .6); } return; }
    if (stage === 2) { for (const a of [-.8, 0, .8]) { g.beginPath(); g.ellipse(s * (.5 + a * .14), s * .5, s * .07, s * .2, a, 0, 7); blob(g, '#58C24A', lw * .7); } return; }
    // ripe: the produce itself, bigger, sitting on leaves
    for (const a of [-1, 1]) { g.beginPath(); g.ellipse(s * (.5 + a * .22), s * .68, s * .16, s * .08, a * .4, 0, 7); blob(g, '#4FB848', lw * .6); }
    g.save(); g.translate(s * .14, s * .06); ITEM[type](g, s * .72, lw); g.restore();
  });

  // ---------- the static ground, rendered once per unlock change ----------
  function ground(isOn) {
    const { cols, rows } = CONFIG.world;
    const c = document.createElement('canvas'); c.width = Math.round(cols * T * dpr); c.height = Math.round(rows * T * dpr);
    const g = c.getContext('2d'); g.scale(dpr, dpr);
    const lw = Math.max(1.5, T * .05);
    // grass with soft variation and little flowers
    g.fillStyle = '#86CF62'; g.fillRect(0, 0, cols * T, rows * T);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const h = hash(x, y);
      if (h < .5) { g.fillStyle = h < .25 ? '#7EC65A' : '#8ED66B'; g.fillRect(x * T, y * T, T, T); }
      if (h > .9) { g.fillStyle = h > .95 ? '#FFF3A6' : '#FFFFFF'; g.beginPath(); g.arc((x + hash(y, x)) * T, (y + h) * T, T * .05, 0, 7); g.fill(); }
      if (h > .82 && h < .86) { g.strokeStyle = '#5FAE45'; g.lineWidth = lw * .7; g.beginPath(); const gx = (x + .3) * T, gy = (y + .6) * T; g.moveTo(gx, gy); g.lineTo(gx - T * .05, gy - T * .14); g.moveTo(gx, gy); g.lineTo(gx + T * .06, gy - T * .12); g.stroke(); }
    }
    // dirt path up the middle, plaza, road
    g.fillStyle = '#E9D29A'; rr(g, 6 * T, 1 * T, 2 * T, 35 * T, T * .5); g.fill();
    g.fillStyle = '#EAD9B8'; rr(g, .3 * T, 34.6 * T, 13.4 * T, 8.6 * T, T * .5); g.fill();
    g.strokeStyle = 'rgba(160,130,90,.18)'; g.lineWidth = 1;
    for (let y = 35; y < 43; y++) for (let x = 1; x < 14; x++) if ((x + y) % 2) g.strokeRect(x * T, y * T, T, T);
    g.fillStyle = '#7A7598'; g.fillRect(0, 43.6 * T, cols * T, 3.4 * T);
    g.fillStyle = '#FFE58A'; for (let x = 0; x < cols; x += 2) g.fillRect((x + .4) * T, 45.2 * T, T * 1.1, T * .14);
    // fields
    for (const f of CONFIG.fields) {
      if (!isOn(f.id)) continue;
      rr(g, (f.x - .1) * T, (f.y - .1) * T, (f.w + .2) * T, (f.h + .2) * T, T * .25); blob(g, '#9C6A43', lw);
      for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) { rr(g, (f.x + x + .08) * T, (f.y + y + .08) * T, T * .84, T * .84, T * .18); g.fillStyle = (x + y) % 2 ? '#8A5A36' : '#7E5131'; g.fill(); }
    }
    // pens: straw floor and a wooden fence
    for (const p of CONFIG.pens) {
      if (!isOn(p.id)) continue;
      rr(g, p.x * T, p.y * T, p.w * T, p.h * T, T * .3); blob(g, '#EBD27E', lw);
      g.strokeStyle = 'rgba(190,150,60,.5)'; g.lineWidth = lw * .6;
      for (let i = 0; i < 18; i++) { const sx = (p.x + .3 + hash(i, p.x) * (p.w - .6)) * T, sy = (p.y + .3 + hash(p.y, i) * (p.h - .6)) * T; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + T * .18, sy - T * .06); g.stroke(); }
      fenceRect(g, p.x, p.y, p.w, p.h, lw);
    }
    // zone fences and the dimmed, locked land beyond them
    for (const z of CONFIG.zones) {
      if (z.start || isOn(z.id)) continue;
      const bottom = z.fenceY, top = z.top;
      g.fillStyle = 'rgba(40,30,70,.38)'; g.fillRect(0, (top - 1) * T, cols * T, (bottom - top + 1) * T);
      fenceLine(g, 0, bottom, cols, lw);
      g.fillStyle = 'rgba(255,255,255,.85)'; g.font = `600 ${T * .5}px Fredoka, sans-serif`; g.textAlign = 'center';
      g.fillText('🔒 ' + z.name, 7 * T, (bottom - 2.2) * T);
    }
    // trees along the edges
    for (let y = 2; y < 43; y += 2.6) for (const x of [-.2, 14.2]) tree(g, x, y + hash(x, y) * 1.2, lw, T);
    return c;
  }
  function fenceRect(g, x, y, w, h, lw) {
    g.strokeStyle = '#B5733D'; g.lineWidth = T * .12; g.lineCap = 'round';
    g.strokeRect(x * T, y * T, w * T, h * T);
    g.fillStyle = '#C98A50'; g.strokeStyle = OUT; g.lineWidth = lw * .7;
    for (let i = 0; i <= w; i++) for (const yy of [y, y + h]) { rr(g, (x + i) * T - T * .08, yy * T - T * .16, T * .16, T * .3, T * .05); g.fill(); g.stroke(); }
    for (let i = 1; i < h; i++) for (const xx of [x, x + w]) { rr(g, xx * T - T * .08, (y + i) * T - T * .16, T * .16, T * .3, T * .05); g.fill(); g.stroke(); }
  }
  function fenceLine(g, x0, y, len, lw) {
    g.fillStyle = '#C98A50'; g.strokeStyle = OUT; g.lineWidth = lw * .8;
    rr(g, x0 * T, (y - .12) * T, len * T, T * .14, T * .05); g.fill(); g.stroke();
    rr(g, x0 * T, (y + .08) * T, len * T, T * .14, T * .05); g.fill(); g.stroke();
    for (let i = x0 + .25; i < x0 + len; i += .7) { rr(g, (i - .08) * T, (y - .3) * T, T * .16, T * .55, T * .06); g.fill(); g.stroke(); }
  }
  function tree(g, x, y, lw) {
    g.fillStyle = 'rgba(0,0,0,.15)'; g.beginPath(); g.ellipse(x * T, (y + .5) * T, T * .55, T * .2, 0, 0, 7); g.fill();
    rr(g, (x - .1) * T, (y + .05) * T, T * .2, T * .45, T * .05); blob(g, '#8A5A36', lw);
    g.beginPath(); g.arc(x * T, (y - .2) * T, T * .55, 0, 7); blob(g, '#4FAE4A', lw);
    g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.arc((x - .18) * T, (y - .4) * T, T * .2, 0, 7); g.fill();
  }

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
    } else {
      g.beginPath(); for (const [px, py] of [[-.18, -.3], [0, -.36], [.16, -.3], [-.08, -.22], [.08, -.22]]) { g.moveTo(s * px + s * .15, s * py); g.arc(s * px, s * py, s * .15, 0, 7); }
      g.fillStyle = '#FFFFFF'; g.fill(); g.lineWidth = lw; g.strokeStyle = OUT; g.stroke(); g.fill();
      g.beginPath(); g.ellipse(s * .27, -s * .36, s * .1, s * .12, 0, 0, 7); blob(g, '#4A3B4F', lw * .8);
      g.fillStyle = INK; for (const lx of [-.18, .12]) g.fillRect(s * lx, -s * .14, s * .06, s * .14);
    }
    g.restore();
  }

  // ---------- buildings ----------
  const AWNING = { carrot: '#FF8A2A', corn: '#F2C12E', egg: '#7FC8F8', bread: '#D98B3A', pumpkin: '#FF7A1A', cheese: '#F5C842', wool: '#B9A7F0' };
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
  return { item, crop, ground, person, animal, stand, machine, crate, register, mat, T, dpr };
}
