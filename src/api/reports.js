import { json, badRequest, handleOptions, requireAdmin, getTimezone } from './_shared.js';
import { localParts, addDays } from '../lib/timeslots.js';

// GET /api/reports?from=YYYY-MM-DD&to=YYYY-MM-DD
// Visningslogg (play_log, fylles av server/monitor.js): minutter pr. spilleliste,
// kanal, enhet og dag i perioden. Datoene er i kontoens tidssone.
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function onRequestGet(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const env = context.env;
  const params = new URL(context.request.url).searchParams;
  const tz = await getTimezone(env);
  const today = localParts(new Date(), tz).date;
  const to = DATE.test(params.get('to') || '') ? params.get('to') : today;
  const from = DATE.test(params.get('from') || '') ? params.get('from') : addDays(to, -6);
  if (from > to) return badRequest('from er etter to');

  // hour = "YYYY-MM-DDTHH" – sammenlignes som tekst.
  const range = [`${from}T00`, `${to}T23`];
  const q = (sql) => env.DB.prepare(sql).bind(...range).all().then((r) => r.results ?? []);

  const [byPlaylist, byScreen, byDevice, byDay] = await Promise.all([
    q(`SELECT l.playlist_id, l.off, p.name AS name, SUM(l.minutes) AS minutes
         FROM play_log l LEFT JOIN playlists p ON p.id = l.playlist_id
        WHERE l.hour BETWEEN ? AND ? GROUP BY l.playlist_id, l.off ORDER BY minutes DESC`),
    q(`SELECT l.screen_id, s.name AS name, SUM(l.minutes) AS minutes
         FROM play_log l LEFT JOIN screens s ON s.id = l.screen_id
        WHERE l.hour BETWEEN ? AND ? GROUP BY l.screen_id ORDER BY minutes DESC`),
    q(`SELECT l.device_id, pr.label, pr.client_info, pr.code, SUM(l.minutes) AS minutes, COUNT(DISTINCT l.hour) AS hours
         FROM play_log l LEFT JOIN pairings pr ON pr.device_id = l.device_id
        WHERE l.hour BETWEEN ? AND ? GROUP BY l.device_id ORDER BY minutes DESC`),
    q(`SELECT substr(l.hour, 1, 10) AS day, SUM(l.minutes) AS minutes
         FROM play_log l WHERE l.hour BETWEEN ? AND ? GROUP BY day ORDER BY day`)
  ]);

  const devices = byDevice.map((d) => {
    let info = {};
    try {
      info = JSON.parse(d.client_info || '{}');
    } catch {
      /* ignore */
    }
    return { device_id: d.device_id, name: d.label || info.device_name || (d.code ? `Enhet ${d.code}` : 'Ukjent enhet'), minutes: d.minutes };
  });

  return json({
    from,
    to,
    timezone: tz,
    total_minutes: byDay.reduce((s, d) => s + d.minutes, 0),
    playlists: byPlaylist.map((p) => ({
      playlist_id: p.playlist_id,
      name: p.off ? 'Skjerm av' : p.name || (p.playlist_id ? 'Slettet spilleliste' : 'Ingenting'),
      minutes: p.minutes
    })),
    screens: byScreen.map((s) => ({ screen_id: s.screen_id, name: s.name || 'Slettet kanal', minutes: s.minutes })),
    devices,
    days: byDay
  });
}

export const onRequestOptions = handleOptions;
