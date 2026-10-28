// Landingsside på hoveddomenet (flatr.no) – det potensielle kunder ser først.
// Bruker alltid «Presis»-temaet (mørkt, grønt) så siden ser ut som appen.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LogoLockup, LogoMarkSquare } from '../admin/components/Logo.jsx';
import { Icon } from '../admin/components/ui.jsx';
import AppIcon from '../admin/components/apps/AppIcon.jsx';
import { OFFICIAL_APPS, CATEGORY_LABEL } from '../lib/appCatalog.js';

const FEATURES = [
  {
    icon: 'layers',
    title: 'Fritt lerret',
    text: 'Dra inn tekst, bilder, video, klokke og program akkurat der du vil. Start fra en mal, eller importer PowerPoint og PDF.'
  },
  {
    icon: 'sparkle',
    title: 'Flatr Apps',
    text: 'Live data på skjermene: skipstrafikk fra AIS, bursdager, vær, nyheter og kalender – eller ditt eget API uten kode.',
    href: '/apps'
  },
  {
    icon: 'clock',
    title: 'Tidsplan',
    text: 'Bestem hva som vises når – lunsjmeny før tolv, program om kvelden. Overstyr med ett klikk når noe skjer.'
  },
  {
    icon: 'monitor',
    title: 'Apple TV eller nettleser',
    text: 'Par en Apple TV med en kode, eller bruk en nettleser. Se hva som vises, og få beskjed hvis en skjerm går offline.'
  },
  {
    icon: 'megaphone',
    title: 'Live-varsler',
    text: 'Send en beskjed til alle skjermene – eller bare én – på sekunder. Perfekt når planene endrer seg.'
  },
  {
    icon: 'users',
    title: 'Jobb sammen, trygt',
    text: 'Inviter kollegaer som eiere eller redaktører og rediger samtidig. Passord og tofaktor holder kontoen sikker.'
  }
];

const FREE_PLAN = [
  '1 skjerm',
  '2 GB lagring til bilder',
  'Flatr Apps, live-varsler og program',
  'Inviter kollegaene dine',
  'Egen adresse på flatr.no'
];

const PRO_PLAN = ['Flere skjermer', 'Video på skjermene', 'Mer lagring', 'Prioritert hjelp'];

const FAQ = [
  {
    q: 'Trenger du flere skjermer?',
    a: 'Ta kontakt, så finner vi en løsning. Mens Flatr er i beta gir vi gjerne en eller to skjermer ekstra – gratis.',
    contact: true
  },
  {
    q: 'Hva koster Flatr?',
    a: 'Gratisplanen koster 0 kr i måneden og krever ikke kort. Pro med flere skjermer og video kommer senere – du velger selv om du vil oppgradere.'
  },
  {
    q: 'Hva slags skjerm trenger jeg?',
    a: 'En Apple TV med Flatr-appen, eller hvilken som helst skjerm med en nettleser – smart-TV, PC eller nettbrett.'
  },
  {
    q: 'Hva er Flatr Apps?',
    a: 'Apper som viser data på skjermene: skipstrafikk (NAIS), bursdager, vær, nyheter og kalender. Du aktiverer de du vil ha, og kan lage dine egne fra et hvilket som helst JSON-API – uten kode.'
  },
  {
    q: 'Kan flere jobbe med skjermene?',
    a: 'Ja. Inviter kollegaene dine som eiere eller redaktører, så kan dere redigere samtidig og se endringene live.'
  },
  {
    q: 'Hvor trygg er kontoen min?',
    a: 'Passord lagres kryptert, gjentatte feil forsøk blokkeres, og du kan slå på tofaktor-innlogging med en kode fra mobilen.'
  },
  {
    q: 'Hvorfor er ikke video med i gratisversjonen?',
    a: 'Video krever mye mer lagring og båndbredde enn bilder. Det kommer i de betalte planene.'
  }
];

/** Felles topp for flatr.no og flatr.no/apps. */
export function SiteHeader() {
  const onHome = typeof window !== 'undefined' && window.location.pathname === '/';
  const anchor = (id) => (onHome ? `#${id}` : `/#${id}`);
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-paper/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link to="/" aria-label="Flatr – forsiden">
          <LogoLockup className="h-6 w-auto text-ink" />
        </Link>
        <nav className="flex items-center gap-1 text-sm font-medium sm:gap-2">
          <a href={anchor('funksjoner')} className="hidden rounded-md px-3 py-2 text-muted hover:text-ink sm:block">
            Funksjoner
          </a>
          <Link to="/apps" className="hidden rounded-md px-3 py-2 text-muted hover:text-ink sm:block">
            Apps
          </Link>
          <a href={anchor('priser')} className="hidden rounded-md px-3 py-2 text-muted hover:text-ink sm:block">
            Priser
          </a>
          <Link to="/login" className="rounded-md px-3 py-2 text-muted hover:text-ink">
            Logg inn
          </Link>
          <Link to="/signup" className="rounded-md bg-brand px-4 py-2 font-semibold text-onbrand transition hover:bg-brand-dark">
            Kom i gang
          </Link>
        </nav>
      </div>
    </header>
  );
}

/** Felles bunn. */
export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted sm:px-6">
        <div className="flex items-center gap-2">
          <LogoMarkSquare className="h-6 w-6" />
          <span>© {new Date().getFullYear()} Flatr</span>
        </div>
        <div className="flex gap-5">
          <Link to="/apps" className="hover:text-ink">
            Apps
          </Link>
          <a href="/#priser" className="hover:text-ink">
            Priser
          </a>
          <Link to="/personvern" className="hover:text-ink">
            Personvern
          </Link>
          <Link to="/login" className="hover:text-ink">
            Logg inn
          </Link>
        </div>
      </div>
    </footer>
  );
}

export default function Landing() {
  const [contactOpen, setContactOpen] = useState(false);
  useEffect(() => {
    document.title = 'Flatr – infoskjermer som bare virker';
    const root = document.documentElement;
    const prev = root.dataset.theme;
    root.dataset.theme = 'presis';
    return () => {
      if (prev) root.dataset.theme = prev;
      else delete root.dataset.theme;
    };
  }, []);

  return (
    <div data-theme="presis" className="min-h-full overflow-y-auto bg-paper font-sans text-ink antialiased">
      <SiteHeader />

      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-[480px] max-w-4xl rounded-full bg-brand/10 blur-3xl"
        />
        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 text-center sm:px-6 sm:pt-24">
          <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            Infoskjermer som <span className="text-brand">bare virker</span>.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted">
            Lag innholdet én gang og vis det på alle skjermene dine – med live data fra appene du trenger. Endringer vises med en gang.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 rounded-md bg-brand px-5 py-3 font-semibold text-onbrand transition hover:bg-brand-dark"
            >
              Opprett gratis konto
              <Icon name="chevron" className="h-4 w-4" />
            </Link>
            <a
              href="#funksjoner"
              className="inline-flex items-center rounded-md border border-line bg-card px-5 py-3 font-semibold hover:bg-hair"
            >
              Se funksjonene
            </a>
          </div>

          <div className="mt-16 text-left sm:mt-20">
            <DashboardMock />
          </div>
        </div>
      </section>

      <section id="funksjoner" className="scroll-mt-20 border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <SectionHead
            kicker="Funksjoner"
            title="Alt du trenger, ingenting du ikke trenger"
            text="Laget for arrangementer, idrettslag, kulturhus og bedrifter som vil ha skjermer som er enkle å holde oppdatert."
          />
          <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => {
              const body = (
                <>
                  <div className="mb-4 grid h-10 w-10 place-items-center rounded-lg bg-brand-tint text-brand">
                    <Icon name={f.icon} className="h-5 w-5" />
                  </div>
                  <h3 className="flex items-center gap-1.5 font-semibold">
                    {f.title}
                    {f.href && <Icon name="chevron" className="h-3.5 w-3.5 text-brand" />}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{f.text}</p>
                </>
              );
              return f.href ? (
                <Link key={f.title} to={f.href} className="bg-card p-6 transition-colors hover:bg-hair">
                  {body}
                </Link>
              ) : (
                <div key={f.title} className="bg-card p-6">
                  {body}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <AppsTeaser />

      <section id="priser" className="scroll-mt-20 border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <SectionHead
            kicker="Priser"
            title="Start gratis, voks når du trenger det"
            text="Ingen kort, ingen binding. Gratisplanen holder for de fleste små lag, arrangementer og bedrifter."
            center
          />
          <div className="mx-auto mt-12 grid max-w-4xl gap-4 md:grid-cols-2">
            <div className="flex flex-col rounded-xl border border-brand/40 bg-card p-7">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Gratis</h3>
                <span className="rounded-full bg-brand-tint px-2.5 py-1 text-xs font-medium text-brand">
                  Tilgjengelig nå
                </span>
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight">0 kr</span>
                <span className="text-sm text-muted">/ per mnd</span>
              </div>
              <PlanList items={FREE_PLAN} />
              <Link
                to="/signup"
                className="mt-8 rounded-md bg-brand px-5 py-3 text-center font-semibold text-onbrand transition hover:bg-brand-dark"
              >
                Opprett gratis konto
              </Link>
            </div>

            <div className="flex flex-col rounded-xl border border-line bg-card p-7">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Pro</h3>
                <span className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-muted">
                  Kommer snart
                </span>
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight text-muted">–</span>
              </div>
              <PlanList items={PRO_PLAN} muted />
              <div className="mt-8 rounded-md border border-dashed border-line px-5 py-4 text-center text-sm text-muted">
                <p className="m-0">Trenger du flere skjermer nå? Ta kontakt – i betaperioden får du gjerne en eller to til, gratis.</p>
                <button type="button" onClick={() => setContactOpen(true)} className="mt-3 font-semibold text-brand hover:underline">
                  Ta kontakt →
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-line">
        <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
          <SectionHead kicker="Spørsmål og svar" title="Lurer du på noe?" center />
          <div className="mt-10 divide-y divide-line rounded-xl border border-line bg-card">
            {FAQ.map((f) => (
              <details key={f.q} className="group px-6 py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {f.q}
                  <Icon name="plus" className="h-4 w-4 shrink-0 text-muted transition group-open:rotate-45" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted">{f.a}</p>
                {f.contact && (
                  <button type="button" onClick={() => setContactOpen(true)} className="mt-3 text-sm font-semibold text-brand hover:underline">
                    Ta kontakt →
                  </button>
                )}
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 rounded-2xl bg-brand px-6 py-14 text-center text-onbrand sm:px-12">
          <h2 className="text-3xl font-bold tracking-tight">Klar til å sette skjermene i arbeid?</h2>
          <p className="max-w-lg opacity-80">
            Opprett en konto og få din egen Flatr-adresse med en gang. Du kan invitere kollegaene dine etterpå.
          </p>
          <Link
            to="/signup"
            className="rounded-md bg-paper px-6 py-3 font-semibold text-ink transition hover:bg-card"
          >
            Kom i gang gratis
          </Link>
        </div>
      </section>

      <SiteFooter />
      {contactOpen && <ContactDialog onClose={() => setContactOpen(false)} />}
    </div>
  );
}

/** Kontaktskjema (e-post til Flatr; ingen adresse vises offentlig). */
export function ContactDialog({ onClose, subject = 'Jeg trenger flere skjermer' }) {
  const [f, setF] = useState({ name: '', email: '', org: '', message: '', website: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const send = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/platform/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, message: f.message || subject })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Kunne ikke sende. Prøv igjen.');
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const input = 'w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-brand';
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Ta kontakt" className="w-full max-w-md rounded-2xl border border-line bg-card p-6 text-left">
        {sent ? (
          <div className="text-center">
            <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-brand-tint text-brand">
              <Icon name="check" className="h-6 w-6" />
            </div>
            <h2 className="m-0 text-lg font-bold">Takk! Vi har fått meldingen</h2>
            <p className="m-0 mt-2 text-sm text-muted">Vi svarer deg på e-post så fort vi kan.</p>
            <button type="button" onClick={onClose} className="mt-5 rounded-md bg-brand px-5 py-2.5 font-semibold text-onbrand hover:bg-brand-dark">
              Lukk
            </button>
          </div>
        ) : (
          <form onSubmit={send} className="grid gap-3">
            <div>
              <h2 className="m-0 text-lg font-bold">Ta kontakt</h2>
              <p className="m-0 mt-1 text-sm text-muted">Trenger du flere skjermer, eller lurer du på noe? Vi svarer på e-post.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input className={input} placeholder="Navn" value={f.name} onChange={set('name')} autoComplete="name" />
              <input className={input} placeholder="Organisasjon" value={f.org} onChange={set('org')} autoComplete="organization" />
            </div>
            <input className={input} type="email" required placeholder="E-post" value={f.email} onChange={set('email')} autoComplete="email" />
            <textarea className={`${input} min-h-[110px]`} placeholder={`${subject} – f.eks. hvor mange og hva de skal brukes til`} value={f.message} onChange={set('message')} maxLength={3000} />
            {/* Skjult felt som bare roboter fyller ut */}
            <input type="text" tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} className="hidden" aria-hidden="true" />
            {error && <p className="m-0 text-sm text-danger">{error}</p>}
            <div className="mt-1 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-md px-4 py-2.5 text-sm font-semibold text-muted hover:text-ink">
                Avbryt
              </button>
              <button type="submit" disabled={busy} className="rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-onbrand hover:bg-brand-dark disabled:opacity-50">
                {busy ? 'Sender …' : 'Send'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export function SectionHead({ kicker, title, text, center = false }) {
  return (
    <div className={center ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-brand">{kicker}</p>
      <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      {text && <p className="mt-4 leading-relaxed text-muted">{text}</p>}
    </div>
  );
}

function PlanList({ items, muted = false }) {
  return (
    <ul className="mt-6 space-y-3 text-sm">
      {items.map((item) => (
        <li key={item} className="flex items-center gap-3">
          <Icon name="check" className={`h-4 w-4 shrink-0 ${muted ? 'text-muted' : 'text-brand'}`} />
          <span className={muted ? 'text-muted' : ''}>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Forenklet utgave av admin-forsiden, så besøkende ser hvordan appen ser ut. */
function DashboardMock() {
  const nav = ['home', 'monitor', 'layers', 'megaphone', 'link', 'calendar', 'tag', 'image'];
  return (
    <div className="mx-auto max-w-5xl overflow-hidden rounded-xl border border-line bg-card shadow-pop">
      <div className="flex items-center gap-1.5 border-b border-line px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-line" />
        <span className="h-2.5 w-2.5 rounded-full bg-line" />
        <span className="h-2.5 w-2.5 rounded-full bg-line" />
        <span className="ml-3 truncate font-mono text-xs text-muted">dittlag.flatr.no</span>
      </div>
      <div className="flex">
        <aside className="hidden w-14 shrink-0 flex-col items-center gap-2 border-r border-line py-4 sm:flex">
          {nav.map((n, i) => (
            <span
              key={n}
              className={`grid h-9 w-9 place-items-center rounded-md ${i === 0 ? 'bg-brand-tint text-brand' : 'text-muted'}`}
            >
              <Icon name={n} className="h-[18px] w-[18px]" />
            </span>
          ))}
        </aside>
        <div className="min-w-0 flex-1 bg-paper p-5 sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs text-muted">God morgen</p>
              <p className="mt-1 text-lg font-semibold">Skjermene dine</p>
            </div>
            <div className="flex gap-2">
              <span className="hidden items-center gap-2 rounded-md border border-line bg-card px-3 py-2 text-xs font-semibold sm:inline-flex">
                <Icon name="megaphone" className="h-3.5 w-3.5" />
                Send et varsel
              </span>
              <span className="inline-flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-xs font-semibold text-onbrand">
                <Icon name="plus" className="h-3.5 w-3.5" />
                Koble til ny skjerm
              </span>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-brand p-4 text-onbrand">
              <p className="text-xs font-semibold">Online akkurat nå</p>
              <p className="mt-1 text-3xl font-bold">3</p>
              <p className="mt-1 text-xs opacity-80">Alle skjermene er på</p>
            </div>
            <div className="rounded-lg border border-line bg-card p-4">
              <p className="text-xs font-semibold">Presentasjoner</p>
              <p className="mt-1 text-3xl font-bold">2</p>
              <p className="mt-1 text-xs text-muted">Klare til visning</p>
            </div>
            <div className="rounded-lg border border-line bg-card p-4">
              <p className="text-xs font-semibold">Aktive varsler</p>
              <p className="mt-1 text-3xl font-bold">1</p>
              <p className="mt-1 text-xs text-muted">Vises på 3 skjermer</p>
            </div>
          </div>
          <div className="mt-3 hidden gap-3 sm:grid sm:grid-cols-3">
            {[
              ['Resepsjonen', 'Velkommen'],
              ['Hovedscene', 'Program'],
              ['Kafeen', 'Meny og sponsorer']
            ].map(([name, channel]) => (
              <div key={name} className="rounded-lg border border-line bg-card p-3">
                <div className="aspect-video rounded-md bg-gradient-to-br from-[#0f2733] via-[#123d3a] to-[#027353]" />
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">{name}</p>
                    <p className="truncate text-[11px] text-muted">{channel}</p>
                  </div>
                  <span className="h-2 w-2 shrink-0 rounded-full bg-brand" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Den åpne app-katalogen (egne ikoner + godkjente apper fra kundene). */
export function usePublicApps() {
  const [data, setData] = useState({ official_icons: {}, community: [] });
  useEffect(() => {
    fetch('/api/platform/apps')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d))
      .catch(() => {});
  }, []);
  return data;
}

/** Kort for én app (forsiden og /apps). */
export function AppTile({ app, image, publisher = 'Flatr', verified = true, tagline = true }) {
  return (
    <div className="flex h-full flex-col gap-3 rounded-xl border border-line bg-card p-5">
      <div className="flex items-center gap-3">
        <AppIcon icon={app.icon} color={app.color} size={44} image={image} />
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{app.name}</h3>
          <div className="flex items-center gap-1 text-xs text-muted">
            {publisher}
            {verified && (
              <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-brand text-onbrand">
                <Icon name="check" className="h-2 w-2" />
              </span>
            )}
            <span>· {CATEGORY_LABEL[app.category] || 'Annet'}</span>
          </div>
        </div>
      </div>
      {tagline && <p className="m-0 text-sm leading-relaxed text-muted">{app.tagline}</p>}
    </div>
  );
}

function AppsTeaser() {
  const { official_icons: icons } = usePublicApps();
  return (
    <section id="apps" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHead
            kicker="Flatr Apps"
            title="Live data på skjermene"
            text="Aktiver appene du trenger – eller koble til ditt eget API på noen minutter, helt uten kode."
          />
          <Link to="/apps" className="inline-flex items-center gap-1.5 font-semibold text-brand hover:underline">
            Se alle apper
            <Icon name="chevron" className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {['ais', 'weather', 'claude'].map((k) => OFFICIAL_APPS.find((a) => a.key === k)).filter(Boolean).map((a) => (
            <AppTile key={a.key} app={a} image={icons[a.key]} tagline={false} />
          ))}
        </div>
      </div>
    </section>
  );
}
