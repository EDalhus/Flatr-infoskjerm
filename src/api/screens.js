import {
  json,
  noContent,
  badRequest,
  notFound,
  handleOptions,
  readJson,
  requireAdmin,
  toIntOrNull,
  moveToTrash,
  resolveScreenContent,
  checkLimit,
  safeJson
} from './_shared.js';
import { createPlaylist } from './playlists.js';

const ONLINE_MS = 90_000;
const normOrientation = (v, f = 'landscape') =>
  v === 'portrait' ? 'portrait' : v === 'landscape' ? 'landscape' : f;

// Skjermrotasjon i grader – multipler av 45, 0–315. Ugyldig -> fallback.
const normRotation = (v, f = 0) => {
  const n = Number.parseInt(v, 10);
  return Number.isInteger(n) && n >= 0 && n < 360 && n % 45 === 0 ? n : f;
};

const splitTags = (v) => String(v || '').split(',').map((t) => t.trim()).filter(Boolean);

function decorate(row) {
  const { playlist_orientation, d_device_id, d_code, d_paired_at, d_last_seen, d_client_info, ...rest } = row;
  return {
    ...rest,
    tags: splitTags(row.tags),
    // TV-en (Apple TV o.l.) som er koblet til skjermen. Uten TV vises skjermen i en nettleser.
    device: d_device_id
      ? {
          device_id: d_device_id,
          code: d_code,
          paired_at: d_paired_at,
          last_seen: d_last_seen,
          online: d_last_seen ? Date.now() - Date.parse(d_last_seen) < ONLINE_MS : false,
          client_info: d_client_info ? safeJson(d_client_info, null) : null
        }
      : null,
    // Lerretsretningen følger spillelisten kanalen viser.
    orientation: playlist_orientation || row.orientation,
    online: row.last_seen ? Date.now() - Date.parse(row.last_seen) < ONLINE_MS : false
  };
}

// Kanalen viser en spilleliste; antall lysbilder og navnet hentes derfra.
const EXTRA = `(SELECT COUNT(*) FROM deck_slides d WHERE d.playlist_id = s.playlist_id) AS slide_count,
  (SELECT p.name FROM playlists p WHERE p.id = s.playlist_id) AS playlist_name,
  (SELECT p.orientation FROM playlists p WHERE p.id = s.playlist_id) AS playlist_orientation,
  d.device_id AS d_device_id, d.code AS d_code, d.paired_at AS d_paired_at, d.last_seen AS d_last_seen, d.client_info AS d_client_info`;
const DEVICE_JOIN = `LEFT JOIN pairings d ON d.id = (SELECT MAX(id) FROM pairings WHERE screen_id = s.id AND status = 'paired')`;

const byId = (env, id) => env.DB.prepare(`SELECT s.*, ${EXTRA} FROM screens s ${DEVICE_JOIN} WHERE s.id = ?`).bind(id).first();

/** Legger til hva kanalen viser nå ifølge tidsplanen (now_*). */
async function withNow(env, rows) {
  const { results: pls } = await env.DB.prepare('SELECT id, name FROM playlists').all();
  const names = Object.fromEntries((pls ?? []).map((p) => [p.id, p.name]));
  return Promise.all(
    rows.map(async (row) => {
      const now = await resolveScreenContent(env, row);
      return {
        ...row,
        now_playlist_id: now.playlistId,
        now_playlist_name: now.playlistId ? (names[now.playlistId] ?? null) : null,
        now_off: now.off,
        now_slot: now.slot ? { id: now.slot.id, title: now.slot.title || null } : null
      };
    })
  );
}

// GET /api/screens        -> alle (med slide_count + online)
// GET /api/screens?id=1   -> én
export async function onRequestGet({ request, env }) {
  const id = toIntOrNull(new URL(request.url).searchParams.get('id'));
  // Lista er åpen for skjermvisningen; TV-info (IP o.l.) bare for innloggede.
  const view = env.SESSION_USER === null ? ({ device, tags, ...r }) => r : (r) => r;

  if (id) {
    const row = await env.DB
      .prepare(`SELECT s.*, ${EXTRA} FROM screens s ${DEVICE_JOIN} WHERE s.id = ?`)
      .bind(id)
      .first();
    return row ? json(view((await withNow(env, [decorate(row)]))[0])) : notFound('Skjerm finnes ikke');
  }
  const { results } = await env.DB
    .prepare(`SELECT s.*, ${EXTRA} FROM screens s ${DEVICE_JOIN} ORDER BY s.name COLLATE NOCASE ASC`)
    .all();
  return json((await withNow(env, (results ?? []).map(decorate))).map(view));
}

// POST /api/screens
//   { name, location?, orientation?, playlist_id? } -> ny kanal. Uten playlist_id
//                                                     får den en egen ny spilleliste.
//   { duplicate_of, name? }                         -> kopi som viser samme spilleliste
export async function onRequestPost(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const env = context.env;
  const b = await readJson(context.request);
  const cloneId = toIntOrNull(b?.duplicate_of);
  const atLimit = await checkLimit(env, 'screens');
  if (atLimit) return atLimit;

  if (cloneId) {
    const src = await env.DB.prepare('SELECT * FROM screens WHERE id = ?').bind(cloneId).first();
    if (!src) return notFound('Skjerm å kopiere finnes ikke');
    const copy = await env.DB
      .prepare(
        `INSERT INTO screens (name, location, orientation, rotation, rotation_seconds, playlist_id)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING id`
      )
      .bind(
        b?.name ? String(b.name).trim() : `${src.name} (kopi)`,
        src.location,
        src.orientation,
        src.rotation ?? 0,
        src.rotation_seconds,
        src.playlist_id
      )
      .first();
    return json(decorate(await byId(env, copy.id)), { status: 201 });
  }

  if (!b?.name) return badRequest('name er påkrevd');
  const name = String(b.name).trim();

  let playlistId = toIntOrNull(b.playlist_id);
  if (playlistId) {
    const exists = await env.DB.prepare('SELECT id FROM playlists WHERE id = ?').bind(playlistId).first();
    if (!exists) return notFound('Spillelisten finnes ikke');
  } else {
    playlistId = (await createPlaylist(env, { name, orientation: b.orientation })).id;
  }

  const row = await env.DB
    .prepare(
      'INSERT INTO screens (name, location, orientation, rotation, playlist_id) VALUES (?, ?, ?, ?, ?) RETURNING id'
    )
    .bind(name, b.location ? String(b.location).trim() : null, normOrientation(b.orientation), normRotation(b.rotation), playlistId)
    .first();
  return json(decorate(await byId(env, row.id)), { status: 201 });
}

// PUT /api/screens?id=1  { name?, location?, rotation?, playlist_id?, tags? }
export async function onRequestPut(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const env = context.env;
  const id = toIntOrNull(new URL(context.request.url).searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');
  const b = await readJson(context.request);
  if (!b) return badRequest('ugyldig JSON');

  const cur = await env.DB.prepare('SELECT * FROM screens WHERE id = ?').bind(id).first();
  if (!cur) return notFound('Skjerm finnes ikke');

  let playlistId = cur.playlist_id;
  if (b.playlist_id !== undefined) {
    playlistId = toIntOrNull(b.playlist_id);
    if (playlistId) {
      const exists = await env.DB.prepare('SELECT id FROM playlists WHERE id = ?').bind(playlistId).first();
      if (!exists) return notFound('Spillelisten finnes ikke');
    }
  }

  // Lerretsretningen hører til spillelisten; endres den her, endres spillelisten.
  if (b.orientation !== undefined && playlistId) {
    await env.DB
      .prepare('UPDATE playlists SET orientation = ? WHERE id = ?')
      .bind(normOrientation(b.orientation), playlistId)
      .run();
  }

  await env.DB
    .prepare('UPDATE screens SET name = ?, location = ?, orientation = ?, rotation = ?, playlist_id = ?, tags = ? WHERE id = ?')
    .bind(
      b.name !== undefined ? String(b.name).trim() : cur.name,
      b.location !== undefined ? (b.location ? String(b.location).trim() : null) : cur.location,
      b.orientation !== undefined ? normOrientation(b.orientation, cur.orientation) : cur.orientation,
      b.rotation !== undefined ? normRotation(b.rotation, cur.rotation ?? 0) : (cur.rotation ?? 0),
      playlistId,
      b.tags !== undefined
        ? [...new Set((Array.isArray(b.tags) ? b.tags : splitTags(b.tags)).map((t) => String(t).trim().slice(0, 40)).filter(Boolean))].join(', ') || null
        : cur.tags,
      id
    )
    .run();
  return json(decorate(await byId(env, id)));
}

// DELETE /api/screens?id=1
export async function onRequestDelete(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const id = toIntOrNull(new URL(context.request.url).searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');

  // Presentasjonen blir stående – den kan være i bruk på andre skjermer.
  // En TV som var koblet til skjermen går tilbake til å vise en ny kode.
  const row = await context.env.DB.prepare('SELECT * FROM screens WHERE id = ?').bind(id).first();
  if (row) {
    await moveToTrash(context.env, 'screen', row.name, { row });
    await context.env.DB.prepare('DELETE FROM pairings WHERE screen_id = ?').bind(id).run();
    await context.env.DB.prepare('DELETE FROM screens WHERE id = ?').bind(id).run();
  }
  return noContent();
}

export const onRequestOptions = handleOptions;
