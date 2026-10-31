import {
  json,
  noContent,
  badRequest,
  handleOptions,
  readJson,
  requireAdmin,
  toIntOrNull,
  getTimezone
} from './_shared.js';
import { cleanAlert, isLive } from '../lib/alerts.js';
import { metAlertsNow } from './metAlerts.js';

// Hastemeldinger. En melding har alvorlighet (info | warning | critical),
// visning (banner | full | flash), valgfri tittel, og kan planlegges
// (starts_at) og slutte av seg selv (ends_at). Skjermene får bare meldinger
// som gjelder nå (buildState), og sjekker uansett hvert 15. sekund.

const nowIso = () => new Date().toISOString();

// Meldinger som har gått ut, arkiveres, så «Aktive» bare viser det som gjelder.
const archiveExpired = (env) =>
  env.DB.prepare('UPDATE alerts SET active = 0 WHERE active = 1 AND ends_at IS NOT NULL AND ends_at <= ?').bind(nowIso()).run();

// GET /api/alerts            -> det som vises nå og det som er planlagt (state: live | scheduled),
//                               pluss farevarsler fra MET som gjelder nå (source: 'met')
// GET /api/alerts?all=1      -> alle (også arkiverte)
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const all = url.searchParams.get('all');
  await archiveExpired(env).catch(() => {});

  const stmt = all
    ? env.DB.prepare('SELECT * FROM alerts ORDER BY created_at DESC, id DESC')
    : env.DB.prepare('SELECT * FROM alerts WHERE active = 1 ORDER BY created_at DESC, id DESC');

  const { results } = await stmt.all();
  const now = Date.now();
  const rows = (results ?? []).map((a) => ({ ...a, state: isLive(a, now) ? 'live' : a.active ? 'scheduled' : 'ended' }));
  if (!all) rows.push(...(await metAlertsNow(env, await getTimezone(env), now)).map((a) => ({ ...a, state: 'live' })));
  return json(rows);
}

// POST /api/alerts  { message, title?, severity?, display?, starts_at?, ends_at? | duration_minutes?,
//                     target_screen_id?, target_tag? }
// Begge mål utelatt -> ALLE skjermer; target_tag -> alle skjermer i gruppen (taggen)
export async function onRequestPost(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;

  const b = await readJson(context.request);
  const { value, error } = cleanAlert(b);
  if (error) return badRequest(error);

  const tag = b.target_tag ? String(b.target_tag).trim().slice(0, 40) || null : null;
  const target = tag ? null : toIntOrNull(b.target_screen_id);

  const row = await context.env.DB
    .prepare(
      `INSERT INTO alerts (message, title, severity, display, starts_at, ends_at, target_screen_id, target_tag, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1) RETURNING *`
    )
    .bind(value.message, value.title, value.severity, value.display, value.starts_at, value.ends_at, target, tag)
    .first();

  return json({ ...row, state: isLive(row) ? 'live' : 'scheduled' }, { status: 201 });
}

// DELETE /api/alerts?id=1   -> avslutt én melding (active = 0), også en planlagt
// DELETE /api/alerts?all=1  -> avslutt alle meldinger som vises nå (planlagte beholdes)
export async function onRequestDelete(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;

  const url = new URL(context.request.url);
  const all = url.searchParams.get('all');
  const id = toIntOrNull(url.searchParams.get('id'));

  if (all) {
    await context.env.DB.prepare('UPDATE alerts SET active = 0 WHERE active = 1 AND (starts_at IS NULL OR starts_at <= ?)').bind(nowIso()).run();
    return noContent();
  }
  if (!id) return badRequest('id eller all=1 er påkrevd');

  await context.env.DB
    .prepare('UPDATE alerts SET active = 0 WHERE id = ?')
    .bind(id)
    .run();
  return noContent();
}

export const onRequestOptions = handleOptions;
