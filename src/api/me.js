import { json, handleOptions } from './_shared.js';
import { getUser } from './_access.js';

// GET /api/me – hvem er innlogget (via Cloudflare Access, eller lokal fallback).
export async function onRequestGet({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return json({ error: 'Ikke innlogget' }, { status: 401 });
  return json({ email: user.email, name: user.name, color: user.color });
}

export const onRequestOptions = handleOptions;
