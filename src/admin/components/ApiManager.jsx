// API (Konto → API): nøkler til kundenes egne systemer, og en kort oversikt med
// eksempler for akkurat denne kontoen. Full dokumentasjon: flatr.no/hjelp/api.

import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { Button, Input, PageHeader, ErrorText, Icon } from './ui.jsx';
import { tr, locale } from '../../lib/i18n.js';

const fmt = (iso) => (iso ? new Date(iso).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'aldri');
const apex = () => window.location.host.split('.').slice(1).join('.');

function Example({ title, code }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-muted">{title}</div>
      <pre className="m-0 overflow-x-auto rounded-xl border border-line bg-paper p-3 text-xs leading-relaxed text-ink">{code}</pre>
    </div>
  );
}

export default function ApiManager() {
  const [keys, setKeys] = useState(null);
  const [name, setName] = useState('');
  const [fresh, setFresh] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const load = () =>
    api.keys
      .list()
      .then(setKeys)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const create = async (e) => {
    e.preventDefault();
    setError('');
    try {
      setFresh(await api.keys.create(name.trim()));
      setName('');
      setCopied(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const base = `${window.location.origin}/api/v1`;
  const key = fresh?.key || 'flatr_…';

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-6 pb-12 pt-8 sm:px-8">
      <PageHeader title="API" subtitle={tr('La egne systemer – eller Zapier, Make og Power Automate – sende hastemeldinger, endre tekster og oppdatere lagertall i Flatr.')} />

      <section className="space-y-4 rounded-2xl border border-line bg-card p-5 shadow-card">
        <h2 className="m-0 text-base font-bold text-ink">{tr('API-nøkler')}</h2>
        <form onSubmit={create} className="flex flex-wrap gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('Navn, f.eks. «Lagersystemet» eller «Zapier»')} className="min-w-0 flex-1" maxLength={60} />
          <Button type="submit" disabled={!name.trim()}>
            <Icon name="plus" className="h-4 w-4" />
            {tr('Lag nøkkel')}
          </Button>
        </form>
        <ErrorText>{error}</ErrorText>

        {fresh && (
          <div className="space-y-2 rounded-xl border border-brand/40 bg-brand-tint p-4">
            <div className="text-sm font-semibold text-ink">{tr('Nøkkelen «')}{fresh.name}{tr('» – kopier den nå, du ser den ikke igjen:')}</div>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg bg-card px-3 py-2 text-sm text-ink">{fresh.key}</code>
              <Button
                size="sm"
                onClick={() => {
                  navigator.clipboard?.writeText(fresh.key).then(() => setCopied(true));
                }}
              >
                {copied ? tr('Kopiert ✓') : tr('Kopier')}
              </Button>
            </div>
            <p className="m-0 text-xs text-muted">{tr('Behandle den som et passord. Den gir full tilgang til det API-et kan gjøre, for hele kontoen.')}</p>
          </div>
        )}

        <ul className="m-0 list-none divide-y divide-hair p-0">
          {(keys || []).map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-semibold text-ink">{k.name}</span>
                <span className="ml-2 font-mono text-xs text-muted">{k.prefix}…</span>
              </span>
              <span className="text-xs text-muted">{tr('Sist brukt')} {fmt(k.last_used_at)}</span>
              <button
                type="button"
                onClick={async () => {
                  if (!confirm(tr('Trekke tilbake «{0}»? Systemer som bruker den, slutter å virke.', [k.name]))) return;
                  await api.keys.remove(k.id).catch((e) => setError(e.message));
                  load();
                }}
                className="text-xs font-semibold text-danger hover:underline"
              >
                {tr('Trekk tilbake')}
              </button>
            </li>
          ))}
        </ul>
        {keys && !keys.length && <p className="m-0 text-sm text-muted">{tr('Ingen nøkler ennå.')}</p>}
      </section>

      <section className="space-y-4 rounded-2xl border border-line bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="m-0 text-base font-bold text-ink">{tr('Slik bruker du den')}</h2>
          <a href={`${window.location.protocol}//${apex()}/hjelp/api`} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand hover:underline">
            {tr('Full dokumentasjon →')}
          </a>
        </div>
        <Example
          title={tr('Send en hastemelding til alle skjermene i 30 minutter')}
          code={`curl -X POST ${base}/alerts \\\n  -H "Authorization: Bearer ${key}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"title":"Brannøvelse","message":"Gå ut via nærmeste utgang","severity":"critical","duration_minutes":30}'`}
        />
        <Example
          title={tr('Endre en tekst (gi tekstelementet et API-navn i editoren, f.eks. «dagens-tilbud»)')}
          code={`curl -X PUT ${base}/texts/dagens-tilbud \\\n  -H "Authorization: Bearer ${key}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"text":"Kaffe og bolle 39 kr"}'`}
        />
        <Example
          title={tr('Oppdater én vare i Lagerbeholdning')}
          code={`curl -X PATCH ${base}/stock/Hvetemel \\\n  -H "Authorization: Bearer ${key}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"amount":"1 250"}'`}
        />
        <p className="m-0 text-xs text-muted">{tr('Zapier, Make og Power Automate: bruk et steg som sender en HTTP-forespørsel («Webhooks by Zapier», «HTTP» i Make, «HTTP» i Power Automate) med adressene over.')}</p>
      </section>
    </div>
  );
}
