// Innlogging på kundens subdomene (<slug>.flatr.no/admin) – magisk lenke på e-post.
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { AuthShell, CheckEmail } from '../platform/AuthPages.jsx';
import { Button, ErrorText, Field, Input } from './components/ui.jsx';

export default function Login({ tenant }) {
  const expired = new URLSearchParams(window.location.search).get('login') === 'expired';
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    expired ? 'Innloggingslenken er utløpt eller allerede brukt. Be om en ny.' : ''
  );
  const [sent, setSent] = useState(false);

  useEffect(() => {
    document.title = `Logg inn – ${tenant?.name ?? 'Flatr'}`;
  }, [tenant]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.auth.request(email);
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title={sent ? 'Sjekk e-posten din' : `Logg inn på ${tenant?.name ?? 'Flatr'}`}
      subtitle={sent ? null : 'Vi sender deg en innloggingslenke på e-post. Ingen passord.'}
    >
      {sent ? (
        <CheckEmail email={email} onBack={() => setSent(false)}>
          Er du medlem av {tenant?.name ?? 'denne kontoen'}, finner du en innloggingslenke der.
        </CheckEmail>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="E-post">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="deg@firma.no"
              required
              autoFocus
            />
          </Field>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" className="w-full py-3" disabled={busy}>
            {busy ? 'Sender …' : 'Send innloggingslenke'}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
