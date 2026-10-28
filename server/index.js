// Flatr på egen server (Node). Erstatter Cloudflare Worker-runtime:
//
//   flatr.no              -> plattform: landingsside, registrering, innlogging,
//                            og TV-er (tvOS-appen snakker alltid med hoveddomenet)
//   <slug>.flatr.no       -> kundens Flatr: admin, skjermvisning og API
//
// Konfig (miljøvariabler):
//   PORT=8787  BASE_DOMAIN=flatr.no  PUBLIC_PROTOCOL=https  DATA_DIR=./data
//   SSE_POLL_MS=3000  + e-post (se server/mail.js)

import http from 'node:http';
import { screenshotUrl } from './convert.js';
import path from 'node:path';
import { getRequestListener } from '@hono/node-server';
import { routeApi, apiKey, jsonError } from '../src/router.js';
import { getUser } from '../src/api/_access.js';
import { checkLimit } from '../src/api/_shared.js';
import { createAssets } from './assets.js';
import { handleCollabUpgrade } from './collab.js';
import { getTenantBySlug, tenantResources, memberByEmail, sweepPlatform, tenantLimits, updatePrefs, platformDb } from './platform.js';
import { auth, authSession, migrateExistingUsers, SOCIAL_PROVIDERS } from './identity.js';
import { userColorPalette } from '../src/api/_access.js';
import { handlePlatformRoute, handleTenantAuthRoute } from './auth.js';
import { handleApexDevice, claimFromHub, syncRoutes } from './devices.js';
import { handleImportRoute } from './imports.js';
import { handleSuperadminRoute } from './superadmin.js';
import { handleMarketRoute, serveMarketFile } from './market.js';
import { handleAppMarketRoute, customAppFor, canInstallCustom, countInstall, runCustomApp, publicCatalog } from './appMarket.js';
import { serveAppIcon } from './appIcons.js';
import { startSnapshots, requestRefresh } from './snapshots.js';
import { startMonitor } from './monitor.js';
import { startNotices } from './notices.js';
import { afterWrite, beforeWrite } from '../src/api/activity.js';
import { notifyChange, waitForChange } from './changes.js';
import { notifier, teamMembers } from './notify.js';

const PORT = Number(process.env.PORT || 8787);
const BASE_DOMAIN = (process.env.BASE_DOMAIN || 'localhost:8787').toLowerCase();
const PROTOCOL = process.env.PUBLIC_PROTOCOL || 'http';
const SSE_POLL_MS = process.env.SSE_POLL_MS || '3000';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ASSETS = createAssets(path.join(ROOT, 'dist'));

const ctxBase = {
  baseDomain: BASE_DOMAIN,
  secure: PROTOCOL === 'https',
  origin: (slug) => `${PROTOCOL}://${slug ? `${slug}.` : ''}${BASE_DOMAIN}`
};

/** Hvilken del av plattformen en vertsnavn hører til. */
function resolveHost(rawHost) {
  const host = String(rawHost || '').toLowerCase();
  if (host === BASE_DOMAIN || host === `www.${BASE_DOMAIN}`) return { kind: 'platform' };
  if (host.endsWith(`.${BASE_DOMAIN}`)) {
    const slug = host.slice(0, -(BASE_DOMAIN.length + 1));
    if (/^[a-z0-9-]+$/.test(slug)) {
      const tenant = getTenantBySlug(slug);
      return tenant ? { kind: 'tenant', tenant } : { kind: 'unknown' };
    }
  }
  // IP-adresse, localhost o.l. – behandle som hoveddomenet.
  return { kind: 'platform' };
}

function tenantEnv(tenant, user) {
  return {
    ...tenantResources(tenant.slug),
    ASSETS,
    SSE_POLL_MS,
    CDN_MEDIA: true,
    // Skjermstrømmene venter på endringer i stedet for å spørre hvert par sekund.
    WAIT_CHANGE: (ms) => waitForChange(tenant.slug, ms),
    SESSION_USER: user ?? null,
    TENANT: { slug: tenant.slug, name: tenant.name },
    LIMITS: tenantLimits(tenant),
    // TV-er venter på skjermbilder av widgeter – be om dem med en gang.
    REQUEST_SNAPSHOTS: () => process.env.CONVERTER_URL && requestRefresh(tenant.slug),
    // Skjermbilde av en side (AI-assistenten ser lysbildene den lager). Bare med konverter.
    SCREENSHOT: process.env.CONVERTER_URL ? screenshotUrl : null,
    // Varsler (godkjenning, kommentarer) og teamet (@-omtaler).
    NOTIFY: notifier(tenant),
    TEAM: () => teamMembers(tenant.id),
    // Egne Flatr Apps ligger i platform.db; src/api/apps.js når dem herfra.
    APP_CATALOG: {
      customAppFor: (id) => customAppFor(id, tenant.id),
      canInstallCustom: (id) => canInstallCustom(id, tenant.id),
      countInstall,
      runCustomApp
    }
  };
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });

// Åpne endepunkter på en kundes subdomene (skjermvisning og offentlig program).
// Alt annet under /api krever innlogging.
function isPublic(method, key, url) {
  if (key === '/api/context' || key === '/api/health') return true;
  if (key.startsWith('/api/pairing/status/')) return method === 'GET';
  if (key === '/api/pairing/request' || key === '/api/heartbeat' || key === '/api/plays') return method === 'POST';
  if (key.startsWith('/api/pairing/screenshot/')) return method === 'POST'; // TV-token sjekkes i pairing.js
  if (method !== 'GET') return false;
  if (['/api/state', '/api/stream', '/api/schedule', '/api/categories', '/api/screens', '/api/snapshot', '/api/feeds'].includes(key)) {
    return true;
  }
  return key === '/api/media' && url.searchParams.get('raw') && url.searchParams.get('id');
}

/**
 * Gir brukeren en tilfeldig profilfarge første gang (brukes for markør og
 * markering i editoren). Helst en farge ingen andre på teamet har.
 */
function ensureColor(user, tenant) {
  if (!user) return user;
  let prefs = {};
  try {
    prefs = JSON.parse(user.prefs || '{}') || {};
  } catch {
    prefs = {};
  }
  const palette = userColorPalette();
  if (palette.includes(prefs.color)) return user;
  const taken = new Set(
    platformDb
      .prepare(`SELECT u.prefs FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = ? AND u.id != ?`)
      .bind(tenant.id, user.user_id)
      .allSync()
      .results.map((r) => {
        try {
          return JSON.parse(r.prefs || '{}').color;
        } catch {
          return null;
        }
      })
  );
  const free = palette.filter((c) => !taken.has(c));
  const pool = free.length ? free : palette;
  const color = pool[Math.floor(Math.random() * pool.length)];
  return { ...user, prefs: JSON.stringify(updatePrefs(user.user_id, { color })) };
}

/** Innlogget medlem av kunden: Better Auth-økt (bekreftet e-post) + medlemskap. */
async function currentUser(request, tenant) {
  const s = await authSession(request);
  if (!s?.user?.emailVerified) return null;
  const member = memberByEmail(tenant.id, s.user.email);
  return member ? { ...member, two_factor: !!s.user.twoFactorEnabled } : null;
}

/** Kontoen krever tofaktor for alle (Team → «Krev tofaktor»). */
async function requires2fa(tenant) {
  try {
    const row = await tenantResources(tenant.slug).DB.prepare(`SELECT value FROM settings WHERE key = 'require_2fa'`).first();
    return row?.value === '1';
  } catch {
    return false;
  }
}

// Det en leser og en bruker uten påkrevd tofaktor fortsatt får gjøre.
const ALWAYS_ALLOWED = new Set(['/api/me', '/api/context', '/api/plan']);

/**
 * CSRF-vern: innloggingen gjelder alle *.flatr.no, så en side på én kundes
 * adresse må ikke kunne sende endringer til en annen. Nettlesere sender alltid
 * Origin på POST/PUT/DELETE; den må være samme adresse som forespørselen.
 * (TV-appen og serverkall sender ikke Origin og påvirkes ikke.)
 */
function crossSiteWrite(request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return false;
  const origin = request.headers.get('origin');
  if (!origin || origin === 'null') return origin === 'null';
  try {
    return new URL(origin).host !== request.headers.get('host');
  } catch {
    return true;
  }
}

// Skriving som ikke endrer det skjermene viser – vekker ikke skjermstrømmene
// (pulsen fra hver skjerm ville ellers fått alle de andre til å hente på nytt).
const QUIET_WRITES = /^\/api\/(heartbeat|plays|comments|prefs|ai|agents|activity|pairing\/screenshot|pairing\/request)/;

async function handleTenant(request, tenant) {
  // Mediefiler på en adresse Cloudflare mellomlagrer (se cdnMediaUrls i src/api/_shared.js).
  const cdn = /^\/m\/(\d+)\.[a-z0-9]+$/.exec(new URL(request.url).pathname);
  if (cdn && ['GET', 'HEAD'].includes(request.method)) {
    const u = new URL(request.url);
    u.pathname = '/api/media';
    u.search = `?id=${cdn[1]}&raw=1`;
    request = new Request(u, { method: request.method, headers: request.headers });
  }
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/auth/') && crossSiteWrite(request)) {
    return jsonError(403, 'Forespørselen kom fra en annen adresse.');
  }
  const user = ensureColor(await currentUser(request, tenant), tenant);
  const ctx = { ...ctxBase, tenant, user };

  // Tofaktorkravet gjelder også team, henvisning og forespørsler (håndteres under).
  if (user && !user.two_factor && url.pathname.startsWith('/api/') && !ALWAYS_ALLOWED.has(apiKey(url.pathname)) && !/^\/api\/(auth|prefs|invite)(\/|$)/.test(url.pathname) && (await requires2fa(tenant))) {
    return new Response(JSON.stringify({ error: 'Kontoen krever tofaktor. Slå det på under Konto og sikkerhet.', code: 'needs_2fa' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  const auth = await handleTenantAuthRoute(request, ctx);
  if (auth) return auth;

  if (!(url.pathname === '/api' || url.pathname.startsWith('/api/'))) {
    return ASSETS.fetch(request);
  }

  const key = apiKey(url.pathname);
  if (key.startsWith('/api/collab/')) return jsonError(426, 'forventet websocket');
  const marketFile = await serveMarketFile(request);
  if (marketFile) return marketFile;

  if (key === '/api/context') {
    return json({
      mode: 'tenant',
      base_domain: BASE_DOMAIN,
      tenant: { slug: tenant.slug, name: tenant.name },
      signed_in: !!user,
      social: SOCIAL_PROVIDERS,
      // Kontoen krever tofaktor, og brukeren har det ikke: admin viser oppsettet.
      needs_2fa: !!user && !user.two_factor && (await requires2fa(tenant)),
      // Innlogget i Flatr, men ikke medlem her – login-siden sier «ingen tilgang».
      account: user ? null : (await authSession(request))?.user?.email ?? null
    });
  }

  if (!user && !isPublic(request.method, key, url)) return jsonError(401, 'Ikke innlogget');
  if (user && !ALWAYS_ALLOWED.has(key)) {
    if (!user.two_factor && (await requires2fa(tenant))) {
      return new Response(JSON.stringify({ error: 'Kontoen krever tofaktor. Slå det på under Konto og sikkerhet.', code: 'needs_2fa' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
    // Lesere kan se alt, men ikke endre noe.
    if (user.role === 'viewer' && !['GET', 'HEAD', 'OPTIONS'].includes(request.method) && key !== '/api/comments') {
      return jsonError(403, 'Du har lesetilgang og kan ikke endre noe. Be en eier om å gi deg redaktørtilgang.');
    }
  }

  const env = tenantEnv(tenant, user);
  if (key === '/api/import') return handleImportRoute(request, ctx, env);
  if (key === '/api/market' || key === '/api/market/install') return handleMarketRoute(request, ctx, env);
  if (key === '/api/app-market' || key.startsWith('/api/app-market/')) return handleAppMarketRoute(request, { ...ctx, tenant });

  const isPairingWrite =
    request.method === 'POST' &&
    ['/api/pairing/link', '/api/pairing/reassign', '/api/pairing/unpair'].includes(key);

  if (isPairingWrite && key === '/api/pairing/link') {
    // Kvoten sjekkes før koden flyttes fra hubben, så TV-en ikke blir hengende.
    const atLimit = await checkLimit(env, 'devices');
    if (atLimit) return atLimit;
    const body = await request.clone().json().catch(() => null);
    if (body?.new_screen) {
      const full = await checkLimit(env, 'screens');
      if (full) return full;
    }
    await claimFromHub(request, tenant, env);
  }
  // Aktivitetslogg og versjonshistorikk: beskriv vellykkede endringer.
  const write = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
  env.AFTER_WRITE = (info) => (notifyChange(tenant.slug), afterWrite(env, user, info));
  const before = write ? await beforeWrite(env, request.method, key, url).catch(() => null) : null;
  const isJson = /json/i.test(request.headers.get('content-type') || '');
  const body = write && isJson ? await request.clone().json().catch(() => null) : null;

  const res = await routeApi(request, env);
  if (isPairingWrite) await syncRoutes(tenant, env);
  if (write && res.ok && !QUIET_WRITES.test(key)) notifyChange(tenant.slug);
  if (write && res.ok && user) {
    const result = /json/i.test(res.headers.get('content-type') || '') ? await res.clone().json().catch(() => null) : null;
    afterWrite(env, user, { method: request.method, key, url, body, result, before });
  }
  return res;
}

async function handlePlatform(request) {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/auth/') && crossSiteWrite(request)) {
    return jsonError(403, 'Forespørselen kom fra en annen adresse.');
  }

  const platform = await handlePlatformRoute(request, ctxBase);
  if (platform) return platform;

  const superadmin = await handleSuperadminRoute(request, ctxBase);
  if (superadmin) return superadmin;

  const device = await handleApexDevice(request, {
    // TV-appen: nettsider/YouTube byttes ut med bilder (se buildState).
    tenantEnv: (t) => ({ ...tenantEnv(t, null), DEVICE_MODE: true }),
    origin: ctxBase.origin
  });
  if (device) return device;

  const marketFile = await serveMarketFile(request);
  if (marketFile) return marketFile;

  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    const key = apiKey(url.pathname);
    if (key === '/api/context') return json({ mode: 'platform', base_domain: BASE_DOMAIN, social: SOCIAL_PROVIDERS });
    if (key === '/api/platform/apps' && request.method === 'GET') return json(publicCatalog());
    if (key === '/api/health') return json({ ok: true, time: new Date().toISOString() });
    return jsonError(404, 'Ukjent endepunkt');
  }
  return ASSETS.fetch(request);
}

async function app(request) {
  const where = resolveHost(request.headers.get('host'));
  try {
    // App-ikoner er åpne (vises i katalogen og på skjermene).
    const icon = serveAppIcon(request);
    if (icon) return icon;
    // Better Auth (innlogging, passord, tofaktor) – samme endepunkter på alle adresser.
    if (new URL(request.url).pathname.startsWith('/api/auth/') && where.kind !== 'unknown') return await auth.handler(request);
    if (where.kind === 'tenant') return await handleTenant(request, where.tenant);
    if (where.kind === 'unknown') {
      return new Response(
        `<!doctype html><meta charset="utf-8"><title>Finnes ikke</title><body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h1>Denne Flatr-kontoen finnes ikke</h1><p><a href="${ctxBase.origin(null)}">Gå til ${BASE_DOMAIN}</a></p></div>`,
        { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }
    return await handlePlatform(request);
  } catch (err) {
    console.error('[flatr]', request.method, request.url, err);
    return jsonError(500, 'Intern feil');
  }
}

// Eksisterende brukere får en Better Auth-bruker (passord settes via «Glemt passord»).
await migrateExistingUsers().catch((err) => console.error('[identity] migrering:', err));

const server = http.createServer(getRequestListener(app));

// WebSocket for live-samarbeid: /api/collab/<rom> på kundens subdomene.
server.on('upgrade', async (req, socket, head) => {
  const reject = (code, text) => {
    socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
  };
  try {
    const where = resolveHost(req.headers.host);
    const url = new URL(req.url, 'http://x');
    const m = apiKey(url.pathname).match(/^\/api\/collab\/([A-Za-z0-9:._-]{1,64})$/);
    if (!m || where.kind !== 'tenant') return reject(404, 'Not Found');

    const request = new Request(`http://${req.headers.host}${req.url}`, { headers: req.headers });
    const sess = await currentUser(request, where.tenant);
    const user = sess && (await getUser(request, { SESSION_USER: sess }));
    if (!user) return reject(401, 'Unauthorized');

    handleCollabUpgrade(req, socket, head, {
      roomKey: `${where.tenant.slug}:deck:${m[1]}`,
      identity: { name: user.name, color: user.color, sub: user.sub }
    });
  } catch (err) {
    console.error('[collab]', err);
    reject(500, 'Internal Server Error');
  }
});

setInterval(() => {
  try {
    sweepPlatform();
  } catch (err) {
    console.error('[sweep]', err);
  }
}, 3600_000).unref();

// Skjermbilder av nettsider til Apple TV krever konverterings-containeren.
if (process.env.CONVERTER_URL) startSnapshots();
// Visningslogg og offline-varsel for parede skjermer.
startMonitor();
startNotices();

server.listen(PORT, () => {
  console.log(`Flatr kjører på :${PORT}  (${PROTOCOL}://${BASE_DOMAIN}, kunder på *.${BASE_DOMAIN})`);
});
