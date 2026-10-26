// TV-ruting mellom hoveddomenet og kundene.
//
// tvOS-appen snakker alltid med https://flatr.no. Flyten:
//   1. TV-en ber om kode på hoveddomenet -> raden havner i «hubben» (platform.db).
//   2. Kunden taster koden i sitt admin-panel (<slug>.flatr.no) -> raden flyttes
//      fra hubben til kundens database, og device_routes husker hvem TV-en tilhører.
//   3. Videre status-poll, /api/state og /api/stream på hoveddomenet videresendes
//      til riktig kunde (via device_id eller TV-ens Bearer-token).
//
// Relative medie-URL-er (/api/media?id=…) i svarene skrives om til kundens
// absolutte adresse, siden TV-en henter dem uten token.

import { pairing, routeApi, apiKey } from '../src/router.js';
import { platformDb, getTenantById, nowIso } from './platform.js';

const hubEnv = { DB: platformDb };
const normCode = (c) => String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function routeForDevice(deviceId) {
  return platformDb.prepare('SELECT * FROM device_routes WHERE device_id = ?').bind(deviceId).firstSync();
}

function routeForToken(token) {
  if (!token) return null;
  return platformDb.prepare('SELECT * FROM device_routes WHERE auth_token = ?').bind(token).firstSync();
}

const bearer = (request) => (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();

/** Skriver om "/api/… til "https://<slug>.flatr.no/api/… i en tekststrøm eller -kropp. */
function absolutize(response, origin) {
  const type = response.headers.get('content-type') || '';
  if (!response.body || !/json|event-stream/.test(type)) return response;
  const from = '"/api/';
  const to = `"${origin}/api/`;
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let carry = '';
  const body = response.body.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        // Hold igjen de siste tegnene i tilfelle mønsteret deles mellom to biter.
        const text = carry + decoder.decode(chunk, { stream: true });
        const cut = Math.max(0, text.length - (from.length - 1));
        carry = text.slice(cut);
        controller.enqueue(encoder.encode(text.slice(0, cut).replaceAll(from, to)));
      },
      flush(controller) {
        controller.enqueue(encoder.encode((carry + decoder.decode()).replaceAll(from, to)));
      }
    })
  );
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(body, { status: response.status, headers });
}

/**
 * Forespørsler fra TV-er på hoveddomenet. Returnerer null hvis det ikke er en
 * TV-rute. `tenantEnv(tenant)` bygger env for en kunde.
 */
export async function handleApexDevice(request, { tenantEnv, origin }) {
  const url = new URL(request.url);
  const key = apiKey(url.pathname);

  if (key === '/api/pairing/request' && request.method === 'POST') {
    return pairing.onRequestPost({ request, env: hubEnv });
  }

  const status = key.match(/^\/api\/pairing\/status\/([A-Za-z0-9-]{8,})$/);
  if (status && request.method === 'GET') {
    const route = routeForDevice(status[1]);
    const tenant = route && getTenantById(route.tenant_id);
    if (!tenant) return pairing.onRequestGet({ request, env: hubEnv });

    const res = await pairing.onRequestGet({ request, env: tenantEnv(tenant) });
    if (res.status === 404) {
      // Opphevet hos kunden – glem ruten så TV-en kan pares på nytt.
      platformDb.prepare('DELETE FROM device_routes WHERE device_id = ?').bind(status[1]).runSync();
    }
    return res;
  }

  // Skjermbilde fra en paret TV -> kundens lagring (token sjekkes i pairing.js).
  const shot = key.match(/^\/api\/pairing\/screenshot\/([A-Za-z0-9-]{8,})$/);
  if (shot && request.method === 'POST') {
    const route = routeForDevice(shot[1]);
    const tenant = route && getTenantById(route.tenant_id);
    if (!tenant) return new Response(JSON.stringify({ error: 'Ukjent enhet' }), { status: 401 });
    return pairing.onRequestPost({ request, env: tenantEnv(tenant) });
  }

  // Innhold for en paret TV. Uten gyldig token finnes ingen kunde å svare for.
  if (['/api/state', '/api/stream', '/api/heartbeat'].includes(key)) {
    const route = routeForToken(bearer(request));
    const tenant = route && getTenantById(route.tenant_id);
    if (!tenant) {
      return new Response(JSON.stringify({ error: 'Ukjent enhet. Par TV-en på nytt.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
    const res = await routeApi(request, tenantEnv(tenant));
    return absolutize(res, origin(tenant.slug));
  }

  return null;
}

/**
 * Kundens POST /api/pairing/link: hent koden fra hubben først, så finner
 * pairing.js den i kundens egen database som vanlig.
 */
export async function claimFromHub(request, tenant, env) {
  const body = await request.clone().json().catch(() => null);
  const code = normCode(body?.pairing_code ?? body?.code);
  const screenId = Number.parseInt(body?.screen_id, 10);
  if (!code || (!screenId && !body?.new_screen)) return;

  // Ikke ta koden fra hubben hvis koblingen uansett vil feile.
  if (screenId) {
    const screen = await env.DB.prepare('SELECT id FROM screens WHERE id = ?').bind(screenId).first();
    if (!screen) return;
  }

  const row = platformDb
    .prepare(`SELECT * FROM pairings WHERE code = ? AND status = 'pending' AND expires_at > ?`)
    .bind(code, nowIso())
    .firstSync();
  if (!row) return;

  await env.DB.prepare(
    `INSERT INTO pairings (code, device_id, status, expires_at, client_info, created_at, last_seen)
     VALUES (?, ?, 'pending', ?, ?, ?, ?)`
  )
    .bind(row.code, row.device_id, row.expires_at, row.client_info, row.created_at, row.last_seen)
    .run();
  platformDb.prepare('DELETE FROM pairings WHERE id = ?').bind(row.id).runSync();
  platformDb
    .prepare('INSERT OR REPLACE INTO device_routes (device_id, tenant_id) VALUES (?, ?)')
    .bind(row.device_id, tenant.id)
    .runSync();
}

/** Etter link/reassign/unpair: hold device_routes i takt med kundens pairings. */
export async function syncRoutes(tenant, env) {
  const { results } = await env.DB.prepare(
    `SELECT device_id, auth_token FROM pairings WHERE status IN ('pending', 'paired')`
  ).all();
  const live = new Map(results.map((r) => [r.device_id, r.auth_token]));
  const routes = platformDb
    .prepare('SELECT device_id FROM device_routes WHERE tenant_id = ?')
    .bind(tenant.id)
    .allSync().results;
  for (const { device_id } of routes) {
    if (!live.has(device_id)) {
      platformDb.prepare('DELETE FROM device_routes WHERE device_id = ?').bind(device_id).runSync();
    } else {
      platformDb
        .prepare('UPDATE device_routes SET auth_token = ? WHERE device_id = ?')
        .bind(live.get(device_id), device_id)
        .runSync();
    }
  }
}
