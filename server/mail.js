// E-postutsending over SMTP (nodemailer).
//
// I produksjon går e-posten til en egen send-only Postfix-container (se
// docker-compose.yml), som signerer med DKIM og leverer direkte. Samme kode
// virker mot en hvilken som helst SMTP-tjeneste (Brevo, Resend o.l.).
//
//   SMTP_HOST / SMTP_PORT        – f.eks. mail / 587
//   SMTP_USER / SMTP_PASS        – valgfritt (ikke nødvendig mot egen Postfix)
//   SMTP_SECURE=true             – TLS fra start (port 465)
//   MAIL_FROM                    – avsender, f.eks. "Flatr <noreply@flatr.no>"
//
// Uten SMTP_HOST logges e-posten til konsollen (lokal utvikling).

import nodemailer from 'nodemailer';
import { userLang } from './platform.js';
import { withLang } from './i18n.js';

export const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let transport = null;
function getTransport() {
  if (!process.env.SMTP_HOST) return null;
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    // Egen Postfix på det interne Docker-nettet har ikke sertifikat.
    tls: { rejectUnauthorized: process.env.SMTP_TLS_VERIFY !== 'false' }
  });
  return transport;
}

export async function sendMail({ to, subject, text, html, replyTo }) {
  const t = getTransport();
  if (!t) {
    console.log(`\n[mail] (ikke konfigurert – logger i stedet)\n  Til: ${to}\n  Emne: ${subject}\n\n${text}\n`);
    return { logged: true };
  }
  try {
    return await t.sendMail({
      from: process.env.MAIL_FROM || 'Flatr <noreply@flatr.no>',
      to,
      subject,
      text,
      html,
      ...(replyTo ? { replyTo } : {})
    });
  } catch (err) {
    console.error('[mail] sending feilet', err?.message ?? err);
    throw new Error('Kunne ikke sende e-post');
  }
}

/**
 * E-post på hver mottakers språk (users.prefs.lang, ellers `fallback`). build()
 * lager innholdet ({ subject, ...buttonMail(…) }, gjerne async) og kalles én gang
 * per språk, med tr() og locale() satt til det språket.
 */
export async function sendMailTo(to, build, { fallback = 'nb', replyTo } = {}) {
  const groups = new Map();
  for (const email of [].concat(to).filter(Boolean)) {
    const lang = userLang(email, fallback);
    groups.set(lang, [...(groups.get(lang) || []), email]);
  }
  for (const [lang, list] of groups) {
    await sendMail({ to: list.length === 1 ? list[0] : list, replyTo, ...(await withLang(lang, build)) });
  }
}

/** Felles mal for e-post med én tydelig knapp. */
export function buttonMail({ heading, intro, button, url, outro }) {
  const text = `${heading}\n\n${intro}\n\n${button}: ${url}\n\n${outro ?? ''}`.trim();
  const html = `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#16181d">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" style="max-width:480px;background:#fff;border-radius:16px;padding:32px" cellpadding="0" cellspacing="0">
<tr><td style="font-size:20px;font-weight:700;padding-bottom:4px">Flatr</td></tr>
<tr><td style="font-size:18px;font-weight:600;padding:16px 0 8px">${escapeHtml(heading)}</td></tr>
<tr><td style="font-size:15px;line-height:1.5;color:#3b3f48;padding-bottom:24px">${escapeHtml(intro).replace(/\n/g, '<br>')}</td></tr>
<tr><td><a href="${escapeHtml(url)}" style="display:inline-block;background:#027353;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px">${escapeHtml(button)}</a></td></tr>
<tr><td style="font-size:13px;line-height:1.5;color:#6b7080;padding-top:24px">${escapeHtml(outro ?? '')}</td></tr>
</table></td></tr></table></body></html>`;
  return { text, html };
}
