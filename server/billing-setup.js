// Gjør Stripe-kontoen klar for Flatr: produkter og priser (fra src/lib/pricing.js),
// mva-sats og oppsett av kundeportalen. Trygt å kjøre flere ganger – det som
// finnes, gjenbrukes, og endrede priser får en ny pris med samme oppslagsnøkkel
// (eksisterende abonnementer beholder den gamle til de endres).
//
//   STRIPE_SECRET_KEY=sk_test_… node server/billing-setup.js
//
// Kjøres også ved oppstart når STRIPE_SECRET_KEY er satt (se server/billing.js).

import { stripe, stripeAll } from './stripe.js';
import { PLANS, STORAGE_ADDONS, YEAR_MONTHS } from '../src/lib/pricing.js';

const PRODUCTS = {
  pro: { name: 'Flatr Pro', description: 'Per skjerm. Video, 20 GB lagring og prioritert hjelp.' },
  club: { name: 'Flatr Lag og frivillige', description: 'Per skjerm, for organisasjoner i Frivillighetsregisteret.' },
  storage: { name: 'Ekstra lagring', description: 'Mer plass i biblioteket i Flatr.' }
};

const øre = (kr) => Math.round(kr * 100);

/** Alle prisene Flatr bruker, med oppslagsnøkkel (lookup_key) og beløp. */
export function wantedPrices() {
  const out = [];
  for (const interval of ['month', 'year']) {
    const months = interval === 'year' ? YEAR_MONTHS : 1;
    for (const plan of Object.values(PLANS)) {
      const tiers = plan.tiers.map(([upTo, kr]) => ({ up_to: upTo === Infinity ? 'inf' : upTo, unit_amount: øre(kr * months) }));
      out.push({ key: `flatr_${plan.id}_${interval}`, product: plan.id, interval, tiers: tiers.length > 1 ? tiers : null, unit: tiers.length > 1 ? null : tiers[0].unit_amount });
    }
    for (const [gb, kr] of STORAGE_ADDONS) out.push({ key: `flatr_storage_${gb}_${interval}`, product: 'storage', interval, unit: øre(kr * months), gb });
  }
  return out;
}

const samePrice = (p, w) =>
  p.currency === 'nok' &&
  p.recurring?.interval === w.interval &&
  (w.tiers
    ? p.billing_scheme === 'tiered' &&
      JSON.stringify((p.tiers || []).map((t) => [t.up_to ?? 'inf', t.unit_amount])) === JSON.stringify(w.tiers.map((t) => [t.up_to, t.unit_amount]))
    : p.billing_scheme === 'per_unit' && p.unit_amount === w.unit);

async function ensureProducts() {
  const existing = await stripeAll('products', { active: true });
  const ids = {};
  for (const [id, info] of Object.entries(PRODUCTS)) {
    const found = existing.find((p) => p.metadata?.flatr === id);
    ids[id] = found ? found.id : (await stripe('POST', 'products', { ...info, metadata: { flatr: id } })).id;
  }
  return ids;
}

async function ensurePrices(productIds) {
  const wanted = wantedPrices();
  const existing = await stripeAll('prices', { active: true, lookup_keys: wanted.map((w) => w.key), expand: ['data.tiers'] });
  let created = 0;
  for (const w of wanted) {
    const cur = existing.find((p) => p.lookup_key === w.key);
    if (cur && samePrice(cur, w)) continue;
    await stripe('POST', 'prices', {
      currency: 'nok',
      product: productIds[w.product],
      recurring: { interval: w.interval },
      tax_behavior: 'exclusive',
      lookup_key: w.key,
      transfer_lookup_key: cur ? true : undefined,
      nickname: w.key,
      ...(w.tiers ? { billing_scheme: 'tiered', tiers_mode: 'graduated', tiers: w.tiers } : { unit_amount: w.unit }),
      metadata: { flatr: w.product, ...(w.gb ? { storage_gb: w.gb } : {}) }
    });
    created++;
  }
  return created;
}

export async function ensureTaxRate() {
  const rates = await stripeAll('tax_rates', { active: true });
  const found = rates.find((r) => r.metadata?.flatr === 'mva');
  if (found) return found.id;
  const r = await stripe('POST', 'tax_rates', {
    display_name: 'MVA',
    description: 'Merverdiavgift 25 %',
    percentage: 25,
    inclusive: false,
    country: 'NO',
    jurisdiction: 'Norge',
    tax_type: 'vat',
    metadata: { flatr: 'mva' }
  });
  return r.id;
}

export async function ensurePortal() {
  const configs = await stripeAll('billing_portal/configurations', { active: true });
  const found = configs.find((c) => c.metadata?.flatr === 'portal');
  const params = {
    business_profile: { headline: 'Flatr – abonnement og kvitteringer', privacy_policy_url: 'https://flatr.no/personvern', terms_of_service_url: 'https://flatr.no/vilkar' },
    features: {
      customer_update: { enabled: true, allowed_updates: ['email', 'address', 'name', 'tax_id'] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      // Antall skjermer og lagring endres i Flatr (Abonnement), ikke i portalen.
      subscription_update: { enabled: false },
      subscription_cancel: {
        enabled: true,
        mode: 'at_period_end',
        cancellation_reason: { enabled: true, options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'other'] }
      }
    },
    metadata: { flatr: 'portal' }
  };
  if (found) return (await stripe('POST', `billing_portal/configurations/${found.id}`, params)).id;
  return (await stripe('POST', 'billing_portal/configurations', params)).id;
}

/** Alt på en gang. Gir ID-ene som trengs videre. */
export async function ensureCatalog() {
  const products = await ensureProducts();
  const createdPrices = await ensurePrices(products);
  const [taxRate, portal] = await Promise.all([ensureTaxRate(), ensurePortal()]);
  return { products, createdPrices, taxRate, portal };
}

// Kjørt direkte: node server/billing-setup.js
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('Mangler STRIPE_SECRET_KEY.');
    process.exit(1);
  }
  const r = await ensureCatalog();
  console.log(`Stripe er klar: ${Object.keys(r.products).length} produkter, ${r.createdPrices} nye priser, mva-sats og kundeportal.`);
}
