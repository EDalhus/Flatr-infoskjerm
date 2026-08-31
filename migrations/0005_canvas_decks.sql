-- Migrering 0005: Keynote-aktig modell. Hver skjerm er en rekke «lysbilder»
-- (deck_slides), hvert lysbilde er én fri canvas med posisjonerte widgets
-- (deck_elements). Sone/layout-systemet brukes ikke lenger (kolonnene blir
-- liggende, men ignoreres). screen_slides/playlists beholdes som historikk.
-- Trygg å kjøre etter 0004.
PRAGMA foreign_keys = ON;

ALTER TABLE screens ADD COLUMN orientation TEXT NOT NULL DEFAULT 'landscape'; -- landscape | portrait

CREATE TABLE IF NOT EXISTS deck_slides (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  screen_id        INTEGER NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
  position         INTEGER NOT NULL DEFAULT 0,
  name             TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 15,
  transition       TEXT NOT NULL DEFAULT 'fade',     -- none | fade | dissolve | push-left | push-up
  transition_ms    INTEGER NOT NULL DEFAULT 600,
  background        TEXT NOT NULL DEFAULT '{"type":"color","color":"#0f2733"}',
  enabled          INTEGER NOT NULL DEFAULT 1,
  active_from       TEXT,
  active_to         TEXT,
  active_days       TEXT,
  active_from_date  TEXT,
  active_to_date    TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS deck_elements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slide_id   INTEGER NOT NULL REFERENCES deck_slides(id) ON DELETE CASCADE,
  z          INTEGER NOT NULL DEFAULT 0,
  kind       TEXT NOT NULL,   -- text|image|shape|clock|countdown|program|qr|video|web|sponsors
  x          REAL NOT NULL DEFAULT 15,
  y          REAL NOT NULL DEFAULT 15,
  w          REAL NOT NULL DEFAULT 40,
  h          REAL NOT NULL DEFAULT 25,
  rotation   REAL NOT NULL DEFAULT 0,
  config     TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_deck_slides_screen  ON deck_slides (screen_id, position);
CREATE INDEX IF NOT EXISTS idx_deck_elements_slide ON deck_elements (slide_id, z);
