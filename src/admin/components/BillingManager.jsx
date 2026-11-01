// Abonnement (brukermenyen): planen, bruken og betalingen. Eiere oppgraderer til
// Pro eller Lag og frivillige (organisasjonsnummeret sjekkes mot Enhetsregisteret
// og Frivillighetsregisteret), endrer antall skjermer og lagring, og går til
// Stripe for kort, kvitteringer og oppsigelse. Prisene: src/lib/pricing.js.

import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import { PLANS, STORAGE_ADDONS, FREE, YEAR_MONTHS, quote, kr, validOrgNumber } from '../../lib/pricing.js';
import { Button, Card, Field, Input, Select, Segmented, PageHeader, ErrorText, Icon } from './ui.jsx';

const gb = (bytes) => `${(bytes / 1024 ** 3).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} GB`;
const date = (iso) => (iso ? new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

const STATUS = {
  active: ['Aktiv', 'ok'],
  trialing: ['Prøveperiode', 'ok'],
  past_due: ['Betalingen feilet', 'warn'],
  unpaid: ['Ubetalt', 'danger'],
  canceled: ['Avsluttet', 'muted'],
  incomplete: ['Venter på betaling', 'warn'],
  incomplete_expired: ['Betalingen ble ikke fullført', 'muted'],
  paused: ['Satt på pause', 'muted']
};
const TONE = {
  ok: 'bg-ok-tint text-ok',
  warn: 'bg-warn-tint text-warn',
  danger: 'bg-danger-tint text-danger',
  muted: 'bg-hair text-muted'
};

function Fact({ label, children }) {
  return (
    <div>
      <div className="text-xs font-semibold text-muted">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-ink">{children}</div>
    </div>
  );
}

/** Planen nå: hva som gjelder, bruken og neste betaling. */
function Current({ b, onPortal, busy }) {
  const plan = PLANS[b.plan];
  const [label, tone] = STATUS[b.status] || [];
  const ending = b.cancel_at_period_end && b.period_end;
  return (
    <Card title="Planen nå">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-2xl font-bold tracking-tight text-ink">{plan ? plan.name : 'Gratis'}</span>
        {plan && label && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[tone]}`}>{ending ? `Avsluttes ${date(b.period_end)}` : label}</span>}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Fact label="Skjermer">
          {b.screens.used} av {b.screens.limit} i bruk
        </Fact>
        <Fact label="Lagring">
          {gb(b.storage.used)} av {gb(b.storage.limit)}
        </Fact>
        {plan ? (
          <Fact label={ending ? 'Gjelder til' : b.collection === 'invoice' ? 'Neste faktura' : 'Neste betaling'}>
            {date(b.period_end) || '–'}
            <span className="block text-xs font-normal text-muted">
              {b.interval === 'year' ? 'Årlig' : 'Månedlig'} · {b.collection === 'invoice' ? 'faktura' : 'kort'}
            </span>
          </Fact>
        ) : (
          <Fact label="Pris">0 kr</Fact>
        )}
      </div>
      {b.status === 'past_due' && (
        <p className="m-0 mt-4 rounded-xl bg-warn-tint px-4 py-3 text-sm text-ink">
          Vi fikk ikke trukket den siste betalingen. Oppdater kortet, så prøver vi igjen. Skjermene virker som før i noen dager til.
        </p>
      )}
      {!plan && b.last_plan && (
        <p className="m-0 mt-4 rounded-xl bg-hair px-4 py-3 text-sm text-ink">
          Abonnementet er avsluttet. Skjermer over grensen i gratisplanen viser en beskjed i stedet for innholdet til dere fornyer.
        </p>
      )}
      {b.can_manage && b.enabled && (plan || b.last_plan) && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={onPortal} disabled={busy}>
            <Icon name="external" className="h-4 w-4" />
            Kort, kvitteringer og oppsigelse
          </Button>
        </div>
      )}
    </Card>
  );
}

/** Pris for valget: linjene, sum per måned og hva som betales nå (med mva). */
function Summary({ choice, vat }) {
  const q = quote({ ...choice, vat });
  const plan = PLANS[choice.plan];
  const lines = [];
  let left = choice.screens;
  let from = 0;
  for (const [upTo, price] of plan.tiers) {
    const n = Math.min(left, upTo - from);
    if (n > 0) lines.push([`${n} ${n === 1 ? 'skjerm' : 'skjermer'} × ${kr(price)}`, n * price]);
    left -= n;
    from = upTo;
  }
  if (choice.storageGb) lines.push([`Ekstra lagring, ${choice.storageGb} GB`, STORAGE_ADDONS.find(([g]) => g === choice.storageGb)[1]]);
  return (
    <div className="rounded-xl border border-line bg-paper p-4 text-sm">
      <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 tabular-nums">
        {lines.map(([label, amount]) => (
          <div key={label} className="contents">
            <dt className="text-muted">{label}</dt>
            <dd className="m-0 text-right">{kr(amount)} / mnd</dd>
          </div>
        ))}
        {choice.interval === 'year' && (
          <div className="contents">
            <dt className="text-muted">Årlig: {YEAR_MONTHS} måneder (to gratis)</dt>
            <dd className="m-0 text-right">{kr(q.net)}</dd>
          </div>
        )}
        {vat && (
          <div className="contents">
            <dt className="text-muted">Mva. 25 %</dt>
            <dd className="m-0 text-right">{kr(q.vat)}</dd>
          </div>
        )}
        <div className="contents font-semibold text-ink">
          <dt className="border-t border-line pt-2">{choice.interval === 'year' ? 'Per år' : 'Per måned'}</dt>
          <dd className="m-0 border-t border-line pt-2 text-right">{kr(q.total)}</dd>
        </div>
      </dl>
    </div>
  );
}

/** Organisasjonsnummer -> navn, adresse og Frivillighetsregisteret. */
function OrgLookup({ value, onChange, org, onOrg }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const look = async () => {
    setError('');
    onOrg(null);
    if (!validOrgNumber(value)) return setError('Organisasjonsnummeret er ikke gyldig. Sjekk at alle de 9 sifrene er riktige.');
    setBusy(true);
    try {
      onOrg(await api.billing.org(value.replace(/\s/g, '')));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            onOrg(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), look())}
          inputMode="numeric"
          placeholder="9 siffer, f.eks. 982 129 265"
          maxLength={11}
          className="max-w-[220px]"
        />
        <Button type="button" variant="outline" onClick={look} disabled={busy || !value.trim()}>
          {busy ? 'Henter …' : 'Hent'}
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
      {org && (
        <div className="rounded-xl border border-line bg-paper px-4 py-3 text-sm">
          <div className="font-semibold text-ink">{org.name}</div>
          <div className="text-muted">
            {[org.address?.line1, [org.address?.postal_code, org.address?.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}
            {org.form ? ` · ${org.form}` : ''}
          </div>
          <div className={`mt-1.5 flex items-center gap-1.5 text-xs font-semibold ${org.volunteer ? 'text-ok' : 'text-muted'}`}>
            <Icon name={org.volunteer ? 'check' : 'x'} className="h-3.5 w-3.5" />
            {org.volunteer ? 'Står i Frivillighetsregisteret – Lag og frivillige gjelder' : 'Står ikke i Frivillighetsregisteret'}
          </div>
          {!org.active && <div className="mt-1 text-xs font-semibold text-danger">Organisasjonen er under avvikling eller konkurs.</div>}
        </div>
      )}
    </div>
  );
}

function PlanCard({ plan, selected, disabled, note, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`flex flex-col rounded-xl border p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 ${selected ? 'border-brand bg-brand-tint' : 'border-line bg-paper hover:border-brand/50'}`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-semibold text-ink">{plan.name}</span>
        {selected && <Icon name="check" className="h-4 w-4 text-brand" />}
      </span>
      <span className="mt-1 text-sm text-muted">
        <span className="text-lg font-bold text-ink">{kr(plan.tiers[0][1])}</span> / skjerm / mnd
      </span>
      <span className="mt-1 text-xs text-muted">{note}</span>
    </button>
  );
}

/** Velg plan, skjermer, lagring og betaling – til ny bestilling eller endring. */
function Order({ b, me, onDone }) {
  const paid = !!PLANS[b.plan];
  const [plan, setPlan] = useState(paid ? b.plan : 'pro');
  const [screens, setScreens] = useState(Math.max(paid ? b.paid_screens : b.screens.used, 1));
  const [storageGb, setStorageGb] = useState(paid ? b.extra_storage_gb : 0);
  const [period, setPeriod] = useState(paid ? b.interval || 'month' : 'month');
  const [invoice, setInvoice] = useState(false);
  const [orgNumber, setOrgNumber] = useState(b.org?.number || '');
  const [org, setOrg] = useState(null);
  const [email, setEmail] = useState(b.email || me?.email || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Lagret organisasjon: hent den på nytt, så Frivillighetsregisteret er oppdatert.
  useEffect(() => {
    if (b.org?.number)
      api.billing
        .org(b.org.number)
        .then(setOrg)
        .catch(() => {});
  }, [b.org?.number]);

  const clubOk = !!org?.volunteer && org.active;
  useEffect(() => {
    if (plan === 'club' && org && !clubOk) setPlan('pro');
  }, [org, clubOk, plan]);
  const choice = { plan, screens: Math.max(1, Number(screens) || 1), storageGb: Number(storageGb) || 0, interval: period };
  const tooFew = choice.screens < b.screens.used;
  const unchanged =
    paid && choice.plan === b.plan && choice.screens === b.paid_screens && choice.storageGb === (b.extra_storage_gb || 0) && choice.interval === b.interval;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (paid) {
        onDone(await api.billing.change({ plan, screens: choice.screens, storage_gb: choice.storageGb, interval: period }), 'Abonnementet er endret.');
        setBusy(false);
        return;
      }
      const res = await api.billing.checkout({ ...choice, storage_gb: choice.storageGb, org_number: org?.number || null, email, invoice: invoice && period === 'year' });
      if (res.url) window.location.href = res.url;
      else {
        onDone(res.billing, 'Takk! Abonnementet er i gang. Fakturaen kommer på e-post.');
        setBusy(false);
      }
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Card title={paid ? 'Endre abonnementet' : 'Oppgrader'}>
      <form onSubmit={submit} className="grid gap-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <PlanCard plan={PLANS.pro} selected={plan === 'pro'} onSelect={() => setPlan('pro')} note="24 kr fra skjerm nr. 20 · video · 20 GB lagring" />
          <PlanCard
            plan={PLANS.club}
            selected={plan === 'club'}
            disabled={!clubOk}
            onSelect={() => setPlan('club')}
            note={clubOk ? 'Halv pris · video · 15 GB lagring' : 'Halv pris for lag og foreninger i Frivillighetsregisteret – hent organisasjonsnummeret under'}
          />
        </div>

        {!paid && (
          <Field label="Organisasjonsnummer" hint="Navn og adresse hentes fra Enhetsregisteret og kommer på kvitteringene. Lag og foreninger i Frivillighetsregisteret får halv pris.">
            <OrgLookup value={orgNumber} onChange={setOrgNumber} org={org} onOrg={setOrg} />
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Skjermer" hint={tooFew ? `Dere har ${b.screens.used} skjermer i bruk.` : `${b.screens.used} i bruk nå`}>
            <Input type="number" min={1} max={500} value={screens} onChange={(e) => setScreens(e.target.value)} />
          </Field>
          <Field label="Ekstra lagring" hint={`${PLANS[plan].storageGb} GB er med i ${PLANS[plan].name}`}>
            <Select value={storageGb} onChange={(e) => setStorageGb(Number(e.target.value))}>
              <option value={0}>Ingen</option>
              {STORAGE_ADDONS.map(([g, price]) => (
                <option key={g} value={g}>
                  +{g} GB ({price} kr / mnd)
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Betaling">
            <Segmented
              value={period}
              onChange={setPeriod}
              options={[
                { value: 'month', label: 'Månedlig' },
                { value: 'year', label: 'Årlig' }
              ]}
            />
          </Field>
        </div>

        {!paid && period === 'year' && org && (
          <label className="flex items-start gap-3 text-sm text-ink">
            <input type="checkbox" checked={invoice} onChange={(e) => setInvoice(e.target.checked)} className="mt-1 h-4 w-4 accent-[rgb(var(--c-brand))]" />
            <span>
              Betal med faktura i stedet for kort
              <span className="block text-xs text-muted">Fakturaen sendes til e-postadressen under, med 14 dagers forfall.</span>
            </span>
          </label>
        )}

        {!paid && (
          <Field label="E-post for kvitteringer og fakturaer">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="max-w-sm" />
          </Field>
        )}

        <Summary choice={choice} vat={b.vat} />
        <ErrorText>{error}</ErrorText>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy || tooFew || unchanged || (!paid && !email)}>
            {busy ? 'Et øyeblikk …' : paid ? 'Lagre endringene' : invoice && period === 'year' && org ? 'Bestill med faktura' : 'Gå til betaling'}
          </Button>
          <span className="text-xs text-muted">
            {paid
              ? 'Mer faktureres med en gang for resten av perioden. Mindre trekkes fra neste betaling.'
              : 'Kortbetalingen skjer hos Stripe. Du kan endre antall skjermer eller si opp når som helst.'}
          </span>
        </div>
      </form>
    </Card>
  );
}

export default function BillingManager({ me, tenant }) {
  const [b, setB] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Tilbake fra Stripe Checkout: hent abonnementet med en gang (webhooken kan komme litt etter).
    const params = new URLSearchParams(window.location.search);
    const session = params.get('session');
    if (session) {
      params.delete('session');
      window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
      api.billing
        .sync(session)
        .then((res) => {
          setB(res);
          if (PLANS[res.plan]) setNotice(`Takk! ${PLANS[res.plan].name} er aktivert.`);
        })
        .catch((err) => setError(err.message));
    } else {
      api.billing
        .get()
        .then(setB)
        .catch((err) => setError(err.message));
    }
  }, []);

  const portal = async () => {
    setBusy(true);
    try {
      window.location.href = (await api.billing.portal()).url;
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const paidNow = useMemo(() => !!PLANS[b?.plan], [b]);

  return (
    <>
      <PageHeader title="Abonnement" subtitle={`Plan, skjermer og betaling for ${tenant?.name || 'organisasjonen'}.`} />
      <div className="mx-auto w-full max-w-3xl space-y-6 px-6 pb-12 pt-4 sm:px-8">
        <ErrorText>{error}</ErrorText>
        {notice && (
          <p role="status" className="m-0 rounded-xl bg-ok-tint px-4 py-3 text-sm font-semibold text-ok">
            {notice}
          </p>
        )}
        {!b && !error && <p className="text-sm text-muted">Henter abonnementet …</p>}
        {b && (
          <>
            <Current b={b} onPortal={portal} busy={busy} />
            {!b.can_manage && <p className="m-0 text-sm text-muted">Bare eiere kan endre abonnementet. Eierne finner du under Team.</p>}
            {b.can_manage && b.enabled && (!paidNow || !b.cancel_at_period_end) && (
              <Order
                key={`${b.plan}-${b.paid_screens}-${b.extra_storage_gb}-${b.interval}`}
                b={b}
                me={me}
                onDone={(next, text) => {
                  setB(next);
                  setNotice(text);
                }}
              />
            )}
            {b.can_manage && !b.enabled && (
              <Card title="Betaling kommer snart">
                <p className="m-0 text-sm leading-relaxed text-muted">
                  Pro koster {kr(PLANS.pro.tiers[0][1])} per skjerm i måneden, og Lag og frivillige {kr(PLANS.club.tiers[0][1])}. Gratisplanen har {FREE.screens}{' '}
                  skjerm. Trenger dere flere skjermer nå, kan dere be om det under Skjermer – i betaperioden er det gratis.
                </p>
              </Card>
            )}
          </>
        )}
      </div>
    </>
  );
}
