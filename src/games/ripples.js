import { ac, buzz, tone } from '../lib/sound.js';
import { P } from '../lib/palette.js';
import { makeCanvas, rel } from '../lib/canvas.js';

export default {
  id: 'ripples',
  name: 'Ripples',
  description: 'Draw on water. Every touch plays a note.',
  color: '--lilac',
  icon: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="20" cy="20" r="3"/><circle cx="20" cy="20" r="9"/><circle cx="20" cy="20" r="16" stroke-dasharray="4 4"/></svg>',

  init(el) {
    el.innerHTML = '<div class="hint">Touch anywhere</div>';
    const hint = el.querySelector('.hint'), st = makeCanvas(el), { cv, g } = st;
    const rings = [], scale = [0, 2, 4, 7, 9]; let down = false, last = null, lastNote = 0, ci = 0, raf, prev = performance.now();
    function note(x, y) { const idx = Math.min(9, Math.floor(x / st.W * 10)); const semi = scale[idx % 5] + 12 * Math.floor(idx / 5) + (y < st.H / 2 ? 12 : 0); tone(196 * Math.pow(2, semi / 12)); }
    function spawn(x, y, big) { rings.push({ x, y, r: big ? 6 : 3, sp: big ? 120 : 80, life: 1, dur: big ? 2.4 : 1.4, w: big ? 4 : 2.5, c: P.acc[ci % 5] }); if (big) ci++; if (rings.length > 140) rings.shift(); }
    cv.addEventListener('pointerdown', e => { ac(); hint.style.opacity = 0; down = true; cv.setPointerCapture(e.pointerId); const p = rel(cv, e); last = p; spawn(p.x, p.y, true); note(p.x, p.y); lastNote = performance.now(); buzz(8); });
    cv.addEventListener('pointermove', e => {
      if (!down) return; const p = rel(cv, e), d = Math.hypot(p.x - last.x, p.y - last.y), now = performance.now();
      if (d > 30 && now - lastNote > 110) { spawn(p.x, p.y, true); note(p.x, p.y); lastNote = now; last = p; } else if (d > 12) { spawn(p.x, p.y, false); last = p; }
    });
    const up = () => down = false; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    function loop(now) {
      const dt = Math.min(.05, (now - prev) / 1000); prev = now; g.clearRect(0, 0, st.W, st.H);
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i]; r.r += r.sp * dt; r.sp *= Math.pow(.7, dt); r.life -= dt / r.dur; if (r.life <= 0) { rings.splice(i, 1); continue; }
        g.strokeStyle = r.c; g.globalAlpha = r.life; g.lineWidth = r.w * r.life + .5; g.beginPath(); g.arc(r.x, r.y, r.r, 0, 7); g.stroke();
        g.globalAlpha = r.life * .45; g.beginPath(); g.arc(r.x, r.y, r.r * .62, 0, 7); g.stroke();
      }
      g.globalAlpha = 1; raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); st.stop(); };
  },
};
