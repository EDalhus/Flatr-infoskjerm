-- Migrering 0008: kallenavn (label) på parede enheter.
-- Trygg å kjøre etter 0007.
--
--   npx wrangler d1 execute event-infoscreen-db --remote --file=./migrations/0008_pairing_label.sql
--
-- SQLite har ikke «ADD COLUMN IF NOT EXISTS» – har du kjørt denne før, feiler
-- ALTER-linja med «duplicate column name», og da er du allerede oppdatert.

ALTER TABLE pairings ADD COLUMN label TEXT;   -- fritt kallenavn satt i admin
