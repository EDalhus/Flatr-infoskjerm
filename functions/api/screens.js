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

// GET /api/screens        -> alle skjermer
// GET /api/screens?id=1   -> én skjerm
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const id = toIntOrNull(url.searchParams.get('id'));

  if (id) {
    const row = await env.DB.prepare('SELECT * FROM screens WHERE id = ?').bind(id).first();
    return row ? json(row) : notFound('Skjerm finnes ikke');
  }

  const { results } = await env.DB
    .prepare('SELECT * FROM screens ORDER BY name ASC')
    .all();
  return json(results);
}

// POST /api/screens  { name, location? }
export async function onRequestPost(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const body = await readJson(context.request);
  if (!body?.name) return badRequest('name er påkrevd');

  const row = await context.env.DB
    .prepare('INSERT INTO screens (name, location) VALUES (?, ?) RETURNING *')
    .bind(String(body.name).trim(), body.location ? String(body.location).trim() : null)
    .first();

  return json(row, { status: 201 });
}

// PUT /api/screens?id=1  { name?, location? }
export async function onRequestPut(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const url = new URL(context.request.url);
  const id = toIntOrNull(url.searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');

  const body = await readJson(context.request);
  if (!body) return badRequest('ugyldig JSON');

  const existing = await context.env.DB
    .prepare('SELECT * FROM screens WHERE id = ?')
    .bind(id)
    .first();
  if (!existing) return notFound('Skjerm finnes ikke');

  const name = body.name !== undefined ? String(body.name).trim() : existing.name;
  const location =
    body.location !== undefined
      ? body.location
        ? String(body.location).trim()
        : null
      : existing.location;

  const row = await context.env.DB
    .prepare('UPDATE screens SET name = ?, location = ? WHERE id = ? RETURNING *')
    .bind(name, location, id)
    .first();

  return json(row);
}

// DELETE /api/screens?id=1
export async function onRequestDelete(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const url = new URL(context.request.url);
  const id = toIntOrNull(url.searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');

  await context.env.DB.prepare('DELETE FROM screens WHERE id = ?').bind(id).run();
  return noContent();
}

export const onRequestOptions = handleOptions;
