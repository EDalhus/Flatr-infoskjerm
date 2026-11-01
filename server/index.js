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
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { screenshotUrl } from './convert.js';
import path from 'node:path';
import { getRequestListener } from '@hono/node-server';
import { routeApi, apiKey, jsonError } from '../src/router.js';
import { getUser } from '../src/api/_access.js';
import { checkLimit } from '../src/api/_shared.js';
import { createAssets } from './assets.js';
import { handleCollabUpgrade } from './collab.js';
import { getTenantBySlug, tenantResources, memberByEmail, sweepPlatform, tenantLimits, updatePrefs, platformDb, normEmail } from './platform.js';
import { handleGroupRoute, groupAdminFor, groupsForAdmin } from './groups.js';
import { auth, authSession, migrateExistingUsers, SOCIAL_PROVIDERS } from './identity.js';
import { userColorPalette } from '../src/api/_access.js';
import { handlePlatformRoute, handleTenantAuthRoute } from './auth.js';
import { handleApexDevice, claimFromHub, syncRoutes } from './devices.js';
import { handleImportRoute } from './imports.js';
import { handleExportRoute } from './export.js';
import { handleSuperadminRoute } from './superadmin.js';
import { handleMarketRoute, serveMarketFile } from './market.js';
import { handleAppMarketRoute, customAppFor, canInstallCustom, countInstall, runCustomApp, publicCatalog } from './appMarket.js';
import { serveAppIcon } from './appIcons.js';
import { startSnapshots, requestRefresh } from './snapshots.js';
import { startMonitor } from './monitor.js';
import { startNotices } from './notices.js';
import { queueVideo, resumeVideos, videoSupported } from './video.js';
import { handleV1 } from '../src/api/v1.js';
import { afterWrite, beforeWrite } from '../src/api/activity.js';
import { notifyChange, waitForChange } from './changes.js';
import { notifier, teamMembers } from './notify.js';
import { trustedClientIp } from './clientIp.js';
import { healthChecks } from './health.js';
import { handleBillingRoute, handleBillingWebhook, startBilling } from './billing.js';
import { stripeEnabled } from './stripe.js';
import { includedAi } from './aiQuota.js';
import { withLang, requestLang, translateMessage } from './i18n.js';
import { tr } from '../src/lib/i18n.js';

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
    // Kundens adresse (lenker som skal skannes, f.eks. avstemninger).
    ORIGIN: ctxBase.origin(tenant.slug),
    LIMITS: { ...tenantLimits(tenant), billing: stripeEnabled() },
    // Flatr AI inkludert (Flatrs Claude-nøkkel med månedlig kvote), eller null.
    AI_INCLUDED: includedAi(tenant),
    // TV-er venter på skjermbilder av widgeter – be om dem med en gang.
    REQUEST_SNAPSHOTS: () => process.env.CONVERTER_URL && requestRefresh(tenant.slug),
    // Videoer komprimeres etter opplasting (bare når ffmpeg finnes).
    VIDEO_QUEUE: videoSupported ? (id) => queueVideo(tenant.slug, id) : null,
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

/* ----------------------------- sikkerhetshoder ----------------------------- */

// Det lille innebygde skriptet i index.html (tema før første tegning) godkjennes
// med sitt fingeravtrykk – ellers bare skript fra egen adresse.
const INLINE_SCRIPTS = (() => {
  try {
    const html = readFileSync(path.join(ROOT, 'dist', 'index.html'), 'utf8');
    return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`).join(' ');
  } catch {
    return '';
  }
})();

// Skjermvisning, offentlig program og widgeter kan bygges inn hos kunden; resten bare her.
const EMBEDDABLE = /^\/(display|s|widget)(\/|$)/;

function contentSecurityPolicy(pathname) {
  return [
    "default-src 'self'",
    // stats.dalhus.net = besøksstatistikk (Umami) på forsiden.
    `script-src 'self' https://stats.dalhus.net ${INLINE_SCRIPTS}`.trim(),
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    'img-src * data: blob:',
    'media-src * data: blob:',
    // Kartfliser (mørkt sjøkart fargelegges i nettleseren) og live-samarbeid.
    "connect-src 'self' https://cache.kartverket.no https://stats.dalhus.net",
    // Nettside-widgeter, YouTube og Vimeo.
    "frame-src 'self' https:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${EMBEDDABLE.test(pathname) ? '*' : "'self'"}`
  ].join('; ');
}

/** Legger på sikkerhetshoder (CSP på HTML-sider) uten å overstyre det et svar har satt selv. */
function withSecurityHeaders(res, pathname) {
  const out = new Response(res.body, res);
  const h = out.headers;
  if (!h.has('X-Content-Type-Options')) h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  if (/text\/html/i.test(h.get('Content-Type') || '') && !h.has('Content-Security-Policy')) {
    h.set('Content-Security-Policy', contentSecurityPolicy(pathname));
    if (!EMBEDDABLE.test(pathname)) h.set('X-Frame-Options', 'SAMEORIGIN');
  }
  return out;
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
  // Avstemninger: publikum stemmer uten innlogging (grense per IP i polls.js).
  if (key === '/api/vote') return method === 'GET' || method === 'POST';
  // Cursor AI: egen nøkkel per pågående oppgave (src/api/mcp.js).
  if (key === '/api/mcp') return true;
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

/**
 * Innlogget medlem av kunden: Better Auth-økt (bekreftet e-post) + medlemskap.
 * Administratorer for gruppen kunden er med i (kjede/kommune), er redaktører
 * her uten å stå i teamet. `groups` = gruppene brukeren administrerer.
 */
async function currentUser(request, tenant) {
  const s = await authSession(request);
  if (!s?.user?.emailVerified) return null;
  const groups = groupsForAdmin(s.user.email);
  const member = memberByEmail(tenant.id, s.user.email);
  if (member) return { ...member, groups, two_factor: !!s.user.twoFactorEnabled };
  const g = groupAdminFor(tenant.id, s.user.email);
  const u = g && platformDb.prepare('SELECT id, email, name, prefs FROM users WHERE email = ?').bind(normEmail(s.user.email)).firstSync();
  return u ? { user_id: u.id, email: u.email, name: u.name, prefs: u.prefs, role: 'editor', group_admin: g.name, groups, two_factor: !!s.user.twoFactorEnabled } : null;
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
const QUIET_WRITES = /^\/api\/(heartbeat|plays|mcp|comments|prefs|ai|agents|activity|pairing\/screenshot|pairing\/request|vote|polls)/;

async function handleTenant(request, tenant) {
  // Mediefiler på en adresse Cloudflare mellomlagrer (se cdnMediaUrls i src/api/_shared.js).
  // /m/<id>.<endelse> eller /m/<id>v<rev>.<endelse> (ny fil etter videokomprimering).
  const cdn = /^\/m\/(\d+)(?:v\d+)?\.[a-z0-9]+$/.exec(new URL(request.url).pathname);
  if (cdn && ['GET', 'HEAD'].includes(request.method)) {
    const u = new URL(request.url);
    u.pathname = '/api/media';
    u.search = `?id=${cdn[1]}&raw=1`;
    request = new Request(u, { method: request.method, headers: request.headers });
  }
  const url = new URL(request.url);
  // API for kundenes egne systemer: egen nøkkel (Bearer), ikke innlogging – se src/api/v1.js.
  if (url.pathname === '/api/v1' || url.pathname.startsWith('/api/v1/')) {
    const res = await handleV1(request, tenantEnv(tenant, null));
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && res.ok) notifyChange(tenant.slug);
    return res;
  }
  if (url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/auth/') && crossSiteWrite(request)) {
    return jsonError(403, 'Forespørselen kom fra en annen adresse.');
  }
  const user = ensureColor(await currentUser(request, tenant), tenant);
  const ctx = { ...ctxBase, tenant, user };

  // Tofaktorkravet gjelder også team, henvisning og forespørsler (håndteres under).
  if (user && !user.two_factor && url.pathname.startsWith('/api/') && !ALWAYS_ALLOWED.has(apiKey(url.pathname)) && !/^\/api\/(auth|prefs|invite|orgs)(\/|$)/.test(url.pathname) && (await requires2fa(tenant))) {
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
  if (key === '/api/export') return handleExportRoute(request, ctx, env);
  if (key === '/api/billing' || key.startsWith('/api/billing/')) return handleBillingRoute(request, ctx, env);
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
  // Stripe (signert, uten innlogging) – se server/billing.js.
  if (url.pathname === '/api/billing/webhook' && request.method === 'POST') return handleBillingWebhook(request);
  if (url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/auth/') && crossSiteWrite(request)) {
    return jsonError(403, 'Forespørselen kom fra en annen adresse.');
  }

  const platform = await handlePlatformRoute(request, ctxBase);
  if (platform) return platform;

  const superadmin = await handleSuperadminRoute(request, ctxBase);
  if (superadmin) return superadmin;

  const groups = await handleGroupRoute(request, ctxBase);
  if (groups) return groups;

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
    if (key === '/api/context') return json({ mode: 'platform', base_domain: BASE_DOMAIN, social: SOCIAL_PROVIDERS, billing: stripeEnabled() });
    if (key === '/api/platform/apps' && request.method === 'GET') return json(publicCatalog());
    // ?deep=1: ja/nei per del til statussiden (status.flatr.no), se server/health.js.
    if (key === '/api/health') {
      const checks = url.searchParams.get('deep') ? await healthChecks() : undefined;
      return json({ ok: true, time: new Date().toISOString(), checks });
    }
    return jsonError(404, 'Ukjent endepunkt');
  }
  return ASSETS.fetch(request);
}

// Det skjermene henter (TV-ene og spilleren i nettleseren) er alltid på norsk.
const SCREEN_API = /^\/api\/(state|stream|heartbeat|plays|feeds|snapshot|pairing\/(request|status|screenshot))(\/|$)/;

async function app(request) {
  // Én klarert klient-IP for hele appen (Better Auth og egne bremser), se clientIp.js.
  const headers = new Headers(request.headers);
  headers.set('x-flatr-client-ip', trustedClientIp(request.headers));
  request = new Request(request, { headers });
  const pathname = new URL(request.url).pathname;
  // Språket til den som spør gjelder for alt forespørselen gjør (tr() i koden, e-post), se server/i18n.js.
  const lang = SCREEN_API.test(apiKey(pathname)) ? 'nb' : requestLang(request);
  let res = await withLang(lang, () => route(request));
  if (lang !== 'nb' && res.status >= 400) res = await translateError(res, lang);
  // WebSocket-oppgraderinger håndteres utenfor (server.on('upgrade')).
  return res.status === 101 ? res : withSecurityHeaders(res, pathname);
}

/** Feilmeldingen i et JSON-svar («error», eller «message» fra Better Auth) på språket til den som spør. */
async function translateError(res, lang) {
  if (!String(res.headers.get('content-type') || '').includes('application/json')) return res;
  const data = await res
    .clone()
    .json()
    .catch(() => null);
  if (!data || typeof data !== 'object' || Array.isArray(data)) return res;
  let changed = false;
  for (const key of ['error', 'message']) {
    if (typeof data[key] !== 'string') continue;
    const text = translateMessage(lang, data[key]);
    changed ||= text !== data[key];
    data[key] = text;
  }
  if (!changed) return res;
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  return new Response(JSON.stringify(data), { status: res.status, statusText: res.statusText, headers });
}

async function route(request) {
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
        `<!doctype html><meta charset="utf-8"><title>${tr('Finnes ikke')}</title><body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h1>${tr('Denne Flatr-kontoen finnes ikke')}</h1><p><a href="${ctxBase.origin(null)}">${tr('Gå til {0}', [BASE_DOMAIN])}</a></p></div>`,
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
    // Bare fra kundens egen side: en side på et annet *.flatr.no-subdomene skal ikke
    // kunne koble seg på med besøkerens innlogging.
    let originHost = null;
    try {
      originHost = new URL(req.headers.origin || '').host;
    } catch {
      /* mangler */
    }
    if (originHost !== req.headers.host) return reject(403, 'Forbidden');

    const request = new Request(`http://${req.headers.host}${req.url}`, { headers: req.headers });
    const sess = await currentUser(request, where.tenant);
    const user = sess && (await getUser(request, { SESSION_USER: sess }));
    if (!user) return reject(401, 'Unauthorized');

    handleCollabUpgrade(req, socket, head, {
      roomKey: `${where.tenant.slug}:deck:${m[1]}`,
      identity: { name: user.name, color: user.color, sub: user.sub, canEdit: sess.role !== 'viewer' }
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
resumeVideos().catch((err) => console.error('[video] oppstart:', err.message));
startBilling();

server.listen(PORT, () => {
  console.log(`Flatr kjører på :${PORT}  (${PROTOCOL}://${BASE_DOMAIN}, kunder på *.${BASE_DOMAIN})`);
});
