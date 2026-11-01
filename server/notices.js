// Varsler som ikke handler om én TV (kjøres hvert 5. minutt for alle kontoer):
//
//  1. Anløp (NAIS → Anløp, «Varsle i Slack/Teams»): når en båt i dagens
//     anløpsliste nærmer seg kaia (under 60 min), ankommer, eller er forsinket
//     mer enn en time mot planlagt klokkeslett. Hvert varsel sendes én gang.
//  2. Daglig helsesjekk kl. 07 (innstillingen daily_digest = '1'): frakoblede
//     TV-er, skjermer uten innhold, widgeter som feiler, NAIS-feil og
//     lysbilder som utløper – til eierne på e-post og til Slack/Teams.
//  3. Ukentlig påminnelse mandag fra kl. 08 (weekly_reminder, på som standard):
//     skjermer som har vist det samme lenge, lysbilder som går ut på dato eller
//     allerede har gjort det, og presentasjoner som venter på godkjenning –
//     til eiere og redaktører. Sendes bare når noe bør gjøres.

import { platformDb, tenantResources, orgLang } from './platform.js';
import { getTimezone } from '../src/api/_shared.js';
import { appData } from '../src/api/apps.js';
import { etaTo } from '../src/lib/ais.js';
import { hasClock, cargoText } from '../src/lib/portCalls.js';
import { sendWebhook } from '../src/lib/webhook.js';
import { sendMailTo, buttonMail } from './mail.js';
import { withLang, currentLang, translateMessage } from './i18n.js';
import { tr, locale } from '../src/lib/i18n.js';

const TICK_MS = 5 * 60_000;
const DIGEST_HOUR = 7;
const WEEKLY_HOUR = 8;
const STALE_DAYS = 30;
// Lysbilder med disse elementene viser ferske data av seg selv (vær, nyheter, apper …).
const LIVE_KINDS = ['weather', 'rss', 'calendar', 'app', 'program', 'carousel', 'web', 'countdown'];

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

const clockIn = (ms, tz) => new Date(ms).toLocaleTimeString(locale(), { timeZone: tz, hour: '2-digit', minute: '2-digit' });

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
      events.push({ title, lines: [c.cargo?.length ? cargoText(c.cargo) : null, c.next ? tr('Neste havn: {0}', [c.next]) : null].filter(Boolean) });
    };
    if (live.state === 'arrived') add('arrived', tr('{0} har ankommet {1}', [name, q.name]));
    else if (live.state === 'eta') {
      const min = Math.round((live.eta.getTime() - now) / 60_000);
      if (min <= 60) add('approaching', tr('{0} er ventet til {1} om ca. {2} min (kl. {3})', [name, q.name, Math.max(1, min), clockIn(live.eta.getTime(), tz)]));
      if (hasClock(c.eta) && live.eta.getTime() - zoned(c.eta, tz) > 3600_000) {
        add('late', tr('{0} er forsinket: ventet kl. {1} til {2}, planlagt {3}', [name, clockIn(live.eta.getTime(), tz), q.name, c.eta.slice(11, 16)]));
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
    await sendWebhook(hook, { title: e.title, lines: e.lines, link: { url, label: tr('Åpne anløpene i Flatr') } }).catch((err) =>
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

/** Det som bør sjekkes i dag (på språket som er satt med withLang). Tom liste = alt ser bra ut. */
export async function healthIssues(env, tz) {
  const issues = [];
  const now = Date.now();
  const { results: devices } = await env.DB.prepare(
    `SELECT p.*, s.name AS screen_name FROM pairings p LEFT JOIN screens s ON s.id = p.screen_id WHERE p.status = 'paired'`
  ).all();
  for (const d of devices || []) {
    const where = d.screen_name ? ` (${d.screen_name})` : '';
    if (!d.last_seen || now - Date.parse(d.last_seen) > 3600_000) {
      issues.push(
        d.last_seen
          ? tr('TV frakoblet{0} siden {1}', [where, new Date(d.last_seen).toLocaleString(locale(), { timeZone: tz, dateStyle: 'short', timeStyle: 'short' })])
          : tr('TV frakoblet{0}', [where])
      );
      continue;
    }
    // Det TV-appen selv melder (client_info fra status-pollen).
    let ci = {};
    try {
      ci = JSON.parse(d.client_info || '{}');
    } catch {
      /* ingen info */
    }
    if (ci.storage_pct >= 90) issues.push(tr('Lagringen på TV-en{0} er nesten full ({1} %)', [where, ci.storage_pct]));
    if (ci.content_at && now - Date.parse(ci.content_at) > 3 * 3600_000) issues.push(tr('TV-en{0} har ikke fått nytt innhold på over tre timer', [where]));
    if (ci.restarts >= 3) issues.push(tr('Visningen på TV-en{0} har startet seg selv på nytt {1} ganger', [where, ci.restarts]));
  }
  const { results: screens } = await env.DB.prepare(
    `SELECT s.name, s.playlist_id, (SELECT COUNT(*) FROM deck_slides d WHERE d.playlist_id = s.playlist_id AND d.enabled = 1 AND d.layer IS NULL) AS slides FROM screens s`
  ).all();
  for (const s of screens || []) {
    if (!s.playlist_id) issues.push(tr('Skjermen «{0}» har ingen presentasjon', [s.name]));
    else if (!s.slides) issues.push(tr('Presentasjonen på «{0}» har ingen aktive lysbilder', [s.name]));
  }
  const { results: shots } = await env.DB.prepare(`SELECT url, error FROM web_snapshots WHERE error IS NOT NULL`).all().catch(() => ({ results: [] }));
  if (shots?.length) {
    const why = translateMessage(currentLang(), shots[0].error.slice(0, 80));
    issues.push(
      shots.length === 1
        ? tr('1 widget eller nettside kunne ikke vises på Apple TV ({0})', [why])
        : tr('{0} widgeter eller nettsider kunne ikke vises på Apple TV ({1})', [shots.length, why])
    );
  }

  const ais = await env.DB.prepare(`SELECT id FROM apps WHERE kind = 'ais' LIMIT 1`).first().catch(() => null);
  if (ais) {
    try {
      const data = await appData(env, ais.id);
      if (data.ais_error) issues.push(`NAIS: ${translateMessage(currentLang(), data.ais_error)}`);
      else if (data.stale) issues.push(tr('NAIS: får ikke ferske AIS-data fra BarentsWatch (viser siste kjente)'));
    } catch (err) {
      issues.push(`NAIS: ${translateMessage(currentLang(), err.message)}`);
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
  for (const s of expiring || []) issues.push(tr('Lysbildet «{0}» i «{1}» utløper {2}', [s.name || tr('uten navn'), s.playlist, s.active_to_date]));
  return issues;
}

async function digest(t, env, tz, hook) {
  if ((await setting(env, 'daily_digest', '0')) !== '1') return;
  const { date, hour } = localNow(tz);
  if (hour < DIGEST_HOUR || (await setting(env, 'digest_sent', '')) === date) return;
  await setSetting(env, 'digest_sent', date);

  if (!(await healthIssues(env, tz)).length) return; // ingen nyheter er gode nyheter
  const url = `${ORIGIN()}${t.slug}.${BASE()}/admin?view=screens`;
  // Lages på hver eiers språk (e-post) og kontoens språk (Slack/Teams).
  const report = async () => {
    const issues = await healthIssues(env, tz);
    return { issues, title: tr('Helsesjekk for {0}: {1} ting å se på', [t.name, issues.length]) };
  };
  const to = ownerEmails(t.id);
  if (to.length) {
    await sendMailTo(to, async () => {
      const { issues, title } = await report();
      return {
        subject: title,
        ...buttonMail({ heading: title, intro: issues.map((i) => `• ${i}`).join('\n'), button: tr('Åpne Flatr'), url, outro: tr('Den daglige helsesjekken kan slås av under Skjermer i Flatr.') })
      };
    }).catch((err) => console.error('[notices] e-post feilet:', err.message));
  }
  if (hook) {
    const { issues, title, label } = await withLang(orgLang(t.id), async () => ({ ...(await report()), label: tr('Åpne Flatr') }));
    await sendWebhook(hook, { title, lines: issues, link: { url, label } }).catch(() => {});
  }
}

/* -------------------------- ukentlig påminnelse --------------------------- */

const editorEmails = (tenantId) =>
  platformDb
    .prepare(`SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = ? AND m.role IN ('owner', 'editor')`)
    .bind(tenantId)
    .allSync()
    .results.map((r) => r.email);

/** ISO-uke («2026-W45») for en lokal dato "YYYY-MM-DD". */
export function isoWeek(date) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const week = Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const days = (ms) => Math.floor(ms / 86_400_000);

/** Det som bør gjøres denne uka (på språket som er satt med withLang). Tom liste = ingenting å si fra om. */
export async function weeklyItems(env, tz) {
  const items = [];
  const now = Date.now();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  const inWeek = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(now + 7 * 86_400_000));
  const fmt = (iso) => new Date(iso).toLocaleDateString(locale(), { timeZone: tz, day: 'numeric', month: 'long' });

  // 1. Skjermer i bruk (sett siste uka) som har vist samme presentasjon uendret lenge.
  //    Presentasjoner der minst halvparten av lysbildene har ferske data (vær, apper …) teller ikke.
  const weekAgo = new Date(now - 7 * 86_400_000).toISOString();
  const { results: screens } = await env.DB.prepare(
    `SELECT s.id, s.name, s.playlist_id, p.name AS playlist, p.created_at,
            (SELECT MAX(v.created_at) FROM playlist_versions v WHERE v.playlist_id = s.playlist_id) AS changed_at
       FROM screens s JOIN playlists p ON p.id = s.playlist_id
      WHERE s.last_seen > ? OR EXISTS (SELECT 1 FROM pairings d WHERE d.screen_id = s.id AND d.status = 'paired' AND d.last_seen > ?)`
  )
    .bind(weekAgo, weekAgo)
    .all()
    .catch(() => ({ results: [] }));
  const live = new Map(); // playlist_id -> har mest ferske data
  for (const s of screens || []) {
    const changed = Date.parse(s.changed_at || s.created_at);
    if (!Number.isFinite(changed) || now - changed < STALE_DAYS * 86_400_000) continue;
    if (!live.has(s.playlist_id)) {
      const row = await env.DB.prepare(
        `SELECT COUNT(*) AS total,
                SUM(EXISTS (SELECT 1 FROM deck_elements e WHERE e.slide_id = d.id AND e.kind IN (${LIVE_KINDS.map(() => '?').join(',')}))) AS fresh
           FROM deck_slides d WHERE d.playlist_id = ? AND d.enabled = 1 AND d.layer IS NULL`
      )
        .bind(...LIVE_KINDS, s.playlist_id)
        .first();
      live.set(s.playlist_id, !row?.total || (row.fresh || 0) * 2 >= row.total);
    }
    if (live.get(s.playlist_id)) continue;
    items.push(tr('«{0}» har vist «{1}» uendret i {2} dager. Noe nytt å fortelle?', [s.name, s.playlist, days(now - changed)]));
  }

  // 2. Lysbilder som går ut på dato denne uka, og utløpte som fortsatt ligger i presentasjonene.
  const { results: expiring } = await env.DB.prepare(
    `SELECT d.name, d.active_to_date, p.name AS playlist FROM deck_slides d JOIN playlists p ON p.id = d.playlist_id
      WHERE d.enabled = 1 AND d.active_to_date IS NOT NULL AND d.active_to_date >= ? AND d.active_to_date <= ?
      ORDER BY d.active_to_date`
  )
    .bind(today, inWeek)
    .all()
    .catch(() => ({ results: [] }));
  for (const d of expiring || []) items.push(tr('Lysbildet «{0}» i «{1}» går ut på dato {2}.', [d.name || tr('uten navn'), d.playlist, fmt(d.active_to_date)]));
  const { results: expired } = await env.DB.prepare(
    `SELECT p.name AS playlist, COUNT(*) AS n FROM deck_slides d JOIN playlists p ON p.id = d.playlist_id
      WHERE d.enabled = 1 AND d.active_to_date IS NOT NULL AND d.active_to_date < ? GROUP BY p.id ORDER BY n DESC`
  )
    .bind(today)
    .all()
    .catch(() => ({ results: [] }));
  for (const e of expired || [])
    items.push(
      e.n === 1
        ? tr('Ett lysbilde i «{0}» har gått ut på dato og vises ikke lenger. Slett det eller gi ny dato.', [e.playlist])
        : tr('{0} lysbilder i «{1}» har gått ut på dato og vises ikke lenger. Slett dem eller gi ny dato.', [e.n, e.playlist])
    );

  // 3. Presentasjoner som har ventet på godkjenning i mer enn et døgn.
  const { results: waiting } = await env.DB.prepare(
    `SELECT name, review_requested_at, review_requested_by FROM playlists WHERE review_requested_at IS NOT NULL AND review_requested_at < ?`
  )
    .bind(new Date(now - 86_400_000).toISOString())
    .all()
    .catch(() => ({ results: [] }));
  for (const w of waiting || [])
    items.push(
      w.review_requested_by
        ? tr('«{0}» har ventet på godkjenning siden {1} (sendt av {2}).', [w.name, fmt(w.review_requested_at), w.review_requested_by])
        : tr('«{0}» har ventet på godkjenning siden {1}.', [w.name, fmt(w.review_requested_at)])
    );

  // 4. TV-er som har vært borte i mer enn et døgn.
  const { results: gone } = await env.DB.prepare(
    `SELECT p.label, p.last_seen, s.name AS screen_name FROM pairings p LEFT JOIN screens s ON s.id = p.screen_id
      WHERE p.status = 'paired' AND p.last_seen IS NOT NULL AND p.last_seen < ?`
  )
    .bind(new Date(now - 86_400_000).toISOString())
    .all()
    .catch(() => ({ results: [] }));
  for (const d of gone || [])
    items.push(d.screen_name ? tr('TV-en på «{0}» har vært frakoblet siden {1}.', [d.screen_name, fmt(d.last_seen)]) : tr('TV-en har vært frakoblet siden {0}.', [fmt(d.last_seen)]));

  return items;
}

async function weekly(t, env, tz) {
  if ((await setting(env, 'weekly_reminder', '1')) === '0') return;
  const { date, hour } = localNow(tz);
  const weekday = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short' }).format(new Date());
  // Mandag fra kl. 08 (tirsdag eller onsdag hvis serveren var nede på mandag).
  if (!['Mon', 'Tue', 'Wed'].includes(weekday) || (weekday === 'Mon' && hour < WEEKLY_HOUR)) return;
  const week = isoWeek(date);
  if ((await setting(env, 'weekly_sent', '')) === week) return;
  await setSetting(env, 'weekly_sent', week);

  if (!(await weeklyItems(env, tz)).length) return;
  const to = editorEmails(t.id);
  if (!to.length) return;
  // Lages på hver mottakers språk.
  await sendMailTo(to, async () => {
    const items = await weeklyItems(env, tz);
    return {
      subject:
        items.length === 1 ? tr('Ukens påminnelse for {0}: én ting å se på', [t.name]) : tr('Ukens påminnelse for {0}: {1} ting å se på', [t.name, items.length]),
      ...buttonMail({
        heading: tr('Hold skjermene ferske'),
        intro: items.map((i) => `• ${i}`).join('\n'),
        button: tr('Åpne Flatr'),
        url: `${ORIGIN()}${t.slug}.${BASE()}/admin`,
        outro: tr('Skjermer med nytt innhold blir lagt merke til. Påminnelsen kan slås av under Skjermer i Flatr.')
      })
    };
  }).catch((err) => console.error('[notices] ukentlig e-post feilet:', err.message));
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
        // Anløpsvarslene går bare til Slack/Teams: på kontoens språk.
        if (hook) await withLang(orgLang(t.id), () => callNotices(t, env, tz, hook));
        await digest(t, env, tz, hook);
        await weekly(t, env, tz);
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
