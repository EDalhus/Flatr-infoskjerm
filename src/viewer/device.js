// Skjermer som er koblet til med kode i nettleseren (flatr.no/tv eller Android
// TV-appen) melder seg som Apple TV: de spør Flatr jevnlig om status. Det holder
// TV-en «tilkoblet» i admin (og frakoblet-varslene riktige), henter fjernkommandoer
// (last inn på nytt, identifiser, skjermbilde) og følger med hvis TV-en flyttes
// til en annen skjerm eller kobles fra.
//
// Enhets-id-en kommer i #device=… fra flatr.no/tv og lagres her, på kundens adresse.

const KEY = 'flatr.device';

function stored() {
  try {
    return localStorage.getItem(KEY) || null;
  } catch {
    return null;
  }
}

/** Enheten denne nettleseren er koblet til som, eller null. Tar den fra adressen første gang. */
export function deviceId() {
  const m = /(?:^#|&)device=([A-Za-z0-9-]{8,})/.exec(window.location.hash);
  if (m) {
    try {
      localStorage.setItem(KEY, m[1]);
    } catch {
      /* privat modus: bruk den fra adressen */
    }
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    return m[1];
  }
  return stored();
}

const forget = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
};

// Koblingssiden på hoveddomenet («utvikler.flatr.no» -> «flatr.no/tv»). Android
// TV-appen legger på sine opplysninger (app, versjon, modell).
const pairPage = () =>
  `${window.location.protocol}//${window.location.host.split('.').slice(1).join('.')}/tv${window.FlatrAndroid?.query ? `?${window.FlatrAndroid.query()}` : ''}`;

/**
 * Starter statusmeldingene. `onIdentify({ label, seconds })` viser navnet på skjermen.
 * Android TV-appen (window.FlatrAndroid) får beskjed om enheten, så den kan ta
 * skjermbilder og huske skjermen.
 */
export function startDevice(screenId, { onIdentify }) {
  const id = deviceId();
  if (!id) return () => {};
  const bridge = window.FlatrAndroid;
  const started = Date.now();
  let stopped = false;
  let timer = null;
  let told = false;

  const poll = async () => {
    let wait = 30_000;
    try {
      const q = new URLSearchParams({ uptime_seconds: String(Math.round((Date.now() - started) / 1000)), player_version: 'web' });
      const res = await fetch(`/api/pairing/status/${encodeURIComponent(id)}?${q}`, { cache: 'no-store' });
      if (res.status === 404) {
        // Koblet fra i admin: vis en ny kode.
        forget();
        bridge?.unpaired?.();
        window.location.replace(pairPage());
        return;
      }
      const st = await res.json();
      if (st.status === 'paired') {
        if (!told && st.auth_token) {
          told = true;
          bridge?.paired?.(JSON.stringify({ device_id: id, token: st.auth_token, origin: window.location.origin }));
        }
        if (st.screen_id && String(st.screen_id) !== String(screenId)) {
          // Flyttet til en annen skjerm i admin.
          window.location.replace(`/display/${st.screen_id}`);
          return;
        }
        for (const c of st.commands || []) {
          if (c.command === 'reload' || c.command === 'reboot') return window.location.reload();
          if (c.command === 'clear_cache') {
            await Promise.all((await caches.keys().catch(() => [])).map((k) => caches.delete(k))).catch(() => {});
            return window.location.reload();
          }
          if (c.command === 'identify') onIdentify?.(c.payload || {});
          if (c.command === 'screenshot') bridge?.screenshot?.();
        }
        wait = (st.poll_interval_seconds || 30) * 1000;
      } else if (st.status === 'expired' || st.status === 'unknown') {
        forget();
        window.location.replace(pairPage());
        return;
      }
    } catch {
      /* uten nett: prøv igjen */
    }
    if (!stopped) timer = setTimeout(poll, wait);
  };

  poll();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
