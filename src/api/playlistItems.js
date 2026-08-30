import {
  json,
  noContent,
  badRequest,
  notFound,
  handleOptions,
  readJson,
  requireAdmin,
  toIntOrNull,
  safeJson
} from './_shared.js';

const TYPES = ['program', 'sponsors', 'message', 'clock', 'image', 'layout'];
const normType = (v) => (TYPES.includes(v) ? v : 'program');
const serializeConfig = (v) => JSON.stringify(safeJson(v, {}));

// GET /api/playlist-items?playlist=1
export async function onRequestGet({ request, env }) {
  const playlist = toIntOrNull(new URL(request.url).searchParams.get('playlist'));
  if (!playlist) return badRequest('playlist er påkrevd');
  const { results } = await env.DB
    .prepare('SELECT * FROM playlist_items WHERE playlist_id = ? ORDER BY position ASC, id ASC')
    .bind(playlist)
    .all();
  return json((results ?? []).map((r) => ({ ...r, config: safeJson(r.config, {}) })));
}

// POST /api/playlist-items  { playlist_id, type?, title?, duration_seconds?, config?, position? }
export async function onRequestPost(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;
  const b = await readJson(context.request);
  const playlistId = toIntOrNull(b?.playlist_id);
  if (!playlistId) return badRequest('playlist_id er påkrevd');

  const pl = await context.env.DB.prepare('SELECT id FROM playlists WHERE id = ?').bind(playlistId).first();
  if (!pl) return notFound('Spilleliste finnes ikke');

  let position = toIntOrNull(b?.position);
  if (position === null) {
    const max = await context.env.DB
      .prepare('SELECT COALESCE(MAX(position), -1) AS m FROM playlist_items WHERE playlist_id = ?')
      .bind(playlistId)
      .first();
    position = (max?.m ?? -1) + 1;
  }

  const row = await context.env.DB
    .prepare(
      `INSERT INTO playlist_items (playlist_id, position, type, title, duration_seconds, enabled, config)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`
    )
    .bind(
      playlistId,
      position,
      normType(b?.type),
      b?.title ? String(b.title).trim() : null,
      Math.max(3, toIntOrNull(b?.duration_seconds) ?? 15),
      b?.enabled === false ? 0 : 1,
      serializeConfig(b?.config)
    )
    .first();
  return json({ ...row, config: safeJson(row.config, {}) }, { status: 201 });
}

// PUT /api/playlist-items?id=1
export async function onRequestPut(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;
  const id = toIntOrNull(new URL(context.request.url).searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');

  const b = await readJson(context.request);
  const cur = await context.env.DB.prepare('SELECT * FROM playlist_items WHERE id = ?').bind(id).first();
  if (!cur) return notFound('Element finnes ikke');

  const merged = {
    position: b.position !== undefined ? toIntOrNull(b.position) ?? cur.position : cur.position,
    type: b.type !== undefined ? normType(b.type) : cur.type,
    title: b.title !== undefined ? (b.title ? String(b.title).trim() : null) : cur.title,
    duration_seconds:
      b.duration_seconds !== undefined
        ? Math.max(3, toIntOrNull(b.duration_seconds) ?? cur.duration_seconds)
        : cur.duration_seconds,
    enabled: b.enabled !== undefined ? (b.enabled ? 1 : 0) : cur.enabled,
    config: b.config !== undefined ? serializeConfig(b.config) : cur.config
  };

  const row = await context.env.DB
    .prepare(
      `UPDATE playlist_items
          SET position = ?, type = ?, title = ?, duration_seconds = ?, enabled = ?, config = ?
        WHERE id = ? RETURNING *`
    )
    .bind(
      merged.position,
      merged.type,
      merged.title,
      merged.duration_seconds,
      merged.enabled,
      merged.config,
      id
    )
    .first();
  return json({ ...row, config: safeJson(row.config, {}) });
}

// DELETE /api/playlist-items?id=1
export async function onRequestDelete(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;
  const id = toIntOrNull(new URL(context.request.url).searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');
  await context.env.DB.prepare('DELETE FROM playlist_items WHERE id = ?').bind(id).run();
  return noContent();
}

export const onRequestOptions = handleOptions;
