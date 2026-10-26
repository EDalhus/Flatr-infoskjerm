// Landingsside på hoveddomenet (flatr.no) – det potensielle kunder ser først.
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
    text: 'Par en Apple TV med en kode på skjermen, eller åpne en lenke i hvilken som helst nettleser. Ferdig.'
  },
  {
    icon: 'edit',
    title: 'Jobb sammen i sanntid',
    text: 'Hele teamet kan redigere samtidig og se hverandres markører – som i et delt dokument.'
  },
  {
    icon: 'clock',
    title: 'Tidsstyrt innhold',
    text: 'Vis frokostmenyen om morgenen og kveldsprogrammet om kvelden. Planlegg per dag, uke eller periode.'
  }
];

const STEPS = [
  { n: '1', title: 'Opprett konto', text: 'Velg navn og din egen adresse – f.eks. dittlag.flatr.no.' },
  { n: '2', title: 'Lag innholdet', text: 'Bygg skjermbildene i editoren, eller start fra eksempelet du får med.' },
  { n: '3', title: 'Koble skjermene', text: 'Tast inn koden fra TV-en, eller åpne skjermlenken. Innholdet oppdateres live.' }
];

export default function Landing() {
  useEffect(() => {
    document.title = 'Flatr – infoskjermer som bare virker';
  }, []);

  return (
    <div className="min-h-full overflow-y-auto bg-paper text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <LogoLockup className="h-7 w-auto text-ink" />
        <nav className="flex items-center gap-2 text-sm font-semibold">
          <Link to="/login" className="rounded-full px-4 py-2 text-ink/80 hover:bg-hair hover:text-ink">
            Logg inn
          </Link>
          <Link
            to="/signup"
            className="rounded-full bg-brand px-4 py-2 text-white shadow-card transition hover:bg-brand-dark"
          >
            Kom i gang
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pt-16">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-brand-tint px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-brand">
              Infoskjermer for arrangementer og bedrifter
            </p>
            <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
              Infoskjermer som <span className="text-brand">bare virker</span>.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              Flatr gjør det enkelt å vise program, beskjeder og sponsorer på alle skjermene dine – fra
              én nettside, oppdatert i sanntid.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/signup"
                className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-base font-semibold text-white shadow-pop transition hover:bg-brand-dark"
              >
                Opprett gratis konto
                <Icon name="chevron" className="h-4 w-4" />
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center rounded-full border border-line bg-card px-6 py-3 text-base font-semibold hover:bg-hair"
              >
                Jeg har allerede konto
              </Link>
            </div>
          </div>

          <ScreenMock />
        </div>
      </section>

      <section className="border-y border-line bg-card">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight">Alt du trenger, ingenting du ikke trenger</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-hair bg-paper p-6">
                <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-brand-tint text-brand">
                  <Icon name={f.icon} className="h-5 w-5" />
                </div>
                <h3 className="font-bold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-3xl font-bold tracking-tight">I gang på fem minutter</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="flex gap-4">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-lg font-bold text-white">
                {s.n}
              </div>
              <div>
                <h3 className="font-bold">{s.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{s.text}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-col items-center gap-5 rounded-3xl bg-brand px-6 py-12 text-center text-white sm:px-12">
          <h2 className="text-3xl font-bold tracking-tight">Klar til å sette skjermene i arbeid?</h2>
          <p className="max-w-lg text-white/80">
            Opprett en konto og få din egen Flatr-adresse med en gang. Du kan invitere kollegaene dine etterpå.
          </p>
          <Link
            to="/signup"
            className="rounded-full bg-white px-6 py-3 font-semibold text-brand shadow-pop transition hover:bg-brand-tint"
          >
            Kom i gang
          </Link>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted sm:px-6">
          <div className="flex items-center gap-2">
            <LogoMarkSquare className="h-6 w-6" />
            <span>© {new Date().getFullYear()} Flatr</span>
          </div>
          <Link to="/login" className="hover:text-ink">
            Logg inn
          </Link>
        </div>
      </footer>
    </div>
  );
}

/** Stilisert infoskjerm i hero-seksjonen (ren markup, ingen bilder). */
function ScreenMock() {
  return (
    <div className="relative mx-auto w-full max-w-xl">
      <div className="rounded-[28px] border border-line bg-ink p-3 shadow-pop">
        <div className="aspect-video overflow-hidden rounded-[18px] bg-gradient-to-br from-[#0f2733] via-[#123d3a] to-[#027353] p-5 text-white sm:p-7">
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
              <div key={t} className="flex items-center gap-3 rounded-xl bg-white/10 px-3 py-2 text-xs sm:text-sm">
                <span className="font-bold tabular-nums text-white/70">{t}</span>
                <span className="truncate font-semibold">{title}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="absolute -bottom-5 -left-3 flex items-center gap-2 rounded-2xl border border-hair bg-card px-4 py-3 text-sm font-semibold text-ink shadow-pop sm:-left-6">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-tint text-brand">
          <Icon name="megaphone" className="h-4 w-4" />
        </span>
        Live-varsel sendt til 6 skjermer
      </div>
    </div>
  );
}
