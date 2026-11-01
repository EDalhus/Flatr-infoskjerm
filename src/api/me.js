import { json, handleOptions } from './_shared.js';
import { getUser, userColorPalette } from './_access.js';

// GET /api/me – hvem er innlogget (via Cloudflare Access, eller lokal fallback).
export async function onRequestGet({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return json({ error: 'Ikke innlogget' }, { status: 401 });
  return json({
    email: user.email,
    name: user.name,
    color: user.color,
    role: user.role ?? null,
    prefs: user.prefs ?? {},
    palette: userColorPalette(),
    tenant: env.TENANT ?? null,
    // Kjeder/kommuner: gruppene brukeren administrerer (lenke til oversikten på flatr.no).
    groups: env.SESSION_USER?.groups ?? []
  });
}

export const onRequestOptions = handleOptions;
