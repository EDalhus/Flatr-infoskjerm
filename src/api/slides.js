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

const TYPES = [
  'program',
  'sponsors',
  'message',
  'clock',
  'image',
  'layout',
  'video',
  'web',
  'qr',
  'countdown',
  'playlist'
];
const normType = (v) => (TYPES.includes(v) ? v : 'program');

const DAYPART = ['active_from', 'active_to', 'active_days', 'active_from_date', 'active_to_date'];
const daypartFrom = (b, cur = {}) => {
  const out = {};
  for (const k of DAYPART) {
    out[k] = b?.[k] !== undefined ? (b[k] ? String(b[k]).trim() : null) : (cur[k] ?? null);
  }
  return out;
};
const normZone = (v) => {
  const z = String(v || 'a')
    .trim()
    .toLowerCase();
  return /^[a-z]$/.test(z) ? z : 'a';
};

function serializeConfig(value) {
  const obj = safeJson(value, {});
  return JSON.stringify(obj);
}

// GET /api/slides?screen=1   -> alle slides for én skjerm (ordnet)
// GET /api/slides?id=5       -> én slide
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const id = toIntOrNull(url.searchParams.get('id'));
  const screen = toIntOrNull(url.searchParams.get('screen'));

  if (id) {
    const row = await env.DB.prepare('SELECT * FROM screen_slides WHERE id = ?').bind(id).first();
    if (!row) return notFound('Slide finnes ikke');
    return json({ ...row, config: safeJson(row.config, {}) });
  }
  if (!screen) return badRequest('screen eller id er påkrevd');

  const { results } = await env.DB
    .prepare(
      'SELECT * FROM screen_slides WHERE screen_id = ? ORDER BY zone ASC, position ASC, id ASC'
    )
    .bind(screen)
    .all();
  return json((results ?? []).map((r) => ({ ...r, config: safeJson(r.config, {}) })));
}

// POST /api/slides  { screen_id, zone?, type?, title?, duration_seconds?, config?, position? }
export async function onRequestPost(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const b = await readJson(context.request);
  const screenId = toIntOrNull(b?.screen_id);
  if (!screenId) return badRequest('screen_id er påkrevd');

  const screen = await context.env.DB
    .prepare('SELECT id FROM screens WHERE id = ?')
    .bind(screenId)
    .first();
  if (!screen) return notFound('Skjerm finnes ikke');

  const zone = normZone(b?.zone);
  let position = toIntOrNull(b?.position);
  if (position === null) {
    const max = await context.env.DB
      .prepare('SELECT COALESCE(MAX(position), -1) AS m FROM screen_slides WHERE screen_id = ? AND zone = ?')
      .bind(screenId, zone)
      .first();
    position = (max?.m ?? -1) + 1;
  }

  const playlistId = toIntOrNull(b?.playlist_id);
  const type = playlistId ? 'playlist' : normType(b?.type);
  const dp = daypartFrom(b);

  const row = await context.env.DB
    .prepare(
      `INSERT INTO screen_slides
         (screen_id, zone, position, type, title, duration_seconds, enabled, config, playlist_id,
          active_from, active_to, active_days, active_from_date, active_to_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
    )
    .bind(
      screenId,
      zone,
      position,
      type,
      b?.title ? String(b.title).trim() : null,
      Math.max(3, toIntOrNull(b?.duration_seconds) ?? 15),
      b?.enabled === false ? 0 : 1,
      serializeConfig(b?.config),
      playlistId,
      dp.active_from,
      dp.active_to,
      dp.active_days,
      dp.active_from_date,
      dp.active_to_date
    )
    .first();
  return json({ ...row, config: safeJson(row.config, {}) }, { status: 201 });
}

// PUT /api/slides?id=5  { ...felter }
export async function onRequestPut(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const id = toIntOrNull(new URL(context.request.url).searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');

  const b = await readJson(context.request);
  if (!b) return badRequest('ugyldig JSON');

  const cur = await context.env.DB
    .prepare('SELECT * FROM screen_slides WHERE id = ?')
    .bind(id)
    .first();
  if (!cur) return notFound('Slide finnes ikke');

  const dp = daypartFrom(b, cur);
  const merged = {
    zone: b.zone !== undefined ? normZone(b.zone) : cur.zone,
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
      `UPDATE screen_slides
          SET zone = ?, position = ?, type = ?, title = ?, duration_seconds = ?, enabled = ?, config = ?,
              active_from = ?, active_to = ?, active_days = ?, active_from_date = ?, active_to_date = ?
        WHERE id = ? RETURNING *`
    )
    .bind(
      merged.zone,
      merged.position,
      merged.type,
      merged.title,
      merged.duration_seconds,
      merged.enabled,
      merged.config,
      dp.active_from,
      dp.active_to,
      dp.active_days,
      dp.active_from_date,
      dp.active_to_date,
      id
    )
    .first();
  return json({ ...row, config: safeJson(row.config, {}) });
}

// DELETE /api/slides?id=5
export async function onRequestDelete(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const id = toIntOrNull(new URL(context.request.url).searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');

  const row = await context.env.DB.prepare('SELECT * FROM screen_slides WHERE id = ?').bind(id).first();
  if (row) {
    await moveToTrash(context.env, 'screen_slide', row.title || row.type, { row });
    await context.env.DB.prepare('DELETE FROM screen_slides WHERE id = ?').bind(id).run();
  }
  return noContent();
}

export const onRequestOptions = handleOptions;
