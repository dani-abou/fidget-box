import { ac, buzz, click, sfxPop } from '../lib/sound.js';
import { ACCENTS } from '../lib/palette.js';

export default {
  id: 'bubbles',
  name: 'Bubble wrap',
  description: 'Tap to pop, or drag a finger across a whole row.',
  color: '--sky',
  icon: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="7"/><circle cx="29" cy="11" r="7"/><circle cx="11" cy="29" r="7"/><circle cx="29" cy="29" r="7" stroke-dasharray="3 3"/></svg>',
  css: `
.sheet{flex:1;min-height:0;display:grid;gap:6px;padding:12px;align-content:center;touch-action:none;margin:0 10px;border-radius:20px;background:color-mix(in srgb,var(--tint) 14%,transparent)}
.bub{aspect-ratio:1;border-radius:50%;position:relative;
  background:radial-gradient(circle at 33% 28%,rgba(255,255,255,.9) 0 11%,transparent 13%),radial-gradient(circle at 50% 55%,color-mix(in srgb,var(--tint) 45%,transparent),color-mix(in srgb,var(--tint) 90%,transparent));
  box-shadow:inset 0 -4px 7px rgba(0,0,0,.14),0 2px 0 rgba(0,0,0,.07);transition:transform .09s ease-out}
.bub.popped{transform:scale(.84);background:color-mix(in srgb,var(--tint) 22%,transparent);box-shadow:inset 0 2px 4px rgba(0,0,0,.18)}
.bub.popped::after{content:"";position:absolute;inset:30% 22%;border-top:2px solid color-mix(in srgb,var(--tint) 55%,transparent);border-radius:40%;transform:rotate(-14deg)}
@media (prefers-reduced-motion: reduce){.bub{transition:none}}`,

  init(el) {
    el.innerHTML = '<div class="sheet" role="group" aria-label="Bubble wrap sheet"></div><div class="bar"><span class="count"></span><button class="btn">New sheet</button></div>';
    const sheet = el.querySelector('.sheet'), countEl = el.querySelector('.count'), btn = el.querySelector('.btn');
    let ti = Math.floor(Math.random() * 5), total = 0, popped = 0, life = 0, down = false, timer;
    const upd = () => countEl.textContent = life + ' popped';
    function build() {
      clearTimeout(timer); sheet.innerHTML = '';
      const w = sheet.clientWidth - 24, h = sheet.clientHeight - 24, sz = 58;
      const cols = Math.max(4, Math.floor(w / sz)), rows = Math.max(4, Math.floor(h / sz));
      sheet.style.gridTemplateColumns = 'repeat(' + cols + ',minmax(0,' + (sz - 6) + 'px))'; sheet.style.justifyContent = 'center';
      sheet.style.setProperty('--tint', 'var(' + ACCENTS[ti++ % 5] + ')');
      total = cols * rows; popped = 0; const f = document.createDocumentFragment();
      for (let i = 0; i < total; i++) { const b = document.createElement('span'); b.className = 'bub'; f.appendChild(b); }
      sheet.appendChild(f); upd();
    }
    function popAt(x, y) {
      const t = document.elementFromPoint(x, y);
      if (t && t.classList.contains('bub') && !t.classList.contains('popped')) {
        t.classList.add('popped'); popped++; life++; sfxPop(); buzz(10); upd();
        if (popped === total) timer = setTimeout(build, 700);
      }
    }
    const pd = e => { down = true; ac(); popAt(e.clientX, e.clientY); }, pm = e => { if (down) popAt(e.clientX, e.clientY); }, pu = () => down = false;
    sheet.addEventListener('pointerdown', pd); window.addEventListener('pointermove', pm); window.addEventListener('pointerup', pu); window.addEventListener('pointercancel', pu);
    btn.onclick = () => { build(); click(900, .03, .2, 'triangle'); };
    const raf = requestAnimationFrame(build);
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); window.removeEventListener('pointermove', pm); window.removeEventListener('pointerup', pu); window.removeEventListener('pointercancel', pu); };
  },
};
