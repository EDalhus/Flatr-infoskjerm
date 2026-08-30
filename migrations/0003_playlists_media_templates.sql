-- Migrering 0003: gjenbrukbare spillelister, mediebibliotek (R2), maler,
-- og fri «layout»-slide (ingen skjemaendring – bare en ny type + config).
-- Trygg å kjøre etter 0002.
--
--   npx wrangler d1 execute event-infoscreen-db --remote --file=./migrations/0003_playlists_media_templates.sql
--
-- Kjørt før? ALTER-linja feiler med «duplicate column name» – ufarlig.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS playlists (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  folder     TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS playlist_items (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id      INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  position         INTEGER NOT NULL DEFAULT 0,
  type             TEXT NOT NULL DEFAULT 'program',
  title            TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 15,
  enabled          INTEGER NOT NULL DEFAULT 1,
  config           TEXT NOT NULL DEFAULT '{}',
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS media (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  folder       TEXT,
  r2_key       TEXT NOT NULL,
  content_type TEXT,
  size         INTEGER,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS templates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'slide',   -- slide | screen
  payload    TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- En sone-rad kan nå referere en delt spilleliste (type='playlist', playlist_id satt)
-- i stedet for å være en inline-slide.
ALTER TABLE screen_slides ADD COLUMN playlist_id INTEGER REFERENCES playlists(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_playlist_items ON playlist_items (playlist_id, position);
CREATE INDEX IF NOT EXISTS idx_media_folder   ON media (folder);
