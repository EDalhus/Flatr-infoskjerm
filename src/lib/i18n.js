// Språk i Flatr. Tekstene står på norsk i koden, og tr('Lagre') gir
// oversettelsen fra src/locales/<språk>.json (nøkkelen er den norske teksten).
// Mangler en oversettelse, vises norsken. Variabler: tr('{0} skjermer', [n]).
// (Funksjonen heter tr fordi mange filer bruker t som variabelnavn.)
//
// Språket velges i denne rekkefølgen: valget brukeren har gjort (lagres i en
// cookie for hele flatr.no, så det følger med mellom kundeadressene), ellers
// nettleserens språk. Bytte av språk laster siden på nytt.
//
// Samme tr() brukes på serveren (feilmeldinger og e-post). Der settes språket
// per forespørsel eller mottaker av server/i18n.js (setLangSource).

export const LANGS = [
  { id: 'nb', label: 'Norsk', locale: 'nb-NO' },
  { id: 'en', label: 'English', locale: 'en-GB' }
];
const IDS = LANGS.map((l) => l.id);
const LOADERS = { en: () => import('../locales/en.json') };
// Engelsk slås på for alle (nettleserens språk og språkvelgeren) når hele admin
// er oversatt. Til da gjelder bare et valg som er satt med cookien flatr_lang.
export const LANG_PUBLIC = false;

let lang = 'nb';
let dict = null;
// På serveren: () => ({ lang, dict }) for forespørselen eller e-posten som lages nå.
let source = null;
export function setLangSource(fn) {
  source = fn;
}

function fromCookie() {
  try {
    return document.cookie.match(/(?:^|;\s*)flatr_lang=(\w+)/)?.[1] || null;
  } catch {
    return null;
  }
}

/**
 * Språket for et valg (cookie eller ?lang=) og språkene nettleseren ber om
 * (navigator.languages eller Accept-Language): norsk (og svensk/dansk foreløpig)
 * eller engelsk. Brukes likt i nettleseren og på serveren.
 */
export function pickLang(chosen, wanted = []) {
  if (IDS.includes(chosen)) return chosen;
  if (!LANG_PUBLIC) return 'nb';
  for (const w of wanted) {
    const code = String(w || '').toLowerCase().slice(0, 2);
    if (['nb', 'nn', 'no', 'sv', 'da'].includes(code)) return 'nb';
    if (code) return 'en';
  }
  return 'nb';
}

/** Velger språk og henter oversettelsene. Kalles én gang før appen tegnes. */
export async function initLang() {
  // ?lang=en i adressen velger språk (f.eks. for å prøve før det er slått på for alle).
  let chosen = fromCookie();
  try {
    const asked = new URLSearchParams(window.location.search).get('lang');
    if (IDS.includes(asked)) {
      document.cookie = `flatr_lang=${asked}; path=/; max-age=31536000; samesite=lax`;
      chosen = asked;
    }
  } catch {
    /* uten window (server) */
  }
  const wanted = typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : [];
  lang = pickLang(chosen, wanted);
  chosenHere = IDS.includes(chosen);
  if (LOADERS[lang]) {
    try {
      dict = (await LOADERS[lang]()).default;
    } catch {
      lang = 'nb';
      dict = null;
    }
  }
  if (typeof document !== 'undefined') document.documentElement.lang = lang === 'nb' ? 'no' : lang;
  return lang;
}

let chosenHere = false;
export const getLang = () => (source ? source().lang : lang);
/** Er språket valgt i denne nettleseren (cookie eller ?lang=), ikke bare gjettet? */
export const langChosen = () => chosenHere;
/** Locale til datoer og tall (toLocaleString). */
export const localeOf = (id) => LANGS.find((l) => l.id === id)?.locale || 'nb-NO';
export const locale = () => localeOf(getLang());

/**
 * Lagrer valget for hele flatr.no (alle kundeadressene) og laster siden på nytt.
 * `baseDomain` = hoveddomenet (f.eks. flatr.no), fra /api/context.
 */
export function setLang(next, baseDomain) {
  if (!IDS.includes(next)) return;
  const host = String(baseDomain || '').split(':')[0];
  const domain = host && host.includes('.') && window.location.hostname.endsWith(host) ? `; domain=.${host}` : '';
  document.cookie = `flatr_lang=${next}; path=/; max-age=31536000; samesite=lax${domain}`;
  window.location.reload();
}

/** Oversetter en norsk tekst. vars: liste ({0}, {1} …) eller objekt ({navn}). */
export function tr(text, vars) {
  const d = source ? source().dict : dict;
  return fillVars((d && d[text]) || text, vars);
}

/** Fyller inn {0}, {1} … (liste) eller {navn} (objekt). */
export function fillVars(s, vars) {
  return vars == null ? s : s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
}
