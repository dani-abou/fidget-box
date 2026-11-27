// Sound + haptics. Web Audio is synthesised, so there are no audio files to load.
import { settings } from './settings.js';

let actx = null, noiseBuf = null;

/** Get (and resume) the shared AudioContext. Call from a user gesture first. */
export function ac() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}

export function buzz(ms) { if (settings.buzz && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} } }

export function click(f, d, v, type) {
  const c = ac(); if (!c || !settings.sound) return; const t = c.currentTime;
  const o = c.createOscillator(), g = c.createGain(); o.type = type || 'square';
  o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(40, f * .5), t + d);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + d + .02);
}

export function sfxPop() {
  const c = ac(); if (!c || !settings.sound) return;
  if (!noiseBuf) {
    const n = Math.floor(c.sampleRate * .12); noiseBuf = c.createBuffer(1, n, c.sampleRate); const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 5);
  }
  const s = c.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = .8 + Math.random() * .5;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700 + Math.random() * 900; bp.Q.value = .9;
  const g = c.createGain(); g.gain.value = 1.3; s.connect(bp).connect(g).connect(c.destination); s.start();
  click(170, .05, .3, 'sine');
}

export function tone(f) {
  const c = ac(); if (!c || !settings.sound) return; const t = c.currentTime;
  const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), g2 = c.createGain();
  o.type = 'sine'; o.frequency.value = f; o2.type = 'triangle'; o2.frequency.value = f * 2; g2.gain.value = .2;
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.15, t + .015); g.gain.exponentialRampToValueAtTime(.0001, t + 1.4);
  o.connect(g); o2.connect(g2).connect(g); g.connect(c.destination); o.start(t); o2.start(t); o.stop(t + 1.5); o2.stop(t + 1.5);
}
