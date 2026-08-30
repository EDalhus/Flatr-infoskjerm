import {
  json,
  noContent,
  badRequest,
  notFound,
  handleOptions,
  readJson,
  requireAdmin,
  toIntOrNull,
  safeJson
} from './_shared.js';

const LAYOUTS = ['solo', 'main-side', 'split', 'thirds', 'custom'];
const normLayout = (v, fallback = 'main-side') => (LAYOUTS.includes(v) ? v : fallback);
const ONLINE_MS = 90_000;

function decorate(row) {
  return {
    ...row,
    custom_layout: safeJson(row.custom_layout, null),
    online: row.last_seen ? Date.now() - Date.parse(row.last_seen) < ONLINE_MS : false
  };
}

const DEFAULT_SLIDES = [
  ['a', 0, 'program', 'Program', 20, '{"mode":"agenda","categoryIds":[],"max":10,"showCategory":true}'],
  ['b', 0, 'clock', 'Klokke', 10, '{"showDate":true,"showSeconds":false}'],
  ['b', 1, 'sponsors', 'Sponsorer', 15, '{}']
];

async function seedDefaultSlides(env, screenId) {
  const stmt = env.DB.prepare(
    `INSERT INTO screen_slides (screen_id, zone, position, type, title, duration_seconds, config)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  await env.DB.batch(
    DEFAULT_SLIDES.map(([zone, pos, type, title, dur, cfg]) =>
      stmt.bind(screenId, zone, pos, type, title, dur, cfg)
    )
  );
}

// GET /api/screens        -> alle skjermer (med slide_count + online)
// GET /api/screens?id=1   -> én skjerm
export async function onRequestGet({ request, env }) {
  const id = toIntOrNull(new URL(request.url).searchParams.get('id'));

  if (id) {
    const row = await env.DB
      .prepare(
        `SELECT s.*, (SELECT COUNT(*) FROM screen_slides w WHERE w.screen_id = s.id) AS slide_count
           FROM screens s WHERE s.id = ?`
      )
      .bind(id)
      .first();
    return row ? json(decorate(row)) : notFound('Skjerm finnes ikke');
  }

  const { results } = await env.DB
    .prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM screen_slides w WHERE w.screen_id = s.id) AS slide_count
         FROM screens s ORDER BY s.name ASC`
    )
    .all();
  return json((results ?? []).map(decorate));
}

// POST /api/screens
//   { name, location?, layout? }              -> ny skjerm (+ standard slides)
//   { duplicate_of: <id>, name? }             -> klon skjerm inkl. alle slides
export async function onRequestPost(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const b = await readJson(context.request);
  const cloneId = toIntOrNull(b?.duplicate_of);

  if (cloneId) {
    const src = await context.env.DB.prepare('SELECT * FROM screens WHERE id = ?').bind(cloneId).first();
    if (!src) return notFound('Skjerm å kopiere finnes ikke');

    const copy = await context.env.DB
      .prepare(
        `INSERT INTO screens (name, location, layout, custom_layout, rotation_seconds)
         VALUES (?, ?, ?, ?, ?) RETURNING *`
      )
      .bind(
        b?.name ? String(b.name).trim() : `${src.name} (kopi)`,
        src.location,
        src.layout,
        src.custom_layout,
        src.rotation_seconds
      )
      .first();

    const { results: slides } = await context.env.DB
      .prepare('SELECT * FROM screen_slides WHERE screen_id = ?')
      .bind(cloneId)
      .all();

    if (slides?.length) {
      const stmt = context.env.DB.prepare(
        `INSERT INTO screen_slides (screen_id, zone, position, type, title, duration_seconds, enabled, config)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      await context.env.DB.batch(
        slides.map((s) =>
          stmt.bind(copy.id, s.zone, s.position, s.type, s.title, s.duration_seconds, s.enabled, s.config)
        )
      );
    }
    return json(decorate({ ...copy, slide_count: slides?.length ?? 0 }), { status: 201 });
  }

  if (!b?.name) return badRequest('name er påkrevd');
  const row = await context.env.DB
    .prepare(
      'INSERT INTO screens (name, location, layout) VALUES (?, ?, ?) RETURNING *'
    )
    .bind(String(b.name).trim(), b.location ? String(b.location).trim() : null, normLayout(b.layout))
    .first();

  await seedDefaultSlides(context.env, row.id);
  return json(decorate({ ...row, slide_count: DEFAULT_SLIDES.length }), { status: 201 });
}

// PUT /api/screens?id=1  { name?, location?, layout?, custom_layout?, rotation_seconds? }
export async function onRequestPut(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const id = toIntOrNull(new URL(context.request.url).searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');

  const b = await readJson(context.request);
  if (!b) return badRequest('ugyldig JSON');

  const cur = await context.env.DB.prepare('SELECT * FROM screens WHERE id = ?').bind(id).first();
  if (!cur) return notFound('Skjerm finnes ikke');

  const customLayout =
    b.custom_layout !== undefined
      ? b.custom_layout
        ? JSON.stringify(safeJson(b.custom_layout, null))
        : null
      : cur.custom_layout;

  const row = await context.env.DB
    .prepare(
      `UPDATE screens
          SET name = ?, location = ?, layout = ?, custom_layout = ?, rotation_seconds = ?
        WHERE id = ? RETURNING *`
    )
    .bind(
      b.name !== undefined ? String(b.name).trim() : cur.name,
      b.location !== undefined ? (b.location ? String(b.location).trim() : null) : cur.location,
      b.layout !== undefined ? normLayout(b.layout, cur.layout) : cur.layout,
      customLayout,
      b.rotation_seconds !== undefined
        ? Math.max(4, toIntOrNull(b.rotation_seconds) ?? cur.rotation_seconds)
        : cur.rotation_seconds,
      id
    )
    .first();

  const count = await context.env.DB
    .prepare('SELECT COUNT(*) AS c FROM screen_slides WHERE screen_id = ?')
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

  await context.env.DB.prepare('DELETE FROM screen_slides WHERE screen_id = ?').bind(id).run();
  await context.env.DB.prepare('DELETE FROM screens WHERE id = ?').bind(id).run();
  return noContent();
}

export const onRequestOptions = handleOptions;
