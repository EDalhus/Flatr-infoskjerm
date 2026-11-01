// Driftsstatus for Flatr på status.flatr.no. Kjører hos Cloudflare, helt
// uavhengig av Flatr-serveren: sjekker Flatr hvert minutt (cron), lagrer
// resultatene i D1, viser statussiden og varsler oss på ntfy når noe går ned
// eller får problemer – og når det virker igjen.
//
//   GET /             statussiden (oppdaterer seg selv hvert minutt)
//   GET /api/status   det samme som JSON
//
// Flatr-serveren svarer på /api/health?deep=1 med ja/nei per del (server/health.js).
// Hemmelighet (valgfri): NTFY_TOPIC – ntfy.sh-emnet varslene sendes til.

const COMPONENTS = [
  { id: 'web', name: 'Nettsiden og admin', about: 'flatr.no, innlogging og redigering av innhold' },
  { id: 'screens', name: 'Skjermene', about: 'Visning i nettleser, på Apple TV og på Android TV' },
  { id: 'uploads', name: 'Opplasting og import', about: 'Bilder, video, PDF og PowerPoint' },
  { id: 'email', name: 'E-post', about: 'Invitasjoner, varsler og nytt passord' }
];
const NAME = Object.fromEntries(COMPONENTS.map((c) => [c.id, c.name]));
const SLOW_MS = 4000;
const DOWN_AFTER = 2; // feil på rad før noe regnes som nede (én tilfeldig feil gir ikke alarm)
const DEGRADED_AFTER = 3;
const DAYS = 90;
const INCIDENT_DAYS = 14;
const RANK = { up: 0, degraded: 1, down: 2 };

/* --------------------------------- lagring -------------------------------- */

let schema = null;
function ensureSchema(env) {
  schema ??= env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS state (
      component TEXT PRIMARY KEY, status TEXT NOT NULL, since TEXT NOT NULL,
      fails INTEGER NOT NULL DEFAULT 0, slows INTEGER NOT NULL DEFAULT 0,
      checked_at TEXT NOT NULL, ms INTEGER)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS daily (
      day TEXT NOT NULL, component TEXT NOT NULL,
      checks INTEGER NOT NULL DEFAULT 0, down INTEGER NOT NULL DEFAULT 0,
      degraded INTEGER NOT NULL DEFAULT 0, ms_total INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day, component))`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT, component TEXT NOT NULL, kind TEXT NOT NULL,
      started_at TEXT NOT NULL, ended_at TEXT)`)
  ]).catch((err) => {
    schema = null;
    throw err;
  });
  return schema;
}

// Formaterne lages én gang: siden har hundrevis av datoer, og gratisplanen gir 10 ms CPU per kall.
const TZ = 'Europe/Oslo';
const DAY_FMT = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ });
const CLOCK_FMT = new Intl.DateTimeFormat('nb-NO', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const DATE_FMT = new Intl.DateTimeFormat('nb-NO', { timeZone: TZ, day: 'numeric', month: 'short' });
const PCT_FMT = new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Datoen i norsk tid (dagene på statussiden følger kalenderen her). */
const dayKey = (ms) => DAY_FMT.format(new Date(ms));

/* --------------------------------- sjekker -------------------------------- */

async function timed(url) {
  const start = Date.now();
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'flatr-status (+https://status.flatr.no)' }, signal: AbortSignal.timeout(10_000), cf: { cacheTtl: 0 } });
    const text = await res.text();
    return { ok: res.ok, text, ms: Date.now() - start };
  } catch {
    return { ok: false, text: '', ms: Date.now() - start };
  }
}

const parse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/** Ett resultat per del: up, degraded (tregt eller delvis) eller down. `known` = delene som følges fra før. */
async function runChecks(env, known) {
  const site = env.SITE || 'https://flatr.no';
  const [page, health, screens] = await Promise.all([timed(`${site}/`), timed(`${site}/api/health?deep=1`), timed(env.SCREENS || `${site}/api/health`)]);
  const deep = (health.ok && parse(health.text)?.checks) || {};
  const speed = (ok, ms) => (!ok ? 'down' : ms > SLOW_MS ? 'degraded' : 'up');
  const webMs = Math.max(page.ms, health.ms);
  const out = {
    web: { result: speed(page.ok && page.text.includes('id="root"') && health.ok && deep.database !== false, webMs), ms: webMs },
    screens: { result: speed(screens.ok && parse(screens.text)?.ok === true, screens.ms), ms: screens.ms },
    // Lite plass på disken eller import av dokumenter som ikke svarer: bilder kan fortsatt lastes opp.
    uploads: { result: !health.ok ? 'down' : deep.storage === false || deep.converter === false ? 'degraded' : 'up', ms: health.ms }
  };
  // null = ingen e-post på denne serveren (vises ikke). Svarer ikke serveren, er e-posten nede hvis den fulgtes fra før.
  if (health.ok ? deep.email != null : known.has('email')) out.email = { result: deep.email === true ? 'up' : 'down', ms: health.ms };
  return out;
}

/* ------------------------------ hvert minutt ------------------------------ */

async function tick(env) {
  await ensureSchema(env);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const prev = Object.fromEntries(((await env.DB.prepare('SELECT * FROM state').all()).results || []).map((r) => [r.component, r]));
  const results = await runChecks(env, new Set(Object.keys(prev)));
  const open = Object.fromEntries(((await env.DB.prepare('SELECT * FROM incidents WHERE ended_at IS NULL').all()).results || []).map((r) => [r.component, r]));
  const day = dayKey(now);
  const writes = [];
  const changes = [];

  for (const [id, { result, ms }] of Object.entries(results)) {
    const p = prev[id] || { status: 'up', since: nowIso, fails: 0, slows: 0 };
    const fails = result === 'down' ? p.fails + 1 : 0;
    const slows = result === 'degraded' ? p.slows + 1 : 0;
    let status = p.status;
    if (result === 'up') status = 'up';
    else if (result === 'down' && fails >= DOWN_AFTER) status = 'down';
    else if (result === 'degraded' && (slows >= DEGRADED_AFTER || p.status === 'down')) status = 'degraded';
    const since = status === p.status ? p.since : nowIso;

    writes.push(
      env.DB.prepare(
        `INSERT INTO state (component, status, since, fails, slows, checked_at, ms) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (component) DO UPDATE SET status = excluded.status, since = excluded.since, fails = excluded.fails,
           slows = excluded.slows, checked_at = excluded.checked_at, ms = excluded.ms`
      ).bind(id, status, since, fails, slows, nowIso, ms)
    );
    // Nedetid telles fra første feil, også minuttene før den ble bekreftet.
    const downMinutes = status === 'down' ? (p.status !== 'down' ? Math.min(fails, DOWN_AFTER) : 1) : 0;
    writes.push(
      env.DB.prepare(
        `INSERT INTO daily (day, component, checks, down, degraded, ms_total) VALUES (?, ?, 1, ?, ?, ?)
         ON CONFLICT (day, component) DO UPDATE SET checks = checks + 1, down = down + excluded.down,
           degraded = degraded + excluded.degraded, ms_total = ms_total + excluded.ms_total`
      ).bind(day, id, downMinutes, status === 'degraded' ? 1 : 0, ms)
    );

    if (status === p.status) continue;
    const incident = open[id];
    if (status === 'up') {
      if (incident) writes.push(env.DB.prepare('UPDATE incidents SET ended_at = ? WHERE id = ?').bind(nowIso, incident.id));
      changes.push({ id, status, from: p.status, since: incident?.started_at || p.since });
    } else if (!incident) {
      writes.push(env.DB.prepare('INSERT INTO incidents (component, kind, started_at) VALUES (?, ?, ?)').bind(id, status, nowIso));
      changes.push({ id, status, from: p.status });
    } else if (RANK[status] > RANK[incident.kind]) {
      writes.push(env.DB.prepare('UPDATE incidents SET kind = ? WHERE id = ?').bind(status, incident.id));
      changes.push({ id, status, from: p.status });
    }
  }

  // En del som ikke er i bruk lenger (f.eks. e-post slått av) fjernes fra siden.
  for (const id of Object.keys(prev)) {
    if (results[id]) continue;
    writes.push(env.DB.prepare('DELETE FROM state WHERE component = ?').bind(id));
    writes.push(env.DB.prepare('UPDATE incidents SET ended_at = ? WHERE component = ? AND ended_at IS NULL').bind(nowIso, id));
  }

  // Rydding én gang i timen.
  if (new Date(now).getUTCMinutes() === 0) {
    writes.push(env.DB.prepare('DELETE FROM daily WHERE day < ?').bind(dayKey(now - (DAYS + 10) * 86400_000)));
    writes.push(env.DB.prepare('DELETE FROM incidents WHERE started_at < ?').bind(new Date(now - (DAYS + 10) * 86400_000).toISOString()));
  }
  await env.DB.batch(writes);
  if (changes.length) await alert(env, changes, now);
}

/* --------------------------------- varsler -------------------------------- */

const duration = (ms) => {
  const min = Math.max(1, Math.round(ms / 60_000));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} t ${min % 60} min`;
};

async function alert(env, changes, now) {
  if (!env.NTFY_TOPIC) return;
  const worst = changes.reduce((w, c) => Math.max(w, RANK[c.status]), 0);
  const lines = changes.map((c) =>
    c.status === 'up'
      ? `✅ ${NAME[c.id]} virker igjen (${c.from === 'down' ? 'nede' : 'problemer'} i ${duration(now - Date.parse(c.since))})`
      : c.status === 'down'
        ? `🔴 ${NAME[c.id]} er nede`
        : `🟠 ${NAME[c.id]} har problemer (tregt eller delvis nede)`
  );
  const title = worst === RANK.down ? 'Flatr: noe er nede' : worst === RANK.degraded ? 'Flatr: problemer' : 'Flatr virker igjen';
  await fetch('https://ntfy.sh/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic: env.NTFY_TOPIC,
      title,
      message: lines.join('\n'),
      priority: worst === RANK.down ? 5 : worst === RANK.degraded ? 4 : 3,
      tags: [worst === RANK.down ? 'rotating_light' : worst === RANK.degraded ? 'warning' : 'white_check_mark'],
      click: 'https://status.flatr.no'
    })
  }).catch(() => {});
}

/* ------------------------------- statussiden ------------------------------ */

async function load(env) {
  await ensureSchema(env);
  const now = Date.now();
  const [state, daily, incidents] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM state'),
    env.DB.prepare('SELECT * FROM daily WHERE day >= ?').bind(dayKey(now - (DAYS - 1) * 86400_000)),
    env.DB.prepare('SELECT * FROM incidents WHERE ended_at IS NULL OR started_at >= ? ORDER BY started_at DESC LIMIT 50').bind(new Date(now - INCIDENT_DAYS * 86400_000).toISOString())
  ]);
  const byComponent = Object.fromEntries((state.results || []).map((r) => [r.component, r]));
  const days = [];
  for (let i = DAYS - 1; i >= 0; i--) days.push(dayKey(now - i * 86400_000));

  const components = COMPONENTS.filter((c) => byComponent[c.id] || !Object.keys(byComponent).length).map((c) => {
    const rows = new Map((daily.results || []).filter((r) => r.component === c.id).map((r) => [r.day, r]));
    let checks = 0;
    let down = 0;
    const history = days.map((day) => {
      const r = rows.get(day);
      if (!r) return { day, uptime: null, down_minutes: 0 };
      checks += r.checks;
      down += r.down;
      return { day, uptime: Math.max(0, (1 - r.down / r.checks) * 100), down_minutes: r.down, degraded_minutes: r.degraded };
    });
    const s = byComponent[c.id];
    return { ...c, status: s?.status || 'unknown', since: s?.since || null, uptime_90d: checks ? Math.max(0, (1 - down / checks) * 100) : null, days: history };
  });
  const checkedAt = Object.values(byComponent).reduce((a, r) => (r.checked_at > a ? r.checked_at : a), '');
  const status = components.reduce((w, c) => (c.status === 'unknown' ? w : RANK[c.status] > RANK[w] ? c.status : w), 'up');
  return {
    status: components.every((c) => c.status === 'unknown') ? 'unknown' : status,
    checked_at: checkedAt || null,
    components,
    incidents: (incidents.results || []).map((r) => ({ component: r.component, name: NAME[r.component] || r.component, kind: r.kind, started_at: r.started_at, ended_at: r.ended_at }))
  };
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pct = (v) => (v == null ? '–' : `${v >= 99.995 ? '100' : PCT_FMT.format(v)} %`);
const clock = (iso) => CLOCK_FMT.format(new Date(iso));
const date = (iso) => DATE_FMT.format(new Date(iso));
const LABEL = { up: 'Virker', degraded: 'Problemer', down: 'Nede', unknown: 'Venter på sjekk' };
const HEADLINE = {
  up: 'Alt virker som det skal',
  degraded: 'Noe virker ikke helt som det skal',
  down: 'Noe er nede',
  unknown: 'Venter på første sjekk'
};

function bar(d) {
  const cls = d.uptime == null ? 'none' : d.down_minutes === 0 ? (d.degraded_minutes > 30 ? 'warn' : 'ok') : d.uptime >= 99 ? 'warn' : 'bad';
  const label =
    d.uptime == null
      ? 'Ingen data'
      : d.down_minutes
        ? `${pct(d.uptime)} oppe, nede i ${duration(d.down_minutes * 60_000)}`
        : d.degraded_minutes > 30
          ? `Oppe, men problemer i ${duration(d.degraded_minutes * 60_000)}`
          : 'Ingen nedetid';
  return `<span class="bar ${cls}" title="${esc(`${date(`${d.day}T12:00:00Z`)}: ${label}`)}"></span>`;
}

const ICON = {
  up: '<path d="m7 12.5 3.2 3.2L17 9" />',
  degraded: '<path d="M12 7.5v6M12 16.8v.2" />',
  down: '<path d="M8.5 8.5l7 7M15.5 8.5l-7 7" />',
  unknown: '<path d="M12 8v4l2.5 2" />'
};
const icon = (s) => `<svg viewBox="0 0 24 24" aria-hidden="true" class="icon ${s}"><circle cx="12" cy="12" r="10" />${ICON[s]}</svg>`;
const MARK = `<svg viewBox="8 6 32 37" aria-hidden="true" class="mark"><rect x="11" y="8.5" width="26" height="8.5" rx="4.25"/><rect x="11" y="20" width="17" height="8.5" rx="4.25"/><rect x="11" y="31.5" width="10.5" height="8.5" rx="4.25" transform="rotate(-11 16.25 35.75)"/></svg>`;
const FAVICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="10" fill="#027353"/><rect x="11" y="8.5" width="26" height="8.5" rx="4.25" fill="#fff"/><rect x="11" y="20" width="17" height="8.5" rx="4.25" fill="#fff"/><rect x="11" y="31.5" width="10.5" height="8.5" rx="4.25" fill="#fff" transform="rotate(-11 16.25 35.75)"/></svg>')}`;

function page(data) {
  const s = data.status;
  const rows = data.components
    .map(
      (c) => `
      <li class="component">
        <div class="row">
          <div class="who"><h3>${esc(c.name)}</h3><p>${esc(c.about)}</p></div>
          <span class="pill ${c.status}">${icon(c.status)}${LABEL[c.status]}</span>
        </div>
        <div class="bars" role="img" aria-label="${esc(`${c.name}: ${pct(c.uptime_90d)} oppetid siste ${DAYS} dager`)}">${c.days.map(bar).join('')}</div>
        <div class="axis"><span class="long">${DAYS} dager siden</span><span class="short">45 dager siden</span><span>${pct(c.uptime_90d)} oppetid</span><span>I dag</span></div>
      </li>`
    )
    .join('');
  const incidents = data.incidents.length
    ? data.incidents
        .map(
          (i) => `
      <li class="incident">
        <span class="pill ${i.ended_at ? 'up' : i.kind}">${icon(i.ended_at ? 'up' : i.kind)}${i.ended_at ? 'Løst' : LABEL[i.kind]}</span>
        <div><strong>${esc(i.name)} ${i.kind === 'down' ? 'var nede' : 'hadde problemer'}</strong>
        <p>${date(i.started_at)} kl. ${clock(i.started_at)}${i.ended_at ? `–${clock(i.ended_at)} (${duration(Date.parse(i.ended_at) - Date.parse(i.started_at))})` : ' – pågår'}</p></div>
      </li>`
        )
        .join('')
    : `<li class="empty">Ingen hendelser de siste ${INCIDENT_DAYS} dagene.</li>`;

  return `<!doctype html>
<html lang="nb">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="60">
<title>Driftsstatus – Flatr</title>
<meta name="description" content="Virker Flatr? Status for nettsiden, skjermene, opplasting og e-post, sjekket hvert minutt.">
<link rel="icon" href="${FAVICON}">
<style>
:root{color-scheme:dark;--paper:#0a0b0b;--card:#0f1110;--ink:#ededec;--muted:#8b8e8c;--line:#1f2120;--hair:#1a1c1b;--ok:#4ade9f;--ok-tint:#0f2a1f;--warn:#f5b544;--warn-tint:#2a1f0b;--bad:#f87171;--bad-tint:#331414;--none:#26292a}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.5 Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:760px;margin:0 auto;padding:28px 16px 56px}
a{color:var(--ok)}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:28px}
.brand{display:flex;align-items:center;gap:8px;color:var(--ink);text-decoration:none;font-weight:800;font-size:20px;letter-spacing:-.02em}
.mark{width:22px;height:25px;fill:#027353}
.brand small{font-weight:500;font-size:14px;color:var(--muted);letter-spacing:0;margin-left:4px}
header a.back{font-size:14px;font-weight:600;text-decoration:none}
.banner{display:flex;align-items:center;gap:14px;padding:20px;border-radius:12px;border:1px solid var(--line);background:var(--card)}
.banner.up{background:var(--ok-tint);border-color:#1d4d39}.banner.degraded{background:var(--warn-tint);border-color:#5a4316}.banner.down{background:var(--bad-tint);border-color:#5f2626}
.banner .icon{width:34px;height:34px;flex:none}
.banner h1{margin:0;font-size:22px;line-height:1.2;letter-spacing:-.02em}
.banner p{margin:2px 0 0;color:var(--muted);font-size:14px}
h2{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:36px 0 10px}
ul{list-style:none;margin:0;padding:0}
.card{border:1px solid var(--line);border-radius:12px;background:var(--card)}
.component{padding:18px 20px}
.component+.component,.incident+.incident{border-top:1px solid var(--hair)}
.row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.who{min-width:0}
h3{margin:0;font-size:16px}
.who p,.incident p{margin:2px 0 0;color:var(--muted);font-size:13px}
.pill{display:inline-flex;align-items:center;gap:6px;flex:none;font-size:13px;font-weight:600;border-radius:999px;padding:3px 10px 3px 6px;white-space:nowrap}
.pill .icon{width:16px;height:16px}
.pill.up{color:var(--ok);background:var(--ok-tint)}.pill.degraded{color:var(--warn);background:var(--warn-tint)}.pill.down{color:var(--bad);background:var(--bad-tint)}.pill.unknown{color:var(--muted);background:var(--hair)}
.icon circle{fill:currentColor;opacity:.18}.icon path{fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.banner.up .icon{color:var(--ok)}.banner.degraded .icon{color:var(--warn)}.banner.down .icon{color:var(--bad)}.banner.unknown .icon{color:var(--muted)}
.bars{display:flex;gap:2px;height:30px;margin-top:14px}
.bar{flex:1;min-width:0;border-radius:2px;background:var(--none)}
.bar.ok{background:var(--ok)}.bar.warn{background:var(--warn)}.bar.bad{background:var(--bad)}
.axis{display:flex;justify-content:space-between;gap:8px;margin-top:6px;font-size:12px;color:var(--muted)}
.axis .short{display:none}
.incident{display:flex;gap:12px;align-items:flex-start;padding:14px 20px}
.incident strong{font-size:14px}
.empty{padding:16px 20px;color:var(--muted);font-size:14px}
footer{margin-top:36px;color:var(--muted);font-size:13px}
footer p{margin:0 0 6px}
@media (max-width:560px){.bar:nth-child(-n+45){display:none}.axis .long{display:none}.axis .short{display:inline}.component{padding:16px}.row{flex-direction:column;gap:8px}}
</style>
</head>
<body>
<main>
  <header>
    <a class="brand" href="https://flatr.no">${MARK}flatr<small>Driftsstatus</small></a>
    <a class="back" href="https://flatr.no">Til flatr.no →</a>
  </header>
  <section class="banner ${s}">
    ${icon(s)}
    <div><h1>${HEADLINE[s]}</h1><p>${data.checked_at ? `Sist sjekket kl. ${clock(data.checked_at)}. Sjekkes hvert minutt.` : 'Statussiden har akkurat startet.'}</p></div>
  </section>
  <h2>Deler av Flatr</h2>
  <ul class="card">${rows}</ul>
  <h2>Hendelser</h2>
  <ul class="card">${incidents}</ul>
  <footer>
    <p>Statussiden kjører hos Cloudflare, adskilt fra Flatr-serveren, så den virker også når Flatr ikke gjør det. Vi får varsel med en gang noe går ned.</p>
    <p>For utviklere: <a href="/api/status">/api/status</a> gir det samme som JSON.</p>
  </footer>
</main>
</body>
</html>`;
}

const SECURITY = {
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Metode ikke tillatt', { status: 405, headers: { Allow: 'GET, HEAD' } });
    if (url.pathname !== '/' && url.pathname !== '/api/status') return new Response('Finnes ikke', { status: 404, headers: SECURITY });

    // Mellomlagres i 30 s, så mange besøk under en driftsforstyrrelse ikke tømmer D1-kvoten.
    const cache = caches.default;
    const key = new Request(`${url.origin}${url.pathname}`);
    const hit = await cache.match(key);
    if (hit) return hit;

    const data = await load(env);
    const res =
      url.pathname === '/api/status'
        ? new Response(JSON.stringify(data, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=30', ...SECURITY } })
        : new Response(page(data), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=30', ...SECURITY } });
    ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(tick(env));
  }
};
