import { useEffect, useRef, useState } from 'react';

/**
 * Kobler til et SSE-endepunkt og kaller named-event-handlere.
 * Kobler til på nytt automatisk dersom strømmen lukkes/feiler.
 *
 * @param {string} url
 * @param {{ snapshot?: Function, update?: Function, error?: Function }} handlers
 */
export function useSSE(url, handlers) {
  const handlerRef = useRef(handlers);
  handlerRef.current = handlers;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!url) return undefined;

    let es = null;
    let retryTimer = null;
    let stopped = false;

    const parse = (raw) => {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    };

    const connect = () => {
      es = new EventSource(url);

      es.onopen = () => setConnected(true);

      es.addEventListener('snapshot', (e) => {
        const data = parse(e.data);
        if (data) handlerRef.current.snapshot?.(data);
      });
      es.addEventListener('update', (e) => {
        const data = parse(e.data);
        if (data) handlerRef.current.update?.(data);
      });
      es.addEventListener('error', (e) => {
        // Server-sendt 'error'-event har data; transportfeil har det ikke.
        const data = e.data ? parse(e.data) : null;
        if (data) handlerRef.current.error?.(data);
      });

      es.onerror = () => {
        setConnected(false);
        es?.close();
        if (!stopped) {
          clearTimeout(retryTimer);
          retryTimer = setTimeout(connect, 5000);
        }
      };
    };

    connect();

    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      es?.close();
      setConnected(false);
    };
  }, [url]);

  return connected;
}
