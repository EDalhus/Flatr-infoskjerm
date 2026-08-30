import { json, handleOptions } from './_shared.js';

// GET /api/health
export async function onRequestGet({ env }) {
  let db = false;
  try {
    await env.DB.prepare('SELECT 1').first();
    db = true;
  } catch {
    db = false;
  }
  return json({ ok: db, db, media: !!env.MEDIA, time: new Date().toISOString() });
}

export const onRequestOptions = handleOptions;
