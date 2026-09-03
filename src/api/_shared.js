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

export function requireAdmin({ request, env }) {
  const configured = env.ADMIN_TOKEN;
  if (!configured) return null;
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

export function safeJson(value, fallback = {}) {
  if (value && typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value ?? '');
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/** Utleder status fra klokka når auto_status er på. 'cancelled' vinner alltid. */
export function effectiveStatus(item, now = Date.now()) {
  if (item.status === 'cancelled') return 'cancelled';
  if (!item.auto_status) return item.status || 'scheduled';
  const start = Date.parse(item.start_time);
  if (Number.isNaN(start)) return item.status || 'scheduled';
  const end = item.end_time ? Date.parse(item.end_time) : start + 3600_000;
  if (now < start) return 'scheduled';
  if (now < end) return 'live';
  return 'done';
}

/** Legger en slettet rad i papirkurven. `payload` må være nok til å gjenopprette. */
export async function moveToTrash(env, kind, label, payload) {
  try {
    await env.DB.prepare('INSERT INTO trash (kind, label, payload) VALUES (?, ?, ?)')
      .bind(kind, String(label || kind).slice(0, 200), JSON.stringify(payload))
      .run();
  } catch {
    /* papirkurv er best-effort */
  }
}

const DAYPART_FIELDS = [
  'active_from',
  'active_to',
  'active_days',
  'active_from_date',
  'active_to_date'
];
const pickDaypart = (row) => {
  const out = {};
  for (const k of DAYPART_FIELDS) out[k] = row[k] ?? null;
  return out;
};

/** Oppdaterer last_seen for en skjerm (online-status i admin). */
export async function touchScreen(env, screenId) {
  const id = toIntOrNull(screenId);
  if (!id) return;
  try {
    await env.DB.prepare('UPDATE screens SET last_seen = ? WHERE id = ?')
      .bind(new Date().toISOString(), id)
      .run();
  } catch {
    /* ikke kritisk */
  }
}

/**
 * Bygger den komplette tilstanden en Viewer trenger for én skjerm:
 * skjerm-config, slides for den skjermen, kategorier, hele programmet
 * (med utledet status), sponsorer og aktive alerts.
 * Gjenbrukes av /api/state og /api/stream.
 */
export async function buildState(env, screenId) {
  const id = toIntOrNull(screenId);
  const now = Date.now();

  const [screen, deckSlides, categories, schedule, sponsors, alerts] = await Promise.all([
    id ? env.DB.prepare('SELECT * FROM screens WHERE id = ?').bind(id).first() : Promise.resolve(null),
    id
      ? env.DB
          .prepare(
            `SELECT * FROM deck_slides
               WHERE screen_id = ? AND enabled = 1
               ORDER BY position ASC, id ASC`
          )
          .bind(id)
          .all()
      : Promise.resolve({ results: [] }),
    env.DB.prepare('SELECT * FROM categories ORDER BY name ASC').all(),
    env.DB.prepare('SELECT * FROM schedule ORDER BY start_time ASC, id ASC').all(),
    env.DB.prepare('SELECT * FROM sponsors ORDER BY id ASC').all(),
    env.DB
      .prepare(
        `SELECT * FROM alerts
           WHERE active = 1 AND (target_screen_id IS NULL OR target_screen_id = ?)
           ORDER BY created_at DESC, id DESC`
      )
      .bind(id)
      .all()
  ]);

  const scheduleRows = (schedule.results ?? []).map((row) => ({
    ...row,
    effective_status: effectiveStatus(row, now)
  }));

  // Hent elementene for lysbildene og bygg deck.
  const rawSlides = deckSlides.results ?? [];
  const slideIds = rawSlides.map((s) => s.id);
  const elsBySlide = {};
  if (slideIds.length) {
    const marks = slideIds.map(() => '?').join(',');
    const { results: els } = await env.DB
      .prepare(
        `SELECT * FROM deck_elements WHERE slide_id IN (${marks}) ORDER BY slide_id ASC, z ASC, id ASC`
      )
      .bind(...slideIds)
      .all();
    for (const e of els ?? [])
      (elsBySlide[e.slide_id] ||= []).push({ ...e, config: safeJson(e.config, {}) });
  }
  const deck = rawSlides.map((s) => ({
    ...s,
    background: safeJson(s.background, { type: 'color', color: '#0f2733' }),
    elements: elsBySlide[s.id] ?? []
  }));

  const state = {
    screen: screen || null,
    deck,
    categories: categories.results ?? [],
    schedule: scheduleRows,
    sponsors: sponsors.results ?? [],
    alerts: alerts.results ?? [],
    serverTime: new Date().toISOString()
  };
  state.version = signature(state);
  return state;
}

/** Lettvekts endrings-signatur (djb2) over innhold – uten serverTime.
 *  `last_seen` på skjermen utelates: en heartbeat skal ikke trigge SSE-update
 *  eller endre ETag på /api/state. */
export function signature(state) {
  const { last_seen, ...screen } = state.screen || {};
  const basis = JSON.stringify({
    screen,
    deck: state.deck,
    categories: state.categories,
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
