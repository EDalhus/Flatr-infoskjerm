import { json, handleOptions, buildState } from './_shared.js';

// GET /api/state?screen=1
// Full starttilstand for en Viewer (brukes ved oppstart og som SSE-fallback).
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const screenId = url.searchParams.get('screen');
  const state = await buildState(env, screenId);
  return json(state);
}

export const onRequestOptions = handleOptions;
