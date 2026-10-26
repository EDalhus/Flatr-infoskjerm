// Delte hjelpere for alle API-Functions. Filnavn med _ rutes ikke av Pages.

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
export function viewerTarget(request, env) {
  const params = new URL(request.url).searchParams;
  const playlistId = toIntOrNull(params.get('playlist'));
  if (playlistId && 'SESSION_USER' in env && !env.SESSION_USER) {
    return { denied: json({ error: 'Ikke innlogget' }, { status: 401 }) };
  }
  return { screenId: playlistId ? null : params.get('screen'), playlistId };
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
  const slot = slots?.length ? activeSlot(slots, when, await getTimezone(env)) : null;
  if (!slot) return { playlistId: screen.playlist_id ?? null, off: false, slot: null };
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
        active_slot: now.slot ? { id: now.slot.id, title: now.slot.title || null } : null
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
        `SELECT * FROM alerts
           WHERE active = 1 AND (target_screen_id IS NULL OR target_screen_id = ?)
           ORDER BY created_at DESC, id DESC`
      )
      .bind(id)
      .all()
  ]);

  const scheduleRows = (schedule.results ?? []).map((row) => ({
    ...row,
    effective_status: effectiveStatus(row, now)
  }));

  // Hent elementene for lysbildene og bygg deck.
  const rawSlides = deckSlides.results ?? [];
  const slideIds = rawSlides.map((s) => s.id);
  const elsBySlide = {};
  if (slideIds.length) {
    const marks = slideIds.map(() => '?').join(',');
    const { results: els } = await env.DB
      .prepare(
        `SELECT * FROM deck_elements WHERE slide_id IN (${marks}) ORDER BY slide_id ASC, z ASC, id ASC`
      )
      .bind(...slideIds)
      .all();
    for (const e of els ?? [])
      (elsBySlide[e.slide_id] ||= []).push({ ...e, config: safeJson(e.config, {}) });
  }
  const deck = rawSlides.map((s) => ({
    ...s,
    background: safeJson(s.background, { type: 'color', color: '#0f2733' }),
    elements: elsBySlide[s.id] ?? []
  }));

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
 * nettside-elementer ut med siste skjermbilde (tas av server/snapshots.js),
 * og YouTube-videoer med videoens forsidebilde.
 */
async function adaptForDevices(env, deck) {
  const urls = new Set();
  for (const s of deck) for (const e of s.elements) if (e.kind === 'web' && e.config?.url) urls.add(e.config.url);

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

  return deck.map((s) => ({
    ...s,
    elements: s.elements.map((e) => {
      if (e.kind === 'web' && shots[e.config?.url]) {
        const shot = shots[e.config.url];
        const v = encodeURIComponent(shot.taken_at || '');
        return { ...e, kind: 'image', config: { url: `/api/snapshot?id=${shot.id}&v=${v}`, fit: 'cover', radius: 0 } };
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
