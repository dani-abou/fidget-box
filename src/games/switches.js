import { buzz, click } from '../lib/sound.js';
import { ACCENTS } from '../lib/palette.js';

export default {
  id: 'switches',
  name: 'Switchboard',
  description: 'Toggles, clicky keys and a notched slider.',
  color: '--mint',
  icon: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="4" y="12" width="32" height="16" rx="8"/><circle cx="28" cy="20" r="5" fill="currentColor"/></svg>',
  css: `
.board{flex:1;overflow:auto;overscroll-behavior:contain;padding:8px 16px 20px;display:flex;flex-direction:column;gap:26px;touch-action:manipulation}
.board h2{font-size:15px;font-weight:500;color:var(--muted);margin:0 0 10px}
.toggles{display:grid;grid-template-columns:repeat(3,1fr);gap:14px 10px;justify-items:center}
.tg{width:78px;height:44px;border-radius:999px;background:var(--line);position:relative;transition:background .15s}
.tg .knob{position:absolute;top:4px;left:4px;width:36px;height:36px;border-radius:50%;background:var(--surface);box-shadow:0 2px 4px rgba(0,0,0,.2);transition:transform .16s cubic-bezier(.4,1.6,.6,1)}
.tg[aria-pressed="true"]{background:var(--c)}
.tg[aria-pressed="true"] .knob{transform:translateX(34px)}
.keys{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;justify-items:center}
.key{width:76px;height:76px;border-radius:50%;background:var(--c);box-shadow:0 7px 0 color-mix(in srgb,var(--c) 60%,#000);transform:translateY(0);transition:transform .05s,box-shadow .05s;touch-action:manipulation}
.key.down{transform:translateY(6px);box-shadow:0 1px 0 color-mix(in srgb,var(--c) 60%,#000)}
.notch{width:100%;height:44px;-webkit-appearance:none;appearance:none;background:transparent;touch-action:pan-y}
.notch::-webkit-slider-runnable-track{height:14px;border-radius:999px;background:repeating-linear-gradient(90deg,var(--line) 0 2px,var(--surface) 2px calc(100%/24))}
.notch::-moz-range-track{height:14px;border-radius:999px;background:var(--line)}
.notch::-webkit-slider-thumb{-webkit-appearance:none;width:36px;height:36px;margin-top:-11px;border-radius:12px;background:var(--peach);box-shadow:0 2px 5px rgba(0,0,0,.25)}
.notch::-moz-range-thumb{width:36px;height:36px;border:0;border-radius:12px;background:var(--peach)}
@media (prefers-reduced-motion: reduce){.tg,.tg .knob,.key{transition:none}}`,

  init(el) {
    const cols = ACCENTS;
    let html = '<div class="board"><div><h2>Toggles</h2><div class="toggles">';
    for (let i = 0; i < 12; i++) html += '<button class="tg" aria-pressed="false" aria-label="Toggle ' + (i + 1) + '" style="--c:var(' + cols[i % 5] + ')"><span class="knob"></span></button>';
    html += '</div></div><div><h2>Keys</h2><div class="keys">';
    for (let i = 0; i < 6; i++) html += '<button class="key" aria-label="Key ' + (i + 1) + '" style="--c:var(' + cols[(i + 2) % 5] + ')"></button>';
    html += '</div></div><div><h2>Notched slider</h2><input class="notch" type="range" min="0" max="24" step="1" value="12" aria-label="Notched slider"></div></div>';
    el.innerHTML = html;
    el.querySelectorAll('.tg').forEach(b => b.onclick = () => { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); click(on ? 2300 : 1600, .02, .22); buzz(8); });
    el.querySelectorAll('.key').forEach(b => {
      const dn = () => { b.classList.add('down'); click(700 + Math.random() * 80, .035, .28, 'triangle'); buzz(12); };
      const upk = () => { if (b.classList.contains('down')) { b.classList.remove('down'); click(1500, .015, .14); } };
      b.addEventListener('pointerdown', dn); b.addEventListener('pointerup', upk); b.addEventListener('pointerleave', upk); b.addEventListener('pointercancel', upk);
      b.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); dn(); } }); b.addEventListener('keyup', upk);
    });
    const s = el.querySelector('.notch'); s.addEventListener('input', () => { click(500 + s.value * 55, .015, .22); buzz(5); });
    return null; // everything lives inside `el`, which the shell clears
  },
};
