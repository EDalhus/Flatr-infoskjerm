// Felles klokke for lysbildene: alle skjermer som viser samme presentasjon,
// bytter lysbilde samtidig. Posisjonen regnes ut fra servertiden (ikke fra når
// skjermen startet), så to TV-er i samme rom står alltid på samme lysbilde.
// Samme regel i TV-appen (ScreenViewModel.swift) – endres den her, må den endres der.

let offsetMs = 0;

/** Kalles med serverTime fra hver ferske tilstand. */
export function setServerTime(iso) {
  const t = Date.parse(iso);
  if (Number.isFinite(t)) offsetMs = t - Date.now();
}

export const serverNow = () => Date.now() + offsetMs;

export const slideSeconds = (s) => Math.max(2, Number(s?.duration_seconds) || 15);

/** Lysbildet som skal vises nå: { index, remainingMs }. */
export function clockPosition(slides, nowMs = serverNow()) {
  const lengths = slides.map((s) => slideSeconds(s) * 1000);
  const total = lengths.reduce((a, b) => a + b, 0);
  if (!total) return { index: 0, remainingMs: Infinity };
  let t = ((nowMs % total) + total) % total;
  for (let i = 0; i < lengths.length; i++) {
    if (t < lengths[i]) return { index: i, remainingMs: lengths[i] - t };
    t -= lengths[i];
  }
  return { index: 0, remainingMs: lengths[0] };
}
