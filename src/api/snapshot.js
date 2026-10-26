import { notFound, badRequest, handleOptions, toIntOrNull, corsHeaders } from './_shared.js';

// GET /api/snapshot?id=1  -> siste skjermbilde av en nettside (for Apple TV,
// som ikke kan vise nettsider). Åpent, som mediefiler. `v` i adressen endres
// når bildet tas på nytt, så TV-ens cache henter det nye.
export async function onRequestGet({ request, env }) {
  const id = toIntOrNull(new URL(request.url).searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');
  const row = await env.DB.prepare('SELECT r2_key, content_type FROM web_snapshots WHERE id = ?').bind(id).first();
  if (!row?.r2_key || !env.MEDIA) return notFound('Ingen skjermbilde ennå');
  const obj = await env.MEDIA.get(row.r2_key);
  if (!obj) return notFound('Skjermbildet mangler');
  return new Response(obj.body, {
    headers: {
      'Content-Type': row.content_type || 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
      ...corsHeaders
    }
  });
}

export const onRequestOptions = handleOptions;
