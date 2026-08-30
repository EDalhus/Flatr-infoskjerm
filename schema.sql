-- ---------------------------------------------------------------------------
-- Cloudflare D1 – fullt skjema for infoskjerm-appen (frisk installasjon).
-- Kjør:  npm run db:local   /   npm run db:remote
--
-- Har du en database fra en tidligere versjon: kjør migreringene i
-- ./migrations/ i rekkefølge (se README → «Migrering»).
-- ---------------------------------------------------------------------------
PRAGMA foreign_keys = ON;

-- Kategorier – fargelegger og grupperer programposter på offentlige skjermer.
CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#1f5566',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Skjermer / plasseringer + layout- og rotasjonskonfig.
CREATE TABLE IF NOT EXISTS screens (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  location         TEXT,
  layout           TEXT NOT NULL DEFAULT 'main-side',  -- solo | main-side | split | thirds | custom
  custom_layout    TEXT,
  rotation_seconds INTEGER NOT NULL DEFAULT 15,
  last_seen        TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Program / tidsskjema.
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

-- Sponsorer / media til karusell.
CREATE TABLE IF NOT EXISTS sponsors (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  image_url        TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 10
);

-- Gjenbrukbare spillelister.
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
  active_from      TEXT,
  active_to        TEXT,
  active_days      TEXT,
  active_from_date TEXT,
  active_to_date   TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Slides pr. skjerm/sone. En rad er enten en inline-slide (type + config)
-- eller en referanse til en delt spilleliste (type='playlist', playlist_id satt).
CREATE TABLE IF NOT EXISTS screen_slides (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  screen_id        INTEGER NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
  zone             TEXT NOT NULL DEFAULT 'a',
  position         INTEGER NOT NULL DEFAULT 0,
  type             TEXT NOT NULL DEFAULT 'program',  -- program|sponsors|message|clock|image|layout|web|video|qr|countdown|playlist
  title            TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 15,
  enabled          INTEGER NOT NULL DEFAULT 1,
  config           TEXT NOT NULL DEFAULT '{}',
  playlist_id      INTEGER REFERENCES playlists(id) ON DELETE SET NULL,
  active_from      TEXT,
  active_to        TEXT,
  active_days      TEXT,
  active_from_date TEXT,
  active_to_date   TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Mediebibliotek. Bytes ligger i R2 (binding MEDIA); metadata her.
CREATE TABLE IF NOT EXISTS media (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  folder       TEXT,
  r2_key       TEXT NOT NULL,
  content_type TEXT,
  size         INTEGER,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Maler for slides og hele skjermoppsett.
CREATE TABLE IF NOT EXISTS templates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'slide',
  payload    TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Papirkurv – slettede rader kan gjenopprettes en periode.
CREATE TABLE IF NOT EXISTS trash (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL,
  label      TEXT NOT NULL,
  payload    TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Hastemeldinger / live alerts.
CREATE TABLE IF NOT EXISTS alerts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  message          TEXT NOT NULL,
  target_screen_id INTEGER REFERENCES screens(id) ON DELETE CASCADE,
  active           INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_schedule_start    ON schedule (start_time);
CREATE INDEX IF NOT EXISTS idx_schedule_category ON schedule (category_id);
CREATE INDEX IF NOT EXISTS idx_alerts_active     ON alerts (active);
CREATE INDEX IF NOT EXISTS idx_alerts_target     ON alerts (target_screen_id);
CREATE INDEX IF NOT EXISTS idx_slides_screen     ON screen_slides (screen_id, zone, position);
CREATE INDEX IF NOT EXISTS idx_playlist_items    ON playlist_items (playlist_id, position);
CREATE INDEX IF NOT EXISTS idx_media_folder      ON media (folder);
CREATE INDEX IF NOT EXISTS idx_trash_deleted     ON trash (deleted_at);

-- ---------------------------------------------------------------------------
-- Demo-data (valgfritt – fjern hele blokken for tom database)
-- ---------------------------------------------------------------------------
INSERT INTO categories (name, color) VALUES
  ('Scene',    '#1f5566'),
  ('Verksted', '#9333ea'),
  ('Servering', '#c2410c'),
  ('Praktisk', '#15803d');

INSERT INTO screens (name, location, layout) VALUES
  ('Hovedscene', 'Storsalen', 'thirds'),
  ('Inngangsparti', 'Foaje', 'main-side');

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

-- Delt spilleliste som brukes på sidepanelet
INSERT INTO playlists (name, folder) VALUES ('Fellesinfo', NULL);
INSERT INTO playlist_items (playlist_id, position, type, title, duration_seconds, config) VALUES
  (1, 0, 'message', 'Wi-Fi', 12, '{"text":"Wi-Fi: LAN  ·  Passord: velkommen","emphasis":"info"}'),
  (1, 1, 'message', 'Kiosk', 12, '{"text":"Kiosken er åpen til 22:00","emphasis":"success"}');

-- Skjerm 1 (Hovedscene, tredeler)
INSERT INTO screen_slides (screen_id, zone, position, type, title, duration_seconds, config, playlist_id) VALUES
  (1, 'a', 0, 'program', 'Program – scene', 25, '{"mode":"agenda","categoryIds":[1],"max":8,"showCategory":true}', NULL),
  (1, 'b', 0, 'clock', 'Klokke', 12, '{"showDate":true,"showSeconds":true}', NULL),
  (1, 'c', 0, 'sponsors', 'Sponsorer', 18, '{}', NULL),
  (1, 'c', 1, 'playlist', 'Fellesinfo', 12, '{}', 1);

-- Skjerm 2 (Inngangsparti, hoved + side)
INSERT INTO screen_slides (screen_id, zone, position, type, title, duration_seconds, config, playlist_id) VALUES
  (2, 'a', 0, 'program', 'Dagens program', 20, '{"mode":"agenda","categoryIds":[],"max":12,"showCategory":true}', NULL),
  (2, 'b', 0, 'clock', 'Klokke', 10, '{"showDate":true,"showSeconds":false}', NULL),
  (2, 'b', 1, 'playlist', 'Fellesinfo', 12, '{}', 1);
