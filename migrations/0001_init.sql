-- Basisskjema (versjon 1). Kjør bare på en helt tom database.
-- Nye installasjoner bør heller bruke ../schema.sql (inneholder alt + demo-data).
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS screens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  location   TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS schedule (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT,
  start_time  TEXT NOT NULL,
  end_time    TEXT,
  stage       TEXT,
  status      TEXT NOT NULL DEFAULT 'scheduled'
);

CREATE TABLE IF NOT EXISTS sponsors (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  image_url        TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 10
);

CREATE TABLE IF NOT EXISTS alerts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  message          TEXT NOT NULL,
  target_screen_id INTEGER REFERENCES screens(id) ON DELETE CASCADE,
  active           INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_schedule_start ON schedule (start_time);
CREATE INDEX IF NOT EXISTS idx_alerts_active  ON alerts (active);
CREATE INDEX IF NOT EXISTS idx_alerts_target  ON alerts (target_screen_id);
