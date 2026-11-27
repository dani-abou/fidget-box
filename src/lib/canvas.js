// A HiDPI canvas that fills its flex slot and tracks resizes.
export function makeCanvas(el, onSize) {
  const cv = document.createElement('canvas'); cv.className = 'cv'; el.prepend(cv);
  const g = cv.getContext('2d'); const st = { cv, g, W: 0, H: 0 };
  const ro = new ResizeObserver(() => {
    const d = Math.min(devicePixelRatio || 1, 2); st.W = cv.clientWidth; st.H = cv.clientHeight;
    cv.width = Math.round(st.W * d); cv.height = Math.round(st.H * d); g.setTransform(d, 0, 0, d, 0, 0); onSize && onSize();
  });
  ro.observe(cv); st.stop = () => ro.disconnect(); return st;
}

/** Pointer position relative to a canvas. */
export function rel(cv, e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
