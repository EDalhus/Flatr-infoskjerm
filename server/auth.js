// Innlogging med magisk lenke, registrering av nye kunder og teamstyring.
//
// Hoveddomenet (flatr.no):
//   GET  /api/platform/slug?slug=x    – er subdomenet ledig?
//   POST /api/platform/signup         – { org_name, slug, email, name } -> e-post med bekreftelseslenke
//   POST /api/platform/login          – { email } -> e-post med lenke til hver konto brukeren er med i
//   GET  /auth/verify?token=          – fullfører registrering, sender videre til <slug>.flatr.no
//
// Kundens subdomene (<slug>.flatr.no):
//   POST /api/auth/request            – { email } -> magisk lenke (kun for medlemmer)
//   GET  /auth/verify?token=          – logger inn, setter sesjons-cookie
//   POST /api/auth/logout
//   GET/POST/PUT/DELETE /api/team     – medlemmer (endring krever rollen owner)

import {
  platformDb,
  slugProblem,
  createTenant,
  createLoginToken,
  consumeLoginToken,
  createSession,
  deleteSession,
  getMembership,
  tenantsForEmail,
  upsertUser,
  updatePrefs,
  normEmail,
  validEmail,
  SESSION_TTL_MS
} from './platform.js';
import { sendMail, buttonMail, escapeHtml } from './mail.js';

export const SESSION_COOKIE = 'flatr_session';

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
  });
const redirect = (location, headers = {}) =>
  new Response(null, { status: 302, headers: { Location: location, 'Cache-Control': 'no-store', ...headers } });
const readJson = (request) => request.json().catch(() => null);

export function readCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}

function sessionCookie(value, { secure, maxAgeMs }) {
  return [
    `${SESSION_COOKIE}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`
  ]
    .filter(Boolean)
    .join('; ');
}

/* ------------------------------- bremser ------------------------------- */

const buckets = new Map();
/** true hvis nøkkelen har brukt opp kvoten sin i vinduet. */
function limited(key, max, windowMs) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.start > windowMs) {
    buckets.set(key, { start: now, count: 1 });
    return false;
  }
  b.count++;
  return b.count > max;
}
setInterval(() => {
  const cutoff = Date.now() - 3600_000;
  for (const [k, b] of buckets) if (b.start < cutoff) buckets.delete(k);
}, 600_000).unref();

const clientIp = (request) =>
  request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || 'ukjent';

function tooMany(request, email) {
  return (
    limited(`ip:${clientIp(request)}`, 20, 3600_000) || (email && limited(`mail:${email}`, 5, 900_000))
  );
}

/* ---------------------------- hoveddomenet ----------------------------- */

export async function handlePlatformRoute(request, ctx) {
  const url = new URL(request.url);
  const p = url.pathname.replace(/\/+$/, '');

  if (p === '/api/platform/slug' && request.method === 'GET') {
    const slug = String(url.searchParams.get('slug') || '').toLowerCase();
    const problem = slugProblem(slug);
    return json({ slug, available: !problem, reason: problem });
  }

  if (p === '/api/platform/signup' && request.method === 'POST') {
    const b = (await readJson(request)) || {};
    const orgName = String(b.org_name || '').trim().slice(0, 100);
    const slug = String(b.slug || '').trim().toLowerCase();
    const email = normEmail(b.email);
    const name = String(b.name || '').trim().slice(0, 100) || null;

    if (!orgName) return json({ error: 'Skriv inn navnet på organisasjonen.' }, 400);
    if (!validEmail(email)) return json({ error: 'Skriv inn en gyldig e-postadresse.' }, 400);
    const problem = slugProblem(slug);
    if (problem) return json({ error: problem, field: 'slug' }, 409);
    if (tooMany(request, email)) return json({ error: 'For mange forsøk. Prøv igjen senere.' }, 429);

    const token = createLoginToken({
      purpose: 'signup',
      email,
      payload: { org_name: orgName, slug, name },
      ttlMs: 24 * 3600_000
    });
    const link = `${ctx.origin(null)}/auth/verify?token=${token}`;
    await sendMail({
      to: email,
      subject: `Bekreft Flatr-kontoen for ${orgName}`,
      ...buttonMail({
        heading: 'Bekreft e-postadressen din',
        intro: `Klikk på knappen for å opprette ${orgName} på ${slug}.${ctx.baseDomain}. Lenken virker i 24 timer.`,
        button: 'Opprett kontoen',
        url: link,
        outro: 'Har du ikke bedt om dette, kan du se bort fra e-posten.'
      })
    });
    return json({ ok: true });
  }

  if (p === '/api/platform/login' && request.method === 'POST') {
    const b = (await readJson(request)) || {};
    const email = normEmail(b.email);
    if (!validEmail(email)) return json({ error: 'Skriv inn en gyldig e-postadresse.' }, 400);
    if (tooMany(request, email)) return json({ error: 'For mange forsøk. Prøv igjen senere.' }, 429);

    // Svarer alltid ok, så man ikke kan sjekke hvem som har konto.
    const tenants = tenantsForEmail(email);
    if (tenants.length) {
      const links = tenants.map((t) => {
        const token = createLoginToken({ purpose: 'login', email, tenantId: t.id });
        return { name: t.name, host: `${t.slug}.${ctx.baseDomain}`, url: `${ctx.origin(t.slug)}/auth/verify?token=${token}` };
      });
      const mail =
        links.length === 1
          ? buttonMail({
              heading: `Logg inn på ${links[0].name}`,
              intro: `Klikk for å logge inn på ${links[0].host}. Lenken virker i 30 minutter og kan brukes én gang.`,
              button: 'Logg inn',
              url: links[0].url,
              outro: 'Har du ikke bedt om dette, kan du se bort fra e-posten.'
            })
          : {
              text: `Du er med i flere Flatr-kontoer. Velg hvor du vil logge inn (lenkene virker i 30 minutter):\n\n${links
                .map((l) => `${l.name} (${l.host}): ${l.url}`)
                .join('\n')}`,
              html: `<p>Du er med i flere Flatr-kontoer. Velg hvor du vil logge inn (lenkene virker i 30 minutter):</p><ul>${links
                .map((l) => `<li><a href="${escapeHtml(l.url)}">${escapeHtml(l.name)}</a> – ${escapeHtml(l.host)}</li>`)
                .join('')}</ul>`
            };
      await sendMail({ to: email, subject: 'Logg inn på Flatr', ...mail });
    }
    return json({ ok: true });
  }

  if (p === '/auth/verify' && request.method === 'GET') {
    const row = consumeLoginToken(url.searchParams.get('token') || '', 'signup');
    if (!row) return redirect('/signup?error=expired');
    const { org_name, slug, name } = row.payload || {};
    let tenant;
    try {
      ({ tenant } = createTenant({ slug, name: org_name, ownerEmail: row.email, ownerName: name }));
    } catch (err) {
      return redirect(`/signup?error=${err.status === 409 ? 'taken' : 'failed'}`);
    }
    // Sesjonen må settes på kundens eget subdomene – send en ny engangslenke dit.
    const token = createLoginToken({ purpose: 'login', email: row.email, tenantId: tenant.id, ttlMs: 5 * 60_000 });
    return redirect(`${ctx.origin(tenant.slug)}/auth/verify?token=${token}&welcome=1`);
  }

  return null;
}

/* --------------------------- kundens subdomene -------------------------- */

export async function handleTenantAuthRoute(request, ctx) {
  const url = new URL(request.url);
  const p = url.pathname.replace(/\/+$/, '');
  const { tenant } = ctx;

  if (p === '/api/auth/request' && request.method === 'POST') {
    const b = (await readJson(request)) || {};
    const email = normEmail(b.email);
    if (!validEmail(email)) return json({ error: 'Skriv inn en gyldig e-postadresse.' }, 400);
    if (tooMany(request, email)) return json({ error: 'For mange forsøk. Prøv igjen senere.' }, 429);

    if (getMembership(tenant.id, email)) {
      const token = createLoginToken({ purpose: 'login', email, tenantId: tenant.id });
      await sendMail({
        to: email,
        subject: `Logg inn på ${tenant.name} – Flatr`,
        ...buttonMail({
          heading: `Logg inn på ${tenant.name}`,
          intro: 'Klikk på knappen for å logge inn. Lenken virker i 30 minutter og kan brukes én gang.',
          button: 'Logg inn',
          url: `${ctx.origin(tenant.slug)}/auth/verify?token=${token}`,
          outro: 'Har du ikke bedt om dette, kan du se bort fra e-posten.'
        })
      });
    }
    return json({ ok: true });
  }

  if (p === '/auth/verify' && request.method === 'GET') {
    const row = consumeLoginToken(url.searchParams.get('token') || '', 'login');
    if (!row || row.tenant_id !== tenant.id) return redirect('/admin?login=expired');
    const member = getMembership(tenant.id, row.email);
    if (!member) return redirect('/admin?login=expired');
    const sid = createSession(member.user_id, tenant.id);
    const next = url.searchParams.get('welcome') ? '/admin?welcome=1' : '/admin';
    return redirect(next, { 'Set-Cookie': sessionCookie(sid, { secure: ctx.secure, maxAgeMs: SESSION_TTL_MS }) });
  }

  if (p === '/api/auth/logout' && request.method === 'POST') {
    deleteSession(readCookie(request, SESSION_COOKIE));
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', { secure: ctx.secure, maxAgeMs: 0 }) });
  }

  if (p === '/api/team') return handleTeam(request, ctx);

  // PUT /api/prefs { theme } – personlige innstillinger, følger brukeren mellom enheter.
  if (p === '/api/prefs' && request.method === 'PUT') {
    if (!ctx.user) return json({ error: 'Ikke innlogget' }, 401);
    const b = (await readJson(request)) || {};
    const patch = {};
    if (THEMES.includes(b.theme)) patch.theme = b.theme;
    return json(updatePrefs(ctx.user.user_id, patch));
  }

  return null;
}

/* --------------------------------- team --------------------------------- */

const ROLES = ['owner', 'editor'];
const THEMES = ['varm', 'presis'];

function listMembers(tenantId) {
  return platformDb
    .prepare(
      `SELECT u.id AS user_id, u.email, u.name, m.role, m.created_at
         FROM memberships m JOIN users u ON u.id = m.user_id
        WHERE m.tenant_id = ? ORDER BY m.role = 'owner' DESC, u.email`
    )
    .bind(tenantId)
    .allSync().results;
}

const ownerCount = (tenantId) =>
  platformDb
    .prepare(`SELECT COUNT(*) AS c FROM memberships WHERE tenant_id = ? AND role = 'owner'`)
    .bind(tenantId)
    .firstSync('c');

async function handleTeam(request, ctx) {
  const { tenant, user } = ctx;
  if (!user) return json({ error: 'Ikke innlogget' }, 401);

  if (request.method === 'GET') return json(listMembers(tenant.id));
  if (user.role !== 'owner') return json({ error: 'Bare eiere kan endre teamet.' }, 403);

  const url = new URL(request.url);

  if (request.method === 'POST') {
    const b = (await readJson(request)) || {};
    const email = normEmail(b.email);
    const role = ROLES.includes(b.role) ? b.role : 'editor';
    if (!validEmail(email)) return json({ error: 'Skriv inn en gyldig e-postadresse.' }, 400);
    if (getMembership(tenant.id, email)) return json({ error: 'Personen er allerede med i teamet.' }, 409);
    if (tooMany(request, null)) return json({ error: 'For mange forsøk. Prøv igjen senere.' }, 429);

    const invited = upsertUser(email, null);
    platformDb
      .prepare('INSERT INTO memberships (tenant_id, user_id, role) VALUES (?, ?, ?)')
      .bind(tenant.id, invited.id, role)
      .runSync();

    const token = createLoginToken({ purpose: 'login', email, tenantId: tenant.id, ttlMs: 7 * 24 * 3600_000 });
    await sendMail({
      to: email,
      subject: `${user.name || user.email} har invitert deg til ${tenant.name} på Flatr`,
      ...buttonMail({
        heading: `Du er invitert til ${tenant.name}`,
        intro: `${user.name || user.email} har gitt deg tilgang til infoskjermene til ${tenant.name}. Lenken virker i 7 dager – senere logger du inn med e-posten din på ${tenant.slug}.${ctx.baseDomain}.`,
        button: 'Bli med',
        url: `${ctx.origin(tenant.slug)}/auth/verify?token=${token}`
      })
    }).catch(() => {});
    return json(listMembers(tenant.id), 201);
  }

  const targetId = Number.parseInt(url.searchParams.get('user_id'), 10);
  if (!targetId) return json({ error: 'user_id er påkrevd' }, 400);
  const target = platformDb
    .prepare('SELECT role FROM memberships WHERE tenant_id = ? AND user_id = ?')
    .bind(tenant.id, targetId)
    .firstSync();
  if (!target) return json({ error: 'Finner ikke medlemmet.' }, 404);

  // Kontoen skal aldri stå uten eier.
  const lastOwner = target.role === 'owner' && ownerCount(tenant.id) <= 1;

  if (request.method === 'PUT') {
    const b = (await readJson(request)) || {};
    if (!ROLES.includes(b.role)) return json({ error: 'Ugyldig rolle.' }, 400);
    if (lastOwner && b.role !== 'owner') return json({ error: 'Kontoen må ha minst én eier.' }, 409);
    platformDb
      .prepare('UPDATE memberships SET role = ? WHERE tenant_id = ? AND user_id = ?')
      .bind(b.role, tenant.id, targetId)
      .runSync();
    return json(listMembers(tenant.id));
  }

  if (request.method === 'DELETE') {
    if (lastOwner) return json({ error: 'Kontoen må ha minst én eier.' }, 409);
    platformDb.prepare('DELETE FROM memberships WHERE tenant_id = ? AND user_id = ?').bind(tenant.id, targetId).runSync();
    platformDb.prepare('DELETE FROM sessions WHERE tenant_id = ? AND user_id = ?').bind(tenant.id, targetId).runSync();
    return json(listMembers(tenant.id));
  }

  return json({ error: 'Metode ikke tillatt' }, 405);
}
