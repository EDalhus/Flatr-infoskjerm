// Registrering, innlogging og parrings-omdirigering på hoveddomenet (flatr.no).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { LogoLockup } from '../admin/components/Logo.jsx';
import { Button, ErrorText, Field, Icon, Input } from '../admin/components/ui.jsx';

/** Felles ramme: sentrert kort med logo. */
export function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-full items-center justify-center overflow-y-auto bg-paper px-4 py-10 text-ink">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex justify-center">
          <LogoLockup className="h-8 w-auto text-ink" />
        </Link>
        <div className="rounded-3xl border border-hair bg-card p-6 shadow-card sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-sm leading-relaxed text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
        <div className="mt-6 flex justify-center gap-4 text-xs text-muted">
          <a href="/personvern" className="hover:text-ink">
            Personvern
          </a>
          <a href="/vilkar" className="hover:text-ink">
            Vilkår
          </a>
        </div>
      </div>
    </div>
  );
}

/** «Sjekk e-posten»-kvittering. */
export function CheckEmail({ email, children, onBack }) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-brand-tint text-brand">
        <Icon name="check" className="h-7 w-7" />
      </div>
      <p className="text-sm leading-relaxed text-muted">
        Vi har sendt en e-post til <span className="font-semibold text-ink">{email}</span>. {children}
      </p>
      <p className="mt-4 text-xs text-muted">Finner du den ikke? Sjekk søppelpost-mappen.</p>
      {onBack && (
        <button type="button" onClick={onBack} className="mt-6 text-sm font-semibold text-brand hover:underline">
          Bruk en annen e-postadresse
        </button>
      )}
    </div>
  );
}

const SIGNUP_ERRORS = {
  expired: 'Bekreftelseslenken er utløpt eller allerede brukt. Fyll inn skjemaet på nytt.',
  taken: 'Subdomenet ble tatt før kontoen ble bekreftet. Velg et annet.',
  failed: 'Noe gikk galt da kontoen skulle opprettes. Prøv igjen.'
};

// «Sunnmøre Data og Kultur» -> «sunnmore-data-og-kultur»
const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/, '');

export function Signup({ baseDomain }) {
  const [params] = useSearchParams();
  const [org, setOrg] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [accept, setAccept] = useState(false);
  const [slugState, setSlugState] = useState(null); // { available, reason }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(SIGNUP_ERRORS[params.get('error')] || '');
  const [sent, setSent] = useState(false);
  const checkSeq = useRef(0);

  useEffect(() => {
    document.title = 'Opprett konto – Flatr';
  }, []);

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(org));
  }, [org, slugTouched]);

  // Sjekk ledighet mens man skriver (litt forsinket).
  useEffect(() => {
    if (!slug) return setSlugState(null);
    const seq = ++checkSeq.current;
    const t = setTimeout(() => {
      api.platform
        .slug(slug)
        .then((r) => seq === checkSeq.current && setSlugState(r))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [slug]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.platform.signup({ org_name: org, slug, email, name, accept_terms: accept });
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <AuthShell title="Sjekk e-posten din">
        <CheckEmail email={email} onBack={() => setSent(false)}>
          Klikk på lenken for å opprette <span className="font-semibold text-ink">{slug}.{baseDomain}</span>.
        </CheckEmail>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Opprett en Flatr-konto"
      subtitle="Du får din egen adresse der du styrer alle skjermene dine."
      footer={
        <>
          Har du allerede konto?{' '}
          <Link to="/login" className="font-semibold text-brand hover:underline">
            Logg inn
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Organisasjon">
          <Input
            value={org}
            onChange={(e) => setOrg(e.target.value)}
            placeholder="Sunnmøre Data og Kultur"
            required
            autoFocus
          />
        </Field>
        <Field
          label="Din adresse"
          hint={
            slugState && !slugState.available ? (
              <span className="text-danger">{slugState.reason}</span>
            ) : slugState?.available ? (
              <span className="text-brand">Ledig!</span>
            ) : (
              'Små bokstaver, tall og bindestrek. Kan være en forkortelse, f.eks. sdok.'
            )
          }
        >
          <div className="flex items-center overflow-hidden rounded-xl border border-line bg-paper focus-within:border-focus focus-within:ring-2 focus-within:ring-focus/30">
            <input
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
              }}
              className="h-9 min-w-0 flex-1 bg-transparent px-3 text-right text-sm font-semibold text-ink focus:outline-none"
              placeholder="sdok"
              required
              maxLength={32}
            />
            <span className="h-9 shrink-0 border-l border-line bg-hair px-3 text-sm leading-9 text-muted">
              .{baseDomain}
            </span>
          </div>
        </Field>
        <Field label="Ditt navn">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Kari Nordmann" />
        </Field>
        <Field label="Jobb-e-post">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="kari@sdok.no"
            required
          />
        </Field>
        <label className="flex items-start gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            required
            checked={accept}
            onChange={(e) => setAccept(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <span>
            Jeg godtar{' '}
            <Link to="/vilkar" target="_blank" className="font-semibold text-brand hover:underline">
              vilkårene
            </Link>{' '}
            og har lest{' '}
            <Link to="/personvern" target="_blank" className="font-semibold text-brand hover:underline">
              personvernerklæringen
            </Link>
            .
          </span>
        </label>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" className="w-full py-3" disabled={busy || !accept || slugState?.available === false}>
          {busy ? 'Sender …' : 'Opprett konto'}
        </Button>
        <p className="text-center text-xs text-muted">Vi sender deg en lenke for å bekrefte e-postadressen.</p>
      </form>
    </AuthShell>
  );
}

export function PlatformLogin() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    document.title = 'Logg inn – Flatr';
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.platform.login(email);
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title={sent ? 'Sjekk e-posten din' : 'Logg inn'}
      subtitle={sent ? null : 'Skriv inn e-postadressen din, så sender vi deg en innloggingslenke. Ingen passord.'}
      footer={
        <>
          Ny hos oss?{' '}
          <Link to="/signup" className="font-semibold text-brand hover:underline">
            Opprett konto
          </Link>
        </>
      }
    >
      {sent ? (
        <CheckEmail email={email} onBack={() => setSent(false)}>
          Har adressen tilgang til en Flatr-konto, finner du en innloggingslenke der.
        </CheckEmail>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="E-post">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="kari@sdok.no"
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

/**
 * /admin på hoveddomenet. QR-koden på TV-en peker hit (?view=pairing&code=…),
 * men vi vet ikke hvilken konto som skal ha TV-en – spør om subdomenet.
 */
export function PlatformAdminRedirect({ baseDomain }) {
  const [params] = useSearchParams();
  const code = params.get('code');
  const [slug, setSlug] = useState(() => {
    try {
      return localStorage.getItem('flatr.lastSlug') || '';
    } catch {
      return '';
    }
  });

  const target = useMemo(() => {
    const q = new URLSearchParams(params);
    const proto = window.location.protocol;
    return slug ? `${proto}//${slug}.${baseDomain}/admin${q.toString() ? `?${q}` : ''}` : '';
  }, [slug, params, baseDomain]);

  const go = (e) => {
    e.preventDefault();
    try {
      localStorage.setItem('flatr.lastSlug', slug);
    } catch {
      /* ignore */
    }
    window.location.href = target;
  };

  return (
    <AuthShell
      title={code ? 'Koble til en skjerm' : 'Gå til din Flatr'}
      subtitle={
        code
          ? `Hvilken konto skal skjermen med koden ${code} høre til?`
          : 'Skriv inn adressen til kontoen din.'
      }
      footer={
        <>
          Husker du ikke adressen?{' '}
          <Link to="/login" className="font-semibold text-brand hover:underline">
            Logg inn med e-post
          </Link>
        </>
      }
    >
      <form onSubmit={go} className="space-y-4">
        <div className="flex items-center overflow-hidden rounded-xl border border-line bg-paper focus-within:border-focus focus-within:ring-2 focus-within:ring-focus/30">
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            className="h-9 min-w-0 flex-1 bg-transparent px-3 text-right text-sm font-semibold text-ink focus:outline-none"
            placeholder="sdok"
            required
            autoFocus
          />
          <span className="h-9 shrink-0 border-l border-line bg-hair px-3 text-sm leading-9 text-muted">
            .{baseDomain}
          </span>
        </div>
        <Button type="submit" className="w-full py-3" disabled={!slug}>
          Fortsett
        </Button>
      </form>
    </AuthShell>
  );
}
