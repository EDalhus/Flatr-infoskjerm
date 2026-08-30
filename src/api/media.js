import {
  json,
  noContent,
  badRequest,
  notFound,
  handleOptions,
  requireAdmin,
  toIntOrNull,
  corsHeaders
} from './_shared.js';

const noBucket = () =>
  json(
    { error: 'Mediebibliotek krever en R2-bucket (binding MEDIA). Se README → Mediebibliotek.' },
    { status: 503 }
  );

// GET /api/media                 -> liste (metadata)
// GET /api/media?id=1            -> metadata for én
// GET /api/media?id=1&raw=1      -> selve fila (fra R2)
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const id = toIntOrNull(url.searchParams.get('id'));

  if (id && url.searchParams.get('raw')) {
    if (!env.MEDIA) return noBucket();
    const row = await env.DB.prepare('SELECT * FROM media WHERE id = ?').bind(id).first();
    if (!row) return notFound('Fil finnes ikke');
    const obj = await env.MEDIA.get(row.r2_key);
    if (!obj) return notFound('Fil mangler i lager');
    return new Response(obj.body, {
      headers: {
        'Content-Type': row.content_type || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
        ...corsHeaders
      }
    });
  }

  if (id) {
    const row = await env.DB.prepare('SELECT * FROM media WHERE id = ?').bind(id).first();
    return row ? json(row) : notFound('Fil finnes ikke');
  }

  const folder = url.searchParams.get('folder');
  const stmt = folder
    ? env.DB.prepare('SELECT * FROM media WHERE folder = ? ORDER BY created_at DESC').bind(folder)
    : env.DB.prepare('SELECT * FROM media ORDER BY created_at DESC');
  const { results } = await stmt.all();
  return json(results ?? []);
}

// POST /api/media?name=logo.png&type=image/png&folder=Logoer
// Body = rå fil-bytes.
export async function onRequestPost(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;
  if (!context.env.MEDIA) return noBucket();

  const url = new URL(context.request.url);
  const name = (url.searchParams.get('name') || 'fil').slice(0, 200);
  const type = url.searchParams.get('type') || context.request.headers.get('content-type') || 'application/octet-stream';
  const folder = url.searchParams.get('folder') || null;

  if (!context.request.body) return badRequest('mangler fil-innhold');

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
  const denied = requireAdmin(context);
  if (denied) return denied;
  const id = toIntOrNull(new URL(context.request.url).searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');

  const row = await context.env.DB.prepare('SELECT * FROM media WHERE id = ?').bind(id).first();
  if (row && context.env.MEDIA) {
    try {
      await context.env.MEDIA.delete(row.r2_key);
    } catch {
      /* ignore */
    }
  }
  await context.env.DB.prepare('DELETE FROM media WHERE id = ?').bind(id).run();
  return noContent();
}

export const onRequestOptions = handleOptions;
