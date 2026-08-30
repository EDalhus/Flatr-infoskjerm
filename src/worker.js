// Cloudflare Worker med statiske assets.
//
// - Alle forespørsler til /api/* rutes til modulene i src/api/ (samme
//   onRequestGet/Post/Put/Delete-signatur som Pages Functions brukte).
// - Alt annet serveres av ASSETS-bindingen: Vite-bygget i ./dist, med
//   SPA-fallback via assets.not_found_handling i wrangler.jsonc.

import * as screens from './api/screens.js';
import * as schedule from './api/schedule.js';
import * as sponsors from './api/sponsors.js';
import * as alerts from './api/alerts.js';
import * as categories from './api/categories.js';
import * as slides from './api/slides.js';
import * as playlists from './api/playlists.js';
import * as playlistItems from './api/playlistItems.js';
import * as media from './api/media.js';
import * as templates from './api/templates.js';
import * as trash from './api/trash.js';
import * as health from './api/health.js';
import * as heartbeat from './api/heartbeat.js';
import * as state from './api/state.js';
import * as stream from './api/stream.js';

const ROUTES = {
  '/api/screens': screens,
  '/api/schedule': schedule,
  '/api/sponsors': sponsors,
  '/api/alerts': alerts,
  '/api/categories': categories,
  '/api/slides': slides,
  '/api/playlists': playlists,
  '/api/playlist-items': playlistItems,
  '/api/media': media,
  '/api/templates': templates,
  '/api/trash': trash,
  '/api/health': health,
  '/api/heartbeat': heartbeat,
  '/api/state': state,
  '/api/stream': stream
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
