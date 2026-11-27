// Per-game level progress and resumable state, in localStorage.
// Keys: fb_prog_<game> = {unlocked, last, stars:{level:n}}, fb_save_<game> = any JSON.
const read = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const write = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

export function progress(id) {
  const k = 'fb_prog_' + id;
  const p = read(k, { unlocked: 1, last: 1, stars: {} });
  return {
    get unlocked() { return p.unlocked; },
    get last() { return Math.min(p.last || 1, p.unlocked); },
    stars: n => p.stars[n] || 0,
    get totalStars() { return Object.values(p.stars).reduce((a, b) => a + b, 0); },
    play(n) { p.last = n; write(k, p); },
    /** Record a finished level; unlocks the next. */
    complete(n, stars = 1) {
      p.stars[n] = Math.max(p.stars[n] || 0, stars);
      p.unlocked = Math.max(p.unlocked, n + 1); p.last = n + 1; write(k, p);
    },
  };
}

export const loadSave = id => read('fb_save_' + id, null);
export const writeSave = (id, v) => write('fb_save_' + id, v);
