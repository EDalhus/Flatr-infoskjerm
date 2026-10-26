// Superadmin for plattformeieren: oversikt over alle kontoer, bruk og kvoter.
// Bare på hoveddomenet (flatr.no/superadmin). Tilgang styres av
// SUPERADMIN_EMAILS (kommaseparert) og magisk lenke på e-post.
//
//   POST /api/superadmin/login   { email }
//   GET  /superadmin/verify?token=
//   POST /api/superadmin/logout
//   GET  /api/superadmin/me
//   GET  /api/superadmin/tenants
//   PUT  /api/superadmin/tenants?id=1   { max_storage_mb?, max_devices?, max_screens? }  (null = standard)

import {
  platformDb,
  tenantResources,
  tenantLimits,
  createLoginToken,
  consumeLoginToken,
  hashToken,
  randomToken,
  inMs,
  nowIso,
  normEmail
} from './platform.js';
import { sendMail, buttonMail } from './mail.js';
import { readCookie } from './auth.js';
import { usage } from '../src/api/_shared.js';

const COOKIE = 'flatr_admin';
const TTL_MS = 12 * 3600_000;

const admins = () =>
  String(process.env.SUPERADMIN_EMAILS || '')
    .split(',')
    .map(normEmail)
    .filter(Boolean);

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
  });

const cookie = (value, secure, maxAgeMs) =>
  [`${COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', secure ? 'Secure' : '', `Max-Age=${Math.floor(maxAgeMs / 1000)}`]
    .filter(Boolean)
    .join('; ');

function currentAdmin(request) {
  const sid = readCookie(request, COOKIE);
  if (!sid) return null;
  const row = platformDb
    .prepare('SELECT email FROM admin_sessions WHERE id_hash = ? AND expires_at > ?')
    .bind(hashToken(sid), nowIso())
    .firstSync();
  // Fjernes adressen fra SUPERADMIN_EMAILS, mister økten tilgang med en gang.
  return row && admins().includes(row.email) ? row.email : null;
}

async function tenantStats(t) {
  const members = platformDb
    .prepare(
      `SELECT u.email, m.role FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = ? ORDER BY m.role = 'owner' DESC`
    )
    .bind(t.id)
    .allSync().results;
  const lastLogin = platformDb.prepare('SELECT MAX(created_at) AS at FROM sessions WHERE tenant_id = ?').bind(t.id).firstSync('at');

  let stats = {};
  try {
    const env = tenantResources(t.slug);
    const [u, playlists, slides, online, lastSeen] = await Promise.all([
      usage(env),
      env.DB.prepare('SELECT COUNT(*) AS c FROM playlists').first('c'),
      env.DB.prepare('SELECT COUNT(*) AS c FROM deck_slides').first('c'),
      env.DB.prepare(`SELECT COUNT(*) AS c FROM pairings WHERE status = 'paired' AND last_seen > ?`)
        .bind(new Date(Date.now() - 90_000).toISOString())
        .first('c'),
      env.DB.prepare(`SELECT MAX(last_seen) AS at FROM pairings`).first('at')
    ]);
    stats = { ...u, playlists, slides, online, lastSeen };
  } catch (err) {
    stats = { error: err.message };
  }

  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    created_at: t.created_at,
    owners: members.filter((m) => m.role === 'owner').map((m) => m.email),
    members: members.length,
    last_login: lastLogin,
    limits: tenantLimits(t),
    overrides: { max_storage_mb: t.max_storage_mb, max_devices: t.max_devices, max_screens: t.max_screens },
    ...stats
  };
}

export async function handleSuperadminRoute(request, ctx) {
  const url = new URL(request.url);
  const p = url.pathname.replace(/\/+$/, '');
  if (!p.startsWith('/api/superadmin') && p !== '/superadmin/verify') return null;

  if (p === '/api/superadmin/login' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const email = normEmail(b?.email);
    // Svarer alltid ok, så man ikke kan finne ut hvem som er superadmin.
    if (admins().includes(email)) {
      const token = createLoginToken({ purpose: 'superadmin', email, ttlMs: 15 * 60_000 });
      await sendMail({
        to: email,
        subject: 'Logg inn som superadmin – Flatr',
        ...buttonMail({
          heading: 'Superadmin-innlogging',
          intro: 'Klikk for å logge inn på oversikten over alle Flatr-kontoer. Lenken virker i 15 minutter.',
          button: 'Logg inn',
          url: `${ctx.origin(null)}/superadmin/verify?token=${token}`,
          outro: 'Har du ikke bedt om dette, kan du se bort fra e-posten.'
        })
      }).catch(() => {});
    }
    return json({ ok: true });
  }

  if (p === '/superadmin/verify') {
    const row = consumeLoginToken(url.searchParams.get('token') || '', 'superadmin');
    if (!row || !admins().includes(row.email)) {
      return new Response(null, { status: 302, headers: { Location: '/superadmin?login=expired' } });
    }
    const sid = randomToken();
    platformDb
      .prepare('INSERT INTO admin_sessions (id_hash, email, expires_at) VALUES (?, ?, ?)')
      .bind(hashToken(sid), row.email, inMs(TTL_MS))
      .runSync();
    return new Response(null, {
      status: 302,
      headers: { Location: '/superadmin', 'Set-Cookie': cookie(sid, ctx.secure, TTL_MS), 'Cache-Control': 'no-store' }
    });
  }

  if (p === '/api/superadmin/logout' && request.method === 'POST') {
    const sid = readCookie(request, COOKIE);
    if (sid) platformDb.prepare('DELETE FROM admin_sessions WHERE id_hash = ?').bind(hashToken(sid)).runSync();
    return json({ ok: true }, 200, { 'Set-Cookie': cookie('', ctx.secure, 0) });
  }

  const admin = currentAdmin(request);
  if (!admin) return json({ error: 'Ikke innlogget' }, 401);

  if (p === '/api/superadmin/me') return json({ email: admin, base_domain: ctx.baseDomain });

  if (p === '/api/superadmin/tenants' && request.method === 'GET') {
    const tenants = platformDb.prepare('SELECT * FROM tenants ORDER BY created_at DESC').allSync().results;
    return json(await Promise.all(tenants.map(tenantStats)));
  }

  if (p === '/api/superadmin/tenants' && request.method === 'PUT') {
    const id = Number.parseInt(url.searchParams.get('id'), 10);
    const t = platformDb.prepare('SELECT * FROM tenants WHERE id = ?').bind(id).firstSync();
    if (!t) return json({ error: 'Finner ikke kontoen' }, 404);
    const b = await request.json().catch(() => ({}));
    const val = (k) => {
      if (b[k] === undefined) return t[k];
      if (b[k] === null || b[k] === '') return null;
      const n = Number.parseInt(b[k], 10);
      return Number.isFinite(n) && n >= 0 ? n : t[k];
    };
    platformDb
      .prepare('UPDATE tenants SET max_storage_mb = ?, max_devices = ?, max_screens = ? WHERE id = ?')
      .bind(val('max_storage_mb'), val('max_devices'), val('max_screens'), id)
      .runSync();
    const fresh = platformDb.prepare('SELECT * FROM tenants WHERE id = ?').bind(id).firstSync();
    return json(await tenantStats(fresh));
  }

  return json({ error: 'Ukjent endepunkt' }, 404);
}
