import { ac, buzz, click } from '../lib/sound.js';
import { P } from '../lib/palette.js';
import { makeCanvas, rel } from '../lib/canvas.js';

export default {
  id: 'spinner',
  name: 'Spinner',
  description: 'Flick it. It coasts for ages.',
  color: '--peach',
  icon: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="20" cy="20" r="4"/><circle cx="20" cy="7" r="5"/><circle cx="9" cy="27" r="5"/><circle cx="31" cy="27" r="5"/></svg>',

  init(el) {
    el.innerHTML = '<div class="bar"><span class="spins">Flick it</span><span class="rpm"></span></div>';
    const st = makeCanvas(el), { cv, g } = st, rpmEl = el.querySelector('.rpm'), spinsEl = el.querySelector('.spins');
    const SEG = Math.PI * 2 / 3; let ang = 0, vel = 0, drag = false, lastA = 0, lastT = 0, lastSeg = 0, lastClick = 0, raf, prev = performance.now(), best = 0;
    const pa = e => { const p = rel(cv, e); return Math.atan2(p.y - st.H / 2, p.x - st.W / 2); };
    cv.addEventListener('pointerdown', e => { ac(); drag = true; lastA = pa(e); lastT = performance.now(); vel *= .2; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => {
      if (!drag) return; const a = pa(e); let d = a - lastA; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
      const now = performance.now(), dt = Math.max(8, now - lastT) / 1000; ang += d; vel = vel * .4 + (d / dt) * .6; lastA = a; lastT = now;
    });
    const up = () => { if (!drag) return; drag = false; if (performance.now() - lastT > 90) vel *= .2; vel = Math.max(-90, Math.min(90, vel)); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    function drawOne(a, R, alpha) {
      g.save(); g.globalAlpha = alpha; g.translate(st.W / 2, st.H / 2); g.rotate(a); g.lineCap = 'round';
      for (let pass = 0; pass < 2; pass++) {
        g.lineWidth = R * .44 + (pass ? 0 : 4); g.strokeStyle = pass ? P.surface : P.line;
        for (let k = 0; k < 3; k++) { const t = k * SEG; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(t) * R * .62, Math.sin(t) * R * .62); g.stroke(); }
      }
      for (let k = 0; k < 3; k++) {
        const t = k * SEG, x = Math.cos(t) * R * .62, y = Math.sin(t) * R * .62;
        g.fillStyle = P.acc[[3, 0, 1][k]]; g.beginPath(); g.arc(x, y, R * .3, 0, 7); g.fill();
        g.fillStyle = P.surface; g.beginPath(); g.arc(x, y, R * .15, 0, 7); g.fill();
      }
      g.fillStyle = P.acc[4]; g.beginPath(); g.arc(0, 0, R * .21, 0, 7); g.fill();
      g.fillStyle = P.surface; g.beginPath(); g.arc(0, 0, R * .1, 0, 7); g.fill(); g.restore();
    }
    function loop(now) {
      const dt = Math.min(.05, (now - prev) / 1000); prev = now;
      if (!drag) { ang += vel * dt; vel *= Math.pow(.86, dt); if (Math.abs(vel) < .25) vel *= Math.pow(.2, dt); if (Math.abs(vel) < .02) vel = 0; }
      const seg = Math.floor(ang / SEG), sp = Math.abs(vel);
      if (seg !== lastSeg) { if (now - lastClick > (sp > 30 ? 70 : 25)) { click(1300 + Math.min(sp, 40) * 30, .018, .16); lastClick = now; if (sp < 8) buzz(4); } lastSeg = seg; }
      const R = Math.min(st.W, st.H) * .36; g.clearRect(0, 0, st.W, st.H);
      if (sp > 9) { for (let k = 3; k >= 1; k--) drawOne(ang - vel * .011 * k, R, .14); }
      drawOne(ang, R, 1);
      const rpm = Math.round(sp * 60 / (2 * Math.PI)); best = Math.max(best, rpm);
      rpmEl.textContent = rpm ? rpm + ' rpm' : ''; spinsEl.textContent = best ? 'Best ' + best + ' rpm' : 'Flick it';
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); st.stop(); };
  },
};
