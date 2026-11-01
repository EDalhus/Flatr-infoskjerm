
import { tr } from './i18n.js';// Flatr Apps – katalogen. Offisielle apper er bygd inn i Flatr; egne apper
// lages i appbyggeren (uten kode) og ligger i platform.db (server/appMarket.js).
// Felles for server og nettleser.

export const CATEGORIES = [
  { id: 'transport', label: tr('Transport og logistikk') },
  { id: 'weather', label: tr('Vær') },
  { id: 'news', label: tr('Nyheter') },
  { id: 'productivity', label: tr('Kalender og planlegging') },
  { id: 'people', label: tr('Ansatte og arbeidsplass') },
  { id: 'data', label: tr('Data og API') },
  { id: 'ai', label: tr('AI-assistenter') },
  { id: 'food', label: tr('Kantine og mat') },
  { id: 'sport', label: tr('Sport') },
  { id: 'other', label: tr('Annet') }
];
export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

// Ikoner fra ui.jsx sitt ikonsett.
export const APP_ICONS = ['sparkle', 'chart', 'pin', 'sun', 'megaphone', 'calendar', 'clock', 'users', 'tag', 'link', 'layers', 'monitor', 'home', 'image'];

/**
 * Offisielle apper. `element` er elementtypen appen gir i editoren:
 *   'app'  -> elementet «Flatr App» koblet til installasjonen (har data/innstillinger)
 *   annet  -> en innebygd widget som bare blir tilgjengelig når appen er aktivert
 */
export const OFFICIAL_APPS = [
  {
    key: 'ais',
    name: tr('NAIS (Norsk AIS-tjeneste)'),
    tagline: tr('Følg flåten live på kart, som båtkort eller som ankomsttavle.'),
    description:
      tr('Henter posisjon, fart, kurs og destinasjon for båtene dine fra Kystverkets AIS via BarentsWatch, oppdatert hvert minutt. Legg inn båtene med MMSI-nummer og kaiene dere bruker, så regner Flatr ut estimert ankomst.\n\nMed tillegget Anløp registrerer dere kjente båtanløp: kai, forventet ankomst og avgang, neste havn og hvilke varer som leveres eller hentes. Anløpsplanen vises på skjermene, med live status fra AIS for båtene i flåten.\n\nKrever en gratis API-klient av typen AIS fra BarentsWatch – hver konto bruker sin egen.'),
    category: 'transport',
    icon: 'pin',
    color: '#0b6bcb',
    element: 'app',
    views: [tr('Kart over flåten i sanntid'), tr('Båtkort med status og ankomsttid'), tr('Ankomsttavle og anløpsplan med last')],
    requires: 'BarentsWatch API-klient (AIS)',
    // Steg-for-steg under «Om appen». link = { href, label } (valgfri).
    guide: {
      title: tr('Slik kobler du til BarentsWatch'),
      intro: tr('AIS-dataene kommer fra Kystverket via BarentsWatch. Det er gratis, men hver konto trenger sin egen API-klient. Det tar et par minutter.'),
      steps: [
        {
          title: tr('Opprett en bruker hos BarentsWatch'),
          body: tr('Gå til BarentsWatch «Min side» og registrer deg gratis, eller logg inn hvis du har bruker fra før.'),
          link: { href: 'https://www.barentswatch.no/minside/', label: tr('Åpne barentswatch.no/minside') }
        },
        {
          title: tr('Registrer en ny API-klient av typen AIS'),
          body: tr('På Min side finner du registrering av API-klienter. Lag en ny klient og velg klienttypen AIS – ikke den vanlige API-klienten. Velger du feil type, vil innloggingen fra Flatr bli avvist.')
        },
        {
          title: tr('Gi klienten et navn og lag en hemmelighet'),
          body: tr('Kall klienten for eksempel «flatr», og lag en hemmelighet (client secret). Kopier hemmeligheten med en gang og ta vare på den – du får ikke se den igjen hos BarentsWatch.')
        },
        {
          title: tr('Finn client id'),
          body: tr('Client id er e-postadressen du er registrert med, et kolon og navnet på klienten – for eksempel kari@firma.no:flatr. Skriv den nøyaktig, med store og små bokstaver.')
        },
        {
          title: tr('Legg inn client id og secret i Flatr'),
          body: tr('Aktiver NAIS, gå til fanen Oppsett og fyll inn client id og client secret under BarentsWatch. Trykk Lagre. Når det står «Tilkoblet», henter Flatr data. Hemmeligheten lagres kryptert og vises aldri igjen.')
        },
        {
          title: tr('Legg inn flåten og kaiene'),
          body: tr('Legg til båtene med navn og MMSI-nummer (9 siffer – står i skipets papirer, eller finnes ved å søke opp båten på et AIS-kart). Legg til kaiene dere bruker ved å klikke i kartet, så får du estimert ankomst.')
        },
        {
          title: tr('Vis det på skjermene'),
          body: tr('Åpne en presentasjon i editoren, velg Widgeter → NAIS og velg kart, båtkort eller ankomsttavle.')
        }
      ],
      troubleshooting:
        tr('Står det at BarentsWatch ikke godtok client id/secret? Sjekk at klienten er av typen AIS, at client id er skrevet nøyaktig (med :klientnavn på slutten), og prøv å lage en ny hemmelighet. Står det «ikke funnet i AIS» ved en båt, er MMSI-nummeret feil eller båten har ikke sendt AIS det siste døgnet.')
    }
  },
  {
    key: 'birthdays',
    name: tr('Bursdager'),
    tagline: tr('Vis de neste bursdagene på jobben – med navn, dato og hvor lenge det er igjen.'),
    description:
      tr('Legg inn de ansatte med navn og fødselsdato (eller lim inn en liste fra Excel), så viser skjermene de neste bursdagene: hvem, hvilken dag, hvor mange dager det er igjen og hvor gamle de blir. Den som har bursdag i dag, blir fremhevet.\n\nFødselsdatoene vises aldri på skjermene – bare dag og måned. Alderen kan skjules for alle, eller for den enkelte.'),
    category: 'people',
    icon: 'users',
    color: '#d6409f',
    element: 'app',
    views: [tr('De neste bursdagene på jobben'), tr('Kakeregn på selve dagen')]
  },
  {
    key: 'claude',
    name: tr('Claude AI'),
    tagline: tr('Lag og endre presentasjoner ved å skrive hva du vil ha.'),
    description:
      tr('Trykk ⌘K (Ctrl+K på Windows) hvor som helst i Flatr og beskriv presentasjonen du vil ha – Claude bygger den i editoren mens du ser på. I editoren får du en AI-fane med hele samtalen, tankegangen og hvert steg Claude tar, og du kan be om endringer underveis.\n\nClaude kan bare lese og endre presentasjoner – ikke skjermer, brukere eller innstillinger – og alt kan angres. Appen bruker kontoens egen API-nøkkel fra Anthropic, og bruken faktureres der.'),
    category: 'ai',
    icon: 'sparkle',
    color: '#d97757',
    element: 'assistant',
    views: [tr('Lag en presentasjon fra en kort beskrivelse'), tr('Be om endringer med vanlige ord'), tr('Bruker deres egen Claude-nøkkel')],
    requires: tr('API-nøkkel fra Anthropic (Claude)'),
    guide: {
      title: tr('Slik kobler du til Claude'),
      intro: tr('Claude AI bruker en API-nøkkel fra Anthropic. Den lages på et par minutter, og du betaler bare for det du bruker.'),
      steps: [
        {
          title: tr('Logg inn i Anthropic Console'),
          body: tr('Opprett en konto eller logg inn. Legg inn betalingskort eller kjøp kreditt under Billing – uten det virker ikke nøkkelen.'),
          link: { href: 'https://console.anthropic.com/', label: tr('Åpne console.anthropic.com') }
        },
        {
          title: tr('Lag en API-nøkkel'),
          body: tr('Gå til API Keys og trykk «Create Key». Kall den for eksempel «Flatr», og kopier nøkkelen (den starter med sk-ant-). Du får ikke se den igjen.'),
          link: { href: 'https://console.anthropic.com/settings/keys', label: tr('Åpne API Keys') }
        },
        {
          title: tr('Lim inn nøkkelen i Flatr'),
          body: tr('Aktiver Claude AI, gå til fanen Oppsett og lim inn nøkkelen. Flatr sjekker at den virker før den lagres kryptert.')
        },
        {
          title: tr('Trykk ⌘K og beskriv hva du vil ha'),
          body: tr('For eksempel «Lag en velkomstpresentasjon for besøkende med klokke og vær». Velg en ny eller eksisterende presentasjon, så åpnes editoren og Claude setter i gang.')
        }
      ],
      troubleshooting:
        tr('Sier Flatr at nøkkelen ikke godtas? Sjekk at du kopierte hele nøkkelen, og at kontoen hos Anthropic har kreditt eller betalingskort. Står det «for mange forespørsler», er grensen for kontoen nådd – vent litt eller øk den i Console.')
    }
  },
  {
    key: 'cursor',
    name: tr('Cursor AI'),
    tagline: tr('Lag og endre presentasjoner med Cursors agent.'),
    description:
      tr('Samme AI-assistent som Claude AI, men drevet av Cursor: trykk ⌘K (Ctrl+K på Windows) hvor som helst i Flatr og beskriv presentasjonen du vil ha, eller be om endringer i AI-fanen i editoren. Du ser tankegangen og hvert steg underveis.\n\nAgenten kjører i Cursors sky og kan bare lese og endre presentasjoner – ikke skjermer, brukere eller innstillinger – og alt kan angres. Appen bruker kontoens egen API-nøkkel fra Cursor (krever et betalt Cursor-abonnement), og bruken faktureres der. Har dere både Claude AI og Cursor AI, velger dere assistent i dialogen.'),
    category: 'ai',
    icon: 'sparkle',
    color: '#111827',
    element: 'assistant',
    views: [tr('Lag en presentasjon fra en kort beskrivelse'), tr('Velg blant modellene i Cursor-kontoen'), tr('Bruker deres egen Cursor-nøkkel')],
    requires: tr('API-nøkkel fra Cursor'),
    guide: {
      title: tr('Slik kobler du til Cursor'),
      intro: tr('Cursor AI bruker Cursors Cloud Agents med en API-nøkkel fra Cursor-kontoen deres. Det krever et betalt Cursor-abonnement. Nøkkelen er alt dere trenger: Flatr kobler agenten til presentasjonen selv (via MCP) hver gang, så dere skal ikke sette opp noe i Cursor.'),
      steps: [
        {
          title: tr('Logg inn på Cursor'),
          body: tr('Logg inn på cursor.com med kontoen som skal betale for bruken, og åpne Dashboard.'),
          link: { href: 'https://cursor.com/dashboard', label: tr('Åpne cursor.com/dashboard') }
        },
        {
          title: tr('Lag en API-nøkkel'),
          body: tr('Gå til Integrations (eller Cloud Agents) og lag en ny API-nøkkel. Kall den for eksempel «Flatr», og kopier den – du får ikke se den igjen.')
        },
        {
          title: tr('Lim inn nøkkelen i Flatr'),
          body: tr('Aktiver Cursor AI, gå til fanen Oppsett og lim inn nøkkelen. Flatr sjekker at den virker før den lagres kryptert. Velg gjerne modell samme sted.')
        },
        {
          title: tr('Trykk ⌘K og beskriv hva du vil ha'),
          body: tr('Velg Cursor som assistent hvis dere også har Claude AI. Agenten starter i Cursors sky og bygger presentasjonen mens du ser på – første svar kan ta litt lenger tid enn med Claude.')
        }
      ],
      troubleshooting:
        tr('Står det at kontoen ikke har tilgang? Cloud Agents krever et betalt Cursor-abonnement. Sier Flatr at nøkkelen ikke godtas, sjekk at du kopierte hele nøkkelen.')
    }
  },
  {
    key: 'events',
    name: tr('Arrangement og program'),
    tagline: tr('Program, scener og nedtelling for konferanser, festivaler og arrangementer.'),
    description:
      tr('Gir deg Program i menyen – programposter med tid, scene og fargede kategorier, og status som «pågår» og «forsinket» – og widgetene Program og Nedtelling i editoren. QR-koden kan lenke til programmet på mobil.'),
    category: 'productivity',
    icon: 'calendar',
    color: '#7c3aed',
    element: 'feature',
    views: [tr('Program per scene og dag'), tr('Nedtelling til neste post'), tr('QR-kode til programmet på mobilen')],
    ready: tr('Klar til bruk. Program finner du nå i menyen, og Program og Nedtelling under Widgeter i editoren.')
  },
  {
    key: 'timetable',
    name: tr('Tidsplan'),
    tagline: tr('Vis andre presentasjoner til bestemte tider – f.eks. lunsjmeny kl. 11–13 og nyheter om kvelden.'),
    description:
      tr('Gir deg Tidsplan i menyen: velg hvilken presentasjon hver skjerm skal vise når, per ukedag og klokkeslett, eller slå skjermen helt av i perioder. Uten Tidsplan viser hver skjerm én presentasjon hele tiden (åpningstider fungerer uansett).'),
    category: 'productivity',
    icon: 'clock',
    color: '#0ea5e9',
    element: 'feature',
    views: [tr('Riktig innhold til riktig tid'), tr('Ulike presentasjoner per ukedag'), tr('Skjermene av utenom åpningstid')],
    ready: tr('Klar til bruk. Tidsplan finner du nå i menyen.')
  },
  {
    key: 'touch',
    name: tr('Berøringsskjerm'),
    tagline: tr('Knapper og sveip for interaktive skjermer i resepsjoner og showrom.'),
    description:
      tr('Gir deg elementet Knapp i editoren: gå til et lysbilde, neste/forrige, eller vis en nettside. På berøringsskjermer kan man også sveipe mellom lysbildene. Når noen trykker, stopper automatisk bytte; etter 45 sekunder uten berøring går skjermen tilbake til start.\n\nVirker på skjermer som viser Flatr i en nettleser med berøring (ikke Apple TV).'),
    category: 'other',
    icon: 'link',
    color: '#db2777',
    element: 'feature',
    views: [tr('Knapper som åpner andre lysbilder'), tr('Sveip mellom lysbildene'), tr('Går tilbake til start av seg selv')],
    ready: 'Klar til bruk. Legg til en knapp fra Widgeter i editoren.'
  },
  {
    key: 'menu',
    name: tr('Dagens meny'),
    tagline: tr('Kantinemenyen på skjermene – dagens retter med pris og allergener.'),
    description:
      tr('Legg inn ukemenyen dag for dag (eller lim inn hele menyen og la Claude AI sortere den), så viser skjermene dagens retter automatisk. Hver rett kan ha beskrivelse, pris og merking som vegetar, glutenfri eller allergener.\n\nVelg mellom «Dagens meny» og «Hele uka» på skjermen.'),
    category: 'food',
    icon: 'calendar',
    color: '#f76b15',
    element: 'app',
    views: ['Dagens retter med pris', 'Allergener og vegetar', 'Hele ukens meny']
  },
  {
    key: 'stock',
    name: tr('Lagerbeholdning'),
    tagline: tr('Hva dere har på lager nå – skrevet inn for hånd, vist på skjermene.'),
    description:
      tr('Legg inn varene med mengde og enhet (tonn, big bags, paller …), gjerne med detaljer som silo eller lagerplass. Skjermene viser beholdningen med en gang du lagrer, og når den sist ble oppdatert.\n\nSett en minstebeholdning, så markeres varer som er i ferd med å gå tomme.'),
    category: 'transport',
    icon: 'layers',
    color: '#0f766e',
    element: 'app',
    views: ['Bulk, big bags og paller', 'Detaljer som silo og lagerplass', 'Varsel ved lav beholdning']
  },
  {
    key: 'tides',
    name: tr('Tidevann og sjø'),
    tagline: tr('Høyvann og lavvann fra Kartverket, bølgehøyde og sjøtemperatur fra MET.'),
    description:
      tr('Velg ett eller flere steder langs kysten, så viser skjermene neste høyvann og lavvann (Kartverket) og bølgehøyde, sjøtemperatur og strøm (MET Norway). Ingen nøkkel trengs. Data oppdateres hver halvtime.'),
    category: 'weather',
    icon: 'sun',
    color: '#0e7490',
    element: 'app',
    views: [tr('Neste flo og fjære'), tr('Bølgehøyde og sjøtemperatur'), tr('Data fra Kartverket og MET')]
  },
  {
    key: 'football',
    name: tr('Fotball'),
    tagline: tr('Kamper, resultater og tabell for lagene dere holder med.'),
    description:
      tr('Følg lag og ligaer fra hele verden: neste kamper, siste resultater og tabellen – live under kampene. Data fra API-Football; hver konto bruker sin egen nøkkel (gratisplanen holder for et par lag).'),
    category: 'sport',
    icon: 'chart',
    color: '#15803d',
    element: 'app',
    views: [tr('Neste kamper'), tr('Resultater, også live'), tr('Tabellen i ligaen')],
    requires: tr('API-Football-nøkkel (gratis)'),
    guide: {
      title: tr('Slik får du en API-Football-nøkkel'),
      intro: tr('Gratisplanen gir 100 forespørsler i døgnet. Flatr henter data hver annen time (hvert tiende minutt under kamp), så det holder for to–tre lag og en tabell.'),
      steps: [
        { title: tr('Registrer deg hos API-Football'), body: tr('Lag en gratis konto på dashboardet til API-Sports.'), link: { href: 'https://dashboard.api-football.com/register', label: tr('Åpne dashboard.api-football.com') } },
        { title: tr('Kopier nøkkelen'), body: tr('Under «Account» → «My Access» finner du API-nøkkelen. Kopier den.') },
        { title: tr('Lim den inn i Flatr'), body: tr('Aktiver Fotball, gå til Oppsett og lim inn nøkkelen. Søk så opp lagene og ligaene dere vil følge.') },
        { title: tr('Vis det på skjermene'), body: tr('Åpne en presentasjon og velg Widgeter → Fotball. Velg neste kamper, siste resultater eller tabell.') }
      ],
      troubleshooting: tr('Står det at grensen er nådd? Gratisplanen tillater 100 forespørsler i døgnet – følg færre lag, eller oppgrader hos API-Football.')
    }
  },
  {
    key: 'fixtures',
    name: tr('Kampprogram'),
    tagline: tr('Neste kamper for lagene deres, rett fra fotball.no og handball.no.'),
    description:
      tr('Lim inn kalenderlenken til lagene deres fra fotball.no eller handball.no, så viser skjermen de neste kampene med motstander, tid, bane og turnering – og om laget spiller hjemme eller borte. Gratis og uten nøkkel, for alle lag fra A-laget til G10.'),
    category: 'sport',
    icon: 'calendar',
    color: '#0e7490',
    element: 'app',
    views: ['Neste kamper for alle lagene', 'Stor visning av neste (hjemme)kamp', 'Hjemme og borte markert'],
    guide: {
      title: tr('Slik finner du kalenderlenken'),
      intro: tr('Hvert lag på fotball.no og handball.no har en kalender du kan abonnere på. Det er den lenken Flatr bruker – den oppdateres når kampoppsettet endres.'),
      steps: [
        { title: tr('Finn laget'), body: tr('Søk opp laget på fotball.no (eller handball.no) og åpne lagets side.'), link: { href: 'https://www.fotball.no/', label: tr('Åpne fotball.no') } },
        { title: tr('Åpne kampene'), body: tr('Velg «Kamper» øverst på lagets side.') },
        { title: tr('Kopier kalenderlenken'), body: tr('Trykk «Abonner på kalender» og kopier lenken. Den ser slik ut: https://www.fotball.no/footballapi/Calendar/GetCalendar?teamId=…') },
        { title: tr('Lim den inn i Flatr'), body: tr('Aktiver Kampprogram, gå til Oppsett og lim inn lenken. Legg til så mange lag du vil (opptil ti).') },
        { title: tr('Vis det på skjermene'), body: tr('Åpne en presentasjon og velg Widgeter → Kampprogram. Velg liste over neste kamper, eller stor visning av neste kamp.') }
      ],
      troubleshooting: tr('Står det at lenken ikke er en kalender? Bruk lenken fra «Abonner på kalender», ikke adressen til lagets nettside.')
    }
  },
  {
    key: 'entur',
    name: tr('Avganger'),
    tagline: tr('Buss, trikk, T-bane, tog og båt fra holdeplassene i nærheten – i sanntid fra Entur.'),
    description:
      tr('Velg holdeplassene i nærheten, så viser skjermen de neste avgangene med linjenummer i linjens farge, retning, plattform og hvor mange minutter det er igjen. Tidene kommer i sanntid fra Entur og teller ned mens skjermen står. Legg inn hvor lang tid det tar å gå til holdeplassen, så vises bare avgangene folk rekker.\n\nGratis og uten nøkkel. Dekker all kollektivtrafikk i Norge.'),
    category: 'transport',
    icon: 'bus',
    color: '#4338ca',
    element: 'app',
    views: [tr('Avgangstavle i sanntid'), tr('Bare buss, trikk, T-bane, tog eller båt'), tr('Bare avganger folk rekker (gangtid)')],
    guide: {
      title: tr('Slik setter du opp Avganger'),
      intro: tr('Avgangene kommer fra Entur, som samler rutetider og sanntid for all kollektivtrafikk i Norge. Det er gratis og krever ingen nøkkel.'),
      steps: [
        { title: tr('Søk opp holdeplassene'), body: tr('Aktiver Avganger, gå til Oppsett og skriv navnet på holdeplassen, stasjonen eller kaia. Velg den i lista. Du kan legge til opptil seks.') },
        { title: tr('Vis det på skjermene'), body: tr('Åpne en presentasjon og velg Widgeter → Avganger. Velg holdeplass, hvilke transportmidler som skal vises og hvor mange minutter det tar å gå dit.') }
      ],
      troubleshooting: tr('Vises ingen avganger? Sjekk at det går noe fra holdeplassen den neste tiden, og at transportmiddelet ikke er valgt bort i elementet.')
    }
  },
  {
    key: 'poll',
    name: tr('Avstemning'),
    tagline: tr('Publikum stemmer eller stiller spørsmål fra mobilen – svarene vises live på skjermen.'),
    description:
      tr('Lag en avstemning eller åpne for spørsmål fra salen. Skjermen viser spørsmålet med en QR-kode; folk skanner den og svarer fra mobilen, uten app og uten innlogging. Resultatene oppdateres på skjermen mens folk stemmer.\n\nPasser for allmøter, konferanser, kurs og klubbkvelder. Spørsmål fra salen kan godkjennes før de vises, og de som får flest hjerter, kommer øverst.'),
    category: 'people',
    icon: 'chart',
    color: '#7c3aed',
    element: 'app',
    views: [tr('Spørsmål med QR-kode og live søyler'), tr('Spørsmål fra salen, med flest hjerter øverst'), tr('Bare QR-koden')],
    guide: {
      title: tr('Slik kjører du en avstemning'),
      intro: tr('Avstemningen lages i Flatr og vises på skjermene som et element på et lysbilde. Publikum trenger bare mobilkameraet.'),
      steps: [
        { title: tr('Lag avstemningen'), body: tr('Aktiver Avstemning, gå til Oppsett og skriv spørsmålet og svaralternativene – eller velg «Spørsmål fra salen».') },
        { title: tr('Vis den på skjermen'), body: tr('Åpne en presentasjon, velg Widgeter → Avstemning, og velg avstemningen. Skjermen viser QR-koden og resultatene.') },
        { title: tr('Styr den underveis'), body: tr('Under Oppsett kan du lukke avstemningen, skjule resultatene til den er ferdig, nullstille den og godkjenne spørsmål før de vises.') }
      ],
      troubleshooting: tr('Hver mobil kan stemme én gang per avstemning, men kan endre stemmen så lenge den er åpen.')
    }
  },
  {
    key: 'sheet',
    name: tr('Regneark'),
    tagline: tr('Tall og lister fra Google Sheets eller Excel – oppdatert av seg selv.'),
    description:
      tr('Lim inn lenken til et regneark, så kan skjermen vise det som en tabell, som ett stort nøkkeltall eller som en liste. Flatr henter det på nytt hvert femte minutt, så vaktlister, priser, salgstall og lagerbeholdning holder seg oppdatert uten at noen må taste dem inn i Flatr.\n\nVirker med Google Sheets, Excel-filer på OneDrive og CSV-lenker.'),
    category: 'data',
    icon: 'table',
    color: '#15803d',
    element: 'app',
    views: [tr('Tabell med valgte kolonner'), tr('Ett stort nøkkeltall fra en celle'), tr('Liste fra en kolonne')],
    guide: {
      title: tr('Slik kobler du til et regneark'),
      intro: tr('Flatr leser regnearket fra en lenke. Lenken må gi tilgang uten innlogging – alle som har den, kan se innholdet.'),
      steps: [
        {
          title: tr('Google Sheets'),
          body: tr('Trykk «Del», velg «Alle med linken» under Generell tilgang, og kopier linken. Vil du vise en bestemt fane, åpner du den fanen før du kopierer.')
        },
        {
          title: tr('Excel på OneDrive'),
          body: tr('Åpne arbeidsboka i Excel på nett, velg Fil → Del → Bygg inn, og kopier adressen i koden (den som begynner med https://onedrive.live.com/embed). Flatr viser det første arket.')
        },
        { title: tr('Lim den inn i Flatr'), body: tr('Aktiver Regneark, gå til Oppsett og lim inn lenken. Gi regnearket et navn, så det er lett å finne igjen.') },
        { title: tr('Vis det på skjermene'), body: tr('Åpne en presentasjon og velg Widgeter → Regneark. Velg tabell, nøkkeltall eller liste.') }
      ],
      troubleshooting: tr('Står det at lenken går til en nettside? Da er regnearket ikke delt med «alle med linken», eller lenken er feil type. Endringer i regnearket kommer på skjermene innen fem minutter.')
    }
  },
  {
    key: 'unsplash',
    name: tr('Unsplash bildebank'),
    tagline: tr('Søk blant millioner av gratis bilder rett fra editoren – og la Claude AI finne bilder til presentasjonene.'),
    description:
      tr('Når appen er aktivert, får bildevelgeren en fane for Unsplash: søk, klikk, og bildet hentes inn i mediebiblioteket (mappen Unsplash) med fotografens navn. Claude AI kan også søke opp og bruke bilder når den lager presentasjoner.\n\nBildene er gratis å bruke etter Unsplash-lisensen. Hver konto bruker sin egen gratis Access Key.'),
    category: 'other',
    icon: 'image',
    color: '#111111',
    element: 'images',
    views: [tr('Millioner av gratis bilder'), tr('Søk rett fra editoren'), tr('Claude AI kan finne bilder selv')],
    requires: 'Unsplash Access Key (gratis)',
    guide: {
      title: tr('Slik får du en Unsplash-nøkkel'),
      intro: tr('Det tar et par minutter og er gratis.'),
      steps: [
        { title: tr('Lag en utviklerkonto'), body: tr('Registrer deg eller logg inn som utvikler hos Unsplash.'), link: { href: 'https://unsplash.com/oauth/applications', label: tr('Åpne unsplash.com/oauth/applications') } },
        { title: tr('Lag en ny applikasjon'), body: tr('Trykk «New Application», godta vilkårene og gi den et navn, f.eks. «Flatr – firmanavn».') },
        { title: tr('Kopier Access Key'), body: tr('Under «Keys» finner du Access Key. Kopier den (ikke Secret Key).') },
        { title: tr('Lim den inn i Flatr'), body: tr('Aktiver Unsplash bildebank, gå til Oppsett og lim inn nøkkelen. Flatr sjekker at den virker.') }
      ],
      troubleshooting: tr('Demo-nøkler hos Unsplash har en grense på 50 søk i timen. Søker dere mye, kan dere søke om produksjonstilgang hos Unsplash (gratis).')
    }
  },
  {
    key: 'weather',
    name: tr('Yr'),
    tagline: tr('Været nå, de neste timene eller de neste dagene.'),
    description: tr('Værmelding fra MET Norway (yr.no) for et sted du velger. Ingen nøkkel trengs.'),
    category: 'weather',
    icon: 'sun',
    color: '#f59e0b',
    element: 'weather',
    views: [tr('Været nå'), tr('Time for time'), tr('De neste dagene')]
  },
  {
    key: 'rss',
    name: tr('Nyheter (RSS)'),
    tagline: tr('Nyhetssaker fra NRK, VG, E24 eller hvilken som helst RSS-kilde.'),
    description: tr('Vis siste saker som rullende linje, én sak av gangen eller som liste. Velg en kjent kilde eller lim inn din egen RSS-adresse.'),
    category: 'news',
    icon: 'megaphone',
    color: '#e5484d',
    element: 'rss',
    views: ['Rullende nyhetslinje', 'Én sak av gangen med bilde', 'Liste med overskrifter']
  },
  {
    key: 'calendar',
    name: tr('Kalender'),
    tagline: tr('Kommende hendelser fra Google, Outlook eller en annen iCal-kalender.'),
    description: tr('Lim inn den hemmelige iCal-adressen (.ics) til en kalender, så viser Flatr de neste hendelsene.'),
    category: 'productivity',
    icon: 'calendar',
    color: '#46a758',
    element: 'calendar',
    views: ['Google, Outlook eller iCal', 'Kommende hendelser per dag', 'Oppdateres av seg selv']
  }
];
export const OFFICIAL_BY_KEY = Object.fromEntries(OFFICIAL_APPS.map((a) => [a.key, a]));

/* --------------------------- egne apper (manifest) --------------------------- */

export const TEMPLATES = [
  { id: 'value', label: tr('Stort tall'), hint: tr('Ett tall eller én verdi, f.eks. temperatur eller antall.') },
  { id: 'list', label: tr('Liste'), hint: tr('Linjer med tittel og verdi.') },
  { id: 'cards', label: tr('Kort'), hint: tr('Kort med tittel, undertekst, verdi og bilde.') },
  { id: 'table', label: tr('Tabell'), hint: tr('Kolonner du velger selv.') },
  { id: 'map', label: tr('Kart'), hint: tr('Punkter på kart (trenger breddegrad og lengdegrad).') }
];
export const TEMPLATE_IDS = TEMPLATES.map((t) => t.id);
export const SETTING_TYPES = ['text', 'secret', 'number'];

/** Henter en verdi fra et objekt med punktum-sti: "data.items.0.name". Tom sti = objektet selv. */
export function getPath(obj, path) {
  if (!path) return obj;
  let cur = obj;
  for (const part of String(path).split('.')) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}

/** Alle stier til enkeltverdier i et objekt (for feltvelgeren i appbyggeren). */
export function leafPaths(obj, prefix = '', out = [], depth = 0) {
  if (out.length > 200 || depth > 6) return out;
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) leafPaths(v, prefix ? `${prefix}.${k}` : k, out, depth + 1);
  } else if (Array.isArray(obj)) {
    if (obj.length && typeof obj[0] !== 'object') out.push(prefix);
    else if (obj.length) leafPaths(obj[0], prefix ? `${prefix}.0` : '0', out, depth + 1);
  } else if (prefix) {
    out.push(prefix);
  }
  return out;
}

/** Stier til lister i et objekt (forslag til «hvor ligger listen?»). */
export function arrayPaths(obj, prefix = '', out = [], depth = 0) {
  if (out.length > 50 || depth > 5) return out;
  if (Array.isArray(obj)) {
    out.push(prefix);
    return out;
  }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) arrayPaths(v, prefix ? `${prefix}.${k}` : k, out, depth + 1);
  }
  return out;
}

const KEY_RE = /^[a-z][a-z0-9_]{0,30}$/;
const s = (v, max) => String(v ?? '').trim().slice(0, max);
const COLOR_RE = /^#[0-9a-f]{6}$/i;

/**
 * Renser et app-manifest fra appbyggeren. Kaster med norsk melding hvis noe
 * vesentlig mangler. Brukes både når appen lagres og når den testes.
 */
export function cleanManifest(m) {
  const name = s(m?.name, 60);
  if (!name) throw new Error(tr('Gi appen et navn.'));

  const settings = [];
  const keys = new Set();
  for (const f of Array.isArray(m?.settings) ? m.settings : []) {
    const key = s(f?.key, 31).toLowerCase();
    if (!KEY_RE.test(key) || keys.has(key)) continue;
    keys.add(key);
    settings.push({
      key,
      label: s(f?.label, 60) || key,
      type: SETTING_TYPES.includes(f?.type) ? f.type : 'text',
      required: f?.required !== false,
      hint: s(f?.hint, 200)
    });
    if (settings.length >= 10) break;
  }

  const url = s(m?.source?.url, 1000);
  if (!/^https:\/\//i.test(url)) throw new Error(tr('API-adressen må starte med https://'));
  const headers = [];
  for (const h of Array.isArray(m?.source?.headers) ? m.source.headers : []) {
    const hn = s(h?.name, 60);
    if (!/^[A-Za-z0-9-]+$/.test(hn) || /^(host|cookie|content-length|connection)$/i.test(hn)) continue;
    headers.push({ name: hn, value: s(h?.value, 1000) });
    if (headers.length >= 5) break;
  }

  const d = m?.display || {};
  const f = d.fields || {};
  const path = (v) => s(v, 200).replace(/[^\w.\-$]/g, '');
  return {
    name,
    tagline: s(m?.tagline, 140),
    description: s(m?.description, 3000),
    category: CATEGORY_LABEL[m?.category] ? m.category : 'data',
    icon: APP_ICONS.includes(m?.icon) ? m.icon : 'sparkle',
    color: COLOR_RE.test(m?.color) ? m.color : '#5b5bd6',
    settings,
    source: {
      url,
      headers,
      itemsPath: path(m?.source?.itemsPath),
      refreshMinutes: Math.min(1440, Math.max(1, Math.round(Number(m?.source?.refreshMinutes) || 5)))
    },
    display: {
      template: TEMPLATE_IDS.includes(d.template) ? d.template : 'list',
      heading: s(d.heading, 80),
      max: Math.min(50, Math.max(1, Math.round(Number(d.max) || 10))),
      fields: {
        title: path(f.title),
        subtitle: path(f.subtitle),
        value: path(f.value),
        unit: s(f.unit, 12),
        image: path(f.image),
        lat: path(f.lat),
        lon: path(f.lon)
      },
      columns: (Array.isArray(d.columns) ? d.columns : [])
        .map((c) => ({ label: s(c?.label, 40), path: path(c?.path) }))
        .filter((c) => c.path)
        .slice(0, 6)
    }
  };
}

/** Bytter {{nøkkel}} med innstillinger. `encode` brukes for adressen. */
export function fillPlaceholders(text, values, encode = false) {
  return String(text).replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g, (_, k) => {
    const v = values?.[k] ?? '';
    return encode ? encodeURIComponent(v) : String(v);
  });
}

/** Plukker ut feltene visningen trenger (resten av API-svaret sendes aldri til skjermene). */
export function extractItems(body, manifest) {
  const { source, display } = manifest;
  let list = getPath(body, source.itemsPath);
  if (!Array.isArray(list)) list = list == null ? [] : [list];
  const f = display.fields;
  const val = (it, p) => {
    if (!p) return null;
    const v = getPath(it, p);
    if (v == null) return null;
    if (typeof v === 'object') return JSON.stringify(v).slice(0, 200);
    return typeof v === 'number' || typeof v === 'boolean' ? v : String(v).slice(0, 500);
  };
  const num = (v) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
  return list.slice(0, display.max).map((it) => ({
    title: val(it, f.title),
    subtitle: val(it, f.subtitle),
    value: val(it, f.value),
    // Bare http(s)-bilder; alt annet ignoreres.
    image: /^https?:\/\//i.test(val(it, f.image) || '') ? val(it, f.image) : null,
    lat: num(val(it, f.lat)),
    lon: num(val(it, f.lon)),
    cols: display.columns.map((c) => val(it, c.path))
  }));
}
