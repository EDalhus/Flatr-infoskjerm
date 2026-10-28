// Varsler som ikke handler om én TV (kjøres hvert 5. minutt for alle kontoer):
//
//  1. Anløp (NAIS → Anløp, «Varsle i Slack/Teams»): når en båt i dagens
//     anløpsliste nærmer seg kaia (under 60 min), ankommer, eller er forsinket
//     mer enn en time mot planlagt klokkeslett. Hvert varsel sendes én gang.
//  2. Daglig helsesjekk kl. 07 (innstillingen daily_digest = '1'): frakoblede
//     TV-er, skjermer uten innhold, widgeter som feiler, NAIS-feil og
//     lysbilder som utløper – til eierne på e-post og til Slack/Teams.

import { platformDb, tenantResources } from './platform.js';
import { getTimezone } from '../src/api/_shared.js';
import { appData } from '../src/api/apps.js';
import { etaTo } from '../src/lib/ais.js';
import { hasClock, cargoText } from '../src/lib/portCalls.js';
import { sendWebhook } from '../src/lib/webhook.js';
import { sendMail, buttonMail } from './mail.js';

const TICK_MS = 5 * 60_000;
const DIGEST_HOUR = 7;

const ORIGIN = () => `${process.env.PUBLIC_PROTOCOL || 'https'}://`;
const BASE = () => process.env.BASE_DOMAIN || 'flatr.no';
const safe = (s, d) => {
  try {
    return JSON.parse(s);
  } catch {
    return d;
  }
};

async function setting(env, key, fallback) {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first().catch(() => null);
  return row?.value ?? fallback;
}
const setSetting = (env, key, value) =>
  env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, value).run();

/** Lokale deler (dato, time) for nå i en tidssone. */
function localNow(tz) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value])
  );
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

/** Lokal veggklokketid ("2026-11-02T14:30" / "2026-11-02") i tz -> epoch ms. */
export function zoned(t, tz, end = false) {
  if (!t) return NaN;
  const [d, clock] = t.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [hh, mm] = clock ? clock.split(':').map(Number) : end ? [23, 59] : [0, 0];
  const guess = Date.UTC(y, m - 1, day, hh, mm);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(guess))
      .map((x) => [x.type, x.value])
  );
  const asLocal = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
  return guess - (asLocal - guess);
}

const clockIn = (ms, tz) => new Date(ms).toLocaleTimeString('nb-NO', { timeZone: tz, hour: '2-digit', minute: '2-digit' });

/* ------------------------------ 1. anløp -------------------------------- */

async function callNotices(t, env, tz, hook) {
  const app = await env.DB.prepare(`SELECT * FROM apps WHERE kind = 'ais' ORDER BY id LIMIT 1`).first();
  const config = safe(app?.config, {});
  if (!app || !config.calls_notify || !Array.isArray(config.calls) || !config.calls.length) return;

  const now = Date.now();
  // currentCalls tolker tider i serverens sone; gjør om til kontoens sone først.
  const calls = config.calls.filter((c) => c.mmsi && c.quayId);
  const today = calls.filter((c) => {
    const start = zoned(c.eta, tz);
    const done = c.etd ? zoned(c.etd, tz, true) : hasClock(c.eta) ? start + 12 * 3600_000 : zoned(c.eta, tz, true);
    return done >= now && start - now < 36 * 3600_000;
  });
  if (!today.length) return;

  let data;
  try {
    data = await appData(env, app.id);
  } catch {
    return; // ingen AIS nå – prøv igjen neste runde
  }
  const vessels = new Map((data.vessels || []).map((v) => [String(v.mmsi), v]));
  const quays = new Map((config.quays || []).map((q) => [q.id, q]));
  const sent = safe(await setting(env, 'calls_notified', '{}'), {});
  const events = [];

  for (const c of today) {
    const v = vessels.get(String(c.mmsi));
    const q = quays.get(c.quayId);
    if (!v || v.missing || !q) continue;
    const live = etaTo(v, q, now);
    const name = c.name || v.name;
    const done = new Set(sent[c.id] || []);
    const add = (kind, title) => {
      if (done.has(kind)) return;
      done.add(kind);
      events.push({ title, lines: [c.cargo?.length ? cargoText(c.cargo) : null, c.next ? `Neste havn: ${c.next}` : null].filter(Boolean) });
    };
    if (live.state === 'arrived') add('arrived', `${name} har ankommet ${q.name}`);
    else if (live.state === 'eta') {
      const min = Math.round((live.eta.getTime() - now) / 60_000);
      if (min <= 60) add('approaching', `${name} er ventet til ${q.name} om ca. ${Math.max(1, min)} min (kl. ${clockIn(live.eta.getTime(), tz)})`);
      if (hasClock(c.eta) && live.eta.getTime() - zoned(c.eta, tz) > 3600_000) {
        add('late', `${name} er forsinket: ventet kl. ${clockIn(live.eta.getTime(), tz)} til ${q.name}, planlagt ${c.eta.slice(11, 16)}`);
      }
    }
    sent[c.id] = [...done];
  }
  // Rydd bort gamle anløp.
  const ids = new Set(config.calls.map((c) => c.id));
  for (const id of Object.keys(sent)) if (!ids.has(id)) delete sent[id];
  await setSetting(env, 'calls_notified', JSON.stringify(sent));

  const url = `${ORIGIN()}${t.slug}.${BASE()}/admin?view=apps&app=ais`;
  for (const e of events) {
    await sendWebhook(hook, { title: e.title, lines: e.lines, link: { url, label: 'Åpne anløpene i Flatr' } }).catch((err) =>
      console.error(`[notices] anløp-webhook feilet (${t.slug}):`, err.message)
    );
  }
}

/* --------------------------- 2. daglig helsesjekk ------------------------ */

const ownerEmails = (tenantId) =>
  platformDb
    .prepare(`SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = ? AND m.role = 'owner'`)
    .bind(tenantId)
    .allSync()
    .results.map((r) => r.email);

/** Det som bør sjekkes i dag. Tom liste = alt ser bra ut. */
export async function healthIssues(env, tz) {
  const issues = [];
  const now = Date.now();
  const { results: devices } = await env.DB.prepare(
    `SELECT p.*, s.name AS screen_name FROM pairings p LEFT JOIN screens s ON s.id = p.screen_id WHERE p.status = 'paired'`
  ).all();
  for (const d of devices || []) {
    if (!d.last_seen || now - Date.parse(d.last_seen) > 3600_000) {
      issues.push(`TV frakoblet${d.screen_name ? ` (${d.screen_name})` : ''}${d.last_seen ? ` siden ${new Date(d.last_seen).toLocaleString('nb-NO', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' })}` : ''}`);
    }
  }
  const { results: screens } = await env.DB.prepare(
    `SELECT s.name, s.playlist_id, (SELECT COUNT(*) FROM deck_slides d WHERE d.playlist_id = s.playlist_id AND d.enabled = 1) AS slides FROM screens s`
  ).all();
  for (const s of screens || []) {
    if (!s.playlist_id) issues.push(`Skjermen «${s.name}» har ingen presentasjon`);
    else if (!s.slides) issues.push(`Presentasjonen på «${s.name}» har ingen aktive lysbilder`);
  }
  const { results: shots } = await env.DB.prepare(`SELECT url, error FROM web_snapshots WHERE error IS NOT NULL`).all().catch(() => ({ results: [] }));
  if (shots?.length) issues.push(`${shots.length} widget${shots.length === 1 ? '' : 'er'} eller nettside${shots.length === 1 ? '' : 'r'} kunne ikke vises på Apple TV (${shots[0].error.slice(0, 80)})`);

  const ais = await env.DB.prepare(`SELECT id FROM apps WHERE kind = 'ais' LIMIT 1`).first().catch(() => null);
  if (ais) {
    try {
      const data = await appData(env, ais.id);
      if (data.ais_error) issues.push(`NAIS: ${data.ais_error}`);
      else if (data.stale) issues.push('NAIS: får ikke ferske AIS-data fra BarentsWatch (viser siste kjente)');
    } catch (err) {
      issues.push(`NAIS: ${err.message}`);
    }
  }

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  const soon = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(now + 3 * 86_400_000));
  const { results: expiring } = await env.DB.prepare(
    `SELECT d.name, d.active_to_date, p.name AS playlist FROM deck_slides d JOIN playlists p ON p.id = d.playlist_id
      WHERE d.enabled = 1 AND d.active_to_date IS NOT NULL AND d.active_to_date >= ? AND d.active_to_date <= ?`
  )
    .bind(today, soon)
    .all();
  for (const s of expiring || []) issues.push(`Lysbildet «${s.name || 'uten navn'}» i «${s.playlist}» utløper ${s.active_to_date}`);
  return issues;
}

async function digest(t, env, tz, hook) {
  if ((await setting(env, 'daily_digest', '0')) !== '1') return;
  const { date, hour } = localNow(tz);
  if (hour < DIGEST_HOUR || (await setting(env, 'digest_sent', '')) === date) return;
  await setSetting(env, 'digest_sent', date);

  const issues = await healthIssues(env, tz);
  if (!issues.length) return; // ingen nyheter er gode nyheter
  const title = `Helsesjekk for ${t.name}: ${issues.length} ting å se på`;
  const url = `${ORIGIN()}${t.slug}.${BASE()}/admin?view=screens`;
  const to = ownerEmails(t.id);
  if (to.length) {
    await sendMail({
      to,
      subject: title,
      ...buttonMail({ heading: title, intro: issues.map((i) => `• ${i}`).join('\n'), button: 'Åpne Flatr', url, outro: 'Den daglige helsesjekken kan slås av under Skjermer i Flatr.' })
    }).catch((err) => console.error('[notices] e-post feilet:', err.message));
  }
  if (hook) await sendWebhook(hook, { title, lines: issues, link: { url, label: 'Åpne Flatr' } }).catch(() => {});
}

/* ---------------------------------- løkke --------------------------------- */

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    for (const t of platformDb.prepare('SELECT id, slug, name FROM tenants').allSync().results) {
      try {
        const env = tenantResources(t.slug);
        const tz = await getTimezone(env);
        const hook = await setting(env, 'webhook_url', '');
        if (hook) await callNotices(t, env, tz, hook);
        await digest(t, env, tz, hook);
      } catch (err) {
        console.error(`[notices] ${t.slug}:`, err.message);
      }
    }
  } finally {
    running = false;
  }
}

export function startNotices() {
  setTimeout(tick, 30_000).unref();
  setInterval(tick, TICK_MS).unref();
}
