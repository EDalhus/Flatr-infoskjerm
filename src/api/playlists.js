import {
  json,
  noContent,
  badRequest,
  notFound,
  handleOptions,
  readJson,
  requireAdmin,
  toIntOrNull,
  moveToTrash
} from './_shared.js';

// Spillelister: en gjenbrukbar rekke lysbilder (deck_slides.playlist_id).
// Kanaler viser én spilleliste (screens.playlist_id); flere kanaler kan dele.

const normOrientation = (v, f = 'landscape') =>
  v === 'portrait' ? 'portrait' : v === 'landscape' ? 'landscape' : f;

const SELECT = `
  SELECT p.*,
         (SELECT COUNT(*) FROM deck_slides d WHERE d.playlist_id = p.id) AS slide_count,
         (SELECT COALESCE(SUM(d.duration_seconds), 0) FROM deck_slides d
            WHERE d.playlist_id = p.id AND d.enabled = 1) AS total_seconds,
         (SELECT json_group_array(json_object('id', s.id, 'name', s.name))
            FROM screens s WHERE s.playlist_id = p.id) AS used_by
    FROM playlists p`;

const decorate = (row) => ({ ...row, used_by: JSON.parse(row.used_by || '[]') });

/** Første lysbilde i en ny spilleliste, så den ikke starter helt tom. */
export async function seedPlaylist(env, playlistId, title) {
  const slide = await env.DB
    .prepare(
      `INSERT INTO deck_slides (playlist_id, position, name, duration_seconds, background)
       VALUES (?, 0, 'Tittel', 15, '{"type":"gradient","from":"#027353","to":"#0f2733","angle":135}') RETURNING id`
    )
    .bind(playlistId)
    .first();
  const stmt = env.DB.prepare(
    `INSERT INTO deck_elements (slide_id, z, kind, x, y, w, h, config) VALUES (?, ?, 'text', ?, ?, ?, ?, ?)`
  );
  await env.DB.batch([
    stmt.bind(
      slide.id,
      0,
      8,
      36,
      84,
      16,
      JSON.stringify({ text: title || 'Tittel', size: 120, weight: 800, align: 'center', valign: 'middle', color: '#ffffff' })
    ),
    stmt.bind(
      slide.id,
      1,
      8,
      55,
      84,
      8,
      JSON.stringify({ text: 'Undertittel', size: 46, weight: 400, align: 'center', color: '#ffffff' })
    )
  ]);
}

/** Oppretter en spilleliste (med ett startlysbilde) og returnerer raden. */
export async function createPlaylist(env, { name, orientation }) {
  const row = await env.DB
    .prepare('INSERT INTO playlists (name, orientation) VALUES (?, ?) RETURNING *')
    .bind(String(name).trim(), normOrientation(orientation))
    .first();
  await seedPlaylist(env, row.id, row.name);
  return row;
}

/** Kopierer alle lysbilder og elementer fra én spilleliste til en annen. */
export async function copySlides(env, fromId, toId) {
  const { results: slides } = await env.DB
    .prepare('SELECT * FROM deck_slides WHERE playlist_id = ? ORDER BY position ASC, id ASC')
    .bind(fromId)
    .all();
  for (const s of slides ?? []) {
    const ns = await env.DB
      .prepare(
        `INSERT INTO deck_slides
           (playlist_id, position, name, duration_seconds, transition, transition_ms, background, enabled,
            active_from, active_to, active_days, active_from_date, active_to_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
      )
      .bind(
        toId,
        s.position,
        s.name,
        s.duration_seconds,
        s.transition,
        s.transition_ms,
        s.background,
        s.enabled,
        s.active_from,
        s.active_to,
        s.active_days,
        s.active_from_date,
        s.active_to_date
      )
      .first();
    const { results: els } = await env.DB.prepare('SELECT * FROM deck_elements WHERE slide_id = ?').bind(s.id).all();
    if (els?.length) {
      const stmt = env.DB.prepare(
        `INSERT INTO deck_elements (slide_id, z, kind, x, y, w, h, rotation, config) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      await env.DB.batch(els.map((e) => stmt.bind(ns.id, e.z, e.kind, e.x, e.y, e.w, e.h, e.rotation, e.config)));
    }
  }
  return slides?.length ?? 0;
}

// GET /api/playlists        -> alle (med slide_count, total_seconds, used_by)
// GET /api/playlists?id=1   -> én
export async function onRequestGet({ request, env }) {
  const id = toIntOrNull(new URL(request.url).searchParams.get('id'));
  if (id) {
    const row = await env.DB.prepare(`${SELECT} WHERE p.id = ?`).bind(id).first();
    return row ? json(decorate(row)) : notFound('Spillelisten finnes ikke');
  }
  const { results } = await env.DB.prepare(`${SELECT} ORDER BY p.name COLLATE NOCASE ASC`).all();
  return json((results ?? []).map(decorate));
}

// POST /api/playlists
//   { name, orientation? }        -> ny spilleliste (+ ett startlysbilde)
//   { duplicate_of, name? }       -> kopi med alle lysbilder
export async function onRequestPost(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const env = context.env;
  const b = await readJson(context.request);

  const cloneId = toIntOrNull(b?.duplicate_of);
  if (cloneId) {
    const src = await env.DB.prepare('SELECT * FROM playlists WHERE id = ?').bind(cloneId).first();
    if (!src) return notFound('Spillelisten finnes ikke');
    const copy = await env.DB
      .prepare('INSERT INTO playlists (name, orientation) VALUES (?, ?) RETURNING *')
      .bind(b?.name ? String(b.name).trim() : `${src.name} (kopi)`, src.orientation)
      .first();
    await copySlides(env, src.id, copy.id);
    const row = await env.DB.prepare(`${SELECT} WHERE p.id = ?`).bind(copy.id).first();
    return json(decorate(row), { status: 201 });
  }

  if (!b?.name || !String(b.name).trim()) return badRequest('name er påkrevd');
  const created = await createPlaylist(env, b);
  const row = await env.DB.prepare(`${SELECT} WHERE p.id = ?`).bind(created.id).first();
  return json(decorate(row), { status: 201 });
}

// PUT /api/playlists?id=1  { name?, orientation? }
export async function onRequestPut(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const id = toIntOrNull(new URL(context.request.url).searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');
  const b = await readJson(context.request);
  if (!b) return badRequest('ugyldig JSON');

  const cur = await context.env.DB.prepare('SELECT * FROM playlists WHERE id = ?').bind(id).first();
  if (!cur) return notFound('Spillelisten finnes ikke');

  await context.env.DB
    .prepare(
      `UPDATE playlists SET name = ?, orientation = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`
    )
    .bind(
      b.name !== undefined && String(b.name).trim() ? String(b.name).trim() : cur.name,
      b.orientation !== undefined ? normOrientation(b.orientation, cur.orientation) : cur.orientation,
      id
    )
    .run();
  const row = await context.env.DB.prepare(`${SELECT} WHERE p.id = ?`).bind(id).first();
  return json(decorate(row));
}

// DELETE /api/playlists?id=1  -> papirkurv (kanaler som brukte den viser da ingenting)
export async function onRequestDelete(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const id = toIntOrNull(new URL(context.request.url).searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');
  const env = context.env;

  const row = await env.DB.prepare('SELECT * FROM playlists WHERE id = ?').bind(id).first();
  if (row) {
    const { results: slides } = await env.DB.prepare('SELECT * FROM deck_slides WHERE playlist_id = ?').bind(id).all();
    const ids = (slides ?? []).map((s) => s.id);
    let elements = [];
    if (ids.length) {
      const { results } = await env.DB
        .prepare(`SELECT * FROM deck_elements WHERE slide_id IN (${ids.map(() => '?').join(',')})`)
        .bind(...ids)
        .all();
      elements = results ?? [];
    }
    await moveToTrash(env, 'playlist', row.name, { row, slides: slides ?? [], elements });
    await env.DB.prepare('UPDATE screens SET playlist_id = NULL WHERE playlist_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM playlists WHERE id = ?').bind(id).run();
  }
  return noContent();
}

export const onRequestOptions = handleOptions;
