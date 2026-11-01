// Liten Stripe-klient (REST med fetch, uten SDK) – det abonnementene i
// server/billing.js trenger: kall mot API-et og sjekk av webhook-signaturer.
//
//   STRIPE_SECRET_KEY        sk_live_… / sk_test_… (uten den er betaling slått av)
//   STRIPE_WEBHOOK_SECRET    whsec_… for https://flatr.no/api/billing/webhook
//   STRIPE_API_BASE          valgfri, f.eks. http://localhost:12111 for stripe-mock

import { createHmac, timingSafeEqual } from 'node:crypto';

// Fast API-versjon, så svarene har formen koden er skrevet for.
const VERSION = '2026-10-28.endive';

export const stripeEnabled = () => !!process.env.STRIPE_SECRET_KEY;

/** Stripe vil ha skjemakoding med nøkler som line_items[0][price]. */
function encode(value, prefix, out = new URLSearchParams()) {
  if (value === undefined || value === null) return out;
  if (Array.isArray(value)) {
    value.forEach((v, i) => encode(v, `${prefix}[${i}]`, out));
  } else if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) encode(v, prefix ? `${prefix}[${k}]` : k, out);
  } else {
    out.append(prefix, String(value));
  }
  return out;
}

/** Kaller Stripe. Feil kastes med Stripes egen melding (på engelsk) i err.stripe. */
export async function stripe(method, path, params, { idempotencyKey } = {}) {
  const url = new URL(`/v1/${path}`, process.env.STRIPE_API_BASE || 'https://api.stripe.com');
  const headers = { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Stripe-Version': VERSION };
  let body;
  if (params && method === 'GET') url.search = encode(params).toString();
  else if (params) {
    body = encode(params).toString();
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(20_000) });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Stripe svarte ${res.status}`);
    err.status = res.status;
    err.stripe = data?.error || null;
    throw err;
  }
  return data;
}

/** Alle sider av en liste (f.eks. priser). */
export async function stripeAll(path, params = {}) {
  const out = [];
  let after;
  for (;;) {
    const page = await stripe('GET', path, { ...params, limit: 100, starting_after: after });
    out.push(...page.data);
    if (!page.has_more || !page.data.length) return out;
    after = page.data[page.data.length - 1].id;
  }
}

/**
 * Sjekker Stripe-Signature (t=…,v1=…) mot den rå kroppen og gir hendelsen,
 * eller null hvis signaturen er feil eller for gammel (gjentakelsesangrep).
 */
export function verifyWebhook(rawBody, header, secret = process.env.STRIPE_WEBHOOK_SECRET, toleranceSec = 300) {
  if (!secret || !header) return null;
  let t = null;
  const sigs = [];
  for (const part of String(header).split(',')) {
    const [k, v] = part.split('=', 2);
    if (k === 't') t = Number(v);
    else if (k === 'v1' && v) sigs.push(v);
  }
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - t) > toleranceSec) return null;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest();
  const ok = sigs.some((s) => {
    const got = Buffer.from(s, 'hex');
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
  if (!ok) return null;
  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}
