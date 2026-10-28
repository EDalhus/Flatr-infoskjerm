import { useCallback, useEffect, useState } from 'react';

// Tilstand som bor i adressen (?navn=verdi), så nettleserens Tilbake/Frem
// navigerer i adminpanelet. Endringer legges i historikken (pushState) – eller
// erstatter siste steg med { replace: true } – og popstate leses inn igjen.

const read = (name) => (typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get(name) || '');

/** Endre én eller flere parametere (null/'' fjerner). */
export function setUrlParams(patch, { replace = false } = {}) {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === '') url.searchParams.delete(k);
    else url.searchParams.set(k, String(v));
  }
  if (url.href === window.location.href) return;
  if (replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
}

/** [verdi, sett] for én parameter. Følger Tilbake/Frem. */
export function useUrlParam(name, { replace = false } = {}) {
  const [value, setValue] = useState(() => read(name));

  useEffect(() => {
    const onPop = () => setValue(read(name));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [name]);

  const set = useCallback(
    (v, opts = {}) => {
      setUrlParams({ [name]: v || null }, { replace: opts.replace ?? replace });
      setValue(v ? String(v) : '');
    },
    [name, replace]
  );

  return [value, set];
}
