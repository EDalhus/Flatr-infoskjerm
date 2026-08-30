-- Migrering 0004: tidsstyring (dayparting) på slides/spilleliste-elementer,
-- og papirkurv («Nylig slettet»). Nye slide-typer (web/video/qr/countdown)
-- krever ingen skjemaendring.
-- Trygg å kjøre etter 0003. Kjørt før? ALTER-linjer feiler med
-- «duplicate column name» – ufarlig.
PRAGMA foreign_keys = ON;

-- Tidsstyring: raden vises bare når nåtid er innenfor vinduet.
-- active_from/active_to  = "HH:MM" (klokkeslett, skjermens lokale tid)
-- active_days            = CSV av ukedager 1–7 (1=man … 7=søn), tom = alle
-- active_from_date/..to  = "YYYY-MM-DD" datointervall (valgfritt)
ALTER TABLE screen_slides  ADD COLUMN active_from TEXT;
ALTER TABLE screen_slides  ADD COLUMN active_to TEXT;
ALTER TABLE screen_slides  ADD COLUMN active_days TEXT;
ALTER TABLE screen_slides  ADD COLUMN active_from_date TEXT;
ALTER TABLE screen_slides  ADD COLUMN active_to_date TEXT;

ALTER TABLE playlist_items ADD COLUMN active_from TEXT;
ALTER TABLE playlist_items ADD COLUMN active_to TEXT;
ALTER TABLE playlist_items ADD COLUMN active_days TEXT;
ALTER TABLE playlist_items ADD COLUMN active_from_date TEXT;
ALTER TABLE playlist_items ADD COLUMN active_to_date TEXT;

-- Papirkurv. payload = JSON med raden + evt. barn, nok til å gjenopprette.
CREATE TABLE IF NOT EXISTS trash (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL,
  label      TEXT NOT NULL,
  payload    TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_trash_deleted ON trash (deleted_at);
