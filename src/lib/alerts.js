// Hastemeldinger: alvorlighet, visning, ferdige maler og farger.
// Felles for server (src/api/alerts.js, buildState) og nettleser (Hjem, skjermene).
// Apple TV-appen har de samme fargene i DisplayView.swift.

export const SEVERITIES = [
  { value: 'info', label: 'Informasjon', bg: '#1d4ed8', fg: '#ffffff' },
  { value: 'warning', label: 'Viktig', bg: '#f59e0b', fg: '#1a1205' },
  { value: 'critical', label: 'Kritisk', bg: '#dc2626', fg: '#ffffff' }
];

export const DISPLAYS = [
  { value: 'flash', label: 'Hele skjermen i 30 sekunder, så banner' },
  { value: 'full', label: 'Hele skjermen hele tiden' },
  { value: 'banner', label: 'Bare banner nederst' }
];

/** Hvor lenge «flash» dekker hele skjermen før den blir et banner. */
export const FLASH_MS = 30_000;

// Farevarsler fra MET har farge etter nivå, som på yr.no.
export const MET_LEVELS = {
  yellow: { label: 'Gult', bg: '#facc15', fg: '#1a1205' },
  orange: { label: 'Oransje', bg: '#f97316', fg: '#1a1205' },
  red: { label: 'Rødt', bg: '#dc2626', fg: '#ffffff' }
};

export const TEMPLATES = [
  {
    id: 'evacuate',
    label: 'Evakuering',
    severity: 'critical',
    display: 'full',
    title: 'Evakuer bygget',
    message: 'Forlat bygget rolig gjennom nærmeste nødutgang og gå til møteplassen.'
  },
  {
    id: 'drill',
    label: 'Brannøvelse',
    severity: 'warning',
    display: 'flash',
    title: 'Brannøvelse',
    message: 'Brannøvelse pågår. Forlat lokalet rolig gjennom nærmeste utgang.'
  },
  {
    id: 'closed',
    label: 'Stengt',
    severity: 'info',
    display: 'banner',
    title: 'Stengt',
    message: 'Vi har stengt i dag. Velkommen tilbake i morgen.'
  },
  {
    id: 'delay',
    label: 'Forsinkelse',
    severity: 'warning',
    display: 'banner',
    title: 'Forsinkelse',
    message: 'Det er forsinkelser. Vi oppdaterer når vi vet mer.'
  },
  {
    id: 'meeting',
    label: 'Fellesmøte',
    severity: 'info',
    display: 'flash',
    title: 'Fellesmøte',
    message: 'Felles samling i kantina om 10 minutter.'
  }
];

const SEVERITY_VALUES = SEVERITIES.map((s) => s.value);
const DISPLAY_VALUES = DISPLAYS.map((d) => d.value);

// Eldre meldinger (før alvorlighet fantes) var røde og dekket hele skjermen.
export const severityOf = (a) => (SEVERITY_VALUES.includes(a?.severity) ? a.severity : 'critical');
export const displayOf = (a) => (DISPLAY_VALUES.includes(a?.display) ? a.display : 'flash');

/** Farger for en melding: MET-nivå, ellers alvorlighet. */
export function alertColors(a) {
  if (a?.level && MET_LEVELS[a.level]) return MET_LEVELS[a.level];
  return SEVERITIES.find((s) => s.value === severityOf(a));
}

/** Overskriften over meldingen: egen tittel, ellers alvorligheten. */
export function alertHeading(a) {
  if (a?.title) return a.title;
  return { info: 'Informasjon', warning: 'Viktig', critical: 'Viktig beskjed' }[severityOf(a)];
}

const iso = (v) => {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

/** Vises meldingen nå? (aktiv, startet og ikke utløpt) */
export function isLive(a, now = Date.now()) {
  if (!a || a.active === 0) return false;
  const start = a.starts_at ? Date.parse(a.starts_at) : -Infinity;
  const end = a.ends_at ? Date.parse(a.ends_at) : Infinity;
  return start <= now && now < end;
}

/** Planlagt, men ikke startet ennå? */
export const isScheduled = (a, now = Date.now()) => !!a?.starts_at && a.active !== 0 && Date.parse(a.starts_at) > now;

/**
 * Renser en ny melding fra admin. -> { value } eller { error }.
 * Sluttid kan gis som `ends_at` eller som `duration_minutes` fra start.
 */
export function cleanAlert(b, now = Date.now()) {
  const message = String(b?.message ?? '').trim().slice(0, 500);
  if (!message) return { error: 'Skriv en melding' };
  const title = String(b?.title ?? '').trim().slice(0, 80) || null;
  const severity = SEVERITY_VALUES.includes(b?.severity) ? b.severity : 'warning';
  const display = DISPLAY_VALUES.includes(b?.display) ? b.display : 'flash';
  let startsAt = iso(b?.starts_at);
  if (startsAt && Date.parse(startsAt) <= now + 30_000) startsAt = null; // «nå»
  let endsAt = iso(b?.ends_at);
  const minutes = Number(b?.duration_minutes);
  if (!endsAt && Number.isFinite(minutes) && minutes > 0) {
    endsAt = new Date((startsAt ? Date.parse(startsAt) : now) + Math.min(minutes, 60 * 24 * 31) * 60_000).toISOString();
  }
  if (endsAt && Date.parse(endsAt) <= (startsAt ? Date.parse(startsAt) : now)) return { error: 'Sluttiden må være etter starttiden' };
  if (startsAt && Date.parse(startsAt) > now + 365 * 86_400_000) return { error: 'Starttiden kan være høyst ett år fram i tid' };
  return { value: { message, title, severity, display, starts_at: startsAt, ends_at: endsAt } };
}
