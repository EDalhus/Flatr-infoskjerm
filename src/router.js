// Felles ruting av /api/* til modulene i src/api/. Brukes både av Worker-en
// (src/worker.js) og Node-serveren (server/index.js).

import * as screens from './api/screens.js';
import * as playlists from './api/playlists.js';
import * as deck from './api/deck.js';
import * as deckSlides from './api/deckSlides.js';
import * as deckElements from './api/deckElements.js';
import * as schedule from './api/schedule.js';
import * as sponsors from './api/sponsors.js';
import * as alerts from './api/alerts.js';
import * as categories from './api/categories.js';
import * as media from './api/media.js';
import * as templates from './api/templates.js';
import * as trash from './api/trash.js';
import * as health from './api/health.js';
import * as heartbeat from './api/heartbeat.js';
import * as state from './api/state.js';
import * as stream from './api/stream.js';
import * as pairing from './api/pairing.js';
import * as me from './api/me.js';
import * as snapshot from './api/snapshot.js';
import * as timeslots from './api/timeslots.js';
import * as settings from './api/settings.js';
import * as reports from './api/reports.js';
import * as plays from './api/plays.js';
import * as feeds from './api/feeds.js';
import * as apps from './api/apps.js';
import * as ai from './api/ai.js';
import * as activity from './api/activity.js';
import * as versions from './api/versions.js';
import * as review from './api/review.js';
import * as comments from './api/comments.js';

export { pairing };

const ROUTES = {
  '/api/screens': screens,
  '/api/playlists': playlists,
  '/api/deck': deck,
  '/api/deck-slides': deckSlides,
  '/api/deck-elements': deckElements,
  '/api/schedule': schedule,
  '/api/sponsors': sponsors,
  '/api/alerts': alerts,
  '/api/categories': categories,
  '/api/media': media,
  '/api/templates': templates,
  '/api/trash': trash,
  '/api/health': health,
  '/api/heartbeat': heartbeat,
  '/api/state': state,
  '/api/stream': stream,
  '/api/me': me,
  '/api/snapshot': snapshot,
  '/api/timeslots': timeslots,
  '/api/settings': settings,
  '/api/reports': reports,
  '/api/plays': plays,
  '/api/feeds': feeds,
  '/api/apps': apps,
  '/api/ai': ai,
  '/api/activity': activity,
  '/api/versions': versions,
  '/api/review': review,
  '/api/comments': comments
};

const METHOD_HANDLER = {
  GET: 'onRequestGet',
  POST: 'onRequestPost',
  PUT: 'onRequestPut',
  DELETE: 'onRequestDelete',
  OPTIONS: 'onRequestOptions'
};

export const jsonError = (status, message) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });

/** Normalisert API-sti uten avsluttende skråstrek. */
export const apiKey = (pathname) => pathname.replace(/\/+$/, '') || '/api';

/** Ruter en /api/*-forespørsel (unntatt /api/collab) til riktig modul. */
export function routeApi(request, env) {
  const key = apiKey(new URL(request.url).pathname);

  // Enhets-parring har dynamiske stier (/api/pairing/status/<device_id>),
  // så hele prefikset rutes til én modul som selv matcher underruten.
  if (key === '/api/pairing' || key.startsWith('/api/pairing/')) {
    const h = pairing[METHOD_HANDLER[request.method]];
    if (!h) return jsonError(405, 'Metode ikke tillatt');
    return h({ request, env });
  }

  const mod = ROUTES[key];
  if (!mod) return jsonError(404, 'Ukjent endepunkt');

  const handler = mod[METHOD_HANDLER[request.method]] || mod.onRequest;
  if (!handler) return jsonError(405, 'Metode ikke tillatt');

  return handler({ request, env });
}
