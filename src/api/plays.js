import { json, badRequest, noContent, handleOptions, readJson, toIntOrNull, getTimezone } from './_shared.js';
import { localParts } from '../lib/timeslots.js';

// POST /api/plays?screen=<id>  { items: [{ at, playlist_id, slide_id?, sponsor_id?, seconds }] }
// Skjermene (Apple TV og nettleser) melder hva som faktisk ble vist: ett punkt
// per gang et lysbilde eller en sponsor var på skjermen. Lagres samlet per dag
// (play_stats), så tabellen holder seg liten. Rapporten ligger i reports.js.

const MAX_ITEMS = 2000;
const WEEK_MS = 7 * 86_400_000;

export async function onRequestPost({ request, env }) {
  const screenId = toIntOrNull(new URL(request.url).searchParams.get('screen'));
  if (!screenId) return badRequest('screen er påkrevd');
  // TV-appen: tokenet må høre til akkurat denne skjermen (settes i server/devices.js).
  if (env.DEVICE_SCREEN_ID != null && Number(env.DEVICE_SCREEN_ID) !== screenId) return json({ error: 'Feil skjerm' }, { status: 403 });
  const screen = await env.DB.prepare('SELECT id FROM screens WHERE id = ?').bind(screenId).first();
  if (!screen) return badRequest('Skjermen finnes ikke');

  const b = await readJson(request);
  const items = Array.isArray(b?.items) ? b.items.slice(0, MAX_ITEMS) : [];
  const tz = await getTimezone(env);
  const now = Date.now();

  // Slå sammen per dag/lysbilde/sponsor før vi skriver.
  const sums = new Map();
  for (const it of items) {
    const at = Date.parse(it?.at);
    const seconds = Number(it?.seconds);
    if (!Number.isFinite(at) || at > now + 60_000 || at < now - WEEK_MS) continue;
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 3600) continue;
    const sponsor = Math.max(0, toIntOrNull(it.sponsor_id) ?? 0);
    const key = [
      localParts(new Date(at), tz).date,
      Math.max(0, toIntOrNull(it.playlist_id) ?? 0),
      sponsor ? 0 : Math.max(0, toIntOrNull(it.slide_id) ?? 0),
      sponsor
    ].join('|');
    const s = sums.get(key) ?? { shows: 0, seconds: 0 };
    s.shows += 1;
    s.seconds += seconds;
    sums.set(key, s);
  }
  if (!sums.size) return noContent();

  await env.DB.batch(
    [...sums].map(([key, s]) => {
      const [day, playlist, slide, sponsor] = key.split('|');
      return env.DB.prepare(
        `INSERT INTO play_stats (day, screen_id, playlist_id, slide_id, sponsor_id, shows, seconds) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(day, screen_id, playlist_id, slide_id, sponsor_id)
         DO UPDATE SET shows = shows + excluded.shows, seconds = seconds + excluded.seconds`
      ).bind(day, screenId, Number(playlist), Number(slide), Number(sponsor), s.shows, Math.round(s.seconds * 10) / 10);
    })
  );
  return noContent();
}

export const onRequestOptions = handleOptions;
