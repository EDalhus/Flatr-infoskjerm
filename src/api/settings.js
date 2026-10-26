import { json, badRequest, handleOptions, readJson, requireAdmin, getTimezone } from './_shared.js';

// Kontoinnstillinger. Foreløpig bare tidssone (brukes av tidsplanen).

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
  return json({ timezone: await getTimezone(env) });
}

// PUT /api/settings  { timezone }
export async function onRequestPut(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const b = (await readJson(context.request)) || {};
  if (b.timezone !== undefined) {
    if (!validTz(b.timezone)) return badRequest('Ukjent tidssone');
    await context.env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('timezone', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
      .bind(b.timezone)
      .run();
  }
  return json({ timezone: await getTimezone(context.env) });
}

export const onRequestOptions = handleOptions;
