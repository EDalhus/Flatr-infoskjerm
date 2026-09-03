-- Migrering 0006: enhets-parring for TV-klienter (Apple TV / tvOS m.fl.).
-- Trygg å kjøre etter 0005.
--
--   npx wrangler d1 execute event-infoscreen-db --remote --file=./migrations/0006_pairing.sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS pairings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL,                       -- kort, lettlest kode vist på TV-en (6 tegn)
  device_id   TEXT NOT NULL,                       -- opak id generert av backend, lagres på TV-en
  status      TEXT NOT NULL DEFAULT 'pending',     -- pending | paired | expired
  screen_id   INTEGER REFERENCES screens(id) ON DELETE CASCADE,  -- settes ved paring
  auth_token  TEXT,                                -- utstedes ved paring; TV-en bruker den som Bearer-token
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at  TEXT NOT NULL,                       -- koden utløper (created_at + 15 min)
  paired_at   TEXT,
  last_seen   TEXT                                 -- oppdateres når TV-en poller status
);

-- Én enhet = én rad.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pairings_device ON pairings (device_id);
-- To LEVENDE koder kan ikke kollidere; samme streng kan gjenbrukes når en gammel er brukt/utløpt.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pairings_code_pending ON pairings (code) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_pairings_status ON pairings (status);
CREATE INDEX IF NOT EXISTS idx_pairings_token  ON pairings (auth_token);
