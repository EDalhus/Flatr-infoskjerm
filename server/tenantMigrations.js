// Skjemaendringer for kundedatabasene. Kjøres hver gang en kundedatabase
// åpnes (og rett etter schema.sql for nye kunder). PRAGMA user_version holder
// styr på hvor langt databasen er kommet, så hver migrering kjøres én gang.
//
// schema.sql er grunnlaget (versjon 0); alt etter det ligger her.

const MIGRATIONS = [
  // 1: Spillelister. Lysbildene flyttes fra kanalen (deck_slides.screen_id) til
  //    en gjenbrukbar spilleliste (deck_slides.playlist_id), og kanalen peker
  //    på spillelisten den viser. Hver eksisterende kanal får sin egen
  //    spilleliste med samme id og navn, så ingenting endrer seg for TV-ene.
  `
  DROP TABLE IF EXISTS screen_slides;
  DROP TABLE IF EXISTS playlist_items;
  DROP TABLE IF EXISTS playlists;

  CREATE TABLE playlists (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    orientation TEXT NOT NULL DEFAULT 'landscape',   -- landscape | portrait (design-lerret)
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  INSERT INTO playlists (id, name, orientation) SELECT id, name, orientation FROM screens;

  ALTER TABLE screens ADD COLUMN playlist_id INTEGER REFERENCES playlists(id) ON DELETE SET NULL;
  UPDATE screens SET playlist_id = id;

  CREATE TABLE deck_slides_new (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id       INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    position          INTEGER NOT NULL DEFAULT 0,
    name              TEXT,
    duration_seconds  INTEGER NOT NULL DEFAULT 15,
    transition        TEXT NOT NULL DEFAULT 'fade',
    transition_ms     INTEGER NOT NULL DEFAULT 600,
    background        TEXT NOT NULL DEFAULT '{"type":"color","color":"#0f2733"}',
    enabled           INTEGER NOT NULL DEFAULT 1,
    active_from       TEXT,
    active_to         TEXT,
    active_days       TEXT,
    active_from_date  TEXT,
    active_to_date    TEXT,
    created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  INSERT INTO deck_slides_new
    (id, playlist_id, position, name, duration_seconds, transition, transition_ms, background, enabled,
     active_from, active_to, active_days, active_from_date, active_to_date, created_at)
  SELECT id, screen_id, position, name, duration_seconds, transition, transition_ms, background, enabled,
         active_from, active_to, active_days, active_from_date, active_to_date, created_at
    FROM deck_slides;
  DROP TABLE deck_slides;
  ALTER TABLE deck_slides_new RENAME TO deck_slides;
  CREATE INDEX IF NOT EXISTS idx_deck_slides_playlist ON deck_slides (playlist_id, position);
  CREATE INDEX IF NOT EXISTS idx_screens_playlist ON screens (playlist_id);
  `,

  // 2: Skjermbilder av nettsider. Apple TV har ingen nettleser, så TV-appen
  //    får et jevnlig oppdatert skjermbilde i stedet for selve nettsiden.
  `
  CREATE TABLE IF NOT EXISTS web_snapshots (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    url          TEXT NOT NULL UNIQUE,
    r2_key       TEXT,
    content_type TEXT,
    width        INTEGER,
    height       INTEGER,
    taken_at     TEXT,
    error        TEXT,
    tried_at     TEXT
  );
  `,

  // 3: Tidsplan pr. kanal (se src/lib/timeslots.js) + kontoinnstillinger (tidssone).
  `
  CREATE TABLE IF NOT EXISTS timeslots (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    screen_id   INTEGER NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
    playlist_id INTEGER REFERENCES playlists(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL DEFAULT 'playlist',      -- playlist | off
    title       TEXT,
    days        TEXT,                                  -- "1,2,3" (ISO), tom = alle
    start_time  TEXT,                                  -- "HH:MM", tom = hele dagen
    end_time    TEXT,
    start_date  TEXT,                                  -- "YYYY-MM-DD", tom = ingen grense
    end_date    TEXT,
    priority    INTEGER NOT NULL DEFAULT 0,            -- 0 vanlig, 10 høy (overstyring)
    enabled     INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX IF NOT EXISTS idx_timeslots_screen ON timeslots (screen_id);

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
  `,

  // 4: Skjermstyring – tagger, skjermbilder fra spillerne, offline-varsling
  //    og visningslogg (minutter pr. time, enhet og spilleliste).
  `
  ALTER TABLE pairings ADD COLUMN tags TEXT;
  ALTER TABLE pairings ADD COLUMN screenshot_at TEXT;
  ALTER TABLE pairings ADD COLUMN offline_notified_at TEXT;

  CREATE TABLE IF NOT EXISTS play_log (
    hour        TEXT NOT NULL,                -- lokal tid "YYYY-MM-DDTHH"
    device_id   TEXT NOT NULL,
    screen_id   INTEGER,
    playlist_id INTEGER,                      -- NULL = ingenting / skjerm av
    off         INTEGER NOT NULL DEFAULT 0,
    minutes     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (hour, device_id, playlist_id, off)
  );
  CREATE INDEX IF NOT EXISTS idx_play_log_hour ON play_log (hour);
  `,

  // 5: Sponsorer blir bildekaruseller basert på mapper i mediebiblioteket.
  //    Bilder sponsorene bruker fra biblioteket flyttes til mappen «Sponsorer»,
  //    og sponsor-elementer blir karuseller som viser den mappen.
  `
  UPDATE media SET folder = 'Sponsorer'
   WHERE folder IS NULL
     AND id IN (SELECT CAST(substr(image_url, instr(image_url, 'id=') + 3,
                                   instr(substr(image_url, instr(image_url, 'id=') + 3) || '&', '&') - 1) AS INTEGER)
                  FROM sponsors WHERE image_url LIKE '/api/media?id=%');
  UPDATE deck_elements
     SET kind = 'carousel',
         config = '{"folder":"Sponsorer","seconds":8,"fit":"contain","transition":"fade","shuffle":false}'
   WHERE kind = 'sponsors';
  `,

  // 6: «Skjerm» betyr nå den fysiske TV-en: hver skjerm har høyst én TV.
  //    Skjermer som ble vist på flere TV-er deles opp, så hver TV får sin egen
  //    kopi (med samme presentasjon og tidsplan). Tagger flyttes fra TV-en til skjermen.
  (db) => {
    db.exec('ALTER TABLE screens ADD COLUMN tags TEXT');
    const shared = db
      .prepare(
        `SELECT screen_id FROM pairings WHERE status = 'paired' AND screen_id IS NOT NULL
          GROUP BY screen_id HAVING COUNT(*) > 1`
      )
      .all();
    for (const { screen_id } of shared) {
      const src = db.prepare('SELECT * FROM screens WHERE id = ?').get(screen_id);
      if (!src) continue;
      const devices = db
        .prepare(`SELECT id, label, code FROM pairings WHERE status = 'paired' AND screen_id = ? ORDER BY id`)
        .all(screen_id);
      const slots = db.prepare('SELECT * FROM timeslots WHERE screen_id = ?').all(screen_id);
      devices.slice(1).forEach((d, i) => {
        const { lastInsertRowid: id } = db
          .prepare(
            `INSERT INTO screens (name, location, orientation, rotation, rotation_seconds, playlist_id)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .run(d.label || `${src.name} ${i + 2}`, src.location, src.orientation, src.rotation ?? 0, src.rotation_seconds, src.playlist_id);
        for (const t of slots) {
          db.prepare(
            `INSERT INTO timeslots (screen_id, playlist_id, kind, title, days, start_time, end_time, start_date, end_date, priority, enabled)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(id, t.playlist_id, t.kind, t.title, t.days, t.start_time, t.end_time, t.start_date, t.end_date, t.priority, t.enabled);
        }
        db.prepare('UPDATE pairings SET screen_id = ? WHERE id = ?').run(id, d.id);
      });
    }
    db.exec(`
      UPDATE screens SET tags = (SELECT p.tags FROM pairings p WHERE p.screen_id = screens.id AND p.status = 'paired' AND p.tags IS NOT NULL LIMIT 1);
      DELETE FROM pairings WHERE status = 'paired' AND (screen_id IS NULL OR screen_id NOT IN (SELECT id FROM screens));
    `);
  },

  // 7: Flatr Apps – egne datakilder (først: skipstrafikk fra AIS) som
  //    elementet «Flatr App» viser. config er JSON (flåte, kaier, client id),
  //    secret er kryptert (se src/api/apps.js) og sendes aldri til nettleseren.
  `
  CREATE TABLE IF NOT EXISTS apps (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    kind        TEXT NOT NULL,
    config      TEXT NOT NULL DEFAULT '{}',
    secret      TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  `,

  // 8: Flatr Apps blir en markedsplass. En rad i apps er nå en aktivert app:
  //    kind = offisiell nøkkel (ais, weather, rss, calendar) eller 'custom',
  //    og app_ref peker på den egne appen i platform.db (custom_apps.id).
  `ALTER TABLE apps ADD COLUMN app_ref INTEGER;`,

  // 9: AIS-appen heter nå «NAIS (Norsk AIS-tjeneste)». Installasjoner som
  //    fortsatt har standardnavnet, får det nye (egne navn beholdes).
  `UPDATE apps SET name = 'NAIS (Norsk AIS-tjeneste)' WHERE kind = 'ais' AND name = 'Skipstrafikk (AIS)';`,

  // 10: Åpningstider per skjerm (JSON, se src/lib/hours.js) og varsler til en
  //     gruppe skjermer (tagg) i stedet for én skjerm eller alle.
  `
  ALTER TABLE screens ADD COLUMN hours TEXT;
  ALTER TABLE alerts ADD COLUMN target_tag TEXT;
  `,
  // 11: AI-assistenten i editoren: samtalen per presentasjon, med alle
  //     innholdsblokkene fra Claude (tenking, tekst, verktøykall og -svar).
  `
  CREATE TABLE IF NOT EXISTS ai_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    author TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX IF NOT EXISTS ai_messages_playlist ON ai_messages (playlist_id, id);
  `,
  // 12: Team og kontroll – aktivitetslogg, versjonshistorikk per presentasjon,
  //     godkjenning før publisering og kommentarer i editoren.
  `
  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    user_email TEXT,
    user_name TEXT,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id INTEGER,
    target_name TEXT,
    detail TEXT,
    count INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS activity_at ON activity_log (at);
  CREATE TABLE IF NOT EXISTS playlist_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    author TEXT,
    kind TEXT NOT NULL DEFAULT 'auto',
    data TEXT NOT NULL,
    slide_count INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS playlist_versions_pl ON playlist_versions (playlist_id, id);
  ALTER TABLE playlists ADD COLUMN published_version_id INTEGER;
  ALTER TABLE playlists ADD COLUMN review_requested_at TEXT;
  ALTER TABLE playlists ADD COLUMN review_requested_by TEXT;
  ALTER TABLE playlists ADD COLUMN review_note TEXT;
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id INTEGER NOT NULL,
    slide_id INTEGER,
    element_id INTEGER,
    parent_id INTEGER,
    author_email TEXT,
    author_name TEXT,
    body TEXT NOT NULL,
    resolved INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX IF NOT EXISTS comments_pl ON comments (playlist_id, id);
  `,
  // 13: Program, Tidsplan og Berøringsskjerm ble Flatr Apps (av fra start).
  //     Kunder som allerede bruker dem, får appen aktivert, så ingenting forsvinner.
  (db) => {
    const has = (sql) => !!db.prepare(sql).get();
    const add = (kind, name) => {
      if (!db.prepare('SELECT id FROM apps WHERE kind = ?').get(kind)) db.prepare(`INSERT INTO apps (name, kind, config) VALUES (?, ?, '{}')`).run(name, kind);
    };
    if (has('SELECT 1 FROM schedule LIMIT 1') || has(`SELECT 1 FROM deck_elements WHERE kind IN ('program', 'countdown') LIMIT 1`)) add('events', 'Arrangement og program');
    if (has('SELECT 1 FROM timeslots LIMIT 1')) add('timetable', 'Tidsplan');
    if (has(`SELECT 1 FROM deck_elements WHERE kind = 'button' LIMIT 1`)) add('touch', 'Berøringsskjerm');
  }
];

export const TENANT_SCHEMA_VERSION = MIGRATIONS.length;

/** Kjører migreringene databasen mangler. `db` er en node:sqlite DatabaseSync. */
export function migrateTenant(db) {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  if (current >= MIGRATIONS.length) return;

  // Tabell-ombygging krever at fremmednøkler er av (ellers kaskadesletter
  // DROP TABLE deck_slides alle elementene). Kan ikke endres inne i en transaksjon.
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    for (let v = current; v < MIGRATIONS.length; v++) {
      db.exec('BEGIN');
      try {
        if (typeof MIGRATIONS[v] === 'function') MIGRATIONS[v](db);
        else db.exec(MIGRATIONS[v]);
        db.exec(`PRAGMA user_version = ${v + 1}`);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw new Error(`Migrering ${v + 1} feilet: ${err.message}`);
      }
    }
    const broken = db.prepare('PRAGMA foreign_key_check').all();
    if (broken.length) console.warn('[migrate] brutte fremmednøkler etter migrering:', broken.slice(0, 5));
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}
