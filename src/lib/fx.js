// Game-feel effects: confetti, floating score text, screen shake.
const COLORS = ['#FFD25A', '#FF8A66', '#4FE3B2', '#5EC6FF', '#AE8CFF', '#FF6FAE'];
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Confetti burst over `host` (positioned element). */
export function confetti(host, count = 110) {
  if (calm()) return;
  const cv = document.createElement('canvas'); cv.className = 'fx-canvas'; host.append(cv);
  const W = cv.clientWidth, H = cv.clientHeight, d = Math.min(devicePixelRatio || 1, 2);
  cv.width = W * d; cv.height = H * d; const g = cv.getContext('2d'); g.scale(d, d);
  const ps = Array.from({ length: count }, (_, i) => ({
    x: W / 2 + (Math.random() - .5) * 60, y: H * .42, vx: (Math.random() - .5) * 13, vy: -6 - Math.random() * 11,
    r: Math.random() * 6.28, vr: (Math.random() - .5) * .4, w: 6 + Math.random() * 6, h: 4 + Math.random() * 5, c: COLORS[i % COLORS.length],
  }));
  let t0 = performance.now(), raf;
  const loop = now => {
    const t = (now - t0) / 1000; g.clearRect(0, 0, W, H);
    for (const p of ps) {
      p.vy += .38; p.vx *= .985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      g.save(); g.globalAlpha = Math.max(0, 1 - Math.max(0, t - 1.4) / .6); g.translate(p.x, p.y); g.rotate(p.r);
      g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore();
    }
    if (t < 2) raf = requestAnimationFrame(loop); else cv.remove();
  };
  raf = requestAnimationFrame(loop);
}

/** "+3"-style text that floats up from (x, y), relative to host. */
export function floater(host, x, y, text, color) {
  const f = document.createElement('div'); f.className = 'floater'; f.textContent = text;
  f.style.left = x + 'px'; f.style.top = y + 'px'; if (color) f.style.color = color;
  host.append(f); setTimeout(() => f.remove(), 950);
}

export function shake(el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
