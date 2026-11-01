// Service worker for skjermer som viser Flatr i en nettleser (/display/…): skjermen
// starter og viser innholdet sitt også når nettet er borte. Den registreres med
// scope /display/ (src/viewer/offline.js), så admin og resten av Flatr går aldri
// gjennom den. Bygges av vite.config.js, som setter inn VERSION, ENTRY og PRECACHE.
//
//  - Spilleren (siden og JS/CSS) lagres når service workeren installeres.
//  - Innholdet (/api/state) og data til widgeter (/api/feeds): nettet først, siste
//    svar når nettet eller serveren er borte. Spilleren lagrer selv hver nye
//    versjon av innholdet som kommer i strømmen.
//  - Mediefiler endres aldri og hentes fra lageret når de finnes. Spilleren sender
//    lista over filene i innholdet (melding «media»), så de lastes ned på forhånd.
//    Filer som ikke har vært i bruk på en uke, slettes.
//  - Skrifter fra Google Fonts lagres også.

const VERSION = '__VERSION__';
const ENTRY = '__ENTRY__';
const PRECACHE = __PRECACHE__;

const SHELL = `flatr-shell-${VERSION}`;
const DATA = 'flatr-data';
const MEDIA = 'flatr-media';
const FONTS = 'flatr-fonts';
const MEDIA_INDEX = '/__flatr/media-index'; // fil -> sist i bruk (ms), lagret i DATA
const KEEP_MS = 7 * 24 * 3600_000;
const MAX_FILE = 300 * 1024 * 1024; // større filer spilles bare fra nettet
const NET_TIMEOUT_MS = 8000;

const isMedia = (url) =>
  /^\/m\/\d+(?:v\d+)?\.[a-z0-9]+$/.test(url.pathname) || (url.pathname === '/api/media' && url.searchParams.get('raw') === '1');

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('tidsavbrudd')), ms))]);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('flatr-shell-') && name !== SHELL) await caches.delete(name);
      }
      await self.clients.claim();
      // Skjermer som kjører en eldre versjon, laster inn på nytt (ved neste lysbildebytte).
      for (const client of await self.clients.matchAll({ type: 'window' })) client.postMessage({ type: 'updated', entry: ENTRY });
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') event.respondWith(page(req));
    else if (url.pathname.startsWith('/assets/')) event.respondWith(cacheFirst(req, SHELL));
    else if (isMedia(url)) event.respondWith(media(req, event));
    else if (url.pathname === '/api/state' || url.pathname === '/api/feeds') event.respondWith(networkFirst(req));
    // Resten (strømmen, heartbeat, visningslogg) går rett til nettet.
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(req, FONTS));
  }
});

let mediaQueue = Promise.resolve();
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'media' || !Array.isArray(event.data.urls)) return;
  mediaQueue = mediaQueue.then(() => syncMedia(event.data.urls)).catch(() => {});
  event.waitUntil(mediaQueue);
});

/** Siden: nettet først, ellers den lagrede spilleren. */
async function page(req) {
  try {
    const res = await withTimeout(fetch(req), NET_TIMEOUT_MS);
    if (res.status < 500) return res;
  } catch {
    /* uten nett */
  }
  return (await caches.match('/display/', { cacheName: SHELL })) || Response.error();
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone()).catch(() => {});
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(DATA);
  try {
    const res = await withTimeout(fetch(req), NET_TIMEOUT_MS);
    if (res.ok) {
      cache.put(req, res.clone()).catch(() => {});
      return res;
    }
    if (res.status < 500) return res;
  } catch {
    /* uten nett */
  }
  return (
    (await cache.match(req)) ||
    new Response(JSON.stringify({ error: 'Ingen forbindelse' }), { status: 503, headers: { 'Content-Type': 'application/json' } })
  );
}

async function media(req, event) {
  const cache = await caches.open(MEDIA);
  const range = req.headers.get('range');
  const hit = await cache.match(req.url);
  if (hit) return range ? partial(hit, range) : hit;
  const res = await fetch(req);
  if (!range && res.status === 200 && (Number(res.headers.get('content-length')) || 0) <= MAX_FILE) {
    event.waitUntil(cache.put(req.url, res.clone()).catch(() => {}));
  }
  return res;
}

/** Video ber om biter av filen (Range); lageret har hele filen. */
async function partial(res, header) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return res;
  const blob = await res.blob();
  const size = blob.size;
  let start;
  let end;
  if (m[1] === '') {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes'
    }
  });
}

/** Laster ned filene innholdet bruker, og sletter filer som ikke er brukt på en uke. */
async function syncMedia(urls) {
  const cache = await caches.open(MEDIA);
  const data = await caches.open(DATA);
  const index = (await (await data.match(MEDIA_INDEX))?.json().catch(() => null)) || {};
  const now = Date.now();
  const wanted = urls
    .map((u) => {
      try {
        return new URL(u, self.location.origin);
      } catch {
        return null;
      }
    })
    .filter((u) => u && u.origin === self.location.origin && isMedia(u))
    .map((u) => u.href);
  for (const url of wanted) index[url] = now;

  for (const url of wanted) {
    if (await cache.match(url)) continue;
    try {
      const res = await fetch(url);
      if (res.status === 200 && (Number(res.headers.get('content-length')) || 0) <= MAX_FILE) await cache.put(url, res);
      else await res.body?.cancel();
    } catch {
      break; // uten nett eller fullt lager: prøv igjen neste gang
    }
  }

  for (const req of await cache.keys()) {
    if (now - (index[req.url] || 0) > KEEP_MS) {
      await cache.delete(req);
      delete index[req.url];
    }
  }
  await data.put(MEDIA_INDEX, new Response(JSON.stringify(index), { headers: { 'Content-Type': 'application/json' } }));
}
