import {
  json,
  noContent,
  badRequest,
  notFound,
  handleOptions,
  readJson,
  requireAdmin,
  toIntOrNull,
  effectiveStatus
} from './_shared.js';

const STATUSES = ['scheduled', 'live', 'done', 'cancelled'];
const normalizeStatus = (value, fallback = 'scheduled') =>
  STATUSES.includes(value) ? value : fallback;

const withEffective = (row) => ({ ...row, effective_status: effectiveStatus(row) });

// GET /api/schedule            -> alle programposter (+ effective_status)
// GET /api/schedule?stage=...  -> filtrert på scene
export async function onRequestGet({ request, env }) {
  const stage = new URL(request.url).searchParams.get('stage');
  const stmt = stage
    ? env.DB
        .prepare('SELECT * FROM schedule WHERE stage = ? ORDER BY start_time ASC, id ASC')
        .bind(stage)
    : env.DB.prepare('SELECT * FROM schedule ORDER BY start_time ASC, id ASC');

  const { results } = await stmt.all();
  return json((results ?? []).map(withEffective));
}

// POST /api/schedule
// { title, start_time, description?, end_time?, stage?, status?, auto_status?, category_id? }
export async function onRequestPost(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const b = await readJson(context.request);
  if (!b?.title) return badRequest('title er påkrevd');
  if (!b?.start_time) return badRequest('start_time er påkrevd');

  const auto = b.auto_status === undefined ? 1 : b.auto_status ? 1 : 0;

  const row = await context.env.DB
    .prepare(
      `INSERT INTO schedule (title, description, start_time, end_time, stage, status, auto_status, category_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
    )
    .bind(
      String(b.title).trim(),
      b.description ? String(b.description).trim() : null,
      b.start_time,
      b.end_time || null,
      b.stage ? String(b.stage).trim() : null,
      normalizeStatus(b.status),
      auto,
      toIntOrNull(b.category_id)
    )
    .first();
  return json(withEffective(row), { status: 201 });
}

// PUT /api/schedule?id=1  { ...felter som skal endres }
export async function onRequestPut(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const id = toIntOrNull(new URL(context.request.url).searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');

  const b = await readJson(context.request);
  if (!b) return badRequest('ugyldig JSON');

  const cur = await context.env.DB.prepare('SELECT * FROM schedule WHERE id = ?').bind(id).first();
  if (!cur) return notFound('Programpost finnes ikke');

  const merged = {
    title: b.title !== undefined ? String(b.title).trim() : cur.title,
    description:
      b.description !== undefined ? (b.description ? String(b.description).trim() : null) : cur.description,
    start_time: b.start_time !== undefined ? b.start_time : cur.start_time,
    end_time: b.end_time !== undefined ? b.end_time || null : cur.end_time,
    stage: b.stage !== undefined ? (b.stage ? String(b.stage).trim() : null) : cur.stage,
    status: b.status !== undefined ? normalizeStatus(b.status, cur.status) : cur.status,
    auto_status: b.auto_status !== undefined ? (b.auto_status ? 1 : 0) : cur.auto_status,
    category_id: b.category_id !== undefined ? toIntOrNull(b.category_id) : cur.category_id
  };

  const row = await context.env.DB
    .prepare(
      `UPDATE schedule
          SET title = ?, description = ?, start_time = ?, end_time = ?, stage = ?,
              status = ?, auto_status = ?, category_id = ?
        WHERE id = ? RETURNING *`
    )
    .bind(
      merged.title,
      merged.description,
      merged.start_time,
      merged.end_time,
      merged.stage,
      merged.status,
      merged.auto_status,
      merged.category_id,
      id
    )
    .first();
  return json(withEffective(row));
}

// DELETE /api/schedule?id=1
export async function onRequestDelete(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const id = toIntOrNull(new URL(context.request.url).searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');

  await context.env.DB.prepare('DELETE FROM schedule WHERE id = ?').bind(id).run();
  return noContent();
}

export const onRequestOptions = handleOptions;
