import { useEffect } from 'react';

/**
 * Holder skjermen våken via Screen Wake Lock API.
 * Ber om ny lås når fanen blir synlig igjen (låsen slippes automatisk ved bytte).
 */
export function useWakeLock(enabled = true) {
  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      return undefined;
    }

    let sentinel = null;
    let disposed = false;

    const acquire = async () => {
      try {
        sentinel = await navigator.wakeLock.request('screen');
        sentinel.addEventListener('release', () => {
          sentinel = null;
        });
      } catch {
        /* nektet (f.eks. ikke fokus) – prøver igjen ved visibilitychange */
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !sentinel && !disposed) {
        acquire();
      }
    };

    acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (sentinel) sentinel.release().catch(() => {});
    };
  }, [enabled]);
}
