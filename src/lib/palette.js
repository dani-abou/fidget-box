// Current palette read from the CSS custom properties, for canvas games.
// `P` is a live binding: the shell calls readPal() on each route and on theme change.
export const ACCENTS = ['--sky', '--mint', '--lilac', '--peach', '--butter'];

export let P;
export function readPal() {
  const s = getComputedStyle(document.documentElement); const g = n => s.getPropertyValue(n).trim();
  P = { bg: g('--bg'), surface: g('--surface'), ink: g('--ink'), muted: g('--muted'), line: g('--line'), acc: ACCENTS.map(g) };
}
readPal();
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readPal); } catch (e) {}
