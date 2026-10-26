// Konsistente kopier av alle databaser mens Flatr kjører (SQLite VACUUM INTO).
// Kjøres av deploy/backup.sh hver natt:
//
//   node server/backup.js <målmappe>
//
// Skriver <målmappe>/platform.db og <målmappe>/tenants/<slug>.db.
// Mediefilene kopieres av backup.sh (de endres aldri etter opplasting).

import { mkdirSync, readdirSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const target = path.resolve(process.argv[2] || path.join(DATA_DIR, '_backup'));

function snapshot(src, dest) {
  if (existsSync(dest)) rmSync(dest);
  const db = new DatabaseSync(src, { readOnly: true });
  try {
    db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
  } finally {
    db.close();
  }
}

mkdirSync(path.join(target, 'tenants'), { recursive: true });
snapshot(path.join(DATA_DIR, 'platform.db'), path.join(target, 'platform.db'));

let count = 0;
for (const slug of readdirSync(path.join(DATA_DIR, 'tenants'))) {
  const src = path.join(DATA_DIR, 'tenants', slug, 'db.sqlite');
  if (!existsSync(src)) continue;
  snapshot(src, path.join(target, 'tenants', `${slug}.db`));
  count++;
}
console.log(`backup: platform + ${count} kunde(r) -> ${target}`);
