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

const STATUSES = ['scheduled', 'live', 'done', 'cancelled'];

function normalizeStatus(value, fallback = 'scheduled') {
  return STATUSES.includes(value) ? value : fallback;
}

// GET /api/schedule            -> alle programposter
// GET /api/schedule?stage=...  -> filtrert på scene
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const stage = url.searchParams.get('stage');

  const stmt = stage
    ? env.DB.prepare(
        'SELECT * FROM schedule WHERE stage = ? ORDER BY start_time ASC, id ASC'
      ).bind(stage)
    : env.DB.prepare('SELECT * FROM schedule ORDER BY start_time ASC, id ASC');

  const { results } = await stmt.all();
  return json(results);
}

// POST /api/schedule  { title, description?, start_time, end_time?, stage?, status? }
export async function onRequestPost(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const b = await readJson(context.request);
  if (!b?.title) return badRequest('title er påkrevd');
  if (!b?.start_time) return badRequest('start_time er påkrevd');

  const row = await context.env.DB
    .prepare(
      `INSERT INTO schedule (title, description, start_time, end_time, stage, status)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING *`
    )
    .bind(
      String(b.title).trim(),
      b.description ? String(b.description).trim() : null,
      b.start_time,
      b.end_time || null,
      b.stage ? String(b.stage).trim() : null,
      normalizeStatus(b.status)
    )
    .first();

  return json(row, { status: 201 });
}

// PUT /api/schedule?id=1  { ...felter som skal endres }
export async function onRequestPut(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const url = new URL(context.request.url);
  const id = toIntOrNull(url.searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');

  const b = await readJson(context.request);
  if (!b) return badRequest('ugyldig JSON');

  const cur = await context.env.DB
    .prepare('SELECT * FROM schedule WHERE id = ?')
    .bind(id)
    .first();
  if (!cur) return notFound('Programpost finnes ikke');

  const merged = {
    title: b.title !== undefined ? String(b.title).trim() : cur.title,
    description:
      b.description !== undefined
        ? b.description
          ? String(b.description).trim()
          : null
        : cur.description,
    start_time: b.start_time !== undefined ? b.start_time : cur.start_time,
    end_time: b.end_time !== undefined ? b.end_time || null : cur.end_time,
    stage:
      b.stage !== undefined ? (b.stage ? String(b.stage).trim() : null) : cur.stage,
    status:
      b.status !== undefined ? normalizeStatus(b.status, cur.status) : cur.status
  };

  const row = await context.env.DB
    .prepare(
      `UPDATE schedule
          SET title = ?, description = ?, start_time = ?, end_time = ?, stage = ?, status = ?
        WHERE id = ? RETURNING *`
    )
    .bind(
      merged.title,
      merged.description,
      merged.start_time,
      merged.end_time,
      merged.stage,
      merged.status,
      id
    )
    .first();

  return json(row);
}

// DELETE /api/schedule?id=1
export async function onRequestDelete(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const url = new URL(context.request.url);
  const id = toIntOrNull(url.searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');

  await context.env.DB.prepare('DELETE FROM schedule WHERE id = ?').bind(id).run();
  return noContent();
}

export const onRequestOptions = handleOptions;
