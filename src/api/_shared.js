// Delte hjelpere for alle API-Functions. Filnavn med _ rutes ikke av Pages.

import { isOpen } from '../lib/hours.js';
import { upcomingBirthdays, todayIn } from '../lib/birthdays.js';
import { getUser } from './_access.js';
import { activeSlot, DEFAULT_TZ } from '../lib/timeslots.js';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders,
      ...(init.headers ?? {})
    }
  });
}

export const noContent = () => new Response(null, { status: 204, headers: corsHeaders });
export const badRequest = (message) => json({ error: message }, { status: 400 });
export const notFound = (message = 'Not found') => json({ error: message }, { status: 404 });
export const handleOptions = () => new Response(null, { status: 204, headers: corsHeaders });

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// Autorisasjon for skriveoperasjoner. Returnerer null hvis OK, ellers en 401.
//   0. Node-serveren: sesjonsbruker (env.SESSION_USER)
//   1. Cloudflare Access-bruker på whitelistet domene  -> full tilgang
//   2. Ellers: Authorization: Bearer <ADMIN_TOKEN>      (skript / uten Access)
//   3. Er ingen av delene konfigurert                   -> åpent (lokalt)
export async function requireAdmin({ request, env }) {
  // Node-serveren: innlogget medlem av kunden (e-postinnlogging).
  if ('SESSION_USER' in env) {
    return env.SESSION_USER ? null : json({ error: 'Ikke innlogget' }, { status: 401 });
  }
  if (env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD) {
    const user = await getUser(request, env);
    return user ? null : json({ error: 'Ikke innlogget' }, { status: 401 });
  }
  const configured = env.ADMIN_TOKEN;
  if (!configured) return null;
  const header = request.headers.get('Authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (token !== configured) return json({ error: 'Unauthorized' }, { status: 401 });
  return null;
}

export function toIntOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
}

export function safeJson(value, fallback = {}) {
  if (value && typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value ?? '');
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/** Utleder status fra klokka når auto_status er på. 'cancelled' vinner alltid. */
export function effectiveStatus(item, now = Date.now()) {
  if (item.status === 'cancelled') return 'cancelled';
  if (!item.auto_status) return item.status || 'scheduled';
  const start = Date.parse(item.start_time);
  if (Number.isNaN(start)) return item.status || 'scheduled';
  const end = item.end_time ? Date.parse(item.end_time) : start + 3600_000;
  if (now < start) return 'scheduled';
  if (now < end) return 'live';
  return 'done';
}

/** Legger en slettet rad i papirkurven. `payload` må være nok til å gjenopprette. */
export async function moveToTrash(env, kind, label, payload) {
  try {
    await env.DB.prepare('INSERT INTO trash (kind, label, payload) VALUES (?, ?, ?)')
      .bind(kind, String(label || kind).slice(0, 200), JSON.stringify(payload))
      .run();
  } catch {
    /* papirkurv er best-effort */
  }
}

const DAYPART_FIELDS = [
  'active_from',
  'active_to',
  'active_days',
  'active_from_date',
  'active_to_date'
];
const pickDaypart = (row) => {
  const out = {};
  for (const k of DAYPART_FIELDS) out[k] = row[k] ?? null;
  return out;
};

/**
 * Leser ?screen= / ?playlist= for state/stream. Forhåndsvisning av en
 * spilleliste (uten kanal) krever innlogging på Node-serveren, siden
 * spillelister kan være utkast. Returnerer { screenId, playlistId } eller en 401.
 */
/* Kortlivet, signert tilgang til forhåndsvisningen av én presentasjon
   (?rt=), så AI-assistentens skjermbilder virker uten innloggingscookies. */
const previewSecret = (env) => env.APPS_SECRET_KEY || globalThis.process?.env?.APPS_SECRET_KEY || globalThis.process?.env?.BETTER_AUTH_SECRET || '';

async function previewSig(env, playlistId, exp) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(`preview:${previewSecret(env)}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${env.TENANT?.slug || ''}:${playlistId}:${exp}`));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function previewToken(env, playlistId, ttlSeconds = 600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `${exp}.${await previewSig(env, playlistId, exp)}`;
}

async function previewTokenOk(env, playlistId, token) {
  const [exp, sig] = String(token || '').split('.');
  if (!previewSecret(env) || !sig || !(Number(exp) > Date.now() / 1000)) return false;
  return sig === (await previewSig(env, playlistId, Number(exp)));
}

export async function viewerTarget(request, env) {
  const params = new URL(request.url).searchParams;
  const playlistId = toIntOrNull(params.get('playlist'));
  if (playlistId && 'SESSION_USER' in env && !env.SESSION_USER && !(await previewTokenOk(env, playlistId, params.get('rt')))) {
    return { denied: json({ error: 'Ikke innlogget' }, { status: 401 }) };
  }
  return { screenId: playlistId ? null : params.get('screen'), playlistId };
}

const fmtGb = (b) => `${(b / 1024 ** 3).toFixed(1).replace('.', ',')} GB`;

/** Bruk mot kvotene (env.LIMITS settes av Node-serveren; mangler den, ingen grenser). */
export async function usage(env) {
  const [storage, devices, screens] = await Promise.all([
    env.DB.prepare('SELECT COALESCE(SUM(size), 0) AS b FROM media').first('b'),
    env.DB.prepare(`SELECT COUNT(*) AS c FROM pairings WHERE status = 'paired'`).first('c'),
    env.DB.prepare('SELECT COUNT(*) AS c FROM screens').first('c')
  ]);
  return { storageBytes: Number(storage) || 0, devices: Number(devices) || 0, screens: Number(screens) || 0 };
}

/**
 * Sjekker en kvote før noe nytt legges til. Returnerer en 403/413-respons
 * hvis grensen er nådd, ellers null.
 *   kind: 'storage' (extraBytes = størrelsen på det som lastes opp) | 'devices' | 'screens'
 */
export async function checkLimit(env, kind, extraBytes = 0) {
  if (!env.LIMITS) return null;
  const u = await usage(env);
  const L = env.LIMITS;
  if (kind === 'storage' && u.storageBytes + extraBytes > L.storageBytes) {
    return json(
      {
        error:
          u.storageBytes >= L.storageBytes * 0.95
            ? `Lagringsplassen er full (${fmtGb(u.storageBytes)} av ${fmtGb(L.storageBytes)} i planen din). Slett filer i biblioteket, eller kontakt oss for mer plass.`
            : `Filen er for stor for plassen som er igjen (${fmtGb(L.storageBytes - u.storageBytes)} ledig av ${fmtGb(L.storageBytes)} i planen din).`
      },
      { status: 413 }
    );
  }
  if (kind === 'devices' && u.devices >= L.devices) {
    return json({ error: `Planen din har plass til ${L.screens === 1 ? '1 skjerm' : `${L.screens} skjermer`}. Trenger du flere? Be om det under Skjermer.` }, { status: 403 });
  }
  if (kind === 'screens' && u.screens >= L.screens) {
    return json({ error: `Planen din har plass til ${L.screens === 1 ? '1 skjerm' : `${L.screens} skjermer`}. Trenger du flere? Be om det under Skjermer.` }, { status: 403 });
  }
  if (kind === 'video' && !L.video) {
    return json({ error: 'Video er med i Pro. Gratisplanen har plass til bilder.' }, { status: 403 });
  }
  return null;
}

/** Kontoens tidssone (tidsplanen regner i lokal tid). */
export async function getTimezone(env) {
  try {
    const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'timezone'`).first();
    return row?.value || DEFAULT_TZ;
  } catch {
    return DEFAULT_TZ; // tabellen finnes ikke (Worker uten migreringer)
  }
}

/**
 * Hva kanalen skal vise nå: tidsplanens regel om noen gjelder, ellers
 * kanalens standard-spilleliste. -> { playlistId, off, slot }
 */
export async function resolveScreenContent(env, screen, when = new Date()) {
  let slots = [];
  try {
    ({ results: slots } = await env.DB.prepare('SELECT * FROM timeslots WHERE screen_id = ? AND enabled = 1')
      .bind(screen.id)
      .all());
  } catch {
    slots = []; // ingen tidsplan-tabell (Worker)
  }
  const tz = await getTimezone(env);
  const slot = slots?.length ? activeSlot(slots, when, tz) : null;
  if (!slot) {
    // Utenfor åpningstid er skjermen av – med mindre tidsplanen sier noe annet.
    // Presentasjonen sendes likevel med, så en TV uten nett kan slå seg på selv
    // når åpningstiden starter.
    const hours = safeJson(screen.hours, null);
    if (hours?.enabled && !isOpen(hours, when, tz)) return { playlistId: screen.playlist_id ?? null, off: true, slot: null, closed: true };
    return { playlistId: screen.playlist_id ?? null, off: false, slot: null };
  }
  if (slot.kind === 'off') return { playlistId: null, off: true, slot };
  return { playlistId: slot.playlist_id, off: false, slot };
}

/** Oppdaterer last_seen for en skjerm (online-status i admin). */
export async function touchScreen(env, screenId) {
  const id = toIntOrNull(screenId);
  if (!id) return;
  try {
    await env.DB.prepare('UPDATE screens SET last_seen = ? WHERE id = ?')
      .bind(new Date().toISOString(), id)
      .run();
  } catch {
    /* ikke kritisk */
  }
}

/**
 * Bygger den komplette tilstanden en Viewer trenger for én skjerm:
 * skjerm-config, slides for den skjermen, kategorier, hele programmet
 * (med utledet status), sponsorer og aktive alerts.
 * Gjenbrukes av /api/state og /api/stream.
 */
/** Krever kontoen godkjenning før publisering? */
export async function approvalRequired(env) {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'require_approval'`).first().catch(() => null);
  return row?.value === '1';
}

/** Siste publiserte versjon av en presentasjon (når godkjenning er på), ellers null. */
async function publishedDeck(env, playlistId) {
  if (!(await approvalRequired(env))) return null;
  const row = await env.DB.prepare(
    'SELECT v.data FROM playlists p JOIN playlist_versions v ON v.id = p.published_version_id WHERE p.id = ?'
  )
    .bind(playlistId)
    .first()
    .catch(() => null);
  return row ? safeJson(row.data, null) : null;
}

export async function buildState(env, screenId, { playlistId: previewPlaylistId } = {}) {
  const id = toIntOrNull(screenId);
  const now = Date.now();

  // Kanalen viser en spilleliste. Med `playlistId` (forhåndsvisning i admin)
  // vises spillelisten direkte, uten kanal.
  let screen = null;
  let playlistId = toIntOrNull(previewPlaylistId);
  if (playlistId) {
    const p = await env.DB.prepare('SELECT * FROM playlists WHERE id = ?').bind(playlistId).first();
    screen = p ? { id: null, name: p.name, orientation: p.orientation, rotation: 0, playlist_id: p.id } : null;
    if (!p) playlistId = null;
  } else if (id) {
    screen = await env.DB.prepare('SELECT * FROM screens WHERE id = ?').bind(id).first();
    if (screen) {
      // Tidsplanen bestemmer hva som vises nå (ellers standard-spillelisten).
      const now = await resolveScreenContent(env, screen);
      playlistId = now.playlistId;
      screen = {
        ...screen,
        power: now.off ? 'off' : 'on',
        active_slot: now.slot ? { id: now.slot.id, title: now.slot.title || null } : null,
        // Åpningstidene og tidssonen sendes med, så TV-appen kan slå av selv når den er uten nett.
        hours: safeJson(screen.hours, null),
        timezone: await getTimezone(env),
        closed: !!now.closed
      };
    }
    if (screen && playlistId) {
      const p = await env.DB.prepare('SELECT orientation FROM playlists WHERE id = ?').bind(playlistId).first();
      if (p) screen = { ...screen, orientation: p.orientation };
    }
  }

  const [deckSlides, categories, schedule, sponsors, alerts] = await Promise.all([
    playlistId
      ? env.DB
          .prepare(
            `SELECT * FROM deck_slides
               WHERE playlist_id = ? AND enabled = 1
               ORDER BY position ASC, id ASC`
          )
          .bind(playlistId)
          .all()
      : Promise.resolve({ results: [] }),
    env.DB.prepare('SELECT * FROM categories ORDER BY name ASC').all(),
    env.DB.prepare('SELECT * FROM schedule ORDER BY start_time ASC, id ASC').all(),
    env.DB.prepare('SELECT * FROM sponsors ORDER BY id ASC').all(),
    env.DB
      .prepare(
        `SELECT * FROM alerts WHERE active = 1 ORDER BY created_at DESC, id DESC`
      )
      .all()
  ]);
  // Varsler til alle, til denne skjermen, eller til en gruppe (tagg) skjermen er med i.
  const screenTags = String(screen?.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
  alerts.results = (alerts.results ?? []).filter((a) =>
    a.target_tag ? screenTags.includes(a.target_tag) : !a.target_screen_id || a.target_screen_id === id
  );

  const scheduleRows = (schedule.results ?? []).map((row) => ({
    ...row,
    effective_status: effectiveStatus(row, now)
  }));

  // Godkjenning før publisering: skjermene viser siste publiserte versjon
  // (forhåndsvisningen i editoren viser utkastet).
  const published = !previewPlaylistId && playlistId ? await publishedDeck(env, playlistId) : null;

  // Hent elementene for lysbildene og bygg deck.
  const rawSlides = published ? published.slides.filter((s) => s.enabled !== 0) : deckSlides.results ?? [];
  const slideIds = rawSlides.map((s) => s.id);
  const elsBySlide = {};
  if (published) {
    for (const s of rawSlides)
      for (const e of s.elements || []) {
        const config = safeJson(e.config, {});
        if (config.hidden === true) continue;
        (elsBySlide[s.id] ||= []).push({ ...e, slide_id: s.id, config });
      }
  } else if (slideIds.length) {
    const marks = slideIds.map(() => '?').join(',');
    const { results: els } = await env.DB
      .prepare(
        `SELECT * FROM deck_elements WHERE slide_id IN (${marks}) ORDER BY slide_id ASC, z ASC, id ASC`
      )
      .bind(...slideIds)
      .all();
    for (const e of els ?? []) {
      const config = safeJson(e.config, {});
      if (config.hidden === true) continue; // skjult lag i editoren
      (elsBySlide[e.slide_id] ||= []).push({ ...e, config });
    }
  }
  const deck = rawSlides.map(({ elements: _e, ...s }) => ({
    ...s,
    background: safeJson(s.background, { type: 'color', color: '#0f2733' }),
    elements: elsBySlide[s.id] ?? []
  }));
  await withCarouselImages(env, deck);
  await withBirthdays(env, deck);

  const state = {
    screen: screen || null,
    deck: env.DEVICE_MODE ? await adaptForDevices(env, deck) : deck,
    categories: categories.results ?? [],
    schedule: scheduleRows,
    sponsors: sponsors.results ?? [],
    alerts: alerts.results ?? [],
    serverTime: new Date().toISOString()
  };
  state.version = signature(state);
  return state;
}

const youtubeId = (url) =>
  (/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/.exec(url || '') || [])[1];

/**
 * Apple TV har ingen nettleser. For TV-appen (env.DEVICE_MODE) byttes
 * nettside-elementer og widgetene vær/nyheter/kalender/Flatr Apps ut med siste
 * skjermbilde (tas av server/snapshots.js), og YouTube med forsidebildet.
 */
/** Bildene i en mappe i mediebiblioteket (til bildekarusellen), sortert på navn. */
export async function folderImages(env, folder) {
  const { results } = await env.DB.prepare(
    `SELECT id, name FROM media WHERE folder = ? AND content_type LIKE 'image/%' ORDER BY name COLLATE NOCASE, id`
  )
    .bind(folder)
    .all();
  return (results ?? []).map((m) => ({ url: `/api/media?id=${m.id}&raw=1`, name: m.name }));
}

/**
 * Bildekaruseller får bildelista fra mappen sin lagt inn i config.images, så
 * både nettleseren og Apple TV har alt de trenger i én tilstand – og nye
 * bilder i mappen dukker opp av seg selv.
 */
async function withCarouselImages(env, deck) {
  const folders = new Set();
  for (const s of deck) for (const e of s.elements) if (e.kind === 'carousel' && e.config?.folder) folders.add(e.config.folder);
  if (!folders.size) return;
  const byFolder = {};
  for (const f of folders) byFolder[f] = await folderImages(env, f);
  for (const s of deck)
    for (const e of s.elements)
      if (e.kind === 'carousel') e.config = { ...e.config, images: byFolder[e.config?.folder] || [] };
}

/**
 * Bursdager: bokser med «skjul når ingen i perioden» og kakeregn uten
 * bursdag i dag tas ut av tilstanden, så de forsvinner på alle skjermer
 * (også Apple TV) og kommer tilbake av seg selv.
 */
async function withBirthdays(env, deck) {
  const ids = new Set();
  for (const s of deck) for (const e of s.elements) if (e.kind === 'app' && e.config?.appId) ids.add(Number(e.config.appId));
  if (!ids.size) return;
  let rows = [];
  try {
    ({ results: rows } = await env.DB.prepare(`SELECT id, config FROM apps WHERE kind = 'birthdays' AND id IN (${[...ids].map(() => '?').join(',')})`)
      .bind(...ids)
      .all());
  } catch {
    return; // ingen apps-tabell
  }
  if (!rows?.length) return;
  const today = todayIn(await getTimezone(env));
  const soonest = {}; // app-id -> dager til neste bursdag
  for (const r of rows) {
    const next = upcomingBirthdays(safeJson(r.config, {}).people, today, { max: 1 })[0];
    soonest[r.id] = next ? next.days : Infinity;
  }
  for (const s of deck)
    s.elements = s.elements.filter((e) => {
      const next = e.kind === 'app' ? soonest[Number(e.config?.appId)] : undefined;
      if (next === undefined) return true;
      if (e.config?.effect === 'rain') return next === 0;
      if (e.config?.days == null || e.config?.autoHide === false) return true;
      return next <= Math.min(7, Math.max(1, Number(e.config.days) || 7));
    });
}

const DEVICE_WIDGETS = ['weather', 'rss', 'calendar', 'app'];
// Nøkkelen skjermbildet er lagret under (se server/snapshots.js).
const snapshotKey = (e) => (e.kind === 'web' ? e.config?.url : DEVICE_WIDGETS.includes(e.kind) ? `widget:${e.id}` : null);

async function adaptForDevices(env, deck) {
  const urls = new Set();
  for (const s of deck) for (const e of s.elements) if (snapshotKey(e)) urls.add(snapshotKey(e));

  const shots = {};
  if (urls.size) {
    try {
      const list = [...urls];
      const { results } = await env.DB
        .prepare(
          `SELECT id, url, taken_at FROM web_snapshots
            WHERE r2_key IS NOT NULL AND url IN (${list.map(() => '?').join(',')})`
        )
        .bind(...list)
        .all();
      for (const r of results ?? []) shots[r.url] = r;
    } catch {
      /* tabellen finnes ikke (Worker) – behold nettside-elementene */
    }
  }

  // TV-apper som tegner AIS selv (hodet X-Flatr-Features: app) får elementet
  // med en datalenke i stedet for skjermbilde – live, ikke et bilde hvert 2. min.
  const nativeAis = new Set();
  const features = String(env.DEVICE_FEATURES || '').split(',').map((f) => f.trim());
  if (features.includes('app')) {
    const ids = [...new Set(deck.flatMap((s) => s.elements.filter((e) => e.kind === 'app').map((e) => Number(e.config?.appId))))].filter(Boolean);
    if (ids.length) {
      try {
        // Bare visningene TV-appen kan tegne selv; anløpsplanen o.l. blir skjermbilde.
        const { results } = await env.DB.prepare(`SELECT id FROM apps WHERE kind = 'ais' AND id IN (${ids.map(() => '?').join(',')})`)
          .bind(...ids)
          .all();
        for (const r of results ?? []) nativeAis.add(r.id);
      } catch {
        /* ingen apps-tabell */
      }
    }
  }

  // Widgeter uten skjermbilde ennå: TV-appen kjenner ikke typen og ville blitt
  // stående og laste. Hopp over dem nå, og be serveren lage skjermbildet med en gang.
  let missing = false;
  const adapted = deck.map((s) => ({
    ...s,
    elements: s.elements.flatMap((e) => {
      // Knapper (berøringsskjermer) har ingen funksjon på TV-en: vis dem som merke.
      if (e.kind === 'button') {
        const c = e.config || {};
        return [
          { ...e, kind: 'shape', config: { shape: 'rect', fill: c.fill || '#ffffff', radius: Math.min(Number(c.radius ?? 999), 400), opacity: 100 } },
          { ...e, id: -e.id, z: e.z, kind: 'text', config: { text: c.label || '', size: Number(c.size) || 44, weight: c.weight ?? 700, color: c.color || '#0f2733', align: 'center', valign: 'middle', font: c.font || '', autoFit: true } }
        ];
      }
      // Kakeregn er en animasjon: TV-apper som kan tegne effekter selv (hodet
      // X-Flatr-Features: effects) får det som eget element, de andre hopper over.
      if (e.kind === 'app' && e.config?.effect === 'rain') {
        return features.includes('effects') ? [{ ...e, kind: 'effect', config: { type: 'rain', amount: e.config.amount || 'normal', opacity: Math.min(1, Math.max(0.1, Number(e.config.opacity) || 1)) } }] : [];
      }
      if (e.kind === 'app' && nativeAis.has(Number(e.config?.appId)) && ['map', 'cards', 'arrivals'].includes(e.config?.view || 'map')) {
        return [{ ...e, config: { ...e.config, data_url: `/api/feeds?element=${e.id}` } }];
      }
      const key = snapshotKey(e);
      if (key && !shots[key] && e.kind !== 'web') {
        missing = true;
        return [];
      }
      if (key && shots[key]) {
        const shot = shots[key];
        const v = encodeURIComponent(shot.taken_at || '');
        return {
          ...e,
          kind: 'image',
          config: { url: `/api/snapshot?id=${shot.id}&v=${v}`, fit: e.kind === 'web' ? 'cover' : 'contain', radius: 0 }
        };
      }
      const yt = e.kind === 'video' && youtubeId(e.config?.url);
      if (yt) {
        return {
          ...e,
          kind: 'image',
          config: { url: `https://img.youtube.com/vi/${yt}/hqdefault.jpg`, fit: e.config?.fit || 'contain', radius: 0 }
        };
      }
      return e;
    })
  }));
  if (missing) env.REQUEST_SNAPSHOTS?.();
  return adapted;
}

/** Lettvekts endrings-signatur (djb2) over innhold – uten serverTime.
 *  `last_seen` på skjermen utelates: en heartbeat skal ikke trigge SSE-update
 *  eller endre ETag på /api/state. */
export function signature(state) {
  const { last_seen, ...screen } = state.screen || {};
  const basis = JSON.stringify({
    screen,
    deck: state.deck,
    categories: state.categories,
    schedule: state.schedule,
    sponsors: state.sponsors,
    alerts: state.alerts
  });
  let hash = 5381;
  for (let i = 0; i < basis.length; i++) {
    hash = ((hash << 5) + hash + basis.charCodeAt(i)) | 0;
  }
  return String(hash >>> 0);
}
