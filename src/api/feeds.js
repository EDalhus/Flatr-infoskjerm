import { json, badRequest, notFound, handleOptions, toIntOrNull, safeJson, getTimezone, folderImages } from './_shared.js';
import { parseIcs, upcomingEvents } from '../lib/icsParse.js';
import { appData } from './apps.js';

// Data til widgetene vær, nyheter (RSS), kalender (iCal) og Flatr Apps.
//
//   GET /api/feeds?element=<id>          -> data for et vær-/rss-/kalender-element
//   GET /api/feeds?type=places&q=Ålesund -> stedssøk (Kartverket) for vær-widgeten
//
// Eksterne kilder hentes ut fra ELEMENTETS lagrede innstilling – aldri fra en
// adresse i forespørselen – og mellomlagres, så skjermene ikke belaster kildene.

const UA = 'Flatr-infoskjerm/1.0 (+https://flatr.no)';
export const WIDGET_KINDS = ['weather', 'rss', 'calendar', 'app'];
const TTL = { weather: 30 * 60_000, rss: 10 * 60_000, calendar: 10 * 60_000, places: 24 * 3600_000 };
const MAX_BYTES = 3 * 1024 * 1024;
const cache = new Map(); // key -> { at, data }

async function cached(key, ttl, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.data;
  try {
    const data = await fn();
    cache.set(key, { at: Date.now(), data });
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    return data;
  } catch (err) {
    if (hit) return hit.data; // vis siste kjente data hvis kilden er nede
    throw err;
  }
}

/** Avviser adresser som peker inn i private nett (bare på Node, der vi kan slå opp DNS). */
async function assertPublicUrl(raw) {
  let url;
  try {
    url = new URL(String(raw).replace(/^webcal:/i, 'https:'));
  } catch {
    throw new Error('Ugyldig adresse');
  }
  if (!/^https?:$/.test(url.protocol)) throw new Error('Bare http(s)-adresser');
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(url.hostname) || !url.hostname.includes('.')) {
    throw new Error('Adressen er ikke tillatt');
  }
  let lookup;
  try {
    ({ lookup } = await import('node:dns/promises'));
  } catch {
    return url; // Worker: ingen DNS-oppslag, men Workers når uansett ikke interne nett
  }
  const addrs = await lookup(url.hostname, { all: true });
  const privateIp = (ip) =>
    /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(ip) ||
    /^(::1|fc|fd|fe80)/i.test(ip);
  if (addrs.some((a) => privateIp(a.address))) throw new Error('Adressen er ikke tillatt');
  return url;
}

async function fetchText(raw) {
  const url = await assertPublicUrl(raw);
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: '*/*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(10_000)
  });
  if (!res.ok) throw new Error(`Kilden svarte ${res.status}`);
  const len = Number(res.headers.get('content-length'));
  if (len > MAX_BYTES) throw new Error('Kilden er for stor');
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error('Kilden er for stor');
  return text;
}

/**
 * JSON fra et eksternt API (egne Flatr Apps). Følger ikke omdirigeringer –
 * både for å holde SSRF-sperren og så nøkler i hodene ikke sendes videre.
 */
export async function fetchPublicJson(raw, headers = {}) {
  const url = await assertPublicUrl(raw);
  if (url.protocol !== 'https:') throw new Error('API-adressen må bruke https');
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json', ...headers },
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000)
  });
  if (res.status >= 300 && res.status < 400) throw new Error('API-et svarte med en omdirigering – bruk den endelige adressen');
  if (!res.ok) throw new Error(`API-et svarte ${res.status}`);
  const len = Number(res.headers.get('content-length'));
  if (len > MAX_BYTES) throw new Error('Svaret er for stort');
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error('Svaret er for stort');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('API-et svarte ikke med JSON');
  }
}

/* --------------------------------- vær ---------------------------------- */

async function weather(lat, lon) {
  // MET krever maks 4 desimaler og identifiserende User-Agent.
  const la = Number(lat).toFixed(3);
  const lo = Number(lon).toFixed(3);
  return cached(`w:${la},${lo}`, TTL.weather, async () => {
    const res = await fetch(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${la}&lon=${lo}`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(10_000)
    });
    if (!res.ok) throw new Error(`Værdata utilgjengelig (${res.status})`);
    const data = await res.json();
    const series = data?.properties?.timeseries ?? [];
    const pick = (t) => {
      const d = t.data;
      const next = d.next_1_hours ?? d.next_6_hours ?? d.next_12_hours;
      return {
        time: t.time,
        temp: d.instant?.details?.air_temperature ?? null,
        wind: d.instant?.details?.wind_speed ?? null,
        symbol: next?.summary?.symbol_code ?? null,
        precip: next?.details?.precipitation_amount ?? null
      };
    };
    // Dagsoversikt: min/maks og symbolet rundt midt på dagen.
    const days = new Map();
    for (const t of series) {
      const day = t.time.slice(0, 10);
      const temp = t.data.instant?.details?.air_temperature;
      const d = days.get(day) ?? { date: day, min: Infinity, max: -Infinity, symbol: null };
      if (temp != null) {
        d.min = Math.min(d.min, temp);
        d.max = Math.max(d.max, temp);
      }
      const hour = Number(t.time.slice(11, 13));
      const sym = t.data.next_6_hours?.summary?.symbol_code ?? t.data.next_1_hours?.summary?.symbol_code;
      if (sym && (!d.symbol || (hour >= 10 && hour <= 14))) d.symbol = sym;
      days.set(day, d);
    }
    return {
      now: series[0] ? pick(series[0]) : null,
      hours: series.slice(1, 13).map(pick),
      days: [...days.values()].filter((d) => Number.isFinite(d.min)).slice(0, 7),
      credit: 'Værdata fra MET Norway (yr.no)'
    };
  });
}

async function places(q) {
  return cached(`p:${q.toLowerCase()}`, TTL.places, async () => {
    const url = `https://ws.geonorge.no/stedsnavn/v1/navn?sok=${encodeURIComponent(q)}&treffPerSide=8&utkoordsys=4258&fuzzy=true`;
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error('Stedssøk utilgjengelig');
    const data = await res.json();
    return (data?.navn ?? []).map((n) => ({
      name: n['skrivemåte'],
      type: n.navneobjekttype,
      municipality: n.kommuner?.[0]?.kommunenavn ?? null,
      lat: n.representasjonspunkt?.nord,
      lon: n.representasjonspunkt?.['øst']
    }));
  });
}

// Navnetyper som passer for en kai – brukes hvis det finnes en innen søkeradiusen.
const QUAY_TYPES = /^(kai|ferjekai|ferjeleie|ferjested|hamn|havn|småbåthamn|brygge|molo|bukt|vik|våg)$/i;

/** Beste stedsnavn ved et punkt (til kallenavn på nye kaier): nærmeste kai/havn/brygge, ellers nærmeste navn som ikke er en adresse. */
async function nearestName(lat, lon) {
  const la = Number(lat).toFixed(5);
  const lo = Number(lon).toFixed(5);
  return cached(`n:${la},${lo}`, TTL.places, async () => {
    const url = `https://ws.geonorge.no/stedsnavn/v1/punkt?nord=${la}&ost=${lo}&koordsys=4258&radius=700&treffPerSide=500&utkoordsys=4258`;
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error('Stedsoppslag utilgjengelig');
    const data = await res.json();
    let quay = null;
    let other = null;
    for (const n of data?.navn ?? []) {
      const type = String(n.navneobjekttype || '').trim(); // Kartverket har iblant mellomrom på slutten
      const name = n.stedsnavn?.[0]?.['skrivemåte'];
      if (!name || type === 'Adressenavn') continue;
      const m = Number(n.meterFraPunkt) || 0;
      const hit = { m, name, type };
      if (QUAY_TYPES.test(type)) {
        if (!quay || m < quay.m) quay = hit;
      } else if (!other || m < other.m) {
        other = hit;
      }
    }
    const best = quay || other;
    return best ? { name: best.name, type: best.type } : { name: null };
  });
}

/* --------------------------------- RSS ---------------------------------- */

const decode = (s) =>
  String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

const tag = (xml, name) => (new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(xml) || [])[1];
const attr = (xml, name, a) => (new RegExp(`<${name}[^>]*\\s${a}="([^"]+)"`, 'i').exec(xml) || [])[1];

function parseFeed(xml) {
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blocks = xml.match(isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi) || [];
  return {
    title: decode(tag(xml.replace(/<(item|entry)[\s>][\s\S]*$/i, ''), 'title')),
    items: blocks.slice(0, 30).map((b) => ({
      title: decode(tag(b, 'title')),
      summary: decode(tag(b, 'description') || tag(b, 'summary') || '').slice(0, 280),
      date: decode(tag(b, 'pubDate') || tag(b, 'updated') || tag(b, 'published') || tag(b, 'dc:date')) || null,
      image: attr(b, 'media:content', 'url') || attr(b, 'media:thumbnail', 'url') || attr(b, 'enclosure', 'url') || null
    }))
  };
}

/* -------------------------------- endepunkt ------------------------------ */

// GET /api/feeds  (åpent – data som uansett vises på skjermene)
export async function onRequestGet({ request, env }) {
  const params = new URL(request.url).searchParams;

  if (params.get('type') === 'places') {
    const q = String(params.get('q') || '').trim().slice(0, 60);
    if (q.length < 2) return json([]);
    try {
      return json(await places(q));
    } catch (err) {
      return json({ error: err.message }, { status: 502 });
    }
  }

  // ?type=nearest&lat=&lon= – stedsnavnet nærmest et punkt (kallenavn på kaier)
  if (params.get('type') === 'nearest') {
    const lat = Number(params.get('lat'));
    const lon = Number(params.get('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return badRequest('lat og lon er påkrevd');
    try {
      return json(await nearestName(lat, lon));
    } catch (err) {
      return json({ error: err.message }, { status: 502 });
    }
  }

  const id = toIntOrNull(params.get('element'));
  if (!id) return badRequest('element er påkrevd');
  const el = await env.DB.prepare(
    `SELECT e.kind, e.config, e.w, e.h, d.background FROM deck_elements e JOIN deck_slides d ON d.id = e.slide_id WHERE e.id = ?`
  )
    .bind(id)
    .first();
  if (!el || ![...WIDGET_KINDS, 'carousel'].includes(el.kind)) return notFound('Elementet finnes ikke');
  const c = safeJson(el.config, {});

  // ?describe=1: selve elementet, til /widget/<id> (skjermbilde for Apple TV).
  if (params.get('describe')) {
    return json({ id, kind: el.kind, config: c, background: safeJson(el.background, null) });
  }

  try {
    if (el.kind === 'carousel') return json({ images: c.folder ? await folderImages(env, c.folder) : [] });
    if (el.kind === 'weather') {
      if (!Number.isFinite(Number(c.lat)) || !Number.isFinite(Number(c.lon))) return badRequest('Velg et sted');
      return json(await weather(c.lat, c.lon));
    }
    if (el.kind === 'rss') {
      if (!c.url) return badRequest('Mangler adresse');
      return json(await cached(`r:${c.url}`, TTL.rss, async () => parseFeed(await fetchText(c.url))));
    }
    if (el.kind === 'app') {
      if (!toIntOrNull(c.appId)) return badRequest('Velg en app');
      try {
        const data = await appData(env, toIntOrNull(c.appId));
        // Valgte grupper (f.eks. rederi) på elementet: bare de båtene. '' = uten gruppe.
        const groups = Array.isArray(c.groups) && c.groups.length ? new Set(c.groups.map(String)) : null;
        if (groups && Array.isArray(data.vessels)) return json({ ...data, vessels: data.vessels.filter((v) => groups.has(v.group || '')) });
        return json(data);
      } catch (err) {
        return json({ error: err.message || 'Kunne ikke hente data' }, { status: err.status || 502 });
      }
    }
    if (el.kind === 'calendar') {
      if (!c.url) return badRequest('Mangler kalenderadresse');
      const tz = await getTimezone(env);
      const events = await cached(`c:${c.url}`, TTL.calendar, async () => parseIcs(await fetchText(c.url)));
      return json({ events: upcomingEvents(events, { tz, days: Number(c.days) || 14, max: Number(c.max) || 8 }) });
    }
  } catch (err) {
    return json({ error: err.message || 'Kunne ikke hente data' }, { status: 502 });
  }
  return badRequest('Elementet har ingen datakilde');
}

export const onRequestOptions = handleOptions;
