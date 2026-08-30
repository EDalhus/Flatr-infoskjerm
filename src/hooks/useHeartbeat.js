import { useEffect } from 'react';
import { api } from '../lib/api.js';

/** Melder jevnlig at skjermen er i live, så admin kan vise online-status. */
export function useHeartbeat(screenId, intervalMs = 60_000) {
  useEffect(() => {
    if (!screenId) return undefined;
    let stopped = false;
    const ping = () => {
      if (!stopped) api.heartbeat(screenId).catch(() => {});
    };
    ping();
    const id = setInterval(ping, intervalMs);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [screenId, intervalMs]);
}
