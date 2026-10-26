// Malmarkedet – gratis deling av lysbilder, hele kits og temaer mellom alle
// kunder på plattformen. Ligger i platform.db; bildene som følger med kopieres
// én gang til data/market/<id>/ og deles av alle som tar malen i bruk (de
// pekes på direkte i stedet for å kopieres inn i hver kundes bibliotek).
//
//   GET    /api/market?kind=&q=&sort=new|popular   -> liste
//   POST   /api/market  { kind, title, description, source }
//            kind kit   + source { playlist_id }    -> hele presentasjonen
//            kind slide + source { template_id }    -> ett lysbilde (fra «Mine maler»)
//            kind theme + source { theme }          -> farger, font og bakgrunn
//   POST   /api/market/install { id, playlist_id? } -> kopier inn hos kunden
//   DELETE /api/market?id=                          -> trekk tilbake egen mal
//   GET    /api/market/file/<id>/<fil>              -> åpen, delte bilder

import { mkdirSync, createReadStream, existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { platformDb } from './platform.js';
import { safeJson } from '../src/api/_shared.js';

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const MARKET_DIR = path.join(DATA_DIR, 'market');
mkdirSync(MARKET_DIR, { recursive: true });

platformDb.db.exec(`
CREATE TABLE IF NOT EXISTS market_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  kind         TEXT NOT NULL,                  -- slide | kit | theme
  title        TEXT NOT NULL,
  description  TEXT,
  orientation  TEXT NOT NULL DEFAULT 'landscape',
  payload      TEXT NOT NULL,                  -- { slides: [...] } eller { theme: {...} }
  tenant_id    INTEGER,
  author       TEXT,                           -- kundens navn, vises på kortet
  user_id      INTEGER,
  installs     INTEGER NOT NULL DEFAULT 0,
  hidden       INTEGER NOT NULL DEFAULT 0,     -- trukket tilbake / fjernet av admin
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
`);

const KINDS = ['slide', 'kit', 'theme'];
const MAX_FILES = 40;
const MEDIA_RE = /\/api\/media\?id=(\d+)&raw=1/g;
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'video/mp4': 'mp4', 'video/webm': 'webm' };
const TYPE = Object.fromEntries(Object.entries(EXT).map(([t, e]) => [e, t]));

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
const fail = (status, error) => json({ error }, status);

const ELEMENT_KEYS = ['kind', 'x', 'y', 'w', 'h', 'z', 'rotation', 'config'];
const cleanSlide = (s) => ({
  name: s.name ?? null,
  duration_seconds: Number(s.duration_seconds) || 15,
  transition: s.transition || 'fade',
  transition_ms: Number(s.transition_ms) || 600,
  background: safeJson(s.background, { type: 'color', color: '#0f2733' }),
  elements: (s.elements || []).map((e) => Object.fromEntries(ELEMENT_KEYS.map((k) => [k, k === 'config' ? safeJson(e.config, {}) : e[k]])))
});

/** Lysbildene i en presentasjon, med elementer. */
async function playlistSlides(env, playlistId) {
  const { results: slides } = await env.DB
    .prepare('SELECT * FROM deck_slides WHERE playlist_id = ? AND enabled = 1 ORDER BY position, id')
    .bind(playlistId)
    .all();
  const out = [];
  for (const s of slides ?? []) {
    const { results: els } = await env.DB.prepare('SELECT * FROM deck_elements WHERE slide_id = ? ORDER BY z').bind(s.id).all();
    out.push(cleanSlide({ ...s, elements: els ?? [] }));
  }
  return out;
}

/**
 * Kopierer bilder/video fra kundens bibliotek til markedsmappen og bytter
 * adressene i payload. Returnerer ny payload-tekst.
 */
async function detachMedia(env, itemId, payload) {
  let text = JSON.stringify(payload);
  const ids = [...new Set([...text.matchAll(MEDIA_RE)].map((m) => Number(m[1])))].slice(0, MAX_FILES);
  if (!ids.length) return text;
  const dir = path.join(MARKET_DIR, String(itemId));
  mkdirSync(dir, { recursive: true });
  for (const [n, id] of ids.entries()) {
    const row = await env.DB.prepare('SELECT r2_key, content_type FROM media WHERE id = ?').bind(id).first();
    const obj = row && (await env.MEDIA.get(row.r2_key));
    if (!obj) continue;
    const ext = EXT[row.content_type] || 'bin';
    const file = `${n + 1}.${ext}`;
    await writeFile(path.join(dir, file), Buffer.from(await new Response(obj.body).arrayBuffer()));
    text = text.replaceAll(`/api/media?id=${id}&raw=1`, `/api/market/file/${itemId}/${file}`);
  }
  return text;
}

const decorate = (r, tenantId) => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  description: r.description,
  orientation: r.orientation,
  payload: safeJson(r.payload, {}),
  author: r.author,
  installs: r.installs,
  created_at: r.created_at,
  mine: r.tenant_id === tenantId
});

function list(url, tenantId) {
  const kind = url.searchParams.get('kind');
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  const order = url.searchParams.get('sort') === 'popular' ? 'installs DESC, id DESC' : 'id DESC';
  const where = ['hidden = 0'];
  const args = [];
  if (KINDS.includes(kind)) {
    where.push('kind = ?');
    args.push(kind);
  }
  if (url.searchParams.get('mine')) {
    where.push('tenant_id = ?');
    args.push(tenantId);
  }
  if (q) {
    where.push('(lower(title) LIKE ? OR lower(description) LIKE ? OR lower(author) LIKE ?)');
    args.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const rows = platformDb
    .prepare(`SELECT * FROM market_items WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 200`)
    .bind(...args)
    .allSync().results;
  return json(rows.map((r) => decorate(r, tenantId)));
}

const THEME_KEYS = ['background', 'font', 'heading_color', 'text_color', 'accent'];
const cleanTheme = (t) => Object.fromEntries(THEME_KEYS.map((k) => [k, k === 'background' ? safeJson(t?.[k], { type: 'color', color: '#0f2733' }) : String(t?.[k] ?? '').slice(0, 120)]));

async function publish(request, ctx, env) {
  const b = await request.json().catch(() => null);
  const kind = b?.kind;
  const title = String(b?.title || '').trim().slice(0, 80);
  if (!KINDS.includes(kind)) return fail(400, 'Ukjent type');
  if (!title) return fail(400, 'Gi malen et navn');
  const src = b.source || {};

  let payload;
  let orientation = 'landscape';
  if (kind === 'kit') {
    const pl = await env.DB.prepare('SELECT * FROM playlists WHERE id = ?').bind(Number(src.playlist_id)).first();
    if (!pl) return fail(404, 'Presentasjonen finnes ikke');
    const slides = await playlistSlides(env, pl.id);
    if (!slides.length) return fail(400, 'Presentasjonen har ingen lysbilder');
    payload = { slides };
    orientation = pl.orientation;
  } else if (kind === 'slide') {
    const tpl = await env.DB.prepare('SELECT * FROM templates WHERE id = ?').bind(Number(src.template_id)).first();
    if (!tpl) return fail(404, 'Malen finnes ikke');
    payload = { slides: [cleanSlide(safeJson(tpl.payload, {}))] };
    orientation = src.orientation === 'portrait' ? 'portrait' : 'landscape';
  } else {
    payload = { theme: cleanTheme(src.theme) };
  }

  const { id } = platformDb
    .prepare(
      `INSERT INTO market_items (kind, title, description, orientation, payload, tenant_id, author, user_id)
       VALUES (?, ?, ?, ?, '{}', ?, ?, ?) RETURNING id`
    )
    .bind(kind, title, String(b.description || '').trim().slice(0, 300) || null, orientation, ctx.tenant.id, ctx.tenant.name, ctx.user?.user_id ?? null)
    .firstSync();
  const text = await detachMedia(env, id, payload);
  platformDb.prepare('UPDATE market_items SET payload = ? WHERE id = ?').bind(text, id).runSync();
  return json(decorate(platformDb.prepare('SELECT * FROM market_items WHERE id = ?').bind(id).firstSync(), ctx.tenant.id), 201);
}

async function insertSlide(env, playlistId, position, s) {
  const slide = await env.DB
    .prepare(
      `INSERT INTO deck_slides (playlist_id, position, name, duration_seconds, transition, transition_ms, background, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1) RETURNING id`
    )
    .bind(playlistId, position, s.name ?? null, Number(s.duration_seconds) || 15, s.transition || 'fade', Number(s.transition_ms) || 600, JSON.stringify(s.background || {}))
    .first();
  const els = s.elements || [];
  if (els.length) {
    const stmt = env.DB.prepare(
      `INSERT INTO deck_elements (slide_id, z, kind, x, y, w, h, rotation, config) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    await env.DB.batch(
      els.map((e, i) =>
        stmt.bind(slide.id, Number.isFinite(e.z) ? e.z : i, e.kind || 'text', Number(e.x) || 0, Number(e.y) || 0, Number(e.w) || 30, Number(e.h) || 20, Number(e.rotation) || 0, JSON.stringify(e.config || {}))
      )
    );
  }
  return slide.id;
}

/** Legger et tema over alle lysbildene i en presentasjon. */
export async function applyTheme(env, playlistId, theme) {
  const t = cleanTheme(theme);
  await env.DB.prepare('UPDATE deck_slides SET background = ? WHERE playlist_id = ?').bind(JSON.stringify(t.background), playlistId).run();
  const { results } = await env.DB
    .prepare('SELECT e.id, e.kind, e.config FROM deck_elements e JOIN deck_slides s ON s.id = e.slide_id WHERE s.playlist_id = ?')
    .bind(playlistId)
    .all();
  const stmt = env.DB.prepare('UPDATE deck_elements SET config = ? WHERE id = ?');
  const updates = [];
  for (const e of results ?? []) {
    const c = safeJson(e.config, {});
    if (e.kind === 'text') {
      if (t.font !== undefined) c.font = t.font;
      const color = (Number(c.size) || 0) >= 90 ? t.heading_color : t.text_color;
      if (color) {
        c.color = color;
        c.fill = null;
      }
    } else if (e.kind === 'shape' && t.accent) {
      c.fill = t.accent;
    } else if (['weather', 'rss', 'calendar', 'clock'].includes(e.kind) && t.text_color) {
      c.color = t.text_color;
    } else continue;
    updates.push(stmt.bind(JSON.stringify(c), e.id));
  }
  if (updates.length) await env.DB.batch(updates);
}

async function install(request, ctx, env) {
  const b = await request.json().catch(() => null);
  const item = platformDb.prepare('SELECT * FROM market_items WHERE id = ? AND hidden = 0').bind(Number(b?.id)).firstSync();
  if (!item) return fail(404, 'Malen finnes ikke lenger');
  const payload = safeJson(item.payload, {});
  let playlistId = Number(b?.playlist_id) || null;
  if (playlistId && !(await env.DB.prepare('SELECT id FROM playlists WHERE id = ?').bind(playlistId).first())) {
    return fail(404, 'Presentasjonen finnes ikke');
  }

  let slideId = null;
  if (item.kind === 'kit' || (item.kind === 'slide' && !playlistId)) {
    const name = String(b?.name || item.title).trim().slice(0, 80);
    const pl = await env.DB.prepare('INSERT INTO playlists (name, orientation) VALUES (?, ?) RETURNING id').bind(name, item.orientation).first();
    playlistId = pl.id;
    for (const [i, s] of (payload.slides || []).entries()) {
      const id = await insertSlide(env, playlistId, i, s);
      slideId ??= id;
    }
  } else if (item.kind === 'slide') {
    const max = await env.DB.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM deck_slides WHERE playlist_id = ?').bind(playlistId).first();
    slideId = await insertSlide(env, playlistId, (max?.m ?? -1) + 1, payload.slides?.[0] || {});
  } else {
    if (!playlistId) return fail(400, 'Velg hvilken presentasjon temaet skal brukes på');
    await applyTheme(env, playlistId, payload.theme);
  }

  platformDb.prepare('UPDATE market_items SET installs = installs + 1 WHERE id = ?').bind(item.id).runSync();
  return json({ ok: true, playlist_id: playlistId, slide_id: slideId });
}

/** Delte filer – åpne, siden TV-er og skjermvisning henter dem uten innlogging. */
export async function serveMarketFile(request) {
  const m = new URL(request.url).pathname.match(/^\/api\/market\/file\/(\d+)\/(\d+\.([a-z0-9]+))$/);
  if (!m || request.method !== 'GET') return null;
  const file = path.join(MARKET_DIR, m[1], m[2]);
  if (!existsSync(file)) return fail(404, 'Fant ikke fila');
  return new Response(Readable.toWeb(createReadStream(file)), {
    headers: { 'Content-Type': TYPE[m[3]] || 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable' }
  });
}

/** Ruter /api/market* for en innlogget kunde. Returnerer null for andre stier. */
export async function handleMarketRoute(request, ctx, env) {
  const url = new URL(request.url);
  const p = url.pathname.replace(/\/+$/, '');
  if (p === '/api/market/install' && request.method === 'POST') return install(request, ctx, env);
  if (p !== '/api/market') return null;
  if (request.method === 'GET') return list(url, ctx.tenant.id);
  if (request.method === 'POST') return publish(request, ctx, env);
  if (request.method === 'DELETE') {
    const res = platformDb
      .prepare('UPDATE market_items SET hidden = 1 WHERE id = ? AND tenant_id = ?')
      .bind(Number(url.searchParams.get('id')), ctx.tenant.id)
      .runSync();
    return res.meta?.changes ? json({ ok: true }) : fail(404, 'Fant ikke malen');
  }
  return fail(405, 'Metoden støttes ikke');
}

/** Superadmin: alle maler, også skjulte. */
export function marketAdminList() {
  return platformDb.prepare('SELECT id, kind, title, author, installs, hidden, created_at FROM market_items ORDER BY id DESC').allSync().results;
}
export function marketAdminSetHidden(id, hidden) {
  platformDb.prepare('UPDATE market_items SET hidden = ? WHERE id = ?').bind(hidden ? 1 : 0, Number(id)).runSync();
}

/* ------------------------------ startmaler ------------------------------ */
// Noen maler fra Flatr, så markedet og oppstartsveiviseren ikke er tomme.
// Legges inn én gang (også om de senere skjules av superadmin).

const T = (text, x, y, w, h, c = {}) => ({ kind: 'text', x, y, w, h, rotation: 0, config: { text, size: 64, weight: 700, align: 'left', valign: 'top', color: '#ffffff', lineHeight: 1.15, ...c } });
const S = (x, y, w, h, fill, c = {}) => ({ kind: 'shape', x, y, w, h, rotation: 0, config: { shape: 'rect', fill, radius: 16, opacity: 100, ...c } });
const W = (kind, x, y, w, h, config) => ({ kind, x, y, w, h, rotation: 0, config });
const slide = (name, background, elements, duration_seconds = 12) => ({
  name,
  duration_seconds,
  transition: 'fade',
  transition_ms: 800,
  background,
  elements: elements.map((e, z) => ({ ...e, z }))
});

const STARTERS = [
  {
    kind: 'kit',
    title: 'Velkommen',
    description: 'Resepsjon og inngangsparti: velkomst, dagens møter og klokke.',
    payload: {
      slides: [
        slide('Velkommen', { type: 'dynamic', preset: 'aurora', base: '#0a1a2f', colors: ['#34d399', '#22d3ee', '#3b82f6'], angle: 130, speed: 1 }, [
          T('Velkommen', 8, 30, 84, 20, { size: 160, weight: 800, align: 'center', valign: 'middle' }),
          T('til Firmanavn AS', 8, 52, 84, 10, { size: 64, weight: 400, align: 'center', color: '#cfe3ea' }),
          W('clock', 72, 80, 24, 14, { showDate: true, showSeconds: false, frame: false })
        ]),
        slide('Dagens møter', { type: 'gradient', from: '#0f2733', to: '#1f5566', angle: 135 }, [
          T('Dagens møter', 7, 9, 60, 12, { size: 96, weight: 800 }),
          S(7, 22, 6, 1.2, '#34d399', { radius: 4 }),
          T('09:00   Styremøte · Rom Fjord\n11:30   Kundebesøk · Rom Lyng\n14:00   Teammøte · Rom Hav', 7, 29, 62, 50, { size: 56, weight: 500, lineHeight: 1.7, color: '#e2eef2' }),
          W('clock', 72, 9, 22, 14, { showDate: true, showSeconds: false, frame: true })
        ])
      ]
    }
  },
  {
    kind: 'kit',
    title: 'Kafémeny',
    description: 'Dagens meny og ukens kake. Bytt ut rettene og prisene.',
    payload: {
      slides: [
        slide('Dagens meny', { type: 'gradient', from: '#2b1d16', to: '#4a2f22', angle: 160 }, [
          T('Dagens meny', 7, 9, 70, 13, { size: 110, weight: 800, font: 'Georgia, serif', color: '#fde68a' }),
          S(7, 24, 8, 1.2, '#f59e0b', { radius: 4 }),
          T('Suppe av dagen\nKyllingsalat med sitron\nVegetarlasagne\nKaffe og te', 7, 31, 56, 52, { size: 58, weight: 500, lineHeight: 1.75, color: '#fbeee0' }),
          T('89,-\n129,-\n139,-\n35,-', 66, 31, 24, 52, { size: 58, weight: 700, lineHeight: 1.75, align: 'right', color: '#fde68a' })
        ]),
        slide('Ukens kake', { type: 'color', color: '#f7efe4' }, [
          S(52, 0, 48, 100, '#e7d3bd', { radius: 0 }),
          T('Ukens kake', 7, 28, 42, 10, { size: 54, weight: 600, color: '#9a5b2e' }),
          T('Gulrotkake med kremost', 7, 39, 42, 26, { size: 96, weight: 800, font: 'Georgia, serif', color: '#2b1d16', lineHeight: 1.05 }),
          T('49,- per stykke', 7, 70, 42, 8, { size: 52, weight: 500, color: '#6b4a33' }),
          T('Legg inn et bilde her', 56, 45, 40, 10, { size: 40, weight: 500, align: 'center', color: '#9a7b62' })
        ])
      ]
    }
  },
  {
    kind: 'kit',
    title: 'Arrangement',
    description: 'Konferanse, festival eller turnering: nedtelling til neste post og hele programmet.',
    payload: {
      slides: [
        slide('Neste post', { type: 'dynamic', preset: 'mesh', base: '#0a0f1e', colors: ['#22d3ee', '#a855f7', '#f43f5e', '#34d399'], angle: 130, speed: 1 }, [
          T('Arrangementsnavn 2026', 6, 8, 70, 10, { size: 80, weight: 800 }),
          W('countdown', 6, 30, 52, 40, { mode: 'nextItem', target: '', title: '', doneText: 'Nå kjører vi!', emphasis: 'info' }),
          W('clock', 72, 8, 22, 14, { showDate: false, showSeconds: true, frame: true }),
          W('qr', 74, 52, 20, 34, { mode: 'schedule', url: '', label: 'Hele programmet', caption: '', frame: true })
        ]),
        slide('Program', { type: 'gradient', from: '#111827', to: '#1e1b4b', angle: 135 }, [
          T('Program', 6, 7, 50, 11, { size: 90, weight: 800 }),
          W('program', 6, 22, 88, 70, { mode: 'agenda', categoryIds: [], max: 8, stage: '', showCategory: true, frame: false })
        ], 20)
      ]
    }
  },
  {
    kind: 'theme',
    title: 'Fjord',
    description: 'Dype blåtoner med grønn aksent.',
    payload: { theme: { background: { type: 'gradient', from: '#1f5566', to: '#0f2733', angle: 135 }, font: '', heading_color: '#ffffff', text_color: '#cfe3ea', accent: '#34d399' } }
  },
  {
    kind: 'theme',
    title: 'Solnedgang',
    description: 'Varme farger som synes på lang avstand.',
    payload: { theme: { background: { type: 'gradient', from: '#f59e0b', to: '#b91c1c', angle: 135 }, font: '', heading_color: '#ffffff', text_color: '#fff1e0', accent: '#fde68a' } }
  },
  {
    kind: 'theme',
    title: 'Papir',
    description: 'Lyst og rolig, med serif-overskrifter.',
    payload: { theme: { background: { type: 'color', color: '#f7f3ea' }, font: 'Georgia, serif', heading_color: '#1f2937', text_color: '#4b5563', accent: '#027353' } }
  }
];

function seedStarters() {
  const { c } = platformDb.prepare(`SELECT COUNT(*) AS c FROM market_items WHERE tenant_id IS NULL AND author = 'Flatr'`).firstSync();
  if (c) return;
  const stmt = platformDb.prepare(
    `INSERT INTO market_items (kind, title, description, orientation, payload, tenant_id, author) VALUES (?, ?, ?, 'landscape', ?, NULL, 'Flatr')`
  );
  for (const s of STARTERS) stmt.bind(s.kind, s.title, s.description, JSON.stringify(s.payload)).runSync();
}
seedStarters();
