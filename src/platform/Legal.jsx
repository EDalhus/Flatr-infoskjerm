// Personvernerklæring og vilkår for betaen (flatr.no/personvern, /vilkar).
// NB: Felt i [hakeparenteser] må fylles inn av plattformeieren.
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LogoLockup } from '../admin/components/Logo.jsx';

export const LEGAL_UPDATED = '26. oktober 2026';
const CONTROLLER = '[Selskapsnavn / ditt navn], org.nr. [nummer]';
const CONTACT = '[kontakt-e-post]';

function LegalPage({ title, children }) {
  useEffect(() => {
    document.title = `${title} – Flatr`;
  }, [title]);
  return (
    <div className="min-h-full overflow-y-auto bg-paper text-ink">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
        <Link to="/" aria-label="Til forsiden">
          <LogoLockup className="h-7 w-auto text-ink" />
        </Link>
        <nav className="flex gap-4 text-sm font-semibold">
          <Link to="/personvern" className="text-muted hover:text-ink">
            Personvern
          </Link>
          <Link to="/vilkar" className="text-muted hover:text-ink">
            Vilkår
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-6 pb-20">
        <article className="rounded-3xl border border-hair bg-card p-6 leading-relaxed shadow-card sm:p-10 [&_h2]:mb-2 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_li]:mb-1 [&_p]:my-3 [&_ul]:list-disc [&_ul]:pl-6">
          <h1 className="page-title m-0">{title}</h1>
          <p className="text-sm text-muted">Sist oppdatert {LEGAL_UPDATED}</p>
          {children}
        </article>
      </main>
    </div>
  );
}

export function Privacy() {
  return (
    <LegalPage title="Personvernerklæring">
      <p>
        Denne erklæringen forklarer hvilke personopplysninger Flatr behandler, hvorfor, og hvilke rettigheter du har.
        Behandlingsansvarlig er {CONTROLLER}. Spørsmål kan sendes til {CONTACT}.
      </p>

      <h2>Hvilke opplysninger vi behandler</h2>
      <ul>
        <li>
          <strong>Konto:</strong> e-postadresse og navn (valgfritt) for deg og kollegaene du inviterer, organisasjonens
          navn og valgt adresse (subdomene).
        </li>
        <li>
          <strong>Innlogging:</strong> en sesjons-cookie som holder deg innlogget, og engangslenker sendt på e-post.
          Vi bruker ikke passord.
        </li>
        <li>
          <strong>Innhold:</strong> det du laster opp eller skriver i Flatr – bilder, video, dokumenter, tekst, program
          og kalender-/nyhetsadresser.
        </li>
        <li>
          <strong>Skjermer:</strong> teknisk informasjon fra tilkoblede spillere (modell, programvareversjon,
          oppløsning, IP-adresse, når de sist var på nett) og skjermbilder av det skjermen viser.
        </li>
        <li>
          <strong>Drift og sikkerhet:</strong> IP-adresse og tidspunkt i serverlogger, for å hindre misbruk og rette
          feil.
        </li>
      </ul>

      <h2>Formål og rettslig grunnlag</h2>
      <ul>
        <li>Levere tjenesten du har registrert deg for (avtale, GDPR art. 6 nr. 1 b).</li>
        <li>Sende innloggingslenker, invitasjoner og varsler om TV-er som er frakoblet (avtale).</li>
        <li>Sikkerhet, feilretting og forbedring av tjenesten i betaperioden (berettiget interesse, art. 6 nr. 1 f).</li>
      </ul>
      <p>Vi selger ikke opplysninger, viser ikke reklame og bruker ikke sporings- eller analyse-cookies.</p>

      <h2>Hvem som behandler opplysningene for oss</h2>
      <ul>
        <li>
          <strong>[Serverleverandør]</strong> – drift av serveren der tjenesten og alle data ligger ([land]).
        </li>
        <li>
          <strong>Cloudflare, Inc.</strong> – DNS, kryptert tilkobling og beskyttelse mot angrep. Trafikken til Flatr
          går gjennom Cloudflare. Overføring utenfor EØS skjer etter EUs standardkontrakter.
        </li>
      </ul>
      <p>
        E-post sendes fra vår egen server. Værdata (MET Norge), stedsnavn (Kartverket), nyhetsstrømmer og kalendere
        hentes av serveren vår – ingen personopplysninger om deg sendes til disse.
      </p>

      <h2>Hvor lenge vi lagrer</h2>
      <ul>
        <li>Konto og innhold lagres så lenge kontoen finnes. Slettede ting ligger i «Nylig slettet» i 30 dager.</li>
        <li>Når en konto avsluttes, slettes innholdet innen 30 dager, og fra sikkerhetskopier innen 14 dager etter det.</li>
        <li>Innloggingsøkter utløper etter 30 dager, engangslenker etter 30 minutter.</li>
      </ul>

      <h2>Dine rettigheter</h2>
      <p>
        Du kan be om innsyn i, retting av og sletting av dine opplysninger, og om å få dem utlevert (dataportabilitet).
        Du kan også protestere mot behandling som bygger på berettiget interesse. Kontakt {CONTACT}. Mener du at vi
        behandler opplysninger i strid med regelverket, kan du klage til Datatilsynet (datatilsynet.no).
      </p>

      <h2>Cookies</h2>
      <p>
        Flatr bruker bare én nødvendig cookie for å holde deg innlogget, og lagrer noen visningsvalg (som tema) i
        nettleseren. Ingen samtykke er nødvendig for slike nødvendige cookies.
      </p>
    </LegalPage>
  );
}

export function Terms() {
  return (
    <LegalPage title="Vilkår for bruk (beta)">
      <p>
        Flatr er i beta. Tjenesten er gratis i denne perioden, og vi setter stor pris på tilbakemeldinger. Ved å opprette
        en konto godtar du disse vilkårene. Tjenesten leveres av {CONTROLLER}.
      </p>

      <h2>Betaen</h2>
      <ul>
        <li>Tjenesten er gratis i betaperioden. Vi gir beskjed i god tid før eventuelle priser innføres.</li>
        <li>
          Funksjoner kan endres, og det kan forekomme feil og nedetid. Ikke bruk Flatr som eneste skjerm for
          sikkerhetskritisk informasjon.
        </li>
        <li>Kontoer har kvoter for lagring, TV-er og skjermer. Ta kontakt om du trenger mer.</li>
      </ul>

      <h2>Ditt innhold</h2>
      <ul>
        <li>Du eier innholdet du legger inn, og gir oss bare de rettighetene som trengs for å vise det på skjermene dine.</li>
        <li>
          Du er ansvarlig for at du har rett til å bruke innholdet (bilder, video, logoer, musikk) og at det ikke er
          ulovlig, krenkende eller villedende.
        </li>
        <li>Vi kan fjerne innhold eller stenge kontoer som bryter disse vilkårene eller loven.</li>
      </ul>

      <h2>Konto og tilgang</h2>
      <ul>
        <li>Eiere av kontoen bestemmer hvem som har tilgang, og er ansvarlige for kollegaene de inviterer.</li>
        <li>Hold e-postkontoen din sikker – innloggingslenker sendes dit.</li>
      </ul>

      <h2>Ansvar</h2>
      <p>
        Tjenesten leveres «som den er» i betaperioden. Vi tar sikkerhetskopi hver natt, men er ikke ansvarlige for
        indirekte tap eller tap av data. Ansvaret er i alle tilfeller begrenset til det som følger av ufravikelig lov.
      </p>

      <h2>Avslutning</h2>
      <p>
        Du kan når som helst be om at kontoen slettes ved å kontakte {CONTACT}. Vi kan avslutte betaen eller en konto
        med rimelig varsel.
      </p>

      <h2>Personvern</h2>
      <p>
        Se <Link to="/personvern" className="font-semibold text-brand hover:underline">personvernerklæringen</Link> for
        hvordan vi behandler personopplysninger.
      </p>
    </LegalPage>
  );
}
