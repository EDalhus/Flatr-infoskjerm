// D1-kompatibelt lag over node:sqlite.
//
// API-modulene i src/api/ snakker med `env.DB` slik Cloudflare D1 definerer
// det: prepare().bind().first()/all()/run()/raw() og batch(). D1 er SQLite,
// så SQL-en kjører uendret – vi trenger bare samme overflate, asynkront.

import { DatabaseSync } from 'node:sqlite';

// node:sqlite godtar ikke boolean/undefined som parametre (D1 konverterer selv).
const toParam = (v) => {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  return v;
};

// Rader fra node:sqlite har null-prototype; gjør dem til vanlige objekter.
const plain = (row) => (row ? { ...row } : null);

class Statement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }

  bind(...values) {
    return new Statement(this.db, this.sql, values.map(toParam));
  }

  #stmt() {
    return this.db.prepare(this.sql);
  }

  firstSync(column) {
    const row = plain(this.#stmt().get(...this.params));
    if (!row) return null;
    return column ? (row[column] ?? null) : row;
  }

  allSync() {
    const rows = this.#stmt().all(...this.params).map(plain);
    return { success: true, results: rows, meta: { rows_read: rows.length } };
  }

  runSync() {
    const stmt = this.#stmt();
    // RETURNING-spørringer må leses med all() for å gi resultater.
    if (/\breturning\b/i.test(this.sql)) {
      const rows = stmt.all(...this.params).map(plain);
      return { success: true, results: rows, meta: { changes: rows.length } };
    }
    const info = stmt.run(...this.params);
    return {
      success: true,
      results: [],
      meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) }
    };
  }

  async first(column) {
    return this.firstSync(column);
  }

  async all() {
    return this.allSync();
  }

  async run() {
    return this.runSync();
  }

  async raw() {
    const stmt = this.#stmt();
    stmt.setReturnArrays?.(true);
    return stmt.all(...this.params);
  }
}

export class D1Database {
  constructor(file) {
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  }

  prepare(sql) {
    return new Statement(this.db, sql);
  }

  // D1 kjører batch som én transaksjon.
  async batch(statements) {
    this.db.exec('BEGIN');
    try {
      const out = statements.map((s) => (/^\s*select\b/i.test(s.sql) ? s.allSync() : s.runSync()));
      this.db.exec('COMMIT');
      return out;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  async exec(sql) {
    this.db.exec(sql);
    return { count: 0, duration: 0 };
  }

  close() {
    this.db.close();
  }
}
