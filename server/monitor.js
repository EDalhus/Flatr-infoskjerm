// Overvåking av parede skjermer, hvert minutt:
//
//  1. Visningslogg: for hver skjerm som er online, +1 minutt på det kanalen
//     viser nå ifølge tidsplanen (play_log, pr. lokal time). Dette er hva
//     skjermen er satt til å vise mens den er tilkoblet – ikke en bekreftelse
//     fra spilleren på hvert enkelt lysbilde.
//  2. Offline-varsel: e-post til eierne når en skjerm har vært borte i
//     `offline_minutes` (standard 5), og når den er tilbake.
//     Slås av med innstillingen offline_alerts = '0'.

import { platformDb, tenantResources } from './platform.js';
import { resolveScreenContent, getTimezone } from '../src/api/_shared.js';
import { localParts } from '../src/lib/timeslots.js';
import { sendMail, buttonMail } from './mail.js';

const TICK_MS = 60_000;
const ONLINE_MS = 90_000;
// Ikke varsle om skjermer som var borte lenge før overvåkingen startet.
const MAX_ALERT_AGE_MS = 24 * 3600_000;

const ORIGIN = () => `${process.env.PUBLIC_PROTOCOL || 'https'}://`;
const BASE = () => process.env.BASE_DOMAIN || 'flatr.no';

function tenantsWithDevices() {
  return platformDb
    .prepare(`SELECT DISTINCT t.id, t.slug, t.name FROM tenants t JOIN device_routes r ON r.tenant_id = t.id`)
    .allSync().results;
}

const ownerEmails = (tenantId) =>
  platformDb
    .prepare(
      `SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id
        WHERE m.tenant_id = ? AND m.role = 'owner'`
    )
    .bind(tenantId)
    .allSync()
    .results.map((r) => r.email);

async function setting(env, key, fallback) {
  try {
    const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
    return row?.value ?? fallback;
  } catch {
    return fallback;
  }
}

const deviceName = (d) => {
  let info = {};
  try {
    info = JSON.parse(d.client_info || '{}');
  } catch {
    /* ignore */
  }
  return d.label || info.device_name || `Enhet ${d.code}`;
};

export async function monitorTenant(t) {
  const env = tenantResources(t.slug);
  const { results: devices } = await env.DB.prepare(
    `SELECT p.*, s.name AS screen_name FROM pairings p LEFT JOIN screens s ON s.id = p.screen_id
      WHERE p.status = 'paired'`
  ).all();
  if (!devices?.length) return;

  const now = Date.now();
  const tz = await getTimezone(env);
  const local = localParts(new Date(), tz);
  const hour = `${local.date}T${String(Math.floor(local.min / 60)).padStart(2, '0')}`;

  // 1. Visningslogg
  const screens = new Map();
  for (const d of devices) {
    const online = d.last_seen && now - Date.parse(d.last_seen) < ONLINE_MS;
    if (!online || !d.screen_id) continue;
    if (!screens.has(d.screen_id)) {
      const screen = await env.DB.prepare('SELECT * FROM screens WHERE id = ?').bind(d.screen_id).first();
      screens.set(d.screen_id, screen ? await resolveScreenContent(env, screen) : null);
    }
    const content = screens.get(d.screen_id);
    if (!content) continue;
    await env.DB.prepare(
      `INSERT INTO play_log (hour, device_id, screen_id, playlist_id, off, minutes) VALUES (?, ?, ?, ?, ?, 1)
       ON CONFLICT(hour, device_id, playlist_id, off) DO UPDATE SET minutes = minutes + 1, screen_id = excluded.screen_id`
    )
      .bind(hour, d.device_id, d.screen_id, content.playlistId, content.off ? 1 : 0)
      .run();
  }

  // 2. Offline-varsel
  if ((await setting(env, 'offline_alerts', '1')) === '0') return;
  const limitMs = Math.max(2, Number(await setting(env, 'offline_minutes', '5')) || 5) * 60_000;
  const wentOffline = [];
  const cameBack = [];
  for (const d of devices) {
    const since = d.last_seen ? now - Date.parse(d.last_seen) : Infinity;
    if (since >= limitMs && since < MAX_ALERT_AGE_MS && !d.offline_notified_at) {
      wentOffline.push(d);
      await env.DB.prepare('UPDATE pairings SET offline_notified_at = ? WHERE id = ?').bind(new Date().toISOString(), d.id).run();
    } else if (since < ONLINE_MS && d.offline_notified_at) {
      cameBack.push(d);
      await env.DB.prepare('UPDATE pairings SET offline_notified_at = NULL WHERE id = ?').bind(d.id).run();
    }
  }
  if (!wentOffline.length && !cameBack.length) return;

  const to = ownerEmails(t.id);
  if (!to.length) return;
  const describe = (d) => `${deviceName(d)}${d.screen_name ? ` (${d.screen_name})` : ''}`;
  const url = `${ORIGIN()}${t.slug}.${BASE()}/admin?view=screens`;
  const subject = wentOffline.length
    ? `${wentOffline.length === 1 ? describe(wentOffline[0]) : `${wentOffline.length} TV-er`} er frakoblet – ${t.name}`
    : `${cameBack.length === 1 ? describe(cameBack[0]) : `${cameBack.length} TV-er`} er tilbake – ${t.name}`;
  const lines = [
    ...wentOffline.map((d) => `Frakoblet: ${describe(d)}`),
    ...cameBack.map((d) => `Tilbake: ${describe(d)}`)
  ];
  await sendMail({
    to,
    subject,
    ...buttonMail({
      heading: wentOffline.length ? 'En TV har mistet forbindelsen' : 'TV-en er tilbake',
      intro: lines.join(' · '),
      button: 'Se enhetene',
      url,
      outro: 'Varslingen kan slås av under Enheter i Flatr.'
    })
  }).catch((err) => console.error('[monitor] e-post feilet:', err.message));
}

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    for (const t of tenantsWithDevices()) {
      try {
        await monitorTenant(t);
      } catch (err) {
        console.error(`[monitor] ${t.slug}:`, err.message);
      }
    }
  } finally {
    running = false;
  }
}

export function startMonitor() {
  setInterval(tick, TICK_MS).unref();
}
