// Eksport og sletting (brukermenyen): last ned alt innholdet i organisasjonen
// som én ZIP, eller slett organisasjonen for godt. Begge deler bare for eiere.
// ConfirmDelete brukes også av «Slett kontoen» under Konto og sikkerhet.

import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { authClient } from '../../lib/authClient.js';
import { Button, Card, Field, Input, PageHeader, ErrorText, Icon } from './ui.jsx';
import { tr, locale } from '../../lib/i18n.js';

const LINK_BUTTON =
  'inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-onbrand no-underline shadow-card transition-all hover:bg-brand-dark hover:shadow-pop';

const size = (bytes) =>
  bytes >= 1e9 ? `${(bytes / 1e9).toLocaleString(locale(), { maximumFractionDigits: 1 })} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`;

/** Skjema for å slette noe for godt: skriv `expected` – og passordet, hvis du har et. */
export function ConfirmDelete({ expected, label, button, onDelete }) {
  // Logger du bare inn med Google eller Microsoft, er det ikke noe passord å skrive.
  const [hasPassword, setHasPassword] = useState(true);
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    authClient
      .accounts()
      .then((list) => setHasPassword((list || []).some((a) => a.providerId === 'credential')))
      .catch(() => {});
  }, []);
  const matches = confirm.trim().toLowerCase() === expected.trim().toLowerCase();

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError('');
        setBusy(true);
        try {
          const res = await onDelete(confirm.trim(), password);
          window.location.href = res?.redirect || '/';
        } catch (err) {
          setError(err.message);
          setBusy(false);
        }
      }}
      className="grid gap-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={label}>
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={expected} autoComplete="off" spellCheck={false} />
        </Field>
        {hasPassword && (
          <Field label={tr('Passordet ditt')}>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </Field>
        )}
      </div>
      <ErrorText>{error}</ErrorText>
      <div>
        <Button type="submit" variant="danger" disabled={busy || !matches || (hasPassword && !password)}>
          <Icon name="trash" className="h-4 w-4" />
          {busy ? tr('Sletter …') : button}
        </Button>
      </div>
    </form>
  );
}

export default function DataManager({ me, tenant }) {
  const owner = me?.role === 'owner';
  const name = tenant?.name || '';
  const [plan, setPlan] = useState(null);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (owner) api.plan.get().then(setPlan).catch(() => {});
  }, [owner]);

  return (
    <>
      <PageHeader title={tr('Eksport og sletting')} subtitle={tr('Last ned alt dere har i Flatr, eller slett organisasjonen.')} />
      <div className="mx-auto w-full max-w-3xl space-y-6 px-6 pb-12 pt-4 sm:px-8">
        {me && !owner && (
          <Card>
            <p className="m-0 text-sm text-muted">{tr('Bare eiere kan laste ned alt innholdet eller slette organisasjonen. Eierne finner du under Team.')}</p>
          </Card>
        )}
        {owner && (
          <>
            <Card title={tr('Last ned alt')}>
              <p className="m-0 text-sm leading-relaxed text-muted">
                {tr('Én ZIP-fil med alt innholdet i')} {name}{tr(': presentasjoner og lysbilder, skjermer, apper, innstillinger, avstemninger, historikk og statistikk som JSON, og alle filene i biblioteket')}
                {plan?.storage?.used ? tr(' (omtrent {0})', [size(plan.storage.used)]) : ''}{tr('. Pålogging til integrasjoner og API-nøkler er ikke med.')}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <a
                  href="/api/export"
                  download
                  onClick={() => {
                    // Låst en stund, så et dobbeltklikk ikke starter to nedlastinger.
                    setStarted(true);
                    setTimeout(() => setStarted(false), 15_000);
                  }}
                  className={`${LINK_BUTTON} ${started ? 'pointer-events-none opacity-50' : ''}`}
                  aria-disabled={started}
                >
                  <Icon name="download" className="h-4 w-4" />
                  {tr('Last ned ZIP')}
                </a>
                {started && <span className="text-sm text-muted">{tr('Nedlastingen er startet. Med mange filer i biblioteket kan den ta litt tid.')}</span>}
              </div>
            </Card>

            <Card title={tr('Slett organisasjonen')}>
              <p className="m-0 mb-4 text-sm leading-relaxed text-muted">
                {tr('Sletter')} {name} {tr('for godt: alle presentasjoner, skjermer, filer i biblioteket, apper, statistikk og teamets tilgang.')}{' '}
                {window.location.host} {tr('slutter å virke, og skjermene slutter å vise innholdet. Dette kan ikke angres – last ned alt først hvis dere vil ta vare på noe. Kontoene til teamet blir ikke slettet.')}
              </p>
              <ConfirmDelete expected={name} label={tr('Skriv «{0}» for å bekrefte', [name])} button={tr('Slett organisasjonen for godt')} onDelete={api.org.remove} />
            </Card>
          </>
        )}
      </div>
    </>
  );
}
