import { json, badRequest, notFound, handleOptions, requireAdmin, toIntOrNull, safeJson } from './_shared.js';

// Versjonshistorikk per presentasjon. Et øyeblikksbilde (alle lysbilder med
// elementer) lagres automatisk når redigeringen har roet seg (se
// scheduleVersion), før gjenoppretting, og ved publisering (godkjenning).
//
//   GET  /api/versions?playlist=1         -> versjonene (uten data, med forhåndsvisning av første lysbilde)
//   GET  /api/versions?id=5                -> én versjon med data
//   POST /api/versions?id=5&restore=1      -> gjenopprett (nåværende lagres først)

const KEEP = 60; // versjoner per presentasjon (publiserte beholdes alltid)
const QUIET_MS = 90_000; // så lenge redigeringen må ha stått stille

const SLIDE_FIELDS = ['id', 'position', 'name', 'duration_seconds', 'transition', 'transition_ms', 'background', 'enabled', 'active_from', 'active_to', 'active_days', 'active_from_date', 'active_to_date'];
const EL_FIELDS = ['id', 'z', 'kind', 'x', 'y', 'w', 'h', 'rotation', 'config'];
const pick = (row, fields) => Object.fromEntries(fields.filter((f) => f in row).map((f) => [f, row[f]]));

/** Presentasjonen slik den er nå: { name, orientation, slides: [{ …, elements }] }. */
export async function currentDeck(env, playlistId) {
  const pl = await env.DB.prepare('SELECT name, orientation FROM playlists WHERE id = ?').bind(playlistId).first();
  if (!pl) return null;
  const { results: slides } = await env.DB.prepare('SELECT * FROM deck_slides WHERE playlist_id = ? ORDER BY position, id').bind(playlistId).all();
  const ids = (slides || []).map((s) => s.id);
  const bySlide = {};
  if (ids.length) {
    const { results: els } = await env.DB.prepare(`SELECT * FROM deck_elements WHERE slide_id IN (${ids.map(() => '?').join(',')}) ORDER BY z, id`)
      .bind(...ids)
      .all();
    for (const e of els || []) (bySlide[e.slide_id] ||= []).push(pick(e, EL_FIELDS));
  }
  return { name: pl.name, orientation: pl.orientation, slides: (slides || []).map((s) => ({ ...pick(s, SLIDE_FIELDS), elements: bySlide[s.id] || [] })) };
}

/** Lagrer en versjon. Hopper over hvis den er lik forrige (unntatt publisering). -> id | null */
export async function saveVersion(env, playlistId, { author = null, kind = 'auto' } = {}) {
  const deck = await currentDeck(env, playlistId);
  if (!deck) return null;
  const data = JSON.stringify(deck);
  const last = await env.DB.prepare('SELECT id, data FROM playlist_versions WHERE playlist_id = ? ORDER BY id DESC LIMIT 1').bind(playlistId).first();
  if (last?.data === data && kind !== 'published') return last.id;
  const row = await env.DB.prepare('INSERT INTO playlist_versions (playlist_id, author, kind, data, slide_count) VALUES (?, ?, ?, ?, ?) RETURNING id')
    .bind(playlistId, author, kind, data, deck.slides.length)
    .first();
  // Rydd: behold de siste KEEP, men aldri den som er publisert.
  await env.DB.prepare(
    `DELETE FROM playlist_versions WHERE playlist_id = ?1 AND id NOT IN (SELECT id FROM playlist_versions WHERE playlist_id = ?1 ORDER BY id DESC LIMIT ${KEEP})
       AND id NOT IN (SELECT COALESCE(published_version_id, 0) FROM playlists WHERE id = ?1)`
  )
    .bind(playlistId)
    .run();
  return row.id;
}

// Debounce per presentasjon (i minnet): lagre når det har vært stille en stund.
const timers = new Map();
export function scheduleVersion(env, playlistId, author) {
  if (!playlistId) return;
  const key = `${env.TENANT?.slug || '-'}:${playlistId}`;
  clearTimeout(timers.get(key));
  const t = setTimeout(() => {
    timers.delete(key);
    saveVersion(env, playlistId, { author }).catch((err) => console.warn('[versions]', err.message));
  }, QUIET_MS);
  t.unref?.();
  timers.set(key, t);
}

/** Erstatter presentasjonens lysbilder med en versjon (samme id-er, så widgeter beholder data). */
export async function restoreVersion(env, versionId, author) {
  const v = await env.DB.prepare('SELECT * FROM playlist_versions WHERE id = ?').bind(versionId).first();
  if (!v) return null;
  const deck = safeJson(v.data, null);
  if (!deck) return null;
  await saveVersion(env, v.playlist_id, { author, kind: 'before_restore' });
  const { results: old } = await env.DB.prepare('SELECT id FROM deck_slides WHERE playlist_id = ?').bind(v.playlist_id).all();
  for (const s of old || []) await env.DB.prepare('DELETE FROM deck_elements WHERE slide_id = ?').bind(s.id).run();
  await env.DB.prepare('DELETE FROM deck_slides WHERE playlist_id = ?').bind(v.playlist_id).run();
  for (const s of deck.slides) {
    const cols = SLIDE_FIELDS.filter((f) => f in s);
    await env.DB.prepare(`INSERT INTO deck_slides (playlist_id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`)
      .bind(v.playlist_id, ...cols.map((f) => s[f]))
      .run();
    for (const e of s.elements || []) {
      await env.DB.prepare(`INSERT INTO deck_elements (slide_id, ${EL_FIELDS.join(', ')}) VALUES (?, ${EL_FIELDS.map(() => '?').join(', ')})`)
        .bind(s.id, ...EL_FIELDS.map((f) => e[f] ?? null))
        .run();
    }
  }
  await env.DB.prepare(`UPDATE playlists SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).bind(v.playlist_id).run();
  await saveVersion(env, v.playlist_id, { author, kind: 'restore' });
  return v.playlist_id;
}

/** Første lysbilde (til miniatyr), med parsede felt. */
function previewOf(data) {
  const deck = safeJson(data, null);
  const s = deck?.slides?.[0];
  if (!s) return null;
  return { ...s, background: safeJson(s.background, null), elements: (s.elements || []).map((e) => ({ ...e, config: safeJson(e.config, {}) })) };
}

export async function onRequestGet({ request, env }) {
  const params = new URL(request.url).searchParams;
  const id = toIntOrNull(params.get('id'));
  if (id) {
    const v = await env.DB.prepare('SELECT * FROM playlist_versions WHERE id = ?').bind(id).first();
    if (!v) return notFound('Versjonen finnes ikke');
    const deck = safeJson(v.data, {});
    return json({
      ...v,
      data: undefined,
      deck: {
        ...deck,
        slides: (deck.slides || []).map((s) => ({ ...s, background: safeJson(s.background, null), elements: (s.elements || []).map((e) => ({ ...e, config: safeJson(e.config, {}) })) }))
      }
    });
  }
  const playlistId = toIntOrNull(params.get('playlist'));
  if (!playlistId) return badRequest('playlist er påkrevd');
  const pl = await env.DB.prepare('SELECT published_version_id FROM playlists WHERE id = ?').bind(playlistId).first();
  const { results } = await env.DB.prepare('SELECT id, created_at, author, kind, slide_count, data FROM playlist_versions WHERE playlist_id = ? ORDER BY id DESC LIMIT 100')
    .bind(playlistId)
    .all();
  return json(
    (results || []).map((v) => ({ id: v.id, created_at: v.created_at, author: v.author, kind: v.kind, slide_count: v.slide_count, published: v.id === pl?.published_version_id, preview: previewOf(v.data) }))
  );
}

export async function onRequestPost(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const { request, env } = context;
  const params = new URL(request.url).searchParams;
  const id = toIntOrNull(params.get('id'));
  if (!id || !params.get('restore')) return badRequest('id og restore er påkrevd');
  const author = env.SESSION_USER?.name || env.SESSION_USER?.email || null;
  const playlistId = await restoreVersion(env, id, author);
  if (!playlistId) return notFound('Versjonen finnes ikke');
  return json({ ok: true, playlist_id: playlistId });
}

export const onRequestOptions = handleOptions;
