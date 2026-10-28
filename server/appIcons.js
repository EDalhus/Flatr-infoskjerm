// Egne ikoner (logoer) for Flatr Apps. Ett bilde per app, med valgt bakgrunn
// (transparent, hvit eller svart). Ligger i platform.db + data/app-icons/.
//
// Nøkkel: 'official:<key>' (offisielle apper) eller 'custom:<id>' (egne apper).
// Hvem kan endre: se canEditIcon (egne apper: eiere i organisasjonen som laget
// appen og den som laget den; alle apper: superadmin).
//
//   GET    /api/app-icon/<nøkkel>?v=…   – bildet (åpent, mellomlagres)

import { mkdirSync, existsSync, createReadStream, unlinkSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { platformDb, normEmail } from './platform.js';

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const ICON_DIR = path.join(DATA_DIR, 'app-icons');
mkdirSync(ICON_DIR, { recursive: true });

platformDb.db.exec(`
CREATE TABLE IF NOT EXISTS app_icons (
  key         TEXT PRIMARY KEY,
  file        TEXT,                       -- filnavn i data/app-icons (NULL = bare bakgrunn)
  type        TEXT,
  bg          TEXT NOT NULL DEFAULT 'transparent',   -- transparent | white | black
  updated_at  TEXT NOT NULL,
  updated_by  TEXT
);
`);

export const ICON_BGS = ['transparent', 'white', 'black'];
const MAX_BYTES = 2 * 1024 * 1024;
const KEY_RE = /^(official:[a-z0-9_-]{1,40}|custom:\d{1,10})$/;

/** Kjenner igjen bildeformatet på innholdet (ikke filnavnet). SVG tillates ikke. */
function sniff(buf) {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { type: 'image/png', ext: 'png' };
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
  if (buf.length > 6 && buf.toString('ascii', 0, 4) === 'GIF8') return { type: 'image/gif', ext: 'gif' };
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { type: 'image/webp', ext: 'webp' };
  return null;
}

const superadmins = () =>
  String(process.env.SUPERADMIN_EMAILS || '')
    .split(',')
    .map(normEmail)
    .filter(Boolean);
export const isSuperadmin = (email) => !!email && superadmins().includes(normEmail(email));

/**
 * Kan denne brukeren endre ikonet? user = { email, role } i gjeldende
 * organisasjon (tenantId). Offisielle apper: bare superadmin.
 */
export function canEditIcon(key, user, tenantId) {
  if (!user?.email) return false;
  if (isSuperadmin(user.email)) return true;
  const m = /^custom:(\d+)$/.exec(key);
  if (!m) return false;
  const app = platformDb.prepare('SELECT tenant_id, created_by FROM custom_apps WHERE id = ?').bind(Number(m[1])).firstSync();
  if (!app) return false;
  if (app.created_by && normEmail(app.created_by) === normEmail(user.email)) return true;
  return app.tenant_id === tenantId && user.role === 'owner';
}

const row = (key) => platformDb.prepare('SELECT * FROM app_icons WHERE key = ?').bind(key).firstSync();

/** { url, bg } for en app, eller null. url mangler hvis bare bakgrunn er satt. */
export function iconFor(key) {
  const r = row(key);
  if (!r) return null;
  return { url: r.file ? `/api/app-icon/${encodeURIComponent(key)}?v=${encodeURIComponent(r.updated_at)}` : null, bg: r.bg };
}

/** Alle offisielle ikoner som er endret: { ais: { url, bg }, … }. */
export function officialIcons() {
  const out = {};
  for (const r of platformDb.prepare(`SELECT key FROM app_icons WHERE key LIKE 'official:%'`).allSync().results) {
    out[r.key.slice('official:'.length)] = iconFor(r.key);
  }
  return out;
}

const removeFile = (file) => {
  if (!file) return;
  try {
    unlinkSync(path.join(ICON_DIR, file));
  } catch {
    /* finnes ikke */
  }
};

/** Last opp nytt bilde (bytes) og/eller bytt bakgrunn. Kaster med norsk melding. */
export async function saveIcon(key, { bytes, bg }, by) {
  if (!KEY_RE.test(key)) throw Object.assign(new Error('Ukjent app'), { status: 400 });
  const prev = row(key);
  let file = prev?.file ?? null;
  let type = prev?.type ?? null;
  if (bytes) {
    if (bytes.length > MAX_BYTES) throw Object.assign(new Error('Bildet er for stort (maks 2 MB).'), { status: 413 });
    const kind = sniff(bytes);
    if (!kind) throw Object.assign(new Error('Bruk PNG, JPEG, WebP eller GIF.'), { status: 415 });
    const name = `${key.replace(':', '-')}-${randomUUID().slice(0, 8)}.${kind.ext}`;
    await writeFile(path.join(ICON_DIR, name), bytes);
    removeFile(file);
    file = name;
    type = kind.type;
  }
  const background = ICON_BGS.includes(bg) ? bg : prev?.bg || 'transparent';
  platformDb
    .prepare(
      `INSERT INTO app_icons (key, file, type, bg, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET file = excluded.file, type = excluded.type, bg = excluded.bg,
         updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    )
    .bind(key, file, type, background, new Date().toISOString(), by || null)
    .runSync();
  return iconFor(key);
}

/** Fjern egen logo (tilbake til standardikonet). */
export function removeIcon(key) {
  const prev = row(key);
  if (prev) removeFile(prev.file);
  platformDb.prepare('DELETE FROM app_icons WHERE key = ?').bind(key).runSync();
}

/** GET /api/app-icon/<nøkkel> – åpent; null hvis stien ikke gjelder. */
export function serveAppIcon(request) {
  const p = new URL(request.url).pathname;
  if (!p.startsWith('/api/app-icon/')) return null;
  const key = decodeURIComponent(p.slice('/api/app-icon/'.length));
  const r = KEY_RE.test(key) ? row(key) : null;
  const full = r?.file && path.join(ICON_DIR, r.file);
  if (!full || !existsSync(full)) return new Response('Finnes ikke', { status: 404 });
  return new Response(Readable.toWeb(createReadStream(full)), {
    headers: {
      'Content-Type': r.type,
      'Cache-Control': 'public, max-age=86400, immutable',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

/**
 * Felles håndtering for PUT/DELETE fra admin. body = rå bildebytes (valgfritt),
 * ?bg=transparent|white|black.
 */
export async function handleIconRequest(request, key, by) {
  const url = new URL(request.url);
  if (request.method === 'DELETE') {
    removeIcon(key);
    return null;
  }
  const type = request.headers.get('content-type') || '';
  const bytes = type.startsWith('image/') ? Buffer.from(await request.arrayBuffer()) : null;
  return saveIcon(key, { bytes, bg: url.searchParams.get('bg') }, by);
}
