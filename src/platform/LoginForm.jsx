// Innloggingsskjema (e-post + passord, og kode hvis tofaktor er slått på).
// Brukes både på flatr.no/login og på kundens /admin.
import { useEffect, useState } from 'react';
import { authClient } from '../lib/authClient.js';
import { Button, ErrorText, Field, Input } from '../admin/components/ui.jsx';

const LOGOS = {
  google: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.8 0-5.2-1.9-6.1-4.5H2.2v2.8A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.9 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.2a11 11 0 0 0 0 9.9l3.7-2.8z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3 .6 4.1 1.6l3.1-3.1A11 11 0 0 0 2.2 7.1l3.7 2.8C6.8 7.3 9.2 5.4 12 5.4z" />
    </svg>
  ),
  microsoft: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
      <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
      <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
      <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
    </svg>
  )
};
const LABEL = { google: 'Google', microsoft: 'Microsoft' };

let providersPromise = null;
/** Hvilke av Google/Microsoft som er satt opp på serveren (/api/context). */
const loadProviders = () =>
  (providersPromise ||= fetch('/api/context')
    .then((r) => (r.ok ? r.json() : {}))
    .then((c) => c.social || [])
    .catch(() => []));

/** «Fortsett med Google / Microsoft». Vises bare når de er satt opp. */
export function SocialButtons({ callbackURL, divider = 'eller med e-post' }) {
  const [providers, setProviders] = useState([]);
  const [busy, setBusy] = useState(null);
  // Better Auth sender tilbake hit med ?error= når innloggingen stoppes,
  // f.eks. fordi kontoen har tofaktor (da må e-post, passord og kode brukes).
  const [error, setError] = useState(() =>
    new URLSearchParams(window.location.search).get('error') ? 'Innloggingen ble ikke fullført. Har du tofaktor på kontoen, logg inn med e-post, passord og kode.' : ''
  );
  useEffect(() => {
    loadProviders().then(setProviders);
  }, []);
  if (!providers.length) return null;
  return (
    <div className="space-y-3">
      {providers.map((p) => (
        <button
          key={p}
          type="button"
          disabled={!!busy}
          onClick={async () => {
            setBusy(p);
            setError('');
            try {
              await authClient.social(p, callbackURL || window.location.href);
            } catch (err) {
              setError(err.message);
              setBusy(null);
            }
          }}
          className="flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-line bg-card text-sm font-semibold text-ink transition-colors hover:bg-zone disabled:opacity-60"
        >
          {LOGOS[p]}
          {busy === p ? 'Sender deg videre …' : `Fortsett med ${LABEL[p]}`}
        </button>
      ))}
      <ErrorText>{error}</ErrorText>
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" />
        {divider}
        <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}

export default function LoginForm({ onDone, defaultEmail = '' }) {
  const [step, setStep] = useState('password'); // password | code | backup
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [trust, setTrust] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (fn) => {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(err.message);
      if (err.code === 'INVALID_TWO_FACTOR_COOKIE') setStep('password');
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = (e) => {
    e.preventDefault();
    run(async () => {
      const res = await authClient.signIn(email.trim(), password);
      if (res.twoFactor) {
        setStep('code');
        setCode('');
      } else {
        await onDone();
      }
    });
  };

  const submitCode = (e) => {
    e.preventDefault();
    run(async () => {
      if (step === 'backup') await authClient.verifyBackupCode(code.trim());
      else await authClient.verifyTotp(code.replace(/\s/g, ''), trust);
      await onDone();
    });
  };

  if (step !== 'password') {
    return (
      <form onSubmit={submitCode} className="space-y-4">
        <p className="m-0 text-sm text-muted">
          {step === 'backup'
            ? 'Skriv inn en av reservekodene du fikk da du slo på tofaktor. Hver kode kan bare brukes én gang.'
            : 'Skriv inn den 6-sifrede koden fra autentiseringsappen din.'}
        </p>
        <Field label={step === 'backup' ? 'Reservekode' : 'Kode'}>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode={step === 'backup' ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            placeholder={step === 'backup' ? 'xxxxx-xxxxx' : '123 456'}
            required
            autoFocus
          />
        </Field>
        {step === 'code' && (
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} className="h-4 w-4 rounded border-line text-brand" />
            Husk denne enheten i 30 dager
          </label>
        )}
        <ErrorText>{error}</ErrorText>
        <Button type="submit" className="w-full py-3" disabled={busy}>
          {busy ? 'Sjekker …' : 'Logg inn'}
        </Button>
        <div className="flex justify-between text-sm">
          <button type="button" className="font-semibold text-brand hover:underline" onClick={() => (setStep(step === 'backup' ? 'code' : 'backup'), setError(''), setCode(''))}>
            {step === 'backup' ? 'Bruk kode fra appen' : 'Bruk en reservekode'}
          </button>
          <button type="button" className="text-muted hover:text-ink" onClick={() => (setStep('password'), setError(''))}>
            Tilbake
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submitPassword} className="space-y-4">
      {/* Kundens /admin kommer tilbake hit; på flatr.no til /login (velg organisasjon). */}
      {/* Tilbake til samme side (flatr.no/login?next=…), så man kommer dit man skulle. */}
      <SocialButtons callbackURL={window.location.pathname.startsWith('/admin') || window.location.pathname === '/login' ? window.location.href : `${window.location.origin}/login`} />
      <Field label="E-post">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="deg@firma.no" required autoFocus={!defaultEmail} />
      </Field>
      <Field label="Passord">
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required autoFocus={!!defaultEmail} />
      </Field>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" className="w-full py-3" disabled={busy}>
        {busy ? 'Logger inn …' : 'Logg inn'}
      </Button>
      <div className="text-center text-sm">
        <a href={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ''}`} className="font-semibold text-brand hover:underline">
          Glemt passord – eller første gang?
        </a>
      </div>
    </form>
  );
}
