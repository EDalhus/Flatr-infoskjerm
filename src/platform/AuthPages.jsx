// Registrering, innlogging, passord, invitasjoner og parrings-omdirigering.
// Selve kontoene og passordene håndteres av Better Auth (server/identity.js).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { authClient } from '../lib/authClient.js';
import LoginForm, { SocialButtons } from './LoginForm.jsx';
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

// «Øvre Kafé & Bakeri» -> «ovre-kafe-bakeri»
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

/** Henvisningskoden fra flatr.no/?ref=… (lagret i nettleseren). */
const storedRef = () => {
  try {
    return localStorage.getItem('flatr.ref') || undefined;
  } catch {
    return undefined;
  }
};

export function Signup({ baseDomain }) {
  const [params] = useSearchParams();
  const [org, setOrg] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accept, setAccept] = useState(false);
  // Allerede innlogget: bare organisasjonen trengs.
  const [me, setMe] = useState(undefined);
  const [exists, setExists] = useState(false);
  const [slugState, setSlugState] = useState(null); // { available, reason }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(SIGNUP_ERRORS[params.get('error')] || '');
  const [sent, setSent] = useState(false);
  const checkSeq = useRef(0);

  useEffect(() => {
    document.title = 'Opprett konto – Flatr';
    api.platform.me().then((r) => setMe(r.user)).catch(() => setMe(null));
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
      if (me) {
        const r = await api.platform.createOrg({ org_name: org, slug, accept_terms: accept, ref: storedRef() });
        window.location.href = r.url;
        return;
      }
      await api.platform.signup({ org_name: org, slug, email, name, password, accept_terms: accept, ref: storedRef() });
      setSent(true);
    } catch (err) {
      setError(err.message);
      setExists(err.data?.code === 'exists');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <AuthShell title="Sjekk e-posten din">
        <CheckEmail email={email} onBack={() => setSent(false)}>
          Klikk på lenken for å bekrefte adressen – da opprettes <span className="font-semibold text-ink">{slug}.{baseDomain}</span> og du er logget inn.
        </CheckEmail>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={me ? 'Ny organisasjon' : 'Opprett en Flatr-konto'}
      subtitle={me ? `Du er logget inn som ${me.email} og blir eier av den nye organisasjonen.` : 'Du får din egen adresse der du styrer alle skjermene dine.'}
      footer={
        me ? null : (
          <>
            Har du allerede konto?{' '}
            <Link to="/login" className="font-semibold text-brand hover:underline">
              Logg inn
            </Link>
            <span className="mt-1 block text-xs">
              Vil du lage en ny organisasjon med kontoen din?{' '}
              <Link to="/login?next=%2Fsignup" className="font-semibold text-brand hover:underline">
                Logg inn først
              </Link>
            </span>
          </>
        )
      }
    >
      {/* Ny bruker: registrer med Google/Microsoft, så trengs bare organisasjonen her etterpå. */}
      {me === null && (
        <div className="mb-4">
          <SocialButtons callbackURL={`${window.location.origin}/signup`} divider="eller med e-post og passord" />
        </div>
      )}
      <form onSubmit={submit} className="space-y-4">
        <Field label="Organisasjon">
          <Input
            value={org}
            onChange={(e) => setOrg(e.target.value)}
            placeholder="Firmanavn AS"
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
              'Små bokstaver, tall og bindestrek. Kan være en forkortelse av navnet.'
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
              placeholder="firmanavn"
              required
              maxLength={32}
            />
            <span className="h-9 shrink-0 border-l border-line bg-hair px-3 text-sm leading-9 text-muted">
              .{baseDomain}
            </span>
          </div>
        </Field>
        {me === null && (
          <>
            <Field label="Ditt navn">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Kari Nordmann" autoComplete="name" />
            </Field>
            <Field label="Jobb-e-post">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="kari@firmanavn.no" autoComplete="username" required />
            </Field>
            <Field label="Passord" hint="Minst 10 tegn. En setning du husker er både sterk og lett å huske.">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={10} required />
            </Field>
          </>
        )}
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
        {exists && (
          <p className="m-0 text-sm">
            <Link to={`/login?next=${encodeURIComponent('/signup')}`} className="font-semibold text-brand hover:underline">
              Logg inn og opprett organisasjonen →
            </Link>
          </p>
        )}
        <Button type="submit" className="w-full py-3" disabled={busy || !accept || slugState?.available === false || me === undefined}>
          {busy ? 'Oppretter …' : me ? 'Opprett organisasjon' : 'Opprett konto'}
        </Button>
        {!me && <p className="text-center text-xs text-muted">Vi sender deg en lenke for å bekrefte e-postadressen.</p>}
      </form>
    </AuthShell>
  );
}

/** flatr.no/login – logg inn, så videre til organisasjonen (eller velg blant flere). */
/**
 * Hvor man kan sendes etter innlogging: en sti her, eller en adresse på
 * flatr.no / et kunde-subdomene (aldri andre domener). null = ugyldig.
 */
function safeNext(raw, baseDomain) {
  if (!raw) return null;
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  try {
    const u = new URL(raw);
    const host = u.host.toLowerCase();
    const base = String(baseDomain || window.location.host).toLowerCase();
    if (!/^https?:$/.test(u.protocol)) return null;
    return host === base || host.endsWith(`.${base}`) ? u.toString() : null;
  } catch {
    return null;
  }
}

export function PlatformLogin({ baseDomain }) {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'), baseDomain);
  const nextHost = next && !next.startsWith('/') ? new URL(next).host : null;
  const [orgs, setOrgs] = useState(null);
  const [me, setMe] = useState(null);

  useEffect(() => {
    document.title = 'Logg inn – Flatr';
    // Allerede innlogget: rett til valg av organisasjon.
    api.platform.me().then(choose).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function choose(r) {
    if (next) return void (window.location.href = next);
    setMe(r.user);
    setOrgs(r.orgs);
    if (r.orgs.length === 1) window.location.href = r.orgs[0].url;
  }

  const done = async () => choose(await api.platform.me());

  if (orgs && orgs.length !== 1) {
    return (
      <AuthShell title={orgs.length ? 'Velg organisasjon' : 'Ingen organisasjoner ennå'} subtitle={`Logget inn som ${me?.email}.`}>
        <div className="grid gap-2">
          {orgs.map((o) => (
            <a key={o.slug} href={o.url} className="flex items-center justify-between rounded-xl border border-line px-4 py-3 hover:bg-zone">
              <span>
                <span className="block font-semibold text-ink">{o.name}</span>
                <span className="text-xs text-muted">{o.url.replace(/^https?:\/\//, '').replace(/\/admin$/, '')}</span>
              </span>
              <Icon name="chevron" className="h-4 w-4 text-muted" />
            </a>
          ))}
          <Link to="/signup" className="mt-2 text-center text-sm font-semibold text-brand hover:underline">
            + Opprett en ny organisasjon
          </Link>
          <button type="button" className="mt-1 text-sm text-muted hover:text-ink" onClick={() => authClient.signOut().then(() => window.location.reload())}>
            Logg ut
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Logg inn"
      subtitle={
        params.get('verified')
          ? 'E-postadressen er bekreftet. Logg inn for å fortsette.'
          : nextHost && nextHost !== window.location.host
            ? `Logg inn for å fortsette til ${nextHost}.`
            : 'Én innlogging for alle organisasjonene dine.'
      }
      footer={
        <>
          Ny hos oss?{' '}
          <Link to="/signup" className="font-semibold text-brand hover:underline">
            Opprett konto
          </Link>
        </>
      }
    >
      <LoginForm onDone={done} />
    </AuthShell>
  );
}

/** /forgot-password – lenke for å sette (nytt) passord. Også for de som aldri har hatt et. */
export function ForgotPassword() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get('email') || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    document.title = 'Glemt passord – Flatr';
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await authClient.requestReset(email.trim());
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title={sent ? 'Sjekk e-posten din' : 'Sett passord'}
      subtitle={sent ? null : 'Har du glemt passordet, eller logger du inn for første gang etter at Flatr fikk passord? Vi sender deg en lenke.'}
      footer={
        <a href="/login" className="font-semibold text-brand hover:underline">
          Tilbake til innlogging
        </a>
      }
    >
      {sent ? (
        <CheckEmail email={email} onBack={() => setSent(false)}>
          Har adressen en Flatr-konto, finner du en lenke for å velge passord. Den virker i én time.
        </CheckEmail>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="E-post">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus />
          </Field>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" className="w-full py-3" disabled={busy}>
            {busy ? 'Sender …' : 'Send lenke'}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

/** Felles felter for nytt passord (to ganger). */
function NewPasswordFields({ value, setValue, again, setAgain, username }) {
  return (
    <>
      {/* Passordbehandlere lagrer passordet på e-postadressen (skjult felt). */}
      {username && <input type="email" name="username" autoComplete="username" value={username} readOnly className="sr-only" tabIndex={-1} aria-hidden="true" />}
      <Field label="Nytt passord" hint="Minst 10 tegn. En setning du husker er både sterk og lett å huske.">
        <Input type="password" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="new-password" minLength={10} required autoFocus />
      </Field>
      <Field label="Gjenta passordet">
        <Input type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" required />
      </Field>
    </>
  );
}

/** /reset-password?token= – velg nytt passord (lenken fra e-posten). */
export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(params.get('error') ? 'Lenken er utløpt eller allerede brukt. Be om en ny.' : '');
  const [done, setDone] = useState(false);

  useEffect(() => {
    document.title = 'Nytt passord – Flatr';
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (pw !== again) return setError('Passordene er ikke like.');
    setError('');
    setBusy(true);
    try {
      await authClient.resetPassword(token, pw);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={done ? 'Passordet er lagret' : 'Velg nytt passord'}>
      {done ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-muted">Du er logget ut overalt. Logg inn med det nye passordet.</p>
          <a href="/login" className="inline-block font-semibold text-brand hover:underline">
            Logg inn →
          </a>
        </div>
      ) : !token ? (
        <div className="space-y-4">
          <ErrorText>{error || 'Lenken mangler. Be om en ny.'}</ErrorText>
          <a href="/forgot-password" className="font-semibold text-brand hover:underline">
            Send ny lenke
          </a>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <NewPasswordFields value={pw} setValue={setPw} again={again} setAgain={setAgain} />
          <ErrorText>{error}</ErrorText>
          <Button type="submit" className="w-full py-3" disabled={busy}>
            {busy ? 'Lagrer …' : 'Lagre passord'}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

/**
 * /invite?token= – velg navn og passord, og bli med. Nye lenker går til flatr.no
 * (platform), så passordet lagres der som all annen innlogging; på kundens adresse
 * (eldre lenker) sendes man videre dit.
 */
export function InvitePage({ platform = false, baseDomain }) {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  if (!platform && baseDomain) {
    window.location.replace(`${window.location.protocol}//${baseDomain}/invite?token=${encodeURIComponent(token)}`);
    return <div className="h-full bg-paper" />;
  }
  return <InviteForm token={token} platform={platform} />;
}

function InviteForm({ token, platform }) {
  const [invite, setInvite] = useState(null);
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Invitasjon – Flatr';
    api.invite
      .get(token, platform)
      .then((r) => {
        setInvite(r);
        setName(r.name || '');
      })
      .catch((err) => setError(err.message));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    if (invite.needs_password && pw !== again) return setError('Passordene er ikke like.');
    setError('');
    setBusy(true);
    try {
      const r = await api.invite.accept({ token, name, password: pw }, platform);
      window.location.href = r.redirect || '/admin';
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!invite) {
    return (
      <AuthShell title="Invitasjon">
        {error ? (
          <div className="space-y-4">
            <ErrorText>{error}</ErrorText>
            <a href="/admin" className="font-semibold text-brand hover:underline">
              Gå til innlogging
            </a>
          </div>
        ) : (
          <p className="text-sm text-muted">Henter invitasjonen …</p>
        )}
      </AuthShell>
    );
  }

  return (
    <AuthShell title={`Bli med i ${invite.org}`} subtitle={`Du er invitert som ${invite.email}.`}>
      <form onSubmit={submit} className="space-y-4">
        {invite.needs_password ? (
          <>
            <Field label="Ditt navn">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Kari Nordmann" autoComplete="name" required />
            </Field>
            <input type="email" value={invite.email} readOnly hidden autoComplete="username" />
            <NewPasswordFields value={pw} setValue={setPw} again={again} setAgain={setAgain} username={invite.email} />
          </>
        ) : (
          <p className="m-0 text-sm text-muted">Du har allerede en Flatr-konto. Logg inn med passordet ditt for å komme inn.</p>
        )}
        <ErrorText>{error}</ErrorText>
        <Button type="submit" className="w-full py-3" disabled={busy}>
          {busy ? 'Lagrer …' : invite.needs_password ? 'Bli med' : 'Gå til innlogging'}
        </Button>
      </form>
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
  // Innlogget: organisasjonene dine (med f.eks. TV-koden videre) i stedet for å skrive adressen.
  const [orgs, setOrgs] = useState(null);
  useEffect(() => {
    api.platform
      .me()
      .then((r) => {
        const q = params.toString();
        const list = (r?.orgs || []).map((o) => ({ ...o, url: q ? `${o.url}?${q}` : o.url }));
        if (list.length === 1) window.location.replace(list[0].url);
        else setOrgs(list);
      })
      .catch(() => setOrgs([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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

  if (orgs?.length > 1) {
    return (
      <AuthShell title={code ? 'Koble til en TV' : 'Velg organisasjon'} subtitle={code ? `Hvilken organisasjon skal skjermen med koden ${code} høre til?` : null}>
        <div className="grid gap-2">
          {orgs.map((o) => (
            <a key={o.slug} href={o.url} className="flex items-center justify-between rounded-xl border border-line px-4 py-3 hover:bg-zone">
              <span className="font-semibold text-ink">{o.name}</span>
              <Icon name="chevron" className="h-4 w-4 text-muted" />
            </a>
          ))}
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={code ? 'Koble til en TV' : 'Gå til din Flatr'}
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
            placeholder="firmanavn"
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
