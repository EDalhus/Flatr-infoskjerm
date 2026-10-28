// Plattform-laget: kunder (tenants), brukere, medlemskap, innlogging og
// TV-ruting. Ligger i én egen SQLite-fil (data/platform.db).
//
// Hver kunde har sin egen database + mediemappe:
//   data/tenants/<slug>/db.sqlite
//   data/tenants/<slug>/media/
// API-modulene i src/api/ får dermed «sin» env.DB og ser aldri andre kunder.

import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { D1Database } from './d1.js';
import { DiskBucket } from './r2.js';
import { migrateTenant } from './tenantMigrations.js';

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TENANT_SCHEMA = readFileSync(path.join(ROOT, 'schema.sql'), 'utf8');

mkdirSync(path.join(DATA_DIR, 'tenants'), { recursive: true });

export const platformDb = new D1Database(path.join(DATA_DIR, 'platform.db'));

platformDb.db.exec(`
CREATE TABLE IF NOT EXISTS tenants (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS memberships (
  tenant_id   INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'editor',          -- owner | editor
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (tenant_id, user_id)
);
-- Engangslenker (magisk lenke). Bare hash av tokenet lagres.
CREATE TABLE IF NOT EXISTS login_tokens (
  token_hash  TEXT PRIMARY KEY,
  purpose     TEXT NOT NULL,                           -- login | signup
  email       TEXT NOT NULL,
  tenant_id   INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  payload     TEXT,
  expires_at  TEXT NOT NULL,
  used_at     TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  id_hash     TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id   INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at  TEXT NOT NULL
);
-- Hvilken kunde en paret TV tilhører (TV-appen snakker alltid med hoveddomenet).
CREATE TABLE IF NOT EXISTS device_routes (
  device_id   TEXT PRIMARY KEY,
  tenant_id   INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  auth_token  TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_device_routes_token ON device_routes (auth_token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

-- «Parrings-hub»: ventende koder fra TV-er før de er koblet til en kunde.
-- Samme tabeller som i kundeskjemaet, så src/api/pairing.js kan brukes direkte.
CREATE TABLE IF NOT EXISTS pairings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL,
  device_id   TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  screen_id   INTEGER,
  auth_token  TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at  TEXT NOT NULL,
  paired_at   TEXT,
  last_seen   TEXT,
  client_info TEXT,
  label       TEXT
);
CREATE TABLE IF NOT EXISTS pairing_commands (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id    TEXT NOT NULL,
  command      TEXT NOT NULL,
  payload      TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  delivered_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pairings_device       ON pairings (device_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pairings_code_pending ON pairings (code) WHERE status = 'pending';
`);

// Senere tillegg til eksisterende databaser (ALTER feiler hvis kolonnen finnes).
for (const sql of [
  `ALTER TABLE users ADD COLUMN prefs TEXT`,
  // Kvoter pr. kunde (NULL = standard fra miljøvariablene, se tenantLimits).
  `ALTER TABLE tenants ADD COLUMN max_storage_mb INTEGER`,
  `ALTER TABLE tenants ADD COLUMN max_devices INTEGER`,
  `ALTER TABLE tenants ADD COLUMN max_screens INTEGER`,
  `ALTER TABLE users ADD COLUMN terms_accepted_at TEXT`,
  // Video er med i Pro; kan slås på per konto i superadmin.
  `ALTER TABLE tenants ADD COLUMN allow_video INTEGER`,
  // Henvisningsprogrammet: egen kode per organisasjon, og hvem som henviste.
  `ALTER TABLE tenants ADD COLUMN ref_code TEXT`,
  `ALTER TABLE tenants ADD COLUMN referred_by INTEGER`,
  `CREATE TABLE IF NOT EXISTS admin_sessions (
     id_hash TEXT PRIMARY KEY,
     email TEXT NOT NULL,
     expires_at TEXT NOT NULL
   )`
]) {
  try {
    platformDb.db.exec(sql);
  } catch {
    /* finnes allerede */
  }
}

/* ------------------------------- kvoter -------------------------------- */

const envInt = (name, fallback) => Number.parseInt(process.env[name], 10) || fallback;

/** Kvotene for en kunde: egne verdier på kunden, ellers standard (beta). */
// Gratisplanen (det som står på flatr.no): 1 skjerm, 2 GB, ingen video.
// Kan overstyres per konto i superadmin (NULL = standard). En skjerm er en TV
// (eller nettleser), så TV-grensen følger alltid skjermgrensen.
export function tenantLimits(tenant) {
  // + én skjerm per aktiv henvisning (maks REFERRAL_MAX), se referralStats.
  const screens = (tenant.max_screens ?? envInt('BETA_MAX_SCREENS', 1)) + referralStats(tenant.id).bonus;
  return {
    storageBytes: (tenant.max_storage_mb ?? envInt('BETA_STORAGE_MB', 2048)) * 1024 * 1024,
    devices: screens,
    screens,
    video: tenant.allow_video === 1 || process.env.FREE_ALLOW_VIDEO === 'true'
  };
}

/* ---------------------------- henvisninger ----------------------------- */

// En henvisning er «aktiv» når den nye organisasjonen har koblet til en TV.
export const REFERRAL_MAX = 5;

/** Henvisningskoden til en organisasjon (lages første gang). */
export function referralCode(tenantId) {
  const row = platformDb.prepare('SELECT ref_code FROM tenants WHERE id = ?').bind(tenantId).firstSync();
  if (row?.ref_code) return row.ref_code;
  const code = randomBytes(6).toString('base64url').replace(/[-_]/g, 'x').slice(0, 8).toLowerCase();
  platformDb.prepare('UPDATE tenants SET ref_code = ? WHERE id = ?').bind(code, tenantId).runSync();
  return code;
}

// Tallene brukes i kvotene ved hver forespørsel: mellomlagres et minutt.
const referralCache = new Map();

/** { referred, active, bonus } for en organisasjon. */
export function referralStats(tenantId) {
  const hit = referralCache.get(tenantId);
  if (hit && Date.now() - hit.at < 60_000) return hit.stats;
  const stats = computeReferralStats(tenantId);
  referralCache.set(tenantId, { at: Date.now(), stats });
  return stats;
}

function computeReferralStats(tenantId) {
  const referred = platformDb.prepare('SELECT COUNT(*) AS c FROM tenants WHERE referred_by = ?').bind(tenantId).firstSync('c') || 0;
  if (!referred) return { referred: 0, active: 0, bonus: 0 };
  const active =
    platformDb
      .prepare(
        `SELECT COUNT(DISTINCT t.id) AS c FROM tenants t JOIN device_routes r ON r.tenant_id = t.id
          WHERE t.referred_by = ? AND r.auth_token IS NOT NULL`
      )
      .bind(tenantId)
      .firstSync('c') || 0;
  return { referred, active, bonus: Math.min(REFERRAL_MAX, active) };
}

/** Kobler en ny organisasjon til den som henviste (ugyldig/egen kode ignoreres). */
export function applyReferral(tenantId, code, ownerEmail) {
  const c = String(code || '').trim().toLowerCase();
  if (!/^[a-z0-9]{6,12}$/.test(c)) return;
  const from = platformDb.prepare('SELECT id FROM tenants WHERE ref_code = ?').bind(c).firstSync();
  if (!from || from.id === tenantId) return;
  // Ikke til seg selv: eieren av den nye organisasjonen er allerede med i den som henviste.
  if (ownerEmail && platformDb.prepare('SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = ? AND u.email = ?').bind(from.id, normEmail(ownerEmail)).firstSync()) return;
  platformDb.prepare('UPDATE tenants SET referred_by = ? WHERE id = ? AND referred_by IS NULL').bind(from.id, tenantId).runSync();
}

/* ------------------------------ hjelpere ------------------------------ */

export const nowIso = () => new Date().toISOString();
export const inMs = (ms) => new Date(Date.now() + ms).toISOString();
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex');
export const normEmail = (e) => String(e || '').trim().toLowerCase();
export const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 200;

/* ------------------------------ subdomener ----------------------------- */

const RESERVED = new Set(
  `www api app admin mail smtp imap pop ftp static cdn assets media files status help support
   docs blog dev test staging beta demo login signup auth account accounts billing dashboard
   panel portal display screen tv flatr root system ns ns1 ns2 mx email webmail`.split(/\s+/)
);

/** Returnerer null hvis gyldig og ledig, ellers en norsk feilmelding. */
export function slugProblem(slug) {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(slug)) {
    return 'Bruk 1–32 tegn: små bokstaver a–z, tall og bindestrek (ikke først eller sist).';
  }
  if (slug.length < 2) return 'Subdomenet må ha minst 2 tegn.';
  if (RESERVED.has(slug)) return 'Dette subdomenet er reservert.';
  if (platformDb.prepare('SELECT 1 FROM tenants WHERE slug = ?').bind(slug).firstSync()) {
    return 'Subdomenet er allerede tatt.';
  }
  return null;
}

/* -------------------------------- kunder ------------------------------- */

const tenantDir = (slug) => path.join(DATA_DIR, 'tenants', slug);
const envCache = new Map(); // slug -> { DB, MEDIA }

export function getTenantBySlug(slug) {
  return platformDb.prepare('SELECT * FROM tenants WHERE slug = ?').bind(slug).firstSync();
}

export function getTenantById(id) {
  return platformDb.prepare('SELECT * FROM tenants WHERE id = ?').bind(id).firstSync();
}

/** Databasen og mediemappa for en kunde (åpnes én gang og caches). */
export function tenantResources(slug) {
  let r = envCache.get(slug);
  if (!r) {
    const dir = tenantDir(slug);
    const dbFile = path.join(dir, 'db.sqlite');
    if (!existsSync(dbFile)) throw new Error(`mangler database for ${slug}`);
    const DB = new D1Database(dbFile);
    migrateTenant(DB.db);
    r = { DB, MEDIA: new DiskBucket(path.join(dir, 'media')) };
    envCache.set(slug, r);
  }
  return r;
}

/** Oppretter kunde + database (med eksempelinnhold) + eier i én operasjon. */
export function createTenant({ slug, name, ownerEmail, ownerName }) {
  const problem = slugProblem(slug);
  if (problem) throw Object.assign(new Error(problem), { status: 409 });

  const dir = tenantDir(slug);
  mkdirSync(path.join(dir, 'media'), { recursive: true });
  const db = new D1Database(path.join(dir, 'db.sqlite'));
  db.db.exec(TENANT_SCHEMA);
  migrateTenant(db.db);
  // Nye kunder starter enkelt: én «Velkommen»-presentasjon og ingen apper.
  // Eksempelprogrammet i schema.sql hører til appen Arrangement og program.
  // Skjermer er fysiske TV-er som kunden legger til selv (veiviseren på Hjem).
  db.db.exec(`
    DELETE FROM timeslots;
    DELETE FROM screens;
    DELETE FROM schedule;
    DELETE FROM sponsors;
    DELETE FROM apps;
    DELETE FROM deck_elements;
    DELETE FROM deck_slides WHERE playlist_id != 1;
    DELETE FROM playlists WHERE id != 1;
    UPDATE playlists SET name = 'Velkommen' WHERE id = 1;
    UPDATE deck_slides SET name = 'Velkommen', duration_seconds = 15,
      background = '{"type":"dynamic","preset":"aurora","base":"#0a1a2f","colors":["#34d399","#22d3ee","#3b82f6"]}'
      WHERE playlist_id = 1;
    INSERT INTO deck_elements (slide_id, z, kind, x, y, w, h, config)
      SELECT id, 0, 'text', 7, 30, 62, 22, '{"text":"Velkommen","size":170,"weight":800,"color":"#ffffff","valign":"bottom"}' FROM deck_slides WHERE playlist_id = 1;
    INSERT INTO deck_elements (slide_id, z, kind, x, y, w, h, config)
      SELECT id, 1, 'text', 7, 54, 60, 14, '{"text":"Dobbeltklikk på teksten for å endre den,\\nog legg til bilder og widgeter.","size":48,"weight":500,"color":"#d7f5ec","lineHeight":1.25}' FROM deck_slides WHERE playlist_id = 1;
    INSERT INTO deck_elements (slide_id, z, kind, x, y, w, h, config)
      SELECT id, 2, 'clock', 70, 7, 24, 16, '{"showDate":true,"showSeconds":false}' FROM deck_slides WHERE playlist_id = 1;
  `);
  db.close();

  const d = platformDb.db;
  d.exec('BEGIN');
  try {
    const tenant = platformDb
      .prepare('INSERT INTO tenants (slug, name) VALUES (?, ?) RETURNING *')
      .bind(slug, name)
      .runSync().results[0];
    const user = upsertUser(ownerEmail, ownerName);
    platformDb
      .prepare(`INSERT INTO memberships (tenant_id, user_id, role) VALUES (?, ?, 'owner')`)
      .bind(tenant.id, user.id)
      .runSync();
    d.exec('COMMIT');
    return { tenant, user };
  } catch (err) {
    d.exec('ROLLBACK');
    throw err;
  }
}

/* --------------------------- brukere/medlemmer -------------------------- */

export function upsertUser(email, name) {
  const e = normEmail(email);
  const existing = platformDb.prepare('SELECT * FROM users WHERE email = ?').bind(e).firstSync();
  if (existing) {
    if (name && !existing.name) {
      platformDb.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, existing.id).runSync();
      existing.name = name;
    }
    return existing;
  }
  return platformDb
    .prepare('INSERT INTO users (email, name) VALUES (?, ?) RETURNING *')
    .bind(e, name || null)
    .runSync().results[0];
}

export function getMembership(tenantId, email) {
  return platformDb
    .prepare(
      `SELECT u.id AS user_id, u.email, u.name, m.role
         FROM memberships m JOIN users u ON u.id = m.user_id
        WHERE m.tenant_id = ? AND u.email = ?`
    )
    .bind(tenantId, normEmail(email))
    .firstSync();
}

export function tenantsForEmail(email) {
  return platformDb
    .prepare(
      `SELECT t.* FROM tenants t
         JOIN memberships m ON m.tenant_id = t.id
         JOIN users u ON u.id = m.user_id
        WHERE u.email = ? ORDER BY t.name`
    )
    .bind(normEmail(email))
    .allSync().results;
}

/* ------------------------------ engangslenker --------------------------- */

const TOKEN_TTL_MS = 30 * 60_000; // 30 min

export function createLoginToken({ purpose, email, tenantId = null, payload = null, ttlMs = TOKEN_TTL_MS }) {
  const token = randomToken();
  platformDb
    .prepare(
      `INSERT INTO login_tokens (token_hash, purpose, email, tenant_id, payload, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(hashToken(token), purpose, normEmail(email), tenantId, payload ? JSON.stringify(payload) : null, inMs(ttlMs))
    .runSync();
  return token;
}

/** Leser et token uten å bruke det opp (f.eks. for å vise invitasjonen). */
export function peekLoginToken(token, purpose) {
  const row = platformDb
    .prepare('SELECT * FROM login_tokens WHERE token_hash = ? AND purpose = ?')
    .bind(hashToken(token), purpose)
    .firstSync();
  if (!row || row.used_at || row.expires_at < nowIso()) return null;
  return { ...row, payload: row.payload ? JSON.parse(row.payload) : null };
}

/** Medlemmet (med profil) for en e-post i en kunde – som sessionUser, men uten økt. */
export function memberByEmail(tenantId, email) {
  return platformDb
    .prepare(
      `SELECT u.id AS user_id, u.email, u.name, u.prefs, m.role
         FROM memberships m JOIN users u ON u.id = m.user_id
        WHERE m.tenant_id = ? AND u.email = ?`
    )
    .bind(tenantId, normEmail(email))
    .firstSync();
}

/** Bruker opp et token (én gang). Returnerer raden eller null. */
export function consumeLoginToken(token, purpose) {
  const hash = hashToken(token);
  const row = platformDb
    .prepare('SELECT * FROM login_tokens WHERE token_hash = ? AND purpose = ?')
    .bind(hash, purpose)
    .firstSync();
  if (!row || row.used_at || row.expires_at < nowIso()) return null;
  const upd = platformDb
    .prepare('UPDATE login_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL')
    .bind(nowIso(), hash)
    .runSync();
  if (!upd.meta.changes) return null;
  return { ...row, payload: row.payload ? JSON.parse(row.payload) : null };
}

/* -------------------------------- sesjoner ------------------------------ */

export const SESSION_TTL_MS = 30 * 24 * 3600_000; // 30 dager

export function createSession(userId, tenantId) {
  const id = randomToken();
  platformDb
    .prepare('INSERT INTO sessions (id_hash, user_id, tenant_id, expires_at) VALUES (?, ?, ?, ?)')
    .bind(hashToken(id), userId, tenantId, inMs(SESSION_TTL_MS))
    .runSync();
  return id;
}

/** Slår opp en sesjon for en gitt kunde. Medlemskapet sjekkes på nytt hver gang. */
export function sessionUser(sessionId, tenantId) {
  if (!sessionId) return null;
  return platformDb
    .prepare(
      `SELECT u.id AS user_id, u.email, u.name, u.prefs, m.role
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         JOIN memberships m ON m.user_id = s.user_id AND m.tenant_id = s.tenant_id
        WHERE s.id_hash = ? AND s.tenant_id = ? AND s.expires_at > ?`
    )
    .bind(hashToken(sessionId), tenantId, nowIso())
    .firstSync();
}

export function deleteSession(sessionId) {
  if (!sessionId) return;
  platformDb.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(hashToken(sessionId)).runSync();
}

/** Brukerens innstillinger (tema o.l.) – flettes inn i det som er lagret. */
export function updatePrefs(userId, patch) {
  const row = platformDb.prepare('SELECT prefs FROM users WHERE id = ?').bind(userId).firstSync();
  let prefs = {};
  try {
    prefs = JSON.parse(row?.prefs || '{}') || {};
  } catch {
    prefs = {};
  }
  Object.assign(prefs, patch);
  platformDb.prepare('UPDATE users SET prefs = ? WHERE id = ?').bind(JSON.stringify(prefs), userId).runSync();
  return prefs;
}

/** Rydder utløpte sesjoner/lenker. Kalles periodisk. */
export function sweepPlatform() {
  const now = nowIso();
  platformDb.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now).runSync();
  platformDb.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').bind(now).runSync();
  platformDb
    .prepare('DELETE FROM login_tokens WHERE expires_at < ?')
    .bind(new Date(Date.now() - 24 * 3600_000).toISOString())
    .runSync();
}
