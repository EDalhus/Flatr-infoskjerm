// Enhets-parring for TV-klienter (Apple TV / tvOS, Fire TV, nettleser-kiosk …).
//
// Flyt:
//   1. TV-en starter  ->  POST /api/pairing/request
//        Backend lager en `device_id` (opak UUID) + en kort kode ("ABC-DEF"),
//        lagrer en `pending`-rad som utløper om 15 min, og svarer med begge.
//        TV-en viser koden på skjermen og lagrer `device_id` lokalt.
//   2. TV-en poller  ->  GET /api/pairing/status/<device_id>  hvert ~4. sekund.
//   3. Admin taster inn koden i webpanelet og velger en skjerm
//        ->  POST /api/pairing/link { pairing_code, screen_id }   (krever ADMIN_TOKEN)
//        Raden settes til `paired`, får `screen_id` og en `auth_token`.
//   4. Neste status-poll fra TV-en svarer { status:"paired", screen_id, auth_token, … }.
//        TV-en henter så innhold fra /api/state?screen=<id> og lytter på
//        /api/stream?screen=<id> (SSE), og sender `Authorization: Bearer <auth_token>`.
//
// Rutene er prefiks-montert i src/worker.js: alt under /api/pairing/ havner her.

import {
  json,
  noContent,
  badRequest,
  notFound,
  handleOptions,
  readJson,
  requireAdmin,
  toIntOrNull
} from './_shared.js';

// Kode-alfabet uten forvekslbare tegn (ingen I, O, 0, 1).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 6;
const CODE_TTL_MIN = 15; // koden er gyldig i 15 minutter
const POLL_SECONDS = 4; // anbefalt polleintervall for TV-en

const nowIso = () => new Date().toISOString();
const plusMinutes = (m) => new Date(Date.now() + m * 60_000).toISOString();

function randomCode() {
  const bytes = new Uint8Array(CODE_LEN);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

function randomToken(byteLen = 32) {
  const buf = new Uint8Array(byteLen);
  crypto.getRandomValues(buf);
  let bin = '';
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// `pending` blir `expired` når `expires_at` er passert.
function effectiveStatus(row) {
  if (row.status === 'pending' && row.expires_at && Date.parse(row.expires_at) < Date.now()) {
    return 'expired';
  }
  return row.status;
}

// Lat opprydding – fjern gamle pending/expired-rader så tabellen holdes liten.
async function sweep(env) {
  try {
    await env.DB.prepare(
      `DELETE FROM pairings
         WHERE status IN ('pending', 'expired')
           AND created_at < ?`
    )
      .bind(new Date(Date.now() - 24 * 3600_000).toISOString())
      .run();
  } catch {
    /* ikke kritisk */
  }
}

/* ============================ POST ============================ */

export async function onRequestPost(context) {
  const path = new URL(context.request.url).pathname.replace(/\/+$/, '');
  if (path === '/api/pairing/request') return handleRequest(context);
  if (path === '/api/pairing/link') return handleLink(context);
  if (path === '/api/pairing/unpair') return handleUnpair(context);
  return notFound('Ukjent parrings-endepunkt');
}

// POST /api/pairing/request  – kalles av TV-en ved oppstart. Åpent endepunkt.
async function handleRequest({ env }) {
  await sweep(env);

  // Enkel global brems mot flom (Cloudflare WAF/Rate Limiting bør stå foran i prod).
  const recent = await env.DB
    .prepare(`SELECT COUNT(*) AS c FROM pairings WHERE created_at > ?`)
    .bind(new Date(Date.now() - 60_000).toISOString())
    .first();
  if ((recent?.c ?? 0) > 60) {
    return json({ error: 'For mange forespørsler. Prøv igjen om litt.' }, { status: 429 });
  }

  const deviceId = crypto.randomUUID();
  const expiresAt = plusMinutes(CODE_TTL_MIN);

  // Prøv noen ganger i tilfelle kode-kollisjon (partiell unik-indeks på pending-koder).
  let code = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = randomCode();
    try {
      await env.DB
        .prepare(
          `INSERT INTO pairings (code, device_id, status, expires_at)
           VALUES (?, ?, 'pending', ?)`
        )
        .bind(candidate, deviceId, expiresAt)
        .run();
      code = candidate;
      break;
    } catch {
      /* kollisjon – prøv en ny kode */
    }
  }
  if (!code) {
    return json({ error: 'Kunne ikke opprette parringskode. Prøv igjen.' }, { status: 503 });
  }

  return json(
    {
      device_id: deviceId,
      code,
      code_display: `${code.slice(0, 3)}-${code.slice(3)}`, // pen visning på TV-en
      expires_at: expiresAt,
      status_url: `/api/pairing/status/${deviceId}`,
      poll_interval_seconds: POLL_SECONDS
    },
    { status: 201 }
  );
}

// POST /api/pairing/link  { pairing_code, screen_id }  – fra web-admin. Krever ADMIN_TOKEN når satt.
async function handleLink(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const b = await readJson(context.request);
  const code = String(b?.pairing_code ?? b?.code ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, ''); // godta både "ABC-DEF" og "abcdef"
  const screenId = toIntOrNull(b?.screen_id);

  if (!code) return badRequest('pairing_code er påkrevd');
  if (!screenId) return badRequest('screen_id er påkrevd');

  const screen = await context.env.DB
    .prepare('SELECT id, name FROM screens WHERE id = ?')
    .bind(screenId)
    .first();
  if (!screen) return notFound('Skjermen finnes ikke');

  const row = await context.env.DB.prepare('SELECT * FROM pairings WHERE code = ?').bind(code).first();
  if (!row) {
    return json({ error: 'Ukjent parringskode. Sjekk at du taster den riktig.', reason: 'not_found' }, { status: 404 });
  }

  const eff = effectiveStatus(row);

  if (eff === 'expired') {
    if (row.status !== 'expired') {
      await context.env.DB.prepare(`UPDATE pairings SET status = 'expired' WHERE id = ?`).bind(row.id).run();
    }
    return json({ error: 'Parringskoden er utløpt. Start parring på nytt på TV-en.', reason: 'expired' }, { status: 410 });
  }

  if (eff === 'paired') {
    // Idempotent: samme skjerm -> ok. Annen skjerm -> konflikt.
    if (row.screen_id === screenId) {
      return json({ ok: true, already: true, screen_id: screenId, screen_name: screen.name });
    }
    return json(
      { error: 'Denne koden er allerede brukt på en annen skjerm.', reason: 'already_paired' },
      { status: 409 }
    );
  }

  // pending -> paired
  const authToken = randomToken(32);
  await context.env.DB
    .prepare(
      `UPDATE pairings
          SET status = 'paired', screen_id = ?, auth_token = ?, paired_at = ?
        WHERE id = ? AND status = 'pending'`
    )
    .bind(screenId, authToken, nowIso(), row.id)
    .run();

  // (auth_token returneres bevisst IKKE her – bare TV-en får den via /status.)
  return json({ ok: true, screen_id: screenId, screen_name: screen.name, device_id: row.device_id });
}

// POST /api/pairing/unpair  { device_id | screen_id }  – admin opphever en paring.
async function handleUnpair(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const b = await readJson(context.request);
  const deviceId = b?.device_id ? String(b.device_id) : null;
  const screenId = toIntOrNull(b?.screen_id);
  if (!deviceId && !screenId) return badRequest('device_id eller screen_id er påkrevd');

  const stmt = deviceId
    ? context.env.DB.prepare('DELETE FROM pairings WHERE device_id = ?').bind(deviceId)
    : context.env.DB.prepare('DELETE FROM pairings WHERE screen_id = ?').bind(screenId);
  await stmt.run();
  return noContent();
}

/* ============================ GET ============================ */

export async function onRequestGet(context) {
  const path = new URL(context.request.url).pathname.replace(/\/+$/, '');

  const m = path.match(/^\/api\/pairing\/status\/([A-Za-z0-9-]{8,})$/);
  if (m) return handleStatus(context, m[1]);

  if (path === '/api/pairing') return handleList(context);

  return notFound('Ukjent parrings-endepunkt');
}

// GET /api/pairing/status/<device_id>  – TV-en poller. Åpent, men avslører kun
// data for en kjent, uraddbar device_id (128-bit UUID).
async function handleStatus({ env }, deviceId) {
  const row = await env.DB.prepare('SELECT * FROM pairings WHERE device_id = ?').bind(deviceId).first();
  if (!row) {
    // Ukjent enhet (slettet/opphevet) – be TV-en starte parring på nytt.
    return json({ status: 'unknown', poll_interval_seconds: POLL_SECONDS }, { status: 404 });
  }

  const eff = effectiveStatus(row);

  if (eff === 'expired') {
    if (row.status !== 'expired') {
      await env.DB.prepare(`UPDATE pairings SET status = 'expired' WHERE id = ?`).bind(row.id).run();
    }
    return json({ status: 'expired', poll_interval_seconds: POLL_SECONDS });
  }

  if (eff === 'paired') {
    // Marker enheten (og skjermen) som «sett» – gir online-status i admin.
    const ts = nowIso();
    try {
      await env.DB.prepare('UPDATE pairings SET last_seen = ? WHERE id = ?').bind(ts, row.id).run();
      if (row.screen_id) {
        await env.DB.prepare('UPDATE screens SET last_seen = ? WHERE id = ?').bind(ts, row.screen_id).run();
      }
    } catch {
      /* ikke kritisk */
    }
    return json({
      status: 'paired',
      screen_id: row.screen_id,
      auth_token: row.auth_token,
      // Klienten henter innhold herfra (relativt til samme origin):
      state_url: `/api/state?screen=${row.screen_id}`,
      stream_url: `/api/stream?screen=${row.screen_id}`,
      display_url: `/display/${row.screen_id}`,
      poll_interval_seconds: 30 // langsommere polling etter paring
    });
  }

  // pending
  return json({
    status: 'pending',
    code: row.code,
    code_display: `${row.code.slice(0, 3)}-${row.code.slice(3)}`,
    expires_at: row.expires_at,
    poll_interval_seconds: POLL_SECONDS
  });
}

// GET /api/pairing  – admin: liste over parringer (til admin-UI).
async function handleList(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const { results } = await context.env.DB
    .prepare(
      `SELECT p.id, p.code, p.device_id, p.status, p.screen_id,
              p.created_at, p.expires_at, p.paired_at, p.last_seen,
              s.name AS screen_name
         FROM pairings p
         LEFT JOIN screens s ON s.id = p.screen_id
        ORDER BY (p.status = 'pending') DESC, p.created_at DESC
        LIMIT 100`
    )
    .all();

  return json(
    (results ?? []).map((r) => ({
      ...r,
      status: effectiveStatus(r),
      online: r.last_seen ? Date.now() - Date.parse(r.last_seen) < 90_000 : false
    }))
  );
}

/**
 * Hjelper for å verifisere en TV-klients Bearer-token på innholds-endepunkter.
 * Returnerer { screenId } for en gyldig, paret token – ellers null.
 * Ikke påkrevd av /api/state|/api/stream i dag (nettleser-forhåndsvisning bruker
 * dem uten token); ta den i bruk der hvis du vil låse ned TV-trafikken.
 */
export async function verifyPairingToken(env, request) {
  const header = request.headers.get('Authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const row = await env.DB
    .prepare(`SELECT screen_id FROM pairings WHERE auth_token = ? AND status = 'paired'`)
    .bind(token)
    .first();
  return row ? { screenId: row.screen_id } : null;
}

export const onRequestOptions = handleOptions;
