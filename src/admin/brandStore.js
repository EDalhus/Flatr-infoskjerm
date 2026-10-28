// Merkevaresettet i admin: lastes én gang (AdminShell) og oppdateres når det
// lagres, så editorens fargevelgere og skriftvalg alltid har det.

import { useSyncExternalStore } from 'react';


let current = null;
const listeners = new Set();
export function setBrand(b) {
  current = b;
  for (const l of listeners) l();
}
export const getBrand = () => current;
export function useBrand() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null
  );
}
