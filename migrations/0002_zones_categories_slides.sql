-- Migrering 0002: kategorier, per-skjerm layout/soner/slides, skjermstatus,
-- auto-status på program. Trygg å kjøre på en database som allerede har
-- migrering 0001 (basisskjemaet).
--
--   npx wrangler d1 execute event-infoscreen-db --remote --file=./migrations/0002_zones_categories_slides.sql
--
-- Merk: SQLite har ikke «ADD COLUMN IF NOT EXISTS». Har du allerede kjørt denne
-- migreringen, vil ALTER-linjene feile med «duplicate column name» – da er du
-- allerede oppdatert og kan ignorere feilen.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#1f5566',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS screen_slides (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  screen_id        INTEGER NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
  zone             TEXT NOT NULL DEFAULT 'a',
  position         INTEGER NOT NULL DEFAULT 0,
  type             TEXT NOT NULL DEFAULT 'program',
  title            TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 15,
  enabled          INTEGER NOT NULL DEFAULT 1,
  config           TEXT NOT NULL DEFAULT '{}',
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

ALTER TABLE screens ADD COLUMN layout TEXT NOT NULL DEFAULT 'main-side';
ALTER TABLE screens ADD COLUMN custom_layout TEXT;
ALTER TABLE screens ADD COLUMN rotation_seconds INTEGER NOT NULL DEFAULT 15;
ALTER TABLE screens ADD COLUMN last_seen TEXT;

ALTER TABLE schedule ADD COLUMN auto_status INTEGER NOT NULL DEFAULT 1;
ALTER TABLE schedule ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_schedule_category ON schedule (category_id);
CREATE INDEX IF NOT EXISTS idx_slides_screen     ON screen_slides (screen_id, zone, position);

-- Gi eksisterende skjermer et fornuftig standard-oppsett så de ikke blir tomme.
INSERT INTO screen_slides (screen_id, zone, position, type, title, duration_seconds, config)
SELECT s.id, 'a', 0, 'program', 'Program', 20, '{"mode":"agenda","categoryIds":[],"max":10,"showCategory":true}'
FROM screens s
WHERE NOT EXISTS (SELECT 1 FROM screen_slides x WHERE x.screen_id = s.id);

INSERT INTO screen_slides (screen_id, zone, position, type, title, duration_seconds, config)
SELECT s.id, 'b', 0, 'clock', 'Klokke', 10, '{"showDate":true,"showSeconds":false}'
FROM screens s
WHERE NOT EXISTS (SELECT 1 FROM screen_slides x WHERE x.screen_id = s.id AND x.zone = 'b');

INSERT INTO screen_slides (screen_id, zone, position, type, title, duration_seconds, config)
SELECT s.id, 'b', 1, 'sponsors', 'Sponsorer', 15, '{}'
FROM screens s
WHERE NOT EXISTS (SELECT 1 FROM screen_slides x WHERE x.screen_id = s.id AND x.zone = 'b' AND x.position = 1);
