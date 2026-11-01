// Personvernerklæring og vilkår for betaen (flatr.no/personvern, /vilkar).
// NB: Felt i [hakeparenteser] må fylles inn av plattformeieren.
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LogoLockup } from '../admin/components/Logo.jsx';
import { tr, getLang, locale } from '../lib/i18n.js';

// Sist endret (vises i språket til leseren).
export const LEGAL_UPDATED = '2026-11-01';
const CONTROLLER = '[Selskapsnavn / ditt navn], org.nr. [nummer]';
const CONTACT = '[kontakt-e-post]';

function LegalPage({ title, children }) {
  useEffect(() => {
    document.title = tr('{0} – Flatr', [title]);
  }, [title]);
  return (
    <div className="min-h-full overflow-y-auto bg-paper text-ink">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
        <Link to="/" aria-label={tr('Til forsiden')}>
          <LogoLockup className="h-7 w-auto text-ink" />
        </Link>
        <nav className="flex gap-4 text-sm font-semibold">
          <Link to="/personvern" className="text-muted hover:text-ink">
            {tr('Personvern')}
          </Link>
          <Link to="/vilkar" className="text-muted hover:text-ink">
            {tr('Vilkår')}
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-6 pb-20">
        <article className="rounded-3xl border border-hair bg-card p-6 leading-relaxed shadow-card sm:p-10 [&_h2]:mb-2 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_li]:mb-1 [&_p]:my-3 [&_ul]:list-disc [&_ul]:pl-6">
          <h1 className="page-title m-0">{title}</h1>
          <p className="text-sm text-muted">
            {tr('Sist oppdatert')} {new Date(`${LEGAL_UPDATED}T12:00:00`).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          {getLang() !== 'nb' && <p className="text-sm text-muted">{tr('Dette er en oversettelse. Den norske versjonen gjelder.')}</p>}
          {children}
        </article>
      </main>
    </div>
  );
}

export function Privacy() {
  return (
    <LegalPage title={tr('Personvernerklæring')}>
      <p>
        {tr('Denne erklæringen forklarer hvilke personopplysninger Flatr behandler, hvorfor, og hvilke rettigheter du har. Behandlingsansvarlig er')} {CONTROLLER}{tr('. Spørsmål kan sendes til')} {CONTACT}.
      </p>

      <h2>{tr('Hvilke opplysninger vi behandler')}</h2>
      <ul>
        <li>
          <strong>{tr('Konto:')}</strong> {tr('e-postadresse og navn (valgfritt) for deg og kollegaene du inviterer, organisasjonens navn og valgt adresse (subdomene).')}
        </li>
        <li>
          <strong>{tr('Innlogging:')}</strong> {tr('passordet ditt (lagret som en sikker hash, aldri i klartekst), tofaktor hvis du slår det på, kobling til Google hvis du logger inn med Google, og en sesjons-cookie som holder deg innlogget.')}
        </li>
        <li>
          <strong>{tr('Innhold:')}</strong> {tr('det du laster opp eller skriver i Flatr – bilder, video, dokumenter, tekst, program og kalender-/nyhetsadresser.')}
        </li>
        <li>
          <strong>{tr('Skjermer:')}</strong> {tr('teknisk informasjon fra tilkoblede spillere (modell, programvareversjon, oppløsning, IP-adresse, når de sist var på nett) og skjermbilder av det skjermen viser.')}
        </li>
        <li>
          <strong>{tr('Drift og sikkerhet:')}</strong> {tr('IP-adresse og tidspunkt i serverlogger, for å hindre misbruk og rette feil.')}
        </li>
        <li>
          <strong>{tr('Betaling (betalte planer):')}</strong> {tr('e-post for kvitteringer, organisasjonsnummer, navn og adresse fra Enhetsregisteret, og hvilken plan dere har. Kortopplysninger går rett til Stripe og lagres aldri hos Flatr.')}
        </li>
      </ul>

      <h2>{tr('Formål og rettslig grunnlag')}</h2>
      <ul>
        <li>{tr('Levere tjenesten du har registrert deg for (avtale, GDPR art. 6 nr. 1 b).')}</li>
        <li>{tr('Sende innloggingslenker, invitasjoner og varsler om TV-er som er frakoblet (avtale).')}</li>
        <li>{tr('Sikkerhet, feilretting og forbedring av tjenesten i betaperioden (berettiget interesse, art. 6 nr. 1 f).')}</li>
      </ul>
      <p>{tr('Vi selger ikke opplysninger, viser ikke reklame og bruker ikke sporings- eller analyse-cookies.')}</p>

      <h2>{tr('Hvem som behandler opplysningene for oss')}</h2>
      <ul>
        <li>
          <strong>{tr('[Serverleverandør]')}</strong> {tr('– drift av serveren der tjenesten og alle data ligger ([land]).')}
        </li>
        <li>
          <strong>{tr('Cloudflare, Inc.')}</strong> {tr('– DNS, kryptert tilkobling og beskyttelse mot angrep. Trafikken til Flatr går gjennom Cloudflare, og driftsstatusen på status.flatr.no kjører der. Overføring utenfor EØS skjer etter EUs standardkontrakter.')}
        </li>
        <li>
          <strong>Stripe</strong> {tr('– betaling for betalte planer: kort, fakturaer og kvitteringer. Overføring utenfor EØS skjer etter EUs standardkontrakter.')}
        </li>
      </ul>
      <p>
        {tr('E-post sendes fra vår egen server. Værdata (MET Norge), stedsnavn (Kartverket), nyhetsstrømmer og kalendere hentes av serveren vår – ingen personopplysninger om deg sendes til disse. Organisasjonsnummer dere skriver inn under Abonnement, slås opp i Brønnøysundregistrene (Enhetsregisteret og Frivillighetsregisteret).')}
      </p>

      <h2>{tr('Hvor lenge vi lagrer')}</h2>
      <ul>
        <li>{tr('Konto og innhold lagres så lenge kontoen finnes. Slettede ting ligger i «Nylig slettet» i 30 dager.')}</li>
        <li>
          {tr('Sletter en eier organisasjonen (Eksport og sletting i Flatr), forsvinner innholdet med en gang og fra sikkerhetskopiene innen tre uker. Avslutter vi en konto, slettes innholdet innen 30 dager, og fra sikkerhetskopiene innen tre uker etter det.')}
        </li>
        <li>{tr('Sletter du kontoen din (Konto og sikkerhet i Flatr), fjernes innloggingen og medlemskapene dine med en gang.')}</li>
        <li>{tr('Innloggingsøkter utløper etter 30 dager, engangslenker etter 30 minutter.')}</li>
      </ul>

      <h2>{tr('Dine rettigheter')}</h2>
      <p>
        {tr('Du kan be om innsyn i, retting av og sletting av dine opplysninger, og om å få dem utlevert (dataportabilitet). Mye kan du gjøre selv i Flatr: eiere kan laste ned alt innholdet som en ZIP-fil og slette organisasjonen under Eksport og sletting, og alle kan slette sin egen konto under Konto og sikkerhet. Du kan også protestere mot behandling som bygger på berettiget interesse. Kontakt')} {CONTACT}{tr('. Mener du at vi behandler opplysninger i strid med regelverket, kan du klage til Datatilsynet (datatilsynet.no).')}
      </p>

      <h2>{tr('Cookies')}</h2>
      <p>
        {tr('Flatr bruker bare én nødvendig cookie for å holde deg innlogget, og lagrer noen visningsvalg (som tema) i nettleseren. Ingen samtykke er nødvendig for slike nødvendige cookies.')}
      </p>
    </LegalPage>
  );
}

export function Terms() {
  return (
    <LegalPage title={tr('Vilkår for bruk (beta)')}>
      <p>
        {tr('Flatr er i beta. Tjenesten er gratis i denne perioden, og vi setter stor pris på tilbakemeldinger. Ved å opprette en konto godtar du disse vilkårene. Tjenesten leveres av')} {CONTROLLER}.
      </p>

      <h2>{tr('Betaen')}</h2>
      <ul>
        <li>{tr('Gratisplanen er gratis. Vi gir beskjed i god tid før endringer i prisene.')}</li>
        <li>
          {tr('Funksjoner kan endres, og det kan forekomme feil og nedetid. Ikke bruk Flatr som eneste skjerm for sikkerhetskritisk informasjon.')}
        </li>
        <li>{tr('Kontoer har kvoter for lagring, TV-er og skjermer. Trenger du mer, kan du oppgradere eller ta kontakt.')}</li>
      </ul>

      <h2>{tr('Priser og betaling')}</h2>
      <ul>
        <li>{tr('Betalte planer (Pro og Lag og frivillige) koster det som står på flatr.no, per skjerm og eks. mva.')}</li>
        <li>{tr('De betales forskuddsvis per måned eller år, med kort, eller med faktura ved årlig betaling. Betalingen håndteres av Stripe.')}</li>
        <li>{tr('Lag og frivillige gjelder organisasjoner som står i Frivillighetsregisteret. Vi sjekker det i Brønnøysundregistrene.')}</li>
        <li>{tr('Flere skjermer eller mer lagring midt i en periode faktureres forholdsmessig med en gang. Færre trekkes fra neste betaling.')}</li>
        <li>{tr('Du kan si opp når som helst under Abonnement i Flatr. Planen gjelder ut perioden dere har betalt for, og påbegynte perioder refunderes ikke.')}</li>
        <li>
          {tr('Blir en betaling ikke gjort, beholder dere planen i tre uker. Deretter gjelder gratisplanen, og skjermer over grensen viser en beskjed i stedet for innholdet til dere fornyer.')}
        </li>
      </ul>

      <h2>{tr('Ditt innhold')}</h2>
      <ul>
        <li>{tr('Du eier innholdet du legger inn, og gir oss bare de rettighetene som trengs for å vise det på skjermene dine.')}</li>
        <li>
          {tr('Du er ansvarlig for at du har rett til å bruke innholdet (bilder, video, logoer, musikk) og at det ikke er ulovlig, krenkende eller villedende.')}
        </li>
        <li>{tr('Vi kan fjerne innhold eller stenge kontoer som bryter disse vilkårene eller loven.')}</li>
      </ul>

      <h2>{tr('Konto og tilgang')}</h2>
      <ul>
        <li>{tr('Eiere av kontoen bestemmer hvem som har tilgang, og er ansvarlige for kollegaene de inviterer.')}</li>
        <li>{tr('Hold e-postkontoen din sikker – innloggingslenker sendes dit.')}</li>
      </ul>

      <h2>{tr('Ansvar')}</h2>
      <p>
        {tr('Tjenesten leveres «som den er» i betaperioden. Vi tar sikkerhetskopi hver natt, men er ikke ansvarlige for indirekte tap eller tap av data. Ansvaret er i alle tilfeller begrenset til det som følger av ufravikelig lov.')}
      </p>

      <h2>{tr('Avslutning')}</h2>
      <p>
        {tr('Du kan når som helst slette organisasjonen (eiere) eller kontoen din selv i Flatr, eller be oss om det ved å kontakte')} {CONTACT}{tr('. Vi kan avslutte betaen eller en konto med rimelig varsel.')}
      </p>

      <h2>{tr('Personvern')}</h2>
      <p>
        {tr('Se')} <Link to="/personvern" className="font-semibold text-brand hover:underline">{tr('personvernerklæringen')}</Link> {tr('for hvordan vi behandler personopplysninger.')}
      </p>
    </LegalPage>
  );
}
