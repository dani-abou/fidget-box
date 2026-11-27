// Overlay panels shared by the games: results, menus and the level picker.
export const starText = n => '★'.repeat(n) + '☆'.repeat(3 - n);

/**
 * Show a panel over `host` (the game stage). buttons: [{label, primary, onClick}]
 * Returns close(). A button's onClick runs after the panel closes.
 */
export function panel(host, { title, html = '', buttons = [], dismissable = false }) {
  const ov = document.createElement('div'); ov.className = 'ov';
  ov.innerHTML = `<div class="panel" role="dialog" aria-modal="true"><h2></h2><div class="pbody">${html}</div><div class="pbtns"></div></div>`;
  ov.querySelector('h2').textContent = title;
  const close = () => ov.remove();
  for (const b of buttons) {
    const el = document.createElement('button'); el.className = 'btn' + (b.primary ? ' primary' : ''); el.textContent = b.label;
    el.onclick = () => { close(); b.onClick && b.onClick(); };
    ov.querySelector('.pbtns').append(el);
  }
  if (dismissable) ov.addEventListener('pointerdown', e => { if (e.target === ov) close(); });
  host.append(ov);
  (ov.querySelector('.btn.primary') || ov.querySelector('.btn'))?.focus({ preventScroll: true });
  return close;
}

/** Grid of levels: unlocked ones are tappable and show their best stars. */
export function levelPicker(host, { count, prog, onPick, title = 'Levels' }) {
  let html = '<div class="lv-grid">';
  for (let n = 1; n <= count; n++) {
    const locked = n > prog.unlocked;
    html += `<button class="lv${n === prog.last ? ' cur' : ''}" data-n="${n}" ${locked ? 'disabled aria-label="Level ' + n + ', locked"' : ''}>` +
      `<b>${locked ? '🔒' : n}</b><small>${locked ? '' : starText(prog.stars(n))}</small></button>`;
  }
  html += '</div>';
  const close = panel(host, { title, html, buttons: [{ label: 'Close' }], dismissable: true });
  const ov = host.lastElementChild;
  ov.querySelectorAll('.lv:not([disabled])').forEach(b => b.onclick = () => { close(); onPick(+b.dataset.n); });
  ov.querySelector('.lv.cur')?.scrollIntoView({ block: 'center' });
  return close;
}
