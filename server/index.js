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
import path from 'node:path';
import { getRequestListener } from '@hono/node-server';
import { routeApi, apiKey, jsonError } from '../src/router.js';
import { getUser } from '../src/api/_access.js';
import { checkLimit } from '../src/api/_shared.js';
import { createAssets } from './assets.js';
import { handleCollabUpgrade } from './collab.js';
import { getTenantBySlug, tenantResources, sessionUser, sweepPlatform, tenantLimits, updatePrefs, platformDb } from './platform.js';
import { userColorPalette } from '../src/api/_access.js';
import { handlePlatformRoute, handleTenantAuthRoute, readCookie, SESSION_COOKIE } from './auth.js';
import { handleApexDevice, claimFromHub, syncRoutes } from './devices.js';
import { handleImportRoute } from './imports.js';
import { handleSuperadminRoute } from './superadmin.js';
import { startSnapshots } from './snapshots.js';
import { startMonitor } from './monitor.js';

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
    SESSION_USER: user ?? null,
    TENANT: { slug: tenant.slug, name: tenant.name },
    LIMITS: tenantLimits(tenant)
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
  if (key === '/api/pairing/request' || key === '/api/heartbeat') return method === 'POST';
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

async function handleTenant(request, tenant) {
  const url = new URL(request.url);
  const user = ensureColor(sessionUser(readCookie(request, SESSION_COOKIE), tenant.id), tenant);
  const ctx = { ...ctxBase, tenant, user };

  const auth = await handleTenantAuthRoute(request, ctx);
  if (auth) return auth;

  if (!(url.pathname === '/api' || url.pathname.startsWith('/api/'))) {
    return ASSETS.fetch(request);
  }

  const key = apiKey(url.pathname);
  if (key.startsWith('/api/collab/')) return jsonError(426, 'forventet websocket');

  if (key === '/api/context') {
    return json({
      mode: 'tenant',
      base_domain: BASE_DOMAIN,
      tenant: { slug: tenant.slug, name: tenant.name },
      signed_in: !!user
    });
  }

  if (!user && !isPublic(request.method, key, url)) return jsonError(401, 'Ikke innlogget');

  const env = tenantEnv(tenant, user);
  if (key === '/api/import') return handleImportRoute(request, ctx, env);

  const isPairingWrite =
    request.method === 'POST' &&
    ['/api/pairing/link', '/api/pairing/reassign', '/api/pairing/unpair'].includes(key);

  if (isPairingWrite && key === '/api/pairing/link') {
    // Kvoten sjekkes før koden flyttes fra hubben, så TV-en ikke blir hengende.
    const atLimit = await checkLimit(env, 'devices');
    if (atLimit) return atLimit;
    await claimFromHub(request, tenant, env);
  }
  const res = await routeApi(request, env);
  if (isPairingWrite) await syncRoutes(tenant, env);
  return res;
}

async function handlePlatform(request) {
  const url = new URL(request.url);

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

  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    const key = apiKey(url.pathname);
    if (key === '/api/context') return json({ mode: 'platform', base_domain: BASE_DOMAIN });
    if (key === '/api/health') return json({ ok: true, time: new Date().toISOString() });
    return jsonError(404, 'Ukjent endepunkt');
  }
  return ASSETS.fetch(request);
}

async function app(request) {
  const where = resolveHost(request.headers.get('host'));
  try {
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
    const sess = sessionUser(readCookie(request, SESSION_COOKIE), where.tenant.id);
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

server.listen(PORT, () => {
  console.log(`Flatr kjører på :${PORT}  (${PROTOCOL}://${BASE_DOMAIN}, kunder på *.${BASE_DOMAIN})`);
});
