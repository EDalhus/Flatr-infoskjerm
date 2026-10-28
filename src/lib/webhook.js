// Varsler til Slack eller Microsoft Teams via en innkommende webhook som
// kunden limer inn. Bare Slack- og Microsoft-adresser godtas (serveren skal
// ikke kunne brukes til å kalle vilkårlige adresser).

const SLACK = /^hooks\.slack\.com$/i;
const TEAMS = /(\.webhook\.office\.com|\.logic\.azure\.com|\.powerplatform\.com|\.powerautomate\.com)$/i;

/** 'slack' | 'teams' | null (ugyldig). */
export function webhookKind(raw) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (SLACK.test(url.hostname)) return 'slack';
  if (TEAMS.test(url.hostname)) return 'teams';
  return null;
}

/**
 * Sender en melding. title = første linje (fet), lines = punkter, link = { url, label }.
 * Kaster med norsk melding hvis mottakeren avviser.
 */
export async function sendWebhook(raw, { title, lines = [], link }) {
  const kind = webhookKind(raw);
  if (!kind) throw new Error('Bruk en webhook-adresse fra Slack eller Microsoft Teams.');
  let body;
  if (kind === 'slack') {
    const text = [`*${title}*`, ...lines.map((l) => `• ${l}`), link ? `<${link.url}|${link.label}>` : ''].filter(Boolean).join('\n');
    body = { text };
  } else if (/\.webhook\.office\.com$/i.test(new URL(raw).hostname)) {
    // Eldre «Incoming Webhook»-koblinger i Teams tar ren tekst (Markdown).
    body = { text: [`**${title}**`, ...lines.map((l) => `- ${l}`), link ? `[${link.label}](${link.url})` : ''].filter(Boolean).join('\n\n') };
  } else {
    // Teams Workflows («Når en webhook-forespørsel mottas») forventer et Adaptive Card.
    body = {
      type: 'message',
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: {
            $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
            type: 'AdaptiveCard',
            version: '1.4',
            body: [
              { type: 'TextBlock', text: title, weight: 'Bolder', size: 'Medium', wrap: true },
              ...lines.map((l) => ({ type: 'TextBlock', text: l, wrap: true, spacing: 'Small' }))
            ],
            actions: link ? [{ type: 'Action.OpenUrl', title: link.label, url: link.url }] : []
          }
        }
      ]
    };
  }
  const res = await fetch(raw, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(10_000)
  });
  if (!res.ok) throw new Error(`${kind === 'slack' ? 'Slack' : 'Teams'} svarte ${res.status}. Sjekk at adressen er riktig og fortsatt aktiv.`);
}
