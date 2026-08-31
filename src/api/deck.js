import { json, badRequest, handleOptions, toIntOrNull, safeJson } from './_shared.js';

// GET /api/deck?screen=ID  -> lysbilder med elementer
export async function onRequestGet({ request, env }) {
  const screen = toIntOrNull(new URL(request.url).searchParams.get('screen'));
  if (!screen) return badRequest('screen er påkrevd');

  const { results: slides } = await env.DB
    .prepare('SELECT * FROM deck_slides WHERE screen_id = ? ORDER BY position ASC, id ASC')
    .bind(screen)
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
