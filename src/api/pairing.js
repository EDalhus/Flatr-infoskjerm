// Enhets-parring for TV-klienter (Apple TV / tvOS, Fire TV, nettleser-kiosk …).
//
// Flyt:
//   1. TV-en starter  ->  POST /api/pairing/request
//        Backend lager en `device_id` (opak UUID) + en kort kode ("ABC-DEF"),
//        lagrer en `pending`-rad som utløper om 15 min, og svarer med begge
//        + en `pair_url` TV-en kan vise som QR-kode.
//   2. TV-en poller  ->  GET /api/pairing/status/<device_id>  hvert ~4. sekund,
//        og legger gjerne ved klient-info som query: ?app_version=&tvos_version=&resolution=&uptime=
//   3. Admin taster inn koden i webpanelet (eller skanner QR-en) og velger skjerm
//        ->  POST /api/pairing/link { pairing_code, screen_id }   (krever ADMIN_TOKEN)
//        Raden settes til `paired`, får `screen_id` og en `auth_token`.
//   4. Neste status-poll fra TV-en svarer { status:"paired", screen_id, auth_token, commands, … }.
//        TV-en henter innhold fra /api/state?screen=<id> (med ETag) og lytter på
//        /api/stream?screen=<id> (SSE), og sender `Authorization: Bearer <auth_token>`.
//
// Admin kan i tillegg:
//   - POST /api/pairing/reassign { device_id, screen_id }  – flytte en TV til en annen skjerm
//   - POST /api/pairing/command  { device_id|screen_id, command } – kø en fjernkommando
//   - POST /api/pairing/unpair   { device_id|screen_id }
//   - GET  /api/pairing          – liste over enheter (+ online + client_info)
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
  toIntOrNull,
  safeJson
} from './_shared.js';

// Kode-alfabet uten forvekslbare tegn (ingen I, O, 0, 1).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 6;
const CODE_TTL_MIN = 15; // koden er gyldig i 15 minutter
const POLL_SECONDS = 4; // anbefalt polleintervall før paring
const PAIRED_POLL_SECONDS = 30; // roligere poll etter paring (henter også kommandoer)

// Fjernkommandoer admin kan kø. TV-en henter uleverte i status-pollen.
const COMMANDS = ['identify', 'reload', 'clear_cache', 'reboot'];

// Hvitliste for klient-info fra TV-en (alt annet forkastes; verdier trimmes).
const CLIENT_INFO_KEYS = [
  'device_name', // enhetens eget navn (f.eks. "Stue Apple TV")
  'app_version',
  'player_version',
  'tvos_version',
  'os_version',
  'model',
  'resolution',
  'ip',
  'hostname',
  'uptime_seconds',
  'storage_pct',
  'memory_pct',
  'cpu_temp',
  'gpu_temp'
];
// Disse tolkes som tall (resten som tekst, maks 60 tegn).
const CLIENT_INFO_NUM = new Set([
  'uptime_seconds',
  'storage_pct',
  'memory_pct',
  'cpu_temp',
  'gpu_temp'
]);

const nowIso = () => new Date().toISOString();
const plusMinutes = (m) => new Date(Date.now() + m * 60_000).toISOString();
const codeDisplay = (code) => `${code.slice(0, 3)}-${code.slice(3)}`;

// /admin?view=pairing&code=ABC-DEF  – TV-en viser denne som QR ved siden av koden.
const pairPath = (code) => `/admin?view=pairing&code=${encodeURIComponent(codeDisplay(code))}`;
const absolute = (request, path) => new URL(path, request.url).toString();

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

// Plukk ut kjente klient-info-felter fra et objekt (query-params eller JSON-body).
// Returnerer en JSON-streng, eller null hvis ingenting brukbart var med.
function pickClientInfo(source) {
  if (!source) return null;
  const out = {};
  for (const k of CLIENT_INFO_KEYS) {
    const v = source[k];
    if (v === undefined || v === null || v === '') continue;
    if (CLIENT_INFO_NUM.has(k)) {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = Math.round(n * 10) / 10;
    } else {
      out[k] = String(v).slice(0, 60);
    }
  }
  return Object.keys(out).length ? JSON.stringify(out) : null;
}

// `pending` blir `expired` når `expires_at` er passert.
function effectiveStatus(row) {
  if (row.status === 'pending' && row.expires_at && Date.parse(row.expires_at) < Date.now()) {
    return 'expired';
  }
  return row.status;
}

// Lat opprydding – hold tabellene små.
async function sweep(env) {
  const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  try {
    await env.DB.batch([
      env.DB
        .prepare(`DELETE FROM pairings WHERE status IN ('pending', 'expired') AND created_at < ?`)
        .bind(dayAgo),
      // Leverte kommandoer ryddes fort; uleverte får et døgn i tilfelle TV-en er nede.
      env.DB
        .prepare(
          `DELETE FROM pairing_commands
             WHERE (delivered_at IS NOT NULL AND delivered_at < ?)
                OR (delivered_at IS NULL AND created_at < ?)`
        )
        .bind(hourAgo, dayAgo)
    ]);
  } catch {
    /* ikke kritisk */
  }
}

/* ============================ POST ============================ */

export async function onRequestPost(context) {
  const path = new URL(context.request.url).pathname.replace(/\/+$/, '');
  if (path === '/api/pairing/request') return handleRequest(context);
  if (path === '/api/pairing/link') return handleLink(context);
  if (path === '/api/pairing/reassign') return handleReassign(context);
  if (path === '/api/pairing/rename') return handleRename(context);
  if (path === '/api/pairing/command') return handleCommand(context);
  if (path === '/api/pairing/unpair') return handleUnpair(context);
  return notFound('Ukjent parrings-endepunkt');
}

// POST /api/pairing/request  – kalles av TV-en ved oppstart. Åpent endepunkt.
// Valgfri body: { app_version, tvos_version, model, resolution }.
async function handleRequest({ request, env }) {
  await sweep(env);

  // Enkel global brems mot flom (Cloudflare WAF/Rate Limiting bør stå foran i prod).
  const recent = await env.DB
    .prepare(`SELECT COUNT(*) AS c FROM pairings WHERE created_at > ?`)
    .bind(new Date(Date.now() - 60_000).toISOString())
    .first();
  if ((recent?.c ?? 0) > 60) {
    return json({ error: 'For mange forespørsler. Prøv igjen om litt.' }, { status: 429 });
  }

  const clientInfo = pickClientInfo(await readJson(request));
  const deviceId = crypto.randomUUID();
  const expiresAt = plusMinutes(CODE_TTL_MIN);

  // Prøv noen ganger i tilfelle kode-kollisjon (partiell unik-indeks på pending-koder).
  let code = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = randomCode();
    try {
      await env.DB
        .prepare(
          `INSERT INTO pairings (code, device_id, status, expires_at, client_info)
           VALUES (?, ?, 'pending', ?, ?)`
        )
        .bind(candidate, deviceId, expiresAt, clientInfo)
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
      code_display: codeDisplay(code),
      expires_at: expiresAt,
      status_url: `/api/pairing/status/${deviceId}`,
      // Vis denne som QR ved siden av koden – skanning åpner admin med koden ferdig utfylt.
      pair_path: pairPath(code),
      pair_url: absolute(request, pairPath(code)),
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
    return json(
      { error: 'Ukjent parringskode. Sjekk at du taster den riktig.', reason: 'not_found' },
      { status: 404 }
    );
  }

  const eff = effectiveStatus(row);

  if (eff === 'expired') {
    if (row.status !== 'expired') {
      await context.env.DB.prepare(`UPDATE pairings SET status = 'expired' WHERE id = ?`)
        .bind(row.id)
        .run();
    }
    return json(
      { error: 'Parringskoden er utløpt. Start parring på nytt på TV-en.', reason: 'expired' },
      { status: 410 }
    );
  }

  if (eff === 'paired') {
    // Idempotent: samme skjerm -> ok. Annen skjerm -> konflikt (bruk /reassign i stedet).
    if (row.screen_id === screenId) {
      return json({ ok: true, already: true, screen_id: screenId, screen_name: screen.name });
    }
    return json(
      {
        error: 'Denne koden er allerede brukt på en annen skjerm. Bruk «bytt skjerm» på enheten.',
        reason: 'already_paired'
      },
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

// POST /api/pairing/reassign  { device_id, screen_id }  – flytt en paret TV til en annen skjerm.
// TV-en trenger ikke røres; den plukker opp ny screen_id ved neste status-poll.
async function handleReassign(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const b = await readJson(context.request);
  const deviceId = b?.device_id ? String(b.device_id) : null;
  const screenId = toIntOrNull(b?.screen_id);
  if (!deviceId) return badRequest('device_id er påkrevd');
  if (!screenId) return badRequest('screen_id er påkrevd');

  const screen = await context.env.DB
    .prepare('SELECT id, name FROM screens WHERE id = ?')
    .bind(screenId)
    .first();
  if (!screen) return notFound('Skjermen finnes ikke');

  const row = await context.env.DB
    .prepare(`SELECT id, status FROM pairings WHERE device_id = ?`)
    .bind(deviceId)
    .first();
  if (!row || row.status !== 'paired') return notFound('Enheten er ikke paret');

  await context.env.DB
    .prepare('UPDATE pairings SET screen_id = ? WHERE id = ?')
    .bind(screenId, row.id)
    .run();

  // La TV-en laste innhold på nytt raskt i stedet for å vente på neste SSE-diff.
  await queueCommand(context.env, deviceId, 'reload', null);

  return json({ ok: true, screen_id: screenId, screen_name: screen.name });
}

// POST /api/pairing/rename  { device_id, label }  – sett/fjern kallenavn på en enhet.
async function handleRename(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const b = await readJson(context.request);
  const deviceId = b?.device_id ? String(b.device_id) : null;
  if (!deviceId) return badRequest('device_id er påkrevd');
  const label = String(b?.label ?? '').trim().slice(0, 80) || null;

  const res = await context.env.DB
    .prepare('UPDATE pairings SET label = ? WHERE device_id = ?')
    .bind(label, deviceId)
    .run();
  if (!res.meta?.changes) return notFound('Enheten finnes ikke');

  return json({ ok: true, label });
}

// POST /api/pairing/command  { device_id | screen_id, command, payload? }
async function handleCommand(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const b = await readJson(context.request);
  const command = String(b?.command ?? '').toLowerCase();
  if (!COMMANDS.includes(command)) {
    return badRequest(`Ukjent kommando. Gyldige: ${COMMANDS.join(', ')}`);
  }

  const deviceId = b?.device_id ? String(b.device_id) : null;
  const screenId = toIntOrNull(b?.screen_id);
  if (!deviceId && !screenId) return badRequest('device_id eller screen_id er påkrevd');

  // Finn målenhetene + skjermnavn (brukes som «identify»-etikett).
  const targets = deviceId
    ? await context.env.DB
        .prepare(
          `SELECT p.device_id, s.name AS screen_name
             FROM pairings p LEFT JOIN screens s ON s.id = p.screen_id
            WHERE p.device_id = ? AND p.status = 'paired'`
        )
        .bind(deviceId)
        .all()
    : await context.env.DB
        .prepare(
          `SELECT p.device_id, s.name AS screen_name
             FROM pairings p LEFT JOIN screens s ON s.id = p.screen_id
            WHERE p.screen_id = ? AND p.status = 'paired'`
        )
        .bind(screenId)
        .all();

  const rows = targets.results ?? [];
  if (!rows.length) return notFound('Ingen paret enhet å sende til');

  let payload = b?.payload ?? null;
  for (const r of rows) {
    const p =
      command === 'identify' && !payload
        ? { label: r.screen_name || 'Denne skjermen', seconds: 10 }
        : payload;
    await queueCommand(context.env, r.device_id, command, p);
  }
  return json({ ok: true, command, queued: rows.length });
}

async function queueCommand(env, deviceId, command, payload) {
  await env.DB
    .prepare(`INSERT INTO pairing_commands (device_id, command, payload) VALUES (?, ?, ?)`)
    .bind(deviceId, command, payload ? JSON.stringify(payload) : null)
    .run();
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
// Valgfrie query-params: ?app_version=&tvos_version=&model=&resolution=&uptime_seconds=
async function handleStatus({ request, env }, deviceId) {
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

  // Oppdater last_seen (+ evt. fersk klient-info) på hver poll. Klient-info flettes
  // sammen med det som allerede er lagret, så en poll med bare noen felt ikke
  // nuller resten.
  const ts = nowIso();
  const fresh = pickClientInfo(Object.fromEntries(new URL(request.url).searchParams));
  try {
    if (fresh) {
      const merged = { ...safeJson(row.client_info, {}), ...JSON.parse(fresh) };
      await env.DB
        .prepare('UPDATE pairings SET last_seen = ?, client_info = ? WHERE id = ?')
        .bind(ts, JSON.stringify(merged), row.id)
        .run();
    } else {
      await env.DB.prepare('UPDATE pairings SET last_seen = ? WHERE id = ?').bind(ts, row.id).run();
    }
  } catch {
    /* ikke kritisk */
  }

  if (eff === 'paired') {
    // Speil «sist sett» til skjermen (online-status i admin).
    try {
      if (row.screen_id) {
        await env.DB.prepare('UPDATE screens SET last_seen = ? WHERE id = ?')
          .bind(ts, row.screen_id)
          .run();
      }
    } catch {
      /* ikke kritisk */
    }

    // Hent uleverte fjernkommandoer og marker dem levert (leveres nøyaktig én gang).
    let commands = [];
    try {
      const { results } = await env.DB
        .prepare(
          `SELECT id, command, payload FROM pairing_commands
             WHERE device_id = ? AND delivered_at IS NULL
             ORDER BY id ASC LIMIT 20`
        )
        .bind(deviceId)
        .all();
      commands = (results ?? []).map((c) => ({
        id: c.id,
        command: c.command,
        payload: c.payload ? safeJson(c.payload, null) : null
      }));
      if (commands.length) {
        await env.DB
          .prepare(
            `UPDATE pairing_commands SET delivered_at = ? WHERE device_id = ? AND delivered_at IS NULL`
          )
          .bind(ts, deviceId)
          .run();
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
      commands,
      poll_interval_seconds: PAIRED_POLL_SECONDS
    });
  }

  // pending
  return json({
    status: 'pending',
    code: row.code,
    code_display: codeDisplay(row.code),
    expires_at: row.expires_at,
    pair_path: pairPath(row.code),
    pair_url: absolute(request, pairPath(row.code)),
    poll_interval_seconds: POLL_SECONDS
  });
}

// GET /api/pairing  – admin: liste over parringer (til admin-UI).
async function handleList(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const { results } = await context.env.DB
    .prepare(
      `SELECT p.id, p.code, p.device_id, p.status, p.screen_id, p.label,
              p.created_at, p.expires_at, p.paired_at, p.last_seen, p.client_info,
              s.name AS screen_name
         FROM pairings p
         LEFT JOIN screens s ON s.id = p.screen_id
        ORDER BY (p.status = 'pending') DESC, p.created_at DESC
        LIMIT 100`
    )
    .all();

  return json(
    (results ?? []).map((r) => ({
      id: r.id,
      code: r.code,
      device_id: r.device_id,
      status: effectiveStatus(r),
      label: r.label,
      screen_id: r.screen_id,
      screen_name: r.screen_name,
      created_at: r.created_at,
      expires_at: r.expires_at,
      paired_at: r.paired_at,
      last_seen: r.last_seen,
      client_info: r.client_info ? safeJson(r.client_info, null) : null,
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
