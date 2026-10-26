// Minimal iCalendar-tolker (lesing; src/lib/ics.js er eksport) (RFC 5545) for kalender-widgeten: Google- og
// Outlook-kalendere publisert som .ics.
//
// Støtter VEVENT med DTSTART/DTEND (UTC, TZID eller flytende tid),
// heldagshendelser, RRULE (DAILY/WEEKLY/MONTHLY/YEARLY med INTERVAL, COUNT,
// UNTIL, BYDAY for ukentlige) og EXDATE.

import { DEFAULT_TZ } from './timeslots.js';

const BYDAY = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 0 };

/** UTC-forskyvning (ms) for tidssonen `tz` ved tidspunktet `ms`. */
function tzOffset(ms, tz) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value])
  );
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - ms;
}

/** Veggklokketid i `tz` -> UTC-millisekunder. */
function zonedToUtc(y, mo, d, h, mi, s, tz) {
  const guess = Date.UTC(y, mo, d, h, mi, s);
  let ms = guess - tzOffset(guess, tz);
  ms = guess - tzOffset(ms, tz); // én runde til for sommertid-overganger
  return ms;
}

function validTz(tz) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** "20261026T090000Z" / "20261026T090000" / "20261026" -> { wall: [y,mo,d,h,mi,s], utc, allDay } */
function parseStamp(value, params) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(String(value).trim());
  if (!m) return null;
  const wall = [Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0)];
  const allDay = !m[4] || params.VALUE === 'DATE';
  return { wall, utc: !!m[7], allDay, tzid: params.TZID && validTz(params.TZID) ? params.TZID : null };
}

function unfold(text) {
  return String(text).replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

function parseLine(line) {
  const i = line.indexOf(':');
  if (i < 0) return null;
  const [name, ...rawParams] = line.slice(0, i).split(';');
  const params = Object.fromEntries(rawParams.map((p) => p.split('=')).map(([k, v]) => [k.toUpperCase(), (v || '').replace(/"/g, '')]));
  return { name: name.toUpperCase(), params, value: line.slice(i + 1) };
}

const unescape = (s) => String(s || '').replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();

export function parseIcs(text) {
  const events = [];
  let cur = null;
  for (const raw of unfold(text)) {
    const l = parseLine(raw);
    if (!l) continue;
    if (l.name === 'BEGIN' && l.value === 'VEVENT') cur = { exdates: [] };
    else if (l.name === 'END' && l.value === 'VEVENT') {
      if (cur?.start && cur.status !== 'CANCELLED') events.push(cur);
      cur = null;
    } else if (cur) {
      if (l.name === 'SUMMARY') cur.title = unescape(l.value);
      else if (l.name === 'LOCATION') cur.location = unescape(l.value);
      else if (l.name === 'DTSTART') cur.start = parseStamp(l.value, l.params);
      else if (l.name === 'DTEND') cur.end = parseStamp(l.value, l.params);
      else if (l.name === 'RRULE') cur.rrule = Object.fromEntries(l.value.split(';').map((kv) => kv.split('=')));
      else if (l.name === 'EXDATE') for (const v of l.value.split(',')) cur.exdates.push(parseStamp(v, l.params));
      else if (l.name === 'STATUS') cur.status = l.value.toUpperCase();
    }
  }
  return events;
}

/** Tidsstempel -> UTC-ms, med kalenderens/kontoens tidssone for flytende tider. */
function toMs(stamp, tz) {
  const [y, mo, d, h, mi, s] = stamp.wall;
  if (stamp.utc) return Date.UTC(y, mo, d, h, mi, s);
  return zonedToUtc(y, mo, d, h, mi, s, stamp.tzid || tz);
}

/** Forskyver veggklokketid med n dager/måneder/år (tidssone-trygt via UTC-felt). */
function shiftWall(wall, unit, n) {
  const d = new Date(Date.UTC(...wall));
  if (unit === 'DAILY') d.setUTCDate(d.getUTCDate() + n);
  else if (unit === 'WEEKLY') d.setUTCDate(d.getUTCDate() + 7 * n);
  else if (unit === 'MONTHLY') d.setUTCMonth(d.getUTCMonth() + n);
  else if (unit === 'YEARLY') d.setUTCFullYear(d.getUTCFullYear() + n);
  return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()];
}

/** Alle forekomster (veggklokketid) av en hendelse som kan starte før `untilMs`. */
function occurrences(ev, tz, untilMs) {
  const rule = ev.rrule;
  if (!rule?.FREQ) return [ev.start.wall];
  const freq = rule.FREQ;
  const interval = Math.max(1, Number(rule.INTERVAL) || 1);
  const count = Number(rule.COUNT) || Infinity;
  const until = rule.UNTIL ? parseStamp(rule.UNTIL, {}) : null;
  const untilRule = until ? toMs({ ...until, tzid: ev.start.tzid }, tz) : Infinity;
  const days = freq === 'WEEKLY' && rule.BYDAY ? rule.BYDAY.split(',').map((d) => BYDAY[d.slice(-2)]).filter((d) => d != null) : null;

  const out = [];
  let made = 0;
  for (let i = 0; i < 5000 && made < count; i++) {
    const base = shiftWall(ev.start.wall, freq, i * interval);
    // Ukentlig med BYDAY: alle valgte ukedager i uka som starter på DTSTART-uka.
    const candidates = days
      ? days
          .map((dow) => {
            const startDow = new Date(Date.UTC(...base)).getUTCDay();
            return shiftWall(base, 'DAILY', (dow - startDow + 7) % 7);
          })
          .sort((a, b) => Date.UTC(...a) - Date.UTC(...b))
      : [base];
    for (const wall of candidates) {
      const ms = toMs({ ...ev.start, wall }, tz);
      if (ms < toMs(ev.start, tz)) continue;
      if (ms > untilRule || made >= count) return out;
      if (ms > untilMs) return out;
      made++;
      out.push(wall);
    }
  }
  return out;
}

/** Kommende forekomster innen `days` dager, sortert, maks `max`. */
export function upcomingEvents(events, { tz = DEFAULT_TZ, days = 14, max = 8, now = Date.now() } = {}) {
  const horizon = now + days * 86_400_000;
  const list = [];
  for (const ev of events) {
    const startMs = toMs(ev.start, tz);
    const duration = ev.end ? toMs(ev.end, tz) - startMs : ev.start.allDay ? 86_400_000 : 3_600_000;
    const ex = new Set(ev.exdates.filter(Boolean).map((x) => toMs({ ...x, tzid: x.tzid || ev.start.tzid }, tz)));
    for (const wall of occurrences(ev, tz, horizon)) {
      const s = toMs({ ...ev.start, wall }, tz);
      if (ex.has(s)) continue;
      const e = s + Math.max(0, duration);
      if (e <= now || s > horizon) continue;
      list.push({
        title: ev.title || '(uten tittel)',
        location: ev.location || null,
        start: new Date(s).toISOString(),
        end: new Date(e).toISOString(),
        allDay: !!ev.start.allDay
      });
    }
  }
  return list.sort((a, b) => a.start.localeCompare(b.start)).slice(0, max);
}
