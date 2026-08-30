import { noContent, badRequest, handleOptions, toIntOrNull, touchScreen } from './_shared.js';

// POST /api/heartbeat?screen=1
// Viewer kaller dette jevnlig så admin kan vise online/offline.
export async function onRequestPost({ request, env }) {
  const screen = toIntOrNull(new URL(request.url).searchParams.get('screen'));
  if (!screen) return badRequest('screen er påkrevd');
  await touchScreen(env, screen);
  return noContent();
}

export const onRequestOptions = handleOptions;
