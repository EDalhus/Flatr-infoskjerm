import {
  json,
  noContent,
  badRequest,
  notFound,
  handleOptions,
  readJson,
  requireAdmin,
  toIntOrNull
} from './_shared.js';

// GET /api/sponsors
export async function onRequestGet({ env }) {
  const { results } = await env.DB
    .prepare('SELECT * FROM sponsors ORDER BY id ASC')
    .all();
  return json(results);
}

// POST /api/sponsors  { name, image_url, duration_seconds? }
export async function onRequestPost(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const b = await readJson(context.request);
  if (!b?.name) return badRequest('name er påkrevd');
  if (!b?.image_url) return badRequest('image_url er påkrevd');

  const duration = Math.max(2, toIntOrNull(b.duration_seconds) ?? 10);

  const row = await context.env.DB
    .prepare(
      'INSERT INTO sponsors (name, image_url, duration_seconds) VALUES (?, ?, ?) RETURNING *'
    )
    .bind(String(b.name).trim(), String(b.image_url).trim(), duration)
    .first();

  return json(row, { status: 201 });
}

// PUT /api/sponsors?id=1  { name?, image_url?, duration_seconds? }
export async function onRequestPut(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const url = new URL(context.request.url);
  const id = toIntOrNull(url.searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');

  const b = await readJson(context.request);
  if (!b) return badRequest('ugyldig JSON');

  const cur = await context.env.DB
    .prepare('SELECT * FROM sponsors WHERE id = ?')
    .bind(id)
    .first();
  if (!cur) return notFound('Sponsor finnes ikke');

  const name = b.name !== undefined ? String(b.name).trim() : cur.name;
  const imageUrl =
    b.image_url !== undefined ? String(b.image_url).trim() : cur.image_url;
  const duration =
    b.duration_seconds !== undefined
      ? Math.max(2, toIntOrNull(b.duration_seconds) ?? cur.duration_seconds)
      : cur.duration_seconds;

  const row = await context.env.DB
    .prepare(
      'UPDATE sponsors SET name = ?, image_url = ?, duration_seconds = ? WHERE id = ? RETURNING *'
    )
    .bind(name, imageUrl, duration, id)
    .first();

  return json(row);
}

// DELETE /api/sponsors?id=1
export async function onRequestDelete(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const url = new URL(context.request.url);
  const id = toIntOrNull(url.searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');

  await context.env.DB.prepare('DELETE FROM sponsors WHERE id = ?').bind(id).run();
  return noContent();
}

export const onRequestOptions = handleOptions;
