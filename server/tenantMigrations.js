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
