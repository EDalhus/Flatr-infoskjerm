// Kampprogram (Flatr App «fixtures»): lagenes kalendere fra fotball.no og
// handball.no – gratis og uten nøkkel. Se src/lib/fixtures.js for formatet.
//
// Appens config: { teams: [{ id, url, name, calname }] }
//   name    – det kunden kaller laget på skjermen (standard: kalendernavnet forkortet)
//   calname – kalendernavnet («Fredrikstad Menn Senior A»), avgjør hjemme/borte

import { parseIcs, upcomingEvents, calendarName } from '../lib/icsParse.js';
import { normalizeCalendarUrl, shortTeam, toFixture, MAX_TEAMS } from '../lib/fixtures.js';
import { fetchText } from './safeFetch.js';

const DAYS = 120; // så langt fram vi ser etter kamper
const MAX = 60;

const str = (v, max) => String(v ?? '').trim().slice(0, max);

/** Henter og leser én lagkalender. Feiler med en forståelig melding. */
export async function readTeamCalendar(url) {
  let text;
  try {
    text = await fetchText(url, { accept: 'text/calendar, */*' });
  } catch (err) {
    throw new Error(`Fikk ikke hentet kalenderen (${err.message})`);
  }
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('Lenken er ikke en kalender. Bruk lenken fra «Abonner på kalender» på fotball.no eller handball.no.');
  return { calname: calendarName(text), events: parseIcs(text) };
}

/**
 * Renser lagene fra admin. Nye lag (eller endret lenke) hentes én gang, så vi
 * vet at lenken virker og hva laget heter.
 */
export async function cleanFixturesConfig(input, prev = {}) {
  const before = new Map((prev.teams || []).map((t) => [t.id, t]));
  const teams = [];
  for (const t of (Array.isArray(input?.teams) ? input.teams : []).slice(0, MAX_TEAMS)) {
    const url = normalizeCalendarUrl(t?.url);
    if (!url) throw new Error('Ugyldig kalenderlenke');
    const id = str(t?.id, 40) || crypto.randomUUID().slice(0, 8);
    const old = before.get(id);
    let calname = old?.url === url ? old.calname ?? null : null;
    if (!old || old.url !== url) calname = (await readTeamCalendar(url)).calname;
    teams.push({ id, url, calname, name: str(t?.name, 60) || shortTeam(calname) || 'Laget vårt' });
  }
  return { teams };
}

/** Kommende kamper for alle lagene, sortert etter tid. */
export async function fixturesData(config, tz) {
  const teams = config?.teams || [];
  const fixtures = [];
  const errors = [];
  await Promise.all(
    teams.map(async (t) => {
      try {
        const { calname, events } = await readTeamCalendar(t.url);
        const ours = t.calname || calname;
        for (const ev of upcomingEvents(events, { tz, days: DAYS, max: MAX, details: true })) {
          fixtures.push({ ...toFixture(ev, ours), team: t.id, team_name: t.name });
        }
      } catch (err) {
        errors.push(`${t.name}: ${err.message}`);
      }
    })
  );
  if (teams.length && errors.length === teams.length) throw new Error(errors[0]);
  fixtures.sort((a, b) => a.start.localeCompare(b.start));
  return {
    teams: teams.map((t) => ({ id: t.id, name: t.name })),
    fixtures: fixtures.slice(0, MAX),
    errors,
    tz,
    fetched_at: new Date().toISOString()
  };
}
