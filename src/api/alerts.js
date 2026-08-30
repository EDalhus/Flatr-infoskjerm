import {
  json,
  noContent,
  badRequest,
  handleOptions,
  readJson,
  requireAdmin,
  toIntOrNull
} from './_shared.js';

// GET /api/alerts            -> aktive hastemeldinger
// GET /api/alerts?all=1      -> alle (også arkiverte)
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const all = url.searchParams.get('all');

  const stmt = all
    ? env.DB.prepare('SELECT * FROM alerts ORDER BY created_at DESC, id DESC')
    : env.DB.prepare(
        'SELECT * FROM alerts WHERE active = 1 ORDER BY created_at DESC, id DESC'
      );

  const { results } = await stmt.all();
  return json(results);
}

// POST /api/alerts  { message, target_screen_id? }
// target_screen_id = null/utelatt  -> vises på ALLE skjermer
export async function onRequestPost(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const b = await readJson(context.request);
  if (!b?.message || !String(b.message).trim()) {
    return badRequest('message er påkrevd');
  }

  const target = toIntOrNull(b.target_screen_id);

  const row = await context.env.DB
    .prepare(
      'INSERT INTO alerts (message, target_screen_id, active) VALUES (?, ?, 1) RETURNING *'
    )
    .bind(String(b.message).trim(), target)
    .first();

  return json(row, { status: 201 });
}

// DELETE /api/alerts?id=1   -> arkiver én melding (active = 0)
// DELETE /api/alerts?all=1  -> arkiver alle aktive meldinger
export async function onRequestDelete(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const url = new URL(context.request.url);
  const all = url.searchParams.get('all');
  const id = toIntOrNull(url.searchParams.get('id'));

  if (all) {
    await context.env.DB.prepare('UPDATE alerts SET active = 0 WHERE active = 1').run();
    return noContent();
  }
  if (!id) return badRequest('id eller all=1 er påkrevd');

  await context.env.DB
    .prepare('UPDATE alerts SET active = 0 WHERE id = ?')
    .bind(id)
    .run();
  return noContent();
}

export const onRequestOptions = handleOptions;
