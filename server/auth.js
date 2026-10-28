// Organisasjoner, invitasjoner og team. Selve innloggingen (passord, økter,
// tofaktor, «glemt passord») gjøres av Better Auth i server/identity.js.
//
// Hoveddomenet (flatr.no):
//   GET  /api/platform/slug?slug=x    – er subdomenet ledig?
//   POST /api/platform/signup         – { org_name, slug, name, email, password } -> bekreftelses-e-post
//                                       (organisasjonen opprettes når e-posten er bekreftet)
//   POST /api/platform/orgs           – { org_name, slug } – innlogget: ny organisasjon
//   GET  /api/platform/me             – innlogget bruker + organisasjonene den er med i
//   GET  /api/orgs (kundens subdomene) – det samme, til «bytt organisasjon» i admin
//   GET  /auth/welcome                – etter e-postbekreftelse: videre til den nye organisasjonen
//
// Kundens subdomene (<slug>.flatr.no):
//   GET  /api/invite?token=           – hvem invitasjonen gjelder
//   POST /api/invite/accept           – { token, name, password } -> passord satt, innlogget
//   GET/POST/PUT/DELETE /api/team     – medlemmer (endring krever rollen owner)

import {
  getTenantById,
  platformDb,
  tenantResources,
  tenantLimits,
  slugProblem,
  createTenant,
  createLoginToken,
  consumeLoginToken,
  peekLoginToken,
  getMembership,
  tenantsForEmail,
  upsertUser,
  updatePrefs,
  normEmail,
  validEmail,
  referralCode,
  referralStats,
  applyReferral,
  REFERRAL_MAX
} from './platform.js';
import { sendMail, buttonMail, escapeHtml } from './mail.js';
import { usage } from '../src/api/_shared.js';
import { userColorPalette } from '../src/api/_access.js';
import { auth, authSession, ensureAuthUser, hasPassword, setPassword, onEmailVerified } from './identity.js';

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
  });
const redirect = (location, headers = {}) =>
  new Response(null, { status: 302, headers: { Location: location, 'Cache-Control': 'no-store', ...headers } });
const readJson = (request) => request.json().catch(() => null);

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

/** Mottakerne av «flere skjermer»- og kontakthenvendelser (plattformeierne). */
const supportInbox = () =>
  String(process.env.SUPERADMIN_EMAILS || '')
    .split(',')
    .map(normEmail)
    .filter(Boolean);

/** E-post til plattformeierne med svar-til satt til den som spør. */
async function notifyOwners({ subject, lines, replyTo }) {
  const to = supportInbox();
  if (!to.length) throw new Error('Ingen mottaker er satt opp. Prøv igjen senere.');
  const text = lines.filter(Boolean).join('\n');
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5">${lines
    .filter(Boolean)
    .map((l) => `<p style="margin:0 0 8px">${escapeHtml(l)}</p>`)
    .join('')}</div>`;
  await sendMail({ to: to.join(','), subject, text, html, replyTo });
}

const passwordProblem = (pw) =>
  typeof pw !== 'string' || pw.length < 10 ? 'Passordet må ha minst 10 tegn.' : pw.length > 128 ? 'Passordet er for langt.' : null;

/** Kopierer Set-Cookie fra et Better Auth-svar over på vårt svar. */
const withCookies = (res, from) => {
  for (const c of from.headers.getSetCookie?.() ?? []) res.headers.append('Set-Cookie', c);
  return res;
};

/* ------------------------- nye organisasjoner -------------------------- */

// Når e-posten er bekreftet: opprett organisasjonen brukeren registrerte seg med.
onEmailVerified(async (user) => {
  const row = platformDb
    .prepare(
      `SELECT * FROM login_tokens WHERE purpose = 'signup' AND email = ? AND used_at IS NULL AND expires_at > ?
        ORDER BY expires_at DESC LIMIT 1`
    )
    .bind(normEmail(user.email), new Date().toISOString())
    .firstSync();
  if (!row) return;
  platformDb.prepare('UPDATE login_tokens SET used_at = ? WHERE token_hash = ?').bind(new Date().toISOString(), row.token_hash).runSync();
  const p = JSON.parse(row.payload || '{}');
  try {
    // Adressen kan ha blitt tatt mens e-posten ventet på bekreftelse: prøv med tall bak.
    let created = null;
    for (let i = 0; i < 20 && !created; i++) {
      try {
        created = createTenant({ slug: i ? `${p.slug}-${i + 1}` : p.slug, name: p.org_name, ownerEmail: user.email, ownerName: p.name });
      } catch (err) {
        if (err.status !== 409) throw err;
      }
    }
    if (!created) throw new Error('fant ingen ledig adresse');
    const { tenant, user: member } = created;
    if (p.ref) applyReferral(tenant.id, p.ref, user.email);
    platformDb
      .prepare('UPDATE users SET terms_accepted_at = COALESCE(terms_accepted_at, ?) WHERE id = ?')
      .bind(p.terms_accepted_at || new Date().toISOString(), member.id)
      .runSync();
  } catch (err) {
    console.warn(`[signup] kunne ikke opprette ${p.slug}: ${err.message}`);
  }
});

function orgsFor(email, ctx) {
  return tenantsForEmail(email).map((t) => ({
    name: t.name,
    slug: t.slug,
    url: `${ctx.origin(t.slug)}/admin`,
    role: getMembership(t.id, email)?.role ?? null
  }));
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

  // Ny bruker + ny organisasjon. Better Auth sender bekreftelses-e-post; selve
  // Invitasjoner på hoveddomenet (nye lenker går hit).
  if (p === '/api/platform/invite' && request.method === 'GET') return inviteInfo(url.searchParams.get('token'), null);
  if (p === '/api/platform/invite/accept' && request.method === 'POST') return acceptInvite(request, null, ctx);

  // organisasjonen opprettes først når adressen er bekreftet (se onEmailVerified).
  if (p === '/api/platform/signup' && request.method === 'POST') {
    const b = (await readJson(request)) || {};
    const orgName = String(b.org_name || '').trim().slice(0, 100);
    const slug = String(b.slug || '').trim().toLowerCase();
    const email = normEmail(b.email);
    const name = String(b.name || '').trim().slice(0, 100) || null;

    if (!orgName) return json({ error: 'Skriv inn navnet på organisasjonen.' }, 400);
    if (b.accept_terms !== true) return json({ error: 'Du må godta vilkårene og personvernerklæringen.' }, 400);
    if (!validEmail(email)) return json({ error: 'Skriv inn en gyldig e-postadresse.' }, 400);
    const pwProblem = passwordProblem(b.password);
    if (pwProblem) return json({ error: pwProblem, field: 'password' }, 400);
    const problem = slugProblem(slug);
    if (problem) return json({ error: problem, field: 'slug' }, 409);
    if (tooMany(request, email)) return json({ error: 'For mange forsøk. Prøv igjen senere.' }, 429);

    if (platformDb.prepare('SELECT 1 FROM auth_user WHERE email = ?').bind(email).firstSync()) {
      return json({ error: 'Du har allerede en Flatr-konto. Logg inn først – så kan du opprette organisasjonen.', code: 'exists' }, 409);
    }

    createLoginToken({
      purpose: 'signup',
      email,
      payload: { org_name: orgName, slug, name, terms_accepted_at: new Date().toISOString(), ref: String(b.ref || '').slice(0, 20) || null },
      ttlMs: 24 * 3600_000
    });
    try {
      await auth.api.signUpEmail({
        body: { email, password: b.password, name: name || email.split('@')[0], callbackURL: `${ctx.origin(null)}/auth/welcome` },
        headers: request.headers
      });
    } catch (err) {
      return json({ error: err?.body?.message || err.message || 'Kunne ikke opprette kontoen.' }, err?.statusCode || 400);
    }
    return json({ ok: true });
  }

  // Innlogget: ny organisasjon med deg som eier.
  if (p === '/api/platform/orgs' && request.method === 'POST') {
    const s = await authSession(request);
    if (!s?.user?.emailVerified) return json({ error: 'Logg inn først.' }, 401);
    const b = (await readJson(request)) || {};
    const orgName = String(b.org_name || '').trim().slice(0, 100);
    const slug = String(b.slug || '').trim().toLowerCase();
    if (!orgName) return json({ error: 'Skriv inn navnet på organisasjonen.' }, 400);
    if (b.accept_terms !== true) return json({ error: 'Du må godta vilkårene og personvernerklæringen.' }, 400);
    const problem = slugProblem(slug);
    if (problem) return json({ error: problem, field: 'slug' }, 409);
    if (tooMany(request, s.user.email)) return json({ error: 'For mange forsøk. Prøv igjen senere.' }, 429);
    try {
      const { tenant } = createTenant({ slug, name: orgName, ownerEmail: s.user.email, ownerName: s.user.name });
      if (b.ref) applyReferral(tenant.id, b.ref, s.user.email);
      return json({ ok: true, url: `${ctx.origin(tenant.slug)}/admin?welcome=1` }, 201);
    } catch (err) {
      return json({ error: err.message }, err.status || 500);
    }
  }

  if (p === '/api/platform/me' && request.method === 'GET') {
    const s = await authSession(request);
    if (!s?.user) return json({ error: 'Ikke innlogget' }, 401);
    return json({
      user: { email: s.user.email, name: s.user.name, twoFactorEnabled: !!s.user.twoFactorEnabled },
      orgs: orgsFor(s.user.email, ctx)
    });
  }

  // Kontaktskjema på flatr.no (f.eks. «trenger flere skjermer»). E-posten går
  // til plattformeierne; ingen adresse vises offentlig.
  if (p === '/api/platform/contact' && request.method === 'POST') {
    const b = (await readJson(request)) || {};
    const email = normEmail(b.email);
    const name = String(b.name || '').trim().slice(0, 100);
    const org = String(b.org || '').trim().slice(0, 100);
    const message = String(b.message || '').trim().slice(0, 3000);
    if (!validEmail(email)) return json({ error: 'Skriv inn en gyldig e-postadresse.' }, 400);
    if (!message) return json({ error: 'Skriv en melding.' }, 400);
    if (b.website) return json({ ok: true }); // fanger enkle roboter (skjult felt)
    if (limited(`contact:${clientIp(request)}`, 3, 3600_000)) return json({ error: 'For mange henvendelser. Prøv igjen senere.' }, 429);
    try {
      await notifyOwners({
        subject: `Henvendelse fra flatr.no${org ? ` – ${org}` : ''}`,
        replyTo: email,
        lines: [`Fra: ${name || '(uten navn)'} <${email}>`, org && `Organisasjon: ${org}`, '', message]
      });
    } catch (err) {
      return json({ error: err.message }, 502);
    }
    return json({ ok: true });
  }

  // Etter e-postbekreftelse (Better Auth har logget inn): rett til organisasjonen.
  if (p === '/auth/welcome' && request.method === 'GET') {
    const s = await authSession(request);
    const orgs = s?.user ? tenantsForEmail(s.user.email) : [];
    if (!orgs.length) return redirect('/login?verified=1');
    const newest = orgs.reduce((a, b) => (a.created_at > b.created_at ? a : b));
    return redirect(`${ctx.origin(newest.slug)}/admin?welcome=1`);
  }

  return null;
}

/* ------------------------------ invitasjoner ----------------------------- */
// Brukes både på flatr.no/invite (nye lenker: passordet lagres på hoveddomenet,
// som all annen innlogging) og på kundens adresse (eldre lenker). tenant = null:
// organisasjonen leses fra invitasjonen.

function inviteTenant(token, tenant) {
  const row = peekLoginToken(String(token || ''), 'invite');
  if (!row) return { row: null };
  if (tenant) return { row: row.tenant_id === tenant.id ? row : null, tenant };
  return { row, tenant: getTenantById(row.tenant_id) };
}

function inviteInfo(token, only) {
  const { row, tenant } = inviteTenant(token, only);
  if (!row || !tenant) return json({ error: 'Invitasjonen er utløpt eller allerede brukt.' }, 410);
  const member = getMembership(tenant.id, row.email);
  const name = member?.name && member.name !== row.email.split('@')[0] ? member.name : '';
  return json({ email: row.email, name, org: tenant.name, needs_password: !hasPassword(row.email) });
}

/** Godta invitasjonen: velg passord (første gang) og bli logget inn. */
async function acceptInvite(request, only, ctx) {
  const b = (await readJson(request)) || {};
  if (tooMany(request, null)) return json({ error: 'For mange forsøk. Prøv igjen senere.' }, 429);
  const { row: peek, tenant } = inviteTenant(b.token, only);
  if (!peek || !tenant) return json({ error: 'Invitasjonen er utløpt eller allerede brukt.' }, 410);
  if (!getMembership(tenant.id, peek.email)) return json({ error: 'Invitasjonen er trukket tilbake.' }, 410);
  const adminUrl = `${ctx.origin(tenant.slug)}/admin`;
  if (hasPassword(peek.email)) {
    // Har allerede passord (f.eks. med i en annen organisasjon) – bare logg inn som vanlig.
    consumeLoginToken(String(b.token), 'invite');
    return json({ ok: true, login: true, redirect: adminUrl });
  }
  const pwProblem = passwordProblem(b.password);
  if (pwProblem) return json({ error: pwProblem }, 400);
  if (!consumeLoginToken(String(b.token), 'invite')) return json({ error: 'Invitasjonen er utløpt eller allerede brukt.' }, 410);

  const name = String(b.name || '').trim().slice(0, 100);
  await ensureAuthUser(peek.email, name);
  await setPassword(peek.email, b.password);
  if (name) {
    platformDb.prepare('UPDATE auth_user SET name = ? WHERE email = ?').bind(name, peek.email).runSync();
    platformDb.prepare('UPDATE users SET name = ? WHERE email = ?').bind(name, peek.email).runSync();
  }
  const signIn = await auth.api.signInEmail({ body: { email: peek.email, password: b.password }, headers: request.headers, asResponse: true });
  return withCookies(json({ ok: true, redirect: `${adminUrl}?welcome=1` }), signIn);
}

/* --------------------------- kundens subdomene -------------------------- */

export async function handleTenantAuthRoute(request, ctx) {
  const url = new URL(request.url);
  const p = url.pathname.replace(/\/+$/, '');
  const { tenant } = ctx;

  // Organisasjonene innlogget bruker er med i (bytt organisasjon i brukermenyen).
  if (p === '/api/orgs' && request.method === 'GET') {
    const s = await authSession(request);
    if (!s?.user) return json({ error: 'Ikke innlogget' }, 401);
    return json({ current: tenant.slug, orgs: orgsFor(s.user.email, ctx) });
  }

  // Invitasjon: vis hvem den gjelder / godta den (se inviteInfo og acceptInvite).
  if (p === '/api/invite' && request.method === 'GET') return inviteInfo(url.searchParams.get('token'), tenant);
  if (p === '/api/invite/accept' && request.method === 'POST') return acceptInvite(request, tenant, ctx);

  // Planen: bruk og grenser (vises på Skjermer-siden).
  if (p === '/api/plan' && request.method === 'GET') {
    if (!ctx.user) return json({ error: 'Ikke innlogget' }, 401);
    const L = tenantLimits(tenant);
    const u = await usage(tenantResources(tenant.slug));
    return json({ screens: { used: u.screens, limit: L.screens }, storage: { used: u.storageBytes, limit: L.storageBytes }, video: L.video });
  }

  // «Be om flere skjermer» – e-post til plattformeierne med svar-til brukeren.
  if (p === '/api/plan/request' && request.method === 'POST') {
    if (!ctx.user) return json({ error: 'Ikke innlogget' }, 401);
    if (limited(`plan:${tenant.id}`, 3, 24 * 3600_000)) return json({ error: 'Du har allerede sendt en forespørsel i dag. Vi svarer så fort vi kan.' }, 429);
    const b = (await readJson(request)) || {};
    const extra = Math.min(50, Math.max(1, Number.parseInt(b.extra, 10) || 1));
    const message = String(b.message || '').trim().slice(0, 2000);
    const L = tenantLimits(tenant);
    const u = await usage(tenantResources(tenant.slug));
    try {
      await notifyOwners({
        subject: `Flere skjermer: ${tenant.name} (${tenant.slug}) ber om ${extra} til`,
        replyTo: ctx.user.email,
        lines: [
          `${ctx.user.name || ctx.user.email} <${ctx.user.email}> i ${tenant.name} ber om ${extra} ${extra === 1 ? 'skjerm' : 'skjermer'} til.`,
          `Bruker nå ${u.screens} av ${L.screens} ${L.screens === 1 ? 'skjerm' : 'skjermer'}.`,
          message && '',
          message && `Melding: ${message}`,
          '',
          `Øk grensen i superadmin: ${ctx.origin(null)}/superadmin`
        ]
      });
    } catch (err) {
      return json({ error: err.message }, 502);
    }
    return json({ ok: true });
  }

  if (p === '/api/team') return handleTeam(request, ctx);

  // Henvisningsprogrammet: lenken og hvor mange ekstra skjermer den har gitt.
  if (p === '/api/referral' && request.method === 'GET') {
    if (!ctx.user) return json({ error: 'Ikke innlogget' }, 401);
    const stats = referralStats(ctx.tenant.id);
    return json({ url: `${ctx.origin(null)}/?ref=${referralCode(ctx.tenant.id)}`, ...stats, max: REFERRAL_MAX });
  }

  // PUT /api/prefs { theme } – personlige innstillinger, følger brukeren mellom enheter.
  if (p === '/api/prefs' && request.method === 'PUT') {
    if (!ctx.user) return json({ error: 'Ikke innlogget' }, 401);
    const b = (await readJson(request)) || {};
    const patch = {};
    if (THEMES.includes(b.theme)) patch.theme = b.theme;
    if (userColorPalette().includes(b.color)) patch.color = b.color;
    return json(updatePrefs(ctx.user.user_id, patch));
  }

  return null;
}

/* --------------------------------- team --------------------------------- */

const ROLES = ['owner', 'editor', 'viewer'];
const THEMES = ['presis'];

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
    await ensureAuthUser(email, null);

    // Ny bruker: lenke for å velge passord (7 dager). Har passord fra før: bare beskjed.
    const from = user.name || user.email;
    const newUser = !hasPassword(email);
    const token = newUser ? createLoginToken({ purpose: 'invite', email, tenantId: tenant.id, ttlMs: 7 * 24 * 3600_000 }) : null;
    await sendMail({
      to: email,
      subject: `${from} har invitert deg til ${tenant.name} på Flatr`,
      ...buttonMail({
        heading: `Du er invitert til ${tenant.name}`,
        intro: newUser
          ? `${from} har gitt deg tilgang til infoskjermene til ${tenant.name}. Klikk for å velge passord – lenken virker i 7 dager.`
          : `${from} har gitt deg tilgang til infoskjermene til ${tenant.name}. Logg inn med e-posten og passordet ditt.`,
        button: newUser ? 'Velg passord og bli med' : `Åpne ${tenant.name}`,
        // Passordet velges på flatr.no (der all innlogging skjer), så passordbehandlere har én adresse.
        url: newUser ? `${ctx.origin('')}/invite?token=${token}` : `${ctx.origin(tenant.slug)}/admin`
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
    // Tilgangen sjekkes mot medlemskapet ved hver forespørsel, så den forsvinner med en gang.
    platformDb.prepare('DELETE FROM sessions WHERE tenant_id = ? AND user_id = ?').bind(tenant.id, targetId).runSync();
    return json(listMembers(tenant.id));
  }

  return json({ error: 'Metode ikke tillatt' }, 405);
}
