// Panels, HUD pills and the level picker shared by the games.
import { confetti } from './fx.js';

export const starText = n => '★'.repeat(n) + '☆'.repeat(3 - n);
/** Three big stars; the earned ones pop in one after another. */
export const starsHTML = n => `<div class="big" aria-label="${n} of 3 stars">${[0, 1, 2].map(i => `<span class="${i < n ? 'on' : ''}" style="--i:${i}">★</span>`).join('')}</div>`;

/** HUD pills: [{label, value, cls}] -> html. label is the small grey word. */
export const pills = items => items.map(({ label = '', value, cls = '' }) =>
  `<span class="pill ${cls}">${label ? `<i>${label}</i>` : ''}${value}</span>`).join('');

/**
 * Show a panel over `host` (the game stage). buttons: [{label, primary, go, onClick}]
 * mood: 'win' (confetti) | 'lose' (peach ribbon) | undefined. Returns close().
 * A button's onClick runs after the panel closes.
 */
export function panel(host, { title, html = '', buttons = [], dismissable = false, mood, cls = '' }) {
  const ov = document.createElement('div'); ov.className = 'ov' + (cls ? ' ' + cls : '');
  ov.innerHTML = `<div class="panel${mood ? ' ' + mood : ''}" role="dialog" aria-modal="true"><h2></h2><div class="pbody">${html}</div><div class="pbtns"></div></div>`;
  ov.querySelector('h2').textContent = title;
  const close = () => ov.remove();
  for (const b of buttons) {
    const el = document.createElement('button'); el.className = 'btn' + (b.primary ? ' primary' : '') + (b.go ? ' go' : ''); el.textContent = b.label;
    el.onclick = () => { close(); b.onClick && b.onClick(); };
    ov.querySelector('.pbtns').append(el);
  }
  if (!buttons.length) ov.querySelector('.pbtns').remove();
  if (dismissable) ov.addEventListener('pointerdown', e => { if (e.target === ov) close(); });
  host.append(ov);
  if (mood === 'win') confetti(ov);
  (ov.querySelector('.btn.primary') || ov.querySelector('.btn'))?.focus({ preventScroll: true });
  return close;
}

/** Grid of level coins: done ones are gold with stars, the current one pulses, the rest are locked. */
export function levelPicker(host, { count, prog, onPick, title = 'Levels' }) {
  let html = '<div class="lv-grid">';
  for (let n = 1; n <= count; n++) {
    const locked = n > prog.unlocked, st = prog.stars(n);
    html += `<button class="lv${n === prog.last ? ' cur' : ''}${st ? ' done' : ''}" data-n="${n}" ${locked ? 'disabled aria-label="Level ' + n + ', locked"' : `aria-label="Level ${n}, ${st} stars"`}>` +
      `<b>${locked ? '🔒' : n}</b><small>${locked ? '' : '★'.repeat(st)}</small></button>`;
  }
  html += '</div>';
  const close = panel(host, { title, html, buttons: [{ label: 'Close' }], dismissable: true });
  const ov = host.lastElementChild;
  ov.querySelectorAll('.lv:not([disabled])').forEach(b => b.onclick = () => { close(); onPick(+b.dataset.n); });
  ov.querySelector('.lv.cur')?.scrollIntoView({ block: 'center' });
  return close;
}
