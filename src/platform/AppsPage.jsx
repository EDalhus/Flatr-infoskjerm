// flatr.no/apps – den åpne oversikten over Flatr Apps: offisielle apper,
// appbyggeren og godkjente apper fra andre kunder.
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../admin/components/ui.jsx';
import { OFFICIAL_APPS } from '../lib/appCatalog.js';
import AppIcon from '../admin/components/apps/AppIcon.jsx';
import { SiteHeader, SiteFooter, SectionHead, AppTile, usePublicApps } from './Landing.jsx';

// De offisielle appene gruppert etter hva kunden vil oppnå. Nye apper som ikke
// står her, havner under «Mer» av seg selv.
const THEMES = [
  { id: 'drift', title: 'Drift og logistikk', text: 'Flåten, kaiene og lageret – oppdatert av seg selv.', keys: ['ais', 'stock'] },
  { id: 'vaer', title: 'Vær og sjø', text: 'Fra Yr, Kartverket og MET – ingen nøkler, ingen oppsett.', keys: ['weather', 'tides'] },
  { id: 'arbeidsplass', title: 'Arbeidsplassen', text: 'Det som gjør skjermen i lunsjrommet verdt å se på.', keys: ['birthdays', 'menu', 'calendar'] },
  { id: 'nyheter', title: 'Nyheter og sport', text: 'Nyhetene og lagene dere følger med på.', keys: ['rss', 'football'] },
  { id: 'arrangement', title: 'Arrangementer og styring', text: 'Program, tidsstyring og skjermer folk kan trykke på.', keys: ['events', 'timetable', 'touch'] },
  { id: 'innhold', title: 'Innhold og AI', text: 'Lag presentasjoner raskere, med bilder som passer.', keys: ['claude', 'cursor', 'unsplash'] }
];

function themed() {
  const byKey = Object.fromEntries(OFFICIAL_APPS.map((a) => [a.key, a]));
  const used = new Set(THEMES.flatMap((t) => t.keys));
  const rest = OFFICIAL_APPS.filter((a) => !used.has(a.key));
  return [
    ...THEMES.map((t) => ({ ...t, apps: t.keys.map((k) => byKey[k]).filter(Boolean) })),
    ...(rest.length ? [{ id: 'mer', title: 'Mer', text: 'Flere apper fra Flatr.', apps: rest }] : [])
  ].filter((t) => t.apps.length);
}

/** Kort for en offisiell app: ikon, navn, kort beskrivelse og hva den kan – like høye i rutenettet. */
function OfficialAppCard({ app, image }) {
  return (
    <article className="flex h-full flex-col rounded-xl border border-line bg-card p-5 transition-colors hover:border-brand/40">
      <div className="flex items-center gap-3">
        <AppIcon icon={app.icon} color={app.color} size={40} image={image} />
        <h4 className="m-0 min-w-0 truncate text-base font-semibold">{app.name}</h4>
      </div>
      <p className="m-0 mt-3 text-sm leading-relaxed text-muted">{app.tagline}</p>
      {app.requires && (
        <p className="m-0 mt-2 inline-flex items-center gap-1.5 text-xs text-muted">
          <Icon name="lock" className="h-3 w-3" />
          Trenger {app.requires}
        </p>
      )}
      {/* Punktlistene står nederst, så de flukter i rutenettet. */}
      <div className="flex-1" />
      {app.views?.length > 0 && (
        <ul className="m-0 mt-4 list-none space-y-1.5 border-t border-line p-0 pt-4 text-sm">
          {app.views.map((v) => (
            <li key={v} className="flex items-start gap-2">
              <Icon name="check" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
              <span>{v}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

const BUILDER_STEPS = [
  { icon: 'link', title: 'Koble til et API', text: 'Lim inn adressen til et hvilket som helst JSON-API over https. Nøkler lagres kryptert.' },
  { icon: 'search', title: 'Velg feltene', text: 'Test API-et og plukk feltene du vil vise – navn, tall, bilder eller posisjoner.' },
  { icon: 'layers', title: 'Velg visning', text: 'Stort tall, liste, kort, tabell eller kart. Forhåndsvisningen oppdateres mens du jobber.' },
  { icon: 'share', title: 'Del den', text: 'Bruk appen selv, eller send den til godkjenning så andre Flatr-kunder kan aktivere den.' }
];

export default function AppsPage() {
  const { official_icons: icons, community } = usePublicApps();
  const groups = themed();

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
          <SectionHead kicker="Offisielle apper" title="Klare til bruk" text="Laget og vedlikeholdt av Flatr. Aktiver dem med ett klikk og legg dem på et lysbilde." />
          <nav aria-label="Temaer" className="mt-8 flex flex-wrap gap-2">
            {groups.map((t) => (
              <a key={t.id} href={`#${t.id}`} className="rounded-full border border-line bg-card px-3.5 py-1.5 text-sm font-medium text-muted transition-colors hover:border-brand/40 hover:text-ink">
                {t.title}
              </a>
            ))}
          </nav>
          <div className="mt-12 space-y-14">
            {groups.map((t) => (
              <div key={t.id} id={t.id} className="scroll-mt-24">
                <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line pb-3">
                  <h3 className="m-0 text-xl font-semibold tracking-tight">{t.title}</h3>
                  <p className="m-0 text-sm text-muted">{t.text}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {t.apps.map((a) => (
                    <OfficialAppCard key={a.key} app={a} image={icons[a.key]} />
                  ))}
                </div>
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
