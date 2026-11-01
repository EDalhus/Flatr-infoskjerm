// Språk på serveren (se src/lib/i18n.js): feilmeldinger og e-post på engelsk for
// dem som har valgt det. Ordboken er den samme som i nettleseren
// (src/locales/en.json, med den norske teksten som nøkkel).
//
//  - Hver forespørsel kjøres med språket til den som spør (cookien flatr_lang,
//    ellers nettleserens språk når engelsk er slått på), så tr() og locale() i
//    koden gir riktig språk uten at språket må sendes rundt. Skjermene er alltid
//    norske (SCREEN_API i index.js).
//  - Feilmeldingene står på norsk i koden. index.js oversetter «error»/«message»
//    i JSON-svar med feilstatus på vei ut (translateMessage), så hvert endepunkt
//    slipper. Meldinger med innflettede verdier («Dokumentet har 12 sider – maks
//    10.») finnes ved å matche mot nøklene med {0}, {1} …, og verdiene oversettes
//    også hvis de selv står i ordboken.
//  - E-post og Slack/Teams lages med withLang(mottakerens språk, () => …).

import fs from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { LANGS, pickLang, fillVars, setLangSource } from '../src/lib/i18n.js';

const DICTS = { en: JSON.parse(fs.readFileSync(new URL('../src/locales/en.json', import.meta.url), 'utf8')) };
const CONTEXTS = Object.fromEntries(LANGS.map((l) => [l.id, { lang: l.id, dict: DICTS[l.id] || null }]));
const NB = CONTEXTS.nb;

const als = new AsyncLocalStorage();
setLangSource(() => als.getStore() || NB);

const known = (lang) => (CONTEXTS[lang] ? lang : 'nb');

/** Kjører fn med språket satt (tr() og locale() følger det, også etter await). */
export const withLang = (lang, fn) => als.run(CONTEXTS[known(lang)], fn);
/** Språket for forespørselen (eller e-posten) som behandles nå. */
export const currentLang = () => (als.getStore() || NB).lang;

/** Språket en forespørsel ber om: cookien flatr_lang, ellers Accept-Language. */
export function requestLang(request) {
  const cookie = request.headers.get('cookie')?.match(/(?:^|;\s*)flatr_lang=(\w+)/)?.[1];
  const wanted = String(request.headers.get('accept-language') || '')
    .split(',')
    .map((s) => s.split(';')[0].trim())
    .filter(Boolean);
  return pickLang(cookie, wanted);
}

/** Språket i users.prefs (JSON), eller null. */
export function langOf(prefs) {
  try {
    const lang = (typeof prefs === 'string' ? JSON.parse(prefs || '{}') : prefs || {}).lang;
    return CONTEXTS[lang] ? lang : null;
  } catch {
    return null;
  }
}

/* --------------------------- ferdige meldinger ---------------------------- */

const patternCache = {};
/** Nøklene med {0}, {1} … som regulære uttrykk, de mest spesifikke først. */
function patterns(lang) {
  if (patternCache[lang]) return patternCache[lang];
  const list = [];
  for (const [key, value] of Object.entries(DICTS[lang] || {})) {
    if (!/\{\d+\}/.test(key)) continue;
    const literal = key.replace(/\{\d+\}/g, '');
    // «{0} {1}» og lignende ville passet på alt.
    if (literal.replace(/[\s\p{P}]/gu, '').length < 6) continue;
    const order = [];
    const source = key
      .split(/(\{\d+\})/)
      .map((part) => {
        const m = part.match(/^\{(\d+)\}$/);
        if (!m) return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        order.push(Number(m[1]));
        return '([\\s\\S]+?)';
      })
      .join('');
    list.push({ re: new RegExp(`^${source}$`), order, value, size: literal.length });
  }
  list.sort((a, b) => b.size - a.size);
  return (patternCache[lang] = list);
}

// Ser meldingen norsk ut? (Da mangler den i ordboken – logges én gang.)
const NORWEGIAN = /[æøåÆØÅ]|\b(ikke|og|er|må|kan|på|med|finnes|mangler|eller|skjerm\w*)\b/i;
const reported = new Set();

/** Oversetter en ferdig norsk melding (med innflettede verdier) til lang. */
export function translateMessage(lang, msg, depth = 0) {
  const dict = DICTS[lang];
  if (!dict || typeof msg !== 'string' || !msg.trim()) return msg;
  const trimmed = msg.trim();
  const exact = dict[trimmed];
  if (exact != null) return msg.replace(trimmed, () => exact);
  if (depth < 2) {
    for (const p of patterns(lang)) {
      const m = trimmed.match(p.re);
      if (!m) continue;
      const vars = {};
      p.order.forEach((n, i) => (vars[n] = translateMessage(lang, m[i + 1], depth + 1)));
      return msg.replace(trimmed, () => fillVars(p.value, vars));
    }
  }
  if (depth === 0 && NORWEGIAN.test(trimmed) && reported.size < 500 && !reported.has(trimmed)) {
    reported.add(trimmed);
    console.warn(`[i18n] mangler oversettelse (${lang}): ${trimmed.slice(0, 200)}`);
  }
  return msg;
}
