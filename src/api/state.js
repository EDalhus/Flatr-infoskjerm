import { json, handleOptions, buildState, touchScreen } from './_shared.js';

// GET /api/state?screen=1
// Full starttilstand for en Viewer (brukes ved oppstart og som SSE-fallback).
export async function onRequestGet({ request, env }) {
  const screenId = new URL(request.url).searchParams.get('screen');
  const [state] = await Promise.all([buildState(env, screenId), touchScreen(env, screenId)]);
  return json(state);
}

export const onRequestOptions = handleOptions;
