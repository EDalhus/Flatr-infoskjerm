// Cloudflare Worker med statiske assets.
//
// - Alle forespørsler til /api/* rutes til modulene i src/api/ (samme
//   onRequestGet/Post/Put/Delete-signatur som Pages Functions brukte).
// - Alt annet serveres av ASSETS-bindingen: Vite-bygget i ./dist, med
//   SPA-fallback via assets.not_found_handling i wrangler.jsonc.

import * as screens from './api/screens.js';
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
import { getUser } from './api/_access.js';

export { DeckRoom } from './collab/DeckRoom.js';

const ROUTES = {
  '/api/screens': screens,
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
  '/api/me': me
};

const METHOD_HANDLER = {
  GET: 'onRequestGet',
  POST: 'onRequestPost',
  PUT: 'onRequestPut',
  DELETE: 'onRequestDelete',
  OPTIONS: 'onRequestOptions'
};

const jsonError = (status, message) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const key = url.pathname.replace(/\/+$/, '') || '/api';

      // Samarbeids-WebSocket: /api/collab/<rom> -> Durable Object.
      //   <rom> = kanal-id (tall)  eller  "lobby" (global tilstedeværelse).
      const collab = key.match(/^\/api\/collab\/([A-Za-z0-9:._-]{1,64})$/);
      if (collab) {
        if (request.headers.get('Upgrade') !== 'websocket') {
          return jsonError(426, 'forventet websocket');
        }
        const user = await getUser(request, env);
        if (env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD && !user) {
          return jsonError(401, 'Ikke innlogget');
        }
        const u = user || { name: 'bruker', color: '#8b8d94', sub: 'anon' };
        const stub = env.DECK_ROOM.get(env.DECK_ROOM.idFromName(`deck:${collab[1]}`));
        const doUrl = new URL('https://deck-room/ws');
        doUrl.searchParams.set('name', u.name);
        doUrl.searchParams.set('color', u.color);
        doUrl.searchParams.set('sub', u.sub);
        return stub.fetch(new Request(doUrl, request));
      }

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

    // Statiske filer + SPA-fallback (/admin, /display/:id -> index.html).
    return env.ASSETS.fetch(request);
  }
};
