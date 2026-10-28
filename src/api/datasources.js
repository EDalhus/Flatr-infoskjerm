// Datakilder for Flatr-appene i runde 4:
//   tides    – tidevann (Kartverket) og sjø (bølger, sjøtemperatur – MET Norway)
//   football – kamper og tabell fra API-Football (kundens egen nøkkel)
// Kalles fra appData i apps.js og mellomlagres der.

const UA = 'Flatr-infoskjerm/1.0 (+https://flatr.no)';

/* ------------------------------- tidevann ------------------------------- */

const pad = (n) => String(n).padStart(2, '0');
const isoMinute = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;

/** Høyvann/lavvann de neste ~2 døgnene. -> { station, events: [{ time, level, kind }] } */
async function tideTable(lat, lon) {
  const from = new Date(Date.now() - 12 * 3600_000);
  const to = new Date(Date.now() + 48 * 3600_000);
  const q = new URLSearchParams({
    tide_request: 'locationdata',
    lat: String(lat),
    lon: String(lon),
    datatype: 'TAB',
    refcode: 'CD',
    fromtime: isoMinute(from),
    totime: isoMinute(to),
    interval: '10',
    lang: 'nb',
    tzone: '0'
  });
  const res = await fetch(`https://vannstand.kartverket.no/tideapi.php?${q}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Kartverket svarte ${res.status}`);
  const xml = await res.text();
  if (/<error>/i.test(xml)) throw new Error('Kartverket har ikke tidevann for dette stedet');
  const station = /<location name="([^"]+)"/.exec(xml)?.[1] || null;
  const events = [...xml.matchAll(/<waterlevel value="([-\d.]+)" time="([^"]+)" flag="(high|low)"/g)].map((m) => ({
    level: Math.round(Number(m[1])),
    time: new Date(m[2]).toISOString(),
    kind: m[3]
  }));
  return { station, events };
}

/** Bølger, sjøtemperatur og strøm nå og de neste timene (MET oceanforecast). */
async function seaForecast(lat, lon) {
  const res = await fetch(`https://api.met.no/weatherapi/oceanforecast/2.0/complete?lat=${lat}&lon=${lon}`, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(15_000)
  });
  if (res.status === 422 || res.status === 404) return null; // ikke et punkt i sjøen
  if (!res.ok) throw new Error(`MET svarte ${res.status}`);
  const data = await res.json();
  const rows = (data.properties?.timeseries || []).slice(0, 25).map((t) => {
    const d = t.data?.instant?.details || {};
    return { time: t.time, wave: d.sea_surface_wave_height ?? null, waveFrom: d.sea_surface_wave_from_direction ?? null, temp: d.sea_water_temperature ?? null, current: d.sea_water_speed ?? null };
  });
  return { now: rows[0] || null, hours: rows };
}

/** Alle steder i appen. -> { places: { [id]: { name, tides, sea, error? } } } */
export async function tidesData(config) {
  const places = {};
  for (const p of (config.places || []).slice(0, 10)) {
    const [tides, sea] = await Promise.allSettled([tideTable(p.lat, p.lon), seaForecast(p.lat, p.lon)]);
    places[p.id] = {
      name: p.name,
      tides: tides.status === 'fulfilled' ? tides.value : null,
      sea: sea.status === 'fulfilled' ? sea.value : null,
      error: tides.status === 'rejected' && sea.status === 'rejected' ? tides.reason?.message : null
    };
  }
  return { places };
}

/* ------------------------------- fotball -------------------------------- */

const FOOTBALL = 'https://v3.football.api-sports.io';

async function football(key, path) {
  const res = await fetch(`${FOOTBALL}${path}`, { headers: { 'x-apisports-key': key, 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`API-Football svarte ${res.status}`);
  const data = await res.json();
  // API-Football svarer 200 med { errors: { token: '…' } } ved feil.
  const errors = data.errors && (Array.isArray(data.errors) ? data.errors : Object.values(data.errors));
  if (errors?.length) {
    const msg = String(errors[0]);
    if (/token|key/i.test(msg)) throw new Error('API-Football godtok ikke nøkkelen');
    if (/limit|request/i.test(msg)) throw new Error('Grensen for antall forespørsler hos API-Football er nådd i dag');
    throw new Error(`API-Football: ${msg}`);
  }
  return data.response || [];
}

export async function verifyFootballKey(key) {
  if (!/^[a-f0-9]{20,64}$/i.test(key)) throw new Error('Det ser ikke ut som en API-Football-nøkkel');
  await football(key, '/status');
}

export async function searchFootball(key, kind, q) {
  const query = encodeURIComponent(String(q || '').slice(0, 40));
  if (kind === 'team') {
    return (await football(key, `/teams?search=${query}`)).slice(0, 15).map((r) => ({ id: r.team.id, name: r.team.name, logo: r.team.logo, country: r.team.country }));
  }
  return (await football(key, `/leagues?search=${query}&current=true`)).slice(0, 15).map((r) => ({
    id: r.league.id,
    name: r.league.name,
    logo: r.league.logo,
    country: r.country?.name,
    season: r.seasons?.find((s) => s.current)?.year ?? r.seasons?.at(-1)?.year
  }));
}

const fixture = (r) => ({
  id: r.fixture.id,
  date: r.fixture.date,
  status: r.fixture.status?.short,
  elapsed: r.fixture.status?.elapsed ?? null,
  league: r.league?.name,
  home: { name: r.teams.home.name, logo: r.teams.home.logo },
  away: { name: r.teams.away.name, logo: r.teams.away.logo },
  goals: { home: r.goals.home, away: r.goals.away }
});
const LIVE = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE']);

/** Kamper for lagene og tabeller for ligaene. -> { teams: { [id]: { next, last } }, tables: { [id]: [...] }, live } */
export async function footballData(key, config) {
  if (!key) throw new Error('Legg inn API-Football-nøkkelen i appen');
  const teams = {};
  let live = false;
  for (const t of (config.teams || []).slice(0, 4)) {
    const [next, last] = await Promise.all([football(key, `/fixtures?team=${t.id}&next=5`), football(key, `/fixtures?team=${t.id}&last=5`)]);
    teams[t.id] = { name: t.name, logo: t.logo, next: next.map(fixture), last: last.map(fixture).reverse() };
    if ([...teams[t.id].next, ...teams[t.id].last].some((f) => LIVE.has(f.status))) live = true;
  }
  const tables = {};
  for (const l of (config.leagues || []).slice(0, 3)) {
    const res = await football(key, `/standings?league=${l.id}&season=${l.season}`);
    const rows = res[0]?.league?.standings?.[0] || [];
    tables[l.id] = {
      name: l.name,
      rows: rows.map((r) => ({ rank: r.rank, team: r.team.name, logo: r.team.logo, played: r.all?.played, gd: r.goalsDiff, points: r.points, form: r.form }))
    };
  }
  return { teams, tables, live };
}
