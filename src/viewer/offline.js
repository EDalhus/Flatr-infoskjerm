// Nettleserskjermer tåler nettbrudd (se src/sw.js): her registreres service
// workeren, siste innhold lagres i nettleseren, og filene i innholdet lastes ned
// på forhånd. Når en ny versjon av Flatr er lagt ut, sier service workeren fra, og
// skjermen laster inn på nytt (Viewer gjør det ved neste lysbildebytte).

const DATA = 'flatr-data';
const CHECK_MS = 30 * 60_000;

const MEDIA_RE = /\/m\/\d+\.[a-z0-9]+|\/api\/media\?id=\d+&raw=1/g;

let active = false;
let lastVersion = null;
let lastMedia = [];

const sendMedia = () => navigator.serviceWorker?.controller?.postMessage({ type: 'media', urls: lastMedia });

/** Starter frakoblet-støtte for en ekte skjerm. `onUpdate` kalles når en ny versjon er klar. */
export function startOffline(onUpdate) {
  if (!import.meta.env.PROD || !window.isSecureContext || !('serviceWorker' in navigator)) return () => {};
  const sw = navigator.serviceWorker;
  active = true;
  // Fila spilleren startet med; service workeren sier hvilken som er nyest.
  const entry = new URL(document.querySelector('script[type="module"][src]')?.src || '/', window.location.href).pathname;
  const onMessage = (e) => {
    if (e.data?.type === 'updated' && e.data.entry && e.data.entry !== entry) onUpdate();
  };
  sw.addEventListener('message', onMessage);
  sw.addEventListener('controllerchange', sendMedia);
  let registration = null;
  sw.register('/sw.js', { scope: '/display/' })
    .then((r) => (registration = r))
    .catch(() => {});
  // En skjerm lastes sjelden inn på nytt: se etter ny versjon og fortsett
  // nedlastinger som ble avbrutt.
  const timer = setInterval(() => {
    registration?.update().catch(() => {});
    sendMedia();
  }, CHECK_MS);
  return () => {
    active = false;
    clearInterval(timer);
    sw.removeEventListener('message', onMessage);
    sw.removeEventListener('controllerchange', sendMedia);
  };
}

/** Lagrer innholdet (fra /api/state eller strømmen) så skjermen kan starte uten nett. */
export function rememberState(url, data) {
  if (!active || !data?.screen || data.version === lastVersion) return;
  lastVersion = data.version;
  const body = JSON.stringify(data);
  caches
    .open(DATA)
    .then((cache) => cache.put(url, new Response(body, { headers: { 'Content-Type': 'application/json' } })))
    .catch(() => {});
  lastMedia = [...new Set(body.match(MEDIA_RE) || [])];
  sendMedia();
}
