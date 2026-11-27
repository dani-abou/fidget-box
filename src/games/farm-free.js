// Free Farm: Sunny Acres without a clock. Build the whole farm at your own
// pace; it saves as you play and helpers earn while you're away. Same engine
// as the levels (farm.js, mode 'free'); balance lives in farm/config.js.
import { runLevel } from './farm.js';
import { loadSave } from '../lib/progress.js';
import { pills } from '../lib/ui.js';
import { UNLOCKS } from './farm/config.js';

export default {
  id: 'farm-free',
  name: 'Free Farm',
  description: 'Sunny Acres with no clock: build the whole farm at your own pace. Helpers keep earning while you\'re away.',
  color: '--sky',
  icon: '<svg viewBox="0 0 40 40" fill="currentColor"><path d="M20 6c-6 0-10 5-10 11 0 5 4 9 10 9s10-4 10-9c0-6-4-11-10-11zM8 30h24v4H8z"/></svg>',
  art: `<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#7FC8F8"/><circle cx="78" cy="22" r="11" fill="#FFE066" stroke="#2B1D3A" stroke-width="3"/>
    <path d="M0 62c18-10 34-10 50-2s32 8 50-2v42H0z" fill="#86CF62" stroke="#2B1D3A" stroke-width="3"/>
    <rect x="18" y="40" width="34" height="30" rx="3" fill="#E5544B" stroke="#2B1D3A" stroke-width="3.5"/><path d="M14 42 35 26l21 16z" fill="#9C3A33" stroke="#2B1D3A" stroke-width="3.5" stroke-linejoin="round"/>
    <rect x="29" y="52" width="12" height="18" fill="#FFF3DC" stroke="#2B1D3A" stroke-width="3"/><path d="M29 52l12 18M41 52 29 70" stroke="#2B1D3A" stroke-width="2"/>
    <rect x="62" y="66" width="26" height="16" rx="3" fill="#9C6A43" stroke="#2B1D3A" stroke-width="3"/><g fill="#FF8A2A" stroke="#2B1D3A" stroke-width="2"><path d="M66 66l3-9 3 9z"/><path d="M73 66l3-9 3 9z"/><path d="M80 66l3-9 3 9z"/></g>
    <text x="50" y="94" font-size="12" font-weight="700" text-anchor="middle" font-family="Fredoka,sans-serif" fill="#2B1D3A">∞</text></svg>`,
  meta() {
    const sv = loadSave('farm-free'), built = (sv?.unlocked || []).length;
    return pills([{ value: `🪙 ${sv?.coins ?? 0}`, cls: 'star' }, { label: 'Built', value: `${built}/${UNLOCKS.length}` }]);
  },
  init(el) {
    let stop = null;
    const api = { start() { stop?.(); stop = runLevel(el, 0, api, 'free'); } };
    el._farm = api; // lets the automated checks reach it
    api.start();
    return () => stop?.();
  },
};
