-- Migrering 0007: fjernkommandoer + klient-info for parede TV-er.
-- Trygg å kjøre etter 0006.
--
--   npx wrangler d1 execute event-infoscreen-db --remote --file=./migrations/0007_pairing_commands.sql
--
-- SQLite har ikke «ADD COLUMN IF NOT EXISTS» – har du kjørt denne før, feiler
-- ALTER-linja med «duplicate column name», og da er du allerede oppdatert
-- (kjør resten manuelt hvis den stopper her).
PRAGMA foreign_keys = ON;

-- Fritt JSON fra klienten: { app_version, tvos_version, model, resolution, uptime_seconds }.
ALTER TABLE pairings ADD COLUMN client_info TEXT;

-- Én rad = én kommando til én enhet. TV-en henter uleverte i status-pollen.
CREATE TABLE IF NOT EXISTS pairing_commands (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id    TEXT NOT NULL,
  command      TEXT NOT NULL,              -- identify | reload | clear_cache | reboot
  payload      TEXT,                       -- valgfri JSON (f.eks. { label, seconds })
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  delivered_at TEXT                        -- settes når kommandoen er sendt til enheten
);

CREATE INDEX IF NOT EXISTS idx_pairing_commands_pending ON pairing_commands (device_id, delivered_at);
