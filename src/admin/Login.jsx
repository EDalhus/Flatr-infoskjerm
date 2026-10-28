// Innlogging på kundens subdomene (<slug>.flatr.no/admin) – e-post og passord
// (+ kode ved tofaktor) via Better Auth. Én innlogging gjelder alle
// organisasjonene man er medlem av.
import { useEffect } from 'react';
import { authClient } from '../lib/authClient.js';
import { AuthShell } from '../platform/AuthPages.jsx';
import LoginForm from '../platform/LoginForm.jsx';
import { Button } from './components/ui.jsx';

export default function Login({ tenant, account }) {
  useEffect(() => {
    document.title = `Logg inn – ${tenant?.name ?? 'Flatr'}`;
  }, [tenant]);

  // Innlogget i Flatr, men ikke medlem av denne organisasjonen.
  if (account) {
    return (
      <AuthShell title="Ingen tilgang" subtitle={`Du er logget inn som ${account}, men er ikke medlem av ${tenant?.name ?? 'denne organisasjonen'}.`}>
        <div className="space-y-3">
          <p className="m-0 text-sm text-muted">Be en eier av organisasjonen om å invitere deg under Team.</p>
          <a href="/login" className="block text-center text-sm font-semibold text-brand hover:underline" onClick={(e) => (e.preventDefault(), (window.location.href = `${window.location.protocol}//${window.location.host.split('.').slice(1).join('.')}/login`))}>
            Mine organisasjoner
          </a>
          <Button variant="outline" className="w-full" onClick={() => authClient.signOut().then(() => window.location.reload())}>
            Logg inn med en annen konto
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={`Logg inn på ${tenant?.name ?? 'Flatr'}`}>
      <LoginForm onDone={() => window.location.reload()} />
    </AuthShell>
  );
}
