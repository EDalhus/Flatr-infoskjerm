// Visningslogg fra nettleservisningen: hva som faktisk var på skjermen og hvor
// lenge (lysbilder og sponsorer). Sendes samlet hvert femte minutt til
// /api/plays. Gjør ingenting før startPlayLog er kalt (ikke i forhåndsvisning).

const FLUSH_MS = 5 * 60_000;
let screenId = null;
let queue = [];

const url = () => `/api/plays?screen=${encodeURIComponent(screenId)}`;

function flush(beacon = false) {
  if (!screenId || !queue.length) return;
  const body = JSON.stringify({ items: queue.splice(0, 2000) });
  if (beacon && navigator.sendBeacon) {
    navigator.sendBeacon(url(), new Blob([body], { type: 'application/json' }));
    return;
  }
  fetch(url(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
}

export function startPlayLog(id) {
  if (!id || screenId) return () => {};
  screenId = id;
  const timer = setInterval(flush, FLUSH_MS);
  const onHide = () => flush(true);
  window.addEventListener('pagehide', onHide);
  return () => {
    flush(true);
    clearInterval(timer);
    window.removeEventListener('pagehide', onHide);
    screenId = null;
  };
}

/** Et lysbilde eller en sponsor var på skjermen fra startedAt (ms) til nå. */
export function logPlay({ playlistId, slideId, sponsorId }, startedAt) {
  if (!screenId || !startedAt) return;
  const seconds = (Date.now() - startedAt) / 1000;
  if (seconds < 1) return;
  queue.push({ at: new Date(startedAt).toISOString(), playlist_id: playlistId || 0, slide_id: slideId || 0, sponsor_id: sponsorId || 0, seconds: Math.min(3600, Math.round(seconds * 10) / 10) });
  if (queue.length > 5000) queue = queue.slice(-5000);
}
