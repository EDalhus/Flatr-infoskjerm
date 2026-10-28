// Hvilke Flatr Apps som er aktivert (kind-er), delt i admin: menyen viser
// Program og Tidsplan bare når appene er på, editoren viser widgetene deres.
// refreshApps() kalles når en app aktiveres eller deaktiveres.

import { useSyncExternalStore } from 'react';
import { api } from '../lib/api.js';

let kinds = null; // Set | null (ikke lastet)
const listeners = new Set();

export async function refreshApps() {
  try {
    const rows = await api.apps.list();
    kinds = new Set((rows || []).map((a) => a.kind));
  } catch {
    kinds = kinds || new Set();
  }
  for (const l of listeners) l();
}

export function useAppKinds() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => kinds,
    () => null
  );
}
