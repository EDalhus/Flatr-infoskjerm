// Delte hjelpere for alle API-Functions. Filnavn med _ rutes ikke av Pages.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders,
      ...(init.headers ?? {})
    }
  });
}

export const noContent = () => new Response(null, { status: 204, headers: corsHeaders });
export const badRequest = (message) => json({ error: message }, { status: 400 });
export const notFound = (message = 'Not found') => json({ error: message }, { status: 404 });
export const handleOptions = () => new Response(null, { status: 204, headers: corsHeaders });

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/**
 * Returnerer et 401-Response hvis ADMIN_TOKEN er satt og mangler/feil.
 * Returnerer null når kallet er autorisert (eller når ingen token er konfigurert).
 */
export function requireAdmin({ request, env }) {
  const configured = env.ADMIN_TOKEN;
  if (!configured) return null; // åpent i dev når ingen token er satt
  const header = request.headers.get('Authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (token !== configured) return json({ error: 'Unauthorized' }, { status: 401 });
  return null;
}

export function toIntOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * Bygger den komplette tilstanden en Viewer trenger.
 * Gjenbrukes av /api/state og /api/stream.
 */
export async function buildState(env, screenId) {
  const id = toIntOrNull(screenId);

  const screenStmt = id
    ? env.DB.prepare('SELECT * FROM screens WHERE id = ?').bind(id)
    : null;

  const [screen, schedule, sponsors, alerts] = await Promise.all([
    screenStmt ? screenStmt.first() : Promise.resolve(null),
    env.DB.prepare('SELECT * FROM schedule ORDER BY start_time ASC, id ASC').all(),
    env.DB.prepare('SELECT * FROM sponsors ORDER BY id ASC').all(),
    env.DB
      .prepare(
        `SELECT * FROM alerts
           WHERE active = 1
             AND (target_screen_id IS NULL OR target_screen_id = ?)
           ORDER BY created_at DESC, id DESC`
      )
      .bind(id)
      .all()
  ]);

  const state = {
    screen: screen ?? null,
    schedule: schedule.results ?? [],
    sponsors: sponsors.results ?? [],
    alerts: alerts.results ?? [],
    serverTime: new Date().toISOString()
  };
  state.version = signature(state);
  return state;
}

/** Lettvekts endrings-signatur (djb2) over innhold – uten serverTime. */
export function signature(state) {
  const basis = JSON.stringify({
    screen: state.screen,
    schedule: state.schedule,
    sponsors: state.sponsors,
    alerts: state.alerts
  });
  let hash = 5381;
  for (let i = 0; i < basis.length; i++) {
    hash = ((hash << 5) + hash + basis.charCodeAt(i)) | 0;
  }
  return String(hash >>> 0);
}
