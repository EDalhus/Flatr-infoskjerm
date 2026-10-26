// Landingsside på hoveddomenet (flatr.no) – det potensielle kunder ser først.
// Bruker alltid «Presis»-temaet (mørkt, grønt) så siden ser ut som appen.
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LogoLockup, LogoMarkSquare } from '../admin/components/Logo.jsx';
import { Icon } from '../admin/components/ui.jsx';

const FEATURES = [
  {
    icon: 'layers',
    title: 'Fritt lerret',
    text: 'Dra inn tekst, bilder, klokke, program og QR-koder akkurat der du vil ha dem. Ingen faste maler som stenger deg inne.'
  },
  {
    icon: 'megaphone',
    title: 'Live-varsler',
    text: 'Send en beskjed til alle skjermene – eller bare én – på sekunder. Perfekt når planene endrer seg.'
  },
  {
    icon: 'calendar',
    title: 'Program som oppdaterer seg selv',
    text: 'Legg inn programmet én gang. Skjermene viser hva som skjer nå og hva som kommer, helt automatisk.'
  },
  {
    icon: 'monitor',
    title: 'Apple TV eller nettleser',
    text: 'Par en Apple TV med en kode på skjermen, eller åpne en lenke i hvilken som helst nettleser.'
  },
  {
    icon: 'users',
    title: 'Jobb sammen i sanntid',
    text: 'Hele teamet kan redigere samtidig og se hverandres markører – som i et delt dokument.'
  },
  {
    icon: 'image',
    title: 'Mediebibliotek',
    text: 'Last opp bildene én gang, sorter dem i mapper og gjenbruk dem i alle spillelistene.'
  }
];

const STEPS = [
  { n: '01', title: 'Opprett konto', text: 'Velg navn og din egen adresse – f.eks. dittlag.flatr.no.' },
  { n: '02', title: 'Lag innholdet', text: 'Bygg skjermbildene i editoren, eller start fra eksempelet du får med.' },
  { n: '03', title: 'Koble skjermene', text: 'Tast inn koden fra TV-en, eller åpne skjermlenken. Innholdet oppdateres live.' }
];

const FREE_PLAN = [
  'Opptil 3 skjermer',
  '5 GB lagring til bilder',
  'Live-varsler og program',
  'Inviter kollegaene dine',
  'Egen adresse på flatr.no'
];

const PRO_PLAN = ['Flere skjermer', 'Video på skjermene', 'Mer lagring', 'Prioritert hjelp'];

const FAQ = [
  {
    q: 'Er gratisversjonen virkelig gratis?',
    a: 'Ja. Du kan bruke opptil 3 skjermer uten å legge inn kort, så lenge du vil.'
  },
  {
    q: 'Hva slags skjerm trenger jeg?',
    a: 'En Apple TV med Flatr-appen, eller hvilken som helst skjerm med en nettleser – smart-TV, PC eller nettbrett.'
  },
  {
    q: 'Kan flere jobbe med skjermene?',
    a: 'Ja. Inviter kollegaene dine, så kan dere redigere samtidig og se endringene live.'
  },
  {
    q: 'Hvorfor er ikke video med i gratisversjonen?',
    a: 'Video krever mye mer lagring og båndbredde enn bilder. Det kommer i de betalte planene.'
  }
];

export default function Landing() {
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
      <header className="sticky top-0 z-20 border-b border-line bg-paper/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <LogoLockup className="h-6 w-auto text-ink" />
          <nav className="flex items-center gap-1 text-sm font-medium sm:gap-2">
            <a href="#funksjoner" className="hidden rounded-md px-3 py-2 text-muted hover:text-ink sm:block">
              Funksjoner
            </a>
            <a href="#priser" className="hidden rounded-md px-3 py-2 text-muted hover:text-ink sm:block">
              Priser
            </a>
            <Link to="/login" className="rounded-md px-3 py-2 text-muted hover:text-ink">
              Logg inn
            </Link>
            <Link
              to="/signup"
              className="rounded-md bg-brand px-4 py-2 font-semibold text-onbrand transition hover:bg-brand-dark"
            >
              Kom i gang
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-[480px] max-w-4xl rounded-full bg-brand/10 blur-3xl"
        />
        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 text-center sm:px-6 sm:pt-24">
          <p className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1 text-xs font-medium text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            Gratis for opptil 3 skjermer
          </p>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            Infoskjermer som <span className="text-brand">bare virker</span>.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted">
            Vis program, beskjeder og sponsorer på alle skjermene dine – styrt fra én nettside og oppdatert i
            sanntid.
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
              href="#slik-virker-det"
              className="inline-flex items-center rounded-md border border-line bg-card px-5 py-3 font-semibold hover:bg-hair"
            >
              Se hvordan det virker
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
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-card p-6">
                <div className="mb-4 grid h-10 w-10 place-items-center rounded-lg bg-brand-tint text-brand">
                  <Icon name={f.icon} className="h-5 w-5" />
                </div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="slik-virker-det" className="scroll-mt-20 border-t border-line">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
          <div>
            <SectionHead kicker="Slik virker det" title="I gang på fem minutter" />
            <div className="mt-10 space-y-6">
              {STEPS.map((s) => (
                <div key={s.n} className="flex gap-4">
                  <div className="font-mono text-sm text-brand">{s.n}</div>
                  <div>
                    <h3 className="font-semibold">{s.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{s.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <ScreenMock />
        </div>
      </section>

      <section id="priser" className="scroll-mt-20 border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <SectionHead
            kicker="Priser"
            title="Start gratis, voks når du trenger det"
            text="Ingen kort, ingen binding. Gratisversjonen holder for de fleste små lag og arrangementer."
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
                <span className="text-sm text-muted">/ for alltid</span>
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
              <p className="mt-8 rounded-md border border-dashed border-line px-5 py-3 text-center text-sm text-muted">
                Start gratis i dag – du kan oppgradere når Pro er klar.
              </p>
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

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted sm:px-6">
          <div className="flex items-center gap-2">
            <LogoMarkSquare className="h-6 w-6" />
            <span>© {new Date().getFullYear()} Flatr</span>
          </div>
          <div className="flex gap-5">
            <a href="#priser" className="hover:text-ink">
              Priser
            </a>
            <Link to="/login" className="hover:text-ink">
              Logg inn
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SectionHead({ kicker, title, text, center = false }) {
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
              <p className="text-xs font-semibold">Kanaler</p>
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

/** Stilisert infoskjerm (ren markup, ingen bilder). */
function ScreenMock() {
  return (
    <div className="relative mx-auto w-full max-w-xl">
      <div className="rounded-2xl border border-line bg-black p-3 shadow-pop">
        <div className="aspect-video overflow-hidden rounded-lg bg-gradient-to-br from-[#0f2733] via-[#123d3a] to-[#027353] p-5 text-white sm:p-7">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
            <span>Hovedscene</span>
            <span className="tabular-nums">14:32</span>
          </div>
          <div className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300 sm:mt-6">
            ● Pågår nå
          </div>
          <div className="mt-1 text-xl font-extrabold leading-tight sm:text-3xl">Åpning og velkommen</div>
          <div className="mt-4 space-y-2 sm:mt-6">
            {[
              ['15:00', 'Panel: Fremtidens kultur'],
              ['16:30', 'Workshop i sal B'],
              ['18:00', 'Middag i foajeen']
            ].map(([t, title]) => (
              <div key={t} className="flex items-center gap-3 rounded-lg bg-white/10 px-3 py-2 text-xs sm:text-sm">
                <span className="font-bold tabular-nums text-white/70">{t}</span>
                <span className="truncate font-semibold">{title}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="absolute -bottom-5 -left-3 flex items-center gap-2 rounded-lg border border-line bg-card px-4 py-3 text-sm font-semibold text-ink shadow-pop sm:-left-6">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-tint text-brand">
          <Icon name="megaphone" className="h-4 w-4" />
        </span>
        Live-varsel sendt til 3 skjermer
      </div>
    </div>
  );
}
