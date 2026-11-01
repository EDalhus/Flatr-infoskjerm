// Grupper: kjeder, kommuner og idrettskretser med mange organisasjoner. En
// gruppe opprettes av oss (superadmin) med medlemmer, administratorer og
// eventuelt én avtale (plan + skjermer som deles, se tenantLimits). Gruppens
// administratorer ser alle skjermene samlet og kan sende hastemeldinger og
// presentasjoner til alle medlemmene. I medlemmenes egen Flatr er de redaktører.
//
// Hoveddomenet, innlogget gruppeadministrator (eller superadmin):
//   GET    /api/platform/groups                     gruppene dine
//   GET    /api/platform/groups/<id>                oversikt: medlemmer, skjermer, avtale
//   GET    /api/platform/groups/<id>/playlists?tenant=   presentasjonene hos ett medlem
//   POST   /api/platform/groups/<id>/alert          { title, message, severity, display, duration_minutes, tenants? }
//   DELETE /api/platform/groups/<id>/alert          avslutt gruppens hastemeldinger hos alle
//   POST   /api/platform/groups/<id>/share          { tenant_id, playlist_id, name } -> kopi hos de andre
// Superadmin:
//   GET/POST/PUT/DELETE /api/superadmin/groups[?id=]       { name, plan, max_screens }
//   POST/DELETE         /api/superadmin/groups/members     { group_id, slug } / ?group_id=&tenant_id=
//   POST/DELETE         /api/superadmin/groups/admins      { group_id, email } / ?group_id=&email=

import { platformDb, getTenantBySlug, tenantResources, normEmail, validEmail, forgetGroupUsage } from './platform.js';
import { authSession } from './identity.js';
import { notifyChange } from './changes.js';
import { shareKit, installKit } from './market.js';
import { cleanAlert } from '../src/lib/alerts.js';
import { logActivity } from '../src/api/activity.js';
import { PLANS } from '../src/lib/pricing.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const fail = (status, error) => json({ error }, status);
const readJson = (request) => request.json().catch(() => null);

const superadmins = () =>
  String(process.env.SUPERADMIN_EMAILS || '')
    .split(',')
    .map(normEmail)
    .filter(Boolean);

const members = (groupId) =>
  platformDb
    .prepare('SELECT t.* FROM org_group_members m JOIN tenants t ON t.id = m.tenant_id WHERE m.group_id = ? ORDER BY t.name COLLATE NOCASE')
    .bind(groupId)
    .allSync().results;
const adminsOf = (groupId) => platformDb.prepare('SELECT email FROM org_group_admins WHERE group_id = ? ORDER BY email').bind(groupId).allSync().results.map((r) => r.email);

/** Er e-posten administrator for gruppen som kunden er med i? (Gir redaktørtilgang hos medlemmet.) */
export function groupAdminFor(tenantId, email) {
  return platformDb
    .prepare(
      `SELECT g.id, g.name FROM org_groups g
         JOIN org_group_members m ON m.group_id = g.id
         JOIN org_group_admins a ON a.group_id = g.id
        WHERE m.tenant_id = ? AND a.email = ?`
    )
    .bind(tenantId, normEmail(email))
    .firstSync();
}

/** Gruppene en e-postadresse er administrator for (lenke til oversikten i admin). */
export function groupsForAdmin(email) {
  return platformDb
    .prepare('SELECT g.id, g.name FROM org_groups g JOIN org_group_admins a ON a.group_id = g.id WHERE a.email = ? ORDER BY g.name COLLATE NOCASE')
    .bind(normEmail(email))
    .allSync().results;
}

/* ------------------------------ oversikten ------------------------------ */

async function memberOverview(t, origin) {
  let screens = [];
  try {
    const db = tenantResources(t.slug).DB;
    const { results } = await db
      .prepare(
        `SELECT s.id, s.name, s.last_seen, p.name AS playlist,
                (SELECT COUNT(*) FROM pairings x WHERE x.screen_id = s.id AND x.status = 'paired') AS devices
           FROM screens s LEFT JOIN playlists p ON p.id = s.playlist_id ORDER BY s.name COLLATE NOCASE`
      )
      .all();
    const now = Date.now();
    screens = (results ?? []).map((s) => ({ id: s.id, name: s.name, playlist: s.playlist || null, online: !!s.last_seen && now - Date.parse(s.last_seen) < 3 * 60_000, last_seen: s.last_seen || null }));
  } catch {
    /* databasen mangler */
  }
  return { id: t.id, slug: t.slug, name: t.name, url: `${origin(t.slug)}/admin`, screens };
}

async function overview(group, origin) {
  const list = await Promise.all(members(group.id).map((t) => memberOverview(t, origin)));
  const total = list.reduce((n, m) => n + m.screens.length, 0);
  return {
    id: group.id,
    name: group.name,
    plan: PLANS[group.plan] ? { id: group.plan, name: PLANS[group.plan].name } : null,
    max_screens: group.max_screens || null,
    screens: { total, online: list.reduce((n, m) => n + m.screens.filter((s) => s.online).length, 0) },
    members: list,
    admins: adminsOf(group.id)
  };
}

/** Gruppen hvis innlogget bruker får administrere den, ellers null. */
async function allowedGroup(request, id) {
  const s = await authSession(request);
  const email = s?.user?.emailVerified ? normEmail(s.user.email) : null;
  if (!email) return { email: null };
  const group = platformDb.prepare('SELECT * FROM org_groups WHERE id = ?').bind(Number(id)).firstSync();
  if (!group) return { email };
  const ok = superadmins().includes(email) || adminsOf(group.id).includes(email);
  return { email, group: ok ? group : null, name: s.user.name || email };
}

/* -------------------------- gruppeadministrator ------------------------- */

export async function handleGroupRoute(request, ctx) {
  const url = new URL(request.url);
  const p = url.pathname.replace(/\/+$/, '');
  if (!p.startsWith('/api/platform/groups')) return null;

  if (p === '/api/platform/groups' && request.method === 'GET') {
    const s = await authSession(request);
    const email = s?.user?.emailVerified ? normEmail(s.user.email) : null;
    if (!email) return fail(401, 'Logg inn først.');
    const rows = superadmins().includes(email)
      ? platformDb.prepare('SELECT * FROM org_groups ORDER BY name COLLATE NOCASE').allSync().results
      : platformDb.prepare('SELECT g.* FROM org_groups g JOIN org_group_admins a ON a.group_id = g.id WHERE a.email = ? ORDER BY g.name COLLATE NOCASE').bind(email).allSync().results;
    return json(rows.map((g) => ({ id: g.id, name: g.name, members: members(g.id).length })));
  }

  const m = p.match(/^\/api\/platform\/groups\/(\d+)(?:\/(alert|share|playlists))?$/);
  if (!m) return fail(404, 'Ukjent endepunkt');
  const { email, group, name } = await allowedGroup(request, m[1]);
  if (!email) return fail(401, 'Logg inn først.');
  if (!group) return fail(404, 'Fant ikke gruppen, eller du er ikke administrator for den.');
  const actor = { email, name: `${name} (${group.name})` };
  const memberRows = members(group.id);

  if (!m[2] && request.method === 'GET') return json(await overview(group, ctx.origin));

  if (m[2] === 'playlists' && request.method === 'GET') {
    const t = memberRows.find((x) => x.id === Number(url.searchParams.get('tenant')));
    if (!t) return fail(404, 'Organisasjonen er ikke med i gruppen.');
    const { results } = await tenantResources(t.slug).DB.prepare('SELECT id, name, orientation FROM playlists ORDER BY name COLLATE NOCASE').all();
    return json(results ?? []);
  }

  if (m[2] === 'alert' && request.method === 'POST') {
    const b = (await readJson(request)) || {};
    const { value, error } = cleanAlert(b);
    if (error) return fail(400, error);
    const only = Array.isArray(b.tenants) && b.tenants.length ? new Set(b.tenants.map(Number)) : null;
    const targets = memberRows.filter((t) => !only || only.has(t.id));
    let sent = 0;
    for (const t of targets) {
      try {
        const env = tenantResources(t.slug);
        await env.DB.prepare(
          `INSERT INTO alerts (message, title, severity, display, starts_at, ends_at, active, source) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
        )
          .bind(value.message, value.title, value.severity, value.display, value.starts_at, value.ends_at, `group:${group.id}`)
          .run();
        await logActivity(env, actor, { action: 'sendte hastemelding fra gruppen', target_type: 'alert', target_name: value.title || value.message.slice(0, 60) }).catch(() => {});
        notifyChange(t.slug);
        sent++;
      } catch (err) {
        console.warn(`[gruppe] hastemelding til ${t.slug}:`, err.message);
      }
    }
    return json({ sent, of: targets.length });
  }

  if (m[2] === 'alert' && request.method === 'DELETE') {
    let ended = 0;
    for (const t of memberRows) {
      try {
        const res = await tenantResources(t.slug).DB.prepare('UPDATE alerts SET active = 0 WHERE active = 1 AND source = ?').bind(`group:${group.id}`).run();
        if (res.meta?.changes) {
          ended += res.meta.changes;
          notifyChange(t.slug);
        }
      } catch {
        /* hopp over */
      }
    }
    return json({ ended });
  }

  if (m[2] === 'share' && request.method === 'POST') {
    const b = (await readJson(request)) || {};
    const source = memberRows.find((x) => x.id === Number(b.tenant_id));
    if (!source) return fail(404, 'Organisasjonen er ikke med i gruppen.');
    const title = String(b.name || '').trim().slice(0, 80);
    try {
      const item = await shareKit(tenantResources(source.slug), source, b.playlist_id, title);
      let copied = 0;
      for (const t of memberRows) {
        if (t.id === source.id) continue;
        const env = tenantResources(t.slug);
        const id = await installKit(env, item, title || null);
        await logActivity(env, actor, { action: 'fikk en presentasjon fra gruppen', target_type: 'playlist', target_id: id, target_name: title || source.name }).catch(() => {});
        copied++;
      }
      return json({ copied });
    } catch (err) {
      return fail(err.status || 500, err.status ? err.message : 'Kunne ikke dele presentasjonen.');
    }
  }

  return fail(405, 'Metode ikke tillatt');
}

/* ------------------------------ superadmin ------------------------------ */

export async function handleSuperadminGroups(request, ctx) {
  const url = new URL(request.url);
  const p = url.pathname.replace(/\/+$/, '');
  const b = ['POST', 'PUT'].includes(request.method) ? (await readJson(request)) || {} : {};
  const all = () =>
    json(
      platformDb
        .prepare('SELECT * FROM org_groups ORDER BY name COLLATE NOCASE')
        .allSync()
        .results.map((g) => ({ ...g, members: members(g.id).map((t) => ({ id: t.id, slug: t.slug, name: t.name })), admins: adminsOf(g.id) }))
    );
  const cleanPlan = (v) => (PLANS[v] ? v : null);
  const cleanMax = (v) => (v === null || v === '' || v === undefined ? null : Math.max(1, Math.min(10_000, Number.parseInt(v, 10) || 1)));

  if (p === '/api/superadmin/groups') {
    if (request.method === 'GET') return all();
    if (request.method === 'POST') {
      const name = String(b.name || '').trim().slice(0, 100);
      if (!name) return fail(400, 'Gi gruppen et navn.');
      platformDb.prepare('INSERT INTO org_groups (name, plan, max_screens) VALUES (?, ?, ?)').bind(name, cleanPlan(b.plan), cleanMax(b.max_screens)).runSync();
      return all();
    }
    const id = Number(url.searchParams.get('id'));
    if (request.method === 'PUT') {
      const g = platformDb.prepare('SELECT * FROM org_groups WHERE id = ?').bind(id).firstSync();
      if (!g) return fail(404, 'Fant ikke gruppen.');
      platformDb
        .prepare('UPDATE org_groups SET name = ?, plan = ?, max_screens = ? WHERE id = ?')
        .bind(String(b.name ?? g.name).trim().slice(0, 100) || g.name, b.plan !== undefined ? cleanPlan(b.plan) : g.plan, b.max_screens !== undefined ? cleanMax(b.max_screens) : g.max_screens, id)
        .runSync();
      forgetGroupUsage(id);
      return all();
    }
    if (request.method === 'DELETE') {
      platformDb.prepare('DELETE FROM org_groups WHERE id = ?').bind(id).runSync();
      return all();
    }
  }

  if (p === '/api/superadmin/groups/members') {
    if (request.method === 'POST') {
      const t = getTenantBySlug(String(b.slug || '').trim().toLowerCase());
      if (!t) return fail(404, 'Fant ingen organisasjon med den adressen.');
      const other = platformDb.prepare('SELECT g.name FROM org_group_members m JOIN org_groups g ON g.id = m.group_id WHERE m.tenant_id = ?').bind(t.id).firstSync();
      if (other) return fail(409, `${t.name} er allerede med i «${other.name}».`);
      platformDb.prepare('INSERT INTO org_group_members (group_id, tenant_id) VALUES (?, ?)').bind(Number(b.group_id), t.id).runSync();
      forgetGroupUsage(Number(b.group_id));
      return all();
    }
    if (request.method === 'DELETE') {
      const groupId = Number(url.searchParams.get('group_id'));
      platformDb.prepare('DELETE FROM org_group_members WHERE group_id = ? AND tenant_id = ?').bind(groupId, Number(url.searchParams.get('tenant_id'))).runSync();
      forgetGroupUsage(groupId);
      return all();
    }
  }

  if (p === '/api/superadmin/groups/admins') {
    if (request.method === 'POST') {
      const email = normEmail(b.email);
      if (!validEmail(email)) return fail(400, 'Skriv inn en gyldig e-postadresse.');
      platformDb.prepare('INSERT OR IGNORE INTO org_group_admins (group_id, email) VALUES (?, ?)').bind(Number(b.group_id), email).runSync();
      return all();
    }
    if (request.method === 'DELETE') {
      platformDb.prepare('DELETE FROM org_group_admins WHERE group_id = ? AND email = ?').bind(Number(url.searchParams.get('group_id')), normEmail(url.searchParams.get('email'))).runSync();
      return all();
    }
  }
  return fail(404, 'Ukjent endepunkt');
}

