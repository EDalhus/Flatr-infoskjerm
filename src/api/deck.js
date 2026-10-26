import { json, badRequest, handleOptions, toIntOrNull, safeJson } from './_shared.js';

// GET /api/deck?playlist=ID  -> lysbilder med elementer
// GET /api/deck?screen=ID    -> det samme for spillelisten kanalen viser
export async function onRequestGet({ request, env }) {
  const params = new URL(request.url).searchParams;
  let playlist = toIntOrNull(params.get('playlist'));
  const screen = toIntOrNull(params.get('screen'));
  if (!playlist && screen) {
    const row = await env.DB.prepare('SELECT playlist_id FROM screens WHERE id = ?').bind(screen).first();
    playlist = row?.playlist_id ?? null;
    if (!playlist) return json([]);
  }
  if (!playlist) return badRequest('playlist er påkrevd');

  const { results: slides } = await env.DB
    .prepare('SELECT * FROM deck_slides WHERE playlist_id = ? ORDER BY position ASC, id ASC')
    .bind(playlist)
    .all();

  const ids = (slides ?? []).map((s) => s.id);
  const bySlide = {};
  if (ids.length) {
    const marks = ids.map(() => '?').join(',');
    const { results: els } = await env.DB
      .prepare(
        `SELECT * FROM deck_elements WHERE slide_id IN (${marks}) ORDER BY slide_id ASC, z ASC, id ASC`
      )
      .bind(...ids)
      .all();
    for (const e of els ?? [])
      (bySlide[e.slide_id] ||= []).push({ ...e, config: safeJson(e.config, {}) });
  }

  return json(
    (slides ?? []).map((s) => ({
      ...s,
      background: safeJson(s.background, { type: 'color', color: '#0f2733' }),
      elements: bySlide[s.id] ?? []
    }))
  );
}

export const onRequestOptions = handleOptions;
