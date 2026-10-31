// Farevarsler fra MET (api.met.no/weatherapi/metalerts/2.0) for stedet kunden
// har valgt. De vises som hastemeldinger (banner) på alle skjermene mens de
// gjelder, med farge etter nivå: gult, oransje eller rødt.
//
// Innstillingen met_alerts = { enabled, place, lat, lon, min_level }
// (min_level: 2 = gult og over, 3 = oransje og over, 4 = bare rødt).

const UA = 'Flatr-infoskjerm/1.0 (+https://flatr.no)';
const TTL = 10 * 60_000;
const cache = new Map(); // "lat,lon" -> { at, data }
const LEVEL = { 2: 'yellow', 3: 'orange', 4: 'red' };
const LEVEL_NAME = { 2: 'Gult', 3: 'Oransje', 4: 'Rødt' };

export function cleanMetSettings(b) {
  const lat = Number(b?.lat);
  const lon = Number(b?.lon);
  const hasPlace = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  return {
    enabled: b?.enabled === true && hasPlace,
    place: hasPlace ? String(b?.place ?? '').trim().slice(0, 80) || null : null,
    lat: hasPlace ? Math.round(lat * 1000) / 1000 : null,
    lon: hasPlace ? Math.round(lon * 1000) / 1000 : null,
    min_level: [2, 3, 4].includes(Number(b?.min_level)) ? Number(b.min_level) : 2
  };
}

export async function metSettings(env) {
  try {
    const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'met_alerts'`).first();
    return row?.value ? cleanMetSettings(JSON.parse(row.value)) : null;
  } catch {
    return null;
  }
}

/** Alle varsler MET har for punktet (også de som ikke har startet ennå). */
export async function fetchMetAlerts(lat, lon) {
  const key = `${lat},${lon}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  try {
    const res = await fetch(`https://api.met.no/weatherapi/metalerts/2.0/current.json?lat=${lat}&lon=${lon}&lang=no`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000)
    });
    if (!res.ok) throw new Error(`MET svarte ${res.status}`);
    const body = await res.json();
    const data = (body?.features ?? [])
      .map((f) => {
        const p = f.properties ?? {};
        const level = Number(String(p.awareness_level ?? '').split(';')[0]);
        const [start, end] = f.when?.interval ?? [];
        return {
          id: String(p.id ?? ''),
          level,
          event: p.eventAwarenessName || p.event || 'Farevarsel',
          description: String(p.description ?? '').trim(),
          start: start || null,
          end: end || p.eventEndingTime || null
        };
      })
      .filter((w) => w.id && LEVEL[w.level]);
    cache.set(key, { at: Date.now(), data });
    if (cache.size > 300) cache.delete(cache.keys().next().value);
    return data;
  } catch (err) {
    if (hit) return hit.data; // vis siste kjente varsler hvis MET ikke svarer
    throw err;
  }
}

// Stabil negativ id per varsel, så den aldri kolliderer med egne meldinger.
function idFor(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return -(Math.abs(h) % 1_000_000_000) - 1;
}

/** Farevarslene som gjelder nå, formet som hastemeldinger (til buildState). */
export async function metAlertsNow(env, tz = 'Europe/Oslo', now = Date.now()) {
  const s = await metSettings(env);
  if (!s?.enabled) return [];
  let warnings;
  try {
    warnings = await fetchMetAlerts(s.lat, s.lon);
  } catch {
    return [];
  }
  const until = new Intl.DateTimeFormat('nb-NO', { timeZone: tz, weekday: 'long', hour: '2-digit', minute: '2-digit' });
  return warnings
    .filter((w) => w.level >= s.min_level && (!w.start || Date.parse(w.start) <= now) && (!w.end || now < Date.parse(w.end)))
    .sort((a, b) => b.level - a.level)
    .map((w) => ({
      id: idFor(w.id),
      source: 'met',
      level: LEVEL[w.level],
      severity: w.level >= 4 ? 'critical' : 'warning',
      display: 'banner',
      title: `${LEVEL_NAME[w.level]} farevarsel: ${w.event}`,
      message: [w.description.replace(/\.?$/, '.'), w.end ? `Gjelder til ${until.format(new Date(w.end))}.` : '']
        .filter((x) => x && x !== '.')
        .join(' '),
      starts_at: w.start,
      ends_at: w.end,
      active: 1,
      target_screen_id: null,
      target_tag: null
    }));
}
