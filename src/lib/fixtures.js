
import { tr } from './i18n.js';// Kampprogram: kamper fra lagenes kalendere på fotball.no og handball.no (iCal).
// fotball.no skriver «Hjemmelag - Bortelag» i SUMMARY, turnering og runde på
// første linje i DESCRIPTION, og lagets navn i kalendernavnet (X-WR-CALNAME).
// Felles for server (src/api/fixtures.js) og nettleser (innstillinger, visning).

export const MAX_TEAMS = 10;

/** webcal://… og https://… godtas; alt annet enn http(s) avvises. -> url eller null */
export function normalizeCalendarUrl(raw) {
  const s = String(raw ?? '').trim().replace(/^webcals?:\/\//i, 'https://');
  try {
    const u = new URL(s);
    return /^https?:$/.test(u.protocol) ? u.toString() : null;
  } catch {
    return null;
  }
}

// «Odd Menn Senior A» -> «Odd». Aldersklasser (G14, J15 …) beholdes – de er viktige i barnefotballen.
export const shortTeam = (name) =>
  String(name || '')
    .replace(/\s+(Menn|Kvinner|Herrer|Damer)\s+Senior(\s+[A-Z0-9]+)?$/i, '')
    .trim();

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

function splitTeams(title) {
  const i = String(title || '').indexOf(' - ');
  return i > 0 ? [title.slice(0, i).trim(), title.slice(i + 3).trim()] : [String(title || '').trim(), ''];
}

/**
 * Én kamp fra en kalenderhendelse (upcomingEvents med details).
 * `ours` er lagets navn (fra kalendernavnet) – avgjør hjemme eller borte.
 */
export function toFixture(ev, ours) {
  const [home, away] = splitTeams(ev.title);
  const side = ours ? (norm(home) === norm(ours) ? 'home' : norm(away) === norm(ours) ? 'away' : null) : null;
  const competition = String(ev.description || '').split('\n')[0].trim();
  return {
    home,
    away,
    side,
    start: ev.start,
    venue: ev.location || null,
    // Første linje i beskrivelsen er turneringen hos fotball.no – ellers ingenting.
    competition: competition && competition !== ev.title ? competition.slice(0, 80) : null,
    url: /^https:\/\//.test(ev.url || '') ? ev.url : null
  };
}

/** «lør 8. nov 19:15» / «i dag 19:15» / «i morgen 19:15» i kundens tidssone. */
export function fixtureTime(iso, tz, now = Date.now()) {
  const d = new Date(iso);
  const day = (x) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(x);
  const clock = new Intl.DateTimeFormat('nb-NO', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(d);
  if (day(d) === day(new Date(now))) return `i dag ${clock}`;
  if (day(d) === day(new Date(now + 86_400_000))) return `i morgen ${clock}`;
  const date = new Intl.DateTimeFormat('nb-NO', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(d).replace(/\./g, '');
  return `${date} ${clock}`;
}

/** «om 3 dager» / «om 5 timer» / «snart» til nedtellingen før neste kamp. */
export function untilText(iso, now = Date.now()) {
  const min = Math.round((Date.parse(iso) - now) / 60_000);
  if (min <= 0) return tr('nå');
  if (min < 60) return `om ${min} min`;
  const h = Math.round(min / 60);
  if (h < 36) return `om ${h} ${h === 1 ? 'time' : 'timer'}`;
  const d = Math.round(h / 24);
  return `om ${d} dager`;
}
