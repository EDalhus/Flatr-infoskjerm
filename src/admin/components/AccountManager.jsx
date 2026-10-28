import { useEffect, useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { authClient } from '../../lib/authClient.js';
import { Icon, Field, Input, Button, Card, PageHeader, ErrorText } from './ui.jsx';

// Konto og sikkerhet: navn, passord, tofaktor (TOTP) og innloggede enheter.
// Alt går via Better Auth (/api/auth/*); kontoen gjelder alle organisasjonene.

function Notice({ children }) {
  return children ? <p className="m-0 mt-3 text-sm font-medium text-brand">{children}</p> : null;
}

function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const run = async (fn, ok) => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await fn();
      if (ok) setNotice(ok);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, notice, run, setError };
}

function Profile({ user, onChange }) {
  const [name, setName] = useState(user.name || '');
  const a = useAction();
  return (
    <Card title="Profil">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          a.run(async () => {
            await authClient.updateName(name.trim());
            onChange();
          }, 'Navnet er lagret.');
        }}
        className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      >
        <Field label="Navn">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
        </Field>
        <Field label="E-post">
          <Input value={user.email} readOnly disabled />
        </Field>
        <Button type="submit" disabled={a.busy || name.trim() === (user.name || '')}>
          Lagre
        </Button>
      </form>
      <ErrorText>{a.error}</ErrorText>
      <Notice>{a.notice}</Notice>
    </Card>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const a = useAction();
  return (
    <Card title="Passord">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (next !== again) return a.setError('De nye passordene er ikke like.');
          const ok = await a.run(() => authClient.changePassword(current, next), 'Passordet er byttet. Andre enheter er logget ut.');
          if (ok) {
            setCurrent('');
            setNext('');
            setAgain('');
          }
        }}
        className="grid gap-4"
      >
        <Field label="Nåværende passord">
          <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nytt passord" hint="Minst 10 tegn.">
            <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={10} required />
          </Field>
          <Field label="Gjenta nytt passord">
            <Input type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" required />
          </Field>
        </div>
        <div>
          <Button type="submit" disabled={a.busy}>
            {a.busy ? 'Lagrer …' : 'Bytt passord'}
          </Button>
        </div>
      </form>
      <ErrorText>{a.error}</ErrorText>
      <Notice>{a.notice}</Notice>
      <p className="m-0 mt-3 text-xs text-muted">
        Har du ikke satt passord ennå (konto fra før passordinnlogging)? Bruk{' '}
        <a href="/forgot-password" className="font-semibold text-brand hover:underline">
          Sett passord
        </a>
        .
      </p>
    </Card>
  );
}

function BackupCodes({ codes }) {
  const text = codes.join('\n');
  return (
    <div className="rounded-xl border border-line bg-zone p-4">
      <div className="mb-2 text-sm font-semibold text-ink">Reservekoder</div>
      <p className="m-0 mb-3 text-xs text-muted">
        Ta vare på disse et trygt sted (f.eks. i passordbehandleren). Hver kode kan brukes én gang hvis du mister telefonen.
      </p>
      <pre className="m-0 grid grid-cols-2 gap-1 font-mono text-sm text-ink">
        {codes.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </pre>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(text)}>
          <Icon name="copy" className="h-4 w-4" />
          Kopier
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([`Flatr – reservekoder\n\n${text}\n`], { type: 'text/plain' }));
            Object.assign(document.createElement('a'), { href: url, download: 'flatr-reservekoder.txt' }).click();
            URL.revokeObjectURL(url);
          }}
        >
          Last ned
        </Button>
      </div>
    </div>
  );
}

export function TwoFactorCard({ enabled, onChange }) {
  const [password, setPassword] = useState('');
  const [setup, setSetup] = useState(null); // { totpURI, backupCodes }
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState(null);
  const a = useAction();

  const qr = useMemo(() => {
    if (!setup?.totpURI) return null;
    const q = qrcode(0, 'M');
    q.addData(setup.totpURI);
    q.make();
    return q.createDataURL(5, 2);
  }, [setup]);
  const secret = setup?.totpURI ? new URL(setup.totpURI).searchParams.get('secret') : '';

  if (codes) {
    return (
      <Card title="Tofaktor-innlogging">
        <p className="m-0 mb-4 flex items-center gap-2 text-sm font-semibold text-brand">
          <Icon name="check" className="h-4 w-4" /> Tofaktor er slått på.
        </p>
        <BackupCodes codes={codes} />
        <Button className="mt-4" onClick={() => (setCodes(null), onChange())}>
          Ferdig
        </Button>
      </Card>
    );
  }

  if (setup) {
    return (
      <Card title="Slå på tofaktor">
        <ol className="m-0 grid gap-4 pl-5 text-sm text-ink">
          <li>
            Skann koden med en autentiseringsapp (Google Authenticator, Microsoft Authenticator, 1Password …).
            <div className="mt-3 flex flex-wrap items-center gap-4">
              {qr && <img src={qr} alt="QR-kode for tofaktor" className="h-40 w-40 rounded-lg border border-line bg-white p-1" />}
              <div className="text-xs text-muted">
                Kan du ikke skanne? Skriv inn nøkkelen:
                <div className="mt-1 break-all font-mono text-sm text-ink">{secret}</div>
              </div>
            </div>
          </li>
          <li>
            Skriv inn den 6-sifrede koden appen viser:
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await a.run(() => authClient.confirmTwoFactor(code.replace(/\s/g, '')));
                if (ok) setCodes(setup.backupCodes);
              }}
              className="mt-2 flex flex-wrap items-end gap-2"
            >
              <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="123 456" className="!w-40" required autoFocus />
              <Button type="submit" disabled={a.busy}>
                Bekreft
              </Button>
              <Button type="button" variant="ghost" onClick={() => setSetup(null)}>
                Avbryt
              </Button>
            </form>
          </li>
        </ol>
        <ErrorText>{a.error}</ErrorText>
      </Card>
    );
  }

  return (
    <Card title="Tofaktor-innlogging">
      <p className="m-0 mb-4 text-sm text-muted">
        {enabled
          ? 'Slått på. Når du logger inn, trenger du både passordet og en kode fra autentiseringsappen.'
          : 'Ekstra beskyttelse: i tillegg til passordet trengs en kode fra en app på telefonen. Selv om noen får tak i passordet, kommer de ikke inn.'}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (enabled) {
            const ok = await a.run(() => authClient.disableTwoFactor(password), 'Tofaktor er slått av.');
            if (ok) {
              setPassword('');
              onChange();
            }
          } else {
            await a.run(async () => setSetup(await authClient.enableTwoFactor(password)));
            setPassword('');
          }
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="min-w-[220px] flex-1">
          <Field label="Bekreft med passordet ditt">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </Field>
        </div>
        <Button type="submit" variant={enabled ? 'danger' : 'primary'} disabled={a.busy}>
          <Icon name="lock" className="h-4 w-4" />
          {enabled ? 'Slå av tofaktor' : 'Slå på tofaktor'}
        </Button>
        {enabled && (
          <Button
            type="button"
            variant="outline"
            disabled={a.busy || !password}
            onClick={async () => {
              await a.run(async () => setCodes((await authClient.generateBackupCodes(password)).backupCodes));
              setPassword('');
            }}
          >
            Nye reservekoder
          </Button>
        )}
      </form>
      <ErrorText>{a.error}</ErrorText>
      <Notice>{a.notice}</Notice>
    </Card>
  );
}

function SessionsCard() {
  const a = useAction();
  return (
    <Card title="Innloggede enheter">
      <p className="m-0 mb-4 text-sm text-muted">Logget inn på en maskin du ikke bruker lenger? Logg ut alle andre enheter enn denne.</p>
      <Button variant="outline" disabled={a.busy} onClick={() => a.run(() => authClient.revokeOtherSessions(), 'Alle andre enheter er logget ut.')}>
        <Icon name="logout" className="h-4 w-4" />
        Logg ut andre enheter
      </Button>
      <ErrorText>{a.error}</ErrorText>
      <Notice>{a.notice}</Notice>
    </Card>
  );
}

export default function AccountManager() {
  const [session, setSession] = useState(undefined);
  const load = () =>
    authClient
      .session()
      .then((s) => setSession(s))
      .catch(() => setSession(null));

  useEffect(() => {
    load();
  }, []);

  const user = session?.user;
  return (
    <>
      <PageHeader title="Konto og sikkerhet" subtitle="Gjelder deg i alle organisasjonene du er med i." />
      <div className="mx-auto w-full max-w-3xl space-y-6 px-6 pb-12 pt-4 sm:px-8">
        {session === undefined && <p className="text-sm text-muted">Henter kontoen …</p>}
        {session === null && (
          <Card title="Logg inn på nytt">
            <p className="m-0 text-sm text-muted">
              Du er logget inn med en eldre økt. Sett et passord og logg inn på nytt for å endre kontoinnstillingene.
            </p>
            <a href="/forgot-password" className="mt-3 inline-block font-semibold text-brand hover:underline">
              Sett passord →
            </a>
          </Card>
        )}
        {user && (
          <>
            <Profile user={user} onChange={load} />
            <PasswordCard />
            <TwoFactorCard enabled={!!user.twoFactorEnabled} onChange={load} />
            <SessionsCard />
          </>
        )}
      </div>
    </>
  );
}
