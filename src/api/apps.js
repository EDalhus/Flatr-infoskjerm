import { json, noContent, badRequest, notFound, handleOptions, readJson, requireAdmin, toIntOrNull, safeJson, getTimezone } from './_shared.js';
import { validMmsi } from '../lib/ais.js';
import { OFFICIAL_BY_KEY } from '../lib/appCatalog.js';
import { normBirthdate, upcomingBirthdays, todayIn } from '../lib/birthdays.js';
import { AGENTS } from './agents/index.js';
import { cleanCalls } from '../lib/portCalls.js';
import { verifyUnsplashKey, searchPhotos, importPhoto } from './photos.js';
import { tidesData, footballData, verifyFootballKey, searchFootball } from './datasources.js';
import { cleanMenu, weekdayIn } from '../lib/menu.js';

// Flatr Apps – aktiverte apper for kunden. En rad = én aktivert app fra
// markedsplassen: offisiell (kind = ais | weather | rss | calendar) eller egen
// (kind = 'custom', app_ref = custom_apps.id i platform.db, se server/appMarket.js).
// Innstillinger ligger i config, hemmeligheter kryptert i secret (JSON-objekt).
//
//   GET    /api/apps               -> aktiverte apper (uten hemmeligheter)
//   GET    /api/apps?id=1&live=1   -> appens data nå (forhåndsvisning i admin)
//   POST   /api/apps               { kind, app_ref? }            -> aktiver
//   PUT    /api/apps?id=1          { name?, config?, secrets? }  -> innstillinger
//   DELETE /api/apps?id=1                                        -> deaktiver
//
// Skjermene henter data via /api/feeds?element=<id> (åpent), som bruker appData().
// Egne apper slås opp via env.APP_CATALOG (satt av Node-serveren).

export const APP_KINDS = [...Object.keys(OFFICIAL_BY_KEY), 'custom'];
const DATA_TTL_MS = 60_000;
const UA = 'Flatr-infoskjerm/1.0 (+https://flatr.no)';

/* ----------------------------- hemmeligheter ---------------------------- */

// AES-GCM med nøkkel fra APPS_SECRET_KEY (miljøvariabel på serveren). Bare
// serveren kan lese hemmeligheten – den sendes aldri tilbake til nettleseren.
const secretKeySource = (env) => env.APPS_SECRET_KEY || globalThis.process?.env?.APPS_SECRET_KEY || '';
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function aesKey(env) {
  const src = secretKeySource(env);
  if (!src) throw new Error('APPS_SECRET_KEY mangler på serveren');
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(src));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(env, plain) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(env), new TextEncoder().encode(plain));
  return `v1:${b64(iv)}:${b64(ct)}`;
}

export async function decryptSecret(env, stored) {
  const [v, iv, ct] = String(stored || '').split(':');
  if (v !== 'v1' || !iv || !ct) return null;
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aesKey(env), unb64(ct));
  return new TextDecoder().decode(plain);
}

/** Alle hemmelighetene til en app som objekt ({ client_secret } for AIS, innstillingsnøkler for egne apper). */
async function readSecrets(env, row) {
  if (!row.secret) return {};
  const plain = await decryptSecret(env, row.secret);
  if (plain == null) return {};
  try {
    const obj = JSON.parse(plain);
    if (obj && typeof obj === 'object') return obj;
  } catch {
    /* eldre format: bare BarentsWatch-secret som tekst */
  }
  return { client_secret: plain };
}

const writeSecrets = async (env, obj) => (Object.keys(obj).length ? encryptSecret(env, JSON.stringify(obj)) : null);

/* -------------------------------- config -------------------------------- */

const str = (v, max = 100) => String(v ?? '').trim().slice(0, max);
const coord = (v, lim) => (Number.isFinite(Number(v)) && Math.abs(Number(v)) <= lim ? Number(v) : null);
const color = (v) => (/^#[0-9a-f]{6}$/i.test(String(v)) ? String(v) : '#3e63dd');

/** Renser AIS-config fra admin: bare kjente felt, gyldige MMSI, maks 200 båter. */
function cleanAisConfig(c) {
  const seen = new Set();
  const fleet = [];
  for (const b of Array.isArray(c?.fleet) ? c.fleet : []) {
    const mmsi = str(b?.mmsi, 9);
    if (!validMmsi(mmsi) || seen.has(mmsi)) continue;
    seen.add(mmsi);
    const group = str(b?.group, 40);
    fleet.push({ mmsi, name: str(b?.name) || mmsi, color: color(b?.color), ...(group ? { group } : {}) });
    if (fleet.length >= 200) break;
  }
  const quays = [];
  for (const q of Array.isArray(c?.quays) ? c.quays : []) {
    const lat = coord(q?.lat, 90);
    const lon = coord(q?.lon, 180);
    if (lat == null || lon == null) continue;
    quays.push({ id: str(q?.id, 40) || crypto.randomUUID().slice(0, 8), name: str(q?.name) || 'Kai', lat, lon });
    if (quays.length >= 50) break;
  }
  return { client_id: str(c?.client_id, 200), fleet, quays, calls: cleanCalls(c?.calls), calls_notify: c?.calls_notify === true };
}

const customDef = (env, row) => (row.kind === 'custom' && env.APP_CATALOG ? env.APP_CATALOG.customAppFor(row.app_ref) : null);

/** Bursdager: navn + fødselsdato (maks 1000 personer), om alder vises. */
function cleanBirthdaysConfig(c) {
  const people = [];
  for (const p of Array.isArray(c?.people) ? c.people : []) {
    const name = str(p?.name, 80);
    const date = normBirthdate(p?.date);
    if (!name || !date) continue;
    people.push({ id: str(p?.id, 40) || crypto.randomUUID().slice(0, 8), name, date, hideAge: p?.hideAge === true });
    if (people.length >= 1000) break;
  }
  return { people, showAge: c?.showAge !== false };
}

/** Tidevann: steder med navn og koordinater (maks 10). */
function cleanTidesConfig(c) {
  const places = (Array.isArray(c?.places) ? c.places : [])
    .map((p) => ({ id: str(p?.id, 40) || crypto.randomUUID().slice(0, 8), name: str(p?.name, 80) || 'Sted', lat: coord(p?.lat, 90), lon: coord(p?.lon, 180) }))
    .filter((p) => p.lat != null && p.lon != null)
    .slice(0, 10);
  return { places };
}

/** Fotball: lag og ligaer (fra søket i appen). */
function cleanFootballConfig(c) {
  const teams = (Array.isArray(c?.teams) ? c.teams : [])
    .filter((t) => Number.isInteger(Number(t?.id)))
    .map((t) => ({ id: Number(t.id), name: str(t.name, 80), logo: /^https:\/\//.test(t.logo || '') ? str(t.logo, 300) : null }))
    .slice(0, 4);
  const leagues = (Array.isArray(c?.leagues) ? c.leagues : [])
    .filter((l) => Number.isInteger(Number(l?.id)) && Number.isInteger(Number(l?.season)))
    .map((l) => ({ id: Number(l.id), season: Number(l.season), name: str(l.name, 80), logo: /^https:\/\//.test(l.logo || '') ? str(l.logo, 300) : null }))
    .slice(0, 3);
  return { teams, leagues, key_hint: str(c?.key_hint, 10) || undefined };
}

/** Dagens meny: hele uka og hvilken dag det er i dag (kundens tidssone). */
async function menuData(env, row) {
  const c = cleanMenu(safeJson(row.config, {}));
  return { week: c.week, note: c.note, today: weekdayIn(await getTimezone(env)), fetched_at: new Date().toISOString() };
}

/** Bare det skjermene trenger: neste bursdager uten fødselsår. */
async function birthdaysData(env, row) {
  const c = safeJson(row.config, {});
  const tz = await getTimezone(env);
  const items = upcomingBirthdays(c.people, todayIn(tz), { max: 20, showAge: c.showAge !== false });
  return { items: items.map(({ id, ...rest }) => rest), fetched_at: new Date().toISOString() };
}

function publicApp(env, row) {
  const config = safeJson(row.config, {});
  const def = customDef(env, row);
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    app_ref: row.app_ref ?? null,
    config,
    has_secret: !!row.secret,
    // Egne apper: definisjonen (innstillingsfelt, visning) så admin kan vise skjemaet.
    definition: def ? { name: def.name, icon: def.icon, color: def.color, settings: def.settings, template: def.display?.template } : null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

/** Renser innstillingene til en egen app etter manifestets felt (hemmeligheter håndteres for seg). */
function cleanCustomSettings(def, input, prev = {}) {
  const out = {};
  for (const f of def?.settings || []) {
    if (f.type === 'secret') continue;
    const v = input?.[f.key] !== undefined ? input[f.key] : prev[f.key];
    if (v == null || v === '') continue;
    out[f.key] = f.type === 'number' && Number.isFinite(Number(v)) ? Number(v) : String(v).slice(0, 500);
  }
  return out;
}

/* ------------------------------ BarentsWatch ----------------------------- */

const tokens = new Map(); // client_id -> { token, exp }
const dataCache = new Map(); // `${tenant}:${id}:${updated_at}` -> { at, data }

async function barentsWatchToken(clientId, clientSecret) {
  const hit = tokens.get(clientId);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;
  const res = await fetch('https://id.barentswatch.no/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, scope: 'ais', grant_type: 'client_credentials' }),
    signal: AbortSignal.timeout(10_000)
  });
  if (!res.ok) {
    tokens.delete(clientId);
    throw new Error(
      res.status === 400 || res.status === 401
        ? 'BarentsWatch godtok ikke client id/secret (sjekk at klienten er av typen AIS)'
        : `BarentsWatch-innlogging svarte ${res.status}`
    );
  }
  const body = await res.json();
  tokens.set(clientId, { token: body.access_token, exp: Date.now() + (Number(body.expires_in) || 3600) * 1000 });
  return body.access_token;
}

async function fetchAis(env, row) {
  const c = safeJson(row.config, {});
  const fleet = Array.isArray(c.fleet) ? c.fleet : [];
  const base = { fleet, quays: Array.isArray(c.quays) ? c.quays : [], calls: Array.isArray(c.calls) ? c.calls : [], fetched_at: new Date().toISOString() };
  if (!fleet.length) return { ...base, vessels: [] };
  const { client_secret: secret } = await readSecrets(env, row);
  // Uten BarentsWatch: flåte, kaier og anløp likevel (anløpsplanen virker uten live status).
  if (!c.client_id || !secret) {
    return { ...base, vessels: fleet.map((b) => ({ mmsi: b.mmsi, name: b.name, color: b.color, group: b.group || null, missing: true })), ais_error: 'Legg inn client id og secret fra BarentsWatch' };
  }
  const token = await barentsWatchToken(c.client_id, secret);
  const res = await fetch('https://live.ais.barentswatch.no/live/v1/latest/combined', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ mmsi: fleet.map((b) => Number(b.mmsi)), modelType: 'Full', modelFormat: 'Json' }),
    signal: AbortSignal.timeout(15_000)
  });
  if (res.status === 401) tokens.delete(c.client_id);
  if (!res.ok) throw new Error(`BarentsWatch AIS svarte ${res.status}`);
  const rows = await res.json();

  const byMmsi = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    const prev = byMmsi.get(String(r.mmsi));
    if (!prev || Date.parse(r.msgtime) > Date.parse(prev.msgtime)) byMmsi.set(String(r.mmsi), r);
  }
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const vessels = fleet.map((b) => {
    const r = byMmsi.get(String(b.mmsi));
    if (!r) return { mmsi: b.mmsi, name: b.name, color: b.color, group: b.group || null, missing: true };
    return {
      mmsi: b.mmsi,
      name: b.name,
      color: b.color,
      group: b.group || null,
      ais_name: r.name || null,
      lat: num(r.latitude),
      lon: num(r.longitude),
      sog: num(r.speedOverGround),
      cog: num(r.courseOverGround),
      heading: r.trueHeading != null && r.trueHeading !== 511 ? num(r.trueHeading) : null,
      navStatus: num(r.navigationalStatus),
      destination: r.destination ? String(r.destination).trim() : null,
      ais_eta: r.eta || null,
      length: num(r.shipLength),
      shipType: num(r.shipType),
      msgtime: r.msgtime || null
    };
  });
  return { ...base, vessels };
}

/* Søk etter båter på navn (eller MMSI) i BarentsWatch, så man slipper å
   finne MMSI-nummeret selv. Hele lista over skip med AIS-signal hentes og
   mellomlagres i fem minutter per API-klient. */
const shipListCache = new Map(); // client_id -> { at, ships }
const SHIP_LIST_TTL_MS = 5 * 60_000;

async function shipList(env, row) {
  const c = safeJson(row.config, {});
  const { client_secret: secret } = await readSecrets(env, row);
  if (!c.client_id || !secret) throw new Error('Koble til BarentsWatch først');
  const hit = shipListCache.get(c.client_id);
  if (hit && Date.now() - hit.at < SHIP_LIST_TTL_MS) return hit.ships;
  const token = await barentsWatchToken(c.client_id, secret);
  const res = await fetch('https://live.ais.barentswatch.no/live/v1/latest/combined?modelType=Full&modelFormat=Json', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': UA },
    signal: AbortSignal.timeout(30_000)
  });
  if (res.status === 401) tokens.delete(c.client_id);
  if (!res.ok) throw new Error(`BarentsWatch AIS svarte ${res.status}`);
  const rows = await res.json();
  const byMmsi = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r?.mmsi || !r.name) continue;
    const prev = byMmsi.get(r.mmsi);
    if (!prev || Date.parse(r.msgtime) > Date.parse(prev.msgtime)) byMmsi.set(r.mmsi, r);
  }
  const ships = [...byMmsi.values()].map((r) => ({
    mmsi: String(r.mmsi),
    name: String(r.name).trim(),
    callSign: r.callSign ? String(r.callSign).trim() : null,
    shipType: Number.isFinite(Number(r.shipType)) ? Number(r.shipType) : null,
    length: Number.isFinite(Number(r.shipLength)) ? Number(r.shipLength) : null,
    destination: r.destination ? String(r.destination).trim() : null,
    msgtime: r.msgtime || null
  }));
  shipListCache.set(c.client_id, { at: Date.now(), ships });
  return ships;
}

export async function searchVessels(env, row, q) {
  const query = String(q || '').trim().toLowerCase();
  if (query.length < 2) return [];
  const ships = await shipList(env, row);
  const digits = /^\d+$/.test(query);
  const hits = ships.filter((s) => (digits ? s.mmsi.startsWith(query) : s.name.toLowerCase().includes(query) || s.callSign?.toLowerCase() === query));
  // Navn som begynner med søket først, så alfabetisk.
  const starts = (s) => (s.name.toLowerCase().startsWith(query) ? 0 : 1);
  return hits.sort((a, b) => starts(a) - starts(b) || a.name.localeCompare(b.name, 'nb')).slice(0, 25);
}

async function fetchCustom(env, row) {
  const def = customDef(env, row);
  if (!def) throw Object.assign(new Error('Appen er ikke lenger tilgjengelig'), { status: 404 });
  const values = { ...safeJson(row.config, {}).settings, ...(await readSecrets(env, row)) };
  const missing = def.settings.filter((f) => f.required && (values[f.key] == null || values[f.key] === '')).map((f) => f.label);
  if (missing.length) throw new Error(`Fyll inn ${missing.join(', ')} i innstillingene til appen`);
  const { items } = await env.APP_CATALOG.runCustomApp(def, values);
  return {
    template: def.display.template,
    display: { heading: def.display.heading, unit: def.display.fields.unit, columns: def.display.columns.map((c) => c.label) },
    items,
    fetched_at: new Date().toISOString()
  };
}

/** Appens data nå, mellomlagret (AIS: DATA_TTL_MS, egne apper: appens oppdateringsintervall). Siste kjente data brukes hvis kilden feiler. */
export async function appData(env, appId) {
  const row = await env.DB.prepare('SELECT * FROM apps WHERE id = ?').bind(appId).first();
  if (!row) throw Object.assign(new Error('Appen finnes ikke'), { status: 404 });
  const key = `${env.TENANT?.slug ?? ''}:${row.id}:${row.updated_at}`;
  const hit = dataCache.get(key);
  // Tidevann endrer seg sakte; fotball har få forespørsler per dag (oftere under kamp).
  const ttl =
    row.kind === 'custom'
      ? (customDef(env, row)?.source?.refreshMinutes ?? 5) * 60_000
      : row.kind === 'tides'
        ? 30 * 60_000
        : row.kind === 'football'
          ? (hit?.data?.live ? 10 : 120) * 60_000
          : DATA_TTL_MS;
  if (hit && Date.now() - hit.at < ttl) return hit.data;
  try {
    const data =
      row.kind === 'ais'
        ? await fetchAis(env, row)
        : row.kind === 'custom'
          ? await fetchCustom(env, row)
          : row.kind === 'birthdays'
            ? await birthdaysData(env, row)
            : row.kind === 'menu'
              ? await menuData(env, row)
              : row.kind === 'tides'
                ? await tidesData(safeJson(row.config, {}))
                : row.kind === 'football'
                  ? await footballData((await readSecrets(env, row)).api_key, safeJson(row.config, {}))
                  : {};
    const out = { app: { id: row.id, name: row.name, kind: row.kind }, ...data };
    dataCache.set(key, { at: Date.now(), data: out });
    if (dataCache.size > 300) dataCache.delete(dataCache.keys().next().value);
    return out;
  } catch (err) {
    if (hit) return { ...hit.data, stale: true };
    throw err;
  }
}

/* -------------------------------- endepunkt ------------------------------ */

export async function onRequestGet(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const { request, env } = context;
  const params = new URL(request.url).searchParams;
  const id = toIntOrNull(params.get('id'));

  if (!id) {
    const { results } = await env.DB.prepare('SELECT * FROM apps ORDER BY name COLLATE NOCASE, id').all();
    return json((results ?? []).map((r) => publicApp(env, r)));
  }
  // ?football=team|league&q=: søk i API-Football (fotball-appen).
  if (params.has('football')) {
    const row = await env.DB.prepare('SELECT * FROM apps WHERE id = ?').bind(id).first();
    if (!row || row.kind !== 'football') return notFound('Appen finnes ikke');
    const { api_key: key } = await readSecrets(env, row);
    if (!key) return json({ error: 'Legg inn API-Football-nøkkelen først' }, { status: 400 });
    try {
      return json(await searchFootball(key, params.get('football') === 'league' ? 'league' : 'team', params.get('q')));
    } catch (err) {
      return json({ error: err.message }, { status: 502 });
    }
  }
  // ?photos=: søk i Unsplash (bildebank-appen).
  if (params.has('photos')) {
    const row = await env.DB.prepare('SELECT * FROM apps WHERE id = ?').bind(id).first();
    if (!row || row.kind !== 'unsplash') return notFound('Appen finnes ikke');
    const { access_key: key } = await readSecrets(env, row);
    if (!key) return json({ error: 'Legg inn en Unsplash Access Key i appen først' }, { status: 400 });
    try {
      return json(await searchPhotos(key, params.get('photos'), { orientation: params.get('orientation'), page: Number(params.get('page')) || 1 }));
    } catch (err) {
      return json({ error: err.message }, { status: 502 });
    }
  }
  // ?search=: båter med AIS-signal som matcher navn/MMSI (NAIS).
  if (params.has('search')) {
    const row = await env.DB.prepare('SELECT * FROM apps WHERE id = ?').bind(id).first();
    if (!row || row.kind !== 'ais') return notFound('Appen finnes ikke');
    try {
      return json(await searchVessels(env, row, params.get('search')));
    } catch (err) {
      return json({ error: err.message || 'Søket feilet' }, { status: 502 });
    }
  }
  if (params.get('live')) {
    try {
      return json(await appData(env, id));
    } catch (err) {
      return json({ error: err.message || 'Kunne ikke hente data' }, { status: err.status || 502 });
    }
  }
  const row = await env.DB.prepare('SELECT * FROM apps WHERE id = ?').bind(id).first();
  return row ? json(publicApp(env, row)) : notFound('Appen finnes ikke');
}

// Aktiver en app fra markedsplassen (én gang per app).
// ?id=&import_photo=<unsplash-id>: hent et Unsplash-bilde inn i biblioteket.
export async function onRequestPost(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const { env } = context;
  const params = new URL(context.request.url).searchParams;
  if (params.get('import_photo')) {
    const row = await env.DB.prepare(`SELECT * FROM apps WHERE kind = 'unsplash' LIMIT 1`).first();
    const key = row && (await readSecrets(env, row)).access_key;
    if (!key) return json({ error: 'Unsplash bildebank er ikke satt opp' }, { status: 400 });
    try {
      return json(await importPhoto(env, key, params.get('import_photo')), { status: 201 });
    } catch (err) {
      return json({ error: err.message }, { status: 502 });
    }
  }
  const b = (await readJson(context.request)) || {};
  const kind = APP_KINDS.includes(b.kind) ? b.kind : null;
  if (!kind) return badRequest('Ukjent app');

  let name;
  let ref = null;
  let config = {};
  if (kind === 'custom') {
    ref = toIntOrNull(b.app_ref);
    if (!ref || !env.APP_CATALOG?.canInstallCustom(ref)) return notFound('Appen finnes ikke');
    name = env.APP_CATALOG.customAppFor(ref).name;
    config = { settings: {} };
  } else {
    name = OFFICIAL_BY_KEY[kind].name;
    if (kind === 'ais') config = cleanAisConfig({});
    if (kind === 'birthdays') config = cleanBirthdaysConfig({});
    if (AGENTS[kind]) config = { effort: 'medium' };
    if (kind === 'unsplash') config = {};
    if (kind === 'menu') config = cleanMenu({});
    if (kind === 'tides') config = cleanTidesConfig({});
    if (kind === 'football') config = cleanFootballConfig({});
  }

  const exists = await env.DB.prepare('SELECT id FROM apps WHERE kind = ? AND COALESCE(app_ref, 0) = ?').bind(kind, ref ?? 0).first();
  if (exists) return json({ error: 'Appen er allerede aktivert' }, { status: 409 });

  const row = await env.DB.prepare('INSERT INTO apps (name, kind, app_ref, config) VALUES (?, ?, ?, ?) RETURNING *')
    .bind(name, kind, ref, JSON.stringify(config))
    .first();
  if (ref) env.APP_CATALOG.countInstall(ref, 1);
  return json(publicApp(env, row), { status: 201 });
}

export async function onRequestPut(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const { request, env } = context;
  const id = toIntOrNull(new URL(request.url).searchParams.get('id'));
  const row = id && (await env.DB.prepare('SELECT * FROM apps WHERE id = ?').bind(id).first());
  if (!row) return notFound('Appen finnes ikke');
  const b = (await readJson(request)) || {};
  const prevConfig = safeJson(row.config, {});

  const name = b.name !== undefined ? str(b.name) || row.name : row.name;
  let config = prevConfig;
  let secrets = null; // null = uendret

  try {
    if (row.kind === 'birthdays') {
      if (b.config !== undefined) config = cleanBirthdaysConfig(b.config);
    } else if (row.kind === 'ais') {
      if (b.config !== undefined) config = cleanAisConfig({ ...prevConfig, ...b.config });
      if (typeof b.client_secret === 'string' && b.client_secret.trim()) {
        secrets = { client_secret: b.client_secret.trim().slice(0, 500) };
      } else if (b.client_secret === null) {
        secrets = {};
      }
    } else if (AGENTS[row.kind]) {
      // AI-assistent: innsats og API-nøkkel (sjekkes mot leverandøren før lagring).
      config = { ...prevConfig };
      if (['low', 'medium', 'high'].includes(b.config?.effort)) config.effort = b.config.effort;
      if (typeof b.api_key === 'string' && b.api_key.trim()) {
        const apiKey = b.api_key.trim().slice(0, 500);
        await AGENTS[row.kind].verifyKey(apiKey);
        secrets = { api_key: apiKey };
        config.key_hint = `…${apiKey.slice(-4)}`;
      } else if (b.api_key === null) {
        secrets = {};
        delete config.key_hint;
      }
    } else if (row.kind === 'menu') {
      if (b.config !== undefined) config = cleanMenu({ ...prevConfig, ...b.config });
    } else if (row.kind === 'tides') {
      if (b.config !== undefined) config = cleanTidesConfig({ ...prevConfig, ...b.config });
    } else if (row.kind === 'football') {
      if (b.config !== undefined) config = cleanFootballConfig({ ...prevConfig, ...b.config });
      if (typeof b.api_key === 'string' && b.api_key.trim()) {
        const key = b.api_key.trim().slice(0, 100);
        await verifyFootballKey(key);
        secrets = { api_key: key };
        config.key_hint = `…${key.slice(-4)}`;
      } else if (b.api_key === null) {
        secrets = {};
        delete config.key_hint;
      }
    } else if (row.kind === 'unsplash') {
      config = { ...prevConfig };
      if (typeof b.api_key === 'string' && b.api_key.trim()) {
        const key = b.api_key.trim().slice(0, 200);
        await verifyUnsplashKey(key);
        secrets = { access_key: key };
        config.key_hint = `…${key.slice(-4)}`;
      } else if (b.api_key === null) {
        secrets = {};
        delete config.key_hint;
      }
    } else if (row.kind === 'custom') {
      const def = customDef(env, row);
      if (!def) return notFound('Appen er ikke lenger tilgjengelig');
      if (b.config?.settings !== undefined) config = { ...prevConfig, settings: cleanCustomSettings(def, b.config.settings, prevConfig.settings) };
      if (b.secrets && typeof b.secrets === 'object') {
        // Tom streng = behold, null = fjern. Bare felt manifestet kjenner som hemmelige.
        const cur = await readSecrets(env, row);
        for (const f of def.settings.filter((x) => x.type === 'secret')) {
          const v = b.secrets[f.key];
          if (v === null) delete cur[f.key];
          else if (typeof v === 'string' && v.trim()) cur[f.key] = v.trim().slice(0, 1000);
        }
        secrets = cur;
      }
      // Hvilke hemmeligheter som er lagt inn (ikke verdiene) – til skjemaet i admin.
      const keys = secrets ? Object.keys(secrets) : prevConfig.secret_keys || [];
      config = { ...config, secret_keys: keys };
    }
  } catch (err) {
    return json({ error: err.message }, { status: 400 });
  }

  let secret = row.secret;
  if (secrets) {
    try {
      secret = await writeSecrets(env, secrets);
    } catch (err) {
      return json({ error: err.message }, { status: 500 });
    }
  }

  const updated = await env.DB.prepare(
    `UPDATE apps SET name = ?, config = ?, secret = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ? RETURNING *`
  )
    .bind(name, JSON.stringify(config), secret, id)
    .first();
  return json(publicApp(env, updated));
}

// Deaktiver. Elementer som bruker appen viser en melding i stedet for data.
export async function onRequestDelete(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const { env } = context;
  const id = toIntOrNull(new URL(context.request.url).searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');
  const row = await env.DB.prepare('SELECT kind, app_ref FROM apps WHERE id = ?').bind(id).first();
  await env.DB.prepare('DELETE FROM apps WHERE id = ?').bind(id).run();
  if (row?.kind === 'custom' && row.app_ref) env.APP_CATALOG?.countInstall(row.app_ref, -1);
  return noContent();
}

export const onRequestOptions = handleOptions;
