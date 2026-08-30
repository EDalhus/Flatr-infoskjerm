-- ---------------------------------------------------------------------------
-- Cloudflare D1 – skjema for infoskjerm-appen.
-- Kjør:  npm run db:local     (lokal .wrangler SQLite)
--        npm run db:remote    (produksjons-D1)
-- ---------------------------------------------------------------------------
PRAGMA foreign_keys = ON;

-- Skjermer (fysiske infoskjermer / plasseringer)
CREATE TABLE IF NOT EXISTS screens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  location   TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Program / tidsskjema
CREATE TABLE IF NOT EXISTS schedule (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT,
  start_time  TEXT NOT NULL,            -- ISO 8601, f.eks. 2026-08-30T18:00:00.000Z
  end_time    TEXT,                     -- ISO 8601 (valgfri)
  stage       TEXT,                     -- scene/rom, matcher gjerne screens.name
  status      TEXT NOT NULL DEFAULT 'scheduled'  -- scheduled | live | done | cancelled
);

-- Sponsorer / media til karusell
CREATE TABLE IF NOT EXISTS sponsors (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  image_url        TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 10
);

-- Hastemeldinger / live alerts
CREATE TABLE IF NOT EXISTS alerts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  message          TEXT NOT NULL,
  target_screen_id INTEGER REFERENCES screens(id) ON DELETE CASCADE, -- NULL = alle skjermer
  active           INTEGER NOT NULL DEFAULT 1,                       -- 1 = vises, 0 = arkivert
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_schedule_start  ON schedule (start_time);
CREATE INDEX IF NOT EXISTS idx_alerts_active   ON alerts (active);
CREATE INDEX IF NOT EXISTS idx_alerts_target   ON alerts (target_screen_id);

-- ---------------------------------------------------------------------------
-- Demo-data (valgfritt – fjern hele blokken for tom database)
-- ---------------------------------------------------------------------------
INSERT INTO screens (name, location) VALUES
  ('Hovedscene', 'Storsalen'),
  ('Inngangsparti', 'Foaje');

INSERT INTO sponsors (name, image_url, duration_seconds) VALUES
  ('Cloudflare',  'https://dummyimage.com/800x400/1d4ed8/ffffff&text=Cloudflare',  10),
  ('Acme AS',     'https://dummyimage.com/800x400/0f766e/ffffff&text=Acme+AS',     8),
  ('Nordlys Bank','https://dummyimage.com/800x400/9333ea/ffffff&text=Nordlys+Bank',12);

INSERT INTO schedule (title, description, start_time, end_time, stage, status) VALUES
  ('Åpning og velkommen', 'Konferansier ønsker velkommen.',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-15 minutes'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+15 minutes'), 'Hovedscene', 'live'),
  ('Keynote: Fremtidens edge', 'Hovedforedrag om distribuert databehandling.',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+15 minutes'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+75 minutes'), 'Hovedscene', 'scheduled'),
  ('Pause og mingling', 'Kaffe i foajeen.',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+75 minutes'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+105 minutes'), 'Foaje', 'scheduled'),
  ('Paneldebatt', 'Bransjen møtes til debatt.',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+105 minutes'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+165 minutes'), 'Hovedscene', 'scheduled');
