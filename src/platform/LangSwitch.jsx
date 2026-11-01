// Språkvalg på flatr.no (fot og innlogging). Se src/lib/i18n.js.
import { getLang, setLang, LANGS, LANG_PUBLIC } from '../lib/i18n.js';

/** Språkvalg (Norsk · English). Valget gjelder hele flatr.no og laster siden på nytt. */
export default function LangSwitch({ className = '' }) {
  if (!LANG_PUBLIC && !document.cookie.includes('flatr_lang=')) return null;
  const current = getLang();
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {LANGS.map((l) => (
        <button
          key={l.id}
          type="button"
          lang={l.id === 'nb' ? 'no' : l.id}
          onClick={() => l.id !== current && setLang(l.id, window.location.host)}
          aria-current={l.id === current ? 'true' : undefined}
          className={l.id === current ? 'font-semibold text-ink' : 'text-muted hover:text-ink'}
        >
          {l.label}
        </button>
      ))}
    </span>
  );
}
