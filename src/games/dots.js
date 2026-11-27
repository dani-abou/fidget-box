import { ac, buzz, click } from '../lib/sound.js';
import { P } from '../lib/palette.js';
import { makeCanvas, rel } from '../lib/canvas.js';

export default {
  id: 'dots',
  name: 'Dot field',
  description: 'Shove a grid of dots around and watch it settle.',
  color: '--butter',
  icon: '<svg viewBox="0 0 40 40" fill="currentColor"><circle cx="8" cy="8" r="2.5"/><circle cx="20" cy="8" r="2.5"/><circle cx="32" cy="8" r="2.5"/><circle cx="8" cy="20" r="2.5"/><circle cx="25" cy="22" r="3.5"/><circle cx="32" cy="20" r="2.5"/><circle cx="8" cy="32" r="2.5"/><circle cx="20" cy="32" r="2.5"/><circle cx="32" cy="32" r="2.5"/></svg>',

  init(el) {
    el.innerHTML = '<div class="bar"><span>Drag through the dots</span><button class="btn" aria-pressed="false">Mode: push</button></div>';
    let hx, hy, x, y, vx, vy, n = 0, pull = false; const ptr = { x: 0, y: 0, on: false };
    const st = makeCanvas(el, build), { cv, g } = st, btn = el.querySelector('.btn');
    function build() {
      const gap = 26, cols = Math.floor(st.W / gap), rows = Math.floor(st.H / gap); if (cols < 1 || rows < 1) { n = 0; return; }
      const ox = (st.W - (cols - 1) * gap) / 2, oy = (st.H - (rows - 1) * gap) / 2; n = cols * rows;
      hx = new Float32Array(n); hy = new Float32Array(n); x = new Float32Array(n); y = new Float32Array(n); vx = new Float32Array(n); vy = new Float32Array(n);
      for (let r = 0, i = 0; r < rows; r++) for (let c = 0; c < cols; c++, i++) { hx[i] = x[i] = ox + c * gap; hy[i] = y[i] = oy + r * gap; }
    }
    btn.onclick = () => { pull = !pull; btn.textContent = 'Mode: ' + (pull ? 'pull' : 'push'); btn.setAttribute('aria-pressed', pull); click(1200, .02, .2); };
    cv.addEventListener('pointerdown', e => { ac(); ptr.on = true; cv.setPointerCapture(e.pointerId); Object.assign(ptr, rel(cv, e)); buzz(6); });
    cv.addEventListener('pointermove', e => { if (ptr.on) Object.assign(ptr, rel(cv, e)); });
    const up = () => ptr.on = false; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    let raf;
    function loop() {
      g.clearRect(0, 0, st.W, st.H); const R = 120;
      for (let i = 0; i < n; i++) {
        if (ptr.on) { const dx = x[i] - ptr.x, dy = y[i] - ptr.y, d = Math.hypot(dx, dy) || 1; if (d < R) { const f = (1 - d / R) * (pull ? -2.2 : 3.2); vx[i] += dx / d * f; vy[i] += dy / d * f; } }
        vx[i] += (hx[i] - x[i]) * .06; vy[i] += (hy[i] - y[i]) * .06; vx[i] *= .84; vy[i] *= .84; x[i] += vx[i]; y[i] += vy[i];
        const disp = Math.hypot(x[i] - hx[i], y[i] - hy[i]);
        g.fillStyle = disp > 3 ? P.acc[Math.min(4, Math.floor(disp / 9))] : P.muted; g.globalAlpha = disp > 3 ? 1 : .55;
        g.beginPath(); g.arc(x[i], y[i], Math.min(7, 3 + disp * .07), 0, 7); g.fill();
      }
      g.globalAlpha = 1; raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); st.stop(); };
  },
};
