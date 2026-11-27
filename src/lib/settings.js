// Sound and Buzz toggles, stored in localStorage under the same keys as the
// original single-file app (fb_sound, fb_buzz), so existing settings carry over.
function load(k, d) { try { const v = localStorage.getItem('fb_' + k); return v === null ? d : v === '1'; } catch (e) { return d; } }
function save(k, v) { try { localStorage.setItem('fb_' + k, v ? '1' : '0'); } catch (e) {} }

export const settings = { sound: load('sound', true), buzz: load('buzz', true) };

export function setSetting(k, v) { settings[k] = v; save(k, v); }
