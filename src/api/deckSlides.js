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

const TRANSITIONS = ['none', 'fade', 'dissolve', 'push-left', 'push-up'];
const normTransition = (v, f = 'fade') => (TRANSITIONS.includes(v) ? v : f);
const DAYPART = ['active_from', 'active_to', 'active_days', 'active_from_date', 'active_to_date'];
const daypartFrom = (b, cur = {}) => {
  const out = {};
  for (const k of DAYPART) {
    out[k] = b?.[k] !== undefined ? (b[k] ? String(b[k]).trim() : null) : (cur[k] ?? null);
  }
  return out;
};
const bgString = (v, fallback = '{"type":"color","color":"#0f2733"}') => {
  const o = safeJson(v, null);
  return o && typeof o === 'object' ? JSON.stringify(o) : fallback;
};

async function insertElements(env, slideId, elements) {
  if (!elements?.length) return;
  const stmt = env.DB.prepare(
    `INSERT INTO deck_elements (slide_id, z, kind, x, y, w, h, rotation, config)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  await env.DB.batch(
    elements.map((e, i) =>
      stmt.bind(
        slideId,
        Number.isFinite(e.z) ? e.z : i,
        e.kind || 'text',
        Number(e.x) || 0,
        Number(e.y) || 0,
        Number(e.w) || 30,
        Number(e.h) || 20,
        Number(e.rotation) || 0,
        JSON.stringify(safeJson(e.config, {}))
      )
    )
  );
}

// GET /api/deck-slides?id=1  -> ett lysbilde med elementer
export async function onRequestGet({ request, env }) {
  const id = toIntOrNull(new URL(request.url).searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');
  const s = await env.DB.prepare('SELECT * FROM deck_slides WHERE id = ?').bind(id).first();
  if (!s) return notFound('Lysbilde finnes ikke');
  const { results: els } = await env.DB
    .prepare('SELECT * FROM deck_elements WHERE slide_id = ? ORDER BY z ASC, id ASC')
    .bind(id)
    .all();
  return json({
    ...s,
    background: safeJson(s.background, { type: 'color', color: '#0f2733' }),
    elements: (els ?? []).map((e) => ({ ...e, config: safeJson(e.config, {}) }))
  });
}

// POST /api/deck-slides
//   { screen_id, position? }           -> nytt tomt lysbilde
//   { duplicate_of }                   -> klon lysbilde + elementer
//   { screen_id, template_id }         -> fra mal
export async function onRequestPost(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;
  const b = await readJson(context.request);
  const env = context.env;

  const cloneId = toIntOrNull(b?.duplicate_of);
  if (cloneId) {
    const src = await env.DB.prepare('SELECT * FROM deck_slides WHERE id = ?').bind(cloneId).first();
    if (!src) return notFound('Lysbilde finnes ikke');
    await env.DB
      .prepare('UPDATE deck_slides SET position = position + 1 WHERE screen_id = ? AND position > ?')
      .bind(src.screen_id, src.position)
      .run();
    const copy = await env.DB
      .prepare(
        `INSERT INTO deck_slides
           (screen_id, position, name, duration_seconds, transition, transition_ms, background, enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1) RETURNING *`
      )
      .bind(
        src.screen_id,
        src.position + 1,
        src.name ? `${src.name} (kopi)` : null,
        src.duration_seconds,
        src.transition,
        src.transition_ms,
        src.background
      )
      .first();
    const { results: els } = await env.DB
      .prepare('SELECT * FROM deck_elements WHERE slide_id = ?')
      .bind(cloneId)
      .all();
    await insertElements(
      env,
      copy.id,
      (els ?? []).map((e) => ({ ...e, config: safeJson(e.config, {}) }))
    );
    return json({ ...copy, background: safeJson(copy.background, {}), elements: [] }, { status: 201 });
  }

  const screenId = toIntOrNull(b?.screen_id);
  if (!screenId) return badRequest('screen_id er påkrevd');
  const screen = await env.DB.prepare('SELECT id FROM screens WHERE id = ?').bind(screenId).first();
  if (!screen) return notFound('Skjerm finnes ikke');

  const maxRow = await env.DB
    .prepare('SELECT COALESCE(MAX(position), -1) AS m FROM deck_slides WHERE screen_id = ?')
    .bind(screenId)
    .first();
  const position = toIntOrNull(b?.position) ?? (maxRow?.m ?? -1) + 1;

  const tplId = toIntOrNull(b?.template_id);
  let tpl = null;
  if (tplId) {
    const row = await env.DB.prepare('SELECT * FROM templates WHERE id = ?').bind(tplId).first();
    tpl = row ? safeJson(row.payload, {}) : null;
  }

  const slide = await env.DB
    .prepare(
      `INSERT INTO deck_slides
         (screen_id, position, name, duration_seconds, transition, transition_ms, background, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1) RETURNING *`
    )
    .bind(
      screenId,
      position,
      tpl?.name ?? b?.name ?? null,
      toIntOrNull(tpl?.duration_seconds) ?? 15,
      normTransition(tpl?.transition),
      toIntOrNull(tpl?.transition_ms) ?? 600,
      bgString(tpl?.background)
    )
    .first();

  if (tpl?.elements?.length) await insertElements(env, slide.id, tpl.elements);

  return json(
    {
      ...slide,
      background: safeJson(slide.background, {}),
      elements: []
    },
    { status: 201 }
  );
}

// PUT /api/deck-slides?id=1
export async function onRequestPut(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;
  const id = toIntOrNull(new URL(context.request.url).searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');
  const b = await readJson(context.request);
  if (!b) return badRequest('ugyldig JSON');

  const cur = await context.env.DB.prepare('SELECT * FROM deck_slides WHERE id = ?').bind(id).first();
  if (!cur) return notFound('Lysbilde finnes ikke');

  const dp = daypartFrom(b, cur);
  const row = await context.env.DB
    .prepare(
      `UPDATE deck_slides SET
         position = ?, name = ?, duration_seconds = ?, transition = ?, transition_ms = ?,
         background = ?, enabled = ?,
         active_from = ?, active_to = ?, active_days = ?, active_from_date = ?, active_to_date = ?
       WHERE id = ? RETURNING *`
    )
    .bind(
      b.position !== undefined ? toIntOrNull(b.position) ?? cur.position : cur.position,
      b.name !== undefined ? (b.name ? String(b.name).trim() : null) : cur.name,
      b.duration_seconds !== undefined
        ? Math.max(2, toIntOrNull(b.duration_seconds) ?? cur.duration_seconds)
        : cur.duration_seconds,
      b.transition !== undefined ? normTransition(b.transition, cur.transition) : cur.transition,
      b.transition_ms !== undefined
        ? Math.max(0, toIntOrNull(b.transition_ms) ?? cur.transition_ms)
        : cur.transition_ms,
      b.background !== undefined ? bgString(b.background, cur.background) : cur.background,
      b.enabled !== undefined ? (b.enabled ? 1 : 0) : cur.enabled,
      dp.active_from,
      dp.active_to,
      dp.active_days,
      dp.active_from_date,
      dp.active_to_date,
      id
    )
    .first();
  return json({ ...row, background: safeJson(row.background, {}) });
}

// DELETE /api/deck-slides?id=1  -> papirkurv
export async function onRequestDelete(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;
  const id = toIntOrNull(new URL(context.request.url).searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');

  const row = await context.env.DB.prepare('SELECT * FROM deck_slides WHERE id = ?').bind(id).first();
  if (row) {
    const { results: els } = await context.env.DB
      .prepare('SELECT * FROM deck_elements WHERE slide_id = ?')
      .bind(id)
      .all();
    await moveToTrash(context.env, 'deck_slide', row.name || 'Lysbilde', { row, elements: els ?? [] });
    await context.env.DB.prepare('DELETE FROM deck_elements WHERE slide_id = ?').bind(id).run();
    await context.env.DB.prepare('DELETE FROM deck_slides WHERE id = ?').bind(id).run();
  }
  return noContent();
}

export const onRequestOptions = handleOptions;
