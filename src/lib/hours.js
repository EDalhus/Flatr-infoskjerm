// Åpningstider per skjerm: utenfor åpningstid er skjermen svart (som «Skjerm
// av» i tidsplanen). Felles for server (buildState) og admin.
//
// Format: { enabled: true, days: { 1: { open: '07:00', close: '17:00' }, …, 7: null } }
// Ukedag 1 = mandag … 7 = søndag. null/mangler = stengt hele dagen.
// close <= open betyr over midnatt (f.eks. 18:00–02:00).

export const WEEKDAYS = [
  [1, 'Mandag'],
  [2, 'Tirsdag'],
  [3, 'Onsdag'],
  [4, 'Torsdag'],
  [5, 'Fredag'],
  [6, 'Lørdag'],
  [7, 'Søndag']
];

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Renser innkommende åpningstider. Ugyldig = null (ingen åpningstider). */
export function cleanHours(input) {
  if (!input || typeof input !== 'object') return null;
  const days = {};
  for (const [d] of WEEKDAYS) {
    const v = input.days?.[d];
    days[d] = v && TIME_RE.test(v.open) && TIME_RE.test(v.close) && v.open !== v.close ? { open: v.open, close: v.close } : null;
  }
  return { enabled: input.enabled === true, days };
}

/** Standard: hverdager 07–17, stengt i helgen. */
export const defaultHours = () => ({
  enabled: true,
  days: { 1: { open: '07:00', close: '17:00' }, 2: { open: '07:00', close: '17:00' }, 3: { open: '07:00', close: '17:00' }, 4: { open: '07:00', close: '17:00' }, 5: { open: '07:00', close: '17:00' }, 6: null, 7: null }
});

const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Ukedag (1–7) og minutter over midnatt for et tidspunkt i en tidssone. */
export function localParts(date, tz) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz || 'Europe/Oslo',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const wd = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[get('weekday')];
  return { weekday: wd, minute: Number(get('hour')) * 60 + Number(get('minute')) };
}

/** Er skjermen innenfor åpningstid? Uten (aktive) åpningstider: alltid åpen. */
export function isOpen(hours, date = new Date(), tz = 'Europe/Oslo') {
  if (!hours?.enabled) return true;
  const { weekday, minute } = localParts(date, tz);
  const today = hours.days?.[weekday];
  if (today) {
    const o = minutes(today.open);
    const c = minutes(today.close);
    if (c > o ? minute >= o && minute < c : minute >= o) return true;
  }
  // Åpningstid fra i går som går over midnatt.
  const prev = hours.days?.[weekday === 1 ? 7 : weekday - 1];
  if (prev) {
    const o = minutes(prev.open);
    const c = minutes(prev.close);
    if (c <= o && minute < c) return true;
  }
  return false;
}

/** Kort oppsummering til admin: «Man–fre 07:00–17:00 · lør 10:00–15:00». */
export function summarize(hours) {
  if (!hours?.enabled) return 'Alltid på';
  const short = { 1: 'man', 2: 'tir', 3: 'ons', 4: 'tor', 5: 'fre', 6: 'lør', 7: 'søn' };
  const groups = [];
  for (const [d] of WEEKDAYS) {
    const v = hours.days?.[d];
    const key = v ? `${v.open}–${v.close}` : null;
    const last = groups[groups.length - 1];
    if (key && last && last.key === key && last.to === d - 1) last.to = d;
    else if (key) groups.push({ key, from: d, to: d });
  }
  if (!groups.length) return 'Alltid av';
  return groups.map((g) => `${g.from === g.to ? short[g.from] : `${short[g.from]}–${short[g.to]}`} ${g.key}`).join(' · ').replace(/^./, (c) => c.toUpperCase());
}
