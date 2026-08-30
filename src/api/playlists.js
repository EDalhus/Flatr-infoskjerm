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

// GET /api/playlists        -> alle (med item_count + total_seconds)
// GET /api/playlists?id=1   -> én med items
export async function onRequestGet({ request, env }) {
  const id = toIntOrNull(new URL(request.url).searchParams.get('id'));

  if (id) {
    const pl = await env.DB.prepare('SELECT * FROM playlists WHERE id = ?').bind(id).first();
    if (!pl) return notFound('Spilleliste finnes ikke');
    const { results } = await env.DB
      .prepare('SELECT * FROM playlist_items WHERE playlist_id = ? ORDER BY position ASC, id ASC')
      .bind(id)
      .all();
    return json({ ...pl, items: (results ?? []).map((r) => ({ ...r, config: safeJson(r.config, {}) })) });
  }

  const { results } = await env.DB
    .prepare(
      `SELECT p.*,
              (SELECT COUNT(*) FROM playlist_items i WHERE i.playlist_id = p.id) AS item_count,
              (SELECT COALESCE(SUM(duration_seconds), 0) FROM playlist_items i
                 WHERE i.playlist_id = p.id AND i.enabled = 1) AS total_seconds
         FROM playlists p ORDER BY p.folder IS NOT NULL, p.folder, p.name`
    )
    .all();
  return json(results ?? []);
}

// POST /api/playlists  { name, folder? }
export async function onRequestPost(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;
  const b = await readJson(context.request);
  if (!b?.name) return badRequest('name er påkrevd');

  const row = await context.env.DB
    .prepare('INSERT INTO playlists (name, folder) VALUES (?, ?) RETURNING *')
    .bind(String(b.name).trim(), b.folder ? String(b.folder).trim() : null)
    .first();
  return json({ ...row, item_count: 0, total_seconds: 0 }, { status: 201 });
}

// PUT /api/playlists?id=1  { name?, folder? }
export async function onRequestPut(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;
  const id = toIntOrNull(new URL(context.request.url).searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');

  const b = await readJson(context.request);
  const cur = await context.env.DB.prepare('SELECT * FROM playlists WHERE id = ?').bind(id).first();
  if (!cur) return notFound('Spilleliste finnes ikke');

  const row = await context.env.DB
    .prepare('UPDATE playlists SET name = ?, folder = ? WHERE id = ? RETURNING *')
    .bind(
      b?.name !== undefined ? String(b.name).trim() : cur.name,
      b?.folder !== undefined ? (b.folder ? String(b.folder).trim() : null) : cur.folder,
      id
    )
    .first();
  return json(row);
}

// DELETE /api/playlists?id=1  (sone-referanser nulles av FK)
export async function onRequestDelete(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;
  const id = toIntOrNull(new URL(context.request.url).searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');

  await context.env.DB.prepare('DELETE FROM playlist_items WHERE playlist_id = ?').bind(id).run();
  await context.env.DB.prepare('DELETE FROM playlists WHERE id = ?').bind(id).run();
  return noContent();
}

export const onRequestOptions = handleOptions;
