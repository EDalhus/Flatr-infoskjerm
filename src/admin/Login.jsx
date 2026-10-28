// Kundens subdomene (<slug>.flatr.no/admin) uten innlogging. All innlogging skjer
// på flatr.no/login (én adresse for passordbehandlere, ett sett med passord);
// derfra sendes man tilbake hit. Innloggingen gjelder alle organisasjonene man
// er medlem av. Innlogget, men ikke medlem her: «Ingen tilgang».
import { useEffect } from 'react';
import { authClient } from '../lib/authClient.js';
import { AuthShell } from '../platform/AuthPages.jsx';
import { Button } from './components/ui.jsx';

/** flatr.no/login med retur hit. */
export function platformLoginUrl(baseDomain, next = window.location.href) {
  const base = baseDomain || window.location.host.split('.').slice(1).join('.');
  return `${window.location.protocol}//${base}/login?next=${encodeURIComponent(next)}`;
}

export default function Login({ tenant, account, baseDomain }) {
  useEffect(() => {
    document.title = `Logg inn – ${tenant?.name ?? 'Flatr'}`;
    if (!account) window.location.replace(platformLoginUrl(baseDomain));
  }, [tenant, account, baseDomain]);

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

  return <div className="h-full bg-paper" />;
}
