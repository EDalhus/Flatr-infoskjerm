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

const HEX = /^#[0-9a-fA-F]{6}$/;
const normColor = (v, fallback = '#1f5566') => (HEX.test(String(v || '')) ? String(v) : fallback);

// GET /api/categories
export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare('SELECT * FROM categories ORDER BY name ASC').all();
  return json(results);
}

// POST /api/categories  { name, color? }
export async function onRequestPost(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const b = await readJson(context.request);
  if (!b?.name) return badRequest('name er påkrevd');

  const row = await context.env.DB.prepare(
    'INSERT INTO categories (name, color) VALUES (?, ?) RETURNING *'
  )
    .bind(String(b.name).trim(), normColor(b.color))
    .first();
  return json(row, { status: 201 });
}

// PUT /api/categories?id=1  { name?, color? }
export async function onRequestPut(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const id = toIntOrNull(new URL(context.request.url).searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');

  const b = await readJson(context.request);
  const cur = await context.env.DB.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first();
  if (!cur) return notFound('Kategori finnes ikke');

  const row = await context.env.DB.prepare(
    'UPDATE categories SET name = ?, color = ? WHERE id = ? RETURNING *'
  )
    .bind(
      b?.name !== undefined ? String(b.name).trim() : cur.name,
      b?.color !== undefined ? normColor(b.color, cur.color) : cur.color,
      id
    )
    .first();
  return json(row);
}

// DELETE /api/categories?id=1  (programposter beholdes, category_id nulles)
export async function onRequestDelete(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const id = toIntOrNull(new URL(context.request.url).searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');

  await context.env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(id).run();
  return noContent();
}

export const onRequestOptions = handleOptions;
