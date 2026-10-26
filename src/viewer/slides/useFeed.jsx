import { useEffect, useState } from 'react';

/**
 * Henter /api/feeds?element=<id> og oppdaterer jevnlig. `configKey` endres
 * når elementets innstillinger endres i editoren, så data hentes på nytt
 * (litt forsinket – innstillingene lagres med debounce).
 */
export function useFeed(elementId, configKey, intervalMs = 5 * 60_000) {
  const [state, setState] = useState({ data: null, error: null, loading: true });

  useEffect(() => {
    if (!elementId) {
      setState({ data: null, error: 'Lagre elementet først', loading: false });
      return undefined;
    }
    let alive = true;
    const load = () =>
      fetch(`/api/feeds?element=${encodeURIComponent(elementId)}`, { headers: { Accept: 'application/json' } })
        .then(async (r) => {
          const body = await r.json().catch(() => null);
          if (!alive) return;
          if (!r.ok) setState((s) => ({ data: s.data, error: body?.error || 'Kunne ikke hente data', loading: false }));
          else setState({ data: body, error: null, loading: false });
        })
        .catch(() => alive && setState((s) => ({ ...s, error: 'Ingen forbindelse', loading: false })));
    const first = setTimeout(load, 900);
    const timer = setInterval(load, intervalMs);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [elementId, configKey, intervalMs]);

  return state;
}

/** Felles plassholder når en widget mangler data. */
export function FeedMessage({ children }) {
  return (
    <div className="grid h-full w-full place-items-center p-[6%] text-center opacity-70" style={{ fontSize: '8cqmin' }}>
      {children}
    </div>
  );
}
