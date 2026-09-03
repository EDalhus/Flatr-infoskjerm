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

const ONLINE_MS = 90_000;
const normOrientation = (v, f = 'landscape') =>
  v === 'portrait' ? 'portrait' : v === 'landscape' ? 'landscape' : f;

function decorate(row) {
  return {
    ...row,
    online: row.last_seen ? Date.now() - Date.parse(row.last_seen) < ONLINE_MS : false
  };
}

const COUNT = `(SELECT COUNT(*) FROM deck_slides d WHERE d.screen_id = s.id) AS slide_count`;

async function seedFirstSlide(env, screenId, name) {
  const slide = await env.DB
    .prepare(
      `INSERT INTO deck_slides (screen_id, position, name, duration_seconds, background)
       VALUES (?, 0, 'Tittel', 15, '{"type":"gradient","from":"#1f5566","to":"#0f2733","angle":135}') RETURNING id`
    )
    .bind(screenId)
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
      JSON.stringify({
        text: name || 'Tittel',
        size: 120,
        weight: 800,
        align: 'center',
        valign: 'middle',
        color: '#ffffff'
      })
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

// GET /api/screens        -> alle (med slide_count + online)
// GET /api/screens?id=1   -> én
export async function onRequestGet({ request, env }) {
  const id = toIntOrNull(new URL(request.url).searchParams.get('id'));

  if (id) {
    const row = await env.DB
      .prepare(`SELECT s.*, ${COUNT} FROM screens s WHERE s.id = ?`)
      .bind(id)
      .first();
    return row ? json(decorate(row)) : notFound('Skjerm finnes ikke');
  }
  const { results } = await env.DB
    .prepare(`SELECT s.*, ${COUNT} FROM screens s ORDER BY s.name ASC`)
    .all();
  return json((results ?? []).map(decorate));
}

// POST /api/screens
//   { name, location?, orientation? }   -> ny skjerm (+ ett tomt lysbilde)
//   { duplicate_of, name? }             -> klon skjerm inkl. alle lysbilder/elementer
export async function onRequestPost(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;
  const env = context.env;
  const b = await readJson(context.request);
  const cloneId = toIntOrNull(b?.duplicate_of);

  if (cloneId) {
    const src = await env.DB.prepare('SELECT * FROM screens WHERE id = ?').bind(cloneId).first();
    if (!src) return notFound('Skjerm å kopiere finnes ikke');

    const copy = await env.DB
      .prepare(
        `INSERT INTO screens (name, location, orientation, rotation_seconds) VALUES (?, ?, ?, ?) RETURNING *`
      )
      .bind(
        b?.name ? String(b.name).trim() : `${src.name} (kopi)`,
        src.location,
        src.orientation,
        src.rotation_seconds
      )
      .first();

    const { results: slides } = await env.DB
      .prepare('SELECT * FROM deck_slides WHERE screen_id = ? ORDER BY position ASC, id ASC')
      .bind(cloneId)
      .all();
    for (const s of slides ?? []) {
      const ns = await env.DB
        .prepare(
          `INSERT INTO deck_slides
             (screen_id, position, name, duration_seconds, transition, transition_ms, background, enabled,
              active_from, active_to, active_days, active_from_date, active_to_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
        )
        .bind(
          copy.id,
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
      const { results: els } = await env.DB
        .prepare('SELECT * FROM deck_elements WHERE slide_id = ?')
        .bind(s.id)
        .all();
      if (els?.length) {
        const stmt = env.DB.prepare(
          `INSERT INTO deck_elements (slide_id, z, kind, x, y, w, h, rotation, config)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        await env.DB.batch(
          els.map((e) => stmt.bind(ns.id, e.z, e.kind, e.x, e.y, e.w, e.h, e.rotation, e.config))
        );
      }
    }
    return json(decorate({ ...copy, slide_count: slides?.length ?? 0 }), { status: 201 });
  }

  if (!b?.name) return badRequest('name er påkrevd');
  const row = await env.DB
    .prepare('INSERT INTO screens (name, location, orientation) VALUES (?, ?, ?) RETURNING *')
    .bind(
      String(b.name).trim(),
      b.location ? String(b.location).trim() : null,
      normOrientation(b.orientation)
    )
    .first();
  await seedFirstSlide(env, row.id, row.name);
  return json(decorate({ ...row, slide_count: 1 }), { status: 201 });
}

// PUT /api/screens?id=1  { name?, location?, orientation? }
export async function onRequestPut(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;
  const id = toIntOrNull(new URL(context.request.url).searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');
  const b = await readJson(context.request);
  if (!b) return badRequest('ugyldig JSON');

  const cur = await context.env.DB.prepare('SELECT * FROM screens WHERE id = ?').bind(id).first();
  if (!cur) return notFound('Skjerm finnes ikke');

  const row = await context.env.DB
    .prepare('UPDATE screens SET name = ?, location = ?, orientation = ? WHERE id = ? RETURNING *')
    .bind(
      b.name !== undefined ? String(b.name).trim() : cur.name,
      b.location !== undefined ? (b.location ? String(b.location).trim() : null) : cur.location,
      b.orientation !== undefined ? normOrientation(b.orientation, cur.orientation) : cur.orientation,
      id
    )
    .first();
  const count = await context.env.DB
    .prepare('SELECT COUNT(*) AS c FROM deck_slides WHERE screen_id = ?')
    .bind(id)
    .first();
  return json(decorate({ ...row, slide_count: count?.c ?? 0 }));
}

// DELETE /api/screens?id=1
export async function onRequestDelete(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;
  const id = toIntOrNull(new URL(context.request.url).searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');

  const row = await context.env.DB.prepare('SELECT * FROM screens WHERE id = ?').bind(id).first();
  if (row) {
    const { results: slides } = await context.env.DB
      .prepare('SELECT * FROM deck_slides WHERE screen_id = ?')
      .bind(id)
      .all();
    const ids = (slides ?? []).map((s) => s.id);
    let elements = [];
    if (ids.length) {
      const marks = ids.map(() => '?').join(',');
      const { results } = await context.env.DB
        .prepare(`SELECT * FROM deck_elements WHERE slide_id IN (${marks})`)
        .bind(...ids)
        .all();
      elements = results ?? [];
    }
    await moveToTrash(context.env, 'screen', row.name, { row, slides: slides ?? [], elements });
    await context.env.DB.prepare('DELETE FROM screens WHERE id = ?').bind(id).run();
  }
  return noContent();
}

export const onRequestOptions = handleOptions;
