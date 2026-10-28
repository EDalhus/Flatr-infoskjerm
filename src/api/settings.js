import { json, badRequest, handleOptions, readJson, requireAdmin, getTimezone, usage } from './_shared.js';
import { webhookKind, sendWebhook } from '../lib/webhook.js';
import { cleanBrand } from '../lib/brand.js';

// Kontoinnstillinger: tidssone (tidsplanen) og offline-varsling (server/monitor.js),
// også til Slack eller Teams via webhook.

async function readSettings(env) {
  let rows = [];
  try {
    ({ results: rows } = await env.DB.prepare('SELECT key, value FROM settings').all());
  } catch {
    rows = [];
  }
  const map = Object.fromEntries((rows ?? []).map((r) => [r.key, r.value]));
  return {
    timezone: await getTimezone(env),
    offline_alerts: map.offline_alerts !== '0',
    offline_minutes: Number(map.offline_minutes) || 5,
    daily_digest: map.daily_digest === '1',
    require_2fa: map.require_2fa === '1',
    // Adressen er en hemmelighet hos Slack/Teams – vis bare hvilken tjeneste og slutten.
    webhook: map.webhook_url ? { kind: webhookKind(map.webhook_url), hint: `…${map.webhook_url.slice(-6)}` } : null,
    // Merkevaresettet (logo, farger, skrifter) – se src/lib/brand.js.
    brand: map.brand ? cleanBrand(safeParse(map.brand)) : null,
    // Kvoter (bare på Node-serveren) og bruk mot dem.
    limits: env.LIMITS ?? null,
    usage: env.LIMITS ? await usage(env) : null
  };
}

const safeParse = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

const setValue = (env, key, value) =>
  env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .bind(key, String(value))
    .run();

const validTz = (tz) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

// GET /api/settings
export async function onRequestGet({ env }) {
  return json(await readSettings(env));
}

// PUT /api/settings  { timezone?, offline_alerts?, offline_minutes?, webhook_url? }  (webhook_url '' = fjern)
// POST /api/settings?test=webhook  -> sender en testmelding til lagret webhook
export async function onRequestPut(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const b = (await readJson(context.request)) || {};
  if (b.timezone !== undefined) {
    if (!validTz(b.timezone)) return badRequest('Ukjent tidssone');
    await setValue(context.env, 'timezone', b.timezone);
  }
  if (b.offline_alerts !== undefined) await setValue(context.env, 'offline_alerts', b.offline_alerts ? '1' : '0');
  if (b.daily_digest !== undefined) await setValue(context.env, 'daily_digest', b.daily_digest ? '1' : '0');
  if (b.require_2fa !== undefined) {
    if (context.env.SESSION_USER && context.env.SESSION_USER.role !== 'owner') return json({ error: 'Bare eiere kan endre dette.' }, { status: 403 });
    // Eieren som slår det på, må ha tofaktor selv (ellers stenger de seg ute).
    if (b.require_2fa && context.env.SESSION_USER && !context.env.SESSION_USER.two_factor)
      return badRequest('Slå på tofaktor for din egen bruker først (Konto og sikkerhet).');
    await setValue(context.env, 'require_2fa', b.require_2fa ? '1' : '0');
  }
  if (b.offline_minutes !== undefined) {
    const m = Number.parseInt(b.offline_minutes, 10);
    if (!(m >= 2 && m <= 1440)) return badRequest('Minutter må være mellom 2 og 1440');
    await setValue(context.env, 'offline_minutes', m);
  }
  if (b.webhook_url !== undefined) {
    const url = String(b.webhook_url || '').trim();
    if (!url) {
      await context.env.DB.prepare(`DELETE FROM settings WHERE key = 'webhook_url'`).run();
    } else {
      if (!webhookKind(url)) return badRequest('Bruk en webhook-adresse fra Slack eller Microsoft Teams.');
      await setValue(context.env, 'webhook_url', url);
    }
  }
  if (b.brand !== undefined) await setValue(context.env, 'brand', JSON.stringify(cleanBrand(b.brand)));
  return json(await readSettings(context.env));
}

export async function onRequestPost(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  if (new URL(context.request.url).searchParams.get('test') !== 'webhook') return badRequest('Ukjent handling');
  const row = await context.env.DB.prepare(`SELECT value FROM settings WHERE key = 'webhook_url'`).first();
  if (!row?.value) return badRequest('Legg inn en webhook-adresse først.');
  try {
    await sendWebhook(row.value, {
      title: 'Testvarsel fra Flatr',
      lines: ['Det virker! Her kommer beskjed når en skjerm går offline eller er tilbake.']
    });
    return json({ ok: true });
  } catch (err) {
    return json({ error: err.message }, { status: 502 });
  }
}

export const onRequestOptions = handleOptions;
