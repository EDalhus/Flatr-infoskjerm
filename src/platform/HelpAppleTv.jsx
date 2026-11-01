// Hjelp: lås Apple TV til Flatr med enkeltappmodus (flatr.no/hjelp/apple-tv).
// Lenkes fra varselet om at en TV er frakoblet og fra Apple TV-delen under Skjermer.
import { useEffect } from 'react';
import { SiteHeader, SiteFooter } from './Landing.jsx';
import { tr } from '../lib/i18n.js';

const STEPS = [
  {
    title: tr('Installer Apple Configurator'),
    body: tr('Last ned Apple Configurator fra App Store på Macen. Den er gratis og laget av Apple.'),
    link: { href: 'https://apps.apple.com/app/apple-configurator/id1037126344', label: tr('Åpne Apple Configurator i App Store') }
  },
  {
    title: tr('Koble Apple TV-en til Macen'),
    body: tr('Sørg for at Apple TV-en og Macen er på samme nettverk. På Apple TV: Innstillinger → Fjernkontroller og enheter → Fjernapp og enheter. På Macen: åpne Apple Configurator, velg «Paired Devices» i menyen og trykk «Pair» ved Apple TV-en. Skriv inn koden som vises på TV-en.')
  },
  {
    title: tr('Klargjør Apple TV-en som overvåket'),
    body: tr('Velg Apple TV-en i Apple Configurator og trykk «Prepare». Velg manuell konfigurasjon og huk av for «Supervise devices». Dette sletter alt på Apple TV-en, så gjør det før du setter den opp.')
  },
  {
    title: tr('Sett opp Apple TV-en og installer Flatr'),
    body: tr('Gå gjennom oppsettet på TV-en, logg inn med en Apple-ID og last ned Flatr fra App Store. Åpne Flatr og koble TV-en til en skjerm i Flatr som vanlig, med koden som vises på TV-en.')
  },
  {
    title: tr('Start enkeltappmodus'),
    body: tr('I Apple Configurator: velg Apple TV-en, og velg «Actions» → «Advanced» → «Start Single App Mode». Velg Flatr i lista. Apple TV-en starter på nytt og åpner Flatr.')
  }
];

export default function HelpAppleTv() {
  useEffect(() => {
    document.title = tr('Lås Apple TV til Flatr – Flatr');
  }, []);
  return (
    <div className="min-h-full overflow-y-auto bg-paper text-ink">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">{tr('Hjelp · Apple TV')}</div>
        <h1 className="m-0 mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{tr('Lås Apple TV til Flatr')}</h1>
        <p className="mt-4 max-w-2xl text-muted">
          {tr('Etter et strømbrudd eller en omstart starter Apple TV på hjemskjermen, og noen må åpne Flatr igjen. Med enkeltappmodus starter Apple TV alltid rett i Flatr, og fjernkontrollen kan ikke gå ut av appen. Det er gratis, men krever en Mac, og Apple TV-en må nullstilles én gang.')}
        </p>

        <section className="mt-8 rounded-2xl border border-line bg-card p-5 text-sm">
          <h2 className="m-0 text-base font-bold">{tr('Du trenger')}</h2>
          <ul className="m-0 mt-2 list-disc space-y-1 pl-5 text-muted">
            <li>{tr('En Mac med Apple Configurator (gratis)')}</li>
            <li>{tr('Apple TV-en og Macen på samme nettverk')}</li>
            <li>{tr('Omtrent 20 minutter')}</li>
          </ul>
        </section>

        <ol className="m-0 mt-8 list-none space-y-4 p-0">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-4 rounded-2xl border border-line bg-card p-5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-sm font-bold text-onbrand">{i + 1}</span>
              <div className="min-w-0">
                <h2 className="m-0 text-base font-bold">{s.title}</h2>
                <p className="m-0 mt-1 text-sm leading-relaxed text-muted">{s.body}</p>
                {s.link && (
                  <a href={s.link.href} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold text-brand hover:underline">
                    {s.link.label} →
                  </a>
                )}
              </div>
            </li>
          ))}
        </ol>

        <section className="mt-8 space-y-3 text-sm leading-relaxed">
          <h2 className="m-0 text-lg font-bold">{tr('Ferdig')}</h2>
          <p className="m-0 text-muted">
            {tr('Nå åpner Apple TV-en Flatr av seg selv etter strømbrudd og omstart. Vil du bruke Apple TV-en til noe annet igjen, velger du «Actions» → «Advanced» → «Stop Single App Mode» i Apple Configurator.')}
          </p>
          <h2 className="m-0 pt-4 text-lg font-bold">{tr('Gode innstillinger på Apple TV-en')}</h2>
          <ul className="m-0 list-disc space-y-1 pl-5 text-muted">
            <li>
              <strong className="text-ink">{tr('Ikke gå i dvale:')}</strong> {tr('Innstillinger → Generelt → Dvale etter → Aldri.')}
            </li>
            <li>
              <strong className="text-ink">{tr('Hold Flatr oppdatert:')}</strong> {tr('Innstillinger → Apper → Oppdater apper automatisk.')}
            </li>
          </ul>
          <h2 className="m-0 pt-4 text-lg font-bold">{tr('Har dere MDM?')}</h2>
          <p className="m-0 text-muted">
            {tr('Bruker dere et verktøy for enhetsstyring (for eksempel Jamf, Intune, Mosyle eller Hexnode), kan Apple TV-en låses til Flatr derfra med en «App Lock»- eller kioskprofil, uten å koble den til en Mac.')}
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
