// Prisene i Flatr – de samme som på flatr.no. Per skjerm per måned, eks. mva.
// Brukes av forsiden, Abonnement-siden og serveren (server/billing.js), så
// tallene står ett sted. Årlig betaling = 10 måneder (to måneder gratis).
// Endres prisene, må Stripe få nye priser også (node server/billing-setup.js).

export const FREE = { screens: 1, storageGb: 5 };

// tiers: [til og med skjerm nr., kr per skjerm] – trinnvis, som en skattetabell.
export const PLANS = {
  pro: { id: 'pro', name: 'Pro', storageGb: 20, tiers: [[19, 29], [Infinity, 24]] },
  club: { id: 'club', name: 'Lag og frivillige', storageGb: 15, tiers: [[Infinity, 15]] }
};

// Ekstra lagring (begge betalte planer): GB -> kr per måned.
export const STORAGE_ADDONS = [
  [10, 5],
  [20, 9],
  [30, 13],
  [40, 16],
  [50, 19]
];

export const YEAR_MONTHS = 10;
export const VAT_RATE = 0.25;

/** Pris per måned for `screens` skjermer på planen. */
export function screensPrice(planId, screens) {
  const plan = PLANS[planId];
  if (!plan) return 0;
  let left = Math.max(0, Math.floor(screens));
  let from = 0;
  let sum = 0;
  for (const [upTo, kr] of plan.tiers) {
    const n = Math.min(left, upTo - from);
    sum += n * kr;
    left -= n;
    from = upTo;
    if (!left) break;
  }
  return sum;
}

export const storagePrice = (gb) => STORAGE_ADDONS.find(([g]) => g === gb)?.[1] ?? 0;

/**
 * Hva et abonnement koster: per måned og per betaling (måned eller år),
 * med og uten mva. `vat` = false når Flatr ikke tar mva.
 */
export function quote({ plan, screens, storageGb = 0, interval = 'month', vat = true }) {
  const monthly = screensPrice(plan, screens) + storagePrice(storageGb);
  const months = interval === 'year' ? YEAR_MONTHS : 1;
  const net = monthly * months;
  const tax = vat ? Math.round(net * VAT_RATE * 100) / 100 : 0;
  return { monthly, net, vat: tax, total: net + tax, months };
}

/** «1 234 kr» / «1 234,50 kr» */
export const kr = (n) =>
  `${n.toLocaleString('nb-NO', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })} kr`;

/** Gyldig norsk organisasjonsnummer (9 siffer, kontrollsiffer modulus 11). */
export function validOrgNumber(value) {
  const s = String(value ?? '').replace(/\s/g, '');
  if (!/^\d{9}$/.test(s)) return false;
  const w = [3, 2, 7, 6, 5, 4, 3, 2];
  const sum = w.reduce((a, x, i) => a + x * Number(s[i]), 0);
  const check = 11 - (sum % 11);
  return (check === 11 ? 0 : check) === Number(s[8]);
}
