import { json, badRequest, handleOptions, readJson, requireAdmin, getTimezone } from './_shared.js';

// Kontoinnstillinger: tidssone (tidsplanen) og offline-varsling (server/monitor.js).

async function readSettings(env) {
  let rows = [];
  try {
    ({ results: rows } = await env.DB.prepare('SELECT key, value FROM settings').all());
  } catch {
    rows = [];
  }
  const map = Object.fromEntries((rows ?? []).map((r) => [r.key, r.value]));
  return {
    timezone: await getTimezone(env),
    offline_alerts: map.offline_alerts !== '0',
    offline_minutes: Number(map.offline_minutes) || 5
  };
}

const setValue = (env, key, value) =>
  env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .bind(key, String(value))
    .run();

const validTz = (tz) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

// GET /api/settings
export async function onRequestGet({ env }) {
  return json(await readSettings(env));
}

// PUT /api/settings  { timezone?, offline_alerts?, offline_minutes? }
export async function onRequestPut(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const b = (await readJson(context.request)) || {};
  if (b.timezone !== undefined) {
    if (!validTz(b.timezone)) return badRequest('Ukjent tidssone');
    await setValue(context.env, 'timezone', b.timezone);
  }
  if (b.offline_alerts !== undefined) await setValue(context.env, 'offline_alerts', b.offline_alerts ? '1' : '0');
  if (b.offline_minutes !== undefined) {
    const m = Number.parseInt(b.offline_minutes, 10);
    if (!(m >= 2 && m <= 1440)) return badRequest('Minutter må være mellom 2 og 1440');
    await setValue(context.env, 'offline_minutes', m);
  }
  return json(await readSettings(context.env));
}

export const onRequestOptions = handleOptions;
