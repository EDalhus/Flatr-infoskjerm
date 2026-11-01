
import { tr } from './i18n.js';// Avganger fra Entur: felles for tavla på skjermen (DeparturesView), redigeringen
// og innstillingene. Apple TV har det samme i EnturWidget (AppWidgetViews.swift).

export const MODES = [
  { id: 'bus', label: tr('Buss') },
  { id: 'tram', label: tr('Trikk') },
  { id: 'metro', label: tr('T-bane') },
  { id: 'rail', label: tr('Tog') },
  { id: 'water', label: tr('Båt') },
  { id: 'coach', label: tr('Ekspressbuss') }
];
export const MODE_LABEL = { ...Object.fromEntries(MODES.map((m) => [m.id, m.label])), air: 'Fly', lift: 'Taubane' };

/** «Nå», «5 min» (under et kvarter) eller klokkeslett. */
export function departureText(iso, now, tz = 'Europe/Oslo') {
  const ms = Date.parse(iso) - now;
  if (ms < 60_000) return tr('Nå');
  const min = Math.floor(ms / 60_000);
  if (min < 15) return `${min} min`;
  return new Date(iso).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', timeZone: tz });
}

/** Avgangene elementet viser: valgte transportmidler, ikke før gangtiden, sortert etter tid. */
export function upcoming(stop, { modes, walkMinutes = 0, max = 8 } = {}, now = Date.now()) {
  const want = Array.isArray(modes) && modes.length ? new Set(modes) : null;
  const earliest = now + Math.max(0, Number(walkMinutes) || 0) * 60_000 - 30_000;
  return (stop?.departures || [])
    .filter((d) => (!want || want.has(d.mode)) && Date.parse(d.expected) >= earliest)
    .sort((a, b) => Date.parse(a.expected) - Date.parse(b.expected))
    .slice(0, Math.max(1, Math.min(20, Number(max) || 8)));
}

/** Plattform eller spor, som det står på holdeplassen. */
export const platformText = (d) => (d.platform ? `${d.mode === 'rail' ? 'Spor' : 'Plattform'} ${d.platform}` : '');
