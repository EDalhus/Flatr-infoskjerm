import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api.js';

// Temaene tilsvarer variabelsettene i src/index.css. Temaet styrer også
// navigasjonen i admin (Varm: toppmeny, Presis: ikon-sidemeny).
// `c` = [bakgrunn, flate, aksent] for miniatyren.
export const THEMES = [
  { id: 'varm', label: 'Varm', hint: 'Lyst og vennlig', c: ['#f6f3ee', '#ffffff', '#027353'] },
  { id: 'presis', label: 'Presis', hint: 'Mørkt og kompakt', c: ['#0a0b0b', '#0f1110', '#4ade9f'] }
];
export const DEFAULT_THEME = 'varm';

const KEY = 'flatr.theme';
const valid = (id) => THEMES.some((t) => t.id === id);

const readLocal = () => {
  try {
    const t = localStorage.getItem(KEY);
    return valid(t) ? t : null;
  } catch {
    return null;
  }
};

export function applyTheme(id) {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* privat modus e.l. – temaet holder bare for økten */
  }
}

/**
 * Aktivt tema. Brukerens lagrede valg (fra /api/me) vinner over det som ligger
 * i nettleseren, så temaet følger brukeren mellom enheter.
 */
export function useTheme(me) {
  const [theme, setThemeState] = useState(() => readLocal() || DEFAULT_THEME);

  useEffect(() => {
    const saved = me?.prefs?.theme;
    if (valid(saved)) setThemeState(saved);
  }, [me?.prefs?.theme]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback(
    (id) => {
      if (!valid(id)) return;
      setThemeState(id);
      if (me?.prefs) api.prefs({ theme: id }).catch(() => {});
    },
    [me?.prefs]
  );

  return [theme, setTheme];
}

/** To klikkbare miniatyrer – brukes i brukermenyen. */
export default function ThemePicker({ theme, onChange }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold text-muted">Utseende</div>
      <div className="grid grid-cols-2 gap-2">
        {THEMES.map((t) => {
          const active = t.id === theme;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              aria-pressed={active}
              className={`flex flex-col gap-2 rounded-xl border p-2 text-left transition-colors ${
                active ? 'border-brand ring-2 ring-brand/30' : 'border-line hover:border-muted'
              }`}
            >
              <span
                className="flex h-12 gap-1 overflow-hidden rounded-lg p-1.5"
                style={{ background: t.c[0] }}
                aria-hidden="true"
              >
                <span className="w-3 rounded-sm" style={{ background: t.c[1] }} />
                <span className="flex flex-1 flex-col gap-1 rounded-sm p-1" style={{ background: t.c[1] }}>
                  <span className="h-1.5 w-2/3 rounded-sm" style={{ background: t.c[2] }} />
                  <span className="h-1.5 w-1/2 rounded-sm opacity-30" style={{ background: t.c[2] }} />
                </span>
              </span>
              <span className="px-0.5">
                <span className="block text-sm font-semibold text-ink">{t.label}</span>
                <span className="block text-xs text-muted">{t.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
