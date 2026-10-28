import { json, handleOptions, toIntOrNull } from './_shared.js';
import { scheduleVersion } from './versions.js';

// Aktivitetslogg: hvem gjorde hva, og når. Hver vellykket endring gjennom
// API-et beskrives (afterWrite) og lagres; gjentatte endringer av det samme
// (f.eks. mange små redigeringer i en presentasjon) slås sammen innen 10 min.
// Endringer i presentasjoner planlegger også en ny versjon (versions.js).
//
//   GET /api/activity?before=<id>&q=<søk>   -> 50 hendelser, nyeste først

const MERGE_MS = 10 * 60_000;
const KEEP_DAYS = 180;

const VERB = {
  '/api/playlists': { POST: 'opprettet presentasjonen', PUT: 'endret presentasjonen', DELETE: 'slettet presentasjonen' },
  '/api/screens': { POST: 'la til skjermen', PUT: 'endret skjermen', DELETE: 'slettet skjermen' },
  '/api/schedule': { POST: 'la til i programmet', PUT: 'endret programmet', DELETE: 'fjernet fra programmet' },
  '/api/timeslots': { POST: 'endret tidsplanen', PUT: 'endret tidsplanen', DELETE: 'endret tidsplanen' },
  '/api/media': { POST: 'lastet opp', PUT: 'endret filen', DELETE: 'slettet filen' },
  '/api/alerts': { POST: 'sendte varselet', DELETE: 'avsluttet varsel' },
  '/api/apps': { POST: 'aktiverte appen', PUT: 'endret appen', DELETE: 'deaktiverte appen' },
  '/api/settings': { PUT: 'endret innstillingene' },
  '/api/templates': { POST: 'lagret malen', PUT: 'endret malen', DELETE: 'slettet malen' },
  '/api/trash': { POST: 'gjenopprettet fra papirkurven', DELETE: 'tømte fra papirkurven' },
  '/api/categories': { POST: 'endret kategoriene', PUT: 'endret kategoriene', DELETE: 'endret kategoriene' },
  '/api/sponsors': { POST: 'endret sponsorene', PUT: 'endret sponsorene', DELETE: 'endret sponsorene' }
};
const DECK = new Set(['/api/deck-slides', '/api/deck-elements']);

/** Presentasjonen et lysbilde eller element hører til: { id, name } | null. */
async function playlistOf(env, { slideId, elementId }) {
  if (elementId) {
    const row = await env.DB.prepare('SELECT slide_id FROM deck_elements WHERE id = ?').bind(elementId).first();
    slideId = row?.slide_id;
  }
  if (!slideId) return null;
  return env.DB.prepare('SELECT p.id, p.name FROM deck_slides s JOIN playlists p ON p.id = s.playlist_id WHERE s.id = ?').bind(slideId).first();
}

/** Det som trengs FØR en sletting/endring (raden finnes ikke etterpå). */
export async function beforeWrite(env, method, key, url) {
  const id = toIntOrNull(url.searchParams.get('id'));
  if (!id || method === 'POST') return null;
  if (key === '/api/deck-slides') return { playlist: await playlistOf(env, { slideId: id }) };
  if (key === '/api/deck-elements') return { playlist: await playlistOf(env, { elementId: id }) };
  const table = { '/api/playlists': 'playlists', '/api/screens': 'screens', '/api/media': 'media', '/api/apps': 'apps', '/api/templates': 'templates' }[key];
  if (!table) return null;
  const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first().catch(() => null);
  return row ? { name: row.name || row.title || null, id } : null;
}

/** Beskriv en vellykket endring. -> { action, target_type, target_id, target_name, detail, playlistId } | null */
async function describe(env, { method, key, url, body, result, before }) {
  if (DECK.has(key)) {
    let pl = before?.playlist;
    if (!pl) {
      const slideId = key === '/api/deck-slides' ? result?.id || toIntOrNull(body?.slide_id) : result?.slide_id || toIntOrNull(body?.slide_id);
      pl = slideId ? await playlistOf(env, { slideId }) : null;
      if (!pl && toIntOrNull(body?.playlist_id)) pl = await env.DB.prepare('SELECT id, name FROM playlists WHERE id = ?').bind(toIntOrNull(body.playlist_id)).first();
    }
    if (!pl) return null;
    return { action: 'redigerte presentasjonen', target_type: 'playlist', target_id: pl.id, target_name: pl.name, playlistId: pl.id };
  }
  if (key === '/api/ai' && method === 'POST') {
    if (url.searchParams.get('context')) return { action: 'endret AI-konteksten', target_type: 'app', target_name: 'Claude AI' };
    if (url.searchParams.get('stop') || url.searchParams.get('parse')) return null;
    const pl = toIntOrNull(body?.playlist_id) && (await env.DB.prepare('SELECT id, name FROM playlists WHERE id = ?').bind(toIntOrNull(body.playlist_id)).first());
    return pl ? { action: 'ba Claude AI om endringer i', target_type: 'playlist', target_id: pl.id, target_name: pl.name, detail: String(body?.message || '').slice(0, 200) } : null;
  }
  if (key.startsWith('/api/pairing/')) {
    if (key.endsWith('/link')) return { action: 'koblet til en TV', target_type: 'screen' };
    if (key.endsWith('/unpair')) return { action: 'koblet fra en TV', target_type: 'screen' };
    return null;
  }
  if (key === '/api/versions') return { action: 'gjenopprettet en tidligere versjon av', target_type: 'playlist', target_id: result?.playlist_id, target_name: null, playlistId: result?.playlist_id };
  if (key === '/api/review') return null; // logges av review.js selv
  const verbs = VERB[key];
  const action = verbs?.[method];
  if (!action) return null;
  let target_name = result?.name || result?.title || body?.name || body?.title || before?.name || null;
  let finalAction = action;
  if (key === '/api/settings' && body?.brand) finalAction = 'endret merkevaren';
  if (key === '/api/alerts' && body?.message) target_name = `«${String(body.message).slice(0, 80)}»`;
  const type = { '/api/playlists': 'playlist', '/api/screens': 'screen', '/api/media': 'media', '/api/apps': 'app' }[key] || key.replace('/api/', '');
  return {
    action: finalAction,
    target_type: type,
    target_id: result?.id || before?.id || toIntOrNull(url.searchParams.get('id')),
    target_name,
    playlistId: key === '/api/playlists' && method === 'PUT' ? toIntOrNull(url.searchParams.get('id')) : null
  };
}

/** Lagrer hendelsen (eller slår den sammen med en lik, nylig hendelse). */
export async function logActivity(env, user, d) {
  const email = user?.email || null;
  const recent = await env.DB.prepare(
    `SELECT id, at FROM activity_log WHERE user_email IS ? AND action = ? AND target_type IS ? AND target_id IS ? ORDER BY id DESC LIMIT 1`
  )
    .bind(email, d.action, d.target_type ?? null, d.target_id ?? null)
    .first();
  if (recent && Date.now() - Date.parse(recent.at) < MERGE_MS && !d.detail) {
    await env.DB.prepare(`UPDATE activity_log SET at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), count = count + 1, target_name = COALESCE(?, target_name) WHERE id = ?`)
      .bind(d.target_name ?? null, recent.id)
      .run();
    return;
  }
  await env.DB.prepare('INSERT INTO activity_log (user_email, user_name, action, target_type, target_id, target_name, detail) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(email, user?.name || null, d.action, d.target_type ?? null, d.target_id ?? null, d.target_name ?? null, d.detail ?? null)
    .run();
  // Rydd av og til.
  if (Math.random() < 0.02) await env.DB.prepare(`DELETE FROM activity_log WHERE at < ?`).bind(new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString()).run();
}

/**
 * Kalles etter hver vellykkede endring (fra serveren og fra AI-assistentens
 * verktøy): logg og planlegg versjon. Feiler aldri høylytt.
 */
export async function afterWrite(env, user, info) {
  try {
    const d = await describe(env, info);
    if (!d) return;
    if (!info.silent) await logActivity(env, user, d);
    if (d.playlistId) scheduleVersion(env, d.playlistId, user?.name || user?.email || null);
  } catch (err) {
    console.warn('[activity]', err.message);
  }
}

export async function onRequestGet({ request, env }) {
  const params = new URL(request.url).searchParams;
  const before = toIntOrNull(params.get('before'));
  const q = String(params.get('q') || '').trim().toLowerCase();
  const where = [];
  const binds = [];
  if (before) {
    where.push('id < ?');
    binds.push(before);
  }
  if (q) {
    where.push(`(LOWER(COALESCE(user_name, '') || ' ' || COALESCE(user_email, '') || ' ' || action || ' ' || COALESCE(target_name, '')) LIKE ?)`);
    binds.push(`%${q}%`);
  }
  const { results } = await env.DB.prepare(`SELECT * FROM activity_log ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT 50`)
    .bind(...binds)
    .all();
  return json(results || []);
}

export const onRequestOptions = handleOptions;
