// «Last ned alt» (Eksport og sletting): hele organisasjonen som én ZIP – alle
// tabellene som JSON og alle filene i biblioteket. Bare eiere.
//
//   GET /api/export  -> flatr-<adresse>-<dato>.zip
//
// Dataene leses fra et eget, skrivebeskyttet øyeblikksbilde av databasen, så
// alt i arkivet henger sammen selv om noen jobber i Flatr mens det lastes ned.
// Hemmeligheter er ikke med (se OMIT): de kan uansett ikke brukes andre steder.

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { zip } from './zip.js';
import { platformDb, tenantDir } from './platform.js';
import { logActivity } from '../src/api/activity.js';

const OMIT_COLUMNS = {
  apps: ['secret'], // pålogging til integrasjoner (kryptert)
  pairings: ['auth_token'], // TV-enes nøkkel
  api_keys: ['hash']
};
const OMIT_SETTINGS = new Set(['webhook_url']);
// sqlite_sequence er SQLite sin egen; web_snapshots er bilder av nettsider til Apple TV (mellomlager).
const SKIP_TABLES = new Set(['sqlite_sequence', 'web_snapshots']);
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'application/pdf': 'pdf' };

// Én eksport om gangen per organisasjon (en som aldri kom i gang, slipper etter en time).
const running = new Map();

const json = (data, status) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

/** Trygt navn på en fil eller mappe i arkivet (også på Windows). Tomt hvis ingenting er igjen. */
const cleanName = (s) =>
  String(s ?? '')
    .replace(/[\u0000-\u001f\\/:*?"<>|]+/g, '_')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 100);

/** JSON som er lagret som tekst (config, payload …), vises som JSON i eksporten. */
function value(v) {
  if (v instanceof Uint8Array) return Buffer.from(v).toString('base64');
  if (typeof v === 'string' && /^[[{]/.test(v)) {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }
  return v;
}

function tableRows(db, table) {
  const omit = new Set(OMIT_COLUMNS[table] || []);
  const rows = [];
  for (const row of db.prepare(`SELECT * FROM "${table}"`).iterate()) {
    if (table === 'settings' && OMIT_SETTINGS.has(row.key)) continue;
    const out = {};
    for (const [k, v] of Object.entries(row)) if (!omit.has(k)) out[k] = value(v);
    rows.push(out);
  }
  return rows;
}

function readme(tenant, user, origin, files) {
  const when = new Date().toLocaleString('nb-NO', { timeZone: 'Europe/Oslo', dateStyle: 'long', timeStyle: 'short' });
  return `Eksport av ${tenant.name} fra Flatr
${origin}
Laget ${when} av ${user.email}.

Innhold
-------
organisasjon.json   Navnet, adressen og teamet.
data/               Alt innholdet som JSON, én fil per tabell: presentasjoner
                    (playlists), lysbilder (deck_slides) og elementene på dem
                    (deck_elements), skjermer (screens), apper (apps),
                    innstillinger (settings), versjonshistorikk, aktivitetslogg,
                    avstemninger, statistikk og mer.
bibliotek/          Alle filene i biblioteket (${files} ${files === 1 ? 'fil' : 'filer'}), i de samme mappene som i
                    Flatr. Filnavnet starter med id-en som data/media.json og
                    lysbildene viser til (f.eks. /api/media?id=12 eller /m/12.png).

Ikke med
--------
Hemmeligheter som bare virker i Flatr: pålogging til integrasjoner, API-nøkler,
TV-enes nøkler og webhook-adressen for varsler.
`;
}

export async function handleExportRoute(request, ctx, env) {
  if (request.method !== 'GET') return json({ error: 'Metode ikke tillatt' }, 405);
  const { tenant, user } = ctx;
  if (user?.role !== 'owner') return json({ error: 'Bare eiere kan laste ned alt innholdet.' }, 403);
  const started = running.get(tenant.slug);
  if (started && Date.now() - started < 3600_000) return json({ error: 'En nedlasting pågår allerede. Vent til den er ferdig.' }, 429);
  running.set(tenant.slug, Date.now());

  const origin = ctx.origin(tenant.slug);
  const members = platformDb
    .prepare(
      `SELECT u.email, u.name, m.role, m.created_at AS member_since
         FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = ? ORDER BY u.email`
    )
    .bind(tenant.id)
    .allSync().results;
  await logActivity(env, user, { action: 'lastet ned alt innholdet', target_type: 'org', target_name: tenant.name }).catch(() => {});

  async function* entries() {
    const db = new DatabaseSync(path.join(tenantDir(tenant.slug), 'db.sqlite'), { readOnly: true });
    let open = true;
    const close = () => {
      if (!open) return;
      open = false;
      try {
        db.exec('COMMIT');
      } catch {
        /* ingen transaksjon */
      }
      db.close();
    };
    try {
      db.exec('BEGIN'); // øyeblikksbildet holdes til dataene er lest
      const media = db.prepare('SELECT id, name, folder, r2_key, content_type, created_at FROM media ORDER BY id').all();
      yield { name: 'LES-MEG.txt', data: readme(tenant, user, origin, media.length) };
      yield {
        name: 'organisasjon.json',
        data: JSON.stringify({ name: tenant.name, slug: tenant.slug, url: origin, created_at: tenant.created_at, exported_at: new Date().toISOString(), exported_by: user.email, members }, null, 2)
      };
      const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all();
      for (const { name } of tables) {
        if (SKIP_TABLES.has(name)) continue;
        yield { name: `data/${name}.json`, data: JSON.stringify(tableRows(db, name), null, 2) };
      }
      close();

      for (const m of media) {
        const folder = String(m.folder || '')
          .split('/')
          .filter(Boolean)
          .map(cleanName)
          .filter(Boolean)
          .join('/');
        let file = cleanName(m.name) || 'fil';
        const ext = EXT[m.content_type];
        if (ext && !file.toLowerCase().endsWith(`.${ext}`) && !(ext === 'jpg' && /\.jpe?g$/i.test(file))) file += `.${ext}`;
        let local;
        try {
          local = env.MEDIA.localPath(m.r2_key);
        } catch {
          continue;
        }
        yield { name: `bibliotek/${folder ? `${folder}/` : ''}${m.id}-${file}`, file: local, date: new Date(m.created_at) };
      }
    } finally {
      close();
      running.delete(tenant.slug);
    }
  }

  const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
  return new Response(ReadableStream.from(zip(entries())), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="flatr-${tenant.slug}-${date}.zip"`,
      'Cache-Control': 'no-store',
      // nginx skal sende videre med en gang, ikke mellomlagre gigabytes på disk.
      'X-Accel-Buffering': 'no'
    }
  });
}
