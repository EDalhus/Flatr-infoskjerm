import { useEffect, useState } from 'react';
import { api } from '../../../lib/api.js';
import { useNow } from '../../../hooks/useNow.js';

let cache = null;
let promise = null;

/** Delt (mellomlagret) data til live widget-rendering i editoren + tikkende klokke. */
export function usePreviewCtx(screenId) {
  const now = useNow(1000);
  const [data, setData] = useState(cache);
  useEffect(() => {
    if (cache) return;
    promise = promise || api.getState().catch(() => ({}));
    promise.then((s) => {
      cache = {
        schedule: s?.schedule || [],
        sponsors: s?.sponsors || [],
        categories: s?.categories || []
      };
      setData(cache);
    });
  }, []);
  const d = data || { schedule: [], sponsors: [], categories: [] };
  return { ...d, screenId, now };
}

export function refreshPreviewCtx() {
  cache = null;
  promise = null;
}
