// Innloggingsskjema (e-post + passord, og kode hvis tofaktor er slått på).
// Brukes både på flatr.no/login og på kundens /admin.
import { useState } from 'react';
import { authClient } from '../lib/authClient.js';
import { Button, ErrorText, Field, Input } from '../admin/components/ui.jsx';

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
