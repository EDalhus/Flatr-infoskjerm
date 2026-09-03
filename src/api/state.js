import { json, handleOptions, buildState, touchScreen, corsHeaders } from './_shared.js';

// GET /api/state?screen=1
// Full starttilstand for en Viewer (brukes ved oppstart og som SSE-fallback).
//
// Betinget henting: svaret får en `ETag` = innholds-signaturen. Sender klienten
// `If-None-Match` med samme verdi, svarer vi `304 Not Modified` uten kropp – da
// beholder TV-en sin siste gyldige tilstand, og kan fortsette å vise den også
// når nettet faller (cache siste 200-svar lokalt på enheten).
export async function onRequestGet({ request, env }) {
  const screenId = new URL(request.url).searchParams.get('screen');
  const [state] = await Promise.all([buildState(env, screenId), touchScreen(env, screenId)]);

  const etag = `W/"${state.version}"`;
  const inm = request.headers.get('If-None-Match');
  if (inm && inm === etag) {
    return new Response(null, {
      status: 304,
      headers: { ...corsHeaders, ETag: etag, 'Cache-Control': 'no-cache', 'Access-Control-Expose-Headers': 'ETag' }
    });
  }

  return json(state, { headers: { ETag: etag, 'Cache-Control': 'no-cache', 'Access-Control-Expose-Headers': 'ETag' } });
}

export const onRequestOptions = handleOptions;
