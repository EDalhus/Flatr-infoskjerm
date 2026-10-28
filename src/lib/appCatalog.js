// Flatr Apps – katalogen. Offisielle apper er bygd inn i Flatr; egne apper
// lages i appbyggeren (uten kode) og ligger i platform.db (server/appMarket.js).
// Felles for server og nettleser.

export const CATEGORIES = [
  { id: 'transport', label: 'Transport og logistikk' },
  { id: 'weather', label: 'Vær' },
  { id: 'news', label: 'Nyheter' },
  { id: 'productivity', label: 'Kalender og planlegging' },
  { id: 'people', label: 'Ansatte og arbeidsplass' },
  { id: 'data', label: 'Data og API' },
  { id: 'ai', label: 'AI-assistenter' },
  { id: 'food', label: 'Kantine og mat' },
  { id: 'sport', label: 'Sport' },
  { id: 'other', label: 'Annet' }
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
    name: 'NAIS (Norsk AIS-tjeneste)',
    tagline: 'Følg flåten live på kart, som båtkort eller som ankomsttavle.',
    description:
      'Henter posisjon, fart, kurs og destinasjon for båtene dine fra Kystverkets AIS via BarentsWatch, oppdatert hvert minutt. Legg inn båtene med MMSI-nummer og kaiene dere bruker, så regner Flatr ut estimert ankomst.\n\nMed tillegget Anløp registrerer dere kjente båtanløp: kai, forventet ankomst og avgang, neste havn og hvilke varer som leveres eller hentes. Anløpsplanen vises på skjermene, med live status fra AIS for båtene i flåten.\n\nKrever en gratis API-klient av typen AIS fra BarentsWatch – hver konto bruker sin egen.',
    category: 'transport',
    icon: 'pin',
    color: '#0b6bcb',
    element: 'app',
    views: ['Kart over flåten', 'Båtkort med status og ETA', 'Ankomsttavle for en kai', 'Anløpsplan med varer (tillegget Anløp)'],
    requires: 'BarentsWatch API-klient (AIS)',
    // Steg-for-steg under «Om appen». link = { href, label } (valgfri).
    guide: {
      title: 'Slik kobler du til BarentsWatch',
      intro: 'AIS-dataene kommer fra Kystverket via BarentsWatch. Det er gratis, men hver konto trenger sin egen API-klient. Det tar et par minutter.',
      steps: [
        {
          title: 'Opprett en bruker hos BarentsWatch',
          body: 'Gå til BarentsWatch «Min side» og registrer deg gratis, eller logg inn hvis du har bruker fra før.',
          link: { href: 'https://www.barentswatch.no/minside/', label: 'Åpne barentswatch.no/minside' }
        },
        {
          title: 'Registrer en ny API-klient av typen AIS',
          body: 'På Min side finner du registrering av API-klienter. Lag en ny klient og velg klienttypen AIS – ikke den vanlige API-klienten. Velger du feil type, vil innloggingen fra Flatr bli avvist.'
        },
        {
          title: 'Gi klienten et navn og lag en hemmelighet',
          body: 'Kall klienten for eksempel «flatr», og lag en hemmelighet (client secret). Kopier hemmeligheten med en gang og ta vare på den – du får ikke se den igjen hos BarentsWatch.'
        },
        {
          title: 'Finn client id',
          body: 'Client id er e-postadressen du er registrert med, et kolon og navnet på klienten – for eksempel kari@firma.no:flatr. Skriv den nøyaktig, med store og små bokstaver.'
        },
        {
          title: 'Legg inn client id og secret i Flatr',
          body: 'Aktiver NAIS, gå til fanen Oppsett og fyll inn client id og client secret under BarentsWatch. Trykk Lagre. Når det står «Tilkoblet», henter Flatr data. Hemmeligheten lagres kryptert og vises aldri igjen.'
        },
        {
          title: 'Legg inn flåten og kaiene',
          body: 'Legg til båtene med navn og MMSI-nummer (9 siffer – står i skipets papirer, eller finnes ved å søke opp båten på et AIS-kart). Legg til kaiene dere bruker ved å klikke i kartet, så får du estimert ankomst.'
        },
        {
          title: 'Vis det på skjermene',
          body: 'Åpne en presentasjon i editoren, velg Widgeter → NAIS og velg kart, båtkort eller ankomsttavle.'
        }
      ],
      troubleshooting:
        'Står det at BarentsWatch ikke godtok client id/secret? Sjekk at klienten er av typen AIS, at client id er skrevet nøyaktig (med :klientnavn på slutten), og prøv å lage en ny hemmelighet. Står det «ikke funnet i AIS» ved en båt, er MMSI-nummeret feil eller båten har ikke sendt AIS det siste døgnet.'
    }
  },
  {
    key: 'birthdays',
    name: 'Bursdager',
    tagline: 'Vis de neste bursdagene på jobben – med navn, dato og hvor lenge det er igjen.',
    description:
      'Legg inn de ansatte med navn og fødselsdato (eller lim inn en liste fra Excel), så viser skjermene de neste bursdagene: hvem, hvilken dag, hvor mange dager det er igjen og hvor gamle de blir. Den som har bursdag i dag, blir fremhevet.\n\nFødselsdatoene vises aldri på skjermene – bare dag og måned. Alderen kan skjules for alle, eller for den enkelte.',
    category: 'people',
    icon: 'users',
    color: '#d6409f',
    element: 'app',
    views: ['De neste bursdagene (antall velger du)']
  },
  {
    key: 'claude',
    name: 'Claude AI',
    tagline: 'Lag og endre presentasjoner ved å skrive hva du vil ha.',
    description:
      'Trykk ⌘K (Ctrl+K på Windows) hvor som helst i Flatr og beskriv presentasjonen du vil ha – Claude bygger den i editoren mens du ser på. I editoren får du en AI-fane med hele samtalen, tankegangen og hvert steg Claude tar, og du kan be om endringer underveis.\n\nClaude kan bare lese og endre presentasjoner – ikke skjermer, brukere eller innstillinger – og alt kan angres. Appen bruker kontoens egen API-nøkkel fra Anthropic, og bruken faktureres der.',
    category: 'ai',
    icon: 'sparkle',
    color: '#d97757',
    element: 'assistant',
    views: ['⌘K: ny presentasjon fra en beskrivelse', 'AI-fane i editoren med historikk og tankegang', 'Endrer bare presentasjoner'],
    requires: 'API-nøkkel fra Anthropic (Claude)',
    guide: {
      title: 'Slik kobler du til Claude',
      intro: 'Claude AI bruker en API-nøkkel fra Anthropic. Den lages på et par minutter, og du betaler bare for det du bruker.',
      steps: [
        {
          title: 'Logg inn i Anthropic Console',
          body: 'Opprett en konto eller logg inn. Legg inn betalingskort eller kjøp kreditt under Billing – uten det virker ikke nøkkelen.',
          link: { href: 'https://console.anthropic.com/', label: 'Åpne console.anthropic.com' }
        },
        {
          title: 'Lag en API-nøkkel',
          body: 'Gå til API Keys og trykk «Create Key». Kall den for eksempel «Flatr», og kopier nøkkelen (den starter med sk-ant-). Du får ikke se den igjen.',
          link: { href: 'https://console.anthropic.com/settings/keys', label: 'Åpne API Keys' }
        },
        {
          title: 'Lim inn nøkkelen i Flatr',
          body: 'Aktiver Claude AI, gå til fanen Oppsett og lim inn nøkkelen. Flatr sjekker at den virker før den lagres kryptert.'
        },
        {
          title: 'Trykk ⌘K og beskriv hva du vil ha',
          body: 'For eksempel «Lag en velkomstpresentasjon for besøkende med klokke og vær». Velg en ny eller eksisterende presentasjon, så åpnes editoren og Claude setter i gang.'
        }
      ],
      troubleshooting:
        'Sier Flatr at nøkkelen ikke godtas? Sjekk at du kopierte hele nøkkelen, og at kontoen hos Anthropic har kreditt eller betalingskort. Står det «for mange forespørsler», er grensen for kontoen nådd – vent litt eller øk den i Console.'
    }
  },
  {
    key: 'menu',
    name: 'Dagens meny',
    tagline: 'Kantinemenyen på skjermene – dagens retter med pris og allergener.',
    description:
      'Legg inn ukemenyen dag for dag (eller lim inn hele menyen og la Claude AI sortere den), så viser skjermene dagens retter automatisk. Hver rett kan ha beskrivelse, pris og merking som vegetar, glutenfri eller allergener.\n\nVelg mellom «Dagens meny» og «Hele uka» på skjermen.',
    category: 'food',
    icon: 'calendar',
    color: '#f76b15',
    element: 'app',
    views: ['Dagens meny', 'Hele uka']
  },
  {
    key: 'tides',
    name: 'Tidevann og sjø',
    tagline: 'Høyvann og lavvann fra Kartverket, bølgehøyde og sjøtemperatur fra MET.',
    description:
      'Velg ett eller flere steder langs kysten, så viser skjermene neste høyvann og lavvann (Kartverket) og bølgehøyde, sjøtemperatur og strøm (MET Norway). Ingen nøkkel trengs. Data oppdateres hver halvtime.',
    category: 'weather',
    icon: 'sun',
    color: '#0e7490',
    element: 'app',
    views: ['Tidevann', 'Sjø (bølger og temperatur)', 'Begge']
  },
  {
    key: 'football',
    name: 'Fotball',
    tagline: 'Kamper, resultater og tabell for lagene dere holder med.',
    description:
      'Følg lag og ligaer fra hele verden: neste kamper, siste resultater og tabellen – live under kampene. Data fra API-Football; hver konto bruker sin egen nøkkel (gratisplanen holder for et par lag).',
    category: 'sport',
    icon: 'chart',
    color: '#15803d',
    element: 'app',
    views: ['Neste kamper', 'Siste resultater', 'Tabell'],
    requires: 'API-Football-nøkkel (gratis)',
    guide: {
      title: 'Slik får du en API-Football-nøkkel',
      intro: 'Gratisplanen gir 100 forespørsler i døgnet. Flatr henter data hver annen time (hvert tiende minutt under kamp), så det holder for to–tre lag og en tabell.',
      steps: [
        { title: 'Registrer deg hos API-Football', body: 'Lag en gratis konto på dashboardet til API-Sports.', link: { href: 'https://dashboard.api-football.com/register', label: 'Åpne dashboard.api-football.com' } },
        { title: 'Kopier nøkkelen', body: 'Under «Account» → «My Access» finner du API-nøkkelen. Kopier den.' },
        { title: 'Lim den inn i Flatr', body: 'Aktiver Fotball, gå til Oppsett og lim inn nøkkelen. Søk så opp lagene og ligaene dere vil følge.' },
        { title: 'Vis det på skjermene', body: 'Åpne en presentasjon og velg Widgeter → Fotball. Velg neste kamper, siste resultater eller tabell.' }
      ],
      troubleshooting: 'Står det at grensen er nådd? Gratisplanen tillater 100 forespørsler i døgnet – følg færre lag, eller oppgrader hos API-Football.'
    }
  },
  {
    key: 'unsplash',
    name: 'Unsplash bildebank',
    tagline: 'Søk blant millioner av gratis bilder rett fra editoren – og la Claude AI finne bilder til presentasjonene.',
    description:
      'Når appen er aktivert, får bildevelgeren en fane for Unsplash: søk, klikk, og bildet hentes inn i mediebiblioteket (mappen Unsplash) med fotografens navn. Claude AI kan også søke opp og bruke bilder når den lager presentasjoner.\n\nBildene er gratis å bruke etter Unsplash-lisensen. Hver konto bruker sin egen gratis Access Key.',
    category: 'other',
    icon: 'image',
    color: '#111111',
    element: 'images',
    views: ['Bildesøk i bildevelgeren', 'Bilder til Claude AI'],
    requires: 'Unsplash Access Key (gratis)',
    guide: {
      title: 'Slik får du en Unsplash-nøkkel',
      intro: 'Det tar et par minutter og er gratis.',
      steps: [
        { title: 'Lag en utviklerkonto', body: 'Registrer deg eller logg inn som utvikler hos Unsplash.', link: { href: 'https://unsplash.com/oauth/applications', label: 'Åpne unsplash.com/oauth/applications' } },
        { title: 'Lag en ny applikasjon', body: 'Trykk «New Application», godta vilkårene og gi den et navn, f.eks. «Flatr – firmanavn».' },
        { title: 'Kopier Access Key', body: 'Under «Keys» finner du Access Key. Kopier den (ikke Secret Key).' },
        { title: 'Lim den inn i Flatr', body: 'Aktiver Unsplash bildebank, gå til Oppsett og lim inn nøkkelen. Flatr sjekker at den virker.' }
      ],
      troubleshooting: 'Demo-nøkler hos Unsplash har en grense på 50 søk i timen. Søker dere mye, kan dere søke om produksjonstilgang hos Unsplash (gratis).'
    }
  },
  {
    key: 'weather',
    name: 'Vær (Yr)',
    tagline: 'Været nå, de neste timene eller de neste dagene.',
    description: 'Værmelding fra MET Norway (yr.no) for et sted du velger. Ingen nøkkel trengs.',
    category: 'weather',
    icon: 'sun',
    color: '#f59e0b',
    element: 'weather',
    views: ['Været nå', 'Neste timer', 'Neste dager']
  },
  {
    key: 'rss',
    name: 'Nyheter (RSS)',
    tagline: 'Nyhetssaker fra NRK, VG, E24 eller hvilken som helst RSS-kilde.',
    description: 'Vis siste saker som rullende linje, én sak av gangen eller som liste. Velg en kjent kilde eller lim inn din egen RSS-adresse.',
    category: 'news',
    icon: 'megaphone',
    color: '#e5484d',
    element: 'rss',
    views: ['Rullende linje', 'Én sak av gangen', 'Liste med overskrifter']
  },
  {
    key: 'calendar',
    name: 'Kalender',
    tagline: 'Kommende hendelser fra Google, Outlook eller en annen iCal-kalender.',
    description: 'Lim inn den hemmelige iCal-adressen (.ics) til en kalender, så viser Flatr de neste hendelsene.',
    category: 'productivity',
    icon: 'calendar',
    color: '#46a758',
    element: 'calendar',
    views: ['Liste over kommende hendelser']
  }
];
export const OFFICIAL_BY_KEY = Object.fromEntries(OFFICIAL_APPS.map((a) => [a.key, a]));

/* --------------------------- egne apper (manifest) --------------------------- */

export const TEMPLATES = [
  { id: 'value', label: 'Stort tall', hint: 'Ett tall eller én verdi, f.eks. temperatur eller antall.' },
  { id: 'list', label: 'Liste', hint: 'Linjer med tittel og verdi.' },
  { id: 'cards', label: 'Kort', hint: 'Kort med tittel, undertekst, verdi og bilde.' },
  { id: 'table', label: 'Tabell', hint: 'Kolonner du velger selv.' },
  { id: 'map', label: 'Kart', hint: 'Punkter på kart (trenger breddegrad og lengdegrad).' }
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
  if (!name) throw new Error('Gi appen et navn.');

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
  if (!/^https:\/\//i.test(url)) throw new Error('API-adressen må starte med https://');
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
