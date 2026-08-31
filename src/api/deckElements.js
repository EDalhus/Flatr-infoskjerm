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

const KINDS = [
  'text',
  'image',
  'shape',
  'clock',
  'countdown',
  'program',
  'qr',
  'video',
  'web',
  'sponsors'
];
const normKind = (v) => (KINDS.includes(v) ? v : 'text');
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

// POST /api/deck-elements  { slide_id, kind, x,y,w,h,z,rotation,config }
export async function onRequestPost(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;
  const b = await readJson(context.request);
  const slideId = toIntOrNull(b?.slide_id);
  if (!slideId) return badRequest('slide_id er påkrevd');

  const slide = await context.env.DB
    .prepare('SELECT id FROM deck_slides WHERE id = ?')
    .bind(slideId)
    .first();
  if (!slide) return notFound('Lysbilde finnes ikke');

  let z = toIntOrNull(b?.z);
  if (z === null) {
    const max = await context.env.DB
      .prepare('SELECT COALESCE(MAX(z), -1) AS m FROM deck_elements WHERE slide_id = ?')
      .bind(slideId)
      .first();
    z = (max?.m ?? -1) + 1;
  }

  const row = await context.env.DB
    .prepare(
      `INSERT INTO deck_elements (slide_id, z, kind, x, y, w, h, rotation, config)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
    )
    .bind(
      slideId,
      z,
      normKind(b?.kind),
      num(b?.x, 15),
      num(b?.y, 15),
      num(b?.w, 40),
      num(b?.h, 25),
      num(b?.rotation, 0),
      JSON.stringify(safeJson(b?.config, {}))
    )
    .first();
  return json({ ...row, config: safeJson(row.config, {}) }, { status: 201 });
}

// PUT /api/deck-elements?id=1
export async function onRequestPut(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;
  const id = toIntOrNull(new URL(context.request.url).searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');
  const b = await readJson(context.request);
  if (!b) return badRequest('ugyldig JSON');

  const cur = await context.env.DB
    .prepare('SELECT * FROM deck_elements WHERE id = ?')
    .bind(id)
    .first();
  if (!cur) return notFound('Element finnes ikke');

  const row = await context.env.DB
    .prepare(
      `UPDATE deck_elements SET z = ?, kind = ?, x = ?, y = ?, w = ?, h = ?, rotation = ?, config = ?
       WHERE id = ? RETURNING *`
    )
    .bind(
      b.z !== undefined ? toIntOrNull(b.z) ?? cur.z : cur.z,
      b.kind !== undefined ? normKind(b.kind) : cur.kind,
      b.x !== undefined ? num(b.x, cur.x) : cur.x,
      b.y !== undefined ? num(b.y, cur.y) : cur.y,
      b.w !== undefined ? num(b.w, cur.w) : cur.w,
      b.h !== undefined ? num(b.h, cur.h) : cur.h,
      b.rotation !== undefined ? num(b.rotation, cur.rotation) : cur.rotation,
      b.config !== undefined ? JSON.stringify(safeJson(b.config, {})) : cur.config,
      id
    )
    .first();
  return json({ ...row, config: safeJson(row.config, {}) });
}

// DELETE /api/deck-elements?id=1
export async function onRequestDelete(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;
  const id = toIntOrNull(new URL(context.request.url).searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');
  const row = await context.env.DB.prepare('SELECT * FROM deck_elements WHERE id = ?').bind(id).first();
  if (row) {
    await moveToTrash(context.env, 'deck_element', row.kind, { row });
    await context.env.DB.prepare('DELETE FROM deck_elements WHERE id = ?').bind(id).run();
  }
  return noContent();
}

export const onRequestOptions = handleOptions;
