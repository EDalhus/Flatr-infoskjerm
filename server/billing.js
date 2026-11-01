// Abonnement med Stripe: Pro og Lag og frivillige, per skjerm, med ekstra
// lagring, månedlig eller årlig (kort), og årlig med faktura. Prisene står i
// src/lib/pricing.js; produktene i Stripe lages av server/billing-setup.js.
//
// Kundens adresse (<slug>.flatr.no), bare eiere kan endre:
//   GET  /api/billing                 planen, bruken og hva som kan velges
//   GET  /api/billing/org?number=     oppslag i Enhetsregisteret (+ Frivillighetsregisteret)
//   POST /api/billing/checkout        { plan, screens, storage_gb, interval, org_number, email, invoice }
//                                     -> { url } (Stripe Checkout) eller { ok } (faktura)
//   POST /api/billing/sync            { session_id } – tilbake fra Checkout
//   POST /api/billing/change          { plan, screens, storage_gb, interval }
//   POST /api/billing/portal          -> { url } kort, kvitteringer og oppsigelse hos Stripe
// Hoveddomenet:
//   POST /api/billing/webhook         hendelser fra Stripe (signert)

import { platformDb, getTenantById, tenantLimits, paidPlan, tenantResources } from './platform.js';
import { stripe, stripeAll, stripeEnabled, verifyWebhook } from './stripe.js';
import { ensureCatalog } from './billing-setup.js';
import { sendMailTo, buttonMail } from './mail.js';
import { tr } from '../src/lib/i18n.js';
import { PLANS, STORAGE_ADDONS, validOrgNumber } from '../src/lib/pricing.js';
import { usage } from '../src/api/_shared.js';
import { logActivity } from '../src/api/activity.js';

const PLAN_KEY = /^flatr_(pro|club)_(month|year)$/;
const STORAGE_KEY = /^flatr_storage_(\d+)_(month|year)$/;
const vatOn = () => process.env.BILLING_VAT !== 'false';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const fail = (status, error, extra = {}) => json({ error, ...extra }, status);
const readJson = (request) => request.json().catch(() => null);

/* ------------------------------- Stripe-oppsett ------------------------------ */

let catalog = null; // { at, prices: Map(lookup_key -> id), taxRate, portal }

async function getCatalog() {
  if (catalog && Date.now() - catalog.at < 10 * 60_000) return catalog;
  const { taxRate, portal } = await ensureCatalog();
  const keys = [];
  for (const i of ['month', 'year']) {
    for (const id of Object.keys(PLANS)) keys.push(`flatr_${id}_${i}`);
    for (const [gb] of STORAGE_ADDONS) keys.push(`flatr_storage_${gb}_${i}`);
  }
  const prices = await stripeAll('prices', { active: true, lookup_keys: keys });
  catalog = { at: Date.now(), prices: new Map(prices.map((p) => [p.lookup_key, p.id])), taxRate, portal };
  return catalog;
}

/** Linjene i abonnementet: skjermer på planen, og ekstra lagring hvis valgt. */
async function lineItems({ plan, screens, storageGb, interval }) {
  const c = await getCatalog();
  const items = [{ price: c.prices.get(`flatr_${plan}_${interval}`), quantity: screens }];
  if (storageGb) items.push({ price: c.prices.get(`flatr_storage_${storageGb}_${interval}`), quantity: 1 });
  if (items.some((i) => !i.price)) throw Object.assign(new Error('Prisene mangler i Stripe. Kjør node server/billing-setup.js.'), { status: 500 });
  return items;
}

/* ------------------------- Enhetsregisteret (Brreg) -------------------------- */

const orgCache = new Map(); // nummer -> { at, org }

async function brreg(kind, number) {
  const res = await fetch(`https://data.brreg.no/enhetsregisteret/api/${kind}/${number}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000)
  });
  if (res.status === 404 || res.status === 410) return null;
  if (!res.ok) throw Object.assign(new Error('Brønnøysundregistrene svarer ikke akkurat nå. Prøv igjen om litt.'), { status: 502 });
  return res.json();
}

/**
 * Slår opp et organisasjonsnummer. Underenheter (f.eks. en avdeling) får
 * Frivillighetsregisteret og mva fra hovedenheten.
 */
export async function lookupOrg(value) {
  const number = String(value ?? '').replace(/\s/g, '');
  if (!validOrgNumber(number)) throw Object.assign(new Error('Organisasjonsnummeret er ikke gyldig. Sjekk at alle de 9 sifrene er riktige.'), { status: 400 });
  const hit = orgCache.get(number);
  if (hit && Date.now() - hit.at < 3600_000) return hit.org;
  let unit = await brreg('enheter', number);
  let main = unit;
  if (!unit) {
    unit = await brreg('underenheter', number);
    main = unit?.overordnetEnhet ? await brreg('enheter', unit.overordnetEnhet) : null;
  }
  if (!unit || !main) throw Object.assign(new Error('Fant ingen organisasjon med det nummeret i Enhetsregisteret.'), { status: 404 });
  if (unit.slettedato || main.slettedato) throw Object.assign(new Error('Organisasjonen er slettet fra Enhetsregisteret.'), { status: 404 });
  const a = unit.forretningsadresse || unit.beliggenhetsadresse || unit.postadresse || null;
  const org = {
    number,
    name: unit.navn,
    form: unit.organisasjonsform?.beskrivelse || null,
    address: a && {
      line1: a.adresse?.[0] || '',
      line2: a.adresse?.slice(1).join(', ') || undefined,
      postal_code: a.postnummer || '',
      city: a.poststed || '',
      country: a.landkode || 'NO'
    },
    volunteer: !!main.registrertIFrivillighetsregisteret,
    vat_registered: !!main.registrertIMvaregisteret,
    active: !(main.konkurs || main.underAvvikling || main.underTvangsavviklingEllerTvangsopplosning)
  };
  orgCache.set(number, { at: Date.now(), org });
  return org;
}

/* ------------------------------ synk fra Stripe ------------------------------ */

const iso = (unix) => (unix ? new Date(unix * 1000).toISOString() : null);

/** Lagrer abonnementet på kunden. Gir kunden (tenant) eller null. */
export function syncSubscription(sub) {
  const tenant =
    getTenantById(Number(sub.metadata?.tenant_id)) ||
    platformDb.prepare('SELECT * FROM tenants WHERE stripe_customer_id = ?').bind(sub.customer).firstSync();
  if (!tenant) return null;
  // Et gammelt, avsluttet abonnement skal ikke overskrive et nytt som gjelder.
  const live = ['active', 'trialing', 'past_due'];
  if (tenant.stripe_subscription_id && tenant.stripe_subscription_id !== sub.id && live.includes(tenant.subscription_status) && !live.includes(sub.status)) return tenant;

  const items = sub.items?.data || [];
  const planItem = items.find((i) => PLAN_KEY.test(i.price?.lookup_key || ''));
  const storageItem = items.find((i) => STORAGE_KEY.test(i.price?.lookup_key || ''));
  const [, plan, interval] = PLAN_KEY.exec(planItem?.price?.lookup_key || '') || [];
  const pastDueSince = sub.status === 'past_due' ? tenant.past_due_since || new Date().toISOString() : null;
  platformDb
    .prepare(
      `UPDATE tenants SET plan = ?, billing_interval = ?, collection = ?, stripe_customer_id = ?, stripe_subscription_id = ?,
         subscription_status = ?, period_end = ?, cancel_at_period_end = ?, past_due_since = ?, paid_screens = ?, extra_storage_gb = ?
       WHERE id = ?`
    )
    .bind(
      plan || tenant.plan,
      interval || tenant.billing_interval,
      sub.collection_method === 'send_invoice' ? 'invoice' : 'card',
      typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
      sub.id,
      sub.status,
      iso(planItem?.current_period_end ?? sub.current_period_end),
      sub.cancel_at_period_end || sub.cancel_at ? 1 : 0,
      pastDueSince,
      planItem?.quantity ?? tenant.paid_screens,
      storageItem ? Number(STORAGE_KEY.exec(storageItem.price.lookup_key)[1]) : 0,
      tenant.id
    )
    .runSync();
  return getTenantById(tenant.id);
}

const syncById = async (id) => syncSubscription(await stripe('GET', `subscriptions/${id}`));

/* ---------------------------------- visning ---------------------------------- */

async function overview(tenant, user) {
  const L = tenantLimits(tenant);
  let u = { screens: 0, storageBytes: 0 };
  try {
    u = await usage(tenantResources(tenant.slug));
  } catch {
    /* tom */
  }
  const plan = paidPlan(tenant);
  return {
    enabled: stripeEnabled(),
    vat: vatOn(),
    can_manage: user?.role === 'owner',
    plan: plan ? plan.id : 'free',
    last_plan: tenant.plan || null,
    status: tenant.subscription_status || null,
    interval: tenant.billing_interval || null,
    collection: tenant.collection || null,
    period_end: tenant.period_end || null,
    cancel_at_period_end: !!tenant.cancel_at_period_end,
    paid_screens: tenant.paid_screens || 0,
    extra_storage_gb: tenant.extra_storage_gb || 0,
    screens: { used: u.screens, limit: L.screens },
    storage: { used: u.storageBytes, limit: L.storageBytes },
    org: tenant.org_number ? { number: tenant.org_number, name: tenant.legal_name, volunteer: !!tenant.volunteer_verified_at } : null,
    email: tenant.billing_email || user?.email || null
  };
}

/* ------------------------------ kunde i Stripe ------------------------------- */

const customerLocks = new Map();

/** Kunden i Stripe (lages første gang), med navn og adresse fra Enhetsregisteret. */
async function ensureCustomer(tenant, { email, org }) {
  if (customerLocks.has(tenant.id)) return customerLocks.get(tenant.id);
  const run = (async () => {
    const params = {
      name: org?.name || tenant.name,
      email,
      address: org?.address || undefined,
      preferred_locales: ['nb'],
      metadata: { tenant_id: String(tenant.id), slug: tenant.slug, org_number: org?.number || '' }
    };
    if (tenant.stripe_customer_id) {
      await stripe('POST', `customers/${tenant.stripe_customer_id}`, params);
      return tenant.stripe_customer_id;
    }
    const c = await stripe('POST', 'customers', {
      ...params,
      // Mva-registrerte får org.nr. med MVA på fakturaen.
      tax_id_data: org?.vat_registered ? [{ type: 'no_vat', value: `${org.number}MVA` }] : undefined
    });
    platformDb.prepare('UPDATE tenants SET stripe_customer_id = ? WHERE id = ?').bind(c.id, tenant.id).runSync();
    return c.id;
  })();
  customerLocks.set(tenant.id, run);
  try {
    return await run;
  } finally {
    customerLocks.delete(tenant.id);
  }
}

/* ---------------------------------- valg ---------------------------------- */

/** Leser og sjekker et valg av plan. Gir { plan, screens, storageGb, interval } eller kaster. */
async function choice(b, tenant, used) {
  const plan = PLANS[b.plan] ? b.plan : null;
  if (!plan) throw Object.assign(new Error('Velg Pro eller Lag og frivillige.'), { status: 400 });
  const screens = Number.parseInt(b.screens, 10);
  if (!(screens >= 1 && screens <= 500)) throw Object.assign(new Error('Velg mellom 1 og 500 skjermer.'), { status: 400 });
  if (screens < used) {
    throw Object.assign(new Error(`Dere har ${used} skjermer. Fjern noen under Skjermer først, eller velg minst ${used}.`), { status: 409 });
  }
  const storageGb = Number(b.storage_gb) || 0;
  if (storageGb && !STORAGE_ADDONS.some(([gb]) => gb === storageGb)) throw Object.assign(new Error('Ugyldig valg av lagring.'), { status: 400 });
  const interval = b.interval === 'year' ? 'year' : 'month';
  return { plan, screens, storageGb, interval };
}

/** Lag og frivillige krever at organisasjonen står i Frivillighetsregisteret (sjekkes hos Brreg hver gang). */
async function checkClub(c, orgNumber) {
  if (c.plan !== 'club') return null;
  if (!orgNumber) throw Object.assign(new Error('Lag og frivillige krever organisasjonsnummer.'), { status: 400 });
  const org = await lookupOrg(orgNumber);
  if (!org.volunteer) {
    throw Object.assign(new Error(`${org.name} står ikke i Frivillighetsregisteret, så Lag og frivillige gjelder ikke. Velg Pro, eller registrer laget i Frivillighetsregisteret først.`), {
      status: 403
    });
  }
  return org;
}

/* ---------------------------------- ruter ---------------------------------- */

export async function handleBillingRoute(request, ctx, env) {
  const url = new URL(request.url);
  const p = url.pathname.replace(/\/+$/, '');
  const { user } = ctx;
  if (!user) return fail(401, 'Ikke innlogget');
  // Kunden slås opp på nytt, så endringer fra webhooken er med.
  const tenant = getTenantById(ctx.tenant.id);

  if (p === '/api/billing' && request.method === 'GET') return json(await overview(tenant, user));
  if (user.role !== 'owner') return fail(403, 'Bare eiere kan endre abonnementet.');

  try {
    if (p === '/api/billing/org' && request.method === 'GET') return json(await lookupOrg(url.searchParams.get('number')));

    if (!stripeEnabled()) return fail(503, 'Betaling er ikke slått på ennå.');
    const b = request.method === 'POST' ? (await readJson(request)) || {} : {};
    const u = await usage(env);

    if (p === '/api/billing/checkout' && request.method === 'POST') {
      if (paidPlan(tenant)) return fail(409, 'Dere har allerede et abonnement. Endre det i stedet.');
      const c = await choice(b, tenant, u.screens);
      const email = String(b.email || user.email).trim().slice(0, 200);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, 'Skriv inn en gyldig e-postadresse for kvitteringer.');
      const org = (await checkClub(c, b.org_number)) || (b.org_number ? await lookupOrg(b.org_number) : null);
      const invoice = !!b.invoice;
      if (invoice && (c.interval !== 'year' || !org)) return fail(400, 'Faktura gjelder årlig betaling for organisasjoner med organisasjonsnummer.');

      platformDb
        .prepare('UPDATE tenants SET org_number = ?, legal_name = ?, billing_email = ?, volunteer_verified_at = ? WHERE id = ?')
        .bind(org?.number || null, org?.name || null, email, org?.volunteer ? new Date().toISOString() : null, tenant.id)
        .runSync();
      const customer = await ensureCustomer(tenant, { email, org });
      const items = await lineItems(c);
      const { taxRate } = await getCatalog();
      const description = `Flatr ${PLANS[c.plan].name} for ${tenant.name}`;

      if (invoice) {
        const sub = await stripe('POST', 'subscriptions', {
          customer,
          items,
          collection_method: 'send_invoice',
          days_until_due: 14,
          default_tax_rates: vatOn() ? [taxRate] : undefined,
          description,
          metadata: { tenant_id: String(tenant.id) }
        });
        syncSubscription(sub);
        await logActivity(env, user, { action: 'bestilte abonnementet med faktura', target_type: 'billing', target_name: `${PLANS[c.plan].name} × ${c.screens}` }).catch(() => {});
        return json({ ok: true, billing: await overview(getTenantById(tenant.id), user) });
      }

      const origin = ctx.origin(tenant.slug);
      const session = await stripe('POST', 'checkout/sessions', {
        mode: 'subscription',
        customer,
        customer_update: { address: 'auto', name: 'auto' },
        billing_address_collection: 'required',
        tax_id_collection: { enabled: true },
        line_items: items,
        locale: 'nb',
        allow_promotion_codes: true,
        client_reference_id: String(tenant.id),
        metadata: { tenant_id: String(tenant.id) },
        subscription_data: { description, metadata: { tenant_id: String(tenant.id) }, default_tax_rates: vatOn() ? [taxRate] : undefined },
        success_url: `${origin}/admin?view=billing&session={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/admin?view=billing`
      });
      return json({ url: session.url });
    }

    if (p === '/api/billing/sync' && request.method === 'POST') {
      const session = await stripe('GET', `checkout/sessions/${encodeURIComponent(String(b.session_id || ''))}`);
      if (String(session.metadata?.tenant_id) !== String(tenant.id)) return fail(404, 'Fant ikke betalingen.');
      if (session.subscription) {
        const t = await syncById(typeof session.subscription === 'string' ? session.subscription : session.subscription.id);
        if (t && paidPlan(t)) await logActivity(env, user, { action: 'startet abonnementet', target_type: 'billing', target_name: `${PLANS[t.plan].name} × ${t.paid_screens}` }).catch(() => {});
      }
      return json(await overview(getTenantById(tenant.id), user));
    }

    if (p === '/api/billing/change' && request.method === 'POST') {
      if (!tenant.stripe_subscription_id || !paidPlan(tenant)) return fail(409, 'Dere har ikke et abonnement å endre.');
      const c = await choice(b, tenant, u.screens);
      await checkClub(c, tenant.org_number);
      const sub = await stripe('GET', `subscriptions/${tenant.stripe_subscription_id}`);
      const cur = sub.items.data;
      const planItem = cur.find((i) => PLAN_KEY.test(i.price?.lookup_key || ''));
      const storageItem = cur.find((i) => STORAGE_KEY.test(i.price?.lookup_key || ''));
      const [wantPlan, wantStorage] = await lineItems(c);
      const items = [{ id: planItem.id, price: wantPlan.price, quantity: c.screens }];
      if (wantStorage) items.push(storageItem ? { id: storageItem.id, price: wantStorage.price, quantity: 1 } : wantStorage);
      else if (storageItem) items.push({ id: storageItem.id, deleted: true });
      // Mer (eller ny periode) faktureres med en gang; mindre godskrives på neste faktura.
      const more =
        planItem.price.recurring.interval !== c.interval ||
        c.screens > planItem.quantity ||
        c.storageGb > (tenant.extra_storage_gb || 0) ||
        (c.plan === 'pro' && tenant.plan === 'club');
      const updated = await stripe('POST', `subscriptions/${sub.id}`, {
        items,
        proration_behavior: more ? 'always_invoice' : 'create_prorations',
        cancel_at_period_end: false
      });
      syncSubscription(updated);
      await logActivity(env, user, { action: 'endret abonnementet', target_type: 'billing', target_name: `${PLANS[c.plan].name} × ${c.screens}` }).catch(() => {});
      return json(await overview(getTenantById(tenant.id), user));
    }

    if (p === '/api/billing/portal' && request.method === 'POST') {
      if (!tenant.stripe_customer_id) return fail(409, 'Dere har ikke betalt noe ennå.');
      const { portal } = await getCatalog();
      const s = await stripe('POST', 'billing_portal/sessions', {
        customer: tenant.stripe_customer_id,
        configuration: portal,
        return_url: `${ctx.origin(tenant.slug)}/admin?view=billing`
      });
      return json({ url: s.url });
    }
  } catch (err) {
    // Egne feil har status og norsk melding; Stripe-feil og uventede feil logges og vises generelt.
    if (err.stripe || !err.status) console.error('[billing]', err.stripe?.type || '', err.stripe?.code || '', err.message);
    if (err.stripe) return fail(502, 'Betalingstjenesten svarte med en feil. Prøv igjen om litt.');
    return fail(err.status || 500, err.status ? err.message : 'Noe gikk galt. Prøv igjen.');
  }
  return fail(404, 'Ukjent endepunkt');
}

/* --------------------------------- webhook --------------------------------- */

const seen = new Map(); // hendelses-id -> tid (Stripe kan sende samme hendelse flere ganger)

async function notifyPaymentFailed(invoice) {
  const subId = invoice.parent?.subscription_details?.subscription || invoice.subscription;
  const tenant =
    platformDb.prepare('SELECT * FROM tenants WHERE stripe_subscription_id = ?').bind(subId || '').firstSync() ||
    platformDb.prepare('SELECT * FROM tenants WHERE stripe_customer_id = ?').bind(invoice.customer || '').firstSync();
  if (!tenant) return;
  const owners = platformDb
    .prepare(`SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = ? AND m.role = 'owner'`)
    .bind(tenant.id)
    .allSync()
    .results.map((r) => r.email);
  const origin = `${process.env.PUBLIC_PROTOCOL || 'http'}://${tenant.slug}.${(process.env.BASE_DOMAIN || 'localhost:8787').toLowerCase()}`;
  for (const to of owners) {
    await sendMailTo(to, () => ({
      subject: tr('Betalingen for Flatr feilet – {0}', [tenant.name]),
      ...buttonMail({
        heading: tr('Betalingen feilet'),
        intro: tr('Vi fikk ikke trukket betalingen for abonnementet til {0}. Oppdater kortet, så prøver vi igjen. Skjermene virker som før i noen dager til.', [tenant.name]),
        button: tr('Oppdater betalingen'),
        url: `${origin}/admin?view=billing`
      })
    })).catch(() => {});
  }
}

export async function handleBillingWebhook(request) {
  const raw = await request.text();
  const event = verifyWebhook(raw, request.headers.get('stripe-signature'));
  if (!event) return fail(400, 'Ugyldig signatur');
  const now = Date.now();
  for (const [id, t] of seen) if (now - t > 24 * 3600_000) seen.delete(id);
  if (seen.has(event.id)) return json({ received: true });

  const o = event.data?.object || {};
  try {
    if (event.type === 'checkout.session.completed' && o.subscription) await syncById(o.subscription);
    else if (event.type.startsWith('customer.subscription.')) await syncById(o.id);
    else if (event.type === 'invoice.paid') {
      const subId = o.parent?.subscription_details?.subscription || o.subscription;
      if (subId) await syncById(subId);
    } else if (event.type === 'invoice.payment_failed') await notifyPaymentFailed(o);
  } catch (err) {
    // 500 = Stripe prøver igjen senere.
    console.error('[billing] webhook', event.type, err.message);
    return fail(500, 'Kunne ikke behandle hendelsen');
  }
  seen.set(event.id, now);
  return json({ received: true });
}

/** Ved oppstart: gjør Stripe-kontoen klar (produkter, priser, mva, portal). */
export function startBilling() {
  if (!stripeEnabled()) return;
  getCatalog()
    .then(() => console.log('[billing] Stripe er klar'))
    .catch((err) => console.error('[billing] oppsett:', err.message));
}
