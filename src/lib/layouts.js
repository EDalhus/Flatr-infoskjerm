// Layout-presets. Hver sone er et rektangel i prosent { id, x, y, w, h }.
// Viewer plasserer sonene absolutt; admin bruker samme data til miniatyrer.

const r = (id, x, y, w, h) => ({ id, x, y, w, h });

const LANDSCAPE = {
  solo: [r('a', 0, 0, 100, 100)],
  'main-side': [r('a', 0, 0, 70, 100), r('b', 70, 0, 30, 100)],
  split: [r('a', 0, 0, 50, 100), r('b', 50, 0, 50, 100)],
  thirds: [r('a', 0, 0, 65, 100), r('b', 65, 0, 35, 50), r('c', 65, 50, 35, 50)]
};

const PORTRAIT = {
  solo: [r('a', 0, 0, 100, 100)],
  'main-side': [r('a', 0, 0, 100, 65), r('b', 0, 65, 100, 35)],
  split: [r('a', 0, 0, 100, 50), r('b', 0, 50, 100, 50)],
  thirds: [r('a', 0, 0, 100, 50), r('b', 0, 50, 100, 25), r('c', 0, 75, 100, 25)]
};

export const LAYOUT_OPTIONS = [
  { value: 'solo', label: 'Helskjerm' },
  { value: 'main-side', label: 'Hoved + sidepanel' },
  { value: 'split', label: 'To halvdeler' },
  { value: 'thirds', label: 'Tre soner (A / B+C)' },
  { value: 'custom', label: 'Egendefinert' }
];

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

function customZones(customLayout) {
  const raw = Array.isArray(customLayout?.zones)
    ? customLayout.zones
    : Array.isArray(customLayout)
      ? customLayout
      : null;
  if (!raw?.length) return null;
  return raw.map((z, i) => ({
    id: String(z.id || String.fromCharCode(97 + i)),
    x: num(z.x),
    y: num(z.y),
    w: num(z.w, 100),
    h: num(z.h, 100)
  }));
}

/** Sonene en skjerm skal rendres med, gitt orientering. */
export function resolveZones(screen, orientation = 'landscape') {
  const layout = screen?.layout || 'main-side';
  if (layout === 'custom') {
    const zones = customZones(screen?.custom_layout);
    if (zones) return zones;
  }
  const table = orientation === 'portrait' ? PORTRAIT : LANDSCAPE;
  return table[layout] || table['main-side'];
}

/** Sone-ID-ene admin skal tilby spillelister for (uavhengig av orientering). */
export function zonesForScreen(screen) {
  const layout = screen?.layout || 'main-side';
  if (layout === 'custom') {
    const zones = customZones(screen?.custom_layout);
    if (zones) return zones.map((z) => z.id);
  }
  return (LANDSCAPE[layout] || LANDSCAPE['main-side']).map((z) => z.id);
}

export const LANDSCAPE_PRESETS = LANDSCAPE;
