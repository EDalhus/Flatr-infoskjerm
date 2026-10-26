// Cloudflare Worker med statiske assets.
//
// - Alle forespørsler til /api/* rutes til modulene i src/api/ via
//   src/router.js (delt med Node-serveren i server/).
// - Alt annet serveres av ASSETS-bindingen: Vite-bygget i ./dist, med
//   SPA-fallback via assets.not_found_handling i wrangler.jsonc.

import { routeApi, jsonError, apiKey } from './router.js';
import { getUser } from './api/_access.js';

export { DeckRoom } from './collab/DeckRoom.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const key = apiKey(url.pathname);

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

      return routeApi(request, env);
    }

    // Statiske filer + SPA-fallback (/admin, /display/:id -> index.html).
    return env.ASSETS.fetch(request);
  }
};
