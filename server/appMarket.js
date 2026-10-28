// Flatr Apps – egne apper laget i appbyggeren. Ligger i platform.db, så en app
// kan deles med andre kunder etter godkjenning i superadmin.
//
// Hver app har to versjoner:
//   draft    – det utvikleren (kunden som eier appen) jobber med. Eierens egne
//              installasjoner bruker alltid utkastet.
//   manifest – sist godkjente versjon. Alle andre kunder bruker denne.
// Endringer må derfor godkjennes på nytt før andre ser dem – ellers kunne en
// utvikler bytte API-adressen etter godkjenning og samle inn andres nøkler.
//
//   GET    /api/app-market                 -> egne apper (alle statuser) + godkjente fra andre
//   POST   /api/app-market                 { manifest }          -> ny app (privat)
//   PUT    /api/app-market?id=             { manifest }          -> oppdater utkastet
//   POST   /api/app-market/submit?id=                            -> send til godkjenning
//   DELETE /api/app-market?id=                                   -> fjern fra katalogen
//   POST   /api/app-market/test            { manifest, settings } -> prøv API-et

import { platformDb } from './platform.js';
import { cleanManifest, fillPlaceholders, extractItems, leafPaths, arrayPaths, getPath } from '../src/lib/appCatalog.js';
import { fetchPublicJson } from '../src/api/feeds.js';
import { iconFor, officialIcons, canEditIcon, isSuperadmin, handleIconRequest } from './appIcons.js';

platformDb.db.exec(`
CREATE TABLE IF NOT EXISTS custom_apps (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id     INTEGER NOT NULL,
  author        TEXT,                              -- kundens navn, vises som utgiver
  draft         TEXT NOT NULL,                     -- utvikleren sitt utkast (JSON)
  manifest      TEXT,                              -- sist godkjente versjon (JSON)
  review_status TEXT NOT NULL DEFAULT 'none',      -- none | pending | approved | rejected
  review_note   TEXT,
  hidden        INTEGER NOT NULL DEFAULT 0,        -- fjernet av eier eller superadmin
  installs      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
`);

// Hvem som laget appen (kan endre ikonet sammen med eierne i organisasjonen).
try {
  platformDb.db.exec('ALTER TABLE custom_apps ADD COLUMN created_by TEXT');
} catch {
  /* finnes allerede */
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
const fail = (status, error) => json({ error }, status);
const parse = (s) => {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
};
const now = () => new Date().toISOString();
const row = (id) => platformDb.prepare('SELECT * FROM custom_apps WHERE id = ?').bind(id).firstSync();

/** Det en bestemt kunde ser av en app (eier: utkastet, andre: godkjent versjon). */
function viewFor(r, tenantId) {
  const own = r.tenant_id === tenantId;
  const m = parse(own ? r.draft : r.manifest);
  if (!m) return null;
  return {
    id: r.id,
    ...m,
    author: r.author,
    own,
    review_status: own ? r.review_status : 'approved',
    review_note: own ? r.review_note : null,
    published: !!r.manifest,
    installs: r.installs,
    updated_at: r.updated_at,
    // Egen logo (bilde) og bakgrunn, se server/appIcons.js.
    image: iconFor(`custom:${r.id}`)
  };
}

/** Manifestet en kunde skal bruke for en installert app (null = finnes ikke / ikke tilgang). */
export function customAppFor(id, tenantId) {
  const r = row(Number(id));
  if (!r) return null;
  // Allerede installerte apper fortsetter å virke selv om appen er skjult i katalogen.
  return viewFor(r, tenantId);
}

/** Kan kunden installere appen nå? (egen, eller godkjent og synlig) */
export function canInstallCustom(id, tenantId) {
  const r = row(Number(id));
  if (!r || r.hidden) return false;
  return !!viewFor(r, tenantId); // eier: utkastet, andre: bare hvis en versjon er godkjent
}

export function countInstall(id, delta) {
  platformDb.prepare('UPDATE custom_apps SET installs = MAX(0, installs + ?) WHERE id = ?').bind(delta, Number(id)).runSync();
}

/** Henter data for en egen app: fyller inn innstillinger, kaller API-et og plukker ut feltene. */
export async function runCustomApp(manifest, values) {
  const url = fillPlaceholders(manifest.source.url, values, true);
  const headers = Object.fromEntries(manifest.source.headers.map((h) => [h.name, fillPlaceholders(h.value, values)]));
  const body = await fetchPublicJson(url, headers);
  return { body, items: extractItems(body, manifest) };
}

async function test(request, tenant) {
  const b = (await request.json().catch(() => null)) || {};
  let manifest;
  try {
    manifest = cleanManifest(b.manifest);
  } catch (err) {
    return fail(400, err.message);
  }
  try {
    const { body, items } = await runCustomApp(manifest, b.settings || {});
    const list = getPath(body, manifest.source.itemsPath);
    const first = Array.isArray(list) ? list[0] : list;
    const sample = JSON.stringify(body, null, 2);
    return json({
      ok: true,
      sample: sample.length > 20_000 ? `${sample.slice(0, 20_000)}\n…` : sample,
      list_paths: arrayPaths(body),
      field_paths: first && typeof first === 'object' ? leafPaths(first) : [],
      count: Array.isArray(list) ? list.length : list == null ? 0 : 1,
      items
    });
  } catch (err) {
    return fail(502, err.message || 'Kunne ikke hente data');
  }
}

export async function handleAppMarketRoute(request, ctx) {
  const url = new URL(request.url);
  const p = url.pathname.replace(/\/+$/, '');
  const { tenant } = ctx;
  const id = Number.parseInt(url.searchParams.get('id'), 10);

  if (p === '/api/app-market/test' && request.method === 'POST') return test(request, tenant);

  if (p === '/api/app-market' && request.method === 'GET') {
    const rows = platformDb
      .prepare(
        `SELECT * FROM custom_apps
          WHERE hidden = 0 AND (tenant_id = ? OR manifest IS NOT NULL)
          ORDER BY installs DESC, updated_at DESC`
      )
      .bind(tenant.id)
      .allSync().results;
    const user = ctx.user;
    return json({
      apps: rows
        .map((r) => viewFor(r, tenant.id))
        .filter(Boolean)
        .map((a) => ({ ...a, can_edit_icon: canEditIcon(`custom:${a.id}`, user, tenant.id) })),
      official_icons: officialIcons(),
      can_edit_official: isSuperadmin(user?.email)
    });
  }

  // Ikon: PUT (rå bildebytes og/eller ?bg=) eller DELETE. ?key=official:ais | custom:12
  if (p === '/api/app-market/icon' && (request.method === 'PUT' || request.method === 'DELETE')) {
    const key = String(url.searchParams.get('key') || '');
    if (!canEditIcon(key, ctx.user, tenant.id)) return fail(403, 'Bare eiere og den som laget appen kan endre ikonet.');
    try {
      const icon = await handleIconRequest(request, key, ctx.user?.email);
      return json({ ok: true, icon });
    } catch (err) {
      return fail(err.status || 400, err.message);
    }
  }

  if (p === '/api/app-market' && request.method === 'POST') {
    const b = (await request.json().catch(() => null)) || {};
    let m;
    try {
      m = cleanManifest(b.manifest);
    } catch (err) {
      return fail(400, err.message);
    }
    const r = platformDb
      .prepare('INSERT INTO custom_apps (tenant_id, author, draft, created_by) VALUES (?, ?, ?, ?) RETURNING *')
      .bind(tenant.id, tenant.name, JSON.stringify(m), ctx.user?.email ?? null)
      .runSync().results[0];
    return json(viewFor(r, tenant.id), 201);
  }

  const r = Number.isFinite(id) ? row(id) : null;
  if (!r || r.tenant_id !== tenant.id || r.hidden) return fail(404, 'Finner ikke appen');

  if (p === '/api/app-market' && request.method === 'PUT') {
    const b = (await request.json().catch(() => null)) || {};
    let m;
    try {
      m = cleanManifest(b.manifest);
    } catch (err) {
      return fail(400, err.message);
    }
    // En godkjent app som endres går tilbake til «ikke sendt» – andre kunder
    // beholder den godkjente versjonen til den nye er godkjent.
    const status = r.review_status === 'approved' || r.review_status === 'rejected' ? 'none' : r.review_status;
    platformDb
      .prepare('UPDATE custom_apps SET draft = ?, review_status = ?, updated_at = ? WHERE id = ?')
      .bind(JSON.stringify(m), status, now(), id)
      .runSync();
    return json(viewFor(row(id), tenant.id));
  }

  if (p === '/api/app-market/submit' && request.method === 'POST') {
    platformDb
      .prepare(`UPDATE custom_apps SET review_status = 'pending', review_note = NULL, updated_at = ? WHERE id = ?`)
      .bind(now(), id)
      .runSync();
    return json(viewFor(row(id), tenant.id));
  }

  if (p === '/api/app-market' && request.method === 'DELETE') {
    platformDb.prepare('UPDATE custom_apps SET hidden = 1, updated_at = ? WHERE id = ?').bind(now(), id).runSync();
    return json({ ok: true });
  }

  return fail(404, 'Ukjent endepunkt');
}

/* ------------------------------- superadmin ------------------------------- */

export function appsAdminList() {
  return platformDb
    .prepare(
      `SELECT c.*, t.slug FROM custom_apps c LEFT JOIN tenants t ON t.id = c.tenant_id
        ORDER BY (c.review_status = 'pending') DESC, c.updated_at DESC`
    )
    .allSync()
    .results.map((r) => ({
      id: r.id,
      tenant: r.slug,
      author: r.author,
      draft: parse(r.draft),
      manifest: parse(r.manifest),
      review_status: r.review_status,
      review_note: r.review_note,
      hidden: !!r.hidden,
      installs: r.installs,
      updated_at: r.updated_at
    }));
}

/** action: approve | reject | hide | show */
export function appsAdminReview(id, action, note) {
  const r = row(Number(id));
  if (!r) return false;
  if (action === 'approve') {
    platformDb
      .prepare(`UPDATE custom_apps SET manifest = draft, review_status = 'approved', review_note = NULL, updated_at = ? WHERE id = ?`)
      .bind(now(), r.id)
      .runSync();
  } else if (action === 'reject') {
    platformDb
      .prepare(`UPDATE custom_apps SET review_status = 'rejected', review_note = ?, updated_at = ? WHERE id = ?`)
      .bind(String(note || '').slice(0, 500) || null, now(), r.id)
      .runSync();
  } else if (action === 'hide' || action === 'show') {
    platformDb.prepare('UPDATE custom_apps SET hidden = ? WHERE id = ?').bind(action === 'hide' ? 1 : 0, r.id).runSync();
  } else {
    return false;
  }
  return true;
}

/**
 * Den åpne katalogen på flatr.no/apps: egne ikoner for offisielle apper og
 * godkjente apper fra kundene (bare det som vises i markedsplassen – ingen
 * adresser, innstillinger eller nøkler).
 */
export function publicCatalog() {
  const rows = platformDb
    .prepare(`SELECT * FROM custom_apps WHERE hidden = 0 AND manifest IS NOT NULL ORDER BY installs DESC, updated_at DESC LIMIT 60`)
    .allSync().results;
  return {
    official_icons: officialIcons(),
    community: rows
      .map((r) => {
        const m = parse(r.manifest);
        if (!m) return null;
        return {
          id: r.id,
          name: m.name,
          tagline: m.tagline,
          category: m.category,
          icon: m.icon,
          color: m.color,
          author: r.author,
          template: m.display?.template,
          image: iconFor(`custom:${r.id}`)
        };
      })
      .filter(Boolean)
  };
}
