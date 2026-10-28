// flatr.no/apps – den åpne oversikten over Flatr Apps: offisielle apper,
// appbyggeren og godkjente apper fra andre kunder.
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../admin/components/ui.jsx';
import { OFFICIAL_APPS } from '../lib/appCatalog.js';
import { SiteHeader, SiteFooter, SectionHead, AppTile, usePublicApps } from './Landing.jsx';

const BUILDER_STEPS = [
  { icon: 'link', title: 'Koble til et API', text: 'Lim inn adressen til et hvilket som helst JSON-API over https. Nøkler lagres kryptert.' },
  { icon: 'search', title: 'Velg feltene', text: 'Test API-et og plukk feltene du vil vise – navn, tall, bilder eller posisjoner.' },
  { icon: 'layers', title: 'Velg visning', text: 'Stort tall, liste, kort, tabell eller kart. Forhåndsvisningen oppdateres mens du jobber.' },
  { icon: 'share', title: 'Del den', text: 'Bruk appen selv, eller send den til godkjenning så andre Flatr-kunder kan aktivere den.' }
];

export default function AppsPage() {
  const { official_icons: icons, community } = usePublicApps();

  useEffect(() => {
    document.title = 'Flatr Apps – live data på infoskjermene';
    document.documentElement.dataset.theme = 'presis';
  }, []);

  return (
    <div data-theme="presis" className="min-h-full overflow-y-auto bg-paper font-sans text-ink antialiased">
      <SiteHeader />

      <section className="relative overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-[420px] max-w-4xl rounded-full bg-brand/10 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4 pb-14 pt-16 text-center sm:px-6 sm:pt-20">
          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-brand-tint text-brand">
            <Icon name="sparkle" className="h-7 w-7" />
          </div>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
            Flatr <span className="text-brand">Apps</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted">
            Gjør skjermene levende med data som oppdaterer seg selv – fra båtene i flåten til været ute og bursdagene på jobben.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/signup" className="inline-flex items-center gap-2 rounded-md bg-brand px-5 py-3 font-semibold text-onbrand transition hover:bg-brand-dark">
              Prøv gratis
              <Icon name="chevron" className="h-4 w-4" />
            </Link>
            <a href="#bygg" className="inline-flex items-center rounded-md border border-line bg-card px-5 py-3 font-semibold hover:bg-hair">
              Lag din egen app
            </a>
          </div>
        </div>
      </section>

      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <SectionHead kicker="Offisielle apper" title="Klare til bruk" text="Laget og vedlikeholdt av Flatr. Aktiver dem i Flatr Apps og legg dem på et lysbilde." />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {OFFICIAL_APPS.map((a) => (
              <div key={a.key} className="flex flex-col">
                <AppTile app={a} image={icons[a.key]} />
                {a.views?.length > 0 && (
                  <ul className="m-0 mt-2 list-none space-y-1 px-1 text-xs text-muted">
                    {a.views.map((v) => (
                      <li key={v} className="flex items-center gap-1.5">
                        <Icon name="check" className="h-3 w-3 text-brand" />
                        {v}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="bygg" className="scroll-mt-20 border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <SectionHead
            kicker="Appbyggeren"
            title="Lag din egen app – uten kode"
            text="Har dere data i et system med API – salgstall, kø, temperatur, bookinger? Koble det til skjermene på noen minutter."
          />
          <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {BUILDER_STEPS.map((s, i) => (
              <div key={s.title} className="bg-card p-6">
                <div className="mb-4 flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-tint text-brand">
                    <Icon name={s.icon} className="h-5 w-5" />
                  </span>
                  <span className="text-xs font-semibold text-muted">Steg {i + 1}</span>
                </div>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {community.length > 0 && (
        <section className="border-t border-line">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <SectionHead kicker="Fra fellesskapet" title="Apper laget av andre Flatr-kunder" text="Godkjent av Flatr før de blir tilgjengelige. Hver kunde bruker sine egne innstillinger og nøkler." />
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {community.map((a) => (
                <AppTile key={a.id} app={a} image={a.image} publisher={a.author || 'Ukjent'} verified={false} />
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="px-4 pb-20 pt-4 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 rounded-2xl bg-brand px-6 py-14 text-center text-onbrand sm:px-12">
          <h2 className="text-3xl font-bold tracking-tight">Klar til å prøve?</h2>
          <p className="max-w-lg opacity-80">Alle appene er med i gratisplanen – 0 kr i måneden, ingen kort.</p>
          <Link to="/signup" className="rounded-md bg-paper px-6 py-3 font-semibold text-ink transition hover:bg-card">
            Kom i gang gratis
          </Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
