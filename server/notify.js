// Varsler fra API-modulene (godkjenning, kommentarer): e-post til eiere eller
// bestemte personer, og til kontoens Slack/Teams-webhook. Gis til src/api via
// env.NOTIFY (se tenantEnv i index.js).

import { platformDb, tenantResources } from './platform.js';
import { sendMail, buttonMail } from './mail.js';
import { sendWebhook } from '../src/lib/webhook.js';

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

export function notifier(tenant) {
  return async ({ to = 'owners', exclude, subject, heading, intro, button = 'Åpne Flatr', path = '/admin', webhook = false }) => {
    const url = `${process.env.PUBLIC_PROTOCOL || 'https'}://${tenant.slug}.${process.env.BASE_DOMAIN || 'flatr.no'}${path}`;
    const list = (to === 'owners' ? ownerEmails(tenant.id) : [].concat(to)).filter((e) => e && e !== exclude);
    if (list.length) {
      await sendMail({ to: list, subject, ...buttonMail({ heading: heading || subject, intro, button, url }) }).catch((err) => console.error('[notify] e-post:', err.message));
    }
    if (webhook) {
      const row = await tenantResources(tenant.slug).DB.prepare(`SELECT value FROM settings WHERE key = 'webhook_url'`).first().catch(() => null);
      if (row?.value) await sendWebhook(row.value, { title: subject, lines: intro ? [intro] : [], link: { url, label: button } }).catch(() => {});
    }
  };
}
