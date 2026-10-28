import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api.js';

// Admin har ett tema: «Presis» (mørkt, ikon-sidemeny) – variabelsettet i
// src/index.css. «Varm» (lyst) er fjernet; gamle lagrede valg ignoreres.
export const THEMES = [{ id: 'presis', label: 'Presis' }];
export const DEFAULT_THEME = 'presis';

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
