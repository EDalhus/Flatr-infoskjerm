-- ---------------------------------------------------------------------------
-- Cloudflare D1 – fullt skjema for infoskjerm-appen (frisk installasjon).
-- Kjør:  npm run db:local   /   npm run db:remote
--
-- Har du en database fra en tidligere versjon: kjør migreringene i
-- ./migrations/ i rekkefølge (se README → «Migrering»).
--
-- Modell: hver skjerm er en rekke lysbilder (deck_slides). Hvert lysbilde er
-- én fri canvas med posisjonerte widgets (deck_elements). Tabellene
-- screen_slides / playlists er historikk fra sone-modellen og brukes ikke.
-- ---------------------------------------------------------------------------
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#1f5566',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS screens (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  location         TEXT,
  orientation      TEXT NOT NULL DEFAULT 'landscape',  -- landscape | portrait
  layout           TEXT NOT NULL DEFAULT 'main-side',  -- historikk, ubrukt
  custom_layout    TEXT,                                -- historikk, ubrukt
  rotation_seconds INTEGER NOT NULL DEFAULT 15,
  last_seen        TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Lysbilder pr. skjerm.
CREATE TABLE IF NOT EXISTS deck_slides (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  screen_id        INTEGER NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
  position         INTEGER NOT NULL DEFAULT 0,
  name             TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 15,
  transition       TEXT NOT NULL DEFAULT 'fade',
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

-- Widgets på et lysbilde (posisjon i prosent av canvas).
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

CREATE TABLE IF NOT EXISTS schedule (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT,
  start_time  TEXT NOT NULL,
  end_time    TEXT,
  stage       TEXT,
  status      TEXT NOT NULL DEFAULT 'scheduled',
  auto_status INTEGER NOT NULL DEFAULT 1,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sponsors (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  image_url        TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 10
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

-- Maler: kind='slide' → payload er et helt lysbilde (bakgrunn + elements).
CREATE TABLE IF NOT EXISTS templates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'slide',
  payload    TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS trash (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL,
  label      TEXT NOT NULL,
  payload    TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS alerts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  message          TEXT NOT NULL,
  target_screen_id INTEGER REFERENCES screens(id) ON DELETE CASCADE,
  active           INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Historikk fra sone-modellen (brukes ikke av appen lenger).
CREATE TABLE IF NOT EXISTS playlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, folder TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS playlist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0, type TEXT NOT NULL DEFAULT 'program',
  title TEXT, duration_seconds INTEGER NOT NULL DEFAULT 15, enabled INTEGER NOT NULL DEFAULT 1,
  config TEXT NOT NULL DEFAULT '{}',
  active_from TEXT, active_to TEXT, active_days TEXT, active_from_date TEXT, active_to_date TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS screen_slides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  screen_id INTEGER NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
  zone TEXT NOT NULL DEFAULT 'a', position INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL DEFAULT 'program', title TEXT, duration_seconds INTEGER NOT NULL DEFAULT 15,
  enabled INTEGER NOT NULL DEFAULT 1, config TEXT NOT NULL DEFAULT '{}',
  playlist_id INTEGER REFERENCES playlists(id) ON DELETE SET NULL,
  active_from TEXT, active_to TEXT, active_days TEXT, active_from_date TEXT, active_to_date TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_schedule_start      ON schedule (start_time);
CREATE INDEX IF NOT EXISTS idx_schedule_category   ON schedule (category_id);
CREATE INDEX IF NOT EXISTS idx_alerts_active       ON alerts (active);
CREATE INDEX IF NOT EXISTS idx_alerts_target       ON alerts (target_screen_id);
CREATE INDEX IF NOT EXISTS idx_media_folder        ON media (folder);
CREATE INDEX IF NOT EXISTS idx_trash_deleted       ON trash (deleted_at);
CREATE INDEX IF NOT EXISTS idx_deck_slides_screen  ON deck_slides (screen_id, position);
CREATE INDEX IF NOT EXISTS idx_deck_elements_slide ON deck_elements (slide_id, z);

-- ---------------------------------------------------------------------------
-- Demo-data (valgfritt – fjern hele blokken for tom database)
-- ---------------------------------------------------------------------------
INSERT INTO categories (name, color) VALUES
  ('Scene', '#1f5566'), ('Verksted', '#9333ea'), ('Servering', '#c2410c'), ('Praktisk', '#15803d');

INSERT INTO screens (name, location, orientation) VALUES
  ('Hovedscene', 'Storsalen', 'landscape'),
  ('Inngangsparti', 'Foaje', 'landscape');

INSERT INTO sponsors (name, image_url, duration_seconds) VALUES
  ('Cloudflare',  'https://dummyimage.com/800x400/1d4ed8/ffffff&text=Cloudflare',  10),
  ('Acme AS',     'https://dummyimage.com/800x400/0f766e/ffffff&text=Acme+AS',     8),
  ('Nordlys Bank','https://dummyimage.com/800x400/9333ea/ffffff&text=Nordlys+Bank',12);

INSERT INTO schedule (title, description, start_time, end_time, stage, status, category_id) VALUES
  ('Åpning og velkommen', 'Konferansier ønsker velkommen.',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-15 minutes'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+15 minutes'), 'Hovedscene', 'scheduled', 1),
  ('Keynote: Fremtidens edge', 'Hovedforedrag om distribuert databehandling.',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+15 minutes'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+75 minutes'), 'Hovedscene', 'scheduled', 1),
  ('Loddesveising for nybegynnere', 'Åpen verkstedøkt.',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+30 minutes'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+90 minutes'), 'Verksted 2', 'scheduled', 2),
  ('Pause og mingling', 'Kaffe i foajeen.',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+75 minutes'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+105 minutes'), 'Foaje', 'scheduled', 3),
  ('Paneldebatt', 'Bransjen møtes til debatt.',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+105 minutes'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+165 minutes'), 'Hovedscene', 'scheduled', 1);

-- Skjerm 1: ett lysbilde med tittel + program + klokke
INSERT INTO deck_slides (screen_id, position, name, duration_seconds, background) VALUES
  (1, 0, 'Program', 20, '{"type":"gradient","from":"#1f5566","to":"#0f2733","angle":135}');
INSERT INTO deck_elements (slide_id, z, kind, x, y, w, h, config) VALUES
  (1, 0, 'text', 6, 6, 60, 12, '{"text":"Hovedscene","size":72,"weight":800,"align":"left","color":"#ffffff"}'),
  (1, 1, 'program', 6, 22, 58, 70, '{"mode":"agenda","categoryIds":[1],"max":7,"showCategory":true}'),
  (1, 2, 'clock', 70, 6, 24, 16, '{"showDate":true,"showSeconds":true}'),
  (1, 3, 'sponsors', 70, 26, 24, 40, '{}');

-- Skjerm 2: ett lysbilde med hele programmet
INSERT INTO deck_slides (screen_id, position, name, duration_seconds, background) VALUES
  (2, 0, 'Dagens program', 20, '{"type":"color","color":"#0f2733"}');
INSERT INTO deck_elements (slide_id, z, kind, x, y, w, h, config) VALUES
  (2, 0, 'text', 6, 5, 70, 12, '{"text":"Dagens program","size":72,"weight":800,"align":"left","color":"#ffffff"}'),
  (2, 1, 'program', 6, 20, 66, 74, '{"mode":"agenda","categoryIds":[],"max":10,"showCategory":true}'),
  (2, 2, 'clock', 76, 5, 20, 14, '{"showDate":true,"showSeconds":false}'),
  (2, 3, 'qr', 76, 24, 20, 34, '{"mode":"schedule","label":"Program","caption":"Skann for mobil"}');
