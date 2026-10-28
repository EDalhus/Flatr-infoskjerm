import {
  json,
  noContent,
  badRequest,
  readJson,
  notFound,
  handleOptions,
  requireAdmin,
  toIntOrNull,
  corsHeaders,
  moveToTrash,
  checkLimit
} from './_shared.js';

const noBucket = () =>
  json(
    { error: 'Mediebibliotek krever en R2-bucket (binding MEDIA). Se README → Mediebibliotek.' },
    { status: 503 }
  );

/** "bytes=0-1023" -> { offset, length }. null = hele fila, 'invalid' = 416. */
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header || '');
  if (!m || size == null || (!m[1] && !m[2])) return null;
  let start;
  let end;
  if (m[1]) {
    start = Number(m[1]);
    end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  } else {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  }
  if (start > end || start >= size) return 'invalid';
  return { offset: start, length: end - start + 1 };
}

// GET /api/media                 -> liste (metadata)
// GET /api/media?id=1            -> metadata for én (+ hvor den brukes)
// GET /api/media?id=1&raw=1      -> selve fila (fra R2)
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const id = toIntOrNull(url.searchParams.get('id'));

  if (id && url.searchParams.get('raw')) {
    if (!env.MEDIA) return noBucket();
    const row = await env.DB.prepare('SELECT * FROM media WHERE id = ?').bind(id).first();
    if (!row) return notFound('Fil finnes ikke');
    // Range-støtte: Safari/iOS spiller ikke av video uten den.
    const range = parseRange(request.headers.get('Range'), row.size);
    if (range === 'invalid') {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${row.size}`, ...corsHeaders } });
    }
    const obj = await env.MEDIA.get(row.r2_key, range ? { range } : undefined);
    if (!obj) return notFound('Fil mangler i lager');
    const headers = {
      'Content-Type': row.content_type || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Accept-Ranges': 'bytes',
      ...corsHeaders
    };
    if (range) {
      const end = range.offset + range.length - 1;
      return new Response(obj.body, {
        status: 206,
        headers: { ...headers, 'Content-Range': `bytes ${range.offset}-${end}/${row.size}`, 'Content-Length': String(range.length) }
      });
    }
    // Faktisk filstørrelse fra lageret (ikke tallet i databasen).
    const size = obj.size ?? row.size;
    if (size != null) headers['Content-Length'] = String(size);
    return new Response(obj.body, { headers });
  }

  if (id) {
    const row = await env.DB.prepare('SELECT * FROM media WHERE id = ?').bind(id).first();
    return row ? json({ ...row, usage: await mediaUsage(env, id) }) : notFound('Fil finnes ikke');
  }

  const folder = url.searchParams.get('folder');
  const stmt = folder
    ? env.DB.prepare('SELECT * FROM media WHERE folder = ? ORDER BY created_at DESC').bind(folder)
    : env.DB.prepare('SELECT * FROM media ORDER BY created_at DESC');
  const { results } = await stmt.all();
  return json(results ?? []);
}

/**
 * Hvor en fil brukes: lysbilder (elementer og bakgrunner) og sponsorer.
 * Filer lagres som "/api/media?id=N&raw=1", så vi søker etter akkurat den.
 */
async function mediaUsage(env, id) {
  const needle = `%/api/media?id=${id}&raw=1%`;
  const [slides, sponsors] = await Promise.all([
    env.DB.prepare(
      `SELECT DISTINCT d.id AS slide_id, d.name AS slide_name, p.id AS playlist_id, p.name AS playlist_name
         FROM deck_slides d
         JOIN playlists p ON p.id = d.playlist_id
        WHERE d.background LIKE ?1
           OR EXISTS (SELECT 1 FROM deck_elements e WHERE e.slide_id = d.id AND e.config LIKE ?1)
        ORDER BY p.name, d.position`
    )
      .bind(needle)
      .all()
      .catch(() => ({ results: [] })),
    env.DB.prepare('SELECT id, name FROM sponsors WHERE image_url LIKE ?').bind(needle).all()
  ]);
  return { slides: slides.results ?? [], sponsors: sponsors.results ?? [] };
}

// PUT /api/media?id=1  { name?, folder? }   (folder: "" eller null = ingen mappe)
export async function onRequestPut(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const id = toIntOrNull(new URL(context.request.url).searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');
  const b = await readJson(context.request);
  if (!b) return badRequest('ugyldig JSON');

  const cur = await context.env.DB.prepare('SELECT * FROM media WHERE id = ?').bind(id).first();
  if (!cur) return notFound('Fil finnes ikke');
  const name = b.name !== undefined && String(b.name).trim() ? String(b.name).trim().slice(0, 200) : cur.name;
  const folder =
    b.folder !== undefined ? (b.folder ? String(b.folder).trim().slice(0, 80) || null : null) : cur.folder;

  const row = await context.env.DB
    .prepare('UPDATE media SET name = ?, folder = ? WHERE id = ? RETURNING *')
    .bind(name, folder, id)
    .first();
  return json(row);
}

// POST /api/media?name=logo.png&type=image/png&folder=Logoer
// Body = rå fil-bytes.
export async function onRequestPost(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  if (!context.env.MEDIA) return noBucket();

  const url = new URL(context.request.url);
  const name = (url.searchParams.get('name') || 'fil').slice(0, 200);
  const type = url.searchParams.get('type') || context.request.headers.get('content-type') || 'application/octet-stream';
  const folder = url.searchParams.get('folder') || null;

  if (!context.request.body) return badRequest('mangler fil-innhold');
  if (/^video\//i.test(type) || /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(name)) {
    const noVideo = await checkLimit(context.env, 'video');
    if (noVideo) return noVideo;
  }
  const full = await checkLimit(context.env, 'storage', Number(context.request.headers.get('content-length')) || 0);
  if (full) return full;

  const key = `media/${crypto.randomUUID()}`;
  const put = await context.env.MEDIA.put(key, context.request.body, {
    httpMetadata: { contentType: type }
  });
  const size = put?.size ?? toIntOrNull(context.request.headers.get('content-length'));

  const row = await context.env.DB
    .prepare('INSERT INTO media (name, folder, r2_key, content_type, size) VALUES (?, ?, ?, ?, ?) RETURNING *')
    .bind(name, folder, key, type, size)
    .first();
  return json(row, { status: 201 });
}

// DELETE /api/media?id=1
export async function onRequestDelete(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const id = toIntOrNull(new URL(context.request.url).searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');

  // Behold R2-objektet så fila kan gjenopprettes fra papirkurven; R2 ryddes
  // først når trash-raden slettes permanent (se trash.js).
  const row = await context.env.DB.prepare('SELECT * FROM media WHERE id = ?').bind(id).first();
  if (row) {
    await moveToTrash(context.env, 'media', row.name, { row });
    await context.env.DB.prepare('DELETE FROM media WHERE id = ?').bind(id).run();
  }
  return noContent();
}

export const onRequestOptions = handleOptions;
