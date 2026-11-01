// API-nøkler (Konto → API): bare eiere kan lage og trekke tilbake nøkler.
// Nøkkelen vises én gang; vi lagrer bare en hash av den (se src/api/v1.js).
//   GET    /api/keys          -> nøklene (uten selve nøkkelen)
//   POST   /api/keys {name}   -> { key, … } – den eneste gangen nøkkelen vises
//   DELETE /api/keys?id=1     -> trekk tilbake

import { json, badRequest, notFound, readJson, requireAdmin, toIntOrNull } from './_shared.js';
import { hashKey } from './v1.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function newKey() {
  // Avviser bytes over 247 så alle tegn er like sannsynlige.
  let out = '';
  while (out.length < 32) {
    for (const b of crypto.getRandomValues(new Uint8Array(48))) if (b < 248 && out.length < 32) out += ALPHABET[b % 62];
  }
  return `flatr_${out}`;
}

async function ownerOnly(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const user = context.env.SESSION_USER;
  if (user && user.role !== 'owner') return json({ error: 'Bare eiere kan se og lage API-nøkler.' }, { status: 403 });
  return null;
}

const out = (r) => ({ id: r.id, name: r.name, prefix: r.prefix, created_by: r.created_by, created_at: r.created_at, last_used_at: r.last_used_at });

export async function onRequestGet(context) {
  const denied = await ownerOnly(context);
  if (denied) return denied;
  const { results } = await context.env.DB.prepare('SELECT * FROM api_keys WHERE revoked_at IS NULL ORDER BY id DESC').all();
  return json((results ?? []).map(out));
}

export async function onRequestPost(context) {
  const denied = await ownerOnly(context);
  if (denied) return denied;
  const b = (await readJson(context.request)) || {};
  const name = String(b.name || '').trim().slice(0, 60);
  if (!name) return badRequest('Gi nøkkelen et navn, f.eks. «Lagersystemet» eller «Zapier».');
  const key = newKey();
  const row = await context.env.DB.prepare('INSERT INTO api_keys (name, prefix, hash, created_by) VALUES (?, ?, ?, ?) RETURNING *')
    .bind(name, key.slice(0, 10), await hashKey(key), context.env.SESSION_USER?.email || null)
    .first();
  return json({ ...out(row), key }, { status: 201 });
}

export async function onRequestDelete(context) {
  const denied = await ownerOnly(context);
  if (denied) return denied;
  const id = toIntOrNull(new URL(context.request.url).searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');
  const res = await context.env.DB.prepare(`UPDATE api_keys SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND revoked_at IS NULL`).bind(id).run();
  return (res.meta?.changes ?? 0) ? json({ ok: true }) : notFound('Nøkkelen finnes ikke');
}
