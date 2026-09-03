-- Migrering 0009: fjernstyrt skjermrotasjon.
-- Trygg å kjøre etter 0008.
--
--   npx wrangler d1 execute event-infoscreen-db --remote --file=./migrations/0009_screen_rotation.sql
--
-- `rotation` er antall grader den ferdige visningen roteres, for å matche hvordan
-- panelet er fysisk montert. Styres kun fra webappen (ikke fra den parrede TV-en).
-- Gyldige verdier: multipler av 45 (0, 45, 90, 135, 180, 225, 270, 315).
-- `orientation` (landscape/portrait) bestemmer fortsatt design-lerretet.
--
-- Har du kjørt denne før, feiler ALTER-linja med «duplicate column name» – da er
-- du allerede oppdatert.

ALTER TABLE screens ADD COLUMN rotation INTEGER NOT NULL DEFAULT 0;
