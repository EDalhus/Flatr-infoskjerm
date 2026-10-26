// Tidsplan for kanaler. Delt mellom server (buildState: hva vises nå) og
// admin (kalenderen), så kalenderen viser nøyaktig det skjermene gjør.
//
// En tidsregel (timeslot):
//   { id, screen_id, playlist_id, kind: 'playlist' | 'off', title,
//     days: "1,2,3,4,5" (ISO-ukedager, 1 = mandag; tom = alle),
//     start_time / end_time: "HH:MM" (tom = hele dagen; slutt < start = over midnatt),
//     start_date / end_date: "YYYY-MM-DD" (tom = ingen grense),
//     priority: 0 = vanlig, 10 = høy (overstyring), enabled }
//
// Gjelder flere regler samtidig, vinner høyest prioritet, deretter det
// korteste tidsvinduet (det mest spesifikke), deretter den nyeste.

export const DEFAULT_TZ = 'Europe/Oslo';
export const PRIORITY = { normal: 0, high: 10 };
export const DAY_LABELS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];

export const toMin = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  return m ? Math.min(1440, Number(m[1]) * 60 + Number(m[2])) : null;
};
export const fromMin = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

const WEEKDAY = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Lokal dato/ukedag/minutt i tidssonen `tz` for tidspunktet `when`. */
export function localParts(when = new Date(), tz = DEFAULT_TZ) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hourCycle: 'h23'
    }).formatToParts(when);
  } catch {
    return localParts(when, DEFAULT_TZ);
  }
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    dow: WEEKDAY[p.weekday] || 1,
    min: (Number(p.hour) % 24) * 60 + Number(p.minute)
  };
}

/** Datoaritmetikk på "YYYY-MM-DD" uten tidssone-overraskelser. */
export function addDays(date, n) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const dowOf = (date) => ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

export const parseDays = (days) =>
  String(days || '')
    .split(',')
    .map((d) => Number(d))
    .filter((d) => d >= 1 && d <= 7);

/** Gjelder regelen for (start)dagen `date`? (ukedag + datoperiode) */
export function appliesOnDate(slot, date) {
  const days = parseDays(slot.days);
  if (days.length && !days.includes(dowOf(date))) return false;
  if (slot.start_date && date < slot.start_date) return false;
  if (slot.end_date && date > slot.end_date) return false;
  return true;
}

/** Tidsvinduet i minutter: [start, slutt), slutt kan være > 1440 (over midnatt). */
export function windowOf(slot) {
  const st = toMin(slot.start_time);
  const en = toMin(slot.end_time);
  if (st == null && en == null) return [0, 1440];
  const s = st ?? 0;
  const e = en ?? 1440;
  return e > s ? [s, e] : [s, e + 1440];
}

/** Er regelen aktiv ved lokal tid `local` ({ date, min })? */
export function isActive(slot, local) {
  if (!slot.enabled) return false;
  const [s, e] = windowOf(slot);
  if (local.min >= s && local.min < Math.min(e, 1440) && appliesOnDate(slot, local.date)) return true;
  // Over midnatt: halen av gårsdagens vindu.
  if (e > 1440 && local.min < e - 1440 && appliesOnDate(slot, addDays(local.date, -1))) return true;
  return false;
}

/** Regelen som vinner nå (eller null). */
export function activeSlot(slots, when = new Date(), tz = DEFAULT_TZ) {
  const local = localParts(when, tz);
  const hits = (slots || []).filter((s) => isActive(s, local));
  if (!hits.length) return null;
  hits.sort((a, b) => {
    const pa = Number(a.priority) || 0;
    const pb = Number(b.priority) || 0;
    if (pa !== pb) return pb - pa;
    const [as, ae] = windowOf(a);
    const [bs, be] = windowOf(b);
    if (ae - as !== be - bs) return ae - as - (be - bs);
    return (b.id || 0) - (a.id || 0);
  });
  return hits[0];
}

/**
 * Blokker for en uke-kalender: [{ slot, date, start, end }] med minutter
 * innen dagen (vinduer over midnatt deles i to). `dates` = 7 datoer.
 */
export function weekBlocks(slots, dates) {
  const out = [];
  for (const slot of slots || []) {
    if (!slot.enabled) continue;
    const [s, e] = windowOf(slot);
    dates.forEach((date, i) => {
      if (appliesOnDate(slot, date)) out.push({ slot, date, start: s, end: Math.min(e, 1440) });
      if (e > 1440 && i + 1 < dates.length && appliesOnDate(slot, date)) {
        out.push({ slot, date: dates[i + 1], start: 0, end: e - 1440, tail: true });
      }
    });
    // Halen fra dagen før uka starter.
    if (e > 1440 && appliesOnDate(slot, addDays(dates[0], -1))) {
      out.push({ slot, date: dates[0], start: 0, end: e - 1440, tail: true });
    }
  }
  return out;
}
