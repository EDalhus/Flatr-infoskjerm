// Bursdager-appen: felles for server (data til skjermene) og admin
// (forhåndsvisning før lagring). Skjermene får aldri fødselsdatoene, bare
// navn, dag/måned, dager igjen og eventuell alder.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Gyldig fødselsdato som YYYY-MM-DD (ikke i framtiden), ellers null. */
export function normBirthdate(v) {
  const s = String(v ?? '').trim();
  let y, m, d;
  let hit = DATE_RE.exec(s);
  if (hit) [, y, m, d] = hit;
  else if ((hit = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s))) [, d, m, y] = hit; // 14.11.1990
  else return null;
  const date = new Date(Date.UTC(+y, +m - 1, +d));
  if (date.getUTCFullYear() !== +y || date.getUTCMonth() !== +m - 1 || date.getUTCDate() !== +d) return null;
  if (+y < 1900 || date.getTime() > Date.now()) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Tolker en innlimt liste: én person per linje, navn og dato skilt med
 * komma, semikolon eller tabulator (f.eks. kopiert fra Excel).
 * -> { people: [{ name, date }], skipped: [linje, …] }
 */
export function parsePeopleList(text) {
  const people = [];
  const skipped = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/[;\t,]/).map((p) => p.trim()).filter(Boolean);
    const dateIdx = parts.findIndex((p) => normBirthdate(p));
    const name = parts.filter((_, i) => i !== dateIdx).join(' ').trim();
    if (dateIdx < 0 || !name) skipped.push(line);
    else people.push({ name: name.slice(0, 80), date: normBirthdate(parts[dateIdx]) });
  }
  return { people, skipped };
}

/** Dagens dato (YYYY-MM-DD) i en tidssone. */
export function todayIn(tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

const utc = (y, m, d) => Date.UTC(y, m - 1, d);
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * De neste bursdagene fra og med i dag. 29. februar feires 28. februar i
 * vanlige år. -> [{ id, name, month, day, next: 'YYYY-MM-DD', days, age|null }]
 */
export function upcomingBirthdays(people, today, { max = 20, showAge = true } = {}) {
  const [ty, tm, td] = today.split('-').map(Number);
  const t0 = utc(ty, tm, td);
  const out = [];
  for (const p of people || []) {
    const date = normBirthdate(p.date);
    if (!date) continue;
    const [by, bm, bd] = date.split('-').map(Number);
    let year = ty;
    const dayIn = (y) => (bm === 2 && bd === 29 && !isLeap(y) ? 28 : bd);
    if (utc(year, bm, dayIn(year)) < t0) year += 1;
    const d = dayIn(year);
    out.push({
      id: p.id,
      name: p.name,
      month: bm,
      day: d,
      next: `${year}-${String(bm).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      days: Math.round((utc(year, bm, d) - t0) / 86_400_000),
      age: showAge && !p.hideAge ? year - by : null
    });
  }
  return out.sort((a, b) => a.days - b.days || a.name.localeCompare(b.name, 'nb')).slice(0, max);
}

/** «I dag», «I morgen», «Om 5 dager». */
export const daysText = (days) => (days === 0 ? 'I dag' : days === 1 ? 'I morgen' : `Om ${days} dager`);

/** «fre. 14. nov.» uten tidssonetull (datoen er en ren kalenderdato). */
export function dateText(next) {
  const [y, m, d] = next.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}
