// Flatr AI inkludert: uten egen nøkkel i Claude AI-appen bruker kunden Flatrs
// nøkkel, med en kvote i kroner per måned (det API-et koster oss). Egen nøkkel
// går alltid foran og har ingen grense. Se src/api/ai.js.
//
//   FLATR_ANTHROPIC_KEY            Flatrs nøkkel (uten den finnes ingen inkludert KI)
//   AI_INCLUDED_KR_PER_SCREEN=5    per betalt skjerm per måned
//   AI_INCLUDED_MIN_KR=15          minst per organisasjon med betalt plan
//   AI_INCLUDED_FREE_KR=0          gratisplanen (f.eks. litt å prøve med)
//   AI_USD_NOK=11                  kurs for å regne om API-prisene

import { platformDb, paidPlan } from './platform.js';

platformDb.db.exec(`CREATE TABLE IF NOT EXISTS ai_usage (
  tenant_id INTEGER NOT NULL,
  month     TEXT NOT NULL,              -- YYYY-MM
  usd       REAL NOT NULL DEFAULT 0,
  requests  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, month)
)`);

// USD per million tokens, fra platform.claude.com/docs/en/about-claude/pricing (november 2026).
const PRICES = {
  'claude-opus-5-5': { input: 4, cache_write: 5, cache_read: 0.2, output: 20 },
  'claude-sonnet-5-5': { input: 2, cache_write: 2.5, cache_read: 0.1, output: 10 }
};

export function costUsd(model, u = {}) {
  const p = PRICES[model] || PRICES['claude-opus-5-5'];
  return (
    ((u.input_tokens || 0) * p.input +
      (u.cache_creation_input_tokens || 0) * p.cache_write +
      (u.cache_read_input_tokens || 0) * p.cache_read +
      (u.output_tokens || 0) * p.output) /
    1e6
  );
}

const num = (name, fallback) => {
  const v = process.env[name];
  return v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : fallback;
};
const month = () => new Date().toISOString().slice(0, 7);

/** Kroner med KI per måned for kunden (0 = ingen inkludert KI). */
export function allowanceKr(tenant) {
  if (!process.env.FLATR_ANTHROPIC_KEY) return 0;
  if (!paidPlan(tenant)) return num('AI_INCLUDED_FREE_KR', 0);
  return Math.max(num('AI_INCLUDED_MIN_KR', 15), (tenant.paid_screens || 1) * num('AI_INCLUDED_KR_PER_SCREEN', 5));
}

/** Inkludert KI for kunden: nøkkel, status og registrering av forbruk – eller null. */
export function includedAi(tenant) {
  const allowance = allowanceKr(tenant);
  if (!allowance) return null;
  const rate = num('AI_USD_NOK', 11);
  return {
    key: process.env.FLATR_ANTHROPIC_KEY,
    status() {
      const row = platformDb.prepare('SELECT usd, requests FROM ai_usage WHERE tenant_id = ? AND month = ?').bind(tenant.id, month()).firstSync();
      const used = (row?.usd || 0) * rate;
      const next = new Date();
      next.setUTCMonth(next.getUTCMonth() + 1, 1);
      next.setUTCHours(0, 0, 0, 0);
      return {
        allowance_kr: allowance,
        used_kr: Math.round(used * 100) / 100,
        used_pct: Math.min(100, Math.round((used / allowance) * 100)),
        requests: row?.requests || 0,
        exhausted: used >= allowance,
        resets_at: next.toISOString()
      };
    },
    /** Legger til forbruket fra ett svar (og teller en ny forespørsel når `request`). */
    record(model, usage, { request = false } = {}) {
      platformDb
        .prepare(
          `INSERT INTO ai_usage (tenant_id, month, usd, requests) VALUES (?, ?, ?, ?)
           ON CONFLICT (tenant_id, month) DO UPDATE SET usd = usd + excluded.usd, requests = requests + excluded.requests`
        )
        .bind(tenant.id, month(), costUsd(model, usage), request ? 1 : 0)
        .runSync();
    }
  };
}
