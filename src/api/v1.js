// Flatr API v1 for kundenes egne systemer (og Zapier, Make, Power Automate):
// https://<kunde>.flatr.no/api/v1/…  med  Authorization: Bearer flatr_…
// Dokumentasjon: flatr.no/hjelp/api. v1 endres ikke på måter som ødelegger
// eksisterende koblinger – nye ting kommer som nye felt eller en ny versjon.
//
//   GET    /api/v1/screens              skjermene og om de er på nett
//   GET    /api/v1/alerts               hastemeldinger som vises eller er planlagt
//   POST   /api/v1/alerts               send en hastemelding
//   DELETE /api/v1/alerts[/<id>]        avslutt én eller alle
//   GET    /api/v1/texts                tekster med navn (satt i editoren)
//   PUT    /api/v1/texts/<navn>         endre teksten overalt den er brukt
//   GET    /api/v1/stock                lagerbeholdningen (appen Lagerbeholdning)
//   PUT    /api/v1/stock                bytt ut alle varene
//   PATCH  /api/v1/stock/<vare>         endre én vare (id eller navn)

import { json, toIntOrNull, safeJson } from './_shared.js';
import { cleanAlert, isLive } from '../lib/alerts.js';
import { cleanStock } from '../lib/stock.js';
import { logActivity } from './activity.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
};
const ok = (data, status = 200) => json(data, { status, headers: CORS });
const fail = (status, error) => json({ error }, { status, headers: CORS });
export const TEXT_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;

export async function hashKey(key) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Høyst 120 forespørsler i minuttet per nøkkel (i minnet, per server).
const hits = new Map();
function tooMany(id) {
  const now = Date.now();
  const list = (hits.get(id) || []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(id, list);
  return list.length > 120;
}

/** Svarer på /api/v1/…, eller null hvis nøkkelen mangler (se server/index.js). */
export async function handleV1(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const raw = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!/^flatr_[A-Za-z0-9]{32}$/.test(raw)) return fail(401, 'Mangler eller ugyldig API-nøkkel. Send den som «Authorization: Bearer flatr_…».');
  const key = await env.DB.prepare('SELECT * FROM api_keys WHERE hash = ? AND revoked_at IS NULL').bind(await hashKey(raw)).first();
  if (!key) return fail(401, 'Ukjent API-nøkkel, eller den er trukket tilbake.');
  if (tooMany(key.id)) return fail(429, 'For mange forespørsler – høyst 120 i minuttet.');
  await env.DB.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').bind(new Date().toISOString(), key.id).run();

  const actor = { email: null, name: `API (${key.name})` };
  const parts = new URL(request.url).pathname.replace(/^\/api\/v1\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [resource, id] = parts;
  const body = ['POST', 'PUT', 'PATCH'].includes(request.method) ? await request.json().catch(() => null) : null;
  if (['POST', 'PUT', 'PATCH'].includes(request.method) && (!body || typeof body !== 'object')) return fail(400, 'Kroppen må være JSON.');
  const route = `${request.method} ${resource || ''}${id ? '/:id' : ''}`;

  try {
    switch (route) {
      case 'GET screens':
        return ok({ screens: await screens(env) });
      case 'GET alerts':
        return ok({ alerts: await alerts(env) });
      case 'POST alerts': {
        const { value, error } = cleanAlert(body);
        if (error) return fail(400, error);
        const tag = body.group ? String(body.group).trim().slice(0, 40) : null;
        const screen = tag ? null : toIntOrNull(body.screen);
        const row = await env.DB.prepare(
          `INSERT INTO alerts (message, title, severity, display, starts_at, ends_at, target_screen_id, target_tag, active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1) RETURNING *`
        )
          .bind(value.message, value.title, value.severity, value.display, value.starts_at, value.ends_at, screen, tag)
          .first();
        await logActivity(env, actor, { action: 'sendte hastemelding via API', target_type: 'alert', target_id: row.id, target_name: value.title || value.message.slice(0, 60) });
        return ok(alertOut(row), 201);
      }
      case 'DELETE alerts':
        await env.DB.prepare('UPDATE alerts SET active = 0 WHERE active = 1 AND (starts_at IS NULL OR starts_at <= ?)').bind(new Date().toISOString()).run();
        return ok({ ended: true });
      case 'DELETE alerts/:id': {
        const res = await env.DB.prepare('UPDATE alerts SET active = 0 WHERE id = ?').bind(toIntOrNull(id)).run();
        return (res.meta?.changes ?? 0) ? ok({ ended: true }) : fail(404, 'Fant ikke hastemeldingen.');
      }
      case 'GET texts':
        return ok({ texts: await texts(env) });
      case 'PUT texts/:id': {
        if (!TEXT_NAME.test(id)) return fail(400, 'Ugyldig navn.');
        if (typeof body.text !== 'string') return fail(400, 'Mangler «text».');
        const updated = await setText(env, id, body.text.slice(0, 2000));
        if (!updated) return fail(404, `Ingen tekst heter «${id}». Gi teksten et API-navn i editoren først.`);
        await logActivity(env, actor, { action: 'endret tekst via API', target_type: 'text', target_name: id });
        return ok({ name: id, text: body.text.slice(0, 2000), updated });
      }
      case 'GET stock': {
        const app = await stockApp(env);
        return app ? ok({ items: safeJson(app.config, {}).items || [] }) : fail(404, 'Appen Lagerbeholdning er ikke aktivert.');
      }
      case 'PUT stock': {
        const app = await stockApp(env);
        if (!app) return fail(404, 'Appen Lagerbeholdning er ikke aktivert.');
        const config = cleanStock({ ...safeJson(app.config, {}), items: body.items, updated_at: new Date().toISOString() });
        await env.DB.prepare(`UPDATE apps SET config = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).bind(JSON.stringify(config), app.id).run();
        return ok({ items: config.items });
      }
      case 'PATCH stock/:id': {
        const app = await stockApp(env);
        if (!app) return fail(404, 'Appen Lagerbeholdning er ikke aktivert.');
        const config = safeJson(app.config, {});
        const want = id.toLowerCase();
        const item = (config.items || []).find((it) => it.id === id || String(it.name || '').toLowerCase() === want);
        if (!item) return fail(404, `Fant ingen vare «${id}».`);
        for (const k of ['amount', 'unit', 'min', 'name']) if (body[k] !== undefined) item[k] = body[k] == null ? null : String(body[k]);
        const next = cleanStock({ ...config, updated_at: new Date().toISOString() });
        await env.DB.prepare(`UPDATE apps SET config = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).bind(JSON.stringify(next), app.id).run();
        return ok(next.items.find((it) => it.id === item.id) || item);
      }
      default:
        return fail(404, 'Ukjent adresse. Se flatr.no/hjelp/api.');
    }
  } catch (err) {
    return fail(400, err.message || 'Noe gikk galt');
  }
}

/* ------------------------------- ressurser ------------------------------- */

async function screens(env) {
  const { results } = await env.DB.prepare(
    `SELECT s.id, s.name, s.location, s.tags, s.last_seen, s.playlist_id, p.name AS playlist
       FROM screens s LEFT JOIN playlists p ON p.id = s.playlist_id ORDER BY s.name COLLATE NOCASE`
  ).all();
  const now = Date.now();
  return (results ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    location: s.location || null,
    groups: String(s.tags || '').split(',').map((t) => t.trim()).filter(Boolean),
    online: !!s.last_seen && now - Date.parse(s.last_seen) < 3 * 60_000,
    last_seen: s.last_seen || null,
    presentation: s.playlist_id ? { id: s.playlist_id, name: s.playlist } : null
  }));
}

const alertOut = (a) => ({
  id: a.id,
  title: a.title || null,
  message: a.message,
  severity: a.severity || 'critical',
  display: a.display || 'flash',
  starts_at: a.starts_at || null,
  ends_at: a.ends_at || null,
  screen: a.target_screen_id || null,
  group: a.target_tag || null,
  state: isLive(a) ? 'live' : 'scheduled'
});

async function alerts(env) {
  const { results } = await env.DB.prepare('SELECT * FROM alerts WHERE active = 1 ORDER BY id DESC').all();
  const now = Date.now();
  return (results ?? []).filter((a) => !a.ends_at || Date.parse(a.ends_at) > now).map(alertOut);
}

/** Tekstelementer med API-navn (config.apiName) i alle presentasjoner. */
async function texts(env) {
  const { results } = await env.DB.prepare(`SELECT config FROM deck_elements WHERE kind = 'text' AND config LIKE '%"apiName"%'`).all();
  const byName = new Map();
  for (const r of results ?? []) {
    const c = safeJson(r.config, {});
    if (!TEXT_NAME.test(c.apiName || '')) continue;
    const cur = byName.get(c.apiName) || { name: c.apiName, text: c.text ?? '', used: 0 };
    cur.used += 1;
    byName.set(c.apiName, cur);
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Endrer teksten i alle tekstelementer med navnet – i presentasjonene og i den
 * publiserte versjonen (når kontoen krever godkjenning), så det vises med en gang.
 * Formatering fjernes, siden den hører til den gamle teksten.
 */
async function setText(env, name, text) {
  const patch = (c) => ({ ...c, text, rich: null });
  let updated = 0;
  const { results } = await env.DB.prepare(`SELECT id, config FROM deck_elements WHERE kind = 'text' AND config LIKE ?`).bind(`%"apiName":"${name}"%`).all();
  for (const r of results ?? []) {
    const c = safeJson(r.config, {});
    if (c.apiName !== name) continue;
    await env.DB.prepare('UPDATE deck_elements SET config = ? WHERE id = ?').bind(JSON.stringify(patch(c)), r.id).run();
    updated++;
  }
  const { results: versions } = await env.DB.prepare(
    `SELECT v.id, v.data FROM playlists p JOIN playlist_versions v ON v.id = p.published_version_id WHERE v.data LIKE ?`
  )
    .bind(`%${name}%`)
    .all()
    .catch(() => ({ results: [] }));
  for (const v of versions ?? []) {
    const data = safeJson(v.data, null);
    if (!data?.slides) continue;
    let changed = false;
    for (const s of data.slides)
      for (const e of s.elements || []) {
        const c = safeJson(e.config, {});
        if (e.kind !== 'text' || c.apiName !== name) continue;
        e.config = typeof e.config === 'string' ? JSON.stringify(patch(c)) : patch(c);
        changed = true;
      }
    if (changed) await env.DB.prepare('UPDATE playlist_versions SET data = ? WHERE id = ?').bind(JSON.stringify(data), v.id).run();
  }
  return updated;
}

const stockApp = (env) => env.DB.prepare(`SELECT * FROM apps WHERE kind = 'stock' LIMIT 1`).first();
