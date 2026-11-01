// Dokumentasjon for Flatr API v1 (flatr.no/hjelp/api). Lenkes fra Konto → API.
import { useEffect } from 'react';
import { SiteHeader, SiteFooter } from './Landing.jsx';
import { tr } from '../lib/i18n.js';

const BASE = 'https://<kunde>.flatr.no/api/v1';

const ENDPOINTS = [
  {
    method: 'GET',
    path: '/screens',
    title: tr('Skjermene'),
    text: tr('Alle skjermene med navn, grupper, hvilken presentasjon de viser og om de er på nett.'),
    response: '{ "screens": [{ "id": 3, "name": "Resepsjon", "groups": ["Bygg A"], "online": true, "presentation": { "id": 1, "name": "Velkommen" } }] }'
  },
  {
    method: 'POST',
    path: '/alerts',
    title: tr('Send en hastemelding'),
    text: tr('Vises på skjermene med en gang. «severity» er info, warning eller critical. «display» er flash (hele skjermen i 30 sekunder, så banner), full eller banner. Angi «duration_minutes» eller «ends_at» for når den skal slutte, og «screen» (id) eller «group» for bare noen skjermer.'),
    body: tr('{ \"title\": \"Brannøvelse\", \"message\": \"Gå ut via nærmeste utgang\", \"severity\": \"critical\", \"display\": \"full\", \"duration_minutes\": 30 }'),
    response: '{ "id": 12, "state": "live", … }'
  },
  { method: 'GET', path: '/alerts', title: tr('Hastemeldinger nå'), text: tr('Meldinger som vises eller er planlagt.') },
  { method: 'DELETE', path: '/alerts/<id>', title: tr('Avslutt en hastemelding'), text: tr('Uten id avsluttes alle som vises nå.') },
  {
    method: 'PUT',
    path: '/texts/<navn>',
    title: tr('Endre en tekst'),
    text: tr('Gi tekstelementet et navn for API i editoren (f.eks. «dagens-tilbud»). Teksten endres overalt der navnet er brukt, også i publiserte presentasjoner.'),
    body: tr('{ \"text\": \"Kaffe og bolle 39 kr\" }'),
    response: '{ "name": "dagens-tilbud", "updated": 2 }'
  },
  { method: 'GET', path: '/texts', title: tr('Tekster med navn'), text: tr('Navnene og teksten de har nå.') },
  {
    method: 'PATCH',
    path: '/stock/<vare>',
    title: tr('Oppdater en vare'),
    text: tr('For appen Lagerbeholdning. <vare> er navnet eller id-en til varen. Felt: amount, unit, min.'),
    body: tr('{ \"amount\": \"1 250\", \"unit\": \"kg\" }')
  },
  { method: 'PUT', path: '/stock', title: tr('Bytt ut alle varene'), text: tr('Send hele lista: { \"items\": [{ \"name\": \"Hvetemel\", \"amount\": \"1 250\", \"unit\": \"kg\", \"group\": \"bulk\" }] }.') },
  { method: 'GET', path: '/stock', title: tr('Lagerbeholdningen'), text: tr('Varene slik de er nå.') }
];

export default function HelpApi() {
  useEffect(() => {
    document.title = tr('Flatr API – Flatr');
  }, []);
  return (
    <div className="min-h-full overflow-y-auto bg-paper text-ink">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">{tr('Hjelp · API')}</div>
        <h1 className="m-0 mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{tr('Flatr API')}</h1>
        <p className="mt-4 max-w-2xl text-muted">
          {tr('Med API-et kan egne systemer sende hastemeldinger, endre tekster og oppdatere lagertall på skjermene. Det virker også med Zapier, Make og Power Automate, uten programmering.')}
        </p>

        <section className="mt-8 space-y-3 rounded-2xl border border-line bg-card p-5 text-sm leading-relaxed">
          <h2 className="m-0 text-base font-bold">{tr('Kom i gang')}</h2>
          <ol className="m-0 list-decimal space-y-1 pl-5 text-muted">
            <li>{tr('En eier lager en API-nøkkel under Konto → API i Flatr.')}</li>
            <li>
              {tr('Send nøkkelen i hver forespørsel:')} <code className="rounded bg-zone px-1">{tr('Authorization: Bearer flatr_…')}</code>
            </li>
            <li>
              {tr('Adressen er')} <code className="rounded bg-zone px-1">{BASE}</code>{tr(', der <kunde> er adressen dere bruker til Flatr.')}
            </li>
          </ol>
          <p className="m-0 text-muted">{tr('Kroppen er JSON. Høyst 120 forespørsler i minuttet per nøkkel. Feil gir en status over 400 og')} {tr('{ \"error\": \"…\" }')} {tr('med forklaring.')}</p>
        </section>

        <div className="mt-8 space-y-4">
          {ENDPOINTS.map((e) => (
            <section key={`${e.method} ${e.path}`} className="rounded-2xl border border-line bg-card p-5 text-sm">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="rounded-md bg-brand-tint px-2 py-0.5 font-mono text-xs font-bold text-brand">{e.method}</span>
                <code className="font-mono text-sm font-semibold">{e.path}</code>
                <span className="text-muted">· {e.title}</span>
              </div>
              <p className="m-0 mt-2 leading-relaxed text-muted">{e.text}</p>
              {e.body && <pre className="m-0 mt-3 overflow-x-auto rounded-xl bg-zone p-3 text-xs">{e.body}</pre>}
              {e.response && <pre className="m-0 mt-2 overflow-x-auto rounded-xl bg-zone p-3 text-xs text-muted">→ {e.response}</pre>}
            </section>
          ))}
        </div>

        <section className="mt-8 space-y-3 text-sm leading-relaxed">
          <h2 className="m-0 text-lg font-bold">{tr('Eksempel med curl')}</h2>
          <pre className="m-0 overflow-x-auto rounded-xl border border-line bg-card p-4 text-xs">{`curl -X POST ${BASE}/alerts \\
  -H "Authorization: Bearer flatr_…" \\
  -H "Content-Type: application/json" \\
  -d '{"message":"Kantina stenger kl. 13 i dag","severity":"warning","display":"banner","duration_minutes":120}'`}</pre>
          <h2 className="m-0 pt-4 text-lg font-bold">{tr('Zapier, Make og Power Automate')}</h2>
          <ul className="m-0 list-disc space-y-1 pl-5 text-muted">
            <li>
              <strong className="text-ink">{tr('Zapier:')}</strong> {tr('legg til et steg «Webhooks by Zapier» → «Custom Request», med metode, adresse og Authorization-header som over.')}
            </li>
            <li>
              <strong className="text-ink">{tr('Make:')}</strong> {tr('bruk modulen «HTTP» → «Make a request».')}
            </li>
            <li>
              <strong className="text-ink">{tr('Power Automate:')}</strong> {tr('bruk handlingen «HTTP» (premium) med metode, URI, headere og kropp.')}
            </li>
          </ul>
          <p className="m-0 text-muted">{tr('Eksempel: når et skjema i Microsoft Forms sendes inn, endres teksten «dagens-tilbud» på skjermene.')}</p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
