import {
  json,
  noContent,
  badRequest,
  notFound,
  handleOptions,
  readJson,
  requireAdmin,
  toIntOrNull,
  safeJson,
  moveToTrash
} from './_shared.js';

const KINDS = ['slide', 'screen'];

// GET /api/templates            -> alle
// GET /api/templates?kind=slide -> filtrert
// GET /api/templates?id=1       -> én (med parset payload)
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const id = toIntOrNull(url.searchParams.get('id'));
  const kind = url.searchParams.get('kind');

  if (id) {
    const row = await env.DB.prepare('SELECT * FROM templates WHERE id = ?').bind(id).first();
    if (!row) return notFound('Mal finnes ikke');
    return json({ ...row, payload: safeJson(row.payload, {}) });
  }

  const stmt = kind
    ? env.DB.prepare('SELECT * FROM templates WHERE kind = ? ORDER BY name').bind(kind)
    : env.DB.prepare('SELECT * FROM templates ORDER BY kind, name');
  const { results } = await stmt.all();
  return json((results ?? []).map((r) => ({ ...r, payload: safeJson(r.payload, {}) })));
}

// POST /api/templates  { name, kind, payload }
export async function onRequestPost(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;
  const b = await readJson(context.request);
  if (!b?.name) return badRequest('name er påkrevd');
  const kind = KINDS.includes(b.kind) ? b.kind : 'slide';

  const row = await context.env.DB
    .prepare('INSERT INTO templates (name, kind, payload) VALUES (?, ?, ?) RETURNING *')
    .bind(String(b.name).trim(), kind, JSON.stringify(safeJson(b.payload, {})))
    .first();
  return json({ ...row, payload: safeJson(row.payload, {}) }, { status: 201 });
}

// DELETE /api/templates?id=1
export async function onRequestDelete(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;
  const id = toIntOrNull(new URL(context.request.url).searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');
  const row = await context.env.DB.prepare('SELECT * FROM templates WHERE id = ?').bind(id).first();
  if (row) {
    await moveToTrash(context.env, 'template', row.name, { row });
    await context.env.DB.prepare('DELETE FROM templates WHERE id = ?').bind(id).run();
  }
  return noContent();
}

export const onRequestOptions = handleOptions;
