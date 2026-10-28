// Superadmin for plattformeieren: oversikt over alle kontoer, bruk og kvoter.
// Bare på hoveddomenet (flatr.no/superadmin). Tilgang: vanlig Flatr-innlogging
// (Better Auth) med en e-postadresse i SUPERADMIN_EMAILS (kommaseparert).
//
//   GET  /api/superadmin/me
//   GET  /api/superadmin/tenants
//   PUT  /api/superadmin/tenants?id=1   { max_storage_mb?, max_screens?, allow_video? }  (null = standard; TV-er følger skjermer)

import { marketAdminList, marketAdminSetHidden } from './market.js';
import { appsAdminList, appsAdminReview } from './appMarket.js';
import { platformDb, tenantResources, tenantLimits, normEmail } from './platform.js';
import { authSession } from './identity.js';
import { usage } from '../src/api/_shared.js';

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

/** Innlogget superadmin (e-posten må stå i SUPERADMIN_EMAILS – fjernes den, er tilgangen borte med en gang). */
async function currentAdmin(request) {
  const s = await authSession(request);
  const email = s?.user?.emailVerified ? normEmail(s.user.email) : null;
  return email && admins().includes(email) ? email : null;
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
    overrides: { max_storage_mb: t.max_storage_mb, max_devices: t.max_devices, max_screens: t.max_screens, allow_video: t.allow_video === 1 },
    ...stats
  };
}

export async function handleSuperadminRoute(request, ctx) {
  const url = new URL(request.url);
  const p = url.pathname.replace(/\/+$/, '');
  if (!p.startsWith('/api/superadmin')) return null;

  const admin = await currentAdmin(request);
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
      .prepare('UPDATE tenants SET max_storage_mb = ?, max_devices = NULL, max_screens = ?, allow_video = ? WHERE id = ?')
      .bind(val('max_storage_mb'), val('max_screens'), b.allow_video === undefined ? t.allow_video : b.allow_video ? 1 : null, id)
      .runSync();
    const fresh = platformDb.prepare('SELECT * FROM tenants WHERE id = ?').bind(id).firstSync();
    return json(await tenantStats(fresh));
  }

  // Malmarkedet: se alt som er delt, og skjul det som ikke hører hjemme der.
  if (p === '/api/superadmin/market' && request.method === 'GET') return json(marketAdminList());
  if (p === '/api/superadmin/market' && request.method === 'PUT') {
    const b = await request.json().catch(() => ({}));
    marketAdminSetHidden(url.searchParams.get('id'), !!b.hidden);
    return json({ ok: true });
  }

  // Flatr Apps: egne apper som er sendt inn til markedsplassen.
  if (p === '/api/superadmin/apps' && request.method === 'GET') return json(appsAdminList());
  if (p === '/api/superadmin/apps' && request.method === 'PUT') {
    const b = await request.json().catch(() => ({}));
    if (!appsAdminReview(url.searchParams.get('id'), b.action, b.note)) return json({ error: 'Ugyldig' }, 400);
    return json({ ok: true });
  }

  return json({ error: 'Ukjent endepunkt' }, 404);
}
