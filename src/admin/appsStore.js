// Hvilke Flatr Apps som er aktivert (kind-er), delt i admin: menyen viser
// Program og Tidsplan bare når appene er på, editoren viser widgetene deres.
// refreshApps() kalles når en app aktiveres eller deaktiveres.

import { useSyncExternalStore } from 'react';
import { api } from '../lib/api.js';

let kinds = null; // Set | null (ikke lastet)
let rows = [];
const listeners = new Set();

export async function refreshApps() {
  try {
    rows = (await api.apps.list()) || [];
    kinds = new Set(rows.map((a) => a.kind));
  } catch {
    kinds = kinds || new Set();
  }
  for (const l of listeners) l();
}

const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** De aktiverte appene (rader fra /api/apps), til sidemenyen. */
export function useInstalledApps() {
  return useSyncExternalStore(subscribe, () => rows, () => rows);
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
