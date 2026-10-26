// Tar jevnlige skjermbilder av nettside-elementer, så Apple TV (uten
// nettleser) kan vise dem som bilder. Se adaptForDevices i src/api/_shared.js.
//
// Bare kunder med minst én paret TV, og bare nettsider i spillelister som en
// kanal faktisk viser. Intervallet er elementets «Oppdater hvert (min)», men
// minst MIN_MINUTES; 0 («aldri») betyr én gang i timen.

import { randomUUID } from 'node:crypto';
import { platformDb, tenantResources } from './platform.js';
import { screenshotUrl } from './convert.js';

const TICK_MS = 2 * 60_000;
const MIN_MINUTES = 10;
const DEFAULT_MINUTES = 60;
const RETRY_MINUTES = 30;
const BASE = { landscape: [1920, 1080], portrait: [1080, 1920] };

const minutesSince = (iso) => (iso ? (Date.now() - Date.parse(iso)) / 60_000 : Infinity);

function tenantsWithDevices() {
  return platformDb
    .prepare(
      `SELECT DISTINCT t.id, t.slug FROM tenants t
         JOIN device_routes r ON r.tenant_id = t.id
        WHERE r.auth_token IS NOT NULL`
    )
    .allSync().results;
}

/** Nettsider i bruk: url -> { minutes, width, height } (største element vinner). */
async function webTargets(env) {
  const { results } = await env.DB.prepare(
    `SELECT e.config, e.w, e.h, p.orientation
       FROM deck_elements e
       JOIN deck_slides d ON d.id = e.slide_id
       JOIN playlists p ON p.id = d.playlist_id
      WHERE e.kind = 'web' AND d.enabled = 1
        AND p.id IN (SELECT playlist_id FROM screens WHERE playlist_id IS NOT NULL)`
  ).all();

  const targets = new Map();
  for (const r of results ?? []) {
    let cfg = {};
    try {
      cfg = JSON.parse(r.config || '{}');
    } catch {
      continue;
    }
    if (!/^https?:\/\//i.test(cfg.url || '')) continue;
    const [bw, bh] = BASE[r.orientation === 'portrait' ? 'portrait' : 'landscape'];
    const pxW = (Number(r.w) / 100) * bw;
    const pxH = (Number(r.h) / 100) * bh;
    // Nettlesere tegner sider for ~1280–1600 px bredde; behold elementets form.
    const width = 1600;
    const height = Math.round(Math.min(3000, Math.max(400, width * (pxH / Math.max(1, pxW)))));
    const minutes = Number(cfg.refreshMinutes) > 0 ? Math.max(MIN_MINUTES, Number(cfg.refreshMinutes)) : DEFAULT_MINUTES;
    const prev = targets.get(cfg.url);
    if (!prev || width * height > prev.width * prev.height) targets.set(cfg.url, { minutes, width, height });
  }
  return targets;
}

export async function refreshTenant(slug) {
  const env = tenantResources(slug);
  const targets = await webTargets(env);

  for (const [url, t] of targets) {
    const row = await env.DB.prepare('SELECT * FROM web_snapshots WHERE url = ?').bind(url).first();
    const due = row?.error
      ? minutesSince(row.tried_at) >= RETRY_MINUTES
      : !row?.taken_at || minutesSince(row.taken_at) >= t.minutes || row.width !== t.width || row.height !== t.height;
    if (!due) continue;

    const now = new Date().toISOString();
    try {
      const image = await screenshotUrl(url, { width: t.width, height: t.height });
      const key = `snapshots/${randomUUID()}.jpg`;
      await env.MEDIA.put(key, image, { httpMetadata: { contentType: 'image/jpeg' } });
      await env.DB.prepare(
        `INSERT INTO web_snapshots (url, r2_key, content_type, width, height, taken_at, tried_at, error)
         VALUES (?, ?, 'image/jpeg', ?, ?, ?, ?, NULL)
         ON CONFLICT(url) DO UPDATE SET r2_key = excluded.r2_key, width = excluded.width, height = excluded.height,
           taken_at = excluded.taken_at, tried_at = excluded.tried_at, error = NULL`
      )
        .bind(url, key, t.width, t.height, now, now)
        .run();
      if (row?.r2_key) await env.MEDIA.delete(row.r2_key).catch(() => {});
    } catch (err) {
      console.warn(`[snapshot] ${slug} ${url}: ${err.message}`);
      await env.DB.prepare(
        `INSERT INTO web_snapshots (url, tried_at, error) VALUES (?, ?, ?)
         ON CONFLICT(url) DO UPDATE SET tried_at = excluded.tried_at, error = excluded.error`
      )
        .bind(url, now, String(err.message).slice(0, 300))
        .run();
    }
  }
}

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    for (const t of tenantsWithDevices()) {
      try {
        await refreshTenant(t.slug);
      } catch (err) {
        console.error(`[snapshot] ${t.slug}:`, err.message);
      }
    }
  } finally {
    running = false;
  }
}

export function startSnapshots() {
  setTimeout(tick, 30_000).unref();
  setInterval(tick, TICK_MS).unref();
}
