// Skjemaendringer for kundedatabasene. Kjøres hver gang en kundedatabase
// åpnes (og rett etter schema.sql for nye kunder). PRAGMA user_version holder
// styr på hvor langt databasen er kommet, så hver migrering kjøres én gang.
//
// schema.sql er grunnlaget (versjon 0); alt etter det ligger her.

const MIGRATIONS = [
  // 1: Spillelister. Lysbildene flyttes fra kanalen (deck_slides.screen_id) til
  //    en gjenbrukbar spilleliste (deck_slides.playlist_id), og kanalen peker
  //    på spillelisten den viser. Hver eksisterende kanal får sin egen
  //    spilleliste med samme id og navn, så ingenting endrer seg for TV-ene.
  `
  DROP TABLE IF EXISTS screen_slides;
  DROP TABLE IF EXISTS playlist_items;
  DROP TABLE IF EXISTS playlists;

  CREATE TABLE playlists (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    orientation TEXT NOT NULL DEFAULT 'landscape',   -- landscape | portrait (design-lerret)
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  INSERT INTO playlists (id, name, orientation) SELECT id, name, orientation FROM screens;

  ALTER TABLE screens ADD COLUMN playlist_id INTEGER REFERENCES playlists(id) ON DELETE SET NULL;
  UPDATE screens SET playlist_id = id;

  CREATE TABLE deck_slides_new (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id       INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    position          INTEGER NOT NULL DEFAULT 0,
    name              TEXT,
    duration_seconds  INTEGER NOT NULL DEFAULT 15,
    transition        TEXT NOT NULL DEFAULT 'fade',
    transition_ms     INTEGER NOT NULL DEFAULT 600,
    background        TEXT NOT NULL DEFAULT '{"type":"color","color":"#0f2733"}',
    enabled           INTEGER NOT NULL DEFAULT 1,
    active_from       TEXT,
    active_to         TEXT,
    active_days       TEXT,
    active_from_date  TEXT,
    active_to_date    TEXT,
    created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  INSERT INTO deck_slides_new
    (id, playlist_id, position, name, duration_seconds, transition, transition_ms, background, enabled,
     active_from, active_to, active_days, active_from_date, active_to_date, created_at)
  SELECT id, screen_id, position, name, duration_seconds, transition, transition_ms, background, enabled,
         active_from, active_to, active_days, active_from_date, active_to_date, created_at
    FROM deck_slides;
  DROP TABLE deck_slides;
  ALTER TABLE deck_slides_new RENAME TO deck_slides;
  CREATE INDEX IF NOT EXISTS idx_deck_slides_playlist ON deck_slides (playlist_id, position);
  CREATE INDEX IF NOT EXISTS idx_screens_playlist ON screens (playlist_id);
  `,

  // 2: Skjermbilder av nettsider. Apple TV har ingen nettleser, så TV-appen
  //    får et jevnlig oppdatert skjermbilde i stedet for selve nettsiden.
  `
  CREATE TABLE IF NOT EXISTS web_snapshots (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    url          TEXT NOT NULL UNIQUE,
    r2_key       TEXT,
    content_type TEXT,
    width        INTEGER,
    height       INTEGER,
    taken_at     TEXT,
    error        TEXT,
    tried_at     TEXT
  );
  `,

  // 3: Tidsplan pr. kanal (se src/lib/timeslots.js) + kontoinnstillinger (tidssone).
  `
  CREATE TABLE IF NOT EXISTS timeslots (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    screen_id   INTEGER NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
    playlist_id INTEGER REFERENCES playlists(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL DEFAULT 'playlist',      -- playlist | off
    title       TEXT,
    days        TEXT,                                  -- "1,2,3" (ISO), tom = alle
    start_time  TEXT,                                  -- "HH:MM", tom = hele dagen
    end_time    TEXT,
    start_date  TEXT,                                  -- "YYYY-MM-DD", tom = ingen grense
    end_date    TEXT,
    priority    INTEGER NOT NULL DEFAULT 0,            -- 0 vanlig, 10 høy (overstyring)
    enabled     INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX IF NOT EXISTS idx_timeslots_screen ON timeslots (screen_id);

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
  `,

  // 4: Skjermstyring – tagger, skjermbilder fra spillerne, offline-varsling
  //    og visningslogg (minutter pr. time, enhet og spilleliste).
  `
  ALTER TABLE pairings ADD COLUMN tags TEXT;
  ALTER TABLE pairings ADD COLUMN screenshot_at TEXT;
  ALTER TABLE pairings ADD COLUMN offline_notified_at TEXT;

  CREATE TABLE IF NOT EXISTS play_log (
    hour        TEXT NOT NULL,                -- lokal tid "YYYY-MM-DDTHH"
    device_id   TEXT NOT NULL,
    screen_id   INTEGER,
    playlist_id INTEGER,                      -- NULL = ingenting / skjerm av
    off         INTEGER NOT NULL DEFAULT 0,
    minutes     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (hour, device_id, playlist_id, off)
  );
  CREATE INDEX IF NOT EXISTS idx_play_log_hour ON play_log (hour);
  `,

  // 5: Sponsorer blir bildekaruseller basert på mapper i mediebiblioteket.
  //    Bilder sponsorene bruker fra biblioteket flyttes til mappen «Sponsorer»,
  //    og sponsor-elementer blir karuseller som viser den mappen.
  `
  UPDATE media SET folder = 'Sponsorer'
   WHERE folder IS NULL
     AND id IN (SELECT CAST(substr(image_url, instr(image_url, 'id=') + 3,
                                   instr(substr(image_url, instr(image_url, 'id=') + 3) || '&', '&') - 1) AS INTEGER)
                  FROM sponsors WHERE image_url LIKE '/api/media?id=%');
  UPDATE deck_elements
     SET kind = 'carousel',
         config = '{"folder":"Sponsorer","seconds":8,"fit":"contain","transition":"fade","shuffle":false}'
   WHERE kind = 'sponsors';
  `
];

export const TENANT_SCHEMA_VERSION = MIGRATIONS.length;

/** Kjører migreringene databasen mangler. `db` er en node:sqlite DatabaseSync. */
export function migrateTenant(db) {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  if (current >= MIGRATIONS.length) return;

  // Tabell-ombygging krever at fremmednøkler er av (ellers kaskadesletter
  // DROP TABLE deck_slides alle elementene). Kan ikke endres inne i en transaksjon.
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    for (let v = current; v < MIGRATIONS.length; v++) {
      db.exec('BEGIN');
      try {
        db.exec(MIGRATIONS[v]);
        db.exec(`PRAGMA user_version = ${v + 1}`);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw new Error(`Migrering ${v + 1} feilet: ${err.message}`);
      }
    }
    const broken = db.prepare('PRAGMA foreign_key_check').all();
    if (broken.length) console.warn('[migrate] brutte fremmednøkler etter migrering:', broken.slice(0, 5));
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}
