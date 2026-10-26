import {
  json,
  noContent,
  badRequest,
  notFound,
  handleOptions,
  readJson,
  requireAdmin,
  toIntOrNull,
  getTimezone
} from './_shared.js';
import { toMin, parseDays, PRIORITY } from '../lib/timeslots.js';

// Tidsplan: regler for hva en kanal viser når (se src/lib/timeslots.js).

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const cleanTime = (v) => (toMin(v) != null ? String(v).trim().padStart(5, '0') : null);
const cleanDate = (v) => (DATE.test(String(v || '')) ? String(v) : null);
const cleanDays = (v) => {
  const list = Array.isArray(v) ? v.map(Number) : parseDays(v);
  const uniq = [...new Set(list.filter((d) => d >= 1 && d <= 7))].sort();
  return uniq.length && uniq.length < 7 ? uniq.join(',') : null;
};

/** Validerer og normaliserer felt fra klienten (cur = eksisterende rad ved PUT). */
async function fields(env, b, cur = {}) {
  const pick = (k) => (b[k] !== undefined ? b[k] : cur[k]);
  const kind = pick('kind') === 'off' ? 'off' : 'playlist';
  const playlistId = kind === 'off' ? null : toIntOrNull(pick('playlist_id'));
  if (kind === 'playlist') {
    if (!playlistId) return { error: 'Velg en spilleliste' };
    const pl = await env.DB.prepare('SELECT id FROM playlists WHERE id = ?').bind(playlistId).first();
    if (!pl) return { error: 'Spillelisten finnes ikke' };
  }
  const startDate = cleanDate(pick('start_date'));
  const endDate = cleanDate(pick('end_date'));
  if (startDate && endDate && endDate < startDate) return { error: 'Sluttdato er før startdato' };
  const startTime = cleanTime(pick('start_time'));
  const endTime = cleanTime(pick('end_time'));
  if (startTime && endTime && startTime === endTime) return { error: 'Start og slutt kan ikke være likt' };
  return {
    values: {
      playlist_id: playlistId,
      kind,
      title: pick('title') ? String(pick('title')).trim().slice(0, 100) : null,
      days: cleanDays(pick('days')),
      start_time: startTime,
      end_time: endTime,
      start_date: startDate,
      end_date: endDate,
      priority: Number(pick('priority')) >= PRIORITY.high ? PRIORITY.high : PRIORITY.normal,
      enabled: pick('enabled') === undefined ? 1 : pick('enabled') ? 1 : 0
    }
  };
}

const SELECT = `SELECT t.*, p.name AS playlist_name FROM timeslots t LEFT JOIN playlists p ON p.id = t.playlist_id`;

// GET /api/timeslots?screen=1  -> regler for én kanal (+ kontoens tidssone)
// GET /api/timeslots           -> alle regler
export async function onRequestGet({ request, env }) {
  const screen = toIntOrNull(new URL(request.url).searchParams.get('screen'));
  const stmt = screen
    ? env.DB.prepare(`${SELECT} WHERE t.screen_id = ? ORDER BY t.priority DESC, t.start_time, t.id`).bind(screen)
    : env.DB.prepare(`${SELECT} ORDER BY t.screen_id, t.priority DESC, t.start_time, t.id`);
  const { results } = await stmt.all();
  return json({ timezone: await getTimezone(env), slots: results ?? [] });
}

// POST /api/timeslots  { screen_id, kind, playlist_id?, title?, days?, start_time?, end_time?,
//                        start_date?, end_date?, priority? }
export async function onRequestPost(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const env = context.env;
  const b = (await readJson(context.request)) || {};
  const screenId = toIntOrNull(b.screen_id);
  if (!screenId) return badRequest('screen_id er påkrevd');
  const screen = await env.DB.prepare('SELECT id FROM screens WHERE id = ?').bind(screenId).first();
  if (!screen) return notFound('Skjerm finnes ikke');

  const { values: v, error } = await fields(env, b);
  if (error) return badRequest(error);
  const row = await env.DB.prepare(
    `INSERT INTO timeslots (screen_id, playlist_id, kind, title, days, start_time, end_time, start_date, end_date, priority, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
  )
    .bind(screenId, v.playlist_id, v.kind, v.title, v.days, v.start_time, v.end_time, v.start_date, v.end_date, v.priority, v.enabled)
    .first();
  return json(await env.DB.prepare(`${SELECT} WHERE t.id = ?`).bind(row.id).first(), { status: 201 });
}

// PUT /api/timeslots?id=1
export async function onRequestPut(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const env = context.env;
  const id = toIntOrNull(new URL(context.request.url).searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');
  const cur = await env.DB.prepare('SELECT * FROM timeslots WHERE id = ?').bind(id).first();
  if (!cur) return notFound('Regelen finnes ikke');
  const { values: v, error } = await fields(env, (await readJson(context.request)) || {}, cur);
  if (error) return badRequest(error);
  await env.DB.prepare(
    `UPDATE timeslots SET playlist_id = ?, kind = ?, title = ?, days = ?, start_time = ?, end_time = ?,
       start_date = ?, end_date = ?, priority = ?, enabled = ? WHERE id = ?`
  )
    .bind(v.playlist_id, v.kind, v.title, v.days, v.start_time, v.end_time, v.start_date, v.end_date, v.priority, v.enabled, id)
    .run();
  return json(await env.DB.prepare(`${SELECT} WHERE t.id = ?`).bind(id).first());
}

// DELETE /api/timeslots?id=1
export async function onRequestDelete(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const id = toIntOrNull(new URL(context.request.url).searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');
  await context.env.DB.prepare('DELETE FROM timeslots WHERE id = ?').bind(id).run();
  return noContent();
}

export const onRequestOptions = handleOptions;
