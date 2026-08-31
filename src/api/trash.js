import {
  json,
  noContent,
  badRequest,
  notFound,
  handleOptions,
  requireAdmin,
  toIntOrNull,
  safeJson
} from './_shared.js';

const TABLE = {
  schedule: 'schedule',
  sponsor: 'sponsors',
  category: 'categories',
  template: 'templates',
  media: 'media',
  deck_element: 'deck_elements',
  screen_slide: 'screen_slides',
  playlist_item: 'playlist_items'
};

const KIND_LABEL = {
  schedule: 'Programpost',
  sponsor: 'Sponsor',
  category: 'Kategori',
  template: 'Mal',
  media: 'Mediefil',
  deck_slide: 'Lysbilde',
  deck_element: 'Widget',
  screen: 'Skjerm',
  screen_slide: 'Slide (gammel)',
  playlist_item: 'Spilleliste-element (gammel)'
};

async function insertRow(env, table, row, keepId) {
  const cols = Object.keys(row).filter((k) => (keepId ? true : k !== 'id'));
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) RETURNING id`;
  const res = await env.DB.prepare(sql).bind(...cols.map((c) => row[c])).first();
  return res?.id;
}

async function tryInsert(env, table, row) {
  try {
    return await insertRow(env, table, row, true);
  } catch {
    return insertRow(env, table, row, false);
  }
}

async function restoreEntry(env, kind, payload) {
  // Skjerm: gjenopprett skjerm → lysbilder → elementer, med nye id-er.
  if (kind === 'screen') {
    const newScreenId = await tryInsert(env, 'screens', payload.row);
    const slideIdMap = {};
    for (const s of payload.slides || []) {
      const c = { ...s, screen_id: newScreenId };
      const oldId = c.id;
      delete c.id;
      try {
        slideIdMap[oldId] = await insertRow(env, 'deck_slides', c, false);
      } catch {
        /* hopp over */
      }
    }
    for (const e of payload.elements || []) {
      const ns = slideIdMap[e.slide_id];
      if (!ns) continue;
      const c = { ...e, slide_id: ns };
      delete c.id;
      try {
        await insertRow(env, 'deck_elements', c, false);
      } catch {
        /* hopp over */
      }
    }
    return;
  }

  // Lysbilde: gjenopprett lysbildet + elementene sine.
  if (kind === 'deck_slide') {
    const c = { ...payload.row };
    delete c.id;
    const newId = await tryInsert(env, 'deck_slides', c);
    for (const e of payload.elements || []) {
      const ec = { ...e, slide_id: newId };
      delete ec.id;
      try {
        await insertRow(env, 'deck_elements', ec, false);
      } catch {
        /* hopp over */
      }
    }
    return;
  }

  // Historikk-modell (sone-slides / spillelister)
  if (kind === 'playlist') {
    const newId = await tryInsert(env, 'playlists', payload.row);
    for (const ch of payload.items || []) {
      const c = { ...ch, playlist_id: newId };
      delete c.id;
      try {
        await insertRow(env, 'playlist_items', c, false);
      } catch {
        /* hopp over */
      }
    }
    return;
  }

  const table = TABLE[kind];
  if (!table) return;
  await tryInsert(env, table, payload.row);
}

// GET /api/trash  -> siste 30 dager
export async function onRequestGet({ env }) {
  const { results } = await env.DB
    .prepare(
      `SELECT id, kind, label, deleted_at FROM trash
         WHERE deleted_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')
         ORDER BY deleted_at DESC`
    )
    .all();
  return json((results ?? []).map((r) => ({ ...r, kind_label: KIND_LABEL[r.kind] || r.kind })));
}

// POST /api/trash?id=1  -> gjenopprett
export async function onRequestPost(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;
  const id = toIntOrNull(new URL(context.request.url).searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');

  const row = await context.env.DB.prepare('SELECT * FROM trash WHERE id = ?').bind(id).first();
  if (!row) return notFound('Finnes ikke i papirkurven');

  try {
    await restoreEntry(context.env, row.kind, safeJson(row.payload, {}));
  } catch (e) {
    return json({ error: `Kunne ikke gjenopprette: ${e?.message || e}` }, { status: 409 });
  }
  await context.env.DB.prepare('DELETE FROM trash WHERE id = ?').bind(id).run();
  return noContent();
}

// DELETE /api/trash?id=1   -> slett permanent
// DELETE /api/trash?all=1  -> tøm papirkurv
export async function onRequestDelete(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;
  const url = new URL(context.request.url);
  const all = url.searchParams.get('all');
  const id = toIntOrNull(url.searchParams.get('id'));

  const rows = all
    ? (await context.env.DB.prepare('SELECT * FROM trash').all()).results || []
    : id
      ? [await context.env.DB.prepare('SELECT * FROM trash WHERE id = ?').bind(id).first()].filter(Boolean)
      : null;
  if (!rows) return badRequest('id eller all=1 er påkrevd');

  for (const r of rows) {
    if (r.kind === 'media' && context.env.MEDIA) {
      const key = safeJson(r.payload, {})?.row?.r2_key;
      if (key) {
        try {
          await context.env.MEDIA.delete(key);
        } catch {
          /* ignore */
        }
      }
    }
  }
  if (all) await context.env.DB.prepare('DELETE FROM trash').run();
  else await context.env.DB.prepare('DELETE FROM trash WHERE id = ?').bind(id).run();
  return noContent();
}

export const onRequestOptions = handleOptions;
