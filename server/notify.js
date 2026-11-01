// Varsler fra API-modulene (godkjenning, kommentarer): e-post til eiere eller
// bestemte personer, og til kontoens Slack/Teams-webhook. Gis til src/api via
// env.NOTIFY (se tenantEnv i index.js).

import { platformDb, tenantResources, orgLang } from './platform.js';
import { sendMailTo, buttonMail } from './mail.js';
import { withLang } from './i18n.js';
import { sendWebhook } from '../src/lib/webhook.js';
import { tr } from '../src/lib/i18n.js';

const ownerEmails = (tenantId) =>
  platformDb
    .prepare(`SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = ? AND m.role = 'owner'`)
    .bind(tenantId)
    .allSync()
    .results.map((r) => r.email);

/** Medlemmene av kontoen (til @-omtaler i kommentarer). */
export const teamMembers = (tenantId) =>
  platformDb
    .prepare(`SELECT u.email, u.name, m.role FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = ? ORDER BY u.name, u.email`)
    .bind(tenantId)
    .allSync().results;

/**
 * Tekstene (subject, heading, intro, button) kan være funksjoner som lager teksten
 * med tr – da kommer e-posten på hver mottakers språk og Slack/Teams på kontoens.
 * Vanlige strenger slås opp i ordboken som de er.
 */
export function notifier(tenant) {
  return async ({ to = 'owners', exclude, subject, heading, intro, button = 'Åpne Flatr', path = '/admin', webhook = false }) => {
    const url = `${process.env.PUBLIC_PROTOCOL || 'https'}://${tenant.slug}.${process.env.BASE_DOMAIN || 'flatr.no'}${path}`;
    const list = (to === 'owners' ? ownerEmails(tenant.id) : [].concat(to)).filter((e) => e && e !== exclude);
    const text = (v) => (typeof v === 'function' ? v(tr) : typeof v === 'string' ? tr(v) : v);
    if (list.length) {
      await sendMailTo(list, () => ({ subject: text(subject), ...buttonMail({ heading: text(heading) || text(subject), intro: text(intro), button: text(button), url }) })).catch((err) =>
        console.error('[notify] e-post:', err.message)
      );
    }
    if (webhook) {
      const row = await tenantResources(tenant.slug).DB.prepare(`SELECT value FROM settings WHERE key = 'webhook_url'`).first().catch(() => null);
      if (row?.value) {
        const message = withLang(orgLang(tenant.id), () => ({ title: text(subject), lines: intro ? [text(intro)] : [], link: { url, label: text(button) } }));
        await sendWebhook(row.value, message).catch(() => {});
      }
    }
  };
}
