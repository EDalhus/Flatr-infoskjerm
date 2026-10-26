// Geometri for lerretet. Elementer har posisjon/størrelse i prosent av
// lerretet (x, y, w, h) og rotasjon i grader.

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const round = (v) => Math.round(v * 10) / 10;
export const SNAP_PCT = 0.7; // snap-terskel i % av lerretet

/** Avgrensningsboks rundt flere elementer (ignorerer rotasjon). */
export function bbox(els) {
  if (!els.length) return null;
  const x = Math.min(...els.map((e) => e.x));
  const y = Math.min(...els.map((e) => e.y));
  const r = Math.max(...els.map((e) => e.x + e.w));
  const b = Math.max(...els.map((e) => e.y + e.h));
  return { x, y, w: r - x, h: b - y };
}

/** Nærmeste snap-punkt innen terskelen: { diff, at } eller null. */
export function bestSnap(edges, cands, th = SNAP_PCT) {
  let best = null;
  for (const ev of edges)
    for (const cv of cands) {
      const diff = cv - ev;
      if (Math.abs(diff) <= th && (best === null || Math.abs(diff) < Math.abs(best.diff))) best = { diff, at: cv };
    }
  return best;
}

/** Snap-kandidater: lerretets kanter/midte + kantene og midten til de andre elementene. */
export function snapCandidates(others) {
  return {
    xs: [0, 50, 100, ...others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])],
    ys: [0, 50, 100, ...others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])]
  };
}

/** Ny boks ved skalering fra håndtaket `dir` (n, ne, e, se, s, sw, w, nw). */
export function resizeBox(dir, o, dx, dy, keepRatio) {
  let { x, y, w, h } = o;
  if (dir.includes('e')) w = o.w + dx;
  if (dir.includes('s')) h = o.h + dy;
  if (dir.includes('w')) {
    w = o.w - dx;
    x = o.x + dx;
  }
  if (dir.includes('n')) {
    h = o.h - dy;
    y = o.y + dy;
  }
  if (keepRatio && dir.length === 2) {
    const ratio = o.w / o.h;
    if (Math.abs(w / o.w) > Math.abs(h / o.h)) {
      const nh = w / ratio;
      if (dir.includes('n')) y = o.y + o.h - nh;
      h = nh;
    } else {
      const nw = h * ratio;
      if (dir.includes('w')) x = o.x + o.w - nw;
      w = nw;
    }
  }
  w = Math.max(1, w);
  h = Math.max(1, h);
  return { x, y, w, h };
}

export const intersects = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
